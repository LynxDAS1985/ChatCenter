/**
 * Тесты aiProviders — API ключи, провайдеры, конфигурации.
 *
 * Запуск: node src/__tests__/aiProviders.test.js
 */

var fs = require('fs')
var code = fs.readFileSync('src/utils/aiProviders.js', 'utf8')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

// Копии функций
function looksLikeApiKey(provider, text) {
  if (!text || text.length < 20) return false
  var t = text.trim()
  if (provider === 'openai')    return /^sk-[a-zA-Z0-9_\-]{20,}$/.test(t)
  if (provider === 'anthropic') return /^sk-ant-[a-zA-Z0-9_\-]{20,}$/.test(t)
  if (provider === 'deepseek')  return /^sk-[a-zA-Z0-9_\-]{20,}$/.test(t)
  if (provider === 'gigachat')  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(t)
  return t.startsWith('sk-') && t.length > 20
}

function isProviderConnected(settings, pid) {
  var pKeys = settings.aiProviderKeys || {}
  var pData = pKeys[pid] || {}
  if (pData.mode === 'webview') return true
  if (pid === 'gigachat') return !!(pData.apiKey && pData.clientSecret)
  return !!pData.apiKey
}

var isBillingError = function(err) {
  return !!err && (err.includes('средств') || err.includes('баланс') || err.includes('balance') || err.includes('insufficient'))
}

console.log('\\n🧪 Тесты aiProviders\\n')

// ── looksLikeApiKey ──
console.log('── looksLikeApiKey: ──')
test('OpenAI ключ', function() { assert(looksLikeApiKey('openai', 'sk-abcdefghijklmnopqrstuvwx') === true) })
test('OpenAI короткий', function() { assert(looksLikeApiKey('openai', 'sk-abc') === false) })
test('Anthropic ключ', function() { assert(looksLikeApiKey('anthropic', 'sk-ant-abcdefghijklmnopqrstuvwx') === true) })
test('GigaChat UUID', function() { assert(looksLikeApiKey('gigachat', '12345678-1234-1234-1234-123456789012') === true) })
test('GigaChat не UUID', function() { assert(looksLikeApiKey('gigachat', 'not-a-uuid-key') === false) })
test('Пустой текст', function() { assert(looksLikeApiKey('openai', '') === false) })
test('Null', function() { assert(looksLikeApiKey('openai', null) === false) })

// ── isProviderConnected ──
console.log('\\n── isProviderConnected: ──')
test('С ключом → connected', function() {
  assert(isProviderConnected({ aiProviderKeys: { openai: { apiKey: 'sk-test123456789012345' } } }, 'openai') === true)
})
test('Без ключа → not connected', function() {
  assert(isProviderConnected({ aiProviderKeys: {} }, 'openai') === false)
})
test('WebView mode → always connected', function() {
  assert(isProviderConnected({ aiProviderKeys: { openai: { mode: 'webview' } } }, 'openai') === true)
})
test('GigaChat нужны оба ключа', function() {
  assert(isProviderConnected({ aiProviderKeys: { gigachat: { apiKey: 'key' } } }, 'gigachat') === false)
  assert(isProviderConnected({ aiProviderKeys: { gigachat: { apiKey: 'key', clientSecret: 'secret' } } }, 'gigachat') === true)
})

// ── isBillingError ──
console.log('\\n── isBillingError: ──')
test('Баланс', function() { assert(isBillingError('Недостаточно средств на балансе') === true) })
test('Balance', function() { assert(isBillingError('Insufficient balance') === true) })
test('Обычная ошибка', function() { assert(isBillingError('Connection timeout') === false) })
test('Null', function() { assert(isBillingError(null) === false) })

// ── Структура модуля ──
console.log('\\n── Структура: ──')
test('export looksLikeApiKey', function() { assert(code.includes('export function looksLikeApiKey')) })
test('export PROVIDERS', function() { assert(code.includes('export const PROVIDERS')) })
test('export getProviderCfg', function() { assert(code.includes('export function getProviderCfg')) })
test('export isProviderConnected', function() { assert(code.includes('export function isProviderConnected')) })
test('4 провайдера', function() {
  assert(code.includes("'openai'") && code.includes("'anthropic'") && code.includes("'deepseek'") && code.includes("'gigachat'"))
})

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
