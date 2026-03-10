# Типичные ошибки — ChatCenter

## 🔴 КРИТИЧЕСКОЕ: requestAnimationFrame НЕ работает в hidden BrowserWindow

### ❌ Использование rAF в notification window

**Симптом**: Ribbon уведомления показываются только при первой загрузке, потом перестают появляться навсегда.

**Причина**: `reportHeight()` в notification.html использовал двойной `requestAnimationFrame` для стабильного layout. Но Chromium НЕ вызывает rAF для hidden/invisible окон. После dismiss всех уведомлений → `notifWin.hide()` → rAF больше никогда не выполняется → `notif:resize` не приходит → `showInactive()` не вызывается → окно навсегда скрыто.

**Решение (v0.47.2)**: Заменить rAF на `setTimeout(60ms)`. Также main.js показывает `showInactive()` ДО отправки `notif:show`, чтобы layout гарантированно работал.

**Ключевой урок**: В Electron BrowserWindow с `show: false` или после `hide()` — НИКОГДА не использовать `requestAnimationFrame`. Использовать `setTimeout`.

---

## 🔴 КРИТИЧЕСКОЕ: Ложные ribbon при навигации между чатами

### ❌ getLastMessageText срабатывает на СТАРЫЕ сообщения при смене чата

**Симптом**: При переключении на другой чат в Telegram появляется ribbon уведомление для старого (уже прочитанного) сообщения.

**Причина**: Path 2 в `sendUpdate()` (monitor.preload.js) — `getLastMessageText(type)` находит последнее видимое сообщение в DOM. При навигации к ДРУГОМУ чату: DOM обновляется → MutationObserver → `sendUpdate()` → `getLastMessageText` находит текст из нового чата → отличается от `lastActiveMessageText` → считается "новым" → `new-message` IPC → ribbon.

**Решение (v0.47.2)**: Path 2 отключён для Telegram (`type !== 'telegram'`). У Telegram хорошо работает `__CC_NOTIF__` (перехват Notification API) + unread count. Path 2 нужен только для мессенджеров где unread count не растёт при открытом чате (MAX, WhatsApp, VK).

**Ключевой урок**: `getLastMessageText` — ненадёжный детектор новых сообщений. Он не различает "новое сообщение в текущем чате" и "старое сообщение в другом чате, на который переключились". Для мессенджеров с работающим Notification API (Telegram) — использовать `__CC_NOTIF__`, не Path 2.

---

## 🔴 КРИТИЧЕСКОЕ: Глобальные настройки ломают отдельные мессенджеры

### ❌ Одни настройки на все мессенджеры = "чиним одно, ломается другое"

**Симптом**: Изменения для одного мессенджера (MAX) ломают уведомления для других (Telegram, VK).

**Причина**: До v0.47.0 все настройки уведомлений были глобальные: `soundEnabled`, `notificationsEnabled`, `mutedMessengers`. Фикс для MAX (addedNodes, fallback ribbon) влиял на ВСЕ мессенджеры.

**Решение (v0.47.0)**: Per-messenger настройки: `messengerNotifs: { [id]: { sound: bool, ribbon: bool } }`. Каждый мессенджер управляется отдельно. Глобальные настройки = fallback. UI: два toggle (Звук + Ribbon) на каждый мессенджер в SettingsPanel.

**Ключевой урок**: Настройки уведомлений ВСЕГДА должны быть per-messenger. Глобальные — только как default/fallback.

---

## 🔴 КРИТИЧЕСКОЕ: Ribbon только для первого сообщения (повторные — только звук)

### ❌ Мессенджеры не вызывают `new Notification()` для каждого нового сообщения

**Симптом**: При получении нескольких сообщений подряд (в MAX и др.) ribbon показывается только для первого, остальные — только звук.

**Причина**: Ribbon создаётся ТОЛЬКО через `handleNewMessage()`, который вызывается из `__CC_NOTIF__` (перехват Notification API) и `new-message` (MutationObserver IPC). Многие мессенджеры (MAX, VK, WhatsApp) группируют уведомления и не вызывают `new Notification()` для каждого отдельного сообщения. При этом `page-title-updated` и `unread-count` хендлеры играют звук при росте счётчика, но НЕ создают ribbon.

**4 пути уведомлений**:
1. `__CC_NOTIF__` → `handleNewMessage()` → ribbon + звук ✅
2. `new-message` IPC → `handleNewMessage()` → ribbon + звук ✅
3. `page-title-updated` → звук ⚠️ (ribbon НЕ создавался)
4. `unread-count` IPC → звук ⚠️ (ribbon НЕ создавался)

