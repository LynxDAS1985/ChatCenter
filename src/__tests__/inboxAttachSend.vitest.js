// v1.2.214: тест ожидания серверного подтверждения перед отправкой текста.
// @vitest-environment happy-dom
//
// Проверяет createSendAckWaiter — сердце фикса «у собеседника текст выше фото».
// Логика: текст уходит ТОЛЬКО после того, как ВСЕ сообщения фото/альбома получили
// серверное подтверждение (tg:send-succeeded по всем временным номерам). Иначе лёгкий
// текст получал более ранний серверный номер, чем позже склеенный альбом.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSendAckWaiter } from '../native/utils/inboxAttachSend.js'

// Ставит фейковый window.api.on, возвращает функцию emit для эмуляции tg:send-succeeded.
function installFakeApi() {
  let cb = null
  window.api = {
    on: (channel, fn) => {
      if (channel === 'tg:send-succeeded') cb = fn
      return () => { cb = null }
    },
  }
  return {
    emit: (oldId) => { if (cb) cb({ oldId }) },
    hasListener: () => cb != null,
  }
}

afterEach(() => {
  delete window.api
  vi.useRealTimers()
})

describe('createSendAckWaiter', () => {
  it('нет window.api → сразу no-api (в тестах/без моста не зависаем)', async () => {
    delete window.api
    const w = createSendAckWaiter()
    expect(await w.wait(1000, ['a'])).toBe('no-api')
    w.cancel()
  })

  it('пустой список номеров → no-ids (идём дальше)', async () => {
    installFakeApi()
    const w = createSendAckWaiter()
    expect(await w.wait(1000, [])).toBe('no-ids')
    w.cancel()
  })

  it('ждёт ВСЕ номера: резолв только когда подтверждены все', async () => {
    const api = installFakeApi()
    const w = createSendAckWaiter()
    const p = w.wait(5000, ['x', 'y', 'z'])
    let settled = false
    p.then(() => { settled = true })

    api.emit('x')
    await Promise.resolve()
    expect(settled).toBe(false)      // подтверждён только 1 из 3 — ждём дальше

    api.emit('y')
    await Promise.resolve()
    expect(settled).toBe(false)      // 2 из 3 — ждём

    api.emit('z')
    expect(await p).toBe('acked')    // все 3 → резолв
    w.cancel()
  })

  it('подтверждения пришли ДО wait() → acked-early', async () => {
    const api = installFakeApi()
    const w = createSendAckWaiter()
    api.emit('a')                    // ACK успел прийти раньше, чем мы начали ждать
    api.emit('b')
    expect(await w.wait(5000, ['a', 'b'])).toBe('acked-early')
    w.cancel()
  })

  it('чужие подтверждения не разблокируют раньше времени', async () => {
    const api = installFakeApi()
    const w = createSendAckWaiter()
    const p = w.wait(5000, ['mine1', 'mine2'])
    let settled = false
    p.then(() => { settled = true })

    api.emit('foreign')              // подтверждение чужого сообщения
    api.emit('mine1')
    await Promise.resolve()
    expect(settled).toBe(false)      // свой номер mine2 ещё не подтверждён

    api.emit('mine2')
    expect(await p).toBe('acked')
    w.cancel()
  })

  it('подтверждение не пришло → timeout (не зависаем, текст всё равно уйдёт)', async () => {
    vi.useFakeTimers()
    installFakeApi()
    const w = createSendAckWaiter()
    const p = w.wait(15000, ['never'])
    vi.advanceTimersByTime(15000)
    expect(await p).toBe('timeout')
    w.cancel()
  })
})
