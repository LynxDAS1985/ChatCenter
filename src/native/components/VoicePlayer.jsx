// v0.95.25: кастомный плеер voice-сообщений в стиле Telegram.
//
// Возможности:
// - Waveform 50 столбиков из TDLib voice_note.waveform (см. utils/voiceWaveform.js)
// - Play/Pause кнопка слева
// - Прогресс закрашивает waveform слева направо (как Telegram)
// - Click по waveform → seek в эту точку
// - Скорость 1x / 1.5x / 2x — кнопка справа
// - Duration mm:ss
// - Lazy download: <audio> создаётся только при первом клике play
//
// Эталон: Telegram Web K `tweb/src/components/audio.ts` (AudioElement).
// Hunspell, Slack, Discord используют тот же подход.

import { useState, useEffect, useRef, useMemo } from 'react'
import { decodeWaveform } from '../utils/voiceWaveform.js'

const WAVEFORM_BARS = 50
const SPEEDS = [1, 1.5, 2]

function formatDuration(sec) {
  if (!sec || !Number.isFinite(sec)) return '0:00'
  const s = Math.round(sec)
  const mm = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function VoicePlayer({ m, chatId, downloadMedia }) {
  const [src, setSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)  // 0=1x, 1=1.5x, 2=2x
  const [error, setError] = useState(null)
  const audioRef = useRef(null)

  const duration = m.duration || 0
  const speed = SPEEDS[speedIdx]
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

  // Декодируем waveform один раз при mount (мемо).
  const bars = useMemo(() => {
    const decoded = decodeWaveform(m.waveform, WAVEFORM_BARS)
    if (decoded.length === WAVEFORM_BARS) return decoded
    // Fallback: если TDLib не дал waveform — рисуем монотонный паттерн.
    return Array.from({ length: WAVEFORM_BARS }, (_, i) => 0.3 + 0.2 * Math.sin(i * 0.5))
  }, [m.waveform])

  // При unmount останавливаем + чистим audio (защита от продолжения проигрывания).
  useEffect(() => () => {
    if (audioRef.current) {
      try { audioRef.current.pause() } catch (_) {}
      audioRef.current = null
    }
  }, [])

  // Применяем скорость к audio element когда меняется.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }, [speed])

  const ensureLoaded = async () => {
    if (src) return src
    setLoading(true)
    setError(null)
    try {
      const r = await downloadMedia?.(chatId, m.id, false)
      if (r?.ok && r.path) {
        setSrc(r.path)
        return r.path
      }
      setError('Не удалось загрузить голосовое сообщение')
      return null
    } catch (err) {
      setError(err?.message || 'Ошибка загрузки')
      return null
    } finally {
      setLoading(false)
    }
  }

  const handlePlayPause = async () => {
    if (playing) {
      audioRef.current?.pause()
      return
    }
    const loadedSrc = await ensureLoaded()
    if (!loadedSrc) return
    // audioRef создаётся в JSX когда src появляется; ждём следующий tick.
    setTimeout(() => {
      const audio = audioRef.current
      if (!audio) return
      audio.playbackRate = speed
      audio.play().catch(err => setError(err?.message || 'Не удалось проиграть'))
    }, 0)
  }

  const handleSeek = (e) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetTime = ratio * duration
    setCurrentTime(targetTime)
    if (audioRef.current) {
      try { audioRef.current.currentTime = targetTime } catch (_) {}
    }
  }

  const handleSpeedToggle = (e) => {
    e.stopPropagation()
    setSpeedIdx((speedIdx + 1) % SPEEDS.length)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '4px 4px 4px 0',
      minWidth: 220, maxWidth: 320,
    }}>
      {/* Play/Pause кнопка */}
      <button
        onClick={handlePlayPause}
        disabled={loading}
        title={playing ? 'Пауза' : 'Воспроизвести'}
        style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          border: 'none', cursor: loading ? 'wait' : 'pointer',
          background: m.isOutgoing ? 'rgba(255,255,255,0.25)' : 'var(--amoled-accent)',
          color: '#fff', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {loading ? '⌛' : playing ? '⏸' : '▶'}
      </button>

      {/* Waveform + duration */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Waveform столбики */}
        <div
          onClick={handleSeek}
          style={{
            display: 'flex', alignItems: 'center', gap: 2,
            height: 28, cursor: duration ? 'pointer' : 'default',
            userSelect: 'none',
          }}
        >
          {bars.map((amp, i) => {
            // Прогресс закрашивает столбики слева направо.
            const barProgress = i / WAVEFORM_BARS
            const filled = barProgress < progress
            const height = Math.max(3, amp * 24)  // min 3px чтобы видеть пустые
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height,
                  borderRadius: 2,
                  background: filled
                    ? (m.isOutgoing ? '#fff' : 'var(--amoled-accent)')
                    : (m.isOutgoing ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.3)'),
                  transition: 'background 0.1s',
                }}
              />
            )
          })}
        </div>

        {/* Duration + скорость */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, opacity: 0.85 }}>
          <span>{formatDuration(playing || currentTime > 0 ? currentTime : duration)}</span>
          <button
            onClick={handleSpeedToggle}
            title="Скорость воспроизведения"
            style={{
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 4, padding: '0 5px',
              background: 'transparent', color: 'inherit',
              fontSize: 10, cursor: 'pointer', minWidth: 32,
            }}
          >{speed}x</button>
        </div>
      </div>

      {/* Hidden audio element (создаётся когда src готов) */}
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setCurrentTime(0)
          }}
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime || 0)}
          onError={() => setError('Ошибка воспроизведения')}
          style={{ display: 'none' }}
        />
      )}

      {error && (
        <div style={{ fontSize: 10, color: 'var(--amoled-danger)', marginLeft: 4 }}>
          ⚠️
        </div>
      )}
    </div>
  )
}
