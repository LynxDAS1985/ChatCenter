// v0.87.0: Легковесный store для нативного режима (без Zustand — pure React hooks).
// Состояние: список аккаунтов, чаты, сообщения, выбранный чат/контакт, режим отображения.
// Синхронизация с main-процессом через IPC (tg:* channels).
// v0.87.103: IPC listeners + кэш сообщений вынесены в nativeStoreIpc.js.
import { useState, useEffect, useCallback, useRef } from 'react'
import { logNativeScroll } from '../utils/scrollDiagnostics.js'
import { shouldTriggerInitialBackfill } from '../utils/initialBackfillGate.js'
import { attachTelegramIpcListeners, loadChatCache } from './nativeStoreIpc.js'
import { saveMessages as saveCacheMessages, loadMessages as loadCacheMessages, cleanupExpired as cleanupExpiredCache } from '../utils/messagesCache.js'
import { recordIdbCache } from '../utils/idbCacheMetrics.js'
import {
  markHealthByDuration,
  markHealthError,
  markHealthPending,
} from '../../utils/connectionHealth.js'

// v1.1.9: pure helpers + константы вынесены в nativeStoreHelpers.js (1326 → ~1180 строк).
import {
  NATIVE_SLOW_MS,
  TOPIC_READ_REFRESH_DELAYS_MS,
  UNREAD_WINDOW_MAX_MESSAGES,
  UNREAD_WINDOW_EXTRA_MESSAGES,
  NEWER_PAGE_SIZE,
  NEWER_PAGE_MIN_INTERVAL_MS,
  DEFAULT_STATE,
  logNativeLoad,
  topicMessageKey,
  topicIdentity,
  countIncoming,
  buildUnreadWindowMeta,
  unreadWindowRequestParams,
  nativeAccountLabel,
  nativeAccountDetails,
  updateNativeHealthForAccounts,
  accountIdsForRequest,
  healthErrorText,
  accountStatById,
} from './nativeStoreHelpers.js'
// v1.2.153: локальные цвета-метки аккаунтов (localStorage). Чистая логика — в shared/.
import { loadAccountColors, saveAccountColors, withAccountColor, assignMissingColors } from './accountColors.js'
import { loadHiddenAccounts, saveHiddenAccounts, toggleAccountHidden, sanitizeHiddenAccounts } from './accountFilter.js'

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

