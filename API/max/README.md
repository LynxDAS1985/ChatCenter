# MAX Bot API

## ⭐ Важно: MAX имеет ОФИЦИАЛЬНЫЙ API (это находка!)

У MAX есть официальный HTTPS REST API для ботов. Документация: https://dev.max.ru/docs-api.

**Это Bot API** (не клиентский) — работает ТОЛЬКО как бот от имени сервисного аккаунта, не от имени обычного пользователя. Но это **легально и бесплатно**.

## Что даёт Bot API

- Получение сообщений адресованных боту
- Отправка сообщений пользователям которые написали боту первыми
- Управление групповыми чатами где бот участник
- Загрузка файлов, кнопки, inline клавиатура

## Что НЕ даёт Bot API

- ❌ Читать чужую переписку (это личные чаты пользователей)
- ❌ Писать пользователю пока он НЕ написал боту (антиспам)
- ❌ Доступ к истории до того как бот был добавлен

## Регистрация (бесплатно)

1. Открыть https://dev.max.ru
2. Для регистрации бота — связаться через https://partners.max.ru
3. Пройти верификацию организации (ИП/юр.лицо РФ)
4. Получить токен бота

**Ограничение**: только для бизнесов РФ (ИП или юр.лицо).

## Базовые параметры

- **База URL**: `https://platform-api.max.ru`
- **Auth**: заголовок `Authorization: <token>` (query-параметр больше не поддерживается)
- **Формат**: JSON
- **Rate limit**: **30 запросов/сек**
- **Webhooks**: только HTTPS (не HTTP)
- **Long Polling**: для разработки

## HTTP коды

| Код | Значение |
|---|---|
| 200 | Успех |
| 400 | Неверный запрос |
| 401 | Ошибка аутентификации |
| 404 | Не найдено |
| 405 | Метод не разрешён |
| 429 | Превышен лимит (30 rps) |
| 503 | Сервис недоступен |

## Endpoint structure

### Bots
- `GET /me` — информация о боте

### Subscriptions
- `GET /subscriptions` — подписки
- `POST /subscriptions` — подписаться на webhooks
- `DELETE /subscriptions` — отписаться
- `GET /updates` — получить обновления (long polling)

### Messages
- `GET /messages` — получение сообщений
- `POST /messages` — отправить
- `PUT /messages` — редактировать
- `DELETE /messages` — удалить
- `GET /messages/{messageId}` — конкретное сообщение

### Chats
- `GET /chats` — список групповых чатов
- `GET /chats/{chatId}` — информация о чате
- `PATCH /chats/{chatId}` — изменить (название/описание)
- `DELETE /chats/{chatId}` — удалить
- `POST /chats/{chatId}/actions` — действие бота (typing)
- `GET /chats/{chatId}/pin` — закреплённое сообщение
- `PUT /chats/{chatId}/pin` — закрепить
- `DELETE /chats/{chatId}/pin` — открепить
- `GET /chats/{chatId}/members/me` — информация о членстве бота
- `DELETE /chats/{chatId}/members/me` — удалить бота из чата
- `GET /chats/{chatId}/members/admins` — админы
- `POST /chats/{chatId}/members/admins` — назначить админом
- `DELETE /chats/{chatId}/members/admins/{userId}` — снять
- `GET /chats/{chatId}/members` — участники
- `POST /chats/{chatId}/members` — добавить участников
- `DELETE /chats/{chatId}/members` — удалить участника

### Uploads
- `POST /uploads` — загрузка файлов

### Other
- `GET /videos/{videoToken}` — информация о видео
- `POST /answers` — ответ на callback кнопки

## Примеры

### Получить info о боте
```bash
curl -H "Authorization: YOUR_BOT_TOKEN" \
  https://platform-api.max.ru/me
```

### Отправить сообщение
```bash
curl -X POST \
  -H "Authorization: YOUR_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": 123456,
    "text": "Привет!",
    "format": "markdown"
  }' \
  https://platform-api.max.ru/messages
```

### Long Polling (для разработки)
```javascript
async function pollUpdates(token, marker = 0) {
  const url = `https://platform-api.max.ru/updates?marker=${marker}&timeout=30`;
  const response = await fetch(url, {
    headers: { 'Authorization': token }
  });
  const data = await response.json();

  for (const update of data.updates) {
    // update.update_type: 'message_created' | 'message_edited' | 'message_removed' | etc.
    console.log(update);
  }

  // Продолжить с новым marker
  await pollUpdates(token, data.marker);
}

pollUpdates('YOUR_BOT_TOKEN');
```

### Webhook (для продакшена)
```javascript
// Подписка
await fetch('https://platform-api.max.ru/subscriptions', {
  method: 'POST',
  headers: {
    'Authorization': BOT_TOKEN,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://mybackend.com/max-webhook'
  })
});

// На сервере
app.post('/max-webhook', (req, res) => {
  const update = req.body;
  console.log(update);
  res.sendStatus(200);
});
```

## Форматирование текста

Сообщения поддерживают **Markdown** и **HTML** через `format`:

```json
{
  "chat_id": 123,
  "text": "*Жирный* _курсив_ [ссылка](https://max.ru)",
  "format": "markdown"
}
```

или HTML:
```json
{
  "chat_id": 123,
  "text": "<b>Жирный</b> <i>курсив</i> <a href='https://max.ru'>ссылка</a>",
  "format": "html"
}
```

## Inline-клавиатура

- Макс **210 кнопок** в **30 рядах**
- По 7 кнопок в ряд (3 для link/geo/contact)

Типы кнопок:
- `callback` — кнопка с payload, вызывает callback
- `link` — открывает URL
- `request_contact` — запрос контакта
- `request_geo_location` — запрос геолокации
- `open_app` — открыть мини-приложение
- `message` — отправить текст как сообщение
- `clipboard` — скопировать в буфер

Пример:
```json
{
  "chat_id": 123,
  "text": "Выберите:",
  "attachments": [{
    "type": "inline_keyboard",
    "payload": {
      "buttons": [[
        { "type": "callback", "text": "Да", "payload": "yes" },
        { "type": "callback", "text": "Нет", "payload": "no" }
      ], [
        { "type": "link", "text": "Сайт", "url": "https://max.ru" }
      ]]
    }
  }]
}
```

## Типы данных

Основные объекты:
- `User` — пользователь (user_id, first_name, last_name, username, avatar_url, full_avatar_url, is_bot)
- `Chat` — чат (chat_id, type, title, ...)
- `Message` — сообщение (message_id, sender, timestamp, body, ...)
- `NewMessageBody` — параметры отправки
- `Update` — событие

## Библиотеки

### Node.js
Официальной нет. Используем fetch напрямую или можно написать тонкий wrapper.

### Go, Python
Сторонние клиенты на GitHub (поиск «max-bot-api»).

## ChatCenter — стратегия для MAX

**Проблема**: Bot API не даёт доступ к пользовательской переписке. Нельзя использовать для личных чатов.

**Решение**:
- Для **бизнес-аккаунтов** (клиент написал боту) — Bot API работает полностью
- Для **личных чатов** пользователя — оставляем WebView (текущий подход)

## См. также

- [api-full.md](./api-full.md) — полный API reference
- https://dev.max.ru/docs-api — официальная документация
- https://partners.max.ru — регистрация бизнеса
