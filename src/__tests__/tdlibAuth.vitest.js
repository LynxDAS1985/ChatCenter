// v0.89.0 — Stage 4 / Этап 2.3: тесты TdlibAuthFlow + buildTdlibParameters.
//
// Mock-клиент эмулирует TDLib reply на client.invoke + автоматически эмитит
// updateAuthorizationState события чтобы проверить полный flow.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { buildTdlibParameters, TdlibAuthFlow } from '../../main/native/backends/tdlibAuth.js'

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
  const flow = new TdlibAuthFlow({
    manager: mgr, accountId: 'tg_1',
    tdlibParameters: buildTdlibParameters({
      apiId: 1, apiHash: 'h', databaseDirectory: '/tmp/tdlib-1',
    }),
  })
  return { mgr, mockClient, flow }
}

function emitAuthState(client, stateType, payload = {}) {
  client.emit('update', {
    '@type': 'updateAuthorizationState',
    authorization_state: { '@type': stateType, ...payload },
  })
}

// ──────────────────────────────────────────────────────────────────────
// buildTdlibParameters
// ──────────────────────────────────────────────────────────────────────

describe('buildTdlibParameters', () => {
  it('строит корректный объект с обязательными полями', () => {
    const p = buildTdlibParameters({
      apiId: 8392940, apiHash: 'secret', databaseDirectory: '/tmp/db',
    })
    expect(p['@type']).toBe('setTdlibParameters')
    expect(p.api_id).toBe(8392940)
    expect(p.api_hash).toBe('secret')
    expect(p.database_directory).toBe('/tmp/db')
    expect(p.files_directory).toBe('/tmp/db/files')
    expect(p.use_message_database).toBe(true)
    expect(p.use_secret_chats).toBe(false)
    expect(p.system_language_code).toBe('ru')
    expect(p.device_model).toBe('ChatCenter')
  })

  it('падает если нет apiId/apiHash', () => {
    expect(() => buildTdlibParameters({ databaseDirectory: '/tmp' })).toThrow(/apiId\+apiHash/)
  })

  it('падает если нет databaseDirectory', () => {
    expect(() => buildTdlibParameters({ apiId: 1, apiHash: 'h' })).toThrow(/databaseDirectory/)
  })

  it('кастомизация языка/устройства', () => {
    const p = buildTdlibParameters({
      apiId: 1, apiHash: 'h', databaseDirectory: '/tmp',
      systemLanguageCode: 'en', deviceModel: 'TestModel', applicationVersion: '1.2.3',
    })
    expect(p.system_language_code).toBe('en')
    expect(p.device_model).toBe('TestModel')
    expect(p.application_version).toBe('1.2.3')
  })
})

// ──────────────────────────────────────────────────────────────────────
// TdlibAuthFlow — construct
// ──────────────────────────────────────────────────────────────────────

describe('TdlibAuthFlow construct', () => {
  it('требует manager + accountId + tdlibParameters', () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    expect(() => new TdlibAuthFlow({})).toThrow(/manager required/)
    expect(() => new TdlibAuthFlow({ manager: mgr })).toThrow(/accountId required/)
    expect(() => new TdlibAuthFlow({ manager: mgr, accountId: 'tg_1' })).toThrow(/tdlibParameters/)
  })

  it('начальное состояние = idle', () => {
    const { flow } = makeFlow()
    expect(flow.state).toBe('idle')
  })
})

// ──────────────────────────────────────────────────────────────────────
// SEQUENCE: full login with 2FA
// ──────────────────────────────────────────────────────────────────────

describe('TdlibAuthFlow — полный flow с 2FA', () => {
  it('Wait params → setTdlibParameters; Wait phone → startLogin; Wait code → submit; Wait pwd → submit; Ready', async () => {
    const { flow, mockClient } = makeFlow()

    // Шаг 1: TDLib просит параметры
    emitAuthState(mockClient, 'authorizationStateWaitTdlibParameters')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'setTdlibParameters', api_id: 1,
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

// ──────────────────────────────────────────────────────────────────────
// ERRORS / INPUT VALIDATION
// ──────────────────────────────────────────────────────────────────────

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
    expect(r.error).toContain('PHONE_NUMBER_INVALID')
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

// ──────────────────────────────────────────────────────────────────────
// dispose: removes listener
// ──────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────
// ROUTING: auth events для другого accountId — игнор
// ──────────────────────────────────────────────────────────────────────

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

    const flowA = new TdlibAuthFlow({
      manager: mgr, accountId: 'tg_a',
      tdlibParameters: buildTdlibParameters({ apiId: 1, apiHash: 'h', databaseDirectory: '/tmp/a' }),
    })
    emitAuthState(mockB, 'authorizationStateWaitPhoneNumber')
    // flowA не должен менять state
    expect(flowA.state).toBe('idle')
  })
})
