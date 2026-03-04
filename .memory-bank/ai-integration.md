# ИИ-интеграция — ChatCenter

## Поддерживаемые провайдеры (v0.11.0)

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

## Режим WebView AI (v0.11.0)

### Назначение
Позволяет использовать веб-интерфейс AI-сервисов (с личной подпиской) вместо API-ключа.
Пресеты: ГигаЧат (`giga.chat`), ChatGPT (`chat.openai.com`), Claude (`claude.ai`), DeepSeek (`chat.deepseek.com`).

### Настройки
```js
settings.aiMode        // 'api' (по умолчанию) | 'webview'
settings.aiWebviewUrl  // URL AI-сервиса, по умолчанию 'https://gigachat.ru'
settings.aiContextMode // 'none' | 'last' (по умолчанию) | 'full'
```

### Разрешения на чтение чата (aiContextMode)
| Значение | Описание |
|----------|----------|
| `'none'` | Не передавать историю. Только ручной ввод в AI |
| `'last'` | Передать только последнее сообщение клиента (`lastMessage`) |
| `'full'` | Передать последние 10 сообщений из `chatHistory` |

### Вставка контекста в WebView AI (sendContextToAiWebview)
1. Формируем текст контекста согласно `aiContextMode`
2. Пробуем `webviewRef.executeJavaScript()` с несколькими CSS-селекторами:
   - `textarea`
   - `[contenteditable="true"]`
   - `#prompt-textarea` (ChatGPT)
   - `.chat-input textarea`
   - `[data-testid="message-input"]`
3. Если вставка удалась — показываем `✓ Вставлено в поле AI!`
4. Если не удалась — копируем в буфер через `navigator.clipboard.writeText()` → показываем `📋 Скопировано — вставьте Ctrl+V`

### WebView partition
`partition="persist:ai-webview"` — отдельная сессия от мессенджеров. Позволяет оставаться залогиненным в AI-сервисе между запусками.

---

## Безопасность

- API-ключи хранятся в `electron-store` с `encryptionKey`
- Никогда не передавать ключи в renderer или WebView
- Логировать только ошибки, не тексты сообщений клиентов
- Опционально: режим без логов (для конфиденциальности)
