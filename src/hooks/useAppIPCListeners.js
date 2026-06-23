// v0.87.82: вынесено из App.jsx — IPC listeners + автообновление логов + автосброс.
// Сюда переехали 4 useEffect:
//   1. window-state — фокус окна → windowFocusedRef
//   2. messenger:badge — счётчики мессенджеров + звук уведомления
//   3. notif log polling — обновление лога каждые 3 сек когда открыт NotifLogModal
//   4. notifCount auto-reset — сбрасывает счётчик при viewing активной вкладки

import { useEffect } from 'react'
import { devLog } from '../utils/devLog.js'
import { playNotificationSound } from '../utils/sound.js'

export default function useAppIPCListeners({
  windowFocusedRef,
  settingsRef,
  messengersRef,
  lastSoundTsRef,
  notifCountRef,
  webviewRefs,
  pipelineTraceRef,
  activeId,
  notifLogModal,
  setUnreadCounts,
  setNotifLogModal,
  traceNotif,
}) {
  // 1. window-state
  useEffect(() => {
    return window.api?.on('window-state', (state) => {
      windowFocusedRef.current = state.focused
    })
  }, [])

  // 2. v1.2.12: УДАЛЁН listener `messenger:badge` — мёртвый код.
  //    В api.md был помечен «будет использован ChatMonitor в Фазе 3», но Фаза 3
  //    давно прошла (мы в v1.2.12+), канал так и не получил эмиттера. Звук для
  //    WebView режимов играется напрямую в renderer:
  //    - webviewHandleNewMessage.js:89 (новое сообщение)
  //    - webviewSetup.js:418, 494 (title-fallback + unread-count рост)
  //    Звук для Native — через listener `notif:play-sound` (пункт 5 ниже).
  //    Полное удаление документировано в .memory-bank/api.md.

  // 3. Автообновление лога уведомлений (если NotifLogModal открыт)
  useEffect(() => {
    if (!notifLogModal) return
    const mid = notifLogModal.messengerId
    const interval = setInterval(() => {
      const wv = webviewRefs.current[mid]
      if (!wv) return
      wv.executeJavaScript(`(function() { return JSON.stringify(window.__cc_notif_log || []); })()`)
        .then(json => {
          try {
            const log = JSON.parse(json)
            const trace = pipelineTraceRef.current.filter(e => !e.mid || e.mid === mid)
            setNotifLogModal(prev => prev && prev.messengerId === mid ? { ...prev, log, trace } : prev)
          } catch {}
        }).catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [notifLogModal?.messengerId])

  // 5. v1.2.12-fix: notif:play-sound — звук для Native-режимов.
  //    WebView (ВК/WhatsApp/Telega/MAX) играют звук сами в renderer
  //    (webviewHandleNewMessage.js:89) — мы фильтруем по `native_*` чтобы не дублировать.
  //    Триггер: mainIpcHandlers.js → app:custom-notify → если Native и ribbon
  //    разрешён → шлёт `notif:play-sound { messengerId, color }`.
  //    Логика проверок такая же как в WebView (см. webviewHandleNewMessage.js:79-99):
  //    soundEnabled (глобальный) + !mutedMessengers[id] + messengerNotifs[id].sound +
  //    throttle 3 сек (общий lastSoundTsRef для всех мессенджеров).
  //    Подробности — .memory-bank/mistakes/notifications-ribbon.md.
  useEffect(() => {
    return window.api?.on('notif:play-sound', ({ messengerId, color }) => {
      if (!messengerId || !String(messengerId).startsWith('native_')) return
      const s = settingsRef.current || {}
      if (s.soundEnabled === false) return
      if ((s.mutedMessengers || {})[messengerId]) return
      const mNotifs = (s.messengerNotifs || {})[messengerId] || {}
      if (mNotifs.sound === false) return
      const lastSnd = lastSoundTsRef.current[messengerId] || 0
      if (Date.now() - lastSnd < 3000) return  // throttle 3s (как WebView)
      playNotificationSound(color)
      lastSoundTsRef.current[messengerId] = Date.now()
      try { traceNotif?.('sound', 'pass', messengerId, '', 'native ribbon sound') } catch (_) {}
    })
  }, [])

  // 4. v0.75.5: Автосброс notifCountRef при переключении на вкладку
  useEffect(() => {
    if (!activeId) return
    const timer = setTimeout(() => {
      if (notifCountRef.current[activeId] > 0 && windowFocusedRef.current) {
        devLog(`[BADGE] auto-reset notifCountRef[${activeId}] = ${notifCountRef.current[activeId]} → 0 (viewing)`)
        notifCountRef.current[activeId] = 0
        setUnreadCounts(prev => {
          if (prev[activeId] > 0) return { ...prev, [activeId]: 0 }
          return prev
        })
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [activeId])
}
