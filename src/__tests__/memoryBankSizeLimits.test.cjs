/**
 * Тесты лимитов размеров файлов Memory Bank — защита от разрастания памяти.
 * Если файл превышает лимит → тест падает → нужно разбить (как сделали с
 * common-mistakes.md в v0.87.56 и features.md в v0.87.57).
 *
 * Запуск: node src/__tests__/memoryBankSizeLimits.test.cjs
 *
 * Причины лимитов:
 * - Инструмент `Read` имеет предел 256 КБ — файл больше не читается целиком
 * - Файл > 100 КБ съедает огромную долю контекста, нужного для задачи
 * - Индекс common-mistakes.md должен оставаться быстрым для чтения
 */

var fs = require('fs')
var path = require('path')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

function fileSizeKb(filePath) {
  try { return Math.round(fs.statSync(filePath).size / 1024) }
  catch (e) { return -1 }
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(function (f) { return f.endsWith('.md') })
      .map(function (f) { return path.join(dir, f) })
  } catch (e) { return [] }
}

console.log('\n🧪 Лимиты размеров файлов Memory Bank\n')

// ── Корневые файлы .memory-bank/ (лимит 100 КБ, кроме common-mistakes.md и features.md) ──
console.log('── Корень .memory-bank/ (лимит 100 КБ): ──')

var ROOT_LIMIT_KB = 100
var INDEX_LIMIT_KB = 10

listFiles('.memory-bank').forEach(function (f) {
  var name = path.basename(f)
  var size = fileSizeKb(f)

  if (name === 'common-mistakes.md') {
    test(name + ' ≤ ' + INDEX_LIMIT_KB + ' КБ — индекс (сейчас ' + size + ' КБ)', function () {
      assert(size >= 0, 'файл не найден')
      assert(size <= INDEX_LIMIT_KB,
        size + ' КБ > ' + INDEX_LIMIT_KB + ' КБ — индекс должен быть компактным, сократи описания тем до одной строки')
    })
    return
  }

  test(name + ' ≤ ' + ROOT_LIMIT_KB + ' КБ (сейчас ' + size + ' КБ)', function () {
    assert(size >= 0, 'файл не найден')
    assert(size <= ROOT_LIMIT_KB,
      size + ' КБ > ' + ROOT_LIMIT_KB + ' КБ — РАЗБИТЬ на подпапку + индекс (пример: common-mistakes.md → mistakes/, features.md → archive/)')
  })
})

// ── Файлы в mistakes/ (лимит 200 КБ) ──
console.log('\n── .memory-bank/mistakes/ (лимит 200 КБ): ──')

var MISTAKES_LIMIT_KB = 200

listFiles('.memory-bank/mistakes').forEach(function (f) {
  var name = 'mistakes/' + path.basename(f)
  var size = fileSizeKb(f)

  test(name + ' ≤ ' + MISTAKES_LIMIT_KB + ' КБ (сейчас ' + size + ' КБ)', function () {
    assert(size >= 0, 'файл не найден')
    assert(size <= MISTAKES_LIMIT_KB,
      size + ' КБ > ' + MISTAKES_LIMIT_KB + ' КБ — РАЗБИТЬ по подтемам')
  })
})

// ── Архив не проверяем: он может быть большим, читается только по просьбе ──

// ── Конфликт: файлы в CLAUDE.md должны существовать ──
console.log('\n── Согласованность CLAUDE.md ↔ .memory-bank: ──')

test('все .memory-bank/* ссылки в CLAUDE.md указывают на существующие файлы', function () {
  var claude = fs.readFileSync('CLAUDE.md', 'utf8')
  var refs = claude.match(/\.memory-bank\/[a-zA-Z0-9./_-]+\.md/g) || []
  var unique = Array.from(new Set(refs))
  var missing = unique.filter(function (ref) {
    try { fs.accessSync(ref); return false } catch (e) { return true }
  })
  assert(missing.length === 0,
    'Отсутствуют файлы, упомянутые в CLAUDE.md: ' + missing.join(', '))
})

// ── Итог ──
console.log('\n' + (failed === 0
  ? '✅ Все проверки пройдены (' + passed + '/' + (passed + failed) + ')'
  : '❌ ' + failed + ' из ' + (passed + failed) + ' проверок упали'))

process.exit(failed === 0 ? 0 : 1)
