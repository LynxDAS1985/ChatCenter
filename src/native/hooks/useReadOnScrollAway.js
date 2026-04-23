// v0.87.51: msg считается прочитанным как только появился в viewport.
// Один IntersectionObserver с threshold=0 — срабатывает при появлении хоть одного пикселя.
// Защита от mass-read при открытии чата: msg которые УЖЕ в viewport при первом callback
// пропускаются (initial). Только msg которые появились из-за скролла → onRead().
//
// Почему так, а не через "центр" (v0.87.47): observer с rootMargin тротлит callbacks при
// быстром скролле → msg "пролетает" мимо центра без регистрации. threshold=0 срабатывает
// на появление — не пропускает.
import { useEffect, useRef } from 'react'
import { logNativeScroll } from '../utils/scrollDiagnostics.js'

export function useReadOnScrollAway({ elementRef, onRead, onSeen, enabled = true, root = null, msgId = null }) {
  const seenRef = useRef(false)
  const readRef = useRef(false)
  const initialGuardRef = useRef(true)

  useEffect(() => {
    if (!enabled || !elementRef.current) return
    seenRef.current = false
    readRef.current = false
    initialGuardRef.current = true

    const obs = new IntersectionObserver(([entry]) => {
      // v0.87.51: первый callback — initial state. Если msg уже в viewport при mount →
      // это НЕ прочтение (open-chat). Просто фиксируем что msg "initially visible/hidden".
      if (initialGuardRef.current) {
        initialGuardRef.current = false
        if (entry.isIntersecting) {
          // Msg виден при открытии — мог быть прочитан юзером ранее, не трогаем.
          seenRef.current = true  // чтобы НЕ сработать при первом "уходе и возврате"
          logNativeScroll('read-initial-visible', { msgId })
        } else {
          // Msg скрыт при открытии — ждём пока появится (скроллом)
          logNativeScroll('read-initial-hidden', { msgId })
        }
        return
      }

      // Любое ПОСЛЕДУЮЩЕЕ появление в viewport = юзер его увидел при скролле → read
      if (entry.isIntersecting && !readRef.current) {
        readRef.current = true
        onSeen?.()
        onRead?.()
        logNativeScroll('read-fire', { msgId })
      }
    }, { root, threshold: 0 })
    obs.observe(elementRef.current)

    return () => obs.disconnect()
  }, [enabled])

  return { seenRef, readRef }
}
