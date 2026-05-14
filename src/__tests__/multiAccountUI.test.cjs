/**
 * v0.88.x: UI и render-уровневые тесты для multi-account / forum topics / unread
 * вынесены из multiAccount.test.cjs (тот файл перевалил лимит 400 строк).
 *
 * Что проверяет:
 *  - UI store: chatFilter, nativeConnectionHealth, forum-topic state/actions,
 *    markTopicRead retry loop, Telegram-style read counters
 *  - InboxChatListSidebar: фильтр-кнопки, forum topic panel, custom emoji icons
 *  - InboxMode: chatFilter, forum topic mode, scroll button, unread-window guard
 *  - NativeApp sidebar: Connections panel, account avatars, hover, auto health-check
 *  - ChatRow/ChatListItem: метки аккаунта, фирменные цвета мессенджеров
 *  - Telegram-like unread opening: readInboxMaxId, aroundId/addOffset, банер unread-window
 *  - Read tracker через читающую линию (rootMargin -48%)
 *  - Telegram-style unread badges (formatUnreadCount без 999+ caps)
 *
 * Запуск: node src/__tests__/multiAccountUI.test.cjs
 */

const fs = require('fs')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Multi-account UI / render тесты\n')

const storeCode = fs.readFileSync('src/native/store/nativeStore.js', 'utf8')
const sidebarCode = fs.readFileSync('src/native/components/InboxChatListSidebar.jsx', 'utf8')
const inboxCode = fs.readFileSync('src/native/modes/InboxMode.jsx', 'utf8')
const panelCode = fs.readFileSync('src/native/components/InboxChatPanel.jsx', 'utf8')
const readByVisibilityCode = fs.readFileSync('src/native/hooks/useReadByVisibility.js', 'utf8')
const forceReadAtBottomCode = fs.readFileSync('src/native/hooks/useForceReadAtBottom.js', 'utf8')
const readOnScrollAwayCode = fs.readFileSync('src/native/hooks/useReadOnScrollAway.js', 'utf8')
const unreadFormatCode = fs.readFileSync('src/native/utils/unreadFormat.js', 'utf8')
const ipcStoreCode = fs.readFileSync('src/native/store/nativeStoreIpc.js', 'utf8')
const rowCode = fs.readFileSync('src/native/components/ChatRow.jsx', 'utf8')
const itemCode = fs.readFileSync('src/native/components/ChatListItem.jsx', 'utf8')
const brandingCode = fs.readFileSync('src/native/utils/messengerBranding.js', 'utf8')
const navCode = fs.readFileSync('src/native/NativeApp.jsx', 'utf8')
const chatsCode = fs.readFileSync('main/native/telegramChats.js', 'utf8')
const messagesCode = fs.readFileSync('main/native/telegramMessages.js', 'utf8')
const chatsIpcCode = fs.readFileSync('main/native/telegramChatsIpc.js', 'utf8')

