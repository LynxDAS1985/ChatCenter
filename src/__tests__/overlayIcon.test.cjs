/**
 * Тесты overlayIcon.js — шрифты и утилиты рендера.
 * Проверяет что шрифты определены и setPixelBGRA корректен.
 *
 * Запуск: node src/__tests__/overlayIcon.test.js
 */

const fs = require('fs')
const code = fs.readFileSync('main/utils/overlayIcon.js', 'utf8')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты overlayIcon.js\\n')

// ── Структура ──
console.log('── Структура модуля: ──')
test('Экспортирует createTrayBadgeIcon', () => assert(code.includes('export { createTrayBadgeIcon')))
test('Экспортирует createOverlayIcon', () => assert(code.includes('createOverlayIcon')))
test('Экспортирует setPixelBGRA', () => assert(code.includes('setPixelBGRA')))
test('Импортирует nativeImage', () => assert(code.includes("import { nativeImage } from 'electron'")))

// ── PIXEL_FONT 3×5 ──
console.log('\\n── PIXEL_FONT 3×5: ──')
const digits = ['0','1','2','3','4','5','6','7','8','9','+']
for (const d of digits) {
  test(`Цифра '${d}' определена`, () => assert(code.includes(`'${d}':`)))
}

// ── OVERLAY_FONT 5×7 ──
console.log('\\n── OVERLAY_FONT 5×7: ──')
for (const d of digits) {
  test(`Overlay цифра '${d}' определена`, () => {
    // OVERLAY_FONT has 7-element arrays (5x7 font)
    const pattern = `'${d}':`
    const idx = code.lastIndexOf(pattern)
    assert(idx > code.indexOf('OVERLAY_FONT'), `'${d}' in OVERLAY_FONT`)
  })
}

// ── setPixelBGRA ──
console.log('\\n── setPixelBGRA: ──')
test('Проверяет границы (x < 0)', () => assert(code.includes('x < 0 || x >= bufSize')))
test('Записывает BGRA (B,G,R,A=255)', () => assert(code.includes('buf[i] = B; buf[i+1] = G; buf[i+2] = R; buf[i+3] = 255')))

// ── createTrayBadgeIcon ──
console.log('\\n── createTrayBadgeIcon: ──')
test('Размер 32×32', () => assert(code.includes('const size = 32') && code.includes('createTrayBadgeIcon')))
test('Синий цвет (#2AABEE)', () => assert(code.includes('42, 171, 238')))

// ── createOverlayIcon ──
console.log('\\n── createOverlayIcon: ──')
test('Ограничение 99', () => assert(code.includes('count > 99') && code.includes('count = 99')))
test('Чёрный фон круг', () => assert(code.includes('20, 20, 20')))
test('Серая обводка', () => assert(code.includes('60, 60, 60')))
test('Белые цифры', () => assert(code.includes('255, 255, 255')))
test('Scale=3 для 1 цифры', () => assert(code.includes("text.length === 1 ? 3 : 2")))

// ── Безопасность ──
console.log('\\n── Безопасность: ──')
test('Нет eval', () => assert(!code.includes('eval(')))
test('Нет require (ESM)', () => assert(!code.includes("require('")))

console.log(`\\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
