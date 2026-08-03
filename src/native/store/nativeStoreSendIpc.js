// v1.2.12: разбиение nativeStoreIpc.js (превысил ceiling 730).
// Извлечены 3 handler'а связанные со СТАТУСОМ отправки/печати:
//   - tg:typing            — индикатор «печатает...»
//   - tg:send-succeeded    — провизорный id заменился финальным (фикс дубля)
//   - tg:upload-progress   — прогресс UPLOAD файлов (sendFile / sendAlbum)
// Все три обновляют state без сторонней логики (нет network / нет других IPC).
// Контракт `attachTelegramIpcListeners` снаружи НЕ изменён — это внутренний рефакторинг.
//
// Зависимости передаются через DI:
//   addHandler — обёртка над window.api.on с auto-unsub.
//   setState   — useState setter из nativeStore.js.
//   stateRef   — ref на текущий state.
//   logNativeScroll — диагностический логгер из scrollDiagnostics.
//
// Подробности проблемы которая привела к разбиению — features.md v1.2.12.
// Спам-логгер __ccLogBubbleRender забил IPC очередь, лимиты файлов перестали запасться.

export function attachSendIpcHandlers({ addHandler, setState, stateRef, logNativeScroll }) {
  // v0.87.14: typing-индикатор
  // v0.95.31: множественный typing — state.typing[chatId] теперь Map<userId, {senderName, at}>.
  // Эталоны: Telegram Web K / Desktop — «Иван печатает...» (1) / «Иван и Маша печатают...» (2-3) /
  // «3 человека печатают...» (4+). Раньше хранили ОДНОГО юзера → теряли информацию когда
  // в чате печатают сразу несколько (TDLib эмитит updateChatAction для каждого отдельно).
  addHandler('tg:typing', ({ chatId, userId, senderName, action }) => {
    setState(s => {
      const prevForChat = s.typing?.[chatId] || {}
      if (action) { // v1.2.170: action — ключ действия ('typing'|'voice'|'photo'|…); null → снять
        return {
          ...s,
          typing: {
            ...s.typing,
            [chatId]: {
              ...prevForChat,
              [userId]: { senderName: senderName || '', at: Date.now(), action },
            },
          },
        }
      } else {
        // Удаляем конкретного userId из Map
        const next = { ...prevForChat }
        delete next[userId]
        const nextTyping = { ...s.typing }
        if (Object.keys(next).length === 0) delete nextTyping[chatId]
        else nextTyping[chatId] = next
        return { ...s, typing: nextTyping }
      }
    })
    // Автоматически истекает через 6.5 сек (как formatTypingUsers TYPING_TIMEOUT_MS).
    // TDLib re-эмитит updateChatAction каждые 5-6с, если давно нет — юзер закончил.
    if (action) {
      setTimeout(() => setState(s => {
        const prevForChat = s.typing?.[chatId]
        if (!prevForChat || !prevForChat[userId]) return s
        const next = { ...prevForChat }
        delete next[userId]
        const nextTyping = { ...s.typing }
        if (Object.keys(next).length === 0) delete nextTyping[chatId]
        else nextTyping[chatId] = next
        return { ...s, typing: nextTyping }
      }), 6500)
    }
  })

  // v1.2.171: ЖИВОЙ статус собеседника (в сети / был(а) в HH:MM / недавно).
  // TDLib updateUserStatus → мост tg:user-status → сюда. Раньше этот канал НИКТО не
  // слушал: статус ставился один раз при загрузке чата (mapChat) и больше не менялся.
  // Обновляем ВСЕ чаты этого пользователя (userId проставлен в Chat, tdlibMapper).
  // isOnline/lastSeenAt/userStatusType уже разобраны мостом (mapUserStatus).
  addHandler('tg:user-status', ({ accountId, userId, isOnline, lastSeenAt, userStatusType } = {}) => {
    if (userId == null) return
    const uid = String(userId)
    setState(s => {
      // v1.2.172 (ревью #1): updateUserStatus — ОЧЕНЬ частый сигнал (для любого юзера,
      // в т.ч. без открытого чата). Пересобирать массив chats на каждый = лишние
      // перерисовки списка. Обновляем только если реально есть совпавший чат И статус
      // изменился; иначе возвращаем ТОТ ЖЕ объект s → React пропускает ре-рендер.
      let changed = false
      const chats = s.chats.map(c => {
        if (c.accountId !== accountId || c.userId !== uid) return c
        const nextOnline = !!isOnline
        const nextSeen = lastSeenAt || null
        const nextType = userStatusType || null
        if (c.isOnline === nextOnline && c.lastSeenAt === nextSeen && c.userStatusType === nextType) return c
        changed = true
        return { ...c, isOnline: nextOnline, lastSeenAt: nextSeen, userStatusType: nextType }
      })
      return changed ? { ...s, chats } : s
    })
  })

  // v0.95.38: фикс «дубля сообщений после отправки».
  // TDLib шлёт updateMessageSendSucceeded когда сервер подтвердил отправку —
  // меняет id с provisional (огромное число) на финальный. БЕЗ этого handler:
  // - state.messages содержит сообщение с provisional id
  // - При loadNewerMessages backend приносит финальную копию с другим id
  // - dedup по id не срабатывает (id разные) → ДУБЛЬ виден юзеру
  // ОБЯЗАТЕЛЬНО ПРОЧИТАТЬ: .memory-bank/mistakes/outgoing-two-cases.md
  // Эталон: Telegram Web K applyMessageUpdate, Telegram Desktop History::idChanged().
  addHandler('tg:send-succeeded', ({ chatId, oldId, newMessage }) => {
    setState(s => {
      const list = s.messages[chatId]
      if (!list) return s
      const idx = list.findIndex(m => String(m.id) === String(oldId))
      if (idx === -1) return s
      const next = [...list]
      next[idx] = newMessage
      return { ...s, messages: { ...s.messages, [chatId]: next } }
    })
    try {
      logNativeScroll('store-send-succeeded', {
        chatId,
        oldId: String(oldId),
        newId: newMessage?.id != null ? String(newMessage.id) : null,
        sendingState: newMessage?.isSending ? 'sending' : 'sent',
      })
    } catch (_) {}
    // stateRef — оставлен в сигнатуре для будущих DI (post-update диагностика).
    void stateRef
  })

  // v0.95.44: прогресс UPLOAD файлов (sendFile / sendAlbum). State.uploads —
  // Map по fileId с {uploaded, total, percent}. done:true → удаляем из state.
  // Throttle уже сделан в tdlibIpcBridge (только при изменении целого %).
  // Auto-cleanup через 60с — защита от orphan записей (cancel / network drop).
  addHandler('tg:upload-progress', ({ fileId, uploaded, total, percent, done }) => {
    setState(s => {
      const current = s.uploads || {}
      if (done) {
        if (!current[fileId]) return s
        const next = { ...current }
        delete next[fileId]
        return { ...s, uploads: next }
      }
      return {
        ...s,
        uploads: { ...current, [fileId]: { uploaded, total, percent } },
      }
    })
    // Защита от orphan — auto-cleanup через 60с (если done не пришёл — cancel/network).
    if (!done) {
      setTimeout(() => setState(s => {
        const cur = s.uploads || {}
        if (!cur[fileId]) return s
        const next = { ...cur }
        delete next[fileId]
        return { ...s, uploads: next }
      }), 60000)
    }
  })
}
