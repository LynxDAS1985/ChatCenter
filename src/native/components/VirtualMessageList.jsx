// v0.89.0: Виртуализация рендера сообщений через react-window 2.2.
//
// Заменяет старый renderItems.map(...) в InboxChatPanel: при больших чатах
// (4000+ сообщений) DOM держит только видимые ~20 rows + overscan,
// что даёт плавный 60 FPS скролл вместо лагов на старом рендере.
//
// API react-window 2.x (см. node_modules/react-window/dist/react-window.d.ts):
//   <List
//     rowCount={N}
//     rowHeight={useDynamicRowHeight({ defaultRowHeight: 70 })}
//     rowComponent={MessageRow}
//     rowProps={{ ... }}
//     listRef={ref}                ← imperative API: scrollToRow({ index, align }), get element
//     onRowsRendered={({ startIndex, stopIndex }) => ...}
//     style={{ height, width }}
//     overscanCount={3}
//     ...HTMLAttributes              ← onScroll, onWheel, onDragOver и т.п. ложатся на outer <div>
//   />
//
// Типы row из messageGrouping.js: 'day' | 'time' | 'unread' | 'group'.
// Все 4 рендерятся одинаково внутри MessageRow, react-window сам мерит высоту
// через useDynamicRowHeight (ResizeObserver под капотом).
//
// IntersectionObserver для mark-read: продолжает работать. react-window рендерит
// видимые row в DOM, MessageBubble/AlbumBubble внутри row получают readRoot
// = listRef.current.element (outermost div, который скроллит react-window).

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
// `style` обязательно применить к корневому элементу (position absolute + top + height
// от библиотеки) — иначе виртуализация сломается.
//
// КРИТИЧНО для divider-строк (day/time/unread):
//   - react-window даёт row только position:absolute + top + height (БЕЗ width 100%).
//     Width=auto = content-sized → divider схлопывается под pill, теряется горизонтальное
//     центрирование, которое раньше работало через `align-self: center` в flex-column.
//   - CSS-классы дивайдеров используют `margin: 14px 0 6px` — но ResizeObserver измеряет
//     border-box БЕЗ margin → следующий row наезжает на margin предыдущего ⇒ дивайдер
//     визуально склеивается со следующим именем отправителя.
//   - Решение: на wrapper-row ставим явный width: '100%' + display:flex justifyContent:center
//     + переносим margin → padding (попадает в border-box, учитывается ResizeObserver).
//     На самом divider'е обнуляем margin inline чтобы не было двойного отступа.
//
// defaultRowHeight 50 (а не 70): дивайдеры реально ~25-30px, короткие сообщения ~40-60px.
// Меньшая дельта между defaultRowHeight и реальной после ResizeObserver = меньше
// «дёргания» scrollTop на лету (см. log `top=8831 → 8733` — откат на 100px при скролле).
function MessageRow({ index, style, ariaAttributes, renderItems, rowContext }) {
  const item = renderItems[index]
  // Базовый row-wrapper: гарантирует ширину 100% и horizontal padding.
  // Для каждого типа добавляем свои padding-top/bottom (вместо CSS margin) и flex.
  const baseRowStyle = {
    ...style,
    width: '100%',
    paddingLeft: 16,
    paddingRight: 16,
    boxSizing: 'border-box',
  }
  if (!item) return <div style={{ ...baseRowStyle, paddingBottom: 6 }} {...ariaAttributes} />

  if (item.type === 'day') {
    return (
      <div style={{
        ...baseRowStyle,
        paddingTop: 14, paddingBottom: 6,
        display: 'flex', alignItems: 'center', gap: 10,
      }} {...ariaAttributes} className="native-msg-day-row">
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
      }} {...ariaAttributes}>
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
        margin: 0,  // CSS-класс добавляет margin, который не учитывает ResizeObserver
      }} {...ariaAttributes} className="native-msg-unread-divider">
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
    <div style={{ ...baseRowStyle, paddingBottom: 6 }} {...ariaAttributes} className="native-msg-group-row">
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

// Главный экспорт — обёртка над <List>.
// Принимает renderItems и весь контекст рендера через rowContext.
// listRef прокидывается наружу для scrollToRow / element getter.
// onScroll/onWheel/onTouchStart/onPointerDown/onDrag* ложатся на outer <div>
// react-window через ...rest (List принимает HTMLAttributes<HTMLDivElement>).
export default function VirtualMessageList({
  renderItems,
  rowContext,
  onRowsRendered,
  listRef,
  // ключ для useDynamicRowHeight — меняется при смене чата, кэш сбрасывается
  cacheKey,
  // прокидываемые DOM-события на outer scroll-контейнер react-window
  onScroll,
  onWheel,
  onTouchStart,
  onPointerDown,
  onDragOver,
  onDragLeave,
  onDrop,
  style,
}) {
  // useDynamicRowHeight: react-window сам мерит реальную высоту row через ResizeObserver.
  // defaultRowHeight — высота до первого измерения. Поставил 50 (ближе к средней реальной)
  // вместо 70: меньше дельта между «до measure» и «после» → меньше «дёргания» scrollTop.
  // По логам v0.89.0 при 70 наблюдался откат scrollTop на ~100px в момент measure.
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 50, key: cacheKey })
  return (
    <List
      listRef={listRef}
      rowCount={renderItems.length}
      rowHeight={rowHeight}
      rowComponent={MessageRow}
      rowProps={{ renderItems, rowContext }}
      onRowsRendered={onRowsRendered}
      overscanCount={3}
      // overflowAnchor: 'none' — отключает браузерное scroll anchoring.
      // Иначе при prepend (load-older) Chrome пытается «удержать видимый якорь»,
      // а наша ручная формула `scrollTop = scrollHeight - prevHeight` в useInboxScroll
      // дерётся с ним → юзер уезжает в середину чата (Ловушка 48 в mistakes/native-scroll-unread.md).
      style={{ height: '100%', width: '100%', overflowAnchor: 'none', ...style }}
      onScroll={onScroll}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onPointerDown={onPointerDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    />
  )
}
