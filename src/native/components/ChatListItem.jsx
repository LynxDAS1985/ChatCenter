// v0.87.12: строка списка чатов — вынесено из InboxMode для лимита 600 строк.
// Показывает аватарку/инициалы, имя, последнее сообщение, бейдж, иконку типа, онлайн-статус.

const AVATAR_COLORS = ['#e17076', '#eda86c', '#a695e7', '#7bc862', '#65aadd', '#ee7aae', '#6ec9cb']

function hashString(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) & 0xffffffff
  return Math.abs(h)
}

function typeIcon(type, isBot) {
  if (isBot) return '🤖'
  if (type === 'group') return '👥'
  if (type === 'channel') return '📢'
  return null
}

export default function ChatListItem({ chat, active, onClick }) {
  const bgColor = AVATAR_COLORS[hashString(chat.title || '?') % AVATAR_COLORS.length]
  const initials = (chat.title || '?').split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '').join('')
  const icon = typeIcon(chat.type, chat.isBot)
  // v0.87.51: показываем ровно то число что возвращает Telegram API (chat.unreadCount).
  // groupedUnread (v0.87.45-50) удалён — источник рассинхронов. Если юзер хочет видеть
  // "альбом=1" — это задача сервера, не клиента. Telegram MTProto считает каждое фото как msg.
  const badgeCount = chat.unreadCount

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--amoled-border)',
        background: active ? 'rgba(42, 171, 238, 0.2)' : 'transparent',
        borderLeft: active ? '3px solid var(--amoled-accent)' : '3px solid transparent',
        transition: 'background 0.1s',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        height: 64,
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Аватарка */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: chat.avatar ? `url("${chat.avatar}") center/cover no-repeat` : bgColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 16, fontWeight: 600
        }}>
          {!chat.avatar && (initials || '?')}
        </div>
        {/* Онлайн-статус */}
        {chat.isOnline && (
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 12, height: 12, borderRadius: '50%',
            background: 'var(--amoled-success)',
            border: '2px solid var(--amoled-surface)',
          }} />
        )}
      </div>
      {/* Текст */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon && <span style={{ fontSize: 12, flexShrink: 0 }}>{icon}</span>}
          <div style={{
            fontWeight: 600, fontSize: 14, flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {chat.title}
            {chat.verified && <span style={{ color: 'var(--amoled-accent)', marginLeft: 4 }}>✓</span>}
          </div>
          {badgeCount > 0 && (
            <div style={{
              background: 'var(--amoled-accent)', color: '#fff',
              fontSize: 11, padding: '1px 7px', borderRadius: 10, minWidth: 20, textAlign: 'center'
            }}>{badgeCount > 999 ? '999+' : badgeCount}</div>
          )}
        </div>
        <div style={{
          fontSize: 12, color: 'var(--amoled-text-dim)',
          marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {chat.lastMessage || '—'}
        </div>
      </div>
    </div>
  )
}
