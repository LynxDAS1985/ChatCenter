# Phase 4a — Tasks + Reminders + AI Activity (v1.0.0) — детальная реализация

> Цель документа: полностью описать ЧТО было сделано, ЗАЧЕМ, КАК работает, какие потоки данных, какие подводные камни. Чтобы через 6 месяцев можно было открыть этот файл и за 15 минут восстановить картину.

---

## 1. Что это и зачем

### 1.1 Проблема которую решали

К v0.99.1 AI-агент умел:
- ✅ читать историю чата (`get_chat_history`)
- ✅ искать сообщения (`search_messages`)
- ✅ переходить к сообщению (`goto_message`)
- ✅ отправлять ответ (`reply_to_message`) с подтверждением
- ✅ отмечать прочитанным (`mark_as_read`) с подтверждением

Но **результаты его работы никуда не сохранялись**. Пример: AI прочитал «Завтра в 10:00 будет звонок с клиентом БНК», понял что это важно — и… забыл. На следующий день клиент не дождался — звонок упустили.

**Что нужно**:
- AI должен уметь **создать задачу** «Перезвонить БНК завтра в 10:00» с привязкой к исходному сообщению.
- AI должен уметь **запланировать напоминание** — повторное уведомление в указанное время.
- Юзер должен видеть **журнал всех действий AI** (что вызвал, к чему привело, ошибки) — для контроля и доверия.

### 1.2 Чего добивались
- **3 новых tool** для AI: `create_task`, `list_tasks`, `schedule_reminder`.
- **Persistent хранилище** (JSON файлы в `userData`) — чтобы выжило перезапуск приложения.
- **3 UI панели**: TasksPanel / RemindersPanel / AIActivityDashboard.
- **Atomic write** — чтобы при крэше во время записи файл не повредился.
- **Привязка к источнику** — каждая задача/напоминание знает к какому сообщению относится (через `NotificationSource` паспорт из Phase 0).

---

## 2. Архитектура: общая картина

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MAIN PROCESS (main/)                          │
│                                                                     │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐   │
│  │ aiToolExecutor      │    │ taskIpcHandlers.js               │   │
│  │ (agent loop)        │    │  - ipcMain.handle tasks:create   │   │
│  └─────────────────────┘    │  - tasks:list / complete / delete│   │
│           │ вызывает         │  - in-memory _cache + atomic    │   │
│           ↓                  │    write to tasks.json           │   │
│  ┌─────────────────────┐    └──────────────────────────────────┘   │
│  │ handler             │    ┌──────────────────────────────────┐   │
│  │ (createTask /       │    │ reminderIpcHandlers.js           │   │
│  │  listTasks /        │    │  - ipcMain.handle reminders:*    │   │
│  │  scheduleReminder)  │    │  - setTimeout scheduler          │   │
│  └─────────────────────┘    │  - emit `reminder:fired` → notif │   │
│           │                  └──────────────────────────────────┘   │
│           │ через context.{taskStore, reminderStore}                 │
│           ↓                  ┌──────────────────────────────────┐   │
│  context wraps               │ auditIpcHandlers.js              │   │
│  taskIpcHandlers internal    │  - append к audit-log/YYYY-MM    │   │
│           │                  │    .jsonl (JSON Lines)           │   │
│           ↓                  │  - listAuditEvents               │   │
│  файл сохранён в             └──────────────────────────────────┘   │
│  userData/tasks.json                                                │
└─────────────────────────────────────────────────────────────────────┘
                                  ↕ IPC
┌─────────────────────────────────────────────────────────────────────┐
│                      RENDERER (src/)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐    │
│  │ taskStore.js    │  │ reminderStore.js│  │ auditStore.js    │    │
│  │ (window.api     │  │                 │  │                  │    │
│  │  invoke wraps)  │  │                 │  │                  │    │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘    │
│        ↑                    ↑                    ↑                  │
│  ┌─────────────┐    ┌──────────────────┐  ┌────────────────────┐   │
│  │ TasksPanel  │    │ RemindersPanel   │  │ AIActivityDashboard│   │
│  │ (UI list)   │    │ (UI list)        │  │ (filters + stats)  │   │
│  └─────────────┘    └──────────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Главный принцип**: вся persistent логика **в main process**. Renderer только показывает UI и шлёт IPC команды. Это потому что:
- В Electron renderer'ов может быть много (BrowserWindow + WebView'ы), они не должны одновременно писать в один файл.
- API-ключи и приватные данные не должны попадать в renderer (security).
- При перезапуске renderer состояние теряется — main всё держит.

