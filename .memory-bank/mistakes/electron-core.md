# Ловушки: Electron core и WebView инфраструктура

**Извлечено из** `common-mistakes.md` 24 апреля 2026 (v0.87.54).
**Темы**: ELECTRON_RUN_AS_NODE, WebView (partition, preload, context isolation), IPC, Настройки (SettingsPanel), AI-панель (AISidebar), Авто-ответ, ИИ-интеграция.

---

## 🔴 КРИТИЧЕСКОЕ: file:/// URL **ЗАБЛОКИРОВАН** в renderer — используй `cc-media://` (v0.87.93)

### Симптом

В DevTools console:
```
Not allowed to load local resource: file:///C:/Users/...
```

В UI — пустой круг вместо аватарки/изображения. В `chatcenter.log` (через `console-message` listener в `windowManager.js`) тоже эта же ошибка с уровнем ERROR.

### Что НЕЛЬЗЯ делать

🔴 **НЕ возвращай `file:///...` URL из main process в renderer**:

```js
// ❌ ПЛОХО — Chromium заблокирует в renderer:
return 'file:///' + encodeURI(filepath.replace(/\\/g, '/'))
```

Причина: renderer работает на `http://localhost:5173` (dev) или `app://` (prod). Из этих origin'ов Chromium **запрещает** загрузку `file:///` ресурсов — это базовая security policy браузера. `webSecurity: false` помогает не во всех случаях и **никогда** не должен ставиться.

### Как НАДО делать

🟢 **Используй кастомный protocol `cc-media://`** — он зарегистрирован в `main/native/ccMediaProtocol.js` (v0.87.21):

```js
// ✅ ХОРОШО — cc-media:// читается через privileged protocol:
return `cc-media://avatars/${filename}`         // для аватарок
return `cc-media://media/${filename}`           // для фото/файлов
return `cc-media://video/${filename}`           // для видео (с Range support)
```

### Что протокол делает

`registerCcMediaScheme()` (вызывается из `main.js`) регистрирует scheme как:
- `standard: true` — нормальный URL парсинг
- `secure: true` — считается безопасным origin
- `bypassCSP: true` — обходит Content Security Policy
- `stream: true` — поддержка HTTP Range (для `<video>` seeking)

`registerCcMediaHandler(userData)` маршрутизирует по hostname:
- `cc-media://avatars/X.jpg` → `<userData>/tg-avatars/X.jpg`
- `cc-media://media/X.jpg` → `<userData>/tg-media/X.jpg`
- `cc-media://video/X.mp4` → `<userData>/tg-media/X.mp4`

Чтение через `net.fetch(pathToFileURL(filePath))` — обходит блокировки renderer и поддерживает Range.

### Как диагностировать (без DevTools)

⚠ **НЕ нужно открывать DevTools** — есть готовая инфраструктура логирования:

1. **Файл лога**: `%APPDATA%/ЦентрЧатов/chatcenter.log`
2. **Все ошибки renderer** с уровнем ≥ 2 (error) перехватываются через `mainWindow.webContents.on('console-message', ...)` в `main/utils/windowManager.js:63` → пишутся в `chatcenter.log` через `console.error` патч в `main/utils/logger.js`.
3. **Свои логи из renderer**: `window.api?.send('app:log', { level: 'INFO', message: '...' })`. Примеры:
   - `src/hooks/useAppBootstrap.js:25`
   - `src/native/utils/scrollDiagnostics.js:29`
4. **`console.log()` в renderer (info)** не попадает в файл — только в DevTools. Для диагностики используй `app:log` или `console.error` (он перехватывается).

**Правильная команда для проверки**:
```bash
grep -i "not allowed\|file:///" "$APPDATA/ЦентрЧатов/chatcenter.log" | tail -10
```

### Реальный случай (v0.87.91 → v0.87.93)

1. **v0.87.91**: добавил аватарку пользователя через `client.downloadProfilePhoto(me)` → сохранил в `tg-avatars/me_<id>.jpg` → вернул `file:///` URL.
2. Backend: ✅ файл скачан (5318 bytes из лога), URL передан через IPC.
3. UI: ❌ пустой круг — Chromium блокирует `file:///` в renderer.
4. **v0.87.92**: добавил `console.log` в `nativeStore.js` — попросил пользователя открыть DevTools. **Зря** — у проекта уже есть свой логер через `chatcenter.log`.
5. **v0.87.93**: заменил на `cc-media://avatars/me_<id>.jpg` → заработало.

Между шагами 4 и 5 пользователь справедливо матерился.

### Чек-лист для будущих фич с локальными файлами

