# Changelog работы (живой файл)

> **Детальный лог каждого изменения.** Заполняется ПОСЛЕ каждого коммита.
> Здесь — конкретные файлы, конкретные строки, конкретные функции.

## Структура записи

```
### YYYY-MM-DD HH:MM — Milestone MX.Y

**Версия**: vX.Y.Z
**Коммит**: <hash>
**Фаза**: Phase N
**Milestone**: MX.Y

**Изменения**:
- file/path.js: +N строк, -M строк
  - Добавлено: function foo() — что делает
  - Изменено: function bar() — что и зачем
  - Удалено: function baz() — почему

**Тесты**:
- file/path.test.js: +N тестов
  - test('что проверяет 1'): ...
  - test('что проверяет 2'): ...

**Документация**:
- Обновлён файл X

**Что проверено локально**:
- ✅ npm run lint
- ✅ npm run test:vitest
- ✅ node fileSizeLimits.test.cjs
- ✅ npm run check-memory

**Что должен проверить юзер вручную**:
- [ ] Сценарий 1: ...
- [ ] Сценарий 2: ...

**Известные проблемы**:
- ...

**Регрессии**:
- Нет / Список
```

---

## История изменений

(пусто — пока работа не начата)

---

## Шаблон новой записи

Скопируй и заполни:

```markdown
### YYYY-MM-DD HH:MM — Milestone MX.Y

**Версия**: v0.XX.YY
**Коммит**: <hash будет после коммита>
**Фаза**: Phase N
**Milestone**: MX.Y — <название>

**Изменения**:

#### Новые файлы

- `path/to/file.js` (X строк)
  - Назначение: ...
  - Экспорты: ...

#### Изменённые файлы

- `path/to/existing.js`:
  - +N строк, -M строк
  - Функция `foo`: ...
  - Функция `bar`: ...

#### Удалённые файлы

- `path/to/old.js` (был X строк)
  - Причина: ...

**Тесты**:

- `path/to/test.vitest.js`:
  - test('...'): описание
  - test('...'): описание

**Документация**:

- `.memory-bank/ai-agent-plan/progress.md` — обновлён статус M0.1 → done
- `.memory-bank/ai-agent-plan/problems.md` — отмечен [P-XX] как RESOLVED

**Проверено локально**:
- ✅ npm run lint: 0 ошибок
- ✅ npm run test:vitest: X passed
- ✅ fileSizeLimits: 334/334
- ✅ check-memory: ✅

**Что должен проверить юзер вручную**:
- [ ] Сценарий: ...
- [ ] Edge case: ...

**Регрессии**:
- Нет

**Известные ограничения**:
- ...

**Следующий milestone**: MX.Y+1
```

---

## Метрики накопительные

Будут заполняться по ходу:

| Метрика | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|---|
| Новых файлов | 0 | 0 | 0 | 0 | 0 |
| Изменённых файлов | 0 | 0 | 0 | 0 | 0 |
| +строк | 0 | 0 | 0 | 0 | 0 |
| -строк | 0 | 0 | 0 | 0 | 0 |
| +тестов | 0 | 0 | 0 | 0 | 0 |
| Coverage % | — | — | — | — | — |

---

## Глоссарий

- **M0.1**: milestone номер 0.1 (первый в Phase 0)
- **Source**: NotificationSource объект (паспорт сообщения)
- **Action Bus**: централизованный диспетчер действий
- **Tool Use**: API провайдеров для function calling
- **Schema**: JSON Schema 2020-12 описание tool
- **Adapter**: модуль конверсии universal schema → provider-specific format
- **Audit log**: лог всех AI действий

---

## Ссылки

- [progress.md](./progress.md) — общий статус
- [problems.md](./problems.md) — проблемы и решения
- [checkpoints.md](./checkpoints.md) — workflow проверок
