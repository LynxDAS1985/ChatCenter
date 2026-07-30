// v1.2.144: тест маскировки кодов входа в файле логов (maskLogSecrets).
import { describe, it, expect } from 'vitest'
import { maskLogSecrets } from './logger.js'

describe('maskLogSecrets — маскировка кодов входа в логах', () => {
  it('маскирует код входа Telegram', () => {
    expect(maskLogSecrets('Код для входа в Telegram: 51519. Не давайте код никому'))
      .toBe('Код для входа в Telegram: *****. Не давайте код никому')
  })

  it('маскирует английский login code', () => {
    expect(maskLogSecrets('Your login code: 123456')).toBe('Your login code: ******')
  })

  it('маскирует "code" с контекстом входа (sign in)', () => {
    expect(maskLogSecrets('sign in code 7788')).toBe('sign in code ****')
  })

  it('НЕ трогает код ошибки (нет контекста входа)', () => {
    expect(maskLogSecrets('код ошибки 40001')).toBe('код ошибки 40001')
  })

  it('НЕ трогает код заказа', () => {
    expect(maskLogSecrets('код заказа 12345')).toBe('код заказа 12345')
  })

  it('НЕ трогает обычные числа без слова код/code', () => {
    expect(maskLogSecrets('unread=2681 chatId=-1001917325560')).toBe('unread=2681 chatId=-1001917325560')
  })

  it('пустой/нестроковый вход не падает', () => {
    expect(maskLogSecrets('')).toBe('')
    expect(maskLogSecrets(null)).toBe(null)
    expect(maskLogSecrets(undefined)).toBe(undefined)
  })
})
