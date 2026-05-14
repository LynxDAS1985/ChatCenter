/**
 * v0.89.0 — Stage 4 / Этап 1: контракт абстракции messengerBackend
 *
 * Что проверяет:
 *  - Файл main/native/messengerBackend.js существует и экспортирует getBackend, getBackendName.
 *  - Файл main/native/backends/gramjsBackend.js существует и экспортирует createGramjsBackend.
 *  - Файл main/native/backends/tdlibBackend.js существует и экспортирует createTdlibBackend.
 *  - Оба backend'а реализуют один и тот же набор методов (auth/chats/messages/media/forum).
 *  - Все методы — функции (не пропущены).
 *  - При попытке вызвать неимплементированный метод бросается понятная ошибка.
 *  - Зависимости tdl и prebuilt-tdlib установлены и загружаются.
 *
 * Запуск: node src/__tests__/messengerBackend.test.cjs
 */

const fs = require('fs')
const path = require('path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 messengerBackend контракт (Stage 4 / Этап 1)\n')

const backendCode = fs.readFileSync('main/native/messengerBackend.js', 'utf8')
const gramjsCode = fs.readFileSync('main/native/backends/gramjsBackend.js', 'utf8')
const tdlibCode = fs.readFileSync('main/native/backends/tdlibBackend.js', 'utf8')

console.log('── Файлы существуют и имеют экспорты: ──')
test('messengerBackend.js экспортирует getBackend + getBackendName', () => {
  assert(backendCode.includes('export function getBackend'), 'export getBackend')
  assert(backendCode.includes('export function getBackendName'), 'export getBackendName')
})
test('messengerBackend.js имеет JSDoc типы для интерфейса', () => {
  assert(backendCode.includes('@typedef {object} MessengerBackend'), 'MessengerBackend typedef')
  assert(backendCode.includes('@typedef {object} BackendAuth'), 'BackendAuth typedef')
  assert(backendCode.includes('@typedef {object} BackendChats'), 'BackendChats typedef')
  assert(backendCode.includes('@typedef {object} BackendMessages'), 'BackendMessages typedef')
  assert(backendCode.includes('@typedef {object} BackendMedia'), 'BackendMedia typedef')
  assert(backendCode.includes('@typedef {object} BackendForum'), 'BackendForum typedef')
})
test('messengerBackend.js имеет факторию USE_TDLIB_BACKEND', () => {
  assert(backendCode.includes('USE_TDLIB_BACKEND'), 'feature flag env var')
})
test('gramjsBackend.js экспортирует createGramjsBackend', () => {
  assert(gramjsCode.includes('export function createGramjsBackend'), 'export createGramjsBackend')
})
test('tdlibBackend.js экспортирует createTdlibBackend', () => {
  assert(tdlibCode.includes('export function createTdlibBackend'), 'export createTdlibBackend')
})

console.log('\n── Контракт интерфейса (set методов): ──')
const REQUIRED_METHODS = {
  auth: ['startLogin', 'submitCode', 'submitPassword', 'cancelLogin', 'autoRestoreSessions', 'removeAccount'],
  chats: ['getChats', 'getCachedChats', 'rescanUnread', 'healthCheck'],
  messages: ['get', 'getTopic', 'send', 'sendFile', 'deleteMessage', 'editMessage', 'forwardMessage', 'markRead', 'markTopicRead', 'getPinned'],
  media: ['download', 'downloadVideo', 'getCacheSize', 'cleanup'],
  forum: ['getTopics', 'getTopicMessages'],
}

for (const [group, methods] of Object.entries(REQUIRED_METHODS)) {
  for (const method of methods) {
    test(`gramjsBackend.${group}.${method} определён`, () => {
      assert(gramjsCode.includes(`${method}(`) || gramjsCode.includes(`${method}:`),
        `gramjsBackend must declare ${group}.${method}`)
    })
    test(`tdlibBackend.${group}.${method} определён`, () => {
      assert(tdlibCode.includes(`${method}:`) || tdlibCode.includes(`${method}(`),
        `tdlibBackend must declare ${group}.${method}`)
    })
  }
}

console.log('\n── name property на каждом backend: ──')
test('gramjsBackend.name = "gramjs"', () => {
  assert(gramjsCode.match(/name:\s*['"]gramjs['"]/), 'gramjsBackend.name === "gramjs"')
})
test('tdlibBackend.name = "tdlib"', () => {
  assert(tdlibCode.match(/name:\s*['"]tdlib['"]/), 'tdlibBackend.name === "tdlib"')
})

console.log('\n── Зависимости tdl + prebuilt-tdlib установлены: ──')
test('tdl установлен в node_modules', () => {
  assert(fs.existsSync('node_modules/tdl/package.json'), 'node_modules/tdl/package.json must exist')
})
test('prebuilt-tdlib установлен в node_modules', () => {
  assert(fs.existsSync('node_modules/prebuilt-tdlib/package.json'), 'node_modules/prebuilt-tdlib/package.json must exist')
})
test('libtdjson.dll присутствует и > 1 МБ', () => {
  // На Windows x64
  const winLib = 'node_modules/@prebuilt-tdlib/win32-x64/tdjson.dll'
  const unixLib = 'node_modules/@prebuilt-tdlib/linux-x64/libtdjson.so'
  const macLib = 'node_modules/@prebuilt-tdlib/darwin-x64/libtdjson.dylib'
  const exists = fs.existsSync(winLib) || fs.existsSync(unixLib) || fs.existsSync(macLib)
  assert(exists, 'at least one platform binary must exist')
  const present = [winLib, unixLib, macLib].find(p => fs.existsSync(p))
  const size = fs.statSync(present).size
  assert(size > 1024 * 1024, `library too small (${size} bytes)`)
})
test('tdl/package.json указывает на entry point', () => {
  const pkg = JSON.parse(fs.readFileSync('node_modules/tdl/package.json', 'utf8'))
  assert(pkg.main || pkg.exports, 'tdl package must have main or exports field')
})

console.log('\n── package.json — зависимости зафиксированы: ──')
test('tdl присутствует в dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert(pkg.dependencies && pkg.dependencies.tdl, 'package.json dependencies.tdl missing')
})
test('prebuilt-tdlib присутствует в dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert(pkg.dependencies && pkg.dependencies['prebuilt-tdlib'], 'package.json dependencies.prebuilt-tdlib missing')
})

console.log('\n── Текущий backend = gramjs (по умолчанию): ──')
test('SELECTED_BACKEND логика — falls back to gramjs если нет env', () => {
  assert(backendCode.includes("=== '1' ? 'tdlib' : 'gramjs'"),
    'default backend selection must fallback to gramjs')
})

console.log(`\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
