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

### ❌ Перехват window.Notification/CustomEvent из preload WebView (context isolation)

**Симптом**: Уведомления мессенджера показывают "electron.app.Electron" вместо нашего заголовка. Переопределение `window.Notification` в preload не работает.

**Причина**: Electron WebView с context isolation изолирует JavaScript worlds:
- Preload world: свой `window`, свои объекты → `window.Notification` override видно ТОЛЬКО в preload
- Main world (страница мессенджера): свой `window` → `new Notification()` вызывается тут → override из preload НЕ виден

**Что НЕ работает**:
1. `window.Notification = ...` в preload → override виден только в preload world
2. `<script>` tag injection из preload → скрипт выполняется в main world, НО `CustomEvent` / `dispatchEvent` НЕ пересекают границу миров (JS events изолированы!)
3. `window.addEventListener('__cc_notification', ...)` в preload → НЕ ловит events из main world

**Решение v0.27.0 (ЧАСТИЧНОЕ — executeJavaScript в dom-ready)**: `webview.executeJavaScript()` в dom-ready handler + console-message. Проблема: VK может вызвать `new Notification()` ДО dom-ready → нативное уведомление просочится.

**Решение v0.29.1 (ОКОНЧАТЕЛЬНОЕ — <script> injection в preload)**: `<script>` tag создаётся в `monitor.preload.js` при document_start:
```js
// В monitor.preload.js (самое начало файла):
const s = document.createElement('script')
s.textContent = '(' + function() {
  window.Notification = function(title, opts) {
    console.log('__CC_NOTIF__' + JSON.stringify({t:title,b:opts?.body||'',i:opts?.icon||''}))
  }
  // + Audio.volume = 0
} + ')()'
;(document.head || document.documentElement).appendChild(s)
s.remove()
```
Этот `<script>` выполняется в main world при document_start — ДО скриптов VK/WhatsApp. console.log → console-message event ловит данные в App.jsx.

**Дополнительно**: `app.setName('ЦентрЧатов')` в main.js как fallback — но на Windows это НЕ влияет на заголовок тостов! Нужен `app.setAppUserModelId()` (см. ниже).

**Ключевой урок**: В Electron WebView с context isolation:
- DOM — общий (MutationObserver работает из preload, `<script>` тоже)
- `<script>` tag из preload → выполняется в main world при document_start (ДО скриптов страницы!)
- JS objects — изолированы (window.X в preload ≠ window.X на странице)
- JS events (CustomEvent, addEventListener) — изолированы (НЕ пересекают миры!)
- console.log → console-message event — ПЕРЕСЕКАЕТ границу (единственный надёжный канал из main world в renderer)
- `setPermissionRequestHandler` НЕ блокирует HTML5 Notification API в WebView (только запросы через requestPermission)
- `executeJavaScript` в dom-ready — СЛИШКОМ ПОЗДНО, мессенджер может вызвать Notification раньше
- `executeJavaScript('runDiagnostics()')` НЕ видит функции из preload (изолированный мир!) → использовать `webview.send()` + `ipcRenderer.on()` в preload

---

### ❌ Двойной звук уведомлений (мессенджер + наш)

**Симптом**: При новом сообщении в VK/WhatsApp играют два звука — один от мессенджера (`new Audio()`), второй наш (Web Audio API).

**Причина**: Мессенджеры используют `new Audio('notification.mp3')` для звука. Наш `playNotificationSound()` добавляет ещё один звук сверху.

**Решение (v0.27.0)**: Перехватить `Audio` конструктор в main world через `executeJavaScript()`, поставить `volume = 0`:
```js
var _A = window.Audio;
window.Audio = function(src) { var a = new _A(src); a.volume = 0; return a; };
```
Это глушит программные звуки мессенджера, оставляя только наш Web Audio API звук.

---

### ❌ executeJavaScript запускается ПОСЛЕ нативного Notification (race condition)

**Симптом**: Несмотря на перехват `window.Notification` через `executeJavaScript` в `dom-ready`, нативные уведомления с заголовком "electron.app.Electron" всё равно показываются. Мессенджер успевает вызвать `new Notification()` ДО выполнения нашего скрипта.

**Причина**: `dom-ready` не гарантирует, что наш `executeJavaScript` выполнится раньше скриптов мессенджера. VK может вызвать `new Notification()` во время загрузки или сразу после `DOMContentLoaded`.

**Решение v0.29.0 (НЕ ПОМОГЛО)**: `setPermissionRequestHandler` + `setPermissionCheckHandler` НЕ блокирует HTML5 `new Notification()` в WebView. Permissions проверяются только при `requestPermission()`, но VK создаёт `new Notification()` напрямую.

**Решение (v0.29.1)**: Ранняя `<script>` tag injection в `monitor.preload.js` при document_start — перехват `window.Notification` ДО скриптов мессенджера.

