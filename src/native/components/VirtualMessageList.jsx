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

import { useImperativeHandle, useRef } from 'react'
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

// Главный экспорт — drop-in замена с тем же API что и старый react-window VirtualMessageList.
//
// v0.92.1 ИСПРАВЛЕНИЕ: онScroll/onWheel/etc передаются НАПРЯМУЮ в <Virtuoso>, не через
// components.Scroller. По официальной доке Virtuoso (custom-scroll-container):
//   «The onScroll event handler is NOT directly passed to the Scroller component.
//    Instead, it's attached to the Virtuoso component itself.»
// Stream Chat React (production эталон) использует тот же паттерн через scrollerRef + Virtuoso props.
//
// listRef совместимость:
//   listRef.current.element            — root scroll DOM (через scrollerRef callback)
//   listRef.current.scrollToRow(config) — мост к virtuosoRef.scrollToIndex(config)
export default function VirtualMessageList({
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
  initialTopMostItemIndex,
  firstItemIndex = 0,
  startReached,
  endReached,
  // v0.92.6: restoreStateFrom УДАЛЁН — архитектурно сломан с key={cacheKey} ремаунтом.
  // useEffect cleanup (getState flush) срабатывает ПОСЛЕ unmount Virtuoso → snapshot
  // содержит scrollTop=0 нового instance. Production-эталоны (Stream Chat, Mattermost)
  // используют getState/restoreStateFrom БЕЗ key={...} — переиспользуют один Virtuoso instance.
  // У нас key={cacheKey} обязателен (разные чаты — разные heights/measurements).
  // Используем только initialTopMostItemIndex с align='end' (v0.92.3 паттерн) для restore.
}) {
  const virtuosoRef = useRef(null)
  const scrollerElementRef = useRef(null)

  // Мост к старому API — listRef.current.element + scrollToRow.
  // Геттер element берёт текущее значение ref → актуально даже после ремаунта Virtuoso.
  useImperativeHandle(listRef, () => ({
    get element() { return scrollerElementRef.current },
    scrollToRow: (config) => {
      try { virtuosoRef.current?.scrollToIndex(config) } catch (_) {}
    },
  }), [])

  // rangeChanged — аналог react-window onRowsRendered.
  // Virtuoso: {startIndex, endIndex}. Старый react-window: {startIndex, stopIndex}.
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
      // defaultItemHeight = 50 — ближе к реальной средней высоте, меньше «дёргания» при mount.
      defaultItemHeight={50}
      // increaseViewportBy ≈ overscan react-window (3 row × ~50px = 150px).
      increaseViewportBy={{ top: 150, bottom: 150 }}
      // v0.92.1: атомарные пороги — startReached/endReached не должны срабатывать
      // сразу при mount. Defaults 0 и 4 → endReached триггерил load-newer через 39мс
      // от chat-open (лог 16:07:52). 200px = разумный буфер.
      atTopThreshold={200}
      atBottomThreshold={200}
      // v0.92.1 КРИТИЧНО: scrollerRef callback — единственный способ получить DOM
      // root в Virtuoso. NOT useRef — Virtuoso выкинет error (issue #274).
      // Сохраняем в свой ref для listRef.element моста и для msgsScrollRef sync.
      scrollerRef={(el) => { scrollerElementRef.current = el }}
      // v0.92.1 КРИТИЧНО: DOM events ПРЯМО в <Virtuoso>, не в components.Scroller.
      // По официальной доке custom-scroll-container: onScroll attached to Virtuoso itself.
      // Virtuoso extends HTMLAttributes<HTMLDivElement> — эти props идут в root DOM.
      onScroll={onScroll}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onPointerDown={onPointerDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ height: '100%', width: '100%', ...style }}
    />
  )
}
