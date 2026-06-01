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

  it('DEFAULT_THEME_ID = telegram-blue (совместимость с прежними версиями)', () => {
    expect(DEFAULT_THEME_ID).toBe('telegram-blue')
    expect(getThemeById(DEFAULT_THEME_ID).accent).toBe('#2AABEE')
  })

  it('getThemeById — известный id → нужная тема', () => {
    expect(getThemeById('indigo').accent).toBe('#3B5BA9')
    expect(getThemeById('violet').accent).toBe('#5B5FE2')
  })

  it('getThemeById — неизвестный/null → default', () => {
    expect(getThemeById('unknown')).toBe(THEMES[0])
    expect(getThemeById(null)).toBe(THEMES[0])
    expect(getThemeById(undefined)).toBe(THEMES[0])
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

  it('applyTheme — ставит CSS variables на :root', () => {
    const theme = getThemeById('indigo')
    applyTheme(theme)
    expect(document.documentElement.style.getPropertyValue('--amoled-accent')).toBe('#3B5BA9')
    expect(document.documentElement.style.getPropertyValue('--amoled-accent-hover')).toBe('#2d4685')
    expect(document.documentElement.style.getPropertyValue('--amoled-accent-shadow')).toBe('rgba(59,91,169,0.18)')
  })

  it('saveTheme — defensive (null/undefined → DEFAULT_THEME_ID)', () => {
    saveTheme(null)
    expect(loadTheme().id).toBe(DEFAULT_THEME_ID)
  })
})
