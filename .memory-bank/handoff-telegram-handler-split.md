# 📋 Handoff: разбиение `main/native/telegramHandler.js` (Шаг 7/7 — финал плана)

**Дата создания**: 27 апреля 2026 (после v0.87.84)
**Для**: следующего AI-агента / новой сессии Claude Code
**Версия проекта на момент**: v0.87.84
**Текущий размер файла**: 1260 строк / потолок 1300 (KNOWN_EXCEPTIONS — у файла повышенный лимит)
**Стандартный лимит для `main/native/*.js`**: 500 строк

---

## 📨 Письмо для следующего ИИ

Привет. Это **последний из 7 шагов плана разбиения** крупных файлов проекта ChatCenter.

**Что уже сделано** (Шаги 1-6, версии v0.87.76 → v0.87.83):
- ✅ Архивация `features.md` (97→45 КБ)
- ✅ Разбиение `navigateToChat.js` (300→22 строки) — на router + 5 navigators/
- ✅ Разбиение `notification.html` (902→12 строк) — на html/css/js
- ✅ Pre-push git hook (защита от красного CI)
- ✅ Разбиение `main.js` (598→483 строк) — вынесены 3 utils
- ✅ Разбиение `App.jsx` (599→475 строк) — вынесены 3 hooks
- ✅ Разбиение `InboxMode.jsx` (789→566 строк, исключение удалено) — 4 файла

**Что осталось** — Шаг 7: **`telegramHandler.js`** (1260 строк) → ~80 строк + 6 модулей.

Это **самый рискованный** файл всего плана. Если сломаешь — Telegram **полностью отвалится**: не подключится, не покажет чаты, не отправит сообщения. Пользователь не сможет работать.

⚠ **Главное правило**: **читай этот handoff целиком** перед тем как что-то делать. Здесь все ловушки, line ranges, риски, проверки. Если пропустишь раздел — гарантировано что-то сломается.

---

## 🧠 Что нужно знать перед началом

### Что такое `telegramHandler.js`

Это **главный мост** между Electron main process и GramJS (библиотекой для работы с Telegram MTProto). Файл делает:
1. Создаёт `TelegramClient` экземпляр
2. Авторизует пользователя (phone → SMS-код → 2FA)
3. Сохраняет/восстанавливает session между запусками
4. Получает список чатов (диалогов)
5. Загружает сообщения, отправляет, редактирует, удаляет, пересылает
6. Слушает входящие сообщения в реальном времени (NewMessage event)
7. Скачивает медиа (фото, видео, файлы) с кэшированием
8. Помечает прочитанным (с защитой от уменьшения watermark)
9. Управляет аватарками (с FLOOD_WAIT throttle)
10. Очищает старые медиа (LRU квота 2 ГБ + 30 дней)

Все операции доступны через **IPC-каналы** (`tg:login-start`, `tg:get-chats`, `tg:send-message` и т.д.). Renderer (UI) вызывает их через `window.api.invoke(...)`.

### Что такое Memory Bank проекта

Папка `.memory-bank/` — единственный источник истины для проекта. Там лежат:
- `architecture.md` — как устроен проект
- `coding-rules.md` — правила кода
- `workflow.md` — рабочий процесс
- `features.md` — Changelog (что когда сделано)
- `mistakes/` — ловушки и как их избежать
- `archive/` — устаревшее (НЕ читать без явной просьбы)
- Этот handoff — `handoff-telegram-handler-split.md`

⚠ Перед началом работы прочитай `CLAUDE.md` и `.memory-bank/README.md` — там правила проекта.

### Что нельзя делать (запреты из CLAUDE.md)

🔴 **НИКОГДА**:
- Не запускай приложение сам (`npm start`, `npm run dev`, `npm test`) — оно требует Electron
- Не делай `npm install` — `postinstall` перезаписывает git hooks
- Не делай `git push --force`, `git reset --hard`, `git revert` без явного разрешения
- Не используй `git add -A` — добавляй файлы по именам
- Не делай `git commit --no-verify` — pre-commit hook это защита

🟢 **МОЖНО**:
- `npm run lint` — проверка ESLint
- `npm run test:vitest` — vitest без Electron
- `npm run pre-push` — прогон 30 cjs-тестов + vitest (без push)
- `bash scripts/hooks/pre-push` — то же самое
- `git status`, `git diff`, `git log` — только чтение

### Pre-push git hook = ваш главный союзник

Если что-то сломается — **push не уйдёт**. Hook прогоняет все 30 cjs-тестов + vitest перед каждым push. Если тест падает — push блокируется + видно какой тест и tail логов.

⭐ Это значит ты можешь **смело** пробовать — если ошибся, hook поймает локально, не на GitHub.

---

## 🎯 Цель Шага 7

| Метрика | До (сейчас) | После (цель) |
|---|---|---|
| `telegramHandler.js` строк | 1260 | **~80** |
| Лимит | 1300 (исключение) | **500** (стандартный) |
| Запас до лимита | 40 строк | **~420 строк** |
| Запись в `KNOWN_EXCEPTIONS` | есть | **удалена** |
| Файлов в `main/native/` для Telegram | 1 | 7 (handler + 6 модулей) |

После успеха — **план разбиения 7/7 закрыт**. Все файлы под стандартными лимитами без исключений (кроме нескольких небольших low-priority файлов).

---

## 🏗 План разбиения — 6 новых файлов + тонкий handler

```
ДО:
main/native/telegramHandler.js  [1260 / 1300]

ПОСЛЕ:
main/native/
├── telegramHandler.js   [~80]    тонкий роутер: initTelegramHandler + автозапуск
├── telegramState.js     [~50]    общий state клиента + emit() + Map'ы
├── telegramErrors.js    [~50]    translateTelegramError + formatSeconds
├── telegramAuth.js      [~250]   startLogin + autoRestoreSession + 4 IPC handlers
├── telegramChats.js     [~360]   IPC handlers по чатам + mapDialog + FLOOD_WAIT throttle
├── telegramMessages.js  [~360]   IPC handlers по сообщениям + mapMessage + NewMessage event
└── telegramMedia.js     [~150]   IPC handlers по медиа + cleanup + extractStrippedThumb
```

Сумма ~1300 строк (примерно так же из-за дублирования импортов и шапок). Главный файл `telegramHandler.js` — **80 строк**, далеко под лимитом 500.

### Зачем 6 файлов, а не 5 или 4

В предыдущем handoff (`handoff-code-limits.md`) рекомендовали 5 файлов. Я расширил до 6 + state, потому что:

1. **`telegramState.js` обязателен** — иначе разбиение не работает (см. Риск 1 ниже).
2. **`telegramErrors.js` отдельно** — `translateTelegramError` совершенно изолированная функция (54 строки regex-маппингов). Удобно тестировать отдельно.

Можно объединить state + errors → но они логически разные. Лучше отдельно.

---

## ⚠ 5 ГЛАВНЫХ РИСКОВ — читай внимательно

