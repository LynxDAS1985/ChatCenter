const assert = require('assert')
const path = require('path')
const { pathToFileURL } = require('url')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log('  ✅ ' + name)
    passed++
  } catch (e) {
    console.error('  ❌ ' + name)
    console.error('     ' + e.message)
    failed++
  }
}

(async () => {
  console.log('\n🧪 Тесты MAX title fallback\n')
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), 'src/utils/maxTitleFallback.js')).href)

  test('parse: rich result keeps text, sender and data avatar', () => {
    const r = mod.parseMaxTitleFallbackResult(JSON.stringify({
      text: 'Здравствуйте, пришлите фото',
      sender: 'Иван Петров',
      avatar: 'data:image/png;base64,AAAA',
      source: 'max-title-sidebar',
    }))
    assert.strictEqual(r.text, 'Здравствуйте, пришлите фото')
    assert.strictEqual(r.senderName, 'Иван Петров')
    assert.strictEqual(r.iconDataUrl, 'data:image/png;base64,AAAA')
    assert.strictEqual(r.iconUrl, '')
    assert.strictEqual(r.source, 'max-title-sidebar')
  })

  test('parse: rich result keeps http avatar as iconUrl', () => {
    const r = mod.parseMaxTitleFallbackResult({ text: 'Фото', sender: 'Мария', avatar: 'https://max.ru/a.jpg' })
    assert.strictEqual(r.text, 'Фото')
    assert.strictEqual(r.senderName, 'Мария')
    assert.strictEqual(r.iconDataUrl, '')
    assert.strictEqual(r.iconUrl, 'https://max.ru/a.jpg')
  })

  test('parse: empty or broken result is blocked', () => {
    assert.strictEqual(mod.parseMaxTitleFallbackResult(''), null)
    assert.strictEqual(mod.parseMaxTitleFallbackResult('{}'), null)
    assert.strictEqual(mod.parseMaxTitleFallbackResult('{bad json'), null)
  })

  test('cache: avatar is scoped by messenger, chat and sender', () => {
    const cache = {}
    const k1 = mod.rememberSenderAvatar(cache, 'max', 'Ivan Petrov', 'chat-a', 'https://cdn/old.jpg')
    const k2 = mod.rememberSenderAvatar(cache, 'max', 'Ivan Petrov', 'chat-b', 'https://cdn/other.jpg')
    assert.notStrictEqual(k1, k2)
    assert.strictEqual(mod.getSenderCacheEntry(cache, 'max', 'Ivan Petrov', 'chat-a').avatar, 'https://cdn/old.jpg')
    assert.strictEqual(mod.getSenderCacheEntry(cache, 'max', 'Ivan Petrov', 'chat-b').avatar, 'https://cdn/other.jpg')
  })

  test('cache: fresh avatar replaces old avatar, empty avatar does not erase it', () => {
    const cache = {}
    mod.rememberSenderAvatar(cache, 'max', 'Ivan Petrov', 'chat-a', 'https://cdn/old.jpg')
    mod.rememberSenderAvatar(cache, 'max', 'Ivan Petrov', 'chat-a', '')
    assert.strictEqual(mod.getSenderCacheEntry(cache, 'max', 'Ivan Petrov', 'chat-a').avatar, 'https://cdn/old.jpg')
    mod.rememberSenderAvatar(cache, 'max', 'Ivan Petrov', 'chat-a', 'https://cdn/new.jpg')
    assert.strictEqual(mod.getSenderCacheEntry(cache, 'max', 'Ivan Petrov', 'chat-a').avatar, 'https://cdn/new.jpg')
  })

  test('cache: fallback fills only missing avatar for same sender', () => {
    const cache = {}
    const logs = []
    mod.rememberSenderAvatar(cache, 'max', 'Ivan Petrov', 'chat-a', 'https://cdn/new.jpg')
    const extra = { senderName: 'Ivan Petrov', chatTag: 'chat-a' }
    mod.applySenderAvatarFallback(extra, cache, 'max', (...args) => logs.push(args), 'hello')
    assert.strictEqual(extra.iconUrl, 'https://cdn/new.jpg')
    const other = { senderName: 'Maria', chatTag: 'chat-a' }
    mod.applySenderAvatarFallback(other, cache, 'max', () => {}, 'hello')
    assert.strictEqual(other.iconUrl, undefined)
    assert(logs.length === 1)
  })


  test('script: uses MAX sidebar first and active chat second only', () => {
    const script = mod.buildMaxTitleFallbackScript()
    assert(script.includes('function sidebarSnapshot()'))
    assert(script.includes('function activeChatSnapshot()'))
    assert(script.includes('sidebarSnapshot() || activeChatSnapshot()'))
    assert(!script.includes('visibleIncomingSnapshot'))
    assert(!script.includes('max-title-visible'))
    assert(script.includes('wrapper--withActions'))
  })

  test('script: keeps structural outgoing filters without word blacklist', () => {
    const script = mod.buildMaxTitleFallbackScript()
    assert(script.includes('out|own|self|right|outgoing'))
    assert(!script.includes('18 июн'))
    assert(!script.includes('Спасибо 18:34'))
    assert(!script.includes('isBlockedMaxTitleFallbackText'))
  })

  test('script: parses MAX sidebar structurally, not by last short text', () => {
    const script = mod.buildMaxTitleFallbackScript()
    assert(script.includes('function leafItems(root)'))
    assert(script.includes('isMetaItem'))
    assert(script.includes('isBadgeItem'))
    assert(script.includes('isTitleItem'))
    assert(script.includes('isAuthorItem'))
    assert(script.includes('bodyClass'))
    assert(script.includes('chatTag'))
    assert(script.includes('avatarImage'))
    assert(script.includes('emojis'))
  })

  test('script: returns http avatar before canvas export', () => {
    const script = mod.buildMaxTitleFallbackScript()
    const httpPos = script.indexOf("if (img.src.startsWith('http')) return img.src;")
    const canvasPos = script.indexOf("c.getContext('2d').drawImage")
    assert(httpPos > -1, 'http avatar fallback must exist')
    assert(canvasPos > -1, 'canvas export path must still exist')
    assert(httpPos < canvasPos, 'http avatar URL must not be lost when canvas export is blocked by CORS')
  })


  test('script: generated regex escapes keep runtime meaning', () => {
    const script = mod.buildMaxTitleFallbackScript()
    assert(script.includes('st\\.max\\.ru\\/emojis'))
    assert(script.includes('/[:：]\\s*$/'))
    assert(script.includes('/^[1-9]\\d{0,3}$/'))
    assert(script.includes("replace(/\\s+/g, ' ')"))
  })

  test('script: generated WebView script compiles', () => {
    const script = mod.buildMaxTitleFallbackScript()
    assert.doesNotThrow(() => new Function(script))
  })
  console.log(`\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
  if (failed) process.exit(1)
})()
