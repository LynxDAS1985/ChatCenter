# Handoff: разбиение `main/native/telegramHandler.js` (Шаг 7/7)

**Дата создания**: 27 апреля 2026 (после v0.87.83)
**Для**: следующего AI-агента / новой сессии
**Версия проекта на момент**: v0.87.83
**Текущий размер файла**: 1260 строк / 1300 потолок (исключение в `KNOWN_EXCEPTIONS`)

---

## 📨 Письмо для следующего ИИ

Привет. Это последний из 7 шагов плана разбиения крупных файлов. Шаги 1-6 завершены — `navigateToChat.js`, `notification.html`, `main.js`, `App.jsx`, `InboxMode.jsx` уже разбиты, исключения для них удалены. Остался один файл — самый рискованный.

Этот handoff — **полная инструкция** как сделать Шаг 7 безопасно за одну сессию. Читай внимательно — внутри line ranges, риски, готовые команды.

---

## 🎯 Цель

Разбить `main/native/telegramHandler.js` (1260 строк) на 6 модулей так чтобы:
1. Главный файл стал тонким роутером (~80-100 строк)
2. Исключение из `KNOWN_EXCEPTIONS` удалось убрать (стандартный лимит 500 для `main/native/*.js`)
3. Telegram **продолжал работать** — авторизация, чаты, сообщения, медиа, FLOOD_WAIT защита

---

## ⚠ ОЧЕНЬ ВАЖНО — главные риски

### Риск 1: общий state клиента

В файле есть **module-level state**:
```js
let client = null              // TelegramClient instance — ИСПОЛЬЗУЕТСЯ ВЕЗДЕ
let getMainWindowFn = null     // для emit() через webContents
let sessionPath = null         // путь к session файлу
let avatarsDir = null          // путь к папке аватарок
let cachePath = null           // путь к JSON-кэшу чатов
let pendingLogin = null        // объект с codeResolve/passwordResolve/reject (auth flow)
let currentAccount = null      // { id, name, phone, username, status }
const chatEntityMap = new Map()  // chatId → entity (для markRead, sendMessage)
const markReadMaxSent = new Map()  // chatId → maxId — guard от уменьшения watermark
const maxOutgoingRead = new Map()  // chatId → maxId
let unreadRescanTimer = null
const lastPerChatSync = new Map()
```

**Нельзя просто скопировать** в каждый модуль — будут разные копии `client`, разные `chatEntityMap`. Telegram сломается.

**Решение**: вынести **весь shared state** в `telegramState.js` модуль. Все остальные модули импортируют оттуда. Node.js модули — singletons, поэтому одна копия на процесс.

```js
// main/native/telegramState.js
export const state = {
  client: null,
  getMainWindowFn: null,
  sessionPath: null,
  avatarsDir: null,
  cachePath: null,
  pendingLogin: null,
  currentAccount: null,
  unreadRescanTimer: null,
}

export const chatEntityMap = new Map()
export const markReadMaxSent = new Map()
export const maxOutgoingRead = new Map()
export const lastPerChatSync = new Map()
```

В коде использование меняется:
- `client = null` → `state.client = null`
- `if (!client)` → `if (!state.client)`
- `client.disconnect()` → `state.client.disconnect()`
- `client.markAsRead(...)` → `state.client.markAsRead(...)`

`chatEntityMap.get(chatId)` остаётся как есть — Map переиспользуется.

### Риск 2: `emit(channel, data)` в конце файла

Внизу файла (строка ~1276) есть функция `emit`:
```js
function emit(channel, data) {
  const win = getMainWindowFn?.()
  if (!win || win.isDestroyed()) return
  try { win.webContents.send(channel, data) } catch(_) {}
}
```

Используется **во всех** IPC handlers и event listeners. **Обязательно** вынести в `telegramState.js` или отдельный `telegramEmit.js`. Иначе разнесённые handlers потеряют доступ.

### Риск 3: FLOOD_WAIT throttle в `loadAvatarsAsync` (v0.87.55)

В `loadAvatarsAsync` есть **критическая** защита от FLOOD_WAIT при массовых запросах аватарок (строки ~1091-1162). Если её сломать — Telegram забанит на 26+ секунд при первом старте.

**Не упрощай и не рефакторь** этот блок. Перенеси **дословно** в `telegramChats.js`. Любая правка → высокий риск.

### Риск 4: `attachMessageListener` (строки 1227-1274)

