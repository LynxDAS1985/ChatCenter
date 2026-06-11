# AI Bridge — полная документация

> **Цель**: единый цикл «клиент написал → AI обработал → ответ юзеру» через 3 источника:
> локальный Ollama, платный API (Anthropic/OpenAI/DeepSeek/ГигаЧат) или веб-сайт AI с DOM injection.
>
> Релиз: **v1.2.0** (объединение этапов 1-9, реализованных в v1.1.8 – v1.1.18).

---

## 📐 Архитектура

```
┌────────── RENDERER ──────────┐
│ sendQuestion({mode, q, cfg}) │  ← src/utils/aiBridge/index.js
└──────────┬──────────────────┘
           │ IPC ai-bridge:send
┌──────────▼──────────────────────────────────┐
│ MAIN: handleSend                            │
│  - payload.chain[] → createFallbackChain    │  ← main/ai/bridge/fallbackChain.js
│  - иначе → router(mode)                     │  ← main/ai/bridge/router.js
└──────────┬──────────────────────────────────┘
           │
    ┌──────┼──────┬──────────────────┐
    ▼      ▼      ▼                  ▼
 LOCAL   API   WEBUI               webview AI сайт
 Ollama  HTTP  webContents.send    + ai-monitor.preload.cjs
                                   + hooks/ai/<provider>.hook.js
```

---

## 🧩 Компоненты

### Контракты (`src/utils/aiBridge/contracts.js`)
JSDoc типы для всего цикла:
- **`AiBridgeQuestion`** — вход: `{version, text, source, history?, systemPrompt?, contextMode?, timeoutMs?, signal?}`
- **`AiBridgeAnswer`** — выход: `{version, ok, text, providerId, mode, latencyMs, model?, error?, debug?}`
- **`AiBridgeError`** — `{code, message, detail?, retryable?}`
- **`AiBridgeErrorCode`** — закрытый список 11 кодов
- **`AiWebviewProviderConfig` / `AiWebviewSelectors`** — для webui
- Константа **`AI_BRIDGE_CONTRACT_VERSION = 1`** — для совместимости IPC

### Router (`main/ai/bridge/router.js`)
`createAiBridgeRouter(mode, deps)` → выбирает соответствующий bridge из deps по mode.

### Local Bridge (`main/ai/bridge/localBridge.js`) — Этап 2
- POST `${baseUrl}/api/chat` к Ollama (OpenAI-compatible API).
- Конфиг: `baseUrl` (default `http://127.0.0.1:11434`) + `model` (default `llama3.1`) + `timeoutMs` (60с).
- AbortController + проброс external signal.
- Парсинг: `data.message.content` (новый) или `data.response` (старый /api/generate).

### API Bridge (`main/ai/bridge/apiBridge.js`) — Этап 3
- Обёртка над `aiProviderCaller.callProvider` (Anthropic/OpenAI/DeepSeek/ГигаЧат).
- БЕЗ tool use (Bridge только текст, tool use — для AI Agent).
- Парсинг ответа:
  - Anthropic: `data.content[].type='text'`
  - OpenAI/DeepSeek/GigaChat: `data.choices[0].message.content`
- Маппинг ошибок `callProvider` → `AiBridgeErrorCode` (см. ниже).

### WebUI Bridge (`main/ai/bridge/webUiBridge.js`) — Этап 4
- `registerWebview(providerId, webContents)` — реестр активных webview AI.
- `bridge.ask(question)`: `webContents.send('ai-bridge:webui:inject', {questionId, text, selectors})` → ждёт ответ через pending Promise.
- `deliverAnswer(payload)` / `deliverError(payload)` — резолв pending Promise по questionId.

### Preload (`main/preloads/ai-monitor.preload.cjs`) — Этап 4
- Detect провайдера по `location.hostname`.
- Загружает hook через `fs.readFileSync('hooks/ai/<provider>.hook.js')`.
- Инжектит через `<script>` в main world.
- Создаёт `window.__ccAiBridge` API: `log/answer/error/setInjectHandler/_enqueueInject`.
- Слушает `ipcRenderer.on('ai-bridge:webui:inject')` → передаёт hook через `<script>`.

