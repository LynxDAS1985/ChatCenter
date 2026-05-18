# Ловушки TDLib forum / supergroup metadata

**Создан**: v0.89.25 (18 мая 2026) — после серии notification + forum багов.
**Темы**: forum topics detection, supergroup объект vs chatTypeSupergroup, updateSupergroup events, TDLib metadata caching.

---

## 🔴 ЛОВУШКА #24 (v0.89.25): `is_forum` хранится в `supergroup` объекте, НЕ в `chatTypeSupergroup`

**Симптом** (пользователь со скриншотом, 18 мая 2026 в 14:15): forum-чаты Telegram (например «OZONовая Дыра») открываются как обычные группы — **без панели тем**. Существовало с v0.89.1 (Этап 3.10 TDLib forum topics support), но пользователь заметил после расследования других багов.

**Логи v0.89.24 показали**:
```
[forum-ui] activeChatId=tg_611696632:-1002966550893 type=group isForum=false triggerForum=false
```

И `[forum-map]` отсутствовал для этого chatId — то есть `mapChat()` НЕ помечал чат как forum.

**Корневая причина — TDLib API spec**:

📚 [TDLib chatTypeSupergroup](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1chat_type_supergroup.html) содержит **только 2 поля**:
```
chatTypeSupergroup {
  supergroup_id: int53
  is_channel: Bool
}
```
**Нет поля `is_forum`.**

📚 [TDLib supergroup](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1supergroup.html) — **отдельный объект** доступный через `updateSupergroup`:
```
supergroup {
  id: int53
  ...
  is_channel: Bool
  is_forum: Bool      ← ВОТ ЗДЕСЬ
  is_broadcast_group: Bool
  ...
}
```

**Наш код до v0.89.25** в [`main/native/backends/tdlibMapper.js:329-331`](../../main/native/backends/tdlibMapper.js):
```js
} else if (cn === 'chatTypeSupergroup') {
  chatKind = type.is_channel ? 'channel' : 'group'
  isForum = !!type.is_forum    // ❌ всегда undefined → false
}
```

`type.is_forum` — это field которого **не существует** в `chatTypeSupergroup`. JS возвращает `undefined`, `!!undefined === false`. Результат: **все** forum-чаты в проекте имели `isForum=false`.

**Самое неприятное**: существующий vitest тест проверял именно эту ошибочную модель:
```js
// Старый тест (был неправильный):
type: { '@type': 'chatTypeSupergroup', supergroup_id: 999, is_forum: true }, // ❌ TDLib не шлёт is_forum в type
expect(r.isForum).toBe(true)  // ✅ проходил, но проверял НЕ ту реальность
```

Тест помечал баг как «работает». В реальном TDLib — `is_forum` приходит в **другом** объекте.

**Решение (v0.89.25)** — 4 правки:

1. [`tdlibClient.js`](../../main/native/backends/tdlibClient.js) — `supergroupCache: new Map()` в record + handler `case 'updateSupergroup'` + метод `getSupergroup(accountId, supergroupId)`:
   ```js
   case 'updateSupergroup':
     if (update.supergroup?.id != null) {
       record.supergroupCache.set(Number(update.supergroup.id), update.supergroup)
     }
     return
   ```

