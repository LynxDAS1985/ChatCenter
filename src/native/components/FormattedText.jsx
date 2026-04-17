// v0.87.23: рендер текста Telegram с форматированием (entities MTProto).
// Типы: bold, italic, underline, strike, code, pre, url, texturl, mention, hashtag, botcommand, email, phone, spoiler.
// Плюс автоматически находим ссылки и упоминания в тексте (если их нет в entities).

export default function FormattedText({ text, entities = [] }) {
  if (!text) return null
  if (!entities.length) return <AutoLinks text={text} />

  // Сортируем по offset — собираем фрагменты
  const sorted = [...entities].sort((a, b) => a.offset - b.offset)
  const parts = []
  let cursor = 0

  for (const e of sorted) {
    if (e.offset > cursor) {
      parts.push(<AutoLinks key={`t${cursor}`} text={text.slice(cursor, e.offset)} />)
    }
    const chunk = text.slice(e.offset, e.offset + e.length)
    // v0.87.39: уникальный key — offset+type (раньше только offset → дубли при bold+italic на одном месте)
    parts.push(<FormatSpan key={`e${e.offset}_${e.type}`} entity={e} text={chunk} />)
    cursor = e.offset + e.length
  }
  if (cursor < text.length) {
    parts.push(<AutoLinks key={`t${cursor}`} text={text.slice(cursor)} />)
  }
  return <>{parts}</>
}

function FormatSpan({ entity, text }) {
  const t = entity.type
  if (t === 'bold') return <strong>{text}</strong>
  if (t === 'italic') return <em>{text}</em>
  if (t === 'underline') return <span style={{ textDecoration: 'underline' }}>{text}</span>
  if (t === 'strike') return <span style={{ textDecoration: 'line-through' }}>{text}</span>
  if (t === 'code') return <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace' }}>{text}</code>
  if (t === 'pre') return <pre style={{ background: 'rgba(255,255,255,0.08)', padding: 6, borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: '4px 0' }}>{text}</pre>
  if (t === 'spoiler') return <span style={{ background: '#333', color: '#333', borderRadius: 3 }} onClick={e => { e.currentTarget.style.color = '#fff' }} title="Спойлер — клик показать">{text}</span>
  if (t === 'url') return <a href={text} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amoled-accent)' }} onClick={e => { e.preventDefault(); window.api?.invoke('app:open-external', text) }}>{text}</a>
  if (t === 'texturl') return <a href={entity.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amoled-accent)' }} onClick={e => { e.preventDefault(); window.api?.invoke('app:open-external', entity.url) }}>{text}</a>
  if (t === 'email') return <a href={`mailto:${text}`} style={{ color: 'var(--amoled-accent)' }}>{text}</a>
  if (t === 'phone') return <a href={`tel:${text}`} style={{ color: 'var(--amoled-accent)' }}>{text}</a>
  if (t === 'mention') return <span style={{ color: 'var(--amoled-accent)', cursor: 'pointer' }}>{text}</span>
  if (t === 'mentionname') return <span style={{ color: 'var(--amoled-accent)', cursor: 'pointer' }}>{text}</span>
  if (t === 'hashtag') return <span style={{ color: 'var(--amoled-accent)', cursor: 'pointer' }}>{text}</span>
  if (t === 'cashtag') return <span style={{ color: 'var(--amoled-accent)', cursor: 'pointer' }}>{text}</span>
  if (t === 'botcommand') return <span style={{ color: 'var(--amoled-accent)' }}>{text}</span>
  return text
}

// Авто-детект ссылок и хэштегов в тексте без entities
function AutoLinks({ text }) {
  if (!text) return null
  const re = /(https?:\/\/\S+|t\.me\/\S+|#\w+|@\w+)/g
  const parts = []
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('http') || token.startsWith('t.me')) {
      const url = token.startsWith('http') ? token : `https://${token}`
      parts.push(<a key={m.index} href={url} style={{ color: 'var(--amoled-accent)' }}
        onClick={e => { e.preventDefault(); window.api?.invoke('app:open-external', url) }}>{token}</a>)
    } else {
      parts.push(<span key={m.index} style={{ color: 'var(--amoled-accent)' }}>{token}</span>)
    }
    last = m.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
