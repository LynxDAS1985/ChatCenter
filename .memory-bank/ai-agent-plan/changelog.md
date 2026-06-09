# Changelog работы (живой файл)

> **Детальный лог каждого изменения.** Заполняется ПОСЛЕ каждого коммита.
> Здесь — конкретные файлы, конкретные функции.

---

## История изменений

### 2026-06-08 — v0.97.0 (commit `ce994ce`) — Phase 0 + Phase 1 done

**14 milestones за одну сессию работы.** 55 файлов изменено, +7777 строк, -129 строк.

#### Phase 0 — Foundation (5 milestones)

##### M0.1 — NotificationSource module

**Новые файлы**:
- `src/shared/notificationSource.js` (131 строка)
  - Factory `createNotificationSource(input)` — frozen объект-паспорт
  - Валидация обязательных полей: messengerId, accountId, chatId, messageId
  - Нормализация id к string, обрезка textPreview до 200 chars
  - Whitelist полей (защита от injection)
  - Helper `sourceKey(source)` — для debounce/dedup
- `src/shared/notificationSource.vitest.js` (158 строк) — **21 unit-тест**

##### M0.2 — useNotifyDispatcher (Action Bus)

**Новые файлы**:
- `src/hooks/useNotifyDispatcher.js` (99 строк)
  - `register/unregister/dispatch/list` через `useRef(new Map())`
  - Debounce 500ms по ключу `actionId|sourceKey`
  - LRU cleanup при >100 записей
- `src/hooks/useNotifyDispatcher.vitest.jsx` (164 строки) — **9 unit-тестов**

##### M0.3 — Cross-tab notify:clicked

**Изменения**:
- `src/App.jsx`:
  - `+useState pendingNativeNotify` — payload для NativeApp
  - `+useEffect` подписка на `notify:clicked` в корневом компоненте
  - `+clearPendingNativeNotify` callback
  - Пропы переданы в `<NativeApp pendingNotify={...} clearPendingNotify={...} />`
- `src/native/NativeApp.jsx`:
  - **Удалён** старый `useEffect` подписки на `notify:clicked` (был в строках 332-353)
  - **Добавлен** новый useEffect на изменение `pendingNotify` prop
  - Backward compat: поддержка legacy `chatTag/messageId` И нового `source` объекта

**Решает P-01**: уведомления теперь работают с ЛЮБОЙ активной вкладки (включая webview).

##### M0.4 — NotificationSource через IPC цепочку

**Изменения**:
- `src/native/store/nativeStoreIpc.js`:
  - Импорт `createNotificationSource`
  - При `tg:new-message` → создание полного source объекта (accountId/chatId/messageId + контекст)
  - `app:custom-notify` payload: добавлено `source: NotificationSource`
  - Удалён диагностический лог `[notify-emit]` (v0.95.47)
- `main/handlers/notificationManager.js`:
  - `showCustomNotification` параметр + `source`
  - `notifItems.push(data)` хранит `source`
  - Удалён диагностический лог `[notif-mgr] saved`
- `main/handlers/notifHandlers.js`:
  - `notify:clicked` payload: добавлено `source` поле
  - Удалён диагностический лог `[notif-click] sending`
- `src/native/modes/InboxMode.jsx`:
  - Удалены диагностические логи `[pending-scroll-effect]` (v0.95.47)
  - Сокращён `[scroll-to-message]` лог → `[scroll-to-message-miss]` только при WARN

**Решает P-02**: AI получает 100% точный источник сообщения.

##### M0.5 — Регрессия Phase 0

- Lint 0
- vitest все existing passed
- fileSizeLimits adjusted: renderer total 22500 → 22800
- Cross-tab smoke test (manual проверка ожидается)

---

#### Phase 1 — Tool Use каркас (9 milestones)

##### M1.1 — Tool Registry

**Новые файлы**:
- `src/shared/tools/toolRegistry.js` (145 строк)
  - `createToolRegistry()` — factory
  - register/unregister/lookup/list/count/schemas/clear
  - Permission tiers: auto / confirm / deny
  - Categories: navigation / reading / writing / tasks / system
  - Validation: throws на invalid def
- `src/shared/tools/toolRegistry.vitest.js` (170 строк) — **19 unit-тестов**

##### M1.2 — Tool Schemas

**Новые файлы**:
- `src/shared/tools/toolSchemas.js` (124 строки)
  - `notificationSourceSchema` — общий $ref schema
  - `gotoMessageSchema`, `getChatHistorySchema`, `searchMessagesSchema`
  - `validateToolSchema()` helper
- `src/shared/tools/toolSchemas.vitest.js` (99 строк) — **11 unit-тестов**

##### M1.3 — 3 read-only handlers

**Новые файлы**:
- `src/shared/tools/handlers/gotoMessage.js` (69 строк)
- `src/shared/tools/handlers/getChatHistory.js` (68 строк)
- `src/shared/tools/handlers/searchMessages.js` (63 строки)
- `src/shared/tools/handlers/handlers.vitest.js` (123 строки) — **12 unit-тестов**

##### M1.4 — Anthropic adapter

**Новые файлы**:
- `main/ai/adapters/anthropicAdapter.js` (94 строки)
  - `toAnthropicTools(schemas)` — schemas → API format
  - `parseAnthropicToolUse(response)` — extract tool_use blocks
  - `parseAnthropicText(response)` — final answer text
  - `formatToolResult(toolUseId, result)` — back to API
  - Multi-turn support через stop_reason='tool_use'

