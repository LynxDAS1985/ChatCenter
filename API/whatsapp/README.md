# WhatsApp через Baileys

## Что это

**Baileys** — TypeScript/JavaScript библиотека-автоматизация WhatsApp Web API. Работает через WebSocket-протокол WhatsApp Web (не через браузер). Подключается как **Linked Device** (как связанный ноутбук).

Репозиторий: https://github.com/WhiskeySockets/Baileys
Документация: https://baileys.wiki
Версия: 7.0.0+ (актуальная)

## Легальность

⚠️ **Серая зона**. WhatsApp официально запрещает в ToS, но:
- Для личного использования — миллионы пользователей, банов мало
- Для массовых рассылок — бан почти гарантирован
- Для работы с клиентами (несколько сообщений/минуту) — обычно OK

**Библиотека специально запрещает**: stalkerware, bulk messaging, auto-messaging.

## Установка

Требования: **Node.js 17+**

```bash
npm install baileys
# или
yarn add baileys
# или
pnpm add baileys
# или
bun add baileys
```

Для QR-кода в терминале:
```bash
npm install qrcode
```

## Базовый пример

```javascript
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'baileys';
import QRCode from 'qrcode';

async function connectToWA() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false  // deprecated — обрабатываем сами
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(await QRCode.toString(qr, { type: 'terminal' }));
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Disconnected. Reconnect?', shouldReconnect);
      if (shouldReconnect) connectToWA();
    } else if (connection === 'open') {
      console.log('WhatsApp connected ✓');
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const msg of messages) {
      console.log('New:', msg.key.remoteJid, msg.message);
    }
  });
}

connectToWA();
```

## Авторизация: QR или Pairing Code

### QR (scan from phone)
```javascript
sock.ev.on('connection.update', async (update) => {
  const { qr } = update;
  if (qr) {
    console.log(await QRCode.toString(qr, { type: 'terminal' }));
  }
});
```

После скана WhatsApp **принудительно разорвёт соединение** → нужно переподключиться:
```javascript
if (connection === 'close' &&
    lastDisconnect?.error?.output?.statusCode === DisconnectReason.restartRequired) {
  connectToWA(); // новый сокет
}
```

### Pairing Code (ввести код на телефоне)
```javascript
sock.ev.on('connection.update', async (update) => {
  const { connection, qr } = update;
  if (connection === 'connecting' || !!qr) {
    const code = await sock.requestPairingCode(phoneNumber);
    // phoneNumber в формате E.164 БЕЗ плюса: 79001234567
    console.log('Введите код:', code);
  }
});
```

## Auth State

⚠️ **ВАЖНО**: `useMultiFileAuthState` — **ТОЛЬКО для разработки**. В продакшн не использовать. Использовать как референс — писать своё хранилище (SQL, Redis и т.д.).

```javascript
// Development ONLY
const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
sock.ev.on('creds.update', saveCreds);
```

Для продакшена: см. [auth-state.md](./auth-state.md).

## Отправка сообщений

```javascript
const jid = '79001234567@s.whatsapp.net'; // личный чат
const groupJid = '123456789-123456@g.us';   // группа

// Текст
await sock.sendMessage(jid, { text: 'Привет!' });

// Картинка
await sock.sendMessage(jid, {
  image: { url: './photo.jpg' },
  caption: 'Вот фото'
});

// Видео
await sock.sendMessage(jid, {
  video: { url: './video.mp4' },
  caption: 'Вот видео'
});

// Документ
await sock.sendMessage(jid, {
  document: { url: './file.pdf' },
  mimetype: 'application/pdf',
  fileName: 'договор.pdf'
});

// Аудио / голосовое
await sock.sendMessage(jid, {
  audio: { url: './voice.ogg' },
  ptt: true,  // голосовое (push-to-talk)
  mimetype: 'audio/ogg; codecs=opus'
});

// Стикер
await sock.sendMessage(jid, {
  sticker: { url: './sticker.webp' }
});

// Локация
await sock.sendMessage(jid, {
  location: { degreesLatitude: 55.75, degreesLongitude: 37.62 }
});

// Контакт
await sock.sendMessage(jid, {
  contacts: {
    displayName: 'Иван',
    contacts: [{ vcard: '...vcard content...' }]
  }
});

// Ответ на сообщение
await sock.sendMessage(jid, { text: 'Ответ' }, { quoted: originalMessage });

// Упомянуть пользователя
await sock.sendMessage(jid, {
  text: 'Привет @79001234567',
  mentions: ['79001234567@s.whatsapp.net']
});
```

## Получение сообщений

```javascript
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  for (const msg of messages) {
    if (msg.key.fromMe) continue; // исходящие пропускаем

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const image = msg.message?.imageMessage;
    const document = msg.message?.documentMessage;

    console.log(`[${from}] ${sender}: ${text}`);
  }
});
```

## События

- `connection.update` — состояние соединения, QR
- `creds.update` — обновление учётных данных (сохранять!)
- `messages.upsert` — новые сообщения (или новые редакции)
- `messages.update` — редактирование/удаление
- `messages.reaction` — реакции
- `message-receipt.update` — прочитано/доставлено
- `presence.update` — печатает/online
- `chats.upsert` / `chats.update` / `chats.delete` — изменения в чатах
- `contacts.upsert` / `contacts.update` — изменения контактов
- `group-participants.update` — изменения в группах

## Управление

```javascript
// Пометить прочитанным
await sock.readMessages([msg.key]);

// Удалить для всех
await sock.sendMessage(jid, { delete: msg.key });

// Редактировать
await sock.sendMessage(jid, { text: 'новый текст', edit: msg.key });

// Реакция
await sock.sendMessage(jid, {
  react: { text: '❤️', key: msg.key }
});

// Показать "печатает"
await sock.sendPresenceUpdate('composing', jid);
// или 'paused', 'recording', 'available', 'unavailable'

// Получить метаданные группы
const metadata = await sock.groupMetadata(groupJid);

// Участники группы
await sock.groupParticipantsUpdate(groupJid, ['79001234567@s.whatsapp.net'], 'add');
// или 'remove', 'promote', 'demote'

// Создать группу
const group = await sock.groupCreate('Название', ['79001234567@s.whatsapp.net']);

// Выйти из группы
await sock.groupLeave(groupJid);

// Блокировка
await sock.updateBlockStatus(jid, 'block');
// или 'unblock'

// Информация о пользователе
const status = await sock.fetchStatus(jid);
const profile = await sock.profilePictureUrl(jid, 'image');
```

## Скачивание медиа

```javascript
import { downloadMediaMessage } from 'baileys';

const buffer = await downloadMediaMessage(
  msg,
  'buffer',
  {},
  {
    logger: sock.logger,
    reuploadRequest: sock.updateMediaMessage
  }
);
require('fs').writeFileSync('./downloaded.jpg', buffer);
```

## См. также

- [connecting.md](./connecting.md) — детали connection events
- [configuration.md](./configuration.md) — все опции `makeWASocket`
- [events.md](./events.md) — полный список событий
- [auth-state.md](./auth-state.md) — production auth state

## Ссылки

- Docs: https://baileys.wiki
- GitHub: https://github.com/WhiskeySockets/Baileys
- Discord: https://whiskey.so/discord
