// v0.89.0: Виртуализация рендера сообщений через react-window 2.2.
//
// Заменяет старый renderItems.map(...) в InboxChatPanel: при больших чатах
// (4000+ сообщений в array) DOM держит только видимые ~20 rows + overscan,
// что даёт плавный 60 FPS скролл вместо лагов на старом рендере.
//
// API react-window 2.x (см. node_modules/react-window/dist/react-window.d.ts):
//   <List
//     rowCount={N}
//     rowHeight={useDynamicRowHeight({ defaultRowHeight: 70 })}
//     rowComponent={MessageRow}    ← компонент получает { index, style, ariaAttributes, ...rowProps }
//     rowProps={{ ... }}
//     listRef={ref}                ← imperative API: scrollToRow({ index, align }), get element
//     onRowsRendered={({ startIndex, stopIndex }) => ...}
//     style={{ height, width }}
//     overscanCount={3}
//   />
//
// Типы row из messageGrouping.js: 'day' | 'time' | 'unread' | 'group'.
// Все 4 рендерятся одинаково внутри MessageRow, react-window сам мерит высоту.
//
// IntersectionObserver для mark-read: продолжает работать. react-window рендерит
// видимые row в DOM, MessageBubble внутри row получает readRoot = scroll container.

import { forwardRef } from 'react'
import { List, useDynamicRowHeight } from 'react-window'
import MessageBubble from './MessageBubble.jsx'
import { AlbumBubble } from './MediaAlbum.jsx'
import { formatDayLabel } from '../utils/messageGrouping.js'

// v0.87.110: цвета аватарок отправителей в групповых чатах (от ChatListItem)
const SENDER_COLORS = ['#e17076','#eda86c','#a695e7','#7bc862','#65aadd','#ee7aae','#6ec9cb']
function senderColorFor(senderId) {
  const hash = Math.abs((senderId || '').split('').reduce((h, c) => (h + c.charCodeAt(0)) & 0xffffffff, 0))
  return SENDER_COLORS[hash % SENDER_COLORS.length]
}
function initialsFor(senderName) {
  if (!senderName) return '?'
  return senderName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

// Компонент row — рендерит один элемент renderItems.
// react-window 2.x передаёт { index, style, ariaAttributes, ...rowProps }.
// `style` обязательно применить к корневому элементу (position absolute + top/height
// от библиотеки) — иначе виртуализация сломается.
function MessageRow({ index, style, ariaAttributes, renderItems, rowContext }) {
  const item = renderItems[index]
  if (!item) return <div style={style} {...ariaAttributes} />

  if (item.type === 'day') {
    return (
      <div style={style} {...ariaAttributes} className="native-msg-day-row">
        <span className="native-msg-divider native-msg-divider--day">{formatDayLabel(item.day)}</span>
      </div>
    )
  }
  if (item.type === 'time') {
    return (
      <div style={style} {...ariaAttributes} className="native-msg-divider">
        {new Date(item.time).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
      </div>
    )
  }
  if (item.type === 'unread') {
    return (
      <div style={style} {...ariaAttributes} className="native-msg-unread-divider">
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
    <div style={style} {...ariaAttributes} className="native-msg-group-row" data-row-flex={item.isOutgoing ? 'row-reverse' : 'row'}>
      <div className="native-msg-row-inner" style={{
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

// Главный экспорт — обёртка над <List>.
// Принимает renderItems и весь контекст рендера через rowContext.
// listRef прокидывается наружу для scrollToRow / element getter.
const VirtualMessageList = forwardRef(function VirtualMessageList({
  renderItems,
  rowContext,
  onRowsRendered,
  listRef,
  // ключ для useDynamicRowHeight — меняется при смене чата, кэш сбрасывается
  cacheKey,
}, _ref) {
  // useDynamicRowHeight: react-window сам мерит реальную высоту row через ResizeObserver.
  // defaultRowHeight используется до первого измерения.
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 70, key: cacheKey })
  return (
    <List
      listRef={listRef}
      rowCount={renderItems.length}
      rowHeight={rowHeight}
      rowComponent={MessageRow}
      rowProps={{ renderItems, rowContext }}
      onRowsRendered={onRowsRendered}
      overscanCount={3}
      style={{ height: '100%', width: '100%' }}
    />
  )
})

export default VirtualMessageList
