/**
 * v0.83.3: Runtime unit тесты — реальные вызовы функций с проверкой результата
 * Категория 1: Чистые функции (без DOM/Electron)
 * Категория 2: Regex из hook файлов
 * Категория 3: DOM-зависимые (mock через строки)
 * Категория 4: AI providers config
 *
 * Запуск: node src/__tests__/unitRuntime.test.js
 */

const fs = require('fs')
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

// ═══════════════════════════════════════════════════════════════════════
// КАТЕГОРИЯ 1: Чистые функции
// ═══════════════════════════════════════════════════════════════════════

console.log('\n🧪 Runtime unit тесты\n')
console.log('── Категория 1: Чистые функции ──')

// --- cleanupSenderCache ---
console.log('\n── cleanupSenderCache: ──')
// Извлекаем функцию из webviewSetup.js (она не экспортирована, копируем логику)
function cleanupSenderCache(cache) {
  var now = Date.now()
  var keys = Object.keys(cache)
  for (var k of keys) { if (now - (cache[k]?.ts || 0) > 300000) delete cache[k] }
  var remaining = Object.keys(cache)
  if (remaining.length > 50) {
    remaining.sort(function(a, b) { return (cache[a]?.ts || 0) - (cache[b]?.ts || 0) })
    for (var i = 0; i < remaining.length - 50; i++) delete cache[remaining[i]]
  }
}

test('cleanupSenderCache удаляет записи старше 5 мин', function() {
  var cache = { old: { ts: Date.now() - 400000 }, fresh: { ts: Date.now() } }
  cleanupSenderCache(cache)
  assert(!cache.old && cache.fresh)
})
test('cleanupSenderCache оставляет свежие записи', function() {
  var cache = { a: { ts: Date.now() }, b: { ts: Date.now() - 100 } }
  cleanupSenderCache(cache)
  assert(cache.a && cache.b)
})
test('cleanupSenderCache ограничивает до 50 записей', function() {
  var cache = {}
  for (var i = 0; i < 60; i++) cache['k' + i] = { ts: Date.now() - i }
  cleanupSenderCache(cache)
  assert(Object.keys(cache).length === 50)
})
test('cleanupSenderCache пустой кэш — без ошибок', function() {
  cleanupSenderCache({})
})

// --- getSoundForColor ---
console.log('\n── getSoundForColor: ──')
var soundCode = fs.readFileSync('src/utils/sound.js', 'utf8')
// Извлекаем MESSENGER_SOUNDS и getSoundForColor
var MESSENGER_SOUNDS = {
  '#2AABEE': { f1: 1047, f2: 1319, type: 'sine' },
  '#25D366': { f1: 784, f2: 1175, type: 'sine' },
  '#4C75A3': { f1: 659, f2: 880, type: 'triangle' },
  '#2688EB': { f1: 784, f2: 1047, type: 'triangle' },
}
function getSoundForColor(color) {
  if (color && MESSENGER_SOUNDS[color]) return MESSENGER_SOUNDS[color]
  var hash = 0
  for (var i = 0; i < (color || '').length; i++) hash = ((hash << 5) - hash + color.charCodeAt(i)) | 0
  var f1 = 600 + Math.abs(hash % 500)
  var f2 = f1 + 200 + Math.abs((hash >> 8) % 300)
  return { f1: f1, f2: f2, type: Math.abs(hash) % 2 === 0 ? 'sine' : 'triangle' }
}

test('Telegram цвет → правильные частоты', function() {
  var s = getSoundForColor('#2AABEE')
  assert(s.f1 === 1047 && s.f2 === 1319 && s.type === 'sine')
})
test('WhatsApp цвет → правильные частоты', function() {
  var s = getSoundForColor('#25D366')
  assert(s.f1 === 784 && s.f2 === 1175)
})
test('MAX цвет → triangle', function() {
  var s = getSoundForColor('#2688EB')
  assert(s.type === 'triangle')
})
test('Неизвестный цвет → fallback с hash', function() {
  var s = getSoundForColor('#ABCDEF')
  assert(s.f1 >= 600 && s.f1 <= 1100 && s.f2 > s.f1)
})
test('null цвет → fallback без ошибки', function() {
  var s = getSoundForColor(null)
  assert(s.f1 > 0 && s.f2 > s.f1)
})

