// v1.2.250 — тест конструктора пунктов контекстного меню вкладки/значка источника.
// Закрывает дыру: раньше правило «нативный источник без веб-only пунктов» (v1.2.249)
// не было покрыто тестом (логика жила в TabBar.jsx, юнит-тестом не проверялась).
import { describe, it, expect } from 'vitest'
import { buildTabContextMenuItems } from '../utils/tabContextMenuItems.js'

const actions = opts => buildTabContextMenuItems(opts).map(i => i.action)

describe('buildTabContextMenuItems', () => {
  it('веб-источник: показывает reload/notifLog/copyUrl', () => {
    const a = actions({ isNative: false, pinned: false })
    expect(a).toContain('reload')
    expect(a).toContain('notifLog')
    expect(a).toContain('copyUrl')
    expect(a).toContain('edit')
    expect(a).toContain('pin')
    expect(a).toContain('close')
  })

  it('нативный источник («Общий чат»): БЕЗ reload/notifLog/copyUrl', () => {
    const a = actions({ isNative: true, pinned: false })
    expect(a).not.toContain('reload')
    expect(a).not.toContain('notifLog')
    expect(a).not.toContain('copyUrl')
    // остаются осмысленные для нативного
    expect(a).toContain('edit')
    expect(a).toContain('pin')
    expect(a).toContain('close')
  })

  it('закреплённая вкладка: без «close», ярлык pin = «Открепить»', () => {
    const items = buildTabContextMenuItems({ isNative: false, pinned: true })
    const a = items.map(i => i.action)
    expect(a).not.toContain('close')
    expect(items.find(i => i.action === 'pin').label).toBe('Открепить вкладку')
  })

  it('незакреплённая вкладка: pin = «Закрепить», есть «close»', () => {
    const items = buildTabContextMenuItems({ isNative: false, pinned: false })
    expect(items.find(i => i.action === 'pin').label).toBe('Закрепить вкладку')
    expect(items.find(i => i.action === 'close')).toBeTruthy()
  })

  it('без аргументов не падает (дефолты)', () => {
    expect(() => buildTabContextMenuItems()).not.toThrow()
    expect(buildTabContextMenuItems().length).toBeGreaterThan(0)
  })
})
