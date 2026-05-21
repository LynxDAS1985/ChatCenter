// v0.87.42: считал «новые сообщения снизу» через изменение lastMsgId массива.
// v0.91.3: ПЕРЕПИСАНО на event-based подход.
//
// Старая проблема (v0.87.42 → v0.91.2):
//   Hook реагировал на массив `messages`. Любое изменение массива (replace при
//   initial-load, prepend при load-older, append-newer при prefetch) могло
//   попасть под условие «lastMsgId изменился» и инкрементить newBelow.
//   В частности — initial-load заменял массив целиком, prevLastId (из preview
//   сообщения от updateChatLastMessage) НЕ присутствовал в новом массиве →
//   цикл доходил до конца → насчитывал ВСЁ окно (100 сообщений) как «новые».
//   Результат: кнопка «↓ 200» при unreadCount=0 (см. лог 14:54:34 → 14:55:23,
//   сумма 4 ложных new-below = 100+2+50+48 = 200).
//
// Новый подход (v0.91.3): подписываемся напрямую на TDLib event `tg:new-message`,
// который эмитится ТОЛЬКО для updateNewMessage (server push). Ответы на наши
// getChatHistory / getMessages приходят через `tg:messages` (другой канал) и
// этим хуком игнорируются.
//
// Сверено по стеку:
//   - TDLib spec: updateNewMessage = только server push, не response.
//     https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_new_message.html
//   - Telegram Desktop (mainwidget.cpp): Api::Updates::feedUpdate для updateNewMessage.
//   - WhatsApp Web (whatsmeow): events.Message — только server push.
//   - Discord: MESSAGE_CREATE gateway event vs REST response — counter только gateway.
//
// API:
//   activeChatId — какой чат сейчас активен (фильтр)
//   atBottom    — если true, не копим (юзер видит новое сам)
//   onAdded({ added, messageId, fromEvent }) — реальное новое сообщение
//   onSkip({ reason, ...info })              — диагностика (other-chat, outgoing, at-bottom)
import { useEffect, useRef } from 'react'

export function useNewBelowCounter({ activeChatId, atBottom, onAdded, onSkip }) {
  // Ref для atBottom — иначе зависимость useEffect от atBottom переподписывала
  // event handler каждый раз когда юзер достигает/уходит со дна (десятки раз в сек).
  // Стандартный React паттерн для stable handlers — см. react.dev/reference/react/useRef.
  const atBottomRef = useRef(atBottom)
  atBottomRef.current = atBottom

  useEffect(() => {
    if (!activeChatId) return
    if (typeof window === 'undefined' || !window.api?.on) return

    const unsub = window.api.on('tg:new-message', (payload) => {
      const chatId = payload?.chatId
      const message = payload?.message

      // Фильтр 1: только для активного чата
      if (chatId !== activeChatId) {
        onSkip?.({ reason: 'other-chat', chatId, activeChatId, messageId: message?.id })
        return
      }
      // Фильтр 2: только входящие (наши отправленные себе не считаем)
      if (message?.isOutgoing) {
        onSkip?.({ reason: 'outgoing', messageId: message.id })
        return
      }
      // Фильтр 3: юзер уже на дне — не копим бейдж (увидит сам)
      if (atBottomRef.current) {
        onSkip?.({ reason: 'at-bottom', messageId: message?.id })
        return
      }
      onAdded?.({ added: 1, messageId: message?.id, fromEvent: true })
    })

    return unsub
  }, [activeChatId])
}
