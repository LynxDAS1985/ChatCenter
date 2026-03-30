/**
 * Тесты лимитов размеров файлов — защита от бесконтрольного роста.
 * Если файл превышает лимит → тест падает → нужно разбить.
 *
 * Запуск: node src/__tests__/fileSizeLimits.test.js
 */

var fs = require('fs')
var path = require('path')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

function countLines(filePath) {
  try { return fs.readFileSync(filePath, 'utf8').split('\n').length }
  catch (e) { return -1 }
}

console.log('\\n🧪 Тесты лимитов размеров файлов\\n')

// ── Жёсткие лимиты для ключевых файлов ──
console.log('── Ключевые файлы: ──')

var keyFiles = [
  // v0.85.2: лимиты снижены после рефакторинга (все файлы ≤571)
  { path: 'src/App.jsx',                          limit: 600, name: 'App.jsx' },
  { path: 'main/main.js',                         limit: 600, name: 'main.js' },
  { path: 'main/preloads/monitor.preload.js',      limit: 600, name: 'monitor.preload.js' },
  { path: 'src/utils/webviewSetup.js',             limit: 600, name: 'webviewSetup.js' },
  { path: 'main/handlers/dockPinHandlers.js',      limit: 600, name: 'dockPinHandlers.js' },
]

keyFiles.forEach(function(f) {
  var lines = countLines(f.path)
  test(f.name + ' ≤ ' + f.limit + ' строк (сейчас ' + lines + ')', function() {
    assert(lines > 0, 'файл не найден')
    assert(lines <= f.limit, lines + ' > ' + f.limit + ' — РАЗБИТЬ!')
  })
})

// ── Лимит 700 строк для компонентов ──
console.log('\\n── Компоненты (лимит 700): ──')

var components = [
  'src/components/MessengerTab.jsx',
  'src/components/SettingsPanel.jsx',
  'src/components/TemplatesPanel.jsx',
  'src/components/AddMessengerModal.jsx',
  'src/components/AutoReplyPanel.jsx',
]

components.forEach(function(f) {
  var lines = countLines(f)
  var name = path.basename(f)
  test(name + ' ≤ 700 строк (сейчас ' + lines + ')', function() {
    assert(lines > 0, 'файл не найден')
    assert(lines <= 700, lines + ' > 700 — РАЗБИТЬ на подкомпоненты!')
  })
})

// Исключения (> 700, но разрешены)
console.log('\\n── Исключения (> 700, разрешены): ──')

var exceptions = [
  { path: 'src/components/AISidebar.jsx',     limit: 600, name: 'AISidebar.jsx' },
  { path: 'src/components/NotifLogModal.jsx',  limit: 600,  name: 'NotifLogModal.jsx' },
]

exceptions.forEach(function(f) {
  var lines = countLines(f.path)
  test(f.name + ' ≤ ' + f.limit + ' строк (сейчас ' + lines + ')', function() {
    assert(lines > 0, 'файл не найден')
    assert(lines <= f.limit, lines + ' > ' + f.limit + ' — РАЗБИТЬ!')
  })
})

// ── Лимит 300 строк для утилит ──
console.log('\\n── Утилиты (лимит 300): ──')

var utils = [
  'src/utils/sound.js',
  'src/utils/messageProcessing.js',
  'src/utils/navigateToChat.js',
  'src/utils/aiProviders.js',
  'src/utils/consoleMessageParser.js',
  'src/utils/devLog.js',
]

utils.forEach(function(f) {
  var lines = countLines(f)
  var name = path.basename(f)
  test(name + ' ≤ 300 строк (сейчас ' + lines + ')', function() {
    assert(lines > 0, 'файл не найден')
    assert(lines <= 300, lines + ' > 300 — РАЗБИТЬ!')
  })
})

// messengerConfigs — исключение (конфиги всех мессенджеров)
var mcLines = countLines('src/utils/messengerConfigs.js')
test('messengerConfigs.js ≤ 400 строк (сейчас ' + mcLines + ')', function() {
  assert(mcLines <= 400, mcLines + ' > 400')
})

// ── main/utils ──
console.log('\\n── main/utils: ──')
var overlayLines = countLines('main/utils/overlayIcon.js')
test('overlayIcon.js ≤ 200 строк (сейчас ' + overlayLines + ')', function() {
  assert(overlayLines <= 200)
})

// ── Тесты не должны быть огромными ──
console.log('\\n── Тесты (лимит 300): ──')
var testDir = 'src/__tests__'
var testFiles = fs.readdirSync(testDir).filter(function(f) { return f.endsWith('.test.js') })
var testLimits = { 'integration.test.js': 400 } // интеграционные тесты больше
testFiles.forEach(function(f) {
  var limit = testLimits[f] || 300
  var lines = countLines(path.join(testDir, f))
  test(f + ' ≤ ' + limit + ' строк (сейчас ' + lines + ')', function() {
    assert(lines <= limit, lines + ' > ' + limit)
  })
})

// ── Общая статистика ──
console.log('\\n── Статистика: ──')
var totalSrc = 0
;['src/App.jsx'].concat(
  fs.readdirSync('src/components').map(function(f) { return 'src/components/' + f }),
  fs.readdirSync('src/utils').map(function(f) { return 'src/utils/' + f })
).forEach(function(f) { totalSrc += countLines(f) })
test('Общий renderer код < 8000 строк (сейчас ' + totalSrc + ')', function() {
  assert(totalSrc < 8000, totalSrc + ' > 8000')
})

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
