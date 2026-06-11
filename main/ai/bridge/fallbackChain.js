// v1.1.18 (Этап 9 AI Bridge): fallback chain — пробует bridges по очереди,
// при retryable=true ошибке переключается на следующий.
//
// Использование (внутри handleSend):
//   const chain = createFallbackChain([
//     { mode: 'api',   config: { providerId: 'anthropic' } },
//     { mode: 'api',   config: { providerId: 'openai' } },
//     { mode: 'local', config: { baseUrl: 'http://127.0.0.1:11434' } },
//   ], { createApiBridge, createLocalBridge, createWebUiBridge, callProvider })
//
//   const answer = await chain.ask(question)
//   // answer = ответ от первого успешного bridge, либо последний ответ если все упали.
//   // answer.debug.attemptedFallbacks = [{mode, providerId, errorCode}, ...] — детали попыток.
//
// Что считается «можно пробовать дальше»:
//   - error.retryable === true (network_error / server_error / rate_limited / streaming_timeout)
//   - error.code === 'config_invalid' если у нас нет ключа провайдера (auth_required не retryable но
//     bridge сам не упал — пробуем следующий)
// Что НЕ retryable (стоп сразу):
//   - aborted (юзер сам отменил)
//   - unsupported_mode (системная ошибка — fallback тоже не поможет)

import { AI_BRIDGE_CONTRACT_VERSION } from '../../../src/utils/aiBridge/contracts.js'

/**
 * @param {Array<{mode: string, config?: object}>} steps — цепочка попыток
 * @param {object} factories — { createApiBridge, createLocalBridge, createWebUiBridge, callProvider, fetch }
 * @returns {{ ask: (q) => Promise<import('../../../src/utils/aiBridge/contracts.js').AiBridgeAnswer> }}
 */
export function createFallbackChain(steps, factories) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('createFallbackChain: steps массив обязателен')
  }
  if (!factories) throw new Error('createFallbackChain: factories обязательны')

  return {
    async ask(question) {
      const t0 = Date.now()
      const attempted = []
      let lastAnswer = null

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        if (!step?.mode) {
          attempted.push({ mode: '?', providerId: '?', errorCode: 'config_invalid', message: 'step без mode' })
          continue
        }

        // Если signal уже abort'нут — стоп сразу
        if (question?.signal?.aborted) {
          return {
            version: AI_BRIDGE_CONTRACT_VERSION,
            ok: false, text: '', providerId: step.config?.providerId || 'openai',
            mode: step.mode, latencyMs: Date.now() - t0,
            error: { code: 'aborted', message: 'Запрос отменён', retryable: false },
            debug: { attemptedFallbacks: attempted },
          }
        }

        const bridge = buildBridgeForStep(step, factories)
        if (!bridge) {
          attempted.push({
            mode: step.mode, providerId: step.config?.providerId || null,
            errorCode: 'unsupported_mode',
            message: 'не удалось создать bridge для mode=' + step.mode,
          })
          continue
        }

        let answer
        try {
          answer = await bridge.ask(question)
        } catch (e) {
          answer = {
            version: AI_BRIDGE_CONTRACT_VERSION,
            ok: false, text: '', providerId: step.config?.providerId || 'openai',
            mode: step.mode, latencyMs: 0,
            error: { code: 'unknown', message: e?.message || String(e), retryable: true },
          }
        }

        lastAnswer = answer

        if (answer.ok) {
          // Успех — возвращаем + список того что было попробовано (если что-то было)
          if (attempted.length > 0) {
            answer.debug = {
              ...(answer.debug || {}),
              attemptedFallbacks: attempted,
              successfulStepIndex: i,
            }
          }
          return answer
        }

        // Ошибка — записываем попытку
        attempted.push({
          mode: step.mode,
          providerId: step.config?.providerId || null,
          errorCode: answer.error?.code || 'unknown',
          message: answer.error?.message || '',
        })

        // aborted / unsupported_mode → стоп, fallback не поможет
        const code = answer.error?.code
        if (code === 'aborted' || code === 'unsupported_mode') {
          answer.debug = { ...(answer.debug || {}), attemptedFallbacks: attempted }
          return answer
        }

        // retryable=true → пробуем следующий шаг
        // retryable=false (auth_required, config_invalid с ключом) → тоже стоп
        // НО — config_invalid без ключа (например missing API key) — это пробуем дальше,
        // потому что у юзера может быть ключ для следующего провайдера в chain.
        const isMissingKey = code === 'auth_required' && /missing|нет ключа|нужен ключ/i.test(answer.error?.message || '')
        if (!answer.error?.retryable && !isMissingKey) {
          // Не retryable + не missing key → юзеру нужно исправлять руками, fallback не поможет
          answer.debug = { ...(answer.debug || {}), attemptedFallbacks: attempted }
          return answer
        }

        // Иначе — продолжаем цикл (следующий step)
      }

      // Все шаги исчерпаны → возвращаем последний ответ + список попыток
      if (!lastAnswer) {
        return {
          version: AI_BRIDGE_CONTRACT_VERSION,
          ok: false, text: '', providerId: 'openai',
          mode: 'api', latencyMs: Date.now() - t0,
          error: { code: 'config_invalid', message: 'Все шаги в chain пустые', retryable: false },
          debug: { attemptedFallbacks: attempted },
        }
      }
      lastAnswer.debug = { ...(lastAnswer.debug || {}), attemptedFallbacks: attempted, exhausted: true }
      return lastAnswer
    },
  }
}

/**
 * Построить bridge для одного шага chain. Возвращает null если параметры невалидны.
 */
function buildBridgeForStep(step, factories) {
  const mode = step.mode
  const config = step.config || {}

  if (mode === 'local') {
    if (!factories.createLocalBridge) return null
    return factories.createLocalBridge(config, { fetch: factories.fetch })
  }
  if (mode === 'api') {
    if (!factories.createApiBridge || !factories.callProvider) return null
    if (!config.providerId) return null
    return factories.createApiBridge(config, { callProvider: factories.callProvider })
  }
  if (mode === 'webui') {
    if (!factories.createWebUiBridge) return null
    if (!config.providerId) return null
    return factories.createWebUiBridge(config)
  }
  return null
}
