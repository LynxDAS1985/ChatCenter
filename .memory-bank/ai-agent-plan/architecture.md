# Архитектура — 3 уровня

## 🎯 Scope

**AI-агент работает только для Native режима** (см. [overview.md](./overview.md)).

`messengerId` в NotificationSource:
- ✅ `'native_cc'` — AI агент работает (TDLib)
- 🔜 `'native_wa_business'`, `'native_vk_api'`, etc. — AI агент будет работать (Phase 5+)
- ❌ `'webview-telegram'`, `'webview-whatsapp'`, `'webview-vk'`, `'webview-max'`, `'webview-viber'` —
  AI агент НЕ обрабатывает. Эти мессенджеры остаются с классическим AI-помощником через AISidebar.

Архитектура **уже extensible** — никаких изменений в коде не нужно для добавления
нового native мессенджера. Tool handlers получают backend через `handlerContext`
(сейчас TDLib store, в будущем — WhatsApp store / VK store / etc).

## Общий принцип

Архитектура разбита на **3 уровня**. Каждый уровень — отдельная ответственность.
Между уровнями — чёткие контракты.

```
┌──────────────────────────────────────────────────────────────┐
│ УРОВЕНЬ 1: SOURCE — паспорт сообщения                         │
│ Откуда сообщение / кто отправил / что в чате                  │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ УРОВЕНЬ 2: ACTION BUS — общая шина действий                   │
│ Юзер и AI используют одни и те же actions                     │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ УРОВЕНЬ 3: EFFECTS — изолированные эффекты                    │
│ TDLib / Store / UI navigation / Storage                       │
└──────────────────────────────────────────────────────────────┘
```

---

## Уровень 1: NotificationSource (паспорт)

### Что это

Неизменяемый JavaScript-объект, который описывает **полный контекст одного сообщения**.

Создаётся **ОДИН раз** в момент когда сообщение приходит от TDLib или webview.
Несётся **без изменений** через все IPC, все слои, все хранилища.

### Структура

```
NotificationSource {
  // Идентификация — обязательные поля
  messengerId:  string,     // 'native_cc' | 'webview-vk' | 'webview-max' | ...
  accountId:    string,     // 'tg_611696632' (TDLib client id)
  chatId:       string,     // '-1001229486988' (TDLib chat id)
  messageId:    string,     // '38375784448' (TDLib message id)

  // Контекст — опциональные
  threadId:     string|null, // 'topic_42' для форум-топиков
  senderId:     string,      // id отправителя
  senderName:   string,      // 'Иван' — отображаемое имя
  chatTitle:    string,      // 'Магазин Электроники'
  timestamp:    number,      // unix ms
  textPreview:  string,      // 'Здравствуйте, как заказать?' (первые 100 chars)

  // Метаданные — заполняются по требованию
  mediaType?:   string|null, // 'photo' | 'video' | 'voice' | null
  replyToId?:   string|null, // если это ответ на другое сообщение
  isOutgoing?:  boolean,     // true если от себя
}
```

### Точность 100% откуда сообщение

Гарантирована **TDLib API spec**:
- `accountId + chatId + messageId` — глобально уникальная тройка
- TDLib message_id внутри чата уникальна (server-assigned)
- `accountId` уникален per TDLib client (наша внутренняя структура)

### Где живёт паспорт

| Место | Зачем |
|---|---|
| Notification window (HTML рендерится из `notifItems[]`) | Юзер видит уведомление |
| `notifItems[]` в `notificationManager.js` (main) | Хранится пока окно живо |
| IPC payload `notify:action` (Renderer ↔ Main) | Передача action к dispatcher |
| Tool input для AI | AI видит источник |
| Audit log | Запись действий |
| Task store / History store | Постоянная привязка к источнику |

### Расширяемость

Объект **может** содержать новые поля без breaking changes:
- Добавить `reactionEmoji` для tracking реакций — никто не сломается
- Добавить `forumTopicId` — все старые потребители игнорируют

---

## Уровень 2: Action Bus (шина действий)

### Что это

Централизованный диспетчер. Принимает действие по `actionId` + `source` + `args`,
маршрутизирует к правильному handler, возвращает результат.

### Принцип «один action — один handler»