**Решение (v0.46.2)** — НЕПОЛНОЕ, не работает для MAX:
1. Добавить `lastRibbonTsRef = useRef({})` — `{ [messengerId]: timestamp }` последнего показа ribbon
2. В `handleNewMessage` перед `app:custom-notify` записывать `lastRibbonTsRef.current[messengerId] = Date.now()`
3. В `page-title-updated` и `unread-count` хендлерах: если `Date.now() - lastRibbonTs > 3000` → создавать fallback ribbon

**Почему v0.46.2 НЕ помогло для MAX**: Когда чат ОТКРЫТ в WebView → MAX считает сообщения прочитанными → unread count = 0 → НЕ растёт → `page-title-updated` не имеет `(N)` в title → `unread-count` IPC = 0 → fallback ribbon никогда не срабатывает. Звук шёл от самого MAX (AudioContext, не `new Audio()`).

**Решение (v0.46.3)** — addedNodes detection:
1. `quickNewMsgCheck()` в MutationObserver — анализирует `mutation.addedNodes` напрямую
2. При появлении нового DOM-элемента с текстом (2-500 символов) → `new-message` IPC
3. Фильтрация: пропускаются BUTTON/INPUT/SVG/IMG, элементы >40 children, timestamps, служебные тексты
4. Cooldown 3 сек + dedup по тексту + `isViewingThisTab` в App.jsx
5. Работает для MAX, WhatsApp, VK. Telegram исключён (работает через `__CC_NOTIF__`)

**Ключевой урок**: Нельзя полагаться на unread count для ribbon — когда чат открыт в WebView, count не растёт. Нужен прямой мониторинг DOM mutations (addedNodes).

---

## 🔴 КРИТИЧЕСКОЕ: ribbonExpandedByDefault ломает показ ribbon-уведомлений

### ❌ overflow:hidden на .notif-item + таймер при expandedByDefault + порядок авто-раскрытия

**Симптом**: При включении настройки "Кнопки действий сразу" (ribbonExpandedByDefault) ribbon-уведомления перестают показываться полностью.

**Причина 1**: `overflow: hidden` на `.notif-item` обрезал expanded-контент, который выходил за min-height (76px).

**Причина 2**: Таймер dismiss запускался ДАЖЕ при `expandedByDefault` → уведомление авто-удалялось через dismissMs.

**Причина 3**: Авто-раскрытие (`el.classList.add('expanded')`) происходило ДО настройки таймера → `items.set()` записывал `expanded: false`, хотя уведомление уже было раскрыто.

**Причина 4**: Начальная высота окна 76px — слишком мала для expanded ribbon (~120px+). `notif:resize` IPC не успевал увеличить окно.

**Решение (v0.46.1)**:
1. Убрать `overflow: hidden` с `.notif-item`
2. При `expandedByDefault` — НЕ запускать таймер, поставить `progress.style.animationPlayState = 'paused'`
3. Код авто-раскрытия (`if (data.expandedByDefault)`) перенести ПОСЛЕ настройки таймера и mouseenter/mouseleave
4. Начальная высота окна 300px (а не 76px)

**Ключевой урок**: При expandedByDefault нужно пауза таймера С ПЕРВОЙ секунды, и авто-раскрытие ПОСЛЕ полной настройки таймера.

### ❌ CSS `display: none/flex` не анимируется

**Симптом**: `.action-row { display: none }` → `.expanded .action-row { display: flex }` — переключение мгновенное, без анимации.

**Причина**: CSS свойство `display` не поддерживает transition.

**Решение**: Заменить на `max-height: 0` + `overflow: hidden` + `opacity: 0` → `max-height: 60px` + `opacity: 1` с `transition: max-height 200ms, opacity 200ms`.

**Ключевой урок**: Для анимации показа/скрытия блока использовать max-height transition, НЕ display toggle.

---

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

### ❌ accountScript MAX не находит имя профиля (v0.37.0 — v0.38.2)

**Симптом**: Вкладка "Макс" показывает "MAX" (document.title) вместо имени профиля "Автолиберти".

**Цепочка проблем и решений (5 итераций)**:

**Проблема 1 — Данных нет в localStorage/IndexedDB/cookies:**
MAX (SvelteKit SPA) НЕ хранит имя/телефон профиля в localStorage. Ключи `__oneme_*` содержат только auth token, theme, device_id. IndexedDB пуст. Cookies пусты.

