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

// ═══════════════════════════════════════════════════════════════════════
// v0.85.5: Логирование и обработка ошибок
// ═══════════════════════════════════════════════════════════════════════
console.log('\\n── Полнота логирования (v0.85.5): ──')

// 1. Renderer error logging
var wmCode = ''
try { wmCode = fs.readFileSync('main/utils/windowManager.js', 'utf8') } catch(e) {}
test('Renderer console.error → chatcenter.log', function() {
  assert(wmCode.includes('console-message'), 'windowManager должен слушать console-message')
})
test('Preload ошибки → chatcenter.log', function() {
  assert(wmCode.includes('preload-error'), 'windowManager должен слушать preload-error')
})

// 2. WebView crash/unresponsive detection
test('WebView crash detection (render-process-gone)', function() {
  assert(appCode.includes('render-process-gone'), 'webviewSetup должен слушать render-process-gone')
})
test('WebView hang detection (unresponsive)', function() {
  assert(appCode.includes("'unresponsive'"), 'webviewSetup должен слушать unresponsive')
})
test('WebView load failure (did-fail-load)', function() {
  assert(appCode.includes('did-fail-load'), 'webviewSetup должен слушать did-fail-load')
})

// 3. Deprecated API fix
test('console-message использует Event API (не args)', function() {
  // Electron 41: console-message(event) вместо (_e, level, msg, line, source)
  assert(!wmCode.includes('(_e, level, msg, line, source)'), 'Deprecated: используй e.level, e.message вместо позиционных args')
})

// 4. Пустые catch {} в критических местах
var sessionCode = ''
try { sessionCode = fs.readFileSync('main/utils/sessionSetup.js', 'utf8') } catch(e) {}
test('setupSession: нет повторных listeners (MaxListeners fix)', function() {
  assert(sessionCode.includes('_setupDone'), 'setupSession должен трекать уже настроенные сессии')
})

// 5. Критические catch {} заменены на логирующие
test('main.js: storage read ошибка логируется', function() {
  assert(mainCode.includes("'[Storage]"), 'storage read должен логировать ошибку')
})
test('main.js: setupSession ошибка логируется', function() {
  assert(mainCode.includes('[Session]'), 'setupSession catch должен логировать')
})

// 6. Monitor status: active при __CC_ ответе
var cmhCode = ''
try { cmhCode = fs.readFileSync('src/utils/consoleMessageHandler.js', 'utf8') } catch(e) {}
test('__CC_ → setMonitorStatus active (fix красных кругляшков)', function() {
  assert(cmhCode.includes("setMonitorStatus") && cmhCode.includes("'active'"), 'consoleMessageHandler должен ставить active при __CC_ ответе')
})
test('WebView timeout → error логируется', function() {
  assert(appCode.includes('[Monitor]') && appCode.includes('не ответил'), 'таймаут монитора должен логироваться')
})

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
