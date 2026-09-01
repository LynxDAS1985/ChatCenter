// v1.2.322: тест «доводки» client hints под обычный Chrome (main/utils/sessionSetup.js).
import { describe, it, expect } from 'vitest'
import { chromeClientHints } from '../../main/utils/sessionSetup.js'

describe('chromeClientHints (v1.2.322)', () => {
  it('под обычный Chrome: есть Chromium + Google Chrome, НЕТ Electron', () => {
    const { short, full } = chromeClientHints('136.0.7103.0')
    expect(short).toContain('"Chromium";v="136"')
    expect(short).toContain('"Google Chrome";v="136"')
    expect(short).not.toMatch(/electron/i)
    expect(full).toContain('136.0.7103.0')
    expect(full).not.toMatch(/electron/i)
  })

  it('пустая/битая версия → безопасный fallback, без undefined', () => {
    const { short, full } = chromeClientHints()
    expect(short).toContain('Google Chrome')
    expect(short).not.toContain('undefined')
    expect(full).not.toContain('undefined')
  })
})
