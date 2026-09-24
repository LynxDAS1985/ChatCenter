// v1.2.499 — общий помощник «жди не дольше» (shared/withTimeout.js).
//
// ЗАЧЕМ ОН ЕСТЬ: ожидание без предела — повторяющаяся беда проекта. В v1.2.497 из-за такого ожидания
// экран «Подключаемся…» висел вечно; ревью нашло ещё два места с тем же изъяном (загрузка страницы и
// выполнение скрипта в WebContentsView, отправка текста в ИИ-вкладку). Помощник один на всех, потому
// что три собственные копии одного приёма расходятся при правках.
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import { withTimeout, tryWithTimeout } from '../../shared/withTimeout.js'

describe('жди не дольше', () => {
  it('успел вовремя → отдаёт результат', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, () => new Error('поздно'))).resolves.toBe(42)
  })

  it('[!] не успел → отказ нашей ошибкой, а ждущий получает управление', async () => {
    const never = new Promise(() => {})
    await expect(withTimeout(never, 20, () => new Error('не дождались'))).rejects.toThrow('не дождались')
  })

  it('[!] таймер гасится после успеха — иначе он жил бы до конца срока', async () => {
    vi.useFakeTimers()
    try {
      const p = withTimeout(Promise.resolve('ок'), 60000, () => new Error('x'))
      await p
      expect(vi.getTimerCount(), 'висящих таймеров быть не должно').toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('предел не задан (0, пусто, мусор) → просто ждём, как раньше', async () => {
    for (const bad of [0, -5, null, undefined, NaN, 'abc']) {
      await expect(withTimeout(Promise.resolve('ок'), bad, () => new Error('x'))).resolves.toBe('ок')
    }
  })

  it('чужой отказ проходит как есть (нашу ошибку не подставляем)', async () => {
    await expect(withTimeout(Promise.reject(new Error('своя беда')), 1000, () => new Error('наша')))
      .rejects.toThrow('своя беда')
  })

  it('[!] tryWithTimeout: не падает, а отвечает {ok:false} и помечает «не дождались»', async () => {
    const good = await tryWithTimeout(Promise.resolve(7), 1000, 'дело')
    expect(good).toEqual({ ok: true, result: 7 })
    const bad = await tryWithTimeout(new Promise(() => {}), 20, 'загрузка страницы')
    expect(bad.ok).toBe(false)
    expect(bad.timedOut).toBe(true)
    expect(bad.error).toContain('загрузка страницы')
    const err = await tryWithTimeout(Promise.reject(new Error('сервер отказал')), 1000, 'дело')
    expect(err).toEqual({ ok: false, error: 'сервер отказал', timedOut: false })
  })

  it('[!] проводка: три места, где раньше ждали вечно, теперь под пределом', () => {
    const wcv = fs.readFileSync('main/utils/webContentsViewManager.js', 'utf8')
    expect(wcv).toContain('tryWithTimeout(entry.view.webContents.loadURL(url)')
    expect(wcv).toContain('tryWithTimeout(entry.view.webContents.executeJavaScript(code, true)')
    const ai = fs.readFileSync('shared/aiWebviewContext.js', 'utf8')
    expect(ai).toContain('withTimeout(wv.executeJavaScript(script)')
    const attempt = fs.readFileSync('shared/reconnectAttempt.js', 'utf8')
    expect(attempt, 'своя копия помощника убрана').not.toContain('function raceWithTimeout')
    expect(attempt).toContain("from './withTimeout.js'")
  })
})
