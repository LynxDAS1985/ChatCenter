/**
 * Тесты логики handleNewMessage — дедуп, sender-strip, own-msg filter.
 * Тестирует логику БЕЗ React — чистые функции.
 *
 * Запуск: node src/__tests__/handleNewMessage.test.js
 */

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты handleNewMessage логики\\n')

// ── Дедуп по подстроке ──
console.log('── Дедуп по подстроке: ──')

function isSubstringDedup(prevText, newText) {
  if (prevText.length > 5 && newText.length > 5) {
    return prevText.includes(newText) || newText.includes(prevText)
  }
  return false
}

test('Parent содержит child', () => assert(isSubstringDedup('Елена ДугинаДа мельком', 'Да мельком') === true))
test('Child содержит parent', () => assert(isSubstringDedup('Да мельком', 'Елена ДугинаДа мельком') === true))
test('Разные тексты', () => assert(isSubstringDedup('Привет как дела', 'Что нового') === false))
test('Короткие (<= 5) — НЕ dedup', () => assert(isSubstringDedup('Привет', 'При') === false))
test('Одинаковые', () => assert(isSubstringDedup('Тест сообщения', 'Тест сообщения') === true))
test('Ozon full vs short', () => assert(isSubstringDedup(
  'Елена ДугинаНо это все накладно выходит, билеты туда обратно',
  'Но это все накладно выходит, билеты туда обратно'
) === true))

// ── Sender-strip ──
console.log('\\n── Sender-strip (убрать имя из текста): ──')

function senderStrip(text, senderName) {
  if (senderName && senderName.length >= 3 && text.startsWith(senderName)) {
    return text.slice(senderName.length).trim()
  }
  return text
}

test('Убирает имя sender', () => assert(senderStrip('Елена ДугинаДа мельком', 'Елена Дугина') === 'Да мельком'))
test('Не трогает если не начинается с sender', () => assert(senderStrip('Алексей Дугинхорошо', 'Елена Дугина') === 'Алексей Дугинхорошо'))
test('Пустой sender', () => assert(senderStrip('Тест', '') === 'Тест'))
test('Короткий sender (<3)', () => assert(senderStrip('АбТекст', 'Аб') === 'АбТекст'))
test('Sender = весь текст', () => assert(senderStrip('Елена Дугина', 'Елена Дугина') === ''))

// ── Own-msg filter ──
console.log('\\n── Own-msg filter (фильтр своих сообщений): ──')

function isOwnMessage(text, senderName, fromNotifAPI) {
  if (!senderName || senderName.length < 3 || fromNotifAPI) return false
  if (text.startsWith(senderName)) return false  // чужое
  // Текст начинается с "Имя Фамилия" но НЕ с sender → своё
  return /^[А-ЯA-Z][а-яa-z]+\s[А-ЯA-Z][а-яa-z]/.test(text)
}

test('Чужое (начинается с sender)', () => assert(isOwnMessage('Елена ДугинаТекст', 'Елена Дугина') === false))
test('Своё (начинается с другого имени)', () => assert(isOwnMessage('Алексей Дугинхорошо', 'Елена Дугина') === true))
test('Просто текст (без имени)', () => assert(isOwnMessage('Привет как дела', 'Елена Дугина') === false))
test('fromNotifAPI → пропускаем', () => assert(isOwnMessage('Алексей Дугинхорошо', 'Елена Дугина', true) === false))
test('Пустой sender → пропускаем', () => assert(isOwnMessage('Алексей Дугинхорошо', '') === false))
test('Число → не своё', () => assert(isOwnMessage('1220', 'Елена Дугина') === false))
test('Латиница имя', () => assert(isOwnMessage('John Doetext', 'Elena Dugina') === true))
test('Одно слово → не своё', () => assert(isOwnMessage('Алексейхорошо', 'Елена Дугина') === false))
test('Имя без фамилии → не своё', () => assert(isOwnMessage('Алексей хорошо', 'Елена Дугина') === false))

// ── Интеграция: полный pipeline ──
console.log('\\n── Pipeline интеграция: ──')

function processMessage(text, senderName, fromNotifAPI) {
  // 1. Spam check (simplified)
  if (/^(typing|печатает|online)$/i.test(text)) return { result: 'spam' }

  // 2. Sender strip
  let cleanText = text
  if (senderName && senderName.length >= 3 && text.startsWith(senderName)) {
    cleanText = text.slice(senderName.length).trim()
    if (!cleanText) return { result: 'empty-after-strip' }
  }

  // 3. Own-msg filter
  if (senderName && senderName.length >= 3 && !fromNotifAPI && !text.startsWith(senderName) && /^[А-ЯA-Z][а-яa-z]+\s[А-ЯA-Z][а-яa-z]/.test(text)) {
    return { result: 'own-msg' }
  }

  return { result: 'pass', text: cleanText }
}

test('Спам → блок', () => assert(processMessage('печатает', 'Елена Дугина').result === 'spam'))
test('Чужое с именем → strip → pass', () => {
  const r = processMessage('Елена ДугинаТекст', 'Елена Дугина')
  assert(r.result === 'pass' && r.text === 'Текст')
})
test('Своё → own-msg', () => assert(processMessage('Алексей Дугинхорошо', 'Елена Дугина').result === 'own-msg'))
test('Чистый текст → pass', () => {
  const r = processMessage('Привет', 'Елена Дугина')
  assert(r.result === 'pass' && r.text === 'Привет')
})
test('Только имя sender → empty', () => assert(processMessage('Елена Дугина', 'Елена Дугина').result === 'empty-after-strip'))

console.log(`\\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
