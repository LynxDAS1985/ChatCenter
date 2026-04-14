# Baileys — конфигурация сокета

Источник: https://baileys.wiki/docs/socket/configuration

## makeWASocket(config)

Функция возвращает объект с методами для работы с WhatsApp. Принимает `UserFacingSocketConfig`.

## Обязательные параметры

```typescript
{
  auth: AuthenticationState,  // auth state
  logger?: Logger,             // pino logger
  getMessage?: (key) => Promise<WAMessageContent>  // для decrypt/resend
}
```

## Все опции

```typescript
const sock = makeWASocket({
  // ─── Auth ───
  auth: state,                         // AuthenticationState (обязательно)

  // ─── Logger ───
  logger: pino({ level: 'silent' }),   // pino logger

  // ─── Browser (для pairing code) ───
  browser: Browsers.macOS('ChatCenter'),
  // варианты: Browsers.appropriate('Chrome'), Browsers.windows('Firefox'), etc.

  // ─── Versioning ───
  version: [2, 3000, 1020000000],  // WhatsApp Web version — обычно не трогать
  // Baileys сам подбирает совместимую

  // ─── Connection ───
  connectTimeoutMs: 60000,              // таймаут подключения
  defaultQueryTimeoutMs: 60000,         // таймаут запросов
  keepAliveIntervalMs: 30000,           // keep-alive

  // ─── Presence ───
  markOnlineOnConnect: false,           // НЕ помечать online при старте
  // ↑ true ломает push-уведомления на телефоне

  // ─── Sync ───
  syncFullHistory: false,               // полный sync истории (ресурсоёмко)
  fireInitQueries: true,                // начальные queries (список чатов и т.д.)

  // ─── Messages ───
  emitOwnEvents: true,                  // events от своих сообщений тоже
  generateHighQualityLinkPreview: true, // HQ превью ссылок

  // ─── QR ───
  printQRInTerminal: false,             // deprecated — обрабатывать через connection.update
  qrTimeout: 60000,                     // таймаут QR

  // ─── Retry ───
  retryRequestDelayMs: 250,             // задержка между retry
  maxMsgRetryCount: 5,

  // ─── Presence ticker ───
  transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },

  // ─── getMessage ───
  getMessage: async (key) => {
    // Возвращать сообщение из своего хранилища — для decrypt
    // или пустое если не найдено
    return undefined;
  },

  // ─── Group metadata cache ───
  cachedGroupMetadata: async (jid) => {
    // вернуть метадату группы из кэша (если есть)
    // избегает rate-limit при частой отправке в группы
    return undefined;
  },

  // ─── Proxy / Custom agent ───
  agent: undefined,                     // HTTPS agent
  fetchAgent: undefined,                // fetch agent для медиа

  // ─── Shouldы ───
  shouldSyncHistoryMessage: (msg) => true,  // какие исторические сообщения синкать
  shouldIgnoreJid: (jid) => false,          // игнорировать определённые JID

  // ─── Link preview ───
  linkPreviewImageThumbnailWidth: 192,
});
```

## Browsers — предустановленные

```javascript
import { Browsers } from 'baileys';

Browsers.windows('Chrome')        // ['Windows', 'Chrome', '10.0.19042']
Browsers.macOS('Safari')          // ['Mac OS', 'Safari', '14.4.1']
Browsers.baileys('Safari')        // ['Baileys', 'Safari', '5.1733.10']
Browsers.ubuntu('Chrome')         // ['Ubuntu', 'Chrome', '22.04.4']
Browsers.appropriate('Chrome')    // автоматически по OS
```

## Пример для продакшена

```javascript
const sock = makeWASocket({
  auth: state,
  logger: pino({ level: 'warn' }).child({ class: 'baileys' }),
  browser: Browsers.macOS('ChatCenter'),
  markOnlineOnConnect: false,
  syncFullHistory: false,
  connectTimeoutMs: 60000,
  keepAliveIntervalMs: 30000,
  emitOwnEvents: true,
  generateHighQualityLinkPreview: true,
  cachedGroupMetadata: async (jid) => groupCache.get(jid),
  getMessage: async (key) => {
    const msg = await db.getMessage(key.id);
    return msg?.message || undefined;
  }
});
```

## Логгер

По умолчанию pino. Настройка:

```javascript
import P from 'pino';

const logger = P({
  level: 'info',  // 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// В файл
const logger = P({ level: 'info' }, P.destination('./baileys.log'));
```

## Group Metadata Cache

⚠️ При отправке в группы **без кэша** Baileys запрашивает список участников → rate-limit.

```javascript
const groupCache = new NodeCache({ stdTTL: 5 * 60 });  // 5 мин

const sock = makeWASocket({
  cachedGroupMetadata: async (jid) => groupCache.get(jid)
});

// Обновлять кэш при событиях
sock.ev.on('groups.update', async ([evt]) => {
  const metadata = await sock.groupMetadata(evt.id);
  groupCache.set(evt.id, metadata);
});

sock.ev.on('group-participants.update', async ({ id }) => {
  const metadata = await sock.groupMetadata(id);
  groupCache.set(id, metadata);
});
```

## Prod vs Dev

| | Development | Production |
|---|---|---|
| Auth | `useMultiFileAuthState` | Custom (SQL/Redis) |
| Logger | `'silent'` или `'debug'` | `'warn'` в файл |
| Version | Auto | Pinned |
| Browser | Любой | `Browsers.macOS('MyApp')` |
| `markOnlineOnConnect` | true | **false** |
| `syncFullHistory` | Опционально | false |
| Group cache | — | обязательно |

## Ограничения / Flood control

WhatsApp серверы ограничивают:
- Подключения с одного устройства
- Частоту сообщений (внутренний rate-limit)
- Одинаковые сообщения на много контактов → ban

Baileys обрабатывает retry автоматически. Для защиты от бана:
- Не более ~20 сообщений/минуту
- Не использовать одинаковый текст на десятки контактов
- Paused delays между отправками 2-5 сек

## Версии Baileys

7.0.0 ввёл breaking changes. Миграция: https://whiskey.so/migrate-latest

## См. также

- [README.md](./README.md) — базовое использование
- [connecting.md](./connecting.md) — процесс подключения
- [events.md](./events.md) — все события