### 🔴 Риск 1: общий state клиента (если облажаться — всё развалится)

В `telegramHandler.js` есть **module-level state** (на уровне модуля Node.js):

```js
// строки 17-27 текущего файла
const API_ID = 8392940
const API_HASH = '33a9605b6f86a176e240cc141e864bf5'

let client = null              // TelegramClient instance — ИСПОЛЬЗУЕТСЯ ВЕЗДЕ
let getMainWindowFn = null     // для emit() через webContents
let sessionPath = null         // путь к session файлу
let avatarsDir = null          // путь к папке аватарок
let cachePath = null           // путь к JSON-кэшу чатов
let pendingLogin = null        // объект с codeResolve/passwordResolve/reject (auth flow)
let currentAccount = null      // { id, name, phone, username, status }
const chatEntityMap = new Map()   // chatId → entity (для markRead, sendMessage)
```

И ниже:

```js
// строки 201, 865
const markReadMaxSent = new Map()   // chatId → maxId — guard от уменьшения watermark
const maxOutgoingRead = new Map()   // chatId → maxId

// строки 1164, 1213
let unreadRescanTimer = null
const lastPerChatSync = new Map()
```

**Опасный сценарий**: если просто скопировать `let client = null` в каждый из 6 модулей — у каждого будет **СВОЯ копия**. Модуль `telegramAuth.js` создаст client, а `telegramMessages.js` его не увидит. Telegram сломается.

**ПРАВИЛЬНОЕ РЕШЕНИЕ — singleton state модуль**:

Создай `main/native/telegramState.js`:

```js
// Общий state Telegram-клиента. Singleton — Node.js модули кэшируются,
// поэтому один объект на процесс. Все остальные модули telegram*.js
// импортируют отсюда state и используют через state.client, state.sessionPath и т.п.

import { Api } from 'telegram'

// API credentials — ChatCenter (Demo33) app на my.telegram.org
export const API_ID = 8392940
export const API_HASH = '33a9605b6f86a176e240cc141e864bf5'

// Изменяемый state — через объект чтобы все модули видели те же значения
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

// Map'ы изменяемые сами по себе — изменение видно во всех импортирующих модулях
export const chatEntityMap = new Map()       // chatId → entity (markRead, send, forward)
export const markReadMaxSent = new Map()     // chatId → maxId (watermark guard)
export const maxOutgoingRead = new Map()     // chatId → maxId
export const lastPerChatSync = new Map()     // chatId → timestamp

// Логирование
export const log = (msg) => { try { console.log('[tg]', msg) } catch(_) {} }

// Emit события в renderer (главное окно)
export function emit(channel, data) {
  const win = state.getMainWindowFn?.()
  if (!win || win.isDestroyed()) return
  try { win.webContents.send(channel, data) } catch(_) {}
}

// Небольшой хелпер — для Api.* (если используется)
export { Api }
```

В **каждом** другом telegram*.js модуле в начале:

```js
import { state, chatEntityMap, markReadMaxSent, log, emit, API_ID, API_HASH } from './telegramState.js'
```

Использование:
```js
// БЫЛО:        if (!client) return { ok: false }
// СТАЛО:       if (!state.client) return { ok: false }

// БЫЛО:        client = new TelegramClient(...)
// СТАЛО:       state.client = new TelegramClient(...)

// БЫЛО:        chatEntityMap.get(chatId)
// СТАЛО:       chatEntityMap.get(chatId)   ← без изменений! Map переиспользуется

// БЫЛО:        emit('tg:login-step', {...})
// СТАЛО:       emit('tg:login-step', {...})  ← без изменений если импортирован
```

⚠ **Важно**: НЕ используй `let client = state.client` в начале функции — это создаст локальную переменную, и потом `client = newValue` НЕ обновит `state.client`. Всегда работай напрямую через `state.client = ...`.

### 🔴 Риск 2: emit() без state.getMainWindowFn ничего не сделает

Функция `emit(channel, data)` отправляет события в renderer:

```js
export function emit(channel, data) {
  const win = state.getMainWindowFn?.()
  if (!win || win.isDestroyed()) return
  try { win.webContents.send(channel, data) } catch(_) {}
}
```

Используется во **всех** файлах: `tg:login-step`, `tg:account-update`, `tg:chats`, `tg:messages`, `tg:new-message`, `tg:chat-unread-sync`, `tg:unread-bulk-sync`.

⚠ **Установка `state.getMainWindowFn`** происходит в `initTelegramHandler` (строка 71-72 текущего файла). Это **ПЕРВОЕ** что должен сделать `telegramHandler.js`:

```js
export function initTelegramHandler({ getMainWindow, userDataPath }) {
  state.getMainWindowFn = getMainWindow
  state.sessionPath = path.join(userDataPath, 'tg-session.txt')
  state.avatarsDir = path.join(userDataPath, 'tg-avatars')
  state.cachePath = path.join(userDataPath, 'tg-cache.json')
  // ... остальное
}
```

Без установки — все emit() будут тихо пропускать (return на проверке). UI не получит никаких событий и подумает что Telegram сломался.

### 🔴 Риск 3: FLOOD_WAIT throttle в `loadAvatarsAsync` — НЕ УПРОЩАТЬ

В файле есть **критическая защита** от FLOOD_WAIT при массовых запросах аватарок (v0.87.55, строки **~1091-1162**).

**Что было до v0.87.55**: первый старт после новой авторизации → одновременная загрузка 100 аватарок → Telegram банил на 26 секунд.

**Решение v0.87.55** (та функция в файле):
```js
async function loadAvatarsAsync(dialogs) {
  // throttle 200мс между запросами
  for (const d of dialogs) {
    if (...) {
      try { await client.downloadProfilePhoto(...) }
      catch (e) { if (FLOOD_WAIT) await sleep(...) }
      await sleep(200)  // throttle между запросами
    }
  }
}
```

⚠ **Не упрощай, не оптимизируй, не «улучшай»** этот блок при разбиении. Скопируй **дословно** в `telegramChats.js`. Любая правка → ловушка вернётся.

См. также `mistakes/electron-core.md` → секция «🔴 КРИТИЧЕСКОЕ: FLOOD_WAIT от массовых GramJS RPC вызовов (v0.87.55)».

### 🔴 Риск 4: `attachMessageListener` (строки ~1227-1274) — single source of truth для входящих

Это **главный** event listener для входящих сообщений Telegram:

```js
function attachMessageListener() {
  state.client.addEventHandler(async (event) => {
    const m = event.message
    // ... парсинг типа сообщения, mapping, emit('tg:new-message')
  }, new NewMessage({}))
}
```

Привязывается **один раз** после успешного `client.start()`. Если сломать или забыть привязать — **никакие входящие сообщения не будут приходить в реальном времени**. Это самая частая регрессия при рефакторинге.

