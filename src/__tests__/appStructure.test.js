/**
 * Тесты App.jsx — структура, импорты, компоненты.
 *
 * Запуск: node src/__tests__/appStructure.test.js
 */

const fs = require('fs')
const code = fs.readFileSync('src/App.jsx', 'utf8')
// v0.82.6: WebView setup вынесен
const webviewCode = fs.existsSync('src/utils/webviewSetup.js') ? fs.readFileSync('src/utils/webviewSetup.js', 'utf8') : ''
const allAppCode = code + '\n' + webviewCode

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
test('messengerConfigs', () => assert(code.includes("from './utils/messengerConfigs.js'")))
test('consoleMessageParser', () => assert(code.includes("from './utils/consoleMessageParser.js'")))
test('devLog', () => assert(code.includes("from './utils/devLog.js'")))
test('messageProcessing', () => assert(code.includes("from './utils/messageProcessing.js'")))
test('sound', () => assert(code.includes("from './utils/sound.js'")))
test('navigateToChat', () => assert(code.includes("from './utils/navigateToChat.js'")))
test('MessengerTab', () => assert(code.includes("from './components/MessengerTab.jsx'")))
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
test('playNotificationSound() из sound', () => assert(code.includes('playNotificationSound(')))
test('buildChatNavigateScript() из navigateToChat', () => assert(code.includes('buildChatNavigateScript(')))
test('detectMessengerType() из конфига', () => assert(code.includes('detectMessengerType(')))

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
test('App.jsx > 500 строк (не пустой)', () => assert(lines > 500, 'lines=' + lines))

// ── Компоненты ──
console.log('\\n── Компоненты: ──')
test('NotifLogModal используется', () => assert(code.includes('<NotifLogModal')))
test('MessengerTab используется', () => assert(code.includes('<MessengerTab')))
test('SettingsPanel используется', () => assert(code.includes('<SettingsPanel')))
test('AISidebar используется', () => assert(code.includes('<AISidebar')))

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
