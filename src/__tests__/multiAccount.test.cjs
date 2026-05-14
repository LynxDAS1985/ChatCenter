/**
 * v0.87.105 (ADR-016): тесты multi-account для нативного Telegram.
 *
 * Запуск: node src/__tests__/multiAccount.test.cjs
 *
 * Что проверяет:
 *  - state.clients / state.accounts / state.activeAccountId / state.sessionsDir объявлены
 *  - registerAccount / setActiveAccount / unregisterAccount экспортированы
 *  - getClientForChat / getAccountForChat / accountIdFromChat есть
 *  - autoRestoreSessions — новое имя (старое autoRestoreSession как алиас)
 *  - Сессии хранятся per-account: tg-sessions/{id}.txt
 *  - В IPC handlers: client получается через getClientForChat (НЕ напрямую state.client)
 *  - mapDialog принимает accountId
 *  - tg:get-chats / tg:remove-account принимают accountId через args
 *  - UI: chatFilter в DEFAULT_STATE
 *  - InboxChatListSidebar — фильтр-кнопки
 *  - Миграция: migrateLegacySession upgrade'ит tg-session.txt → tg-sessions/{id}.txt
 */

const fs = require('fs')
const path = require('path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Multi-account тесты (v0.87.105 ADR-016)\n')

// ─── State refactor ───────────────────────────────────────────────
console.log('── State (telegramState.js): ──')
const stateCode = fs.readFileSync('main/native/telegramState.js', 'utf8')
test('state.clients = new Map()', () => assert(stateCode.includes('clients: new Map()')))
test('state.accounts = new Map()', () => assert(stateCode.includes('accounts: new Map()')))
test('state.activeAccountId объявлен', () => assert(stateCode.includes('activeAccountId:')))
test('state.sessionsDir объявлен', () => assert(stateCode.includes('sessionsDir:')))
test('state.client / state.currentAccount остались как алиасы', () => {
  assert(stateCode.includes('client: null') && stateCode.includes('currentAccount: null'),
    'Backward-compat алиасы должны быть для старого кода')
})

console.log('\n── Helpers: ──')
test('export accountIdFromChat', () => assert(stateCode.includes('export function accountIdFromChat')))
test('export getClientForChat', () => assert(stateCode.includes('export function getClientForChat')))
test('export getAccountForChat', () => assert(stateCode.includes('export function getAccountForChat')))
test('export registerAccount', () => assert(stateCode.includes('export function registerAccount')))
test('export setActiveAccount', () => assert(stateCode.includes('export function setActiveAccount')))
test('export unregisterAccount', () => assert(stateCode.includes('export function unregisterAccount')))

// ─── Auth: per-account sessions + migration ──────────────────────
console.log('\n── Auth (telegramAuth.js): ──')
const authCode = fs.readFileSync('main/native/telegramAuth.js', 'utf8')
test('startLogin создаёт ЛОКАЛЬНЫЙ newClient (не state.client)', () => {
  assert(authCode.includes('const newClient = new TelegramClient'),
    'Должен быть локальный const newClient — для multi-account')
})
test('startLogin использует registerAccount при success', () => {
  assert(authCode.includes('registerAccount(accountId, newClient'),
    'После success → registerAccount в state Maps')
})
test('startLogin attachMessageListener(newClient, accountId)', () => {
  assert(authCode.includes('attachMessageListener(newClient, accountId)'),
    'NewMessage handler привязывается к этому конкретному client + accountId')
})
test('Per-account file: sessionFileFor(accountId)', () => {
  assert(authCode.includes('sessionFileFor') && authCode.includes('${accountId}.txt'),
    'Сессия сохраняется в tg-sessions/{accountId}.txt')
})
test('autoRestoreSessions сканирует папку', () => {
  assert(authCode.includes('autoRestoreSessions') && authCode.includes('readdirSync(state.sessionsDir)'),
    'autoRestoreSessions должна сканировать папку tg-sessions')
})
test('migrateLegacySession для старого tg-session.txt', () => {
  assert(authCode.includes('migrateLegacySession'),
    'При первом запуске v0.87.105 — миграция старого файла')
})
test('autoRestoreSession как backward-compat alias', () => {
  assert(authCode.includes('export const autoRestoreSession = autoRestoreSessions'),
    'Старое имя должно работать для совместимости с импортами')
})

