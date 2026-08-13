// v1.2.133: вынесено из nativeStoreIpc.js (TODO-14) — блок «превью последнего
// сообщения в списке чатов» (обработчик tg:chat-last-message + pending-очередь +
// метрика частоты). Вынос освободил место в nativeStoreIpc.js (был на потолке 660)
// под импорт единого правила префикса имени lastSenderLabel.
//
// ЗАЧЕМ отдельный путь tg:chat-last-message: TDLib шлёт updateChatLastMessage ОТДЕЛЬНО
// от updateNewMessage (при новом сообщении, удалении последнего, и в супергруппах с
// большим потоком — вместо тысяч updateNewMessage). Без этого превью в списке «застывало».
//
// v1.2.133 (фикс залипания имени, ADR-022): раньше этот путь менял ТЕКСТ превью, но не
// имя автора → после удаления/смены последнего сообщения показывался старый автор с новым
// текстом. Теперь событие несёт senderName+isOutgoing, и имя пересчитывается через
// то же единое правило lastSenderLabel, что и первичная загрузка / живой путь.
//
// Зависимости через DI (как nativeStoreSendIpc.js):
//   addHandler — обёртка window.api.on с auto-unsub
//   setState   — useState setter
//   logNativeScroll — диагностический логгер (метрика частоты)
// Возвращает { applyPendingLastMessage } — нужен обработчику tg:chats в nativeStoreIpc.js
// (применяет pending-обновления, пришедшие ДО появления чата в state).

import { lastSenderLabel } from '../../../shared/chatPreviewSender.js'