**Проблема 2 — Generic API endpoints не работают:**
`/api/me`, `/api/profile`, `/api/v1/me` — ВСЕ возвращают HTML-shell SPA (status 200, но body = `<!doctype html>...`). SvelteKit `__data.json` endpoints тоже возвращают HTML. MAX не использует server-side data loading.

**Проблема 3 — DOM-селекторы слишком generic:**
Имя/телефон видны ТОЛЬКО на странице Профиля, не на странице чатов. Generic CSS-селекторы (`[class*="profile"]`, `nav [class*="avatar"] + *`) не матчат Svelte-компоненты.

**Проблема 4 — Клик на "Профиль" через TreeWalker кликает SPAN, не BUTTON:**
Svelte-кнопка имеет структуру `<BUTTON class="button svelte-xwrwgf"><SPAN class="title">Профиль</SPAN></BUTTON>`. TreeWalker находит текст "Профиль" → parent = `<SPAN>` → `span.click()` НЕ триггерит Svelte `on:click|self` обработчик на BUTTON.

**Проблема 5 — async IIFE не резолвится в executeJavaScript:**
`executeJavaScript('(async () => { await ...; return "name" })()')` — промис НЕ резолвится с возвращённым значением. `result` приходит как `null`/`undefined`. Диагностический тест с тем же кодом работает, но accountScript — нет.

**Проблема 6 — Custom ID мессенджера:**
MAX добавлен пользователем как custom мессенджер (ID `custom_1772704264107`), а не как дефолтный (`id: 'max'`). `DEFAULT_MESSENGERS.find(m => m.id === messengerId)` → `undefined` → используется старый сохранённый accountScript (generic, возвращает `document.title` = "MAX"), а не новый из constants.js.

**Окончательное решение (v0.38.2)**:

1. **Матчинг по URL**: `tryExtractAccount` ищет дефолтный мессенджер не только по ID, но и по URL:
```js
const defaultM = DEFAULT_MESSENGERS.find(m => m.id === messengerId)
  || (messenger?.url && DEFAULT_MESSENGERS.find(m => m.url && messenger.url.startsWith(m.url)))
```

2. **Синхронный скрипт + console.log**: accountScript — sync IIFE (НЕ async). Фоновая задача через setTimeout кликает кнопку, читает DOM, отправляет через `console.log('__CC_ACCOUNT__'+name)`:
```js
(function() {
  var cached = localStorage.getItem('__cc_account_name');
  if (cached) return cached;  // sync return — для retry
  // Фоновая задача: click → wait → read → console.log
  setTimeout(() => {
    document.querySelector('.item.settings button').click();
    setTimeout(() => {
      var ni = document.querySelector('input[placeholder="Имя"]');
      if (ni) console.log('__CC_ACCOUNT__' + ni.value.trim());
      history.back();
    }, 3000);
  }, 500);
  return null;
})()
```

3. **console-message listener**: В App.jsx `console-message` handler ловит `__CC_ACCOUNT__` prefix и вызывает `setAccountInfo`.

4. **Blacklist в tryExtractAccount**: Фильтр `BL_ACCOUNT = /^(max|макс|telegram|whatsapp|...)$/i` отклоняет `document.title` как имя аккаунта.

5. **Реальные CSS-селекторы MAX** (из диагностики):
   - Кнопка профиля: `.item.settings button`
   - Имя: `input[placeholder="Имя"]` (value = "Автолиберти")
   - Телефон: `SPAN.phone` (+79126370333)
   - Карточка: `button.profile` (text = "Автолиберти +79126370333")

**Ключевые уроки:**
- `executeJavaScript` с async IIFE в Electron WebView НЕНАДЁЖЕН для return values — использовать `console.log` + `console-message` event
- Custom мессенджеры с URL дефолтного ДОЛЖНЫ получать дефолтный accountScript — матчить по URL, не только по ID
- Добавить blacklist для `document.title` в tryExtractAccount
- Для SvelteKit SPA: данные профиля только в DOM при навигации на страницу профиля, НЕ в storage/API
- Svelte `on:click` может не работать при клике на child element — кликать на САМИ BUTTON, не на span внутри

---

### ❌ Уведомления без аватарки (icon не передан в showNotification)

**Симптом**: Уведомления от MAX/VK приходят без аватарки отправителя.

**Причина**: Мессенджер не передаёт `icon`/`image`/`badge` URL в `Notification()` или `showNotification()`.

**Решение (v0.37.0)**: DOM fallback `findAvatar(name)` — ищет img-аватарку в списке чатов по имени отправителя. Работает в main world injection script.

**Урок**: Не все мессенджеры передают icon в Notification API. Нужен fallback: поиск аватарки в DOM по имени.

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