⚠ **Что делать**:
1. Перенеси функцию **дословно** в `telegramMessages.js` (он управляет message flow).
2. Экспортируй: `export function attachMessageListener() { ... }`.
3. В `telegramAuth.js` после успешной авторизации (внутри `startLogin` после `await client.start(...)` SUCCESS блока) — импортируй и вызови:
   ```js
   import { attachMessageListener } from './telegramMessages.js'
   // ...
   attachMessageListener()
   ```
4. То же самое в `autoRestoreSession` — после успешного восстановления.

### 🔴 Риск 5: watermark guard в `tg:mark-read` (строки 196-244)

```js
const markReadMaxSent = new Map()  // chatId → максимальный отправленный maxId
ipcMain.handle('tg:mark-read', async (_, { chatId, maxId }) => {
  // ...
  const prev = markReadMaxSent.get(chatId) || 0
  if (numMaxId > 0 && numMaxId < prev) {
    log(`mark-read SKIP: chat=${chatId} maxId=${numMaxId} < prev=${prev}`)
    return { ok: true, skipped: true }
  }
  if (numMaxId > prev) markReadMaxSent.set(chatId, numMaxId)
  // ...
})
```

**Что это**: GramJS `markAsRead(entity, maxId)` ставит «прочитано до этого msgId». Если отправить **меньший** maxId чем уже отправляли — Telegram **сбрасывает watermark назад** → все сообщения после становятся «непрочитанными» → бейдж растёт.

Это случалось при скролле к старым сообщениям (IntersectionObserver видел старые msg → readByVisibility → markRead с маленьким maxId).

⚠ **При разбиении**: `markReadMaxSent` Map должна быть **импортирована** из `telegramState.js` (как описано в Риске 1). Проверь что в `telegramChats.js` ты импортируешь её, не создаёшь новую копию.

---

## 🗺 Конкретные line ranges — что куда

Используй текущую нумерацию строк `main/native/telegramHandler.js` (1260 строк).

### Файл 1: `telegramState.js` — ~50 строк

**Из текущего файла**:
- Строки 7-14 — импорты (`Api` нужен)
- Строки 17-18 — `API_ID`, `API_HASH`
- Строки 20-27 — все `let client`/etc + `chatEntityMap`
- Строки 29 — `log()` функция
- Строка 201 — `markReadMaxSent` Map
- Строка 865 — `maxOutgoingRead` Map
- Строки 1164 — `unreadRescanTimer`
- Строки 1213 — `lastPerChatSync` Map
- Строки 1276+ — функция `emit()`

**Скелет** (см. полный пример в Риске 1 выше):
```js
import { Api } from 'telegram'
export const API_ID = 8392940
export const API_HASH = '33a9605b6f86a176e240cc141e864bf5'
export const state = { client: null, getMainWindowFn: null, /* ... */ }
export const chatEntityMap = new Map()
export const markReadMaxSent = new Map()
export const maxOutgoingRead = new Map()
export const lastPerChatSync = new Map()
export const log = (msg) => { /* ... */ }
export function emit(channel, data) { /* ... */ }
export { Api }
```

### Файл 2: `telegramErrors.js` — ~50 строк

**Из текущего файла**:
- Строки 32-69 — `translateTelegramError` + `formatSeconds`

Полностью изолировано — ничего извне не нужно.

```js
// telegramErrors.js
export function translateTelegramError(raw) { /* строки 32-63 */ }
function formatSeconds(sec) { /* строки 65-69 */ }
```

### Файл 3: `telegramAuth.js` — ~250 строк

**Из текущего файла**:
- Строки 129-141 — IPC `tg:login-start`
- Строки 143-152 — IPC `tg:login-code`
- Строки 154-161 — IPC `tg:login-password`
- Строки 163-170 — IPC `tg:login-cancel`
- Строки 710-826 — `async function startLogin(phone)` (большая, ~117 строк)
- Строки 829-862 — `async function autoRestoreSession()` (~34 строки)

**Импортирует**:
- `state, chatEntityMap, log, emit, API_ID, API_HASH` из `./telegramState.js`
- `translateTelegramError` из `./telegramErrors.js`
- `attachMessageListener` из `./telegramMessages.js` ← **ВАЖНО!** Вызывается после успеха.
- `mapDialog`, `mapEntities`, `saveChatsCache`, `loadAvatarsAsync`, `startUnreadRescan` из `./telegramChats.js` (используются в `startLogin` и `autoRestoreSession` для первичной загрузки чатов)

**Экспортирует**:
- `function initAuthHandlers()` — регистрирует 4 IPC
- `async function autoRestoreSession()` — вызывается из главного `telegramHandler.js`

```js
// telegramAuth.js
import { ipcMain } from 'electron'
import fs from 'node:fs'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { state, chatEntityMap, log, emit, API_ID, API_HASH } from './telegramState.js'
import { translateTelegramError } from './telegramErrors.js'
// ленивые импорты — чтобы не было circular import
async function getMessagesModule() { return import('./telegramMessages.js') }
async function getChatsModule() { return import('./telegramChats.js') }

export function initAuthHandlers() {
  ipcMain.handle('tg:login-start', async (_, { phone }) => { /* ... */ })
  ipcMain.handle('tg:login-code', async (_, { code }) => { /* ... */ })
  ipcMain.handle('tg:login-password', async (_, { password }) => { /* ... */ })
  ipcMain.handle('tg:login-cancel', async () => { /* ... */ })
}

async function startLogin(phone) { /* ... */ }
export async function autoRestoreSession() { /* ... */ }
```

⚠ **Циклические импорты**: `telegramAuth.js` нужен `telegramMessages.js` (для `attachMessageListener`) и `telegramChats.js` (для `loadAvatarsAsync` и т.п.). А `telegramMessages.js` и `telegramChats.js` могут не нуждаться в `telegramAuth.js` — тогда нет цикла, можно импортировать обычно. Если цикл появится — используй динамический импорт `await import('./telegramMessages.js')` внутри функций.

### Файл 4: `telegramChats.js` — ~360 строк

**Из текущего файла**:
- Строки 172-193 — IPC `tg:get-cached-chats`
- Строки 202-244 — IPC `tg:mark-read` (с watermark guard!)
- Строки 288-314 — IPC `tg:pin`
- Строки 316-326 — IPC `tg:rescan-unread`
- Строки 328-343 — IPC `tg:get-pinned`
- Строки 345-365 — IPC `tg:refresh-avatar`
- Строки 366-378 — IPC `tg:set-typing`
- Строки 379-423 — IPC `tg:get-chats` (большая)
- Строки 627-660 — IPC `tg:remove-account`
- Строки 870-882 — `function mapEntities`
- Строки 1018-1041 — `function mapDialog`
- Строки 1043-1061 — `function saveChatsCache`
- Строки 1063-1089 — `async function loadRestPagesAsync`
- Строки 1091-1162 — `async function loadAvatarsAsync` (**FLOOD_WAIT throttle — ДОСЛОВНО**)
- Строки 1164-1187 — `async function fetchAllUnreadUpdates`
- Строки 1189-1211 — `function startUnreadRescan`
- Строки 1213-1225 — `async function syncPerChatUnread`

