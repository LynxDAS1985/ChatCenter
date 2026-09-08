// v1.2.348: плавающий ВЕРТИКАЛЬНЫЙ ДОК быстрого перехода по разделам Ozon (Сообщения / Вопросы / …).
// Живёт ВНУТРИ контейнера вкладки Ozon (App.jsx) → виден только на активной вкладке Ozon и в её области.
// Улучшения по выбору пользователя: число новых (бейдж), пульс на новом, точка-статус (загрузка/на связи),
// подсветка активного раздела, тускнеет в покое (ярче при наведении), ОТДЕЛЬНАЯ ручка перетаскивания.
// Перетаскивание — по window.mousemove + прозрачная накладка над webview (иначе залипает); позиция в
// localStorage относительна контейнера. Цвета заданы ЯВНО (виджет вне .native-mode). Пульс/точка —
// tailwind-классы animate-ping/animate-pulse (уже используются в проекте, RailWebIcon/App).
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'

const LS_KEY = 'ccOzonWidgetPos3'
const SIZE = { w: 74, h: 150 } // вертикальный док — узкий и высокий (для клампа по контейнеру)

// Разделы Ozon. Добавить новый = дописать строку.
const SECTIONS = [
  // url ведём СРАЗУ на ?group=customers_v2 (куда Ozon и так переадресует «/app/messenger»): без
  // переадресации нет отмены загрузки (ERR_ABORTED). match — по пути, срабатывает и с query.
  { key: 'msg', label: 'Сообщения', icon: '💬', url: 'https://seller.ozon.ru/app/messenger?group=customers_v2', match: '/app/messenger' },
  { key: 'qa', label: 'Вопросы', icon: '❓', url: 'https://seller.ozon.ru/app/reviews/questions', match: '/reviews/questions' },
  // v1.2.383: «Отзывы». ВАЖЕН ПОРЯДОК: qa (match '/reviews/questions') ДО rv (match '/app/reviews'), иначе rv
  // поймал бы и URL вопросов (он содержит '/app/reviews'). SECTIONS.find берёт ПЕРВОЕ совпадение → qa победит для вопросов.
  { key: 'rv', label: 'Отзывы', icon: '⭐', url: 'https://seller.ozon.ru/app/reviews', match: '/app/reviews' },
]

