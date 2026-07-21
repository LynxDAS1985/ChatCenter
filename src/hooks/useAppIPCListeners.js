// v0.87.82: вынесено из App.jsx — IPC listeners + автообновление логов + автосброс.
// Сюда переехали 4 useEffect:
//   1. window-state — фокус окна → windowFocusedRef
//   2. messenger:badge — счётчики мессенджеров + звук уведомления
//   3. notif log polling — обновление лога каждые 3 сек когда открыт NotifLogModal
//   4. notifCount auto-reset — сбрасывает счётчик при viewing активной вкладки

import { useEffect } from 'react'
import { devLog } from '../utils/devLog.js'
import { playNativeNotificationSound } from '../utils/sound.js'

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
    return window.api?.on('notif:play-sound', ({ messengerId /* , color */ }) => {
      if (!messengerId || !String(messengerId).startsWith('native_')) return
      const s = settingsRef.current || {}
      if (s.soundEnabled === false) return
      if ((s.mutedMessengers || {})[messengerId]) return
      const mNotifs = (s.messengerNotifs || {})[messengerId] || {}
      if (mNotifs.sound === false) return
      const lastSnd = lastSoundTsRef.current[messengerId] || 0
      if (Date.now() - lastSnd < 3000) return  // throttle 3s (как WebView)
      // v1.2.13: специальный «Бамбук+» звук для Native (выбран юзером из 25 вариантов).
      // Низкие тёплые ноты + лёгкий sparkle — технологичный, мягкий, не напрягает.
      // WebView режимы используют playNotificationSound(color) — color-based система.
      playNativeNotificationSound()
      lastSoundTsRef.current[messengerId] = Date.now()
      try { traceNotif?.('sound', 'pass', messengerId, '', 'native bamboo-plus sound') } catch (_) {}
    })
  }, [])

  // 6. v1.2.65: открыть фото альбома из карточки уведомления в смотрелке.
  //    Окно уведомления шлёт notif:open-photo → main пересылает notify:open-album.
  //    Качаем полноразмеры всех фото альбома (thumb:false) и открываем ту же смотрелку
  //    (photo:open) что и в чате. Граничные: нет интернета/файл не скачался → фото
  //    отфильтровываются, смотрелка откроется только с успешными (пусто → не открываем).
  useEffect(() => {
    return window.api?.on('notify:open-album', async ({ chatId, messageIds, index }) => {
      if (!chatId || !Array.isArray(messageIds) || !messageIds.length) return
      const ids = messageIds.filter(m => m != null)
      if (!ids.length) return
      const clicked = Math.max(0, Math.min(ids.length - 1, index || 0))
      // v1.2.74 (B1): нажатое фото — открываем смотрелку СРАЗУ, не ждём остальные.
      const one = await window.api.invoke('tg:download-media', { chatId, messageId: ids[clicked], thumb: false }).catch(() => null)
      if (one && one.ok) { try { window.api.invoke('photo:open', { srcs: [one.path], index: 0 }) } catch (_) {} }
      // Остальные фото — в фоне, затем обновляем список в уже открытой смотрелке
      // (photo:open переиспользует окно через photo:set-srcs — см. photoViewerHandler.js).
      const results = await Promise.all(ids.map((mid, i) =>
        i === clicked ? Promise.resolve(one)
          : window.api.invoke('tg:download-media', { chatId, messageId: mid, thumb: false }).catch(() => null)
      ))
      const srcs = results.map(r => (r && r.ok) ? r.path : null).filter(Boolean)
      if (srcs.length <= 1) return
      const clickedSrc = one && one.ok ? one.path : null
      const newIndex = clickedSrc ? Math.max(0, srcs.indexOf(clickedSrc)) : 0
      try { window.api.invoke('photo:open', { srcs, index: newIndex }) } catch (_) {}
    })
  }, [])

  // v1.2.101: клик по ВИДЕО в уведомлении → скачать и открыть видео-плеер (как в чате).
  useEffect(() => {
    return window.api?.on('notify:open-video', async ({ chatId, messageId }) => {
      if (!chatId || messageId == null) return
      const r = await window.api.invoke('tg:download-video', { chatId, messageId }).catch(() => null)
      try { if (r && r.ok && r.path) window.api.invoke('video:open', { src: r.path }); window.api.send('notif:video-done', { messageId: String(messageId) }) } catch (_) {} // v1.2.104: плеер + снять крутилку по факту
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
