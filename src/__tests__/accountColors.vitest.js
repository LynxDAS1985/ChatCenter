// v1.2.153/154: тест локальных цветов-меток аккаунтов.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ACCOUNT_PALETTE, getAccountColor, withAccountColor, assignMissingColors,
  loadAccountColors, saveAccountColors,
} from '../native/store/accountColors.js'

describe('getAccountColor', () => {
  it('сохранённый цвет имеет приоритет', () => {
    expect(getAccountColor({ tg_1: '#ff0000' }, 'tg_1')).toBe('#ff0000')
  })
  it('нет цвета в карте → первый цвет палитры (fallback до автоназначения)', () => {
    expect(getAccountColor({}, 'tg_1')).toBe(ACCOUNT_PALETTE[0])
  })
  it('пустой id → первый цвет (без падения)', () => {
    expect(getAccountColor({}, '')).toBe(ACCOUNT_PALETTE[0])
    expect(getAccountColor(null, null)).toBe(ACCOUNT_PALETTE[0])
  })
})

describe('assignMissingColors (различимость + стабильность)', () => {
  it('двум аккаунтам БЕЗ цвета назначает РАЗНЫЕ цвета', () => {
    const m = assignMissingColors({}, ['tg_a', 'tg_b'])
    expect(m.tg_a).not.toBe(m.tg_b)
    expect(ACCOUNT_PALETTE).toContain(m.tg_a)
    expect(ACCOUNT_PALETTE).toContain(m.tg_b)
  })

  it('добавление 3-го аккаунта НЕ меняет цвета первых двух (стабильность)', () => {
    const m2 = assignMissingColors({}, ['tg_a', 'tg_b'])
    const m3 = assignMissingColors(m2, ['tg_a', 'tg_b', 'tg_c'])
    expect(m3.tg_a).toBe(m2.tg_a) // не «прыгнул»
    expect(m3.tg_b).toBe(m2.tg_b)
    expect(m3.tg_c).not.toBe(m2.tg_a)
    expect(m3.tg_c).not.toBe(m2.tg_b)
  })

  it('НЕ трогает выбор пользователя (сохранённый цвет)', () => {
    const m = assignMissingColors({ tg_a: '#123456' }, ['tg_a', 'tg_b'])
    expect(m.tg_a).toBe('#123456')
    expect(m.tg_b).not.toBe('#123456')
  })

  it('нечего назначать → возвращает ТОТ ЖЕ объект (для guard в сторе)', () => {
    const src = { tg_a: '#111', tg_b: '#222' }
    expect(assignMissingColors(src, ['tg_a', 'tg_b'])).toBe(src)
  })

  it('больше 8 аккаунтов — не падает, цвета по кругу', () => {
    const ids = Array.from({ length: 10 }, (_, i) => 'tg_' + i)
    const m = assignMissingColors({}, ids)
    expect(Object.keys(m)).toHaveLength(10)
    ids.forEach(id => expect(ACCOUNT_PALETTE).toContain(m[id]))
  })

  it('не мутирует вход', () => {
    const src = {}
    assignMissingColors(src, ['tg_a'])
    expect(src).toEqual({})
  })
})

describe('withAccountColor', () => {
  it('ставит цвет, не мутирует вход', () => {
    const before = { tg_1: '#111' }
    const after = withAccountColor(before, 'tg_2', '#222')
    expect(after).toEqual({ tg_1: '#111', tg_2: '#222' })
    expect(before).toEqual({ tg_1: '#111' })
  })
  it('пустой цвет снимает выбор', () => {
    expect(withAccountColor({ tg_1: '#111' }, 'tg_1', null).tg_1).toBeUndefined()
  })
})

describe('accountColors — localStorage', () => {
  beforeEach(() => { localStorage.clear() })
  it('пусто → {}', () => { expect(loadAccountColors()).toEqual({}) })
  it('save → load', () => { saveAccountColors({ tg_1: '#abc' }); expect(loadAccountColors()).toEqual({ tg_1: '#abc' }) })
  it('битый JSON → {}', () => { localStorage.setItem('cc-native-account-colors', '{не json'); expect(loadAccountColors()).toEqual({}) })
  it('массив вместо объекта → {}', () => { localStorage.setItem('cc-native-account-colors', '["x"]'); expect(loadAccountColors()).toEqual({}) })
})
