// v0.87.103: вынесено из InboxMode.jsx — рендер правой части (окно активного чата).
// Содержит: header с поиском, закреплённое, список сообщений, scroll-to-bottom, message input.
// Принимает все нужные props через единый объект (упрощает интерфейс).
import MessageBubble from './MessageBubble.jsx'
import { AlbumBubble } from './MediaAlbum.jsx'
import MessageSkeleton, { MessageListOverlay } from './MessageSkeleton.jsx'
import InboxMessageInput from './InboxMessageInput.jsx'
import { formatDayLabel } from '../utils/messageGrouping.js'

export default function InboxChatPanel({
  // chat data
  store, activeChat, activeMessages, activeUnread, visibleMessages, renderItems, isTyping,
  // search/pin/toast/forward
  pinnedMsg, setPinnedMsg, showMsgSearch, setShowMsgSearch, msgSearch, setMsgSearch,
  // input
  input, setInput, sending, replyTo, setReplyTo, editTarget, setEditTarget,
  handleInputChange, handleReplySend, handlePaste,
  // scroll
  msgsScrollRef, handleScroll, scrollDiag, dragOver, handleDragOver, handleDragLeave, handleDrop,
  chatReady, atBottom, newBelow, scrollToBottom, scrollToMessage,
  // message actions
  handleDelete, handleForward, handlePin, openPhotoWindow, getMessage, readByVisibility,
}) {
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
          {activeChat.title}
          {isTyping
            ? <span style={{ color: 'var(--amoled-accent)', fontSize: 11, marginLeft: 10, fontWeight: 400 }}>✍️ печатает...</span>
            : activeChat.isOnline && <span style={{ color: 'var(--amoled-success)', fontSize: 11, marginLeft: 10, fontWeight: 400 }}>● онлайн</span>
          }
        </div>
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
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* v0.87.66: overlay-shimmer пока !chatReady — initial-scroll прыжок не виден */}
        <MessageListOverlay show={!chatReady && visibleMessages.length > 0} />
        <div ref={msgsScrollRef} onScroll={handleScroll}
          onWheel={() => scrollDiag.markUserScroll('wheel')}
          onTouchStart={() => scrollDiag.markUserScroll('touch')}
          onPointerDown={() => scrollDiag.markUserScroll('pointer')}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          style={{
            flex: 1, overflowY: 'auto', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 6,
            outline: dragOver ? '2px dashed var(--amoled-accent)' : 'none',
            background: dragOver ? 'rgba(42,171,238,0.08)' : 'transparent',
            // v0.87.66: контент невидим до завершения initial-scroll + плавный fade-in
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
            store.loadingMessages?.[store.activeChatId] ? (
              <MessageSkeleton count={5} />
            ) : (
              <div style={{ color: 'var(--amoled-text-dim)', textAlign: 'center', padding: 20 }}>
                {msgSearch ? 'Ничего не найдено' : 'Нет сообщений'}
              </div>
            )
          ) : renderItems.map(item => {
            if (item.type === 'day') {
              return (
                <div key={item.id} className="native-msg-day-row">
                  <span className="native-msg-divider native-msg-divider--day">{formatDayLabel(item.day)}</span>
                </div>
              )
            }
            if (item.type === 'time') {
              return <div key={item.id} className="native-msg-divider">{new Date(item.time).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
            }
            if (item.type === 'unread') {
              return (
                <div key={item.id} className="native-msg-unread-divider">
                  <span>Новые сообщения</span>
                </div>
              )
            }
            // group — v0.87.27 аватарка слева для чужих групп
            const groupChat = !item.isOutgoing ? activeChat : null
            const groupInitials = item.senderName
              ? item.senderName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
              : '?'
            return (
              <div key={item.id} className="native-msg-group-row" style={{
                display: 'flex',
                flexDirection: item.isOutgoing ? 'row-reverse' : 'row',
                alignItems: 'flex-end', gap: 8,
              }}>
                {!item.isOutgoing && (
                  <div className="native-msg-avatar" style={{
                    background: groupChat?.avatar ? `url("${groupChat.avatar}") center/cover no-repeat` : '#65aadd',
                  }}>
                    {!groupChat?.avatar && groupInitials}
                  </div>
                )}
                <div className="native-msg-group" style={{
                  // v0.87.62 final: maxWidth 75% — bubble content-sized до 75%.
                  maxWidth: '75%',
                  alignItems: item.isOutgoing ? 'flex-end' : 'flex-start',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {!item.isOutgoing && item.senderName && (
                    <div className="native-msg-author">{item.senderName}</div>
                  )}
                  {item.msgs.map(m => (
                    m.type === 'album' ? (
                      <AlbumBubble
                        key={m.id} album={m} chatId={store.activeChatId}
                        downloadMedia={store.downloadMedia}
                        onPhotoOpen={openPhotoWindow}
                        onReply={setReplyTo}
                        onEdit={(msg) => { setEditTarget(msg); setInput(msg.text) }}
                        onDelete={handleDelete}
                        onForward={handleForward}
                        onPin={handlePin}
                        getMessage={getMessage}
                        onVisible={readByVisibility}
                        onReplyClick={scrollToMessage}
                      />
                    ) : (
                      <MessageBubble
                        key={m.id} m={m} chatId={store.activeChatId}
                        onReply={setReplyTo}
                        onEdit={(msg) => { setEditTarget(msg); setInput(msg.text) }}
                        onDelete={handleDelete}
                        onForward={handleForward}
                        onPin={handlePin}
                        downloadMedia={store.downloadMedia}
                        getMessage={getMessage}
                        onVisible={readByVisibility}
                        onPhotoOpen={openPhotoWindow}
                        onReplyClick={scrollToMessage}
                      />
                    )
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {/* v0.87.35/36: кнопка ↓ ВНЕ scroll-контейнера */}
        {/* v0.87.51: бейдж = activeUnread (сырой Telegram API, как в ChatListItem) */}
        {(!atBottom || activeUnread > 0) && (
          <button
            onClick={scrollToBottom}
            className="native-scroll-bottom-btn"
            title={activeUnread > 0 ? `К первому непрочитанному (${activeUnread})` : 'К последнему сообщению'}
          >
            ↓
            {(activeUnread > 0 || newBelow > 0) && (
              <span className="native-scroll-bottom-badge">
                {(activeUnread > 0 ? activeUnread : newBelow) > 99 ? '99+' : (activeUnread > 0 ? activeUnread : newBelow)}
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
      />
    </>
  )
}
