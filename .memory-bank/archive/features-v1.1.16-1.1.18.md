# Архив v1.1.16 – v1.1.18 (AI Bridge Этапы 7-9)

Заархивировано 11 июня 2026 при выпуске v1.2.0. Единая документация AI Bridge — в [`.memory-bank/ai-bridge.md`](../ai-bridge.md).


### v1.1.18 — AI Bridge Этап 9: fallback chain (авто-переключение на резерв)

**Зачем**: если основной AI временно недоступен (OpenAI лежит, у вас закончились DeepSeek кредиты, Anthropic 429 throttle) — программа автоматически пробует следующий AI из цепочки. Юзер получает ответ от первого работающего вместо ошибки.

**Что готово**:

- [`main/ai/bridge/fallbackChain.js`](main/ai/bridge/fallbackChain.js) (~140 стр.) — `createFallbackChain(steps, factories)`:
  - `steps`: массив `{mode: 'api'|'local'|'webui', config: {providerId, baseUrl, ...}}`.
  - `factories`: `{createApiBridge, createLocalBridge, createWebUiBridge, callProvider, fetch}` — DI.
  - `ask(question)` пробует steps по очереди:
    1. Если `signal.aborted` — стоп с `code:'aborted'`.
    2. Строит bridge для текущего step (`buildBridgeForStep`).
    3. Вызывает `bridge.ask(question)`.
    4. Если `ok=true` → возврат + `debug.attemptedFallbacks` + `successfulStepIndex` (если что-то было попробовано).
    5. Если ошибка — анализ кода:
       - `aborted` / `unsupported_mode` → стоп.
       - `auth_required` БЕЗ «missing key» в message → стоп (нужен фикс юзером).
       - `auth_required` С «missing key» → пробуем следующий (может ключ есть для другого провайдера).
       - Любая другая ошибка + `retryable=true` → пробуем следующий.
       - `retryable=false` (не одна из выше) → стоп.
    6. Если все steps закончились → возврат последнего answer + `debug.exhausted=true`.
  - throw из `bridge.ask` → ловится → `{ok:false, code:'unknown', retryable:true}` → пробуется следующий.

- [`main/handlers/aiBridgeIpcHandlers.js`](main/handlers/aiBridgeIpcHandlers.js) — `handleSend` расширен:
  - Если `payload.chain` есть и не пустой → используется fallback chain вместо single bridge.
  - Иначе работает как раньше (single mode).
  - Все факторы из `deps` пробрасываются в fallback factories.

### Какие ошибки fallback пробует дальше

| `error.code` | retryable | Следующий шаг? |
|---|---|---|
| `network_error` | ✅ | ✅ да |
| `server_error` (5xx) | ✅ | ✅ да |
| `rate_limited` (429) | ✅ | ✅ да |
| `streaming_timeout` | ✅ | ✅ да |
| `auth_required` (missing key) | ❌ | ✅ да (у другого провайдера может быть ключ) |
| `auth_required` (неверный ключ) | ❌ | ❌ стоп (юзер должен сам поправить) |
| `config_invalid` | ❌ | ❌ стоп |
| `aborted` | ❌ | ❌ стоп (юзер сам отменил) |
| `unsupported_mode` | ❌ | ❌ стоп (системная проблема) |
| `no_answer` | ❌ | ❌ стоп (AI ответил пусто, повтор не поможет) |

### Пример использования из renderer

```js
const r = await window.api.invoke('ai-bridge:send', {
  chain: [
    { mode: 'api',   config: { providerId: 'anthropic' } },
    { mode: 'api',   config: { providerId: 'openai' } },
    { mode: 'local', config: { baseUrl: 'http://127.0.0.1:11434' } },
  ],
  question: { version: 1, text: 'Привет!', source: { messengerId: 'native_cc' } },
})

// r.ok === true → r.text = ответ от первого успешного
// r.debug.attemptedFallbacks = [{mode, providerId, errorCode}, ...]
// r.debug.successfulStepIndex = индекс успешного step
// Если все упали: r.debug.exhausted = true
```

