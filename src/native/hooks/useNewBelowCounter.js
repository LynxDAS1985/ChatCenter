// v0.87.42: считал «новые сообщения снизу» через изменение lastMsgId массива.
// v0.91.3: ПЕРЕПИСАНО на event-based подход.
//
// ⚠ ОБЯЗАТЕЛЬНО ПРОЧИТАТЬ ПЕРЕД ПРАВКОЙ:
// .memory-bank/mistakes/outgoing-two-cases.md — outgoing-сообщения бывают
// «свой echo (sending_state=pending)» и «своё с другого устройства
// (sending_state=null)». НЕ блокируй ВСЕ outgoing — это критичный production-баг
// (v0.95.36 фикс).
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
//   atBottom    — physically at bottom (≤30px от низа, БЕЗ Schmitt-trigger).
//                 Если true → НЕ копим counter, вместо этого вызываем onAutoScroll
//                 (Telegram-style: юзер у низа → auto-scroll к новому сообщению).
//   onAdded({ added, messageId, fromEvent })       — incoming + НЕ atBottom
//   onAutoScroll({ messageId })                    — incoming + atBottom (v0.95.28)
//   onSkip({ reason, ...info })                    — диагностика (other-chat, outgoing)
import { useEffect, useRef } from 'react'

export function useNewBelowCounter({ activeChatId, atBottom, onAdded, onSkip, onAutoScroll }) {
  // Ref для atBottom — иначе зависимость useEffect от atBottom переподписывала
  // event handler каждый раз когда юзер достигает/уходит со дна (десятки раз в сек).
  // Стандартный React паттерн для stable handlers — см. react.dev/reference/react/useRef.
  const atBottomRef = useRef(atBottom)
  atBottomRef.current = atBottom
  // v0.95.37: память id outgoing-pending — защита от повторных событий после
  // updateMessageSendSucceeded (TDLib меняет id с provisional на финальный).
  // Set очищается при unmount/смене чата (новый useEffect для каждого activeChatId).
  const seenOutgoingIdsRef = useRef(new Set())

  useEffect(() => {
    if (!activeChatId) return
    if (typeof window === 'undefined' || !window.api?.on) return
    // v0.95.37: чистим Set при смене активного чата (id из старого чата не должны
    // влиять на новый, теоретически id уникальны но защита тут.)
    seenOutgoingIdsRef.current = new Set()

    const unsub = window.api.on('tg:new-message', (payload) => {
      const chatId = payload?.chatId
      const message = payload?.message

      // Фильтр 1: только для активного чата
      if (chatId !== activeChatId) {
        onSkip?.({ reason: 'other-chat', chatId, activeChatId, messageId: message?.id })
        return
      }
      // Фильтр 2: outgoing с ЭТОЙ машины (handleReplySend сам делает scroll
      // через send-scroll-done) → skip. Outgoing с ДРУГОГО устройства (телефон /
      // Telegram Web) проходим дальше — для них тоже нужен auto-scroll.
      // v0.95.36: различаем через TDLib sending_state — null для уже-на-сервере
      // (другое устройство), pending/failed для локальных echo (своя машина).
      // Эталон: Telegram Web K pendingByRandomId, Telegram Desktop MessageFlag::FromUpdate.
      if (message?.isOutgoing && message?.isSending) {
        // v0.95.37: запоминаем id — если позже придёт повторное событие для того же
        // сообщения (например после updateMessageSendSucceeded с финальным id, или
        // backend пере-эмитит) → НЕ дёргаем auto-scroll. Set ограничен 50 элементами
        // (FIFO), чтобы не расти бесконечно.
        if (seenOutgoingIdsRef.current.size >= 50) {
          const first = seenOutgoingIdsRef.current.values().next().value
          seenOutgoingIdsRef.current.delete(first)
        }
        seenOutgoingIdsRef.current.add(String(message.id))
        onSkip?.({ reason: 'outgoing-pending', messageId: message.id })
        return
      }
      // v0.95.37: повторное событие для outgoing, уже пройденного (TDLib id mutation).
      if (message?.isOutgoing && seenOutgoingIdsRef.current.has(String(message?.id))) {
        onSkip?.({ reason: 'outgoing-already-seen', messageId: message.id })
        return
      }
      // v0.95.28: юзер physically у низа → Telegram-style auto-scroll к новому,
      // НЕ инкрементируем counter. Если onAutoScroll не передан — fallback на
      // старое поведение (skip). Это backward-compatible — старый код продолжит
      // работать без auto-scroll.
      // v0.95.37: добавлены поля isOutgoing/isSending для диагностики — потребитель
      // (InboxMode.onAutoScroll) логирует «outgoing-from-other-device» если
      // isOutgoing=true (т.е. это «своё с другого устройства»).
      if (atBottomRef.current) {
        if (onAutoScroll) {
          onAutoScroll({
            messageId: message?.id,
            isOutgoing: !!message?.isOutgoing,
            isSending: !!message?.isSending,
          })
        } else {
          onSkip?.({ reason: 'at-bottom', messageId: message?.id })
        }
        return
      }
      onAdded?.({
        added: 1,
        messageId: message?.id,
        fromEvent: true,
        isOutgoing: !!message?.isOutgoing,
        isSending: !!message?.isSending,
      })
    })

    return unsub
  }, [activeChatId])
}
