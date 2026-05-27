// v0.94.0: ВИРТУАЛИЗАЦИЯ УДАЛЕНА. Рендер всех сообщений обычным DOM (renderItems.map).
//
// История:
//   v0.89.0  — react-window 2.2 (виртуализация)
//   v0.92.0  — миграция на react-virtuoso (из-за scroll restore issue #216)
//   v0.94.0  — ПОЛНОЕ удаление виртуализации
//
// Почему убрали виртуализацию (23 версии саги scroll-restore):
//   Виртуализация (react-window / Virtuoso) НЕСОВМЕСТИМА с pixel-perfect scroll
//   restore. Обе сбрасывают измерения высот при ремаунте (key={chatId}), из-за чего
//   scrollHeight скачет → restore промахивается. Telegram Web K (tweb) НЕ виртуализует
//   — рендерит все msgs в DOM. У нас обычно 100-300 msgs в активной памяти (load по 50),
//   обычный DOM это тянет без тормозов.
//
// Что даёт обычный DOM:
//   - scrollHeight стабильный (DOM сам считает реальные размеры)
//   - scrollTop сохраняется в пикселях, restore = el.scrollTop = saved (мгновенно, точно)
//   - overflow-anchor: auto — браузер сам держит позицию при prepend (load-older)
//   - НЕТ align/offset/anchor/snapshot — никаких прилипаний и выравниваний
//
// listRef API (для msgsScrollRef sync + scroll-to-reply):
//   listRef.current.element            → root scroll DOM
//   listRef.current.scrollToRow({index, align}) → el.children[0].children[index].scrollIntoView
//
// MessageRow, IntersectionObserver mark-read, группировка messageGrouping.js — не меняются.

import { useImperativeHandle, useRef } from 'react'
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

// Главный экспорт — обычный DOM-скролл контейнер (БЕЗ виртуализации, v0.94.0).
//
// listRef API:
//   listRef.current.element            — root scroll DOM (msgsScrollRef sync)
//   listRef.current.scrollToRow({index, align}) — scroll к row через scrollIntoView
//
// scroll-контейнер: один <div> с overflow-y:auto + overflow-anchor:auto.
// overflow-anchor:auto — браузер САМ держит видимую позицию когда контент
// добавляется выше viewport (load-older prepend). Это убирает необходимость
// в ручной scrollTop коррекции (которая была источником прыжков в react-window).
export default function VirtualMessageList({
  renderItems,
  rowContext,
  listRef,
  onScroll,
  onWheel,
  onTouchStart,
  onPointerDown,
  onDragOver,
  onDragLeave,
  onDrop,
  style,
  // v0.94.0: cacheKey, onRowsRendered, initialTopMostItemIndex, firstItemIndex,
  // startReached, endReached — БОЛЬШЕ НЕ ПРИНИМАЮТСЯ (виртуализация удалена).
  // load-older/load-newer — через useInboxScroll handleScroll (DOM scrollTop триггеры).
}) {
  const scrollerRef = useRef(null)
  const innerRef = useRef(null)

  // Мост к старому API: element + scrollToRow.
  // scrollToRow ищет row по индексу среди детей inner-контейнера и scrollIntoView.
  useImperativeHandle(listRef, () => ({
    get element() { return scrollerRef.current },
    scrollToRow: ({ index, align } = {}) => {
      try {
        const row = innerRef.current?.children?.[index]
        if (!row) return
        const block = align === 'end' ? 'end' : align === 'center' ? 'center' : 'start'
        row.scrollIntoView({ block, behavior: 'auto' })
      } catch (_) {}
    },
  }), [])

  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onPointerDown={onPointerDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        height: '100%', width: '100%',
        overflowY: 'auto', overflowX: 'hidden',
        // v0.94.0: браузерное scroll anchoring — держит позицию при prepend (load-older).
        overflowAnchor: 'auto',
        ...style,
      }}
    >
      <div ref={innerRef}>
        {renderItems.map((item, idx) => (
          <MessageRow key={item?.key || idx} item={item} rowContext={rowContext} />
        ))}
      </div>
    </div>
  )
}
