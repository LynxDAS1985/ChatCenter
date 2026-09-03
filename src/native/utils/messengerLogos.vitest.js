// v1.2.379: тест-ловушка для resolveMessengerLogo (логотип мессенджера в УВЕДОМЛЕНИИ).
// Ловит регресс: если поиск логотипа снова сделают ПО id (а не по типу из url), тест «Ozon с id=custom_…»
// упадёт. Логотипы лежат по ключам-типам (ozon/telegram/…), а у добавленного вручную источника id = custom_<время>.
import { describe, it, expect } from 'vitest'
import { resolveMessengerLogo, getMessengerLogo } from './messengerLogos.js'

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
