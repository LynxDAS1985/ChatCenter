/**
 * Тесты monitor.preload.js — извлечённые чистые функции.
 * Проверяет extractMsgText, isSidebarNode regex, CHAT_CONTAINER_SELECTORS.
 *
 * Запуск: node src/__tests__/monitorPreload.test.js
 */

const fs = require('fs')
const code = fs.readFileSync('main/preloads/monitor.preload.js', 'utf8')
// v0.82.3: unread counters вынесены в отдельный файл
const unreadCode = fs.existsSync('main/preloads/utils/unreadCounters.js') ? fs.readFileSync('main/preloads/utils/unreadCounters.js', 'utf8') : ''
const allPreloadCode = code + '\n' + unreadCode

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

// ── Body-fallback отключение (v0.80.6) ──
console.log('\\n── Body-fallback: ──')

test('VK body-fallback отключён (noBodyFallbackTypes содержит vk)', () => {
  assert(code.includes("noBodyFallbackTypes") && code.includes("'vk'"), 'vk должен быть в noBodyFallbackTypes')
})
test('MAX body-fallback отключён (noBodyFallbackTypes содержит max)', () => {
  assert(code.includes("noBodyFallbackTypes") && code.includes("'max'"), 'max должен быть в noBodyFallbackTypes')
})
test('chatObserverTarget = none для VK/MAX', () => {
  assert(code.includes("chatObserverTarget = 'none'"), 'должен устанавливать none')
})
test('chatObserverTarget = none для VK без контейнера', () => {
  assert(code.includes("chatObserverTarget = 'none'"), 'должен устанавливать none при отсутствии контейнера')
})
test('Snapshot при привязке chatObserver (v0.80.7)', () => {
  assert(code.includes('_snapshotTexts') && code.includes('new Set'), 'snapshot Set должен создаваться')
})
test('Snapshot фильтрует старые пузыри', () => {
  assert(code.includes('snapshot-skip'), 'должен логировать snapshot-skip')
})
test('Grace period = 15 сек при навигации (v0.80.7)', () => {
  assert(code.includes('15000'), 'grace должен быть 15000мс')
})
test('Диагностика мутаций с timestamp', () => {
  assert(code.includes('mutation +') && code.includes('elapsed'), 'диагностика мутаций')
})
test('WhatsApp НЕ в noBodyFallbackTypes (пока использует body)', () => {
  // WhatsApp использует body-fallback с sidebar-фильтром
  const match = code.match(/noBodyFallbackTypes\s*=\s*\[([^\]]+)\]/)
  assert(match, 'noBodyFallbackTypes должен существовать')
  assert(!match[1].includes("'whatsapp'"), 'whatsapp НЕ должен быть в списке')
})
test('Telegram НЕ в noBodyFallbackTypes', () => {
  const match = code.match(/noBodyFallbackTypes\s*=\s*\[([^\]]+)\]/)
  assert(match && !match[1].includes("'telegram'"), 'telegram НЕ должен быть в списке')
})

// ── Фикс фантомов VK (v0.80.9) ──
console.log('\\n── Фикс фантомов + диагностика (v0.80.9): ──')

