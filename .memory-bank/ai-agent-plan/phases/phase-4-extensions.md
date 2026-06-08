# Phase 4 — Расширения (опционально)

> **Цель**: Полноценный продукт. Опционально — делается ТОЛЬКО по запросу юзера.

## Что входит (по запросу)

- **Tasks panel** — UI для задач созданных AI / вручную
- **Reminders** — напоминания с timer scheduler
- **AI auto-reply** — правила автоответа через AI
- **Ollama provider** — локальный AI без облака
- **MCP server support** — внешние tools через open standard

Каждое подвыполнено как независимый sub-phase.

## Sub-phase 4.1 — Tasks panel

### Файлы

- `src/stores/taskStore.js` — persistent storage (JSON в userData)
- `src/components/TasksPanel.jsx` — основная UI
- `src/components/TaskCard.jsx` — карточка задачи
- `src/components/CreateTaskModal.jsx` — создание

### Структура задачи

```js
{
  id: 'uuid',
  source: NotificationSource,
  title: 'Перезвонить Ивану',
  details: 'обсудить условия...',
  priority: 'low'|'medium'|'high',
  dueAt: '2026-06-09T10:00:00Z',
  status: 'pending'|'in_progress'|'done',
  createdAt, completedAt,
  createdBy: 'user'|'ai',
  aiAuditId?: string  // ссылка на audit log
}
```

### UI features

- Список с фильтрами (status, priority, due, source.chatId)
- Drag-and-drop для приоритетов
- Клик по task → goto source (action_id goto_message)
- Bulk actions (complete several)
- Export tasks JSON / CSV

### Tests

- Store CRUD
- UI render + interactions
- Drag-and-drop
- Filter

---

## Sub-phase 4.2 — Reminders

### Файлы

- `src/stores/reminderStore.js` — persistent
- `main/scheduler.js` — main process timer
- `src/components/RemindersPanel.jsx`

### Логика

- `schedule_reminder(source, remindAt, note)`:
  1. Save в reminderStore
  2. main scheduler ставит setTimeout
  3. При `remindAt`:
     - Notification повторяется (re-show)
     - Audit log запись

- Cancellable
- Persistence: при перезапуске app — reschedule pending

### UI

- Список pending reminders
- Edit / cancel
- Создание из контекстного меню сообщения

---

## Sub-phase 4.3 — AI auto-reply

### Файлы

- `src/stores/autoReplyRulesStore.js`
- `src/components/AutoReplyRulesPage.jsx`
- `main/ai/autoReplyEngine.js`

### Правила

```js
{
  id: 'uuid',
  name: 'Приветствие новых клиентов',
  enabled: true,
  triggers: {
    chatFilter: 'sales-*',
    timeWindow: { from: '09:00', to: '18:00' },
    keywords: ['здравствуй', 'привет', 'добрый день'],
    isNewSender: true,  // первое сообщение от этого клиента
  },
  aiPrompt: 'Ответь приветственно, предложи свою помощь',
  autoApprove: false,  // если true — без confirm (опасно)
}
```

### Engine логика

1. Каждое incoming сообщение → проверка триггеров
2. Match → AI генерирует ответ
3. Если `autoApprove: false` → ставит в очередь, юзер видит
4. Если `autoApprove: true` (опасно!) → отправляет автоматически

### Safety

- `autoApprove: true` требует ввести 4-значный код для каждого правила
- Лимит: max 50 auto-replies per day
- Pause button (срочно остановить)

---

## Sub-phase 4.4 — Ollama provider (offline)

### Цель

AI работает локально через Ollama. Полная приватность, $0 cost.

### Файлы

- `main/ai/adapters/ollamaAdapter.js`
- `src/utils/aiProviders.js` — добавить Ollama

### Конфигурация

```js
{
  id: 'ollama',
  label: 'Ollama (локальный)',
  defaultUrl: 'http://localhost:11434',
  defaultModel: 'llama3.2',
  models: ['llama3.2', 'mistral', 'qwen2.5-coder'],
  supportsTools: true,  // Ollama поддерживает tool use с 2024
}
```

### Tool use

Ollama поддерживает OpenAI-compatible function calling:
- `POST /api/chat` с `tools` parameter
- Response: tool_calls в message

### Tests

- Ollama не доступен → graceful error
- Tool use round-trip работает
- Streaming поддерживается

---

## Sub-phase 4.5 — MCP server support

### Цель

Расширения через **открытый стандарт** Model Context Protocol.

### Файлы

- `main/mcp/mcpClient.js` — MCP client (JSON-RPC 2.0)
- `main/mcp/mcpServerManager.js` — запуск/остановка серверов
- `src/components/MCPServersPage.jsx` — UI настроек

### Что даёт

- Пользователь может подключить MCP сервера (filesystem, github, slack, ...)
- Их tools автоматически появляются в AI агенте
- Огромная экосистема существующих MCP серверов

### Сложность

- JSON-RPC over stdio / SSE
- Lifecycle процессов (spawn / monitor / restart)
- Conflict resolution (несколько серверов могут предложить tool с тем же id)

**Решение**: добавить namespace `mcp:server-id:tool-name`.

### Out of scope для нашего проекта (предварительно)

MCP server support — большая фича. Откладываем до того момента когда это
будет нужно. На текущий момент наш JSON Schema подход покрывает использование.

---

## Приоритеты Phase 4

Если делаем — в таком порядке:

1. **Tasks panel** — высокий приоритет, юзер просил
2. **Reminders** — средний, дополняет tasks
3. **AI auto-reply** — средний, opt-in feature
4. **Ollama** — низкий, для энтузиастов приватности
5. **MCP** — низкий, для энтузиастов

---

## Done criteria для каждого sub-phase

Аналогично Phase 0-3:
- Тесты
- Manual smoke
- Документация
- Подтверждение юзера

---

## Готовность

После Phase 4 (все sub-phases):
- ChatCenter становится полноценным AI-powered messaging hub
- Tasks / Reminders / Auto-reply / Local AI / MCP — всё работает
- Соответствует современным enterprise-grade AI-чатам

## Что после Phase 4

Дальнейшее развитие:
- AI fine-tuning под стиль конкретного оператора
- Voice transcription (Whisper API / local)
- Multi-modal (картинки в context)
- Translation in chat
- Sentiment analysis
- Custom MCP servers для специфичных задач компании

Все эти фичи — **plugin-style** через Tool Registry. Архитектура заложенная в Phase 0-3
расширяется без переделок.
