# Поддержка tool_use по провайдерам

Мы используем 4 AI провайдера. Не все одинаково поддерживают tool_use (function calling).
В этом файле — детальный анализ каждого.

## Сводка

| Провайдер | Tool Use | Streaming Tools | Дата релиза | Совместимость |
|---|---|---|---|---|
| **Anthropic Claude** | ✅ Нативно | ✅ Да | 2024 | Best-in-class |
| **OpenAI GPT** | ✅ Нативно | ✅ Да | 2023 | Industry standard |
| **DeepSeek** | ✅ OpenAI-compatible | ✅ Да | 2024 | Стабильно |
| **ГигаЧат** | ⚠️ Частично | ❌ Нет | 2024 | Тестировать |

---

## Anthropic Claude (наш текущий стандарт)

### Endpoint

`POST https://api.anthropic.com/v1/messages`

### Tools параметр

```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 2048,
  "tools": [
    {
      "name": "get_chat_history",
      "description": "...",
      "input_schema": { ... JSON Schema ... }
    }
  ],
  "messages": [...]
}
```

### Response

```json
{
  "id": "msg_...",
  "stop_reason": "tool_use",  // или "end_turn"
  "content": [
    { "type": "text", "text": "Сейчас прочитаю историю..." },
    { 
      "type": "tool_use",
      "id": "toolu_...",
      "name": "get_chat_history",
      "input": { "chatId": "...", "limit": 20 }
    }
  ]
}
```

### Tool result обратно

```json
{
  "messages": [
    ...предыдущие,
    {
      "role": "assistant",
      "content": [
        { "type": "text", "text": "..." },
        { "type": "tool_use", "id": "toolu_...", "name": "...", "input": {...} }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_...",
          "content": "Результат..."
        }
      ]
    }
  ]
}
```

### Особенности Claude

- **Multi-turn встроен**: можно цепочкой вызывать tools, Claude думает между ними
- **Parallel tool use**: может вызвать 2-3 tools одновременно в одном response
- **Best reasoning**: лучше других понимает когда нужен tool, а когда нет
- **Tool choice**: можно форсировать `{"type": "tool", "name": "get_chat_history"}` (заставить вызвать конкретный)
- **Streaming**: поддерживает SSE для tool_use (chunks с partial input)

### Рекомендуемые модели

| Модель | Use case |
|---|---|
| `claude-haiku-4-5-20251001` | По умолчанию. Быстрый, дешёвый. ~$1 / 1M input tokens |
| `claude-sonnet-4-6` | Сложные сценарии. ~$3 / 1M input tokens |
| `claude-opus-4-7` | Только когда нужна максимальная точность. Дорого. |

### Документация

- https://docs.anthropic.com/claude/docs/tool-use
- https://docs.anthropic.com/claude/docs/streaming-tool-use

---

## OpenAI GPT

### Endpoint

`POST https://api.openai.com/v1/chat/completions`

### Tools параметр

```json
{
  "model": "gpt-4o-mini",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_chat_history",
        "description": "...",
        "parameters": { ... JSON Schema ... },
        "strict": true
      }
    }
  ],
  "tool_choice": "auto"
}
```

### Response

```json
{
  "id": "chatcmpl-...",
  "choices": [
    {
      "finish_reason": "tool_calls",
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_...",
            "type": "function",
            "function": {
              "name": "get_chat_history",
              "arguments": "{\"chatId\": \"...\", \"limit\": 20}"
            }
          }
        ]
      }
    }
  ]
}
```

### Tool result обратно

```json
{
  "messages": [
    ...предыдущие,
    {
      "role": "assistant",
      "tool_calls": [...]
    },
    {
      "role": "tool",
      "tool_call_id": "call_...",
      "content": "Результат..."
    }
  ]
}
```

### Особенности OpenAI

- **JSON mode + strict**: гарантированно валидный JSON в `arguments` (since gpt-4o)
- **Parallel function calls**: множественные tool_calls в одном response (default on)
- **`tool_choice: "required"`**: форсировать вызов какого-то tool
- **Function calling** — старое название, теперь просто `tools`
- **Streaming**: поддерживается, deltas включают tool_call chunks

