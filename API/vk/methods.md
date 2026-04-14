# VK API — каталог методов по namespace

Полный список: https://dev.vk.com/ru/method

## account — аккаунт
- `account.getInfo` / `getProfileInfo` — информация
- `account.setOnline` / `setOffline` — статус
- `account.registerDevice` — push
- `account.getCounters` — счётчики непрочитанного

## messages — сообщения ⭐
- `messages.send` — отправить
- `messages.edit` — редактировать
- `messages.delete` — удалить
- `messages.getById` — по ID
- `messages.getByConversationMessageId` — по conv message ID
- `messages.getConversations` — список диалогов
- `messages.getConversationsById` — конкретные диалоги
- `messages.getHistory` — история
- `messages.getHistoryAttachments` — вложения из истории
- `messages.markAsRead` — прочитать
- `messages.markAsImportant` — важное
- `messages.setActivity` — typing
- `messages.search` — поиск сообщений
- `messages.searchConversations` — поиск диалогов
- `messages.createChat` — создать беседу
- `messages.getChat` — инфо беседы
- `messages.editChat` — переименовать
- `messages.addChatUser` — добавить в беседу
- `messages.removeChatUser` — удалить из беседы
- `messages.getConversationMembers` — участники беседы
- `messages.pin` — закрепить
- `messages.unpin` — открепить
- `messages.deleteConversation` — очистить историю
- `messages.restore` — восстановить удалённое
- `messages.getInviteLink` — ссылка на беседу
- `messages.sendMessageEventAnswer` — для callback кнопок

## users — пользователи
- `users.get` — профили по ID
- `users.search` — поиск
- `users.getFollowers` — подписчики
- `users.getSubscriptions` — подписки

## friends — друзья
- `friends.get` — список друзей
- `friends.getRequests` — заявки
- `friends.add` — добавить
- `friends.delete` — удалить
- `friends.search` — поиск в друзьях
- `friends.areFriends` — проверить дружбу

## groups — сообщества
- `groups.get` / `groups.getById` — сообщества пользователя
- `groups.isMember` — участник?
- `groups.join` / `leave` — вступить/покинуть
- `groups.getMembers` — участники
- `groups.search` — поиск
- `groups.getLongPollServer` — для Bots Long Poll

## photos — фото
- `photos.get` / `getAll` — фото пользователя
- `photos.getById` — по ID
- `photos.getMessagesUploadServer` — upload URL для ЛС
- `photos.saveMessagesPhoto` — сохранить после upload
- `photos.getWallUploadServer` / `saveWallPhoto` — для стены
- `photos.delete` — удалить

## video — видео
- `video.get` / `getById` — видео
- `video.save` — upload server для видео
- `video.add` / `delete` — добавить/удалить

## audio — аудио
- ⚠️ Ограничено после 2016. Большинство методов недоступно без специального разрешения.

## docs — документы
- `docs.get` — список
- `docs.getById`
- `docs.getMessagesUploadServer` / `docs.save` — upload
- `docs.delete`

## wall — стена
- `wall.get` — посты
- `wall.post` / `repost` / `edit` / `delete` — CRUD
- `wall.getComments` — комментарии
- `wall.createComment` / `editComment` / `deleteComment`

## board — обсуждения сообществ
- `board.getTopics` / `getComments`
- `board.addTopic` / `createComment`

## market — товары
- `market.get` / `getById` / `search`
- `market.add` / `edit` / `delete`

## polls — опросы
- `polls.getById` — опрос по ID
- `polls.addVote` / `deleteVote` — голосование
- `polls.create` / `edit`

## stories — истории
- `stories.get` / `getById`
- `stories.delete`
- `stories.getReplies` / `getViewers`

## newsfeed — лента
- `newsfeed.get` — лента
- `newsfeed.getRecommended` — рекомендации
- `newsfeed.search` — поиск
- `newsfeed.addBan` / `deleteBan` — скрыть источник

## notifications — уведомления
- `notifications.get` — список
- `notifications.markAsViewed` — просмотрено

## likes — лайки
- `likes.add` / `delete`
- `likes.getList` — кто лайкнул
- `likes.isLiked`

## utils — утилиты
- `utils.resolveScreenName` — ID по screen_name
- `utils.getShortLink` / `getLinkStats` — короткие ссылки
- `utils.getServerTime` — время сервера

## auth — авторизация
- `auth.logout` — выход

## storage — key-value storage
- `storage.get` / `set` / `getKeys` — до 1000 пар
- `storage.getCounters` — счётчики

## apps — приложения
- `apps.get` / `getCatalog` / `getFriendsList`

## ads — реклама (требует спец. права)

## gifts — подарки
- `gifts.get` — список полученных

## secure — серверные методы (требует service token)

---

## Использование в vk-io

Любой метод вызывается как `vk.api.{namespace}.{method}(params)`:

```javascript
await vk.api.users.get({ user_ids: [1, 2, 3], fields: 'photo_200' });
await vk.api.messages.send({ peer_id, random_id, message });
await vk.api.groups.getById({ group_ids: 'apiclub' });
await vk.api.photos.getAll({ owner_id: 1, count: 10 });
```

## Batch через execute

vk-io автоматически объединяет до 25 запросов в один `execute`:

```javascript
const vk = new VK({ token, apiMode: 'parallel' });

// Все три отправятся одним запросом
const [me, friends, photos] = await Promise.all([
  vk.api.users.get({}),
  vk.api.friends.get({}),
  vk.api.photos.getAll({ owner_id: 1 })
]);
```

## Rate limits

- User token: **3 req/sec**
- Group token: **20 req/sec**
- Error 6: «Too many requests» — нужно retry с задержкой
- vk-io автоматически retry + ставит в очередь

## Captcha

Некоторые методы могут вернуть captcha challenge. vk-io поддерживает callback:

```javascript
const vk = new VK({
  token,
  callbackService: {
    captchaHandler: async ({ src, key }) => {
      console.log('Captcha:', src);
      const code = await promptUser('Введите код:');
      return code;
    }
  }
});
```

## Ссылки
- https://dev.vk.com/ru/method — полный каталог
- https://dev.vk.com/ru/api/errors — коды ошибок
