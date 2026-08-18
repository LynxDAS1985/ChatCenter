// v1.2.264 — Окно «Добавить источник»: 2 шага (протокол → мессенджер).
// Рисуется ВНУТРИ NativeApp (.native-mode) → переменные --amoled-* и фон как у API-окна.
// Одна кнопка «＋ Добавить» в боковой полосе открывает это окно вместо прежних двух «+».
//   Шаг 1: выбор протокола (⚡ API / 🌐 Веб).
//   Шаг 2: доступные мессенджеры. По API сейчас — только Telegram (остальные «🔒 скоро»),
//          по Вебу — Telegram/WhatsApp/ВК/Макс + «Другой» (ручной адрес → старое окно).
// v1.2.265 — фон светлее (как «инфо об аккаунте»); настоящий логотип Telegram (MessengerIcon).
// v1.2.266 — 10 улучшений: шаги-точки, ⚡ в заголовке, поиск, статус «подключён», подсказка,
//            ховер бренд-цветом, фокус-кольцо, счётчик «N доступно», «скоро», плавное появление.
import { useState, useEffect, useRef } from 'react'
import { DEFAULT_MESSENGERS } from '../../constants.js'
import MessengerIcon from './MessengerIcon.jsx' // настоящий логотип (Telegram — картинка), не эмодзи

// По API сейчас поддержан только Telegram; остальные значки — «скоро» (заблокированы).
const API_AVAILABLE = ['telegram']