console.log('── UI store: chatFilter / connection health / forum topics: ──')
test('DEFAULT_STATE.chatFilter = "all"', () => {
  assert(storeCode.includes("chatFilter: 'all'"))
})
test('setChatFilter callback экспортируется', () => {
  assert(storeCode.includes('setChatFilter'))
})
test('nativeStore при mount запрашивает tg:get-accounts snapshot', () => {
  assert(storeCode.includes("'tg:get-accounts'") || storeCode.includes('"tg:get-accounts"'))
  assert(storeCode.includes('accounts snapshot request') && storeCode.includes('accounts snapshot response'))
})
test('nativeStore хранит реальные статусы подключения API', () => {
  assert(storeCode.includes('nativeConnectionHealth'))
  assert(storeCode.includes('markHealthByDuration'))
  assert(storeCode.includes('markHealthError'))
})
test('nativeStore использует accountStats для личного health аккаунта', () => {
  assert(storeCode.includes('accountStatById') && storeCode.includes('accountStat.ms') && storeCode.includes('!hasPersonalStat'))
})
test('nativeStore умеет запускать rescanUnread без перезаписи health', () => {
  assert(storeCode.includes('options = {}') && storeCode.includes('updateHealth') && storeCode.includes('if (!updateHealth) return r'))
})
test('nativeStore не использует tg:get-cached-chats как сетевой health замер', () => {
  assert(!storeCode.includes("tg:get-cached-chats ответил"))
})
test('nativeStore uses tg:health-check for Connections panel', () => {
  assert(storeCode.includes('const checkConnection') && storeCode.includes("'tg:health-check'"))
  assert(storeCode.includes('tg:health-check ответил'))
})
test('nativeStore does not use tg:get-chats as Connections health', () => {
  assert(!storeCode.includes('tg:get-chats ответил') && !storeCode.includes('Загружаем чаты через Telegram API'))
})
test('nativeStore rescanUnread does not write health by default', () => {
  assert(storeCode.includes('const updateHealth = options?.updateHealth === true'))
})
test('nativeStore separates Telegram forum topic messages from parent chat messages', () => {
  assert(storeCode.includes('function topicMessageKey') && storeCode.includes(':topic:'))
  assert(storeCode.includes('activeForumTopic') && storeCode.includes('forumTopics'))
  assert(storeCode.includes("'tg:get-topic-messages'"))
})
test('nativeStore has Telegram forum topic list actions', () => {
  assert(storeCode.includes("'tg:get-forum-topics'") && storeCode.includes('selectForumTopic') && storeCode.includes('closeForumTopics'))
})
test('nativeStore can mark selected Telegram forum topic as read separately', () => {
  assert(storeCode.includes('const markTopicRead') && storeCode.includes("'tg:mark-topic-read'"))
  assert(storeCode.includes("'tg:get-forum-topics'") && storeCode.includes('refreshedTopics') && storeCode.includes('activeForumTopic'))
  assert(storeCode.includes('TOPIC_READ_REFRESH_DELAYS_MS') && storeCode.includes('retryScheduled'))
  assert(!storeCode.includes('unreadCount: 0, readInboxMaxId'))
})

console.log('\n── Sidebar (InboxChatListSidebar): ──')
test('Sidebar: фильтр-кнопки рендерятся при 2+ аккаунтах', () => {
  assert(sidebarCode.includes('store.accounts.length >= 2'))
  assert(sidebarCode.includes("setChatFilter('all')"))
})
test('Sidebar: forum topic panel replaces normal chat list and has close button', () => {
  assert(sidebarCode.includes('forumTopicPanelChatId') && sidebarCode.includes('forumTopics.map'))
  assert(sidebarCode.includes('closeForumTopics') && sidebarCode.includes('Закрыть темы'))
})
test('Sidebar: forum topic icon can render Telegram custom emoji media', () => {
  assert(sidebarCode.includes('ForumTopicIcon') && sidebarCode.includes('topic.iconEmojiUrl'))
  assert(sidebarCode.includes('<img') && sidebarCode.includes('<video'))
})

console.log('\n── InboxMode / read guard: ──')
test('Read guard follows Telegram server read cursor', () => {
  assert(readByVisibilityCode.includes('read-guard-reset') && readByVisibilityCode.includes('maxEverSentRef.current = cursor'))
  assert(storeCode.includes('readInboxMaxId: options?.readInboxMaxId') && inboxCode.includes('readInboxMaxId: activeReadInboxMaxId'))
  assert(chatsIpcCode.includes('mark-read guard reset by server cursor') && chatsIpcCode.includes('before-read-cursor'))
})
test('InboxMode: фильтрация по chatFilter', () => {
  assert(inboxCode.includes('store.chatFilter') && inboxCode.includes("filter === 'all'"))
})
test('InboxMode: loadChats() без accountId (multi-account default)', () => {
  assert(inboxCode.includes('store.loadChats()'))
})
test('InboxMode: window.focus rescan не обновляет health', () => {
  assert(inboxCode.includes('rescanUnread?.({ updateHealth: false })'))
})
test('InboxMode: forum groups load topics before parent messages', () => {
  assert(inboxCode.includes('store.loadForumTopics') && inboxCode.includes('r?.isForum'))
  assert(inboxCode.includes('topicMessageKey') && inboxCode.includes('activeTopic'))
})

