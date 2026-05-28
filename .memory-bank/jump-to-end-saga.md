# Сага «jump-to-end-of-chat» (v0.95.11 — v0.95.14)

История пяти итераций решения проблемы «кнопка ↓ не подгружает свежие сообщения когда unread больше загруженного окна». Каждая итерация раскрывала новое скрытое поведение TDLib API. Документ-предупреждение для будущей работы со скроллом / TDLib `getChatHistory`.

## Корневая проблема (как у юзера видно)

Чат с большим `unread_count` (>100), например 1108 или 814. При открытии `loadMessages` грузит окно вокруг `readInboxMaxId` (первое непрочитанное) — обычно ~100 сообщений. На сервере есть ещё ~1000 непрочитанных **дальше**, но они **не в DOM**.

Клик ↓ должен:
1. Прыгнуть к самым свежим сообщениям чата (как Telegram Desktop)
2. Помечать всё прочитанным (счётчик → 0)

Это **не работало** через `el.scrollTo(scrollHeight)` потому что юзер был у низа загруженного, `handleScroll` не триггерился, `load-newer` не запускался.

---

## Хронология попыток

### v0.95.11 — диагностика (без смены поведения)

**Что добавили:**
- `chat.lastMessageId` в [tdlibMapper.js](../main/native/backends/tdlibMapper.js) — id последнего сообщения чата на сервере
- В `button-scroll-bottom` лог: `loadedIncoming`, `chatLastMessageId`, `loadedLastId`, `gapMessages`, `unreadVsLoaded`
- В `chat-open` лог: `lastMessageId`, `readInboxMaxId`

**Что показал лог реальной сессии (чат «Департамент вайб-кодинга»):**
```
unread=1108  loadedIncoming=100
chatLastMessageId=45491421184  loadedLastId=44420825088
gapMessages=1021  unreadVsLoaded=1008
```

Подтверждено: между загруженным окном и сервером пропущена тысяча сообщений.

---

### v0.95.12 — попытка #1: `aroundId=lastMessageId, offset=0`

**Гипотеза:** TDLib `getChatHistory(from=lastMessageId, offset=0, limit=100)` вернёт 100 сообщений начиная с lastMessageId.

**Реализация:**
```js
loadMessages(viewKey, 100, { aroundId: chatLastMessageId, force: true })
// → backend: from=lastMessageId, offset=0, limit=100
```

**Результат:** ❌ **Не сработало** — пропускалось последнее сообщение.

**Лог чата «Архиватор IT»:**
```
button-scroll-jump-to-end-done bottomGap=0
badge unread=1260 → 1   ← остался unread=1
```

Юзер видел **предпоследнее** сообщение, а самое последнее — недоступно.

**Корень:**
[TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html) формально говорит «from_message_id=X, offset=0 → 100 messages starting from X». Но **в реальности** TDLib грузит сообщения **СТРОГО СТАРШЕ X** (не включая X). lastMessageId пропускался.

Это **не было задокументировано явно** в TDLib spec — пришлось обнаружить эмпирически по логу.

---

### v0.95.13 — попытка #2: `aroundId=0` (TDLib spec)

**Гипотеза:** По [TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html): «If from_message_id == 0, the last message in the chat is used». То есть `from=0` должен дать последнее сообщение **включительно**.

**Реализация:**
```js
loadMessages(viewKey, 100, { aroundId: 0, force: true })
// → backend: from=0, offset=0, limit=100
```

Плюс фикс в `nativeStore.loadMessages`: `options.aroundId != null` (не truthy) — чтобы `0` интерпретировалось как валидный override.

**Результат:** ❌ **Не сработало** — TDLib вернул окно **вокруг старого read cursor**, не вокруг lastMessageId.

**Лог чата «База Темщика»:**
```
chat-open  lastMessageId=3406823424  readInboxMaxId=2543845376  unread=814
button-scroll-jump-to-end (aroundId=0)
button-scroll-jump-to-end-done bottomGap=0
badge unread=814 → 0   ← счётчик обнулился (mark-read до lastMessageId сработал)

// 4 секунды спустя — юзер кликает ↓ ещё раз:
loadedLastId=2742026240  chatLastMessageId=3406823424  gapMessages=634
```

`loadedLastId=2742026240` примерно равно `readInboxMaxId=2543845376` (gap ~100). А `chatLastMessageId=3406823424` — далеко выше.