Это **главный** event listener для входящих сообщений. Привязывается через `client.addEventHandler(NewMessage)`. Логика отправляет в renderer события `tg:new-message`. Если сломать — сообщения перестанут приходить в реальном времени.

**Перенеси дословно** в `telegramMessages.js` (он управляет message flow).

### Риск 5: pre-push hook поймает падение

⭐ Этот проект имеет **pre-push git hook** (v0.87.80) который прогоняет 30 cjs-тестов + vitest **перед** push. Если что-то сломается — push **не уйдёт**. Это страховка.

После каждого выноса — прогоняй `bash scripts/hooks/pre-push` или `npm run pre-push`.

---

## 📋 План разбиения

```
ДО:
main/native/telegramHandler.js  [1260 / 1300 потолок]

ПОСЛЕ:
main/native/
├── telegramHandler.js   [~80]   тонкий роутер: initTelegramHandler + автозапуск
├── telegramState.js     [~50]   общий state клиента + chatEntityMap + markReadMaxSent + emit()
├── telegramErrors.js    [~50]   translateTelegramError + formatSeconds (изолированный)
├── telegramAuth.js      [~250]  startLogin + autoRestoreSession + 4 IPC: login-start/code/password/cancel
├── telegramChats.js     [~360]  IPC: get-chats, get-cached-chats, mark-read, rescan-unread,
│                                set-typing, refresh-avatar, get-pinned, pin, remove-account.
│                                + mapDialog, mapEntities, saveChatsCache,
│                                  loadRestPagesAsync, loadAvatarsAsync (FLOOD_WAIT throttle!),
│                                  fetchAllUnreadUpdates, startUnreadRescan, syncPerChatUnread
├── telegramMessages.js  [~360]  IPC: send-message, edit, delete, forward, send-file,
│                                send-clipboard-image, get-messages
│                                + mapMessage, messagePreview, attachMessageListener (NewMessage)
└── telegramMedia.js     [~150]  IPC: download-media, download-video, cleanup-media,
                                 media-cache-size + extractStrippedThumb
```

Сумма: ~1260 строк → 80+50+50+250+360+360+150 = ~1300 строк (примерно одинаково из-за дублирования импортов и шапок).

Главный файл `telegramHandler.js` ~80 строк — далеко под лимитом 500.

---

## 🗺 Конкретные line ranges (что куда)

### Файл `telegramState.js` (новый)
- Строки 17-27: `API_ID`, `API_HASH`, переменные state, Map'ы
- Строки 1276+: функция `emit`
- Можно сделать константы `API_ID`/`API_HASH` отдельным файлом, но пока пусть тут

### Файл `telegramErrors.js` (новый)
- Строки 32-69: `translateTelegramError` + `formatSeconds`. Полностью изолированы.

### Файл `telegramAuth.js` (новый)
- Строки 129-170: 4 IPC handlers (`tg:login-start/code/password/cancel`)
- Строки 710-826: `startLogin` (большая async функция с client.start)
- Строки 829-862: `autoRestoreSession`
- Также строки 80-127 из `initTelegramHandler` (auto-cleanup tg-media + startRestore логика) — **передвинуть в telegramHandler.js**, не сюда
- **Всё что нужно**: пути `state.sessionPath`, `state.avatarsDir`, `chatEntityMap` (для запоминания при загрузке диалогов после login)

### Файл `telegramMessages.js` (новый)
- Строки 247-262: `tg:send-clipboard-image`
- Строки 264-274: `tg:send-file`
- Строки 276-287: `tg:forward`
- Строки 425-454: `tg:get-messages`
- Строки 455-535: `tg:send-message` (большая, с media+webPage extraction)
- Строки 536-545: `tg:delete-message`
- Строки 546-558: `tg:edit-message`
- Строки 884-895: `extractStrippedThumb` (нужен для mapMessage) — **или** в media.js
- Строки 897-971: `mapMessage`
- Строки 973-1016: `messagePreview`
- Строки 1227-1274: `attachMessageListener` (NewMessage event)