console.log('\n── NativeApp (sidebar / Connections): ──')
test('NativeApp: Connections buttons use health-check, not chat loading', () => {
  assert(navCode.includes('store.checkConnection?.(acc.id)'))
  assert(!navCode.includes('await store.loadCachedChats?.()') && !navCode.includes('return store.loadChats?.()'))
})
test('NativeApp: new API accounts auto-run initial health-check once', () => {
  assert(navCode.includes('autoCheckedAccountsRef') && navCode.includes('store.checkConnection?.(acc.id)'))
  assert(navCode.includes('autoCheckedAccountsRef.current.add(acc.id)'))
})
test('NativeApp: active API account follows opened chat or account filter', () => {
  const appCode = fs.readFileSync('src/App.jsx', 'utf8')
  assert(navCode.includes('onActiveNativeAccountChange'))
  assert(navCode.includes('store.chats.find(chat => chat.id === store.activeChatId)') && navCode.includes('activeChat?.accountId'))
  assert(navCode.includes("store.chatFilter !== 'all'"))
  assert(appCode.includes('activeNativeAccountIdRef.current') && appCode.includes('activeNativeAccountId: activeIdRef.current === NATIVE_CC_ID'))
})

console.log('\n── tg:account-update (multi-account safe): ──')
test('Removed: per-account очистка чатов (не глобальная)', () => {
  assert(ipcStoreCode.includes('chats.filter(c => c.accountId !== acc.id)'))
})
test('Removed: isLast → full wipe', () => {
  assert(ipcStoreCode.includes('wipeStats?.isLast') || ipcStoreCode.includes('isLast'))
})

console.log('\n── ChatRow / ChatListItem (метки аккаунта): ──')
test('ChatRow передаёт account в ChatListItem', () => {
  assert(rowCode.includes('account={account}'))
})
test('ChatRow передаёт hoveredAccountId', () => {
  assert(rowCode.includes('hoveredAccountId'))
})
test('ChatListItem использует messengerBranding', () => {
  assert(itemCode.includes('messengerBranding'))
})
test('ChatListItem рисует полосу слева (фирменный цвет)', () => {
  assert(itemCode.includes('stripeColor') && itemCode.includes('width: 3'))
})
test('ChatListItem рисует угловой emoji мессенджера на аватарке', () => {
  assert(itemCode.includes('messengerEmoji'))
})
test('ChatListItem рисует микро-строку «✈️ Telegram · БНК»', () => {
  assert(itemCode.includes('messengerName') && itemCode.includes('account.name'))
})
test('ChatListItem dimmed при hoveredAccountId !== chat.accountId', () => {
  assert(itemCode.includes('dimmed') && itemCode.includes('hoveredAccountId'))
})

console.log('\n── messengerBranding утилиты: ──')
test('MESSENGER_COLORS = фирменные', () => {
  assert(brandingCode.includes("'#2AABEE'") && brandingCode.includes("'#25D366'"))
})
test('MESSENGER_EMOJI = ✈️ для telegram', () => {
  assert(brandingCode.includes("'✈️'"))
})

console.log('\n── Sidebar NativeApp.jsx: ──')
test('AccountAvatar компонент круглый (borderRadius 50%)', () => {
  assert(navCode.includes('AccountAvatar') && navCode.includes("borderRadius: '50%'"))
})
test('Sidebar: угловая иконка мессенджера на аватарке', () => {
  assert(navCode.includes('MESSENGER_EMOJI'))
})
test('Sidebar: бейдж непрочитанных (unreadByAccount)', () => {
  assert(navCode.includes('unreadByAccount'))
})
test('Sidebar: hover → setHoveredAccountId', () => {
  assert(navCode.includes('setHoveredAccountId'))
})
test('Sidebar: NO яркая подсветка активного', () => {
  assert(!navCode.includes("'native-account--active'") || !navCode.includes("activeAccountId === acc.id ? 'native-account--active'"))
})
test('Sidebar: нет фейкового 0 мс для connected аккаунта', () => {
  assert(!navCode.includes('lastMs: 0'))
})

console.log('\n── Хедер открытого чата + Фильтр под поиском: ──')
test('InboxChatPanel импортирует messengerBranding', () => {
  assert(panelCode.includes('messengerBranding'))
})
test('Поиск идёт ПЕРВЫМ (раньше был фильтр)', () => {
  const inputIdx = sidebarCode.indexOf('Поиск по чатам')
  const filterIdx = sidebarCode.indexOf("setChatFilter('all')")
  assert(inputIdx > 0 && filterIdx > 0 && inputIdx < filterIdx)
})

