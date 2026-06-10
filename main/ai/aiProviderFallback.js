// v1.1.3: multi-provider fallback — пробует список провайдеров по очереди.
//
// Используется когда у юзера сконфигурено несколько провайдеров и один
// временно недоступен (Anthropic 503, network error, rate limit и т.п.).
// Если первый ok → возвращает результат. Если упал → следующий по списку.
//
// НЕ ретраит на content errors (ошибка в input) — только на network/HTTP 5xx.
// HTTP 4xx (invalid API key, bad request) → fail сразу, не пробуем следующего.

/**
 * Определить — стоит ли пробовать другой провайдер при этой ошибке.
 * @param {Error|string} err
 * @returns {boolean}
 */
export function isFallbackWorthy(err) {
  if (!err) return false
  const msg = String(err?.message || err || '').toLowerCase()
  // Network / timeout / connection
  if (msg.includes('network') || msg.includes('econn') || msg.includes('timeout')
      || msg.includes('fetch failed') || msg.includes('socket')) return true
  // HTTP 5xx (server overloaded, internal error)
  if (/http 5\d\d/.test(msg)) return true
  // Rate limit — иногда есть смысл попробовать другой провайдер
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit')) return true
  // Anthropic / OpenAI specific overload
  if (msg.includes('overloaded') || msg.includes('service unavailable')) return true
  return false
}

/**
 * Создать callProvider с fallback по списку провайдеров.
 *
 * @param {object} deps
 *   - baseCallProvider: function ({provider, messages, tools, model, signal}) → response
 *     — обёртка вокруг fetch (createCallProvider({storage})).
 *   - getProviderChain: () => Array<{provider: string, model?: string}>
 *     — список провайдеров в порядке предпочтения. Первый = primary.
 *   - onFallback: (failedProvider, nextProvider, error) => void
 *     — callback для логирования fallback (опционально).
 *
 * @returns {function} callProvider с автоматическим fallback
 */
export function createCallProviderWithFallback(deps) {
  const baseCallProvider = deps?.baseCallProvider
  const getProviderChain = deps?.getProviderChain
  const onFallback = deps?.onFallback

  if (typeof baseCallProvider !== 'function') {
    throw new Error('createCallProviderWithFallback: baseCallProvider required')
  }
  if (typeof getProviderChain !== 'function') {
    throw new Error('createCallProviderWithFallback: getProviderChain required')
  }

  return async function callProvider({ messages, tools, signal }) {
    const chain = getProviderChain() || []
    if (!Array.isArray(chain) || chain.length === 0) {
      throw new Error('callProvider: no providers in chain')
    }

    let lastError = null
    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i]
      if (!entry?.provider) continue
      // Aborted между retries — выходим без попыток
      if (signal?.aborted) throw new Error('aborted')

      try {
        const result = await baseCallProvider({
          provider: entry.provider,
          model: entry.model,
          messages,
          tools,
          signal,
        })
        // Если упало раньше с другого провайдера и здесь успех — лог
        if (i > 0 && typeof onFallback === 'function') {
          try { onFallback(chain[i - 1].provider, entry.provider, lastError, 'success') } catch (_) {}
        }
        return result
      } catch (err) {
        lastError = err
        const hasNext = i + 1 < chain.length
        const worthRetry = hasNext && isFallbackWorthy(err)
        if (typeof onFallback === 'function') {
          try { onFallback(entry.provider, hasNext ? chain[i + 1].provider : null, err, worthRetry ? 'retrying' : 'giving_up') } catch (_) {}
        }
        if (!worthRetry) {
          // Не стоит пробовать следующего — content error / invalid API key.
          throw err
        }
        // Иначе → следующая итерация loop попробует следующего.
      }
    }
    // Все провайдеры упали с fallback-worthy ошибками
    throw new Error(`callProvider: all ${chain.length} providers failed. Last: ${lastError?.message || lastError}`)
  }
}

export const _internal = { isFallbackWorthy }