export default function useNativeStore() {
  // v1.2.153: цвета аккаунтов подгружаем из localStorage при первом рендере (без «мигания»).
  const [state, setState] = useState(() => ({ ...DEFAULT_STATE, accountColors: loadAccountColors(), hiddenAccountIds: loadHiddenAccounts() }))
  const stateRef = useRef(state)
  const topicReadRefreshInFlightRef = useRef(new Set())
  // v0.88.0: per-key throttle для loadNewerMessages.
  // Ключ = activeChatId или `${chatId}:topic:${topicId}` — чтобы темы и обычные чаты
  // не блокировали друг друга. Значение = timestamp последнего запроса.
  const loadingNewerRef = useRef(new Map())
  // v0.89.37: race protection для selectForumTopic. При быстром переключении
  // топиков пользователь кликает A → B → C, все три invoke в полёте. Если
  // ответ A пришёл когда юзер на C — старый ответ записывал в state messages[A]
  // (вроде безвредно), но overlay/loading state мог затереться. Храним последний
  // requestId на key — старые ответы игнорируем (Discord-style AbortController).
  const selectTopicRequestRef = useRef(new Map())
  stateRef.current = state

  // v0.87.103: все IPC listeners вынесены в nativeStoreIpc.js → attachTelegramIpcListeners
  useEffect(() => {
    const detach = attachTelegramIpcListeners({ setState, stateRef })
    // v0.89.40: TTL cleanup IDB кэша — удаляем записи старше 7 дней при старте.
    // requestIdleCallback / setTimeout — чтобы не блокировать первый рендер.
    const idleCb = () => { cleanupExpiredCache().catch(() => {}) }
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(idleCb, { timeout: 5000 })
    } else {
      setTimeout(idleCb, 3000)
    }
    let cancelled = false
    ;(async () => {
      const startedAt = Date.now()
      logNativeLoad('accounts snapshot request')
      const r = await window.api?.invoke?.('tg:get-accounts', {})
      const ms = Date.now() - startedAt
      if (cancelled || !r?.ok) {
        if (!cancelled) {
          setState(s => updateNativeHealthForAccounts(s, s.accounts.map(a => a.id), (account, prev) => markHealthError(prev, {
            id: account.id,
            type: 'native',
            label: nativeAccountLabel(account),
            lastMs: ms,
            errorText: healthErrorText(r, 'tg:get-accounts не ответил'),
            details: 'Проверка аккаунтов завершилась ошибкой',
          })))
        }
        logNativeLoad('accounts snapshot response', {
          ok: !!r?.ok,
          accounts: r?.accounts?.length || 0,
          ms,
          error: r?.error || '',
        })
        return
      }
      setState(s => {
        const incoming = Array.isArray(r.accounts) ? r.accounts : []
        if (!incoming.length) return s
        const byId = new Map(s.accounts.map(a => [a.id, a]))
        for (const acc of incoming) byId.set(acc.id, { ...(byId.get(acc.id) || {}), ...acc })
        const nextState = {
          ...s,
          accounts: Array.from(byId.values()),
          activeAccountId: s.activeAccountId || r.activeAccountId || incoming[0]?.id || null,
        }
        return updateNativeHealthForAccounts(nextState, incoming.map(a => a.id), (account, prev) => markHealthPending(prev, {
          id: account.id,
          type: 'native',
          label: nativeAccountLabel(account),
          details: nativeAccountDetails(account, nextState.chats, 'Аккаунт найден; ждём личную API-проверку'),
        }))
      })
      logNativeLoad('accounts snapshot response', {
        ok: true,
        accounts: r.accounts?.length || 0,
        active: r.activeAccountId || '',
        ms,
      })
    })()
    return () => {
      cancelled = true
      detach()
    }
  }, [])

  const setMode = useCallback((mode) => setState(s => ({ ...s, mode })), [])
  const setActiveAccount = useCallback((id) => setState(s => ({ ...s, activeAccountId: id })), [])
  // v1.2.163 (ADR-026): фильтр аккаунтов в списке — множественный выбор + «соло».
  // Одиночный клик по аватарке: показать/скрыть аккаунт (защита — нельзя скрыть последний).
  const toggleAccountVisible = useCallback((id) => setState(s => {
    const next = toggleAccountHidden(s.hiddenAccountIds, id, (s.accounts || []).map(a => a.id))
    if (next === s.hiddenAccountIds) return s
    saveHiddenAccounts(next)
    // одиночный клик выходит из «соло» (возвращаемся к режиму галочек)
    return { ...s, hiddenAccountIds: next, soloAccountId: null }
  }), [])
  // Двойной клик: «только этот» (соло). Повторный по тому же — выход из соло.
  const soloAccount = useCallback((id) => setState(s => ({ ...s, soloAccountId: s.soloAccountId === id ? null : id })), [])
  // Кнопка «Все»: показать все (снять все скрытия и соло).
  const showAllAccounts = useCallback(() => setState(s => {
    if ((!s.hiddenAccountIds || s.hiddenAccountIds.length === 0) && !s.soloAccountId) return s
    saveHiddenAccounts([])
    return { ...s, hiddenAccountIds: [], soloAccountId: null }
  }), [])
  const setActiveChat = useCallback((id) => setState(s => {
    const chat = s.chats.find(c => c.id === id)
    logNativeScroll('store-set-active-chat', { from: s.activeChatId || null, to: id, unread: chat?.unreadCount || 0, hasMessages: !!s.messages[id] })
    const isKnownForum = chat?.isForum === true || !!s.forumTopics?.[id]?.length
    const reopenForumPanel = s.activeChatId === id && isKnownForum && s.forumTopicPanelChatId !== id
    return {
      ...s,
      activeChatId: id,
      forumTopicPanelChatId: reopenForumPanel ? id : s.forumTopicPanelChatId,
      activeForumTopic: { ...s.activeForumTopic, [id]: null },
    }
  }), [])

  const closeForumTopics = useCallback(() => setState(s => {
    const activeTopic = s.forumTopicPanelChatId ? s.activeForumTopic?.[s.forumTopicPanelChatId] : null
    const nextActiveForumTopic = { ...(s.activeForumTopic || {}) }
    if (s.forumTopicPanelChatId) delete nextActiveForumTopic[s.forumTopicPanelChatId]
    return {
      ...s,
      forumTopicPanelChatId: null,
      activeForumTopic: nextActiveForumTopic,
      activeChatId: activeTopic ? null : s.activeChatId,
    }
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

  // v1.2.147: сброс «признака входа» БЕЗ отмены на сервере (в отличие от cancelLogin).
  // Нужен при закрытии окна входа, чтобы «залипший» success не закрывал сам следующее
  // открытие модалки и не держал экран входа поверх чатов.
  const resetLoginFlow = useCallback(() => {
    setState(s => (s.loginFlow ? { ...s, loginFlow: null } : s))
  }, [])

  // v1.2.153: задать/снять локальный цвет-метку аккаунта (color пустой → вернётся дефолт).
  const setAccountColor = useCallback((accountId, color) => {
    setState(s => {
      const next = withAccountColor(s.accountColors, accountId, color)
      saveAccountColors(next)
      return { ...s, accountColors: next }
    })
  }, [])

  // v1.2.154 (по ревью): при появлении аккаунтов назначаем недостающие цвета — первый
  // СВОБОДНЫЙ цвет палитры (различимо, без коллизий) и сохраняем (стабильно, не «прыгает»).
  // guard: assignMissingColors вернёт ТОТ ЖЕ объект, если назначать нечего → без ре-рендера,
  // эффект не зацикливается (не меняет state.accounts, от которого зависит).
  useEffect(() => {
    setState(s => {
      const next = assignMissingColors(s.accountColors, (s.accounts || []).map(a => a.id))
      if (next === s.accountColors) return s
      saveAccountColors(next)
      return { ...s, accountColors: next }
    })
  }, [state.accounts])

  // v1.2.169: самопроверка фильтра при загрузке/смене аккаунтов. Если из localStorage или
  // после удаления скрыты ВСЕ имеющиеся аккаунты (список чатов был бы пуст, а снять галочку
  // нельзя при 1 аккаунте) — сбрасываем скрытие; убираем «призраки» (id несуществующих);
  // снимаем «соло», если тот аккаунт исчез. Guard (тот же объект) → без ре-рендера/цикла;
  // при незагруженных аккаунтах sanitizeHiddenAccounts не трогает (не сотрёт валидное скрытие).
  useEffect(() => {
    setState(s => {
      const ids = (s.accounts || []).map(a => a.id)
      const nextHidden = sanitizeHiddenAccounts(s.hiddenAccountIds, ids)
      const nextSolo = (s.soloAccountId && ids.includes(s.soloAccountId)) ? s.soloAccountId : null
      if (nextHidden === s.hiddenAccountIds && nextSolo === s.soloAccountId) return s
      if (nextHidden !== s.hiddenAccountIds) {
        saveHiddenAccounts(nextHidden)
        // v1.2.170: не «немой» автосброс — фиксируем в журнале (если сработает не там, где ждём,
        // будет видно). id аккаунтов не секретны (внутренние tg_<userId>). Только при реальном изменении.
        try {
          window.api?.send?.('app:log', { level: 'INFO',
            message: `[acct-filter] самопроверка сбросила залипшее скрытие: ${JSON.stringify(s.hiddenAccountIds || [])} → ${JSON.stringify(nextHidden)} (аккаунтов=${ids.length})` })
        } catch (_) {}
      }
      return { ...s, hiddenAccountIds: nextHidden, soloAccountId: nextSolo }
    })
  }, [state.accounts])

  // ── Data actions ──
  const loadChats = useCallback(async (accountId) => {
    const startedAt = Date.now()
    logNativeLoad('loadChats request', { accountId: accountId || 'all' })
    const result = await window.api?.invoke('tg:get-chats', { accountId })
    const ms = Date.now() - startedAt
    logNativeLoad('loadChats response', {
      accountId: accountId || 'all',
      ok: !!result?.ok,
      chats: result?.chats?.length || 0,
      ms,
      error: result?.error || '',
    })
    return result
  }, [])

  // v0.87.14: мгновенная загрузка кэша
  const loadCachedChats = useCallback(async () => {
    const startedAt = Date.now()
    logNativeLoad('loadCachedChats request')
    const r = await window.api?.invoke('tg:get-cached-chats', {})
    const ms = Date.now() - startedAt
    if (r?.ok && r.chats?.length) {
      setState(s => ({ ...s, chats: [...s.chats.filter(c => !r.chats.find(nc => nc.id === c.id)), ...r.chats] }))
    }
    logNativeLoad('loadCachedChats response', {
      ok: !!r?.ok,
      chats: r?.chats?.length || 0,
      ms,
      error: r?.error || '',
    })
    return r
  }, [])

  const checkConnection = useCallback(async (accountId) => {
    const startedAt = Date.now()
    setState(s => updateNativeHealthForAccounts(s, accountIdsForRequest(s, accountId), (account, prev) => markHealthPending(prev, {
      id: account.id,
      type: 'native',
      label: nativeAccountLabel(account),
      details: 'Проверяем соединение Telegram API',
    })))
    logNativeLoad('healthCheck request', { accountId: accountId || 'all' })
    const result = await window.api?.invoke('tg:health-check', { accountId })
    const ms = Date.now() - startedAt
    setState(s => {
      const targetIds = accountIdsForRequest(s, accountId)
      return updateNativeHealthForAccounts(s, targetIds, (account, prev) => {
        const accountStat = accountStatById(result, account.id)
        const accountMs = typeof accountStat?.ms === 'number' ? accountStat.ms : ms
        if (!result?.ok && !accountStat) {
          return markHealthError(prev, {
            id: account.id,
            type: 'native',
            label: nativeAccountLabel(account),
            startedAt,
            lastMs: accountMs,
            errorText: healthErrorText(result, 'tg:health-check не ответил'),
            details: 'Проверка соединения завершилась ошибкой',
          })
        }
        if (!accountStat || accountStat.ok === false) {
          return markHealthError(prev, {
            id: account.id,
            type: 'native',
            label: nativeAccountLabel(account),
            startedAt,
            lastMs: accountMs,
            errorText: accountStat?.error || 'tg:health-check не ответил для аккаунта',
            details: 'Проверка соединения аккаунта завершилась ошибкой',
          })
        }
        return markHealthByDuration(prev, {
          id: account.id,
          type: 'native',
          label: nativeAccountLabel(account),
          startedAt,
          lastMs: accountMs,
          slowMs: NATIVE_SLOW_MS,
          details: 'tg:health-check ответил',
        })
      })
    })
    logNativeLoad('healthCheck response', {
      accountId: accountId || 'all',
      ok: !!result?.ok,
      ms,
      error: result?.error || '',
    })
    return result
  }, [])

  // v0.87.16: markRead принимает maxId (до какого сообщения прочитано) и localRead (сколько прочитано в UI)
  // v0.87.41: НЕ вычитаем локально (Telegram-style). Раньше: localRead вычитался
  // сразу → прыжок 36→25→35 когда сервер возвращал реальное 35. Теперь:
  // - markRead отправляет на сервер
  // - сервер возвращает точное значение через tg:chat-unread-sync
  // - локально unreadCount обновляется ТОЛЬКО из этого sync
  // Результат: плавное уменьшение 36→35→34→... как в Telegram, без прыжков.
  const markRead = useCallback(async (chatId, maxId, options = {}) => {
    return window.api?.invoke('tg:mark-read', {
      chatId,
      maxId,
      readInboxMaxId: options?.readInboxMaxId,
    })
  }, [])

  const markTopicRead = useCallback(async (chatId, topic, maxId) => {
    if (!chatId || !topic) return { ok: false, error: 'Не выбрана тема' }
    const topicId = topic.topicId || topic.id || topic.topMessageId
    // v0.89.32: diagnostic — UI side markTopicRead invocation
    try {
      window.api?.send?.('app:log', { level: 'INFO',
        message: '[topic-mark-ui] SEND chatId=' + chatId + ' topicId=' + topicId +
          ' maxId=' + maxId + ' baselineUnread=' + (topic.unreadCount || 0) })
    } catch (_) {}
    const r = await window.api?.invoke('tg:mark-topic-read', {
      chatId,
      topicId,
      topMessageId: topic.topMessageId,
      maxId,
    })
    if (r?.ok) {
      const refreshKey = `${chatId}:topic:${topicIdentity(topic)}`
      if (topicReadRefreshInFlightRef.current.has(refreshKey)) {
        return { ...r, refreshed: false, refreshSkipped: 'already-running' }
      }
      topicReadRefreshInFlightRef.current.add(refreshKey)
      const baselineTopic = stateRef.current.activeForumTopic?.[chatId] || topic
      const baselineUnread = Number(baselineTopic?.unreadCount || 0)

      const refreshTopicCounters = async (attempt = 0) => {
        const currentTopicCount = stateRef.current.forumTopics?.[chatId]?.length || 50
        const refresh = await window.api?.invoke('tg:get-forum-topics', {
          chatId,
          limit: Math.max(currentTopicCount, 50),
        })
        if (!refresh?.ok || !refresh.isForum) {
          topicReadRefreshInFlightRef.current.delete(refreshKey)
          return { refreshed: false, refreshError: refresh?.error, attempt }
        }
        const refreshedTopics = Array.isArray(refresh.topics) ? refresh.topics : []
        const readTopicId = topicIdentity(topic)
        const refreshedTopic = refreshedTopics.find(t => topicIdentity(t) === readTopicId)
        const refreshedUnread = Number(refreshedTopic?.unreadCount || 0)
        // v0.89.32: diagnostic — refreshTopicCounters результат для отслеживания
        // действительно ли getForumTopics возвращает обновлённый unread_count
        // после markTopicRead. Если baseline == refreshed → TDLib не обновил.
        try {
          window.api?.send?.('app:log', { level: 'INFO',
            message: '[topic-mark-refresh] chatId=' + chatId + ' attempt=' + attempt +
              ' baseline=' + baselineUnread + ' refreshed=' + refreshedUnread +
              ' delta=' + (baselineUnread - refreshedUnread) })
        } catch (_) {}
        setState(s => {
          const activeTopic = s.activeForumTopic?.[chatId]
          const activeTopicId = topicIdentity(activeTopic || topic)
          const refreshedActiveTopic = activeTopicId
            ? refreshedTopics.find(t => topicIdentity(t) === activeTopicId)
            : null
          const nextActiveForumTopic = { ...(s.activeForumTopic || {}) }
          if (refreshedActiveTopic) nextActiveForumTopic[chatId] = refreshedActiveTopic
          const nextMessageWindows = { ...(s.messageWindows || {}) }
          if (refreshedActiveTopic) {
            const windowKey = topicMessageKey(chatId, refreshedActiveTopic)
            const currentWindow = nextMessageWindows[windowKey]
            if (currentWindow) {
              const unreadCount = Number(refreshedActiveTopic.unreadCount || 0)
              nextMessageWindows[windowKey] = {
                ...currentWindow,
                unreadCount,
                unreadWindowComplete: !currentWindow.unreadWindowRequested
                  || Number(currentWindow.loadedIncoming || 0) >= unreadCount,
                updatedAt: Date.now(),
              }
            }
          }
          return {
            ...s,
            chats: s.chats.map(c => c.id === chatId ? { ...c, isForum: true } : c),
            forumTopics: { ...s.forumTopics, [chatId]: refreshedTopics },
            activeForumTopic: nextActiveForumTopic,
            messageWindows: nextMessageWindows,
          }
        })
        const sameUnread = baselineUnread > 0 && refreshedTopic && refreshedUnread === baselineUnread
        const hasRetry = attempt < TOPIC_READ_REFRESH_DELAYS_MS.length - 1
        if (sameUnread && hasRetry) {
          setTimeout(() => {
            refreshTopicCounters(attempt + 1).catch(() => {
              topicReadRefreshInFlightRef.current.delete(refreshKey)
            })
          }, TOPIC_READ_REFRESH_DELAYS_MS[attempt + 1])
          return { refreshed: true, retryScheduled: true, attempt, unreadCount: refreshedUnread }
        }
        topicReadRefreshInFlightRef.current.delete(refreshKey)
        return { refreshed: true, retryScheduled: false, attempt, unreadCount: refreshedUnread }
      }

      const refreshResult = await refreshTopicCounters(0)
      return { ...r, ...refreshResult }
    }
    return r
  }, [])

  // v1.2.207 (#1): asDocument=true — «без сжатия» (backend шлёт inputMessageDocument).
  const sendFile = useCallback(async (chatId, filePath, caption, asDocument = false) => {
    return window.api?.invoke('tg:send-file', { chatId, filePath, caption, asDocument })
  }, [])

  // v0.95.43: отправка нескольких файлов одним альбомом (TDLib sendMessageAlbum).
  // files: [{path, caption?}], albumCaption — общий caption на первом элементе.
  // > 10 файлов → backend split на батчи по 10 (TDLib limit).
  // v1.2.207 (#1): asDocument=true — весь альбом документами (без сжатия).
  const sendAlbum = useCallback(async (chatId, files, albumCaption, replyTo, asDocument = false) => {
    return window.api?.invoke('tg:send-album', { chatId, files, albumCaption, replyTo, asDocument })
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
  const rescanUnread = useCallback(async (options = {}) => {
    const updateHealth = options?.updateHealth === true
    const startedAt = Date.now()
    const r = await window.api?.invoke('tg:rescan-unread', {})
    const ms = Date.now() - startedAt
    if (!updateHealth) return r
    setState(s => updateNativeHealthForAccounts(s, s.accounts.map(a => a.id), (account, prev) => {
      const accountStat = accountStatById(r, account.id)
      const hasPersonalStat = !!accountStat
      const accountMs = typeof accountStat?.ms === 'number' ? accountStat.ms : null
      if (!r?.ok) {
        return markHealthError(prev, {
          id: account.id,
          type: 'native',
          label: nativeAccountLabel(account),
          startedAt,
          lastMs: ms,
          errorText: healthErrorText(r, 'tg:rescan-unread не ответил'),
          details: 'Проверка непрочитанных завершилась ошибкой',
        })
      }
      if (!hasPersonalStat) return prev
      if (accountStat.ok === false) {
        return markHealthError(prev, {
          id: account.id,
          type: 'native',
          label: nativeAccountLabel(account),
          startedAt,
          lastMs: accountMs,
          errorText: accountStat.error || 'tg:rescan-unread не ответил для аккаунта',
          details: 'Проверка непрочитанных аккаунта завершилась ошибкой',
        })
      }
      return markHealthByDuration(prev, {
        id: account.id,
        type: 'native',
        label: nativeAccountLabel(account),
        startedAt,
        lastMs: accountMs,
        slowMs: NATIVE_SLOW_MS,
        details: nativeAccountDetails(account, s.chats, `tg:rescan-unread ответил; проверено чатов: ${accountStat.chats ?? '-'}`),
      })
    }))
    return r
  }, [])

  const setTyping = useCallback(async (chatId) => {
    return window.api?.invoke('tg:set-typing', { chatId })
  }, [])

  const loadMessages = useCallback(async (chatId, limit = 50, options = {}) => {
    const chat = stateRef.current.chats.find(c => c.id === chatId)
    // v0.95.12-v0.95.14: jump-to-end-of-chat. См. .memory-bank/jump-to-end-saga.md
    // v0.95.12: aroundId=lastMessageId — TDLib грузил СТРОГО СТАРШЕ X, пропуская X.
    // v0.95.13: aroundId=0 (TDLib spec: from=0 → last_message) — НЕ сработало!
    //   TDLib issue #740: from=0 подменяется на last_read_inbox_message_id когда есть
    //   непрочитанные. Возвращалось окно вокруг старого read cursor, не lastMessageId.
    // v0.95.14: aroundId=lastMessageId + addOffset=-Math.floor(limit/2) — context-window.
    //   По TDLib spec: «negative offset up to -99 → additionally newer messages».
    //   from=lastMessageId, offset=-50, limit=100 → 50 newer (нет, X последний) + X + 49 older
    //   = X включён в результат. Эталон: Telegram Desktop getHistory(peer.last_message.id, -N).
    const hasOverride = options?.aroundId != null
    const overrideAroundId = hasOverride ? Number(options.aroundId) : null
    const overrideAddOffset = options?.addOffset != null ? Number(options.addOffset) : null
    const force = !!options?.force
    const baseParams = unreadWindowRequestParams(chat?.unreadCount, chat?.readInboxMaxId, limit)
    const unreadParams = (hasOverride && force)
      ? {
          limit,
          aroundId: overrideAroundId,
          addOffset: overrideAddOffset != null ? overrideAddOffset : 0,
          requested: false,
        }
      : baseParams
    const cachedPreview = (!stateRef.current.messages[chatId] && !force) ? loadChatCache(chatId) : null
    logNativeScroll('store-load-messages', {
      chatId,
      limit: unreadParams.limit,
      hadMessages: !!stateRef.current.messages[chatId],
      cached: cachedPreview?.length || 0,
      unread: chat?.unreadCount || 0,
      aroundId: unreadParams.aroundId,
      addOffset: unreadParams.addOffset,
      // v0.95.14: hasOverride (true для aroundId=0 — `!! 0 = false` это баг v0.95.13 лога).
      override: hasOverride,
      force,
    })
    // v0.89.40: IndexedDB optimistic render для обычных чатов — параллельно
    // с invoke загружаем последние сообщения из IDB. Если localStorage cache
    // (loadChatCache) пуст или мал, IDB может дать больше истории (~50 vs ~10
    // для localStorage). Не перезаписываем если в state уже есть свежие данные.
    // v0.89.44 (Совет 4): метрика hit/miss — позволяет в логе видеть эффективность
    // кэша при будущей оптимизации (расширение TTL, лимита и т.д.).
    // v0.89.45: агрегатор — одна строка `idb-cache-window` каждые 30 секунд
    // вместо сотен индивидуальных. См. idbCacheMetrics.js.
    // v0.95.12: при force=true (jump-to-end) НЕ применяем IDB-кеш — иначе юзер
    // на 200-500мс увидит старый stale-window (вокруг unread cursor) вместо
    // ожидаемого «прыжка к концу». Дождёмся свежих сообщений от backend.
    if (!force) {
      loadCacheMessages(chatId, null).then(cached => {
        recordIdbCache('loadMessages', !!cached?.messages?.length)
        if (!cached) return
        setState(s => {
          if ((s.messages[chatId] || []).length > 0) return s
          return { ...s, messages: { ...s.messages, [chatId]: cached.messages } }
        })
      }).catch(() => {})
    }
    // v0.87.36: поднимаем флаг загрузки (для shimmer overlay) + пытаемся мгновенно
    // подставить кэш из localStorage
    setState(s => {
      const cached = !s.messages[chatId] && loadChatCache(chatId)
      const nextMessages = cached ? { ...s.messages, [chatId]: cached } : s.messages
      return {
        ...s,
        messages: nextMessages,
        messageWindows: {
          ...(s.messageWindows || {}),
          [chatId]: buildUnreadWindowMeta({
            messages: cached || s.messages[chatId] || [],
            unreadCount: chat?.unreadCount || 0,
            readInboxMaxId: chat?.readInboxMaxId || 0,
            requested: unreadParams.requested,
            aroundId: unreadParams.aroundId,
            loading: unreadParams.requested,
          }),
        },
        loadingMessages: { ...s.loadingMessages, [chatId]: true },
      }
    })
    const result = await window.api?.invoke('tg:get-messages', {
      chatId,
      limit: unreadParams.limit,
      aroundId: unreadParams.aroundId,
      addOffset: unreadParams.addOffset,
    })
    // v0.87.118: авторетрай через 3с — вероятно FLOOD_WAIT от загрузки аватарок.
    // При успешном retry tg:messages придёт автоматически и обновит стор.
    // При повторной ошибке — снимаем флаг loadingMessages чтобы не висел shimmer вечно.
    if (!result?.ok) {
      setTimeout(async () => {
        const retry = await window.api?.invoke('tg:get-messages', {
          chatId,
          limit: unreadParams.limit,
          aroundId: unreadParams.aroundId,
          addOffset: unreadParams.addOffset,
        })
        if (!retry?.ok) setState(s => { const lm = {...s.loadingMessages}; delete lm[chatId]; return {...s, loadingMessages: lm} })
      }, 3000)
    } else {
      setState(s => ({
        ...s,
        messageWindows: {
          ...(s.messageWindows || {}),
          [chatId]: buildUnreadWindowMeta({
            messages: result.messages || [],
            unreadCount: chat?.unreadCount || 0,
            readInboxMaxId: chat?.readInboxMaxId || 0,
            requested: unreadParams.requested,
            aroundId: unreadParams.aroundId,
            loading: false,
          }),
        },
      }))
      // v0.89.40: сохраняем свежие данные в IndexedDB кэш (fire-and-forget).
      // Следующее открытие чата — мгновенно из кэша.
      if (Array.isArray(result.messages)) {
        saveCacheMessages(chatId, null, result.messages, {
          unreadCount: chat?.unreadCount || 0,
          readInboxMaxId: chat?.readInboxMaxId || 0,
        }).catch(() => {})
      }
      // v0.95.24: INITIAL BACKFILL — догрузка истории при первом открытии чата.
      // Корень (лог чата tg_611696632:5006720692, 17:58:10):
      //   [get-msgs] from=0 offset=0 count=3 hasMore=false
      // TDLib local cache содержит всего 1-3 cached. История на сервере есть, но
      // TDLib НЕ догружает automatically (issue #740 — «number of returned messages
      // is chosen by the library»). Когда юзер прокручивает вверх — load-older
      // успешно тянет 50 older. Делаем это ЗА юзера: при got < 30 → автоматически
      // итеративный backfill через offsetId=oldest_received → tg:messages event
      // придёт с append:true → prepend (как load-older через scroll).
      const got = Array.isArray(result.messages) ? result.messages.length : 0
      if (shouldTriggerInitialBackfill({ got, force, hasOverride })) {
        const oldestId = result.messages[0]?.id
        if (oldestId) {
          logNativeScroll('initial-backfill-trigger', {
            chatId, got, threshold: 30, oldestId: String(oldestId),
          })
          // Fire-and-forget итерация по offsetId (load-older паттерн)
          ;(async () => {
            let cursor = String(oldestId)
            for (let i = 0; i < 3; i++) {
              const r = await window.api?.invoke('tg:get-messages', {
                chatId, offsetId: cursor, limit: 50,
              })
              if (!r?.ok || !Array.isArray(r.messages) || r.messages.length === 0) break
              const totalNow = stateRef.current.messages[chatId]?.length || 0
              logNativeScroll('initial-backfill-iter', {
                chatId, iter: i + 1, got: r.messages.length, totalNow,
              })
              if (totalNow >= 30) break
              const nextOldest = r.messages[0]?.id
              if (!nextOldest || String(nextOldest) === cursor) break  // защита от цикла
              cursor = String(nextOldest)
            }
          })().catch(() => {})
        }
      }
    }
    return result
  }, [])

  // v0.95.15: ИТЕРАТИВНЫЙ fetch до untilMessageId (для jump-to-end-of-chat).
  // Использует backend handler `tg:get-messages-iterate` (itetative fetch с maxIter=5).
  // tg:messages event придёт автоматически и обновит state.messages[chatId].
  // См. .memory-bank/jump-to-end-saga.md — почему НЕ работают одиночные invokes.
  const loadMessagesUntil = useCallback(async (chatId, untilMessageId, targetCount = 100) => {
    const chat = stateRef.current.chats.find(c => c.id === chatId)
    logNativeScroll('store-load-messages-iterate', {
      chatId,
      untilMessageId: untilMessageId ? String(untilMessageId) : null,
      targetCount,
      hadMessages: !!stateRef.current.messages[chatId],
      unread: chat?.unreadCount || 0,
    })
    setState(s => ({ ...s, loadingMessages: { ...s.loadingMessages, [chatId]: true } }))
    const result = await window.api?.invoke('tg:get-messages-iterate', {
      chatId,
      untilMessageId: untilMessageId ? String(untilMessageId) : null,
      targetCount,
      maxIterations: 5,
    })
    if (!result?.ok) {
      setState(s => { const lm = { ...s.loadingMessages }; delete lm[chatId]; return { ...s, loadingMessages: lm } })
    } else {
      setState(s => ({
        ...s,
        messageWindows: {
          ...(s.messageWindows || {}),
          [chatId]: buildUnreadWindowMeta({
            messages: result.messages || [],
            unreadCount: chat?.unreadCount || 0,
            readInboxMaxId: chat?.readInboxMaxId || 0,
            requested: false,
            aroundId: 0,
            loading: false,
          }),
        },
      }))
      if (Array.isArray(result.messages)) {
        saveCacheMessages(chatId, null, result.messages, {
          unreadCount: chat?.unreadCount || 0,
          readInboxMaxId: chat?.readInboxMaxId || 0,
        }).catch(() => {})
      }
    }
    return result
  }, [])

  const loadForumTopics = useCallback(async (chatId, limit = 50) => {
    if (!chatId) return { ok: false, isForum: false, topics: [] }
    setState(s => ({ ...s, forumTopicsLoading: { ...(s.forumTopicsLoading || {}), [chatId]: true } }))
    const result = await window.api?.invoke('tg:get-forum-topics', { chatId, limit })
    setState(s => {
      const loading = { ...(s.forumTopicsLoading || {}) }
      delete loading[chatId]
      if (!result?.ok) return { ...s, forumTopicsLoading: loading }
      // v0.91.8: client-side fallback бейджа форум-чатов (TDLib обнуляет unread_count после открытия).
      const topics = result.isForum ? (result.topics || []) : []
      const sumUnread = topics.reduce((acc, t) => acc + (t.unreadCount || 0), 0)
      const nextChats = s.chats.map(c => c.id !== chatId ? c : ({
        ...c, isForum: !!result.isForum,
        unreadCount: result.isForum ? Math.max(c.unreadCount || 0, sumUnread) : (c.unreadCount || 0),
      }))
      if (!result.isForum) return { ...s, chats: nextChats, forumTopicsLoading: loading }
      return {
        ...s, chats: nextChats, forumTopicPanelChatId: chatId,
        forumTopics: { ...s.forumTopics, [chatId]: topics }, forumTopicsLoading: loading,
      }
    })
    return result
  }, [])

  const selectForumTopic = useCallback(async (chatId, topic, limit = 50) => {
    if (!chatId || !topic) return { ok: false, error: 'Не выбрана тема', messages: [] }
    const key = topicMessageKey(chatId, topic)
    const topicIdForCache = topic.topicId || topic.id
    const unreadParams = unreadWindowRequestParams(topic.unreadCount, topic.readInboxMaxId, limit)
    // v0.89.37: race protection — каждому invoke выдаём requestId. Если за
    // время ожидания ответа юзер кликнул другой топик (selectTopicRequestRef
    // обновится новым id для chatId), старый ответ будет игнорирован.
    // Так делает Discord (AbortController) и Telegram Desktop (requestId).
    const requestId = Date.now() + ':' + Math.random().toString(36).slice(2, 7)
    selectTopicRequestRef.current.set(chatId, requestId)
    // v0.89.39: IndexedDB cache — optimistic render. Загружаем последние сообщения
    // из локального кэша мгновенно, пока сервер отвечает. Так делает Telegram
    // Desktop через TDLib local cache. Юзер видит сообщения сразу, не 188-500мс
    // чёрного экрана. Когда сервер ответит — state обновится свежими данными.
    loadCacheMessages(chatId, topicIdForCache).then(cached => {
      // v0.89.44 (Совет 4): метрика hit/miss для топиков. Особенно важна
      // для топиков — главный сценарий optimistic render (см. v0.89.39).
      // v0.89.45: агрегатор. Одна строка `idb-cache-window` каждые 30с.
      recordIdbCache('selectForumTopic', !!cached?.messages?.length)
      // Если за время загрузки кэша юзер кликнул другой топик — игнорируем.
      if (!cached || selectTopicRequestRef.current.get(chatId) !== requestId) return
      setState(s => {
        // Если в state уже есть свежие сообщения от сервера — кэш НЕ перезаписывает.
        if ((s.messages[key] || []).length > 0) return s
        return { ...s, messages: { ...s.messages, [key]: cached.messages } }
      })
    }).catch(() => {})
    // v0.89.28: diagnostic — selectForumTopic был «черным ящиком», сообщения
    // не приходили без следов в логах. См. ловушка #27.
    try {
      window.api?.send?.('app:log', { level: 'INFO',
        message: '[topic-ui] selectForumTopic chatId=' + chatId +
          ' topicId=' + (topic.topicId || topic.id) +
          ' topMessageId=' + topic.topMessageId +
          ' unreadCount=' + topic.unreadCount +
          ' readInboxMaxId=' + topic.readInboxMaxId +
          ' requestId=' + requestId +
          ' params=' + JSON.stringify(unreadParams) })
    } catch (_) {}
    setState(s => ({
      ...s,
      activeChatId: chatId,
      activeForumTopic: { ...s.activeForumTopic, [chatId]: topic },
      messageWindows: {
        ...(s.messageWindows || {}),
        [key]: buildUnreadWindowMeta({
          messages: s.messages[key] || [],
          unreadCount: topic.unreadCount || 0,
          readInboxMaxId: topic.readInboxMaxId || 0,
          requested: unreadParams.requested,
          aroundId: unreadParams.aroundId,
          loading: unreadParams.requested,
        }),
      },
      loadingMessages: { ...s.loadingMessages, [key]: true },
    }))
    // v0.89.30 (ловушка #29): threadMessageId — РЕАЛЬНЫЙ message_thread_id (int53)
    // для TDLib getMessageThreadHistory. isGeneral — флаг для general topic
    // (использует getChatHistory вместо getMessageThreadHistory).
    const result = await window.api?.invoke('tg:get-topic-messages', {
      chatId,
      topicId: topic.topicId || topic.id,
      topMessageId: topic.topMessageId,
      threadMessageId: topic.threadMessageId || null,
      isGeneral: !!topic.isGeneral,
      limit: unreadParams.limit,
      aroundId: unreadParams.aroundId,
      addOffset: unreadParams.addOffset,
    })
    // v0.89.37: race protection — если за время invoke юзер кликнул другой
    // топик в этом chatId, старый ответ ИГНОРИРУЕМ (не затираем активный state).
    const currentRequestId = selectTopicRequestRef.current.get(chatId)
    if (currentRequestId !== requestId) {
      try {
        window.api?.send?.('app:log', { level: 'INFO',
          message: '[topic-ui] stale response ignored chatId=' + chatId +
            ' staleId=' + requestId + ' currentId=' + currentRequestId })
      } catch (_) {}
      return { ok: false, stale: true }
    }
    // v0.89.28: diagnostic — результат tg:get-topic-messages
    try {
      window.api?.send?.('app:log', { level: 'INFO',
        message: '[topic-ui] tg:get-topic-messages result ok=' + !!result?.ok +
          ' messagesCount=' + (result?.messages?.length || 0) +
          ' hasMore=' + !!result?.hasMore +
          ' error=' + (result?.error || 'none') +
          ' key=' + key })
    } catch (_) {}
    setState(s => {
      const loadingCopy = { ...s.loadingMessages }
      delete loadingCopy[key]
      if (!result?.ok) return { ...s, loadingMessages: loadingCopy }
      // v0.91.5: диагностический лог — проверяем что messages[key] действительно
      // обновляется (на случай race conditions с другими setState в полёте).
      try {
        window.api?.send?.('app:log', { level: 'INFO',
          message: '[topic-state] applyMessages key=' + key +
            ' newLen=' + (result.messages?.length || 0) +
            ' prevLen=' + ((s.messages[key] || []).length) +
            ' activeForumTopicId=' + (s.activeForumTopic?.[chatId]?.id || 'none') +
            ' activeChatIdMatch=' + (s.activeChatId === chatId) })
      } catch (_) {}
      return {
        ...s,
        messages: { ...s.messages, [key]: result.messages || [] },
        messageWindows: {
          ...(s.messageWindows || {}),
          [key]: buildUnreadWindowMeta({
            messages: result.messages || [],
            unreadCount: topic.unreadCount || 0,
            readInboxMaxId: topic.readInboxMaxId || 0,
            requested: unreadParams.requested,
            aroundId: unreadParams.aroundId,
            loading: false,
          }),
        },
        loadingMessages: loadingCopy,
      }
    })
    // v0.89.39: сохраняем свежие данные в IndexedDB кэш для следующего открытия.
    // saveCacheMessages — fire and forget (async, не блокирует UI).
    if (result?.ok && Array.isArray(result.messages)) {
      saveCacheMessages(chatId, topicIdForCache, result.messages, {
        unreadCount: topic.unreadCount || 0,
        readInboxMaxId: topic.readInboxMaxId || 0,
      }).catch(() => {})
    }
    return result
  }, [])

  // v0.95.16: ИТЕРАТИВНЫЙ fetch для топика (jump-to-end в форумах).
  // Зеркало loadMessagesUntil для основных чатов. Использует
  // tg:get-topic-messages-iterate → backend.messages.getIterativeUntilTopic
  // (getMessageThreadHistory для не-General или getChatHistory для General).
  // Аналогично selectForumTopic — обновляет state.messages[key] напрямую через setState.
  const loadTopicMessagesUntil = useCallback(async (chatId, topic, untilMessageId, targetCount = 100) => {
    if (!chatId || !topic) return { ok: false, error: 'нет chatId/topic' }
    const key = topicMessageKey(chatId, topic)
    logNativeScroll('store-load-topic-messages-iterate', {
      chatId, key,
      untilMessageId: untilMessageId ? String(untilMessageId) : null,
      targetCount,
      isGeneral: !!topic.isGeneral,
      threadMessageId: topic.threadMessageId || null,
    })
    setState(s => ({ ...s, loadingMessages: { ...s.loadingMessages, [key]: true } }))
    const result = await window.api?.invoke('tg:get-topic-messages-iterate', {
      chatId,
      topicId: topic.topicId || topic.id,
      threadMessageId: topic.threadMessageId || null,
      isGeneral: !!topic.isGeneral,
      untilMessageId: untilMessageId ? String(untilMessageId) : null,
      targetCount,
      maxIterations: 5,
    })
    setState(s => {
      const loadingCopy = { ...s.loadingMessages }
      delete loadingCopy[key]
      if (!result?.ok) return { ...s, loadingMessages: loadingCopy }
      return {
        ...s,
        messages: { ...s.messages, [key]: result.messages || [] },
        messageWindows: {
          ...(s.messageWindows || {}),
          [key]: buildUnreadWindowMeta({
            messages: result.messages || [],
            unreadCount: topic.unreadCount || 0,
            readInboxMaxId: topic.readInboxMaxId || 0,
            requested: false,
            aroundId: 0,
            loading: false,
          }),
        },
        loadingMessages: loadingCopy,
      }
    })
    if (result?.ok && Array.isArray(result.messages)) {
      const topicIdForCache = topic.topicId || topic.id
      saveCacheMessages(chatId, topicIdForCache, result.messages, {
        unreadCount: topic.unreadCount || 0,
        readInboxMaxId: topic.readInboxMaxId || 0,
      }).catch(() => {})
    }
    return result
  }, [])

  // v0.95.29: установка/снятие реакции на сообщение. action: 'add' | 'remove'.
  // Сама реакция (в state.messages[].reactions) обновится через TDLib events
  // (updateMessageInteractionInfo → tg:messages — пока не реализовано отдельно,
  // но при следующем reload сообщений придёт обновлённое поле reactions).
  const setReaction = useCallback(async (chatId, messageId, emoji, action = 'add') => {
    return window.api?.invoke('tg:set-reaction', { chatId, messageId, emoji, action })
  }, [])

  const sendMessage = useCallback(async (chatId, text, replyTo) => {
    // v0.95.27: лог перед IPC.
    // v0.95.29: DUMP всех outgoing сообщений в state.messages для диагностики «дубля».
    // Если в state УЖЕ 2 копии с похожим текстом — баг в state. (render-side проверка
    // удалена в v1.2.12 — см. MessageBubble.jsx, бага дубля был закрыт в v0.95.31-34.)
    const textStr = String(text || '')
    const stateMsgs = stateRef.current.messages[chatId] || []
    const outgoingDump = stateMsgs
      .filter(m => m.isOutgoing)
      .slice(-6)  // последние 6 для логичности
      .map(m => ({ id: String(m.id), text: String(m.text || '').slice(0, 30) }))
    logNativeScroll('store-send-message-invoke', {
      chatId,
      len: textStr.length,
      textPreview: textStr.slice(0, 40),
      replyTo: replyTo || null,
      // Dump последних 6 outgoing сообщений из state — для диагностики
      outgoingDumpJson: JSON.stringify(outgoingDump),
      totalMessages: stateMsgs.length,
      totalOutgoing: stateMsgs.filter(m => m.isOutgoing).length,
    })
    return window.api?.invoke('tg:send-message', { chatId, text, replyTo })
  }, [])

  // v0.88.0: загрузка более НОВЫХ сообщений (infinite scroll вниз, Telegram-style).
  // Telegram MTProto messages.getHistory имеет жёсткий лимит 100 за запрос.
  // Throttle 300мс per-key — защита от FLOOD_WAIT при быстром скролле.
  // Ключ = activeMessageKey: для тем `${chatId}:topic:${topicId}`, иначе chatId.
  const loadNewerMessages = useCallback(async (chatId, afterId, limit = NEWER_PAGE_SIZE) => {
    if (!chatId || !afterId) return { ok: false, error: 'нет chatId/afterId' }
    const activeTopic = stateRef.current.activeForumTopic?.[chatId]
    const throttleKey = activeTopic ? topicMessageKey(chatId, activeTopic) : chatId
    const now = Date.now()
    const lastTs = loadingNewerRef.current.get(throttleKey) || 0
    if (now - lastTs < NEWER_PAGE_MIN_INTERVAL_MS) {
      logNativeScroll('store-load-newer-throttle', { chatId, key: throttleKey, sinceLastMs: now - lastTs })
      return { ok: false, throttled: true }
    }
    loadingNewerRef.current.set(throttleKey, now)
    logNativeScroll('store-load-newer', { chatId, afterId, limit, key: throttleKey, topic: !!activeTopic })
    if (activeTopic) {
      // v0.89.30 (ловушка #29): передаём threadMessageId + isGeneral
      const result = await window.api?.invoke('tg:get-topic-messages', {
        chatId,
        topicId: activeTopic.topicId || activeTopic.id,
        topMessageId: activeTopic.topMessageId,
        threadMessageId: activeTopic.threadMessageId || null,
        isGeneral: !!activeTopic.isGeneral,
        limit,
        afterId: Number(afterId),
      })
      // v0.89.31 (ловушка #30): складываем новые msg в state + обновляем
      // messageWindows[key].loadedIncoming, чтобы плашка «N из M» двигалась.
      if (result?.ok) {
        const key = topicMessageKey(chatId, activeTopic)
        setState(s => {
          const existing = s.messages[key] || []
          const existingIds = new Set(existing.map(m => m.id))
          const newMsgs = (result.messages || []).filter(m => !existingIds.has(m.id))
          const merged = [...existing, ...newMsgs]
          const currentWindow = s.messageWindows?.[key]
          const nextWindow = currentWindow ? buildUnreadWindowMeta({
            messages: merged,
            unreadCount: currentWindow.unreadCount || activeTopic.unreadCount || 0,
            readInboxMaxId: currentWindow.readInboxMaxId || activeTopic.readInboxMaxId || 0,
            requested: currentWindow.unreadWindowRequested,
            aroundId: currentWindow.aroundId,
            loading: false,
          }) : currentWindow
          // v0.89.32: diagnostic — фиксируем скачок размера messages[key] (prepend
          // больших батчей вызывает scroll-jump в виртуализированном списке).
          try {
            window.api?.send?.('app:log', { level: 'INFO',
              message: '[topic-load-newer] key=' + key + ' beforeCount=' + existing.length +
                ' added=' + newMsgs.length + ' afterCount=' + merged.length +
                ' loadedIncoming=' + (nextWindow?.loadedIncoming || 0) +
                ' unreadCount=' + (nextWindow?.unreadCount || 0) })
          } catch (_) {}
          return {
            ...s,
            messages: { ...s.messages, [key]: merged },
            messageWindows: nextWindow ? { ...(s.messageWindows || {}), [key]: nextWindow } : s.messageWindows,
          }
        })
        // v0.89.40: сохраняем merged tail в IDB — следующее открытие топика
        // покажет более свежий snapshot (включая результаты пролистывания вниз).
        const mergedForCache = stateRef.current.messages[topicMessageKey(chatId, activeTopic)]
        if (Array.isArray(mergedForCache)) {
          saveCacheMessages(chatId, activeTopic.topicId || activeTopic.id, mergedForCache, {
            unreadCount: activeTopic.unreadCount || 0,
            readInboxMaxId: activeTopic.readInboxMaxId || 0,
          }).catch(() => {})
        }
      }
      return result
    }
    // v0.89.40: обычный чат — после загрузки новых сообщений тоже сохраняем
    // в IndexedDB для optimistic render при следующем открытии.
    const result = await window.api?.invoke('tg:get-messages', { chatId, limit, afterId: Number(afterId) })
    if (result?.ok && Array.isArray(result.messages)) {
      const currentChat = stateRef.current.chats.find(c => c.id === chatId)
      const merged = stateRef.current.messages[chatId] || result.messages
      saveCacheMessages(chatId, null, merged, {
        unreadCount: currentChat?.unreadCount || 0,
        readInboxMaxId: currentChat?.readInboxMaxId || 0,
      }).catch(() => {})
    }
    return result
  }, [])

  // v0.87.15: загрузка более старых сообщений (infinite scroll вверх)
  const loadOlderMessages = useCallback(async (chatId, beforeId, limit = 50) => {
    logNativeScroll('store-load-older', { chatId, beforeId, limit })
    const activeTopic = stateRef.current.activeForumTopic?.[chatId]
    if (activeTopic) {
      const key = topicMessageKey(chatId, activeTopic)
      // v0.89.30 (ловушка #29): передаём threadMessageId + isGeneral
      const result = await window.api?.invoke('tg:get-topic-messages', {
        chatId,
        topicId: activeTopic.topicId || activeTopic.id,
        topMessageId: activeTopic.topMessageId,
        threadMessageId: activeTopic.threadMessageId || null,
        isGeneral: !!activeTopic.isGeneral,
        limit,
        offsetId: Number(beforeId),
      })
      if (result?.ok) {
        setState(s => {
          const existing = s.messages[key] || []
          const existingIds = new Set(existing.map(m => m.id))
          const newOld = (result.messages || []).filter(m => !existingIds.has(m.id))
          const merged = [...newOld, ...existing]
          // v0.89.31 (ловушка #30): обновляем messageWindows[key].loadedIncoming
          // чтобы плашка «N из M» двигалась при подгрузке вверх.
          const currentWindow = s.messageWindows?.[key]
          const nextWindow = currentWindow ? buildUnreadWindowMeta({
            messages: merged,
            unreadCount: currentWindow.unreadCount || activeTopic.unreadCount || 0,
            readInboxMaxId: currentWindow.readInboxMaxId || activeTopic.readInboxMaxId || 0,
            requested: currentWindow.unreadWindowRequested,
            aroundId: currentWindow.aroundId,
            loading: false,
          }) : currentWindow
          // v0.89.32: diagnostic — prepend старых сообщений в виртуализированный список
          // сдвигает scrollTop (видно как "дёргание"). Логируем размер скачка чтобы
          // подтвердить корреляцию.
          try {
            window.api?.send?.('app:log', { level: 'INFO',
              message: '[topic-load-older] key=' + key + ' beforeCount=' + existing.length +
                ' prepended=' + newOld.length + ' afterCount=' + merged.length +
                ' loadedIncoming=' + (nextWindow?.loadedIncoming || 0) +
                ' unreadCount=' + (nextWindow?.unreadCount || 0) })
          } catch (_) {}
          return {
            ...s,
            messages: { ...s.messages, [key]: merged },
            messageWindows: nextWindow ? { ...(s.messageWindows || {}), [key]: nextWindow } : s.messageWindows,
          }
        })
        // v0.89.40: сохраняем merged tail в IDB после prepend старых.
        const mergedForCache = stateRef.current.messages[key]
        if (Array.isArray(mergedForCache)) {
          saveCacheMessages(chatId, activeTopic.topicId || activeTopic.id, mergedForCache, {
            unreadCount: activeTopic.unreadCount || 0,
            readInboxMaxId: activeTopic.readInboxMaxId || 0,
          }).catch(() => {})
        }
      }
      return result
    }
    // v0.89.40: обычный чат — после prepend старых тоже сохраняем в IDB.
    const result = await window.api?.invoke('tg:get-messages', { chatId, limit, offsetId: Number(beforeId) })
    if (result?.ok && Array.isArray(result.messages)) {
      const currentChat = stateRef.current.chats.find(c => c.id === chatId)
      const merged = stateRef.current.messages[chatId] || result.messages
      saveCacheMessages(chatId, null, merged, {
        unreadCount: currentChat?.unreadCount || 0,
        readInboxMaxId: currentChat?.readInboxMaxId || 0,
      }).catch(() => {})
    }
    return result
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
    // v0.87.105: accountId теперь обязателен (multi-account). Если не передан — backend удалит активный.
    return await window.api?.invoke('tg:remove-account', { accountId })
  }, [])

  // v0.87.95: предпросмотр — что будет удалено при logout. Возвращает
  // { totalFiles, totalBytes, byCategory } без реального удаления.
  const getCleanupStats = useCallback(async () => {
    return await window.api?.invoke('tg:get-cleanup-stats')
  }, [])

  // v0.87.109: заглушить/включить уведомления чата.
  // muteUntil=0 → включить, иначе Unix timestamp до которого заглушён.
  const setMute = useCallback(async (chatId, muteUntil) => {
    const r = await window.api?.invoke('tg:set-mute', { chatId, muteUntil })
    if (r?.ok) {
      setState(s => ({
        ...s,
        chats: s.chats.map(c => c.id === chatId
          ? { ...c, isMuted: muteUntil > Math.floor(Date.now() / 1000), muteUntil }
          : c)
      }))
    }
    return r
  }, [])

  // v0.95.46: запрос scroll к конкретному сообщению (используется при клике
  // «Перейти к чату» в уведомлении — после setActiveChat нужно проскроллить до
  // того самого сообщения которое вызвало уведомление, а не просто открыть чат).
  // InboxMode useEffect слушает state.pendingScrollToMessage и при совпадении
  // chatId с activeChatId вызывает scrollToMessage(messageId) + clear.
  // Эталон: Telegram Web K appImManager.setInnerPeer({peerId, lastMsgId}).
  const requestScrollToMessage = useCallback((chatId, messageId) => {
    if (!chatId || !messageId) return
    setState(s => ({
      ...s,
      pendingScrollToMessage: {
        chatId: String(chatId),
        messageId: String(messageId),
        ts: Date.now(),
        // v0.95.48: флаг что мы УЖЕ инициировали loadMessages вокруг target.
        // Защита от петли: если 2-я попытка scroll тоже промахнётся (target
        // удалён/не в кэше TDLib) — показываем toast и очищаем pending.
        loadAttempted: false,
      },
    }))
  }, [])

  // v0.95.48: пометить что loadMessages aroundId уже вызван — InboxMode проверит
  // флаг во 2-й итерации useEffect (после tg:messages → activeMessages обновится).
  const markPendingScrollLoadAttempted = useCallback(() => {
    setState(s => {
      if (!s.pendingScrollToMessage) return s
      if (s.pendingScrollToMessage.loadAttempted) return s
      return {
        ...s,
        pendingScrollToMessage: { ...s.pendingScrollToMessage, loadAttempted: true },
      }
    })
  }, [])

  const clearPendingScrollToMessage = useCallback(() => {
    setState(s => {
      if (!s.pendingScrollToMessage) return s
      return { ...s, pendingScrollToMessage: null }
    })
  }, [])

  // v0.95.41: резолв custom emoji premium (реакции + messageAnimatedEmoji).
  // Хранит in-memory кэш в state.customEmojis: {[id]: {url, mime, alt}}.
  // UI вызывает resolveCustomEmojis([id1, id2, ...]) → after-resolve кэш обновлён,
  // CustomEmojiRenderer читает кэш через useStore. Дедуп уже-в-кэше внутри.
  // ОБЯЗАТЕЛЬНО прочитать перед правкой: .memory-bank/mistakes/outgoing-two-cases.md
  const resolveCustomEmojis = useCallback(async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return
    const current = stateRef.current.customEmojis || {}
    // Фильтруем те что уже в кэше — экономит batch invoke
    const missing = []
    const seen = new Set()
    for (const rawId of ids) {
      const id = String(rawId || '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      if (!current[id]) missing.push(id)
    }
    if (missing.length === 0) return
    try {
      const r = await window.api?.invoke('tg:resolve-custom-emojis', { emojiIds: missing })
      if (r?.ok && r.emojis) {
        setState(s => ({
          ...s,
          customEmojis: { ...(s.customEmojis || {}), ...r.emojis },
        }))
      }
    } catch (_) {}
  }, [])

  return {
    ...state,
    setMode, setActiveAccount, setActiveChat, toggleAccountVisible, soloAccount, showAllAccounts, closeForumTopics,
    startLogin, submitCode, submitPassword, cancelLogin, resetLoginFlow, setAccountColor,
    loadChats, loadCachedChats, checkConnection, loadMessages, loadMessagesUntil, loadTopicMessagesUntil, loadForumTopics, selectForumTopic, loadOlderMessages, loadNewerMessages,
    sendMessage, sendFile, sendAlbum, deleteMessage, editMessage, forwardMessage, pinMessage, setReaction,
    getPinnedMessage, refreshAvatar, rescanUnread,
    downloadMedia, removeAccount, markRead, markTopicRead, setTyping,
    getCleanupStats, setMute, resolveCustomEmojis,
    requestScrollToMessage, clearPendingScrollToMessage, markPendingScrollLoadAttempted,
  }
}
