# Telegram API — MTProto через GramJS

## Что это

**Telegram MTProto API** — официальный протокол Telegram для сторонних клиентов. Используется в Telegram Desktop, Telegram Web и любом полноценном клиенте.

**GramJS** (`telegram` npm) — TypeScript/JavaScript библиотека, реализующая MTProto. Node.js + браузер. MIT лицензия. Активно поддерживается.

## Регистрация приложения (один раз, бесплатно навсегда)

1. Открыть https://my.telegram.org
2. Ввести телефон → получить код в Telegram → авторизоваться
3. Нажать **API development tools**
4. Создать приложение «ЦентрЧатов»
5. Получить два значения (хранить в секрете):
   - `api_id` — число вида `1234567`
   - `api_hash` — строка вида `abc123def456...`

Эти креды — **навсегда**, для всех пользователей программы. Регистрация бесплатна.

## Установка

```bash
npm install telegram input
```

Требования: Node.js 14+

## Базовая авторизация

```javascript
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = 123456;
const apiHash = "123456abcdfg";
const stringSession = new StringSession(""); // пустая при первом входе

(async () => {
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.start({
    phoneNumber: async () => await input.text("Телефон: "),
    password: async () => await input.text("Пароль 2FA: "),
    phoneCode: async () => await input.text("Код из SMS: "),
    onError: (err) => console.log(err),
  });
  console.log(client.session.save()); // сохраняем для следующих запусков
  await client.sendMessage("me", { message: "Hello!" });
})();
```

**Session persistence**: `client.session.save()` возвращает строку с ключами. Сохраняем её — при следующем запуске передаём в `new StringSession(savedString)` и уже НЕ вводим телефон/код.

## Получение чатов

```javascript
const dialogs = await client.getDialogs({ limit: 100 });
for (const dialog of dialogs) {
  console.log(dialog.title, dialog.unreadCount, dialog.id.value);
}
```

## История сообщений

```javascript
const messages = await client.getMessages(chatId, { limit: 50 });
for (const msg of messages) {
  console.log(msg.senderId, msg.message, msg.date);
}
```

## Получение новых сообщений в реальном времени

```javascript
const { NewMessage } = require("telegram/events");

client.addEventHandler(async (event) => {
  const msg = event.message;
  console.log(`[${msg.chatId}] ${msg.senderId}: ${msg.message}`);
}, new NewMessage({}));
```

## Отправка

```javascript
// Текст
await client.sendMessage(chatId, { message: "Привет!" });

// Файл
await client.sendFile(chatId, { file: "./photo.jpg", caption: "Фото" });

// Ответ
await client.sendMessage(chatId, { message: "Ответ", replyTo: messageId });
```

## Файлы и вложения

См. [files.md](./files.md) для полной документации загрузки/скачивания.

## Обновления (events)

См. [updates.md](./updates.md) — как подписаться на все события и обработать gaps.

## Raw API вызовы

Для методов, которых нет в высокоуровневом API:

```javascript
const { Api } = require("telegram/tl");
const result = await client.invoke(
  new Api.channels.CheckUsername({ username: "testing" })
);
```

Все методы доступны через `Api.*` namespace.

## Ссылки

- Официальный сайт GramJS: https://gram.js.org/
- Telegram MTProto API: https://core.telegram.org/api
- Методы: https://core.telegram.org/methods
- Схема TL: https://core.telegram.org/schema

## См. также

- [auth.md](./auth.md) — полный flow авторизации (sendCode, signIn, 2FA, QR)
- [methods.md](./methods.md) — каталог методов по namespace
- [files.md](./files.md) — загрузка/скачивание файлов
- [updates.md](./updates.md) — получение событий и восстановление gaps
