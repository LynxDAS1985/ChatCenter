// main/handlers/notifInputProbe.js — v1.2.487
//
// «Наблюдатель мыши» окна уведомлений — обвязка с Electron. Вся логика решений — в
// notifInputProbeCore.js (чистая, под тестами). Здесь только: подписки на окно, чтение
// курсора/границ/списка окон и применение шагов самопроверки.
//
// ЗАЧЕМ — дело .memory-bank/notif-window-input-loss-case.md: окно уведомлений трижды
// переставало принимать мышь целиком, причина не найдена, потому что о мыши журнал молчал.
//
// КАК ЧИТАТЬ ЖУРНАЛ (метки):
//   [notif-input] оболочка: mouseDown …   — Windows отдал нажатие окну (уровень 1)
//   [notif-renderer] page: mousedown …    — нажатие дошло до страницы (уровень 2, helpers)
//   [notif-input] ПОДОЗРЕНИЕ …            — курсор над окном двигается 15 с, событий нет
//   [notif-input] самопроверка: шаг …     — применили безвредный шаг
//   [notif-input] мышь ВЕРНУЛАСЬ после …  — какой шаг помог = улика о причине
//   [notif-input] состояние: …            — раз в 2 минуты, пока окно видимо
//   [notif-input] окно НЕ ОТВЕЧАЕТ / страница упала — Windows/Chromium считают окно мёртвым
//
// Таймеров своих НЕТ: тик вызывает существующий сторож notifHandlers (раз в 5 с) — правило
// проекта «не плодить таймеры» (memoryLeaks.test).
import { screen, BrowserWindow } from 'electron'
import {
  createProbeState, recordInput, decideTick, isInside,
  formatStatusLine, formatMouseDownLine,
} from './notifInputProbeCore.js'

const states = new WeakMap() // окно → состояние наблюдателя

function safeBounds(win) { try { return win.getBounds() } catch (_) { return null } }
function safeCursor() { try { return screen.getCursorScreenPoint() } catch (_) { return null } }

function listOurWindows() {
  try {
    return BrowserWindow.getAllWindows().map(w => {
      let title = ''
      try { title = w.getTitle() } catch (_) {}
      return { id: w.id, title, bounds: safeBounds(w), visible: w.isVisible(), onTop: w.isAlwaysOnTop() }
    })
  } catch (_) { return [] }
}

/** Подписать окно уведомлений на наблюдение. Повторный вызов для того же окна — ничего не делает. */
export function attachNotifInputProbe(win) {
  if (!win || states.has(win)) return
  const state = createProbeState()
  states.set(win, state)
  const wc = win.webContents
  wc.on('input-event', (_e, ev) => {
    const now = Date.now()
    const restored = recordInput(state, ev, now)
    if (ev && ev.type === 'mouseDown') console.log(formatMouseDownLine(ev, safeBounds(win), safeCursor()))
    if (restored) console.warn('[notif-input] мышь ВЕРНУЛАСЬ после шага «' + restored.restoredAfterStep + '» через ' + restored.waitedMs + ' мс — это улика о причине')
  })
  win.on('unresponsive', () => { state.unresponsive = true; console.error('[notif-input] окно уведомлений НЕ ОТВЕЧАЕТ (unresponsive) — Windows может подменить его застывшей копией') })
  win.on('responsive', () => { state.unresponsive = false; console.warn('[notif-input] окно уведомлений снова отвечает') })
  wc.on('render-process-gone', (_e, d) => console.error('[notif-input] страница окна уведомлений УПАЛА: reason=' + (d && d.reason) + ' exit=' + (d && d.exitCode)))
}

/** Тик наблюдателя — зовёт сторож раз в 5 с. Без состояния (окно не подписано) — ничего. */
export function notifInputProbeTick(win) {
  const state = states.get(win)
  if (!state) return
  let bounds, visible
  try { bounds = win.getBounds(); visible = win.isVisible() } catch (_) { return }
  const onscreen = !!bounds && bounds.x > -10000 && bounds.y > -10000
  const cursor = safeCursor()
  const now = Date.now()
  const d = decideTick(state, { cursor, bounds, visible, onscreen, now })
  if (d.idle) return
  if (d.warn) {
    console.warn('[notif-input] ПОДОЗРЕНИЕ: курсор ' + (cursor ? cursor.x + ',' + cursor.y : '?') + ' над окном и двигается уже '
      + (5 * state.suspectRun) + ' с, а событий мыши от Windows НЕТ — окно, похоже, не принимает мышь')
  }
  if (d.remedyStep === 'topmost-toggle') {
    try { win.setAlwaysOnTop(false); win.setAlwaysOnTop(true, 'screen-saver', 1) } catch (_) {}
    console.warn('[notif-input] самопроверка: шаг «topmost-toggle» — сняли и вернули «поверх всех»; ждём, вернётся ли мышь')
  } else if (d.remedyStep === 'bounds-nudge') {
    try {
      const b = win.getBounds()
      win.setBounds({ x: b.x, y: b.y, width: b.width, height: Math.max(1, b.height - 1) })
      win.setBounds(b)
    } catch (_) {}
    console.warn('[notif-input] самопроверка: шаг «bounds-nudge» — сжали окно на 1 точку и вернули; ждём, вернётся ли мышь')
  }
  if (d.exhausted) {
    console.warn('[notif-input] самопроверка: оба шага НЕ вернули мышь → причина не в «поверх всех» и не в геометрии окна (см. дело notif-window-input-loss-case.md)')
  }
  if (d.statusDue) {
    let onTop = false, focusable = false, alive = false
    try { onTop = win.isAlwaysOnTop() } catch (_) {}
    try { focusable = typeof win.isFocusable === 'function' ? win.isFocusable() : false } catch (_) {}
    try { alive = !win.webContents.isCrashed() } catch (_) {}
    console.log(formatStatusLine(state, {
      bounds, cursor, inside: isInside(bounds, cursor), onTop, focusable, alive, windows: listOurWindows(), now,
    }))
  }
}
