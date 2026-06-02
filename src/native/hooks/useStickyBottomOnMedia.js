// v0.95.40: ResizeObserver — удерживает scroll у низа при lazy-load медиа.
//
// Проблема: юзер у низа → пришло сообщение с фото → onAutoScroll смотрит
// scrollHeight ДО загрузки картинки → плавный scroll к низу. Через ~500мс
// картинка загружается → scrollHeight увеличивается → юзер визуально оказывается
// выше низа («сообщение под viewport»).
//
// Решение: ResizeObserver на scrollContainer. При любом изменении scrollHeight,
// если юзер БЫЛ у низа (wasAtBottomRef.current=true) — instant `el.scrollTop =
// scrollHeight`. Без анимации — иначе будет 2 движения одновременно и дёрганье.
//
// Эталоны (production 2026):
// - Telegram Web K bubbles.ts: ResizeObserver + scrollToEnd при media load
// - Discord: MutationObserver + img onload triggers scroll
// - Slack: <img onload> → scrollIntoView если был у низа
//
// Безопасность:
// - Throttle через requestAnimationFrame — ResizeObserver fires часто
// - Условие wasAtBottomRef — если юзер крутит вверх, scroll НЕ дёргается
// - Только если delta > 4px — фильтр от мелких изменений (font baseline)
//
// Использование: useStickyBottomOnMedia(scrollRef, atBottomRef) в InboxMode.

import { useEffect } from 'react'

const MIN_HEIGHT_DELTA_PX = 4

export function useStickyBottomOnMedia(scrollRef, atBottomRef) {
  useEffect(() => {
    const el = scrollRef?.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lastHeight = el.scrollHeight
    let rafScheduled = false
    const ro = new ResizeObserver(() => {
      if (rafScheduled) return
      rafScheduled = true
      requestAnimationFrame(() => {
        rafScheduled = false
        const newHeight = el.scrollHeight
        const delta = newHeight - lastHeight
        lastHeight = newHeight
        if (delta < MIN_HEIGHT_DELTA_PX) return  // высота не выросла или мелкая дельта
        if (!atBottomRef?.current) return         // юзер не у низа — не трогаем scroll
        // Instant — не smooth, иначе дёрганье с одновременной анимацией auto-scroll.
        el.scrollTop = el.scrollHeight
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollRef, atBottomRef])
}
