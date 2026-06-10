# Phase 3 — UI агента: «🤖 AI» кнопка + AISidebarAgent streaming — детальная реализация

> Цель: до Phase 3 AI агент работал «в коде». Phase 3 = **юзер-facing UI**. Кнопка в уведомлении, которую видно. Боковая панель которая показывает что AI делает в реальном времени.

---

## 1. Чего хотели достичь

### 1.1 До Phase 3
После Phase 0 + 1 + 2 — был фундамент:
- паспорт сообщения,
- 8 инструментов,
- permission guard,
- audit log.

Но **юзер ничего не видел**. AI агент существовал «в коде» — без точки входа.

### 1.2 После Phase 3
1. В уведомлении (notification ribbon) появляется кнопка **«🤖 AI»**.
2. Клик → AI sidebar показывает прогресс шагов: «думаю», «читаю историю», «отправляю ответ» — в реальном времени.
3. Если нужно подтверждение — модалка с 3-сек задержкой.
4. Финальный ответ AI отображается в sidebar.

---

## 2. «🤖 AI» кнопка в notification

### 2.1 Файл
`main/notification.js` (~700 строк, renderer-код для BrowserWindow).

### 2.2 Откуда берётся
`main/notification.html` — HTML страница BrowserWindow для уведомления. JavaScript логика рендера лежит в `main/notification.js`.

### 2.3 Что добавлено в Phase 3

```js
// notification.js, в renderRibbon()
if (item.source && item.source.messengerId?.startsWith('native_')) {
  const aiBtn = document.createElement('button')
  aiBtn.className = 'ribbon-ai-btn'
  aiBtn.style.background = '#a855f7'  // фиолетовый
  aiBtn.textContent = '🤖 AI'
  aiBtn.title = 'Запустить AI-агента для этого сообщения'
  aiBtn.onclick = (e) => {
    e.stopPropagation()  // чтобы не сработал клик по ribbon (переход к чату)
    window.notifApi.aiProcess(item.id)
  }
  ribbon.appendChild(aiBtn)
}
```

### 2.4 Условие показа
Кнопка показывается **только для native_*** уведомлений. Для webview (WhatsApp, VK, Telegа) — нет, потому что write tools там не работают (см. Phase 2 scope check).

### 2.5 IPC channel
`notif:ai-process` — preload передаёт `notifApi.aiProcess(notifId)` → main handler.

### 2.6 Preload
`main/preloads/notification.preload.cjs`:
```js
contextBridge.exposeInMainWorld('notifApi', {
  // ...existing...
  aiProcess: (notifId) => ipcRenderer.send('notif:ai-process', notifId),
})
```

### 2.7 Main handler
`main/handlers/notifHandlers.js`:
```js
ipcMain.on('notif:ai-process', (event, notifId) => {
  const item = notifItems.get(notifId)
  if (!item?.source) return
  
  // Закрываем notification window
  closeNotification(notifId)
  
  // Шлём в renderer: AI agent должен запуститься
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ai:agent:invoke-from-notify', {
      source: item.source,
      timestamp: Date.now()
    })
  }
})
```

### 2.8 Renderer ловит
`src/App.jsx`:
```js
useEffect(() => {
  if (!window.api?.on) return undefined
  const unsub = window.api.on('ai:agent:invoke-from-notify', (payload) => {
    if (!payload?.source) return
    setActiveId(NATIVE_CC_ID)        // на ЦентрЧатов
    setShowAI(true)                  // открыть AI sidebar
    setPendingAiInvocation(payload)  // передать в AISidebar
  })
  return unsub
}, [])
```

### 2.9 Поток клика
```
Юзер кликает «🤖 AI» в ribbon
  ↓
notif:ai-process → main
  ↓
mainWindow.send('ai:agent:invoke-from-notify', {source})
  ↓
App.jsx ловит:
  - setActiveId('native_cc')
  - setShowAI(true)
  - setPendingAiInvocation(payload)
  ↓
AISidebar получает pendingAiInvocation prop
  ↓
AISidebarAgent монтируется и стартует
```

---

## 3. AISidebarAgent — streaming UI

### 3.1 Файл
`src/components/AISidebarAgent.jsx` (160 строк).

### 3.2 Что показывает

```
┌────────────────────────────────────┐
│ 🤖 AI-агент                    ✕   │
├────────────────────────────────────┤
│ 📩 Сообщение от: Иван Петров        │
│ 💬 Чат: БНК-Авто                    │
│ "Когда КП будет готово?"            │
├────────────────────────────────────┤
│ 🔄 Шаги:                            │
│                                    │
│ ⏳ Читаю историю чата...            │
│ ✅ Прочитано 15 сообщений           │
│ ⏳ Анализирую контекст...           │
│ ✅ Контекст понят                   │
│ ⏳ Готовлю ответ...                 │
│ ⚠️  Нужно подтверждение             │
│   [покажет модалку]                 │
│                                    │
├────────────────────────────────────┤
│ Финальный ответ:                    │
│ "К пятнице будет готово. Юристы..." │
│                                    │
│   [ Отменить агент ]                │
└────────────────────────────────────┘
```

