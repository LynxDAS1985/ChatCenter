// v0.95.42: рендер текста с подсветкой совпадений (для результатов поиска).
//
// Использует splitWithHighlights → массив фрагментов → <span> или <mark>.
// <mark> — семантический HTML тег для выделения, стилизуем сами (без default
// yellow браузера). Эталон: Slack search, Telegram Web K.

import { splitWithHighlights } from '../utils/searchHighlight.js'

export default function HighlightedText({ text, query, className, style }) {
  const parts = splitWithHighlights(text, query)
  // Нет query или нет совпадений → один обычный span (минимум DOM)
  if (parts.length === 1 && !parts[0].match) {
    return <span className={className} style={style}>{parts[0].text}</span>
  }
  return (
    <span className={className} style={style}>
      {parts.map((p, i) =>
        p.match ? (
          <mark
            key={i}
            style={{
              background: 'rgba(42,171,238,0.35)',
              color: 'inherit',
              padding: '0 1px',
              borderRadius: 2,
            }}
          >{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  )
}
