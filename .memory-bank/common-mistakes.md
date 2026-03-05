# Типичные ошибки — ChatCenter

## 🔴 КРИТИЧЕСКОЕ: Подсчёт непрочитанных в Telegram Web K

### ❌ Суммирование бейджей отдельных чатов (querySelectorAll + persistent Map)

**Симптом**: Счётчик показывает 1796 вместо правильных 26. Telegram "Все чаты" пишет 26 — это верно.

**Причина 1 (v0.7–v0.19)**: `querySelectorAll('.badge')` считает только видимые диалоги (~20 шт.) → скачки при скролле (594 → 1435 → 2918).

**Причина 2 (v0.20.0, persistent Map)**: Map суммирует бейджи КАЖДОГО чата (каналы: 9.4K + 3.4K + 2.3K + ...) → выдаёт тысячи. Telegram же считает "Все чаты" = число ЧАТОВ с непрочитанными, а НЕ сумму всех сообщений.

**Решение (v0.22.0)**: НЕ суммировать бейджи чатов. Читать ГОТОВЫЙ счётчик Telegram:
1. `document.title.match(/\((\d+)\)/)` — `(26) Telegram Web`
2. Первый бейдж в folder tab (`.tabs-tab .badge` и др.)
3. **Адаптивный поиск**: `.badge` НЕ внутри `.chatlist-chat` = folder tab badges
4. Fallback: сумма chatlist badges

**Ключевой урок**: Число на folder tab "Все чаты" ≠ сумма бейджей чатов!

### ❌ Жёсткие CSS-селекторы для folder tabs Telegram

**Симптом**: `.tabs-tab` не находит элементы → бейдж = 0.

**Причина**: Telegram Web K имеет разные layout'ы folder tabs (горизонтальный, вертикальный), с разными CSS-классами.

**Решение (v0.22.0)**: Адаптивный поиск с несколькими селекторами + диагностический IPC `monitor-diag` для отладки. При неизвестном layout'е — `.badge` элементы НЕ внутри chatlist = folder badges.

**Решение (v0.23.0)**: `page-title-updated` event на WebView — ловит `(N)` из `document.title` мгновенно, без MutationObserver и без CSS-селекторов.

### ❌ MutationObserver не ловит изменение document.title

**Симптом**: `document.title` содержит `(26) Telegram Web`, но `countUnreadTelegram()` возвращает 0.

**Причина**: MutationObserver наблюдает `document.body`, а `<title>` находится в `<head>`. Изменение title НЕ триггерит observer → `sendUpdate()` не вызывается при обновлении title.

**Решение (v0.23.0)**: `el.addEventListener('page-title-updated', ...)` в renderer — встроенное событие Electron WebView, срабатывает мгновенно при изменении title. Не зависит от MutationObserver.

---

## 🔴 КРИТИЧЕСКОЕ: ELECTRON_RUN_AS_NODE=1

### ❌ Запуск electron-vite напрямую из VS Code / Claude Code терминала

VS Code и Claude Code устанавливают `ELECTRON_RUN_AS_NODE=1` в среду процесса.
При этом `require('electron')` возвращает путь к бинарнику (`"C:\...\electron.exe"`), а не Electron API.

**Симптом**: `TypeError: Cannot read properties of undefined (reading 'handle'/'isPackaged'/etc.)`

**Решение**: запускать через `scripts/dev.js`, который удаляет переменную:
```js
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
spawn('electron-vite', ['dev'], { env, shell: true })
```

**НИКОГДА** не запускать `electron-vite dev` напрямую из этой среды.

---

## WebView

### ❌ accountScript показывает имя открытого чата вместо имени аккаунта ("Автолиберти")

**Симптом**: Под вкладкой Telegram вместо имени пользователя показывается название открытого в данный момент чата (например "Автолиберти!!!!").

**Причина**: В Telegram Web K НЕТ надёжного DOM-элемента с именем СВОЕГО аккаунта в обычном виде (список чатов). Имя пользователя видно только в открытых Настройках/Профиле. Любые селекторы в обычном режиме захватывают имя ОТКРЫТОГО собеседника.

**Решение v0.18**: Удалить accountScript. Но пользователь хочет видеть имя → нужно извлекать по-другому.

