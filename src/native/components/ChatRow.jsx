// v0.87.105 (ADR-016): передаём accounts + showAccountBadge для multi-account UI
// v0.87.106: добавлен hoveredAccountId — для подсветки чатов аккаунта при hover в sidebar
// v0.87.109: добавлен onContextMenu — для меню заглушения по ПКМ
// v0.95.21: forumTopics для расчёта бейджа форум-групп (число тем с непрочитанным)
import ChatListItem from './ChatListItem.jsx'
import { getDisplayUnreadCount } from '../utils/displayUnread.js'

export default function ChatRow({
  index, style, chats, activeChatId, setActiveChat,
  accounts, showAccountBadge, hoveredAccountId, onContextMenu, compact,
  forumTopics,
}) {
  const c = chats[index]
  if (!c) return null
  const account = accounts ? accounts.find(a => a.id === c.accountId) : null
  const displayUnreadCount = getDisplayUnreadCount(c, forumTopics)
  return (
    <div style={style}>
      <ChatListItem
        chat={c}
        active={activeChatId === c.id}
        onClick={() => setActiveChat(c.id)}
        onContextMenu={onContextMenu ? (e) => onContextMenu(e, c) : undefined}
        account={account}
        multiAccount={showAccountBadge}
        hoveredAccountId={hoveredAccountId}
        compact={compact}
        displayUnreadCount={displayUnreadCount}
      />
    </div>
  )
}
