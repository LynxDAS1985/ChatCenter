// v1.2.165: круглый аватар аккаунта в левой панели. Вынесен из NativeApp.jsx (разгрузка
// под лимит 600 + возможность ресайза панели). Угловая иконка мессенджера, точка онлайн,
// бейдж непрочитанных, галочка вкл/выкл фильтра, обводка цвета-метки.
//
// Ресайз (v1.2.165): все размеры домножаются на `scale` (1 = обычный, <1 = панель сужена).
// `hideLabel` — при узкой панели прячем подпись-имя (остаются только кружки).
//
// Клики: одиночный = onToggleVisible (вкл/выкл аккаунт), двойной = onSolo («только этот»).
// Разведены таймером 220мс (иначе одиночное действие сработало бы во время двойного).
import { useRef, useEffect } from 'react'
import ConnectionStatusDot from '../../components/ConnectionStatusDot.jsx'
import MessengerIcon from './MessengerIcon.jsx' // v1.2.182: логотип мессенджера (Telegram — картинка)
import { formatUnreadCount } from '../utils/unreadFormat.js'
import { getMessengerEmoji } from '../utils/messengerBranding.js' // v1.2.183: единый список эмодзи (убран дубль)

const MESSENGER_COLORS = { telegram: '#2AABEE', whatsapp: '#25D366', vk: '#0077FF', max: '#7B3FE4', viber: '#7360F2' }
// v1.2.183: список эмодзи мессенджеров переехал в messengerBranding.js (был дубль здесь) — см. getMessengerEmoji.

export default function AccountAvatar({
  account, accountColor, unreadCount, health, onContextMenu, onMouseEnter, onMouseLeave, onOpenConnections,
  filterActive, hidden, dimmed, solo, onToggleVisible, onSolo,
  scale = 1, hideLabel = false,
}) {
  const clickTimerRef = useRef(null)
  useEffect(() => () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current) }, [])
  const handleClick = () => {
    if (!onToggleVisible) return
    if (clickTimerRef.current) return
    clickTimerRef.current = setTimeout(() => { clickTimerRef.current = null; onToggleVisible() }, 220)
  }
  const handleDouble = () => {
    if (!onSolo) return
    if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null }
    onSolo()
  }
  // px(base) — размер с учётом масштаба панели.
  const px = (n) => Math.max(1, Math.round(n * scale))
  const initials = (account.name || '?').split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '').join('') || '?'
  const messenger = account.messenger || 'telegram'
  const color = MESSENGER_COLORS[messenger] || MESSENGER_COLORS.telegram
  const emoji = getMessengerEmoji(messenger)
  const tooltip = `${emoji} ${messenger.charAt(0).toUpperCase() + messenger.slice(1)} · ${account.name}` +
    (account.phone ? `\n${account.phone}` : '') +
    (unreadCount > 0 ? `\n${unreadCount} непрочитанных` : '')

  return (
    <div
      className="account-avatar-wrap"
      onClick={handleClick}
      onDoubleClick={handleDouble}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={tooltip}
      style={{ position: 'relative', width: px(56), marginBottom: px(12), cursor: 'pointer', textAlign: 'center' }}
    >
      <div
        className="account-avatar-circle"
        style={{
          position: 'relative', width: px(48), height: px(48), margin: '0 auto', borderRadius: '50%',
          background: account.avatar ? `url("${account.avatar}") center/cover no-repeat` : color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: px(16), fontWeight: 600,
          transition: 'transform 0.15s, filter 0.15s, opacity 0.15s',
          boxShadow: solo
            ? `0 0 0 ${px(2)}px var(--amoled-bg), 0 0 0 ${px(4)}px ${accountColor || '#2aabee'}, 0 0 ${px(12)}px ${px(2)}px ${accountColor || '#2aabee'}`
            : (accountColor ? `0 0 0 ${px(2)}px var(--amoled-bg), 0 0 0 ${px(4)}px ${accountColor}` : 'none'),
          filter: dimmed ? 'grayscale(1) brightness(0.6)' : 'none',
          opacity: dimmed ? 0.5 : 1,
        }}
      >
        {!account.avatar && initials}
        {/* Угловая иконка мессенджера (правый верхний угол).
            v1.2.184: убрана ТОЛЬКО цветная рамка-обводка вокруг значка; чёрный кружок-подложка
            (background var(--amoled-bg) + круг) ОСТАВЛЕН — чтобы логотип читался поверх фото аватара.
            Цветная обводка САМОГО аккаунта (accountColor) рисуется отдельно и не тронута. */}
        <span style={{
          position: 'absolute', top: -px(2), right: -px(2), width: px(18), height: px(18),
          borderRadius: '50%', background: 'var(--amoled-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: px(10),
        }}><MessengerIcon messenger={messenger} size={px(12)} /></span>
        {/* Точка онлайн (правый нижний угол) */}
        <ConnectionStatusDot
          health={health} fallbackLabel={`${messenger} · ${account.name}`} size={px(12)} onClick={onOpenConnections}
          style={{ position: 'absolute', bottom: 0, right: 0, border: '2px solid var(--amoled-bg)' }}
        />
        {/* Красный бейдж непрочитанных (левый верхний угол) */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -px(4), left: -px(4), minWidth: px(18), height: px(18),
            padding: `0 ${px(5)}px`, borderRadius: px(9), background: 'var(--amoled-danger)',
            color: '#fff', fontSize: px(10), fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--amoled-bg)',
          }}>{formatUnreadCount(unreadCount)}</span>
        )}
        {/* v1.2.163: галочка «показан/скрыт» — левый нижний угол. Только при ≥2 аккаунтах. */}
        {filterActive && (
          <span aria-hidden="true" style={{
            position: 'absolute', bottom: -px(2), left: -px(2), width: px(17), height: px(17), borderRadius: '50%',
            background: hidden ? '#33383f' : 'var(--amoled-success)', color: hidden ? '#8a909a' : '#04331d',
            border: '2px solid var(--amoled-bg)', fontSize: px(11), fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>{hidden ? '' : '✓'}</span>
        )}
      </div>
      {/* v1.2.165: подпись-имя прячется, когда панель узкая (hideLabel) */}
      {!hideLabel && (
        <div style={{
          marginTop: px(4), fontSize: px(11), color: 'var(--amoled-text-dim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px',
        }}>{account.name}</div>
      )}
    </div>
  )
}
