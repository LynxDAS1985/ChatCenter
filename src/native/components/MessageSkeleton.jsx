// v0.87.36: Shimmer-плейсхолдеры для загружающегося чата.
// Если есть кэшированные сообщения — показываем их + overlay shimmer сверху,
// пока загружаются свежие (Вариант 5 из обсуждения — «кэш + shimmer»).
// Если кэша нет — показываем 4 серых плейсхолдера-сообщения.

import { useState, useEffect, useRef } from 'react'

export default function MessageSkeleton({ count = 4 }) {
  const widths = ['62%', '45%', '78%', '50%', '70%']
  const sides = [0, 1, 0, 0, 1]  // 0 = слева (входящее), 1 = справа (исходящее)
  const heights = [40, 56, 72, 40, 48]
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="native-msg-skeleton"
          style={{
            alignSelf: sides[i] ? 'flex-end' : 'flex-start',
            width: widths[i] || '60%',
            height: heights[i] || 44,
          }}
        >
          <div className="native-msg-skeleton-shimmer" />
        </div>
      ))}
    </>
  )
}

// Overlay-вариант: тонкая полоса-индикатор поверх содержимого пока идёт загрузка.
// v0.94.3: «отложенный + минимальная длительность» индикатор — убирает мигание.
//   1. hasContent (кэш уже виден): задержка 250мс перед показом. Быстрый refresh
//      (<250мс) НЕ покажет полосу вообще → нет мигания «вкл-выкл».
//   2. !hasContent (контент ещё скрыт, первый вход): показываем СРАЗУ (delay 0),
//      иначе чёрный экран (регрессия v0.89.37 — overlay обязан быть на пустом списке).
//   3. Если показалась — держим ≥400мс и плавно гаснем (CSS .native-msg-overlay--leaving).
//   4. Текст-пилюля «Обновляю...» убрана — оставлена только тонкая полоса (меньше шума).
// Паттерн отложенного действия: setTimeout в useEffect + очистка в cleanup
// (React docs «Synchronizing with Effects»).
export function MessageListOverlay({ show, hasContent = false }) {
  const [rendered, setRendered] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const shownAtRef = useRef(0)
  const timersRef = useRef([])

  useEffect(() => {
    const clear = () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }
    clear()
    if (show && !rendered) {
      const delay = hasContent ? 250 : 0
      if (delay === 0) {
        shownAtRef.current = Date.now()
        setRendered(true)
      } else {
        timersRef.current.push(setTimeout(() => {
          shownAtRef.current = Date.now()
          setRendered(true)
        }, delay))
      }
    } else if (show && rendered) {
      setLeaving(false)  // загрузка возобновилась — отменяем гашение
    } else if (!show && rendered) {
      const elapsed = Date.now() - shownAtRef.current
      const remain = Math.max(0, 400 - elapsed)  // минимум 400мс на экране
      timersRef.current.push(setTimeout(() => {
        setLeaving(true)  // плавное гашение (CSS transition)
        timersRef.current.push(setTimeout(() => {
          setRendered(false)
          setLeaving(false)
        }, 220))
      }, remain))
    }
    return clear
  }, [show, hasContent, rendered])

  if (!rendered) return null
  return (
    <div className={'native-msg-overlay' + (leaving ? ' native-msg-overlay--leaving' : '')}>
      <div className="native-msg-overlay-shimmer" />
    </div>
  )
}
