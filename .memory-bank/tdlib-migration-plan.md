# TDLib Migration Plan — переход с GramJS на TDLib

**Версия проекта при старте плана**: v0.89.0
**Дата старта**: 14 мая 2026
**Статус**: 🟢 Этап 0 ✅ + Этап 1 ✅ + Этап 2.1 ✅ (TDLib mapper). В работе: Этап 2.2 (TDLib client manager).

## ✅ Что уже сделано

| Этап | Коммит | Описание |
|---|---|---|
| **0** Smoke POC TDLib | `39bdd74` | npm install tdl + prebuilt-tdlib. POC `tdlibPoc.cjs` — libtdjson.dll 30 МБ загружается, клиент создаётся без подключения. |
| **1** Абстракция messengerBackend | `39bdd74`, `445d654` (CI fix) | Интерфейс из 31 метода через JSDoc + factory `getBackend()` с фичефлагом `USE_TDLIB_BACKEND`. STUB backends для gramjs и tdlib. 66 структурных тестов. |
| **2.1** TDLib mapper | `e90ee5c` | `backends/tdlibMapper.js` 409 строк: `mapMessage`, `mapChat`, `mapEntities`, `messagePreview`. Покрывает TDLib типы: text, photo, video, audio, voice, voicenote, animation, document, sticker, location, contact, poll + 20 типов entities + reply + forward (user/chat/channel/hidden). 51 vitest тест в 2 файлах (basic + media). |
| **2.2** TDLib client manager | `3fa1344` | `backends/tdlibClient.js` 316 строк: `TdlibClientManager` (EventEmitter) с per-account клиентами, user/chat cache через `updateUser`/`updateNewChat`/`updateChatTitle` events, маршрутизация `updateNewMessage` → `mapMessage` с senderName из cache → `message:new` event. 30 vitest тестов с mock-клиентом (EventEmitter), без реального TDLib-соединения. |
| **2.3** TDLib authorization flow | `3a45caa` | `backends/tdlibAuth.js` 313 строк: `buildTdlibParameters()` + `TdlibAuthFlow` (state machine waitTdlibParameters → waitPhoneNumber → waitCode → waitPassword → ready). Внешний API: `startLogin(phone)`, `submitCode(code)`, `submitPassword(password)`, `cancelLogin()` — совместим с GramJS `tg:login-*`. Resolvers ставятся синхронно ПЕРЕД invoke (race-free). 19 vitest тестов с mock TDLib client. |
| **2.4** TDLib messages API | `c02d9d7` | `backends/tdlibMessages.js` 254 строки: чистые обёртки над client.invoke() — `getChatHistory`, `sendTextMessage`, `editMessageText`, `deleteMessages`, `viewMessages` (mark-read), `getMessage`, `getChatPinnedMessage`. Возвращают унифицированный формат `{ ok, ..., error? }`. TDLib messages декодируются через `mapMessage` с поддержкой `extras.getSenderName/getSenderAvatar` callbacks для подстановки из user/chat cache. 24 vitest теста. |
| **2.5** TDLib media | (текущий) | `backends/tdlibMedia.js` 207 строк: `downloadFile({manager, accountId, fileId, priority, onProgress})` — асинхронная загрузка файла с прогрессом через `updateFile` events. `tdlibClient.js` теперь эмитит `file:update` для удобной подписки. Также `cancelDownload`, `extractMediaFileId` (TDLib message content → fileId), `getCachedFilePath`, `getStorageStatistics`, `optimizeStorage`. 28 vitest тестов с реальной эмуляцией updateFile через mock EventEmitter. |

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

## 🚦 Текущий статус

- **Phase 2 виртуализации**: 12 пунктов чек-листа отложены до завершения миграции (пользователь так попросил 14 мая 2026).
- **Этап 0**: ожидание разрешения на `npm install tdl prebuilt-tdlib`.
- **Проблема #2 «1 сообщение в чате»**: будет закрыта переходом на TDLib (gap detection встроено).

---

## ➡️ Следующий шаг

**Пользователь должен запустить**:

```
npm install tdl prebuilt-tdlib
```

После этого ассистент:
1. Создаст `main/native/tdlibPoc.js` — изолированный POC (40-50 строк).
2. Попросит пользователя запустить POC: `node main/native/tdlibPoc.js`.
3. Проверит работоспособность TDLib в Electron.
4. Перейдёт к Этапу 1 (абстракция backend).

**Время на полную миграцию**: ~5 недель calendar-time.

---

## 📚 Источники

- [core.telegram.org/tdlib/getting-started](https://core.telegram.org/tdlib/getting-started) — официальное руководство TDLib
- [github.com/tdlib/td](https://github.com/tdlib/td) — исходники TDLib
- [github.com/Bannerets/tdl](https://github.com/Bannerets/tdl) — Node.js обёртка
- [npmjs.com/package/prebuilt-tdlib](https://www.npmjs.com/package/prebuilt-tdlib) — pre-built бинарники
- [core.telegram.org/api/updates](https://core.telegram.org/api/updates) — про `pts`/`seq`/`getDifference`
- [core.telegram.org/api/files](https://core.telegram.org/api/files) — про разделение media и API
