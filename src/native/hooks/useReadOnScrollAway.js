// v0.87.47: Вариант 2 (Telegram-style) — двойной IntersectionObserver center+away.
// Msg помечается прочитанным ТОЛЬКО если:
//   Фаза 1 (Seen): msg пересёк горизонтальную середину viewport → seenRef=true
//   Фаза 2 (Read): msg ушёл ВЫШЕ viewport (rect.bottom < rootBounds.top) И был seen
//
// Почему через "центр viewport" (vs 0.95 ratio в v0.87.43):
// Длинные msg (юридический текст, больше viewport) физически не могут набрать ratio>=0.95
// → seen НЕ срабатывал → счётчик не уменьшался. Логика "прошёл через центр экрана"
// работает независимо от размера msg: любое сообщение, которое юзер прокрутил мимо,
// обязательно пересекло центральную полосу viewport.
//
// Rootmargin '-49% 0 -49% 0' превращает root в тонкую горизонтальную полосу шириной
// во весь viewport и высотой 2% от viewport — это "зона чтения" в середине экрана.
//
// Защита (как в v0.87.43):
// - Initial render: msg появились ниже центра → isIntersecting=false → seen=false → read=false
// - Fast scroll через центр → seen=true, если msg успел уйти выше → read=true (это правильно:
//   юзер прокрутил сознательно)
// - Прыжок через кнопку ↓: обычный скролл не проходит через центр всех msg (IntersectionObserver
//   использует тротлинг), поэтому только реально проходящие через центр msg → seen.
import { useEffect, useRef } from 'react'

export function useReadOnScrollAway({ elementRef, onRead, onSeen, enabled = true, root = null }) {
  const seenRef = useRef(false)
  const readRef = useRef(false)

  useEffect(() => {
    if (!enabled || !elementRef.current) return
    seenRef.current = false
    readRef.current = false

    // Фаза 1 (Seen): msg пересекает центральную полосу viewport.
    // rootMargin negative top/bottom 49% → остаётся полоса 2% в центре.
    const seenObs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !seenRef.current) {
        seenRef.current = true
        onSeen?.()
      }
    }, { root, rootMargin: '-49% 0px -49% 0px', threshold: 0 })
    seenObs.observe(elementRef.current)

    // Фаза 2 (Read): msg ушёл ВЫШЕ viewport (rect.bottom < rootBounds.top) + был seen.
    // Обычный observer без rootMargin — отслеживает реальный viewport.
    const readObs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting || !seenRef.current || readRef.current) return
      const rootTop = entry.rootBounds?.top ?? 0
      if (entry.boundingClientRect.bottom < rootTop) {
        readRef.current = true
        onRead?.()
      }
    }, { root, threshold: 0 })
    readObs.observe(elementRef.current)

    return () => {
      seenObs.disconnect()
      readObs.disconnect()
    }
  }, [enabled])

  return { seenRef, readRef }
}
