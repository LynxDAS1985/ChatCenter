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
  const timersRef = useRef([])

  // Показ/скрытие с плавным финалом: при show=false держим ещё ~420мс (CSS fade), потом unmount.
  useEffect(() => {
    const clear = () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }
    clear()
    if (show) {
      setLeaving(false)
      setRendered(true)
    } else if (rendered) {
      setLeaving(true)
      timersRef.current.push(setTimeout(() => { setRendered(false); setLeaving(false) }, 420))
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
  const loaded = chats.length
  const total = Math.max(totalHint, loaded) // цель: знаем из прошлого запуска или хотя бы «сколько уже»
  const current = items[tick % items.length]

  return (
    <div className={'native-chatload' + (leaving ? ' native-chatload--leaving' : '')} aria-hidden="true">
      <div className="native-chatload-inner">
        <div className="native-chatload-avatars">
          {circles.map((c, i) => (
            <div
              key={i}
              className={'native-chatload-av' + (c.avatar ? ' native-chatload-photo' : ' native-chatload-' + GRADS[i % 5])}
              style={c.avatar ? { backgroundImage: `url("${c.avatar}")` } : undefined}
            >
              {!c.avatar && initial(c.name)}
              <span className="native-chatload-ok">✓</span>
            </div>
          ))}
        </div>
        <div className="native-chatload-name">Загружаем <b>{(current && current.name) || 'чаты'}</b>…</div>
        <div className="native-chatload-count">{total > 0 ? `Загружено ${loaded} из ${total}` : 'Собираем чаты…'}</div>
      </div>
    </div>
  )
}
