// v0.87.23: рендер текста Telegram с форматированием (entities MTProto).
// Типы: bold, italic, underline, strike, code, pre, url, texturl, mention, hashtag, botcommand, email, phone, spoiler.
// Плюс автоматически находим ссылки и упоминания в тексте (если их нет в entities).
// v1.2.514: поддержка isOutgoing — в исходящих bubble (где фон var(--amoled-accent))
// ссылки и упоминания выводятся белым (#ffffff) с подчеркиванием, чтобы не сливаться с фоном.
// Подсказка title с полным адресом + контекстное меню «Копировать адрес ссылки» по ПКМ.
// По ревью: безопасная обработка entities=null, автоссылки email с плюсом (+tag),
// протокольная нормализация url, закрытие меню по scroll/wheel/contextmenu/Escape и сброс других меню.

import { useState, useEffect } from 'react'
import { copyText } from '../utils/copyText.js'

function safeOpenUrl(rawUrl) {
  const url = /^[a-zA-Z]+:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`
  try { window.api?.invoke('app:open-external', url) } catch (_) {}
}

const getLinkStyle = (isOutgoing) => isOutgoing
  ? { color: '#ffffff', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 500 }
  : { color: 'var(--amoled-accent)', textDecoration: 'underline', textUnderlineOffset: '2px' }

const getMentionStyle = (isOutgoing) => isOutgoing
  ? { color: '#ffffff', textDecoration: 'underline', textUnderlineOffset: '2px', cursor: 'pointer', fontWeight: 600 }
  : { color: 'var(--amoled-accent)', cursor: 'pointer', fontWeight: 500 }

export default function FormattedText({ text, entities = [], isOutgoing = false }) {
  const [linkMenu, setLinkMenu] = useState(null)
  const safeEntities = Array.isArray(entities) ? entities : []

  useEffect(() => {
    if (!linkMenu) return
    const close = () => setLinkMenu(null)
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setLinkMenu(null)
      }
    }
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('wheel', close, { passive: true })
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('cc-close-link-menu', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('wheel', close, { passive: true })
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('cc-close-link-menu', close)
    }
  }, [linkMenu])

  if (!text) return null
  const handleLinkContextMenu = (e, url, isEmail = false) => {
    e.preventDefault()
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('cc-close-link-menu'))
    const maxX = (typeof window !== 'undefined' ? window.innerWidth : 800) - 220
    const maxY = (typeof window !== 'undefined' ? window.innerHeight : 600) - 100
    setLinkMenu({
      url,
      x: Math.max(8, Math.min(e.clientX, maxX)),
      y: Math.max(8, Math.min(e.clientY, maxY)),
      isEmail
    })
  }

  if (!safeEntities.length) {
    return (
      <>
        <AutoLinks text={text} isOutgoing={isOutgoing} onLinkContextMenu={handleLinkContextMenu} />
        {renderLinkMenu(linkMenu, () => setLinkMenu(null))}
      </>
    )
  }

  // Сортируем по offset — собираем фрагменты
  const sorted = [...safeEntities].sort((a, b) => a.offset - b.offset)
  const parts = []
  let cursor = 0

  for (const e of sorted) {
    if (e.offset > cursor) {
      parts.push(<AutoLinks key={`t${cursor}`} text={text.slice(cursor, e.offset)} isOutgoing={isOutgoing} onLinkContextMenu={handleLinkContextMenu} />)
    }
    const chunk = text.slice(e.offset, e.offset + e.length)
    parts.push(<FormatSpan key={`e${e.offset}_${e.type}`} entity={e} text={chunk} isOutgoing={isOutgoing} onLinkContextMenu={handleLinkContextMenu} />)
    cursor = e.offset + e.length
  }
  if (cursor < text.length) {
    parts.push(<AutoLinks key={`t${cursor}`} text={text.slice(cursor)} isOutgoing={isOutgoing} onLinkContextMenu={handleLinkContextMenu} />)
  }
  return (
    <>
      {parts}
      {renderLinkMenu(linkMenu, () => setLinkMenu(null))}
    </>
  )
}

function renderLinkMenu(linkMenu, onClose) {
  if (!linkMenu) return null
  const isEmail = linkMenu.isEmail
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: linkMenu.x,
        top: linkMenu.y,
        zIndex: 99999,
        background: 'rgba(20, 20, 20, 0.96)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        minWidth: 200,
        fontSize: 13,
        color: '#fff',
        userSelect: 'none',
      }}
    >
      <div
        onClick={async () => {
          await copyText(linkMenu.url)
          onClose()
        }}
        style={menuItemStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <span>📋</span> <span>{isEmail ? 'Копировать email' : 'Копировать адрес ссылки'}</span>
      </div>
      <div
        onClick={() => {
          if (isEmail) {
            try { window.api?.invoke('app:open-external', `mailto:${linkMenu.url}`) } catch (_) {}
          } else {
            safeOpenUrl(linkMenu.url)
          }
          onClose()
        }}
        style={menuItemStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <span>{isEmail ? '✉️' : '↗️'}</span> <span>{isEmail ? 'Написать письмо' : 'Открыть ссылку'}</span>
      </div>
    </div>
  )
}

const menuItemStyle = {
  padding: '7px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

function FormatSpan({ entity, text, isOutgoing, onLinkContextMenu }) {
  const t = entity.type
  if (t === 'bold') return <strong>{text}</strong>
  if (t === 'italic') return <em>{text}</em>
  if (t === 'underline') return <span style={{ textDecoration: 'underline' }}>{text}</span>
  if (t === 'strike') return <span style={{ textDecoration: 'line-through' }}>{text}</span>
  if (t === 'code') return <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace' }}>{text}</code>
  if (t === 'pre') return <pre style={{ background: 'rgba(255,255,255,0.08)', padding: 6, borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: '4px 0' }}>{text}</pre>
  if (t === 'spoiler') return <span style={{ background: '#333', color: '#333', borderRadius: 3 }} onClick={e => { e.currentTarget.style.color = '#fff' }} title="Спойлер — клик показать">{text}</span>

  const linkStyle = getLinkStyle(isOutgoing)
  const mentionStyle = getMentionStyle(isOutgoing)

  if (t === 'url') {
    const full = /^[a-zA-Z]+:\/\//.test(text) ? text : `https://${text}`
    return <a href={full} title={full} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={e => { e.preventDefault(); safeOpenUrl(full) }} onContextMenu={e => onLinkContextMenu?.(e, full)}>{text}</a>
  }
  if (t === 'texturl') {
    const full = /^[a-zA-Z]+:\/\//.test(entity.url) ? entity.url : `https://${entity.url}`
    return <a href={full} title={full} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={e => { e.preventDefault(); safeOpenUrl(full) }} onContextMenu={e => onLinkContextMenu?.(e, full)}>{text}</a>
  }
  if (t === 'email') return <a href={`mailto:${text}`} title={`Написать на ${text}`} style={linkStyle} onClick={e => { e.preventDefault(); try { window.api?.invoke('app:open-external', `mailto:${text}`) } catch (_) {} }} onContextMenu={e => onLinkContextMenu?.(e, text, true)}>{text}</a>
  if (t === 'phone') return <a href={`tel:${text}`} title={`Позвонить ${text}`} style={linkStyle}>{text}</a>
  if (t === 'mention' || t === 'mentionname' || t === 'hashtag' || t === 'cashtag' || t === 'botcommand') {
    return <span style={mentionStyle}>{text}</span>
  }
  return text
}

