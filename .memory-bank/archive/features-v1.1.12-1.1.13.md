# Архив v1.1.12 – v1.1.13

Заархивировано 11 июня 2026 при выпуске v1.1.15 для освобождения места в активном features.md. Эти версии полностью документированы в:
- [`progress-v1.1.7-v1.1.13.md`](../ai-agent-plan/progress-v1.1.7-v1.1.13.md) — главный документ прогресса AI Bridge с диаграммой архитектуры
- Код стабилен и используется в AI Bridge v1.2.0

---

## v1.1.13 — AI Bridge Этапы 5+6: hook файлы для 4 AI веб-сайтов

Реальные hook скрипты для chat.openai.com, chat.deepseek.com, claude.ai, giga.chat. Когда юзер откроет AI сайт в webview (Этап 7) — программа сможет автоматически вставить вопрос и забрать ответ из DOM.

**Файлы** (~150-200 строк каждый):
- `main/preloads/hooks/ai/openai.hook.js` — ChatGPT. Селекторы: `#prompt-textarea` (textarea ИЛИ contenteditable div в новой версии) + `[data-testid="send-button"]` + `[data-message-author-role="assistant"] .markdown` + `.result-streaming, [data-message-status="in_progress"]`. DEBOUNCE_MS=800, MAX_WAIT=90с.
- `main/preloads/hooks/ai/deepseek.hook.js` — DeepSeek. Селекторы: `textarea[placeholder*="Send a message"]` + Vue-style классы. DEBOUNCE_MS=1000, MAX_WAIT=120с (reasoner модель). Менее стабильные классы → custom selectors.
- `main/preloads/hooks/ai/anthropic.hook.js` — Claude. Селекторы: `div[contenteditable="true"][role="textbox"]` (НЕ textarea!) + `button[aria-label="Send Message"]` + `[data-is-streaming="false"][data-message-id]`. Особый `setInputValue`: для contenteditable нужен **дополнительный `InputEvent` с inputType:'insertText'** — иначе React не обновляет state. MAX_WAIT=120с.
- `main/preloads/hooks/ai/gigachat.hook.js` — ГигаЧат. Селекторы **неточные** (Сбер использует Angular) — юзер настроит через UI (Этап 8). Fallback с broad селекторами.

**Общая структура** (все 4 идентичны):
- IIFE с защитой от двойной загрузки через `__ccAiHookLoaded`.
- `setInputValue` — textarea (native setter+input event) / contenteditable (textContent+input+InputEvent) / fallback execCommand.
- `waitForAnswer` — polling по новым assistant сообщениям + debounce + streaming indicator + timeout.
- `handleInject` — apply custom selectors → find input → setInputValue → click submit (или Enter fallback) → waitForAnswer.
- Errors: input_not_found / submit_not_found / unknown / streaming_timeout.
- Регистрация через `window.__ccAiBridge.setInjectHandler(handleInject)` + delayed fallback через `setTimeout(50)`.

**Custom selectors** (для Этапа 8): payload `handleInject` может содержать `selectors: {input, submitButton, ...}` — переопределяют defaults. Для DeepSeek после обновления сайта: `config.customSelectors = { input: '#new-input-id' }`.

**Тесты (+30)**: `src/__tests__/aiHooks.vitest.js` — sanity check для каждого hook: файл существует и > 1000 байт, загружается без throw, регистрирует setInjectHandler, логирует «hook готов», пустой DOM → input_not_found, защита от двойной загрузки, пустой text → return без error/answer. Общий тест: все 4 файла найдены.

**Регрессия**: lint 0, vitest 1667 → 1697 ✅ (+30), fileSizeLimits 434 → 435 ✅.

**Известные риски** (требуют тестирования в Этапе 7):
- OpenAI меняет data-testid ~раз в 3-4 месяца.
- DeepSeek в РФ частично блокирован → VPN.
- Claude может изменить data-attributes streaming.
- ГигаЧат селекторы — приблизительные.

