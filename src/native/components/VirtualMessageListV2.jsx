// v0.91.24 Day 1: Virtuoso-замена VirtualMessageList.jsx (изолированная).
//
// НЕ ПОДКЛЮЧЕНА НИГДЕ — рядом со старым файлом для безопасной миграции.
// План миграции: .memory-bank/virtuoso-migration-plan.md.
//
// Цель — drop-in замена со ВСЕМ API старого VirtualMessageList:
//   listRef.current.element            → root DOM (для msgsScrollRef sync)
//   listRef.current.scrollToRow({...}) → имитация react-window API
//   onRowsRendered({startIndex, stopIndex})
//   onScroll / onWheel / onTouchStart / onPointerDown / onDragOver / ...
//   cacheKey (для reset при смене чата)
//
// Почему миграция нужна:
//   - react-window 2.2.7 + useDynamicRowHeight не может надёжно скроллить к
//     далёкому target row (issue #216 / #6 открыты с 2019). См. saga.
//   - Virtuoso (MIT) имеет встроенные firstItemIndex / initialTopMostItemIndex /
//     startReached / endReached для нашего use case.
//
// Что МЕНЯЕТСЯ в Day 2:
//   - load-older уходит в startReached callback
//   - load-newer уходит в endReached callback
//   - restore позиции через initialTopMostItemIndex
//
// Что НЕ МЕНЯЕТСЯ:
//   - MessageRow (DOM-агностик, дублирован ниже до Day 4 — потом удалим старый файл)
//   - IntersectionObserver mark-read — работает на DOM rows
//   - Группировка messageGrouping.js

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Virtuoso } from 'react-virtuoso'
import MessageBubble from './MessageBubble.jsx'
import { AlbumBubble } from './MediaAlbum.jsx'
import { formatDayLabel } from '../utils/messageGrouping.js'

// Цвета аватарок (копия из VirtualMessageList.jsx до Day 4)
const SENDER_COLORS = ['#e17076','#eda86c','#a695e7','#7bc862','#65aadd','#ee7aae','#6ec9cb']
function senderColorFor(senderId) {
  const hash = Math.abs((senderId || '').split('').reduce((h, c) => (h + c.charCodeAt(0)) & 0xffffffff, 0))
  return SENDER_COLORS[hash % SENDER_COLORS.length]
}
function initialsFor(senderName) {
  if (!senderName) return '?'
  return senderName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

// Row компонент — рендерит один элемент renderItems.
// Virtuoso передаёт (index, item) через itemContent prop, поэтому здесь
// принимаем оба, в отличие от react-window {index, style, ariaAttributes}.
//
// КРИТИЧНО: padding не margin (Virtuoso ResizeObserver measure contentRect
// без margin → margin ломает scrollHeight). См. virtuoso-migration-plan.md.
function MessageRow({ item, rowContext }) {
  const baseRowStyle = {
    width: '100%',
    paddingLeft: 16,
    paddingRight: 16,
    boxSizing: 'border-box',
  }
  if (!item) return <div style={{ ...baseRowStyle, paddingBottom: 6 }} />

  if (item.type === 'day') {
    return (
      <div style={{
        ...baseRowStyle,
        paddingTop: 14, paddingBottom: 6,
        display: 'flex', alignItems: 'center', gap: 10,
      }} className="native-msg-day-row">
        <span className="native-msg-divider native-msg-divider--day" style={{ margin: 0 }}>
          {formatDayLabel(item.day)}
        </span>
      </div>
    )
  }
  if (item.type === 'time') {
    return (
      <div style={{
        ...baseRowStyle,
        paddingTop: 14, paddingBottom: 6,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
      }}>
        <span className="native-msg-divider" style={{ margin: 0 }}>
          {new Date(item.time).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    )
  }
  if (item.type === 'unread') {
    return (
      <div style={{
        ...baseRowStyle,
        paddingTop: 14, paddingBottom: 6,
        display: 'flex', alignItems: 'center', gap: 10,
        margin: 0,
      }} className="native-msg-unread-divider">
        <span>Новые сообщения</span>
      </div>
    )
  }

  // type === 'group'
  const {
    store, readRoot,
    setReplyTo, setEditTarget, setInput,
    handleDelete, handleForward, handlePin,
    openPhotoWindow, getMessage, readByVisibility, scrollToMessage,
  } = rowContext
  const senderBg = senderColorFor(item.senderId)
  const senderAvatar = !item.isOutgoing ? item.senderAvatar : null
  return (
    <div style={{ ...baseRowStyle, paddingBottom: 6 }} className="native-msg-group-row">
      <div style={{
        display: 'flex',
        flexDirection: item.isOutgoing ? 'row-reverse' : 'row',
        alignItems: 'flex-end', gap: 8, width: '100%',
      }}>
        {!item.isOutgoing && (
          <div className="native-msg-avatar" style={{
            background: senderAvatar ? `url("${senderAvatar}") center/cover no-repeat` : senderBg,
          }}>
            {!senderAvatar && initialsFor(item.senderName)}
          </div>
        )}
        <div className="native-msg-group" style={{
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
                readRoot={readRoot}
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
                readRoot={readRoot}
                onPhotoOpen={openPhotoWindow}
                onReplyClick={scrollToMessage}
              />
            )
          ))}
        </div>
      </div>
    </div>
  )
}

