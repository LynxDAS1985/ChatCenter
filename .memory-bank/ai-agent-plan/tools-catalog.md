# Каталог инструментов (Tools)

Все действия которые могут вызывать **юзер** (через UI) и **AI** (через tool_call).
Используется единый JSON Schema формат — совместим с Anthropic / OpenAI / DeepSeek.

## 🎯 Scope: только Native режим

Все tools работают **только** с `source.messengerId='native_*'`:
- ✅ `'native_cc'` (TDLib) — поддерживается сейчас
- 🔜 `'native_wa_business'`, `'native_vk_api'`, etc. — в Phase 5+

Если AI попытается вызвать tool с `messengerId='webview-*'` — handler возвращает
`{ ok: false, error: 'webview_messenger_not_supported' }` (защита от ошибочного scope).

## Группы инструментов

| Группа | Tools | Permission по умолчанию |
|---|---|---|
| **Navigation** | goto_message, switch_chat | auto |
| **Reading** | get_chat_history, search_messages, summarize_chat | auto (read-only) |
| **Writing** | reply_to_message, send_message | confirm |
| **Marking** | mark_as_read, mark_as_unread | confirm |
| **Tasks** | create_task, complete_task, list_tasks | confirm для create / auto для list |
| **Reminders** | schedule_reminder, cancel_reminder | confirm |
| **System** | get_user_info, set_status | auto / deny |

---

## Navigation

### goto_message

**Что**: Переключить активный чат на тот где сообщение, проскроллить к сообщению.

**JSON Schema**:
```json
{
  "name": "goto_message",
  "description": "Открыть конкретное сообщение в чате с прокруткой и подсветкой",
  "input_schema": {
    "type": "object",
    "required": ["source"],
    "properties": {
      "source": {
        "type": "object",
        "required": ["messengerId", "accountId", "chatId", "messageId"],
        "properties": {
          "messengerId": {"type": "string"},
          "accountId":   {"type": "string"},
          "chatId":      {"type": "string"},
          "messageId":   {"type": "string"},
          "threadId":    {"type": "string", "nullable": true}
        }
      }
    }
  }
}
```

**Permission**: 🟢 auto (безопасно — просто UI navigation)

**Эффект**: setActiveId + setActiveAccount + setActiveChat + scrollToMessage + flash

**Use case**: Юзер кликает «→ Перейти к чату» в уведомлении / AI решает показать связанное сообщение.

---

### switch_chat

**Что**: Переключиться на чат (без указания конкретного сообщения).

**JSON Schema**:
```json
{
  "name": "switch_chat",
  "description": "Переключить активный чат",
  "input_schema": {
    "type": "object",
    "required": ["accountId", "chatId"],
    "properties": {
      "accountId": {"type": "string"},
      "chatId":    {"type": "string"}
    }
  }
}
```

**Permission**: 🟢 auto

**Эффект**: setActiveAccount + setActiveChat

---

## Reading (read-only)

### get_chat_history

**Что**: Получить последние N сообщений из чата для контекста AI.

**JSON Schema**:
```json
{
  "name": "get_chat_history",
  "description": "Получить последние N сообщений из чата для анализа контекста",
  "input_schema": {
    "type": "object",
    "required": ["chatId"],
    "properties": {
      "chatId": {"type": "string"},
      "limit":  {"type": "integer", "minimum": 1, "maximum": 100, "default": 20},
      "beforeMessageId": {"type": "string", "description": "Пагинация назад"}
    }
  }
}
```

**Permission**: 🟢 auto (read-only)

**Возврат**: массив сообщений `{id, senderName, text, timestamp, isOutgoing}`

**Use case**: AI читает контекст перед генерацией ответа.

---

### search_messages

**Что**: Поиск по тексту сообщений в чате или глобально.

