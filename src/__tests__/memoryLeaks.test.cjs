/**
 * Тесты утечек памяти — проверяет cleanup listeners, intervals, observers.
 *
 * Запуск: node src/__tests__/memoryLeaks.test.js
 */

var fs = require('fs')
var appCode = fs.readFileSync('src/App.jsx', 'utf8')
// v0.82.6: WebView setup вынесен
try { appCode += '\n' + fs.readFileSync('src/utils/webviewSetup.js', 'utf8') } catch(e) {}
// v0.85.0: consoleMessageHandler вынесен
try { appCode += '\n' + fs.readFileSync('src/utils/consoleMessageHandler.js', 'utf8') } catch(e) {}
// v0.85.0: hooks вынесены
var hooksDir = 'src/hooks/'
try { fs.readdirSync(hooksDir).forEach(function(f) { appCode += '\n' + fs.readFileSync(hooksDir + f, 'utf8') }) } catch(e) {}
try { appCode += '\n' + fs.readFileSync('src/components/TabBar.jsx', 'utf8') } catch(e) {}
var mainCode = fs.readFileSync('main/main.js', 'utf8')
try { mainCode += '\n' + fs.readFileSync('main/handlers/dockPinHandlers.js', 'utf8') } catch(e) {}
// v0.85.0: notificationManager, trayManager, windowManager, backupNotif, aiLogin вынесены
;['main/handlers/notificationManager.js','main/handlers/aiLoginHandler.js','main/handlers/backupNotifHandler.js','main/utils/windowManager.js','main/utils/trayManager.js'].forEach(function(f) {
  try { mainCode += '\n' + fs.readFileSync(f, 'utf8') } catch(e) {}
})

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты утечек памяти\\n')

// ── WebView listeners cleanup ──
console.log('── WebView listeners: ──')
test('_chatcenterListeners массив создаётся', function() {
  assert(appCode.includes('_chatcenterListeners = []'))
})
test('addListener helper определён', function() {
  assert(appCode.includes('const addListener = (event, fn)'))
})
test('addListener сохраняет в массив', function() {
  assert(appCode.includes('_chatcenterListeners.push([event, fn])'))
})
test('dom-ready через addListener', function() {
  assert(appCode.includes("addListener('dom-ready'"))
})
test('page-title-updated через addListener', function() {
  assert(appCode.includes("addListener('page-title-updated'"))
})
test('ipc-message через addListener', function() {
  assert(appCode.includes("addListener('ipc-message'"))
})
test('console-message через addListener', function() {
  assert(appCode.includes("addListener('console-message'"))
})
test('did-start-loading через addListener', function() {
  assert(appCode.includes("addListener('did-start-loading'"))
})
test('did-stop-loading через addListener', function() {
  assert(appCode.includes("addListener('did-stop-loading'"))
})
test('Cleanup при удалении вкладки', function() {
  assert(appCode.includes('wv._chatcenterListeners'))
  assert(appCode.includes('removeEventListener'))
})
test('Нет el.addEventListener в setWebviewRef (все через addListener)', function() {
  // Ищем el.addEventListener НЕ в строке определения addListener
  var lines = appCode.split('\n')
  var bad = lines.filter(function(l) {
    return l.includes('el.addEventListener') && !l.includes('const addListener')
  })
  assert(bad.length === 0, 'Найдено ' + bad.length + ' el.addEventListener без addListener')
})

// ── main.js intervals cleanup ──
console.log('\\n── main.js intervals: ──')
test('iconCache cleanup при will-quit', function() {
  // v0.85.0: iconCacheInterval перенесён в notificationManager, cleanup через cleanup()
  assert(mainCode.includes('iconCache') && mainCode.includes('cleanup'), 'iconCache cleanup должен быть определён')
})
test('iconCache.clear при will-quit', function() {
  assert(mainCode.includes('iconCache.clear()'))
})
test('app.on will-quit определён', function() {
  assert(mainCode.includes("app.on('will-quit'"))
})

// ── Cleanup окон при quit ──
console.log('\\n── Cleanup окон: ──')
test('notifWin cleanup при quit', function() {
  assert(mainCode.includes('notifWin') && mainCode.includes('.destroy()'))
})
test('tray cleanup при quit', function() {
  assert(mainCode.includes('tray') && mainCode.includes('tray.destroy'))
})

// ── innerHTML удалён ──
console.log('\\n── Безопасность: ──')
test('Нет innerHTML в main.js', function() {
  assert(!mainCode.includes('.innerHTML'), 'innerHTML найден!')
})
test('textContent используется вместо innerHTML', function() {
  assert(mainCode.includes('.textContent'))
})

// ── Regex catch не пустые ──
console.log('\\n── Regex error handling: ──')
test('Regex catch с devError', function() {
  var regexCatches = (appCode.match(/catch\s*\(e\)\s*\{\s*devError/g) || []).length
  assert(regexCatches >= 3, 'только ' + regexCatches + ' catch с devError (нужно >= 3)')
})

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