**Импортирует**:
- `state, chatEntityMap, markReadMaxSent, log, emit, Api` из `./telegramState.js`

**Экспортирует**:
- `function initChatsHandlers()` — регистрирует все IPC handlers
- `function mapDialog`, `mapEntities`, `saveChatsCache`, `loadAvatarsAsync`, `startUnreadRescan`, `loadRestPagesAsync` — нужны другим модулям

### Файл 5: `telegramMessages.js` — ~360 строк

**Из текущего файла**:
- Строки 247-262 — IPC `tg:send-clipboard-image`
- Строки 264-274 — IPC `tg:send-file`
- Строки 276-287 — IPC `tg:forward`
- Строки 425-454 — IPC `tg:get-messages`
- Строки 455-535 — IPC `tg:send-message` (большая, с media+webPage extraction)
- Строки 536-545 — IPC `tg:delete-message`
- Строки 546-558 — IPC `tg:edit-message`
- Строки 884-895 — `function extractStrippedThumb` (используется в `mapMessage`)
- Строки 897-971 — `function mapMessage` (большая)
- Строки 973-1016 — `function messagePreview`
- Строки 1227-1274 — `function attachMessageListener` (NewMessage event!)

**Импортирует**:
- `state, chatEntityMap, log, emit, Api` из `./telegramState.js`
- `NewMessage` из `'telegram/events/index.js'`

**Экспортирует**:
- `function initMessagesHandlers()` — регистрирует все IPC handlers
- `function attachMessageListener()` — вызывается из `telegramAuth.js` после успешной авторизации
- `function mapMessage`, `messagePreview` — могут понадобиться где-то ещё

### Файл 6: `telegramMedia.js` — ~150 строк

**Из текущего файла**:
- Строки 559-597 — IPC `tg:download-video`
- Строки 598-625 — IPC `tg:download-media`
- Строки 662-695 — IPC `tg:cleanup-media`
- Строки 696-708 — IPC `tg:media-cache-size`

**Импортирует**:
- `state, log` из `./telegramState.js`

**Экспортирует**:
- `function initMediaHandlers()` — регистрирует IPC handlers

### Файл 7: `telegramHandler.js` (переписан) — ~80 строк

**Тонкий роутер**. Импортирует все 6 модулей выше, делает init.

```js
// v0.87.85: тонкий роутер. Логика разнесена по telegram*.js модулям.
import path from 'node:path'
import fs from 'node:fs'
import { state, log } from './telegramState.js'
import { initAuthHandlers, autoRestoreSession } from './telegramAuth.js'
import { initChatsHandlers } from './telegramChats.js'
import { initMessagesHandlers } from './telegramMessages.js'
import { initMediaHandlers } from './telegramMedia.js'

export function initTelegramHandler({ getMainWindow, userDataPath }) {
  state.getMainWindowFn = getMainWindow
  state.sessionPath = path.join(userDataPath, 'tg-session.txt')
  state.avatarsDir = path.join(userDataPath, 'tg-avatars')
  state.cachePath = path.join(userDataPath, 'tg-cache.json')
  try { fs.mkdirSync(state.avatarsDir, { recursive: true }) } catch(_) {}
  log(`init, session=${state.sessionPath}, avatars=${state.avatarsDir}, cache=${state.cachePath}`)

  // v0.87.27 / v0.87.35: авто-очистка старых медиа при старте
  // (вынесена в initMediaHandlers? нет — это инициализация при старте, не IPC)
  // Скопируй блок строк 79-110 из старого файла прямо сюда.
  cleanupOldMediaOnStart(userDataPath)

  // Регистрируем все IPC handlers
  initAuthHandlers()
  initChatsHandlers()
  initMessagesHandlers()
  initMediaHandlers()

  // Auto-restore session — после загрузки renderer'а
  const startRestore = () => {
    const win = state.getMainWindowFn?.()
    if (!win || win.isDestroyed()) {
      setTimeout(startRestore, 500)
      return
    }
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => autoRestoreSession().catch(e => log('autoRestore error: ' + e.message)), 500)
      })
    } else {
      autoRestoreSession().catch(e => log('autoRestore error: ' + e.message))
    }
  }
  setTimeout(startRestore, 1000)
}

function cleanupOldMediaOnStart(userDataPath) {
  // строки 79-110 из старого файла — БЕЗ ИЗМЕНЕНИЙ
  try {
    const mediaDir = path.join(userDataPath, 'tg-media')
    if (!fs.existsSync(mediaDir)) return
    // ... остальная логика
  } catch(_) {}
}
```

---

## 🔧 Пошаговая инструкция (15 шагов)

### Подготовка

#### Шаг 0. Прочитай контекст

```bash
# Эти файлы — обязательное чтение
cat CLAUDE.md
cat .memory-bank/README.md
cat .memory-bank/workflow.md
cat .memory-bank/handoff-code-limits.md
cat .memory-bank/mistakes/electron-core.md  # тут раздел про FLOOD_WAIT
cat main/native/telegramHandler.js  # весь файл целиком
```

⚠ Прочитай **весь** `telegramHandler.js`. Не отрывками. Тогда понятно как state переплетается между функциями.

#### Шаг 1. Проверь текущее состояние

```bash
git status                    # должно быть чисто
git log --oneline -5          # последние коммиты
node src/__tests__/fileSizeLimits.test.cjs 2>&1 | grep telegramHandler
# Должно быть: ✅ main/native/telegramHandler.js (1260 стр., лимит 1300 — исключение)
```

#### Шаг 2. Бонус (опционально, но рекомендую) — worktree

Чтобы master не пострадал если катастрофически сломаешь:

```bash
git worktree add ../ChatCenter-step7 -b refactor/telegram-handler-split
cd ../ChatCenter-step7
```

Все следующие шаги делать в `../ChatCenter-step7`. После теста и push мердж в master через PR (или fast-forward).

Если работаешь без worktree — пропусти этот шаг. Pre-push hook всё равно защитит от красного push.

### Создание новых файлов

#### Шаг 3. Создай `telegramState.js` ПЕРВЫМ

Это фундамент. Без него остальное не запустится.

См. полный пример в **Риске 1** выше. Скопируй его как стартовую точку, заполни все let'ы из текущего файла.

После создания — **не** прогоняй тесты ещё. Это не самостоятельный модуль, он сам по себе ничего не делает, его никто пока не импортирует.

#### Шаг 4. Создай `telegramErrors.js`

Скопируй функции `translateTelegramError` (строки 32-63) и `formatSeconds` (65-69) из текущего файла. Добавь `export` перед `function translateTelegramError`. Готово.

#### Шаг 5. Создай `telegramMessages.js`

Это **второй** по приоритету (не первый!) — потому что `telegramAuth.js` его импортирует для `attachMessageListener`.

