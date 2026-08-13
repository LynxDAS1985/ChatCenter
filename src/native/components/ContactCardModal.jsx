// v1.2.232: «Карточка контакта» (Классика + 10 улучшений). Открывается по клику на
// имя/аватар в шапке чата (InboxChatPanel). Собирает 10 улучшений выбранного макета:
//   1 видимая кнопка 📋 у каждого поля   2 копия имени у заголовка   3 тост «что скопировано»
//   4 клик по аватару → фото на весь экран   5 точный статус (formatChatStatus)
//   6 быстрые действия (Написать/Звук)   7 телефон/username/bio из TDLib
//   8 заметка о клиенте (localStorage)   9 закрытие ✕/Esc/клик-вне + «Скопировать всё»
//   10 переключатель звука чата (setMute)
//
// Данные профиля тянутся по запросу (tg:get-contact-info → getUserFullInfo/getUser).
// Телефон/username/bio приходят НЕ всегда (приватность/сеть) — пустые строки просто скрывают строку.
// Паттерн модалки — как ThemePickerModal (backdrop + stopPropagation + Escape).
import { useEffect, useState, useCallback } from 'react'
import { formatChatStatus } from '../utils/formatChatStatus.js'
import { copyText } from '../utils/copyText.js'
import { getContactNote, setContactNote } from '../utils/contactNotes.js'

const AV_COLORS = ['#e17076', '#eda86c', '#a695e7', '#7bc862', '#65aadd', '#ee7aae', '#6ec9cb']
function hashStr(s) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h + s.charCodeAt(i)) & 0xffffffff; return Math.abs(h) }
const MUTE_FOREVER = 2147483647 // TDLib INT_MAX — «навсегда» (см. tdlibChatActions.js)
// v1.2.241: читаемый вторичный текст. Токены были тусклыми на тёмном фоне:
// --amoled-text-dim #a0a0a0, --amoled-text-muted #606060. Здесь — светлее (статус,
// источник, подписи кнопок, метки полей). Значения остаются белыми (--amoled-text).
const SUB = '#bcc6d6'

