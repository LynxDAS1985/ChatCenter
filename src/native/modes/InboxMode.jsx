// v0.87.12: Режим «Чаты» (Inbox) с виртуальным скроллом, поиском, иконками типов.
// v0.87.27: photoViewer, scroll-to-reply, «новые сообщения» divider, Ctrl+↑ edit.
// v0.87.83 — Refactored: 4 блока вынесены в hooks/components.
// v0.87.103 — JSX окна чата вынесен в InboxChatPanel.jsx (~210 строк).
import { useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback } from 'react'
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
import { smoothScrollTo } from '../utils/smoothScroll.js'
import { computeJumpToEndGate } from '../utils/jumpToEndGate.js'
import useChatListResize, {
  CHAT_LIST_DEFAULT_WIDTH, clampChatListWidth, isChatListCompact,
} from '../hooks/useChatListResize.js'
import { useStickyBottomOnMedia } from '../hooks/useStickyBottomOnMedia.js'
import ChatListResizeHandle from '../components/ChatListResizeHandle.jsx'
import ThemePickerModal from '../components/ThemePickerModal.jsx'
import { loadScrollPositions, computeScrollAnchor } from '../utils/scrollPositionsCache.js'
import { useScrollPositionAutosave } from '../hooks/useScrollPositionAutosave.js'
import { loadTheme } from '../utils/themeColor.js'
import { formatTypingUsers } from '../utils/formatTypingUsers.js'
import { loadCurrentSearch, saveCurrentSearch, addToHistory } from '../utils/searchHistory.js'
import { useFileAttach } from '../hooks/useFileAttach.js'
// v1.1.9: дублирующий локальный topicMessageKey удалён — используем общий из nativeStoreHelpers.
import { topicMessageKey } from '../store/nativeStoreHelpers.js'
// v1.1.9: handleAttachSend вынесен в utils/inboxAttachSend.js (~36 строк).
import { runAttachSend } from '../utils/inboxAttachSend.js'
// v1.2.138: ЛОКАЛЬНЫЕ закрепления чатов (только у нас, не в Telegram — у нас лимита нет).
import { loadPinnedIds, savePinnedIds, togglePinnedId, filterSortChats } from '../store/pinnedChats.js'
import { effectiveVisibleAccountIds } from '../store/accountFilter.js' // v1.2.163/169: фильтр аккаунтов (множественный + соло + страховка)

try { window.__ccStartupMark?.('module:InboxMode', 'module evaluated') } catch {}