```js
// telegramMessages.js
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { NewMessage } from 'telegram/events/index.js'
import { state, chatEntityMap, log, emit, Api } from './telegramState.js'

// Внутренние функции
function mapMessage(m, chatId) { /* строки 897-971 */ }
function messagePreview(m) { /* строки 973-1016 */ }
function extractStrippedThumb(media) { /* строки 884-895 */ }

// Экспортируется — нужно в auth.js после client.start()
export function attachMessageListener() {
  /* строки 1227-1274 — БЕЗ ИЗМЕНЕНИЙ только client → state.client */
}

// Экспортируется — может быть нужно в chats.js
export { mapMessage, messagePreview }

export function initMessagesHandlers() {
  ipcMain.handle('tg:send-clipboard-image', async (_, args) => { /* 247-262 */ })
  ipcMain.handle('tg:send-file', async (_, args) => { /* 264-274 */ })
  ipcMain.handle('tg:forward', async (_, args) => { /* 276-287 */ })
  ipcMain.handle('tg:get-messages', async (_, args) => { /* 425-454 */ })
  ipcMain.handle('tg:send-message', async (_, args) => { /* 455-535 */ })
  ipcMain.handle('tg:delete-message', async (_, args) => { /* 536-545 */ })
  ipcMain.handle('tg:edit-message', async (_, args) => { /* 546-558 */ })
}
```

При копировании — везде заменяй `client` → `state.client`. Ничего не упрощай.

#### Шаг 6. Создай `telegramChats.js`

Аналогично — импортируй state, скопируй функции и handlers. Особое внимание на `loadAvatarsAsync` — НЕ упрощай.

```js
// telegramChats.js
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { state, chatEntityMap, markReadMaxSent, log, emit, Api } from './telegramState.js'

// Внутренние и экспортируемые функции
export function mapEntities(entities) { /* 870-882 */ }
export function mapDialog(d) { /* 1018-1041 */ }
export function saveChatsCache(chats) { /* 1043-1061 */ }
export async function loadRestPagesAsync(firstPage) { /* 1063-1089 */ }
export async function loadAvatarsAsync(dialogs) {
  /* 1091-1162 — ДОСЛОВНО, НЕ ТРОГАЙ FLOOD_WAIT THROTTLE */
}
export async function fetchAllUnreadUpdates(maxPages, pageSize) { /* 1165-1187 */ }
export function startUnreadRescan() { /* 1189-1211 */ }
async function syncPerChatUnread(chatId) { /* 1214-1225 */ }

export function initChatsHandlers() {
  ipcMain.handle('tg:get-cached-chats', async () => { /* 172-193 */ })
  ipcMain.handle('tg:mark-read', async (_, args) => { /* 202-244 */ })
  ipcMain.handle('tg:pin', async (_, args) => { /* 288-314 */ })
  ipcMain.handle('tg:rescan-unread', async () => { /* 316-326 */ })
  ipcMain.handle('tg:get-pinned', async (_, args) => { /* 328-343 */ })
  ipcMain.handle('tg:refresh-avatar', async (_, args) => { /* 345-365 */ })
  ipcMain.handle('tg:set-typing', async (_, args) => { /* 366-378 */ })
  ipcMain.handle('tg:get-chats', async () => { /* 379-423 */ })
  ipcMain.handle('tg:remove-account', async () => { /* 627-660 */ })
}
```

#### Шаг 7. Создай `telegramMedia.js`

```js
// telegramMedia.js
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { state, log } from './telegramState.js'

export function initMediaHandlers() {
  ipcMain.handle('tg:download-video', async (event, args) => { /* 559-597 */ })
  ipcMain.handle('tg:download-media', async (_, args) => { /* 598-625 */ })
  ipcMain.handle('tg:cleanup-media', async (_, args = {}) => { /* 662-695 */ })
  ipcMain.handle('tg:media-cache-size', async () => { /* 696-708 */ })
}
```

#### Шаг 8. Создай `telegramAuth.js`

Этот **последним из 6 модулей** потому что он импортирует все остальные.

```js
// telegramAuth.js
import { ipcMain } from 'electron'
import fs from 'node:fs'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { state, chatEntityMap, log, emit, API_ID, API_HASH } from './telegramState.js'
import { translateTelegramError } from './telegramErrors.js'
import { attachMessageListener, mapMessage } from './telegramMessages.js'
import { mapDialog, mapEntities, saveChatsCache, loadRestPagesAsync, loadAvatarsAsync, startUnreadRescan } from './telegramChats.js'

export function initAuthHandlers() {
  ipcMain.handle('tg:login-start', async (_, args) => { /* 129-141 */ })
  ipcMain.handle('tg:login-code', async (_, args) => { /* 143-152 */ })
  ipcMain.handle('tg:login-password', async (_, args) => { /* 154-161 */ })
  ipcMain.handle('tg:login-cancel', async () => { /* 163-170 */ })
}

async function startLogin(phone) {
  /* строки 710-826
     ВСЕ client = ... → state.client = ...
     ВСЕ pendingLogin = ... → state.pendingLogin = ...
     ВСЕ currentAccount = ... → state.currentAccount = ...
     После client.start() SUCCESS — обязательно вызвать attachMessageListener()
   */
}

export async function autoRestoreSession() {
  /* строки 829-862
     То же самое — state.client, state.currentAccount.
     После успешного восстановления — attachMessageListener() */
}
```

⚠ **Главное**: после `await state.client.start({...})` (внутри `startLogin`, в SUCCESS-ветке) и в `autoRestoreSession` — **обязательно** вызови:

```js
attachMessageListener()
startUnreadRescan()
```

В оригинале они вызываются именно тут — не пропусти.

### Перепись главного файла

#### Шаг 9. Перепиши `telegramHandler.js` целиком

См. полный пример в разделе «Файл 7» выше. Тонкий роутер ~80 строк.

⚠ **Не забудь**:
- `cleanupOldMediaOnStart` — функция-помощник в этом же файле (логика из строк 79-110 оригинала)
- `setTimeout(startRestore, 1000)` — без него autoRestoreSession не запустится при старте

### Тестирование и фикс

#### Шаг 10. Удали запись из KNOWN_EXCEPTIONS

В `src/__tests__/fileSizeLimits.test.cjs` найди и удали:

```js
'main/native/telegramHandler.js': {
  ceiling: 1300,
  reason: 'Крупный файл интеграции Telegram. Запланировано разбиение на telegramAuth/Messages/Chats/Media.'
},
```

Замени на коммент:
```js
// v0.87.85: telegramHandler.js разбит на 6 модулей (Шаг 7/7) — теперь под стандартным
// лимитом 500 строк для main/native/*.js. Исключение удалено.
```

#### Шаг 11. Прогон тестов через pre-push

```bash
bash scripts/hooks/pre-push
```

Что должно произойти:
- 30 cjs-тестов прогонятся последовательно: `[1/30] isSpamText ... ✅` … `[30/30] integration ... ✅`
- Vitest: `Tests 123 passed (123)`
- В конце: `✅ pre-push: всё зелёное — push разрешён`

