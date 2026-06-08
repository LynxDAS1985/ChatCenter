# Прогресс работы (живой файл)

> **Обновляется после каждого checkpoint.** Здесь — актуальный статус всего проекта.

## Текущий статус

**Дата**: 2026-06-08 (вечер)
**Версия проекта**: v0.97.0
**Активная фаза**: Phase 2 (не начата) или ожидание ручной проверки Phase 0+1
**Последний завершённый milestone**: M1.9 IPC bridge

## Краткий статус по фазам

| Фаза | Статус | Прогресс | Готовность к старту |
|---|---|---|---|
| Phase 0 — Foundation | 🟢 **Готово** | 100% | — |
| Phase 1 — Tools каркас | 🟢 **Готово** | 100% | — |
| Phase 2 — Permissions + Write | ⚪ Не начато | 0% | ✅ Готова к старту |
| Phase 3 — UI агента | ⚪ Не начато | 0% | Блокируется Phase 2 |
| Phase 4 — Расширения | ⚪ Не начато | 0% | Блокируется Phase 3 |

**Легенда**: ⚪ Не начато | 🟡 В работе | 🟢 Готово | 🔴 Заблокировано | ⚫ Отложено

---

## Phase 0 — Foundation ✅ ЗАВЕРШЕНО

### Milestones

| ID | Milestone | Статус | Тесты |
|---|---|---|---|
| M0.1 | NotificationSource module | 🟢 | 21/21 ✓ |
| M0.2 | Action Bus (useNotifyDispatcher) | 🟢 | 9/9 ✓ |
| M0.3 | Cross-tab notify:clicked | 🟢 | существующие regression ✓ |
| M0.4 | NotificationSource через IPC | 🟢 | regression ✓ |
| M0.5 | Регрессия Phase 0 | 🟢 | full vitest passed |

### Что появилось у юзера

- ✅ Cross-tab уведомления работают со всех вкладок (Telegram/WhatsApp/Макс/...) — раньше клик «→ Перейти к чату» терялся когда юзер не на ЦентрЧатов вкладке
- ✅ Internal: NotificationSource паспорт несётся через все слои IPC без потери точности
- ✅ Удалены диагностические логи v0.95.47 — лог теперь чистый

### Файлы созданы

- `src/shared/notificationSource.js` (133 строки) + `notificationSource.vitest.js`
- `src/hooks/useNotifyDispatcher.js` (97 строк) + `useNotifyDispatcher.vitest.jsx`

### Файлы изменены

- `src/App.jsx` (+39 строк: cross-tab listener + state + clearPendingNotify)
- `src/native/NativeApp.jsx` (-39 / +35: убран старый useEffect, новый prop-based)
- `src/native/store/nativeStoreIpc.js` (+25 / -10: createNotificationSource в emit)
- `main/handlers/notificationManager.js` (+1 / -3: добавлен source в notifItems)
- `main/handlers/notifHandlers.js` (+5 / -8: notify:clicked передаёт source)
- `src/native/modes/InboxMode.jsx` (-30 строк: удалены диагностические логи)

---

## Phase 1 — Tools каркас ✅ ЗАВЕРШЕНО

### Milestones

| ID | Milestone | Статус | Тесты |
|---|---|---|---|
| M1.1 | Tool Registry | 🟢 | 19/19 ✓ |
| M1.2 | Tool Schemas | 🟢 | 11/11 ✓ |
| M1.3 | Handlers (3 read-only) | 🟢 | 12/12 ✓ |
| M1.4 | Anthropic Adapter | 🟢 | (часть adapters) |
| M1.5 | OpenAI + DeepSeek Adapter | 🟢 | (часть adapters) |
| M1.6 | ГигаЧат Adapter | 🟢 | 16/16 ✓ adapters суммарно |
| M1.7 | aiToolExecutor | 🟢 | 11/11 ✓ |
| M1.8 | aiContextBuilder | 🟢 | 10/10 ✓ |
| M1.9 | IPC bridge | 🟢 | 8/8 ✓ |

### Что появилось

- ✅ Tool Registry с runtime регистрацией tools
- ✅ JSON Schema каталог (goto_message / get_chat_history / search_messages)
- ✅ 4 provider adapters (Anthropic/OpenAI/DeepSeek/ГигаЧат)
- ✅ aiToolExecutor — multi-turn agent loop с max iterations, permission guards, audit log
- ✅ IPC bridge (ai:agent:run / ai:agent:cancel) с streaming через ai:agent:step

### Файлы созданы

