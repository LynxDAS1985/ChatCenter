// v1.2.447: тесты полосы «нет связи» для «Общего чата».
// Чистая логика — shared/connectionStripState.js, сама полоса — NativeConnectionStrip.jsx.
//
// 🔴 ГЛАВНАЯ ЛОВУШКА, которую тут сторожим: НЕЗНАКОМОЕ состояние связи НЕ должно
// поднимать полосу. Точных имён состояний официальная документация в проекте не даёт
// (папки DOCS/TDLib нет), поэтому ошибка обязана быть безобидной: полоса не появится.
// Обратное поведение (считать незнакомое бедой) дало бы вечную ложную полосу поверх чатов.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import {
  isOkState, isBadState, connectionLabel, stripVerdict, waitingFor,
  logStateLine, logRestoredLine, logCheckLine,
} from '../../shared/connectionStripState.js'
import NativeConnectionStrip from '../native/components/NativeConnectionStrip.jsx'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('Какое состояние считаем бедой', () => {
  it('связь есть: готово и «догоняем сообщения»', () => {
    for (const s of ['connectionStateReady', 'connectionStateUpdating']) {
      expect(isOkState(s)).toBe(true)
      expect(isBadState(s)).toBe(false)
    }
  })

  it('беда: ждём сеть, подключаемся, подключаемся через прокси', () => {
    for (const s of ['connectionStateWaitingForNetwork', 'connectionStateConnecting', 'connectionStateConnectingToProxy']) {
      expect(isBadState(s), s).toBe(true)
    }
  })

  it('🔴 ЛОВУШКА: незнакомое или пустое состояние бедой НЕ считаем', () => {
    for (const s of ['', null, undefined, 'connectionStateSomethingNew', 'мусор', 42]) {
      expect(isBadState(s), String(s)).toBe(false)
    }
  })

  it('имя состояния человеку понятно, незнакомое отдаём как есть', () => {
    expect(connectionLabel('connectionStateWaitingForNetwork')).toBe('ждём сеть')
    expect(connectionLabel('connectionStateConnectingToProxy')).toBe('подключаемся через прокси')
    expect(connectionLabel('connectionStateConnecting')).toBe('подключаемся')
    expect(connectionLabel('connectionStateReady')).toBe('связь есть')
    expect(connectionLabel('')).toBe('состояние неизвестно')
    expect(connectionLabel('чтоТоНовое')).toBe('чтоТоНовое')
  })
})

describe('Что показывать', () => {
  const now = 1_700_000_000_000

  it('всё хорошо → не показываем ничего', () => {
    expect(stripVerdict({ states: { a: 'connectionStateReady' }, online: true, now })).toBe(null)
    expect(stripVerdict({ states: {}, online: true, now })).toBe(null)
    expect(stripVerdict({})).toBe(null)
  })

  it('сети нет по признаку движка → полоса, даже если состояние «связь есть»', () => {
    const v = stripVerdict({ states: { a: 'connectionStateReady' }, online: false, since: now - 7000, now })
    expect(v.kind).toBe('offline')
    expect(v.title).toBe('Нет связи с интернетом')
    expect(v.seconds).toBe(7)
  })

  it('подключаемся → полоса с причиной; несколько аккаунтов посчитаны', () => {
    const v = stripVerdict({
      states: { a: 'connectionStateConnecting', b: 'connectionStateWaitingForNetwork', c: 'connectionStateReady' },
      online: true, since: now - 3000, now,
    })
    expect(v.kind).toBe('connecting')
    expect(v.accounts).toBe(2)
    expect(v.hint).toContain('аккаунтов: 2')
  })

  it('время ожидания: секунды и минуты, отрицательного не бывает', () => {
    expect(waitingFor(0)).toBe('0 с')
    expect(waitingFor(59)).toBe('59 с')
    expect(waitingFor(80)).toBe('1 мин 20 с')
    expect(waitingFor(-5)).toBe('0 с')
    expect(waitingFor('мусор')).toBe('0 с')
  })

  it('записи в журнал', () => {
    expect(logStateLine('tg_1', 'connectionStateConnecting')).toBe('[tg-conn] аккаунт tg_1: состояние=connectionStateConnecting (подключаемся)')
    expect(logStateLine('tg_1', '')).toContain('<пусто>')
    expect(logRestoredLine('tg_1', 12)).toBe('[tg-conn] аккаунт tg_1: связь восстановлена за 12с')
    expect(logCheckLine()).toBe('[tg-conn] проверка связи по кнопке пользователя')
  })
})

