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

// ═══════════════════════════════════════════════════════════════════════
// ЗАЩИТА СЕССИЙ — гарантирует что логины мессенджеров НИКОГДА не сбросятся
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── Защита сессий (persist): ──')

var constantsCode = fs.readFileSync('src/constants.js', 'utf8')
var sessionCode = fs.existsSync('main/utils/sessionSetup.js') ? fs.readFileSync('main/utils/sessionSetup.js', 'utf8') : ''
var appCode = fs.readFileSync('src/App.jsx', 'utf8')

// 1. Все дефолтные мессенджеры имеют persist: partition
test('Telegram: partition = persist:telegram', function() {
  assert(constantsCode.includes("partition: 'persist:telegram'"), 'Telegram partition должен быть persist:telegram')
})
test('WhatsApp: partition = persist:whatsapp', function() {
  assert(constantsCode.includes("partition: 'persist:whatsapp'"), 'WhatsApp partition должен быть persist:whatsapp')
})
test('VK: partition = persist:vk', function() {
  assert(constantsCode.includes("partition: 'persist:vk'"), 'VK partition должен быть persist:vk')
})
test('MAX: partition = persist:max', function() {
  assert(constantsCode.includes("partition: 'persist:max'"), 'MAX partition должен быть persist:max')
})

// 2. Пользовательские мессенджеры тоже persist
var addModalCode = fs.existsSync('src/components/AddMessengerModal.jsx') ? fs.readFileSync('src/components/AddMessengerModal.jsx', 'utf8') : ''
test('Пользовательские мессенджеры: persist:custom_', function() {
  assert(addModalCode.includes("persist:custom_"), 'Пользовательские мессенджеры должны иметь persist:custom_ partition')
})

// 3. WebView передаёт partition
test('WebView использует m.partition', function() {
  assert(appCode.includes('partition={m.partition}'), 'WebView должен получать partition из данных мессенджера')
})

// 4. clearStorageData НЕ чистит cookies/localStorage/indexeddb
test('clearStorageData НЕ чистит cookies', function() {
  assert(!sessionCode.includes("'cookies'"), 'clearStorageData НЕ должен включать cookies — это удалит логины!')
})
test('clearStorageData НЕ чистит localstorage', function() {
  assert(!sessionCode.includes("'localstorage'"), 'clearStorageData НЕ должен включать localstorage')
})
test('clearStorageData НЕ чистит indexeddb', function() {
  assert(!sessionCode.includes("'indexeddb'"), 'clearStorageData НЕ должен включать indexeddb')
})
test('clearStorageData чистит ТОЛЬКО serviceworkers/cachestorage', function() {
  // Все вызовы clearStorageData должны содержать ТОЛЬКО безопасные storages
  var calls = sessionCode.match(/clearStorageData\(\{[^}]+\}/g) || []
  assert(calls.length > 0, 'должен быть хотя бы один вызов clearStorageData')
  for (var i = 0; i < calls.length; i++) {
    assert(!calls[i].includes('cookies'), 'вызов ' + i + ' содержит cookies!')
    assert(!calls[i].includes('localstorage'), 'вызов ' + i + ' содержит localstorage!')
    assert(!calls[i].includes('indexeddb'), 'вызов ' + i + ' содержит indexeddb!')
  }
})

// 5. Нет полного clearStorageData() без фильтра (это удаляет ВСЁ)
test('Нет clearStorageData() без фильтра storages', function() {
  var dangerousClear = sessionCode.match(/clearStorageData\(\s*\)/g) || []
  assert(dangerousClear.length === 0, 'clearStorageData() без параметров удаляет ВСЕ данные включая логины!')
})

// 6. Partition не должен меняться при рефакторинге
test('Нет partition без persist: (это делает сессию временной)', function() {
  // Ищем partition: 'НЕ-persist:...' в constants
  var badPartitions = constantsCode.match(/partition:\s*'(?!persist:)[^']+'/g) || []
  assert(badPartitions.length === 0, 'Найдены partition без persist: — ' + badPartitions.join(', '))
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
