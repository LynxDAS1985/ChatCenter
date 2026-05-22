// v0.87.83: вынесено из InboxMode.jsx — левая колонка (поиск + список чатов).
// v0.87.105 (ADR-016): multi-account — фильтр-кнопки сверху для выбора аккаунта.
// v0.87.109: ПКМ на чате → меню заглушения (MuteMenu).
// Содержит: фильтр аккаунтов, поиск по чатам, счётчик «найдено», виртуальный список ChatRow.

import { useEffect, useRef, useState, useCallback } from 'react'
import { List } from 'react-window'
import ChatRow from './ChatRow.jsx'
import MuteMenu from './MuteMenu.jsx'
import { formatUnreadCount } from '../utils/unreadFormat.js'

const ITEM_HEIGHT = 74

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

// v0.91.5: helper для cap иконки темы. Custom emoji (icon.custom_emoji_id из TDLib)
// — это premium фича, требует getCustomEmojiStickers + рендер lottie/webm/webp.
// Сложно для первой итерации. Fallback: показываем первый символ unicode emoji
// из title (если юзер сам поставил emoji в название) ИЛИ первую букву title.
// Это так же делает Telegram Desktop когда custom emoji ещё не подгрузился.
function extractTopicCap(title) {
  if (!title) return '#'
  // Array.from обрабатывает unicode emoji как один code-point (включая surrogates).
  const firstChar = Array.from(title)[0]
  if (!firstChar) return '#'
  // Если первый символ — буква/цифра, делаем upper case, иначе оставляем (emoji).
  // Простая heuristic: regex для emoji range (любой не-ascii не-letter).
  if (/[a-zA-Zа-яА-Я0-9]/u.test(firstChar)) return firstChar.toUpperCase()
  return firstChar  // эмодзи или знак пунктуации
}

// v0.91.8 (Совет 4): сортировка тем форума — pinned первыми, потом по
// количеству непрочитанных (DESC), потом по lastMessageTs (DESC).
// Так делает Telegram Desktop — темы с новыми сообщениями всегда видны юзеру наверху.
function sortForumTopics(a, b) {
  const ap = a.isPinned ? 1 : 0
  const bp = b.isPinned ? 1 : 0
  if (ap !== bp) return bp - ap
  const au = a.unreadCount || 0
  const bu = b.unreadCount || 0
  if (au !== bu) return bu - au
  return (b.lastMessageTs || 0) - (a.lastMessageTs || 0)
}

function ForumTopicIcon({ topic }) {
  const canShowImage = topic.iconEmojiUrl && !String(topic.iconEmojiMimeType || '').includes('x-tgsticker')
  const isVideo = String(topic.iconEmojiMimeType || '').includes('webm')
  // v0.91.5: если backend не передал iconEmoji (custom emoji не загружен) — вытаскиваем
  // из title. Раньше для всех тем без emoji показывался жёсткий `#`.
  const cap = topic.iconEmoji || extractTopicCap(topic.title)
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 8,
      background: topic.iconColor ? `#${Number(topic.iconColor).toString(16).padStart(6, '0').slice(-6)}` : 'rgba(42,171,238,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, flexShrink: 0,
      fontSize: 18,
      overflow: 'hidden',
    }}>
      {canShowImage ? (
        isVideo ? (
          <video src={topic.iconEmojiUrl} autoPlay loop muted playsInline style={{ width: 28, height: 28, objectFit: 'contain' }} />
        ) : (
          <img src={topic.iconEmojiUrl} alt={cap} style={{ width: 28, height: 28, objectFit: 'contain' }} />
        )
      ) : cap}
    </div>
  )
}

