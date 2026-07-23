// v1.2.107: поведенческий тест решения «показать/спрятать окно уведомления».
// Раньше эта логика жила внутри ipcMain.on('notif:resize') и проверялась только
// текстовым grep'ом (notificationWindowBounds.test.cjs) — а grep не ловит, ПРАВИЛЬНО
// ли работает логика (был прецедент v1.2.91). Здесь проверяем именно поведение.
import { describe, it, expect } from 'vitest'
import { decideNotifResize } from '../../main/handlers/notifResizeDecision.js'

describe('decideNotifResize', () => {
  it('renderer пуст (height<=0 + rendererPure) → clear-hide', () => {
    expect(decideNotifResize({ height: 0, itemsCount: 3, rendererPure: true })).toBe('clear-hide')
  })
  it('стале-0, но у main есть сообщения → ignore (не прятать окно рано)', () => {
    expect(decideNotifResize({ height: 0, itemsCount: 2, rendererPure: false })).toBe('ignore')
  })
  it('нулевая высота, сообщений нет → hide', () => {
    expect(decideNotifResize({ height: 0, itemsCount: 0, rendererPure: false })).toBe('hide')
  })
  it('положительная высота, но сообщений НЕТ → hide (анти-«невидимая стена», v1.2.106)', () => {
    expect(decideNotifResize({ height: 120, itemsCount: 0, rendererPure: false })).toBe('hide')
  })
  it('есть высота И есть сообщения → show', () => {
    expect(decideNotifResize({ height: 120, itemsCount: 1, rendererPure: false })).toBe('show')
  })
  it('дробная высота округляется (0.4 → 0) → hide', () => {
    expect(decideNotifResize({ height: 0.4, itemsCount: 0 })).toBe('hide')
  })
})
