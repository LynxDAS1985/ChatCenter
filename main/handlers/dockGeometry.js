// v1.2.91: чистый расчёт вертикальной позиции полоски дока.
// Вынесено из обработчика dock:resize (dockPinHandlers.js) в отдельную функцию БЕЗ
// зависимости от Electron, чтобы покрыть юнит-тестом (dockGeometry.vitest.js) — раньше
// эту геометрию нельзя было проверить без запуска приложения, тест ловил только
// наличие строк, а не сами числа (см. features.md v1.2.89 — баг «полоска сползает вниз»).
//
// Принцип (см. decisions.md ADR-018): держим ВЕРХ полоски на стабильном якоре
// baselineTopY (меняется только при перетаскивании), НЕ пересчитываем из живой высоты
// окна. Клампим по экрану: не ниже низа экрана, не выше рабочей области.

/**
 * Вычислить верхнюю Y-координату окна дока.
 * @param {object} p
 * @param {number|null|undefined} p.baselineTopY - стабильный якорь верхней кромки (экранный Y)
 * @param {number} p.currentTopY - текущий bounds.y (фолбэк, если якоря ещё нет)
 * @param {number} p.totalH - высота окна дока (по контенту)
 * @param {number} p.workAreaTop - верх рабочей области (display.workArea.y)
 * @param {number} p.screenBottom - низ экрана (display.bounds.y + display.bounds.height)
 * @returns {number} newY — верхняя координата окна
 */
export function computeDockTop({ baselineTopY, currentTopY, totalH, workAreaTop, screenBottom }) {
  // 1. Берём стабильный якорь; если его нет/битый — текущую позицию окна.
  let newY = (baselineTopY != null && Number.isFinite(baselineTopY)) ? baselineTopY : currentTopY
  if (!Number.isFinite(newY)) newY = 0
  // 2. Не ниже низа экрана (низ полоски = newY + totalH не должен уйти за экран).
  if (Number.isFinite(screenBottom) && Number.isFinite(totalH) && newY + totalH > screenBottom) {
    newY = screenBottom - totalH
  }
  // 3. Не выше рабочей области (применяется ПОСЛЕДНИМ — приоритет верхней границы).
  if (Number.isFinite(workAreaTop) && newY < workAreaTop) newY = workAreaTop
  return newY
}
