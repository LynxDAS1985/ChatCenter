# Baileys — полный список событий

Все события регистрируются через `sock.ev.on('event-name', handler)`.

## Connection

### `connection.update`
Изменение состояния соединения + QR.

```javascript
sock.ev.on('connection.update', (update) => {
  // update.connection: 'connecting' | 'open' | 'close' | undefined
  // update.qr: string | undefined  (новый QR)
  // update.lastDisconnect: { error, date } | undefined
  // update.receivedPendingNotifications: boolean  (pending notifications получены)
  // update.isNewLogin: boolean
  // update.isOnline: boolean
});
```

### `creds.update`
Обновление учётных данных — **ОБЯЗАТЕЛЬНО сохранять**.

```javascript
sock.ev.on('creds.update', saveCreds);
```

## Messages

### `messages.upsert`
Новые сообщения или из истории.

```javascript
sock.ev.on('messages.upsert', ({ messages, type }) => {
  // type: 'notify' | 'append' | 'prepend'
  // 'notify' — свежее сообщение в реальном времени
  // 'append' — добавление в существующий чат (история)
  // 'prepend' — более старые (прокрутка вверх)

  for (const msg of messages) {
    console.log(msg.key, msg.message, msg.pushName);
  }
});
```

### `messages.update`
Редактирование, удаление, изменение статуса.

```javascript
sock.ev.on('messages.update', (updates) => {
  for (const { key, update } of updates) {
    // update может содержать: message (редактирование), status, reactions
  }
});
```

### `messages.delete`
Сообщение удалено у всех.

```javascript
sock.ev.on('messages.delete', ({ keys }) => {
  // keys — массив WAMessageKey удалённых сообщений
});
```

### `messages.reaction`
Реакции.

```javascript
sock.ev.on('messages.reaction', (reactions) => {
  for (const { key, reaction } of reactions) {
    // reaction.text — emoji
    // reaction.key — автор реакции (participant)
  }
});
```

### `messages.media-update`
Обновление медиа (reupload, expiry).

```javascript
sock.ev.on('messages.media-update', (updates) => {
  for (const { key, media, error } of updates) {
    // обновить локальный кэш медиа
  }
});
```

### `message-receipt.update`
Прочитано/доставлено.

```javascript
sock.ev.on('message-receipt.update', (receipts) => {
  for (const { key, receipt } of receipts) {
    // receipt.readTimestamp — когда прочитано
    // receipt.receiptTimestamp — когда доставлено
    // receipt.userJid — кем
  }
});
```

## Presence

### `presence.update`
Печатает/online/offline.

```javascript
sock.ev.on('presence.update', ({ id, presences }) => {
  // presences: { [jid]: { lastKnownPresence, lastSeen } }
  // lastKnownPresence: 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'
});
```

## Chats

### `chats.upsert`
Новые чаты.

```javascript
sock.ev.on('chats.upsert', (chats) => {
  for (const chat of chats) {
    // chat.id, chat.name, chat.unreadCount, chat.conversationTimestamp
  }
});
```

### `chats.update`
Изменение чата.

```javascript
sock.ev.on('chats.update', (updates) => {
  for (const update of updates) {
    // update.id (jid) + поля что изменились
  }
});
```

### `chats.delete`
Удалены чаты.

```javascript
sock.ev.on('chats.delete', (jids) => {
  for (const jid of jids) { /* удалить локально */ }
});
```

## Contacts

### `contacts.upsert`
Новые контакты.

```javascript
sock.ev.on('contacts.upsert', (contacts) => {
  for (const contact of contacts) {
    // contact.id, contact.notify, contact.name
  }
});
```

### `contacts.update`
Изменения контактов.

## Groups

### `groups.upsert`
Новые группы.

### `groups.update`
Изменение группы (название, аватар, описание).

```javascript
sock.ev.on('groups.update', (updates) => {
  for (const update of updates) {
    // update.id, update.subject, update.desc, ...
  }
});
```

### `group-participants.update`
Изменение участников.

```javascript
sock.ev.on('group-participants.update', ({ id, participants, action }) => {
  // action: 'add' | 'remove' | 'promote' | 'demote'
  // participants: [ jid, ... ]
});
```

## Blocklist

### `blocklist.set`
Установка полного списка блокировок (при первом sync).

```javascript
sock.ev.on('blocklist.set', ({ blocklist }) => {
  // blocklist: string[]
});
```

### `blocklist.update`
Изменение блоклиста.

```javascript
sock.ev.on('blocklist.update', ({ blocklist, type }) => {
  // type: 'add' | 'remove'
});
```

## Call

### `call`
Входящие/исходящие звонки.

```javascript
sock.ev.on('call', (calls) => {
  for (const call of calls) {
    // call.from, call.id, call.status ('offer' | 'ringing' | 'timeout' | 'reject' | 'accept')
    // call.isVideo
    // call.isGroup
  }
});
```

## Label (метки — бизнес-аккаунты)

### `labels.edit`, `labels.association`
Редактирование меток и назначение меток чатам.

## Messaging-history

### `messaging-history.set`
Полный sync истории после подключения.

```javascript
sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest, progress, syncType }) => {
  // chats — все чаты
  // contacts — все контакты
  // messages — все сообщения
  // isLatest — последний chunk
  // syncType: 'ON_DEMAND' | 'FULL' | 'RECENT' | 'INITIAL_BOOTSTRAP' | 'INITIAL_STATUS_V3'
});
```

## Получить все сообщения подряд

```javascript
import { MessageType } from 'baileys';

sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const msg of messages) {
    if (msg.key.fromMe) continue;

    const from = msg.key.remoteJid;
    const pushName = msg.pushName || '';
    const sender = msg.key.participant || from;

    // Тип сообщения
    const messageType = Object.keys(msg.message || {})[0];

    switch (messageType) {
      case 'conversation':
      case 'extendedTextMessage':
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        console.log(`[${from}] ${pushName}: ${text}`);
        break;
      case 'imageMessage':
        console.log(`[${from}] ${pushName}: [photo] ${msg.message.imageMessage.caption || ''}`);
        break;
      case 'videoMessage':
        console.log(`[${from}] ${pushName}: [video]`);
        break;
      case 'audioMessage':
        console.log(`[${from}] ${pushName}: [voice/audio]`);
        break;
      case 'documentMessage':
        console.log(`[${from}] ${pushName}: [doc] ${msg.message.documentMessage.fileName}`);
        break;
      case 'stickerMessage':
        console.log(`[${from}] ${pushName}: [sticker]`);
        break;
      case 'locationMessage':
        console.log(`[${from}] ${pushName}: [location]`);
        break;
      case 'contactMessage':
      case 'contactsArrayMessage':
        console.log(`[${from}] ${pushName}: [contact]`);
        break;
      case 'reactionMessage':
        console.log(`[${from}] ${pushName}: reaction ${msg.message.reactionMessage.text}`);
        break;
      case 'pollCreationMessage':
        console.log(`[${from}] ${pushName}: [poll]`);
        break;
    }
  }
});
```
