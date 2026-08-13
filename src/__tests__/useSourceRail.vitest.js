// v1.2.252 — тест хука проводки бокового рейла (аккаунты 2C).
// Проверяет: клик по аккаунту переключает источник + зовёт soloAccount (когда действия пришли);
// до прихода действий не падает; список аккаунтов обновляется.
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useSourceRail from '../hooks/useSourceRail.js'

describe('useSourceRail', () => {
  it('onSelectAccount переключает источник и (после прихода действий) зовёт soloAccount', () => {
    const onSelectSource = vi.fn()
    const soloAccount = vi.fn()
    const { result } = renderHook(() => useSourceRail({ onSelectSource, nativeCcId: 'native_cc' }))

    // действия из NativeApp ещё не пришли → клик только переключает источник, без падения
    act(() => result.current.onSelectAccount('tg_1'))
    expect(onSelectSource).toHaveBeenCalledWith('native_cc')
    expect(soloAccount).not.toHaveBeenCalled()

    // NativeApp прислал действия
    act(() => result.current.onAccountActionsReady({ soloAccount }))
    act(() => result.current.onSelectAccount('tg_2'))
    expect(soloAccount).toHaveBeenCalledWith('tg_2')
  })

  it('onAccountsChange обновляет список nativeAccounts', () => {
    const { result } = renderHook(() => useSourceRail({ onSelectSource: () => {}, nativeCcId: 'native_cc' }))
    expect(result.current.nativeAccounts).toEqual([])
    act(() => result.current.onAccountsChange([{ id: 'a1', name: 'Иван' }]))
    expect(result.current.nativeAccounts).toEqual([{ id: 'a1', name: 'Иван' }])
  })

  it('не падает без onSelectSource (дефолты)', () => {
    const { result } = renderHook(() => useSourceRail())
    expect(() => act(() => result.current.onSelectAccount('x'))).not.toThrow()
  })
})
