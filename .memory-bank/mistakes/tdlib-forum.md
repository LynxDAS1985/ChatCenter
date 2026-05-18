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
