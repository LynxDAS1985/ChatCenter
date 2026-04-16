// v0.87.36: action-handlers для сообщений (delete/forward/pin/forward-select).
// Вынесено из InboxMode.jsx для соблюдения лимита 600 строк.

export function useMessageActions({ store, setForwardTarget, setPinnedMsg, showToast, forwardTarget }) {
  const handleDelete = async (m) => {
    if (!confirm('Удалить сообщение у всех?')) return
    await store.deleteMessage(store.activeChatId, m.id, true)
  }

  const handleForward = (m) => setForwardTarget(m)

  const handleForwardSelect = async (targetChat) => {
    const m = forwardTarget
    setForwardTarget(null)
    const r = await store.forwardMessage(store.activeChatId, targetChat.id, m.id)
    showToast(r?.ok ? `✓ Переслано в «${targetChat.title}»` : '✗ ' + (r?.error || 'Ошибка'),
      r?.ok ? 'success' : 'error')
  }

  const handlePin = async (m) => {
    const r = await store.pinMessage(store.activeChatId, m.id, false)
    showToast(r?.ok ? '📌 Закреплено' : '✗ ' + (r?.error || 'Ошибка'),
      r?.ok ? 'success' : 'error')
    if (r?.ok) setPinnedMsg(m)
  }

  return { handleDelete, handleForward, handleForwardSelect, handlePin }
}
