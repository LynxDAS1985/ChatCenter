// v1.2.492 — СКВОЗНОЙ тест цепочки «пульс → синтетическое online → лестница двигается сразу» через весь хук.
// @vitest-environment jsdom
//
// Раньше каждое звено проверялось отдельно (bringAllForward, applyPulse, attempt). Здесь — стык звеньев:
// главный процесс прислал net:pulse «появился» → окно бросило событие online → хук двинул все ожидающие
// попытки на «сейчас» → страница перезагружена в ту же секунду, а не через 60 с. Плюс обратная ловушка:
// пока пульс говорит «нет», будильник лестницы страницу НЕ трогает.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useWebviewReconnect from '../hooks/useWebviewReconnect.js'
import { applyPulse } from '../hooks/useOpenPageWatch.js'
import { _resetRecoverySummary, summaryLine } from '../../shared/netRecoverySummary.js'
import { RETRY_LADDER_MS } from '../../shared/reconnectPlan.js'

const WA = 'https://web.whatsapp.com'

function fakeWebview(behaviour) {
  const listeners = {}
  return {
    calls: [],
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn) },
    fire(type, ev) { (listeners[type] || []).forEach(fn => fn(ev)) },
    loadURL(url) {
      this.calls.push(url)
      if (behaviour === 'ok') return Promise.resolve()
      this.fire('did-fail-load', { errorCode: -106, isMainFrame: true })
      this.fire('did-finish-load')
      return Promise.reject(Object.assign(new Error('fail'), { errno: -106 }))
    },
  }
}
function harness(behaviour) {
  const logs = []
  const sent = []
  window.api = { send: (ch, p) => { if (ch === 'app:log' && p && p.message) logs.push(p.message); else sent.push([ch, p]) } }
  const wv = fakeWebview(behaviour)
  return { logs, sent, wv, webviewRefs: { current: { wa: wv } }, messengersRef: { current: [{ id: 'wa', name: 'WhatsApp', url: WA }] } }
}

describe('пульс → окно → лестница: сквозная цепочка', () => {
  beforeEach(() => { vi.useFakeTimers(); delete window.__ccNetOnline; delete window.__ccNetPulse; _resetRecoverySummary() })
  afterEach(() => { vi.useRealTimers(); delete window.api })

  it('[!] интернет появился → попытка В ТУ ЖЕ СЕКУНДУ, не через 60 с; итог сети записан', async () => {
    const h = harness('ok')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    // пульс: интернета нет
    act(() => { applyPulse({ online: false, checkedAt: Date.now() }) })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    expect(result.current.offlineState.wa.phase).toBe('wait')
    // будильник лестницы срабатывает (5 с) — но интернета нет → страницу не трогаем
    await act(async () => { vi.advanceTimersByTime(RETRY_LADDER_MS[0] + 100) })
    expect(h.wv.calls.length, 'без интернета перезагрузка бессмысленна').toBe(0)
    expect(h.logs.some(l => l.includes('интернета нет (по пульсу)'))).toBe(true)
    expect(result.current.offlineState.wa.phase).toBe('wait')
    // пульс: интернет появился → синтетическое online → все ожидающие на «сейчас»
    await act(async () => { applyPulse({ online: true, host: 'www.gstatic.com', checkedAt: Date.now() }) })
    await act(async () => { vi.advanceTimersByTime(50) })
    expect(h.wv.calls.length, 'попытка в ту же секунду').toBe(1)
    expect(Object.keys(result.current.offlineState).length, 'экран снят').toBe(0)
    expect(h.logs.some(l => l.includes('[net] связь появилась — пробуем поднять мессенджеры: 1'))).toBe(true)
    // сводка через 30 с
    await act(async () => { vi.advanceTimersByTime(30_000) })
    const summary = h.logs.find(l => l.includes('итог возврата сети'))
    expect(summary).toContain('перезагружены 1')
    expect(summaryLine()).toContain('перезагружены 1')
  })

  it('окно сообщает главному процессу, сколько мессенджеров ждут (пульс ускоряется)', async () => {
    const h = harness('fail')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    const waiting = h.sent.filter(([ch]) => ch === 'net:pulse-waiting').map(([, p]) => p.count)
    expect(waiting.at(-1)).toBe(1)
    act(() => { result.current.retryNow('wa') })
    expect(h.sent.some(([ch]) => ch === 'net:pulse-now')).toBe(true)
  })

  it('[!] повторный пакет «есть → есть» лестницу не дёргает (событие online только на переходе)', async () => {
    const h = harness('ok')
    const { result } = renderHook(() => useWebviewReconnect(h.webviewRefs, h.messengersRef))
    act(() => { result.current.bindReconnect(h.wv, 'wa') })
    act(() => { applyPulse({ online: true, checkedAt: Date.now() }) })
    await act(async () => { h.wv.fire('did-fail-load', { errorCode: -106 }) })
    act(() => { applyPulse({ online: true, checkedAt: Date.now() }) }) // ежеминутный пакет без перехода
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(h.wv.calls.length, 'до конца отсчёта 5 с не трогаем').toBe(0)
    // первый вердикт (неизвестно → есть) честно считается переходом; ежеминутный повтор — нет
    expect(h.logs.filter(l => l.includes('[net] связь появилась')).length).toBe(1)
  })
})
