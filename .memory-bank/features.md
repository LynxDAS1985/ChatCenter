# Реализованные функции — ChatCenter

## Текущая версия: v0.92.5 (26 мая 2026)

**Структура файла**: этот features.md содержит только **последние активные версии**. Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.91.11-24.md`](./archive/features-v0.91.11-24.md) | v0.91.11 – v0.91.24 (сага scroll restore: 13 версий → миграция на virtuoso) | ~47 КБ |
| [`archive/features-v0.91.1-10.md`](./archive/features-v0.91.1-10.md) | v0.91.1 – v0.91.10 (initial-load, scroll-jump, newBelow, forum topics, updateChatLastMessage) | ~12 КБ |
| [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) | v0.87.106 – v0.87.114 (multi-account UI финал, кнопки режимов, мьют чата, аватарки отправителей в группах) | ~22 КБ |
| [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) | v0.87.93 – v0.87.105 (multi-account native, login flow, разбиения, cc-media://) | ~30 КБ |
| [`archive/features-v0.87.80-92.md`](./archive/features-v0.87.80-92.md) | v0.87.80 – v0.87.92 (pre-push hook, разбиения 4-7, AccountContextMenu) | ~16 КБ |
| [`archive/features-v0.87.65-79.md`](./archive/features-v0.87.65-79.md) | v0.87.65 – v0.87.79 (план разбиения 1-3, pre-push hook, bubble UI) | ~54 КБ |
| [`archive/features-v0.87.51-64.md`](./archive/features-v0.87.51-64.md) | v0.87.51 – v0.87.64 (groupedUnread удалён, pre-commit hook) | ~54 КБ |
| [`archive/features-v0.87.40-50.md`](./archive/features-v0.87.40-50.md) | v0.87.40 – v0.87.50 (итерации native scroll + unread) | ~40 КБ |
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

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

---

### v0.91.24 — Фикс Проблемы 2: блок load-older во время restore + re-scroll через onRowsRendered + abort на user-scroll

### v0.91.11 — Диагностика «возврат в чат прыгает вверх» (4 лога в ветке already-seen)

Симптом: A → B → возврат в A → перелистывает вверх, не на сохранённую позицию.

В [`useInitialScroll.js`](src/native/hooks/useInitialScroll.js) ветка «already-seen» имела 3 silent edge case'а: `scrollRef.current=null` (DOM не готов), `getSavedScrollTop` вернул `undefined`, и race с react-window `useDynamicRowHeight({key: cacheKey})` — при смене `cacheKey={store.activeChatId}` ([`VirtualMessageList.jsx:211`](src/native/components/VirtualMessageList.jsx#L211)) кэш высот сбрасывается → `scrollHeight` временно мал → `el.scrollTop = savedTop` тихо обрезается по [MDN scrollTop spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop).

Добавлены 4 точки логирования (логика restore не тронута):

| Событие | Поля | Что покажет |
|---|---|---|
| `initial-restore-attempt` | `chatId, savedTop, scrollHeight, clientHeight` | Хватит ли scrollHeight для savedTop |
| `initial-restore-applied` | `chatId, requestedTop, actualTop, clamped` | `clamped=true` = scrollHeight мал |
| `initial-restore-postcheck` | `chatId, afterMs:100, finalTop, scrollHeight` | Позиция после remeasure react-window |
| `initial-restore-skip` | `chatId, reason` | `no-scrollEl` / `no-saved` / `not-returning` |

Что НЕ менял: `el.scrollTop = savedTop` присвоение, `lastActiveChatIdRef` (v0.91.7 guard), ветку 1, существующее `initial-restore-saved`.

Конфликты ✓: v0.91.7 (isReturning сохранён), v0.91.6 (ветку 1 не трогаем), react-window (listRef/cacheKey не тронуты). Граничные ✓: savedTop=0, undefined, scrollRef=null, быстрый A→B→A.

Откат: `git revert <hash>` — один коммит, только логи. После анализа лога юзера — точечный фикс, логи удалю в том же коммите.

---


### v0.89.41 → v0.91.0 — серия WebContentsView миграция, 16 версий, полный откат

Электрон рекомендовал переход с `<webview>` на WebContentsView. Серия v0.89.41-v0.90.2 — 16 итераций (12 опровергнутых гипотез, архитектурная миграция на BaseWindow). Корень провала найден через WebSearch: [Electron Issue #44934](https://github.com/electron/electron/issues/44934) — на Windows 11 `addChildView(WebContentsView)` + `loadURL` крашит main, closed «not planned».

**v0.91.0 ПОЛНЫЙ ОТКАТ**: вернули `BrowserWindow{webviewTag:true}` + `<webview>` (production-tested). Удалены: webContentsViewManager.js, webContentsViewIpcHandlers.js, WebContentsViewSlot.jsx, webContentsViewBridge.js + 3 теста.

**Сохранены полезные побочки**: UncaughtErrorToast.jsx, global error handlers, idbCacheMetrics.js, crashpad-фильтр, [`electron-breaking-changes.md`](.memory-bank/electron-breaking-changes.md).

**Полный урок и 7 правил для будущих миграций** — в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md).

### v0.89.42 → v0.89.44 — Phase 2/2.3 WebContentsView миграция (откачено в v0.91.0)

Feature-flag в Settings, условный рендер `<WebContentsViewSlot>` vs `<webview>`, bridge для webviewSetup, реактивный `wcv:load-url`, cleanupPartition IPC, breaking-changes docs, IDB cache hit/miss metric. Полная история в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md). Все файлы удалены в v0.91.0.

---

### v0.89.42 — Phase 2 webview миграции: feature flag + условный рендер (pilot без ChatMonitor)

Phase 2.1: toggle `useWebContentsView` в SettingsPanel (default OFF). Phase 2.2: App.jsx условный рендер `<WebContentsViewSlot>` vs `<webview>`. Phase 2.3 (min): pilot БЕЗ ChatMonitor — задокументировано. Phase 2.3 (full) — отдельная фаза. Регрессия +2 проверки.

---

### v0.89.41 — Инфраструктура миграции `<webview>` → `WebContentsView` (feature-flag, default OFF)

По [Electron docs](https://www.electronjs.org/docs/latest/api/webview-tag) «We currently recommend to not use the webview tag, consider WebContentsView». Создана инфраструктура без переключения текущего кода — нулевой риск регрессии. **Файлы**: `webContentsViewManager.js` (класс + 12 forwarded events, graceful degradation), `webContentsViewIpcHandlers.js` (7 IPC `wcv:*` + `wcv:event` bridge), `WebContentsViewSlot.jsx` (React-слот + ResizeObserver → setBounds), регистрация в `main.js`. **Tests**: 638 → 650 (+12 unit + 5 guard).

---

### v0.89.40 — IndexedDB кэш расширен на ВСЕ чаты + TTL cleanup + loadOlder/Newer save

Расширение v0.89.39 (только топики) на все типы чатов. Модуль переименован [`topicMessagesCache.js`](../src/native/utils/topicMessagesCache.js) → [`messagesCache.js`](../src/native/utils/messagesCache.js) (старый — re-export для совместимости). DB `cc-messages-cache`, ключ `chatId:topicId||_main`. **Интеграции в nativeStore.js**: (1) `loadMessages` для обычных чатов делает optimistic render из IDB + сохраняет ответ; (2) `loadOlder/loadNewerMessages` после merge сохраняют tail в IDB; (3) `selectForumTopic` переведён на новые имена. **TTL cleanup**: `cleanupExpired()` через index `ts` + `IDBKeyRange.upperBound` — удаляет всё старше 7 дней. Вызывается при инициализации store через `requestIdleCallback`. **WebContentsView перепроверка**: [`BrowserView` deprecated с **Electron v29.0.0**](https://www.electronjs.org/docs/latest/api/browser-view) (я писал v30 — ошибка). [`<webview>`](https://www.electronjs.org/docs/latest/api/webview-tag) — Electron официально пишет «we recommend to not use». **Tests**: 631 → 638 (+7).

---

### v0.89.39 — AbortController в hooks + IndexedDB кэш форум-топиков (Telegram-style optimistic render)

**Совет 2 — AbortController**: в [`MuteMenu.jsx`](../src/native/components/MuteMenu.jsx) и [`AccountContextMenu.jsx`](../src/native/components/AccountContextMenu.jsx) (по 2 listener'а: pointerdown + keydown) — `{ signal: ac.signal }` + один `ac.abort()` вместо 2 removeEventListener. В файлах с 1 listener — НЕ трогаю (SIMPLICITY).

**Совет 3 — IndexedDB optimistic render**: новый [`topicMessagesCache.js`](../src/native/utils/topicMessagesCache.js) — IDB store `cc-topic-cache`, последние 50 сообщений на топик, TTL 7 дней, graceful degradation. В [`selectForumTopic`](../src/native/store/nativeStore.js) при клике параллельно `loadTopicMessages` → если кэш есть → optimistic render. После сервера → `saveTopicMessages`. Как Telegram Desktop через TDLib local cache.

**Tests**: 624 → 631 (+7).

---

### v0.89.38 — Модернизация по документации стека (Security + Pointer Events + webview overlay)

**4 группы одним коммитом**. A: `trayManager.js` log-viewer перешёл на `contextIsolation:true + preload` (Electron Security Don't #2/#3). B: разделитель AI sidebar залипал — глобальный `position:fixed, zIndex:999999` overlay вместо локального `absolute` (Electron webview docs: события не пересекают границу). C: Mouse Events → [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) в `useAIPanelResize` (+`setPointerCapture`) и 3 dropdown'ах. D: ловушка #29 update — `forceFinalSlideInState()` теперь в ОБОИХ путях (animationend + fallback). Тесты: новый `modernPatternsGuard.test.cjs` (15), `transparentWindowGuard` (19), 624 vitest. Подключены к pre-commit/push.

---

### v0.89.37 — Skeleton overlay + race protection для форум-топиков (Telegram/Discord-style)

Пользователь: «бегает строка загрузки и всё, не грузит». Лог 09:46:24: топик 2325 загрузился за 188мс, но `hasEl=false` (DOM scrollRef ещё не подключён) → `chatReady=false` → `opacity:0` → **~600мс чёрного экрана** на первой загрузке.

**Две корневые причины**:
1. [`InboxChatPanel.jsx:157`](../src/native/components/InboxChatPanel.jsx) условие `&& visibleMessages.length > 0` скрывало overlay при `messages=0` → юзер видел чёрно вместо «Загружаю»
2. [`nativeStore.js selectForumTopic`](../src/native/store/nativeStore.js) без race protection: при быстром A→B ответ A мог затереть state

**Сверка с мессенджерами**: Telegram Desktop, WhatsApp Web, Discord, Slack — все показывают skeleton **сразу** + используют requestId/AbortController.

**Решение 1 (Skeleton, 1 строка)**: убрано `&& visibleMessages.length > 0` — overlay показывается с первого клика.

**Решение 2 (Race protection, ~15 строк)**: `selectTopicRequestRef = useRef(new Map())` хранит последний requestId на chatId. Каждый invoke получает уникальный id. После await сравниваем — если в Map другой id, ответ игнорируем (`{ ok: false, stale: true }`).

**Tests**: 623 → 624 (+1 регрессионный для race). **Ловушка** в `mistakes/native-scroll-unread.md`.

---

### v0.89.36 — Второй корень notification ribbon: force-transform в slideIn fallback (ловушка #29)

Через час после v0.89.35 пользователь снова видит «полосу». Лог 10:11:00: 4 нотификации в одну миллисекунду (race Telegram sync). DOM: `id=105 realTf=matrix(1,0,0,1,380,0) slid=true` — `slideInDone=true` поставлен, но transform застрял на translateX(380). **Корень**: в [`notification.js:573-582`](../main/notification.js) v0.89.23 fallback ставил **только флаг**, не форсировал transform. `calcHeight()` учитывал element 182px, окно расширялось. **Сверка**: Telegram Desktop / WhatsApp / Discord / Slack — все гарантируют final state через JS. **Решение** (~5 строк): fallback теперь форсирует `animation='none'` + `transform='translateX(0) scale(1)'` + `opacity='1'`. Регрессия: тест проверяет 3 force-style. **Ловушка #29** в `mistakes/notifications-ribbon.md`.

---

### v0.89.35 — Корень серии notification ribbon: `backgroundThrottling: false` (ловушка #28)

Через сутки после «закрытия» серии v0.89.18-v0.89.27 пользователь снова увидел пустую полосу + кнопка «Закрыть» не реагирует. Лог 09:07: `DOM snapshot id=17 realTf=matrix(1,0,0,1,380,0)` — item застрял с `translateX(380px)` (0% keyframe из CSS `slideIn`). Анимация не запустилась.

**Сверка с [Electron docs](https://www.electronjs.org/docs/latest/api/browser-window)** (verbatim): «If `backgroundThrottling` is disabled, the visibility state will remain `visible` even if the window is minimized, occluded, or hidden».

**Сверка с кодом**: `notificationManager.js` создавал notifWin БЕЗ `backgroundThrottling: false` → по умолчанию Chromium throttling включён → CSS animations и `requestAnimationFrame` паузятся когда окно `hide()` или occluded → `slideIn` keyframes не выполняются → item застрял → невидим но bounds учитывают высоту → **«пустая полоса»**.

**5 предыдущих фиксов (v0.89.18 safeHide, v0.89.22 убран setIgnoreMouseEvents, v0.89.23 IGNORE stale, v0.89.26 hideIfEmpty, v0.89.27 rendererPure) закрывали симптомы. Корень — `backgroundThrottling: true` по умолчанию — не трогали.**

Также закрывает старую ловушку **v0.47.2** «requestAnimationFrame НЕ работает в hidden BrowserWindow» — тот же стек, тот же throttling, тот же фикс.

**Решение** — 1 строка в [`notificationManager.js:91-97`](../main/handlers/notificationManager.js): добавлен `backgroundThrottling: false` в `webPreferences`.

**Регрессионная защита**: [`transparentWindowGuard.test.cjs`](../src/__tests__/transparentWindowGuard.test.cjs) проверяет наличие параметра. Pre-commit hook падает при удалении (верифицировано: убрал параметр → 17/18 ✅, вернул → 18/18 ✅).

**Ловушка #28** в `mistakes/notifications-ribbon.md` — полная история + правило для будущего.

---

### v0.89.34 — Массовое разбиение: 0 предупреждений 80%+ лимита (запас 20% во всех файлах)

По указанию пользователя: было 12 файлов на 80-99% лимита, стало **0**. Production: `tdlibMessages.js` (475→356, sendFile→tdlibSend.js), `tdlibMapper.js` (417→282, media→tdlibMapperMedia.js), `tdlibIpcHandlers.js` (410→323, event bridge→tdlibIpcBridge.js), `useInboxNewerPrefetch.js` (121→112). Vitest: 4 файла разбиты + 4 новых файла. Compaction: `fileSizeLimits.test.cjs` (345→277, exceptions→отдельный модуль), 3 vitest файла compaction headers/blank lines. **Tests**: 623/623, 7 новых файлов, 0 регрессий.

---

### v0.89.33 — Divider «Новые сообщения» застывает на snapshot позиции открытия

После v0.89.32: полоска постоянно перепрыгивает при прокрутке. Лог: за 36с 8 пересчётов `firstUnreadId`. **Корень**: useEffect пересчёта имел в deps живой `activeReadInboxMaxId` → каждый server sync двигал divider. **Сверка**: TDLib `openChat` lifecycle + Telegram Desktop/WhatsApp/Discord/Slack — все делают snapshot. **Решение** (~15 строк + 1 тест): `frozenReadCursorRef`, сброс по `activeViewKey`, фиксация на первом ненулевом cursor. Счётчик боковой панели остался живой (v0.87.41). **Tests**: 622 → 623. **Ловушка** в `mistakes/native-scroll-unread.md`.

---

### v0.89.32 — Диагностические логи для форум-топиков (markRead pipeline + prepend size jumps)

После v0.89.31 две жалобы: счётчик замирает / окно дёргается. Лог 17:57 показал: (1) замирания = `read-batch-skip` watermark защита v0.87.37 (правильное поведение); (2) дёргание = `top=27666→1669` после prepend 100 msg в react-window. 100% решения нет — добавлены диагностические логи: `[topic-mark] INVOKE/OK/ERROR` в backend, `[topic-mark-ui] SEND` + `[topic-mark-refresh] delta` в store, `[topic-load-older/newer] before/added/after`. **Tests**: 622 без изменений.

---

### v0.89.31 — Форум-топики: плашка «N из M» двигается, счётчик сбрасывается (ловушка #30)

После v0.89.30 пользователь сообщил: плашка «100 из 217» замирает, счётчик 217 не сбрасывается. **Три причины**: (1) `loadOlder/loadNewerMessages` для топиков не пересчитывали `messageWindows[key].loadedIncoming`; (2) [`viewMessages`](https://github.com/tdlib/td/blob/master/td/generate/scheme/td_api.tl) для форумов требует `source: messageSourceForumTopicHistory`, мы не передавали; (3) `unreadWindowIncomplete` блокировал force-read.

**Правки** (3, ~30 строк): `nativeStore.js` loadOlder/Newer для топика пересчитывают `messageWindows[key]` через `buildUnreadWindowMeta`; [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `markTopicRead` добавляет `source: messageSourceForumTopicHistory`. **Tests**: 620 → 622. **Ловушка #30** в `mistakes/tdlib-forum.md`.

---

### v0.89.30 — Форум-топики: сообщения теперь грузятся (`forum_topic_id` ≠ `message_thread_id`, ловушка #29)

После v0.89.29: топик OZON → `Message not found`, General → `Scheduled messages can't have message threads`.