Если упал — смотри какой тест и tail логов. Скорее всего:
- **`fileSizeLimits.test.cjs`** — если забыл удалить запись из KNOWN_EXCEPTIONS, или если получился файл > лимита.
- **`mediaCacheQuota.test.cjs`** — если поломал логику cleanup в `telegramMedia.js`. Этот тест проверяет логику очистки.

#### Шаг 12. ESLint

```bash
npm run lint
```

Если упало — обычно проблемы:
- неиспользуемые импорты
- неиспользуемые переменные
- `no-undef` если забыл импортировать `state`/`Api`

Чини и снова прогоняй pre-push.

### Версия и Memory Bank

#### Шаг 13. Bump до v0.87.85 в 4 местах

```bash
# 1. package.json
# Найти "version": "0.87.84" → "version": "0.87.85"

# 2. package-lock.json — ДВА места
# "version": "0.87.84" в начале → "0.87.85"
# "version": "0.87.84" в packages[""] → "0.87.85"

# 3. CLAUDE.md — ТРИ места
# **Текущая версия**: v0.87.84 → v0.87.85
# **Версия проекта**: v0.87.84 → v0.87.85
# **Последнее обновление**: ... → запись про v0.87.85

# 4. .memory-bank/features.md
# ## Текущая версия: v0.87.84 → v0.87.85
# Добавить запись ### v0.87.85 — Разбиение telegramHandler.js (Шаг 7/7 — финал)
```

Используй `npm run check-memory` чтобы проверить что все 4 места согласованы:
```bash
npm run check-memory
# Должно вывести: ✅ Все 4 места согласованы
```

#### Шаг 14. Запись в features.md

Добавь в начало `## Текущая версия` секции:

```markdown
### v0.87.85 — Разбиение telegramHandler.js: 6 модулей, исключение удалено (Шаг 7/7 — финал)

**Зачем**: telegramHandler.js был 1260/1300 — крупнейший файл с исключением. Последний рискованный из плана.

**Что вынесено**:

```
ДО:  main/native/telegramHandler.js [1260/1300]  ← KNOWN_EXCEPTIONS
ПОСЛЕ:
  main/native/telegramHandler.js   [~80]   тонкий роутер
  main/native/telegramState.js     [~50]   общий state + emit + Map'ы
  main/native/telegramErrors.js    [~50]   translateTelegramError
  main/native/telegramAuth.js      [~250]  startLogin + autoRestore + 4 IPC
  main/native/telegramChats.js     [~360]  IPC чатов + FLOOD_WAIT throttle
  main/native/telegramMessages.js  [~360]  IPC сообщений + NewMessage event
  main/native/telegramMedia.js     [~150]  IPC медиа + cleanup
```

**Контракт сохранён**:
- Все IPC каналы те же: tg:login-start/code/password/cancel, tg:get-chats, tg:get-messages,
  tg:send-message, tg:mark-read, tg:download-media и т.д.
- Все события те же: tg:account-update, tg:login-step, tg:chats, tg:messages, tg:new-message,
  tg:chat-unread-sync, tg:unread-bulk-sync.
- Telegram-клиент работает как раньше — auth, chats, messages, media.

**Архитектура**: shared singleton `telegramState.js` экспортирует `state` объект и Map'ы.
Все модули импортируют их и используют через `state.client`, `chatEntityMap.get()` и т.п.
Node.js модули кэшируются → один экземпляр на процесс.

**Удалена запись** `KNOWN_EXCEPTIONS['main/native/telegramHandler.js']` — теперь под стандартным лимитом 500.

**Проверки**: pre-push hook ✅ (30/30 cjs + 123/123 vitest), ESLint ✅, check-memory ✅.

**Файлы изменены**:
- `main/native/telegramHandler.js` — переписан (1260 → ~80)
- `main/native/telegramState.js` — новый
- `main/native/telegramErrors.js` — новый
- `main/native/telegramAuth.js` — новый
- `main/native/telegramChats.js` — новый
- `main/native/telegramMessages.js` — новый
- `main/native/telegramMedia.js` — новый
- `src/__tests__/fileSizeLimits.test.cjs` — удалена запись KNOWN_EXCEPTIONS
- `package.json`, `package-lock.json`, `CLAUDE.md` — версия 0.87.85

**🎉 План разбиения 7/7 закрыт.** Все рискованные файлы под стандартными лимитами.
```

#### Шаг 15. Commit + push

```bash
git add main/native/telegramHandler.js main/native/telegramState.js main/native/telegramErrors.js main/native/telegramAuth.js main/native/telegramChats.js main/native/telegramMessages.js main/native/telegramMedia.js src/__tests__/fileSizeLimits.test.cjs CLAUDE.md .memory-bank/features.md package.json package-lock.json

git commit -m "$(cat <<'EOF'
v0.87.85: разбиение telegramHandler.js на 6 модулей (Шаг 7/7 — финал)

Зачем: telegramHandler.js 1260/1300 — крупнейший файл с исключением.
Последний рискованный из плана разбиений.

ДО:  main/native/telegramHandler.js [1260/1300]  ← KNOWN_EXCEPTIONS
ПОСЛЕ:
  telegramHandler.js  [~80]   тонкий роутер
  telegramState.js    [~50]   общий state + emit + Map'ы (singleton)
  telegramErrors.js   [~50]   translateTelegramError
  telegramAuth.js     [~250]  startLogin + autoRestore + 4 IPC
  telegramChats.js    [~360]  IPC чатов + FLOOD_WAIT throttle
  telegramMessages.js [~360]  IPC сообщений + NewMessage event listener
  telegramMedia.js    [~150]  IPC медиа + cleanup

Архитектура: telegramState.js экспортирует state объект и Map'ы.
Все модули импортируют их и используют через state.client.
Node.js модули кэшируются → один экземпляр на процесс.

Контракт сохранён: все IPC каналы и события — те же.

KNOWN_EXCEPTIONS['main/native/telegramHandler.js'] УДАЛЕНО — теперь
под стандартным лимитом 500 без поблажек.

pre-push hook: 30/30 cjs ✅ + vitest 123/123 ✅. ESLint ✅.

UI-проверка пользователем требуется — см. handoff-telegram-handler-split.md.

🎉 План разбиения 7/7 закрыт.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push origin master
```

⚠ **Pre-push hook прогонит ВСЕ тесты ещё раз** перед push. Это нормально — двойная защита.

### После push — обязательная UI-проверка

#### Шаг 16. Скажи пользователю запустить приложение

Дай пользователю **точный** список что проверить (см. раздел «UI-проверка» ниже). Если хоть что-то сломается — **откат** одной командой:

```bash
git revert <hash-of-step-7-commit>
git push
```

---

## ⚠ UI-проверка пользователем (КРИТИЧНО — 12 пунктов)

После push дай пользователю **точно** этот список и попроси проверить **по порядку**:

### Группа 1: Авторизация

