// v0.87.34: плитка видео для ленты (Variant A — poster + streaming).
// Показывает: постер (thumb) + ▶ кнопка + продолжительность + размер файла.
// При клике: скачивается полный файл с прогресс-баром, потом открывается
// отдельное окно плеера (video:open IPC) со streaming через cc-media://.
// До клика НЕ качает полный видео-файл, экономит трафик.
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

export default function VideoTile({ m, chatId, onPosterLoaded }) {
  const [posterUrl, setPosterUrl] = useState(null)
  const [loadingPoster, setLoadingPoster] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)  // 0..1
  const [error, setError] = useState(null)
  const unsubRef = useRef(null)

  // Загружаем постер (thumb) сразу при монтировании — лёгкий, 20-80 КБ
  useEffect(() => {
    let cancelled = false
    setLoadingPoster(true)
    window.api?.invoke('tg:download-media', { chatId, messageId: m.id, thumb: true }).then(r => {
      if (cancelled) return
      if (r?.ok) { setPosterUrl(r.path); onPosterLoaded?.(r.path) }
    }).finally(() => { if (!cancelled) setLoadingPoster(false) })
    return () => { cancelled = true }
  }, [m.id])

  // Подписка на progress events main-процесса
  useEffect(() => {
    if (!downloading) return
    const sub = window.api?.on?.('tg:media-progress', (data) => {
      if (data.chatId !== chatId || String(data.messageId) !== String(m.id)) return
      if (data.total > 0) setProgress(Math.min(1, data.bytes / data.total))
    })
    if (typeof sub === 'function') unsubRef.current = sub
    return () => { try { unsubRef.current?.() } catch(_) {} }
  }, [downloading, m.id, chatId])

  const handlePlay = async (e) => {
    e.stopPropagation()
    if (downloading) return
    setError(null)
    setDownloading(true)
    setProgress(0)
    try {
      const r = await window.api?.invoke('tg:download-video', { chatId, messageId: m.id })
      if (!r?.ok) { setError(r?.error || 'Не удалось скачать'); return }
      // Открываем отдельное окно плеера
      await window.api?.invoke('video:open', {
        src: r.path,
        title: m.mediaPreview || 'Видео',
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloading(false)
      setProgress(0)
    }
  }

  const aspect = m.mediaWidth && m.mediaHeight ? `${m.mediaWidth} / ${m.mediaHeight}` : '16 / 9'

  return (
    <div
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

      {/* Центральная кнопка ▶ */}
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
            color: '#fff', fontSize: 28,
            paddingLeft: 4,  // оптически центрируем треугольник ▶
            transition: 'transform 0.15s, background 0.15s',
          }}>▶</div>
        </div>
      )}

      {/* Прогресс-бар скачивания */}
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
          {/* Нижняя полоска */}
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

      {/* Duration / размер overlay в углу */}
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

      {/* Ошибка */}
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
