// v0.87.83: вынесено из InboxMode.jsx — поле ввода + reply/edit панель.
// v0.95.43: добавлены FileAttachButton (📎) + FilePreviewBar (превью + caption + send).

import FileAttachButton from './FileAttachButton.jsx'
import FilePreviewBar from './FilePreviewBar.jsx'
import PhotoSendModal from './PhotoSendModal.jsx'

export default function InboxMessageInput({
  input, setInput, sending, replyTo, editTarget, setReplyTo, setEditTarget,
  activeMessages,
  handleInputChange, handleReplySend, handlePaste,
  disabled = false,
  disabledText = 'Недоступно',
  // v0.95.43: пропсы для скрепки и альбомов
  attachFiles, attachCaption, attachSending,
  onAttachAdd, onAttachRemove, onAttachClear, onAttachCaptionChange, onAttachSend,
  // v0.95.44: store.uploads для прогресс-bar
  uploads,
}) {
  // v0.95.43: если есть выбранные файлы — вместо обычного input показываем FilePreviewBar
  const hasAttachedFiles = Array.isArray(attachFiles) && attachFiles.length > 0
  // v1.2.197: ровно ОДНО фото → крупное окно PhotoSendModal (зум/поворот/перемещение +
  // подпись). Несколько файлов / видео / документы → прежний компактный FilePreviewBar.
  // Зум/поворот — только вид, отправляется исходный файл (через тот же onAttachSend).
  const singleImage = hasAttachedFiles && attachFiles.length === 1 &&
    typeof attachFiles[0]?.type === 'string' && attachFiles[0].type.startsWith('image/')

  return (
    <>
      {(replyTo || editTarget) && (
        <div style={{
          padding: '6px 12px',
          background: 'var(--amoled-surface-hover)',
          borderTop: '1px solid var(--amoled-border)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        }}>
          <span style={{ color: 'var(--amoled-accent)' }}>
            {editTarget ? '✏️ Редактирование' : '↪ Ответ на'}:
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.7 }}>
            {(editTarget || replyTo).text?.slice(0, 80) || '[медиа]'}
          </span>
          <button
            onClick={() => { setReplyTo(null); setEditTarget(null); setInput('') }}
            style={{ background: 'transparent', border: 'none', color: 'var(--amoled-text-dim)', cursor: 'pointer' }}
          >✕</button>
        </div>
      )}
      {/* v1.2.197: одиночное фото → крупное окно с зумом/поворотом/перемещением. */}
      {singleImage ? (
        <PhotoSendModal
          file={attachFiles[0]}
          caption={attachCaption}
          onCaptionChange={onAttachCaptionChange}
          onSend={onAttachSend}
          onCancel={onAttachClear}
          sending={attachSending}
        />
      ) : /* v0.95.43: несколько файлов / видео / документ → компактный превью-бар */
      hasAttachedFiles ? (
        <FilePreviewBar
          files={attachFiles}
          caption={attachCaption}
          onCaptionChange={onAttachCaptionChange}
          onRemoveFile={onAttachRemove}
          onCancel={onAttachClear}
          onSend={onAttachSend}
          sending={attachSending}
          uploads={uploads}
        />
      ) : (
        <div style={{
          padding: 12,
          borderTop: '1px solid var(--amoled-border)',
          background: 'var(--amoled-surface)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          {/* v0.95.43: кнопка 📎 слева от input — выбор файлов */}
          {onAttachAdd && !editTarget && (
            <FileAttachButton onSelect={onAttachAdd} disabled={disabled || sending} />
          )}
          <input
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={e => {
              // v0.95.27: лог источника отправки (keyboard Enter) — для диагностики
              // дубля. См. mistakes/native-scroll-unread.md «двойная отправка».
              if ((e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) && input.trim() && !sending) {
                handleReplySend({ source: 'keyboard:Enter', ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })
              }
              // v0.87.27: Ctrl+↑ — редактируем последнее своё сообщение
              if (e.key === 'ArrowUp' && e.ctrlKey && !input.trim() && !editTarget) {
                e.preventDefault()
                const lastOwn = [...activeMessages].reverse().find(m => m.isOutgoing && !m.mediaType)
                if (lastOwn) { setEditTarget(lastOwn); setInput(lastOwn.text || '') }
              }
            }}
            onPaste={handlePaste}
            placeholder={
              disabled ? disabledText
              : editTarget ? 'Отредактируйте сообщение...'
              : replyTo ? 'Ответ...'
              : 'Введите сообщение... (перетащите файл / Ctrl+V фото)'
            }
            // v0.95.23: НЕ дизаблим во время sending — иначе браузер по HTML5 spec
            // снимает фокус с disabled input → курсор пропадает, юзер должен снова
            // кликать в поле. Кнопка «Отпр.» дизаблится отдельно (см. ниже), Enter-
            // отправка защищена `&& !sending` в onKeyDown. Это паттерн Telegram Web K /
            // Desktop / WhatsApp / Discord — никто не дизаблит input во время отправки.
            disabled={disabled}
            style={{ flex: 1 }}
          />
          <button className="native-btn" onClick={() => handleReplySend({ source: 'click:button' })} disabled={disabled || sending || !input.trim()}>
            {sending ? '...' : editTarget ? '✓' : 'Отпр.'}
          </button>
        </div>
      )}
    </>
  )
}
