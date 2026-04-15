// v0.87.15: пузырёк сообщения — текст, медиа, reply, edit, меню действий
import { useState, useEffect, useRef } from 'react'

export default function MessageBubble({ m, chatId, onReply, onEdit, onDelete, onForward, onPin, onVisible, downloadMedia, getMessage }) {
  const [menu, setMenu] = useState(false)
  const [mediaUrl, setMediaUrl] = useState(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const ref = useRef(null)

  // v0.87.16: IntersectionObserver — onVisible срабатывает когда сообщение в viewport
  useEffect(() => {
    if (!onVisible || !ref.current) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onVisible(m)
    }, { threshold: 0.5 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [m.id])

  const handleDownload = async () => {
    if (mediaUrl || mediaLoading) return
    setMediaLoading(true)
    try {
      const r = await downloadMedia(chatId, m.id)
      if (r?.ok) setMediaUrl(r.path)
    } finally { setMediaLoading(false) }
  }

  // Автоматически грузим превью для photo (маленькие файлы)
  useEffect(() => {
    if (m.mediaType === 'photo' && !mediaUrl) handleDownload()
  }, [m.id])

  const replyToMsg = m.replyToId && getMessage ? getMessage(chatId, m.replyToId) : null

  return (
    <div ref={ref} style={{
      alignSelf: m.isOutgoing ? 'flex-end' : 'flex-start',
      maxWidth: '65%',
      position: 'relative',
    }}
      onMouseEnter={() => setMenu(true)}
      onMouseLeave={() => setMenu(false)}
    >
      <div style={{
        padding: '8px 12px', borderRadius: 12,
        background: m.isOutgoing ? 'var(--amoled-accent)' : 'var(--amoled-surface-hover)',
        color: m.isOutgoing ? '#fff' : 'var(--amoled-text)',
        fontSize: 14, wordBreak: 'break-word',
      }}>
        {!m.isOutgoing && m.senderName && (
          <div style={{ fontSize: 11, color: 'var(--amoled-text-dim)', marginBottom: 2 }}>{m.senderName}</div>
        )}
        {/* Reply цитата */}
        {replyToMsg && (
          <div style={{
            borderLeft: '3px solid rgba(255,255,255,0.4)',
            paddingLeft: 8, marginBottom: 4,
            fontSize: 12, opacity: 0.7,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            ↪ {replyToMsg.text?.slice(0, 80) || '[медиа]'}
          </div>
        )}
        {/* Медиа */}
        {m.mediaType === 'photo' && (
          mediaUrl
            ? <img src={mediaUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: m.text ? 6 : 0 }} />
            : <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{mediaLoading ? '⏳ загрузка...' : '🖼 фото'}</div>
        )}
        {m.mediaType === 'video' && (
          <div onClick={handleDownload} style={{ cursor: 'pointer', fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
            {mediaUrl ? '📹 видео скачано' : mediaLoading ? '⏳ загрузка...' : '📹 видео (клик для скачивания)'}
          </div>
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
        {m.mediaType === 'link' && <div style={{ fontSize: 12, opacity: 0.7 }}>🔗 ссылка</div>}
        {m.mediaType === 'location' && <div style={{ fontSize: 12, opacity: 0.7 }}>📍 геолокация</div>}
        {m.mediaType === 'contact' && <div style={{ fontSize: 12, opacity: 0.7 }}>👤 контакт</div>}
        {m.mediaType === 'poll' && <div style={{ fontSize: 12, opacity: 0.7 }}>📊 опрос</div>}

        {m.text && <div>{m.text}</div>}
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, textAlign: 'right' }}>
          {m.isEdited && <span style={{ marginRight: 4 }}>ред.</span>}
          {new Date(m.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
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
