/**
 * Юнит-тесты для isSpamText — спам-фильтр сообщений.
 * Проверяет что UI-мусор блокируется, а реальные сообщения проходят.
 *
 * Запуск: node src/__tests__/isSpamText.test.js
 */

// v0.79.4: Читаем паттерны из shared/spamPatterns.json (единый источник)
var patternsRaw = require('../../shared/spamPatterns.json')
var SP = {}
for (var k in patternsRaw) {
  if (k.startsWith('_')) continue
  try { SP[k] = new RegExp(patternsRaw[k], 'i') } catch(e) {}
}

function isSpamText(text, source) {
  if (!text) return true
  if (SP.time && SP.time.test(text)) return true
  if (SP.date && SP.date.test(text)) return true
  if (SP.weekdays && SP.weekdays.test(text)) return true
  if (SP.statuses && SP.statuses.test(text)) return true
  if (SP.outgoing && SP.outgoing.test(text)) return true
  if (SP.statusSuffix && SP.statusSuffix.test(text)) return true
  if (SP.agoSuffix && SP.agoSuffix.test(text)) return true
  if (SP.agoExact && SP.agoExact.test(text)) return true
  if (SP.calls && SP.calls.test(text)) return true
  if (SP.system && SP.system.test(text)) return true
  if (source === 'msg') {
    if (SP.vkMenu && SP.vkMenu.test(text)) return true
    if (SP.vkMenuPartial && SP.vkMenuPartial.test(text) && text.length < 100) return true
    if (SP.whatsappAlt && SP.whatsappAlt.test(text.split(/\s/)[0]) && !/\s/.test(text.trim()) && text.length < 60) return true
  }
  return false
}

// ── Тесты ──────────────────────────────────────────────────────────────────

let passed = 0, failed = 0

// Проверка JSON
;(function() {
  var keys = Object.keys(SP)
  if (keys.length < 10) { console.log('  ❌ JSON: только ' + keys.length + ' паттернов (нужно >= 10)'); process.exit(1) }
  console.log('  ✅ JSON: ' + keys.length + ' паттернов загружено из shared/spamPatterns.json')
  passed++
})()

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ✅ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ❌ ${name}: ${e.message}`)
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed')
}

console.log('\\n🧪 Тесты isSpamText\\n')

// ── ДОЛЖЕН БЛОКИРОВАТЬ (спам) ──

console.log('── Должен блокировать: ──')

test('Время HH:MM', () => assert(isSpamText('12:30') === true))
test('Время HH:MM:SS', () => assert(isSpamText('12:30:45') === true))
test('Дата DD.MM.YYYY', () => assert(isSpamText('29.12.2025') === true))
test('Дата DD/MM/YY', () => assert(isSpamText('29/12/25') === true))
test('Вчера', () => assert(isSpamText('вчера') === true))
test('Сегодня', () => assert(isSpamText('Сегодня') === true))
test('Monday', () => assert(isSpamText('Monday') === true))
test('Понедельник', () => assert(isSpamText('понедельник') === true))
test('Печатает', () => assert(isSpamText('печатает') === true))
test('Typing', () => assert(isSpamText('typing') === true))
test('Online', () => assert(isSpamText('online') === true))
test('В сети', () => assert(isSpamText('в сети') === true))
test('Была в сети', () => assert(isSpamText('была в сети') === true))
test('Вы: текст', () => assert(isSpamText('Вы: привет') === true))
test('You: text', () => assert(isSpamText('You: hello') === true))
test('Текст + в сети', () => assert(isSpamText('Елена Дугина в сети') === true))
test('Текст + online', () => assert(isSpamText('Елена Дугина online') === true))
test('Текст + назад', () => assert(isSpamText('заходила 6 минут назад') === true))
test('5 непрочитанных', () => assert(isSpamText('5 непрочитанных') === true))
test('Connecting', () => assert(isSpamText('connecting') === true))
test('Пустой текст', () => assert(isSpamText('') === true))
test('null', () => assert(isSpamText(null) === true))

// MSG-специфичные
test('VK: Переслать (msg)', () => assert(isSpamText('переслать', 'msg') === true))
test('VK: Удалить (msg)', () => assert(isSpamText('удалить', 'msg') === true))
test('VK: Сообщение (msg)', () => assert(isSpamText('Сообщение', 'msg') === true))
test('WA: default-contact-refreshed (msg)', () => assert(isSpamText('default-contact-refreshed', 'msg') === true))
test('WA: status-dblcheckic-image (msg)', () => assert(isSpamText('status-dblcheckic-image', 'msg') === true))

// ── НЕ ДОЛЖЕН БЛОКИРОВАТЬ (реальные сообщения) ──

console.log('\\n── НЕ должен блокировать: ──')

test('Привет', () => assert(isSpamText('Привет') === false))
test('Число 11', () => assert(isSpamText('11') === false))
test('Число 100', () => assert(isSpamText('100') === false))
test('Да чёт не спится', () => assert(isSpamText('Да чёт не спится') === false))
test('Добрый день', () => assert(isSpamText('Добрый день, да, конечно заказываем!') === false))
test('Елена ДугинаТекст', () => assert(isSpamText('Елена ДугинаЗавтра в 12 к нотариусу') === false))
test('Хорошо, любимка', () => assert(isSpamText('хорошо, любимка') === false))
test('1220', () => assert(isSpamText('1220') === false))
test('Новое уведомление: Ozon', () => assert(isSpamText('Новое уведомление: Ozon Seller') === false))
test('Ок 👍', () => assert(isSpamText('Ок 👍') === false))
test('VK: Переслать (ipc, не msg)', () => assert(isSpamText('переслать', 'ipc') === false))
test('Длинный текст с переслать', () => assert(isSpamText('Можете переслать мне документы? Мне нужны скан паспорта и заявление на получение доверенности для регистрации автомобиля', 'msg') === false))

// v0.85.7: 1-символьные сообщения НЕ должны блокироваться (ловушка 56)
test('1-символ: "С" (сейчас)', () => assert(isSpamText('С') === false))
test('1-символ: "+" (согласие)', () => assert(isSpamText('+') === false))
test('1-символ: "1" (выбор)', () => assert(isSpamText('1') === false))
test('1-символ: "Д" (да)', () => assert(isSpamText('Д') === false))
test('1-символ: "-" (отказ)', () => assert(isSpamText('-') === false))

// Итог
console.log(`\\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
