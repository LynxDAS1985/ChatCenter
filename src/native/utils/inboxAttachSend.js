// v1.1.9: вынесено из InboxMode.jsx — отправка прикреплённых файлов (1 файл → sendFile,
// 2+ → sendAlbum), общая обработка ошибок и финализация state attach.
// v1.2.198: одиночный файл БЕЗ пути на диске (вставка из буфера / повёрнутая копия из окна
// PhotoSendModal) отправляется БАЙТАМИ через tg:send-clipboard-image. overrideFile — повёрнутая
// копия (File) из окна: если передана, шлём именно её (тоже байтами, у неё нет пути).
// v1.2.199: логи всего потока (app:log) + предупреждение, если файл без пути выпал из альбома (#5).
// v1.2.203: окно PhotoSendModal передаёт МАССИВ файлов (несколько фото). Альбом собирается по
//   путям; файлы без пути (вставленные / повёрнутая canvas-копия) пишутся во временный файл через
//   tg:write-temp-file и тоже уходят в альбом (закрывает прежний пропуск, TODO-30).
//
// v1.2.209: sendOpts.splitText — подпись длиннее лимита Telegram (~1024): фото уходит БЕЗ подписи,
//   затем полный текст следом обычным сообщением (store.sendMessage). Порядок: сперва фото, потом текст.
// v1.2.211: текст режется на куски ≤4096 (лимит текста Telegram; иначе не доходил), и отправляется
//   ПОСЛЕ реальной загрузки фото (ждём tg:upload-progress done, таймаут 15с) — иначе лёгкий текст
//   обгонял тяжёлое фото и вставал выше.
//
// ВАЖНО: Electron file.path нужен для отправки по пути. File API из буфера/canvas без path —
// для одиночного идёт «байтами» (tg:send-clipboard-image), для альбома — через временный файл.

import { splitTextForTelegram, TEXT_MAX } from './photoSendUtils.js'

// v1.2.211/212: ждём, пока фото РЕАЛЬНО загрузится, чтобы текст следом встал НИЖЕ фото.
// v1.2.212: ждём завершения ИМЕННО файла, чей upload мы видели «в процессе» (по fileId) — а не
// любого `done` (иначе завершение чужой параллельной загрузки могло разблокировать текст раньше).
// Создавать ДО отправки фото, чтобы поймать его прогресс с самого начала. Слушаем в renderer
// (window.api.on). Нет api / нет события за timeout → не ждём/идём дальше (текст всё равно отправим).
function createUploadDoneWaiter() {
  const active = new Set()   // fileId, которые мы видели грузящимися (done:false)
  let doneSeen = false
  let resolveFn = null
  let unsub = null
  try {
    if (typeof window !== 'undefined' && typeof window.api?.on === 'function') {
      unsub = window.api.on('tg:upload-progress', (p) => {
        if (!p || p.fileId == null) return
        if (p.done) {
          // Завершился файл, чей прогресс мы видели → это наш загруженный (фото).
          if (active.has(p.fileId)) { doneSeen = true; if (resolveFn) resolveFn('done') }
        } else {
          active.add(p.fileId)
        }
      })
    }
  } catch (_) {}
  return {
    wait(timeoutMs) {
      return new Promise((resolve) => {
        if (!unsub) { resolve('no-api'); return }       // нет подписки (тесты) → не ждём
        if (doneSeen) { resolve('done-early'); return }
        resolveFn = resolve
        setTimeout(() => resolve('timeout'), timeoutMs)  // запаска: не зависнуть
      })
    },
    cancel() { try { unsub && unsub() } catch (_) {} },
  }
}

/**
 * Запускает отправку в активный чат. Сам управляет attach.setSending().
 *
 * @param {object} args
 * @param {object} args.store     — nativeStore (sendFile / sendAlbum / activeChatId)
 * @param {object} args.attach    — useFileAttach state ({files, caption, sending, setSending, clear})
 * @param {{id?: number}|null} args.replyTo
 * @param {(text: string, level?: 'error'|'info'|'success') => void} args.showToast
 * @param {(reply: any) => void} args.setReplyTo — при успехе сбрасываем replyTo в null.
 * @param {File[]|File} [args.overrideFile] — v1.2.203: МАССИВ файлов из окна PhotoSendModal
 *   (по порядку, повёрнутые — уже как новые File). v1.2.198 (legacy): одиночный File → байтами.
 *   Иначе (событие клика от FilePreviewBar) — берём attach.files как раньше.
 */