---

## v1.1.12 — AI Bridge Этап 4: WebUI Bridge skeleton (самый рискованный)

Каркас общения программы с AI веб-сайтами через preload + DOM injection. На этом этапе hook файлы провайдеров **пустые** — реальная инъекция в Этапах 5-6. Но вся «трубопроводная» часть работает.

**Почему «самый рискованный»**: webview — изолированный браузер с CSP/DRM/anti-bot. Ошибка в preload роняет страницу AI сайта, не приложение. Step-by-step с тестами.

**Архитектурное решение**: следуем паттерну `monitor.preload.cjs` (работает год для мессенджеров). НЕ изобретаем новое.

**Файлы**:

- `main/preloads/ai-monitor.preload.cjs` (~165 стр.) — preload скрипт:
  - detectProvider по `location.hostname` (HOST_TO_PROVIDER: chat.openai.com/chatgpt.com → openai, chat.deepseek.com → deepseek, claude.ai → anthropic, giga.chat/developers.sber.ru → gigachat). Поддомены через endsWith().
  - `fs.readFileSync(__dirname + '/hooks/ai/' + provider + '.hook.js')`. Silent fallback.
  - Инъекция через `<script>` tag в main world.
  - Создаёт `window.__ccAiBridge` API: `log/answer/error/setInjectHandler/_enqueueInject`.
  - `window.message` → IPC main. `ipcRenderer.on('ai-bridge:webui:inject')` → передаёт hook через `<script>` evaluating `window.__ccAiBridge._enqueueInject(payload)`.
  - Защита от двойной загрузки через `window.__ccAiPreloadInitialized`.
  - Сообщает `ai-bridge:webui:ready` после init.
  - Только `ipcRenderer.send('app:log', ...)` (никаких console.*).

- `main/preloads/hooks/ai/.hookTemplate.js` (~140 стр.) — шаблон-документация. НЕ загружается (имя с точкой).

- `main/ai/bridge/webUiBridge.js` (~155 стр.):
  - `createWebUiBridge(config)` — providerId + timeoutMs (default 90с) + selectors (custom от юзера).
  - `registerWebview(providerId, webContents)` — реестр активных webview.
  - `deliverAnswer/deliverError` — связь payload с pending Promise по questionId.
  - `clearWebUiBridgeState()` — для тестов.
  - `bridge.ask(question)`: проверка webview зарегистрирован → uniqueQuestionId → `webContents.send('ai-bridge:webui:inject')` → `Promise.race(response, timeout, abort)` → AiBridgeAnswer.

- `main/handlers/aiBridgeIpcHandlers.js` расширено: `mode='webui'` → createWebUiBridge (требует providerId). `ipcMain.on('ai-bridge:webui:answer-received')` → deliverAnswer. `ipcMain.on('ai-bridge:webui:error')` → deliverError. `ipcMain.on('ai-bridge:webui:ready')` → no-op. DI: `deps.factoryWebUi`.

- `main/handlers/mainIpcHandlers.js`: `app:get-paths` возвращает `aiMonitorPreload` путь.

- `electron.vite.config.js`: preload input + `'ai-monitor'` + copyStaticPlugin копирует `main/preloads/hooks/ai/*.hook.js` → `out/preloads/hooks/ai/`.

**Тесты (+19)**:
- `webUiBridge.vitest.js` (16): validation, webview не зарегистрирован, happy path, custom selectors, deliverError, no_answer, webContents.send throws, timeout, abort, register/unregister.
- `aiBridgeIpcHandlers.vitest.js` (+2): mode=webui без providerId → config_invalid, с providerId → factoryWebUi вызвана.

**Регрессия**: lint 0, vitest 1650 → 1667 ✅ (+17), fileSizeLimits 432 → 434.

**Безопасность**: preload в sandboxed контексте, hook в main world только с доступом к DOM сайта (НЕ Electron API), общение через `postMessage` + ipcRenderer.