// ─── Handler init: sessionsDir mkdir ─────────────────────────────
console.log('\n── Handler (telegramHandler.js): ──')
const handlerCode = fs.readFileSync('main/native/telegramHandler.js', 'utf8')
test('state.sessionsDir = path.join(userData, tg-sessions)', () => {
  assert(handlerCode.includes("'tg-sessions'") && handlerCode.includes('state.sessionsDir'),
    'Путь к папке сессий')
})
test('mkdirSync(state.sessionsDir)', () => {
  assert(handlerCode.includes('mkdirSync(state.sessionsDir'),
    'Папка создаётся при init')
})
test('autoRestoreSessions вызывается (новое имя)', () => {
  assert(handlerCode.includes('autoRestoreSessions'),
    'Импорт + вызов нового имени')
})

// ─── IPC routing through getClientForChat ────────────────────────
console.log('\n── IPC routing (multi-account): ──')
const messagesCode = fs.readFileSync('main/native/telegramMessages.js', 'utf8')
const chatsIpcCode = fs.readFileSync('main/native/telegramChatsIpc.js', 'utf8')
const mediaCode = fs.readFileSync('main/native/telegramMedia.js', 'utf8')

test('telegramMessages.js: getClientForChat использован', () => {
  assert(messagesCode.includes('getClientForChat'), 'send-message и др. должны маршрутизировать по chatId')
})
test('telegramChatsIpc.js: getClientForChat использован', () => {
  assert(chatsIpcCode.includes('getClientForChat'), 'mark-read / pin / refresh-avatar / set-typing')
})
test('telegramMedia.js: getClientForChat использован', () => {
  assert(mediaCode.includes('getClientForChat'), 'download-media / download-video')
})

test('attachMessageListener принимает (client, accountId)', () => {
  assert(/attachMessageListener\(client, accountId\)|attachMessageListener\(newClient, accountId\)/.test(messagesCode + authCode),
    'Должен быть параметризован')
})

// ─── tg:get-chats и tg:remove-account ────────────────────────────
console.log('\n── tg:get-chats / remove-account (multi-account args): ──')
test('tg:get-chats принимает accountId через args', () => {
  assert(chatsIpcCode.includes("ipcMain.handle('tg:get-chats', async (_, args)"),
    'Должен принимать args с accountId')
})
test('tg:get-chats итерирует state.clients если accountId не передан', () => {
  assert(chatsIpcCode.includes('state.clients.keys()'),
    'Без accountId — обходим все аккаунты')
})
test('tg:remove-account принимает accountId через args', () => {
  assert(chatsIpcCode.includes("ipcMain.handle('tg:remove-account', async (_, args)"),
    'Должен принимать args')
})
test('tg:remove-account: per-account vs full wipe (isLast)', () => {
  assert(chatsIpcCode.includes('isLast') && chatsIpcCode.includes('performAccountWipe'),
    'Если последний аккаунт — full wipe; иначе per-account')
})

test('tg:get-accounts snapshot возвращает accounts из main state', () => {
  assert(chatsIpcCode.includes("ipcMain.handle('tg:get-accounts'"),
    'Renderer должен иметь snapshot, если пропустил ранний tg:account-update')
  assert(chatsIpcCode.includes('Array.from(state.accounts.values())'),
    'Snapshot должен возвращать текущие accounts из main state')
  assert(chatsIpcCode.includes('activeAccountId'),
    'Snapshot должен возвращать activeAccountId')
})

