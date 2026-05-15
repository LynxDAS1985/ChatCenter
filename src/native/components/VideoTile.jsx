// v0.87.36: Inline video plays с кнопками ⛶ (отдельное окно) + 📌 (PiP).
// Flow:
//   1. Монтируется → грузим только thumb (постер), ~20-80 КБ
//   2. Клик ▶ → tg:download-video (прогресс-бар), после окончания → <video controls autoplay inline>
//   3. Кнопки ⛶ / 📌 поверх playing video → переводят в отдельное окно с той же секунды
//   4. IntersectionObserver — auto-pause если видео уехало из viewport
// v0.89.15: УБРАН progressive playback. Видео всегда ждёт полной загрузки
// перед стартом — иначе TDLib чистит temp/ файл и плеер падает (ENOENT,
// PIPELINE_ERROR_DECODE, перезапуск с 0:00). См. ловушка «временные файлы
// TDLib» в .memory-bank/mistakes/tdlib-video-player.md.
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

// v0.89.13: пишем в main-логфайл (chatcenter.log) — чтобы видеть события
// плеера в "Логи ChatCenter" окне БЕЗ открытия DevTools. Используется для
// диагностики PIPELINE_ERROR_DECODE и других проблем со <video>.
function logToMain(level, message) {
  try {
    if (window.api?.send) {
      window.api.send('app:log', { level, message: '[VideoTile] ' + message })
    }
  } catch (_) {}
}

// inAlbum — если true, используем компактный режим без minHeight (для grid-ячейки)
export default function VideoTile({ m, chatId, inAlbum }) {
  const [posterUrl, setPosterUrl] = useState(null)
  const [videoSrc, setVideoSrc] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const unsubRef = useRef(null)

  // v0.89.16: качаем именно thumbnail (~10-100 КБ JPEG-кадр), а не полное видео.
  // Раньше вызывали tg:download-media с thumb:false — это ошибочно качало
  // полный mp4 (десятки МБ) на каждое появление видео в чате. См. ловушка #10
  // в .memory-bank/mistakes/tdlib-video-player.md.
  useEffect(() => {
    let cancelled = false
    window.api?.invoke('tg:download-thumbnail', { chatId, messageId: m.id }).then(r => {
      if (cancelled) return
      if (r?.ok) setPosterUrl(r.path)
    })
    return () => { cancelled = true }
  }, [m.id])

  // v0.89.15: прогресс показывается только пока downloading=true (постер со
  // спиннером). После полной загрузки videoSrc стабилен, ничего не качается.
  useEffect(() => {
    if (!downloading) return
    const sub = window.api?.on?.('tg:media-progress', (data) => {
      if (data.chatId !== chatId || String(data.messageId) !== String(m.id)) return
      if (data.total > 0) {
        const ratio = Math.min(1, data.bytes / data.total)
        setProgress(ratio)
      }
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
      console.log('[VideoTile] tg:download-video result:', {
        ok: r?.ok, path: r?.path, fileSize: r?.file?.size,
        completed: r?.file?.local?.is_downloading_completed,
        error: r?.error,
      })
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
        width: m.mediaWidth || 0, height: m.mediaHeight || 0,
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
          minHeight: inAlbum ? 0 : 180,
          maxHeight: inAlbum ? '100%' : 420,
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
          // v0.89.13: события пишутся И в Console И в main-логфайл chatcenter.log
          // (через IPC app:log). Так можно смотреть «Логи ChatCenter» окно
          // без открытия DevTools.
          onLoadStart={() => {
            console.log('[VideoTile] <video> loadstart src=', videoSrc)
            logToMain('INFO', 'loadstart src=' + (videoSrc || '').slice(0, 120))
          }}
          onLoadedMetadata={(e) => {
            const info = 'loadedmetadata duration=' + e.target.duration +
              ' size=' + e.target.videoWidth + 'x' + e.target.videoHeight
            console.log('[VideoTile] <video>', info)
            logToMain('INFO', info)
          }}
          onCanPlay={() => {
            console.log('[VideoTile] <video> canplay')
            logToMain('INFO', 'canplay')
          }}
          onStalled={() => {
            console.warn('[VideoTile] <video> STALLED (буфер не наполняется)')
            logToMain('WARN', 'STALLED (буфер не наполняется)')
          }}
          onSeeking={(e) => {
            // v0.89.13: логируем перемотку для отладки PIPELINE_ERROR_DECODE
            const buf = e.target.buffered
            const bufRanges = []
            for (let i = 0; i < buf.length; i++) bufRanges.push(buf.start(i).toFixed(1) + '-' + buf.end(i).toFixed(1))
            logToMain('INFO', 'seeking to=' + e.target.currentTime.toFixed(1) +
              ' buffered=[' + bufRanges.join(',') + ']' +
              ' readyState=' + e.target.readyState)
          }}
          onError={(e) => {
            const err = e.target.error
            const info = {
              code: err?.code, message: err?.message,
              readyState: e.target.readyState, networkState: e.target.networkState,
              currentTime: e.target.currentTime,
              duration: e.target.duration,
              src: (videoSrc || '').slice(0, 120),
            }
            console.error('[VideoTile] <video> error:', info)
            logToMain('ERROR', '<video> error: code=' + info.code +
              ' message=' + (info.message || '?') +
              ' readyState=' + info.readyState +
              ' networkState=' + info.networkState +
              ' currentTime=' + info.currentTime?.toFixed(1) +
              ' duration=' + info.duration?.toFixed(1) +
              ' src=' + info.src)
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
        {/* v0.89.15: индикатор «фоновой загрузки» удалён — видео всегда
            играется только после полной загрузки. Прогресс виден на постере
            до начала проигрывания (см. секцию `downloading` ниже). */}
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
