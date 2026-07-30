// v0.87.105 (ADR-016): передаём accounts + showAccountBadge для multi-account UI
// v0.87.106: добавлен hoveredAccountId — для подсветки чатов аккаунта при hover в sidebar
// v0.87.109: добавлен onContextMenu — для меню заглушения по ПКМ
// v0.95.21: forumTopics для расчёта бейджа форум-групп (число тем с непрочитанным)
// v1.2.161: строка чата в едином виртуальном списке. Закреплённые чаты — тоже здесь
//   (наверху, в порядке pinnedIds — сортировка в InboxMode), со значком 📌 и полоской;
//   отдельного «приклеенного» списка нет (v1.2.160 откачен: закреплённые должны листаться
//   вместе со списком). Перетаскивания порядка нет.
import ChatListItem from './ChatListItem.jsx'
import { getDisplayUnreadCount } from '../utils/displayUnread.js'

export default function ChatRow({
  index, style, chats, activeChatId, setActiveChat,
  accounts, showAccountBadge, hoveredAccountId, onContextMenu, compact,
  forumTopics,
  // v0.95.42: query для подсветки совпадений в title/lastMessage
  highlightQuery,
  // v1.2.138: множество закреплённых chat.id (для значка 📌 и полоски при поиске,
  // когда закреплённые показываются внутри общего списка).
  pinnedSet,
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
        highlightQuery={highlightQuery}
        isPinned={!!(pinnedSet && pinnedSet.has(c.id))}
      />
    </div>
  )
}
