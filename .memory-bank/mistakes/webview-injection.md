# Ловушки: WebView injection (ядро)

**Извлечено из** `common-mistakes.md` 24 апреля 2026 (v0.87.56), разделено на части в v0.87.59 и v0.87.60.
**Темы**: injection в WebView, DOM-селекторы (Telegram Web K, MAX sidebar), MutationObserver, спам-фильтры, `executeJavaScript`, `toDataUrl` зависание, двойной звук, mark-read throttling в фоне.
**Связанные файлы**:
- [`webview-navigation-ui.md`](./webview-navigation-ui.md) — навигация между чатами и UI-интеграция
- [`webview-stack-grouping.md`](./webview-stack-grouping.md) — стековая группировка, ghost-items, cleanupStack

---

## 🟡 ВАЖНОЕ: Двойной звук — 4 пути воспроизведения без дедупликации

**Симптом**: При получении сообщения играются два звука с разницей ~1 секунда. Оба от нашей программы (не от мессенджера — его Audio подавлен).

**Причина**: В App.jsx есть **4 независимых места** вызова `playNotificationSound()`:
1. `__CC_NOTIF__` handler (основной, через Notification API перехват)
2. `messenger:badge` IPC (от ChatMonitor badge update)
3. `page-title-updated` event (unread count в заголовке WebView)
4. `unread-count` IPC (от monitor preload)

Когда приходит сообщение, `__CC_NOTIF__` срабатывает первым (синхронно из console-message). Через ~0.5-1сек WebView обновляет title/badge → срабатывает второй path → второй звук.

**ПРАВИЛО**: Все пути воспроизведения звука ДОЛЖНЫ проверять `lastSoundTsRef` — если для этого мессенджера звук уже играл <3сек назад → пропускать.

**Решение (v0.62.5)**: `lastSoundTsRef = useRef({})` — `{[messengerId]: timestamp}`. Все 4 места проверяют `Date.now() - lastSoundTsRef.current[id] > 3000` перед воспроизведением.

---

## 🔴 КРИТИЧЕСКОЕ: toDataUrl зависание в executeJavaScript injection

### ❌ console.log внутри toDataUrl callback → Pipeline пуст, нет звука/ribbon

**Симптом**: Лог WebView показывает "ПОКАЗАНО" (intercepted), но Pipeline в App.jsx пуст. Нет звука, нет ribbon. Пользователь видит сообщение в Логе, но уведомления нет.

**Причина**: В `executeJavaScript` injection (fallback когда CSP блокирует `<script>` tag из preload), `console.log('__CC_NOTIF__'+...)` был завёрнут в `toDataUrl(enriched.icon, callback)`. Функция `toDataUrl` создаёт `new Image()` с `crossOrigin='anonymous'` для конвертации аватарки в data URL. Если загрузка зависала (CORS, timeout, сетевая ошибка) → callback НЕ вызывался → `console.log` НЕ выполнялся → `console-message` event НЕ приходил в App.jsx.

**Почему Лог показывал "ПОКАЗАНО"**: `_logNotif('passed', ...)` вызывался ДО `toDataUrl`, а `console.log` — ВНУТРИ callback. Лог и console.log были разделены асинхронной операцией.

**ПРАВИЛО**: НИКОГДА не оборачивать `console.log('__CC_NOTIF__'+...)` в асинхронные операции (Image loading, fetch, timers). Отправляй СИНХРОННО, как в preload версии.

**Решение (v0.57.0)**: Удалён `toDataUrl`, `console.log` вызывается напрямую с `enriched.icon` (HTTP URL или пустая строка). App.jsx обрабатывает оба формата.

---

## 🔴 КРИТИЧЕСКОЕ: IPC new-message handler БЕЗ спам-фильтра

### ❌ Timestamp "18:22" прошёл через `new-message` IPC → ribbon

**Симптом**: При получении сообщения в MAX показывается ribbon с текстом "18:22" (timestamp), а реальное сообщение ("Ааа") не показывается вообще.

