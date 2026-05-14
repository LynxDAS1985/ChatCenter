# Changelog структуры Memory Bank

Этот файл — журнал изменений **самого Memory Bank** (не проекта). Сюда попадают:
- Переструктуризация файлов (разбиение, объединение, переименование)
- Новые правила работы с памятью
- Изменения правил архивации
- Добавление автотестов/скриптов проверки здоровья

Для changelog **проекта** (версии, фичи, фиксы) — см. [`features.md`](./features.md).
Для архитектурных решений — см. [`decisions.md`](./decisions.md).

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
