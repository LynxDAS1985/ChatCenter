# Чекпойнты — workflow проверок (главный файл)

> **САМЫЙ ВАЖНЫЙ ФАЙЛ.** Здесь описан workflow: каждый шаг — проверка → подтверждение → следующий.
> Без подтверждения от юзера НЕ двигаться дальше. Точка.

## Главное правило

```
1. Сделать ТОЛЬКО текущий milestone
2. Записать результат в progress.md + changelog.md
3. Записать обнаруженные проблемы в problems.md
4. Запустить локальные проверки
5. СТОП → ждать ответа юзера: «дальше» / «переделай» / «проблема»
6. Только после явного подтверждения → следующий milestone
```

**Не двигаться вперёд без явного «дальше» от юзера. Всегда.**

---

## Workflow одного milestone

### Шаг 1. Чтение контекста

Перед началом milestone (или возвращением к работе):

- [ ] Прочитать [progress.md](./progress.md) — текущий статус
- [ ] Прочитать [problems.md](./problems.md) — известные проблемы
- [ ] Прочитать [phases/phase-N-*.md](./phases/) для текущей фазы — детали
- [ ] Прочитать раздел текущего milestone (M0.1, M0.2, и т.д.) в этом файле

### Шаг 2. План перед действиями

- [ ] Описать ЧТО собираешься делать (минимум 3 факта по правилам ИИ-агента)
- [ ] Указать какие файлы будешь создавать / изменять / удалять
- [ ] Указать какие тесты будут добавлены
- [ ] Указать риски / edge cases
- [ ] **Спросить юзера**: «План готов. Начинаю?»

### Шаг 3. Только после «да» — действия

- [ ] Создать / изменить только указанные файлы
- [ ] Не лезть в соседнее. Видишь проблему рядом — записать в problems.md, не трогать.
- [ ] Минимум touch — только то что в milestone
- [ ] Добавить тесты как описано

### Шаг 4. Локальные проверки

Запустить и сохранить результаты:

- [ ] `npm run lint` — должно быть 0 ошибок
- [ ] `npm run test:vitest` — все тесты должны пройти
- [ ] `node src/__tests__/fileSizeLimits.test.cjs` — 334/334
- [ ] `npm run check-memory` — Memory Bank здоров

Если что-то не прошло — НЕ двигаться. Зафиксировать в problems.md, обсудить с юзером.

### Шаг 5. Обновление документов

- [ ] [progress.md](./progress.md): отметить milestone как done, описать что сделано
- [ ] [changelog.md](./changelog.md): добавить детальную запись с файлами / строками
- [ ] [problems.md](./problems.md): обновить статусы решённых проблем

### Шаг 6. Отчёт юзеру

Структура отчёта:

```
✅ Milestone MX.Y готов.

Что сделано:
- ...

Что проверено локально:
- ✅ lint / vitest / fileSizeLimits / check-memory

Что нужно проверить юзеру вручную:
- [ ] Сценарий 1: ...
- [ ] Сценарий 2: ...

Известные ограничения:
- ...

Готов к коммиту? Если да — закоммитить и продолжить с MX.Y+1?
```

### Шаг 7. СТОП → ожидание

**Не двигаться дальше.** Юзер скажет:
- «Да, коммит + следующий» → коммит + переход на MX.Y+1
- «Подожди, проверю вручную» → ждать
- «Не работает X» → диагностика, фикс в том же milestone
- «Переделай» → отменить изменения, перепланировать

---

## Phase 0 — Foundation (детальные чекпойнты)

### M0.1 — NotificationSource module

#### Pre-checkpoint

- [ ] Phase 0 запущена юзером (`«делай Phase 0»`)
- [ ] Прочитан [phase-0-foundation.md](./phases/phase-0-foundation.md)
- [ ] Понятен паттерн `NotificationSource` из [architecture.md](./architecture.md)

#### Действия

1. Создать `src/shared/notificationSource.js`:
   - Factory function `createNotificationSource({...})`
   - Валидация обязательных полей
   - Defaults для опциональных
   - JSDoc + типы (через JSDoc, без TS)