export default function InboxChatListSidebar({
  store,
  activeAccountChats,
  search, setSearch,
  listHeight, setListHeight,
  hoveredAccountId,
}) {
  const listRef = useRef(null)
  const containerRef = useRef(null)
  // v0.87.109: состояние меню заглушения { chat, x, y } или null
  const [muteMenu, setMuteMenu] = useState(null)
  const [visibleForumChatId, setVisibleForumChatId] = useState(null)
  const [forumClosing, setForumClosing] = useState(false)

  const handleContextMenu = useCallback((e, chat) => {
    e.preventDefault()
    setMuteMenu({ chat, x: e.clientX, y: e.clientY })
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const update = () => setListHeight(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [setListHeight, store.forumTopicPanelChatId])

  useEffect(() => {
    if (store.forumTopicPanelChatId) {
      setVisibleForumChatId(store.forumTopicPanelChatId)
      setForumClosing(false)
      return undefined
    }
    if (!visibleForumChatId) return undefined
    setForumClosing(true)
    const timer = setTimeout(() => {
      setVisibleForumChatId(null)
      setForumClosing(false)
    }, 180)
    return () => clearTimeout(timer)
  }, [store.forumTopicPanelChatId, visibleForumChatId])

  // v0.87.105 (ADR-016): нужны ли фильтр-кнопки — только если 2+ аккаунта.
  const showFilters = store.accounts.length >= 2
  const filter = store.chatFilter || 'all'
  const forumChatId = visibleForumChatId || store.forumTopicPanelChatId
  const forumChat = forumChatId ? store.chats.find(c => c.id === forumChatId) : null
  const forumTopics = forumChatId ? (store.forumTopics?.[forumChatId] || []) : []
  const selectedTopic = forumChatId ? store.activeForumTopic?.[forumChatId] : null

  if (forumChat) {
    return (
      <div className={`native-forum-topic-panel ${forumClosing ? 'native-forum-topic-panel--closing' : ''}`} style={{
        width: 340, borderRight: '1px solid var(--amoled-border)',
        background: 'var(--amoled-surface)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          height: 58, display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 12px', borderBottom: '1px solid var(--amoled-border)',
          background: 'var(--amoled-bg)', flexShrink: 0,
        }}>
          <button
            onClick={() => store.closeForumTopics?.()}
            title="Закрыть темы"
            style={{
              width: 34, height: 34, borderRadius: 6,
              border: '1px solid var(--amoled-border)',
              background: 'transparent',
              color: 'var(--amoled-text)',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >×</button>
          <div style={{ minWidth: 0 }}>
            <div style={{
              color: 'var(--amoled-text)', fontWeight: 700, fontSize: 15,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{forumChat.title}</div>
            <div style={{ color: 'var(--amoled-text-muted)', fontSize: 12 }}>Темы группы</div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {store.forumTopicsLoading?.[forumChatId] && forumTopics.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--amoled-text-dim)', fontSize: 13, textAlign: 'center' }}>
              Загрузка тем...
            </div>
          ) : forumTopics.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--amoled-text-dim)', fontSize: 13, textAlign: 'center' }}>
              Темы не найдены
            </div>
          ) : [...forumTopics].sort(sortForumTopics).map(topic => {
            const active = selectedTopic?.id === topic.id
            return (
              <div
                className={`native-forum-topic-row ${active ? 'native-forum-topic-row--active' : ''}`}
                key={topic.id}
                onClick={() => store.selectForumTopic?.(forumChatId, topic)}
                style={{
                  height: 66,
                  padding: '9px 12px',
                  borderBottom: '1px solid var(--amoled-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <ForumTopicIcon topic={topic} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    color: 'var(--amoled-text)', fontWeight: 700, fontSize: 14,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{topic.title}{topic.isClosed ? ' 🔇' : ''}</div>
                  <div style={{
                    color: 'var(--amoled-text-dim)', fontSize: 12,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{topic.lastMessage || 'Нет предпросмотра'}</div>
                </div>
                {topic.unreadCount > 0 && (
                  <span style={{
                    minWidth: 30, padding: '3px 7px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.28)',
                    color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center',
                    flexShrink: 0,
                  }}>{formatUnreadCount(topic.unreadCount)}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="native-chat-list-panel" style={{
      width: 340, borderRight: '1px solid var(--amoled-border)',
      background: 'var(--amoled-surface)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* v0.87.106: Поиск ПЕРВЫЙ (был после фильтра) */}
      <div style={{ padding: 10, borderBottom: '1px solid var(--amoled-border)', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="🔍 Поиск по чатам..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', fontSize: 13 }}
        />
      </div>
      {/* v0.87.106: Фильтр ПОД поиском (был СВЕРХУ). Показываем при 2+ аккаунтах. */}
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
      {search && (
        <div style={{
          padding: '8px 14px', fontSize: 11, color: 'var(--amoled-text-dim)',
          borderBottom: '1px solid var(--amoled-border)', background: 'var(--amoled-bg)', flexShrink: 0,
        }}>
          найдено {activeAccountChats.length} из {(store.chats || []).filter(c => filter === 'all' ? true : c.accountId === filter).length}
        </div>
      )}
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
              // v0.87.106 Улучшение 1: hover в sidebar → подсветка чатов аккаунта
              hoveredAccountId,
              // v0.87.109: ПКМ → меню заглушения
              onContextMenu: handleContextMenu,
            }}
            style={{ height: listHeight, width: '100%' }}
          />
        )}
      </div>
      {/* v0.87.109: меню заглушения по ПКМ (position: fixed — не влияет на layout) */}
      {muteMenu && (
        <MuteMenu
          chat={muteMenu.chat}
          x={muteMenu.x}
          y={muteMenu.y}
          onClose={() => setMuteMenu(null)}
          onSetMute={store.setMute}
        />
      )}
    </div>
  )
}

// v0.87.105: экспорт бейджа для использования в других местах (заголовок чата и т.п.)
export { AccountBadgeMini }