// ─── Chats: mapDialog принимает accountId ────────────────────────
console.log('\n── telegramChats.js: ──')
test('tg:health-check unified lightweight API probe', () => {
  assert(chatsIpcCode.includes("ipcMain.handle('tg:health-check', async (_, args)"),
    'Connections panel must use dedicated health IPC instead of loading chats')
  assert(chatsIpcCode.includes('await client.getMe()'),
    'Health-check must use lightweight API call without getDialogs')
})

test('tg:health-check returns per-account ms', () => {
  assert(chatsIpcCode.includes('accountStats') && chatsIpcCode.includes('Promise.all(accountIds.map'),
    'Health-check must check accounts separately')
  assert(chatsIpcCode.includes('accountId, ok: true, ms: Date.now() - startedAt'),
    'Every account must get its own ms')
})

const chatsCode = fs.readFileSync('main/native/telegramChats.js', 'utf8')
test('mapDialog(d, accountId)', () => {
  assert(chatsCode.includes('mapDialog(d, accountId)') || chatsCode.includes('export function mapDialog(d, accountId)'),
    'Должен принимать accountId явно')
})
test('saveChatsCache(chats, accountId)', () => {
  assert(chatsCode.includes('saveChatsCache(chats, accountId)') || chatsCode.includes('export function saveChatsCache(chats, accountId)'),
    'Per-account кэш — tg-cache-{accountId}.json')
})
test('loadAvatarsAsync(dialogs, accountId)', () => {
  assert(chatsCode.includes('export async function loadAvatarsAsync(dialogs, accountId)'),
    'Должен принимать accountId')
})
test('fetchAllUnreadUpdates итерирует по всем clients', () => {
  assert(chatsCode.includes('for (const [accountId, client] of state.clients.entries())'),
    'Multi-account rescan — обходим все клиенты')
})
test('fetchAllUnreadUpdates возвращает per-account accountStats', () => {
  assert(chatsCode.includes('accountStats.push') && chatsCode.includes('accountId') && chatsCode.includes('ms: accountMs'),
    'Rescan должен возвращать личные ms по каждому accountId')
})
test('tg:rescan-unread отдаёт accountStats renderer-у', () => {
  assert(chatsIpcCode.includes('accountStats') && chatsIpcCode.includes('return { ok: true, count: updates.length, accountStats }'),
    'Renderer не должен получать только общий count без per-account статистики')
})

// ─── Renderer (UI): chatFilter ─────────────────────────────────
console.log('\n── UI: chatFilter ──')
const storeCode = fs.readFileSync('src/native/store/nativeStore.js', 'utf8')
test('DEFAULT_STATE.chatFilter = "all"', () => {
  assert(storeCode.includes("chatFilter: 'all'"), 'По умолчанию показываем все аккаунты')
})
test('setChatFilter callback экспортируется', () => {
  assert(storeCode.includes('setChatFilter'), 'UI должен мочь сменить фильтр')
})
test('nativeStore при mount запрашивает tg:get-accounts snapshot', () => {
  assert(storeCode.includes("'tg:get-accounts'") || storeCode.includes('"tg:get-accounts"'),
    'useNativeStore должен забрать accounts snapshot после подписки на IPC')
  assert(storeCode.includes('accounts snapshot request') && storeCode.includes('accounts snapshot response'),
    'Snapshot должен логироваться в startup-native')
})
test('nativeStore хранит реальные статусы подключения API', () => {
  assert(storeCode.includes('nativeConnectionHealth'), 'nativeStore должен хранить nativeConnectionHealth')
  assert(storeCode.includes('markHealthByDuration'), 'nativeStore должен замерять ok/slow по длительности ответа')
  assert(storeCode.includes('markHealthError'), 'nativeStore должен переводить ошибки Telegram API в error')
})
test('nativeStore использует accountStats для личного health аккаунта', () => {
  assert(storeCode.includes('accountStatById') && storeCode.includes('accountStat.ms') && storeCode.includes('!hasPersonalStat'),
    'Общий rescan ms нельзя писать каждому API аккаунту как личный')
})
test('nativeStore умеет запускать rescanUnread без перезаписи health', () => {
  assert(storeCode.includes('options = {}') && storeCode.includes('updateHealth') && storeCode.includes('if (!updateHealth) return r'),
    'Фоновый focus-rescan не должен перезаписывать ручный health-замер')
})
test('nativeStore не использует tg:get-cached-chats как сетевой health замер', () => {
  assert(!storeCode.includes("tg:get-cached-chats ответил"),
    'Кэш не является API ping/ответом аккаунта')
})