2. Создать `src/shared/notificationSource.vitest.js`:
   - Тест: создание с минимальными полями
   - Тест: создание с полными полями
   - Тест: ошибка без messengerId
   - Тест: ошибка без accountId
   - Тест: ошибка без chatId
   - Тест: ошибка без messageId
   - Тест: defaults для опциональных

3. Обновить документацию:
   - progress.md M0.1 done
   - changelog.md новая запись

#### Локальные проверки

- [ ] `npx vitest run src/shared/notificationSource.vitest.js` — 7 тестов passed
- [ ] `npm run lint` — 0 ошибок
- [ ] `node src/__tests__/fileSizeLimits.test.cjs` — pass

#### Проверка юзером

- [ ] Юзер не нужен для M0.1 (нет UI изменений)
- [ ] Можно ехать сразу на M0.2 после автоматических проверок

#### Done criteria

- [x] notificationSource.js создан и тесты проходят
- [x] progress.md / changelog.md обновлены
- [x] **Юзер подтвердил «дальше»**

---

### M0.2 — Action Bus (useNotifyDispatcher)

#### Pre-checkpoint

- [ ] M0.1 завершён и подтверждён
- [ ] NotificationSource module работает

#### Действия

1. Создать `src/hooks/useNotifyDispatcher.js`:
   - useRef для registry `Map<actionId, handler>`
   - registerAction / unregisterAction / dispatch
   - logging unknown action
   - debounce duplicates 500ms

2. Создать `src/hooks/useNotifyDispatcher.vitest.jsx`:
   - Тест: register + dispatch вызывает handler
   - Тест: dispatch с unknown action → warning + return error
   - Тест: debounce дубликатов
   - Тест: unregister удаляет handler

3. Документация: progress.md / changelog.md

#### Проверки

- [ ] `npx vitest run src/hooks/useNotifyDispatcher.vitest.jsx`
- [ ] Lint / fileSizeLimits / check-memory

#### Done criteria

- [x] Hook работает
- [x] 4 теста проходят
- [x] **Юзер подтвердил «дальше»**

---

### M0.3 — Cross-tab notify:clicked

#### Pre-checkpoint

- [ ] M0.2 завершён
- [ ] useNotifyDispatcher работает

#### Действия

1. Изменить `src/App.jsx`:
   - Импорт useNotifyDispatcher
   - useEffect для `notify:clicked` — слушатель на корневом уровне
   - На native_cc messengerId → setActiveId(NATIVE_CC_ID) + setPendingNativeNotify(payload)

2. Изменить `src/native/NativeApp.jsx`:
   - Принять пропом `pendingNotify` + `clearPendingNotify`
   - useEffect на изменение pendingNotify → setActiveAccount + setActiveChat + requestScrollToMessage
   - **УДАЛИТЬ старый useEffect** notify:clicked (теперь в App.jsx)

3. Добавить регресс-тесты:
   - App.jsx mock notify:clicked event → проверка setActiveId вызван
   - NativeApp.jsx prop pendingNotify → проверка вызовов

4. Документация + problems.md (P-01 → RESOLVED)

#### Проверки

- [ ] Тесты passed
- [ ] Lint / fileSizeLimits / check-memory

#### Manual checks (юзер)

- [ ] Запустить `npm run dev`
- [ ] Стоять на ЦентрЧатов вкладке → клик уведомление → переход ✓
- [ ] Стоять на Telega Avtoliberty (webview) → клик native_cc уведомление → **переключение** на ЦентрЧатов + переход ✓
- [ ] Стоять на Макс → клик native_cc уведомление → переключение + переход ✓
- [ ] Клик webview уведомления → НЕ переключается на ЦентрЧатов (только webview handler) ✓

#### Done criteria

- [x] Cross-tab работает
- [x] Manual tests passed
- [x] **Юзер подтвердил «дальше»**

---

### M0.4 — NotificationSource через всю IPC цепочку

#### Действия

1. Изменить `src/native/store/nativeStoreIpc.js`:
   - tg:new-message handler → создаёт NotificationSource
   - app:custom-notify → передаёт полный source объект (не только chatTag + messageId)

