// v0.87.103: вынесено из nativeStore.js — регистрация всех window.api.on(...) listeners.
// Подписки: tg:account-update, tg:login-step, tg:chats, tg:messages, tg:new-message,
// tg:chat-avatar, tg:typing, tg:chat-unread-sync, tg:unread-bulk-sync, tg:read.
// Возвращает функцию-отписку (для useEffect cleanup).
import { getUnreadAnchorDebug, logNativeScroll } from '../utils/scrollDiagnostics.js'

// v0.87.36: localStorage-кэш сообщений (общая утилита, экспортируется для nativeStore)
const CACHE_KEY_PREFIX = 'chat-messages:'
const CACHE_MAX_MSG = 50
export function saveChatCache(chatId, messages) {
  try {
    if (!chatId || !Array.isArray(messages)) return
    const keep = messages.slice(-CACHE_MAX_MSG)
    localStorage.setItem(CACHE_KEY_PREFIX + chatId, JSON.stringify(keep))
  } catch(_) { /* quota / disabled / etc — silent */ }
}
export function loadChatCache(chatId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + chatId)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : null
  } catch(_) { return null }
}

// Регистрация IPC слушателей. setState — обычный setter useState.
// stateRef — ref на текущий state (для чтения внутри listeners).
// Возвращает функцию отписки.
export function attachTelegramIpcListeners({ setState, stateRef }) {
  if (!window.api?.on) return () => {}
  const unsubs = []
  const addHandler = (channel, handler) => {
    const unsub = window.api.on(channel, handler)
    if (typeof unsub === 'function') unsubs.push(unsub)
  }

  addHandler('tg:account-update', (acc) => {
    // v0.87.95: removed: true → удалить аккаунт.
    // v0.87.105 (ADR-016): при logout одного из нескольких — удаляем ТОЛЬКО его чаты/сообщения,
    // остальные аккаунты остаются. wipeStats.isLast === true → последний → полная очистка.
    if (acc.removed) {
      setState(s => {
        const isLast = acc.wipeStats?.isLast || s.accounts.length <= 1
        if (isLast) {
          // Полная очистка — последний аккаунт удалили
          return {
            ...s,
            accounts: [],
            activeAccountId: null,
            chatFilter: 'all',
            activeChatId: null,
            chats: [],
            messages: {},
            loadingMessages: {},
            typing: {},
            lastWipe: acc.wipeStats || null,
          }
        }
        // Не последний — точечная очистка
        const newAccounts = s.accounts.filter(a => a.id !== acc.id)
        const newChats = s.chats.filter(c => c.accountId !== acc.id)
        const newMessages = {}
        for (const [chatId, msgs] of Object.entries(s.messages)) {
          if (chatId.split(':')[0] !== acc.id) newMessages[chatId] = msgs
        }
        const newLoading = {}
        for (const chatId of Object.keys(s.loadingMessages)) {
          if (chatId.split(':')[0] !== acc.id) newLoading[chatId] = s.loadingMessages[chatId]
        }
        // Сброс активного чата если он принадлежал удалённому аккаунту
        const activeStillValid = s.activeChatId && s.activeChatId.split(':')[0] !== acc.id
        // Сброс фильтра если фильтровали по этому аккаунту
        const newFilter = s.chatFilter === acc.id ? 'all' : s.chatFilter
        // Если активный аккаунт удалили — переключаемся на первый оставшийся
        const newActiveAccountId = s.activeAccountId === acc.id
          ? (newAccounts[0]?.id || null)
          : s.activeAccountId
        return {
          ...s,
          accounts: newAccounts,
          activeAccountId: newActiveAccountId,
          chatFilter: newFilter,
          activeChatId: activeStillValid ? s.activeChatId : null,
          chats: newChats,
          messages: newMessages,
          loadingMessages: newLoading,
          lastWipe: acc.wipeStats || null,
        }
      })
      return
    }
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
        // v0.87.105: при append дедуп по id (Map с префиксом accountId — между аккаунтами уникален)
        const existing = new Set(s.chats.map(c => c.id))
        const newOnes = chats.filter(c => !existing.has(c.id))
        return { ...s, chats: [...s.chats, ...newOnes] }
      }
      // v0.87.38: MERGE вместо REPLACE — сохраняем lastMessageTs от более нового значения.
      // v0.87.105 (ADR-016): MERGE применяется ТОЛЬКО к чатам ЭТОГО аккаунта;
      // чаты других аккаунтов остаются нетронутыми (multi-account).
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
}
