# Архив: changelog v0.95.8 – v0.95.9

Вынесено 28 мая 2026 при v0.95.15 для уменьшения features.md под лимит 100 КБ. v0.95.8 (счётчик ↓ обнуляется + плавная анимация + live compact + порог 160), v0.95.9 (compact аватар 53px + порог 128 + плавный переход + ↓ loading state). Все стабильны.

---

### v0.95.9 — Compact: аватар 53px, порог 128, плавный переход + кнопка ↓ loading state

По 3 запросам юзера (скрины чатов «Диджитальная», AI-ML):

#### 1. Аватарки в compact — те же 53px (не 44)

Юзер: «надо чтобы размеры значков не меняли когда оставляю одни значки, были такой же большие как в полном списке». В [ChatListItem.jsx compact branch](src/native/components/ChatListItem.jsx) аватар возвращён к **53px** (был 44px). Шрифт инициалов 16→19. Юзер видит одинаковые «большие» значки и в полном, и в compact-режиме — нет визуального уменьшения.

#### 2. Порог 160 → 128 (юзер: «уменьшить ещё на 20%»)

В [useChatListResize.js](src/native/hooks/useChatListResize.js): `CHAT_LIST_COMPACT_THRESHOLD = 128`. Цепочка: 200 (v0.95.7) → 160 (v0.95.8) → 128 (v0.95.9). Compact включается ещё позже — нужно сжать почти до самого края (60px минимум).

#### 3. Плавный переход compact ↔ full (без дёрга)

В [InboxChatListSidebar.jsx](src/native/components/InboxChatListSidebar.jsx) добавлен `transition: width 200ms ease-out` на root `<div>`. Включается только когда `isResizing === false` — во время активного drag (direct DOM mutation для 60fps) transition выключен. После mouse-up или при пересечении threshold внутри drag — React re-render с transition → плавная анимация ширины. Юзер видит как лента «плавно сжимается» а не резко прыгает.

`isResizingChatList` пробрасывается из [InboxMode.jsx](src/native/modes/InboxMode.jsx) в Sidebar для управления transition.

#### 4. Кнопка ↓ — loading state + продолжение scroll (без дёрга)

Юзер (скрин «AI/ML Ready», unread=1168): «нажимаю ↓, пролистывает 100 штук потом загружает ещё, надо чтоб блок со стрелочкой был в hover-эффектах по цвету как “Загружаю ещё...”, без дёрга».

**4a — visual loading state** (`ScrollBottomButton` в [InboxChatPanel.jsx](src/native/components/InboxChatPanel.jsx) + CSS в [styles-overlays.css](src/native/styles-overlays.css)):
- Новый класс `.native-scroll-bottom-btn--loading` когда `loadingNewer=true`
- Accent border + animated **pulse** через `box-shadow` (1.4s infinite) — тот же accent цвет что у индикатора «Загружаю ещё...»
- Tooltip меняется: «Подгружаю свежие сообщения…»
- Юзер визуально понимает «идёт работа», нет ощущения «зависло»

**4b — продолжение scroll после load-newer** (новый `scrollIntentRef` + `useLayoutEffect` в [InboxMode.jsx](src/native/modes/InboxMode.jsx)):
- При клике ↓ ставится `scrollIntentRef.current = { active: true, expiresAt: now + 4000 }`
- `useLayoutEffect` слушает `activeMessages.length` и `loadingNewer` — при дозагрузке new messages довинчивает scroll к низу `behavior: 'instant'`
- Reset intent когда `loadingNewer=false && bottomGap <= 4` (достигли дна)
- 4-секундный timeout защищает от вечного intent если load-newer застрял

#### Конфликты — проверены ✅

- ✅ `useLayoutEffect` на `activeMessages.length` — синхронно с DOM, корректно перед paint
- ✅ Direct DOM `style.width` в drag НЕ перебивает transition — transition выключен через `chatListRef.current.style.transition = 'none'` в startResize, восстанавливается в onPointerUp
- ✅ Loading pulse animation НЕ конфликтует с entering/leaving (разные keyframes, последовательное применение через composed `animation:` rule)
- ✅ `scrollIntentRef` НЕ перебивает user wheel-scroll — useLayoutEffect срабатывает только при изменении `activeMessages.length`/`loadingNewer`, а user-scroll такие зависимости не меняет
- ✅ Тесты useChatListResize обновлены под новый порог 128 (3 теста), full vitest 721/721

#### Тесты

Обновлены тесты [useChatListResize.vitest.jsx](src/native/hooks/useChatListResize.vitest.jsx) под новый порог 128 — 3 теста: пороги в обе стороны (60..127 compact, 128..199 не compact), live toggle при пересечении 128, no-cross no-update.

**Регрессия**: lint 0, vitest 721/721, fileSizeLimits 283/283, check-memory ✅.