test('nativeStore uses tg:health-check for Connections panel', () => {
  assert(storeCode.includes('const checkConnection') && storeCode.includes("'tg:health-check'"),
    'Manual connection check must use unified health-check')
  assert(storeCode.includes('tg:health-check ответил'),
    'Details must show health-check, not chat loading')
})
test('nativeStore does not use tg:get-chats as Connections health', () => {
  assert(!storeCode.includes('tg:get-chats ответил') && !storeCode.includes('Загружаем чаты через Telegram API'),
    'Chat loading must not write status/time into Connections')
})
test('nativeStore rescanUnread does not write health by default', () => {
  assert(storeCode.includes('const updateHealth = options?.updateHealth === true'),
    'Unread rescan must not replace health unless updateHealth is explicitly enabled')
})
test('nativeStore separates Telegram forum topic messages from parent chat messages', () => {
  assert(storeCode.includes('function topicMessageKey') && storeCode.includes(':topic:'),
    'Forum topic messages need a separate message key')
  assert(storeCode.includes('activeForumTopic') && storeCode.includes('forumTopics'),
    'Store must keep selected topic and topic list separately')
  assert(storeCode.includes("'tg:get-topic-messages'"),
    'Selected topic must load through topic-aware IPC')
})
test('nativeStore has Telegram forum topic list actions', () => {
  assert(storeCode.includes("'tg:get-forum-topics'") && storeCode.includes('selectForumTopic') && storeCode.includes('closeForumTopics'),
    'Store must expose forum topic load/select/close actions')
})
test('nativeStore can mark selected Telegram forum topic as read separately', () => {
  assert(storeCode.includes('const markTopicRead') && storeCode.includes("'tg:mark-topic-read'"),
    'Forum topic unread counters must use topic-specific mark-read')
  assert(storeCode.includes("'tg:get-forum-topics'") && storeCode.includes('refreshedTopics') && storeCode.includes('activeForumTopic'),
    'Successful topic mark-read must refresh topic counters from Telegram instead of clearing locally')
  assert(storeCode.includes('TOPIC_READ_REFRESH_DELAYS_MS') && storeCode.includes('retryScheduled'),
    'Topic read must retry Telegram topic refresh briefly when Telegram still returns the old unread counter')
  assert(!storeCode.includes('unreadCount: 0, readInboxMaxId'),
    'Forum topic unread counters must not be optimistic local zero')
})

const sidebarCode = fs.readFileSync('src/native/components/InboxChatListSidebar.jsx', 'utf8')
test('Sidebar: фильтр-кнопки рендерятся при 2+ аккаунтах', () => {
  assert(sidebarCode.includes('store.accounts.length >= 2'), 'showFilters условие')
  assert(sidebarCode.includes("setChatFilter('all')"), 'Кнопка "Все"')
})
test('Sidebar: forum topic panel replaces normal chat list and has close button', () => {
  assert(sidebarCode.includes('forumTopicPanelChatId') && sidebarCode.includes('forumTopics.map'),
    'Forum group must show topic list in the left panel')
  assert(sidebarCode.includes('closeForumTopics') && sidebarCode.includes('Закрыть темы'),
    'Forum topic panel must have close/back button')
})

