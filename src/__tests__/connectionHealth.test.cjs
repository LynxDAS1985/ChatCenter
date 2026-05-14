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

console.log('\n🧪 connectionHealth\n')

async function run() {
  const mod = await import('../utils/connectionHealth.js')

  test('createPendingHealth создаёт ожидание проверки', function() {
    const h = mod.createPendingHealth({ id: 'vk', label: 'ВКонтакте', now: 1000 })
    assert.strictEqual(h.state, mod.HEALTH_PENDING)
    assert.strictEqual(h.id, 'vk')
    assert.strictEqual(h.label, 'ВКонтакте')
    assert.strictEqual(h.startedAt, 1000)
  })

  test('markHealthByDuration быстрое событие переводит в ok', function() {
    const h = mod.markHealthByDuration(
      mod.createPendingHealth({ id: 'tg', startedAt: 1000, now: 1000 }),
      { now: 1800, slowMs: 10000 }
    )
    assert.strictEqual(h.state, mod.HEALTH_OK)
    assert.strictEqual(h.lastMs, 800)
  })

  test('markHealthPending очищает старый lastMs на время новой проверки', function() {
    const prev = mod.markHealthByDuration(
      mod.createPendingHealth({ id: 'tg-api', startedAt: 1000, now: 1000 }),
      { now: 2500, slowMs: 10000 }
    )
    const pending = mod.markHealthPending(prev, { now: 3000, details: 'Новая проверка' })
    assert.strictEqual(pending.state, mod.HEALTH_PENDING)
    assert.strictEqual(pending.lastMs, null)
  })

  test('markHealthOk без явного lastMs не раздувает старый startedAt', function() {
    const h = mod.markHealthOk(
      mod.createPendingHealth({ id: 'tg-web', startedAt: 1000, now: 1000, lastMs: 120 }),
      { now: 300000 }
    )
    assert.strictEqual(h.state, mod.HEALTH_OK)
    assert.strictEqual(h.lastMs, 120)
  })

  test('markHealthOk без явного lastMs оставляет пустой ответ пустым', function() {
    const h = mod.markHealthOk(
      mod.createPendingHealth({ id: 'vk', startedAt: 1000, now: 1000 }),
      { now: 300000 }
    )
    assert.strictEqual(h.state, mod.HEALTH_OK)
    assert.strictEqual(h.lastMs, null)
  })

  test('markHealthByDuration долгое событие переводит в slow', function() {
    const h = mod.markHealthByDuration(
      mod.createPendingHealth({ id: 'vk', startedAt: 1000, now: 1000 }),
      { now: 13000, slowMs: 10000 }
    )
    assert.strictEqual(h.state, mod.HEALTH_SLOW)
    assert.strictEqual(h.lastMs, 12000)
  })

  test('markHealthError сохраняет код и текст ошибки', function() {
    const h = mod.markHealthError(
      mod.createPendingHealth({ id: 'max', startedAt: 1000, now: 1000 }),
      { now: 2000, errorCode: -105, errorText: 'NAME_NOT_RESOLVED' }
    )
    assert.strictEqual(h.state, mod.HEALTH_ERROR)
    assert.strictEqual(h.errorCode, -105)
    assert.strictEqual(h.errorText, 'NAME_NOT_RESOLVED')
  })

  test('getOverallHealth выбирает худший статус', function() {
    const overall = mod.getOverallHealth([
      { state: mod.HEALTH_OK },
      { state: mod.HEALTH_SLOW },
      { state: mod.HEALTH_PENDING },
    ])
    assert.strictEqual(overall, mod.HEALTH_SLOW)
  })

  test('tooltip не упоминает monitorStatus', function() {
    const text = mod.getHealthTooltip({ id: 'vk', label: 'ВКонтакте', state: mod.HEALTH_SLOW, lastMs: 18000, lastCheckedAt: 1000 })
    assert(text.includes('ВКонтакте'))
    assert(text.includes('Медленно отвечает'))
    assert(!text.includes('Мониторинг'))
  })

  console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
  if (failed > 0) process.exit(1)
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})
