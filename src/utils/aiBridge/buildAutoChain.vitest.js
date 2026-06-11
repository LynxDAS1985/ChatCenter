// v1.2.1: тесты построения авто-резерв chain из настроек.

import { describe, it, expect } from 'vitest'
import { buildAutoChain } from './buildAutoChain.js'

describe('buildAutoChain — валидация', () => {
  it('без primary → []', () => {
    expect(buildAutoChain({}, null)).toEqual([])
    expect(buildAutoChain({}, undefined)).toEqual([])
  })

  it('primary без mode → []', () => {
    expect(buildAutoChain({}, {})).toEqual([])
  })
})

describe('buildAutoChain — primary только', () => {
  it('primary mode=api с providerId — первым в chain', () => {
    const chain = buildAutoChain({}, { mode: 'api', providerId: 'anthropic' })
    expect(chain[0]).toEqual({ mode: 'api', config: { providerId: 'anthropic' } })
  })

  it('primary mode=local — первым в chain', () => {
    const chain = buildAutoChain({}, { mode: 'local' })
    expect(chain[0].mode).toBe('local')
  })

  it('primary mode=webui — первым', () => {
    const chain = buildAutoChain({}, { mode: 'webui', providerId: 'openai' })
    expect(chain[0]).toEqual({ mode: 'webui', config: { providerId: 'openai' } })
  })
})

describe('buildAutoChain — добавление API провайдеров с ключами', () => {
  it('провайдер с apiKey добавлен в chain после primary', () => {
    const settings = {
      aiProviderKeys: {
        anthropic: { apiKey: 'sk-ant' },
        openai: { apiKey: 'sk-oai' },
      },
    }
    const chain = buildAutoChain(settings, { mode: 'api', providerId: 'anthropic' })
    // primary = anthropic, потом openai
    expect(chain[0].config.providerId).toBe('anthropic')
    const openai = chain.find(s => s.config.providerId === 'openai')
    expect(openai).toBeTruthy()
  })

  it('провайдер без apiKey НЕ добавлен', () => {
    const settings = {
      aiProviderKeys: {
        anthropic: { apiKey: 'sk-ant' },
        openai: { apiKey: '' },  // пустой
        deepseek: {},  // нет ключа
      },
    }
    const chain = buildAutoChain(settings, { mode: 'api', providerId: 'anthropic' })
    expect(chain.find(s => s.config.providerId === 'openai')).toBeFalsy()
    expect(chain.find(s => s.config.providerId === 'deepseek')).toBeFalsy()
  })

  it('gigachat с clientSecret (без apiKey) → добавлен', () => {
    const settings = {
      aiProviderKeys: {
        gigachat: { clientSecret: 'secret-x' },
      },
    }
    const chain = buildAutoChain(settings, { mode: 'api', providerId: 'anthropic' })
    expect(chain.find(s => s.config.providerId === 'gigachat')).toBeTruthy()
  })

  it('primary не дублируется', () => {
    const settings = {
      aiProviderKeys: {
        openai: { apiKey: 'sk-oai' },
      },
    }
    const chain = buildAutoChain(settings, { mode: 'api', providerId: 'openai' })
    const openaiCount = chain.filter(s => s.config.providerId === 'openai').length
    expect(openaiCount).toBe(1)
  })
})

describe('buildAutoChain — Ollama local', () => {
  it('local добавлен в конце с default URL', () => {
    const chain = buildAutoChain({}, { mode: 'api', providerId: 'anthropic' })
    const local = chain.find(s => s.mode === 'local')
    expect(local).toBeTruthy()
    expect(local.config.baseUrl).toBe('http://127.0.0.1:11434')
  })

  it('custom aiOllamaBaseUrl используется', () => {
    const settings = { aiOllamaBaseUrl: 'http://ollama.lan:11434' }
    const chain = buildAutoChain(settings, { mode: 'api', providerId: 'anthropic' })
    const local = chain.find(s => s.mode === 'local')
    expect(local.config.baseUrl).toBe('http://ollama.lan:11434')
  })

  it('если primary уже local → не дублируется', () => {
    const chain = buildAutoChain({}, { mode: 'local' })
    const localCount = chain.filter(s => s.mode === 'local').length
    expect(localCount).toBe(1)
  })
})

describe('buildAutoChain — порядок', () => {
  it('primary всегда первым', () => {
    const settings = {
      aiProviderKeys: {
        anthropic: { apiKey: 'a' },
        openai: { apiKey: 'b' },
        deepseek: { apiKey: 'c' },
      },
    }
    const chain = buildAutoChain(settings, { mode: 'api', providerId: 'deepseek' })
    expect(chain[0].config.providerId).toBe('deepseek')
  })

  it('local всегда последний', () => {
    const settings = {
      aiProviderKeys: {
        openai: { apiKey: 'b' },
      },
    }
    const chain = buildAutoChain(settings, { mode: 'api', providerId: 'anthropic' })
    expect(chain[chain.length - 1].mode).toBe('local')
  })
})

describe('buildAutoChain — полный сценарий', () => {
  it('юзер выбрал Claude API + есть ключи OpenAI/DeepSeek + Ollama → 4 шага', () => {
    const settings = {
      aiProviderKeys: {
        anthropic: { apiKey: 'sk-ant' },
        openai: { apiKey: 'sk-oai' },
        deepseek: { apiKey: 'sk-ds' },
      },
    }
    const chain = buildAutoChain(settings, { mode: 'api', providerId: 'anthropic' })
    expect(chain).toHaveLength(4)  // anthropic, openai, deepseek, local
    expect(chain[0].config.providerId).toBe('anthropic')
    expect(chain[chain.length - 1].mode).toBe('local')
  })
})