// Поле с видимой кнопкой копирования (улучшения №1, 7).
function CopyField({ icon, label, value, onCopy }) {
  return (
    <div
      onClick={() => onCopy(value, label)}
      title={`Скопировать: ${label}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px',
        borderRadius: 11, cursor: 'pointer',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--amoled-surface-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ width: 20, textAlign: 'center', color: 'var(--amoled-text-dim)', fontSize: 15, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, color: SUB }}>{label}</div>
        <div style={{ fontSize: 14, color: 'var(--amoled-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
      <span
        title="Копировать" aria-label={`Копировать ${label}`}
        style={{
          flexShrink: 0, width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
          background: 'rgba(255,255,255,0.05)', color: 'var(--amoled-text-dim)', fontSize: 14,
        }}
      >📋</span>
    </div>
  )
}

export default function ContactCardModal({ chat, onClose, onMute, messengerName, accountName }) {
  const [info, setInfo] = useState({ loading: true, ok: false, phone: '', username: '', bio: '' })
  const [note, setNote] = useState(() => getContactNote(chat?.id))
  const [muted, setMuted] = useState(!!chat?.isMuted)
  const [toast, setToast] = useState('')

  // Escape закрывает (как все наши модалки — ThemePickerModal)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Тянем профиль собеседника (телефон/username/bio) по запросу.
  useEffect(() => {
    let alive = true
    setInfo({ loading: true, ok: false, phone: '', username: '', bio: '' })
    Promise.resolve(window.api?.invoke?.('tg:get-contact-info', { chatId: chat?.id }))
      .then(r => { if (alive) setInfo({ loading: false, ok: !!r?.ok, phone: r?.phone || '', username: r?.username || '', bio: r?.bio || '' }) })
      .catch(() => {
        if (alive) setInfo({ loading: false, ok: false, phone: '', username: '', bio: '' })
        // v1.2.233: сбой загрузки профиля — в журнал (частый случай: main-процесс не перезапущен).
        try { window.api?.send?.('app:log', { level: 'WARN', message: 'contact-info: не удалось загрузить профиль (канал tg:get-contact-info)' }) } catch (_) {}
      })
    return () => { alive = false }
  }, [chat?.id])

  const showToast = useCallback((text) => {
    setToast(text)
    const id = setTimeout(() => setToast(''), 1600)
    return () => clearTimeout(id)
  }, [])

  const doCopy = useCallback(async (value, label) => {
    const ok = await copyText(value)
    showToast(ok ? `Скопировано: ${value}` : `Не удалось скопировать ${label}`)
  }, [showToast])

  const openPhoto = useCallback(() => {
    if (chat?.avatar) { try { window.api?.invoke?.('photo:open', { src: chat.avatar }) } catch (_) {} }
  }, [chat?.avatar])

  // v1.2.235: «Написать» — закрыть карточку и поставить курсор в поле ввода чата
  // (id проставлен в InboxMessageInput). requestAnimationFrame — чтобы фокус встал после закрытия окна.
  const onWrite = useCallback(() => {
    onClose?.()
    try { requestAnimationFrame(() => { document.getElementById('native-message-composer')?.focus() }) } catch (_) {}
  }, [onClose])

  // v1.2.233: «В Telegram» — открыть контакт в официальном Telegram (только личный чат).
  // Есть username → надёжная ссылка t.me/<username>; иначе deep-link tg://user?id=<user_id>.
  const openInTelegram = useCallback(() => {
    const uid = String(chat?.id || '').split(':').pop()
    const uname = (info.username || '').replace(/^@/, '')
    const link = uname ? `https://t.me/${uname}` : `tg://user?id=${uid}`
    try { window.api?.invoke?.('app:open-external', link) } catch (_) {}
  }, [chat?.id, info.username])

  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    try { onMute?.(chat?.id, next ? MUTE_FOREVER : 0) } catch (_) {}
  }, [muted, onMute, chat?.id])

  const onNoteChange = useCallback((e) => {
    const v = e.target.value
    setNote(v)
    setContactNote(chat?.id, v)
  }, [chat?.id])

  const copyAll = useCallback(() => {
    const parts = [chat?.title, info.phone].filter(Boolean)
    doCopy(parts.join(', '), 'имя и телефон')
  }, [chat?.title, info.phone, doCopy])

  if (!chat) return null
  const initials = (chat.title || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
  const bg = AV_COLORS[hashStr(chat.title || '?') % AV_COLORS.length]
  const source = [messengerName, accountName].filter(Boolean).join(' · ')

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 340, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto',
          // v1.2.239 (Вариант «Контур + свечение»): карточка сливалась с почти чёрным фоном.
          // Приподнятый фон + акцентная рамка (--amoled-accent #2AABEE @55%) + свечение-кольцо
          // и мягкое сияние вокруг — чёткая граница на тёмном фоне.
          background: 'var(--amoled-surface-hover)', border: '1px solid rgba(42,171,238,0.55)',
          borderRadius: 16, color: 'var(--amoled-text)',
          boxShadow: '0 0 0 1px rgba(42,171,238,0.22), 0 0 30px rgba(42,171,238,0.20), 0 22px 55px rgba(0,0,0,0.65)',
        }}
      >
        <span style={{ position: 'absolute', top: 12, left: 12, fontSize: 10, color: 'var(--amoled-text-dim)', border: '1px solid var(--amoled-border)', borderRadius: 5, padding: '1px 5px' }}>Esc</span>
        <button
          onClick={onClose} title="Закрыть (Esc)"
          style={{ position: 'absolute', top: 9, right: 11, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', color: 'var(--amoled-text-dim)', fontSize: 15, border: 'none', cursor: 'pointer', zIndex: 2 }}
        >✕</button>

        {/* Шапка: аватар (клик → фото), имя + копия, статус, источник */}
        <div style={{ padding: '22px 16px 12px', textAlign: 'center' }}>
          <div
            onClick={openPhoto}
            title={chat.avatar ? 'Открыть фото' : undefined}
            style={{
              position: 'relative', width: 80, height: 80, borderRadius: '50%', margin: '0 auto',
              display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 28,
              background: chat.avatar ? `url("${chat.avatar}") center/cover no-repeat` : bg,
              cursor: chat.avatar ? 'pointer' : 'default', boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            }}
          >
            {!chat.avatar && (initials || '?')}
            {chat.avatar && (
              <span style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: '50%', background: 'var(--amoled-surface)', border: '2px solid var(--amoled-surface)', display: 'grid', placeItems: 'center', fontSize: 11 }}>⤢</span>
            )}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center', margin: '12px 0 4px', maxWidth: '100%' }}>
            <span style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>{chat.title}</span>
            <span
              onClick={() => doCopy(chat.title, 'имя')} title="Копировать имя"
              style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, background: 'rgba(94,162,230,0.18)', color: 'var(--amoled-accent)', display: 'grid', placeItems: 'center', fontSize: 12, cursor: 'pointer' }}
            >📋</span>
          </div>
          <div style={{ fontSize: 12.5, color: SUB, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {chat.type === 'user' && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: chat.isOnline ? 'var(--amoled-success)' : '#6a6a72' }} />
            )}
            {formatChatStatus(chat, {})}
          </div>
          {source && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 11.5, color: SUB, border: '1px solid var(--amoled-border)', borderRadius: 20, padding: '2px 10px' }}>{source}</span>
            </div>
          )}
        </div>

        {/* Быстрые действия: Написать / В Telegram (последняя — только личный чат).
            v1.2.234: кнопка «Заглушить» убрана — звук уже переключается нижним тумблером
            «Уведомления чата» (было два элемента на одно действие). */}
        <div style={{ display: 'flex', gap: 8, padding: '4px 14px 8px' }}>
          <button onClick={onWrite} style={qbtn}>💬<span style={qlabel}>Написать</span></button>
          {chat.type === 'user' && (
            <button onClick={openInTelegram} title="Открыть в официальном Telegram" style={qbtn}>↗<span style={qlabel}>В Telegram</span></button>
          )}
        </div>

        {/* Поля профиля */}
        <div style={{ padding: '0 12px 6px' }}>
          {info.loading && (
            <div style={{ padding: '10px', fontSize: 12.5, color: 'var(--amoled-text-dim)', textAlign: 'center' }}>Загрузка данных профиля…</div>
          )}
          {/* v1.2.233: у личного чата ok:false = реальный сбой (у групп это норма — там не показываем). */}
          {!info.loading && !info.ok && chat.type === 'user' && (
            <div style={{ padding: '9px 10px', fontSize: 12, color: '#e0a94b', background: 'rgba(224,169,75,0.08)', borderRadius: 10, margin: '2px 0' }}>
              ⚠️ Не удалось загрузить профиль. Если только что обновляли приложение — полностью перезапустите его.
            </div>
          )}
          {!info.loading && info.phone && (
            <CopyField icon="📞" label="Телефон" value={info.phone} onCopy={doCopy} />
          )}
          {/* v1.2.241: строка «Имя пользователя» ВСЕГДА для личного чата. Есть логин → копируемая
              строка; нет → «— не указан» (у контакта нет публичного @username в Telegram). */}
          {!info.loading && chat.type === 'user' && (
            info.username
              ? <CopyField icon="🔗" label="Имя пользователя" value={'@' + info.username.replace(/^@/, '')} onCopy={doCopy} />
              : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px' }}>
                  <span style={{ width: 20, textAlign: 'center', color: 'var(--amoled-text-dim)', fontSize: 15, flexShrink: 0 }}>🔗</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, color: SUB }}>Имя пользователя</div>
                    <div style={{ fontSize: 13.5, color: '#8b95a8', fontStyle: 'italic' }}>— не указан</div>
                  </div>
                </div>
              )
          )}
          {!info.loading && info.bio && (
            <div
              onClick={() => doCopy(info.bio, 'описание')} title="Скопировать описание"
              style={{ display: 'flex', gap: 11, padding: '9px 10px', borderRadius: 11, cursor: 'pointer' }}
            >
              <span style={{ width: 20, textAlign: 'center', color: 'var(--amoled-text-dim)', fontSize: 15, flexShrink: 0 }}>ℹ️</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, color: SUB }}>О себе</div>
                <div style={{ fontSize: 13.5, color: 'var(--amoled-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{info.bio}</div>
              </div>
            </div>
          )}
        </div>

        {/* Заметка о клиенте (локально) */}
        <div style={{ margin: '2px 14px 6px' }}>
          <div style={{ fontSize: 11, color: '#c9a24b', marginBottom: 4 }}>📝 Заметка о клиенте (видна только вам)</div>
          <textarea
            value={note} onChange={onNoteChange}
            placeholder="Например: VIP · заказ №… · перезвонить"
            rows={2}
            style={{
              width: '100%', resize: 'vertical', minHeight: 40, maxHeight: 140, boxSizing: 'border-box',
              background: 'rgba(201,162,75,0.08)', border: '1px dashed rgba(201,162,75,0.5)', borderRadius: 10,
              color: 'var(--amoled-text)', fontSize: 13, padding: '8px 10px', fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        {/* Звук чата — переключатель */}
        <div style={{ margin: '0 8px', borderTop: '1px solid var(--amoled-border)' }}>
          <div
            onClick={toggleMute} title="Уведомления чата"
            style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px', borderRadius: 11, cursor: 'pointer' }}
          >
            <span style={{ width: 20, textAlign: 'center', fontSize: 15, flexShrink: 0 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, color: 'var(--amoled-text)' }}>Уведомления чата</div>
              <div style={{ fontSize: 11, color: SUB }}>{muted ? 'Выключены' : 'Включены'}</div>
            </div>
            <span style={{
              width: 36, height: 21, borderRadius: 21, position: 'relative', flexShrink: 0,
              background: muted ? '#3a3f4d' : 'var(--amoled-accent)', transition: 'background 0.15s',
            }}>
              <span style={{ position: 'absolute', top: 2, width: 17, height: 17, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', left: muted ? 2 : 17 }} />
            </span>
          </div>
        </div>

        {/* Скопировать всё */}
        <button onClick={copyAll} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          margin: '6px 12px 14px', width: 'calc(100% - 24px)', padding: 11, borderRadius: 12,
          background: 'rgba(255,255,255,0.06)', color: 'var(--amoled-text)', fontSize: 13, fontWeight: 600,
          border: 'none', cursor: 'pointer',
        }}>⧉ Скопировать всё (имя{info.phone ? ' + телефон' : ''})</button>

        {/* Тост «что скопировано» */}
        {toast && (
          <div style={{
            position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)',
            background: '#0f1720', color: '#eafff2', border: '1px solid #54d98a', padding: '8px 14px',
            borderRadius: 12, fontSize: 12.5, whiteSpace: 'nowrap', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis',
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)', pointerEvents: 'none',
          }}>✅ {toast}</div>
        )}
      </div>
    </div>
  )
}

const qbtn = {
  // v1.2.235: maxWidth — одинокая кнопка (напр. «Написать» у группы) не растягивается на всю ширину.
  flex: 1, maxWidth: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 4px',
  borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: 'var(--amoled-text)', fontSize: 16,
  border: 'none', cursor: 'pointer',
}
const qlabel = { fontSize: 10.5, color: SUB } // v1.2.241: ярче подписи кнопок
