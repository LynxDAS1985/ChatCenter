# Прогресс AI Bridge v1.2.0 — этап за этапом

> Полная фиксация: **что сделали**, **почему**, **как должно работать**. Один пункт = одна доработка.
> Сессия 11 июня 2026. Связано с [phase-ai-bridge-plan.md](./phase-ai-bridge-plan.md).

---

## ✅ v1.1.7 — Fix переключения режимов AI (Этап 0 / pre-requisite)

### Что сделали
- Добавили функцию `setProviderProp(key, val)` в [`AISidebar.jsx`](src/components/AISidebar.jsx) — пишет напрямую в `aiProviderKeys[pid][key]`, не трогая остальные поля провайдера.
- 5 onClick хендлеров в [`AIConfigPanel.jsx`](src/components/AIConfigPanel.jsx) переключены с `set` на `setProviderProp` (mode×2 / webviewUrl×2 / contextMode).
- Добавили migration `useEffect` в `AISidebar.jsx` — для юзеров с уже сохранёнными старыми значениями: переносит `settings.mode/webviewUrl/contextMode` → `aiProviderKeys[pid].*` при первом монтировании (один раз через `migrationDoneRef`). Legacy в корне НЕ удаляются (для отката на 1-2 версии).
- Логирование миграции через `app:log` (не `console.*`).

### Почему
Юзер: «нажал смотри логи, почему не переключается на веб?» — клик на «Веб-интерфейс» в DeepSeek/ГигаЧат не сохранял режим, оставался API mode.

**Корень**: функция `set(key, val)` в `AISidebar.jsx`:
1. Кладёт `[key]: val` в корень `settings` (legacy глобальное поле).
2. Пересобирает `aiProviderKeys[pid]` ТОЛЬКО из 3 полей: `apiKey`, `clientSecret`, `model`.
3. Поля `mode`, `webviewUrl`, `contextMode` **теряются** при каждом вызове `set`.

При этом `getProviderCfg(settings)` в [`aiProviders.js`](src/utils/aiProviders.js) читает `mode` из `aiProviderKeys[pid].mode`. Старое значение в `settings.mode` (корень) игнорируется → разрыв.

### Как работает
- При клике «API-ключ» или «Веб-интерфейс» — `setProviderProp('mode', 'api'|'webview')` пишет ТОЛЬКО в `aiProviderKeys[pid].mode`, остальные поля провайдера остаются.
- При изменении `webviewUrl` или `contextMode` — то же самое.
- При первом запуске после обновления — `migrationDoneRef` срабатывает один раз, перекладывает legacy значения из корня в `aiProviderKeys[pid]`. Если они уже там — не перезаписывает.
- `aiApiKey` / `aiModel` / `aiClientSecret` продолжают идти через `set` (глобальные поля для совместимости со старым кодом).

### Тесты (+17)
- `src/components/AIConfigPanel.vitest.jsx` (8) — клики проверяют что setProviderProp вызван, не set.
- `src/__tests__/aiConfigMigration.vitest.js` (9) — pure helper migration: legacy → aiProviderKeys, идемпотентность, partial migration, null-safe, default provider, contextMode='none' (falsy).

---

## ✅ v1.1.8 — AI Bridge Этап 1: Контракты + папки + типы

### Что сделали
- Создали 3 новые папки: `src/utils/aiBridge/`, `main/ai/bridge/`, `main/preloads/hooks/ai/`.
- [`src/utils/aiBridge/contracts.js`](src/utils/aiBridge/contracts.js) — JSDoc типы для всего цикла AI Bridge:
  - `AiBridgeQuestion` (вход): version + text + source + history? + systemPrompt? + contextMode? + timeoutMs? + signal?
  - `AiBridgeAnswer` (выход): version + ok + text + providerId + mode + latencyMs + model? + error?
  - `AiBridgeError`: code + message + detail? + retryable?
  - `AiBridgeErrorCode` — закрытый перечень: `auth_required` / `input_not_found` / `submit_not_found` / `no_answer` / `streaming_timeout` / `rate_limited` / `network_error` / `server_error` / `aborted` / `config_invalid` / `unsupported_mode` / `unknown`
  - `AiWebviewProviderConfig` + `AiWebviewSelectors` (для webui)
  - `AiLocalBridgeConfig` (для Ollama)
  - `AiBridgeFallbackEntry` (для Этапа 9)
  - Константа `AI_BRIDGE_CONTRACT_VERSION = 1` — для обратной совместимости IPC.

