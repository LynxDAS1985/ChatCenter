// v0.95.43: hook управления выбранными файлами для отправки.
//
// State:
//   - files: File[] — выбранные (через input или drag-drop)
//   - caption: string — общий caption для альбома
//   - sending: bool — идёт отправка
//
// Actions:
//   - addFiles(File[] | FileList) — добавить
//   - removeFile(idx) — удалить один
//   - clear() — очистить всё
//   - setCaption(string)
//
// Ограничения (TDLib):
//   - Максимум 10 файлов одним альбомом — split в backend
//   - Файлы > 2GB — TDLib limit, показываем warning
//
// Эталон: Telegram Web K SendMessage flow — выбор → preview → caption → send.

import { useState, useCallback } from 'react'

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024  // 2 GB TDLib limit

export function useFileAttach() {
  const [files, setFiles] = useState([])
  const [caption, setCaption] = useState('')
  const [sending, setSending] = useState(false)

  const addFiles = useCallback((newFiles) => {
    if (!newFiles) return
    const arr = Array.from(newFiles).filter(f => {
      if (!f) return false
      // Защита от слишком больших файлов — TDLib откажет
      if (f.size > MAX_FILE_SIZE) {
        try { console.warn('[file-attach] skip too large:', f.name, f.size) } catch (_) {}
        return false
      }
      return true
    })
    if (arr.length === 0) return
    setFiles(prev => [...prev, ...arr])
  }, [])

  const removeFile = useCallback((idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const clear = useCallback(() => {
    setFiles([])
    setCaption('')
  }, [])

  return {
    files, caption, sending,
    addFiles, removeFile, clear,
    setCaption, setSending,
  }
}

export { MAX_FILE_SIZE }
