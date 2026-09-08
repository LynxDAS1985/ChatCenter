// v1.2.417: страж — session-«сторож» НЕ должен убивать ServiceWorker МАКС.
// Баг: max.hook.js (v1.2.10) РАЗРЕШАЕТ register SW у МАКС (ради уведомлений), а sessionSetup.js
// на каждый старт SW делал clearStorageData(serviceworkers) → МАКС в цикле «регистрирую SW → мы убили →
// заново» долбил свой сервер → 429 «Too many requests» шторм → чёрный экран (только у МАКС!).
// Фикс: keepServiceWorker = strict || max.ru → для МАКС SW-блок (очистка + сторож) пропускается.

import { describe, it, expect, vi } from 'vitest'
import { setupSession } from '../../main/utils/sessionSetup.js'

function makeMockSes(storagePath) {
  const clearCalls = []
  return {
    _swOn: vi.fn(),
    _clearCalls: clearCalls,
    storagePath,
    setUserAgent: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    clearStorageData: (opts) => { clearCalls.push(opts); return Promise.resolve() },
    get serviceWorkers() { return { on: this._swOn } },
    webRequest: { onBeforeSendHeaders: vi.fn(), onHeadersReceived: vi.fn() },
  }
}

const killedSW = (ses) => ses._clearCalls.some(o => o && o.storages && o.storages.includes('serviceworkers'))

describe('setupSession — ServiceWorker МАКС не убиваем (v1.2.417)', () => {
  it('МАКС (web.max.ru): сторож-убийца SW НЕ навешивается + реальный UA/hints как у Ozon (v1.2.421)', () => {
    const ses = makeMockSes('persist:custom_max_' + Date.now() + '_' + Math.random())
    setupSession(ses, { url: 'https://web.max.ru/im' })
    expect(ses._swOn).not.toHaveBeenCalled()
    expect(killedSW(ses)).toBe(false)
    expect(ses.setUserAgent).toHaveBeenCalled()
    // v1.2.421: МАКС (realBrowser) получает выравнивание Sec-CH-UA (как Ozon) — иначе несогласованный UA роняет WebSocket
    expect(ses.webRequest.onBeforeSendHeaders).toHaveBeenCalled()
  })

  it('Telegram (обычный веб-мессенджер): SW глушим + НЕ realBrowser (заголовки не выравниваем)', () => {
    const ses = makeMockSes('persist:custom_tg_' + Date.now() + '_' + Math.random())
    setupSession(ses, { url: 'https://web.telegram.org/k/' })
    expect(ses._swOn).toHaveBeenCalled()
    expect(killedSW(ses)).toBe(true)
    expect(ses.webRequest.onBeforeSendHeaders).not.toHaveBeenCalled() // не realBrowser → спуф-UA, заголовки не трогаем
  })

  it('ВК (vk.ru): SW глушим — сторож навешивается (не задели фиксом)', () => {
    const ses = makeMockSes('persist:custom_vk_' + Date.now() + '_' + Math.random())
    setupSession(ses, { url: 'https://vk.ru/im' })
    expect(ses._swOn).toHaveBeenCalled()
  })

  it('Ozon (seller.ozon.ru): SW сохранён (сторож не навешен) + заголовки правятся (не сломали разводом веток)', () => {
    const ses = makeMockSes('persist:custom_ozon_' + Date.now() + '_' + Math.random())
    setupSession(ses, { url: 'https://seller.ozon.ru/app/messenger' })
    expect(ses._swOn).not.toHaveBeenCalled()               // strict → SW сохранён
    expect(killedSW(ses)).toBe(false)
    expect(ses.webRequest.onBeforeSendHeaders).toHaveBeenCalled() // озон-доводка Sec-CH-UA осталась
  })

  it('climax.ru (НЕ МАКС, но содержит подстроку «max.ru»): SW глушим — ложного совпадения нет', () => {
    const ses = makeMockSes('persist:custom_climax_' + Date.now() + '_' + Math.random())
    setupSession(ses, { url: 'https://climax.ru/chat' })
    expect(ses._swOn).toHaveBeenCalled()  // это НЕ МАКС → SW глушим как обычный мессенджер
  })
})
