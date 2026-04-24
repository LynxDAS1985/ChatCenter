// v0.87.15: пузырёк сообщения — текст, медиа, reply, edit, меню действий.
// v0.87.27: onPhotoOpen (клик → PhotoViewer), onReplyClick (клик по reply-цитате →
// scroll к оригиналу), data-msg-id (для внешнего скролла), LinkPreview для ссылок.
import { useState, useEffect, useRef } from 'react'
import FormattedText from './FormattedText.jsx'
import LinkPreview from './LinkPreview.jsx'
import VideoTile from './VideoTile.jsx'
import { useReadOnScrollAway } from '../hooks/useReadOnScrollAway.js'
import { logNativeScroll } from '../utils/scrollDiagnostics.js'

export default function MessageBubble({
  m, chatId, onReply, onEdit, onDelete, onForward, onPin, onVisible,
  downloadMedia, getMessage, onPhotoOpen, onReplyClick,
}) {
  const [menu, setMenu] = useState(false)
  const [mediaUrl, setMediaUrl] = useState(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const ref = useRef(null)

  // v0.87.43: Вариант 5 — Msg помечается прочитанным ТОЛЬКО когда:
  //   1. Полностью виден (≥95%) → помечен seen
  //   2. Потом ушёл ВЫШЕ viewport → onRead
  // Защита от "промелькнувшее ≠ прочитанное" при fast-scroll и initial render.
  useReadOnScrollAway({
    elementRef: ref,
    enabled: !!onVisible,
    onRead: () => onVisible?.(m),
  })

  // v0.87.23: ВОЗВРАТ — полное фото (не thumb). Как было до v0.87.22.
  const handleDownload = async () => {
    if (mediaUrl || mediaLoading) return
    setMediaLoading(true)
    try {
      const r = await downloadMedia(chatId, m.id, false)  // thumb=false = полное
      if (r?.ok) setMediaUrl(r.path)
    } finally { setMediaLoading(false) }
  }

  useEffect(() => {
    if (m.mediaType === 'photo' && !mediaUrl) handleDownload()
  }, [m.id])

  // v0.87.61: ДИАГНОСТИКА ширины bubble и parent chain.
  // Баг: в группах исходящие и входящие рендерятся в узкий столбик (каждая буква
  // на своей строке). В приватных — нормально. Лог поможет увидеть живой DOM —
  // какая ширина у bubble, у parent group, group-row, scroll-container.
  // Фильтры: лог только для msg с коротким text (<20 символов) и без media —
  // чтобы не спамить на больших чатах.
  useEffect(() => {
    if (!ref.current) return
    const hasText = m.text && m.text.length > 0 && m.text.length < 40
    if (!hasText || hasMedia) return
    // Небольшая задержка чтобы layout устаканился после mount
    const t = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const inner = el.firstChild  // .native-msg-sent > div:first-child == сам bubble
      const group = el.closest('.native-msg-group')
      const groupRow = el.closest('.native-msg-group-row')
      const scrollEl = el.closest('[data-scroll-container="true"]') || groupRow?.parentElement
      logNativeScroll('bubble-width-diag', {
        msgId: m.id,
        text: m.text.slice(0, 20),
        isOutgoing: m.isOutgoing,
        // Ширины
        bubbleW: el.clientWidth,
        innerW: inner?.clientWidth || 0,
        groupW: group?.clientWidth || 0,
        groupRowW: groupRow?.clientWidth || 0,
        scrollW: scrollEl?.clientWidth || 0,
        // Вычисленные стили
        bubbleMaxWidth: el.style.maxWidth,
        bubbleMinWidth: el.style.minWidth,
        groupFlex: group?.style?.flex || getComputedStyle(group || document.body).flex,
        groupRowFlexDir: groupRow?.style?.flexDirection || '',
        hasAuthor: !!groupRow?.querySelector('.native-msg-author'),
        hasAvatar: !!groupRow?.querySelector('.native-msg-avatar'),
      })
    }, 50)
    return () => clearTimeout(t)
  }, [m.id])

  const replyToMsg = m.replyToId && getMessage ? getMessage(chatId, m.replyToId) : null

  // v0.87.26: для сообщений с одиночным фото/видео без/с коротким текстом — фиксированная
  // минимальная ширина чтобы bubble не схлопывался до крохотного размера.
  const hasMedia = m.mediaType === 'photo' || m.mediaType === 'video'
  const bubbleMinWidth = hasMedia ? 280 : 'auto'
  // v0.87.59: класс неоновой анимации "только что отправлено" — активен 1.2с
  // для исходящих сообщений не старше 2 секунд от текущего момента.
  const isJustSent = m.isOutgoing && m.timestamp && (Date.now() - m.timestamp < 2000)

  return (
    <div ref={ref} data-msg-id={m.id}
      className={isJustSent ? 'native-msg-sent' : undefined}
      style={{
      alignSelf: m.isOutgoing ? 'flex-end' : 'flex-start',
      maxWidth: hasMedia ? 'min(420px, 65%)' : '65%',
      minWidth: bubbleMinWidth,
      position: 'relative',
    }}
      onMouseEnter={() => setMenu(true)}
      onMouseLeave={() => setMenu(false)}
    >
      <div style={{
        padding: hasMedia ? 4 : '8px 12px', borderRadius: 12,
        background: m.isOutgoing ? 'var(--amoled-accent)' : 'var(--amoled-surface-hover)',
        color: m.isOutgoing ? '#fff' : 'var(--amoled-text)',
        fontSize: 14, wordBreak: 'break-word',
        // v0.87.24: тонкая рамка для разграничения + glow на своих
        border: m.isOutgoing ? 'none' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: m.isOutgoing ? '0 0 12px rgba(42,171,238,0.15)' : 'none',
      }}>
        {/* Reply цитата — v0.87.27 кликабельная, скролл к оригиналу */}
        {replyToMsg && (
          <div
            onClick={(e) => { e.stopPropagation(); onReplyClick?.(replyToMsg.id) }}
            style={{
              borderLeft: '3px solid rgba(255,255,255,0.4)',
              paddingLeft: 8,
              marginBottom: 4,
              marginLeft: hasMedia ? 8 : 0,
              marginRight: hasMedia ? 8 : 0,
              marginTop: hasMedia ? 6 : 0,
              fontSize: 12, opacity: 0.8,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
            title="Перейти к оригиналу"
          >
            ↪ {replyToMsg.text?.slice(0, 80) || '[медиа]'}
          </div>
        )}
        {/* v0.87.26: Медиа с stripped thumb — достаточный размер + правильный aspect */}
        {m.mediaType === 'photo' && (
          <div
            onClick={() => { if (mediaUrl) onPhotoOpen?.(mediaUrl) }}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: m.mediaWidth && m.mediaHeight ? `${m.mediaWidth} / ${m.mediaHeight}` : '4 / 3',
              minHeight: 180,
              maxHeight: 420,
              borderRadius: 8,
              marginBottom: m.text ? 6 : 0,
              overflow: 'hidden',
              background: m.strippedThumb ? `url("${m.strippedThumb}") center/cover no-repeat` : 'rgba(0,0,0,0.3)',
              cursor: mediaUrl ? 'zoom-in' : 'default',
            }}
          >
            {/* Полный фото поверх — fade-in когда загрузится */}
            {mediaUrl && (
              <img src={mediaUrl} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', animation: 'native-fadein 0.25s ease',
              }} />
            )}
            {/* Индикатор загрузки поверх thumb */}
            {!mediaUrl && mediaLoading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: 11,
              }}>
                <span className="native-spinner" />
              </div>
            )}
          </div>
        )}
        {m.mediaType === 'video' && (
          <VideoTile m={m} chatId={chatId} />
        )}
        {m.mediaType === 'audio' && (
          <div onClick={handleDownload} style={{ cursor: 'pointer', fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
            🎵 {m.mediaPreview || 'аудио'}
          </div>
        )}
        {m.mediaType === 'file' && (
          <div onClick={handleDownload} style={{ cursor: 'pointer', fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
            📎 {m.mediaPreview || 'файл'} {mediaUrl && '✓'}
          </div>
        )}
        {m.mediaType === 'location' && <div style={{ fontSize: 12, opacity: 0.7 }}>📍 геолокация</div>}
        {m.mediaType === 'contact' && <div style={{ fontSize: 12, opacity: 0.7 }}>👤 контакт</div>}
        {m.mediaType === 'poll' && <div style={{ fontSize: 12, opacity: 0.7 }}>📊 опрос</div>}

        {m.text && <div style={{
          whiteSpace: 'pre-wrap',
          padding: hasMedia ? '4px 8px 0' : 0,
        }}><FormattedText text={m.text} entities={m.entities} /></div>}

        {/* v0.87.27: превью ссылки — если есть webPage в сообщении */}
        {m.mediaType === 'link' && m.webPage && (
          <LinkPreview wp={m.webPage} isOutgoing={m.isOutgoing} />
        )}

        <div style={{
          fontSize: 10, opacity: 0.75, marginTop: 2, textAlign: 'right',
          padding: hasMedia ? '2px 8px 4px' : 0,
        }}>
          {m.isEdited && <span style={{ marginRight: 4 }}>ред.</span>}
          {new Date(m.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
          {/* v0.87.17: галочки прочитанности (только для исходящих) */}
          {m.isOutgoing && (
            <span style={{ marginLeft: 4, fontSize: 11 }} title={m.isRead ? 'Прочитано' : 'Отправлено'}>
              {m.isRead ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
      {/* Контекст-меню (при hover) */}
      {menu && (onReply || onEdit || onDelete) && (
        <div style={{
          position: 'absolute', top: -4,
          [m.isOutgoing ? 'left' : 'right']: -4,
          display: 'flex', gap: 2,
          background: 'var(--amoled-surface)',
          border: '1px solid var(--amoled-border)',
          borderRadius: 6, padding: 2,
        }}>
          <button onClick={() => onReply?.(m)} title="Ответить" style={miniBtn}>↪</button>
          {onForward && <button onClick={() => onForward(m)} title="Переслать" style={miniBtn}>➥</button>}
          {onPin && <button onClick={() => onPin(m)} title="Закрепить" style={miniBtn}>📌</button>}
          {m.isOutgoing && onEdit && <button onClick={() => onEdit(m)} title="Редактировать" style={miniBtn}>✏️</button>}
          {m.isOutgoing && onDelete && <button onClick={() => onDelete(m)} title="Удалить" style={{...miniBtn, color: 'var(--amoled-danger)'}}>🗑</button>}
        </div>
      )}
    </div>
  )
}

const miniBtn = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  padding: '2px 6px', fontSize: 12, color: 'var(--amoled-text)',
  borderRadius: 4,
}