test('Сброс lastActiveMessageText при навигации (v0.80.9)', () => {
  assert(code.includes('lastActiveMessageText = null') && code.includes('Сброс dedup при навигации'), 'dedup должен сбрасываться при навигации')
})
test('Path 2 отключён для VK (v0.81.0)', () => {
  const path2Line = code.match(/monitorReady\s*&&\s*type\s*!==\s*'telegram'[^{]+\{/)
  assert(path2Line && path2Line[0].includes("'vk'"), 'Path 2 должен быть отключён для VK')
})
test('chatObserver отключён для VK (v0.81.2)', () => {
  assert(code.includes("if (type === 'vk') return") && code.includes('startChatObserver'), 'chatObserver должен быть отключён для VK')
})
test('Path 2 отключён для MAX (v0.81.1)', () => {
  const path2Line = code.match(/monitorReady\s*&&\s*type\s*!==\s*'telegram'[^{]+\{/)
  assert(path2Line && path2Line[0].includes("'max'"), 'Path 2 должен быть отключён для MAX')
})
test('getVKLastIncomingText фильтрует исходящие out/own (v0.81.1)', () => {
  assert(code.includes('out|own|self|sent') && code.includes('getVKLastIncomingText'), 'должен фильтровать исходящие')
})
test('extractMsgText ищет leaf-элемент для обёрток (v0.81.1)', () => {
  assert(code.includes('node.children.length > 2') && code.includes('leaves'), 'должен искать leaf в обёртках')
})
test('className проверка typeof для SVG (v0.81.1)', () => {
  assert(code.includes("typeof el.className === 'string'"), 'должен проверять typeof для SVG className')
})
test('Реинициализация dedup в grace-end через getLastMessageText (v0.80.9)', () => {
  // В setTimeout 15000 должен вызываться getLastMessageText для инициализации dedup
  const graceBlock = code.slice(code.indexOf('setTimeout(function()'), code.indexOf('}, 15000)') + 10)
  assert(graceBlock.includes('getLastMessageText'), 'grace-end должен вызывать getLastMessageText для реинит dedup')
})
test('EXTRACT_SPAM per-messenger конфиг (v0.82.1)', () => {
  assert(code.includes('EXTRACT_SPAM') && code.includes("max:"), 'EXTRACT_SPAM должен содержать per-messenger паттерны')
})
test('QUICK_MSG_SELECTORS per-messenger конфиг (v0.82.1)', () => {
  assert(code.includes('QUICK_MSG_SELECTORS') && code.includes("whatsapp:"), 'QUICK_MSG_SELECTORS должен содержать per-messenger селекторы')
})
test('extractMsgText принимает type (v0.82.1)', () => {
  assert(code.includes('function extractMsgText(node, type)'), 'extractMsgText должен принимать type')
})
test('quickNewMsgCheck передаёт type в extractMsgText (v0.82.1)', () => {
  assert(code.includes('extractMsgText(node, type)') && code.includes('extractMsgText(candidates[ci], type)'), 'все вызовы extractMsgText должны передавать type')
})
test('Snapshot bind через 13 сек (не 1.5 сек) после навигации (v0.80.9)', () => {
  assert(code.includes('startChatObserver(type), 13000'), 'startChatObserver должен вызываться через 13000мс')
  assert(!code.includes('startChatObserver(type), 1500'), 'старый 1500мс таймаут должен быть удалён')
})

// ── Диагностика (v0.80.8) ──
console.log('\\n── Диагностика msg-src (v0.80.8): ──')

test('msg-src маркер CO (chatObserver) перед __CC_MSG__', () => {
  // CO маркер должен быть в quickNewMsgCheck, рядом с __CC_MSG__
  const idx_co = code.indexOf("msg-src: CO")
  const idx_msg = code.indexOf("'__CC_MSG__' + text", idx_co)
  assert(idx_co > 0 && idx_msg > 0 && idx_msg - idx_co < 200, 'msg-src: CO должен быть перед __CC_MSG__ в quickNewMsgCheck')
})
test('msg-src маркер UC (unread count) перед __CC_MSG__', () => {
  const idx_uc = code.indexOf("msg-src: UC")
  assert(idx_uc > 0, 'msg-src: UC должен быть в sendUpdate path 1')
})
test('msg-src маркер P2 (path 2 text changed) перед __CC_MSG__', () => {
  const idx_p2 = code.indexOf("msg-src: P2")
  assert(idx_p2 > 0, 'msg-src: P2 должен быть в sendUpdate path 2')
})
test('Все 3 маркера msg-src присутствуют (CO, UC, P2)', () => {
  const matches = code.match(/msg-src: (CO|UC|P2)/g)
  assert(matches && matches.length === 3, 'должно быть ровно 3 маркера msg-src')
})
test('nav диагностика содержит dedup state (lastActive)', () => {
  assert(code.includes('__CC_DIAG__nav:') && code.includes('lastActiveMessageText'), 'nav должен логировать dedup')
})
test('Snapshot лог содержит timestamp (ts=)', () => {
  assert(code.includes("snapshot=' + _snapshotTexts.size + ' | ts=' + _bindTs"), 'snapshot лог должен содержать ts')
})
test('grace-end логирует lastActiveMessageText', () => {
  assert(code.includes('__CC_DIAG__grace-end') && code.includes('lastActiveMessageText'), 'grace-end должен логировать lastActive')
})
test('lastActive-chg логирует тихую перезапись', () => {
  assert(code.includes('__CC_DIAG__lastActive-chg'), 'lastActive-chg должен существовать')
})

// ── Структура файла ──
console.log('\\n── Структура файла: ──')

test('getMessengerType определена', () => assert(allPreloadCode.includes('function getMessengerType()')))
test('countUnread определена', () => assert(allPreloadCode.includes('function countUnread(type)')))
test('countUnreadTelegram определена', () => assert(allPreloadCode.includes('function countUnreadTelegram()')))
test('countUnreadVK определена', () => assert(allPreloadCode.includes('function countUnreadVK()')))
test('countUnreadMAX определена', () => assert(allPreloadCode.includes('function countUnreadMAX()')))
test('Unread counters в отдельном файле (v0.82.3)', () => assert(unreadCode.length > 100 && code.includes("require('./utils/unreadCounters')"), 'counters должны быть в unreadCounters.js'))
test('quickNewMsgCheck определена', () => assert(code.includes('function quickNewMsgCheck(')))
test('isSidebarNode определена', () => assert(code.includes('function isSidebarNode(')))
test('startChatObserver определена', () => assert(code.includes('function startChatObserver(')))
test('startMonitor определена', () => assert(code.includes('function startMonitor()')))
test('sendUpdate определена', () => assert(code.includes('function sendUpdate(')))
test('extractMsgText определена', () => assert(code.includes('function extractMsgText(')))
test('runDiagnostics определена', () => assert(code.includes('function runDiagnostics(')))

console.log(`\\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
