// shared/appIconMark.js — v1.2.443
//
// ЕДИНСТВЕННЫЙ рисовальщик знака приложения «ЦентрЧатов» (выбран вариант «Лазурь»:
// белый пузырь-реплика с хвостиком + три лазурные полосы слева, на тёмной плитке).
//
// ЗАЧЕМ отдельный файл: один и тот же рисунок нужен в ТРЁХ местах —
//   • значок в трее (main/utils/overlayIcon.js рисует его в память при запуске);
//   • файл иконки приложения (scripts/make-app-icon.cjs пишет build/icon.png и PNG/);
//   • экран загрузки (там своя разметка, но геометрия должна совпадать).
// Держим геометрию в одном месте, чтобы значки не разъехались между собой.
//
// ЗАЧЕМ свой рисовальщик, а не библиотека: в проекте уже есть похожий приём
// (main/utils/overlayIcon.js рисует бейдж в буфер вручную), новых зависимостей не добавляем.
// Сжатие берём из встроенного в Node zlib — тоже без установки чего-либо.
//
// Лежит в КОРНЕВОЙ shared/ (вне бюджета renderer, как shared/webAvatarGate.js в v1.2.441).

import zlib from 'node:zlib'

/** Цвета выбранного варианта «Лазурь». */
export const MARK = {
  bubble: [255, 255, 255],   // пузырь и хвостик — белый
  bars: [56, 189, 248],      // три полосы — лазурь #38BDF8
  tileTop: [30, 38, 48],     // плитка: верх (светлее)
  tileBottom: [11, 15, 20],  // плитка: низ (темнее) — мягкая растяжка
}

// ── Геометрия в клетке 64×64 (ровно та, что на плите 02; НЕ менять на глаз) ──
const BARS = [{ y: 18 }, { y: 32 }, { y: 46 }]
const BAR_X0 = 3, BAR_X1 = 17
const BUB = { x: 22, y: 10, w: 38, h: 34, r: 11 }
const TAIL = [[31, 44], [31, 57], [43, 44]]

/**
 * Толщина линий по размеру картинки. Чем мельче — тем толще линия, иначе контур
 * истончается до серой нитки. Проверено увеличением каждого пикселя: на 16 px при
 * толщине 7 пузырь превращался в пятно, при 9.5 — остаётся кольцом с дыркой.
 */
function weights(px) {
  if (px <= 24) return { bar: 9.5, ring: 9.5 }
  if (px <= 48) return { bar: 7.5, ring: 7 }
  return { bar: 5, ring: 4.5 }
}

/**
 * Отступ знака внутри плитки. На мелких размерах отступ съедает почти весь знак
 * (при 14% на 16 px знаку остаётся 11 px), поэтому там поля почти убираем.
 */
function defaultPad(px) {
  return px <= 32 ? 0.05 : 0.14
}

// ── Геометрические примитивы (расстояние до фигуры) ──────────────────────────

/** Расстояние от точки до отрезка — им рисуем полосы с круглыми концами. */
function distToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = x0 + t * dx, cy = y0 + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** Знаковое расстояние до прямоугольника со скруглением: <0 внутри, >0 снаружи. */
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2
  const qx = Math.abs(px - cx) - (w / 2 - r)
  const qy = Math.abs(py - cy) - (h / 2 - r)
  const ax = qx > 0 ? qx : 0, ay = qy > 0 ? qy : 0
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

/** Точка внутри треугольника (хвостик реплики). */
function inTriangle(px, py, t) {
  const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)
  const d1 = sign(px, py, t[0][0], t[0][1], t[1][0], t[1][1])
  const d2 = sign(px, py, t[1][0], t[1][1], t[2][0], t[2][1])
  const d3 = sign(px, py, t[2][0], t[2][1], t[0][0], t[0][1])
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/**
 * Рисует знак в буфер картинки.
 * Сглаживание — по 16 проб на пиксель (сетка 4×4): без этого края «лестницей».
 *
 * @param {Object} o
 * @param {number} o.size — сторона картинки в пикселях (16, 32, 256, 512 …)
 * @param {'rgba'|'bgra'} [o.order] — порядок цветов: png хочет rgba, Electron на Windows — bgra
 * @param {boolean} [o.tile] — рисовать тёмную плитку под знаком (по умолчанию да)
 * @param {number} [o.pad] — доля отступа знака внутри плитки (0.14 = 14%)
 * @returns {Buffer}
 */
