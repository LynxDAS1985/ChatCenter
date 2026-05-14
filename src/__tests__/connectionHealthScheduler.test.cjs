const assert = require('assert')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✅ ' + name)
  } catch (e) {
    failed++
    console.log('  ❌ ' + name + ': ' + e.message)
  }
}

;(async () => {
  console.log('\n🧪 connectionHealthScheduler\n')
  const mod = await import('../utils/connectionHealthScheduler.js')
  const now = 1000000

  test('активное подключение проверяется чаще неактивного', () => {
    assert.strictEqual(mod.nextHealthDelay({ item: { state: 'ok' }, isActive: true }), 30000)
    assert.strictEqual(mod.nextHealthDelay({ item: { state: 'ok' }, isActive: false }), 180000)
  })

  test('проблемное подключение проверяется раз в 60 секунд', () => {
    assert.strictEqual(mod.nextHealthDelay({ item: { state: 'slow' }, isActive: false }), 60000)
    assert.strictEqual(mod.nextHealthDelay({ item: { state: 'error' }, isActive: false }), 60000)
  })

  test('без фокуса окно проверяется редко', () => {
    assert.strictEqual(mod.nextHealthDelay({ item: { state: 'error' }, windowFocused: false }), 300000)
  })

  test('WebView во время загрузки пропускается', () => {
    const jobs = mod.selectConnectionHealthJobs({
      now,
      connectionHealth: {
        vk: { id: 'vk', type: 'webview', state: 'ok', lastCheckedAt: now - 999999 },
      },
      messengers: [{ id: 'vk', name: 'ВКонтакте', url: 'https://vk.com' }],
      webviewLoading: { vk: true },
    })
    assert.deepStrictEqual(jobs.webview, [])
  })

  test('не запускает больше 2 WebView проверок одновременно', () => {
    const jobs = mod.selectConnectionHealthJobs({
      now,
      connectionHealth: {
        a: { id: 'a', type: 'webview', state: 'ok', lastCheckedAt: 1 },
        b: { id: 'b', type: 'webview', state: 'ok', lastCheckedAt: 1 },
        c: { id: 'c', type: 'webview', state: 'ok', lastCheckedAt: 1 },
      },
      messengers: [
        { id: 'a', name: 'A', url: 'https://a.test' },
        { id: 'b', name: 'B', url: 'https://b.test' },
        { id: 'c', name: 'C', url: 'https://c.test' },
      ],
    })
    assert.strictEqual(jobs.webview.length, 2)
  })

  test('не запускает больше 1 Native/API проверки одновременно', () => {
    const jobs = mod.selectConnectionHealthJobs({
      now,
      connectionHealth: {
        tg1: { id: 'tg1', type: 'native', state: 'ok', lastCheckedAt: 1 },
        tg2: { id: 'tg2', type: 'native', state: 'ok', lastCheckedAt: 1 },
      },
    })
    assert.deepStrictEqual(jobs.native, [{ id: 'tg1' }])
  })

  test('Native/API считается активным, когда открыт ЦентрЧатов', () => {
    const jobs = mod.selectConnectionHealthJobs({
      now,
      activeNativeAccountId: 'tg1',
      connectionHealth: {
        tg1: { id: 'tg1', type: 'native', state: 'ok', lastCheckedAt: now - 31000 },
        tg2: { id: 'tg2', type: 'native', state: 'ok', lastCheckedAt: now - 31000 },
      },
    })
    assert.deepStrictEqual(jobs.native, [{ id: 'tg1' }])
  })

  test('in-flight подключения не дублируются', () => {
    const jobs = mod.selectConnectionHealthJobs({
      now,
      connectionHealth: {
        vk: { id: 'vk', type: 'webview', state: 'ok', lastCheckedAt: 1 },
        tg: { id: 'tg', type: 'native', state: 'ok', lastCheckedAt: 1 },
      },
      messengers: [{ id: 'vk', name: 'ВКонтакте', url: 'https://vk.com' }],
      inFlightWebview: new Set(['vk']),
      inFlightNative: new Set(['tg']),
    })
    assert.deepStrictEqual(jobs.webview, [])
    assert.deepStrictEqual(jobs.native, [])
  })

  console.log(`\n📊 Результат: ${passed} ✅ / ${failed} ❌ из ${passed + failed}`)
  if (failed) process.exit(1)
})()