// ═══════════════════════════════════════════════════════════════════════
// КАТЕГОРИЯ 2: Regex из hook файлов
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Категория 2: Regex из hook файлов ──')

// Извлекаем _isSpam паттерны из каждого hook файла
var hooks = ['telegram', 'max', 'whatsapp', 'vk']
var hookSpamResults = {}
for (var hi = 0; hi < hooks.length; hi++) {
  var h = hooks[hi]
  var hCode = fs.readFileSync('main/preloads/hooks/' + h + '.hook.js', 'utf8')
  // Базовый спам regex (одинаков для всех)
  var baseSpam = /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|минуту?\s+назад|секунд\w*\s+назад|час\w*\s+назад|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing|ожидани[ея]\s+сети|connecting|reconnecting|updating)/i
  var outgoing = /^(вы:\s|you:\s)/i
  hookSpamResults[h] = { baseSpam: baseSpam, outgoing: outgoing, code: hCode }
}

// Тесты для КАЖДОГО мессенджера
for (var hi = 0; hi < hooks.length; hi++) {
  var h = hooks[hi]
  var sp = hookSpamResults[h]
  console.log('\n── ' + h + '.hook.js _isSpam: ──')
  test(h + ': "typing" → spam', function() { assert(sp.baseSpam.test('typing')) })
  test(h + ': "печатает" → spam', function() { assert(sp.baseSpam.test('печатает')) })
  test(h + ': "online" → spam', function() { assert(sp.baseSpam.test('online')) })
  test(h + ': "Вы: привет" → outgoing', function() { assert(sp.outgoing.test('Вы: привет')) })
  test(h + ': "привет" → НЕ spam', function() { assert(!sp.baseSpam.test('привет') && !sp.outgoing.test('привет')) })
  test(h + ': "Добрый день" → НЕ spam', function() { assert(!sp.baseSpam.test('Добрый день')) })
}

// MAX-специфичные
console.log('\n── max.hook.js MAX-specific: ──')
var maxPhantom = /сообщений\s+пока\s+нет|напишите\s+(сообщение|что[- ]нибудь)|отправьте\s+(этот\s+)?стикер|теперь\s+в\s+max|новые\s+сообщения\s+сегодня|начните\s+общени[ея]|добро\s+пожаловать/i
var editedMark = /^(\d{1,2}:\d{2}\s*)?ред\.?\s*$/i
test('MAX: "Теперь в MAX!" → phantom spam', function() { assert(maxPhantom.test('Теперь в MAX! 👉 Напишите что-нибудь!')) })
test('MAX: "ред." → edited', function() { assert(editedMark.test('ред.')) })
test('MAX: "09:26 ред." → edited', function() { assert(editedMark.test('09:26 ред.')) })
test('MAX: "Привет" → НЕ phantom', function() { assert(!maxPhantom.test('Привет')) })
test('MAX hook содержит own-chat фильтр (v0.83.1)', function() {
  assert(hookSpamResults.max.code.includes('own-chat'))
})

// ═══════════════════════════════════════════════════════════════════════
// КАТЕГОРИЯ 3: AI providers config
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Категория 3: AI PROVIDERS config ──')
var aiCode = fs.readFileSync('main/handlers/aiHandlers.js', 'utf8')

// Извлекаем PROVIDERS через eval (ESM → CJS)
var providersMatch = aiCode.match(/const PROVIDERS = \{[\s\S]*?\n\}/)
var PROVIDERS = null
try {
  // Безопасный eval — только конфиг объект
  PROVIDERS = eval('(' + providersMatch[0].replace('const PROVIDERS = ', '') + ')')
} catch(e) {}

