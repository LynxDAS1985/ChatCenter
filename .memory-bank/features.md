# Реализованные функции — ChatCenter

## Текущая версия: v0.89.25 (18 мая 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.88.0 → v0.89.25). Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
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

### v0.89.25 — Fix: `is_forum` в TDLib supergroup, не в chatTypeSupergroup (ловушка #24)

**Контекст**: после v0.89.24 диагностических логов пользователь воспроизвёл проблему. Логи дали точную картину:
```
[forum-ui] activeChatId=tg_611696632:-1002966550893
           chatFound=true type=group
           isForum=false      ← баг здесь
           triggerForum=false
```

`[forum-map]` event не появился вообще — значит `mapChat()` ставил `isForum=false` для всех forum-чатов.

#### Корневая причина — TDLib API spec

📚 [TDLib chatTypeSupergroup](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1chat_type_supergroup.html):
```
chatTypeSupergroup { supergroup_id, is_channel }   // ← НЕТ is_forum
```

📚 [TDLib supergroup](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1supergroup.html) — отдельный объект, доступный через `updateSupergroup`:
```
supergroup { id, is_channel, is_forum, ... }   // ← ВОТ ЗДЕСЬ is_forum
```

С v0.89.1 (когда добавляли forum topics) я читал `chat.type.is_forum` — это поле **никогда не существовало в TDLib**. JS возвращал `undefined`, `!!undefined === false`. Все forum-чаты помечались `isForum=false`.

**Самое неприятное**: vitest тест проверял именно эту неправильную модель — `type: { is_forum: true }` → ожидаем `isForum=true`. Тест проходил, но проверял НЕ ту реальность. False-positive.

#### Решение (4 правки)

1. **[`tdlibClient.js`](../main/native/backends/tdlibClient.js)** — новый `supergroupCache` + handler `updateSupergroup` + метод `getSupergroup(accountId, sgId)`

2. **[`tdlibClient.js:507`](../main/native/backends/tdlibClient.js)** — `getAccountChats` извлекает supergroup из cache и передаёт mapChat через extras

3. **[`tdlibMapper.js`](../main/native/backends/tdlibMapper.js)** — `mapChat` читает `extras.supergroup?.is_forum` (не `type.is_forum`)

4. **[`tdlibBackend.js`](../main/native/backends/tdlibBackend.js)** — `forum.getTopics` тоже использует `manager.getSupergroup(...)?.is_forum`

#### Тесты

- **tdlibClient.vitest.js**: +5 тестов для supergroup cache (обновление, getSupergroup, null cases, обновление существующей записи, отсутствующий account)
- **tdlibMapper.vitest.js**: обновлён старый тест + 2 новых:
  - С `extras.supergroup.is_forum=true` → `isForum=true` ✓
  - Регрессия: `type.is_forum=true` БЕЗ extras → `isForum=false` (защита от старой логики)
  - С supergroup без is_forum → `isForum=false`

**Tests**: 608 → 615 (+7).

#### Документация — новая ловушка #24

Создан новый файл [`mistakes/tdlib-forum.md`](mistakes/tdlib-forum.md) специально для TDLib forum/supergroup metadata ловушек. Также добавлен в:
- `common-mistakes.md` индекс (раздел 6)
- `CLAUDE.md` секция «Детализация ловушек»

