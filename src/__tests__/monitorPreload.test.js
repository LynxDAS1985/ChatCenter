/**
 * Тесты monitor.preload.js — извлечённые чистые функции.
 * Проверяет extractMsgText, isSidebarNode regex, CHAT_CONTAINER_SELECTORS.
 *
 * Запуск: node src/__tests__/monitorPreload.test.js
 */

const fs = require('fs')
const code = fs.readFileSync('main/preloads/monitor.preload.js', 'utf8')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

// Извлекаем extractMsgText для тестирования
// Создаём mock node с textContent
function mockNode(text) { return { textContent: text } }

// Копия extractMsgText из monitor.preload.js
function extractMsgText(node) {
  const raw = (node.textContent || '').trim()
  if (raw.length < 2 || raw.length > 500) return ''
  const clean = raw.replace(/\s*\d{1,2}:\d{2}(:\d{2})?\s*/g, '').trim()
  if (clean.length < 2) return ''
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(clean)) return ''
  if (/^(typing|печатает|был[а]? в сети|online|в сети|оффлайн|offline|не в сети|ожидани[ея]\s+сети|connecting|reconnecting|updating|загрузк[аи]|обновлени[ея]|подключени[ея])$/i.test(clean)) return ''
  if (/\s+назад\s*$/i.test(clean) || /^(час|минуту?|секунду?)\s+назад$/i.test(clean)) return ''
  if (/^(недавние|избранные|все (диалоги|чаты|сообщения)|непрочитанные|архив|чаты)$/i.test(clean)) return ''
  if (/^(сегодня|вчера|позавчера)\s*(в\s*)?$/i.test(clean)) return ''
  if (/сообщений\s+пока\s+нет|напишите\s+(сообщение|что[- ]нибудь)|отправьте\s+(этот\s+)?стикер|теперь\s+в\s+max|начните\s+общени[ея]|добро\s+пожаловать/i.test(clean)) return ''
  if (/^ред\.?\s*$/i.test(clean) || /^edited\.?\s*$/i.test(clean)) return ''
  if (/^status-(dblcheck|check|time|read|delivered|seen|pending)/i.test(clean)) return ''
  return clean
}

// Копия _sidebarRe
const _sidebarRe = /dialog|chat-?list|sidebar|peer-?list|conv-?list|left-?col|nav-?panel|im-page--dialogs|contacts|im-page--nav|ChatList|Sidebar|ConvoList|LeftAds|LeftMenu|ConvoListItem|MessagePreview|scrollListContent|scrollListScrollable|chatListItem|_ak9p|_ak8q|_ak8o|_ak8i|left_nav|_page_sidebar|page_block|leftMenu|counts_module|HeaderNav/i

console.log('\\n🧪 Тесты monitor.preload.js\\n')

// ── extractMsgText ──
console.log('── extractMsgText: ──')

test('Нормальное сообщение', () => assert(extractMsgText(mockNode('Привет, как дела?')) === 'Привет, как дела?'))
test('Сообщение с timestamp', () => assert(extractMsgText(mockNode('Привет 12:30')) === 'Привет'))
test('Только timestamp → пустая', () => assert(extractMsgText(mockNode('12:30')) === ''))
test('Пустой текст', () => assert(extractMsgText(mockNode('')) === ''))
test('Короткий (1 символ)', () => assert(extractMsgText(mockNode('А')) === ''))
test('Длинный (>500)', () => assert(extractMsgText(mockNode('А'.repeat(501))) === ''))
test('Печатает → пустая', () => assert(extractMsgText(mockNode('печатает')) === ''))
test('Typing → пустая', () => assert(extractMsgText(mockNode('typing')) === ''))
test('Онлайн → пустая', () => assert(extractMsgText(mockNode('online')) === ''))
test('Был в сети → пустая', () => assert(extractMsgText(mockNode('был в сети')) === ''))
test('5 минут назад → пустая', () => assert(extractMsgText(mockNode('5 минут назад')) === ''))
test('Час назад → пустая', () => assert(extractMsgText(mockNode('час назад')) === ''))
test('Сегодня → пустая', () => assert(extractMsgText(mockNode('сегодня')) === ''))
test('Все чаты → пустая', () => assert(extractMsgText(mockNode('все чаты')) === ''))
test('Напишите что-нибудь → пустая', () => assert(extractMsgText(mockNode('Напишите что-нибудь!')) === ''))
test('Теперь в MAX → пустая', () => assert(extractMsgText(mockNode('Теперь в MAX! 👉 Напишите что-нибудь!')) === ''))
test('ред. → пустая', () => assert(extractMsgText(mockNode('ред.')) === ''))
test('status-dblcheck → пустая', () => assert(extractMsgText(mockNode('status-dblcheckic-imageТекст')) === ''))
test('Реальное сообщение VK', () => assert(extractMsgText(mockNode('Елена ДугинаДа мельком')) === 'Елена ДугинаДа мельком'))
test('Реальное число 1220', () => assert(extractMsgText(mockNode('1220')) === '1220'))
test('Ozon уведомление', () => {
  const t = extractMsgText(mockNode('Новое уведомление: Ozon Seller'))
  assert(t === 'Новое уведомление: Ozon Seller')
})