---

## 3. Файлы и их назначение — по слоям

### Слой 1 — Tools (что AI может вызвать)

| Файл | Назначение | Permission |
|---|---|---|
| `src/shared/tools/handlers/createTask.js` | Создаёт запись задачи через `context.createTask({title, details, priority, dueAt, source})` | `confirm` — юзер подтверждает (защита от спама) |
| `src/shared/tools/handlers/listTasks.js` | Возвращает список задач для AI чтобы он понял контекст («какие задачи уже есть, что не дублировать») | `auto` — read-only |
| `src/shared/tools/handlers/scheduleReminder.js` | Создаёт напоминание на конкретное время `remindAt` | `confirm` |

Эти handler'ы — **тонкие обёртки**. Они валидируют input (длина title, диапазон priority, валидный timestamp) и зовут `context.<метод>()`. Сам `context` собирается в `aiAgentSetup.getHandlerContext()` и передаётся в executor.

**Принцип**: handler ничего не знает о файлах / IPC / TDLib. Только бизнес-валидация + делегирование в context. Это позволяет тестировать handler с mock context (без реального main).

### Слой 2 — Renderer-side stores (мост к IPC)

| Файл | Что делает |
|---|---|
| `src/stores/taskStore.js` | `createTask`, `listTasks`, `completeTask`, `deleteTask` — все через `window.api.invoke('tasks:*')` |
| `src/stores/reminderStore.js` | `scheduleReminder`, `listReminders`, `cancelReminder` |
| `src/stores/auditStore.js` | `listAuditEvents`, `getRecentRevertableActions` |

Каждая функция:
1. Проверяет `window.api?.invoke` (на случай если запущено вне Electron — например в Vitest).
2. Сериализует данные (в случае `createTask` — оборачивает в `createTaskRecord()` чтобы добавить id/createdAt/status).
3. Вызывает IPC, ловит throw.
4. Возвращает `{ok, error?, ...payload}` — единый формат.

**Принцип единого формата ответа**: любой store метод возвращает либо `{ok:true, tasks:[]}` либо `{ok:false, error:'...'}`. UI не должен делать `try/catch` — просто проверяет `r.ok`.

### Слой 3 — Main-side IPC handlers (persistent)

#### 3.1 `main/handlers/taskIpcHandlers.js`

**Файл хранения**: `<userData>/tasks.json` — массив JSON.

**In-memory cache**: `let _cache = null` — массив задач загружается из файла при первом обращении (lazy load). Дальше все операции — на cache + save.

**Atomic write**:
```js
function saveTasks() {
  const file = getTasksFile()
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(_cache, null, 2), 'utf8')
  fs.renameSync(tmp, file)  // атомарная замена
}
```

**Зачем atomic**: если приложение крэшнет во время записи (питание, OS kill) — без `.tmp + rename` получишь обрезанный JSON, при следующем старте `JSON.parse` упадёт и **все задачи пропадут**. `rename` — атомарная операция на уровне файловой системы (POSIX гарантирует, Windows тоже).

**Зарегистрированные каналы**:
- `tasks:create` → принимает готовый task объект (renderer уже сделал `createTaskRecord` с id).
- `tasks:list` → принимает `filter = {status, priority, createdBy, chatId}`, фильтрует in-memory, сортирует по `createdAt DESC`.
- `tasks:update` → `{taskId, updates}` — patch (только указанные поля).
- `tasks:complete` → ярлык на `tasks:update` с `status='done'` + `completedAt=Date.now()`.
- `tasks:delete` → удаляет из cache + save.

**Что НЕ делает**: не валидирует длины. Валидация в renderer-store (`createTaskRecord`). Main доверяет — это OK потому что renderer наш собственный.

#### 3.2 `main/handlers/reminderIpcHandlers.js`

**Файл хранения**: `<userData>/reminders.json`.

**Scheduler**: на инициализации (`initReminderIpcHandlers`) проходит по всем `status='pending'` напоминаниям и запускает `setTimeout(() => fire(r), delay)` для каждого. Если `delay < 0` (время уже прошло пока приложение было выключено) — срабатывает мгновенно.

**Когда `setTimeout` срабатывает**:
1. Меняет `r.status = 'fired'`, ставит `r.firedAt = now`.
2. Сохраняет файл.
3. Зовёт `getMainWindow().webContents.send('reminders:fired', r)` — renderer получает событие, может показать всплывающее уведомление.