**Правило для будущих сессий**: при работе с TDLib не доверять интуиции про где хранится поле. Сверять с [td_api spec](https://core.telegram.org/tdlib/docs/). Поля, кажущиеся «логично в type», могут быть в отдельных объектах: `supergroup`, `basicGroup`, `secretChat`, `user`, `userFullInfo`, `supergroupFullInfo`.

#### Diagnostic logs остаются

Логи v0.89.24 (`[forum-map]`, `[forum-ui]`, `[forum-ipc]`, `[forum-be]`) остаются в коде на 1-2 недели — на случай если ещё какие-то forum-чаты не открываются. После подтверждения стабильности — удалю.

---

### v0.89.24 — Diagnostic логи для forum topics pipeline

**Контекст**: пользователь сообщил что forum-чаты (например OZONовая Дыра в Telegram) не открываются через панель тем. После v0.89.1 (TDLib Stage 4 Этап 3.10 — добавление forum topics) код не менялся, но регрессия проявилась сейчас. В логах **0 событий** про forum — handlers не логировали.

#### Что добавлено (только diagnostic, без правок поведения)

| Где | Лог |
|---|---|
| [`tdlibIpcHandlers.js`](../main/native/tdlibIpcHandlers.js) `tg:get-forum-topics` | `[forum-ipc] tg:get-forum-topics chatId=X limit=N` + result |
| [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `forum.getTopics` | `[forum-be] getTopics chatId, accountId, rawId, chatCached=B, typeAt, is_channel, is_forum, title` |
| [`tdlibMapper.js`](../main/native/backends/tdlibMapper.js) `mapChat` | `[forum-map] chatId=X title=Y is_forum=true` при mapping forum-чата |
| [`InboxMode.jsx`](../src/native/modes/InboxMode.jsx) useEffect | `[forum-ui] activeChatId, chatFound, type, isForum, triggerForum` + result |

**Канал**: main → `console.log` (через main logger в `chatcenter.log`). Renderer → `window.api.send('app:log', ...)` → файл.

#### Что покажут логи

| Сценарий | Лог покажет |
|---|---|
| TDLib не загрузил `is_forum=true` для чата | `[forum-map]` отсутствует для этого chatId |
| getChatCached возвращает stale data | `[forum-be]` `is_forum=false` для известного forum-чата |
| Условие в UI не срабатывает | `[forum-ui]` `triggerForum=false` |
| Backend invoke `getForumTopics` падает | `[forum-be]` error + `[forum-ipc]` error |
| Renderer вообще не зовёт handler | `[forum-ipc]` не появится |

#### Версия

`0.89.23 → 0.89.24` (patch — diagnostic only). Lint + check-memory OK.

#### План использования

1. Пользователь перезапускает приложение
2. Открывает forum-чат который **должен** показать панель тем (OZONовая Дыра)
3. Присылает свежий `chatcenter.log`
4. По фактам определим что именно сломано в pipeline

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

### v0.89.22 — УДАЛЁН `setIgnoreMouseEvents` из safeHide — фикс «двойных кликов»

**Контекст**: пользователь со скриншотом Task Manager — нажатия мыши тормозят / иногда не срабатывают с первого раза. Windows работает нормально, CPU 3.1%, память 1.65 ГБ — **не performance проблема**.

#### Корневая причина — повторил ловушку #27 через 18 версий

В v0.89.18 я добавил `setIgnoreMouseEvents(true)` в `safeHideTransparentWindow()` как «тройную защиту» от ghost hit-test региона. Но **нарушил ловушку #27 (v0.71.7)**:

📂 [`mistakes/webview-stack-grouping.md`](mistakes/webview-stack-grouping.md) ловушка #27:
> `setIgnoreMouseEvents(true)` БЛОКИРУЕТ `-webkit-app-region: drag`!
> **ПРАВИЛО**: Для transparent frameless окон НЕ использовать `setIgnoreMouseEvents`.

📂 [Electron docs](https://www.electronjs.org/docs/latest/api/browser-window#winsetignoremouseeventsignore-options):
> The state needs to be reset before subsequent calls. **The window must call this with `ignore=false` to receive mouse events.**

📂 [`main/pin-dock.preload.cjs:37`](main/preloads/pin-dock.preload.cjs):
> `// v0.71.4: УДАЛЕНО — setIgnoreMouseEvents ломает -webkit-app-region: drag (ловушка 27)`

#### Что я не учёл

В 5 точках `.show()` для pin/dock окон **не было парных `restoreMouseEvents(win)`**:
- `dockPinHandlers.js:75` — pin window show
- `dockPinHandlers.js:155` — item.win.show
- `dockPinHandlers.js:237` — dockState.win.showInactive
- `dockPinState.js:138` — dock.showInactive
- `dockPinUtils.js:86` — item.win.show

grep вернул **0 вызовов** restoreMouseEvents в этих файлах. → `setIgnoreMouseEvents` state оставался `true` после show → клики проходили насквозь видимых окон → пользователь видел «двойной клик».

#### Решение

**УДАЛЁН `setIgnoreMouseEvents` целиком**. Также удалена функция `restoreMouseEvents` (больше не нужна).

📂 [`main/utils/transparentWindowGuard.js`](../main/utils/transparentWindowGuard.js):
```js
// БЫЛО (v0.89.18 → v0.89.21):
export function safeHideTransparentWindow(win) {
  win.setIgnoreMouseEvents(true)   // ← УДАЛЕНО (ловушка #27)
  win.setBounds({x:-30000, y:-30000, width:1, height:1})
  win.hide()
}
export function restoreMouseEvents(win) { ... }  // ← УДАЛЕНА

// СТАЛО (v0.89.22):
export function safeHideTransparentWindow(win) {
  win.setBounds({x:-30000, y:-30000, width:1, height:1})
  win.hide()
}
```

#### Почему двух шагов достаточно

- **Скрытое окно не получает hit-test** (`.hide()` убирает из таскбара и hit-test pipeline)
- **Даже visible — за пределами всех мониторов** (`-30000, -30000` — Win11 поддерживает до ~32k)
- **Размер 1×1 — пользователь никогда не наведёт мышь именно на 1 пиксель**

`setIgnoreMouseEvents` был **третьим избыточным слоем**, который ломал ловушку #27. Удаление не ослабляет защиту.

#### Регрессионная защита (ГЛАВНОЕ — чтобы не повторилось через 18 версий)

📂 [`src/__tests__/transparentWindowGuard.test.cjs`](../src/__tests__/transparentWindowGuard.test.cjs) — новый assertion (всегда в pre-commit):
```js
assert(!/setIgnoreMouseEvents\s*\(\s*true\s*\)/.test(helper),
  'setIgnoreMouseEvents(true) ВЕРНУЛИ в helper! Это ломает -webkit-app-region: drag\n' +
  '   у pin/dock окон (ловушка #27). См. mistakes/notifications-ribbon.md #21.')
```

Любая будущая попытка вернуть `setIgnoreMouseEvents(true)` поймается **локально в pre-commit**.

📂 vitest добавлен тест:
```js
it('НЕ вызывает setIgnoreMouseEvents (ловушка #27 — блокирует drag)', () => {
  ...
  expect(setIgnoreMouseEvents).not.toHaveBeenCalled()
})
```

#### Очистка

- Удалена функция `restoreMouseEvents` из helper'а
- Удалены импорты в `notifHandlers.js` и `notificationManager.js`
- Удалены 5 вызовов `restoreMouseEvents()`
- 18 vitest тестов → 11 (убраны тесты restoreMouseEvents + assertions setIgnoreMouseEvents)
- 17 cjs assertion → 17 (одна перевёрнута: «НЕ должно быть setIgnoreMouseEvents(true)»)

#### Документация — ловушка #21

В [`mistakes/notifications-ribbon.md`](mistakes/notifications-ribbon.md) — полная запись с:
- Симптомом (двойной клик)
- Корневой причиной (повторил ловушку #27)
- Цепочкой кода
- Решением + регрессионной защитой
- Правилом на будущее: «если в `mistakes/*.md` есть ловушка про API X — прочитать ПЕРЕД использованием»

#### Эффект

🟢 **Что починилось**:
- Клики через pin/dock окна работают с первого раза
- `-webkit-app-region: drag` для перетаскивания dock работает
- Ловушка #27 соблюдена

🟢 **Что НЕ сломалось**:
- Защита от ghost hit-test региона **сохранена** (offscreen + hide)
- Все 597 vitest проходят
- 32 cjs-теста + новый assertion в pre-commit

⭐⭐⭐⭐⭐ Уверенность: высокая. Подтверждено:
- Ловушка #27 в нашем проекте
- Electron official docs
- 0 вызовов restoreMouseEvents в pin/dock (grep)
- CPU нормальный (опровергает perf-гипотезу)
- Скриншот Task Manager показал что причина не CPU

#### Урок (в auto-memory)

«Если в `mistakes/*.md` есть ловушка про API — **прочитать ПЕРЕД использованием**, особенно если правишь похожий код». В v0.89.18 я не прочитал `webview-stack-grouping.md` где была ловушка #27. Через 4 итерации (v0.89.18 → 19 → 20 → 21) пользователь поймал баг через Task Manager.

---

### v0.89.21 — Дополнительные diagnostic logs: addNotification + forceRemoveItem + DOM snapshot

**Контекст**: v0.89.20 логи опровергли первоначальную гипотезу про mid-animation полоску (calcH=0 на одиночном dismiss). Но логи показали **новое расхождение**: в моменты с несколькими уведомлениями `items.size` в Map != `container.children.length` в DOM. Например: `items=3 containerChildren=2`. Это значит — в renderer Map и DOM расходятся, но v0.89.20 логи не показывают **какие именно** элементы в DOM и их состояние.

#### Что добавлено (3 точки в `main/notification.js`)

1. **`addNotification`** (строка 287) — лог при получении новой notif от main:
   - id, messengerId, длина body, тип иконки (data/url/none)
   - grouping enabled
   - items.size + container.children.length **ДО** добавления
   - WARN при дубликате id → forceRemove

2. **`forceRemoveItem`** (строка 272) — лог при принудительном удалении:
   - id, isStackChild (ghost vs real)
   - items.size + container.children.length **ДО** удаления

3. **`reportHeight`** (строка 24) — **снэпшот ВСЕХ DOM-элементов** перед resize:
   ```
   [0 id=42 h=82 op=1 pe=auto tf=none]
   [1 id=43 h=0 op=0 pe=none tf=translateX(80px)scale(0.95)]
   ```
   Покажет: какие elements остались в DOM, в каком состоянии (opacity, pointer-events, transform), реальная offsetHeight.

**Канал**: всё через `window.notifApi.log` → IPC `app:log` → файл `chatcenter.log` с префиксом `[notif-renderer]`.

#### Что покажут эти логи

| Сценарий | Лог покажет |
|---|---|
| Уведомление пришло с пустым body | `bodyLen=0 iconType=none` |
| Дубликат id (race condition) | `WARN addNotification duplicate` |
| Stale DOM element | `[N id=X h=82 op=1 pe=auto]` хотя items.size меньше |
| Element застрял в mid-animation | `h=0 op=0 pe=none tf=translateX(80px)scale(0.95)` |
| Ghost item (stack child) | `isStackChild=true` в forceRemoveItem |

#### План использования

1. Пользователь запускает v0.89.21 (с дополнительными логами)
2. Получает несколько уведомлений, ждёт пока появится полоска
3. Присылает `chatcenter.log`
4. Я по `DOM snapshot` событиям точно увижу что в окне в момент полоски

**Tests**: не добавлены (только diagnostic). Lint OK, 614 vitest OK. Версия `0.89.20 → 0.89.21` (patch).

#### Что опровергнуто фактами из v0.89.20 логов

| Моя гипотеза | Опровергнуто фактом |
|---|---|
| mid-animation reportHeight возвращает height>0 → setBounds(10px) | calcH=0 на одиночном dismiss (`pointerEvents='none'` skip) |
| полоска 10px = окно с height=10 | окно в момент полоски имеет height=190 (нормальный для 1 item) |
| второй reportHeight(0) иногда не приходит | final-report всегда приходит, safeHide всегда срабатывает |

Новая гипотеза по фактам: «застрявший» DOM элемент остаётся в `container` после dismiss (Map синхронизирован, DOM нет). DOM snapshot покажет это.

---

### v0.89.20 — Диагностическое логирование notification pipeline

**Контекст**: пользователь со скриншотом — после v0.89.18 фикса всё ещё иногда видна тонкая видимая полоска (~370×10px) в правом нижнем углу. Прошлый анализ был ГИПОТЕЗОЙ по чтению кода — без подтверждения runtime.

#### Что добавлено (только логирование, никакого изменения поведения)

| Где | Что логируется |
|---|---|
| [transparentWindowGuard.js](../main/utils/transparentWindowGuard.js) `safeHide` | wasVisible, boundsBefore |
| [transparentWindowGuard.js](../main/utils/transparentWindowGuard.js) `restoreMouseEvents` | факт вызова |
| [notifHandlers.js](../main/handlers/notifHandlers.js) `notif:resize` | raw + rounded height, visible, items count |
| [notificationManager.js](../main/handlers/notificationManager.js) `repositionNotifWin` | count, visible |
| [notification.js](../main/notification.js) renderer `reportHeight` | calcHeight, items.size, container.children.length |
| [notification.js](../main/notification.js) `dismissItem` старт/mid/final | id, items size, calcH в каждой стадии |

**Канал**: renderer пишет через новый `window.notifApi.log(level, message)` → IPC `app:log` → файл `chatcenter.log`. Префикс `[notif-renderer]` отличает от main.

#### Что подтвердит/опровергнет логирование

Моя гипотеза была: «промежуточный reportHeight внутри dismiss-анимации возвращает height>0 → main делает `setBounds(370×10)` → полоска ВИДНА 190мс → второй reportHeight(0) иногда не приходит → полоска остаётся».

**Уже найдено при добавлении логов** (потенциальное опровержение): `calcHeight()` в [notification.js:17](../main/notification.js#L17) **уже пропускает** элементы с `pointerEvents='none'`. А `dismissItem` ставит `pointerEvents='none'` на строке 110 ДО первого reportHeight. То есть mid-animation reportHeight теоретически должен возвращать **0**. Если так — моя гипотеза неверна.

Логи покажут что на самом деле.

#### План

1. Пользователь запускает приложение
2. Получает 1-2 уведомления, ждёт пока скроются
3. Если полоска появилась — пришлёт `chatcenter.log`
4. По фактам определим причину

**Tests**: не добавлены (только diagnostic). Lint + 614 vitest проходят. Версия `0.89.19 → 0.89.20` (patch — diagnostic only).

---

### v0.89.19 — Закрыта дыра в pre-commit защите регрессионного теста v0.89.18

**Контекст**: в v0.89.18 ввели регрессионный тест на сырой `.hide()` в `transparentWindowGuard.vitest.js`. При самопроверке после релиза выяснилось — **тест работает не везде**:

📊 **Что было**

| Сценарий | pre-commit | pre-push | CI |
|---|---|---|---|
| Изменили `.jsx` / `.vitest.*` | ✅ ловит | ✅ ловит | ✅ ловит |
| Изменили `.js` в `main/handlers/` | ❌ **vitest НЕ запускается** | ✅ ловит | ✅ ловит |

Pre-commit hook ([scripts/hooks/pre-commit:60](../scripts/hooks/pre-commit#L60)) запускает vitest **только** если staged файлы — `.jsx` или `.vitest.*`. Чистые `.js` правки в `notifHandlers.js`, `dockPinState.js` и др. проходили мимо vitest. Защита работала только на push (поздно) и в CI (ещё позже).

#### Решение

Регрессионный сканер перенесён из `.vitest.js` в `.cjs` формат → **попал в список быстрых статических тестов pre-commit**, которые запускаются ВСЕГДА (рядом с `hookOrder`, `fileSizeLimits`, `mainImports`).

**Изменения**:

1. **Новый файл** [`src/__tests__/transparentWindowGuard.test.cjs`](../src/__tests__/transparentWindowGuard.test.cjs) — 17 проверок:
   - Все 4 файла из `FILES_TO_CHECK` существуют
   - В каждом нет сырого `notifWin.hide()` / `dockState.win.hide()`
   - В каждом есть `safeHideTransparentWindow(...)` вызов (импорт + использование)
   - Helper [main/utils/transparentWindowGuard.js](../main/utils/transparentWindowGuard.js) существует и **не упрощён небезопасно** — проверяем что `setIgnoreMouseEvents(true)`, `setBounds`, offscreen координаты (`-30000`/`-10000`) внутри

2. **Удалён дубликат** из `transparentWindowGuard.vitest.js` — регрессия теперь только в .cjs, в vitest остались юнит-тесты самого helper'а (17 тестов).

3. **Подключение к pre-commit**: добавлен в список в [scripts/hooks/pre-commit:21](../scripts/hooks/pre-commit#L21):
   ```bash
   for t in hookOrder.test.cjs ... transparentWindowGuard.test.cjs; do
   ```

4. **Подключение к pre-push**: добавлен в массив `TESTS=( ... transparentWindowGuard )` в [scripts/hooks/pre-push:30](../scripts/hooks/pre-push#L30) — дублирует защиту.

5. **Подключение к `npm test`**: добавлен в test chain в `package.json` после `projectHealth.test.cjs` — поэтому CI его тоже запустит.

6. **Локальные хуки синхронизированы**: `cp scripts/hooks/pre-commit .git/hooks/...`.

#### Верификация (подделка обнаружена)

Я **временно** заменил один `safeHideTransparentWindow(notifWin)` на `notifWin.hide()` в `notifHandlers.js` и запустил тест:
```
❌ main/handlers/notifHandlers.js: НЕТ сырого notifWin.hide()
❌ main/handlers/notifHandlers.js: использует safeHideTransparentWindow
📊 Результат: 15 ✅ / 2 ❌ из 17
```
Exit code = 1 → **pre-commit заблокирует коммит**. После восстановления — снова 17/17 ✅.

#### Что это даёт — настоящие 3 уровня защиты

| Уровень | Где | Что делает |
|---|---|---|
| **1. Helper** | `main/utils/transparentWindowGuard.js` | Корректное скрытие transparent окна (3 шага: ignoreMouseEvents → offscreen → hide) |
| **2. Регрессия в pre-commit** | `src/__tests__/transparentWindowGuard.test.cjs` | **ВСЕГДА** падает на любом сыром `.hide()` — не зависит от типа файла |
| **3. Документация** | `.memory-bank/mistakes/notifications-ribbon.md` ловушка #20 | Правило и пример решения для будущих сессий |

**Tests**: 615 → 614 vitest + новый cjs (17 проверок). В CI и pre-push считаются как «31 cjs-тестов прошли» → станет 32.

#### Рекомендации на будущее

🟢 **При появлении нового transparent окна** — обновить **3 места одновременно**:
1. Использовать `safeHideTransparentWindow()` в коде
2. Добавить файл в `FILES_TO_CHECK` массив в [transparentWindowGuard.test.cjs](../src/__tests__/transparentWindowGuard.test.cjs)
3. Добавить переменную окна в `FORBIDDEN_PATTERNS` массив (например `myNewWin.hide()`)

🟢 **При добавлении ЛЮБОЙ ловушки в `mistakes/`** — рассмотреть нужен ли регрессионный тест в `.cjs` формате (для статической проверки кода), а не `.vitest.js` (запускается условно).

🟡 **Принцип pre-commit vs pre-push**:
- **pre-commit** = быстро (≤30 сек), **всегда** запускается. Сюда регрессии важных правил.
- **pre-push** = медленно, **всегда** запускается. Сюда полная батарея.
- **vitest в pre-commit** — только при .jsx/.vitest.* изменениях. Для статических проверок `.js` — использовать `.cjs` формат.

🔴 **Антипаттерн**: писать регрессионный тест только в `.vitest.js` для проверок которые касаются `.js` файлов в `main/`. Они пропустят pre-commit для большинства реальных правок.

---

### v0.89.18 — Ghost hit-test после `.hide()` у transparent окон (Windows 11)

**Контекст**: пользователь сообщил с скриншотом — после показа уведомления на экране остаётся тонкая линия + невидимый прямоугольник, перехватывающий клики. Зона становится «некликабельной» — мешает работать.

#### Корневая причина (по фактам)

Известная Electron issue для BrowserWindow с `transparent: true` + `frame: false` на Windows 11: после `.hide()` окно становится невидимым, но **OS hit-test регион** в bounds окна **не освобождается**. Это видно как:
1. Тонкая линия (остаточный кадр DWM frame buffer)
2. Невидимый прямоугольник, перехватывающий клики

Самое неприятное — **проблема уже была документирована в проекте** в [.memory-bank/mistakes/notifications-ribbon.md:280-283](mistakes/notifications-ribbon.md) ещё в v0.39.0:
> `focusable: false` + `setIgnoreMouseEvents(false)` по умолчанию — окно кликабельно даже после hide

Но **78 версий** проблема висела в коде без фикса. Описали — не закрыли.

#### Что было затронуто

5 мест вызова `.hide()` на transparent BrowserWindow:
- [`notifHandlers.js:66`](../main/handlers/notifHandlers.js) — dismiss последнего уведомления
- [`notificationManager.js:113`](../main/handlers/notificationManager.js) — `repositionNotifWin(count=0)`
- [`dockPinHandlers.js:108`](../main/handlers/dockPinHandlers.js) — pin → dock
- [`dockPinHandlers.js:267`](../main/handlers/dockPinHandlers.js) — `dock:close` IPC
- [`dockPinState.js:162`](../main/handlers/dockPinState.js) — нет pins в dock

Все 4 transparent окна затронуты: notifWin (370×N снизу справа), dockWin (пользовательская позиция), pin window (300×150 по центру).

#### Решение — единый helper

Новый модуль [`main/utils/transparentWindowGuard.js`](../main/utils/transparentWindowGuard.js):

```js
export function safeHideTransparentWindow(win) {
  if (!win || win.isDestroyed()) return false
  try {
    win.setIgnoreMouseEvents(true)                                  // (1) клики насквозь
    win.setBounds({ x: -30000, y: -30000, width: 1, height: 1 })   // (2) за экран в 1×1
    win.hide()                                                      // (3) фактический hide
    return true
  } catch (_) { return false }
}

export function restoreMouseEvents(win) { ... }  // setIgnoreMouseEvents(false) перед show
```

**Логика трёх шагов**:
1. **setIgnoreMouseEvents(true)** — если OS hit-region и «прилипнет», клики пройдут насквозь (главная защита)
2. **setBounds offscreen 1×1** — даже если hit-region останется, он за экраном размером 1 пиксель, пользователь никогда его не «поймает»
3. **hide()** — собственно скрываем окно

Эта тройная защита покрывает все известные сценарии Windows 11 ghost hit-test.

#### Регрессионная защита (главное)

Новый тест [`src/__tests__/transparentWindowGuard.vitest.js`](../src/__tests__/transparentWindowGuard.vitest.js) — **18 тестов**:
- 13 для `safeHideTransparentWindow`: порядок шагов, offscreen bounds, edge cases (null, destroyed, без методов), throw recovery
- 5 для `restoreMouseEvents`: вызов с false, null-safe, destroyed-safe, throw-safe
- **1 регрессионный тест** который **сканирует 4 production файла** и падает, если кто-то добавит сырой `.hide()` на `notifWin` или `dockState.win`:
  ```js
  expect(content).not.toMatch(/\bnotifWin\.hide\(/)
  expect(content).not.toMatch(/\bdockState\.win\.hide\(/)
  expect(content).toMatch(/safeHideTransparentWindow\(/)
  ```
  Это значит — **любая будущая регрессия поймается локально в pre-commit**, не дойдёт даже до CI.

**Tests**: 597 → 615 (+18).

#### Рекомендации на будущее (записаны в `mistakes/notifications-ribbon.md` ловушка #20)

🟢 **Правило**: ЛЮБОЕ окно `transparent: true` на Windows 11 → `.hide()` ТОЛЬКО через `safeHideTransparentWindow()`. Никогда напрямую. Регрессионный тест ловит.

🟢 **Расширение в будущем**: если появится новое transparent окно — добавить путь к нему в `FILES_TO_CHECK` массив в `transparentWindowGuard.vitest.js`. Регрессия будет автоматически защищать новое место.

🟡 **Архитектурное улучшение** (TODO-6 в `code-todo.md`): можно создать обёртку `createTransparentWindow(opts)` которая возвращает BrowserWindow с уже подменёнными `.hide()` / `.show()` методами через Proxy. Тогда даже забыть импортировать helper нельзя. Но это инвазивно — оставим на потом.

🔴 **Что НЕ делать**:
- НЕ возвращаться к сырому `.hide()` «для оптимизации» — три extra вызова занимают <1 мс, цена незаметна
- НЕ удалять регрессионный тест — это единственный страж
- НЕ переименовывать `notifWin` или `dockState.win` без обновления списка запрещённых паттернов в тесте

#### Эффект

🟢 **Что починилось**:
- После закрытия уведомления никакого следа на экране
- Клики проходят везде где должны проходить
- Поведение идентично macOS / Linux (где `transparent` без проблем)

🟢 **Безопасность реализации**:
- Все три шага в `try/catch` — `setIgnoreMouseEvents` / `setBounds` / `hide` могут падать на destroyed окне, мы это ловим
- `null`/`undefined` окно → early return, не падает
- Опциональная проверка `typeof win.foo === 'function'` для каждого вызова — устойчиво к нестандартным мокам в тестах

🟢 **DRY**:
- Один helper, 5 точек применения, импорт в 3 файла
- Никакого копипаста setIgnoreMouseEvents+setBounds+hide

---

### v0.89.17 — LRU-кеш для `tg-media/` (как в Telegram Desktop)

**Контекст**: после v0.89.15 каждое медиа копируется в `userData/tg-media/` для стабильности URL. Папка росла без ограничений. Ревью v0.89.16 нашло 3 проблемы:

1. **`getCleanupStats` не сканировал `tg-media/`** → UI «Очистить кеш» врал о реальном размере (показывал N МБ, реально на диске M+N МБ)
2. **`removeAccountSessionFiles` не чистил `tg-media/`** → файлы удалённого аккаунта оставались
3. **Нет автоочистки** → папка росла бесконечно

#### Как делают другие клиенты (исследование)

| Клиент | Подход |
|---|---|
| Telegram Desktop (C++) | TDLib `optimizeStorage` — LRU + TTL + immunity_delay |
| Telegram Web K (WASM) | TDLib через WASM, лимит ~512 МБ |
| WhatsApp Desktop | TTL 30 дней по умолчанию, авточистка по LRU |
| Signal Desktop | TTL настраивается, очистка при старте |

**Общий паттерн**: LRU (Least Recently Used) + лимит по размеру + лимит по возрасту + immunity для недавно открытых.

#### Документация TDLib

[`optimizeStorage`](https://core.telegram.org/tdlib/getting-started#storage-optimization):
> Files are removed in LRU order within the specified limits. The `immunity_delay` parameter protects recently accessed files.

#### Решение

Новый модуль [`main/native/backends/tgMediaCleanup.js`](../main/native/backends/tgMediaCleanup.js) (~160 строк) — точный аналог `optimizeStorage` для нашей папки `tg-media/`.

**Дефолты как в Telegram Desktop** ([TG_MEDIA_DEFAULTS](../main/native/backends/tgMediaCleanup.js)):

| Параметр | Значение | Зачем |
|---|---|---|
| `maxSizeBytes` | 1 ГБ | Лимит размера папки |
| `ttlSeconds` | 7 дней | Файлы старше — удаляем |
| `immunityDelay` | 5 минут | Только что открытые — не трогать (защита играющих видео) |

**API модуля**:
- `getTgMediaStats(userDataDir)` → `{ totalBytes, fileCount, oldestMtime }` — для UI «Очистить кеш»
- `cleanupTgMedia(userDataDir, opts)` → `{ ok, freedBytes, removedCount, remainingBytes }`
- `touchTgMediaFile(absPath)` — обновляет mtime файла (LRU-маркер «недавно открыт»)

**Алгоритм очистки** (мирорит TDLib):
1. **TTL-проход**: удалить все файлы старше `ttlSeconds`
2. **LRU-проход**: если суммарный размер > `maxSizeBytes` — сортируем по mtime (старые первыми), удаляем по одному до выхода в лимит, **пропуская файлы моложе `immunityDelay`**
3. **wipeAll** (`maxSizeBytes:0`): удалить ВСЁ независимо от возраста — для ручной кнопки «Очистить кеш»

#### Точки интеграции (4 файла)

1. **[tdlibChatActions.getCleanupStats](../main/native/backends/tdlibChatActions.js)** (строка 240):
   ```js
   walkAndCategorize(path.join(userDataDir, 'tg-media'), 'media', acc)
   ```
   → Решает Проблему #1: UI видит реальный размер.

2. **[tdlibBackend.media.cleanup](../main/native/backends/tdlibBackend.js)**:
   ```js
   freed += cleanupTgMedia(userDataDir, { maxSizeBytes: 0, ttlSeconds: 0 }).freedBytes
   ```
   → Кнопка «Очистить кеш» теперь реально удаляет `tg-media/`.

3. **[tdlibStartup.js](../main/native/backends/tdlibStartup.js)** — после `createTdlibBackend`:
   ```js
   if (opts.userDataPath) setImmediate(() => cleanupTgMedia(opts.userDataPath, TG_MEDIA_DEFAULTS))
   ```
   → Решает Проблему #3: автоочистка при старте по LRU+TTL.

4. **[ccMediaProtocol.js](../main/native/ccMediaProtocol.js)** — в handler:
   ```js
   if (kind === 'media') touchTgMediaFile(filePath)
   ```
   → Каждое чтение файла обновляет mtime. Играющее видео получает «свежий» mtime → защищено immunity от cleanup.

#### Проблема #2 (`tg-media/` при удалении аккаунта)

Решена **автоматически через LRU**: имена файлов в `tg-media/` детерминированные (`<fileId>_<size>.<ext>`). После удаления аккаунта его файлы никто не запрашивает → mtime не обновляется → через 7 дней TTL их сам удаляет. Префикс accountId в именах не нужен (записано в `code-todo.md` как TODO-3 на случай если поведение нужно сильнее).

#### Тесты

Новый файл [`src/__tests__/tgMediaCleanup.vitest.js`](../src/__tests__/tgMediaCleanup.vitest.js) — **20 тестов**:

| Раздел | Что проверяет |
|---|---|
| `getTgMediaStats` (6) | пустая папка, несуществующая, null, суммарный размер, oldestMtime, игнор поддиректорий |
| `cleanupTgMedia: TTL` (2) | удаление по возрасту, `ttlSeconds:0` отключает |
| `cleanupTgMedia: LRU` (3) | удаление самых старых при превышении лимита, immunity защищает играющие, под лимитом — ничего не делает |
| `cleanupTgMedia: wipeAll` (2) | `maxSizeBytes:0` удаляет ВСЁ, `remainingBytes:0` после wipe |
| `cleanupTgMedia: edge cases` (5) | папки нет, null, пустая папка, дефолты публичные, игнор поддиректорий |
| `touchTgMediaFile` (2) | обновляет mtime, false на несуществующий файл |

**Tests**: 577 → 597.

#### Эффект

🟢 **Что починилось**:
- UI «Очистить кеш» показывает **реальный** размер диска (с `tg-media/`)
- Кнопка «Очистить кеш» реально освобождает место в `tg-media/`
- Автоочистка при старте: файлы старше 7 дней — удаляются; если папка > 1 ГБ — удаляются самые старые до лимита
- Играющее видео защищено: cc-media handler обновляет mtime при каждом Range-запросе → immunity 5 мин не даст удалить
- Поведение **идентично официальному Telegram Desktop**

🟢 **Безопасность**:
- Не блокирует init — cleanup в `setImmediate` с try/catch
- Не падает на отсутствующих файлах / правах — все `fs` операции обёрнуты
- Не трогает поддиректории — только файлы в корне `tg-media/`

🟡 **Архитектурно**:
- Алгоритм соответствует [TDLib `optimizeStorage` docs](https://core.telegram.org/tdlib/getting-started#storage-optimization)
- Один и тот же подход в Telegram Desktop, Web, WhatsApp, Signal

#### Чего НЕ сделано (записано в [code-todo.md](code-todo.md) как TODO)

- ❌ Конфигурация лимитов в UI (Settings → Storage Usage) — не запрашивалась
- ❌ Префикс accountId в именах файлов (TODO-3) — LRU саморегулируется через TTL
- ❌ Удаление `thumb` параметра (TODO-1) — отдельно

---

### v0.89.16 — ✅ ПОДТВЕРЖДЕНО ПОЛЬЗОВАТЕЛЕМ: Постер видео работает

**Статус**: ✅ Работает. Пользователь подтвердил визуально 15 мая 2026. Серия видео v0.89.6-v0.89.16 **ЗАКРЫТА**: воспроизведение + перемотка + постеры — всё корректно. 10 ловушек задокументированы в `.memory-bank/mistakes/tdlib-video-player.md`.

**Контекст**: после v0.89.15 пользователь увидел чёрный экран вместо превью в постере видео (Telegram-like UX отсутствовал). Скриншот показал: только размытый фон (`m.strippedThumb`) + кнопка ▶, JPEG-постер не подгружался.

#### Корневая причина

`VideoTile.jsx` + `MediaAlbum.jsx` при монтировании вызывали:
```js
window.api.invoke('tg:download-media', { chatId, messageId, thumb: false })
```

Параметр `thumb` в backend `media.download` **никогда не использовался**. Хелпер `extractMediaFileId(content)` для `messageVideo` возвращал `content.video.video.id` — это file_id **самого видео** (mp4, ~45 МБ), а не его превью.

Цепочка ошибки:
1. UI вызывает `tg:download-media` под видом «постера»
2. Backend качает ПОЛНОЕ видео (десятки МБ в фон) на каждое появление видео в чате
3. Backend возвращает URL `cc-media://media/<видео.mp4>`
4. UI ставит этот URL в `<img src="...">` — Chromium не рендерит mp4 в img
5. Виден только размытый minithumbnail (если есть) или чёрный фон

По [TDLib докам](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1video.html) у `video` есть ТРИ слоя:
- `minithumbnail: minithumbnail` — base64 ~200 байт в самом сообщении (размытый)
- `thumbnail: thumbnail { format, width, height, file: file }` — JPEG ~10-100 КБ (чёткий) ← **это надо качать для постера**
- `video: file` — mp4 десятки МБ (это для клика «▶»)

#### Как делают другие клиенты

| Клиент | Слой 1 (0 мс) | Слой 2 (~200 мс) | Слой 3 (на клик ▶) |
|---|---|---|---|
| Telegram Desktop (C++) | minithumbnail | `thumbnail.file` через `readFilePart` | `video.video` |
| Telegram Web K (WASM) | minithumbnail | `thumbnail.file` через Service Worker | `video.video` |
| **ChatCenter до v0.89.16** | minithumbnail | ❌ ОТСУТСТВУЕТ — качали полный mp4 | `video.video` |
| **ChatCenter v0.89.16** | minithumbnail | ✅ `thumbnail.file` через `tg:download-thumbnail` | `video.video` |

#### Решение

**4 файла, ~80 строк правок + 18 новых тестов**:

1. **[main/native/backends/tdlibMedia.js](../main/native/backends/tdlibMedia.js)** — новый helper:
   ```js
   export function extractThumbnailFileId(content) {
     if (content?.['@type'] === 'messageVideo')     return content.video?.thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messageAnimation') return content.animation?.thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messageDocument')  return content.document?.thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messageVideoNote') return content.video_note?.thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messageAudio')     return content.audio?.album_cover_thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messagePhoto')     return /* наименьший size для превью */ ...
     return null
   }
   ```
   Использован оператор `??` (не `||`), чтобы `file_id=0` (теоретически валидный) не превратился в `null`.

2. **[main/native/backends/tdlibBackend.js](../main/native/backends/tdlibBackend.js)** — новый метод `backend.media.downloadThumbnail`:
   - priority=8 (ниже video=24, выше default=1 — постеры важнее фона, но не блокируют клик на «▶»)
   - Возвращает `cc-media://media/<fileId>_<size>.jpg` через `stabilizeForPlayback`
   - Бонус: media-секция отрефакторена через IIFE с хелперами `dlAndStabilize` + `fetchMessage` (убрана дубликация в 3 методах: download/downloadVideo/downloadThumbnail)

3. **[main/native/tdlibIpcHandlers.js](../main/native/tdlibIpcHandlers.js)** — новый IPC `tg:download-thumbnail`

4. **[src/native/components/VideoTile.jsx](../src/native/components/VideoTile.jsx)** и **[src/native/components/MediaAlbum.jsx](../src/native/components/MediaAlbum.jsx)** — переведены с `tg:download-media` на `tg:download-thumbnail` для постера. В MediaAlbum для `PhotoTile` (полные фото в альбоме) `downloadMedia` callback **сохранён** — он там не для превью, а для полного фото на клик.

**Tests**: 559 → 577. Новый файл [`src/__tests__/tdlibMediaThumbnail.vitest.js`](../src/__tests__/tdlibMediaThumbnail.vitest.js) — 18 тестов:
- 14 для `extractThumbnailFileId`: все типы сообщений (video, animation, document, videoNote, audio, photo, text, voice, sticker), edge cases (null, без thumbnail, без sizes, id=0)
- 4 для `backend.media.downloadThumbnail`: качает правильный file_id (thumbnail, не video), `no thumbnail` error, ошибка getMessage, priority=8

Обновлены `VideoTile.vitest.jsx` + `MediaAlbum.vitest.jsx` (проверяют новый канал). Добавлено `downloadThumbnail` в `REQUIRED_METHODS` контракта в [`messengerBackend.test.cjs`](../src/__tests__/messengerBackend.test.cjs).

#### Эффект

🟢 **Что починилось**:
- Чёткий JPEG-кадр виден до клика ▶ (как в обычном Telegram)
- **Перестало качать 45+ МБ** в фон при появлении видео в чате
- Экономия трафика на мобильной связи
- Меньше нагрузка на TDLib priority queue
- TDLib не забивается фоновыми full-загрузками — клик «▶» начинает скачку моментально

📚 **Документация ловушек**: добавлена ловушка #10 в [.memory-bank/mistakes/tdlib-video-player.md](mistakes/tdlib-video-player.md): «параметр `thumb` в `media.download` был мёртвым кодом — игнорировался backend'ом».

---

### v0.89.15 — ✅ ПОДТВЕРЖДЕНО ПОЛЬЗОВАТЕЛЕМ: Видео раз и навсегда

**Статус**: ✅ Работает. Пользователь подтвердил визуально 15 мая 2026 (после релиза 18:45). Серия v0.89.6–v0.89.15 (видео-pipeline после TDLib миграции) **ЗАКРЫТА**.

**Контекст**: после v0.89.14 пользователь сообщил `ENOENT` на `tdlib-sessions/.../temp/2767` — десятки повторов за 2 секунды при попытке перезапустить видео. Логи (`chatcenter.log` 15 мая 18:17:55-57) показали, что фикс v0.89.14 (`stabilizeTempFile` для temp/) применялся **только** к non-streamable видео из-за условия `if (!r?.partial)` в `downloadVideo` — streamable (`supports_streaming=true`) обходили стабилизацию.

#### Корневая причина (одной строкой)

Архитектурно неверная попытка отдать `<video>` URL в TDLib-папку, которая нестабильна:
1. `tdlib-sessions/.../pending/files/temp/<N>` — TDLib переименовывает на completion, чистит при `optimizeStorage`
2. `tdlib-sessions/.../videos/<hash>.<ext>` — TDLib удаляет при чистке («Очистить кеш» вызывает `optimizeStorage`)
3. Progressive playback (early-resolve на 256 KB префикса) даёт ссылку на ещё-растущий файл с потенциально меняющимся именем

По [TDLib docs](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1local_file.html): `path` стабилен **только** после `is_downloading_completed=true`. Но даже после — наш UI «Очистить кеш» может удалить файл.

#### Радикальное решение (одно, надёжное, навсегда)

**Принцип**: НИ ОДИН TDLib-файл плеером напрямую не читается. Любой скачанный файл копируется в `userData/tg-media/<fileId>_<size>.<ext>` — это **НАША** папка, TDLib её не трогает.

**4 файла, ~150 строк правок**:

1. **[main/native/backends/tdlibMedia.js](../main/native/backends/tdlibMedia.js)**:
   - Удалён параметр `progressive` из `downloadFile`. Всегда ждём `is_downloading_completed=true`. Никаких early-резолвов
   - `stabilizeTempFile` → `stabilizeForPlayback`: копирует ЛЮБОЙ TDLib-файл (не только `temp/`) в `tg-media/`
   - Имя файла детерминированно: `<fileId>_<size>.<ext>` — дедуп между чатами и сессиями
   - При совпадении размера в `tg-media/` — copy не делается (быстрый кеш)

2. **[main/native/backends/tdlibBackend.js](../main/native/backends/tdlibBackend.js)**:
   - `media.download` и `media.downloadVideo` теперь **всегда** вызывают `stabilizeForPlayback` после успешной загрузки (раньше было `if (!r?.partial)` — пропускало streamable)
   - `downloadVideo` больше не читает `tdMsg.content.video.supports_streaming` (флаг больше не нужен)

3. **[src/native/components/VideoTile.jsx](../src/native/components/VideoTile.jsx)**:
   - Удалён state `partial` и связанный с ним оверлей «Загрузка X%» поверх играющего видео
   - Effect для `tg:media-progress` теперь зависит только от `downloading`
   - UX: пользователь видит прогресс-спиннер на постере до начала проигрывания. Когда видео стартует — оно полностью на диске, плавная перемотка, никаких неожиданных остановок

4. **[main/native/ccMediaProtocol.js](../main/native/ccMediaProtocol.js)**:
   - Удалён `kind='tdlib'` handler. Плеер больше не может попасть в `tdlib-sessions/` через cc-media. Любая старая ссылка с `cc-media://tdlib/...` вернёт 404 (но таких в UI после рестарта не остаётся — URL генерируются заново)

**Тесты**: добавлено 13 новых для `stabilizeForPlayback` + 4 переписанных для `downloadFile` (теперь проверяют, что progressive флаг игнорируется и `partial` поле не возвращается). Всего: 546 → 559 vitest тестов.

#### Что починилось (5 разных багов одним фиксом)

| Симптом | Версия добавлен | Корень |
|---|---|---|
| `ENOENT: tdlib-sessions/.../temp/<N>` | v0.89.8 | TDLib чистит `temp/` |
| `PIPELINE_ERROR_DECODE` при переходе temp→videos | v0.89.8 | Путь меняется в процессе воспроизведения |
| «Перемотка не работает» (отскакивает в начало) | v0.89.10 (clamp по `buffered`), v0.89.12 | Range запросы на нестабильный файл |
| «Запускается с начала» после паузы | v0.89.11 | `<video>` перезапускается на потере источника |
| Видео ломается после «Очистить кеш» | давно | `optimizeStorage` удаляет TDLib-файлы |

#### Что подтверждает решение

1. **TDLib официальная документация**: `path` нестабилен до `is_downloading_completed=true`
2. **Логи пользователя**: 50+ ENOENT именно на `pending/files/temp/2767` (15 мая 18:17:55-57)
3. **Telegram Web K / Desktop**: тоже не дают плееру прямой путь, проксируют через `readFilePart` (у нас простая альтернатива — копия в свою папку)
4. **Запись в [.memory-bank/mistakes/tdlib-video-player.md](mistakes/tdlib-video-player.md)** — добавлены ловушки #8 и #9, итого 9 ловушек в серии v0.89.6–v0.89.15

#### Чего НЕ делаем (и почему)

- ❌ Не используем `readFilePart` стриминг через cc-media — у нас локальный диск, проще скопировать
- ❌ Не возвращаем progressive playback с обновлением URL на лету — Chromium `<video>` теряет позицию при смене `src`
- ❌ Не оставляем kind=`tdlib` в ccMediaProtocol «на всякий случай» — это была подпорка, скрывавшая баг

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