- [ ] Файл сохраняется в `<userData>/tg-avatars/`, `tg-media/` или другой подпапке
- [ ] Возвращаемый URL **не** содержит `file:///`
- [ ] Возвращаемый URL — `cc-media://<kind>/<filename>` (kind: `avatars`/`media`/`video`)
- [ ] Если нужен новый kind (например `cc-media://stickers/`) — добавить в `registerCcMediaHandler` switch.
- [ ] **НЕ** добавлять `console.log` в renderer для диагностики — использовать `window.api.send('app:log', ...)` чтобы попадало в `chatcenter.log`.

### Связанные файлы

- `main/native/ccMediaProtocol.js` — реализация протокола (~70 строк)
- `main/main.js` (где-то рядом со startup) — `registerCcMediaScheme()` + `registerCcMediaHandler(userDataPath)`
- `main/native/telegramChats.js:61,233` — пример использования для аватарок чатов (но там пока `file:///` — TODO мигрировать)
- `main/native/telegramAuth.js loadOwnAvatar()` — использует `cc-media://` (v0.87.93)
- `main/utils/windowManager.js:63` — perехват console-message (откуда брать ошибки)
- `main/utils/logger.js:45` — `console.error` → `chatcenter.log`

---

## 🔴 КРИТИЧЕСКОЕ: после разбиения файла прогнать ВСЕ cjs-тесты, не только vitest (v0.87.79)

**Симптом**: разбили большой файл на модули, локально `npm run lint` + `npm run test:vitest` зелёные → push → GitHub Actions CI падает на одном из 30 cjs-тестов которые проверяют **паттерны grep'ом** в исходном файле.

**Реальный случай**:
- v0.87.77 разбил `src/utils/navigateToChat.js` (300 → 22 строки) на router + 5 файлов в `navigators/`
- Я обновил `navigateToChat.test.cjs` (склеил router + navigators/) — этот тест я знал и проверил
- НО `integration.test.cjs:285-292` тоже читает `navigateToChat.js` и грепает `.chatlist-chat`, `ConvoListItem` — **второй такой же тест**, я о нём не вспомнил
- v0.87.78 (notification.html разбит) тоже прошёл лимиты, но CI продолжал падать с тем же v0.87.77 фейлом
- v0.87.79 — починил, склеив `navigateToChat.js` со всеми `navigators/*.js` в `integration.test.cjs`

**Почему `npm test` локально нельзя**: цепочка `npm test` в проекте включает `electron-vite build && node e2e/app.e2e.cjs && node e2e/ui.e2e.cjs` — последние два запускают **Electron**, что нарушает критический запрет CLAUDE.md.

**Правило**: при **разбиении файла на модули** или **переименовании файла** обязательно прогнать ВСЕ cjs-тесты которые могут читать этот файл grep'ом:

```bash
for t in isSpamText navigateToChat messengerConfigs monitorPreload \
         overlayIcon handleNewMessage messageProcessing mainProcess \
         appStructure projectHealth aiProviders consoleMessageParser \
         ipcChannels fileSizeLimits memoryBankSizeLimits featuresReferences \
         memoryLeaks notifHooks componentScope hookOrder mainImports \
         mainRuntime mediaCacheQuota unitRuntime buildContract storageErrors \
         aiErrors extractedModules smokeTest integration; do
  node src/__tests__/$t.test.cjs > /dev/null 2>&1 || echo "❌ $t"
done
```

Без этого CI **обязательно** упадёт после крупного разбиения, и придётся делать второй коммит-фикс.

**Какие тесты особенно опасны** (содержат `fs.readFileSync(...).includes(...)`):
- `integration.test.cjs` — проверяет цепочки между файлами через grep
- `appStructure.test.cjs` — структура проекта
- `componentScope.test.cjs` — вложенность функций
- `extractedModules.test.cjs` — что именно экспортируется
- `mainImports.test.cjs` — какие импорты в main.js
- `appStructure`, `featuresReferences` — пути к файлам

При разбиении файла X — ищи `readFileSync.*X` по всем тестам:

```bash
grep -rn "readFileSync.*<имя_файла>" src/__tests__/
```

---

## 🔴 КРИТИЧЕСКОЕ: FLOOD_WAIT от массовых GramJS RPC вызовов (v0.87.55)

**Симптом**: Приложение бан Telegram сервером на 26 секунд, все новые чаты без аватарок, в логе `FLOOD_WAIT_X`.

**Причина**: `loadAvatarsAsync` в [main/native/telegramHandler.js](../../main/native/telegramHandler.js) шёл циклом по 196 диалогам и для каждого делал `GetFullChannel` / `GetFullUser` **без задержек**. Telegram терпит ~10 RPS, а мы давали 50+.

**ПРАВИЛО**: Любой цикл по большому списку, делающий MTProto-запросы — **ОБЯЗАН** быть throttled.
- Минимум 200мс между запросами (= 5 RPS)
- Ловить FLOOD_WAIT: `message.match(/FLOOD_WAIT.*?(\d+)/)` — парсить секунды, ждать, ретрай
- Считать `floodWaits` в stats, логировать

