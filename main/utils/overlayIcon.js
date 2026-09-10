/**
 * Иконки overlay и трея — пиксельные шрифты и рендер в BGRA buffer.
 * Используется для overlay badge на иконке в панели задач Windows
 * и иконки трея (system tray).
 */
import { nativeImage } from 'electron'
import { drawMark } from '../../shared/appIconMark.js' // v1.2.443: единый знак приложения (трей + файлы иконки)

// ── Пиксельный шрифт 3×5 (для трея) ────────────────────────────────────
const PIXEL_FONT = {
  '0': [0b111,0b101,0b101,0b101,0b111],
  '1': [0b010,0b110,0b010,0b010,0b111],
  '2': [0b111,0b001,0b111,0b100,0b111],
  '3': [0b111,0b001,0b011,0b001,0b111],
  '4': [0b101,0b101,0b111,0b001,0b001],
  '5': [0b111,0b100,0b111,0b001,0b111],
  '6': [0b111,0b100,0b111,0b101,0b111],
  '7': [0b111,0b001,0b011,0b010,0b010],
  '8': [0b111,0b101,0b111,0b101,0b111],
  '9': [0b111,0b101,0b111,0b001,0b111],
  '+': [0b000,0b010,0b111,0b010,0b000],
}

// ── Overlay шрифт 5×7 (для overlay badge) ───────────────────────────────
const OVERLAY_FONT = {
  '0': [0b01110,0b10001,0b10011,0b10101,0b11001,0b10001,0b01110],
  '1': [0b00100,0b01100,0b00100,0b00100,0b00100,0b00100,0b01110],
  '2': [0b01110,0b10001,0b00001,0b00110,0b01000,0b10000,0b11111],
  '3': [0b01110,0b10001,0b00001,0b00110,0b00001,0b10001,0b01110],
  '4': [0b00010,0b00110,0b01010,0b10010,0b11111,0b00010,0b00010],
  '5': [0b11111,0b10000,0b11110,0b00001,0b00001,0b10001,0b01110],
  '6': [0b01110,0b10000,0b10000,0b11110,0b10001,0b10001,0b01110],
  '7': [0b11111,0b00001,0b00010,0b00100,0b01000,0b01000,0b01000],
  '8': [0b01110,0b10001,0b10001,0b01110,0b10001,0b10001,0b01110],
  '9': [0b01110,0b10001,0b10001,0b01111,0b00001,0b00001,0b01110],
  '+': [0b00000,0b00100,0b00100,0b11111,0b00100,0b00100,0b00000],
}

// ── Утилиты рендера ─────────────────────────────────────────────────────

function setPixelBGRA(buf, bufSize, x, y, R, G, B) {
  if (x < 0 || x >= bufSize || y < 0 || y >= bufSize) return
  const i = (y * bufSize + x) * 4
  buf[i] = B; buf[i+1] = G; buf[i+2] = R; buf[i+3] = 255
}

function drawPixelText(buf, bufSize, text, cx, cy, R, G, B) {
  const charW = 3, gap = 1
  const totalW = text.length * charW + (text.length - 1) * gap
  let x = Math.round(cx - totalW / 2)
  const y = Math.round(cy) - 2
  for (const ch of text) {
    const rows = PIXEL_FONT[ch]
    if (rows) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (rows[row] & (0b100 >> col)) setPixelBGRA(buf, bufSize, x + col, y + row, R, G, B)
        }
      }
    }
    x += charW + gap
  }
}

// ── Иконка трея 32×32 — НАСТОЯЩИЙ знак приложения ──────────────────────
// v1.2.443: до этого в трее был просто синий круг (никак не связанный с приложением,
// да ещё и телеграмного цвета). Теперь рисуем выбранный знак «Лазурь» — белая реплика
// с хвостиком + три лазурные полосы на тёмной плитке. Рисунок берётся из ЕДИНОГО
// источника shared/appIconMark.js — тот же, из которого делаются файлы иконки
// (build/icon.png, PNG/chatcenter-icon.png), поэтому трей и панель задач совпадают.
// Порядок цветов bgra: именно его ждёт nativeImage.createFromBuffer на Windows
// (так же работает соседний createOverlayIcon через setPixelBGRA).

function createTrayBadgeIcon() {
  const size = 32
  const t0 = Date.now()
  let buf
  try {
    // v1.2.449: фон прозрачный (по умолчанию так теперь у всего знака) + знак крупнее на 20%
    // — в системном лотке рядом с часами он выглядел мелким. У иконки приложения свой
    // множитель (30%), поэтому здесь задаём явно.
    buf = drawMark({ size, order: 'bgra', zoom: 1.2 })
  } catch (e) {
    // v1.2.444: значок — украшение, из-за него приложение НЕ должно падать при запуске.
    // Запасной кадр — прозрачный, но правильного размера: nativeImage его принимает,
    // трей просто окажется без картинки, а причина останется в журнале.
    console.warn(`[tray] знак нарисовать не удалось: ${(e && e.message) || e} — значок будет пустым`)
    buf = Buffer.alloc(size * size * 4)
  }
  console.log(`[tray] значок трея готов: ${size}px за ${Date.now() - t0}мс`)
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

// ── Overlay badge 32×32 — белые цифры на чёрном круге ───────────────────

function createOverlayIcon(count) {
  const size = 32
  const buf = Buffer.alloc(size * size * 4)
  if (count > 99) count = 99

  const cx = 15.5, cy = 15.5, r = 14, rOuter = 15.5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (dist <= r) setPixelBGRA(buf, size, x, y, 20, 20, 20)
      else if (dist <= rOuter) setPixelBGRA(buf, size, x, y, 60, 60, 60)
    }
  }

  const text = String(count)
  const charW = 5, charH = 7, gap = 1
  const scale = text.length === 1 ? 3 : 2
  const totalW = (text.length * charW + (text.length - 1) * gap) * scale
  const x0 = Math.round((size - totalW) / 2)
  const y0 = Math.round((size - charH * scale) / 2)

  let px = x0
  for (const ch of text) {
    const rows = OVERLAY_FONT[ch]
    if (!rows) { px += (charW + gap) * scale; continue }
    for (let row = 0; row < charH; row++) {
      for (let col = 0; col < charW; col++) {
        if (rows[row] & (0b10000 >> col)) {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              setPixelBGRA(buf, size, px + col * scale + dx, y0 + row * scale + dy, 255, 255, 255)
            }
          }
        }
      }
    }
    px += (charW + gap) * scale
  }

  console.log(`[OVERLAY] createOverlayIcon(${count}) scale=${scale}`)
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

export { createTrayBadgeIcon, createOverlayIcon, setPixelBGRA, drawPixelText }
