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

// ─── Chats: mapDialog принимает accountId ────────────────────────
console.log('\n── telegramChats.js: ──')
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

// ─── Renderer (UI): chatFilter ─────────────────────────────────
console.log('\n── UI: chatFilter ──')
const storeCode = fs.readFileSync('src/native/store/nativeStore.js', 'utf8')
test('DEFAULT_STATE.chatFilter = "all"', () => {
  assert(storeCode.includes("chatFilter: 'all'"), 'По умолчанию показываем все аккаунты')
})
test('setChatFilter callback экспортируется', () => {
  assert(storeCode.includes('setChatFilter'), 'UI должен мочь сменить фильтр')
})

const sidebarCode = fs.readFileSync('src/native/components/InboxChatListSidebar.jsx', 'utf8')
test('Sidebar: фильтр-кнопки рендерятся при 2+ аккаунтах', () => {
  assert(sidebarCode.includes('store.accounts.length >= 2'), 'showFilters условие')
  assert(sidebarCode.includes("setChatFilter('all')"), 'Кнопка "Все"')
})

const inboxCode = fs.readFileSync('src/native/modes/InboxMode.jsx', 'utf8')
test('InboxMode: фильтрация по chatFilter', () => {
  assert(inboxCode.includes('store.chatFilter') && inboxCode.includes("filter === 'all'"),
    'Логика фильтра учитывает all/accountId')
})
test('InboxMode: loadChats() без accountId (multi-account default)', () => {
  assert(inboxCode.includes('store.loadChats()'),
    'Загрузка всех аккаунтов сразу')
})

// ─── Multi-account aware tg:account-update handler ───────────────
console.log('\n── tg:account-update (multi-account safe): ──')
const ipcStoreCode = fs.readFileSync('src/native/store/nativeStoreIpc.js', 'utf8')
test('Removed: per-account очистка чатов (не глобальная)', () => {
  assert(ipcStoreCode.includes('chats.filter(c => c.accountId !== acc.id)'),
    'Logout одного — удаляются ТОЛЬКО его чаты')
})
test('Removed: isLast → full wipe', () => {
  assert(ipcStoreCode.includes('wipeStats?.isLast') || ipcStoreCode.includes('isLast'),
    'Если последний — полная очистка состояния')
})

// ─── ChatRow / ChatListItem: бейдж аккаунта ──────────────────────
console.log('\n── UI: бейдж аккаунта в чатах ──')
const rowCode = fs.readFileSync('src/native/components/ChatRow.jsx', 'utf8')
const itemCode = fs.readFileSync('src/native/components/ChatListItem.jsx', 'utf8')
test('ChatRow передаёт account в ChatListItem', () => {
  assert(rowCode.includes('account={account}'), 'Прокидываем найденный аккаунт')
})
test('ChatListItem рендерит бейдж аккаунта (accBadge)', () => {
  assert(itemCode.includes('accBadge'), 'Инициалы аккаунта показываются в чате')
})

console.log(`\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
