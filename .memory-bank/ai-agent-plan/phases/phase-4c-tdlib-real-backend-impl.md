# Phase 4c — TDLib backend для AI tools (v1.0.2) — детальная реализация

> Цель: AI агент **реально** работает с TDLib. До v1.0.2 был fallback (пустые ответы / no_tdlib_backend) — агент существовал но «в никуда». v1.0.2 — мост между плоским интерфейсом tool handlers и доменной структурой tdlibBackend.

---

## 1. Корневая проблема

### 1.1 Что было до v1.0.2

#### tdlibBackend — доменная структура
```js
// main/native/backends/tdlibBackend.js
export function createTdlibBackend({manager, makeClientParams, userDataDir}) {
  return {
    name: 'tdlib',
    auth: {startLogin, submitCode, ...},
    chats: {getChats, getCachedChats, healthCheck, ...},
    messages: {
      get(params),
      getIterativeUntil(params),
      getTopic(params),
      send(chatId, text, replyTo),
      markRead(chatId, maxId),
      // ... но НЕ было search!
    },
    media: {download, downloadVideo, ...},
    forum: {getTopics, ...},
  }
}
```

#### aiAgentSetup — ожидает плоский интерфейс
```js
// main/ai/aiAgentSetup.js (старая версия)
export function getHandlerContext() {
  return {
    getMessages: async ({chatId, limit, beforeMessageId}) => {
      const backend = _deps?.tdlibBackend
      if (!backend || typeof backend.getMessages !== 'function') {
        return []  // ← FALLBACK потому что backend.getMessages не существует!
      }
      // ...
    },
    sendMessage: async ({accountId, chatId, text, replyToMessageId}) => {
      const backend = _deps?.tdlibBackend
      if (!backend || typeof backend.sendMessage !== 'function') {
        return {ok: false, error: 'no_tdlib_backend'}  // ← FALLBACK!
      }
      // ...
    },
    // ...
  }
}
```

### 1.2 Конкретно где не совпадало

| AI handler ждёт | tdlibBackend реально имеет |
|---|---|
| `backend.getMessages({chatId, limit, beforeMessageId})` | `backend.messages.get({chatId, limit, offsetId})` |
| `backend.searchMessages({query, chatId, accountId, limit})` | **не существует** |
| `backend.sendMessage({accountId, chatId, text, replyToMessageId})` | `backend.messages.send(chatId, text, replyTo)` |
| `backend.markAsRead({accountId, chatId, upToMessageId})` | `backend.messages.markRead(chatId, maxId)` |

**Проблемы**:
1. **Доменная вложенность** — `backend.messages.get` vs `backend.getMessages`.
2. **Разные параметры** — `beforeMessageId` vs `offsetId`.
3. **Позиционные vs именованные** — `send(chatId, text, replyTo)` vs `sendMessage({...})`.
4. **Отсутствующий метод** — `search` нет вообще.

### 1.3 Симптом

Юзер нажимал «🤖 AI» → AI sidebar показывал шаги:
- 📜 «Читаю историю» → возвращало `[]` → AI думал «история пустая» → не мог построить контекст.
- 🔍 «Ищу» → `[]` → не находил ничего.
- ↪ «Отправляю» → `{ok: false, error: 'no_tdlib_backend'}` → handler возвращал ошибку → audit log писал `executionResult: 'error'`.

**Итог**: AI «работал» (loop крутился, шаги показывались) но **никакого реального эффекта не давал**.

---

## 2. Решение — адаптер

### 2.1 Принцип
Создаём промежуточный слой который:
1. Конвертирует **сигнатуры** (плоские args → позиционные).
2. Конвертирует **имена параметров** (`beforeMessageId` → `offsetId`).
3. Конвертирует **формы ответа** (`messageId` → `id`).
4. Добавляет **graceful fallback** при null/missing методах.
5. Дополняет **отсутствующий метод** `search` (через TDLib API).

### 2.2 Архитектура