### Hooks (`main/preloads/hooks/ai/*.hook.js`) — Этапы 5-6
4 файла для 4 AI сайтов: `openai.hook.js` / `deepseek.hook.js` / `anthropic.hook.js` / `gigachat.hook.js`.

Каждый: SELECTORS (4 шт) + `setInputValue` (React-friendly) + `waitForAnswer` (polling + debounce + streaming indicator) + `handleInject` (apply custom selectors → find input → set → click submit → wait).

### Webview регистрация (`src/native/hooks/useAiWebviewBridge.js`) — Этап 7
React hook: при mount webview AI сайта в AISidebar →
- получает `aiMonitorPreload` путь через `app:get-paths`
- `webview.setAttribute('preload', 'file:///...')`
- слушает `did-attach` → `getWebContentsId()` → IPC `register-webview`
- unmount → IPC `unregister-webview`

### Selectors Config UI (`src/components/AiSelectorsEditor.jsx`) — Этап 8
Редактор кастомных селекторов: 4 поля × 4 провайдера. Хранится в `settings.aiBridgeSelectors[providerId]`. Применяется при `sendQuestion(mode=webui)` через `config.selectors`.

### Fallback Chain (`main/ai/bridge/fallbackChain.js`) — Этап 9
`createFallbackChain(steps, factories)` пробует bridges по очереди. Использовать через `payload.chain[]` в IPC.

---

## 🚨 Коды ошибок (AiBridgeErrorCode)

| Код | Когда | Retryable | Fallback пробует следующий? |
|---|---|---|---|
| `auth_required` | Нет API ключа / неверный ключ / HTTP 401/403 | ❌ | Только если «missing API key» |
| `input_not_found` | DOM селектор input не найден (webui) | ❌ | ❌ |
| `submit_not_found` | DOM селектор submit не найден (webui) | ❌ | ❌ |
| `no_answer` | AI вернул пустой ответ | ❌ | ❌ |
| `streaming_timeout` | AI не ответил за timeoutMs | ✅ | ✅ |
| `rate_limited` | HTTP 429 (Too Many Requests) | ✅ | ✅ |
| `network_error` | ECONNREFUSED/ENOTFOUND/fetch failed | ✅ | ✅ |
| `server_error` | HTTP 5xx | ✅ | ✅ |
| `aborted` | `signal.abort()` или юзер закрыл | ❌ | ❌ (стоп сразу) |
| `config_invalid` | Нет providerId / HTTP 4xx (не 401/403/429) | ❌ | ❌ |
| `unsupported_mode` | Bridge не зарегистрирован | ❌ | ❌ (стоп) |
| `unknown` | Всё остальное | ❌ | — |

---

## 📡 IPC каналы

| Канал | Направление | Payload | Возврат |
|---|---|---|---|
| `ai-bridge:send` | renderer → main (invoke) | `{mode?, chain?, question, config?}` | `AiBridgeAnswer` |
| `ai-bridge:webui:register-webview` | renderer → main (invoke) | `{providerId, webContentsId}` | `{ok, error?}` |
| `ai-bridge:webui:unregister-webview` | renderer → main (invoke) | `{providerId}` | `{ok}` |
| `ai-bridge:webui:inject` | main → preload (send) | `{questionId, text, selectors?}` | — |
| `ai-bridge:webui:answer-received` | preload → main (send) | `{provider, questionId, text}` | — |
| `ai-bridge:webui:error` | preload → main (send) | `{provider, questionId, code, message}` | — |
| `ai-bridge:webui:ready` | preload → main (send) | `{provider}` | — (для дебага) |

---

## 🧪 Как юзер использует

### 1. Через UI «🤖 Проверка AI» в AISidebar (с v1.1.15)
1. Откройте боковую панель AI справа.
2. Нажмите 🤖 в шапке (рядом с ⚙️ настройками).
3. Выберите режим: Локальный (Ollama) / API провайдер / Веб-интерфейс.
4. Выберите провайдера (для API/WebUI).
5. Опционально: URL / Модель / Кастомные селекторы.
6. Введите вопрос → «📤 Спросить».
7. Ответ в зелёной карточке. Все этапы в «📒 Логи ChatCenter».