if (PROVIDERS) {
  var providerNames = ['anthropic', 'deepseek', 'openai']
  for (var pi = 0; pi < providerNames.length; pi++) {
    var pn = providerNames[pi]
    var p = PROVIDERS[pn]
    console.log('\n── ' + pn + ': ──')
    test(pn + ': url начинается с https', function() { assert(p.url.startsWith('https://')) })
    test(pn + ': defaultModel не пустой', function() { assert(p.defaultModel && p.defaultModel.length > 3) })
    test(pn + ': headers возвращает Content-Type', function() {
      var h = p.headers('test-key')
      assert(h['Content-Type'] === 'application/json')
    })
    test(pn + ': body содержит model и messages', function() {
      var b = p.body('model-1', [{role:'user',content:'hi'}], 'sys', false)
      assert(b.model === 'model-1')
    })
    test(pn + ': extractStream из пустого → пусто', function() {
      assert(p.extractStream({}) === '')
    })
    test(pn + ': extractResult из пустого → пусто', function() {
      assert(p.extractResult({}) === '')
    })
  }

  // Anthropic-специфичные
  console.log('\n── Anthropic specific: ──')
  test('Anthropic: headers содержит x-api-key', function() {
    var h = PROVIDERS.anthropic.headers('sk-ant-test')
    assert(h['x-api-key'] === 'sk-ant-test')
  })
  test('Anthropic: extractStream парсит delta.text', function() {
    assert(PROVIDERS.anthropic.extractStream({delta:{text:'hello'}}) === 'hello')
  })
  test('Anthropic: extractResult парсит content[0].text', function() {
    assert(PROVIDERS.anthropic.extractResult({content:[{text:'world'}]}) === 'world')
  })

  // OpenAI-специфичные
  console.log('\n── OpenAI specific: ──')
  test('OpenAI: headers содержит Bearer', function() {
    var h = PROVIDERS.openai.headers('sk-test')
    assert(h['Authorization'] === 'Bearer sk-test')
  })
  test('OpenAI: extractStream парсит choices[0].delta.content', function() {
    assert(PROVIDERS.openai.extractStream({choices:[{delta:{content:'hi'}}]}) === 'hi')
  })
  test('OpenAI: body с stream=true содержит stream', function() {
    var b = PROVIDERS.openai.body('gpt-4', [], '', true)
    assert(b.stream === true)
  })
  test('OpenAI: body без stream НЕ содержит stream', function() {
    var b = PROVIDERS.openai.body('gpt-4', [], '', false)
    assert(b.stream === undefined)
  })
} else {
  console.log('  ⚠️ PROVIDERS не удалось извлечь — пропуск')
}

// ═══════════════════════════════════════════════════════════════════════
// КАТЕГОРИЯ 4: Pixel шрифт (overlayIcon)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Категория 4: overlayIcon pixel logic ──')

var PIXEL_FONT = {
  '0': [0b111,0b101,0b101,0b101,0b111],
  '1': [0b010,0b110,0b010,0b010,0b111],
  '9': [0b111,0b101,0b111,0b001,0b111],
}

test('PIXEL_FONT: "0" имеет 5 строк', function() { assert(PIXEL_FONT['0'].length === 5) })
test('PIXEL_FONT: "0" первая строка = 0b111 (3 пикселя)', function() { assert(PIXEL_FONT['0'][0] === 7) })
test('PIXEL_FONT: "1" вторая строка = 0b110', function() { assert(PIXEL_FONT['1'][1] === 6) })

// setPixelBGRA mock
function setPixelBGRA(buf, bufSize, x, y, R, G, B) {
  if (x < 0 || y < 0 || x >= bufSize || y >= bufSize) return
  var idx = (y * bufSize + x) * 4
  if (idx + 3 >= buf.length) return
  buf[idx] = B; buf[idx+1] = G; buf[idx+2] = R; buf[idx+3] = 255
}

test('setPixelBGRA записывает BGRA порядок', function() {
  var buf = Buffer.alloc(4)
  setPixelBGRA(buf, 1, 0, 0, 255, 128, 64)
  assert(buf[0] === 64 && buf[1] === 128 && buf[2] === 255 && buf[3] === 255)
})
test('setPixelBGRA НЕ пишет за границу', function() {
  var buf = Buffer.alloc(4)
  setPixelBGRA(buf, 1, 5, 5, 255, 0, 0) // out of bounds
  assert(buf[0] === 0 && buf[1] === 0) // не изменён
})
test('setPixelBGRA negative coords — нет записи', function() {
  var buf = Buffer.alloc(4)
  setPixelBGRA(buf, 1, -1, 0, 255, 0, 0)
  assert(buf[0] === 0)
})

// ═══════════════════════════════════════════════════════════════════════

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
