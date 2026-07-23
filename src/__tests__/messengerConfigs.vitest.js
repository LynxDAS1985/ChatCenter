// v1.2.109: detectMessengerType должен распознавать vk.ru (ВК переехал с vk.com на vk.ru).
// Без этого вкладку ВК не считали за ВК → хук/наблюдатель не грузился → не было наших уведомлений.
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { detectMessengerType } from '../utils/messengerConfigs.js'

describe('detectMessengerType', () => {
  it('vk.ru → vk (ВК переехал на vk.ru)', () => {
    expect(detectMessengerType('https://vk.ru/im')).toBe('vk')
    expect(detectMessengerType('https://m.vk.ru/im?sel=123')).toBe('vk')
  })
  it('vk.com → vk (старый домен всё ещё работает)', () => {
    expect(detectMessengerType('https://vk.com/im')).toBe('vk')
  })
  it('другие мессенджеры не задеты', () => {
    expect(detectMessengerType('https://web.telegram.org/k/')).toBe('telegram')
    expect(detectMessengerType('https://web.whatsapp.com/')).toBe('whatsapp')
    expect(detectMessengerType('https://web.max.ru/')).toBe('max')
  })
  it('пусто/неизвестное → unknown', () => {
    expect(detectMessengerType('')).toBe('unknown')
    expect(detectMessengerType('https://example.com')).toBe('unknown')
  })
})