test('Sidebar: forum topic icon can render Telegram custom emoji media', () => {
  assert(sidebarCode.includes('ForumTopicIcon') && sidebarCode.includes('topic.iconEmojiUrl'),
    'Forum topic row must prefer custom emoji media URL when Telegram provides it')
  assert(sidebarCode.includes('<img') && sidebarCode.includes('<video'),
    'Custom emoji renderer must support static image and webm emoji')
})

const inboxCode = fs.readFileSync('src/native/modes/InboxMode.jsx', 'utf8')
const panelCode = fs.readFileSync('src/native/components/InboxChatPanel.jsx', 'utf8')
const readByVisibilityCode = fs.readFileSync('src/native/hooks/useReadByVisibility.js', 'utf8')
const forceReadAtBottomCode = fs.readFileSync('src/native/hooks/useForceReadAtBottom.js', 'utf8')
const readOnScrollAwayCode = fs.readFileSync('src/native/hooks/useReadOnScrollAway.js', 'utf8')
const unreadFormatCode = fs.readFileSync('src/native/utils/unreadFormat.js', 'utf8')
test('Read guard follows Telegram server read cursor', () => {
  assert(readByVisibilityCode.includes('read-guard-reset') && readByVisibilityCode.includes('maxEverSentRef.current = cursor'),
    'Visibility guard must reset local highwater to readInboxMaxId')
  assert(storeCode.includes('readInboxMaxId: options?.readInboxMaxId') && inboxCode.includes('readInboxMaxId: activeReadInboxMaxId'),
    'mark-read must pass Telegram readInboxMaxId from renderer to backend')
  assert(chatsIpcCode.includes('mark-read guard reset by server cursor') && chatsIpcCode.includes('before-read-cursor'),
    'Backend mark-read guard must use readInboxMaxId as source of truth')
})
test('InboxMode: фильтрация по chatFilter', () => {
  assert(inboxCode.includes('store.chatFilter') && inboxCode.includes("filter === 'all'"),
    'Логика фильтра учитывает all/accountId')
})
test('InboxMode: loadChats() без accountId (multi-account default)', () => {
  assert(inboxCode.includes('store.loadChats()'),
    'Загрузка всех аккаунтов сразу')
})
test('InboxMode: window.focus rescan не обновляет health', () => {
  assert(inboxCode.includes('rescanUnread?.({ updateHealth: false })'),
    'Focus-rescan должен обновлять unread, но не статус диагностики Подключения')
})
test('InboxMode: forum groups load topics before parent messages', () => {
  assert(inboxCode.includes('store.loadForumTopics') && inboxCode.includes('r?.isForum'),
    'Forum groups should open topic list instead of ambiguous parent messages')
  assert(inboxCode.includes('topicMessageKey') && inboxCode.includes('activeTopic'),
    'InboxMode must render selected topic messages through a topic key')
})

// ─── Multi-account aware tg:account-update handler ───────────────
console.log('\n── tg:account-update (multi-account safe): ──')
test('NativeApp: Connections buttons use health-check, not chat loading', () => {
  const nativeAppCode = fs.readFileSync('src/native/NativeApp.jsx', 'utf8')
  assert(nativeAppCode.includes('store.checkConnection?.(acc.id)'),
    'Check all must run checkConnection for every account')
  assert(!nativeAppCode.includes('await store.loadCachedChats?.()') && !nativeAppCode.includes('return store.loadChats?.()'),
    'Manual health check must not call cache/chat loading')
})
test('NativeApp: new API accounts auto-run initial health-check once', () => {
  const nativeAppCode = fs.readFileSync('src/native/NativeApp.jsx', 'utf8')
  assert(nativeAppCode.includes('autoCheckedAccountsRef') && nativeAppCode.includes('store.checkConnection?.(acc.id)'),
    'Новый API-аккаунт должен автоматически получить первичную проверку подключения')
  assert(nativeAppCode.includes('autoCheckedAccountsRef.current.add(acc.id)'),
    'Автопроверка не должна запускаться бесконечно на каждый render')
})

