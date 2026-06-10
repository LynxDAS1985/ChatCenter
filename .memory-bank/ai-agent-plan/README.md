# AI-агент для уведомлений — план доработки

> Папка содержит всю документацию по доработке AI-агента для ChatCenter.
> Цель — превратить пассивный AI-помощник (генерирует текст) в активного агента,
> который сам выполняет действия с уведомлениями и сообщениями.

## 🚦 Главное правило работы

**КАЖДЫЙ ШАГ ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ ОТ ЮЗЕРА.**

Без явного «ок, дальше» или «делай следующий шаг» — НЕ двигаться.
Завершил milestone → запиши результат в [progress.md](./progress.md) → **СТОП** → жди ответа.

Это правило важнее любых других. Скорость не нужна — нужна корректность.

## 📂 Файлы папки

### Концепция и план

| Файл | Что внутри |
|---|---|
| [overview.md](./overview.md) | Цели проекта, 5 фаз, критерии успеха, out-of-scope |
| [architecture.md](./architecture.md) | Архитектура 3 уровней (Source / Action Bus / Effects). Диаграммы. |
| [tools-catalog.md](./tools-catalog.md) | Каталог всех инструментов с JSON Schema |
| [permissions.md](./permissions.md) | Permission tiers (auto / confirm / deny), безопасность, audit |
| [providers.md](./providers.md) | Поддержка tool_use по 4 провайдерам (OpenAI/Claude/DeepSeek/ГигаЧат) |
| [comparison.md](./comparison.md) | Сравнение с Slack AI / Teams Copilot / Cursor / Claude Desktop |

### Живые документы (обновляются по ходу работы)

| Файл | Что внутри |
|---|---|
| [problems.md](./problems.md) | Все обнаруженные проблемы и принятые решения |
| [progress.md](./progress.md) | Что сделано / что осталось — обновляется после каждого checkpoint |
| [changelog.md](./changelog.md) | Детальный лог изменений по коммитам (файлы, строки, что именно) |
| [checkpoints.md](./checkpoints.md) | Чеклисты проверки для каждой фазы. **Главный workflow-файл.** |

### Детализация по фазам — ПЛАН (что задумывалось)

| Файл | Что внутри |
|---|---|
| [phases/phase-0-foundation.md](./phases/phase-0-foundation.md) | Phase 0: NotificationSource + Action Bus + cross-tab fix |
| [phases/phase-1-tools.md](./phases/phase-1-tools.md) | Phase 1: Tool Use каркас (read-only tools) |
| [phases/phase-2-permissions.md](./phases/phase-2-permissions.md) | Phase 2: Write actions + permission система + audit |
| [phases/phase-3-agent-ui.md](./phases/phase-3-agent-ui.md) | Phase 3: UI агента (multi-turn, streaming, confirmations) |
| [phases/phase-4-extensions.md](./phases/phase-4-extensions.md) | Phase 4: Tasks / Reminders / AI auto-reply / Ollama local |
| [phases/phase-5-native-extension.md](./phases/phase-5-native-extension.md) | Phase 5: Native API для других мессенджеров |

### 📘 Детализация по фазам — РЕАЛЬНАЯ РЕАЛИЗАЦИЯ (что сделано на самом деле)

> **Главные файлы документации**: подробно описывают каждую фазу — что было сделано, зачем, как работает, какие потоки данных, подводные камни. Читать когда нужно понять конкретную доработку или найти причину поведения.

