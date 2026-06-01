// v0.87.15: пузырёк сообщения — текст, медиа, reply, edit, меню действий.
// v0.87.27: onPhotoOpen (клик → PhotoViewer), onReplyClick (клик по reply-цитате →
// scroll к оригиналу), data-msg-id (для внешнего скролла), LinkPreview для ссылок.
// v0.87.118: цвета отправителей, тултип на reply-цитате, кнопки НАД сообщением, fwdFrom.
import { useState, useEffect, useRef } from 'react'
import FormattedText from './FormattedText.jsx'
import LinkPreview from './LinkPreview.jsx'
import VideoTile from './VideoTile.jsx'
import VoicePlayer from './VoicePlayer.jsx'
import MessageReactions, { ReactionPicker } from './MessageReactions.jsx'
import { useReadOnScrollAway } from '../hooks/useReadOnScrollAway.js'

// v0.87.118: цвета отправителей — детерминированы по senderId (как в Telegram).
// Один отправитель всегда получает один цвет во всех чатах.
const SENDER_COLORS = ['#E17076','#7BC862','#65AADD','#EE7AAE','#AA77B2','#6EC9CB','#FAA774']
function getSenderColor(senderId) {
  return SENDER_COLORS[Math.abs(parseInt(senderId) || 0) % SENDER_COLORS.length]
}

// v0.95.29: глобальный счётчик render'ов MessageBubble по m.id.
// Если один и тот же id рендерится >1 раз В ОДНОЙ КОММИТНОЙ ФАЗЕ → значит дубль
// в state.messages (несколько копий одного сообщения) или в renderItems map.
// Лог отправляется через app:log → chatcenter.log → видим в реальном времени.
// Это решающий тест для понимания «дубль в state vs дубль в render».
const __ccBubbleRenderCount = new Map()
function __ccLogBubbleRender(m) {
  try {
    const id = String(m?.id || '')
    if (!id) return
    const prev = __ccBubbleRenderCount.get(id) || 0
    const next = prev + 1
    __ccBubbleRenderCount.set(id, next)
    // Логируем только когда count > 1 — это дубль. Иначе не шумим.
    if (next > 1 && window.api?.send) {
      window.api.send('app:log', {
        level: 'WARN',
        message: '[bubble-render-dup] msgId=' + id
          + ' renderCount=' + next
          + ' isOutgoing=' + !!m.isOutgoing
          + ' textPreview=' + String(m.text || '').slice(0, 40),
      })
    }
    // Очищаем Map каждые 1000 records чтобы не утекать память.
    if (__ccBubbleRenderCount.size > 1000) __ccBubbleRenderCount.clear()
  } catch (_) {}
}