2. Изменить `main/handlers/notificationManager.js`:
   - Принимает source в `showCustomNotification`
   - Сохраняет в notifItems со ВСЕМИ полями

3. Изменить `main/handlers/notifHandlers.js`:
   - notify:clicked отправляет полный source
   - notify:mark-read — то же

4. Тесты regression

#### Done criteria

- [x] Source несётся через IPC
- [x] **Юзер подтвердил «дальше»**

---

### M0.5 — Регрессия и финальная проверка Phase 0

#### Действия

1. Запустить ВСЕ тесты проекта
2. Manual smoke test всех старых сценариев:
   - Обычные уведомления приходят
   - Клик «→ Перейти к чату» работает (как раньше + теперь cross-tab)
   - Клик «✓ Прочитано» работает
   - NativeApp render не ломается
   - AI Sidebar работает как раньше (текстовые suggestions)
3. Commit + push

#### Done criteria

- [x] Все тесты passed
- [x] Manual smoke test ОК
- [x] Версия bump v0.95.50 → v0.96.0 (major — новая архитектура)
- [x] Commit + push
- [x] **Юзер подтвердил → готов к Phase 1**

---

## Phase 1 — Tools каркас (детальные чекпойнты)

### M1.1 — Tool Registry

(см. [phases/phase-1-tools.md](./phases/phase-1-tools.md))

#### Done criteria

- [x] Registry с register / lookup / list работает
- [x] 5 unit тестов passed
- [x] **Юзер подтвердил «дальше»**

### M1.2 — Tool Schemas (read-only)

Детали в phase-1-tools.md.

### M1.3 — Handlers для 3 read-only tools

Детали в phase-1-tools.md.

### M1.4-M1.6 — Adapters провайдеров

Детали в phase-1-tools.md и [providers.md](./providers.md).

### M1.7 — aiToolExecutor

Главный модуль агента. Тестируется отдельно.

### M1.8 — aiContextBuilder

### M1.9 — IPC bridge

---

## Phase 2 — Permissions (см. phase-2-permissions.md)

## Phase 3 — UI агента (см. phase-3-agent-ui.md)

## Phase 4 — Расширения (см. phase-4-extensions.md)

---

## Что делать если что-то пошло не так

### Локальные тесты не проходят

1. НЕ коммитить
2. Записать проблему в problems.md
3. Спросить юзера: «Тест X не проходит. Гипотеза причины: …. Делать диагностику?»
4. Делать только то что разрешил

### Юзер сказал «не работает»

1. Не паниковать
2. Спросить детали: «Какой сценарий? Что видишь? Что в логах?»
3. Записать в problems.md
4. Diagnose → план → подтверждение → fix

### Time-box exceeded (3+ часа на milestone)

1. Стоп
2. Записать в progress.md что попытано, что не сработало
3. Сообщить юзеру: «M0.X занял 3+ часа. Что есть, что не работает, что пробовал. Гипотезы:…»
4. Ждать решения

### Регрессия — что-то старое сломалось

1. **Немедленный rollback** проблемного изменения (`git checkout HEAD -- file`)
2. Записать в problems.md
3. Сообщить юзеру

### Юзер передумал

1. Откатить изменения если ещё не закоммичено
2. Если закоммичено — revert commit (новый коммит)
3. Обновить план в overview.md

---

## Финальный чеклист перед каждым git push

- [ ] Все тесты проходят
- [ ] Lint 0 ошибок
- [ ] fileSizeLimits 334/334
- [ ] check-memory здоров
- [ ] progress.md обновлён
- [ ] changelog.md обновлён
- [ ] problems.md обновлён
- [ ] Версия bumped в 4 местах (package.json, package-lock.json × 2, CLAUDE.md × 2, features.md)
- [ ] Юзер дал «push»
- [ ] Pre-push hooks проходят

---

## Ссылки

- [progress.md](./progress.md) — текущий статус
- [problems.md](./problems.md) — известные проблемы
- [changelog.md](./changelog.md) — что сделано детально
- [phases/](./phases/) — детали по фазам
