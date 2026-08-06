// v1.1.9: вынесено из InboxMode.jsx — отправка прикреплённых файлов (1 файл → sendFile,
// 2+ → sendAlbum), общая обработка ошибок и финализация state attach.
// v1.2.198: одиночный файл БЕЗ пути на диске (вставка из буфера / повёрнутая копия из окна
// PhotoSendModal) отправляется БАЙТАМИ через tg:send-clipboard-image. overrideFile — повёрнутая
// копия (File) из окна: если передана, шлём именно её (тоже байтами, у неё нет пути).
// v1.2.199: логи всего потока (app:log) + предупреждение, если файл без пути выпал из альбома (#5).
//
// ВАЖНО: Electron file.path нужен для отправки по пути. File API из буфера/canvas без path —
// поэтому для таких идёт путь «байтами» (backend пишет во временный файл и отправляет как фото).

/**
 * Запускает отправку attach.files в активный чат. Сам управляет attach.setSending().
 *
 * @param {object} args
 * @param {object} args.store     — nativeStore (sendFile / sendAlbum / activeChatId)
 * @param {object} args.attach    — useFileAttach state ({files, caption, sending, setSending, clear})
 * @param {{id?: number}|null} args.replyTo
 * @param {(text: string, level?: 'error'|'info'|'success') => void} args.showToast
 * @param {(reply: any) => void} args.setReplyTo — при успехе сбрасываем replyTo в null.
 * @param {File} [args.overrideFile] — v1.2.198: повёрнутая копия из окна отправки. Если это
 *   File/Blob (есть .arrayBuffer) — шлём её байтами. Иначе (например, событие клика) — игнор.
 */
export async function runAttachSend({ store, attach, replyTo, showToast, setReplyTo, overrideFile }) {
  if (!attach?.files || attach.files.length === 0) return
  if (attach.sending) return
  attach.setSending(true)

  // v1.2.199: логи всего потока отправки прикреплений (через app:log → chatcenter.log,
  // видно в «📒 Логи»). Данные файла НЕ логируем — только счётчики/флаги.
  const log = (level, msg) => {
    try { window.api?.send?.('app:log', { level, message: '[attach-send] ' + msg }) } catch (_) {}
  }
  const isOverride = !!(overrideFile && typeof overrideFile.arrayBuffer === 'function')
  log('INFO', `start files=${attach.files.length} caption=${attach.caption ? 'Y' : 'N'} override=${isOverride ? 'Y' : 'N'}`)

  // Отправка одиночного файла БАЙТАМИ (нет пути на диске) через готовый tg:send-clipboard-image.
  async function sendBytes(fileLike, defaultExt) {
    const buf = await fileLike.arrayBuffer()
    const ext = (typeof fileLike.type === 'string' && fileLike.type.split('/')[1]) || defaultExt || 'png'
    return window.api?.invoke('tg:send-clipboard-image', {
      chatId: store.activeChatId,
      data: Array.from(new Uint8Array(buf)),
      ext,
      caption: attach.caption || '',
    })
  }

  try {
    let result
    if (isOverride) {
      // v1.2.198 (#1): повёрнутая копия из окна — File без пути → байтами.
      log('INFO', 'rotated copy → bytes (ext=jpg/png)')
      result = await sendBytes(overrideFile, 'jpg')
    } else {
      const raw = attach.files
      if (raw.length === 1) {
        const f = raw[0]
        const p = f?.path
        const hasPath = p && typeof p === 'string' && (p.includes('/') || p.includes('\\'))
        if (hasPath) {
          log('INFO', 'single by disk path')
          result = await store.sendFile(store.activeChatId, p, attach.caption)
        } else if (typeof f?.arrayBuffer === 'function') {
          // v1.2.198: файл без пути (вставка из буфера) → байтами.
          log('INFO', 'single no-path → bytes')
          result = await sendBytes(f, 'png')
        } else {
          log('ERROR', 'single: no path and no arrayBuffer → abort')
          showToast('Не удалось получить файл для отправки', 'error')
          attach.setSending(false)
          return
        }
      } else {
        // Альбом (2+). Как раньше — по путям (Electron file.path).
        const validFiles = raw.map(f => ({ path: f.path || f.name }))
          .filter(f => (f.path && typeof f.path === 'string' && f.path.includes('/')) || f.path?.includes('\\'))
        if (validFiles.length === 0) {
          log('ERROR', 'album: no valid paths → abort')
          showToast('Не удалось получить путь к файлам (Electron file.path required)', 'error')
          attach.setSending(false)
          return
        }
        // v1.2.199 (#5): часть файлов без пути (например, вставленные из буфера) в альбоме
        // не уходит по-байтовому пути — предупреждаем, чтобы не выглядело «молча пропали».
        if (validFiles.length < raw.length) {
          const skipped = raw.length - validFiles.length
          log('WARN', `album: ${skipped} file(s) без пути пропущены, отправляю ${validFiles.length}`)
          showToast(`${skipped} файл(а) из буфера пропущены (нет пути), отправлены остальные`, 'error')
        }
        log('INFO', `album n=${validFiles.length}`)
        result = await store.sendAlbum(store.activeChatId, validFiles, attach.caption, replyTo?.id)
      }
    }

    if (result?.ok) {
      log('INFO', 'ok')
      attach.clear()
      setReplyTo(null)
    } else {
      log('ERROR', `result error: ${result?.error || 'неизвестно'}`)
      showToast(`Ошибка отправки: ${result?.error || 'неизвестно'}`, 'error')
    }
  } catch (e) {
    log('ERROR', `exception: ${e?.message || e}`)
    showToast(`Сбой отправки: ${e?.message || e}`, 'error')
  } finally {
    attach.setSending(false)
  }
}
