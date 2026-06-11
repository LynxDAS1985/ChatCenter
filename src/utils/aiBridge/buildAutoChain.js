// v1.2.1: helper для сборки fallback chain из существующих настроек.
//
// Принимает:
//   - settings: глобальные settings (содержит aiProviderKeys + aiBridgeSelectors + aiOllamaBaseUrl)
//   - primary: {mode, providerId?, config?} — текущий выбор юзера (первым в chain)
//
// Возвращает массив steps для createFallbackChain:
//   [primary, ...rest]
//   где rest — все остальные провайдеры с ключами + локальный Ollama (если есть base URL).
//
// Дубликаты с primary удаляются (по mode+providerId).

const ALL_API_PROVIDERS = ['anthropic', 'openai', 'deepseek', 'gigachat']

/**
 * @param {object} settings — settings объект из electron-store
 * @param {{mode: string, providerId?: string, config?: object}} primary
 * @returns {Array<{mode: string, config: object}>}
 */
export function buildAutoChain(settings, primary) {
  if (!primary || !primary.mode) {
    return []
  }

  // Первый шаг — текущий выбор юзера
  const primaryStep = {
    mode: primary.mode,
    config: { ...(primary.config || {}) },
  }
  if (primary.providerId) primaryStep.config.providerId = primary.providerId

  const chain = [primaryStep]
  const seen = new Set([stepKey(primaryStep)])

  // Добавить остальные API провайдеры у которых есть ключ
  const providerKeys = (settings && settings.aiProviderKeys) || {}
  for (const providerId of ALL_API_PROVIDERS) {
    const pk = providerKeys[providerId]
    if (!pk) continue
    const hasKey = (pk.apiKey && String(pk.apiKey).trim()) ||
                   (providerId === 'gigachat' && pk.clientSecret && String(pk.clientSecret).trim())
    if (!hasKey) continue
    const step = { mode: 'api', config: { providerId } }
    const k = stepKey(step)
    if (seen.has(k)) continue
    chain.push(step)
    seen.add(k)
  }

  // Добавить локальный Ollama если URL настроен (или primary не local)
  const ollamaUrl = settings?.aiOllamaBaseUrl || 'http://127.0.0.1:11434'
  const localStep = { mode: 'local', config: { baseUrl: ollamaUrl } }
  const localKey = stepKey(localStep)
  if (!seen.has(localKey)) {
    chain.push(localStep)
    seen.add(localKey)
  }

  return chain
}

/**
 * Стабильный ключ шага для дедупликации.
 */
function stepKey(step) {
  return step.mode + ':' + (step.config?.providerId || '_default_')
}
