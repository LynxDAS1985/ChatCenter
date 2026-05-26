# Сага восстановления позиции в native-режиме Telegram

**Создано**: 26 мая 2026 (v0.91.18, после 7 коммитов).
**Обновлено**: 26 мая 2026 (v0.91.23, diag для Проблемы 2 добавлена).
**Статус**: 🟡 **Проблемы 1, 3, 4 — РЕШЕНЫ (подтверждено логом 13:06+). Проблема 2 — диагностируется**. Юзер видит «частично помогло»: anchor больше не дрейфует, но при ПЕРВОМ возврате остаётся прыжок из-за react-window remeasure.
**Назначение**: честная фиксация всех попыток + признание ошибок + детальная диагностика.

---

## 🟡 v0.91.23 — diag для Проблемы 2 (react-window scrollHeight remeasure)

### Что показал лог v0.91.22

**Закрылось** (подтверждено цифрами):

| Метрика | Кол-во |
|---|---|
| `Maximum update depth` после старта v0.91.22 | **0 событий** ✅ |
| `scroll-save isRestoring=true` (closed-loop save заблокирован) | **87 раз** ✅ |
| `scroll-save isRestoring=false lastUserType=none` (programmatic save утёк) | **0** ✅ |
| `savedAnchor` для одного чата при 8 переключениях A↔B | **СТАБИЛЕН** ✅ |

**Осталось** (Проблема 2):
```
13:08:02 restore-start chatId=...-1001296261677 savedAnchor=8937013248 savedAtBottom=false
13:08:02 (через 141мс) scroll-save anchorMsgId=10712252416 atBottom=TRUE  ← упал в самый низ
13:08:02 scroll-anomaly prevHeight=14806 → currHeight=12417 reasonGuess=height-changed(layout-shift/load-older)
```

### Корень Проблемы 2 (по доке)

