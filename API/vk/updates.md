# VK — получение updates (Long Poll, Webhook)

## Три способа получать события

1. **User Long Poll** — для личного аккаунта
2. **Bots Long Poll** — для сообщества
3. **Callback API / Webhook** — для сообщества, PUSH на наш сервер

Для ChatCenter (работа от имени пользователя) — **User Long Poll**.

## User Long Poll — базовое использование

```javascript
import { VK } from 'vk-io';

const vk = new VK({ token: USER_TOKEN });

vk.updates.on('message_new', async (context) => {
  console.log('От:', context.senderId);
  console.log('Текст:', context.text);
  console.log('ID чата:', context.peerId);
  await context.send('Автоответ');
});

// Запуск
await vk.updates.startPolling();

// Остановка
await vk.updates.stop();
```

## Архитектура vk-io updates

Вместо EventEmitter используется **middleware chain** (как в Koa). Это даёт:
- Fallback при ошибке
- Фильтрация событий
- Изменение контекста между хендлерами
- Post-processing действия после основного хендлера

### `.on(eventType, handler)` — фильтр по типу
```javascript
vk.updates.on('message_new', async (context, next) => {
  // обработка
  await next();  // передать дальше
});
```

### `.use(handler)` — middleware на все события
```javascript
vk.updates.use(async (context, next) => {
  console.log('Event:', context.type);
  await next();
});
```

## Типы событий (user long poll)

### `message_new`
Новое сообщение.

```javascript
vk.updates.on('message_new', (ctx) => {
  ctx.senderId       // ID отправителя
  ctx.peerId         // ID чата (peer_id)
  ctx.text           // текст
  ctx.subTypes       // ['message_new']
  ctx.attachments    // массив вложений
  ctx.message        // полный объект сообщения
  ctx.isOutbox       // исходящее?
  ctx.isInbox        // входящее?
  ctx.isChat         // беседа?
  ctx.isUser         // ЛС пользователю?
  ctx.isGroup        // группе?
  ctx.isFromGroup    // от имени группы?
  ctx.hasText, ctx.hasAttachments, ctx.hasReplyMessage, ctx.hasForwards
  ctx.replyMessage   // на какое сообщение ответ
  ctx.forwards       // массив пересланных
});
```

### `message_edit`
Редактирование сообщения.

### `message_reply`
Ответ на сообщение.

### `read_messages`
Прочитано.

```javascript
vk.updates.on('read_messages', (ctx) => {
  ctx.peerId
  ctx.id        // до какого message_id
});
```

### `message_flags`
Изменение флагов сообщения (удалено, прочитано, important, spam, и т.д.).

### `message_allow` / `message_deny`
Пользователь разрешил / запретил писать от группы.

### `dialog_flags`
Флаги диалога (unread count, типинг).

### `typing`
Печатает.

```javascript
vk.updates.on('typing', (ctx) => {
  ctx.userId
  ctx.peerId
});
```

### `friend_online` / `friend_offline`
Друг онлайн/оффлайн.

## Bots Long Poll (для сообществ)

```javascript
const vk = new VK({ token: GROUP_TOKEN });

vk.updates.on('message_new', async (ctx) => {
  await ctx.send('Привет из группы!');
});

await vk.updates.start();  // без Polling в конце
```

У групп доступно больше событий: `like_add`, `wall_post_new`, `photo_new`, `board_post_new`, `group_join`, `group_leave`, и т.д.

## Callback API (Webhook)

Сообщество шлёт POST на наш сервер при событиях. Для Electron-приложения — **не подходит** (нет публичного сервера). Используем Long Poll.

Если нужен:
```javascript
import { Updates } from 'vk-io';
import http from 'http';

const updates = vk.updates;

http.createServer(updates.getWebhookCallback('/webhook')).listen(3000);
```

## Фильтрация

### По типу
```javascript
vk.updates.on('message_new', handler);
```

### По условию (hear middleware)
```javascript
import { HearManager } from '@vk-io/hear';

const hearManager = new HearManager();

vk.updates.on('message_new', hearManager.middleware);

hearManager.hear('привет', (ctx) => ctx.send('Привет!'));
hearManager.hear(/^купить\s/i, (ctx) => ctx.send('Корзина'));
hearManager.hear({ text: 'помощь' }, (ctx) => ctx.send('Помощь'));
```

## Session middleware

```javascript
import { SessionManager } from '@vk-io/session';

const sessionManager = new SessionManager();
vk.updates.use(sessionManager.middleware);

vk.updates.on('message_new', (ctx) => {
  ctx.session.counter = (ctx.session.counter || 0) + 1;
  ctx.send(`Счётчик: ${ctx.session.counter}`);
});
```

## Scenes (сценарии)

Пошаговое взаимодействие (анкеты, формы).

```javascript
import { SceneManager, StepScene } from '@vk-io/scenes';

const sceneManager = new SceneManager();

sceneManager.addScenes([
  new StepScene('signup', [
    (ctx) => {
      if (ctx.scene.step.firstTime) {
        return ctx.send('Как вас зовут?');
      }
      ctx.scene.state.name = ctx.text;
      return ctx.scene.step.next();
    },
    (ctx) => {
      if (ctx.scene.step.firstTime) {
        return ctx.send('Ваш возраст?');
      }
      ctx.scene.state.age = ctx.text;
      ctx.send(`Готово: ${ctx.scene.state.name}, ${ctx.scene.state.age} лет`);
      return ctx.scene.leave();
    }
  ])
]);

vk.updates.use(sessionManager.middleware);
vk.updates.use(sceneManager.middleware);
vk.updates.use(sceneManager.middlewareIntercept);

// Запустить сценарий
vk.updates.hear('/start', (ctx) => ctx.scene.enter('signup'));
```

## Restart при ошибках

```javascript
async function startPolling() {
  try {
    await vk.updates.startPolling();
  } catch (e) {
    console.error('Polling error:', e);
    setTimeout(startPolling, 5000);
  }
}

startPolling();
```

## Ручной запуск (без startPolling)

```javascript
// Получить серверные параметры
const { server, key, ts } = await vk.api.messages.getLongPollServer({
  lp_version: 3,
  need_pts: 1
});

// Запрос по URL
const url = `https://${server}?act=a_check&key=${key}&ts=${ts}&wait=25&mode=2&version=3`;
const response = await fetch(url).then(r => r.json());
// response.updates — массив
// response.ts — новый ts для следующего запроса
// response.pts — для getDifference
```

Но проще использовать `vk.updates.startPolling()`.
