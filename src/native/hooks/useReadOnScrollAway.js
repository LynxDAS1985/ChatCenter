import { useEffect, useRef } from 'react'
import { logNativeScroll } from '../utils/scrollDiagnostics.js'

// Shared native Telegram read tracker for private chats, groups, channels and forum topics.
// It uses the real message scroll container as IntersectionObserver.root.
// A message is not marked read on initial open; it becomes read after the user scrolls it
// through the middle reading line and it leaves that line upward.
export function useReadOnScrollAway({ elementRef, onRead, onSeen, enabled = true, root = null, msgId = null }) {
  const seenRef = useRef(false)
  const readRef = useRef(false)
  const initialSeenRef = useRef(false)

  useEffect(() => {
    if (!enabled || !elementRef.current) return
    seenRef.current = false
    readRef.current = false
    initialSeenRef.current = false

    const obs = new IntersectionObserver(([entry]) => {
      if (!entry) return

      if (!initialSeenRef.current) {
        initialSeenRef.current = true
        if (entry.isIntersecting) {
          seenRef.current = true
          logNativeScroll('read-line-initial', { msgId, intersecting: true })
        } else {
          logNativeScroll('read-line-initial', { msgId, intersecting: false })
        }
        return
      }

      if (entry.isIntersecting && !seenRef.current) {
        seenRef.current = true
        onSeen?.()
        logNativeScroll('read-line-seen', { msgId })
        return
      }

      if (entry.isIntersecting || !seenRef.current || readRef.current) return
      const rootTop = entry.rootBounds?.top ?? 0
      const wentAboveReadLine = entry.boundingClientRect?.bottom < rootTop
      if (!wentAboveReadLine) return

      readRef.current = true
      onRead?.()
      logNativeScroll('read-line-read', { msgId })
    }, { root, rootMargin: '-48% 0px -48% 0px', threshold: 0 })

    obs.observe(elementRef.current)
    return () => obs.disconnect()
  }, [enabled, root])

  return { seenRef, readRef }
}