### ❌ Ribbon не появляется при свёрнутом (minimized) окне (v0.39.3→v0.39.4)

**Симптом**: Сообщения приходят в мессенджер при свёрнутом окне, но ribbon-уведомление НЕ появляется.

**Причина**: `backgroundThrottling: false` спасает от throttling при `hide()`, но при `minimize()` на Windows ОС может замораживать renderer-процесс на уровне ОС. В результате:
- WebView получает сообщение от сервера
- `console-message` DOM event на `<webview>` НЕ dispatched в renderer
- IPC `app:custom-notify` никогда не отправляется в main
- Main process не знает о сообщении → ribbon не создаётся

**Решение (v0.39.4)**: Backup notification path в main process:
```js
// main.js — app.on('web-contents-created')
// Слушаем console-message НАПРЯМУЮ на webContents webview гостей
// Main process никогда не throttled!
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return
  contents.setBackgroundThrottling(false) // belt & suspenders
  contents.on('console-message', (_e, _level, msg) => {
    if (!msg.startsWith('__CC_NOTIF__')) return
    // Только при свёрнутом mainWindow
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) return
    // Показываем уведомление напрямую
    showCustomNotification(...)
  })
})
```
+ Дедупликация в `showCustomNotification` — защита от двойных уведомлений.

**Ключевой урок**: `backgroundThrottling: false` недостаточно на Windows при minimize. Для критичных событий нужен backup path через main process (`contents.on('console-message')` на webContents).

---

### ❌ CSP блокирует `<script>` tag injection в MAX/SvelteKit (v0.39.5→v0.39.6)

**Симптом**: Диагностика показывает `"notifHooked": false` — перехват `window.Notification` не работает в MAX. Уведомления не приходят.

**Причина**: MAX (web.max.ru) — SvelteKit-приложение с Content Security Policy (CSP), которая запрещает inline `<script>` теги. Наш monitor.preload.js создаёт `<script>` тег с `textContent` и добавляет в DOM — CSP блокирует выполнение этого скрипта в main world.

**Что НЕ работает**:
- `document.createElement('script')` + `s.textContent = '...'` + `document.head.appendChild(s)` — CSP блокирует inline scripts
- CSP `nonce` — мы не знаем nonce страницы
- `<script src="...">` — нужен внешний файл, CSP может блокировать неизвестные src

**Решение (v0.39.6)**: `executeJavaScript()` fallback в App.jsx dom-ready handler:
```js
// executeJavaScript работает через DevTools protocol — обходит CSP!
setTimeout(() => {
  el.executeJavaScript(`
    if (!window.__cc_notif_hooked) {
      window.__cc_notif_hooked = true;
      // ... notification hook + Audio mute + findAvatar
      console.log('__CC_NOTIF_HOOK_OK__');
    }
  `).then(() => { ... }).catch(() => {})
}, 1500)
```

**Ключевые уроки**:
- `<script>` tag injection работает для большинства мессенджеров, но CSP может заблокировать — нужен fallback
- `executeJavaScript()` обходит CSP через DevTools protocol (V8 evaluate, не DOM)
- Диагностика `notifHooked` (`window.__cc_notif_hooked`) — ключевой индикатор проблемы
- Для надёжности: сначала `<script>` в preload (document_start, максимально рано), потом `executeJavaScript` fallback (1.5 сек после dom-ready)

---

### ❌ Уведомления от MAX не приходят вообще (v0.39.4→v0.39.5)

**Симптом**: Сообщения приходят в MAX, но ribbon-уведомления не показываются ни при свёрнутом, ни при развёрнутом окне.

**Причины** (3 точки отказа одновременно):
1. **`isViewingThisTab` подавлял `__CC_NOTIF__`** — когда вкладка MAX активна, `if (!document.hidden && activeIdRef.current === messengerId) return` блокировал все Notification API уведомления. А MAX может не вызывать Notification API когда вкладка неактивна.
2. **MutationObserver `new-message` не доходил до main process** — `ipcRenderer.sendToHost()` создаёт событие только в renderer process. При свёрнутом окне renderer throttled → событие не dispatched.
3. **Backup path работал только при свёрнутом** — `if (mainWindow.isVisible() && !mainWindow.isMinimized()) return` отсекал все уведомления при развёрнутом окне.

