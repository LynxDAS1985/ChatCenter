# Ловушки: native-скролл и счётчик непрочитанных

**Извлечено из** `common-mistakes.md` 24 апреля 2026 (v0.87.54).
**Темы**: native InboxMode scroll, unread counter, markRead, groupedUnread, IntersectionObserver, firstUnread, load-older.
**Связанный handoff**: [`../native-scroll-diagnostics-handoff.md`](../native-scroll-diagnostics-handoff.md)

Секции `⚪ ИСТОРИЯ (РЕШЕНО)` удалены из этого файла — см. [`../archive/2026-04-common-mistakes-resolved.md`](../archive/2026-04-common-mistakes-resolved.md).

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