export default function InboxMode({ store, hoveredAccountId, modes }) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  // v0.95.42: восстанавливаем последний поисковый запрос при mount.
  // Сохранение делается в InboxChatListSidebar (debounced) + при Enter в history.
  const [search, setSearch] = useState(() => loadCurrentSearch())
  // Save при изменении (debounced 300мс — не на каждое нажатие)
  useEffect(() => {
    const t = setTimeout(() => saveCurrentSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])
  // При Enter добавляем в историю — обработчик прокидывается в Sidebar.
  const handleSearchCommit = (query) => { addToHistory(query) }
  // v1.2.138: локальные закрепления чатов. Храним список chat.id в localStorage.
  // pinnedSet используется и для сортировки, и для значка/полоски в списке.
  const [pinnedIds, setPinnedIds] = useState(() => loadPinnedIds())
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])
  const handleTogglePin = useCallback((chatId) => {
    setPinnedIds(prev => {
      const next = togglePinnedId(prev, chatId)
      savePinnedIds(next)
      return next
    })
  }, [])
  // v1.2.156 (TODO-20): перетаскивание закреплённых для ручного порядка. fromId бросили
  // на toId → fromId встаёт перед toId. Если порядок не изменился — не пишем/не ре-рендерим.
  // v1.2.140: авто-чистка «осиротевших» закреплений УБРАНА (теряла данные — см.
  // shared/pinnedChats.js и [[code-todo]] TODO-21). Осиротевшие пины безвредны.
  const [listHeight, setListHeight] = useState(600)
  // v0.95.30: модалка выбора цвета bubble (🎨). Открывается из header.
  const [themePickerOpen, setThemePickerOpen] = useState(false)

  // v0.95.43: скрепка — выбор файлов, превью с caption, отправка альбомом.
  // useFileAttach управляет state (files / caption / sending). Обработчик
  // отправки делает invoke tg:send-file (для 1 файла) или tg:send-album (2+).
  const attach = useFileAttach()
  // v1.2.198: overrideFile — повёрнутая копия из PhotoSendModal (см. runAttachSend). Событие
  // клика (из FilePreviewBar onClick=onSend) не является File → runAttachSend его игнорирует.
  const handleAttachSend = (overrideFile, sendOpts) => runAttachSend({ store, attach, replyTo, showToast, setReplyTo, overrideFile, sendOpts })
  const [activeThemeId, setActiveThemeId] = useState(() => loadTheme().id)
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
  // v1.2.393: заставка первой загрузки списка чатов. false = ещё грузим (показываем заставку),
  // true = полный батч пришёл (или сработала страховка) → показываем готовый список разом.
  const [chatsFirstLoadDone, setChatsFirstLoadDone] = useState(false)
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
  // v1.2.393: держим заставку до РЕЗОЛВА loadChats (полный батч чатов). Страховка 15с —
  // если сети нет и loadChats не вернётся, всё равно откроем список (что успело подгрузиться).
  useEffect(() => {
    if (store.accounts.length === 0) return
    let cancelled = false
    const safety = setTimeout(() => {
      if (cancelled) return
      // v1.2.394: страховка сработала = loadChats не вернулся за 15с (нет сети/завис) — это важное
      // событие, пишем в журнал, чтобы при жалобе «долго висит заставка» было видно причину.
      try { window.api?.send?.('app:log', { level: 'WARN', message: '[chatload] страховка 15с — loadChats не завершился, открываю список принудительно' }) } catch (_) {}
      setChatsFirstLoadDone(true)
    }, 15000)
    store.loadChats().finally(() => { if (!cancelled) { clearTimeout(safety); setChatsFirstLoadDone(true) } })
    return () => { cancelled = true; clearTimeout(safety) }
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

  // v0.87.105 (ADR-016): единая лента всех аккаунтов.
  // v1.2.163 (ADR-026): фильтр аккаунтов — множественный выбор + «соло» (заменил одиночный
  // chatFilter). Сначала отсеиваем чаты СКРЫТЫХ аккаунтов (или показываем только соло-аккаунт),
  // затем поиск + сортировка «закреплённые наверх» через filterSortChats (filter:'all').
  const activeAccountChats = useMemo(() => {
    // v1.2.169 (страховка): набор видимых аккаунтов НИКОГДА не пуст, когда аккаунты есть
    // (если все скрыты/скрытие залипло — показываем всех) → список не «зависает» пустым.
    const visibleAccs = new Set(effectiveVisibleAccountIds((store.accounts || []).map(a => a.id), store.hiddenAccountIds, store.soloAccountId))
    const visible = store.chats.filter(c => visibleAccs.has(c.accountId))
    return filterSortChats(visible, { filter: 'all', query: search, pinnedIds })
  }, [store.chats, store.accounts, store.hiddenAccountIds, store.soloAccountId, search, pinnedIds])

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

  // v0.95.31: множественный typing — Map<userId, {senderName, at}> → строка
  // «Иван и Маша печатают...». formatTypingUsers сам отфильтровывает истёкшие (>6.5с).
  const typingMap = store.typing?.[store.activeChatId]
  const typingText = formatTypingUsers(typingMap)
  const isTyping = !!typingText  // backward-compat для остальных потребителей

  // v0.87.15: reply / edit / search / scroll-up
  const [replyTo, setReplyTo] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [msgSearch, setMsgSearch] = useState('')
  const [showMsgSearch, setShowMsgSearch] = useState(false)
  const msgsScrollRef = useRef(null)
  // v0.95.40: ref для useStickyBottomOnMedia. Объявлен ЗДЕСЬ (до использования
  // в хуке ниже) — value синхронизируется через useEffect когда state
  // physicallyAtBottom меняется (см. ниже). Изначально false.
  const physicallyAtBottomRef = useRef(false)
  // v0.95.40: удерживает scroll у низа при lazy-load медиа (картинки/видео
  // расширяют scrollHeight ПОСЛЕ auto-scroll → юзер визуально выше низа).
  // Эталон: Telegram Web K ResizeObserver на scrollContainer + scrollToEnd.
  useStickyBottomOnMedia(msgsScrollRef, physicallyAtBottomRef)
  // v0.89.0: imperative API виртуализации react-window (scrollToRow, get element).
  // Используется как fallback когда querySelector('[data-msg-id]') промахивается
  // (элемент не в видимом виртуальном DOM).
  const virtualListRef = useRef(null)
  const loadingOlderRef = useRef(false)
  // v0.94.2: якорь для re-pin после load-older prepend (см. useLayoutEffect ниже).
  const prependAnchorRef = useRef(null)
  // v1.2.189: якорь для компенсации сдвига от разделителя «Новые сообщения» (см. useLayoutEffect ниже).
  const unreadDividerAnchorRef = useRef(null)
  // v0.88.0: prefetch новых сообщений вниз (Telegram-style infinite scroll).
  // loadingNewerRef — guard от параллельных запросов, [loadingNewer, setLoadingNewer] — для UI индикатора.
  const loadingNewerRef = useRef(false)
  const [loadingNewer, setLoadingNewer] = useState(false)
  // v1.2.188: автосейв позиции ПОСЛЕ объявления loadingNewerRef/loadingOlderRef —
  // churn guard (не сохраняем пока идёт догрузка окна, см. сагу скролла, корень ①).
  useScrollPositionAutosave({ activeViewKey, chatReady, msgsScrollRef, scrollPosByChatRef, isRestoringRef, loadingNewerRef, loadingOlderRef })  // v0.91.17 + v0.92.4 + v1.2.188

  // v0.87.17: forward-модалка + тост + закреплённое
  const [forwardTarget, setForwardTarget] = useState(null)
  const [toast, setToast] = useState(null)
  const [pinnedMsg, setPinnedMsg] = useState(null)

  // v0.87.28: scroll-to-bottom + первый непрочитанный
  // v0.87.44: default false! Иначе useForceReadAtBottom срабатывал СРАЗУ при открытии
  // → сервер возвращал unread=1 вместо 7. Баг «было 7, стало 1 за секунду».
  const [atBottom, setAtBottom] = useState(false)
  // v0.95.28: physically at bottom (bottomGap ≤ 30, БЕЗ Schmitt-trigger).
  // Используется для Telegram-style auto-scroll к новому сообщению + счётчик ↓N
  // без «слепой зоны» 40-120px. Schmitt-trigger (atBottom выше) остаётся для UI
  // визуала кнопки ↓ (стабильность от дребезга, фикс v0.95.2).
  const [physicallyAtBottom, setPhysicallyAtBottom] = useState(false)
  // v0.95.40: sync state → ref для useStickyBottomOnMedia (ref объявлен выше,
  // до хука useStickyBottomOnMedia). ResizeObserver читает свежее значение
  // БЕЗ переподписки. State не годится — useEffect перевешивал бы ResizeObserver.
  useEffect(() => { physicallyAtBottomRef.current = physicallyAtBottom }, [physicallyAtBottom])
  const [newBelow, setNewBelow] = useState(0)
  // v0.95.36: guard от двойного auto-scroll. Обновляется и в onAutoScroll
  // (incoming + outgoing-from-other-device), и в send-scroll-done (свой sendMessage).
  // Если разница < 600мс — пропускаем повторный scroll.
  const lastAutoScrollAtRef = useRef(0)
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
  // v0.94.0: useInitialScroll переписан под обычный DOM — restore через el.scrollTop.
  // v1.2.186: getSavedScrollTop отдаёт {anchorMsgId, screenTop, atBottom} (якорь по сообщению).
  // onDone → setChatReady(true).
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
    // v1.2.189: разделитель «Новые сообщения» (messageGrouping) вставляется ВЫШЕ первого
    // непрочитанного, а firstUnreadId приходит null→value АСИНХРОННО уже ПОСЛЕ restore →
    // толкает сохранённый якорь вниз на высоту разделителя (~46px), место «уползает» при
    // каждом заходе (сага скролла, канал «Кинотеатр»). Захватываем верхнее видимое
    // сообщение ДО вставки; useLayoutEffect ниже вернёт его на тот же пиксель ПОСЛЕ вставки.
    if (firstUnreadIdRef.current == null && nextFirstUnreadId != null) {
      const el = msgsScrollRef.current
      const a = el ? computeScrollAnchor(el) : null
      if (a?.anchorMsgId) unreadDividerAnchorRef.current = { msgId: a.anchorMsgId, screenTop: a.screenTop }
    }
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
    // v1.2.198: вставка/перетаскивание фото ведут в превью-окно (attach), а не мгновенно
    // отправляют. Раньше handlePaste/handleDrop слали сразу мимо окна PhotoSendModal.
    activeChatId: store.activeChatId, addFiles: attach.addFiles, showToast,
  })

  // v0.87.83: handleScroll → useInboxScroll hook.
  // v0.94.0: load-older/load-newer вернулись в handleScroll (DOM scrollTop триггеры).
  const { handleScroll } = useInboxScroll({
    store, scrollKey: activeViewKey, activeMessages, activeUnread, chatReady,
    msgsScrollRef, scrollPosByChatRef, initialScrollDoneRef, loadingOlderRef,
    loadingNewerRef, setLoadingNewer,
    scrollDiag, setAtBottom, setNewBelow,
    setPhysicallyAtBottom,  // v0.95.28: physical (без Schmitt) для auto-scroll + ↓N
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

  // v1.2.189: КОМПЕНСАЦИЯ сдвига от разделителя «Новые сообщения». Тот же приём, что
  // load-older re-pin выше (overflow-anchor:none — держим позицию сами). Разделитель
  // встаёт ВЫШЕ первого непрочитанного асинхронно (firstUnreadId null→value) уже ПОСЛЕ
  // restore → толкает якорь вниз на ~46px. Здесь, после вставки (useLayoutEffect = до
  // paint, без мигания), возвращаем захваченное верхнее сообщение на тот же пиксель.
  // Отдельный ref (не prependAnchorRef) — чтобы не мешать компенсации load-older.
  // Одноразово: ref очищается на каждый вызов (не «залипает»).
  useLayoutEffect(() => {
    const cap = unreadDividerAnchorRef.current
    unreadDividerAnchorRef.current = null
    if (!cap) return
    const el = msgsScrollRef.current
    if (!el) return
    const target = el.querySelector(`[data-msg-id="${cap.msgId}"]`)
    if (!target) return  // якорь ещё не отрисован
    const newScreenTop = target.getBoundingClientRect().top - el.getBoundingClientRect().top
    const diff = newScreenTop - cap.screenTop
    // diff > 0 → разделитель добавлен ВЫШЕ якоря (сдвиг вниз) → возвращаем на место.
    // diff ≈ 0 → якорь был выше разделителя, сдвига нет → ничего не трогаем.
    if (diff > 0.5) {
      el.scrollTop += diff
      logNativeScroll('unread-divider-compensate', { msgId: cap.msgId, diff: Math.round(diff) })
    }
  }, [firstUnreadId])

  // v0.91.3: event-based newBelow — подписка на tg:new-message (server push),
  // вместо отслеживания массива. См. useNewBelowCounter.js (полная история бага).
  // v0.95.28: atBottom теперь PHYSICAL (≤30px, без Schmitt-trigger) — счётчик ↓N
  // больше не «пропадает» в зоне 40-120px (старая слепая зона Schmitt-trigger).
  // Если physicallyAtBottom=true + incoming → onAutoScroll вместо инкремента
  // счётчика (Telegram-style: юзер у низа → плавная прокрутка к новому).
  useNewBelowCounter({
    activeChatId: activeViewKey,
    atBottom: physicallyAtBottom,
    onAdded: ({ added, messageId, fromEvent, isOutgoing, isSending }) => {
      // v0.95.37: диагностируем счётчик ↓N для outgoing-from-other-device.
      const fromOtherDevice = !!isOutgoing && !isSending
      scrollDiag.logEvent('new-below', { added, messageId, fromEvent, fromOtherDevice })
      setNewBelow(n => n + added)
    },
    onSkip: (info) => scrollDiag.logEvent('new-below-skip', info),
    // v0.95.28: Telegram-style auto-scroll. Юзер у низа + новое incoming → плавная
    // прокрутка к нему. Эталоны: Telegram Web K (bubbles.ts isAtBottom + scrollToEnd),
    // Telegram Desktop (history_widget.cpp scrollTop >= scrollTopMax - X → scrollToEnd).
    // requestAnimationFrame — даём React закоммитить новое сообщение в DOM до scroll.
    onAutoScroll: ({ messageId, isOutgoing, isSending }) => {
      // v0.95.36: guard от двойного scroll. Если handleReplySend только что
      // сделал `send-scroll-done` (свой sendMessage), и одновременно пришло
      // outgoing-from-other-device → 2 scroll за <600мс. Защита: дедуп через
      // lastAutoScrollAtRef. 600мс — достаточно для завершения предыдущей
      // smoothScrollTo (250мс) + reserve. Не блокирует следующий incoming.
      const now = Date.now()
      if (now - lastAutoScrollAtRef.current < 600) {
        scrollDiag.logEvent('auto-scroll-skip-recent', { messageId, sinceLastMs: now - lastAutoScrollAtRef.current })
        return
      }
      lastAutoScrollAtRef.current = now
      const fromOtherDevice = !!isOutgoing && !isSending
      const startTs = Date.now()
      scrollDiag.logEvent('auto-scroll-new-message', { messageId, fromOtherDevice })
      // v0.95.39: УБРАН twoPhase + duration 250→350мс + requestAnimationFrame × 2.
      // Юзер видел дёрганье — корни:
      // (1) twoPhase делает INSTANT prelude (`el.scrollTop = preludeTarget`) когда
      //     distance > 1 viewport (бывает на больших bubble с reply-цитатой+медиа).
      //     Это правильно для jump-to-end из далека, но НЕ для auto-scroll к новому
      //     (там atBottom=true → distance мал, prelude не нужен и вреден — даёт рывок).
      // (2) Одиночный rAF — React commit мог НЕ завершиться → scrollHeight «старый» →
      //     scroll к неверной цели → визуальное смещение. RAF×2 гарантирует
      //     layout + первый paint.
      // (3) 250мс мало для distance 200+px (большой bubble с медиа). 350мс — стандарт
      //     Telegram Web K bubbles.ts scrollToEnd, Telegram Desktop _scrollDown.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = msgsScrollRef.current
          if (!el) return
          // v0.95.40: distance + onComplete для метрики реальной длительности.
          // distance — фактическая дельта (показывает был ли scroll промахом из-за
          // несвоевременного scrollHeight). actualMs — реальное время анимации
          // (с учётом prefers-reduced-motion = ~0мс).
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight
          try {
            smoothScrollTo(el, el.scrollHeight, {
              duration: 350,
              onComplete: () => {
                scrollDiag.logEvent('auto-scroll-completed', {
                  messageId,
                  distance,
                  actualMs: Date.now() - startTs,
                  finalBottomGap: el.scrollHeight - el.scrollTop - el.clientHeight,
                })
              },
            })
          } catch (_) {}
        })
      })
    },
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
  const scrollToBottom = () => {
    const el = msgsScrollRef.current
    if (!el) return
    const viewKey = activeViewKey || store.activeChatId
    const deltaPx = el.scrollHeight - el.scrollTop - el.clientHeight
    const behavior = computeScrollBehavior(deltaPx, el.clientHeight)
    // v0.95.11 диагностика: gap между chat.lastMessageId (сервер) и activeMessages[last] (DOM).
    const loadedIncoming = activeMessages.filter(m => !m.isOutgoing).length
    const chatObj = store.chats.find(c => c.id === viewKey)
    const chatLastMessageId = chatObj?.lastMessageId || null
    const loadedLastMsg = activeMessages[activeMessages.length - 1]
    const loadedLastId = loadedLastMsg?.id ? String(loadedLastMsg.id) : null
    const MSG_ID_STEP = 1048576
    const gapMessages = (chatLastMessageId && loadedLastId)
      ? Math.round((Number(chatLastMessageId) - Number(loadedLastId)) / MSG_ID_STEP)
      : null
    const unreadVsLoaded = activeUnread - loadedIncoming
    // v0.95.20: гейт «грузить-потом-скроллить» — computeJumpToEndGate.
    // Раньше (v0.95.12-v0.95.19): `unreadVsLoaded > 50`. Если у юзера 10 непрочитанных
    // но они в 200 сообщениях от загруженного окна — fallback прыгал сразу, сообщения
    // дописывались после («эффект появления»). Теперь — любой gap → load-first.
    // Эталон: Telegram Desktop `_history->isReadyFor()` перед scroll.
    const isForumTopic = !!(activeChat?.isForum && activeTopic)
    const topicLastMessageId = isForumTopic ? (activeTopic.lastMessageId || null) : null
    const effectiveLastMessageId = isForumTopic ? topicLastMessageId : chatLastMessageId
    const loading = !!store.loadingMessages?.[viewKey]
    const shouldLoadFirst = computeJumpToEndGate({
      lastMessageId: effectiveLastMessageId,
      gapMessages,
      loading,
    })
    scrollDiag.logEvent('button-scroll-bottom', {
      activeUnread, deltaPx, behavior, messages: activeMessages.length,
      loadedIncoming, chatLastMessageId, loadedLastId, gapMessages, unreadVsLoaded,
      branch: shouldLoadFirst ? 'load-first' : 'direct-scroll',
      isForumTopic, effectiveLastMessageId, loading,
    })

    // v0.95.12-v0.95.16: JUMP-TO-END через ИТЕРАТИВНЫЙ fetch.
    // См. .memory-bank/jump-to-end-saga.md — полная история v0.95.12-15 + v0.95.16 форумы.
    // TDLib `getChatHistory` / `getMessageThreadHistory` возвращают меньше limit
    // (issue #740, ответ levlam). Решение — итерации до untilMessageId.
    // v0.95.15: store.loadMessagesUntil для обычных чатов.
    // v0.95.16: store.loadTopicMessagesUntil для форум-топиков (getMessageThreadHistory)
    //   + smoothScroll с easeOutCubic для красивого «приземления».
    if (shouldLoadFirst) {
      scrollDiag.logEvent('button-scroll-jump-to-end', {
        chatLastMessageId, topicLastMessageId,
        effectiveLastMessageId, isForumTopic,
        loadedLastId, gapMessages, unreadVsLoaded,
        loadedIncoming, activeUnread,
      })
      const loadPromise = isForumTopic
        ? store.loadTopicMessagesUntil(store.activeChatId, activeTopic, effectiveLastMessageId, 100)
        : store.loadMessagesUntil(viewKey, effectiveLastMessageId, 100)
      loadPromise.then((result) => {
        // rAF×2 — React commit + первый paint завершились → scrollHeight точный.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const elNow = msgsScrollRef.current
            if (!elNow) return
            // v0.95.16: smoothScroll с easeOutCubic (быстрый разгон + плавное приземление).
            // v0.95.18: ДВУХФАЗНЫЙ режим (twoPhase:true). При distance > 1 viewport —
            // instant prelude к (target-viewport) + smooth последний viewport.
            // Юзер видит «приземление» ленты ВСЕГДА, независимо от distance
            // (jump-to-end после reload часто даёт 50+ viewport, без twoPhase
            // smoothScroll fallback на instant и юзер не видит анимацию).
            smoothScrollTo(elNow, elNow.scrollHeight, {
              duration: 350,
              twoPhase: true,
              onComplete: () => {
                if (viewKey) scrollPosByChatRef.current.set(viewKey, {
                  anchorMsgId: null, screenTop: 0, atBottom: true,  // v1.2.186: в конце — якорь не нужен
                })
                setAtBottom(true)
                setNewBelow(0)
                const lastIdNum = Number(effectiveLastMessageId) || 0
                if (lastIdNum > 0 && lastIdNum > (maxEverSentRef.current || 0)) {
                  maxEverSentRef.current = lastIdNum
                  markReadCurrentView(viewKey, lastIdNum, { source: 'button-scroll' })
                }
                scrollDiag.logEvent('button-scroll-jump-to-end-done', {
                  effectiveLastMessageId, isForumTopic,
                  iterations: result?.iterations || 0,
                  messagesLoaded: result?.messages?.length || 0,
                  scrollTop: elNow.scrollTop, scrollHeight: elNow.scrollHeight,
                })
              },
            })
          })
        })
      }).catch((err) => {
        scrollDiag.logEvent('button-scroll-jump-to-end-error', {
          error: String(err?.message || err),
        })
      })
      return  // ранний выход — fallback ниже не запускается
    }

    // === Обычное поведение (gap маленький ИЛИ нет lastMessageId ИЛИ идёт загрузка) ===
    el.scrollTo({ top: el.scrollHeight, behavior })
    if (viewKey) scrollPosByChatRef.current.set(viewKey, { anchorMsgId: null, screenTop: 0, atBottom: true })  // v1.2.186: в конце
    setAtBottom(true)
    setNewBelow(0)
    const lastMsg = activeMessages[activeMessages.length - 1]
    const lastId = Number(lastMsg?.id) || 0
    if (lastId > 0 && activeUnread > 0 && lastId > (maxEverSentRef.current || 0)) {
      maxEverSentRef.current = lastId
      markReadCurrentView(viewKey, lastId, { source: 'button-scroll' })
    }
  }

  // v0.87.27: клик по reply-цитате — скроллим к оригиналу + 1.5с жёлтое мерцание.
  // v0.89.0: при виртуализации reply-target может быть вне видимого DOM →
  // fallback на scrollToRow по индексу renderItems. После того как row станет
  // видим, повторно ищем DOM-элемент и подсвечиваем.
  const scrollToMessage = (msgId) => {
    const el = msgsScrollRef.current?.querySelector(`[data-msg-id="${msgId}"]`)
    // v0.96.0: упрощённый лог scrollToMessage (v0.95.47 диагностика удалена
    // после фикса в v0.95.48 + v0.96.0). Оставлен короткий WARN если не найдено.
    if (!el && msgsScrollRef.current) {
      try {
        logNativeScroll('scroll-to-message-miss', {
          msgId: String(msgId),
          domNodesWithMsgId: msgsScrollRef.current?.querySelectorAll('[data-msg-id]')?.length || 0,
        })
      } catch (_) {}
    }
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

  // v0.95.46: scroll к конкретному сообщению при клике «→ Перейти к чату» в
  // уведомлении (см. NativeApp.jsx + store.requestScrollToMessage).
  // useEffect срабатывает после: 1) setActiveChat → activeChatId сменился,
  // 2) tg:messages пришло → activeMessages.length > 0. Только тогда scrollToMessage
  // найдёт элемент через querySelector. clearPendingScrollToMessage после scroll
  // защищает от повторного срабатывания при дальнейших ререндерах.
  useEffect(() => {
    const pending = store.pendingScrollToMessage
    // v0.96.0: подробная диагностика v0.95.47 удалена (фикс в v0.95.48 принят).
    if (!pending) return
    if (pending.chatId !== store.activeChatId) return  // юзер переключился — не скроллим чужой чат
    if (!activeMessages || activeMessages.length === 0) return  // ждём загрузки messages
    // Защита от orphan: если timestamp старше 10с — просто очищаем (юзер не дождался).
    if (Date.now() - (pending.ts || 0) > 10000) {
      store.clearPendingScrollToMessage?.()
      return
    }
    // v0.95.48: проверяем — target в загруженном окне? Лог v0.95.47 показал что
    // в 2/3 кликов target был ВНЕ окна (gap ~100-138 сообщений новее загруженного).
    // Эталон Telegram: tdesktop HistoryWidget::showAtMsgId → requestMessagesAround
    // (add_offset=-kMessagesPerPage/2). tweb appImManager.setInnerPeer({lastMsgId})
    // → addOffset=-Math.floor(limit/2). TDLib spec getChatHistory: from=target,
    // offset=-49, limit=100 → 49 newer + target + 50 older (target в середине окна).
    const targetInLoaded = activeMessages.some(m => String(m.id) === String(pending.messageId))
    if (!targetInLoaded) {
      // Если loadMessages aroundId уже звался — toast «не найдено» и clear.
      // Защищает от петли (target удалён / TDLib вернул < limit без target).
      if (pending.loadAttempted) {
        showToast('Сообщение не загружено — прокрутите вверх', 'info')
        store.clearPendingScrollToMessage?.()
        return
      }
      // Грузим окно ВОКРУГ target. force=true bypass IDB cache — нужен server
      // context. addOffset=-49 — стандарт всех 3 клиентов Telegram.
      store.markPendingScrollLoadAttempted?.()
      const viewKey = store.activeForumTopicId
        ? `${store.activeChatId}:${store.activeForumTopicId}`
        : store.activeChatId
      try {
        store.loadMessages?.(viewKey, 100, {
          aroundId: pending.messageId,
          addOffset: -49,
          force: true,
        })
      } catch (_) {}
      return  // useEffect ре-trigger когда tg:messages обновит activeMessages
    }
    // Запускаем scroll с rAF×2 (эталон v0.95.14): React commit + первый paint
    // завершены, scrollHeight точный, узел в DOM, scrollIntoView точно попадёт.
    const t = setTimeout(() => {
      try { scrollToMessage(pending.messageId) } catch (_) {}
      store.clearPendingScrollToMessage?.()
    }, 100)
    return () => clearTimeout(t)
  }, [store.pendingScrollToMessage, store.activeChatId, activeMessages.length])

  // v0.87.36: action-handlers (delete/forward/pin) — вынесено в хук
  const { handleDelete, handleForward, handleForwardSelect, handlePin } = useMessageActions({
    store, setForwardTarget, setPinnedMsg, showToast, forwardTarget,
  })

  const handleReplySend = async (sendOpts = {}) => {
    // v0.95.27: лог источника вызова (keyboard / click / unknown) — для диагностики
    // «двойной отправки». Юзер настаивает что отправил один раз, но в логе 2 send-start
    // с lastUserType=wheel (между ними юзер только скроллил, не нажимал). Нужно
    // понять что вызвало второй handleReplySend. Источник пробрасывается из
    // InboxMessageInput.onKeyDown (keyboard:Enter) или onClick (click:button).
    const callSource = sendOpts?.source || 'unknown'
    // v0.87.55: логи + error-toast для "ввёл текст → Отпр. → ничего"
    if (!input.trim() || sending) {
      scrollDiag.logEvent('send-skip', {
        hasText: !!input.trim(), sending, chatId: store.activeChatId, callSource,
      })
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
    // v0.95.27: расширенная диагностика send-start.
    // - callSource: keyboard:Enter / click:button / unknown (если unknown — кто-то
    //   ещё programmatic вызывал handleReplySend → нужно искать)
    // - textPreview: первые 40 символов (для сопоставления с возможными дублями)
    // - outgoingCount: сколько уже своих сообщений в DOM до отправки
    // - lastOutgoing: время последнего своего сообщения (если оно <2с назад → подозрительно)
    const activeMsgsBeforeSend = store.messages[store.activeChatId] || []
    const outgoingBefore = activeMsgsBeforeSend.filter(m => m.isOutgoing)
    const lastOutgoing = outgoingBefore[outgoingBefore.length - 1]
    const msSinceLastOutgoing = lastOutgoing?.timestamp
      ? Date.now() - Number(lastOutgoing.timestamp)
      : null
    scrollDiag.logEvent('send-start', {
      chatId: store.activeChatId, len: text.length,
      textPreview: text.slice(0, 40),
      isEdit: !!editTarget, replyTo: replyTo?.id, scrollBefore: before,
      callSource,
      outgoingCountBefore: outgoingBefore.length,
      lastOutgoingId: lastOutgoing?.id || null,
      lastOutgoingTextPreview: lastOutgoing?.text?.slice(0, 40) || null,
      msSinceLastOutgoing,
      // Stack trace первой пары фреймов — поможет если callSource=unknown.
      stackHint: (() => { try { return (new Error()).stack?.split('\n').slice(1, 4).join(' | ').slice(0, 300) } catch { return null } })(),
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
      scrollDiag.logEvent('send-result', { ok: result?.ok, messageId: result?.messageId, error: result?.error, callSource })
      if (!result?.ok) {
        showToast(`Ошибка отправки: ${result?.error || 'неизвестно'}`, 'error')
        setInput(text)  // возвращаем текст в поле
      } else {
        // v0.87.65: smooth scroll после отправки
        // v0.95.39: убран twoPhase + duration 250→350мс — единый стиль с onAutoScroll
        // (Telegram Web K bubbles.ts scrollToEnd, Telegram Desktop _scrollDown). twoPhase
        // создавал INSTANT prelude когда сообщение с reply/медиа давало distance >
        // 1 viewport — это и было «дёрганьем» при отправке/получении.
        setTimeout(() => {
          const el = msgsScrollRef.current
          if (!el) return
          lastAutoScrollAtRef.current = Date.now()
          smoothScrollTo(el, el.scrollHeight, { duration: 350 })
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
        chatsLoading={store.accounts.length > 0 && !chatsFirstLoadDone}
        chatsLoadDone={chatsFirstLoadDone}
        search={search} setSearch={setSearch}
        onSearchCommit={handleSearchCommit}
        listHeight={listHeight} setListHeight={setListHeight}
        hoveredAccountId={hoveredAccountId}
        width={chatListWidth}
        compact={chatListCompact}
        panelRef={chatListPanelRef}
        isResizing={isResizingChatList}
        modes={modes}
        pinnedSet={pinnedSet}
        onTogglePin={handleTogglePin}
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
        {/* v1.2.176: 48px-полоса сверху с кнопкой 🎨 УБРАНА — кнопка переехала в шапку
            переписки рядом с 🔍 (onOpenThemePicker). Переписка стала выше на 48px. */}
        <InboxChatPanel
          store={store} activeChat={activeChat} activeTopic={activeTopic} activeMessages={activeMessages}
          activeUnread={activeUnread} visibleMessages={visibleMessages} renderItems={renderItems}
          loadingNewer={loadingNewer}
          isTyping={isTyping} typingText={typingText}
          messagesLoading={!!store.loadingMessages?.[activeMessageKey]}
          pinnedMsg={pinnedMsg} setPinnedMsg={setPinnedMsg}
          showMsgSearch={showMsgSearch} setShowMsgSearch={setShowMsgSearch}
          msgSearch={msgSearch} setMsgSearch={setMsgSearch}
          onOpenThemePicker={() => setThemePickerOpen(true)}
          input={input} setInput={setInput} sending={sending}
          replyTo={replyTo} setReplyTo={setReplyTo}
          editTarget={editTarget} setEditTarget={setEditTarget}
          handleInputChange={handleInputChange} handleReplySend={handleReplySend} handlePaste={handlePaste}
          msgsScrollRef={msgsScrollRef} virtualListRef={virtualListRef} handleScroll={handleScroll} scrollDiag={scrollDiag}
          dragOver={dragOver} handleDragOver={handleDragOver} handleDragLeave={handleDragLeave} handleDrop={handleDrop}
          chatReady={chatReady} atBottom={atBottom} newBelow={newBelow}
          scrollToBottom={scrollToBottom} scrollToMessage={scrollToMessage}
          handleDelete={handleDelete} handleForward={handleForward} handlePin={handlePin}
          onSetReaction={store.setReaction}
          openPhotoWindow={openPhotoWindow} getMessage={getMessage} readByVisibility={readByVisibility}
          attachFiles={attach.files}
          attachCaption={attach.caption}
          attachSending={attach.sending}
          onAttachAdd={attach.addFiles}
          onAttachRemove={attach.removeFile}
          onAttachMove={attach.moveFile}
          onAttachClear={attach.clear}
          onAttachCaptionChange={attach.setCaption}
          onAttachSend={handleAttachSend}
          uploads={store.uploads}
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
      {/* v0.95.30: модалка выбора цветовой темы */}
      {themePickerOpen && (
        <ThemePickerModal
          activeThemeId={activeThemeId}
          onSelect={(id) => setActiveThemeId(id)}
          onClose={() => setThemePickerOpen(false)}
        />
      )}
    </div>
  )
}
