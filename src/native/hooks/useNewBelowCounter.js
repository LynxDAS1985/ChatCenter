// v0.87.42: extract newBelow counting logic into testable hook.
// Считает «новые сообщения снизу» по изменению lastMsgId, а не по размеру массива.
// Это защищает от ложного срабатывания при prepend (load-older) когда массив
// вырастает за счёт добавления СТАРЫХ в начало.
// v0.87.52: принимает chatId — при его смене prevLastIdRef сбрасывается, чтобы
// смена чата НЕ считалась как "новое сообщение снизу". Баг был: Geely пришло 33
// новых → переключился на Автопоток → +8 из Автопотока = стрелка 41 вместо 8.
import { useEffect, useRef } from 'react'

export function useNewBelowCounter({ messages, atBottom, chatId, onAdded, onSkip }) {
  const prevLastIdRef = useRef(messages[messages.length - 1]?.id)
  const prevChatIdRef = useRef(chatId)

  useEffect(() => {
    const prevLastId = prevLastIdRef.current
    const nowLastId = messages[messages.length - 1]?.id

    // v0.87.52: сменился чат — reset, НЕ считаем как "новое снизу"
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId
      prevLastIdRef.current = nowLastId
      onSkip?.({ reason: 'chat-switch', prevLastId, nowLastId })
      return
    }

    prevLastIdRef.current = nowLastId

    // prepend / init / empty — не считаем
    if (!prevLastId || !nowLastId || prevLastId === nowLastId) {
      onSkip?.({ reason: prevLastId === nowLastId ? 'prepend-or-same' : 'init', prevLastId, nowLastId })
      return
    }
    if (atBottom) return

    // Считаем реально новые ПОСЛЕ prevLastId
    let added = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].id === prevLastId) break
      if (!messages[i].isOutgoing) added++
    }
    if (added > 0) onAdded?.({ added, prevLastId, nowLastId })
  }, [messages[messages.length - 1]?.id, atBottom, chatId])
}