**Лимиты**:
- `note` обрезается до 500 символов в `createReminderRecord()` (renderer-side).
- `remindAt` валидируется — обязан быть числом или ISO string конвертируемым в число.

**Зачем держать настоящий scheduler в main а не в renderer**: 
- Renderer может быть закрыт/свёрнут — `setTimeout` там продолжит работать, но если юзер закроет приложение — Renderer убьётся.
- В main процессе scheduler живёт до выхода приложения (что и нужно).
- Если приложение перезапустилось — main при старте перевзведёт `setTimeout` для всех pending (не теряем).

#### 3.3 `main/handlers/auditIpcHandlers.js`

**Файл хранения**: `<userData>/audit-log/YYYY-MM.jsonl` — JSON Lines, один JSON-объект на строку.

**Почему JSON Lines а не JSON**:
- Append-only — каждая новая запись просто допишется в конец файла, без чтения всего файла.
- Если повредится одна строка (крэш во время записи) — остальные не пострадают.
- Можно `grep` / `tail` / `awk` руками для отладки.
- Удобный split по месяцам — `audit-log/2026-06.jsonl`, без огромных файлов.

**Каждая запись**:
```json
{
  "id": "audit_1712...",
  "timestamp": 1712...,
  "actor": "ai" | "user",
  "actionId": "reply_to_message",
  "source": { /* NotificationSource паспорт */ },
  "input": { /* args */ },
  "executionResult": "ok" | "error" | "denied" | "denied_by_user",
  "output": { /* что вернул tool */ },
  "errorMessage": "...",
  "durationMs": 234,
  "revertable": true,  // можно ли откатить (для UI undo)
  "revertedAt": null  // timestamp если откатили
}
```

**Каналы**:
- `audit:append` — добавить запись (зовётся из executor после каждого tool вызова).
- `audit:list` — для AIActivityDashboard. Принимает фильтр `{actor, actionId, dateFrom, dateTo}`, читает файлы за нужные месяцы, фильтрует.
- `audit:recent-revertable` — для UI кнопки «откатить последнее».

---

## 4. Поток данных — на примере «AI создаёт задачу»

### Шаг 1: AI выбирает tool
LLM (Claude/GPT/DeepSeek) в ответ на промпт «прочитай сообщение и сделай что нужно» возвращает:
```json
{"type": "tool_use", "name": "create_task", "input": {
  "title": "Перезвонить БНК",
  "details": "Клиент просит звонок завтра в 10:00",
  "priority": "high",
  "dueAt": "2026-06-10T10:00:00Z"
}}
```

### Шаг 2: aiToolExecutor (main) ловит tool_use
- Проверяет permission в `aiPermissionGuard` → `create_task` имеет permission `confirm`.
- Шлёт в renderer `ai:agent:confirm-request` с описанием действия.
- Ждёт `ai:agent:confirm-response` (UI показал AIConfirmModal с 3-секундной задержкой).
- Юзер нажал «Подтвердить» → executor вызывает `tool.handler(source, args, context)`.

### Шаг 3: createTaskHandler выполняется
```js
// в handler
const result = await context.createTask({
  source: source,        // NotificationSource паспорт
  title: args.title,
  details: args.details,
  priority: args.priority,
  dueAt: args.dueAt,
  createdBy: 'ai',
})
// result = { ok: true, task: {...} }
```

### Шаг 4: context.createTask (из aiAgentSetup)
```js
createTask: async (taskParams) => {
  const ts = _deps?.taskStore
  return await ts.create(taskParams)
}
```

`ts` это `taskStore` объект из main.js — обёртка вокруг taskIpcHandlers. Создаёт task объект (id, createdAt, status='pending') и сохраняет в файл через `tasks:create` invoke (или прямой вызов).

### Шаг 5: задача в `tasks.json`
```json
{
  "id": "task_1712...",
  "source": { "messengerId": "native_cc", "chatId": "tg_...", "messageId": "999", ... },
  "title": "Перезвонить БНК",
  "details": "Клиент просит звонок завтра в 10:00",
  "priority": "high",
  "dueAt": "2026-06-10T10:00:00Z",
  "status": "pending",
  "createdBy": "ai",
  "createdAt": 1712...,
  "completedAt": null
}
```

### Шаг 6: AI получает результат tool execution
`tool_result` возвращается в LLM: `{ok: true, taskId: "task_..."}`. LLM завершает работу или вызывает следующий tool.