**JSON Schema**:
```json
{
  "name": "search_messages",
  "description": "Поиск сообщений по тексту",
  "input_schema": {
    "type": "object",
    "required": ["query"],
    "properties": {
      "query":     {"type": "string", "minLength": 2},
      "chatId":    {"type": "string", "description": "Если не указан — глобальный"},
      "accountId": {"type": "string"},
      "limit":     {"type": "integer", "default": 20, "maximum": 50}
    }
  }
}
```

**Permission**: 🟢 auto

**Возврат**: массив сообщений с подсветкой матча

**Use case**: AI ищет «когда раньше обсуждали скидку» в чате.

---

### summarize_chat

**Что**: Сводка по чату (последние N сообщений) — AI обрабатывает локально.

**JSON Schema**:
```json
{
  "name": "summarize_chat",
  "description": "Сводка содержания чата (что обсуждалось)",
  "input_schema": {
    "type": "object",
    "required": ["chatId"],
    "properties": {
      "chatId":   {"type": "string"},
      "lookback": {"type": "integer", "default": 50, "description": "Сколько последних сообщений учесть"}
    }
  }
}
```

**Permission**: 🟢 auto (но дорого по токенам, есть лимит)

**Возврат**: текстовая сводка

**Use case**: «AI, расскажи что обсуждали в этом чате последний час»

---

## Writing

### reply_to_message

**Что**: Отправить ответ на конкретное сообщение (reply-to).

**JSON Schema**:
```json
{
  "name": "reply_to_message",
  "description": "Отправить текстовый ответ как reply на сообщение",
  "input_schema": {
    "type": "object",
    "required": ["source", "text"],
    "properties": {
      "source": {"$ref": "#/definitions/NotificationSource"},
      "text":   {"type": "string", "minLength": 1, "maxLength": 4000},
      "parseMode": {"type": "string", "enum": ["plain", "markdown", "html"], "default": "plain"}
    }
  }
}
```

**Permission**: 🔴 **confirm обязательно**

**Эффект**: 
1. UI модалка: «AI предлагает отправить: '...' [✓ Отправить][✎ Изменить][✗ Отмена]»
2. После [Отправить] → TDLib.sendMessage с replyTo=source.messageId
3. Audit log: записан текст + чат + результат

**Use case**: Главный action для AI-агента — основной полезный эффект.

---

### send_message

**Что**: Отправить сообщение в чат (без привязки к конкретному сообщению).

**JSON Schema**: похожа на reply_to_message, но без обязательного `source.messageId`.

**Permission**: 🔴 **confirm обязательно**

**Use case**: AI начинает новый thread в чате.

---

## Marking

### mark_as_read

**Что**: Отметить сообщения как прочитанные.

**JSON Schema**:
```json
{
  "name": "mark_as_read",
  "description": "Отметить сообщения как прочитанные (всё до messageId)",
  "input_schema": {
    "type": "object",
    "required": ["chatId", "messageId"],
    "properties": {
      "chatId":    {"type": "string"},
      "messageId": {"type": "string"},
      "accountId": {"type": "string"}
    }
  }
}
```

**Permission**: 🟡 confirm (юзер настраивает — можно перевести в auto)

**Эффект**: TDLib viewMessages → счётчик непрочитанных уменьшается

**Use case**: AI «прочёл и обработал» уведомление → пометил.

---

### mark_as_unread

**Что**: Снять отметку прочитанного.

**Permission**: 🟡 confirm

**Use case**: «Не сейчас, потом отвечу» — AI помечает unread для возврата.

---

## Tasks

### create_task

**Что**: Создать задачу привязанную к сообщению.

**JSON Schema**:
```json
{
  "name": "create_task",
  "description": "Создать задачу с привязкой к сообщению",
  "input_schema": {
    "type": "object",
    "required": ["source", "title"],
    "properties": {
      "source":   {"$ref": "#/definitions/NotificationSource"},
      "title":    {"type": "string", "minLength": 1, "maxLength": 200},
      "details":  {"type": "string", "maxLength": 1000},
      "dueAt":    {"type": "string", "format": "date-time", "description": "ISO 8601"},
      "priority": {"type": "string", "enum": ["low", "medium", "high"]}
    }
  }
}
```

