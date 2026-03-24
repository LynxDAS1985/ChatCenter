/**
 * Тесты messageProcessing — чистые функции обработки сообщений.
 *
 * Запуск: node src/__tests__/messageProcessing.test.js
 */

// Копии функций (для автономного запуска без ESM)
function isDuplicateExact(messengerId, text, recentMap, ttlMs) {
  ttlMs = ttlMs || 10000
  const key = messengerId + ':' + text.slice(0, 60)
  const now = Date.now()
  const prev = recentMap.get(key)
  if (prev && now - prev < ttlMs) return { blocked: true, age: now - prev }
  return { blocked: false, key, now }
}

function isDuplicateSubstring(messengerId, text, recentMap, ttlMs) {
  ttlMs = ttlMs || 5000
  const textShort = text.slice(0, 80)
  const now = Date.now()
  const prefix = messengerId + ':'
  for (const [k, ts] of recentMap) {
    if (now - ts > ttlMs || !k.startsWith(prefix)) continue
    const prevText = k.slice(prefix.length)
    if (prevText.length > 5 && textShort.length > 5 && (prevText.includes(textShort) || textShort.includes(prevText))) {
      return { blocked: true, prevLen: prevText.length, age: now - ts }
    }
  }
  return { blocked: false }
}

function stripSenderFromText(text, senderName) {
  if (!senderName || senderName.length < 3) return { text: text, stripped: false }
  if (text.startsWith(senderName)) {
    var clean = text.slice(senderName.length).trim()
    return { text: clean, stripped: true }
  }
  return { text: text, stripped: false }
}

function isOwnMessage(text, senderName, fromNotifAPI) {
  if (!senderName || senderName.length < 3 || fromNotifAPI) return false
  if (text.startsWith(senderName)) return false
  return /^[А-ЯA-Z][а-яa-z]+\s[А-ЯA-Z][а-яa-z]/.test(text)
}

function cleanupRecentMap(recentMap, ttlMs) {
  ttlMs = ttlMs || 30000
  var now = Date.now()
  if (recentMap.size > 50) {
    for (var entry of recentMap) { if (now - entry[1] > ttlMs) recentMap.delete(entry[0]) }
  }
}

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты messageProcessing\\n')

// ── isDuplicateExact ──
console.log('── isDuplicateExact: ──')

test('Первое сообщение → не дубль', function() {
  var m = new Map()
  assert(isDuplicateExact('tg', 'Привет', m).blocked === false)
})

test('Повторное сообщение → дубль', function() {
  var m = new Map()
  m.set('tg:Привет', Date.now())
  assert(isDuplicateExact('tg', 'Привет', m).blocked === true)
})

test('Старое сообщение (>10с) → не дубль', function() {
  var m = new Map()
  m.set('tg:Привет', Date.now() - 15000)
  assert(isDuplicateExact('tg', 'Привет', m).blocked === false)
})

test('Другой мессенджер → не дубль', function() {
  var m = new Map()
  m.set('vk:Привет', Date.now())
  assert(isDuplicateExact('tg', 'Привет', m).blocked === false)
})

test('Длинный текст обрезается до 60', function() {
  var m = new Map()
  var long = 'А'.repeat(100)
  var r = isDuplicateExact('tg', long, m)
  assert(r.key === 'tg:' + 'А'.repeat(60))
})

// ── isDuplicateSubstring ──
console.log('\\n── isDuplicateSubstring: ──')

test('Parent содержит child → дубль', function() {
  var m = new Map()
  m.set('vk:Елена ДугинаДа мельком что нового', Date.now())
  assert(isDuplicateSubstring('vk', 'Да мельком что нового', m).blocked === true)
})

test('Child содержит parent → дубль', function() {
  var m = new Map()
  m.set('vk:Да мельком что нового', Date.now())
  assert(isDuplicateSubstring('vk', 'Елена ДугинаДа мельком что нового', m).blocked === true)
})

test('Разные тексты → не дубль', function() {
  var m = new Map()
  m.set('vk:Привет как дела', Date.now())
  assert(isDuplicateSubstring('vk', 'Что нового у тебя', m).blocked === false)
})

test('Короткие тексты (<=5) → не дубль', function() {
  var m = new Map()
  m.set('vk:Ок', Date.now())
  assert(isDuplicateSubstring('vk', 'Ок', m).blocked === false)
})

test('Старый (>5с) → не дубль', function() {
  var m = new Map()
  m.set('vk:Елена ДугинаДа мельком', Date.now() - 6000)
  assert(isDuplicateSubstring('vk', 'Да мельком', m).blocked === false)
})

test('Другой мессенджер → не дубль', function() {
  var m = new Map()
  m.set('tg:Елена ДугинаДа мельком', Date.now())
  assert(isDuplicateSubstring('vk', 'Да мельком', m).blocked === false)
})

// ── stripSenderFromText ──
console.log('\\n── stripSenderFromText: ──')

test('Убирает sender', function() {
  var r = stripSenderFromText('Елена ДугинаТекст', 'Елена Дугина')
  assert(r.stripped === true && r.text === 'Текст')
})