**Решение v0.19.0 (НЕ РАБОТАЛО)**: `data-peer-id` из `.sidebar-header` → IndexedDB → имя. ПРОБЛЕМА: в обычном виде TG Web K в sidebar-header НЕТ `data-peer-id` — он появляется ТОЛЬКО на странице Настроек.

**Решение v0.19.2 (окончательное)**: Полностью БЕЗ DOM. Перебираем IndexedDB cursor → `users` store → ищем `pFlags.self === true` → имя/телефон.
```js
// Подход: IndexedDB cursor → pFlags.self → имя/телефон
var cur = tx.objectStore('users').openCursor();
cur.onsuccess = function() {
  var u = cur.result.value;
  if (u && u.pFlags && u.pFlags.self) { /* найден! */ }
  cur.result.continue();
};
```

**Дополнительно — ЛОВУШКА**: `messengers:save` пишет ВСЮ структуру мессенджера в electron-store, включая `accountScript`. Даже после удаления `accountScript` из `constants.js`, старый скрипт выживает в сохранённом `messengers.json`!

**Решение (2 уровня)**:
1. В `tryExtractAccount` — для дефолтных мессенджеров брать `accountScript` ТОЛЬКО из `DEFAULT_MESSENGERS`, не из сохранённых данных:
```js
const defaultM = DEFAULT_MESSENGERS.find(m => m.id === messengerId)
const script = defaultM !== undefined
  ? defaultM.accountScript  // из constants.js (undefined = не извлекаем)
  : storedMessenger?.accountScript  // кастомные мессенджеры — из store
```
2. При загрузке — чистить устаревший `accountScript` из сохранённых данных:
```js
const cleaned = list.map(m => {
  const def = DEFAULT_MESSENGERS.find(d => d.id === m.id)
  if (def && m.accountScript && !def.accountScript) {
    const { accountScript, ...rest } = m; return rest
  }
  return m
})
```

---

### ❌ Бейдж непрочитанных = 0 когда все чаты приглушены (muted)

**Симптом**: В Telegram десятки непрочитанных сообщений, но бейдж на вкладке пропал и в статус-баре "📥 непрочитано" не отображается.

**Причина**: `countUnread()` в `monitor.preload.js` фильтровал ВСЕ бейджи muted-диалогов через `isBadgeInMutedDialog()`. Если все чаты с непрочитанными приглушены — `total = 0`.

**Решение**: Разделить подсчёт на два уровня:
- `allTotal` — ВСЕ непрочитанные (включая muted) — для бейджа вкладки и статус-бара
- `total` (personal + channels) — без muted — для определения роста и уведомлений
```js
// countUnread теперь возвращает { personal, channels, total, allTotal }
// sendUpdate использует allTotal для unread-count IPC
try { ipcRenderer.sendToHost('unread-count', allTotal) } catch {}
```

---

### ❌ Уведомление "Новое сообщение" без текста сыплется от muted-чатов

**Симптом**: Пользователь видит уведомления "Telegram / Новое сообщение" без текста — от каналов с сотнями/тысячами непрочитанных (AliExpress 7.1K, Бизнес сегодня 296 и т.д.), даже если они приглушены.

**Причина 1**: `app:notify` вызывался при любом росте `unread-count`. `countUnread` суммировал бейджи ВСЕХ диалогов (включая 🔇 muted), поэтому любой новый пост в канале = рост счётчика = уведомление.

**Причина 2**: Тело уведомления = хардкод `'Новое сообщение'` — не содержит текст сообщения.

**Решение**:
1. В `App.jsx`: убрать `playNotificationSound()` и `app:notify` из `unread-count`. Перенести в `new-message` с текстом: `body: text.length > 100 ? text.slice(0, 97) + '…' : text`
2. В `monitor.preload.js`: `isBadgeInMutedDialog()` + `isActiveChatMuted()` — фильтр muted-диалогов из счётчика и блокировка `new-message` от muted-чатов.

---

### ❌ MutationObserver сообщает о старых сообщениях как о новых при загрузке страницы

**Симптом**: При подключении мессенджера (Telegram и др.) приложение показывает уведомление о "новом" сообщении, хотя оно было отправлено до подключения к системе.

**Причина**: MutationObserver запускается сразу, а мессенджер грузит DOM динамически — `lastCount` начинается с -1 → 0, потом Telegram добавляет чаты → счётчик растёт → `increased = true` → срабатывает `new-message` на старые сообщения.

