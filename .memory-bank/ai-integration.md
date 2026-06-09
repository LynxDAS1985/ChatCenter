# ИИ-интеграция — ChatCenter

## Поддерживаемые провайдеры (v0.12.0)

| Провайдер | Статус | Модели | Авторизация |
|-----------|--------|--------|-------------|
| OpenAI | ✅ Реализовано | gpt-4o-mini, gpt-4o | API Key (sk-...) |
| Anthropic Claude | ✅ Реализовано | claude-haiku-4-5, claude-sonnet-4-6 | API Key (sk-ant-...) |
| DeepSeek | ✅ Реализовано | deepseek-chat, deepseek-reasoner | API Key (sk-...) |
| ГигаЧат | ✅ Реализовано | GigaChat, GigaChat-Plus | Client ID + Secret (OAuth2) |
| Ollama (локальный) | 📋 Запланировано | llama3, mistral и др. | нет |

### ГигаЧат — особенности
- Auth URL: `https://ngw.devices.sberbank.ru:9443/api/v2/oauth`
- Chat URL: `https://gigachat.devices.sberbank.ru/api/v1/chat/completions`
- SSL-сертификат Сбербанка нестандартный → `rejectUnauthorized: false` в `httpsPostSkipSsl()`
- Токены кэшируются в `aiTokenCache` с проверкой expires_at
- Credentials в settings: `aiApiKey` = Client ID, `aiClientSecret` = Client Secret

---

## Архитектура AIService

```js
// main/services/AIService.js
class AIService {
  constructor(config) {
    this.config = config  // AIConfig из electron-store
    this.adapter = this.createAdapter(config.provider)
  }

  createAdapter(provider) {
    switch (provider) {
      case 'openai':    return new OpenAIAdapter(this.config)
      case 'anthropic': return new AnthropicAdapter(this.config)
      case 'ollama':    return new OllamaAdapter(this.config)
    }
  }

  // Основной метод — анализ входящего сообщения
  async analyze(message, context = []) {
    const prompt = this.buildAnalyzePrompt(message, context)
    const response = await this.adapter.complete(prompt)
    return this.parseAnalyzeResponse(response)
  }

  // Генерация ответа по произвольному промпту
  async reply(userPrompt, context = []) {
    const prompt = this.buildReplyPrompt(userPrompt, context)
    const response = await this.adapter.complete(prompt)
    return response.text
  }
}
```

---

## Промпты

### Системный промпт (базовый)

```
Ты — помощник оператора службы поддержки клиентов.
Твоя задача — анализировать входящие сообщения от клиентов
и предлагать 3 варианта ответа: краткий, подробный и нейтральный.
Отвечай на языке клиента. Будь вежлив и профессионален.
```

### Промпт анализа сообщения

```
Входящее сообщение от клиента:
[имя]: [текст сообщения]

Контекст переписки (последние сообщения):
[история]

Предложи 3 варианта ответа в формате JSON:
{
  "suggestions": [
    "Краткий ответ",
    "Подробный ответ",
    "Нейтральный ответ"
  ],
  "intent": "жалоба|вопрос|благодарность|другое",
  "priority": "высокий|средний|низкий"
}
```

### Промпт авто-ответа

```
Ты — автоматический ответчик. Клиент написал:
[текст]

Правило авто-ответа: [описание правила]
Ответь кратко и по делу. Один вариант ответа, без объяснений.
```

---

## Адаптер OpenAI

```js
// main/services/adapters/OpenAIAdapter.js
const https = require('https')

class OpenAIAdapter {
  constructor(config) {
    this.apiKey = config.apiKey
    this.model = config.model || 'gpt-4o-mini'
    this.maxTokens = config.maxTokens || 500
    this.temperature = config.temperature || 0.7
  }

  async complete(messages) {
    const body = JSON.stringify({
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature
    })

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return { text: data.choices[0].message.content }
  }
}
```

---

## Адаптер Anthropic Claude

```js
// main/services/adapters/AnthropicAdapter.js
class AnthropicAdapter {
  constructor(config) {
    this.apiKey = config.apiKey
    this.model = config.model || 'claude-haiku-4-5-20251001'
    this.maxTokens = config.maxTokens || 500
  }

  async complete(messages) {
    // messages[0] — системный, остальные — диалог
    const system = messages[0]?.role === 'system' ? messages[0].content : ''
    const userMessages = messages.filter(m => m.role !== 'system')

    const body = JSON.stringify({
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: userMessages
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const data = await response.json()
    return { text: data.content[0].text }
  }
}
```

---

## Рекомендации по моделям

| Задача | Модель | Причина |
|--------|--------|---------|
| Предложение ответов | claude-haiku-4-5 / gpt-4o-mini | Быстро, дёшево |
| Сложный анализ | claude-sonnet-4-6 / gpt-4o | Качество важнее скорости |
| Авто-ответ | claude-haiku-4-5 / gpt-4o-mini | Скорость критична |
| Локально (без интернета) | Ollama + llama3 | Приватность |

---

---

## Per-Provider режимы API/WebView (v0.12.0)

### Архитектура
Каждый провайдер теперь настраивается независимо. В `⚙️` каждого провайдера выбирается режим:
- `🔧 API-ключ` — запросы через API (ключ, модель, системный промпт)
- `🌐 Веб-интерфейс` — открывается сайт провайдера (своя подписка, без ключа)

