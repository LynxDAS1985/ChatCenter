// v0.87.12: строка списка чатов — вынесено из InboxMode для лимита 600 строк.
// v0.87.106 (multi-account UI):
//   - Цветная полоса слева 3px = фирменный цвет мессенджера (Telegram=#2AABEE)
//   - Аватарка чата 44px (без угловой иконки — v0.87.107)
//   - Иконка типа чата (👤 👥 📢 🤖) ПЕРЕД именем (как было)
//   - Микро-строка под именем: «✈️ Telegram · БНК» серым 10px (когда multi-account)
//   - Tooltip при hover на микро-строке: название мессенджера + имя аккаунта + телефон
//   - Hover в sidebar по аккаунту → этот чат подсвечивается (если accountId совпал)

import { getMessengerColor, getMessengerEmoji, getMessengerName } from '../utils/messengerBranding.js'
import { formatUnreadCount } from '../utils/unreadFormat.js'

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

export default function ChatListItem({ chat, active, onClick, onContextMenu, account, hoveredAccountId, multiAccount, compact = false }) {
  const bgColor = AVATAR_COLORS[hashString(chat.title || '?') % AVATAR_COLORS.length]
  const initials = (chat.title || '?').split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '').join('')
  const icon = typeIcon(chat.type, chat.isBot)
  const badgeCount = chat.unreadCount

  // v0.87.106: данные мессенджера/аккаунта для меток
  const messenger = account?.messenger || 'telegram'
  const stripeColor = multiAccount ? getMessengerColor(messenger) : 'transparent'
  const messengerEmoji = getMessengerEmoji(messenger)
  const messengerName = getMessengerName(messenger)

  // v0.87.106: подсветка-приглушение по hover в sidebar.
  // Если пользователь навёл на аккаунт в sidebar — другие чаты приглушаются (opacity 0.35).
  const dimmed = hoveredAccountId && account && hoveredAccountId !== account.id
  const highlighted = hoveredAccountId && account && hoveredAccountId === account.id

  // Tooltip на ✈️ и микро-имени
  const tooltipParts = []
  if (account) {
    tooltipParts.push(`${messengerEmoji} ${messengerName} · ${account.name || account.username || 'аккаунт'}`)
    if (account.phone) tooltipParts.push(account.phone)
    tooltipParts.push('Чат принадлежит этому аккаунту')
  }
  const tooltip = tooltipParts.join('\n')

  // v0.95.7: compact mode (chat-list width < 200px) — только аватар + бейдж
  // как уголок (Telegram Desktop two-column mode). Tooltip с названием чата
  // показывается на hover (юзер не теряет информацию).
  if (compact) {
    const compactTooltip = [chat.title || '?', chat.lastMessage].filter(Boolean).join('\n')
    return (
      <div
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={compactTooltip}
        style={{
          position: 'relative',
          padding: '8px 0',
          cursor: 'pointer',
          borderBottom: '1px solid var(--amoled-border)',
          background: active ? 'rgba(42, 171, 238, 0.2)'
            : highlighted ? 'rgba(42, 171, 238, 0.05)'
            : 'transparent',
          transition: 'background 0.1s, opacity 0.15s',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: 74,
          boxSizing: 'border-box',
          opacity: dimmed ? 0.35 : 1,
        }}
        onMouseEnter={e => { if (!active && !highlighted) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        onMouseLeave={e => {
          if (active) return
          e.currentTarget.style.background = highlighted ? 'rgba(42, 171, 238, 0.05)' : 'transparent'
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: chat.avatar ? `url("${chat.avatar}") center/cover no-repeat` : bgColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, fontWeight: 600,
            filter: chat.isMuted ? 'brightness(0.5) saturate(0.4)' : 'none',
          }}>
            {!chat.avatar && (initials || '?')}
          </div>
          {/* Бейдж непрочитанных — в правом нижнем углу аватарки */}
          {badgeCount > 0 && (
            <div style={{
              position: 'absolute', top: -4, right: -8,
              background: chat.isMuted ? 'rgba(128,128,128,0.85)' : 'var(--amoled-accent)',
              color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center',
              border: '2px solid var(--amoled-surface)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}>{formatUnreadCount(badgeCount)}</div>
          )}
          {chat.isMuted && (
            <div style={{
              position: 'absolute', bottom: -1, left: -1,
              width: 14, height: 14, borderRadius: '50%',
              background: 'var(--amoled-surface)',
              border: '1px solid var(--amoled-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8,
            }}>🔕</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        position: 'relative',
        padding: '10px 12px 10px 14px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--amoled-border)',
        background: active ? 'rgba(42, 171, 238, 0.2)'
          : highlighted ? 'rgba(42, 171, 238, 0.05)'
          : 'transparent',
        transition: 'background 0.1s, opacity 0.15s',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        height: 74,
        boxSizing: 'border-box',
        opacity: dimmed ? 0.35 : 1,
      }}
      onMouseEnter={e => { if (!active && !highlighted) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      onMouseLeave={e => {
        if (active) return
        e.currentTarget.style.background = highlighted ? 'rgba(42, 171, 238, 0.05)' : 'transparent'
      }}
    >
      {/* v0.87.106: цветная полоса слева — фирменный цвет мессенджера */}
      {multiAccount && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: stripeColor,
          }}
        />
      )}
      {/* Аватарка 53px (+20% от 44px, v0.87.116) */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 53, height: 53, borderRadius: '50%',
          background: chat.avatar ? `url("${chat.avatar}") center/cover no-repeat` : bgColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 19, fontWeight: 600,
          // v0.87.110: заглушён → тёмно-серая аватарка
          filter: chat.isMuted ? 'brightness(0.5) saturate(0.4)' : 'none',
        }}>
          {!chat.avatar && (initials || '?')}
        </div>
        {/* Онлайн-статус (только личный чат) */}
        {chat.isOnline && !multiAccount && (
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 12, height: 12, borderRadius: '50%',
            background: 'var(--amoled-success)',
            border: '2px solid var(--amoled-surface)',
          }} />
        )}
        {/* v0.87.110: 🔕 значок в левом нижнем углу аватарки когда заглушён */}
        {chat.isMuted && (
          <div style={{
            position: 'absolute', bottom: -1, left: -1,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--amoled-surface)',
            border: '1px solid var(--amoled-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9,
          }}>🔕</div>
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
          {/* v0.87.110: заглушён — серый бейдж (иконка теперь на аватарке) */}
          {badgeCount > 0 && (
            <div style={{
              background: chat.isMuted ? 'rgba(128,128,128,0.35)' : 'var(--amoled-accent)',
              color: chat.isMuted ? 'var(--amoled-text-dim)' : '#fff',
              fontSize: 11, padding: '1px 7px', borderRadius: 10, minWidth: 20, textAlign: 'center'
            }}>{formatUnreadCount(badgeCount)}</div>
          )}
        </div>
        {/* v0.87.106: микро-строка с мессенджером и именем аккаунта (только в multi-account) */}
        {multiAccount && account && (
          <div
            title={tooltip}
            style={{
              fontSize: 10,
              color: 'var(--amoled-text-muted)',
              marginTop: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}
          >
            {messengerEmoji} {messengerName} · {account.name || account.username || 'аккаунт'}
          </div>
        )}
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
