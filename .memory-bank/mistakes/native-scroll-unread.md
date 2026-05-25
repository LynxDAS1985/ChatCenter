# Ловушки: native-скролл и счётчик непрочитанных

**Извлечено из** `common-mistakes.md` 24 апреля 2026 (v0.87.54).
**Темы**: native InboxMode scroll, unread counter, markRead, groupedUnread, IntersectionObserver, firstUnread, load-older.
**Связанный handoff**: [`../native-scroll-diagnostics-handoff.md`](../native-scroll-diagnostics-handoff.md)

Секции `⚪ ИСТОРИЯ (РЕШЕНО)` удалены из этого файла — см. [`../archive/2026-04-common-mistakes-resolved.md`](../archive/2026-04-common-mistakes-resolved.md).

---

## 🔴 КРИТИЧЕСКОЕ: открыл чат с большим unread → mass-ack сразу обнуляет счётчик (v0.91.13)

### Симптом
Юзер открывает чат с unread=304 (или любым большим). Через ~400мс бейдж становится 0 БЕЗ реального чтения. В Telegram Web / mobile эти 304 msg тоже помечены как прочитанные.

### Корень
[`useForceReadAtBottom.js`](../../src/native/hooks/useForceReadAtBottom.js) hook срабатывает при `atBottom=true && unread>0` через `setTimeout 400мс` → отправляет `markRead(lastId)`.

При открытии чата с `messages=1` (или мало сообщений) `scrollHeight === clientHeight` → `bottomGap=0` → `atBottom=true` через onScroll-handler в `useInboxScroll.js`. Через 400мс hook отправляет markRead.

🥇 [TDLib `viewMessages` spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1view_messages.html): «All messages with message identifiers less than or equal to the maximum identifier are marked as viewed». **markRead принципиально работает по диапазону**, не по списку id. Это не баг TDLib — это договор API.

### Прямое доказательство (chatcenter.log 13:24:24)
```
chat-open AlphaPet ЧАТ unread=304 messages=1 bottomGap=0
force-read-schedule lastId=81257299968 unread=304 atBottom=true
force-read-fire lastId=81257299968 unread=304
store-unread-sync unread=0 active=true       ← TDLib mass-ack
badge-state unread=0 prevUnread=304          ← 304 → 0
```

### Решение (v0.91.13)
Threshold guard: при `unread > 30` — НЕ вызываем markRead. Ждём пока IntersectionObserver per-msg (`read-batch-send` каждые ~500мс по 5-20 msg) уменьшит unread до ≤30. Тогда force-read-at-bottom добивает остаток.

```javascript
export const FORCE_READ_MAX_UNREAD = 30

// в useEffect:
if (activeUnread > FORCE_READ_MAX_UNREAD) {
  logNativeScroll('force-read-skip', {
    chatId, reason: 'unread-too-high', unread: activeUnread, threshold: FORCE_READ_MAX_UNREAD,
  })
  return
}
```

### Граничные случаи
- unread=0 → skip (было до v0.91.13)
- unread=1..30 → markRead как раньше
- unread=31..3700 → skip, ждём per-msg IntersectionObserver
- IntersectionObserver не работает (большие msg, ratio<0.95) — закрыто v0.87.47 через rootMargin=-49%
- Юзер открыл с unread=304 и НЕ скроллит → счётчик остаётся 304. Корректно — он действительно не читал.

