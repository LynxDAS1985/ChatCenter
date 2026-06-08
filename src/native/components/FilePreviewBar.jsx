// v0.95.43: панель превью выбранных файлов перед отправкой.
//
// Эталоны:
//   - Telegram Web K MediaPreviewPanel — фото/видео thumbnails + caption + send
//   - WhatsApp Web — fullscreen modal с фото + caption
//   - Discord — inline превью перед отправкой
//
// У нас inline-режим (между textarea и областью сообщений) — компактно.
//
// Состояния:
//   - 1 фото/видео → preview 80px высотой
//   - 2+ фото/видео → горизонтальный scroll, можно удалить отдельно
//   - Документы (.pdf/.zip/.docx) → иконка 📎 + имя + размер
//
// Caption — общий для всех выбранных файлов (для альбома → caption на первом элементе).

import { useState, useEffect } from 'react'

function fileSizeLabel(bytes) {
  if (!bytes || bytes < 1024) return (bytes || 0) + ' Б'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' МБ'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' ГБ'
}

function isImage(file) {
  return file && file.type && file.type.startsWith('image/')
}

function isVideo(file) {
  return file && file.type && file.type.startsWith('video/')
}

// Превью одного файла — thumbnail для image/video, иначе иконка.
function FileThumb({ file, url, onRemove }) {
  return (
    <div style={{
      position: 'relative', flexShrink: 0,
      width: 72, height: 72, borderRadius: 8,
      background: 'var(--amoled-surface-hover)',
      border: '1px solid var(--amoled-border)',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {url && isImage(file) ? (
        <img src={url} alt={file.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : url && isVideo(file) ? (
        <video src={url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ textAlign: 'center', padding: 4 }}>
          <div style={{ fontSize: 22 }}>📎</div>
          <div style={{
            fontSize: 9, color: 'var(--amoled-text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', maxWidth: 64,
          }}>{file.name}</div>
        </div>
      )}
      <button
        onClick={onRemove}
        title="Убрать файл"
        style={{
          position: 'absolute', top: 2, right: 2,
          width: 20, height: 20, borderRadius: '50%',
          background: 'rgba(0,0,0,0.7)',
          color: '#fff', border: 'none', cursor: 'pointer',
          fontSize: 11, lineHeight: 1, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >✕</button>
    </div>
  )
}

/**
 * @param {File[]} files — выбранные File-объекты (с File API: name, size, path, type)
 * @param {string} caption — текст caption (общий)
 * @param {(c: string) => void} onCaptionChange
 * @param {(idx: number) => void} onRemoveFile
 * @param {() => void} onCancel — отменить выбор (очистить всё)
 * @param {() => void} onSend — отправить
 * @param {boolean} sending — идёт отправка (блокирует кнопку)
 */
export default function FilePreviewBar({
  files, caption, onCaptionChange, onRemoveFile, onCancel, onSend, sending,
}) {
  const [urls, setUrls] = useState([])

  // Создаём object URLs для превью (revoke при unmount)
  useEffect(() => {
    if (!Array.isArray(files) || files.length === 0) {
      setUrls([])
      return undefined
    }
    const newUrls = files.map(f => {
      try {
        if (isImage(f) || isVideo(f)) return URL.createObjectURL(f)
      } catch (_) {}
      return null
    })
    setUrls(newUrls)
    return () => {
      newUrls.forEach(u => { if (u) try { URL.revokeObjectURL(u) } catch (_) {} })
    }
  }, [files])

  if (!Array.isArray(files) || files.length === 0) return null

  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0)

  return (
    <div style={{
      padding: 10,
      borderTop: '1px solid var(--amoled-border)',
      background: 'var(--amoled-surface)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Header — количество + размер + отмена */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, color: 'var(--amoled-text-dim)',
      }}>
        <span>
          📎 {files.length === 1 ? 'Файл' : `${files.length} файла`} · {fileSizeLabel(totalSize)}
        </span>
        <button
          onClick={onCancel}
          title="Отменить"
          style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            color: 'var(--amoled-text-dim)', cursor: 'pointer', fontSize: 12,
          }}
        >✕ Отмена</button>
      </div>
      {/* Thumbnails — горизонтальный скролл */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', overflowY: 'hidden',
        paddingBottom: 4,
      }}>
        {files.map((f, i) => (
          <FileThumb
            key={f.name + ':' + i}
            file={f}
            url={urls[i]}
            onRemove={() => onRemoveFile(i)}
          />
        ))}
      </div>
      {/* Caption + кнопка отправки */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={caption || ''}
          onChange={e => onCaptionChange(e.target.value)}
          placeholder="Добавьте подпись (необязательно)..."
          style={{ flex: 1, fontSize: 13 }}
          disabled={sending}
        />
        <button
          className="native-btn"
          onClick={onSend}
          disabled={sending}
          style={{ minWidth: 90 }}
        >
          {sending ? 'Отправка...' : 'Отправить'}
        </button>
      </div>
    </div>
  )
}
