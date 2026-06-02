# Features Archive — v0.95.31

Структурный релиз: аккаунты вниз левой колонки + drag-n-drop, множественный typing-индикатор, throttle реакций 200мс. Стабилизировано v0.95.34+ (фиксы темы CSS specificity).

---

### v0.95.31 — Аккаунты вниз + Drag-n-drop + множественный typing + throttle реакций

Структурный релиз — 3 фичи по запросу юзера. Изменения в main (tdlibClient.js, tdlibIpcBridge.js) минимальные — добавлено поле senderName в event chat:typing.

**1. Аккаунты вниз левой колонки + Drag-n-drop** — новый модуль `accountOrder.js`:
- `loadAccountOrder/saveAccountOrder` — localStorage `cc-account-order` (массив id).
- `applyAccountOrder(accounts, order)` — переставляет аккаунты по сохранённому порядку. Новые (не в order) — В КОНЕЦ (как Telegram Desktop / Slack workspace).
- `moveAccount(accounts, from, to)` — immutable перестановка, возвращает новый порядок ids.
- В `NativeApp.jsx` `.native-sidebar` теперь flex-column с `<div flex:1>` spacer наверху — аккаунты прижаты ВНИЗ (стандарт Telegram Desktop multi-account, Slack workspace switcher, Discord servers).
- HTML5 native drag-n-drop: `draggable + onDragStart/onDragOver/onDragEnd` без библиотек. Тащимый аккаунт — opacity 0.4, drop target — dashed accent outline. Cursor: grab → grabbing.

**2. Множественный typing-индикатор в header** — новый чистый util `formatTypingUsers.js`:
- Принимает `{[userId]: {senderName, at}}` Map → возвращает строку «Иван печатает...» (1) / «Иван и Маша печатают...» (2) / «Иван, Маша и Петя печатают...» (3) / «N человек печатают...» (4+).
- TYPING_TIMEOUT_MS = 6.5с — отфильтровывает истёкшие записи (TDLib шлёт updateChatAction каждые 5-6с).
- Backend `tdlibClient.js` — в event `chat:typing` добавлен `senderName` через userCache.
- IPC `tdlibIpcBridge.js` — пробрасывает senderName до renderer.
- Store `nativeStoreIpc.js` — handler `tg:typing` теперь хранит Map по userId (`state.typing[chatId][userId] = {senderName, at}`). Раньше — один юзер. Истечение 6.5с с очисткой только своего userId (другие не страдают).
- `formatChatStatus.js` расширен опцией `typingText` — перебивает старый bool `isTyping` если передана строка. Backward compat: `isTyping=true` без `typingText` → 'печатает...'.
- `InboxMode.jsx` — `typingText = formatTypingUsers(typingMap)`, прокидывается в InboxChatPanel.
- `InboxChatPanel.jsx` — `formatChatStatus(activeChat, { isTyping, typingText })`.

**3. Throttle быстрых реакций (200мс leading-edge)** — новый util `reactionThrottle.js`:
- `createReactionThrottler(intervalMs=200)` → `throttle(key, fn)`. Первый клик идёт МГНОВЕННО (UX-feedback), последующие в течение 200мс на тот же key — игнорируются.
- Key = `${msgId}:${emoji}` — независимая блокировка для каждой комбинации (разные emoji ставятся параллельно).
- Защита от FLOOD_WAIT (TDLib rate-limit на addMessageReaction/removeMessageReaction).
- Эталоны: Discord leading throttle 250мс, Slack 200мс, Telegram Desktop guard в reactions.cpp.
- `MessageReactions.jsx` `handleToggle` оборачивает `onSetReaction` через `throttleRef.current(key, () => ...)`.

**Эталоны** (2026): Telegram Desktop multi-account (info_top_bar.cpp), Slack workspace switcher, Discord servers, Telegram Web K chatBubbles.ts (typing aggregation), Telegram Desktop reactions.cpp (FLOOD_WAIT guard).

**Тесты** (+32 unit): accountOrder (13: load/save/applyOrder/moveAccount/clamp), formatTypingUsers (11: 1/2/3/4+ user, истёкшие, пустое имя), reactionThrottle (8: leading-edge, разные key, спам→1 вызов).

**НЕ менялось**: backends/tdlibBackend.js, tdlibMapper.js, main процесс остальное, реакции v0.95.29 (throttle wrapper), тема v0.95.30, markRead (v0.87.41/v0.95.26), Schmitt-trigger (v0.95.2), useNewBelowCounter (v0.95.28).

**Регрессия**: lint 0, vitest +32, fileSizeLimits ✅, check-memory ✅.
