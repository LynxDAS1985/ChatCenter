/**
 * v0.84.0: Post-build contract test — проверяет что production build содержит ВСЕ нужные файлы
 * Ловит: .mjs vs .js расхождения, отсутствующие HTML/hooks, pin/dock preloads
 *
 * Запуск: node src/__tests__/buildContract.test.cjs
 */

const fs = require('fs')
const path = require('path')
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Post-build contract тесты\n')

// Проверяем что out/ существует (build был запущен)
const outExists = fs.existsSync('out')
if (!outExists) {
  console.log('  ⚠️  out/ не существует — пропуск (запустите npm run build)')
  console.log('\n📊 Результат: 0 ✅ / 0 ❌ (пропущено)')
  process.exit(0)
}

// ═══════════════════════════════════════
// Проверяем prod paths из main.js
// ═══════════════════════════════════════
console.log('── Preload файлы: ──')
var preloads = ['index', 'monitor', 'notification', 'pin', 'pin-dock']
for (var i = 0; i < preloads.length; i++) {
  var name = preloads[i]
  // electron-vite 5 собирает как .mjs
  var mjsPath = 'out/preload/' + name + '.mjs'
  var jsPath = 'out/preload/' + name + '.js'
  test('preload/' + name + ' существует', function() {
    assert(fs.existsSync(mjsPath) || fs.existsSync(jsPath), 'Нет ' + mjsPath + ' и ' + jsPath)
  })
}

console.log('\n── HTML файлы: ──')
var htmlFiles = [
  'out/main/notification.html',
  'out/main/pin-notification.html',
  'out/main/pin-dock.html',
  'out/renderer/index.html',
]
for (var h = 0; h < htmlFiles.length; h++) {
  var hf = htmlFiles[h]
  test(hf.replace('out/', ''), function() { assert(fs.existsSync(hf), 'Нет ' + hf) })
}

console.log('\n── Hook файлы: ──')
var hooks = ['telegram', 'max', 'whatsapp', 'vk']
for (var hi = 0; hi < hooks.length; hi++) {
  var hookFile = 'out/preloads/hooks/' + hooks[hi] + '.hook.js'
  test(hooks[hi] + '.hook.js', function() { assert(fs.existsSync(hookFile), 'Нет ' + hookFile) })
}

console.log('\n── Main bundle: ──')
test('out/main/main.js существует', function() { assert(fs.existsSync('out/main/main.js')) })
test('out/main/main.js > 10KB', function() {
  var size = fs.statSync('out/main/main.js').size
  assert(size > 10000, 'Слишком маленький: ' + size + ' bytes')
})

// ═══════════════════════════════════════
// Проверяем что main.js prod paths совпадают с реальными файлами
// ═══════════════════════════════════════
console.log('\n── Prod paths в коде: ──')
var mainCode = fs.readFileSync('main/main.js', 'utf8')
var dockCode = fs.existsSync('main/handlers/dockPinHandlers.js') ? fs.readFileSync('main/handlers/dockPinHandlers.js', 'utf8') : ''
var allCode = mainCode + '\n' + dockCode

// Ищем все prod paths: ../preload/*.ext, ../main/*.html, ../preloads/hooks
var prodPaths = []
for (var m of allCode.matchAll(/path\.join\(__dirname,\s*'\.\.\/([^']+)'\)/g)) {
  if (!m[1].includes('../../')) prodPaths.push(m[1]) // только prod paths (без isDev)
}

test('Все prod paths ведут к существующим файлам', function() {
  var missing = []
  for (var pi = 0; pi < prodPaths.length; pi++) {
    var pp = prodPaths[pi]
    var fullPath = 'out/' + pp
    // Hooks читаются через fs.readFileSync динамически — проверяем директорию
    if (pp.includes('hooks')) continue
    if (!fs.existsSync(fullPath)) missing.push(pp + ' → ' + fullPath)
  }
  assert(missing.length === 0, 'Отсутствуют:\n  ' + missing.join('\n  '))
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
