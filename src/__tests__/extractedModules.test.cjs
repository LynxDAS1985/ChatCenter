/**
 * Тесты extractedModules — runtime-тесты для вынесенных утилит из monitor.preload.js
 *
 * Запуск: node src/__tests__/extractedModules.test.cjs
 */

var fs = require('fs')
var path = require('path')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed') }
function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || '') + ' expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual))
}

// ═══════════════════════════════════════════════════════════════════
// 1. messageExtractor.js — extractMsgText()
// ═══════════════════════════════════════════════════════════════════
console.log('\n🧪 Тесты extractedModules\n')
console.log('── messageExtractor.js ──')

// preload utils используют module.exports но package.json "type":"module"
// → require() пытается загрузить как ESM. Обходим через vm.runInNewContext
var vm = require('vm')
function loadCjsModule(filePath) {
  var code = fs.readFileSync(filePath, 'utf8')
  var mod = { exports: {} }
  var sandbox = { module: mod, exports: mod.exports, require: require, console: console, __filename: filePath, __dirname: path.dirname(filePath) }
  vm.runInNewContext(code, sandbox, { filename: filePath })
  return mod.exports
}

var { extractMsgText, EXTRACT_SPAM, QUICK_MSG_SELECTORS } = loadCjsModule('main/preloads/utils/messageExtractor.js')

// Helper: create a simple mock node with textContent
function mockNode(text) {
  return { textContent: text, children: [], querySelectorAll: function() { return [] } }
}

test('extractMsgText: normal message returns text', function() {
  var result = extractMsgText(mockNode('Привет, как дела?'), 'telegram')
  assertEqual(result, 'Привет, как дела?')
})

test('extractMsgText: message with timestamp strips time', function() {
  var result = extractMsgText(mockNode('Привет 14:30'), 'max')
  assertEqual(result, 'Привет')
})

test('extractMsgText: "Печатает..." returns empty (spam)', function() {
  var result = extractMsgText(mockNode('Печатает'), 'telegram')
  assertEqual(result, '', 'Печатает should be filtered')
})

test('extractMsgText: "typing" returns empty', function() {
  var result = extractMsgText(mockNode('typing'), 'telegram')
  assertEqual(result, '', 'typing should be filtered')
})

test('extractMsgText: "online" returns empty', function() {
  var result = extractMsgText(mockNode('online'), 'telegram')
  assertEqual(result, '', 'online should be filtered')
})

test('extractMsgText: empty string returns empty', function() {
  var result = extractMsgText(mockNode(''), 'telegram')
  assertEqual(result, '', 'empty string should return empty')
})

test('extractMsgText: single char returns empty (too short)', function() {
  var result = extractMsgText(mockNode('A'), 'telegram')
  assertEqual(result, '', 'single char should return empty')
})

test('extractMsgText: null node returns empty gracefully', function() {
  var result = extractMsgText({ textContent: null, children: [], querySelectorAll: function() { return [] } }, 'telegram')
  assertEqual(result, '', 'null textContent should return empty')
})

test('extractMsgText: pure timestamp "18:22" returns empty', function() {
  var result = extractMsgText(mockNode('18:22'), 'max')
  assertEqual(result, '', 'pure timestamp should return empty')
})

test('extractMsgText: VK time-ago "три минуты назад" returns empty', function() {
  var result = extractMsgText(mockNode('три минуты назад'), 'vk')
  assertEqual(result, '', 'time-ago should be filtered')
})

test('extractMsgText: per-messenger spam — MAX "ред." returns empty', function() {
  var result = extractMsgText(mockNode('ред.'), 'max')
  assertEqual(result, '', 'MAX "ред." should be filtered')
})

test('extractMsgText: per-messenger spam — WhatsApp status-dblcheck returns empty', function() {
  var result = extractMsgText(mockNode('status-dblcheck'), 'whatsapp')
  assertEqual(result, '', 'WhatsApp status should be filtered')
})

test('extractMsgText: EXTRACT_SPAM has per-messenger keys', function() {
  assert(Array.isArray(EXTRACT_SPAM.max), 'max spam array')
  assert(Array.isArray(EXTRACT_SPAM.whatsapp), 'whatsapp spam array')
  assert(Array.isArray(EXTRACT_SPAM.vk), 'vk spam array')
  assert(Array.isArray(EXTRACT_SPAM.telegram), 'telegram spam array')
})

test('extractMsgText: QUICK_MSG_SELECTORS has per-messenger keys', function() {
  assert(typeof QUICK_MSG_SELECTORS.max === 'string', 'max selector')
  assert(typeof QUICK_MSG_SELECTORS.whatsapp === 'string', 'whatsapp selector')
  assert(typeof QUICK_MSG_SELECTORS.vk === 'string', 'vk selector')
  assert(typeof QUICK_MSG_SELECTORS.telegram === 'string', 'telegram selector')
})

