// v1.2.431/432/433: тест сторожа «пустого (чёрного) экрана» веб-вкладки.
//
// Две ловушки на РЕАЛЬНЫЕ провалы:
//  1) провал v1.2.431 — если пиксели прочитать нечем, сторож ОБЯЗАН написать предупреждение
//     (раньше молча выходил → в журнале было 0 строк);
//  2) провал v1.2.432 — ровная ТЁМНАЯ заливка яркостью 32 (именно так меряется «чёрный»
//     экран МАКС: фон rgb(23,24,28)) ОБЯЗАНА считаться пустым кадром и давать пинок
//     (раньше порог яркости стоял 12 → 32 проходило как «не чёрный» и пинка не было).
import { describe, it, expect } from 'vitest'
import { frameStats, isBlankFrame, readFramePixels, checkBlackAndRepaint, BLACK_LUM, FLAT_STDEV, WATCHDOG_INTERVAL_MS } from '../utils/webviewBlackWatchdog.js'

// v1.2.435 ТЕСТ-ЛОВУШКА: снимок кадра — дорогая операция (полный кадр вкладки + getBitmap).
// Теория «чёрный экран лечится принудительной перерисовкой» ОПРОВЕРГНУТА опытом: пинок
// сработал дважды и не помог, а настоящей причиной был наш собственный впрыск, ставивший
// display:none на корень приложения (см. shared/browserBannerHider.js и ADR-042). Сторож
// оставлен страховкой, но платить 6 снимков в минуту за опровергнутую теорию незачем.
describe('Частота проверок (WATCHDOG_INTERVAL_MS)', () => {
  it('не чаще одного раза в минуту', () => {
    expect(WATCHDOG_INTERVAL_MS).toBeGreaterThanOrEqual(60000)
  })
})

const STEP = 137
const SAMPLES = 25
const LEN = 4 * STEP * SAMPLES

// Ровная заливка одного цвета (ничего не нарисовано)
const flat = (v) => new Uint8Array(LEN).fill(v)

// «Нарисованный» кадр: замеряемые точки чередуются тёмная/светлая → большой разброс
function varied() {
  const a = new Uint8Array(LEN)
  for (let k = 0; k * 4 * STEP + 3 < LEN; k++) {
    const v = k % 2 ? 255 : 0
    const o = k * 4 * STEP
    a[o] = v; a[o + 1] = v; a[o + 2] = v
  }
  return a
}

function makeEl(bitmap, { width = 800, capture = true, viaBitmap = true } = {}) {
  const wrap = { style: {}, getBoundingClientRect: () => ({ width }) }
  const img = { isEmpty: () => false }
  if (viaBitmap) img.getBitmap = () => bitmap
  const el = { parentElement: wrap, capturePage: capture ? async () => img : undefined }
  return { el, wrap }
}
const st = () => ({ nudges: 0, checks: 0 })

describe('Статистика кадра (frameStats)', () => {
  it('пустой вход → считать нечего', () => {
    expect(frameStats(null).samples).toBe(0)
    expect(frameStats(new Uint8Array(0)).avg).toBe(-1)
  })
  it('ровная чёрная заливка → яркость 0, разброс 0', () => {
    const s = frameStats(flat(0))
    expect(s.avg).toBe(0)
    expect(s.stdev).toBe(0)
    expect(s.samples).toBeGreaterThanOrEqual(10)
  })
  it('ровная ТЁМНАЯ заливка 32 (как у МАКС) → яркость 32, разброс 0', () => {
    const s = frameStats(flat(32))
    expect(s.avg).toBe(32)
    expect(s.stdev).toBe(0)
    expect(s.min).toBe(32)
    expect(s.max).toBe(32)
  })
  it('нарисованный кадр (чередование) → разброс БОЛЬШОЙ', () => {
    const s = frameStats(varied())
    expect(s.stdev).toBeGreaterThan(FLAT_STDEV * 5)
    expect(s.min).toBe(0)
    expect(s.max).toBe(255)
  })
})