### Тесты (+17)
- `fallbackChain.vitest.js` (14): валидация (пустой steps / без factories) / first ok / retryable + ok / все retryable упали → exhausted / auth_required без missing → стоп / missing key → следующий / aborted → стоп / unsupported_mode → стоп / api → local смешанные / api → webui смешанные / step без providerId → unsupported и далее / signal.aborted сразу → нет вызовов / throw в ask → ловится + следующий.
- `aiBridgeIpcHandlers.vitest.js` (+3): payload.chain используется вместо single / chain без question → config_invalid / пустой chain → обычный mode.

### Регрессия
lint 0, vitest 1736 → 1753 ✅ (+17), fileSizeLimits 442 → 444 ✅, check-memory ✅.

### UI пока без галочки «использовать резерв»
Подключение из UI добавится в следующей версии (для AiBridgeCheck — галочка «авто-резерв» + автоматический подбор chain из доступных провайдеров). Сейчас chain доступен только программно через IPC (например для AI Agent v1.1.3 fallback который уже работает).

### Безопасность
- Каждый bridge в chain создаётся отдельно — изоляция между провайдерами.
- API ключи для каждого читаются из своих настроек.
- Errors не утекают в успешный ответ — debug.attemptedFallbacks даёт информацию что было попробовано.

### Rollback
`git revert <commit>` — fallbackChain.js новый файл, payload.chain опциональная ветка в handleSend (если её нет — всё работает как раньше).

---

### v1.1.17 — AI Bridge Этап 8: настройка CSS селекторов AI сайтов вручную

**Зачем**: AI сайты (ChatGPT/DeepSeek/Claude/ГигаЧат) обновляют DOM ~раз в 3-4 месяца. Когда это происходит — встроенные селекторы перестают работать (нельзя найти «поле ввода» или «кнопку отправки»). Раньше пришлось бы ждать обновления программы. Теперь юзер сам может задать актуальные селекторы и продолжать пользоваться.

**Что готово**:

- [`src/components/AiSelectorsEditor.jsx`](src/components/AiSelectorsEditor.jsx) (~190 стр.) — модалка редактора:
  - Выбор провайдера: ChatGPT / DeepSeek / Claude / ГигаЧат.
  - Показывается дефолтный URL провайдера (для справки).
  - 4 поля селекторов (моноширинный шрифт):
    - Поле ввода (input/textarea) — например `#prompt-textarea` для ChatGPT.
    - Кнопка отправки — например `[data-testid="send-button"]`.
    - Контейнер ответа AI — например `[data-message-author-role="assistant"] .markdown`.
    - Индикатор «AI печатает» — элемент существует во время генерации (`.result-streaming`).
  - Каждое поле имеет placeholder = встроенный селектор + подсказку «по умолчанию: ...».
  - Кнопки:
    - **💾 Сохранить** — записывает в `settings.aiBridgeSelectors[providerId]`. Пустые поля = удаляются (использовать default). Если все 4 пустые → провайдер удаляется из настроек.
    - **📋 Заполнить из встроенных** — копирует defaults в инпуты (можно подредактировать).
    - **♻️ Сбросить** — очищает все поля.
  - Логи через `app:log` с префиксом `[ai-selectors-editor]`.

- [`src/components/AiBridgeCheck.jsx`](src/components/AiBridgeCheck.jsx) — расширено:
  - Принимает props `settings` + `onSettingsChange` (опц).
  - При `mode='webui'` показывает кнопку «🔧 Настроить селекторы AI сайтов» (с пометкой «✓ есть кастомные» если уже настроены).
  - При вызове `sendQuestion` для webui mode добавляет `config.selectors = settings.aiBridgeSelectors[providerId]` (если есть).

- [`src/components/AISidebar.jsx`](src/components/AISidebar.jsx) — пробрасывает `settings`/`onSettingsChange` в `AiBridgeCheck` (раньше открывался без них).

### Как работает

1. Юзер открывает 🤖 «Проверка AI» в боковой панели AI.
2. Выбирает режим «Веб-интерфейс» + провайдер ChatGPT.
3. Нажимает «🔧 Настроить селекторы AI сайтов» → открывается редактор.
4. Юзер берёт DevTools браузера (у себя на стороне — не в нашей программе!), смотрит актуальные CSS селекторы chat.openai.com и вставляет в поля.
5. «💾 Сохранить» → запись в `settings.aiBridgeSelectors.openai = {input: '...', ...}`.
6. Возвращается в форму проверки → нажимает «📤 Спросить» → webUiBridge получает `config.selectors` → передаёт в payload `inject` → hook применяет: `SELECTORS = {...defaults, ...payload.selectors}`.
7. Программа использует свежие селекторы → вопрос успешно вставляется → ответ возвращается.

