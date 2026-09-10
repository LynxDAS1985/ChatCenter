// v1.2.441: поведенческие тесты сборщика аватарок веб-аккаунтов.
//
// 🔴 ЛОВУШКИ (все три — реальные находки ревью v1.2.440):
//   №1 «кнопка не работает»: пункт меню «Обновить фото аккаунта» чистил кэш в странице,
//      но значок продолжал показывать СТАРОЕ фото (состояние менялось только при появлении
//      нового снимка). Теперь по событию 'cc-avatar-reset' значок забывает фото.
//   №2 «неудачу не видно»: «НЕТ фото» писалось один раз за сеанс на мессенджер → после
//      сброса повторная неудача (то, что и надо разбирать) в журнал не попадала.
//   №3 «цифра в ключе»: в sel зашит размер снимка ('onscreen-big-4360') → менялся размер,
//      и та же самая запись считалась новой (повтор в журнале + рост набора ключей).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import fs from 'node:fs'
import useWebAccountAvatars, { avatarLogGateKey, AVATAR_RESET_EVENT } from './useWebAccountAvatars.js'

const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(600)
const PHOTO2 = 'data:image/jpeg;base64,' + 'B'.repeat(600)

/** Заглушка одного веб-мессенджера: скрипт отдаёт заранее заданные ответы по очереди. */
function harness(answers) {
  const logs = []
  window.api = { send: (ch, p) => { if (ch === 'app:log' && p && p.message) logs.push(p.message) } }
  let i = 0
  const wv = { executeJavaScript: () => Promise.resolve(answers[Math.min(i++, answers.length - 1)]) }
  return {
    logs,
    webviewRefs: { current: { m1: wv } },
    messengersRef: { current: [{ id: 'm1', isNative: false }] },
  }
}
const count = (logs, needle) => logs.filter(l => l.includes(needle)).length

describe('Ключ записи в журнал (avatarLogGateKey)', () => {
  it('🔴 ЛОВУШКА №3: размер снимка в sel НЕ создаёт новый ключ', () => {
    expect(avatarLogGateKey('custom_177', 'onscreen-big-4360', 'ok'))
      .toBe(avatarLogGateKey('custom_177', 'onscreen-big-6556', 'ok'))
  })

  it('разные источники — разные ключи (цифры в id не стираются)', () => {
    expect(avatarLogGateKey('custom_111', 'stored', 'ok'))
      .not.toBe(avatarLogGateKey('custom_222', 'stored', 'ok'))
  })

  it('разная причина — разные ключи (смена «ok» на «устарел» попадёт в журнал)', () => {
    expect(avatarLogGateKey('m1', 'crisp-stored', 'ok'))
      .not.toBe(avatarLogGateKey('m1', 'crisp-stored', 'устарел'))
  })

  it('пусто / undefined не ломают ключ', () => {
    expect(typeof avatarLogGateKey('m1', undefined, null, '')).toBe('string')
  })
})