**Permission**: 🟡 confirm

**Эффект**: taskStore.create → задача в Tasks UI

**Use case**: «Перезвонить Ивану завтра в 10:00»

---

### list_tasks

**Что**: Список текущих задач.

**Permission**: 🟢 auto

**Use case**: AI смотрит «есть ли уже задача по этому клиенту»

---

### complete_task

**Что**: Отметить задачу выполненной.

**Permission**: 🟡 confirm

---

## Reminders

### schedule_reminder

**Что**: Запланировать повторное уведомление.

**JSON Schema**:
```json
{
  "name": "schedule_reminder",
  "description": "Запланировать повторное уведомление на указанное время",
  "input_schema": {
    "type": "object",
    "required": ["source", "remindAt"],
    "properties": {
      "source":   {"$ref": "#/definitions/NotificationSource"},
      "remindAt": {"type": "string", "format": "date-time"},
      "note":     {"type": "string", "maxLength": 500}
    }
  }
}
```

**Permission**: 🟡 confirm

**Эффект**: scheduler.add → при `remindAt` срабатывает повторное уведомление

**Use case**: «Напомни мне ответить через час»

---

### cancel_reminder

**Что**: Отменить напоминание.

**Permission**: 🟡 confirm

---

## System

### get_user_info

**Что**: Информация о текущем юзере (кто оператор).

**JSON Schema**:
```json
{
  "name": "get_user_info",
  "description": "Получить информацию о юзере",
  "input_schema": {"type": "object", "properties": {}}
}
```

**Permission**: 🟢 auto

**Возврат**: `{name, role, activeMessengers, settings}` (БЕЗ api keys!)

**Use case**: AI хочет понять контекст оператора.

---

### set_status

**Что**: Установить статус юзера (online/busy/away).

**Permission**: 🟡 confirm

**Use case**: «AI, поставь меня в busy на 2 часа»

---

## Запрещённые actions (deny-for-ai)

Эти actions **никогда** не выполнит AI. Только юзер вручную.

| Action | Почему запрещено для AI |
|---|---|
| `delete_message` | Необратимо, можно стереть важное |
| `leave_chat` | Юзер потеряет доступ |
| `block_user` | Социальные последствия |
| `clear_chat_history` | Необратимо |
| `change_settings` | Защита настроек |
| `set_api_key` | Безопасность |
| `export_data` | Утечка данных |

---

## NotificationSource — общий schema $ref

Все tools которые принимают `source` используют один schema:

```json
{
  "definitions": {
    "NotificationSource": {
      "type": "object",
      "required": ["messengerId", "accountId", "chatId", "messageId"],
      "properties": {
        "messengerId": {"type": "string"},
        "accountId":   {"type": "string"},
        "chatId":      {"type": "string"},
        "messageId":   {"type": "string"},
        "threadId":    {"type": "string", "nullable": true},
        "senderId":    {"type": "string"},
        "senderName":  {"type": "string"},
        "chatTitle":   {"type": "string"},
        "timestamp":   {"type": "number"},
        "textPreview": {"type": "string"}
      }
    }
  }
}
```

---

## Версионирование catalog

Когда добавляется новый tool — поле `version` в schema:
```json
{"name": "new_tool", "version": "1.0.0", ...}
```

Старые версии AI продолжают работать (backward compat).

---

## Расширения для Phase 4+

Потенциальные tools для будущего:

- `translate_message` — перевод
- `summarize_user_history` — сводка по конкретному отправителю
- `set_chat_filter` — фильтры
- `forward_to_chat` — переслать
- `add_to_template` — сохранить как шаблон ответа
- `detect_intent` — определить намерение (продажа / поддержка / вопрос)
- `extract_entities` — выделить из текста имя/телефон/email

Все добавляются runtime через `dispatcher.registerAction(...)` без изменений core.
