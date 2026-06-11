// v1.1.7: тест миграции legacy settings mode/webviewUrl/contextMode
// из корня settings → в aiProviderKeys[pid] (для fix v1.1.5 бага set()).
//
// Поведение миграции (логика в AISidebar useEffect):
// - При монтировании AISidebar просканировать settings
// - Если settings.mode/webviewUrl/contextMode есть в корне И
//   в aiProviderKeys[pid] НЕТ соответствующего поля → переложить
// - НЕ удалять legacy из корня (для отката на 1-2 версии)
// - Срабатывает ОДИН раз (через migrationDoneRef)

import { describe, it, expect } from 'vitest'

// Pure helper, симулируем логику из useEffect AISidebar
function migrateLegacy(settings) {
  if (!settings) return { migrated: false, settings }
  const legacyFields = ['mode', 'webviewUrl', 'contextMode']
  const pid = settings.aiProvider || 'openai'
  const pKeys = { ...(settings.aiProviderKeys || {}) }
  const pData = { ...(pKeys[pid] || {}) }
  let migrated = false
  for (const f of legacyFields) {
    if (settings[f] !== undefined && pData[f] === undefined) {
      pData[f] = settings[f]
      migrated = true
    }
  }
  if (migrated) {
    pKeys[pid] = pData
    return { migrated: true, settings: { ...settings, aiProviderKeys: pKeys } }
  }
  return { migrated: false, settings }
}

describe('aiConfigMigration (v1.1.7)', () => {
  it('legacy settings.mode → aiProviderKeys[pid].mode', () => {
    const r = migrateLegacy({
      aiProvider: 'deepseek',
      mode: 'webview',  // ← legacy в корне (баг v1.1.5)
      aiProviderKeys: {
        deepseek: { apiKey: 'sk-test' },
      },
    })
    expect(r.migrated).toBe(true)
    expect(r.settings.aiProviderKeys.deepseek.mode).toBe('webview')
    // Legacy в корне ОСТАЁТСЯ для безопасного отката
    expect(r.settings.mode).toBe('webview')
  })

  it('legacy webviewUrl + contextMode → aiProviderKeys[pid]', () => {
    const r = migrateLegacy({
      aiProvider: 'openai',
      webviewUrl: 'https://custom.openai.com',
      contextMode: 'full',
      aiProviderKeys: { openai: { apiKey: 'sk-x' } },
    })
    expect(r.migrated).toBe(true)
    expect(r.settings.aiProviderKeys.openai.webviewUrl).toBe('https://custom.openai.com')
    expect(r.settings.aiProviderKeys.openai.contextMode).toBe('full')
  })

  it('если поле УЖЕ есть в aiProviderKeys[pid] → не перезаписываем', () => {
    const r = migrateLegacy({
      aiProvider: 'deepseek',
      mode: 'webview',  // legacy
      aiProviderKeys: {
        deepseek: { mode: 'api' },  // уже новое
      },
    })
    expect(r.migrated).toBe(false)
    expect(r.settings.aiProviderKeys.deepseek.mode).toBe('api')
  })

  it('нет legacy полей → migrated=false', () => {
    const r = migrateLegacy({
      aiProvider: 'deepseek',
      aiProviderKeys: { deepseek: { mode: 'api', apiKey: 'sk' } },
    })
    expect(r.migrated).toBe(false)
  })

  it('aiProviderKeys нет → создаётся для активного провайдера', () => {
    const r = migrateLegacy({
      aiProvider: 'gigachat',
      mode: 'webview',
      // нет aiProviderKeys
    })
    expect(r.migrated).toBe(true)
    expect(r.settings.aiProviderKeys.gigachat.mode).toBe('webview')
  })

  it('null settings → не падает', () => {
    expect(() => migrateLegacy(null)).not.toThrow()
    const r = migrateLegacy(null)
    expect(r.migrated).toBe(false)
  })

  it('частичная миграция: mode мигрируется, webviewUrl уже в pKeys', () => {
    const r = migrateLegacy({
      aiProvider: 'deepseek',
      mode: 'webview',           // мигрируется
      webviewUrl: 'https://x',   // legacy
      aiProviderKeys: {
        deepseek: { webviewUrl: 'https://existing.com' },  // уже есть
      },
    })
    expect(r.migrated).toBe(true)
    expect(r.settings.aiProviderKeys.deepseek.mode).toBe('webview')  // новый
    expect(r.settings.aiProviderKeys.deepseek.webviewUrl).toBe('https://existing.com')  // не перезатёрт
  })

  it('default provider = openai когда aiProvider не задан', () => {
    const r = migrateLegacy({
      mode: 'webview',
      // нет aiProvider
    })
    expect(r.migrated).toBe(true)
    expect(r.settings.aiProviderKeys.openai.mode).toBe('webview')
  })

  it('contextMode=none корректно мигрируется (falsy значение)', () => {
    const r = migrateLegacy({
      aiProvider: 'deepseek',
      contextMode: 'none',  // valid value, не undefined
      aiProviderKeys: { deepseek: {} },
    })
    expect(r.migrated).toBe(true)
    expect(r.settings.aiProviderKeys.deepseek.contextMode).toBe('none')
  })
})
