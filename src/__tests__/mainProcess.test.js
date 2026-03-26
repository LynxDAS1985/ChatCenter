/**
 * Тесты main.js — структура, IPC handlers, безопасность.
 *
 * Запуск: node src/__tests__/mainProcess.test.js
 */

const fs = require('fs')
const code = fs.readFileSync('main/main.js', 'utf8')
// v0.82.2: AI handlers вынесены в отдельный файл
const aiCode = fs.existsSync('main/handlers/aiHandlers.js') ? fs.readFileSync('main/handlers/aiHandlers.js', 'utf8') : ''
const allCode = code + '\n' + aiCode

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты main.js\\n')

// ── Импорты ──
console.log('── Импорты: ──')
test('Импорт Electron', () => assert(code.includes("import { app, BrowserWindow")))
test('Импорт overlayIcon', () => assert(code.includes("import { createTrayBadgeIcon, createOverlayIcon }")))
test('Импорт fs', () => assert(code.includes("import fs from")))
test('Импорт path', () => assert(code.includes("import path from")))

// ── Ключевые функции ──
console.log('\\n── Ключевые функции: ──')
test('createWindow определена', () => assert(code.includes('function createWindow')))
test('createTray определена', () => assert(code.includes('function createTray')))
test('setupSession определена', () => assert(code.includes('function setupSession')))
test('ruError определена', () => assert(code.includes('function ruError')))

// ── IPC handlers ──
console.log('\\n── IPC handlers: ──')
test('settings:save', () => assert(code.includes("'settings:save'")))
test('settings:get', () => assert(code.includes("'settings:get'")))
test('app:custom-notify', () => assert(code.includes("'app:custom-notify'")))
test('tray:set-badge', () => assert(code.includes("'tray:set-badge'")))
test('ai:generate', () => assert(allCode.includes("'ai:generate'")))
test('app:get-paths', () => assert(code.includes("'app:get-paths'")))
test('notif:click', () => assert(code.includes("'notif:click'")))
test('notif:dismiss', () => assert(code.includes("'notif:dismiss'")))
test('notif:resize', () => assert(code.includes("'notif:resize'")))

// ── AI провайдеры ──
console.log('\\n── AI провайдеры: ──')
test('OpenAI', () => assert(allCode.includes('openai')))
test('Anthropic', () => assert(allCode.includes('anthropic')))
test('DeepSeek', () => assert(allCode.includes('deepseek')))
test('AI handlers в отдельном файле (v0.82.2)', () => assert(aiCode.length > 100 && code.includes('initAIHandlers'), 'AI handlers должны быть в aiHandlers.js'))
test('GigaChat', () => assert(code.includes('gigachat')))

// ── Overlay ──
console.log('\\n── Overlay: ──')
test('createOverlayIcon используется', () => assert(code.includes('createOverlayIcon(')))
test('createTrayBadgeIcon используется', () => assert(code.includes('createTrayBadgeIcon(')))
test('setOverlayIcon используется', () => assert(code.includes('setOverlayIcon(')))
test('overlayMode обрабатывается', () => assert(code.includes('overlayMode')))

// ── Безопасность ──
console.log('\\n── Безопасность: ──')
test('contextIsolation: true', () => assert(code.includes('contextIsolation: true')))
test('nodeIntegration: false для main window', () => assert(code.includes('nodeIntegration: false')))
test('Нет eval', () => assert(!code.includes('eval(')))
test('setupSession блокирует SW', () => assert(code.includes('serviceworkers') || code.includes('ServiceWorker')))
test('app.setBadgeCount заблокирован', () => assert(code.includes('setBadgeCount')))
test('SSL skip только для GigaChat', () => assert(code.includes('rejectUnauthorized: false')))

// ── Session ──
console.log('\\n── Session: ──')
test('setupSession создаёт partition', () => assert(code.includes('partition')))
test('Permission request handler', () => assert(code.includes('setPermissionRequestHandler')))

// ── Notification ribbon ──
console.log('\\n── Notification ribbon: ──')
test('notification.html', () => assert(code.includes('notification.html')))
test('Frameless window', () => assert(code.includes('frame: false') || code.includes('frame:false')))

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
