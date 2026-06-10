# ГигаЧат tool use (v1.1.4) — детальная реализация

> Цель: 4-й полноправный AI провайдер. До v1.1.4 ГигаЧат работал только для обычного чата (юзер пишет → AI текст). После v1.1.4 — для AI-агента с tool use (чтение истории, поиск, отправка ответа автоматически).

---

## 1. Что это и зачем

### 1.1 ГигаЧат — российский AI Сбера
- 🇷🇺 Работает в России **без VPN** (Anthropic / OpenAI часто блокируются провайдерами)
- 💳 Оплата **в рублях** через российские карты
- 🔒 Данные на **серверах в РФ** (важно для бизнеса с РФ-клиентами, 152-ФЗ)
- 📄 Документация: https://developers.sber.ru/docs/ru/gigachat/api/function-calling

### 1.2 Что было до v1.1.4

Странная ситуация — почти всё было готово:

✅ **Работало**:
- `main/utils/gigachat.js` — OAuth (`getGigaChatToken`) + SSL bypass (`httpsPostSkipSsl`)
- `main/handlers/aiHandlers.js` — обычный чат `ai:generate` + стриминг
- `src/components/AIConfigPanel.jsx` — UI с полями Client ID + Client Secret
- `main/ai/adapters/gigachatAdapter.js` — конвертация tools↔functions
- `main/ai/aiToolExecutor.js` — ветка `if (provider === 'gigachat')` для tool_result форматирования

❌ **НЕ работало**:
- `main/ai/aiProviderCaller.js` (новый каркас для tool use из Phase 1, v0.97.0) — бросал
  ```
  throw new Error(`callProvider: unsupported provider "gigachat". 
    ГигаЧат пока не поддерживается в tool use (требует OAuth + SSL bypass).`)
  ```

То есть **OAuth + SSL уже были**, нужно было только подключить их к новому tool-use коду. Это и сделано в v1.1.4 — ~45 минут работы.

---

## 2. Архитектура — общая картина

```
┌─────────────────────────────────────────────────────────────────────┐
│ aiToolExecutor.runAgentLoop({provider: 'gigachat'})                  │
│                                                                      │
│  adapter = getAdapter('gigachat')                                    │
│    .toTools = toGigaChatFunctions       ← существующий               │
│    .parseToolCalls = parseGigaChatFunctionCall  ← существующий       │
│    .formatToolResult = null  → используется gigachat.formatFunctionResult│
│    .shouldContinue = finish_reason === 'function_call'              │
│                                                                      │
│  schemas → toGigaChatFunctions → tools (formatted as `functions`)    │
│                                                                      │
│  callProvider({provider: 'gigachat', messages, tools, model})        │
│           ↓                                                          │
├─────────────────────────────────────────────────────────────────────┤
│ aiProviderCaller.callProvider                                        │
│  if (provider === 'gigachat') → callGigaChat()  ⭐ NEW в v1.1.4      │
├─────────────────────────────────────────────────────────────────────┤
│ callGigaChat({storage, messages, tools, model})                      │
│                                                                      │
│  creds = getProviderCreds(storage, 'gigachat')                       │
│    → {apiKey: clientId, clientSecret}                                │
│                                                                      │
│  token = await getGigaChatToken(clientId, clientSecret)              │
│    ↑ existing function in main/utils/gigachat.js                     │
│    ↑ OAuth POST → /api/v2/oauth                                      │
│    ↑ Token cache 30 min в памяти                                     │
│                                                                      │
│  body = {                                                            │
│    model: model || 'GigaChat',                                       │
│    messages: systemPrompt ? [{system}, ...rest] : messages,          │
│    functions: tools,         ⚠️ старый OpenAI формат                 │
│    function_call: 'auto',    ⚠️ не tools/tool_calls                  │
│  }                                                                   │
│                                                                      │
│  result = await httpsPostSkipSsl(GIGACHAT_CHAT_URL, body, headers)   │
│    ↑ existing function — Node https.Agent({rejectUnauthorized:false})│
│    ↑ SSL bypass для сертификата Минцифры                             │
│                                                                      │
│  return result.data  → передаётся обратно в executor                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Executor получает response.choices[0].message.function_call          │
│  → parseGigaChatFunctionCall → [{id, name, input}]                   │
│  → handler выполняется                                               │
│  → result → formatFunctionResult → role:'function' message           │
│  → loop continues                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Ключевые различия ГигаЧат vs Anthropic/OpenAI

### 3.1 OAuth вместо API key

| | Anthropic / OpenAI | ГигаЧат |
|---|---|---|
| Заголовок | `x-api-key: sk-ant-...` / `Authorization: Bearer sk-...` | `Authorization: Bearer <access_token>` |
| Источник | Один key, вечный | OAuth — `clientId + clientSecret` → временный `access_token` (30 мин TTL) |

**Реализация** в `getGigaChatToken`:
```js
const aiTokenCache = {}  // module-scope in-memory

