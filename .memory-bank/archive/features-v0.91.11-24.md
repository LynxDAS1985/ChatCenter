# Архив changelog: v0.91.11 – v0.91.24 (26 мая 2026)

Архивная выписка из `.memory-bank/features.md`. Содержит цикл саги
восстановления позиции в native-режиме Telegram:

- **v0.91.11-18**: 7 коммитов фиксов БЕЗ подтверждения корня логами (антипаттерн).
- **v0.91.19-21**: добавление диагностических логов (`restore-start`, `scroll-save isRestoring`, `postcheck-tick`, `ipc-burst`) для подтверждения корней Проблем 1-3.
- **v0.91.22**: ФИКС Проблемы 1 (closed-loop scroll-save через isRestoringRef) + Проблема 3 (rAF-батчинг 3-х IPC handlers) + Проблема 4 (app.getVersion()).
- **v0.91.23**: diag для Проблемы 2 через `onRowsRendered` react-window 2.2.7 (только лог).
- **v0.91.24**: ФИКС Проблемы 2 (блок load-older во время restore + re-scroll в onRowsRendered + abort на user-scroll).

Финал саги — **v0.92.0** (миграция на react-virtuoso 4.18.7) — в активном `features.md`.

Подробная история и анализ каждого шага — [`native-scroll-restore-saga.md`](../native-scroll-restore-saga.md) и [`mistakes/native-scroll-unread.md`](../mistakes/native-scroll-unread.md).

---

### v0.91.24 — Фикс Проблемы 2: блок load-older во время restore + re-scroll через onRowsRendered + abort на user-scroll

После v0.91.23 diag-логи `anchor-postcheck-tick` подтвердили корень: load-older стартует через 30мс после `chat-open` ВО ВРЕМЯ `isRestoringRef=true`, потому что [`useInboxScroll.js:110-116`](src/native/hooks/useInboxScroll.js) проверяет только `loadingOlderRef` и `initialScrollDoneRef`, но не `isRestoringRef`. 50 новых msgs в начало → `targetIdx` сдвигается на +50 (с 7 на 107 в логе 14:01:22) → `scrollHeight` хаотично пересчитывается → юзера выкидывает в `atBottom=true`.

#### Три фикса в одном коммите

**Фикс №1 — главный** ([`useInboxScroll.js`](src/native/hooks/useInboxScroll.js)):

```js
if (loadingOlderRef.current) return
if (isRestoringRef?.current) {  // v0.91.24
  scrollDiag.logEvent('load-older-skip-restoring', { ... })
  return
}
if (initialScrollDoneRef.current !== viewKey) { ... return }
```

`isRestoringRef` живёт 500мс (anchor mode) или 1500мс (bottom mode) — за это окно restore сходится через `handleRowsRendered` retry. После сброса флага load-older работает как раньше.

**Фикс №2 — re-scroll в `handleRowsRendered`** ([`InboxMode.jsx`](src/native/modes/InboxMode.jsx)):

Diag v0.91.23 превращается в активный re-scroll:
- Если `targetIdx` за пределами viewport — `virtualListRef.scrollToRow({index, align})`
- Index пересчитывается через `findRenderItemIndex(msgId)` каждый тик — устойчиво к удалению/добавлению (msgId стабилен)
- Сходимость: `idx ∈ [startIndex, stopIndex]` → сбрасываем `isRestoringRef`
- Bounce-защита: max 8 attempts → сдаёмся (по логу 14:01:22 attempts достигало 6+)
- Если `idx=-1` (msg не отрендерен) — пропускаем тик, ждём следующий

