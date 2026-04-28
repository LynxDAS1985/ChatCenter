/**
 * Интеграционные тесты — часть 2: модульные цепочки.
 * Вынесено из integration.test.cjs в v0.87.87 (главный был 391/400).
 *
 * Цепочки 3-5:
 *   3. messengerConfigs → detectType → правильный скрипт навигации
 *   4. App.jsx imports → все модули связаны
 *   5. addListener → removeEventListener (lifecycle)
 *
 * Цепочки 1-2 (JSON pipeline, viewing logic, console-message) — в integration.test.cjs.
 *
 * Запуск: node src/__tests__/integrationChains.test.cjs
 */

var fs = require('fs')
var path = require('path')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Интеграционные тесты — модульные цепочки\\n')

// ═══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 3: messengerConfigs → detectType → правильный скрипт
// ═══════════════════════════════════════════════════════════════════════
console.log('── Цепочка: URL → detectType → config: ──')

var configCode = fs.readFileSync('src/utils/messengerConfigs.js', 'utf8')
// v0.87.77: navigateToChat.js разбит на роутер + navigators/. Склеиваем
// все файлы для проверки паттернов (.chatlist-chat / ConvoListItem
// теперь в navigators/telegramNavigate.js и navigators/vkNavigate.js).
var navRouter = fs.readFileSync('src/utils/navigateToChat.js', 'utf8')
var navDir = 'src/utils/navigators'
var navFiles = fs.readdirSync(navDir).filter(function(f) { return f.endsWith('.js') })
var navCode = [navRouter].concat(navFiles.map(function(f) {
  return fs.readFileSync(path.join(navDir, f), 'utf8')
})).join('\n')

test('Telegram URL → telegram type → TG DOM-скан', function() {
  assert(configCode.includes("'telegram'"))
  assert(configCode.includes("type: 'telegram'"))
})

test('VK URL → vk type → VK DOM-скан + ConvoListItem', function() {
  assert(configCode.includes("'vk'"))
  assert(configCode.includes("type: 'vk'"))
  assert(configCode.includes('ConvoListItem'))
})

test('navigateToChat: TG URL → TG скрипт с .chatlist-chat', function() {
  assert(navCode.includes('telegram.org'))
  assert(navCode.includes('.chatlist-chat'))
})

test('navigateToChat: VK URL → VK скрипт с ConvoListItem', function() {
  assert(navCode.includes('vk.com'))
  assert(navCode.includes('ConvoListItem'))
})

// ═══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 4: App.jsx imports → все модули связаны
// ═══════════════════════════════════════════════════════════════════════
console.log('\\n── Цепочка: App.jsx ↔ модули: ──')

var appCode = fs.readFileSync('src/App.jsx', 'utf8')
// v0.85.0: include extracted modules
try { appCode += '\n' + fs.readFileSync('src/utils/webviewSetup.js', 'utf8') } catch(e) {}
try { appCode += '\n' + fs.readFileSync('src/utils/consoleMessageHandler.js', 'utf8') } catch(e) {}
try { appCode += '\n' + fs.readFileSync('src/components/TabBar.jsx', 'utf8') } catch(e) {}
try { fs.readdirSync('src/hooks/').forEach(function(f) { appCode += '\n' + fs.readFileSync('src/hooks/' + f, 'utf8') }) } catch(e) {}
// v0.82.6: WebView setup вынесен
try { appCode += '\n' + fs.readFileSync('src/utils/webviewSetup.js', 'utf8') } catch(e) {}
// v0.87.97: handleNewMessage (содержит isDuplicateExact/Substring и др.) вынесен в отдельный файл
try { appCode += '\n' + fs.readFileSync('src/utils/webviewHandleNewMessage.js', 'utf8') } catch(e) {}

test('App.jsx → isSpamText → spamPatterns.json', function() {
  assert(appCode.includes('isSpamText('))
  assert(configCode.includes('spamPatterns.json'))
})

test('App.jsx → isDuplicateExact/Substring → messageProcessing', function() {
  assert(appCode.includes('isDuplicateExact('))
  assert(appCode.includes('isDuplicateSubstring('))
})

test('App.jsx → parseConsoleMessage → consoleMessageParser', function() {
  assert(appCode.includes('parseConsoleMessage('))
  // v0.85.0: импорт может быть в webviewSetup.js (relative path ./consoleMessageParser.js)
  assert(appCode.includes("consoleMessageParser"))
})

test('App.jsx → playNotificationSound → sound.js', function() {
  assert(appCode.includes('playNotificationSound('))
  assert(appCode.includes("from './utils/sound.js'"))
})

test('App.jsx → buildChatNavigateScript → navigateToChat.js', function() {
  assert(appCode.includes('buildChatNavigateScript('))
  assert(appCode.includes("from './utils/navigateToChat.js'"))
})

test('App.jsx → devLog/devError → devLog.js', function() {
  assert(appCode.includes('devLog('))
  assert(appCode.includes('devError('))
})

test('App.jsx → MessengerTab → components', function() {
  assert(appCode.includes('<MessengerTab'))
  // v0.85.0: может быть в TabBar.jsx (relative path ./MessengerTab.jsx)
  assert(appCode.includes("MessengerTab"))
})

test('App.jsx → NotifLogModal → components', function() {
  assert(appCode.includes('<NotifLogModal'))
  assert(appCode.includes("from './components/NotifLogModal.jsx'"))
})

test('main.js → overlayIcon → main/utils', function() {
  // v0.87.103: overlayIcon переехал из main.js в mainIpcHandlers.js (используется для tray:set-badge)
  var combined = fs.readFileSync('main/main.js', 'utf8') + '\n' +
    fs.readFileSync('main/handlers/mainIpcHandlers.js', 'utf8')
  assert(combined.includes('createOverlayIcon('))
  assert(combined.includes("from '../utils/overlayIcon.js'") || combined.includes("from './utils/overlayIcon.js'"))
})

// ═══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 5: addListener → removeEventListener (lifecycle)
// ═══════════════════════════════════════════════════════════════════════
console.log('\\n── Цепочка: listener lifecycle: ──')

test('addListener создаёт массив → removeEventListener при delete', function() {
  assert(appCode.includes('_chatcenterListeners = []'))
  assert(appCode.includes('_chatcenterListeners.push'))
  assert(appCode.includes('wv._chatcenterListeners'))
  assert(appCode.includes('removeEventListener'))
})

test('will-quit: cleanup + iconCache + window destroy', function() {
  var mainCode = fs.readFileSync('main/main.js', 'utf8')
  // v0.85.0: notificationManager cleanup вынесен
  ;['main/handlers/notificationManager.js','main/utils/trayManager.js'].forEach(function(f) {
    try { mainCode += '\n' + fs.readFileSync(f, 'utf8') } catch(e) {}
  })
  assert(mainCode.includes("app.on('will-quit'"))
  assert(mainCode.includes('iconCache') && mainCode.includes('cleanup'))
  assert(mainCode.includes('notifWin') || mainCode.includes('.destroy()'))
})

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
