# Features Archive — v0.95.38

Критичный фикс «дубля сообщений» через обработку TDLib `updateMessageSendSucceeded`. Стабилизировано v0.95.40+.

---

### v0.95.38 — Фикс дубля сообщений + ⏳ индикатор + регресс-тесты dedup

Корень: tdlibClient НЕ обрабатывал `updateMessageSendSucceeded` → после ACK provisional id (huge) и финальный (12345) → 2 копии в DOM.

Добавлены case `updateMessageSendSucceeded` + `updateMessageSendFailed` → emit `message:send-succeeded` → IPC `tg:send-succeeded` → store.handler `findIndex(m.id === oldId)` + replace.

Эталоны: tweb applyMessageUpdate, Telegram Desktop History::idChanged().

⏳ индикатор: 3 состояния check-mark — `isSending=true` → ⏳ / `isRead=true` → ✓✓ / иначе → ✓ (MessageBubble.jsx).

Static guard F. в modernPatternsGuard: 4 handler-файла ОБЯЗАНЫ ссылаться на mistakes/outgoing-two-cases.md.

**Тесты** +7: send-succeeded replace, oldId not found no-op, ghost chatId, dedup tg:new-message, bridge emit.
**Конфликты ✅**: contiguity / unreadCount / seenOutgoingIds / send-scroll-done не задевается.

**Регрессия**: lint 0, vitest 930/930, fileSizeLimits 316/316, check-memory ✅.
