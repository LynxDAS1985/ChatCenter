// main/handlers/notifInputProbeCore.js — v1.2.487
//
// ЧИСТАЯ логика «наблюдателя мыши» окна уведомлений. Ни Electron, ни окна — только числа
// и строки, поэтому проверяется тестами без запуска программы. Обвязка с Electron лежит
// рядом — notifInputProbe.js.
//
// ЗАЧЕМ ЭТО ВООБЩЕ (дело: .memory-bank/notif-window-input-loss-case.md).
// Три раза (19.08, 02.09, 19.09.2026) окно уведомлений переставало принимать мышь ЦЕЛИКОМ:
// все кнопки мертвы, а само окно живое (отвечает на переклички сторожа) и карточки внутри
// здоровые (снимок DOM: непрозрачные, для мыши открытые). Два раза лечили симптом (меньше
// карточек, не показывать старьё) — беда вернулась. Причину ни разу не нашли, потому что
// в журнале НЕТ НИ ОДНОЙ записи о мыши: ни «Windows отдал нажатие окну», ни «страница его
// получила». Глюк редкий (недели между случаями), воспроизвести нельзя — значит следующий
// случай обязан рассказать о себе САМ, ещё до того, как человек нажмёт на кнопку.
//
// ЧТО СЧИТАЕМ (три уровня, по которым потом ставится диагноз):
//   1. Оболочка окна (главный процесс, событие webContents 'input-event') — Windows вообще
//      отдаёт мышь этому окну?                              → recordInput()
//   2. Страница внутри окна (notification-helpers.js, mousedown/mousemove) — мышь дошла
//      до кнопок?                                             (пишется там же, в журнал)
//   3. Курсор системы (screen.getCursorScreenPoint) раз в тик сторожа — он НАД окном и
//      ДВИГАЕТСЯ, а событий нет? Это и есть «подозрение».      → decideTick()
//
// ПОЧЕМУ «ПОДОЗРЕНИЕ» ТРЕБУЕТ ТРЁХ ТИКОВ ПОДРЯД: одиночный тик «курсор внутри и сдвинулся,
// событий нет» бывает честно — мышь могла выйти из окна и вернуться между двумя замерами,
// не задев его. Три замера подряд (15 с) с движением внутри и полной тишиной — уже нет.
//
// «САМОПРОВЕРКА» (два БЕЗВРЕДНЫХ шага, по одному, с паузой в 2 тика): шаг 1 — снять и снова
// поставить «поверх всех»; шаг 2 — на 1 точку сжать окно и вернуть. Если после шага мышь
// ВЕРНУЛАСЬ — журнал скажет, после какого именно: это и есть улика о причине (шаг 1 → дело
// в «поверх всех»/пружине; шаг 2 → дело в геометрии/раскладке окна; ни один → Windows
// или чужое окно). Пряталок/показов окна в шагах НЕТ намеренно: hide() у прозрачного окна
// сам по себе источник граблей (transparentWindowGuard, ловушки #20/#21).

export const STATUS_EVERY_MS = 120000        // строка состояния — раз в 2 минуты, пока окно видимо
export const SUSPECT_TICKS = 3               // подряд тиков «курсор над окном двигается, событий нет»
export const REMEDY_GAP_TICKS = 2            // между шагами самопроверки
export const REMEDY_COOLDOWN_MS = 5 * 60 * 1000 // не чаще одной серии шагов в 5 минут
export const REMEDY_STEPS = ['topmost-toggle', 'bounds-nudge']
const COUNTED = ['mouseMove', 'mouseDown', 'mouseUp', 'mouseEnter', 'mouseLeave', 'mouseWheel']

export function createProbeState(now = Date.now()) {
  return {
    attachedAt: now,
    visibleSince: 0,
    counts: Object.fromEntries(COUNTED.map(k => [k, 0]).concat([['other', 0]])), // с последней строки состояния
    sinceTick: 0,            // событий ввода с прошлого тика
    lastInputTs: 0,
    lastInputType: '',
    lastCursor: null,
    suspectRun: 0,           // сколько тиков подряд держится подозрение
    lastStatusTs: 0,
    remedy: { nextStep: 0, seriesAt: 0, active: false, pendingStep: '', pendingSince: 0 },
    unresponsive: false,
  }
}

/** Событие ввода дошло до оболочки окна. Возвращает сведения, если это первое событие после шага самопроверки. */
export function recordInput(state, ev, now = Date.now()) {
  const t = (ev && ev.type) || 'other'
  state.counts[COUNTED.includes(t) ? t : 'other']++
  state.sinceTick++
  state.lastInputTs = now
  state.lastInputType = t
  state.suspectRun = 0
  if (state.remedy.pendingStep) {
    const r = { restoredAfterStep: state.remedy.pendingStep, waitedMs: now - state.remedy.pendingSince }
    state.remedy.pendingStep = ''
    state.remedy.pendingSince = 0
    return r
  }
  return null
}

export function isInside(bounds, p) {
  if (!bounds || !p) return false
  return p.x >= bounds.x && p.x < bounds.x + bounds.width && p.y >= bounds.y && p.y < bounds.y + bounds.height
}

/**
 * Один тик сторожа (раз в 5 с). Решает: писать ли состояние, есть ли подозрение,
 * какой шаг самопроверки применить. Само НИЧЕГО не делает — только решает.
 * @returns {{idle?:boolean, inside?:boolean, moved?:boolean, suspect?:boolean, warn?:boolean, remedyStep?:string, exhausted?:boolean, statusDue?:boolean}}
 */