**Решение (v0.39.5)**:
- Убрано `isViewingThisTab` для `__CC_NOTIF__` path — если Notification API вызван, это подтверждённое уведомление
- Добавлен `__CC_MSG__` канал: `console.log('__CC_MSG__' + text)` в monitor.preload.js параллельно с `sendToHost('new-message')` — main process может перехватить через `contents.on('console-message')`
- Backup path расширен для `__CC_MSG__` и работает всегда (дедупликация предотвращает дубли)
- Renderer также обрабатывает `__CC_MSG__` из console-message

**Ключевой урок**: Для надёжных уведомлений нужно НЕСКОЛЬКО параллельных путей доставки. Один путь (`sendToHost`) зависит от renderer, второй (`console.log`) доступен main process напрямую. Дедупликация в `showCustomNotification` предотвращает дубли.

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

---

### ❌ Удаление отображения accountInfo из вкладки → пользователь теряет имя профиля (v0.38.0)

**Симптом**: Имя аккаунта Telegram/MAX/VK пропало из вкладки. Пользователь не видит какой профиль активен.

**Причина (v0.33.1)**: По запросу убрали accountInfo из видимого текста вкладки, оставив только в tooltip. Но accountInfo = единственный способ отличить аккаунты, поэтому пользователь вернул запрос.

**Решение (v0.38.0)**: accountInfo отображается под названием мессенджера всегда. messagePreview временно заменяет его на 5 сек при новом сообщении:
```jsx
{messagePreview ? (
  <span style={{ color: m.color }}>💬 {messagePreview}</span>
) : accountInfo ? (
  <span style={{ color: 'var(--cc-text-dimmer)' }} className="opacity-60">{accountInfo}</span>
) : null}
```

**Урок**: Информация о профиле — критически важна. Не удалять без чёткой замены.

---

## Кастомные уведомления (v0.39.0)

### Потенциальные ошибки при работе с Notification BrowserWindow

**1. `transparent: true` на Windows требует осторожности:**
- Windows 11 поддерживает transparent BrowserWindow, но `backgroundColor` должен быть `#00000000`
- Без `frame: false` прозрачность НЕ работает
- HTML body тоже должен иметь `background: transparent`

**2. `focusable: false` + клики:**
- `focusable: false` предотвращает кражу фокуса при `showInactive()`
- НО окно всё равно кликабельно — `setIgnoreMouseEvents(false)` по умолчанию
- Если поставить `setIgnoreMouseEvents(true)` — клики будут проходить СКВОЗЬ окно

**3. Путь к notification.html в production:**
- В dev: `path.join(__dirname, '../../main/notification.html')` (от out/main/)
- В prod: зависит от структуры сборки — `notification.html` должен быть включён в `build.files` в package.json или скопирован при сборке
- Если файл не найден — `loadFile()` молча покажет пустое окно

**4. `screen` API доступен ТОЛЬКО после `app.whenReady()`:**
- `const { screen } = require('electron')` — OK на уровне модуля
- НО `screen.getPrimaryDisplay()` вернёт ошибку если вызван до `app.whenReady()`
- NotificationManager создаёт окно лениво (при первом уведомлении) — к тому моменту app уже ready

**5. Resize BrowserWindow на Windows — не плавный:**
- `setBounds()` с `animate: true` работает ТОЛЬКО на macOS
- На Windows: мгновенное изменение, может мелькать
- Решение: использовать CSS-анимацию ВНУТРИ окна, а `setBounds` вызывать по IPC `notif:resize` когда HTML сообщает нужную высоту

---

## 🔴 isViewingThisChat подавляет ВСЕ уведомления на активной вкладке (v0.39.0)

### ❌ messengerId ≠ конкретный чат

**Симптом (v0.39.0)**: Пользователь на вкладке VK, приходит сообщение от другого чата VK — ни звука, ни ribbon. `messagePreview` появляется, но sound и notification пропущены.

**Причина**: `isViewingThisChat = !document.hidden && activeIdRef.current === messengerId` подавляло и звук, и ribbon. Но `messengerId` — это ID вкладки (например `"vk"`), а НЕ ID конкретного чата. Оператор на VK-вкладке мог быть в совершенно другом чате.

**Решение (v0.39.1)**: Убрать `!isViewingThisChat` из условий звука и уведомления. Подавление остаётся только по `messengerMuted` и глобальным настройкам.

```js
// БЫЛО (v0.39.0):
if (soundEnabled && !messengerMuted && !isViewingThisChat) playNotificationSound()
if (notificationsEnabled && !messengerMuted && !isViewingThisChat) { ... }

// СТАЛО (v0.39.1):
if (soundEnabled && !messengerMuted) playNotificationSound()
if (notificationsEnabled && !messengerMuted) { ... }
```

