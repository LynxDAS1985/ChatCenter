# 📸 Текущее состояние ChatCenter — v1.1.4 (9 июня 2026)

> Снапшот: что готово, что работает, что отложено. Используй этот файл когда возвращаешься к проекту после перерыва — он даёт цельную картину за 5 минут.

---

## 🎯 За один абзац

ChatCenter — Electron-приложение для управления чатами через TDLib (Telegram) + WebView (WhatsApp / VK / etc) с **AI-агентом**. После 12 версий (v0.96.0 → v1.1.4) **AI-агент функционально полный**: умеет читать чаты, искать сообщения, отправлять ответы (с подтверждением или авто), отмечать прочитанным, создавать задачи и напоминания. Поддерживает 4 провайдера (Anthropic / OpenAI / DeepSeek / ГигаЧат) с автоматическим резервированием. Auto-reply правила позволяют AI работать самостоятельно по триггерам.

---

## 🏗 Архитектура — 1 диаграмма

```
┌────────────────────────────────────────────────────────────────────┐
│                       RENDERER (src/)                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ App.jsx — корневой роутер                                     │  │
│  │  ├─ TabBar — 4 messenger вкладки + 8 иконок в шапке:         │  │
│  │  │    🔍 поиск · 🤖 AI sidebar · 📋 шаблоны · ⚡ авто-ответ    │  │
│  │  │    📝 задачи³ · ⏰ напоминания¹ · 📊 AI Activity · 🤖⚡ правила│  │
│  │  ├─ NativeApp (TDLib) — для вкладки «ЦентрЧатов»              │  │
│  │  ├─ webview — для остальных мессенджеров                      │  │
│  │  ├─ AISidebar (manual AI agent — кнопка «🤖 AI» в notif)      │  │
│  │  └─ Модалки: Задачи / Напоминания / Activity / Правила        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                                ↕ IPC (60+ каналов)
┌────────────────────────────────────────────────────────────────────┐
│                       MAIN (main/)                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ TDLib                                                         │  │
│  │  ├─ tdlibClient (events: message:new, chat updates, etc)     │  │
│  │  ├─ tdlibBackend (domain API: messages.get/send/search/...)  │  │
│  │  └─ tdlibIpcBridge (manager events → IPC channels)           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ AI agent (Phase 0-3 + Phase 4.3)                              │  │
│  │  ├─ aiToolExecutor — main agent loop (max 10 iter)           │  │
│  │  │   + autoConfirm + actor + abort signal + retry             │  │
│  │  ├─ aiPermissionGuard — HARDCODED_CONFIRM/DENY + scope        │  │
│  │  ├─ aiProviderCaller — 4 провайдера (+ ГигаЧат с v1.1.4)     │  │
│  │  ├─ aiProviderFallback — multi-provider retry chain           │  │
│  │  ├─ aiAgentBackendAdapter — плоский интерфейс для tools       │  │
│  │  ├─ aiContextBuilder — XML защита от prompt injection        │  │
│  │  ├─ Adapters: anthropic / openai / deepseek / gigachat       │  │
│  │  ├─ autoReplyEngine — pure matchRule (8 проверок)            │  │
│  │  ├─ autoReplyDispatcher — manager.on('message:new') → trigger │  │
│  │  │   + 4 уровня защиты от петель                              │  │
│  │  └─ 8 tool handlers (goto/history/search/reply/markRead/      │  │
│  │      createTask/listTasks/scheduleReminder)                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Persistent JSON storage (userData/)                           │  │
│  │  ├─ tasks.json — Phase 4 (atomic write + cache)              │  │
│  │  ├─ reminders.json + setTimeout scheduler                     │  │
│  │  ├─ auto-reply-rules.json                                     │  │
│  │  └─ audit-log/YYYY-MM.jsonl (JSON Lines, no IPC roundtrip)   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Что готово — по фазам

| Фаза | Версия | Документ | Что |
|---|---|---|---|
| **Phase 0** | v0.96.0 | [phase-0-notification-source-impl.md](./phases/phase-0-notification-source-impl.md) | NotificationSource паспорт + Action Bus + cross-tab fix |
| **Phase 1** | v0.97.0 | [phase-1-tools-impl.md](./phases/phase-1-tools-impl.md) | 8 tools + 3 провайдера tool use (Anthropic / OpenAI / DeepSeek) |
| **Phase 2** | v0.98.0 | [phase-2-permissions-write-impl.md](./phases/phase-2-permissions-write-impl.md) | Permission Guard + Write tools + ConfirmModal + Audit Log |
| **Phase 3** | v0.99.0 + v0.99.1 | [phase-3-agent-ui-impl.md](./phases/phase-3-agent-ui-impl.md) | «🤖 AI» кнопка в notif + AISidebarAgent streaming UI |
| **Phase 4a** | v1.0.0 | [phase-4a-tasks-reminders-impl.md](./phases/phase-4a-tasks-reminders-impl.md) | Tasks + Reminders + AI Activity Dashboard (stores + IPC + UI) |
| **Phase 4b** | v1.0.1 | [phase-4b-ui-integration-impl.md](./phases/phase-4b-ui-integration-impl.md) | UI интеграция Phase 4 в шапку (📝 ⏰ 📊) |
| **Phase 4c** | v1.0.2 | [phase-4c-tdlib-real-backend-impl.md](./phases/phase-4c-tdlib-real-backend-impl.md) | TDLib backend adapter — реальная работа AI tools |
| **Мелкие TODO** | v1.0.3-1.0.7 | features.md (без отдельного impl — мелочи) | Esc, AbortSignal, bulk, snooze, search filter/pagination, UI snooze |
| **Phase 4.3** | v1.1.0-1.1.3 | [phase-4-3-auto-reply-impl.md](./phases/phase-4-3-auto-reply-impl.md) | AI auto-reply правила (полный pipeline: foundation → integration → hardening) |
| **ГигаЧат tool use** | v1.1.4 | [phase-gigachat-tool-use-impl.md](./phases/phase-gigachat-tool-use-impl.md) | 4-й полноправный AI провайдер |

---

## 🔢 Цифры

| Метрика | v0.95.50 (до Phase 0) | v1.1.4 (сейчас) | Δ |
|---|---|---|---|
| Unit-тестов | ~1100 | **1458** | +358 |
| Tools для AI | 0 | 8 | +8 |
| AI провайдеров для tool use | 0 | 4 | +4 |
| AI auto-reply правил | нет | поддерживается | новая фича |
| Защиты от петель | — | 4 уровня | новая защита |
| Audit log | нет | JSONL по месяцам | новая фича |
| **Файлов *-impl.md** | 0 | **9** | +9 |

---

## 🛡 Безопасность — что гарантировано

| Гарантия | Где реализовано |
|---|---|
| AI не отправит сообщение без подтверждения (ручной режим) | `aiPermissionGuard.HARDCODED_CONFIRM_TOOLS` + AIConfirmModal с 3-сек задержкой |
| AI не вызовет deny tools (delete/leave/block) **никогда** | `HARDCODED_DENY_TOOLS` + проверка в начале checkPermission, не override-able |
| AI работает только в native_* (TDLib) | Permission Guard scope check — webview мессенджеры заблокированы для write |
| AI не отвечает на свои сообщения | `excludeOutgoing: true` (default) в engine + ранний exit в dispatcher |
| AI не дублирует ответ юзера | Smart cooldown (v1.1.3) — 10 мин после `isOutgoing=true` |
| AI не залупится сам с собой | 4 уровня: master / outgoing / rule cooldown / dispatcher loop+rate |
| API ключи не в renderer | `electron-store` в main process, никогда не в renderer |
| HARDCODED_DENY обходится autoConfirm? | НЕТ. `permission_denied` → throw до handler |
| ГигаЧат SSL bypass = MITM риск? | Используется только для `gigachat.devices.sberbank.ru` через `httpsPostSkipSsl` |

---

## 🎬 Поток типичного действия

### Сценарий A: Юзер кликает «🤖 AI» в уведомлении (ручной)

```
1. TDLib: пришло сообщение → main создаёт NotificationSource паспорт
2. Notification BrowserWindow показывает ribbon с кнопкой «🤖 AI»
3. Юзер кликает «🤖 AI»
4. main → mainWindow.send('ai:agent:invoke-from-notify', {source})
5. App.jsx: setActiveId('native_cc') + setShowAI(true) + setPendingAiInvocation
6. AISidebarAgent монтируется → start() → ai:agent:run IPC
7. main.aiToolIpcHandlers → executor.runAgentLoop({
     source, provider: settings.aiProvider, callProvider: callProviderFn,
     registry: 8 tools, onStep, onConfirmRequest
   })
