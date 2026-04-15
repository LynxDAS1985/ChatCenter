// v0.87.0: Легковесный store для нативного режима (без Zustand — pure React hooks).
// Состояние: список аккаунтов, чаты, сообщения, выбранный чат/контакт, режим отображения.
// Синхронизация с main-процессом через IPC (tg:* channels).
import { useState, useEffect, useCallback, useRef } from 'react'

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
          // v0.87.12: фоновая страница — добавляем к существующим, убираем дубли по id
          const existing = new Set(s.chats.map(c => c.id))
          const newOnes = chats.filter(c => !existing.has(c.id))
          return { ...s, chats: [...s.chats, ...newOnes] }
        }
        const others = s.chats.filter(c => c.accountId !== accountId)
        return { ...s, chats: [...others, ...chats] }
      })
    })

    addHandler('tg:messages', ({ chatId, messages, append }) => {
      setState(s => {
        const existing = s.messages[chatId] || []
        if (append) {
          // v0.87.15: дозагрузка старых — добавляем в начало, убираем дубли
          const existingIds = new Set(existing.map(m => m.id))
          const newOld = messages.filter(m => !existingIds.has(m.id))
          return { ...s, messages: { ...s.messages, [chatId]: [...newOld, ...existing] } }
        }
        return { ...s, messages: { ...s.messages, [chatId]: messages } }
      })
    })

    addHandler('tg:new-message', ({ chatId, message }) => {
      setState(s => ({
        ...s,
        messages: { ...s.messages, [chatId]: [...(s.messages[chatId] || []), message] },
        // v0.87.14: обновляем lastMessage/unread в чате
        chats: s.chats.map(c => c.id === chatId
          ? {
              ...c,
              lastMessage: message.text || '[медиа]',
              lastMessageTs: message.timestamp,
              unreadCount: s.activeChatId === chatId ? 0 : (c.unreadCount || 0) + (message.isOutgoing ? 0 : 1),
            }
          : c)
      }))
      // v0.87.14: Toast через MessengerRibbon (только входящие, не для активного чата)
      if (!message.isOutgoing && stateRef.current.activeChatId !== chatId) {
        const chat = stateRef.current.chats.find(c => c.id === chatId)
        try {
          window.api?.invoke('app:custom-notify', {
            title: chat?.title || 'Telegram',
            body: message.text || '[медиа]',
            fullBody: message.text || '[медиа]',
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
      setState(s => ({
        ...s,
        chats: s.chats.map(c => c.id === chatId ? { ...c, unreadCount: stillUnread || 0 } : c)
      }))
    })

    return () => { for (const u of unsubs) try { u() } catch(_) {} }
  }, [])

  const setMode = useCallback((mode) => setState(s => ({ ...s, mode })), [])
  const setActiveAccount = useCallback((id) => setState(s => ({ ...s, activeAccountId: id })), [])
  const setActiveChat = useCallback((id) => setState(s => ({ ...s, activeChatId: id })), [])

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
  const markRead = useCallback(async (chatId, maxId, localRead = 0) => {
    setState(s => ({
      ...s,
      chats: s.chats.map(c => {
        if (c.id !== chatId) return c
        // Если localRead передан — уменьшаем на это число, иначе — сбрасываем полностью
        const newUnread = localRead > 0
          ? Math.max(0, (c.unreadCount || 0) - localRead)
          : 0
        return { ...c, unreadCount: newUnread }
      })
    }))
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

  const setTyping = useCallback(async (chatId) => {
    return window.api?.invoke('tg:set-typing', { chatId })
  }, [])

  const loadMessages = useCallback(async (chatId, limit = 50) => {
    return window.api?.invoke('tg:get-messages', { chatId, limit })
  }, [])

  const sendMessage = useCallback(async (chatId, text, replyTo) => {
    return window.api?.invoke('tg:send-message', { chatId, text, replyTo })
  }, [])

  // v0.87.15: загрузка более старых сообщений (infinite scroll вверх)
  const loadOlderMessages = useCallback(async (chatId, beforeId, limit = 50) => {
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

  const downloadMedia = useCallback(async (chatId, messageId) => {
    return window.api?.invoke('tg:download-media', { chatId, messageId })
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
    getPinnedMessage, refreshAvatar,
    downloadMedia, removeAccount, markRead, setTyping,
  }
}
