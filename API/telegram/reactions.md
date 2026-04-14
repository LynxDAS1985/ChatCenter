# Telegram Reactions API

Источник: https://core.telegram.org/api/reactions

## Типы реакций

1. **Standard emoji** — встроенные (❤️, 👍, 🔥, и т.д.)
2. **Custom emoji** — для Premium пользователей (любой custom)
3. **Paid star reactions** — оплаченные звёздами (анонимно, публично, топ)

## Отправка реакции

### `messages.sendReaction`
```javascript
await client.invoke(new Api.messages.SendReaction({
  peer: chat,
  msgId: messageId,
  reaction: [new Api.ReactionEmoji({ emoticon: '❤️' })]
}));

// Custom emoji (Premium)
reaction: [new Api.ReactionCustomEmoji({ documentId: BigInt(12345) })]

// Paid (звёзды)
reaction: [new Api.ReactionPaid()]
count: 5  // количество звёзд
```

**Важно**: реакции должны быть отправлены в возрастающем порядке (новые в конце массива).

## Список доступных реакций

### `messages.getAvailableReactions`
```javascript
const hash = 0;
const result = await client.invoke(new Api.messages.GetAvailableReactions({ hash }));
// result.reactions — массив availableReaction
```

Каждая `availableReaction`:
- `reaction` — emoji
- `title` — название
- `static_icon`, `appear_animation`, `select_animation`, `activate_animation`, `effect_animation`, `around_animation`, `center_icon` — анимации
- `premium` — только для Premium
- `inactive` — скрыта

## Реакции в чатах/каналах

### Ограничение доступных реакций (админ)
```javascript
await client.invoke(new Api.messages.SetChatAvailableReactions({
  peer: chat,
  availableReactions: new Api.ChatReactionsAll(),  // все доступны
  // или new Api.ChatReactionsSome({ reactions: [...] })
  // или new Api.ChatReactionsNone() — запретить реакции
  reactionsLimit: 11  // максимум уникальных на сообщение
}));
```

### Получить текущую конфигурацию
- `ChatReactionsAll` — все стандартные
- `ChatReactionsSome` — конкретный список
- `ChatReactionsNone` — запрещено

## Paid Reactions (Stars)

Платные реакции поддерживают лидерборды и анонимность.

**Включить для канала**:
```javascript
availableReactions: new Api.ChatReactionsSome({
  reactions: [new Api.ReactionPaid()]
})
```

### Тогл анонимности
```javascript
await client.invoke(new Api.messages.TogglePaidReactionPrivacy({
  peer: channel,
  msgId: messageId,
  private: true  // скрыть от лидерборда
}));
```

## События (updates)

### `updateMessageReactions`
Реакции изменились на сообщении.
```
{
  peer: PeerUser | PeerChat | PeerChannel,
  msgId: number,
  reactions: MessageReactions  // count, chosen, recent
}
```

### `updateMessageReactions` содержит `MessageReactions`:
- `results`: `ReactionCount[]` — счётчики реакций
  - `count` — сколько раз поставлена
  - `reaction`: `Reaction` (emoji / custom / paid)
  - `chosen_order` — порядок для текущего пользователя (если он ставил)
- `recent_reactions`: `MessagePeerReaction[]` — последние N кто поставил
- `top_reactors`: `MessagePeerReaction[]` — для paid reactions топ

## Настройки уведомлений

### `account.setReactionsNotifySettings`
```javascript
await client.invoke(new Api.account.SetReactionsNotifySettings({
  settings: new Api.ReactionsNotifySettings({
    messagesNotifyFrom: new Api.ReactionNotificationsFromAll(),  // от всех
    // или ReactionNotificationsFromContacts — только контакты
    // или undefined — никто
    storiesNotifyFrom: ...,
    showPreviews: true,
    sound: new Api.NotificationSoundDefault()
  })
}));
```

### `account.getReactionsNotifySettings`

## Недавно использованные

### `messages.getRecentReactions`
```javascript
const result = await client.invoke(new Api.messages.GetRecentReactions({
  limit: 20,
  hash: 0
}));
// result.reactions
```

### `messages.clearRecentReactions`
Очистить историю.

## Реакции на истории

Отдельный метод для stories:

### `stories.sendReaction`
```javascript
await client.invoke(new Api.stories.SendReaction({
  peer: user,
  storyId: 42,
  reaction: new Api.ReactionEmoji({ emoticon: '🔥' })
}));
```

## Лимиты (из `appConfig`)

- `reactions_uniq_max` — макс. разных реакций на одно сообщение
- `reactions_user_max_default` — макс. реакций от одного юзера (non-Premium)
- `reactions_user_max_premium` — для Premium
- `stars_paid_reaction_amount_max` — макс. звёзд за одну платную реакцию