| № | Что проверить | Как |
|---|---|---|
| 1 | **Вход с нуля** | Удалить `%APPDATA%/ЦентрЧатов/tg-session.txt`. Запустить программу. Открыть Telegram-вкладку. Ввести номер → код из SMS/Telegram → 2FA пароль (если есть) → войти. Должно работать. |
| 2 | **Auto-restore session** | Закрыть программу. Запустить снова. Должно открыть Telegram **без** ввода кода — session восстановилась. |
| 3 | **Logout** | Нажать «Выйти из аккаунта» (если есть в UI) — вылогиниться, session файл удалить. Telegram должен попросить ввести номер заново. |

### Группа 2: Чаты

| № | Что проверить | Как |
|---|---|---|
| 4 | **Список чатов загружается** | После входа — слева видны все диалоги. Через 5-10 секунд подгружаются аватарки (FLOOD_WAIT throttle!). |
| 5 | **Открытие чата** | Клик по чату → справа загружаются сообщения. Должен подсветить первое непрочитанное (initial-scroll). |
| 6 | **Прочитанность** | Прокрутить вниз → счётчик непрочитанных уменьшается **постепенно** (по 1-2 в секунду). После закрытия и открытия чата — счётчик не вырос обратно (watermark guard работает). |

### Группа 3: Сообщения

| № | Что проверить | Как |
|---|---|---|
| 7 | **Отправка текста** | В поле ввода написать текст → Enter → сообщение появилось в чате. |
| 8 | **Reply, Edit, Delete, Forward** | Hover на сообщение → ↪ Reply → отправить → пришёл ответ-цитата. Edit (Ctrl+↑) → изменить → ✓. Delete → удалилось у обоих. Forward → выбрать чат → переслалось. |
| 9 | **Входящие в реальном времени** | Попроси кого-то написать тебе → сообщение появляется **сразу** (NewMessage event работает). |

### Группа 4: Медиа

| № | Что проверить | Как |
|---|---|---|
| 10 | **Photo/Video** | Открыть чат с медиа → миниатюры показываются → клик → открывается photo viewer / video player. |
| 11 | **Send file/clipboard image** | Перетащить файл → отправляется. Скопировать картинку → Ctrl+V → отправляется. |
| 12 | **Pin/Unpin** | Hover на сообщение → 📌 → закрепляется в шапке чата. Клик ✕ → откреплено. |

### Если что-то сломалось

⚠ **Не паникуй**. Pre-push hook гарантирует что **код компилируется и unit-тесты проходят**. Если ломается UI — это runtime-ошибка, видно в DevTools или логах.

**Откат**:
```bash
git revert <hash>
git push
```

Pre-push снова прогонит тесты — должны пройти. Master вернётся к v0.87.84.

---

## 🧪 Команда-чекер тестов (если pre-push сам не прогнался)

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

Если ничего не вывелось — все 30 тестов прошли. Если вывело какие-то имена — это упавшие тесты.

**Какие тесты могут упасть** (с большей вероятностью):
- ❌ `fileSizeLimits.test.cjs` — забыл удалить запись KNOWN_EXCEPTIONS, или telegramHandler стал больше 500 строк
- ❌ `mediaCacheQuota.test.cjs` — поломал логику cleanup в telegramMedia.js. Проверь что copy-paste точный.
- ❌ Никакие другие — `telegramHandler.js` не grep'ается другими тестами по содержимому.

---

## 📦 ⭐ ОБЯЗАТЕЛЬНО: что убрать из документации после успеха

⚠ **Это один из самых частых пропусков** при разбиении файлов. После успешной UI-проверки и стабильности — обновить **5 мест** в документации, чтобы устаревшие записи не вводили будущих агентов в заблуждение.

### 1. `src/__tests__/fileSizeLimits.test.cjs` — удалить из `KNOWN_EXCEPTIONS`

Уже сделано в Шаге 10. Двойная проверка:

```bash
grep -A 4 "KNOWN_EXCEPTIONS" src/__tests__/fileSizeLimits.test.cjs | grep telegramHandler
# Должно ничего не найти — запись удалена
```

### 2. `.memory-bank/code-limits-status.md` — убрать из таблицы исключений

Открой файл. Найди таблицу 🔴 «Исключения» и **удали строку**:

```markdown
| `main/native/telegramHandler.js` | 1260 | 1300 | Крупная интеграция GramJS | Разбить на ... |
```

### 3. `.memory-bank/handoff-code-limits.md` — пометить Приоритет 1 как ✅ выполнено

Найди раздел `### Приоритет 1: Разбить telegramHandler.js` и замени всё его содержимое на:

```markdown
### Приоритет 1: ✅ Разбить `telegramHandler.js` — **СДЕЛАНО в v0.87.85**

telegramHandler.js: 1260 → ~80 строк (тонкий роутер). Вынесены 6 модулей:
- `telegramState.js` (~50) — singleton state + emit + Map'ы
- `telegramErrors.js` (~50) — translateTelegramError
- `telegramAuth.js` (~250) — login flow + autoRestore
- `telegramChats.js` (~360) — IPC чатов + FLOOD_WAIT throttle
- `telegramMessages.js` (~360) — IPC сообщений + NewMessage event
- `telegramMedia.js` (~150) — IPC медиа

Исключение из `KNOWN_EXCEPTIONS` удалено. Подробности в архивированном handoff.
```

### 4. `CLAUDE.md` — удалить ссылку на этот handoff из таблицы «Узкие файлы»

Найди в `CLAUDE.md` таблицу «Узкие / разовые файлы» и **удали строку**:

```markdown
| **Шаг 7/7 разбиения**: telegramHandler.js (1260 строк) | [`.memory-bank/handoff-telegram-handler-split.md`](...) — конкретный план... |
```

После выполнения handoff больше не нужен в активном пути чтения.

### 5. Архивировать сам этот handoff

Этот файл нужен был **до** разбиения. После — он становится историей. Перемести в архив:

```bash
git mv .memory-bank/handoff-telegram-handler-split.md .memory-bank/archive/2026-04-handoff-telegram-handler-split.md
```

Имя файла — по конвенции архива: `YYYY-MM-<имя>.md` (см. `.memory-bank/archive/README.md`).

### 6. Обновить `archive/README.md` — добавить запись в журнал

Открой `.memory-bank/archive/README.md`. В таблицу «Журнал архивации» добавь строку (с датой):

```markdown
| 2026-04-XX | `2026-04-handoff-telegram-handler-split.md` | `handoff-telegram-handler-split.md` | Разбиение telegramHandler.js выполнено в v0.87.85. Handoff больше не нужен в активном чтении. |
```

### 7. Сделать коммит-cleanup ОТДЕЛЬНО

⚠ **Не смешивай** удаление документации с коммитом разбиения. Сначала push разбиения (Шаг 15) → пользователь проверяет UI → если всё ОК **через 1-2 дня** → отдельный коммит cleanup'а.

