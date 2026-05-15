# Архив: features.md записи v0.87.115 — v0.87.136

Заархивировано 15 мая 2026 при релизе v0.89.9 (features.md превысил 100 КБ лимит после серии audit-релизов v0.89.2-v0.89.9 + видео-фиксов).

В архиве: фикс пустой аватарки чата (v0.87.115), unified connection health status (v0.87.136), Windows installer в корневой dist (v0.87.135), startup graph оптимизации (v0.87.130-134), безопасное восстановление native-аккаунтов (v0.87.127), lazy startup панелей (v0.87.126), и другое.

См. историю архивации в [`./README.md`](./README.md).

---

### v0.87.136 — единый статус качества подключения

- Добавлена единая модель `connectionHealth` для статусов подключения: `pending`, `ok`, `slow`, `error`.
- Верхние точки WebView-вкладок больше не показывают старый `monitorStatus`; теперь они показывают качество подключения/доступность страницы.
- Точки на native/API аккаунтах в `ЦентрЧатов` переведены на общий компонент `ConnectionStatusDot`.
- Native/API аккаунты теперь получают реальные статусы из `nativeConnectionHealth`: быстрый ответ → `ok`, долгий ответ → `slow`, `Not connected`/ошибка → `error`.
- Убрана временная заглушка `0 мс` для connected-аккаунтов; сетевое время API берётся из личных замеров `tg:get-chats` / `tg:rescan-unread` по каждому accountId. `tg:get-cached-chats` больше не считается сетевой проверкой, потому что это чтение локального кэша.
- WebView-вкладки больше не показывают время загрузки страницы как "последний ответ": для проверки используется лёгкий сетевой `network-fetch` probe внутри вкладки. Локальный DOM-only probe не используется как итоговое время, потому что он показывал почти одинаковые значения по всем WebView. После самопроверки probe усилен: сначала проверяет текущий URL вкладки, затем fallback `/favicon.ico`, затем `/`.
- Кнопки `Проверить все` и `Обновить проблемные` в экране `Подключения` теперь запускают WebView probe без принудительного reload вкладок и проверку native/API.
- В списке `Подключения` показываются статус, цветное время последнего ответа и время последней проверки.
- Клик по любой точке открывает общий экран `Подключения` со списком WebView-вкладок и native/API аккаунтов.
- `monitor.preload.cjs`, hooks мессенджеров, unread и Notification pipeline не удалялись: они остались внутренним механизмом уведомлений.
- Исправлен ручной кейс проверки Native/API: `Ожидание проверки` больше не показывает старое время, а фоновый `window.focus → rescanUnread` не перезаписывает результат ручной проверки `Подключения`.
- Документировано в архивном [`2026-05-connection-health-plan.md`](./archive/2026-05-connection-health-plan.md), `ui-components.md` и `mistakes/webview-stack-grouping.md`.

---

### v0.87.135 — Windows installer в корневую папку dist

- Добавлен `npm run dist:win`: собирает production build, затем Windows x64 NSIS installer.
- Выходная папка: корневая `dist/`; после сборки скрипт оставляет только `ЦентрЧатов-Setup-<version>-x64.exe`, удаляя временный мусор builder внутри `dist`.
- Добавлен `electron-builder`; упаковка стартует из `out/main/main.js`, включает собранные `out/**`, берёт Electron из локального `node_modules/electron/dist` и отключает `winCodeSign` для локального unsigned installer.
- Зафиксирован итог расследования старта: `npm start` медленнее из-за Vite dev graph, но мессенджеры работают; `npm run start:prodlike` быстро запускает shell. Подозрение на баг VK/MAX в prodlike закрыто как ложная тревога: причина была в слабом интернете. Памятка: [`prodlike-webview-investigation.md`](./prodlike-webview-investigation.md).

---

### v0.87.134 — start:prodlike для проверки dev-server bottleneck

- Добавлен `npm run start:prodlike`: отдельный production-like запуск без изменения обычного `npm run dev/start`.
- `scripts/prodlike.cjs` сначала делает `npm run build`, потом запускает `electron-vite preview`.
- Цель: сравнить готовый `out/renderer/index.html` с текущим `http://localhost:5173`, где логи показывают долгую Vite/dev загрузку `TabBar`, hooks, CSS и `webviewSetup`.
- Не менялись: Telegram sessions/accounts, WebView partitions, VK/MAX/WhatsApp/Telegram runtime и UI.

---

