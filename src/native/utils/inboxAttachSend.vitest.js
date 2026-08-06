// v1.2.199 (#4): тесты потока runAttachSend — раньше отправка прикреплений автотестами
// не покрывалась (только визуальная проверка). Проверяем ВЫБОР ветки, а не реальную сеть:
//  • повёрнутая копия (File) → байты через tg:send-clipboard-image
//  • одиночный файл с путём на диске → store.sendFile (НЕ байты)
//  • одиночный файл без пути, но Blob → байты
//  • overrideFile-«мусор» (событие клика без arrayBuffer) → игнор, обычная ветка
//  • альбом с файлом без пути → предупреждение + отправляются остальные
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runAttachSend } from './inboxAttachSend.js'

// Заглушка window.api.invoke (байтовый путь) — happy-dom не имеет Electron api.
let invokeMock
beforeEach(() => {
  invokeMock = vi.fn(async () => ({ ok: true }))
  globalThis.window = globalThis.window || {}
  globalThis.window.api = { invoke: invokeMock, send: () => {} }
})
afterEach(() => { vi.restoreAllMocks() })

// Blob/File с arrayBuffer (happy-dom File может не иметь — подставим).
function fileLike({ name = 'p.png', type = 'image/png', path } = {}) {
  const f = {
    name, type, path,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }
  return f
}
function makeAttach(files, caption = '') {
  return {
    files, caption, sending: false,
    setSending: vi.fn(), clear: vi.fn(),
  }
}
const baseArgs = (attach, extra = {}) => ({
  store: { activeChatId: 'tg_1:100', sendFile: vi.fn(async () => ({ ok: true })), sendAlbum: vi.fn(async () => ({ ok: true })) },
  attach, replyTo: null, showToast: vi.fn(), setReplyTo: vi.fn(), ...extra,
})

describe('runAttachSend (#4)', () => {
  it('повёрнутая копия (overrideFile=File) → байты через tg:send-clipboard-image', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\p.png' })])
    const args = baseArgs(attach, { overrideFile: fileLike({ name: 'r.jpg', type: 'image/jpeg' }) })
    await runAttachSend(args)
    expect(invokeMock).toHaveBeenCalledWith('tg:send-clipboard-image', expect.objectContaining({ chatId: 'tg_1:100' }))
    expect(args.store.sendFile).not.toHaveBeenCalled()
    expect(attach.clear).toHaveBeenCalled()
  })

  it('одиночный файл С путём → store.sendFile, НЕ байты', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\p.png' })])
    const args = baseArgs(attach)
    await runAttachSend(args)
    expect(args.store.sendFile).toHaveBeenCalledWith('tg_1:100', 'C:\\a\\p.png', '')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('одиночный файл БЕЗ пути (Blob) → байты', async () => {
    const attach = makeAttach([fileLike({ path: undefined })])
    const args = baseArgs(attach)
    await runAttachSend(args)
    expect(invokeMock).toHaveBeenCalledWith('tg:send-clipboard-image', expect.any(Object))
    expect(args.store.sendFile).not.toHaveBeenCalled()
  })

  it('overrideFile-«мусор» (событие клика без arrayBuffer) → игнор, идёт обычная ветка по пути', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\p.png' })])
    const clickEvent = { preventDefault: () => {}, type: 'click' } // нет arrayBuffer
    const args = baseArgs(attach, { overrideFile: clickEvent })
    await runAttachSend(args)
    expect(args.store.sendFile).toHaveBeenCalled()
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('альбом: файл без пути пропускается с предупреждением, остальные уходят', async () => {
    const attach = makeAttach([
      fileLike({ path: 'C:\\a\\1.png' }),
      fileLike({ path: undefined, name: 'buf.png' }), // без пути → выпадет
    ])
    const args = baseArgs(attach)
    await runAttachSend(args)
    expect(args.showToast).toHaveBeenCalled() // предупредили про пропуск
    expect(args.store.sendAlbum).toHaveBeenCalled()
    const passed = args.store.sendAlbum.mock.calls[0][1]
    expect(passed.length).toBe(1) // ушёл только файл с путём
  })

  it('пустой список файлов → ничего не шлём', async () => {
    const attach = makeAttach([])
    const args = baseArgs(attach)
    await runAttachSend(args)
    expect(invokeMock).not.toHaveBeenCalled()
    expect(args.store.sendFile).not.toHaveBeenCalled()
  })
})
