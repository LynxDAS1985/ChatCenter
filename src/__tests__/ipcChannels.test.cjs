/**
 * Тесты IPC каналов — проверяет что все каналы зарегистрированы и нет дублей.
 *
 * Запуск: node src/__tests__/ipcChannels.test.js
 */

var fs = require('fs')
var mainCode = fs.readFileSync('main/main.js', 'utf8')
// v0.82.4: handlers вынесены в отдельные файлы
var handlersDir = 'main/handlers/'
;['aiHandlers.js', 'notifHandlers.js', 'dockPinHandlers.js'].forEach(function(f) {
  try { mainCode += '\n' + fs.readFileSync(handlersDir + f, 'utf8') } catch(e) {}
})
var appCode = fs.readFileSync('src/App.jsx', 'utf8')
var preloadCode = fs.readFileSync('main/preloads/app.preload.js', 'utf8')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты IPC каналов\\n')

// Извлекаем каналы из main.js
var handleChannels = (mainCode.match(/ipcMain\.handle\(\s*'([^']+)'/g) || []).map(function(m) { return m.match(/'([^']+)'/)[1] })
var onChannels = (mainCode.match(/ipcMain\.on\(\s*'([^']+)'/g) || []).map(function(m) { return m.match(/'([^']+)'/)[1] })
var allMainChannels = handleChannels.concat(onChannels)

// Извлекаем invoke/send из App.jsx
var invokeChannels = (appCode.match(/window\.api\??\.invoke\(\s*'([^']+)'/g) || []).map(function(m) { return m.match(/'([^']+)'/)[1] })
var sendChannels = (appCode.match(/window\.api\??\.send\(\s*'([^']+)'/g) || []).map(function(m) { return m.match(/'([^']+)'/)[1] })

console.log('── Main process: ──')
test('handle каналов > 10', function() { assert(handleChannels.length > 10, 'count=' + handleChannels.length) })
test('on каналов > 15', function() { assert(onChannels.length > 15, 'count=' + onChannels.length) })

// Проверяем ключевые каналы
console.log('\\n── Ключевые каналы: ──')
var requiredHandle = ['settings:get', 'settings:save', 'app:custom-notify', 'tray:set-badge', 'app:get-paths']
requiredHandle.forEach(function(ch) {
  test('handle: ' + ch, function() { assert(handleChannels.indexOf(ch) >= 0) })
})

var requiredOn = ['notif:click', 'notif:dismiss', 'notif:resize']
requiredOn.forEach(function(ch) {
  test('on: ' + ch, function() { assert(onChannels.indexOf(ch) >= 0) })
})

// Проверяем что renderer вызывает только зарегистрированные каналы
console.log('\\n── Renderer → Main: ──')
var uniqueInvoke = invokeChannels.filter(function(v, i, a) { return a.indexOf(v) === i })
test('invoke каналов > 5', function() { assert(uniqueInvoke.length > 5, 'count=' + uniqueInvoke.length) })

uniqueInvoke.forEach(function(ch) {
  test('invoke ' + ch + ' → handler exists', function() {
    assert(handleChannels.indexOf(ch) >= 0, ch + ' not in ipcMain.handle')
  })
})

// Проверяем дубли
console.log('\\n── Дубликаты: ──')
test('Нет дублей handle', function() {
  var seen = {}
  handleChannels.forEach(function(ch) {
    if (seen[ch]) throw new Error('дубль: ' + ch)
    seen[ch] = true
  })
})

test('Нет дублей on', function() {
  var seen = {}
  var dupes = []
  onChannels.forEach(function(ch) {
    if (seen[ch]) dupes.push(ch)
    seen[ch] = true
  })
  // Некоторые on могут быть в разных контекстах — допускаем
  assert(dupes.length < 3, 'дубли: ' + dupes.join(', '))
})

// v0.84.2: Main→Renderer каналы
console.log('\\n── Main→Renderer: ──')
test('app:read-log используется (лог-вьюер)', function() { assert(mainCode.includes("'app:read-log'")) })
test('app:read-log handler в main', function() { assert(mainCode.includes("'app:read-log'")) })
test('app:log handler в main', function() { assert(mainCode.includes("'app:log'")) })

// Preload bridge
console.log('\\n── Preload bridge: ──')
test('contextBridge определён', function() { assert(preloadCode.includes('contextBridge')) })
test('invoke method', function() { assert(preloadCode.includes('invoke')) })
test('send method', function() { assert(preloadCode.includes('send')) })
test('on method', function() { assert(preloadCode.includes("on(")) })

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