**Причина 1**: IPC `new-message` handler в App.jsx НЕ имел спам-фильтра. `__CC_MSG__` handler имел, `__CC_NOTIF__` handler имел, но IPC `new-message` — нет. Timestamp "18:22" приходил из Path 2 `sendUpdate` → `getLastMessageText('max')` → `[class*="message"]:last-child [class*="text"]` возвращал timestamp.

**Причина 2**: `getLastMessageText` для MAX не фильтровал timestamps. Селектор `[class*="message"]:last-child [class*="text"]` матчит элементы с timestamp'ами.

**Причина 3**: `quickNewMsgCheck` пропускал реальные сообщения в MAX — addedNodes содержали контейнеры с >40 children (SvelteKit рендерит большими блоками).

**Решение (v0.56.1)**:
1. Спам-фильтр в IPC `new-message` handler + per-messenger regex + senderCache fallback
2. Timestamp-фильтр в Path 2 `sendUpdate` и в `getLastMessageText`
3. Deep scan в `quickNewMsgCheck` — для nodes 40-200 children ищет leaf-текстовые элементы
4. `extractMsgText()` — отдельная функция с очисткой embedded timestamps ("Ааа18:22" → "Ааа")

**Ключевой урок**: ВСЕ handler'ы входящих сообщений ДОЛЖНЫ иметь спам-фильтр. Новый handler без фильтра = timestamp/system text пройдёт как сообщение. SvelteKit-мессенджеры (MAX) обновляют DOM большими блоками — нужен deep scan, не только проверка addedNodes напрямую.

---

## 🟡 ВАЖНОЕ: mark-read не работает при свёрнутом окне (Chromium background throttling)

**Симптом**: Нажал "Прочитано" в ribbon при свёрнутом окне — не помечает. Открыл окно — помечает.

**Причина**: Chromium throttles WebView в свёрнутом окне. `executeJavaScript()` выполняется и возвращает `ok=true`, но DOM-клик НЕ обрабатывается мессенджером до восстановления окна.

**ЛОВУШКА**: `document.hidden` в Electron renderer = `false` даже при минимизированном окне! Нельзя использовать `document.hidden` для определения свёрнутого окна.

**ПРАВИЛО**: Проверять `mainWindow.isMinimized()` в main.js (не в renderer). Если свёрнуто → невидимо восстановить (`setOpacity(0)` + `restore()`), выполнить mark-read, через 1.2сек свернуть обратно (`minimize()` + `setOpacity(1)`).

**Решение (v0.62.7)**: main.js `notif:mark-read` handler → `isMinimized()` check → invisible restore/minimize cycle.

---

## 🟡 ВАЖНОЕ: MAX sidebar DOM ≠ Telegram — нет .chatlist-chat, нет .peer-title

**Симптом**: `mark-read` для MAX всегда возвращает `ok=false method=notFound titles=0`. Все 12 CSS-селекторов + TreeWalker не находят чаты в sidebar.

**Причина**: MAX (SvelteKit) использует `<nav class="navigation svelte-xxx">` с 51 child-элементами. Нет `.chatlist-chat`, нет `.peer-title`, нет `[class*="chatlist"]`. Все generic-селекторы от Telegram возвращают 0.

**Почему enrichment работал**: `__CC_NOTIF__` берёт имя из Notification API `data.t` (DOM не нужен). `__CC_MSG__` DOM enrichment использует **topbar** (`.topbar .headerWrapper`), не sidebar.

**ПРАВИЛО**: Для MAX навигация к чату — `[class*="wrapper--withActions"]` (реальный Svelte-класс sidebar, март 2026). Поиск по textContent.indexOf(senderName). **ВАЖНО**: простой `.click()` на wrapper НЕ работает (Svelte event delegation). Нужно: (1) искать `<a>` или `<button>` child внутри wrapper, (2) проверить parent на `<a>`, (3) если нет — `MouseEvent({bubbles:true})`. НЕ использовать `<nav> a[href]`, `.chatlist-chat`, `.peer-title`.

**Решение (v0.62.4)**: Полностью переписан MAX-блок в `buildChatNavigateScript`: nav→a[href] exact/icase/partial → all a[href] → TreeWalker → scroll fallback.

---

