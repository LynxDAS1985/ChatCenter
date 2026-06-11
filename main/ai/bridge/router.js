// v1.2.0-alpha.1 (Этап 1 AI Bridge): главный router — выбирает один из 3 bridge.
//
// На Этапе 1 это пустой скелет. Реальные реализации будут добавляться поэтапно:
//   - Этап 2: createLocalBridge (Ollama HTTP)
//   - Этап 3: createApiBridge (обёртка aiProviderCaller)
//   - Этап 4-6: createWebUiBridge (preload + DOM injection)
//   - Этап 9: createFallbackChain (мультибридж с retry)
//
// API единый: каждый bridge возвращает `{ ask(question) → Promise<AiBridgeAnswer> }`.
//
// ВАЖНО:
// - Этот файл загружается в main процессе (electron). Не использовать DOM-API.
// - НЕ console.* — только app:log (см. logger в main/utils/logger.js).
// - Возвращать error через AiBridgeAnswer{ ok:false, error:{...} } а не throw.

/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiBridgeMode} AiBridgeMode */
/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiBridgeQuestion} AiBridgeQuestion */
/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiBridgeAnswer} AiBridgeAnswer */

import { AI_BRIDGE_CONTRACT_VERSION } from '../../../src/utils/aiBridge/contracts.js'

/**
 * Главный селектор bridge. На Этапе 1 — каркас, реальные ветки добавятся
 * на следующих этапах.
 *
 * @param {AiBridgeMode} mode
 * @param {Object} deps — { localBridge, apiBridge, webUiBridge } (на будущее).
 * @returns {{ ask: (q: AiBridgeQuestion) => Promise<AiBridgeAnswer> }}
 */
export function createAiBridgeRouter(mode, deps = {}) {
  return {
    /**
     * @param {AiBridgeQuestion} question
     * @returns {Promise<AiBridgeAnswer>}
     */
    async ask(question) {
      const t0 = Date.now()
      try {
        if (mode === 'local' && deps.localBridge?.ask) {
          return await deps.localBridge.ask(question)
        }
        if (mode === 'api' && deps.apiBridge?.ask) {
          return await deps.apiBridge.ask(question)
        }
        if (mode === 'webui' && deps.webUiBridge?.ask) {
          return await deps.webUiBridge.ask(question)
        }
        // Bridge не подключён — нормальный ответ с ошибкой (не throw).
        return makeUnsupportedAnswer(mode, t0)
      } catch (e) {
        return {
          version: AI_BRIDGE_CONTRACT_VERSION,
          ok: false,
          text: '',
          providerId: 'openai',
          mode,
          latencyMs: Date.now() - t0,
          error: {
            code: 'unknown',
            message: e?.message || String(e),
            retryable: false,
          },
        }
      }
    },
  }
}

/**
 * Заглушка ответа когда bridge не подключён.
 * @param {AiBridgeMode} mode
 * @param {number} t0
 * @returns {AiBridgeAnswer}
 */
function makeUnsupportedAnswer(mode, t0) {
  return {
    version: AI_BRIDGE_CONTRACT_VERSION,
    ok: false,
    text: '',
    providerId: 'openai',
    mode,
    latencyMs: Date.now() - t0,
    error: {
      code: 'unsupported_mode',
      message: 'Bridge mode "' + mode + '" не зарегистрирован в router (Этап 1 — каркас).',
      retryable: false,
    },
  }
}
