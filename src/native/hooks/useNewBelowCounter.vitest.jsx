// v0.87.42: тест useNewBelowCounter — защита от prepend (load-older)
// засчитываемого как новые сообщения снизу.
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNewBelowCounter } from './useNewBelowCounter.js'

function msg(id, isOutgoing = false) { return { id, isOutgoing } }

describe('useNewBelowCounter — защита от ложного newBelow при prepend', () => {
  it('init: при первом рендере НЕ вызывает onAdded', () => {
    const onAdded = vi.fn()
    const onSkip = vi.fn()
    renderHook(({ messages }) => useNewBelowCounter({
      messages, atBottom: false, onAdded, onSkip,
    }), { initialProps: { messages: [msg('10'), msg('11'), msg('12')] } })
    expect(onAdded).not.toHaveBeenCalled()
  })

  it('prepend (load-older): добавление в НАЧАЛО не засчитывается', () => {
    const onAdded = vi.fn()
    const onSkip = vi.fn()
    const { rerender } = renderHook(({ messages }) => useNewBelowCounter({
      messages, atBottom: false, onAdded, onSkip,
    }), { initialProps: { messages: [msg('10'), msg('11'), msg('12')] } })

    // Prepend: добавляем старые [7, 8, 9] в начало. lastMsgId остаётся '12'
    rerender({ messages: [msg('7'), msg('8'), msg('9'), msg('10'), msg('11'), msg('12')] })

    expect(onAdded).not.toHaveBeenCalled()  // ✅ prepend → не новое
    expect(onSkip).toHaveBeenCalled()
  })

  it('append (новое снизу): считает правильно', () => {
    const onAdded = vi.fn()
    const { rerender } = renderHook(({ messages }) => useNewBelowCounter({
      messages, atBottom: false, onAdded,
    }), { initialProps: { messages: [msg('10'), msg('11'), msg('12')] } })

    // Append: новое msg '13' в конец
    rerender({ messages: [msg('10'), msg('11'), msg('12'), msg('13')] })

    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(onAdded.mock.calls[0][0]).toMatchObject({ added: 1, prevLastId: '12', nowLastId: '13' })
  })

  it('append 3 новых: считает 3', () => {
    const onAdded = vi.fn()
    const { rerender } = renderHook(({ messages }) => useNewBelowCounter({
      messages, atBottom: false, onAdded,
    }), { initialProps: { messages: [msg('10')] } })
    rerender({ messages: [msg('10'), msg('11'), msg('12'), msg('13')] })
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ added: 3 }))
  })

  it('outgoing сообщения НЕ считаются (мои отправленные)', () => {
    const onAdded = vi.fn()
    const { rerender } = renderHook(({ messages }) => useNewBelowCounter({
      messages, atBottom: false, onAdded,
    }), { initialProps: { messages: [msg('10')] } })
    rerender({ messages: [msg('10'), msg('11', true), msg('12', true)] })
    // Оба исходящих → onAdded вызван (lastId изменился), но added=0 — не дёргаем setNewBelow
    // По реализации: added=0 → onAdded НЕ вызывается
    expect(onAdded).not.toHaveBeenCalled()
  })

  it('atBottom=true: не считает даже реально новые', () => {
    const onAdded = vi.fn()
    const { rerender } = renderHook(({ messages, atBottom }) => useNewBelowCounter({
      messages, atBottom, onAdded,
    }), { initialProps: { messages: [msg('10')], atBottom: true } })
    rerender({ messages: [msg('10'), msg('11')], atBottom: true })
    expect(onAdded).not.toHaveBeenCalled()  // юзер внизу — не копим бейдж
  })

  it('v0.87.42 РЕГРЕССИЯ: load-older сценарий из логов (prepend 50 старых не = 50 новых)', () => {
    const onAdded = vi.fn()
    const onSkip = vi.fn()
    // Изначально 50 сообщений (id 12838-12887)
    const initial = Array.from({ length: 50 }, (_, i) => msg(String(12838 + i)))
    const { rerender } = renderHook(({ messages }) => useNewBelowCounter({
      messages, atBottom: false, onAdded, onSkip,
    }), { initialProps: { messages: initial } })

    // Load-older догружает 50 старых (id 12788-12837) в НАЧАЛО
    const older = Array.from({ length: 50 }, (_, i) => msg(String(12788 + i)))
    rerender({ messages: [...older, ...initial] })

    // Старое поведение: slice(50) = последние 50 = 12838-12887 (которые уже были) → +50 в newBelow ❌
    // Новое поведение: lastId не изменился (12887 → 12887) → НЕ считается ✅
    expect(onAdded).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalled()
  })
})