### Шаг 7: audit log
Executor после tool execution автоматически зовёт `audit:append` с записью: actor='ai', actionId='create_task', durationMs, source, output. Юзер увидит эту запись в AIActivityDashboard.

### Шаг 8: UI обновляется
Когда юзер откроет TasksPanel, `listTasks()` вернёт массив включающий новую задачу. Если хочется live-обновление badge — `tasks:create` handler шлёт `tasks:changed` event в renderer (см. v1.0.1, hook `useAppCounters`).

---

## 5. Lifecycle — что когда происходит

### При запуске приложения
1. `main.js` инициализирует `initTaskIpcHandlers({userDataPath})`. Регистрируются IPC каналы. `_cache = null` (lazy).
2. `initReminderIpcHandlers({userDataPath, getMainWindow})` — то же + при первом доступе к cache **перевзведёт setTimeout для всех pending**.
3. `initAuditIpcHandlers({userDataPath})` — создаёт папку `audit-log/` если её нет.

### При первом обращении к task'ам
4. `tasks:list` → `loadTasks()` → читает `tasks.json` если есть, иначе `_cache = []`.

### При выключении приложения
5. **Ничего особенного не делаем** — все сохранения уже на диске (atomic write после каждой операции). `setTimeout` напоминаний просто прекращается, при следующем старте взведутся заново.

---

## 6. Подводные камни и решения

### 6.1 Race condition при множественных запусках
**Сценарий**: два renderer'а одновременно вызывают `tasks:create`. Оба пройдут через main → один cache → последний выиграет.

**Защита**: операции на cache **синхронные** (массив + push), save тоже синхронный (`fs.writeFileSync`). Node.js event loop гарантирует что между ними никто не вклинится. Это работает потому что main процесс single-threaded.

**Что НЕ работает**: одновременная запись из main и из ручного `cat >> tasks.json` — но это нереальный сценарий.

### 6.2 JSON corruption при крэше
**Защита**: atomic write через `.tmp + rename`. Тестировано: если убить процесс в момент `writeFileSync` — `tasks.json` останется в прежнем состоянии (rename не успел).

**Что НЕ работает**: если `_cache` уже изменён в памяти но save ещё не вызван — изменение потеряется. Это OK потому что все наши операции зовут `saveTasks()` сразу после изменения cache (т.е. окно ~1 мс).

### 6.3 Очень большой файл задач
**Сценарий**: 10000 задач. Каждый `tasks:list` парсит весь файл — медленно.

**Текущее**: lazy load в `_cache`, дальше всё in-memory. Парсинг 1 раз при первом обращении. На 10000 задач — ~100мс. Терпимо.

**Что не сделано** (на будущее): индексация по статусу, пагинация в `tasks:list`. Сейчас нет ограничения.

### 6.4 Циклическая зависимость main → IPC → main
**Проблема**: `context.createTask` в aiAgentSetup хотел дёрнуть `tasks:create` через `ipcMain.invoke()` — но `ipcMain` не умеет вызывать сам себя.

**Решение в v1.0.0** (см. main/main.js строки 313-339): `taskStore.create` в `setAgentDeps` **дублирует минимальную логику** taskIpcHandlers'а (id генерация, валидация, save). TODO рефакторинг — вынести общий store в отдельный модуль. Пока MVP.

### 6.5 Time zones в reminders
**Сценарий**: юзер в МСК просит «напомни в 10:00». AI отдаёт `remindAt = "2026-06-10T10:00:00"`.

**Решение**: `createReminderRecord` всегда конвертирует в **миллисекунды UTC** через `new Date(remindAt).getTime()`. Дальше сравнения с `Date.now()` — независимо от TZ. UI форматирует через `toLocaleString('ru-RU')` который берёт TZ юзера автоматически.

### 6.6 Что делать если AI создаёт спам задач
**Защита**: permission `confirm` для `create_task` и `schedule_reminder` — юзер видит модалку с 3-секундной задержкой для каждой. Если AI пытается создать 5 задач подряд — будет 5 модалок (раздражает но безопасно).

**Что не сделано**: rate-limit на уровне AI agent (например, max 3 tool calls в минуту). Сейчас защита только через max iterations в executor (10 за один run).

---

## 7. Как тестировать вручную

