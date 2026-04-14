# Telegram Stars, Stories, Mini Apps — сводка

## Telegram Stars (платежи)

Источник: https://core.telegram.org/api/stars

Виртуальная валюта для оплаты цифровых товаров/услуг через ботов и Mini Apps.

### Применения

- **Paid media** — платные посты в каналах
- **Bot payments** — покупка услуг через боты
- **Subscriptions** — периодические платежи
- **Gifts** — подарки другим пользователям
- **Ads discount** — покупка рекламы со скидкой 30%

### Основные методы

```javascript
// Статус баланса
const status = await client.invoke(new Api.payments.GetStarsStatus({
  peer: new Api.InputPeerSelf()
}));

// Получить транзакции
await client.invoke(new Api.payments.GetStarsTransactions({
  peer, inbound: false, outbound: false, offset: ''
}));

// Отправить форму оплаты
await client.invoke(new Api.payments.SendStarsForm({
  formId, invoice
}));

// Подарки
await client.invoke(new Api.payments.GetStarGifts({ hash: 0 }));
```

### Star Rating

Система репутации — зарабатывается успешными транзакциями, снижается при возвратах.

### Вывод в криптовалюту

Owners могут выводить Stars как Toncoin через Fragment.com.

### Для ChatCenter

Stars — не критичны для задачи (мы не принимаем платежи через мессенджер). Но API есть для мониторинга подписок клиентов если нужно.

---

## Telegram Stories

Источник: https://core.telegram.org/api/stories

Временные посты (24 часа по умолчанию).

### Отправка

```javascript
// Проверить право
const canSend = await client.invoke(new Api.stories.CanSendStory({
  peer: new Api.InputPeerSelf()
}));

// Отправить
await client.invoke(new Api.stories.SendStory({
  peer: new Api.InputPeerSelf(),
  media: new Api.InputMediaUploadedPhoto({ file }),
  privacyRules: [new Api.InputPrivacyValueAllowAll()],
  randomId: BigInt(Math.random() * 1e18),
  caption: 'Подпись',
  // опционально:
  period: 86400,  // секунд (до 7 дней)
  pinned: false,
  mediaAreas: [ /* интерактивные зоны */ ]
}));
```

### Просмотр

```javascript
// Активные истории
await client.invoke(new Api.stories.GetAllStories({
  next: false, hidden: false, state: ''
}));

// Отметить просмотренным
await client.invoke(new Api.stories.ReadStories({
  peer, maxId: storyId
}));

// Инкремент просмотров
await client.invoke(new Api.stories.IncrementStoryViews({
  peer, id: [storyId]
}));
```

### Управление

- `stories.editStory` — редактировать
- `stories.deleteStories` — удалить
- `stories.getPinnedStories` — закреплённые
- `stories.getStoriesArchive` — архив

### Реакции

```javascript
await client.invoke(new Api.stories.SendReaction({
  peer, storyId,
  reaction: new Api.ReactionEmoji({ emoticon: '❤️' })
}));
```

### Просмотры

```javascript
const views = await client.invoke(new Api.stories.GetStoryViewsList({
  peer, id: storyId,
  offset: '', limit: 50,
  justContacts: false, reactionsFirst: false, forwardsFirst: false
}));
```

### Media Areas (интерактивные зоны)

В историю можно встроить:
- Локации (`MediaAreaGeoPoint`)
- Ссылки на посты (`MediaAreaChannelPost`)
- Предложенные реакции (`MediaAreaSuggestedReaction`)
- URL-ссылки (`MediaAreaUrl`)
- Погоду (`MediaAreaWeather`)
- Подарки (`MediaAreaStarGift`)

### Albums

Организация историй в коллекции:
- `stories.createAlbum`
- `stories.updateAlbum`
- `stories.reorderAlbums`

### Stealth Mode (Premium)

```javascript
await client.invoke(new Api.stories.ActivateStealthMode({
  past: true,   // скрыть предыдущие просмотры
  future: true  // следующие просмотры
}));
```

### Для ChatCenter

Не используем в базовой задаче. Но если AI будет мониторить активность клиентов — `stories.getAllStories` даёт список.

---

## Telegram Mini Apps (Web Apps)

Источник: https://core.telegram.org/bots/webapps

Веб-приложения внутри Telegram. Запускаются через бота.

### Bot API 8.0+ фичи

- **Full-screen mode** portrait + landscape
- **Home screen shortcuts** — добавить на экран
- **Emoji status** management
- **Media sharing** в чаты и stories
- **File download**
- **Geolocation**
- **Device motion** (accelerometer, gyroscope)
- **Biometric auth**
- **Cloud storage** + secure local
- **Subscription plans** via Stars

### Launch Methods

1. Keyboard buttons
2. Inline buttons
3. Menu buttons
4. Direct links
5. Attachment menu
6. Inline mode
7. Bot profile (main Mini App)

### Интеграция

Подключить скрипт в HTML Mini App:
```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script>
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();

  // Получить данные пользователя
  const user = tg.initDataUnsafe.user;
  // { id, first_name, last_name, username, language_code, ... }

  // Отправить данные боту
  tg.sendData(JSON.stringify({ action: 'buy', id: 42 }));

  // Закрыть
  tg.close();
</script>
```

### Для ChatCenter

Mini Apps — **не нужны** для текущей задачи. Мы делаем независимую desktop-оболочку, а не встраиваемся в Telegram.

---

## Итого

Для нашей задачи из новых фич нужны:

| Фича | Нужно? |
|---|---|
| Business API (Connected Bots) | 🟡 Опционально — альтернативный путь для AI-ответов |
| Stars | 🔴 Нет |
| Stories API | 🟡 Опционально — если AI анализирует активность клиентов |
| Reactions | 🟢 Да — UI должен показывать и отправлять |
| Mini Apps | 🔴 Нет (мы не встраиваемся в TG) |

Основа для ChatCenter — **обычная messaging часть MTProto**: чаты, сообщения, файлы, события. Это уже полностью описано в [README.md](./README.md), [methods.md](./methods.md), [files.md](./files.md), [updates.md](./updates.md).
