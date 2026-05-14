const assert = require('assert')
const fs = require('fs')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✅ ' + name)
  } catch (e) {
    failed++
    console.log('  ❌ ' + name + ': ' + e.message)
  }
}

console.log('\n🧪 webviewHealthProbe\n')

const code = fs.readFileSync('src/utils/webviewHealthProbe.js', 'utf8')

test('WebView probe делает сетевой fetch, а не только DOM-readiness', () => {
  assert(code.includes('await fetch('), 'probe должен делать сетевой fetch')
  assert(code.includes("probeKind: 'network-fetch'"), 'probe должен маркировать network-fetch')
})

test('WebView probe проверяет текущую страницу до favicon fallback', () => {
  assert(code.includes("label: 'current-page'"), 'первым кандидатом должен быть текущий URL вкладки')
  assert(code.includes("label: 'favicon'"), 'favicon должен быть только fallback')
  assert(code.indexOf("label: 'current-page'") < code.indexOf("label: 'favicon'"),
    'current-page должен идти раньше favicon')
})

test('WebView probe добавляет cache-bust nonce', () => {
  assert(code.includes('cc_health'), 'probe должен добавлять cache-bust query')
  assert(code.includes('Math.random()'), 'nonce должен отличаться даже при быстрых повторах')
})

test('WebView probe использует внутреннее probeMs из страницы', () => {
  assert(code.includes('outcome?.result?.probeMs'), 'lastMs должен брать probeMs из WebView')
  assert(code.includes('performance.now()'), 'время должно мериться внутри WebView')
})

test('WebView probe не перезагружает вкладку', () => {
  assert(!code.includes('.reload('), 'health probe не должен reload вкладку')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