### Хранение настроек
```js
settings.aiProviderKeys[pid] = {
  mode:         'api' | 'webview',     // режим провайдера (по умолчанию 'api')
  webviewUrl:   'https://...',          // URL для WebView (по умолчанию из DEFAULT_WEBVIEW_URLS)
  contextMode:  'none' | 'last' | 'full', // разрешения на чтение чата
  apiKey:       '...',
  clientSecret: '...',
  model:        '...',
}
```

### URL по умолчанию (DEFAULT_WEBVIEW_URLS)
```js
{
  openai:    'https://chat.openai.com',
  anthropic: 'https://claude.ai',
  deepseek:  'https://chat.deepseek.com',
  gigachat:  'https://giga.chat',
}
```

### Ключевые функции
```js
// Получить конфиг провайдера (с mode/webviewUrl/contextMode)
getProviderCfg(settings, pid) → { mode, webviewUrl, contextMode, apiKey, clientSecret, model }

// Проверить "подключён" ли провайдер (webview = всегда да)
isProviderConnected(settings, pid) → bool

// Сохранить mode/webviewUrl/contextMode для текущего провайдера
setProviderProp('mode', 'webview')
setProviderProp('webviewUrl', 'https://...')
setProviderProp('contextMode', 'last')
```

### Разрешения на чтение чата (contextMode, per-provider)
| Значение | Описание |
|----------|----------|
| `'none'` | Не передавать историю. Только ручной ввод в AI |
| `'last'` | Передать только последнее сообщение клиента (`lastMessage`) |
| `'full'` | Передать последние 10 сообщений из `chatHistory` |

### Вставка контекста в WebView AI (sendContextToAiWebview)
1. Формируем текст контекста согласно `providerCfg.contextMode`
2. Пробуем `webviewRef.executeJavaScript()` с несколькими CSS-селекторами
3. Если вставка удалась — показываем `✓ Вставлено!`
4. Если не удалась — копируем в буфер → показываем `📋 Ctrl+V`

### WebView partition
`partition="persist:ai-webview"` — отдельная сессия от мессенджеров. Позволяет оставаться залогиненным в AI-сервисе между запусками.

### Глобальные settings (устаревшие, не используются с v0.12.0)
```js
// УСТАРЕЛО с v0.12.0 — настройки режима теперь per-provider:
// settings.aiMode        → settings.aiProviderKeys[pid].mode
// settings.aiWebviewUrl  → settings.aiProviderKeys[pid].webviewUrl
// settings.aiContextMode → settings.aiProviderKeys[pid].contextMode
```

---

## Безопасность

- API-ключи хранятся в `electron-store` с `encryptionKey`
- Никогда не передавать ключи в renderer или WebView
- Логировать только ошибки, не тексты сообщений клиентов
- Опционально: режим без логов (для конфиденциальности)

---

## AI-агент Tool Use (v0.97.0+, Phase 0+1)

**Новый уровень над классическим AI-помощником.** Не заменяет существующее.

### Что добавилось в v0.97.0

Tool Use API — AI не просто генерирует текст, а **вызывает функции**:
- `goto_message` — открыть конкретное сообщение в чате (навигация)
- `get_chat_history` — прочитать N предыдущих сообщений для контекста
- `search_messages` — поиск по сообщениям

В Phase 2 добавятся write actions (`reply_to_message`, `mark_as_read`) с UI подтверждением.

### Scope: только Native режим

Tool Use работает **только** для сообщений из Native режима (TDLib). Сейчас это:
- `messengerId='native_cc'` (наш Telegram client через TDLib)

**В будущем** Native расширится на другие мессенджеры через их native API:
- WhatsApp Business API → `messengerId='native_wa_business'`
- VK API → `messengerId='native_vk_api'`
- и т.д.

**WebView мессенджеры (Telegram БНК / Telega Avtoliberty / ВК / WhatsApp Web / Макс)** —
Tool Use НЕ применяется. Юзер общается с клиентами через обычный AISidebar
(API mode или WebView mode — оба остаются как раньше).

### Связь с существующим AI-помощником

| Что | Где | Когда срабатывает |
|---|---|---|
| Классический AISidebar (Per-Provider API/WebView) | `AISidebar.jsx` | Юзер открыл правую панель → пишет вручную / получает 3 варианта ответа |
| Tool Use агент (v0.97.0+) | `main/ai/aiToolExecutor.js` через IPC `ai:agent:run` | Юзер кликает «🤖 Обработать» в Native уведомлении (UI в Phase 3) |

Оба используют **одних и тех же 4 провайдеров** (Anthropic / OpenAI / DeepSeek / ГигаЧат).
Tool Use требует `supportsTools: true` (в Phase 1 — все 4 поддерживают).

### Архитектура tool calls

См. [.memory-bank/ai-agent-plan/architecture.md](./ai-agent-plan/architecture.md) — три уровня:
1. **NotificationSource** — паспорт сообщения (откуда / от кого / messageId)
2. **Action Bus** — централизованный диспетчер в App.jsx (cross-tab listener)
3. **Tool Registry + Handlers** — реестр + реализация tools

### IPC каналы

См. [.memory-bank/api.md](./api.md) → раздел «AI-агент IPC (v0.97.0+, Phase 0+1)»:
- `ai:agent:run` — invoke с source, provider, model
- `ai:agent:cancel` — abort active loop
- `ai:agent:step` — streaming прогресса

### Что НЕ изменилось

- AISidebar.jsx, AIConfigPanel, AIProviderTabs — работают как раньше
- `ai:generate-stream` для классической генерации — работает как раньше
- `aiWebviewContext.js` для WebView mode передачи контекста — работает как раньше
- `partition="persist:ai-webview"` — работает как раньше
