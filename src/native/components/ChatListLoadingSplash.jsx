// v1.2.393: Заставка первой загрузки списка чатов (нативный режим).
// Показывается ПОВЕРХ списка (overlay, position:absolute inset:0), пока не пришёл
// полный батч чатов (флаг chatsLoading из InboxMode). Скрывает «появление чатов по одному»
// — список открывается разом, готовым. Затем плавно гаснет (финал «кружки → список»).
//
// Overlay-подход (список ПОД заставкой не размонтируется) — тот же паттерн, что форум-панель
// в InboxChatListSidebar (position:absolute + inset:0), и MessageListOverlay (отложенный unmount).
// Паттерн отложенного действия: setTimeout в useEffect + очистка в cleanup
// (React docs «Synchronizing with Effects», https://react.dev/learn/synchronizing-with-effects).
//
// Реализованы 7 согласованных улучшений: (1) имя того, кто сейчас грузится; (2) настоящие
// буквы+цвета кружков; (3) галочка «готов»; (4) живой счётчик загруженных; (5) кольцо вокруг
// текущего; (6) плавный перелив цвета; (7) плавный финал (fade → список).

import { useState, useEffect, useRef } from 'react'

const GRADS = ['g1', 'g2', 'g3', 'g4', 'g5']

function initial(name) {
  const s = (name || '').trim()
  return s ? s[0].toUpperCase() : '•'
}

// v1.2.393 (Совет): «общее число чатов» заставка знает заранее — из прошлого запуска.
// Храним в localStorage последнее число чатов; на старте показываем «Загружено N из ЭТОГО».
// Первый запуск (значения нет) → показываем без «из N». try/catch: приватный режим/запрет хранилища.
const TOTAL_KEY = 'cc_chat_total_hint'
function readTotalHint() {
  try { return parseInt(localStorage.getItem(TOTAL_KEY) || '0', 10) || 0 } catch { return 0 }
}
function saveTotalHint(n) {
  try { if (n > 0) localStorage.setItem(TOTAL_KEY, String(n)) } catch { /* хранилище недоступно — не критично */ }
}

