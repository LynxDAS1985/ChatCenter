// useBadgeSync.js — Badge/tray overlay update
import { useEffect, useRef } from 'react'
import { devLog } from '../utils/devLog.js'

/**
 * @param {Object} deps
 * @param {Object} deps.unreadCounts - { [id]: number }
 * @param {Object} deps.unreadSplit - { [id]: { personal, channels } }
 * @param {Array} deps.messengers
 * @param {React.MutableRefObject} deps.settingsRef
 * @param {Object} deps.settings
 */
export default function useBadgeSync({ unreadCounts, unreadSplit, messengers, settingsRef, settings }) {
  const overlayTimerRef = useRef(null)

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  // For messengers without split (MAX, VK, WhatsApp) — all unreadCount counts as personal
  const totalPersonalWithFallback = Object.entries(unreadCounts).reduce((sum, [id, count]) => {
    if (count <= 0) return sum
    const split = unreadSplit[id]
    if (split) return sum + (split.personal || 0)
    return sum + count
  }, 0)

  const totalChannels = Object.entries(unreadSplit).reduce((sum, [id, split]) => {
    if (split && split.channels > 0) return sum + split.channels
    return sum
  }, 0)

  useEffect(() => {
    const splitDetails = Object.entries(unreadCounts).filter(([,v]) => v > 0).map(([id, v]) => {
      const split = unreadSplit[id]
      return `${id.slice(0,12)}:count=${v},split=${split ? `p${split.personal}c${split.channels}` : 'NONE'}`
    }).join(' | ')
    devLog(`[BADGE] total=${totalUnread} personal=${totalPersonalWithFallback} channels=${totalChannels} mode=${settingsRef.current.overlayMode} [${splitDetails}]`)

    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    overlayTimerRef.current = setTimeout(() => {
      const breakdown = Object.entries(unreadCounts)
        .filter(([, v]) => v > 0)
        .map(([id, v]) => {
          const m = messengers.find(x => x.id === id)
          const split = unreadSplit[id]
          return { name: m?.name || id, count: v, personal: split?.personal, channels: split?.channels }
        })
      const overlayMode = settingsRef.current.overlayMode || 'personal'
      devLog(`[BADGE] FIRE tray:set-badge count=${totalUnread} personal=${totalPersonalWithFallback} channels=${totalChannels} mode=${overlayMode}`)
      window.api?.invoke('tray:set-badge', { count: totalUnread, personal: totalPersonalWithFallback, channels: totalChannels, breakdown, overlayMode })
    }, 500)
    return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current) }
  }, [totalUnread, totalPersonalWithFallback, totalChannels, settings.overlayMode])

  return { totalUnread, totalPersonalWithFallback, totalChannels }
}