| Файл | Версия | О чём |
|---|---|---|
| [phases/phase-0-notification-source-impl.md](./phases/phase-0-notification-source-impl.md) | v0.96.0 | **NotificationSource паспорт + Action Bus + cross-tab fix**. Унифицированный формат паспорта сообщения, frozen объект, listener в корне App.jsx (не в NativeApp), передача через IPC. |
| [phases/phase-1-tools-impl.md](./phases/phase-1-tools.md) | v0.97.0 | **8 tools + 3 провайдера**. Tool Registry, JSON Schema 2020-12, handlers, Anthropic/OpenAI/DeepSeek/ГигаЧат adapters, executor с max iterations 10. |
| [phases/phase-2-permissions-write-impl.md](./phases/phase-2-permissions-write-impl.md) | v0.98.0 | **Permission Guard + Write tools**. HARDCODED_CONFIRM_TOOLS, AIConfirmModal с 3-сек задержкой, scope check (только native), audit log JSONL. |
| [phases/phase-3-agent-ui-impl.md](./phases/phase-3-agent-ui-impl.md) | v0.99.0+v0.99.1 | **«🤖 AI» кнопка + AISidebarAgent**. Кнопка в notification ribbon, streaming шагов через IPC events, deferred id для confirm. |
| [phases/phase-4a-tasks-reminders-impl.md](./phases/phase-4a-tasks-reminders-impl.md) | v1.0.0 | **Tasks + Reminders + Activity Dashboard**. Persistent JSON store с atomic write, reminder scheduler (setTimeout), audit JSONL, 3 UI панели. |
| [phases/phase-4b-ui-integration-impl.md](./phases/phase-4b-ui-integration-impl.md) | v1.0.1 | **UI интеграция Phase 4**. 3 иконки 📝 ⏰ 📊 в шапке TabBar, PanelModal обёртка, useAppCounters hook для badge, handleGoToSource. |
| [phases/phase-4c-tdlib-real-backend-impl.md](./phases/phase-4c-tdlib-real-backend-impl.md) | v1.0.2 | **TDLib backend adapter**. aiAgentBackendAdapter — плоский интерфейс над tdlibBackend.messages.*. Добавлен messages.search через TDLib API. Реальная отправка/чтение/поиск (было — fallback). |
| [phases/phase-4-3-auto-reply-impl.md](./phases/phase-4-3-auto-reply-impl.md) | v1.1.0 | **AI auto-reply правила (foundation)**. autoReplyEngine (pure functions matchRule + checkKeywords/Schedule/Cooldown). Persistent storage. UI AIAutoReplyRules с формой. Iconа 🤖⚡ в шапке. Integration с tg:new-message — deferred. |

## 🔁 Порядок работы (workflow)

1. **Прочитать** [checkpoints.md](./checkpoints.md) — найти текущий чекпойнт
2. **Прочитать** [progress.md](./progress.md) — увидеть актуальный статус
3. **Прочитать** соответствующий [phases/phase-N-*.md](./phases/) — детали текущей фазы
4. **Сделать** только то что в текущем milestone (не больше!)
5. **Записать** результат в [progress.md](./progress.md) + [changelog.md](./changelog.md)
6. **Записать** новые проблемы (если обнаружились) в [problems.md](./problems.md)
7. **СТОП** — ждать подтверждения от юзера
8. **После подтверждения** → следующий milestone

## 📌 Текущий статус

См. [progress.md](./progress.md) — там всегда актуальное состояние.

**На 2026-06-08 (v0.97.0)**: Phase 0 + Phase 1 **завершены и выгружены** (commit `ce994ce`).
- 14 milestones done (5 Phase 0 + 9 Phase 1)
- 117 новых unit-тестов
- 1142/1142 vitest passed

**Следующий шаг**: ждать «делай Phase 2» от юзера. Phase 2 = write actions (reply / mark-read через AI) + Permissions UI + Audit Log.

## 🎯 Scope (зафиксировано в v0.97.0)

**AI-агент работает ТОЛЬКО для Native режима**:
- Сейчас Native = `messengerId='native_cc'` (TDLib для Telegram)
- В будущем Native расширится на другие мессенджеры через native API (WhatsApp Business, VK, Viber)

**WebView мессенджеры** (Telegram БНК / Telega Avtoliberty / ВК / WhatsApp Web / Макс) и
**AI WebView mode в AISidebar** (chat.openai.com / claude.ai) — **остаются как есть**, AI агент их не трогает.

## ❓ Кто читает эту папку

- **AI-агент** (Claude Code) — каждый раз когда юзер просит делать AI-агента
- **Юзер** — для проверки что план соблюдается

**НЕ читается** автоматически при других задачах (по правилам CLAUDE.md «Узкие / разовые файлы»).
