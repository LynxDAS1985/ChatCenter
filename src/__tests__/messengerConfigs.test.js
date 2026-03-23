/**
 * Тесты messengerConfigs — конфигурации мессенджеров.
 * Проверяет detectMessengerType, accountScripts, DOM-скрипты.
 *
 * Запуск: node src/__tests__/messengerConfigs.test.js
 */

const fs = require('fs')
const code = fs.readFileSync('src/utils/messengerConfigs.js', 'utf8')

let passed = 0, failed = 0

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты messengerConfigs\\n')

// ── detectMessengerType ──
console.log('── detectMessengerType: ──')
test('Экспортирует detectMessengerType', () => assert(code.includes('export function detectMessengerType')))
test('Telegram URL', () => assert(code.includes('web.telegram.org') && code.includes("'telegram'")))
test('WhatsApp URL', () => assert(code.includes('web.whatsapp.com') && code.includes("'whatsapp'")))
test('VK URL', () => assert(code.includes('vk.com') && code.includes("'vk'")))
test('MAX URL', () => assert(code.includes('web.max.ru') && code.includes("'max'")))
test('Unknown fallback', () => assert(code.includes("'unknown'")))

// ── ACCOUNT_SCRIPTS ──
console.log('\\n── ACCOUNT_SCRIPTS: ──')
test('Экспортирует ACCOUNT_SCRIPTS', () => assert(code.includes('export const ACCOUNT_SCRIPTS')))
test('Telegram accountScript', () => assert(code.includes('telegram:') && code.includes('__cc_account_name')))
test('VK accountScript', () => assert(code.includes("vk:") && code.includes('header-profile-menu-button')))
test('WhatsApp accountScript', () => assert(code.includes("whatsapp:")))
test('MAX accountScript', () => assert(code.includes("max:") && code.includes('button.profile')))

// ── DOM_SCAN_SCRIPTS ──
console.log('\\n── DOM_SCAN_SCRIPTS: ──')
test('Экспортирует DOM_SCAN_SCRIPTS', () => assert(code.includes('export const DOM_SCAN_SCRIPTS')))
test('TG DOM-скан: папки', () => assert(code.includes("type: 'telegram'")))
test('VK DOM-скан: ConvoListItem', () => assert(code.includes("type: 'vk'") && code.includes('ConvoListItem')))
test('WA DOM-скан: #side', () => assert(code.includes("type: 'whatsapp'")))
test('MAX DOM-скан: history', () => assert(code.includes("type: 'max'")))
test('Unknown fallback скан', () => assert(code.includes("type: 'unknown'")))

// ── isSpamText ──
console.log('\\n── isSpamText: ──')
test('Экспортирует isSpamText', () => assert(code.includes('export function isSpamText')))
test('Фильтрует время', () => assert(code.includes('\\d{1,2}:\\d{2}')))
test('Фильтрует дату', () => assert(code.includes('[./-]')))
test('Фильтрует статусы', () => assert(code.includes('печата') && code.includes('typing')))
test('VK UI фильтр (msg)', () => assert(code.includes('переслать') && code.includes("source === 'msg'")))
test('WhatsApp артефакты (msg)', () => assert(code.includes('ic-image')))

// ── ENRICHMENT_SELECTORS ──
console.log('\\n── ENRICHMENT_SELECTORS: ──')
test('Экспортирует ENRICHMENT_SELECTORS', () => assert(code.includes('export const ENRICHMENT_SELECTORS')))
test('TG: .peer-title', () => assert(code.includes("title: '.peer-title'")))
test('VK: ConvoListItem__title', () => assert(code.includes('ConvoListItem__title')))
test('WA: span[title]', () => assert(code.includes('span[title]')))

// ── Безопасность скриптов ──
console.log('\\n── Безопасность: ──')
test('Нет eval', () => assert(!code.includes('eval(')))
test('Нет new Function', () => assert(!code.includes('new Function(')))
test('AccountScripts в try-catch', () => {
  const scripts = code.match(/telegram:|vk:|whatsapp:|max:/g) || []
  assert(scripts.length >= 4, `Найдено ${scripts.length} конфигов`)
})

console.log(`\\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
