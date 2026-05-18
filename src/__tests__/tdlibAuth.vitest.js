// v0.89.0 — Stage 4 / Этап 2.3: тесты TdlibAuthFlow + buildTdlibParameters.
//
// Mock-клиент эмулирует TDLib reply на client.invoke + автоматически эмитит
// updateAuthorizationState события чтобы проверить полный flow.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { buildTdlibParameters, TdlibAuthFlow, translateTdlibError } from '../../main/native/backends/tdlibAuth.js'

function makeMockClient() {
  const client = new EventEmitter()
  client.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  client.close = vi.fn(() => Promise.resolve())
  return client
}

function makeFlow() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_1', {})
  // v0.89.2: TdlibAuthFlow больше не принимает tdlibParameters — tdl сам формирует
  // setTdlibParameters из createClient options. См. tdlibRuntime.js.
  const flow = new TdlibAuthFlow({
    manager: mgr, accountId: 'tg_1',
  })
  return { mgr, mockClient, flow }
}

function emitAuthState(client, stateType, payload = {}) {
  client.emit('update', {
    '@type': 'updateAuthorizationState',
    authorization_state: { '@type': stateType, ...payload },
  })
}

// === buildTdlibParameters ===

describe('translateTdlibError', () => {
  it('PHONE_NUMBER_INVALID → русский', () => {
    expect(translateTdlibError('PHONE_NUMBER_INVALID')).toBe('Номер телефона указан в неправильном формате')
  })
  it('PASSWORD_HASH_INVALID → русский', () => {
    expect(translateTdlibError('PASSWORD_HASH_INVALID')).toBe('Неверный пароль двухфакторной защиты')
  })
  it('PHONE_CODE_INVALID → русский', () => {
    expect(translateTdlibError('PHONE_CODE_INVALID')).toBe('Неверный код. Проверь и попробуй снова')
  })
  it('извлекает код из обёрнутого сообщения', () => {
    expect(translateTdlibError('error: PHONE_NUMBER_BANNED at line 42')).toBe('Номер заблокирован в Telegram')
  })
  it('неизвестный код возвращается как есть', () => {
    expect(translateTdlibError('TOTALLY_NEW_ERROR')).toBe('TOTALLY_NEW_ERROR')
  })
  it('null/undefined возвращается как есть', () => {
    expect(translateTdlibError(null)).toBe(null)
    expect(translateTdlibError(undefined)).toBe(undefined)
  })
})

describe('buildTdlibParameters', () => {
  // v0.89.2: формат вывода изменился. Теперь buildTdlibParameters возвращает только
  // приложение-специфичные параметры (device_model, application_version, use_*_database).
  // api_id/api_hash/database_directory/files_directory подставляет сам tdl через
  // верхнеуровневые createClient options. См. node_modules/tdl/dist/client.js:629-637.
  it('строит объект параметров приложения (без @type/api_id/database_directory)', () => {
    const p = buildTdlibParameters()
    expect(p['@type']).toBeUndefined()      // tdl сам ставит @type:'setTdlibParameters'
    expect(p.api_id).toBeUndefined()         // подставляется tdl из createClient.apiId
    expect(p.api_hash).toBeUndefined()
    expect(p.database_directory).toBeUndefined()
    expect(p.files_directory).toBeUndefined()
    expect(p.use_message_database).toBe(true)
    expect(p.use_file_database).toBe(true)
    expect(p.use_chat_info_database).toBe(true)
    expect(p.use_secret_chats).toBe(false)
    expect(p.system_language_code).toBe('ru')
    expect(p.device_model).toBe('ChatCenter')
    expect(p.enable_storage_optimizer).toBe(true)
    expect(p.ignore_file_names).toBe(false)
  })
  it('кастомизация языка/устройства/версии', () => {
    const p = buildTdlibParameters({
      systemLanguageCode: 'en', deviceModel: 'TestModel',
      applicationVersion: '1.2.3', systemVersion: 'TestOS',
    })
    expect(p.system_language_code).toBe('en')
    expect(p.device_model).toBe('TestModel')
    expect(p.application_version).toBe('1.2.3')
    expect(p.system_version).toBe('TestOS')
  })
  it('disable storage optimizer через опцию', () => {
    const p = buildTdlibParameters({ enableStorageOptimizer: false })
    expect(p.enable_storage_optimizer).toBe(false)
  })
  it('disable databases через опцию', () => {
    const p = buildTdlibParameters({
      useMessageDatabase: false, useFileDatabase: false, useChatInfoDatabase: false,
    })
    expect(p.use_message_database).toBe(false)
    expect(p.use_file_database).toBe(false)
    expect(p.use_chat_info_database).toBe(false)
  })
})

