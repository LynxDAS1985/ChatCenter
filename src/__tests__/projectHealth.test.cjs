/**
 * Тесты здоровья проекта — зависимости, мёртвый код, версии.
 *
 * Запуск: node src/__tests__/projectHealth.test.js
 */

var fs = require('fs')
var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
var claude = fs.readFileSync('CLAUDE.md', 'utf8')
var appCode = fs.readFileSync('src/App.jsx', 'utf8')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты здоровья проекта\\n')

// ── Зависимости ──
console.log('── Зависимости: ──')
test('Нет zustand в dependencies', function() { assert(!pkg.dependencies.zustand) })
test('Нет electron-store в dependencies', function() { assert(!pkg.dependencies['electron-store']) })
test('Нет cross-env в devDependencies', function() { assert(!pkg.devDependencies['cross-env']) })
test('react есть', function() { assert(pkg.dependencies.react) })
test('react-dom есть', function() { assert(pkg.dependencies['react-dom']) })
test('electron есть', function() { assert(pkg.devDependencies.electron) })
test('electron-vite есть', function() { assert(pkg.devDependencies['electron-vite']) })
test('npm test script определён', function() { assert(pkg.scripts.test && pkg.scripts.test.length > 10) })

// ── Версии синхронизированы ──
console.log('\\n── Версии: ──')
var pkgVersion = pkg.version
test('package.json версия определена', function() { assert(pkgVersion && pkgVersion.length > 3) })
test('CLAUDE.md шапка содержит версию', function() {
  assert(claude.includes('**Текущая версия**: v' + pkgVersion), 'шапка: v' + pkgVersion + ' не найдена')
})
test('CLAUDE.md подвал содержит версию', function() {
  assert(claude.includes('**Версия проекта**: v' + pkgVersion), 'подвал: v' + pkgVersion + ' не найдена')
})

// ── Мёртвый код ──
console.log('\\n── Мёртвый код: ──')
test('Нет function _DEAD_ в App.jsx', function() { assert(!appCode.includes('function _DEAD_')) })
test('Нет if (false) в App.jsx', function() { assert(!appCode.includes('if (false)')) })
test('Нет DEAD_DELETE_ME', function() { assert(!appCode.includes('DEAD_DELETE_ME')) })

// ── Структура проекта ──
console.log('\\n── Структура: ──')
test('shared/spamPatterns.json существует', function() { assert(fs.existsSync('shared/spamPatterns.json')) })
test('src/utils/messengerConfigs.js существует', function() { assert(fs.existsSync('src/utils/messengerConfigs.js')) })
test('src/utils/messageProcessing.js существует', function() { assert(fs.existsSync('src/utils/messageProcessing.js')) })
test('src/utils/sound.js существует', function() { assert(fs.existsSync('src/utils/sound.js')) })
test('src/utils/navigateToChat.js существует', function() { assert(fs.existsSync('src/utils/navigateToChat.js')) })
test('main/utils/overlayIcon.js существует', function() { assert(fs.existsSync('main/utils/overlayIcon.js')) })
test('.github/workflows/test.yml существует', function() { assert(fs.existsSync('.github/workflows/test.yml')) })
test('src/components/MessengerTab.jsx существует', function() { assert(fs.existsSync('src/components/MessengerTab.jsx')) })
test('src/components/NotifLogModal.jsx существует', function() { assert(fs.existsSync('src/components/NotifLogModal.jsx')) })

// ── Размеры файлов ──
console.log('\\n── Размеры: ──')
var appLines = appCode.split('\n').length
test('App.jsx < 2500 строк', function() { assert(appLines < 2500, 'lines=' + appLines) })
var mainLines = fs.readFileSync('main/main.js', 'utf8').split('\n').length
test('main.js < 2000 строк', function() { assert(mainLines < 2000, 'lines=' + mainLines) })
var monLines = fs.readFileSync('main/preloads/monitor.preload.cjs', 'utf8').split('\n').length
test('monitor.preload.cjs < 1500 строк', function() { assert(monLines < 1500, 'lines=' + monLines) })

// ── Безопасность ──
console.log('\\n── Безопасность: ──')
test('Нет eval() в App.jsx', function() { assert(!appCode.includes('eval(')) })
var mainCode = fs.readFileSync('main/main.js', 'utf8')
// v0.84.4: windowManager extracted — security checks across all main modules
var windowMgrCode = fs.existsSync('main/utils/windowManager.js') ? fs.readFileSync('main/utils/windowManager.js', 'utf8') : ''
var allMainCode = mainCode + '\n' + windowMgrCode
test('contextIsolation: true в main.js', function() { assert(allMainCode.includes('contextIsolation: true')) })
test('nodeIntegration: false в main.js', function() { assert(allMainCode.includes('nodeIntegration: false')) })

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
