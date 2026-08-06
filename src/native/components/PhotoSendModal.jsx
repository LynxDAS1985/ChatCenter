// v1.2.197: окно отправки ОДИНОЧНОГО фото с инструментами просмотра.
// v1.2.198: + настоящий поворот при отправке (#1), сдвиг не за край (#2), размер+«сожмётся» (#3).
// v1.2.199: поворот PNG сохраняет прозрачность (PNG→PNG); неудачный поворот пишется в журнал (WARN).
// Показывается вместо компактного FilePreviewBar, когда выбран ровно один image-файл
// (см. InboxMessageInput.jsx). Инструменты: −/масштаб/+/поворот + мышь (колесо — зум к точке
// под курсором, двойной клик — сброс к 100%, зажать и тянуть — двигать в пределах кадра).
// Математика — в imageZoomPan.js (покрыта тестами).
//
// ВАЖНО: зум/сдвиг — только вид. ПОВОРОТ теперь настоящий: при отправке, если фото повёрнуто,
// строим повёрнутую копию на canvas и шлём её (без пути на диске → байтами, см. inboxAttachSend).

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  wheelScale, stepScale, zoomToPoint, resetTransform, nextRotation, clampOffset, fitSize,
} from '../utils/imageZoomPan.js'

const overlay = {
  position: 'fixed', inset: 0, zIndex: 4000,
  background: 'rgba(0,0,0,0.66)', backdropFilter: 'blur(2px)',
  display: 'grid', placeItems: 'center', padding: 20,
}
const card = {
  width: '100%', maxWidth: 480,
  background: 'var(--amoled-surface)', border: '1px solid var(--amoled-border)',
  borderRadius: 16, overflow: 'hidden',
  boxShadow: '0 30px 70px -20px rgba(0,0,0,0.75), 0 6px 18px rgba(0,0,0,0.45)',
  display: 'flex', flexDirection: 'column',
}
const head = { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }
const xbtn = {
  width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent',
  color: 'var(--amoled-text-dim)', cursor: 'pointer', fontSize: 15,
}
const imgArea = {
  position: 'relative', background: '#0a0f18', overflow: 'hidden',
  height: 340, display: 'grid', placeItems: 'center', userSelect: 'none',
}
const pill = {
  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
  display: 'flex', alignItems: 'center', gap: 2,
  background: 'rgba(12,16,24,0.82)', border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 12, padding: '4px 6px', color: '#dbe3ef',
  boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
}
const cbtn = {
  minWidth: 32, height: 30, padding: '0 7px', borderRadius: 8, border: 'none',
  background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1,
}
const sep = { width: 1, height: 18, background: 'rgba(255,255,255,0.16)', margin: '0 4px' }
const hint = {
  position: 'absolute', left: 0, right: 0, bottom: 10, textAlign: 'center',
  fontSize: 11, color: '#c6d2e4', opacity: 0.75, pointerEvents: 'none',
}
const info = {
  padding: '7px 16px', fontSize: 11.5, color: 'var(--amoled-text-dim)',
  borderTop: '1px solid var(--amoled-border)', display: 'flex', gap: 8, alignItems: 'center',
}
const foot = { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--amoled-border)' }

// Строит ПОВЁРНУТУЮ копию фото на canvas → File (без пути → отправится байтами). rot ∈ {90,180,270}.
// v1.2.199 (#2): PNG сохраняем как PNG (не теряем прозрачность), остальное — JPEG.
function buildRotatedFile(file, url, rot) {
  const isPng = typeof file?.type === 'string' && file.type === 'image/png'
  const mime = isPng ? 'image/png' : 'image/jpeg'
  const outExt = isPng ? '.png' : '.jpg'
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const swap = rot % 180 !== 0
          const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height
          const canvas = document.createElement('canvas')
          canvas.width = swap ? nh : nw
          canvas.height = swap ? nw : nh
          const ctx = canvas.getContext('2d')
          ctx.translate(canvas.width / 2, canvas.height / 2)
          ctx.rotate((rot * Math.PI) / 180)
          ctx.drawImage(img, -nw / 2, -nh / 2)
          canvas.toBlob((blob) => {
            if (!blob) { resolve(null); return }
            const base = (file?.name || 'photo').replace(/\.[^.]+$/, '')
            resolve(new File([blob], base + outExt, { type: mime }))
          }, mime, 0.92)
        } catch (_) { resolve(null) }
      }
      img.onerror = () => resolve(null)
      img.src = url
    } catch (_) { resolve(null) }
  })
}

