import { getHealthColor, getHealthTooltip } from '../utils/connectionHealth.js'

export default function ConnectionStatusDot({
  health,
  fallbackColor = '#9ca3af',
  fallbackLabel = '',
  size = 8,
  className = '',
  style,
  onClick,
}) {
  const color = health ? getHealthColor(health) : fallbackColor
  const title = getHealthTooltip(health, fallbackLabel)

  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={title}
      title={title}
      className={className}
      onClick={(e) => {
        if (!onClick) return
        e.preventDefault()
        e.stopPropagation()
        onClick(e)
      }}
      onKeyDown={(e) => {
        if (!onClick) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onClick(e)
        }
      }}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: `0 0 0 1px ${color}55`,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    />
  )
}