test('Не трогает если не начинается', function() {
  var r = stripSenderFromText('Алексей Дугинхорошо', 'Елена Дугина')
  assert(r.stripped === false && r.text === 'Алексей Дугинхорошо')
})

test('Пустой sender', function() {
  var r = stripSenderFromText('Текст', '')
  assert(r.stripped === false)
})

test('Короткий sender', function() {
  var r = stripSenderFromText('АбТекст', 'Аб')
  assert(r.stripped === false)
})

test('Sender = весь текст → пустой', function() {
  var r = stripSenderFromText('Елена Дугина', 'Елена Дугина')
  assert(r.stripped === true && r.text === '')
})

test('Sender с пробелами после → trim', function() {
  var r = stripSenderFromText('Елена Дугина  Текст с пробелами', 'Елена Дугина')
  assert(r.stripped === true && r.text === 'Текст с пробелами')
})

// ── isOwnMessage ──
console.log('\\n── isOwnMessage: ──')

test('Чужое (начинается с sender)', function() { assert(isOwnMessage('Елена ДугинаТекст', 'Елена Дугина') === false) })
test('Своё (другое имя)', function() { assert(isOwnMessage('Алексей Дугинхорошо', 'Елена Дугина') === true) })
test('Просто текст', function() { assert(isOwnMessage('Привет как дела', 'Елена Дугина') === false) })
test('fromNotifAPI → false', function() { assert(isOwnMessage('Алексей Дугинхорошо', 'Елена Дугина', true) === false) })
test('Пустой sender', function() { assert(isOwnMessage('Алексей Дугинхорошо', '') === false) })
test('Число', function() { assert(isOwnMessage('1220', 'Елена Дугина') === false) })
test('Latin name', function() { assert(isOwnMessage('John Doetext', 'Elena Dugina') === true) })
test('Одно слово', function() { assert(isOwnMessage('Алексейхорошо', 'Елена Дугина') === false) })

// ── cleanupRecentMap ──
console.log('\\n── cleanupRecentMap: ──')

test('Не чистит если <50', function() {
  var m = new Map()
  for (var i = 0; i < 30; i++) m.set('k' + i, Date.now() - 60000)
  cleanupRecentMap(m)
  assert(m.size === 30)
})

test('Чистит старые если >50', function() {
  var m = new Map()
  for (var i = 0; i < 60; i++) m.set('k' + i, Date.now() - 60000) // все старые
  cleanupRecentMap(m)
  assert(m.size === 0)
})

test('Оставляет свежие при >50', function() {
  var m = new Map()
  for (var i = 0; i < 55; i++) m.set('old' + i, Date.now() - 60000)
  m.set('fresh1', Date.now())
  m.set('fresh2', Date.now())
  cleanupRecentMap(m)
  assert(m.size === 2, 'size=' + m.size)
})

// ── cleanSenderStatus ──
console.log('\\n── cleanSenderStatus: ──')

function cleanSenderStatus(name) {
  if (!name) return name
  return name.replace(/\s*(online|offline|был[аи]?\s*(в\s+сети)?|в\s+сети|заходил[аи]?\s+.*назад|печатает|typing|записывает голосовое)\s*$/i, '').trim()
}

test('Убирает "заходила 6 минут назад"', function() { assert(cleanSenderStatus('Елена Дугиназаходила 6 минут назад') === 'Елена Дугина') })
test('Убирает "заходил 7 минут назад"', function() { assert(cleanSenderStatus('Artem Artemзаходил 7 минут назад') === 'Artem Artem') })
test('Убирает "заходил три минуты назад"', function() { assert(cleanSenderStatus('Сергей Пересыпкинзаходил три минуты назад') === 'Сергей Пересыпкин') })
test('Убирает "online"', function() { assert(cleanSenderStatus('Елена Дугинаonline') === 'Елена Дугина') })
test('Убирает "в сети"', function() { assert(cleanSenderStatus('Иван Иванов в сети') === 'Иван Иванов') })
test('Убирает "печатает"', function() { assert(cleanSenderStatus('Елена Дугинапечатает') === 'Елена Дугина') })
test('Не трогает чистое имя', function() { assert(cleanSenderStatus('Елена Дугина') === 'Елена Дугина') })
test('Null → null', function() { assert(cleanSenderStatus(null) === null) })
test('Пустое → пустое', function() { assert(cleanSenderStatus('') === '') })

// ── Структура модуля ──
console.log('\\n── Структура модуля: ──')
var fs = require('fs')
var code = fs.readFileSync('src/utils/messageProcessing.js', 'utf8')
test('Файл существует', function() { assert(code.length > 100) })
test('export isDuplicateExact', function() { assert(code.includes('export function isDuplicateExact')) })
test('export isDuplicateSubstring', function() { assert(code.includes('export function isDuplicateSubstring')) })
test('export stripSenderFromText', function() { assert(code.includes('export function stripSenderFromText')) })
test('export isOwnMessage', function() { assert(code.includes('export function isOwnMessage')) })
test('export cleanupRecentMap', function() { assert(code.includes('export function cleanupRecentMap')) })

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