export default function AddSourceModal({ onClose, onAddApi, onAddWeb, hasApiTelegram = false, connectedWeb = [] }) {
  const [step, setStep] = useState('proto') // 'proto' | 'msg'
  const [proto, setProto] = useState(null)  // 'api' | 'web'
  const [search, setSearch] = useState('')  // поиск мессенджера на шаге 2
  const gridRef = useRef(null)              // для навигации стрелками по плиткам

  // #7: навигация стрелками между плитками (Tab работает нативно, это — доп. ← → ↑ ↓).
  const onGridKey = (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const btns = Array.from(gridRef.current?.querySelectorAll('button:not([disabled])') || [])
    if (!btns.length) return
    const cur = btns.indexOf(document.activeElement)
    let i = cur < 0 ? 0 : cur
    const cols = 4
    if (e.key === 'ArrowRight') i = Math.min(btns.length - 1, i + 1)
    else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1)
    else if (e.key === 'ArrowDown') i = Math.min(btns.length - 1, i + cols)
    else if (e.key === 'ArrowUp') i = Math.max(0, i - cols)
    e.preventDefault()
    btns[i]?.focus()
  }

  // Закрытие по Escape (как в AddMessengerModal.jsx).
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const pickProto = (p) => { setProto(p); setSearch(''); setStep('msg') }
  const goBack = () => { setStep('proto'); setSearch('') }

  // ── стили (фон светлее — как карточка «инфо об аккаунте», не сливается с чёрным AMOLED) ──
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000,
    display: 'flex', alignItems: 'center', justifyContent: 'center' }
  // #10: плавное появление — переиспользуем существующий keyframe native-menu-popin.
  // v1.2.268: неон-грань как у карточки контакта (ContactCardModal:149-151) — голубая рамка + свечение.
  const card = { width: 440, maxWidth: '92vw', background: 'linear-gradient(180deg, #171b23 0%, #11141b 100%)',
    border: '1px solid rgba(42,171,238,0.55)', borderRadius: 18, padding: 18,
    boxShadow: '0 0 0 1px rgba(42,171,238,0.22), 0 0 30px rgba(42,171,238,0.20), 0 22px 55px rgba(0,0,0,0.65)',
    color: 'var(--amoled-text)', animation: 'native-menu-popin 220ms cubic-bezier(0.34, 1.56, 0.64, 1)' }
  const hbtn = { background: 'none', border: 'none', color: 'var(--amoled-text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }
  const backBtn = { width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--amoled-text-dim)', cursor: 'pointer', fontSize: 16 }
  const titleIc = { width: 26, height: 26, borderRadius: 8, background: 'rgba(42,171,238,0.16)', color: 'var(--amoled-accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 } // #2
  // #1: шаги-точки
  const sdot = (state) => ({ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 800,
    background: state === 'on' ? 'var(--amoled-accent)' : 'rgba(255,255,255,0.08)',
    color: state === 'on' ? '#04121a' : 'var(--amoled-text-muted)' })
  const sbar = { width: 16, height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }
  const stepText = { fontSize: 12, color: 'var(--amoled-text-dim)' }
  const availChip = { marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--amoled-success)',
    background: 'rgba(52,199,89,0.12)', border: '1px solid rgba(52,199,89,0.3)', borderRadius: 999, padding: '3px 9px' } // #8
  const searchBox = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--amoled-text-muted)',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 11px', margin: '0 0 12px' }
  const searchInput = { flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--amoled-text)', fontSize: 12.5 }
  const protoCard = { flex: 1, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
    padding: 14, borderRadius: 13, cursor: 'pointer', textAlign: 'left',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--amoled-text)' }
  const protoIc = { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 19, background: 'rgba(255,255,255,0.08)' }
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9 }
  const tileBase = { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 6px',
    borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
    color: 'var(--amoled-text)', fontSize: 11, cursor: 'pointer', transition: 'border-color .12s, box-shadow .12s' }
  const sw = (color) => ({ width: 34, height: 34, borderRadius: 10, background: `${color}22`,
    display: 'flex', alignItems: 'center', justifyContent: 'center' })
  const hint = { fontSize: 9.5, color: 'var(--amoled-text-muted)' } // #5
  const stat = (ok) => ({ position: 'absolute', top: 7, right: 7, width: 9, height: 9, borderRadius: '50%',
    border: '2px solid #171b23', background: ok ? 'var(--amoled-success)' : '#3a4048' }) // #4

  const q = search.trim().toLowerCase()
  const shown = DEFAULT_MESSENGERS.filter(m => !q || m.name.toLowerCase().includes(q))
  const isLocked = (m) => proto === 'api' && !API_AVAILABLE.includes(m.id)
  // #8: счётчик = число ВИДИМЫХ доступных плиток (учитывает поиск, не «всего»).
  const availShown = shown.filter(m => !isLocked(m)).length

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()} role="dialog" aria-label="Добавить источник">
        {/* Шапка: назад (на шаге 2) + ⚡ + заголовок + закрыть */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {step === 'msg' && <button type="button" onClick={goBack} title="Назад" style={backBtn}>‹</button>}
          <span style={titleIc} aria-hidden="true">⚡</span>
          <div style={{ fontSize: 16, fontWeight: 800, flex: 1 }}>Добавить источник</div>
          <button type="button" onClick={onClose} title="Закрыть" style={hbtn}>✕</button>
        </div>

        {/* #1: шаги-точки + текст шага (+ #8 счётчик на шаге 2) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <span style={sdot(step === 'proto' ? 'on' : 'done')}>1</span>
          <span style={sbar} />
          <span style={sdot(step === 'msg' ? 'on' : 'idle')}>2</span>
          <span style={stepText}>
            {step === 'proto' ? 'Шаг 1 · как подключить' : `Шаг 2 · ${proto === 'api' ? 'мессенджеры по API' : 'веб-мессенджеры'}`}
          </span>
          {step === 'msg' && <span style={availChip}>{availShown} доступно</span>}
        </div>

        {step === 'proto' ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" data-testid="add-proto-api" onClick={() => pickProto('api')} style={protoCard}>
              <span style={protoIc}>⚡</span>
              <b style={{ fontSize: 14 }}>API</b>
              <small style={{ fontSize: 10.5, color: 'var(--amoled-text-muted)' }}>быстро, все функции</small>
            </button>
            <button type="button" data-testid="add-proto-web" onClick={() => pickProto('web')} style={protoCard}>
              <span style={protoIc}>🌐</span>
              <b style={{ fontSize: 14 }}>Веб</b>
              <small style={{ fontSize: 10.5, color: 'var(--amoled-text-muted)' }}>как в браузере</small>
            </button>
          </div>
        ) : (
          <>
            {/* #3: поиск мессенджера */}
            <div style={searchBox}>
              <span aria-hidden="true">🔍</span>
              <input style={searchInput} value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Найти мессенджер…" aria-label="Найти мессенджер" data-testid="add-search" />
            </div>
            <div style={grid} ref={gridRef} onKeyDown={onGridKey}>
              {shown.map(m => {
                const locked = isLocked(m)
                // #4: «уже добавлен» — сверяем по URL ИЛИ имени (custom-вкладка добавляется с тем же именем).
                const connected = proto === 'api' ? (m.id === 'telegram' && hasApiTelegram) : connectedWeb.some(w => w.url === m.url || w.name === m.name)
                const tipHint = proto === 'api' ? (m.id === 'telegram' ? 'по номеру' : '') : 'в браузере' // #5
                const handle = locked ? undefined
                  : proto === 'api' ? () => { onAddApi?.(); onClose() }
                  : () => { onAddWeb?.(m); onClose() }
                return (
                  <button key={m.id} type="button" disabled={locked} onClick={handle}
                    title={connected ? (proto === 'api' ? 'Уже подключён' : 'Уже добавлен') : m.name}
                    style={{ ...tileBase, opacity: locked ? 0.5 : 1, cursor: locked ? 'default' : 'pointer' }}
                    onMouseEnter={e => { if (!locked) { e.currentTarget.style.borderColor = `${m.color}bf`; e.currentTarget.style.boxShadow = `0 0 0 3px ${m.color}28` } }} /* #6 */
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.boxShadow = 'none' }}
                    onFocus={e => { if (!locked) e.currentTarget.style.outline = '2px solid var(--amoled-accent)' }} /* #7 */
                    onBlur={e => { e.currentTarget.style.outline = 'none' }}
                  >
                    {/* #4 статус (подключён/не добавлен) или #9 «скоро» */}
                    {locked
                      ? <span style={{ position: 'absolute', top: 6, right: 7, fontSize: 8.5, fontWeight: 800, color: 'var(--amoled-text-muted)' }}>🔒 скоро</span>
                      : <span style={stat(connected)} title={connected ? 'подключён' : 'не добавлен'} />}
                    <span style={sw(m.color)} aria-hidden="true"><MessengerIcon messenger={m.id} size={22} /></span>
                    <span>{m.name}</span>
                    {tipHint && <span style={hint}>{tipHint}</span>}
                  </button>
                )
              })}
              {proto === 'web' && !q && (
                <button type="button" onClick={() => { onAddWeb?.(null); onClose() }}
                  style={{ ...tileBase, borderStyle: 'dashed', cursor: 'pointer' }} title="Свой адрес (URL)">
                  <span style={{ fontSize: 22, lineHeight: 1 }}>＋</span>
                  <span>Другой</span>
                  <span style={hint}>свой адрес</span>
                </button>
              )}
            </div>
            {shown.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--amoled-text-muted)', textAlign: 'center', padding: '14px 0' }}>
                Ничего не найдено
              </div>
            )}
            {proto === 'api' && (
              <div style={{ fontSize: 11, color: 'var(--amoled-text-muted)', marginTop: 10 }}>
                По API сейчас доступен Telegram. Остальные — скоро.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