2. [`tdlibClient.js:507`](../../main/native/backends/tdlibClient.js#L507) — `getAccountChats` извлекает supergroup и передаёт в mapChat через extras:
   ```js
   const sgId = tdChat?.type?.supergroup_id
   const supergroup = sgId != null ? record.supergroupCache.get(Number(sgId)) : null
   const mapped = mapChat(tdChat, accountId, { avatar, supergroup })
   ```

3. [`tdlibMapper.js`](../../main/native/backends/tdlibMapper.js) — `mapChat` берёт `is_forum` из `extras.supergroup`:
   ```js
   isForum = !!extras.supergroup?.is_forum
   ```

4. [`tdlibBackend.js`](../../main/native/backends/tdlibBackend.js) — `forum.getTopics` тоже использует supergroup:
   ```js
   const sgId = tdChat?.type?.supergroup_id
   const supergroup = sgId != null ? manager.getSupergroup(ctx.accountId, sgId) : null
   const isForum = !!supergroup?.is_forum
   ```

**Регрессионная защита** — обновлённые vitest:
- `tdlibClient.vitest.js`: 5 новых тестов для supergroup cache + getSupergroup
- `tdlibMapper.vitest.js`: тест что `extras.supergroup.is_forum=true` → `isForum=true`, и тест что **`type.is_forum=true` БЕЗ supergroup** → `isForum=false` (регрессия)

**Правило**: при работе с TDLib не доверять интуиции про где хранится поле. **Сверяться с td_api spec**. Поля, которые «логически кажется в type» — могут быть в отдельном объекте: `supergroup`, `basicGroup`, `secretChat`, `user`, `userFullInfo`, `supergroupFullInfo`.

**Дополнительные TDLib поля по аналогии** (для будущих фич):
- `is_broadcast_group` — в `supergroup`, не в type
- `slow_mode_delay`, `member_count` — в `supergroupFullInfo`
- `is_premium`, `is_close_friend` — в `user`
- `bio`, `birthdate`, `personal_chat` — в `userFullInfo`

При написании нового кода — `grep -r "your_field" main/native/backends/` и `grep -r "your_field" .memory-bank/mistakes/` ПЕРЕД использованием.

---

## 🔴 ЛОВУШКА #28 (v0.89.29): TDLib 1.8+ переименовал `message_thread_id` → `forum_topic_id`

**Симптом** (логи 15:35, 18 мая 2026): пользователь кликает на тему forum-чата (например OZON, 215 непрочитанных) — справа черно, висит «Загружаю непрочитанные сообщения». Темы НЕ выделяются при клике (active state не работает).

Логи:
```
[topic-ui] selectForumTopic ... topicId= topMessageId= unreadCount=215
[topic-be] no topicId — params={topicId:"",topMessageId:"",...}
[topic-ui] result ok=false error=no topicId
```

`topicId` — **пустая строка** для ВСЕХ тем.

**Корневая причина — TDLib API breaking change в версии 1.8+**:

📚 [TDLib forumTopicInfo](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html) — текущая структура:
```
forumTopicInfo {
  chat_id: int53          ← новое поле (раньше не было)
  forum_topic_id: int32   ← НОВОЕ название
  name: string
  icon: forumTopicIcon
  creation_date: int32
  creator_id: MessageSender
  is_general: Bool        ← новое поле (для General топика)
  is_outgoing: Bool
  is_closed: Bool
  is_hidden: Bool
  is_name_implicit: Bool
}
```

**В старых версиях TDLib (1.7.x и раньше)** было поле `message_thread_id` (int53). **В новых (1.8+)** переименовано в `forum_topic_id` (int32).

Наш проект использует `prebuilt-tdlib@0.1008064.0` → **TDLib v1.8.64** (новейшая на май 2026).

**Наш код до v0.89.29** в [`tdlibBackend.js:488`](../../main/native/backends/tdlibBackend.js):
```js
id: String(t.info?.message_thread_id || ''),  // ← поле НЕ существует в 1.8+
```

JS возвращает `undefined`, `String(undefined || '') === ''` → все topics получают `id=''` → `selectForumTopic` отправляет пустой topicId → backend `getTopic` отбрасывает request как "no topicId".

**Решение (v0.89.29)**:
```js
// Поддержка обоих имён (старое для backwards-compat если кто-то на старой TDLib)
const threadId = t.info?.forum_topic_id ?? t.info?.message_thread_id
const idStr = threadId !== null && threadId !== undefined ? String(threadId) : ''
```

Использован `??` (nullish coalescing) вместо `||` — `0` валидное значение для general topic (Telegram использует id=1 для general, но в любом случае не должны fall-through на falsy 0).

**Дополнительно** — добавили `isGeneral: !!t.info?.is_general` в наш topic объект для UI (можно отличать general от user-defined topics).

**Регрессионный лог** (для отладки):
```js
console.log('[forum-be] sample topic[0] info=' + JSON.stringify(result.topics[0].info) + ' unread=...')
```

При первом полученном topic печатает **сырую структуру** `info` от TDLib. Если TDLib снова переименует поле — увидим в первой же сессии.

**Правило**: при апдейте TDLib version (`prebuilt-tdlib` или системного TDLib) — **проверять breaking changes** в полях. TDLib **не использует semver** в смысле «1.8 не ломает 1.7». Каждый minor может переименовать или удалить поле.

**Способ обнаружения**:
1. При сомнениях — добавить `console.log(JSON.stringify(rawResponse))` для первого received объекта
2. Сверять с актуальной td_api spec (core.telegram.org/tdlib/docs/) — поля могут переименоваться

**Известные TDLib 1.7 → 1.8 переименования** (для справки):
- `forumTopicInfo.message_thread_id` → `forum_topic_id`
- Добавлено `forumTopicInfo.chat_id`
- Добавлено `forumTopicInfo.is_general`
- В `forumTopic` добавлено `order` (int64)

---

## 🔴 ЛОВУШКА #29 (v0.89.30): `forum_topic_id` ≠ `message_thread_id` (даже после v0.89.29 fix)

**Симптом** (логи 16:11, 18 мая 2026): после v0.89.29 пользователь снова не видит сообщений. Темы выделяются ✅, но при клике:

```
[topic-ui] topicId=1 ... (для General)
[topic-be] invoke ERROR err=Message not found

[topic-ui] topicId=2645 ... (для других)
[topic-be] invoke ERROR err=Scheduled messages can't have message threads
```

`topicId` теперь не пустой (v0.89.29 fix работает), но TDLib отвергает запросы. Я **передавал не то поле** в `getMessageThreadHistory`.

**Корневая причина — два РАЗНЫХ идентификатора в TDLib**:

📚 [TDLib forumTopicInfo](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html):
```
forumTopicInfo.forum_topic_id: int32   ← короткий UI-id (например 26320 или 1)
```

📚 [TDLib message](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message.html):
```
message.message_thread_id: int53    ← реальный id root-message thread'а
```

📚 [TDLib getMessageThreadHistory](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_message_thread_history.html):
```
getMessageThreadHistory {
  chat_id: int53
  message_id: int53      ← ОЖИДАЕТ id message thread'а (int53), не forum_topic_id (int32)
}
```

**Это два разных поля**:
| Поле | Тип | Назначение |
|---|---|---|
| `forumTopicInfo.forum_topic_id` | int32 | UI-id темы (короткий, ~26320) |
| `message.message_thread_id` | int53 | Реальный id root-message в thread'е (большой) |

В v0.89.29 я использовал `forum_topic_id` как `message_id` для `getMessageThreadHistory` — TDLib искал message с этим id, не находил → `Message not found` или случайно находил scheduled → `Scheduled messages can't have message threads`.

**Дополнительно**: General topic (`is_general: true`) не имеет thread root message. Для general нужен `getChatHistory`, не `getMessageThreadHistory`.

**Решение (v0.89.30)** — 3 правки:

1. **`tdlibBackend.js` getTopics** — сохраняем 2 идентификатора + флаг:
   ```js
   const threadMsgId = t.last_message?.message_thread_id ?? t.last_message?.id ?? null
   return {
     id: forumTopicIdStr,                              // UI-id
     topicId: forumTopicIdStr,
     threadMessageId: threadMsgId !== null ? String(threadMsgId) : null,  // для TDLib
     isGeneral: !!t.info?.is_general,                  // флаг для branch
     ...
   }
   ```

2. **`nativeStore.js` selectForumTopic + loadOlder/NewerMessages** — отправляем оба:
   ```js
   await window.api.invoke('tg:get-topic-messages', {
     chatId,
     topicId: ...,
     threadMessageId: topic.threadMessageId,
     isGeneral: !!topic.isGeneral,
     ...
   })
   ```

3. **`tdlibBackend.js` getTopic** — branch на 2 пути:
   ```js
   if (isGeneral) {
     // General — обычная история чата
     result = await client.invoke({ '@type': 'getChatHistory', chat_id, from_message_id, offset, limit })
   } else {
     // Обычная тема — message_thread_id (int53) из last_message
     const threadMessageId = Number(params.threadMessageId) || Number(params.topicId)
     if (!threadMessageId) return { ok: true, messages: [], hasMore: false }  // пустая тема
     result = await client.invoke({ '@type': 'getMessageThreadHistory', chat_id, message_id: threadMessageId, ... })
   }
   ```

**Регрессионная защита (vitest)**:
- `forum.getTopics`: проверяем что `topic.threadMessageId === '5000'` (из mock `last_message.message_thread_id`) + `isGeneral: false`
- General topic test: `is_general: true` → `isGeneral=true`, `threadMessageId=null` если нет `last_message`
- `messages.getTopic` General: проверяем что invoke `getChatHistory` (НЕ `getMessageThreadHistory`)
- `messages.getTopic` обычная тема: проверяем что invoke с `message_id: threadMessageId` (int53)
- Empty topic: нет `threadMessageId` и не general → `ok: true, messages: []` (не error)

**Правило**: в TDLib два разных идентификатора с похожим назначением могут существовать **одновременно**:
- UI-id (short, числовой, для display и list)
- Real id (long, int53, для API operations)

При использовании API operations всегда проверять — какое именно id требуется (читать `message_id_` description в TDLib docs). Не путать с UI-id из info-объекта.

**Известные пары UI-id vs Real-id в TDLib**:
- `forumTopicInfo.forum_topic_id` (int32 UI) vs `message.message_thread_id` (int53 для API)
- `userInfo.id` vs `User.id` (могут отличаться в разных контекстах)
- При сомнениях — `console.log(JSON.stringify(rawTdlibObject))` чтобы увидеть сырую структуру
