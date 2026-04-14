# Telegram Updates — получение событий

Источник: https://core.telegram.org/api/updates

## Обзор

Telegram использует **server-push** модель: события отправляются клиенту сразу. Клиент НЕ опрашивает сервер.

## Получение updates

### Инициализация
- Клиент устанавливает соединение
- Вызывает `updates.getState` → начинает получать updates

### Безопасность
Игнорировать updates до завершения handshake (с нешифрованных соединений).

До логина допустимы только:
- `updateLoginToken` — QR login
- `updateSentPhoneCode` — SMS auth
- `updateDcOptions` — конфигурация DC
- `updateConfig` — server config
- Языковые пакеты

## Типы Updates

### Constructors
- `updateShort` — broadcast events, низкий приоритет
- `updateShortMessage` / `updateShortChatMessage` — оптимизированные сообщения
- `updates` / `updatesCombined` — полные пакеты с sequence tracking

## Sequence tracking

Три независимые последовательности:

1. **pts** — message box (private chats, basic groups)
2. **qts** — secret chats, bot updates
3. **seq** — общая последовательность

Каждый канал имеет отдельный `pts`.

## Логика применения

### pts validation
- `local_pts + pts_count === pts` → применить
- `local_pts + pts_count > pts` → игнорировать (уже применено)
- `local_pts + pts_count < pts` → gap, нужно восстановление

### seq validation
- `seq_start === 0` → применить сразу
- `local_seq + 1 === seq_start` → применить
- `local_seq + 1 > seq_start` → игнорировать дубли
- `local_seq + 1 < seq_start` → запросить пропущенные

## Gap recovery

### `updates.getDifference`
Для common/secret state. Лимит `1000-10000`.

### `updates.getChannelDifference`
Для каналов. Лимит `10-100`.

### Когда нужен recovery
- Запуск приложения
- Потеря синхронизации
- Потеря серверной сессии
- Ошибка десериализации
- Неполные updates
- 15+ минут без updates
- Серверный запрос через `updatesTooLong` / `updateChannelTooLong`

## Channel updates

Для активно просматриваемых каналов/супергрупп:
1. Вызывать `updates.getChannelDifference` периодически
2. Использовать `timeout` из ответа
3. Если `final=false` → сразу следующий вызов

## GramJS — event handling

```javascript
const { NewMessage, EditedMessage, DeletedMessage, ChatAction } = require("telegram/events");

// Новые сообщения
client.addEventHandler((event) => {
  console.log("New:", event.message);
}, new NewMessage({}));

// С фильтром
client.addEventHandler((event) => {
  console.log("From user:", event.message);
}, new NewMessage({ chats: ["username"], incoming: true }));

// Редактирования
client.addEventHandler((event) => {
  console.log("Edited:", event.message);
}, new EditedMessage({}));

// Удаления
client.addEventHandler((event) => {
  console.log("Deleted:", event.deletedIds);
}, new DeletedMessage({}));

// Действия в чате (typing и т.д.)
client.addEventHandler((event) => {
  console.log("Action:", event);
}, new ChatAction({}));
```

### Raw updates
```javascript
client.addEventHandler((update) => {
  console.log("Raw:", update.className);
});
// без передачи event builder → получаем ВСЕ updates
```

## Основные Update types (не полный список)

### Сообщения
- `updateNewMessage` — новое в private/basic
- `updateNewChannelMessage` — новое в канале/супергруппе
- `updateEditMessage` — редактирование
- `updateEditChannelMessage` — редактирование в канале
- `updateDeleteMessages` — удаление
- `updateDeleteChannelMessages` — удаление в канале
- `updateReadHistoryInbox` — прочитано (входящее)
- `updateReadHistoryOutbox` — прочитано (исходящее)
- `updateReadChannelInbox` / `updateReadChannelOutbox` — то же для каналов

### Присутствие
- `updateUserStatus` — online/offline
- `updateUserTyping` — печатает в private
- `updateChatUserTyping` — печатает в group
- `updateChannelUserTyping` — печатает в канале

### Реакции
- `updateMessageReactions` — реакции на сообщение
- `updateReadMessagesContents` — прочитано содержимое

### Чаты
- `updateChatParticipants` — изменился состав
- `updateChannel` — канал изменился
- `updateChannelTooLong` — много пропущено

### Профили
- `updateUserName` — изменилось имя
- `updateUserPhoto` — изменилось фото
- `updateUserPhone` — изменился телефон

### Контакты
- `updateContactsReset` — reset контактов

### Секретные чаты
- `updateEncryptedMessagesRead` — прочитано
- `updateEncryption` — новое/изменённое

### Звонки
- `updatePhoneCall` — звонок
- `updateGroupCall` — групповой звонок

### Боты
- `updateBotCallbackQuery` — нажатие inline-кнопки
- `updateInlineBotCallbackQuery` — inline callback

### Авторизация
- `updateNewAuthorization` — новый вход
- `updateLoginToken` — QR-токен обновлён

### Сервисные
- `updateConfig` — изменилась конфигурация
- `updateDcOptions` — обновление DC
- `updateServiceNotification` — уведомление от Telegram

## Восстановление состояния после старта

```javascript
// 1. Сохраняем state каждый раз
let localState = { pts: 0, qts: 0, date: 0, seq: 0 };

// 2. При старте — getState + getDifference
const state = await client.invoke(new Api.updates.GetState());
if (localState.pts > 0) {
  const diff = await client.invoke(new Api.updates.GetDifference({
    pts: localState.pts,
    date: localState.date,
    qts: localState.qts
  }));
  // применить diff.newMessages, diff.otherUpdates
}
```

GramJS делает всё это автоматически через `client.start()`.
