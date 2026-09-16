# Архив: старые записи журнала структуры Memory Bank

Вынесено из [`../CHANGELOG.md`](../CHANGELOG.md) 2026-09-16 (v1.2.466): активный файл дорос
до 96 КБ при лимите 100 КБ, и `npm run check-memory` предупреждал «приближается».

Здесь — **история** изменений структуры памяти (разбиения файлов, новые правила, архивации).
Свежие 25 записей остались в активном `CHANGELOG.md`, за ними сюда ходить не надо.

Правила архива — в [`README.md`](README.md).

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
  > ⚠️ УСТАРЕЛО с 2026-09-11 (v1.2.458): `signAndEditExecutable=false` заменено на `signExecutable=false`.
  > Старая настройка отключала не только подпись, но и вшивание значка в `.exe` — ярлык на рабочем столе
  > показывал стандартный значок Electron. Запись выше оставлена как история; действующее решение —
  > ADR-057 в [decisions.md](decisions.md), грабля — в [mistakes/electron-core.md](mistakes/electron-core.md).

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

## 2026-04-24 — v0.87.56 – v0.87.68 — заархивированы

Перенесены в [`archive/changelog-v0.87.56-68.md`](./archive/changelog-v0.87.56-68.md) (релиз v0.89.8, 15 мая 2026 — `CHANGELOG.md` перевалил 100 КБ лимит после серии audit-релизов).

В архиве: file size limits (v0.87.68), архивация common-mistakes, pre-commit hooks, разбиение features.md, прочие Memory Bank infrastructure изменения.

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
