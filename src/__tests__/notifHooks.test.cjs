/**
 * Тесты per-messenger notification hooks (v0.82.0)
 * Проверяет что каждый мессенджер имеет свой hook файл с правильной структурой.
 *
 * Запуск: node src/__tests__/notifHooks.test.js
 */

const fs = require('fs')
const path = require('path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

const hooksDir = path.join(__dirname, '../../main/preloads/hooks')
const messengers = ['telegram', 'max', 'whatsapp', 'vk']

console.log('\n🧪 Тесты per-messenger notification hooks\n')

// ── Файлы существуют ──
console.log('── Файлы: ──')
for (const m of messengers) {
  test(`${m}.hook.js существует`, () => {
    assert(fs.existsSync(path.join(hooksDir, m + '.hook.js')), `файл ${m}.hook.js не найден`)
  })
}

// ── Каждый hook — самодостаточный IIFE ──
console.log('\n── Структура: ──')
for (const m of messengers) {
  const code = fs.readFileSync(path.join(hooksDir, m + '.hook.js'), 'utf8')
  test(`${m}: IIFE обёртка`, () => assert(code.startsWith('//') || code.includes('(function()'), 'должен быть IIFE'))
  test(`${m}: __cc_notif_hooked guard`, () => assert(code.includes('__cc_notif_hooked'), 'должен проверять __cc_notif_hooked'))
  test(`${m}: window.Notification override`, () => assert(code.includes('window.Notification'), 'должен перехватывать Notification'))
  test(`${m}: showNotification override`, () => assert(code.includes('showNotification'), 'должен перехватывать showNotification'))
  test(`${m}: __CC_NOTIF__ output`, () => assert(code.includes('__CC_NOTIF__'), 'должен отправлять __CC_NOTIF__'))
  test(`${m}: __CC_NOTIF_HOOK_OK__ marker`, () => assert(code.includes('__CC_NOTIF_HOOK_OK__'), 'должен отправлять OK маркер'))
  test(`${m}: Audio mute`, () => assert(code.includes('window.Audio'), 'должен глушить Audio'))
  test(`${m}: _isSpam function`, () => assert(code.includes('_isSpam'), 'должен иметь спам-фильтр'))
  test(`${m}: _log function`, () => assert(code.includes('__cc_notif_log'), 'должен логировать'))
}

// ── Мессенджер-специфичные фильтры ──
console.log('\n── Специфика: ──')

const maxCode = fs.readFileSync(path.join(hooksDir, 'max.hook.js'), 'utf8')
test('MAX: _maxPhantom regex', () => assert(maxCode.includes('теперь в max') || maxCode.includes('_maxPhantom'), 'MAX должен фильтровать "Теперь в MAX"'))
test('MAX: _editedMark regex', () => assert(maxCode.includes('ред\\.') || maxCode.includes('_editedMark'), 'MAX должен фильтровать "ред."'))
test('MAX: enrichNotif/findSender', () => assert(maxCode.includes('_enrichNotif') || maxCode.includes('_findSender'), 'MAX должен обогащать уведомления'))
test('MAX: _appTitles regex', () => assert(maxCode.includes('_appTitles'), 'MAX должен проверять title = название приложения'))
test('MAX: sticker extraction', () => assert(maxCode.includes('_extractSticker') || maxCode.includes('sticker'), 'MAX должен извлекать стикеры'))

const tgCode = fs.readFileSync(path.join(hooksDir, 'telegram.hook.js'), 'utf8')
test('TG: НЕ содержит _maxPhantom', () => assert(!tgCode.includes('_maxPhantom'), 'Telegram НЕ должен иметь MAX-фильтры'))
test('TG: НЕ содержит enrichNotif', () => assert(!tgCode.includes('_enrichNotif'), 'Telegram НЕ нужен enrichNotif — title уже правильный'))
test('TG: .chatlist-chat для аватарки', () => assert(tgCode.includes('.chatlist-chat'), 'Telegram ищет аватарку в .chatlist-chat'))

const vkCode = fs.readFileSync(path.join(hooksDir, 'vk.hook.js'), 'utf8')
test('VK: ConvoListItem selector', () => assert(vkCode.includes('ConvoListItem'), 'VK должен искать в ConvoListItem'))
test('VK: _appTitles с vk/вконтакте', () => assert(vkCode.includes('вконтакте') || vkCode.includes('вк'), 'VK _appTitles должен содержать VK названия'))

const waCode = fs.readFileSync(path.join(hooksDir, 'whatsapp.hook.js'), 'utf8')
test('WA: span[title] для аватарки', () => assert(waCode.includes('span[title]'), 'WhatsApp ищет аватарку по span[title]'))
test('WA: НЕ содержит _maxPhantom', () => assert(!waCode.includes('_maxPhantom'), 'WhatsApp НЕ должен иметь MAX-фильтры'))

// ── Нет дублирования в основных файлах ──
console.log('\n── Нет дублирования: ──')
const monitorCode = fs.readFileSync(path.join(__dirname, '../../main/preloads/monitor.preload.cjs'), 'utf8')
test('monitor.preload.cjs: нет inline enrichNotif', () => assert(!monitorCode.includes('function enrichNotif('), 'inline enrichNotif должен быть удалён'))
test('monitor.preload.cjs: нет inline isSpamNotif', () => assert(!monitorCode.includes('function isSpamNotif('), 'inline isSpamNotif должен быть удалён'))
test('monitor.preload.cjs: загрузка hook через fs.readFileSync', () => assert(monitorCode.includes('hooks') && monitorCode.includes('readFileSync'), 'должен загружать hook из файла'))

// ── IPC handler в main.js ──
console.log('\n── IPC: ──')
const mainCode = fs.readFileSync(path.join(__dirname, '../../main/main.js'), 'utf8')
test('main.js: app:read-hook handler', () => assert(mainCode.includes("app:read-hook"), 'main.js должен иметь app:read-hook handler'))

console.log(`\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