export async function getGigaChatToken(clientId, clientSecret) {
  const cacheKey = `${clientId}:${clientSecret}`
  const cached = aiTokenCache[cacheKey]
  if (cached && cached.expires_at > Date.now() + 60000) return cached.access_token
  
  // Получаем новый
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const result = await httpsPostSkipSsl(
    'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    'scope=GIGACHAT_API_PERS',
    {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'RqUID': crypto.randomUUID(),
    }
  )
  if (!result.ok || !result.data.access_token) {
    throw new Error(`GigaChat auth failed: ${result.data?.message || 'нет токена'}`)
  }
  aiTokenCache[cacheKey] = result.data
  return result.data.access_token
}
```

**Кэширование**: токен живёт 30 минут (1800 сек). `expires_at` записывается с сервера. Проверка `> Date.now() + 60000` — обновляем за 60 сек до истечения чтобы избежать race.

### 3.2 SSL bypass

**Проблема**: ГигаЧат API использует сертификат от **корневого CA Минцифры**. Node.js не доверяет ему по умолчанию → каждый запрос падает `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

**Решение**: `https.Agent({ rejectUnauthorized: false })` **только** для конкретных POST запросов:

```js
export function httpsPostSkipSsl(url, bodyStr, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const agent = new https.Agent({ rejectUnauthorized: false })
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) },
      agent,  // ← agent с отключённой проверкой
    }, res => { /* собираем data */ })
    req.write(bodyStr)
    req.end()
  })
}
```

**Безопасность**: agent используется **только** для запросов к `ngw.devices.sberbank.ru` и `gigachat.devices.sberbank.ru`. Все остальные fetch'и идут через стандартный Node fetch с полной проверкой SSL.

### 3.3 Формат tool use — старый OpenAI 2023

| | Anthropic | OpenAI / DeepSeek | ГигаЧат |
|---|---|---|---|
| Поле в request | `tools: [{name, description, input_schema}]` | `tools: [{type:'function', function:{...}}]` | `functions: [{name, description, parameters}]` |
| Параллельные вызовы | ✅ | ✅ | ❌ Один за раз |
| Ответ | `content_block.type === 'tool_use'` | `tool_calls[]` | `function_call` (один!) |
| Поле выбора | `tool_choice` | `tool_choice` | `function_call: 'auto'` |
| tool_result | `tool_result` block | `tool` role message | `function` role message |

**Конвертация** делает `gigachatAdapter.toGigaChatFunctions(schemas)`:
```js
export function toGigaChatFunctions(schemas) {
  return schemas.map(s => ({
    name: s.id,
    description: s.description || '',
    parameters: s.inputSchema,
  }))
}
```

**Парсинг** ответа делает `parseGigaChatFunctionCall(response)`:
```js
const message = response?.choices?.[0]?.message
const fc = message.function_call
if (!fc || !fc.name) return []
// ГигаЧат не возвращает id → генерируем свой
const id = `gc-${Date.now()}-${Math.random()...}`
return [{ id, name: fc.name, input: JSON.parse(fc.arguments) }]
```

**Важно**: возвращается массив с **одним** элементом (а не несколько как у других провайдеров).

---

## 4. Что было сделано в v1.1.4

### 4.1 `main/ai/aiProviderCaller.js` — новая функция `callGigaChat`