```bash
# После 1-2 дней стабильности:
git add .memory-bank/code-limits-status.md .memory-bank/handoff-code-limits.md CLAUDE.md .memory-bank/archive/README.md .memory-bank/archive/2026-04-handoff-telegram-handler-split.md

git commit -m "v0.87.86: cleanup документации после успешного Шага 7

После 1-2 дней стабильности v0.87.85 (telegramHandler разбит) убираем
устаревшие записи:

- code-limits-status.md — удалена строка про telegramHandler
- handoff-code-limits.md — Приоритет 1 помечен ✅ СДЕЛАНО
- CLAUDE.md — удалена ссылка на handoff из таблицы Узкие файлы
- handoff-telegram-handler-split.md → archive/ (по конвенции YYYY-MM-)
- archive/README.md — запись в журнал архивации

План разбиения 7/7 полностью закрыт.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin master
```

⚠ **Bump версии** до v0.87.86 нужен и здесь (это изменение в .memory-bank → согласно правилам проекта).

---

## 🆘 Troubleshooting — если что-то пошло не так

### Симптом: «Telegram не подключается после старта»

**Причина**: `state.client` не присваивается, или `state.getMainWindowFn` пустой.

**Проверь**:
```bash
grep -n "state.client = " main/native/telegramAuth.js
# Должно быть в startLogin (после new TelegramClient) и в autoRestoreSession
```

```bash
grep -n "state.getMainWindowFn = " main/native/telegramHandler.js
# Должно быть в первой строке initTelegramHandler
```

### Симптом: «Сообщения не приходят в реальном времени»

**Причина**: `attachMessageListener()` не вызвался после `client.start()`.

**Проверь**:
```bash
grep -n "attachMessageListener" main/native/telegramAuth.js
# Должно быть 2 вызова: в startLogin (SUCCESS блок) и в autoRestoreSession
```

### Симптом: «mark-read не работает / счётчик растёт обратно»

**Причина**: `markReadMaxSent` Map создаётся в каждом модуле своя, не импортируется из state.

**Проверь**:
```bash
grep -rn "new Map()" main/native/telegram*.js
# Не должно быть `markReadMaxSent = new Map()` или `chatEntityMap = new Map()` в файлах кроме telegramState.js
```

```bash
grep -rn "markReadMaxSent" main/native/telegram*.js
# Должны быть только импорты + использование, не создание
```

### Симптом: «FLOOD_WAIT при первом старте»

**Причина**: `loadAvatarsAsync` сломан — нет throttle.

**Проверь**: открой `main/native/telegramChats.js`, найди `loadAvatarsAsync`. Должен быть `await sleep(...)` или `setTimeout` между запросами. Сравни **слово в слово** со старой версией (могу `git show HEAD:main/native/telegramHandler.js | sed -n '1091,1162p'` показать оригинал).

### Симптом: «pre-push не пускает, тест X упал»

**Действие**: прочитай вывод `bash scripts/hooks/pre-push` — там видно tail последних 20 строк лога упавшего теста. Скорее всего:
- `fileSizeLimits` — забыл удалить запись из KNOWN_EXCEPTIONS, или один из новых файлов > лимита
- `mediaCacheQuota` — поломал cleanup логику. Проверь дословность переноса.

### Симптом: «Циклический импорт между модулями»

**Причина**: `telegramAuth.js` импортирует `telegramMessages.js`, тот пытается импортировать `telegramAuth.js`.

**Решение**: динамический импорт внутри функции:
```js
async function startLogin(phone) {
  // ...
  const { attachMessageListener } = await import('./telegramMessages.js')
  attachMessageListener()
}
```

### Симптом: «Lint падает на no-undef»

**Причина**: используешь переменную (`client`, `Api`, `chatEntityMap`) которую не импортировал из state.

**Решение**: добавь в импорт:
```js
import { state, chatEntityMap, Api, log, emit } from './telegramState.js'
```

И замени `client` → `state.client` в коде.

---

## 🎁 Бонус: worktree для безопасности

Если хочешь работать **изолированно** — отдельная ветка через worktree:

```bash
# В корне ChatCenter:
git worktree add ../ChatCenter-step7 -b refactor/telegram-handler-split
cd ../ChatCenter-step7

# Все шаги 3-15 делать здесь
# В конце вместо push в master → push в свою ветку:
git push origin refactor/telegram-handler-split

# Потом на GitHub создать PR → merge в master
```

Преимущества:
- master не пострадает если катастрофа
- можно делать промежуточные коммиты не боясь
- легко откатить всю ветку: `git branch -D refactor/telegram-handler-split`

После успешного merge:
```bash
cd ../ChatCenter
git pull origin master
git worktree remove ../ChatCenter-step7
```

---

## 📊 Ожидаемый итог Шага 7

| Метрика | До | После |
|---|---|---|
| Файлов с `KNOWN_EXCEPTIONS` | 5 | **4** (webviewSetup, messengerConfigs, consoleMessageHandler, dockPinHandlers, notification.js — все low-priority) |
| `telegramHandler.js` | 1260/1300 | **~80** / 500 (-1180 строк, **84% запас**) |
| Новых файлов | — | 6 |
| Модулей в `main/native/` | 1 telegram + 1 другой | 7 telegram + 1 другой |
| Версий завершено в плане | 6/7 | **7/7 — план закрыт** ✅🎉 |

После Шага 7 в проекте **не остаётся ни одного критически крупного файла**. Все рискованные разбиты, добавленные строки в любом файле сразу подсвечиваются автотестом.

---

## 📌 Финальный чеклист

Распечатай мысленно перед началом:

- [ ] Прочитал весь `telegramHandler.js` целиком
- [ ] Прочитал секцию «5 ГЛАВНЫХ РИСКОВ» в этом handoff
- [ ] Понял что `telegramState.js` — singleton, и все модули его импортируют
- [ ] Понял что `attachMessageListener()` вызывается ПОСЛЕ `client.start()`
- [ ] Понял что `loadAvatarsAsync` — НЕ упрощать
- [ ] Создал `telegramState.js` ПЕРВЫМ
- [ ] Везде заменил `client` → `state.client`
- [ ] Удалил запись из `KNOWN_EXCEPTIONS`
- [ ] Прогнал `bash scripts/hooks/pre-push` — все 30 cjs + vitest зелёные
- [ ] Прогнал `npm run lint` — ESLint OK
- [ ] Bump версии в 4 местах (npm run check-memory подтвердил)
- [ ] Запись в `features.md` про v0.87.85
- [ ] Commit + push прошёл (pre-push hook одобрил)
- [ ] Передал пользователю 12 пунктов UI-проверки
- [ ] **(После 1-2 дней стабильности)** Сделал cleanup-коммит v0.87.86: убрал записи из 5 мест документации + архивировал этот handoff

Если все галочки — план разбиения 7/7 закрыт. Поздравляю 🎉

---

**Удачи. Не забудь главное: `telegramState.js` первым, и `attachMessageListener()` после `client.start()`.**