```
┌──────────────────────────────────────────────────────────────┐
│ AI Tool Handlers (плоский интерфейс)                          │
│  getMessages, searchMessages, sendMessage, markAsRead         │
└────────────────────────────┬─────────────────────────────────┘
                              │ context.* (handlerContext)
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ aiAgentBackendAdapter (новый в v1.0.2)                        │
│                                                               │
│  getMessages({chatId, limit, beforeMessageId})                │
│   → tdlibBackend.messages.get({                               │
│       chatId,                                                 │
│       limit: clamp([1,100], 20),                              │
│       offsetId: beforeMessageId || 0                          │
│     })                                                        │
│   → return r.messages || []                                   │
│                                                               │
│  searchMessages({query, chatId, accountId, limit})            │
│   → tdlibBackend.messages.search({...})                       │
│   → return r.messages || []                                   │
│                                                               │
│  sendMessage({chatId, text, replyToMessageId})                │
│   → tdlibBackend.messages.send(chatId, text, Number(replyTo)) │
│   → return {ok, id: r.messageId}                              │
│                                                               │
│  markAsRead({chatId, upToMessageId})                          │
│   → tdlibBackend.messages.markRead(chatId, Number(upToMsg))   │
│   → return {ok}                                               │
└────────────────────────────┬─────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ tdlibBackend (доменная структура, существующая)               │
│  messages: {get, getTopic, send, markRead, search}            │
│            ↑ search добавлен в v1.0.2                         │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Файл `main/ai/aiAgentBackendAdapter.js` (129 строк)

### 3.1 Главная функция

```js
export function createAiAgentBackendAdapter(tdlibBackend) {
  if (!tdlibBackend || typeof tdlibBackend !== 'object') {
    return makeEmptyAdapter('no_tdlib_backend')
  }
  const m = tdlibBackend.messages
  if (!m || typeof m !== 'object') {
    return makeEmptyAdapter('no_messages_domain')
  }
  
  return {
    getMessages: async (...) => {...},
    searchMessages: async (...) => {...},
    sendMessage: async (...) => {...},
    markAsRead: async (...) => {...},
  }
}
```

**Принципы**:
- Раннее обнаружение проблем — если backend null → возвращаем заглушку с понятной ошибкой `no_tdlib_backend`.
- Если backend.messages не существует → `no_messages_domain` (необычная ситуация, но возможна если бэкенд частично инициализирован).
- Иначе — нормальный адаптер.

### 3.2 getMessages — детальная сигнатура

```js
getMessages: async ({chatId, limit, beforeMessageId} = {}) => {
  if (!chatId || typeof m.get !== 'function') return []
  try {
    const r = await m.get({
      chatId,
      limit: clampLimit(limit, 20, 100),
      offsetId: beforeMessageId ? String(beforeMessageId) : 0,
    })
    if (!r || r.ok === false) return []
    return Array.isArray(r.messages) ? r.messages : []
  } catch (_) {
    return []
  }
}
```

**Что конвертируется**:

| AI handler передаёт | Адаптер передаёт в `messages.get` |
|---|---|
| `chatId` | `chatId` (как есть, наш составной формат `accountId:rawId`) |
| `limit: 50` | `limit: 50` (зажат [1, 100]) |
| `beforeMessageId: '888'` | `offsetId: '888'` (TDLib параметр) |
| (нет beforeMessageId) | `offsetId: 0` (TDLib: грузить с последнего) |

**TDLib семантика `offset_id`**: если 0 — грузим с самого свежего. Если число — грузим **старше** этого id (т.е. `messages.get` это «более старые чем beforeMessageId»).

**Graceful fallback**:
- Нет chatId → `[]`. Не пытаемся вызывать backend без обязательного параметра.
- `m.get` не функция (хотя проверили выше) → `[]`. Параноидальная проверка.
- backend вернул `ok: false` → `[]` (вместо throw).
- `messages` не массив → `[]` (защита от malformed response).
- throw в backend → `[]` (catch).

### 3.3 searchMessages — новый метод (требует messages.search)

```js
searchMessages: async ({query, chatId, accountId, limit} = {}) => {
  if (!query || typeof m.search !== 'function') return []
  try {
    const r = await m.search({
      query: String(query),
      chatId: chatId || null,
      accountId: accountId || null,
      limit: clampLimit(limit, 20, 50),
    })
    if (!r || r.ok === false) return []
    return Array.isArray(r.messages) ? r.messages : []
  } catch (_) {
    return []
  }
}
```

**Что новое**:
- Search **не существовал** до v1.0.2. Если backend без search → `m.search не функция` → `[]`.
- Limit зажат [1, 50] (меньше чем у getMessages потому что глобальный поиск дороже).
- Передаёт `chatId || null` и `accountId || null` — backend.messages.search решает: с chatId → searchChatMessages, без → глобальный.

### 3.4 sendMessage — конвертация формата ответа

```js
sendMessage: async ({chatId, text, replyToMessageId} = {}) => {
  if (!chatId || !text) return {ok: false, error: 'invalid_args'}
  if (typeof m.send !== 'function') return {ok: false, error: 'no_send_in_backend'}
  try {
    const r = await m.send(chatId, text, replyToMessageId ? Number(replyToMessageId) : undefined)
    if (!r) return {ok: false, error: 'no_response'}
    if (r.ok === false) return {ok: false, error: r.error || 'send_failed'}
    return {
      ok: true,
      id: r.messageId ? String(r.messageId) : (r.id ? String(r.id) : (r.message?.id ? String(r.message.id) : null)),
    }
  } catch (e) {
    return {ok: false, error: e?.message || 'send_threw'}
  }
}
```

**Конвертация**:
1. **Args** — плоский `{chatId, text, replyToMessageId}` → позиционные `(chatId, text, Number(replyTo))`.
2. **replyToMessageId** — `String('22841...')` → `Number(22841...)` (TDLib API принимает int53 как number; precision OK до 2^53).
3. **Form ответа** — `{ok, messageId}` от tdlibBackend → `{ok, id}` для handler.

**Тройной fallback для id**:
- Сначала `r.messageId` (это что sendTextMessage возвращает).
- Если нет — `r.id` (если кто-то завернул в нестандарт).
- Если нет — `r.message?.id` (если завернули в nested message).
- Null если ничего нет.

Это даёт **forward compatibility**: если в будущем backend изменит формат — адаптер не сразу сломается.

### 3.5 markAsRead

```js
markAsRead: async ({chatId, upToMessageId} = {}) => {
  if (!chatId || !upToMessageId) return {ok: false, error: 'invalid_args'}
  if (typeof m.markRead !== 'function') return {ok: false, error: 'no_markRead_in_backend'}
  try {
    const r = await m.markRead(chatId, Number(upToMessageId))
    if (!r) return {ok: true}  // best effort
    if (r.ok === false) return {ok: false, error: r.error || 'markRead_failed'}
    return {ok: true}
  } catch (e) {
    return {ok: false, error: e?.message || 'markRead_threw'}
  }
}
```

**Особенность**: если backend.markRead вернёт `undefined` — считаем `ok: true`. TDLib `viewMessages` не возвращает useful response, успешный вызов — `undefined`.

### 3.6 makeEmptyAdapter

```js
function makeEmptyAdapter(reason) {
  return {
    getMessages: async () => [],
    searchMessages: async () => [],
    sendMessage: async () => ({ok: false, error: reason}),
    markAsRead: async () => ({ok: false, error: reason}),
  }
}
```

**Зачем**: если backend не подключен (например, TDLib не запустился) — handler'ы всё равно работают, просто возвращают пустоту/ошибку. Без crash.

### 3.7 clampLimit

```js
function clampLimit(v, def, max) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 1) return def
  return Math.min(n, max)
}
```

Защита: `NaN`, `Infinity`, `-1`, `0` → default. Иначе зажимаем по max.

---

## 4. Новый метод `tdlibBackend.messages.search`

### 4.1 Зачем добавлен
Search не было в backend. Адаптер ожидает `m.search`. Чтобы AI tool `search_messages` работал — добавили в backend.

### 4.2 Реализация

```js
async search({query, chatId, accountId, limit = 20} = {}) {
  if (!query) return {ok: false, error: 'query required', messages: []}
  const cappedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
  try {
    if (chatId) {
      // Поиск внутри конкретного чата — TDLib searchChatMessages
      const ctx = getClientForChat(manager, chatId)
      if (ctx.error) return {...ctx.error, messages: []}
      const result = await ctx.client.invoke({
        '@type': 'searchChatMessages',
        chat_id: ctx.rawId,
        query: String(query),
        sender_id: null,
        from_message_id: 0,
        offset: 0,
        limit: cappedLimit,
        filter: {'@type': 'searchMessagesFilterEmpty'},
        message_thread_id: 0,
      })
      const extras = makeExtras(manager, ctx.accountId)
      const messages = (result?.messages || []).map((tdMsg) => {
        const senderId = tdMsg.sender_id
        const senderName = extras.getSenderName(senderId)
        const senderAvatar = extras.getSenderAvatar(senderId)
        return tdlibMapMessageDirect(tdMsg, chatId, {senderName, senderAvatar})
      }).filter(Boolean)
      return {ok: true, messages, totalCount: Number(result?.total_count) || messages.length}
    }
    
    // Глобальный поиск — TDLib searchMessages
    let aid = accountId
    if (!aid) {
      const list = manager.listAccounts ? manager.listAccounts() : []
      aid = list[0]
    }
    if (!aid) return {ok: false, error: 'no account', messages: []}
    const client = manager.getClient(aid)
    if (!client) return {ok: false, error: 'account not found: ' + aid, messages: []}
    
    const result = await client.invoke({
      '@type': 'searchMessages',
      chat_list: {'@type': 'chatListMain'},
      query: String(query),
      offset_date: 0,
      offset_chat_id: 0,
      offset_message_id: 0,
      limit: cappedLimit,
      filter: {'@type': 'searchMessagesFilterEmpty'},
      min_date: 0,
      max_date: 0,
    })
    
    const extras = makeExtras(manager, aid)
    const messages = (result?.messages || []).map((tdMsg) => {
      const chatIdStr = aid + ':' + String(tdMsg.chat_id)  // сшиваем составной
      const senderId = tdMsg.sender_id
      const senderName = extras.getSenderName(senderId)
      const senderAvatar = extras.getSenderAvatar(senderId)
      const mapped = tdlibMapMessageDirect(tdMsg, chatIdStr, {senderName, senderAvatar})
      if (mapped) mapped.chatId = chatIdStr
      return mapped
    }).filter(Boolean)
    
    return {ok: true, messages, totalCount: Number(result?.total_count) || messages.length}
  } catch (e) {
    return {ok: false, error: e?.message || String(e), messages: []}
  }
}
```

### 4.3 Два режима

#### A. С chatId — `searchChatMessages`
Поиск внутри конкретного чата. TDLib API:
```
https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1search_chat_messages.html
```
Параметры: `chat_id` (int53), `query` (string), `limit`, фильтр.

#### B. Без chatId — `searchMessages` (глобальный)
Поиск по всем чатам одного аккаунта. TDLib API:
```
https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1search_messages.html
```
Параметры: `chat_list` (Main или Archive), `query`, `limit`, `min_date`/`max_date`.

**Особенность глобального**:
- accountId не указан → берём первый из `manager.listAccounts()` (multi-account: ищем по первому аккаунту).
- В мапированном сообщении **дополнительно** ставим `mapped.chatId = accountId:rawId` — иначе UI не сможет открыть чат.

### 4.4 Filter — пустой
`searchMessagesFilterEmpty` — без фильтра по типу медиа. Можно расширить позже:
- `searchMessagesFilterPhoto` — только фото.
- `searchMessagesFilterVideo` — только видео.
- ...

### 4.5 mapping
Используем существующий `tdlibMapMessageDirect` (из tdlibMapper.js) — даёт единообразный формат сообщения с senderName, senderAvatar, text, etc.

---

## 5. Подключение в main.js

### 5.1 Что изменено

```js
// БЫЛО (v0.99.1):
setAgentDeps({
  mainWindow: () => mainWindow,
  tdlibBackend: r.backend || null,  // ← передавался напрямую (доменная структура)
  // ...
})