test('NativeApp: active API account follows opened chat or account filter', () => {
  const nativeAppCode = fs.readFileSync('src/native/NativeApp.jsx', 'utf8')
  const appCode = fs.readFileSync('src/App.jsx', 'utf8')
  assert(nativeAppCode.includes('onActiveNativeAccountChange'),
    'NativeApp must report active API account to App scheduler')
  assert(nativeAppCode.includes('store.chats.find(chat => chat.id === store.activeChatId)') && nativeAppCode.includes('activeChat?.accountId'),
    'Opened chat account must be the first active API signal')
  assert(nativeAppCode.includes("store.chatFilter !== 'all'"),
    'Selected account filter must be the fallback active API signal')
  assert(appCode.includes('activeNativeAccountIdRef.current') && appCode.includes('activeNativeAccountId: activeIdRef.current === NATIVE_CC_ID'),
    'Scheduler must receive one active API account, not mark all API accounts active')
})

const ipcStoreCode = fs.readFileSync('src/native/store/nativeStoreIpc.js', 'utf8')
test('Removed: per-account очистка чатов (не глобальная)', () => {
  assert(ipcStoreCode.includes('chats.filter(c => c.accountId !== acc.id)'),
    'Logout одного — удаляются ТОЛЬКО его чаты')
})
test('Removed: isLast → full wipe', () => {
  assert(ipcStoreCode.includes('wipeStats?.isLast') || ipcStoreCode.includes('isLast'),
    'Если последний — полная очистка состояния')
})

// ─── ChatRow / ChatListItem: метки аккаунта в чате (v0.87.106) ───
console.log('\n── UI: метки аккаунта в чатах (v0.87.106) ──')
const rowCode = fs.readFileSync('src/native/components/ChatRow.jsx', 'utf8')
const itemCode = fs.readFileSync('src/native/components/ChatListItem.jsx', 'utf8')
test('ChatRow передаёт account в ChatListItem', () => {
  assert(rowCode.includes('account={account}'), 'Прокидываем найденный аккаунт')
})
test('ChatRow передаёт hoveredAccountId (Улучшение 1)', () => {
  assert(rowCode.includes('hoveredAccountId'), 'hover-подсветка чатов аккаунта')
})
test('ChatListItem использует messengerBranding (полоса+эмоджи)', () => {
  assert(itemCode.includes('messengerBranding'), 'Импорт фирменных цветов мессенджеров')
})
test('ChatListItem рисует полосу слева (фирменный цвет)', () => {
  assert(itemCode.includes('stripeColor') && itemCode.includes('width: 3'),
    'Цветная полоса слева 3px = цвет мессенджера')
})
test('ChatListItem рисует угловой emoji мессенджера на аватарке', () => {
  assert(itemCode.includes('messengerEmoji'), 'Угловой ✈️/💬/🔵 в правом нижнем углу аватарки')
})
test('ChatListItem рисует микро-строку «✈️ Telegram · БНК»', () => {
  assert(itemCode.includes('messengerName') && itemCode.includes('account.name'),
    'Под именем чата — серая строка с мессенджером и аккаунтом')
})
test('ChatListItem dimmed при hoveredAccountId !== chat.accountId (Улучшение 1)', () => {
  assert(itemCode.includes('dimmed') && itemCode.includes('hoveredAccountId'),
    'Hover в sidebar → чужие чаты приглушены (opacity 0.35)')
})

console.log('\n── messengerBranding утилиты: ──')
const brandingCode = fs.readFileSync('src/native/utils/messengerBranding.js', 'utf8')
test('MESSENGER_COLORS = фирменные', () => {
  assert(brandingCode.includes("'#2AABEE'") && brandingCode.includes("'#25D366'"),
    'Telegram=#2AABEE, WhatsApp=#25D366')
})
test('MESSENGER_EMOJI = ✈️ для telegram', () => {
  assert(brandingCode.includes("'✈️'"), 'Иконка Telegram')
})