### Файл `telegramChats.js` (новый)
- Строки 172-193: `tg:get-cached-chats`
- Строки 202-244: `tg:mark-read` (с watermark guard!)
- Строки 288-314: `tg:pin`
- Строки 316-326: `tg:rescan-unread`
- Строки 328-343: `tg:get-pinned`
- Строки 345-365: `tg:refresh-avatar`
- Строки 366-378: `tg:set-typing`
- Строки 379-423: `tg:get-chats` (большая)
- Строки 627-660: `tg:remove-account`
- Строки 870-882: `mapEntities`
- Строки 1018-1041: `mapDialog`
- Строки 1043-1061: `saveChatsCache`
- Строки 1063-1089: `loadRestPagesAsync`
- Строки 1091-1162: `loadAvatarsAsync` (**FLOOD_WAIT throttle — НЕ ТРОГАЙ**)
- Строки 1164-1187: `fetchAllUnreadUpdates`
- Строки 1189-1211: `startUnreadRescan`
- Строки 1213-1225: `syncPerChatUnread`

### Файл `telegramMedia.js` (новый)
- Строки 559-597: `tg:download-video`
- Строки 598-625: `tg:download-media`
- Строки 662-695: `tg:cleanup-media`
- Строки 696-708: `tg:media-cache-size`
- Возможно `extractStrippedThumb` — но его использует `mapMessage`. Решай — либо тут с экспортом, либо в `telegramMessages.js`.

### Файл `telegramHandler.js` (тонкий роутер)
- Импорты модулей выше
- `initTelegramHandler({ getMainWindow, userDataPath })` — устанавливает `state.getMainWindowFn`, `state.sessionPath` и т.п.
- Вызывает `initAuthHandlers()`, `initChatsHandlers()`, `initMessagesHandlers()`, `initMediaHandlers()` — каждый модуль экспортирует функцию которая регистрирует IPC и event listeners
- Запускает `setTimeout(startRestore, 1000)` для autoRestoreSession
- Всё. ~80 строк.

---

## 🔧 Порядок работы (рекомендуемый)

1. **Прочитай весь telegramHandler.js целиком** — `Read` без offset (1260 строк ≈ 30-40 КБ).

2. **Создай telegramState.js первым** — это фундамент. Без него остальное не запустится.

3. **Создай telegramErrors.js** — изолированный, простой. Тестовая проверка миграции.

4. **Создай telegramAuth.js** — экспортирует `initAuthHandlers()` и `autoRestoreSession`, использует `state` + `translateTelegramError`.

5. **Создай telegramMessages.js** — тут `mapMessage` нужен в нескольких местах, аккуратно с импортами.

6. **Создай telegramChats.js** — самый большой по логике. Особое внимание на FLOOD_WAIT throttle.

7. **Создай telegramMedia.js** — относительно изолированный.

8. **Перепиши telegramHandler.js** — теперь он тонкий роутер. Все импорты + initTelegramHandler с вызовом всех init-функций.

9. **Удали запись из `KNOWN_EXCEPTIONS`** в `src/__tests__/fileSizeLimits.test.cjs`:
   ```js
   'main/native/telegramHandler.js': {
     ceiling: 1300,
     reason: '...'
   },
   ```

10. **Прогон**:
    ```bash
    bash scripts/hooks/pre-push
    ```
    Если что-то упало — чини. Скорее всего mediaCacheQuota.test.cjs (проверяет логику cleanup) — если нужно, смотри что именно ищет.

11. **Bump до v0.87.84** — package.json, package-lock.json (3 места), CLAUDE.md (3 места), `.memory-bank/features.md` (шапка + Changelog).

12. **Commit + push** — pre-push hook автоматом прогонит всё ещё раз.

---

## 🧪 Команда-чекер тестов

Если хочешь прогнать все cjs-тесты вручную (помимо pre-push):

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

Тесты которые **могут** упасть после разбиения:
- `mediaCacheQuota.test.cjs` — содержит коммент «Повторяем логику из telegramHandler.js cleanup». Проверь что логика очистки соответствует.
- `fileSizeLimits.test.cjs` — точно поймает если `KNOWN_EXCEPTIONS` устарел.
- Остальные — не должны.

---

## ⚠ UI-проверка пользователем (КРИТИЧНО)

После разбиения **обязательно** дай пользователю запустить приложение и проверить **всю** Telegram-функциональность:

