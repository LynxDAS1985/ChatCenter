import { useEffect, useRef } from 'react'
import { getScrollMetrics, logNativeScroll } from '../utils/scrollDiagnostics.js'

export function useScrollDiagnostics({ activeChatId, activeChat, activeMessages, activeUnread, loading, scrollRef }) {
  const openedAtRef = useRef(0)
  const lastUserRef = useRef({ at: 0, type: 'none' })
  const lastTopLogRef = useRef(0)
  const bottomStateRef = useRef(null)

  const context = () => {
    const now = Date.now()
    return {
      chatId: activeChatId || null,
      sinceOpenMs: openedAtRef.current ? now - openedAtRef.current : null,
      lastUserType: lastUserRef.current.type,
      lastUserAgoMs: lastUserRef.current.at ? now - lastUserRef.current.at : null,
    }
  }

  const logEvent = (event, data = {}) => {
    logNativeScroll(event, { ...context(), ...data, ...getScrollMetrics(scrollRef.current) })
  }

  useEffect(() => {
    openedAtRef.current = Date.now()
    lastUserRef.current = { at: 0, type: 'none' }
    lastTopLogRef.current = 0
    bottomStateRef.current = null
    if (activeChatId) logEvent('chat-open', { title: activeChat?.title || '', unread: activeUnread, messages: activeMessages.length, loading: !!loading })
  }, [activeChatId])

  useEffect(() => {
    if (activeChatId) logEvent('chat-state', { unread: activeUnread, messages: activeMessages.length, loading: !!loading })
  }, [activeChatId, activeMessages.length, activeUnread, loading])

  const markUserScroll = (type) => {
    lastUserRef.current = { at: Date.now(), type }
    logEvent('user-scroll-intent', { type })
  }

  const observeScroll = (nearBottom, loadingOlder) => {
    if (bottomStateRef.current !== nearBottom) {
      bottomStateRef.current = nearBottom
      logEvent('bottom-state', { nearBottom })
    }
    const el = scrollRef.current
    if (!el || el.scrollTop >= 100) return
    const now = Date.now()
    if (now - lastTopLogRef.current < 500) return
    lastTopLogRef.current = now
    logEvent('top-threshold', { nearBottom, loadingOlder })
  }

  return { logEvent, markUserScroll, observeScroll }
}