export function drawMark(o) {
  const size = o.size
  const order = o.order || 'rgba'
  const tile = o.tile !== false
  const pad = typeof o.pad === 'number' ? o.pad : defaultPad(size)
  const w = weights(size)
  const buf = Buffer.alloc(size * size * 4)
  // Проб на пиксель для сглаживания. На мелких размерах нужно много (каждый пиксель
  // виден), на крупных хватает четырёх: пиксель там сам по себе крошечный, а время
  // рисования растёт как размер×размер×пробы (при 256 и 16 пробах — четверть секунды
  // на запуске приложения, что заметно).
  const SS = size <= 48 ? 4 : size <= 160 ? 3 : 2
  const SSN = SS * SS
  const tileR = 64 * 0.225              // скругление плитки ≈22.5% — как у иконок Windows 11
  // знак живёт в клетке 64×64; внутри плитки его уменьшаем и центрируем
  const scale = tile ? 1 - pad * 2 : 1
  const off = tile ? 64 * pad : 0

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let tA = 0, bubA = 0, barA = 0        // накопленное покрытие: плитка / пузырь / полосы
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // центр пробы → клетка 64×64 всей картинки
          const u = ((px + (sx + 0.5) / SS) / size) * 64
          const v = ((py + (sy + 0.5) / SS) / size) * 64
          if (tile && sdRoundRect(u, v, 0, 0, 64, 64, tileR) <= 0) tA++
          // координаты внутри клетки самого знака
          const mu = (u - off) / scale
          const mv = (v - off) / scale
          // пузырь: контур скруглённого прямоугольника + залитый хвостик
          if (Math.abs(sdRoundRect(mu, mv, BUB.x, BUB.y, BUB.w, BUB.h, BUB.r)) <= w.ring / 2
              || inTriangle(mu, mv, TAIL)) { bubA++; continue }
          // полосы
          for (let i = 0; i < BARS.length; i++) {
            if (distToSegment(mu, mv, BAR_X0, BARS[i].y, BAR_X1, BARS[i].y) <= w.bar / 2) { barA++; break }
          }
        }
      }
      const i = (py * size + px) * 4
      // фон плитки — растяжка сверху вниз
      const k = py / Math.max(1, size - 1)
      const bg = [0, 1, 2].map(c => Math.round(MARK.tileTop[c] + (MARK.tileBottom[c] - MARK.tileTop[c]) * k))
      // смешиваем: плитка → полосы → пузырь (пузырь сверху)
      let rgb = bg
      let alpha = tA / SSN
      if (barA > 0) { const t = barA / SSN; rgb = mix(rgb, MARK.bars, t); alpha = Math.max(alpha, t) }
      if (bubA > 0) { const t = bubA / SSN; rgb = mix(rgb, MARK.bubble, t); alpha = Math.max(alpha, t) }
      if (alpha <= 0) continue
      const [r, g, b] = rgb
      if (order === 'bgra') { buf[i] = b; buf[i + 1] = g; buf[i + 2] = r }
      else { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b }
      buf[i + 3] = Math.round(alpha * 255)
    }
  }
  return buf
}

function mix(a, b, t) {
  return [0, 1, 2].map(c => Math.round(a[c] + (b[c] - a[c]) * t))
}

// ── Кодирование PNG (без библиотек: только встроенное сжатие) ────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/**
 * Превращает буфер RGBA в готовый файл PNG.
 * Формат по спецификации PNG: подпись + IHDR (8 бит, цвет с прозрачностью) + IDAT + IEND.
 * @param {Buffer} rgba
 * @param {number} size
 * @returns {Buffer}
 */
export function encodePNG(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // фильтр строки: 0 = как есть
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8    // бит на канал
  ihdr[9] = 6    // цвет + прозрачность (RGBA)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Готовый файл PNG со знаком нужного размера — одной строкой. */
export function markPNG(size, opts) {
  return encodePNG(drawMark({ size, order: 'rgba', ...(opts || {}) }), size)
}

// ── Файл иконки Windows (.ico) ───────────────────────────────────────────────
//
// v1.2.444 — ЗАЧЕМ СОБИРАЕМ САМИ. Если отдать electron-builder один большой PNG, он
// сделает .ico УМЕНЬШЕНИЕМ этой картинки. Замер: при уменьшении 512→16 от знака остаётся
// 1 белый пиксель вместо 41 — в панели задач серое пятно. Поэтому кладём в .ico картинки,
// НАРИСОВАННЫЕ каждая под свой размер (у мелких линия толще, см. weights()).
//
// Готовый .ico electron-builder НЕ перекодирует: по его коду (app-builder-lib,
// util/iconConverter.js) — «If source already has the target extension … return it
// directly», проверяются только заголовок и что максимальный размер ≥ 256.
//
// Формат .ico (спецификация Microsoft ICO):
//   заголовок 6 байт: 0,0 | тип=1 | сколько картинок
//   затем по 16 байт на картинку: ширина, высота (0 = 256), 0, 0, слоёв=1, бит=32,
//                                 сколько байт данных, с какого места они лежат
//   затем сами картинки. С Windows Vista внутрь можно кладать PNG — им и пользуемся.

/** Размеры внутри файла иконки: от крупного к мелкому (256 обязателен для electron-builder). */
export const ICO_SIZES = [256, 128, 64, 48, 32, 16]

/**
 * Собирает файл иконки Windows со знаком, нарисованным отдельно под каждый размер.
 * @param {number[]} [sizes]
 * @returns {Buffer}
 */
export function buildICO(sizes) {
  const list = (sizes || ICO_SIZES).map(size => ({ size, png: markPNG(size) }))
  const dir = Buffer.alloc(6 + list.length * 16)
  dir.writeUInt16LE(0, 0)             // зарезервировано
  dir.writeUInt16LE(1, 2)             // тип: 1 = иконка
  dir.writeUInt16LE(list.length, 4)   // сколько картинок внутри
  let offset = dir.length
  list.forEach((img, i) => {
    const o = 6 + i * 16
    dir[o] = img.size >= 256 ? 0 : img.size       // 0 означает 256 — так велит формат
    dir[o + 1] = img.size >= 256 ? 0 : img.size
    dir[o + 2] = 0                                // цветов в палитре: 0 = палитры нет
    dir[o + 3] = 0                                // зарезервировано
    dir.writeUInt16LE(1, o + 4)                   // слоёв
    dir.writeUInt16LE(32, o + 6)                  // бит на точку (с прозрачностью)
    dir.writeUInt32LE(img.png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += img.png.length
  })
  return Buffer.concat([dir, ...list.map(i => i.png)])
}
