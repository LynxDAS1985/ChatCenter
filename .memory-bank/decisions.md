# Ключевые решения (ADR) — ChatCenter

## ADR — Откат миграции `<webview>` → WebContentsView (20 мая 2026, v0.91.0)

**Статус**: ✅ Принято, откат выполнен

**Контекст**: Electron официально пишет «we recommend to not use the webview tag, consider WebContentsView». Мы попытались мигрировать (16 версий v0.89.41-v0.90.2).

**Что обнаружено**: на Windows 11 + Electron 41 child WebContentsView крашит native main процесс при `addChildView()` + `loadURL`. Подтверждено в Electron GitHub issues:
- [#44934](https://github.com/electron/electron/issues/44934) — App crashes when adding child view to WebContentsView on Windows 11 (closed/not planned)
- [#45367](https://github.com/electron/electron/issues/45367) — addChildView(WebContentsView) не рендерит (closed/not planned)
- [#44897](https://github.com/electron/electron/issues/44897) — preload не загружается в child WebContentsView
- [#47247](https://github.com/electron/electron/issues/47247) — webContents в WebContentsView крашит Electron

**Решение**: **полный откат** к BrowserWindow + `<webview>` — production-tested архитектура работает в проекте с v0.1.0.

**Условия пересмотра**: проверять каждые 6-12 месяцев. Повторная миграция возможна только если:
1. Issue #44934 или #45367 закрыт как «fixed» в Electron release notes
2. Есть rollback план + изолированный production-тест
3. WebContentsView работает на Windows 11 в нашей конфигурации (multi-child views)

**Альтернативы для будущего**:
- Дождаться фикса Electron (не на нашей стороне)
- Полная смена фреймворка (Tauri, Wails) — отдельная задача
- iframe вместо `<webview>` — отвергнут (Telegram/WhatsApp CSP)

**Полный урок и 7 правил для будущих миграций** — в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md) → секция «УРОК v0.89.41-v0.91.0».

---

## ADR — Notification BrowserWindow: итоги серии багов v0.89.15-v0.89.23 (18 мая 2026)

**Статус**: ✅ Принято и реализовано

**Контекст**: за 3 дня (15-18 мая) серия пользовательских жалоб привела к 9 версиям (v0.89.15-v0.89.23) и 4 новым ловушкам (#20-#23) для одного компонента — **notification BrowserWindow** (Messenger Ribbon в `main/notification.*` + `main/handlers/notifHandlers.js` + `main/handlers/notificationManager.js`).

### Какие баги случились и **почему** решили именно так

**1. Ghost hit-test region после `.hide()` на Win11 (v0.89.18, ловушка #20)**

Корневая причина: `transparent: true` + `frame: false` BrowserWindow на Win11 оставляет невидимый hit-test регион после `.hide()` (известная Electron issue #15947).

**Альтернативы** (отклонены):
- ❌ Перейти на non-transparent окно — потеряем кастомный дизайн ribbon
- ❌ Использовать native Notification API целиком — у нас кастомные кнопки «Перейти / Прочитано» / стэкинг / закрепление, нативный API такого не даёт
- ❌ Игнорировать (закрыть глаза) — клики «глотались», UX страдал

**Принятое решение**: helper `safeHideTransparentWindow()` который перед `.hide()` уводит окно за экран (`-30000`) в размер 1×1. Скрытое окно за пределами всех мониторов размером 1px физически не может ловить клики.

**Почему так**: 
- Сохраняет существующий дизайн
- Не требует архитектурного переписывания
- Гарантия на уровне Windows compositor (окно вне всех мониторов)
- 5 точек применения (notif/dock/pin) через единый helper — DRY

---

**2. `setIgnoreMouseEvents(true)` ломал клики (v0.89.22, ловушка #21)**

Корневая причина: в v0.89.18 я добавил `setIgnoreMouseEvents(true)` в helper как «тройную защиту». Но это нарушило **ловушку #27 (v0.71.7)**: ломает `-webkit-app-region: drag` у dock/pin окон. У 5 точек `.show()` не было парного `restoreMouseEvents(false)` → state `true` оставался → клики проходили сквозь видимое окно.

**Альтернативы** (отклонены):
- ❌ Добавить `restoreMouseEvents` во все 5 точек show — fragile, легко забыть в будущем
- ❌ Оставить `setIgnoreMouseEvents` + написать тесты — не закрывает root cause

**Принятое решение**: УДАЛИТЬ `setIgnoreMouseEvents` целиком из helper. Защита от ghost hit-test полностью покрывается через `setBounds(offscreen 1×1) + hide()` — это сам по себе достаточный механизм.

**Почему так**:
- Меньше кода = меньше точек отказа
- Соблюдает ловушку #27 нашего проекта
- Соответствует Electron docs «state persists until explicitly changed» — мы избегаем самого state-management
- Регрессионный тест в pre-commit (`.cjs`) — физически запрещает вернуть `setIgnoreMouseEvents(true)`

---

**3. «Пустая полоса»: slideIn animation + offsetHeight (v0.89.23, ловушка #22)**

Корневая причина: CSS `slideIn` animation 300ms сдвигает element с `translateX(380px)` до `translateX(0)`. `offsetHeight` ignores transform (MDN). Поэтому `calcHeight()` сразу видит финальную height нового element и main process расширяет окно — но element ещё за правым краем визуально → пустая полоса 60-300ms.

**Альтернативы** (отклонены):
- ❌ Убрать slideIn animation целиком — потеря UX-плавности
- ❌ Использовать `getBoundingClientRect()` (учитывает transform) — добавляет ms к перерасчёту, не решает race (element только что добавлен, размер ещё формируется)
- ❌ Hardcode delay 300ms на main — magic number, ломается если CSS animation поменяют
- ❌ Использовать transition height вместо transform translate — более тяжёлая правка, ломает дизайн slideIn

**Принятое решение**: `slideInDone` флаг на element. `calcHeight()` пропускает elements где `slideInDone === 'false'`. После `animationend` event → ставим `'true'` + новый `reportHeight()`. Страховка setTimeout 600ms если `animationend` не сработает.

**Почему так**:
- Использует **event-driven** механизм (animationend) — авторитативное завершение, не угадывание времени
- Страховка через timeout — защита от edge cases (cascade delay, animation overrides)
- Минимальная инвазивность — добавил один dataset attribute + listener, ничего не сломал в существующей логике

---

**4. IPC race `raw=0 items=1` (v0.89.23, ловушка #23)**

Корневая причина: `notif:resize` идёт через async IPC. `reportHeight` использует `setTimeout(fn, 60)` для коалесcинга. Если renderer прислал поздний `resize(0)` от прошлого dismiss ПОСЛЕ того как main process получил новое `notif:show` → main скрывает окно несмотря на наличие items.

**Альтернативы** (отклонены):
- ❌ Включить порядковые номера в IPC сообщения — большая правка, нужны на всех endpoints
- ❌ Убрать setTimeout 60ms — может вызвать множественные resize за короткое время (caterpillar effect при rapid additions)
- ❌ Делать reportHeight synchronously — может вернуть stale layout (нужен flush)

**Принятое решение**: в main process проверять `if (raw=0 && itemsCount > 0) return`. Игнорировать stale `resize(0)` если main УЖЕ знает что есть item. Следующий reportHeight от renderer пришлёт правильное значение.

**Почему так**:
- Использует **авторитативное состояние** main process (`notifItems[]`) — единственная Source of Truth
- Не требует синхронизации между renderer/main — main решает сам по своему state
- Простая проверка, понятная любому коду reader

---

### Общие принципы из всей серии (правила на будущее)

🟢 **Принцип #1**: для CSS-анимируемых свойств — `getComputedStyle()`, не `el.style`. Inline style не отражает CSS keyframes (MDN).

🟢 **Принцип #2**: для определения visual position — `getBoundingClientRect()`, не `offsetHeight`. offsetHeight ignores transform.

🟢 **Принцип #3**: для transparent BrowserWindow на Win11 — `setBounds(offscreen 1×1) + hide()`, БЕЗ `setIgnoreMouseEvents` (ломает app-region drag, ловушка #27).

🟢 **Принцип #4**: при IPC + setTimeout-coalescing — main process не доверяет slепо последнему received значению. Проверять консистентность с авторитативным state.

🟢 **Принцип #5**: при diagnostic logging — читать MDN для каждого свойства которое логируешь. Inline style ≠ computed style ≠ visual state.

### Регрессионная защита (всегда в pre-commit)

`src/__tests__/transparentWindowGuard.test.cjs` падает локально если:
- сырой `notifWin.hide()` без safeHide
- сырой `dockState.win.hide()` без safeHide
- `setIgnoreMouseEvents(true)` вернётся в helper
- safeHide не использует setBounds или offscreen координаты

Это гарантирует что **ловушки #20 и #21 не повторятся** — физически невозможно сделать коммит с регрессией.

### Серия закрыта — что осталось

12 ловушек документировано в [`mistakes/notifications-ribbon.md`](mistakes/notifications-ribbon.md):
- #1-#19: исторические (v0.89.6 → v0.89.18)
- #20: ghost hit-test (v0.89.18)
- #21: setIgnoreMouseEvents ломает клики (v0.89.22)
- #22: пустая полоса от slideIn (v0.89.23)
- #23: IPC race stale resize=0 (v0.89.23)

Diagnostic logging (v0.89.20-21-23) пока **остаётся в коде** — на случай если новый баг проявится. Удалим в отдельном patch'е если 1-2 недели не будет повторений.

**Last verified**: 18 мая 2026, v0.89.23, 608 vitest + 17 cjs + CI ubuntu+windows ✅.

---

## ADR-NEW — `tg-media/` как LRU-кеш под управлением приложения (15 мая 2026, v0.89.17)

**Статус**: ✅ Принято и реализовано

**Контекст**: В v0.89.15 решено НЕ играть медиа из TDLib-папок (нестабильны: `temp/` чистится, `optimizeStorage` удаляет даже completed). Скачанные файлы копируются в `userData/tg-media/<fileId>_<size>.<ext>` через `stabilizeForPlayback()`. Это решило проблему стабильности URL, но создало новую: папка растёт без ограничений (TDLib `optimizeStorage` нашу папку не трогает).

**Решение**: реализовать LRU-кеш для `tg-media/` — точный аналог TDLib `optimizeStorage`:
- **Лимит размера** 1 ГБ
- **TTL** 7 дней
- **Immunity** 5 минут (mtime обновляется при чтении через cc-media handler)
- **wipeAll** для ручной кнопки «Очистить кеш»

**Альтернативы** (отклонены):
- Использовать `readFilePart` TDLib API для streaming — сложно (IPC overhead, backpressure, edge cases). У нас есть локальный диск — копия проще.
- Симлинки `tg-media/file → tdlib-sessions/file` — на Windows требуют админ прав.
- Mirror TDLib cleanup: после `optimizeStorage` сканировать `tg-media/` и удалять файлы, чьи исходники в `tdlib-sessions/` пропали — нужна привязка `tg-media name → tdlib file`. Сложнее чем независимый LRU.
- Префикс `accountId_` в именах для per-account очистки — LRU саморегулируется через TTL, префиксы не нужны (TODO-3 в `code-todo.md`).

**Почему LRU+TTL правильный выбор**:
1. **Стандарт индустрии**: Telegram Desktop, Telegram Web K, WhatsApp, Signal — все используют LRU+TTL
2. **TDLib официально документирует** алгоритм в [optimizeStorage](https://core.telegram.org/tdlib/getting-started#storage-optimization)
3. **Простой и предсказуемый**: пользователь знает что 1 ГБ — лимит, 7 дней — TTL
4. **Безопасный**: immunity 5 минут защищает играющие сейчас файлы

**Реализация**: [`main/native/backends/tgMediaCleanup.js`](tgMediaCleanup.js). 4 точки интеграции: `getCleanupStats`, `media.cleanup`, `tdlibStartup` (фон-чистка при init), `ccMediaProtocol` (touch mtime при read).

**Last verified**: 15 мая 2026, v0.89.17, 20 тестов в `tgMediaCleanup.vitest.js`.

---

## ADR-001 — Electron как платформа (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Нужно приложение для Windows/Mac, которое может отображать веб-версии мессенджеров и читать их DOM.

**Решение**: Electron — единственный вариант, дающий:
- Рендер реальных веб-страниц мессенджеров через WebView/webContents
- Полный доступ к системе (уведомления, трей)
- Доступ к WebContents для инъекции скриптов

**Альтернативы**: Tauri (нет доступа к WebView DOM), NW.js (устарел).

---

## ADR-002 — WebView через `<webview>` тег (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Нужно изолировать каждый мессенджер, хранить его сессию отдельно.

**Решение**: Тег `<webview>` в Electron с уникальным `partition="persist:название"`.

**Причины**:
- Каждый мессенджер — своя изолированная сессия (cookies, localStorage)
- Можно внедрять preload-скрипт для мониторинга
- Пользователь остаётся залогиненным в каждом мессенджере независимо

**Важно**: `<webview>` требует `webviewTag: true` в BrowserWindow webPreferences.

---

## ADR-003 — Чтение сообщений через MutationObserver (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Нужно перехватывать новые входящие сообщения в мессенджерах.

**Решение**: Preload-скрипт в каждом WebView запускает MutationObserver, наблюдает за контейнером сообщений. При появлении нового — передаёт через `ipcRenderer.sendToHost`.

**Альтернативы**:
- Polling через setInterval — дорого, неточно
- Intercepting XHR/WebSocket — сложно, мессенджеры используют шифрование

---

## ADR-004 — ИИ-запросы только в main process (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: API-ключи к ИИ не должны попасть в renderer (доступен через DevTools).

**Решение**: Все запросы к внешним ИИ-API проходят через main process. Renderer только вызывает `window.api.invoke('ai:analyze', message)` и получает готовый ответ.

---

## ADR-005 — electron-store для хранения данных (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Нужно хранить настройки, шаблоны, правила авто-ответа между запусками.

**Решение**: `electron-store` — JSON-файл в userData. Просто, без зависимости от внешней БД.

**Когда пересмотреть**: если данных станет много (>10k шаблонов) — рассмотреть SQLite.

---

## ADR-006 — Zustand для состояния UI (3 марта 2026)

**Статус**: ❌ Отменено (27 апреля 2026, в составе v0.87.87)

**Контекст**: Нужно управлять состоянием: текущий мессенджер, входящие сообщения, варианты ИИ.

**Изначальное решение**: Zustand — минималистичный, без бойлерплейта Redux.

**Почему отменено**: фактически в проекте используется **React hooks + IPC**, а не Zustand. Native-режим (`src/native/store/nativeStore.js`) — кастомный store на React useState + IPC subscriptions, без Zustand-зависимости. См. `native-mode-plan.md` → раздел «Технологический стек»: «Локальный store React hooks + IPC (не Zustand) — Минимум зависимостей, легче на start».

Пакет `zustand` не установлен в `package.json`. Возвращаться к этому решению — не планируется.

---

## ADR-008 — Система лицензий (запланировано)

**Статус**: 📋 Запланировано

**Контекст**: Программа будет продаваться. Нужна защита от несанкционированного использования.

**Решение (предварительное)**:
- Пользователь вводит логин + пароль при первом запуске
- Запрос на сервер лицензий (ctrlcopy.ru или отдельный endpoint)
- Сервер возвращает: `{ valid: true, plan: 'pro', expires: '2026-12-31' }`
- Лицензионный токен кэшируется локально с TTL 24 часа
- При истечении — перепроверка; при отказе сервера — grace period 7 дней

**Что НЕ делать**:
- Не хранить ключ активации в коде (легко извлечь)
- Не делать только офлайн-проверку (легко обойти)
- Не блокировать работу мгновенно при недоступности сервера (плохой UX)

**Этапы реализации**:
1. Экран входа (логин + пароль) при первом запуске
2. IPC `license:check` в main process → fetch к серверу
3. Хранение токена в electron-store (зашифрованный)
4. Проверка при каждом старте + фоновая ре-проверка каждые 12 ч
5. UI: статус лицензии в настройках, дата истечения, кнопка выхода

---

## ADR-007 — Задержка перед авто-ответом (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Мгновенные ответы выглядят как бот, могут вызвать бан аккаунта.

**Решение**: Случайная задержка 2–8 секунд (настраиваемая). Имитация "набора текста" если мессенджер поддерживает.

---

## ADR-009 — Per-messenger notification hooks (26 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Notification hooks (override window.Notification, showNotification, спам-фильтры, enrichment) были общими для всех мессенджеров и ДУБЛИРОВАНЫ в 2 файлах (monitor.preload.js + App.jsx). Изменение hook для MAX ломало Telegram. Диагностика добавлялась не в тот файл.

**Решение**: Каждый мессенджер имеет СВОЙ hook файл: `main/preloads/hooks/{type}.hook.js`
- `telegram.hook.js` — без enrichment (title уже содержит имя), `.chatlist-chat` для аватарки
- `max.hook.js` — enrichNotif (title="Макс"), `wrapper--withActions`, _maxPhantom, _editedMark, sticker extraction
- `whatsapp.hook.js` — без enrichment, `span[title]` для аватарки
- `vk.hook.js` — enrichNotif (title="ВКонтакте"), ConvoListItem

**Загрузка**: monitor.preload.js → `fs.readFileSync` → `<script>` tag. App.jsx → IPC `app:read-hook` → `executeJavaScript` (CSP fallback).

**Альтернативы отвергнутые**:
- Один общий файл (Вариант 3) — изменение MAX ломает Telegram
- Конфиг + движок (Вариант 2) — MAX enrichment слишком отличается от Telegram
- Inline код в preload + дубль в App.jsx (было до v0.82.0) — причина многих багов

---

## ADR-010 — Рефакторинг до <1000 строк: план (26 марта 2026)

**Статус**: ✅ ЗАВЕРШЕНО — переплавлено в новую систему лимитов (27 апреля 2026, v0.87.87)

**Изначальный план (март 2026)**: разбить App.jsx (2137), main.js (1719), monitor.preload.js (825) до <1000 строк через выносы.

**Что в итоге сделано** (v0.82.0 → v0.87.86):

1. **Постепенный вынос** (v0.82.0-v0.82.4): notification hooks, AI handlers, notif handlers, unread counters.

2. **Новая система лимитов** (v0.87.68-v0.87.86): вместо «всем <1000» — **разные лимиты по типу пути**:
   - `.jsx` в `components/` → 700, в `native/` → 600
   - `.js` в `hooks/` → 150, в `utils/` → 300, в крупных интеграциях → 500
   - `main/main.js`, `App.jsx` → 600
   - HTML/CSS → 800, JSON → 500
   - Тесты → 400

3. **План разбиения 7/7** (v0.87.76 → v0.87.86): все рискованные файлы разбиты:
   - `App.jsx` 2137 → **475** строк
   - `main/main.js` 1719 → **484** строки
   - `monitor.preload.js` 825 → **разделён** на utils/* + hooks/*
   - `telegramHandler.js` 1260 → **~80** строк (тонкий роутер)
   - `InboxMode.jsx` 789 → **567** строк
   - `notification.html` 902 → **12** строк (HTML+CSS+JS разделены)
   - `navigateToChat.js` 300 → **22** строки

4. **Защита от регрессии**:
   - `fileSizeLimits.test.cjs` — авто-сканирование всех файлов с правилами по типу
   - Pre-push git hook — блокирует push при упавшем тесте
   - 3 защиты от «тихих дыр»: (A) нет правила, (B) устаревшее исключение, (C) неизвестное расширение

**Текущее состояние** (см. `code-limits-status.md`): 5 low-priority исключений (webviewSetup, messengerConfigs, consoleMessageHandler, dockPinHandlers, notification.js). Все рискованные — без исключений.

**Документация**: правила лимитов теперь в CLAUDE.md → раздел «🚫 Лимиты размера файлов ВСЕХ типов». Снапшот размеров — в `code-limits-status.md`.
  - **ТРЕБУЕТ ОТДЕЛЬНУЮ СЕССИЮ** — 614 строк перемещения + обновление imports + проброска 20+ props

---

## ADR-010 — Preload файлы .cjs (6 апреля 2026)

**Статус**: ✅ Принято

**Контекст**: package.json `"type": "module"` → Node.js считает .js файлы ESM → `require()` в preload не работает → `window.api` не создаётся → ВСЁ IPC сломано.

**Решение**: Все preload файлы переименованы в .cjs. Тест smokeTest проверяет что .js вариантов НЕ существует.

**Ловушка 53**: Electron 41 + Node 22 строго следуют "type":"module".

---

## ADR-011 — Telegram hash навигация с c/u prefix (6 апреля 2026)

**Статус**: ✅ Принято

**Контекст**: "Перейти к чату" не работало для каналов Telegram. DOM-поиск не находит чат если он в другой папке. location.hash без -100 prefix не открывает каналы.

**Решение**: Парсить chatTag prefix: `c` → `-100` + peerId (канал), `u` → peerId (пользователь). Hash навигация как первый метод, DOM-поиск как fallback.

**Ловушка 57**: Telegram Web K требует -100 для каналов в hash.

---

## ADR-012 — Notification hooks: !body.trim() вместо body.length < 2 (6 апреля 2026)

**Статус**: ✅ Принято

**Контекст**: 1-символьные сообщения ("С", "+", "1") блокировались спам-фильтром _isSpam в hooks. Клиент ответил "С" → уведомление не показалось.

**Решение**: В _isSpam() всех 4 hooks: `body.length < 2` → `!body.trim()`. Мессенджер сам фильтрует мусор — если Notification API вызван, это реальное сообщение. enrichNotif (DOM-контекст) не тронут.

**Ловушка 56**: Порог был скопирован из extractMsgText (DOM-сканирование) при создании per-messenger hooks.

---

## ADR-013 — НЕ использовать visibility:hidden для WebView + принудительный resize при активации (6 апреля 2026, дополнено 14 апреля 2026 v0.86.5)

**Статус**: ✅ Принято (расширено)

**Контекст (v0.85.6)**: visibility:hidden было добавлено для экономии GPU. Но Chromium ПОЛНОСТЬЮ останавливает загрузку hidden WebView — страница не рендерится пока не станет visible.

**Решение (v0.85.6)**: Скрытие через zIndex + pointerEvents. Чёрный экран решён через `disable-gpu-compositing` в main.js.

**Ловушка-1**: Вторая вкладка Telegram и все остальные не загружались при старте.

**Дополнение (v0.86.5, Ловушка 64)**: Даже при правильном `zIndex+pointerEvents` у адаптивных SPA (Telegram Web K) возможен **layout lock-in**: при инициализации в неактивной вкладке Telegram фиксирует mobile-layout и column-center = 0×0. После активации resize event не приходит → остаётся пустая чёрная правая колонка.

**Решение (v0.86.5)**: в App.jsx — `useEffect` на `activeId`. При смене активной вкладки принудительно шлём `window.dispatchEvent(new Event('resize'))` в WebView через `executeJavaScript`. Три повтора: 0ms, 150ms, 500ms — чтобы гарантированно поймать момент когда Telegram готов пересчитать layout.

**Ловушка-2**: без resize event кастомные Telegram-вкладки (добавленные пользователем после стандартной) показывали чёрный экран при клике на чат.

**Диагностика оставлена включённой**: `__CC_DIAG__probe[...]` через executeJavaScript (12 полей: doc/url/body/html/tg-selectors/column-center/bubbles/canvas/img/webgl/err). Помогает быстро находить похожие проблемы layout lock-in для других мессенджеров.

---

## ADR-014 — Telegram навигация: .chatlist-chat[data-peer-id] (7 апреля 2026)

**Статус**: ✅ Принято

**Контекст**: "Перейти к чату" в Telegram открывал группу вместо личного чата. `data-peer-id` пользователя присутствует на многих элементах DOM: аватарка в chatlist, аватарка внутри группового чата, профиль, пересланные сообщения.

**Решение**: Искать `.chatlist-chat[data-peer-id="X"]` — только в списке чатов. НЕ использовать `querySelector('[data-peer-id="X"]')` без фильтра.

**Неудачные попытки**:
- `.closest('a').href` — href принадлежал другому чату
- `location.hash = '#peerId'` — Telegram Web K не реагирует на hash
- `closest('[data-peer-id]')` — возвращал тот же неправильный элемент

**Ловушка 58**: `data-peer-id` = user ID, он есть на аватарках участников внутри групповых чатов.

---

## ADR-015 — Лог-файл: путь ЦентрЧатов, не chat-center (7 апреля 2026)

**Статус**: Информация

**Контекст**: app.getPath('userData') = %APPDATA%/ЦентрЧатов/ (кириллица). package.json name = chat-center, но Electron использует productName. Данные мессенджеров (Partitions) в %APPDATA%/chat-center/, а лог — в ЦентрЧатов.

**Важно для AI**: При чтении лога: os.homedir()/AppData/Roaming/ЦентрЧатов/chatcenter.log

---

## ADR-016 — Multi-account нативного Telegram: Map клиентов + единая лента (28 апреля 2026)

**Статус**: 📋 Запланировано (реализация в v0.87.104)

**Контекст**: В v0.87.103 пользователь обнаружил что при добавлении второго Telegram-аккаунта в native режиме первый исчезает. Расследование:

1. `state.client` — singleton (один TelegramClient на процесс)
2. `state.currentAccount` — singleton (один аккаунт)
3. `state.sessionPath` — один файл `tg-session.txt`
4. UI (`nativeStore.js`: `accounts: []`) **уже** поддерживает несколько (массив)
5. План [`native-mode-plan.md`](./native-mode-plan.md) в архитектуре (`accountId` поле, sidebar аккаунтов, SQL `accounts` table) тоже подразумевает multi-account
6. **Но конкретный шаг реализации был упущен** — Шаг 2 описывал MVP с одним файлом сессии

При login второго аккаунта `state.client` пересоздаётся, `tg-session.txt` перезаписывается → первый аккаунт навсегда теряется.

**Решение**:

### State refactor (Map вместо singleton)

```js
// telegramState.js
state.clients = new Map()         // accountId → TelegramClient
state.accounts = new Map()        // accountId → NativeAccount
state.activeAccountId = null      // текущий выбранный — для UI и нового login
state.sessionsDir = null          // папка %APPDATA%/ЦентрЧатов/tg-sessions/
state.chatEntityMap = new Map()   // accountId → Map<chatId, entity> (двухуровневая)
```

### Сессии — отдельный файл на аккаунт

```
%APPDATA%/ЦентрЧатов/
├── tg-sessions/
│   ├── tg_12345.txt    ← сессия аккаунта BНК
│   ├── tg_67890.txt    ← сессия аккаунта Avtoliberty
│   └── tg_24680.txt    ← сессия третьего аккаунта (если будет)
└── tg-avatars/        ← общая (имя файла = userId, уникален между аккаунтами)
```

### Маршрутизация по chatId

`chatId` уже имеет формат `{accountId}:{chatNumericId}` (`mapDialog`, telegramChats.js строка 29). На стороне backend парсим: `accountId = chatId.split(':')[0]` → берём правильный client из Map.

### UI — единая лента (Вариант B)

| Поведение | Описание |
|---|---|
| Список чатов | Все чаты со всех аккаунтов в одном scroll, отсортированы по `lastMessageTs` |
| Цветной бейдж | У каждого чата маленький бейдж с инициалами/цветом аккаунта (BНК / AV) |
| Фильтр сверху | Кнопки «Все / БНК / Avtoliberty» — временно показать только один |
| Sidebar | Слева мини-иконки аккаунтов, клик ставит фильтр (не переключает контекст) |
| Кнопка «+» | Запускает login flow → создаётся НОВЫЙ TelegramClient в Map |
| Отправка | По выбранному chatId определяется accountId → используется правильный клиент |
| Уведомления | Звук + ribbon одинаково на ВСЕ аккаунты с лейблом аккаунта |

### autoRestoreSession → сканирует папку

```js
const files = fs.readdirSync(state.sessionsDir).filter(f => f.endsWith('.txt'))
for (const f of files) {
  const accountId = f.replace('.txt', '')
  await restoreOne(accountId)
}
```

### Миграция старого файла

Старый `tg-session.txt` при первом запуске после v0.87.104 → читаем → `getMe()` → переименовываем в `tg-sessions/{id}.txt` → удаляем старый. Без потери первого аккаунта.

**Ловушки**:

- ❌ **НЕ забыть** `accountId` в `chatId`. Формат `{accountId}:{chatNumericId}` уже используется. При маршрутизации `chatId.split(':')[0]` = accountId.
- ❌ **НЕ держать** `state.client` (singleton) и `state.clients` (Map) одновременно — расхождение приведёт к багам. Заменить ВСЕ обращения.
- ❌ **NewMessage event handler** регистрируется на каждом client отдельно. Если забыть — входящие на втором не приходят.
- ❌ **Cleanup при logout одного** — НЕ должен трогать чужие файлы. `performFullWipe()` перенаправить на per-account scope.
- ❌ **chatEntityMap** теперь двухуровневый: `state.chatEntityMap.get(accountId).get(chatId)`.

**Затрагиваемые файлы** (12 файлов):

`main/native/`: telegramState.js, telegramAuth.js, telegramHandler.js, telegramChats.js, telegramChatsIpc.js, telegramMessages.js, telegramMedia.js, telegramCleanup.js
`src/native/`: store/nativeStore.js, store/nativeStoreIpc.js, components/InboxChatListSidebar.jsx, components/LoginModal.jsx

**Связано**: [native-mode-plan.md](./native-mode-plan.md) Шаг 2.5 (новый), features.md v0.87.104
