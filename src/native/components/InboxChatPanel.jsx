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
import PinnedMessageBar from './PinnedMessageBar.jsx'
import ForumTopicEmptyState from './ForumTopicEmptyState.jsx'
import useDelayedUnmount from '../hooks/useDelayedUnmount.js'
import { formatUnreadCount } from '../utils/unreadFormat.js'
// v0.87.106: фирменный мессенджер-маркер в шапке открытого чата
import { getMessengerEmoji, getMessengerName } from '../utils/messengerBranding.js'
// v0.95.29: Telegram-style header — аватарка + статус «в сети / был(а) в HH:MM».
import { formatChatStatus } from '../utils/formatChatStatus.js'

// v0.95.29: аватарка в заголовке чата (40x40 круг). Telegram-style.
const HEADER_AVATAR_COLORS = ['#e17076', '#eda86c', '#a695e7', '#7bc862', '#65aadd', '#ee7aae', '#6ec9cb']
function hashString(s) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h + s.charCodeAt(i)) & 0xffffffff
  return Math.abs(h)
}
function ChatHeaderAvatar({ chat }) {
  const initials = (chat.title || '?').split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '').join('')
  const bgColor = HEADER_AVATAR_COLORS[hashString(chat.title || '?') % HEADER_AVATAR_COLORS.length]
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
      background: chat.avatar ? `url("${chat.avatar}") center/cover no-repeat` : bgColor,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 15, fontWeight: 600, marginRight: 12,
      position: 'relative',
    }}>
      {!chat.avatar && (initials || '?')}
      {chat.isOnline && chat.type === 'user' && (
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 11, height: 11, borderRadius: '50%',
          background: 'var(--amoled-success, #4caf50)',
          border: '2px solid var(--amoled-surface)',
        }} />
      )}
    </div>
  )
}

// v0.95.8: кнопка ↓ с плавным появлением/исчезновением (bouncy spring on enter,
// smooth fade-down on leave). useDelayedUnmount задерживает реальный unmount
// на 220мс чтобы CSS-keyframes успели проиграть.
// v0.95.9: --loading класс когда идёт load-newer (юзер кликнул ↓ при unread > загруженного,
// и теперь lazy-load догружает 100+). Подсветка accent-цветом (как «Загружаю ещё...»
// индикатор) — юзер видит «работа идёт», нет ощущения дёрга.
function ScrollBottomButton({ visible, onClick, activeUnread, newBelow, loading }) {
  const { mounted, leaving } = useDelayedUnmount(visible, 220)
  if (!mounted) return null
  const stateClass = leaving
    ? 'native-scroll-bottom-btn--leaving'
    : 'native-scroll-bottom-btn--entering'
  const loadingClass = loading && !leaving ? 'native-scroll-bottom-btn--loading' : ''
  return (
    <button
      onClick={onClick}
      className={`native-scroll-bottom-btn ${stateClass} ${loadingClass}`}
      title={
        loading ? 'Подгружаю свежие сообщения…'
        : activeUnread > 0 ? `К последнему сообщению (${activeUnread} непрочитано)`
        : 'К последнему сообщению'
      }
    >
      ↓
      {(activeUnread > 0 || newBelow > 0) && (
        <span className="native-scroll-bottom-badge">
          {formatUnreadCount(activeUnread > 0 ? activeUnread : newBelow, { exactUntil: 9999 })}
        </span>
      )}
    </button>
  )
}

