// v1.2.0 (Этап 2 AI Bridge): renderer-side обёртка над IPC.
//
// Использование:
//   import { sendQuestion } from '@/utils/aiBridge'
//   const ans = await sendQuestion({ mode: 'local', question: { text, source } })
//
// Возвращает AiBridgeAnswer (см. contracts.js) — даже при network error.

import { AI_BRIDGE_CONTRACT_VERSION } from './contracts.js'

const IPC_CHANNEL_SEND = 'ai-bridge:send'

/**
 * Отправить вопрос в AI через IPC bridge.
 *
 * @param {Object} args
 * @param {'api'|'webui'|'local'} args.mode
 * @param {import('./contracts.js').AiBridgeQuestion} args.question
 * @param {object} [args.config] — Конфиг bridge (baseUrl/model для local, etc).
 * @returns {Promise<import('./contracts.js').AiBridgeAnswer>}
 */
export async function sendQuestion({ mode, question, config }) {
  if (!mode || !question) {
    return {
      version: AI_BRIDGE_CONTRACT_VERSION,
      ok: false,
      text: '',
      providerId: 'openai',
      mode: mode || 'local',
      latencyMs: 0,
      error: {
        code: 'config_invalid',
        message: 'mode и question обязательны',
        retryable: false,
      },
    }
  }

  const invoke = window?.api?.invoke
  if (typeof invoke !== 'function') {
    return {
      version: AI_BRIDGE_CONTRACT_VERSION,
      ok: false,
      text: '',
      providerId: 'openai',
      mode,
      latencyMs: 0,
      error: {
        code: 'config_invalid',
        message: 'IPC unavailable: window.api.invoke не доступен',
        retryable: false,
      },
    }
  }

  try {
    return await invoke(IPC_CHANNEL_SEND, { mode, question, config })
  } catch (e) {
    return {
      version: AI_BRIDGE_CONTRACT_VERSION,
      ok: false,
      text: '',
      providerId: 'openai',
      mode,
      latencyMs: 0,
      error: {
        code: 'unknown',
        message: e?.message || String(e),
        retryable: false,
      },
    }
  }
}

export { AI_BRIDGE_CONTRACT_VERSION } from './contracts.js'
