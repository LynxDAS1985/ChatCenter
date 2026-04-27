// v0.87.12: Режим «Чаты» (Inbox) с виртуальным скроллом, поиском, иконками типов.
// v0.87.27: photoViewer, scroll-to-reply, «новые сообщения» divider, Ctrl+↑ edit.
// v0.87.83 — Refactored: 4 блока вынесены в hooks/components.
import { useEffect, useMemo, useState, useRef } from 'react'
import MessageBubble from '../components/MessageBubble.jsx'
import ForwardPicker from '../components/ForwardPicker.jsx'
import { AlbumBubble } from '../components/MediaAlbum.jsx'
import MessageSkeleton, { MessageListOverlay } from '../components/MessageSkeleton.jsx'
import InboxChatListSidebar from '../components/InboxChatListSidebar.jsx'
import InboxMessageInput from '../components/InboxMessageInput.jsx'
import { groupMessages, formatDayLabel, findFirstUnreadId } from '../utils/messageGrouping.js'
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

  useEffect(() => {
    if (store.activeAccountId) store.loadChats(store.activeAccountId)
  }, [store.activeAccountId])

  useEffect(() => {
    if (!store.activeChatId) return
    if (!store.messages[store.activeChatId]) {
      store.loadMessages(store.activeChatId, 50)
    }
    // v0.87.16: НЕ помечаем всё прочитанным при открытии — счётчик уменьшается
    // по мере показа (IntersectionObserver) или scroll в низ.
  }, [store.activeChatId])

  const activeAccountChats = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (store.chats || [])
      .filter(c => !store.activeAccountId || c.accountId === store.activeAccountId)
      .filter(c => !q || (c.title || '').toLowerCase().includes(q) || (c.lastMessage || '').toLowerCase().includes(q))
      .sort((a, b) => (b.lastMessageTs || 0) - (a.lastMessageTs || 0))
  }, [store.chats, store.activeAccountId, search])

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

      {/* Окно чата */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeChat ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--amoled-text-dim)' }}>
            Выберите чат
          </div>
        ) : (
          <>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--amoled-border)',
              background: 'var(--amoled-surface)', fontWeight: 600,
              display: 'flex', alignItems: 'center',
            }}>
              <div style={{ flex: 1 }}>
                {activeChat.title}
                {isTyping
                  ? <span style={{ color: 'var(--amoled-accent)', fontSize: 11, marginLeft: 10, fontWeight: 400 }}>✍️ печатает...</span>
                  : activeChat.isOnline && <span style={{ color: 'var(--amoled-success)', fontSize: 11, marginLeft: 10, fontWeight: 400 }}>● онлайн</span>
                }
              </div>
              <button
                onClick={() => { setShowMsgSearch(v => !v); if (showMsgSearch) setMsgSearch('') }}
                style={{ background: 'transparent', border: 'none', color: 'var(--amoled-text-dim)', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}
                title="Поиск в чате (Ctrl+F)"
              >🔍</button>
            </div>
            {/* v0.87.17: закреплённое сообщение */}
            {pinnedMsg && (
              <div style={{
                padding: '8px 16px', borderBottom: '1px solid var(--amoled-border)',
                background: 'rgba(42,171,238,0.08)', display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <span style={{ fontSize: 14 }}>📌</span>
                <div style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <div style={{ color: 'var(--amoled-accent)', fontWeight: 600 }}>Закреплённое</div>
                  <div style={{ color: 'var(--amoled-text-dim)' }}>{pinnedMsg.text?.slice(0, 100) || '[медиа]'}</div>
                </div>
                <button onClick={() => setPinnedMsg(null)} style={{
                  background: 'transparent', border: 'none', color: 'var(--amoled-text-dim)',
                  cursor: 'pointer', fontSize: 14,
                }} title="Скрыть">✕</button>
              </div>
            )}
            {showMsgSearch && (
              <div style={{ padding: 8, borderBottom: '1px solid var(--amoled-border)', background: 'var(--amoled-surface)' }}>
                <input type="text" placeholder="Поиск в этом чате..." value={msgSearch}
                  onChange={e => setMsgSearch(e.target.value)} autoFocus style={{ width: '100%', fontSize: 13 }} />
                {msgSearch && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--amoled-text-dim)' }}>Найдено: {visibleMessages.length}</div>}
              </div>
            )}
            {/* v0.87.36: wrapper relative — кнопка ↓ вне scroll-контейнера + overlay-shimmer */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* v0.87.66: overlay-shimmer пока !chatReady — initial-scroll прыжок не виден */}
              <MessageListOverlay show={!chatReady && visibleMessages.length > 0} />
              <div ref={msgsScrollRef} onScroll={handleScroll}
                onWheel={() => scrollDiag.markUserScroll('wheel')}
                onTouchStart={() => scrollDiag.markUserScroll('touch')}
                onPointerDown={() => scrollDiag.markUserScroll('pointer')}
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                style={{
                  flex: 1, overflowY: 'auto', padding: 16,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  outline: dragOver ? '2px dashed var(--amoled-accent)' : 'none',
                  background: dragOver ? 'rgba(42,171,238,0.08)' : 'transparent',
                  // v0.87.66: контент невидим до завершения initial-scroll + плавный fade-in
                  opacity: chatReady ? 1 : 0,
                  transition: 'opacity 200ms ease-out',
                }}>
                {dragOver && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--amoled-accent)', fontSize: 18, fontWeight: 600, pointerEvents: 'none',
                    background: 'rgba(0,0,0,0.4)', zIndex: 2,
                  }}>📎 Отпустите файл для отправки</div>
                )}
                {visibleMessages.length === 0 ? (
                  store.loadingMessages?.[store.activeChatId] ? (
                    <MessageSkeleton count={5} />
                  ) : (
                    <div style={{ color: 'var(--amoled-text-dim)', textAlign: 'center', padding: 20 }}>
                      {msgSearch ? 'Ничего не найдено' : 'Нет сообщений'}
                    </div>
                  )
                ) : renderItems.map(item => {
                  if (item.type === 'day') {
                    return (
                      <div key={item.id} className="native-msg-day-row">
                        <span className="native-msg-divider native-msg-divider--day">{formatDayLabel(item.day)}</span>
                      </div>
                    )
                  }
                  if (item.type === 'time') {
                    return <div key={item.id} className="native-msg-divider">{new Date(item.time).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
                  }
                  if (item.type === 'unread') {
                    return (
                      <div key={item.id} className="native-msg-unread-divider">
                        <span>Новые сообщения</span>
                      </div>
                    )
                  }
                  // group — v0.87.27 аватарка слева для чужих групп
                  const groupChat = !item.isOutgoing ? activeChat : null
                  const groupInitials = item.senderName
                    ? item.senderName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
                    : '?'
                  return (
                    <div key={item.id} className="native-msg-group-row" style={{
                      display: 'flex',
                      flexDirection: item.isOutgoing ? 'row-reverse' : 'row',
                      alignItems: 'flex-end', gap: 8,
                    }}>
                      {!item.isOutgoing && (
                        <div className="native-msg-avatar" style={{
                          background: groupChat?.avatar ? `url("${groupChat.avatar}") center/cover no-repeat` : '#65aadd',
                        }}>
                          {!groupChat?.avatar && groupInitials}
                        </div>
                      )}
                      <div className="native-msg-group" style={{
                        // v0.87.62 final: maxWidth 75% — bubble content-sized до 75%.
                        maxWidth: '75%',
                        alignItems: item.isOutgoing ? 'flex-end' : 'flex-start',
                        display: 'flex', flexDirection: 'column',
                      }}>
                        {!item.isOutgoing && item.senderName && (
                          <div className="native-msg-author">{item.senderName}</div>
                        )}
                        {item.msgs.map(m => (
                          m.type === 'album' ? (
                            <AlbumBubble
                              key={m.id} album={m} chatId={store.activeChatId}
                              downloadMedia={store.downloadMedia}
                              onPhotoOpen={openPhotoWindow}
                              onReply={setReplyTo}
                              onEdit={(msg) => { setEditTarget(msg); setInput(msg.text) }}
                              onDelete={handleDelete}
                              onForward={handleForward}
                              onPin={handlePin}
                              getMessage={getMessage}
                              onVisible={readByVisibility}
                              onReplyClick={scrollToMessage}
                            />
                          ) : (
                            <MessageBubble
                              key={m.id} m={m} chatId={store.activeChatId}
                              onReply={setReplyTo}
                              onEdit={(msg) => { setEditTarget(msg); setInput(msg.text) }}
                              onDelete={handleDelete}
                              onForward={handleForward}
                              onPin={handlePin}
                              downloadMedia={store.downloadMedia}
                              getMessage={getMessage}
                              onVisible={readByVisibility}
                              onPhotoOpen={openPhotoWindow}
                              onReplyClick={scrollToMessage}
                            />
                          )
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* v0.87.35/36: кнопка ↓ ВНЕ scroll-контейнера */}
              {/* v0.87.51: бейдж = activeUnread (сырой Telegram API, как в ChatListItem) */}
              {(!atBottom || activeUnread > 0) && (
                <button
                  onClick={scrollToBottom}
                  className="native-scroll-bottom-btn"
                  title={activeUnread > 0 ? `К первому непрочитанному (${activeUnread})` : 'К последнему сообщению'}
                >
                  ↓
                  {(activeUnread > 0 || newBelow > 0) && (
                    <span className="native-scroll-bottom-badge">
                      {(activeUnread > 0 ? activeUnread : newBelow) > 99 ? '99+' : (activeUnread > 0 ? activeUnread : newBelow)}
                    </span>
                  )}
                </button>
              )}
            </div>
            {/* Input + Reply/Edit панель → InboxMessageInput (v0.87.83) */}
            <InboxMessageInput
              input={input} setInput={setInput} sending={sending}
              replyTo={replyTo} editTarget={editTarget}
              setReplyTo={setReplyTo} setEditTarget={setEditTarget}
              activeMessages={activeMessages}
              handleInputChange={handleInputChange}
              handleReplySend={handleReplySend}
              handlePaste={handlePaste}
            />
          </>
        )}
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