### Рекомендуемые модели

| Модель | Use case |
|---|---|
| `gpt-4o-mini` | По умолчанию. Быстрый, дешёвый. ~$0.15 / 1M input tokens |
| `gpt-4o` | Сложные сценарии. ~$2.5 / 1M input tokens |
| `o1-mini` | Только когда нужно reasoning chain. Без tool use! |

### Документация

- https://platform.openai.com/docs/guides/function-calling
- https://platform.openai.com/docs/guides/structured-outputs

---

## DeepSeek

### Endpoint

`POST https://api.deepseek.com/v1/chat/completions`

### Tools параметр

**Идентичный OpenAI format** — DeepSeek emulates OpenAI API.

```json
{
  "model": "deepseek-chat",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": { "name": "...", "parameters": {...} }
    }
  ]
}
```

### Особенности DeepSeek

- **OpenAI-compatible**: тот же код что для OpenAI работает
- **Огромная экономия**: ~$0.014 / 1M input tokens — в **10× дешевле** OpenAI
- **Reasoner модель**: `deepseek-reasoner` с встроенным chain-of-thought (но **БЕЗ tool use!**)
- **Streaming**: поддерживается
- **Cache discount**: повторные запросы со схожим prefix скидываются до 0.014 / 1M

### Рекомендуемые модели

| Модель | Use case |
|---|---|
| `deepseek-chat` | По умолчанию для агента. Дешёво и с tool use. |
| `deepseek-reasoner` | НЕ для агента (нет tool use). Для свободного reasoning. |

### Документация

- https://api-docs.deepseek.com/guides/function_calling
- https://platform.deepseek.com/api_keys

---

## ГигаЧат (Сбер)

### Endpoint

`POST https://gigachat.devices.sberbank.ru/api/v1/chat/completions`

### Tools параметр

```json
{
  "model": "GigaChat",
  "messages": [...],
  "functions": [
    {
      "name": "get_chat_history",
      "description": "...",
      "parameters": { ... JSON Schema ... }
    }
  ],
  "function_call": "auto"
}
```

### Response

```json
{
  "choices": [
    {
      "finish_reason": "function_call",
      "message": {
        "role": "assistant",
        "function_call": {
          "name": "get_chat_history",
          "arguments": "{...}"
        }
      }
    }
  ]
}
```

### Особенности ГигаЧат

- **Старый OpenAI format** (functions, не tools) — нужен отдельный mapper
- **Не поддерживает parallel function calls**
- **Streaming с function_call** — нестабильно (по нашему опыту)
- **SSL bypass**: Сбер использует свои корневые сертификаты, требует `rejectUnauthorized: false` (см. `httpsPostSkipSsl()` в `aiHandlers.js`)
- **OAuth2 авторизация**: токены через `getGigaChatToken` (Client ID + Secret)
- **Cyrillic intent detection**: лучше OpenAI для русского языка
- **Free tier**: 1M tokens/month free → подходит для small users

### Рекомендуемые модели

| Модель | Use case |
|---|---|
| `GigaChat` | По умолчанию. Базовая |
| `GigaChat-Plus` | Лучше качество, контекст 32K |
| `GigaChat-Pro` | Best quality, но платно |

### Что мы делаем для ГигаЧат

В **Phase 1** ГигаЧат — **read-only tools**. Tool use тестируется.

В **Phase 2** если стабильно — добавляем write tools. Если нет — ГигаЧат остаётся как «текстовый помощник» (existing AISidebar).

### Документация

- https://developers.sber.ru/docs/ru/gigachat/api/function-calling
- https://developers.sber.ru/studio

---

## Универсальный JSON Schema (наш стандарт)

Наш формат **JSON Schema 2020-12** работает с **всеми 4 провайдерами** через адаптер.

