# VK — работа с сообщениями

## Основные методы `messages.*`

### messages.getConversations
Список диалогов.

```javascript
const result = await vk.api.messages.getConversations({
  offset: 0,
  count: 200,  // макс 200
  filter: 'all',  // 'all' | 'unread' | 'important' | 'unanswered'
  extended: 1,   // возвращать profiles + groups
  fields: 'photo_200,online,last_seen'
});

// result.count — общее число
// result.items — массив conversations
// result.profiles — профили пользователей
// result.groups — сообщества
```

Каждый `conversation`:
```javascript
{
  peer: {
    id: 123456,
    type: 'user' | 'chat' | 'group',
    local_id: 123456
  },
  last_message_id: 789,
  in_read: 789,
  out_read: 789,
  unread_count: 0,
  last_conversation_message_id: 789,
  can_write: { allowed: true },
  // для chat:
  chat_settings: {
    title: 'Название беседы',
    members_count: 5,
    photo: { photo_50, photo_100, photo_200 },
    pinned_message: { ... },
    admin_ids: [123, 456]
  }
}
```

### messages.getHistory
История сообщений.

```javascript
const history = await vk.api.messages.getHistory({
  peer_id: 123456789,
  count: 200,   // макс 200
  offset: 0,
  rev: 0,       // 0 = новые первыми (default), 1 = старые первыми
  extended: 1,
  fields: 'photo_200'
});
```

### messages.getById / messages.getByConversationMessageId
Получить сообщение по ID.

```javascript
const msgs = await vk.api.messages.getById({
  message_ids: [123, 456, 789]
});
```

### messages.send
Отправка.

```javascript
import { randomInt } from 'crypto';

await vk.api.messages.send({
  peer_id: 123456789,
  random_id: randomInt(-2147483648, 2147483647),  // обязательно!
  message: 'Привет!'
});
```

Все параметры:
```javascript
{
  peer_id: number,          // ID получателя
  peer_ids: number[],       // несколько получателей
  random_id: number,        // 32-bit int, защита от дублей
  message: string,          // текст
  attachment: string,       // 'photo-10_123,doc-10_456' (через запятую)
  forward_messages: number[],  // ID сообщений для forward
  forward: string,          // сложный forward (JSON)
  sticker_id: number,       // ID стикера
  payload: string,          // для ботов
  keyboard: object,         // клавиатура ботов
  template: object,         // карусели
  lat: number, long: number, // геолокация
  reply_to: number,         // ID сообщения для reply
  disable_mentions: 0 | 1,  // отключить упоминания
  silent: 0 | 1,            // без звука
  dont_parse_links: 0 | 1,  // не парсить ссылки в превью
  content_source: string    // идентификатор источника
}
```

### messages.edit
Редактирование.

```javascript
await vk.api.messages.edit({
  peer_id: 123456789,
  conversation_message_id: 42,  // или message_id
  message: 'Новый текст',
  keep_forward_messages: 1,
  keep_snippets: 1
});
```

### messages.delete
Удаление.

```javascript
await vk.api.messages.delete({
  message_ids: [123, 456],
  delete_for_all: 1,  // удалить для всех
  spam: 0
});
```

### messages.markAsRead
Пометить прочитанным.

```javascript
await vk.api.messages.markAsRead({
  peer_id: 123456789,
  start_message_id: 0
});
```

### messages.setActivity
Показать «печатает».

```javascript
await vk.api.messages.setActivity({
  peer_id: 123456789,
  type: 'typing'  // или 'audiomessage' | 'file' | 'photo' | 'video'
});
```

### messages.search / messages.searchConversations
Поиск.

```javascript
const results = await vk.api.messages.search({
  q: 'текст поиска',
  peer_id: 123456789,  // в конкретном чате
  count: 20
});

const conversations = await vk.api.messages.searchConversations({
  q: 'название чата',
  count: 20
});
```

### messages.getChat / messages.getConversationMembers
Для чатов (бесед).

```javascript
const chat = await vk.api.messages.getChat({ chat_id: 5 });
const members = await vk.api.messages.getConversationMembers({
  peer_id: 2000000005
});
```

