# Features Archive — v0.95.42

Сохранение поиска + история + ✕ + подсветка совпадений. UI-only, стабилизировано в v0.95.43+.

---

### v0.95.42 — Сохранение поиска + история + ✕ + подсветка совпадений

4 фичи поиска. UI-only (без backend/store/scroll). Эталоны: tweb appSearchManager, Slack global search, VS Code Find.

- **Сохранение query** ([searchHistory.js](src/native/utils/searchHistory.js) NEW): `localStorage['cc-chat-search']`. [InboxMode.jsx](src/native/modes/InboxMode.jsx) `useState(() => loadCurrentSearch())` + debounced save 300мс.
- **Кнопка ✕** [InboxChatListSidebar.jsx](src/native/components/InboxChatListSidebar.jsx): absolute справа при `length > 0`. Escape → clear.
- **История 20 запросов**: `localStorage['cc-chat-search-history']`. `addToHistory` дедуп case-insensitive + FIFO. Enter → commit. Dropdown при focus+empty. ✕ на элементе → removeFromHistory. «Очистить» → clearHistory.
- **Подсветка совпадений** ([searchHighlight.js](src/native/utils/searchHighlight.js) NEW + [HighlightedText.jsx](src/native/components/HighlightedText.jsx) NEW): regex `gi` с escape, `<mark>` с accent. [ChatListItem.jsx](src/native/components/ChatListItem.jsx) использует для title/lastMessage.

**Конфликты ✅**: UI-only, 0 изменений backend/store. **Граничные случаи ✅**: пустой → нет mark / >200 chars → trim / ReDoS → escape / private mode → try/catch / дубль → dedup / overflow → FIFO 20 / невалидный JSON → [].

**Тесты** (+24): searchHistory +13, searchHighlight +11.

**Регрессия**: lint 0, vitest 975/975, fileSizeLimits 325/325, check-memory ✅.

---