describe('Сборщик аватарок — поведение', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); delete window.api })

  it('фото найдено → попадает в состояние значка + запись в журнал', async () => {
    const h = harness([{ avatar: PHOTO, sel: 'crisp-stored', avwhy: 'ok' }])
    const { result } = renderHook(() => useWebAccountAvatars(h.webviewRefs, h.messengersRef))
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(result.current.m1).toBe(PHOTO)
    expect(count(h.logs, 'получен аватар')).toBe(1)
  })

  it('🔴 ЛОВУШКА №1: событие сброса → значок ЗАБЫВАЕТ фото + запись в журнал', async () => {
    const h = harness([{ avatar: PHOTO, sel: 'crisp-stored', avwhy: 'ok' }])
    const { result } = renderHook(() => useWebAccountAvatars(h.webviewRefs, h.messengersRef))
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(result.current.m1).toBe(PHOTO)
    await act(async () => { window.dispatchEvent(new CustomEvent(AVATAR_RESET_EVENT, { detail: 'm1' })) })
    expect(result.current.m1).toBeUndefined()
    expect(count(h.logs, 'значок ЗАБЫЛ старое фото')).toBe(1)
  })

  it('сброс ЧУЖОГО источника не трогает наш значок', async () => {
    const h = harness([{ avatar: PHOTO, sel: 'stored', avwhy: 'ok' }])
    const { result } = renderHook(() => useWebAccountAvatars(h.webviewRefs, h.messengersRef))
    await act(async () => { vi.advanceTimersByTime(6000) })
    await act(async () => { window.dispatchEvent(new CustomEvent(AVATAR_RESET_EVENT, { detail: 'другой' })) })
    expect(result.current.m1).toBe(PHOTO)
  })

  it('сброс без имени источника ничего не делает и не падает', async () => {
    const h = harness([{ avatar: PHOTO, sel: 'stored', avwhy: 'ok' }])
    const { result } = renderHook(() => useWebAccountAvatars(h.webviewRefs, h.messengersRef))
    await act(async () => { vi.advanceTimersByTime(6000) })
    await act(async () => { window.dispatchEvent(new CustomEvent(AVATAR_RESET_EVENT, {})) })
    expect(result.current.m1).toBe(PHOTO)
  })

  it('после сброса удачная съёмка снова пишется в журнал (гейт снят)', async () => {
    const h = harness([{ avatar: PHOTO, sel: 'crisp-stored', avwhy: 'ok' }])
    const { result } = renderHook(() => useWebAccountAvatars(h.webviewRefs, h.messengersRef))
    await act(async () => { vi.advanceTimersByTime(6000) })
    await act(async () => { window.dispatchEvent(new CustomEvent(AVATAR_RESET_EVENT, { detail: 'm1' })) })
    await act(async () => { vi.advanceTimersByTime(12000) })
    expect(result.current.m1).toBe(PHOTO)
    expect(count(h.logs, 'получен аватар')).toBe(2)
  })

  it('🔴 ЛОВУШКА №3: одинаковое состояние с разным размером снимка → ОДНА запись', async () => {
    const h = harness([
      { avatar: PHOTO, sel: 'onscreen-big-4360', avwhy: 'ok' },
      { avatar: PHOTO, sel: 'onscreen-big-6556', avwhy: 'ok' },
    ])
    renderHook(() => useWebAccountAvatars(h.webviewRefs, h.messengersRef))
    await act(async () => { vi.advanceTimersByTime(6000) })
    await act(async () => { vi.advanceTimersByTime(12000) })
    expect(count(h.logs, 'получен аватар')).toBe(1)
  })

  it('🔴 ЛОВУШКА №2: неудача — одинаковая пишется раз, ДРУГАЯ причина пишется снова', async () => {
    const h = harness([
      { avatar: null, sel: 'none', err: 'no-el' },
      { avatar: null, sel: 'none', err: 'no-el' },
      { avatar: null, sel: 'partial', err: 'soft', avwhy: 'устарел' },
    ])
    renderHook(() => useWebAccountAvatars(h.webviewRefs, h.messengersRef))
    await act(async () => { vi.advanceTimersByTime(6000) })
    await act(async () => { vi.advanceTimersByTime(12000) })
    expect(count(h.logs, 'НЕТ фото')).toBe(1)
    await act(async () => { vi.advanceTimersByTime(12000) })
    expect(count(h.logs, 'НЕТ фото')).toBe(2)
  })

  it('замена фото на ДРУГОЕ → отдельная запись «фото ЗАМЕНЕНО»', async () => {
    const h = harness([
      { avatar: PHOTO, sel: 'crisp-stored', avwhy: 'ok' },
      { avatar: PHOTO2, sel: 'crisp-stored', avwhy: 'ok' },
    ])
    const { result } = renderHook(() => useWebAccountAvatars(h.webviewRefs, h.messengersRef))
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(count(h.logs, 'фото ЗАМЕНЕНО')).toBe(0)
    await act(async () => { vi.advanceTimersByTime(12000) })
    expect(result.current.m1).toBe(PHOTO2)
    expect(count(h.logs, 'фото ЗАМЕНЕНО')).toBe(1)
  })

  it('нативный источник не опрашивается', async () => {
    const h = harness([{ avatar: PHOTO, sel: 'stored' }])
    h.messengersRef.current = [{ id: 'native_cc', isNative: true }]
    const { result } = renderHook(() => useWebAccountAvatars(h.webviewRefs, h.messengersRef))
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(Object.keys(result.current).length).toBe(0)
  })
})

describe('Проводка сброса (сторож исходника)', () => {
  const MENU = fs.readFileSync('src/hooks/useTabContextMenu.js', 'utf8')

  it('пункт меню шлёт событие «забудь фото»', () => {
    expect(MENU).toMatch(/CustomEvent\('cc-avatar-reset', \{ detail: id \}\)/)
  })

  it('значок очищается ТОЛЬКО при удачном сбросе (в ветке ошибки — нет)', () => {
    expect(MENU).toMatch(/\.then\(n => \{ forgetAvatar\(\)/)
    const catchLine = MENU.match(/\.catch\(e => logAv\('WARN'[^\n]*/)
    expect(catchLine).toBeTruthy()
    expect(catchLine[0]).not.toMatch(/forgetAvatar/)
  })

  it('имя события совпадает у отправителя и слушателя', () => {
    expect(AVATAR_RESET_EVENT).toBe('cc-avatar-reset')
    expect(MENU).toContain(AVATAR_RESET_EVENT)
  })
})
