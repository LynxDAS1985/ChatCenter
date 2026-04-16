// v0.87.27: Модальный просмотрщик фото — полноэкранный overlay + zoom + pan + always-on-top.
// Open: onClick по фото → setViewerSrc(url). Close: Esc, клик по фону, кнопка ×.
// Управление: колёсико = zoom, drag = pan, двойной клик = reset, кнопка 📌 = always-on-top.
import { useEffect, useRef, useState } from 'react'

export default function PhotoViewer({ src, onClose }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [pinned, setPinned] = useState(false)
  const dragRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Always-on-top через IPC (переключение у mainWindow)
  const togglePin = async () => {
    const next = !pinned
    setPinned(next)
    try { await window.api?.invoke('window:set-always-on-top', { on: next }) } catch(_) {}
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setScale(s => Math.max(0.3, Math.min(6, s + s * delta)))
  }

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
  }
  const handleMouseMove = (e) => {
    if (!dragRef.current) return
    setOffset({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y })
  }
  const handleMouseUp = () => { dragRef.current = null }

  const handleDoubleClick = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  if (!src) return null

  return (
    <div className="native-photo-viewer"
      onClick={(e) => { if (e.target.classList.contains('native-photo-viewer')) onClose() }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Тулбар */}
      <div className="native-photo-toolbar" onClick={e => e.stopPropagation()}>
        <button title="Уменьшить (−)" onClick={() => setScale(s => Math.max(0.3, s - 0.25))}>−</button>
        <span>{Math.round(scale * 100)}%</span>
        <button title="Увеличить (+)" onClick={() => setScale(s => Math.min(6, s + 0.25))}>+</button>
        <button title="Сброс (двойной клик)" onClick={handleDoubleClick}>⟲</button>
        <button
          title={pinned ? 'Открепить окно' : 'Закрепить окно поверх всех'}
          onClick={togglePin}
          style={{ color: pinned ? 'var(--amoled-accent)' : undefined }}
        >📌</button>
        <a href={src} download title="Скачать">⬇</a>
        <button title="Закрыть (Esc)" onClick={onClose}>✕</button>
      </div>
      <img
        src={src}
        alt="photo"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        draggable={false}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          cursor: dragRef.current ? 'grabbing' : 'grab',
          userSelect: 'none',
          transition: dragRef.current ? 'none' : 'transform 0.12s ease-out',
        }}
      />
    </div>
  )
}