**Ключевой урок**: В ChatCenter `messengerId` — это ID WebView-вкладки, а не конкретного чата внутри мессенджера. Нельзя использовать его для определения "пользователь смотрит на этот чат".

---

## 🟡 Прозрачность BrowserWindow на Windows (v0.39.0 → v0.39.1)

### ❌ transparent: true недостаточно без backgroundColor

**Симптом**: Notification window с `transparent: true` показывает чёрный фон вместо прозрачного на Windows.

**Причина**: На Windows `transparent: true` НЕ гарантирует прозрачность без явного `backgroundColor: '#00000000'`.

**Решение**: Всегда добавлять `backgroundColor: '#00000000'` к `transparent: true`:
```js
new BrowserWindow({
  transparent: true,
  backgroundColor: '#00000000',
  // ...
})
```

**Ключевой урок**: На Windows для прозрачного BrowserWindow ОБЯЗАТЕЛЬНО `transparent: true` + `backgroundColor: '#00000000'`.

---

## 🔴 Фантомные уведомления от MAX (v0.39.0 — v0.39.1)

### ❌ __CC_NOTIF__ с пустым body от ServiceWorker

**Симптом**: Уведомление "Макс 11:28" появляется хотя никто не писал. MAX-мессенджер отправляет фантомное уведомление.

**Причина**: MAX (web.max.ru) через ServiceWorker вызывает `showNotification("Макс", {body: ""})` — это push-sync или status-уведомление. Наш перехват ловит его и отправляет `__CC_NOTIF__` с `{t: "Макс", b: ""}`. В App.jsx код использовал `data.b || data.t || ''` — пустой body фолбечил на title "Макс", который обрабатывался как "новое сообщение".

**Решение (v0.39.2)**: Требовать непустой `data.b`:
```js
// БЫЛО:
const text = data.b || data.t || ''  // пустой body → берёт title "Макс"

// СТАЛО:
const text = (data.b || '').trim()   // пустой body → пустой text → skip
```

**Ключевой урок**: Notification API используется мессенджерами не только для сообщений, но и для push-sync, status, reconnect. Фильтровать по непустому body — обязательное условие. Title без body = системное уведомление, не сообщение.

---

## 🔴 Фантомные уведомления VK при переключении чатов (v0.39.1 — v0.39.2)

### ❌ MutationObserver + убранный isViewingThisChat = ложные срабатывания

**Симптом**: При переключении чатов в VK появляется ribbon-уведомление с текстом последнего сообщения из нового чата. Никто не писал.

**Причина**: В v0.39.1 убрали `isViewingThisChat` из `handleNewMessage` чтобы ribbon показывался всегда. Но MutationObserver (Path 2 в monitor.preload.js) при ЛЮБОМ изменении DOM (смена чата, прокрутка) вызывает `getLastMessageText()`. Если текст отличается от предыдущего → `new-message` IPC → `handleNewMessage` без подавления → ложное уведомление.

**Решение (v0.39.3 → v0.41.0 → v0.41.1)**: Двойная защита:

**1. App.jsx (renderer)**: Подавлять ВСЕ уведомления когда пользователь смотрит на эту вкладку:
```js
const isViewingThisTab = !document.hidden && activeIdRef.current === messengerId
if (isViewingThisTab) return
```

**2. main.js (backup path)**: Backup path работает ТОЛЬКО при свёрнутом/скрытом окне:
```js
if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized() && mainWindow.isVisible()) return
```

**Почему v0.41.0 не помог**: Исправление в App.jsx подавляло `handleNewMessage`, но тот же `console-message` event ловил **backup path в main.js** напрямую → вызывал `showCustomNotification` минуя `handleNewMessage`. Два listener на один event!

**Ключевой урок**: `console-message` от WebView обрабатывается в ДВУХ местах (renderer + main process). Подавление в одном месте бесполезно если другое место дублирует. Backup path должен работать ТОЛЬКО когда renderer не может обработать (окно свёрнуто/скрыто).

---

## 🔴 Browser API для видимости окна НЕНАДЁЖНЫ в Electron (v0.41.2 → v0.42.0)

### ❌ document.hasFocus() и document.hidden оба ненадёжны

**Симптом**: Ribbon-уведомление появляется при ЧТЕНИИ старых сообщений в Telegram/MAX — пользователь смотрит на мессенджер, но ribbon не подавляется.

**Причина**: Оба browser API ненадёжны в Electron с `<webview>`:
- `document.hasFocus()` → `false` когда фокус внутри WebView (отдельный browsing context)
- `document.hidden` → может быть ненадёжен с `backgroundThrottling: false`

