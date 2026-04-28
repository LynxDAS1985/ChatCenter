// v0.87.83: вынесено из InboxMode.jsx — левая колонка (поиск + список чатов).
// v0.87.105 (ADR-016): multi-account — фильтр-кнопки сверху для выбора аккаунта.
// Содержит: фильтр аккаунтов, поиск по чатам, счётчик «найдено», виртуальный список ChatRow.

import { useEffect, useRef } from 'react'
import { List } from 'react-window'
import ChatRow from './ChatRow.jsx'

const ITEM_HEIGHT = 64

// v0.87.105: цветной бейдж аккаунта — короткие инициалы из имени аккаунта.
// Используется для отметки в каждом чате (показать какому аккаунту принадлежит).
function AccountBadgeMini({ name, color }) {
  const initials = (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
  return (
    <span
      className="account-badge-mini"
      title={name || ''}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        height: 16,
        padding: '0 5px',
        background: color || 'rgba(42,171,238,0.18)',
        border: `1px solid ${color ? color : 'rgba(42,171,238,0.35)'}`,
        borderRadius: 3,
        color: '#fff',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >{initials}</span>
  )
}

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

  // v0.87.105 (ADR-016): нужны ли фильтр-кнопки — только если 2+ аккаунта.
  const showFilters = store.accounts.length >= 2
  const filter = store.chatFilter || 'all'

  return (
    <div style={{
      width: 340, borderRight: '1px solid var(--amoled-border)',
      background: 'var(--amoled-surface)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* v0.87.105: Фильтр аккаунтов — показываем только при 2+ аккаунтах */}
      {showFilters && (
        <div style={{
          display: 'flex', gap: 4, padding: '8px 10px',
          borderBottom: '1px solid var(--amoled-border)',
          background: 'var(--amoled-bg)',
          flexShrink: 0, overflowX: 'auto',
        }}>
          <button
            onClick={() => store.setChatFilter('all')}
            className="account-filter-btn"
            style={{
              padding: '4px 10px',
              background: filter === 'all' ? 'var(--amoled-accent)' : 'transparent',
              color: filter === 'all' ? '#fff' : 'var(--amoled-text-dim)',
              border: '1px solid var(--amoled-border)',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >Все ({store.chats.length})</button>
          {store.accounts.map(acc => {
            const accChatsCount = store.chats.filter(c => c.accountId === acc.id).length
            const isActive = filter === acc.id
            return (
              <button
                key={acc.id}
                onClick={() => store.setChatFilter(acc.id)}
                className="account-filter-btn"
                style={{
                  padding: '4px 10px',
                  background: isActive ? 'var(--amoled-accent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--amoled-text-dim)',
                  border: '1px solid var(--amoled-border)',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title={acc.phone || acc.username}
              >{acc.name || acc.username || acc.id} ({accChatsCount})</button>
            )
          })}
        </div>
      )}
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
        {search && ` найдено из ${(store.chats || []).filter(c => filter === 'all' ? true : c.accountId === filter).length}`}
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
              // v0.87.105: передаём accounts чтобы ChatRow мог отрисовать бейдж аккаунта
              accounts: store.accounts,
              showAccountBadge: store.accounts.length >= 2,
            }}
            style={{ height: listHeight, width: '100%' }}
          />
        )}
      </div>
    </div>
  )
}

// v0.87.105: экспорт бейджа для использования в других местах (заголовок чата и т.п.)
export { AccountBadgeMini }