export default function ChatListLoadingSplash({ show, loadDone, store }) {
  const [rendered, setRendered] = useState(show)
  const [leaving, setLeaving] = useState(false)
  const [tick, setTick] = useState(0) // крутит подпись «кто сейчас грузится»
  const [totalHint] = useState(readTotalHint) // общее число чатов из прошлого запуска (0 = не знаем)
  const [progress, setProgress] = useState(0) // v1.2.404: 0→1 за ~3с — гонит и счётчик, и проявление аватарок
  const [phase, setPhase] = useState('circles') // v1.2.406: 'circles' → 'skeleton' (скелет списка перед реальным списком)
  const timersRef = useRef([])
  const shownAtRef = useRef(0) // v1.2.398: когда заставка стала видимой (для min-времени и записи в журнал)
  const chatsLen = (store && store.chats && store.chats.length) || 0 // сколько чатов реально загружено

  // Показ/скрытие с плавным финалом (fade 420мс). v1.2.398: ГАРАНТИЯ минимального времени видимости —
  // если чаты грузятся быстро (кэш ~<1с), заставка мелькала доли секунды и её не было видно. Теперь держим
  // минимум MIN_VISIBLE, потом гасим. + запись в журнал (показана / скрыта + сколько была видна) — чтобы
  // ТОЧНО знать по логам, показалась ли заставка и на сколько (раньше видно было только «загрузка завершена»).
  useEffect(() => {
    const clear = () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }
    clear()
    const MIN_VISIBLE = 3500 // v1.2.404: держим заставку ≥3.5с, чтобы анимация загрузки (счётчик+аватарки, ~3с) успела ПРОЙТИ на глазах, а не мелькнула
    if (show) {
      // v1.2.399: метку времени ставим по shownAtRef (а НЕ по !rendered) — при первом монтировании rendered
      // уже мог быть true (useState(show)), тогда старая проверка не ставила метку → в лог шла мусорная
      // «длительность» = сам таймстамп. Теперь метка ставится в ПЕРВЫЙ раз, когда show=true.
      if (!shownAtRef.current) {
        shownAtRef.current = Date.now()
        try { window.api?.send?.('app:log', { level: 'INFO', message: '[chatload] заставка ПОКАЗАНА' }) } catch (_) {}
        // v1.2.404: наш экран чатов появился → убираем стартовую заставку (index.html) → сразу видна ЖИВАЯ
        // анимация загрузки (без промежуточного «третьего» generic-экрана между стартовой и нашим экраном).
        try { window.__ccHideSplash?.() } catch (_) {}
      }
      setLeaving(false)
      setRendered(true)
    } else if (rendered) {
      const elapsed = Date.now() - (shownAtRef.current || Date.now())
      const wait = Math.max(0, MIN_VISIBLE - elapsed) // додержать до минимума, если загрузка была быстрой
      timersRef.current.push(setTimeout(() => {
        const wasVisible = shownAtRef.current ? (Date.now() - shownAtRef.current) : 0
        try { window.api?.send?.('app:log', { level: 'INFO', message: '[chatload] заставка скрыта, была видна ~' + wasVisible + 'мс' }) } catch (_) {}
        // v1.2.406: перед скрытием — фаза СКЕЛЕТА (серые строки списка ~1.1с), потом плавный уход → реальный список.
        setPhase('skeleton')
        timersRef.current.push(setTimeout(() => {
          setLeaving(true)
          timersRef.current.push(setTimeout(() => { setRendered(false); setLeaving(false); setPhase('circles'); shownAtRef.current = 0 }, 420)) // сброс → повторный показ снова с кружков
        }, 1100))
      }, wait))
    }
    return clear
  }, [show, rendered])

  // v1.2.394 (фикс #1): «итог» (общее число чатов) сохраняем ТОЛЬКО когда загрузка реально
  // завершилась (loadDone), а НЕ при любом скрытии заставки. Раньше сохранение висело в ветке
  // скрытия выше → если печатать в поиске во время загрузки, заставка пряталась и в память
  // попадало НЕПОЛНОЕ число (напр. 12 вместо 692). Теперь ключ — завершение, не скрытие.
  useEffect(() => {
    if (!loadDone) return
    const n = (store && store.chats && store.chats.length) || 0
    saveTotalHint(n) // saveTotalHint гардит n>0 → 0 чатов не перетрёт прошлый «итог»
    try {
      window.api?.send?.('app:log', { level: 'INFO', message: '[chatload] первая загрузка завершена: чатов=' + n + (n > 0 ? ', total сохранён' : ', total не сохранён (0)') })
    } catch (_) { /* лог не критичен */ }
  }, [loadDone])

  // Цикл подписи — раз в 620мс переходим к следующему имени.
  useEffect(() => {
    if (!rendered) return
    const id = setInterval(() => setTick(t => t + 1), 620)
    return () => clearInterval(id)
  }, [rendered])

  // v1.2.404: ВИДИМАЯ загрузка-анимация. Чаты приходят из кэша ОДНИМ пакетом (реального «по одному» нет),
  // поэтому показываем красивую анимацию: progress 0→1 за ~3с → счётчик растёт 0→total, аватарки проявляются
  // ПО ОДНОЙ, полоса заполняется. Так пользователь ВИДИТ загрузку, а не «0 из N → мгновенно список».
  // rAF в useEffect с очисткой (React docs «Synchronizing with Effects»).
  useEffect(() => {
    if (!rendered) { setProgress(0); return undefined }
    let raf, start = null
    const step = (t) => {
      if (start === null) start = t
      const p = Math.min(1, (t - start) / 3000)
      setProgress(p)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [rendered])

  if (!rendered) return null

  // Имена/аватары для кружков: сначала реальные (кэш) чаты, иначе аккаунты, иначе заглушка.
  const chats = (store && store.chats) || []
  const accounts = (store && store.accounts) || []
  let items = chats.slice(0, 5).map(c => ({ name: c.title || 'Чат', avatar: c.avatar || '' }))
  if (items.length === 0) items = accounts.slice(0, 5).map(a => ({ name: a.name || a.title || 'Аккаунт', avatar: a.avatar || '' }))
  if (items.length === 0) items = [{ name: 'Чаты', avatar: '' }]
  // добиваем до 5 кружков повтором (чтобы ряд был ровный)
  const circles = []
  for (let i = 0; i < 5; i++) circles.push(items[i % items.length])
  const loaded = chatsLen
  const total = Math.max(totalHint, loaded) // цель: из прошлого запуска или хотя бы «сколько уже»
  const current = items[tick % items.length]
  // v1.2.404: всё гонит progress (0→1 за ~3с)
  const displayCount = Math.round(progress * total) // счётчик растёт 0→total
  const revealed = Math.round(progress * circles.length) // сколько аватарок уже «проявилось»
  const pct = Math.round(progress * 100) // полоса

  return (
    <div className={'native-chatload' + (leaving ? ' native-chatload--leaving' : '')} aria-hidden="true">
      {/* v1.2.406: шапка «ЦентрЧатов» сверху (как на стартовой заставке) — единый вид.
          v1.2.443: над надписью — знак приложения (тот же, что в трее, на иконке и на
          стартовой заставке). Полосы «влетают» слева по очереди — видимый признак загрузки. */}
      <div className="native-chatload-brand">
        <svg className="native-chatload-mark" width="72" height="72" viewBox="0 0 64 64" aria-hidden="true">
          <g fill="none" stroke="#38bdf8" strokeWidth="5" strokeLinecap="round">
            <path className="native-chatload-bar" d="M3 18 H17" />
            <path className="native-chatload-bar" d="M3 32 H17" />
            <path className="native-chatload-bar" d="M3 46 H17" />
          </g>
          <rect x="22" y="10" width="38" height="34" rx="11" fill="none" stroke="#ffffff" strokeWidth="4.5" />
          <path d="M31 44 V57 L43 44 Z" fill="#ffffff" />
        </svg>
        <span className="native-chatload-brandtext">ЦентрЧатов</span>
      </div>
      {phase === 'skeleton' ? (
        /* v1.2.406: скелет списка — серые строки с бегущим бликом, плавный переход к реальному списку */
        <div className="native-chatload-skel">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="native-chatload-skelrow">
              <span className="native-chatload-skelav native-chatload-sk" />
              <div style={{ flex: 1 }}>
                <div className="native-chatload-skell1 native-chatload-sk" />
                <div className="native-chatload-skell2 native-chatload-sk" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="native-chatload-inner">
          <div className="native-chatload-avatars">
            {circles.map((c, i) => {
              const avOn = i < revealed && !!c.avatar // v1.2.404: аватарки проявляются ПО ОДНОЙ по мере прогресса
              return (
                <div key={i} className={'native-chatload-av native-chatload-' + GRADS[i % 5]}>
                  {!avOn && initial(c.name)}
                  {avOn && <span className="native-chatload-face" style={{ backgroundImage: `url("${c.avatar}")` }} />}
                  {avOn && <span className="native-chatload-ok">✓</span>}
                </div>
              )
            })}
          </div>
          <div className="native-chatload-name">Загружаем <b>{(current && current.name) || 'чаты'}</b>…</div>
          <div className="native-chatload-count">{total > 0 ? `Загружено ${displayCount} из ${total}` : 'Собираем чаты…'}</div>
          <div className="native-chatload-bar"><i style={{ width: pct + '%' }} /></div>
        </div>
      )}
    </div>
  )
}