### v0.87.133 — A2.1: manual tab diagnostics disabled from startup graph

- `src/hooks/useTabContextMenu.js`: manual `tabContextMenuDiag` import disabled; it no longer pulls diagnostic scripts into `App.jsx` startup graph.
- `src/components/NotifLogModal.jsx`: DOM/Storage/Account diagnostic tabs hidden while this rarely used tool is disabled.
- Reason: user does not use this manual diagnostics tool now; normal tab work, unread, navigation, WebView runtime and Telegram API accounts do not need it.
- Not changed: Telegram sessions/accounts, `tg:get-accounts snapshot`, WebView partitions, VK/MAX/WhatsApp/Telegram runtime.

### v0.87.132 — Stage A1: NativeApp removed from App.jsx static startup graph

- `src/App.jsx`: `NativeApp` switched from a static import to a controlled `React.lazy` import.
- Native mode is wrapped in its own `Suspense` fallback so the main `App.jsx` shell can finish importing before the native module graph resolves.
- Added startup marks `module:NativeApp lazy import requested/resolved` for the next live log comparison.
- Telegram API/sessions/accounts, `tg:get-accounts snapshot`, native store, WebView partitions and VK/MAX/WhatsApp/Telegram WebView tabs were not changed.
- Tests updated to enforce the lazy contract and diagnostics marks.

### v0.87.131 — Parallel renderer startup imports

- `src/main.jsx`: startup imports switched from sequential awaits to `Promise.all`.
- `react`, `react-dom/client`, `index.css` and `App` now start loading in parallel; render still waits for all four to finish.
- Added startup marks `parallel imports start` and `parallel imports done`.
- Goal: remove artificial dev-startup wait where `/src/App.jsx` started only after `/src/index.css` completed.
- Telegram sessions/API/accounts/native store were not changed.

### v0.87.130 — Full startup diagnostics without behavior changes

- `main/utils/windowManager.js`: `session.webRequest` now logs start/done/failed, slow requests, pending snapshots and summaries at `dom-ready`, `did-finish-load`, `ready-to-show`, 5/10/15/30/45/60/90 sec.
- `src/boot-probe.js`: renderer resource summaries, DOMContentLoaded/window load marks, longtask observer and delayed summaries.
- `src/main.jsx`: marks around root lookup, `createRoot`, `render` and first `requestAnimationFrame`.
- `src/App.jsx` and `src/native/NativeApp.jsx`: first-render/mounted marks with accounts/chats/tabs counts.
- Goal: one restart should show whether the delay is Vite request/pending URL, CSS transform, JS execution, React render or native mount. Telegram sessions/API/UI are unchanged.

### v0.87.129 — Реальные timing-логи Chromium requests без предварительного прогрева

- Предварительные `http.get` module probes перед `loadURL` убраны, чтобы не прогревать Vite и не искажать замер.
- В `main/utils/windowManager.js` добавлен dev-only `webRequest` timing для реальных запросов Chromium к `http://localhost:5173/*`.
- Логируются start/done/failed, URL, status, cache flag и длительность для `/src/*`, `/node_modules/.vite/*`, `/@vite/*`.
- Runtime Telegram, аккаунты, чаты, renderer state и UI не менялись.

### v0.87.128 — Диагностика готовности Vite dev-server перед loadURL

- В `main/utils/windowManager.js` добавлен dev-only probe `http://localhost:5173` перед `BrowserWindow.loadURL`.
- Probe логирует `dev-server probe start/done/failed`, HTTP status, время ответа и timeout `3000ms`.
- При ошибке или timeout обычный `loadURL` всё равно продолжается; Telegram, аккаунты, чаты, renderer state и UI не менялись.
- Добавлен структурный тест, который фиксирует наличие probe, timeout и продолжение `loadURL` через `finally`.

### v0.87.127 — Безопасное восстановление native-аккаунтов после restore race

- Исправлена регрессия `v0.87.126`: `NativeApp` возвращён на статический import, чтобы `useNativeStore` и IPC-подписки появлялись раньше.
- Добавлен IPC snapshot `tg:get-accounts`: renderer при mount забирает текущие `state.accounts` и `activeAccountId` из main process.
- `useNativeStore` после установки listeners запрашивает `tg:get-accounts` и мержит аккаунты в локальный store.
- Это защищает UI от ситуации, когда `autoRestoreSessions` уже отправил `tg:account-update`, а renderer ещё не подписался.
- `AISidebar`, `LogModal`, `ConfirmCloseModal` остаются lazy; `NativeApp` временно не lazy до живой проверки.