---

### v0.95.8 — Счётчик ↓ обнуляется + плавная анимация кнопки + live compact + порог 200→160

Юзер: скрин чата «Вайбкодинг», после клика ↓ счётчик 289 остался, кнопка исчезла без анимации. Плюс по drag-resize (v0.95.7): compact срабатывает только после mouse-up + слишком рано (при ~200px).

#### Fix 1 — счётчик обнуляется (gate bypass для button-scroll)

В [InboxMode.jsx markReadCurrentView](src/native/modes/InboxMode.jsx#L233-L290) расширен whitelist гейта `unreadWindowIncomplete` — добавлен `'button-scroll'` в `ACTIVE_USER_SOURCES`:
```js
const ACTIVE_USER_SOURCES = new Set(['visibility', 'button-scroll'])
if (unreadWindowIncomplete && !ACTIVE_USER_SOURCES.has(source)) { skip }
```

**Безопасность — 100% проверена** (audit на 6 направлениях):
- ✅ Кнопка ↓ = **active** user intent, не **passive** (защиты v0.94.7/v0.91.13 от passive остаются нетронутыми)
- ✅ [TDLib viewMessages spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1view_messages.html) — range-ack штатное API: «marks all messages ≤ maxId as viewed»
- ✅ [Telegram Desktop bug c/5792](https://bugs.telegram.org/c/5792) — клик ↓ всегда mass-ack ВСЕХ непрочитанных
- ✅ v0.95.0 закрыл root cause "дыры" — гейт срабатывает редко
- ✅ Гейты в `useReadByVisibility` (v0.94.7 caskade guard) и `useForceReadAtBottom` (v0.91.13 threshold 30) независимые — защищают от автоматических mass-ack, не от явных кликов
- ✅ Edge cases: forum chat → отдельная ветка `markTopicRead`; повторные клики → `maxId > maxEverSent` гейт

Добавлен лог `mark-read-bypass-gate-button-scroll` для transparency — видно когда явный клик обходит гейт.

#### Fix 2 — плавная анимация кнопки ↓ (useDelayedUnmount)

React не имеет встроенной exit-animation при `{cond && <X/>}` — элемент удаляется мгновенно, CSS transitions не успевают. Решение — задержка реального unmount.

Новый хук [useDelayedUnmount.js](src/native/hooks/useDelayedUnmount.js):
- При `visible=false` → ставится `leaving=true` → ждём 220мс → реальный unmount
- При `visible=true` во время leaving → snap back (отмена timer)
- Cleanup на unmount хука → timer не зависает

Новый компонент `ScrollBottomButton` в [InboxChatPanel.jsx](src/native/components/InboxChatPanel.jsx) — обёртка над `<button>` с классами `--entering` / `--leaving` по состоянию.

CSS [styles-overlays.css](src/native/styles-overlays.css):
- **Появление**: `cubic-bezier(0.34, 1.4, 0.64, 1)` overshoot 220мс — `opacity 0→1`, `translateY 20px→0`, `scale 0.85→1`
- **Исчезновение**: `ease-out` 220мс — `opacity 1→0`, `translateY 0→20px`, `scale 1→0.85`, `pointer-events: none` (защита от accidental clicks)

Эталон: [Telegram Web K bubbles-corner-button](https://github.com/morethanwords/tweb) — тот же паттерн `transition: opacity .2s, transform .2s + translateY/scale`.

#### Bonus 1 — live compact во время drag (без отпускания мыши)

В [useChatListResize.js onPointerMove](src/native/hooks/useChatListResize.js) добавлен `setState` ТОЛЬКО при пересечении threshold:
```js
const wasCompact = isChatListCompact(prevW)
const isCompact = isChatListCompact(newW)
if (wasCompact !== isCompact) setChatListWidth(newW)
```
60fps сохраняется — React re-render 1 раз когда compact toggle, не каждый pixel. Юзер видит переход в значки **сразу во время drag**, не после mouse-up.

#### Bonus 2 — порог 200 → 160 (на 20% позже)

По запросу юзера «слишком рано схлопывается в значки». Compact теперь включается при `width < 160` (было `< 200`).

#### Тесты — 10 новых unit-тестов

- [useDelayedUnmount.vitest.jsx](src/native/hooks/useDelayedUnmount.vitest.jsx) — 6 тестов (initial visible/invisible, true→false leave→unmount timing, false→true snap-back, custom delay, cleanup)
- [useChatListResize.vitest.jsx](src/native/hooks/useChatListResize.vitest.jsx) — 4 новых теста (порог 160 константа, 161-199 НЕ compact, live compact toggle при пересечении, drag без пересечения НЕ обновляет state)

**Регрессия**: lint 0, vitest 721/721 (+10), fileSizeLimits 283/283 (+1 новый файл), check-memory ✅.

---