describe('Решение «кадр пустой?» (isBlankFrame)', () => {
  it('ЛОВУШКА ПРОВАЛА v1.2.432: ровная тёмная заливка 32 → ПУСТОЙ (по разбросу)', () => {
    const r = isBlankFrame(frameStats(flat(32)))
    expect(r.blank).toBe(true)
    expect(r.flat).toBe(true)
    expect(r.dark).toBe(false) // яркость 32 выше порога 12 — раньше именно тут всё и вставало
  })
  it('почти чёрный кадр → ПУСТОЙ (по яркости)', () => {
    const r = isBlankFrame(frameStats(flat(3)))
    expect(r.blank).toBe(true)
    expect(r.dark).toBe(true)
    expect(frameStats(flat(3)).avg).toBeLessThan(BLACK_LUM)
  })
  it('нарисованный кадр → НЕ пустой', () => {
    const r = isBlankFrame(frameStats(varied()))
    expect(r.blank).toBe(false)
    expect(r.flat).toBe(false)
  })
  it('мало точек → решения не принимаем', () => {
    expect(isBlankFrame({ avg: 0, stdev: 0, samples: 3 }).blank).toBe(false)
    expect(isBlankFrame(null).blank).toBe(false)
  })
})

describe('Чтение пикселей кадра (readFramePixels)', () => {
  it('через сырые пиксели (getBitmap) — работает', async () => {
    const r = await readFramePixels({ getBitmap: () => flat(0) })
    expect(r.via).toBe('bitmap')
    expect(r.bytes.length).toBe(LEN)
  })
  it('НЕТ ни getBitmap, ни toDataURL → возвращает ПРИЧИНУ (не молчит)', async () => {
    const r = await readFramePixels({})
    expect(r.bytes).toBe(null)
    expect(String(r.err)).toContain('нет ни getBitmap, ни toDataURL')
  })
  it('пустой кадр → причина', async () => {
    const r = await readFramePixels(null)
    expect(String(r.err)).toContain('нет кадра')
  })
})

describe('Сторож пустого экрана (checkBlackAndRepaint)', () => {
  it('ЛОВУШКА ПРОВАЛА v1.2.432: ровная тёмная заливка 32 → 1px-пинок', async () => {
    const logs = []
    const { el, wrap } = makeEl(flat(32))
    const state = st()
    const did = await checkBlackAndRepaint(el, (lvl, msg) => logs.push(lvl + ':' + msg), state)
    expect(did).toBe(true)
    expect(state.nudges).toBe(1)
    expect(wrap.style.width).toBe('799px')
    expect(logs.some(l => l.startsWith('WARN') && l.includes('1px-пинок'))).toBe(true)
    expect(logs.some(l => l.includes('разброс 0'))).toBe(true) // цифры в журнале — можно настраивать порог
  })

  it('нарисованный чат → пинка НЕТ, но проверка ЗАПИСАНА', async () => {
    const logs = []
    const { el, wrap } = makeEl(varied())
    const state = st()
    const did = await checkBlackAndRepaint(el, (lvl, msg) => logs.push(lvl + ':' + msg), state)
    expect(did).toBe(false)
    expect(state.nudges).toBe(0)
    expect(wrap.style.width).toBeUndefined()
    expect(logs.some(l => l.startsWith('INFO') && l.includes('пусто=false'))).toBe(true)
  })

  it('ЛОВУШКА ПРОВАЛА v1.2.431: пиксели прочитать нечем → ОБЯЗАНО быть предупреждение', async () => {
    const logs = []
    const { el } = makeEl(null, { viaBitmap: false })
    const state = st()
    expect(await checkBlackAndRepaint(el, (lvl, msg) => logs.push(lvl + ':' + msg), state)).toBe(false)
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.some(l => l.startsWith('WARN') && l.includes('не смог прочитать пиксели'))).toBe(true)
  })

  it('нет capturePage (не webview) → предупреждение, а не тишина', async () => {
    const logs = []
    const { el } = makeEl(flat(0), { capture: false })
    expect(await checkBlackAndRepaint(el, (lvl, msg) => logs.push(lvl + ':' + msg), st())).toBe(false)
    expect(logs.some(l => l.startsWith('WARN') && l.includes('capturePage'))).toBe(true)
  })

  it('предохранитель: не больше maxNudges пинков', async () => {
    const { el } = makeEl(flat(32))
    const state = st()
    for (let i = 0; i < 5; i++) await checkBlackAndRepaint(el, null, state, 3)
    expect(state.nudges).toBe(3)
  })

  it('вкладка спрятана (нулевая ширина) → не пинаем', async () => {
    const { el } = makeEl(flat(32), { width: 0 })
    expect(await checkBlackAndRepaint(el, null, st())).toBe(false)
  })

  it('предупреждение о нечитаемых пикселях пишется ОДИН раз (без спама)', async () => {
    const logs = []
    const { el } = makeEl(null, { viaBitmap: false })
    const state = st()
    for (let i = 0; i < 4; i++) await checkBlackAndRepaint(el, (lvl, msg) => logs.push(msg), state)
    expect(logs.filter(m => m.includes('не смог прочитать пиксели')).length).toBe(1)
  })
})
