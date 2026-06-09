# Phase 1 — Tools каркас (детально)

> ## ✅ ЗАВЕРШЕНО (v0.97.0, commit `ce994ce`, 2026-06-08)
>
> Все 9 milestones (M1.1-M1.9) выполнены. 87 unit-тестов passed.
> 4 provider adapters (Anthropic / OpenAI / DeepSeek / ГигаЧат) готовы.
> См. [progress.md](../progress.md) и [changelog.md](../changelog.md).

> **Цель**: Каркас Tool Use. AI может вызывать функции через JSON Schema.
> Только **read-only** tools (безопасно). Write tools — в Phase 2.

## Что делаем

- Tool Registry (реестр)
- Tool Schemas (JSON Schema для 3 read-only tools)
- Adapters для 4 провайдеров (Anthropic / OpenAI / DeepSeek / ГигаЧат)
- aiToolExecutor — main-side agent loop
- aiContextBuilder — собирает context для AI
- IPC bridge

## Что НЕ делаем в Phase 1

- ❌ Write actions (reply / mark-read через AI) — Phase 2
- ❌ Permission Modal UI — Phase 2
- ❌ Audit Log UI — Phase 2 (но базовый audit писаться будет)
- ❌ AI Agent UI кнопка — Phase 3

## Файлы

### Новые

| Файл | Размер |
|---|---|
| `src/shared/tools/toolRegistry.js` | ~80 |
| `src/shared/tools/toolSchemas.js` | ~120 |
| `src/shared/tools/handlers/gotoMessage.js` | ~30 |
| `src/shared/tools/handlers/getChatHistory.js` | ~40 |
| `src/shared/tools/handlers/searchMessages.js` | ~50 |
| `main/ai/adapters/anthropicAdapter.js` | ~80 |
| `main/ai/adapters/openaiAdapter.js` | ~80 |
| `main/ai/adapters/deepseekAdapter.js` | ~40 (extends openai) |
| `main/ai/adapters/gigachatAdapter.js` | ~90 |
| `main/ai/aiToolExecutor.js` | ~120 |
| `main/ai/aiContextBuilder.js` | ~80 |
| `main/handlers/aiToolIpcHandlers.js` | ~70 |

### Тесты

| Файл | Кол-во тестов |
|---|---|
| `src/shared/tools/toolRegistry.vitest.js` | 5 |
| `src/shared/tools/toolSchemas.vitest.js` | 3 |
| `src/shared/tools/handlers/*.vitest.js` (3 файла) | 9 (3 на каждый) |
| `main/ai/adapters/*.vitest.js` (4 файла) | 12 |
| `main/ai/aiToolExecutor.vitest.js` | 4 |
| `main/ai/aiContextBuilder.vitest.js` | 3 |

**Итого**: 36 новых тестов

---

## Milestones

### M1.1 — Tool Registry

**Файл**: `src/shared/tools/toolRegistry.js`

**Экспорты**:
- `createToolRegistry()` — factory
- Methods: `register(toolId, def)`, `unregister(toolId)`, `lookup(toolId)`, `list()`, `count()`

**Структура tool definition**:
```js
{
  id: 'get_chat_history',
  schema: { /* JSON Schema */ },
  handler: async (source, args, context) => { ... },
  permission: 'auto' | 'confirm' | 'deny',
  description: 'Получить историю чата',
  category: 'reading' | 'writing' | 'navigation' | 'system',
  revertable: true | false,
  metadata: { addedAt, version }
}
```

**Поведение**:
- `register(id, def)` — добавляет в Map
- `lookup(id)` — возвращает def или null
- `list()` — все tools, sorted by id
- Защита от перерегистрации (warning или throw — настраивается)

**Тесты** (5):
1. `register + lookup работает`
2. `register дубликата → warning или throw`
3. `unregister удаляет`
4. `list возвращает все по id`
5. `list пустой → []`

#### Done criteria

- [ ] Registry готов
- [ ] 5 тестов passed
- [ ] **Юзер подтвердил «дальше»**

---

### M1.2 — Tool Schemas (3 read-only tools)

**Файл**: `src/shared/tools/toolSchemas.js`

**Экспорты**:
- `TOOL_SCHEMAS` — массив объектов с JSON Schema
- `notificationSourceSchema` — общий $ref schema

**Tools** (детали в [tools-catalog.md](../tools-catalog.md)):

1. **goto_message**
   ```js
   {
     id: 'goto_message',
     description: '...',
     inputSchema: { ... },
     permission: 'auto',
     category: 'navigation',
     revertable: false
   }
   ```

2. **get_chat_history**
   ```js
   {
     id: 'get_chat_history',
     description: '...',
     inputSchema: { chatId, limit (1-100), beforeMessageId? },
     permission: 'auto',
     category: 'reading',
     revertable: false
   }
   ```

3. **search_messages**
   ```js
   {
     id: 'search_messages',
     description: '...',
     inputSchema: { query, chatId?, limit },
     permission: 'auto',
     category: 'reading',
     revertable: false
   }
   ```

