/**
 * Компонент вкладки мессенджера.
 * Отображает название, бейдж непрочитанных, статус мониторинга, аватар аккаунта.
 */
import { useState, useEffect, useRef } from 'react'

export default function MessengerTab({
  messenger: m, isActive, accountInfo, unreadCount, isNew,
  unreadSplit, messagePreview, zoomLevel, monitorStatus, isPageLoading, isPinned,
  onClick, onClose, onContextMenu, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd
}) {
  const [hovered, setHovered] = useState(false)
  const [badgePulse, setBadgePulse] = useState(false)
  const [showReadCheck, setShowReadCheck] = useState(false)
  const [flipAnim, setFlipAnim] = useState(false)
  const prevCountRef = useRef(0)

  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current >= 0) {
      setBadgePulse(true)
      setFlipAnim(true)
      const t1 = setTimeout(() => setBadgePulse(false), 500)
      const t2 = setTimeout(() => setFlipAnim(false), 300)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    if (unreadCount === 0 && prevCountRef.current > 0) {
      setShowReadCheck(true)
      const t = setTimeout(() => setShowReadCheck(false), 2000)
      return () => clearTimeout(t)
    }
    if (unreadCount > 0 && unreadCount < prevCountRef.current) {
      setFlipAnim(true)
      const t = setTimeout(() => setFlipAnim(false), 300)
      return () => clearTimeout(t)
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])
  useEffect(() => { prevCountRef.current = unreadCount }, [unreadCount])

  const badgeTooltip = unreadSplit
    ? `Непрочитанных: ${unreadCount}\n💬 Личные: ${unreadSplit.personal}\n📢 Каналы/группы: ${unreadSplit.channels}`
    : `Непрочитанных: ${unreadCount}`

  return (
    <button
      draggable
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver() }}
      onDrop={e => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      title={accountInfo ? `${m.name} — ${accountInfo}` : m.name}
      className="relative flex items-center justify-center gap-1.5 h-[40px] px-3 cursor-pointer transition-all duration-150"
      style={{
        minWidth: 130,
        backgroundColor: isActive ? `${m.color}1A` : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderBottom: isActive ? `2px solid ${m.color}` : '2px solid transparent',
        borderRadius: '6px 6px 0 0',
        outline: isDragOver ? `2px dashed ${m.color}66` : 'none',
        outlineOffset: '-2px',
      }}
    >
      <span className="relative inline-flex w-2 h-2 shrink-0"
        title={monitorStatus === 'active' ? 'Мониторинг активен' : monitorStatus === 'loading' ? 'Загрузка монитора...' : monitorStatus === 'error' ? 'Монитор не отвечает' : ''}
      >
        {isNew && !isActive && (
          <span className="animate-ping absolute inset-0 rounded-full" style={{ backgroundColor: m.color, opacity: 0.6 }} />
        )}
        <span className="relative w-2 h-2 rounded-full block transition-all duration-150" style={{
          backgroundColor: monitorStatus === 'error' ? '#ef4444' : monitorStatus === 'loading' ? '#eab308' : isActive ? m.color : `${m.color}55`
        }} />
      </span>

      <span className="flex flex-col items-center leading-tight">
        <span className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap transition-colors duration-150 flex items-center gap-0.5" style={{ color: isActive ? m.color : 'var(--cc-text-dim)' }}>
            {isPinned && <span className="text-[9px] opacity-50" title="Закреплена">📌</span>}
            {m.name}
          </span>
          {zoomLevel && zoomLevel !== 100 && (
            <span className="text-[9px] leading-none px-1 py-0.5 rounded font-bold" style={{ color: m.color, backgroundColor: `${m.color}20` }} title={`Масштаб: ${zoomLevel}%`}>{zoomLevel}%</span>
          )}
        </span>
        {messagePreview ? (
          <span className="text-[10px] whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis leading-tight" style={{ color: m.color }}>💬 {messagePreview}</span>
        ) : accountInfo ? (
          <span className="text-[10px] whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis leading-tight opacity-60" style={{ color: 'var(--cc-text-dimmer)' }}>{accountInfo}</span>
        ) : null}
      </span>

      <span className="ml-auto min-w-[20px] flex items-center justify-end shrink-0">
        {hovered && !isPinned ? (
          <span onClick={e => { e.stopPropagation(); onClose() }} className="w-[16px] h-[16px] rounded-full flex items-center justify-center text-[10px] leading-none cursor-pointer transition-all shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }} title="Закрыть вкладку">✕</span>
        ) : unreadCount > 0 ? (
          unreadSplit && unreadSplit.personal > 0 && unreadSplit.channels > 0 ? (
            <span className="flex flex-col gap-0.5 items-end shrink-0" title={badgeTooltip}>
              <span className="min-w-[15px] h-[14px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none" style={{ backgroundColor: m.color, overflow: 'hidden', animation: isNew ? 'bounce 0.6s ease 3' : badgePulse ? 'badgePulse 0.4s ease' : 'none' }}><span style={{ animation: flipAnim ? 'flipIn 0.3s ease' : 'none', display: 'inline-block' }}>💬{unreadSplit.personal > 99 ? '99+' : unreadSplit.personal}</span></span>
              <span className="min-w-[15px] h-[14px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none" style={{ backgroundColor: '#6b7280', overflow: 'hidden', animation: badgePulse ? 'badgePulse 0.4s ease' : 'none' }}><span style={{ animation: flipAnim ? 'flipIn 0.3s ease' : 'none', display: 'inline-block' }}>📢{unreadSplit.channels > 99 ? '99+' : unreadSplit.channels}</span></span>
            </span>
          ) : (
            <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0" style={{ animation: isNew ? 'bounce 0.6s ease 3' : badgePulse ? 'badgePulse 0.4s ease' : 'none', overflow: 'hidden' }} title={badgeTooltip}>
              <span style={{ animation: flipAnim ? 'flipIn 0.3s ease' : 'none', display: 'inline-block' }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            </span>
          )
        ) : showReadCheck ? (
          <span className="w-[16px] h-[16px] rounded-full flex items-center justify-center text-[10px] leading-none shrink-0" style={{ backgroundColor: '#22c55e22', color: '#22c55e', animation: 'badgePulse 0.4s ease' }} title="Все сообщения прочитаны">✓</span>
        ) : null}
      </span>

      {isPageLoading && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
          <span className="block h-full" style={{ background: `linear-gradient(90deg, transparent, ${m.color}, transparent)`, animation: 'tabLoading 1.2s ease-in-out infinite' }} />
        </span>
      )}
    </button>
  )
}