```js
import { httpsPostSkipSsl, getGigaChatToken, GIGACHAT_CHAT_URL } from '../utils/gigachat.js'

// В createCallProvider:
if (provider === 'gigachat') {
  return await callGigaChat({ storage, messages, tools, model: model || 'GigaChat' })
}

async function callGigaChat({ storage, messages, tools, model }) {
  const creds = getProviderCreds(storage, 'gigachat')
  if (!creds?.apiKey || !creds?.clientSecret) {
    throw new Error('callProvider: gigachat needs both clientId (apiKey) and clientSecret')
  }
  
  // OAuth с кэшем
  let token
  try {
    token = await getGigaChatToken(creds.apiKey.trim(), creds.clientSecret.trim())
  } catch (e) {
    throw new Error(`gigachat OAuth failed: ${e?.message || e}`)
  }
  
  // System prompt
  let systemPrompt = ''
  let userMessages = messages
  if (messages?.[0]?.role === 'system') {
    systemPrompt = messages[0].content
    userMessages = messages.slice(1)
  }
  
  const body = {
    model: model || 'GigaChat',
    messages: systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...userMessages]
      : userMessages,
  }
  if (Array.isArray(tools) && tools.length > 0) {
    body.functions = tools
    body.function_call = 'auto'
  }
  
  let result
  try {
    result = await httpsPostSkipSsl(
      GIGACHAT_CHAT_URL,
      JSON.stringify(body),
      {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    )
  } catch (e) {
    throw new Error(`gigachat: network error — ${e?.message || e}`)
  }
  
  if (!result?.ok) {
    const errMsg = result?.data?.error?.message || result?.data?.message || 'HTTP error'
    const code = result?.data?.error?.code || result?.data?.code
    throw new Error(`gigachat HTTP ${code || '???'}: ${String(errMsg).slice(0, 200)}`)
  }
  return result.data
}
```

**Ключевые моменты**:
- `creds.apiKey` — это **clientId**, `creds.clientSecret` — отдельно (UI уже знает это, поля называются именно так).
- `.trim()` от случайных пробелов из copy-paste.
- Try/catch на каждом этапе → понятные ошибки `gigachat OAuth failed`, `gigachat HTTP N`, `gigachat: network error`.
- Возвращаем `result.data` (уже распаршенный JSON) — executor сам извлечёт через parseGigaChatFunctionCall.

### 4.2 `main/main.js` — gigachat в FALLBACK_ORDER

```js
// БЫЛО (v1.1.3):
const FALLBACK_ORDER = ['anthropic', 'openai', 'deepseek']  // не включаем gigachat

// СТАЛО (v1.1.4):
const FALLBACK_ORDER = ['anthropic', 'openai', 'deepseek', 'gigachat']
const chain = [{ provider: activeProvider, model: settings.aiModel }]
for (const p of FALLBACK_ORDER) {
  if (p === activeProvider) continue
  const cfg = providerKeys[p] || {}
  // gigachat требует apiKey (clientId) И clientSecret.
  const hasCreds = p === 'gigachat'
    ? (cfg.apiKey && cfg.clientSecret)
    : !!cfg.apiKey
  if (hasCreds) chain.push({ provider: p })
}
```

Теперь если юзер настроил ГигаЧат + Anthropic как fallback — при падении Anthropic пробуется ГигаЧат.

### 4.3 Тесты — `main/ai/aiProviderCaller.vitest.js`

**`vi.hoisted` для mock `../utils/gigachat.js`**: подмена импортов до загрузки модуля.

```js
const { mockHttpsPostSkipSsl, mockGetGigaChatToken } = vi.hoisted(() => ({
  mockHttpsPostSkipSsl: vi.fn(),
  mockGetGigaChatToken: vi.fn(),
}))

vi.mock('../utils/gigachat.js', () => ({
  httpsPostSkipSsl: mockHttpsPostSkipSsl,
  getGigaChatToken: mockGetGigaChatToken,
  GIGACHAT_CHAT_URL: 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
}))
```

**11 новых тестов** (раздел «createCallProvider — ГигаЧат (v1.1.4)»):