**Тесты** (3):
1. `все schemas валидны JSON Schema 2020-12`
2. `$ref на notificationSourceSchema разрешается`
3. `required fields правильные`

---

### M1.3 — Handlers

**Файлы**:
- `src/shared/tools/handlers/gotoMessage.js`
- `src/shared/tools/handlers/getChatHistory.js`
- `src/shared/tools/handlers/searchMessages.js`

**Контракт** каждого handler:
```js
async function handler(source, args, context) {
  // source: NotificationSource (паспорт)
  // args: tool-specific args
  // context: { dispatch, store, ... } — для вызова других actions

  // ... выполнить
  
  return { ok: true, result: ... }
  // или
  return { ok: false, error: '...' }
}
```

**gotoMessage handler**:
```
1. Извлечь source.messengerId / accountId / chatId / messageId
2. context.dispatch('switch_chat', { accountId, chatId })
3. context.scrollToMessage(messageId) — через store
4. return { ok: true }
```

**getChatHistory handler**:
```
1. Из args: chatId, limit (1-100, default 20), beforeMessageId?
2. context.store.getMessages(chatId, { limit, before: beforeMessageId })
3. Сериализовать для AI: { id, senderName, text, timestamp, isOutgoing }
4. textPreview обрезается до 500 chars (privacy + size)
5. return { ok: true, result: { messages: [...] } }
```

**searchMessages handler**:
```
1. Из args: query, chatId?, limit
2. context.store.searchMessages(query, { chatId, limit })
3. Highlight matches (для UI)
4. return { ok: true, result: { matches: [...] } }
```

**Тесты** (3 на каждый = 9):

Для каждого handler:
1. `работает с правильными args`
2. `error при отсутствии обязательного arg`
3. `мокается store/context корректно`

---

### M1.4 — Anthropic Adapter

**Файл**: `main/ai/adapters/anthropicAdapter.js`

**Экспорты**:
- `toAnthropicTools(toolSchemas)` — конверсия наш формат → Anthropic
- `parseAnthropicToolUse(response)` — извлечь tool_calls из response
- `formatToolResult(toolUseId, result)` — обратно к Anthropic

**Конверсия universal → Anthropic**:
```js
function toAnthropicTools(schemas) {
  return schemas.map(s => ({
    name: s.id,
    description: s.description,
    input_schema: s.inputSchema
  }))
}
```

**Парсинг response**:
```js
function parseAnthropicToolUse(response) {
  return response.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, input: b.input }))
}
```

**Tool result format**:
```js
function formatToolResult(toolUseId, result) {
  return {
    role: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: JSON.stringify(result)
    }]
  }
}
```

**Тесты** (3):
1. Конверсия schemas → Anthropic format
2. Парсинг response с tool_use
3. Парсинг response без tool_use (плоский text)

---

### M1.5 — OpenAI / DeepSeek Adapter

**Файл**: `main/ai/adapters/openaiAdapter.js`

Аналогично Anthropic, но OpenAI format:
- `{ type: 'function', function: { name, description, parameters } }`
- response: `choices[0].message.tool_calls[]`
- tool_result: `{ role: 'tool', tool_call_id, content }`

**Файл**: `main/ai/adapters/deepseekAdapter.js`

```js
// DeepSeek полностью OpenAI-compatible
export * from './openaiAdapter.js'
```

**Тесты** (3 на OpenAI):
1. Конверсия schemas → OpenAI format
2. Парсинг tool_calls из response
3. Парсинг без tool_calls

---

### M1.6 — ГигаЧат Adapter (тестирование)

**Файл**: `main/ai/adapters/gigachatAdapter.js`

ГигаЧат использует старый OpenAI format (`functions`, не `tools`):

```js
function toGigaChatFunctions(schemas) {
  return schemas.map(s => ({
    name: s.id,
    description: s.description,
    parameters: s.inputSchema
  }))
}

function parseGigaChatFunctionCall(response) {
  const fc = response.choices?.[0]?.message?.function_call
  if (!fc) return []
  return [{
    id: 'gc-fc-' + Date.now(),  // ГигаЧат не даёт id
    name: fc.name,
    input: JSON.parse(fc.arguments || '{}')
  }]
}
```

**Тесты** (3):
1. Конверсия
2. Парсинг function_call
3. Парсинг без function_call

**ВНИМАНИЕ**: если ГигаЧат tool use нестабилен — в `aiProviders.js` 
ставим `supportsTools: false` для gigachat. UI агента кнопка disabled.

---

### M1.7 — aiToolExecutor (главный модуль)

**Файл**: `main/ai/aiToolExecutor.js`

**Экспорт**:
- `runAgentLoop({ source, context, provider, model, maxIterations })`

**Алгоритм**:

