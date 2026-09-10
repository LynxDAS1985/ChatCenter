// v1.2.445: поведенческие тесты автоматического переподключения + экрана «Нет связи».
//
// Проверяем ЖИВОЕ поведение (фейковые таймеры): обрыв → ожидание → попытка → успех/неудача,
// возврат сети, кнопка ручного повтора, и главное — что живую страницу мы НЕ перезагружаем.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import useWebviewReconnect from './useWebviewReconnect.js'
import WebviewOfflineOverlay from '../components/WebviewOfflineOverlay.jsx'
import { planAfterFail } from '../../shared/reconnectPlan.js'

const WA = 'https://web.whatsapp.com'

/** Заглушка страницы мессенджера: помнит слушателей и вызовы loadURL. */
function fakeWebview(behaviour) {
  const listeners = {}
  return {
    calls: [],
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn) },
    fire(type, ev) { (listeners[type] || []).forEach(fn => fn(ev)) },
    loadURL(url) {
      this.calls.push(url)
      return behaviour === 'ok' ? Promise.resolve() : Promise.reject(Object.assign(new Error('fail'), { errno: -106 }))
    },
  }
}

function harness(behaviour) {
  const logs = []
  window.api = { send: (ch, p) => { if (ch === 'app:log' && p && p.message) logs.push(p.message) } }
  const wv = fakeWebview(behaviour)
  return {
    logs, wv,
    webviewRefs: { current: { wa: wv } },
    messengersRef: { current: [{ id: 'wa', name: 'WhatsApp', url: WA, color: '#25D366' }] },
  }
}
const has = (logs, part) => logs.filter(l => l.includes(part)).length

describe('Переподключение — поведение', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); delete window.api })

  it('обрыв связи → экран ждёт, страницу пока НЕ трогаем', async () => {
    const h = harness('fail')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    expect(result.current.offlineState.wa.phase).toBe('wait')
    expect(result.current.offlineState.wa.pauseMs).toBe(5000)
    expect(h.wv.calls.length, 'до конца отсчёта загрузку не запускаем').toBe(0)
    expect(has(h.logs, 'обрыв связи')).toBe(1)
  })

  it('🔴 ЛОВУШКА: обычная отмена перехода (код -3) НЕ перезагружает живую страницу', async () => {
    const h = harness('ok')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -3 }) })
    await act(async () => { vi.advanceTimersByTime(70000) })
    expect(Object.keys(result.current.offlineState).length).toBe(0)
    expect(h.wv.calls.length, 'перезагрузка стёрла бы недописанное сообщение').toBe(0)
    expect(has(h.logs, 'повтор не нужен'), 'про -3 не шумим').toBe(0)
  })

  it('чужая ошибка (не про связь) → пишем в журнал, но не повторяем', async () => {
    const h = harness('ok')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -20 }) })
    expect(Object.keys(result.current.offlineState).length).toBe(0)
    expect(has(h.logs, 'повтор не нужен')).toBe(1)
    expect(h.wv.calls.length).toBe(0)
  })

  it('прошла пауза → попытка; загрузилось → экран снят, в журнале «восстановлена»', async () => {
    const h = harness('ok')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(h.wv.calls).toEqual([WA])
    expect(Object.keys(result.current.offlineState).length).toBe(0)
    expect(has(h.logs, 'связь восстановлена')).toBe(1)
  })

  it('🔴 путь ошибки: попытка не удалась → пауза выросла 5 → 10 → 20 с', async () => {
    const h = harness('fail')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(result.current.offlineState.wa.pauseMs).toBe(10000)
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(result.current.offlineState.wa.pauseMs).toBe(20000)
    expect(h.wv.calls.length).toBe(2)
    expect(has(h.logs, 'не удалась')).toBe(2)
  })

  it('сеть вернулась → попытка сразу, не дожидаясь отсчёта', async () => {
    const h = harness('ok')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    expect(h.wv.calls.length).toBe(0)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await act(async () => { vi.advanceTimersByTime(20) })
    expect(h.wv.calls).toEqual([WA])
    expect(has(h.logs, 'связь появилась')).toBe(1)
  })

  it('пропажа сети попадает в журнал', async () => {
    const h = harness('ok')
    renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    await act(async () => { window.dispatchEvent(new Event('offline')) })
    expect(has(h.logs, '[net] связь пропала')).toBe(1)
  })

  it('кнопка «Повторить сейчас» пробует немедленно', async () => {
    const h = harness('ok')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    await act(async () => { result.current.retryNow('wa') })
    expect(h.wv.calls).toEqual([WA])
    expect(has(h.logs, 'повтор по кнопке пользователя')).toBe(1)
  })

  it('страница поднялась сама → экран снят без нашей попытки', async () => {
    const h = harness('fail')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    await act(async () => { h.wv.fire('did-finish-load') })
    expect(Object.keys(result.current.offlineState).length).toBe(0)
    expect(h.wv.calls.length).toBe(0)
  })

  it('слушатели не вешаются дважды при повторной привязке', async () => {
    const h = harness('fail')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => {
      result.current.bindReconnect(h.wv, 'wa')
      result.current.bindReconnect(h.wv, 'wa')
      result.current.bindReconnect(h.wv, 'wa')
    })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    expect(has(h.logs, 'обрыв связи'), 'один обрыв — одна запись').toBe(1)
  })

  it('страницы ещё нет в окне → запись не теряется, ждём дальше', async () => {
    const h = harness('fail')
    h.webviewRefs.current = {} // элемента нет
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(result.current.offlineState.wa, 'запись должна остаться').toBeTruthy()
    expect(result.current.offlineState.wa.phase).toBe('wait')
  })

  it('🔴 ЗАЩИТА ОТ УТЕЧКИ: слушатели попадают в учёт и снимаются вместе с вкладкой', async () => {
    // App.jsx при удалении вкладки проходит wv._chatcenterListeners и снимает подписки.
    // Если наши слушатели идут МИМО этого списка — они остаются навсегда (утечка).
    const h = harness('fail')
    const removed = []
    h.wv._chatcenterListeners = []
    h.wv.removeEventListener = (type, fn) => { removed.push(type); h.wv._off = (h.wv._off || []).concat([[type, fn]]) }
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    // оба наших слушателя учтены
    expect(h.wv._chatcenterListeners.map(p => p[0]).sort()).toEqual(['did-fail-load', 'did-finish-load'])
    // повторяем чистку из App.jsx (строки 360-364)
    for (const [event, fn] of h.wv._chatcenterListeners) h.wv.removeEventListener(event, fn)
    expect(removed.sort()).toEqual(['did-fail-load', 'did-finish-load'])
  })

  it('таймер снимается при размонтировании (не тикает в пустоту)', async () => {
    const h = harness('fail')
    const { result, unmount } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    unmount()
    await act(async () => { vi.advanceTimersByTime(60000) })
    expect(h.wv.calls.length).toBe(0)
  })
})

