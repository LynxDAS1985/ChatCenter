# Сага «jump-to-end-of-chat» (v0.95.11 — v0.95.20) — ЗАКРЫТА

История пяти итераций решения проблемы «кнопка ↓ не подгружает свежие сообщения когда unread больше загруженного окна» + финал-фикс гейта v0.95.20. Каждая итерация раскрывала новое скрытое поведение TDLib API. Документ-предупреждение для будущей работы со скроллом / TDLib `getChatHistory`.

**Финальное решение** (v0.95.20): гейт `gapMessages > 0` через [computeJumpToEndGate](../src/native/utils/jumpToEndGate.js) — load-first при любом разрыве, не только при `unreadVsLoaded > 50`. См. секцию «v0.95.20» внизу.

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

### v0.95.14 — попытка #3: `aroundId=lastMessageId, offset=-50` (context-window) — **ПРОВАЛ**

**Гипотеза:** context-window вокруг lastMessageId через `from=X, offset=-50, limit=100` (паттерн как `afterId` в load-newer).

**Результат:** ❌ **Не сработало** — TDLib вернул **только 1 сообщение** (сам lastMessageId).

**Лог чата «Компьютерная IT, Digital» (17:00:03):**
```
store-load-messages aroundId=9132048384 addOffset=-50 force=true
[get-msgs] from=9132048384 offset=-50 count=1 first=9132048384 last=9132048384 hasMore=false
                                              ↑
                                       Один! Не 100!
```

После reload `state.messages[chatId] = [lastMessageId]` — массив из 1 элемента. Юзер видит **одно** сообщение, потом докручивает colorom скролл-колесом и каждый load-newer добавляет по 1-2 сообщения.

---

## 🎯 КОРНЕВОЙ ОТВЕТ ОТ АВТОРА TDLib (levlam)

