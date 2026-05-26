# Миграция react-window → react-virtuoso

**Создано**: 26 мая 2026 (v0.91.24, после саги scroll-restore из 13 версий).
**Версия миграции**: v0.92.0 (запланирована).
**Статус**: 🟡 **Day 1 в работе — изолированная подготовка**.
**Связанные документы**: [`native-scroll-restore-saga.md`](./native-scroll-restore-saga.md), [`mistakes/native-scroll-unread.md`](./mistakes/native-scroll-unread.md).

---

## 📋 Зачем эта миграция

### Корень: react-window 2.2.7 + `useDynamicRowHeight` имеет архитектурное ограничение

После 13 версий фиксов (v0.91.12-v0.91.24) **scroll restore по-прежнему не работает надёжно** при возврате в чат:
- Юзер прокручивает в середину чата → переходит на другой → возвращается → программа кидает не на ту позицию
- Анкор смещается из-за гонки с `load-older` (фикс v0.91.24)
- При далёком `targetIdx` `scrollToRow` не доходит до цели — react-window рендерит только видимое окно, ResizeObserver не успевает измерить дальние row

**Прямое доказательство в логе `chatcenter.log` 14:00:55**:
```
attempt=3 targetIdx=19 startIndex=5 stopIndex=7 inViewport=FALSE scrollTop=430 scrollHeight=50395
attempt=4 targetIdx=19 startIndex=5 stopIndex=7 inViewport=FALSE scrollTop=430 scrollHeight=50236
attempt=5 targetIdx=19 startIndex=3 stopIndex=5 inViewport=FALSE scrollTop=430 scrollHeight=50236
attempt=6 targetIdx=19 startIndex=1 stopIndex=3 inViewport=FALSE scrollTop=430 scrollHeight=56097
```

Re-scroll в `onRowsRendered` (фикс v0.91.24) НЕ помог — `scrollTop` остаётся 430, viewport показывает row 1-7 вместо target 19. **scrollToRow рассчитывает позицию по `defaultRowHeight=50` для невидимого target, что неверно для dynamic heights.**

### Подтверждение от мейнтейнера react-window