export default function OzonQuickWidget({ messengerId, webviewRefs, unread, loading }) {
  const rootRef = useRef(null)
  const dragOff = useRef({ dx: 0, dy: 0 })
  const [pos, setPos] = useState(() => {
    try { const r = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (r && typeof r.x === 'number' && typeof r.y === 'number') return r } catch (_) {}
    return null
  })
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [active, setActive] = useState(null) // какой раздел сейчас открыт в webview Ozon
  // v1.2.409: была ли СОХРАНЁННАЯ позиция на момент монтирования (первый запуск/свежая установка → её нет).
  // На первом запуске виджет НЕ тускнеет (opacity 1) — иначе полупрозрачный узкий док в углу легко не заметить
  // (жалоба «в собранной версии виджета нет»: он был, но в правом нижнем углу и полупрозрачный).
  const [hadSaved] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem(LS_KEY) || 'null') } catch (_) { return false }
  })

  const parentBox = useCallback(() => {
    const p = rootRef.current && rootRef.current.offsetParent
    return { w: (p && p.clientWidth) || 800, h: (p && p.clientHeight) || 600 }
  }, [])
  const clampP = useCallback((pp) => {
    const b = parentBox()
    return { x: Math.min(Math.max(0, pp.x), Math.max(0, b.w - SIZE.w)), y: Math.min(Math.max(0, pp.y), Math.max(0, b.h - SIZE.h)) }
  }, [parentBox])

  // Первое место: нет сохранённого → правый нижний угол КОНТЕЙНЕРА (окна Ozon).
  useLayoutEffect(() => {
    setPos(p => {
      if (p) return clampP(p)
      const b = parentBox()
      return { x: Math.max(8, b.w - SIZE.w - 20), y: Math.max(8, b.h - SIZE.h - 20) }
    })
  }, [clampP, parentBox])

  // Определяем активный раздел по текущему адресу webview (на монтировании).
  useEffect(() => {
    try {
      const url = webviewRefs?.current?.[messengerId]?.getURL?.() || ''
      const s = SECTIONS.find(x => url.indexOf(x.match) !== -1)
      if (s) setActive(s.key)
    } catch (_) {}
  }, [messengerId, webviewRefs])

  // v1.2.409: ДИАГНОСТИКА — смонтировался ли виджет и с какими размерами контейнера (жалоба «в собранной версии
  // виджета нет»). По этой строке в журнале видно: виджет рисуется, есть ли сохранённая позиция, размер области.
  useEffect(() => {
    try {
      const b = parentBox()
      window.api?.send?.('app:log', { level: 'INFO', message: `[ozon-widget] смонтирован ${messengerId}: box=${b.w}x${b.h} сохранённая-позиция=${hadSaved ? 'да' : 'нет'}` })
    } catch (_) {}
  }, [messengerId, parentBox, hadSaved])

  const onGrabDown = useCallback((e) => {
    if (!pos) return
    dragOff.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    setDragging(true)
    e.preventDefault()
  }, [pos])

  useEffect(() => {
    if (!dragging) return
    const move = (e) => setPos(clampP({ x: e.clientX - dragOff.current.dx, y: e.clientY - dragOff.current.dy }))
    const up = () => {
      setDragging(false)
      setPos(p => { const c = clampP(p); try { localStorage.setItem(LS_KEY, JSON.stringify(c)) } catch (_) {} return c })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [dragging, clampP])

  const openSection = useCallback((s) => {
    setActive(s.key)
    const wv = webviewRefs?.current?.[messengerId]
    try {
      const p = wv?.loadURL?.(s.url)
      // Лог в файл-вьюер (не console — его юзер не видит). Видно, что клик принят и куда ведём.
      try { window.api?.send?.('app:log', { level: 'INFO', message: `[ozon-widget] переход → "${s.label}" (${s.url})` }) } catch (_) {}
      // loadURL возвращает Promise. При быстром повторном клике или переадресации Ozon предыдущий
      // переход «отменяется» (ERR_ABORTED -3) — это НОРМА, а не сбой. Ловим тихо, иначе всплывает
      // красным как renderer-unhandled-rejection в журнале.
      if (p && typeof p.catch === 'function') p.catch((e) => {
        const em = (e && e.message) || String(e)
        if (/ERR_ABORTED|-3/.test(em)) return // отмена из-за переадресации/повторного клика — не ошибка
        try { window.api?.send?.('app:log', { level: 'WARN', message: `[ozon-widget] переход "${s.label}" прерван: ${em}` }) } catch (_) {}
      })
    } catch (e) {
      try { window.api?.send?.('app:log', { level: 'ERROR', message: `[ozon-widget] не удалось открыть "${s.label}": ${(e && e.message) || e}` }) } catch (_) {}
    }
  }, [messengerId, webviewRefs])

  if (!pos) return <div ref={rootRef} style={{ position: 'absolute', width: 0, height: 0, left: 0, top: 0 }} />

  // Есть ли где-то новые (бейдж>0). Если есть — виджет ЯРКИЙ (не тускнеет), чтобы бросался в глаза.
  const hasNew = (((unread && unread.msg) || 0) > 0) || (((unread && unread.qa) || 0) > 0) || (((unread && unread.rv) || 0) > 0)
  // v1.2.409: полупрозрачный ТОЛЬКО когда новых нет, мышь не наведена И уже есть сохранённая позиция.
  // Первый запуск (свежая установка, позиции ещё нет) → НЕ тусклый, чтобы новый пользователь заметил виджет.
  const dim = hadSaved && !(hovered || dragging || hasNew)

  return (
    <>
      {dragging && <div style={{ position: 'absolute', inset: 0, zIndex: 55, cursor: 'grabbing' }} aria-hidden="true" />}
      <div
        ref={rootRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'absolute', left: pos.x, top: pos.y, zIndex: 60,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
          padding: '8px 9px 11px', borderRadius: 24,
          background: 'linear-gradient(180deg, #14141a 0%, #0c0c11 100%)',
          border: '1px solid #26262c',
          boxShadow: dragging ? '0 14px 30px rgba(0,0,0,.6)' : '0 8px 20px rgba(0,0,0,.45)',
          opacity: dim ? 0.5 : 1,
          transition: dragging ? 'opacity .12s' : 'opacity .18s ease, box-shadow .15s ease',
          userSelect: 'none', fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
      >
        {/* Ручка перетаскивания (отдельная зона — не путается с кликами по иконкам) */}
        <div
          onMouseDown={onGrabDown}
          title="Перетащить"
          style={{ color: '#4d4d60', fontSize: 12, letterSpacing: 1, lineHeight: 1, padding: '1px 6px 3px', cursor: dragging ? 'grabbing' : 'grab' }}
        >⠿</div>

        {SECTIONS.map((s, i) => {
          const n = (unread && unread[s.key]) || 0
          const isActive = active === s.key
          return (
            <div key={s.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {i > 0 && <div style={{ width: 16, height: 1, background: '#25252f', margin: '0 0 9px' }} />}
              <div style={{ position: 'relative', width: 46, height: 46 }}>
                {/* Пульс при новом */}
                {n > 0 && <span aria-hidden="true" className="animate-ping" style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: '#3b82f6', opacity: 0.35 }} />}
                <button
                  onClick={() => openSection(s)}
                  title={`${s.label}${n > 0 ? ' · ' + n + ' новых' : ''}`}
                  style={{
                    position: 'relative', width: 46, height: 46, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    cursor: 'pointer', color: '#e8ecf6',
                    background: isActive
                      ? 'radial-gradient(circle at 35% 28%, #24314d, #141826)'
                      : 'radial-gradient(circle at 35% 28%, #1d2536, #12121a)',
                    // Подсветка активного: синее кольцо + свечение
                    border: '1px solid ' + (isActive ? '#3b82f6' : '#2b2b39'),
                    boxShadow: isActive ? '0 0 0 2px rgba(59,130,246,.35), 0 0 14px rgba(59,130,246,.35)' : 'none',
                    transition: 'border-color .15s, box-shadow .15s, transform .1s',
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,.18)' } e.currentTarget.style.transform = 'scale(1.06)' }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#2b2b39'; e.currentTarget.style.boxShadow = 'none' } e.currentTarget.style.transform = 'none' }}
                >
                  <span aria-hidden="true" style={{ lineHeight: 1 }}>{s.icon}</span>
                  {/* Точка-статус: грузится → синяя мигает, иначе зелёная «на связи» */}
                  <span
                    aria-hidden="true"
                    className={loading ? 'animate-pulse' : undefined}
                    style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', border: '2px solid #0c0c11', background: loading ? '#3b82f6' : '#22c55e' }}
                  />
                  {/* Число новых */}
                  {n > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: -5, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#ef4444', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0c0c11' }}>{n > 99 ? '99+' : n}</span>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
