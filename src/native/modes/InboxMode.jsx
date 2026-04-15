// v0.87.12: Режим «Чаты» (Inbox) с виртуальным скроллом, поиском, иконками типов.
import { useEffect, useMemo, useState, useRef } from 'react'
import { List } from 'react-window'
import ChatListItem from '../components/ChatListItem.jsx'

const ITEM_HEIGHT = 64

export default function InboxMode({ store }) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const listRef = useRef(null)
  const [listHeight, setListHeight] = useState(600)
  const containerRef = useRef(null)

  useEffect(() => {
    if (store.activeAccountId) store.loadChats(store.activeAccountId)
  }, [store.activeAccountId])

  useEffect(() => {
    if (store.activeChatId && !store.messages[store.activeChatId]) {
      store.loadMessages(store.activeChatId, 50)
    }
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
              rowComponent={({ index, style }) => {
                const c = activeAccountChats[index]
                return (
                  <div style={style}>
                    <ChatListItem
                      chat={c}
                      active={store.activeChatId === c.id}
                      onClick={() => store.setActiveChat(c.id)}
                    />
                  </div>
                )
              }}
              rowProps={{}}
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
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--amoled-border)', background: 'var(--amoled-surface)', fontWeight: 600 }}>
              {activeChat.title}
              {activeChat.isOnline && <span style={{ color: 'var(--amoled-success)', fontSize: 11, marginLeft: 10 }}>● онлайн</span>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeMessages.length === 0 ? (
                <div style={{ color: 'var(--amoled-text-dim)', textAlign: 'center', padding: 20 }}>Нет сообщений</div>
              ) : activeMessages.map(m => (
                <div key={m.id} style={{
                  alignSelf: m.isOutgoing ? 'flex-end' : 'flex-start',
                  maxWidth: '65%', padding: '8px 12px', borderRadius: 12,
                  background: m.isOutgoing ? 'var(--amoled-accent)' : 'var(--amoled-surface-hover)',
                  color: m.isOutgoing ? '#fff' : 'var(--amoled-text)',
                  fontSize: 14, wordBreak: 'break-word',
                }}>
                  {!m.isOutgoing && m.senderName && (
                    <div style={{ fontSize: 11, color: 'var(--amoled-text-dim)', marginBottom: 2 }}>{m.senderName}</div>
                  )}
                  <div>{m.text || '[медиа]'}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, textAlign: 'right' }}>
                    {new Date(m.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--amoled-border)', background: 'var(--amoled-surface)', display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if ((e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) && input.trim()) handleSend() }}
                placeholder="Введите сообщение..."
                disabled={sending}
                style={{ flex: 1 }}
              />
              <button className="native-btn" onClick={handleSend} disabled={sending || !input.trim()}>
                {sending ? '...' : 'Отпр.'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
