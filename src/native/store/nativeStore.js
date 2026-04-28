// v0.87.0: Легковесный store для нативного режима (без Zustand — pure React hooks).
// Состояние: список аккаунтов, чаты, сообщения, выбранный чат/контакт, режим отображения.
// Синхронизация с main-процессом через IPC (tg:* channels).
// v0.87.103: IPC listeners + кэш сообщений вынесены в nativeStoreIpc.js.
import { useState, useEffect, useCallback, useRef } from 'react'
import { logNativeScroll } from '../utils/scrollDiagnostics.js'
import { attachTelegramIpcListeners, loadChatCache } from './nativeStoreIpc.js'

/**
 * @typedef {Object} NativeAccount
 * @property {string} id — внутренний ID (tg_12345, wa_+79..., vk_456)
 * @property {'telegram'|'whatsapp'|'vk'|'max'} messenger
 * @property {string} name — отображаемое имя пользователя
 * @property {string} [phone]
 * @property {string} [username]
 * @property {'connecting'|'connected'|'disconnected'|'error'} status
 * @property {string} [error]
 */

/**
 * @typedef {Object} NativeChat
 * @property {string} id — "{accountId}:{chatId}"
 * @property {string} accountId
 * @property {string} title
 * @property {string} [lastMessage]
 * @property {number} [lastMessageTs]
 * @property {number} unreadCount
 * @property {'user'|'group'|'channel'} type
 * @property {string} [avatar]
 */

const DEFAULT_STATE = {
  mode: 'inbox',
  accounts: [],
  activeAccountId: null,
  chats: [],
  activeChatId: null,
  messages: {},
  loginFlow: null,
  typing: {},             // v0.87.14: { [chatId]: { userId, at } } — таймер через 5 сек истекает
  loadingMessages: {},    // v0.87.36: { [chatId]: true } — флаг идущей загрузки (для shimmer overlay)
}

