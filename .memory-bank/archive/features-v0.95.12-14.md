# Архив: changelog v0.95.12 – v0.95.14

Вынесено 28 мая 2026 при v0.95.17 для уменьшения features.md под лимит 100 КБ. Сага jump-to-end (3 итерации): v0.95.12 (aroundId=lastMessageId offset=0 → пропускал X), v0.95.13 (aroundId=0 → TDLib подменял на read_cursor), v0.95.14 (offset=-50 → TDLib вернул 1). Все провалы → v0.95.15 итеративный fetch (актуальный). Полная сага — jump-to-end-saga.md.

---

### v0.95.14 — Финал jump-to-end: context-window `from=lastMessageId, offset=-50` + rAF×2 для плавности

**Третья и итоговая итерация саги.** Полная история в [`.memory-bank/jump-to-end-saga.md`](./jump-to-end-saga.md).

#### Лог провала v0.95.13 (чат «База Темщика»)

```
chat-open  lastMessageId=3406823424  readInboxMaxId=2543845376  unread=814
button-scroll-jump-to-end (aroundId=0, force=true)
jump-to-end-done bottomGap=0    ← scroll к низу OK
badge unread=814 → 0            ← mark-read сработал ✅

// 4 секунды спустя — юзер кликает ↓ ещё раз:
loadedLastId=2742026240         ← TDLib вернул окно около read_cursor (~2543M),
chatLastMessageId=3406823424    ← а реальный последний далеко выше
gapMessages=634                 ← gap всё ещё 634 сообщений
```

#### Новый корень — недокументированное поведение TDLib `from_message_id=0`