- [`src/utils/aiWebviewConfigs.js`](src/utils/aiWebviewConfigs.js) — дефолтные конфиги webview:
  - `DEFAULT_WEBVIEW_PROVIDERS` — frozen массив 4 провайдеров: openai (`chat.openai.com` + `chatgpt.com`), deepseek (`chat.deepseek.com`), anthropic (`claude.ai`), gigachat (`giga.chat` + `developers.sber.ru`).
  - Каждый с дефолтными селекторами DOM (input / submitButton / lastAssistantMessage / streamingIndicator) — на основе раздела 2-5 в [phase-ai-bridge-providers.md](./phase-ai-bridge-providers.md), проверено 9 июня 2026.
  - Pure функции: `extractHost(urlOrHost)` (стрипит www, lowercase, поддержка полных URL и голых host), `detectAiProvider(urlOrHost)` (host → конфиг через hostPatterns с поддержкой поддоменов), `getProviderConfig(id)`, `getDefaultSelectors(id)`, `listProviderIds()`.

- [`main/ai/bridge/router.js`](main/ai/bridge/router.js) — каркас `createAiBridgeRouter(mode, deps)`:
  - Возвращает объект с `ask(question) → Promise<AiBridgeAnswer>`.
  - 3 ветки: `local` / `api` / `webui` — каждая вызывает соответствующий bridge из `deps` или возвращает `unsupported_mode`.
  - `throw → catch` → возвращает `AiBridgeAnswer{ok:false, code:'unknown'}` — никаких сырых ошибок наружу.
  - `latencyMs` всегда выставляется (для метрик).

- `main/preloads/hooks/ai/.gitkeep` — заглушка папки под Этапы 4-6.

### Почему
Каркас нужен ДО любой реальной логики bridges. Это даёт:
- Единый контракт что считается «вопросом» и «ответом» во всём проекте.
- Возможность параллельно разрабатывать 3 bridges без блокировки друг от друга — все следуют одному интерфейсу.
- Закрытый перечень `AiBridgeErrorCode` — UI и fallback chain могут единообразно реагировать на любые ошибки.
- `AI_BRIDGE_CONTRACT_VERSION` позволит изменить shape в v2 без поломки старых IPC сообщений.

### Как работает
- Renderer формирует `AiBridgeQuestion` (текст + source + контекст из контекстного режима).
- IPC передаёт в main: `{mode, question, config}`.
- Main создаёт нужный bridge через factory + передаёт в `createAiBridgeRouter(mode, {bridge})`.
- Router выбирает ветку по `mode`, вызывает `bridge.ask(question)`, возвращает `AiBridgeAnswer`.
- Если bridge не зарегистрирован для этого mode → `unsupported_mode`.

### Тесты (+30)
- `src/utils/aiWebviewConfigs.vitest.js` (22): extractHost для URL/host/мусора/case, detectAiProvider для 4 провайдеров + поддомены + неизвестные + null-safe, getProviderConfig / getDefaultSelectors / listProviderIds, immutability (frozen на массив + каждый провайдер + selectors).
- `main/ai/bridge/router.vitest.js` (8): unsupported_mode для всех 3 mode без deps, маршрутизация в правильный bridge (api не вызывает local), throw → catch → ok:false code:unknown, latencyMs >= 0.

---

## ✅ v1.1.9 — Разбиение топ-5 больших файлов

