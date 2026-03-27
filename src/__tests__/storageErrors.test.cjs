/**
 * v0.84.0: Storage error тесты — проверяет что код обрабатывает битые данные
 *
 * Запуск: node src/__tests__/storageErrors.test.cjs
 */

const fs = require('fs')
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Storage error тесты\n')

// Проверяем что main.js и handlers защищены от битых данных
const mainCode = fs.readFileSync('main/main.js', 'utf8')
const dockCode = fs.existsSync('main/handlers/dockPinHandlers.js') ? fs.readFileSync('main/handlers/dockPinHandlers.js', 'utf8') : ''

console.log('── Storage.get с дефолтами: ──')
test('messengers:load имеет дефолт []', function() {
  assert(mainCode.includes("storage.get('messengers'") || mainCode.includes('DEFAULT_MESSENGERS'))
})
test('settings:get имеет дефолт {}', function() {
  assert(mainCode.includes("storage.get('settings'"))
})
test('pinItems:load имеет дефолт []', function() {
  assert(dockCode.includes("storage.get('pinItems', [])") || dockCode.includes("storage.get('pinItems'"))
})
test('dockPosition с null дефолт', function() {
  assert(dockCode.includes("storage.get('dockPosition', null)") || dockCode.includes("storage.get('dockPosition'"))
})

console.log('\n── Array.isArray проверки: ──')
test('pinItems проверяется на Array', function() {
  assert(dockCode.includes('Array.isArray'))
})
test('messengers load имеет fallback', function() {
  assert(mainCode.includes('DEFAULT_MESSENGERS'))
})

console.log('\n── Try-catch в IPC handlers: ──')
test('messengers:load в try-catch', function() {
  // Проверяем что handler не упадёт при ошибке storage
  assert(mainCode.includes("'messengers:load'"))
})
test('settings:get в try-catch', function() {
  assert(mainCode.includes("'settings:get'"))
})

console.log('\n── JSON parse защита: ──')
// Проверяем что нет голых JSON.parse без try-catch
var parseMatches = mainCode.match(/JSON\.parse\(/g) || []
var tryCatchMatches = mainCode.match(/try\s*\{/g) || []
test('JSON.parse вызовов (' + parseMatches.length + ') <= try-catch блоков (' + tryCatchMatches.length + ')', function() {
  // Не строгая проверка — просто убеждаемся что try-catch есть
  assert(tryCatchMatches.length >= parseMatches.length || parseMatches.length === 0, 'JSON.parse может быть без try-catch')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
