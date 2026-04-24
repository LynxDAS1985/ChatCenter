# Архив: решённые ловушки из common-mistakes.md

**Заархивировано** 24 апреля 2026 (v0.87.54).
**Причина архивации**: все эти секции помечены статусом `⚪ ИСТОРИЯ (РЕШЕНО)` в v0.87.51 — корневая причина устранена радикально (поле `groupedUnread` полностью удалено).
**Сохранено как учебный пример** — почему локальная оптимизация серверного значения через дублирующее поле породила 5 регрессий подряд.

Исходные строки в старом common-mistakes.md: 79-150, 199-234.

---

## ⚪ ИСТОРИЯ (РЕШЕНО в v0.87.51 радикально): stale groupedUnread при tg:chat-unread-sync

**Статус**: не актуально. Вся логика groupedUnread удалена в v0.87.51. Запись сохранена как учебный пример.


**Симптом**: юзер пролистывает чат до конца → сервер получает markRead → возвращает `unread=0`. Но бейдж в списке продолжает показывать старое число (23, 16, 3 — в разных чатах по-разному). Застревает до перезапуска или `window.focus`.

**История**:
- v0.87.45 ввели поле `chat.groupedUnread` для показа «карточек» (альбом=1) вместо сырого MTProto-числа.
- v0.87.46 обновили [ChatListItem.jsx:26](src/native/components/ChatListItem.jsx#L26): `badgeCount = chat.groupedUnread ?? chat.unreadCount`.
- **Забыли обновить sync-handlers**: `tg:chat-unread-sync` и `tg:unread-bulk-sync` в [nativeStore.js](src/native/store/nativeStore.js) писали **только** `unreadCount`, поле `groupedUnread` не трогали.
- Итог: сервер возвращает `unread=0` → в store `unreadCount=0, groupedUnread=23 (stale)` → UI `23 ?? 0 = 23`.

**Доказательство 100%** (из лога v0.87.49 для Geely EX5 EM-i):
```
18:38:48 [tg] UNREAD SYNC сервер=0
18:38:48 store-unread-sync unread=0 active=true
18:38:48 badge-state unread=0 grouped=23 badge=23 prevGrouped=23
```

**Фикс (v0.87.50)** — в handlers `tg:chat-unread-sync` и `tg:unread-bulk-sync` добавлен clamp:
```js
const nextGrouped = typeof c.groupedUnread === 'number'
  ? Math.min(c.groupedUnread, unreadCount)
  : c.groupedUnread
```
Семантика: grouped не может быть больше чем сообщений, которое сервер считает непрочитанными.

**ПРАВИЛО (эта ошибка не должна повторяться)**: когда вводишь поле в store с приоритетом в UI над другим полем (`A ?? B`) — **все IPC handler'ы, обновляющие B, должны также трогать A** (сбрасывать, clamp'ить или пересчитывать). Иначе stale A залипнет. Проверочный тест обязателен: написать regression который имитирует sync пустого значения B при непустом A.

**Связанные места в коде**, куда смотреть при похожих багах:
- [nativeStore.js tg:chats handler](src/native/store/nativeStore.js) — при merge/append убедиться что `groupedUnread` сохраняется или clamp'ится
- [nativeStore.js tg:new-message handler](src/native/store/nativeStore.js) — при append нового msg `unreadCount++`, но `groupedUnread` не известен — оставить как есть (его recompute подправит)

---

## ⚪ ИСТОРИЯ (РЕШЕНО в v0.87.51): счётчик непрочитанных застревает на N после пролистывания

**Статус**: закрыто. Корневая причина (stale `chat.groupedUnread` vs серверный `unreadCount`) устранена радикально — поле `groupedUnread` **полностью удалено** в v0.87.51 вместе со всей связанной логикой. UI теперь использует сырой `chat.unreadCount` от Telegram API. См. запись v0.87.51 в features.md.

Запись сохранена как учебный пример: «почему попытка локально улучшить серверное значение через дублирующее поле привела к 5 регрессиям подряд и пришлось откатить».

### Оригинальное описание (исторический контекст):


**Симптом**: в чате с unread=N юзер пролистал до последнего сообщения. Счётчик в списке и на стрелке остаётся N, не становится 0. Воспроизводится в разных чатах (Автовоз, АвтоБизнес, Ассоциация РОАД).

**ДОКАЗАНО по коду** (не гипотеза):

