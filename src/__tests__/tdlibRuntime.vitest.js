// v0.89.0 — Stage 4 / Этап 3.1: тесты tdlibRuntime singleton.
//
// Без реального TDLib — DI через опции (mock-tdl, mock-prebuilt). Это нужно
// потому что:
//   1. Тесты не должны запускать настоящий libtdjson (сетевые операции).
//   2. happy-dom не подходит для FFI native modules.
//   3. CI на Ubuntu использует другой prebuilt-tdlib path — DI делает тест портативным.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  initTdlibRuntime, getTdlibManager, getTdlibRuntimeState,
  closeTdlibRuntime, getSessionDirForAccount, autoRestoreSessionsFromDisk,
} from '../../main/native/backends/tdlibRuntime.js'

function makeMockTdl() {
  return {
    configure: vi.fn(),
    createClient: vi.fn((params) => {
      const client = new EventEmitter()
      client.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
      client.close = vi.fn(() => Promise.resolve())
      client._params = params  // для проверки в тестах
      return client
    }),
  }
}

function makeMockPrebuilt(pathStr = '/fake/tdjson.dll') {
  return { getTdjson: vi.fn(() => pathStr) }
}

// Каждый тест в изолированной tmp-папке — чтобы tdlib-sessions/ не пересекались.
let tmpDir = null
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tdlib-runtime-'))
})
afterEach(async () => {
  await closeTdlibRuntime()
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
    tmpDir = null
  }
})

// ──────────────────────────────────────────────────────────────────────
// initTdlibRuntime
// ──────────────────────────────────────────────────────────────────────