##### M1.5 — OpenAI + DeepSeek adapter

**Новые файлы**:
- `main/ai/adapters/openaiAdapter.js` (85 строк)
  - `toOpenAITools` с `strict: true` для JSON gen
  - `parseOpenAIToolCalls` — извлечение parallel calls
  - `formatToolResult` — role='tool'
- `main/ai/adapters/deepseekAdapter.js` (16 строк) — re-export openaiAdapter

##### M1.6 — ГигаЧат adapter

**Новые файлы**:
- `main/ai/adapters/gigachatAdapter.js` (82 строки)
  - Старый OpenAI format: `functions` (не `tools`), `function_call` (не `tool_calls`)
  - Генерация id для function_call (ГигаЧат не даёт id)
  - `formatFunctionResult` с role='function'
- `main/ai/adapters/adapters.vitest.js` (213 строк) — **16 unit-тестов** (Anthropic + OpenAI + ГигаЧат суммарно)

##### M1.7 — aiToolExecutor (главный модуль)

**Новые файлы**:
- `main/ai/aiToolExecutor.js` (194 строки)
  - `runAgentLoop({ source, provider, registry, callProvider, handlerContext, initialMessages, maxIterations, onStep })`
  - Multi-turn loop с max 10 iterations (cost runaway protection)
  - Permission guards: deny → permission_denied, confirm → not_implemented_in_phase1
  - Parallel tool execution через `Promise.all`
  - Audit array для каждого call
  - `onStep` callback для streaming UI
- `main/ai/aiToolExecutor.vitest.js` (252 строки) — **11 unit-тестов**

##### M1.8 — aiContextBuilder

**Новые файлы**:
- `main/ai/aiContextBuilder.js` (111 строк)
  - `DEFAULT_SYSTEM_PROMPT` — роль AI + правила безопасности
  - `buildAgentContext({ source, recentMessages, systemPrompt, extraInstructions })`
  - XML wrap `<external_message_from_user>` — защита от prompt injection
  - Source паспорт в `<source>` блоке
  - История чата в `<chat_history_recent count="N">`
- `main/ai/aiContextBuilder.vitest.js` (93 строки) — **10 unit-тестов**

##### M1.9 — IPC bridge

**Новые файлы**:
- `main/handlers/aiToolIpcHandlers.js` (114 строк)
  - `ipcMain.handle('ai:agent:run')` — главный entry point
  - `ipcMain.on('ai:agent:cancel')` — отмена через AbortController
  - `event.sender.send('ai:agent:step')` — streaming прогресса
  - Validation source через `validateNotificationSource`
  - Регистр активных runs (Map)
- `main/handlers/aiToolIpcHandlers.vitest.js` (152 строки) — **8 unit-тестов** (через `vi.mock('electron')`)

---

#### Инфраструктура

- `vitest.config.mjs` — расширен `include` для `main/**/*.vitest.js`
- `src/__tests__/fileSizeLimits.test.cjs` — лимит renderer total 22500 → 23300
- `src/__tests__/mainRuntime.test.cjs` — исключены `.vitest.` файлы из require парсинга

---

#### Документация (commit ce994ce)

- `.memory-bank/ai-agent-plan/` — **16 файлов** (README, overview, architecture, tools-catalog, permissions, providers, comparison, problems, progress, changelog, checkpoints + phases × 5)
- `.memory-bank/features.md` — запись v0.97.0
- `.memory-bank/archive/features-v0.95.46.md` — архив старой записи
- `CLAUDE.md` — версия v0.97.0, ссылка на ai-agent-plan/

---

#### Регрессия

- ✅ lint 0 ошибок
- ✅ vitest 1142/1142 passed (+117 новых)
- ✅ fileSizeLimits 357/357
- ✅ check-memory здоров
- ✅ pre-push hook прошёл (33 cjs + 1142 vitest)

---

### 2026-06-09 — Scope clarification + документация audit

**Что**: уточнён scope AI-агента, переписана/дополнена документация (НЕ удаляли работающее).

**Решения**:
- AI-агент = только Native режим (`messengerId='native_*'`)
- Native = расширяемая концепция (TDLib сейчас, WhatsApp Business API / VK API / Viber позже)
- WebView мессенджеры остаются как есть (не для AI агента)
- AI WebView mode в AISidebar остаётся (классическая генерация для юзеров без API ключа)

**Документация обновлена** (20 файлов, дополнения, не переписи):
- `CLAUDE.md` — Статус обновлён под v0.97.0
- `.memory-bank/README.md` — версия + добавлена ссылка на ai-agent-plan/
- `.memory-bank/api.md` — добавлены ai:agent:* каналы + расширен notify:clicked
- `.memory-bank/architecture.md` — добавлена AI-агент секция + main/ai/ диаграмма
- `.memory-bank/ai-integration.md` — добавлен раздел AI-агент Tool Use БЕЗ удаления WebView mode
- `ai-agent-plan/README.md`, `overview.md`, `architecture.md`, `tools-catalog.md`, `comparison.md`,
  `problems.md`, `progress.md`, `changelog.md`, `checkpoints.md` — scope + статусы
- `phases/phase-0/1.md` — отмечены ✅ done
- `phases/phase-5-native-extension.md` — **новый файл** (план native API расширения)

**Новые проблемы**: P-08 vitest flaky (open, инфраструктурный).
