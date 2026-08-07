// v1.2.197: окно отправки фото с инструментами просмотра.
// v1.2.198–201: реальный поворот, сдвиг в кадре, размер, прозрачность PNG, приподнятая карточка,
//   растущее поле подписи, оптимизация зума/перетаскивания.
// v1.2.203: НЕСКОЛЬКО фото в одном сообщении — лента миниатюр (переключение/удаление/добавление),
//   стрелки ‹ ›, счётчик; поворот у каждой свой; подпись одна на альбом. Окно шире (720). Кнопки —
//   в ВЕРХНЮЮ панель (не поверх фото). Границы фото видны (шахматная подложка + контур).
//   Зум колесом мерит область заново (фикс «мимо курсора» после роста подписи).
// Показывается вместо FilePreviewBar, когда ВСЕ прикреплённые файлы — картинки (см. InboxMessageInput).
//
// ВАЖНО: зум/сдвиг — только вид. ПОВОРОТ настоящий: при отправке повёрнутые фото строятся на canvas
// (без пути → альбом соберётся через временные файлы, см. inboxAttachSend + tg:write-temp-file).

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  wheelScale, stepScale, zoomToPoint, resetTransform, nextRotation, clampOffset, fitSize, actualSizeScale,
} from '../utils/imageZoomPan.js'
import { formatBytes, totalBytes, arrayMove, overallUploadPercent, CAPTION_MAX, TEXT_MAX, splitTextForTelegram } from '../utils/photoSendUtils.js'

const overlay = {
  position: 'fixed', inset: 0, zIndex: 4000,
  background: 'rgba(3,4,8,0.74)',
  display: 'grid', placeItems: 'center', padding: 20,
}
const card = {
  width: '100%', maxWidth: 720,
  background: '#1b1e27', border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 16, overflow: 'hidden',
  boxShadow: '0 30px 70px -18px rgba(0,0,0,0.82), 0 6px 18px rgba(0,0,0,0.5)',
  display: 'flex', flexDirection: 'column',
}
const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }
const xbtn = {
  width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent',
  color: 'var(--amoled-text-dim)', cursor: 'pointer', fontSize: 15,
}
// v1.2.204: группа кнопок зума/поворота — в шапке (см. head).
const toolGroup = {
  display: 'flex', alignItems: 'center', gap: 2,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10, padding: '3px 5px', color: '#dbe3ef',
}
const cbtn = {
  minWidth: 30, height: 28, padding: '0 7px', borderRadius: 7, border: 'none',
  background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1,
}
const sep = { width: 1, height: 18, background: 'rgba(255,255,255,0.16)', margin: '0 4px' }
// Шахматная подложка — чтобы был виден край фото на любом фоне.
const imgArea = {
  position: 'relative', overflow: 'hidden', height: 380, display: 'grid', placeItems: 'center',
  userSelect: 'none',
  backgroundColor: '#151922',
  backgroundImage: 'linear-gradient(45deg,#1e222c 25%,transparent 25%),linear-gradient(-45deg,#1e222c 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1e222c 75%),linear-gradient(-45deg,transparent 75%,#1e222c 75%)',
  backgroundSize: '22px 22px',
  backgroundPosition: '0 0,0 11px,11px -11px,-11px 0',
}
const navBtn = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 3,
  width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(12,16,24,0.78)', color: '#fff', cursor: 'pointer', fontSize: 18,
  display: 'grid', placeItems: 'center',
}
const hint = {
  position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center',
  fontSize: 11, color: '#c6d2e4', opacity: 0.72, pointerEvents: 'none',
}
const info = {
  padding: '7px 16px', fontSize: 11.5, color: 'var(--amoled-text-dim)',
  borderTop: '1px solid rgba(255,255,255,0.10)', display: 'flex', gap: 8, alignItems: 'center',
}
// Лента миниатюр (несколько фото).
const strip = {
  display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto',
  borderTop: '1px solid rgba(255,255,255,0.08)',
}
const thumbBase = {
  position: 'relative', flex: '0 0 auto', width: 54, height: 54, borderRadius: 8,
  overflow: 'hidden', cursor: 'pointer', background: '#0f1420',
}
const addThumb = {
  ...thumbBase, display: 'grid', placeItems: 'center', cursor: 'pointer',
  border: '1px dashed rgba(255,255,255,0.25)', color: '#c6d2e4', fontSize: 22,
}
const thumbX = {
  position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%',
  background: 'rgba(0,0,0,0.66)', color: '#fff', border: 'none', cursor: 'pointer',
  fontSize: 11, lineHeight: '16px', padding: 0, textAlign: 'center',
}
const foot = {
  display: 'flex', gap: 8, padding: 12, alignItems: 'flex-end',
  borderTop: '1px solid rgba(255,255,255,0.10)',
}
const CAP_MAX_H = 120
const capStyle = {
  flex: 1, fontSize: 14, lineHeight: 1.4, resize: 'none', overflowY: 'auto',
  minHeight: 38, maxHeight: CAP_MAX_H, padding: '8px 11px', borderRadius: 10,
  background: '#12151d', border: '1px solid rgba(255,255,255,0.14)',
  color: 'var(--amoled-text)', fontFamily: 'inherit',
}

