import { describe, it, expect } from 'vitest'
import { formatAiAgentBridgeError } from './agentBridgeErrors.js'

describe('formatAiAgentBridgeError', () => {
  it('shows a plain message when WebView is not registered', () => {
    const text = formatAiAgentBridgeError({
      ok: false,
      providerId: 'gigachat',
      mode: 'webui',
      error: {
        code: 'config_invalid',
        message: 'WebView для gigachat не открыт',
      },
    })

    expect(text).toContain('ГигаЧат открыт как сайт')
    expect(text).toContain('мост ещё не готов')
  })

  it('keeps provider error message for non-webui errors', () => {
    expect(formatAiAgentBridgeError({
      ok: false,
      providerId: 'openai',
      mode: 'api',
      error: { code: 'network_error', message: 'нет сети' },
    })).toBe('нет сети')
  })
})
