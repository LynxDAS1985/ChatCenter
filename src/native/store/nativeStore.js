// v0.87.0: Легковесный store для нативного режима (без Zustand — pure React hooks).
// Состояние: список аккаунтов, чаты, сообщения, выбранный чат/контакт, режим отображения.
// Синхронизация с main-процессом через IPC (tg:* channels).
import { useState, useEffect, useCallback, useRef } from 'react'
import { getUnreadAnchorDebug, logNativeScroll } from '../utils/scrollDiagnostics.js'

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

// v0.87.36: кэш последних N сообщений каждого чата в localStorage.
// При открытии чата показываем сразу (мгновенно), свежие догружаются поверх shimmer.
const CACHE_KEY_PREFIX = 'chat-messages:'
const CACHE_MAX_MSG = 50
function saveChatCache(chatId, messages) {
  try {
    if (!chatId || !Array.isArray(messages)) return
    const keep = messages.slice(-CACHE_MAX_MSG)
    localStorage.setItem(CACHE_KEY_PREFIX + chatId, JSON.stringify(keep))
  } catch(_) { /* quota / disabled / etc — silent */ }
}
function loadChatCache(chatId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + chatId)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : null
  } catch(_) { return null }
}

export default function useNativeStore() {
  const [state, setState] = useState(DEFAULT_STATE)
  const stateRef = useRef(state)
  stateRef.current = state

  // Слушаем IPC события от main-процесса
  useEffect(() => {
    if (!window.api?.on) return
    const unsubs = []

    // v0.87.4: window.api.on() возвращает функцию отписки — используем её
    const addHandler = (channel, handler) => {
      const unsub = window.api.on(channel, handler)
      if (typeof unsub === 'function') unsubs.push(unsub)
    }

    addHandler('tg:account-update', (acc) => {
      // v0.87.92: диагностика загрузки аватарки
      console.log('[nativeStore] tg:account-update', {
        id: acc.id, name: acc.name,
        hasAvatar: !!acc.avatar,
        avatarPreview: acc.avatar ? acc.avatar.slice(0, 100) : null,
      })
      setState(s => {
        const existing = s.accounts.find(a => a.id === acc.id)
        const accounts = existing
          ? s.accounts.map(a => a.id === acc.id ? { ...a, ...acc } : a)
          : [...s.accounts, acc]
        return { ...s, accounts, activeAccountId: s.activeAccountId || acc.id }
      })
    })

    addHandler('tg:login-step', (step) => {
      setState(s => ({ ...s, loginFlow: step }))
    })

    addHandler('tg:chats', ({ accountId, chats, append }) => {
      setState(s => {
        if (append) {
          const existing = new Set(s.chats.map(c => c.id))
          const newOnes = chats.filter(c => !existing.has(c.id))
          return { ...s, chats: [...s.chats, ...newOnes] }
        }
        // v0.87.38: MERGE вместо REPLACE — сохраняем lastMessageTs от более нового значения.
        // Без этого tg:chats перезаписывал lastMessageTs серверным (устаревшим), и чаты
        // с новыми сообщениями падали вниз списка вместо того чтобы быть наверху.
        const existingMap = new Map(s.chats.filter(c => c.accountId === accountId).map(c => [c.id, c]))
        const merged = chats.map(c => {
          const old = existingMap.get(c.id)
          if (!old) return c
          return {
            ...c,
            // Сохраняем БОЛЕЕ НОВЫЙ timestamp (max)
            lastMessageTs: Math.max(c.lastMessageTs || 0, old.lastMessageTs || 0),
            // Сохраняем lastMessage от более нового
            lastMessage: (old.lastMessageTs || 0) > (c.lastMessageTs || 0) ? old.lastMessage : c.lastMessage,
          }
        })
        const others = s.chats.filter(c => c.accountId !== accountId)
        return { ...s, chats: [...others, ...merged] }
      })
    })

    addHandler('tg:messages', ({ chatId, messages, append }) => {
      setState(s => {
        const existing = s.messages[chatId] || []
        const chat = s.chats.find(c => c.id === chatId)
        logNativeScroll('store-tg-messages', {
          chatId, append: !!append, incoming: messages?.length || 0, existing: existing.length,
          active: s.activeChatId === chatId, ...getUnreadAnchorDebug(messages || [], chat?.unreadCount || 0),
        })
        let next
        if (append) {
          // v0.87.15: дозагрузка старых — добавляем в начало, убираем дубли
          const existingIds = new Set(existing.map(m => m.id))
          const newOld = messages.filter(m => !existingIds.has(m.id))
          next = [...newOld, ...existing]
        } else {
          next = messages
        }
        // v0.87.36: сохраняем в localStorage для мгновенного показа при следующем открытии
        saveChatCache(chatId, next)
        const loadingCopy = { ...s.loadingMessages }
        delete loadingCopy[chatId]
        return { ...s, messages: { ...s.messages, [chatId]: next }, loadingMessages: loadingCopy }
      })
    })

    addHandler('tg:new-message', ({ chatId, message }) => {
      // v0.87.38: дедупликация — если msg с таким id уже есть → обновляем, не дублируем.
      // Без этого: tg:messages загрузил 50 msg → tg:new-message пришёл для уже имеющегося
      // → дубль → React warning «Encountered two children with the same key».
      // v0.87.28: превью медиа в списке чатов
      const mediaPreview = message.mediaType === 'photo' ? '🖼 Фото'
        : message.mediaType === 'video' ? '📹 Видео'
        : message.mediaType === 'audio' ? '🎵 Аудио'
        : message.mediaType === 'file' ? ('📎 ' + (message.mediaPreview || 'Файл'))
        : message.mediaType === 'link' ? '🔗 Ссылка'
        : message.mediaType === 'location' ? '📍 Геолокация'
        : message.mediaType === 'contact' ? '👤 Контакт'
        : message.mediaType === 'poll' ? '📊 Опрос'
        : message.mediaType ? '📎 вложение' : ''
      const preview = message.text || mediaPreview || ''
      setState(s => {
        const existing = s.messages[chatId] || []
        // Дедупликация: если msg с таким id уже есть — обновляем на месте
        const isDup = existing.some(m => m.id === message.id)
        const nextMsgs = isDup
          ? existing.map(m => m.id === message.id ? message : m)
          : [...existing, message]
        return {
          ...s,
          messages: { ...s.messages, [chatId]: nextMsgs },
          chats: s.chats.map(c => c.id === chatId
            ? {
                ...c,
                lastMessage: preview,
                lastMessageTs: message.timestamp,
                unreadCount: s.activeChatId === chatId ? 0 : (c.unreadCount || 0) + (message.isOutgoing ? 0 : 1),
              }
            : c)
        }
      })
      // v0.87.14: Toast через MessengerRibbon (только входящие, не для активного чата)
      if (!message.isOutgoing && stateRef.current.activeChatId !== chatId) {
        const chat = stateRef.current.chats.find(c => c.id === chatId)
        try {
          window.api?.invoke('app:custom-notify', {
            title: chat?.title || 'Telegram',
            body: preview || '[медиа]',
            fullBody: preview || '[медиа]',
            iconUrl: chat?.avatar || '',
            iconDataUrl: '',
            color: '#2AABEE',
            emoji: '✈️',
            messengerName: 'Telegram',
            messengerId: 'native_cc',
            dismissMs: 7000,
            senderName: message.senderName || chat?.title || '',
            chatTag: chatId,
          })
        } catch(_) {}
      }
    })

    // v0.87.11: аватарки приходят асинхронно — обновляем chat.avatar
    addHandler('tg:chat-avatar', ({ chatId, avatarPath }) => {
      setState(s => ({
        ...s,
        chats: s.chats.map(c => c.id === chatId ? { ...c, avatar: avatarPath } : c)
      }))
    })

    // v0.87.14: typing-индикатор
    addHandler('tg:typing', ({ chatId, userId, typing }) => {
      setState(s => ({
        ...s,
        typing: typing
          ? { ...s.typing, [chatId]: { userId, at: Date.now() } }
          : (() => { const t = { ...s.typing }; delete t[chatId]; return t })()
      }))
      // Автоматически истекает через 6 сек
      if (typing) {
        setTimeout(() => setState(s => {
          const t = { ...s.typing }
          if (t[chatId]?.userId === userId) delete t[chatId]
          return { ...s, typing: t }
        }), 6000)
      }
    })

    // v0.87.22: точная синхронизация unread с серверным значением Telegram
    // v0.87.51: удалён clamp groupedUnread — поле groupedUnread больше не используется,
    // UI показывает сырой unreadCount от Telegram API.
    addHandler('tg:chat-unread-sync', ({ chatId, unreadCount }) => {
      logNativeScroll('store-unread-sync', { chatId, unread: unreadCount, active: stateRef.current.activeChatId === chatId })
      setState(s => ({
        ...s,
        chats: s.chats.map(c => c.id === chatId ? { ...c, unreadCount } : c)
      }))
    })

    // v0.87.24: bulk sync — rescan всех активных чатов (Комбо D)
    addHandler('tg:unread-bulk-sync', ({ updates }) => {
      const map = new Map(updates.map(u => [u.id, u.unreadCount]))
      const activeId = stateRef.current.activeChatId
      if (activeId && map.has(activeId)) logNativeScroll('store-unread-bulk-active', { chatId: activeId, unread: map.get(activeId), updates: updates.length })
      setState(s => ({
        ...s,
        chats: s.chats.map(c => map.has(c.id) ? { ...c, unreadCount: map.get(c.id) } : c)
      }))
    })

    addHandler('tg:read', ({ chatId, outgoing, stillUnread, maxId }) => {
      if (outgoing) {
        // v0.87.17: собеседник прочитал наши сообщения до maxId → ставим isRead=true
        setState(s => ({
          ...s,
          messages: {
            ...s.messages,
            [chatId]: (s.messages[chatId] || []).map(m =>
              m.isOutgoing && Number(m.id) <= maxId ? { ...m, isRead: true } : m
            )
          }
        }))
        return
      }
      logNativeScroll('store-read', { chatId, stillUnread: stillUnread || 0, maxId })
      setState(s => ({
        ...s,
        chats: s.chats.map(c => c.id === chatId ? { ...c, unreadCount: stillUnread || 0 } : c)
      }))
    })

    return () => { for (const u of unsubs) try { u() } catch(_) {} }
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
    const result = await window.api?.invoke('tg:remove-account', { accountId })
    if (result?.ok) {
      setState(s => ({
        ...s,
        accounts: s.accounts.filter(a => a.id !== accountId),
        activeAccountId: s.activeAccountId === accountId ? null : s.activeAccountId
      }))
    }
    return result
  }, [])

  return {
    ...state,
    setMode, setActiveAccount, setActiveChat,
    startLogin, submitCode, submitPassword, cancelLogin,
    loadChats, loadCachedChats, loadMessages, loadOlderMessages,
    sendMessage, sendFile, deleteMessage, editMessage, forwardMessage, pinMessage,
    getPinnedMessage, refreshAvatar, rescanUnread,
    downloadMedia, removeAccount, markRead, setTyping,
  }
}
