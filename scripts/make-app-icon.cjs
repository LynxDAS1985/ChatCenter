#!/usr/bin/env node
// scripts/make-app-icon.cjs — v1.2.443
//
// Делает файлы иконки приложения из ЕДИНОГО рисунка (shared/appIconMark.js).
// Запуск: node scripts/make-app-icon.cjs
//
// ЧТО ПИШЕТ:
//   build/icon.ico            ГЛАВНЫЙ файл — его берёт установщик (build.win.icon). Внутри
//                             6 картинок (256/128/64/48/32/16), каждая НАРИСОВАНА под свой
//                             размер. Так надо, потому что при простом уменьшении большой
//                             картинки до 16 точек знак превращается в серое пятно (замер:
//                             1 белый пиксель вместо 41). electron-builder готовый .ico не
//                             перекодирует — только проверяет заголовок и размер ≥256.
//   build/icon.png            512×512 — предпросмотр и запас для других мест (Linux/Mac,
//                             картинка для страницы приложения).
//   PNG/chatcenter-icon.png   256×256 — папка, где лежат иконки других приложений
//                             (max-icon.png, VK-icon.png, whatsapp-icon.png, Ozon.png, T1.png).
//   PNG/chatcenter-icon-32.png, -16.png — те же мелкие размеры отдельными файлами: пригодятся
//                             для ярлыков и документов, где нужен готовый мелкий значок.
//
// Скрипт ничего не удаляет и ничего не собирает — только перезаписывает свои файлы.
// Значок в трее файлы НЕ использует: он рисуется в память при запуске приложения
// (main/utils/overlayIcon.js) — тем же рисовальщиком, поэтому вид совпадает.

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

const TARGETS = [
  { file: 'build/icon.png', size: 512 },
  { file: 'PNG/chatcenter-icon.png', size: 256 },
  { file: 'PNG/chatcenter-icon-32.png', size: 32 },
  { file: 'PNG/chatcenter-icon-16.png', size: 16 },
]

async function main() {
  // shared/appIconMark.js — современный модуль (ESM), этот скрипт — старого формата (CJS),
  // поэтому подключаем через динамический import: так один рисунок используют оба формата.
  const mark = await import('../shared/appIconMark.js')

  // Главный файл — .ico со ВСЕМИ размерами внутри (каждый нарисован отдельно).
  const icoPath = path.join(root, 'build/icon.ico')
  fs.mkdirSync(path.dirname(icoPath), { recursive: true })
  const ico = mark.buildICO()
  fs.writeFileSync(icoPath, ico)
  console.log(`[app-icon] ${'build/icon.ico'.padEnd(28)} ${mark.ICO_SIZES.join('/')}  ${String(ico.length).padStart(6)} байт`)

  for (const t of TARGETS) {
    const out = path.join(root, t.file)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const png = mark.markPNG(t.size)
    fs.writeFileSync(out, png)
    console.log(`[app-icon] ${t.file.padEnd(28)} ${String(t.size).padStart(3)}×${t.size}  ${String(png.length).padStart(6)} байт`)
  }

  console.log('[app-icon] готово. Дальше: npm run dist:win — установщик возьмёт build/icon.ico как есть')
}

main().catch((e) => {
  console.error('[app-icon] ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
