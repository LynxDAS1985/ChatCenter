# Архив features.md — v0.95.19 – v0.95.22

Архивировано: 1 июня 2026 (при выпуске v0.95.26 — features.md перевалил 100 КБ).

Содержит 4 версии: диагностика tg-new-message + tg-messages-applied (v0.95.19), финал саги jump-to-end (v0.95.20), бейдж форум-группы (v0.95.21), форум-overlay (v0.95.22). Все стабилизированы и работают.

---

### v0.95.22 — Форум-панель как overlay (scroll списка чатов сохраняется) + Escape

Юзер: «когда переходу в форум и закрываю потом, список чатов оказался в самом верху, а надо чтобы не двигался».

**Корень**: в [InboxChatListSidebar.jsx](../../src/native/components/InboxChatListSidebar.jsx) был `if (forumChat) { return <forum-panel/> }` — early return полностью заменял список чатов на форум-панель. При свитче React размонтировал `react-window List` (нет stable reconciliation между разными root divs), внутренний scrollable div пересоздавался со `scrollTop=0`.

**Решение** (overlay-паттерн, как Telegram Web K / Desktop / iOS): убрать early return, рендерить список чатов **всегда** внутри общего wrapper `<div style={position:relative}>`, форум-панель — поверх как `position: absolute; inset: 0; zIndex: 1`. List **никогда не размонтируется** — его внутренний scrollTop сохраняется автоматически в DOM.

**Дополнительно — Escape через focus-pattern**: форум-overlay получает `tabIndex={-1}` + `onKeyDown` (Escape → `closeForumTopics`) + autofocus при mount. Локальный обработчик — срабатывает ТОЛЬКО когда фокус на форум-панели. Глобальный `window.addEventListener('keydown')` создал бы конфликт с другими Escape-handlers.

**Эталоны** (production messengers 2026):
- Telegram Web K (`tweb`) — `ForumTab` рендерится как secondary tab внутри left-column, dialog-list всегда в DOM
- Telegram Desktop — `Window::Forum` overlay layer над `DialogsWidget`
- iOS Telegram — Forum overlay через UINavigationController push

**Тесты**: 11 unit-тестов в [InboxChatListSidebar.vitest.jsx](../../src/native/components/InboxChatListSidebar.vitest.jsx) — регрессионная защита overlay-архитектуры (static analysis).

**Регрессия**: lint 0, vitest +11 новых, fileSizeLimits, check-memory ✅.

---

### v0.95.21 — Бейдж форум-группы: число тем с непрочитанным (как Telegram Desktop)

Юзер: бейдж форум-чата «Un1c4d3 Support» у нас = `6.2K`, в Telegram Web того же чата = `2`. Темы Q/D=3, General=7, остальные 0.

**Корень**: для форум-групп TDLib `chat.unread_count` агрегирует ВСЮ историю по всем темам (включая никогда не открытые) — огромные числа без UX-смысла. Telegram Desktop / Web показывают **число тем с unread > 0**.

**Решение** (UI-override, без правки store-state): новый чистый util [`displayUnread.js`](../../src/native/utils/displayUnread.js) — `getDisplayUnreadCount(chat, forumTopics)`. Для `isForum=true` считает `topics.filter(t => t.unreadCount > 0).length` из `store.forumTopics[chatId]`.

**Где**: [ChatListItem](../../src/native/components/ChatListItem.jsx) новый prop `displayUnreadCount` (fallback на `chat.unreadCount`). [ChatRow](../../src/native/components/ChatRow.jsx) вызывает util. [InboxChatListSidebar](../../src/native/components/InboxChatListSidebar.jsx) пробрасывает `store.forumTopics`.

**Тесты**: 12 unit в [displayUnread.vitest.js](../../src/native/utils/displayUnread.vitest.js) — обычный/форум, с темами/без, edge cases.

---

### v0.95.20 — Load-first гейт для кнопки ↓ (финал саги jump-to-end)

Юзер: «надо что бы точно все загрузило а потом перешло вниз... тупь будет задержка, это не страшно».

**Корень**: в [InboxMode.scrollToBottom](../../src/native/modes/InboxMode.jsx) был гейт `unreadVsLoaded > 50` — load-first ветка срабатывала только при большом числе непрочитанных. Если у юзера 10 непрочитанных, но gap=200 — fallback `scrollTo(scrollHeight)` → сообщения дописывались после.

**Решение**: новый чистый util [`jumpToEndGate.js`](../../src/native/utils/jumpToEndGate.js) — `computeJumpToEndGate({lastMessageId, gapMessages, loading})` возвращает `true` если `gapMessages > 0` (любой разрыв) + не идёт загрузка + есть lastMessageId. Эталон — Telegram Desktop `HistoryWidget::cornerButtonsShowAtPosition`, Telegram Web K `ChatBubbles.onGoDownClick`.

**Сценарий 5000 непрочитанных**: клик ↓ → ~0.2–2 сек итеративный fetch 100 последних → rAF×2 → twoPhase smoothScroll → mark-read до lastMessageId → счётчик 0. Остальные 4900 НЕ грузятся (как у Telegram Desktop), подгрузятся через load-older.

**Тесты**: 14 unit в [jumpToEndGate.vitest.js](../../src/native/utils/jumpToEndGate.vitest.js).

**Сага закрыта** — полная история v0.95.11→v0.95.20 в [jump-to-end-saga.md](../jump-to-end-saga.md).

---

### v0.95.19 — Диагностика «новые сообщения не приходят» (без смены поведения)

Юзер: «в TG есть новые сообщения, а у нас старые видно».

Чтобы **точно** найти корень — добавили **полную диагностику** входящих сообщений в [nativeStoreIpc.js](../../src/native/store/nativeStoreIpc.js). Без смены поведения.

**Новые события в логе**:
- `tg-new-message` (каждое сообщение через push) — chatId, msgId, action ('inserted' / 'updated' / 'skipped-non-contiguous'), existing, newestLoaded, gapMessages (оценка), isContiguous, isDup, isActiveChat, isOutgoing, mediaType, ts
- `tg-messages-applied` (каждый batch от backend) — chatId, action ('replaced' / 'prepended-old' / 'appended-newer' / 'appendNewer-empty-noop'), incoming, existingBefore, nextLen, oldestIncoming/newestIncoming, oldestNext/newestNext

**Что НЕ изменено**: tg:new-message поведение, tg:messages обработка, защиты v0.94.7/v0.95.0.

Регрессия: lint 0, vitest 756/756, fileSizeLimits 287/287, check-memory ✅.

**Следующий шаг** — после сессии юзера: точный фикс по реальным данным (выполнено в v0.95.20 — load-first гейт через gapMessages > 0).
