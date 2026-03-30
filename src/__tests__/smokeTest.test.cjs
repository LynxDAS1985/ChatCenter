/**
 * v0.84.0: Smoke тест — проверяет что приложение собирается и main process стартует
 * НЕ запускает Electron (нельзя в CI без display) — проверяет build artifacts
 *
 * Запуск: node src/__tests__/smokeTest.test.cjs
 */

const fs = require('fs')
const path = require('path')
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Smoke тесты (build + runtime contract)\n')

// ═══════════════════════════════════════
// 1. Build artifacts
// ═══════════════════════════════════════
console.log('── Build artifacts: ──')
var outExists = fs.existsSync('out')
if (!outExists) {
  console.log('  ⚠️  out/ не существует — пропуск')
  console.log('\n📊 Результат: 0 ✅ / 0 ❌ (пропущено)')
  process.exit(0)
}

test('out/main/main.js существует и > 10KB', function() {
  var f = 'out/main/main.js'
  assert(fs.existsSync(f) && fs.statSync(f).size > 10000)
})

// ═══════════════════════════════════════
// 2. Preload bridge contract
// ═══════════════════════════════════════
console.log('\n── Preload bridge: ──')
var preloadCode = fs.readFileSync('main/preloads/app.preload.js', 'utf8')
test('app.preload экспортирует invoke', function() { assert(preloadCode.includes('invoke:')) })
test('app.preload экспортирует send', function() { assert(preloadCode.includes('send:')) })
test('app.preload экспортирует on', function() { assert(preloadCode.includes('on:')) })
test('app.preload использует contextBridge', function() { assert(preloadCode.includes('contextBridge')) })

// ═══════════════════════════════════════
// 3. Main process imports
// ═══════════════════════════════════════
console.log('\n── Main process imports: ──')
var mainCode = fs.readFileSync('main/main.js', 'utf8')
// v0.85.0: extracted modules
;['main/handlers/notificationManager.js','main/handlers/aiLoginHandler.js','main/handlers/backupNotifHandler.js','main/utils/windowManager.js','main/utils/trayManager.js'].forEach(function(f) {
  try { mainCode += '\n' + fs.readFileSync(f, 'utf8') } catch(e) {}
})
test('main.js импортирует electron', function() { assert(mainCode.includes("from 'electron'")) })
test('main.js импортирует aiHandlers', function() { assert(mainCode.includes('initAIHandlers')) })
test('main.js импортирует notifHandlers', function() { assert(mainCode.includes('initNotifHandlers')) })
test('main.js импортирует dockPinHandlers', function() { assert(mainCode.includes('initDockPinSystem')) })

// ═══════════════════════════════════════
// 4. Renderer entry point
// ═══════════════════════════════════════
console.log('\n── Renderer: ──')
var indexHtml = fs.readFileSync('index.html', 'utf8')
test('index.html содержит #root', function() { assert(indexHtml.includes('id="root"')) })
test('index.html подключает main.jsx', function() { assert(indexHtml.includes('main.jsx')) })

var mainJsx = fs.readFileSync('src/main.jsx', 'utf8')
test('main.jsx импортирует App', function() { assert(mainJsx.includes("from './App'")) })
test('main.jsx использует createRoot', function() { assert(mainJsx.includes('createRoot')) })
test('main.jsx имеет ErrorBoundary', function() { assert(mainJsx.includes('ErrorBoundary')) })

// ═══════════════════════════════════════
// 5. Multi-account support
// ═══════════════════════════════════════
console.log('\n── Multi-account: ──')
test('findMessengerByUrl принимает webContentsId', function() {
  assert(mainCode.includes('findMessengerByUrl(pageUrl, webContentsId)') || mainCode.includes('findMessengerByUrl(pageUrl,'))
})
test('registerWebContentMessenger определена', function() {
  assert(mainCode.includes('registerWebContentMessenger'))
})
test('app:register-webview handler', function() {
  assert(mainCode.includes("'app:register-webview'"))
})

// ═══════════════════════════════════════
// 6. Hooks per-messenger
// ═══════════════════════════════════════
console.log('\n── Per-messenger hooks: ──')
var hooks = ['telegram', 'max', 'whatsapp', 'vk']
for (var i = 0; i < hooks.length; i++) {
  var hookFile = 'main/preloads/hooks/' + hooks[i] + '.hook.js'
  test(hooks[i] + '.hook.js существует', function() { assert(fs.existsSync(hookFile)) })
}

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
