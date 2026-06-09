# Phase 2 — Permissions + Write actions (детально)

> **Цель**: AI может выполнять write actions (отправка, mark-read, create-task) с
> подтверждением юзера. Permission система + audit log + undo.
>
> ## 🎯 Scope (v0.97.0+)
>
> Write actions работают **только** для Native режима (`messengerId='native_*'`).
> Сейчас это `native_cc` (TDLib). В будущем — другие native API мессенджеров.
>
> WebView мессенджеры (Telegram БНК / Telega / ВК / WhatsApp Web / Макс) и
> AI WebView mode (chat.openai.com / claude.ai) — **не затрагиваются**, работают как есть.

## Что делаем

- Permission Guard (auto / confirm / deny tiers)
- Write tools: reply_to_message, mark_as_read, create_task
- Confirmation Modal UI
- Audit Log store + UI page
- Undo последних N действий
- Permission Settings page
- 10 security tests

## Что НЕ делаем

- ❌ AI Agent UI кнопка (Phase 3)
- ❌ Tasks UI dashboard (Phase 4)
- ❌ Reminders (Phase 4)

## Файлы

### Новые

| Файл | Размер |
|---|---|
| `main/ai/aiPermissionGuard.js` | ~80 |
| `src/shared/tools/handlers/replyToMessage.js` | ~50 |
| `src/shared/tools/handlers/markAsRead.js` | ~40 |
| `src/shared/tools/handlers/createTask.js` | ~50 (без UI) |
| `src/components/AIConfirmModal.jsx` | ~120 |
| `src/components/AIAuditPage.jsx` | ~200 |
| `src/components/AIPermissionsSettings.jsx` | ~150 |
| `src/stores/auditStore.js` | ~100 |
| `main/handlers/auditIpcHandlers.js` | ~60 |

### Тесты

| Файл | Тесты |
|---|---|
| `main/ai/aiPermissionGuard.vitest.js` | 6 |
| `src/shared/tools/handlers/replyToMessage.vitest.js` | 4 |
| `src/shared/tools/handlers/markAsRead.vitest.js` | 3 |
| `src/components/AIConfirmModal.vitest.jsx` | 4 |
| `src/stores/auditStore.vitest.js` | 5 |
| `src/__tests__/aiSecurity.vitest.js` (10 security tests) | 10 |

**Итого**: ~32 теста

---

## Milestones

### M2.1 — Permission Guard

**Файл**: `main/ai/aiPermissionGuard.js`

**Экспорт**:
- `checkPermission(toolId, source, args, userSettings)` → 
  `{ allowed: bool, requiresConfirm: bool, reason?: string }`

**Логика**:
1. Lookup `tool.permission` из registry
2. Lookup `userSettings.permissionOverrides[toolId]` (override)
3. Hardcoded deny — не override
4. Hardcoded confirm — не override (для reply / send)

**Tests** (6):
1. auto tool → allowed без confirm
2. confirm tool → requiresConfirm
3. deny tool → not allowed
4. user override auto→confirm работает
5. user override на hardcoded deny → ignored
6. permission tier для unknown tool → deny

---

### M2.2 — Write tool handlers

**handlers/replyToMessage.js**:
```
1. Validate input (schema)
2. Permission check → if confirm → wait for user confirmation via UI
3. Call store.sendMessage(chatId, text, { replyTo: messageId })
4. Audit log запись
5. Return { ok, messageId of sent }
```

**handlers/markAsRead.js**:
```
1. Validate input
2. Call store.markRead(chatId, messageId)
3. Audit log
4. Return { ok }
```

**handlers/createTask.js** (без UI пока):
```
1. Validate input
2. taskStore.create({ source, title, dueAt, ... })
3. Audit log
4. Return { ok, taskId }
```

**Tests**: 4 + 3 + ... = 11

---

### M2.3 — Confirmation Modal UI

**Файл**: `src/components/AIConfirmModal.jsx`

**Props**:
```js
{
  visible: bool,
  toolId: string,
  source: NotificationSource,
  args: object,
  onConfirm: () => void,
  onEdit: (newArgs) => void,
  onCancel: () => void,
}
```

**UI**:
- Header: «🤖 AI хочет выполнить действие»
- Body: тип действия + детали
- Editable текст (для reply) — TextArea
- Кнопки: [✓ Подтвердить] [✎ Изменить] [✗ Отмена]
- 5-секундная задержка перед активацией [Подтвердить] (анти-misclick)