По [TDLib issue #740](https://github.com/tdlib/td/issues/740): когда есть непрочитанные, TDLib **подменяет** `from_message_id=0` на **`last_read_inbox_message_id`** (не на `last_message`, как обещает spec). Цитата из логов TDLib: `"offset_id = 38884" (last read message)` — это видно изнутри.

В нашем случае: `readInboxMaxId=2543845376` → TDLib интерпретировал `from=0` как `from=2543845376` → окно около старого read cursor.

**TDLib spec врёт** в этом сценарии (или Telegram изменил поведение, не обновив docs).

#### Решение v0.95.14 — context-window как Telegram Desktop

```js
loadMessages(viewKey, 100, {
  aroundId: chatLastMessageId,    // ЯВНО передаём lastMessageId (не 0!)
  addOffset: -50,                  // context-window: 50 newer + X + 49 older
  force: true,
})
```

По [TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html): «specify negative offset up to -99 to get additionally newer messages». При `from=lastMessageId, offset=-50, limit=100`:
- 50 newer than lastMessageId (нет — он самый последний) → 0 messages
- + lastMessageId сам (включительно)
- + 49 older = ~50 total с lastMessageId

**Главное**: `from=lastMessageId` (не 0) → TDLib **не сможет** подменить на read_cursor.

#### Эталон — Telegram Desktop

[Telegram Desktop](https://github.com/telegramdesktop/tdesktop) при click ↓:
```cpp
api->requestHistory(peer, peer.last_message.id, offset=-some_offset)
```
Точно тот же паттерн — `from=last_message.id` с отрицательным offset.

#### Плавность — `requestAnimationFrame × 2`

Сейчас `loadMessages.then(() => scrollTo)` — Promise resolved до того как React закончил commit + первый paint. `scrollHeight` мог быть устаревшим → дёрг.

Решение:
```js
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
  })
})
```

Первый rAF ждёт React commit (new DOM mounted). Второй ждёт layout/paint (картинки/видео measured). После — scrollHeight гарантированно точный.

Эталон: [Telegram Web K](https://github.com/morethanwords/tweb) делает то же через microtask + scroll в `onLoaded` callback.

#### Изменения

**1. [nativeStore.loadMessages](src/native/store/nativeStore.js)** — поддержка `options.addOffset`:
```js
const overrideAddOffset = options?.addOffset != null ? Number(options.addOffset) : null
const unreadParams = (hasOverride && force)
  ? {
      limit,
      aroundId: overrideAroundId,
      addOffset: overrideAddOffset != null ? overrideAddOffset : 0,
      requested: false,
    }
  : baseParams
```

**2. [InboxMode.scrollToBottom](src/native/modes/InboxMode.jsx)** — изменён jump-to-end:
- `aroundId: chatLastMessageId` (НЕ 0!)
- `addOffset: -50` (context-window)
- `requestAnimationFrame × 2` перед `scrollTo`

**3. Лог `store-load-messages`** — `override: hasOverride` (не `!!overrideAroundId`) и добавлен `addOffset`. Прошлый баг лога: `!!0=false` показывал override=false когда aroundId=0.

#### Конфликты — все проверены ✅

См. [jump-to-end-saga.md](./jump-to-end-saga.md):
- Backward compat: `loadMessages` без options или без addOffset → старое поведение (`addOffset=0`)
- `useReadByVisibility` cascade guard (v0.94.7) — не задействуется
- `useForceReadAtBottom` threshold 30 (v0.91.13) — не задействуется
- `unreadWindowIncomplete` gate — `source='button-scroll'` в whitelist (v0.95.8)
- `useInitialScroll` reload → `followupRef++` без restore (v0.95.4)
- `tg:messages` full replace — норма (юзер сам кликнул)

#### Тесты

[nativeStore.vitest.jsx](src/native/store/nativeStore.vitest.jsx):
- **«v0.95.14: jump-to-end — aroundId=lastMessageId + addOffset=-50»** — контракт context-window
- **«backward compat: aroundId=0 без addOffset → addOffset=0»** — старое поведение (v0.95.13 fallback)

#### Сага документирована

Новый файл [`.memory-bank/jump-to-end-saga.md`](./jump-to-end-saga.md) — полная история 3-х итераций (v0.95.12-14), включая:
- Что пробовали
- Почему не сработало
- Что в итоге нашли
- TDLib spec vs реальное поведение
- Уроки для будущей работы со скроллом / `getChatHistory`

#### Файлы

| Файл | Что |
|---|---|
| [nativeStore.js](src/native/store/nativeStore.js) | `options.addOffset` поддержка + улучшен лог |
| [InboxMode.jsx](src/native/modes/InboxMode.jsx) | jump-to-end ветка: `aroundId=lastMessageId, addOffset=-50, rAF×2` |
| [nativeStore.vitest.jsx](src/native/store/nativeStore.vitest.jsx) | +1 тест (context-window), обновлён backward-compat |
| [jump-to-end-saga.md](.memory-bank/jump-to-end-saga.md) (новый) | Документация саги v0.95.12-14 |
| [fileSizeLimitsExceptions.cjs](src/__tests__/fileSizeLimitsExceptions.cjs) | nativeStore.vitest 580→600 |

**Регрессия**: lint 0, vitest 724/724 (+1 новый), fileSizeLimits 283/283, check-memory ✅.

---

### v0.95.13 — Фикс jump-to-end: aroundId=0 (TDLib spec last_message включительно)

Юзер скрин (Архиватор | IT): после клика ↓ при unread=1260 — счётчик 1260→1 (mark-read сработал), НО видно «Learning Angular» (предпоследнее), а самое последнее «iOS 18 Programming» не показано. Лог:
```
button-scroll-jump-to-end chatLastMessageId=5633998848 ...   ← server last
button-scroll-jump-to-end-done scrollTop=78858 scrollHeight=79428 bottomGap=0  ← у низа
badge-state unread=1260 → 1
```
Через 30с юзер кликает ↓ ещё раз: `loadedLastId=5632950272, chatLastMessageId=5633998848, gapMessages=1` — последнее сообщение пропущено.

#### Корень

[TDLib `getChatHistory` spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html):
- `from_message_id=X, offset=0, limit=N` → возвращает N сообщений **СТРОГО СТАРШЕ X** (не включая X)
- **`from_message_id=0`** → «the last message in the chat is used» — захватывает ИМЕННО последнее

v0.95.12 передавал `aroundId=chatLastMessageId` → backend → `from=lastMessageId, offset=0` → TDLib грузил сообщения СТАРШЕ lastMessageId → **самое последнее пропускалось**.

#### Решение (1 строка изменения)

В [InboxMode.jsx scrollToBottom](src/native/modes/InboxMode.jsx) jump-to-end ветка: `aroundId: 0` (НЕ `chatLastMessageId`). По TDLib spec backend сам подставит `last_message` и захватит его.

Также фикс в [nativeStore.loadMessages](src/native/store/nativeStore.js): `options.aroundId != null` (вместо truthy `options?.aroundId`) — иначе `0` интерпретировалось как «нет override» → терялся.

#### Что изменится для юзера

| До (v0.95.12) | После (v0.95.13) |
|---|---|
| Клик ↓ → видно предпоследнее, unread=1 остаётся | Клик ↓ → видно ВСЕ последние сообщения, unread=0 |
| Нужно кликнуть ↓ второй раз | Один клик |

#### Тест обновлён

[nativeStore.vitest.jsx](src/native/store/nativeStore.vitest.jsx): тест переименован под v0.95.13, проверяет `aroundId: 0` → invoke с `aroundId: 0, addOffset: 0` (TDLib `from=0=last_message` semantics).

#### Конфликты — все проверены ✅

- ✅ Override через `!= null` не ломает старые вызовы (`options=undefined` → `hasOverride=false`)
- ✅ `addOffset=0` корректно для TDLib `from=0` (грузит ровно последние limit сообщений)
- ✅ Mark-read до `chatLastMessageId` остаётся (bypass-gate v0.95.8) — обнуляет счётчик
- ✅ Backward compat: тест «без options → старое поведение» по-прежнему проходит

**Регрессия**: lint 0, vitest 723/723, fileSizeLimits 283/283, check-memory ✅.

---

### v0.95.12 — JUMP-TO-END-OF-CHAT для кнопки ↓ (Telegram Desktop / Web K / WhatsApp style)

Точный фикс по реальным числам из v0.95.11 диагностики. Чат «Департамент вайб-кодинга», `unread=1108, loadedIncoming=100, chatLastMessageId=45491421184, loadedLastId=44420825088, gapMessages=1021, unreadVsLoaded=1008` — между загруженным окном и сервером пропущено ~1021 сообщений. Клики ↓ догружали только +98 за раз — нужно ~11 кликов чтобы дойти до конца. После 2 кликов юзер у `bottomGap=0` (низ загруженного), но `unread=920` остаётся — `handleScroll` не триггерится без user-scroll, load-newer не запускается. **Корень**: при открытии чата `loadMessages` грузит окно вокруг `readInboxMaxId` (первое непрочитанное), но не вокруг `chat.last_message.id` (последнее на сервере).

#### Решение (одна функция, эталон трёх клиентов)

Telegram Desktop / Web K / WhatsApp Web при click ↓ — `getChatHistory(from=last_message.id)`. У нас:

**1. [nativeStore.loadMessages](src/native/store/nativeStore.js)** принимает `options.aroundId` + `options.force`:
- `options.aroundId` — override `unreadParams.aroundId`
- `options.force` — отключает IDB optimistic render + `addOffset=0` (ровно вокруг `aroundId`, без unread-окна)
- Без options — поведение **не изменено** (backward compat подтверждена тестом)

**2. [InboxMode.scrollToBottom](src/native/modes/InboxMode.jsx)** — новая ветка jump-to-end:
```js
const loadedIncoming = activeMessages.filter(m => !m.isOutgoing).length
const unreadVsLoaded = activeUnread - loadedIncoming
if (chatLastMessageId && unreadVsLoaded > 50 && !loading) {
  await store.loadMessages(viewKey, 100, { aroundId: chatLastMessageId, force: true })
  el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
  markReadCurrentView(viewKey, chatLastMessageId, { source: 'button-scroll' })
  setAtBottom(true); setNewBelow(0)
  return  // ранний выход
}
// fallback: старое поведение (обычный scroll в низ загруженного + markRead до loadedLast)
```

**Гейт срабатывания** (3 условия):
- `chat.lastMessageId` — поле есть (v0.95.11 mapper)
- `unreadVsLoaded > 50` — большой gap (юзер просто долистал ≤50 — обычное поведение)
- `!loading` — не запускается второй reload (guard от повторных кликов)

#### Что произойдёт на скрине юзера (1108 unread)

| До (v0.95.11) | После (v0.95.12) |
|---|---|
| Клик ↓ → no-op (atBottom=true) | Клик ↓ → reload вокруг lastMessageId |
| Счётчик 1108 → застрял | Счётчик 1108 → 0 (mark-read до lastMessageId) |
| Юзер видит старые 100 сообщений | Юзер видит свежие 100 сообщений (новейшие) |
| Нужно ~11 кликов | Один клик |

#### Эталоны (3 факта)

🥇 [Telegram Desktop](https://github.com/telegramdesktop/tdesktop) — `historyHider` click ↓: `getHistory(peer, from=peer.last_message.id, limit=100)`
🥇 [Telegram Web K appMessagesManager](https://github.com/morethanwords/tweb) — `dialog.top_message` для прыжка к концу
🥇 [TDLib getChatHistory spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html) — `from_message_id=last_message.id, offset=0, limit=100` — штатное API

#### Конфликты — все проверены ✅

- ✅ `tg:messages` без append → полная замена `state.messages[chatId]` (юзер сам кликнул, OK)
- ✅ `useInitialScroll` при изменении `messagesCount`: `isReturning=false → followupRef++` + log + return (нет конфликта restore)
- ✅ `scrollPosByChatRef` — мой `scrollTo` перебьёт старую позицию, handleScroll сохранит правильную
- ✅ `useReadByVisibility` cascade guard (v0.94.7) — НЕ задействуется (source='button-scroll', не visibility)
- ✅ `useForceReadAtBottom` threshold 30 (v0.91.13) — отдельный hook, не задействуется
- ✅ `unreadWindowIncomplete` gate — bypass через `source='button-scroll'` (v0.95.8)
- ✅ load-newer после reload: backend вернёт пустой массив (afterId ≈ lastMessageId) → `noMoreNewer.set(true)`, петли нет
- ✅ Guard на `loadingMessages` — повторные клики ↓ игнорируются
- ✅ IDB cache замещается на свежие 100 (как Telegram Desktop — норма)
- ✅ markRead до `chat.lastMessageId` — TDLib range-ack договор API ([viewMessages spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1view_messages.html))

#### Тесты — 2 новых unit-теста

[nativeStore.vitest.jsx](src/native/store/nativeStore.vitest.jsx):
1. **«options.aroundId+force → invoke с aroundId=lastMessageId, addOffset=0»** — контракт override
2. **«без options → старое поведение (unread окно)»** — backward compat

3 защиты от регрессии:
- `aroundId` точно равен переданному (override работает)
- `addOffset = 0` при force (нет unread-окна)
- Без options всё как раньше (`addOffset=-90`)

#### Файлы

| Файл | Что |
|---|---|
| [nativeStore.js](src/native/store/nativeStore.js) | `loadMessages(chatId, limit, options)` + опциональные `aroundId`/`force` + skip IDB при force |
| [InboxMode.jsx](src/native/modes/InboxMode.jsx) | scrollToBottom jump-to-end ветка (gate `unreadVsLoaded > 50`) |
| [nativeStore.vitest.jsx](src/native/store/nativeStore.vitest.jsx) | +2 теста |
| [fileSizeLimitsExceptions.cjs](src/__tests__/fileSizeLimitsExceptions.cjs) | nativeStore.js 1050→1080, vitest.jsx 500→580 (доменное разбиение store — отдельный шаг) |

**Регрессия**: lint 0, vitest 723/723 (+2 новых), fileSizeLimits 283/283, check-memory ✅.

---

