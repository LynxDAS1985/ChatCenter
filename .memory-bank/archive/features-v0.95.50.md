# v0.95.50 — Откат v0.95.49 (followup re-apply restore)

**Юзер**: «убери это, откатай и забудь пока что».

Откат всех изменений v0.95.49 (followup re-apply scrollTop + userScrolledRef):
- `src/native/hooks/useInitialScroll.js`: убран параметр userScrolledRef + followup re-apply ветка → возвращена прежняя логика (no-op в followup).
- `src/native/modes/InboxMode.jsx`: убран userScrolledRef + reset + проброс.
- `src/native/components/InboxChatPanel.jsx`: убран prop + убраны изменения в onWheel/onTouchStart/onPointerDown.
- 2 unit-теста v0.95.49 удалены. Лимиты возвращены к прежним значениям.

**Что НЕ откатано**: v0.95.47 (emoji fallback + диагностические логи) и v0.95.48 (jump-to-message паттерн) остаются в коде — они в текущей версии работают.

**Регрессия**: lint, vitest, fileSizeLimits, check-memory ✅.