// === TdlibAuthFlow — construct ===

describe('TdlibAuthFlow construct', () => {
  it('требует manager + accountId (tdlibParameters больше не нужен — v0.89.2)', () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    expect(() => new TdlibAuthFlow({})).toThrow(/manager required/)
    expect(() => new TdlibAuthFlow({ manager: mgr })).toThrow(/accountId required/)
    // С v0.89.2 этого достаточно — tdlibParameters больше не аргумент.
    expect(() => new TdlibAuthFlow({ manager: mgr, accountId: 'tg_1' })).not.toThrow()
  })
  it('начальное состояние = idle', () => {
    const { flow } = makeFlow()
    expect(flow.state).toBe('idle')
  })
})

// === SEQUENCE: full login with 2FA ===

describe('TdlibAuthFlow — полный flow с 2FA', () => {
  it('Wait params → setTdlibParameters; Wait phone → startLogin; Wait code → submit; Wait pwd → submit; Ready', async () => {
    const { flow, mockClient } = makeFlow()

    // Шаг 1: TDLib просит параметры — НАШ код НЕ отправляет setTdlibParameters
    // (tdl сама обрабатывает через _handleAuthInit, см. tdlib-stage4 этап 3.4 фикс).
    emitAuthState(mockClient, 'authorizationStateWaitTdlibParameters')
    expect(mockClient.invoke).not.toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'setTdlibParameters',
    }))

    // Шаг 2: TDLib просит номер
    emitAuthState(mockClient, 'authorizationStateWaitPhoneNumber')
    expect(flow.state).toBe('waiting-phone')

    // Шаг 3: пользователь жмёт "вход" — startLogin(phone)
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'ok' })
    const startPromise = flow.startLogin('+71234567890')
    // setAuthenticationPhoneNumber вызван
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'setAuthenticationPhoneNumber', phone_number: '+71234567890',
    }))

    // Шаг 4: TDLib просит код
    emitAuthState(mockClient, 'authorizationStateWaitCode')
    const startResult = await startPromise
    expect(startResult).toEqual({ ok: true, step: 'code' })
    expect(flow.state).toBe('waiting-code')

    // Шаг 5: пользователь вводит код — submitCode
    const codePromise = flow.submitCode('12345')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'checkAuthenticationCode', code: '12345',
    }))

    // Шаг 6: TDLib просит 2FA пароль
    emitAuthState(mockClient, 'authorizationStateWaitPassword')
    const codeResult = await codePromise
    expect(codeResult).toEqual({ ok: true, step: 'password' })
    expect(flow.state).toBe('waiting-password')

    // Шаг 7: пользователь вводит пароль — submitPassword
    const pwdPromise = flow.submitPassword('mypass')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'checkAuthenticationPassword', password: 'mypass',
    }))

    // Шаг 8: TDLib говорит Ready
    emitAuthState(mockClient, 'authorizationStateReady')
    const pwdResult = await pwdPromise
    expect(pwdResult).toEqual({ ok: true, success: true })
    expect(flow.state).toBe('ready')
  })
  it('флоу без 2FA — после code сразу Ready', async () => {
    const { flow, mockClient } = makeFlow()
    emitAuthState(mockClient, 'authorizationStateWaitPhoneNumber')
    const startPromise = flow.startLogin('+71234567890')
    emitAuthState(mockClient, 'authorizationStateWaitCode')
    await startPromise

    const codePromise = flow.submitCode('12345')
    // Без waitPassword, сразу Ready
    emitAuthState(mockClient, 'authorizationStateReady')
    const r = await codePromise
    expect(r).toEqual({ ok: true, step: 'success' })
    expect(flow.state).toBe('ready')
  })
})

// === ERRORS / INPUT VALIDATION ===

