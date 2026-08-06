// v1.2.197: чистая математика зума/перемещения превью фото перед отправкой.
// Вынесено ОТДЕЛЬНО от React-компонента (PhotoSendModal.jsx), чтобы покрыть тестами:
// happy-dom не считает layout (getBoundingClientRect=0), поэтому геометрию передаём
// АРГУМЕНТАМИ, а не читаем из DOM. Поведение как в смотрелке main/photo-viewer.html
// (scale, translate offX/offY, wheel ±0.15, кнопки ±0.25, dblclick reset).
//
// ВАЖНО: это ТОЛЬКО ВИД (CSS transform). Отправляется исходный файл без изменений.

export const MIN_SCALE = 1   // 100% = вписано в окно; ниже не опускаемся (в отправке смысла нет)
export const MAX_SCALE = 8   // как в смотрелке

export function clampScale(s) {
  if (!Number.isFinite(s)) return MIN_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
}

// Колесо мыши: множительный шаг (как в смотрелке — deltaY>0 => отдалить).
export function wheelScale(scale, deltaY) {
  const s = Number.isFinite(scale) ? scale : MIN_SCALE
  const factor = deltaY > 0 ? -0.15 : 0.15
  return clampScale(s + s * factor)
}

// Кнопки −/+: аддитивный шаг 0.25 (dir>0 — приблизить).
export function stepScale(scale, dir) {
  const s = Number.isFinite(scale) ? scale : MIN_SCALE
  return clampScale(s + (dir > 0 ? 0.25 : -0.25))
}

// Зум К ТОЧКЕ под курсором: (cx,cy) — координаты точки относительно ЦЕНТРА контейнера.
// Пересчитываем сдвиг так, чтобы точка под курсором осталась на том же месте экрана.
// Инвариант: screenX = imgCoord*scale + x  →  подбираем x' при новом scale.
export function zoomToPoint(state, newScale, cx, cy) {
  const s0 = (state && Number.isFinite(state.scale)) ? state.scale : MIN_SCALE
  const x0 = (state && Number.isFinite(state.x)) ? state.x : 0
  const y0 = (state && Number.isFinite(state.y)) ? state.y : 0
  const ns = clampScale(newScale)
  if (ns === s0) return { scale: ns, x: x0, y: y0 }
  const k = ns / s0
  return { scale: ns, x: cx - (cx - x0) * k, y: cy - (cy - y0) * k }
}

// Сброс (двойной клик / кнопка «вписать»): 100%, по центру.
export function resetTransform() {
  return { scale: MIN_SCALE, x: 0, y: 0 }
}

// Следующий угол поворота (кнопка ⟳): по 90°, зациклено 0→90→180→270→0.
export function nextRotation(rot) {
  return (((Number(rot) || 0) + 90) % 360 + 360) % 360
}

// v1.2.198 (#2): ограничение сдвига — не даём утащить фото за край. Когда картинка
// больше окна, держим её покрывающей окно (без пустых полей). contentW/H — ЭКРАННЫЙ
// размер картинки С УЧЁТОМ масштаба и поворота; containerW/H — размер области просмотра.
// Если картинка меньше/равна окну по оси — сдвиг по этой оси обнуляется (по центру).
export function clampOffset(x, y, contentW, contentH, containerW, containerH) {
  const maxX = Math.max(0, ((contentW || 0) - (containerW || 0)) / 2)
  const maxY = Math.max(0, ((contentH || 0) - (containerH || 0)) / 2)
  const cx = Number.isFinite(x) ? x : 0
  const cy = Number.isFinite(y) ? y : 0
  return { x: Math.min(maxX, Math.max(-maxX, cx)), y: Math.min(maxY, Math.max(-maxY, cy)) }
}

// Размер картинки, вписанной в окно (object-fit: contain) при масштабе 1 — от него
// считаем экранный размер для clampOffset. Нужны натуральные размеры картинки + окно.
export function fitSize(natW, natH, boxW, boxH) {
  if (!natW || !natH || !boxW || !boxH) return { w: boxW || 0, h: boxH || 0 }
  const ia = natW / natH, ca = boxW / boxH
  return ia > ca ? { w: boxW, h: boxW / ia } : { w: boxH * ia, h: boxH }
}
