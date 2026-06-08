# Phase 3 — UI агента (детально)

> **Цель**: Юзер кликает «🤖 Обработать» — агент делает всё. Multi-turn AI с streaming UI.

## Что делаем

- Кнопка «🤖 Обработать» в уведомлении
- useAIAgent hook (multi-turn reasoning)
- Streaming UI для tool_use
- Разбиение AISidebar.jsx (он 543 строки)
- AISidebarAgent.jsx (новый компонент)
- AI Activity Dashboard

## Файлы

### Новые

| Файл | Размер |
|---|---|
| `src/hooks/useAIAgent.js` | ~150 |
| `src/components/AISidebarAgent.jsx` | ~250 |
| `src/components/AISidebarHeader.jsx` | ~80 (extract из AISidebar) |
| `src/components/AISidebarChat.jsx` | ~150 (extract из AISidebar) |
| `src/components/NotifAgentButton.jsx` | ~80 |
| `src/components/AIActivityDashboard.jsx` | ~200 |

### Изменяемые

| Файл | Что меняется |
|---|---|
| `src/components/AISidebar.jsx` | Разбит на под-компоненты, остаётся как контейнер |
| `main/notification.html` | Добавлена кнопка «🤖 Обработать» |
| `main/notification.js` | IPC notif:action для агента |
| `main/handlers/notifHandlers.js` | Поддержка actionId='ai_process' |

## Milestones

### M3.1 — Кнопка «🤖 Обработать» в уведомлении

**Где**: окно уведомлений (`notification.html` + `notification.js`)

**UI**:
- Третья кнопка рядом с «→ Перейти к чату» и «✓ Прочитано»
- Иконка робота 🤖
- Подсказка «Обработать через AI»
- Disabled если провайдер не supportsTools

**Поведение**:
- Клик → IPC `notif:action { actionId: 'ai_process', source }`
- Уведомление закрывается
- Главное окно: focus + open AI sidebar
- AI запускается с source

**Tests**: 2 (отрисовка + клик)

---

### M3.2 — useAIAgent hook

**Файл**: `src/hooks/useAIAgent.js`

**Экспорт**:
```js
function useAIAgent() {
  const [state, setState] = useState({
    isRunning: false,
    currentStep: null,        // 'reasoning' | 'tool_use' | 'waiting_confirm'
    toolCalls: [],             // [{ name, args, status, result }]
    finalAnswer: null,
    error: null,
  })

  const start = (source) => {...}
  const cancel = () => {...}
  
  return { state, start, cancel }
}
```

**Поведение**:
1. `start(source)` → IPC `ai:agent:run`
2. Listen to `ai:agent:step` events (streaming progress)
3. При confirm tool → показать модалку, dispatch confirm/cancel
4. При final answer → show in UI
5. `cancel()` → IPC `ai:agent:cancel`

**Tests** (3-4):
1. start → state.isRunning=true
2. step event → state.toolCalls updates
3. cancel → state cleared
4. error → state.error set

---

### M3.3 — Streaming tool_use UI

**Файл**: `src/components/AISidebarAgent.jsx`

**UI** показывает прогресс:
```
🤖 AI анализирует...

  ▸ Читаю историю чата (5/5 сообщений)
  ▸ Поиск по теме «скидки»...
  ✓ Найдено 3 предыдущих обсуждения

🤖 AI предлагает:

  Ответ:
  ┌────────────────────────────────────────┐
  │ "Здравствуйте, Иван! Для заказа..."    │
  └────────────────────────────────────────┘
  [✓ Отправить] [✎ Изменить] [✗ Отмена]
```

**Tests**: render + interactions

---

### M3.4 — Разбиение AISidebar.jsx

**Текущее**: 543 строки (близко к лимиту 700).

**После**:
- `AISidebar.jsx` — корневой контейнер (~150 строк)
- `AISidebarHeader.jsx` — провайдер табы + статус (~80)
- `AISidebarChat.jsx` — текстовый чат (existing) (~150)
- `AISidebarAgent.jsx` — UI агента (новый) (~250)
- `AISidebarFooter.jsx` — input + send (~80)

**Test**: regression — текстовый чат продолжает работать как раньше

---

### M3.5 — AISidebarAgent.jsx (детально)

Уже описан в M3.3. Здесь — финальная полировка.

---

### M3.6 — AI Activity Dashboard

**Файл**: `src/components/AIActivityDashboard.jsx`

**UI**:
- Отдельная вкладка / страница в Settings
- Статистика: tokens spent, actions today, success rate
- Audit log список с фильтрами (расширяет Phase 2 AIAuditPage)
- Top actions графики

**Tests**: 3-4 теста render

---

## Done criteria

- [ ] M3.1 — M3.6 готовы
- [ ] Тесты passed
- [ ] Manual: кнопка работает, UI агента показывает прогресс
- [ ] Manual: confirm modal интегрирован
- [ ] AISidebar разбит — file size limits ОК
- [ ] Версия bump v0.98.0 → v0.99.0
- [ ] **Юзер подтвердил → опционально Phase 4**

## Manual checks

- [ ] Получить уведомление → видна кнопка «🤖 Обработать»
- [ ] Клик → AI sidebar открывается + начинается analysis
- [ ] Видны steps: «Читаю историю», «Анализирую», «Предлагаю»
- [ ] Confirm modal появляется для reply
- [ ] [Подтвердить] → ответ отправляется
- [ ] [Отмена] → AI останавливается, audit log denied
- [ ] AI Activity → видим запись

## Готовность к Phase 4

После Phase 3:
- Полноценный AI агент работает
- UI юзер-friendly
- AISidebar архитектурно разбит

Phase 4 опциональная — это **расширения** (Tasks panel, Reminders, AI auto-reply, Ollama).