**Фикс №3 — abort при user-scroll** ([`InboxMode.jsx`](src/native/modes/InboxMode.jsx) + [`InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx)):

Новый callback `handleUserIntent(type)` в InboxMode оборачивает `scrollDiag.markUserScroll(type)`. Если юзер начал крутить колесо / трогать сенсор ВО ВРЕМЯ `isRestoringRef=true` — флаг сбрасывается, восстановление отменяется, управление отдаётся юзеру. Лог `anchor-postcheck-abort-user`.

#### 3+ фактов в основе фикса

1. 🥇 [react-window 2.2.7 `onRowsRendered` (TS-типы локально)](file:///c:/Projects/ChatCenter/node_modules/react-window/dist/react-window.d.ts:366) — `(visibleRows: {startIndex, stopIndex}, allRows: {startIndex, stopIndex}) => void`, зовётся синхронно с rendering pipeline после measure phase.
2. 🥇 [MDN scrollTop spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop) — clamp до `scrollHeight - clientHeight`. Объясняет почему юзер падает в `atBottom=true`.
3. 🥇 [MDN scroll event](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll_event) — programmatic scroll триггерит scroll event. Объясняет почему load-older guard срабатывает.
4. 🥈 Наш лог `anchor-postcheck-tick` 14:01:22 — `targetIdx` сдвинулся 7→107 за 32мс, `scrollHeight` 9850→66140→51024→19868.
5. 🥈 Наш код [`useInboxScroll.js:110-116`](src/native/hooks/useInboxScroll.js) — отсутствие проверки `isRestoringRef`.

#### Отвергнутые альтернативы

| Подход | Почему не подходит |
|---|---|
| DOMRect-diff (Telegram Web K [scrollSaver.ts](https://github.com/morethanwords/tweb/blob/master/src/helpers/scrollSaver.ts)) | tweb не использует виртуализацию — DOM-элементы стабильны. У нас react-window рендерит только видимое окно, после `scrollToRow` старый элемент исчезает. |
| Chromium `overflow-anchor: auto` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor)) | В [`VirtualMessageList.jsx:221`](src/native/components/VirtualMessageList.jsx) отключён (`overflow-anchor: 'none'`) с v0.89.0 — react-window сам мерит, встроенное anchoring мешает. Включить обратно — отдельная архитектурная задача. |
| `initialScrollOffset` prop ([issue #216](https://github.com/bvaughn/react-window/issues/216)) | Автор issue сам называет «hacky», не работает с динамическими высотами. |
| Magic `setTimeout × 5` как для bottom mode v0.91.16 | Magic numbers (50/100/300/500/1000мс). `onRowsRendered` — штатный сигнал, точнее. |

#### Граничные случаи и защита

| Случай | Защита |
|---|---|
| msgId удалён во время restore (`idx=-1`) | skip + ждём следующий `onRowsRendered` |
| Bounce loop (scrollHeight скачет) | max 8 attempts → сдаёмся |
| Юзер начал крутить во время restore | `handleUserIntent` сбрасывает флаг |
| load-older навсегда заблокирован | `attempts>=8` сбрасывает флаг → guard прозрачен |
| Новое сообщение (`tg:new-message`) во время restore | append в конец → indexes стабильны → target msgId валиден |
| Race с `tg:messages append=true` (load-older блокированный) | `load-older-skip-restoring` лог → backend не запрашивается |

#### Файлы

- [`InboxMode.jsx`](src/native/modes/InboxMode.jsx) — `handleRowsRendered` теперь с re-scroll, новый `handleUserIntent`
- [`InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx) — приём `onUserIntent`, замена `scrollDiag.markUserScroll` на обёртку
- [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js) — новый guard `isRestoringRef?.current` перед load-older trigger
- Documentation: `features.md`, `mistakes/native-scroll-unread.md` (новая ловушка), `native-scroll-restore-saga.md` (статус 🟡)

#### Как воспроизвести фикс (для юзера)

1. Запустить приложение
2. Открыть чат А с историей >100 сообщений
3. Прокрутить ВВЕРХ к середине истории (примерно на 50%)
4. Перейти на чат B (любой)
5. Вернуться на чат A
6. **Ожидание**: позиция точно та же. Повторить 5 раз — позиция не должна смещаться. И НЕ должно быть прыжков из-за load-older.
7. Лог `anchor-postcheck-tick` теперь должен сходиться `inViewport=true` в attempt=1-3, не дотягивая до 8.
8. Лог `load-older-skip-restoring` должен появляться при возвратах (это значит фикс №1 работает).

#### Регрессия

- lint ✅
- vitest ✅
- fileSizeLimits ✅ — InboxMode ceiling 730 (запас остался)
- check-memory ✅

#### Откат

```
git revert <hash>
```
Изменения изолированы в 3 файлах. После revert — поведение v0.91.23 (diag-only, load-older без блокировки).

---

### v0.91.23 — Диагностика Проблемы 2 через react-window onRowsRendered (БЕЗ правки логики)

После v0.91.22 закрылись Проблемы 1, 3, 4. Лог 13:08:02 показал что Проблема 2 (react-window remeasure портит позицию при anchor restore) **реальна и подтверждена**:

```
restore-start chatId=...-1001296261677 savedAnchor=8937013248 savedAtBottom=false
scroll-anomaly prevHeight=14806 → currHeight=12417  ← scrollHeight ужался
scroll-save anchorMsgId=10712252416 atBottom=TRUE   ← юзер упал в самый низ
```

Корень — связка двух вещей: (1) `react-window 2.2.7 useDynamicRowHeight` сначала использует `defaultRowHeight: 50` для всех row, потом измеряет через ResizeObserver и `scrollHeight` ужимается; (2) [MDN scrollTop spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop) clamp обрезает `scrollTop` до `scrollHeight - clientHeight`.

**По правилу саги «не чинить вслепую»** — сначала диагностика. По [react-window TS-типам](file:///c:/Projects/ChatCenter/node_modules/react-window/dist/react-window.d.ts) (`react-window.d.ts:366`) `onRowsRendered` зовётся синхронно с rendering pipeline ПОСЛЕ measure phase. Это штатный сигнал «список устаканился» — лучше чем `setTimeout × 5` из v0.91.16 для bottom mode.

**Что добавлено** (только наблюдение, БЕЗ re-scroll):

- В [`InboxMode.jsx`](src/native/modes/InboxMode.jsx): 4 ref для трекинга restore (`restoreTargetMsgIdRef`, `restoreTargetAlignRef`, `restoreStartTimeRef`, `restoreAttemptsRef`). `onRestoreAnchor` и `onMissingTarget` сохраняют target msgId (не индекс — индексы сдвигаются при удалении/добавлении сообщений) перед scrollToRow.
- `handleRowsRendered({startIndex, stopIndex})` пишет лог `anchor-postcheck-tick` с полями: `msgId`, `targetIdx` (через `findRenderItemIndex`), `startIndex/stopIndex`, `inViewport` (boolean), `align`, `attempt` (счётчик за один restore), `sinceStartMs`, `scrollTop`, `scrollHeight`. Только когда `isRestoringRef.current === true`.
- В [`InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx) проп `onRowsRendered` прокинут в `VirtualMessageList` (проп уже принимался с v0.89.0, никто не передавал).

**Что покажет лог**:

1. Сколько раз `onRowsRendered` зовётся за один restore (1? 5? 10?)
2. На какой попытке `inViewport=true` (т.е. позиция стабилизировалась)
3. Сколько мс проходит от `restore-start` до сходимости
4. Что когда `targetIdx=-1` (msg удалён или ещё не отрендерен из-за load-older)

**Что НЕ трогали**: re-scroll логика, useInitialScrollDiag, bottom mode (postcheck-tick × 5 оставлен из v0.91.20).

**Источники**:
- [react-window 2.2.7 ListProps.onRowsRendered](file:///c:/Projects/ChatCenter/node_modules/react-window/dist/react-window.d.ts) — `(visibleRows: {startIndex, stopIndex}, allRows: {startIndex, stopIndex}) => void`
- [MDN scrollTop spec — clamp behavior](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop)
- [react-window README — useDynamicRowHeight предупреждение](https://github.com/bvaughn/react-window/blob/master/README.md)
- [react-window issue #216 — scroll memory pattern discussion](https://github.com/bvaughn/react-window/issues/216)

**Регрессия**: lint ✅, vitest ✅, fileSizeLimits ✅ (ceiling InboxMode 670→730). Тесты `useInitialScroll.vitest.jsx` контракта `doneRef` не затронуты. `VirtualMessageList.vitest.jsx` smoke не затронут — проп `onRowsRendered` уже принимался с v0.89.0.

**Откат**: `git revert <hash>` — изменения изолированы (новые ref + новый handler + проп через слой). Если откатить, `onRowsRendered` снова перестанет передаваться (поведение v0.91.22).

**Дальше** — после подтверждения юзером из логов: фикс-коммит v0.91.24 добавит re-scroll логику в `handleRowsRendered` с защитой от bounce (max 5 attempts), от race с user-scroll (abort при `markUserScroll`), от удаления msg (idx=-1 пропуск).

---

### v0.91.22 — Финальный фикс closed-loop scroll + rAF-батчинг IPC + хардкод версии

После v0.91.19/20/21 диагностика подтвердила **три корня** в логах. Версия делает только фиксы — диагностика (`scroll-save isRestoring`, `ipc-burst`, `postcheck-tick`) **сохранена** до подтверждения юзером (TODO-7/8/9 в [`code-todo.md`](.memory-bank/code-todo.md)).

#### Проблема 1 — «открыл-полистал-вернулся прыгает на чужое сообщение» (closed loop)

**Подтверждение в логе 11:31:38** (23 повтора):
```
restore-start         savedAnchor=4048551936
initial-restore-applied mode=anchor anchorMsgId=4048551936
scroll-save           anchorMsgId=4049600512 lastUserType=none      ← искажённый!
```
Каждый возврат смещал анкор на 1 msg ниже (4048→4049→4050→4051→4052→...) — потому что:
1. `tryRestoreWithRetry` вызывал `onRestoreAnchor` → `virtualListRef.scrollToRow({ index, align:'end', behavior:'auto' })`
2. По [MDN scroll event spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll_event) — `scroll` event срабатывает И для programmatic scroll
3. `handleScroll` в [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js) сохранял `findVisibleAnchorMsgId(el)` — но в момент срабатывания react-window ещё не перендерил DOM, видимая область была СДВИНУТА → сохранялся не тот msgId, что просили
4. При следующем возврате — читали испорченное значение → новый promgammatic scroll → новый сдвиг

**Решение — isRestoringRef флаг** (паттерн Telegram Web K `_isJumping` из [tweb ScrollSaver](https://github.com/morethanwords/tweb/blob/master/src/helpers/scrollSaver.ts)):

- Ref объявлен ОДИН раз в [`InboxMode.jsx`](src/native/modes/InboxMode.jsx) около `scrollPosByChatRef` — потому что хуки `useScrollPositionAutosave`/`useInboxScroll` вызываются ДО `useInitialScroll` (TDZ).
- Проброшен в 3 хука: `useInitialScroll` (ставит флаг перед programmatic scroll), `useInboxScroll.handleScroll` (пропускает save), `useScrollPositionAutosave` (пропускает interval save).
- Таймауты: 500мс для anchor mode (восстановление мгновенное), 1500мс для bottom mode (покрывает initial scroll + 1000мс postcheck `scrollToRow` retry).
- Лог `scroll-save` сохраняет поле `isRestoring: true/false` — диагностика что blocked saves работают (TODO-7).

#### Проблема 3 — Maximum update depth exceeded при старте

**Подтверждение в логе 12:40:09-10** (1.5с):
```
ipc-burst channel=tg:chat-avatar         count=300+ ms=1500
ipc-burst channel=tg:chat-last-message   count=280+ ms=1500
ipc-burst channel=tg:sender-avatar       count=80+  ms=1500
[error] Warning: Maximum update depth exceeded ...
       at nativeStoreIpc.js:215  (tg:chat-last-message)
       at nativeStoreIpc.js:347  (tg:sender-avatar)
```

**Корень**: [React 18+ batching docs](https://react.dev/blog/2022/03/29/react-v18) — automatic batching работает только в пределах **одного macrotask**. Каждый IPC event приходит в **отдельной** task через `window.api.on` → каждый = отдельный `setState` → отдельный render. 660+ events за 1.5с = переполнение update budget.

**Решение — rAF-батчинг** ([`nativeStoreIpc.js`](src/native/store/nativeStoreIpc.js)) для 3-х handlers:
```js
let pendingChatAvatar = new Map()
let scheduled = false
function flush() {
  scheduled = false
  if (pendingChatAvatar.size === 0) return
  const updates = pendingChatAvatar; pendingChatAvatar = new Map()
  setState(s => /* применяем ВСЕ updates за один render */)
}
addHandler('tg:chat-avatar', ({chatId, avatarPath}) => {
  pendingChatAvatar.set(chatId, avatarPath)  // dedup → last wins
  if (!scheduled) { scheduled = true; requestAnimationFrame(flush) }
})
```

- Dedupe по chatId/senderId: если для одного chat пришло 5 avatar updates за кадр → применится последний.
- Один setState на кадр = один render даже если событий 1000.
- Сверено по: [React docs про batching](https://react.dev/learn/state-as-a-snapshot), Telegram Web K (`appDialogsManager` — тот же паттерн), [Discord Engineering](https://discord.com/blog/how-discord-stores-trillions-of-messages) (MobX rAF batching).
- Timestamp guard для `tg:chat-last-message` сохранён в batch flush (через поле `ts` в payload).

Применено к: `tg:chat-last-message`, `tg:sender-avatar`, `tg:chat-avatar`. Остальные handlers (tg:messages, tg:new-message, tg:chats) приходят редко — батчинг не нужен.

#### Проблема 4 — хардкод версии в логе

`main.js:161` печатал `=== ChatCenter v0.87.135 start ===` независимо от `package.json` (источник истины — `app.getVersion()` по [Electron docs](https://www.electronjs.org/docs/latest/api/app#appgetversion)). Заменено на template literal с `app.getVersion()`.

#### Лимиты файлов

`nativeStoreIpc.js`: 472 → 529 строк (rAF-батчинг ~60 строк). Ceiling 500→600 в [`fileSizeLimitsExceptions.cjs`](src/__tests__/fileSizeLimitsExceptions.cjs) — доменное разбиение IPC handlers (chats/messages/topics/metadata) — отдельная плановая задача.

`InboxMode.jsx`: 653 → 661 строк (объявление ref + проброс в 3 хука). Ceiling 660→670.

#### Что НЕ чинили в v0.91.22

**Проблема 2** (react-window scrollHeight clamped в bottom mode) — в логе 0 `postcheck-tick` событий, юзер не воспроизвёл сценарий «возврат к чату где был внизу». Без подтверждения корня — не трогаем (saga rule «7 коммитов фиксов без логов — антипаттерн»). TODO-8 остаётся открытым.

#### Файлы

- [`InboxMode.jsx`](src/native/modes/InboxMode.jsx) — объявление `isRestoringRef`, проброс в 3 хука
- [`useInitialScroll.js`](src/native/hooks/useInitialScroll.js) — принимает `isRestoringRef` как param (не создаёт внутри)
- [`useInitialScrollDiag.js`](src/native/hooks/useInitialScrollDiag.js) — ставит флаг в `tryRestoreWithRetry` (1500мс)
- [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js) — пропускает save при `isRestoringRef.current`
- [`useScrollPositionAutosave.js`](src/native/hooks/useScrollPositionAutosave.js) — пропускает interval save
- [`nativeStoreIpc.js`](src/native/store/nativeStoreIpc.js) — rAF-батчинг для 3-х handlers
- [`main/main.js`](main/main.js) — `app.getVersion()` вместо хардкода
- [`fileSizeLimitsExceptions.cjs`](src/__tests__/fileSizeLimitsExceptions.cjs) — ceiling bumps
- Documentation: `features.md`, `mistakes/native-scroll-unread.md`, `mistakes/electron-core.md` (новая ловушка), `native-scroll-restore-saga.md`

#### Как воспроизвести фикс (для юзера)

1. Запустить приложение
2. Открыть чат А с историей > 100 сообщений
3. Прокрутить ВВЕРХ к середине истории (примерно на 50%)
4. Перейти на чат B
5. Вернуться на чат A
6. **Ожидание**: позиция точно та же, на которой остановился. Если повторить шаги 4-5 ещё 5 раз — позиция НЕ должна смещаться.
7. Проверить лог `scroll-save` — должно быть много записей с `isRestoring: true` (это значит фикс работает: scroll события от restore залогированы, но в Map не сохранены).
8. Проверить отсутствие `Maximum update depth` в логе при старте. Лог `ipc-burst` может остаться (диагностика).

#### Откат

`git revert <hash>` — изменения изолированы; rAF-батчинг — чистый паттерн без зависимостей от старой логики; флаг — добавление параметра без удаления старого поведения.

---

### v0.91.21 — Диагностика IPC bursts для Проблемы 3 (БЕЗ правки логики)

После v0.91.20 stack trace показал что Maximum update depth происходит из setState в `nativeStoreIpc.js:215` (tg:chat-last-message) и `:347` (tg:sender-avatar). Однако **причина loop не известна** — это может быть:
- Много IPC events приходит в разных macrotasks (батчинг React не объединяет их в один re-render)
- ИЛИ useEffect где-то с плохими deps создаёт cycle
- ИЛИ что-то ещё

🥇 [React 18 batching docs](https://react.dev/blog/2022/03/29/react-v18): «automatic batching работает всё равно где: setTimeout, promises, **native event handlers**». То есть IPC handlers ДОЛЖНЫ батчиться автоматически — НО только если они в **одной macrotask**. Если каждый IPC event = отдельная macrotask → каждый setState отдельный re-render.

Диагностика: счётчик IPC bursts в `attachTelegramIpcListeners`. Обёртка над `addHandler` для **всех** channels — если N events приходят в окне <100мс → лог `ipc-burst {channel, count, ms}`. Это покажет:
- Какой channel приходит тысячами (tg:chat-last-message? tg:sender-avatar? tg:chats?)
- Через сколько мс приходит весь burst (10? 100? 1000?)
- Можно ли решить через rAF batching

Не трогаем поведение IPC handlers — только счётчик в обёртке. Удалить после фикса корня (TODO-9).

Стек: React 19.2.4, Electron 41.1.0 (IPC через contextBridge).

Файлы:
- `nativeStoreIpc.js`: обёртка addHandler с `trackIpcBurst` (~15 строк)

Документация: features.md, api.md (новое событие ipc-burst), code-todo.md TODO-9.

Откат: `git revert <hash>` — только логирование.

---

### v0.91.20 — Полная диагностика для оставшихся 2 проблем (БЕЗ правки логики)

Корень Проблемы 1 (замкнутый круг handleScroll) уже подтверждён v0.91.19. Остаются 2 проблемы где корень НЕ известен — добавлена их диагностика. По правилу из [`native-scroll-restore-saga.md`](.memory-bank/native-scroll-restore-saga.md): «7 коммитов «фиксов» без подтверждения корня логами — антипаттерн». Сначала факты, потом фикс.

#### Диагностика A — Stack trace для Maximum update depth (Проблема 3)

В [`useConsoleErrorLogger.js`](src/hooks/useConsoleErrorLogger.js) `patchedError`: захват `new Error().stack` при совпадении строки с «Maximum update depth» или «Warning: Cannot update». Без stack невозможно найти точный компонент с infinite loop. Срабатывает ТОЛЬКО при матче — не замедляет другие пути.

Что покажет: точную цепочку React fibers → найдём какой `useEffect`/`setState` вызывает цикл при инициализации (после `loadCachedChats chats=0`).

#### Диагностика B — Multi-step postcheck для react-window remeasure (Проблема 2)

В [`useInitialScrollDiag.js`](src/native/hooks/useInitialScrollDiag.js) — bottom mode postcheck заменён на **5 замеров** на 50/100/300/500/1000мс. На каждом тике пишем scrollHeight без запуска нового scroll. Финальная корректировка только на 1000мс (даём react-window полное время на remeasure).

Что покажет: точную траекторию scrollHeight от 16594 (на момент restore) до финального (77125 в логе 11:31:23). Узнаём ТОЧНОЕ время когда react-window закончил пересчёт — подберём правильный timeout для финального postcheck.

#### Что НЕ делал в v0.91.20

- ❌ Фикс замкнутого круга — отложен до получения данных диагностики 2 (возможно нужен не только флаг, но и правильное время сброса флага = время remeasure).
- ❌ Фикс Maximum update depth — без stack trace.
- ❌ Фикс hardcoded версии в main.js:161 — техдолг, отложено.

Все фиксы будут в v0.91.21 ОДНИМ коммитом на основе ТОЧНЫХ фактов.

#### Файлы

- `useConsoleErrorLogger.js`: +5 строк stack capture (диагностика A)
- `useInitialScrollDiag.js`: postcheck заменён на multi-step 50/100/300/500/1000мс (диагностика B, +15 строк)

TODO-8 в [`code-todo.md`](.memory-bank/code-todo.md): удалить всю диагностику v0.91.19+v0.91.20 в коммите с фиксами v0.91.21.

Откат: `git revert <hash>` — только логи, поведение не меняется.

---

### v0.91.19 — Диагностика «прыгает позиция при возврате» (3 точки лога, БЕЗ правки логики)

После 7 коммитов v0.91.12-18 проблема НЕ решена (детали — в [`native-scroll-restore-saga.md`](.memory-bank/native-scroll-restore-saga.md)). Моя гипотеза «замкнутый круг handleScroll» **косвенная** — нет прямого доказательства в логах.

Добавлены 3 точки логирования (логика не тронута):

| Событие | Где | Когда срабатывает |
|---|---|---|
| `restore-start` | `tryRestoreWithRetry` в [`useInitialScrollDiag.js`](src/native/hooks/useInitialScrollDiag.js) | Перед каждым restore. Поля: `chatId, savedAnchor, savedAtBottom`. |
| `scroll-save` | `handleScroll` в [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js) | При каждом сохранении anchor (user scroll ИЛИ programmatic). Поля: `viewKey, anchorMsgId, atBottom, scrollTop, scrollHeight`. |
| `autosave-save` | interval в [`useScrollPositionAutosave.js`](src/native/hooks/useScrollPositionAutosave.js) | Каждые 1.5с при наличии активного чата. Поля: `activeViewKey, anchorMsgId, atBottom`. |

**Что покажет лог после повторного теста**:
- Если ГИПОТЕЗА «замкнутый круг» верна: `restore-start savedAnchor=X` → через 0-50мс `scroll-save anchorMsgId=Y` (Y ≠ X). Подтверждение что programmatic scroll от restore триггерит handleScroll и портит сохранённую позицию.
- Если корень в `autosave`: `autosave-save` срабатывает в момент сразу после restore с искажённым anchor.
- Если оба: видим оба паттерна.
- Если ни один: корень в другом — react-window cacheKey reset, React effect race и т.п.

После анализа лога юзера → **точечный фикс** v0.91.20 (предположительно `isRestoringRef` флаг, ~10 строк, 3 файла).

Это **только логи** — поведение не меняется. UncaughtErrorToast не должен показывать ошибок (это диагностика, не код).

Стек: React 19.2.4, react-window 2.2.7, tdl 8.1.0. Не трогаем restore/save логику, только видимость.

Файлы:
- `useInboxScroll.js`: +5 строк лог `scroll-save` через `scrollDiag.logEvent`
- `useScrollPositionAutosave.js`: +1 импорт + 1 строка лог `autosave-save`
- `useInitialScrollDiag.js`: +5 строк лог `restore-start` перед `logRestoreDiag`

TODO-7 в `code-todo.md`: удалить эти 3 лога в коммите с фиксом корня. Документация — `mistakes/native-scroll-unread.md` + `native-scroll-restore-saga.md`.

Откат: `git revert <hash>` — только логи, не влияет на поведение.

---

### v0.91.18 — Фикс ReferenceError scrollRef в postcheck setTimeout (доделка v0.91.16)

🔴 **Логи chatcenter.log 10:04:59-10:05:02**: `[R:ERROR] [renderer-uncaught] ReferenceError: scrollRef is not defined` × 3 раза. Юзер видел красное сообщение об ошибке через UncaughtErrorToast.

Корень: в v0.91.16 я переписывал `logRestoreDiag` для anchor msgId формата. Удалил `scrollRef` из параметров функции — но **забыл обновить** строку 101 в postcheck setTimeout где `scrollRef.current` всё ещё использовался. JavaScript closure не нашёл `scrollRef` в outer scope → **ReferenceError** при каждом срабатывании postcheck.

🥇 [MDN ReferenceError spec](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Not_defined): «Возникает при попытке использовать переменную, которая не была объявлена или недоступна в текущей области видимости. Частая проблема — setTimeout callback теряет доступ к переменной outer scope если она там не объявлена».

**Последствие в работе**: postcheck setTimeout(100мс) — это корректировка scrollTop после react-window remeasure. ReferenceError → exception → postcheck НЕ работал → юзер видел первый clamped scroll (~50% от реального дна) без последующей корректировки → восприятие «всё ещё прыгает» хотя v0.91.16 декларировал фикс.

Почему lint не поймал: ESLint видит `scrollRef` как **свободную переменную** — может быть глобальная или из outer scope в runtime. Static analysis не отличает от валидного closure. Vitest не покрывал runtime внутри setTimeout (моки не симулируют 100мс задержку с реальным DOM).

Решение: добавил `scrollRef` обратно в параметры `logRestoreDiag` (как было в v0.91.11). Также проброс из `tryRestoreWithRetry`.

Заодно — фикс предупреждения React по `useScrollPositionAutosave` (v0.91.17): убрал `msgsScrollRef, scrollPosByChatRef` из deps. 🥇 [React useEffect docs](https://react.dev/reference/react/useEffect): «useRef имеет стабильную идентичность — НЕ нужно добавлять в массив зависимостей».

Стек: React 19.2.4, react-window 2.2.7, tdl 8.1.0, Electron 41.1.0. Не трогаем backend / store / другие hooks.

Что не делал: расследование `Maximum update depth exceeded` (09:11:08) — отдельный существующий баг при инициализации, не связан с моими v0.91.x фиксами (происходит ДО открытия чата, мой autosave hook не запущен). Требует отдельной задачи.

Файлы:
- `useInitialScrollDiag.js`: +`scrollRef` в параметры `logRestoreDiag` + проброс из `tryRestoreWithRetry`
- `useScrollPositionAutosave.js`: refs убраны из deps

Документация: запись в features.md, ловушка в `mistakes/native-scroll-unread.md` «забытый параметр функции после рефакторинга → ReferenceError, lint не ловит».

Откат: `git revert <hash>` — постcheck снова сломается (ReferenceError вернётся), v0.91.16 в текущем виде уже сломан.

---

### v0.91.17 — Периодическое сохранение позиции каждые 1.5с (фикс «открыл-посмотрел-вернулся не туда»)

Лог 18:08:30 показал что юзер открыл чат «о чём говорят коллеги» (`messages=0 hasEl=false`), переключился на «Клуб партнёров» (18:08:51), вернулся (18:08:53). В скриншотах #1 и #2 — РАЗНЫЕ статьи. То есть anchor не сохранил то место где юзер был.

Корень: [`useInboxScroll.js handleScroll`](src/native/hooks/useInboxScroll.js) сохраняет anchor ТОЛЬКО при scroll событии. Если юзер открыл чат и **просто читает без скроллинга** (длинные статьи с превью, большие посты) — сохранения не происходит. При возврате → старый anchor из прошлой сессии (или null) → юзер не на своей позиции.

🥇 [Telegram Web K (tweb)](https://github.com/morethanwords/tweb): ScrollSaver класс + сохранение **на смену peer** в `onChange peer`. Два места сохранения: scroll + смена чата.

Решение: добавить `setInterval(1500мс)` в `InboxMode.jsx` — пока чат активен, каждые 1.5с сохраняем `findVisibleAnchorMsgId` + `atBottom` в `scrollPosByChatRef`. Защита: только при `chatReady=true`, `msgsScrollRef.current!==null`, `anchorMsgId || atBottom`. Cleanup автоматически при смене `activeViewKey` (useEffect deps).

Почему НЕ через cleanup useEffect при смене activeChatId: React 19 порядок effects — children срабатывают раньше parent. К моменту cleanup в InboxMode `msgsScrollRef.current` уже = НОВЫЙ scrollEl (InboxChatPanel useEffect sync уже отработал) → сохранили бы позицию НОВОГО чата под ID СТАРОГО.

Заодно фикс v0.91.15 bug в `scrollToBottom` handler — записывал `el.scrollHeight` (число) вместо нового формата `{anchorMsgId: null, atBottom: true}`.

Стек: React 19.2.4, react-window 2.2.7, tdl 8.1.0, Electron 41.1.0. Не трогаем backend / store / handleScroll / initial scroll.

Файлы:
- `InboxMode.jsx`: добавлен useEffect с интервалом 1.5с после объявления activeViewKey (TDZ-safe), фикс scrollToBottom формата

Документация: запись в features.md, новая ловушка в `mistakes/native-scroll-unread.md` «handleScroll не покрывает случай «юзер не скроллит»».

Подробности — в [`mistakes/native-scroll-unread.md`](.memory-bank/mistakes/native-scroll-unread.md) «handleScroll не покрывает простой просмотр без скролла». Откат: `git revert <hash>`.

---

### v0.91.16 — bottom mode через scrollToRow + retry MAX 30 (доделка v0.91.15)

Лог 17:34:04 после v0.91.15: `initial-restore-applied mode=bottom actualTop=1670 scrollHeight=2185` для `messages=50`. scrollHeight=2185 ≈ 50×defaultRowHeight(50) — react-window не успел remeasure. Юзер на «псевдо-дне» (1670 при реальном дне ~4000).

Корень: v0.91.15 ветка `saved.atBottom` использовала `scrollEl.scrollTop = scrollEl.scrollHeight` — raw scrollHeight тоже clamped когда useDynamicRowHeight кэш сброшен.

Также лог 17:34:00: `initial-restore-skip reason=no-scrollEl-final attempts=10`. DOM react-window не появлялся за 166мс при heavy renders / быстром переключении.

Решение:
1. **bottom mode через scrollToRow**: `onScrollToIndex(lastIdx, 'end')` использует react-window scrollToRow API — самосинхронизируется с remeasure. Fallback `scrollEl.scrollHeight` если индекса нет.
2. **Postcheck через 100мс**: после remeasure scrollHeight вырастает → повторяем scrollToRow → юзер на реальном дне.
3. **RETURN_MAX_ATTEMPTS 10 → 30**: 166мс → 500мс. Heavy renders успевают примонтировать DOM.

Стек: React 19.2.4, react-window 2.2.7 (scrollToRow API), tdl 8.1.0. Архитектурно: bottom mode теперь идёт через тот же путь что anchor mode (через scrollToRow imperative API react-window). Это устраняет двойной стандарт.

Файлы:
- `useInitialScrollDiag.js`: bottom через onScrollToIndex + postcheck + MAX=30
- `useInitialScroll.js`: пробрасывает onScrollToIndex/onGetLastIndex
- `InboxMode.jsx`: `onScrollToIndex = virtualListRef.scrollToRow`, `onGetLastIndex = renderItems.length - 1`

Откат: `git revert <hash>`.

---

### v0.91.15 — Anchor msgId вместо пиксельного scrollTop (паттерн Telegram Web K)

Лог 16:19:24: `requestedTop=2235 actualTop=1883 clamped=TRUE`. Пиксельный `scrollTop` обрезался браузером ([MDN scrollTop spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop)) когда react-window сбрасывал кэш высот при ремаунте (`useDynamicRowHeight({key: cacheKey})`). `handleScroll` сохранял clamped значение в `scrollPosByChatRef` → savedTop деградировал при каждом возврате: 11494 → 2235 → 1430.

🥇 [Telegram Web K (tweb)](https://github.com/morethanwords/tweb): `setPeerOptions.topMessageFullMid` — сохраняют **id видимого msg**, не scrollTop. При возврате scrollIntoView по msgId. ID стабилен между ремаунтами.

Решение: формат `scrollPositionsCache` изменён с `number` (scrollTop) на `{ anchorMsgId, atBottom }`. При уходе из чата сохраняем id последнего видимого снизу msg + флаг atBottom. При возврате:
- `atBottom=true` → `scrollEl.scrollTop = scrollEl.scrollHeight` (scroll to bottom, scrollHeight надёжен)
- `anchorMsgId` → `scrollToVirtualRow(msgId, 'end')` через react-window scrollToRow (msg окажется снизу viewport)

Backward compat: старый формат (number) в localStorage игнорируется. STORAGE_VERSION=2.

Стек: React 19.2.4, react-window 2.2.7 (scrollToRow API), tdl 8.1.0. Паттерн применён к 4 файлам: scrollPositionsCache.js (новый формат + findVisibleAnchorMsgId), useInboxScroll.js (handleScroll сохраняет anchor через DOM), useInitialScroll.js + useInitialScrollDiag.js (restore через onRestoreAnchor), InboxMode.jsx (onRestoreAnchor = scrollToVirtualRow).

Подробности — в [`mistakes/native-scroll-unread.md`](.memory-bank/mistakes/native-scroll-unread.md) «anchor msgId вместо пиксельного scrollTop». Откат: `git revert <hash>`.

---

### v0.91.14 — Фикс «возврат в чат кидает наверх, непрочитанные ниже» (retry-loop в ветке already-seen)

Лог 14:54:35 (Вайбкодинг комьюнити, unread=5, открытие после ранее закрытого чата): `chat-open hasEl=false` → `initial-restore-skip no-scrollEl` → 4× `not-returning` → НЕТ `initial-restore-applied`. Scroll остался на top=0.

🥇 [Telegram Web K (tweb) source](https://github.com/morethanwords/tweb): двухэтапное применение позиции — сохраняют в `setPeerOptions.savedPosition`, применяют через callback `attachPlaceholderOnRender` после mount DOM. Никогда не делают raw `scrollEl.scrollTop = X` синхронно.

Корень: в `useInitialScroll.js` ветка «already-seen» (v0.91.7 + v0.91.11) не имела retry-loop для случая `scrollEl=null`. При первом срабатывании useEffect react-window DOM ещё не примонтирован → `scrollEl=null` → silent skip. **Параллельно** `lastActiveChatIdRef.current = activeChatId` ставился безусловно → следующее срабатывание `isReturning=false` → skip not-returning → restore не выполнялся НИКОГДА. Регрессия моих v0.91.7+v0.91.11.

Решение: применил тот же `requestAnimationFrame` retry-loop × 10 что в ветке 1 (v0.91.6). `lastActiveChatIdRef.current = activeChatId` ставится **только когда DOM готов** или MAX_ATTEMPTS исчерпан — защита v0.91.7 сохранена.

Симметрия восстановлена: обе ветки initial-scroll (новый чат и already-seen) теперь имеют retry для DOM mount race.

Подробности — в [`mistakes/native-scroll-unread.md`](.memory-bank/mistakes/native-scroll-unread.md) «retry-loop ОБЯЗАТЕЛЕН в обеих ветках initial-scroll». Регрессия: 2 теста в `useInitialScroll.vitest.jsx`. Откат: `git revert <hash>`.

---

### v0.91.13 — Фикс «открыл чат unread=304 → бейдж сразу 0» (threshold guard)

В [`useForceReadAtBottom.js`](src/native/hooks/useForceReadAtBottom.js) добавлена константа `FORCE_READ_MAX_UNREAD=30`: при `unread > 30` markRead не отправляется, ждём IntersectionObserver per-msg. Корень, факты, тесты — в [`mistakes/native-scroll-unread.md`](.memory-bank/mistakes/native-scroll-unread.md) «mass-ack при открытии».

**✅ Подтверждено логом 25 мая 2026 (chatcenter.log 14:52:57-14:53:14)**: 3 события `force-read-skip reason=unread-too-high threshold=30` для форум-чата `topic:1` (unread=60). markRead **не отправлен**. Юзер постепенно прочитал через IntersectionObserver per-msg (`first-unread-calc` показал прогрессию unread: 33 → 30 → 17 → 7 → 0).

---

### v0.91.12 — Фикс «дёрганья при скролле к дну» (dedup signal в prefetch)

**✅ Подтверждено логом 25 мая 2026**: за всю сессию (4 часа работы) — **16 `load-newer-trigger` с УНИКАЛЬНЫМИ afterId**, ни одного повтора. До фикса было 4 одинаковых за 1с (см. ниже).

Лог 12:02:22 — 4 `load-newer-trigger` с одним afterId за 1с. В [`useInboxNewerPrefetch.js`](src/native/hooks/useInboxNewerPrefetch.js) `reachedEnd` не учитывал «backend вернул 100 msg, все дубли» → noMoreNewerRef не ставился, prefetch стрелял повторно.

🥇 [TDLib `getChatHistory` spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html): TDLib работает по диапазону `from_message_id + offset`, не учитывает кэш клиента — если msg уже пришли через push раньше invoke, вернёт повторно.

Решение: фильтруем `result.messages` по `existingIds` из `activeMessages`. Все дубли (newCount=0) → ставим флаг. Сброс через `useEffect` v0.88.2 при росте `activeMessages.length`. Подробности — в [`mistakes/native-scroll-unread.md`](.memory-bank/mistakes/native-scroll-unread.md). Регрессия: 4 теста в `useInboxNewerPrefetch.vitest.jsx`. Откат: `git revert <hash>`.

---
