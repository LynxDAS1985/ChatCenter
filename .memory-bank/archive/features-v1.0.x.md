# Архив changelog v1.0.1 – v1.0.7

Заархивировано 11 июня 2026 (при выпуске v1.1.7) для соблюдения лимита 100 КБ на `features.md`.

---

### v1.0.7 — UI bulk-операции (Tasks) + snooze (Reminders)

TasksPanel: чекбоксы + bulk-toolbar (Готово/Удалить/Снять) когда выбрано. RemindersPanel: 4 кнопки snooze (💤 10м/30м/1ч/2ч) для status='fired'. Используют v1.0.5 IPC. Лимит renderer 25400 → 25600.

---

### v1.0.6 — Search: filter (тип медиа) + pagination + fan-out по аккаунтам

`tdlibBackend.messages.search` расширен:
- **filter**: `photo/video/document/audio/voice/url/mention/pinned/...` — мап в TDLib `searchMessagesFilter*`. Unknown → fallback `searchMessagesFilterEmpty`.
- **fromMessageId**: пагинация через `next_from_message_id` от TDLib. Возврат: `{nextFromMessageId, hasMore}`.
- **fanOut**: при отсутствии chatId/accountId — параллельный invoke по ВСЕМ аккаунтам (Promise.all), результаты merged + sorted DESC по timestamp.

`searchMessagesSchema` (tool schema): добавлены `filter` (enum), `fromMessageId` (string), `fanOut` (boolean). Адаптер `aiAgentBackendAdapter.searchMessages` пробрасывает эти опции в backend.

Тесты: +7 на messages.search (filter маппинги, pagination, fanOut, hasMore) + +2 на adapter. Всего 1339 ✅.

---

### v1.0.5 — Tasks bulk + Reminders snooze

- `tasks:bulk-complete` / `tasks:bulk-delete` — массовые операции (Set lookup, save один раз, возвращают `updated`/`removed` count).
- `reminders:snooze` — создаёт НОВЫЙ pending reminder с +N минут, помечает оригинал `snoozedAt`/`snoozedToId`. Валидация minutes ∈ (0, 1440].
- Renderer store wrappers: `bulkCompleteTasks`, `bulkDeleteTasks`, `snoozeReminder`.
- Тесты: +15 main-side (с vi.hoisted мок fs/ipcMain) + +9 renderer-store. Всего 1328 ✅.

---

### v1.0.4 — AI стабильность: AbortSignal + confirm timeout + read retry

`aiToolExecutor.runAgentLoop` принимает: `signal` (AbortSignal — выход из цикла при abort), `confirmTimeoutMs` (default 5 мин — auto-deny если юзер не ответил, audit `permissionResult: 'confirm_timeout'`), `readRetryCount` (default 1 — ретрай для `category: 'reading'` tools при throw, безопасно потому что read idempotent). Write/navigation НЕ ретраятся (риск дубля). +13 unit-тестов. Регрессия ✅.

---

### v1.0.3 — UX: Esc для модалок Phase 4 + mutually-exclusive

PanelModal: `useEffect` с `window.keydown` listener → Esc вызывает onClose. App.jsx: 3 state сведены в один `openPanel` — открытие одной модалки закрывает остальные. +7 тестов. Регрессия ✅.

---

### v1.0.2 — TDLib backend для AI tools (реальная интеграция)

До v1.0.2 AI агент работал **«в никуда»**: `setAgentDeps` передавал `tdlibBackend` напрямую (домены `messages.get/send/markRead`), а `aiAgentSetup` ожидал плоский интерфейс. Сигнатуры не совпадали → fallback.

- **`main/ai/aiAgentBackendAdapter.js`** — адаптер, оборачивает домен-объект. Конвертирует `beforeMessageId` → `offsetId`, `replyToMessageId` → 3-й арг send, `messageId` → `id`. Graceful fallback.
- **`tdlibBackend.messages.search`** — TDLib `searchChatMessages` (с chatId) / `searchMessages` (глобальный). Лимит [1, 100]. Для глобального автосшивка `chatId = accountId:rawId`.
- **`main/main.js`** — `setAgentDeps({ tdlibBackend: createAiAgentBackendAdapter(r.backend), ... })`.
- **+30 тестов** (24 адаптер + 6 search). Регрессия: lint, vitest 1285 ✅, fileSizeLimits 392/392 ✅.

---

### v1.0.1 — UI интеграция Phase 4 панелей (Задачи / Напоминания / AI Activity)

3 иконки справа в TabBar открывают модалки с панелями Phase 4 (созданы в v1.0.0, не подключены к UI):
📝 Задачи (#f59e0b) + badge активных · ⏰ Напоминания (#eab308) + badge pending · 📊 AI Activity (#ec4899).

**Новое**: `src/hooks/useAppCounters.js` (опрос tasks:list/reminders:list каждые 30 сек + событие `tasks:changed`/`reminders:changed`), `src/components/PanelModal.jsx` (overlay + ✕ обёртка). `TabBar.jsx` HeaderButton поддерживает `badge` prop (красный кружок 14×14, "99+" max).

**Поведение**: клик по записи задачи/напоминания с source → handleGoToSource → закрывает модалку + setActiveId(NATIVE_CC) + setPendingNativeNotify (тот же путь что notify:clicked).

**Лимиты**: App.jsx exception 880→940. Регрессия: lint, vitest, fileSizeLimits ✅.