### Что сделали
Юзер сказал: «разбей с запасом». 4 из топ-5 файлов проекта были на пределе exception (запас 1-33 строки). Вынесли pure helpers в отдельные модули:

| Файл-хост | Было → Стало | Что вынесли |
|---|---|---|
| `nativeStore.js` | 1326 → 1227 (запас 113) | 12 функций + 6 констант + `DEFAULT_STATE` → [`nativeStoreHelpers.js`](src/native/store/nativeStoreHelpers.js) (193 стр.) |
| `InboxMode.jsx` | 1077 → 1042 (запас 68) | `handleAttachSend` (~36 стр.) → [`inboxAttachSend.js`](src/native/utils/inboxAttachSend.js) (53 стр.) + удалён дубль `topicMessageKey` |
| `App.jsx` | 928 → 899 (запас 41) | `NATIVE_CC_ID/TAB` + 2 Fallback компонента → [`appFallbacks.jsx`](src/appFallbacks.jsx) (43 стр.) |
| `tdlibBackend.js` | 920 → 892 (запас 38) | `SEARCH_FILTER_MAP` (12 ключей) + `mapSearchFilter` + `parseChatId` → [`tdlibBackendHelpers.js`](main/native/backends/tdlibBackendHelpers.js) (54 стр.) |
| `nativeStoreIpc.js` | 730 → 714 (запас 16) | `saveChatCache` + `loadChatCache` (localStorage кэш) → [`nativeStoreCache.js`](src/native/store/nativeStoreCache.js) (32 стр.) + re-export для обратной совместимости |

### Почему
Перед началом большой работы над AI Bridge нужен запас в каждом из этих файлов — иначе любая новая фича блокировалась бы тестом `fileSizeLimits.test.cjs` (он реально блокирует pre-commit).

**Принцип разбиения**: только pure helpers (функции без скрытого state, не зависят от React hooks или Electron API) — их легко тестировать в jsdom без mount компонента, легко переиспользовать, и риск сломать поведение минимальный.

### Как работает
- Хост-файл импортирует вынесенные функции из соседнего модуля.
- Внешний API хост-файла не изменился — все внешние импорты продолжают работать.
- В `nativeStoreIpc.js` использовали `import + export` (а не только `export from`), потому что внутри `nativeStoreIpc.js` есть вызов `saveChatCache(chatId, next)` — re-export не делает identifier доступным локально. Это поймали тестом, починили.

### Тесты (+63)
- `nativeStoreHelpers.vitest.js` (40): константы / DEFAULT_STATE shape / 11 функций (topicMessageKey, topicIdentity, countIncoming, buildUnreadWindowMeta, unreadWindowRequestParams, nativeAccountLabel, nativeAccountDetails, updateNativeHealthForAccounts, accountIdsForRequest, healthErrorText, accountStatById).
- `nativeStoreCache.vitest.js` (10): save → load round-trip / 50 limit / quota fallback (silent) / битый JSON → null / не-массив → null / два чата изолированы.
- `tdlibBackendHelpers.vitest.js` (13): SEARCH_FILTER_MAP (все ключи) / mapSearchFilter (null/empty/unknown/photo/unread-mention) / parseChatId (правильный формат, отрицательный rawId для каналов, null-safe).

---

## ✅ v1.1.10 — AI Bridge Этап 2: Local Bridge (Ollama HTTP)

