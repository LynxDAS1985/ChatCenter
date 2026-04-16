// v0.87.34: drag-n-drop файлов + paste картинки в чат.
// Вынесено из InboxMode.jsx для соблюдения лимита 600 строк.
import { useState } from 'react'

export function useDropAndPaste({ activeChatId, sendFile, showToast }) {
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)

  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false)
    if (!activeChatId) return
    for (const f of e.dataTransfer.files) {
      await sendFile(activeChatId, f.path, '')
    }
  }

  const handlePaste = async (e) => {
    if (!activeChatId) return
    const items = Array.from(e.clipboardData?.items || [])
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (!imgItem) return
    e.preventDefault()
    const blob = imgItem.getAsFile()
    if (!blob) { showToast?.('Не удалось получить картинку из буфера', 'error'); return }
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const r = await window.api?.invoke('tg:send-clipboard-image', {
        chatId: activeChatId,
        data: Array.from(new Uint8Array(arrayBuffer)),
        ext: blob.type.split('/')[1] || 'png',
      })
      if (r?.ok) showToast?.('📎 Картинка отправлена', 'success')
      else showToast?.('✗ Ошибка: ' + (r?.error || 'неизвестно'), 'error')
    } catch (err) {
      showToast?.('✗ Ошибка: ' + err.message, 'error')
    }
  }

  return { dragOver, handleDragOver, handleDragLeave, handleDrop, handlePaste }
}
