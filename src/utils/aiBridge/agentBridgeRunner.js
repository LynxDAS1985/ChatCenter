// v1.2.2: runner для AI Agent через AI Bridge (используется в useAIAgent).
//
// Вынесено из useAIAgent.js чтобы hook оставался в лимите 150 строк.
// Pure-ish — зависит только от window.api + setState (передаётся).

import { buildAutoChain } from './buildAutoChain.js'
import { getProviderCfg } from '../aiProviders.js'

/**
 * Запустить AI Agent через Bridge (простой Q&A, без tool use).
 * Поведение:
 *   1. Собирает question из source + recentMessages (последнее incoming → text, остальные → history).
 *   2. Строит auto-chain через buildAutoChain.
 *   3. Стримит шаги bridge_start + tool_result(bridge_answer).
 *   4. Возвращает AiBridgeAnswer от IPC.
 *
 * @param {object} params — { source, provider, recentMessages, settings }
 * @param {string} requestId
 * @param {Function} setState — React setState для useAIAgent
 * @returns {Promise<object>} AiBridgeAnswer
 */
export async function runAiAgentViaBridge(params, requestId, setState) {
  const source = params?.source || {}
  const recent = Array.isArray(params?.recentMessages) ? params.recentMessages : []
  const lastMsg = recent.length > 0 ? recent[recent.length - 1] : null
  const text = lastMsg?.text || source?.snippet || 'Помоги ответить клиенту в этом чате.'

  // History — все кроме последнего сообщения
  const history = recent.slice(0, -1)
    .filter(m => m && typeof m.text === 'string')
    .map(m => ({
      role: m.isOutgoing ? 'assistant' : 'user',
      text: m.text,
    }))

  const settings = params?.settings || {}
  const provider = params?.provider || 'anthropic'
  const providerCfg = getProviderCfg(settings, provider)
  const primary = providerCfg.mode === 'webview'
    ? {
        mode: 'webui',
        providerId: provider,
        config: {
          providerId: provider,
          selectors: settings?.aiBridgeSelectors?.[provider],
        },
      }
    : {
        mode: 'api',
        providerId: provider,
        config: {
          providerId: provider,
          model: providerCfg.model,
        },
      }

  const chain = buildAutoChain(settings, primary)

  // Stream шаг: старт
  setState(s => ({
    ...s,
    steps: [
      ...s.steps,
      { type: 'bridge_start', requestId, chainSize: chain.length, primary: provider },
    ],
  }))

  const payload = {
    chain,
    question: {
      version: 1,
      text,
      source: {
        messengerId: source.messengerId || 'native_cc',
        accountId: source.accountId,
        chatId: source.chatId,
        messageId: source.messageId,
      },
      history: history.length > 0 ? history : undefined,
      systemPrompt: 'Ты помощник менеджера. Сформулируй короткий вежливый ответ клиенту.',
    },
  }

  const r = await window.api.invoke('ai-bridge:send', payload)

  // Stream шаг: ответ
  setState(s => ({
    ...s,
    steps: [
      ...s.steps,
      {
        type: 'tool_result',
        name: 'bridge_answer',
        result: {
          ok: r?.ok,
          providerId: r?.providerId,
          mode: r?.mode,
          latencyMs: r?.latencyMs,
          attemptedFallbacks: r?.debug?.attemptedFallbacks || [],
        },
      },
    ],
  }))

  return r
}