export default function InboxChatPanel({
  // chat data
  store, activeChat, activeTopic, activeMessages, activeUnread, visibleMessages, renderItems, isTyping, messagesLoading,
  // v0.88.0: prefetch новых сообщений вниз (Telegram-style infinite scroll down)
  loadingNewer,
  // search/pin/toast/forward
  pinnedMsg, setPinnedMsg, showMsgSearch, setShowMsgSearch, msgSearch, setMsgSearch,
  // input
  input, setInput, sending, replyTo, setReplyTo, editTarget, setEditTarget,
  handleInputChange, handleReplySend, handlePaste,
  // scroll
  msgsScrollRef, handleScroll, scrollDiag, dragOver, handleDragOver, handleDragLeave, handleDrop,
  chatReady, atBottom, newBelow, scrollToBottom, scrollToMessage,
  // v0.94.0: imperative API (scrollToRow + getter element) — теперь обычный DOM scroll
  virtualListRef,
  // v0.94.0: virtuoso* props УДАЛЕНЫ — виртуализация убрана.
  // message actions
  handleDelete, handleForward, handlePin, openPhotoWindow, getMessage, readByVisibility,
  // v0.95.29: реакции
  onSetReaction,
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
  // v0.95.2: переменные showFreshUnreadWindowInfo/unreadLoaded/unreadTotal удалены
  // вместе с UnreadProgressPill. Кнопка ↓ с бейджем activeUnread достаточна.

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
        padding: '10px 16px', borderBottom: '1px solid var(--amoled-border)',
        background: 'var(--amoled-surface)', fontWeight: 600,
        display: 'flex', alignItems: 'center',
      }}>
        {/* v0.95.29: Telegram-style — аватарка чата 40x40 + статус под именем */}
        <ChatHeaderAvatar chat={activeChat} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeTopic ? (
            <>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTopic.title}</div>
              <div style={{ color: 'var(--amoled-text-muted)', fontSize: 12, fontWeight: 400 }}>в {activeChat.title}</div>
            </>
          ) : (
            <>
              <div style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{activeChat.title}</div>
              {/* v0.95.29: статус под именем — «в сети» / «был(а) в HH:MM» / «N участников» */}
              <div style={{
                color: isTyping ? 'var(--amoled-accent)' : 'var(--amoled-text-muted)',
                fontSize: 12, fontWeight: 400, marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {formatChatStatus(activeChat, { isTyping })}
              </div>
            </>
          )}
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
      {/* v0.95.5: pinned-блок перенесён в overlay внутри scroll-wrapper'а (см. ниже).
          Был flex-child над лентой — async загрузка через getPinnedMessage (50-500мс)
          толкала ленту вниз при появлении блока → «дёрг». Теперь position:absolute
          поверх верха ленты (как Telegram Web K _chatPinned.scss, WhatsApp Web). */}
      {showMsgSearch && (
        <div style={{ padding: 8, borderBottom: '1px solid var(--amoled-border)', background: 'var(--amoled-surface)' }}>
          <input type="text" placeholder="Поиск в этом чате..." value={msgSearch}
            onChange={e => setMsgSearch(e.target.value)} autoFocus style={{ width: '100%', fontSize: 13 }} />
          {msgSearch && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--amoled-text-dim)' }}>Найдено: {visibleMessages.length}</div>}
        </div>
      )}
      {/* v0.87.36: wrapper relative — кнопка ↓ вне scroll-контейнера + overlay-shimmer */}
      {/* v0.94.4: широкий блок «N из M» убран — перенесён в пилюлю-облачко у кнопки ↓ (см. ниже) */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* v0.87.66: overlay-shimmer пока !chatReady — initial-scroll прыжок не виден */}
        {/* v0.87.118: overlay также при загрузке поверх кэша (1 старое сообщение → синяя полоска) */}
        {/* v0.89.37: убрано visibleMessages.length>0 — на первой загрузке топика */}
        {/* messages=0, overlay не показывался → юзер видел чёрный фон 500-600мс. */}
        {/* Теперь skeleton-overlay показывается сразу при клике (как Telegram/WhatsApp). */}
        {/* v0.95.18: НЕ показывать shimmer overlay в форуме без выбранной темы —
            юзер видел бы бегущую полосу при каждом TDLib update [forum-map]. Вместо
            shimmer показываем ForumTopicEmptyState (см. ниже). */}
        <MessageListOverlay
          show={!(activeChat?.isForum && !activeTopic) && ((!chatReady) || !!messagesLoading)}
          hasContent={visibleMessages.length > 0}
        />
        {/* v0.95.5: pinned overlay (см. PinnedMessageBar.jsx). Виден только при
            chatReady — не наслаивается на shimmer overlay. */}
        {chatReady && <PinnedMessageBar pinnedMsg={pinnedMsg} onClose={() => setPinnedMsg(null)} />}
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
            // v0.95.18: для форум-чата без выбранной темы — красивый empty state с иконкой
            // 📚 и подсказкой в центре окна (вместо тонкого «Выберите тему слева»).
            activeChat?.isForum && !activeTopic ? (
              <ForumTopicEmptyState />
            ) : messagesLoading ? (
              <MessageSkeleton count={5} />
            ) : (
              <div style={{ color: 'var(--amoled-text-dim)', textAlign: 'center', padding: 20 }}>
                {msgSearch ? 'Ничего не найдено' : 'Нет сообщений'}
              </div>
            )
          ) : (
            <VirtualMessageList
              listRef={effectiveListRef}
              renderItems={renderItems}
              rowContext={{
                store, readRoot: scrollElement,
                setReplyTo, setEditTarget, setInput,
                handleDelete, handleForward, handlePin,
                openPhotoWindow, getMessage, readByVisibility, scrollToMessage,
                onSetReaction,  // v0.95.29
              }}
              onScroll={handleScroll}
              onWheel={() => scrollDiag.markUserScroll('wheel')}
              onTouchStart={() => scrollDiag.markUserScroll('touch')}
              onPointerDown={() => scrollDiag.markUserScroll('pointer')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
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
        {/* v0.95.6: один клик = всегда в самый низ (Telegram-style). Убран onDoubleClick. */}
        {/* v0.95.8: useDelayedUnmount → плавная exit-анимация (как Telegram Web K
            .bubbles-corner-button). visible=false → класс --leaving (opacity:0 +
            translateY+scale) на 220мс → unmount. На появление — bouncy spring overshoot. */}
        <ScrollBottomButton
          visible={!atBottom || activeUnread > 0}
          onClick={scrollToBottom}
          activeUnread={activeUnread}
          newBelow={newBelow}
          loading={!!loadingNewer}
        />
        {/* v0.95.2: UnreadProgressPill удалён — бейдж кнопки достаточен. */}
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