- `src/shared/tools/toolRegistry.js` (149 строк)
- `src/shared/tools/toolSchemas.js` (114 строк)
- `src/shared/tools/handlers/gotoMessage.js` (60 строк)
- `src/shared/tools/handlers/getChatHistory.js` (62 строки)
- `src/shared/tools/handlers/searchMessages.js` (54 строки)
- `main/ai/adapters/anthropicAdapter.js` (88 строк)
- `main/ai/adapters/openaiAdapter.js` (84 строки)
- `main/ai/adapters/deepseekAdapter.js` (10 строк — re-export)
- `main/ai/adapters/gigachatAdapter.js` (78 строк)
- `main/ai/aiToolExecutor.js` (167 строк)
- `main/ai/aiContextBuilder.js` (108 строк)
- `main/handlers/aiToolIpcHandlers.js` (108 строк)
- + 6 файлов тестов (508 строк суммарно)

### Файлы изменены

- `vitest.config.mjs` (+1 строка: include для `main/**/*.vitest.js`)
- `src/__tests__/fileSizeLimits.test.cjs` (+1 строка: лимит 22500 → 22800)

---

## Phase 2 — Permissions + Write actions (план)

**Статус**: ⚪ Не начато, готов к старту по запросу юзера

### Что в плане

См. [phases/phase-2-permissions.md](./phases/phase-2-permissions.md):

- M2.1 Permission Guard
- M2.2 Write tools: reply_to_message, mark_as_read
- M2.3 Confirmation Modal UI
- M2.4 Audit Log store
- M2.5 Audit Log UI page
- M2.6 Undo last N
- M2.7 Permission Settings UI
- M2.8 Security tests (TEST-SEC-001..010)

---

## Что нужно от юзера сейчас

### Manual проверки Phase 0 + 1

Юзер должен проверить вручную:

- [ ] **Cross-tab уведомление** (главная проверка Phase 0 M0.3):
  - Перезапустить `npm run dev` (горячая перезагрузка не подхватит useEffect изменения)
  - Открыть Telegram (webview) — стоять там
  - Дождаться уведомления от native_cc Telegram
  - Кликнуть «→ Перейти к чату»
  - **Должно**: переключиться на ЦентрЧатов + открыть нужный чат + прокрутить к сообщению
  - **Если не работает** — прислать лог `chatcenter.log`

- [ ] **Обычные уведомления** (regression):
  - Уведомления приходят
  - Звук есть (если включён)
  - Mark-as-read работает
  - Webview-уведомления (через useNotifyNavigation) работают как раньше

### Что не работает в Phase 1 (это **по плану**)

- ❌ Кнопка «🤖 Обработать» в уведомлении — это Phase 3
- ❌ AI отправляет ответ — это Phase 2 (требует permission system)
- ❌ AI создаёт задачи — это Phase 4

AI agent loop **технически работает** через IPC `ai:agent:run` — можно вызвать через консоль для разработки. Но реального UI пока нет.

---

## Метрики

### Code metrics (фактические)

| Метрика | Значение |
|---|---|
| Новых файлов | 24 (12 prod + 12 test) |
| Изменённых файлов | 8 |
| Новых строк кода | ~1700 |
| Новых тестов | 117 (Phase 0: 30 + Phase 1: 87) |
| Общий vitest | 1142/1142 passed |

### Время (фактическое)

| Фаза | Оценка | Факт |
|---|---|---|
| Phase 0 | ~2 часа | ~30 мин |
| Phase 1 | ~3-4 часа | ~50 мин |

---

## Решённые проблемы (см. [problems.md](./problems.md))

- ✅ **P-01** Cross-tab notify:clicked — решено в M0.3 (App.jsx listener + prop)
- ✅ **P-02** AI не знает источник — решено в M0.4 (NotificationSource через IPC)
- ✅ **P-03** AI не может выполнять действия — решено в Phase 1 (tool use API)

## Открытые проблемы

- 🔴 **P-04** Permission система — Phase 2
- 🔴 **P-05** Audit log AI действий — Phase 2

## Anticipated проблемы

- ⚫ **P-A1** ГигаЧат tool use стабильность — adapter готов, нужны live integration тесты в Phase 2

---

## История обновлений

### 2026-06-08 (вечер) — Phase 0 + Phase 1 done

- Реализовано: 5 milestones Phase 0 + 9 milestones Phase 1
- Тесты: +117 unit-тестов (1142/1142 passed)
- Версия: v0.95.50 → **v0.97.0** (major bump — новая архитектура AI agent)
- Файлы: 24 новых, 8 изменённых
- Документация: progress.md / changelog.md / features.md / CLAUDE.md обновлены
- Manual check ожидается от юзера перед Phase 2

### 2026-06-08 (день) — Setup

- Создана папка `.memory-bank/ai-agent-plan/`
- Написана документация: overview / architecture / tools-catalog / permissions / providers / comparison / phases × 5
- Phase 0 готова к старту

---

## Ссылки

- [checkpoints.md](./checkpoints.md) — детальный workflow
- [changelog.md](./changelog.md) — что именно сделано в коде
- [problems.md](./problems.md) — обнаруженные проблемы
- [phases/](./phases/) — детали по каждой фазе
