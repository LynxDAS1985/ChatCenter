// v1.2.491 — присмотр за ОТКРЫТОЙ страницей (shared/openPageWatch.js + src/hooks/useOpenPageWatch.js).
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import { decideProbe, OPEN_PAGE_FAILS_TO_ACT, logStuckLine, logNetDownLine } from '../../shared/openPageWatch.js'
import { applyPulse, netVerdict, probeOk } from '../hooks/useOpenPageWatch.js'

describe('правило по исходу пробы', () => {
  it('прошла → чисто; один провал → наблюдаем; два при живом интернете → зависла; два без интернета → нет интернета', () => {
    expect(decideProbe({ fails: 0, ok: true, netOnline: true, alreadyWatched: false })).toBe('clear')
    expect(decideProbe({ fails: 1, ok: false, netOnline: true, alreadyWatched: false })).toBe('watch')
    expect(decideProbe({ fails: 2, ok: false, netOnline: true, alreadyWatched: false })).toBe('stuck')
    expect(decideProbe({ fails: 2, ok: false, netOnline: null, alreadyWatched: false })).toBe('stuck') // пульс неизвестен = считаем, что есть
    expect(decideProbe({ fails: 2, ok: false, netOnline: false, alreadyWatched: false })).toBe('net-down')
    expect(OPEN_PAGE_FAILS_TO_ACT).toBe(2)
  })
  it('[!] ЛОВУШКА: мессенджер уже под присмотром повторов → второй раз не докладываем', () => {
    expect(decideProbe({ fails: 5, ok: false, netOnline: true, alreadyWatched: true })).toBe('none')
  })
  it('строки журнала говорят, что будет дальше', () => {
    expect(logStuckLine('ВК')).toContain('перезагрузка по лестнице')
    expect(logNetDownLine('ВК')).toContain('страницу не трогаю')
  })
})

describe('приём пульса в окне', () => {
  const logged = []
  beforeEach(() => { delete window.__ccNetOnline; logged.length = 0; window.api = { send: (_c, d) => logged.push(d && d.message) } })

  it('вердикт → стандартные события окна, ровно по одному на переход', () => {
    const on = vi.fn(), off = vi.fn()
    window.addEventListener('online', on); window.addEventListener('offline', off)
    applyPulse({ online: true, host: 'a' })
    expect(netVerdict()).toBe(true)
    expect(on).toHaveBeenCalledTimes(1)
    applyPulse({ online: true, host: 'a' }) // повтор того же — тишина
    expect(on).toHaveBeenCalledTimes(1)
    applyPulse({ online: false })
    expect(off).toHaveBeenCalledTimes(1)
    expect(netVerdict()).toBe(false)
    expect(logged.filter(Boolean).join('\n')).toContain('[net-pulse→окно] интернет пропал')
    window.removeEventListener('online', on); window.removeEventListener('offline', off)
  })
  it('мусор вместо вердикта — игнорируем; до первого пульса вердикт неизвестен', () => {
    expect(netVerdict()).toBeNull()
    applyPulse(null); applyPulse({ online: 'да' })
    expect(netVerdict()).toBeNull()
  })
  it('исход пробы: ok только когда нет таймаута, ошибки и result.ok !== false', () => {
    expect(probeOk({ result: { ok: true } })).toBe(true)
    expect(probeOk({ result: {} })).toBe(true)
    expect(probeOk({ result: { ok: false } })).toBe(false)
    expect(probeOk({ error: new Error('x') })).toBe(false)
    expect(probeOk({ timeout: true })).toBe(false)
    expect(probeOk(null)).toBe(false)
  })
})

describe('[!] ЛОВУШКИ подключения', () => {
  it('App зовёт присмотр и отдаёт ему исход каждой пробы; сторож Ozon молчит без интернета', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8')
    expect(app).toContain("import useOpenPageWatch from './hooks/useOpenPageWatch.js'")
    expect(app).toContain('useOpenPageWatch({ reportFail, offlineStateRef, messengersRef })')
    expect(app).toContain('.then((outcome) => { onProbeOutcome(id, outcome); return outcome })')
    expect(app).toContain("from '../shared/connectionHealthScheduler.js'")
    const ozon = fs.readFileSync('src/utils/ozonBgWatcher.js', 'utf8')
    expect((ozon.match(/window\.__ccNetOnline (===|!==) false/g) || []).length).toBe(2)
    expect(fs.existsSync('src/utils/connectionHealthScheduler.js')).toBe(false) // переехал в shared
  })
})