**Решение (v0.29.2)**: `app.setAppUserModelId('ЦентрЧатов')` — Windows берёт заголовок тостовых уведомлений из AppUserModelId, а НЕ из `app.setName()`. По умолчанию Electron ставит `"electron.app.Electron"` — именно это показывалось.

---

### ❌ Фантомные/старые уведомления при первом запуске мессенджера

**Симптом**: При открытии VK появляется уведомление о старом сообщении, которое было прочитано давно (например "Как ты Новый год встретил?"). Никто не писал новое сообщение.

**Причина (v0.29.0 НЕ помогло полностью)**: Два канала `handleNewMessage`:
1. `console-message` `__CC_NOTIF__` — заблокирован warm-up ✅
2. `ipc-message` `new-message` от MutationObserver — НЕ заблокирован! `lastActiveMessageText = null` при старте → первое найденное сообщение (даже старое) считается "новым" в Path 2 `sendUpdate`.

**Решение (v0.29.1)**: Тройная защита:
1. Warm-up `notifReadyRef` для ОБОИХ каналов (и `__CC_NOTIF__`, и `ipc-message new-message`) в App.jsx
2. Инициализация `lastActiveMessageText` текущим текстом DOM при `monitorReady = true` в monitor.preload.js
3. `monitorReady` 10 сек в monitor.preload.js (было и раньше)

---

### ❌ Уведомление/звук при чтении сообщения в активном чате

**Симптом**: Пользователь открывает непрочитанный чат в Telegram — приложение показывает Windows-уведомление и играет звук, хотя пользователь УЖЕ смотрит на этот чат.

**Причина**: `handleNewMessage` безусловно показывал уведомление и играл звук для ЛЮБОГО нового сообщения, не проверяя активна ли вкладка и в фокусе ли окно.

**Решение (v0.30.0)**: Проверка `document.hasFocus() && activeIdRef.current === messengerId` перед звуком и уведомлением.

**Проблема (v0.36.0)**: `document.hasFocus()` возвращает `false` когда фокус внутри WebView! В Electron, клик внутри `<webview>` передаёт фокус guest process — renderer `document` теряет фокус. Результат: уведомление показывается даже когда пользователь смотрит на чат.

**Решение (v0.36.0)**: Заменить `document.hasFocus()` на `!document.hidden` (Page Visibility API):
```js
const isViewingThisChat = !document.hidden && activeIdRef.current === messengerId
```
`document.hidden` = `false` когда окно видимо (не зависит от фокуса WebView). `true` только когда окно скрыто/минимизировано.

**Ключевой урок**: В Electron с WebView НЕ использовать `document.hasFocus()` — он ненадёжен. Использовать `!document.hidden` (Page Visibility API).

---

### ❌ app.setName() не меняет заголовок уведомлений на Windows

**Симптом**: Нативные Windows-уведомления показывают "electron.app.Electron" вместо "ЦентрЧатов", несмотря на `app.setName('ЦентрЧатов')`.

**Причина**: На Windows заголовок тостовых уведомлений (Toast Notification) берётся из **AppUserModelId**, а не из `app.name`. По умолчанию Electron устанавливает AppUserModelId = `"electron.app.Electron"`.

**Решение (v0.29.2)**: Вызвать `app.setAppUserModelId('ЦентрЧатов')` в самом начале main.js:
```js
app.setName('ЦентрЧатов')
if (process.platform === 'win32') {
  app.setAppUserModelId('ЦентрЧатов')
}
```

**Ключевой урок**: На Windows для уведомлений недостаточно `app.setName()` — обязательно нужен `app.setAppUserModelId()`.

---

### ❌ Уведомления MAX без текста и аватарки

**Симптом**: Уведомления от мессенджера MAX показывают только "Макс 15:05" без текста сообщения и без аватарки отправителя.

**Причина**: MAX (web.max.ru) — SvelteKit-приложение, использует `ServiceWorkerRegistration.prototype.showNotification()` вместо `new Notification()`. Наш перехват ловил только `new Notification()` через `window.Notification = function(...)`.

**Решение (v0.33.0)**: Добавлен перехват `ServiceWorkerRegistration.prototype.showNotification` в monitor.preload.js injection:
```js
var _show = ServiceWorkerRegistration.prototype.showNotification
ServiceWorkerRegistration.prototype.showNotification = function(title, opts) {
  console.log('__CC_NOTIF__' + JSON.stringify({
    t: title, b: opts?.body, i: opts?.icon || opts?.badge
  }))
  return Promise.resolve()
}
```

---

### ❌ Счётчик непрочитанных MAX показывает 3 вместо 1

**Симптом**: На вкладке MAX бейдж показывает 3, хотя в списке чатов только 1 непрочитанный.

