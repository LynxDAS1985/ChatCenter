# Архив v0.97.0 — AI-агент фундамент Phase 0 + Phase 1

Заархивировано 11 июня 2026 при выпуске v1.1.11. Подробности реализации — в `phases/phase-0-notification-source-impl.md` и `phases/phase-1-tools-impl.md` (в `ai-agent-plan/`).

---

### v0.97.0 — AI-агент фундамент (Phase 0 + Phase 1)

**Цель**: Превратить пассивный AI-помощник (генерация текста) в активного агента который вызывает функции (Tool Use API). См. полный план: [.memory-bank/ai-agent-plan/](../ai-agent-plan/README.md).

**Phase 0 — фундамент уведомлений** (5 milestones):
- M0.1 **NotificationSource** (`src/shared/notificationSource.js`) — паспорт сообщения (messengerId/accountId/chatId/messageId/...). Frozen объект, факторная функция, валидация. **21 unit-тест**.
- M0.2 **useNotifyDispatcher** (`src/hooks/useNotifyDispatcher.js`) — Action Bus hook. register/unregister/dispatch + debounce 500ms. **9 unit-тестов**.
- M0.3 **Cross-tab notify:clicked** (`src/App.jsx` + `src/native/NativeApp.jsx`): подписка перенесена из NativeApp (unmount при не-native_cc) в корневой App.jsx. NativeApp принимает payload пропом pendingNotify. **Решена проблема P-01** из ai-agent-plan/problems.md.
- M0.4 **NotificationSource через IPC**: `nativeStoreIpc.js` создаёт source, `notificationManager.js` хранит, `notifHandlers.js` передаёт в notify:clicked. Backward compat: legacy chatTag/messageId остались. **Удалены диагностические логи v0.95.47** (notify-emit / notif-mgr saved / notif-click sending / native-notify-recv / pending-scroll-effect / scroll-to-message).
- M0.5 финал — проверки.

**Phase 1 — Tool Use каркас** (9 milestones):
- M1.1 **Tool Registry** (`src/shared/tools/toolRegistry.js`) — реестр с register/lookup/list/schemas. Permission tiers (auto/confirm/deny). **19 unit-тестов**.
- M1.2 **Tool Schemas** (`src/shared/tools/toolSchemas.js`) — JSON Schema для goto_message/get_chat_history/search_messages + notificationSourceSchema. **11 unit-тестов**.
- M1.3 **Handlers** (`src/shared/tools/handlers/`): gotoMessage/getChatHistory/searchMessages. **12 unit-тестов**.
- M1.4 **Anthropic Adapter** (`main/ai/adapters/anthropicAdapter.js`): toAnthropicTools/parseAnthropicToolUse/formatToolResult.
- M1.5 **OpenAI + DeepSeek Adapter** (`main/ai/adapters/openaiAdapter.js`) — DeepSeek полностью OpenAI-compatible.
- M1.6 **ГигаЧат Adapter** (`main/ai/adapters/gigachatAdapter.js`) — старый OpenAI format (functions, не tools). **16 unit-тестов на все adapters**.
- M1.7 **aiToolExecutor** (`main/ai/aiToolExecutor.js`) — main-side agent loop с max iterations 10, permission guards (deny → permission_denied, confirm → not_implemented_in_phase1), audit array. **11 unit-тестов**.
- M1.8 **aiContextBuilder** (`main/ai/aiContextBuilder.js`) — системный prompt + source паспорт + recent messages с XML-обёрткой (защита от prompt injection). **10 unit-тестов**.
- M1.9 **IPC bridge** (`main/handlers/aiToolIpcHandlers.js`) — ai:agent:run/cancel + ai:agent:step стриминг. **8 unit-тестов**.

**Эталоны** (3 источника официальной документации):
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use) — нативный tool_use API.
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling) — JSON Schema standard.
- [DeepSeek Function Calling](https://api-docs.deepseek.com/guides/function_calling) — OpenAI-compatible.

**Тесты** +117 (Phase 0: 30 + Phase 1: 87). Регрессия: lint 0, vitest **1142/1142**, fileSizeLimits, check-memory ✅.

**ВАЖНО**: AI-агент UI кнопка «🤖 Обработать» появится в Phase 3 (см. план). Сейчас агент доступен только через консоль для разработки. AI write-actions (reply_to_message) — в Phase 2 (требует permission UI).
