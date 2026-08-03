// v1.2.163: тесты фильтра аккаунтов (множественный выбор + соло).
import { describe, it, expect, beforeEach } from 'vitest'
import {
  isAccountVisible, toggleAccountHidden, visibleAccountCount, isAllVisible,
  sanitizeHiddenAccounts, effectiveVisibleAccountIds,
  loadHiddenAccounts, saveHiddenAccounts,
} from '../native/store/accountFilter.js'

describe('isAccountVisible', () => {
  it('нет скрытых, нет соло → виден', () => {
    expect(isAccountVisible('a', [], null)).toBe(true)
  })
  it('в скрытых → не виден', () => {
    expect(isAccountVisible('a', ['a'], null)).toBe(false)
    expect(isAccountVisible('b', ['a'], null)).toBe(true)
  })
  it('соло другого → не виден; соло этого → виден (скрытые игнорируются)', () => {
    expect(isAccountVisible('a', [], 'b')).toBe(false)
    expect(isAccountVisible('a', ['a'], 'a')).toBe(true) // соло перекрывает «скрыт»
  })
})

describe('toggleAccountHidden (защита от пустого списка)', () => {
  it('показать/скрыть, вход не мутируется', () => {
    const before = []
    expect(toggleAccountHidden(before, 'b', ['a', 'b'])).toEqual(['b']) // скрыть b (a остаётся видим)
    expect(before).toEqual([])
  })
  it('повторный вызов снимает скрытие', () => {
    expect(toggleAccountHidden(['b'], 'b', ['a', 'b'])).toEqual([]) // показать b
  })
  it('НЕЛЬЗЯ скрыть последний видимый', () => {
    // a уже скрыт, видим только b → попытка скрыть b игнорируется
    expect(toggleAccountHidden(['a'], 'b', ['a', 'b'])).toEqual(['a'])
  })
  it('пустой id → без изменений', () => {
    expect(toggleAccountHidden(['a'], '', ['a', 'b'])).toEqual(['a'])
  })
})

describe('visibleAccountCount', () => {
  it('без скрытых = все', () => {
    expect(visibleAccountCount(['a', 'b', 'c'], [], null)).toBe(3)
  })
  it('со скрытыми = всего − скрытые', () => {
    expect(visibleAccountCount(['a', 'b', 'c'], ['b'], null)).toBe(2)
  })
  it('соло = 1 (если аккаунт существует)', () => {
    expect(visibleAccountCount(['a', 'b'], ['a'], 'a')).toBe(1)
    expect(visibleAccountCount(['a', 'b'], [], 'zzz')).toBe(0)
  })
})

describe('isAllVisible', () => {
  it('нет скрытых и нет соло → все', () => {
    expect(isAllVisible([], null)).toBe(true)
  })
  it('есть скрытые ИЛИ соло → не все', () => {
    expect(isAllVisible(['a'], null)).toBe(false)
    expect(isAllVisible([], 'a')).toBe(false)
  })
})

describe('sanitizeHiddenAccounts (самопроверка при загрузке — v1.2.169)', () => {
  it('все аккаунты скрыты → сбрасывает в []', () => {
    expect(sanitizeHiddenAccounts(['a', 'b'], ['a', 'b'])).toEqual([])
  })
  it('частичное скрытие (1 из 3) — НЕ трогает', () => {
    const h = ['b']
    expect(sanitizeHiddenAccounts(h, ['a', 'b', 'c'])).toBe(h) // тот же массив (guard)
  })
  it('убирает «призраки» — id несуществующих аккаунтов', () => {
    expect(sanitizeHiddenAccounts(['b', 'ghost'], ['a', 'b', 'c'])).toEqual(['b'])
  })
  it('аккаунты ещё НЕ загружены (пусто) → не трогает (вернёт вход)', () => {
    const h = ['a', 'b']
    expect(sanitizeHiddenAccounts(h, [])).toBe(h) // не сотрёт валидное скрытие до загрузки
  })
})

describe('effectiveVisibleAccountIds (страховка от пустого списка — v1.2.169)', () => {
  it('обычный случай — видны все, кроме скрытых', () => {
    expect(effectiveVisibleAccountIds(['a', 'b', 'c'], ['b'], null)).toEqual(['a', 'c'])
  })
  it('ВСЕ скрыты → показываем всех (не пусто)', () => {
    expect(effectiveVisibleAccountIds(['a', 'b'], ['a', 'b'], null)).toEqual(['a', 'b'])
  })
  it('соло перекрывает', () => {
    expect(effectiveVisibleAccountIds(['a', 'b'], ['a'], 'a')).toEqual(['a'])
  })
  it('соло на несуществующем → падает в обычную логику', () => {
    expect(effectiveVisibleAccountIds(['a', 'b'], [], 'zzz')).toEqual(['a', 'b'])
  })
})

describe('accountFilter — localStorage', () => {
  beforeEach(() => { localStorage.clear() })
  it('пусто → []', () => { expect(loadHiddenAccounts()).toEqual([]) })
  it('save → load', () => { saveHiddenAccounts(['a', 'b']); expect(loadHiddenAccounts()).toEqual(['a', 'b']) })
  it('битый JSON → []', () => { localStorage.setItem('cc-native-hidden-accounts', '{не json'); expect(loadHiddenAccounts()).toEqual([]) })
  it('нестроковый мусор фильтруется', () => {
    localStorage.setItem('cc-native-hidden-accounts', JSON.stringify(['ok', 5, null, '']))
    expect(loadHiddenAccounts()).toEqual(['ok'])
  })
})