### 2. Программно (для разработки AI Agent, авто-ответов и др.)

```js
// Single mode
await window.api.invoke('ai-bridge:send', {
  mode: 'api',
  question: { version:1, text:'Привет', source:{messengerId:'native_cc'} },
  config: { providerId: 'anthropic' }
})

// Fallback chain (Этап 9)
await window.api.invoke('ai-bridge:send', {
  chain: [
    { mode: 'api',   config: { providerId: 'anthropic' } },
    { mode: 'api',   config: { providerId: 'openai' } },
    { mode: 'local', config: {} },
  ],
  question: { version:1, text:'Привет', source:{messengerId:'native_cc'} }
})
```

---

## 🔒 Безопасность

- API ключи **никогда** не передаются в renderer — читаются в main из `settings.aiProviderKeys`.
- Preload AI запускается в sandboxed isolated world. Hook инжектируется в main world только с доступом к DOM сайта (НЕ Electron API).
- Webview AI имеет отдельный partition `persist:ai-webview` — изолирован от мессенджеров.
- Custom селекторы — обычные CSS строки в `document.querySelector` (без eval/innerHTML).
- Все логи через `app:log` → файл `chatcenter.log` (НЕТ console.\* в renderer).

---

## 📊 Покрытие тестами (на v1.2.0)

| Модуль | Тесты |
|---|---|
| `aiBridge/contracts.js` | + (smoke) |
| `aiWebviewConfigs.js` | 22 |
| `aiBridge/router.js` | 8 |
| `localBridge.js` | 17 |
| `apiBridge.js` | 28 |
| `webUiBridge.js` | 16 |
| `fallbackChain.js` | 14 |
| `aiBridgeIpcHandlers.js` (+ register/unregister/chain) | 25 |
| `aiBridge/index.js` (renderer wrapper) | 8 |
| 4 hooks (`*.hook.js`) | 30 (sanity) |
| `useAiWebviewBridge.js` | 9 |
| `AiBridgeCheck.jsx` | 11 |
| `AiSelectorsEditor.jsx` | 11 |
| **Итого AI Bridge** | **~200 unit-тестов** |

---

## 🗓️ История этапов

| Версия | Этап | Что |
|---|---|---|
| v1.1.7 | 0 | Fix переключения режимов AI |
| v1.1.8 | 1 | Контракты + папки + типы |
| v1.1.9 | — | Разбиение топ-5 больших файлов |
| v1.1.10 | 2 | Local Bridge (Ollama) |
| v1.1.11 | 3 | API Bridge (4 провайдера) |
| v1.1.12 | 4 | WebUI Bridge skeleton (preload + IPC) |
| v1.1.13 | 5+6 | 4 hook файла (ChatGPT/DeepSeek/Claude/ГигаЧат) |
| v1.1.14 | (UI) | Первый вариант тестера в LogModal |
| v1.1.15 | (UI fix) | Кнопка перенесена в AISidebar, переименование |
| v1.1.16 | 7 | Webview AI ↔ WebUI Bridge через preload + registerWebview |
| v1.1.17 | 8 | Selectors Config UI |
| v1.1.18 | 9 | Fallback chain |
| **v1.2.0** | 10+11 | Документация + Release |

---

## 🔜 Что НЕ входит в v1.2.0 (отложено)

- **AI Agent + Bridge composition**: Bridge не использует tool use. AI Agent отдельный путь (`aiToolExecutor`). Объединение — после v1.2.0.
- **UI «авто-резерв»**: fallback chain доступен только программно. UI галочка в AiBridgeCheck для построения цепочки из доступных провайдеров — будущая фича.
- **AI auto-reply через Bridge**: текущий `autoReplyDispatcher` использует `callProvider` напрямую. Переключение на Bridge — после v1.2.0.
- **Native API мессенджеров (не Telegram)**: AI Bridge работает только в Native режиме (сейчас Telegram через TDLib). WhatsApp/VK native расширения — другой проект.
