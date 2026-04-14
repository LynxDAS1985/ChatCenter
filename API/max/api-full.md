# MAX Bot API — полный справочник

Источник: https://dev.max.ru/docs-api

## Base URL
```
https://platform-api.max.ru
```

## Аутентификация
Заголовок: `Authorization: <bot_token>`

⚠️ Query-параметр `access_token` устарел, не использовать.

---

## Bots

### `GET /me`
Информация о боте.

**Ответ** (`BotInfo`):
```json
{
  "user_id": 123,
  "first_name": "ChatCenterBot",
  "last_name": null,
  "username": "chatcenter_bot",
  "is_bot": true,
  "avatar_url": "https://...",
  "full_avatar_url": "https://...",
  "name": "ChatCenter Bot",
  "description": "Описание",
  "commands": [
    { "name": "start", "description": "Запустить" },
    { "name": "help", "description": "Помощь" }
  ]
}
```

### `PATCH /me`
Изменить информацию бота (name, description, commands).

---

## Chats

### `GET /chats`
Все групповые чаты где бот.

**Query**: `count` (до 50), `marker`

**Ответ** (`ChatList`):
```json
{
  "chats": [{
    "chat_id": 12345,
    "type": "chat" | "dialog" | "channel",
    "status": "active" | "removed" | ...,
    "title": "Название",
    "icon": { "url": "..." },
    "last_event_time": 1733000000,
    "participants_count": 5,
    "owner_id": 789,
    "is_public": false,
    "link": "https://max.ru/...",
    "description": "...",
    "dialog_with_user": null  // или User для dialog
  }],
  "marker": 12345
}
```

### `GET /chats/{chatId}`
Детали чата.

### `PATCH /chats/{chatId}`
Изменить:
```json
{
  "title": "Новое название",
  "icon": { "url": "https://..." },
  "notify": true
}
```

### `DELETE /chats/{chatId}`
Удалить чат (только владелец).

### `POST /chats/{chatId}/actions`
Показать действие бота.
```json
{ "action": "typing_on" | "sending_photo" | "sending_video" | "sending_audio" | "sending_file" | "mark_seen" }
```

### `GET/PUT/DELETE /chats/{chatId}/pin`
Закреплённое сообщение.

**PUT** body:
```json
{ "message_id": "...", "notify": true }
```

### Members

#### `GET /chats/{chatId}/members/me`
Информация о членстве бота.

#### `DELETE /chats/{chatId}/members/me`
Выйти из чата.

#### `GET /chats/{chatId}/members/admins`
Админы чата.

#### `POST /chats/{chatId}/members/admins`
Назначить админа:
```json
{
  "admins": [{
    "user_id": 123,
    "permissions": ["read_all_messages", "add_remove_members", "add_admins", "change_chat_info", "pin_message", "write"]
  }]
}
```

#### `DELETE /chats/{chatId}/members/admins/{userId}`
Снять.

#### `GET /chats/{chatId}/members`
Все участники.

**Query**: `user_ids`, `count`, `marker`

#### `POST /chats/{chatId}/members`
Добавить:
```json
{ "user_ids": [123, 456] }
```

#### `DELETE /chats/{chatId}/members`
Удалить:

**Query**: `user_id=123` + `block=false`

---

## Messages

### `GET /messages`
Получение сообщений чата.

**Query**:
- `chat_id` или `user_id` (для dialog)
- `message_ids` — конкретные ID (до 100)
- `from` — timestamp start
- `to` — timestamp end
- `count` — до 50

**Ответ** (`MessageList`):
```json
{
  "messages": [{
    "sender": { "user_id": 123, "name": "Иван", "username": "...", "is_bot": false, "last_activity_time": 1733000000 },
    "recipient": { "chat_id": 12345, "chat_type": "chat", "user_id": null },
    "timestamp": 1733000000,
    "link": null,
    "body": {
      "mid": "abc123",
      "seq": 1,
      "text": "Привет!",
      "attachments": [],
      "markup": []
    },
    "stat": null,
    "url": null
  }]
}
```

### `POST /messages`
Отправить.

**Query**: `chat_id` или `user_id`, `disable_link_preview`

**Body** (`NewMessageBody`):
```json
{
  "text": "Текст",
  "format": "markdown" | "html",
  "attachments": [],
  "link": { "type": "reply" | "forward", "mid": "..." },
  "notify": true
}
```

Типы attachments:
- `image`, `video`, `audio`, `file` — через `payload.token` (от upload)
- `contact` — `payload.vcfInfo` или `payload.contact_id`
- `sticker` — `payload.code`
- `location` — `payload.latitude, longitude`
- `inline_keyboard` — `payload.buttons[][]`
- `share` — поделиться

### `PUT /messages`
Редактировать.

**Query**: `message_id`

**Body**: как `NewMessageBody` (text, attachments, notify)

