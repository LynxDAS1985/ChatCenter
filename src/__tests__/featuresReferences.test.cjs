/**
 * Тест «Dangling references в features.md».
 *
 * Проверяет что все markdown-ссылки вида [text](path) в ПОСЛЕДНИХ 10 версиях
 * features.md указывают на существующие файлы в проекте.
 *
 * Почему только 10 последних:
 * - Старые версии (v0.80, v0.70 и т.п.) могут ссылаться на функции и файлы,
 *   которые давно удалены или переименованы — это нормально, такова история.
 * - Последние 10 версий — это активная часть, она должна быть точной.
 *
 * Запуск: node src/__tests__/featuresReferences.test.cjs
 */

var fs = require('fs')
var path = require('path')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Dangling references в features.md\n')

var FEATURES_MD = '.memory-bank/features.md'
var WINDOW_VERSIONS = 10 // проверяем только последние N записей

test('features.md существует и читается', function () {
  assert(fs.existsSync(FEATURES_MD), FEATURES_MD + ' не найден')
})

var raw = fs.readFileSync(FEATURES_MD, 'utf8')
var lines = raw.split('\n')

// Найти позиции последних N версий
var versionLineNums = []
for (var i = 0; i < lines.length; i++) {
  if (/^###\s+v?\d+\.\d+\.\d+/.test(lines[i])) {
    versionLineNums.push(i)
  }
}

var windowStart = 0
var windowEnd = lines.length

if (versionLineNums.length > WINDOW_VERSIONS) {
  windowStart = versionLineNums[0]
  windowEnd = versionLineNums[WINDOW_VERSIONS]
} else if (versionLineNums.length > 0) {
  windowStart = versionLineNums[0]
}

var windowText = lines.slice(windowStart, windowEnd).join('\n')

// Собираем ссылки: [text](path) где path начинается с src/, main/, scripts/, e2e/, shared/, out/
var refPattern = /\[[^\]]+\]\(((?:src|main|scripts|e2e|shared)\/[a-zA-Z0-9._/-]+\.(?:js|jsx|cjs|ts|tsx|css|md|json))\)/g

var found = {}
var m
while ((m = refPattern.exec(windowText)) !== null) {
  var ref = m[1]
  // Обрезаем возможный якорь типа #L42
  ref = ref.replace(/#.*$/, '')
  if (!found[ref]) {
    found[ref] = 0
  }
  found[ref]++
}

var unique = Object.keys(found).sort()
console.log('\n── Ссылок в последних ' + WINDOW_VERSIONS + ' версиях: ' + unique.length + ' уникальных ──')

var broken = []
unique.forEach(function (ref) {
  var exists = fs.existsSync(ref)
  if (!exists) {
    broken.push(ref)
  }
})

test('все ссылки в последних ' + WINDOW_VERSIONS + ' версиях features.md — валидные', function () {
  if (broken.length > 0) {
    console.log('')
    broken.forEach(function (b) {
      console.log('    ❌ ' + b + ' — упомянут в features.md, но файла нет (x' + found[b] + ')')
    })
    throw new Error(broken.length + ' битых ссылок — файлы удалены или переименованы, обнови features.md')
  }
})

console.log('\n' + (failed === 0
  ? '✅ Все проверки пройдены (' + passed + '/' + (passed + failed) + '), проверено ' + unique.length + ' ссылок'
  : '❌ ' + failed + ' из ' + (passed + failed) + ' проверок упали'))

process.exit(failed === 0 ? 0 : 1)