```
ACTION = { actionId: string, source: NotificationSource, args?: object }

dispatch(ACTION) → {
  1. Permission check для actionId
  2. Поиск handler в Registry
  3. Вызов handler(source, args) → effect
  4. Audit log запись
  5. Возврат результата
}
```

### Где находится диспетчер

**В корневом App.jsx**. Это критично:

- App.jsx ВСЕГДА смонтирован (root компонент)
- Слушает IPC events `notify:action` ВСЕГДА
- Не зависит от того какая вкладка активна (webview / native_cc)

Это решает **проблему cross-tab уведомлений**: даже если юзер на webview, диспетчер ловит event.

### Контракт «один и тот же action для UI и AI»

| Источник | Как вызывает |
|---|---|
| 🟦 Юзер кликает кнопку в уведомлении | `dispatch('goto_message', source)` |
| 🟦 Юзер кликает в UI «Создать задачу» | `dispatch('create_task', source, { title })` |
| 🟪 AI делает tool_call в API response | Tool Executor парсит → `dispatch('reply_to_message', source, { text })` |

**Один dispatcher, одни handlers**. AI ничем не отличается от юзера (кроме permission).

### Registry — расширяемый список actions

```
registerAction('goto_message', {
  schema: {...},                       // JSON Schema для AI
  permission: 'auto',                  // или 'confirm' / 'deny-for-ai'
  handler: async (source, args) => {...},
  description: 'Переход к сообщению',
})
```

Новые actions добавляются runtime — не нужно менять core dispatcher.

---

## Уровень 3: Effects (изолированные эффекты)

### Категории эффектов

| Категория | Примеры эффектов |
|---|---|
| **TDLib операции** | sendMessage / markRead / getHistory / forwardMessage |
| **UI navigation** | setActiveId / setActiveAccount / setActiveChat / scrollToMessage |
| **Store операции** | tasks.create / history.add / reminders.schedule |
| **System** | clipboard.write / notification.show / audit.log |

### Принцип чистоты

Каждый handler — **pure function** `(source, args) → result`. Без побочных эффектов
помимо явно описанных.

Это даёт:
- Лёгкое тестирование (mock dependencies)
- Возможность откатить (transaction-style)
- Логирование (что было передано / что вернулось)

---

## Поток данных — полный путь

### Сценарий: юзер кликает «🤖 Обработать» на уведомлении

```
1. Notification window (HTML):
   user click → IPC notif:action { actionId: 'ai_process', source }
                                  ↓
2. Main: notifHandlers.js
   ipcMain.on('notif:action') → forward to mainWindow → notify:action event
                                  ↓
3. Renderer: App.jsx useNotifyDispatcher (Action Bus)
   notify:action listener → registry.lookup('ai_process') → handler
                                  ↓
4. Handler 'ai_process':
   - context = await buildContext(source)  // собирает history + tools list
   - aiToolExecutor.runAgent({ source, context, tools })
                                  ↓
5. main/ai/aiToolExecutor.js:
   - HTTP POST → Anthropic API /v1/messages
     body: { model, system, messages, tools }
   - Anthropic возвращает tool_use stop_reason
                                  ↓
6. Tool Executor парсит tool_use:
   { type: 'tool_use', name: 'get_chat_history', input: {...} }
                                  ↓
7. Action Bus:
   - permission check: get_chat_history → auto
   - handler.getChatHistory(source, args) → returns messages[]
   - audit log запись
                                  ↓
8. Result обратно в Anthropic API:
   POST /v1/messages { tool_result: { tool_use_id, content: messages } }
                                  ↓
9. Anthropic возвращает следующий шаг (или final answer):
   { type: 'tool_use', name: 'reply_to_message', input: {source, text: '...'} }
                                  ↓
10. Action Bus:
    - permission: reply_to_message → CONFIRM
    - UI модалка: «AI хочет отправить: '...' Подтвердить?»
    - юзер [✓] → handler.replyToMessage → TDLib.sendMessage
                                  ↓
11. Success → audit log → UI показывает «Отправлено»
```

---

## Существующая инфраструктура (что переиспользуем)

### Уже есть и работает

