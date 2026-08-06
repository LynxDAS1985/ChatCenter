// v1.2.202: чистая логика «памяти окна» — вынесена из windowManager.js, чтобы покрыть тестами.
// windowManager.js создаёт BrowserWindow и импортирует electron → его нельзя загрузить в vitest
// (happy-dom, без Electron). Здесь — только математика, без зависимостей от Electron.
// Используется в windowManager.js: restorePlan при старте, buildSavedBounds при сохранении.

/**
 * Пересекается ли сохранённый прямоугольник окна хотя бы с одним видимым экраном.
 * Защита «окно потерялось за экраном» (отключили монитор / сменили разрешение).
 * @param {{x?:number,y?:number,width?:number,height?:number}} bounds
 * @param {Array<{workArea?:{x:number,y:number,width:number,height:number}}>} displays
 * @returns {boolean}
 */
export function isBoundsVisible(bounds, displays) {
  if (!bounds || bounds.x == null || bounds.y == null) return false
  if (!Array.isArray(displays) || displays.length === 0) return false
  const w = bounds.width || 0, h = bounds.height || 0
  return displays.some((d) => {
    const wa = (d && d.workArea) || {}
    if (wa.x == null || wa.y == null || wa.width == null || wa.height == null) return false
    return bounds.x < wa.x + wa.width && bounds.x + w > wa.x &&
           bounds.y < wa.y + wa.height && bounds.y + h > wa.y
  })
}

/**
 * Что записать в хранилище. Развёрнутое окно даёт «развёрнутый» getBounds() (−7,−7, шире экрана),
 * поэтому храним ОБЫЧНЫЙ размер (getNormalBounds) + флаг isMaximized — чтобы при старте вернуть и
 * размер до разворота, и сам факт «было развёрнуто».
 * @param {{isMaximized:boolean, normalBounds?:object, bounds?:object}} in
 * @returns {{x:number,y:number,width:number,height:number,isMaximized:boolean}}
 */
export function buildSavedBounds({ isMaximized, normalBounds, bounds } = {}) {
  const rect = (isMaximized ? (normalBounds || bounds) : bounds) || {}
  return {
    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    isMaximized: !!isMaximized,
  }
}

/**
 * План восстановления окна при старте: размеры + позиция (x/y = undefined, если вне экранов →
 * окно откроется по центру) + надо ли развернуть.
 * @param {object|null} saved — сохранённый windowBounds
 * @param {Array} displays — screen.getAllDisplays()
 * @param {{width:number,height:number}} defaults
 * @returns {{width:number,height:number,x:(number|undefined),y:(number|undefined),maximize:boolean}}
 */
export function restorePlan(saved, displays, defaults = { width: 1400, height: 900 }) {
  const b = saved || {}
  const onScreen = isBoundsVisible(b, displays)
  return {
    width: b.width || defaults.width,
    height: b.height || defaults.height,
    x: onScreen ? b.x : undefined,
    y: onScreen ? b.y : undefined,
    maximize: !!b.isMaximized,
  }
}