### Что сделали
- [`main/ai/bridge/localBridge.js`](main/ai/bridge/localBridge.js) (172 стр.) — `createLocalBridge(config, deps)`:
  - POST `${baseUrl}/api/chat` с `{ model, messages, stream:false }` (OpenAI-compatible Ollama API).
  - Конфиг: `baseUrl` (default `http://127.0.0.1:11434`) + `model` (default `llama3.1`) + `timeoutMs` (60с).
  - Сборка `messages`: если `systemPrompt` — первый `{role:'system'}`, потом `history` (turn-ы с валидацией), последний `{role:'user', content: question.text}`.
  - `AbortController` с собственным таймером + проброс внешнего `question.signal` через `addEventListener('abort')`.
  - Парсинг ответа: `data.message.content` (новый /api/chat) или `data.response` (старый /api/generate — для совместимости).
  - DI через `deps.fetch` — для тестирования без сетевых вызовов.
  - Коды ошибок:
    - `config_invalid` — 404 (model not found / wrong path) или fetch недоступен.
    - `server_error` (retryable) — 5xx.
    - `streaming_timeout` (retryable) — собственный таймер сработал.
    - `aborted` — внешний `signal.abort()`.
    - `network_error` (retryable) — ECONNREFUSED / ENOTFOUND / fetch failed (regex match).
    - `no_answer` — Ollama вернула пустой content.
    - `unknown` — всё остальное.

- [`main/handlers/aiBridgeIpcHandlers.js`](main/handlers/aiBridgeIpcHandlers.js) (90 стр.) — IPC канал `ai-bridge:send`:
  - `registerAiBridgeIpcHandlers(ipcMain, deps)` → unsubscribe.
  - `handleSend(payload, deps)` экспорт для тестов без mock ipcMain.
  - `mode='local'` → `createLocalBridge(config, {fetch})` через factory из `deps.factoryLocal` (для DI).
  - `mode='api'/'webui'` → router без bridge → `unsupported_mode` (Этапы 3-6 подключат).
  - Любые throws ловятся router'ом → возврат всегда AiBridgeAnswer.
  - `AI_BRIDGE_IPC_CHANNELS = Object.freeze({ SEND: 'ai-bridge:send' })`.

- [`src/utils/aiBridge/index.js`](src/utils/aiBridge/index.js) (75 стр.) — renderer-side wrapper:
  - `sendQuestion({mode, question, config})` → `Promise<AiBridgeAnswer>`.
  - Валидация payload (mode + question обязательны).
  - Проверка `window.api.invoke` доступности.
  - Любые throws ловятся → `AiBridgeAnswer{ok:false, code:'unknown'}`.

- [`main/main.js`](main/main.js): подключено `registerAiBridgeIpcHandlers(ipcMain)` рядом с `initAiToolIpcHandlers`.

### Почему
Local Bridge — самый простой bridge:
1. Нет UI зависимостей (preload / webview не нужен).
2. Простой HTTP протокол Ollama — хорошо документирован, OpenAI-compatible.
3. Полностью без API ключей и без интернета — работает оффлайн.
4. Проверяет всю цепочку IPC → router → bridge → answer. Если Local работает — каркас правильный, Этапы 3-6 пойдут проще.

Юзеру даёт **третий способ AI** помимо платных API и веб-сайтов: бесплатный локальный LLM на своей машине.

### Как работает
1. Юзер ставит Ollama: https://ollama.com → `ollama serve` → `ollama pull llama3.1`.
2. Renderer вызывает `sendQuestion({mode:'local', question:{...}, config:{baseUrl, model}})`.
3. IPC передаёт в main → `handleSend` создаёт `createLocalBridge(config)` → `router.ask(question)` → `localBridge.ask(question)`.
4. localBridge формирует HTTP POST к Ollama: `{model, messages:[system?, ...history?, {role:user, content:text}], stream:false}`.
5. Ollama возвращает `{message:{content:'...'}}` → bridge извлекает content → возвращает `AiBridgeAnswer{ok:true, text, providerId:'local', mode:'local', latencyMs, model}`.
6. Если Ollama не запущена — `ECONNREFUSED` → `error:{code:'network_error', message:'Ollama не запущена...'}`.
7. Если модель не найдена — 404 → `config_invalid`.
8. Если crash — 500 → `server_error` (retryable, fallback chain попробует другой bridge).

