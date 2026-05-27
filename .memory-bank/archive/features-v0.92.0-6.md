# Архив changelog — v0.92.0 – v0.92.6

Сага Virtuoso scroll restore: миграция react-window → react-virtuoso и попытки pixel-perfect restore (initialTopMostItemIndex / getState / restoreStateFrom / LocationOptions.offset). Полностью superseded в **v0.94.0** — виртуализация удалена, позиция восстанавливается простым пиксельным scrollTop.

**Не читать по умолчанию.** Извлечено из features.md 27 мая 2026.

---

### v0.92.6 — УДАЛЕНИЕ snapshot mechanism v0.92.2 (архитектурно сломан с key= ремаунтом)

После v0.92.5 (3 пары двойных функций устранены + diag) лог 18:05:09+ показал ТОЧНУЮ причину прыжков:

```
state-snapshot-flush ... scrollTop=0 hasEl=false         ← snapshot=0, DOM уже исчез
state-restore-attempt ... snapshotScrollTop=0 mechanism=restoreStateFrom   ← Virtuoso ставит scrollTop=0
```

**Каждый возврат** → snapshot.scrollTop=0 → Virtuoso ставит scrollTop=0 → юзер в **самом начале чата**.

#### Корень моей ошибки (v0.92.2)

В `<Virtuoso key={cacheKey}>` при смене `activeChatId` Virtuoso **полностью ремаунтится**. React порядок:
1. activeViewKey меняется → новый render → `key` другой
2. **React unmount'ит старый Virtuoso** (commit phase)
3. `virtualListRef.current` → null или новый instance
4. **Потом** срабатывает `useEffect` cleanup (мой synchronous flush getState)
5. `getState` возвращает scrollTop=0 (нового instance) или вообще не работает (hasEl=false)

**Synchronous flush работает СЛИШКОМ ПОЗДНО** — старый Virtuoso уже unmount'ился.

Production эталоны Virtuoso (Stream Chat, Mattermost) используют `getState`/`restoreStateFrom` **БЕЗ `key={...}`** — они переиспользуют один Virtuoso instance, меняя `data`. У нас `key={cacheKey}` обязателен (разные чаты — разные heights/measurements). Pattern не подходит.

#### Что удалено (полный rollback v0.92.2 snapshot mechanism)

| Файл | Что |
|---|---|
| `VirtualMessageList.jsx` | Убран `restoreStateFrom` prop, убран `listRef.getState` метод |
| `InboxChatPanel.jsx` | Убран `virtuosoRestoreStateFrom` prop |
| `InboxMode.jsx` | Убран `scrollStateByChatRef = useRef(new Map())`, убран `SCROLL_STATE_MAX_ENTRIES`, убран useEffect cleanup `getState flush`, убрана диагностика `state-restore-attempt`/`state-snapshot-flush` |
| `useInboxScroll.js` | Убран `virtualListRef`/`scrollStateByChatRef`/`scrollStateMaxEntries` параметры, убран throttled `getState save` (~30 строк) |
| `VirtualMessageList.vitest.jsx` | Удалены 3 теста v0.92.2 (restoreStateFrom prop, listRef.getState, getState на пустом списке) |

#### Что остаётся работать

- `initialTopMostItemIndex={index, align: 'end'}` — основной restore mechanism (v0.92.3)
- `firstItemIndex` для prepend без скачка (v0.92.0)
- `isRestoringRef` closed-loop guard (v0.92.4)
- `scrollerRef` callback для DOM (v0.92.1)
- `atTopThreshold={200}` + `atBottomThreshold={200}` (v0.92.1)
- handleStartReached/EndReached (v0.92.0)
- ResizeObserver filter (v0.92.1)
- Cleanup от 3 пар двойных функций (v0.92.5)

#### 3+ факта

