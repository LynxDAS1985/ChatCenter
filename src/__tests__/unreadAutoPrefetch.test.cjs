/**
 * v0.88.0: статические проверки автодогрузки новых сообщений вниз
 * (Telegram-style infinite scroll down).
 *
 * Запуск: node src/__tests__/unreadAutoPrefetch.test.cjs
 *
 * Что проверяет:
 *  - tg:get-messages и tg:get-topic-messages принимают afterId и передают как MTProto min_id
 *  - Backend эмитит appendNewer:true когда afterId использован
 *  - Константы UNREAD_WINDOW_MAX_MESSAGES = 100 (жёсткий лимит API), NEWER_PAGE_SIZE = 100
 *  - Store экспортирует loadNewerMessages с throttle через loadingNewerRef
 *  - IPC listener tg:messages обрабатывает appendNewer с дедупом
 *  - useInboxScroll имеет prefetch-триггер NEWER_PREFETCH_THRESHOLD_PX
 *  - UI: InboxChatPanel рендерит индикатор native-msgs-loading-newer
 *  - InboxMode пробрасывает loadingNewer state
 *
 * Источник чисел: Telegram MTProto messages.getHistory limit ≤ 100
 * (https://core.telegram.org/api/offsets). Throttle 300мс — практика
 * MadelineProto/Telethon против FLOOD_WAIT.
 */

const fs = require('fs')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 v0.88.0: Telegram-style автодогрузка новых сообщений\n')

const messagesCode = fs.readFileSync('main/native/telegramMessages.js', 'utf8')
const storeCode = fs.readFileSync('src/native/store/nativeStore.js', 'utf8')
const storeIpcCode = fs.readFileSync('src/native/store/nativeStoreIpc.js', 'utf8')
const scrollCode = fs.readFileSync('src/native/hooks/useInboxScroll.js', 'utf8')
const panelCode = fs.readFileSync('src/native/components/InboxChatPanel.jsx', 'utf8')
const inboxCode = fs.readFileSync('src/native/modes/InboxMode.jsx', 'utf8')

console.log('── Backend IPC (afterId → MTProto min_id): ──')
test('tg:get-messages принимает afterId', () => {
  assert(messagesCode.includes('afterId') && messagesCode.includes('minId: numAfterId'),
    'Backend tg:get-messages must accept afterId and pass it as MTProto min_id')
  assert(messagesCode.includes("appendNewer: !!numAfterId"),
    'Backend must emit appendNewer:true when afterId is used')
})
test('tg:get-topic-messages принимает afterId для форум-тем', () => {
  assert(messagesCode.match(/get-topic-messages[\s\S]*?afterId/),
    'Backend tg:get-topic-messages must accept afterId')
  assert(messagesCode.match(/get-topic-messages[\s\S]*?minId: numAfterId/),
    'Backend tg:get-topic-messages must pass afterId as MTProto min_id')
})

console.log('\n── Store (lim=100, throttle, loadNewerMessages): ──')
test('UNREAD_WINDOW_MAX_MESSAGES = 100 (потолок Telegram API)', () => {
  assert(storeCode.includes('UNREAD_WINDOW_MAX_MESSAGES = 100'),
    'Unread window page must equal Telegram API hard ceiling (100)')
})
test('NEWER_PAGE_SIZE = 100 + NEWER_PAGE_MIN_INTERVAL_MS', () => {
  assert(storeCode.includes('NEWER_PAGE_SIZE = 100') && storeCode.includes('NEWER_PAGE_MIN_INTERVAL_MS'),
    'Store must define newer-page batch size and throttle constants')
})
test('store экспортирует loadNewerMessages', () => {
  assert(storeCode.includes('loadNewerMessages = useCallback') && storeCode.includes('afterId: Number(afterId)'),
    'Store must expose loadNewerMessages that passes afterId to IPC')
  assert(storeCode.match(/return\s*\{[^}]*loadNewerMessages/),
    'Store must export loadNewerMessages from the hook')
})
test('throttle per-key через loadingNewerRef Map', () => {
  assert(storeCode.includes('loadingNewerRef = useRef(new Map())'),
    'Store must use per-key throttle map for parallel topic/chat requests')
  assert(storeCode.includes('NEWER_PAGE_MIN_INTERVAL_MS') && storeCode.includes('throttled: true'),
    'Store must throttle per-key newer-page requests to avoid FLOOD_WAIT')
})

console.log('\n── IPC listener (appendNewer с дедупом): ──')
test('tg:messages listener обрабатывает appendNewer с дедупом', () => {
  assert(storeIpcCode.includes('appendNewer') && storeIpcCode.includes('newNewer'),
    'tg:messages listener must append-newer with dedup against existing ids')
  assert(storeIpcCode.match(/existing[^\n]*newNewer/),
    'New newer messages must be appended after existing array')
})
test('v0.88.1: listener делает ранний return когда нет новых сообщений', () => {
  assert(storeIpcCode.match(/newNewer\.length === 0/),
    'Listener must skip state update when appendNewer returns nothing — avoids re-render flicker')
})
test('v0.88.1: backend НЕ эмитит tg:messages при пустом afterId-ответе', () => {
  assert(messagesCode.match(/numAfterId && msgs\.length === 0/),
    'tg:get-messages must NOT emit tg:messages for empty afterId-response (avoid UI flicker)')
  assert(messagesCode.match(/numAfterId && messages\.length > 0/),
    'tg:get-topic-messages must NOT emit tg:messages for empty afterId-response (avoid UI flicker)')
})

