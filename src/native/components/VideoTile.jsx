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

// inAlbum — если true, используем компактный режим без minHeight (для grid-ячейки)
export default function VideoTile({ m, chatId, inAlbum }) {
  const [posterUrl, setPosterUrl] = useState(null)
  const [videoSrc, setVideoSrc] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  // v0.89.11: partial=true когда видео скачивается в фоне (progressive playback).
  // Используем для показа индикатора «Загрузка X%» в углу видео пока играет.
  const [partial, setPartial] = useState(false)
  const [error, setError] = useState(null)
  // v0.89.12: счётчик попыток воспроизведения. Используется как React key на
  // <video> — инкремент перемонтирует элемент с новым decoder instance.
  // Стандартное восстановление для MEDIA_ERR_DECODE (код 3) по MDN.
  const [playAttempt, setPlayAttempt] = useState(0)
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const unsubRef = useRef(null)

  // Загружаем постер (thumb) сразу — лёгкий, ~20-80 КБ
  useEffect(() => {
    let cancelled = false
    // v0.87.39: thumb=false для чёткого постера (не blur)
    window.api?.invoke('tg:download-media', { chatId, messageId: m.id, thumb: false }).then(r => {
      if (cancelled) return
      if (r?.ok) setPosterUrl(r.path)
    })
    return () => { cancelled = true }
  }, [m.id])

  // Прогресс скачивания. v0.89.11: слушаем пока downloading ИЛИ partial
  // (для progressive playback — индикатор «Загрузка X%» во время воспроизведения
  // пока TDLib докачивает в фоне).
  useEffect(() => {
    if (!downloading && !partial) return
    const sub = window.api?.on?.('tg:media-progress', (data) => {
      if (data.chatId !== chatId || String(data.messageId) !== String(m.id)) return
      if (data.total > 0) {
        const ratio = Math.min(1, data.bytes / data.total)
        setProgress(ratio)
        // v0.89.11: когда докачали полностью — снимаем флаг partial и убираем индикатор
        if (ratio >= 1) setPartial(false)
      }
    })
    if (typeof sub === 'function') unsubRef.current = sub
    return () => { try { unsubRef.current?.() } catch(_) {} }
  }, [downloading, partial, m.id, chatId])

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
      // v0.89.10: диагностика — логируем что получили от backend
      console.log('[VideoTile] tg:download-video result:', {
        ok: r?.ok, path: r?.path, partial: r?.partial, fileSize: r?.file?.size,
        downloaded: r?.file?.local?.downloaded_size,
        prefix: r?.file?.local?.downloaded_prefix_size,
        completed: r?.file?.local?.is_downloading_completed,
        error: r?.error,
      })
      if (!r?.ok) { setError(r?.error || 'Не удалось скачать'); return }
      setVideoSrc(r.path)
      // v0.89.11: запоминаем что файл ещё скачивается (для индикатора в углу).
      // r.partial=true когда supports_streaming=true и резолв early на 256 KB.
      setPartial(!!r.partial)
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

  // v0.89.11: открыть видео в отдельном окне плеера (там есть codec-error
  // fallback с кнопкой «Открыть во внешнем плеере» — VLC/Movies&TV).
  const handleOpenFullPlayer = async (e) => {
    e?.stopPropagation?.()
    try {
      await window.api?.invoke('video:open', {
        src: videoSrc, title: m.mediaPreview || 'Видео',
        width: m.mediaWidth || 0, height: m.mediaHeight || 0,
      })
    } catch (_) {}
  }

  // v0.89.12: перезапустить inline-плеер с новым decoder instance. По MDN это
  // стандартное восстановление для MEDIA_ERR_DECODE (код 3) — большинство
  // случаев решаются перемонтированием <video> элемента. Если ошибка persistent
  // (битый файл целиком) — юзер увидит ту же ошибку снова и сможет открыть в
  // отдельном плеере (там VLC-фолбэк).
  const handleRetry = (e) => {
    e?.stopPropagation?.()
    setError(null)
    setPlayAttempt(p => p + 1)
  }

  // Если играет inline — показываем <video>
  if (playing && videoSrc) {
    // v0.89.11: при ошибке codec/декодера (MediaError code=4) — показываем
    // понятное сообщение + кнопку открытия в полном плеере (там есть fallback
    // на внешний плеер VLC). Раньше ошибка только setError'илась но UI её не
    // показывал в playing-state → юзер видел чёрный 0:00 без понимания почему.
    if (error) {
      return (
        <div
          ref={containerRef}
          style={{
            position: 'relative', width: '100%', aspectRatio: aspect,
            minHeight: inAlbum ? 0 : 180, maxHeight: inAlbum ? '100%' : 420,
            borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20, gap: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 14, color: '#fff', textAlign: 'center', maxWidth: 320 }}>
            ⚠️ Не удалось воспроизвести видео
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 320 }}>
            {error}
          </div>
          {/* v0.89.12: «Перезапустить» — пересоздаёт <video> с новым decoder
              (по MDN стандартное восстановление для MEDIA_ERR_DECODE) */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={handleRetry}
              style={{
                background: 'var(--amoled-accent)', color: '#fff', border: 0,
                padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
              }}
            >🔄 Перезапустить</button>
            <button
              onClick={handleOpenFullPlayer}
              style={{
                background: 'rgba(255,255,255,0.15)', color: '#fff', border: 0,
                padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
              }}
            >🎬 Открыть в плеере</button>
          </div>
        </div>
      )
    }
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
          key={playAttempt}
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
          onLoadStart={() => console.log('[VideoTile] <video> loadstart src=', videoSrc)}
          onLoadedMetadata={(e) => console.log('[VideoTile] <video> loadedmetadata: duration=', e.target.duration, 'size=', e.target.videoWidth + 'x' + e.target.videoHeight)}
          onCanPlay={() => console.log('[VideoTile] <video> canplay')}
          onStalled={() => console.warn('[VideoTile] <video> STALLED (буфер не наполняется)')}
          onError={(e) => {
            const err = e.target.error
            console.error('[VideoTile] <video> error:', {
              code: err?.code, message: err?.message,
              readyState: e.target.readyState, networkState: e.target.networkState,
              src: videoSrc,
            })
            setError(`Ошибка плеера (код ${err?.code || '?'}): ${err?.message || 'неизвестно'}`)
          }}
          // v0.89.11: блокируем перемотку за пределы загруженного буфера —
          // иначе <video> зависает на попытке прочитать байты которых ещё нет
          // (TDLib скачивает последовательно от offset=0). HTMLMediaElement
          // .buffered — список загруженных временных интервалов; ищем
          // максимальный end, если seek-target за ним — возвращаем currentTime.
          onSeeking={(e) => {
            const buf = e.target.buffered
            if (buf.length === 0) {
              if (e.target.currentTime > 0.1) {
                console.warn('[VideoTile] seek blocked: буфер пуст, target=', e.target.currentTime.toFixed(1))
                e.target.currentTime = 0
              }
              return
            }
            let maxBuffered = 0
            for (let i = 0; i < buf.length; i++) maxBuffered = Math.max(maxBuffered, buf.end(i))
            // Небольшой запас (-0.5 сек) — чтобы не упирались в самый край где
            // часто бывает stall.
            const safeMax = Math.max(0, maxBuffered - 0.5)
            if (e.target.currentTime > safeMax) {
              console.warn('[VideoTile] seek blocked: target=', e.target.currentTime.toFixed(1), '> buffered=', maxBuffered.toFixed(1), '(safeMax=', safeMax.toFixed(1) + ')')
              e.target.currentTime = safeMax
            }
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
        {/* v0.89.11: индикатор «идёт фоновая загрузка» — показывается только пока
            partial=true. Пользователь видит что часть видео ещё качается и не
            пугается зависанию при попытке перемотать вперёд (мы блокируем
            seek за пределы буфера через onSeeking handler). */}
        {partial && (
          <>
            <div style={{
              position: 'absolute', top: 8, left: 8, zIndex: 10,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(8px)',
              color: '#fff', fontSize: 11, fontWeight: 500,
              padding: '4px 10px', borderRadius: 6,
              display: 'flex', alignItems: 'center', gap: 6,
              pointerEvents: 'none',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--amoled-accent)',
                animation: 'native-pulse 1.2s ease-in-out infinite',
              }} />
              <span>Загрузка {Math.round(progress * 100)}%</span>
            </div>
            {/* Тонкая полоска снизу видео — показывает докуда скачано */}
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: 2, zIndex: 9,
              background: 'rgba(255,255,255,0.15)',
              pointerEvents: 'none',
            }}>
              <div style={{
                height: '100%', width: `${progress * 100}%`,
                background: 'var(--amoled-accent)',
                transition: 'width 0.2s',
              }} />
            </div>
          </>
        )}
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