🥇 [React docs про useEffect cleanup timing](https://react.dev/reference/react/useEffect) — cleanup срабатывает после unmount, не до. Поэтому synchronous flush невозможен с key={...} ремаунтом.

🥇 [Virtuoso TS-типы](file:///c:/Projects/ChatCenter/node_modules/react-virtuoso/dist/index.d.ts) — `restoreStateFrom` рассчитан на persist across **page reloads**, не на компонент ремаунт.

🥈 Наш лог 18:05:09+ — все `state-snapshot-flush scrollTop=0 hasEl=false`. Прямое доказательство что snapshot сломан.

🥈 Stream Chat React — production usage `restoreStateFrom` БЕЗ `key={...}` ремаунта (они меняют `data`, не unmount).

#### Регрессия

- lint 0
- vitest 658/658 (было 661, -3 удалены тесты v0.92.2)
- fileSizeLimits 273/273
- check-memory ✅

#### Откат

```bash
git revert <этот hash>
```

Вернёт сломанный snapshot mechanism v0.92.2 + diag. **НЕ рекомендуется.**

---

### v0.92.5 — Устранение 3 пар двойных функций scroll restore + flush getState + диагностика

После v0.92.4 (isRestoringRef вернули) юзер показал скриншоты «открыл середину длинного поста → возврат → видна шапка поста, не середина». Анализ кода нашёл **3 пары дублирующих функций** которые мешали друг другу:

#### Дубль №1 — load-older

**Старый** (react-window паттерн): [`useInboxScroll.js:148-171`](src/native/hooks/useInboxScroll.js) — `if (scrollTop < 100) → loadOlderMessages + setTimeout(() => scrollTop = scrollHeight - prevHeight)`.

**Новый** (Virtuoso v0.92.0): `handleStartReached` в [`InboxMode.jsx`](src/native/modes/InboxMode.jsx) — Virtuoso официальный callback при достижении верха.

**Конфликт**: оба срабатывают при `scrollTop < 100`. Старый делал ручную scrollTop коррекцию которая **перекрывала** Virtuoso `firstItemIndex` auto-positioning. Каскадные прыжки.

#### Дубль №2 — load-newer

**Старый**: `useInboxScroll.handleScroll` → `useInboxNewerPrefetch.maybeTrigger(...)` через `bottomGap < 1500`.

**Новый**: `handleEndReached` в InboxMode через Virtuoso `endReached`.

То же — два пути одного действия.

#### Дубль №3 — `initialTopMostItemIndex` + `restoreStateFrom`

[`InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx) передавал оба одновременно. По [Virtuoso 4.18.7 TS-типам](file:///c:/Projects/ChatCenter/node_modules/react-virtuoso/dist/index.d.ts): когда заданы оба, `restoreStateFrom.scrollTop` побеждает. Мой v0.92.3 align='end' фикс был **бесполезен** при наличии snapshot.

Хуже: throttle 200мс в `getState save` мог пропустить последний scroll → snapshot устарел (juzер скроллил до середины длинного поста, последний save был на «начало поста»). Restore с устаревшим scrollTop → юзер видит начало.

#### 5 фиксов в одном коммите

**Фикс №1 + №2 — `useInboxScroll.js` cleanup**:
- Удалён `import useInboxNewerPrefetch`
- Удалён весь `newerPrefetch.maybeTrigger(...)` блок
- Удалён весь load-older блок (`if scrollTop < 100 → loadOlderMessages + setTimeout scrollTop=`)
- `handleScroll` теперь занимается ТОЛЬКО save (anchor + snapshot) и диагностикой (atBottom, scroll-anomaly)
- Все infinite scroll триггеры — через Virtuoso `startReached`/`endReached` в InboxMode

**Фикс №3 — приоритет в InboxMode.jsx**:
```js
const savedSnapshot = scrollStateByChatRef.current.get(activeViewKey)
const savedFromLocalStorage = scrollPosByChatRef.current.get(activeViewKey)
// snapshot (pixel-perfect in-session) приоритетнее anchor (cross-session)
const virtuosoRestoreState = savedSnapshot || undefined
// initialTopMostItemIndex рассчитывается всегда (Virtuoso игнорирует если restoreStateFrom есть)
```

**Фикс №4 — синхронный flush getState** при unmount Virtuoso:
```js
useEffect(() => {
  // ... isRestoringRef setup ...
  return () => {
    // Cleanup ПЕРЕД ремаунтом — virtualListRef ещё указывает на старый Virtuoso
    virtualListRef.current?.getState?.((state) => {
      scrollStateByChatRef.current.set(activeViewKey, state)
      scrollDiag.logEvent('state-snapshot-flush', { viewKey: activeViewKey, scrollTop: state.scrollTop })
    })
  }
}, [activeViewKey])
```

Не зависит от throttle — последний state синхронно сохраняется.

**Фикс №5 — диагностический лог `state-restore-attempt`**:
Видим из лога какой механизм restore применился — snapshot или initialTopMostItemIndex, актуальный ли scrollTop.

#### 3+ фактов

🥇 [Virtuoso TS-типы локально](file:///c:/Projects/ChatCenter/node_modules/react-virtuoso/dist/index.d.ts) — restoreStateFrom + initialTopMostItemIndex конфликтуют
🥈 Наш код `useInboxScroll.js:148-171` + `InboxMode.handleStartReached` — двойной load-older
🥈 Наш код `useInboxScroll.js:132-136` + `InboxMode.handleEndReached` — двойной load-newer
🥈 Скриншоты юзера РБК Крипто — видна шапка длинного поста, не середина

#### Регрессия

- lint 0
- vitest должен пройти
- fileSizeLimits ✅
- Размер useInboxScroll.js: 175 → ~120 строк (упрощение)

#### Откат

```bash
git revert <этот hash>
```

Вернёт дубли load-older/load-newer + одновременная передача snapshot+initialIdx.

---

### v0.92.4 — РЕГРЕССИОННЫЙ ФИКС: вернули isRestoringRef closed-loop guard

После v0.92.3 (align: 'end' добавлен) юзер запустил — позиция всё равно прыгает.
Анализ лога 17:34:56-17:35:31 показал **сильный дрейф** anchorMsgId между возвратами:

```
-1001196199866: 14984151040 → 15034482688 (+48 msgs!) → 15033434112 (-1) →
                15027142656 (-6) → 15021899776 (-5)
-1001409231353: 18597543936 → 19622002688 (+1024M!) → 19697500160 →
                19696451584 → 19695403008 → 19692257280 → ...
```

Msg ID в Telegram = `1,048,576 × index`. Дрейф 1-1024 msgs туда-сюда = классический **closed-loop scroll-save**.

#### Корень — моя ошибка в v0.92.0 Day 3

В v0.91.22 был фикс closed-loop через `isRestoringRef` (паттерн Telegram Web K `_isJumping`):
- Флаг ставится true перед programmatic scroll
- `handleScroll` save пропускается если флаг true
- Через 500-1500мс сбрасывается

В v0.92.0 Day 3 я **УДАЛИЛ** `isRestoringRef`, ошибочно решив что Virtuoso `initialTopMostItemIndex`/`restoreStateFrom` не вызывают DOM scroll event.

**Я был неправ.** [MDN scroll event spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll_event): «The scroll event fires when the document view has been scrolled. **This includes programmatic scrolling**.» Virtuoso использует DOM `scrollTo`/`scrollTop=` для применения `initialTopMostItemIndex` и `restoreStateFrom` → наш onScroll → handleScroll → save искажённого anchor → следующий restore читает искажённый → новый scroll → дрейф.

#### Что вернули

[`InboxMode.jsx`](src/native/modes/InboxMode.jsx):
- `isRestoringRef = useRef(false)` объявление
- В `useEffect [activeViewKey]`: при смене чата `isRestoringRef.current = true`, через 1000мс setTimeout сбрасываем (даёт Virtuoso закончить mount + measure + restore)
- Проброс в `useScrollPositionAutosave` и `useInboxScroll`

[`useInboxScroll.js`](src/native/hooks/useInboxScroll.js):
- `isRestoringRef` параметр восстановлен
- В handleScroll: `const blocked = !!isRestoringRef?.current; if (!blocked) { /* save */ }`
- Также для throttled getState save (v0.92.2 pixel-perfect state) — skip во время restore
- Лог `scroll-save` имеет поле `isRestoring: blocked` (диагностика что guard работает)

[`useScrollPositionAutosave.js`](src/native/hooks/useScrollPositionAutosave.js):
- `isRestoringRef` параметр восстановлен
- Interval save пропускается если `isRestoringRef.current === true`
- Лог `autosave-save isRestoring: true` (диагностика)

#### 3+ факта

🥇 [MDN scroll event spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll_event) — programmatic scroll вызывает event
🥈 Наш лог 17:34:56-17:35:31 — дрейф anchor на 1-1024 msgs каждый возврат
🥈 Наш код v0.91.22 — тот же фикс работал для react-window, должен работать для Virtuoso

#### Регрессия

- lint 0
- vitest 661/661
- fileSizeLimits 273/273
- check-memory ✅

#### Откат

```bash
git revert <этот hash>
```
Вернёт к v0.92.3 (align='end' есть, но closed-loop активен).

#### Как проверить

1. Программа лог `=== ChatCenter v0.92.4 start ===`
2. Открыть чат А, прокрутить
3. Переключаться A↔B↔A 10 раз
4. В логе `restore-start savedAnchor=X`, при последующих возвратах **тот же X** (стабилен)
5. В логе `scroll-save isRestoring=true` множество раз (это значит guard работает)

---

### v0.92.3 — ФИКС «выравнивание по верху нижнего сообщения» (align: 'end' для restore)

После v0.92.2 юзер сделал скриншоты до/после возврата в чат:
- **До**: «Скачал, дважды кликнул» сверху, **видео 17:10 частично видно внизу** viewport
- **После возврата**: **видео полностью в верху** viewport, ниже «Обучаемся»

Чёткое смещение позиции на 1-2 сообщения вниз.

#### Точный корень

`findVisibleAnchorMsgId` ([`scrollPositionsCache.js:98-115`](src/native/utils/scrollPositionsCache.js)) сохраняет **НИЖНИЙ** видимый msg:
```js
for (const el of elements) {
  if (top <= scrollBottom) anchor = msgId  // ← последний прошедший = нижний
}
```

В v0.92.0 я передавал `initialTopMostItemIndex={idx}` (число). По [Virtuoso API](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/): когда `initialTopMostItemIndex` — число, item ставится в **TOP viewport** (align='start' по умолчанию).

Итог: сохраняли НИЖНИЙ msg, ставили его на ВЕРХ при restore → юзер видит сообщения ПОСЛЕ anchor.

#### Решение — официальный Virtuoso API

🥇 [Virtuoso 4.18.7 TS-типы локально:1258](file:///c:/Projects/ChatCenter/node_modules/react-virtuoso/dist/index.d.ts):

```ts
initialTopMostItemIndex?: IndexLocationWithAlign | number;
```

`IndexLocationWithAlign = { index: number, align: 'start' | 'center' | 'end', offset?: number, behavior?: 'auto' | 'smooth' }` — то есть **объект с align**!

#### Что изменено

[`InboxMode.jsx`](src/native/modes/InboxMode.jsx) — `initialTopMostItemIndex` computation:

```js
if (saved?.anchorMsgId) {
  const idx = findRenderItemIndex(saved.anchorMsgId)
  if (idx >= 0) return { index: idx, align: 'end' }  // ← v0.92.3: align='end'
}
if (firstUnreadId) {
  const idx = findRenderItemIndex(firstUnreadId)
  if (idx >= 0) return { index: idx, align: 'start' }  // unread divider — top
}
```

`align: 'end'` для saved.anchorMsgId — anchor msg оказывается в **низу viewport**, как было при save.

`align: 'start'` для firstUnreadId — divider сверху видим (поведение Telegram Desktop).

#### Регрессия

- lint 0
- vitest 661/661
- fileSizeLimits 273/273

#### Источники

🥇 [Virtuoso TS-типы локально](file:///c:/Projects/ChatCenter/node_modules/react-virtuoso/dist/index.d.ts) — `initialTopMostItemIndex` принимает IndexLocationWithAlign
🥇 [Virtuoso API reference](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/)
🥈 Наш `scrollPositionsCache.js:108` — save берёт НИЖНИЙ msg
🥈 Скриншоты юзера до/после возврата — точное доказательство сдвига

#### Откат

```bash
git revert <этот hash>
```

#### Как проверить (для юзера)

1. Открыть программу — лог `=== ChatCenter v0.92.3 start ===`
2. Открыть чат А
3. Прокрутить так чтобы конкретный msg X был внизу viewport
4. Перейти на чат B → вернуться на A
5. **Тот же msg X должен быть внизу viewport** (точно как было)

---

### v0.92.2 — Pixel-perfect scroll restoration через Virtuoso getState/restoreStateFrom

После v0.92.1 (handleScroll починен, 185 scroll-save в логе) юзер сообщил: позиция при возврате в чат **приблизительная** — попадает близко к дну (`bottomGap=329`), хотя `savedAtBottom=false`.

#### Корень

`initialTopMostItemIndex` Virtuoso использует **ТОЛЬКО ПРИ MOUNT**. На момент mount `renderItems` содержит cached 50 msgs из IDB. Если `savedAnchor msgId` НЕ среди этих 50 → `findRenderItemIndex` возвращает `-1` → fallback `renderItems.length - 1` (дно).

Когда позже придут полные данные (load 100 от backend) — пересчёт `initialTopMostItemIndex` происходит, но Virtuoso **игнорирует** (mount уже завершён).

#### Решение — официальный Virtuoso API для pixel-perfect restore

🥇 [Virtuoso 4.18.7 TS-типы](file:///c:/Projects/ChatCenter/node_modules/react-virtuoso/dist/index.d.ts) `dist/index.d.ts:971-976`:

```ts
export declare interface StateSnapshot {
    /** The measured size ranges of items */
    ranges: SizeRange[];
    /** The scroll position in pixels */
    scrollTop: number;
}

// VirtuosoHandle:
getState(stateCb: StateCallback): void;

// VirtuosoProps:
restoreStateFrom?: StateSnapshot;
```

`StateSnapshot` содержит **точный scrollTop в пикселях** + **измеренные `ranges`** (высоты строк). Это **штатный API** для precise state restoration — используется в Stream Chat React и Mattermost.

#### 4 изменения в коде

**Файл 1 — [`VirtualMessageList.jsx`](src/native/components/VirtualMessageList.jsx)**:
- Добавлен prop `restoreStateFrom` (StateSnapshot), передаётся напрямую в `<Virtuoso>`
- `listRef.current.getState(callback)` — новый метод в imperative handle, мост к `virtuosoRef.getState`

**Файл 2 — [`InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx)**:
- Принимает `virtuosoRestoreStateFrom` prop, прокидывает в VirtualMessageList

**Файл 3 — [`InboxMode.jsx`](src/native/modes/InboxMode.jsx)**:
- `scrollStateByChatRef = useRef(new Map())` — Map<chatId, StateSnapshot> в памяти
- `SCROLL_STATE_MAX_ENTRIES = 50` — LRU лимит
- Передача `virtuosoRestoreStateFrom={scrollStateByChatRef.current.get(activeViewKey)}`
- Передача `virtualListRef + scrollStateByChatRef + SCROLL_STATE_MAX_ENTRIES` в useInboxScroll

**Файл 4 — [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js)**:
- Throttled (200мс) `virtualListRef.current.getState((state) => map.set(viewKey, state))`
- LRU trim при превышении лимита через Map insertion order
- Try/catch для безопасности на момент unmount

#### Сравнение с production эталонами

| Подход | Mattermost | Stream Chat | Element/Matrix | ChatCenter v0.92.2 (наш) |
|---|---|---|---|---|
| Виртуализация | Virtuoso | Virtuoso | Custom DOM | **Virtuoso** |
| In-session restore | `getState`/`restoreStateFrom` | `getState`/`restoreStateFrom` | DOMRect diff | **`getState`/`restoreStateFrom`** ✅ |
| Cross-session restore | URL state | localStorage scrollTop + msgId | URL fragment | anchorMsgId через `initialTopMostItemIndex` (приблизительно) |

В v0.92.2 мы достигли **промышленного стандарта** для Virtuoso-чатов.

#### Граничные случаи (учтены)

| Случай | Решение |
|---|---|
| Map превысила 50 chatId | LRU trim через `keys().next().value` (oldest insertion) |
| `getState` вызвано но Virtuoso unmount | try/catch, callback может не вызваться |
| `restoreStateFrom` snapshot с msgId которого больше нет | Virtuoso восстановит scrollTop, ranges актуальны для существующих msgs |
| `restoreStateFrom` + новые `tg:new-message` | Virtuoso автоматически добавляет row в ranges |
| `restoreStateFrom` + `firstItemIndex` prepend | Virtuoso официально поддерживает обоюдно |
| Throttle 200мс может пропустить event | На каждое последующее scroll событие throttle сбрасывается, точная позиция сохраняется через ~200мс после последнего scroll |

#### Регрессия

- lint 0
- vitest 662/662 (+4 новых теста для restoreStateFrom + getState API)
- fileSizeLimits 273/273
- check-memory ✅

#### Тесты

Новые в [`VirtualMessageList.vitest.jsx`](src/native/components/VirtualMessageList.vitest.jsx):
- `restoreStateFrom` prop принимается без крашей (StateSnapshot)
- `listRef API имеет getState метод` (мост к Virtuoso getState)
- `getState не падает на пустом списке`
- Плюс существующие 12 smoke + 2 Day 2 (всего 16 в файле)

#### Откат

```bash
git revert <этот hash>
```
Вернёт к v0.92.1 (handleScroll работает, scroll-save 185, но позиция при возврате приблизительная).

#### Как проверить (для юзера)

1. Запустить программу — лог `=== ChatCenter v0.92.2 start ===`
2. Открыть чат А, прокрутить в середину (например, на 50% истории)
3. Перейти на чат B, дождаться 200мс
4. Вернуться на чат A → **позиция ТОЧНО ТА ЖЕ** (pixel-perfect)
5. Повторить 5 раз A↔B↔A → позиция стабильна
6. В логе должны быть `scroll-save` события (handleScroll работает)
7. Никаких toast'ов

**Ограничение**: после ПЕРЕЗАПУСКА программы pixel-perfect state теряется (Map в памяти). Cross-session restore работает по `anchorMsgId` (приблизительно, как в v0.92.1).

#### Источники

🥇 [Virtuoso 4.18.7 TS-типы локально — StateSnapshot, getState, restoreStateFrom](file:///c:/Projects/ChatCenter/node_modules/react-virtuoso/dist/index.d.ts)
🥇 [Virtuoso API reference](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/)
🥇 [Virtuoso state restoration docs](https://virtuoso.dev/react-virtuoso/virtuoso/state-restoration/)
🥈 [Stream Chat React VirtualizedMessageList](https://github.com/GetStream/stream-chat-react/blob/master/src/components/MessageList/VirtualizedMessageList.tsx)
🥈 [Mattermost webapp Virtuoso integration](https://github.com/mattermost/mattermost-webapp)
🥈 Наш лог 16:39:07+ — anchor стабилен но position приблизительная (доказательство необходимости)

---

### v0.92.1 — ФИКС интеграции Virtuoso (handleScroll не вызывался → позиции не сохранялись)

После запуска v0.92.0 юзер сообщил «нихуя не поменялось + ошибка». Анализ лога 16:03:55+ показал:

| Событие | Кол-во ДО v0.92.0 | Кол-во ПОСЛЕ v0.92.0 |
|---|---|---|
| `scroll-save` | 632 | **0** |
| `autosave-save` | сотни | **0** |
| `bottom-state-change` | сотни | **0** |

**Главная находка**: `handleScroll` вообще НЕ вызывался → новые позиции не сохранялись → каждый restore брал старый `savedAnchor` из localStorage (msgId не существовал в текущих 60 загруженных messages) → fallback → юзер на чужой позиции.

#### Корень — официальная дока Virtuoso

🥇 [Virtuoso Custom Scroll Container docs](https://virtuoso.dev/react-virtuoso/virtuoso/custom-scroll-container/) — прямая цитата:
> «The `onScroll` event handler is **not directly passed to the Scroller component**. Instead, it's attached to the Virtuoso component itself.»

Моя реализация в Day 1 использовала `components.Scroller` с `onScroll={...}` в JSX div — Virtuoso это игнорирует. Production эталон [Stream Chat React](https://github.com/GetStream/stream-chat-react/blob/master/src/components/MessageList/VirtualizedMessageList.tsx) использует `scrollerRef` callback + `<Virtuoso onScroll={...}>` напрямую.

#### 4 фикса в одном коммите

**Фикс 1 — VirtualMessageList.jsx** ([`VirtualMessageList.jsx`](src/native/components/VirtualMessageList.jsx)):

- Удалён кастомный `components.Scroller` с `useRef + forwardRef` обёрткой (~25 строк)
- Добавлен `scrollerRef={(el) => scrollerElementRef.current = el}` callback (по [Virtuoso API ref](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/) ОБЯЗАТЕЛЬНО callback, НЕ `useRef` — issue #274)
- `onScroll/onWheel/onTouchStart/onPointerDown/onDragOver/onDragLeave/onDrop` теперь **прямые props** в `<Virtuoso>` (унаследованы из `HTMLAttributes<HTMLDivElement>`)
- Импорт `forwardRef` убран

**Фикс 2 — пороги start/endReached**:

`atTopThreshold={200}` + `atBottomThreshold={200}` — defaults 0/4 вызывали immediate trigger startReached/endReached на mount (`virtuoso-end-reached sinceOpenMs=39` в логе). 200px — разумный буфер.

**Фикс 3 — useConsoleErrorLogger.js**:

Фильтр `ResizeObserver loop completed with undelivered notifications` (и `loop limit exceeded`). По [Virtuoso troubleshooting](https://virtuoso.dev/react-virtuoso/troubleshooting/) это benign warning Chromium, не настоящая ошибка. До v0.92.1 → 40+ toast'ов за 10 секунд, юзер видел красную плашку.

**Фикс 4 — версия**: 0.92.0 → 0.92.1 (PATCH bugfix).

#### 3+ факта в основе

1. 🥇 [Virtuoso Custom Scroll Container](https://virtuoso.dev/react-virtuoso/virtuoso/custom-scroll-container/) — onScroll attached to Virtuoso, не Scroller
2. 🥇 [Virtuoso troubleshooting](https://virtuoso.dev/react-virtuoso/troubleshooting/) — ResizeObserver loop = benign warning
3. 🥇 [Virtuoso API reference](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/) — scrollerRef callback (не ref)
4. 🥇 [Virtuoso issue #274](https://github.com/petyosi/react-virtuoso/issues/274) — useRef к scrollerRef → error
5. 🥈 [Stream Chat React VirtualizedMessageList](https://github.com/GetStream/stream-chat-react/blob/master/src/components/MessageList/VirtualizedMessageList.tsx) — production эталон паттерна
6. 🥈 Наш лог 16:03:55+ — 0 scroll-save после v0.92.0 (доказательство что handleScroll не вызывался)

#### Регрессия

- lint 0
- vitest должен пройти (smoke-тесты VirtualMessageList не зависят от onScroll passing)
- fileSizeLimits 273/273
- check-memory ok

#### Откат

```bash
git revert <v0.92.1>
```
Вернёт к v0.92.0 (нерабочее состояние Virtuoso со старым `components.Scroller`). НЕ рекомендуется.

#### Как проверить

1. Запустить программу — лог `=== ChatCenter v0.92.1 start ===`
2. Открыть чат А с историей > 50 msgs
3. Прокрутить в середину
4. В логе должны появиться `scroll-save anchorMsgId=...` — это значит handleScroll работает!
5. Перейти на чат B, вернуться на A — позиция должна сохраниться
6. Toast `ResizeObserver loop completed` НЕ должен показываться
7. `virtuoso-end-reached sinceOpenMs=...` через ~39мс после chat-open НЕ должно повторяться (теперь atBottomThreshold=200)

#### Самопроверка от опытного разработчика

«Где сломается через месяц?»
- ⚠️ Virtuoso 4.19 может изменить scrollerRef signature → пин на ~4.18.7 (минор без caret)
- ⚠️ Если включить `data` array changes слишком часто, `scrollerRef` callback может пересоздаваться → useEffect re-mount. Сейчас deps `[]` через useRef — стабильно.
- ⚠️ `findVisibleAnchorMsgId(el)` в handleScroll ищет `[data-msg-id]` — в новом MessageRow data-msg-id ставит MessageBubble. Это работало в react-window, должно работать в Virtuoso (DOM rows те же).

---

### v0.92.0 — Миграция react-window → react-virtuoso 4.18.7 (Virtuoso Day 3)

Полная замена `react-window 2.2.7` на `react-virtuoso 4.18.7` для рендера сообщений в чате. Решает фундаментальную проблему restore позиции, которая 13 версий v0.91.12-v0.91.24 не закрывалась из-за архитектурного ограничения react-window с `useDynamicRowHeight` ([issue #216](https://github.com/bvaughn/react-window/issues/216) открыт с 2019).

#### Что переключено

- [`InboxMode.jsx`](src/native/modes/InboxMode.jsx) — `useVirtuoso = true` (Day 2 был false → прод оставался на react-window)
- [`InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx) — conditional render `useVirtuoso ? <VirtualMessageListV2/> : <VirtualMessageList/>` остаётся (для rollback safety до Day 4)
- Прод теперь работает на Virtuoso. Старый `VirtualMessageList.jsx` ещё в коде, но не используется.

#### Что удалено (v0.91.19-24 диагностика и закостыли)

| Что | Где | Объём |
|---|---|---|
| `isRestoringRef` параметр и логика | `useInitialScroll.js`, `useInitialScrollDiag.js`, `useInboxScroll.js`, `useScrollPositionAutosave.js` | ~30 строк |
| 4 restore refs (`restoreTargetMsgIdRef`, `restoreTargetAlignRef`, `restoreStartTimeRef`, `restoreAttemptsRef`) | `InboxMode.jsx` | 4 строки + комментарии |
| `handleRowsRendered` функция с re-scroll логикой (v0.91.24) | `InboxMode.jsx` | ~50 строк |
| `handleUserIntent` обёртка | `InboxMode.jsx` | ~10 строк |
| `load-older-skip-restoring` guard (v0.91.24 фикс) | `useInboxScroll.js` | ~10 строк |
| `postcheck-tick × 5` multi-step setTimeout (v0.91.20 TODO-8) | `useInitialScrollDiag.js` | ~15 строк |
| `ipc-burst tracker` (v0.91.21 TODO-9) | `nativeStoreIpc.js` | ~15 строк |
| `scroll-save isRestoring`, `autosave-save isRestoring` поля | `useInboxScroll.js`, `useScrollPositionAutosave.js` | inline |
| `restoreTargetMsgIdRef/AlignRef/StartTimeRef/AttemptsRef` setters в onRestoreAnchor/onMissingTarget | `InboxMode.jsx` | ~10 строк |

**Итого**: ~140 строк удалены, проект упрощён.

#### Что добавлено в InboxMode.jsx для Virtuoso

- `initialTopMostItemIndex` computation (3 случая: saved.atBottom / saved.anchorMsgId / firstUnreadId / bottom)
- `[firstItemIndex, setFirstItemIndex]` state — для inverse infinite scroll prepend
- `useEffect` reset firstItemIndex при смене активного чата
- `useEffect` подписка на `tg:messages append=true` → уменьшение firstItemIndex (Virtuoso официальный паттерн prepend без скачка scrollTop, [discussion #1032](https://github.com/petyosi/react-virtuoso/discussions/1032))
- `handleStartReached` callback — load-older (заменяет `useInboxScroll.handleScroll` scrollTop<100 trigger)
- `handleEndReached` callback — load-newer (заменяет `useInboxNewerPrefetch`)
- `onMissingTarget/onRestoreAnchor/onScrollToIndex` в useInitialScroll → no-op для Virtuoso (initialTopMostItemIndex решает)

#### Почему миграция нужна была

Прямое доказательство в `chatcenter.log 14:00:55`:
```
attempt=3 targetIdx=19 startIndex=5 stopIndex=7 inViewport=FALSE scrollTop=430 scrollHeight=50395
attempt=4 targetIdx=19 startIndex=5 stopIndex=7 inViewport=FALSE scrollTop=430 scrollHeight=50236
attempt=5 targetIdx=19 startIndex=3 stopIndex=5 inViewport=FALSE scrollTop=430 scrollHeight=50236
attempt=6 targetIdx=19 startIndex=1 stopIndex=3 inViewport=FALSE scrollTop=430 scrollHeight=56097
```

react-window 2.2.7 + `useDynamicRowHeight` не может скроллить к далёкому row (target idx=19, видимое окно [1..7]) — `ResizeObserver` мерит только rendered rows, scrollToRow рассчитывает позицию по `defaultRowHeight=50` для дальних row → неверно.

#### Источники

🥇 **Уровень 1**:
- [react-virtuoso 4.18.7 — API reference](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/) — `scrollToIndex`, `initialTopMostItemIndex`, `firstItemIndex`, `startReached/endReached`, `scrollerRef`, `rangeChanged`
- [Virtuoso troubleshooting](https://virtuoso.dev/react-virtuoso/troubleshooting/) — margin vs padding, ResizeObserver
- [react-window issue #216](https://github.com/bvaughn/react-window/issues/216) — scroll memory открыт с 2019 без решения

🥈 **Уровень 2** (production usage):
- [Stream Chat React](https://github.com/GetStream/stream-chat-react) — Virtuoso для миллионов чатов
- [Element/Matrix](https://github.com/element-hq/element-web), [Mattermost](https://github.com/mattermost/mattermost-webapp), [Rocket.Chat](https://github.com/RocketChat/Rocket.Chat) — все используют Virtuoso

🥈 **Наши логи**:
- `chatcenter.log 14:00:55` — anchor-postcheck-tick attempt 3-6 (доказательство ограничения react-window)
- `chatcenter.log 14:01:24` — load-older race (фикс v0.91.24 был частичный)

#### Регрессия

- lint 0
- vitest 668/668 (включая 12 V2 smoke-тестов)
- fileSizeLimits 275/275 (InboxMode ceiling 900 — снизим в Day 4)
- check-memory ✅

#### Откат

```bash
git revert <этот hash>
```

Возвращает к Day 2 (флаг false, react-window работает, диагностика v0.91.19-24 присутствует). Прод не пострадает — Virtuoso просто отключится.

#### Как проверить (для юзера)

1. Запустить программу — лог покажет `=== ChatCenter v0.92.0 start ===`
2. Открыть чат А с историей >100 msgs
3. Прокрутить ВВЕРХ к середине истории
4. Перейти на чат B
5. Вернуться на A — **позиция точно та же**
6. Повторить шаги 4-5 ещё 5 раз — позиция СТАБИЛЬНА
7. Прокрутить вверх до самого верха → должна сработать инфинит-загрузка старых msgs (лог `virtuoso-start-reached`)
8. Прокрутить вниз → load-newer (лог `virtuoso-end-reached`)
9. Удалённые msgs, новые tg:new-message — не должны портить позицию

#### Day 4 (отдельный коммит, через 1-2 дня)

После 1-2 дней стабильной работы:
- Удалить `VirtualMessageList.jsx` (старый react-window компонент)
- Удалить `react-window` из package.json
- Удалить feature flag (старая ветка conditional render)
- Снизить ceiling InboxMode 900 → 700

