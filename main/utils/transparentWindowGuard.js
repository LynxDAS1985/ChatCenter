// v0.89.18: защита от «ghost» hit-test region у transparent BrowserWindow.
//
// ПРОБЛЕМА (Windows 11):
// BrowserWindow с `transparent: true` + `frame: false` после вызова `.hide()`
// может оставить **невидимый hit-test регион** на экране в том месте, где
// окно было видимым. Пользователь видит:
//   1. Тонкую линию-контур (остаточный кадр DWM frame buffer)
//   2. Невидимый прямоугольник, перехватывающий клики
//
// ПРИЧИНА (известная Electron / Win32 issue):
// `transparent: true` использует layered window API Windows. Слой не всегда
// корректно освобождается на `.hide()`. На macOS/Linux проблемы нет.
//
// КАК РЕШАЕТСЯ:
// Перед `.hide()` выполнить два шага:
//   1. `setIgnoreMouseEvents(true)` — клики проходят сквозь окно
//   2. `setBounds({ x:-30000, y:-30000, width:1, height:1 })` — увести окно
//      за пределы экрана и сжать до 1×1
// Тогда даже если hit-region «прилипнет», он будет за экраном и 1×1 —
// пользователь его никогда не увидит и не «поймает».
//
// При следующем показе окна — `setIgnoreMouseEvents(false)` + новый `setBounds`.
// Уже есть в коде, не требуется отдельного хелпера.
//
// УЖЕ ДОКУМЕНТИРОВАЛИ в `.memory-bank/mistakes/notifications-ribbon.md:280-283`
// (v0.39.0), но не закрывали 78 версий — теперь закрыто.

const OFFSCREEN_BOUNDS = { x: -30000, y: -30000, width: 1, height: 1 }

/**
 * Безопасно скрывает прозрачное BrowserWindow без оставления hit-test «следа».
 *
 * Перед `.hide()`:
 *   1. Отключает приём mouse events (если клик и просочится — пройдёт насквозь)
 *   2. Уводит окно за экран и сжимает до 1×1 (даже если region «прилипнет» —
 *      невидим и не перехватит клик)
 *
 * Безопасно вызывать с null/undefined/destroyed окном — просто игнорирует.
 *
 * @param {Electron.BrowserWindow|null|undefined} win
 * @returns {boolean} true если окно было видимым и скрыто, false иначе
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
    // Шаг 1: клики сквозь окно даже если hit-region останется
    if (typeof win.setIgnoreMouseEvents === 'function') {
      win.setIgnoreMouseEvents(true)
    }
    // Шаг 2: уводим за экран в размер 1×1
    if (typeof win.setBounds === 'function') {
      win.setBounds(OFFSCREEN_BOUNDS)
    }
    // Шаг 3: фактический hide()
    if (typeof win.hide === 'function') {
      win.hide()
    }
    return true
  } catch (e) {
    try { console.warn('[notif-guard] safeHide error: ' + e?.message) } catch (_) {}
    return false
  }
}

/**
 * Восстанавливает приём mouse events у окна — вызывается перед `.show()`/
 * `.showInactive()` если ранее использовался `safeHideTransparentWindow`.
 *
 * Безопасно с null/destroyed.
 *
 * @param {Electron.BrowserWindow|null|undefined} win
 */
export function restoreMouseEvents(win) {
  if (!win) return
  try {
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return
    if (typeof win.setIgnoreMouseEvents === 'function') {
      win.setIgnoreMouseEvents(false)
      // v0.89.20: diagnostic log
      try { console.log('[notif-guard] restoreMouseEvents called') } catch (_) {}
    }
  } catch (_) { /* noop */ }
}

// Экспорт констант для тестов
export const __test = { OFFSCREEN_BOUNDS }