describe('Полоса на экране', () => {
  // Подставная связь с главным процессом: даёт нам вручную «прислать» состояние.
  function fakeApi() {
    const handlers = {}
    const sent = []
    window.api = {
      on: (ch, fn) => { handlers[ch] = fn; return () => { delete handlers[ch] } },
      send: (ch, payload) => sent.push([ch, payload]),
    }
    return { handlers, sent }
  }

  it('пока связь есть — полосы нет', () => {
    const { handlers } = fakeApi()
    render(<NativeConnectionStrip onCheck={() => {}} />)
    act(() => { handlers['tg:account-connection']({ accountId: 'tg_1', state: 'connectionStateReady' }) })
    expect(screen.queryByText(/Подключаемся к Telegram/)).toBe(null)
    expect(screen.queryByRole('button')).toBe(null)
  })

  it('пришло «подключаемся» → видно причину, время и кнопку; состояние попало в журнал', () => {
    const { handlers, sent } = fakeApi()
    render(<NativeConnectionStrip onCheck={() => {}} />)
    act(() => { handlers['tg:account-connection']({ accountId: 'tg_1', state: 'connectionStateWaitingForNetwork' }) })
    expect(screen.getByText('Подключаемся к Telegram')).toBeTruthy()
    expect(screen.getByText(/ждём сеть/)).toBeTruthy()
    expect(screen.getByRole('button').textContent).toBe('Проверить сейчас')
    expect(sent.some(([ch, p]) => ch === 'app:log' && /состояние=connectionStateWaitingForNetwork/.test(p.message))).toBe(true)
  })

  it('кнопка зовёт настоящую проверку и на время блокируется', async () => {
    const { handlers } = fakeApi()
    let resolveCheck
    const onCheck = vi.fn(() => new Promise(r => { resolveCheck = r }))
    render(<NativeConnectionStrip onCheck={onCheck} />)
    act(() => { handlers['tg:account-connection']({ accountId: 'tg_1', state: 'connectionStateConnecting' }) })
    await act(async () => { screen.getByRole('button').click() })
    expect(onCheck).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button').textContent).toBe('Проверяем…')
    expect(screen.getByRole('button').disabled).toBe(true)
    await act(async () => { resolveCheck({ ok: true }) })
    expect(screen.getByRole('button').disabled).toBe(false)
  })

  it('связь вернулась → полоса уходит, в журнале «связь восстановлена»', () => {
    const { handlers, sent } = fakeApi()
    render(<NativeConnectionStrip onCheck={() => {}} />)
    act(() => { handlers['tg:account-connection']({ accountId: 'tg_1', state: 'connectionStateConnecting' }) })
    expect(screen.getByText('Подключаемся к Telegram')).toBeTruthy()
    act(() => { handlers['tg:account-connection']({ accountId: 'tg_1', state: 'connectionStateReady' }) })
    expect(screen.queryByText('Подключаемся к Telegram')).toBe(null)
    expect(sent.some(([ch, p]) => ch === 'app:log' && /связь восстановлена/.test(p.message))).toBe(true)
  })

  it('🔴 ЛОВУШКА: незнакомое состояние полосу НЕ поднимает', () => {
    const { handlers } = fakeApi()
    render(<NativeConnectionStrip onCheck={() => {}} />)
    act(() => { handlers['tg:account-connection']({ accountId: 'tg_1', state: 'connectionStateSomethingNew' }) })
    expect(screen.queryByRole('button')).toBe(null)
  })

  it('«сеть пропала» от движка поднимает полосу даже без состояния от Telegram', () => {
    fakeApi()
    render(<NativeConnectionStrip onCheck={() => {}} />)
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(screen.getByText('Нет связи с интернетом')).toBeTruthy()
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(screen.queryByText('Нет связи с интернетом')).toBe(null)
  })

  it('полоса рисуется ПОВЕРХ (не как обычный ребёнок в ряд) и .native-main это позволяет', () => {
    const src = readFileSync('src/native/components/NativeConnectionStrip.jsx', 'utf8')
    expect(src).toContain("position: 'absolute'")
    const css = readFileSync('src/native/styles-base.css', 'utf8')
    expect(/\.native-main \{[^}]*position: relative/s.test(css)).toBe(true)
    const main = readFileSync('src/native/components/NativeMainContent.jsx', 'utf8')
    expect(main).toContain('<NativeConnectionStrip')
    expect(main).toContain('store.checkConnection')
  })

  it('таймер секунд снимается, когда полосы нет (не будит отрисовку зря)', () => {
    vi.useFakeTimers()
    const { handlers } = fakeApi()
    const { unmount } = render(<NativeConnectionStrip onCheck={() => {}} />)
    act(() => { handlers['tg:account-connection']({ accountId: 'tg_1', state: 'connectionStateConnecting' }) })
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    act(() => { handlers['tg:account-connection']({ accountId: 'tg_1', state: 'connectionStateReady' }) })
    expect(vi.getTimerCount()).toBe(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
