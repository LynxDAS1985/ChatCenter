// v0.87.83: вынесено из InboxMode.jsx — левая колонка (поиск + список чатов).
// Содержит: поиск по чатам, счётчик «найдено», виртуальный список ChatRow.

import { useEffect, useRef } from 'react'
import { List } from 'react-window'
import ChatRow from './ChatRow.jsx'

const ITEM_HEIGHT = 64

export default function InboxChatListSidebar({
  store,
  activeAccountChats,
  search, setSearch,
  listHeight, setListHeight,
}) {
  const listRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const update = () => setListHeight(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [setListHeight])

  return (
    <div style={{
      width: 340, borderRight: '1px solid var(--amoled-border)',
      background: 'var(--amoled-surface)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--amoled-border)', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="🔍 Поиск по чатам..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', fontSize: 13 }}
        />
      </div>
      <div style={{
        padding: '8px 14px', fontSize: 11, color: 'var(--amoled-text-dim)',
        borderBottom: '1px solid var(--amoled-border)', background: 'var(--amoled-bg)', flexShrink: 0,
      }}>
        💬 {activeAccountChats.length}
        {search && ` найдено из ${(store.chats || []).filter(c => !store.activeAccountId || c.accountId === store.activeAccountId).length}`}
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        {activeAccountChats.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--amoled-text-dim)', fontSize: 13, textAlign: 'center' }}>
            {store.accounts.length === 0 ? 'Нет аккаунтов' : search ? 'Ничего не найдено' : 'Загрузка чатов...'}
          </div>
        ) : (
          <List
            listRef={listRef}
            rowCount={activeAccountChats.length}
            rowHeight={ITEM_HEIGHT}
            rowComponent={ChatRow}
            rowProps={{
              chats: activeAccountChats,
              activeChatId: store.activeChatId,
              setActiveChat: store.setActiveChat,
            }}
            style={{ height: listHeight, width: '100%' }}
          />
        )}
      </div>
    </div>
  )
}
