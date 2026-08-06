// v1.2.197: окно отправки ОДИНОЧНОГО фото с инструментами просмотра.
// v1.2.198: + настоящий поворот при отправке (#1), сдвиг не за край (#2), размер+«сожмётся» (#3).
// v1.2.199: поворот PNG сохраняет прозрачность (PNG→PNG); неудачный поворот пишется в журнал (WARN).
// v1.2.201: дизайн «приподнятая карточка» (не сливается с чёрным фоном) + растущее поле подписи
//   (textarea, Enter — отправить, Shift+Enter — новая строка) + оптимизация зума/перетаскивания:
//   убрано дорогое размытие фона (backdrop-filter), размер области кэшируется (без layout thrashing),
//   перетаскивание сглажено через requestAnimationFrame (один пересчёт на кадр).
// Показывается вместо компактного FilePreviewBar, когда выбран ровно один image-файл
// (см. InboxMessageInput.jsx). Инструменты: −/масштаб/+/поворот + мышь (колесо — зум к точке
// под курсором, двойной клик — сброс к 100%, зажать и тянуть — двигать в пределах кадра).
// Математика — в imageZoomPan.js (покрыта тестами).
//
// ВАЖНО: зум/сдвиг — только вид. ПОВОРОТ настоящий: при отправке, если фото повёрнуто,
// строим повёрнутую копию на canvas и шлём её (без пути на диске → байтами, см. inboxAttachSend).

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  wheelScale, stepScale, zoomToPoint, resetTransform, nextRotation, clampOffset, fitSize,
} from '../utils/imageZoomPan.js'

// v1.2.201: затемнение фона без размытия (backdrop-filter дорог — MDN: перерисовывает фон
// каждый кадр). Просто более плотная «шторка», чтобы окно читалось отдельно от приложения.
const overlay = {
  position: 'fixed', inset: 0, zIndex: 4000,
  background: 'rgba(3,4,8,0.74)',
  display: 'grid', placeItems: 'center', padding: 20,
}
// v1.2.201: «приподнятая карточка» — светлее чёрного фона приложения + видимая рамка + тень.
const card = {
  width: '100%', maxWidth: 480,
  background: '#1b1e27', border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 16, overflow: 'hidden',
  boxShadow: '0 30px 70px -18px rgba(0,0,0,0.82), 0 6px 18px rgba(0,0,0,0.5)',
  display: 'flex', flexDirection: 'column',
}
const head = { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }
const xbtn = {
  width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent',
  color: 'var(--amoled-text-dim)', cursor: 'pointer', fontSize: 15,
}
const imgArea = {
  position: 'relative', background: '#0f1420', overflow: 'hidden',
  height: 340, display: 'grid', placeItems: 'center', userSelect: 'none',
}
const pill = {
  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
  display: 'flex', alignItems: 'center', gap: 2,
  background: 'rgba(12,16,24,0.86)', border: '1px solid rgba(255,255,255,0.16)',
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
  borderTop: '1px solid rgba(255,255,255,0.10)', display: 'flex', gap: 8, alignItems: 'center',
}
const foot = {
  display: 'flex', gap: 8, padding: 12, alignItems: 'flex-end',
  borderTop: '1px solid rgba(255,255,255,0.10)',
}
// v1.2.201: растущее поле подписи (textarea) — начинается в одну строку, растёт до ~5 строк.
const CAP_MAX_H = 120
const capStyle = {
  flex: 1, fontSize: 14, lineHeight: 1.4, resize: 'none', overflowY: 'auto',
  minHeight: 38, maxHeight: CAP_MAX_H, padding: '8px 11px', borderRadius: 10,
  background: '#12151d', border: '1px solid rgba(255,255,255,0.14)',
  color: 'var(--amoled-text)', fontFamily: 'inherit',
}

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

