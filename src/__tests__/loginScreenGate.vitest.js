// v1.2.147: тест правила показа экрана входа (фикс «чёрный экран после добавления аккаунта»).
import { describe, it, expect } from 'vitest'
import { shouldShowLoginScreen, shouldResetLoginFlowOnOpen } from '../../shared/loginScreenGate.js'

describe('shouldShowLoginScreen', () => {
  it('модалка открыта вручную → показываем', () => {
    expect(shouldShowLoginScreen(true, null)).toBe(true)
    expect(shouldShowLoginScreen(true, { step: 'success' })).toBe(true)
  })

  it('нет входа → не показываем', () => {
    expect(shouldShowLoginScreen(false, null)).toBe(false)
    expect(shouldShowLoginScreen(false, undefined)).toBe(false)
  })

  it('незавершённый вход → показываем', () => {
    expect(shouldShowLoginScreen(false, { step: 'phone' })).toBe(true)
    expect(shouldShowLoginScreen(false, { step: 'code' })).toBe(true)
    expect(shouldShowLoginScreen(false, { step: 'password' })).toBe(true)
    expect(shouldShowLoginScreen(false, { step: 'code', error: 'Неверный код' })).toBe(true)
  })

  // ГЛАВНАЯ проверка бага: завершённый вход НЕ держит экран входа (иначе чёрный экран).
  it('успешный вход (success) → НЕ показываем (репродюсер бага «чёрный экран»)', () => {
    expect(shouldShowLoginScreen(false, { step: 'success' })).toBe(false)
    expect(shouldShowLoginScreen(false, { step: 'success', accountId: 'tg_638454350' })).toBe(false)
  })
})

describe('shouldResetLoginFlowOnOpen', () => {
  // v1.2.149: при открытии окна входа сбрасываем ТОЛЬКО залипший success.
  it('залипший success → сбрасываем (иначе новое открытие закроется само)', () => {
    expect(shouldResetLoginFlowOnOpen({ step: 'success' })).toBe(true)
    expect(shouldResetLoginFlowOnOpen({ step: 'success', accountId: 'tg_1' })).toBe(true)
  })

  it('незавершённый вход НЕ сбрасываем (клик по «+» не обрывает активный вход)', () => {
    expect(shouldResetLoginFlowOnOpen({ step: 'phone' })).toBe(false)
    expect(shouldResetLoginFlowOnOpen({ step: 'code' })).toBe(false)
    expect(shouldResetLoginFlowOnOpen({ step: 'password' })).toBe(false)
  })

  it('нет входа → нечего сбрасывать', () => {
    expect(shouldResetLoginFlowOnOpen(null)).toBe(false)
    expect(shouldResetLoginFlowOnOpen(undefined)).toBe(false)
  })
})
