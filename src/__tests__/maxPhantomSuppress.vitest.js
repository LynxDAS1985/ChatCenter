// v1.2.425: тест-ловушка на подавление «фантомов» МАКС.
// Проверяет РЕАЛЬНУЮ функцию createHandleNewMessage (не копию логики):
//  - открытый чат МАКС при просмотре (окно в фокусе + вкладка активна) → уведомление подавляется (ранний return);
//  - ДРУГОЙ/фоновый чат МАКС (max-sidebar без openChat) → проходит дальше;
//  - climax.ru (домен содержит «max.ru» как подстроку) НЕ считается МАКС → не подавляется (ловушка регэкспа);
//  - МАКС вне фокуса окна → не подавляется.
// Признак «проходит дальше» — вызван setMessagePreview (он ПОСЛЕ блока подавления).
import { describe, it, expect } from 'vitest'
import { createHandleNewMessage } from '../utils/webviewHandleNewMessage.js'

function makeDeps(over = {}) {
  const calls = []
  const state = { previewCalled: false }
  const deps = {
    recentNotifsRef: { current: new Map() },
    lastRibbonTsRef: { current: {} },
    lastSoundTsRef: { current: {} },
    notifCountRef: { current: {} },
    pipelineTraceRef: { current: {} },
    // notificationsEnabled/soundEnabled=false → не трогаем ribbon/звук/логотипы в тесте
    settingsRef: { current: { notificationsEnabled: false, soundEnabled: false, autoReplyRules: [] } },
    activeIdRef: { current: 'custom_max' },
    messengersRef: { current: [{ id: 'custom_max', url: 'https://web.max.ru/', name: 'Макс' }] },
    windowFocusedRef: { current: true },
    setAccountInfo: () => {},
    setActiveId: () => {},
    setChatHistory: () => {},
    setLastMessage: () => {},
    setMessagePreview: () => { state.previewCalled = true },
    setNewMessageIds: () => {},
    setStatusBarMsg: () => {},
    setUnreadCounts: () => {},
    previewTimers: { current: {} },
    statusBarMsgTimer: { current: null },
    bumpStatsRef: { current: () => {} },
    traceNotif: (cat, verdict, mid, text, msg) => calls.push({ cat, verdict, mid, text, msg }),
    ...over,
  }
  return { deps, calls, state }
}

const blockedByMax = (calls) => calls.some(c => c.verdict === 'block' && String(c.msg || '').includes('MAX: вкладка открыта'))

describe('МАКС: подавление фантомов уведомлений про открытый чат', () => {
  it('открытый чат МАКС при просмотре → подавлено (ранний return, превью не вызвано)', () => {
    const { deps, calls, state } = makeDeps()
    const handle = createHandleNewMessage(deps)
    handle('custom_max', 'проверка подавления фантома один', { senderName: 'Мусихин', notifSource: 'max-sidebar', openChat: 1 })
    expect(blockedByMax(calls)).toBe(true)
    expect(state.previewCalled).toBe(false)
  })

  it('исходящее/наблюдатель открытого чата (без notifSource) при просмотре МАКС → подавлено', () => {
    const { deps, calls, state } = makeDeps()
    const handle = createHandleNewMessage(deps)
    handle('custom_max', 'моё исходящее сообщение два', { senderName: 'Мусихин' })
    expect(blockedByMax(calls)).toBe(true)
    expect(state.previewCalled).toBe(false)
  })

  it('ДРУГОЙ/фоновый чат МАКС (max-sidebar без openChat) при просмотре → НЕ подавлено', () => {
    const { deps, calls, state } = makeDeps()
    const handle = createHandleNewMessage(deps)
    handle('custom_max', 'сообщение из другого чата три', { senderName: 'Иванов', notifSource: 'max-sidebar' })
    expect(blockedByMax(calls)).toBe(false)
    expect(state.previewCalled).toBe(true)
  })

  it('climax.ru (подстрока «max.ru») НЕ считается МАКС → НЕ подавлено (ловушка регэкспа)', () => {
    const { deps, calls, state } = makeDeps({
      activeIdRef: { current: 'custom_climax' },
      messengersRef: { current: [{ id: 'custom_climax', url: 'https://climax.ru/', name: 'Climax' }] },
    })
    const handle = createHandleNewMessage(deps)
    handle('custom_climax', 'сообщение климакс четыре', { senderName: 'Пётр', notifSource: 'max-sidebar', openChat: 1 })
    expect(blockedByMax(calls)).toBe(false)
    expect(state.previewCalled).toBe(true)
  })

  it('МАКС, но окно НЕ в фокусе → НЕ подавлено (уведомление нужно)', () => {
    const { deps, calls, state } = makeDeps({ windowFocusedRef: { current: false } })
    const handle = createHandleNewMessage(deps)
    handle('custom_max', 'сообщение вне фокуса пять', { senderName: 'Мусихин', notifSource: 'max-sidebar', openChat: 1 })
    expect(blockedByMax(calls)).toBe(false)
    expect(state.previewCalled).toBe(true)
  })
})