// ═══════════════════════════════════════════════════════════════════
// 2. domSelectors.js — isSidebarNode() with mock elements
// ═══════════════════════════════════════════════════════════════════
console.log('\n── domSelectors.js ──')

// isSidebarNode traverses parentElement up to 8 levels, checking className against regex.
// For simple mocks we create objects with className and no parentElement (stops after 1 check).
// We also need to stub document.body so the loop terminates.
var domSelectorsCode = fs.readFileSync('main/preloads/utils/domSelectors.js', 'utf8')

// We can't require domSelectors directly because it uses document.querySelector/document.body.
// Instead, extract and test isSidebarNode with a minimal global mock.
var _origDoc = typeof document !== 'undefined' ? document : undefined
var mockBody = { id: '', className: '' }
global.document = { body: mockBody, querySelector: function() { return null } }

// Re-require with document mock in place
// domSelectors использует document.body / document.querySelector — мокаем
function loadCjsModuleWithDoc(filePath) {
  var code = fs.readFileSync(filePath, 'utf8')
  var mod = { exports: {} }
  var sandbox = {
    module: mod, exports: mod.exports, require: require, console: console,
    __filename: filePath, __dirname: path.dirname(filePath),
    document: { body: mockBody, querySelector: function() { return null } }
  }
  vm.runInNewContext(code, sandbox, { filename: filePath })
  return sandbox
}
var domSandbox = loadCjsModuleWithDoc('main/preloads/utils/domSelectors.js')
var domSelectors = domSandbox.module.exports
var isSidebarNode = domSelectors.isSidebarNode
test('isSidebarNode: element with className "chatlist" → true', function() {
  var node = { className: 'chatlist some-class', id: '', parentElement: domSandbox.document.body, getAttribute: function() { return null } }
  assert(isSidebarNode(node) === true, 'chatlist should be sidebar')
})

test('isSidebarNode: element with className "ConvoListItem" → true', function() {
  var node = { className: 'ConvoListItem svelte-abc', id: '', parentElement: domSandbox.document.body, getAttribute: function() { return null } }
  assert(isSidebarNode(node) === true, 'ConvoListItem should be sidebar')
})

test('isSidebarNode: element with className "scrollListContent" → true', function() {
  var node = { className: 'scrollListContent', id: '', parentElement: domSandbox.document.body, getAttribute: function() { return null } }
  assert(isSidebarNode(node) === true, 'scrollListContent should be sidebar')
})

test('isSidebarNode: element with id "side" → true (WhatsApp)', function() {
  var node = { className: '', id: 'side', parentElement: domSandbox.document.body, getAttribute: function() { return null } }
  assert(isSidebarNode(node) === true, 'id=side should be sidebar')
})

test('isSidebarNode: element with role="navigation" → true', function() {
  var node = { className: '', id: '', parentElement: domSandbox.document.body, getAttribute: function(attr) { return attr === 'role' ? 'navigation' : null } }
  assert(isSidebarNode(node) === true, 'role=navigation should be sidebar')
})

test('isSidebarNode: element with className "message-bubble" → false', function() {
  var node = { className: 'message-bubble', id: '', parentElement: domSandbox.document.body, getAttribute: function() { return null } }
  assert(isSidebarNode(node) === false, 'message-bubble should NOT be sidebar')
})

test('isSidebarNode: element with className "im-history" → false', function() {
  var node = { className: 'im-history', id: '', parentElement: domSandbox.document.body, getAttribute: function() { return null } }
  assert(isSidebarNode(node) === false, 'im-history should NOT be sidebar')
})

test('isSidebarNode: parent traversal — child of sidebar node → true', function() {
  var parent = { className: 'ConvoList__items', id: '', parentElement: domSandbox.document.body, getAttribute: function() { return null } }
  var child = { className: 'some-text', id: '', parentElement: parent, getAttribute: function() { return null } }
  assert(isSidebarNode(child) === true, 'child of ConvoList should be sidebar via parent')
})

test('domSelectors: exports CHAT_CONTAINER_SELECTORS', function() {
  assert(domSelectors.CHAT_CONTAINER_SELECTORS != null, 'CHAT_CONTAINER_SELECTORS should exist')
  assert(Array.isArray(domSelectors.CHAT_CONTAINER_SELECTORS.vk), 'vk selectors')
  assert(Array.isArray(domSelectors.CHAT_CONTAINER_SELECTORS.max), 'max selectors')
})

test('domSelectors: findChatContainer is a function', function() {
  assert(typeof domSelectors.findChatContainer === 'function', 'findChatContainer should be a function')
})

test('domSelectors: getChatContainerEl / setChatContainerEl work', function() {
  domSelectors.setChatContainerEl('test-el')
  assertEqual(domSelectors.getChatContainerEl(), 'test-el')
  domSelectors.setChatContainerEl(null)
  assertEqual(domSelectors.getChatContainerEl(), null)
})