### `DELETE /messages`
Удалить.

**Query**: `message_id`

### `GET /messages/{messageId}`
Конкретное сообщение.

---

## Uploads

### `POST /uploads?type={type}`
Загрузка файла. Получаем upload URL.

**Query** `type`:
- `image` — картинка (до 10 МБ)
- `video` — видео (до 1 ГБ)
- `audio` — аудио
- `file` — произвольный файл (до 2 ГБ)

**Ответ**:
```json
{ "url": "https://upload.max.ru/..." }
```

### POST на полученный URL
multipart/form-data с полем `file`.

**Ответ содержит `token`**, который используется в `attachments`:
```json
{ "type": "image", "payload": { "token": "abc123..." } }
```

---

## Subscriptions (Webhooks)

### `GET /subscriptions`
Активные подписки.

### `POST /subscriptions`
Подписаться:
```json
{
  "url": "https://myserver.com/webhook",
  "update_types": ["message_created", "message_callback", "bot_added", "bot_removed"],
  "version": "0.1.0"
}
```

**update_types**:
- `message_created` — новое сообщение
- `message_edited` — отредактировано
- `message_removed` — удалено
- `message_callback` — нажата callback-кнопка
- `message_chat_created` — создан чат из сообщения
- `bot_added` — бот добавлен в чат
- `bot_removed` — бот удалён
- `user_added` — добавлен пользователь
- `user_removed` — удалён
- `chat_title_changed` — изменено название

### `DELETE /subscriptions?url=...`
Отписаться.

---

## Updates (Long Polling)

### `GET /updates`
Получить обновления (альтернатива webhook).

**Query**:
- `limit` — 1–1000 (default 100)
- `timeout` — 0–90 сек (default 30)
- `marker` — с какого update начинать
- `types` — фильтр типов (`message_created,message_callback,...`)

**Ответ** (`UpdateList`):
```json
{
  "updates": [
    {
      "update_type": "message_created",
      "timestamp": 1733000000,
      "message": { ...Message },
      "user_locale": "ru"
    },
    {
      "update_type": "message_callback",
      "timestamp": 1733000000,
      "callback": {
        "timestamp": 1733000000,
        "callback_id": "...",
        "payload": "yes",
        "user": { "user_id": 123, ... }
      },
      "message": { ... }
    }
  ],
  "marker": 999
}
```

---

## Answers

### `POST /answers?callback_id={callback_id}`
Ответ на callback кнопки.

**Body**:
```json
{
  "message": {
    "text": "Принято!",
    "attachments": [],
    "notify": false,
    "format": "markdown"
  },
  "notification": "Спасибо!"
}
```

---

## Videos

### `GET /videos/{videoToken}`
Информация о видео.

**Ответ**:
```json
{
  "urls": {
    "mp4_1080": "https://...",
    "mp4_720": "https://...",
    "mp4_480": "https://..."
  },
  "thumbnail": { "url": "..." },
  "width": 1920,
  "height": 1080,
  "duration": 60
}
```

---

## Rate Limits

- **30 req/sec** на базовый URL
- При превышении — код 429 + `Retry-After` header

## Error Response

```json
{
  "code": "error.code",
  "message": "Описание",
  "data": null
}
```

Коды ошибок:
- `not.found` — 404
- `access.denied` — 401/403
- `validation.failed` — 400
- `too.many.requests` — 429
- `proto.payload` — несоответствие протокола

## Полный TypeScript-клиент (наш план)

Своя обёртка — всего ~200 строк, т.к. API простой REST + JSON.

```typescript
class MaxBotClient {
  constructor(private token: string) {}

  private async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`https://platform-api.max.ru${path}`, {
      ...init,
      headers: {
        'Authorization': this.token,
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  }

  getMe() { return this.call('/me'); }

  getChats(params?: { count?: number; marker?: number }) {
    const qs = new URLSearchParams(params as any).toString();
    return this.call(`/chats?${qs}`);
  }

  sendMessage(params: { chat_id?: number; user_id?: number }, body: any) {
    const qs = new URLSearchParams(params as any).toString();
    return this.call(`/messages?${qs}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async *longPoll(types?: string[]) {
    let marker = 0;
    while (true) {
      const qs = new URLSearchParams({
        marker: String(marker),
        timeout: '30',
        ...(types && { types: types.join(',') })
      }).toString();
      const { updates, marker: newMarker } = await this.call(`/updates?${qs}`);
      marker = newMarker;
      for (const u of updates) yield u;
    }
  }
}

// Использование
const client = new MaxBotClient('BOT_TOKEN');
const me = await client.getMe();

for await (const update of client.longPoll(['message_created'])) {
  if (update.update_type === 'message_created') {
    const msg = update.message;
    await client.sendMessage(
      { user_id: msg.sender.user_id },
      { text: 'Эхо: ' + msg.body.text }
    );
  }
}
```
