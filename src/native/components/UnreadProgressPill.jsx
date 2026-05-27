// v0.94.5: облачко прогресса непрочитанных у кнопки ↓.
// Вынесено из InboxChatPanel (был инлайн) — чтобы покрыть тестом (как MessageSkeleton).
// show=false → класс --hidden (плавно гаснет через CSS opacity, без JS-таймеров).
// Клик → onClick (в InboxChatPanel это scrollToBottom = переход к первому непрочитанному).

import { formatUnreadCount } from '../utils/unreadFormat.js'

export default function UnreadProgressPill({ show, loaded, total, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'native-unread-pill' + (show ? '' : ' native-unread-pill--hidden')}
      title="Перейти к первому непрочитанному"
    >
      <span className="native-unread-pill__dot" />
      {total > 0 && (
        <span>
          {formatUnreadCount(Math.min(loaded, total), { exactUntil: 9999 })} / {formatUnreadCount(total, { exactUntil: 9999 })}
        </span>
      )}
    </button>
  )
}