console.log('\n── InboxMode (forum + scroll button + unread guard): ──')
test('InboxMode: forum parent shows no messages until topic is selected', () => {
  assert(inboxCode.includes('forumNeedsTopic') && inboxCode.includes('forumNeedsTopic ? []'))
})
test('InboxMode: forum topics have independent scroll/read keys', () => {
  assert(inboxCode.includes('activeViewKey') && inboxCode.includes('scrollKey: activeViewKey'))
  assert(inboxCode.includes('markReadCurrentView') && inboxCode.includes('store.markTopicRead'))
})
test('InboxMode: scroll button supports delayed single click and double-click to absolute bottom', () => {
  assert(inboxCode.includes('scrollButtonClickTimerRef') && inboxCode.includes('scrollToAbsoluteBottom'))
  assert(inboxCode.includes('button-scroll-absolute-bottom') && inboxCode.includes("markReadCurrentView(viewKey, lastId, { source: 'absolute-bottom' })"))
  assert(panelCode.includes('onDoubleClick') && panelCode.includes('scrollToAbsoluteBottom?.()'))
})

console.log('\n── Telegram-like unread opening: ──')
test('dialogs keep readInboxMaxId', () => {
  assert(chatsCode.includes('readInboxMaxId') && chatsCode.includes('d.dialog?.readInboxMaxId'))
})
test('message IPC supports aroundId/addOffset', () => {
  assert(messagesCode.includes('aroundId') && messagesCode.includes('addOffset') && messagesCode.includes('effectiveOffsetId'))
})
test('store requests unread window around read cursor', () => {
  assert(storeCode.includes('unreadWindowRequestParams') && storeCode.includes('UNREAD_WINDOW_MAX_MESSAGES'))
  assert(storeCode.includes('aroundId: unreadParams.aroundId') && storeCode.includes('addOffset: unreadParams.addOffset'))
})
test('incomplete unread window blocks mark-read', () => {
  assert(inboxCode.includes('unreadWindowIncomplete') && inboxCode.includes('mark-read-skip-unread-window'))
  assert(inboxCode.includes("source !== 'visibility'") && readByVisibilityCode.includes("source: 'visibility'") && forceReadAtBottomCode.includes("source: 'bottom'"))
  assert(panelCode.includes('native-unread-window-status') && storeCode.includes('unreadWindowLoading'))
})

console.log('\n── Read tracker + Telegram-style unread badges: ──')
test('all native chat types use root-aware reading line', () => {
  assert(readOnScrollAwayCode.includes("rootMargin: '-48% 0px -48% 0px'") && readOnScrollAwayCode.includes('read-line-read'))
  // v0.89.0: readRoot переехал в VirtualMessageList rowContext (виртуализация Phase 2).
  // InboxChatPanel держит scrollElement state, который синхронизируется с listRef.current.element,
  // и передаёт его как readRoot в rowContext → MessageBubble/AlbumBubble.
  const vlistCode = fs.readFileSync('src/native/components/VirtualMessageList.jsx', 'utf8')
  assert(vlistCode.includes('readRoot={readRoot}'),
    'VirtualMessageList must pass readRoot to MessageBubble/AlbumBubble via rowContext')
  assert(panelCode.includes('readRoot: scrollElement'),
    'InboxChatPanel must put scrollElement (= listRef.element) into rowContext.readRoot')
})
test('Native unread badges use Telegram-style count formatter', () => {
  assert(unreadFormatCode.includes('formatUnreadCount') && unreadFormatCode.includes('toFixed(1)'))
  assert(panelCode.includes('formatUnreadCount') && panelCode.includes('exactUntil: 9999'))
  assert(sidebarCode.includes('formatUnreadCount') && !sidebarCode.includes("topic.unreadCount > 999 ? '999+'"))
})
test('Unread-window banner uses fresh Telegram unread instead of stale opening snapshot', () => {
  assert(panelCode.includes('freshUnreadTotal') && panelCode.includes('activeTopic.unreadCount') && panelCode.includes('activeChat?.unreadCount'))
  assert(storeCode.includes('nextMessageWindows[windowKey]') && storeCode.includes('refreshedActiveTopic.unreadCount'))
})

console.log(`\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
if (failed > 0) process.exit(1)
