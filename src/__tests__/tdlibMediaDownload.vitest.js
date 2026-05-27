// v0.89.34: вынесено из tdlibMedia.vitest.js (был 394 строк, лимит 400).
// Покрывает: downloadFile + downloadFile v0.89.15 (всегда is_downloading_completed).

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { downloadFile, _pendingDownloadCount } from '../../main/native/backends/tdlibMedia.js'

function makeMockClient() {
  const client = new EventEmitter()
  client.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  client.close = vi.fn(() => Promise.resolve())
  return client
}
function makeManager() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_a', {})
  return { mgr, mockClient }
}

describe('downloadFile', () => {
  it('файл уже скачан — invoke возвращает completed=true → резолвится мгновенно', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'file', id: 10,
      local: { is_downloading_completed: true, path: '/cached/file.jpg' },
    })
    const r = await downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 10 })
    expect(r.ok).toBe(true)
    expect(r.path).toBe('/cached/file.jpg')
  })

  it('файл скачивается асинхронно — резолвится через file:update event', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'file', id: 20,
      local: { is_downloading_completed: false, downloaded_size: 0 },
    })
    const downloadPromise = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 20 })
    setTimeout(() => {
      mockClient.emit('update', {
        '@type': 'updateFile',
        file: { id: 20, local: { is_downloading_completed: false, downloaded_size: 50000 } },
      })
      mockClient.emit('update', {
        '@type': 'updateFile',
        file: { id: 20, local: { is_downloading_completed: true, downloaded_size: 100000, path: '/disk/file.jpg' } },
      })
    }, 10)
    const r = await downloadPromise
    expect(r.ok).toBe(true)
    expect(r.path).toBe('/disk/file.jpg')
  })

  it('onProgress вызывается на промежуточных updateFile', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'file', id: 30, local: { is_downloading_completed: false } })
    const onProgress = vi.fn()
    const downloadPromise = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 30, onProgress })
    setTimeout(() => {
      mockClient.emit('update', { '@type': 'updateFile', file: { id: 30, local: { downloaded_size: 50, is_downloading_completed: false } } })
      mockClient.emit('update', { '@type': 'updateFile', file: { id: 30, local: { downloaded_size: 100, is_downloading_completed: true, path: '/x' } } })
    }, 5)
    await downloadPromise
    expect(onProgress).toHaveBeenCalledTimes(2)
  })

  it('updateFile для другого fileId игнорируется', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'file', id: 40, local: { is_downloading_completed: false } })
    const downloadPromise = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 40 })
    setTimeout(() => {
      mockClient.emit('update', { '@type': 'updateFile', file: { id: 41, local: { is_downloading_completed: true, path: '/wrong.jpg' } } })
      mockClient.emit('update', { '@type': 'updateFile', file: { id: 40, local: { is_downloading_completed: true, path: '/correct.jpg' } } })
    }, 5)
    const r = await downloadPromise
    expect(r.path).toBe('/correct.jpg')
  })

  it('updateFile для другого accountId игнорируется', async () => {
    const mockB = makeMockClient()
    let count = 0
    const mgr2 = new TdlibClientManager({
      clientFactory: () => { count++; return count === 1 ? makeMockClient() : mockB },
    })
    mgr2.createAccount('tg_x', {})
    mgr2.createAccount('tg_y', {})
    const xClient = mgr2.getClient('tg_x')
    xClient.invoke.mockResolvedValueOnce({ '@type': 'file', id: 50, local: { is_downloading_completed: false } })
    const downloadPromise = downloadFile({ manager: mgr2, accountId: 'tg_x', fileId: 50 })
    setTimeout(() => {
      mockB.emit('update', { '@type': 'updateFile', file: { id: 50, local: { is_downloading_completed: true, path: '/wrong_account.jpg' } } })
      xClient.emit('update', { '@type': 'updateFile', file: { id: 50, local: { is_downloading_completed: true, path: '/correct_account.jpg' } } })
    }, 5)
    const r = await downloadPromise
    expect(r.path).toBe('/correct_account.jpg')
  })

  it('invoke падает → ok: false', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockRejectedValueOnce(new Error('FILE_REFERENCE_INVALID'))
    const r = await downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 60 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('FILE_REFERENCE_INVALID')
  })

  it('manager отсутствует → ok: false', async () => {
    const r = await downloadFile({ accountId: 'tg_a', fileId: 1 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('manager required')
  })

  it('accountId отсутствует → ok: false', async () => {
    const { mgr } = makeManager()
    const r = await downloadFile({ manager: mgr, fileId: 1 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('accountId required')
  })

  it('fileId отсутствует → ok: false', async () => {
    const { mgr } = makeManager()
    const r = await downloadFile({ manager: mgr, accountId: 'tg_a' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('fileId required')
  })

  it('priority clamped в диапазон 1-32', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'file', id: 70,
      local: { is_downloading_completed: true, path: '/ok' },
    })
    await downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 70, priority: 999 })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'downloadFile', priority: 32,
    }))
  })

  // v0.94.1: единый диспетчер — слушателей всегда 1, waiter снимается после завершения.
  it('waiter снимается после завершения + listener не растёт (нет утечки)', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'file', id: 80, local: { is_downloading_completed: true, path: '/x' },
    })
    await downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 80 })
    expect(_pendingDownloadCount(mgr)).toBe(0)        // нет зависших waiter
    expect(mgr.listenerCount('file:update')).toBe(1)  // ОДИН диспетчер, не растёт
  })

  // v0.94.1: 50 параллельных загрузок = по-прежнему ОДИН listener (а не 50).
  it('много параллельных загрузок = один listener (не MaxListenersExceeded)', () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockImplementation(() => Promise.resolve({ id: 0, local: {} })) // partial, не резолвит
    for (let i = 1; i <= 50; i++) downloadFile({ manager: mgr, accountId: 'tg_a', fileId: i })
    expect(mgr.listenerCount('file:update')).toBe(1)
    expect(_pendingDownloadCount(mgr)).toBe(50)
  })

  // v0.94.1: stuck-загрузка (TDLib #280/#2585: нет обновлений) → таймаут чистит waiter.
  it('зависшая загрузка → таймаут «нет прогресса» снимает waiter и резолвит ошибкой', async () => {
    vi.useFakeTimers()
    try {
      const { mgr, mockClient } = makeManager()
      mockClient.invoke.mockImplementationOnce(() => Promise.resolve({ id: 90, local: {} })) // partial, никогда не завершится
      const p = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 90 })
      expect(_pendingDownloadCount(mgr)).toBe(1)
      await vi.advanceTimersByTimeAsync(120000 + 10)
      const r = await p
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/timeout/)
      expect(_pendingDownloadCount(mgr)).toBe(0) // waiter снят, утечки нет
    } finally {
      vi.useRealTimers()
    }
  })
})

