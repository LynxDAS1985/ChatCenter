# 🌉 AI Bridge — план полной реализации (v1.2.0)

> **Цель**: программа сама проходит цикл «клиент написал → AI обработал → отправили клиенту». 4 провайдера (Anthropic / OpenAI / DeepSeek / ГигаЧат) + локальный (Ollama) + гибкая настройка селекторов.

**Создан**: 10 июня 2026, после v1.1.6 (баги исправлены, готовая база).

---

## 📋 Оглавление

1. [Что хотим — простыми словами](#1-что-хотим)
2. [Почему ЭТО решение лучшее — 6 фактов](#2-факты)
3. [Архитектура — общая картина](#3-архитектура)
4. [Контракты данных](#4-контракты)
5. [Поэтапный план — 11 шагов](#5-этапы)
6. [Файловая структура](#6-файлы)
7. [Поток данных — детально](#7-поток)
8. [UI макеты](#8-ui)
9. [Конфликты / Граничные / Безопасность](#9-риски)
10. [Тестирование](#10-тесты)
11. [Откат (rollback)](#11-rollback)
12. [Чек-лист готовности](#12-checklist)

---

## 1. Что хотим — простыми словами {#1-что-хотим}

### 1.1 Сценарий юзера

```
👤 Клиент пишет в Telegram (через TDLib backend):
   «Здравствуйте, когда будет готов счёт?»

🤖 ChatCenter автоматически:
   1. Видит сообщение (TDLib message:new)
   2. Берёт последние 10 сообщений как контекст
   3. Отправляет ВСЁ это в выбранный AI (по выбору юзера)
   4. AI генерирует ответ
   5. Программа извлекает ответ AI
   6. Показывает юзеру: «AI ответил: ... [📤 Отправить клиенту]»
   7. Клик «Отправить» → ответ уходит клиенту через TDLib

👤 Юзер видит результат — клиент получил ответ за 5-10 сек.
```

### 1.2 Зачем «AI Bridge» — почему нельзя проще

В проекте УЖЕ есть 3 несвязанных способа работы с AI:
- **API mode** (Phase 1+) — прямой HTTP к Anthropic/OpenAI с API ключом
- **WebView mode** (broken now) — встроенный сайт chat.openai.com, юзер сам копирует
- **AI Agent** (Phase 3) — кнопка «🤖 AI» в notification → AISidebarAgent

Юзер хочет **унифицированный** опыт:
- Один UI «AI готов ответить — отправить?»
- Можно **выбрать провайдера** (Anthropic API / chat.openai.com WebUI / Ollama / ГигаЧат)
- Можно **настроить** селекторы (если сайт изменился)
- Можно **переключаться** между режимами для одного провайдера

«AI Bridge» = тонкий слой между «AI работает» и «UI программы». Хочет получить ответ — обращается к Bridge. Bridge сам решает откуда (API / WebUI / Local) и возвращает.

### 1.3 Главное преимущество

Сейчас юзер делает **7 шагов руками** (читать → копировать → переключиться → вставить → нажать → дождаться → скопировать обратно → вставить клиенту).

После AI Bridge — **2 клика** (Спросить AI → Отправить ответ).

---

## 2. Почему ЭТО решение лучшее — 6 фактов {#2-факты}

### Факт 1 (🥈 код): Точный аналог уже работает в проекте

`main/preloads/monitor.preload.cjs` (474 строки) + `hooks/{telegram|whatsapp|vk|max}.hook.js` (619 строк суммарно).

Этот паттерн **в проде с v0.47.0** — больше года стабильной работы. Перехватывает Notification API + MutationObserver + IPC обратно в main. **То же самое** нам нужно для AI сайтов.

**Доказательство стабильности**: 4 мессенджера (Telegram Web K, WhatsApp Web, VK, MAX) — все работают через этот паттерн. Если бы он был хрупким — нашему проекту > 1 года было бы плохо.

### Факт 2 (🥈 код): Готовая инфраструктура подключения preload

`main/handlers/mainIpcHandlers.js:184-188` — `app:get-paths` IPC возвращает путь к preload. В production использует `out/preload/monitor.mjs` (electron-vite сборка). В dev — `main/preloads/monitor.preload.cjs` напрямую.

Для AI Bridge мы **добавляем** второй ключ: `aiMonitorPreload`. Тот же механизм, отдельный файл preload.

### Факт 3 (🥈 код): Per-host detection — уже паттерн

`src/utils/messengerConfigs.js:13-21`:
```js
export function detectMessengerType(url) {
  if (url.includes('web.telegram.org')) return 'telegram'
  if (url.includes('web.whatsapp.com')) return 'whatsapp'
  ...
}
```

Для AI Bridge — `src/utils/aiWebviewConfigs.js`:
```js
export function detectAiProvider(url) {
  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) return 'openai'
  if (url.includes('chat.deepseek.com')) return 'deepseek'
  if (url.includes('claude.ai')) return 'claude'
  if (url.includes('giga.chat')) return 'gigachat'
  return 'unknown'
}
```

Идентичный подход, проверенный.

### Факт 4 (🥈 код): IPC канал `app:log` готов

`src/hooks/useConsoleErrorLogger.js:10` — паттерн `window.api?.send('app:log', {level, message})` + наш страж `rendererConsoleGuard.test.cjs` (v1.1.6). Все логи AI Bridge пойдут в штатный лог-вьюер «📒 Логи ChatCenter».

### Факт 5 (🥇 уровень 1 — Electron docs): `<webview>` preload — официальный API

[Electron `<webview>` Tag docs](https://www.electronjs.org/docs/latest/api/webview-tag) явно: «The preload script is the only way to inject Node.js APIs into the webview content. The preload script runs before any scripts on the webpage». Это **гарантирует** что MutationObserver запустится до того как сайт начнёт работать.

Поддерживается с Electron 1.0. У нас **Electron 41** — стабильная LTS.

### Факт 6 (🥇 уровень 1 — Ollama docs): Локальный AI через HTTP

[Ollama API docs](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion):
```
POST http://localhost:11434/api/chat
Content-Type: application/json
{
  "model": "llama3",
  "messages": [{"role": "user", "content": "..."}],
  "stream": false
}
```

Стандартный HTTP, без OAuth, без SSL bypass. Реализуется простым `fetch`.

---

## 3. Архитектура — общая картина {#3-архитектура}

```
┌────────────────────────────────────────────────────────────────────┐
│                       RENDERER (src/)                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ AISidebar (UI)                                                │  │
│  │  - Показывает контекст клиента                                │  │
│  │  - Кнопка «📤 Спросить AI»                                    │  │
│  │  - После ответа: «AI ответил: ... [📤 Отправить]»             │  │
│  └────────────────┬─────────────────────────────────────────────┘  │
│                   ↓ useAIBridge hook                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ aiBridgeStore.js (renderer state + IPC wrapper)              │  │
│  │                                                              │  │
│  │  state: { mode, provider, lastAnswer, pending, error }       │  │
│  │  actions:                                                    │  │
│  │    sendQuestion({text, context, systemPrompt})               │  │
│  │    sendAnswerToClient(text) → tdlib reply_to_message        │  │
│  └────────────────┬─────────────────────────────────────────────┘  │
│                   ↓ window.api.invoke('ai-bridge:send', ...)        │
└───────────────────┼─────────────────────────────────────────────────┘
                    ↓ IPC
┌───────────────────┼─────────────────────────────────────────────────┐
│                   ↓                                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ aiBridgeIpcHandlers.js — router                              │  │
│  │                                                              │  │
│  │  invoke('ai-bridge:send', {mode, provider, text, ...}) →     │  │
│  │    if (mode === 'api')   → apiBridge.send(...)              │  │
│  │    if (mode === 'webui') → webuiBridge.send(...)            │  │
│  │    if (mode === 'local') → localBridge.send(...)            │  │
│  └──┬──────────────────┬──────────────────────┬─────────────────┘  │
│     ↓                  ↓                      ↓                     │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────┐              │
│  │ apiBridge│  │  webuiBridge     │  │ localBridge  │              │
│  │          │  │                  │  │              │              │
│  │ оборачи- │  │ 1. find webview  │  │ HTTP POST    │              │
│  │ вает     │  │    by partition  │  │ localhost:   │              │
│  │ aiPro-   │  │ 2. executeJS:    │  │ 11434/api    │              │
│  │ vider-   │  │    __ccAiInject  │  │ /chat        │              │
│  │ Caller   │  │ 3. ждёт ответ    │  │              │              │
│  │ (v0.99+) │  │    через IPC от  │  │ (Ollama /    │              │
│  │          │  │    preload       │  │  LM Studio)  │              │
│  └─────┬────┘  └──────┬───────────┘  └──────┬───────┘              │
│        │              ↑                     │                       │
│        │              │ 'ai-bridge:answer'  │                       │
│        │              │ от preload          │                       │
│        ↓              │                     ↓                       │
│        ─────────────  Promise  ──────────────                       │
│                       resolve                                       │
│                       (ответ AI)                                    │
│                              ↓                                       │
│           webContents.send('ai-bridge:answer', text)                │
│                              ↓                                       │
└──────────────────────────────┼─────────────────────────────────────┘
                               ↓
┌──────────────────────────────┼─────────────────────────────────────┐
│                              ↓                                      │
│   aiBridgeStore.onAnswer(text)                                      │
│        ↓                                                            │
│   AISidebar показывает: «AI ответил: ...»                           │
│        ↓ (клик «📤 Отправить»)                                       │
│   sendAnswerToClient → tdlibBackend.send → клиент видит ответ       │
└─────────────────────────────────────────────────────────────────────┘

         (параллельно, для WebUI mode)
┌─────────────────────────────────────────────────────────────────────┐
│  <webview src={chat.openai.com}                                      │
│           partition="persist:ai-webview"                             │
│           preload={ai-monitor.preload.cjs}>                          │
│                                                                      │
│  Внутри webview (sandbox):                                           │
│    ai-monitor.preload.cjs загружается ПЕРВЫМ                         │
│      → detect url → load hooks/ai/openai.hook.js                    │
│      → openai.hook.js определяет:                                    │
│         window.__ccAiInjectQuestion(text)  // для main → executeJS  │
│         MutationObserver на assistant messages                       │
│      → когда AI закончил ответ:                                      │
│         ipcRenderer.sendToHost('ai-bridge:answer', {text, provider})│
│                                                                      │
│  (При закрытии sidebar webview остаётся живой — сохраняет login)    │
└─────────────────────────────────────────────────────────────────────┘
```

### Главные принципы

1. **Один интерфейс для 3 реализаций** — UI не знает откуда ответ
2. **Per-provider hook** — каждый AI сайт имеет свой файл с селекторами
3. **Юзер может настроить** селекторы через UI (если сайт изменился)
4. **Fallback на clipboard** — если автоматическая вставка не сработала
5. **Тот же паттерн** что и для мессенджеров — нет «изобретения велосипеда»

---

## 4. Контракты данных {#4-контракты}

### 4.1 Question — что отправляем в AI

```typescript
interface AiBridgeQuestion {
  text: string                  // главное сообщение от клиента
  context: ContextMessage[]     // последние 10 сообщений (опционально)
  systemPrompt: string          // настраиваемый prompt из settings
  source: NotificationSource    // паспорт сообщения (chatId/messageId)
  mode: 'api' | 'webui' | 'local'
  provider: 'anthropic' | 'openai' | 'deepseek' | 'gigachat' | 'local'
  model?: string                // override default model
  timeout?: number              // default 60 сек
}

interface ContextMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
  sender?: string               // имя отправителя для контекста
  timestamp?: number
}
```

### 4.2 Answer — что приходит обратно

```typescript
interface AiBridgeAnswer {
  ok: boolean
  text?: string                 // ответ AI (если ok)
  error?: string                // причина если !ok
  durationMs: number
  provider: string              // фактический провайдер (после fallback)
  mode: 'api' | 'webui' | 'local'
  rawResponse?: object          // полный response для debug (опционально)
}
```

### 4.3 Settings (хранится в electron-store)

```typescript
interface AiBridgeSettings {
  // Активная конфигурация
  activeMode: 'api' | 'webui' | 'local'
  activeProvider: string

  // Per-provider настройки (расширение существующего aiProviderKeys)
  aiProviderKeys: {
    [providerId: string]: {
      mode: 'api' | 'webui'           // ← НОВОЕ: mode уже per-provider
      apiKey?: string                  // для api mode
      clientSecret?: string            // для gigachat
      model?: string
      webviewUrl?: string              // для webui mode
      contextMode: 'none' | 'last' | 'full'
      // ⭐ НОВОЕ: пользовательские селекторы (если default не работает)
      customSelectors?: {
        input?: string
        submitButton?: string
        lastAssistantMessage?: string
        streamingIndicator?: string
      }
    }
  }

  // Local AI (Ollama)
  localAi?: {
    enabled: boolean
    url: string                        // http://localhost:11434
    defaultModel: string               // llama3
    timeout: number                    // ms
  }

  // Общие
  bridgeSystemPrompt: string           // default «Ты помощник менеджера...»
  bridgeContextSize: number            // 1-50, default 10
  bridgeAutoSendOnEnter: boolean       // отправлять Enter'ом
}
```

### 4.4 Hook file contract (для каждого AI сайта)

```typescript
// hooks/ai/<provider>.hook.js — инжектируется внутрь webview сайта AI
interface AiHookContract {
  // Глобальная функция — main вызывает через executeJavaScript
  '__ccAiInjectQuestion': (text: string) => {
    ok: boolean
    error?: string
  }

  // Hook сам шлёт через ipcRenderer.sendToHost когда AI ответил
  // (Это слушает webview parent — наш main процесс)
  'ai-bridge:answer': {
    provider: string
    text: string
    timestamp: number
    streamingComplete: true       // только когда AI закончил
  }

  // Дополнительные события (опционально):
  'ai-bridge:streaming': { partialText: string }
  'ai-bridge:error': { error: string }
  'ai-bridge:auth-required': { reason: string }  // Cloudflare, captcha
}
```

---

## 5. Поэтапный план — 11 шагов {#5-этапы}

Каждый шаг = отдельный commit с тестами. После каждого — проверка и rollback план.

### Этап 0 (PRE-REQUISITE): fix v1.1.7

**Прежде чем делать AI Bridge** — починить set() баг (см. предыдущий план Часть 1, Вариант B).

Без этого переключатель режима не работает → AI Bridge не получит правильный mode из settings.

**Объём**: 1.5 ч. **Выход**: v1.1.7 готова к интеграции.

---

### Этап 1: Контракты + папки + types

**Цель**: создать каркас без логики, чтобы все знали что писать дальше.

**Делаем**:
- Создать папки: `src/utils/aiBridge/`, `main/ai/bridge/`, `main/preloads/hooks/ai/`
- `src/utils/aiBridge/contracts.js` — JSDoc типы для Question/Answer/Settings
- `src/utils/aiWebviewConfigs.js` — `detectAiProvider(url)` + дефолтные селекторы для 4 провайдеров (на основе текущих SELECTORS из v1.1.4)
- `main/ai/bridge/router.js` — пустой router с case по mode

**Тесты**:
- `aiWebviewConfigs.vitest.js` — detection by URL (4 положительных + 1 unknown)
- Контракт пуст — нет логики для теста

**Выход**: v1.2.0-alpha.1. Существующий код работает как раньше.

**Объём**: 1.5 ч.

**Rollback**: `git revert <commit>` — никакой код прода не задет.

---

### Этап 2: Local Bridge (самый простой — нет UI зависимостей)

**Почему первым**: проверяет всю цепочку IPC без преlogad/webview. Если Local работает — каркас правильный.

**Делаем**:
- `main/ai/bridge/localBridge.js` — `sendQuestion(payload)` через fetch к Ollama
  - Параметр `url` из settings (default `http://localhost:11434/api/chat`)
  - Параметр `model` (default `llama3`)
  - Timeout через AbortController
  - Поддержка `messages` массив (OpenAI-compatible Ollama API)
- `main/handlers/aiBridgeIpcHandlers.js` — `ipcMain.handle('ai-bridge:send', router)`
- `src/utils/aiBridge/index.js` — renderer-side: `aiBridge.sendQuestion(...)` через invoke

**Тесты**:
- `localBridge.vitest.js` — mock fetch, проверка body структуры (Ollama API)
- Тест timeout (AbortController срабатывает)
- Тест сетевой ошибки (graceful fail с error)
- IPC handler — mock invoke возвращает правильную структуру

**UI вручную**: добавить в Settings → AI → новый провайдер «🖥 Локальный (Ollama)» с полями URL + модель.

**Выход**: v1.2.0-alpha.2. Юзер может писать промпт в AISidebar (через будущий UI) и получать ответ от Ollama.

**Объём**: 4 ч.

**Rollback**: ipcHandler можно убрать через `ipcMain.removeHandler('ai-bridge:send')` в случае bug. Settings обратно совместимы.

---

### Этап 3: API Bridge (обёртка над существующим)

**Делаем**:
- `main/ai/bridge/apiBridge.js` — `sendQuestion(payload)` через существующий `callProviderFn` (создан в v1.0.2)
- Маппинг payload → формат aiProviderCaller
- **Не использует** tool use (это для AI Agent, не Bridge). Просто текст-ответ.
- Поддержка multi-provider fallback (через v1.1.3 `aiProviderFallback`)

**Тесты**:
- `apiBridge.vitest.js` — mock callProviderFn, проверка маппинга
- Тест fallback (если первый провайдер упал)
- Тест с разными провайдерами (anthropic / openai / deepseek / gigachat)

**Выход**: v1.2.0-alpha.3. Для всех 4 провайдеров через API работает Bridge.

**Объём**: 2.5 ч.

**Rollback**: модуль не используется в существующих местах → удаление = откат.

---

### Этап 4: WebUI Bridge — preload skeleton

**Самый рискованный этап** — здесь начинается работа с webview.

**Делаем**:
- `main/preloads/ai-monitor.preload.cjs` — скелет:
  - Detect URL → load `hooks/ai/${provider}.hook.js`
  - Setup IPC channel для ответов hook'а
  - Cleanup при unload
- `main/preloads/hooks/ai/.hookTemplate.js` — шаблон hook'а (для документации, не загружается)
- Регистрация preload пути в `app:get-paths` IPC handler (добавить ключ `aiMonitorPreload`)
- `electron.vite.config.js` — собрать новый preload в production

**Тесты**:
- `ai-monitor.preload.vitest.js` — mock fs.readFileSync + detect URL + injection
- E2E тест отложен (требует реальный webview)

**UI**: ещё нет — preload подключится только когда добавим webview tag (Этап 6).

**Выход**: v1.2.0-alpha.4. Preload готов, hook файлы пустые.

**Объём**: 3 ч.

**Rollback**: путь к preload не используется в webview tag → preload не загружается → нет влияния.

---

### Этап 5: WebUI Bridge — OpenAI hook (MVP)

**Делаем первый провайдер** — chat.openai.com:
- `main/preloads/hooks/ai/openai.hook.js`:
  - SELECTORS константа (input/submit/response/streaming)
  - `window.__ccAiInjectQuestion(text)` — global function
  - MutationObserver на `<main>` → debounce 800мс → когда `.result-streaming` пропал → шлём ответ
  - `ipcRenderer.sendToHost('ai-bridge:answer', payload)`
  - **НЕ блокирует** обычное использование сайта юзером

**Тесты**:
- Hook unit-тест: jsdom + mock DOM с структурой OpenAI → MutationObserver срабатывает → ответ отправляется
- Тест injection: вызов __ccAiInjectQuestion → input.value меняется + submit clicked
- Тест streaming detection: пока `.result-streaming` есть → ответ НЕ шлётся

**UI**: в AISidebar для webview mode подключить `<webview preload={aiMonitorPreloadPath}>` и event listener `ipc-message` для получения ответов от hook'а.

**Выход**: v1.2.0-alpha.5. **Первый прототип**: OpenAI WebUI работает end-to-end.

**Объём**: 5 ч.

**Rollback**: удалить hook файл + убрать preload из webview tag.

---

### Этап 6: WebUI Bridge — остальные 3 провайдера

**Делаем**:
- `hooks/ai/deepseek.hook.js`
- `hooks/ai/claude.hook.js`
- `hooks/ai/gigachat.hook.js`

Каждый — копия openai.hook.js со своими SELECTORS. Базовая структура одинакова — снижает риск ошибки.

**Тесты**: один общий test runner который для каждого hook прогоняет:
- Detection by URL
- Injection через `__ccAiInjectQuestion`
- MutationObserver triggers
- Streaming completion detection

**Выход**: v1.2.0-alpha.6. Все 4 web провайдера работают.

**Объём**: 4 ч. (по 1 часу на провайдер).

**Rollback**: удалить hook файлы — preload загружает с fallback на openai.

---

### Этап 7: UI — AIBridgePanel + интеграция с AISidebar

**Делаем**:
- `src/components/AIBridgePanel.jsx`:
  - Показывает текст клиента + контекст
  - Кнопка «📤 Спросить AI»
  - После ответа: `<div>AI: ${answer}</div>` + кнопки [📤 Отправить] [✏ Изменить] [🔄 Заново] [📋 Копировать]
  - Loading state «AI думает...»
  - Error state «❌ Ошибка: ...»
- `src/hooks/useAIBridge.js` — обёртка над `aiBridgeStore` для React
- `src/stores/aiBridgeStore.js` — renderer state
- Интеграция в `AISidebar.jsx` — показывать AIBridgePanel когда есть `lastMessage` от клиента

**Тесты**:
- AIBridgePanel render — кнопки появляются при правильном state
- Loading → Answer → Send flow
- Error display

**Выход**: v1.2.0-alpha.7. **Полный UX готов** — клиент пишет → AI отвечает → юзер отправляет одним кликом.

**Объём**: 4 ч.

**Rollback**: вернуть исходный AISidebar render. AIBridgePanel не используется в других местах.

---

### Этап 8: UI настройки селекторов (защита от изменения сайтов)

**Делаем**:
- `src/components/AIWebviewSelectorsConfig.jsx`:
  - Для каждого провайдера форма с 4 input полями (input/submit/response/streaming)
  - Кнопка «🔍 Тестировать» — выделяет элемент в webview через executeJavaScript (border: 2px red)
  - Кнопка «Сбросить на default»
  - Сохранение в `settings.aiProviderKeys[pid].customSelectors`
- Hook читает customSelectors из settings (через IPC `ai-bridge:get-config`)

**Тесты**:
- UI render + изменение поля + save
- Hook читает custom selectors вместо default
- Тестирование = подсвечивает элемент через `outline: 3px solid red`

**Выход**: v1.2.0-alpha.8. Юзер может **сам** обновлять селекторы если OpenAI обновил DOM.

**Объём**: 3 ч.

**Rollback**: убрать UI компонент. Custom selectors не читаются — fallback на defaults в hook файлах.

---

### Этап 9: Clipboard fallback + multi-bridge fallback chain

**Делаем**:
- Если WebUI mode + hook сломался (selectors не нашлись) → автоматический fallback на clipboard
- При выделении текста в webview AI → tooltip «📋 Использовать как ответ?»
- Multi-bridge chain: settings определяет порядок (`api → webui → local` или любой)
- Если первый упал → пробуем следующий

**Тесты**:
- Fallback chain симуляция (mock сломанного primary)
- Clipboard watcher на focus change в webview

**Выход**: v1.2.0-alpha.9. Надёжность повышена.

**Объём**: 2 ч.

**Rollback**: убрать chain logic — поведение возвращается к single-bridge.

---

### Этап 10: Документация + e2e

**Делаем**:
- Обновить `phase-ai-bridge-impl.md` (этот файл → implementation версия) с реальными примерами
- Обновить `current-state-v1.2.0.md` snapshot
- Чек-лист ручного тестирования `testing-checklist-v1.2.0.md`
- Обновить `roadmap-deferred.md` — отметить что сделано

**Тесты**:
- Manual checklist (юзер проходит по чек-листу)
- E2E НЕ делаем (реальные сайты дорого тестить автоматически)

**Объём**: 2 ч.

---

### Этап 11: Release v1.2.0

**Делаем**:
- WhatsNewModal entry в changelogData.js
- Поднять версию 1.1.7 → 1.2.0
- Финальная регрессия: lint + vitest + fileSizeLimits + check-memory + pre-push
- Commit + push
- Tag v1.2.0 в git

**Объём**: 0.5 ч.

---

## 📊 Итого

| Этап | Объём | Накопительный |
|---|---|---|
| 0. Fix v1.1.7 | 1.5 ч | 1.5 ч |
| 1. Контракты | 1.5 ч | 3 ч |
| 2. Local Bridge | 4 ч | 7 ч |
| 3. API Bridge | 2.5 ч | 9.5 ч |
| 4. Preload skeleton | 3 ч | 12.5 ч |
| 5. OpenAI hook (MVP) | 5 ч | 17.5 ч |
| 6. 3 остальных hook | 4 ч | 21.5 ч |
| 7. UI AIBridgePanel | 4 ч | 25.5 ч |
| 8. Selectors config UI | 3 ч | 28.5 ч |
| 9. Clipboard fallback | 2 ч | 30.5 ч |
| 10. Документация | 2 ч | 32.5 ч |
| 11. Release | 0.5 ч | **33 ч** |

---

## 6. Файловая структура {#6-файлы}

### Новые файлы (renderer)

```
src/
├── utils/
│   ├── aiBridge/
│   │   ├── contracts.js          # JSDoc типы (Question/Answer)
│   │   ├── index.js              # public API: aiBridge.sendQuestion()
│   │   └── store.js              # renderer state
│   ├── aiWebviewConfigs.js       # detectAiProvider(url) + default selectors
│   └── aiBridgeFallback.js       # multi-bridge chain (api → webui → local)
├── components/
│   ├── AIBridgePanel.jsx         # UI «AI ответил: ...»
│   └── AIWebviewSelectorsConfig.jsx  # настройки селекторов
├── hooks/
│   └── useAIBridge.js            # React hook
├── stores/
│   └── aiBridgeStore.js          # renderer state + IPC wrapper
└── __tests__/
    ├── aiBridge.vitest.js
    ├── aiBridgeStore.vitest.js
    ├── AIBridgePanel.vitest.jsx
    └── aiWebviewConfigs.vitest.js
```

### Новые файлы (main)

```
main/
├── ai/
│   └── bridge/
│       ├── router.js             # routes по mode
│       ├── apiBridge.js          # обёртка aiProviderCaller
│       ├── webuiBridge.js        # webview.executeJavaScript flow
│       ├── localBridge.js        # Ollama HTTP
│       └── *.vitest.js          # тесты
├── handlers/
│   └── aiBridgeIpcHandlers.js    # IPC: 'ai-bridge:send', 'ai-bridge:answer', ...
└── preloads/
    ├── ai-monitor.preload.cjs    # preload скрипт для AI сайтов
    └── hooks/
        └── ai/
            ├── openai.hook.js
            ├── deepseek.hook.js
            ├── claude.hook.js
            ├── gigachat.hook.js
            └── .hookTemplate.js  # template для добавления новых провайдеров
```

### Изменения (расширения existing)

```
src/
├── App.jsx                       # + aiMonitorPreloadUrl state
├── components/
│   ├── AISidebar.jsx             # + AIBridgePanel + webview preload
│   ├── AIConfigPanel.jsx         # + Local provider + setProviderProp fix
│   └── (mode переключатель починен в Этапе 0)
├── utils/
│   └── aiProviders.js            # + 'local' в PROVIDERS массив

main/
├── main.js                       # + initAiBridgeIpcHandlers
├── handlers/
│   └── mainIpcHandlers.js        # + aiMonitorPreload путь в app:get-paths
└── (aiProviderCaller.js не трогаем — apiBridge просто обёртка)
```

### Конфиги

```
electron.vite.config.js           # + entry для ai-monitor.preload.cjs
package.json                      # + build.files для hooks/ai/
src/__tests__/
└── ipcChannels.test.cjs          # + scan aiBridgeIpcHandlers.js
```

---

## 7. Поток данных — детально {#7-поток}

### Сценарий A: WebUI mode (юзер залогинен на chat.openai.com)

```
ШАГ 1. ПРИХОД СООБЩЕНИЯ ОТ КЛИЕНТА
──────────────────────────────────
TDLib client → emit('message:new', {chatId, message})
nativeStoreIpc → создаёт NotificationSource source
App.jsx setLastMessage(message.text)

ШАГ 2. ОТКРЫТИЕ AI BRIDGE
─────────────────────────
Юзер открыл AISidebar (или он был открыт)
AISidebar видит lastMessage → рендерит AIBridgePanel:
  ┌────────────────────────────┐
  │ Клиент: "когда счёт?"       │
  │ Контекст: 10 сообщений      │
  │ [📤 Спросить AI]            │
  └────────────────────────────┘

ШАГ 3. ЮЗЕР КЛИКАЕТ «СПРОСИТЬ»
──────────────────────────────
AIBridgePanel.onClick → aiBridge.sendQuestion({
  text: lastMessage,
  context: chatHistory.slice(-10),
  systemPrompt: settings.bridgeSystemPrompt,
  source: notificationSource,
  mode: settings.aiProviderKeys.openai.mode || 'api',
  provider: 'openai',
})

ШАГ 4. RENDERER → MAIN (IPC)
────────────────────────────
window.api.invoke('ai-bridge:send', payload)
  → aiBridgeIpcHandlers.handle('ai-bridge:send', router)
  → router: mode='webui' → webuiBridge.send(payload)

ШАГ 5. MAIN → WEBVIEW (executeJavaScript)
─────────────────────────────────────────
webuiBridge:
  1. Найти все BrowserWindow / webview с partition='persist:ai-webview'
  2. Для каждого: получить getURL() и detect provider
  3. Если найден webview с provider='openai':
       webview.executeJavaScript(`
         window.__ccAiInjectQuestion(${JSON.stringify(payload.text)})
       `)
  4. Создать Promise который ждёт IPC 'ai-bridge:answer' с правильным provider
  5. Timeout 60 сек

ШАГ 6. ВНУТРИ WEBVIEW (preload hook)
────────────────────────────────────
openai.hook.js (загружен через ai-monitor.preload.cjs):
  __ccAiInjectQuestion('когда счёт?'):
    textarea = document.querySelector('#prompt-textarea')
    nativeSetter.call(textarea, 'когда счёт?')
    textarea.dispatchEvent(new Event('input', {bubbles: true}))
    setTimeout(() => {
      button = document.querySelector('[data-testid="send-button"]')
      button.click()
    }, 100)
    return { ok: true }

ШАГ 7. AI ОТВЕЧАЕТ
──────────────────
Сайт chat.openai.com шлёт SSE → отображает текст постепенно
MutationObserver в hook видит изменения в `<main>`:
  - Сначала `.result-streaming` присутствует (AI пишет)
  - Каждое изменение → debounce 800мс → проверка
  - Когда `.result-streaming` пропал → AI закончил
  - Извлекаем последний [data-message-author-role="assistant"] .markdown
  - ipcRenderer.sendToHost('ai-bridge:answer', {
      provider: 'openai',
      text: 'Счёт будет к 18:00...',
      timestamp: Date.now(),
    })

ШАГ 8. WEBVIEW → MAIN (sendToHost)
──────────────────────────────────
webuiBridge слушает 'ipc-message' на webview:
  Когда получено 'ai-bridge:answer' с провайдером='openai':
  → resolve Promise из ШАГ 5 с {ok: true, text: '...'}

ШАГ 9. MAIN → RENDERER (response)
─────────────────────────────────
router возвращает результат через invoke:
  { ok: true, text: 'Счёт будет к 18:00...', durationMs: 4200,
    provider: 'openai', mode: 'webui' }

ШАГ 10. RENDERER ПОКАЗЫВАЕТ ОТВЕТ
─────────────────────────────────
aiBridgeStore.setLastAnswer(response.text)
AIBridgePanel рендерит:
  ┌──────────────────────────────────────┐
  │ ✅ AI ответил:                        │
  │                                      │
  │ «Счёт будет к 18:00 сегодня,         │
  │  отправим на почту [email]»          │
  │                                      │
  │ [📤 Отправить клиенту]               │
  │ [✏ Редактировать] [🔄] [📋]          │
  └──────────────────────────────────────┘

ШАГ 11. ЮЗЕР КЛИКАЕТ «ОТПРАВИТЬ»
─────────────────────────────────
aiBridgeStore.sendAnswerToClient(text):
  → window.api.invoke('ai-bridge:send-to-client', {
      source: notificationSource,
      text: answer,
    })
  → main: использует существующий context.sendMessage
    (из v1.0.2 aiAgentBackendAdapter)
  → tdlibBackend.messages.send(chatId, text, replyTo: source.messageId)
  → TDLib отправляет → клиент получает ответ

ШАГ 12. AUDIT LOG
─────────────────
appendAuditRecord({
  actor: 'user',                  // юзер сам отправил
  actionId: 'ai-bridge:send',
  ruleId: null,
  source: notificationSource,
  output: { provider: 'openai', mode: 'webui', durationMs: 4200 },
  executionResult: 'ok',
})
```

### Сценарий B: API mode (тот же flow, но без webview)

```
ШАГ 4-9 (заменяются):
  router: mode='api' → apiBridge.send(payload)
  apiBridge:
    1. Использует callProviderFn (созданный в v1.0.2)
    2. Поддерживает multi-provider fallback (v1.1.3)
    3. Прямой HTTP к Anthropic/OpenAI/DeepSeek/ГигаЧат
    4. Парсит response.choices[0].message.content (OpenAI-format)
       или response.content[0].text (Anthropic-format)
  Возвращает напрямую — без preload, без webview.
```

### Сценарий C: Local mode (Ollama)

```
ШАГ 4-9:
  router: mode='local' → localBridge.send(payload)
  localBridge:
    POST http://localhost:11434/api/chat
    body: {model, messages, stream: false}
    Парсит response.message.content
  Никакого webview, никакого AbortController на streaming.
```

---

## 8. UI макеты {#8-ui}

### 8.1 AIBridgePanel — в AISidebar

```
┌────────────────────────────────────────────────────┐
│ 🤖 AI ассистент                              ⚙ ✕  │
├────────────────────────────────────────────────────┤
│ Клиент: «Когда будет счёт?»                        │
│ Чат: «БНК-Авто» · 14:32                            │
│                                                    │
│ Контекст (последние 10):                           │
│  · «Здравствуйте, мы вчера обсуждали...»          │
│  · «Помню, готовлю КП»                            │
│  · ... (свернуть ▾)                               │
│                                                    │
│ Провайдер: [OpenAI (WebUI) ▼]                      │
│                                                    │
│ ┌────────────────────────────────────────────────┐ │
│ │           📤 Спросить AI                       │ │
│ └────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### 8.2 AIBridgePanel — после ответа

```
┌────────────────────────────────────────────────────┐
│ 🤖 AI ассистент — ✅ Ответ готов                   │
├────────────────────────────────────────────────────┤
│ Запрос: «когда счёт?»                              │
│                                                    │
│ AI ответил (через OpenAI WebUI, 4.2 сек):          │
│ ┌────────────────────────────────────────────────┐ │
│ │ Счёт будет готов к 18:00 сегодня, отправим    │ │
│ │ на email указанный в договоре.                 │ │
│ │                                                │ │
│ │ Если нужно срочнее — напишите, согласуем.     │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ┌────────────────────────────────────────────────┐ │
│ │ ✏ Редактировать перед отправкой ▾             │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ [📤 Отправить клиенту] [🔄 Заново] [📋] [❌]       │
└────────────────────────────────────────────────────┘
```

### 8.3 AIWebviewSelectorsConfig — настройки

```
┌──────────────────────────────────────────────────────┐
│  ⚙ Настройки селекторов: OpenAI                 ✕  │
├──────────────────────────────────────────────────────┤
│ Если AI не отвечает или ответ не извлекается        │
│ — настрой селекторы под текущую версию сайта.        │
│                                                      │
│ Поле ввода вопроса:                                  │
│ [#prompt-textarea                                ] [🔍]│
│ ✓ найден элемент: <textarea>                         │
│                                                      │
│ Кнопка «Отправить»:                                  │
│ [[data-testid="send-button"]                     ] [🔍]│
│ ✓ найден элемент: <button>                           │
│                                                      │
│ Последний ответ AI:                                  │
│ [[data-message-author-role="assistant"]:last...  ] [🔍]│
│ ✓ найден элемент: <div class="markdown">             │
│                                                      │
│ Индикатор «AI пишет...»:                             │
│ [.result-streaming                               ] [🔍]│
│ ✓ найден элемент: <div>                              │
│                                                      │
│ Метод отправки:                                      │
│ (●) Клик кнопки   (○) Enter   (○) Оба                │
│                                                      │
│       [↺ Сбросить] [💾 Сохранить] [❌ Отмена]        │
└──────────────────────────────────────────────────────┘
```

### 8.4 Local Provider в Settings → AI

```
┌──────────────────────────────────────────────────────┐
│  ⚙ AI провайдеры                                ✕  │
├──────────────────────────────────────────────────────┤
│ Активный провайдер:                                  │
│ (●) Anthropic     (○) OpenAI     (○) DeepSeek         │
│ (○) ГигаЧат       (●) 🖥 Локальный (Ollama)           │
│                                                      │
│ ── 🖥 Локальный (Ollama) ──                          │
│ URL сервера:                                         │
│ [http://localhost:11434                              ]│
│                                                      │
│ Модель:                                              │
│ [llama3 ▼]                                           │
│  ├─ llama3 (8B, рекомендую для большинства)         │
│  ├─ llama3:70b (мощнее, нужно 64+ GB RAM)           │
│  ├─ mistral (быстрый, 7B)                            │
│  └─ qwen2.5-coder (для кода)                         │
│                                                      │
│ Timeout: [120] сек                                   │
│                                                      │
│ Статус: ✅ Подключён (Ollama 0.5.4)                  │
│                                                      │
│        [🔌 Проверить соединение]                     │
└──────────────────────────────────────────────────────┘
```

---

## 9. Конфликты / Граничные / Безопасность {#9-риски}

### 9.1 Совместимость со стеком

| Компонент | Версия | Совместимо? |
|---|---|---|
| Electron | 41.1.0 | ✅ `<webview>` preload работает с Electron 1.0+ |
| React | 19.2.4 | ✅ JSX компоненты без специфики версии |
| electron-vite | 5.0.0 | ✅ multi-entry preload — стандарт |
| TDLib (tdl 8.1.0) | — | ✅ не задеваем |
| `aiProviderCaller` | v1.0.2-v1.1.4 | ✅ только обёртка вокруг |

### 9.2 Граничные случаи

| Случай | Поведение | Защита |
|---|---|---|
| Пустой текст вопроса | early return error 'empty_question' | validation в sendQuestion |
| Пустой context | OK, отправляем только текст | default empty array |
| AI ответ > 10000 символов | Полный сохраняем, UI показывает первые 2000 + «развернуть» | truncation в renderer only |
| Webview не залогинен (показывает login) | Hook видит SELECTORS.input == null → возвращает 'auth_required' | UI шлёт юзеру «Залогиньтесь в [openai.com]» |
| Сайт обновился, селекторы сломались | Hook не находит элемент → 'selectors_broken' | UI открывает Selectors Config + clipboard fallback |
| Параллельные вопросы (юзер 2 раза кликнул) | Второй ждёт первый (queue) | Promise в webuiBridge |
| Ollama не запущен | fetch fail → 'local_not_available' | UI показывает инструкцию «Запустите Ollama: `ollama serve`» |
| API ключ невалиден | HTTP 401 → 'invalid_api_key' | Через aiProviderFallback пробуем других |
| AI отвечает > 60 сек (timeout) | AbortController срабатывает | retry 1 раз, потом fail |
| Cloudflare капча | Hook видит специфический DOM → 'captcha_required' | UI «Решите капчу в окне AI» |
| Несколько webview одного провайдера (если юзер открыл 2) | Берём первый (или активный) | `findFirstWithProvider` |
| Webview закрыт между sendQuestion и ответом | Promise rejects с 'webview_closed' | timeout fallback |
| AI начал отвечать, потом юзер кликнул Stop в сайте | streamingIndicator пропал → возьмём partial ответ | как фича — лучше частичный чем ничего |

### 9.3 Опасные зоны

#### 🔴 Зона 1: Безопасность (privacy)

**Угроза**: preload видит **весь** чат с AI — всю историю общения, все секреты юзера которые он AI рассказывал.

**Защита** (обязательно):
- ❌ **НИКОГДА** не логировать содержимое в `chatcenter.log` (только metadata: provider, durationMs, без text)
- ❌ **НИКОГДА** не отправлять preload data в audit log с полным text (только hash или first 100 chars)
- ❌ **НИКОГДА** не сохранять на диск (state только в RAM renderer)
- ✅ Если ответ > 5000 символов — хранить **только последний** в state (не история)
- ✅ Закрытие AISidebar → очистка `lastAnswer` из state
- ✅ Тест-страж: проверка что `appendAuditRecord` не получает `text` поле для actor='user' bridge actions

#### 🔴 Зона 2: ToS веб-сайтов AI

**Угроза**: chat.openai.com Terms of Service: «You may not access the Services using automated tooling». Аналогично у Anthropic / DeepSeek.

**Реальность**:
- Наш Bridge **автоматизирует** действия юзера
- Это **тот же** уровень что `monitor.preload.cjs` для WhatsApp Web — паттерн годами работает у вас
- Но: если **много** автоматизированных запросов — OpenAI может **заблокировать аккаунт**

**Защита**:
- Cooldown: minimum 3 сек между запросами (как в monitor.preload.cjs)
- UI warning: «WebUI mode — автоматизация ChatGPT. При массовом использовании риск блокировки. Для production используйте API mode.»
- НЕ показывать webview в headless состоянии — юзер должен видеть что AI используется
- НЕ скрывать индикатор «typing...» от юзера

#### 🔴 Зона 3: API ключи / OAuth tokens

**Угроза**: ГигаЧат токены хранятся в `aiTokenCache` в RAM main. API ключи в electron-store.

**Защита** (УЖЕ есть):
- ✅ electron-store шифрование через keytar (где доступно)
- ✅ Никогда в renderer
- ✅ Никогда в логах (`smartStringify` в logger.js обрезает Error stack без content)

#### 🔴 Зона 4: SSL bypass (gigachat)

**Угроза**: `httpsPostSkipSsl` использует `rejectUnauthorized: false`. Это **специально** для сертификата Минцифры.

**Защита** (УЖЕ есть):
- Используется **только** через `getGigaChatToken` и `callGigaChat` — внутренние функции
- В Bridge: apiBridge для gigachat использует существующий callProviderFn → bypass только для известных Сбер URL

**Risk for v1.2.0**: Если в Bridge юзер укажет произвольный URL (например `localUrl: 'https://evil.com'`) для Local mode — мы используем обычный fetch (не httpsPostSkipSsl) → SSL проверяется нормально. ✅

#### 🔴 Зона 5: Пользовательские данные (settings)

**Угроза**: миграция `mode` из корня settings → `aiProviderKeys[pid].mode` (наследие моих v1.1.5 багов).

**Защита**:
- Миграция читает + записывает, **НЕ удаляет** старое `settings.mode` 1-2 версии
- Перед миграцией — **бэкап** settings.json копируется в settings.json.bak

### 9.4 Performance

**Угрозы**:
- MutationObserver hyperactive (тяжёлые SPA = тысячи событий/сек)
- executeJavaScript синхронный — может блокировать

**Защита**:
- debounce 800мс — как доказано в monitor.preload.cjs
- cooldown 3 сек между check
- executeJavaScript всегда async с timeout

---

## 10. Тестирование {#10-тесты}

### 10.1 Unit-тесты (vitest)

| Файл | Что тестирует | Mock |
|---|---|---|
| `aiWebviewConfigs.vitest.js` | detectAiProvider, default selectors | — |
| `aiBridge.vitest.js` | renderer-side API, IPC wrapper | window.api.invoke |
| `aiBridgeStore.vitest.js` | state transitions (idle/pending/answer/error) | — |
| `aiBridge/router.vitest.js` (main) | mode routing → правильный bridge | mock 3 bridges |
| `aiBridge/apiBridge.vitest.js` | payload → callProviderFn маппинг | mock callProviderFn |
| `aiBridge/localBridge.vitest.js` | Ollama HTTP, timeout, error | mock fetch |
| `aiBridge/webuiBridge.vitest.js` | executeJavaScript + ipc-message listener | mock webview |
| `ai-monitor.preload.vitest.js` | detect URL → load hook | mock fs |
| `hooks/ai/openai.hook.vitest.js` | inject + observer + streaming detection | jsdom |
| (то же для deepseek/claude/gigachat) | — | — |
| `AIBridgePanel.vitest.jsx` | UI render по state | testing-library |
| `AIWebviewSelectorsConfig.vitest.jsx` | UI настройки + сохранение | testing-library |

**Цель**: 100+ новых unit-тестов покрывающих весь Bridge.

### 10.2 E2E / Manual

**E2E с реальными AI сайтами — НЕ делаем** (дорого, ломкость):
- Не тратим деньги на API при каждом CI run
- Не зависим от Internet и доступности сайтов
- Не нарушаем ToS массовыми тестами

**Manual checklist** (`testing-checklist-v1.2.0.md`):
1. Создать тест-клиент в Telegram
2. Написать «привет» с тест-аккаунта
3. Открыть ChatCenter
4. Открыть AISidebar — видно сообщение и кнопку
5. Клик «📤 Спросить AI» — провайдер OpenAI WebUI
6. Дождаться ответа — проверить что в UI появился
7. Клик «📤 Отправить клиенту» — проверить что тест-аккаунт получил
8. Повторить для API mode
9. Повторить для Local (Ollama) mode
10. Тест ошибок: выключить интернет → проверить error UI

### 10.3 Регрессия

После каждого этапа запускать:
- `npm run lint` — 0 предупреждений
- `npm run test:vitest` — все 1500+ тестов passed
- `node src/__tests__/fileSizeLimits.test.cjs`
- `node src/__tests__/rendererConsoleGuard.test.cjs` ← важно, защита от моих прошлых ошибок
- `bash scripts/check-memory.sh`

---

## 11. Откат (rollback) {#11-rollback}

### 11.1 Per-этап откат

Каждый этап = отдельный commit. Откат через `git revert <commit-hash>`.

### 11.2 Полный откат v1.2.0 → v1.1.7

```bash
# Бэкап settings (на всякий случай)
cp "$APPDATA/chat-center/settings.json" "$APPDATA/chat-center/settings.json.before-rollback"

# Откат
git revert v1.2.0..HEAD

# Регрессия
npm run lint
npm run test:vitest

# Restart приложения
```

### 11.3 Откат только конкретной фичи

| Если сломалось | Откат |
|---|---|
| Local Bridge | `git revert <commit-local-bridge>` — остальные mode работают |
| OpenAI hook | `git revert <commit-openai-hook>` — остальные провайдеры работают |
| UI Selectors Config | `git revert <commit-selectors-config>` — fallback на default selectors |
| Preload в production | Изменить путь обратно в `app:get-paths` на `null` → webview без preload |

### 11.4 Защита данных при откате

- Settings auto-backup перед миграцией (Этап 0)
- `aiProviderKeys[pid].mode` НЕ удаляет `settings.mode` legacy
- Audit log — append-only, не задевается

---

## 12. Чек-лист готовности {#12-checklist}

Перед началом разработки каждого этапа проверить:

### Этап 0 (Fix v1.1.7)
- [ ] План чтения set() / setProviderProp / providerCfg
- [ ] Понимание миграции `settings.mode` → `aiProviderKeys[pid].mode`
- [ ] Тесты регресс готовы

### Этап 1 (Контракты)
- [ ] JSDoc типы согласованы с TypeScript-стилем проекта
- [ ] Folders готовы (без файлов кода, только пустые .gitkeep если нужно)

### Этап 2 (Local Bridge)
- [ ] Ollama API docs прочитаны
- [ ] Mock fetch паттерн понятен
- [ ] IPC handler регистрация согласована с `aiBridgeIpcHandlers`

### Этап 3 (API Bridge)
- [ ] aiProviderCaller v1.0.2..v1.1.4 API не задет
- [ ] Multi-provider fallback v1.1.3 интегрирован

### Этап 4 (Preload skeleton)
- [ ] electron-vite preload build разобран
- [ ] Path resolution dev vs prod проверен (`app:get-paths` паттерн)

### Этап 5-6 (Hooks)
- [ ] Selectors для 4 провайдеров проверены **руками** на текущих сайтах
- [ ] MutationObserver pattern из monitor.preload.cjs скопирован

### Этап 7 (UI)
- [ ] AISidebar точка интеграции определена
- [ ] aiBridgeStore структура согласована

### Этап 8-11
- [ ] Selectors UI mockup утверждён юзером
- [ ] Документация структура определена
- [ ] Release checklist готов

---

## 🚨 Критерии «когда МОЖНО начать разработку»

1. ✅ Этап 0 (fix v1.1.7) — необязательно сразу, можно сделать параллельно с Этапом 1, но **до** Этапа 7 (UI) обязательно
2. ✅ Этот документ прочитан и одобрен
3. ✅ Я подтверждаю — это **точно лучшее** решение для этого стека (Electron 41 + React 19 + paradigm webview+preload+IPC)

---

## 🔗 Связанные документы

- [phase-ai-bridge-providers.md](./phase-ai-bridge-providers.md) — детальные hook configs для каждого провайдера
- [current-state-v1.1.6.md](./current-state-v1.1.6.md) — текущее состояние (база для AI Bridge)
- [roadmap-deferred.md](./roadmap-deferred.md) — обновить после релиза v1.2.0
- monitor.preload.cjs — **референс паттерна** (читать перед написанием ai-monitor.preload.cjs)

---

**Версия документа**: 1.0 (создан 10 июня 2026 после v1.1.6 для планируемой v1.2.0).
**Статус**: 📋 ПЛАН (ожидает команды юзера «делай»).
**Объём оценочно**: 33 часа работы + 30-40 unit-тестов.