// СТАЛО (v1.0.2):
import { createAiAgentBackendAdapter } from './ai/aiAgentBackendAdapter.js'

setAgentDeps({
  mainWindow: () => mainWindow,
  tdlibBackend: createAiAgentBackendAdapter(r.backend),  // ← оборачивается адаптером
  // ...
})
```

### 5.2 Где
`main/main.js`, около строк 309-311 — в блоке инициализации после `await startTdlibBackend()`.

### 5.3 Backward compat
Если `r.backend === null` (TDLib не запустился) — `createAiAgentBackendAdapter(null)` вернёт `makeEmptyAdapter('no_tdlib_backend')`. Handler'ы получат пустые ответы и ошибки — но **не crash**. UI продолжает работать.

---

## 6. Поток типичного действия — отправка ответа

```
1. AI решает: tool_use reply_to_message {text: "К пятнице..."}
2. executor → checkPermission → confirm
3. UI → юзер подтверждает
4. executor → replyToMessageHandler(source, args, context)
5. handler → context.sendMessage({
     accountId: 'tg_611696632',
     chatId: 'tg_611696632:-1001381927809',
     text: 'К пятнице...',
     replyToMessageId: '22841131008'
   })
6. context.sendMessage = adapter.sendMessage (из aiAgentBackendAdapter)
7. Адаптер:
   - clampLimit, валидация
   - вызов: tdlibBackend.messages.send(
       'tg_611696632:-1001381927809',
       'К пятнице...',
       22841131008  // Number
     )
