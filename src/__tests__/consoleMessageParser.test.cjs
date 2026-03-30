/**
 * Тесты consoleMessageParser — парсинг __CC_ сообщений из WebView.
 *
 * Запуск: node src/__tests__/consoleMessageParser.test.js
 */

var fs = require('fs')
var code = fs.readFileSync('src/utils/consoleMessageParser.js', 'utf8')

// Копия функции
function parseConsoleMessage(msg) {
  if (!msg || !msg.startsWith('__CC_')) return null
  if (msg.startsWith('__CC_BADGE_BLOCKED__:')) {
    var val = parseInt(msg.split(':')[1], 10)
    return { type: 'badge_blocked', value: isNaN(val) ? null : val }
  }
  if (msg.startsWith('__CC_ACCOUNT__:')) return { type: 'account', name: msg.slice(15).trim() }
  if (msg.startsWith('__CC_SW_UNREGISTERED__:')) return { type: 'sw_unregistered', count: parseInt(msg.split(':')[1], 10) || 0 }
  if (msg.startsWith('__CC_NOTIF_HOOK_OK__')) return { type: 'notif_hook_ok' }
  if (msg.startsWith('__CC_NOTIF__')) {
    try { var d = JSON.parse(msg.slice(12)); return { type: 'notification', title: d.t||'', body: d.b||'', icon: d.i||'', tag: d.g||'' } }
    catch(e) { return { type: 'notification_error', error: e.message } }
  }
  if (msg.startsWith('__CC_MSG__')) return { type: 'message', text: msg.slice(10).trim() }
  if (msg.startsWith('__CC_DIAG__')) return { type: 'diagnostic', text: msg.slice(11).trim() }
  var prefixEnd = msg.indexOf('__', 4)
  var prefix = prefixEnd > 0 ? msg.slice(0, prefixEnd + 2) : msg.slice(0, 12)
  return { type: 'debug', prefix: prefix.trim(), body: msg.slice(prefix.length).trim() }
}

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты consoleMessageParser\\n')

// ── Базовые ──
console.log('── Базовые: ──')
test('null → null', function() { assert(parseConsoleMessage(null) === null) })
test('Пустая строка → null', function() { assert(parseConsoleMessage('') === null) })
test('Обычный текст → null', function() { assert(parseConsoleMessage('Hello world') === null) })
test('Не __CC_ → null', function() { assert(parseConsoleMessage('some log message') === null) })

// ── BADGE_BLOCKED ──
console.log('\\n── BADGE_BLOCKED: ──')
test(':0 → value=0', function() { var r = parseConsoleMessage('__CC_BADGE_BLOCKED__:0'); assert(r.type === 'badge_blocked' && r.value === 0) })
test(':31 → value=31', function() { var r = parseConsoleMessage('__CC_BADGE_BLOCKED__:31'); assert(r.type === 'badge_blocked' && r.value === 31) })
test(':abc → value=null', function() { var r = parseConsoleMessage('__CC_BADGE_BLOCKED__:abc'); assert(r.type === 'badge_blocked' && r.value === null) })

// ── ACCOUNT ──
console.log('\\n── ACCOUNT: ──')
test('Имя аккаунта', function() { var r = parseConsoleMessage('__CC_ACCOUNT__:Алексей Дугин'); assert(r.type === 'account' && r.name === 'Алексей Дугин') })
test('Пустое имя', function() { var r = parseConsoleMessage('__CC_ACCOUNT__:'); assert(r.type === 'account' && r.name === '') })

// ── NOTIF ──
console.log('\\n── NOTIF: ──')
test('JSON уведомление', function() {
  var r = parseConsoleMessage('__CC_NOTIF__{"t":"Елена","b":"Привет","i":"blob:...","g":"tag123"}')
  assert(r.type === 'notification' && r.title === 'Елена' && r.body === 'Привет' && r.tag === 'tag123')
})
test('Битый JSON', function() { var r = parseConsoleMessage('__CC_NOTIF__{broken}'); assert(r.type === 'notification_error') })

// ── MSG ──
console.log('\\n── MSG: ──')
test('Текст сообщения', function() { var r = parseConsoleMessage('__CC_MSG__Привет как дела'); assert(r.type === 'message' && r.text === 'Привет как дела') })
test('Пустой текст', function() { var r = parseConsoleMessage('__CC_MSG__'); assert(r.type === 'message' && r.text === '') })

// ── DIAG ──
console.log('\\n── DIAG: ──')
test('Диагностика', function() { var r = parseConsoleMessage('__CC_DIAG__chatObserver ready'); assert(r.type === 'diagnostic' && r.text === 'chatObserver ready') })
test('Диагностика msg-src маркер (v0.80.8)', function() { var r = parseConsoleMessage('__CC_DIAG__msg-src: CO | "текст"'); assert(r.type === 'diagnostic' && r.text === 'msg-src: CO | "текст"') })
test('Диагностика nav маркер (v0.80.8)', function() { var r = parseConsoleMessage('__CC_DIAG__nav: /im → /im/convo | a="текст"'); assert(r.type === 'diagnostic' && r.text.startsWith('nav:')) })
test('traceNotif читает parsed.text (v0.80.9)', function() {
  // v0.85.0: код перемещён в consoleMessageHandler.js
  var cmhCode = fs.existsSync('src/utils/consoleMessageHandler.js') ? fs.readFileSync('src/utils/consoleMessageHandler.js', 'utf8') : ''
  var wsCode = fs.existsSync('src/utils/webviewSetup.js') ? fs.readFileSync('src/utils/webviewSetup.js', 'utf8') : ''
  var allWsCode = wsCode + '\n' + cmhCode
  assert(allWsCode.includes('parsed.text || parsed.body'), 'должен читать parsed.text для диагностики')
})

// ── Специальные ──
console.log('\\n── Специальные: ──')
test('SW_UNREGISTERED', function() { var r = parseConsoleMessage('__CC_SW_UNREGISTERED__:1'); assert(r.type === 'sw_unregistered' && r.count === 1) })
test('NOTIF_HOOK_OK', function() { var r = parseConsoleMessage('__CC_NOTIF_HOOK_OK__'); assert(r.type === 'notif_hook_ok') })
test('Неизвестный __CC_', function() { var r = parseConsoleMessage('__CC_CUSTOM__data'); assert(r.type === 'debug' && r.prefix === '__CC_CUSTOM__') })

// ── Структура ──
console.log('\\n── Структура модуля: ──')
test('export parseConsoleMessage', function() { assert(code.includes('export function parseConsoleMessage')) })
test('export extractCCPrefix', function() { assert(code.includes('export function extractCCPrefix')) })

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