| # | Тест | Что проверяет |
|---|---|---|
| 1 | Успешный вызов с tools | functions/function_call:auto + Bearer token + URL содержит gigachat.devices.sberbank.ru |
| 2 | Без tools | functions/function_call **не** передаются в body |
| 3 | System prompt | извлекается из messages[0] и первый в body.messages |
| 4 | Кастомная модель | передаётся в body.model (вместо default 'GigaChat') |
| 5 | Нет clientId | throw `needs both clientId.*clientSecret` |
| 6 | Нет clientSecret | throw `needs both clientId.*clientSecret` |
| 7 | OAuth fail | throw `gigachat OAuth failed.*<original>` |
| 8 | HTTP error | throw `gigachat HTTP <code>.*<message>` |
| 9 | Network error | throw `gigachat: network error.*<ECONNREFUSED>` |
| 10 | Trim() spaces | защита от случайных пробелов в copy-paste — `'  gc-id  '` → `'gc-id'` |
| 11 | Unknown provider | сообщение НЕ упоминает «ГигаЧат не поддерживается» (старый месседж убран) |

---

## 5. Поток типичного действия — авто-reply через ГигаЧат

```
1. Юзер настроил в Settings:
   - aiProvider = 'gigachat'
   - aiProviderKeys.gigachat = {apiKey: 'gc-client-id', clientSecret: 'gc-...'}
   - aiAutoReplyMasterEnabled = true
   - Правило «keywords=[счёт], action=ai_reply, aiPromptHint=Скажи что в работе»

2. Клиент в TDLib пишет «нужен счёт»

3. TDLib эмитит updateNewMessage
   → tdlibClient.emit('message:new', {chatId, message})
   → autoReplyDispatcher.processNewMessage(payload)
   → 4 уровня защиты пройдены
   → engine.findMatchingRules → [rule]
   → action: 'ai_reply'

4. dispatcher.runAgent вызывает runAgentLoop:
   - actor: 'ai_auto'
   - autoConfirm: true
   - callProvider: callProviderWithFallback (v1.1.3)
   - initialMessages: [{role:'user', content: '... Подсказка: Скажи что в работе ...'}]

5. runAgentLoop:
   - adapter = getAdapter('gigachat')
   - tools = toGigaChatFunctions(schemas)  ← формат `functions`
   - callProviderWithFallback({messages, tools, signal})

6. callProviderWithFallback:
   - chain = [{provider:'gigachat'}]  ← active
   - try callProviderFn({provider:'gigachat', ...})

7. callProvider:
   - provider === 'gigachat' → callGigaChat({storage, messages, tools, model})

8. callGigaChat:
   - getProviderCreds → {apiKey: 'gc-client-id', clientSecret: 'gc-...'}
   - getGigaChatToken('gc-client-id', 'gc-...')
     → проверяет кэш → если истёк, OAuth POST к ngw.devices.sberbank.ru
     → возвращает 'eyJhbGc...' (JWT)
   - body = {model:'GigaChat', messages, functions: [...], function_call:'auto'}
   - httpsPostSkipSsl(GIGACHAT_CHAT_URL, JSON.stringify(body), headers)
   - return result.data

9. ГигаЧат отвечает:
   {
     choices: [{
       message: {
         function_call: { name: 'get_chat_history', arguments: '{"chatId":"tg_..."}' }
       },
       finish_reason: 'function_call'
     }]
   }

10. executor:
    - adapter.parseToolCalls(response) → [{id:'gc-1712...', name:'get_chat_history', input:{...}}]
    - Permission check (auto для read tools)
    - handler.getChatHistoryHandler → context.getMessages → реальный TDLib
    - audit entry: actor='ai_auto', actionId='get_chat_history'

11. tool_result обратно ГигаЧату:
    - formatFunctionResult('gc-1712...', 'get_chat_history', {ok:true, result:{messages:[...]}})
    - → {role: 'function', name: 'get_chat_history', content: JSON.stringify(...)}

12. Loop iteration 2: callGigaChat снова с обновлёнными messages
    - ГигаЧат отвечает: {function_call: {name:'reply_to_message', arguments:'{...}'}}

13. reply_to_message — confirm-required, но autoConfirm=true (actor='ai_auto')
    - audit: permissionResult: 'auto_confirmed'
    - handler.replyToMessageHandler → context.sendMessage → TDLib отправляет

14. tool_result обратно → ГигаЧат отвечает финальным текстом «Готово, ответил»
    - finish_reason: 'stop' → loop завершён

15. dispatcher:
    - markRuleMatched('rule_xxx')
    - appendAudit для каждого tool + summary
```

---

## 6. Что юзер видит

### 6.1 Settings → AI