### Структура хранилища

```
settings.aiBridgeSelectors:
  {
    openai:    { input: '#new-id', submitButton: '.new-send-btn' },    // частично — остальное defaults
    deepseek:  { input: 'textarea.custom' },                            // только один поправлен
    // anthropic — нет (используются все defaults)
    // gigachat  — нет
  }
```

### Тесты (+11)
`AiSelectorsEditor.vitest.jsx`:
- UI: заголовок + select + 4 поля + кнопка ✕.
- initialProviderId — селект показывает указанного / fallback на первого при unknown.
- Существующие кастомные значения загружаются в инпуты.
- Сохранение: с заполненными → onSettingsChange с aiBridgeSelectors / с пустыми → провайдер удалён из settings / пробелы trim-аются.
- Сброс → все инпуты пустые.
- Заполнить из встроенных → инпуты получают defaults.
- Логи через `app:log` (НЕ console.*).

### Регрессия
lint 0, vitest 1725 → 1736 ✅ (+11), fileSizeLimits 439 → 442 ✅, check-memory ✅.

### Безопасность
- Селекторы — это просто CSS строки, хранятся локально в settings.json.
- Никаких eval/innerHTML/script injection — селекторы передаются как **строки** в `document.querySelector(selectorString)` внутри hook (та же безопасность что у дефолтных).
- Юзер не может через эти селекторы получить доступ к данным других сайтов или Electron API.

### Rollback
`git revert <commit>` — `AiSelectorsEditor.jsx` новый файл, кнопка в `AiBridgeCheck` опциональная (`mode='webui' && onSettingsChange`). Удаление не ломает существующее.

---

### v1.1.16 — AI Bridge Этап 7: webview AI подключился к WebUI Bridge

**Что готово**: когда юзер открывает AI сайт в боковой панели в режиме «Веб-интерфейс» — webview автоматически подключается к WebUI Bridge. После этого 🤖 «Проверка AI» в режиме «Веб-интерфейс» реально отправит вопрос в открытый сайт и заберёт ответ.

**Файлы**:

- [`src/native/hooks/useAiWebviewBridge.js`](src/native/hooks/useAiWebviewBridge.js) (~90 строк) — React hook:
  - Активен только при `providerMode === 'webview'` + URL распознан через `detectAiProvider(url)`.
  - Получает путь к `ai-monitor.preload` через `await window.api.invoke('app:get-paths')`.
  - Устанавливает `webview.setAttribute('preload', 'file:///' + path)` — Electron webview принимает preload как URL.
  - Слушает `did-attach` event → `webview.getWebContentsId()` → IPC `ai-bridge:webui:register-webview {providerId, webContentsId}`.
  - При unmount или смене провайдера → IPC `ai-bridge:webui:unregister-webview {providerId}`.
  - Все логи через `app:log` (префикс `[ai-webview-bridge]`).

- [`main/handlers/aiBridgeIpcHandlers.js`](main/handlers/aiBridgeIpcHandlers.js) — расширено:
  - Новые каналы: `ai-bridge:webui:register-webview` + `ai-bridge:webui:unregister-webview` (invoke).
  - `handleRegisterWebview(payload, deps)` — резолвит `webContents.fromId(webContentsId)` через DI (для тестов) или динамический `import('electron')`. Сохраняет unregister функцию в `Map<providerId, unreg>`. Повторный register отписывает старый.
  - `handleUnregisterWebview(payload, deps)` — вызывает сохранённый unreg + чистит map.
  - При unsubscribe register handler — отписываются ВСЕ webview (защита от утечки).

- [`src/components/AISidebar.jsx`](src/components/AISidebar.jsx) — подключён hook:
  ```jsx
  useAiWebviewBridge(aiWebviewRef, webviewUrl, providerMode)
  ```

