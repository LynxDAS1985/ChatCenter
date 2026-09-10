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

// v1.2.435: ссылки собираем ВМЕСТЕ с ведущими «../» и проверяем путь ОТ ПАПКИ features.md.
// ПОЧЕМУ: по официальной доке GitHub («The path of the link will be relative to the current
// file») относительная ссылка считается от папки САМОГО ФАЙЛА, а не от корня репозитория.
// Прежний образец брал только пути от корня (src/…) и проверял их от корня → 30 ссылок вида
// ../../src/… страж НЕ ВИДЕЛ вовсе и рапортовал «0 уникальных», хотя все они были битые
// (../../ из .memory-bank/ уходит ВЫШЕ репозитория). Теперь неверная глубина ловится:
// путь склеивается с .memory-bank/ ровно так, как его разрешит просмотрщик markdown.
var MD_DIR = path.dirname(FEATURES_MD)
var refPattern = /\[[^\]]+\]\(((?:\.\.\/)*(?:src|main|scripts|e2e|shared)\/[a-zA-Z0-9._/-]+\.(?:js|jsx|cjs|ts|tsx|css|md|json)(?:#[A-Za-z0-9-]+)?)\)/g

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
  // v1.2.435: путь разрешаем ОТ ПАПКИ features.md (.memory-bank/), как это делает markdown
  var exists = fs.existsSync(path.join(MD_DIR, ref))
  if (!exists) {
    broken.push(ref)
  }
})

test('все ссылки в последних ' + WINDOW_VERSIONS + ' версиях features.md — валидные', function () {
  if (broken.length > 0) {
    console.log('')
    broken.forEach(function (b) {
      console.log('    ❌ ' + b + ' — упомянут в features.md, но файла нет (x' + found[b] + '); проверен путь: ' + path.join(MD_DIR, b))
    })
    throw new Error(broken.length + ' битых ссылок — файлы удалены или переименованы, обнови features.md')
  }
})

// v1.2.435 ТЕСТ-ЛОВУШКА: страж ОБЯЗАН видеть ссылки с «../» и ловить неверную глубину.
// Ловит регресс: если образец снова сузят до путей от корня, битые ссылки станут
// невидимыми и страж будет рапортовать «0 уникальных» (ровно так и было до v1.2.435).
test('ловушка: ссылка ../../src/… (выше репозитория) распознаётся и считается битой', function () {
  var wrong = '../../src/utils/webviewSetup.js'
  var right = '../src/utils/webviewSetup.js'
  var mw = new RegExp(refPattern.source).exec('[текст](' + wrong + ')')
  assert(mw && mw[1] === wrong, 'образец НЕ поймал ссылку с ../../ — страж снова слепой')
  assert(!fs.existsSync(path.join(MD_DIR, wrong)), '../../src/… не должен существовать от .memory-bank/')
  var mr = new RegExp(refPattern.source).exec('[текст](' + right + ')')
  assert(mr && mr[1] === right, 'образец не поймал правильную ссылку ../src/…')
  assert(fs.existsSync(path.join(MD_DIR, right)), '../src/… должен существовать от .memory-bank/')
})

console.log('\n' + (failed === 0
  ? '✅ Все проверки пройдены (' + passed + '/' + (passed + failed) + '), проверено ' + unique.length + ' ссылок'
  : '❌ ' + failed + ' из ' + (passed + failed) + ' проверок упали'))

process.exit(failed === 0 ? 0 : 1)