// Растущее поле: сбрасываем высоту и подгоняем под содержимое (MDN приём height auto→scrollHeight).
function autosize(el) {
  if (!el) return
  try { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, CAP_MAX_H) + 'px' } catch (_) {}
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
  const taRef = useRef(null)
  // v1.2.201: кэш размера области картинки — чтобы НЕ мерить раскладку на каждый кадр
  // перетаскивания/зума (MDN: частый getBoundingClientRect = layout thrashing = тормоза).
  const rectRef = useRef(null)
  // refs для обработчиков в useEffect (стабильные deps) — нужны актуальные rot/nat.
  const rotRef = useRef(0); rotRef.current = rot
  const natRef = useRef({ w: 0, h: 0 }); natRef.current = nat

  // Замер области — один раз при загрузке/ресайзе окна/начале жеста, дальше берём из кэша.
  const measure = useCallback(() => {
    const el = areaRef.current
    if (!el) return null
    try { rectRef.current = el.getBoundingClientRect() } catch (_) {}
    return rectRef.current
  }, [])

  // object URL для превью (revoke при размонтировании/смене файла)
  useEffect(() => {
    if (!file) { setUrl(''); return undefined }
    let u = ''
    try { u = URL.createObjectURL(file) } catch (_) {}
    setUrl(u)
    setT({ scale: 1, x: 0, y: 0 }); setRot(0)
    return () => { if (u) try { URL.revokeObjectURL(u) } catch (_) {} }
  }, [file])

  // Пере-замер области при изменении размеров окна (кэш перестаёт быть верным).
  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  // Подгоняем высоту поля подписи при внешнем изменении текста (напр. очистка после отправки).
  useEffect(() => { autosize(taRef.current) }, [caption])

  // #2: ограничение сдвига по текущему масштабу/повороту/размеру окна (не утащить за край).
  // v1.2.201: размер берём из кэша rectRef (замер — только в measure()).
  const clampT = useCallback((next) => {
    const n = natRef.current
    const r = rectRef.current || measure()
    if (!r || !n.w || !n.h || !r.width || !r.height) return next
    const fit = fitSize(n.w, n.h, r.width, r.height)
    const swap = (rotRef.current % 180) !== 0
    const cw = (swap ? fit.h : fit.w) * next.scale
    const ch = (swap ? fit.w : fit.h) * next.scale
    const cl = clampOffset(next.x, next.y, cw, ch, r.width, r.height)
    return { scale: next.scale, x: cl.x, y: cl.y }
  }, [measure])

  // Колесо — зум к точке под курсором. Не-passive, чтобы preventDefault (MDN wheel).
  useEffect(() => {
    const el = areaRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const r = rectRef.current || measure()
      if (!r) return
      const cx = e.clientX - (r.left + r.width / 2)
      const cy = e.clientY - (r.top + r.height / 2)
      setT(prev => clampT(zoomToPoint(prev, wheelScale(prev.scale, e.deltaY), cx, cy)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [clampT, measure])

  // Перетаскивание (pan) на window. v1.2.201: сглаживание через rAF — много событий мыши
  // в одном кадре экрана схлопываются в ОДИН пересчёт (иначе рывки на больших фото).
  useEffect(() => {
    let raf = 0
    let pending = null
    const apply = () => {
      raf = 0
      const d = dragRef.current
      const p = pending
      if (!d || !p) return
      setT(prev => clampT({ ...prev, x: d.ox + (p.x - d.sx), y: d.oy + (p.y - d.sy) }))
    }
    const onMove = (e) => {
      if (!dragRef.current) return
      pending = { x: e.clientX, y: e.clientY }
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onUp = () => { if (dragRef.current) { dragRef.current = null; setDragging(false) } }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (raf) cancelAnimationFrame(raf)
    }
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
    measure() // свежий размер на старте жеста (окно могли ресайзить)
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y }
    setDragging(true)
  }, [t, measure])

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

  // Enter — отправить, Shift+Enter — новая строка (как в главном поле ввода программы).
  const onCaptionKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !busy) {
      e.preventDefault()
      handleSend()
    }
  }, [busy, handleSend])

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
              onLoad={(e) => { setNat({ w: e.target.naturalWidth || 0, h: e.target.naturalHeight || 0 }); measure() }}
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                transform: `translate(${t.x}px, ${t.y}px) rotate(${rot}deg) scale(${t.scale})`,
                transition: dragging ? 'none' : 'transform 120ms ease-out',
                willChange: 'transform',
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
          <textarea
            ref={taRef}
            rows={1}
            value={caption || ''}
            onChange={(e) => { onCaptionChange?.(e.target.value); autosize(e.target) }}
            onKeyDown={onCaptionKeyDown}
            placeholder="Подпись (необязательно) · Shift+Enter — новая строка"
            disabled={busy}
            style={capStyle}
          />
          <button className="native-btn" onClick={handleSend} disabled={busy} style={{ minWidth: 96 }}>
            {rotating ? 'Поворот...' : sending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}
