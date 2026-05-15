# Changelog структуры Memory Bank

Этот файл — журнал изменений **самого Memory Bank** (не проекта). Сюда попадают:
- Переструктуризация файлов (разбиение, объединение, переименование)
- Новые правила работы с памятью
- Изменения правил архивации
- Добавление автотестов/скриптов проверки здоровья

Для changelog **проекта** (версии, фичи, фиксы) — см. [`features.md`](./features.md).
Для архитектурных решений — см. [`decisions.md`](./decisions.md).

---

## 2026-05-15 — TDLib Stage 4: пост-миграционный аудит (v0.89.2)

Независимый аудит реализации TDLib backend против документации стека (tdl + TDLib core API). Найдено 3 критичных + 3 точечных проблемы — все 6 закрыты.

### Закрытые проблемы

1. **`buildTdlibParameters` был dead code**: возвращал готовый объект, но никуда не передавался. TDLib видел приложение как «Unknown device v1.0 / EN» без `enable_storage_optimizer`. Фикс: `clientFactory` в `tdlibRuntime.js` пробрасывает `clientParams.tdlibParameters` в `tdl.createClient({ tdlibParameters })`. tdl расширяет setTdlibParameters через `...this._options.tdlibParameters` (см. `node_modules/tdl/dist/client.js:629-637`).
2. **`sendFile` неточные mappings**: `.gif → inputMessagePhoto` (теряла анимацию), `.heic → inputMessagePhoto` (TDLib не поддерживает). Также не передавались required поля inputMessage<Type>. Фикс: добавлена ветка для `inputMessageAnimation`, `.heic` теперь Document, все required поля заполняются (TDLib читает реальные размеры из файла на сервере).
3. **Три IPC канала были stub'ами**: `tg:set-mute`, `tg:pin`, `tg:get-cleanup-stats` возвращали `{ ok: true }` без действий. Юзер нажимал «Закрепить чат» — ничего не происходило. Фикс: реальная реализация через `setChatNotificationSettings` (16-полевой объект), `toggleChatIsPinned` (chat_list:chatListMain), `getStorageStatisticsFast`. Вынесено в [`tdlibChatActions.js`](../main/native/backends/tdlibChatActions.js) — split из `tdlibBackend.js`.
4. **Дублирование `_finalizePending` vs `finalizeAccount`**: две почти одинаковые функции с разным набором fallback'ов на имя. Manual-login и auto-restore вели себя по-разному. Фикс: `_finalizePending` теперь зовёт `manager.finalizeAccount` — единая точка с phone-fallback и auto-download своей profile_photo.
5. **`authorizationStateWaitRegistration` не обрабатывался**: новый Telegram-номер давал generic «unsupported state» вместо понятной инструкции. Фикс: отдельная ветка с RU-сообщением «У этого номера ещё нет аккаунта Telegram. Зарегистрируйтесь через официальное приложение».
6. **`_pendingAvatars` catch leak**: при ошибке `downloadFile` запись висела в Map вечно. Фикс: в `.catch` теперь `delete(fileId)`. Также `safeInvoke`/`wrapError` сохраняют `e?.code` как есть вместо фейкового 0.

### Архитектурное

- **Новый файл [`tdlibChatActions.js`](../main/native/backends/tdlibChatActions.js)** (111 строк): `setMute`, `togglePin`, `getCleanupStats`. Split из `tdlibBackend.js` который упёрся в лимит 500 строк после реализации.
- **Тестов**: 485 → 506 (+21). Новый файл `tdlibBackendChatActions.vitest.js` (11 тестов) + дополнения к `tdlibBackendSendFwd` (gif/heic/required-fields), `tdlibRuntime` (tdlibParameters проброс), `tdlibAuth` (WaitRegistration).

### Почему важно

Аудит показал, что миграция архитектурно собрана правильно, но эти 6 точечных мест давали user-facing регрессии (Unknown device в Telegram сессиях, неработающие mute/pin/закрепление, потеря анимации GIF). Без аудита они могли долго оставаться незамеченными — UI не выдавал ошибок, просто действия молча не работали.

---

## 2026-05-14 — TDLib Stage 4 / Этап 4: полное удаление GramJS

### Удалено

13 production-файлов GramJS-интеграции:

- `main/native/backends/gramjsBackend.js` — backend-адаптер.
- `main/native/telegramHandler.js` (был 1260 строк) — корневой orchestrator.
- `main/native/telegramAuth.js` — `tg:login-*` handlers.
- `main/native/telegramChats.js`, `telegramChatsIpc.js` — `tg:get-chats`, `tg:rescan-unread`.
- `main/native/telegramCleanup.js` — periodic cache cleanup.
- `main/native/telegramErrors.js` — RU-перевод GramJS-ошибок.
- `main/native/telegramForumTopicsIpc.js` — `tg:get-topics` для forum-чатов.
- `main/native/telegramMedia.js` — `tg:download-media`, `tg:download-video`.
- `main/native/telegramMessageMapper.js` — GramJS Message → NativeMessage.
- `main/native/telegramMessages.js` — `tg:get-messages`, `tg:send-message`, `tg:mark-read`.
- `main/native/telegramState.js` — общий state singleton (clients/cache).
- `main/native/tdlibPoc.cjs` — PoC-скрипт времён Этапа 1.

4 GramJS-only теста удалены (`multiAccount.test.cjs`, `multiAccountUI.test.cjs`,
`mediaCacheQuota.test.cjs`, `unreadAutoPrefetch.test.cjs`) — поведение теперь покрывается
TDLib-вариантами в `src/__tests__/tdlib*.vitest.js` + `VirtualMessageList.vitest.jsx`.

### Изменено

- `main/main.js` — убран fallback на GramJS. Единственная инициализация — `initTdlibBackendStartup`.
  Env-флаг `USE_TDLIB_BACKEND` больше не читается (всегда TDLib).
- `main/native/messengerBackend.js` — упрощён до JSDoc-описания интерфейса + `getBackendName()` → `'tdlib'`.
- `src/__tests__/messengerBackend.test.cjs` — переписан под TDLib-only. Проверяет что все 13 GramJS-файлов
  удалены и 11 TDLib-модулей на месте.
- `src/__tests__/mainRuntime.test.cjs` — убраны `require('telegram/*')` проверки.
- `package.json` — `test` script больше не вызывает 4 удалённых cjs-теста.

### Почему

Stage 4 Этап 4 — финальная стадия миграции с GramJS на TDLib (план: `.memory-bank/native-mode-plan.md`,
секции «Stage 4»). После того как все Этапы 3.1–3.13 закрыли функциональные эквиваленты (auth, chats,
messages, media, forum, avatars, sendFile, forwardMessage), параллельная поддержка двух backend'ов
становится мёртвым грузом — лишний код, лишние тесты, два разных rate-limit поведения. TDLib стабильнее
GramJS (используется в официальных клиентах), и проект целевой на одного backend'а.

### Чем это закрывает

- Завершает миграцию GramJS → TDLib (Stage 4 / весь план).
- Уменьшает кодовую базу на ~3500 строк production-кода + ~500 строк удалённых тестов.
- Снимает потенциальный риск двойной инициализации (GramJS + TDLib) одной сессии Telegram.

---

## 2026-05-14 — TDLib Stage 4 / Этап 3.9+3.10: аватарки + forum topics + memory leak fix

### Bugs (из реального запуска после 3.8)

1. `[ERROR] MaxListenersExceededWarning: 11 file:update listeners added to [TdlibClientManager]`
   — каждая параллельная downloadFile подписывается на `file:update`, default limit 10.
2. **Health check 0 мс** — выглядит подозрительно (на самом деле getOption отвечает <1мс из кэша).
3. **Аватарки чатов/отправителей не загружаются** — нет моста `tg:chat-avatar`/`tg:sender-avatar`.
4. **Forum topics не работают** — `messages.getTopic` и `forum.getTopics` были STUB.

### Fixes — Этап 3.9 (cosmetic + avatars)

- **`TdlibClientManager.setMaxListeners(100)`** в конструкторе — не утечка, listeners
  снимаются после resolve, default Node.js limit 10 слишком жёсткий для UI с 20 аватарками
  загружающимися параллельно.
