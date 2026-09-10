// sharedWiring.test.cjs — v1.2.447
//
// 🔴 ЗАЧЕМ ЭТОТ СТРАЖ (реальный случай, а не предположение)
// В v1.2.446 выяснилось: файл `shared/browserBannerHider.js` лежал на диске, все 16 его
// проверок были ЗЕЛЁНЫМИ, а приложение его больше НЕ ЗВАЛО — вызов пропал вместе с
// откаченными правками. Опасное поведение, от которого этот файл защищал (чёрный экран
// веб-МАКС), ожило, и НИ ОДИН тест этого не заметил: все смотрели ВНУТРЬ модуля.
//
// Правило, которое тут закрепляется: вынесенный в отдельный файл модуль обязан иметь
// живой вызов из кода приложения. Признак потерянной проводки — на модуль ссылаются
// только тесты и комментарии.
//
// КАК ПРОВЕРЯЕТСЯ: для каждого файла `shared/*.js` ищем в `src/`, `main/` и в самом
// `shared/` строку импорта, которая им заканчивается (`from '...<имя>.js'`).
// Тесты (`__tests__`, `*.vitest.*`, `*.test.*`) при поиске НЕ считаются — иначе страж
// признал бы «подключённым» модуль, который зовёт только тест.
'use strict'
var fs = require('fs')
var path = require('path')
var assert = require('assert')

var ROOT = path.resolve(__dirname, '..', '..')
var SCAN_DIRS = ['src', 'main', 'shared']
var CODE_EXT = ['.js', '.jsx', '.cjs', '.mjs']

// Файлы, которым живой вызов НЕ нужен, с причиной. Пустой список — норма;
// каждая запись должна объяснять, почему модуль лежит без вызова.
var ALLOWED_WITHOUT_CALLER = {
  // сюда добавлять только с причиной, например: 'shared/foo.js': 'зовётся из html-окна строкой'
}

function isTestFile(rel) {
  return rel.indexOf('__tests__') !== -1 ||
    /\.vitest\.[a-z]+$/.test(rel) ||
    /\.test\.[a-z]+$/.test(rel)
}

function walk(dir, out) {
  var entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return out }
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i]
    var full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue
      walk(full, out)
      continue
    }
    if (CODE_EXT.indexOf(path.extname(e.name)) === -1) continue
    var rel = path.relative(ROOT, full).split(path.sep).join('/')
    if (isTestFile(rel)) continue
    out.push({ rel: rel, text: fs.readFileSync(full, 'utf8') })
  }
  return out
}

var tests = []
var failures = 0
function test(name, fn) {
  tests.push(name)
  try { fn(); console.log('  ✅ ' + name) } catch (e) { failures++; console.log('  ❌ ' + name + '\n     ' + e.message) }
}

console.log('\n── Проводка вынесенных модулей (shared/*.js): ──')

// Все файлы кода проекта, КРОМЕ тестов — только они считаются «живым вызовом».
var codeFiles = walk(path.join(ROOT, 'src'), [])
walk(path.join(ROOT, 'main'), codeFiles)
walk(path.join(ROOT, 'shared'), codeFiles)

var sharedFiles = fs.readdirSync(path.join(ROOT, 'shared'))
  .filter(function (n) { return /\.js$/.test(n) && !/\.vitest\.js$/.test(n) && !/\.test\.js$/.test(n) })

assert(sharedFiles.length > 5, 'ожидали найти модули в shared/, найдено ' + sharedFiles.length)

sharedFiles.forEach(function (name) {
  var rel = 'shared/' + name
  test(rel + ' — есть живой вызов из приложения', function () {
    if (ALLOWED_WITHOUT_CALLER[rel]) return
    // Ищем именно импорт/require, а не упоминание в комментарии.
    var needle = new RegExp("(from|require\\()\\s*['\"][^'\"]*" + name.replace('.', '\\.') + "['\"]")
    var callers = codeFiles.filter(function (f) {
      return f.rel !== rel && needle.test(f.text)
    }).map(function (f) { return f.rel })
    assert(callers.length > 0,
      'НИКТО не зовёт ' + rel + ' (ссылки только в тестах/комментариях = потерянная проводка).\n' +
      '     Либо подключи модуль обратно, либо, если он больше не нужен, удали файл,\n' +
      '     либо добавь запись с причиной в ALLOWED_WITHOUT_CALLER этого теста.')
  })
})

console.log('\n── Точечные проверки опасных мест: ──')

var setup = fs.readFileSync(path.join(ROOT, 'src/utils/webviewSetup.js'), 'utf8')

test('🔴 плашки прячет ТОЛЬКО сторож с предохранителями (не старое широкое условие)', function () {
  assert(/webviewPageFixups\.js/.test(setup), 'webviewSetup.js должен подключать shared/webviewPageFixups.js')
  assert(/applyPageFixups\(/.test(setup), 'webviewSetup.js должен ЗВАТЬ applyPageFixups')
  assert(setup.indexOf('children.length < 20') === -1, 'вернулось старое опасное условие «меньше 20 детей»')
  assert(setup.indexOf('hideBrowserBanners') === -1, 'вернулся старый встроенный прятальщик')
})

var fixups = fs.readFileSync(path.join(ROOT, 'shared/webviewPageFixups.js'), 'utf8')

test('доводки страницы зовут безопасный прятальщик и не молчат при сбое', function () {
  assert(/browserBannerHider\.js/.test(fixups), 'webviewPageFixups должен брать скрипт из browserBannerHider')
  assert(/buildBannerHiderScript\(\)/.test(fixups), 'скрипт должен собираться через buildBannerHiderScript()')
  assert(/banner-hider\] впрыск НЕ прошёл/.test(fixups), 'сбой впрыска обязан попадать в журнал')
  assert(/NotifHook\] запасной впрыск НЕ прошёл/.test(fixups), 'сбой запасного впрыска обязан попадать в журнал')
})

test('в renderer нет console.* — записи только через журнал приложения', function () {
  assert(!/console\.(log|warn|error)\s*\(/.test(fixups), 'в shared/webviewPageFixups.js не должно быть console.*')
  assert(!/console\.(log|warn|error)\s*\(/.test(setup), 'в src/utils/webviewSetup.js не должно быть console.*')
})

console.log('\n📊 Результат: ' + (tests.length - failures) + ' ✅ / ' + failures + ' ❌ из ' + tests.length)
if (failures > 0) process.exit(1)
