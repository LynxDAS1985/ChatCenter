/**
 * Тесты App.jsx — структура, импорты, компоненты.
 *
 * Запуск: node src/__tests__/appStructure.test.js
 */

const fs = require('fs')
const path = require('path')
const code = fs.readFileSync('src/App.jsx', 'utf8')
// v0.82.6: WebView setup вынесен
const webviewCode = fs.existsSync('src/utils/webviewSetup.js') ? fs.readFileSync('src/utils/webviewSetup.js', 'utf8') : ''
// v0.87.97: handleNewMessage вынесен из webviewSetup.js в отдельный файл
const handleNewMessageCode = fs.existsSync('src/utils/webviewHandleNewMessage.js') ? fs.readFileSync('src/utils/webviewHandleNewMessage.js', 'utf8') : ''
// v0.84.3: Hooks and components extracted from App.jsx
const hooksDir = 'src/hooks'
const hooksCode = fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir).map(f => fs.readFileSync(path.join(hooksDir, f), 'utf8')).join('\n') : ''
const tabBarCode = fs.existsSync('src/components/TabBar.jsx') ? fs.readFileSync('src/components/TabBar.jsx', 'utf8') : ''
const allAppCode = code + '\n' + webviewCode + '\n' + handleNewMessageCode + '\n' + hooksCode + '\n' + tabBarCode

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты App.jsx структуры\\n')

// ── Импорты модулей ──
console.log('── Импорты: ──')
test('React', () => assert(code.includes("from 'react'")))
test('messengerConfigs', () => assert(allAppCode.includes('messengerConfigs.js')))
test('consoleMessageParser', () => assert(allAppCode.includes('consoleMessageParser.js')))
test('devLog', () => assert(allAppCode.includes('devLog.js')))
test('messageProcessing', () => assert(allAppCode.includes('messageProcessing.js')))
test('sound', () => assert(allAppCode.includes('sound.js')))
test('navigateToChat', () => assert(allAppCode.includes('navigateToChat.js')))
test('MessengerTab', () => assert(allAppCode.includes('MessengerTab.jsx')))
test('NotifLogModal', () => assert(code.includes("from './components/NotifLogModal.jsx'")))
test('SettingsPanel', () => assert(code.includes("from './components/SettingsPanel.jsx'")))
test('AISidebar', () => assert(code.includes("from './components/AISidebar.jsx'")))

// ── Нет дублирования (inline код удалён) ──
console.log('\\n── Нет дублирования: ──')
test('Нет inline MESSENGER_SOUNDS', () => assert(!code.includes('const MESSENGER_SOUNDS')))
test('Нет inline playNotificationSound function', () => {
  // Должен быть import, не function definition
  assert(!code.includes('function playNotificationSound'))
})
test('Нет inline buildChatNavigateScript function', () => {
  assert(!code.includes('function buildChatNavigateScript'))
  assert(!code.includes('function _DEAD_buildChatNavigateScript'))
})
test('Нет inline MessengerTab function', () => {
  assert(!code.includes('function MessengerTab('))
})
test('Нет мёртвых функций _DEAD_', () => assert(!code.includes('function _DEAD_')))
test('Нет if(false) блоков', () => assert(!code.includes('if (false)')))

// ── Ключевые функции ──
console.log('\\n── Ключевые функции: ──')
test('handleNewMessage определена', () => assert(code.includes('handleNewMessage')))
test('setWebviewRef определена', () => assert(code.includes('setWebviewRef')))
test('handleTabContextAction определена', () => assert(code.includes('handleTabContextAction')))
test('handleTabContextAction_diag определена', () => assert(code.includes('handleTabContextAction_diag')))
test('traceNotif определена', () => assert(code.includes('traceNotif')))

// ── Использует модульные функции ──
console.log('\\n── Использует модульные функции: ──')
test('isSpamText() из конфига', () => assert(allAppCode.includes('isSpamText(')))
test('isDuplicateExact() из messageProcessing', () => assert(allAppCode.includes('isDuplicateExact(')))
test('isDuplicateSubstring() из messageProcessing', () => assert(allAppCode.includes('isDuplicateSubstring(')))
test('stripSenderFromText() из messageProcessing', () => assert(allAppCode.includes('stripSenderFromText(')))
test('isOwnMessage() из messageProcessing', () => assert(allAppCode.includes('isOwnMessage(')))
test('WebView setup в отдельном файле (v0.82.6)', () => assert(webviewCode.length > 100 && code.includes('createWebviewSetup'), 'webviewSetup.js должен существовать'))
// v0.87.82: playNotificationSound вызов теперь в useAppIPCListeners.js (был в App.jsx)
test('playNotificationSound() из sound', () => assert(allAppCode.includes('playNotificationSound(')))
test('buildChatNavigateScript() из navigateToChat', () => assert(allAppCode.includes('buildChatNavigateScript(')))
test('detectMessengerType() из конфига', () => assert(allAppCode.includes('detectMessengerType(')))

// ── Безопасность __CC_NOTIF__ (v0.81.3) ──
console.log('\\n── __CC_NOTIF__ pipeline: ──')
test('Нет undefined isSpam в __CC_NOTIF__ handler (v0.81.3)', () => {
  assert(!code.includes('!isSpam'), 'isSpam переменная не определена в App.jsx — использование вызовет ReferenceError')
})

// ── Размер файла ──
console.log('\\n── Размер: ──')
var lines = code.split('\n').length
test('App.jsx < 2500 строк', () => assert(lines < 2500, 'lines=' + lines))
test('Минимум console.log (< 5 в renderer)', () => {
  // Считаем console.log НЕ внутри executeJavaScript строк
  var logLines = code.split('\n').filter(l => /^\s*console\.log/.test(l) && !l.includes("console.log('__CC_"))
  assert(logLines.length < 5, 'found ' + logLines.length + ' console.log lines')
})
// v0.87.82: после рефакторинга App.jsx ≈ 475 строк (было 599). Порог снижен до 300 — главное чтобы файл не был пустым.
test('App.jsx > 300 строк (не пустой)', () => assert(lines > 300, 'lines=' + lines))

// ── Компоненты ──
console.log('\\n── Компоненты: ──')
test('NotifLogModal используется', () => assert(code.includes('<NotifLogModal')))
test('MessengerTab используется', () => assert(allAppCode.includes('<MessengerTab')))
test('SettingsPanel используется', () => assert(code.includes('<SettingsPanel')))
test('AISidebar используется', () => assert(code.includes('<AISidebar')))

// v0.86.10 Ловушка 64: resize/reload откачены, hook содержит health-check + warm-up
test('useWebViewLifecycle hook подключён (Ловушка 64)', () =>
  assert(code.includes('useWebViewLifecycle') && allAppCode.includes('__CC_DIAG__health'),
    'App.jsx должен использовать useWebViewLifecycle — health-check + warm-up (resize/reload откачены, не работают для peer-changed race)'))

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