1. **[nativeStore.js:228](src/native/store/nativeStore.js#L228) handler `tg:chat-unread-sync`** обновляет ТОЛЬКО `chat.unreadCount`, поле `chat.groupedUnread` не трогает. Аналогично `tg:unread-bulk-sync`.

2. **[ChatListItem.jsx:26](src/native/components/ChatListItem.jsx#L26)** использует `badgeCount = chat.groupedUnread ?? chat.unreadCount`.

3. **Следствие**: если `groupedUnread=3` (прошлый recompute), а потом сервер прислал `unread=0` — бейдж всё равно показывает 3. Залипание до следующего recompute.

4. **recomputeGroupedUnread не вызывается после markRead** — только на `window.focus` и session restore. Между этими событиями UI показывает stale.

**НЕ доказано (v0.87.49 собирает данные)**:

- **Гипотеза A**: последние 1-3 msg не помечаются т.к. никогда не уходят выше viewport (фаза 2 `useReadOnScrollAway` не срабатывает).
- **Гипотеза B**: `scrollTop` прыгает с bottomGap=0 обратно вверх без видимой причины → `atBottom` false → `useForceReadAtBottom` cleanup убивает 400мс таймер до fire.

**Добавленная диагностика (v0.87.49)**:
- `force-read-schedule/skip/fire/cleanup` в `useForceReadAtBottom`
- `bottom-state-change` в handleScroll при переходах true↔false
- `scroll-anomaly` при Δtop>500px за <200мс (reasonGuess: height-changed / programmatic)
- `badge-state` при смене unreadCount/groupedUnread активного чата

**Правило на будущее**: когда вводится новое поле для UI которое ПЕРЕКРЫВАЕТ старое (groupedUnread ?? unreadCount) — оно ОБЯЗАНО обновляться ВСЕМИ теми же handler'ами что и старое. Иначе рассинхрон и stale UI. Либо смешивать поля прямо в handler'е (в `tg:chat-unread-sync` сбросить `groupedUnread` тоже), либо не вводить дублирующее поле вообще.

---


---

## ⚪ ИСТОРИЯ (РЕШЕНО в v0.87.51, удалено groupedUnread): расхождение бейджей «список 16 / стрелка 28» (v0.87.46)

**Статус**: не актуально. Поле `groupedUnread` удалено в v0.87.51, расхождение невозможно — оба места читают `chat.unreadCount`.

### Оригинальное описание (учебный пример):


**Симптом**: В списке чатов у «Автовоз» бейдж **16**, а на стрелке ↓ внутри чата — **28**. Один и тот же чат, разные числа.

**Причина**: В v0.87.45 ввели `chat.groupedUnread` (карточки, альбом=1) и переключили `ChatListItem` на него. Но в `InboxMode.jsx` стрелка-бейдж брала сырое `activeChat.unreadCount` (= MTProto-число, альбом=N фото). Список показывал карточки, стрелка — отдельные msgs.

**ПРАВИЛО**: Когда вводишь новое поле для UI (groupedUnread) — найди **ВСЕ** места где старое используется для отображения и обнови синхронно. `unreadCount` остаётся только для логики (findFirstUnreadId, markRead maxId, scroll anchor), в UI — `groupedUnread ?? unreadCount`.

**Решение (v0.87.46)**: В `InboxMode.jsx` добавлена переменная `activeUnreadCards = groupedUnread ?? unreadCount` — используется в кнопке-стрелке и её бейдже. `activeUnread` остался сырым MTProto — нужен для internal-логики (last N incoming msgs).

**Где искать при похожих разладах в будущем**: все места в `src/native/**/*.{jsx,js}` где `chat.unreadCount` или `activeUnread` попадают **напрямую** в JSX/title/tooltip — должны брать `chat.groupedUnread ?? chat.unreadCount`.

---

## ⚪ ИСТОРИЯ (РЕШЕНО в v0.87.45, частично отменено в v0.87.51): unreadCount из кэша `tg-cache.json` устаревает

**Статус**: актуально в main-процессе (кэш всё ещё сбрасывает unreadCount=0), но связанная логика groupedUnread удалена.

### Оригинальное описание:


**Симптом**: При рестарте приложения счётчики непрочитанных в списке чатов показывают устаревшие значения (из кэша после закрытия), а не реальные от сервера.

**Причина**: `saveChatsCache()` в `main/native/telegramHandler.js` сохранял объект чата целиком (`{ ...c }`) включая `unreadCount`. Между закрытием и открытием на сервере меняется unread → из кэша тянется старое значение → пока не придёт `tg:unread-bulk-sync`, пользователь видит неправду.

**ПРАВИЛО**: Счётчики (unreadCount, mentionsCount, reactionsCount) — ВСЕГДА свежие с сервера. В кэше должны быть только стабильные метаданные (title, avatar, type, id). При чтении кэша форсить `unreadCount: 0`.

**Решение (v0.87.45)**: `const cleaned = { ...c, unreadCount: 0 }` и при save, и при load. Реальные значения приходят через `tg:unread-bulk-sync` и `tg:grouped-unread` после первого rescan.

---

