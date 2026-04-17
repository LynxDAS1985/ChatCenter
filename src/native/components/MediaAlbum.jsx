// v0.87.31: альбом из нескольких медиа-сообщений с одним groupedId.
// Показывает ВСЕ фото сеткой (без «+N» ограничения) — каждое кликабельно.
// Layout: 1→full, 2→2x1, 3→L-форма, 4→2x2, 5+→3 колонки.
// Клик → PhotoViewer window с массивом srcs и индексом нажатого.
import { useEffect, useRef, useState } from 'react'
import FormattedText from './FormattedText.jsx'
import VideoTile from './VideoTile.jsx'

// v0.87.39: Постер видео для альбома (как в Telegram Desktop).
// objectFit: cover, ▶ по центру, duration в углу. Клик → скачивание + отдельное окно.
function VideoPosterTile({ m, chatId, downloadMedia }) {
  const [posterUrl, setPosterUrl] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)

  // v0.87.39: thumb=false для нормального постера (не blur).
  // thumb=true даёт stripped ~10КБ = мутное. thumb=false = полный кадр ~100-300КБ.
  useEffect(() => {
    let cancelled = false
    downloadMedia?.(chatId, m.id, false).then(r => {
      if (!cancelled && r?.ok) setPosterUrl(r.path)
    })
    return () => { cancelled = true }
  }, [m.id])

  useEffect(() => {
    if (!downloading) return
    const sub = window.api?.on?.('tg:media-progress', (data) => {
      if (data.chatId !== chatId || String(data.messageId) !== String(m.id)) return
      if (data.total > 0) setProgress(Math.min(1, data.bytes / data.total))
    })
    return () => { try { sub?.() } catch(_) {} }
  }, [downloading])

  const handleClick = async () => {
    if (downloading) return
    setDownloading(true); setProgress(0)
    try {
      const r = await window.api?.invoke('tg:download-video', { chatId, messageId: m.id })
      if (r?.ok) {
        await window.api?.invoke('video:open', {
          src: r.path, title: m.mediaPreview || 'Видео',
          width: m.mediaWidth || 0, height: m.mediaHeight || 0,
        })
      }
    } finally { setDownloading(false); setProgress(0) }
  }

  const dur = m.duration ? (m.duration >= 3600
    ? `${Math.floor(m.duration/3600)}:${String(Math.floor(m.duration%3600/60)).padStart(2,'0')}:${String(Math.round(m.duration%60)).padStart(2,'0')}`
    : `${Math.floor(m.duration/60)}:${String(Math.round(m.duration%60)).padStart(2,'0')}`) : ''

  return (
    <div onClick={handleClick} style={{
      position: 'relative', width: '100%', height: '100%', cursor: 'pointer',
      background: m.strippedThumb ? `url("${m.strippedThumb}") center/cover no-repeat` : 'rgba(0,0,0,0.3)',
    }}>
      {posterUrl && <img src={posterUrl} alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', animation: 'native-fadein 0.25s ease',
      }} />}
      {!downloading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.15)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            border: '2px solid rgba(255,255,255,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 20, paddingLeft: 3,
          }}>▶</div>
        </div>
      )}
      {downloading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.25)', borderTopColor: '#fff',
            animation: 'native-spin 0.9s linear infinite',
          }} />
          <div style={{ marginTop: 6 }}>{Math.round(progress * 100)}%</div>
        </div>
      )}
      {dur && !downloading && (
        <div style={{
          position: 'absolute', bottom: 6, left: 6,
          background: 'rgba(0,0,0,0.6)', color: '#fff',
          fontSize: 11, padding: '2px 6px', borderRadius: 4,
        }}>{dur}</div>
      )}
    </div>
  )
}

function PhotoTile({ m, chatId, downloadMedia, onClick, registerSrc, idx }) {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // v0.87.34: video — используем VideoTile (с ▶, прогрессом, отдельным player окном)
  // v0.87.39: В АЛЬБОМЕ видео = постер + ▶ (как в Telegram Desktop).
  // НЕ inline <video controls> — он раздувает ячейку и обрезается.
  // Клик → скачивание + отдельное окно.
  if (m.mediaType === 'video') {
    return <VideoPosterTile m={m} chatId={chatId} downloadMedia={downloadMedia} />
  }

  useEffect(() => {
    let cancelled = false
    if (m.mediaType !== 'photo') return
    setLoading(true)
    setError(false)
    downloadMedia(chatId, m.id, false).then(r => {
      if (cancelled) return
      if (r?.ok) {
        setUrl(r.path)
        registerSrc?.(idx, r.path)
      } else {
        setError(true)
      }
    }).catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [m.id])

  return (
    <div
      onClick={() => url && onClick?.(idx, url)}
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
      {!url && !loading && error && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            setError(false); setLoading(true)
            downloadMedia(chatId, m.id, false).then(r => {
              if (r?.ok) { setUrl(r.path); registerSrc?.(idx, r.path) }
              else setError(true)
            }).finally(() => setLoading(false))
          }}
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 11,
            cursor: 'pointer', textAlign: 'center', padding: 6,
          }}
        >↻ клик — загрузить</div>
      )}
    </div>
  )
}

