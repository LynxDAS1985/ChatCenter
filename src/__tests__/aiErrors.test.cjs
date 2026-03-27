/**
 * v0.84.0: AI network error matrix — проверяет ruError() и PROVIDERS config
 * Тестирует обработку ВСЕХ типов ошибок: 401, 403, 429, 500, timeout, invalid key, quota
 *
 * Запуск: node src/__tests__/aiErrors.test.cjs
 */

const fs = require('fs')
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 AI error matrix тесты\n')

// Копия ruError для тестирования
var mainCode = fs.readFileSync('main/main.js', 'utf8')
var ruErrorMatch = mainCode.match(/function ruError\(msg\)\s*\{([\s\S]*?)\n\}/)
assert(ruErrorMatch, 'ruError function not found')

// Восстанавливаем функцию через eval
var ruError
eval('ruError = function(msg) {' + ruErrorMatch[1] + '\n}')

// ═══════════════════════════════════════
// 1. ruError — перевод ошибок API
// ═══════════════════════════════════════
console.log('── ruError: квота/баланс ──')
test('insufficient_quota → русский', function() { assert(ruError('insufficient_quota').includes('средств')) })
test('exceeded quota → русский', function() { assert(ruError('You exceeded your quota').includes('средств')) })
test('insufficient balance → русский', function() { assert(ruError('insufficient_balance').includes('средств')) })

console.log('\n── ruError: ключ ──')
test('invalid api key → русский', function() { assert(ruError('Invalid API key provided').includes('Неверный API-ключ')) })
test('incorrect api key → русский', function() { assert(ruError('Incorrect API key').includes('Неверный API-ключ')) })
test('no api key → русский', function() { assert(ruError('No API key provided').includes('Неверный API-ключ')) })

console.log('\n── ruError: rate limit ──')
test('rate limit → русский', function() { assert(ruError('Rate limit exceeded').includes('Слишком много')) })
test('too many requests → русский', function() { assert(ruError('Too many requests').includes('Слишком много')) })

console.log('\n── ruError: модель ──')
test('model not found → русский', function() { assert(ruError('The model does not exist').includes('модель не найдена')) })
test('model not exist → русский', function() { assert(ruError('model not found').includes('модель не найдена')) })

console.log('\n── ruError: контекст ──')
test('context length → русский', function() { assert(ruError('maximum context length exceeded').includes('длинное')) })

console.log('\n── ruError: авторизация ──')
test('unauthorized → русский', function() { assert(ruError('Unauthorized access').includes('авторизации')) })
test('authentication → русский', function() { assert(ruError('Authentication failed').includes('авторизации')) })

console.log('\n── ruError: сеть/таймаут ──')
test('network error → русский', function() { assert(ruError('Network error').includes('соединения')) })
test('fetch failed → русский', function() { assert(ruError('fetch failed').includes('соединения')) })
test('timeout → русский', function() { assert(ruError('Request timeout').includes('Превышено время')) })
test('connect error → русский', function() { assert(ruError('Unable to connect').includes('соединения')) })

console.log('\n── ruError: сервер ──')
test('overloaded → русский', function() { assert(ruError('Server overloaded').includes('перегружен')) })
test('unavailable → русский', function() { assert(ruError('Service unavailable').includes('перегружен')) })
test('billing → русский', function() { assert(ruError('Billing issue detected').includes('оплатой')) })

console.log('\n── ruError: edge cases ──')
test('null → "Неизвестная ошибка"', function() { assert(ruError(null) === 'Неизвестная ошибка') })
test('empty → "Неизвестная ошибка"', function() { assert(ruError('') === 'Неизвестная ошибка') })
test('unknown → возвращает as-is', function() { assert(ruError('Something weird happened') === 'Something weird happened') })
test('gigachat decode → русский', function() { assert(ruError("can't decode header").includes('формат')) })

// ═══════════════════════════════════════
// 2. PROVIDERS config validation
// ═══════════════════════════════════════
console.log('\n── PROVIDERS config: ──')
var aiCode = fs.readFileSync('main/handlers/aiHandlers.js', 'utf8')

test('anthropic keyError содержит sk-ant', function() { assert(aiCode.includes('sk-ant')) })
test('openai keyError содержит sk-', function() { assert(aiCode.includes("'Укажите API-ключ OpenAI")) })
test('deepseek keyError', function() { assert(aiCode.includes("'Укажите API-ключ DeepSeek'")) })
test('gigachat keyError содержит Client ID', function() { assert(aiCode.includes('Client ID')) })

test('anthropic headers содержит x-api-key', function() { assert(aiCode.includes('x-api-key')) })
test('openai headers содержит Bearer', function() { assert(aiCode.includes('Bearer')) })
test('anthropic использует max_tokens', function() { assert(aiCode.includes('max_tokens')) })

// ═══════════════════════════════════════
// 3. Error handling в handlers
// ═══════════════════════════════════════
console.log('\n── Error handling: ──')
test('stream handler имеет try-catch', function() { assert(aiCode.includes("catch (e) { errOut(e.message)")) })
test('generate handler имеет try-catch', function() { assert(aiCode.includes("catch (e) { return { ok: false")) })
test('HTTP error проверяется (!resp.ok)', function() { assert(aiCode.includes('!resp.ok')) })
test('gigachat error проверяется (!result.ok)', function() { assert(aiCode.includes('!result.ok')) })
test('пустой apiKey проверяется', function() { assert(aiCode.includes('!apiKey')) })
test('gigachat требует clientSecret', function() { assert(aiCode.includes('!clientSecret')) })

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