UI **не изменился**. Те же поля что были в v0.87+:

```
┌──────────────────────────────────────────────┐
│ Провайдер AI:                                │
│ ○ Anthropic Claude                           │
│ ○ OpenAI GPT                                 │
│ ○ DeepSeek                                   │
│ ● ГигаЧат                                    │
│                                              │
│ Client ID:    [____________________]         │
│ Client Secret:[____________________]         │
│                                              │
│ Модель: [GigaChat ▼]                         │
└──────────────────────────────────────────────┘
```

### 6.2 Что работает теперь (после v1.1.4)

| Сценарий | До v1.1.4 | После v1.1.4 |
|---|---|---|
| Settings → AI → ГигаЧат → ввёл ключи | ✅ | ✅ |
| Открыть AISidebar, написать вопрос | ✅ ответ текстом | ✅ ответ текстом |
| Нажать «🤖 AI» в уведомлении | ❌ ошибка «unsupported provider» | ✅ ГигаЧат думает + вызывает tools |
| Auto-reply правило, action='ai_reply' с ГигаЧат как primary | ❌ ошибка | ✅ работает |
| Multi-provider fallback включает ГигаЧат | ❌ исключён | ✅ в chain |
| ГигаЧат упал → Anthropic как fallback | — | ✅ работает |

---

## 7. Подводные камни и решения

### 7.1 ГигаЧат не поддерживает параллельные вызовы

OpenAI / Anthropic могут вернуть 3 tool_calls за раз:
```json
{tool_calls: [{...history...}, {...search...}, {...reply...}]}
```

ГигаЧат возвращает **один** function_call за раз:
```json
{function_call: {name: 'get_chat_history', arguments: '{...}'}}
```

**Что это значит**: AI-агент будет работать **в 2-3 раза медленнее** для сложных задач (требующих несколько tool вызовов). Каждый tool — отдельная итерация LLM.

**Защита**: max iterations в executor = 10. Не зацикливается.

### 7.2 Token cache shared между сессиями

`aiTokenCache` в `gigachat.js` — **module-scope** Map. Если запустить 2 параллельных запроса с одинаковыми creds → один OAuth, общий кэш. Это **хорошо** (экономия).

Если creds разные → разные cacheKey → независимые токены. Тоже хорошо.

### 7.3 SSL bypass и MITM

`rejectUnauthorized: false` — это **только для запросов через `httpsPostSkipSsl`**. Никакой другой код приложения не теряет SSL проверку.

**Риск MITM**: теоретически если кто-то подменит DNS для `gigachat.devices.sberbank.ru` → получит unencrypted доступ к token + сообщениям. **Mitigation**: проверка `hostname === 'gigachat.devices.sberbank.ru' || 'ngw.devices.sberbank.ru'` перед запросом — TODO для v1.2.0.

Сейчас `httpsPostSkipSsl` принимает любой URL. Если в коде где-то опечатка с URL → запрос пойдёт куда угодно с отключённым SSL.

**Сейчас это OK** потому что вызов только из контролируемого кода:
- `aiHandlers.js` — `GIGACHAT_CHAT_URL` (константа)
- `aiProviderCaller.js` — `GIGACHAT_CHAT_URL` (константа)
- `gigachat.js` — `GIGACHAT_AUTH_URL` (константа)

### 7.4 RqUID header

ГигаЧат API требует уникальный `RqUID` (Request UID) в OAuth запросе для трассируемости. Генерируется через `crypto.randomUUID()` — каждый OAuth уникален.

### 7.5 Stream API не поддерживается

ГигаЧат имеет SSE streaming но **не работает с function_call** (см. документацию Сбер). `aiHandlers.js` уже отключает streaming для gigachat:
```js
// ГигаЧат — без стриминга (SSL-bypass не поддерживает ReadableStream)
if (provider === 'gigachat') { /* non-streaming path */ }
```

Tool use в v1.1.4 — non-streaming тоже. Это **OK** потому что AI агент не показывает text-by-text, он показывает шаги (tool_call/tool_result события через onStep).

---

## 8. Файлы — сводка