```
async function runAgentLoop(params) {
  const { source, context, provider, model } = params
  const maxIterations = params.maxIterations || 10
  
  let messages = [
    { role: 'user', content: formatInitialPrompt(source, context) }
  ]
  let tools = adapter.toolsForProvider(provider, ALL_TOOL_SCHEMAS)
  let iterations = 0
  
  while (iterations < maxIterations) {
    iterations++
    
    // 1. Запрос к AI
    const response = await callProvider(provider, model, messages, tools)
    
    // 2. Парсинг tool_calls
    const toolCalls = adapter.parseToolUse(response)
    if (toolCalls.length === 0) {
      // AI закончил — возвращаем финальный ответ
      return { ok: true, finalAnswer: response.text, iterations }
    }
    
    // 3. Исполнение каждого tool_call
    const toolResults = await Promise.all(toolCalls.map(async tc => {
      const def = toolRegistry.lookup(tc.name)
      if (!def) return { id: tc.id, error: 'unknown_tool' }
      
      // Permission (в Phase 1 — auto для read-only)
      if (def.permission === 'deny') {
        return { id: tc.id, error: 'permission_denied' }
      }
      // confirm — пока пропускается в Phase 1 (нет write tools)
      
      // Validate input против schema
      const validationResult = validateInput(def.schema, tc.input)
      if (!validationResult.valid) {
        return { id: tc.id, error: 'invalid_input', details: validationResult.errors }
      }
      
      // Execute
      try {
        const result = await def.handler(source, tc.input, context)
        return { id: tc.id, result }
      } catch (e) {
        return { id: tc.id, error: e.message }
      }
    }))
    
    // 4. Audit log (базовый в Phase 1)
    auditLogger.logToolExecutions(toolCalls, toolResults, source)
    
    // 5. Добавить tool_results в messages, продолжить loop
    messages.push(adapter.formatAssistantWithToolUse(response))
    for (const tr of toolResults) {
      messages.push(adapter.formatToolResult(tr.id, tr))
    }
  }
  
  return { ok: false, error: 'max_iterations_reached', iterations }
}
```

**Тесты** (4):
1. Loop с 0 tool_calls → return сразу
2. Loop с 1 tool_call → execute + return
3. Loop с unknown tool → error
4. Loop с max iterations → abort

---

### M1.8 — aiContextBuilder

**Файл**: `main/ai/aiContextBuilder.js`

**Экспорт**:
- `buildAgentContext(source, store)` — асинхронно собирает контекст

**Что в контексте**:
```js
{
  source: NotificationSource,
  recentMessages: [...последние 10 messages...],
  userProfile: { ... },  // имя оператора, его стиль (Phase 4 — fine-tuned)
  systemPrompt: '...',
  toolsAvailable: [...список tool names...],
  permissionTiers: { ... }  // для UI hints
}
```

**Тесты** (3):
1. buildContext возвращает все нужные поля
2. recentMessages обрезается до 10
3. systemPrompt включает source.senderName / chatTitle

---

### M1.9 — IPC bridge

**Файл**: `main/handlers/aiToolIpcHandlers.js`

**IPC channels**:

- `ai:agent:run` (invoke):
  - Request: `{ source, provider, model, options }`
  - Response: `{ ok, finalAnswer?, error?, audit }`

- `ai:agent:cancel` (send):
  - Request: `{ requestId }`
  - Cancels in-flight agent loop

**Тесты** (3):
1. ai:agent:run с валидным source → runs loop
2. ai:agent:cancel → aborts
3. ai:agent:run с невалидным source → error

---

## Done criteria для Phase 1

- [ ] Все 9 milestones M1.1 — M1.9 done
- [ ] 36 новых тестов passed
- [ ] Все 4 adapter работают (или 3 + ГигаЧат скипнут)
- [ ] aiToolExecutor пробегает loop с 3 read-only tools
- [ ] Версия bump v0.96.0 → v0.97.0 (или v0.96.x для патча)
- [ ] Документация: progress.md / changelog.md / problems.md обновлены
- [ ] **Юзер подтвердил → готов к Phase 2**

## Manual test (юзер)

В Phase 1 нет UI кнопки агента (она в Phase 3). Тест через консоль (для разработчика):

```js
// Renderer console:
window.api.invoke('ai:agent:run', {
  source: { messengerId: 'native_cc', accountId: 'tg_X', chatId: '-100Y', messageId: 'Z' },
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001'
})
// Должно вернуть финальный текст AI после use tools
```

## Risks

| Риск | План митигации |
|---|---|
| ГигаЧат tool use нестабилен | Тестировать в M1.6. Если нет — `supportsTools: false` |
| Adapter conversion bug | Schema validation + tests |
| AI зацикливается | max iterations 10 в Tool Executor |
| Cost overrun | в Phase 1 нет UI — только разработческие тесты |

## Готовность к Phase 2

После Phase 1:
- AI может вызывать read-only tools
- Adapters работают
- Tool Executor готов
- Безопасно (только read-only)

→ Готовы к Phase 2: Write actions + Permission system + Audit UI.
