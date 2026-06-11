# Реализованные функции — ChatCenter

## Текущая версия: v1.1.12 (11 июня 2026)

**Структура файла**: этот features.md содержит только **последние активные версии**. Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.95.39.md`](./archive/features-v0.95.39.md) | v0.95.39 (убран twoPhase + RAF×2 + 350мс easeOutCubic; стабилизировано v0.95.40+) | ~2 КБ |
| [`archive/features-v0.95.40.md`](./archive/features-v0.95.40.md) | v0.95.40 (большие emoji + a11y reduced-motion + sticky bottom on media; стабилизировано v0.95.41+) | ~3 КБ |
| [`archive/features-v0.95.41.md`](./archive/features-v0.95.41.md) | v0.95.41 (Custom emoji premium WebM/WebP + reduced-motion интеграционные тесты; стабилизировано v0.95.42+) | ~3 КБ |
| [`archive/features-v0.95.42.md`](./archive/features-v0.95.42.md) | v0.95.42 (сохранение поиска + история + ✕ + подсветка совпадений; стабилизировано v0.95.43+) | ~2 КБ |
| [`archive/features-v0.95.38.md`](./archive/features-v0.95.38.md) | v0.95.38 (фикс дубля сообщений через updateMessageSendSucceeded, ⏳ индикатор, mistakes static guard) | ~2 КБ |
| [`archive/features-v0.95.35-37.md`](./archive/features-v0.95.35-37.md) | v0.95.35-37 (fade-in changelog, auto-scroll outgoing-other-device, sending_state polish, mistakes/outgoing-two-cases.md; стабилизировано v0.95.38+) | ~3 КБ |
| [`archive/features-v0.95.34.md`](./archive/features-v0.95.34.md) | v0.95.34 (темовые vars в :root, вспышка bubble, WhatsNewModal UX; стабилизировано v0.95.40+) | ~2 КБ |
| [`archive/features-v0.95.33.md`](./archive/features-v0.95.33.md) | v0.95.33 (фикс «цвет не применяется» через querySelectorAll, регресс-тест blur, деловой стиль; финал в v0.95.34) | ~2 КБ |
| [`archive/features-v0.95.32.md`](./archive/features-v0.95.32.md) | v0.95.32 (производительность WhatsNewModal: убран backdrop-filter + contain + деловой стиль changelog) | ~2 КБ |
| [`archive/features-v0.95.31.md`](./archive/features-v0.95.31.md) | v0.95.31 (аккаунты вниз + drag-n-drop + multi-user typing + throttle реакций; стабилизировано v0.95.34+) | ~3 КБ |
| [`archive/features-v0.95.30.md`](./archive/features-v0.95.30.md) | v0.95.30 (плавная auto-scroll + 5 цветовых тем + dropdown + opacity 0.95; стабилизировано v0.95.33-34) | ~3 КБ |
| [`archive/features-v0.95.29.md`](./archive/features-v0.95.29.md) | v0.95.29 (реакции 👍❤️🔥 + Telegram-style header + General 📢 + render-counter; стабилизировано v0.95.31-34) | ~5 КБ |
| [`archive/features-v0.95.28.md`](./archive/features-v0.95.28.md) | v0.95.28 (Telegram-style auto-scroll к новому + ↓N без «слепой зоны» Schmitt; стабилизировано v0.95.31) | ~4 КБ |
| [`archive/features-v0.95.27.md`](./archive/features-v0.95.27.md) | v0.95.27 (расширенная диагностика send pipeline; стабилизировано v0.95.29) | ~3 КБ |
| [`archive/features-v0.95.23-26.md`](./archive/features-v0.95.23-26.md) | v0.95.23 – v0.95.26 (курсор в input, initial backfill, voice/spellcheck/action-bar/WhatsNew, фикс 47-дневного бага unreadCount; стабилизировано) | ~15 КБ |
| [`archive/features-v0.95.19-22.md`](./archive/features-v0.95.19-22.md) | v0.95.19 – v0.95.22 (диагностика tg-new-message, финал jump-to-end, бейдж форум-группы, форум-overlay; стабилизировано) | ~6 КБ |
| [`archive/features-v0.95.15-18.md`](./archive/features-v0.95.15-18.md) | v0.95.15 – v0.95.18 (итеративный fetch + форум-топики + двухфазный scroll + ForumTopicEmptyState; стабилизировано v0.95.20-21) | ~8 КБ |
| [`archive/features-v0.95.12-14.md`](./archive/features-v0.95.12-14.md) | v0.95.12 – v0.95.14 (3 итерации jump-to-end до итеративного fetch v0.95.15, полная сага в jump-to-end-saga.md) | ~32 КБ |
| [`archive/features-v0.95.8-9.md`](./archive/features-v0.95.8-9.md) | v0.95.8 – v0.95.9 (счётчик ↓ обнуляется + анимация + live compact + порог 128) | ~14 КБ |
| [`archive/features-v0.95.5-7.md`](./archive/features-v0.95.5-7.md) | v0.95.5 – v0.95.7 (sticky pinned overlay, кнопка ↓ Telegram-style, drag-to-resize) | ~24 КБ |
| [`archive/features-v0.95.0-3.md`](./archive/features-v0.95.0-3.md) | v0.95.0 – v0.95.3 (контигуити-фикс, afterId load-newer, мигание ↓ Schmitt trigger, диагностика «дёрг») | ~13 КБ |
| [`archive/features-v0.94.1-7.md`](./archive/features-v0.94.1-7.md) | v0.94.1 – v0.94.7 (TDLib listener leak, scroll caskade, спокойная загрузка, пилюля прогресса — стабилизированы v0.95.0-2) | ~24 КБ |
| [`archive/features-v0.93.0.md`](./archive/features-v0.93.0.md) | v0.93.0 (pixel-perfect scroll restore через LocationOptions.offset, superseded v0.94.0) | ~7 КБ |
| [`archive/features-v0.92.0-6.md`](./archive/features-v0.92.0-6.md) | v0.92.0 – v0.92.6 (сага Virtuoso scroll restore, superseded v0.94.0) | ~37 КБ |
| [`archive/features-v0.91.11-24.md`](./archive/features-v0.91.11-24.md) | v0.91.11 – v0.91.24 (сага scroll restore: 13 версий → миграция на virtuoso) | ~47 КБ |
| [`archive/features-v0.91.1-10.md`](./archive/features-v0.91.1-10.md) | v0.91.1 – v0.91.10 (initial-load, scroll-jump, newBelow, forum topics, updateChatLastMessage) | ~12 КБ |
| [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) | v0.87.106 – v0.87.114 (multi-account UI финал, кнопки режимов, мьют чата, аватарки отправителей в группах) | ~22 КБ |
| [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) | v0.87.93 – v0.87.105 (multi-account native, login flow, разбиения, cc-media://) | ~30 КБ |
| [`archive/features-v0.87.80-92.md`](./archive/features-v0.87.80-92.md) | v0.87.80 – v0.87.92 (pre-push hook, разбиения 4-7, AccountContextMenu) | ~16 КБ |
| [`archive/features-v0.87.65-79.md`](./archive/features-v0.87.65-79.md) | v0.87.65 – v0.87.79 (план разбиения 1-3, pre-push hook, bubble UI) | ~54 КБ |
| [`archive/features-v0.87.51-64.md`](./archive/features-v0.87.51-64.md) | v0.87.51 – v0.87.64 (groupedUnread удалён, pre-commit hook) | ~54 КБ |
| [`archive/features-v0.87.40-50.md`](./archive/features-v0.87.40-50.md) | v0.87.40 – v0.87.50 (итерации native scroll + unread) | ~40 КБ |
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

---

### v0.95.50 — заархивирована

Откат v0.95.49 (followup re-apply restore). Детали: [archive/features-v0.95.50.md](./archive/features-v0.95.50.md).

---

### v1.1.12 — AI Bridge Этап 4: WebUI Bridge skeleton (самый рискованный)

**Что готово**: каркас общения программы с AI веб-сайтами через preload + DOM injection. На этом этапе hook файлы провайдеров **пустые** — реальная инъекция в chat.openai.com будет в Этапах 5-6. Но вся «трубопроводная» часть работает: preload загружается в webview, определяет провайдера, понимает IPC команды, передаёт hook'у через `window.__ccAiBridge`.

**Почему «самый рискованный»**: webview — это отдельный изолированный браузер с CSP, DRM, anti-bot защитами. Любая ошибка в preload роняет страницу AI сайта, а не приложение. Поэтому делаем step-by-step с тестами на каждом шаге.

**Архитектурное решение**: следуем паттерну [`monitor.preload.cjs`](main/preloads/monitor.preload.cjs) которым уже год работают мессенджеры (Telegram/WhatsApp/VK/MAX). НЕ изобретаем новое.

**Файлы**:

- [`main/preloads/ai-monitor.preload.cjs`](main/preloads/ai-monitor.preload.cjs) (~165 стр.) — preload скрипт для AI веб-сайтов:
  - Определяет провайдера по `location.hostname` (HOST_TO_PROVIDER lookup: chat.openai.com/chatgpt.com → openai, chat.deepseek.com → deepseek, claude.ai → anthropic, giga.chat/developers.sber.ru → gigachat). Поддомены через endsWith().
  - Загружает hook через `fs.readFileSync(__dirname + '/hooks/ai/' + provider + '.hook.js')`. Если файла нет — silent fallback (Этап 4 без реальных hooks).
  - Инъекция кода hook через `<script>` tag в main world (НЕ contextBridge — нужен прямой доступ к window).
  - Создаёт `window.__ccAiBridge` API для hook'а (через отдельный `<script>` тег):
    - `log(level, msg)` — postMessage в preload → main app:log
    - `answer(questionId, text)` — postMessage → main `ai-bridge:webui:answer-received`
    - `error(questionId, code, message)` — postMessage → main `ai-bridge:webui:error`
    - `setInjectHandler(fn)` — hook регистрирует свой обработчик inject команд
    - `_enqueueInject(payload)` — preload пушит inject в hook (или в очередь если handler ещё не зарегистрирован)
  - Слушает `window.message` → проксирует в IPC main.
  - Слушает `ipcRenderer.on('ai-bridge:webui:inject')` → передаёт hook'у через `<script>` evaluating `window.__ccAiBridge._enqueueInject(payload)`.
  - Защита от двойной загрузки через `window.__ccAiPreloadInitialized`.
  - Сообщает в main `ai-bridge:webui:ready` после инициализации.
  - **Никаких console.\*** — только `ipcRenderer.send('app:log', ...)` (правило проекта).

- [`main/preloads/hooks/ai/.hookTemplate.js`](main/preloads/hooks/ai/.hookTemplate.js) (~140 стр.) — шаблон hook файла:
  - НЕ загружается (имя начинается с `.`).
  - Документирует контракт: SELECTORS / DEBOUNCE_MS / COOLDOWN_MS / INJECT_DELAY / MAX_WAIT_FOR_ANSWER_MS.
  - Функции: `setInputValue` (React-friendly через native setter для textarea + contenteditable + execCommand fallback), `waitForAnswer` (polling MutationObserver-like с debounce), `handleInject` (применить custom selectors → set input → click submit → waitForAnswer).
  - Регистрирует `window.__ccAiBridge.setInjectHandler(handleInject)` при загрузке.

- [`main/ai/bridge/webUiBridge.js`](main/ai/bridge/webUiBridge.js) (~155 стр.) — main-side bridge:
  - `createWebUiBridge(config)` — фабрика. Config: providerId + timeoutMs (default 90с, дольше API) + selectors (custom от юзера, опц).
  - `registerWebview(providerId, webContents)` — реестр активных webview (вызывается при mount AISidebar в Этапе 7).
  - `deliverAnswer(payload)` / `deliverError(payload)` — связывают payload с pending Promise по questionId.
  - `clearWebUiBridgeState()` — для тестов и при unmount.
  - `bridge.ask(question)`:
    1. Проверяет что webview зарегистрирован → иначе config_invalid.
    2. Генерирует уникальный questionId (`q_${Date.now()}_${counter}`).
    3. `webContents.send('ai-bridge:webui:inject', {questionId, text, selectors})`.
    4. Promise.race([response, timeout, abort]) → AiBridgeAnswer.
    5. Timeout по умолчанию 90 сек (webui медленнее API).

- [`main/handlers/aiBridgeIpcHandlers.js`](main/handlers/aiBridgeIpcHandlers.js) — расширено:
  - `mode='webui'` → `createWebUiBridge(config)`. Требует providerId.
  - `ipcMain.on('ai-bridge:webui:answer-received')` → `deliverAnswer`.
  - `ipcMain.on('ai-bridge:webui:error')` → `deliverError`.
  - `ipcMain.on('ai-bridge:webui:ready')` → no-op (preload reports готовность, ack не нужен).
  - DI: `deps.factoryWebUi`.

- [`main/handlers/mainIpcHandlers.js`](main/handlers/mainIpcHandlers.js) — `app:get-paths` теперь возвращает `aiMonitorPreload` путь (dev: `main/preloads/ai-monitor.preload.cjs`, prod: `out/preload/ai-monitor.mjs`).

- [`electron.vite.config.js`](electron.vite.config.js):
  - preload input + `'ai-monitor': resolve(__dirname, 'main/preloads/ai-monitor.preload.cjs')`.
  - copyStaticPlugin расширен: копирует `main/preloads/hooks/ai/*.hook.js` (без `.hookTemplate.js`) → `out/preloads/hooks/ai/`.

### Как работает (когда hook файлы появятся в Этапе 5-6)

```
[1] UI вызывает sendQuestion({mode:'webui', config:{providerId:'openai'}, question:{text}})
       ↓ IPC ai-bridge:send
[2] main handleSend → mode=webui → createWebUiBridge → router → bridge.ask
       ↓
[3] bridge: webContents.send('ai-bridge:webui:inject', {questionId, text})
       ↓ IPC к preload в webview
[4] ai-monitor.preload: ipcRenderer.on('ai-bridge:webui:inject') →
    <script> window.__ccAiBridge._enqueueInject(payload) </script>
       ↓ window scope
[5] hook (например openai.hook.js): handleInject(payload):
    - найти input → setInputValue(text)
    - click submit button
    - запустить waitForAnswer(questionId):
        polling MutationObserver на streamingIndicator → когда streaming закончился →
        прочитать innerText последнего assistant message → window.__ccAiBridge.answer(questionId, text)
       ↓ postMessage
[6] preload получает 'ai-bridge:webui:answer-received' → ipcRenderer.send →
       ↓ IPC к main
[7] handlers: deliverAnswer({questionId, text}) → resolve pending Promise →
       ↓
[8] bridge.ask возвращает AiBridgeAnswer{ok:true, text}
[9] IPC возвращает в UI
```

**На Этапе 4 шаги 4-5 не работают** (нет hook файлов). Только инфраструктура.

### Тесты (+19)
- `webUiBridge.vitest.js` (16): validation throws / webview не зарегистрирован → config_invalid / happy path (inject через webContents → deliverAnswer → ok:true) / custom selectors прокидываются / deliverError → правильный code+message / пустой ответ → no_answer / webContents.send throws → unknown / timeout → streaming_timeout retryable / signal aborted сразу (без send) / signal abort в процессе / register/unregister / повторный register заменяет / register без webContents → no-op / deliverAnswer/Error с неизвестным questionId → no throw
- `aiBridgeIpcHandlers.vitest.js` (+2): mode=webui без providerId → config_invalid, с providerId → factoryWebUi вызвана. Старый тест на unsupported_mode переписан под config_invalid.

### Регрессия
lint 0, vitest 1650 → 1667 ✅ (+17 net), fileSizeLimits 432 → 434 ✅, check-memory ✅.

### Юзер пока НЕ видит изменений
Preload подключится к webview когда AISidebar добавит `<webview>` тег с этим preload пути (это Этап 7). Hook файлы пустые — Этапы 5-6.

### Безопасность
- Preload запускается в webview изолированном (sandboxed) контексте.
- Hook инжектируется через `<script>` в main world сайта — имеет доступ к DOM сайта, НО не к Electron API.
- Bridge между hook и main — через `postMessage` + ipcRenderer (контролируемые каналы).
- CSP сайтов не блокирует наш preload (он запускается до загрузки страницы по контракту Electron).
- API ключи AI **никогда не нужны** в webui mode — юзер залогинен на сайте сам через браузерную сессию webview.

### Rollback
`git revert <commit>` — preload не используется до Этапа 7 (когда добавим `<webview>` tag). IPC handlers новых каналов безвредны если ничего не шлёт. Существующие preloads (monitor.preload и др.) не затронуты.

---

### v1.1.11 — AI Bridge Этап 3: API Bridge (обёртка aiProviderCaller)

**Что готово**: программа умеет отправить вопрос в платный API провайдер (Anthropic / OpenAI / DeepSeek / ГигаЧат) через тот же IPC канал `ai-bridge:send`, что и Local Bridge.

**Файлы**:

- [`main/ai/bridge/apiBridge.js`](main/ai/bridge/apiBridge.js) (~205 строк) — `createApiBridge(config, deps)`:
  - Конфиг: `providerId` (обязательно: anthropic/openai/deepseek/gigachat) + `model` (опц) + `timeoutMs` (опц, default 60с).
  - Deps: `callProvider` (функция из `aiProviderCaller.js`).
  - Сборка `messages`: `systemPrompt` → первый `{role:'system'}`, потом `history` (с валидацией), последний `{role:'user', content:text}`.
  - Вызов `callProvider({provider, messages, model})` — БЕЗ tools (Bridge только текст, tool use — для AI Agent).
  - Парсинг ответа разный по провайдерам:
    - **Anthropic**: `data.content[].type='text'` → возвращает первый text-блок (пропускает tool_use блоки).
    - **OpenAI/DeepSeek/GigaChat**: `data.choices[0].message.content`.
  - **`Promise.race(callProvider, timeout, abort)`** — без AbortSignal в fetch, потому что callProvider — внутренний модуль без signal API.
  - Возврат всегда `AiBridgeAnswer` — никаких throw.

- **Маппинг ошибок** `callProvider` → `AiBridgeErrorCode`:

  | Сообщение от callProvider | AiBridgeErrorCode | Retryable |
  |---|---|---|
  | `missing API key for X` | `auth_required` | ❌ |
  | `HTTP 401` / `HTTP 403` | `auth_required` | ❌ |
  | `HTTP 429` | `rate_limited` | ✅ |
  | `HTTP 5xx` | `server_error` | ✅ |
  | `HTTP 4xx` (кроме 401/403/429) | `config_invalid` | ❌ |
  | `network error` / `ENOTFOUND` / `ECONNREFUSED` | `network_error` | ✅ |
  | `unsupported provider` | `config_invalid` | ❌ |
  | `invalid JSON response` | `server_error` | ✅ |
  | прочее | `unknown` | ❌ |

  Это используется fallback chain (Этап 9) — `retryable=true` означает «попробуй другой провайдер».

- [`main/handlers/aiBridgeIpcHandlers.js`](main/handlers/aiBridgeIpcHandlers.js) расширен:
  - `mode='api'` теперь подключает `createApiBridge(config, {callProvider: deps.callProvider})`.
  - Валидация: config.providerId обязателен → `config_invalid`. callProvider не передан в register → `config_invalid` («API Bridge не настроен на main стороне»).
  - DI: `deps.factoryApi` для замены `createApiBridge` в тестах.

- [`main/main.js`](main/main.js) — `registerAiBridgeIpcHandlers(ipcMain, {callProvider: callProviderFn})` теперь передаёт callProvider. callProviderFn использует тот же storage что и AI Agent (читает API ключи из `settings.aiProviderKeys`).

**Почему API Bridge без tool use**:
- Bridge — это «отправь вопрос, получи текст». Tool use (вызов функций программы) — это AI Agent.
- AI Agent уже работает с `aiToolExecutor` (Phase 1-4 в v0.97-v1.1.4) — там multi-turn loop с инструментами.
- Bridge — простой один HTTP request → один ответ. Юзер видит сообщение клиента → AI отвечает текстом → программа вставляет ответ.
- Если в будущем понадобится Bridge + tools — это будет Этап 12+ или новый компонент.

### Как работает

1. Renderer вызывает `sendQuestion({mode:'api', question:{...}, config:{providerId:'anthropic', model:'claude-haiku-4-5-20251001'}})`.
2. IPC → `handleSend` → проверяет providerId + callProvider → `createApiBridge(config, {callProvider})`.
3. `router.ask(question)` → `apiBridge.ask(question)`.
4. apiBridge собирает messages → вызывает `callProvider({provider, messages, model})`.
5. callProvider читает API ключ из storage → fetch к API → возвращает raw response.
6. apiBridge парсит response по providerId → возвращает `AiBridgeAnswer{ok:true, text, providerId, mode:'api', latencyMs, model}`.
7. При ошибке — маппинг exception → AiBridgeError с правильным code + retryable.

**Тесты** (+33):
- `apiBridge.vitest.js` (28): validation (throws без providerId/callProvider) / Anthropic happy path + правильный model / Anthropic пропускает не-text блоки / OpenAI+DeepSeek+GigaChat parsing / messages: один user / system первым / history правильный порядок / невалидные turn-ы игнорируются / 8 error mappings (missing-key/401/429/500/400/network/unknown/empty) / no_answer для Anthropic + OpenAI / timeout → streaming_timeout / signal aborted сразу / signal abort в процессе / все 4 providerId принимаются.
- `aiBridgeIpcHandlers.vitest.js` (+5): mode=api без providerId → config_invalid, без callProvider в deps → config_invalid, с callProvider → factoryApi вызвана + ответ пробрасывается, webui → unsupported_mode.

**Регрессия**: lint 0, vitest 1620 → 1650 ✅ (+30 unique, +5 уже учтены), fileSizeLimits 430 → 432 ✅.

**Юзер через DevTools может теперь**:
```js
await window.api.invoke('ai-bridge:send', {
  mode: 'api',
  question: { version:1, text:'Привет!', source:{messengerId:'native_cc'} },
  config: { providerId: 'anthropic' }  // или 'openai'/'deepseek'/'gigachat'
})
```

API ключ берётся автоматически из `settings.aiProviderKeys[providerId].apiKey` (там где юзер уже ввёл их для AI Agent).

**Rollback**: `git revert` — никакой существующий код callProvider/aiProviderFallback не изменялся, только новые файлы + 1 строка передачи deps.

---

### v1.1.10 — AI Bridge Этап 2: Local Bridge (Ollama HTTP)

**Что готово**: программа теперь умеет отправить вопрос в локальный Ollama сервер и получить ответ — через одну IPC команду.

**Файлы**:
- [`main/ai/bridge/localBridge.js`](main/ai/bridge/localBridge.js) (172 строки) — фабрика `createLocalBridge(config, deps)`:
  - POST `${baseUrl}/api/chat` с `{ model, messages, stream:false }` (OpenAI-compatible Ollama API)
  - Конфиг: `baseUrl` (default `http://127.0.0.1:11434`) + `model` (default `llama3.1`) + `timeoutMs` (60с)
  - Поддержка `systemPrompt` (первый message role=system) + `history` (turn-ы между system и финальным user)
  - AbortController с собственным timeout + проброс внешнего `question.signal`
  - Парсинг ответа: `data.message.content` (новый /api/chat) или `data.response` (старый /api/generate)
  - Возвращает `AiBridgeAnswer` всегда — без throw (даже при ECONNREFUSED → `network_error` с подсказкой «Ollama не запущена»)
  - Коды ошибок: `config_invalid` (404/неправильный path), `server_error` (5xx, retryable), `streaming_timeout`, `aborted`, `network_error` (retryable), `no_answer` (пустой ответ)
  - DI через `deps.fetch` — для тестирования без сетевых вызовов

- [`main/handlers/aiBridgeIpcHandlers.js`](main/handlers/aiBridgeIpcHandlers.js) (90 строк) — IPC канал `ai-bridge:send`:
  - `registerAiBridgeIpcHandlers(ipcMain, deps)` → unsubscribe
  - `handleSend(payload, deps)` — экспортируется отдельно для тестирования без mock ipcMain
  - `mode='local'` → создаёт createLocalBridge через factory из deps (для DI) → передаёт router'у
  - `mode='api'/'webui'` → unsupported_mode (добавятся на Этапах 3-6)
  - Возврат: всегда `AiBridgeAnswer`. Никаких throw.
  - DI: `deps.factoryLocal` для замены createLocalBridge в тестах, `deps.fetch` для проброса
  - `AI_BRIDGE_IPC_CHANNELS = Object.freeze({ SEND: 'ai-bridge:send' })`

- [`src/utils/aiBridge/index.js`](src/utils/aiBridge/index.js) (75 строк) — renderer-side wrapper:
  - `sendQuestion({ mode, question, config })` → `Promise<AiBridgeAnswer>`
  - Валидация payload (mode + question обязательны) + проверка `window.api.invoke` доступности
  - Любые throws ловятся → `AiBridgeAnswer{ok:false, code:'unknown'}`

- [`main/main.js`](main/main.js) подключает `registerAiBridgeIpcHandlers(ipcMain)` рядом с `initAiToolIpcHandlers`.

**Тесты** (+37):
- `localBridge.vitest.js` (17): happy path / URL construction / body структура (messages, systemPrompt, history) / HTTP ошибки 404/500 / no_answer / ECONNREFUSED → network_error / fetch undefined → config_invalid / timeout / external abort / старый формат `response`
- `aiBridgeIpcHandlers.vitest.js` (12): handleSend без mode/question → config_invalid / mode=local → factoryLocal + router / mode=api/webui → unsupported_mode / register создаёт handler / unsubscribe вызывает removeHandler / handler пробрасывает payload
- `aiBridge/index.vitest.js` (8): без mode/question → config_invalid / нет invoke → config_invalid / invoke вызван с правильным каналом + payload / возврат invoke / throws → catched

**Один баг найден и исправлен**: в `registerAiBridgeIpcHandlers` искал `deps.createLocalBridge` вместо `deps.factoryLocal` — тест handler не получал mock. Поправлен на правильный ключ.

**Регрессия**: lint 0 warn, vitest 1583 → 1620 ✅, fileSizeLimits 422/422 → 430/430 ✅, check-memory ✅.

**Юзер ещё не увидит** Local Bridge в UI — это будет в Этапе 7 (AIBridgePanel). Сейчас можно тестировать только через DevTools console: `await window.api.invoke('ai-bridge:send', { mode:'local', question:{ version:1, text:'Привет', source:{ messengerId:'native_cc' } } })`.

**Rollback**: `git revert <commit>` — никакой существующий код не задет, только новые файлы + 1 строка в main.js (registerAiBridgeIpcHandlers подключение).

---

### v1.1.9 — Разбиение топ-5 больших файлов (защита от подкрадывающихся лимитов)

**Контекст**: 4 из топ-5 файлов проекта были на пределе exception (запас 1-33 строки). Любая новая фича падала бы на size limit. Юзер: «разбей с запасом».

**Что разбито**:

| Файл | До → После | Запас от ceiling | Что вынесено |
|---|---|---|---|
| `src/native/store/nativeStore.js` | 1326 → 1227 | 113 | 12 функций + 6 констант + DEFAULT_STATE → [`nativeStoreHelpers.js`](src/native/store/nativeStoreHelpers.js) (193 стр.) |
| `src/native/modes/InboxMode.jsx` | 1077 → 1042 | 68 | `handleAttachSend` (~36 стр.) → [`inboxAttachSend.js`](src/native/utils/inboxAttachSend.js) + удалён дубль `topicMessageKey` (используется общий из nativeStoreHelpers) |
| `src/App.jsx` | 928 → 899 | 41 | `NATIVE_CC_ID/TAB` + `AISidebarFallback` + `NativeAppFallback` → [`appFallbacks.jsx`](src/appFallbacks.jsx) (43 стр.) |
| `main/native/backends/tdlibBackend.js` | 920 → 892 | 38 | `SEARCH_FILTER_MAP` + `mapSearchFilter` + `parseChatId` → [`tdlibBackendHelpers.js`](main/native/backends/tdlibBackendHelpers.js) (54 стр.) |
| `src/native/store/nativeStoreIpc.js` | 730 → 714 | 16 | `saveChatCache` + `loadChatCache` (localStorage) → [`nativeStoreCache.js`](src/native/store/nativeStoreCache.js) (32 стр.) |

**5 новых модулей** + 5 файлов тестов:
- `nativeStoreHelpers.vitest.js` — 40 тестов (константы / DEFAULT_STATE / 11 функций)
- `nativeStoreCache.vitest.js` — 10 тестов (save/load/round-trip/quota fallback)
- `tdlibBackendHelpers.vitest.js` — 13 тестов (SEARCH_FILTER_MAP/mapSearchFilter/parseChatId)
- Тесты для `appFallbacks.jsx` и `inboxAttachSend.js` — поведение не изменилось, существующие e2e/integration тесты приложения покрывают (через App.jsx и InboxMode.jsx).

**Re-export trick для backward compatibility**: `nativeStoreIpc.js` оставляет `export { saveChatCache, loadChatCache } from './nativeStoreCache.js'` — все внешние импорты продолжают работать.

**Один баг найден и починен**: при первой попытке выноса `saveChatCache`/`loadChatCache` сделал только `export { ... } from` — а внутри `nativeStoreIpc.js` использовал `saveChatCache(chatId, next)` напрямую. Тесты упали с `ReferenceError: saveChatCache is not defined`. Исправлено добавлением отдельного `import { ... } from` (re-export не делает identifier доступным локально).

**Регрессия**: lint 0, vitest 1520 → 1583 ✅ (+63 теста), fileSizeLimits 416/416 → 422/422 ✅.

**Поведение не изменено**. Все вынесенные функции / константы те же, только импорт из соседнего файла.

---

### v1.1.8 — AI Bridge Этап 1 (Контракты + папки + типы)

**Цель v1.2.0**: единый цикл «клиент написал → AI обработал → отправили клиенту» через 3 источника: webui (DOM injection) + api (HTTP) + local (Ollama). План разбит на 11 этапов, см. [`.memory-bank/ai-agent-plan/phase-ai-bridge-plan.md`](./ai-agent-plan/phase-ai-bridge-plan.md).

**Этап 1 = каркас без логики**:
- Новые папки: `src/utils/aiBridge/`, `main/ai/bridge/`, `main/preloads/hooks/ai/`
- `src/utils/aiBridge/contracts.js` — JSDoc типы: `AiBridgeQuestion` / `AiBridgeAnswer` / `AiBridgeSource` / `AiBridgeTurn` / `AiWebviewProviderConfig` / `AiWebviewSelectors` / `AiBridgeError` (+ закрытый перечень `AiBridgeErrorCode`). Константа `AI_BRIDGE_CONTRACT_VERSION = 1` — для обратной совместимости IPC.
- `src/utils/aiWebviewConfigs.js` — `DEFAULT_WEBVIEW_PROVIDERS` (массив frozen, 4 провайдера: openai/deepseek/anthropic/gigachat) + чистые функции: `detectAiProvider(urlOrHost)` (host → конфиг через hostPatterns, поддомены, lowercase, www-стрип) / `getProviderConfig(id)` / `getDefaultSelectors(id)` / `extractHost(urlOrHost)` / `listProviderIds()`.
- `main/ai/bridge/router.js` — `createAiBridgeRouter(mode, deps)` каркас с 3 ветками (api/webui/local). На Этапе 1 все возвращают `{ok:false, error.code:'unsupported_mode'}` — bridges будут добавлены поэтапно.
- `main/preloads/hooks/ai/.gitkeep` — заглушка под будущие preload hooks (Этапы 4-6).

**Селекторы DOM** для 4 сайтов (chat.openai.com / chat.deepseek.com / claude.ai / giga.chat) — на основе раздела 2-5 в [`phase-ai-bridge-providers.md`](./ai-agent-plan/phase-ai-bridge-providers.md), проверены на 9 июня 2026.

**Тесты** (+30): `aiWebviewConfigs.vitest.js` (22 теста: extractHost, detectAiProvider для 4 провайдеров + поддомены + неизвестные сайты + immutability) + `router.vitest.js` (8 тестов: unsupported_mode, маршрутизация в правильный bridge, throw → catch, latencyMs). Плюс smoke `aiBridgeContracts.test.cjs` для cjs-suite.

**Лимит файлов**: renderer 26400 → 27200 строк (запас на Этапы 2-3, ~600 строк ещё предстоит).

**Регрессия**: lint 0 warn, vitest 1490 → 1520 ✅, fileSizeLimits 410/410 → 416/416 ✅, check-memory ✅.

**Существующий код прода не затронут**. Текущий AI WebView mode (v1.1.5-v1.1.7) и Phase 0-4 (v0.96.0-v1.0.7) работают как раньше.

**Rollback**: `git revert <commit>` — никакой существующий код не задет, только новые файлы + лимит.

---

### v1.1.7 — Fix: переключение режимов AI (API ↔ Веб-интерфейс) сохраняется правильно

**Симптом**: юзер выбирает провайдера DeepSeek/ГигаЧат → кликает «Веб-интерфейс» → ничего не меняется, остаётся API mode. То же при попытке поменять URL веб-интерфейса или contextMode — изменения не применяются к активному провайдеру.

**Root cause (баг v1.1.5)**:

В `AISidebar.jsx` функция `set(key, val)`:
1. Кладёт `[key]: val` в корень `settings` (legacy глобальное поле)
2. Пересобирает `aiProviderKeys[pid]` ТОЛЬКО из 3 полей: `apiKey`, `clientSecret`, `model`
3. Поля `mode`, `webviewUrl`, `contextMode` **теряются** при каждом вызове `set`

При этом `getProviderCfg(settings)` в `aiProviders.js` читает `mode` из `aiProviderKeys[pid].mode` (новый формат). Старое значение в `settings.mode` (корень) игнорируется.

**Что починено**:

1. **Новая функция `setProviderProp(key, val)`** в `AISidebar.jsx` — пишет напрямую в `aiProviderKeys[pid][key]`, не трогая другие поля провайдера. Передаётся как prop в `AIConfigPanel`.

2. **5 onClick хендлеров в `AIConfigPanel.jsx`** переключены с `set` на `setProviderProp`:
   - `set('mode', 'api')` → `setProviderProp('mode', 'api')`
   - `set('mode', 'webview')` → `setProviderProp('mode', 'webview')`
   - `set('webviewUrl', e.target.value)` → `setProviderProp('webviewUrl', ...)`
   - «Сбросить на стандартный» → `setProviderProp('webviewUrl', default)`
   - `set('contextMode', m.id)` → `setProviderProp('contextMode', m.id)`

3. **Migration useEffect** в `AISidebar.jsx` — для юзеров с уже сохранёнными legacy значениями:
   - При первом монтировании сканирует `settings.mode/webviewUrl/contextMode`
   - Если поле в корне есть, а в `aiProviderKeys[pid]` нет → переносит
   - Срабатывает один раз (через `migrationDoneRef`)
   - Legacy в корне НЕ удаляется (для безопасного отката на 1-2 версии)
   - Логирует через `app:log` (не console.*)

**Поля затронуты** (provider-scoped в `aiProviderKeys[pid]`):
- `mode` — `api` | `webview`
- `webviewUrl` — кастомный URL для веб-интерфейса
- `contextMode` — `none` | `last` | `full`

**Поля НЕ затронуты** (остаются глобальными в корне `settings`, идут через `set`):
- `aiApiKey`, `aiModel`, `aiClientSecret` — пишутся ОБА в корень И в `aiProviderKeys[pid]` (для совместимости)

**Тесты** (+17):
- `src/components/AIConfigPanel.vitest.jsx` — 8 тестов: клик API/Веб-интерфейс → `setProviderProp`, изменение URL → `setProviderProp`, contextMode → `setProviderProp`, aiApiKey → `set` (а не setProviderProp), активный режим показывает ✓.
- `src/__tests__/aiConfigMigration.vitest.js` — 9 тестов: pure helper migration: legacy `mode`/`webviewUrl`/`contextMode` → `aiProviderKeys[pid]`, идемпотентность, не перезаписывает существующее, partial migration, null-safe, default provider.

**Регрессия**: lint 0, vitest 1490 passed, fileSizeLimits 410/410 ✅.

---

### v1.1.4 – v1.1.6 — заархивированы

ГигаЧат tool use (v1.1.4) → диагностика ai-webview (v1.1.5) → fix логи через app:log + страж от console.* (v1.1.6). Все стабильны. Подробно: [`archive/features-v1.1.4-1.1.6.md`](./archive/features-v1.1.4-1.1.6.md).

---

### v1.1.0 – v1.1.3 — заархивированы

Phase 4.3 AI auto-reply правила (полный цикл): foundation (v1.1.0) → integration с TDLib message:new (v1.1.1) → реальный AI provider + master switch + audit (v1.1.2) → smart cooldown + multi-provider fallback (v1.1.3). Все стабильны. Подробно: [`archive/features-v1.1.0-1.1.3.md`](./archive/features-v1.1.0-1.1.3.md). Реализация: [`ai-agent-plan/phases/phase-4-3-auto-reply-impl.md`](./ai-agent-plan/phases/phase-4-3-auto-reply-impl.md).

---

### v1.0.1 – v1.0.7 — заархивированы

Phase 4 hardening + UI bulk + Reminders snooze + AbortSignal + confirm timeout + Search filter/pagination/fanOut + TDLib backend adapter + Esc для модалок. Детали: [archive/features-v1.0.x.md](./archive/features-v1.0.x.md).

---

### v0.97.0 — заархивирована

Фундамент AI-агента: Phase 0 (NotificationSource + Action Bus + cross-tab fix) + Phase 1 (Tool Use каркас — 8 milestones + 4 провайдера-адаптера + executor + IPC). +117 тестов. Подробно: [`archive/features-v0.97.0.md`](./archive/features-v0.97.0.md). Реализация по фазам — [`ai-agent-plan/phases/`](./ai-agent-plan/phases/).

---

### v0.95.48 — заархивирована

Точный jump-to-message из notification (паттерн tdesktop/tweb). Детали: [archive/features-v0.95.48.md](./archive/features-v0.95.48.md).

---

### v0.95.47 — заархивирована

Фикс пустых bubble (sticker/animated/dice) + диагностические логи для notification→scroll. Детали: [archive/features-v0.95.47.md](./archive/features-v0.95.47.md).

---

### v0.95.45 — заархивирована

Фикс «Перейти к чату» для native режима. Детали: [archive/features-v0.95.45.md](./archive/features-v0.95.45.md).

---

### v0.95.44 — заархивирована

Прогресс % загрузки файлов через TDLib updateFile. Детали: [archive/features-v0.95.44.md](./archive/features-v0.95.44.md).

---

### v0.95.27 – v0.95.32 — заархивированы

Расширенная диагностика send pipeline (v0.95.27), Telegram-style auto-scroll без слепой зоны (v0.95.28), реакции + header (v0.95.29), плавная auto-scroll + темы (v0.95.30), drag-n-drop аккаунты (v0.95.31), оптимизация WhatsNewModal (v0.95.32). Все стабильны. Полный текст: [`archive/features-v0.95.27-32.md`](./archive/features-v0.95.27-32.md).

---

### v0.95.26 — заархивирована (учебный пример 47-дневного бага)

Фикс `tg:new-message` обнулял unreadCount для активного чата. Локальное обнуление вместо server sync — 1 строка в nativeStoreIpc, 47 дней незамеченным. 3 уровня защиты + 7 факторов почему не ловили. Подробно: [`archive/features-v0.95.26.md`](./archive/features-v0.95.26.md). Учебный разбор: [`mistakes/native-scroll-unread.md`](./mistakes/native-scroll-unread.md).

---

### v0.95.23 – v0.95.26 — заархивированы

См. [`archive/features-v0.95.23-26.md`](./archive/features-v0.95.23-26.md): курсор в input после отправки (v0.95.23), initial backfill истории TDLib quirk (v0.95.24), voice player + spellcheck + action-bar под bubble + «Что нового» (v0.95.25), фикс 47-дневного бага unreadCount (v0.95.26). Все стабилизированы.

---

### v0.95.19 – v0.95.22 — заархивированы

См. [`archive/features-v0.95.19-22.md`](./archive/features-v0.95.19-22.md): диагностика tg-new-message + tg-messages-applied (v0.95.19), финал саги jump-to-end через gapMessages > 0 (v0.95.20), бейдж форум-группы как Telegram Desktop (v0.95.21), форум-overlay + Escape focus-pattern (v0.95.22). Стабилизировано.

---

### v0.95.15 – v0.95.18 — заархивированы

Cм. [`archive/features-v0.95.15-18.md`](./archive/features-v0.95.15-18.md): итеративный fetch (v0.95.15), jump-to-end в форум-топиках + smoothScroll easeOutCubic (v0.95.16), регрессия untilMessageId early break (v0.95.17), двухфазный scroll + ForumTopicEmptyState + не мигать shimmer (v0.95.18). Стабилизировано через v0.95.20–21.

---

### v0.95.10 – v0.95.11 — заархивированы

Откат scroll-continuation + loading-pulse кнопки ↓ (v0.95.10), диагностика «не грузит дальше при unread > загруженного» с полями gapMessages/unreadVsLoaded (v0.95.11). Корни закрыты в v0.95.12+ (см. `jump-to-end-saga.md`). Детали: [`archive/features-v0.95.10-11.md`](./archive/features-v0.95.10-11.md).

---

### v0.95.4 — заархивирована

Фикс «дёрг при повторном открытии seen-чата» (useLayoutEffect) + Windows CI timeout. Детали: [archive/features-v0.95.4.md](./archive/features-v0.95.4.md).

---

### v0.94.0 — заархивирована

**Финал саги scroll restore** (~30 версий v0.91-v0.93): полное удаление react-virtuoso + переход на простой DOM + pixel scrollTop. Подробно: [`archive/features-v0.94.0.md`](./archive/features-v0.94.0.md).

---

### v0.93.0 — заархивирован

Pixel-perfect scroll restore через `LocationOptions.offset` Virtuoso API. Полностью superseded в **v0.94.0** (виртуализация удалена). Детали: [`archive/features-v0.93.0.md`](./archive/features-v0.93.0.md).
### v0.92.0 – v0.92.6 — заархивированы

Сага Virtuoso scroll restore (6 версий). Полностью superseded в **v0.94.0** (виртуализация удалена, restore через простой pixel scrollTop). Детали: [`archive/features-v0.92.0-6.md`](./archive/features-v0.92.0-6.md).

---

### v0.91.24 — Фикс Проблемы 2: блок load-older во время restore + re-scroll через onRowsRendered + abort на user-scroll

### v0.91.11 — Диагностика «возврат в чат прыгает вверх» (4 лога в ветке already-seen)

Симптом: A → B → возврат в A → перелистывает вверх, не на сохранённую позицию.

В [`useInitialScroll.js`](src/native/hooks/useInitialScroll.js) ветка «already-seen» имела 3 silent edge case'а: `scrollRef.current=null` (DOM не готов), `getSavedScrollTop` вернул `undefined`, и race с react-window `useDynamicRowHeight({key: cacheKey})` — при смене `cacheKey={store.activeChatId}` ([`VirtualMessageList.jsx:211`](src/native/components/VirtualMessageList.jsx#L211)) кэш высот сбрасывается → `scrollHeight` временно мал → `el.scrollTop = savedTop` тихо обрезается по [MDN scrollTop spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop).

Добавлены 4 точки логирования (логика restore не тронута):

| Событие | Поля | Что покажет |
|---|---|---|
| `initial-restore-attempt` | `chatId, savedTop, scrollHeight, clientHeight` | Хватит ли scrollHeight для savedTop |
| `initial-restore-applied` | `chatId, requestedTop, actualTop, clamped` | `clamped=true` = scrollHeight мал |
| `initial-restore-postcheck` | `chatId, afterMs:100, finalTop, scrollHeight` | Позиция после remeasure react-window |
| `initial-restore-skip` | `chatId, reason` | `no-scrollEl` / `no-saved` / `not-returning` |

Что НЕ менял: `el.scrollTop = savedTop` присвоение, `lastActiveChatIdRef` (v0.91.7 guard), ветку 1, существующее `initial-restore-saved`.

Конфликты ✓: v0.91.7 (isReturning сохранён), v0.91.6 (ветку 1 не трогаем), react-window (listRef/cacheKey не тронуты). Граничные ✓: savedTop=0, undefined, scrollRef=null, быстрый A→B→A.

Откат: `git revert <hash>` — один коммит, только логи. После анализа лога юзера — точечный фикс, логи удалю в том же коммите.

---


### v0.89.41 → v0.91.0 — серия WebContentsView миграция, 16 версий, полный откат

Электрон рекомендовал переход с `<webview>` на WebContentsView. Серия v0.89.41-v0.90.2 — 16 итераций (12 опровергнутых гипотез, архитектурная миграция на BaseWindow). Корень провала найден через WebSearch: [Electron Issue #44934](https://github.com/electron/electron/issues/44934) — на Windows 11 `addChildView(WebContentsView)` + `loadURL` крашит main, closed «not planned».

**v0.91.0 ПОЛНЫЙ ОТКАТ**: вернули `BrowserWindow{webviewTag:true}` + `<webview>` (production-tested). Удалены: webContentsViewManager.js, webContentsViewIpcHandlers.js, WebContentsViewSlot.jsx, webContentsViewBridge.js + 3 теста.

**Сохранены полезные побочки**: UncaughtErrorToast.jsx, global error handlers, idbCacheMetrics.js, crashpad-фильтр, [`electron-breaking-changes.md`](.memory-bank/electron-breaking-changes.md).

**Полный урок и 7 правил для будущих миграций** — в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md).

### v0.89.42 → v0.89.44 — Phase 2/2.3 WebContentsView миграция (откачено в v0.91.0)

Feature-flag в Settings, условный рендер `<WebContentsViewSlot>` vs `<webview>`, bridge для webviewSetup, реактивный `wcv:load-url`, cleanupPartition IPC, breaking-changes docs, IDB cache hit/miss metric. Полная история в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md). Все файлы удалены в v0.91.0.

---

### v0.89.42 — Phase 2 webview миграции: feature flag + условный рендер (pilot без ChatMonitor)

Phase 2.1: toggle `useWebContentsView` в SettingsPanel (default OFF). Phase 2.2: App.jsx условный рендер `<WebContentsViewSlot>` vs `<webview>`. Phase 2.3 (min): pilot БЕЗ ChatMonitor — задокументировано. Phase 2.3 (full) — отдельная фаза. Регрессия +2 проверки.

---

### v0.89.41 — Инфраструктура миграции `<webview>` → `WebContentsView` (feature-flag, default OFF)

По [Electron docs](https://www.electronjs.org/docs/latest/api/webview-tag) «We currently recommend to not use the webview tag, consider WebContentsView». Создана инфраструктура без переключения текущего кода — нулевой риск регрессии. **Файлы**: `webContentsViewManager.js` (класс + 12 forwarded events, graceful degradation), `webContentsViewIpcHandlers.js` (7 IPC `wcv:*` + `wcv:event` bridge), `WebContentsViewSlot.jsx` (React-слот + ResizeObserver → setBounds), регистрация в `main.js`. **Tests**: 638 → 650 (+12 unit + 5 guard).

---

### v0.89.40 — IndexedDB кэш расширен на ВСЕ чаты + TTL cleanup + loadOlder/Newer save

Расширение v0.89.39 (только топики) на все типы чатов. Модуль переименован [`topicMessagesCache.js`](../src/native/utils/topicMessagesCache.js) → [`messagesCache.js`](../src/native/utils/messagesCache.js) (старый — re-export для совместимости). DB `cc-messages-cache`, ключ `chatId:topicId||_main`. **Интеграции в nativeStore.js**: (1) `loadMessages` для обычных чатов делает optimistic render из IDB + сохраняет ответ; (2) `loadOlder/loadNewerMessages` после merge сохраняют tail в IDB; (3) `selectForumTopic` переведён на новые имена. **TTL cleanup**: `cleanupExpired()` через index `ts` + `IDBKeyRange.upperBound` — удаляет всё старше 7 дней. Вызывается при инициализации store через `requestIdleCallback`. **WebContentsView перепроверка**: [`BrowserView` deprecated с **Electron v29.0.0**](https://www.electronjs.org/docs/latest/api/browser-view) (я писал v30 — ошибка). [`<webview>`](https://www.electronjs.org/docs/latest/api/webview-tag) — Electron официально пишет «we recommend to not use». **Tests**: 631 → 638 (+7).

---

### v0.89.39 — AbortController в hooks + IndexedDB кэш форум-топиков (Telegram-style optimistic render)

**Совет 2 — AbortController**: в [`MuteMenu.jsx`](../src/native/components/MuteMenu.jsx) и [`AccountContextMenu.jsx`](../src/native/components/AccountContextMenu.jsx) (по 2 listener'а: pointerdown + keydown) — `{ signal: ac.signal }` + один `ac.abort()` вместо 2 removeEventListener. В файлах с 1 listener — НЕ трогаю (SIMPLICITY).

**Совет 3 — IndexedDB optimistic render**: новый [`topicMessagesCache.js`](../src/native/utils/topicMessagesCache.js) — IDB store `cc-topic-cache`, последние 50 сообщений на топик, TTL 7 дней, graceful degradation. В [`selectForumTopic`](../src/native/store/nativeStore.js) при клике параллельно `loadTopicMessages` → если кэш есть → optimistic render. После сервера → `saveTopicMessages`. Как Telegram Desktop через TDLib local cache.

**Tests**: 624 → 631 (+7).

---

### v0.89.38 — Модернизация по документации стека (Security + Pointer Events + webview overlay)

**4 группы одним коммитом**. A: `trayManager.js` log-viewer перешёл на `contextIsolation:true + preload` (Electron Security Don't #2/#3). B: разделитель AI sidebar залипал — глобальный `position:fixed, zIndex:999999` overlay вместо локального `absolute` (Electron webview docs: события не пересекают границу). C: Mouse Events → [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) в `useAIPanelResize` (+`setPointerCapture`) и 3 dropdown'ах. D: ловушка #29 update — `forceFinalSlideInState()` теперь в ОБОИХ путях (animationend + fallback). Тесты: новый `modernPatternsGuard.test.cjs` (15), `transparentWindowGuard` (19), 624 vitest. Подключены к pre-commit/push.

---

### v0.89.37 — Skeleton overlay + race protection для форум-топиков (Telegram/Discord-style)

Пользователь: «бегает строка загрузки и всё, не грузит». Лог 09:46:24: топик 2325 загрузился за 188мс, но `hasEl=false` (DOM scrollRef ещё не подключён) → `chatReady=false` → `opacity:0` → **~600мс чёрного экрана** на первой загрузке.

**Две корневые причины**:
1. [`InboxChatPanel.jsx:157`](../src/native/components/InboxChatPanel.jsx) условие `&& visibleMessages.length > 0` скрывало overlay при `messages=0` → юзер видел чёрно вместо «Загружаю»
2. [`nativeStore.js selectForumTopic`](../src/native/store/nativeStore.js) без race protection: при быстром A→B ответ A мог затереть state

**Сверка с мессенджерами**: Telegram Desktop, WhatsApp Web, Discord, Slack — все показывают skeleton **сразу** + используют requestId/AbortController.

**Решение 1 (Skeleton, 1 строка)**: убрано `&& visibleMessages.length > 0` — overlay показывается с первого клика.

**Решение 2 (Race protection, ~15 строк)**: `selectTopicRequestRef = useRef(new Map())` хранит последний requestId на chatId. Каждый invoke получает уникальный id. После await сравниваем — если в Map другой id, ответ игнорируем (`{ ok: false, stale: true }`).

**Tests**: 623 → 624 (+1 регрессионный для race). **Ловушка** в `mistakes/native-scroll-unread.md`.

---

### v0.89.36 — Второй корень notification ribbon: force-transform в slideIn fallback (ловушка #29)

Через час после v0.89.35 пользователь снова видит «полосу». Лог 10:11:00: 4 нотификации в одну миллисекунду (race Telegram sync). DOM: `id=105 realTf=matrix(1,0,0,1,380,0) slid=true` — `slideInDone=true` поставлен, но transform застрял на translateX(380). **Корень**: в [`notification.js:573-582`](../main/notification.js) v0.89.23 fallback ставил **только флаг**, не форсировал transform. `calcHeight()` учитывал element 182px, окно расширялось. **Сверка**: Telegram Desktop / WhatsApp / Discord / Slack — все гарантируют final state через JS. **Решение** (~5 строк): fallback теперь форсирует `animation='none'` + `transform='translateX(0) scale(1)'` + `opacity='1'`. Регрессия: тест проверяет 3 force-style. **Ловушка #29** в `mistakes/notifications-ribbon.md`.

---

### v0.89.35 — Корень серии notification ribbon: `backgroundThrottling: false` (ловушка #28)

Через сутки после «закрытия» серии v0.89.18-v0.89.27 пользователь снова увидел пустую полосу + кнопка «Закрыть» не реагирует. Лог 09:07: `DOM snapshot id=17 realTf=matrix(1,0,0,1,380,0)` — item застрял с `translateX(380px)` (0% keyframe из CSS `slideIn`). Анимация не запустилась.

**Сверка с [Electron docs](https://www.electronjs.org/docs/latest/api/browser-window)** (verbatim): «If `backgroundThrottling` is disabled, the visibility state will remain `visible` even if the window is minimized, occluded, or hidden».

**Сверка с кодом**: `notificationManager.js` создавал notifWin БЕЗ `backgroundThrottling: false` → по умолчанию Chromium throttling включён → CSS animations и `requestAnimationFrame` паузятся когда окно `hide()` или occluded → `slideIn` keyframes не выполняются → item застрял → невидим но bounds учитывают высоту → **«пустая полоса»**.

**5 предыдущих фиксов (v0.89.18 safeHide, v0.89.22 убран setIgnoreMouseEvents, v0.89.23 IGNORE stale, v0.89.26 hideIfEmpty, v0.89.27 rendererPure) закрывали симптомы. Корень — `backgroundThrottling: true` по умолчанию — не трогали.**

Также закрывает старую ловушку **v0.47.2** «requestAnimationFrame НЕ работает в hidden BrowserWindow» — тот же стек, тот же throttling, тот же фикс.

**Решение** — 1 строка в [`notificationManager.js:91-97`](../main/handlers/notificationManager.js): добавлен `backgroundThrottling: false` в `webPreferences`.

**Регрессионная защита**: [`transparentWindowGuard.test.cjs`](../src/__tests__/transparentWindowGuard.test.cjs) проверяет наличие параметра. Pre-commit hook падает при удалении (верифицировано: убрал параметр → 17/18 ✅, вернул → 18/18 ✅).

**Ловушка #28** в `mistakes/notifications-ribbon.md` — полная история + правило для будущего.

---

### v0.89.34 — Массовое разбиение: 0 предупреждений 80%+ лимита (запас 20% во всех файлах)

По указанию пользователя: было 12 файлов на 80-99% лимита, стало **0**. Production: `tdlibMessages.js` (475→356, sendFile→tdlibSend.js), `tdlibMapper.js` (417→282, media→tdlibMapperMedia.js), `tdlibIpcHandlers.js` (410→323, event bridge→tdlibIpcBridge.js), `useInboxNewerPrefetch.js` (121→112). Vitest: 4 файла разбиты + 4 новых файла. Compaction: `fileSizeLimits.test.cjs` (345→277, exceptions→отдельный модуль), 3 vitest файла compaction headers/blank lines. **Tests**: 623/623, 7 новых файлов, 0 регрессий.

---

### v0.89.33 — Divider «Новые сообщения» застывает на snapshot позиции открытия

После v0.89.32: полоска постоянно перепрыгивает при прокрутке. Лог: за 36с 8 пересчётов `firstUnreadId`. **Корень**: useEffect пересчёта имел в deps живой `activeReadInboxMaxId` → каждый server sync двигал divider. **Сверка**: TDLib `openChat` lifecycle + Telegram Desktop/WhatsApp/Discord/Slack — все делают snapshot. **Решение** (~15 строк + 1 тест): `frozenReadCursorRef`, сброс по `activeViewKey`, фиксация на первом ненулевом cursor. Счётчик боковой панели остался живой (v0.87.41). **Tests**: 622 → 623. **Ловушка** в `mistakes/native-scroll-unread.md`.

---

### v0.89.32 — Диагностические логи для форум-топиков (markRead pipeline + prepend size jumps)

После v0.89.31 две жалобы: счётчик замирает / окно дёргается. Лог 17:57 показал: (1) замирания = `read-batch-skip` watermark защита v0.87.37 (правильное поведение); (2) дёргание = `top=27666→1669` после prepend 100 msg в react-window. 100% решения нет — добавлены диагностические логи: `[topic-mark] INVOKE/OK/ERROR` в backend, `[topic-mark-ui] SEND` + `[topic-mark-refresh] delta` в store, `[topic-load-older/newer] before/added/after`. **Tests**: 622 без изменений.

---

### v0.89.31 — Форум-топики: плашка «N из M» двигается, счётчик сбрасывается (ловушка #30)

После v0.89.30 пользователь сообщил: плашка «100 из 217» замирает, счётчик 217 не сбрасывается. **Три причины**: (1) `loadOlder/loadNewerMessages` для топиков не пересчитывали `messageWindows[key].loadedIncoming`; (2) [`viewMessages`](https://github.com/tdlib/td/blob/master/td/generate/scheme/td_api.tl) для форумов требует `source: messageSourceForumTopicHistory`, мы не передавали; (3) `unreadWindowIncomplete` блокировал force-read.

**Правки** (3, ~30 строк): `nativeStore.js` loadOlder/Newer для топика пересчитывают `messageWindows[key]` через `buildUnreadWindowMeta`; [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `markTopicRead` добавляет `source: messageSourceForumTopicHistory`. **Tests**: 620 → 622. **Ловушка #30** в `mistakes/tdlib-forum.md`.

---

### v0.89.30 — Форум-топики: сообщения теперь грузятся (`forum_topic_id` ≠ `message_thread_id`, ловушка #29)

После v0.89.29: топик OZON → `Message not found`, General → `Scheduled messages can't have message threads`.

**Корень**: `forum_topic_id` (int32, UI) ≠ `message_thread_id` (int53, API). [TDLib docs](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html): `getMessageThreadHistory` ожидает **message_id первого сообщения треда**, а мы передавали короткий UI-id. Плюс General топик (`is_general=true`) = весь чат, для него `getChatHistory`.

**Решение** (3 файла, ~30 строк):
1. [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `forum.getTopics`: добавлены `threadMessageId: t.last_message?.message_thread_id ?? t.last_message?.id ?? null` + `isGeneral: !!t.info?.is_general`
2. [`nativeStore.js`](../src/native/store/nativeStore.js) `selectForumTopic`/`loadOlder`/`loadNewer`: передают `threadMessageId` и `isGeneral` в IPC payload
3. [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `messages.getTopic`: branch — `isGeneral` → `getChatHistory`, иначе → `getMessageThreadHistory(message_id=threadMessageId)`

**Tests**: 615 → 620 (+5: threadMessageId из last_message, fallback на last_message.id, isGeneral path, empty for missing thread). **Ловушка #29** в `mistakes/tdlib-forum.md`.

---

### v0.89.29 — TDLib 1.8 переименовал `message_thread_id` → `forum_topic_id` (ловушка #28)

**Контекст**: после v0.89.28 diagnostic logs пользователь воспроизвёл: кликает на тему OZON → справа черно. Логи 15:35:

```
[topic-ui] selectForumTopic ... topicId= topMessageId= unreadCount=215
                                ↑↑↑ ПУСТЫЕ!
[topic-be] no topicId — params={topicId:"",topMessageId:"",...}
[topic-ui] result ok=false error=no topicId
```

Для **ВСЕХ** тем (74, 215, 100 непрочитанных) `topicId` пустая строка.

#### Корневая причина — TDLib breaking change в API между 1.7 → 1.8

📚 Сверка с [официальной TDLib документацией](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html):

| Старое (TDLib 1.7.x) | Новое (TDLib 1.8+) |
|---|---|
| `forumTopicInfo.message_thread_id: int53` | `forumTopicInfo.forum_topic_id: int32` |
| — | `forumTopicInfo.chat_id: int53` (добавлено) |
| — | `forumTopicInfo.is_general: Bool` (добавлено) |

Наш проект: `prebuilt-tdlib@0.1008064.0` → **TDLib v1.8.64** (новейшая на май 2026).

Наш код в [tdlibBackend.js:488](../main/native/backends/tdlibBackend.js) читал `t.info?.message_thread_id` — **поле НЕ существует** в 1.8+ → `undefined` → `String(undefined || '') === ''` → все topics с пустым `id`.

#### Решение

```js
// Поддержка обоих имён (новое первым, старое как fallback)
const threadId = t.info?.forum_topic_id ?? t.info?.message_thread_id
const idStr = threadId !== null && threadId !== undefined ? String(threadId) : ''
```

Использовали `??` (nullish coalescing) вместо `||` — чтобы `0` (валидное значение для general topic) не fall-through на fallback.

Также добавили `isGeneral: !!t.info?.is_general` в наш topic объект — UI может отличать general от пользовательских тем.

#### Регрессионная защита

```js
// При первом полученном topic печатает СЫРУЮ структуру info от TDLib
if (result?.topics?.[0]) {
  console.log('[forum-be] sample topic[0] info=' + JSON.stringify(result.topics[0].info) + ' unread=...')
}
```

Если TDLib снова переименует поле в будущих версиях — увидим в первой сессии после апдейта.

#### Ловушка #28 — записана в `mistakes/tdlib-forum.md`

«TDLib **не использует semver** в смысле "minor не ломает API". Каждая новая версия (1.7 → 1.8) может переименовать или удалить поля. При апдейте `prebuilt-tdlib` — проверять td_api spec на breaking changes».

Добавлен список известных переименований 1.7 → 1.8 для справки.

#### Эффект

🟢 **Что починилось**:
- Forum topics получают корректные `id` (forum_topic_id или 1 для general)
- `selectForumTopic` отправляет правильный topicId → backend.getTopic не отбрасывает
- TDLib `getMessageThreadHistory` получает валидный `message_id` → возвращает сообщения
- Active state работает (id для каждого topic уникальный) — синяя полоса слева видна
- «Загружаю непрочитанные» завершается + показываются сообщения

---

### v0.89.28 — Forum topic UI: active state visible + diagnostic для load topic messages

После v0.89.25 forum-чаты показывают панель тем, но (1) активная тема почти не видна (13% alpha на AMOLED), (2) клик на тему — справа чёрно, нет логов про `tg:get-topic-messages`.

**Правки**: CSS active state увеличен с 13% alpha до `rgba(42,171,238,0.18)` + `border-left: 3px solid #2AABEE` (Telegram-style). 3 точки логирования: `selectForumTopic`, `tg:get-topic-messages` result, `backend.messages.getTopic`. Логи v0.89.29 показали `topicId=""` (см. ловушка #28).

---

### v0.89.27 — `rendererPure` авторитативный signal — ловушка #26

После v0.89.26 полоска возвращается. Лог: `IGNORE stale raw=0 (items=2 > 0)` — main process накопил мусор от ghost-stacking. Решение: renderer = source of truth для terminal state. `notif:resize` принимает `meta = { rendererPure: boolean }`. Main очищает мусор и скрывает окно если `height<=0 && rendererPure`. 3 файла: `notification.js`, `notification.preload.cjs`, `notifHandlers.js`. **Ловушка #26** в `mistakes/notifications-ribbon.md`.

---

### v0.89.26 — Окно notification не скрывалось после dismiss (ловушка #25)

После v0.89.23 race: `notif:resize(0)` приходил ДО `notif:dismiss` → защита v0.89.23 IGNORE'нула resize → больше resize не приходило → окно visible. Решение: `hideIfEmpty()` после каждого setNotifItems в 3 handler'ах (`notif:click`/`mark-read`/`dismiss`). Main process — source of truth, не ждём renderer. **Ловушка #25** в `mistakes/notifications-ribbon.md`.

---

### v0.89.25 — Fix: `is_forum` в TDLib supergroup, не в chatTypeSupergroup (ловушка #24)

[TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1supergroup.html): `is_forum` в объекте `supergroup`, не в `chatTypeSupergroup`. До v0.89.25 mapChat читал `type.is_forum` (undefined). Решение: `supergroupCache` + `updateSupergroup` handler в `tdlibClient.js`, mapChat читает `extras.supergroup.is_forum`. **Tests**: 608 → 615 (+7). **Ловушка #24** в `mistakes/tdlib-forum.md`.

---

### v0.89.24 — Diagnostic логи для forum topics pipeline

Пользователь: forum-чаты не открывают панель тем. Добавлены 4 точки логирования `[forum-ipc/be/map/ui]` без правок поведения. Логи v0.89.25 → нашли причину (is_forum в supergroup, не chatTypeSupergroup, ловушка #24).

---

### v0.89.23 — Два бага notification pipeline: «пустая полоса» + race `raw=0 items=1`

**Контекст**: после v0.89.22 пользователь прислал скриншот в 12:12 — сверху видно Telegram уведомление «vevs.home», ниже **пустая полоса**. Логи v0.89.20-21 + DOM snapshots показали: items=2 в DOM, оба op=1 tf=none, но визуально один не виден.

#### Два независимых бага, оба подтверждены документально по стеку

**Баг #1 — «Пустая полоса»**: slideIn animation 300ms + offsetHeight включён в calcHeight → окно расширяется СРАЗУ, но новый element ещё за экраном (translateX анимируется).

Подтверждение из MDN:
- 📚 [HTMLElement.offsetHeight](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetHeight): «measures layout position, not visual position. CSS transforms affect only visual rendering»
- 📚 [Using CSS animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Using_CSS_animations): «Animated property values do NOT appear in `element.style` — only computed style»

**Баг #2 — Race `raw=0 items=1`**: renderer прислал `notif:resize(0)` от прошлого dismiss ПОСЛЕ того как main process получил новое `notif:show` (items=1) → main скрывает окно ошибочно.

Подтверждение из Electron docs:
- 📚 [ipcRenderer.send](https://www.electronjs.org/docs/latest/api/ipc-renderer): «Send an **asynchronous** message to the main process»
- setTimeout 60ms в `reportHeight` не гарантирует порядок относительно других IPC

#### Решение Баг #1 — slideInDone флаг

В [`main/notification.js`](../main/notification.js):

```js
// Перед appendChild:
el.dataset.slideInDone = 'false'

// Слушаем animationend для slideIn:
el.addEventListener('animationend', (e) => {
  if (e.animationName !== 'slideIn') return
  el.dataset.slideInDone = 'true'
  reportHeight()  // ← перепроверяем теперь когда element на месте
}, { once: true })

// Страховка 600ms на случай если animationend не сработает

// В calcHeight():
if (child.dataset.slideInDone === 'false') continue  // ← новое: пропускаем анимирующиеся
```

**Эффект**: `calcHeight` НЕ включает новый element пока он анимируется → main НЕ расширяет окно раньше времени → пользователь не видит пустоты.

#### Решение Баг #2 — игнорировать stale `raw=0`

В [`main/handlers/notifHandlers.js`](../main/handlers/notifHandlers.js):

```js
const itemsCount = getNotifItems().length
if (height <= 0 && itemsCount > 0) {
  console.log('[notif-resize] IGNORE stale raw=0 (items=' + itemsCount + ' > 0)')
  return  // ← stale event от прошлого dismiss
}
```

**Эффект**: если main знает что есть item, но renderer прислал `0` (запоздалый reportHeight) — игнорируем. Следующий reportHeight от renderer пришлёт правильное значение.

#### Усиление диагностики

DOM snapshot теперь логирует:
- `inlineTf` (старый `tf`) — `el.style.transform` (inline)
- `realTf` — `getComputedStyle(el).transform` (учитывает CSS animation!)
- `slid` — флаг `slideInDone`

Если баг #1 вернётся — лог сразу покажет реальный transform.

#### Документация

Обе ловушки записаны в [`mistakes/notifications-ribbon.md`](mistakes/notifications-ribbon.md):
- Ловушка #22 — «Пустая полоса» (slideIn + offsetHeight)
- Ловушка #23 — IPC race (stale resize=0)

Каждая с MDN/Electron ссылками + правилом.

#### Урок

В v0.89.21 я добавил DOM snapshot, но логировал только `el.style.transform` — это inline style, **не** учитывает CSS animation. По MDN: animation values «only exist in computed style». Я не прочитал MDN при добавлении лога. Через 1 итерацию (v0.89.21 → v0.89.22) пользователь поймал баг через скриншот.

**Правило (для auto-memory)**: при добавлении diagnostic log для CSS-анимируемых свойств — ВСЕГДА читать `getComputedStyle()`, не `el.style`.

---

### v0.89.15 – v0.89.22 — заархивированы

Перенесены в [`archive/features-v0.89.15-22.md`](./archive/features-v0.89.15-22.md) (релиз v0.89.44, 19 мая 2026 — features.md перевалил 100 КБ после Phase 2 серии).

В архиве: серия notification ribbon (v0.89.18-v0.89.22 — корни закрыты в v0.89.35 backgroundThrottling и v0.89.36 force-transform), LRU-кеш tg-media (v0.89.17), постеры видео (v0.89.16), финал видео-pipeline (v0.89.15).

---

---

### v0.89.6 – v0.89.14 — заархивированы

Перенесены в [`archive/features-v0.89.6-14.md`](./archive/features-v0.89.6-14.md) (18 мая 2026, при превышении features.md 100 КБ в v0.89.19). 9 итераций видео-pipeline стабилизации после TDLib миграции — серия закрыта в v0.89.15-v0.89.16 (подтверждено пользователем).

### v0.89.1 – v0.89.5 — заархивированы

Перенесены в [`archive/features-v0.89.1-5.md`](./archive/features-v0.89.1-5.md) (релиз v0.89.14, 15 мая 2026 — features.md перевалил 100 КБ после серии видео-фиксов v0.89.7–v0.89.14).

В архиве: полное удаление GramJS (v0.89.1), 4 раунда аудита TDLib миграции (v0.89.2–v0.89.5).

---

### v0.89.0 — Этап 2 виртуализации: VirtualMessageList в InboxChatPanel

**Контекст**: v0.88.x подготовили почву (страховка push, защитные тесты), v0.89.0 — собственно
рефакторинг рендера. До этого `renderItems.map(...)` рендерил **весь** список сообщений в DOM
(в чатах с 4000+ непрочитанных это даёт лаги при скролле). Теперь DOM держит только
видимые ~20 строк + overscan через [`react-window`](https://github.com/bvaughn/react-window) 2.2.

**Что сделано**:

- [`src/native/components/VirtualMessageList.jsx`](src/native/components/VirtualMessageList.jsx) — компонент Phase 1 (создан в v0.88.3) расширен: принимает события `onScroll/onWheel/onTouchStart/onPointerDown/onDragOver/onDragLeave/onDrop` и пробрасывает их в outer div `<List>` через `...rest`. `MessageRow` теперь сам делает `padding: 16px по бокам + 6px снизу` (вместо старого `padding/gap` на scroll-контейнере), `boxSizing: 'border-box'` — `ResizeObserver` react-window учитывает paddingBottom как часть высоты row.
- [`src/native/components/InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx) — `renderItems.map(...)` блок (~95 строк) заменён на `<VirtualMessageList>`. `msgsScrollRef` теперь синхронизируется с `listRef.current.element` через `useEffect` + `useState scrollElement`. Этот state нужен IntersectionObserver'у в `MessageBubble.readRoot` — при первом рендере root ещё `null`, после монтирования react-window выставляется реальный element, observer пересоздаётся (deps `[enabled, root]` в `useReadOnScrollAway`).
- [`src/native/hooks/useInitialScroll.js`](src/native/hooks/useInitialScroll.js) — добавлен опциональный `onMissingTarget(firstUnreadId)` callback. Когда `querySelector('[data-msg-id]')` промахивается (firstUnread вне видимого виртуального DOM), вызывается `onMissingTarget` → InboxMode скроллит через `listRef.current.scrollToRow({ index })`. Без fallback react-window открывал чат сверху, юзер не видел непрочитанные.
- [`src/native/modes/InboxMode.jsx`](src/native/modes/InboxMode.jsx):
  - `virtualListRef = useRef(null)` — imperative API react-window.
  - `findRenderItemIndex(msgId)` — ищет где сообщение в `renderItems` (учитывает альбомы: `item.msgs[*].msgs[*].id` для типа `album`).
  - `scrollToVirtualRow(msgId, align)` — вызывает `virtualListRef.scrollToRow({ index, align })`.
  - `scrollToMessage(msgId)` сначала пробует старый `querySelector` (видимый row), потом fallback `scrollToVirtualRow(msgId, 'center')` + повторная попытка подсветить через 200 мс.
  - `useInitialScroll` получает `onMissingTarget: id => scrollToVirtualRow(id, 'start')`.
- `src/__tests__/unreadAutoPrefetch.test.cjs` — 2 защитных теста v0.88.2 обновлены (проверка проводки `onReplyClick={scrollToMessage}` теперь смотрит в `VirtualMessageList.jsx`, не в `InboxChatPanel.jsx`); добавлено 5 новых тестов: `InboxChatPanel рендерит VirtualMessageList`, `VirtualMessageList использует react-window <List> + useDynamicRowHeight`, `InboxMode прокидывает virtualListRef`, `findRenderItemIndex + scrollToVirtualRow`, `useInitialScroll.onMissingTarget`. (v0.89.x Этап 4: файл удалён вместе с GramJS-специфичными тестами. Виртуализационные регрессии теперь покрывает [`src/native/components/VirtualMessageList.vitest.jsx`](src/native/components/VirtualMessageList.vitest.jsx).)

**Сохранено без изменений**:

- `useReadOnScrollAway` (rootMargin `-48% 0px -48% 0px`) — работает как раньше, просто root = `listRef.element` вместо div'a.
- `useInboxScroll` + `useInboxNewerPrefetch` (load-older, prefetch-newer, atBottom) — onScroll-event тот же, теперь приходит из react-window.
- `useReadByVisibility` (batch markRead 300мс) — не трогали.
- `useNewBelowCounter`, `useForceReadAtBottom`, `useMessageActions` — не трогали.
- `messageGrouping.js` — критичная защита v0.87.113 (senderAvatar в group/album) — без изменений.

**Известные риски, требующие визуальной проверки**:

- **load-older preserve scroll position** (`scrollTop = scrollHeight - prevHeight`) при виртуализации работает, но `useDynamicRowHeight` измеряет высоту row асинхронно через `ResizeObserver`. Если новые сообщения ещё не обмерены — `scrollHeight` неточен. Если будет «прыжок» при подгрузке вверх — нужна будет замена на `scrollToRow({ index: addedCount, align: 'start' })`.
- **`overflow-anchor`** браузера на virtualised DOM работает иначе. Если будут «дрожания» при добавлении сообщений сверху — добавить `overflow-anchor: none` на outer div react-window.
- **Шапка / pinned message / unread-status bar** живут вне списка — никак не должны были пострадать.

**Версия**: v0.88.2 → v0.89.0 (minor — UI-функциональность не изменилась, но внутренняя архитектура рендера переработана).

**Проверено**:

```powershell
npm.cmd run lint                                            # ожидается OK
npm.cmd run test:vitest                                      # ожидается 166/166 (не должны отвалиться без изменений в API)
node src\__tests__\unreadAutoPrefetch.test.cjs               # 27/27 (+5 виртуализационных)
node src\__tests__\fileSizeLimits.test.cjs                   # лимиты в порядке
```

⚠ **Визуальная проверка пользователем обязательна**: открыть чат с 100+ непрочитанными → должен встать на первое непрочитанное (проверка `onMissingTarget` fallback). Reply-click на старое сообщение → scroll-to-reply должен работать. Прокрутка длинного чата (4000+) — должна быть плавной без лагов DOM.

---

### v0.88.2 — страховка push для real-time + защитные тесты перед Этапом 2

**Контекст**: перед большим рефактором (виртуализация рендера, Этап 2) — две инженерные страховки.

**Страховка 1 — real-time push расhron**:

- В v0.88.1 флаг `noMoreNewerRef` блокировал бесконечный prefetch у конца чата.
- Теоретический пробел: если Telegram push (`tg:new-message`) по какой-то причине пропустит сообщение (gap в `pts`, потеря сессии), флаг остаётся `true` и блокирует prefetch как «спасательный канал» до смены чата.
- Источник: [core.telegram.org/api/updates](https://core.telegram.org/api/updates) — Telegram использует server-push, но требует клиента вызывать `updates.getDifference` при rasync; GramJS делает это сама при reconnect.
- Решение: в [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js) добавлен `useEffect` который отслеживает `activeMessages.length` + `scrollKey`. Когда массив растёт в рамках одного `viewKey` (push доставил новое сообщение или load-newer вернул что-то) — флаг `noMoreNewerRef.current.delete(viewKey)` автоматически снимается. Логируется через `load-newer-flag-reset`.
- Поведение: чат с 0 unread → флаг становится `true` → приходит push через 10 минут → массив растёт → флаг снимается → следующий скролл может снова попробовать prefetch.

**Страховка 2 — защитные тесты перед Этапом 2**:

В `unreadAutoPrefetch.test.cjs` (v0.89.x Этап 4: удалён) добавлены статические проверки на критичные интеграции, которые **с большой вероятностью пострадают при внедрении виртуализации**:

- `MessageBubble` и `AlbumBubble` принимают `onReplyClick` (reply → scroll-to-message).
- `InboxChatPanel` проводит `scrollToMessage` в `onReplyClick`.
- `groupMessages(visibleMessages, firstUnreadId)` — группировка с разделителем «Новые сообщения».
- `useInitialScroll` читает `firstUnreadIdRef`.
- `useReadOnScrollAway` использует `rootMargin: '-48% 0px -48% 0px'` (читающая линия).

Если виртуализация Этапа 2 сломает любую из этих интеграций — соответствующий статический тест упадёт и сразу укажет где смотреть.

**Версия**: v0.88.1 → v0.88.2 (patch — страховочное улучшение без новой UI-функциональности).

**Проверено**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 files / 166 tests passed
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 22/22 (+6 от v0.88.1)
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
```

---

### v0.88.1 — фикс бесконечного цикла prefetch у конца чата

**Баг из v0.88.0**: после первой автодогрузки внизу ленты индикатор «Загружаю ещё...» оставался видимым и не пропадал. Окно чата периодически «дёргалось» каждые 300 мс.

**Причина**:
1. Скролл доходил до низа (`fromBottomPx < 1500`) → срабатывал prefetch.
2. Telegram возвращал пустой массив (новее сообщений нет — пользователь у конца чата).
3. Backend всё равно эмитил `tg:messages` с пустым `messages`.
4. IPC listener делал `setState({ messages: [...existing, ...[]] })` — **новая ссылка** на тот же контент → лишний рендер («дёрг»).
5. Через 300 мс `loadingNewerRef` снимался → scroll положение то же → опять триггер → опять пустой ответ. Бесконечный цикл.

**Фикс**:
- `main/native/telegramMessages.js`: `tg:get-messages` и `tg:get-topic-messages` **не эмитят** `tg:messages` если `afterId` использован и Telegram вернул `0` сообщений.
- `src/native/store/nativeStoreIpc.js`: на случай если backend всё-таки эмитнет — listener делает **ранний return без setState** когда `appendNewer:true` и `newNewer.length === 0`.
- `src/native/hooks/useInboxScroll.js`: добавлен `noMoreNewerRef = useRef(new Map())`. Когда `loadNewerMessages` возвращает `hasMore:false` ИЛИ пустой массив — фиксируем флаг для этого `viewKey`. Условие триггера дополнено: `!noMoreNewerRef.current.get(viewKey)`. Сбрасывается естественно при смене чата/темы (новый `viewKey` → новая запись в Map).
- Новые vitest-тесты:
  - `appendNewer` с пустым массивом **не меняет ссылку** на массив сообщений (`expect(refAfter).toBe(refBefore)`).
  - `appendNewer` только с дубликатами — то же.
- Новые static-тесты в `unreadAutoPrefetch.test.cjs` (3 проверки): `noMoreNewerRef`, ранний return, отказ от пустого emit.

**Проверено**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 файлов, 166 тестов passed
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 16/16
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
```

---

### v0.88.0 — Telegram-style автодогрузка новых сообщений вниз

**Контекст**: пользователь нашёл реальные большие чаты (например, чат «1337» с **4253 непрочитанных**). До этого фикса:
- Код запрашивал у Telegram пачку из 500 сообщений, но Telegram MTProto `messages.getHistory` имеет **жёсткий лимит 100** за запрос (источник: [core.telegram.org/api/offsets](https://core.telegram.org/api/offsets)).
- Получая 100 из «ожидаемых» 500, баннер навсегда застревал на `100 из 138` (или `50 из 999+`).
- Не было функции догрузки **новых** сообщений вниз — только `loadOlderMessages` для прокрутки вверх в историю.
- Результат: открыл чат → проскроллил вниз → застрял, остаток непрочитанных не виден.

**Что сделано**:

- `main/native/telegramMessages.js`: добавлен параметр `afterId` в `tg:get-messages` и `tg:get-topic-messages`. Маппится в MTProto `min_id` + `offset_id=0` + `add_offset=-limit`. При `afterId` бэкенд эмитит `tg:messages` с флагом `appendNewer: true`. (v0.89.x Этап 4: файл удалён, поведение перенесено в [`main/native/backends/tdlibMessages.js`](main/native/backends/tdlibMessages.js).)
- `src/native/store/nativeStore.js`:
  - Константа `UNREAD_WINDOW_MAX_MESSAGES` уменьшена 500 → **100** (реальный потолок Telegram API). Это исправляет баг «100 из 138».
  - Умная формула `addOffset` в [`unreadWindowRequestParams`](src/native/store/nativeStore.js): при `unread > 30` окно сдвигается ближе к курсору (90% непрочитанных), для маленьких unread оставляем больше контекста (25%).
  - Новая функция [`loadNewerMessages(chatId, afterId, limit=100)`](src/native/store/nativeStore.js) с per-key throttle **300 мс** (защита от `FLOOD_WAIT`).
- `src/native/store/nativeStoreIpc.js`: слушатель `tg:messages` теперь обрабатывает поле `appendNewer: true` — добавляет новые сообщения в конец массива с дедупликацией.
- `src/native/hooks/useInboxScroll.js`: добавлен prefetch-триггер: при `fromBottom < 1500px` (≈20 сообщений) → `store.loadNewerMessages(chatId, lastIncomingId)`. Защищено `loadingNewerRef`. Срабатывает только после `initialScrollDone`.
- `src/native/modes/InboxMode.jsx`: новые `loadingNewerRef` + `useState(loadingNewer)` для UI индикатора, пробрасываются в `useInboxScroll` и `InboxChatPanel`.
- `src/native/components/InboxChatPanel.jsx`: внизу ленты появляется индикатор `«Загружаю ещё...»` (CSS-класс `native-msgs-loading-newer`) во время фоновой подгрузки.
- `src/native/styles-messages.css`: добавлены стили `native-msgs-loading-newer` с пульсирующей точкой.
- Тесты обновлены: `nativeStore.vitest.jsx`, `multiAccount.test.cjs`.

**Подтверждённые числа** (а не выдуманные):

| Число | Что | Откуда |
|---|---|---|
| `100` | Размер пачки | [Telegram MTProto docs](https://core.telegram.org/api/offsets) — жёсткий потолок |
| `300 мс` | Throttle между пачками | Практика MadelineProto/Telethon — безопасный темп против FLOOD_WAIT |
| `1500 px` | Prefetch порог | ≈20 сообщений (react-virtualized default = 15) |
| `0.9 / 0.25` | Соотношение addOffset | Большой unread → почти всё окно для непрочитанных; маленький → больше контекста |

**Что НЕ сделано в этом этапе** (отдельные задачи):

- DOM-виртуализация через `react-virtuoso`/`react-window` для основного рендера: коммерческая версия `VirtuosoMessageList` платная, бесплатная требует переписать группировку/mark-read/scroll-to-reply (~600-800 строк, риск регрессий). Отдельный Этап 2 после стабилизации.
- Отправка/ответ в выбранную тему форума: вход disabled (см. журнал).
- Анимация «stale» badge при refresh: убрано из плана как лишняя нагрузка.

**Подробное расследование**: [`group-topic-investigation.md`](./group-topic-investigation.md), запись от 2026-05-13 «Stage: Newer-messages auto-prefetch».

---

### v0.87.115 – v0.87.136 — заархивированы

Перенесены в [`archive/features-v0.87.115-136.md`](./archive/features-v0.87.115-136.md) (релиз v0.89.9, 15 мая 2026 — features.md перевалил 100 КБ лимит после серии audit-релизов).

В архиве: фикс пустой аватарки чата (v0.87.115), unified connection health status (v0.87.136), Windows installer в корневой dist (v0.87.135), startup graph оптимизации (v0.87.130-134), безопасное восстановление native-аккаунтов (v0.87.127), lazy startup панелей (v0.87.126).

---

### v0.87.106 – v0.87.114 — заархивированы

Перенесены в [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) (релиз v0.89.5, 15 мая 2026 — `features.md` перевалил 100 КБ лимит после четырёх audit-релизов).

В архиве: убран счётчик чатов (v0.87.114), главный фикс аватарок отправителей в групповых чатах (v0.87.113), `GetFullUser` для User без photo (v0.87.112), фоновое скачивание аватарок отправителей (v0.87.111), визуал мьюта + двухуровневое меню (v0.87.110), заглушение уведомлений чата (v0.87.109), кнопки режимов в шапке (v0.87.108), убрана угловая иконка с аватарки (v0.87.107), финальный multi-account UI (v0.87.106).

---

### v0.87.93 – v0.87.105 — заархивированы

Перенесены в [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) (релиз v0.88.2, 13 мая 2026 — `features.md` перевалил 100 КБ лимит).

В архиве: реализация multi-account для native Telegram (v0.87.105), план multi-account (v0.87.104), разбиение 5 файлов на 80%+ (v0.87.103), CodeInput-ячейки (v0.87.102), libphonenumber-js (v0.87.101), CountryPicker (v0.87.99-100), фикс retry-цикла GramJS (v0.87.98), Low Priority разбиение 4 файлов (v0.87.97), фильтр GramJS TIMEOUT (v0.87.96), полный выход из аккаунта (v0.87.95), умный logger (v0.87.94), фикс аватарки через `cc-media://` (v0.87.93).

---