[TDLib issue #740 comment](https://github.com/tdlib/td/issues/740) — официальный ответ автора TDLib:

> «This is expected and described in the method description: **`For optimal performance the number of returned messages is chosen by the library`**. See https://core.telegram.org/tdlib/getting-started#getting-chat-messages for more details.»

**TDLib НАМЕРЕННО возвращает меньше чем `limit`** — это не баг. Это оптимизация для performance.

[TDLib getting-started — Getting chat messages](https://core.telegram.org/tdlib/getting-started#getting-chat-messages):

> «To get more messages than can be returned in one response, the Application needs to pass the identifier of the last message it has received as `from_message_id` to next request.»

**Официальный паттерн — ИТЕРАТИВНЫЕ вызовы**. Один invoke не гарантирует limit messages.

### Из того же issue — пример официального паттерна (от ivanstepanovftw)

```cpp
void send_history_query(chat_id, from_message_id, offset, history_size, ...) {
    send_query(getChatHistory(chat_id, from_message_id, offset, history_size, ...),
      [...](auto messages) {
        ssize_t next_from_message_id = messages->messages_.back()->id_;
        ssize_t remaining = history_size - messages->messages_.size();
        on_messages_received(messages);
        if (remaining > 0 && !messages->empty()) {
            send_history_query(chat_id, next_from_message_id, offset, remaining, ...);
            //                          ↑ next from_message_id = последний полученный
        }
      });
}
```

**Это рекурсивный/итеративный fetch пока не наберём желаемое количество.**

---

## 🔑 ВЫВОДЫ И УРОКИ ДЛЯ БУДУЩЕГО

### 1. TDLib `getChatHistory` НЕ гарантирует `limit` messages в одном вызове

По [официальному getting-started](https://core.telegram.org/tdlib/getting-started#getting-chat-messages): «**number of returned messages is chosen by the library**». Может вернуть 1, 5, 50, 100 — на усмотрение TDLib.

**Никогда не предполагай что один invoke `getChatHistory` вернёт `limit` сообщений.**

### 2. Для load N messages — итеративный паттерн

```
collected = []
cursor = from_message_id
while collected.length < N:
  result = getChatHistory(from=cursor, offset, limit)
  if result.empty: break
  collected += result.messages
  cursor = result.messages.last().id  // продолжаем от последнего полученного
```

### 3. У нас уже есть похожий паттерн в **load-newer** ([useInboxNewerPrefetch.js](../src/native/hooks/useInboxNewerPrefetch.js))

Юзер прокручивает вниз → `maybeTrigger` запускает `loadNewerMessages(afterId, 100)` → когда DOM рендерит → если ещё не у низа → следующий trigger → итерация.

Это **именно** тот паттерн что рекомендует TDLib. Просто триггерится через user-scroll.

### 4. Для **jump-to-end-of-chat** правильно делать **scroll trigger**, не reload

Telegram Web K не делает reload вокруг lastMessageId — у них **SlicedArray** с lazy iterations. Каждый visible-out-of-data slot триггерит fetch.

### 5. `from_message_id=0` — рабочий по TDLib spec

По getting-started: «**from_message_id == 0 to get messages from the last message**». Это **правильно**. Просто TDLib может вернуть **мало**.

Возможный сценарий v0.95.13 (Архиватор IT, `loadedLast=5632950272 < lastMessageId=5633998848`):
- TDLib local cache имел старые messages
- `from=0` вернул что было в cache (limited by library optimization)
- lastMessageId был ещё не sync'ан → не в результате

Это **race condition** с TDLib state, не «подмена на read_cursor» как я предполагал.

---

## ✅ Правильный подход — v0.95.15

**Вариант A (рекомендованный) — итеративный fetch с `from=0`**:
1. mark-read до chatLastMessageId сразу (счётчик 0 на сервере)
2. loadMessages с `aroundId=0, force=true` (TDLib spec для last)
3. Если result.messages.length < ~50 — повторить с `aroundId=last_received.id, offset=0` чтобы догрузить older
4. После накопления — scroll to bottom

**Вариант B (через scroll-triggered iteration)**:
1. mark-read до chatLastMessageId
2. loadMessages с `aroundId=0, force=true` (получить какие-то messages у конца)
3. `scrollTo(scrollHeight)` (юзер у конца загруженного)
4. Существующий load-newer через `handleScroll` будет догружать пока юзер у низа

**Вариант C (НЕ делать reload вообще)**:
- При unread > loadedIncoming → много раз вызывать `loadNewerMessages(afterId, 100)` пока не достигнем lastMessageId
- Этот паттерн уже есть в `useInboxNewerPrefetch` — переиспользовать

---

## 🔥 КЛЮЧЕВЫЕ ВЫВОДЫ ДЛЯ MEMORY BANK

### TDLib `getChatHistory` known behaviors

| Параметры | Реальное поведение | Документ-ссылка |
|---|---|---|
| `from=0, offset=0, limit=N` | Возвращает **до N** последних сообщений. Может вернуть **сильно меньше** N (TDLib optimization) | [getting-started](https://core.telegram.org/tdlib/getting-started#getting-chat-messages) |
| `from=X, offset=0, limit=N` | Возвращает **до N** сообщений **строго старше** X, **БЕЗ X**. Реально может вернуть меньше | [class ref](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html) |
| `from=X, offset=-K, limit=N` (K>0) | Возвращает **до K** newer than X + X + до (N-K-1) older. Если newer нет, может вернуть **только X** | TDLib library optimization |

### ВСЕГДА используй итеративный fetch для гарантированного `N` messages

**Никогда не предполагай** что один invoke `getChatHistory` достаточен. Это **критически важное** правило при работе с TDLib.

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

---

## v0.95.20 — ФИНАЛ САГИ: load-first гейт «грузить-потом-скроллить»

### Запрос юзера

> «надо что бы точно все загрузило а потом перешло вниз... тупь будет задержка, это не страшно, объём работы не важен»

### Корень

В [InboxMode.scrollToBottom](../src/native/modes/InboxMode.jsx) гейт был `effectiveLastMessageId && unreadVsLoaded > 50 && !loading` — load-first срабатывал **только** при большом числе непрочитанных. Если в чате 10 непрочитанных, но между загруженным окном и сервером пропуск в 200 сообщений (`gapMessages=200`) — `unreadVsLoaded=10` → гейт `false` → fallback `el.scrollTo(scrollHeight)` мгновенно → юзер видит «дёрг» (сообщения дописываются через секунду через `load-newer`).

Диагностика v0.95.19 (`tg-messages-applied action=appended-newer` после `button-scroll-bottom`) это и показывала: новые сообщения **прибывали после** скролла, а не до.

### Решение

Новый чистый util [`src/native/utils/jumpToEndGate.js`](../src/native/utils/jumpToEndGate.js):

```js
export function computeJumpToEndGate({ lastMessageId, gapMessages, loading } = {}) {
  if (loading) return false
  if (!lastMessageId) return false
  if (!Number.isFinite(gapMessages)) return false
  return gapMessages > 0
}
```

Замена inline `unreadVsLoaded > 50` → вызов `computeJumpToEndGate(...)`. В лог `button-scroll-bottom` добавлены `branch: 'load-first'|'direct-scroll'`, `isForumTopic`, `effectiveLastMessageId`, `loading` — для прозрачности.

### Эталоны (production messengers 2026)

| Мессенджер | Паттерн |
|---|---|
| Telegram Desktop | `HistoryWidget::cornerButtonsShowAtPosition` → `_history->isReadyFor()` → `historyLoaded()` или `firstLoadMessages()` ПЕРЕД scroll |
| Telegram Web K | `ChatBubbles.onGoDownClick` → `ProgressivePreloader.attach()` → `getHistory()` → only then `scrollToEnd()` |
| WhatsApp Web | `getChatHistory` → resolve → `scrollIntoView` |
| Discord | message store hydration → scroll |

Все четыре **никогда** не скроллят до проверки готовности данных.

### Что юзер увидит при 5000 непрочитанных

| Шаг | Что | Время |
|---|---|---|
| 1 | Клик ↓ | 0 сек |
| 2 | `getIterativeUntil`: 1–N итераций `getChatHistory` до 100 сообщений | ~0.2–2 сек |
| 3 | `requestAnimationFrame × 2` + `smoothScrollTo` twoPhase | 0.35 сек |
| 4 | mark-read до `lastMessageId` → счётчик 5000 → 0 | мгновенно |

Остальные 4900 **не** грузятся (правильно — как у Telegram Desktop / Web / WhatsApp / Discord). Загрузятся через `load-older` если юзер крутит вверх.

### Защита от зацикливания (уже была в инфраструктуре v0.95.15–17)

- `maxIterations: 10` в [getIterativeUntil](../main/native/backends/tdlibBackend.js)
- `targetCount: 100` (не грузим всю историю)
- Empty response → stop
- Duplicate detect → stop

### Что НЕ менялось

- [loadMessagesUntil](../src/native/store/nativeStore.js) (v0.95.15)
- [loadTopicMessagesUntil](../src/native/store/nativeStore.js) (v0.95.16)
- [getIterativeUntil](../main/native/backends/tdlibBackend.js) / `getIterativeUntilTopic`
- [smoothScrollTo](../src/native/utils/smoothScroll.js) twoPhase (v0.95.18)
- mark-read bypass gate для `source='button-scroll'` (v0.95.8)
- Contiguity check в `tg:new-message` (v0.95.0)

### Тесты (14 unit в jumpToEndGate.vitest.js)

- Большой gap (1021) → true (реальный лог)
- Минимальный gap (1) → true
- Gap=0 → false
- Отрицательный gap → false
- lastMessageId=null/0 → false
- loading=true → false
- gapMessages=NaN/null/undefined → false
- Пустые аргументы → false
- Реальный сценарий v0.95.19 (30 непрочитанных, gap=200) → true (раньше `false`)

### Главный урок саги

**TDLib `getChatHistory` НЕ гарантирует `limit` messages в одном вызове** (issue #740, ответ levlam). Любой fetch до конкретного `lastMessageId` — **итеративный** через `getIterativeUntil`. Гейт «load-first» должен быть на **любой** разрыв (gapMessages > 0), не на «много непрочитанных».