describe('Экран «Нет связи»', () => {
  const now = Date.now()

  it('видно причину, отсчёт и кнопку', () => {
    const entry = planAfterFail(null, { code: -106, url: WA, now })
    render(<WebviewOfflineOverlay entry={entry} name="WhatsApp" onRetry={() => {}} />)
    expect(screen.getByText(/Нет связи с WhatsApp/)).toBeTruthy()
    expect(screen.getByText('ERR_INTERNET_DISCONNECTED')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('Повторить сейчас')).toBeTruthy()
  })

  it('кнопка вызывает повтор', () => {
    const onRetry = vi.fn()
    render(<WebviewOfflineOverlay entry={planAfterFail(null, { code: -106, url: WA, now })} name="WhatsApp" onRetry={onRetry} />)
    fireEvent.click(screen.getByText('Повторить сейчас'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('во время попытки кнопка заблокирована и текст другой', () => {
    const entry = { attempt: 2, phase: 'trying', dueAt: now, pauseMs: 0, code: -106, since: now }
    render(<WebviewOfflineOverlay entry={entry} name="ВКонтакте" onRetry={() => {}} />)
    expect(screen.getByText(/Подключаемся к ВКонтакте/)).toBeTruthy()
    expect(screen.getByText('Подождите…').disabled).toBe(true)
  })

  it('нет записи → экран не рисуется', () => {
    const { container } = render(<WebviewOfflineOverlay entry={null} name="X" onRetry={() => {}} />)
    expect(container.textContent).toBe('')
  })

  it('🔴 ЛОВУШКА: у экрана НЕПРОЗРАЧНЫЙ фон — иначе сквозь него видно чаты «Общего чата»', () => {
    const src = fs.readFileSync('src/components/WebviewOfflineOverlay.jsx', 'utf8')
    expect(src).toMatch(/background: 'radial-gradient/)   // сплошная заливка, а не transparent
    expect(src).toMatch(/position: 'absolute', inset: 0/) // накрывает весь слой
    expect(src).not.toMatch(/visibility:\s*'hidden'/)     // webview прятать нельзя — Chromium усыпит
  })

  it('экран подключён в App.jsx и рисуется только при обрыве', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8')
    expect(app).toMatch(/offlineState\[m\.id\] && \(/)
    expect(app).toMatch(/<WebviewOfflineOverlay/)
    expect(app).toMatch(/bindReconnect\(el, m\.id\)/) // слушатели вешаются на элемент страницы
  })
})
