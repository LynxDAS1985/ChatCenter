# Сага восстановления позиции в native-режиме Telegram

**Создано**: 26 мая 2026 (v0.91.18, после 7 коммитов).
**Обновлено**: 26 мая 2026 (v0.91.19, диагностика добавлена + корень ПОДТВЕРЖДЁН).
**Статус**: 🟡 **Корень подтверждён, фикс не сделан**. Юзер видит «прыгает» — каждый возврат смещает anchor на 1 msg вниз.
**Назначение**: честная фиксация всех попыток + признание ошибок + детальная диагностика.

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
