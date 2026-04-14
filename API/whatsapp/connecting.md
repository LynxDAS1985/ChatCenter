# Baileys — подключение к WhatsApp

Источник: https://baileys.wiki/docs/socket/connecting

## Обзор

После конфигурации сокета нужно подключиться к серверам WhatsApp. Два метода авторизации: **QR** или **Phone/Pairing Code**.

## `connection.update` — главное событие

Основной listener для всех состояний соединения + QR:

```javascript
sock.ev.on('connection.update', async (update) => {
  const { connection, lastDisconnect, qr } = update;
  // connection: 'connecting' | 'open' | 'close'
  // qr: string (если новый QR готов)
  // lastDisconnect.error (если connection='close')
});
```

## QR-авторизация

### Показ QR
```javascript
import QRCode from 'qrcode';

sock.ev.on('connection.update', async (update) => {
  const { qr } = update;
  if (qr) {
    // В терминал
    console.log(await QRCode.toString(qr, { type: 'terminal' }));

    // Или в PNG
    await QRCode.toFile('./qr.png', qr);

    // Или в data URL для веб-UI
    const dataUrl = await QRCode.toDataURL(qr);
  }
});
```

### После скана
WhatsApp **принудительно разорвёт соединение** чтобы выдать креды:

```javascript
import { DisconnectReason } from 'baileys';

sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update;
  if (connection === 'close') {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    if (statusCode === DisconnectReason.restartRequired) {
      // Это нормально — создаём новый сокет
      connectToWA();
    }
  }
});
```

## Pairing Code

Альтернатива QR — ввести 8-значный код на телефоне в настройках WhatsApp → **Связанные устройства** → **Связать по телефону**.

```javascript
sock.ev.on('connection.update', async (update) => {
  const { connection, qr } = update;
  if (connection === 'connecting' || !!qr) {
    // Телефон в формате E.164 БЕЗ плюса
    const phoneNumber = '79001234567';
    const code = await sock.requestPairingCode(phoneNumber);
    console.log('Код для ввода в WhatsApp:', code);
    // Пример вывода: ABCD-EFGH
  }
});
```

**Важно**: для pairing code нужно установить `browser` в конфиге:
```javascript
import { Browsers } from 'baileys';

const sock = makeWASocket({
  auth: state,
  browser: Browsers.macOS('Google Chrome')  // обязательно при pairing code
});
```

## DisconnectReason — коды отключений

```javascript
enum DisconnectReason {
  connectionClosed = 428,      // просто закрыли
  connectionLost = 408,         // потеря сети
  connectionReplaced = 440,     // другой сокет перехватил
  timedOut = 408,              // таймаут
  loggedOut = 401,             // разлогинились (logout)
  badSession = 500,            // ошибка сессии (нужно удалить auth_info)
  restartRequired = 515,       // перезапустить сокет
  multideviceMismatch = 411,   // конфликт multi-device
  forbidden = 403,             // забанено
  unavailableService = 503     // WhatsApp недоступен
}
```

### Универсальная обработка
```javascript
import { Boom } from '@hapi/boom';
import { DisconnectReason } from 'baileys';

sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update;

  if (connection === 'close') {
    const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

    switch (reason) {
      case DisconnectReason.loggedOut:
        console.log('Logged out — требуется повторный QR');
        // Удалить auth_info и начать заново
        break;
      case DisconnectReason.restartRequired:
      case DisconnectReason.connectionClosed:
      case DisconnectReason.connectionLost:
      case DisconnectReason.timedOut:
        console.log('Reconnect...');
        connectToWA();
        break;
      case DisconnectReason.badSession:
        console.log('Bad session — удалить auth_info');
        break;
      case DisconnectReason.forbidden:
        console.log('Забанен WhatsApp');
        break;
      default:
        console.log('Unknown disconnect:', reason);
    }
  } else if (connection === 'open') {
    console.log('Подключён!');
  }
});
```

## Auth State — сохранение креды

⚠️ `useMultiFileAuthState` — **ТОЛЬКО DEV**.

```javascript
const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
const sock = makeWASocket({ auth: state });
sock.ev.on("creds.update", saveCreds);  // ОБЯЗАТЕЛЬНО сохранять!
```

Для продакшена — своё хранилище. Структура state:
- `creds` — креды пользователя (signalIdentity, me, etc.)
- `keys` — ключи шифрования (preKeys, senderKeys, appStateKeys)

## Полный пример с переподключением

```javascript
import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers } from 'baileys';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';

async function connectToWA() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.macOS('ChatCenter'),
    printQRInTerminal: false,
    markOnlineOnConnect: false,  // не помечать online при старте
    syncFullHistory: false        // без синка полной истории
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrStr = await QRCode.toString(qr, { type: 'terminal' });
      console.log(qrStr);
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      console.log('Closed:', reason, 'reconnect:', shouldReconnect);
      if (shouldReconnect) connectToWA();
    } else if (connection === 'open') {
      console.log('WhatsApp connected');
    }
  });

  return sock;
}

connectToWA();
```