export default function MessageBubble({
  m, chatId, onReply, onEdit, onDelete, onForward, onPin, onVisible,
  downloadMedia, getMessage, onPhotoOpen, onReplyClick, readRoot,
  // v0.95.29: реакции (Telegram-style)
  onSetReaction,
}) {
  // v0.95.29: счётчик render'ов для дубля.
  __ccLogBubbleRender(m)
  const [menu, setMenu] = useState(false)
  const [mediaUrl, setMediaUrl] = useState(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [replyHover, setReplyHover] = useState(false)  // v0.87.118: тултип цитаты
  // v0.95.29: открыто ли меню реакций (popup с 8 emoji выше action-bar)
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false)
  const ref = useRef(null)
  // v0.95.25: таймер для отложенного скрытия action-bar при mouseleave.
  // Стандарт Discord/Slack — 250мс между leave bubble и hide buttons. Юзер
  // успевает перевести курсор на кнопки без их исчезновения.
  const menuHideTimerRef = useRef(null)
  const cancelMenuHide = () => {
    if (menuHideTimerRef.current) {
      clearTimeout(menuHideTimerRef.current)
      menuHideTimerRef.current = null
    }
  }
  const scheduleMenuHide = () => {
    cancelMenuHide()
    menuHideTimerRef.current = setTimeout(() => {
      setMenu(false)
      setReplyHover(false)
      menuHideTimerRef.current = null
    }, 250)
  }
  // Cleanup при unmount — защита от утечки таймера.
  useEffect(() => () => cancelMenuHide(), [])

  // v0.87.43: Вариант 5 — Msg помечается прочитанным ТОЛЬКО когда:
  //   1. Полностью виден (≥95%) → помечен seen
  //   2. Потом ушёл ВЫШЕ viewport → onRead
  // Защита от "промелькнувшее ≠ прочитанное" при fast-scroll и initial render.
  useReadOnScrollAway({
    elementRef: ref,
    enabled: !!onVisible,
    root: readRoot || null,
    msgId: m.id,
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
      onMouseEnter={() => { cancelMenuHide(); setMenu(true) }}
      onMouseLeave={scheduleMenuHide}
    >
      {/* v0.95.25: кнопки ПОД сообщением (top: calc(100% + 3px)) — не закрывают
          имя отправителя сверху, как просил юзер. Mouse-handlers на самом баре
          (cancelMenuHide / scheduleMenuHide) гарантируют что юзер успеет до них
          дотянуться при переходе с bubble — задержка 250мс перед скрытием
          (стандарт Discord/Slack). */}
      {menu && (onReply || onEdit || onDelete) && (
        <div
          onMouseEnter={cancelMenuHide}
          onMouseLeave={scheduleMenuHide}
          style={{
            position: 'absolute', top: 'calc(100% + 3px)',
            [m.isOutgoing ? 'right' : 'left']: 0,
            display: 'flex', gap: 2, zIndex: 20,
            background: 'rgba(18,18,18,0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '3px 4px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          }}>
          {/* v0.95.29: кнопка 😀 — открыть picker реакций (8 emoji popup) */}
          {onSetReaction && (
            <button
              onClick={(e) => { e.stopPropagation(); setReactionPickerOpen(v => !v) }}
              title="Реакция"
              style={miniBtn}
            >😀</button>
          )}
          <button onClick={() => onReply?.(m)} title="Ответить" style={miniBtn}>↪</button>
          {onForward && <button onClick={() => onForward(m)} title="Переслать" style={miniBtn}>➥</button>}
          {onPin && <button onClick={() => onPin(m)} title="Закрепить" style={miniBtn}>📌</button>}
          {m.isOutgoing && onEdit && <button onClick={() => onEdit(m)} title="Редактировать" style={miniBtn}>✏️</button>}
          {m.isOutgoing && onDelete && <button onClick={() => onDelete(m)} title="Удалить" style={{...miniBtn, color: 'var(--amoled-danger)'}}>🗑</button>}
        </div>
      )}
      {/* v0.95.29: popup быстрых реакций (8 emoji) — над action-bar */}
      {menu && reactionPickerOpen && onSetReaction && (
        <ReactionPicker
          isOutgoing={m.isOutgoing}
          onSelect={(emoji) => {
            const existing = m.reactions?.find(r => r.emoji === emoji)
            onSetReaction(m.id, emoji, existing?.chosen ? 'remove' : 'add')
            setReactionPickerOpen(false)
          }}
          onClose={() => setReactionPickerOpen(false)}
        />
      )}

      <div style={{
        padding: hasMedia ? 4 : '8px 12px', borderRadius: 12,
        background: m.isOutgoing ? 'var(--amoled-accent)' : 'var(--amoled-surface-hover)',
        color: m.isOutgoing ? '#fff' : 'var(--amoled-text)',
        fontSize: 14, wordBreak: 'break-word',
        border: m.isOutgoing ? 'none' : '1px solid rgba(255,255,255,0.06)',
        // v0.95.30: shadow читает CSS-переменную — меняется вместе с цветом темы.
        boxShadow: m.isOutgoing ? '0 0 12px var(--amoled-accent-shadow, rgba(42,171,238,0.15))' : 'none',
        // v0.95.30: opacity 0.95 — мягче выглядит, не «пластиково». Эталон Telegram Desktop.
        opacity: 'var(--bubble-opacity, 1)',
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
        {/* v0.95.25: voice (голосовое сообщение) — кастомный плеер с waveform
            в стиле Telegram. Decode TDLib waveform → 50 столбиков → progress
            закрашивает слева направо. Скорость 1x / 1.5x / 2x. */}
        {m.mediaType === 'voice' && (
          <VoicePlayer m={m} chatId={chatId} downloadMedia={downloadMedia} />
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
        {/* v0.95.29: реакции на сообщение (Telegram-style) — под текстом bubble */}
        {m.reactions && m.reactions.length > 0 && (
          <MessageReactions
            message={m}
            isOutgoing={m.isOutgoing}
            onSetReaction={onSetReaction}
          />
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