// v0.89.15: downloadFile ВСЕГДА ждёт is_downloading_completed=true.
// См. .memory-bank/mistakes/tdlib-video-player.md ловушки #8, #9.
describe('downloadFile: всегда ждёт is_downloading_completed (v0.89.15)', () => {
  it('partial download (prefix>=256 KB) НЕ резолвит раньше completion', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockImplementationOnce(() => Promise.resolve({ id: 200, local: {} }))
    let resolved = false
    const p = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 200, priority: 1 })
    p.then(() => { resolved = true })
    mockClient.emit('update', {
      '@type': 'updateFile',
      file: { id: 200, local: { is_downloading_completed: false, downloaded_prefix_size: 1024 * 1024, path: '/temp/200' } },
    })
    await new Promise(r => setTimeout(r, 20))
    expect(resolved).toBe(false)
    mockClient.emit('update', {
      '@type': 'updateFile',
      file: { id: 200, local: { is_downloading_completed: true, path: '/stable/X.mp4' } },
    })
    const r = await p
    expect(r.ok).toBe(true)
    expect(r.path).toBe('/stable/X.mp4')
  })

  it('progressive флаг проигнорирован (фича удалена) — всё равно ждёт completed', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockImplementationOnce(() => Promise.resolve({ id: 201, local: {} }))
    let resolved = false
    const p = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 201, priority: 1, progressive: true })
    p.then(() => { resolved = true })
    mockClient.emit('update', {
      '@type': 'updateFile',
      file: { id: 201, local: { is_downloading_completed: false, downloaded_prefix_size: 5 * 1024 * 1024, path: '/temp/201' } },
    })
    await new Promise(r => setTimeout(r, 20))
    expect(resolved).toBe(false)
    mockClient.emit('update', {
      '@type': 'updateFile',
      file: { id: 201, local: { is_downloading_completed: true, path: '/stable/Y.mp4' } },
    })
    await p
  })

  it('result.partial поле НЕ возвращается', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockImplementationOnce(() => Promise.resolve({ id: 202, local: {} }))
    const p = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 202, priority: 1 })
    setImmediate(() => {
      mockClient.emit('update', {
        '@type': 'updateFile',
        file: { id: 202, local: { is_downloading_completed: true, path: '/x' } },
      })
    })
    const r = await p
    expect(r.partial).toBeUndefined()
    expect(r.path).toBe('/x')
  })

  it('download_error → ok:false', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockImplementationOnce(() => Promise.resolve({ id: 203, local: {} }))
    const p = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 203, priority: 1 })
    setImmediate(() => {
      mockClient.emit('update', {
        '@type': 'updateFile',
        file: { id: 203, local: { is_downloading_completed: false, download_error: { code: 400 } } },
      })
    })
    const r = await p
    expect(r.ok).toBe(false)
    expect(r.error).toContain('download failed')
  })
})
