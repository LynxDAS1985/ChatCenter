import ChatListItem from './ChatListItem.jsx'

export default function ChatRow({ index, style, chats, activeChatId, setActiveChat }) {
  const c = chats[index]
  if (!c) return null
  return (
    <div style={style}>
      <ChatListItem chat={c} active={activeChatId === c.id} onClick={() => setActiveChat(c.id)} />
    </div>
  )
}
