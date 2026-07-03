const fs = require('fs')

const code = fs.readFileSync('shared/vkExecFallback.js', 'utf8')
const handlerCode = fs.readFileSync('src/utils/webviewHandleNewMessage.js', 'utf8')

let passed = 0
let failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  OK ' + name) }
  catch (e) { failed++; console.log('  FAIL ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\nVK exec fallback tests\n')

test('uses a dedicated console marker for host routing', () => {
  assert(code.includes('__CC_VK_EXEC_FALLBACK__'), 'missing VK fallback marker')
  assert(code.includes('parseVkExecFallbackMessage'), 'missing parser')
})

test('script stays in page world and does not depend on ipcRenderer', () => {
  assert(!code.includes('ipcRenderer'), 'fallback must not use ipcRenderer')
  assert(code.includes('console.log(PREFIX+'), 'page script must communicate through console-message')
})

test('script can upgrade an already injected page runtime', () => {
  assert(code.includes("SCRIPT_VERSION='1.2.52-sidebar-typing-status'"), 'missing versioned runtime marker')
  assert(code.includes('__ccVkExecFallbackObserver'), 'missing active observer handle')
  assert(code.includes('__ccVkSidebarObserver'), 'missing sidebar observer handle')
  assert(code.includes('__ccVkExecFallbackInstalled===SCRIPT_VERSION'), 'already-installed must be version-specific')
})

test('baseline prevents old VK messages from becoming notifications', () => {
  assert(code.includes('baseline=new Set()'), 'missing baseline set')
  assert(code.includes('baseline-existing-message'), 'missing baseline skip reason')
  assert(code.includes('baseline.add(fp)'), 'new fingerprints must be remembered')
})

test('rebinding handles VK SPA chat switches', () => {
  assert(code.includes('setInterval(function()'), 'missing periodic rebind check')
  assert(code.includes("bind('spa-rebind')"), 'missing spa-rebind path')
  assert(code.includes('currentObserver.disconnect'), 'old observer must be disconnected before rebind')
})

test('outgoing detection uses exact VK markers, not broad text filters', () => {
  assert(code.includes('ConvoStack--out'), 'missing exact VK outgoing stack marker')
  assert(code.includes('data-outgoing'), 'missing data outgoing marker')
  assert(code.includes('outgoing-own-message'), 'missing outgoing skip reason')
  assert(!code.includes('withoutBubbles|out'), 'withoutBubbles must not be treated as outgoing')
})

test('only structured VK message nodes can emit new-message', () => {
  assert(code.includes('findMessageEl'), 'missing message node lookup')
  assert(code.includes('no-message-node'), 'missing no-message-node skip')
  assert(code.includes("kind:'new-message'"), 'missing new-message emit')
  assert(code.includes("source:'vk-exec-fallback'"), 'missing source marker')
  assert(code.includes('isAfterNewMessagesMarker(msg,container)'), 'active VK messages must carry unread marker evidence')
  assert(code.includes('vkActiveUnread'), 'missing active unread evidence payload')
})

test('sender and avatar are passed to the common notification path', () => {
  assert(code.includes('senderFromMsg(msg)'), 'missing sender extraction')
  assert(code.includes('avatarFrom(msg)'), 'missing avatar extraction')
  assert(code.includes('iconUrl'), 'missing iconUrl payload')
})

test('host receives vk-exec-fallback source for active-chat viewing guard', () => {
  assert(code.includes("source: payload.source || 'vk-exec-fallback'"), 'handleNewMessage must preserve fallback source')
  assert(code.includes("source:'vk-exec-fallback'"), 'page payload must mark vk-exec-fallback source')
  assert(code.includes('vkActiveUnread: !!payload.vkActiveUnread'), 'host must pass active unread evidence to handler')
  assert(handlerCode.includes("extra?.source === 'vk-exec-fallback' && !extra?.vkActiveUnread"), 'handler must block only VK-EXEC without unread evidence')
  assert(handlerCode.includes("extra?.source === 'vk-exec-fallback' && extra?.vkActiveUnread"), 'handler must pass VK-EXEC with unread evidence')
})

test('sidebar unread preview emits a separate source for chats outside active history', () => {
  assert(code.includes('bindSidebar'), 'missing VK sidebar observer')
  assert(code.includes('scanSidebar'), 'missing VK sidebar scanner')
  assert(code.includes("source:'vk-sidebar-unread'"), 'sidebar unread must use a separate source')
  assert(code.includes("d.count>0"), 'sidebar notifications must require unread badge')
  assert(code.includes('ConvoListItem__message'), 'sidebar preview must read VK chat-list preview')
  assert(code.includes("querySelectorAll('[class*=\"ConvoListItem\"]').length>=2"), 'sidebar root must be a list parent, not one row')
  assert(!code.includes("closest('[class*=\"ConvoList\""), 'sidebar root must not use broad closest that matches ConvoListItem itself')
})

test('sidebar baseline prevents old unread rows from firing on bind', () => {
  assert(code.includes("scanSidebar('baseline-'+reason,false)"), 'sidebar bind must baseline without notifications')
  assert(code.includes('prev&&d.count>0'), 'sidebar emit must require a previous row state')
  assert(code.includes('d.count>(prev.count||0)||d.preview!==prev.preview'), 'sidebar emit must require unread increase or preview change')
})

test('sidebar rebind can recover fresh unread rows without old-history phantoms', () => {
  assert(code.includes('shouldEmitSidebarBaseline'), 'missing fresh baseline recovery')
  assert(code.includes("reason!=='baseline-spa-rebind'"), 'fresh baseline recovery must be limited to spa rebind')
  assert(code.includes('rowFreshMinutes'), 'missing sidebar freshness parser')
  assert(code.includes("reason:baselineFresh?'baseline-fresh-unread':reason"), 'missing explicit fresh unread reason')
  assert(code.includes('sidebarNotified'), 'missing sidebar notification memory')
  assert(code.includes('minutes!==null&&minutes<=10'), 'fresh unread window must be bounded')
  assert(code.includes('rows=${payload.rows'), 'diagnostics must include sidebar row count')
  assert(code.includes('emitted=${payload.emitted'), 'diagnostics must include sidebar emitted count')
})

test('sidebar diagnostics explain every relevant unread decision', () => {
  assert(code.includes("kind:'sidebar-row'"), 'missing per-row sidebar diagnostics')
  assert(code.includes('sidebarDecision'), 'missing sidebar decision helper')
  assert(code.includes('shouldLogSidebarRow'), 'missing sidebar diagnostic throttle')
  assert(code.includes("reason==='baseline-spa-rebind'&&index<40"), 'baseline rebind must log visible rows for diagnosis')
  assert(code.includes('decision:diag.decision'), 'sidebar row payload must include decision')
  assert(code.includes('freshMin'), 'sidebar row payload must include freshness result')
  assert(code.includes('prevPreview'), 'sidebar row payload must include previous preview')
  assert(code.includes('raw:String(d.raw'), 'sidebar row payload must include raw row text')
  assert(code.includes('decision=${payload.decision'), 'host trace must expose sidebar decision')
  assert(code.includes('preview=${String(payload.preview'), 'host trace must expose sidebar preview')
  assert(code.includes('isSidebarTypingStatus'), 'missing structural typing status detector')
  assert(code.includes('печатает'), 'typing status detector must use real UTF-8 Russian text')
  assert(code.includes('block-typing-status'), 'typing status must have a separate diagnostic decision')
  assert(code.includes('rawCompact===compact'), 'typing status must compare row structure, not only words')
})

console.log(`\nVK exec fallback: ${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