export async function runAttachSend({ store, attach, replyTo, showToast, setReplyTo, overrideFile, sendOpts }) {
  if (!attach?.files || attach.files.length === 0) return
  if (attach.sending) return
  attach.setSending(true)
  // v1.2.207 (#1): «Без сжатия» — из окна PhotoSendModal (asDocument). Дефолт false = как раньше.
  const asDoc = !!(sendOpts && sendOpts.asDocument)
  // v1.2.209: «Фото и текст — отдельными сообщениями» (подпись длиннее лимита Telegram ~1024).
  // splitText=true → фото уходит БЕЗ подписи, а полный текст следом обычным сообщением.
  const splitText = !!(sendOpts && sendOpts.splitText)
  const photoCaption = splitText ? '' : attach.caption

  // v1.2.199: логи всего потока отправки прикреплений (через app:log → chatcenter.log,
  // видно в «📒 Логи»). Данные файла НЕ логируем — только счётчики/флаги.
  const log = (level, msg) => {
    try { window.api?.send?.('app:log', { level, message: '[attach-send] ' + msg }) } catch (_) {}
  }
  const isArray = Array.isArray(overrideFile)
  const isOverride = !isArray && !!(overrideFile && typeof overrideFile.arrayBuffer === 'function')
  log('INFO', `start files=${attach.files.length} caption=${attach.caption ? 'Y' : 'N'} mode=${isArray ? 'array' : isOverride ? 'single-bytes' : 'attach'}`)

  const hasDiskPath = (f) => {
    const p = f?.path
    return !!(p && typeof p === 'string' && (p.includes('/') || p.includes('\\')))
  }

  // Отправка одиночного файла БАЙТАМИ (нет пути на диске) через готовый tg:send-clipboard-image.
  async function sendBytes(fileLike, defaultExt) {
    const buf = await fileLike.arrayBuffer()
    const ext = (typeof fileLike.type === 'string' && fileLike.type.split('/')[1]) || defaultExt || 'png'
    return window.api?.invoke('tg:send-clipboard-image', {
      chatId: store.activeChatId,
      data: Array.from(new Uint8Array(buf)),
      ext,
      caption: photoCaption || '',
    })
  }

  // v1.2.203: файл без пути → пишем во временный файл на диске, получаем путь (для альбома).
  async function writeTempPath(fileLike) {
    const buf = await fileLike.arrayBuffer()
    const ext = (typeof fileLike.type === 'string' && fileLike.type.split('/')[1]) || 'png'
    const r = await window.api?.invoke('tg:write-temp-file', { data: Array.from(new Uint8Array(buf)), ext })
    return r?.ok && r.path ? r.path : null
  }

  // v1.2.212: слушатель загрузки создаём ДО отправки фото (splitText), чтобы поймать прогресс
  // фото с самого начала и ждать завершения именно его. Чистим в finally.
  let uploadWaiter = null
  try {
    let result
    if (splitText) uploadWaiter = createUploadDoneWaiter()
    if (isArray) {
      // v1.2.203: массив фото из окна отправки.
      const items = overrideFile.filter(Boolean)
      if (items.length === 0) {
        log('ERROR', 'array: empty → abort'); showToast('Нет файлов для отправки', 'error')
        attach.setSending(false); return
      }
      if (items.length === 1) {
        const f = items[0]
        if (hasDiskPath(f)) { log('INFO', `array→single by disk path doc=${asDoc} split=${splitText}`); result = await store.sendFile(store.activeChatId, f.path, photoCaption, asDoc) }
        else if (typeof f?.arrayBuffer === 'function') {
          if (asDoc) {
            // «Без сжатия» + файл без пути (вставка/поворот) → временный файл → документ.
            const tp = await writeTempPath(f)
            if (tp) { log('INFO', 'array→single no-path → temp → doc'); result = await store.sendFile(store.activeChatId, tp, photoCaption, true) }
            else { log('ERROR', 'array→single: temp write failed'); showToast('Не удалось подготовить файл', 'error'); attach.setSending(false); return }
          } else { log('INFO', 'array→single no-path → bytes'); result = await sendBytes(f, 'png') }
        }
        else { log('ERROR', 'array→single: no path/bytes'); showToast('Не удалось получить файл', 'error'); attach.setSending(false); return }
      } else {
        // Альбом: путь напрямую, а файл без пути пишем во временный и берём его путь.
        const built = []
        let temped = 0, skipped = 0
        for (const f of items) {
          if (hasDiskPath(f)) { built.push({ path: f.path }) }
          else if (typeof f?.arrayBuffer === 'function') {
            const tp = await writeTempPath(f)
            if (tp) { built.push({ path: tp }); temped++ }
            else { skipped++; log('WARN', 'album: temp write failed for one file') }
          } else { skipped++ }
        }
        if (built.length === 0) {
          log('ERROR', 'album: nothing prepared → abort'); showToast('Не удалось подготовить файлы', 'error')
          attach.setSending(false); return
        }
        if (skipped) showToast(`${skipped} фото не удалось подготовить, отправлены остальные`, 'error')
        log('INFO', `album n=${built.length} temp=${temped} skipped=${skipped} doc=${asDoc} split=${splitText}`)
        result = await store.sendAlbum(store.activeChatId, built, photoCaption, replyTo?.id, asDoc)
      }
    } else if (isOverride) {
      // v1.2.198 (legacy): одиночная повёрнутая копия — File без пути → байтами.
      log('INFO', 'rotated copy → bytes (ext=jpg/png)')
      result = await sendBytes(overrideFile, 'jpg')
    } else {
      const raw = attach.files
      if (raw.length === 1) {
        const f = raw[0]
        if (hasDiskPath(f)) {
          log('INFO', `single by disk path split=${splitText}`)
          result = await store.sendFile(store.activeChatId, f.path, photoCaption)
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
        // Альбом (2+) от FilePreviewBar. По путям (Electron file.path).
        const validFiles = raw.map(f => ({ path: f.path || f.name }))
          .filter(f => (f.path && typeof f.path === 'string' && f.path.includes('/')) || f.path?.includes('\\'))
        if (validFiles.length === 0) {
          log('ERROR', 'album: no valid paths → abort')
          showToast('Не удалось получить путь к файлам (Electron file.path required)', 'error')
          attach.setSending(false)
          return
        }
        if (validFiles.length < raw.length) {
          const skipped = raw.length - validFiles.length
          log('WARN', `album: ${skipped} file(s) без пути пропущены, отправляю ${validFiles.length}`)
          showToast(`${skipped} файл(а) из буфера пропущены (нет пути), отправлены остальные`, 'error')
        }
        log('INFO', `album n=${validFiles.length} split=${splitText}`)
        result = await store.sendAlbum(store.activeChatId, validFiles, photoCaption, replyTo?.id)
      }
    }

    if (result?.ok) {
      log('INFO', 'ok')
      // v1.2.209/211: «отдельными сообщениями» — фото ушло, теперь ПОЛНЫЙ текст следом (после фото),
      // порезанный на куски ≤4096 (лимит текста Telegram). Сначала ждём реальной загрузки фото.
      if (splitText && attach.caption && attach.caption.trim()) {
        try {
          log('INFO', 'split: жду завершения загрузки фото перед отправкой текста')
          const how = uploadWaiter ? await uploadWaiter.wait(15000) : 'no-wait'
          const chunks = splitTextForTelegram(attach.caption, TEXT_MAX)
          log('INFO', `split: фото ${how}; отправляю текст ${chunks.length} сообщ.`)
          for (let i = 0; i < chunks.length; i++) {
            const tr = await store.sendMessage(store.activeChatId, chunks[i])
            if (!tr?.ok) {
              log('WARN', `split chunk ${i + 1}/${chunks.length} not ok: ${tr?.error || '?'}`)
              showToast('Часть текста не отправилась отдельным сообщением', 'error')
              break
            }
          }
        } catch (e) {
          log('ERROR', `split text failed: ${e?.message || e}`)
          showToast('Фото ушло, текст отдельным сообщением — не отправился', 'error')
        }
      }
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
    if (uploadWaiter) uploadWaiter.cancel()
    attach.setSending(false)
  }
}