export default function useNativeStore() {
  const [state, setState] = useState(DEFAULT_STATE)
  const stateRef = useRef(state)
  stateRef.current = state

  // v0.87.103: все IPC listeners вынесены в nativeStoreIpc.js → attachTelegramIpcListeners
  useEffect(() => {
    return attachTelegramIpcListeners({ setState, stateRef })
  }, [])

  const setMode = useCallback((mode) => setState(s => ({ ...s, mode })), [])
  const setActiveAccount = useCallback((id) => setState(s => ({ ...s, activeAccountId: id })), [])
  const setActiveChat = useCallback((id) => setState(s => {
    const chat = s.chats.find(c => c.id === id)
    logNativeScroll('store-set-active-chat', { from: s.activeChatId || null, to: id, unread: chat?.unreadCount || 0, hasMessages: !!s.messages[id] })
    return { ...s, activeChatId: id }
  }), [])

  // ──  Login ──
  const startLogin = useCallback(async (phone) => {
    if (!window.api?.invoke) throw new Error('IPC недоступен')
    return window.api.invoke('tg:login-start', { phone })
  }, [])

  const submitCode = useCallback(async (code) => {
    return window.api?.invoke('tg:login-code', { code })
  }, [])

  const submitPassword = useCallback(async (password) => {
    return window.api?.invoke('tg:login-password', { password })
  }, [])

  const cancelLogin = useCallback(async () => {
    setState(s => ({ ...s, loginFlow: null }))
    return window.api?.invoke('tg:login-cancel', {})
  }, [])

  // ── Data actions ──
  const loadChats = useCallback(async (accountId) => {
    return window.api?.invoke('tg:get-chats', { accountId })
  }, [])

  // v0.87.14: мгновенная загрузка кэша
  const loadCachedChats = useCallback(async () => {
    const r = await window.api?.invoke('tg:get-cached-chats', {})
    if (r?.ok && r.chats?.length) {
      setState(s => ({ ...s, chats: [...s.chats.filter(c => !r.chats.find(nc => nc.id === c.id)), ...r.chats] }))
    }
    return r
  }, [])

  // v0.87.16: markRead принимает maxId (до какого сообщения прочитано) и localRead (сколько прочитано в UI)
  // v0.87.41: НЕ вычитаем локально (Telegram-style). Раньше: localRead вычитался
  // сразу → прыжок 36→25→35 когда сервер возвращал реальное 35. Теперь:
  // - markRead отправляет на сервер
  // - сервер возвращает точное значение через tg:chat-unread-sync
  // - локально unreadCount обновляется ТОЛЬКО из этого sync
  // Результат: плавное уменьшение 36→35→34→... как в Telegram, без прыжков.
  const markRead = useCallback(async (chatId, maxId) => {
    return window.api?.invoke('tg:mark-read', { chatId, maxId })
  }, [])

  const sendFile = useCallback(async (chatId, filePath, caption) => {
    return window.api?.invoke('tg:send-file', { chatId, filePath, caption })
  }, [])

  const forwardMessage = useCallback(async (fromChatId, toChatId, messageId) => {
    return window.api?.invoke('tg:forward', { fromChatId, toChatId, messageId })
  }, [])

  const pinMessage = useCallback(async (chatId, messageId, unpin = false) => {
    return window.api?.invoke('tg:pin', { chatId, messageId, unpin })
  }, [])

  const getPinnedMessage = useCallback(async (chatId) => {
    return window.api?.invoke('tg:get-pinned', { chatId })
  }, [])

  const refreshAvatar = useCallback(async (chatId) => {
    return window.api?.invoke('tg:refresh-avatar', { chatId })
  }, [])

  // v0.87.24: manual rescan unread (Комбо D — часть B)
  const rescanUnread = useCallback(async () => {
    return window.api?.invoke('tg:rescan-unread', {})
  }, [])

  const setTyping = useCallback(async (chatId) => {
    return window.api?.invoke('tg:set-typing', { chatId })
  }, [])

  const loadMessages = useCallback(async (chatId, limit = 50) => {
    const cachedPreview = !stateRef.current.messages[chatId] ? loadChatCache(chatId) : null
    logNativeScroll('store-load-messages', { chatId, limit, hadMessages: !!stateRef.current.messages[chatId], cached: cachedPreview?.length || 0 })
    // v0.87.36: поднимаем флаг загрузки (для shimmer overlay) + пытаемся мгновенно
    // подставить кэш из localStorage
    setState(s => {
      const cached = !s.messages[chatId] && loadChatCache(chatId)
      const nextMessages = cached ? { ...s.messages, [chatId]: cached } : s.messages
      return { ...s, messages: nextMessages, loadingMessages: { ...s.loadingMessages, [chatId]: true } }
    })
    return window.api?.invoke('tg:get-messages', { chatId, limit })
  }, [])

  const sendMessage = useCallback(async (chatId, text, replyTo) => {
    return window.api?.invoke('tg:send-message', { chatId, text, replyTo })
  }, [])

  // v0.87.15: загрузка более старых сообщений (infinite scroll вверх)
  const loadOlderMessages = useCallback(async (chatId, beforeId, limit = 50) => {
    logNativeScroll('store-load-older', { chatId, beforeId, limit })
    return window.api?.invoke('tg:get-messages', { chatId, limit, offsetId: Number(beforeId) })
  }, [])

  const deleteMessage = useCallback(async (chatId, messageId, forAll = true) => {
    const r = await window.api?.invoke('tg:delete-message', { chatId, messageId, forAll })
    if (r?.ok) {
      setState(s => ({
        ...s,
        messages: { ...s.messages, [chatId]: (s.messages[chatId] || []).filter(m => m.id !== String(messageId)) }
      }))
    }
    return r
  }, [])

  const editMessage = useCallback(async (chatId, messageId, text) => {
    const r = await window.api?.invoke('tg:edit-message', { chatId, messageId, text })
    if (r?.ok) {
      setState(s => ({
        ...s,
        messages: { ...s.messages, [chatId]: (s.messages[chatId] || []).map(m =>
          m.id === String(messageId) ? { ...m, text, isEdited: true } : m
        )}
      }))
    }
    return r
  }, [])

  // v0.87.22: thumb=true — быстрый превью ~10-50КБ, false — полный файл
  const downloadMedia = useCallback(async (chatId, messageId, thumb = true) => {
    return window.api?.invoke('tg:download-media', { chatId, messageId, thumb })
  }, [])

  const removeAccount = useCallback(async (accountId) => {
    // v0.87.95: чистка состояния делается через handler tg:account-update {removed:true}
    // (приходит из backend после успешного wipe). Тут только вызов IPC.
    return await window.api?.invoke('tg:remove-account', { accountId })
  }, [])

  // v0.87.95: предпросмотр — что будет удалено при logout. Возвращает
  // { totalFiles, totalBytes, byCategory } без реального удаления.
  const getCleanupStats = useCallback(async () => {
    return await window.api?.invoke('tg:get-cleanup-stats')
  }, [])

  return {
    ...state,
    setMode, setActiveAccount, setActiveChat,
    startLogin, submitCode, submitPassword, cancelLogin,
    loadChats, loadCachedChats, loadMessages, loadOlderMessages,
    sendMessage, sendFile, deleteMessage, editMessage, forwardMessage, pinMessage,
    getPinnedMessage, refreshAvatar, rescanUnread,
    downloadMedia, removeAccount, markRead, setTyping,
    getCleanupStats,
  }
}