**Корень (новый, ранее неизвестный):**
По [TDLib issue #740](https://github.com/tdlib/td/issues/740) — TDLib **подменяет** `from_message_id=0` на **`last_read_inbox_message_id`** в некоторых сценариях. Не на «server last_message» как обещает spec, а на «last read cursor».

В логе issue: `"offset_id = 38884" (last read message)` — TDLib внутри подставил это.

Это **не задокументированное** поведение. Spec говорит одно, реальность — другое.

---

### v0.95.14 — попытка #3: `aroundId=lastMessageId, offset=-50` (context-window)

**Гипотеза:** Передать `lastMessageId` явно + использовать **отрицательный offset** для context-window. По TDLib spec: `offset=-50, limit=100` → 50 messages newer than X + X itself + 49 older = ~100 total.

Так делает [Telegram Desktop](https://github.com/telegramdesktop/tdesktop) при click ↓ — `getHistory(from=peer.last_message.id, offset=-N)`.

**Реализация:**
```js
loadMessages(viewKey, 100, {
  aroundId: chatLastMessageId,
  addOffset: -50,        // ← context-window: -50 = 50 newer + X + 49 older
  force: true,
})
```

**Почему должно сработать:**
- `from=lastMessageId` (явно, не 0 → TDLib не сможет подменить на read cursor)
- `offset=-50` → захватывает X в контекст (по spec)
- Newer чем lastMessageId нет (он самый последний на сервере) → ~50 older + X = 51 message
- lastMessageId **в результате**

**Дополнительная защита:** `requestAnimationFrame × 2` перед scrollTo — гарантия что React commit + первый paint завершились, scrollHeight точный, нет дёрга.

---

## Ключевые уроки

### 1. TDLib `getChatHistory` имеет **недокументированные** edge cases

- `from_message_id=X, offset=0` — формально «from X», реально **строго старше X**
- `from_message_id=0` — формально «last message», реально **last_read_inbox_message_id** в чатах с unread

**Вывод:** для context-window вокруг конкретного сообщения — **всегда** использовать `from=X, offset=-limit/2`. Никогда не полагаться на `from=0`.

### 2. По TDLib spec **`offset` должен быть отрицательным** для context-window

Spec: «specify 0 to get results from exactly the from_message_id, or a negative offset up to 99 to get additionally some newer messages».

Так что `offset=-50, limit=100` — **штатное** API использование, не хак.

### 3. Telegram Desktop делает именно так

`api->requestHistory(peer, peer.last_message.id, offset=-some_offset)` — точный паттерн.

---

## Связанные защиты которые НЕ конфликтуют

- ✅ `unreadWindowIncomplete` gate ([InboxMode.jsx markReadCurrentView](../src/native/modes/InboxMode.jsx)) — `source='button-scroll'` в whitelist (v0.95.8)
- ✅ `useReadByVisibility` cascade guard (v0.94.7) — для **passive** scroll-trigger, не для active click
- ✅ `useForceReadAtBottom` threshold 30 (v0.91.13) — отдельный hook, не задействуется
- ✅ `useInitialScroll` при изменении `messagesCount` (полная замена через reload) — `followupRef++` без restore (v0.95.4)
- ✅ `overflow-anchor: none` (v0.94.2) — не трогается
- ✅ `tg:messages` full replace при `!append && !appendNewer` — норма (юзер сам кликнул)
- ✅ Mark-read до `chat.lastMessageId` — TDLib range-ack договор ([viewMessages spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1view_messages.html))

---

## Связанные файлы

- [InboxMode.jsx](../src/native/modes/InboxMode.jsx) — `scrollToBottom` с jump-to-end веткой
- [nativeStore.js](../src/native/store/nativeStore.js) — `loadMessages(chatId, limit, options)` с поддержкой `aroundId`/`addOffset`/`force`
- [tdlibMapper.js](../main/native/backends/tdlibMapper.js) — `chat.lastMessageId` поле
- [tdlibMessages.js](../main/native/backends/tdlibMessages.js) — `computeHistoryParams` + `getChatHistory` обёртка
- [useScrollDiagnostics.js](../src/native/hooks/useScrollDiagnostics.js) — `chat-open` лог с `lastMessageId`+`readInboxMaxId`

---

## Эталоны проверены

🥇 [TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html) — параметры из официальной документации
🥇 [Telegram Desktop](https://github.com/telegramdesktop/tdesktop) — `getHistory(peer.last_message.id, offset=-N)` паттерн
🥇 [TDLib issue #740](https://github.com/tdlib/td/issues/740) — undocumented поведение `from=0`
🥈 Наш [computeHistoryParams](../main/native/backends/tdlibMessages.js) — load-newer уже использует negative offset (`afterId>0 → offset=-(limit-1)`)