### v0.87.126 — Lazy-загрузка тяжёлых стартовых панелей

- После проверки логов `v0.87.125` подтверждено: первый lazy-шаг помог мало, `App imported` всё ещё около `35.9-36.7s`.
- `AISidebar`, `NativeApp`, `LogModal`, `ConfirmCloseModal` переведены на `React.lazy`, чтобы они не входили в стартовый import graph `App.jsx`.
- Для `NativeApp` и `AISidebar` добавлены явные fallback-компоненты, чтобы первый кадр не ломал layout, пока chunk догружается.
- `TabBar`, `createWebviewSetup`, Telegram IPC, native store, аккаунты, WebView lifecycle и загрузка чатов не менялись.
- Обновлены структурные тесты: теперь проверяется lazy-контракт для `AISidebar`, `NativeApp`, `LogModal`, `ConfirmCloseModal`.

### v0.87.125 — Безопасная lazy-загрузка условных панелей

- `AddMessengerModal`, `SettingsPanel`, `TemplatesPanel`, `AutoReplyPanel`, `NotifLogModal` переведены на `React.lazy`.
- `NativeApp`, `AISidebar`, `TabBar`, WebView setup и Telegram/native логика не тронуты.
- Цель: уменьшить стартовый `App` import graph без изменения поведения аккаунтов и основного экрана.
- Обновлены структурные тесты, чтобы проверять lazy-import и `Suspense`.

### v0.87.124 — Диагностика renderer import graph

- Добавлен `src/boot-probe.js`, который логирует достижение первого module script до `src/main.jsx`.
- `src/main.jsx` временно переведён на dynamic imports с `[startup-renderer]` логами: старт module script, импорт React, `react-dom`, CSS, `App`, начало и постановка render.
- Цель: понять, уходит ли пауза `~42s` до запуска `main.jsx` или внутри import graph renderer.

### v0.87.123 — Диагностика окна до renderer `dom-ready`

- По логу `v0.87.122` подтверждено, что `dom-ready` всё ещё около `45.4s`; снятие автоочистки Vite cache само по себе не ускорило старт.
- В `main/utils/windowManager.js` добавлены `[startup-window]` логи: `loadURL/loadFile start`, `did-start-loading`, `ready-to-show`, `dom-ready`, `did-finish-load`, `did-fail-load`, resolve/fail promise.
- Цель: понять, где именно уходит 45 секунд: ожидание dev server, загрузка renderer bundle или Chromium/Electron lifecycle.

### v0.87.122 — Убран принудительный холодный старт Vite в dev-режиме

- `scripts/dev.cjs` больше не удаляет `node_modules/.vite` на каждом запуске.
- Ручная очистка cache сохранена: `npm run dev -- --clear-cache` или `CLEAR_VITE_CACHE=1`.
- По логу `v0.87.121` подтверждено, что пауза `~45.6s` была до `dom-ready` renderer, до native Telegram API и до WebView lifecycle.
- [`startup-load-investigation.md`](./startup-load-investigation.md) обновлён результатами проверки `16:26`.

### v0.87.121 — Разделение WebView Telegram и native API в расследовании старта

- Уточнено, что верхние Telegram-вкладки являются WebView-сессиями с отдельными `partition`, а `ЦентрЧатов` — отдельная native API-вкладка `native_cc`.
- Добавлены `[startup-webview]` логи для списка WebView-вкладок, настройки Electron session и lifecycle событий `<webview>`.
- Обновлён [`startup-load-investigation.md`](./startup-load-investigation.md): вывод про повторный `loadChats()` теперь явно относится только к native API-слою.

### v0.87.120 — Диагностика долгой загрузки native Telegram

**Что сделано:**

**Документ расследования:**
- Новый файл [`startup-load-investigation.md`](./startup-load-investigation.md)
- Назначение: фиксировать найденные причины долгого старта, новые логи, применённые изменения и итог проверки
- После закрытия расследования файл будет перенесён в `.memory-bank/archive/`

**Startup-логи в общий лог приложения:**
- `[startup-native] loadCachedChats...` — renderer запросил кэш чатов
- `[startup-native] loadChats...` — renderer запросил загрузку чатов
- `[startup-tg] autoRestoreSessions...` — восстановление Telegram-сессий
- `[startup-tg] get-chats...` — загрузка чатов по аккаунтам
- `[startup-tg] loadRestPages...` — фоновая дозагрузка страниц
- `[startup-tg] unread-rescan...` — фоновая сверка непрочитанных

