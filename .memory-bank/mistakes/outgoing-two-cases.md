# Ловушка: «outgoing — это 2 разных случая»

**Версия документа**: v0.95.37 (2 июня 2026)
**Контекст**: фиксы auto-scroll v0.95.28 → v0.95.36 → v0.95.37

---

## TL;DR

Сообщение с `isOutgoing=true` бывает **двух типов**, и они требуют **разной** обработки:

| Тип | TDLib `sending_state` | Кто сделал auto-scroll | Маркер в коде |
|---|---|---|---|
| **Локальный echo** (свой sendMessage с этой машины) | `messageSendingStatePending` | `handleReplySend` → `send-scroll-done` setTimeout 50мс | `isSending=true` |
| **Echo с другого устройства** (свой sendMessage с телефона/Web) | `null` (уже на сервере) | НИКТО — нужен наш auto-scroll | `isSending=false` |

**Главное правило**: фильтр `if (isOutgoing) skip` **НЕ ГОДИТСЯ**. Нужен `if (isOutgoing && isSending) skip`.

---

## История бага (хронология)

### v0.95.28: появилось разделение atBottom / physicallyAtBottom
- Введён auto-scroll к новому incoming если юзер у низа (Telegram Web K эталон).
- Фильтр: `if (message?.isOutgoing) onSkip()` — защита от двойного scroll для **своих** сообщений (handleReplySend уже делал send-scroll-done).
- **Не учли**: outgoing бывает не только «свой только что отправленный».

### v0.95.36: фикс auto-scroll для outgoing с других устройств
- Юзер: «не двигается вниз когда я пишу с телефона».
- Корень: фильтр блокировал ВСЕ outgoing.
- Решение: новый mapper-field `isSending: !!tdMsg.sending_state` ([tdlibMapper.js](../../main/native/backends/tdlibMapper.js)). Фильтр изменён `outgoing && isSending` → пропускает outgoing с другого устройства дальше.

### v0.95.37: защита от повторных событий + диагностика
- Гипотетический риск: TDLib может re-emit `updateNewMessage` с тем же id после `updateMessageSendSucceeded` (или backend перешлёт через другой путь).
- Защита: `seenOutgoingIdsRef` Set в [useNewBelowCounter.js](../../src/native/hooks/useNewBelowCounter.js) — если id уже виделся как `outgoing-pending`, повторное событие skip как `outgoing-already-seen`.
- Лог `fromOtherDevice` в `auto-scroll-new-message` для диагностики.
- Edit-кнопка скрыта пока `m.isSending=true` (TDLib откажет editMessageText без финального id).

---

## Эталоны (production messengers 2026)

| Клиент | Поле для различения | Источник |
|---|---|---|
| **Telegram Web K** | `pendingByRandomId` Map | [appMessagesManager.ts](https://github.com/morethanwords/tweb/blob/master/src/lib/appManagers/appMessagesManager.ts) |
| **Telegram Desktop** | `MessageFlag::FromUpdate` vs `MessageFlag::FromInbox` | [api_updates.cpp](https://github.com/telegramdesktop/tdesktop) |
| **WhatsApp Web** (whatsmeow) | `events.Message.Info.PushName == this device name` | [whatsmeow source](https://github.com/tulir/whatsmeow) |
| **Discord Gateway** | `nonce` field match с локальным `sentMessages` Map | [Discord docs](https://discord.com/developers/docs/topics/gateway-events) |

Все используют **поле в Message объекте**, не угадывают по timestamp/heuristics.

---

## Что нельзя делать (антипаттерны)

❌ `if (message.isOutgoing) skip` — блокирует и валидный auto-scroll для других устройств.
❌ Использовать timestamp-based heuristics (`Date.now() - lastSelfSendAt < N`) — race conditions при slow network.
❌ Полагаться только на `useState`/`useReducer` для дедупа outgoing — нужен `useRef(Set)` для устойчивости через re-renders.
❌ Показывать **edit** для outgoing+isSending=true — TDLib откажет (нет финального id).
❌ Показывать **notifications** для outgoing — никогда (это юзер сам отправил).

## Что нужно делать (паттерн)

✅ В mapper: `isSending: !!tdMsg.sending_state` — единственный надёжный источник.
✅ В фильтрах: `outgoing + isSending` → локальный echo (skip). `outgoing + !isSending` → другое устройство (auto-scroll/counter).
✅ Дедуп по id в Set с FIFO-cap 50 — защита от re-emit.
✅ Edit / pin / forward / reactions — скрывать или disable пока `isSending=true`.

---

## TDLib spec ссылки

- [Message](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message.html) — поле `sending_state`
- [messageSendingStatePending](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message_sending_state_pending.html)
- [updateMessageSendSucceeded](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_message_send_succeeded.html) — НЕ обрабатывается у нас (TODO для будущего, см. ниже)
- [updateNewMessage](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_new_message.html)

---

## ⚠ Известная незакрытая проблема (TODO для следующей итерации)

**Дубль сообщений после успешной отправки**: в [tdlibClient.js](../../main/native/backends/tdlibClient.js) `_handleUpdate()` switch **НЕ обрабатывает** `updateMessageSendSucceeded`. После того как сервер подтвердил отправку, TDLib меняет message.id с provisional (например `100_000_000_001`) на финальный (например `12345`). При следующей `loadNewerMessages` / `getMessages` backend возвращает финальный id → store.messages добавляет ВТОРОЕ сообщение (т.к. dedup по id, а id разные) → **дубль**.

**План** (документировано в features.md v0.95.37):
1. Backend: добавить case `'updateMessageSendSucceeded'` в [tdlibClient.js](../../main/native/backends/tdlibClient.js) — emit `'message:send-succeeded'` event с `{oldId, newMessage}`.
2. IPC bridge: subscribe → `tg:send-succeeded`.
3. Store: handler заменяет в `state.messages[chatId]` элемент с `m.id === oldId` на `newMessage`.
4. Тест: 1 mock emit `updateMessageSendSucceeded` → store.messages содержит финальный id, нет дубля.

Эталоны решения:
- Telegram Web K [appMessagesManager.ts](https://github.com/morethanwords/tweb/blob/master/src/lib/appManagers/appMessagesManager.ts) `applyMessageUpdate('updateMessageSendSucceeded')`
- Telegram Desktop [api_updates.cpp](https://github.com/telegramdesktop/tdesktop) `History::idChanged()`

---

## Связанные ловушки

- [`native-scroll-unread.md`](./native-scroll-unread.md) — общая логика scroll + unread, включает контекст v0.94.7/v0.95.0/v0.95.26
- features.md секции v0.95.28, v0.95.36, v0.95.37 — хронология фикса
