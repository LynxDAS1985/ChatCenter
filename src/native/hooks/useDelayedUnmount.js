// v0.95.8: задержка unmount для exit-анимации.
//
// React не имеет встроенного механизма "анимация при удалении компонента" —
// при `{cond && <X/>}` элемент исчезает мгновенно, CSS transitions не успевают.
//
// Паттерн: пока visible=true → элемент в DOM (mounted=true).
// При visible→false → ставим leaving=true → ждём delayMs → unmount (mounted=false).
// При visible→true во время leaving → отменяем таймер, leaving=false (snap back).
//
// Эталон: Telegram Web K кнопка .bubbles-corner-button с transition opacity/transform.
// MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Using_CSS_animations
// React docs: https://react.dev/reference/react/Fragment (no built-in transitions)

import { useEffect, useRef, useState } from 'react'

export default function useDelayedUnmount(visible, delayMs = 220) {
  const [mounted, setMounted] = useState(!!visible)
  const [leaving, setLeaving] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (visible) {
      // Cancel any pending unmount, snap back to mounted state.
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setMounted(true)
      setLeaving(false)
      return undefined
    }
    if (!mounted) return undefined
    setLeaving(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setMounted(false)
      setLeaving(false)
    }, delayMs)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [visible, delayMs, mounted])

  return { mounted, leaving }
}
