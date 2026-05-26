# Аудит scroll-архитектуры 26 мая 2026 — мои ошибки и план финального cleanup

**Создано**: 26 мая 2026, после v0.92.6.
**Назначение**: честная фиксация архитектурных ошибок в саге scroll-restore + полный список ломаных связей + план финального cleanup.
**Триггер**: юзер сообщил что «ходим по кругу и проблема» — позиция всё ещё прыгает после 13+ версий.

---

## 🔴 Часть 1: ЦИКЛ — я добавлял и удалял один и тот же код

| Шаг | Версия | Что сделал | Результат | Откат |
|---|---|---|---|---|
| 1 | v0.91.22 | Добавил `isRestoringRef` (closed-loop guard) | ✅ Работало для react-window | — |
| 2 | v0.92.0 Day 3 | **УДАЛИЛ** `isRestoringRef` («Virtuoso не вызывает scroll event») | 🔴 Closed-loop вернулся | — |
| 3 | v0.92.4 | **ВЕРНУЛ** `isRestoringRef` | ✅ closed-loop опять закрыт | — |
| | | | | |
| 4 | v0.92.0 Day 2 | Использовал `components.Scroller` с onScroll в JSX | 🔴 onScroll не доходил до handleScroll | — |
| 5 | v0.92.1 | Заменил на `scrollerRef` callback + `<Virtuoso onScroll>` напрямую | ✅ handleScroll работает | — |
| | | | | |
| 6 | v0.92.2 | Добавил `getState`/`restoreStateFrom` snapshot mechanism | 🔴 useEffect cleanup срабатывает ПОСЛЕ unmount → snapshot=0 | — |
| 7 | v0.92.3 | Добавил `align: 'end'` для initialTopMostItemIndex | ✅ Работало, но... | — |
| 8 | v0.92.5 | Добавил приоритет snapshot + synchronous flush | 🔴 flush НЕ работает синхронно | — |
| 9 | v0.92.6 | **УДАЛИЛ** snapshot mechanism полностью | ✅ Вернулись к v0.92.3 поведению | — |

**Цикл №1**: добавил `isRestoringRef` → удалил → вернул.
**Цикл №2**: добавил snapshot mechanism (v0.92.2-v0.92.5) → удалил всё (v0.92.6).

**3 ошибочных версии**:
- v0.92.0 Day 3 (удалил рабочий isRestoringRef)
- v0.92.2-v0.92.5 (добавил snapshot который не работает с `key={cacheKey}`)

---

## 🔴 Часть 2: Архитектурные ошибки (детально)

### Ошибка №1 — v0.92.0 Day 3: «Virtuoso не вызывает scroll event»

**Что думал**: Virtuoso `initialTopMostItemIndex` управляет позицией без DOM scroll event.

**Реальность**: [MDN scroll event spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll_event): «The scroll event fires when the document view has been scrolled. **This includes programmatic scrolling**.»

Virtuoso использует `el.scrollTo()` / `el.scrollTop=` для применения позиции — браузер всегда триггерит scroll event.

**Доказательство**: лог 17:34:56-17:35:31 (v0.92.3) показал дрейф anchor 1-1024 msgs.

**Как избежать**: не удалять рабочий код без подтверждения логом.

### Ошибка №2 — v0.92.2: snapshot mechanism для key={cacheKey} ремаунта

**Что думал**: `getState`/`restoreStateFrom` — official Virtuoso API для precise restore.

**Реальность**: useEffect cleanup срабатывает **ПОСЛЕ** React unmount → `virtualListRef.current` → null или новый instance → `getState` возвращает `scrollTop=0`.

Production эталоны (Stream Chat, Mattermost) используют этот API **БЕЗ `key={...}`** — переиспользуют один Virtuoso instance, меняя `data`.

**Доказательство**: лог 18:05:09+ показал `state-snapshot-flush scrollTop=0 hasEl=false` — все snapshots сломаны.

**Как избежать**: проверять production эталоны ДО добавления API. Я этого не сделал.

### Ошибка №3 — v0.92.0 Day 2: components.Scroller для onScroll

**Что думал**: кастомный `components.Scroller` с onScroll в JSX перехватит scroll события.

