const fs = require('fs')

const bootProbe = fs.readFileSync('src/boot-probe.js', 'utf8')
const mainEntry = fs.readFileSync('src/main.jsx', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const nativeApp = fs.readFileSync('src/native/NativeApp.jsx', 'utf8')
const windowManager = fs.readFileSync('main/utils/windowManager.js', 'utf8')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log('  ✅ ' + name)
  } catch (err) {
    failed += 1
    console.log('  ❌ ' + name + ': ' + err.message)
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

console.log('\n🧪 Startup diagnostics contract\n')

test('main window logs slow and pending Chromium/Vite requests', () => {
  assert(windowManager.includes('dev-request slow'), 'missing slow request log')
  assert(windowManager.includes('dev-request pending'), 'missing pending request log')
  assert(windowManager.includes('dev-request summary'), 'missing request summary log')
  assert(windowManager.includes('ready-to-show'), 'missing ready-to-show summary hook')
})

test('boot-probe logs browser resource timing and long tasks', () => {
  assert(bootProbe.includes('__ccStartupSummary'), 'missing resource summary helper')
  assert(bootProbe.includes("performance.getEntriesByType('resource')"), 'missing resource timing')
  assert(bootProbe.includes("'longtask'"), 'missing longtask observer')
  assert(bootProbe.includes('DOMContentLoaded'), 'missing DOMContentLoaded mark')
  assert(bootProbe.includes('window load'), 'missing window load mark')
})

test('main renderer entry logs React root and first frame', () => {
  assert(mainEntry.includes('parallel imports start'), 'missing parallel imports start mark')
  assert(mainEntry.includes('Promise.all'), 'startup imports should be parallelized')
  assert(mainEntry.includes('parallel imports done'), 'missing parallel imports done mark')
  assert(mainEntry.includes('root element'), 'missing root element mark')
  assert(mainEntry.includes('react root created'), 'missing createRoot mark')
  assert(mainEntry.includes('render scheduled'), 'missing render scheduled mark')
  assert(mainEntry.includes('first requestAnimationFrame after render'), 'missing first RAF mark')
})

test('App and NativeApp log render/mount milestones', () => {
  assert(app.includes('component:App'), 'missing App startup marks')
  assert(app.includes('first render start'), 'missing App first render mark')
  assert(app.includes('App-mounted'), 'missing App mounted summary')
  assert(app.includes("import('./native/NativeApp.jsx')"), 'missing NativeApp lazy import')
  assert(app.includes('lazy import requested'), 'missing NativeApp lazy import request mark')
  assert(app.includes('lazy import resolved'), 'missing NativeApp lazy import resolve mark')
  assert(nativeApp.includes('component:NativeApp'), 'missing NativeApp startup marks')
  assert(nativeApp.includes('NativeApp-mounted'), 'missing NativeApp mounted summary')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