// Собираем srcs массив для PhotoViewer по мере загрузки.
function useAlbumSrcs(count) {
  const [srcs, setSrcs] = useState(() => new Array(count).fill(null))
  const register = (idx, src) => {
    setSrcs(prev => {
      if (prev[idx] === src) return prev
      const next = prev.slice()
      next[idx] = src
      return next
    })
  }
  return [srcs, register]
}

export default function MediaAlbum({ album, chatId, downloadMedia, onPhotoOpen }) {
  const all = album.msgs.filter(m => m.mediaType === 'photo' || m.mediaType === 'video')
  const n = all.length
  const [srcs, registerSrc] = useAlbumSrcs(n)

  // v0.87.39: сетка для ВСЕХ (фото + видео-постеры). Видео показывается как постер
  // с objectFit:cover (как в Telegram Desktop), не как <video controls>.
  const hasVideo = all.some(m => m.mediaType === 'video')
  let gridStyle
  if (n === 1) {
    gridStyle = { gridTemplateColumns: '1fr' }
  } else if (n === 2) {
    gridStyle = { gridTemplateColumns: 'repeat(2, 1fr)', gridAutoRows: '1fr' }
  } else if (n === 3) {
    gridStyle = { gridTemplate: `"a a" 1fr "b c" 1fr / 1fr 1fr` }
  } else if (n === 4) {
    gridStyle = { gridTemplateColumns: 'repeat(2, 1fr)', gridAutoRows: '1fr' }
  } else {
    gridStyle = { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '1fr' }
  }

  const rows = n <= 1 ? 1 : n === 2 ? 1 : n === 3 ? 2 : n === 4 ? 2 : Math.ceil(n / 3)
  const minHeight = Math.min(520, rows * 160)

  const textMsg = album.msgs.find(m => m.text) || album.msgs[0]

  const handleTileClick = (idx, url) => {
    // Собираем массив src'ов: для не загруженных — передаём strippedThumb как placeholder
    const allSrcs = all.map((m, i) => srcs[i] || m.strippedThumb || null).filter(Boolean)
    // Индекс нажатого — относительно отфильтрованного всё-что-есть, но ищем по точному URL
    const realIdx = Math.max(0, allSrcs.indexOf(url))
    onPhotoOpen?.({ srcs: allSrcs, index: realIdx })
  }

  return (
    <div style={{
      display: 'grid',
      ...gridStyle,
      gap: 3,
      width: '100%',
      minHeight,
      maxHeight: 700,
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: textMsg?.text ? 6 : 0,
    }}>
      {all.map((m, i) => (
        <div key={m.id} style={
          n === 3 && i === 0 ? { gridArea: 'a' }
          : n === 3 && i === 1 ? { gridArea: 'b' }
          : n === 3 && i === 2 ? { gridArea: 'c' }
          : undefined
        }>
          <PhotoTile
            m={m} chatId={chatId}
            downloadMedia={downloadMedia}
            onClick={handleTileClick}
            registerSrc={registerSrc}
            idx={i}
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
  const ref = useRef(null)

  // v0.87.33: IntersectionObserver — при реальной видимости альбома помечаем
  // ВСЕ сообщения альбома как прочитанные (в MTProto альбом = N messages, каждое
  // увеличивает server unreadCount → счётчик не уменьшался если помечать только firstMsg).
  useEffect(() => {
    if (!onVisible || !ref.current) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        for (const m of album.msgs) onVisible(m)
      }
    }, { threshold: 0.15 })  // v0.87.34: снизили для надёжности
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [album.msgs.map(m => m.id).join(',')])

  return (
    <div
      ref={ref}
      data-msg-id={firstMsg.id}
      style={{
        alignSelf: isOutgoing ? 'flex-end' : 'flex-start',
        maxWidth: 'min(520px, 80%)',
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
        <MediaAlbum album={album} chatId={chatId} downloadMedia={downloadMedia} onPhotoOpen={onPhotoOpen} />
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
