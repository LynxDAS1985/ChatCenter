// v1.2.430/431: тест-ловушка на анти-завал уведомлений.
// Проверяет РЕАЛЬНУЮ createHandleNewMessage:
//  - лавина из ОДНОГО чата (>5 за 5с) → ОДНА сводная карточка на входе, дальше тихо;
//  - счётчик непрочитанных растёт на ВСЕ сообщения (ничего не теряется);
//  - журнал: ОДНА строка на входе + ОДНА на выходе (не на каждое подавленное);
//  - другие чаты не затронуты; под порогом — всё показывается как обычно.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHandleNewMessage } from '../utils/webviewHandleNewMessage.js'

function makeDeps() {
  const counts = { ribbon: 0, unread: 0, floodLogs: [] }
  const bodies = []
  globalThis.window = globalThis.window || {}
  window.api = {
    invoke: (ch, payload) => {
      if (ch === 'app:custom-notify') { counts.ribbon++; bodies.push(String(payload && payload.body || '')) }
      return Promise.resolve({ ok: true })
    },
  }
  const deps = {
    recentNotifsRef: { current: new Map() },
    lastRibbonTsRef: { current: {} },
    lastSoundTsRef: { current: {} },
    notifCountRef: { current: {} },
    pipelineTraceRef: { current: {} },
    settingsRef: { current: { notificationsEnabled: true, soundEnabled: false, autoReplyRules: [] } },
    activeIdRef: { current: 'other' }, // не смотрим на этот чат → viewing-фильтр не мешает
    messengersRef: { current: [{ id: 'custom_max', url: 'https://web.max.ru/', name: 'Макс', color: '#000', emoji: '💬' }] },
    windowFocusedRef: { current: false },
    setAccountInfo: () => {}, setActiveId: () => {}, setChatHistory: () => {}, setLastMessage: () => {},
    setMessagePreview: () => {}, setNewMessageIds: () => {}, setStatusBarMsg: () => {},
    setUnreadCounts: () => { counts.unread++ },
    previewTimers: { current: {} }, statusBarMsgTimer: { current: null }, bumpStatsRef: { current: () => {} },
    traceNotif: (cat, verdict, mid, text, msg) => { if (cat === 'flood') counts.floodLogs.push(String(msg || '')) },
  }
  return { deps, counts, bodies }
}

const W = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima']

describe('Анти-завал уведомлений по чату', () => {
  afterEach(() => { vi.restoreAllMocks(); try { delete window.api } catch (_) {} })

  it('лавина 10 сообщений → 5 обычных карточек + ОДНА сводка; счётчик на все 10', () => {
    const { deps, counts, bodies } = makeDeps()
    const handle = createHandleNewMessage(deps)
    for (let i = 0; i < 10; i++) handle('custom_max', W[i], { senderName: 'Спамер' })
    expect(counts.ribbon).toBe(6)                       // 5 обычных (1..5) + 1 сводка (6-е)
    expect(bodies[5]).toContain('Лавина')               // 6-я карточка — именно сводка
    expect(counts.unread).toBe(10)                      // ВСЕ сообщения обновили счётчик
    expect(counts.floodLogs.length).toBe(1)             // ОДНА строка журнала (вход), не на каждое
    expect(counts.floodLogs[0]).toContain('ЗАВАЛ начался')
  })

  it('под порогом (5 сообщений) → все карточки, завала нет', () => {
    const { deps, counts } = makeDeps()
    const handle = createHandleNewMessage(deps)
    for (let i = 0; i < 5; i++) handle('custom_max', W[i], { senderName: 'Клиент' })
    expect(counts.ribbon).toBe(5)
    expect(counts.floodLogs.length).toBe(0)
  })

  it('лавина в одном чате НЕ глушит другой чат', () => {
    const { deps, counts } = makeDeps()
    const handle = createHandleNewMessage(deps)
    for (let i = 0; i < 10; i++) handle('custom_max', W[i], { senderName: 'Спамер' })
    const before = counts.ribbon
    handle('custom_max', 'important', { senderName: 'ВажныйКлиент' })
    expect(counts.ribbon).toBe(before + 1)
  })

  it('после затишья лавина закрывается: ОДНА строка «завал закончился» + обычная карточка', () => {
    const { deps, counts, bodies } = makeDeps()
    let t = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => t)
    const handle = createHandleNewMessage(deps)
    for (let i = 0; i < 10; i++) handle('custom_max', W[i], { senderName: 'Спамер' })
    expect(counts.floodLogs.length).toBe(1)
    t += 6000 // окно 5с прошло — затишье
    handle('custom_max', 'after-calm', { senderName: 'Спамер' })
    expect(counts.floodLogs.length).toBe(2)
    expect(counts.floodLogs[1]).toContain('завал закончился')
    expect(bodies[bodies.length - 1]).toContain('after-calm') // снова обычная карточка с текстом
  })
})
