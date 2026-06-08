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

### Детализация по фазам

| Файл | Что внутри |
|---|---|
| [phases/phase-0-foundation.md](./phases/phase-0-foundation.md) | Phase 0: NotificationSource + Action Bus + cross-tab fix |
| [phases/phase-1-tools.md](./phases/phase-1-tools.md) | Phase 1: Tool Use каркас (read-only tools) |
| [phases/phase-2-permissions.md](./phases/phase-2-permissions.md) | Phase 2: Write actions + permission система + audit |
| [phases/phase-3-agent-ui.md](./phases/phase-3-agent-ui.md) | Phase 3: UI агента (multi-turn, streaming, confirmations) |
| [phases/phase-4-extensions.md](./phases/phase-4-extensions.md) | Phase 4: Tasks / Reminders / AI auto-reply / Ollama local |

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

На момент создания: **Phase 0 НЕ начата**. Папка создана, документация написана.
Следующий шаг: ждать «делай Phase 0» от юзера.

## ❓ Кто читает эту папку

- **AI-агент** (Claude Code) — каждый раз когда юзер просит делать AI-агента
- **Юзер** — для проверки что план соблюдается

**НЕ читается** автоматически при других задачах (по правилам CLAUDE.md «Узкие / разовые файлы»).
