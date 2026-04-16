// v0.87.36: Shimmer-плейсхолдеры для загружающегося чата.
// Если есть кэшированные сообщения — показываем их + overlay shimmer сверху,
// пока загружаются свежие (Вариант 5 из обсуждения — «кэш + shimmer»).
// Если кэша нет — показываем 4 серых плейсхолдера-сообщения.

export default function MessageSkeleton({ count = 4 }) {
  const widths = ['62%', '45%', '78%', '50%', '70%']
  const sides = [0, 1, 0, 0, 1]  // 0 = слева (входящее), 1 = справа (исходящее)
  const heights = [40, 56, 72, 40, 48]
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="native-msg-skeleton"
          style={{
            alignSelf: sides[i] ? 'flex-end' : 'flex-start',
            width: widths[i] || '60%',
            height: heights[i] || 44,
          }}
        >
          <div className="native-msg-skeleton-shimmer" />
        </div>
      ))}
    </>
  )
}

// Overlay-вариант: shimmer поверх реального содержимого когда кэш есть,
// но идёт fresh load — показываем что «подгружается»
export function MessageListOverlay({ show }) {
  if (!show) return null
  return (
    <div className="native-msg-overlay">
      <div className="native-msg-overlay-shimmer" />
      <div className="native-msg-overlay-label">
        <span className="native-spinner" /> Обновляю сообщения...
      </div>
    </div>
  )
}
