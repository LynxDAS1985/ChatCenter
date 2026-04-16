// v0.87.12: Режим «Чаты» (Inbox) с виртуальным скроллом, поиском, иконками типов.
import { useEffect, useMemo, useState, useRef } from 'react'
import { List } from 'react-window'
import ChatListItem from '../components/ChatListItem.jsx'
import MessageBubble from '../components/MessageBubble.jsx'
import ForwardPicker from '../components/ForwardPicker.jsx'

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

  // v0.87.14: сразу грузим кэш (мгновенный UI), потом реальные чаты
  useEffect(() => {
    store.loadCachedChats?.()
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

  const getMessage = (chatId, msgId) => (store.messages[chatId] || []).find(m => m.id === String(msgId))

  // v0.87.18: read-by-visibility с уникальными id (Set) чтобы счётчик не дёргался
  const readSeenRef = useRef(new Set())  // уникальные прочитанные id в текущем чате
  const lastReadMaxRef = useRef(0)

  // Сброс при смене чата
  useEffect(() => {
    readSeenRef.current = new Set()
    lastReadMaxRef.current = 0
  }, [store.activeChatId])

  const readByVisibility = (msg) => {
    if (msg.isOutgoing) return
    const id = Number(msg.id)
    if (readSeenRef.current.has(id)) return  // уже считали
    readSeenRef.current.add(id)
    if (id > lastReadMaxRef.current) lastReadMaxRef.current = id
    // Debounce: отправляем batch раз в 1.5 сек
    if (!readByVisibility._timer) {
      readByVisibility._timer = setTimeout(() => {
        readByVisibility._timer = null
        if (!store.activeChatId) return
        const count = readSeenRef.current.size
        store.markRead(store.activeChatId, lastReadMaxRef.current, count)
        readSeenRef.current = new Set()  // сбрасываем batch
      }, 1500)
    }
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
    if (loadingOlderRef.current) return
    if (e.target.scrollTop < 100 && activeMessages.length > 0) {
      loadingOlderRef.current = true
      const oldest = activeMessages[0]
      const prevHeight = e.target.scrollHeight
      await store.loadOlderMessages(store.activeChatId, oldest.id, 50)
      setTimeout(() => {
        if (msgsScrollRef.current) {
          msgsScrollRef.current.scrollTop = msgsScrollRef.current.scrollHeight - prevHeight
        }
        loadingOlderRef.current = false
      }, 100)
    }
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
              ) : visibleMessages.map(m => (
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
                />
              ))}
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
                onKeyDown={e => { if ((e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) && input.trim()) handleReplySend() }}
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
