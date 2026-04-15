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
  mode: 'inbox',        // 'inbox' | 'contacts' | 'kanban'
  accounts: [],
  activeAccountId: null,
  chats: [],
  activeChatId: null,
  messages: {},          // { [chatId]: Message[] }
  loginFlow: null,        // null | { step, phone?, error? }
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

    addHandler('tg:chats', ({ accountId, chats }) => {
      setState(s => {
        const others = s.chats.filter(c => c.accountId !== accountId)
        return { ...s, chats: [...others, ...chats] }
      })
    })

    addHandler('tg:messages', ({ chatId, messages }) => {
      setState(s => ({
        ...s,
        messages: { ...s.messages, [chatId]: messages }
      }))
    })

    addHandler('tg:new-message', ({ chatId, message }) => {
      setState(s => ({
        ...s,
        messages: {
          ...s.messages,
          [chatId]: [...(s.messages[chatId] || []), message]
        }
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

  const loadMessages = useCallback(async (chatId, limit = 50) => {
    return window.api?.invoke('tg:get-messages', { chatId, limit })
  }, [])

  const sendMessage = useCallback(async (chatId, text) => {
    return window.api?.invoke('tg:send-message', { chatId, text })
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
    loadChats, loadMessages, sendMessage, removeAccount,
  }
}
