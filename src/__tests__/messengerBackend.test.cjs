/**
 * v0.89.0 — Stage 4 / Этап 4: контракт абстракции messengerBackend (TDLib-only).
 *
 * После полного удаления GramJS-бэкенда (Этап 4) единственный реальный backend —
 * TDLib. Этот тест проверяет, что:
 *  - main/native/messengerBackend.js содержит JSDoc-описание интерфейса (типы) и
 *    экспортирует getBackendName() возвращающий 'tdlib'.
 *  - main/native/backends/tdlibBackend.js существует, экспортирует createTdlibBackend
 *    и реализует ВСЕ методы из контракта (auth / chats / messages / media / forum).
 *  - Зависимости tdl + prebuilt-tdlib установлены, libtdjson найден и > 1 МБ.
 *  - В коде НЕ осталось ссылок на удалённые GramJS-файлы.
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

console.log('\n🧪 messengerBackend контракт (Stage 4 / Этап 4 — TDLib only)\n')

const backendCode = fs.readFileSync('main/native/messengerBackend.js', 'utf8')
const tdlibCode = fs.readFileSync('main/native/backends/tdlibBackend.js', 'utf8')

console.log('── Файлы существуют и имеют экспорты: ──')
test('messengerBackend.js экспортирует getBackendName', () => {
  assert(backendCode.includes('export function getBackendName'), 'export getBackendName')
})
test('getBackendName() возвращает "tdlib"', () => {
  assert(/return\s+['"]tdlib['"]/.test(backendCode), 'getBackendName must return "tdlib"')
})
test('messengerBackend.js имеет JSDoc типы для интерфейса', () => {
  assert(backendCode.includes('@typedef {object} MessengerBackend'), 'MessengerBackend typedef')
  assert(backendCode.includes('@typedef {object} BackendAuth'), 'BackendAuth typedef')
  assert(backendCode.includes('@typedef {object} BackendChats'), 'BackendChats typedef')
  assert(backendCode.includes('@typedef {object} BackendMessages'), 'BackendMessages typedef')
  assert(backendCode.includes('@typedef {object} BackendMedia'), 'BackendMedia typedef')
  assert(backendCode.includes('@typedef {object} BackendForum'), 'BackendForum typedef')
})
test('tdlibBackend.js экспортирует createTdlibBackend', () => {
  assert(tdlibCode.includes('export function createTdlibBackend'), 'export createTdlibBackend')
})

console.log('\n── Контракт интерфейса (set методов на TDLib backend): ──')
const REQUIRED_METHODS = {
  auth: ['startLogin', 'submitCode', 'submitPassword', 'cancelLogin', 'autoRestoreSessions', 'removeAccount'],
  chats: ['getChats', 'getCachedChats', 'rescanUnread', 'healthCheck'],
  messages: ['get', 'getTopic', 'send', 'sendFile', 'deleteMessage', 'editMessage', 'forwardMessage', 'markRead', 'markTopicRead', 'getPinned'],
  media: ['download', 'downloadVideo', 'downloadThumbnail', 'getCacheSize', 'cleanup'],
  forum: ['getTopics', 'getTopicMessages'],
}

for (const [group, methods] of Object.entries(REQUIRED_METHODS)) {
  for (const method of methods) {
    test(`tdlibBackend.${group}.${method} определён`, () => {
      assert(tdlibCode.includes(`${method}:`) || tdlibCode.includes(`${method}(`),
        `tdlibBackend must declare ${group}.${method}`)
    })
  }
}

console.log('\n── name property: ──')
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
test('libtdjson присутствует для текущей платформы и > 1 МБ', () => {
  const { getTdjson } = require('prebuilt-tdlib')
  const libPath = getTdjson()
  assert(libPath && typeof libPath === 'string', 'getTdjson() must return a path string')
  assert(fs.existsSync(libPath), `library not found at ${libPath}`)
  const size = fs.statSync(libPath).size
  assert(size > 1024 * 1024, `library too small (${size} bytes at ${libPath})`)
})
test('tdl/package.json указывает на entry point', () => {
  const pkg = JSON.parse(fs.readFileSync('node_modules/tdl/package.json', 'utf8'))
  assert(pkg.main || pkg.exports, 'tdl package must have main or exports field')
})

console.log('\n── package.json — зависимости TDLib зафиксированы: ──')
test('tdl присутствует в dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert(pkg.dependencies && pkg.dependencies.tdl, 'package.json dependencies.tdl missing')
})
test('prebuilt-tdlib присутствует в dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert(pkg.dependencies && pkg.dependencies['prebuilt-tdlib'], 'package.json dependencies.prebuilt-tdlib missing')
})

console.log('\n── GramJS полностью удалён (Этап 4): ──')
const DELETED_GRAMJS_FILES = [
  'main/native/backends/gramjsBackend.js',
  'main/native/telegramHandler.js',
  'main/native/telegramAuth.js',
  'main/native/telegramChats.js',
  'main/native/telegramChatsIpc.js',
  'main/native/telegramCleanup.js',
  'main/native/telegramErrors.js',
  'main/native/telegramForumTopicsIpc.js',
  'main/native/telegramMedia.js',
  'main/native/telegramMessageMapper.js',
  'main/native/telegramMessages.js',
  'main/native/telegramState.js',
  'main/native/tdlibPoc.cjs',
]
for (const f of DELETED_GRAMJS_FILES) {
  test(`Файл ${f} удалён`, () => {
    assert(!fs.existsSync(f), `${f} must not exist (GramJS должен быть полностью удалён)`)
  })
}

console.log('\n── TDLib модули backend на месте: ──')
const REQUIRED_TDLIB_FILES = [
  'main/native/backends/tdlibBackend.js',
  'main/native/backends/tdlibAuth.js',
  'main/native/backends/tdlibClient.js',
  'main/native/backends/tdlibMessages.js',
  'main/native/backends/tdlibMedia.js',
  'main/native/backends/tdlibMapper.js',
  'main/native/backends/tdlibAvatars.js',
  'main/native/backends/tdlibNormalize.js',
  'main/native/backends/tdlibRuntime.js',
  'main/native/backends/tdlibStartup.js',
  'main/native/tdlibIpcHandlers.js',
]
for (const f of REQUIRED_TDLIB_FILES) {
  test(`Файл ${f} существует`, () => {
    assert(fs.existsSync(f), `${f} обязателен (TDLib backend)`)
  })
}

console.log(`\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
