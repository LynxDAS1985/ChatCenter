// v0.98.0 (Phase 2 M2.3): модалка подтверждения AI write action.
//
// Появляется когда AI делает tool_call с permission='confirm':
//   - reply_to_message (отправка ответа)
//   - mark_as_read
//   - create_task (Phase 4)
//   - и т.д.
//
// Защита от misclick: кнопка [✓ Подтвердить] активируется через 3 секунды
// (юзер успевает прочитать что AI собирается отправить).
//
// Текст ответа можно редактировать перед отправкой (только для reply/send tools).

import { useState, useEffect, useRef } from 'react'

const CONFIRM_DELAY_MS = 3000

/**
 * @param {object} props
 * @param {boolean} visible
 * @param {string} actionId — 'reply_to_message' | 'mark_as_read' | etc
 * @param {object} source — NotificationSource
 * @param {object} args — args от AI tool_call (включая text для reply)
 * @param {function} onConfirm(updatedArgs) — юзер подтвердил (возможно с правками text)
 * @param {function} onCancel
 */
export default function AIConfirmModal({ visible, actionId, source, args, onConfirm, onCancel }) {
  const [editableText, setEditableText] = useState(args?.text || '')
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(CONFIRM_DELAY_MS / 1000))
  const timerRef = useRef(null)

  // Сброс state при открытии модалки
  useEffect(() => {
    if (!visible) return undefined
    setEditableText(args?.text || '')
    setSecondsLeft(Math.ceil(CONFIRM_DELAY_MS / 1000))
    // Countdown
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1))
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [visible, args])

  if (!visible) return null

  const isReplyAction = actionId === 'reply_to_message' || actionId === 'send_message'
  const canConfirm = secondsLeft === 0
  const titleText = getActionTitle(actionId)

  const handleConfirm = () => {
    if (!canConfirm) return
    const updatedArgs = isReplyAction ? { ...args, text: editableText } : args
    onConfirm?.(updatedArgs)
  }

  const handleCancel = () => {
    onCancel?.()
  }

  return (
    <div
      role="dialog"
      aria-labelledby="ai-confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div style={{
        background: 'var(--cc-panel, #1a1a1a)',
        border: '1px solid var(--cc-border, #333)',
        borderRadius: 12,
        padding: 20,
        width: 'min(540px, 90vw)',
        maxHeight: '85vh',
        overflow: 'auto',
        color: 'var(--cc-text, #fff)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        }}>
          <span style={{ fontSize: 24 }}>🤖</span>
          <div>
            <h2 id="ai-confirm-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              AI предлагает действие
            </h2>
            <div style={{ fontSize: 13, color: 'var(--cc-text-dim, #888)', marginTop: 2 }}>
              {titleText}
            </div>
          </div>
        </div>

        {/* Контекст — куда отправляется */}
        <div style={{
          background: 'var(--cc-hover, #222)',
          padding: 12,
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 13,
        }}>
          <div><strong>Чат:</strong> {source?.chatTitle || source?.chatId || '(не указано)'}</div>
          <div><strong>Получатель:</strong> {source?.senderName || '(не указано)'}</div>
          {source?.textPreview && (
            <div style={{ marginTop: 6, color: 'var(--cc-text-dim, #888)' }}>
              <strong>Исходное сообщение:</strong> «{source.textPreview.slice(0, 100)}»
            </div>
          )}
        </div>

        {/* Текст ответа (редактируемый) или текстовое описание */}
        {isReplyAction ? (
          <>
            <label htmlFor="ai-reply-textarea" style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
              Текст ответа (можно отредактировать):
            </label>
            <textarea
              id="ai-reply-textarea"
              value={editableText}
              onChange={e => setEditableText(e.target.value)}
              rows={5}
              style={{
                width: '100%',
                padding: 10,
                background: 'var(--cc-input, #0a0a0a)',
                border: '1px solid var(--cc-border, #333)',
                borderRadius: 6,
                color: 'inherit',
                fontFamily: 'inherit',
                fontSize: 14,
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)', marginTop: 4 }}>
              {editableText.length} / 4000 символов
            </div>
          </>
        ) : (
          <div style={{ padding: 10, background: 'var(--cc-input, #0a0a0a)', borderRadius: 6, fontSize: 14 }}>
            {formatActionDetails(actionId, args)}
          </div>
        )}

        {/* Кнопки */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid var(--cc-border, #333)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            ✗ Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || (isReplyAction && editableText.trim().length === 0)}
            style={{
              padding: '10px 18px',
              background: canConfirm ? 'var(--cc-accent, #2AABEE)' : 'var(--cc-border, #333)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.6,
              minWidth: 140,
            }}
          >
            {canConfirm ? '✓ Подтвердить' : `Ждите ${secondsLeft}с…`}
          </button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)', marginTop: 12, textAlign: 'center' }}>
          Кнопка активируется через 3 секунды чтобы избежать случайного клика
        </div>
      </div>
    </div>
  )
}

function getActionTitle(actionId) {
  switch (actionId) {
    case 'reply_to_message': return 'Ответить на сообщение'
    case 'send_message':     return 'Отправить сообщение'
    case 'mark_as_read':     return 'Отметить прочитанным'
    case 'create_task':      return 'Создать задачу'
    case 'schedule_reminder': return 'Запланировать напоминание'
    default: return actionId
  }
}

function formatActionDetails(actionId, args) {
  if (!args) return JSON.stringify(args, null, 2)
  if (actionId === 'mark_as_read') {
    return `Отметить прочитанным до сообщения id=${args.upToMessageId || '(текущее)'}`
  }
  if (actionId === 'create_task') {
    return `Задача: «${args.title || '(пусто)'}»${args.dueAt ? `\nСрок: ${args.dueAt}` : ''}`
  }
  return JSON.stringify(args, null, 2)
}