| Что | Как проверить |
|---|---|
| 🔐 **Авторизация заново** | Удалить session файл (`%APPDATA%/ЦентрЧатов/tg-session.txt`) → запустить → ввести phone → код → 2FA → войти |
| 🔄 **Auto-restore session** | Перезапустить приложение → должно открыть Telegram без ввода кода |
| 💬 **Список чатов** | Чаты загружаются (cached + свежие через getDialogs) |
| 🖼 **Аватарки** | Подгружаются для всех чатов (FLOOD_WAIT throttle работает!) |
| 📨 **Открытие чата** | Сообщения загружаются |
| ✉️ **Отправка** | Текст, reply, edit, delete, forward, файл, картинка из буфера |
| 🆕 **Входящие в реальном времени** | Кто-то пишет → сообщение появляется (NewMessage event) |
| 👁 **Прочитанность** | Скролл → счётчик уменьшается, watermark guard работает (не растёт обратно) |
| 📌 **Pin/unpin** | Закрепление сообщения |
| 🎬 **Медиа** | Photo open, video play, download |
| 🗑 **Cleanup media** | Не должно быть ошибок при старте (auto cleanup в первые 100мс) |
| 🚪 **Logout** | Удаление аккаунта работает, session файл чистится |

Если хоть что-то сломалось — откат:
```bash
git revert <hash-of-step-7-commit>
git push
```

---

## 📦 Что обновить в Memory Bank

После успешного разбиения:

1. **`features.md`** — запись `### v0.87.84 — Разбиение telegramHandler.js (Шаг 7/7 — финал)` с описанием 6 файлов, line ranges, что вынесено куда.

2. **CLAUDE.md** (3 места):
   - `**Текущая версия**: v0.87.84`
   - `**Версия проекта**: v0.87.84`
   - `**Последнее обновление**: ... v0.87.84: разбиение telegramHandler.js — финал плана разбиений`

3. **`code-limits-status.md`** — обновить таблицу исключений: убрать строку `main/native/telegramHandler.js` из 🔴 Исключения.

4. **`handoff-code-limits.md`** — пометить как **выполнено**: «✅ telegramHandler.js разбит в v0.87.84» в Приоритете 1.

5. **Этот файл** (`handoff-telegram-handler-split.md`) — **переместить в archive/** после успешной UI-проверки (2+ недели стабильности): `archive/2026-XX-handoff-telegram-handler-split.md`. Журнал в `archive/README.md` обновить.

---

## 🆘 Если что-то пойдёт не так

### Симптом: «Telegram не подключается после старта»
- Проверь что `state.client` присваивается в `startLogin` и `autoRestoreSession`.
- Проверь что `state.getMainWindowFn` устанавливается в `initTelegramHandler`.
- Проверь `emit()` функцию — `state.getMainWindowFn?.()` должен возвращать окно.

### Симптом: «Сообщения не приходят»
- `attachMessageListener` должен быть привязан в `telegramMessages.js` ПОСЛЕ успешного `client.start()`. В оригинале — внутри `startLogin` после `await client.start(...)`.

### Симптом: «mark-read не работает»
- `chatEntityMap` должен импортироваться из `telegramState.js`. Проверь что **все** модули используют ОДНУ Map, не свои копии.
- `markReadMaxSent` — то же самое, watermark guard.

### Симптом: «FLOOD_WAIT при первом старте»
- `loadAvatarsAsync` сломан. Проверь что **точно** скопирован throttle (1 запрос в 200мс или сколько там). Не упрощай.

### Симптом: «pre-push не пускает»
- Прочитай вывод — там видно какой тест упал и tail логов.
- Скорее всего `mediaCacheQuota.test.cjs` или `fileSizeLimits.test.cjs`. Чини.

---

## 📊 Ожидаемый результат

После Шага 7:

| Метрика | До | После |
|---|---|---|
| Файлов с `KNOWN_EXCEPTIONS` | 4 | **3** (webviewSetup, messengerConfigs, consoleMessageHandler, dockPinHandlers — но telegramHandler удалён) |
| `telegramHandler.js` строк | 1260/1300 | **~80** / 500 (-1180 строк, **94% запас**) |
| Новых файлов | — | 6 |
| Версий завершено в плане | 5/7 | **7/7 — план закрыт** ✅ |

---

## 🎁 Бонус: можно делать в worktree

Если хочешь снизить риск ещё сильнее — делай в отдельной ветке через worktree:

```bash
git worktree add ../ChatCenter-step7 -b refactor/telegram-handler-split
cd ../ChatCenter-step7
# работай здесь
# после теста и push — мердж в master
```

Так master не пострадает если что-то пойдёт катастрофически не так.

---

**Удачи. Главное — `telegramState.js` первым и `loadAvatarsAsync` дословно.**