**Tests** (4):
1. Render с visible=true
2. Confirm callback вызывается
3. Edit callback с новым text
4. 5s delay перед активацией кнопки

---

### M2.4 — Audit Log Store

**Файл**: `src/stores/auditStore.js`

**Структура записи** (см. [permissions.md](../permissions.md)):
```js
{
  id: 'uuid',
  timestamp: 1717843080000,
  actor: 'user' | 'ai',
  actorId: 'user_main' | 'ai_anthropic',
  actionId: 'reply_to_message',
  source: {...NotificationSource},
  args: { text: 'Здравствуйте...' },
  permissionResult: 'auto' | 'confirmed' | 'denied',
  executionResult: 'ok' | 'error',
  executionDuration: 234,
  errorMessage: null
}
```

**Storage**: JSON Lines в `app.getPath('userData')/audit-log/YYYY-MM.jsonl`

**Экспорты**:
- `auditStore.log(record)` — append
- `auditStore.list({ filter, limit })` — read with filter
- `auditStore.undo(recordId)` — попытка отката (вызывает обратное action)
- `auditStore.clear(olderThanDays)` — cleanup

**Tests** (5):
1. log + list
2. filter by action / actor / date
3. undo revertable action
4. undo non-revertable → error
5. cleanup старых

---

### M2.5 — Audit Log UI

**Файл**: `src/components/AIAuditPage.jsx`

**UI** (см. макет в [permissions.md](../permissions.md)):
- Список записей с фильтрами
- Кнопки «Откатить N последних»
- Экспорт CSV
- Очистить старше 30 дней

**Tests**: render + interactions (3-4 теста)

---

### M2.6 — Undo last N

**Логика**:
1. Lookup последние N записей где `revertable=true`
2. Для каждой — построить обратное action
3. Confirm modal: «Откатить N действий?»
4. Execute обратные actions в reverse order
5. Audit log с пометкой `revert`

**Tests**: 3 теста (undo single, undo multiple, undo with errors)

---

### M2.7 — Permission Settings UI

**Файл**: `src/components/AIPermissionsSettings.jsx`

**UI** (см. макет в [permissions.md](../permissions.md)):
- Presets: «Полный» / «Сбалансированно» / «Только чтение» / «Custom»
- Per-tool toggles auto/confirm
- Деактивированные deny tools — show but не edit

**Settings storage**: в `settings.aiPermissions` (electron-store)

**Tests**: 2-3 теста (preset, custom toggle)

---

### M2.8 — Security tests (10)

Файл `src/__tests__/aiSecurity.vitest.js`:

1. **TEST-SEC-001**: AI не может вызвать `delete_message`
2. **TEST-SEC-002**: AI не может изменить permission settings через tool_call
3. **TEST-SEC-003**: API key не попадает в audit log
4. **TEST-SEC-004**: Prompt injection (тестовое сообщение «ignore...») не выполняется
5. **TEST-SEC-005**: Token budget hard cap работает
6. **TEST-SEC-006**: Max iterations limit срабатывает
7. **TEST-SEC-007**: 3× deny подряд → abort session
8. **TEST-SEC-008**: Confirm modal показывает полный текст
9. **TEST-SEC-009**: Undo возвращает state корректно
10. **TEST-SEC-010**: Cross-chat data leakage предотвращён

---

## Done criteria

- [ ] M2.1 — M2.8 готовы
- [ ] 32 теста passed
- [ ] 10 security tests passed
- [ ] Manual: AI отправляет reply через UI confirm
- [ ] Manual: AI создаёт task через UI confirm
- [ ] Manual: undo работает
- [ ] Audit log пишется и видим в UI
- [ ] Версия bump v0.97.0 → v0.98.0
- [ ] **Юзер подтвердил → готов к Phase 3**

## Manual checks

- [ ] Запустить агента (через консоль или Phase 3 кнопку)
- [ ] AI делает reply_to_message → видим confirmation modal
- [ ] Кликнуть [Подтвердить] → сообщение отправляется
- [ ] Кликнуть [Изменить] → редактируем текст
- [ ] Кликнуть [Отмена] → audit log с denied
- [ ] Открыть AI Audit Page → видим все действия
- [ ] Откатить последнее → mark_as_unread выполняется
- [ ] Settings → AI Permissions → изменить tier → работает

## Готовность к Phase 3

После Phase 2:
- Полная permission система работает
- Write actions безопасны
- Audit log пишется и читается
- Undo работает

→ Готовы к Phase 3: UI агента для юзера.