// Строит ПОВЁРНУТУЮ копию фото на canvas → File (без пути). rot ∈ {90,180,270}.
// v1.2.199 (#2): PNG сохраняем как PNG (прозрачность), остальное — JPEG.
// v1.2.203: url необязателен — если не передан, создаём и revoke сами (нужно при отправке альбома).
function buildRotatedFile(file, rot, url) {
  const isPng = typeof file?.type === 'string' && file.type === 'image/png'
  const mime = isPng ? 'image/png' : 'image/jpeg'
  const outExt = isPng ? '.png' : '.jpg'
  const created = !url
  let u = url
  if (!u) { try { u = URL.createObjectURL(file) } catch (_) { u = '' } }
  return new Promise((resolve) => {
    const finish = (res) => { if (created && u) { try { URL.revokeObjectURL(u) } catch (_) {} } resolve(res) }
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
            if (!blob) { finish(null); return }
            const base = (file?.name || 'photo').replace(/\.[^.]+$/, '')
            finish(new File([blob], base + outExt, { type: mime }))
          }, mime, 0.92)
        } catch (_) { finish(null) }
      }
      img.onerror = () => finish(null)
      img.src = u
    } catch (_) { finish(null) }
  })
}

function autosize(el) {
  if (!el) return
  try { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, CAP_MAX_H) + 'px' } catch (_) {}
}