describe('TdlibAuthFlow — ошибки', () => {
  it('startLogin без phone → ok=false', async () => {
    const { flow } = makeFlow()
    expect(await flow.startLogin('')).toEqual({ ok: false, error: 'phone required' })
  })
  it('submitCode без code → ok=false', async () => {
    const { flow } = makeFlow()
    expect(await flow.submitCode('')).toEqual({ ok: false, error: 'code required' })
  })
  it('submitPassword без password → ok=false', async () => {
    const { flow } = makeFlow()
    expect(await flow.submitPassword('')).toEqual({ ok: false, error: 'password required' })
  })
  it('startLogin invoke падает → ok=false с error', async () => {
    const { flow, mockClient } = makeFlow()
    mockClient.invoke.mockRejectedValueOnce(new Error('PHONE_NUMBER_INVALID'))
    const r = await flow.startLogin('+1')
    expect(r.ok).toBe(false)
    // v0.89.0 / Этап 3.5: translateTdlibError мапит коды в русский для UI.
    expect(r.error).toBe('Номер телефона указан в неправильном формате')
  })
  it('TDLib closed во время ожидания → resolver резолвится с ошибкой', async () => {
    const { flow, mockClient } = makeFlow()
    emitAuthState(mockClient, 'authorizationStateWaitPhoneNumber')

    const startPromise = flow.startLogin('+71234567890')
    // Имитируем что TDLib закрылся (logout, server kicked, что-то ещё)
    emitAuthState(mockClient, 'authorizationStateClosed')
    const r = await startPromise
    expect(r.ok).toBe(false)
    expect(r.error).toBe('closed')
    expect(flow.state).toBe('closed')
  })
  it('Email auth — возвращает ошибку', async () => {
    const { flow, mockClient } = makeFlow()
    emitAuthState(mockClient, 'authorizationStateWaitPhoneNumber')
    const startPromise = flow.startLogin('+71234567890')
    emitAuthState(mockClient, 'authorizationStateWaitEmailAddress')
    const r = await startPromise
    expect(r.ok).toBe(false)
    expect(r.error).toContain('email auth not supported')
  })
  it('cancelLogin — вызывает logOut и закрывает state', async () => {
    const { flow, mockClient } = makeFlow()
    const r = await flow.cancelLogin()
    expect(mockClient.invoke).toHaveBeenCalledWith({ '@type': 'logOut' })
    expect(r).toEqual({ ok: true })
    expect(flow.state).toBe('closed')
  })
  it('cancelLogin отменяет pending startLogin', async () => {
    const { flow, mockClient } = makeFlow()
    emitAuthState(mockClient, 'authorizationStateWaitPhoneNumber')
    const startPromise = flow.startLogin('+71234567890')
    await flow.cancelLogin()
    const r = await startPromise
    expect(r.ok).toBe(false)
    expect(r.error).toBe('cancelled')
  })
})

// === dispose: removes listener ===

describe('TdlibAuthFlow.dispose', () => {
  it('dispose снимает слушатель с manager', () => {
    const { mgr, flow } = makeFlow()
    const beforeCount = mgr.listenerCount('account:auth-state')
    flow.dispose()
    const afterCount = mgr.listenerCount('account:auth-state')
    expect(afterCount).toBe(beforeCount - 1)
  })
  it('dispose вызванный дважды не падает', () => {
    const { flow } = makeFlow()
    flow.dispose()
    expect(() => flow.dispose()).not.toThrow()
  })
})

// === ROUTING: auth events для другого accountId — игнор ===

describe('TdlibAuthFlow — изоляция между аккаунтами', () => {
  it('Auth state для другого accountId не меняет наше state', () => {
    const mockA = makeMockClient()
    const mockB = makeMockClient()
    let callCount = 0
    const mgr = new TdlibClientManager({
      clientFactory: () => { callCount++; return callCount === 1 ? mockA : mockB },
    })
    mgr.createAccount('tg_a', {})
    mgr.createAccount('tg_b', {})

    const flowA = new TdlibAuthFlow({ manager: mgr, accountId: 'tg_a' })
    emitAuthState(mockB, 'authorizationStateWaitPhoneNumber')
    // flowA не должен менять state
    expect(flowA.state).toBe('idle')
  })
})

// === v0.89.2 — Спец-обработка authorizationStateWaitRegistration ===

describe('TdlibAuthFlow — WaitRegistration', () => {
  it('WaitRegistration → дружелюбная ru-ошибка (не "unsupported state")', async () => {
    const { mockClient, flow } = makeFlow()
    // Pending promise для startLogin — чтобы было кого reject'ать
    const pending = flow.startLogin('+71234567890')
    // TDLib шлёт WaitRegistration вместо WaitCode — значит номер новый
    emitAuthState(mockClient, 'authorizationStateWaitRegistration', {
      terms_of_service: { '@type': 'termsOfService', text: { text: 'TOS' } },
    })
    const r = await pending
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/нет аккаунта Telegram/)
  })
})