console.log('\n── Hook useInboxScroll (prefetch триггер): ──')
test('NEWER_PREFETCH_THRESHOLD_PX определён', () => {
  assert(scrollCode.includes('NEWER_PREFETCH_THRESHOLD_PX'),
    'Prefetch threshold constant must exist')
})
test('handleScroll вызывает store.loadNewerMessages у низа', () => {
  assert(scrollCode.includes('store.loadNewerMessages'),
    'useInboxScroll must trigger loadNewerMessages near bottom')
  assert(scrollCode.includes('fromBottomPx') && scrollCode.includes('NEWER_PREFETCH_THRESHOLD_PX'),
    'Trigger must be based on distance from bottom')
})
test('диагностические события load-newer-* логируются', () => {
  assert(scrollCode.includes('load-newer-trigger') && scrollCode.includes('load-newer-result'),
    'Newer-prefetch diagnostics events must be logged')
})
test('v0.88.1: noMoreNewerRef блокирует бесконечный цикл у конца чата', () => {
  assert(scrollCode.includes('noMoreNewerRef') && scrollCode.includes('reachedEnd'),
    'Hook must mark viewKey as exhausted when Telegram returns hasMore=false or empty')
  assert(scrollCode.match(/!noMoreNewerRef\.current\.get\(viewKey\)/),
    'Trigger condition must check noMoreNewerRef before re-firing prefetch')
})
test('v0.88.2: сброс noMoreNewerRef при росте activeMessages (real-time push страховка)', () => {
  assert(scrollCode.includes('prevMessagesLenRef') && scrollCode.includes('prevScrollKeyRef'),
    'Hook must track previous messages length and viewKey to detect array growth')
  assert(scrollCode.match(/noMoreNewerRef\.current\.delete\(key\)/),
    'When activeMessages array grows within same viewKey, the no-more flag must be cleared')
  assert(scrollCode.includes('load-newer-flag-reset'),
    'Flag reset must be observable in diagnostics (load-newer-flag-reset event)')
})

console.log('\n── UI (индикатор + проброс state): ──')
test('InboxChatPanel рендерит native-msgs-loading-newer когда loadingNewer=true', () => {
  assert(panelCode.includes('native-msgs-loading-newer') && panelCode.includes('loadingNewer'),
    'InboxChatPanel must render a loading indicator when newer-prefetch is in flight')
})
test('InboxMode прокидывает loadingNewer state в useInboxScroll и InboxChatPanel', () => {
  assert(inboxCode.includes('loadingNewerRef') && inboxCode.includes('setLoadingNewer'),
    'InboxMode must wire loadingNewer state into useInboxScroll and InboxChatPanel')
  assert(inboxCode.includes('loadingNewer={loadingNewer}'),
    'InboxMode must pass loadingNewer prop to InboxChatPanel')
})

console.log('\n── CSS индикатора: ──')
test('styles-messages.css содержит .native-msgs-loading-newer', () => {
  const css = fs.readFileSync('src/native/styles-messages.css', 'utf8')
  assert(css.includes('.native-msgs-loading-newer') && css.includes('@keyframes'),
    'CSS must define the loading indicator class and animation')
})

// v0.88.2: страховочные проверки для критичных фич, которые могут пострадать
// при будущей виртуализации (Этап 2). Если виртуализация сломает любую из них —
// эти статические тесты упадут и сразу укажут где смотреть.
console.log('\n── Защита критичных интеграций перед Этапом 2: ──')
test('Reply → scroll-to-message: MessageBubble получает onReplyClick', () => {
  const bubbleCode = fs.readFileSync('src/native/components/MessageBubble.jsx', 'utf8')
  assert(bubbleCode.includes('onReplyClick'),
    'MessageBubble must accept onReplyClick for reply-to-message navigation')
  assert(panelCode.includes('onReplyClick={scrollToMessage}'),
    'InboxChatPanel must wire scrollToMessage into MessageBubble.onReplyClick')
})
test('Reply → scroll-to-message: AlbumBubble тоже получает onReplyClick', () => {
  const albumCode = fs.readFileSync('src/native/components/MediaAlbum.jsx', 'utf8')
  assert(albumCode.includes('onReplyClick'),
    'AlbumBubble must accept onReplyClick for reply navigation inside albums')
})
test('Группировка сообщений: groupMessages(visibleMessages, firstUnreadId)', () => {
  assert(inboxCode.includes('groupMessages(visibleMessages, firstUnreadId)'),
    'renderItems must be computed via groupMessages with firstUnreadId for unread divider')
  const groupingCode = fs.readFileSync('src/native/utils/messageGrouping.js', 'utf8')
  assert(groupingCode.includes('findFirstUnreadId'),
    'messageGrouping must export findFirstUnreadId for unread-divider placement')
})
test('Initial scroll: useInitialScroll использует firstUnreadIdRef', () => {
  const initialCode = fs.readFileSync('src/native/hooks/useInitialScroll.js', 'utf8')
  assert(initialCode.includes('firstUnreadIdRef'),
    'useInitialScroll must read firstUnreadIdRef to jump to first unread on open')
})
test('Mark-read через читающую линию: useReadOnScrollAway с rootMargin -48%', () => {
  const readCode = fs.readFileSync('src/native/hooks/useReadOnScrollAway.js', 'utf8')
  assert(readCode.includes("rootMargin: '-48% 0px -48% 0px'"),
    'Read tracker must use middle reading line (rootMargin -48%) for Telegram-style read')
})

console.log(`\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
