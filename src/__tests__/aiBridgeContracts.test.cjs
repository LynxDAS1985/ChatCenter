// v1.2.0-alpha.1 (Этап 1): smoke test что контракт грузится и константа выставлена.
// Лёгкий CJS-тест (не Vitest) — выполняется в pre-push cjs-тестах.

// v1.2.468: файл переехал src/utils/aiBridge/contracts.js -> shared/aiBridgeContracts.js.
// Причина: его тянули ШЕСТЬ файлов главного процесса, то есть главный процесс лез за общим
// файлом вниз, в папку интерфейса — прямое нарушение ADR-050 («общий код живёт в корневой
// shared/»). Заодно освободились 135 строк общего бюджета интерфейса.
const assert = require('assert')

function run() {
  // ESM модуль грузим через dynamic import — обернём в IIFE через .mjs-стиль
  // (Node 22 поддерживает обычный require ESM через dynamic import)
  return import('../../shared/aiBridgeContracts.js').then(mod => {
    assert.strictEqual(typeof mod.AI_BRIDGE_CONTRACT_VERSION, 'number',
      'AI_BRIDGE_CONTRACT_VERSION должен быть number')
    assert.strictEqual(mod.AI_BRIDGE_CONTRACT_VERSION, 1,
      'AI_BRIDGE_CONTRACT_VERSION должен быть 1 (Этап 1)')
    console.log('  ✅ aiBridgeContracts: AI_BRIDGE_CONTRACT_VERSION =', mod.AI_BRIDGE_CONTRACT_VERSION)
  })
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ aiBridgeContracts:', err.message)
      process.exit(1)
    })
}

module.exports = run
