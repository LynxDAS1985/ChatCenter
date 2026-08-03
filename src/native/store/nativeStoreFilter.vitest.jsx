// v1.2.163: тест действий стора для фильтра аккаунтов (множественный выбор + «соло»).
// Вынесен из nativeStore.vitest.jsx (тот у лимита). Проверяет проводку действий к чистой
// логике shared/accountFilter.js: скрыть/показать, «нельзя скрыть последний», соло, «Все».
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useNativeStore from './nativeStore.js'

let onHandlers

beforeEach(() => {
  onHandlers = {}
  globalThis.window.api = {
    invoke: vi.fn(() => Promise.resolve({ ok: true })),
    on: vi.fn((ch, cb) => { onHandlers[ch] = cb; return () => { delete onHandlers[ch] } }),
    send: vi.fn(),
  }
  localStorage.clear()
})

function addTwoAccounts(result) {
  act(() => {
    onHandlers['tg:account-update']?.({ id: 'tg_a', messenger: 'telegram', status: 'connected', name: 'A' })
    onHandlers['tg:account-update']?.({ id: 'tg_b', messenger: 'telegram', status: 'connected', name: 'B' })
  })
}

describe('v1.2.163 фильтр аккаунтов — действия стора', () => {
  it('по умолчанию ничего не скрыто, нет соло', () => {
    const { result } = renderHook(() => useNativeStore())
    addTwoAccounts(result)
    expect(result.current.hiddenAccountIds).toEqual([])
    expect(result.current.soloAccountId).toBe(null)
  })

  it('toggleAccountVisible скрывает/показывает; НЕЛЬЗЯ скрыть последний видимый', () => {
    const { result } = renderHook(() => useNativeStore())
    addTwoAccounts(result)
    act(() => { result.current.toggleAccountVisible('tg_b') })
    expect(result.current.hiddenAccountIds).toEqual(['tg_b'])
    // tg_a — последний видимый, скрыть нельзя
    act(() => { result.current.toggleAccountVisible('tg_a') })
    expect(result.current.hiddenAccountIds).toEqual(['tg_b'])
    // вернуть tg_b
    act(() => { result.current.toggleAccountVisible('tg_b') })
    expect(result.current.hiddenAccountIds).toEqual([])
  })

  it('soloAccount ставит/снимает «только этот»; одиночный клик выходит из соло', () => {
    const { result } = renderHook(() => useNativeStore())
    addTwoAccounts(result)
    act(() => { result.current.soloAccount('tg_a') })
    expect(result.current.soloAccountId).toBe('tg_a')
    act(() => { result.current.soloAccount('tg_a') }) // повтор — снять
    expect(result.current.soloAccountId).toBe(null)
    // соло + одиночный клик по другому → соло снимается
    act(() => { result.current.soloAccount('tg_a') })
    act(() => { result.current.toggleAccountVisible('tg_b') })
    expect(result.current.soloAccountId).toBe(null)
    expect(result.current.hiddenAccountIds).toEqual(['tg_b'])
  })

  it('showAllAccounts снимает все скрытия и соло', () => {
    const { result } = renderHook(() => useNativeStore())
    addTwoAccounts(result)
    act(() => { result.current.toggleAccountVisible('tg_b') })
    act(() => { result.current.soloAccount('tg_a') })
    act(() => { result.current.showAllAccounts() })
    expect(result.current.hiddenAccountIds).toEqual([])
    expect(result.current.soloAccountId).toBe(null)
  })

  it('v1.2.169 (страховка): при загрузке ВСЕ аккаунты скрыты в localStorage → скрытие сбрасывается', () => {
    // имитируем «залипшее» состояние из старой версии: оба аккаунта помечены скрытыми
    localStorage.setItem('cc-native-hidden-accounts', JSON.stringify(['tg_a', 'tg_b']))
    const { result } = renderHook(() => useNativeStore())
    addTwoAccounts(result) // аккаунты пришли → эффект-самопроверка видит «все скрыты» → чистит
    expect(result.current.hiddenAccountIds).toEqual([])
  })

  it('v1.2.169: частичное скрытие (1 из 2) при загрузке НЕ сбрасывается', () => {
    localStorage.setItem('cc-native-hidden-accounts', JSON.stringify(['tg_a']))
    const { result } = renderHook(() => useNativeStore())
    addTwoAccounts(result)
    expect(result.current.hiddenAccountIds).toEqual(['tg_a']) // валидное скрытие сохранено
  })

  it('v1.2.168 (баг): удалили ВИДИМЫЙ аккаунт — оставшийся скрытый становится видимым', () => {
    const { result } = renderHook(() => useNativeStore())
    addTwoAccounts(result)
    // скрыли A → виден только B
    act(() => { result.current.toggleAccountVisible('tg_a') })
    expect(result.current.hiddenAccountIds).toEqual(['tg_a'])
    // удалили B (видимый) → A остался бы скрытым (баг) → должен стать видимым
    act(() => { onHandlers['tg:account-update']?.({ id: 'tg_b', removed: true }) })
    expect(result.current.hiddenAccountIds).toEqual([]) // A больше не скрыт
    expect(result.current.soloAccountId).toBe(null)
  })

  it('v1.2.164 (fix #1): удаление ПОСЛЕДНЕГО аккаунта чистит localStorage скрытых', () => {
    const { result } = renderHook(() => useNativeStore())
    addTwoAccounts(result)
    act(() => { result.current.toggleAccountVisible('tg_b') })
    expect(JSON.parse(localStorage.getItem('cc-native-hidden-accounts') || '[]')).toEqual(['tg_b'])
    // удаляем оба (второй = последний → wipe)
    act(() => { onHandlers['tg:account-update']?.({ id: 'tg_a', removed: true }) })
    act(() => { onHandlers['tg:account-update']?.({ id: 'tg_b', removed: true }) })
    // localStorage скрытых очищен — иначе при рестарте были бы «призраки»
    expect(JSON.parse(localStorage.getItem('cc-native-hidden-accounts') || '[]')).toEqual([])
  })
})