**Где смотреть:**
- В приложении открыть лог ChatCenter
- Выбрать фильтр `Native`
- Смотреть строки `[startup-native]` и `[startup-tg]`

**Затронутые файлы:**
- [`main/native/telegramAuth.js`](../main/native/telegramAuth.js)
- [`main/native/telegramChats.js`](../main/native/telegramChats.js)
- [`main/native/telegramChatsIpc.js`](../main/native/telegramChatsIpc.js)
- [`main/main.js`](../main/main.js) — строка версии в startup-логе
- [`src/native/store/nativeStore.js`](../src/native/store/nativeStore.js)
- [`startup-load-investigation.md`](./startup-load-investigation.md)
- [`README.md`](./README.md)
- [`CHANGELOG.md`](./CHANGELOG.md)

**Что НЕ менялось:**
- Поведение загрузки чатов пока не менялось
- `unreadCount` не подменяется локально
- Аватарки и FLOOD_WAIT throttle не упрощались

---

### v0.87.119 — UI сообщений: цвета отправителей + тултип + кнопки над сообщением + пересланные + разбиение маппера

**Что реализовано:**

**Цвета отправителей** (как в Telegram):
- 7 цветов `#E17076, #7BC862, #65AADD, #EE7AAE, #AA77B2, #6EC9CB, #FAA774`
- Один отправитель всегда получает один цвет (детерминировано по `senderId`)
- Используется в: reply-цитата (полоска + имя), fwdFrom-заголовок, тултип цитаты

**Тултип на reply-цитате** (Telegram-style, Вариант 3):
- При наведении на reply-блок — всплывает стеклянная карточка над ним
- Показывает полный текст цитируемого сообщения + имя отправителя
- `pointerEvents: none` — не блокирует клик по самой цитате
- `maxHeight: 180px` — длинные тексты прокручиваются

**Кнопки действий НАД сообщением** (Вариант 2):
- Кнопки вынесены выше пузырька: `position: absolute; bottom: calc(100% + 3px)`
- Стеклянный фон: `rgba(18,18,18,0.92)` + `backdropFilter: blur(8px)`
- Для входящих — справа, для исходящих — слева (не перекрывают имя собеседника)
- Кнопки: ↪ Ответить, ➥ Переслать, 📌 Закрепить, ✏️ Редактировать (только свои), 🗑 Удалить (только свои)

**Красивые пересланные сообщения** (Доп. 2):
- Заголовок вверху пузырька: «↪ Переслано от [цветное имя]»
- Цвет имени — `getSenderColor(fwdFrom.id)` — детерминирован как в Telegram
- `fwdFrom` поле добавлено в `mapMessage` из `m.fwdFrom` GramJS объекта

**Разбиение `telegramMessages.js`** (был 499/500 строк):
- Новый файл [`main/native/telegramMessageMapper.js`](../main/native/telegramMessageMapper.js) (~176 строк)
- Вынесены: `extractStrippedThumb`, `mapEntities`, `mapMessage`, `messagePreview`
- `telegramMessages.js` теперь 343 строки — re-export для обратной совместимости
- Обновлены импорты в `telegramChats.js` и `telegramChatsIpc.js`

**Затронутые файлы:**
- [`main/native/telegramMessageMapper.js`](../main/native/telegramMessageMapper.js) — НОВЫЙ, 176 строк
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — 343/500 строк (было 499!)
- [`main/native/telegramChats.js`](../main/native/telegramChats.js) — обновлён импорт messagePreview
- [`main/native/telegramChatsIpc.js`](../main/native/telegramChatsIpc.js) — обновлён импорт mapMessage
- [`src/native/components/MessageBubble.jsx`](../src/native/components/MessageBubble.jsx) — 291/600 строк

**Как проверить:**
1. Открыть групповой чат — у каждого участника свой постоянный цвет имени
2. Ответить на сообщение → reply-блок с цветной полоской
3. Навести мышку на reply-цитату → всплывает тултип с полным текстом
4. Навести мышку на любое сообщение → кнопки появляются НАД сообщением (не поверх текста)
5. Найти пересланное сообщение → вверху пузырька «↪ Переслано от [имя]»

---

### v0.87.118 — Фикс «1 сообщение в чате» (FLOOD_WAIT от аватарок)

