/**
 * Интеграционные тесты — часть 1: data pipeline.
 * Тестирует полные цепочки: вход → обработка → выход.
 *
 * Цепочки 1-2:
 *   1. spamPatterns.json → isSpamText → handleNewMessage
 *   2. console-message → parser → handler
 *
 * v0.87.87: цепочки 3-5 (URL/config, App.jsx imports, lifecycle) вынесены
 * в integrationChains.test.cjs (главный файл был 391/400).
 *
 * Запуск: node src/__tests__/integration.test.cjs
 */

var fs = require('fs')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Интеграционные тесты\\n')

// ═══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 1: spamPatterns.json → isSpamText → handleNewMessage
// ═══════════════════════════════════════════════════════════════════════
console.log('── Цепочка: JSON → isSpamText → message pipeline: ──')

// Загружаем JSON как это делает messengerConfigs.js
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

// Копии из messageProcessing.js
function isDuplicateExact(mid, text, map) {
  var key = mid + ':' + text.slice(0, 60); var now = Date.now()
  var prev = map.get(key); if (prev && now - prev < 10000) return { blocked: true, age: now - prev }
  return { blocked: false, key: key, now: now }
}
function isDuplicateSubstring(mid, text, map) {
  var textShort = text.slice(0, 80); var now = Date.now(); var prefix = mid + ':'
  for (var entry of map) { var k = entry[0]; var ts = entry[1]
    if (now - ts > 5000 || !k.startsWith(prefix)) continue
    var prevText = k.slice(prefix.length)
    if (prevText.length > 5 && textShort.length > 5 && (prevText.includes(textShort) || textShort.includes(prevText))) return { blocked: true }
  }
  return { blocked: false }
}
function stripSenderFromText(text, senderName) {
  if (!senderName || senderName.length < 3) return { text: text, stripped: false }
  if (text.startsWith(senderName)) return { text: text.slice(senderName.length).trim(), stripped: true }
  return { text: text, stripped: false }
}
function isOwnMessage(text, senderName, fromNotifAPI) {
  if (!senderName || senderName.length < 3 || fromNotifAPI) return false
  if (text.startsWith(senderName)) return false
  return /^[А-ЯA-Z][а-яa-z]+\s[А-ЯA-Z][а-яa-z]/.test(text)
}

// Полная имитация pipeline (v0.80.3: viewing check)
function processMessage(mid, text, extra, ctx) {
  var result = { steps: [], finalText: null, action: null }
  ctx = ctx || {}

  // 0. Viewing check (v0.80.3)
  var isViewingThisTab = ctx.focused && ctx.activeId === mid
  if (isViewingThisTab && !extra) {
    result.action = 'viewing-block'; result.steps.push('viewing-block'); return result
  }
  if (isViewingThisTab && extra) result.steps.push('viewing-pass')
  else result.steps.push('viewing-na')

  // 1. Spam check
  if (isSpamText(text, extra ? 'notif' : 'msg')) { result.action = 'spam'; result.steps.push('spam'); return result }
  result.steps.push('spam-pass')

  // 2. Sender strip ПЕРЕД дедупом (как в реальном App.jsx v0.79.2+)
  var sender = extra && extra.senderName || ''
  var stripped = stripSenderFromText(text, sender)
  if (stripped.stripped) {
    text = stripped.text
    if (!text) { result.action = 'empty-after-strip'; result.steps.push('strip-empty'); return result }
    result.steps.push('strip:' + sender)
  } else if (isOwnMessage(text, sender, extra && extra.fromNotifAPI)) {
    result.action = 'own-msg'; result.steps.push('own-msg'); return result
  } else {
    result.steps.push('strip-skip')
  }

  // 3. Dedup exact + substring (порядок как в App.jsx: check both → потом set)
  var recentMap = (extra && extra._recentMap) ? extra._recentMap : new Map()
  var dup = isDuplicateExact(mid, text, recentMap)
  if (dup.blocked) { result.action = 'dedup-exact'; result.steps.push('dedup-exact'); return result }
  result.steps.push('dedup-exact-pass')
  var subDup = isDuplicateSubstring(mid, text, recentMap)
  if (subDup.blocked) { result.action = 'dedup-sub'; result.steps.push('dedup-sub'); return result }
  result.steps.push('dedup-sub-pass')
  // Set в Map ПОСЛЕ обоих проверок (как в App.jsx)
  recentMap.set(dup.key, dup.now)

  result.action = 'pass'
  result.finalText = text
  return result
}

// Тест: полная цепочка для реального VK сообщения
test('VK: чужое сообщение → strip sender → pass', function() {
  var r = processMessage('vk', 'Елена ДугинаЗавтра в 12 к нотариусу', { senderName: 'Елена Дугина' })
  assert(r.action === 'pass', 'action=' + r.action)
  assert(r.finalText === 'Завтра в 12 к нотариусу', 'text=' + r.finalText)
  assert(r.steps.includes('strip:Елена Дугина'))
})

test('VK: своё сообщение → own-msg block', function() {
  var r = processMessage('vk', 'Алексей Дугинхорошо любимка', { senderName: 'Елена Дугина' })
  assert(r.action === 'own-msg')
})

test('VK: спам "печатает" → spam block', function() {
  var r = processMessage('vk', 'печатает', null)
  assert(r.action === 'spam')
})

test('VK: дубль parent+child → dedup-sub block', function() {
  var map = new Map()
  map.set('vk:Елена ДугинаЗавтра в 12 к нотариусу записалась', Date.now())
  var r = processMessage('vk', 'Завтра в 12 к нотариусу записалась', { senderName: 'Елена Дугина', _recentMap: map })
  assert(r.action === 'dedup-sub', 'action=' + r.action)
})