### Как работает (полная цепочка с Этапа 7)

1. Юзер настраивает в AI Sidebar: провайдер ChatGPT, режим «Веб-интерфейс», URL `https://chat.openai.com/`.
2. AISidebar рендерит `<webview src={chat.openai.com}>`.
3. Hook `useAiWebviewBridge` срабатывает:
   - `detectAiProvider('https://chat.openai.com/')` → `{id: 'openai', ...}`.
   - `invoke('app:get-paths')` → `{aiMonitorPreload: '...'}`.
   - `webview.setAttribute('preload', 'file:///...ai-monitor.preload.cjs')`.
4. Webview грузится → preload запускается → загружает `openai.hook.js` (Этап 5) → инжектирует через `<script>` → hook регистрирует `setInjectHandler`.
5. Webview `did-attach` event → hook берёт `webContentsId` → IPC `register-webview` → main `webContents.fromId` → `registerWebview('openai', wc)` в WebUI Bridge.
6. Юзер нажимает 🤖 «Проверка AI» → выбирает «Веб-интерфейс» + ChatGPT → вводит вопрос → «📤 Спросить».
7. Renderer `sendQuestion({mode:'webui', config:{providerId:'openai'}, question})` → IPC `ai-bridge:send`.
8. main `handleSend` → `createWebUiBridge({providerId:'openai'})` → router → `bridge.ask(question)`.
9. Bridge берёт зарегистрированный webContents → `wc.send('ai-bridge:webui:inject', {questionId, text})`.
10. Preload в webview получает → `<script>window.__ccAiBridge._enqueueInject(...)</script>`.
11. `openai.hook.handleInject` → finds input → setInputValue → click submit → waitForAnswer (polling streaming indicator).
12. ChatGPT отвечает → hook `window.__ccAiBridge.answer(questionId, text)` → postMessage → preload → IPC `answer-received` → `deliverAnswer` → resolve Promise → AiBridgeAnswer.
13. UI показывает ответ в зелёной карточке.

### Тесты (+17)
- `useAiWebviewBridge.vitest.jsx` (9): providerMode !== webview / пустой URL / null ref / неизвестный сайт → лог + не подключать / chat.openai.com → setAttribute preload + did-attach listener / did-attach → IPC register с правильными args / unmount → removeEventListener + IPC unregister / app:get-paths без aiMonitorPreload → не падает / логи через app:log (НЕ console.\*).
- `aiBridgeIpcHandlers.vitest.js` (+8): handleRegisterWebview без providerId/webContentsId → error / webContents.fromId возвращает null → error / успешный → ok + map / повторный register отписывает старый / handleUnregisterWebview без providerId → error / известный → ok + map очищена / неизвестный → ok без throw.

### Регрессия
lint 0, vitest 1708 → 1725 ✅ (+17), fileSizeLimits 437 → 439 ✅, check-memory ✅.

### Что юзер увидит
1. Откройте боковую панель AI.
2. Выберите провайдера (ChatGPT/DeepSeek/Claude/ГигаЧат), переключите режим на «Веб-интерфейс».
3. Залогиньтесь на сайте AI (одноразово, в этой webview сессии).
4. Нажмите 🤖 «Проверка AI» в шапке → режим «Веб-интерфейс» → введите вопрос → «📤 Спросить».
5. Программа автоматически вставит вопрос в сайт, дождётся ответа, покажет его в зелёной карточке.

### Безопасность
- Preload по-прежнему в изолированном sandbox.
- Hook в main world только с доступом к DOM сайта (не к Electron API).
- API ключи AI **не** нужны — юзер залогинен сам в webview сессии.
- Регистрация webview только для 4 распознанных AI сайтов — кастомные URL не подключаются.

### Известные риски
- Если AI сайт обновит DOM — селекторы по умолчанию могут сломаться. Этап 8 (UI Custom Selectors) даст возможность настроить руками.
- Webview перезагружается при смене URL — preload перезагрузится, hook повторно зарегистрирует webContents.
- Если юзер выберет НЕ-AI сайт в URL — hook не подключится (нет провайдера), но обычный webview работает.

### Rollback
`git revert <commit>` — hook опциональный, существующий webview без preload работает как раньше (без AI Bridge).

---

