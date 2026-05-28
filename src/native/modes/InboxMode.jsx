// v0.87.12: Режим «Чаты» (Inbox) с виртуальным скроллом, поиском, иконками типов.
// v0.87.27: photoViewer, scroll-to-reply, «новые сообщения» divider, Ctrl+↑ edit.
// v0.87.83 — Refactored: 4 блока вынесены в hooks/components.
// v0.87.103 — JSX окна чата вынесен в InboxChatPanel.jsx (~210 строк).
import { useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react'
import ForwardPicker from '../components/ForwardPicker.jsx'
import InboxChatListSidebar from '../components/InboxChatListSidebar.jsx'
import InboxChatPanel from '../components/InboxChatPanel.jsx'
import { groupMessages, findFirstUnreadId } from '../utils/messageGrouping.js'
import { useInitialScroll } from '../hooks/useInitialScroll.js'
import { useForceReadAtBottom } from '../hooks/useForceReadAtBottom.js'
import { useDropAndPaste } from '../hooks/useDropAndPaste.js'
import { useMessageActions } from '../hooks/useMessageActions.js'
import { useNewBelowCounter } from '../hooks/useNewBelowCounter.js'
import { useScrollDiagnostics } from '../hooks/useScrollDiagnostics.js'
import useReadByVisibility from '../hooks/useReadByVisibility.js'
import useInboxScroll from '../hooks/useInboxScroll.js'
import { getUnreadAnchorDebug, logNativeScroll } from '../utils/scrollDiagnostics.js'
import { computeScrollBehavior } from '../utils/scrollBehavior.js'
import useChatListResize, {
  CHAT_LIST_DEFAULT_WIDTH, clampChatListWidth, isChatListCompact,
} from '../hooks/useChatListResize.js'
import ChatListResizeHandle from '../components/ChatListResizeHandle.jsx'
import { loadScrollPositions } from '../utils/scrollPositionsCache.js'
import { useScrollPositionAutosave } from '../hooks/useScrollPositionAutosave.js'

try { window.__ccStartupMark?.('module:InboxMode', 'module evaluated') } catch {}

function topicMessageKey(chatId, topic) {
  const topicId = topic?.topicId || topic?.id || topic?.topMessageId
  return topicId ? `${chatId}:topic:${topicId}` : chatId
}

export default function InboxMode({ store, hoveredAccountId, modes }) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [listHeight, setListHeight] = useState(600)
  // v0.95.7: drag-to-resize chat-list ↔ окно чата. Default 340px, [60, 600]. Compact <200.
  const [chatListWidth, setChatListWidth] = useState(CHAT_LIST_DEFAULT_WIDTH)
  const [isResizingChatList, setIsResizingChatList] = useState(false)
  const chatListWidthRef = useRef(CHAT_LIST_DEFAULT_WIDTH)
  const chatListPanelRef = useRef(null)
  const chatListResizeStartRef = useRef({ x: 0, w: CHAT_LIST_DEFAULT_WIDTH })
  const chatListIsResizingRef = useRef(false)
  const chatListSettingsRef = useRef(null)
  // Подгрузка сохранённой ширины из settings:get (один раз при mount).
  useEffect(() => {
    let cancelled = false
    window.api?.invoke?.('settings:get').then(s => {
      if (cancelled || !s) return
      chatListSettingsRef.current = s
      const saved = clampChatListWidth(s.chatListWidth || CHAT_LIST_DEFAULT_WIDTH)
      chatListWidthRef.current = saved
      setChatListWidth(saved)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const { startResize: startChatListResize, onPointerMove: onChatListPointerMove,
    onPointerUp: onChatListPointerUp, resetToDefault: resetChatListWidth } = useChatListResize({
    isResizingRef: chatListIsResizingRef,
    resizeStartRef: chatListResizeStartRef,
    chatListWidthRef,
    chatListRef: chatListPanelRef,
    settingsRef: chatListSettingsRef,
    setIsResizing: setIsResizingChatList,
    setChatListWidth,
  })
  const chatListCompact = isChatListCompact(chatListWidth)
  // v0.87.66: chatReady=true только после завершения initial-scroll. Пока false —
  // scroll-container невидим (opacity 0) + MessageListOverlay (shimmer) показан.
  // v0.87.67: shimmer ТОЛЬКО для чатов открываемых ВПЕРВЫЕ. Повторное открытие — мгновенно.
  const [chatReady, setChatReady] = useState(false)
  const seenChatsRef = useRef(new Set())
  // v0.87.70: Map<chatId, scrollTop> — своя позиция для каждого чата (как Telegram Desktop).
  // v0.91.8 (Совет 1): инициализируем из localStorage — позиция переживает перезапуск программы.
  const scrollPosByChatRef = useRef(loadScrollPositions())
  // v0.94.0: closed-loop guard — programmatic scroll от restore (el.scrollTop=saved)
  // триггерит onScroll → handleScroll save (MDN: programmatic scroll fires event).
  // Флаг ставится true в useInitialScroll перед scrollTop=, сбрасывается через 500мс.
  // Объявлен ЗДЕСЬ — пробрасывается в useScrollPositionAutosave / useInboxScroll / useInitialScroll.
  const isRestoringRef = useRef(false)
  // v0.94.0: Virtuoso удалён. firstItemIndex / scrollStateByChatRef / initialTopMostItemIndex
  // больше не нужны — обычный DOM scroll + pixel scrollTop restore.

  useEffect(() => { store.loadCachedChats?.() }, [])

  // v0.87.24: window.focus → rescan unread
  useEffect(() => {
    const onFocus = () => { store.rescanUnread?.({ updateHealth: false }) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // v0.87.105 (ADR-016): загружаем чаты ВСЕХ аккаунтов разом (multi-account).
  // Если accountId не передан, backend itерирует по всем зарегистрированным.
  useEffect(() => {
    if (store.accounts.length > 0) store.loadChats()
  }, [store.accounts.length])

  useEffect(() => {
    if (!store.activeChatId) return
    const chat = store.chats.find(c => c.id === store.activeChatId)
    // v0.89.24: diagnostic forum
    try {
      window.api?.send?.('app:log', { level: 'INFO',
        message: '[forum-ui] activeChatId=' + store.activeChatId +
          ' chatFound=' + !!chat +
          ' type=' + (chat?.type || 'none') +
          ' isForum=' + (chat?.isForum === undefined ? 'undefined' : chat?.isForum) +
          ' triggerForum=' + !!((chat?.type === 'group' || chat?.type === 'channel') && chat.isForum !== false) })
    } catch (_) {}
    if ((chat?.type === 'group' || chat?.type === 'channel') && chat.isForum !== false) {
      let cancelled = false
      store.loadForumTopics?.(store.activeChatId, 50).then(r => {
        try {
          window.api?.send?.('app:log', { level: 'INFO',
            message: '[forum-ui] loadForumTopics result ok=' + !!r?.ok +
              ' isForum=' + !!r?.isForum + ' topicsCount=' + (r?.topics?.length || 0) +
              ' cancelled=' + cancelled })
        } catch (_) {}
        if (cancelled || r?.isForum) return
        // v0.91.1: guard по loadingMessages, не по messages. TDLib эмитит updateNewMessage
        // при старте → state.messages[id] почти всегда непуст (1-2 push'нутых сообщения)
        // → старый guard `!messages[id]` блокировал initial-load навсегда. У Telegram Desktop
        // / WhatsApp / Discord — getChatHistory ВСЕГДА при открытии чата. Лог 18:54:15:
        // hasMessages=true messages=1, store-load-messages отсутствует, юзер сидит на 1 msg.
        if (!store.loadingMessages?.[store.activeChatId]) store.loadMessages(store.activeChatId, 50)
      })
      return () => { cancelled = true }
    }
    if (!store.loadingMessages?.[store.activeChatId]) {
      store.loadMessages(store.activeChatId, 50)
    }
    // v0.87.16: НЕ помечаем всё прочитанным при открытии — счётчик уменьшается
    // по мере показа (IntersectionObserver) или scroll в низ.
  }, [store.activeChatId, store.chats.length])

  // v0.87.105 (ADR-016): единая лента всех аккаунтов с возможностью фильтра.
  // store.chatFilter: 'all' | accountId. По умолчанию 'all' — показываем чаты со всех аккаунтов.
  const activeAccountChats = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filter = store.chatFilter || 'all'
    return (store.chats || [])
      .filter(c => filter === 'all' ? true : c.accountId === filter)
      .filter(c => !q || (c.title || '').toLowerCase().includes(q) || (c.lastMessage || '').toLowerCase().includes(q))
      .sort((a, b) => (b.lastMessageTs || 0) - (a.lastMessageTs || 0))
  }, [store.chats, store.chatFilter, search])

  const activeChat = store.chats.find(c => c.id === store.activeChatId)
  const activeTopic = store.activeForumTopic?.[store.activeChatId] || null
  const forumNeedsTopic = !!activeChat?.isForum && !activeTopic
  const activeMessageKey = topicMessageKey(store.activeChatId, activeTopic)
  const activeViewKey = activeTopic ? activeMessageKey : store.activeChatId
  const activeMessages = forumNeedsTopic ? [] : (store.messages[activeMessageKey] || [])

  // v0.91.5: диагностика для бага «выбрал тему форума → пустой экран, вечная загрузка».
  // Из лога видно что backend возвращает messages, но UI пуст. Здесь — лог где UI
  // резолвит activeMessages: какой ключ читается, сколько сообщений нашлось, какие
  // ключи вообще есть в store.messages для этого chatId.
  useEffect(() => {
    if (!store.activeChatId) return
    if (!activeChat?.isForum) return
    try {
      const allKeys = Object.keys(store.messages || {}).filter(k => k.startsWith(store.activeChatId))
      const keyLengths = allKeys.map(k => k + '=' + (store.messages[k]?.length || 0)).join(',')
      window.api?.send?.('app:log', { level: 'INFO',
        message: '[topic-resolve] chatId=' + store.activeChatId +
          ' activeTopicId=' + (activeTopic?.id || 'none') +
          ' activeMessageKey=' + activeMessageKey +
          ' activeMessages.len=' + activeMessages.length +
          ' forumNeedsTopic=' + forumNeedsTopic +
          ' allTopicKeys=' + (keyLengths || 'empty') })
    } catch (_) {}
  }, [store.activeChatId, activeTopic?.id, activeMessages.length])
  // v0.87.45: activeUnread = MTProto-число (альбом=N фото) — для findFirstUnread, markRead, initial-scroll.
  const activeUnread = forumNeedsTopic ? 0 : (activeTopic ? (activeTopic.unreadCount || 0) : (activeChat?.unreadCount || 0))
  const activeMessageWindow = store.messageWindows?.[activeMessageKey] || null
  const activeReadInboxMaxId = Number(activeTopic?.readInboxMaxId || activeChat?.readInboxMaxId || activeMessageWindow?.readInboxMaxId || 0)

  // v0.87.51: диагностика прогрессии 23→20→15→...→0 при прокрутке.
  // v0.87.53: prevUnreadRef сбрасывается при смене activeChatId.
  const prevUnreadRef = useRef(null)
  const prevUnreadChatIdRef = useRef(null)
  useEffect(() => {
    if (!activeChat) return
    if (prevUnreadChatIdRef.current !== activeChat.id) {
      prevUnreadChatIdRef.current = activeChat.id
      prevUnreadRef.current = null
    }
    const u = activeChat.unreadCount ?? null
    if (prevUnreadRef.current !== u) {
      scrollDiag.logEvent('badge-state', {
        chatId: activeChat.id, title: activeChat.title,
        unread: u, prevUnread: prevUnreadRef.current,
      })
      prevUnreadRef.current = u
    }
  }, [activeChat?.id, activeChat?.unreadCount])

  const handleSend = async () => {
    if (!input.trim() || !store.activeChatId || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')
    try { await store.sendMessage(store.activeChatId, text) } catch (e) { console.error(e) }
    finally { setSending(false) }
  }

  // v0.87.14: typing-индикатор при наборе (debounce 3 сек)
  const typingTimerRef = useRef(0)
  const handleInputChange = (v) => {
    setInput(v)
    if (!store.activeChatId) return
    if (Date.now() - typingTimerRef.current > 3000) {
      typingTimerRef.current = Date.now()
      store.setTyping?.(store.activeChatId)
    }
  }

  const isTyping = store.typing?.[store.activeChatId]

  // v0.87.15: reply / edit / search / scroll-up
  const [replyTo, setReplyTo] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [msgSearch, setMsgSearch] = useState('')
  const [showMsgSearch, setShowMsgSearch] = useState(false)
  const msgsScrollRef = useRef(null)
  useScrollPositionAutosave({ activeViewKey, chatReady, msgsScrollRef, scrollPosByChatRef, isRestoringRef })  // v0.91.17 + v0.92.4
  // v0.89.0: imperative API виртуализации react-window (scrollToRow, get element).
  // Используется как fallback когда querySelector('[data-msg-id]') промахивается
  // (элемент не в видимом виртуальном DOM).
  const virtualListRef = useRef(null)
  const loadingOlderRef = useRef(false)
  // v0.94.2: якорь для re-pin после load-older prepend (см. useLayoutEffect ниже).
  const prependAnchorRef = useRef(null)
  // v0.88.0: prefetch новых сообщений вниз (Telegram-style infinite scroll).
  // loadingNewerRef — guard от параллельных запросов, [loadingNewer, setLoadingNewer] — для UI индикатора.
  const loadingNewerRef = useRef(false)
  const [loadingNewer, setLoadingNewer] = useState(false)

  // v0.87.17: forward-модалка + тост + закреплённое
  const [forwardTarget, setForwardTarget] = useState(null)
  const [toast, setToast] = useState(null)
  const [pinnedMsg, setPinnedMsg] = useState(null)

  // v0.87.28: scroll-to-bottom + первый непрочитанный
  // v0.87.44: default false! Иначе useForceReadAtBottom срабатывал СРАЗУ при открытии
  // → сервер возвращал unread=1 вместо 7. Баг «было 7, стало 1 за секунду».
  const [atBottom, setAtBottom] = useState(false)
  const [newBelow, setNewBelow] = useState(0)
  const [firstUnreadId, setFirstUnreadId] = useState(null)
  const firstUnreadIdRef = useRef(null)
  // v0.89.33: snapshot readInboxMaxId на момент открытия чата/топика.
  // Как в Telegram Desktop / WhatsApp / Discord — divider «НОВЫЕ СООБЩЕНИЯ»
  // застывает на позиции открытия и НЕ двигается при последующих markRead.
  // Сбрасывается только при смене activeViewKey.
  // Фиксируется на ПЕРВОМ НЕНУЛЕВОМ значении (до этого данные ещё не пришли).
  const frozenReadCursorRef = useRef({ viewKey: null, cursor: 0 })
  const scrollDiag = useScrollDiagnostics({
    activeChatId: activeViewKey, activeChat, activeMessages, activeUnread,
    loading: store.loadingMessages?.[activeMessageKey],
    scrollRef: msgsScrollRef,
  })
  const loadedIncomingCount = activeMessages.filter(m => !m.isOutgoing).length
  const unreadWindowIncomplete = !!activeMessageWindow?.unreadWindowRequested
    && activeMessageWindow?.unreadWindowComplete === false
  const markReadCurrentView = async (viewKey, maxId, options = {}) => {
    const source = options?.source || 'unknown'
    // v0.95.8: whitelist для bypass гейта unreadWindowIncomplete.
    // - 'visibility': IntersectionObserver per-msg (защита от каскада в v0.94.7 useReadByVisibility)
    // - 'button-scroll': явный клик юзера ↓ "к последнему" = эквивалент Telegram Desktop
    //   scroll-to-bottom + mark-all-as-read. TDLib viewMessages range-ack — штатное API.
    //   Mass-ack guards в useReadByVisibility (v0.94.7) и useForceReadAtBottom (v0.91.13)
    //   защищают от passive scroll-trigger, тут — active user intent.
    const ACTIVE_USER_SOURCES = new Set(['visibility', 'button-scroll'])
    if (unreadWindowIncomplete && !ACTIVE_USER_SOURCES.has(source)) {
      scrollDiag.logEvent('mark-read-skip-unread-window', {
        viewKey,
        unread: activeUnread,
        loadedIncoming: loadedIncomingCount,
        source,
        maxId,
      })
      return { ok: true, skipped: true, reason: 'unread-window-incomplete' }
    }
    // v0.95.8: лог для transparency — видно когда явный клик ↓ обходит гейт.
    if (unreadWindowIncomplete && source === 'button-scroll') {
      scrollDiag.logEvent('mark-read-bypass-gate-button-scroll', {
        viewKey, maxId, unread: activeUnread, loadedIncoming: loadedIncomingCount,
      })
    }
    if (activeChat?.isForum) {
      if (!activeTopic) return { ok: true, skipped: true }
      return store.markTopicRead?.(store.activeChatId, activeTopic, maxId)
    }
    return store.markRead?.(viewKey, maxId, { readInboxMaxId: activeReadInboxMaxId, source })
  }

  // v0.87.29/40: начальный скролл — ПОСЛЕ загрузки свежих данных.
  // v0.94.0: useInitialScroll переписан под обычный DOM — restore через el.scrollTop=saved.
  // onDone → setChatReady(true). getSavedScrollTop отдаёт {scrollTop, atBottom}.
  // isRestoringRef — closed-loop guard (programmatic scrollTop= не должен портить save).
  const { doneRef: initialScrollDoneRef } = useInitialScroll({
    activeChatId: activeViewKey,
    messagesCount: activeMessages.length,
    scrollRef: msgsScrollRef,
    firstUnreadIdRef, activeUnread,
    loading: store.loadingMessages?.[activeMessageKey],
    onDone: (chatId) => {
      seenChatsRef.current.add(chatId)
      setChatReady(true)
    },
    getSavedScrollTop: (chatId) => scrollPosByChatRef.current.get(chatId) ?? null,
    isRestoringRef,
  })

  // v0.87.66/67: при смене чата проверяем seenChatsRef — если уже видели, chatReady=true сразу.
  useEffect(() => {
    if (!activeViewKey) { setChatReady(false); return }
    if (seenChatsRef.current.has(activeViewKey)) {
      setChatReady(true)
    } else {
      setChatReady(false)
    }
  }, [activeViewKey])

  // v0.87.31: photo (single src) или { srcs, index } (album с навигацией ← →)
  const openPhotoWindow = (payload) => {
    const arg = typeof payload === 'string' ? { src: payload } : payload
    try { window.api?.invoke('photo:open', arg) } catch(_) {}
  }

  const showToast = (message, type = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Загрузка закреплённого при смене чата
  useEffect(() => {
    setPinnedMsg(null)
    if (!store.activeChatId) return
    if (activeChat?.isForum) return
    store.getPinnedMessage?.(store.activeChatId).then(r => {
      if (r?.ok && r.message) setPinnedMsg(r.message)
    })
  }, [store.activeChatId, activeChat?.isForum])

  // v0.87.17: догружаем аватарки для активных чатов без photo (каналы)
  useEffect(() => {
    if (!store.activeChatId) return
    const chat = store.chats.find(c => c.id === store.activeChatId)
    if (chat && !chat.avatar && chat.hasPhoto !== false) {
      store.refreshAvatar?.(store.activeChatId)
    }
  }, [store.activeChatId])

  const visibleMessages = useMemo(() => {
    if (!msgSearch.trim()) return activeMessages
    const q = msgSearch.toLowerCase()
    return activeMessages.filter(m => (m.text || '').toLowerCase().includes(q))
  }, [activeMessages, msgSearch])

  // v0.87.27: группировка + разделители вынесены в utils/messageGrouping.js
  const renderItems = useMemo(
    () => groupMessages(visibleMessages, firstUnreadId),
    [visibleMessages, firstUnreadId]
  )

  // v0.94.0: findRenderItemIndex УДАЛЁН — был нужен для виртуализированного
  // scrollToRow по индексу. Теперь scroll-to-reply через querySelector data-msg-id.

  // v0.94.0: scroll-to-reply — querySelector по data-msg-id + scrollIntoView.
  // Без виртуализации ВСЕ msgs в DOM, querySelector всегда находит target.
  const scrollToVirtualRow = (msgId, align = 'start') => {
    const el = msgsScrollRef.current?.querySelector(`[data-msg-id="${msgId}"]`)
    if (!el) return false
    const block = align === 'end' ? 'end' : align === 'center' ? 'center' : 'start'
    try { el.scrollIntoView({ block, behavior: 'auto' }) } catch (_) {}
    return true
  }

  // v0.94.0: Virtuoso удалён — initialTopMostItemIndex, firstItemIndex, handleStartReached,
  // handleEndReached УДАЛЕНЫ. load-older/load-newer теперь в useInboxScroll.handleScroll
  // (DOM scrollTop триггеры). Restore позиции — в useInitialScroll (el.scrollTop=saved).

  // v0.87.40: пересчёт firstUnread при смене свежих данных (firstId/lastId/unread)
  const firstMsgId = activeMessages[0]?.id
  const lastMsgId = activeMessages[activeMessages.length - 1]?.id
  useEffect(() => {
    if (!activeViewKey) {
      firstUnreadIdRef.current = null
      setFirstUnreadId(null)
      return
    }
    const chat = store.chats.find(c => c.id === store.activeChatId)
    const topic = store.activeForumTopic?.[store.activeChatId]
    const realUnread = topic ? (topic.unreadCount || 0) : (chat?.unreadCount || 0)
    // v0.87.40: clamp unread к числу incoming (сервер мог вернуть завышенное)
    const incoming = activeMessages.filter(m => !m.isOutgoing)
    const clampedUnread = Math.min(realUnread, incoming.length)
    // v0.89.33: snapshot readInboxMaxId на момент открытия чата.
    // Сброс при смене viewKey. Фиксация на первом ненулевом значении.
    if (frozenReadCursorRef.current.viewKey !== activeViewKey) {
      frozenReadCursorRef.current = { viewKey: activeViewKey, cursor: 0 }
    }
    if (frozenReadCursorRef.current.cursor === 0 && activeReadInboxMaxId > 0) {
      frozenReadCursorRef.current.cursor = activeReadInboxMaxId
    }
    // Используем snapshot если он зафиксирован (>0), иначе живое значение
    // (актуально для случая когда чат только открылся и cursor ещё 0).
    const snapshotCursor = frozenReadCursorRef.current.cursor || activeReadInboxMaxId
    const nextFirstUnreadId = findFirstUnreadId(activeMessages, clampedUnread, snapshotCursor)
    firstUnreadIdRef.current = nextFirstUnreadId
    setFirstUnreadId(nextFirstUnreadId)
    scrollDiag.logEvent('first-unread-calc', {
      ...getUnreadAnchorDebug(activeMessages, clampedUnread),
      readInboxMaxId: activeReadInboxMaxId,
      snapshotCursor,
      firstUnreadId: nextFirstUnreadId,
    })
  }, [activeViewKey, firstMsgId, lastMsgId, activeUnread, activeReadInboxMaxId])

  const getMessage = (chatId, msgId) => (store.messages[activeMessageKey] || store.messages[chatId] || []).find(m => m.id === String(msgId))

  // v0.87.83: read-by-visibility batch markRead → useReadByVisibility hook.
  // v0.87.37: maxEverSentRef — никогда не уменьшаем watermark.
  const maxEverSentRef = useRef(0)
  const { readByVisibility } = useReadByVisibility({
    activeChatId: activeViewKey,
    activeUnread,
    readInboxMaxId: activeReadInboxMaxId,
    markRead: markReadCurrentView,
    scrollDiag,
    maxEverSentRef,
  })

  // v0.87.52: сброс newBelow при смене чата (иначе залипает от прошлого).
  useEffect(() => { setNewBelow(0) }, [activeViewKey])

  // v0.87.34: drag-n-drop файлов + Ctrl+V картинки
  const { dragOver, handleDragOver, handleDragLeave, handleDrop, handlePaste } = useDropAndPaste({
    activeChatId: store.activeChatId, sendFile: store.sendFile, showToast,
  })

  // v0.87.83: handleScroll → useInboxScroll hook.
  // v0.94.0: load-older/load-newer вернулись в handleScroll (DOM scrollTop триггеры).
  const { handleScroll } = useInboxScroll({
    store, scrollKey: activeViewKey, activeMessages, activeUnread, chatReady,
    msgsScrollRef, scrollPosByChatRef, initialScrollDoneRef, loadingOlderRef,
    loadingNewerRef, setLoadingNewer,
    scrollDiag, setAtBottom, setNewBelow,
    isRestoringRef,  // v0.92.4: guard от closed-loop save при programmatic restore
    prependAnchorRef,  // v0.94.2: якорь для re-pin после load-older
  })

  // v0.94.2: КОМПЕНСАЦИЯ ПРОКРУТКИ после load-older prepend (overflow-anchor:none).
  // Паттерн Telegram Web K ScrollSaver: useInboxScroll перед подгрузкой запомнил
  // верхнее видимое сообщение и его экранную позицию (prependAnchorRef). Здесь, после
  // отрисовки новых старых сообщений сверху (useLayoutEffect = до paint, без мигания),
  // возвращаем то же сообщение на тот же пиксель → экран не прыгает и не уходит к верху
  // (иначе каскад из десятков подгрузок, см. лог чата «Машинное обучение»).
  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current
    if (!anchor) return
    const el = msgsScrollRef.current
    if (!el) return
    const target = el.querySelector(`[data-msg-id="${anchor.msgId}"]`)
    if (!target) return  // якорь ещё не отрисован — ждём следующий коммит
    const newScreenTop = target.getBoundingClientRect().top - el.getBoundingClientRect().top
    const diff = newScreenTop - anchor.screenTop
    // diff > 0 → контент добавлен ВЫШЕ якоря (prepend произошёл). diff≈0 → это случайный
    // ре-рендер или append снизу — НЕ трогаем scroll и НЕ сбрасываем якорь, ждём prepend.
    if (diff > 0.5) {
      prependAnchorRef.current = null
      el.scrollTop += diff
      logNativeScroll('load-older-compensate', {
        msgId: anchor.msgId, diff: Math.round(diff), newTop: Math.round(el.scrollTop),
      })
    }
  }, [activeMessages])

  // v0.91.3: event-based newBelow — подписка на tg:new-message (server push),
  // вместо отслеживания массива. См. useNewBelowCounter.js (полная история бага).
  useNewBelowCounter({
    activeChatId: activeViewKey,
    atBottom,
    onAdded: ({ added, messageId, fromEvent }) => {
      scrollDiag.logEvent('new-below', { added, messageId, fromEvent })
      setNewBelow(n => n + added)
    },
    onSkip: (info) => scrollDiag.logEvent('new-below-skip', info),
  })

  // v0.91.3: сброс newBelow когда сервер подтвердил «всё прочитано» (unreadCount=0).
  // Без этого: накопленный newBelow висел как «↓ 200» при server-side unread=0
  // (рассинхрон бейджа списка и кнопки в углу чата). Поведение Telegram Desktop:
  // если сервер сказал «прочитано» — кнопка прячется.
  useEffect(() => {
    if (activeUnread === 0 && newBelow > 0) {
      scrollDiag.logEvent('new-below-reset', { reason: 'unread-cleared', prev: newBelow })
      setNewBelow(0)
    }
  }, [activeUnread])

  // v0.87.34: FORCE mark-read когда юзер в самом низу
  useForceReadAtBottom({
    atBottom, activeChatId: activeViewKey, activeMessages, activeUnread,
    markRead: markReadCurrentView,
    maxEverSentRef,
  })

  // v0.87.35: «к последнему непрочитанному» (Telegram-style).
  // v0.95.6: кнопка ↓ — Telegram-style: ВСЕГДА в самый низ. Не возвращает к firstUnread
  // (старое поведение было сбивающим — юзер пролистал unread, кнопка возвращала к уже
  // прочитанному; см. Telegram bug.telegram.org/c/5792).
  // - delta > 5 × viewport → behavior: 'instant' (нет 10-сек smooth-анимации при unread=619)
  // - delta меньше → behavior: 'smooth'
  // - mark-read до lastMessageId (счётчик сразу 0)
  // - setAtBottom(true), setNewBelow(0), сохранение позиции — как в старом scrollToAbsoluteBottom.
  // Удалены: scrollToAbsoluteBottom, handleScrollButtonClick (220мс double-click timer),
  // handleScrollButtonDoubleClick — больше не нужны (один клик = один результат).
  // v0.95.9: пользователь жмёт ↓ "хочу в самый низ". Mark-intent ref сохраняется
  // на 4 секунды — пока активен, useEffect ниже отслеживает scrollHeight и при
  // дозагрузке load-newer повторно прокручивает к низу (юзер видит loading-pulse
  // на кнопке + продолжение скролла без дёрга).
  const scrollIntentRef = useRef({ active: false, expiresAt: 0 })

  const scrollToBottom = () => {
    const el = msgsScrollRef.current
    if (!el) return
    const deltaPx = el.scrollHeight - el.scrollTop - el.clientHeight
    const behavior = computeScrollBehavior(deltaPx, el.clientHeight)
    scrollDiag.logEvent('button-scroll-bottom', {
      activeUnread, deltaPx, behavior, messages: activeMessages.length,
    })
    el.scrollTo({ top: el.scrollHeight, behavior })
    // v0.95.9: ставим intent. expiresAt 4s — этого достаточно для нескольких load-newer
    // батчей при unread > загруженного. Reset при user-scroll (см. useEffect ниже).
    scrollIntentRef.current = { active: true, expiresAt: Date.now() + 4000 }
    const viewKey = activeViewKey || store.activeChatId
    if (viewKey) scrollPosByChatRef.current.set(viewKey, { scrollTop: el.scrollHeight, atBottom: true })
    setAtBottom(true)
    setNewBelow(0)
    const lastMsg = activeMessages[activeMessages.length - 1]
    const lastId = Number(lastMsg?.id) || 0
    if (lastId > 0 && activeUnread > 0 && lastId > (maxEverSentRef.current || 0)) {
      maxEverSentRef.current = lastId
      markReadCurrentView(viewKey, lastId, { source: 'button-scroll' })
    }
  }

  // v0.95.9: после клика ↓ продолжаем скролл вниз когда подгружается новое окно
  // (load-newer). Без этого юзер видит дёрг: scroll встал, появилось "Загружаю ещё...",
  // 100 сообщений добавились но scroll не сдвинулся. Теперь — autoscroll после load.
  useLayoutEffect(() => {
    const intent = scrollIntentRef.current
    if (!intent.active) return
    if (Date.now() > intent.expiresAt) {
      scrollIntentRef.current = { active: false, expiresAt: 0 }
      return
    }
    const el = msgsScrollRef.current
    if (!el) return
    const bottomGap = el.scrollHeight - el.scrollTop - el.clientHeight
    // Если ещё не у низа после load-newer → довинтить мгновенно
    if (bottomGap > 4) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
    }
    // Если loading закончился и мы внизу — снимаем intent
    if (!loadingNewer && bottomGap <= 4) {
      scrollIntentRef.current = { active: false, expiresAt: 0 }
    }
  }, [activeMessages.length, loadingNewer])

  // v0.87.27: клик по reply-цитате — скроллим к оригиналу + 1.5с жёлтое мерцание.
  // v0.89.0: при виртуализации reply-target может быть вне видимого DOM →
  // fallback на scrollToRow по индексу renderItems. После того как row станет
  // видим, повторно ищем DOM-элемент и подсвечиваем.
  const scrollToMessage = (msgId) => {
    const el = msgsScrollRef.current?.querySelector(`[data-msg-id="${msgId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('native-msg-flash')
      setTimeout(() => el.classList.remove('native-msg-flash'), 1500)
      return
    }
    // v0.89.0: виртуализация — пробуем найти через renderItems и scrollToRow
    if (scrollToVirtualRow(msgId, 'center')) {
      // После асинхронного scroll'а react-window смонтирует row → подсветим.
      setTimeout(() => {
        const found = msgsScrollRef.current?.querySelector(`[data-msg-id="${msgId}"]`)
        if (found) {
          found.classList.add('native-msg-flash')
          setTimeout(() => found.classList.remove('native-msg-flash'), 1500)
        }
      }, 200)
      return
    }
    showToast('Исходное сообщение не загружено — прокрутите вверх', 'info')
  }

  // v0.87.36: action-handlers (delete/forward/pin) — вынесено в хук
  const { handleDelete, handleForward, handleForwardSelect, handlePin } = useMessageActions({
    store, setForwardTarget, setPinnedMsg, showToast, forwardTarget,
  })

  const handleReplySend = async () => {
    // v0.87.55: логи + error-toast для "ввёл текст → Отпр. → ничего"
    if (!input.trim() || sending) {
      scrollDiag.logEvent('send-skip', { hasText: !!input.trim(), sending, chatId: store.activeChatId })
      return
    }
    if (activeChat?.isForum) {
      scrollDiag.logEvent('send-skip-forum-topic-readonly', { chatId: store.activeChatId, topicId: activeTopic?.id })
      showToast('Отправка в темы будет следующим этапом', 'info')
      return
    }
    setSending(true)
    const text = input.trim()
    setInput('')
    // v0.87.61: диагностика скролла ДО отправки
    const scrollElBefore = msgsScrollRef.current
    const before = scrollElBefore ? {
      top: scrollElBefore.scrollTop, height: scrollElBefore.scrollHeight,
      client: scrollElBefore.clientHeight,
      bottomGap: scrollElBefore.scrollHeight - scrollElBefore.scrollTop - scrollElBefore.clientHeight,
    } : null
    scrollDiag.logEvent('send-start', {
      chatId: store.activeChatId, len: text.length,
      isEdit: !!editTarget, replyTo: replyTo?.id, scrollBefore: before,
    })
    try {
      let result
      if (editTarget) {
        result = await store.editMessage(store.activeChatId, editTarget.id, text)
        setEditTarget(null)
      } else {
        result = await store.sendMessage(store.activeChatId, text, replyTo?.id)
        setReplyTo(null)
      }
      scrollDiag.logEvent('send-result', { ok: result?.ok, messageId: result?.messageId, error: result?.error })
      if (!result?.ok) {
        showToast(`Ошибка отправки: ${result?.error || 'неизвестно'}`, 'error')
        setInput(text)  // возвращаем текст в поле
      } else {
        // v0.87.65: smooth scroll после отправки
        setTimeout(() => {
          const el = msgsScrollRef.current
          if (!el) return
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
          scrollDiag.logEvent('send-scroll-done', {
            top: el.scrollTop, height: el.scrollHeight,
            bottomGap: el.scrollHeight - el.scrollTop - el.clientHeight,
          })
        }, 50)
      }
    } catch (e) {
      scrollDiag.logEvent('send-throw', { error: e?.message, name: e?.constructor?.name })
      showToast(`Сбой отправки: ${e?.message || e}`, 'error')
      setInput(text)
    } finally { setSending(false) }
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Левая колонка: поиск + список чатов → InboxChatListSidebar (v0.87.83) */}
      <InboxChatListSidebar
        store={store}
        activeAccountChats={activeAccountChats}
        search={search} setSearch={setSearch}
        listHeight={listHeight} setListHeight={setListHeight}
        hoveredAccountId={hoveredAccountId}
        width={chatListWidth}
        compact={chatListCompact}
        panelRef={chatListPanelRef}
        isResizing={isResizingChatList}
      />
      {/* v0.95.7: drag-to-resize divider между chat-list и окном чата */}
      <ChatListResizeHandle
        onPointerDown={startChatListResize}
        onPointerMove={onChatListPointerMove}
        onPointerUp={onChatListPointerUp}
        onDoubleClick={resetChatListWidth}
        isResizing={isResizingChatList}
      />
      {/* Глобальный overlay поверх ВСЕГО окна во время drag — pointerup не застрянет
          в дочерних webview/iframe (см. App.jsx data-cc-resize-overlay паттерн). */}
      {isResizingChatList && (
        <div
          data-cc-chat-list-resize-overlay="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 999998,
            cursor: 'col-resize', userSelect: 'none',
          }}
        />
      )}

      {/* Окно чата → InboxChatPanel (v0.87.103) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* v0.87.108: переключатель режимов перенесён в шапку правой панели */}
        {modes && (
          <div style={{
            height: 48, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            padding: '0 16px',
            borderBottom: '1px solid var(--amoled-border)',
            background: 'var(--amoled-surface)', flexShrink: 0, gap: 4,
          }}>
            {modes.map(m => (
              <button
                key={m.id}
                className={`native-mode-switcher__btn ${store.mode === m.id ? 'native-mode-switcher__btn--active' : ''}`}
                onClick={() => store.setMode(m.id)}
              >{m.label}</button>
            ))}
          </div>
        )}
        <InboxChatPanel
          store={store} activeChat={activeChat} activeTopic={activeTopic} activeMessages={activeMessages}
          activeUnread={activeUnread} visibleMessages={visibleMessages} renderItems={renderItems}
          loadingNewer={loadingNewer}
          isTyping={isTyping} messagesLoading={!!store.loadingMessages?.[activeMessageKey]}
          pinnedMsg={pinnedMsg} setPinnedMsg={setPinnedMsg}
          showMsgSearch={showMsgSearch} setShowMsgSearch={setShowMsgSearch}
          msgSearch={msgSearch} setMsgSearch={setMsgSearch}
          input={input} setInput={setInput} sending={sending}
          replyTo={replyTo} setReplyTo={setReplyTo}
          editTarget={editTarget} setEditTarget={setEditTarget}
          handleInputChange={handleInputChange} handleReplySend={handleReplySend} handlePaste={handlePaste}
          msgsScrollRef={msgsScrollRef} virtualListRef={virtualListRef} handleScroll={handleScroll} scrollDiag={scrollDiag}
          dragOver={dragOver} handleDragOver={handleDragOver} handleDragLeave={handleDragLeave} handleDrop={handleDrop}
          chatReady={chatReady} atBottom={atBottom} newBelow={newBelow}
          scrollToBottom={scrollToBottom} scrollToMessage={scrollToMessage}
          handleDelete={handleDelete} handleForward={handleForward} handlePin={handlePin}
          openPhotoWindow={openPhotoWindow} getMessage={getMessage} readByVisibility={readByVisibility}
        />
      </div>
      {/* v0.87.17: forward-модалка */}
      {forwardTarget && (
        <ForwardPicker
          chats={store.chats.filter(c => c.id !== store.activeChatId)}
          onSelect={handleForwardSelect}
          onClose={() => setForwardTarget(null)}
        />
      )}
      {/* v0.87.17: toast */}
      {toast && (
        <div className={`native-toast native-toast--${toast.type}`}>{toast.message}</div>
      )}
    </div>
  )
}