8. Loop:
   - LLM call → response с tool_use
   - Permission check
   - confirm-required? → AIConfirmModal (3 сек задержка) → юзер OK
   - tool.handler(source, args, context) → реальный TDLib через adapter
   - Audit append
   - LLM call с tool_result
9. Финал: AI отвечает текстом «Готово, отправлено».
10. AISidebarAgent показывает результат.
```

### Сценарий B: Auto-reply правило сработало (автомат)

```
1. TDLib: пришло сообщение от клиента
2. tdlibClient.emit('message:new', {chatId, message})
3. autoReplyDispatcher.processNewMessage(payload):
   - isMasterEnabled() — если false → master_disabled, EXIT
   - isOutgoing? → markUserReplied(chatId) + EXIT (smart cooldown)
   - rules = getCachedRules() (in-memory)
   - findMatchingRules → [...matched]
   - canAutoReply: chat_loop / global_rate / user_replied_recently
4. Для первого matched rule:
   - markUserReplied/lastReplyByChat (loop protection)
   - action='mark_read' → context.markAsRead напрямую (без AI)
   - action='ai_reply' → runAgent({actor:'ai_auto', autoConfirm:true, prompt+hint})
5. Multi-provider fallback (если несколько настроены):
   - chain = [active, ...others with creds]
   - Anthropic 503 → пробуется OpenAI → ... → ГигаЧат