**v0.41.2**: Заменили `!document.hidden` на `hasFocus()` → ложные ribbon при фокусе в webview.
**v0.41.3**: Вернули `!document.hidden` → всё ещё проблемы с Telegram.

**Решение (v0.42.0)**: IPC window-state из main process:
```js
// main.js — BrowserWindow events → IPC
mainWindow.on('focus', () => webContents.send('window-state', { focused: true }))
mainWindow.on('blur', () => webContents.send('window-state', { focused: false }))
// + minimize, restore, show

// App.jsx — ref для хранения состояния
const windowFocusedRef = useRef(true)
useEffect(() => window.api.on('window-state', (s) => { windowFocusedRef.current = s.focused }), [])

// Проверка видимости
const isViewingThisTab = windowFocusedRef.current && activeIdRef.current === messengerId
```

**Ключевой урок**: В Electron НИКОГДА не полагайся на browser API (document.hidden, hasFocus) для определения видимости окна. Используй IPC из main process — BrowserWindow events (focus/blur/minimize/restore) 100% надёжны.

---

## 🔴 Timestamp-only body в Notification API (v0.41.2)

### ❌ MAX шлёт Notification с body = "12:40" (только время)

**Симптом**: Пустое ribbon-уведомление с текстом "12:40" вместо текста сообщения.

**Причина**: MAX при открытии чата / получении уведомления может вызвать `new Notification("", { body: "12:40" })` — body содержит только timestamp. Наши фильтры (`if (!text) return`) пропускают это, т.к. "12:40" непустая строка.

**Решение**: Фильтровать timestamp-only body:
```js
if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanBody)) return null
```

Добавлено в: `showCustomNotification` (main.js) и `__CC_NOTIF__` handler (App.jsx).

**Ключевой урок**: Мессенджеры могут передавать в Notification.body нетекстовые данные: timestamps, пустые строки, zero-width символы. Фильтр body должен проверять не только непустоту, но и осмысленность содержимого.

---

## 🔴 Дублирование ribbon: Notification + ServiceWorker + backup path (v0.43.0 → v0.43.1)

### ❌ 4 ribbon-уведомления на 1 сообщение в Telegram

**Симптом**: Одно сообщение "Хорошо" создаёт 4 ribbon-уведомления. Первые 2 с именем отправителя, нижние 2 без имени и с body "Хорошо15:5715:57".

**Причина**: Telegram вызывает ОБА:
1. `new Notification(title, opts)` — перехватывается нашим override
2. `ServiceWorkerRegistration.showNotification(title, opts)` — тоже перехватывается

Каждый генерирует `__CC_NOTIF__` → 2 уведомления из renderer (App.jsx). Если окно не в фокусе, backup path в main.js тоже обрабатывает эти же 2 `console-message` → ещё 2 ribbon. Итого 4.

ServiceWorker Notification body отличается от обычного — содержит приклеенный timestamp ("Хорошо15:5715:57"), из-за чего дедупликация по `body.slice(0,60)` НЕ срабатывала.

**Решение (v0.43.1)**:
1. **Дедупликация в renderer** (App.jsx): `notifDedupRef` — Map с ключом `messengerId:normalizedBody`, окно 5 сек. Нормализация: убрать все timestamps из body перед сравнением.
2. **Нормализация body в main.js**: Деduп-ключ строится из нормализованного body (без timestamps).
3. **Очистка trailing timestamps**: `showCustomNotification` убирает trailing timestamps из body перед отображением ("Хорошо15:5715:57" → "Хорошо").

```js
// Нормализация для дедуп-ключа:
const normalizedText = text.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').trim()
// Очистка trailing timestamps для отображения:
cleanBody = cleanBody.replace(/(\d{1,2}:\d{2}(:\d{2})?)+\s*$/g, '').trim()
```

**Ключевой урок**: Мессенджеры могут вызывать `Notification` И `ServiceWorker.showNotification` для одного сообщения. ServiceWorker body может отличаться (приклеенные timestamps). Дедупликация ОБЯЗАТЕЛЬНА в обоих path (renderer + main), с нормализацией body (убрать timestamps, zero-width chars) перед построением ключа.

---

## 🔴 Backup path + findMessengerByUrl при 2+ аккаунтах одного мессенджера (v0.44.0 → v0.44.1)

### ❌ Backup path создаёт ribbon для НЕПРАВИЛЬНОГО аккаунта

**Симптом**: При свёрнутом окне — 2 ribbon на 1 сообщение. Первый на правильный Telegram, второй — на другой аккаунт.