| Файл | Тип | Что |
|---|---|---|
| `main/ai/aiProviderCaller.js` | edit | +30 строк: импорт gigachat utils + callGigaChat функция + ветка provider==='gigachat' |
| `main/ai/aiProviderCaller.vitest.js` | edit | +130 строк: vi.hoisted mocks + 11 новых тестов |
| `main/main.js` | edit | FALLBACK_ORDER += 'gigachat', hasCreds проверка для gigachat |
| `package.json` / `package-lock.json` / `CLAUDE.md` / `features.md` | edit | версия 1.1.3 → 1.1.4 |
| `src/utils/changelogData.js` | edit | новая запись v1.1.4 |
| `.memory-bank/ai-agent-plan/phases/phase-gigachat-tool-use-impl.md` | **новый** | этот файл |

**НЕ изменены** (всё уже было готово):
- `main/utils/gigachat.js` — OAuth + SSL bypass с v0.87.81
- `main/ai/adapters/gigachatAdapter.js` — конвертация с v0.97.0
- `main/ai/aiToolExecutor.js` — ветка provider==='gigachat' для tool_result с v0.97.0
- `src/components/AIConfigPanel.jsx` — UI поля clientId/clientSecret уже существовали
- `main/handlers/aiHandlers.js` — обычный чат через ГигаЧат продолжает работать

---

## 9. Тесты — детальный список

### `main/ai/aiProviderCaller.vitest.js` — раздел «ГигаЧат (v1.1.4)» — 11 тестов

```
1. успешный вызов с tools → functions/function_call:auto + Bearer token
   ✅ mockHttpsPostSkipSsl получил URL gigachat.devices.sberbank.ru
   ✅ headers Authorization=Bearer <token>
   ✅ body.functions = переданные tools
   ✅ body.function_call = 'auto'
   ✅ body.model = 'GigaChat' (default)

2. без tools — НЕ передаём functions/function_call
   ✅ body.functions === undefined

3. system prompt извлекается из messages[0]
   ✅ body.messages[0] = {role:'system', content:'Ты помощник'}
   ✅ body.messages[1] = {role:'user', content:'привет'}

4. кастомная модель → body.model
   ✅ передаём model:'GigaChat-Pro' → body.model='GigaChat-Pro'

5. нет clientId → throw
   ✅ storage без gigachat.apiKey → throw 'needs both clientId.*clientSecret'
   ✅ mockGetGigaChatToken НЕ вызвана

6. нет clientSecret → throw
   ✅ storage с apiKey но без clientSecret → throw

7. OAuth fail → throw с явным сообщением
   ✅ mockGetGigaChatToken throws → 'gigachat OAuth failed.*<original message>'

8. HTTP error (ok:false) → throw с кодом и message
   ✅ {ok:false, data:{error:{code:429, message:'Too many requests'}}}
   ✅ throw 'gigachat HTTP 429.*Too many requests'

9. network error → понятное сообщение
   ✅ mockHttpsPostSkipSsl throws → 'gigachat: network error.*ECONNREFUSED'

10. trim() применяется
    ✅ storage с '  gc-id  ' → getGigaChatToken('gc-id', 'gc-secret')

11. unknown provider — без упоминания ГигаЧат
    ✅ 'evil_provider' → throw 'unsupported provider "evil_provider"'
    (раньше было 'unsupported provider...ГигаЧат пока не поддерживается')
```

### Существующие тесты (не изменены, продолжают работать)
- `main/ai/adapters/adapters.vitest.js` — gigachatAdapter (toGigaChatFunctions, parseGigaChatFunctionCall, formatFunctionResult)
- `main/ai/aiToolExecutor.vitest.js` — provider==='gigachat' ветка в форматировании tool_result

---

## 10. Что осталось (deferred v1.2.0+)

| ⭐ | Что | Зачем |
|---|---|---|
| ⭐⭐ | Hostname whitelist в `httpsPostSkipSsl` | Защита от MITM если URL опечатка ведёт мимо `gigachat.devices.sberbank.ru` |
| ⭐ | UI dropdown выбора model (GigaChat / Pro / Max) | Сейчас юзер должен знать имена моделей вручную |
| ⭐ | `_refreshPromise` race protection в `getGigaChatToken` | Если 2 параллельных запроса увидят что token истёк — оба пойдут за новым. Не критично потому что cache key один. |

---

**Версия документа**: создан 9 июня 2026 для v1.1.4.