describe('initTdlibRuntime', () => {
  it('требует userDataDir', () => {
    expect(() => initTdlibRuntime({})).toThrow(/userDataDir required/)
  })

  it('вызывает tdl.configure с путём от prebuilt-tdlib', () => {
    const tdl = makeMockTdl()
    const prebuiltTdlib = makeMockPrebuilt('/test/libtdjson.so')
    initTdlibRuntime({ userDataDir: tmpDir, tdl, prebuiltTdlib })
    expect(tdl.configure).toHaveBeenCalledWith({
      tdjson: '/test/libtdjson.so',
      verbosityLevel: 1,
    })
  })

  it('verbosityLevel передаётся в configure', () => {
    const tdl = makeMockTdl()
    initTdlibRuntime({
      userDataDir: tmpDir, tdl, prebuiltTdlib: makeMockPrebuilt(), verbosityLevel: 3,
    })
    expect(tdl.configure).toHaveBeenCalledWith(expect.objectContaining({
      verbosityLevel: 3,
    }))
  })

  it('возвращает TdlibClientManager', () => {
    const mgr = initTdlibRuntime({
      userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt(),
    })
    expect(mgr).toBeDefined()
    expect(typeof mgr.createAccount).toBe('function')
    expect(typeof mgr.getClient).toBe('function')
    expect(typeof mgr.listAccounts).toBe('function')
  })

  it('создаёт sessions-папку в userDataDir', () => {
    initTdlibRuntime({
      userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt(),
    })
    expect(fs.existsSync(path.join(tmpDir, 'tdlib-sessions'))).toBe(true)
  })

  it('идемпотентен — повторный init возвращает тот же manager', () => {
    const tdl = makeMockTdl()
    const mgr1 = initTdlibRuntime({ userDataDir: tmpDir, tdl, prebuiltTdlib: makeMockPrebuilt() })
    const mgr2 = initTdlibRuntime({ userDataDir: tmpDir, tdl, prebuiltTdlib: makeMockPrebuilt() })
    expect(mgr1).toBe(mgr2)
    // configure НЕ вызывается повторно
    expect(tdl.configure).toHaveBeenCalledTimes(1)
  })

  it('падает если prebuilt-tdlib.getTdjson() вернул пустой путь', () => {
    const prebuilt = { getTdjson: () => '' }
    expect(() => initTdlibRuntime({
      userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: prebuilt,
    })).toThrow(/empty path/)
  })

  it('clientFactory создаёт реальный client через tdl.createClient', () => {
    const tdl = makeMockTdl()
    const mgr = initTdlibRuntime({
      userDataDir: tmpDir, tdl, prebuiltTdlib: makeMockPrebuilt(),
    })
    mgr.createAccount('tg_abc', {
      apiId: 8392940, apiHash: 'hash', accountSubdir: 'tg_abc',
    })
    expect(tdl.createClient).toHaveBeenCalledWith(expect.objectContaining({
      apiId: 8392940,
      apiHash: 'hash',
      databaseDirectory: path.join(tmpDir, 'tdlib-sessions', 'tg_abc'),
    }))
    // sessions/{accountId}/ создана на диске
    expect(fs.existsSync(path.join(tmpDir, 'tdlib-sessions', 'tg_abc'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'tdlib-sessions', 'tg_abc', 'files'))).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────
// getTdlibManager / getTdlibRuntimeState
// ──────────────────────────────────────────────────────────────────────

describe('getTdlibManager / runtime state', () => {
  it('null до init', () => {
    expect(getTdlibManager()).toBe(null)
    expect(getTdlibRuntimeState()).toBe(null)
  })

  it('возвращает manager и state после init', () => {
    initTdlibRuntime({ userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt('/x') })
    expect(getTdlibManager()).not.toBe(null)
    expect(getTdlibRuntimeState()).toEqual(expect.objectContaining({
      configured: true,
      tdjsonPath: '/x',
      userDataDir: tmpDir,
    }))
  })
})

// ──────────────────────────────────────────────────────────────────────
// getSessionDirForAccount
// ──────────────────────────────────────────────────────────────────────

describe('getSessionDirForAccount', () => {
  it('возвращает путь для аккаунта', () => {
    initTdlibRuntime({ userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt() })
    const p = getSessionDirForAccount('tg_42')
    expect(p).toBe(path.join(tmpDir, 'tdlib-sessions', 'tg_42'))
  })

  it('null до init', () => {
    expect(getSessionDirForAccount('tg_42')).toBe(null)
  })
})

// ──────────────────────────────────────────────────────────────────────
// closeTdlibRuntime
// ──────────────────────────────────────────────────────────────────────

describe('closeTdlibRuntime', () => {
  it('сбрасывает singleton', async () => {
    initTdlibRuntime({ userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt() })
    expect(getTdlibManager()).not.toBe(null)
    await closeTdlibRuntime()
    expect(getTdlibManager()).toBe(null)
    expect(getTdlibRuntimeState()).toBe(null)
  })

  it('закрывает все существующие клиенты', async () => {
    const tdl = makeMockTdl()
    const mgr = initTdlibRuntime({ userDataDir: tmpDir, tdl, prebuiltTdlib: makeMockPrebuilt() })
    mgr.createAccount('tg_a', { apiId: 1, apiHash: 'h' })
    mgr.createAccount('tg_b', { apiId: 1, apiHash: 'h' })
    const clients = mgr.listAccounts().map(a => mgr.getClient(a))
    await closeTdlibRuntime()
    for (const c of clients) {
      expect(c.close).toHaveBeenCalled()
    }
  })

  it('повторный close — не падает', async () => {
    initTdlibRuntime({ userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt() })
    await closeTdlibRuntime()
    await expect(closeTdlibRuntime()).resolves.toBeUndefined()
  })

  it('close до init — не падает', async () => {
    await expect(closeTdlibRuntime()).resolves.toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────
// autoRestoreSessionsFromDisk
// ──────────────────────────────────────────────────────────────────────

describe('autoRestoreSessionsFromDisk', () => {
  it('сканирует подпапки tdlib-sessions/ и создаёт аккаунты', () => {
    const tdl = makeMockTdl()
    initTdlibRuntime({ userDataDir: tmpDir, tdl, prebuiltTdlib: makeMockPrebuilt() })
    // Создаём 2 фейковых session-папки
    fs.mkdirSync(path.join(tmpDir, 'tdlib-sessions', 'tg_111'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'tdlib-sessions', 'tg_222'), { recursive: true })
    const restored = autoRestoreSessionsFromDisk({
      makeClientParams: (accountId) => ({ apiId: 1, apiHash: 'h', accountSubdir: accountId }),
    })
    expect(restored.sort()).toEqual(['tg_111', 'tg_222'])
    expect(getTdlibManager().listAccounts().sort()).toEqual(['tg_111', 'tg_222'])
    // tdl.createClient должен быть вызван для каждой
    expect(tdl.createClient).toHaveBeenCalledTimes(2)
  })

  it('игнорирует папку "pending"', () => {
    initTdlibRuntime({ userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt() })
    fs.mkdirSync(path.join(tmpDir, 'tdlib-sessions', 'pending'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'tdlib-sessions', 'tg_999'), { recursive: true })
    const restored = autoRestoreSessionsFromDisk({
      makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
    })
    expect(restored).toEqual(['tg_999'])
  })

  it('игнорирует уже существующие аккаунты', () => {
    const mgr = initTdlibRuntime({ userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt() })
    fs.mkdirSync(path.join(tmpDir, 'tdlib-sessions', 'tg_dup'), { recursive: true })
    mgr.createAccount('tg_dup', { apiId: 1, apiHash: 'h' })
    const restored = autoRestoreSessionsFromDisk({
      makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
    })
    expect(restored).toEqual([])
  })

  it('пустой массив до init', () => {
    expect(autoRestoreSessionsFromDisk()).toEqual([])
  })

  it('пустой массив если sessions-папка пуста', () => {
    initTdlibRuntime({ userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt() })
    expect(autoRestoreSessionsFromDisk()).toEqual([])
  })

  it('файлы (не папки) пропускаются', () => {
    initTdlibRuntime({ userDataDir: tmpDir, tdl: makeMockTdl(), prebuiltTdlib: makeMockPrebuilt() })
    fs.writeFileSync(path.join(tmpDir, 'tdlib-sessions', 'random.txt'), 'noise')
    fs.mkdirSync(path.join(tmpDir, 'tdlib-sessions', 'tg_real'), { recursive: true })
    const restored = autoRestoreSessionsFromDisk({ makeClientParams: () => ({}) })
    expect(restored).toEqual(['tg_real'])
  })
})