6. Audit log: appendAuditRecord({actor:'ai_auto', ruleId, ruleName, durationMs})
7. markRuleMatched(rule.id) → matchedCount++, lastMatchedAt=now
```

---

## 📁 Где что лежит

### Renderer (`src/`)
| Папка | Что |
|---|---|
| `components/` | UI: AISidebar, AIConfigPanel, AIAutoReplyRules, TasksPanel, RemindersPanel, AIActivityDashboard, AIConfirmModal, PanelModal |
| `hooks/` | useAppCounters, useAIAgent, useNotifyDispatcher и др. |
| `shared/notificationSource.js` | Паспорт сообщения (frozen object) |
| `shared/tools/handlers/` | 8 tool handlers (pure functions) |
| `shared/tools/toolRegistry.js` | Реестр tools |
| `shared/tools/toolSchemas.js` | JSON Schema 2020-12 для tools |
| `stores/` | Renderer-side IPC wrappers: taskStore, reminderStore, auditStore, autoReplyRulesStore |
| `App.jsx` | Корневой компонент |

### Main (`main/`)
| Папка | Что |
|---|---|
| `ai/aiToolExecutor.js` | Agent loop (max 10 iter + signal/timeout/retry/autoConfirm) |
| `ai/aiPermissionGuard.js` | HARDCODED + scope + user override |
| `ai/aiProviderCaller.js` | 4 провайдера API call (fetch + httpsPostSkipSsl для ГигаЧата) |
| `ai/aiProviderFallback.js` | Multi-provider retry chain (v1.1.3) |
| `ai/aiAgentBackendAdapter.js` | Плоский интерфейс для tools над tdlibBackend (v1.0.2) |
| `ai/aiContextBuilder.js` | Сборка system prompt + XML защита |
| `ai/aiAgentSetup.js` | Сборка handlerContext с deps |
| `ai/adapters/` | anthropic / openai / deepseek / gigachat — конвертация tools↔format |
| `ai/autoReplyEngine.js` | Pure functions matchRule (v1.1.0) |
| `ai/autoReplyDispatcher.js` | manager.on('message:new') → engine → runAgent (v1.1.1+) |
| `handlers/aiToolIpcHandlers.js` | IPC bridge для AI agent (ai:agent:run/cancel/confirm) |
| `handlers/taskIpcHandlers.js` | Persistent tasks.json + atomic write + bulk |
| `handlers/reminderIpcHandlers.js` | + setTimeout scheduler + snooze (v1.0.5) |
| `handlers/auditIpcHandlers.js` | JSONL append + appendAuditRecord export (v1.1.2) |
| `handlers/autoReplyRulesIpcHandlers.js` | CRUD правил + getCachedRules/markRuleMatched export |
| `native/backends/tdlibBackend.js` | Domain API (messages/chats/forum/media/customEmoji) |
| `utils/gigachat.js` | OAuth + SSL bypass для ГигаЧат (с v0.87.81) |
| `main.js` | Точка входа + initAutoReplyDispatcher с callProviderFn wrapper |

### Storage (`userData/`)
| Файл | Что |
|---|---|
| `tasks.json` | Список задач |
| `reminders.json` | Список напоминаний |
| `auto-reply-rules.json` | Список правил |
| `audit-log/YYYY-MM.jsonl` | Journal AI/user действий (по месяцам) |
| `settings.json` | electron-store: aiProvider, aiProviderKeys, aiAutoReplyMasterEnabled, ... |

---

## 🧪 Как проверить — короткий чек-лист

Подробный чек-лист: [testing-checklist-v1.1.4.md](./testing-checklist-v1.1.4.md).

**Минимальный smoke test после перезапуска**:
1. ✅ В шапке видны 4 новые иконки: 📝 ⏰ 📊 🤖⚡
2. ✅ Settings → AI → провайдер настроен + apiKey
3. ✅ AISidebar обычный чат — AI отвечает
4. ✅ В TDLib пришло уведомление → клик «🤖 AI» → AI читает историю + предлагает ответ + Confirm modal
5. ✅ Создал auto-reply правило (action=mark_read, keywords=тест) → master ВКЛ → отправил тест → отметилось прочитанным
6. ✅ 📊 AI Activity показывает actor=ai_auto оранжевым

Если всё ✅ — система здоровая.

---

## 🗺 Что дальше

См. [roadmap-deferred.md](./roadmap-deferred.md). Главные варианты:

| Команда | Что получится |
|---|---|
| **Phase 4.4 (Ollama)** | Локальный LLM — без интернета, конфиденциально. 2-3 ч. |
| **Phase 5.2 (VK)** | AI в VK. Самый простой из новых мессенджеров. 8-12 ч. |
| **Phase 5.1 (WhatsApp Business)** | AI в WhatsApp. Самый популярный. 10-15 ч. |
| **Мелкие задачи** | Hostname whitelist / dropdown моделей / Import-Export rules / etc — по 0.5-2 часа каждая |

---

## 📚 Все документы Phase 0-4.3+ГигаЧат

Структура папки [.memory-bank/ai-agent-plan/](.):

```
.
├── README.md                         — Главный индекс (есть ссылки на все impl)
├── overview.md                       — Концепция (5 фаз исходного плана)
├── architecture.md                   — Архитектура 3 уровней
├── tools-catalog.md                  — Каталог 8 tools
├── permissions.md                    — Permission tiers
├── providers.md                      — 4 AI провайдера
├── comparison.md                     — Сравнение со Slack AI / Cursor / Teams
├── problems.md                       — Журнал решённых проблем P-01..P-08
├── progress.md                       — Текущий статус (устарел — см. этот файл вместо)
├── changelog.md                      — Лог изменений
├── checkpoints.md                    — Workflow по фазам
├── roadmap-deferred.md               ⭐ NEW — Что отложено
├── testing-checklist-v1.1.4.md       ⭐ NEW — Чек-лист тестирования
├── current-state-v1.1.4.md           ⭐ NEW — Этот файл
└── phases/
    ├── phase-0-foundation.md         — ПЛАН Phase 0
    ├── phase-0-notification-source-impl.md  ⭐ РЕАЛИЗАЦИЯ (v0.96.0)
    ├── phase-1-tools.md              — ПЛАН Phase 1
    ├── phase-1-tools-impl.md         ⭐ РЕАЛИЗАЦИЯ (v0.97.0)
    ├── phase-2-permissions.md        — ПЛАН Phase 2
    ├── phase-2-permissions-write-impl.md  ⭐ РЕАЛИЗАЦИЯ (v0.98.0)
    ├── phase-3-agent-ui.md           — ПЛАН Phase 3
    ├── phase-3-agent-ui-impl.md      ⭐ РЕАЛИЗАЦИЯ (v0.99.0+v0.99.1)
    ├── phase-4-extensions.md         — ПЛАН Phase 4
    ├── phase-4a-tasks-reminders-impl.md  ⭐ РЕАЛИЗАЦИЯ Tasks+Reminders (v1.0.0)
    ├── phase-4b-ui-integration-impl.md   ⭐ РЕАЛИЗАЦИЯ UI integration (v1.0.1)
    ├── phase-4c-tdlib-real-backend-impl.md ⭐ РЕАЛИЗАЦИЯ TDLib backend (v1.0.2)
    ├── phase-4-3-auto-reply-impl.md  ⭐ РЕАЛИЗАЦИЯ Auto-reply (v1.1.0-1.1.3)
    ├── phase-5-native-extension.md   — ПЛАН Phase 5 (deferred — другие мессенджеры)
    └── phase-gigachat-tool-use-impl.md  ⭐ РЕАЛИЗАЦИЯ ГигаЧат tool use (v1.1.4)
```

**Чтение для новичка** (приоритет):
1. `current-state-v1.1.4.md` (этот файл) — общая картина
2. `phase-0-notification-source-impl.md` — что такое source
3. `phase-1-tools-impl.md` — как работает AI agent
4. `phase-4-3-auto-reply-impl.md` — auto-reply pipeline
5. `roadmap-deferred.md` — что делать дальше

---

**Версия документа**: создан 9 июня 2026 после v1.1.4. Обновляй при каждом major релизе.