**Решение**: `monitorReady = false`, устанавливается `true` через 10 секунд. `new-message` отправляется только когда `monitorReady === true`:
```js
let monitorReady = false
setTimeout(() => { monitorReady = true }, 10000)

// В sendUpdate:
const increased = count > lastCount && lastCount >= 0 && monitorReady
```

---

### ❌ Ctrl+колёсико / Ctrl+клавиши зума не работают в WebView

**Симптом**: Обработчики `wheel` и `keydown` на элементе `<webview>` или `window` в renderer не срабатывают когда пользователь взаимодействует с содержимым WebView.

**Причина**: WebView (`<webview>` tag в Electron) — это изолированный процесс. Все события мыши и клавиатуры ВНУТРИ WebView отправляются в его content, а не в родительский renderer. Элемент `<webview>` в DOM renderer-а не получает эти события.

**Решение**: Обработчики зума (Ctrl+wheel, Ctrl+=/-/0) нужно добавлять в **preload WebView** (monitor.preload.js), и отправлять результат через `ipcRenderer.sendToHost('zoom-change', { delta })`. В App.jsx обрабатывать через `ipc-message` на webview-элементе:
```js
// monitor.preload.js:
document.addEventListener('wheel', function(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  ipcRenderer.sendToHost('zoom-change', { delta: e.deltaY < 0 ? 5 : -5 })
}, { passive: false })

// App.jsx (ipc-message handler):
if (e.channel === 'zoom-change') {
  const delta = e.args[0]?.delta || 0
  // ... apply zoom
}
```

---

### ❌ Бейдж/крестик вкладки перекрывает название мессенджера

**Симптом**: Бейдж "99+" налезает на текст "Telegram" в вкладке. Увеличение `pr-6` не помогает — бейдж слишком широкий.

**Причина**: Бейдж позиционирован `absolute top-1 right-1`. При тексте "99+" бейдж ~30px шириной, и даже с большим padding он перекрывает текст названия.

**Решение (v0.19.6)**: Перенести бейдж из `absolute` в flex-поток:
```jsx
// БЫЛО: absolute — перекрывает текст
<span className="absolute top-1 right-1 ...">99+</span>

// СТАЛО: в потоке flex — вкладка автоматически расширяется
<span className="ml-auto shrink-0 ...">99+</span>
```
Крестик закрытия тоже в потоке — показывается ВМЕСТО бейджа при hover.

**ВАЖНО**: НЕ использовать `absolute` для элементов, которые должны расширять контейнер. `absolute` элементы НЕ влияют на размер родителя.

---

### ❌ require('electron') в renderer или WebView preload

```js
// ОШИБКА — не работает в renderer-процессе
const { ipcRenderer } = require('electron')
```

**Решение**: использовать `window.api` через contextBridge. Для WebView preload — `ipcRenderer.sendToHost`.

---

### ❌ Одна сессия на все мессенджеры

```jsx
// ОШИБКА — все мессенджеры будут делить cookies
<webview src="https://web.telegram.org/" />
<webview src="https://web.whatsapp.com/" />
```

**Решение**: каждому мессенджеру уникальный `partition`:

```jsx
<webview src="https://web.telegram.org/" partition="persist:telegram" />
<webview src="https://web.whatsapp.com/" partition="persist:whatsapp" />
```

---

### ❌ MutationObserver на неправильном элементе

Наблюдать за `document.body` — дорого. Мессенджеры рендерят только видимую область.

**Решение**: наблюдать за контейнером сообщений конкретного чата, а не за всем body. Найти правильный корневой элемент чата.

---

### ❌ executeJavaScript с пользовательским вводом напрямую

```js
// УЯЗВИМОСТЬ XSS/инъекция
webContents.executeJavaScript(`fillInput("${userText}")`)
```

**Решение**: всегда использовать `JSON.stringify`:

```js
webContents.executeJavaScript(`fillInput(${JSON.stringify(userText)})`)
```

---

## AI-панель (AISidebar)

### ❌ Тело чата/WebView видно одновременно с конфиг-панелью

Когда `showConfig === true`, тело чата (варианты ответов + поле ввода) или WebView всё равно рендерятся под панелью настроек. Это визуально ломает UX — пользователь видит и настройки, и чат одновременно.

**Симптом**: При открытой ⚙️-панели внизу виден пузырёк чата и/или поле "Вставьте сообщение клиента...".