### 3.3 Архитектура — streaming через IPC events

```
AISidebarAgent (renderer)
  ↓ ai:agent:run
main aiToolIpcHandlers
  ↓ executor.runAgent(..., onStep, onConfirmRequest)
aiToolExecutor
  ↓ onStep — на каждом шаге
  ↓ → mainWindow.send('ai:agent:step', {step})
AISidebarAgent ловит → addStep(step)
```

### 3.4 Виды шагов

```js
// thinking
{type: 'thinking', text: 'Читаю историю чата...'}

// tool_call
{type: 'tool_call', name: 'get_chat_history', args: {...}}

// tool_result
{type: 'tool_result', name: 'get_chat_history', result: {ok: true, count: 15}}

// confirm_request (executor паузит, ждёт юзера)
{type: 'confirm_request', tool, args, source, deferredId}

// final
{type: 'final', text: 'Готово, отправил ответ'}

// error
{type: 'error', message: '...'}
```

### 3.5 useAIAgent hook

`src/hooks/useAIAgent.js` (148 строк) — обёртка над IPC:
```js
const {
  isRunning,         // boolean
  steps,             // array
  finalText,         // string|null
  start,             // (source) => Promise
  cancel,            // () => void
  confirmStep,       // (deferredId) => void
  cancelStep,        // (deferredId) => void
} = useAIAgent({ source: pendingAiInvocation?.source })
```

#### start
Зовёт `window.api.invoke('ai:agent:run', {source, provider})`. Возвращает Promise который резолвится финальным результатом.

#### Streaming
```js
useEffect(() => {
  const unsub = window.api.on('ai:agent:step', (step) => {
    setSteps(prev => [...prev, step])
    if (step.type === 'final') setFinalText(step.text)
    if (step.type === 'confirm_request') setPendingConfirm(step)
  })
  return unsub
}, [])
```

#### cancel
Шлёт `ai:agent:cancel` через `window.api.send` (не invoke). Main вызывает AbortController. Executor выходит из цикла, текущий handler прерывается (если поддерживает abort).

#### confirmStep / cancelStep
Шлют `ai:agent:confirm-response` с `{deferredId, approved}`.

### 3.6 Связь с AIConfirmModal
Когда приходит step `confirm_request` — AISidebarAgent показывает `AIConfirmModal`:
```jsx
{pendingConfirm && (
  <AIConfirmModal
    tool={pendingConfirm.tool}
    args={pendingConfirm.args}
    source={pendingConfirm.source}
    onConfirm={() => {
      confirmStep(pendingConfirm.deferredId)
      setPendingConfirm(null)
    }}
    onCancel={() => {
      cancelStep(pendingConfirm.deferredId)
      setPendingConfirm(null)
    }}
  />
)}
```

---

## 4. Streaming protocol — детали

### 4.1 Channels

| Канал | Направление | Что несёт |
|---|---|---|
| `ai:agent:run` | renderer → main (invoke) | `{source, provider?, userPrompt?}` → возвращает финальный результат |
| `ai:agent:step` | main → renderer (event) | streaming шаги |
| `ai:agent:cancel` | renderer → main (send) | `{deferredId?}` для отмены |
| `ai:agent:confirm-response` | renderer → main (send) | `{deferredId, approved}` |
| `ai:agent:invoke-from-notify` | main → renderer (event) | payload от кнопки «🤖 AI» |

### 4.2 Почему invoke для run а send для cancel/confirm
- **invoke** = request/response, ждёт результат. Подходит для «дай мне финальный ответ агента».
- **send** = fire-and-forget. Подходит для «отмени» — main не должен blocking ждать.

### 4.3 Deferred id для confirm
**Проблема**: executor паузит → ждёт ответа юзера. Как «найти» свой deferred когда придёт response?

**Решение**: каждый `onConfirmRequest` генерирует уникальный `deferredId`. Main держит Map `deferredId → resolve function`. Когда приходит `ai:agent:confirm-response` — берём resolve по id и резолвим.

```js
// main aiToolIpcHandlers.js
const pendingConfirms = new Map()

executor.onConfirmRequest = async ({tool, args, source}) => {
  const deferredId = `confirm_${Date.now()}_${Math.random()}`
  return new Promise((resolve) => {
    pendingConfirms.set(deferredId, resolve)
    mainWindow.send('ai:agent:step', {
      type: 'confirm_request',
      tool, args, source, deferredId
    })
  })
}

ipcMain.on('ai:agent:confirm-response', (e, {deferredId, approved}) => {
  const resolve = pendingConfirms.get(deferredId)
  if (resolve) {
    resolve(approved)
    pendingConfirms.delete(deferredId)
  }
})
```

---

## 5. Поток типичной сессии

