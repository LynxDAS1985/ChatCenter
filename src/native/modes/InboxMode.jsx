// v0.87.12: Режим «Чаты» (Inbox) с виртуальным скроллом, поиском, иконками типов.
// v0.87.27: photoViewer, scroll-to-reply, «новые сообщения» divider, Ctrl+↑ edit.
// v0.87.83 — Refactored: 4 блока вынесены в hooks/components.
// v0.87.103 — JSX окна чата вынесен в InboxChatPanel.jsx (~210 строк).
import { useEffect, useMemo, useState, useRef } from 'react'
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
import { getUnreadAnchorDebug } from '../utils/scrollDiagnostics.js'

export default function InboxMode({ store }) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [listHeight, setListHeight] = useState(600)
  // v0.87.66: chatReady=true только после завершения initial-scroll. Пока false —
  // scroll-container невидим (opacity 0) + MessageListOverlay (shimmer) показан.
  // v0.87.67: shimmer ТОЛЬКО для чатов открываемых ВПЕРВЫЕ. Повторное открытие — мгновенно.
  const [chatReady, setChatReady] = useState(false)
  const seenChatsRef = useRef(new Set())
  // v0.87.70: Map<chatId, scrollTop> — своя позиция для каждого чата (как Telegram Desktop).
  const scrollPosByChatRef = useRef(new Map())

  useEffect(() => { store.loadCachedChats?.() }, [])

  // v0.87.24: window.focus → rescan unread
  useEffect(() => {
    const onFocus = () => { store.rescanUnread?.() }
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
    if (!store.messages[store.activeChatId]) {
      store.loadMessages(store.activeChatId, 50)
    }
    // v0.87.16: НЕ помечаем всё прочитанным при открытии — счётчик уменьшается
    // по мере показа (IntersectionObserver) или scroll в низ.
  }, [store.activeChatId])

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
  const activeMessages = store.messages[store.activeChatId] || []
  // v0.87.45: activeUnread = MTProto-число (альбом=N фото) — для findFirstUnread, markRead, initial-scroll.
  const activeUnread = activeChat?.unreadCount || 0

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
  const loadingOlderRef = useRef(false)

  // v0.87.17: forward-модалка + тост + закреплённое
  const [forwardTarget, setForwardTarget] = useState(null)
  const [toast, setToast] = useState(null)
  const [pinnedMsg, setPinnedMsg] = useState(null)

  // v0.87.28: scroll-to-bottom + первый непрочитанный
  // v0.87.44: default false! Иначе useForceReadAtBottom срабатывал СРАЗУ при открытии
  // → сервер возвращал unread=1 вместо 7. Баг «было 7, стало 1 за секунду».
  const [atBottom, setAtBottom] = useState(false)
  const [newBelow, setNewBelow] = useState(0)
  const firstUnreadIdRef = useRef(null)
  const scrollDiag = useScrollDiagnostics({
    activeChatId: store.activeChatId, activeChat, activeMessages, activeUnread,
    loading: store.loadingMessages?.[store.activeChatId],
    scrollRef: msgsScrollRef,
  })

  // v0.87.29/40: начальный скролл — ПОСЛЕ загрузки свежих данных.
  // v0.87.66: onDone → setChatReady(true). v0.87.67: запоминаем seenChatsRef.
  const { doneRef: initialScrollDoneRef } = useInitialScroll({
    activeChatId: store.activeChatId,
    messagesCount: activeMessages.length,
    scrollRef: msgsScrollRef,
    firstUnreadIdRef, activeUnread,
    loading: store.loadingMessages?.[store.activeChatId],
    onDone: (chatId) => {
      seenChatsRef.current.add(chatId)
      setChatReady(true)
    },
    // v0.87.70: возврат сохранённой позиции (Telegram-style).
    getSavedScrollTop: (chatId) => scrollPosByChatRef.current.get(chatId) ?? null,
  })

  // v0.87.66/67: при смене чата проверяем seenChatsRef — если уже видели, chatReady=true сразу.
  useEffect(() => {
    if (!store.activeChatId) { setChatReady(false); return }
    if (seenChatsRef.current.has(store.activeChatId)) {
      setChatReady(true)
    } else {
      setChatReady(false)
    }
  }, [store.activeChatId])

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
    store.getPinnedMessage?.(store.activeChatId).then(r => {
      if (r?.ok && r.message) setPinnedMsg(r.message)
    })
  }, [store.activeChatId])

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
    () => groupMessages(visibleMessages, firstUnreadIdRef.current),
    [visibleMessages]
  )

  // v0.87.40: пересчёт firstUnread при смене свежих данных (firstId/lastId/unread)
  const firstMsgId = activeMessages[0]?.id
  const lastMsgId = activeMessages[activeMessages.length - 1]?.id
  useEffect(() => {
    if (!store.activeChatId) { firstUnreadIdRef.current = null; return }
    const chat = store.chats.find(c => c.id === store.activeChatId)
    const realUnread = chat?.unreadCount || 0
    // v0.87.40: clamp unread к числу incoming (сервер мог вернуть завышенное)
    const incoming = activeMessages.filter(m => !m.isOutgoing)
    const clampedUnread = Math.min(realUnread, incoming.length)
    firstUnreadIdRef.current = findFirstUnreadId(activeMessages, clampedUnread)
    scrollDiag.logEvent('first-unread-calc', getUnreadAnchorDebug(activeMessages, clampedUnread))
  }, [store.activeChatId, firstMsgId, lastMsgId, activeUnread])

  const getMessage = (chatId, msgId) => (store.messages[chatId] || []).find(m => m.id === String(msgId))

  // v0.87.83: read-by-visibility batch markRead → useReadByVisibility hook.
  // v0.87.37: maxEverSentRef — никогда не уменьшаем watermark.
  const maxEverSentRef = useRef(0)
  const { readByVisibility } = useReadByVisibility({
    activeChatId: store.activeChatId,
    activeUnread, markRead: store.markRead, scrollDiag, maxEverSentRef,
  })

  // v0.87.52: сброс newBelow при смене чата (иначе залипает от прошлого).
  useEffect(() => { setNewBelow(0) }, [store.activeChatId])

  // v0.87.34: drag-n-drop файлов + Ctrl+V картинки
  const { dragOver, handleDragOver, handleDragLeave, handleDrop, handlePaste } = useDropAndPaste({
    activeChatId: store.activeChatId, sendFile: store.sendFile, showToast,
  })

  // v0.87.83: handleScroll → useInboxScroll hook.
  const { handleScroll } = useInboxScroll({
    store, activeMessages, activeUnread, chatReady,
    msgsScrollRef, scrollPosByChatRef, initialScrollDoneRef, loadingOlderRef,
    scrollDiag, setAtBottom, setNewBelow,
  })

  // v0.87.42: newBelow по смене lastMsgId
  useNewBelowCounter({
    messages: activeMessages,
    atBottom, chatId: store.activeChatId,
    onAdded: ({ added, prevLastId, nowLastId }) => {
      scrollDiag.logEvent('new-below', { added, prevLastId, nowLastId })
      setNewBelow(n => n + added)
    },
    onSkip: (info) => scrollDiag.logEvent('new-below-skip', info),
  })

  // v0.87.34: FORCE mark-read когда юзер в самом низу
  useForceReadAtBottom({
    atBottom, activeChatId: store.activeChatId, activeMessages, activeUnread,
    markRead: store.markRead, maxEverSentRef,
  })

  // v0.87.35: «к последнему непрочитанному» (Telegram-style).
  const scrollToBottom = () => {
    const el = msgsScrollRef.current
    if (!el) return
    const firstUnread = firstUnreadIdRef.current
    scrollDiag.logEvent('button-scroll', { activeUnread, firstUnread })
    if (firstUnread) {
      const target = el.querySelector(`[data-msg-id="${firstUnread}"]`)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        scrollDiag.logEvent('button-scroll-target', { firstUnread })
        target.classList.add('native-msg-last-read-highlight')
        setTimeout(() => target.classList.remove('native-msg-last-read-highlight'), 2500)
        setNewBelow(0)
        return
      }
    }
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    scrollDiag.logEvent('button-scroll-bottom', { activeUnread, firstUnread })
    setNewBelow(0)
  }

  // v0.87.27: клик по reply-цитате — скроллим к оригиналу + 1.5с жёлтое мерцание
  const scrollToMessage = (msgId) => {
    const el = msgsScrollRef.current?.querySelector(`[data-msg-id="${msgId}"]`)
    if (!el) { showToast('Исходное сообщение не загружено — прокрутите вверх', 'info'); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('native-msg-flash')
    setTimeout(() => el.classList.remove('native-msg-flash'), 1500)
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
      />

      {/* Окно чата → InboxChatPanel (v0.87.103) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <InboxChatPanel
          store={store} activeChat={activeChat} activeMessages={activeMessages}
          activeUnread={activeUnread} visibleMessages={visibleMessages} renderItems={renderItems}
          isTyping={isTyping}
          pinnedMsg={pinnedMsg} setPinnedMsg={setPinnedMsg}
          showMsgSearch={showMsgSearch} setShowMsgSearch={setShowMsgSearch}
          msgSearch={msgSearch} setMsgSearch={setMsgSearch}
          input={input} setInput={setInput} sending={sending}
          replyTo={replyTo} setReplyTo={setReplyTo}
          editTarget={editTarget} setEditTarget={setEditTarget}
          handleInputChange={handleInputChange} handleReplySend={handleReplySend} handlePaste={handlePaste}
          msgsScrollRef={msgsScrollRef} handleScroll={handleScroll} scrollDiag={scrollDiag}
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
