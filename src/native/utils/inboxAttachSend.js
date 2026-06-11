// v1.1.9: вынесено из InboxMode.jsx — отправка прикреплённых файлов (1 файл → sendFile,
// 2+ → sendAlbum), общая обработка ошибок и финализация state attach.
//
// ВАЖНО: Electron file.path required. Browser File API без path не работает —
// объясняем юзеру через toast.

/**
 * Запускает отправку attach.files в активный чат. Сам управляет attach.setSending().
 *
 * @param {object} args
 * @param {object} args.store     — nativeStore (содержит sendFile / sendAlbum / activeChatId)
 * @param {object} args.attach    — useFileAttach state ({files, caption, sending, setSending, clear})
 * @param {{id?: number}|null} args.replyTo
 * @param {(text: string, level?: 'error'|'info'|'success') => void} args.showToast
 * @param {(reply: any) => void} args.setReplyTo — при успехе сбрасываем replyTo в null.
 */
export async function runAttachSend({ store, attach, replyTo, showToast, setReplyTo }) {
  if (!attach?.files || attach.files.length === 0) return
  if (attach.sending) return
  attach.setSending(true)
  try {
    // Получаем path для каждого файла — Electron File API возвращает path
    // через `file.path` (доступно в drag/file picker). Browser File API без path.
    const files = attach.files.map(f => ({
      path: f.path || f.name,  // file.path — в Electron, fallback на name
      // caption на каждом — для альбома пустой, общий идёт через albumCaption
    }))
    const validFiles = files.filter(
      f => (f.path && typeof f.path === 'string' && f.path.includes('/')) || f.path?.includes('\\')
    )
    if (validFiles.length === 0) {
      showToast('Не удалось получить путь к файлам (Electron file.path required)', 'error')
      attach.setSending(false)
      return
    }
    let result
    if (validFiles.length === 1) {
      result = await store.sendFile(store.activeChatId, validFiles[0].path, attach.caption)
    } else {
      result = await store.sendAlbum(store.activeChatId, validFiles, attach.caption, replyTo?.id)
    }
    if (result?.ok) {
      attach.clear()
      setReplyTo(null)
    } else {
      showToast(`Ошибка отправки: ${result?.error || 'неизвестно'}`, 'error')
    }
  } catch (e) {
    showToast(`Сбой отправки: ${e?.message || e}`, 'error')
  } finally {
    attach.setSending(false)
  }
}