export default function PhotoSendModal({ file, caption, onCaptionChange, onSend, onCancel, sending }) {
  const [url, setUrl] = useState('')
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 })
  const [rot, setRot] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [nat, setNat] = useState({ w: 0, h: 0 })
  const [rotating, setRotating] = useState(false)
  const dragRef = useRef(null)
  const areaRef = useRef(null)
  // refs для обработчиков в useEffect (стабильные deps) — нужны актуальные rot/nat.
  const rotRef = useRef(0); rotRef.current = rot
  const natRef = useRef({ w: 0, h: 0 }); natRef.current = nat

  // object URL для превью (revoke при размонтировании/смене файла)
  useEffect(() => {
    if (!file) { setUrl(''); return undefined }
    let u = ''
    try { u = URL.createObjectURL(file) } catch (_) {}
    setUrl(u)
    setT({ scale: 1, x: 0, y: 0 }); setRot(0)
    return () => { if (u) try { URL.revokeObjectURL(u) } catch (_) {} }
  }, [file])

  // #2: ограничение сдвига по текущему масштабу/повороту/размеру окна (не утащить за край).
  const clampT = useCallback((next) => {
    const el = areaRef.current
    const n = natRef.current
    if (!el || !n.w || !n.h) return next
    let r; try { r = el.getBoundingClientRect() } catch (_) { return next }
    if (!r.width || !r.height) return next
    const fit = fitSize(n.w, n.h, r.width, r.height)
    const swap = (rotRef.current % 180) !== 0
    const cw = (swap ? fit.h : fit.w) * next.scale
    const ch = (swap ? fit.w : fit.h) * next.scale
    const cl = clampOffset(next.x, next.y, cw, ch, r.width, r.height)
    return { scale: next.scale, x: cl.x, y: cl.y }
  }, [])

  // Колесо — зум к точке под курсором. Не-passive, чтобы preventDefault (MDN wheel).
  useEffect(() => {
    const el = areaRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const cx = e.clientX - (r.left + r.width / 2)
      const cy = e.clientY - (r.top + r.height / 2)
      setT(prev => clampT(zoomToPoint(prev, wheelScale(prev.scale, e.deltaY), cx, cy)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [clampT])

  // Перетаскивание (pan) на window — тянуть можно и за пределами картинки.
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      setT(prev => clampT({ ...prev, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }))
    }
    const onUp = () => { if (dragRef.current) { dragRef.current = null; setDragging(false) } }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [clampT])

  // Esc — отмена.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !sending && !rotating) onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, sending, rotating])

  const canPan = t.scale > 1
  const onImgMouseDown = useCallback((e) => {
    if (t.scale <= 1) return
    e.preventDefault()
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y }
    setDragging(true)
  }, [t])

  const reset = () => { setT(resetTransform()); setRot(0) }
  const pct = Math.round(t.scale * 100)
  const busy = sending || rotating

  // Отправка. #1: если фото повёрнуто — строим повёрнутую копию и шлём её (onSend(файл)).
  const handleSend = useCallback(async () => {
    if (busy) return
    if (rot !== 0 && url) {
      setRotating(true)
      const rotated = await buildRotatedFile(file, url, rot)
      setRotating(false)
      if (rotated) { onSend?.(rotated); return }
      // v1.2.199 (#3): не удалось повернуть (например, огромное фото / отказ canvas) —
      // шлём оригинал (лучше отправить, чем потерять), но НЕ молча: пишем в журнал.
      try {
        window.api?.send?.('app:log', {
          level: 'WARN',
          message: '[photo-modal] поворот не удался (canvas) — отправлен оригинал без поворота',
        })
      } catch (_) {}
    }
    onSend?.()
  }, [busy, rot, url, file, onSend])

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.() }}>
      <div style={card} onMouseDown={(e) => e.stopPropagation()}>
        <div style={head}>
          <span style={{ flex: 1, fontWeight: 600, color: 'var(--amoled-text)' }}>Отправить фото</span>
          <button style={xbtn} onClick={() => !busy && onCancel?.()} title="Отмена (Esc)">✕</button>
        </div>

        <div
          ref={areaRef}
          onDoubleClick={reset}
          onMouseDown={onImgMouseDown}
          style={{ ...imgArea, cursor: canPan ? (dragging ? 'grabbing' : 'grab') : 'default' }}
        >
          {url && (
            <img
              src={url}
              alt={file?.name || 'фото'}
              draggable={false}
              onLoad={(e) => setNat({ w: e.target.naturalWidth || 0, h: e.target.naturalHeight || 0 })}
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                transform: `translate(${t.x}px, ${t.y}px) rotate(${rot}deg) scale(${t.scale})`,
                transition: dragging ? 'none' : 'transform 120ms ease-out',
                userSelect: 'none', pointerEvents: 'none',
              }}
            />
          )}

          <div style={pill} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <button style={cbtn} title="Отдалить" onClick={() => setT(p => clampT({ ...p, scale: stepScale(p.scale, -1) }))}>−</button>
            <span style={{ minWidth: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{pct}%</span>
            <button style={cbtn} title="Приблизить" onClick={() => setT(p => clampT({ ...p, scale: stepScale(p.scale, 1) }))}>+</button>
            <span style={sep} />
            <button style={cbtn} title="Повернуть" onClick={() => setRot(r => nextRotation(r))}>⟳</button>
          </div>
          <div style={hint}>колесо — зум · двойной клик — сброс · тяни — двигать</div>
        </div>

        {/* #3: реальный размер + предупреждение о сжатии (фото уходит как inputMessagePhoto) */}
        <div style={info}>
          <span>🖼 {nat.w && nat.h ? `${nat.w}×${nat.h}` : '…'}</span>
          <span style={{ opacity: 0.75 }}>· Telegram сожмёт фото при отправке{rot !== 0 ? ' · повёрнуто' : ''}</span>
        </div>

        <div style={foot}>
          <input
            type="text"
            value={caption || ''}
            onChange={(e) => onCaptionChange?.(e.target.value)}
            placeholder="Добавьте подпись (необязательно)..."
            disabled={busy}
            style={{ flex: 1, fontSize: 14 }}
          />
          <button className="native-btn" onClick={handleSend} disabled={busy} style={{ minWidth: 96 }}>
            {rotating ? 'Поворот...' : sending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}
