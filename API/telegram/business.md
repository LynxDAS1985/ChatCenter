# Telegram Business API

Источник: https://core.telegram.org/api/business

Telegram Business позволяет пользователю превратить аккаунт в бизнес-аккаунт с профессиональными инструментами. **Требуется Telegram Premium** (иначе фичи не активируются для аккаунта).

## Основные фичи

### Opening Hours & Location
- Часы работы с учётом часовых поясов
- Физический адрес + геолокация
- Отображение в "nearby users"

**Методы**:
- `account.updateBusinessWorkHours`
- `account.updateBusinessLocation`

### Quick Replies
Заранее заготовленные ответы — текст, форматирование, стикеры, медиа, файлы. Отправляются в частных чатах.

**Методы**:
- `messages.getQuickReplies` — список
- `messages.addQuickReplyShortcut`
- `messages.deleteQuickReplyShortcut`
- `messages.sendQuickReplyMessages` — отправить из быстрого ответа

Лимиты настраиваются через `appConfig`.

### Greeting & Away Messages
- **Greeting** — автоматически отправляется новому пользователю
- **Away** — когда оффлайн или в нерабочее время

**Методы**:
- `account.updateBusinessGreetingMessage`
- `account.updateBusinessAwayMessage`

Параметры away:
- Always online / Always offline / Custom schedule / Outside work hours

### Business Chat Links
Deep-ссылки с pre-filled текстом. Отслеживают просмотры.

**Методы**:
- `account.createBusinessChatLink`
- `account.editBusinessChatLink`
- `account.getBusinessChatLinks`
- `account.deleteBusinessChatLink`

### Business Introduction
Кастомный intro в профиле для пользователей без существующей переписки: title + description + sticker.

**Методы**:
- `account.updateBusinessIntro`

### Connected Bots
Бизнес может **подключить бота**, который будет обрабатывать сообщения от имени бизнеса. Это даёт полноценную автоматизацию через обычного Telegram-бота (нестандартное решение для AI-ответов).

**Методы**:
- `account.updateConnectedBot`
- `account.disablePeerConnectedBot`

Для получения сообщений бот использует:
- Через Bot API: `businessMessage`, `editedBusinessMessage`, `deletedBusinessMessages` updates
- Через MTProto: обычные message updates с флагом `bot_business_connection_id`

### Folder Tags
Теги для папок чатов для организации.

**Методы**:
- `account.updateColor`
- `account.toggleSponsoredMessages`

## Для ChatCenter — что интересно

**Connected Bots** — самая интересная фича. Если аккаунт клиента имеет Premium + Business, и владелец подключает бота, то **AI-ассистент может через Bot API отвечать на входящие как оператор**.

Альтернативный путь без Premium:
- Использовать клиентский MTProto (GramJS) → прямой доступ к переписке, AI читает и пишет от имени пользователя

## Связь с Bot API

Бизнес-подключённый бот получает в updates:
- `businessConnection` — информация о подключении (business_connection_id)
- `businessMessage` — входящее в бизнес-чат
- `editedBusinessMessage`
- `deletedBusinessMessages`

Отправка через бот:
```
POST /bot{TOKEN}/sendMessage
{
  "business_connection_id": "...",
  "chat_id": 12345,
  "text": "Автоответ от AI"
}
```

## Ограничения

- Требует Telegram Premium у владельца аккаунта
- Работает только в частных чатах (не группы/каналы)
- Лимиты Quick replies и Chat links из `appConfig`