export function attachLastMsgHandlers({ addHandler, setState, logNativeScroll }) {
  // pending queue для событий, пришедших ДО chat в state.
  // TTL 30с — защита от утечки, если чат так и не появится (орфанные accountId).
  const pendingLastMessageRef = new Map()
  const PENDING_TTL_MS = 30000
  function pendingSet(chatId, value) {
    const existing = pendingLastMessageRef.get(chatId)
    if (existing?._timer) clearTimeout(existing._timer)
    const timer = setTimeout(() => {
      const cur = pendingLastMessageRef.get(chatId)
      if (cur?._timer === timer) pendingLastMessageRef.delete(chatId)
    }, PENDING_TTL_MS)
    pendingLastMessageRef.set(chatId, { ...value, _timer: timer })
  }
  function pendingTake(chatId) {
    const v = pendingLastMessageRef.get(chatId)
    if (!v) return null
    if (v._timer) clearTimeout(v._timer)
    pendingLastMessageRef.delete(chatId)
    return v
  }
  function applyPendingLastMessage(list) {
    if (pendingLastMessageRef.size === 0) return list
    return list.map(c => {
      const p = pendingTake(c.id)
      if (!p) return c
      // Timestamp guard: применяем только если pending новее
      if (p.lastMessageTs > 0 && p.lastMessageTs < (c.lastMessageTs || 0)) return c
      return {
        ...c,
        lastMessage: p.lastMessage,
        lastMessageTs: p.lastMessageTs || (c.lastMessageTs || 0),
        // v1.2.133: имя автора по единому правилу (тип чата — из state c).
        lastMessageSenderName: lastSenderLabel(c.type, p.senderName, p.isOutgoing),
        // v1.2.229/230: галочка прочтения в списке чатов — настоящий статус (см. flushPendingLastMsg).
        lastMessageIsOutgoing: p.isOutgoing,
        lastMessageId: p.lastMessageId,
        lastMessageRead: p.lastMessageRead,
        lastMessageSending: p.lastMessageSending,
      }
    })
  }

  // Метрика частоты (агрегатор по 30с-окну). В супергруппах событие частое — без
  // агрегации лог зашумится. При 0 событий за окно — лог не пишется.
  const LAST_MSG_WINDOW_MS = 30000
  let lastMsgWindowCount = 0
  let lastMsgWindowStaleSkipped = 0
  let lastMsgWindowPending = 0
  let lastMsgWindowTimer = null
  function recordLastMsgEvent(kind) {
    if (kind === 'applied') lastMsgWindowCount++
    else if (kind === 'stale') lastMsgWindowStaleSkipped++
    else if (kind === 'pending') lastMsgWindowPending++
    if (lastMsgWindowTimer) return
    lastMsgWindowTimer = setTimeout(() => {
      lastMsgWindowTimer = null
      const total = lastMsgWindowCount + lastMsgWindowStaleSkipped + lastMsgWindowPending
      if (total === 0) return
      logNativeScroll?.('chat-last-msg-window', {
        windowMs: LAST_MSG_WINDOW_MS,
        applied: lastMsgWindowCount,
        staleSkipped: lastMsgWindowStaleSkipped,
        pending: lastMsgWindowPending,
      })
      lastMsgWindowCount = 0
      lastMsgWindowStaleSkipped = 0
      lastMsgWindowPending = 0
    }, LAST_MSG_WINDOW_MS)
  }

  // rAF-батчинг (Проблема 3, Maximum update depth): при старте TDLib эмитит сотни
  // updateChatLastMessage за <2с. rAF собирает все события кадра в ОДИН setState.
  // Dedupe по chatId — оставляем последнее значение.
  let pendingLastMsg = []
  let lastMsgRafScheduled = false
  function flushPendingLastMsg() {
    lastMsgRafScheduled = false
    if (pendingLastMsg.length === 0) return
    const batch = pendingLastMsg; pendingLastMsg = []
    const byChatId = new Map()
    for (const item of batch) byChatId.set(item.chatId, item)  // dedupe → last wins
    setState(s => {
      let chatsChanged = false
      const nextChats = s.chats.map(chat => {
        const item = byChatId.get(chat.id)
        if (!item) return chat
        byChatId.delete(chat.id)
        if (item.ts > 0 && item.ts < (chat.lastMessageTs || 0)) {
          recordLastMsgEvent('stale')
          return chat
        }
        recordLastMsgEvent('applied')
        chatsChanged = true
        return {
          ...chat,
          lastMessage: item.text,
          lastMessageTs: item.ts || (chat.lastMessageTs || 0),
          // v1.2.133: имя автора по единому правилу (фикс залипания, ADR-022).
          lastMessageSenderName: lastSenderLabel(chat.type, item.senderName, item.isOutgoing),
          // v1.2.229/230: галочка прочтения в списке чатов. Статус берём НАСТОЯЩИЙ из события
          // (backend посчитал по last_read_outbox_message_id, как mapChat), а НЕ «всегда false».
          // Иначе повторные updateChatLastMessage на старте (сотни) гасили зелёную двойную.
          lastMessageIsOutgoing: item.isOutgoing,
          lastMessageId: item.lastMessageId,
          lastMessageRead: item.lastMessageRead,
          lastMessageSending: item.lastMessageSending,
        }
      })
      // Оставшиеся (chat нет в state) → pending queue (с именем автора + статус галочки).
      for (const [chatId, item] of byChatId) {
        pendingSet(chatId, {
          lastMessage: item.text, lastMessageTs: item.ts, senderName: item.senderName, isOutgoing: item.isOutgoing,
          lastMessageId: item.lastMessageId, lastMessageRead: item.lastMessageRead, lastMessageSending: item.lastMessageSending,
        })
        recordLastMsgEvent('pending')
      }
      return chatsChanged ? { ...s, chats: nextChats } : s
    })
  }
  addHandler('tg:chat-last-message', ({ chatId, lastMessage, lastMessageTs, senderName, isOutgoing, lastMessageId, lastMessageRead, lastMessageSending }) => {
    if (!chatId) return
    pendingLastMsg.push({
      chatId,
      ts: Number(lastMessageTs) || 0,
      text: typeof lastMessage === 'string' ? lastMessage : '',
      senderName: senderName || '',
      isOutgoing: !!isOutgoing,
      // v1.2.230: настоящий статус галочки прочтения (посчитан backend по last_read_outbox).
      lastMessageId: lastMessageId || null,
      lastMessageRead: !!lastMessageRead,
      lastMessageSending: !!lastMessageSending,
    })
    if (!lastMsgRafScheduled) {
      lastMsgRafScheduled = true
      requestAnimationFrame(flushPendingLastMsg)
    }
  })

  return { applyPendingLastMessage }
}
