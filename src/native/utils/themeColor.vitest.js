// v0.95.30: тесты themeColor — load/save/apply/getThemeById.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { THEMES, DEFAULT_THEME_ID, getThemeById, loadTheme, saveTheme, applyTheme } from './themeColor.js'

describe('themeColor (v0.95.30)', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch (_) {}
  })

  it('THEMES содержит 5 тем с обязательными полями', () => {
    expect(THEMES.length).toBe(5)
    for (const t of THEMES) {
      expect(t.id).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(t.accent).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(t.accentHover).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(t.shadow).toMatch(/^rgba\(/)
    }
  })

  it('DEFAULT_THEME_ID = premium (v1.2.514: яркий Telegram-blue Premium)', () => {
    expect(DEFAULT_THEME_ID).toBe('premium')
    expect(getThemeById(DEFAULT_THEME_ID).accent).toBe('#229ED9')
  })

  it('getThemeById — известный id → нужная тема', () => {
    expect(getThemeById('indigo').accent).toBe('#3B5BA9')
    expect(getThemeById('violet').accent).toBe('#5B5FE2')
  })

  it('getThemeById — неизвестный/null → default', () => {
    const defaultTheme = getThemeById(DEFAULT_THEME_ID)
    expect(getThemeById('unknown')).toBe(defaultTheme)
    expect(getThemeById(null)).toBe(defaultTheme)
    expect(getThemeById(undefined)).toBe(defaultTheme)
  })

  it('loadTheme — пусто в storage → default', () => {
    expect(loadTheme().id).toBe(DEFAULT_THEME_ID)
  })

  it('saveTheme + loadTheme round-trip', () => {
    saveTheme('teal')
    expect(loadTheme().id).toBe('teal')
    saveTheme('violet')
    expect(loadTheme().id).toBe('violet')
  })

  it('loadTheme — сохранён невалидный id → default (защита от мусора)', () => {
    try { localStorage.setItem('cc-native-theme', 'fake-theme-xyz') } catch (_) {}
    expect(loadTheme().id).toBe(DEFAULT_THEME_ID)
  })

  it('applyTheme — null/undefined → no-op (защита от падения)', () => {
    expect(() => applyTheme(null)).not.toThrow()
    expect(() => applyTheme(undefined)).not.toThrow()
  })

  it('applyTheme — без .native-mode элементов → fallback на documentElement', () => {
    const theme = getThemeById('indigo')
    applyTheme(theme)
    expect(document.documentElement.style.getPropertyValue('--amoled-accent')).toBe('#3B5BA9')
    expect(document.documentElement.style.getPropertyValue('--amoled-accent-hover')).toBe('#2d4685')
    expect(document.documentElement.style.getPropertyValue('--amoled-accent-shadow')).toBe('rgba(59,91,169,0.18)')
  })

  // v0.95.34: после переноса темовых переменных в :root applyTheme ВСЕГДА ставит
  // на documentElement (основной путь — нет конкуренции specificity). Дополнительно
  // также на .native-mode элементы (страховка от будущего возврата переопределения).
  it('applyTheme — с .native-mode элементом → ставит CSS vars на ОБА (documentElement и .native-mode)', () => {
    document.documentElement.style.removeProperty('--amoled-accent')
    const nativeRoot = document.createElement('div')
    nativeRoot.className = 'native-mode'
    document.body.appendChild(nativeRoot)
    try {
      applyTheme(getThemeById('violet'))
      // Основной путь — documentElement
      expect(document.documentElement.style.getPropertyValue('--amoled-accent')).toBe('#5B5FE2')
      // Страховка — .native-mode элемент тоже получил
      expect(nativeRoot.style.getPropertyValue('--amoled-accent')).toBe('#5B5FE2')
      expect(nativeRoot.style.getPropertyValue('--amoled-accent-hover')).toBe('#4549c4')
      expect(nativeRoot.style.getPropertyValue('--amoled-accent-shadow')).toBe('rgba(91,95,226,0.18)')
    } finally {
      document.body.removeChild(nativeRoot)
    }
  })

  it('applyTheme — два .native-mode элемента → оба получают CSS vars', () => {
    const a = document.createElement('div')
    a.className = 'native-mode'
    const b = document.createElement('div')
    b.className = 'native-mode'
    document.body.appendChild(a)
    document.body.appendChild(b)
    try {
      applyTheme(getThemeById('teal'))
      expect(a.style.getPropertyValue('--amoled-accent')).toBe('#1A6B8C')
      expect(b.style.getPropertyValue('--amoled-accent')).toBe('#1A6B8C')
    } finally {
      document.body.removeChild(a)
      document.body.removeChild(b)
    }
  })

  it('saveTheme — defensive (null/undefined → DEFAULT_THEME_ID)', () => {
    saveTheme(null)
    expect(loadTheme().id).toBe(DEFAULT_THEME_ID)
  })

  // v1.2.514: проверка контрастности ссылок против цвета фона bubble во всех темах
  it('v1.2.514: контрастность белых ссылок (#ffffff) против accent цвета всех 5 тем безопасна', () => {
    const getLuminance = (hex) => {
      const rgb = hex.replace('#', '').match(/.{2}/g).map(x => {
        const v = parseInt(x, 16) / 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    }
    const getContrast = (h1, h2) => {
      const l1 = getLuminance(h1)
      const l2 = getLuminance(h2)
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    }

    for (const theme of THEMES) {
      // Белый текст ссылки на фоне темы должен иметь видимый контраст (>2.0:1) и не совпадать с фоном
      const ratio = getContrast('#ffffff', theme.accent)
      expect(ratio).toBeGreaterThan(2.0)
      expect(theme.accent.toLowerCase()).not.toBe('#ffffff')
    }
  })
})