// Restore document
if (_origDoc) { global.document = _origDoc } else { delete global.document }

// ═══════════════════════════════════════════════════════════════════
// 3. chatMetadata.js — verify exports exist
// ═══════════════════════════════════════════════════════════════════
console.log('\n── chatMetadata.js ──')

var chatMetaCode = fs.readFileSync('main/preloads/utils/chatMetadata.js', 'utf8')

test('chatMetadata: exports getActiveChatSender', function() {
  assert(chatMetaCode.includes('function getActiveChatSender'), 'getActiveChatSender function should exist')
  assert(chatMetaCode.includes('getActiveChatSender'), 'should be exported')
})

test('chatMetadata: exports getActiveChatAvatar', function() {
  assert(chatMetaCode.includes('function getActiveChatAvatar'), 'getActiveChatAvatar function should exist')
  assert(chatMetaCode.includes('getActiveChatAvatar'), 'should be exported')
})

test('chatMetadata: module.exports includes both functions', function() {
  assert(/module\.exports\s*=\s*\{[^}]*getActiveChatSender/.test(chatMetaCode), 'getActiveChatSender in exports')
  assert(/module\.exports\s*=\s*\{[^}]*getActiveChatAvatar/.test(chatMetaCode), 'getActiveChatAvatar in exports')
})

// ═══════════════════════════════════════════════════════════════════
// 4. messageRetrieval.js — verify exports
// ═══════════════════════════════════════════════════════════════════
console.log('\n── messageRetrieval.js ──')

var msgRetrCode = fs.readFileSync('main/preloads/utils/messageRetrieval.js', 'utf8')

test('messageRetrieval: exports getLastMessageText', function() {
  assert(msgRetrCode.includes('function getLastMessageText'), 'getLastMessageText function should exist')
  assert(/module\.exports\s*=\s*\{[^}]*getLastMessageText/.test(msgRetrCode), 'in exports')
})

test('messageRetrieval: exports getVKLastIncomingText', function() {
  assert(msgRetrCode.includes('function getVKLastIncomingText'), 'getVKLastIncomingText function should exist')
  assert(/module\.exports\s*=\s*\{[^}]*getVKLastIncomingText/.test(msgRetrCode), 'in exports')
})

// ═══════════════════════════════════════════════════════════════════
// 5. diagnostics.js — verify exports
// ═══════════════════════════════════════════════════════════════════
console.log('\n── diagnostics.js ──')

var diagCode = fs.readFileSync('main/preloads/utils/diagnostics.js', 'utf8')

test('diagnostics: exports runDiagnostics', function() {
  assert(diagCode.includes('function runDiagnostics'), 'runDiagnostics function should exist')
  assert(/module\.exports\s*=\s*\{[^}]*runDiagnostics/.test(diagCode), 'in exports')
})

test('diagnostics: exports resetDiagnostics', function() {
  assert(diagCode.includes('function resetDiagnostics'), 'resetDiagnostics function should exist')
  assert(/module\.exports\s*=\s*\{[^}]*resetDiagnostics/.test(diagCode), 'in exports')
})

test('diagnostics: resetDiagnostics resets diagSent flag', function() {
  assert(diagCode.includes('diagSent = false'), 'resetDiagnostics should set diagSent = false')
})

// ═══════════════════════════════════════════════════════════════════
// 6. dockPinUtils.js — verify file exists (ESM + Electron deps, can't require)
// ═══════════════════════════════════════════════════════════════════
console.log('\n── dockPinUtils.js ──')

test('dockPinUtils.js: file exists', function() {
  assert(fs.existsSync('main/handlers/dockPinUtils.js'), 'main/handlers/dockPinUtils.js should exist')
})

test('dockPinUtils.js: contains expected exports', function() {
  var code = fs.readFileSync('main/handlers/dockPinUtils.js', 'utf8')
  assert(code.length > 50, 'file should have content')
  assert(code.includes('export') || code.includes('module.exports'), 'should have exports')
})

// ═══════════════════════════════════════════════════════════════════
// 7. consoleMessageHandler.js — verify file exists (ESM + complex deps)
// ═══════════════════════════════════════════════════════════════════
console.log('\n── consoleMessageHandler.js ──')

test('consoleMessageHandler.js: file exists', function() {
  assert(fs.existsSync('src/utils/consoleMessageHandler.js'), 'src/utils/consoleMessageHandler.js should exist')
})

test('consoleMessageHandler.js: contains expected content', function() {
  var code = fs.readFileSync('src/utils/consoleMessageHandler.js', 'utf8')
  assert(code.length > 50, 'file should have content')
  assert(code.includes('export') || code.includes('module.exports'), 'should have exports')
})

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════
console.log('\n' + (failed === 0 ? '✅' : '❌') + ' extractedModules: ' + passed + ' passed, ' + failed + ' failed\n')
if (failed > 0) process.exit(1)