| Компонент | Что есть | Что переиспользуем |
|---|---|---|
| [main/handlers/aiHandlers.js](../../main/handlers/aiHandlers.js) | 4 провайдера, streaming SSE | Расширяем `tools` parameter в PROVIDERS config |
| [src/utils/aiProviders.js](../../src/utils/aiProviders.js) | Конфиги, getProviderCfg, contextMode | Добавляем `supportsTools: true/false` |
| [src/components/AISidebar.jsx](../../src/components/AISidebar.jsx) | UI чат с AI, streaming | Добавляем кнопку «🤖 Обработать» (Phase 3) |
| [src/utils/aiWebviewContext.js](../../src/utils/aiWebviewContext.js) | Передача lastMessage в WebView | Расширяем до NotificationSource |
| `electron-store` с encryptionKey | Хранение настроек | Используем для AI API keys + permissions |
| `main/handlers/notificationManager.js` | notifItems[] | Уже хранит messageId (v0.95.46), добавим NotificationSource |
| `main/handlers/notifHandlers.js` | notif:click, notif:mark-read | Заменяем на универсальный `notif:action` |
| Action handlers внутри `nativeStore` | sendMessage / markRead / getMessages | Tool handlers оборачивают эти методы |

### Что нужно создать с нуля

| Новый модуль | Назначение |
|---|---|
| `src/shared/notificationSource.js` | Factory + типы для паспорта |
| `src/shared/tools/toolRegistry.js` | Реестр всех tools |
| `src/shared/tools/toolSchemas.js` | JSON Schema каждого tool |
| `src/shared/tools/handlers/*.js` | Handlers по одному файлу на tool |
| `src/hooks/useNotifyDispatcher.js` | Action Bus в App.jsx |
| `main/ai/aiToolExecutor.js` | Main-side agent loop |
| `main/ai/aiContextBuilder.js` | Сборка context для AI |
| `main/ai/aiPermissionGuard.js` | Permission tiers |
| `src/stores/auditStore.js` | Audit log AI действий |
| `src/stores/taskStore.js` | Tasks (Phase 4) |
| `src/stores/reminderStore.js` | Reminders (Phase 4) |
| `src/stores/historyStore.js` | History действий (Phase 4) |

---

## Граничные случаи и защита

### Action Bus: что если action не найден

`dispatch('unknown_action', ...)` → log warning + return `{ ok: false, error: 'unknown_action' }`.
**Не падать**.

### Tool Use: AI просит запрещённый tool

`permission: 'deny-for-ai'` → возврат AI: `{ tool_result: { error: 'permission_denied' } }`.
AI понимает и предложит другой подход.

### Bypass: юзер отменяет AI action в середине

Cancel button → abort current agent loop → последний successful step сохранён в audit.
Дальнейшие tool_calls не выполняются.

### Дубликат action

Если юзер дважды кликнул — debounce 500ms в dispatcher. Audit log пишет «duplicate skipped».

### Permission tier conflict

Если permission задан и в Registry, и в Settings (override) — Settings приоритетнее.
**Юзер всегда контролирует.**

### Concurrent actions

Два AI запроса одновременно — каждый со своим `requestId`. Audit log разделяет по requestId.

### Provider не поддерживает tool_use

`supportsTools: false` в PROVIDERS — UI кнопка «🤖 Обработать» отключена для этого провайдера.
Юзер видит сообщение «Этот провайдер не поддерживает агентский режим».

---

## Принципы дизайна

1. **Single source of truth** — `NotificationSource` создаётся раз, не парсится повторно.
2. **Composable handlers** — каждый action независим, testable.
3. **Permission first** — proverka до выполнения.
4. **Audit everything** — все действия логируются.
5. **Graceful degradation** — не падать, не глотать ошибки.
6. **Provider-agnostic** — JSON Schema стандарт работает с любым LLM.
7. **No new dependencies** — нативный fetch / SSE / IPC.

---

## Ссылки

- [tools-catalog.md](./tools-catalog.md) — каталог tools с конкретными JSON Schema
- [permissions.md](./permissions.md) — permission tiers и угрозы
- [providers.md](./providers.md) — поддержка по провайдерам
- [phases/phase-0-foundation.md](./phases/phase-0-foundation.md) — реализация Уровня 1+2
