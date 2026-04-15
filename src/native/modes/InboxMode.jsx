// v0.87.3: Режим «Чаты» (Inbox) — список чатов + окно переписки.
// Читает данные из useNativeStore (обновляется по IPC событиям).
import { useEffect, useMemo, useState } from 'react'

export default function InboxMode({ store }) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // Загрузить чаты при появлении аккаунта
  useEffect(() => {
    if (store.activeAccountId) {
      store.loadChats(store.activeAccountId)
    }
  }, [store.activeAccountId])

  // Загрузить сообщения при выборе чата
  useEffect(() => {
    if (store.activeChatId && !store.messages[store.activeChatId]) {
      store.loadMessages(store.activeChatId, 50)
    }
  }, [store.activeChatId])

  const activeAccountChats = useMemo(() => {
    return (store.chats || [])
      .filter(c => !store.activeAccountId || c.accountId === store.activeAccountId)
      .sort((a, b) => (b.lastMessageTs || 0) - (a.lastMessageTs || 0))
  }, [store.chats, store.activeAccountId])

  const activeChat = store.chats.find(c => c.id === store.activeChatId)
  const activeMessages = store.messages[store.activeChatId] || []

  const handleSend = async () => {
    if (!input.trim() || !store.activeChatId || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')
    try {
      await store.sendMessage(store.activeChatId, text)
    } catch (e) { console.error(e) }
    finally { setSending(false) }
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Список чатов */}
      <div style={{
        width: 320, borderRight: '1px solid var(--amoled-border)',
        overflowY: 'auto', background: 'var(--amoled-surface)'
      }}>
        {activeAccountChats.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--amoled-text-dim)', fontSize: 13, textAlign: 'center' }}>
            {store.accounts.length === 0 ? 'Нет аккаунтов' : 'Загрузка чатов...'}
          </div>
        ) : (
          activeAccountChats.map(c => (
            <div
              key={c.id}
              onClick={() => store.setActiveChat(c.id)}
              style={{
                padding: '12px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--amoled-border)',
                background: store.activeChatId === c.id ? 'var(--amoled-surface-hover)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (store.activeChatId !== c.id) e.currentTarget.style.background = 'var(--amoled-surface-hover)' }}
              onMouseLeave={e => { if (store.activeChatId !== c.id) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}
                </div>
                {c.unreadCount > 0 && (
                  <div style={{
                    background: 'var(--amoled-accent)', color: '#fff',
                    fontSize: 11, padding: '1px 7px', borderRadius: 10, minWidth: 20, textAlign: 'center'
                  }}>{c.unreadCount}</div>
                )}
              </div>
              <div style={{
                fontSize: 12, color: 'var(--amoled-text-dim)',
                marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {c.lastMessage || '—'}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Окно чата */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeChat ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--amoled-text-dim)'
          }}>
            Выберите чат
          </div>
        ) : (
          <>
            {/* Шапка чата */}
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--amoled-border)',
              background: 'var(--amoled-surface)', fontWeight: 600
            }}>
              {activeChat.title}
            </div>

            {/* Сообщения */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeMessages.length === 0 ? (
                <div style={{ color: 'var(--amoled-text-dim)', textAlign: 'center', padding: 20 }}>
                  Нет сообщений
                </div>
              ) : activeMessages.map(m => (
                <div key={m.id} style={{
                  alignSelf: m.isOutgoing ? 'flex-end' : 'flex-start',
                  maxWidth: '65%',
                  padding: '8px 12px',
                  borderRadius: 12,
                  background: m.isOutgoing ? 'var(--amoled-accent)' : 'var(--amoled-surface-hover)',
                  color: m.isOutgoing ? '#fff' : 'var(--amoled-text)',
                  fontSize: 14,
                  wordBreak: 'break-word',
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

            {/* Поле ввода */}
            <div style={{
              padding: 12, borderTop: '1px solid var(--amoled-border)',
              background: 'var(--amoled-surface)', display: 'flex', gap: 8
            }}>
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
