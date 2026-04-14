# Ключевые решения (ADR) — ChatCenter

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

**Статус**: 📋 Планируется

**Контекст**: Нужно управлять состоянием: текущий мессенджер, входящие сообщения, варианты ИИ.

**Решение**: Zustand — минималистичный, без бойлерплейта Redux.

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

**Статус**: 🟡 В процессе

**Текущие размеры**: App.jsx 2137, main.js 1719, monitor.preload.js 825

**Что уже вынесено** (v0.82.0-v0.82.4):
- ✅ Notification hooks → `hooks/{type}.hook.js` (monitor.preload.js -220, App.jsx -338)
- ✅ AI handlers → `handlers/aiHandlers.js` (main.js -177)
- ✅ Notification handlers → `handlers/notifHandlers.js` (main.js -66)
- ✅ Unread counters → `utils/unreadCounters.js` (monitor.preload.js -491)

**Что нужно для main.js → <1000** (осталось 1719):
- DockManager класс (~683 строк dock/pin) → `main/models/dockManager.js`
- ВЫСОКИЙ РИСК: circular зависимости, mutable state (pinItems Map), таймеры
- Нужна отдельная сессия с полным контекстом

**Что нужно для App.jsx → <1000** (осталось 2137):
- `handleNewMessage` (160 строк) + console-message handler (354 строк) = 514 строк notification pipeline
- Имеет 20+ зависимостей от App scope (refs, state setters, imported utils)
- Custom hook `useNotificationPipeline` — ПОПЫТКА СДЕЛАНА (v0.82.6), откачена: refs дублируются, ренейминг ломает console-message handler
- Альтернатива: перенос ВСЕХ notification refs в Zustand store (полный рефакторинг state management)
- **ПЛАН (Вариант 4 — AppShell + WebviewManager)**:
  - Граница разреза: строки 611-1453 (~842 строки) → `src/components/WebviewManager.jsx`
  - Включает: account extraction, notification pipeline (handleNewMessage, traceNotif, refs), setWebviewRef, ALL event listeners
  - App.jsx после: ~1295 строк (UI + state + effects + render)
  - WebviewManager: ~900 строк (WebView init + events + notification pipeline)
  - Props: messengers, activeId, settings, webviewRefs, notifReadyRef, + все state setters
  - **setWebviewRef** вызывается как `ref={el => setWebviewRef(el, m.id)}` — передаётся как callback от WebviewManager
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
