# VK API — через vk-io

## Что это

**VK API** — официальный REST API ВКонтакте. Документация: https://dev.vk.com.

**vk-io** — TypeScript SDK для VK API на Node.js. MIT, активная поддержка.
Сайт: https://negezor.github.io/vk-io/

## Легальность

✅ **Полностью легально**. VK сам документирует и поддерживает API. Никаких банов.

## Регистрация приложения (бесплатно)

1. Открыть https://dev.vk.com
2. **Мои приложения** → **Создать приложение**
3. Тип: **Standalone-приложение** (для пользовательского API)
4. Получить `app_id`

Для пользователя (Implicit Flow OAuth):
```
https://oauth.vk.com/authorize?client_id={APP_ID}&display=page&redirect_uri=https://oauth.vk.com/blank.html&scope=messages,friends,offline,groups,notify&response_type=token&v=5.199
```

После логина в URL редиректа будет `access_token`. Сохраняем.

## Установка

Требования: Node.js **12.20.0+**

```bash
npm install vk-io
# или
yarn add vk-io
# или
pnpm add vk-io
```

## Базовое использование

```javascript
import { VK } from 'vk-io';

const vk = new VK({
  token: process.env.VK_TOKEN,
  apiVersion: '5.199'
});

// Вызов метода
const users = await vk.api.users.get({ user_ids: [1, 2, 3] });
console.log(users);
```

## Авторизация пользователя

```javascript
// User token (полный доступ)
const vk = new VK({
  token: 'USER_TOKEN'
});

// Group token (бот группы)
const vk = new VK({
  token: 'GROUP_TOKEN'
});
```

vk-io автоматически определяет тип токена.

## Возможности

- **100% покрытие VK API** — маппинг 1:1 (`vk.api.users.get()`)
- **TypeScript**
- **ESM native**
- **Прокси** через custom agents
- **Автоматическая параллелизация** (combines methods в execute, до 25/запрос)
- **User authorization** (login/password flow — осторожно, может ловить captcha)
- **Rate limit** — 3 req/sec для user, 20 req/sec для group

## Режимы API

```javascript
const vk = new VK({ token, apiMode: 'sequential' });
// варианты:
// 'sequential' — по одному запросу
// 'parallel' — через execute до 25/req
// 'parallel_selected' — execute только для указанных
```

## Получение диалогов (список чатов)

```javascript
const conversations = await vk.api.messages.getConversations({
  offset: 0,
  count: 100,
  filter: 'all'  // 'all' | 'unread' | 'important' | 'unanswered'
});
// conversations.items — массив диалогов
// conversations.profiles — профили упомянутых пользователей
// conversations.groups — упомянутые группы
```

## История сообщений

```javascript
const history = await vk.api.messages.getHistory({
  peer_id: 123456789,  // user_id / 2000000000+chat_id / -group_id
  count: 50,
  offset: 0,
  rev: 0  // 0 = от новых к старым, 1 = от старых к новым
});
```

## Отправка сообщения

```javascript
import { randomInt } from 'crypto';

await vk.api.messages.send({
  peer_id: 123456789,
  random_id: randomInt(-2147483648, 2147483647),  // обязательно!
  message: 'Привет!'
});
```

`random_id` **обязателен** — защита от дублей.

## Отправка с вложением

```javascript
// Сначала загрузить
const photo = await vk.upload.messagePhoto({
  source: { value: './photo.jpg' }
});
// photo.toString() — например 'photo123_456'

await vk.api.messages.send({
  peer_id: 123456789,
  random_id: randomInt(-2147483648, 2147483647),
  attachment: photo.toString()
});
```

## Получение новых сообщений (Long Poll)

```javascript
// Bots Long Poll (для группы)
vk.updates.on('message_new', async (context) => {
  console.log('От:', context.senderId);
  console.log('Текст:', context.text);
  await context.send('Получено!');
});

await vk.updates.start();

// User Long Poll (для личного аккаунта)
await vk.updates.startPolling();
```

Подробнее о событиях — [updates.md](./updates.md).

## Peer ID

| Диапазон | Что это |
|---|---|
| положительное число | User ID |
| `2000000000 + chat_id` | Групповой чат |
| отрицательное число | Group/Community |

```javascript
// Пользователь ID=123456
peer_id: 123456

// Группа ID=789 (в группы пишет пользователь)
peer_id: -789

// Беседа ID=5
peer_id: 2000000005
```

## Загрузка файлов

```javascript
// Фото в сообщение
const photo = await vk.upload.messagePhoto({
  source: { value: './photo.jpg' }
});

// Документ в сообщение
const doc = await vk.upload.messageDocument({
  peer_id: 123456,
  source: { value: './file.pdf', filename: 'файл.pdf' }
});

// Голосовое
const voice = await vk.upload.audioMessage({
  peer_id: 123456,
  source: { value: './voice.ogg' }
});
```

## Все методы

См. [methods.md](./methods.md) и https://dev.vk.com/ru/method

Основные namespaces:
- `users` — пользователи
- `messages` — сообщения (главное для нас)
- `friends` — друзья
- `groups` — сообщества
- `wall` — стена
- `photos`, `video`, `audio`, `docs` — медиа
- `newsfeed` — лента
- `notifications` — уведомления
- `utils` — утилиты (shortenLink, etc.)

## Ошибки

```javascript
import { APIError } from 'vk-io';

try {
  await vk.api.messages.send({...});
} catch (e) {
  if (e instanceof APIError) {
    console.log('VK error:', e.code, e.message);
    // e.code = 9  — flood control
    // e.code = 100 — один из параметров невалиден
    // e.code = 15  — access denied
    // e.code = 901 — user has blocked messages from group
  }
}
```

## См. также

- [auth.md](./auth.md) — авторизация и токены
- [messages.md](./messages.md) — полная работа с сообщениями
- [updates.md](./updates.md) — Long Poll / Callback / User Long Poll
- [methods.md](./methods.md) — каталог методов

## Ссылки

- https://dev.vk.com — официальная документация API
- https://negezor.github.io/vk-io — vk-io docs
- https://github.com/negezor/vk-io — исходники
