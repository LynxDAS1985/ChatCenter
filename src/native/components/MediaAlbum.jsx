// v0.87.29: альбом из нескольких медиа-сообщений с одним groupedId.
// Показывает сетку до 4 превью, если больше — «+N ещё» на последнем.
// Клик по любому превью → открывает PhotoViewer окно (photo:open IPC).
import { useEffect, useState } from 'react'
import FormattedText from './FormattedText.jsx'

function PhotoTile({ m, chatId, downloadMedia, onOpen, extraLabel }) {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (m.mediaType !== 'photo' && m.mediaType !== 'video') return
    setLoading(true)
    downloadMedia(chatId, m.id, false).then(r => {
      if (cancelled) return
      if (r?.ok) setUrl(r.path)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [m.id])

  return (
    <div
      onClick={() => url && onOpen?.(url)}
      style={{
        position: 'relative',
        width: '100%', height: '100%',
        overflow: 'hidden',
        background: m.strippedThumb ? `url("${m.strippedThumb}") center/cover no-repeat` : 'rgba(0,0,0,0.35)',
        cursor: url ? 'zoom-in' : 'default',
      }}
    >
      {url && (
        <img src={url} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', animation: 'native-fadein 0.25s ease',
        }} />
      )}
      {!url && loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.15)',
        }}>
          <span className="native-spinner" />
        </div>
      )}
      {m.mediaType === 'video' && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          background: 'rgba(0,0,0,0.6)', color: '#fff',
          padding: '2px 6px', borderRadius: 4, fontSize: 10,
        }}>📹</div>
      )}
      {extraLabel && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 700,
        }}>+{extraLabel}</div>
      )}
    </div>
  )
}

export default function MediaAlbum({ album, chatId, downloadMedia, onPhotoOpen, isOutgoing }) {
  // Берём первые 4 для сетки, если больше — на 4м показываем «+N»
  const all = album.msgs.filter(m => m.mediaType === 'photo' || m.mediaType === 'video')
  const visible = all.slice(0, 4)
  const rest = all.length - visible.length
  const n = visible.length

  // Простая сетка: 1→1x1, 2→2x1, 3→2x2 (с 1-шириной первого), 4+→2x2
  let cols = 2
  let gridTemplate = null
  if (n === 1) { cols = 1 }
  else if (n === 2) { cols = 2 }
  else if (n === 3) { gridTemplate = `
    "a a" 1fr
    "b c" 1fr / 1fr 1fr
  `}
  else { cols = 2 }

  const textMsg = album.msgs.find(m => m.text) || album.msgs[0]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: gridTemplate ? undefined : `repeat(${cols}, 1fr)`,
      gridTemplate: gridTemplate || undefined,
      gap: 3,
      aspectRatio: n === 1 ? '4 / 3' : '1 / 1',
      width: '100%',
      minHeight: 220,
      maxHeight: 500,
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: textMsg?.text ? 6 : 0,
    }}>
      {visible.map((m, i) => (
        <div key={m.id} style={n === 3 && i === 0 ? { gridArea: 'a' } : n === 3 && i === 1 ? { gridArea: 'b' } : n === 3 && i === 2 ? { gridArea: 'c' } : undefined}>
          <PhotoTile
            m={m} chatId={chatId}
            downloadMedia={downloadMedia}
            onOpen={onPhotoOpen}
            extraLabel={i === visible.length - 1 && rest > 0 ? rest : null}
          />
        </div>
      ))}
    </div>
  )
}

// Сам контейнер-бубл вокруг альбома (с текстом, meta и т.д. — аналог MessageBubble)
export function AlbumBubble({ album, chatId, downloadMedia, onPhotoOpen, onReply, onEdit, onDelete, onForward, onPin, onReplyClick, getMessage, onVisible }) {
  const [menu, setMenu] = useState(false)
  const firstMsg = album.msgs[0]
  const text = album.msgs.map(m => m.text).filter(Boolean).join('\n')
  const isOutgoing = album.isOutgoing
  const replyToMsg = album.replyToId && getMessage ? getMessage(chatId, album.replyToId) : null

  // Visibility — сообщаем о первом в альбоме (для read-receipt)
  useEffect(() => {
    if (!onVisible) return
    onVisible(firstMsg)
  }, [firstMsg.id])

  return (
    <div
      data-msg-id={firstMsg.id}
      style={{
        alignSelf: isOutgoing ? 'flex-end' : 'flex-start',
        maxWidth: 'min(480px, 75%)',
        minWidth: 280,
        position: 'relative',
      }}
      onMouseEnter={() => setMenu(true)}
      onMouseLeave={() => setMenu(false)}
    >
      <div style={{
        padding: 4, borderRadius: 12,
        background: isOutgoing ? 'var(--amoled-accent)' : 'var(--amoled-surface-hover)',
        color: isOutgoing ? '#fff' : 'var(--amoled-text)',
        fontSize: 14, wordBreak: 'break-word',
        border: isOutgoing ? 'none' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: isOutgoing ? '0 0 12px rgba(42,171,238,0.15)' : 'none',
      }}>
        {replyToMsg && (
          <div
            onClick={(e) => { e.stopPropagation(); onReplyClick?.(replyToMsg.id) }}
            style={{
              borderLeft: '3px solid rgba(255,255,255,0.4)',
              paddingLeft: 8, marginBottom: 4,
              marginLeft: 8, marginRight: 8, marginTop: 6,
              fontSize: 12, opacity: 0.8,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            ↪ {replyToMsg.text?.slice(0, 80) || '[медиа]'}
          </div>
        )}
        <MediaAlbum album={album} chatId={chatId} downloadMedia={downloadMedia} onPhotoOpen={onPhotoOpen} isOutgoing={isOutgoing} />
        {text && (
          <div style={{ whiteSpace: 'pre-wrap', padding: '4px 8px 0' }}>
            <FormattedText text={text} entities={firstMsg.entities} />
          </div>
        )}
        <div style={{
          fontSize: 10, opacity: 0.75, marginTop: 2, textAlign: 'right',
          padding: '2px 8px 4px',
        }}>
          {new Date(firstMsg.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
          {isOutgoing && (
            <span style={{ marginLeft: 4, fontSize: 11 }} title={firstMsg.isRead ? 'Прочитано' : 'Отправлено'}>
              {firstMsg.isRead ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
      {/* Мини-меню — оперируем первым сообщением альбома */}
      {menu && (onReply || onForward) && (
        <div style={{
          position: 'absolute', top: -4,
          [isOutgoing ? 'left' : 'right']: -4,
          display: 'flex', gap: 2,
          background: 'var(--amoled-surface)',
          border: '1px solid var(--amoled-border)',
          borderRadius: 6, padding: 2,
        }}>
          <button onClick={() => onReply?.(firstMsg)} title="Ответить" style={miniBtn}>↪</button>
          {onForward && <button onClick={() => onForward(firstMsg)} title="Переслать" style={miniBtn}>➥</button>}
          {onPin && <button onClick={() => onPin(firstMsg)} title="Закрепить" style={miniBtn}>📌</button>}
          {isOutgoing && onDelete && <button onClick={() => onDelete(firstMsg)} title="Удалить" style={{...miniBtn, color: 'var(--amoled-danger)'}}>🗑</button>}
        </div>
      )}
    </div>
  )
}

const miniBtn = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  padding: '2px 6px', fontSize: 12, color: 'var(--amoled-text)',
  borderRadius: 4,
}
