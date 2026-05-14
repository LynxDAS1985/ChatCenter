// v0.89.0 — Stage 4 / Этап 3.3: тесты tdlibStartup orchestrator.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  initTdlibBackendStartup, getTdlibStartupHandle, resetTdlibStartup,
} from '../../main/native/backends/tdlibStartup.js'

function makeMockTdl() {
  return {
    configure: vi.fn(),
    createClient: vi.fn(() => {
      const c = new EventEmitter()
      c.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
      c.close = vi.fn(() => Promise.resolve())
      return c
    }),
  }
}

function makeMockIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, fn) { handlers.set(channel, fn) },
    removeHandler(channel) { handlers.delete(channel) },
  }
}

function makeMockWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  }
}

let tmpDir = null
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tdlib-startup-'))
})
afterEach(async () => {
  await resetTdlibStartup()
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
    tmpDir = null
  }
})

// ──────────────────────────────────────────────────────────────────────
// VALIDATION
// ──────────────────────────────────────────────────────────────────────

describe('initTdlibBackendStartup — validation', () => {
  it('без userDataPath → ok: false', () => {
    const r = initTdlibBackendStartup({
      ipcMain: makeMockIpcMain(), getMainWindow: () => makeMockWindow(),
      tdl: makeMockTdl(), prebuiltTdlib: { getTdjson: () => '/x' },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/userDataPath/)
  })

  it('без ipcMain → ok: false', () => {
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir, getMainWindow: () => makeMockWindow(),
      tdl: makeMockTdl(), prebuiltTdlib: { getTdjson: () => '/x' },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/ipcMain/)
  })

  it('без getMainWindow → ok: false', () => {
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir, ipcMain: makeMockIpcMain(),
      tdl: makeMockTdl(), prebuiltTdlib: { getTdjson: () => '/x' },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/getMainWindow/)
  })
})

// ──────────────────────────────────────────────────────────────────────
// SUCCESSFUL INIT
// ──────────────────────────────────────────────────────────────────────

describe('initTdlibBackendStartup — успешная инициализация', () => {
  it('создаёт runtime + backend + регистрирует IPC handlers', () => {
    const ipcMain = makeMockIpcMain()
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain,
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '/fake/lib.so' },
    })
    expect(r.ok).toBe(true)
    expect(r.manager).toBeDefined()
    expect(r.backend).toBeDefined()
    expect(r.unregister).toBeInstanceOf(Function)
    expect(ipcMain.handlers.size).toBeGreaterThan(20)
    expect(ipcMain.handlers.has('tg:get-messages')).toBe(true)
    expect(ipcMain.handlers.has('tg:send-message')).toBe(true)
  })

  it('handle сохраняется как singleton', () => {
    initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain: makeMockIpcMain(),
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '/x' },
    })
    const h = getTdlibStartupHandle()
    expect(h).toBeDefined()
    expect(h.manager).toBeDefined()
  })

  it('повторный вызов возвращает существующий handle (идемпотентен)', () => {
    const r1 = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain: makeMockIpcMain(),
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '/x' },
    })
    const r2 = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain: makeMockIpcMain(),
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '/x' },
    })
    expect(r2.manager).toBe(r1.manager)
  })

  it('кастомные apiId/apiHash попадают в makeClientParams', () => {
    const tdl = makeMockTdl()
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain: makeMockIpcMain(),
      tdl, prebuiltTdlib: { getTdjson: () => '/x' },
      apiId: 99999, apiHash: 'custom',
    })
    expect(r.ok).toBe(true)
    // makeClientParams в backend.auth.startLogin будет передавать наши apiId/Hash
    // (проверим через факт что createClient вызывается с ними при createAccount)
    r.manager.createAccount('test_acc', { apiId: 99999, apiHash: 'custom' })
    expect(tdl.createClient).toHaveBeenCalledWith(expect.objectContaining({
      apiId: 99999, apiHash: 'custom',
    }))
  })
})

// ──────────────────────────────────────────────────────────────────────
// ERROR HANDLING
// ──────────────────────────────────────────────────────────────────────

describe('initTdlibBackendStartup — ошибки и fallback', () => {
  it('prebuilt-tdlib.getTdjson() пустой → ok: false с error', () => {
    const log = vi.fn()
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain: makeMockIpcMain(),
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '' },
      log,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/empty path/)
    expect(log).toHaveBeenCalledWith('error', expect.stringContaining('init failed'))
  })

  it('tdl.configure бросает → ok: false', () => {
    const tdl = makeMockTdl()
    tdl.configure.mockImplementationOnce(() => { throw new Error('configure failed') })
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain: makeMockIpcMain(),
      tdl,
      prebuiltTdlib: { getTdjson: () => '/x' },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/configure failed/)
  })
})