console.log('\n── Sidebar (NativeApp.jsx): круглые аватарки + ✈️ + бейдж непрочит. ──')
const navCode = fs.readFileSync('src/native/NativeApp.jsx', 'utf8')
test('AccountAvatar компонент круглый (borderRadius 50%)', () => {
  assert(navCode.includes('AccountAvatar') && navCode.includes("borderRadius: '50%'"),
    'Круглые аватарки в sidebar')
})
test('Sidebar: угловая иконка мессенджера на аватарке', () => {
  assert(navCode.includes('MESSENGER_EMOJI'), 'Иконка ✈️ в углу аватарки sidebar')
})
test('Sidebar: бейдж непрочитанных (unreadByAccount)', () => {
  assert(navCode.includes('unreadByAccount'), 'Подсчёт непрочитанных по аккаунту')
})
test('Sidebar: hover → setHoveredAccountId (Улучшение 1)', () => {
  assert(navCode.includes('setHoveredAccountId'), 'Hover на аккаунте → подсветка чатов')
})
test('Sidebar: NO яркая подсветка активного (active className убран)', () => {
  assert(!navCode.includes("'native-account--active'") || !navCode.includes("activeAccountId === acc.id ? 'native-account--active'"),
    'Активный аккаунт не выделен синим фоном')
})
test('Sidebar: нет фейкового 0 мс для connected аккаунта', () => {
  assert(!navCode.includes('lastMs: 0'), 'NativeApp не должен подставлять фейковые 0 мс')
})

console.log('\n── Хедер открытого чата (Бонус): ──')
test('InboxChatPanel импортирует messengerBranding', () => {
  assert(panelCode.includes('messengerBranding'),
    'Иконка ✈️ + название аккаунта серым справа от имени чата')
})

console.log('\n── Фильтр под поиском (а не сверху): ──')
const sidebarChatCode = fs.readFileSync('src/native/components/InboxChatListSidebar.jsx', 'utf8')
test('Поиск идёт ПЕРВЫМ (раньше был фильтр)', () => {
  // Ищем что блок с input стоит ВЫШЕ блока с фильтр-кнопками в исходнике
  const inputIdx = sidebarChatCode.indexOf('Поиск по чатам')
  const filterIdx = sidebarChatCode.indexOf("setChatFilter('all')")
  assert(inputIdx > 0 && filterIdx > 0 && inputIdx < filterIdx,
    'Input поиска должен быть В КОДЕ выше блока фильтров (= в UI выше)')
})