**Что было**: при запуске приложение скачивало аватарки 659 чатов (200мс каждая ≈ 132с). В это время Telegram блокировал другие запросы. Открытие чата попадало под блокировку → `tg:get-messages` возвращал ошибку → в чате оставался старый кэш (1 сообщение).

**Три изменения:**

**Вариант 1 — Пауза аватарок при открытии чата** (`telegramChats.js`, `telegramMessages.js`):  
`tg:get-messages` теперь выставляет `state.msgRequestTs = Date.now()`. `loadAvatarsAsync` проверяет этот штамп перед каждой аватаркой — если прошло меньше 5 секунд, ждёт. Аватарки автоматически уступают место запросу сообщений.

**Решение A — Авторетрай** (`nativeStore.js`):  
Если `tg:get-messages` вернул ошибку — через 3 секунды автоматически повторяет запрос. При успехе приходит `tg:messages` и чат обновляется без участия пользователя. При повторной ошибке — снимает флаг `loadingMessages` чтобы shimmer не висел вечно.

**Решение B+C — Индикатор загрузки** (`InboxChatPanel.jsx`):  
`MessageListOverlay` (синяя полоска + «Обновляю сообщения...») теперь показывается не только при начальном скролле, но и когда идёт загрузка поверх кэша. Пользователь видит 1 старое сообщение + синюю анимацию вверху вместо пустого чата.

**Затронутые файлы:**
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — `state.msgRequestTs` (499/500 строк — файл на пределе, следующее изменение требует разбиения!)
- [`main/native/telegramChats.js`](../main/native/telegramChats.js) — пауза при `msgRequestTs < 5000мс`
- [`src/native/store/nativeStore.js`](../src/native/store/nativeStore.js) — авторетрай через 3с
- [`src/native/components/InboxChatPanel.jsx`](../src/native/components/InboxChatPanel.jsx) — overlay при `loadingMessages`

---

### v0.87.117 — Диагностические логи: «1 сообщение в чате»

Добавлены диагностические логи в `tg:get-messages` для расследования бага «в чате показывается только 1 сообщение вместо 50»:
- Предупреждение `WARN: entity-fallback` когда `chatEntityMap` пуст и GramJS получает числовую строку вместо полноценного entity
- Лог фактического числа сообщений и источника entity (`hasEntity=true/false`)
- Детекция `FLOOD_WAIT` в catch-блоке — основная причина пустого ответа при старте (загрузка 659 аватарок ~132с держит Telegram rate-limit)

**Затронутые файлы:**
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — 496/500 строк (критически близко к лимиту)

---

### v0.87.116 — Время сбоку + аватарки +20%

- Время сообщения перенесено вправо на уровень текста (flex-row). Для фото/видео и пустых сообщений — остаётся снизу.
- Аватарки в списке чатов: 44px → 53px (+20%), шрифт инициалов 16→19px, высота строки 64→74px.
- Аватарки отправителей в сообщениях: 32px → 38px (+20%), шрифт инициалов 12→14px.

**Затронутые файлы:**
- [`src/native/components/MessageBubble.jsx`](../src/native/components/MessageBubble.jsx)
- [`src/native/components/ChatListItem.jsx`](../src/native/components/ChatListItem.jsx)
- [`src/native/components/InboxChatListSidebar.jsx`](../src/native/components/InboxChatListSidebar.jsx)
- [`src/native/styles-messages.css`](../src/native/styles-messages.css)

---

### v0.87.115 — Фикс пустой аватарки чата (показывались blank вместо инициалов)

**Причина**: `loadAvatarsAsync` сохранял 0-байтовые JPEG и слал URL как `chat.avatar` → CSS пытался рендерить пустой файл → белый/пустой круг. Код `!chat.avatar` был `false` → инициалы не рисовались.

**Фикс**:
1. `telegramChats.js` (кэш): если файл существует, но размер 0 байт — удаляем, скачиваем заново
2. `telegramChats.js` (скачивание): `if (!buffer || buffer.length === 0)` — не сохранять и не эмитировать 0-байтовый файл
3. `telegramMessages.js` (`mapMessage`): добавлена проверка размера файла при чтении `senderAvatar` из кэша

**Результат**: при следующем запуске приложения 0-байтовые файлы удалятся, аватарки попытаются скачаться заново. Если фото нет — `chat.avatar` остаётся `null` → отображаются инициалы как в настоящем Telegram.

**Затронутые файлы:**
- [`main/native/telegramChats.js`](../main/native/telegramChats.js)
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js)

---