export function decideTick(state, { cursor, bounds, visible, onscreen, now = Date.now() }) {
  if (!visible || !onscreen) {
    state.visibleSince = 0; state.suspectRun = 0; state.lastCursor = null; state.sinceTick = 0
    return { idle: true }
  }
  if (!state.visibleSince) state.visibleSince = now
  const inside = isInside(bounds, cursor)
  const moved = !!(state.lastCursor && cursor && (state.lastCursor.x !== cursor.x || state.lastCursor.y !== cursor.y))
  const hadInput = state.sinceTick > 0
  if (inside && moved && !hadInput) state.suspectRun++
  else state.suspectRun = 0
  state.lastCursor = cursor ? { x: cursor.x, y: cursor.y } : null
  state.sinceTick = 0

  const out = { inside, moved, suspect: state.suspectRun >= SUSPECT_TICKS }
  if (state.suspectRun === SUSPECT_TICKS) {
    out.warn = true
    // Новая серия шагов — только если прошлая была давно (или её не было). Иначе лишь предупреждаем:
    // бесконечно дёргать окно нельзя, а причину журнал уже покажет.
    if (!state.remedy.seriesAt || now - state.remedy.seriesAt >= REMEDY_COOLDOWN_MS) {
      state.remedy.seriesAt = now; state.remedy.nextStep = 0; state.remedy.active = true
    } else {
      state.remedy.active = false
    }
  }
  if (out.suspect && state.remedy.active) {
    const ticksSinceWarn = state.suspectRun - SUSPECT_TICKS
    if (state.remedy.nextStep < REMEDY_STEPS.length && ticksSinceWarn === state.remedy.nextStep * REMEDY_GAP_TICKS) {
      out.remedyStep = REMEDY_STEPS[state.remedy.nextStep]
      state.remedy.pendingStep = out.remedyStep
      state.remedy.pendingSince = now
      state.remedy.nextStep++
    } else if (state.remedy.nextStep >= REMEDY_STEPS.length && ticksSinceWarn === REMEDY_STEPS.length * REMEDY_GAP_TICKS) {
      out.exhausted = true // оба шага не вернули мышь — причина не в «поверх всех» и не в геометрии окна
    }
  }
  if (!state.lastStatusTs || now - state.lastStatusTs >= STATUS_EVERY_MS || out.warn) {
    state.lastStatusTs = now
    out.statusDue = true
  }
  return out
}

/** Сводка по всем нашим окнам — чтобы видеть, не лежит ли какое-то из них на месте уведомлений. */
export function formatWindowsSummary(list) {
  return (list || []).map(w => {
    const b = w.bounds || {}
    return `#${w.id}${w.title ? ' ' + String(w.title).slice(0, 14) : ''} ${b.x},${b.y} ${b.width}x${b.height}`
      + (w.visible ? ' видимо' : ' скрыто') + (w.onTop ? ' поверх' : '')
  }).join(' | ') || 'нет'
}

/** Строка состояния окна — в журнал раз в 2 минуты и при подозрении. */
export function formatStatusLine(state, { bounds, cursor, inside, onTop, focusable, alive, windows, now = Date.now() }) {
  const c = state.counts
  const visMin = state.visibleSince ? Math.round((now - state.visibleSince) / 60000) : 0
  const lastIn = state.lastInputTs ? Math.round((now - state.lastInputTs) / 1000) + 'с назад (' + state.lastInputType + ')' : 'ни разу'
  const line = '[notif-input] состояние: видимо ' + visMin + ' мин; мышь за период: move=' + c.mouseMove
    + ' down=' + c.mouseDown + ' up=' + c.mouseUp + ' enter=' + c.mouseEnter + ' leave=' + c.mouseLeave
    + ' wheel=' + c.mouseWheel + ' other=' + c.other + '; последнее событие ' + lastIn
    + '; курсор=' + (cursor ? cursor.x + ',' + cursor.y : '?') + (inside ? ' НАД окном' : ' вне окна')
    + '; окно=' + (bounds ? bounds.x + ',' + bounds.y + ' ' + bounds.width + 'x' + bounds.height : '?')
    + ' поверх=' + (onTop ? 'да' : 'нет') + ' фокусируемо=' + (focusable ? 'да' : 'нет')
    + ' страница жива=' + (alive ? 'да' : 'НЕТ') + (state.unresponsive ? ' НЕ ОТВЕЧАЕТ' : '')
    + '; подозрение=' + state.suspectRun + '/' + SUSPECT_TICKS
    + '; наши окна: ' + formatWindowsSummary(windows)
  for (const k of Object.keys(c)) c[k] = 0
  return line
}

/** Строка о нажатии, дошедшем до оболочки. */
export function formatMouseDownLine(ev, bounds, cursor) {
  const inside = isInside(bounds, cursor)
  return '[notif-input] оболочка: mouseDown ' + (ev.button || '') + ' в окне x=' + ev.x + ' y=' + ev.y
    + ' курсор=' + (cursor ? cursor.x + ',' + cursor.y : '?') + (inside ? ' (над окном)' : ' (ВНЕ окна!)')
    + ' окно=' + (bounds ? bounds.x + ',' + bounds.y + ' ' + bounds.width + 'x' + bounds.height : '?')
}
