// v0.87.43: Вариант 5 (самый надёжный) — двойной IntersectionObserver.
// Msg помечается прочитанным ТОЛЬКО если:
//   Фаза 1: msg полностью (≥ 95%) был виден в viewport → seenRef=true
//   Фаза 2: msg ушёл ВЫШЕ viewport (boundingClientRect.bottom < 0) → onRead()
//
// Это защищает от:
// - Первый рендер (msg появился, но не прокручен мимо → не seen → не read)
// - Fast scroll (msg промелькнул, не набрал 95% → не seen)
// - Прыжки через кнопку ↓ (быстрый scroll, msg не set seen)
// - Layout shifts от media (IntersectionObserver сам пересчитывается)
import { useEffect, useRef } from 'react'

export function useReadOnScrollAway({ elementRef, onRead, onSeen, enabled = true }) {
  const seenRef = useRef(false)
  const readRef = useRef(false)  // не отправляем повторно

  useEffect(() => {
    if (!enabled || !elementRef.current) return
    // Сбрасываем при каждом re-subscribe (смена msg.id)
    seenRef.current = false
    readRef.current = false
    const obs = new IntersectionObserver(([entry]) => {
      // Фаза 1: полностью виден → seen
      if (entry.intersectionRatio >= 0.95 && !seenRef.current) {
        seenRef.current = true
        onSeen?.()
      }
      // Фаза 2: ушло выше viewport И был seen → read (один раз)
      if (!entry.isIntersecting
          && entry.boundingClientRect.bottom < 0
          && seenRef.current
          && !readRef.current) {
        readRef.current = true
        onRead?.()
      }
    }, { threshold: [0, 0.95] })
    obs.observe(elementRef.current)
    return () => obs.disconnect()
  }, [enabled])

  return { seenRef, readRef }
}