### 7.1 Базовый тест задачи
1. Закрыть приложение полностью.
2. Открыть TDLib чат с непрочитанным сообщением.
3. Кликнуть на уведомление → кнопка «🤖 AI».
4. В AI sidebar дождаться шага `create_task`.
5. В модалке подтверждения нажать «Подтвердить» (после 3 сек).
6. Открыть `<userData>/tasks.json` (на Windows — `%APPDATA%/chat-center/tasks.json`).
7. Проверить — есть запись с правильным title, source.chatId, createdBy='ai'.

### 7.2 Persistent тест
1. Создать задачу.
2. Закрыть приложение **полностью**.
3. Запустить снова.
4. Открыть Задачи (📝 в шапке после v1.0.1) — задача должна быть в списке.

### 7.3 Reminder тест
1. AI → `schedule_reminder` с `remindAt` на +1 минуту.
2. Подтвердить.
3. Закрыть приложение на 30 секунд.
4. Открыть снова. Подождать ещё 30 сек.
5. Должно прийти уведомление `reminders:fired` (renderer его перехватит и покажет всплывающее).

### 7.4 Audit log тест
1. Запустить любой AI tool.
2. Открыть `<userData>/audit-log/YYYY-MM.jsonl`.
3. Должна быть строка с этим actionId, timestamp, durationMs.

---

## 8. Связь с другими частями

| С чем связано | Как |
|---|---|
| **Phase 0** — NotificationSource | Каждая задача/напоминание хранит `source` (паспорт сообщения). Без этого нельзя сделать `handleGoToSource`. |
| **Phase 1** — Tool Registry | Tools `create_task`/`list_tasks`/`schedule_reminder` зарегистрированы в registry. |
| **Phase 2** — Permission Guard | `create_task` и `schedule_reminder` имеют `permission='confirm'`. `list_tasks` — `permission='auto'`. |
| **Phase 3** — AI agent UI | AISidebarAgent показывает шаги создания задачи в реальном времени. |
| **v1.0.1** — UI интеграция | TasksPanel/RemindersPanel/AIActivityDashboard подключены в шапку (📝 ⏰ 📊). |
| **v1.0.2** — TDLib backend | AI агент может реально читать чаты прежде чем создать задачу (раньше — fallback). |

---

## 9. Файлы — сводка

### Renderer
- `src/shared/tools/handlers/createTask.js` — AI tool handler
- `src/shared/tools/handlers/listTasks.js`
- `src/shared/tools/handlers/scheduleReminder.js`
- `src/stores/taskStore.js` — renderer-side IPC wrapper
- `src/stores/reminderStore.js`
- `src/stores/auditStore.js`
- `src/components/TasksPanel.jsx` — UI компонент
- `src/components/RemindersPanel.jsx`
- `src/components/AIActivityDashboard.jsx`

### Main
- `main/handlers/taskIpcHandlers.js` — persistent CRUD + atomic write
- `main/handlers/reminderIpcHandlers.js` — + scheduler
- `main/handlers/auditIpcHandlers.js` — append to JSONL
- `main/ai/aiAgentSetup.js` — handlerContext с taskStore/reminderStore/auditStore
- `main/main.js` — регистрация всех 3 init функций

### Тесты
- `src/__tests__/createTaskHandler.vitest.js`
- `src/__tests__/listTasksHandler.vitest.js`
- `src/__tests__/scheduleReminderHandler.vitest.js`
- `src/__tests__/taskStore.vitest.js`
- `src/__tests__/reminderStore.vitest.js`
- `src/__tests__/auditStore.vitest.js`
- `main/handlers/taskIpcHandlers.vitest.js`
- `main/handlers/reminderIpcHandlers.vitest.js`
- `main/handlers/auditIpcHandlers.vitest.js`

---

## 10. Что осталось доработать (TODO)

1. **Рефакторинг store-логики**: вынести таска-операции из main.js (где дублируется minimal logic) в отдельный `main/stores/taskStoreMain.js` который шарят `taskIpcHandlers` И `aiAgentSetup`.
2. **Rate limit для AI**: max N create_task per minute, чтобы не было спама.
3. **Архивация старого audit log**: файлы > 6 месяцев перемещать в `audit-log/archive/`.
4. **Indexed search** для task: сейчас filter линейный по cache.
5. **Reminder snooze** — UI кнопка «отложить на 10 минут» после firing.
6. **Bulk operations**: `tasks:bulk-delete`, `tasks:bulk-complete`.

---

**Версия документа**: создан 9 июня 2026 для v1.0.0.
