// v0.87.103: вынесено из InboxMode.jsx — рендер правой части (окно активного чата).
// Содержит: header с поиском, закреплённое, список сообщений, scroll-to-bottom, message input.
// Принимает все нужные props через единый объект (упрощает интерфейс).
// v0.89.0: рендер сообщений через VirtualMessageList (react-window 2.2). Полностью
// заменил прежний прямой рендер всех items в DOM. Старая система
// «msgsScrollRef → handleScroll → onScroll на <div>» переиграна: msgsScrollRef теперь
// синхронизируется с listRef.current.element (outermost div react-window), события
// onScroll/onWheel/onDrag пробрасываются в <List> через VirtualMessageList пропсы.
import { useEffect, useRef, useState } from 'react'
import MessageSkeleton, { MessageListOverlay } from './MessageSkeleton.jsx'
import InboxMessageInput from './InboxMessageInput.jsx'
import VirtualMessageList from './VirtualMessageList.jsx'
import { formatUnreadCount } from '../utils/unreadFormat.js'
// v0.87.106: фирменный мессенджер-маркер в шапке открытого чата
import { getMessengerEmoji, getMessengerName } from '../utils/messengerBranding.js'

export default function InboxChatPanel({
  // chat data
  store, activeChat, activeTopic, activeMessages, activeUnread, visibleMessages, renderItems, isTyping, messagesLoading, unreadWindow,
  // v0.88.0: prefetch новых сообщений вниз (Telegram-style infinite scroll down)
  loadingNewer,
  // search/pin/toast/forward
  pinnedMsg, setPinnedMsg, showMsgSearch, setShowMsgSearch, msgSearch, setMsgSearch,
  // input
  input, setInput, sending, replyTo, setReplyTo, editTarget, setEditTarget,
  handleInputChange, handleReplySend, handlePaste,
  // scroll
  msgsScrollRef, handleScroll, scrollDiag, dragOver, handleDragOver, handleDragLeave, handleDrop,
  chatReady, atBottom, newBelow, scrollToBottom, scrollToAbsoluteBottom, scrollToMessage,
  // v0.89.0: imperative API виртуализации (scrollToRow + getter element)
  virtualListRef,
  // v0.92.0: Virtuoso props (бывшие v_*) — все обязательны после Day 4 удаления feature flag.
  virtuosoInitialIndex,
  virtuosoFirstItemIndex,
  virtuosoOnStartReached,
  virtuosoOnEndReached,
  // v0.92.6: virtuosoRestoreStateFrom УДАЛЁН — snapshot не работает с key={cacheKey} ремаунтом.
  // message actions
  handleDelete, handleForward, handlePin, openPhotoWindow, getMessage, readByVisibility,
}) {
  // v0.89.0: react-window держит scroll-контейнер сам. msgsScrollRef нужен внешним
  // хукам (useInitialScroll, useReadOnScrollAway, scrollPos save) — синхронизируем
  // его с listRef.current.element через useState (триггерит re-render когда element
  // появился — IntersectionObserver внутри MessageBubble тогда получит правильный root).
  const innerListRef = useRef(null)
  const effectiveListRef = virtualListRef || innerListRef
  const [scrollElement, setScrollElement] = useState(null)

  useEffect(() => {
    const el = effectiveListRef.current?.element || null
    if (msgsScrollRef) msgsScrollRef.current = el
    setScrollElement(el)
    return () => {
      if (msgsScrollRef && msgsScrollRef.current === el) msgsScrollRef.current = null
    }
  }, [renderItems.length, effectiveListRef, msgsScrollRef])
  const showUnreadWindowInfo = !!unreadWindow?.unreadWindowRequested
    && unreadWindow?.unreadWindowComplete === false
  const unreadLoaded = Math.max(0, Number(unreadWindow?.loadedIncoming || 0))
  const freshUnreadTotal = activeTopic
    ? Number(activeTopic.unreadCount || 0)
    : Number(activeChat?.unreadCount || 0)
  const unreadTotal = Math.max(0, Number.isFinite(freshUnreadTotal)
    ? freshUnreadTotal
    : Number(unreadWindow?.unreadCount || 0))
  const showFreshUnreadWindowInfo = showUnreadWindowInfo && unreadLoaded < unreadTotal

  if (!activeChat) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--amoled-text-dim)' }}>
        Выберите чат
      </div>
    )
  }

  return (
    <>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--amoled-border)',
        background: 'var(--amoled-surface)', fontWeight: 600,
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{ flex: 1 }}>
          {activeTopic ? (
            <>
              <div>{activeTopic.title}</div>
              <div style={{ color: 'var(--amoled-text-muted)', fontSize: 12, fontWeight: 400 }}>в {activeChat.title}</div>
            </>
          ) : activeChat.title}
          {isTyping
            ? <span style={{ color: 'var(--amoled-accent)', fontSize: 11, marginLeft: 10, fontWeight: 400 }}>✍️ печатает...</span>
            : activeChat.isOnline && <span style={{ color: 'var(--amoled-success)', fontSize: 11, marginLeft: 10, fontWeight: 400 }}>● онлайн</span>
          }
        </div>
        {/* v0.87.106: маркер мессенджера+аккаунта в шапке (Бонус). Показываем при 2+ аккаунтах. */}
        {(() => {
          const accounts = store.accounts || []
          if (accounts.length < 2) return null
          const acc = accounts.find(a => a.id === activeChat.accountId)
          if (!acc) return null
          const emoji = getMessengerEmoji(acc.messenger || 'telegram')
          const name = getMessengerName(acc.messenger || 'telegram')
          return (
            <span
              title={`${emoji} ${name} · ${acc.name}${acc.phone ? '\n' + acc.phone : ''}`}
              style={{
                marginRight: 12,
                fontSize: 11,
                color: 'var(--amoled-text-muted)',
                fontWeight: 400,
                whiteSpace: 'nowrap',
              }}
            >{emoji} {name} · {acc.name || acc.username || 'аккаунт'}</span>
          )
        })()}
        <button
          onClick={() => { setShowMsgSearch(v => !v); if (showMsgSearch) setMsgSearch('') }}
          style={{ background: 'transparent', border: 'none', color: 'var(--amoled-text-dim)', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}
          title="Поиск в чате (Ctrl+F)"
        >🔍</button>
      </div>
      {/* v0.87.17: закреплённое сообщение */}
      {pinnedMsg && (
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--amoled-border)',
          background: 'rgba(42,171,238,0.08)', display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <span style={{ fontSize: 14 }}>📌</span>
          <div style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <div style={{ color: 'var(--amoled-accent)', fontWeight: 600 }}>Закреплённое</div>
            <div style={{ color: 'var(--amoled-text-dim)' }}>{pinnedMsg.text?.slice(0, 100) || '[медиа]'}</div>
          </div>
          <button onClick={() => setPinnedMsg(null)} style={{
            background: 'transparent', border: 'none', color: 'var(--amoled-text-dim)',
            cursor: 'pointer', fontSize: 14,
          }} title="Скрыть">✕</button>
        </div>
      )}
      {showMsgSearch && (
        <div style={{ padding: 8, borderBottom: '1px solid var(--amoled-border)', background: 'var(--amoled-surface)' }}>
          <input type="text" placeholder="Поиск в этом чате..." value={msgSearch}
            onChange={e => setMsgSearch(e.target.value)} autoFocus style={{ width: '100%', fontSize: 13 }} />
          {msgSearch && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--amoled-text-dim)' }}>Найдено: {visibleMessages.length}</div>}
        </div>
      )}
      {/* v0.87.36: wrapper relative — кнопка ↓ вне scroll-контейнера + overlay-shimmer */}
      {showFreshUnreadWindowInfo && (
        <div className="native-unread-window-status">
          <span className="native-unread-window-status__dot" />
          <span>
            {unreadWindow.unreadWindowLoading
              ? 'Загружаю непрочитанные сообщения'
              : 'Загружена часть непрочитанных сообщений'}
          </span>
          {unreadTotal > 0 && (
            <strong>{formatUnreadCount(Math.min(unreadLoaded, unreadTotal), { exactUntil: 9999 })} из {formatUnreadCount(unreadTotal, { exactUntil: 9999 })}</strong>
          )}
        </div>
      )}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* v0.87.66: overlay-shimmer пока !chatReady — initial-scroll прыжок не виден */}
        {/* v0.87.118: overlay также при загрузке поверх кэша (1 старое сообщение → синяя полоска) */}
        {/* v0.89.37: убрано visibleMessages.length>0 — на первой загрузке топика */}
        {/* messages=0, overlay не показывался → юзер видел чёрный фон 500-600мс. */}
        {/* Теперь skeleton-overlay показывается сразу при клике (как Telegram/WhatsApp). */}
        <MessageListOverlay show={(!chatReady) || !!messagesLoading} />
        {/* v0.89.0: виртуализация рендера через react-window. msgsScrollRef
            синхронизируется с listRef.current.element через useEffect выше. */}
        <div style={{
          flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0,
          outline: dragOver ? '2px dashed var(--amoled-accent)' : 'none',
          background: dragOver ? 'rgba(42,171,238,0.08)' : 'transparent',
          opacity: chatReady ? 1 : 0,
          transition: 'opacity 200ms ease-out',
        }}>
          {dragOver && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--amoled-accent)', fontSize: 18, fontWeight: 600, pointerEvents: 'none',
              background: 'rgba(0,0,0,0.4)', zIndex: 2,
            }}>📎 Отпустите файл для отправки</div>
          )}
          {visibleMessages.length === 0 ? (
            messagesLoading ? (
              <MessageSkeleton count={5} />
            ) : (
              <div style={{ color: 'var(--amoled-text-dim)', textAlign: 'center', padding: 20 }}>
                {msgSearch ? 'Ничего не найдено' : (activeChat.isForum && !activeTopic ? 'Выберите тему слева' : 'Нет сообщений')}
              </div>
            )
          ) : (
            <VirtualMessageList
              listRef={effectiveListRef}
              renderItems={renderItems}
              cacheKey={store.activeChatId}
              rowContext={{
                store, readRoot: scrollElement,
                setReplyTo, setEditTarget, setInput,
                handleDelete, handleForward, handlePin,
                openPhotoWindow, getMessage, readByVisibility, scrollToMessage,
              }}
              onScroll={handleScroll}
              onWheel={() => scrollDiag.markUserScroll('wheel')}
              onTouchStart={() => scrollDiag.markUserScroll('touch')}
              onPointerDown={() => scrollDiag.markUserScroll('pointer')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              initialTopMostItemIndex={virtuosoInitialIndex}
              firstItemIndex={virtuosoFirstItemIndex}
              startReached={virtuosoOnStartReached}
              endReached={virtuosoOnEndReached}
            />
          )}
          {/* v0.88.0/0.89.0: индикатор подгрузки новых сообщений (Telegram-style)
              рендерится поверх ленты, прикреплён к низу контейнера. */}
          {loadingNewer && (
            <div className="native-msgs-loading-newer" aria-live="polite" style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, pointerEvents: 'none',
            }}>
              <span className="native-msgs-loading-newer__dot" />
              <span>Загружаю ещё...</span>
            </div>
          )}
        </div>
        {/* v0.87.35/36: кнопка ↓ ВНЕ scroll-контейнера */}
        {/* v0.87.51: бейдж = activeUnread (сырой Telegram API, как в ChatListItem) */}
        {(!atBottom || activeUnread > 0) && (
          <button
            onClick={scrollToBottom}
            onDoubleClick={(e) => {
              e.preventDefault()
              scrollToAbsoluteBottom?.()
            }}
            className="native-scroll-bottom-btn"
            title={activeUnread > 0 ? `К первому непрочитанному (${activeUnread})` : 'К последнему сообщению'}
          >
            ↓
            {(activeUnread > 0 || newBelow > 0) && (
              <span className="native-scroll-bottom-badge">
                {formatUnreadCount(activeUnread > 0 ? activeUnread : newBelow, { exactUntil: 9999 })}
              </span>
            )}
          </button>
        )}
      </div>
      {/* Input + Reply/Edit панель → InboxMessageInput (v0.87.83) */}
      <InboxMessageInput
        input={input} setInput={setInput} sending={sending}
        replyTo={replyTo} editTarget={editTarget}
        setReplyTo={setReplyTo} setEditTarget={setEditTarget}
        activeMessages={activeMessages}
        handleInputChange={handleInputChange}
        handleReplySend={handleReplySend}
        handlePaste={handlePaste}
        disabled={activeChat.isForum}
        disabledText={activeTopic ? 'Отправка в темы будет следующим этапом' : 'Сначала выберите тему слева'}
      />
    </>
  )
}
