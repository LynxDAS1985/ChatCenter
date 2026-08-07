// v0.95.43: панель превью выбранных файлов перед отправкой.
// v0.95.44: прогресс % через store.uploads (TDLib updateFile event).
//
// Эталоны:
//   - Telegram Web K MediaPreviewPanel — фото/видео thumbnails + caption + send
//   - WhatsApp Web — fullscreen modal с фото + caption
//   - Discord — inline превью перед отправкой
//
// Caption — общий для всех выбранных файлов (для альбома → caption на первом элементе).

import { useState, useEffect } from 'react'
import { useUploadProgress, formatBytes } from '../hooks/useUploadProgress.js'
import { CAPTION_MAX, TEXT_MAX, splitTextForTelegram } from '../utils/photoSendUtils.js'  // v1.2.210: лимит подписи

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
 * @param {object} uploads — v0.95.44: store.uploads для прогресс-bar
 */
export default function FilePreviewBar({
  files, caption, onCaptionChange, onRemoveFile, onCancel, onSend, sending,
  uploads,
}) {
  // v0.95.44: агрегатный прогресс всех активных uploads
  const progress = useUploadProgress(uploads)
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
  // v1.2.210: подпись к медиа тоже ограничена ~1024 (не только у фото). Длиннее — не дойдёт.
  const capLen = (caption || '').length
  const capOver = capLen > CAPTION_MAX
  const textChunks = capOver ? splitTextForTelegram(caption, TEXT_MAX).length : 0  // v1.2.212 (#3)

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
      {/* v1.2.210: счётчик подписи + при превышении «Файл, затем текст отдельно» (как в окне фото) */}
      {capLen > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, flexWrap: 'wrap' }}>
          <span style={{ color: capOver ? '#ff9a9a' : 'var(--amoled-text-dim)', fontVariantNumeric: 'tabular-nums' }}>
            {capLen} / {CAPTION_MAX}{capOver ? ` · −${capLen - CAPTION_MAX}` : ''}
          </span>
          {capOver && (
            <>
              <span style={{ color: '#f5b74a' }}>⚠ не влезет — текст уйдёт {textChunks} {textChunks === 1 ? 'сообщением' : 'сообщениями'}</span>
              <button
                onClick={() => onSend(undefined, { splitText: true })}
                title="Сначала файл, затем весь текст отдельными сообщениями"
                style={{ marginLeft: 'auto', background: 'var(--amoled-accent, #2AABEE)', color: '#fff',
                  border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 11 }}
              >Файл, затем текст ({textChunks})</button>
            </>
          )}
        </div>
      )}
      {/* Caption + кнопка отправки */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={caption || ''}
          onChange={e => onCaptionChange(e.target.value)}
          placeholder="Добавьте подпись (необязательно)..."
          style={{ flex: 1, fontSize: 13, ...(capOver ? { border: '1px solid rgba(255,107,107,0.55)' } : {}) }}
          disabled={sending}
        />
        <button
          className="native-btn"
          onClick={() => onSend(undefined, { splitText: false })}
          disabled={sending || capOver}
          style={{ minWidth: 90 }}
        >
          {sending && progress.hasActive
            ? `${progress.percent}%`
            : sending ? 'Отправка...' : 'Отправить'}
        </button>
      </div>
      {/* v0.95.44: прогресс-bar (только при активной загрузке) */}
      {sending && progress.hasActive && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '2px 0',
        }}>
          <div style={{
            height: 4, borderRadius: 2,
            background: 'var(--amoled-surface-hover)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              width: `${progress.percent}%`,
              height: '100%',
              background: 'var(--amoled-accent, #2AABEE)',
              transition: 'width 200ms ease-out',
            }} />
          </div>
          <div style={{
            fontSize: 10, color: 'var(--amoled-text-dim)',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>
              {progress.active > 1 ? `Загрузка ${progress.active} файлов...` : 'Загрузка...'}
            </span>
            <span>
              {formatBytes(progress.uploaded)} / {formatBytes(progress.total)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