// ── _sidebarRe (isSidebarNode regex) ──
console.log('\\n── _sidebarRe (sidebar detection): ──')

test('chatlist → sidebar', () => assert(_sidebarRe.test('chatlist-container')))
test('ChatList → sidebar', () => assert(_sidebarRe.test('ChatList__items')))
test('sidebar → sidebar', () => assert(_sidebarRe.test('my-sidebar-left')))
test('ConvoList → sidebar', () => assert(_sidebarRe.test('ConvoList__itemsWrapper')))
test('ConvoListItem → sidebar', () => assert(_sidebarRe.test('ConvoListItem__message')))
test('LeftMenu → sidebar', () => assert(_sidebarRe.test('LeftMenu__leftMenu')))
test('LeftAds → sidebar', () => assert(_sidebarRe.test('LeftAds__adsRoot')))
test('_ak9p (WhatsApp) → sidebar', () => assert(_sidebarRe.test('_ak9p')))
test('_ak8o (WhatsApp) → sidebar', () => assert(_sidebarRe.test('_ak8o')))
test('HeaderNav → sidebar', () => assert(_sidebarRe.test('HeaderNav')))
test('dialog → sidebar', () => assert(_sidebarRe.test('dialog-list')))
test('peer-list → sidebar', () => assert(_sidebarRe.test('peer-list')))
test('MessagePreview → sidebar', () => assert(_sidebarRe.test('MessagePreview')))
// НЕ sidebar
test('ConvoMain__history → НЕ sidebar', () => assert(!_sidebarRe.test('ConvoMain__history')))
test('bubbles → НЕ sidebar', () => assert(!_sidebarRe.test('bubbles scrolled-down')))
test('message-bubble → НЕ sidebar', () => assert(!_sidebarRe.test('message-bubble incoming')))
test('ConvoHeader → НЕ sidebar', () => assert(!_sidebarRe.test('ConvoHeader')))

// ── CHAT_CONTAINER_SELECTORS ──
console.log('\\n── CHAT_CONTAINER_SELECTORS: ──')

test('VK селекторы определены', () => assert(code.includes("'.ConvoMain__history'")))
test('MAX селекторы определены', () => assert(code.includes("'.history'")))
test('WhatsApp селекторы определены', () => assert(code.includes("'#main'")))
test('Telegram — пустой (работает через __CC_NOTIF__)', () => assert(code.includes("telegram: []")))

// ── Структура файла ──
console.log('\\n── Структура файла: ──')

test('getMessengerType определена', () => assert(code.includes('function getMessengerType()')))
test('countUnread определена', () => assert(code.includes('function countUnread(type)')))
test('countUnreadTelegram определена', () => assert(code.includes('function countUnreadTelegram()')))
test('countUnreadVK определена', () => assert(code.includes('function countUnreadVK()')))
test('countUnreadMAX определена', () => assert(code.includes('function countUnreadMAX()')))
test('quickNewMsgCheck определена', () => assert(code.includes('function quickNewMsgCheck(')))
test('isSidebarNode определена', () => assert(code.includes('function isSidebarNode(')))
test('startChatObserver определена', () => assert(code.includes('function startChatObserver(')))
test('startMonitor определена', () => assert(code.includes('function startMonitor()')))
test('sendUpdate определена', () => assert(code.includes('function sendUpdate(')))
test('extractMsgText определена', () => assert(code.includes('function extractMsgText(')))
test('runDiagnostics определена', () => assert(code.includes('function runDiagnostics(')))

console.log(`\\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
