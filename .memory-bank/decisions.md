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
