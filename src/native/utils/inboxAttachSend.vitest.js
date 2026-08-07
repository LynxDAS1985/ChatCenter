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
  store: {
    activeChatId: 'tg_1:100',
    sendFile: vi.fn(async () => ({ ok: true })),
    sendAlbum: vi.fn(async () => ({ ok: true })),
    sendMessage: vi.fn(async () => ({ ok: true })),
  },
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

  // v1.2.203: окно PhotoSendModal шлёт МАССИВ файлов.
  it('массив из 2 файлов С путями → альбом по путям, без временных файлов', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\1.png' }), fileLike({ path: 'C:\\a\\2.png' })])
    const arr = [fileLike({ path: 'C:\\a\\1.png' }), fileLike({ path: 'C:\\a\\2.png' })]
    const args = baseArgs(attach, { overrideFile: arr })
    await runAttachSend(args)
    expect(args.store.sendAlbum).toHaveBeenCalled()
    const passed = args.store.sendAlbum.mock.calls[0][1]
    expect(passed.map(f => f.path)).toEqual(['C:\\a\\1.png', 'C:\\a\\2.png'])
    expect(invokeMock).not.toHaveBeenCalled() // временные файлы не понадобились
  })

  it('массив с фото БЕЗ пути (повёрнутое) → пишем временный файл и шлём альбомом', async () => {
    invokeMock = vi.fn(async (ch) => ch === 'tg:write-temp-file' ? { ok: true, path: 'C:\\tmp\\album-1.png' } : { ok: true })
    globalThis.window.api = { invoke: invokeMock, send: () => {} }
    const attach = makeAttach([fileLike({ path: 'C:\\a\\1.png' }), fileLike({ path: undefined })])
    const arr = [fileLike({ path: 'C:\\a\\1.png' }), fileLike({ path: undefined, name: 'rot.jpg', type: 'image/jpeg' })]
    const args = baseArgs(attach, { overrideFile: arr })
    await runAttachSend(args)
    expect(invokeMock).toHaveBeenCalledWith('tg:write-temp-file', expect.any(Object))
    const passed = args.store.sendAlbum.mock.calls[0][1]
    expect(passed.length).toBe(2)
    expect(passed[1].path).toBe('C:\\tmp\\album-1.png')
  })

  it('массив из 1 файла с путём → sendFile (не альбом)', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\1.png' })])
    const args = baseArgs(attach, { overrideFile: [fileLike({ path: 'C:\\a\\1.png' })] })
    await runAttachSend(args)
    expect(args.store.sendFile).toHaveBeenCalled()
    expect(args.store.sendAlbum).not.toHaveBeenCalled()
  })

  // v1.2.207 (#1): «Без сжатия» протаскивается в отправку.
  it('sendOpts.asDocument → sendFile с флагом true (одиночный)', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\1.png' })])
    const args = baseArgs(attach, { overrideFile: [fileLike({ path: 'C:\\a\\1.png' })], sendOpts: { asDocument: true } })
    await runAttachSend(args)
    expect(args.store.sendFile.mock.calls[0][3]).toBe(true)
  })

  it('sendOpts.asDocument → sendAlbum с флагом true (альбом)', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\1.png' }), fileLike({ path: 'C:\\a\\2.png' })])
    const arr = [fileLike({ path: 'C:\\a\\1.png' }), fileLike({ path: 'C:\\a\\2.png' })]
    const args = baseArgs(attach, { overrideFile: arr, sendOpts: { asDocument: true } })
    await runAttachSend(args)
    expect(args.store.sendAlbum.mock.calls[0][4]).toBe(true)
  })

  // v1.2.209: «Фото, затем текст отдельно» — фото БЕЗ подписи + текст отдельным сообщением.
  it('sendOpts.splitText → фото с пустой подписью, затем sendMessage с полным текстом', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\1.png' })], 'очень длинная подпись…')
    const args = baseArgs(attach, { overrideFile: [fileLike({ path: 'C:\\a\\1.png' })], sendOpts: { splitText: true } })
    await runAttachSend(args)
    // фото ушло с ПУСТОЙ подписью
    expect(args.store.sendFile.mock.calls[0][2]).toBe('')
    // текст ушёл отдельным сообщением
    expect(args.store.sendMessage).toHaveBeenCalledWith('tg_1:100', 'очень длинная подпись…')
  })

  it('без splitText → подпись остаётся на фото, sendMessage НЕ зовётся', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\1.png' })], 'подпись')
    const args = baseArgs(attach, { overrideFile: [fileLike({ path: 'C:\\a\\1.png' })] })
    await runAttachSend(args)
    expect(args.store.sendFile.mock.calls[0][2]).toBe('подпись')
    expect(args.store.sendMessage).not.toHaveBeenCalled()
  })

  // v1.2.210: splitText работает и для attach-ветки (FilePreviewBar: видео/документ), overrideFile нет.
  it('attach-ветка (FilePreviewBar) + splitText → файл с пустой подписью + sendMessage с текстом', async () => {
    const attach = makeAttach([fileLike({ path: 'C:\\a\\v.mp4', type: 'video/mp4' })], 'длинный текст видео')
    const args = baseArgs(attach, { sendOpts: { splitText: true } }) // overrideFile undefined → attach-ветка
    await runAttachSend(args)
    expect(args.store.sendFile.mock.calls[0][2]).toBe('')
    expect(args.store.sendMessage).toHaveBeenCalledWith('tg_1:100', 'длинный текст видео')
  })

  // v1.2.211: текст > 4096 → несколько sendMessage (иначе одно сообщение не доходит).
  it('splitText + текст длиннее 4096 → несколько сообщений', async () => {
    const long = 'я'.repeat(5000) // без пробелов → жёсткий рез: 4096 + 904
    const attach = makeAttach([fileLike({ path: 'C:\\a\\1.png' })], long)
    const args = baseArgs(attach, { overrideFile: [fileLike({ path: 'C:\\a\\1.png' })], sendOpts: { splitText: true } })
    await runAttachSend(args)
    expect(args.store.sendMessage.mock.calls.length).toBe(2)
    // каждый кусок ≤ 4096
    for (const call of args.store.sendMessage.mock.calls) expect(call[1].length).toBeLessThanOrEqual(4096)
  })
})
