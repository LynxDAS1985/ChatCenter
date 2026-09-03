// v1.2.379: тест-ловушка для resolveMessengerLogo (логотип мессенджера в УВЕДОМЛЕНИИ).
// Ловит регресс: если поиск логотипа снова сделают ПО id (а не по типу из url), тест «Ozon с id=custom_…»
// упадёт. Логотипы лежат по ключам-типам (ozon/telegram/…), а у добавленного вручную источника id = custom_<время>.
import { describe, it, expect } from 'vitest'
import { resolveMessengerLogo, getMessengerLogo, pickNotifIconDataUrl } from './messengerLogos.js'

describe('resolveMessengerLogo (v1.2.379)', () => {
  it('Ozon с id=custom_… → логотип находится ПО ТИПУ (из url), а не по id', () => {
    const logo = resolveMessengerLogo({ id: 'custom_1712345678', url: 'https://seller.ozon.ru/app/messenger?group=customers_v2' })
    expect(logo).toBeTruthy()
    expect(logo).toMatch(/^data:image\//)
    expect(logo).toBe(getMessengerLogo('ozon')) // именно логотип Ozon
  })

  it('Telegram-web с произвольным id → логотип по типу', () => {
    const logo = resolveMessengerLogo({ id: 'custom_999', url: 'https://web.telegram.org/a/' })
    expect(logo).toBe(getMessengerLogo('telegram'))
  })

  it('Неизвестный сайт + id не совпадает с типом → undefined (окно покажет эмодзи)', () => {
    expect(resolveMessengerLogo({ id: 'custom_2', url: 'https://example.com' })).toBeUndefined()
  })

  it('Запасной ключ по id работает (дефолтный источник, где id=тип, url пуст)', () => {
    expect(resolveMessengerLogo({ id: 'ozon', url: '' })).toBe(getMessengerLogo('ozon'))
  })

  it('null/undefined на входе → undefined, без падения', () => {
    expect(resolveMessengerLogo(null)).toBeUndefined()
    expect(resolveMessengerLogo(undefined)).toBeUndefined()
    expect(resolveMessengerLogo({})).toBeUndefined()
  })
})

// v1.2.381: аватар отправителя в приоритете над логотипом (регресс v1.2.378 — логотип перекрывал аватар ВК).
describe('pickNotifIconDataUrl (v1.2.381) — аватар отправителя выше логотипа', () => {
  const vkInfo = { id: 'custom_vk', url: 'https://vk.ru/im' }
  it('есть URL аватара (iconUrl) → undefined (окно скачает аватар, логотип НЕ подставляем)', () => {
    // ТЕСТ-ЛОВУШКА на регресс: если вернуть логотип — аватар ВК снова пропадёт
    expect(pickNotifIconDataUrl({ iconUrl: 'https://vk.com/avatar.jpg' }, vkInfo)).toBeUndefined()
  })
  it('готовый data-URL аватара (iconDataUrl) → он и берётся', () => {
    expect(pickNotifIconDataUrl({ iconDataUrl: 'data:image/png;base64,AAA' }, vkInfo)).toBe('data:image/png;base64,AAA')
  })
  it('аватара нет вовсе → логотип мессенджера по типу (Ozon)', () => {
    const r = pickNotifIconDataUrl({ iconUrl: '' }, { id: 'custom_ozon', url: 'https://seller.ozon.ru/app/messenger' })
    expect(r).toBe(getMessengerLogo('ozon'))
  })
  it('null/пустой extra → логотип или undefined, без падения', () => {
    expect(pickNotifIconDataUrl(null, { url: 'https://seller.ozon.ru/x' })).toBe(getMessengerLogo('ozon'))
    expect(pickNotifIconDataUrl(null, { url: '' })).toBeUndefined()
  })
})