**Решение**: Добавить `!showConfig` в условие рендера тела:
```jsx
{providerMode === 'api' && !showConfig && (
  <>
    {/* тело чата + поле ввода */}
  </>
)}
{providerMode === 'webview' && !showConfig && (
  <div> {/* WebView + нижняя панель */} </div>
)}
```

---

### ❌ Устаревший текст в info-баннерах настроек

Если добавляется новый способ подключения (например, Веб-интерфейс), не забыть обновить info-баннеры в конфиг-панели. Иначе пользователь видит противоречивую информацию.

**Пример**: баннер писал "Войти через email/пароль невозможно — только API-ключ", хотя уже существует режим Веб-интерфейс.

**Решение**: В API-режиме упоминать о существовании альтернативы (Веб-интерфейс). В WebView-режиме — объяснять что API-ключ не нужен.

---

## ИИ-интеграция

### ❌ Авто-проверка провайдеров при монтировании использует stale settings

При реализации авто-проверки в `useEffect(fn, [])` — зависимостей нет, поэтому `settings` захвачены из closure на момент монтировании. Если settings ещё не загрузились (async), проверка будет без ключей.

**Решение**: запускать с задержкой `setTimeout(startupCheck, 2000)` — давая приложению время загрузить настройки из electron-store. Очистка таймера при unmount обязательна.

---

### ❌ Хардкодированный текст ошибки скрывает реальную причину сбоя API

Кнопка "Проверить соединение" при любой ошибке показывала `'✗ Ошибка — проверьте ключ'`, даже если ключ правильный, но деньги на балансе кончились. Пользователь видел неверный диагноз и менял рабочий ключ.

**Причина**: текст кнопки хардкодирован, а блок `{error && <div>⚠️ {error}</div>}` находился в теле чата, которое скрыто при открытых настройках (`!showConfig`).

**Решение**: в настройках после кнопки testConnection добавлен отдельный блок ошибки:
```jsx
{testStatus === 'fail' && error && (
  <div className="mt-1.5 text-[10px] px-2 py-1.5 rounded-lg"
    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
    ⚠️ {error}
  </div>
)}
```
Текст кнопки при ошибке — нейтральный `'✗ Ошибка'`, детали — в блоке ниже.

---

### ❌ API-ключ в renderer

```js
// ОШИБКА — ключ виден через DevTools
const response = await fetch('https://api.openai.com/...', {
  headers: { Authorization: `Bearer ${window.apiKey}` }
})
```

**Решение**: все запросы к ИИ только через IPC → main → внешний API.

---

### ❌ Отправлять весь DOM WebView в ИИ

Мессенджеры генерируют огромный DOM. Отправка всего содержимого — дорого и медленно.

**Решение**: извлекать только текст сообщений и метаданные (отправитель, время, имя чата).

---

## Авто-ответ

### ❌ Отвечать на собственные сообщения

Бот будет отвечать сам себе в бесконечном цикле.

**Решение**: в ChatMonitor помечать исходящие сообщения, AutoReplyService игнорировать их.

---

### ❌ Отвечать мгновенно

Мгновенные ответы выглядят роботизированно и могут вызвать бан.

**Решение**: всегда добавлять случайную задержку 2–8 секунд перед отправкой.

---

## Electron

### ❌ nodeIntegration: true в WebView

```js
// ОПАСНО — WebView получает полный доступ к Node.js
new BrowserView({ webPreferences: { nodeIntegration: true } })
```

**Решение**: `nodeIntegration: false`, `contextIsolation: true` — всегда.

---

### ❌ Хранить настройки в переменных — потеря при перезапуске

**Решение**: использовать `electron-store`, сохранять сразу при изменении.

---

### ❌ Зум WebView не сохраняется между сессиями

**Симптом**: Пользователь выставил 150% для Telegram, перезапустил приложение — зум сбросился в 100%.

**Причина**: `zoomLevels` хранился только в React-state, который сбрасывается при каждом перезапуске.

**Решение**: Сохранять `zoomLevels: { [messengerId]: number }` в settings через `settings:save`, загружать при старте:
```js
// Загрузка:
if (s.zoomLevels) { setZoomLevels(s.zoomLevels); zoomLevelsRef.current = s.zoomLevels }
// Сохранение (debounce 800ms в changeZoom):
const updated = { ...settingsRef.current, zoomLevels: next }
window.api.invoke('settings:save', updated).catch(() => {})
```