```js
// src/shared/tools/toolSchemas.js
const universalSchema = {
  name: 'get_chat_history',
  description: '...',
  inputSchema: { /* JSON Schema 2020-12 */ }
}

// main/handlers/aiHandlers.js — провайдер-specific адаптеры:

function toAnthropicTools(schemas) {
  return schemas.map(s => ({
    name: s.name,
    description: s.description,
    input_schema: s.inputSchema
  }))
}

function toOpenAITools(schemas) {
  return schemas.map(s => ({
    type: 'function',
    function: {
      name: s.name,
      description: s.description,
      parameters: s.inputSchema,
      strict: true
    }
  }))
}

function toGigaChatFunctions(schemas) {
  return schemas.map(s => ({
    name: s.name,
    description: s.description,
    parameters: s.inputSchema
  }))
}
```

Adapter pattern в [aiHandlers.js](../../main/handlers/aiHandlers.js) уже есть — конфиг PROVIDERS
строки 7-35. Расширяем `tools` параметром, остальное работает.

---

## Tool result обратно — адаптеры

Анти-аналогично — `toolResult` парсинг разный:

```js
// Anthropic
function parseAnthropicToolUse(response) {
  return response.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, input: b.input }))
}

// OpenAI / DeepSeek
function parseOpenAIToolCalls(response) {
  return response.choices[0].message.tool_calls?.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments)
  })) || []
}

// ГигаЧат
function parseGigaChatFunctionCall(response) {
  const fc = response.choices[0].message.function_call
  if (!fc) return []
  return [{
    id: 'gc-fc-' + Date.now(),  // ГигаЧат не даёт id, генерируем
    name: fc.name,
    input: JSON.parse(fc.arguments)
  }]
}
```

---

## Стоимость для оценки

При 100 уведомлений в день, 5 tool_calls на каждое:

| Провайдер | Tokens / запрос | Цена / месяц |
|---|---|---|
| Anthropic Claude Haiku | ~2K input / 500 output | ~$3 |
| OpenAI GPT-4o-mini | ~2K input / 500 output | ~$0.5 |
| **DeepSeek** | ~2K input / 500 output | **~$0.05** (best deal) |
| ГигаЧат | ~2K input / 500 output | **$0 в free tier** до 1M tokens |

**Рекомендация для production**: DeepSeek или Claude Haiku в зависимости от качества.
Для теста разработки: ГигаЧат free.

---

## Provider matrix — какой когда выбрать

| Сценарий | Рекомендуемый провайдер |
|---|---|
| По умолчанию для агента | **Claude Haiku 4.5** — лучший reasoning |
| Бюджет важен | **DeepSeek** — в 10× дешевле, качество ~80% |
| Russian-only клиенты | **ГигаЧат** — лучше для русского, free tier |
| Стандартное use case | **OpenAI gpt-4o-mini** — industry standard |
| Полный офлайн | **Ollama** (Phase 4) — local llama3 / mistral |
| Сложные сценарии | **Claude Sonnet 4.6** или **GPT-4o** |

---

## Что если провайдер не поддерживает tool_use

В UI кнопка «🤖 Обработать» **отключена** для провайдеров без `supportsTools: true`.

Юзер видит сообщение:
```
⚠️ Этот AI-провайдер не поддерживает агентский режим.
Доступен только текстовый помощник (3 варианта ответа).

Переключитесь на: Claude Haiku / GPT-4o-mini / DeepSeek
```

---

## Тестирование провайдеров

В **Phase 1** для каждого провайдера должен пройти:

- [ ] **TEST-PROV-001**: Tool call `get_chat_history` → корректный input/output
- [ ] **TEST-PROV-002**: Multi-turn (tool call → result → next tool call) работает
- [ ] **TEST-PROV-003**: Schema validation — невалидный input от AI отлавливается
- [ ] **TEST-PROV-004**: Error handling — провайдер вернул 500 / timeout
- [ ] **TEST-PROV-005**: Streaming tool_use partials (Anthropic / OpenAI / DeepSeek)

ГигаЧат может не пройти PROV-005 (нет streaming для function_call) — это OK.

---

## Ссылки

- [tools-catalog.md](./tools-catalog.md) — список всех tools
- [architecture.md](./architecture.md) — где адаптеры провайдеров живут
- [aiHandlers.js](../../main/handlers/aiHandlers.js) — текущий код провайдеров