console.log(`\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
test('InboxMode: forum parent shows no messages until topic is selected', () => {
  assert(inboxCode.includes('forumNeedsTopic') && inboxCode.includes('forumNeedsTopic ? []'),
    'Forum parent view must not render ambiguous parent messages before topic selection')
})
test('InboxMode: forum topics have independent scroll/read keys', () => {
  assert(inboxCode.includes('activeViewKey') && inboxCode.includes('scrollKey: activeViewKey'),
    'Forum topic scroll state must be keyed by topic, not only parent chat')
  assert(inboxCode.includes('markReadCurrentView') && inboxCode.includes('store.markTopicRead'),
    'Visibility and bottom read logic must call topic-specific mark-read')
})
test('InboxMode: scroll button supports delayed single click and double-click to absolute bottom', () => {
  assert(inboxCode.includes('scrollButtonClickTimerRef') && inboxCode.includes('scrollToAbsoluteBottom'),
    'Scroll button needs separate single-click and double-click paths')
  assert(inboxCode.includes('button-scroll-absolute-bottom') && inboxCode.includes("markReadCurrentView(viewKey, lastId, { source: 'absolute-bottom' })"),
    'Double-click must jump to the real bottom and mark read up to the last loaded message')
  assert(panelCode.includes('onDoubleClick') && panelCode.includes('scrollToAbsoluteBottom?.()'),
    'Scroll button UI must wire double-click to absolute bottom')
})

test('Telegram-like unread opening: dialogs keep readInboxMaxId', () => {
  assert(chatsCode.includes('readInboxMaxId') && chatsCode.includes('d.dialog?.readInboxMaxId'),
    'Native chat DTO must keep Telegram read cursor for opening at first unread')
})
test('Telegram-like unread opening: message IPC supports aroundId/addOffset', () => {
  assert(messagesCode.includes('aroundId') && messagesCode.includes('addOffset') && messagesCode.includes('effectiveOffsetId'),
    'tg:get-messages and tg:get-topic-messages must support loading around readInboxMaxId')
})
test('Telegram-like unread opening: store requests unread window around read cursor', () => {
  assert(storeCode.includes('unreadWindowRequestParams') && storeCode.includes('UNREAD_WINDOW_MAX_MESSAGES'),
    'Store must build bounded unread-window requests')
  assert(storeCode.includes('aroundId: unreadParams.aroundId') && storeCode.includes('addOffset: unreadParams.addOffset'),
    'Store must pass aroundId/addOffset to IPC')
})
test('Telegram-like unread opening: incomplete unread window blocks mark-read', () => {
  assert(inboxCode.includes('unreadWindowIncomplete') && inboxCode.includes('mark-read-skip-unread-window'),
    'InboxMode must guard incomplete unread windows')
  assert(inboxCode.includes("source !== 'visibility'") && readByVisibilityCode.includes("source: 'visibility'") && forceReadAtBottomCode.includes("source: 'bottom'"),
    'Visibility reads must be allowed while bottom/absolute-bottom reads stay guarded')
  assert(panelCode.includes('native-unread-window-status') && storeCode.includes('unreadWindowLoading'),
    'UI must expose visible unread-window loading/progress state')
})
test('Telegram read tracker: all native chat types use root-aware reading line', () => {
  assert(readOnScrollAwayCode.includes("rootMargin: '-48% 0px -48% 0px'") && readOnScrollAwayCode.includes('read-line-read'),
    'Read tracker must use a root-aware middle reading line, not plain viewport appearance')
  assert(panelCode.includes('readRoot={msgsScrollRef.current}'),
    'Message and album bubbles must receive the real message scroll root')
})
test('Native unread badges use Telegram-style count formatter', () => {
  assert(unreadFormatCode.includes('formatUnreadCount') && unreadFormatCode.includes('toFixed(1)'),
    'Unread counters need compact K formatting instead of hard 999+ caps')
  assert(panelCode.includes('formatUnreadCount') && panelCode.includes('exactUntil: 9999'),
    'Scroll-bottom badge must not collapse large unread counts to 99+')
  assert(sidebarCode.includes('formatUnreadCount') && !sidebarCode.includes("topic.unreadCount > 999 ? '999+'"),
    'Forum topic badges must use the shared formatter')
})
test('Unread-window banner uses fresh Telegram unread instead of stale opening snapshot', () => {
  assert(panelCode.includes('freshUnreadTotal') && panelCode.includes('activeTopic.unreadCount') && panelCode.includes('activeChat?.unreadCount'),
    'Unread-window banner must derive total from fresh active chat/topic unread')
  assert(storeCode.includes('nextMessageWindows[windowKey]') && storeCode.includes('refreshedActiveTopic.unreadCount'),
    'Topic refresh must update matching messageWindows metadata')
})

// v0.88.0: специфические проверки автодогрузки newer-сообщений вынесены
// в отдельный файл src/__tests__/unreadAutoPrefetch.test.cjs (этот файл уже за лимитом 400 строк).

if (failed > 0) process.exit(1)
