// v0.87.12: Режим «Чаты» (Inbox) с виртуальным скроллом, поиском, иконками типов.
// v0.87.27: photoViewer, scroll-to-reply, «новые сообщения» divider, Ctrl+↑ edit,
// scroll-to-bottom индикатор, аватарка слева от групп чужих сообщений.
import { useEffect, useMemo, useState, useRef } from 'react'
import { List } from 'react-window'
import ChatListItem from '../components/ChatListItem.jsx'
import MessageBubble from '../components/MessageBubble.jsx'
import ForwardPicker from '../components/ForwardPicker.jsx'
import { AlbumBubble } from '../components/MediaAlbum.jsx'
import { groupMessages, formatDayLabel, findFirstUnreadId } from '../utils/messageGrouping.js'
import { useInitialScroll } from '../hooks/useInitialScroll.js'

const ITEM_HEIGHT = 64

// v0.87.13: отдельный компонент вне InboxMode — react-window передаст свежие props каждый рендер
function ChatRow({ index, style, chats, activeChatId, setActiveChat }) {
  const c = chats[index]
  if (!c) return null
  return (
    <div style={style}>
      <ChatListItem chat={c} active={activeChatId === c.id} onClick={() => setActiveChat(c.id)} />
    </div>
  )
}

export default function InboxMode({ store }) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const listRef = useRef(null)
  const [listHeight, setListHeight] = useState(600)
  const containerRef = useRef(null)

  useEffect(() => {
    store.loadCachedChats?.()
  }, [])

  // v0.87.24: window.focus → rescan unread (Комбо D — часть B)
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
    // v0.87.16: НЕ помечаем всё прочитанным автоматически при открытии.
    // Счётчик уменьшается по мере показа сообщений (IntersectionObserver) или при скролле в низ.
  }, [store.activeChatId])

  // Измеряем высоту контейнера для List
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const update = () => setListHeight(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const activeAccountChats = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (store.chats || [])
      .filter(c => !store.activeAccountId || c.accountId === store.activeAccountId)
      .filter(c => !q || (c.title || '').toLowerCase().includes(q) || (c.lastMessage || '').toLowerCase().includes(q))
      .sort((a, b) => (b.lastMessageTs || 0) - (a.lastMessageTs || 0))
  }, [store.chats, store.activeAccountId, search])

  const activeChat = store.chats.find(c => c.id === store.activeChatId)
  const activeMessages = store.messages[store.activeChatId] || []

  const handleSend = async () => {
    if (!input.trim() || !store.activeChatId || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')
    try { await store.sendMessage(store.activeChatId, text) } catch (e) { console.error(e) }
    finally { setSending(false) }
  }

  // v0.87.14: отправка typing-индикатора при наборе (debounce 3 сек)
  const typingTimerRef = useRef(0)
  const handleInputChange = (v) => {
    setInput(v)
    if (!store.activeChatId) return
    if (Date.now() - typingTimerRef.current > 3000) {
      typingTimerRef.current = Date.now()
      store.setTyping?.(store.activeChatId)
    }
  }

  // v0.87.14: typing индикатор от собеседника
  const isTyping = store.typing?.[store.activeChatId]

  // v0.87.15: reply / edit / search / scroll-up
  const [replyTo, setReplyTo] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [msgSearch, setMsgSearch] = useState('')
  const [showMsgSearch, setShowMsgSearch] = useState(false)
  const msgsScrollRef = useRef(null)
  const loadingOlderRef = useRef(false)

  // v0.87.17: модалка forward + тост + закреплённое сообщение
  const [forwardTarget, setForwardTarget] = useState(null)
  const [toast, setToast] = useState(null)
  const [pinnedMsg, setPinnedMsg] = useState(null)

  // v0.87.28: индикатор scroll-to-bottom + первый непрочитанный
  // PhotoViewer теперь отдельное окно (IPC photo:open) — не React overlay
  const [atBottom, setAtBottom] = useState(true)
  const [newBelow, setNewBelow] = useState(0)
  const firstUnreadIdRef = useRef(null)

  // v0.87.29 Вариант A: начальный скролл чата (в низ / на first-unread) + жёлтая подсветка
  useInitialScroll({
    activeChatId: store.activeChatId,
    messagesCount: activeMessages.length,
    scrollRef: msgsScrollRef,
    firstUnreadIdRef,
  })

  const openPhotoWindow = (src) => {
    try { window.api?.invoke('photo:open', { src }) } catch(_) {}
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

  // v0.87.17: догружаем аватарки для активных чатов без photo (для каналов)
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

  // Запоминаем ID первого непрочитанного при открытии чата (для «новые сообщения»)
  useEffect(() => {
    if (!store.activeChatId) { firstUnreadIdRef.current = null; return }
    const chat = store.chats.find(c => c.id === store.activeChatId)
    firstUnreadIdRef.current = findFirstUnreadId(activeMessages, chat?.unreadCount || 0)
  }, [store.activeChatId, activeMessages.length > 0])

  const getMessage = (chatId, msgId) => (store.messages[chatId] || []).find(m => m.id === String(msgId))

  // v0.87.18: read-by-visibility с уникальными id (Set) чтобы счётчик не дёргался
  // v0.87.26: ФИКС — таймер через useRef (раньше был property на функции, пересоздавался
  // при каждом рендере → накапливались параллельные таймеры → markRead вызывался с count=0
  // → локально unreadCount сбрасывался в 0 раньше чем должно).
  const readSeenRef = useRef(new Set())
  const readBatchRef = useRef(new Set())  // batch для текущего debounce-окна
  const lastReadMaxRef = useRef(0)
  const readTimerRef = useRef(null)

  // Сброс при смене чата + отмена pending таймера
  useEffect(() => {
    readSeenRef.current = new Set()
    readBatchRef.current = new Set()
    lastReadMaxRef.current = 0
    if (readTimerRef.current) { clearTimeout(readTimerRef.current); readTimerRef.current = null }
  }, [store.activeChatId])

  const readByVisibility = (msg) => {
    if (msg.isOutgoing) return
    const id = Number(msg.id)
    if (readSeenRef.current.has(id)) return  // уже считали в этой сессии чата
    readSeenRef.current.add(id)
    readBatchRef.current.add(id)
    if (id > lastReadMaxRef.current) lastReadMaxRef.current = id
    // Debounce 1.5с: один таймер на всё окно
    if (readTimerRef.current) return
    const chatAtStart = store.activeChatId
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null
      if (!chatAtStart || chatAtStart !== store.activeChatId) { readBatchRef.current = new Set(); return }
      const count = readBatchRef.current.size
      if (count === 0) return  // пустой batch — не дёргаем (фикс сброса в 0)
      readBatchRef.current = new Set()
      store.markRead(chatAtStart, lastReadMaxRef.current, count)
    }, 1500)
  }

  // v0.87.16: drag-n-drop файлов в окно чата
  const [dragOver, setDragOver] = useState(false)
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false)
    if (!store.activeChatId) return
    for (const f of e.dataTransfer.files) {
      await store.sendFile(store.activeChatId, f.path, '')
    }
  }

  // v0.87.17: Ctrl+V вставка картинки (только если есть изображение в буфере)
  const handlePaste = async (e) => {
    if (!store.activeChatId) return
    const items = Array.from(e.clipboardData?.items || [])
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (!imgItem) return  // не картинка — обычная вставка текста, не трогаем
    e.preventDefault()
    const blob = imgItem.getAsFile()
    if (!blob) { showToast('Не удалось получить картинку из буфера', 'error'); return }
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const r = await window.api?.invoke('tg:send-clipboard-image', {
        chatId: store.activeChatId,
        data: Array.from(new Uint8Array(arrayBuffer)),
        ext: blob.type.split('/')[1] || 'png',
      })
      if (r?.ok) showToast('📎 Картинка отправлена', 'success')
      else showToast('✗ Ошибка: ' + (r?.error || 'неизвестно'), 'error')
    } catch (err) {
      showToast('✗ Ошибка: ' + err.message, 'error')
    }
  }

  const handleScroll = async (e) => {
    // v0.87.27: индикатор scroll-to-bottom + newBelow-счётчик
    const el = e.target
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAtBottom(nearBottom)
    if (nearBottom) setNewBelow(0)
    // Infinite scroll up
    if (loadingOlderRef.current) return
    if (el.scrollTop < 100 && activeMessages.length > 0) {
      loadingOlderRef.current = true
      const oldest = activeMessages[0]
      const prevHeight = el.scrollHeight
      await store.loadOlderMessages(store.activeChatId, oldest.id, 50)
      setTimeout(() => {
        if (msgsScrollRef.current) {
          msgsScrollRef.current.scrollTop = msgsScrollRef.current.scrollHeight - prevHeight
        }
        loadingOlderRef.current = false
      }, 100)
    }
  }

  // v0.87.27: при новом входящем сообщении если юзер НЕ внизу — растим счётчик
  const prevMsgCountRef = useRef(activeMessages.length)
  useEffect(() => {
    const prev = prevMsgCountRef.current
    const now = activeMessages.length
    prevMsgCountRef.current = now
    if (now > prev && !atBottom) {
      const added = activeMessages.slice(prev).filter(m => !m.isOutgoing).length
      if (added > 0) setNewBelow(n => n + added)
    }
  }, [activeMessages.length])

  // Скролл-вниз-одной-кнопкой
  const scrollToBottom = () => {
    const el = msgsScrollRef.current
    if (el) { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setNewBelow(0) }
  }

  // v0.87.27: клик по reply-цитате — скроллим к оригиналу + 1.5с жёлтое мерцание
  const scrollToMessage = (msgId) => {
    const el = msgsScrollRef.current?.querySelector(`[data-msg-id="${msgId}"]`)
    if (!el) { showToast('Исходное сообщение не загружено — прокрутите вверх', 'info'); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('native-msg-flash')
    setTimeout(() => el.classList.remove('native-msg-flash'), 1500)
  }

  const handleDelete = async (m) => {
    if (!confirm('Удалить сообщение у всех?')) return
    await store.deleteMessage(store.activeChatId, m.id, true)
  }

  // v0.87.17: forward через модалку с аватарками
  const handleForward = (m) => setForwardTarget(m)

  const handleForwardSelect = async (targetChat) => {
    const m = forwardTarget
    setForwardTarget(null)
    const r = await store.forwardMessage(store.activeChatId, targetChat.id, m.id)
    showToast(r?.ok ? `✓ Переслано в «${targetChat.title}»` : '✗ ' + (r?.error || 'Ошибка'),
      r?.ok ? 'success' : 'error')
  }

  const handlePin = async (m) => {
    const r = await store.pinMessage(store.activeChatId, m.id, false)
    showToast(r?.ok ? '📌 Закреплено' : '✗ ' + (r?.error || 'Ошибка'),
      r?.ok ? 'success' : 'error')
    if (r?.ok) setPinnedMsg(m)
  }

  const handleReplySend = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')
    try {
      if (editTarget) {
        await store.editMessage(store.activeChatId, editTarget.id, text)
        setEditTarget(null)
      } else {
        await store.sendMessage(store.activeChatId, text, replyTo?.id)
        setReplyTo(null)
      }
    } finally { setSending(false) }
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Список чатов */}
      <div style={{
        width: 340, borderRight: '1px solid var(--amoled-border)',
        background: 'var(--amoled-surface)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Поиск */}
        <div style={{ padding: 10, borderBottom: '1px solid var(--amoled-border)', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="🔍 Поиск по чатам..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', fontSize: 13 }}
          />
        </div>
        {/* Счётчик */}
        <div style={{
          padding: '8px 14px', fontSize: 11, color: 'var(--amoled-text-dim)',
          borderBottom: '1px solid var(--amoled-border)', background: 'var(--amoled-bg)', flexShrink: 0,
        }}>
          💬 {activeAccountChats.length}{search && ` найдено из ${(store.chats || []).filter(c => !store.activeAccountId || c.accountId === store.activeAccountId).length}`}
        </div>
        {/* Виртуальный список */}
        <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
          {activeAccountChats.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--amoled-text-dim)', fontSize: 13, textAlign: 'center' }}>
              {store.accounts.length === 0 ? 'Нет аккаунтов'
                : search ? 'Ничего не найдено' : 'Загрузка чатов...'}
            </div>
          ) : (
            <List
              listRef={listRef}
              rowCount={activeAccountChats.length}
              rowHeight={ITEM_HEIGHT}
              rowComponent={ChatRow}
              rowProps={{
                chats: activeAccountChats,
                activeChatId: store.activeChatId,
                setActiveChat: store.setActiveChat,
              }}
              style={{ height: listHeight, width: '100%' }}
            />
          )}
        </div>
      </div>

      {/* Окно чата */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeChat ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--amoled-text-dim)' }}>
            Выберите чат
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--amoled-border)', background: 'var(--amoled-surface)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
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
            {/* v0.87.17: закреплённое сообщение сверху */}
            {pinnedMsg && (
              <div style={{
                padding: '8px 16px', borderBottom: '1px solid var(--amoled-border)',
                background: 'rgba(42,171,238,0.08)', display: 'flex', gap: 10, alignItems: 'center'
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
            <div ref={msgsScrollRef} onScroll={handleScroll}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              style={{
                flex: 1, overflowY: 'auto', padding: 16,
                display: 'flex', flexDirection: 'column', gap: 6,
                position: 'relative',
                outline: dragOver ? '2px dashed var(--amoled-accent)' : 'none',
                background: dragOver ? 'rgba(42,171,238,0.08)' : 'transparent',
              }}>
              {dragOver && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--amoled-accent)', fontSize: 18, fontWeight: 600, pointerEvents: 'none',
                  background: 'rgba(0,0,0,0.4)', zIndex: 2,
                }}>📎 Отпустите файл для отправки</div>
              )}
              {visibleMessages.length === 0 ? (
                <div style={{ color: 'var(--amoled-text-dim)', textAlign: 'center', padding: 20 }}>
                  {msgSearch ? 'Ничего не найдено' : 'Нет сообщений'}
                </div>
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
                // group — v0.87.27 аватарка слева для чужих групп (не для своих)
                const groupChat = !item.isOutgoing ? activeChat : null
                const groupInitials = item.senderName ? item.senderName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') : '?'
                return (
                  <div key={item.id} className="native-msg-group-row" style={{
                    display: 'flex',
                    flexDirection: item.isOutgoing ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    gap: 8,
                  }}>
                    {!item.isOutgoing && (
                      <div className="native-msg-avatar" style={{
                        background: groupChat?.avatar ? `url("${groupChat.avatar}") center/cover no-repeat` : '#65aadd',
                      }}>
                        {!groupChat?.avatar && groupInitials}
                      </div>
                    )}
                    <div className="native-msg-group" style={{ alignItems: item.isOutgoing ? 'flex-end' : 'flex-start', flex: '0 1 auto' }}>
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
              {/* v0.87.27: индикатор «есть новые снизу» */}
              {!atBottom && (
                <button
                  onClick={scrollToBottom}
                  className="native-scroll-bottom-btn"
                  title="К последнему сообщению"
                >
                  ↓
                  {newBelow > 0 && (
                    <span className="native-scroll-bottom-badge">{newBelow > 99 ? '99+' : newBelow}</span>
                  )}
                </button>
              )}
            </div>
            {/* Reply / Edit панель */}
            {(replyTo || editTarget) && (
              <div style={{ padding: '6px 12px', background: 'var(--amoled-surface-hover)', borderTop: '1px solid var(--amoled-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--amoled-accent)' }}>{editTarget ? '✏️ Редактирование' : '↪ Ответ на'}:</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.7 }}>
                  {(editTarget || replyTo).text?.slice(0, 80) || '[медиа]'}
                </span>
                <button onClick={() => { setReplyTo(null); setEditTarget(null); setInput('') }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--amoled-text-dim)', cursor: 'pointer' }}>✕</button>
              </div>
            )}
            <div style={{ padding: 12, borderTop: '1px solid var(--amoled-border)', background: 'var(--amoled-surface)', display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => {
                  if ((e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) && input.trim()) handleReplySend()
                  // v0.87.27: Ctrl+↑ — редактируем последнее своё сообщение (если поле пустое)
                  if (e.key === 'ArrowUp' && e.ctrlKey && !input.trim() && !editTarget) {
                    e.preventDefault()
                    const lastOwn = [...activeMessages].reverse().find(m => m.isOutgoing && !m.mediaType)
                    if (lastOwn) { setEditTarget(lastOwn); setInput(lastOwn.text || '') }
                  }
                }}
                onPaste={handlePaste}
                placeholder={editTarget ? 'Отредактируйте сообщение...' : replyTo ? 'Ответ...' : 'Введите сообщение... (перетащите файл / Ctrl+V фото)'}
                disabled={sending}
                style={{ flex: 1 }}
              />
              <button className="native-btn" onClick={handleReplySend} disabled={sending || !input.trim()}>
                {sending ? '...' : editTarget ? '✓' : 'Отпр.'}
              </button>
            </div>
          </>
        )}
      </div>
      {/* v0.87.17: модалка forward */}
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
