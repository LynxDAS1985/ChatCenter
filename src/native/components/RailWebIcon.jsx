// v1.2.256 — значок веб-мессенджера в нативной боковой полосе (под аккаунтами).
// Модель 🅰️: единая полоса — сверху Telegram-аккаунты, ниже веб-мессенджеры (ВК/WhatsApp/МАКС).
// Клик → открыть вкладку этого мессенджера (handleTabClick из App). Размеры масштабируются
// вместе с полосой (railScale), как у AccountAvatar. Форма — скруглённый квадрат (отличать
// «веб-приложение» от круглого аватара-«человека»).
import ConnectionStatusDot from '../../components/ConnectionStatusDot.jsx'

export default function RailWebIcon({
  messenger: m, isActive, unread = 0, health, isNew, onSelect, onOpenConnections, scale = 1,
  // v1.2.257: функции вкладок на веб-значках — правый клик (меню), перетаскивание, полоска загрузки.
  onContextMenu, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver, isLoading,
}) {
  const px = (n) => Math.max(1, Math.round(n * scale))
  const color = m.color || '#2AABEE'
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-web-id={m.id}
      aria-current={isActive ? 'true' : undefined}
      title={m.name}
      onClick={() => onSelect?.(m.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(m.id) } }}
      onContextMenu={e => { e.preventDefault(); onContextMenu?.(m.id, e.clientX, e.clientY) }}
      onDragStart={e => { if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; onDragStart?.(m.id) }}
      onDragOver={e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; onDragOver?.(m.id) }}
      onDrop={e => { e.preventDefault(); onDrop?.(m.id) }}
      onDragEnd={() => onDragEnd?.()}
      style={{
        position: 'relative', width: px(48), height: px(48), margin: `0 auto ${px(12)}px`,
        borderRadius: px(14), display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: px(22), lineHeight: 1, cursor: 'pointer',
        background: isActive ? `${color}22` : 'var(--amoled-surface)',
        outline: isDragOver ? `2px dashed ${color}` : isActive ? `2px solid ${color}` : '1px solid var(--amoled-border)',
      }}
    >
      {/* Пульс при новом сообщении */}
      {isNew && !isActive && (
        <span aria-hidden="true" className="animate-ping" style={{
          position: 'absolute', inset: px(6), borderRadius: px(12), background: color, opacity: 0.35,
        }} />
      )}
      <span aria-hidden="true">{m.emoji || (m.name ? m.name[0] : '•')}</span>

      {/* Бейдж непрочитанных */}
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: -px(3), right: -px(3), minWidth: px(17), height: px(17),
          padding: `0 ${px(4)}px`, borderRadius: px(9), background: 'var(--amoled-danger)',
          color: '#fff', fontSize: px(10), fontWeight: 700, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--amoled-bg)',
        }}>{unread > 99 ? '99+' : unread}</span>
      )}

      {/* Точка связи (клик → «Подключения») */}
      <span style={{ position: 'absolute', bottom: 0, right: 0 }}>
        <ConnectionStatusDot
          health={health} fallbackColor={`${color}66`} fallbackLabel={m.name}
          size={px(11)} onClick={onOpenConnections}
          style={{ border: '2px solid var(--amoled-bg)' }}
        />
      </span>

      {/* Полоска загрузки под значком (v1.2.257) */}
      {isLoading && (
        <span aria-hidden="true" style={{
          position: 'absolute', bottom: -px(2), left: px(6), right: px(6), height: 2, borderRadius: 2, overflow: 'hidden',
        }}>
          <span style={{
            display: 'block', height: '100%',
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            animation: 'tabLoading 1.2s ease-in-out infinite',
          }} />
        </span>
      )}
    </div>
  )
}
