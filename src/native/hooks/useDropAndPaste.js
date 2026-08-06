// v0.87.34: drag-n-drop файлов + paste картинки в чат.
// v1.2.198: и вставка (Ctrl+V), и перетаскивание теперь кладут файлы в ПРЕВЬЮ (attach.addFiles),
// а НЕ отправляют мгновенно. Так одиночное фото открывает окно PhotoSendModal (зум/поворот/
// подпись), а несколько файлов — компактный FilePreviewBar. Отправка — общей кнопкой «Отправить».
// Вынесено из InboxMode.jsx для соблюдения лимита 600 строк.
import { useState } from 'react'

export function useDropAndPaste({ activeChatId, addFiles, showToast }) {
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    if (!activeChatId) return
    // v1.2.198: перетащенные файлы → в превью (окно/бар), не мгновенная отправка.
    const list = e.dataTransfer?.files
    if (list && list.length) addFiles?.(list)
  }

  const handlePaste = (e) => {
    if (!activeChatId) return
    const items = Array.from(e.clipboardData?.items || [])
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (!imgItem) return
    e.preventDefault()
    const blob = imgItem.getAsFile()
    if (!blob) { showToast?.('Не удалось получить картинку из буфера', 'error'); return }
    // v1.2.198: вставленное фото → в превью-окно (а не мгновенная отправка).
    // У blob из буфера нет пути на диске — отправка идёт байтами (см. inboxAttachSend.js).
    addFiles?.([blob])
  }

  return { dragOver, handleDragOver, handleDragLeave, handleDrop, handlePaste }
}
