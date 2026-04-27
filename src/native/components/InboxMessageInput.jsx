// v0.87.83: вынесено из InboxMode.jsx — поле ввода + reply/edit панель.
// Принимает state и handlers, рендерит Reply/Edit панель + input + кнопку отправки.

export default function InboxMessageInput({
  input, setInput, sending, replyTo, editTarget, setReplyTo, setEditTarget,
  activeMessages,
  handleInputChange, handleReplySend, handlePaste,
}) {
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
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--amoled-border)',
        background: 'var(--amoled-surface)',
        display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => {
            if ((e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) && input.trim()) handleReplySend()
            // v0.87.27: Ctrl+↑ — редактируем последнее своё сообщение
            if (e.key === 'ArrowUp' && e.ctrlKey && !input.trim() && !editTarget) {
              e.preventDefault()
              const lastOwn = [...activeMessages].reverse().find(m => m.isOutgoing && !m.mediaType)
              if (lastOwn) { setEditTarget(lastOwn); setInput(lastOwn.text || '') }
            }
          }}
          onPaste={handlePaste}
          placeholder={
            editTarget ? 'Отредактируйте сообщение...'
            : replyTo ? 'Ответ...'
            : 'Введите сообщение... (перетащите файл / Ctrl+V фото)'
          }
          disabled={sending}
          style={{ flex: 1 }}
        />
        <button className="native-btn" onClick={handleReplySend} disabled={sending || !input.trim()}>
          {sending ? '...' : editTarget ? '✓' : 'Отпр.'}
        </button>
      </div>
    </>
  )
}
