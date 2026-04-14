# Telegram API Methods — Каталог по namespace

Источник: https://core.telegram.org/methods

## auth — Аутентификация
- `auth.sendCode` — отправить код верификации
- `auth.signIn` — вход по коду
- `auth.signUp` — регистрация нового аккаунта
- `auth.checkPassword` — проверка 2FA пароля
- `auth.logOut` — выход
- `auth.exportLoginToken` — создать QR-токен
- `auth.acceptLoginToken` — принять QR с другого устройства

## messages — Чаты и сообщения
- `messages.sendMessage` — отправить текст
- `messages.editMessage` — редактировать отправленное
- `messages.deleteMessages` — удалить
- `messages.getHistory` — история чата
- `messages.createChat` — создать группу
- `messages.addChatUser` — добавить в группу
- `messages.sendReaction` — реакция на сообщение
- `messages.getAvailableReactions` — список доступных реакций
- `messages.forwardMessages` — переслать
- `messages.sendMedia` — отправить медиа
- `messages.sendMultiMedia` — альбом (до 10 элементов)
- `messages.readHistory` — пометить прочитанным
- `messages.setTyping` — показать «печатает»
- `messages.getMessages` — получить по ID
- `messages.search` — поиск

## contacts — Контакты
- `contacts.getContacts` — список
- `contacts.importContacts` — добавить
- `contacts.deleteContacts` — удалить
- `contacts.exportContactToken` — временная ссылка на профиль

## channels — Каналы и супергруппы
- `channels.createChannel` — создать
- `channels.editTitle` — переименовать
- `channels.editPhoto` — обновить аватар
- `channels.getMessages` — пост канала
- `channels.editAdmin` — админские права
- `channels.inviteToChannel` — пригласить
- `channels.readHistory` — пометить прочитанным
- `channels.joinChannel` / `channels.leaveChannel`

## account — Настройки аккаунта
- `account.updateProfile` — изменить имя/bio
- `account.updateStatus` — online/offline
- `account.getPassword` — параметры 2FA
- `account.changeAuthorizationSettings` — настройки сессий
- `account.updateNotifySettings` — уведомления

## users — Информация о пользователях
- `users.getUsers` — профили пачкой
- `users.getFullUser` — полный профиль

## upload — Файлы
- `upload.saveFilePart` — загрузить часть (< 10MB файл)
- `upload.saveBigFilePart` — загрузить часть (> 10MB)
- `upload.getFile` — скачать

## help — Система
- `help.getConfig` — конфигурация серверов
- `help.getAppUpdate` — проверка обновлений
- `help.getNearestDc` — ближайший DC

## payments — Платежи / Stars
- `payments.getStarsStatus` — баланс Stars
- `payments.sendStarsForm` — платёж
- `payments.getStarGifts` — подарки

## stories — Истории
- `stories.sendStory` — загрузить
- `stories.deleteStories` — удалить
- `stories.readStories` — отметить просмотренными

## updates — События
- `updates.getDifference` — восстановить пропущенные
- `updates.getChannelDifference` — для каналов
- `updates.getState` — текущее состояние

## photos — Фото профилей
- `photos.uploadProfilePhoto` — загрузить аватар
- `photos.deletePhotos` — удалить фото

---

## Использование через GramJS

**Высокоуровневые методы** (рекомендуется):
```javascript
await client.sendMessage(chat, { message: "Hi" });
await client.getDialogs({ limit: 100 });
await client.getMessages(chat, { limit: 50 });
```

**Прямой вызов** (для специфичных методов):
```javascript
const { Api } = require("telegram/tl");
const result = await client.invoke(new Api.messages.SendMessage({
  peer: chat,
  message: "Hi",
  randomId: BigInt(Math.random() * 1e18)
}));
```
