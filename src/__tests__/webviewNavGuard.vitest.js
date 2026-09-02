// v1.2.338: тест логики сторожа навигации веб-вкладок.
// Проверяет, что реклама/чужие сайты уходят наружу, а навигация по мессенджеру и ВХОД — остаются внутри.
import { describe, it, expect } from 'vitest'
import { shouldOpenExternal } from '../../main/handlers/webviewNavGuard.js'

describe('shouldOpenExternal', () => {
  it('тот же сайт (переход по мессенджеру) → внутри (false)', () => {
    expect(shouldOpenExternal('https://seller.ozon.ru/app/messenger', 'https://seller.ozon.ru/app/messenger/chat/1')).toBe(false)
    expect(shouldOpenExternal('https://web.telegram.org/k/', 'https://web.telegram.org/k/#-100123')).toBe(false)
  })

  it('РЕКЛАМА на другом сайте (тот самый баг Ozon) → наружу (true)', () => {
    expect(shouldOpenExternal('https://seller.ozon.ru/app/messenger', 'https://finance.ozon.ru/business/acquiring/intensive/kak-sozdat-sajt-s-nulya')).toBe(true)
    expect(shouldOpenExternal('https://web.telegram.org/k/', 'https://example.com/promo')).toBe(true)
  })

  it('вход/авторизация (id.*) → внутри (false), НЕ ломаем логин', () => {
    expect(shouldOpenExternal('https://seller.ozon.ru/app/messenger', 'https://id.ozon.ru/login')).toBe(false)
    expect(shouldOpenExternal('https://vk.ru/im', 'https://id.vk.com/auth')).toBe(false)
    expect(shouldOpenExternal('https://web.max.ru/', 'https://login.max.ru/oauth')).toBe(false)
  })

  it('не http(s) (about:blank/javascript:/data:) → не трогаем (false)', () => {
    expect(shouldOpenExternal('https://vk.ru/im', 'about:blank')).toBe(false)
    expect(shouldOpenExternal('https://vk.ru/im', 'javascript:void(0)')).toBe(false)
    expect(shouldOpenExternal('https://vk.ru/im', 'data:text/html,x')).toBe(false)
  })

  it('битый URL → безопасно не трогаем (false)', () => {
    expect(shouldOpenExternal('bad', 'also-bad')).toBe(false)
    expect(shouldOpenExternal('https://vk.ru/im', '')).toBe(false)
  })
})