// Главный экспорт — drop-in замена VirtualMessageList с тем же API.
//
// listRef совместимость:
//   listRef.current.element            — root scroll DOM (через Virtuoso scrollerRef)
//   listRef.current.scrollToRow(config) — мост к virtuosoRef.scrollToIndex(config)
//
// onScroll / onWheel / onTouchStart / onPointerDown / onDragOver / onDragLeave / onDrop
//   — через components.Scroller (кастомный wrapper Virtuoso outermost div).
export default function VirtualMessageListV2({
  renderItems,
  rowContext,
  onRowsRendered,
  listRef,
  cacheKey,
  onScroll,
  onWheel,
  onTouchStart,
  onPointerDown,
  onDragOver,
  onDragLeave,
  onDrop,
  style,
  // v0.91.24 Day 2 props (БУДУТ использованы при интеграции в InboxChatPanel):
  //   initialTopMostItemIndex — стартовая позиция
  //   firstItemIndex          — для prepend (load-older)
  //   startReached            — callback load-older
  //   endReached              — callback load-newer
  initialTopMostItemIndex,
  firstItemIndex = 0,
  startReached,
  endReached,
}) {
  const virtuosoRef = useRef(null)
  const scrollerElementRef = useRef(null)

  // Мост к старому API — listRef.current.element + scrollToRow
  useImperativeHandle(listRef, () => ({
    get element() { return scrollerElementRef.current },
    scrollToRow: (config) => {
      try { virtuosoRef.current?.scrollToIndex(config) } catch (_) {}
    },
  }), [])

  // Кастомный Scroller — пропускает DOM events родителю, сохраняет ref на DOM.
  // Определён внутри функции но НЕ inline — обёрнут через useRef для стабильности.
  // Virtuoso troubleshooting: «Components defined inline inside render functions
  // trigger React to treat them as new types» → ремаунт. Через useRef избежим этого.
  const ScrollerRef = useRef(null)
  if (!ScrollerRef.current) {
    ScrollerRef.current = forwardRef(function Scroller(props, ref) {
      const setRef = (el) => {
        scrollerElementRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }
      return (
        <div
          {...props}
          ref={setRef}
          onScroll={(e) => { onScroll?.(e); props.onScroll?.(e) }}
          onWheel={(e) => { onWheel?.(e); props.onWheel?.(e) }}
          onTouchStart={(e) => { onTouchStart?.(e); props.onTouchStart?.(e) }}
          onPointerDown={(e) => { onPointerDown?.(e); props.onPointerDown?.(e) }}
          onDragOver={(e) => { onDragOver?.(e); props.onDragOver?.(e) }}
          onDragLeave={(e) => { onDragLeave?.(e); props.onDragLeave?.(e) }}
          onDrop={(e) => { onDrop?.(e); props.onDrop?.(e) }}
        />
      )
    })
  }

  // rangeChanged — аналог react-window onRowsRendered.
  // Virtuoso: {startIndex, endIndex}. Старый: {startIndex, stopIndex}.
  // Мост: stopIndex = endIndex.
  const handleRangeChanged = (range) => {
    onRowsRendered?.({ startIndex: range.startIndex, stopIndex: range.endIndex })
  }

  return (
    <Virtuoso
      key={cacheKey}
      ref={virtuosoRef}
      data={renderItems}
      itemContent={(_index, item) => <MessageRow item={item} rowContext={rowContext} />}
      initialTopMostItemIndex={initialTopMostItemIndex}
      firstItemIndex={firstItemIndex}
      startReached={startReached}
      endReached={endReached}
      rangeChanged={handleRangeChanged}
      // skipAnimationFrameInResizeObserver: рекомендация troubleshooting docs
      // против "Reverse Scrolling Flickering with Dynamic Heights" (discussion #1083).
      skipAnimationFrameInResizeObserver
      // defaultItemHeight = 50 — то же что было в react-window useDynamicRowHeight,
      // меньше «дёргания» при первом mount (ближе к реальной средней высоте).
      defaultItemHeight={50}
      // increaseViewportBy = overscan react-window (3 row × ~50 = 150px)
      increaseViewportBy={{ top: 150, bottom: 150 }}
      components={{ Scroller: ScrollerRef.current }}
      style={{ height: '100%', width: '100%', ...style }}
    />
  )
}