### Тесты (+37)
- `localBridge.vitest.js` (17): URL construction (default/custom/trailing slash), body структура (model/messages/stream:false), systemPrompt первым, history между, history с невалидными turn-ами игнорируется, HTTP 404 → config_invalid, HTTP 500 → server_error+retryable, no_answer (пустой ответ), ECONNREFUSED → network_error+retryable, fetch undefined → config_invalid, собственный timeout → streaming_timeout, внешний AbortSignal → aborted, старый /api/generate (response field) тоже парсится.
- `aiBridgeIpcHandlers.vitest.js` (12): handleSend без mode/question → config_invalid, mode=local → factoryLocal вызван с правильными args, mode=api/webui → unsupported_mode, пустой config → factory вызвана с {}, register создаёт handler на правильном канале, throws если ipcMain.handle отсутствует, unsubscribe вызывает removeHandler, handler пробрасывает payload в handleSend, AI_BRIDGE_IPC_CHANNELS frozen.
- `aiBridge/index.vitest.js` (8): без mode/question → config_invalid, window.api.invoke недоступен → config_invalid, window отсутствует → config_invalid, invoke вызывается с правильным каналом и payload, возврат invoke, invoke throws → catched → ok:false code:unknown.

### Один баг найден и исправлен
В `registerAiBridgeIpcHandlers` искали `deps.createLocalBridge` вместо `deps.factoryLocal` — handler не получал mock в тесте. Поправили на правильный ключ.

### Юзер видит и проверяет (с v1.1.14)
Постоянная видимая интеграция (AIBridgePanel в боковой панели) — это Этап 7.
Для проверки сейчас открыть «📒 Логи ChatCenter» → кнопка «🧪 Тест AI Bridge»: окно
с выбором режима, провайдера, ввода вопроса и кнопкой «📤 Спросить». Все логи
идут в основной лог-вьюер.

---

## 📊 Итоги сессии (v1.1.7 → v1.1.10)

| Метрика | Было | Стало |
|---|---|---|
| Версия | v1.1.6 | v1.1.10 |
| Unit-тесты | 1490 | 1620 (+130 net, +147 brutto) |
| Файлов под size guard | 410 | 430 |
| Топ-5 запас от ceiling | 1-33 строки | 16-113 строк |
| Lint warnings | 0 | 0 |
| AI Bridge этапов | 0/11 | 2/11 (Этапы 1+2) |

**Релизы pushed**: d67a2df (v1.1.7) → 6d86a3a (v1.1.8) → e2b899b (v1.1.9) → b9c94db (v1.1.10).

---

## 🔜 Следующие этапы (фиксация плана)

Будут продолжены в порядке плана:

- **Этап 3**: API Bridge — обёртка над существующим `aiProviderCaller` (Anthropic/OpenAI/DeepSeek/GigaChat) под единый интерфейс `AiBridge`. ~2.5 ч.
- **Этап 4**: Preload skeleton + IPC bridge для webview hooks (без хуков — каркас communication). ~3 ч.
- **Этап 5**: OpenAI hook (MVP) — реальная инъекция в chat.openai.com. ~5 ч.
- **Этап 6**: 3 остальных hook (DeepSeek / Claude / ГигаЧат). ~4 ч.
- **Этап 7**: UI AIBridgePanel в AISidebar — кнопка «Спросить AI» + выбор bridge + отображение ответа. ~4 ч.
- **Этап 8**: Selectors Config UI — настройка кастомных селекторов на случай если сайты меняются. ~3 ч.
- **Этап 9**: Fallback chain — если основной bridge упал, автоматически пробует резерв. ~2 ч.
- **Этап 10**: Документация — обновление CLAUDE.md / .memory-bank / changelog. ~2 ч.
- **Этап 11**: Release v1.2.0 — финальный bump + проверка end-to-end. ~0.5 ч.

Каждый этап будет задокументирован в `progress-v1.2.0-final.md` (новый файл, обновляется after каждого commit).
