// v0.87.36: Inline video plays с кнопками ⛶ (отдельное окно) + 📌 (PiP).
// Flow:
//   1. Монтируется → грузим только thumb (постер), ~20-80 КБ
//   2. Клик ▶ → tg:download-video (прогресс-бар), после окончания → <video controls autoplay inline>
//   3. Кнопки ⛶ / 📌 поверх playing video → переводят в отдельное окно с той же секунды
//   4. IntersectionObserver — auto-pause если видео уехало из viewport
import { useEffect, useState, useRef } from 'react'

function formatDuration(sec) {
  if (!sec) return ''
  const s = Math.round(sec)
  const mm = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  if (mm < 60) return `${mm}:${ss}`
  const hh = Math.floor(mm / 60)
  const m2 = String(mm % 60).padStart(2, '0')
  return `${hh}:${m2}:${ss}`
}
function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' Б'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' КБ'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' МБ'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' ГБ'
}

export default function VideoTile({ m, chatId }) {
  const [posterUrl, setPosterUrl] = useState(null)
  const [videoSrc, setVideoSrc] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const unsubRef = useRef(null)

  // Загружаем постер (thumb) сразу — лёгкий, ~20-80 КБ
  useEffect(() => {
    let cancelled = false
    window.api?.invoke('tg:download-media', { chatId, messageId: m.id, thumb: true }).then(r => {
      if (cancelled) return
      if (r?.ok) setPosterUrl(r.path)
    })
    return () => { cancelled = true }
  }, [m.id])

  // Прогресс скачивания
  useEffect(() => {
    if (!downloading) return
    const sub = window.api?.on?.('tg:media-progress', (data) => {
      if (data.chatId !== chatId || String(data.messageId) !== String(m.id)) return
      if (data.total > 0) setProgress(Math.min(1, data.bytes / data.total))
    })
    if (typeof sub === 'function') unsubRef.current = sub
    return () => { try { unsubRef.current?.() } catch(_) {} }
  }, [downloading, m.id, chatId])

  // Auto-pause при уходе из viewport
  useEffect(() => {
    if (!playing || !containerRef.current) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause()
      }
    }, { threshold: 0.1 })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [playing])

  const handlePlay = async (e) => {
    e?.stopPropagation?.()
    if (downloading) return
    if (videoSrc) { setPlaying(true); return }
    setError(null)
    setDownloading(true)
    setProgress(0)
    try {
      const r = await window.api?.invoke('tg:download-video', { chatId, messageId: m.id })
      if (!r?.ok) { setError(r?.error || 'Не удалось скачать'); return }
      setVideoSrc(r.path)
      setPlaying(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloading(false)
      setProgress(0)
    }
  }

  // Открыть в отдельном окне с той же секунды
  const handleExpand = async (e) => {
    e.stopPropagation()
    const time = videoRef.current?.currentTime || 0
    videoRef.current?.pause()
    try {
      await window.api?.invoke('video:open', {
        src: videoSrc, title: m.mediaPreview || 'Видео', startTime: time,
      })
    } catch(_) {}
  }

  // PiP через main-процесс (отдельное frameless окно 480×270 alwaysOnTop)
  const handlePip = async (e) => {
    e.stopPropagation()
    const time = videoRef.current?.currentTime || 0
    videoRef.current?.pause()
    try {
      await window.api?.invoke('video:open', {
        src: videoSrc, title: m.mediaPreview || 'Видео', startTime: time, pip: true,
      })
    } catch(_) {}
  }

  const aspect = m.mediaWidth && m.mediaHeight ? `${m.mediaWidth} / ${m.mediaHeight}` : '16 / 9'

  // Если играет inline — показываем <video>
  if (playing && videoSrc) {
    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: aspect,
          minHeight: 180,
          maxHeight: 420,
          borderRadius: 8,
          overflow: 'hidden',
          background: '#000',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          autoPlay
          playsInline
          preload="auto"
          style={{
            width: '100%', height: '100%',
            objectFit: 'contain',
            background: '#000',
          }}
        />
        {/* v0.87.38: только ⛶ кнопка — 📌 доступна внутри отдельного окна, не в чате */}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          <button
            onClick={handleExpand}
            title="Открыть в отдельном окне"
            style={videoBtnStyle}
          >⛶</button>
        </div>
      </div>
    )
  }

  // Постер с ▶ (до клика)
  return (
    <div
      ref={containerRef}
      onClick={handlePlay}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: aspect,
        minHeight: 180,
        maxHeight: 420,
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        background: m.strippedThumb ? `url("${m.strippedThumb}") center/cover no-repeat` : 'rgba(0,0,0,0.3)',
      }}
    >
      {posterUrl && (
        <img src={posterUrl} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', animation: 'native-fadein 0.25s ease',
        }} />
      )}

      {!downloading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.15)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
            border: '2px solid rgba(255,255,255,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 28, paddingLeft: 4,
          }}>▶</div>
        </div>
      )}

      {downloading && (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff', fontSize: 12, gap: 10,
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.25)',
              borderTopColor: '#fff',
              animation: 'native-spin 0.9s linear infinite',
            }} />
            <div>{Math.round(progress * 100)}%</div>
            {m.fileSize && <div style={{ opacity: 0.7, fontSize: 11 }}>
              {formatSize(Math.round(progress * m.fileSize))} / {formatSize(m.fileSize)}
            </div>}
          </div>
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: 3, background: 'rgba(0,0,0,0.4)',
          }}>
            <div style={{
              height: '100%', width: `${progress * 100}%`,
              background: 'var(--amoled-accent)', transition: 'width 0.15s',
            }} />
          </div>
        </>
      )}

      {!downloading && (m.duration || m.fileSize) && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          color: '#fff', fontSize: 11, fontWeight: 500,
          padding: '3px 8px', borderRadius: 6,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {m.duration && <span>▶ {formatDuration(m.duration)}</span>}
          {m.fileSize && <span style={{ opacity: 0.8 }}>· {formatSize(m.fileSize)}</span>}
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)',
          color: '#ff6b6b', fontSize: 12, padding: 14, textAlign: 'center',
        }}>⚠️ {error}</div>
      )}
    </div>
  )
}

const videoBtnStyle = {
  width: 32, height: 32,
  border: 'none',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(8px)',
  color: '#fff',
  fontSize: 16,
  cursor: 'pointer',
  pointerEvents: 'auto',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.15s',
}