**Причина**: Generic селекторы `[class*="badge"]`, `[class*="unread"]`, `[class*="counter"]` ловят ВСЕ бейджи на странице — не только в списке чатов, но и в навигации (иконка "Все" с бейджем, "Новые" с бейджем). 1+1+1=3.

**Решение (v0.33.2)**: Отдельная функция `countUnreadMAX()`:
1. **Primary**: title parsing `(N)` — MAX ставит число в title
2. **Fallback**: бейджи ТОЛЬКО внутри контейнера списка чатов (`[class*="ChatList"]`, `[role="list"]`)

**Урок**: Для новых мессенджеров НЕ использовать `[class*="badge"]` глобально — всегда ограничивать контейнером чатов.

---

### ❌ Ложное уведомление при "пометить непрочитанным" (v0.34.0)

**Симптом**: Пользователь помечает чат в MAX как непрочитанный → появляется уведомление "новое сообщение", хотя это старое сообщение.

**Причина**: MAX вызывает `Notification()` при пометке чата непрочитанным → наш перехват `__CC_NOTIF__` → `handleNewMessage()` → уведомление.

**Решение**: В `console-message` handler добавлен `if (document.hasFocus() && activeIdRef.current === messengerId) return` — если пользователь смотрит на этот мессенджер, уведомление подавляется.

---

### ❌ executeJavaScript() не видит функции из preload (v0.34.0)

**Симптом**: Кнопка "Диагностика DOM" в контекстном меню → ничего не происходит.

**Причина**: `webview.executeJavaScript('runDiagnostics()')` выполняется в main world, а `runDiagnostics` определена в preload isolated world (context isolation).

**Решение**: Использовать IPC — `webview.send('run-diagnostics')` в App.jsx + `ipcRenderer.on('run-diagnostics', ...)` в monitor.preload.js.

**Урок**: Для вызова preload-функций из renderer — ТОЛЬКО через IPC (`webview.send()` + `ipcRenderer.on()`), НЕ через `executeJavaScript()`.

---

### ❌ Уведомления не приходят при свёрнутом окне (v0.35.0)

**Симптом**: Приложение свёрнуто в трей → приходит сообщение в мессенджер → уведомление НЕ появляется. При развороте окна — уведомление появляется мгновенно.

**Причина**: Electron по умолчанию включает `backgroundThrottling` для renderer process и WebView. Когда окно скрыто (`mainWindow.hide()`):
- JS в renderer замедляется/приостанавливается
- MutationObserver в WebView не срабатывает
- Notification hooks не ловят события
- IPC сообщения от WebView не отправляются
- При развороте — всё "просыпается" и уведомления приходят разом

**Решение (v0.35.0)**: Отключить `backgroundThrottling` в трёх местах:
```js
// 1. main.js — webPreferences BrowserWindow
webPreferences: { backgroundThrottling: false, ... }

// 2. main.js — runtime override
mainWindow.webContents.backgroundThrottling = false

// 3. App.jsx — каждый <webview>
<webview webpreferences="backgroundThrottling=no" ... />
```

**Минус**: Немного выше потребление CPU в фоне (WebView продолжают работать). Но для мессенджер-приложения это обязательно — уведомления важнее экономии CPU.

**Ключевой урок**: Для приложений с уведомлениями/мониторингом `backgroundThrottling: false` — обязательная настройка. Без неё WebView замораживаются при скрытии окна.

---

### ❌ Закрытие вкладки мессенджера без подтверждения

```js
// ОШИБКА — мгновенное удаление без предупреждения
onClose={() => removeMessenger(m.id)}
```

**Симптом**: Случайный клик по × или Ctrl+W мгновенно удаляет вкладку, сбрасывая сессию авторизации. Пользователю приходится заново логиниться (QR-код, пароль).

**Решение** (v0.31.0): Промежуточная функция `askRemoveMessenger(id)` → показывает модальный диалог подтверждения. Кнопка «Отмена» (autoFocus) и красная кнопка «Закрыть». Применено к: кнопке ×, Ctrl+W, контекстному меню «Закрыть вкладку».

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

## Настройки (SettingsPanel)

### ❌ Дублирование настроек ИИ в SettingsPanel и AISidebar

**Симптом**: Пользователь видит настройки ИИ-провайдера/модели/ключа в двух местах: в SettingsPanel (⚙️ в шапке) и в AISidebar (⚙️ на панели ИИ). Путаница — какие настройки актуальны.

**Причина**: Секция "ИИ-помощник" в SettingsPanel была добавлена в v0.6.0, а расширенные per-provider настройки — в AISidebar позже (v0.9-v0.12). SettingsPanel перестала быть нужна для ИИ.

**Решение (v0.25.0)**: Убрать секцию "ИИ-помощник" из SettingsPanel. Настройки ИИ — только в AISidebar.

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
