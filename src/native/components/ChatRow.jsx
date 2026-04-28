// v0.87.105 (ADR-016): передаём accounts + showAccountBadge для multi-account UI
import ChatListItem from './ChatListItem.jsx'

export default function ChatRow({ index, style, chats, activeChatId, setActiveChat, accounts, showAccountBadge }) {
  const c = chats[index]
  if (!c) return null
  // Найдём аккаунт этого чата (для бейджа)
  const account = showAccountBadge && accounts ? accounts.find(a => a.id === c.accountId) : null
  return (
    <div style={style}>
      <ChatListItem
        chat={c}
        active={activeChatId === c.id}
        onClick={() => setActiveChat(c.id)}
        account={account}
      />
    </div>
  )
}