- **healthCheck min 1 мс** — `Math.max(1, Date.now() - t0)` чтобы UI не путался.
- **Avatars pipeline** в `tdlibClient.js`:
  - `_pendingAvatars: Map<fileId, { accountId, kind, ownerId }>` — связь между file и owner.
  - `_scheduleAvatarDownload(record, kind, ownerId, photoFile)` — при `updateNewChat`/
    `updateUser` запускает `downloadFile` с priority=1 (background).
  - `_handleAvatarReady(record, file)` — при `updateFile` с `is_downloading_completed=true`
    проверяет `_pendingAvatars` и эмитит соответствующее событие.
  - `_emitAvatarReady` — emit `chat:avatar` или `user:avatar` с `file://` URL
    (TDLib хранит файлы вне cc-media:// folders).
- **Bridge events** в `tdlibIpcHandlers.js`:
  - `chat:avatar` → `tg:chat-avatar` (UI store обновляет chat.avatar)
  - `user:avatar` → `tg:sender-avatar` (UI обновляет senderAvatar в messages)

### Fixes — Этап 3.10 (forum topics)

- **`messages.getTopic`** — реализован через TDLib `getMessageThreadHistory`:
  `{ '@type': 'getMessageThreadHistory', chat_id, message_id (=topicId), from_message_id,
  offset, limit }`. Возвращает messages в reverse-order (UI ждёт от старых к новым).
- **`messages.markTopicRead`** — реализован через TDLib `viewMessages` с `force_read: true`.
  TDLib обновляет `last_read_inbox_message_id` для текущего thread.
- **`forum.getTopics`** — реализован через TDLib `getForumTopics`:
  - Сначала проверяет `chat.type.is_forum` из cache — если не forum, возвращает
    `{ ok: true, isForum: false, topics: [] }` без сетевого запроса.
  - При forum-чате: invoke `getForumTopics({ chat_id, query: '', offset_*, limit })`.
  - Мапит `forumTopic.info.message_thread_id` → `id/topicId/topMessageId` (UI ждёт
    все 3 поля для совместимости с GramJS).
  - Также мапит: `title`, `unreadCount`, `iconColor`, `iconCustomEmojiId`, `isClosed`,
    `isPinned`, `readInboxMaxId`.
- **`forum.getTopicMessages`** — теперь noop с указанием «use messages.getTopic instead»
  (UI зовёт `tg:get-topic-messages` который маршрутится в `messages.getTopic`).

### Tests

- Обновлены тесты в `tdlibBackend.vitest.js` под новые реализации:
  - Был «getTopic/markTopicRead/forwardMessage/sendFile NOT_IMPL» — теперь только
    forwardMessage/sendFile NOT_IMPL.
  - Удалён тест «getTopics возвращает NOT_IMPL».
- **`src/__tests__/tdlibBackendForum.vitest.js`** (новый, 12 тестов):
  - messages.getTopic (4): параметры, reverse-order, no topicId, invoke fail
  - messages.markTopicRead (2): viewMessages вызов, invalid chatId
  - forum.getTopics (6): не-forum chat, forum chat с topics, параметры invoke,
    limit clamp до 100, invoke fail, invalid chatId
- vitest: 472 теста (35 файлов).

### Лимиты файлов
- `tdlibBackend.vitest.js` упёрся в 400 строк → forum-тесты вынесены в
  `tdlibBackendForum.vitest.js`.

### Прогресс
- Этапы 0, 1, 2.1-2.6, 3.1-3.8 ✅
- **Этап 3.9 (avatars + cosmetic fixes) ✅**
- **Этап 3.10 (forum topics) ✅**
- Этап 4 — реальное тестирование

---

## 2026-05-14 — TDLib Stage 4 / Этап 3.8: emit tg:messages + missing IPC handlers + healthCheck format

### Bugs из реального запуска (post Этап 3.7)

После 3.7 чаты загружаются. Но при клике на чат:

1. Сообщения не появляются — индикатор бежит вечно.
2. Логи показывают непрерывные ошибки:
   ```
   ERROR: No handler registered for 'tg:get-pinned'
   ERROR: No handler registered for 'tg:refresh-avatar'
   ```
3. Health-check показывает «Не отвечает / ошибка» хотя в логе `ms=23`.

### Fixes (main/native/tdlibIpcHandlers.js + tdlibBackend.js)

**Emit tg:messages event** (та же проблема что 3.7 с tg:chats):
- GramJS `telegramMessages.js:242` после getHistory эмитит `tg:messages` event.
- UI store (nativeStoreIpc.js) подписан только на event, не на invoke response.
- Мой `tg:get-messages` возвращал messages через invoke response → UI висел.
- ✅ После `backend.messages.get(params)` теперь эмитим
  `sendToRenderer('tg:messages', { chatId, messages, append, appendNewer, readUpTo, aroundId, afterId })`.
- Аналогично для `tg:get-topic-messages`.

**Alias `tg:get-pinned`**:
- UI зовёт `tg:get-pinned` (без `-message`), я зарегистрировал `tg:get-pinned-message`.
- ✅ Добавлен handler `tg:get-pinned` который проксирует в `backend.messages.getPinned`.

**noop `tg:refresh-avatar`**:
- В TDLib аватарки приходят через `updateChatPhoto` event автоматически —
  «refresh» концепция GramJS-only.
- ✅ Регистрируем noop `{ ok: true }` чтобы UI не получал «No handler» error
  каждый раз при открытии чата.

**Missing handlers** для UI:
- ✅ `tg:set-typing` — пробрасывает в TDLib `sendChatAction` (chatActionTyping).
- ✅ `tg:set-mute` — noop (TODO: setChatNotificationSettings).
- ✅ `tg:pin` — noop (TODO: toggleChatIsPinned).
- ✅ `tg:send-file` — STUB с понятным error.
- ✅ `tg:get-cleanup-stats` — простой stub `{ ok, bytes: 0, fileCount: 0 }`.

**healthCheck format**:
- UI ожидает `{ ok, accountStats: [{ accountId, ms, ok, error? }] }`
  (см. `accountStatById` в `nativeStore.js:154` — array.find).
- Я возвращал `{ ok, perAccount: { tg_xxx: {...} } }` — несовместимо.
- ✅ Backend `chats.healthCheck` теперь собирает `accountStats: []`.

### Tests

- Обновлены 2 теста под новый формат `accountStats` (вместо `perAccount`).
- vitest: 460/460 проходят.

### Прогресс
- Этапы 0, 1, 2.1-2.6, 3.1-3.7 ✅
- **Этап 3.8 (emit tg:messages + missing handlers) ✅** — текущий коммит
- Этап 4 — реальное тестирование (продолжение)

---

## 2026-05-14 — TDLib Stage 4 / Этап 3.6: восстановление + finalize при autoRestore

### Bug (по фактам из реального запуска)

После Этапа 3.5 пользователь повторно запустил `USE_TDLIB_BACKEND=1; npm start`.
В sidebar появилась stale аватарка «Б» (от старого GramJS-кэша), но **TDLib
аккаунт не подгрузился** — `restored=0 accounts` в логе. Чаты пустые,
кнопка «+» не работает.

Факты из системы:
- `%APPDATA%\ЦентрЧатов\tdlib-sessions\pending\` — папка существует
  и содержит **11.5 МБ TDLib БД** (`db.sqlite` + `td.binlog`). Файлы
  активно пишутся → TDLib работает с валидной session.
- Но `autoRestoreSessionsFromDisk` **пропускал** папку `pending` (была
  логика «pending = временный logged-out, игнорировать»).
- Прошлый login дошёл до Ready, но завершился ДО Этапа 3.5 (когда
  ещё не было `_finalizePending`) — поэтому переименование
  `pending → tg_${userId}` не сделалось, папка осталась `pending`.

### Fix

- **`autoRestoreSessionsFromDisk`** ([tdlibRuntime.js](main/native/backends/tdlibRuntime.js)):
  - Папку `pending` теперь **восстанавливаем** если в ней `db.sqlite > 100 КБ`
    (heuristic — valid TDLib session). Пустой `pending` без БД (от отменённого
    login) продолжаем пропускать.
- **`TdlibClientManager.waitForReady(accountId, timeoutMs)`** — новый метод:
  - Промис резолвится при `account:auth-state` event со state =
    `authorizationStateReady` → `{ ok: true }`.
  - Другие `authorizationStateWait*` → `{ ok: false, error: 'need-relogin' }`.
  - `authorizationStateClosed`/`LoggingOut` → `{ ok: false, error: 'closed' }`.
  - Timeout → `{ ok: false, error: 'timeout' }`.
  - `WaitTdlibParameters`/`WaitEncryptionKey` игнорируются (tdl сама обрабатывает).
- **`TdlibClientManager.finalizeAccount(accountId)`** — вынесена логика
  finalize из `tdlibBackend._finalizePending` в метод manager'а:
  - `client.invoke({ '@type': 'getMe' })` → user info.
  - `_renameAccount(accountId, 'tg_${userId}')`.
  - emit `account:update` с полным name/phone/username/userId.
- **`tdlibStartup`** ([tdlibStartup.js](main/native/backends/tdlibStartup.js)):
  - После `autoRestoreSessionsFromDisk` для каждого restored accountId:
    fire-and-forget `await manager.waitForReady(aid, 15000)` →
    если ok → `manager.finalizeAccount(aid)`.
  - Это эмитит `tg:account-update` → UI sidebar получает реальный аккаунт
    с правильным name/phone.

### Tests

- **`src/__tests__/tdlibClientFinalize.vitest.js`** (новый, 14 тестов):
  - waitForReady (8 тестов): уже Ready, Ready приходит позже,
    WaitPhoneNumber → need-relogin, WaitCode → need-relogin, Closed,
    WaitTdlibParameters игнорируется, timeout, listener cleanup.
  - finalizeAccount (6 тестов): getMe → rename → emit полный путь;
    fallback на @username когда имени нет; client не существует →
    ok:false; getMe падает → ok:false; getMe без id → ok:false;
    уже правильный accountId работает (без rename).

### Прогресс
- Этапы 0, 1, 2.1-2.6, 3.1-3.5 ✅
- **Этап 3.6 (autoRestore + finalize) ✅** — текущий коммит
- Этап 4 — реальное тестирование

---

## 2026-05-14 — TDLib Stage 4 / Этап 3.5: три фикса по результатам реального login

### Bugs (из реального login flow USE_TDLIB_BACKEND=1)

После Этапа 3.4 (нормализация tdl формата) login пошёл дальше, но обнаружились:

1. **Ошибка «Unexpected setTdlibParameters»** при вводе кода. tdl библиотека
   через `_handleAuthInit` (node_modules/tdl/dist/client.js строка 610-650)
   **автоматически** отправляет `setTdlibParameters` сразу при создании клиента —
   до нашей подписки на updates. Наш код в `TdlibAuthFlow._onAuthState` тоже
   отправлял setTdlibParameters в ответ на `WaitTdlibParameters` → второй
   вызов → TDLib отвергал как «unexpected».
2. **Ошибки на английском** (`PASSWORD_HASH_INVALID`, `PHONE_CODE_INVALID`)
   показывались напрямую в UI. UI ожидает русские строки.
3. **Аккаунт не появлялся в sidebar** после успешного login. Не было
   `getMe()` + переименования `tg_pending_${ts}` → `tg_${userId}` + emit
   `account:update` event.

### Fixes

- **`main/native/backends/tdlibAuth.js`**:
  - Убран `client.invoke(setTdlibParameters)` в `_onAuthState` — tdl делает сама.
  - Добавлена таблица `ERR_RU` с переводами 11 типичных кодов TDLib
    (`PHONE_NUMBER_INVALID` → «Номер телефона указан в неправильном формате»,
    `PASSWORD_HASH_INVALID` → «Неверный пароль двухфакторной защиты», etc).
  - Экспорт `translateTdlibError(msg)` — извлекает `[A-Z_]{4,}` код регуляркой
    и мапит через таблицу. Неизвестные коды возвращаются как есть (fallback).
  - Все resolvers (startLogin/submitCode/submitPassword + _rejectPending)
    оборачивают error через `translateTdlibError`.
- **`main/native/backends/tdlibClient.js`** — новый метод `_renameAccount(oldId, newId)`:
  переименовывает запись в Map<accountId, record>, обновляет `record.accountId`,
  эмитит `account:renamed`. Возвращает false если oldId не найден, целевое имя
  занято, или ids одинаковы.
- **`main/native/backends/tdlibBackend.js`** — функция `_finalizePending` (closure):
  - Вызывается после каждого successful step ('success' или success: true)
    из startLogin/submitCode/submitPassword.
  - `client.invoke({ '@type': 'getMe' })` → получает user info.
  - `manager._renameAccount(_pendingAccountId, 'tg_${user.id}')`.
  - `manager.emit('account:update', { id, messenger: 'telegram', status: 'connected',
    name, phone, username, userId })`.
- **`main/native/tdlibIpcHandlers.js`** — добавлен мост: `account:update` event
  от manager → `tg:account-update` IPC → UI sidebar добавит аккаунт.

### Tests

- **`src/__tests__/tdlibAuth.vitest.js`**:
  - Новый `describe('translateTdlibError')` с 6 тестами (PHONE/PASSWORD/CODE,
    обёрнутые сообщения, неизвестные коды, null/undefined).
  - Обновлён тест «полный flow с 2FA»: теперь проверяет что setTdlibParameters
    НЕ отправляется самим кодом (tdl делает сама).
  - Обновлён тест «invoke падает»: проверяет русский перевод вместо raw code.
- **`src/__tests__/tdlibClientRename.vitest.js`** (новый, 7 тестов):
  - rename меняет id в Map + эмитит `account:renamed`
  - record.accountId обновляется (getClient по новому id)
  - user/chat cache переезжают с записью
  - целевое имя занято → false без изменений
  - oldId не найден → false
  - oldId === newId → false (noop)
  - пустые id → false
- **`src/__tests__/tdlibBackend.vitest.js`** — новый тест «finalizePending»:
  полный flow startLogin → WaitCode → submitCode → WaitPassword → submitPassword
  → Ready + getMe. Проверяет: getMe был вызван, аккаунт переименован
  `tg_pending_X` → `tg_638454350`, account:update эмитнут с правильными полями
  (id, name, phone, username, userId).

### Лимит файлов
- `tdlibClient.vitest.js` упёрся в 400 строк → 3 теста на `_renameAccount`
  вынесены в `tdlibClientRename.vitest.js`.

### Прогресс
- Этапы 0, 1, 2.1-2.6, 3.1, 3.2, 3.3, 3.4 ✅
- **Этап 3.5 (три фикса real-login) ✅** — текущий коммит
- Этап 4 — реальное тестирование пользователем (повторно)

---

## 2026-05-14 — TDLib Stage 4 / Этап 3.4: КРИТИЧНЫЙ ФИКС — нормализация tdl формата

### Bug
**Login flow зависал на «Отправляем код в Telegram...»** при USE_TDLIB_BACKEND=1.
Telegram действительно слал SMS-код (видно в логе через WebView Telegram push),
но UI не получал `tg:login-step { step: 'code' }` → промис tg:login-start висел вечно.

### Корневая причина
Библиотека [`tdl`](https://github.com/Bannerets/tdl) внутри переименовывает
TDLib JSON-API discriminator `@type` → `_` через `deepRenameKey('@type', '_', res)`
([node_modules/tdl/dist/client.js:532](node_modules/tdl/dist/client.js#L532)).

Весь наш код (tdlibMapper, tdlibClient._handleUpdate, tdlibMessages, tdlibMedia)
проверяет `obj['@type']` согласно стандартной TDLib документации
(core.telegram.org). При получении реальных событий от tdl это поле было
`undefined` — все checks `if (type === 'updateNewMessage')` не матчились,
события игнорировались.

В частности: `updateAuthorizationState` приходил с `_: 'updateAuthorizationState'`,
наш `_handleUpdate` switch падал в default → `_handleAuthState` никогда не
вызывался → resolvers в TdlibAuthFlow не резолвились → login висел.

### Fix
- **`main/native/backends/tdlibNormalize.js`** (90 строк) — новая утилита:
  - `deepRenameKey(from, to, obj)` — рекурсивный rename ключа без мутации.
  - `normalizeFromTdl(obj)` — `deepRenameKey('_', '@type', obj)`.
  - `wrapClientForNormalization(rawClient)` — обёртка над реальным tdl client:
    - `invoke(request)` — request передаётся как есть (tdl сама конвертирует
      `@type` → `_` для отправки); результат нормализуется `_` → `@type`.
    - `on('update', handler)` — каждый update нормализуется перед вызовом handler.
    - `off`, `close`, `_raw` (для тестов).
    - Не-update events проходят без изменений.
- **`main/native/backends/tdlibRuntime.js`** — clientFactory оборачивает результат
  `tdl.createClient()` через `wrapClientForNormalization`. ОДНА точка изменения,
  весь остальной код работает с `@type` как и раньше.

### Преимущества подхода
- **Локальная правка**: всего одна обёртка в одном месте создания клиента.
- **Mapper / Manager / Messages / Media / IPC handlers НЕ трогаются** —
  они продолжают работать с `@type` как было задумано по TDLib JSON-API.
- **Тесты с mock-клиентами продолжают работать** — мок-клиенты эмитят `@type`
  сразу (без `_`), и они оборачиваются wrapper'ом тоже без проблем (deepRename
  не трогает существующее `@type` поле, только переименовывает `_`).

### Tests
- **`src/__tests__/tdlibNormalize.vitest.js`** (16 тестов):
  - deepRenameKey: 6 (top-level, nested, arrays, immutability, primitives, reverse)
  - normalizeFromTdl: 1
  - wrapClientForNormalization: 8 (invoke result normalize, request as-is,
    update events normalize, off, non-update events pass-through, close,
    null safe, _raw expose)
  - End-to-end auth flow simulation: 1
- **`src/__tests__/tdlibRuntime.vitest.js`** — обновлён 1 тест: `closeTdlibRuntime`
  закрывает клиенты теперь через `client._raw.close` (wrapper не имеет `close` spy).
- **`src/__tests__/tdlibStartup.vitest.js`** — обновлены 3 теста sendToRenderer
  использовать `client._raw.emit` (raw EventEmitter спрятан в `_raw`).

### Прогресс
- Этапы 0, 1, 2.1-2.6, 3.1, 3.2, 3.3 ✅
- **Этап 3.4 (нормализация tdl формата) ✅** — текущий коммит
- Этап 4 — реальное тестирование пользователем (повторно с этим фиксом)

---

## 2026-05-14 — TDLib Stage 4 / Этап 3.3: main.js startup integration. **Этап 3 закрыт.**

### Added
- **`main/native/backends/tdlibStartup.js`** (130 строк):
  `initTdlibBackendStartup({ userDataPath, getMainWindow, ipcMain, apiId?, apiHash?, tdl?, prebuiltTdlib?, log? })`
  — orchestrator который последовательно собирает все слои:
  1. `initTdlibRuntime` (singleton + manager)
  2. `createTdlibBackend({ manager, tdlibParameters, makeClientParams })`
  3. `sendToRenderer = (ch, p) => mainWindow.webContents.send(ch, p)`
     (с защитой от `isDestroyed` и try/catch для race conditions)
  4. `initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer })`
  5. `autoRestoreSessionsFromDisk({ makeClientParams })` — поднимает
     существующие сессии (если есть)
  Возвращает `{ ok, manager, backend, unregister, restoredAccountIds, error? }`.
- **Идемпотентность**: повторный вызов возвращает существующий handle.
- **`resetTdlibStartup()`** — graceful shutdown для тестов (unregister IPC +
  closeTdlibRuntime).

### Changed
- **`main/main.js`** (строки 17-18, 6, 225-249):
  - Импортирован `ipcMain` из 'electron' и `initTdlibBackendStartup`.
  - Логика инициализации backend:
    ```
    const useTdlibBackend = process.env.USE_TDLIB_BACKEND === '1'
    if (useTdlibBackend) try { TDLib startup } catch { fallback to GramJS }
    if (!backendInitOk) initTelegramHandler (GramJS как сейчас)
    ```
  - При USE_TDLIB_BACKEND=0 (по умолчанию) — **поведение не изменилось**.
  - При USE_TDLIB_BACKEND=1 + успешная инициализация TDLib — GramJS НЕ запускается.
  - При USE_TDLIB_BACKEND=1 + ошибка TDLib — safe fallback на GramJS,
    приложение работает (с warning в логах).

### Tests
- **`src/__tests__/tdlibStartup.vitest.js`** (334 строки, 16 тестов):
  - Validation: 3 (без userDataPath/ipcMain/getMainWindow)
  - Successful init: 4 (runtime+backend+ipc, singleton, idempotency, custom apiId/Hash)
  - Error handling: 2 (empty tdjson path, configure throws)
  - sendToRenderer: 3 (forward to webContents.send, isDestroyed safe, send throws safe)
  - Auto-restore: 2 (восстановление существующих папок, пустая папка)
  - Unregister/reset: 2 (cleanup IPC handlers, повторный init после reset)

### Безопасность миграции
- **Default behavior unchanged**: без env var GramJS работает как раньше.
- **Two paths не конфликтуют**: при USE_TDLIB_BACKEND=1 только TDLib запускается,
  иначе только GramJS. Одновременно НЕ возможно.
- **Fallback при ошибке TDLib**: попытка `initTdlibBackendStartup` → если ok=false
  → main.js всё равно запускает initTelegramHandler. Пользователь не заметит
  что TDLib не загрузился (только увидит warning в console).

### Прогресс по плану миграции
- **Этап 3 ПОЛНОСТЬЮ ЗАКРЫТ**: 3.1 runtime ✅ + 3.2 IPC handlers ✅ + 3.3 main.js ✅
- Этап 4 (реальное тестирование с пользователем + удаление GramJS) — следующий

---

## 2026-05-14 — TDLib Stage 4 / Этап 3.2: TDLib IPC handlers

### Added
- **`main/native/tdlibIpcHandlers.js`** (215 строк):
  `initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer, log })` —
  единая точка регистрации IPC channels через TDLib backend.
- **Зарегистрированные каналы (22)** — все совместимы с GramJS-контрактом
  (см. `api.md`), UI не нужно знать какой backend активен:
  - Login: `tg:login-start/-code/-password/-cancel`
  - Account: `tg:get-accounts`, `tg:remove-account`
  - Chats: `tg:get-chats`, `tg:get-cached-chats`, `tg:rescan-unread`, `tg:health-check`
  - Messages: `tg:get-messages/-topic-messages/-send/-edit/-delete/-forward/-mark-read/-mark-topic-read/-get-pinned-message`
  - Media: `tg:download-media`, `tg:download-video`
  - Forum: `tg:get-forum-topics`
- **Event bridge** — manager events → renderer:
  - `message:new` → `tg:new-message`
  - `message:edited` → `tg:message-edited`
  - `message:deleted` → `tg:message-deleted`
  - `chat:unread-sync` → `tg:chat-unread-sync`
  - `account:auth-state` → `tg:login-step` (через `stateToLoginStep` маппер
    TDLib auth state → GramJS-style `{ step: 'phone'|'code'|'password'|'success' }`)
  - `account:error` → `tg:account-update { status: 'error' }`
  - `account:connection` → `tg:account-connection`
  - `user:status` → `tg:user-status`
- **`sendToRenderer`** — функция передаётся через DI (в production:
  `(ch, p) => mainWindow.webContents.send(ch, p)`; в тестах: `vi.fn()`).
- **`unregister`** — возвращаемая функция снимает все handlers и
  manager event listeners (для graceful shutdown + тестов).
- **Защита**: каждый handler обёрнут в try/catch — exception → `{ ok: false, error }`,
  не разрушает event loop.

### Tests
- **`src/__tests__/tdlibIpcHandlers.vitest.js`** (308 строк, 23 теста):
  - Validation: 3 (без ipcMain.handle, без backend, без sendToRenderer)
  - Registration: 2 (все 22 канала, unregister снимает все)
  - Messages routing: 6 (get/send/markRead/delete/edit/exception → ok:false)
  - Chats routing: 3
  - Accounts: 3 (list, connected status, remove)
  - Event bridge: 6 (message:new → tg:new-message, unread-sync, login-step,
    auth ready, account error, unregister снимает listeners)

### Прогресс по плану миграции
- Этапы 0, 1, 2.1-2.6, 3.1 ✅
- **Этап 3.2 (TDLib IPC handlers) ✅** — текущий коммит
- Этап 3.3 (интеграция в main.js startup + USE_TDLIB_BACKEND условный выбор) — следующий
- Этап 4 (финализация, удаление GramJS) — после 3.3

---

## 2026-05-14 — TDLib Stage 4 / Этап 3.1: TDLib runtime singleton

### Added
- **`main/native/backends/tdlibRuntime.js`** (170 строк):
  - `initTdlibRuntime({ userDataDir, tdl?, prebuiltTdlib?, verbosityLevel })`
    — singleton инициализация TDLib runtime для процесса. Идемпотентна
    (повторный вызов вернёт существующий manager).
  - Внутри: `tdl.configure({ tdjson: prebuiltTdlib.getTdjson() })` +
    создание `TdlibClientManager` с реальной `clientFactory` через
    `tdl.createClient(params)`.
  - Сессии хранятся в `${userDataDir}/tdlib-sessions/${accountId}/`,
    подпапка `files/` для медиа.
  - `getTdlibManager()` — возвращает текущий manager или null.
  - `getTdlibRuntimeState()` — { configured, tdjsonPath, userDataDir, sessionsDir }
  - `getSessionDirForAccount(accountId)` — путь к sessions конкретного аккаунта.
  - `closeTdlibRuntime()` — graceful shutdown (закрывает все клиенты,
    сбрасывает singleton). Нужно для тестов (изоляция между сценариями).
  - `autoRestoreSessionsFromDisk({ makeClientParams })` — сканирует
    `tdlib-sessions/`, восстанавливает аккаунты как `manager.createAccount`.
    Игнорирует папку `pending/` (временный logged-out) и файлы (не папки).
- **DI через опции:** `tdl` и `prebuilt-tdlib` модули принимаются через
  опции `initTdlibRuntime`. По умолчанию `require('tdl')` / `require('prebuilt-tdlib')`.
  Тесты передают mock'и — без реального TDLib подключения.

### Tests
- **`src/__tests__/tdlibRuntime.vitest.js`** (260 строк, 22 теста):
  - initTdlibRuntime: 7 (validation, configure call, returned manager,
    sessions-папка создаётся, идемпотентность, пустой path, clientFactory дёргает tdl.createClient)
  - getTdlibManager / getTdlibRuntimeState: 2 (null до init, заполнено после)
  - getSessionDirForAccount: 2
  - closeTdlibRuntime: 4 (сброс singleton, закрытие клиентов, идемпотентность)
  - autoRestoreSessionsFromDisk: 6 (восстановление из disk, ignore pending,
    dedup, пустые случаи, файлы пропускаются)
  - Каждый тест в изолированной tmp-папке (`fs.mkdtempSync`) с cleanup в afterEach.

### Прогресс по плану миграции
- Этапы 0, 1, 2.1-2.6 ✅
- **Этап 3.1 (TDLib runtime singleton) ✅** — текущий коммит
- Этап 3.2 (IPC handlers для TDLib — `tg:*` channels через backend) — следующий
- Этап 3.3 (интеграция в main.js startup + USE_TDLIB_BACKEND feature flag) — после 3.2
- Этап 4 (финализация, удаление GramJS) — после 3

---

## 2026-05-14 — TDLib Stage 4 / Этап 2.6: tdlibBackend — подключение всех модулей. **Этап 2 закрыт.**

### Added
- **`main/native/backends/tdlibBackend.js`** переписан (70 → 343 строки) — реальная
  реализация интерфейса `MessengerBackend` через композицию tdlibAuth +
  tdlibMessages + tdlibMedia + tdlibClient. `createTdlibBackend({ manager,
  tdlibParameters, makeClientParams })` — manager как DI (создаётся ОДИН раз на
  процесс выше по стеку, на Этапе 3).
- **Helpers:**
  - `parseChatId('accountId:rawId')` — наш составной id → {accountId, rawId number}
  - `getClientForChat(manager, chatId)` — резолвит client + accountId или возвращает error
  - `makeExtras(manager, accountId)` — callbacks для mapMessage: senderName из
    userCache (для User sender) или chatCache (для Chat sender)
- **Реализованы методы (21/31):**
  - `auth.startLogin/submitCode/submitPassword/cancelLogin/removeAccount` — через
    TdlibAuthFlow с временным `tg_pending_${ts}` accountId (после login переименуется по getMe)
  - `chats.getChats/getCachedChats/rescanUnread/healthCheck` — из manager cache
    (TDLib сам поддерживает list через updateNewChat / updateChatPosition events).
    `healthCheck` — light probe через `getOption('version')`.
  - `messages.get/send/editMessage/deleteMessage/markRead/getPinned` — через tdlibMessages.
    `markRead` использует `viewMessages([maxId])` — TDLib сама отметит всё ниже.
  - `media.download/downloadVideo/getCacheSize/cleanup` — через tdlibMedia.
    `download` сначала делает `getMessage` invoke чтобы достать file_id из raw content.
- **STUB методы (10/31)** — возвращают `{ok: false, error: '... not implemented yet'}`:
  `sendFile`, `forwardMessage`, `messages.getTopic`, `markTopicRead`, `forum.getTopics`,
  `forum.getTopicMessages`, `auth.autoRestoreSessions`. Реализация в Этапе 3 (интеграция).

### Tests
- **`src/__tests__/tdlibBackend.vitest.js`** (27 тестов) — полная интеграция:
  factory validation, basic structure (3), chats (4), messages (10), auth (5),
  media (3), forum stubs (2). Тестируется композиция всех TDLib модулей.

### Прогресс по плану миграции
- **Этап 2 (Реализация TDLib backend) ✅ ПОЛНОСТЬЮ ЗАКРЫТ**
- Этапы 2.1 (mapper) + 2.2 (client manager) + 2.3 (auth) + 2.4 (messages) +
  2.5 (media) + 2.6 (backend integration) = всё ✅
- Этап 3 (feature flag, параллельная работа двух backend'ов) — следующий
- Этап 4 (финализация, удаление 11 файлов GramJS) — после 3

---

## 2026-05-14 — TDLib Stage 4 / Этап 2.5: TDLib media (downloadFile + updateFile)

### Added
- **`main/native/backends/tdlibMedia.js`** (207 строк):
  - `downloadFile({ manager, accountId, fileId, priority, onProgress })` — асинхронная
    загрузка файла. Запускает `downloadFile` invoke с `synchronous: false` + слушает
    `file:update` events для прогресса и завершения. Возвращает Promise<{ ok, path?, file?, error? }>.
    Корректно очищает listener после resolve (без утечек памяти).
  - `cancelDownload({ manager, accountId, fileId })` — `cancelDownloadFile`.
  - `extractMediaFileId(content)` — извлекает fileId из TDLib message content для
    photo (largest size) / video / audio / voice / videoNote / animation / document / sticker.
  - `getCachedFilePath(tdFile)` — синхронная проверка `local.is_downloading_completed`.
  - `getStorageStatistics(client)` / `optimizeStorage(client)` — для UI «очистить кеш».
- **`main/native/backends/tdlibClient.js`** — добавлен case `updateFile` → emit
  `file:update` event с `{ accountId, file }`. Это нужно для tdlibMedia.downloadFile
  чтобы он мог подписываться на manager (не на клиент напрямую — разделение
  ответственности).
- **`src/__tests__/tdlibMedia.vitest.js`** (28 тестов):
  - extractMediaFileId: 7 (все типы медиа + null cases)
  - getCachedFilePath: 3
  - downloadFile main flow: 11 (мгновенно если кешировано, через updateFile,
    onProgress, фильтрация по fileId + accountId, ошибки, validation, priority clamp,
    нет утечек listener)
  - cancelDownload: 2
  - storage: 3
- **`src/__tests__/tdlibClient.vitest.js`** — добавлен +1 тест на `updateFile → file:update`.

### Прогресс по плану миграции
- Этапы 0, 1, 2.1, 2.2, 2.3, 2.4 ✅
- Этап 2.5 (TDLib media) ✅ — текущий коммит
- Этап 2.6 (подключение tdlibBackend.js к реальным реализациям) — следующий
- Этап 3 (feature flag, параллельная работа) — после 2.6
- Этап 4 (финализация, удаление GramJS) — после 3

---

## 2026-05-14 — TDLib Stage 4 / Этап 2.4: TDLib messages API

### Added
- **`main/native/backends/tdlibMessages.js`** (254 строки) — чистые обёртки над
  `client.invoke()` для работы с сообщениями:
  - `getChatHistory(client, chatId, opts)` — `messages.getChatHistory` с поддержкой
    `fromMessageId`/`offset`/`limit`. Возвращает массив `NativeMessage` после
    `mapMessage` + `.reverse()` (UI ждёт сверху→старые, снизу→новые).
    Опционально `extras.getSenderName(senderId)` / `getSenderAvatar(senderId)`
    callbacks для подстановки из user/chat cache.
  - `sendTextMessage(client, chatId, text, opts)` — `sendMessage` с
    `inputMessageText`. Опционально `replyTo` → `inputMessageReplyToMessage`.
  - `editMessageText(client, chatId, messageId, newText)` — `editMessageText`.
  - `deleteMessages(client, chatId, messageIds, forAll)` — `deleteMessages` с
    `revoke`. Поддерживает одиночный id или массив.
  - `viewMessages(client, chatId, messageIds, opts)` — `viewMessages` с
    `force_read=true` по умолчанию (TDLib эквивалент GramJS `markRead`).
  - `getMessage(client, chatId, messageId)` — для reply preview / pinned lookup.
  - `getChatPinnedMessage(client, chatId)` — обрабатывает "Pinned message not found"
    как `ok:true, message:null` (это не ошибка).
  - Все методы: единый `{ ok: boolean, ..., error?: string }` формат ответа,
    `wrapError()` корректно обрабатывает TDLib `{ '@type': 'error', code, message }`.
- **`src/__tests__/tdlibMessages.vitest.js`** (24 теста) — каждый метод проверен:
  параметры invoke, обработка ошибок, edge cases (пустой text, пустой ids).

### Прогресс по плану миграции
- Этапы 0, 1, 2.1, 2.2, 2.3 ✅
- Этап 2.4 (TDLib messages API) ✅ — текущий коммит
- Этап 2.5 (TDLib media: downloadFile + updateFile events) — следующий
- Этап 2.6 (подключение tdlibBackend.js к реальным реализациям) — после 2.5
- Этап 3 (feature flag, параллельная работа) — после 2.6
- Этап 4 (финализация, удаление GramJS) — после 3

---

## 2026-05-14 — TDLib Stage 4 / Этап 2.3: TDLib authorization flow

### Added
- **`main/native/backends/tdlibAuth.js`** (313 строк):
  - `buildTdlibParameters({ apiId, apiHash, databaseDirectory, ... })` — собирает
    корректный объект для `setTdlibParameters` (SQLite база сообщений, файлов,
    chat info, отключены secret chats, ru-локаль по умолчанию).
  - Класс `TdlibAuthFlow` — реализация authorization state machine TDLib:
    `authorizationStateWaitTdlibParameters` (автоматически шлёт параметры),
    `WaitPhoneNumber` → `startLogin()`, `WaitCode` → `submitCode()`,
    `WaitPassword` → `submitPassword()`, `Ready` → success.
  - Внешний API сигнатурно повторяет GramJS `tg:login-start/code/password/cancel`.
  - **Защита от race conditions**: resolvers устанавливаются СИНХРОННО перед
    `client.invoke()`. Иначе TDLib мог успеть прислать следующий state до того
    как наш `await` зарегистрирует обработчик → промис зависал бы навсегда.
  - `cancelLogin()` отменяет pending промисы и шлёт `logOut`.
  - Поддержка failure cases: `authorizationStateClosed`, `WaitEmailAddress`
    (не поддерживается — возвращаем ошибку), invoke-исключения.
  - `dispose()` снимает event listener с manager (чтобы не было утечек).
- **`src/__tests__/tdlibAuth.vitest.js`** (282 строки, 19 тестов):
  - `buildTdlibParameters` — 4 теста (корректные поля, required validation).
  - Полный flow с 2FA (Wait params → Phone → Code → Password → Ready).
  - Flow без 2FA (после code сразу Ready).
  - Input validation (пустые phone/code/password).
  - Ошибки: invoke падает, TDLib closed, Email auth → not supported, cancelLogin.
  - `dispose()` снимает listener.
  - Изоляция между аккаунтами (auth state другого account не меняет наш flow).

### Прогресс по плану миграции
- Этапы 0, 1, 2.1, 2.2 ✅ (`39bdd74`, `445d654`, `e90ee5c`, `3fa1344`)
- Этап 2.3 (TDLib authorization) ✅ — текущий коммит
- Этап 2.4 (TDLib messages: getChatHistory, sendMessage, markRead) — следующий
- Этапы 2.5-2.6 / 3 / 4 — впереди

---

## 2026-05-14 — TDLib Stage 4 / Этап 2.2: TDLib Client Manager

### Added
- **`main/native/backends/tdlibClient.js`** (316 строк) — `TdlibClientManager` класс
  (расширяет `EventEmitter`). Управляет жизненным циклом TDLib-клиентов
  (по одному на аккаунт), маршрутизирует TDLib updates наверх как высокоуровневые
  события (`message:new`, `chat:unread-sync`, `account:auth-state`, `account:error`,
  `user:status`, `message:edited`/`deleted`).
- **User/chat cache** через `updateUser` / `updateNewChat` events. При получении
  `updateNewMessage` mapMessage вызывается с `senderName` из cache (TDLib хранит
  users/chats отдельно от messages, синхронизирует их перед первым сообщением).
- **Хелперы** `userDisplayName(user)` — first_name+last_name → @username fallback,
  `chatDisplayName(chat)` — title.
- **Patch chat в cache** через 9 типов updateChat* events: title, photo, permissions,
  last_message, read_inbox/outbox, notification_settings, marked_as_unread,
  scheduled_messages, unread_mention_count.
- **`src/__tests__/tdlibClient.vitest.js`** (383 строки, 30 тестов) — mock-клиент
  через `node:events.EventEmitter` симулирует TDLib updates. Без реального TDLib
  соединения. Покрытие: create/remove аккаунты, user/chat cache, patch chat,
  updateNewMessage с sender lookup, auth state, errors, getAccountChats.

### Прогресс по плану миграции
- Этап 0 (POC) ✅ — `39bdd74`
- Этап 1 (абстракция) ✅ — `39bdd74` + `445d654`
- Этап 2.1 (TDLib mapper) ✅ — `e90ee5c`
- Этап 2.2 (TDLib client manager) ✅ — текущий коммит
- Этап 2.3 (TDLib authorization flow) — следующий
- Этапы 2.4-2.6 / 3 / 4 — впереди

---

## 2026-05-14 — TDLib Stage 4 / Этап 2.1: TDLib mapper

### Added
- **`main/native/backends/tdlibMapper.js`** (409 строк) — конвертер TDLib JSON-API
  объектов (`@type: 'message'`, `'chat'`, `'textEntity'`) в наш формат NativeMessage / Chat.
  Покрывает: text, photo, video, audio, voice/voicenote, animation/GIF, document,
  sticker, location, contact, poll + 20 типов textEntity + reply + forward
  (user/chat/channel/hidden). Минимальные thumbnails через `minithumbnail.data`.
- **`src/__tests__/tdlibMapper.vitest.js`** (255 строк, 30 тестов) — базовые сценарии:
  entities, текст, sender, mapChat, messagePreview.
- **`src/__tests__/tdlibMapperMedia.vitest.js`** (260 строк, 21 тест) — медиа-типы
  и сложные сценарии: альбомы, reply, forward.

### Changed
- **`tdlib-migration-plan.md`** — статусы этапов 0/1/2.1 помечены как ✅ завершённые.

### Прогресс по плану миграции
- Этап 0 (POC) ✅ — коммит `39bdd74`
- Этап 1 (абстракция) ✅ — коммиты `39bdd74` + `445d654`
- Этап 2.1 (TDLib mapper) ✅ — текущий коммит
- Этап 2.2 (TDLib client manager) — следующий
- Этапы 2.3-2.6 / 3 / 4 — впереди

---

## 2026-05-14 — План миграции backend с GramJS на TDLib

### Added
- **`tdlib-migration-plan.md`** — детальный план миграции backend Telegram с GramJS на официальную TDLib (через `tdl` + `prebuilt-tdlib`). 5 этапов: проверка возможности, абстракция `messengerBackend`, реализация TDLib backend, параллельная работа двух backend'ов с feature flag, финализация и удаление GramJS. ~5 недель calendar-time.
- **Мотивация миграции**: TDLib даёт встроенно gap detection, `updates.getDifference`, локальную SQLite-базу, приоритет активного чата, параллельные media DC. Всё что мы пытаемся написать вручную поверх GramJS — уже сделано в официальной библиотеке Telegram.

### Changed
- **Memory Bank map** — `.memory-bank/README.md` и `CLAUDE.md` теперь указывают на план миграции.
- **Phase 2 виртуализации**: визуальная проверка 12 пунктов чек-листа отложена пока миграция в работе (по просьбе пользователя 14 мая 2026).

---

## 2026-05-14 — Phase 2 виртуализации: чек-лист визуальной проверки

### Added
- **`phase-2-visual-test.md`** — живой чек-лист из 12 пунктов для визуальной проверки Phase 2 виртуализации (v0.89.0). 3 группы: открытие чатов, скролл и подгрузка, действия с сообщениями. Каждый пункт со статусом ⏳/✅/❌ и журналом найденных проблем. После закрытия всех 12 пунктов файл переедет в архив.

### Changed
- **Memory Bank map** — `.memory-bank/README.md` и `CLAUDE.md` теперь указывают на чек-лист визуальной проверки.

---

## 2026-05-12 — Telegram forum topics investigation

### Added
- **`group-topic-investigation.md`** — отдельный документ расследования проблемы: в native CenterChats Telegram forum-группа открывается как один плоский чат, нет меню тем, поэтому непонятно из какого topic/thread загружены сообщения.

### Changed
- **Memory Bank map** — `.memory-bank/README.md` и `CLAUDE.md` теперь указывают на документ расследования Telegram forum/group topics.
- **Native/API docs** — `native-mode-plan.md` и `api.md` помечают forum topics как отдельную не реализованную часть Telegram API, которую нельзя путать с обычным `tg:get-messages`.

---

## 2026-05-12 — archive connection-health plan

### Changed
- **`archive/2026-05-connection-health-plan.md`** — завершённый план и итог реализации единого статуса качества подключения перенесён из корня `.memory-bank/` в архив после ручной проверки пользователем.
- **Memory Bank map** — `.memory-bank/README.md`, `CLAUDE.md`, `features.md` и `archive/README.md` теперь указывают на архивный путь.

---

## 2026-05-08 — v0.87.136

### Added
- **`archive/2026-05-connection-health-plan.md`** — план и итог реализации единого статуса качества подключения. Изначально создан как `connection-health-plan.md`, 12 мая 2026 перенесён в архив после ручной проверки.

### Changed
- **Memory Bank map** — `.memory-bank/README.md` и `CLAUDE.md` теперь ссылаются на документ статусов подключения.
- **UI docs** — `ui-components.md` описывает `connectionHealth` вместо старого UI-смысла `monitorStatus`.
- **Mistakes docs** — ловушки 54/55 помечены как исторические для UI: monitor/preload остаётся внутренним механизмом, но точка показывает качество подключения.
- **Native/API docs** — зафиксировано, что нижний блок `Подключения` использует per-account замеры `tg:get-chats` / `tg:rescan-unread`, а `Not connected` отображается как `error`.
- **WebView docs** — зафиксировано, что последнее время ответа берётся из лёгкого `network-fetch` probe внутри WebView, а не из времени загрузки страницы и не из локального DOM-only `executeJavaScript`; после самопроверки probe усилен цепочкой `current-page → favicon → origin-root`.

## 2026-05-07 — v0.87.135

### Added
- **Windows installer** — `npm run dist:win` builds x64 NSIS installer into root `dist/`.
- **Clean output** — after packaging only `ЦентрЧатов-Setup-<version>-x64.exe` remains in `dist/`.

### Packaging
- Uses `electron-builder`, `out/**`, `package.json`, `extraMetadata.main=out/main/main.js`, local `electronDist=node_modules/electron/dist`, `signAndEditExecutable=false` for unsigned local installer.

## 2026-05-07 — v0.87.134

### Added
- **`start:prodlike`** — отдельный production-like запуск для сравнения startup через готовый build против Vite dev server.
- **`scripts/prodlike.cjs`** — удаляет inherited `ELECTRON_RUN_AS_NODE`, делает `npm run build`, затем запускает `electron-vite preview`.

### Not Changed
- **Обычный запуск** — `npm run dev/start` остался через Vite и не менялся.
- **Runtime data** — Telegram sessions/accounts, WebView partitions и VK/MAX/WhatsApp/Telegram runtime не менялись.

## 2026-05-07 — v0.87.133

### Changed
- **A2.1 startup graph** — rarely used manual `tabContextMenuDiag` is disabled and no longer imported by `useTabContextMenu`.

### Not Changed
- **Runtime behavior** — Telegram sessions/accounts, `tg:get-accounts snapshot`, WebView partitions and normal VK/MAX/WhatsApp/Telegram tab runtime were not changed.

## 2026-05-07 — v0.87.132

### Changed
- **Renderer startup A1** — `NativeApp` removed from `App.jsx` static import graph and loaded through controlled `React.lazy`.

### Added
- **Startup marks** — `module:NativeApp lazy import requested/resolved` for live timing checks.

### Not Changed
- **Runtime behavior** — Telegram sessions/API/accounts, `tg:get-accounts snapshot`, native store, WebView partitions and VK/MAX/WhatsApp/Telegram WebView tabs were not changed.

## 2026-05-07 — v0.87.131

### Changed
- **Renderer startup** — `src/main.jsx` now starts `react`, `react-dom/client`, `index.css` and `App` imports in parallel via `Promise.all`.

### Not Changed
- **Telegram/runtime behavior** — Telegram sessions, API, accounts, native store and UI contracts were not changed.

## 2026-05-07 — v0.87.130

### Added
- **Full startup diagnostics** — main window logs real Chromium/Vite request summaries, pending requests and slow requests.
- **Renderer startup diagnostics** — resource timing summaries, DOM/window lifecycle, long tasks, React root/render marks and `App`/`NativeApp` mount marks.

### Not Changed
- **Runtime behavior** — Telegram sessions/API/accounts/chats/UI state were not changed.

## 2026-05-07 — v0.87.129

### Changed
- **Startup diagnostics** — предварительные module probes заменены на `session.webRequest` timing реальных Chromium-запросов, чтобы не прогревать Vite перед `loadURL`.

### Not Changed
- **Runtime behavior** — Telegram, аккаунты, чаты, UI state и IPC-контракты не менялись.

## 2026-05-07 — v0.87.128

### Added
- **Dev-server startup probe** — `windowManager` логирует готовность `http://localhost:5173` перед `loadURL`, чтобы отделить задержку Vite от задержки renderer import graph.

### Not Changed
- **Runtime behavior** — Telegram, аккаунты, чаты, UI state и IPC-контракты не менялись.

## 2026-05-06 — v0.87.127

### Fixed
- **Native account restore race** — `NativeApp` возвращён на static import, чтобы native IPC listeners появлялись раньше.
- **Account snapshot** — добавлен `tg:get-accounts`, renderer теперь забирает текущие accounts из main state при mount.

### Changed
- **Startup optimization scope** — lazy оставлен для `AISidebar`, `LogModal`, `ConfirmCloseModal`; `NativeApp` временно исключён из lazy до живой проверки.

## 2026-05-06 — v0.87.126

### Changed
- **Startup import graph** — `AISidebar`, `NativeApp`, `LogModal`, `ConfirmCloseModal` переведены на `React.lazy`.
- **Fallback UI** — добавлены лёгкие fallback-компоненты для native-режима и AI-панели, чтобы первый кадр сохранял layout.
- **Tests** — структурные тесты обновлены под lazy-контракт тяжёлых стартовых панелей.

### Not Changed
- **Telegram/WebView runtime** — Telegram IPC, native store, `createWebviewSetup`, аккаунты и WebView lifecycle не менялись.

## 2026-05-06 — v0.87.125

### Changed
- **Safe startup optimization** — условные модалки и панели (`AddMessengerModal`, `SettingsPanel`, `TemplatesPanel`, `AutoReplyPanel`, `NotifLogModal`) переведены на `React.lazy`.
- **Tests** — структурные тесты обновлены под lazy-import и проверку `Suspense`.

### Not Changed
- **Native Telegram/API** — `NativeApp`, Telegram IPC, WebView lifecycle и аккаунты не тронуты.

## 2026-05-06 — v0.87.124

### Added
- **`[startup-renderer]` diagnostics** — `src/boot-probe.js` и dynamic-import логи в `src/main.jsx` для поиска задержки внутри renderer import graph.

### Changed
- **Renderer entrypoint** — `src/main.jsx` временно использует dynamic imports, чтобы логировать длительность загрузки React, `react-dom`, CSS и `App`.

## 2026-05-06 — v0.87.123

### Added
- **`[startup-window]` diagnostics** — логи вокруг `BrowserWindow.loadURL/loadFile` и событий `did-start-loading`, `ready-to-show`, `dom-ready`, `did-finish-load`, `did-fail-load`.

### Changed
- **Startup investigation** — уточнено, что после `v0.87.122` пауза до `dom-ready` осталась около `45.4s`; причина не сводится только к автоочистке Vite cache.

## 2026-05-06 — v0.87.122

### Changed
- **`scripts/dev.cjs`** — Vite cache `node_modules/.vite` больше не очищается автоматически при каждом `npm run dev`; очистка осталась только по `-- --clear-cache` или `CLEAR_VITE_CACHE=1`.
- **Startup investigation** — зафиксировано, что пауза около `45.6s` была до `dom-ready` renderer, то есть до native Telegram API и WebView lifecycle.

## 2026-05-06 — v0.87.121

### Added
- **WebView startup diagnostics** — добавлены `[startup-webview]` логи для сохранённых WebView-вкладок, Electron `partition`, renderer bootstrap и lifecycle событий `<webview>`.

### Changed
- **`.memory-bank/startup-load-investigation.md`** — расследование разделяет верхние Telegram WebView-вкладки и Telegram API-учетки внутри `ЦентрЧатов`; предыдущий вывод про повторный `loadChats()` ограничен native API-слоем.

## 2026-05-06 — v0.87.120

### Добавлено
- **`.memory-bank/startup-load-investigation.md`** — живой документ расследования долгой загрузки native Telegram.
  В нём фиксируются найденные причины, новые startup-логи, применённые изменения и итог проверки.

### Изменено
- **`.memory-bank/README.md`** — новый файл добавлен в карту Memory Bank.
- **`CLAUDE.md`** — таблица структуры памяти дополнена новым активным файлом.

### Зачем эта версия
Долгий старт native Telegram расследуется по нескольким слоям сразу: renderer, IPC, GramJS, unread-rescan и аватарки.
Отдельный handoff-файл нужен, чтобы не терять факты между сессиями. После закрытия расследования файл будет перенесён в архив.

---

## 2026-04-24 — v0.87.68

### Переписано
- **`src/__tests__/fileSizeLimits.test.cjs`** — автоматическое сканирование.
  Раньше проверял 15 файлов вручную. Теперь обходит все `.jsx/.js/.cjs`
  в `src/` и `main/`, выбирает лимит по пути. Любой новый файл
  автоматически проверяется.
- Добавлено **жёлтое предупреждение при 80%+** лимита — тест не падает,
  но сигнализирует что скоро разбивать.

### Добавлено
- **`.memory-bank/code-limits-status.md`** — снапшот текущих размеров
  файлов, исключений, процентов от лимита. **Конкретные числа живут
  здесь, не в CLAUDE.md** (они стареют). Обновляется при росте файлов.
- **`.memory-bank/handoff-code-limits.md`** — письмо следующему ИИ:
  найдены 2 файла сильно превышающих лимит
  (`telegramHandler.js` 1260 строк, `InboxMode.jsx` 765 строк),
  разбивать их пользователь запретил, план разбиения
  записан для будущей задачи.
- **Массив `KNOWN_EXCEPTIONS`** в тесте — оба файла помечены как
  исключения с повышенным потолком (1300 и 800). Разбиение
  запланировано, но пока не сделано.

### Изменено
- **Поднят лимит для крупных интеграций** `.js` с 300 до 500:
  - `main/handlers/*.js`
  - `main/native/*.js`
  - `src/native/store/*.js`
  - `src/native/utils/*.js`
  - `main/preloads/utils/*.js`
  - `main/preloads/hooks/*.js`
  Причина: инфраструктурные файлы (GramJS handler, unread counters,
  native store) с множеством IPC handlers не укладываются в 300 строк.
- **CLAUDE.md** секция «🚫 Лимиты размера файлов КОДА» переписана:
  таблица по типам файлов вместо списка конкретных, упомянуты
  исключения и файлы близкие к лимиту.
- **CLAUDE.md** в «Узкие / разовые файлы» добавлен `handoff-code-limits.md`.

### Зачем эта версия
Прошлая автоматическая защита была **дырявой**: проверяла только
явно прописанные файлы. Реальные нарушители (telegramHandler 1260,
InboxMode 765) 30+ версий росли незаметно. Новый тест ловит **все**
файлы автоматически. Два больших — зафиксированы как исключения
с планом разбиения (не выполненным в этой версии по просьбе пользователя).

---

## 2026-04-24 — v0.87.63

### Добавлено в CLAUDE.md
- **🚨 Жёсткое правило простого языка** в секции «💬 Формат ответа».
  Пользователь — не программист. Запрещены технические термины
  (refactoring, throttle, race condition, синхронизация, агрегация
  и т.п.) в объяснениях. Разрешены простые слова, аналогии,
  имена файлов/команд.
- **🎨 5 визуальных приёмов** для оформления советов:
  - 📊 Таблица «До/После» — для правок текста/чисел
  - 🟢🟡🔴 Иконки-светофор — вместо слов плюсы/минусы/риски
  - ⭐ Шкала приоритета (1–5 звёзд) — когда советов несколько
  - 🖼 ASCII-мокап — для структуры/архитектуры/UI
  - 🚦 Одна строка-светофор — для мелких советов
- **Таблица соответствия** «какой приём для какого случая».

### Зачем эта версия
- Советы должны бросаться в глаза, а не теряться в тексте.
- Пользователь не программист — технические термины без перевода
  делают советы бесполезными для него.
- Жёсткое правило работает как фильтр при написании. Мягкое
  («старайся проще») игнорируется на сложных темах.

---

## 2026-04-24 — v0.87.62

### Изменено
- **`workflow.md` синхронизирован с CLAUDE.md** — раньше 76 строк старой
  модели (без упоминания `mistakes/`, `archive/`, конфликта память-код,
  опасных команд, pipeline, check-memory). Теперь актуальный документ
  рабочего процесса, согласованный с CLAUDE.md.
- **CLAUDE.md**: удалена устаревшая цифра «~76 КБ» про `features.md`
  (реально уже 87 КБ). Заменена на фразу «большой файл» — не стареет.

### Зачем эта версия
Внешний ИИ-оценщик нашёл 2 реальные нестыковки:
1. `workflow.md` не догнал новую структуру памяти (v0.87.56+). Это
   постоянный файл, читается каждую сессию — устаревший контракт
   конфликтует с свежим CLAUDE.md в голове агента.
2. Размеры файлов стареют. Ссылки на конкретные числа («~76 КБ»)
   быстро перестают соответствовать реальности. Фразы без цифр
   («большой файл») — стабильнее.

### Что НЕ делалось
- **Архивация**: проверены `native-mode-plan.md` и
  `native-scroll-diagnostics-handoff.md` — оба активны (план
  реализуется в текущих v0.87.x, handoff используется для
  расследований). В архив переносить нечего.
- Мелкие «⚪ ИСТОРИЯ» секции в `mistakes/webview-stack-grouping.md`
  (125 КБ) — низкий приоритет, файл читается только по теме.

---

## 2026-04-24 — v0.87.61

### Изменено
- **CLAUDE.md полный рефакторинг** (5 косметических улучшений по результатам
  самооценки):
  - **А. Объединена таблица «Опасные команды»** — раньше дублировалась
    в секциях «Критические запреты» и «Правила проверки». Теперь в
    «Критических запретах» краткий список + ссылка на таблицу в
    «Правилах проверки».
  - **Б. Секции переставлены в логичный порядок**:
    1. Базовые принципы
    2. Первое действие в сессии (что читать)
    3. Правила выполнения (pipeline)
    4. Конфликт память vs код
    5. Критические запреты
    6. Правила проверки
    7. Если что-то не работает
    8. Контекст / модули / архитектура
    9. Лимиты кода
    10. Обновление версии
    11. Memory Bank
    12. Git / формат ответа / финал
  - **В. Явно разделены лимиты** — заголовки:
    - «🚫 Лимиты размера файлов КОДА (src/, main/)»
    - «📏 Лимиты размера файлов ПАМЯТИ (.memory-bank/)»
  - **Г. Новая секция «🆘 Если что-то не работает»** — быстрая справка
    по 8 типовым проблемам (hook падает, версии разошлись, тест
    ругается, контекст переполнен, hook устарел).
  - **Д. Секция «⚙️ Конфигурация .claude/»** — описан `settings.json`
    (project permissions), `skills/`, `commands/`, `memory/`.

### Зачем эта версия
- Устранить внутренние противоречия (дубли «Опасных команд», запреты
  до «Первого действия» в порядке).
- Дать пользователю/агенту быстрый путь к решению типовых проблем
  (раздел «Если что-то не работает»).
- Документировать project-specific permissions `.claude/settings.json`
  — раньше нигде не упоминались.

### Автоматические проверки не изменились
Все 4 защиты (автотесты лимитов и dangling-refs, pre-commit hook,
check-memory, regen-claude-structure) работают как в v0.87.60 —
этот рефакторинг только текстовый.

---

## 2026-04-24 — v0.87.60

### Добавлено
- **Pre-commit hook: проверка Memory Bank** — `scripts/hooks/pre-commit`
  автоматически вызывает `bash scripts/check-memory.sh` если коммит
  трогает `.memory-bank/*`, `CLAUDE.md`, `package.json` или
  `package-lock.json`. Коммит блокируется при проблемах.
- **`scripts/regen-claude-structure.sh`** — автоматическая регенерация
  блока «Структура памяти» в CLAUDE.md между маркерами
  `<!-- STRUCTURE-AUTO-START -->` и `<!-- STRUCTURE-AUTO-END -->`.
  Запуск: `npm run regen-claude-structure`.
- **`src/__tests__/featuresReferences.test.cjs`** — автотест ловит
  dangling-ссылки в последних **10** версиях `features.md`. Старые
  версии не проверяются (ссылки могут быть на удалённые файлы, это
  нормально для истории). Добавлен в общий `npm test`.
- **`.memory-bank/mistakes/webview-stack-grouping.md`** — новый
  тематический файл при втором разбиении `webview-injection.md`.
- **Правило `.claude/skills/`** в CLAUDE.md: при создании новых
  skills/commands обязательно добавлять их в CLAUDE.md с описанием
  «что делает / когда вызывать / аргументы».

### Изменено
- **`mistakes/webview-injection.md`** (130 КБ) → 9 КБ.
  Разбит второй раз: стековая группировка, ghost-items, cleanupStack
  вынесены в `webview-stack-grouping.md` (125 КБ). В `webview-injection.md`
  остались только 5 секций ядра injection (звук, toDataUrl, IPC,
  mark-read throttling, MAX sidebar DOM).
- **CLAUDE.md** — добавлены маркеры `<!-- STRUCTURE-AUTO-START/END -->`
  вокруг блока «Структура памяти» для авто-регенерации.
- **`common-mistakes.md`** индекс дополнен пунктом
  `webview-stack-grouping.md` (2c).

### Зачем эта версия
- Pre-commit hook защищает автоматически: человек не может случайно
  закоммитить рассинхрон версий или битую ссылку в CLAUDE.md.
- Регенерация структуры исключает ручное редактирование таблицы
  «Структура памяти» при добавлении файлов (одно место правды — папка,
  CLAUDE.md подстраивается).
- Dangling-refs тест ловит когда старая запись в features.md указывает
  на удалённый файл — в последних 10 версиях это ошибка.
- Второе разбиение webview-injection.md: 130 КБ было близко к лимиту
  200 КБ, выделена логически отдельная тема (стековая группировка).

---

## 2026-04-24 — v0.87.59

### Добавлено
- **`scripts/check-memory.sh`** — скрипт проверки здоровья Memory Bank:
  размеры файлов, согласованность версий в 4 местах, устаревшие ссылки
  в CLAUDE.md. Запуск: `bash scripts/check-memory.sh`.
- **`src/__tests__/memoryBankSizeLimits.test.cjs`** — автотест лимитов размеров
  файлов памяти. Проверяет 100 КБ для корня, 200 КБ для `mistakes/`,
  10 КБ для индекса `common-mistakes.md`. Падает если кто-то перерос.
  Добавлен в общий `npm test`.
- **`.memory-bank/CHANGELOG.md`** (этот файл) — журнал изменений структуры памяти.
- **`.memory-bank/mistakes/webview-navigation-ui.md`** — новый тематический файл
  при разбиении `webview-injection.md`.

### Изменено
- **`mistakes/webview-injection.md`** (165 КБ) разбит на 2:
  - `webview-injection.md` (~85 КБ) — injection, IPC, DOM, спам, стек-группировка
  - `webview-navigation-ui.md` (~80 КБ) — навигация между чатами, MAX SvelteKit,
    sender-dedup, ribbon CSS/UI в WebView-контексте
- `common-mistakes.md` индекс дополнен новым пунктом `webview-navigation-ui.md`.

### Зачем эта версия
- Ставим автоматическую защиту от разрастания памяти (раньше всё было на ручной
  дисциплине — и `common-mistakes.md` вырос до 294 КБ, `features.md` до 445 КБ)
- `webview-injection.md` был 165 КБ — близко к лимиту 200 КБ, разбит превентивно

---

## 2026-04-24 — v0.87.58

### Изменено
- `features.md` (445 КБ, 323 версии) разбит на:
  - Активный `features.md` (~66 КБ, v0.87.40 → v0.87.58, 18 версий)
  - `archive/features-v0.87-early.md` (~129 КБ, v0.87.0 → v0.87.39, 40 версий)
  - `archive/features-pre-v0.87.md` (~257 КБ, v0.1.0 → v0.86.10, 266 версий)

### Добавлено в CLAUDE.md
- Полный промт правил работы ИИ:
  - 4 принципа Karpathy (Think/Simplicity/Surgical/Goal-driven)
  - Приоритет правил (Безопасность > Просьба > Memory > Скорость)
  - Pipeline (простая/средняя/крупная задача)
  - Секция «Что нельзя параллелить»
- Секция «🔄 Конфликт: память vs код» — при расхождении Memory Bank
  и кода доверять коду
- Правило: «5 советов по улучшению» только для содержательных задач
- `native-mode-plan.md` добавлен в секцию «Узкие/разовые файлы»
  «Первого действия» (раньше был только в «Структуре памяти»)

### Слито
- «Критические правила» (старый CLAUDE.md, 5 пунктов) + «Критические запреты»
  (промт, 7 пунктов) → единая секция из 8 пунктов с причинами

---

## 2026-04-24 — v0.87.56

### Изменено
- `common-mistakes.md` (294 КБ, 2342 строки, 66 секций) разбит на:
  - Индекс `common-mistakes.md` (~5 КБ)
  - `mistakes/native-scroll-unread.md` (~17 КБ)
  - `mistakes/webview-injection.md` (~165 КБ) — *разбит дальше в v0.87.59*
  - `mistakes/notifications-ribbon.md` (~50 КБ)
  - `mistakes/electron-core.md` (~52 КБ)

### Добавлено
- Папка `.memory-bank/archive/` с правилом «агент не читает по умолчанию»
- `archive/README.md` — правила архивации, журнал, соглашение об именах
  `YYYY-MM-<имя>.md`
- `archive/2026-04-common-mistakes-resolved.md` — секции ⚪ ИСТОРИЯ (РЕШЕНО)
  из старого `common-mistakes.md` (groupedUnread, решено в v0.87.51)

### Сжато
- `native-scroll-diagnostics-handoff.md` (36 КБ) → ~13 КБ: хронология
  v0.87.40 → v0.87.54 свёрнута в таблицу

### Добавлено в CLAUDE.md
- Секции «Детализация ловушек — mistakes/» и «Архив — НЕ читать по умолчанию»
- Таблица «Обновление версии» расширена до 4 мест (+ `package-lock.json`)
- Таблицы «Опасные команды» и «Безопасные команды проверки»
- Лимиты размеров файлов памяти: 100 КБ / 200 КБ / 10 КБ (индекс)

### Синхронизировано
- `package-lock.json` отставал на 44 патча (0.87.11 при package.json=0.87.55)
  → подтянут до 0.87.56

---

## Как добавлять записи

При любом изменении структуры Memory Bank (разбиение/объединение файлов,
новые правила, новые автотесты/скрипты) — добавь запись сюда:

```markdown
## YYYY-MM-DD — vX.Y.Z

### Добавлено
- ...

### Изменено
- ...

### Удалено
- ...

### Зачем эта версия
- ...
```

Если изменения тривиальны (опечатка, небольшое уточнение) — запись не нужна.