**Шаблон throttle helper** (из v0.87.55):
```js
let lastReqTs = 0
const THROTTLE_MS = 200
async function throttledInvoke(reqFactory) {
  const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastReqTs))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastReqTs = Date.now()
  try { return await client.invoke(reqFactory()) }
  catch (e) {
    const m = String(e?.message || '').match(/FLOOD_WAIT.*?(\d+)/)
    if (m) {
      const s = Number(m[1]) || 30
      await new Promise(r => setTimeout(r, (s + 1) * 1000))
      lastReqTs = Date.now()
      return await client.invoke(reqFactory())
    }
    throw e
  }
}
```

**Места где ещё есть потенциальный FLOOD_WAIT** (на будущее — проверить при похожих симптомах):
- `loadAvatarsAsync` — ✅ throttled v0.87.55
- `tg:get-messages` handler делает `GetFullUser/GetFullChannel` — per-request из UI, обычно медленный, не требует throttle
- `fetchAllUnreadUpdates` с `GetPeerDialogs` — уже идёт пачками, риск низкий

---

## 🟡 ВАЖНОЕ: console-message Electron 41+ deprecated позиционные поля (v0.87.55)

**Симптом**: в DevTools main-процесса warning про `'message'/'level'/'sourceId' are deprecated on console-message Event`.

**Причина**: в Electron 41 старый позиционный API заменён на объект `event.details`. Старый ещё работает, но deprecated.

**Старый API** (числа): `e.message, e.level (0-3), e.sourceId, e.lineNumber`.
**Новый API** (строки): `e.details.{message, level: 'info'|'warning'|'error'|'verbose', sourceId, lineNumber}`.

**ПРАВИЛО (backward-compatible)**:
```js
const d = e.details || e
const msg = d.message ?? e.message
const rawLevel = d.level ?? e.level
const lvl = typeof rawLevel === 'number' ? rawLevel
  : rawLevel === 'warning' ? 1 : rawLevel === 'error' ? 2
  : rawLevel === 'info' ? 0 : rawLevel === 'verbose' ? 3 : -1
```

**Где применено (v0.87.55)**: [src/utils/consoleMessageHandler.js](../../src/utils/consoleMessageHandler.js).

**Где ещё надо мигрировать** (на будущее, не критично — старый API работает):
- `main/handlers/videoPlayerHandler.js`
- `main/handlers/backupNotifHandler.js`
- `main/preloads/monitor.preload.cjs`
- `main/utils/windowManager.js`
- `src/utils/webviewSetup.js`

---

## 🟡 ВАЖНОЕ: отправка сообщений должна логироваться и показывать ошибки юзеру (v0.87.55)

**Симптом**: юзер вводит текст в поле → нажимает «Отпр.» → ничего не происходит. В логах пусто.

**Причина**: `handleReplySend` в InboxMode и `tg:send-message` handler в main — **оба** имели `catch { return { ok: false, error } }` без логов, а UI игнорировал `result.error`.

**ПРАВИЛО**: Любой IPC handler для пользовательских действий **обязан**:
1. Логировать старт операции (`log('send-message START: ...')`)
2. Логировать успех с деталями (`log('send-message OK: messageId=X')`)
3. Логировать ошибку с типом и сообщением (`log('ERROR: ... (' + e.constructor?.name + ')')`)

И UI-сторона должна:
1. Проверять `result.ok` и показывать toast на ошибку
2. Возвращать текст в поле ввода при неудаче (чтобы не терялся)
3. Логировать собственные события (`send-start`, `send-result`, `send-throw`)

Это гарантирует что "молчаливых" багов не будет — либо успех, либо видимая причина.

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

### ❌ Аватарки Telegram не загружаются в ribbon (downloadIcon без cookies)

**Симптом**: Telegram передаёт `opts.icon` URL в Notification API, но аватарка не появляется в ribbon — показывается emoji вместо фото.

**Причина**: `downloadIcon()` в main.js делает plain HTTP GET без cookies/session. Telegram требует авторизацию для загрузки аватарок → 403/302 → `resolve(null)` → emoji fallback.

**Решение (v0.48.0)**: Конвертировать аватарку в `data:` URL прямо в WebView (injection script). `toDataUrl(url, cb)` создаёт `Image` элемент с `crossOrigin='anonymous'`, рисует на canvas, получает `canvas.toDataURL('image/png')`. Так аватарка скачивается с cookies WebView сессии. Data URL передаётся через `__CC_NOTIF__` → `extra.iconDataUrl` → напрямую в ribbon HTML без скачивания в main process.

**Ключевой урок**: Ресурсы мессенджеров (аватарки, медиа) требуют cookies сессии. Скачивание из main process (без cookies) не работает. Конвертировать в data URL ВНУТРИ WebView — единственный надёжный подход.

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