1. [react-window 2.2.7 useDynamicRowHeight](https://github.com/bvaughn/react-window/blob/master/README.md) сначала использует `defaultRowHeight: 50` для оценки `scrollHeight` (всего N row × 50px), потом измеряет реальные высоты через ResizeObserver → `scrollHeight` ужимается.
2. [MDN scrollTop spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop): «If specified value is greater than the maximum that the element can be scrolled, the value of scrollTop is set to the maximum». Когда `scrollHeight` ужался, ранее установленный `scrollTop` обрезается до низа → `atBottom=true`.

### Почему фикс v0.91.16 не закрыл Проблему 2

v0.91.16 добавил `postcheck setTimeout × [50, 100, 300, 500, 1000]` ms — но **только для bottom mode** (`saved.atBottom===true`). Для **anchor mode** (`saved.anchorMsgId`) retry НЕ было — `onRestoreAnchor` вызывался один раз.

### v0.91.23 — что добавлено (ТОЛЬКО ЛОГ)

По доке react-window 2.2.7 (`node_modules/react-window/dist/react-window.d.ts:366`): `onRowsRendered` зовётся синхронно с rendering pipeline ПОСЛЕ measure phase. Это штатный сигнал «список устаканился» — лучше чем magic numbers setTimeout.

В [`InboxMode.jsx`](src/native/modes/InboxMode.jsx):
- 4 ref для трекинга: `restoreTargetMsgIdRef`, `restoreTargetAlignRef`, `restoreStartTimeRef`, `restoreAttemptsRef`.
- `onRestoreAnchor`/`onMissingTarget` сохраняют target **msgId** (не индекс — индексы сдвигаются при удалении/добавлении сообщений).
- `handleRowsRendered({startIndex, stopIndex})` пишет `anchor-postcheck-tick` лог с полями: `msgId`, `targetIdx` (через `findRenderItemIndex`), `startIndex/stopIndex`, `inViewport`, `align`, `attempt`, `sinceStartMs`, `scrollTop`, `scrollHeight`. Только когда `isRestoringRef.current === true`.

В [`InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx) проп `onRowsRendered` прокинут в `VirtualMessageList` (проп уже принимался с v0.89.0, никто не передавал).

### Что покажет лог v0.91.23

1. **Сколько раз `onRowsRendered` зовётся за один restore** (1? 5? 10? — даст пик частоты для будущего max-attempts threshold)
2. **На какой попытке `inViewport=true`** (это момент сходимости — после неё re-scroll не нужен)
3. **Сколько мс проходит от `restore-start` до сходимости** (для сравнения с magic setTimeout 50/100/300/500/1000)
4. **Что когда `targetIdx=-1`** (msg удалён, или ещё не отрендерен — нужна логика wait)
5. **Где останавливается `targetIdx`** при первом вызове (за пределами viewport — насколько сильно ускользает)

### Дальше (v0.91.24)

После подтверждения юзером из логов — фикс-коммит добавит в `handleRowsRendered`:
- Re-scroll через `virtualListRef.current?.scrollToRow({index: targetIdx, align: restoreTargetAlignRef.current})` если `!inViewport`
- Max 5 attempts (защита от bounce)
- Abort при `markUserScroll(wheel/touch/pointer)` — если юзер начал крутить, restore отменяется
- Пропуск при `targetIdx=-1` (msg не отрендерен — ждём следующий onRowsRendered)
- Удаление диагностического логирования (или сохранение через флаг `CC_LOG_RESTORE_TICKS`)

---

## ✅ v0.91.22 — Проблемы 1, 3, 4 РЕШЕНЫ (подтверждено)

---

## 🟡 v0.91.22 — ФИКС РЕАЛИЗОВАН (ожидает подтверждения)

### Проблема 1 — closed-loop scroll-save — РЕШЕНА через `isRestoringRef`

Паттерн Telegram Web K `_isJumping` ([tweb ScrollSaver](https://github.com/morethanwords/tweb/blob/master/src/helpers/scrollSaver.ts)):

```js
// InboxMode.jsx — один ref, проброшен в 3 хука
const isRestoringRef = useRef(false)
useScrollPositionAutosave({ ..., isRestoringRef })  // skip interval save
useInitialScroll({ ..., isRestoringRef })           // ставит флаг перед scrollToRow
useInboxScroll({ ..., isRestoringRef })             // skip handleScroll save

// useInitialScrollDiag.js перед programmatic scroll:
isRestoringRef.current = true
setTimeout(() => { isRestoringRef.current = false }, 1500)
// 1500мс = initial scroll + 1000мс postcheck
```

### Проблема 3 — Maximum update depth — РЕШЕНА через rAF-батчинг

Подтверждённые в логе burst: `tg:chat-avatar` 300+, `tg:chat-last-message` 280+, `tg:sender-avatar` 80+ events за 1.5с при старте TDLib.

```js
// nativeStoreIpc.js — паттерн для каждого из 3-х handlers
let pending = new Map()
let scheduled = false
function flush() {
  scheduled = false
  if (pending.size === 0) return
  const batch = pending; pending = new Map()
  setState(s => /* применить ВСЕ updates за один render */)
}
addHandler('tg:chat-avatar', ({chatId, avatarPath}) => {
  pending.set(chatId, avatarPath)  // dedup
  if (!scheduled) { scheduled = true; requestAnimationFrame(flush) }
})
```

### Проблема 4 — хардкод версии — РЕШЕНА

`main.js:161`: `'=== ChatCenter v0.87.135 start ==='` → `\`=== ChatCenter v${app.getVersion()} start ===\``.

### Проблема 2 — react-window scrollHeight clamped (bottom mode) — НЕ ТРОГАЛИ

В логе 0 `postcheck-tick` событий — юзер не воспроизвёл сценарий «возврат к чату где был внизу». По правилу саги «7 коммитов фиксов без логов — антипаттерн» не чиним вслепую. TODO-8 остаётся открытым.

### Как воспроизвести фикс (для юзера)

1. Запустить приложение
2. Открыть чат А с историей > 100 сообщений
3. Прокрутить ВВЕРХ к середине истории (примерно на 50%)
4. Перейти на чат B
5. Вернуться на чат A
6. **Ожидание**: позиция точно та же. Повторить шаги 4-5 ещё 5 раз — позиция НЕ должна смещаться.
7. Проверить лог `scroll-save` — должно быть много записей с `isRestoring: true` (это значит фикс работает).
8. Проверить отсутствие `Maximum update depth` в логе при старте.

После подтверждения юзером — удалить диагностику v0.91.19/20/21 (TODO-7/8/9) и обновить статус саги до 🟢 ЗАКРЫТО.

---

## ✅ КОРЕНЬ ПОДТВЕРЖДЁН (v0.91.19 диагностика)

### 🔴 Проблема 1 — Замкнутый круг `handleScroll` (главная)

**Прямое доказательство `chatcenter.log` 11:31:38**:
```
11:31:38.000 store-set-active-chat                                   (юзер кликнул чат A)
11:31:38.000 chat-open                                                (DOM открыт)
11:31:38.053 restore-start savedAnchor=4048551936                     ← хотим восстановить X
11:31:38.053 initial-restore-applied mode=anchor anchorMsgId=4048551936
                                                  ↑ scrollToRow(X, 'end') — programmatic
11:31:38.106 scroll-save anchorMsgId=4049600512 lastUserType=none     ← ❌ через 53мс СОХРАНЁН Y!
                                                ↑ юзер НЕ скроллил
```

**Деградация по 5 возвратам в один чат**:
```
4048551936 → 4049600512 → 4050649088 → 4051697664 → 4052746240
```
Каждый возврат смещает anchor на **1 msg вниз**.

**Тот же чат «Forbes Russia»**:
```
100941168640 → 100943265792 → 100950605824 → 100952702976
```

**Статистика**:
- 8 раз `restore-start` зарегистрирован
- 13 раз `scroll-save lastUserType=none` (programmatic) — каждый раз искажает anchor
- 679 раз `scroll-save lastUserType=wheel` (нормальный user scroll)

**Почему**: `handleScroll` сохраняет anchor при **любом** scroll событии. 🥇 [MDN scroll event](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll_event): «Programmatic changes to scroll position also trigger this event». `scrollToRow` от моего restore триггерит `onScroll` → `handleScroll` находит **другой** видимый msg (т.к. после scroll viewport показывает другие msgs) → сохраняет его как anchor.

### 🔴 Проблема 2 — react-window НЕ remeasured к моменту restore

**Прямое доказательство 11:31:22-23**:
```
11:31:22.836 scroll-save scrollHeight=16594   ← на момент restore (mount + 800мс)
11:31:23.???  scroll-save scrollHeight=77125  ← после remeasure (вырос в 4.6 раза!)
```

react-window 2.x `useDynamicRowHeight({key: cacheKey})` сбрасывает кэш высот при смене `cacheKey={store.activeChatId}`. Все row пересчитываются от `defaultRowHeight=50` → scrollHeight маленький. ResizeObserver измеряет реальные высоты через ~800мс → scrollHeight вырастает.

Мой `scrollToRow(idx, 'end')` работает на **устаревших** высотах → пиксельная позиция всё равно неточная (хотя меньше чем с прямым `scrollTop`).

**Текущий postcheck setTimeout(100мс)** — слишком быстро, react-window не успевает remeasured за 100мс. Нужно 500-800мс ИЛИ слушать `ResizeObserver` event.

### 🔴 Проблема 3 — Maximum update depth exceeded (НЕ моя)

**3 раза в логе**:
- 10:49:18 — старая сессия
- 11:29:44 ×2 — свежая сессия v0.91.19

Возникает **при инициализации программы** (после `loadCachedChats`, до открытия первого чата). Не связан с моим autosave hook (он не активен без `activeViewKey`). Это **существующий** баг в другом компоненте.

**НЕ моя задача в этой саге**. Отдельное расследование.

### ✅ Проблема 4 — ReferenceError scrollRef (закрыта v0.91.18)

**3 раза в логе 10:04:59-10:05:02** — но это **до** моего фикса v0.91.18. После 10:30 (когда v0.91.18 закоммичен) — больше не появляется.

---

---

## 📋 Задача (по словам юзера)

«Я в чате на позиции X. Ушёл в другой чат. Вернулся обратно. Должен быть в том же месте X. Сейчас я в позиции Y ≠ X. С каждым возвратом — всё дальше от X.»

Главный сценарий: **длинные сообщения** (статьи с превью, посты с большими картинками), занимающие почти весь viewport.

---

## ⏰ Хронология попыток

| # | Версия | Гипотеза корня | Что сделал | Результат |
|---|---|---|---|---|
| 1 | v0.91.6 | scrollEl=null при mount в ветке 1 (новый чат) | retry-loop через `requestAnimationFrame` × 10 в [`useInitialScroll.js`](src/native/hooks/useInitialScroll.js) | ✅ Работает (подтверждено логом) |
| 2 | v0.91.7 | Циклическая перезапись scrollTop при 4 setState на messages | Паттерн `lastActiveChatIdRef` — restore только при реальной смене chatId | ✅ Работает |
| 3 | v0.91.11 | Не было видимости почему restore не выполняется | 4 диагностических лога `initial-restore-*` | ✅ Диагностика работает |
| 4 | v0.91.14 | Ветка 2 (already-seen) не имела retry-loop симметрично ветке 1 | Добавлен retry-loop через rAF × 10 для ветки 2 | ✅ Работает |
| 5 | v0.91.15 | Пиксельный scrollTop fragile — clamped при ремаунте react-window | Переход с number на `{anchorMsgId, atBottom}` — паттерн Telegram Web K | ✅ Технически работает (логи `mode=anchor`), 🔴 **юзер всё равно видит прыжки** |
| 6 | v0.91.16 | bottom mode тоже clamped через raw scrollHeight | bottom через `scrollToRow` + postcheck setTimeout(100мс) + MAX_ATTEMPTS 10→30 | 🔴 **Сломан ReferenceError** в postcheck — postcheck НЕ работал |
| 7 | v0.91.17 | handleScroll не покрывает «открыл-смотрит-уходит без скролла» | Hook `useScrollPositionAutosave` с setInterval(1.5с) | ⚠️ Технически работает, 🔴 **юзер всё равно видит прыжки** |
| 8 | v0.91.18 | ReferenceError scrollRef в postcheck v0.91.16 | Добавлен `scrollRef` в параметры `logRestoreDiag` + проброс из `tryRestoreWithRetry` | ✅ Ошибка ушла, 🔴 **юзер всё равно видит прыжки** |

---

## 🔴 Что точно НЕ работает (после 7 фиксов)

| Сценарий юзера | Поведение |
|---|---|
| Открыл чат, не скроллил, переключился, вернулся | ⚠️ Позиция изменилась (видит другое место) |
| Открыл чат, пролистал на дно, переключился, вернулся | ⚠️ Не на реальном дне |
| Открыл чат с длинной статьёй (700px+), смотрит, переключается, возвращается | 🔴 Другая статья в viewport |
| Несколько раз A → B → A → B → A | 🔴 Позиция деградирует с каждым возвратом |

---

## 🎯 Гипотеза ✅ ПОДТВЕРЖДЕНА (v0.91.19 diagnostics)

См. раздел «КОРЕНЬ ПОДТВЕРЖДЁН» выше. Все 3 факта в логе:
- 8 событий `restore-start` зафиксированы
- 13 событий `scroll-save lastUserType=none` (programmatic) — следуют через 30-100мс после restore
- Деградация anchor 4048→4049→4050→4051→4052 (нумерация продолжает Telegram message id, каждый раз сохраняется СЛЕДУЮЩИЙ msg после того который пытались restore)

---

## ❌ Признанные ошибки в стратегии

1. **v0.91.15 anchor msgId** — не решил замкнутый круг. Просто заменил формат с `number` на `{anchorMsgId, atBottom}` — но **handleScroll по-прежнему сохраняет при любом scroll**. Теперь портится anchor вместо scrollTop.

2. **v0.91.16 postcheck setTimeout** — добавил **ещё один** programmatic scroll через 100мс. Если гипотеза замкнутого круга верна — это **усугубило** проблему (двойная перезапись).

3. **v0.91.17 autosave 1.5с** — добавил **ещё один** источник сохранения. Если он срабатывает после programmatic scroll — сохранит искажённую позицию.

4. **v0.91.18 фикс ReferenceError** — закрыл свою ошибку (забытый параметр scrollRef), но **не корневую проблему**.

5. **Главная ошибка в стратегии**: **отказался** от первоначально предложенного Решения A («skip save 500мс после restore» через флаг `isRestoringRef`) в пользу «архитектурно правильного» anchor msgId. Anchor msgId сам по себе **не лечит** цикл.

---

## 🛠️ Что нужно делать дальше (НЕ сделано)

### Шаг 1 — добавить диагностические логи (✅ СДЕЛАНО в v0.91.19)

В [`useInboxScroll.js handleScroll`](src/native/hooks/useInboxScroll.js):
```javascript
if (anchorMsgId || nearBottom) {
  logNativeScroll('scroll-save', {
    viewKey, anchorMsgId, atBottom: nearBottom,
    scrollTop: el.scrollTop, scrollHeight: el.scrollHeight,
    isProgrammatic: !!isRestoringRef?.current,  // флаг ниже
  })
  ...
}
```

В [`useScrollPositionAutosave.js`](src/native/hooks/useScrollPositionAutosave.js):
```javascript
logNativeScroll('autosave', { activeViewKey, anchorMsgId, atBottom })
```

В `tryRestoreWithRetry`:
```javascript
logNativeScroll('restore-start', { chatId, savedAnchor: saved?.anchorMsgId })
```

### Шаг 2 — повторить сценарий + получить лог

Юзер открывает чат на сообщении X, переключается, возвращается. В логе будет:
```
restore-start savedAnchor=X
initial-restore-applied mode=anchor anchorMsgId=X
scroll-save anchorMsgId=??? isProgrammatic=true/false   ← ВОТ ЧТО НУЖНО
```

### Шаг 3 — фикс v0.91.20 через флаг `isRestoringRef` (ПЛАН, не сделано)

✅ Гипотеза подтверждена → нужен флаг.

**В `useInitialScroll.js`**:
```javascript
const isRestoringRef = useRef(false)
// передать в tryRestoreWithRetry, useInboxScroll, useScrollPositionAutosave
```

**В `tryRestoreWithRetry`** перед programmatic scroll:
```javascript
isRestoringRef.current = true
logRestoreDiag({...})  // выполняет scrollToRow
setTimeout(() => { isRestoringRef.current = false }, 500)
```

**В `handleScroll`** в самом начале:
```javascript
if (isRestoringRef?.current) return  // НЕ сохраняем во время programmatic
```

**В `useScrollPositionAutosave` interval**:
```javascript
if (isRestoringRef?.current) return
```

Это Решение A которое я предложил в начале (v0.91.15 анализ) и **отказался** в пользу anchor msgId. Anchor msgId сам по себе **не лечит** цикл — нужно блокировать save во время programmatic scroll.

### Шаг 4 — отдельная проблема: react-window не remeasured (Проблема 2)

После фикса Проблемы 1 нужно проверить — позиция точная или ±N px из-за устаревших высот на момент restore. Возможные решения:
- Увеличить postcheck timeout с 100мс до 500-800мс
- Использовать `ResizeObserver` на scrollEl чтобы знать когда remeasure произошёл
- Или сохранять не индекс row но **id msg + offset within msg** (Discord-style)

---

## 🚨 Главный урок

**7 коммитов «фиксов» без подтверждения корня логами** — это **антипаттерн**. Правильный путь:
1. Лог-доказательство корня
2. Минимальный фикс именно для этого корня
3. Лог-доказательство что фикс закрыл корень
4. Только тогда следующий шаг

Я не следовал этому. Делал «архитектурные улучшения» (anchor msgId, autosave, postcheck) **до** того как точно понял корень. Результат — растёт сложность кода, проблема не решается.

---

## 📂 Связанные файлы

- [`src/native/hooks/useInitialScroll.js`](../src/native/hooks/useInitialScroll.js) — основной hook initial-scroll и restore
- [`src/native/hooks/useInitialScrollDiag.js`](../src/native/hooks/useInitialScrollDiag.js) — `tryRestoreWithRetry` + `logRestoreDiag`
- [`src/native/hooks/useInboxScroll.js`](../src/native/hooks/useInboxScroll.js) — `handleScroll` (сохранение)
- [`src/native/hooks/useScrollPositionAutosave.js`](../src/native/hooks/useScrollPositionAutosave.js) — interval 1.5с
- [`src/native/utils/scrollPositionsCache.js`](../src/native/utils/scrollPositionsCache.js) — `findVisibleAnchorMsgId`, `loadScrollPositions`, `saveScrollPositions`
- [`src/native/modes/InboxMode.jsx`](../src/native/modes/InboxMode.jsx) — компонент-склейка
- [`.memory-bank/mistakes/native-scroll-unread.md`](mistakes/native-scroll-unread.md) — детали ловушек по версиям

---

## 🔄 Откат всей серии v0.91.12-18

Если нужно вернуть стабильное состояние **до** серии:
```bash
git revert 11f0eba e8c8035 7bcda1c (v0.91.16 hash) 9070230 b3a89a8 b2d7b4c 698652d
git push
```

Это вернёт к v0.91.11 (диагностика без правки логики). Юзер увидит **то же** что и сейчас (позиция «прыгает»), но без артефактов anchor msgId / postcheck / autosave.

Альтернатива: **ничего не откатывать** — текущая v0.91.18 не хуже v0.91.11, но и не лучше для юзера. Серия закладывает фундамент для будущего фикса корня (anchor msgId формат + autosave infrastructure).
