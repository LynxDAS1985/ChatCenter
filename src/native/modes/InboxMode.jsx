// v0.87.12: Режим «Чаты» (Inbox) с виртуальным скроллом, поиском, иконками типов.
import { useEffect, useMemo, useState, useRef } from 'react'
import { List } from 'react-window'
import ChatListItem from '../components/ChatListItem.jsx'
import MessageBubble from '../components/MessageBubble.jsx'

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
    // v0.87.14: автоматически помечаем прочитанным при открытии
    store.markRead?.(store.activeChatId)
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

  const visibleMessages = useMemo(() => {
    if (!msgSearch.trim()) return activeMessages
    const q = msgSearch.toLowerCase()
    return activeMessages.filter(m => (m.text || '').toLowerCase().includes(q))
  }, [activeMessages, msgSearch])

  const getMessage = (chatId, msgId) => (store.messages[chatId] || []).find(m => m.id === String(msgId))

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
            {showMsgSearch && (
              <div style={{ padding: 8, borderBottom: '1px solid var(--amoled-border)', background: 'var(--amoled-surface)' }}>
                <input type="text" placeholder="Поиск в этом чате..." value={msgSearch}
                  onChange={e => setMsgSearch(e.target.value)} autoFocus style={{ width: '100%', fontSize: 13 }} />
                {msgSearch && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--amoled-text-dim)' }}>Найдено: {visibleMessages.length}</div>}
              </div>
            )}
            <div ref={msgsScrollRef} onScroll={handleScroll}
              style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                  downloadMedia={store.downloadMedia}
                  getMessage={getMessage}
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
                placeholder={editTarget ? 'Отредактируйте сообщение...' : replyTo ? 'Ответ...' : 'Введите сообщение...'}
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
    </div>
  )
}
