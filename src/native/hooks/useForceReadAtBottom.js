// v0.87.34: Force mark-read когда пользователь прокручен в самый низ чата.
// v0.87.37: принимает maxEverSentRef чтобы не уменьшать watermark
// v0.87.49: добавлены диагностические логи force-read-* — понять почему
// последние 1-3 msg не помечаются при долистывании до конца.
// v0.91.13: threshold guard. При unread > FORCE_READ_MAX_UNREAD НЕ делаем
// mass-ack — ждём пока IntersectionObserver (read-batch-send) постепенно
// пометит видимые msg. Без этого открытие чата с большим unread → atBottom=true
// (при messages=1 height=client → bottomGap=0) → markRead(lastId) → TDLib
// viewMessages mass-acks ВСЕ msg ≤ lastId → бейдж 304→0 без реального чтения.
// Паттерн WhatsApp Web / Telegram Web K. Лог chatcenter.log 13:24:24-25.
import { useEffect } from 'react'
import { logNativeScroll } from '../utils/scrollDiagnostics.js'

export const FORCE_READ_MAX_UNREAD = 30

export function useForceReadAtBottom({ atBottom, activeChatId, activeMessages, activeUnread, markRead, maxEverSentRef }) {
  useEffect(() => {
    // v0.87.49: лог причины почему не запланировали таймер
    if (!atBottom || !activeChatId || activeMessages.length === 0 || activeUnread === 0) {
      const reason = !atBottom ? 'not-at-bottom'
        : !activeChatId ? 'no-chat'
        : activeMessages.length === 0 ? 'no-messages'
        : 'unread-zero'
      logNativeScroll('force-read-skip', { chatId: activeChatId, reason, atBottom, msgs: activeMessages.length, unread: activeUnread })
      return
    }
    // v0.91.13: при большом unread — НЕ mass-ack, ждём IntersectionObserver per-msg.
    if (activeUnread > FORCE_READ_MAX_UNREAD) {
      logNativeScroll('force-read-skip', {
        chatId: activeChatId, reason: 'unread-too-high',
        atBottom, msgs: activeMessages.length, unread: activeUnread,
        threshold: FORCE_READ_MAX_UNREAD,
      })
      return
    }
    const lastMsg = activeMessages[activeMessages.length - 1]
    const lastId = Number(lastMsg.id) || 0
    if (!lastId) {
      logNativeScroll('force-read-skip', { chatId: activeChatId, reason: 'no-last-id', lastMsg })
      return
    }
    // v0.87.37: Guard — не отправляем если maxId ≤ того что уже отправляли
    const maxEverSent = maxEverSentRef?.current || 0
    if (maxEverSent && lastId <= maxEverSent) {
      logNativeScroll('force-read-skip-guard', { chatId: activeChatId, lastId, maxEverSent })
      return
    }
    // v0.87.49: логируем планирование таймера — увидим в логе был ли он поставлен
    logNativeScroll('force-read-schedule', { chatId: activeChatId, lastId, unread: activeUnread, maxEverSent, atBottom })
    const t = setTimeout(() => {
      // v0.87.49: таймер СТРЕЛЬНУЛ — значит cleanup не успел отменить
      if (maxEverSentRef) maxEverSentRef.current = Math.max(maxEverSentRef.current || 0, lastId)
      logNativeScroll('force-read-fire', { chatId: activeChatId, lastId, unread: activeUnread })
      // v0.87.41: убран activeUnread — не вычитаем локально, ждём server sync
      markRead(activeChatId, lastId, { source: 'bottom' })
    }, 400)
    return () => {
      // v0.87.49: cleanup = deps changed; лог покажет ЧТО именно изменилось
      clearTimeout(t)
      logNativeScroll('force-read-cleanup', { chatId: activeChatId, lastId, atBottomAtSetup: atBottom, unreadAtSetup: activeUnread })
    }
  }, [atBottom, activeChatId, activeMessages.length, activeUnread])
}