test('Telegram: сообщение от __CC_NOTIF__ → pass (fromNotifAPI)', function() {
  var r = processMessage('tg', 'Привет', { senderName: 'Иван', fromNotifAPI: true })
  assert(r.action === 'pass')
  assert(r.finalText === 'Привет')
})

test('WhatsApp: alt-текст "default-contact-refreshed" (msg) → spam', function() {
  var r = processMessage('wa', 'default-contact-refreshed', null)
  assert(r.action === 'spam')
})

test('WhatsApp: дата "29.12.2025" → spam', function() {
  var r = processMessage('wa', '29.12.2025', null)
  assert(r.action === 'spam')
})

test('Реальное сообщение "Добрый день" → pass', function() {
  var r = processMessage('tg', 'Добрый день, да, конечно заказываем!', { senderName: 'Насонова Ольга', fromNotifAPI: true })
  assert(r.action === 'pass')
  assert(r.finalText === 'Добрый день, да, конечно заказываем!')
})

test('Число "1220" → pass (не спам)', function() {
  var r = processMessage('tg', '1220', null)
  assert(r.action === 'pass')
})

test('VK: "Вы: текст" → spam (исходящее)', function() {
  var r = processMessage('vk', 'Вы: привет', null)
  assert(r.action === 'spam')
})

// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 1.5: Viewing logic (v0.80.3)
// ═══════════════════════════════════════════════════════════════════════
console.log('\\n── Цепочка: viewing logic: ──')

test('VK: на вкладке + extra (MutationObserver) → НЕ блокируем (не знаем чат)', function() {
  var r = processMessage('vk', 'Привет', { senderName: 'Сергей' }, { focused: true, activeId: 'vk' })
  assert(r.action === 'pass', 'action=' + r.action)
  assert(r.steps.includes('viewing-pass'))
})

test('VK: на вкладке + NO extra (мусор) → блокируем', function() {
  var r = processMessage('vk', 'мусор', null, { focused: true, activeId: 'vk' })
  assert(r.action === 'viewing-block')
})

test('VK: на другой вкладке → показываем', function() {
  var r = processMessage('vk', 'Привет', { senderName: 'Сергей' }, { focused: true, activeId: 'telegram' })
  assert(r.action === 'pass')
  assert(r.steps.includes('viewing-na'))
})

test('Telegram: на вкладке + fromNotifAPI → показываем (мессенджер знает)', function() {
  var r = processMessage('tg', 'Привет', { senderName: 'Иван', fromNotifAPI: true }, { focused: true, activeId: 'tg' })
  assert(r.action === 'pass')
  assert(r.steps.includes('viewing-pass'))
})

test('Окно не в фокусе → показываем всегда', function() {
  var r = processMessage('vk', 'Привет', { senderName: 'Сергей' }, { focused: false, activeId: 'vk' })
  assert(r.action === 'pass')
})

// ЦЕПОЧКА 2: parseConsoleMessage → тип → обработка
// ═══════════════════════════════════════════════════════════════════════
console.log('\\n── Цепочка: console-message → parser → handler: ──')

function parseConsoleMessage(msg) {
  if (!msg || !msg.startsWith('__CC_')) return null
  if (msg.startsWith('__CC_BADGE_BLOCKED__:')) { var val = parseInt(msg.split(':')[1], 10); return { type: 'badge_blocked', value: isNaN(val) ? null : val } }
  if (msg.startsWith('__CC_ACCOUNT__:')) return { type: 'account', name: msg.slice(15).trim() }
  if (msg.startsWith('__CC_NOTIF__')) { try { var d = JSON.parse(msg.slice(12)); return { type: 'notification', title: d.t||'', body: d.b||'', icon: d.i||'', tag: d.g||'' } } catch(e) { return { type: 'notification_error' } } }
  if (msg.startsWith('__CC_MSG__')) return { type: 'message', text: msg.slice(10).trim() }
  return { type: 'debug' }
}

test('__CC_NOTIF__ → parse → spam check → pass', function() {
  var msg = '__CC_NOTIF__{"t":"Елена","b":"Привет как дела","i":"blob:...","g":"tag1"}'
  var parsed = parseConsoleMessage(msg)
  assert(parsed.type === 'notification')
  assert(parsed.body === 'Привет как дела')
  var spam = isSpamText(parsed.body, 'notif')
  assert(spam === false, 'не должен быть спамом')
})

test('__CC_NOTIF__ → parse → spam body "печатает" → block', function() {
  var msg = '__CC_NOTIF__{"t":"Елена","b":"печатает","i":"","g":""}'
  var parsed = parseConsoleMessage(msg)
  assert(parsed.body === 'печатает')
  assert(isSpamText(parsed.body, 'notif') === true)
})

test('__CC_MSG__ → parse → isSpamText → pipeline', function() {
  var msg = '__CC_MSG__Добрый день'
  var parsed = parseConsoleMessage(msg)
  assert(parsed.type === 'message')
  assert(parsed.text === 'Добрый день')
  assert(isSpamText(parsed.text, 'msg') === false)
  var r = processMessage('vk', parsed.text, null)
  assert(r.action === 'pass')
})

test('__CC_BADGE_BLOCKED__:0 → reset badge', function() {
  var parsed = parseConsoleMessage('__CC_BADGE_BLOCKED__:0')
  assert(parsed.type === 'badge_blocked')
  assert(parsed.value === 0)
})

test('__CC_ACCOUNT__:Алексей Дугин → set account name', function() {
  var parsed = parseConsoleMessage('__CC_ACCOUNT__:Алексей Дугин')
  assert(parsed.type === 'account')
  assert(parsed.name === 'Алексей Дугин')
})

// v0.87.87: Цепочки 3-5 вынесены в integrationChains.test.cjs.

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
