// v0.95.44: hook для агрегатного прогресса всех активных uploads.
//
// state.uploads: { [fileId]: { uploaded, total, percent } }
//
// Агрегат:
//   - суммируем uploaded и total всех активных
//   - возвращаем { percent: 0-100, active: number, hasActive: bool }
//
// Используется в FilePreviewBar — показ прогресс-bar когда attachSending=true.
//
// Эталон: Telegram Web K appDownloadManager.aggregateProgress.

import { useMemo } from 'react'

export function useUploadProgress(uploads) {
  return useMemo(() => {
    const entries = uploads && typeof uploads === 'object' ? Object.values(uploads) : []
    const active = entries.length
    if (active === 0) {
      return { percent: 0, active: 0, hasActive: false, uploaded: 0, total: 0 }
    }
    let uploaded = 0
    let total = 0
    for (const e of entries) {
      uploaded += Number(e?.uploaded) || 0
      total += Number(e?.total) || 0
    }
    const percent = total > 0 ? Math.min(100, Math.floor((uploaded / total) * 100)) : 0
    return { percent, active, hasActive: true, uploaded, total }
  }, [uploads])
}

// Хелпер для форматирования размера
export function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return (bytes || 0) + ' Б'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' МБ'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' ГБ'
}