// ──────────────────────────────────────────────────────────────────────
// SEND TO RENDERER + IPC EVENT BRIDGE
// ──────────────────────────────────────────────────────────────────────

describe('sendToRenderer передача через mainWindow', () => {
  it('messages из backend → webContents.send', () => {
    const win = makeMockWindow()
    const tdl = makeMockTdl()
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => win,
      ipcMain: makeMockIpcMain(),
      tdl, prebuiltTdlib: { getTdjson: () => '/x' },
    })
    // Создаём аккаунт + эмитим сообщение через mock client
    // v0.89.0: client wrapped через tdlibNormalize — raw EventEmitter в _raw
    r.manager.createAccount('tg_a', { apiId: 1, apiHash: 'h' })
    const client = r.manager.getClient('tg_a')._raw
    client.emit('update', {
      '@type': 'updateNewMessage',
      message: {
        '@type': 'message', id: 100, chat_id: -1,
        sender_id: { '@type': 'messageSenderUser', user_id: 1 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: 'привет', entities: [] } },
      },
    })
    expect(win.webContents.send).toHaveBeenCalledWith('tg:new-message',
      expect.objectContaining({ chatId: 'tg_a:-1' }))
  })

  it('window destroyed → send не падает', () => {
    const win = { isDestroyed: () => true, webContents: { send: vi.fn() } }
    initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => win,
      ipcMain: makeMockIpcMain(),
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '/x' },
    })
    const h = getTdlibStartupHandle()
    h.manager.createAccount('tg_a', { apiId: 1, apiHash: 'h' })
    const client = h.manager.getClient('tg_a')._raw
    // Эмитим event — не должно крашить
    expect(() => client.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitPhoneNumber' },
    })).not.toThrow()
    // webContents.send не должен быть вызван (т.к. isDestroyed=true)
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('webContents.send бросает — startup не разваливается', () => {
    const win = {
      isDestroyed: () => false,
      webContents: { send: vi.fn(() => { throw new Error('IPC closed') }) },
    }
    initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => win,
      ipcMain: makeMockIpcMain(),
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '/x' },
    })
    const h = getTdlibStartupHandle()
    h.manager.createAccount('tg_a', { apiId: 1, apiHash: 'h' })
    const client = h.manager.getClient('tg_a')._raw
    expect(() => client.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitCode' },
    })).not.toThrow()
  })
})

// ──────────────────────────────────────────────────────────────────────
// AUTO-RESTORE
// ──────────────────────────────────────────────────────────────────────

describe('auto-restore sessions', () => {
  it('восстанавливает существующие папки сессий', () => {
    // Создаём заранее tdlib-sessions с подпапками — имитация предыдущего запуска
    fs.mkdirSync(path.join(tmpDir, 'tdlib-sessions', 'tg_111'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'tdlib-sessions', 'tg_222'), { recursive: true })
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain: makeMockIpcMain(),
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '/x' },
    })
    expect(r.ok).toBe(true)
    expect(r.restoredAccountIds.sort()).toEqual(['tg_111', 'tg_222'])
  })

  it('пустая tdlib-sessions → restoredAccountIds=[]', () => {
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain: makeMockIpcMain(),
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '/x' },
    })
    expect(r.restoredAccountIds).toEqual([])
  })
})

// ──────────────────────────────────────────────────────────────────────
// UNREGISTER / RESET
// ──────────────────────────────────────────────────────────────────────

describe('unregister / reset', () => {
  it('unregister() снимает IPC handlers', () => {
    const ipcMain = makeMockIpcMain()
    const r = initTdlibBackendStartup({
      userDataPath: tmpDir,
      getMainWindow: () => makeMockWindow(),
      ipcMain,
      tdl: makeMockTdl(),
      prebuiltTdlib: { getTdjson: () => '/x' },
    })
    expect(ipcMain.handlers.size).toBeGreaterThan(0)
    r.unregister()
    expect(ipcMain.handlers.size).toBe(0)
    expect(getTdlibStartupHandle()).toBe(null)
  })

  it('resetTdlibStartup() — те же эффекты + повторный init работает', async () => {
    const ipcMain = makeMockIpcMain()
    initTdlibBackendStartup({
      userDataPath: tmpDir, getMainWindow: () => makeMockWindow(),
      ipcMain, tdl: makeMockTdl(), prebuiltTdlib: { getTdjson: () => '/x' },
    })
    await resetTdlibStartup()
    expect(getTdlibStartupHandle()).toBe(null)
    // Повторный init не должен упасть
    const r2 = initTdlibBackendStartup({
      userDataPath: tmpDir, getMainWindow: () => makeMockWindow(),
      ipcMain: makeMockIpcMain(), tdl: makeMockTdl(), prebuiltTdlib: { getTdjson: () => '/x' },
    })
    expect(r2.ok).toBe(true)
  })
})
