// v1.2.321: Ozon добавлен в каталог «Добавить → веб» (DEFAULT_MESSENGERS) + брендинг.
import { describe, it, expect } from 'vitest'
import { DEFAULT_MESSENGERS } from '../constants.js'
import { getMessengerEmoji, getMessengerName, getMessengerColor } from '../native/utils/messengerBranding.js'

describe('Ozon в каталоге веб-мессенджеров (v1.2.321)', () => {
  const ozon = DEFAULT_MESSENGERS.find(m => m.id === 'ozon')

  it('есть пункт Ozon в DEFAULT_MESSENGERS', () => {
    expect(ozon).toBeTruthy()
    expect(ozon.name).toBe('Ozon')
    expect(ozon.url).toContain('seller.ozon.ru')
    expect(ozon.partition).toBe('persist:ozon')
  })

  it('Ozon НЕ активен по умолчанию (только в каталоге)', () => {
    expect(ozon.isDefault).toBe(false)
  })

  it('accountScript НЕ задан (DOM Ozon не подтверждён — не гадаем)', () => {
    expect(ozon.accountScript).toBeUndefined()
  })

  it('брендинг Ozon: emoji 📦, имя Ozon, синий цвет', () => {
    expect(getMessengerEmoji('ozon')).toBe('📦')
    expect(getMessengerName('ozon')).toBe('Ozon')
    expect(getMessengerColor('ozon')).toBe('#005BFF')
  })

  it('другие мессенджеры не задеты (ВК/WhatsApp branding на месте)', () => {
    expect(getMessengerEmoji('vk')).toBe('🔵')
    expect(getMessengerName('whatsapp')).toBe('WhatsApp')
  })
})