// Авто-детект ссылок, email и хэштегов в тексте без entities
function AutoLinks({ text, isOutgoing, onLinkContextMenu }) {
  if (!text) return null
  // v1.2.514: поддержка auto-detect email (включая знак + для alias) и t.me/https
  const re = /(https?:\/\/\S+|t\.me\/\S+|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+|#\w+|@\w+)/g
  const parts = []
  let last = 0
  let m

  const linkStyle = getLinkStyle(isOutgoing)
  const mentionStyle = getMentionStyle(isOutgoing)

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('http') || token.startsWith('t.me')) {
      const url = /^[a-zA-Z]+:\/\//.test(token) ? token : `https://${token}`
      parts.push(<a key={m.index} href={url} title={url} style={linkStyle}
        onClick={e => { e.preventDefault(); safeOpenUrl(url) }}
        onContextMenu={e => onLinkContextMenu?.(e, url)}>{token}</a>)
    } else if (token.includes('@') && !token.startsWith('@')) {
      parts.push(<a key={m.index} href={`mailto:${token}`} title={`Написать на ${token}`} style={linkStyle}
        onClick={e => { e.preventDefault(); try { window.api?.invoke('app:open-external', `mailto:${token}`) } catch (_) {} }}
        onContextMenu={e => onLinkContextMenu?.(e, token, true)}>{token}</a>)
    } else {
      parts.push(<span key={m.index} style={mentionStyle}>{token}</span>)
    }
    last = m.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