**Реальность**: [Virtuoso docs](https://virtuoso.dev/react-virtuoso/virtuoso/custom-scroll-container/): «The onScroll event handler is **not directly passed to the Scroller component**. Instead, it's attached to the Virtuoso component itself.»

**Доказательство**: лог v0.92.0 показал 0 scroll-save после запуска.

**Как избежать**: читать troubleshooting документации до писания кастомных компонентов.

### Ошибка №4 — v0.92.0: оставил load-older/load-newer в useInboxScroll

Старый react-window паттерн `if scrollTop<100 → loadOlderMessages` остался в handleScroll, ПЛЮС я добавил `handleStartReached` в Virtuoso. Получились **двойные триггеры**.

Аналогично load-newer (useInboxNewerPrefetch.maybeTrigger vs handleEndReached).

**Удалил в v0.92.5**.

**Как избежать**: при добавлении новой системы — отключать старую сразу.

### Ошибка №5 — v0.91.16 magic timeouts × 5

`postcheck setTimeout × [50, 100, 300, 500, 1000]` — magic numbers без объяснения. Работало случайно, потом сломалось.

**Удалил в v0.92.0**.

### Ошибка №6 — диагностика по одному коммиту v0.91.19/20/21

Сделал 3 отдельных diag коммита вместо одного. Это нормально по правилам саги, но **затянуло** работу.

---

## 🟡 Часть 3: ТЕКУЩИЕ ломаные связи в коде v0.92.6 (НЕ исправлено)

### A. `useInitialScroll` вызывает no-op callbacks

[`InboxMode.jsx:290-294`](src/native/modes/InboxMode.jsx):
```js
onMissingTarget: () => {},
onRestoreAnchor: () => {},
onScrollToIndex: () => {},
```

Эти callbacks вызываются из `useInitialScroll` и `tryRestoreWithRetry`, но **ничего не делают**. Пустые функции = бесполезная работа.

### B. `useInitialScroll` пишет лживые логи

`tryRestoreWithRetry` пишет `restore-start savedAnchor=X` и `initial-restore-applied mode=anchor` — но `onRestoreAnchor: () => {}` no-op, никакого restore нет.

**Лог говорит «restore произошёл», но в реальности — нет.** Это вводит в заблуждение при анализе логов (я несколько раз обманывался).

### C. `useInitialScroll` setTimeout(150ms) делает ПРЯМОЙ DOM scroll

[`useInitialScroll.js:126-143`](src/native/hooks/useInitialScroll.js):
```js
if (firstUnread) {
  const el = scrollEl.querySelector(`[data-msg-id="${firstUnread}"]`)
  if (el) {
    el.scrollIntoView({block:'start', behavior:'auto'})  // ← DOM scroll
  } else if (onMissingTarget) {
    onMissingTarget(firstUnread)  // ← no-op в Virtuoso
  } else {
    scrollEl.scrollTop = scrollEl.scrollHeight  // ← DOM scroll
  }
} else {
  scrollEl.scrollTop = scrollEl.scrollHeight  // ← DOM scroll
}
```

Это **ДВА** механизма для первого открытия:
1. Virtuoso `initialTopMostItemIndex` (~50мс при mount)
2. `useInitialScroll` setTimeout(150мс) → DOM scroll

**Через 150мс после mount наш setTimeout перекрывает позицию Virtuoso**. Это может быть скрытой причиной прыжков при первом открытии чата.

### D. `useInitialScrollDiag` bottom-mode рудимент

[`useInitialScrollDiag.js:95-115`](src/native/hooks/useInitialScrollDiag.js):
```js
if (saved.atBottom) {
  const lastIdx = onGetLastIndex?.()
  if (...) {
    onScrollToIndex(lastIdx, 'end')  // ← no-op в Virtuoso
  } else {
    scrollEl.scrollTop = scrollEl.scrollHeight  // ← DOM scroll!
  }
}
```

При `saved.atBottom=true` `onScrollToIndex` no-op → fallback `scrollEl.scrollTop = scrollEl.scrollHeight`. **Перекрывает Virtuoso `initialTopMostItemIndex={renderItems.length-1}`.**

### E. `useInboxScroll` принимает 4 unused параметра

После v0.92.5 cleanup:
- `activeUnread` — НЕ используется
- `loadingNewerRef` — НЕ используется (load-newer убран)
- `setLoadingNewer` — НЕ используется (load-newer убран)
- `initialScrollDoneRef` — НЕ используется (load-older guard убран)

Параметры передаются из InboxMode, но не используются → захламляют API.

### F. `scrollPosByChatRef` читается ДВАЖДЫ

В InboxMode:
1. `initialTopMostItemIndex computation` (line 451): `scrollPosByChatRef.current.get(activeViewKey)`
2. `useInitialScroll.getSavedScrollTop` (line 289): `(chatId) => scrollPosByChatRef.current.get(chatId)`

Оба читают то же самое. (1) использует Virtuoso, (2) — no-op callbacks. Бесполезный пробег через useInitialScroll.

### G. Параметр `onGetLastIndex` НЕ no-op, но не используется

[InboxMode.jsx:294]:
```js
onGetLastIndex: () => renderItems.length - 1,
```

Этот callback **не no-op** (возвращает реальное число). Используется только в `useInitialScrollDiag` bottom mode line 98-99. **Но onScrollToIndex no-op → результат idx идёт в `scrollEl.scrollTop = scrollEl.scrollHeight` fallback** → бесполезный расчёт.

### H. `findVisibleAnchorMsgId` save дублируется в 2 местах

- `useInboxScroll.handleScroll` (DOM scroll events)
- `useScrollPositionAutosave` (interval 1.5с)

Оба читают anchor, сохраняют в один Map. Не критично — последнее значение побеждает. Можно объединить.

---

## 📊 Часть 4: Метрики

| Метрика | Значение |
|---|---|
| Всего версий саги v0.91.12-v0.92.6 | **23 версии** |
| Из них реально решающих проблему | ~10 (closed-loop, Virtuoso migration etc) |
| Откатные коммиты (revert моих ошибок) | 4 (v0.92.1, v0.92.4, v0.92.6, частично v0.92.5) |
| Признанные мной архитектурные ошибки | **6 крупных** + 4 средних |
| Текущих ломаных связей в коде | **8** (A-H выше) |
| Unused params/no-op callbacks | ~10 |

---

## 🛠️ Часть 5: План финального cleanup v0.93.0

**Цель**: устранить все 8 текущих ломаных связей **БЕЗ изменения архитектуры**. Это чистка кода, не новая логика.

### Этап 1 (1 коммит) — упростить useInitialScroll для Virtuoso

Сейчас `useInitialScroll` делает:
1. Track seen chats (doneSetRef)
2. setChatReady через onDone()
3. DOM scroll для firstUnread / bottom (через setTimeout 150мс)
4. tryRestoreWithRetry для already-seen ветки

В Virtuoso режиме нужны только #1 + #2. Шаги #3 и #4 — **перекрывают Virtuoso initialTopMostItemIndex**.

**Что сделать**:
- Удалить весь блок setTimeout(150мс) с DOM scroll (lines 96-150)
- Удалить tryRestoreWithRetry / useInitialScrollDiag.js целиком
- Оставить только doneSetRef + onDone() callback

Результат: `useInitialScroll` 156 → ~60 строк. `useInitialScrollDiag.js` (143 строки) удалить целиком.

### Этап 2 (1 коммит) — очистить useInboxScroll dangling params

Убрать из параметров useInboxScroll:
- `activeUnread`
- `loadingNewerRef`
- `setLoadingNewer`
- `initialScrollDoneRef`

Также убрать соответствующие props из InboxMode → useInboxScroll вызова.

### Этап 3 (1 коммит) — удалить no-op callbacks из InboxMode

```js
// БЫЛО:
onMissingTarget: () => {},
onRestoreAnchor: () => {},
onScrollToIndex: () => {},
onGetLastIndex: () => renderItems.length - 1,

// СТАНЕТ: вообще не передавать (useInitialScroll упрощён в Этапе 1)
```

### Этап 4 (1 коммит) — Lying логов починить

Удалить из useInitialScrollDiag логи `restore-start` / `initial-restore-applied` (если файл не удалён в Этапе 1).

Если удалён — изменения тут не нужны.

### Этап 5 (опционально) — объединить save anchor в одном месте

Сейчас save anchor в `useInboxScroll.handleScroll` И `useScrollPositionAutosave`. Можно:
- Оставить ТОЛЬКО `useScrollPositionAutosave` (interval 1.5с) — достаточно для Virtuoso режима, не нужно сохранять на каждый scroll event
- ИЛИ оставить только handleScroll — нет throttle, сохраняет на каждый scroll

**Рекомендую**: оставить **handleScroll** (быстрее реагирует) + удалить autosave (1.5с задержка может пропустить юзера который быстро переключился).

ИЛИ наоборот: оставить **autosave** + удалить save в handleScroll. Тогда меньше нагрузки, реагирует через 1.5с — достаточно для restore.

Выбор — отдельная задача.

---

## 📋 Часть 6: Чек-лист после финального cleanup

После v0.93.0 должно быть:

- [ ] **0 no-op callbacks** передаётся из InboxMode
- [ ] **0 unused params** в useInboxScroll
- [ ] **0 ложных лог-событий** (restore-start / initial-restore-applied только когда что-то реально происходит)
- [ ] **1 механизм** для каждого действия:
  - load-older: только handleStartReached в InboxMode
  - load-newer: только handleEndReached в InboxMode
  - first-open scroll: только Virtuoso initialTopMostItemIndex
  - save position: только handleScroll ИЛИ только autosave (выбрать)
- [ ] Все мои архитектурные ошибки задокументированы в `mistakes/native-scroll-unread.md`

---

## 🎯 Часть 7: Чему я научился

| Урок | Что было не так |
|---|---|
| 1. Не удалять рабочий код без подтверждения логом | v0.92.0 Day 3 удалил isRestoringRef → пришлось вернуть |
| 2. Сверять с production эталоном ДО добавления API | v0.92.2 snapshot mechanism не работает с key={...} |
| 3. Читать troubleshooting документации | v0.92.0 onScroll через components.Scroller не работает |
| 4. При замене старой системы — сразу отключать старую | load-older/load-newer дубли v0.92.0-v0.92.5 |
| 5. Не доверять логам которые пишут о действиях которые не происходят | restore-start пишется при no-op callbacks |
| 6. useEffect cleanup timing — после unmount, не до | synchronous flush v0.92.5 не работает с key={...} ремаунтом |

---

## 🚦 Часть 8: Текущий статус

**Что работает** (v0.92.6):
- ✅ closed-loop guard через isRestoringRef
- ✅ handleScroll save через scrollerRef
- ✅ initialTopMostItemIndex с align='end'
- ✅ firstItemIndex prepend
- ✅ atTopThreshold/atBottomThreshold
- ✅ Virtuoso startReached/endReached (без дублей)
- ✅ ResizeObserver filter

**Что НЕ работает / частично**:
- 🟡 firstOpen position может перекрываться useInitialScroll setTimeout(150мс) → необходим Этап 1 cleanup
- 🟡 atBottom restore делает прямой `scrollEl.scrollTop = scrollEl.scrollHeight` → необходим Этап 1 cleanup
- 🟡 Лог говорит о restore которого нет → необходим Этап 4 cleanup

**Что нужно делать**:
Финальный cleanup v0.93.0 в 4 этапа (план выше). После него — система чистая, без дублей.

---

## 📝 Часть 9: Хронология всех 23 версий саги

| # | Версия | Что | Статус |
|---|---|---|---|
| 1 | v0.91.6 | retry-loop scrollEl | OK |
| 2 | v0.91.7 | lastActiveChatIdRef для restore | OK |
| 3 | v0.91.11 | diag 4 точки лога | OK (diag) |
| 4 | v0.91.13 | threshold guard unread | OK |
| 5 | v0.91.14 | retry-loop для already-seen | OK |
| 6 | v0.91.15 | anchor msgId вместо scrollTop | OK |
| 7 | v0.91.16 | bottom mode + setTimeout × 5 | ❌ magic numbers |
| 8 | v0.91.17 | autosave 1.5с | OK |
| 9 | v0.91.18 | scrollRef ReferenceError fix | OK (regression fix) |
| 10 | v0.91.19 | restore-start diag | OK (diag) |
| 11 | v0.91.20 | stack capture | OK (diag) |
| 12 | v0.91.21 | ipc-burst tracker | OK (diag) |
| 13 | v0.91.22 | isRestoringRef + rAF batching | ✅ Главный фикс closed-loop |
| 14 | v0.91.23 | onRowsRendered diag | OK (diag) |
| 15 | v0.91.24 | re-scroll + load-older guard | OK (но retry не работает) |
| 16 | v0.92.0 (Day 1-4) | Virtuoso migration | ✅ + ❌ Day 3 удалил isRestoringRef |
| 17 | v0.92.1 | scrollerRef + ResizeObserver filter | ✅ Фикс onScroll |
| 18 | v0.92.2 | snapshot mechanism | ❌ Архитектурно сломан с key= |
| 19 | v0.92.3 | align='end' | ✅ (бесполезен пока snapshot есть) |
| 20 | v0.92.4 | вернули isRestoringRef | ✅ regression fix |
| 21 | v0.92.5 | устранение 3 пар двойных функций + synchronous flush | ✅ duplicates + ❌ flush не работает |
| 22 | v0.92.6 | УДАЛЕНИЕ snapshot mechanism | ✅ финальный rollback v0.92.2 |
| 23 | **v0.93.0 (план)** | Финальный cleanup A-H ломаных связей | 📋 — не сделано |

---

**Подписано**: AI-разработчик. 26 мая 2026.
**Версия после которой создан документ**: v0.92.6 (commit 68be330).
