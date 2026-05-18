// v0.89.18: защита от «ghost» hit-test region у transparent BrowserWindow.
// v0.89.22: УДАЛЁН setIgnoreMouseEvents — нарушал ловушку #27 (блокирует
// -webkit-app-region: drag) и вызывал «двойной клик» в pin/dock окнах
// (нет парного restoreMouseEvents перед .show()). Защита от ghost-региона
// теперь только через увод за экран + 1×1 размер + hide().
//
// ПРОБЛЕМА (Windows 11):
// BrowserWindow с `transparent: true` + `frame: false` после вызова `.hide()`
// может оставить **невидимый hit-test регион** на экране в том месте, где
// окно было видимым.
//
// КАК РЕШАЕТСЯ (двойная защита):
// Перед `.hide()` выполнить два шага:
//   1. `setBounds({ x:-30000, y:-30000, width:1, height:1 })` — увести окно
//      за пределы экрана и сжать до 1×1
//   2. `hide()` — фактический hide
//
// Эта комбинация делает hit-test невозможным:
//   • Скрытое окно не получает hit-test
//   • Даже visible — координаты за всеми мониторами (Win поддерживает до ~32k)
//   • Размер 1×1 — пользователь физически не наведёт мышь на 1 пиксель
//
// ПОЧЕМУ УБРАЛИ setIgnoreMouseEvents (v0.89.18 → v0.89.22):
//   • Ловушка #27 (v0.71.7): setIgnoreMouseEvents БЛОКИРУЕТ -webkit-app-region: drag
//     у dock/pin окон. Окно становится click-through, drag перестаёт работать
//   • Electron docs: «state persists until explicitly changed» — обязан вернуть false
//     перед .show(). В 5 точках show pin/dock не было парного restoreMouseEvents
//     → окно visible, но клики проходят насквозь → пользователь делает «двойной клик»
//   • Был избыточным: setBounds offscreen + hide уже даёт полную защиту
//
// УЖЕ ДОКУМЕНТИРОВАНО:
//   • Ловушка #20 в mistakes/notifications-ribbon.md (v0.89.18) — ghost hit-test
//   • Ловушка #21 в mistakes/notifications-ribbon.md (v0.89.22) — setIgnoreMouseEvents

const OFFSCREEN_BOUNDS = { x: -30000, y: -30000, width: 1, height: 1 }

/**
 * Безопасно скрывает прозрачное BrowserWindow без оставления hit-test «следа».
 *
 * Перед `.hide()`:
 *   1. Уводит окно за экран и сжимает до 1×1 (даже если ghost-region «прилипнет»
 *      на Win11 — он невидим и не перехватит клик)
 *   2. Фактический hide()
 *
 * Безопасно вызывать с null/undefined/destroyed окном — просто игнорирует.
 *
 * @param {Electron.BrowserWindow|null|undefined} win
 * @returns {boolean} true если окно успешно скрыто, false иначе
 */
export function safeHideTransparentWindow(win) {
  if (!win) return false
  try {
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return false
    // v0.89.20: diagnostic log — расследование бага «остаётся полоска»
    try {
      const wasVisible = typeof win.isVisible === 'function' ? win.isVisible() : 'unknown'
      const boundsBefore = typeof win.getBounds === 'function' ? win.getBounds() : null
      console.log('[notif-guard] safeHide called wasVisible=' + wasVisible +
        ' boundsBefore=' + JSON.stringify(boundsBefore))
    } catch (_) {}
    // Шаг 1: уводим за экран в размер 1×1
    if (typeof win.setBounds === 'function') {
      win.setBounds(OFFSCREEN_BOUNDS)
    }
    // Шаг 2: фактический hide()
    if (typeof win.hide === 'function') {
      win.hide()
    }
    return true
  } catch (e) {
    try { console.warn('[notif-guard] safeHide error: ' + e?.message) } catch (_) {}
    return false
  }
}

// Экспорт констант для тестов
export const __test = { OFFSCREEN_BOUNDS }
