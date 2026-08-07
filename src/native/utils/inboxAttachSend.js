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
// v1.2.211: текст режется на куски ≤4096 (лимит текста Telegram; иначе не доходил).
// v1.2.214: текст отправляется ПОСЛЕ серверного подтверждения фото/альбома (ждём tg:send-succeeded
//   по всем номерам, таймаут 15с) — иначе лёгкий текст получал более ранний серверный номер, чем
//   позже «склеенный» альбом, и вставал ВЫШЕ фото у получателя. См. createSendAckWaiter ниже.
//
// ВАЖНО: Electron file.path нужен для отправки по пути. File API из буфера/canvas без path —
// для одиночного идёт «байтами» (tg:send-clipboard-image), для альбома — через временный файл.

import { splitTextForTelegram, TEXT_MAX } from './photoSendUtils.js'

// v1.2.214: ждём СЕРВЕРНОГО подтверждения по КАЖДОМУ сообщению фото/альбома, а не «загрузки».
// Почему так (корень бага «у собеседника текст выше фото»): порядок в чате Telegram определяется
// финальным серверным номером (message.id), который присваивается в updateMessageSendSucceeded
// (old_message_id → новый id). Альбом из нескольких фото «склеивается» на сервере ПОЗЖЕ, чем
// улетает лёгкий текст → текст получал более ранний номер и вставал ВЫШЕ фото у получателя.
// Прошлые версии (v1.2.211-213) ждали лишь `done` ЗАГРУЗКИ первого фото (tg:upload-progress) —
// загрузка ≠ «сообщение село на сервер с номером», поэтому не спасало.
// Теперь ждём tg:send-succeeded по ВСЕМ временным номерам (result.messageIds) — только после
// этого у фото есть финальные номера, и текст следом гарантированно ниже. Этот же канал шлётся
// и при провале отправки (updateMessageSendFailed, тот же oldId) → на частичном сбое не зависаем.
// Подписываемся ДО отправки (гонка: ACK может прийти сразу). Слушаем в renderer (window.api.on).
// Нет api / нет номеров / таймаут → идём дальше (текст всё равно отправляем — не зависаем).
export function createSendAckWaiter() {
  const acked = new Set()      // oldId (временный номер), получившие ACK сервера (succeeded ИЛИ failed)
  let wanted = null            // Set<string> временных номеров, которых ждём (наши сообщения фото)
  let resolveFn = null
  let unsub = null
  const allAcked = () => !!(wanted && wanted.size > 0 && [...wanted].every((id) => acked.has(id)))
  try {
    if (typeof window !== 'undefined' && typeof window.api?.on === 'function') {
      unsub = window.api.on('tg:send-succeeded', (p) => {
        if (!p || p.oldId == null) return
        acked.add(String(p.oldId))               // чужие ACK безвредны — сверяем только свои номера
        if (resolveFn && allAcked()) resolveFn('acked')
      })
    }
  } catch (_) {}
  return {
    wait(timeoutMs, ids) {
      wanted = new Set((ids || []).map(String))
      return new Promise((resolve) => {
        if (!unsub) { resolve('no-api'); return }        // нет подписки (тесты) → не ждём
        if (wanted.size === 0) { resolve('no-ids'); return }
        if (allAcked()) { resolve('acked-early'); return } // подтверждения успели прийти до wait()
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

  // v1.2.214: слушатель серверных подтверждений создаём ДО отправки (splitText), чтобы не
  // потерять ранний ACK (гонка). Чистим в finally.
  let ackWaiter = null
  try {
    let result
    if (splitText) ackWaiter = createSendAckWaiter()
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
      // v1.2.213: логируем номера сообщений фото/альбома — по возрастанию id виден порядок.
      log('INFO', `ok msgIds=${JSON.stringify(result.messageIds || result.messageId || null)}`)
      // v1.2.209/211: «отдельными сообщениями» — фото ушло, теперь ПОЛНЫЙ текст следом (после фото),
      // порезанный на куски ≤4096 (лимит текста Telegram). Сначала ждём реальной загрузки фото.
      if (splitText && attach.caption && attach.caption.trim()) {
        try {
          // v1.2.214: временные номера фото/альбома — по ним ждём серверного подтверждения.
          const provIds = (Array.isArray(result.messageIds) && result.messageIds.length)
            ? result.messageIds.map(String)
            : (result.messageId != null ? [String(result.messageId)] : [])
          log('INFO', `split: жду подтверждения сервера по ${provIds.length} сообщ. фото перед текстом`)
          const how = ackWaiter ? await ackWaiter.wait(15000, provIds) : 'no-wait'
          const chunks = splitTextForTelegram(attach.caption, TEXT_MAX)
          // v1.2.215: таймаут = подтверждение не пришло за 15с → порядок фото/текст мог не
          // сработать. Это подозрительно → WARN (а не INFO), чтобы выделялось в журнале.
          log(how === 'timeout' ? 'WARN' : 'INFO',
            `split: фото ${how}; отправляю текст ${chunks.length} сообщ.` +
            (how === 'timeout' ? ' (подтверждение сервера не пришло за 15с — порядок мог не сработать)' : ''))
          for (let i = 0; i < chunks.length; i++) {
            const tr = await store.sendMessage(store.activeChatId, chunks[i])
            // v1.2.213: лог результата КАЖДОГО куска (длина, ok, номер сообщения) — чтобы по
            // журналу видеть, что реально ушло и в каком порядке (не только при сбое).
            log('INFO', `split chunk ${i + 1}/${chunks.length} len=${chunks[i].length} ok=${!!tr?.ok} msgId=${tr?.messageId || '?'}`)
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
    if (ackWaiter) ackWaiter.cancel()
    attach.setSending(false)
  }
}
