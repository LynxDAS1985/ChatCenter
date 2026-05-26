# Сага восстановления позиции в native-режиме Telegram

**Создано**: 26 мая 2026 (v0.91.18, после 7 коммитов).
**Статус**: 🔴 **НЕ РЕШЕНО**. Юзер всё равно видит «прыгает» позиция при возврате в чат.
**Назначение**: честная фиксация всех попыток + признание ошибок.

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

## 🎯 Текущая гипотеза (НЕ подтверждена логом)

**Замкнутый круг handleScroll**:
1. Сохранили: юзер на сообщении X
2. Уход и возврат → программа делает `scrollToVirtualRow(X, 'end')` (programmatic scroll)
3. **🥇 [MDN scroll event](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll_event)**: «The scroll event fires when the document view or an element has been scrolled. **Programmatic changes to scroll position also trigger this event**»
4. → `handleScroll` срабатывает → `findVisibleAnchorMsgId(el)` возвращает Y (последний видимый снизу после programmatic scroll)
5. → handleScroll сохраняет Y вместо X
6. → Следующий возврат restore'ит Y → новый Y′ → бесконечная деградация

### Доказательства гипотезы (косвенные)
- Лог 10:05:56 + 10:06:06 — два возврата в чат «Диагносты СНГ»: anchor1=`235432574976`, anchor2=`235435720704` (разные). **Что-то** перезаписало anchor между визитами.
- handleScroll сохраняет позицию **при любом scroll** (нет различения user vs programmatic).
- Из 🥇 [Telegram Web K source (tweb)](https://github.com/morethanwords/tweb): у них флаг `_isJumping` блокирует saveScrollPosition во время programmatic scroll.

### ❌ Чего НЕ хватает для уверенности
- **В `handleScroll` нет логов** — не видно когда он сохраняет и какой anchor.
- **В `useScrollPositionAutosave` нет логов** — не видно когда interval сохраняет.
- **Нет последовательности «restore X → save Y» в одном логе** — только конечный anchor.

---

## ❌ Признанные ошибки в стратегии

1. **v0.91.15 anchor msgId** — не решил замкнутый круг. Просто заменил формат с `number` на `{anchorMsgId, atBottom}` — но **handleScroll по-прежнему сохраняет при любом scroll**. Теперь портится anchor вместо scrollTop.

2. **v0.91.16 postcheck setTimeout** — добавил **ещё один** programmatic scroll через 100мс. Если гипотеза замкнутого круга верна — это **усугубило** проблему (двойная перезапись).

3. **v0.91.17 autosave 1.5с** — добавил **ещё один** источник сохранения. Если он срабатывает после programmatic scroll — сохранит искажённую позицию.

4. **v0.91.18 фикс ReferenceError** — закрыл свою ошибку (забытый параметр scrollRef), но **не корневую проблему**.

5. **Главная ошибка в стратегии**: **отказался** от первоначально предложенного Решения A («skip save 500мс после restore» через флаг `isRestoringRef`) в пользу «архитектурно правильного» anchor msgId. Anchor msgId сам по себе **не лечит** цикл.

---

## 🛠️ Что нужно делать дальше (НЕ сделано)

### Шаг 1 — добавить диагностические логи (с разрешения юзера)

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

### Шаг 3 — если гипотеза подтвердится → фикс v0.91.19 через флаг

Флаг `isRestoringRef` устанавливается перед programmatic scroll, снимается через 1000мс. В handleScroll и autosave: `if (isRestoringRef.current) return` — не сохраняем во время programmatic scroll.

Это Решение A которое я предложил в начале и **отказался** в пользу anchor msgId. Сейчас понятно что оно нужно **в любом случае** — anchor mode тоже подвержен циклу.

### Шаг 4 — если гипотеза НЕ подтвердится

Нужно искать другие причины:
- react-window cacheKey reset → renderItems пересчитываются → `findVisibleAnchorMsgId` находит другой msg даже без scroll
- autosave interval срабатывает в неудачный момент (когда react-window mid-render)
- React 19 effect race conditions
- ...

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
