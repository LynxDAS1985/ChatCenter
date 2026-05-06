// v0.87.15: пузырёк сообщения — текст, медиа, reply, edit, меню действий.
// v0.87.27: onPhotoOpen (клик → PhotoViewer), onReplyClick (клик по reply-цитате →
// scroll к оригиналу), data-msg-id (для внешнего скролла), LinkPreview для ссылок.
// v0.87.118: цвета отправителей, тултип на reply-цитате, кнопки НАД сообщением, fwdFrom.
import { useState, useEffect, useRef } from 'react'
import FormattedText from './FormattedText.jsx'
import LinkPreview from './LinkPreview.jsx'
import VideoTile from './VideoTile.jsx'
import { useReadOnScrollAway } from '../hooks/useReadOnScrollAway.js'

// v0.87.118: цвета отправителей — детерминированы по senderId (как в Telegram).
// Один отправитель всегда получает один цвет во всех чатах.
const SENDER_COLORS = ['#E17076','#7BC862','#65AADD','#EE7AAE','#AA77B2','#6EC9CB','#FAA774']
function getSenderColor(senderId) {
  return SENDER_COLORS[Math.abs(parseInt(senderId) || 0) % SENDER_COLORS.length]
}

export default function MessageBubble({
  m, chatId, onReply, onEdit, onDelete, onForward, onPin, onVisible,
  downloadMedia, getMessage, onPhotoOpen, onReplyClick,
}) {
  const [menu, setMenu] = useState(false)
  const [mediaUrl, setMediaUrl] = useState(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [replyHover, setReplyHover] = useState(false)  // v0.87.118: тултип цитаты
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

  const replyToMsg = m.replyToId && getMessage ? getMessage(chatId, m.replyToId) : null

  // v0.87.26: для сообщений с одиночным фото/видео без/с коротким текстом — фиксированная
  // минимальная ширина чтобы bubble не схлопывался до крохотного размера.
  const hasMedia = m.mediaType === 'photo' || m.mediaType === 'video'

  // v0.87.65: неоновая анимация отправки через useEffect (mount-only).
  useEffect(() => {
    if (!ref.current || !m.isOutgoing) return
    const sentAt = m.localSentAt || m.timestamp || 0
    if (!sentAt || (Date.now() - sentAt) > 3000) return
    ref.current.classList.add('native-msg-sent')
    const t = setTimeout(() => { ref.current?.classList.remove('native-msg-sent') }, 1600)
    return () => clearTimeout(t)
  }, [])

  // v0.87.118: цвет отправителя цитаты
  const replyColor = replyToMsg ? getSenderColor(replyToMsg.senderId) : null

  return (
    // v0.87.62 final: bubble content-sized (width: auto), max ограничен parent group
    <div ref={ref} data-msg-id={m.id}
      style={{
        alignSelf: m.isOutgoing ? 'flex-end' : 'flex-start',
        maxWidth: hasMedia ? 420 : '100%',
        minWidth: hasMedia ? 280 : 'auto',
        width: 'auto',
        position: 'relative',
      }}
      onMouseEnter={() => setMenu(true)}
      onMouseLeave={() => { setMenu(false); setReplyHover(false) }}
    >
      {/* v0.87.118: кнопки НАД сообщением — не закрывают текст */}
      {menu && (onReply || onEdit || onDelete) && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 3px)',
          [m.isOutgoing ? 'left' : 'right']: 0,
          display: 'flex', gap: 2, zIndex: 20,
          background: 'rgba(18,18,18,0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '3px 4px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
        }}>
          <button onClick={() => onReply?.(m)} title="Ответить" style={miniBtn}>↪</button>
          {onForward && <button onClick={() => onForward(m)} title="Переслать" style={miniBtn}>➥</button>}
          {onPin && <button onClick={() => onPin(m)} title="Закрепить" style={miniBtn}>📌</button>}
          {m.isOutgoing && onEdit && <button onClick={() => onEdit(m)} title="Редактировать" style={miniBtn}>✏️</button>}
          {m.isOutgoing && onDelete && <button onClick={() => onDelete(m)} title="Удалить" style={{...miniBtn, color: 'var(--amoled-danger)'}}>🗑</button>}
        </div>
      )}

      <div style={{
        padding: hasMedia ? 4 : '8px 12px', borderRadius: 12,
        background: m.isOutgoing ? 'var(--amoled-accent)' : 'var(--amoled-surface-hover)',
        color: m.isOutgoing ? '#fff' : 'var(--amoled-text)',
        fontSize: 14, wordBreak: 'break-word',
        border: m.isOutgoing ? 'none' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: m.isOutgoing ? '0 0 12px rgba(42,171,238,0.15)' : 'none',
      }}>
        {/* v0.87.118: пересланное сообщение — красивый заголовок как в Telegram */}
        {m.fwdFrom && (
          <div style={{
            fontSize: 11, marginBottom: 4, fontStyle: 'italic',
            marginLeft: hasMedia ? 8 : 0, marginRight: hasMedia ? 8 : 0,
            marginTop: hasMedia ? 6 : 0,
            display: 'flex', alignItems: 'center', gap: 4,
            color: 'var(--amoled-text-dim)',
          }}>
            <span>↪ Переслано от</span>
            <span style={{
              fontWeight: 700, fontStyle: 'normal',
              color: getSenderColor(m.fwdFrom.id || m.fwdFrom.name),
            }}>{m.fwdFrom.name || 'неизвестно'}</span>
          </div>
        )}

        {/* v0.87.118: Reply цитата — цветная полоска + имя + тултип на hover */}
        {replyToMsg && (
          <div style={{
            position: 'relative',
            marginBottom: 6,
            marginLeft: hasMedia ? 8 : 0, marginRight: hasMedia ? 8 : 0,
            marginTop: hasMedia ? 6 : 0,
          }}>
            <div
              onClick={(e) => { e.stopPropagation(); onReplyClick?.(replyToMsg.id) }}
              onMouseEnter={() => setReplyHover(true)}
              onMouseLeave={() => setReplyHover(false)}
              style={{
                borderLeft: `3px solid ${replyColor}`,
                paddingLeft: 8, paddingTop: 3, paddingBottom: 3,
                borderRadius: '0 4px 4px 0',
                background: 'rgba(255,255,255,0.06)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: replyColor, marginBottom: 2 }}>
                {replyToMsg.senderName || 'Сообщение'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                {replyToMsg.mediaType && !replyToMsg.text ? `[${replyToMsg.mediaType}]` : (replyToMsg.text?.slice(0, 100) || '[медиа]')}
              </div>
            </div>
            {/* v0.87.118: тултип с полным текстом при наведении на цитату */}
            {replyHover && replyToMsg.text && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 6px)',
                [m.isOutgoing ? 'right' : 'left']: 0,
                background: 'rgba(12,12,12,0.96)', backdropFilter: 'blur(10px)',
                border: `1px solid ${replyColor}50`,
                borderRadius: 10, padding: '10px 14px',
                maxWidth: 340, zIndex: 50,
                fontSize: 12, color: 'var(--amoled-text)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: replyColor, marginBottom: 5 }}>
                  {replyToMsg.senderName || 'Сообщение'}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 180, overflow: 'auto', opacity: 0.9 }}>
                  {replyToMsg.text}
                </div>
              </div>
            )}
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
            {mediaUrl && (
              <img src={mediaUrl} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', animation: 'native-fadein 0.25s ease',
              }} />
            )}
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

        {/* v0.87.116: время СБОКУ — для текстовых сообщений (без фото/видео) flex-row */}
        {m.text && !hasMedia ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ flex: 1, whiteSpace: 'pre-wrap' }}>
              <FormattedText text={m.text} entities={m.entities} />
            </div>
            <div style={{ fontSize: 10, opacity: 0.7, flexShrink: 0, whiteSpace: 'nowrap', marginBottom: 1 }}>
              {m.isEdited && <span style={{ marginRight: 3 }}>ред.</span>}
              {new Date(m.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
              {m.isOutgoing && <span style={{ marginLeft: 3, fontSize: 11 }} title={m.isRead ? 'Прочитано' : 'Отправлено'}>{m.isRead ? '✓✓' : '✓'}</span>}
            </div>
          </div>
        ) : (
          m.text && <div style={{ whiteSpace: 'pre-wrap', padding: '4px 8px 0' }}>
            <FormattedText text={m.text} entities={m.entities} />
          </div>
        )}

        {/* v0.87.27: превью ссылки */}
        {m.mediaType === 'link' && m.webPage && (
          <>
            {m.webPage.url && !(m.text && m.text.includes(m.webPage.url)) && (
              <div style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                <a
                  href={m.webPage.url}
                  style={{ color: m.isOutgoing ? '#fff' : 'var(--amoled-accent)', textDecoration: 'underline' }}
                  onClick={e => {
                    e.preventDefault()
                    try { window.api?.invoke('app:open-external', m.webPage.url) } catch(_) {}
                  }}
                >{m.webPage.url}</a>
              </div>
            )}
            <LinkPreview wp={m.webPage} isOutgoing={m.isOutgoing} />
          </>
        )}

        {/* время снизу — только для фото/видео или сообщений без текста */}
        {(hasMedia || !m.text) && (
          <div style={{
            fontSize: 10, opacity: 0.75, marginTop: 2, textAlign: 'right',
            padding: hasMedia ? '2px 8px 4px' : 0,
          }}>
            {m.isEdited && <span style={{ marginRight: 4 }}>ред.</span>}
            {new Date(m.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
            {m.isOutgoing && (
              <span style={{ marginLeft: 4, fontSize: 11 }} title={m.isRead ? 'Прочитано' : 'Отправлено'}>
                {m.isRead ? '✓✓' : '✓'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const miniBtn = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  padding: '2px 6px', fontSize: 13, color: 'var(--amoled-text)',
  borderRadius: 4, lineHeight: 1,
}