8. tdlibBackend.messages.send → parseChatId → getClientForChat
9. tdlibMessages.sendTextMessage(client, rawId, text, {replyTo: 22841131008, ...})
10. client.invoke({'@type': 'sendMessage', chat_id: -1001381927809, ...})
11. TDLib отправляет → возвращает {'@type': 'message', id: 555}
12. sendTextMessage возвращает {ok: true, messageId: '555', message: mappedMsg}
13. Адаптер → {ok: true, id: '555'}
14. handler возвращает {ok: true, result: {sent: true, sentMessageId: '555'}}
15. executor → audit:append → onStep tool_result → LLM
16. LLM отвечает финальным текстом «Готово, отправлено».
```

---

## 7. Подводные камни

### 7.1 chatId формат
Адаптер **не парсит** chatId. Он прокидывает строку как есть. Backend.messages.send умеет парсить (`accountId:rawId`).

Если AI передаст просто `-1001...` (без accountId) — backend вернёт `invalid chatId`. Это OK поведение.

### 7.2 messageId как BigInt
TDLib message_id это int53. Источник (source) хранит как string. Адаптер делает `Number(messageId)` для передачи в TDLib API (TDLib JSON SDK принимает number).

**Лимит**: 2^53 = 9007199254740992. Telegram message_id растёт линейно — пока в безопасном диапазоне. Если когда-нибудь перерастёт — поменяем на BigInt с обвязкой.

### 7.3 Глобальный search и multi-account
Если у юзера 3 TDLib аккаунта и AI не указал `accountId` — search идёт по **первому** из listAccounts(). Это может быть не тот что нужно.

**Защита**: AI prompt в Phase 1 говорит «source.accountId — используй для поиска». Если AI слушается — всё OK.

**TODO**: fan-out по всем аккаунтам если accountId не указан. Не реализовано (увеличит latency 3x).

### 7.4 Throw в backend
Если `tdlibBackend.messages.send` throw (например TDLib crash) — адаптер ловит и возвращает `{ok: false, error: e.message}`. Handler передаст это в audit log. AI получит ошибку как tool_result и решит что делать.

### 7.5 Empty adapter — почему не throw
Если backend == null — мы возвращаем `makeEmptyAdapter` (методы возвращают пустоту), **не throw**. Причина: AI loop должен **продолжать работать** даже если TDLib временно недоступен. AI получит error, LLM решит «ок, не могу читать историю, попробую без неё».

Throw на инициализации сломал бы весь main process — слишком жёсткая реакция.

---

## 8. Тесты v1.0.2

### 8.1 main/ai/aiAgentBackendAdapter.vitest.js (24 теста)

#### Guards (3 теста)
- null backend → empty adapter с `no_tdlib_backend`.
- backend без messages → `no_messages_domain`.
- backend с messages={} → graceful fallback во всех методах.

#### getMessages (8 тестов)
- пробрасывает chatId/limit/beforeMessageId → offsetId.
- limit > 100 → 100 (clamp).
- limit отсутствует → 20 (default).
- beforeMessageId отсутствует → offsetId: 0.
- chatId отсутствует → пустой массив без вызова.
- ok: false → пустой массив.
- throw → пустой массив (graceful).
- messages undefined → пустой массив.

#### searchMessages (3 теста)
- query/chatId/accountId/limit, limit зажат [1, 50].
- пустой query → не зовёт backend.
- throw → graceful.

#### sendMessage (6 тестов)
- {ok, id} из messageId.
- replyToMessageId undefined.
- messageId число → string.
- пустой text → invalid_args.
- backend {ok: false, error} → пробрасывает.
- throw → {ok: false, error}.

#### markAsRead (4 теста)
- markRead(chatId, Number).
- пустой upToMessageId → invalid_args.
- throw → ok: false.
- backend undefined → ok: true (best effort).

### 8.2 src/__tests__/tdlibBackend.vitest.js (6 новых тестов на search)

- chatId → searchChatMessages.
- chatId с битым accountId → ctx error + messages: [].
- без chatId → searchMessages глобальный с первым accountId.
- пустой query → ok: false, query required.
- limit зажат [1, 100].
- throw в invoke → ok: false.

### 8.3 Всего

| Файл | Было | Стало |
|---|---|---|
| Все тесты | 1255 | **1285** (+30) |

---

## 9. Лимиты

### 9.1 fileSizeLimits exceptions
- `main/native/backends/tdlibBackend.js`: ceiling 770 → 840 (+70 строк search).
- `src/__tests__/tdlibBackend.vitest.js`: ceiling 480 → 560 (+95 строк тестов).

### 9.2 Регрессия
- ESLint 0 warnings.
- vitest 1285 passed.
- fileSizeLimits 392/392 ✅.
- pre-push hook ✅.

---

## 10. Как проверить вручную

### 10.1 Базовый тест
1. **Полностью перезапустить** приложение (важно — main процесс).
2. Открыть TDLib чат с непрочитанным сообщением.
3. Нажать «🤖 AI» в уведомлении.
4. AISidebarAgent показывает шаги:
   - 📜 «Читаю историю» → должны быть **реальные** сообщения (count > 0).
   - 🔍 «Ищу» (если LLM вызовет) → реальные результаты.
   - ↪ «Отправляю» → модалка → подтверждение → реально уходит сообщение.
5. Открыть 📊 AI Activity — записи с `durationMs > 0` (реальный TDLib call).

### 10.2 Что покажет лог
В консоли при работе AI:
```
[get-msgs] chat=tg_611...:-1001... afterId=0 from=0 offset=0 count=10 first=999 last=988
[topic-mark] INVOKE chatId=... rawChat=... topicId=... maxId=... source=messageSourceForumTopicHistory
```
Это TDLib backend логи — раньше их **не было** в AI потоке (потому что fallback не достигал backend).

---

## 11. Связь с другими частями

| С чем связано | Как |
|---|---|
| **Phase 1** — handler'ы | handler.context — это адаптер |
| **Phase 2** — write tools | adapter.sendMessage / markAsRead — реально дёргают TDLib |
| **Phase 3** — AISidebarAgent | streaming показывает реальные результаты вместо пустоты |
| **Phase 4a** — Tasks/Reminders | task.source.chatId теперь ведёт к реальному сообщению через AI поиск |
| **TDLib backend** — messages.* | расширены search'ем |

---

## 12. Что осталось

1. **AbortSignal** в adapter — чтобы cancel в UI прерывал TDLib invoke.
2. **Fan-out search** по всем аккаунтам если accountId не задан.
3. **Filter в search** — по типу медиа (photo/video).
4. **Pagination** — `search` сейчас возвращает первые N. Для длинных результатов нужен offset.
5. **Retry на временные ошибки TDLib** — например 420 FLOOD_WAIT.

---

## 13. Файлы — сводка

| Файл | Тип | Что |
|---|---|---|
| `main/ai/aiAgentBackendAdapter.js` | новый | плоский интерфейс над tdlibBackend |
| `main/ai/aiAgentBackendAdapter.vitest.js` | новый | 24 unit-теста |
| `main/native/backends/tdlibBackend.js` | edit | добавлен `messages.search` |
| `src/__tests__/tdlibBackend.vitest.js` | edit | +6 тестов |
| `main/main.js` | edit | `setAgentDeps({ tdlibBackend: createAiAgentBackendAdapter(r.backend) })` |
| `src/__tests__/fileSizeLimitsExceptions.cjs` | edit | tdlibBackend.js 770→840, .vitest.js 480→560 |
| `src/utils/changelogData.js` | edit | запись v1.0.2 |
| `src/utils/changelogData.vitest.js` | edit | '1.0.1' → '1.0.2' |

---

**Версия документа**: создан 9 июня 2026 для v1.0.2.
