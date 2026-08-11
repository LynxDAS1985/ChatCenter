// v0.87.83: вынесено из InboxMode.jsx — поле ввода + reply/edit панель.
// v0.95.43: добавлены FileAttachButton (📎) + FilePreviewBar (превью + caption + send).

import { useRef, useEffect } from 'react'
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
  onAttachAdd, onAttachRemove, onAttachMove, onAttachClear, onAttachCaptionChange, onAttachSend,
  // v0.95.44: store.uploads для прогресс-bar
  uploads,
}) {
  // v0.95.43: если есть выбранные файлы — вместо обычного input показываем FilePreviewBar
  const hasAttachedFiles = Array.isArray(attachFiles) && attachFiles.length > 0
  // v1.2.203: ЕСЛИ ВСЕ прикреплённые файлы — картинки (1+), показываем крупное окно PhotoSendModal
  // (зум/поворот/подпись + лента миниатюр для нескольких фото). Видео / документы / смешанное →
  // прежний компактный FilePreviewBar. Поворот — настоящий (см. PhotoSendModal/inboxAttachSend).
  const allImages = hasAttachedFiles && attachFiles.every(
    f => typeof f?.type === 'string' && f.type.startsWith('image/')
  )

  // v1.2.224: многострочное растущее поле (как в Телеграм / как подпись в окне фото).
  // Растёт по мере строк до MAX_INPUT_H, дальше — прокрутка внутри поля.
  const taRef = useRef(null)
  const MAX_INPUT_H = 140
  const autosize = (el) => {
    if (!el) return
    try { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, MAX_INPUT_H) + 'px' } catch (_) {}
  }
  // Пересчёт высоты при внешней смене текста (вставка ответа ИИ, редактирование, очистка после отправки).
  useEffect(() => { autosize(taRef.current) }, [input])

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
      {/* v1.2.203: картинки (1+) → крупное окно с зумом/поворотом/лентой миниатюр. */}
      {allImages ? (
        <PhotoSendModal
          files={attachFiles}
          caption={attachCaption}
          onCaptionChange={onAttachCaptionChange}
          onSend={onAttachSend}
          onCancel={onAttachClear}
          sending={attachSending}
          onAdd={onAttachAdd}
          onRemove={onAttachRemove}
          onReorder={onAttachMove}
          uploads={uploads}
        />
      ) : /* v0.95.43: видео / документ / смешанное → компактный превью-бар */
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
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={e => { handleInputChange(e.target.value); autosize(e.target) }}
            onKeyDown={e => {
              // v1.2.224: Enter — отправить (без переноса), Shift+Enter — новая строка (как Телеграм).
              // v0.95.27: source в лог — диагностика дубля (mistakes/native-scroll-unread.md).
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault() // textarea: не вставлять перенос, а отправить (или ничего, если пусто)
                if (input.trim() && !sending) {
                  handleReplySend({ source: 'keyboard:Enter', ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })
                }
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
              : 'Введите сообщение... (Shift+Enter — новая строка, Ctrl+V фото)'
            }
            // v0.95.23: НЕ дизаблим во время sending — иначе браузер снимает фокус с disabled
            // поля → курсор пропадает. Кнопка «Отпр.» дизаблится отдельно, Enter-отправка защищена
            // `&& !sending`. Паттерн Telegram Web K / Desktop / WhatsApp / Discord.
            disabled={disabled}
            style={{ flex: 1, resize: 'none', maxHeight: MAX_INPUT_H, overflowY: 'auto', lineHeight: 1.4 }}
          />
          <button className="native-btn" onClick={() => handleReplySend({ source: 'click:button' })} disabled={disabled || sending || !input.trim()}>
            {sending ? '...' : editTarget ? '✓' : 'Отпр.'}
          </button>
        </div>
      )}
    </>
  )
}