### Паттерн на нашем стеке
- **Telegram Web K**: [`appMessagesManager.readMessages`](https://github.com/morethanwords/tweb) для **видимых** msg per-IntersectionObserver, не bulk при открытии
- **WhatsApp Web**: тот же подход — при большом unread не помечать массово
- **Discord**: ACK по `last_visible_message_id`, не по `last_in_array`

### Правило
markRead(maxId) — mass-ack операция в API мессенджеров (TDLib `viewMessages`, MTProto `messages.readHistory`, Discord REST `/ack`). Любой UI-hook который вызывает её **обязан** иметь threshold guard для большого unread. Иначе UX будет «бейдж исчезает без чтения».

### Регрессионные тесты
[`useForceReadAtBottom.vitest.jsx`](../../src/native/hooks/useForceReadAtBottom.vitest.jsx):
- «unread=304 при atBottom → не markRead»
- «unread=30 (граница) → markRead»
- «unread=31 → не markRead»

---

## 🔴 КРИТИЧЕСКОЕ: prefetch newer стреляет N раз с одним afterId если backend возвращает только дубли (v0.91.12)

### Симптом
Юзер пролистывает вниз → программа дёргается, кнопка ↓ мигает, scrollHeight «дышит» на 10-15px. В логе `chatcenter.log` видно 4-10 одинаковых `load-newer-trigger afterId=X` за 1 секунду.

### Корень
В [`useInboxNewerPrefetch.js`](../../src/native/hooks/useInboxNewerPrefetch.js) условие `reachedEnd` смотрело только на:
- `result.hasMore === false`
- `result.messages.length === 0`

И **НЕ учитывало** случай «backend вернул 100 msg, но все дубли». В этом случае:
1. `result.ok = true`, `result.hasMore = true`, `result.messages.length = 100`
2. `reachedEnd = false` → `noMoreNewerRef` не ставится
3. `addHandler('tg:messages')` в `nativeStoreIpc.js` фильтрует дубли → state не меняется (v0.88.1 защита)
4. Через 300мс `loadingNewerRef` снимается → следующий wheel-tick запускает prefetch с тем же `afterId`
5. Цикл: 4-10 IPC-запросов за секунду пока юзер скроллит

### Почему backend возвращает дубли
По [TDLib `getChatHistory` spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html) — TDLib работает по `from_message_id + offset + limit` диапазону. Если в этом диапазоне есть сообщения которые уже пришли клиенту через `updateNewMessage` push до того как invoke завершился — backend всё равно возвращает их в массиве. `hasMore=true` показывает что есть **серверные** новые, не учитывая локальный кеш клиента.

### Решение (v0.91.12)
Расширили условие `reachedEnd` — фильтруем `result.messages` по `existingIds` (id уже в `activeMessages`). Если после фильтрации 0 — ставим флаг:

```javascript
const existingIds = new Set(activeMessages.map(m => m.id))
const newCount = (result?.messages || []).filter(m => m?.id && !existingIds.has(m.id)).length
const reachedEnd = !!result?.ok && (
  result?.hasMore === false
  || (Array.isArray(result?.messages) && result.messages.length === 0)
  || newCount === 0   // ← v0.91.12
)
```

### Страховка от ложного срабатывания
`useEffect` v0.88.2 в этом же файле сбрасывает `noMoreNewerRef.delete(key)` когда `activeMessages.length > prev`. После push `tg:new-message` массив растёт → флаг автоматически снимается → prefetch снова работает.

### Правило
Для prefetch паттерна «загрузка следующей страницы по cursor (afterId/beforeId/min_id)»:
1. Проверять `hasMore=false` — стандарт
2. Проверять `messages.length=0` — стандарт
3. **Проверять что после dedup с локальным state добавилось хоть что-то**. Без этого: dedup в merge возвращает 0 → state не меняется → prefetch триггерится снова → бесконечный цикл при scroll.

Это паттерн Telegram Web K (`historyMaxId.endReached`), Element/Matrix через virtuoso `endReached`, Discord через локальный кэш диапазонов.

### Регрессионный тест
`nativeStoreUnreadPrefetch.vitest.jsx` — «v0.91.12: после load-newer с только-дубликатами prefetch блокируется».

---

## 🔴 КРИТИЧЕСКОЕ: программный scrollTop в `useEffect` с deps `[messagesCount]` — silent killer (v0.91.2 → v0.91.7)

**Серия 4-х фиксов одной и той же мины** в разных ветках useInitialScroll.js. Записываю как **правило**, чтобы больше не повторять.

### Паттерн-мина

```javascript
useEffect(() => {
  if (someCondition) {
    scrollRef.current.scrollTop = X       // ← программная установка scrollTop
  }
}, [activeChatId, messagesCount, loading])  // ← deps включают messagesCount
```

**Почему стреляет**: на одно открытие чата приходит ~4 setState на messages[key]:
1. IDB cache (optimistic, instant)
2. TDLib server response
3. load-newer prefetch #1
4. load-newer prefetch #2

Каждый setState меняет `messagesCount` → useEffect ре-запускается → программный scroll → юзера дёргает.

Плюс юзер активно скроллит между этими событиями — каждый scroll сохраняет позицию в ref, и следующий useEffect читает **уже обновлённую** позицию и устанавливает её обратно. Получается **циклическая перезапись scrollTop**.

### Симптомы (как опознать)

- Юзер жалуется «программа сама прыгает» / «не запоминает позицию» / «перескакивает на середину»
- В логе видно несколько срабатываний `[some-scroll-event]` за 1-2 секунды
- Значения scrollTop колеблются (например 13678→10204→7811)
- `lastUserType=wheel lastUserAgoMs<500` рядом со scroll событием — значит юзер скроллит, программа перебивает

### Решение — паттерн `lastActiveChatIdRef`

```javascript
const lastActiveChatIdRef = useRef(null)
useEffect(() => {
  if (someCondition) {
    const isReturning = lastActiveChatIdRef.current !== activeChatId
    lastActiveChatIdRef.current = activeChatId
    if (isReturning) {
      scrollRef.current.scrollTop = X    // ← только при РЕАЛЬНОЙ смене чата
    }
  }
}, [activeChatId, messagesCount, loading])  // deps оставляем как есть
```

Эффект: useEffect по-прежнему запускается на каждый setState (что нужно для других веток), но программный scroll выполняется **один раз на смену activeChatId**.

### История фиксов (4 итерации, чтобы не повторять)

| Версия | Что починили | Что забыли |
|---|---|---|
| **v0.91.2** | Удалили `firstUnread` auto-jump из ветки already-seen | Оставили `savedScrollTop` restore с теми же deps |
| **v0.91.7** | Применили `lastActiveChatIdRef` к `savedScrollTop` восстановлению | — (закрыто полностью) |

### Регрессионный тест

`useInitialScroll.vitest.jsx`: тест «messagesCount изменился в том же чате — restore НЕ срабатывает». Симулирует 2 изменения messagesCount подряд, проверяет что `scrollEl.scrollTop` не меняется автоматически.

### Правило для будущего

**Перед добавлением нового `useEffect` который пишет в `scrollTop` / вызывает `scrollIntoView` / `scrollToRow`**:
1. Проверить deps useEffect
2. Если deps включают что-то что меняется при server-push / prefetch (`messagesCount`, `activeMessages`, `unreadCount` и т.д.) — применить паттерн `lastActiveChatIdRef`
3. Иначе scroll операция должна быть в **user-action handler** (onClick, onWheel и т.д.), не в useEffect

### Аудит проведён (v0.91.7)

Прошёл по всем `scrollTop = `, `scrollIntoView(`, `scrollToRow(` в `src/native/`:
- `useInitialScroll.js` — починено (2 ветки)
- `useInboxScroll.js handleScroll` — внутри user-scroll handler ✅
- `InboxMode.jsx scrollToBottom/scrollToMessage` — user click handlers ✅
- `useForceReadAtBottom.js` — НЕ трогает scroll ✅
- `VirtualMessageList.jsx` — только receives ref ✅

Больше мин этого типа в проекте **нет**.

---

## 🔴 КРИТИЧЕСКОЕ: первая загрузка топика — чёрный экран без skeleton + race при быстром переключении (v0.89.37)

### Симптом
1. Юзер кликает топик впервые → справа **чёрный экран** на 500-600мс пока не загрузятся сообщения. Только тогда появляется content.
2. При быстром переключении A → B → C ответы могут затирать активный state stale данными.

### Корневая причина #1 (skeleton)

[`InboxChatPanel.jsx:157`](../src/native/components/InboxChatPanel.jsx) до v0.89.37:
```js
<MessageListOverlay show={((!chatReady) || !!messagesLoading) && visibleMessages.length > 0} />
```

Условие `&& visibleMessages.length > 0` означает: overlay показывается **только когда уже есть сообщения**. На **первой загрузке топика** `messages=0` → overlay скрыт → юзер видит чёрный фон (контейнер ниже имеет `opacity: 0` пока `chatReady=false`).

Цепочка чёрного экрана:
1. t=0: клик → setState → messages=0, loading=true
2. visibleMessages.length === 0 → overlay НЕ показывается
3. `<div opacity={chatReady ? 1 : 0}>` → opacity=0 → чёрно
4. t=188: messages=18 пришли, loading=false
5. React rerender, virtual list mount, ref callbacks
6. t=~400: useInitialScroll закончил scrollTo → onDone() → setChatReady(true)
7. t=~600: opacity 0→1 transition 200мс → юзер видит content

Итого **~600мс чёрного экрана** на первой загрузке.

### Решение #1 (Skeleton)

Убрано условие `&& visibleMessages.length > 0`:
```js
<MessageListOverlay show={(!chatReady) || !!messagesLoading} />
```

Overlay показывается с **первого клика**, даже если messages=0. Это UX-стандарт всех мессенджеров (Telegram Desktop, WhatsApp Web, Discord, Slack).

### Корневая причина #2 (race)

[`nativeStore.js selectForumTopic`](../src/native/store/nativeStore.js) до v0.89.37 не имел защиты от race:
```js
const result = await window.api?.invoke('tg:get-topic-messages', ...)
setState(s => { ... messages: { ...s.messages, [key]: result.messages || [] } ... })
```

Если юзер кликнул A → B быстро:
- invoke A в полёте → ответ A пришёл когда активный B
- setState затирает `messages[keyA]` (вроде безвредно, но `loadingMessages[keyA]` может конфликтовать с активным)

### Решение #2 (race protection, Discord-style)

`selectTopicRequestRef = useRef(new Map())` хранит **последний requestId** на chatId. Каждый invoke получает свой `requestId`. После `await invoke` сравниваем — если в Map уже другой id, ответ **игнорируем**:

```js
const requestId = Date.now() + ':' + Math.random().toString(36).slice(2, 7)
selectTopicRequestRef.current.set(chatId, requestId)
// ...
const result = await window.api?.invoke('tg:get-topic-messages', ...)
if (selectTopicRequestRef.current.get(chatId) !== requestId) {
  return { ok: false, stale: true }   // stale response — игнорируем
}
setState(...)
```

Это паттерн как у Discord (AbortController) и Telegram Desktop (requestId сопоставление).

### Сверка с другими мессенджерами

| Мессенджер | Подход к первому открытию | Подход к race |
|---|---|---|
| Telegram Desktop | Локальный TDLib кэш на диске — instant render | requestId сопоставление |
| WhatsApp Web | IndexedDB cache + skeleton shimmer | Промис cancel |
| Discord | Skeleton + `AbortController` | AbortController |
| Slack | Skeleton + lastReadCursor | Promise.race с cancel |

### Регрессионная защита

[`nativeStore.vitest.jsx`](../src/native/store/nativeStore.vitest.jsx) тест:
- Кликаем A → invoke A в полёте (Promise не резолвится)
- Кликаем B → invoke B резолвится с 1 сообщением → `messages[keyB] = [1]`
- Резолвим ответ A → проверяем `messages[keyA] === undefined` (stale игнорирован)
- `messages[keyB]` не затёрт

### Правило

При каждом UI-инициированном async invoke который меняет видимый state:
1. **Показывать skeleton/overlay сразу** при клике, не ждать ответа сервера
2. **Сохранять requestId** до invoke, сравнивать после await — если в state уже другой запрос, игнорировать ответ

Это два паттерна вместе закрывают «чёрный экран» + «затирание state stale ответом» = базовый UX любого мессенджера.

---

## 🔴 КРИТИЧЕСКОЕ: divider «Новые сообщения» должен застывать на snapshot позиции открытия (v0.89.33)

### Симптом
Юзер открывает чат → видит divider «НОВЫЕ СООБЩЕНИЯ» в правильном месте. Листает вниз/вверх. Каждый раз когда `markRead` отправляется или Telegram присылает sync — **divider перепрыгивает на новую позицию** (всегда перед "первым непрочитанным" с точки зрения текущего `readInboxMaxId`). Создаёт ощущение «полоска постоянно появляется и куда-то прыгает».

### Корень
[`InboxMode.jsx:332`](../src/native/modes/InboxMode.jsx) пересчёт `firstUnreadId` имел в deps **живые** `activeUnread` + `activeReadInboxMaxId`. Каждый server sync менял эти значения → useEffect пересчитывал → divider сдвигался.

Лог 18:29-18:30 показал: за 36 секунд 8 пересчётов, divider сдвинулся на ~33 сообщения вперёд (`readCursor=56008 → 56042`).

### Решение (v0.89.33)
Snapshot ref на момент открытия чата, как в Telegram Desktop / WhatsApp / Discord:

```js
const frozenReadCursorRef = useRef({ viewKey: null, cursor: 0 })

useEffect(() => {
  // Сброс при смене чата
  if (frozenReadCursorRef.current.viewKey !== activeViewKey) {
    frozenReadCursorRef.current = { viewKey: activeViewKey, cursor: 0 }
  }
  // Фиксация на ПЕРВОМ НЕНУЛЕВОМ значении (данные могут прийти не сразу)
  if (frozenReadCursorRef.current.cursor === 0 && activeReadInboxMaxId > 0) {
    frozenReadCursorRef.current.cursor = activeReadInboxMaxId
  }
  // Snapshot для findFirstUnreadId, живое значение как fallback пока snapshot=0
  const snapshotCursor = frozenReadCursorRef.current.cursor || activeReadInboxMaxId
  const nextFirstUnreadId = findFirstUnreadId(activeMessages, clampedUnread, snapshotCursor)
  // ...
}, [activeViewKey, firstMsgId, lastMsgId, activeUnread, activeReadInboxMaxId])
```

**Ключевые моменты**:
- Snapshot замораживается на ПЕРВОМ ненулевом cursor (учитывает что данные могут прийти не сразу)
- Сбрасывается только при смене `activeViewKey` (новый чат/топик)
- Deps useEffect не тронуты — пересчёт всё ещё триггерится при `firstMsgId`/`lastMsgId` (нужно для подгрузки), но использует ЗАМОРОЖЕННЫЙ cursor
- Счётчик в боковой панели НЕ застужается — он живёт от `unreadCount` напрямую (не нарушает v0.87.41)

### Правило
UI-маркеры «прочитано до сюда» / «новые сообщения» / «закладка визита» в чатах **должны** быть snapshot значений на момент `openChat`, не живыми индикаторами серверного состояния. Это стандарт всех мессенджеров (Telegram Desktop, WhatsApp Web, Discord, Slack). Живой индикатор делает UX «полоска появляется при каждой синхронизации» — раздражающий и нестандартный.

При добавлении любых других «закладок состояния на момент открытия» (например «вы прочитали последнее сообщение в этой сессии» в WhatsApp-style) — повторять паттерн snapshot ref + сброс по [activeViewKey].

### Регрессионная защита
[`InboxMode.vitest.jsx`](../src/native/modes/InboxMode.vitest.jsx) — тест «v0.89.33: divider застывает на snapshot позиции при изменении readInboxMaxId»: рендер с `readInboxMaxId=99` → проверка divider перед msg #100 → rerender с `readInboxMaxId=101` → проверка что divider всё ещё перед msg #100, не прыгнул вперёд.

---

## 🔴 КРИТИЧЕСКОЕ: аватарки отправителей в группах — полная история ошибок (v0.87.27–v0.87.113)

### Симптом
Цветные круги с буквами вместо фотографий отправителей в групповых чатах.

### Корень ошибки #1 — v0.87.110 (неправильный источник аватарки)
`InboxChatPanel.jsx` использовал `activeChat.avatar` для ВСЕХ входящих — фото самого чата, не отправителя.
**Фикс**: `mapMessage` добавляет `senderAvatar` из файлового кэша. `InboxChatPanel.jsx` читает `item.senderAvatar`.

### Корень ошибки #2 — v0.87.111 (нет файлов для участников групп)
`loadAvatarsAsync` скачивает аватарки только диалогов (чаты из списка). Участники групп без прямого диалога — никогда не попадали в кэш.
**Фикс**: `downloadSenderAvatarsInBackground` — после `tg:get-messages` скачивает отправителей в фоне.

### Корень ошибки #3 — v0.87.112 (User без photo в базовой entity)
`downloadProfilePhoto(m.sender)` возвращает null если `sender.photo === null` (базовая GramJS entity). Из 7 отправителей скачивалось только 3.
**Фикс**: вызываем `GetFullUser` перед скачиванием — как делает `loadAvatarsAsync`.

### 🔴 Корень ошибки #4 — v0.87.113 (ГЛАВНЫЙ, скрытый) — `messageGrouping.js` теряет senderAvatar
`groupMessages()` создаёт группы без поля `senderAvatar`:
```js
currentGroup = { senderId, senderName, isOutgoing /* ← senderAvatar ОТСУТСТВУЕТ */ }
```
`item.senderAvatar` в `InboxChatPanel.jsx` всегда `undefined` → цветной круг.
Это перекрывало все предыдущие фиксы — файлы скачивались, IPC работал, но данные терялись в группировке.
**Фикс (v0.87.113)**: `senderAvatar: m.senderAvatar || null` в обоих местах создания group/album объектов.

### Правило
- При добавлении нового поля в message-объект — **сразу проверять `messageGrouping.js`** (строки 22, 62). Любое поле не перечисленное там — недоступно в `InboxChatPanel.jsx` через `item.*`.
- Никогда не использовать `activeChat.avatar` для аватарок сообщений. Только `item.senderAvatar`.

---

## 🔴 КРИТИЧЕСКОЕ: flex + maxWidth на content-sized parent = круговая схлопка (v0.87.62)

**Симптом**: bubble исходящих и входящих в чате становятся шириной 1-2 символов (каждая буква на своей строке), timestamp разбит по цифрам. Проявляется одинаково в групповых и приватных чатах для **коротких текстов**.

**Диагностика из лога v0.87.61** `bubble-width-diag`:
```
text=1111  bubbleW=39  groupW=60  groupRowW=588  scrollW=620
```
- `groupRowW=588` — корректно растянут (stretch в column parent)
- `groupW=60` — **content-sized** из-за `flex: 0 1 auto`
- `bubble maxWidth=65%` от `groupW=60` = 39px ← **рекурсивная схлопка**

**Корень**: `maxWidth: 65%` у bubble зависит от ширины parent (group). Но group имеет `flex: 0 1 auto` (= content-sized), значит ширина group = intrinsic content = ширина bubble. bubble = 65% от себя → схлопка до минимума.

**ПРАВИЛО**: Если родитель в flex-row/col имеет `flex: 0 1 auto` (content-sized) — **НЕ задавать `maxWidth: X%` детям**. Проценты от content-size = круговая зависимость → схлопка.

**ПРАВИЛЬНО (3 варианта)**:
1. `maxWidth: X%` ставить на parent (group), bubble внутри — `maxWidth: 100%`, `width: auto`
2. Parent делать `flex: 1 1 auto` или `width: 100%` — тогда `%` у bubble работают нормально
3. Использовать абсолютный `maxWidth: Npx` на bubble (не проценты)

**Решение (v0.87.62)**: выбран вариант 1 — `.native-msg-group` получила `maxWidth: 75%`, bubble внутри `maxWidth: 100%, width: auto`. Bubble content-sized внутри ограничения 75% row.

---

## 🟡 ВАЖНОЕ: `width: X%` vs `maxWidth: X%` на bubble-контейнере — разная семантика (v0.87.62)

**Симптом первой попытки v0.87.62**: юзер увидел пустые поля рядом с короткими bubble («111» в 75%-коробке, остальное пусто).

**Причина**: поставил `width: 75%` на `.native-msg-group` → bubble всегда занимает 75%, даже когда текста на 30px.

**ПРАВИЛО**: Для content-sized bubble (размер по тексту) — использовать `maxWidth`, не `width`. `width: X%` = всегда X%, `maxWidth: X%` = content-size до X%.

**Семантика**:
- `width: 75%` → коробка всегда 75%, короткий текст → пустое место
- `maxWidth: 75%` → коробка = content (до 75% лимита), короткий текст → компактно
- Выбор зависит от UX требования: «всегда одинаковая ширина» vs «компактно для коротких»

---

## 🔴 КРИТИЧЕСКОЕ: scrollTop — глобальное свойство div, а не per-chat state (v0.87.70)

**Симптом**: переключаешься между чатами, второй чат открывается на той же пиксельной высоте что первый. Если в первом был посередине — во втором тоже посередине.

**Корень**: `msgsScrollRef.current` — **один** `<div>` на всё приложение. `scrollTop` — CSS свойство этого div, в пикселях. При смене `activeChatId` React перерисовывает children (messages другие), но **scrollTop не сбрасывается автоматически** — остаётся от предыдущего чата.

**Доказательство из логов** (v0.87.69):
```
15:50:34 Дугин     → chat-open top=26743
15:50:34 Automarketolog → chat-open top=26743  ← пиксель в пиксель от Дугина
```

**ПРАВИЛО**: Когда один DOM-элемент обслуживает несколько логических scrollable списков (переключаемых через state) — нужно **хранить scrollTop в Map<key, number>** и восстанавливать при смене.

**Шаблон (v0.87.70)**:
```js
// В компоненте
const scrollPosByChatRef = useRef(new Map())

// В handleScroll — сохраняем на каждом скролле
if (activeChatId) {
  scrollPosByChatRef.current.set(activeChatId, el.scrollTop)
}

// При возврате к видимому чату — восстанавливаем (перед показом контента):
const saved = scrollPosByChatRef.current.get(activeChatId)
if (typeof saved === 'number') el.scrollTop = saved
```

**Приоритет поведения (как Telegram Desktop)**:
1. Есть firstUnread (новые пришли) → scrollIntoView на первое новое
2. Есть сохранённая позиция → восстановить
3. Ничего нет (первое открытие) → в низ

---

## 🟡 ВАЖНОЕ: Скрывать UI до onDone сигнала, а не по таймеру (v0.87.66)

**Симптом**: пользователь видит «прыжок» scrollbar при открытии чата даже когда был CSS fade-in 250мс на scroll-container.

**Причина**: CSS-animation на `mount` использует **фиксированное время** (250мс). А настоящее завершение initial-scroll зависит от:
- `setTimeout(150мс)` до scrollIntoView
- Задержка сервера `tg:messages` (loading=true пока ждём)
- DOM измерения после рендера

В среднем 200-500мс, может больше. Fade-in 250мс иногда успевает закончиться до initial-scroll → прыжок виден.

**ПРАВИЛО**: Когда UI должен скрывать асинхронный процесс с неопределённым временем — **не использовать CSS animations фиксированной длительности**. Использовать **state управляемый сигналом завершения** процесса.

**Пример (v0.87.66)**:
```js
// Хук процесса уведомляет о завершении
useInitialScroll({ ..., onDone: () => setChatReady(true) })

// UI реагирует на state
<MessageListOverlay show={!chatReady} />
<div style={{ opacity: chatReady ? 1 : 0, transition: 'opacity 200ms' }}>
  {/* content */}
</div>
```

При смене триггера (например `activeChatId`) — сбрасываем state:
```js
useEffect(() => setChatReady(false), [store.activeChatId])
```

**Контраст с CSS-только решением**:
- ❌ `@keyframes opacity 0→1 duration:250ms` — не знает реального завершения процесса
- ✅ `opacity: state ? 1 : 0, transition: opacity 200ms` — реагирует на актуальное событие

---

## 🟡 ВАЖНОЕ: после отправки msg нужен авто-скролл — scroll anchoring не сработает (v0.87.62)

**Симптом**: юзер отправляет сообщение → новый bubble добавлен в DOM ниже viewport → юзер остаётся на старой позиции, видит стрелку ↓ но не само сообщение.

**Причина**: когда новый элемент добавляется в конец scroll-контейнера (не выше текущей позиции), **browser scroll anchoring не применяется** — он работает только для insert-before (выше viewport). Для insert-after scrollTop не двигается автоматически.

**ПРАВИЛО**: Любое пользовательское действие добавляющее контент в конец scrollable области (отправка msg, apply filter, load-newer) — **ОБЯЗАНО** вручную скроллить вниз после действия.

**Шаблон**:
```js
// После успешного emit tg:new-message (или любого addToList)
setTimeout(() => {
  const el = msgsScrollRef.current
  if (el) el.scrollTop = el.scrollHeight
}, 50)  // 50мс чтобы React успел обновить DOM
```

**Применено в v0.87.62**: `InboxMode.jsx handleReplySend` после успеха отправки.

---

## 🔴 КРИТИЧЕСКОЕ: Telegram MTProto НЕ дублирует UpdateNewMessage для своих исходящих (v0.87.58)

**Симптом**: юзер отправил сообщение → `send-message OK messageId=X` в логах → но сообщение **не появляется в чате** до перезагрузки.

**Корень**: `client.sendMessage()` возвращает полный Message объект в response (включая `id`, `date`, `text`, `out=true`). Telegram **не присылает** `UpdateNewMessage` через listener-подписку для собственных отправок — это было бы дублированием.

Старый handler только возвращал `messageId` наверх, игнорируя остальной result. UI ждал `tg:new-message` event от listener'а входящих → никогда не получал его → сообщение не отображалось.

**ПРАВИЛО**: Любой IPC handler который делает действие в Telegram (sendMessage / sendFile / forward / edit) **обязан** emit'ить соответствующее событие в renderer **из response**, не полагаясь на MTProto listener:
- `client.sendMessage()` → `emit('tg:new-message', { chatId, message: mapMessage(result) })`
- `client.sendFile()` → то же самое
- `client.editMessage()` → `emit('tg:message-edited', ...)` если бы такой был
- `client.forwardMessages()` → для каждого forwarded → `tg:new-message`

**Где применено (v0.87.58)**: `tg:send-message` handler. Остальные (sendFile, forward) — проверить отдельно при жалобе пользователя.

**ВАЖНО установить `isOutgoing=true` перед emit** — mapMessage определяет это по `m.out`, но в некоторых случаях GramJS отдаёт объект где `out` не выставлен. Без `isOutgoing=true` сообщение будет выглядеть как входящее (слева вместо справа).

---

## 🟡 ВАЖНОЕ: диагностические useRef в логах ТОЖЕ должны сбрасываться при смене activeChatId (v0.87.53)

**Симптом**: В логе `badge-state` пишется `unread=13 prevUnread=0` при переключении на чат Geely после чата с unread=0. Создаёт ложную иллюзию что счётчик «вырос с 0 до 13».

**Корень**: диагностический `prevUnreadRef` в InboxMode хранил значение между рендерами, но НЕ сбрасывался при смене activeChatId. В итоге сравнивал unread нового чата со старым значением прошлого чата.

**Правило расширяется** (v0.87.52 + v0.87.53): любой useRef/useState в InboxMode, привязанный к конкретному чату — **включая используемые только для логирования** — должен сбрасываться в useEffect по activeChatId. Артефакты логов тратят часы на ложные расследования.

**Проверочный список state'ов в InboxMode** (v0.87.53 актуально):
- ✅ `readSeenRef, readBatchRef, lastReadMaxRef, maxEverSentRef, readTimerRef` — useEffect [activeChatId]
- ✅ `newBelow` (useState) — useEffect [activeChatId] → setNewBelow(0)
- ✅ `prevLastIdRef` в useNewBelowCounter — через параметр chatId
- ✅ `prevUnreadRef, prevUnreadChatIdRef` в InboxMode — сброс при смене id
- ✅ `firstUnreadIdRef` — пересчёт на смену activeChatId/firstMsgId/lastMsgId/activeUnread
- ✅ `prevNearBottomRef, prevScrollStateRef` — attached к scroll element, сами перезапишутся

---

## 🔴 КРИТИЧЕСКОЕ: State в InboxMode должен быть привязан к activeChatId (v0.87.52)

**Симптом**: Бейдж на стрелке показывает 41, а в списке чатов того же чата бейджа нет (unreadCount=0). Открыл другой чат — на стрелке видишь число из предыдущего чата плюс прирост.

**100% доказательство** из лога (v0.87.51 sticky):
```
new-below chat=Geely       added=33
(юзер переключился на Автопоток)
new-below chat=Автопоток   added=8
```
33 + 8 = 41 на стрелке. setState`newBelow` накапливалось между чатами.

**Корневая причина**: `useState(0)` в InboxMode для `newBelow` не сбрасывается по смене `store.activeChatId`. useState живёт на уровне компонента, activeChatId меняется — InboxMode не размонтируется, state остаётся.

То же самое было с `useNewBelowCounter`: `useRef(prevLastId)` накапливал id от разных чатов, при переключении видел разницу → считал как `added`.

**ПРАВИЛО**: Любой state в InboxMode специфичный для открытого чата **ОБЯЗАН** сбрасываться в `useEffect([activeChatId], ...)`. Список state'ов которые уже сбрасываются:
- `readSeenRef`, `readBatchRef` — set'ы увиденных msg id
- `lastReadMaxRef` — maxId последнего batch
- `maxEverSentRef` — watermark
- `readTimerRef` — таймер markRead
- `newBelow` (useState) — v0.87.52 добавлено
- В `useNewBelowCounter` — `prevLastIdRef` сбрасывается через принимаемый `chatId`

**Как проверять новый state**: задай себе вопрос — «если юзер переключит чат, имеет ли это значение?». Если значение специфично для чата (позиция, счётчик, увиденное, таймеры) — добавь сброс. Если общее для всех чатов (например, search query, mode) — не трогай.

**Риск при забывчивости**: silent UX-баги. Переключил чат — что-то «живёт» от предыдущего. Юзер не понимает почему. Обнаруживается только через реальное использование, не ловится юнит-тестами (если тестируются компоненты в изоляции).

**Связанные старые ошибки**:
- v0.87.42 — newBelow=50 при prepend (load-older). Решено: `useNewBelowCounter` по lastMsgId, а не по длине массива. Но chatId тогда ещё не учитывался — породило v0.87.52.
- v0.87.44 — `atBottom` default `useState(true)` срабатывал markRead при открытии. Сейчас default `false` + переоценка на scroll.

---

## 🔴 УРОК v0.87.45-50 → v0.87.51: не дублируй поля, синхронизация с сервером — единственный источник правды

**История**: v0.87.45 ввёл `chat.groupedUnread` (локальная группировка альбомов как 1 карточка) чтобы улучшить UX. Это породило **5 багов подряд** в v0.87.45-50:
- Альбом в бейдже считался как 1 вместо 5 → юзер не видел сколько непрочитанных
- `groupedUnread` stale после `markRead` → бейдж застревал на 23 хотя unread=0
- Расхождение «список чатов 16 / стрелка 28» (разные поля в разных местах)
- Разноска логики между main (recompute) и renderer (handler) — труднее отлаживать
- Клинч в логике синхронизации при одновременных событиях (new-message + markRead)

**Решение v0.87.51**: полный откат `groupedUnread`. UI показывает `chat.unreadCount` от Telegram API. Альбом = N фото в бейдже. Это не идеально (альбом = 1 карточка было бы приятнее), но **корректно** и **стабильно**.

**ПРАВИЛО**:
1. **Не вводи UI-поле которое переопределяет серверное** (`A ?? B`, `A || B`). Иначе придётся синхронизировать A **везде** где меняется B — лёгко пропустить один handler → stale.
2. **Источник правды — сервер**. Если серверный `unreadCount` MTProto считает альбом как N фото — пусть UI тоже показывает N. «Красивая группировка» должна делаться на сервере, не на клиенте.
3. **Если нужен вычисляемый UI-показатель** — вычисляй его **прямо в рендере** (не пиши в store):
   ```js
   const prettyCount = useMemo(() => computeGrouped(chat), [chat.unreadCount])
   ```
   Store хранит только серверные данные, UI делает трансформацию на лету.

**История версий с `groupedUnread`**: v0.87.45 (введение), v0.87.46 (в стрелке), v0.87.50 (clamp попытка исправить stale), v0.87.51 **удалено**.

---

## 🔴 КРИТИЧЕСКОЕ: гонка авто-load-older с initial-scroll + browser scroll anchoring (v0.87.48)

**Симптом**: Юзер открывает чат — встаёт не у первого непрочитанного/низа, а **далеко вверху, где-то в середине**. Ничего не скроллил сам.

**Причина** — ДВЕ автоматических системы одновременно меняют scrollTop:
1. **Browser Scroll Anchoring** (CSS Scroll Anchoring, Chrome 56+, включён по умолчанию): когда content добавляется **выше** текущей позиции viewport, браузер сам корректирует scrollTop чтобы сохранить видимую позицию. Работает когда anchoring НЕ отключён (нет `overflow-anchor: none`, scrollTop не менялся программно недавно, юзер не скроллит активно).
2. **Наша ручная формула** `scrollTop = scrollHeight - prevHeight` — тоже пытается сохранить позицию.

Когда обе срабатывают — наша формула **перебивает** правильное значение браузера (юзер уезжает в середину).

Гонка возникает при **открытии чата**:
- `chat-open` → scrollTop=0 → авто-триггер `load-older` в handleScroll (условие `scrollTop < 100`)
- `prevHeight = 0-based value` записано
- Parallel initial-scroll переставляет scrollTop в позицию firstUnread
- Приходит load-older result → DOM растёт → scroll anchoring работает
- setTimeout наш перебивает → юзер в середине

**ПРАВИЛО**: Любой авто-триггер `load-older`/`load-newer` в `handleScroll` **ДОЛЖЕН** быть заблокирован пока не завершилась initial-scroll. Сохраняйте `initialScrollDoneRef` в хуке `useInitialScroll` и проверяйте его перед любыми программными изменениями позиции.

**Решение (v0.87.48)**: `useInitialScroll` возвращает `{ doneRef }`. В `handleScroll` условие `if (initialScrollDoneRef.current !== activeChatId) return` блокирует все авто-триггеры load-older до тех пор пока initial-scroll не зафиксировал позицию.

**Почему раньше работало** (до этого бага): когда юзер вручную скроллит до верха (wheel events), scroll anchoring **автоматически отключается** браузером на время активного ввода. Тогда наша формула — единственный механизм, и работает правильно. Баг проявляется только когда авто-триггер срабатывает ДО любых действий юзера.

**Связанные места**: "Ловушка 103" (v0.87.40 diagnostic) — описывает тот же паттерн на уровне симптомов, но v0.87.48 закрывает корневую причину.

---

## 🔴 КРИТИЧЕСКОЕ: IntersectionObserver ratio≥0.95 недостижим для длинных msg (v0.87.47)

**Симптом**: Юзер прокручивает 5+ постов в чате с длинными сообщениями (юридические тексты, посты 800px+) — счётчик непрочитанных не уменьшается. В логах `[native-scroll]` **ноль** событий `read-scrolled-away`.

**Причина**: В `useReadOnScrollAway` был порог `intersectionRatio >= 0.95` как условие «msg был seen». Для сообщения крупнее viewport **ratio физически не может достичь 0.95**:
- Msg height = 800px, viewport = 570px → `ratio = 570/800 ≈ 0.71`
- Msg height = 1500px, viewport = 570px → `ratio ≈ 0.38`
- `0.95` возможно только когда msg ≤ viewport * 1.05

seenRef вечно false → фаза 2 (ушёл выше) пропускается → onRead не зовётся → markRead не шлётся → счётчик стоит.

**ПРАВИЛО**: НЕ использовать `intersectionRatio` для детекции «msg увиден» когда сам msg может быть крупнее root (viewport/контейнер). Ratio = видимая часть **относительно самого msg**, поэтому для больших msg он всегда малый.

**ПРАВИЛЬНО** (Telegram-style): IntersectionObserver с `rootMargin: '-49% 0px -49% 0px'` + `threshold: 0` — создаёт тонкую полосу 2% в центре root. Msg, пересекающий центр, триггерит isIntersecting=true. Работает одинаково для msg любого размера.

**Решение (v0.87.47)**: два observer — seen-observer (rootMargin в центре) + read-observer (обычный, отслеживает уход выше). Полная переписка `useReadOnScrollAway.js`.

**Важно**: Этот баг был **скрыт** в коротких чатах — в Телеграм-чатах с обычными сообщениями (3-5 строк) ratio 0.95 достижим, и логика работала. Проявился только на каналах с длинными постами (Автовоз и т.п.).

---

## 🔴 КРИТИЧЕСКОЕ: MTProto unread ≠ число "карточек" в ленте (v0.87.45)

**Симптом**: Пользователь открывает чат — видит 1 альбом с 9 фото. В ленте 1 карточка. Но бейдж показывает 9.

**Причина**: MTProto возвращает альбом как **N отдельных Message** с одинаковым `groupedId`. GramJS `GetPeerDialogs` → `unreadCount` = число сообщений (= 9), не карточек (= 1).

**ПРАВИЛО**: Если нужно «как в Telegram Desktop» — считать **уникальные groupedId** + сообщения без groupedId. Это делается через `getMessages(entity, { limit })` + группировка по `groupedId`.

**Решение (v0.87.45)**: новый IPC `tg:recompute-grouped-unread` — параллельный batch-пересчёт с FLOOD_WAIT защитой. Renderer хранит `chat.groupedUnread` и использует его приоритетнее `unreadCount` для отображения бейджа.

---

## 🔴 КРИТИЧЕСКОЕ: Локальная вычитка unreadCount → прыжки 36→25→35 (v0.87.41)

**Симптом**: При маркировке прочитанного счётчик дёргается: было 36 → стало 25 → стало 35 → 34.

**Причина**: `markRead(chatId, maxId, localRead)` делал ДВЕ вещи:
- Локально сразу вычитал `localRead` (оценка по видимым в экране — например 11)
- На сервер отправлял только `maxId` (прочитано фактически 1)

Оценка `localRead=11` и реальная `stillUnread=35` (после server sync) расходились → прыжок.

**ПРАВИЛО**: НЕ оптимистичные вычитания для счётчиков unread. Telegram Desktop тоже так делает — ждёт `readHistoryInbox` от сервера.

**Решение (v0.87.41)**: Убран `localRead`. Сигнатура `markRead(chatId, maxId)`. `unreadCount` меняется только через `tg:chat-unread-sync` от сервера.

---

## 🔴 КРИТИЧЕСКОЕ: default atBottom=true → markRead при открытии чата (v0.87.44)

**Симптом**: Пользователь открывает чат с 7 непрочитанными, ничего не трогает — через 400мс счётчик становится 1.

**Причина**: `useState(true)` для `atBottom`. `useForceReadAtBottom` при `atBottom=true && unread>0` через 400мс вызывает `markRead(lastMsgId)`. Так как scroll event ещё не произошёл — `atBottom` остаётся stale-default `true` → fire.

**ПРАВИЛО**: Флаги «пользователь в конце/видит последнее» должны быть **default false**. `true` выставляется только после реального scroll event.

**Решение (v0.87.44)**: `useState(false)`. `atBottom=true` только после `nearBottom<80` в `handleScroll`. Тест `useForceReadAtBottom.vitest.jsx` фиксирует регрессию.

---

## 🔴 БАГ В РАССЛЕДОВАНИИ: «1 сообщение в чате» при открытии (v0.87.117, 6 мая 2026)

### Симптом
Открываем чат — видим 1 (иногда 0) сообщений, хотя в реальном Telegram их сотни. Происходит со многими чатами при запуске. Перезапуск не всегда помогает.

### Два вероятных корня (не подтверждены логами, ждём диагностику)

**Корень A — `chatEntityMap` пуст в момент клика**

`loadChats` (`telegramChats.js`) заполняет `chatEntityMap` во время загрузки диалогов. Если пользователь кликнул по чату ДО того как диалоги подгрузились — `chatEntityMap.get(chatId)` возвращает `undefined`.

Тогда entity = `String(chatId).split(':').pop()` = просто числовая строка (`"-1001234567890"`). GramJS не может по голой строке найти канал/группу → `getMessages` возвращает 1 или 0 сообщений.

Результат: `tg:messages` не эмитируется (ошибка) → в UI остаётся кэш localStorage (1 старое сообщение).

**Корень B — FLOOD_WAIT из-за загрузки аватарок**

`loadAvatarsAsync` в `telegramChats.js` скачивает аватарки 659 чатов с throttle 200мс каждая → ~132 секунды работы. В это время Telegram rate-limit активен. Запрос `tg:get-messages` (который тоже обращается к Telegram API) получает FLOOD_WAIT → возвращает `{ ok: false }` → `tg:messages` не эмитируется → старый кэш остаётся.

### Где смотреть в коде

| Файл | Что | Строка |
|---|---|---|
| `main/native/telegramChats.js` | заполнение `chatEntityMap` | ~34 |
| `main/native/telegramMessages.js` | `tg:get-messages` handler | ~354 |
| `main/native/telegramMessages.js` | entity fallback (теперь логируется) | ~359-361 |
| `src/native/store/nativeStore.js` | `loadMessages` — показывает кэш сначала | ~138 |
| `src/native/store/nativeStoreIpc.js` | `tg:messages` handler | ~135 |

### Диагностические логи (добавлены в v0.87.117)

В `telegramMessages.js`, обработчик `tg:get-messages`:
```
get-messages WARN: entity-fallback chat=tg_XXX:-100123456 mapSize=0
get-messages: chat=tg_XXX:-100123456 got=1/50 hasEntity=false
get-messages err: FLOOD_WAIT ... [FLOOD_WAIT 15s]
```

**Что искать в логах**: строки `WARN: entity-fallback` (корень A) или `FLOOD_WAIT` (корень B).

### Фикс применён в v0.87.118 (6 мая 2026)

Пользователь подтвердил визуально: «я перезашел в чат и появились сообщения» — это поведение корня B (FLOOD_WAIT истёк, retry прошёл). Реализованы три изменения:

**1. Пауза аватарок** (`telegramChats.js` + `telegramMessages.js`):  
`state.msgRequestTs = Date.now()` ставится перед каждым `getMessages`. В `loadAvatarsAsync` проверяется — если прошло < 5с, ждёт. Аватарки больше не конкурируют с запросами сообщений.

**2. Авторетрай** (`nativeStore.js`):  
При `!result.ok` — автоматический повтор через 3 секунды. При успехе — `tg:messages` обновляет чат. При повторной ошибке — снимает `loadingMessages[chatId]`.

**3. Синяя полоска** (`InboxChatPanel.jsx`):  
`MessageListOverlay` показывается когда `loadingMessages[chatId] && visibleMessages.length > 0`. Пользователь видит кэш + индикатор загрузки вместо голого 1 сообщения.

### Как проверить (для пользователя — делать после перезапуска)

1. **Перезапустить приложение** (полностью закрыть, открыть заново)
2. **Сразу открыть любой групповой чат** (в первые 30 секунд после старта)
3. **Ожидаемое поведение:**
   - Вверху чата видна тонкая синяя полоска + надпись «Обновляю сообщения...»
   - Через 0-5 секунд сообщения появляются (50 штук)
   - Синяя полоска исчезает
4. **Если сообщений ещё нет через 10 секунд** — это значит FLOOD_WAIT больше 8 секунд. Подождать ещё немного — авторетрай сработает.
5. **Проверить в терминале** (там где запущено приложение):
   - `get-messages: chat=... got=50/50 hasEntity=true` — успех
   - `get-messages WARN: entity-fallback` — корень A ещё не исправлен
   - `get-messages err: ... [FLOOD_WAIT 15s]` — корень B, авторетрай должен сработать через 3с после истечения

### ✅ ЗАДАЧА ЗАКРЫТА (6 мая 2026, v0.87.118)

Пользователь подтвердил скриншотом: чат открывается и показывает множество сообщений от разных участников с аватарками. Баг «1 сообщение» устранён. Три механизма работают совместно.

### Как проверю я (по логам)

Попрошу пользователя показать вывод терминала после запуска. Буду искать:
- Есть ли `WARN: entity-fallback` → значит `chatEntityMap` пустой в момент клика (корень A ещё актуален)
- Есть ли `[FLOOD_WAIT Xs]` и как долго → если > 3с, авторетрай не поможет сразу, нужна другая стратегия
- Через сколько секунд после `FLOOD_WAIT` приходит следующий `got=50/50` → подтверждение что retry сработал

---

## v0.87.119 — UI сообщений (6 мая 2026)

### Что реализовано (для будущей проверки)

После закрытия бага «1 сообщение» пользователь запросил улучшения внешнего вида сообщений:

**1. Цвета отправителей** — `MessageBubble.jsx`, функция `getSenderColor(senderId)`:
- 7 цветов, детерминированы по `senderId % 7`
- Применяются в reply-блоке (полоска + имя), fwdFrom-заголовке, тултипе

**2. Тултип на reply-цитате** — `replyHover` state в MessageBubble:
- `onMouseEnter → setReplyHover(true)`, `onMouseLeave → setReplyHover(false)`
- Позиционируется `bottom: calc(100% + 6px)` от верха цитаты
- ЛОВУШКА: `onMouseLeave` выставлен на весь wrapper пузырька — при выходе мышки с пузырька тултип скрывается автоматически

**3. Кнопки НАД сообщением** — позиция `bottom: calc(100% + 3px)`:
- Для входящих: `right: 0` (кнопки справа над пузырьком)
- Для исходящих: `left: 0` (кнопки слева над пузырьком)
- ЛОВУШКА: `zIndex: 20` на кнопках, `zIndex: 50` на тултипе — тултип перекрывает кнопки

**4. Пересланные сообщения** — `fwdFrom` поле из `telegramMessageMapper.js`:
- GramJS `m.fwdFrom.fromName`, `m.fwdFrom.from?.firstName`, `m.fwdFrom.fromId?.userId`
- Рендеримся только если `m.fwdFrom !== null`

**5. Разбиение файла** — `telegramMessageMapper.js` (новый):
- Импортировать в `telegramMessages.js`, `telegramChats.js`, `telegramChatsIpc.js`
- `telegramMessages.js` re-export: `export { mapMessage, messagePreview }` для совместимости

### Как проверить v0.87.119

1. Открыть групповой чат → у каждого участника свой постоянный цвет
2. Кликнуть «Ответить» → в следующем сообщении reply-блок с цветной полоской слева
3. Навести мышку на reply-блок → тултип с полным текстом оригинала
4. Навести мышку на любое сообщение → кнопки появляются ВЫШЕ пузырька
5. Найти пересланное сообщение (переслано из другого чата) → «↪ Переслано от [имя]» вверху

---