🥇 [react-window issue #216](https://github.com/bvaughn/react-window/issues/216) (открыт с 2019) — нет официального решения для scroll memory с dynamic heights.

🥇 [react-window issue #6](https://github.com/bvaughn/react-window/issues/6) — «Support just-in-time measured content» открыт, не закрыт.

🥇 [README предупреждение](https://github.com/bvaughn/react-window/blob/master/README.md): «⚠️ Dynamic row heights are not as efficient as predetermined sizes. It's recommended to provide your own height values if they can be determined ahead of time.»

### Почему именно `react-virtuoso`

`Virtuoso` (MIT, free) **специально спроектирован** для чатов:

- **`initialTopMostItemIndex`** — restore позиции на mount (нет нашего retry-loop)
- **`firstItemIndex`** — официальный паттерн prepend без скачков scrollTop (load-older)
- **`startReached`/`endReached`** — встроенный bidirectional infinite scroll
- **`scrollToIndex`** — работает с unmeasured items через measurement queue
- **`scrollerRef`** — даёт root DOM element (наш `msgsScrollRef` sync)
- **`rangeChanged`** — аналог `onRowsRendered` (наша диагностика)
- **MIT лицензия**, активная разработка (4.18.7, publish 9 дней назад)
- **Production usage**: Stream Chat React, Element/Matrix, Mattermost, Rocket.Chat

### Что мы НЕ делаем

- ❌ Не используем `@virtuoso.dev/message-list` — он коммерческий ($99/мес)
- ❌ Не переходим на TanStack Virtual — нет официального решения bidirectional scroll restore ([discussion #195](https://github.com/TanStack/virtual/discussions/195))
- ❌ Не возвращаемся к обычному `renderItems.map(...)` — при 500+ msgs тормозит
- ❌ Не включаем `overflow-anchor: auto` — конфликтует с react-window/Virtuoso measure

---

## 🔧 Стек-совместимость (проверено)

| # | Что | Результат |
|---|---|---|
| 1 | React 19.2.4 | ✅ react-virtuoso 4.18.5+ официально поддерживает (issue с детектом React 19 исправлен) |
| 2 | Electron 41 | ✅ Чистый React компонент, нет нативных зависимостей |
| 3 | vite 7 | ✅ Чистый ESM пакет |
| 4 | vitest + happy-dom | ✅ Наш `VirtualMessageList.vitest.jsx` уже стабит ResizeObserver/IntersectionObserver |
| 5 | MIT лицензия | ✅ Бесплатно |
| 6 | Размер | ⚠️ +32KB gzipped (vs react-window 6KB). В Electron — несущественно |
| 7 | Активность | ✅ 4.18.7 publish 9 дней назад, 5k+ stars |

---

## ⚠️ 5 известных проблем virtuoso и наша готовность

| # | Проблема | Митигация в нашем коде | Статус |
|---|---|---|---|
| 1 | `margin` на items ломает scrollHeight (ResizeObserver не мерит margin) | У нас уже **padding** в `VirtualMessageList.jsx:67-72`, margin был заменён в v0.89.0 | ✅ Готово |
| 2 | Reverse scrolling flickering при dynamic heights | Prop `skipAnimationFrameInResizeObserver={true}` — one-liner fix | 🟢 1 строка |
| 3 | `followOutput` не работает при fast updates | Мы НЕ используем followOutput — у нас явный `scrollToAbsoluteBottom` | ✅ N/A |
| 4 | Bouncing при image loading | Уже есть у нас сейчас (regression neutral) — `MessageBubble` использует `data-image-aspect-ratio` | 🟡 не регрессия |
| 5 | Components inline в render → ремаунт | `MessageRow` определён вне VirtualMessageList — паттерн правильный | ✅ Готово |

**Ни одна проблема НЕ блокер.**

---

## 📅 План работ по дням

### Day 1 — Изолированная подготовка (нулевой риск для прода)

**Что делается**:
1. `npm install react-virtuoso@^4.18.7`
2. Создать `src/native/components/VirtualMessageListV2.jsx` рядом со старым (НЕ удаляем старый)
3. Использовать тот же `MessageRow` (DOM-агностик)
4. Создать `src/native/components/VirtualMessageListV2.vitest.jsx` — smoke-тесты с стабом ResizeObserver/IntersectionObserver

**Что НЕ делается**:
- НЕ удаляется старый `VirtualMessageList.jsx`
- НЕ подключается V2 в `InboxChatPanel.jsx`
- НЕ затрагивается `useInboxScroll`, `useInitialScroll`, `InboxMode.jsx`
- НЕ удаляется react-window

**Проверки**:
- lint
- vitest (включая новые тесты)
- fileSizeLimits
- check-memory

**Откат Day 1**: `git revert <day1>` — удалит только новый файл, старый код в проде нетронут.

**Чекпойнт**: коммит и push в `feature/virtualization`.

---

### Day 2 — Feature flag + интеграция через wrapper

**Что делается**:
1. В `InboxChatPanel.jsx` добавить runtime-выбор: при `props.useVirtuoso === true` рендерится `VirtualMessageListV2`, иначе старый. По умолчанию **false** — прод не затронут.
2. Через настройку в `chatcenter.json` или env-переменную `CC_USE_VIRTUOSO=true` для dev-тестов
3. В `InboxMode.jsx` передавать флаг через props
4. Реализовать ref API: `scrollerRef`, `scrollToIndex` имитируют `listRef.element` / `scrollToRow`
5. Перевести load-older/load-newer на `startReached`/`endReached`
6. Перевести restore на `initialTopMostItemIndex`
7. Написать интеграционные тесты:
   - `useInboxScrollVirtuoso.vitest.jsx` — startReached/endReached
   - `useInitialScrollVirtuoso.vitest.jsx` — initialTopMostItemIndex + firstItemIndex prepend
   - `VirtualMessageListV2.integration.vitest.jsx` — scrollToIndex + IntersectionObserver

**Что НЕ делается**:
- Feature flag default = **false** → прод на старом react-window
- Не удаляется ни одна функция/файл

**Проверки**:
- lint, vitest, fileSizeLimits
- Manual smoke: включить флаг в dev, прокликать 5 чатов, прислать лог
- Pre-push hook

**Откат Day 2**: revert ← возвращается ровно к Day 1 (изолированный V2), прод нетронут.

**Чекпойнт**: коммит + push, юзер проверяет вручную с включенным флагом.

---

### Day 3 — Очистка диагностики + переключение

**Условие**: только после подтверждения юзером что Day 2 работает корректно.

**Что делается**:
1. Включить флаг `useVirtuoso = true` по умолчанию
2. Удалить v0.91.19-v0.91.24 диагностику (TODO-7/8/9/10 из `code-todo.md`):
   - `useInitialScrollDiag.js` (143 строки) — больше не нужен
   - `restoreTargetMsgIdRef`, `restoreTargetAlignRef`, `restoreStartTimeRef`, `restoreAttemptsRef` из InboxMode
   - `handleRowsRendered`, `handleUserIntent` из InboxMode
   - `isRestoringRef` логика в `useInboxScroll`, `useScrollPositionAutosave`
   - `anchor-postcheck-tick`, `load-older-skip-restoring`, `scroll-save isRestoring`, `autosave-save isRestoring` логи
   - `restore-start` лог (или оставить как минимальная диагностика)
3. Bump 0.91.24 → 0.92.0 (MINOR, новая фича)
4. Удалить старый `VirtualMessageList.jsx` через **ещё один** коммит после прохода всех тестов
5. Удалить `react-window` из package.json через **ещё один** коммит

**Что НЕ делается**:
- НЕ удаляется `useScrollPositionAutosave` — работает с любым virtualization
- НЕ затрагивается TDLib backend, IPC, store, MessageBubble, AlbumBubble

**Проверки**:
- lint, full vitest, fileSizeLimits, check-memory
- Pre-push hook
- Manual smoke полный сценарий: 100+ msg chat → scroll up → switch chats × 10 → return → позиция стабильна

**Откат Day 3**: revert флага коммита → возврат к Day 2 (Virtuoso инкорпорирован, но default false).

**Чекпойнт**: коммит + push, юзер проверяет финальную версию.

---

### Day 4 (опционально, через 1-2 дня после Day 3)

После 1-2 дней стабильной работы:
1. Удалить старый `VirtualMessageList.jsx`
2. Удалить `react-window` из `package.json`
3. Удалить feature flag из `InboxChatPanel.jsx`
4. `npm install` для cleanup `package-lock.json`

**Откат**: `git revert <day4>` — вернёт оба пакета и старый компонент.

---

## 🛡️ Гарантии безопасности

| Этап | Прод работает на | Откат-стоимость |
|---|---|---|
| До Day 1 | react-window (текущий v0.91.24) | N/A |
| Day 1 (изолированный V2) | react-window | 1 revert |
| Day 2 (feature flag false) | react-window | 1 revert |
| Day 3 (feature flag true) | react-virtuoso | 1 revert → флаг false → react-window |
| Day 4 (удалён react-window) | react-virtuoso | 1 revert |

**Ключевой принцип**: до Day 3 включительно прод работает на старом react-window. Любая регрессия в новом коде НЕ затрагивает пользователей.

---

## 📊 Чистый эффект миграции

| Файл | Текущее состояние | После миграции |
|---|---|---|
| `VirtualMessageList.jsx` | 235 строк (react-window) | удалён |
| `VirtualMessageListV2.jsx` | — | 200 строк (Virtuoso) |
| `useInboxScroll.js` | 156 строк (handleScroll + load-older) | ~110 строк (load-older уходит в startReached) |
| `useInitialScroll.js` | 158 строк (retry-loop) | ~80 строк (initialTopMostItemIndex) |
| `useInitialScrollDiag.js` | 143 строки | удалён |
| `InboxMode.jsx` | 757 строк | ~680 строк (без handleRowsRendered + 4 refs) |
| `useScrollPositionAutosave.js` | 51 строк | без изменений |
| `package.json` | react-window | react-virtuoso |

**Итого**: -350 строк кода, -1 диагностический модуль, упрощение architecture.

---

## 🧪 Тесты которые гарантированно написаны

| # | Тест | Покрывает |
|---|---|---|
| 1 | Render 4 типов row | Smoke (day/time/unread/group) |
| 2 | scrollToIndex работает | Imperative API |
| 3 | scrollerRef даёт DOM | sync с msgsScrollRef |
| 4 | startReached → load-older | infinite scroll up |
| 5 | endReached → load-newer | infinite scroll down |
| 6 | initialTopMostItemIndex restore | Restore позиции |
| 7 | firstItemIndex prepend | Без скачка scrollTop |
| 8 | rangeChanged callback | Видимый диапазон |
| 9 | IntersectionObserver на DOM rows | readByVisibility работает |
| 10 | data-msg-id attribute | DOM queries для replyTo |

Минимум **10 тестов** + manual smoke.

---

## 🚫 Закрытые альтернативы (с обоснованием)

| Подход | Почему не подходит |
|---|---|
| **`@virtuoso.dev/message-list` (платный)** | $99/мес. Бесплатный `Virtuoso` нам достаточен |
| **TanStack Virtual** | Сами авторы пишут «massive engineering effort», нет рецепта bidirectional + restore (discussion #195) |
| **Убрать виртуализацию (как tweb)** | Tweb рендерит ВСЁ в DOM. При 500+ msgs тормозит. Возможный вариант B если миграция Virtuoso провалится |
| **DOMRect-diff анкор (tweb scrollSaver)** | tweb не использует виртуализацию — DOM-элементы стабильны. У нас react-window/Virtuoso рендерит только видимое окно |
| **Chromium `overflow-anchor: auto`** | Отключён в `VirtualMessageList.jsx:221` с v0.89.0 — конфликт с virtualization measure |
| **`initialScrollOffset` prop react-window** | [Issue #216](https://github.com/bvaughn/react-window/issues/216) автор называет «hacky», не работает с dynamic heights |
| **Magic `setTimeout × 5`** | Magic numbers, костыль. v0.91.16 для bottom mode работал — но для anchor mode не доказан |

---

## 📚 Источники

### Уровень 1 — официальные

- [Virtuoso API Reference](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/) — все методы и props
- [Virtuoso Troubleshooting](https://virtuoso.dev/react-virtuoso/troubleshooting/) — margin, ResizeObserver, тестирование
- [react-virtuoso v4.18.7](https://github.com/petyosi/react-virtuoso/releases) — last release
- [react-window issue #216](https://github.com/bvaughn/react-window/issues/216) — открыт с 2019 без решения
- [react-window issue #6](https://github.com/bvaughn/react-window/issues/6) — just-in-time measured content (открыт)
- [react-window README](https://github.com/bvaughn/react-window/blob/master/README.md) — предупреждение про dynamic heights

### Уровень 2 — production usage

- [Stream Chat React](https://github.com/GetStream/stream-chat-react) — Virtuoso для тысяч приложений
- [Element/Matrix](https://github.com/element-hq/element-web) — Virtuoso для chat history
- [Mattermost](https://github.com/mattermost/mattermost-webapp) — Virtuoso

### Уровень 3 — наши находки

- [Лог `chatcenter.log` 14:00:55](file:///C:/Users/Директор/AppData/Roaming/ЦентрЧатов/chatcenter.log) — доказательство ограничения react-window
- [`group-topic-investigation.md:1853,1957`](./group-topic-investigation.md) — старое решение отложить virtuoso (до v0.89.0)
- [`native-scroll-restore-saga.md`](./native-scroll-restore-saga.md) — полная история 13 версий фиксов

---

## ✅ Чекпойнты выполнения

- [ ] Day 1: react-virtuoso установлен, V2 компонент создан + тесты, изолирован
- [ ] Day 2: feature flag активен в dev, юзер протестировал
- [ ] Day 3: флаг default true, диагностика удалена, v0.92.0 выпущена
- [ ] Day 4: react-window удалён, старый компонент удалён

---

## 🔄 Финальное правило

**До Day 3 включительно — прод работает на старом react-window.** Никакой регрессии в production. Любой Day можно откатить одной командой `git revert`.

**После Day 3 финального коммита и подтверждения юзером** — статус саги меняется с 🟡 на 🟢 ЗАКРЫТО.