export default function PhotoSendModal({ files, caption, onCaptionChange, onSend, onCancel, sending, onAdd, onRemove, onReorder, uploads }) {
  const list = Array.isArray(files) ? files : []
  const [urls, setUrls] = useState([])
  const [idx, setIdx] = useState(0)
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 })
  const [rots, setRots] = useState([])
  const [dragging, setDragging] = useState(false)
  const [nat, setNat] = useState({ w: 0, h: 0 })
  const [rotating, setRotating] = useState(false)
  const [asDoc, setAsDoc] = useState(false)          // #1: «без сжатия»
  const [confirmClose, setConfirmClose] = useState(false)  // #10: подтверждение закрытия
  const [dragIdx, setDragIdx] = useState(null)       // #3: перетаскивание миниатюр
  const dragRef = useRef(null)
  const areaRef = useRef(null)
  const taRef = useRef(null)
  const rectRef = useRef(null)
  const fileInputRef = useRef(null)
  const rotRef = useRef(0); rotRef.current = rots[idx] || 0
  const natRef = useRef({ w: 0, h: 0 }); natRef.current = nat

  const measure = useCallback(() => {
    const el = areaRef.current
    if (!el) return null
    try { rectRef.current = el.getBoundingClientRect() } catch (_) {}
    return rectRef.current
  }, [])

  // object URL на каждое фото (revoke при смене набора/размонтировании).
  // Зависимость — сам проп files (стабильная ссылка), а не производный list (иначе при
  // files=undefined каждый рендер давал бы новый [] → пересоздание URL в цикле).
  useEffect(() => {
    const arr = Array.isArray(files) ? files : []
    const made = arr.map((f) => { try { return URL.createObjectURL(f) } catch (_) { return '' } })
    setUrls(made)
    return () => { made.forEach(u => { if (u) try { URL.revokeObjectURL(u) } catch (_) {} }) }
  }, [files])

  // Синхронизируем массив поворотов и текущий индекс с числом файлов.
  useEffect(() => {
    setRots(prev => {
      const next = list.map((_, i) => prev[i] || 0)
      return next
    })
    setIdx(i => Math.min(i, Math.max(0, list.length - 1)))
  }, [list.length])

  // Смена фото — сброс зума/сдвига.
  useEffect(() => { setT({ scale: 1, x: 0, y: 0 }) }, [idx])

  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  useEffect(() => { autosize(taRef.current) }, [caption])

  // v1.2.204: вставка ещё фото через Ctrl+V прямо в открытом окне. Главный input скрыт под
  // окном, поэтому слушаем на window (MDN: ClipboardEvent.clipboardData.items → getAsFile).
  useEffect(() => {
    if (!onAdd) return undefined
    const onPaste = (e) => {
      // v1.2.205: если вставку уже обработал другой обработчик (поле ввода при открытии окна
      // зовёт preventDefault ДО того, как событие дойдёт до window) — НЕ добавляем второй раз.
      // Иначе первая вставка, открывающая окно, добавляла фото дважды.
      if (e.defaultPrevented) {
        // v1.2.206: лог-подтверждение, что защита сработала (в журнале видно, что фикс
        // отработал; если двойная вставка повторится БЕЗ этой строки — причина другая).
        try { window.api?.send?.('app:log', { level: 'INFO', message: '[photo-modal] paste: пропуск дубля (вставку уже обработало поле)' }) } catch (_) {}
        return
      }
      if (sending || rotating) return
      const items = Array.from(e.clipboardData?.items || [])
      const img = items.find(i => i.type && i.type.startsWith('image/'))
      if (!img) return
      const blob = img.getAsFile()
      if (blob) { e.preventDefault(); onAdd([blob]) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onAdd, sending, rotating])

  const clampT = useCallback((next) => {
    // При 100% (и меньше) — строго по центру, двигать нечего.
    if (next.scale <= 1) return { scale: next.scale, x: 0, y: 0 }
    const n = natRef.current
    const r = rectRef.current || measure()
    if (!r || !n.w || !n.h || !r.width || !r.height) return next
    const fit = fitSize(n.w, n.h, r.width, r.height)
    const swap = (rotRef.current % 180) !== 0
    const cw = (swap ? fit.h : fit.w) * next.scale
    const ch = (swap ? fit.w : fit.h) * next.scale
    // v1.2.204: loose=true — можно вытянуть край до середины окна (рассмотреть углы/края).
    const cl = clampOffset(next.x, next.y, cw, ch, r.width, r.height, true)
    return { scale: next.scale, x: cl.x, y: cl.y }
  }, [measure])

  // Колесо — зум к точке под курсором. v1.2.203 (🟡-1): мерим область ЗАНОВО (карточка могла
  // сдвинуться от роста подписи → кэш top/left устаревал → зум «мимо курсора»).
  useEffect(() => {
    const el = areaRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const r = measure()
      if (!r) return
      const cx = e.clientX - (r.left + r.width / 2)
      const cy = e.clientY - (r.top + r.height / 2)
      setT(prev => clampT(zoomToPoint(prev, wheelScale(prev.scale, e.deltaY), cx, cy)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [clampT, measure])

  // Перетаскивание (pan) — сглаживание через requestAnimationFrame.
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

  const busy = sending || rotating

  // #10: закрытие с подтверждением (чтобы случайно не потерять выбранные фото).
  const requestClose = useCallback(() => {
    if (busy) return
    if (list.length > 0) setConfirmClose(true)
    else onCancel?.()
  }, [busy, list.length, onCancel])
  // #7: удалить ТЕКУЩЕЕ фото (заодно убрать его поворот, чтобы не сместились).
  const deleteCurrent = useCallback(() => {
    if (busy || !onRemove) return
    onRemove(idx)
    setRots(prev => prev.filter((_, i) => i !== idx))
  }, [busy, onRemove, idx])

  // Esc — закрыть (с подтверждением, второй Esc — точно); Del — удалить текущее; ← → — листать.
  useEffect(() => {
    const onKey = (e) => {
      const inField = e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')
      if (e.key === 'Escape' && !busy) {
        if (confirmClose) onCancel?.(); else requestClose()
        return
      }
      if (inField) return
      // v1.2.208 (#2): только Delete (Backspace убран — привычное нажатие случайно стирало фото).
      if (e.key === 'Delete' && !busy) { deleteCurrent(); return }
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIdx(i => Math.min(list.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, list.length, confirmClose, requestClose, onCancel, deleteCurrent])

  const canPan = t.scale > 1
  const onImgMouseDown = useCallback((e) => {
    if (t.scale <= 1) return
    e.preventDefault()
    measure()
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y }
    setDragging(true)
  }, [t, measure])

  const reset = () => { setT(resetTransform()); setRots(prev => { const c = [...prev]; c[idx] = 0; return c }) }
  const rotateCur = () => setRots(prev => { const c = [...prev]; c[idx] = nextRotation(c[idx] || 0); return c })
  // #8: «Вписать» (100% по центру) и «1:1» (реальный размер пикселей).
  const fitView = () => setT(resetTransform())
  const oneToOne = () => {
    const r = rectRef.current || measure()
    const n = natRef.current
    if (!r || !n.w || !n.h) return
    setT(clampT({ scale: actualSizeScale(n.w, n.h, r.width, r.height), x: 0, y: 0 }))
  }
  const pct = Math.round(t.scale * 100)
  const curRot = rots[idx] || 0
  const many = list.length > 1
  const capLen = (caption || '').length      // v1.2.209: счётчик подписи
  const capOver = capLen > CAPTION_MAX        // подпись длиннее лимита Telegram (~1024)
  // v1.2.212 (#3): сколько сообщений уйдёт текстом при «отдельно» (куски ≤4096).
  const textChunks = capOver ? splitTextForTelegram(caption, TEXT_MAX).length : 0

  // Отправка. split=true — «фото, затем текст отдельным сообщением» (подпись не влезла).
  // Строим массив: повёрнутые фото → новая копия (canvas), остальные — как есть.
  const handleSend = useCallback(async (split) => {
    if (busy || list.length === 0) return
    if (!split && capOver) return  // подпись длиннее лимита — обычная отправка заблокирована
    const opts = { asDocument: asDoc, splitText: !!split }
    const hasRot = rots.some(r => r % 360 !== 0)
    if (!hasRot) { onSend?.(list, opts); return }
    setRotating(true)
    const prepared = []
    for (let i = 0; i < list.length; i++) {
      const r = (rots[i] || 0) % 360
      if (r === 0) { prepared.push(list[i]); continue }
      const rotated = await buildRotatedFile(list[i], r)
      if (rotated) { prepared.push(rotated) }
      else {
        prepared.push(list[i])
        try {
          window.api?.send?.('app:log', {
            level: 'WARN',
            message: `[photo-modal] поворот фото #${i + 1} не удался (canvas) — отправлено без поворота`,
          })
        } catch (_) {}
      }
    }
    setRotating(false)
    onSend?.(prepared, opts)
  }, [busy, list, rots, asDoc, capOver, onSend])

  const onCaptionKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !busy) { e.preventDefault(); handleSend(false) }
  }, [busy, handleSend])

  const curUrl = urls[idx] || ''
  const curSize = list[idx]?.size || 0            // #6: размер текущего фото
  const total = totalBytes(list)                  // #6: общий размер альбома
  const upPct = overallUploadPercent(uploads)     // #4: общий прогресс загрузки

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) requestClose() }}>
      <div style={card} onMouseDown={(e) => e.stopPropagation()}>
        {/* v1.2.204: заголовок + кнопки зума/поворота в ОДНОЙ верхней строке (не поверх фото) */}
        <div style={head}>
          <span style={{ fontWeight: 600, color: 'var(--amoled-text)', whiteSpace: 'nowrap' }}>
            {many ? `Отправить фото · ${idx + 1} из ${list.length}` : 'Отправить фото'}
          </span>
          <div style={{ flex: 1 }} />
          <div style={toolGroup}>
            <button style={cbtn} title="Отдалить" onClick={() => setT(p => clampT({ ...p, scale: stepScale(p.scale, -1) }))}>−</button>
            <span style={{ minWidth: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{pct}%</span>
            <button style={cbtn} title="Приблизить" onClick={() => setT(p => clampT({ ...p, scale: stepScale(p.scale, 1) }))}>+</button>
            <span style={sep} />
            <button style={cbtn} title="Вписать в окно" onClick={fitView}>⤢</button>
            <button style={{ ...cbtn, fontSize: 12 }} title="Реальный размер 1:1" onClick={oneToOne}>1:1</button>
            <span style={sep} />
            <button style={cbtn} title="Повернуть" onClick={rotateCur}>⟳</button>
            {onRemove && (<>
              <span style={sep} />
              <button style={cbtn} title="Удалить это фото (Del)" onClick={deleteCurrent}>🗑</button>
            </>)}
          </div>
          {curRot !== 0 && <span style={{ fontSize: 11, color: 'var(--amoled-text-dim)', whiteSpace: 'nowrap' }}>{curRot}°</span>}
          <button style={xbtn} onClick={requestClose} title="Отмена (Esc)">✕</button>
        </div>

        <div
          ref={areaRef}
          onDoubleClick={reset}
          onMouseDown={onImgMouseDown}
          style={{ ...imgArea, cursor: canPan ? (dragging ? 'grabbing' : 'grab') : 'default' }}
        >
          {curUrl && (
            <img
              src={curUrl}
              alt={list[idx]?.name || 'фото'}
              draggable={false}
              onLoad={(e) => { setNat({ w: e.target.naturalWidth || 0, h: e.target.naturalHeight || 0 }); measure() }}
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                transform: `translate(${t.x}px, ${t.y}px) rotate(${curRot}deg) scale(${t.scale})`,
                transition: dragging ? 'none' : 'transform 120ms ease-out',
                willChange: 'transform',
                // Контур — чтобы был виден край фото на тёмном.
                boxShadow: '0 0 0 1px rgba(255,255,255,0.28), 0 2px 12px rgba(0,0,0,0.5)',
                userSelect: 'none', pointerEvents: 'none',
              }}
            />
          )}

          {many && (
            <>
              <button style={{ ...navBtn, left: 10, opacity: idx > 0 ? 1 : 0.35 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setIdx(i => Math.max(0, i - 1))} title="Предыдущее (←)">‹</button>
              <button style={{ ...navBtn, right: 10, opacity: idx < list.length - 1 ? 1 : 0.35 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setIdx(i => Math.min(list.length - 1, i + 1))} title="Следующее (→)">›</button>
            </>
          )}
          <div style={hint}>колесо — зум · двойной клик — сброс · тяни — двигать</div>
        </div>

        <div style={info}>
          {/* #6: размеры + вес файла + вес всего альбома */}
          <span>🖼 {nat.w && nat.h ? `${nat.w}×${nat.h}` : '…'}{curSize ? ` · ${formatBytes(curSize)}` : ''}{many ? ` · альбом ${formatBytes(total)}` : ''}</span>
          <span style={{ opacity: 0.75 }}>· {asDoc ? 'Оригинал — без сжатия' : 'Telegram сожмёт фото'}</span>
          {list.length > 10 && (
            <span style={{ color: '#f5b74a', whiteSpace: 'nowrap' }}>· ⚠ до 10 в сообщении</span>
          )}
          {/* #1: «Без сжатия» — отправить как файл (оригинал) */}
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: '#cdd4e0', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={asDoc} onChange={(e) => setAsDoc(e.target.checked)} /> Без сжатия
          </label>
        </div>

        {/* Лента миниатюр: переключение / удаление / добавление */}
        <div style={strip}>
          {urls.map((u, i) => (
            <div key={i}
              style={{ ...thumbBase, cursor: onReorder ? 'grab' : 'pointer', opacity: dragIdx === i ? 0.4 : 1,
                outline: i === idx ? '2px solid var(--amoled-accent, #7c5cff)' : '1px solid rgba(255,255,255,0.12)' }}
              onClick={() => setIdx(i)} title={onReorder ? `Фото ${i + 1} · тяни, чтобы переставить` : `Фото ${i + 1}`}
              draggable={!!onReorder}
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { if (onReorder) e.preventDefault() }}
              onDrop={() => {
                if (onReorder && dragIdx !== null && dragIdx !== i) {
                  onReorder(dragIdx, i)
                  setRots(prev => arrayMove(prev, dragIdx, i))
                  setIdx(i)
                }
                setDragIdx(null)
              }}
              onDragEnd={() => setDragIdx(null)}>
              <img src={u} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `rotate(${rots[i] || 0}deg)` }} />
              {onRemove && list.length > 1 && (
                <button style={thumbX} title="Убрать это фото"
                  onClick={(e) => { e.stopPropagation(); onRemove(i); setRots(prev => prev.filter((_, k) => k !== i)) }}>✕</button>
              )}
            </div>
          ))}
          {onAdd && (
            <div style={addThumb} title="Добавить фото" onClick={() => fileInputRef.current?.click()}>＋</div>
          )}
          {onAdd && (
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = '' }} />
          )}
        </div>

        {/* #10: подтверждение закрытия с выбранными фото */}
        {confirmClose && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 12.5,
            background: 'rgba(245,183,74,0.10)', borderTop: '1px solid rgba(245,183,74,0.30)', color: '#f5d69a' }}>
            <span>Отменить отправку {list.length} фото?</span>
            <div style={{ flex: 1 }} />
            <button style={{ ...cbtn, minWidth: 80, fontSize: 12.5 }} onClick={() => setConfirmClose(false)}>Продолжить</button>
            <button style={{ ...cbtn, minWidth: 120, fontSize: 12.5, color: '#ff9a9a' }} onClick={() => onCancel?.()}>Отменить отправку</button>
          </div>
        )}

        {/* v1.2.209 (вариант 1): счётчик подписи; при превышении — выбор «сократить» / «текст отдельно» */}
        {capLen > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 11.5,
            borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
            <span style={{ color: capOver ? '#ff9a9a' : 'var(--amoled-text-dim)', fontVariantNumeric: 'tabular-nums' }}>
              {capLen} / {CAPTION_MAX}{capOver ? ` · −${capLen - CAPTION_MAX}` : ''}
            </span>
            {capOver && (<>
              <span style={{ color: '#f5b74a' }}>⚠ не влезет в подпись — текст уйдёт {textChunks} {textChunks === 1 ? 'сообщением' : 'сообщениями'}</span>
              <div style={{ flex: 1 }} />
              <button style={{ ...cbtn, minWidth: 84, fontSize: 11.5, border: '1px solid rgba(255,255,255,0.14)' }}
                onClick={() => taRef.current?.focus()}>Сократить</button>
              <button style={{ ...cbtn, minWidth: 150, fontSize: 11.5, background: 'var(--amoled-accent, #7c5cff)', color: '#fff' }}
                title="Сначала фото, затем весь текст отдельными сообщениями"
                onClick={() => handleSend(true)}>Фото, затем текст ({textChunks})</button>
            </>)}
          </div>
        )}

        <div style={foot}>
          <textarea
            ref={taRef}
            rows={1}
            value={caption || ''}
            onChange={(e) => { onCaptionChange?.(e.target.value); autosize(e.target) }}
            onKeyDown={onCaptionKeyDown}
            placeholder="Подпись (необязательно) · Shift+Enter — новая строка"
            disabled={busy}
            style={{ ...capStyle, border: capOver ? '1px solid rgba(255,107,107,0.55)' : '1px solid rgba(255,255,255,0.14)' }}
          />
          <button className="native-btn" onClick={() => handleSend(false)} disabled={busy || capOver}
            style={{ minWidth: 110, position: 'relative', overflow: 'hidden' }}>
            {rotating ? 'Поворот...' : sending ? 'Отправка...' : (many ? `Отправить (${list.length})` : 'Отправить')}
            {/* #4: общий прогресс загрузки (по сумме, т.к. TDLib даёт его по fileId) */}
            {sending && upPct != null && (
              <span style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${upPct}%`, background: 'rgba(255,255,255,0.65)' }} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