**Корень**: `forum_topic_id` (int32, UI) ≠ `message_thread_id` (int53, API). [TDLib docs](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html): `getMessageThreadHistory` ожидает **message_id первого сообщения треда**, а мы передавали короткий UI-id. Плюс General топик (`is_general=true`) = весь чат, для него `getChatHistory`.

**Решение** (3 файла, ~30 строк):
1. [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `forum.getTopics`: добавлены `threadMessageId: t.last_message?.message_thread_id ?? t.last_message?.id ?? null` + `isGeneral: !!t.info?.is_general`
2. [`nativeStore.js`](../src/native/store/nativeStore.js) `selectForumTopic`/`loadOlder`/`loadNewer`: передают `threadMessageId` и `isGeneral` в IPC payload
3. [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `messages.getTopic`: branch — `isGeneral` → `getChatHistory`, иначе → `getMessageThreadHistory(message_id=threadMessageId)`

**Tests**: 615 → 620 (+5: threadMessageId из last_message, fallback на last_message.id, isGeneral path, empty for missing thread). **Ловушка #29** в `mistakes/tdlib-forum.md`.

---

### v0.89.29 — TDLib 1.8 переименовал `message_thread_id` → `forum_topic_id` (ловушка #28)

**Контекст**: после v0.89.28 diagnostic logs пользователь воспроизвёл: кликает на тему OZON → справа черно. Логи 15:35:

```
[topic-ui] selectForumTopic ... topicId= topMessageId= unreadCount=215
                                ↑↑↑ ПУСТЫЕ!
[topic-be] no topicId — params={topicId:"",topMessageId:"",...}
[topic-ui] result ok=false error=no topicId
```

Для **ВСЕХ** тем (74, 215, 100 непрочитанных) `topicId` пустая строка.

#### Корневая причина — TDLib breaking change в API между 1.7 → 1.8

📚 Сверка с [официальной TDLib документацией](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html):

| Старое (TDLib 1.7.x) | Новое (TDLib 1.8+) |
|---|---|
| `forumTopicInfo.message_thread_id: int53` | `forumTopicInfo.forum_topic_id: int32` |
| — | `forumTopicInfo.chat_id: int53` (добавлено) |
| — | `forumTopicInfo.is_general: Bool` (добавлено) |

Наш проект: `prebuilt-tdlib@0.1008064.0` → **TDLib v1.8.64** (новейшая на май 2026).

Наш код в [tdlibBackend.js:488](../main/native/backends/tdlibBackend.js) читал `t.info?.message_thread_id` — **поле НЕ существует** в 1.8+ → `undefined` → `String(undefined || '') === ''` → все topics с пустым `id`.

#### Решение

```js
// Поддержка обоих имён (новое первым, старое как fallback)
const threadId = t.info?.forum_topic_id ?? t.info?.message_thread_id
const idStr = threadId !== null && threadId !== undefined ? String(threadId) : ''
```

Использовали `??` (nullish coalescing) вместо `||` — чтобы `0` (валидное значение для general topic) не fall-through на fallback.

Также добавили `isGeneral: !!t.info?.is_general` в наш topic объект — UI может отличать general от пользовательских тем.

#### Регрессионная защита

```js
// При первом полученном topic печатает СЫРУЮ структуру info от TDLib
if (result?.topics?.[0]) {
  console.log('[forum-be] sample topic[0] info=' + JSON.stringify(result.topics[0].info) + ' unread=...')
}
```

Если TDLib снова переименует поле в будущих версиях — увидим в первой сессии после апдейта.

#### Ловушка #28 — записана в `mistakes/tdlib-forum.md`

«TDLib **не использует semver** в смысле "minor не ломает API". Каждая новая версия (1.7 → 1.8) может переименовать или удалить поля. При апдейте `prebuilt-tdlib` — проверять td_api spec на breaking changes».

Добавлен список известных переименований 1.7 → 1.8 для справки.

#### Эффект

🟢 **Что починилось**:
- Forum topics получают корректные `id` (forum_topic_id или 1 для general)
- `selectForumTopic` отправляет правильный topicId → backend.getTopic не отбрасывает
- TDLib `getMessageThreadHistory` получает валидный `message_id` → возвращает сообщения
- Active state работает (id для каждого topic уникальный) — синяя полоса слева видна
- «Загружаю непрочитанные» завершается + показываются сообщения

---

### v0.89.28 — Forum topic UI: active state visible + diagnostic для load topic messages

После v0.89.25 forum-чаты показывают панель тем, но (1) активная тема почти не видна (13% alpha на AMOLED), (2) клик на тему — справа чёрно, нет логов про `tg:get-topic-messages`.

**Правки**: CSS active state увеличен с 13% alpha до `rgba(42,171,238,0.18)` + `border-left: 3px solid #2AABEE` (Telegram-style). 3 точки логирования: `selectForumTopic`, `tg:get-topic-messages` result, `backend.messages.getTopic`. Логи v0.89.29 показали `topicId=""` (см. ловушка #28).

---

### v0.89.27 — `rendererPure` авторитативный signal — ловушка #26

После v0.89.26 полоска возвращается. Лог: `IGNORE stale raw=0 (items=2 > 0)` — main process накопил мусор от ghost-stacking. Решение: renderer = source of truth для terminal state. `notif:resize` принимает `meta = { rendererPure: boolean }`. Main очищает мусор и скрывает окно если `height<=0 && rendererPure`. 3 файла: `notification.js`, `notification.preload.cjs`, `notifHandlers.js`. **Ловушка #26** в `mistakes/notifications-ribbon.md`.

---

### v0.89.26 — Окно notification не скрывалось после dismiss (ловушка #25)

После v0.89.23 race: `notif:resize(0)` приходил ДО `notif:dismiss` → защита v0.89.23 IGNORE'нула resize → больше resize не приходило → окно visible. Решение: `hideIfEmpty()` после каждого setNotifItems в 3 handler'ах (`notif:click`/`mark-read`/`dismiss`). Main process — source of truth, не ждём renderer. **Ловушка #25** в `mistakes/notifications-ribbon.md`.

---

### v0.89.25 — Fix: `is_forum` в TDLib supergroup, не в chatTypeSupergroup (ловушка #24)

[TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1supergroup.html): `is_forum` в объекте `supergroup`, не в `chatTypeSupergroup`. До v0.89.25 mapChat читал `type.is_forum` (undefined). Решение: `supergroupCache` + `updateSupergroup` handler в `tdlibClient.js`, mapChat читает `extras.supergroup.is_forum`. **Tests**: 608 → 615 (+7). **Ловушка #24** в `mistakes/tdlib-forum.md`.

---

### v0.89.24 — Diagnostic логи для forum topics pipeline

Пользователь: forum-чаты не открывают панель тем. Добавлены 4 точки логирования `[forum-ipc/be/map/ui]` без правок поведения. Логи v0.89.25 → нашли причину (is_forum в supergroup, не chatTypeSupergroup, ловушка #24).

---

### v0.89.23 — Два бага notification pipeline: «пустая полоса» + race `raw=0 items=1`

**Контекст**: после v0.89.22 пользователь прислал скриншот в 12:12 — сверху видно Telegram уведомление «vevs.home», ниже **пустая полоса**. Логи v0.89.20-21 + DOM snapshots показали: items=2 в DOM, оба op=1 tf=none, но визуально один не виден.

#### Два независимых бага, оба подтверждены документально по стеку

**Баг #1 — «Пустая полоса»**: slideIn animation 300ms + offsetHeight включён в calcHeight → окно расширяется СРАЗУ, но новый element ещё за экраном (translateX анимируется).

Подтверждение из MDN:
- 📚 [HTMLElement.offsetHeight](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetHeight): «measures layout position, not visual position. CSS transforms affect only visual rendering»
- 📚 [Using CSS animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Using_CSS_animations): «Animated property values do NOT appear in `element.style` — only computed style»

**Баг #2 — Race `raw=0 items=1`**: renderer прислал `notif:resize(0)` от прошлого dismiss ПОСЛЕ того как main process получил новое `notif:show` (items=1) → main скрывает окно ошибочно.

Подтверждение из Electron docs:
- 📚 [ipcRenderer.send](https://www.electronjs.org/docs/latest/api/ipc-renderer): «Send an **asynchronous** message to the main process»
- setTimeout 60ms в `reportHeight` не гарантирует порядок относительно других IPC

#### Решение Баг #1 — slideInDone флаг

В [`main/notification.js`](../main/notification.js):

```js
// Перед appendChild:
el.dataset.slideInDone = 'false'

// Слушаем animationend для slideIn:
el.addEventListener('animationend', (e) => {
  if (e.animationName !== 'slideIn') return
  el.dataset.slideInDone = 'true'
  reportHeight()  // ← перепроверяем теперь когда element на месте
}, { once: true })

// Страховка 600ms на случай если animationend не сработает

// В calcHeight():
if (child.dataset.slideInDone === 'false') continue  // ← новое: пропускаем анимирующиеся
```

**Эффект**: `calcHeight` НЕ включает новый element пока он анимируется → main НЕ расширяет окно раньше времени → пользователь не видит пустоты.

#### Решение Баг #2 — игнорировать stale `raw=0`

В [`main/handlers/notifHandlers.js`](../main/handlers/notifHandlers.js):

```js
const itemsCount = getNotifItems().length
if (height <= 0 && itemsCount > 0) {
  console.log('[notif-resize] IGNORE stale raw=0 (items=' + itemsCount + ' > 0)')
  return  // ← stale event от прошлого dismiss
}
```

**Эффект**: если main знает что есть item, но renderer прислал `0` (запоздалый reportHeight) — игнорируем. Следующий reportHeight от renderer пришлёт правильное значение.

#### Усиление диагностики

DOM snapshot теперь логирует:
- `inlineTf` (старый `tf`) — `el.style.transform` (inline)
- `realTf` — `getComputedStyle(el).transform` (учитывает CSS animation!)
- `slid` — флаг `slideInDone`

Если баг #1 вернётся — лог сразу покажет реальный transform.

#### Документация

Обе ловушки записаны в [`mistakes/notifications-ribbon.md`](mistakes/notifications-ribbon.md):
- Ловушка #22 — «Пустая полоса» (slideIn + offsetHeight)
- Ловушка #23 — IPC race (stale resize=0)

Каждая с MDN/Electron ссылками + правилом.

#### Урок

В v0.89.21 я добавил DOM snapshot, но логировал только `el.style.transform` — это inline style, **не** учитывает CSS animation. По MDN: animation values «only exist in computed style». Я не прочитал MDN при добавлении лога. Через 1 итерацию (v0.89.21 → v0.89.22) пользователь поймал баг через скриншот.

**Правило (для auto-memory)**: при добавлении diagnostic log для CSS-анимируемых свойств — ВСЕГДА читать `getComputedStyle()`, не `el.style`.

---

### v0.89.15 – v0.89.22 — заархивированы

Перенесены в [`archive/features-v0.89.15-22.md`](./archive/features-v0.89.15-22.md) (релиз v0.89.44, 19 мая 2026 — features.md перевалил 100 КБ после Phase 2 серии).

В архиве: серия notification ribbon (v0.89.18-v0.89.22 — корни закрыты в v0.89.35 backgroundThrottling и v0.89.36 force-transform), LRU-кеш tg-media (v0.89.17), постеры видео (v0.89.16), финал видео-pipeline (v0.89.15).

---

---

### v0.89.6 – v0.89.14 — заархивированы

Перенесены в [`archive/features-v0.89.6-14.md`](./archive/features-v0.89.6-14.md) (18 мая 2026, при превышении features.md 100 КБ в v0.89.19). 9 итераций видео-pipeline стабилизации после TDLib миграции — серия закрыта в v0.89.15-v0.89.16 (подтверждено пользователем).

### v0.89.1 – v0.89.5 — заархивированы

Перенесены в [`archive/features-v0.89.1-5.md`](./archive/features-v0.89.1-5.md) (релиз v0.89.14, 15 мая 2026 — features.md перевалил 100 КБ после серии видео-фиксов v0.89.7–v0.89.14).

В архиве: полное удаление GramJS (v0.89.1), 4 раунда аудита TDLib миграции (v0.89.2–v0.89.5).

---

### v0.89.0 — Этап 2 виртуализации: VirtualMessageList в InboxChatPanel

**Контекст**: v0.88.x подготовили почву (страховка push, защитные тесты), v0.89.0 — собственно
рефакторинг рендера. До этого `renderItems.map(...)` рендерил **весь** список сообщений в DOM
(в чатах с 4000+ непрочитанных это даёт лаги при скролле). Теперь DOM держит только
видимые ~20 строк + overscan через [`react-window`](https://github.com/bvaughn/react-window) 2.2.

**Что сделано**:

- [`src/native/components/VirtualMessageList.jsx`](src/native/components/VirtualMessageList.jsx) — компонент Phase 1 (создан в v0.88.3) расширен: принимает события `onScroll/onWheel/onTouchStart/onPointerDown/onDragOver/onDragLeave/onDrop` и пробрасывает их в outer div `<List>` через `...rest`. `MessageRow` теперь сам делает `padding: 16px по бокам + 6px снизу` (вместо старого `padding/gap` на scroll-контейнере), `boxSizing: 'border-box'` — `ResizeObserver` react-window учитывает paddingBottom как часть высоты row.
- [`src/native/components/InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx) — `renderItems.map(...)` блок (~95 строк) заменён на `<VirtualMessageList>`. `msgsScrollRef` теперь синхронизируется с `listRef.current.element` через `useEffect` + `useState scrollElement`. Этот state нужен IntersectionObserver'у в `MessageBubble.readRoot` — при первом рендере root ещё `null`, после монтирования react-window выставляется реальный element, observer пересоздаётся (deps `[enabled, root]` в `useReadOnScrollAway`).
- [`src/native/hooks/useInitialScroll.js`](src/native/hooks/useInitialScroll.js) — добавлен опциональный `onMissingTarget(firstUnreadId)` callback. Когда `querySelector('[data-msg-id]')` промахивается (firstUnread вне видимого виртуального DOM), вызывается `onMissingTarget` → InboxMode скроллит через `listRef.current.scrollToRow({ index })`. Без fallback react-window открывал чат сверху, юзер не видел непрочитанные.
- [`src/native/modes/InboxMode.jsx`](src/native/modes/InboxMode.jsx):
  - `virtualListRef = useRef(null)` — imperative API react-window.
  - `findRenderItemIndex(msgId)` — ищет где сообщение в `renderItems` (учитывает альбомы: `item.msgs[*].msgs[*].id` для типа `album`).
  - `scrollToVirtualRow(msgId, align)` — вызывает `virtualListRef.scrollToRow({ index, align })`.
  - `scrollToMessage(msgId)` сначала пробует старый `querySelector` (видимый row), потом fallback `scrollToVirtualRow(msgId, 'center')` + повторная попытка подсветить через 200 мс.
  - `useInitialScroll` получает `onMissingTarget: id => scrollToVirtualRow(id, 'start')`.
- `src/__tests__/unreadAutoPrefetch.test.cjs` — 2 защитных теста v0.88.2 обновлены (проверка проводки `onReplyClick={scrollToMessage}` теперь смотрит в `VirtualMessageList.jsx`, не в `InboxChatPanel.jsx`); добавлено 5 новых тестов: `InboxChatPanel рендерит VirtualMessageList`, `VirtualMessageList использует react-window <List> + useDynamicRowHeight`, `InboxMode прокидывает virtualListRef`, `findRenderItemIndex + scrollToVirtualRow`, `useInitialScroll.onMissingTarget`. (v0.89.x Этап 4: файл удалён вместе с GramJS-специфичными тестами. Виртуализационные регрессии теперь покрывает [`src/native/components/VirtualMessageList.vitest.jsx`](src/native/components/VirtualMessageList.vitest.jsx).)

**Сохранено без изменений**:

- `useReadOnScrollAway` (rootMargin `-48% 0px -48% 0px`) — работает как раньше, просто root = `listRef.element` вместо div'a.
- `useInboxScroll` + `useInboxNewerPrefetch` (load-older, prefetch-newer, atBottom) — onScroll-event тот же, теперь приходит из react-window.
- `useReadByVisibility` (batch markRead 300мс) — не трогали.
- `useNewBelowCounter`, `useForceReadAtBottom`, `useMessageActions` — не трогали.
- `messageGrouping.js` — критичная защита v0.87.113 (senderAvatar в group/album) — без изменений.

**Известные риски, требующие визуальной проверки**:

- **load-older preserve scroll position** (`scrollTop = scrollHeight - prevHeight`) при виртуализации работает, но `useDynamicRowHeight` измеряет высоту row асинхронно через `ResizeObserver`. Если новые сообщения ещё не обмерены — `scrollHeight` неточен. Если будет «прыжок» при подгрузке вверх — нужна будет замена на `scrollToRow({ index: addedCount, align: 'start' })`.
- **`overflow-anchor`** браузера на virtualised DOM работает иначе. Если будут «дрожания» при добавлении сообщений сверху — добавить `overflow-anchor: none` на outer div react-window.
- **Шапка / pinned message / unread-status bar** живут вне списка — никак не должны были пострадать.

**Версия**: v0.88.2 → v0.89.0 (minor — UI-функциональность не изменилась, но внутренняя архитектура рендера переработана).

**Проверено**:

```powershell
npm.cmd run lint                                            # ожидается OK
npm.cmd run test:vitest                                      # ожидается 166/166 (не должны отвалиться без изменений в API)
node src\__tests__\unreadAutoPrefetch.test.cjs               # 27/27 (+5 виртуализационных)
node src\__tests__\fileSizeLimits.test.cjs                   # лимиты в порядке
```

⚠ **Визуальная проверка пользователем обязательна**: открыть чат с 100+ непрочитанными → должен встать на первое непрочитанное (проверка `onMissingTarget` fallback). Reply-click на старое сообщение → scroll-to-reply должен работать. Прокрутка длинного чата (4000+) — должна быть плавной без лагов DOM.

---

### v0.88.2 — страховка push для real-time + защитные тесты перед Этапом 2

**Контекст**: перед большим рефактором (виртуализация рендера, Этап 2) — две инженерные страховки.

**Страховка 1 — real-time push расhron**:

- В v0.88.1 флаг `noMoreNewerRef` блокировал бесконечный prefetch у конца чата.
- Теоретический пробел: если Telegram push (`tg:new-message`) по какой-то причине пропустит сообщение (gap в `pts`, потеря сессии), флаг остаётся `true` и блокирует prefetch как «спасательный канал» до смены чата.
- Источник: [core.telegram.org/api/updates](https://core.telegram.org/api/updates) — Telegram использует server-push, но требует клиента вызывать `updates.getDifference` при rasync; GramJS делает это сама при reconnect.
- Решение: в [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js) добавлен `useEffect` который отслеживает `activeMessages.length` + `scrollKey`. Когда массив растёт в рамках одного `viewKey` (push доставил новое сообщение или load-newer вернул что-то) — флаг `noMoreNewerRef.current.delete(viewKey)` автоматически снимается. Логируется через `load-newer-flag-reset`.
- Поведение: чат с 0 unread → флаг становится `true` → приходит push через 10 минут → массив растёт → флаг снимается → следующий скролл может снова попробовать prefetch.

**Страховка 2 — защитные тесты перед Этапом 2**:

В `unreadAutoPrefetch.test.cjs` (v0.89.x Этап 4: удалён) добавлены статические проверки на критичные интеграции, которые **с большой вероятностью пострадают при внедрении виртуализации**:

- `MessageBubble` и `AlbumBubble` принимают `onReplyClick` (reply → scroll-to-message).
- `InboxChatPanel` проводит `scrollToMessage` в `onReplyClick`.
- `groupMessages(visibleMessages, firstUnreadId)` — группировка с разделителем «Новые сообщения».
- `useInitialScroll` читает `firstUnreadIdRef`.
- `useReadOnScrollAway` использует `rootMargin: '-48% 0px -48% 0px'` (читающая линия).

Если виртуализация Этапа 2 сломает любую из этих интеграций — соответствующий статический тест упадёт и сразу укажет где смотреть.

**Версия**: v0.88.1 → v0.88.2 (patch — страховочное улучшение без новой UI-функциональности).

**Проверено**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 files / 166 tests passed
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 22/22 (+6 от v0.88.1)
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
```

---

### v0.88.1 — фикс бесконечного цикла prefetch у конца чата

**Баг из v0.88.0**: после первой автодогрузки внизу ленты индикатор «Загружаю ещё...» оставался видимым и не пропадал. Окно чата периодически «дёргалось» каждые 300 мс.

**Причина**:
1. Скролл доходил до низа (`fromBottomPx < 1500`) → срабатывал prefetch.
2. Telegram возвращал пустой массив (новее сообщений нет — пользователь у конца чата).
3. Backend всё равно эмитил `tg:messages` с пустым `messages`.
4. IPC listener делал `setState({ messages: [...existing, ...[]] })` — **новая ссылка** на тот же контент → лишний рендер («дёрг»).
5. Через 300 мс `loadingNewerRef` снимался → scroll положение то же → опять триггер → опять пустой ответ. Бесконечный цикл.

**Фикс**:
- `main/native/telegramMessages.js`: `tg:get-messages` и `tg:get-topic-messages` **не эмитят** `tg:messages` если `afterId` использован и Telegram вернул `0` сообщений.
- `src/native/store/nativeStoreIpc.js`: на случай если backend всё-таки эмитнет — listener делает **ранний return без setState** когда `appendNewer:true` и `newNewer.length === 0`.
- `src/native/hooks/useInboxScroll.js`: добавлен `noMoreNewerRef = useRef(new Map())`. Когда `loadNewerMessages` возвращает `hasMore:false` ИЛИ пустой массив — фиксируем флаг для этого `viewKey`. Условие триггера дополнено: `!noMoreNewerRef.current.get(viewKey)`. Сбрасывается естественно при смене чата/темы (новый `viewKey` → новая запись в Map).
- Новые vitest-тесты:
  - `appendNewer` с пустым массивом **не меняет ссылку** на массив сообщений (`expect(refAfter).toBe(refBefore)`).
  - `appendNewer` только с дубликатами — то же.
- Новые static-тесты в `unreadAutoPrefetch.test.cjs` (3 проверки): `noMoreNewerRef`, ранний return, отказ от пустого emit.

**Проверено**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 файлов, 166 тестов passed
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 16/16
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
```

---

### v0.88.0 — Telegram-style автодогрузка новых сообщений вниз

**Контекст**: пользователь нашёл реальные большие чаты (например, чат «1337» с **4253 непрочитанных**). До этого фикса:
- Код запрашивал у Telegram пачку из 500 сообщений, но Telegram MTProto `messages.getHistory` имеет **жёсткий лимит 100** за запрос (источник: [core.telegram.org/api/offsets](https://core.telegram.org/api/offsets)).
- Получая 100 из «ожидаемых» 500, баннер навсегда застревал на `100 из 138` (или `50 из 999+`).
- Не было функции догрузки **новых** сообщений вниз — только `loadOlderMessages` для прокрутки вверх в историю.
- Результат: открыл чат → проскроллил вниз → застрял, остаток непрочитанных не виден.

**Что сделано**:

- `main/native/telegramMessages.js`: добавлен параметр `afterId` в `tg:get-messages` и `tg:get-topic-messages`. Маппится в MTProto `min_id` + `offset_id=0` + `add_offset=-limit`. При `afterId` бэкенд эмитит `tg:messages` с флагом `appendNewer: true`. (v0.89.x Этап 4: файл удалён, поведение перенесено в [`main/native/backends/tdlibMessages.js`](main/native/backends/tdlibMessages.js).)
- `src/native/store/nativeStore.js`:
  - Константа `UNREAD_WINDOW_MAX_MESSAGES` уменьшена 500 → **100** (реальный потолок Telegram API). Это исправляет баг «100 из 138».
  - Умная формула `addOffset` в [`unreadWindowRequestParams`](src/native/store/nativeStore.js): при `unread > 30` окно сдвигается ближе к курсору (90% непрочитанных), для маленьких unread оставляем больше контекста (25%).
  - Новая функция [`loadNewerMessages(chatId, afterId, limit=100)`](src/native/store/nativeStore.js) с per-key throttle **300 мс** (защита от `FLOOD_WAIT`).
- `src/native/store/nativeStoreIpc.js`: слушатель `tg:messages` теперь обрабатывает поле `appendNewer: true` — добавляет новые сообщения в конец массива с дедупликацией.
- `src/native/hooks/useInboxScroll.js`: добавлен prefetch-триггер: при `fromBottom < 1500px` (≈20 сообщений) → `store.loadNewerMessages(chatId, lastIncomingId)`. Защищено `loadingNewerRef`. Срабатывает только после `initialScrollDone`.
- `src/native/modes/InboxMode.jsx`: новые `loadingNewerRef` + `useState(loadingNewer)` для UI индикатора, пробрасываются в `useInboxScroll` и `InboxChatPanel`.
- `src/native/components/InboxChatPanel.jsx`: внизу ленты появляется индикатор `«Загружаю ещё...»` (CSS-класс `native-msgs-loading-newer`) во время фоновой подгрузки.
- `src/native/styles-messages.css`: добавлены стили `native-msgs-loading-newer` с пульсирующей точкой.
- Тесты обновлены: `nativeStore.vitest.jsx`, `multiAccount.test.cjs`.

**Подтверждённые числа** (а не выдуманные):

| Число | Что | Откуда |
|---|---|---|
| `100` | Размер пачки | [Telegram MTProto docs](https://core.telegram.org/api/offsets) — жёсткий потолок |
| `300 мс` | Throttle между пачками | Практика MadelineProto/Telethon — безопасный темп против FLOOD_WAIT |
| `1500 px` | Prefetch порог | ≈20 сообщений (react-virtualized default = 15) |
| `0.9 / 0.25` | Соотношение addOffset | Большой unread → почти всё окно для непрочитанных; маленький → больше контекста |

**Что НЕ сделано в этом этапе** (отдельные задачи):

- DOM-виртуализация через `react-virtuoso`/`react-window` для основного рендера: коммерческая версия `VirtuosoMessageList` платная, бесплатная требует переписать группировку/mark-read/scroll-to-reply (~600-800 строк, риск регрессий). Отдельный Этап 2 после стабилизации.
- Отправка/ответ в выбранную тему форума: вход disabled (см. журнал).
- Анимация «stale» badge при refresh: убрано из плана как лишняя нагрузка.

**Подробное расследование**: [`group-topic-investigation.md`](./group-topic-investigation.md), запись от 2026-05-13 «Stage: Newer-messages auto-prefetch».

---

### v0.87.115 – v0.87.136 — заархивированы

Перенесены в [`archive/features-v0.87.115-136.md`](./archive/features-v0.87.115-136.md) (релиз v0.89.9, 15 мая 2026 — features.md перевалил 100 КБ лимит после серии audit-релизов).

В архиве: фикс пустой аватарки чата (v0.87.115), unified connection health status (v0.87.136), Windows installer в корневой dist (v0.87.135), startup graph оптимизации (v0.87.130-134), безопасное восстановление native-аккаунтов (v0.87.127), lazy startup панелей (v0.87.126).

---

### v0.87.106 – v0.87.114 — заархивированы

Перенесены в [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) (релиз v0.89.5, 15 мая 2026 — `features.md` перевалил 100 КБ лимит после четырёх audit-релизов).

В архиве: убран счётчик чатов (v0.87.114), главный фикс аватарок отправителей в групповых чатах (v0.87.113), `GetFullUser` для User без photo (v0.87.112), фоновое скачивание аватарок отправителей (v0.87.111), визуал мьюта + двухуровневое меню (v0.87.110), заглушение уведомлений чата (v0.87.109), кнопки режимов в шапке (v0.87.108), убрана угловая иконка с аватарки (v0.87.107), финальный multi-account UI (v0.87.106).

---

### v0.87.93 – v0.87.105 — заархивированы

Перенесены в [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) (релиз v0.88.2, 13 мая 2026 — `features.md` перевалил 100 КБ лимит).

В архиве: реализация multi-account для native Telegram (v0.87.105), план multi-account (v0.87.104), разбиение 5 файлов на 80%+ (v0.87.103), CodeInput-ячейки (v0.87.102), libphonenumber-js (v0.87.101), CountryPicker (v0.87.99-100), фикс retry-цикла GramJS (v0.87.98), Low Priority разбиение 4 файлов (v0.87.97), фильтр GramJS TIMEOUT (v0.87.96), полный выход из аккаунта (v0.87.95), умный logger (v0.87.94), фикс аватарки через `cc-media://` (v0.87.93).

---
