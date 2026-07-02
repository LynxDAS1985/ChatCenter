const fs = require('fs')

const code = fs.readFileSync('shared/vkExecFallback.js', 'utf8')

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
})

test('sender and avatar are passed to the common notification path', () => {
  assert(code.includes('senderFromMsg(msg)'), 'missing sender extraction')
  assert(code.includes('avatarFrom(msg)'), 'missing avatar extraction')
  assert(code.includes('iconUrl'), 'missing iconUrl payload')
})

test('host receives vk-exec-fallback source for active-chat viewing guard', () => {
  assert(code.includes("source: payload.source || 'vk-exec-fallback'"), 'handleNewMessage must preserve fallback source')
  assert(code.includes("source:'vk-exec-fallback'"), 'page payload must mark vk-exec-fallback source')
})

test('sidebar unread preview emits a separate source for chats outside active history', () => {
  assert(code.includes('bindSidebar'), 'missing VK sidebar observer')
  assert(code.includes('scanSidebar'), 'missing VK sidebar scanner')
  assert(code.includes("source:'vk-sidebar-unread'"), 'sidebar unread must use a separate source')
  assert(code.includes("d.count>0"), 'sidebar notifications must require unread badge')
  assert(code.includes('ConvoListItem__message'), 'sidebar preview must read VK chat-list preview')
})

test('sidebar baseline prevents old unread rows from firing on bind', () => {
  assert(code.includes("scanSidebar('baseline-'+reason,false)"), 'sidebar bind must baseline without notifications')
  assert(code.includes('prev&&d.count>0'), 'sidebar emit must require a previous row state')
  assert(code.includes('d.count>(prev.count||0)||d.preview!==prev.preview'), 'sidebar emit must require unread increase or preview change')
})

console.log(`\nVK exec fallback: ${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
