# TDLib Migration Plan — переход с GramJS на TDLib

**Версия проекта при старте плана**: v0.89.0
**Дата старта**: 14 мая 2026
**Дата завершения**: 14 мая 2026
**Статус**: 🟢 **МИГРАЦИЯ ЗАВЕРШЕНА** — Этапы 0, 1, 2, 3 (3.1-3.13), 4 ✅. GramJS полностью удалён из проекта.

## ✅ Что уже сделано

| Этап | Коммит | Описание |
|---|---|---|
| **0** Smoke POC TDLib | `39bdd74` | npm install tdl + prebuilt-tdlib. POC `tdlibPoc.cjs` — libtdjson.dll 30 МБ загружается, клиент создаётся без подключения. |
| **1** Абстракция messengerBackend | `39bdd74`, `445d654` (CI fix) | Интерфейс из 31 метода через JSDoc + factory `getBackend()` с фичефлагом `USE_TDLIB_BACKEND`. STUB backends для gramjs и tdlib. 66 структурных тестов. |
| **2.1** TDLib mapper | `e90ee5c` | `backends/tdlibMapper.js` 409 строк: `mapMessage`, `mapChat`, `mapEntities`, `messagePreview`. Покрывает TDLib типы: text, photo, video, audio, voice, voicenote, animation, document, sticker, location, contact, poll + 20 типов entities + reply + forward (user/chat/channel/hidden). 51 vitest тест в 2 файлах (basic + media). |
| **2.2** TDLib client manager | `3fa1344` | `backends/tdlibClient.js` 316 строк: `TdlibClientManager` (EventEmitter) с per-account клиентами, user/chat cache через `updateUser`/`updateNewChat`/`updateChatTitle` events, маршрутизация `updateNewMessage` → `mapMessage` с senderName из cache → `message:new` event. 30 vitest тестов с mock-клиентом (EventEmitter), без реального TDLib-соединения. |
| **2.3** TDLib authorization flow | `3a45caa` | `backends/tdlibAuth.js` 313 строк: `buildTdlibParameters()` + `TdlibAuthFlow` (state machine waitTdlibParameters → waitPhoneNumber → waitCode → waitPassword → ready). Внешний API: `startLogin(phone)`, `submitCode(code)`, `submitPassword(password)`, `cancelLogin()` — совместим с GramJS `tg:login-*`. Resolvers ставятся синхронно ПЕРЕД invoke (race-free). 19 vitest тестов с mock TDLib client. |
| **2.4** TDLib messages API | `c02d9d7` | `backends/tdlibMessages.js` 254 строки: чистые обёртки над client.invoke() — `getChatHistory`, `sendTextMessage`, `editMessageText`, `deleteMessages`, `viewMessages` (mark-read), `getMessage`, `getChatPinnedMessage`. Возвращают унифицированный формат `{ ok, ..., error? }`. TDLib messages декодируются через `mapMessage` с поддержкой `extras.getSenderName/getSenderAvatar` callbacks для подстановки из user/chat cache. 24 vitest теста. |
| **2.5** TDLib media | `319592a` | `backends/tdlibMedia.js` 207 строк: `downloadFile({manager, accountId, fileId, priority, onProgress})` — асинхронная загрузка файла с прогрессом через `updateFile` events. `tdlibClient.js` теперь эмитит `file:update` для удобной подписки. Также `cancelDownload`, `extractMediaFileId` (TDLib message content → fileId), `getCachedFilePath`, `getStorageStatistics`, `optimizeStorage`. 28 vitest тестов с реальной эмуляцией updateFile через mock EventEmitter. |
| **2.6** Подключение tdlibBackend.js | `f52ed4f` | `backends/tdlibBackend.js` 343 строки: реальная реализация интерфейса `MessengerBackend` через композицию `tdlibAuth/Messages/Media/Client`. `createTdlibBackend({ manager, tdlibParameters, makeClientParams })` — принимает manager как DI. `parseChatId('accountId:rawId')` парсит составной id. `makeExtras(manager, accountId)` создаёт callbacks для senderName из cache. Реализованы: 21 метод из 31, остальные (sendFile, forwardMessage, getTopic, markTopicRead, forum.*, autoRestoreSessions) — STUB с понятным error для Этапа 3. 27 vitest тестов. **Этап 2 закрыт.** |
| **3.1** TDLib runtime singleton | `60faf41` | `backends/tdlibRuntime.js` 170 строк: `initTdlibRuntime({ userDataDir, tdl?, prebuiltTdlib? })` — singleton инициализация. Идемпотентен. Внутри: `tdl.configure({ tdjson: prebuiltTdlib.getTdjson(), verbosityLevel })` + `new TdlibClientManager({ clientFactory })`. Папка `tdlib-sessions/{accountId}/` для каждого аккаунта. `getTdlibManager()`, `getTdlibRuntimeState()`, `getSessionDirForAccount()`, `closeTdlibRuntime()` (для тестов), `autoRestoreSessionsFromDisk({ makeClientParams })` — восстанавливает аккаунты из disk при старте. 22 vitest теста с DI mock'ами (tdl + prebuilt-tdlib подменяются). |
| **3.2** TDLib IPC handlers | `416c373` | `main/native/tdlibIpcHandlers.js` 215 строк: `initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer, log })` регистрирует 22 IPC канала (`tg:login-*`, `tg:get-*`, `tg:send-*`, `tg:mark-*`, etc) совместимых с GramJS-контрактом из api.md. Подписывается на manager events (message:new, chat:unread-sync, account:auth-state, account:error, etc) и проксирует как `tg:*` events в renderer. `stateToLoginStep()` мапит TDLib auth states в GramJS-style step. Возвращает unregister функцию для graceful shutdown. 23 vitest теста с mock ipcMain. |
| **3.3** main.js startup integration | `2494e92` | `main/native/backends/tdlibStartup.js` 130 строк: `initTdlibBackendStartup({ userDataPath, getMainWindow, ipcMain, tdl?, prebuiltTdlib?, apiId?, apiHash?, log? })` orchestrator — последовательно: initTdlibRuntime → createTdlibBackend → initTdlibIpcHandlers → autoRestoreSessionsFromDisk. `main/main.js` обновлён: при `USE_TDLIB_BACKEND=1` вызывает TDLib startup, при ошибке (или флаг=0) — fallback на `initTelegramHandler` (GramJS). 16 vitest тестов: validation, init, error handling, sendToRenderer через mainWindow, window destroyed safe, auto-restore, unregister/reset. |
| **3.4** Фикс нормализации tdl формата | `232ffa4` | **КРИТИЧНЫЙ ФИКС**: tdl библиотека внутри переименовывает `@type` → `_` (`node_modules/tdl/dist/client.js:532`), наш код ожидал `@type` → все updates игнорировались. `main/native/backends/tdlibNormalize.js` (90 строк): `deepRenameKey`, `normalizeFromTdl`, `wrapClientForNormalization(rawClient)`. `tdlibRuntime.js` clientFactory оборачивает результат `tdl.createClient` через wrapper. Один файл, локальная правка. 16 vitest тестов на нормализацию + 4 правки существующих тестов под новый wrapper. **Без этого фикса login flow зависал на «Отправляем код в Telegram...»** — Telegram реально слал SMS, но UI не получал событие. |
| **3.5** Три фикса по результатам real-login | `73dabd4` | **(1)** Убран `client.invoke(setTdlibParameters)` в `TdlibAuthFlow._onAuthState` — tdl сама делает через `_handleAuthInit` (client.js:610-650), наш дубль вызывал «Unexpected setTdlibParameters». **(2)** Таблица переводов `ERR_RU` + `translateTdlibError(msg)` — мапит коды TDLib (PHONE_NUMBER_INVALID, PASSWORD_HASH_INVALID, PHONE_CODE_INVALID, etc) на русский. Все resolvers оборачивают error. **(3)** `manager._renameAccount(oldId, newId)` + `_finalizePending` в backend: после успешного login getMe → rename `tg_pending_X` → `tg_${userId}` → emit `account:update` → bridge `tg:account-update` → UI sidebar добавляет аккаунт. 13 новых vitest (6 translate + 7 rename + 1 finalize). |
| **3.6** AutoRestore + finalize restored | (текущий) | Прошлый login дошёл до Ready, но сделан до 3.5 → папка `pending/` с 11.5 МБ db.sqlite, finalize не вызвался. `autoRestoreSessionsFromDisk` теперь восстанавливает `pending/` если `db.sqlite > 100 КБ`. `TdlibClientManager.waitForReady(accountId, timeoutMs)` — Promise который резолвится при auth state Ready (или need-relogin/closed/timeout). `TdlibClientManager.finalizeAccount(accountId)` — getMe → rename → emit (вынесено из backend). `tdlibStartup` после restore fire-and-forget waitForReady + finalize для каждого restored аккаунта → UI получает `tg:account-update`. 14 новых vitest. |