```
1. Юзер на вкладке WhatsApp. Приходит уведомление от TDLib.
2. notification BrowserWindow показывает ribbon с кнопкой «🤖 AI».
3. Юзер кликает «🤖 AI».
4. notif:ai-process → main → ai:agent:invoke-from-notify → App.jsx
5. App.jsx:
   - setActiveId('native_cc')  → переключить вкладку
   - setShowAI(true)           → открыть AI sidebar
   - setPendingAiInvocation({source})
6. AISidebar получает pendingAiInvocation prop.
7. AISidebar монтирует AISidebarAgent (вместо обычного chat UI).
8. AISidebarAgent.start() → window.api.invoke('ai:agent:run', {source})
9. main aiToolIpcHandlers → executor.runAgent
10. executor:
    - onStep({type: 'thinking', text: 'Анализирую...'})
    - LLM call → tool_use: get_chat_history
    - onStep({type: 'tool_call', name: 'get_chat_history'})
    - tool.handler → context.getMessages → реальный TDLib (v1.0.2)
    - onStep({type: 'tool_result', name: 'get_chat_history', result: {count: 15}})
    - LLM call → tool_use: reply_to_message
    - permission = confirm → onConfirmRequest
    - onStep({type: 'confirm_request', tool, args, deferredId})
11. AISidebarAgent ловит confirm_request → showModal(true).
12. AIConfirmModal показывает текст + таймер 3 сек.
13. Юзер кликает «Подтвердить».
14. ai:agent:confirm-response → main → resolves deferred.
15. executor продолжает:
    - tool.handler → context.sendMessage → TDLib отправляет
    - onStep({type: 'tool_result', name: 'reply_to_message', result: {sent: true}})
    - LLM call → финальный text
    - onStep({type: 'final', text: 'Готово, отправил ответ'})
16. AISidebarAgent показывает финал.
17. Юзер может закрыть sidebar.
```

---

## 6. AISidebar — основной компонент

### 6.1 Файл
`src/components/AISidebar.jsx`.

### 6.2 Режимы

```jsx
function AISidebar({pendingAiInvocation, ...}) {
  if (pendingAiInvocation) {
    return <AISidebarAgent {...} />  // режим агента
  }
  return <AIChat {...} />  // обычный чат с AI
}
```

### 6.3 Очистка после агента
Когда AISidebarAgent заканчивает (или юзер отменил) — зовёт `clearPendingAiInvocation()` → App.jsx обнуляет state → AISidebar возвращается в обычный режим.

---

## 7. Подводные камни

### 7.1 «AI кнопка» для webview уведомлений
**Принцип**: показываем только для native_*. Реализация:
```js
if (item.source && item.source.messengerId?.startsWith('native_')) {
  // показать кнопку
}
```
Если будущие webview мессенджеры тоже захотят AI — поменяем эту проверку.

### 7.2 Параллельные агенты
**Сценарий**: юзер кликнул «🤖 AI» на одно уведомление, потом сразу на другое.

**Текущее**: второй invoke перезаписывает state → первый агент **прерывается** (cancel + new start). Не идеально, но безопасно.

**TODO**: очередь агентов в UI «у вас 2 ожидающих агента».

### 7.3 LLM возвращает мусор (плохой JSON, не tool_use)
**Защита**: adapter (Anthropic/OpenAI) парсит ответ. Если структура не та — возвращает пустой `toolUses=[]`, executor завершает с `finalText` (даже если бессмысленный).

### 7.4 Очень долгий LLM ответ
**Защита**: `provider.call` имеет timeout (по умолчанию 60 сек). Превышение → throw → executor возвращает {ok: false, error: 'llm_timeout'}.

### 7.5 «Cancel» в момент tool execution
Handler **не прерывается** мгновенно. Если он зовёт TDLib send и TDLib уже отправил — сообщение **уже ушло**. Cancel прервёт только следующую итерацию агента.

**TODO**: `AbortSignal` поддержка в handler'ах (особенно в IO-bound: TDLib invoke).

---

## 8. Тесты Phase 3

| Файл | Тестов |
|---|---|
| AISidebarAgent.vitest.jsx | 8 |
| useAIAgent.vitest.js | 6 |
| AIConfirmModal.vitest.jsx | 5 |
| aiToolIpcHandlers.vitest.js (расширены) | дополнения к Phase 1 |
| **Итого Phase 3** | **~19 новых** |

---

## 9. Связь с другими фазами

| С чем связано | Как |
|---|---|
| **Phase 0** — source | Кнопка «🤖 AI» передаёт source в payload |
| **Phase 1** — tool registry | executor использует registry для lookup tool |
| **Phase 2** — permission/confirm | confirm_request шаг → ConfirmModal |
| **Phase 4** — Tasks/Reminders | AI может создать задачу из sidebar |
| **v1.0.2** — TDLib adapter | реальные read/write через context |

---

## 10. Что осталось

1. **Cancel signal в handler'ах** — особенно TDLib send (через AbortController).
2. **Очередь агентов** — UI «2 агента в работе».
3. **Re-try последнего шага** — если handler упал, кнопка «попробовать ещё раз».
4. **Show LLM thinking** — Anthropic Claude умеет stream thinking content. Показать в UI «как думает».
5. **Голосовой вход** — диктовка userPrompt вместо source-only.

---

**Версия документа**: создан 9 июня 2026 для v0.99.0 + v0.99.1 (Phase 3 + 3.5).