### messages.createChat / addChatUser / removeChatUser
Создание и управление беседами.

```javascript
const chat = await vk.api.messages.createChat({
  user_ids: '123,456,789',
  title: 'Название'
});

await vk.api.messages.addChatUser({ chat_id: 5, user_id: 999 });
await vk.api.messages.removeChatUser({ chat_id: 5, member_id: 999 });
```

## Вложения — формат

Все attachments передаются строкой `тип{ownerId}_{id}`, через запятую:

- `photo-10_123` — фото (ownerId отрицательный = группа, положительный = пользователь)
- `video1_456` — видео
- `audio1_789` — аудио
- `doc1_42` — документ
- `wall-10_999` — пост стены
- `poll1_111` — опрос
- `sticker1_12345` — стикер
- `gift1_1` — подарок
- `market-10_5` — товар
- `audio_message1_123` — голосовое
- `graffiti1_456` — граффити

Пример множественных:
```javascript
attachment: 'photo-10_123,photo-10_124,doc1_42'
```

## Загрузка медиа через vk-io

```javascript
// Фото в сообщение (требует peer_id иногда)
const photo = await vk.upload.messagePhoto({
  source: { value: './photo.jpg' }
});
// photo.toString() → 'photo{ownerId}_{id}'

// Документ
const doc = await vk.upload.messageDocument({
  peer_id: 123456789,
  source: { value: './file.pdf', filename: 'файл.pdf' }
});

// Голосовое
const voice = await vk.upload.audioMessage({
  peer_id: 123456789,
  source: { value: './voice.ogg' }
});

// Граффити
const graffiti = await vk.upload.graffiti({
  peer_id: 123456789,
  source: { value: './graffiti.png' }
});

// Видео (отдельная логика)
const video = await vk.upload.video({
  source: { value: './video.mp4' },
  name: 'Название',
  is_private: 1
});

// Отправить сообщение с несколькими вложениями
await vk.api.messages.send({
  peer_id: 123456789,
  random_id: randomInt(-2147483648, 2147483647),
  attachment: [photo, doc].map(a => a.toString()).join(',')
});
```

## Ручная загрузка (без vk-io helper)

```javascript
// 1. Получить upload server
const { upload_url } = await vk.api.photos.getMessagesUploadServer({ peer_id });

// 2. Загрузить файл (multipart/form-data)
const form = new FormData();
form.append('photo', fs.createReadStream('./photo.jpg'));
const uploaded = await fetch(upload_url, { method: 'POST', body: form }).then(r => r.json());

// 3. Сохранить фото
const saved = await vk.api.photos.saveMessagesPhoto({
  photo: uploaded.photo,
  server: uploaded.server,
  hash: uploaded.hash
});

// 4. Использовать attachment
const attachment = `photo${saved[0].owner_id}_${saved[0].id}`;
```

## Получение вложений из сообщения

```javascript
sock.updates.on('message_new', (context) => {
  const { attachments } = context.message;
  for (const att of attachments) {
    // att.type: 'photo' | 'video' | 'audio' | 'doc' | 'sticker' | 'audio_message' | ...
    if (att.type === 'photo') {
      const url = att.photo.sizes.find(s => s.type === 'x')?.url;
      console.log('Photo:', url);
    }
    if (att.type === 'doc') {
      console.log('Doc:', att.doc.url);
    }
  }
});
```

## Удаление переписки

```javascript
// Удалить у себя историю с пользователем/чатом
await vk.api.messages.deleteConversation({
  peer_id: 123456789
});
```

## Закрепление

```javascript
// Закрепить сообщение
await vk.api.messages.pin({
  peer_id: 2000000005,
  message_id: 123
});

// Открепить
await vk.api.messages.unpin({ peer_id: 2000000005 });
```

## Ограничения

- `random_id` — 32-bit integer, обязателен для send
- Отправка фото в ЛС нужна `peer_id` при загрузке (может меняться)
- Rate limit: 3 req/sec user token, 20 req/sec group token
- Вложений в одном сообщении: до 10
- Длина сообщения: до 4096 символов
- Forward: до 100 сообщений
