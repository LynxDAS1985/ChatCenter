const fs = require('fs')

let passed = 0
let failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ok ' + name) }
  catch (e) { failed++; console.log('  fail ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\nNotification identity regression\n')

const notifMgrCode = fs.readFileSync('main/handlers/notificationManager.js', 'utf8')
const notifRendererCode = fs.readFileSync('main/notification.js', 'utf8')
const webviewHandleCode = fs.readFileSync('src/utils/webviewHandleNewMessage.js', 'utf8')
const webviewSetupCode = fs.readFileSync('src/utils/webviewSetup.js', 'utf8')
const consoleHandlerCode = fs.readFileSync('src/utils/consoleMessageHandler.js', 'utf8')

test('main dedup uses sender/chat scope', () => {
  assert(notifMgrCode.includes('function buildNotificationScope'))
  assert(notifMgrCode.includes('const dedupKey = dedupScope +'))
})

test('main sends stackKey for sender/chat grouping', () => {
  assert(notifMgrCode.includes('const stackKey = buildNotificationScope'))
  assert(notifMgrCode.includes('stackKey, dismissMs'))
})

test('renderer groups by stackKey before messengerId', () => {
  assert(notifRendererCode.includes('data.stackKey || data.messengerId'))
  assert(notifRendererCode.includes('stackKey: data.stackKey || data.messengerId'))
  assert(notifRendererCode.includes('item.stackKey || item.messengerId'))
})

test('webview dedup uses sender/chat scope', () => {
  assert(webviewHandleCode.includes('buildMessageDedupScope'))
  assert(webviewHandleCode.includes('dedupScope'))
})

test('MAX sidebar unread becomes notification identity for same-text messages', () => {
  assert(consoleHandlerCode.includes("data.src === 'max-sidebar' && data.u != null"))
  assert(consoleHandlerCode.includes("(maxSidebarUnread ? `u:${maxSidebarUnread}:` : '') + (normalizedText || text).slice(0, 40)"))
  assert(consoleHandlerCode.includes('extra.messageId = `max-sidebar:${senderScope || messengerId}:${maxSidebarUnread}`'))
})

test('webview passes notification messageId/source to main dedup', () => {
  assert(webviewHandleCode.includes('messageId: extra?.messageId || null'))
  assert(webviewHandleCode.includes('source: extra?.notifSource || extra?.source || null'))
})

test('console enrichment uses sender-aware avatar cache', () => {
  assert(consoleHandlerCode.includes('rememberSenderAvatar'))
  assert(consoleHandlerCode.includes('applySenderAvatarFallback'))
  assert(!consoleHandlerCode.includes('senderCacheRef.current[messengerId] = { name: extra.senderName, avatar: extra.iconUrl || extra.iconDataUrl'))
})

test('MAX IPC active-chat messages bypass old sender/mid dedup', () => {
  assert(webviewSetupCode.includes('isMaxIpc = /web\\.max\\.ru/.test(ipcUrl)'))
  assert(webviewSetupCode.includes('if (!isMaxIpc && midTsIpc'))
  assert(webviewSetupCode.includes('const ipcExtra = e.args[1]'))
  assert(consoleHandlerCode.includes('extra.senderName && !isMaxMsg'))
})

test('MAX renderer diagnostics log IPC and title deltas', () => {
  assert(webviewSetupCode.includes('[IPC-MAX] channel='))
  assert(webviewSetupCode.includes('MAX page-title-updated'))
  assert(webviewSetupCode.includes('activeId=${activeIdRef.current}'))
  assert(webviewSetupCode.includes('focused=${windowFocusedRef.current}'))
})

console.log('\nResult: ' + passed + ' ok / ' + failed + ' fail')
if (failed > 0) process.exit(1)
