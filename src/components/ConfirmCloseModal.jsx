// v0.85.1: Диалог подтверждения закрытия вкладки — вынесен из App.jsx

export default function ConfirmCloseModal({ confirmClose, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'var(--cc-overlay)' }}
      onClick={onCancel}
      onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
    >
      <div
        className="rounded-2xl p-6 w-[380px] shadow-2xl"
        style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{ backgroundColor: `${confirmClose.color}20` }}>
            {confirmClose.emoji || '💬'}
          </div>
          <div>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--cc-text)' }}>Закрыть вкладку?</h3>
            <p className="text-sm" style={{ color: 'var(--cc-text-dim)' }}>
              Вкладка <span style={{ color: confirmClose.color, fontWeight: 600 }}>{confirmClose.name}</span> будет удалена.
              <br />Сессия авторизации может сброситься.
            </p>
          </div>
          <div className="flex gap-3 w-full mt-1">
            <button
              onClick={onCancel} autoFocus
              className="flex-1 py-2.5 rounded-lg text-sm transition-all cursor-pointer"
              style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dim)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cc-border)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
            >Отмена</button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-all cursor-pointer"
              style={{ backgroundColor: '#ef4444' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  )
}