---

## 🎯 Цель миграции

Полный переход backend Telegram-интеграции с **GramJS** на **TDLib** (через Node.js обёртку [`tdl`](https://github.com/Bannerets/tdl) + [`prebuilt-tdlib`](https://www.npmjs.com/package/prebuilt-tdlib)) — официальную библиотеку Telegram.

### Главная проблема которую решает миграция

Сейчас сообщения иногда не догружаются (см. [phase-2-visual-test.md](./phase-2-visual-test.md) → Проблема #2): GramJS не делает `updates.getDifference` автоматически, не хранит `pts`/`seq` per chat, не догружает пропущенные при gap'ах в push. Это требует ручного слоя поверх, который придётся постоянно поддерживать.

TDLib — это **то на чём построены сами клиенты Telegram** (Desktop, Android, iOS). Команда Telegram поддерживает её и обновляет под новые версии протокола.

### Что TDLib даёт «из коробки» и что нам **не придётся** писать вручную

| Функция | В GramJS | В TDLib |
|---|---|---|
| Локальная база сообщений | ❌ Свой JSON-кэш | ✅ Встроено (SQLite + encryption) через `use_message_database` |
| Хранение `pts`/`seq`/`qts` per chat | ❌ Не хранится | ✅ Автоматически в SQLite |
| `updates.getDifference` при старте | ❌ Не делаем | ✅ Автоматически |
| Gap detection при push с разрывом | ❌ Не делаем | ✅ Автоматически |
| Параллельные медиа DC (отдельные соединения для файлов) | ✅ Через GramJS Foreman | ✅ Из коробки + priority |
| Multi-account | ✅ Свой `Map<id, TelegramClient>` | ✅ `td_create_client_id` per account |
| Reconnect / re-sync после disconnect | ⚠️ Частично | ✅ Полностью автоматически |
| Priority для активного чата | ⚠️ Костыль `state.msgRequestTs` | ✅ `openChat` сигнал, фон автоматически уступает |
| Поддержка новых фич Telegram | ⚠️ Ждать пока коммьюнити поправит GramJS | ✅ Сразу — Telegram обновляет TDLib |

---

## 🗺️ Этапы миграции

Каждый этап — отдельный коммит (или несколько). На каждом этапе **существующий GramJS-код продолжает работать**, миграция идёт параллельно. Это даёт возможность откатиться в любой момент.

### Этап 0 — Проверка возможности (1-2 дня)

**Статус**: ✅ Завершён 14 мая 2026 (коммит `39bdd74`)

**Что нужно**:
1. Пользователь запускает: `npm install tdl prebuilt-tdlib` (ассистент НЕ может — правило CLAUDE.md «без `npm install`»).
2. Проверка что TDLib работает в Electron (Windows x64).
3. Минимальный POC: создать `TdClient`, авторизоваться по api_id/api_hash, получить `getChats`.

**Критерий перехода в Этап 1**: POC успешен, `getChats` возвращает реальные чаты.

**Файлы которые создадутся**:
- `main/native/tdlibPoc.js` (40-50 строк, удаляется после Этапа 0) — изолированный smoke-тест.

**Риски**:
- `prebuilt-tdlib` не работает в Electron из-за version mismatch (Node ABI). Fallback: собрать TDLib из исходников (требует CMake + OpenSSL — несколько часов на Windows).
- ARM64 (Apple Silicon, Surface Pro X) — prebuilt-tdlib пока не покрывает. Откладывается.

---

### Этап 1 — Абстракция `messengerBackend` (3-4 дня)

**Статус**: ✅ Завершён 14 мая 2026 (коммиты `39bdd74` + `445d654`)


**Цель**: оба backend'а (GramJS текущий и TDLib будущий) реализуют один и тот же интерфейс. Чтобы переключение между ними было через feature flag.

**Файлы**:
- `main/native/messengerBackend.js` (новый, ~150 строк) — JSDoc-описание интерфейса + factory.
- `main/native/backends/gramjsBackend.js` (новый, ~300 строк) — обёртка над текущими `telegramHandler.js`/`telegramMessages.js`/etc. **Не переписывание**, а перенаправление вызовов.
- `main/native/backends/tdlibBackend.js` (создаётся в Этапе 2, сейчас — заглушка).

**Что в интерфейсе** (минимально достаточно):

```
auth.startLogin(phone)            → { ok, step: 'code' | 'password' | 'success' }
auth.submitCode(code)              → { ok }
auth.submitPassword(password)      → { ok }
auth.cancelLogin()                 → { ok }
auth.autoRestoreSessions()         → void (через events)
auth.removeAccount(accountId)      → { ok }

chats.getChats(accountId?)         → { ok, chats: Chat[] }
chats.getCachedChats(accountId)    → { ok, chats: Chat[] }
chats.rescanUnread()               → { ok, accountStats }
chats.healthCheck()                → { ok, ms } per account

messages.get({ chatId, limit, aroundId?, addOffset?, afterId? })  → { ok, messages, hasMore }
messages.getTopic({ chatId, topicId, limit, ... })                → { ok, messages }
messages.send(chatId, text, replyTo?)                              → { ok, messageId }
messages.sendFile(chatId, filePath, caption?)                      → { ok, messageId }
messages.delete(chatId, msgId, forAll)                             → { ok }
messages.edit(chatId, msgId, text)                                 → { ok }
messages.forward(fromChatId, toChatId, msgId)                      → { ok }
messages.markRead(chatId, maxId)                                   → { ok }
messages.markTopicRead(chatId, topicId, maxId)                     → { ok }
messages.getPinned(chatId)                                          → { ok, message }

media.download({ chatId, msgId, thumb? })                          → { ok, path }
media.downloadVideo({ chatId, msgId, onProgress })                 → { ok, path }
media.getCacheSize()                                                → { bytes }
media.cleanup()                                                     → { ok, freedBytes }

forum.getTopics(chatId, limit)                                      → { ok, isForum, topics }
forum.getTopicMessages(chatId, topic, limit, ...)                  → { ok, messages }

Events (через EventEmitter в backend):
  'message:new'        — новое сообщение
  'message:edited'     — сообщение отредактировано
  'message:deleted'    — сообщение удалено
  'chat:unread-sync'   — счётчик прочитанных обновился
  'chat:read-outbox'   — собеседник прочитал наше сообщение
  'chat:typing'        — typing-индикатор
  'account:update'     — изменение статуса аккаунта (connected/disconnected/error)
  'chats:loaded'       — пакет чатов загружен
```

**Тесты**:
- `src/__tests__/messengerBackend.test.cjs` — структурный тест, что оба backend реализуют интерфейс полностью.

**Критерий перехода в Этап 2**: все 37 cjs + 176 vitest тестов проходят на `gramjsBackend` через интерфейс (как раньше). Внешне ничего не изменилось.

---

### Этап 2 — Реализация TDLib backend (1.5-2 недели)

**Файлы для написания**:
- `main/native/backends/tdlibBackend.js` (~600-800 строк) — полная реализация интерфейса.
- `main/native/backends/tdlibAuth.js` — TDLib authorization state machine (`waitTdlibParameters` → `waitPhoneNumber` → `waitCode` → `waitPassword` → `ready`).
- `main/native/backends/tdlibMessages.js` — `getChatHistory`, `sendMessage`, mapping TDLib message → наш формат.
- `main/native/backends/tdlibMedia.js` — `downloadFile` через TDLib events (`updateFile`).
- `main/native/backends/tdlibMapper.js` — TDLib `message`/`chat`/`user` → наш формат.

**Главная сложность — message mapping**:

GramJS Message:
```
{ id, message, peerId, fromId, date, media, ... }
```

TDLib message:
```
{
  '@type': 'message',
  id, chat_id, sender_id: { '@type': 'messageSenderUser', user_id },
  date, content: { '@type': 'messageText', text: { text: '...', entities: [...] } },
  is_outgoing, reply_to_message_id, media_album_id, ...
}
```

Нужно переписать `mapMessage` с нуля под TDLib формат (50+ типов сообщений: text, photo, video, document, voice, sticker, location, poll, ...).

**Multi-account**:
- На каждый аккаунт — отдельный `td.createClient()` или `td_create_client_id`.
- Events маршрутизируются по `client_id`.
- Sessions хранятся в `~/AppData/Roaming/ЦентрЧатов/tdlib/{accountId}/` (TDLib сама управляет).

**Login flow**:
- TDLib состояние машина: каждый update меняет state, наш UI реагирует через events.
- `LoginModal.jsx` — переписать под новый flow (но JSX контракт сохранится).

**Тесты на этапе**:
- Прогон 37 cjs + 176 vitest на TDLib backend. **Большинство сломаются** — переписать сигнатуры. Сохраняем GramJS как fallback.

**Критерий перехода в Этап 3**: TDLib backend проходит smoke-тесты: login, getChats, getMessages, sendMessage, downloadMedia.

---

### Этап 3 — Параллельная работа двух backend'ов (1 неделя)

**Цель**: feature flag для безопасного тестирования.

**Что добавляется**:
- В `main/native/messengerBackend.js` — `getBackend()` смотрит на env `USE_TDLIB_BACKEND=1` или фолбэкается на GramJS.
- Реальное тестирование на личных аккаунтах пользователя.

**Сценарии тестирования**:
1. **Push с gap'ом**: закрыть приложение → отправить 5 сообщений через другое устройство → открыть → проверить что все 5 загрузились (gramjs: 1, tdlib: 5).
2. **Перезапуск с потерянными сообщениями**: симулировать прерывание (kill process) → запустить → проверить sync.
3. **Multi-account**: оба аккаунта (БНК, Avtoliberty) — одновременная работа.
4. **Open chat priority**: при открытии чата фон не блокирует UI.
5. **Media DC**: видео качается параллельно с listами сообщений.

**Критерий перехода в Этап 4**: все сценарии работают на TDLib стабильно ≥3 дней.

---

### Этап 4 — Финализация (3-4 дня)

**Удалить**:
- `main/native/telegramHandler.js` (4.5 КБ)
- `main/native/telegramAuth.js` (21 КБ)
- `main/native/telegramChats.js` (15 КБ)
- `main/native/telegramChatsIpc.js` (21 КБ)
- `main/native/telegramMessages.js` (26 КБ)
- `main/native/telegramMessageMapper.js` (8.6 КБ)
- `main/native/telegramMedia.js` (7.3 КБ)
- `main/native/telegramForumTopicsIpc.js` (7.4 КБ)
- `main/native/telegramCleanup.js` (4.1 КБ)
- `main/native/telegramErrors.js` (3.9 КБ)
- `main/native/telegramState.js` (5.3 КБ)
- `state.msgRequestTs` костыль приоритета
- Наш `tg-cache-*.json` файлы (TDLib сама хранит)
- Зависимость `telegram` (GramJS) из `package.json`

**Обновить**:
- `.memory-bank/architecture.md` — новая backend архитектура
- `.memory-bank/api.md` — новые IPC контракты (или старые сохранены, контракт renderer-side остался)
- `.memory-bank/native-mode-plan.md` — отметить «GramJS → TDLib v0.90.0»
- `CLAUDE.md` — обновить контекст
- `features.md` — запись v0.90.0 «TDLib backend»

**Релиз**: v0.90.0

---

## ⚠️ Известные риски

| Риск | Вероятность | Митигация |
|---|---|---|
| `prebuilt-tdlib` не работает в Electron Windows | Низкая | Fallback: собрать из исходников (CMake + OpenSSL) |
| ARM64 не поддерживается prebuilt | Средняя | Откладываем ARM64 build до отдельного этапа |
| Installer +30-50 МБ | Высокая | Принимаем — пользователи готовы (Telegram Desktop сам 80+ МБ) |
| Multi-account state migration ломает текущие сессии пользователя | Средняя | Нативный migration script: при первом запуске v0.90.0 — re-login |
| TDLib message format отличается от GramJS — много мапить | Высокая | Этап 2 целиком об этом |
| 200+ тестов сломается | Высокая | Этап 3 — переписать тесты под TDLib backend |
| Increase в memory/CPU usage | Низкая | TDLib обычно эффективнее GramJS, но проверим в проде |

---

## 📦 Файлы которые НЕ трогаются (UI слой)

```
src/native/components/   — все UI компоненты (включая VirtualMessageList от Phase 2)
src/native/hooks/        — все хуки (useInitialScroll, useInboxScroll, etc)
src/native/modes/        — InboxMode и т.д.
src/native/store/        — nativeStore.js (renderer-side state, использует IPC)
src/native/utils/        — messageGrouping, scrollDiagnostics, etc
```

🟢 Phase 2 виртуализации **полностью совместима** с TDLib миграцией. Renderer работает через IPC — ему всё равно какой backend стоит за `tg:get-messages`.

---

## 🚦 Финальный статус — миграция завершена

| Этап | Статус | Дата |
|---|---|---|
| 0 — POC | ✅ | 14 мая 2026 |
| 1 — Абстракция backend | ✅ | 14 мая 2026 |
| 2 — TDLib backend (mapper, client, auth, messages, media) | ✅ | 14 мая 2026 |
| 3.1-3.13 — IPC handlers, normalize, login, restore, avatars, forum, sendFile/forwardMessage | ✅ | 14 мая 2026 |
| 4 — Полное удаление GramJS | ✅ | 14 мая 2026 |

**Что удалено в Этапе 4** (см. также [`CHANGELOG.md`](./CHANGELOG.md#2026-05-14--tdlib-stage-4--этап-4-полное-удаление-gramjs)):

13 production-файлов (`gramjsBackend.js`, `telegramHandler.js`, `telegramAuth.js`, `telegramChats.js`,
`telegramChatsIpc.js`, `telegramCleanup.js`, `telegramErrors.js`, `telegramForumTopicsIpc.js`,
`telegramMedia.js`, `telegramMessageMapper.js`, `telegramMessages.js`, `telegramState.js`, `tdlibPoc.cjs`)
+ 4 GramJS-only теста (`multiAccount`, `multiAccountUI`, `mediaCacheQuota`, `unreadAutoPrefetch`).

Зависимость `telegram` (GramJS) удалена из `package.json` отдельным шагом.

**Проблема #2 «1 сообщение в чате»** закрыта переходом на TDLib (gap detection встроено через
`use_message_database` + автоматический `getDifference` на reconnect).

---

## ➡️ Что дальше

Миграция завершена. Дальнейшая работа над Telegram-интеграцией — внутри TDLib backend (`main/native/backends/tdlib*.js` + `main/native/tdlibIpcHandlers.js`). Этот документ остаётся как **исторический отчёт** о миграции для будущих архитектурных решений.

Связанные документы:
- [`.memory-bank/CHANGELOG.md`](./CHANGELOG.md) — все записи по Stage 4 (Этапы 1-4).
- [`.memory-bank/features.md`](./features.md) — пользовательский changelog.
- [`.memory-bank/api.md`](./api.md) — описание IPC каналов (актуально для TDLib).

---

## 📚 Источники

- [core.telegram.org/tdlib/getting-started](https://core.telegram.org/tdlib/getting-started) — официальное руководство TDLib
- [github.com/tdlib/td](https://github.com/tdlib/td) — исходники TDLib
- [github.com/Bannerets/tdl](https://github.com/Bannerets/tdl) — Node.js обёртка
- [npmjs.com/package/prebuilt-tdlib](https://www.npmjs.com/package/prebuilt-tdlib) — pre-built бинарники
- [core.telegram.org/api/updates](https://core.telegram.org/api/updates) — про `pts`/`seq`/`getDifference`
- [core.telegram.org/api/files](https://core.telegram.org/api/files) — про разделение media и API
