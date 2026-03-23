/**
 * Тесты App.jsx — структура, импорты, компоненты.
 *
 * Запуск: node src/__tests__/appStructure.test.js
 */

const fs = require('fs')
const code = fs.readFileSync('src/App.jsx', 'utf8')

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
test('isSpamText() из конфига', () => assert(code.includes('isSpamText(')))
test('isDuplicateExact() из messageProcessing', () => assert(code.includes('isDuplicateExact(')))
test('isDuplicateSubstring() из messageProcessing', () => assert(code.includes('isDuplicateSubstring(')))
test('stripSenderFromText() из messageProcessing', () => assert(code.includes('stripSenderFromText(')))
test('isOwnMessage() из messageProcessing', () => assert(code.includes('isOwnMessage(')))
test('playNotificationSound() из sound', () => assert(code.includes('playNotificationSound(')))
test('buildChatNavigateScript() из navigateToChat', () => assert(code.includes('buildChatNavigateScript(')))
test('detectMessengerType() из конфига', () => assert(code.includes('detectMessengerType(')))

// ── Размер файла ──
console.log('\\n── Размер: ──')
var lines = code.split('\n').length
test('App.jsx < 2600 строк', () => assert(lines < 2600, 'lines=' + lines))
test('App.jsx > 500 строк (не пустой)', () => assert(lines > 500, 'lines=' + lines))

// ── Компоненты ──
console.log('\\n── Компоненты: ──')
test('NotifLogModal используется', () => assert(code.includes('<NotifLogModal')))
test('MessengerTab используется', () => assert(code.includes('<MessengerTab')))
test('SettingsPanel используется', () => assert(code.includes('<SettingsPanel')))
test('AISidebar используется', () => assert(code.includes('<AISidebar')))

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
