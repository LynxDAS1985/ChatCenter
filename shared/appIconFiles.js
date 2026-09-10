/**
 * v1.2.449 — упаковка знака в ФАЙЛЫ: картинка PNG и файл иконки Windows (.ico).
 *
 * ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ: `shared/appIconMark.js` дорос до 311 строк при лимите 300.
 * Правило проекта запрещает резать комментарии — надо делить по смыслу, и линия разреза
 * была подсказана ещё в v1.2.444: «рисование знака и упаковка в файлы — разные темы».
 * Здесь ровно вторая тема; сам знак рисует `drawMark` из соседнего файла.
 *
 * Кто чем пользуется:
 *  • `drawMark` (сырые точки) — трей (`main/utils/overlayIcon.js`) и значок окна
 *    (`main/utils/windowManager.js`): им файлы не нужны, они кладут точки прямо в Electron;
 *  • `markPNG` / `buildICO` (файлы) — скрипт `scripts/make-app-icon.cjs`, который пишет
 *    `build/icon.ico`, `build/icon.png` и картинки в `PNG/`.
 */
// Сжатие берём из встроенного в Node zlib — без установки чего-либо.
import zlib from 'node:zlib'
import { drawMark } from './appIconMark.js'

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