**Причина**: `findMessengerByUrl(contents.getURL())` ищет **первый** мессенджер с совпадающим hostname. При 2+ Telegram — ВСЕГДА вернёт первый!

**Решение (v0.44.1)**: Backup path отключён когда renderer жив (`webContents` не destroyed). `backgroundThrottling: false` = renderer работает ВСЕГДА:
```js
if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) return
```

**Ключевой урок**: `findMessengerByUrl` ненадёжен при нескольких аккаунтах одного мессенджера. Renderer определяет messengerId правильно через closure. При `backgroundThrottling: false` backup path избыточен.

---

## 🔴 WebView не загружается при `display: none` и `visibility: hidden` (v0.44.1 → v0.45.0)

### ❌ Мессенджеры не загружаются до перехода на вкладку

**Симптом**: При запуске приложения WebView не загружают страницы. Пользователь должен кликнуть на каждую вкладку чтобы мессенджер начал работать.

**Причина 1 (v0.44.1)**: Неактивные вкладки скрывались через `display: none`:
```jsx
style={{ display: activeId === m.id ? 'block' : 'none' }}
```
В Electron `<webview>` с `display: none` **не начинает загрузку**.

**Причина 2 (v0.44.2)**: `visibility: hidden` тоже может блокировать загрузку webview в Electron — это НЕ гарантированный fix.

**Решение (v0.45.0)**: Все webview остаются `visibility: visible` (по умолчанию), стакаются через `zIndex`. Активный сверху, неактивные перекрыты + `pointer-events: none`:
```jsx
style={{
  zIndex: activeId === m.id ? 2 : 0,
  pointerEvents: activeId === m.id ? 'auto' : 'none',
}}
```
Все webview рендерятся и загружаются с первой секунды. Неактивные просто перекрыты активным.

**Ключевой урок**: В Electron `<webview>` — НЕ используй `display: none` или `visibility: hidden`. Для переключения вкладок: все webview visible + `absolute inset-0` + `zIndex` для активного. `pointer-events: none` для неактивных чтобы клики не проходили.

---

## 🔴 Дёргание первого ribbon-уведомления — двойной setBounds (v0.45.0 → v0.45.1)

### ❌ Первое ribbon дёргается, последующие — нет

**Симптом**: При первом ribbon-уведомлении окно "подпрыгивает" / дёргается при появлении. Второе и далее — плавно.

**Причина**: Двойной `setBounds` за ~16ms:
1. `repositionNotifWin()` в `showCustomNotification()` — вычисляет высоту по формуле (76px * count + gap + padding) → `setBounds` + `showInactive`
2. `notif:resize` из HTML (через `requestAnimationFrame`) — вычисляет высоту по `offsetHeight` → `setBounds`

Два `setBounds` с потенциально разной высотой за 16ms = видимый дёрг на Windows.

Для второго уведомления окно уже видимо, setBounds менее заметен.

**Решение (v0.45.1)**:
1. Убрали `repositionNotifWin()` из `showCustomNotification()` и из IPC handlers
2. Единственный источник позиционирования — `notif:resize` от HTML
3. Кэш bounds: не вызывать setBounds если координаты и высота не изменились
4. Двойной rAF в `reportHeight()` для стабильного layout

**Ключевой урок**: Для прозрачных popup-окон на Windows — ОДИН источник setBounds. Не дублировать позиционирование из main-процесса и из HTML renderer. HTML знает свою высоту точнее (offsetHeight vs расчёт по формуле).

---

## 🟡 Кнопки действий ribbon только для длинных сообщений (v0.44.0 → v0.45.2)

### ❌ Пользователь не видит кнопки "Перейти к чату" / "Прочитано" на коротких сообщениях

**Симптом**: На ribbon с текстом "Чыпр" (4 символа) — видна только маленькая галочка ✓ в углу. Нет кнопок действий, нет подсказки "ещё...".

**Причина**: Кнопки действий (action-row) были в CSS `.notif-item.expanded .action-row { display: flex }`. Expand-клик работал ТОЛЬКО при `hasFullBody` (текст >100 символов). Для коротких → обычный клик → переход к чату → dismiss.

**Решение (v0.45.2)**: Клик на ЛЮБОЕ уведомление раскрывает кнопки действий. Подсказка "▼ действия" для коротких, "▼ ещё..." для длинных.

**Ключевой урок**: UI-элементы управления (кнопки действий) должны быть доступны ВСЕГДА, не зависеть от длины контента. Условие `hasFullBody` влияет только на текст expand, НЕ на доступность кнопок.
