// Тест маршрутизатора фоновой страницы Ozon «Вопросы» (bindOzonBgWatcher).
// Проверяет, что сигналы из скрытой страницы правильно переводятся на основной id Ozon:
//   __CC_NOTIF__ src=ozon-questions → handleNewMessage(ozonId, текст, {background:true})
//   __CC_OZON_COUNT__ qa            → setOzonCounts (кладёт qa в per-раздел)
//   не-__CC_ сообщение              → ничего не маршрутизируется
//   did-fail-load (реальная ошибка) → один раз notify; ERR_ABORTED(-3) → notify НЕ вызывается
import { describe, it, expect, vi } from 'vitest'
import { bindOzonBgWatcher } from '../utils/ozonBgWatcher.js'

// Заглушка элемента <webview>: копит обработчики, умеет их «выстрелить».
function makeEl(url = 'https://seller.ozon.ru/app/reviews/questions') {
  const handlers = {}
  return {
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn) },
    getURL: () => url,
    fire: (t, ev) => (handlers[t] || []).forEach((fn) => fn(ev)),
    handlersFor: (t) => handlers[t] || [],
  }
}

function makeDeps() {
  let ozonState = {}
  return {
    handleNewMessage: vi.fn(),
    setOzonCounts: vi.fn((fn) => { ozonState = fn(ozonState) }),
    log: vi.fn(),
    notify: vi.fn(),
    getState: () => ozonState,
  }
}

describe('bindOzonBgWatcher', () => {
  it('уведомление о вопросе → handleNewMessage на id Ozon с флагом background', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: '__CC_NOTIF__' + JSON.stringify({ t: 'Подшипник 6203', b: 'Подходит на авто?', g: 'ozon-q:42', src: 'ozon-questions' }) })
    expect(d.handleNewMessage).toHaveBeenCalledTimes(1)
    const [id, body, extra] = d.handleNewMessage.mock.calls[0]
    expect(id).toBe('ozon')
    expect(body).toBe('Подходит на авто?')
    expect(extra.background).toBe(true)
    expect(extra.notifSource).toBe('ozon-questions')
    expect(extra.senderName).toBe('Подшипник 6203')
  })

  it('qa-счётчик → setOzonCounts кладёт число в per-раздел', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'qa', n: 3 }) })
    expect(d.setOzonCounts).toHaveBeenCalledTimes(1)
    expect(d.getState().ozon.qa).toBe(3)
    expect(d.handleNewMessage).not.toHaveBeenCalled()
  })

  it('обычное (не __CC_) сообщение — ничего не маршрутизируется', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: 'какой-то обычный лог страницы' })
    expect(d.handleNewMessage).not.toHaveBeenCalled()
    expect(d.setOzonCounts).not.toHaveBeenCalled()
  })

  it('реальная ошибка загрузки → notify один раз; повтор не дублирует', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -20, errorDescription: 'ERR_BLOCKED_BY_CLIENT', isMainFrame: true, validatedURL: 'https://seller.ozon.ru/app/reviews/questions' })
    el.fire('did-fail-load', { errorCode: -21, errorDescription: 'ERR_NETWORK_CHANGED', isMainFrame: true })
    expect(d.notify).toHaveBeenCalledTimes(1)
  })

  it('ERR_ABORTED (-3, редирект) — НЕ тревожит пользователя', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -3, errorDescription: 'ERR_ABORTED', isMainFrame: true })
    expect(d.notify).not.toHaveBeenCalled()
  })

  it('под-ресурс (не главный документ) не считается блокировкой', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -20, isMainFrame: false })
    expect(d.notify).not.toHaveBeenCalled()
  })

  it('повторная привязка к тому же элементу не вешает второй слушатель', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    bindOzonBgWatcher(el, 'ozon', d)
    expect(el.handlersFor('console-message').length).toBe(1)
  })

  it('null-элемент (размонтирование) не падает', () => {
    expect(() => bindOzonBgWatcher(null, 'ozon', makeDeps())).not.toThrow()
  })
})
