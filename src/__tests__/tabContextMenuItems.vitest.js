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

describe('Пункт «Обновить фото аккаунта» (v1.2.440)', () => {
  // ЗАЧЕМ пункт: снимок фото аккаунта кэшируется в хранилище страницы мессенджера и обновляется
  // сам лишь раз в сутки. Если туда попало ЧУЖОЕ фото (взяли аватар собеседника из открытого чата),
  // ждать сутки неудобно → нужен ручной сброс правой кнопкой по значку источника.
  it('есть у веб-источника', () => {
    const items = buildTabContextMenuItems({ isNative: false })
    expect(items.map(i => i.action)).toContain('refreshAvatar')
  })

  it('НЕТ у нативного «Общего чата» (у него нет веб-страницы и кэша фото)', () => {
    const items = buildTabContextMenuItems({ isNative: true })
    expect(items.map(i => i.action)).not.toContain('refreshAvatar')
  })

  it('обработчик сбрасывает ТОЛЬКО наши ключи и НЕ трогает вход в аккаунт', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync('src/hooks/useTabContextMenu.js', 'utf8')
    expect(src).toMatch(/action === 'refreshAvatar'/)
    // сбрасываем свой кэш фото
    for (const k of ['__cc_account_avatar_crisp3', '__cc_account_avatar_crisp2', '__cc_account_avatar', '__cc_avatar_tried']) {
      expect(src).toContain(k)
    }
    // 🔴 ГЛАВНОЕ: ключи авторизации сайта НЕ трогаем — иначе выкинет из аккаунта
    expect(src).not.toMatch(/localStorage\.clear\(\)/)
    expect(src).not.toMatch(/user_auth/)
    // результат сброса виден в журнале (и успех, и сбой)
    expect(src).toMatch(/сброс фото аккаунта по команде пользователя/)
    expect(src).toMatch(/сброс фото не удался/)
  })
})
