// v0.87.44: регрессионный тест — useForceReadAtBottom НЕ должен срабатывать
// при atBottom=false (default при открытии чата).
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useForceReadAtBottom } from './useForceReadAtBottom.js'

describe('useForceReadAtBottom — защита от ложного срабатывания при открытии', () => {
  function msg(id, isOutgoing = false) { return { id, isOutgoing } }

  it('atBottom=false: НЕ вызывает markRead (главный регрессионный тест v0.87.44)', async () => {
    const markRead = vi.fn()
    const { result } = renderHook(() => {
      const maxEverSentRef = useRef(0)
      useForceReadAtBottom({
        atBottom: false,          // ← КЛЮЧ: default при открытии чата
        activeChatId: 'chat1',
        activeMessages: [msg('100'), msg('101'), msg('12887')],
        activeUnread: 7,
        markRead,
        maxEverSentRef,
      })
      return { maxEverSentRef }
    })
    await new Promise(r => setTimeout(r, 500))  // ждём истечения таймера 400мс
    expect(markRead).not.toHaveBeenCalled()
  })

  it('atBottom=true + unread>0: вызывает markRead через 400мс', async () => {
    const markRead = vi.fn()
    renderHook(() => {
      const maxEverSentRef = useRef(0)
      useForceReadAtBottom({
        atBottom: true,
        activeChatId: 'chat1',
        activeMessages: [msg('100'), msg('200')],
        activeUnread: 5,
        markRead,
        maxEverSentRef,
      })
    })
    await new Promise(r => setTimeout(r, 500))
    expect(markRead).toHaveBeenCalledWith('chat1', 200, { source: 'bottom' })
  })

  it('atBottom=true + unread=0: НЕ вызывает markRead', async () => {
    const markRead = vi.fn()
    renderHook(() => {
      const maxEverSentRef = useRef(0)
      useForceReadAtBottom({
        atBottom: true,
        activeChatId: 'chat1',
        activeMessages: [msg('100')],
        activeUnread: 0,        // нечего помечать
        markRead,
        maxEverSentRef,
      })
    })
    await new Promise(r => setTimeout(r, 500))
    expect(markRead).not.toHaveBeenCalled()
  })

  it('maxEverSentRef guard: не отправляет если lastId <= предыдущего', async () => {
    const markRead = vi.fn()
    renderHook(() => {
      const maxEverSentRef = useRef(500)  // уже был отправлен 500
      useForceReadAtBottom({
        atBottom: true,
        activeChatId: 'chat1',
        activeMessages: [msg('100'), msg('200')],  // lastId=200 < 500
        activeUnread: 5,
        markRead,
        maxEverSentRef,
      })
    })
    await new Promise(r => setTimeout(r, 500))
    expect(markRead).not.toHaveBeenCalled()
  })

  it('v0.91.13: atBottom=true + unread > 30 НЕ вызывает markRead (mass-ack guard)', async () => {
    // Воспроизводит сценарий из chatcenter.log 13:24:24: открытие AlphaPet ЧАТ
    // с unread=304, messages=1, bottomGap=0 (height=client). Без фикса
    // markRead(lastId) → TDLib viewMessages обнуляет 304→0 одним вызовом.
    const markRead = vi.fn()
    renderHook(() => {
      const maxEverSentRef = useRef(0)
      useForceReadAtBottom({
        atBottom: true,
        activeChatId: 'tg_611696632:-1001707262828',
        activeMessages: [msg('81257299968')],
        activeUnread: 304,  // ← как в логе
        markRead,
        maxEverSentRef,
      })
    })
    await new Promise(r => setTimeout(r, 500))
    expect(markRead).not.toHaveBeenCalled()
  })

  it('v0.91.13: граничный случай — unread = 30 (на пороге) ВЫЗЫВАЕТ markRead', async () => {
    const markRead = vi.fn()
    renderHook(() => {
      const maxEverSentRef = useRef(0)
      useForceReadAtBottom({
        atBottom: true,
        activeChatId: 'chat1',
        activeMessages: [msg('100'), msg('200')],
        activeUnread: 30,  // ровно порог
        markRead,
        maxEverSentRef,
      })
    })
    await new Promise(r => setTimeout(r, 500))
    expect(markRead).toHaveBeenCalledWith('chat1', 200, { source: 'bottom' })
  })

  it('v0.91.13: unread = 31 (выше порога на 1) НЕ вызывает markRead', async () => {
    const markRead = vi.fn()
    renderHook(() => {
      const maxEverSentRef = useRef(0)
      useForceReadAtBottom({
        atBottom: true,
        activeChatId: 'chat1',
        activeMessages: [msg('100'), msg('200')],
        activeUnread: 31,
        markRead,
        maxEverSentRef,
      })
    })
    await new Promise(r => setTimeout(r, 500))
    expect(markRead).not.toHaveBeenCalled()
  })

  it('v0.87.44 РЕГРЕССИЯ: сценарий «было 7, стало 1» воспроизведён без фикса', async () => {
    // Имитация открытия чата с default atBottom=true (СТАРОЕ поведение):
    const markRead = vi.fn()
    renderHook(() => {
      const maxEverSentRef = useRef(0)
      useForceReadAtBottom({
        atBottom: true,                        // ← ОШИБКА: default true при открытии
        activeChatId: 'chat1',
        activeMessages: Array.from({ length: 50 }, (_, i) => msg(String(12838 + i))),
        activeUnread: 7,
        markRead,
        maxEverSentRef,
      })
    })
    await new Promise(r => setTimeout(r, 500))
    // Старое поведение: markRead(chat1, 12887) → сервер: 7 - 6 = 1 непрочитанное
    expect(markRead).toHaveBeenCalledWith('chat1', 12887, { source: 'bottom' })

    // Новое поведение (фикс v0.87.44): default atBottom=false → markRead НЕ вызван
    // (этот кейс проверен в первом тесте выше)
  })
})
