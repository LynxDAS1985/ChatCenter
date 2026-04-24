# Memory Bank — ChatCenter

Это единственный источник истины для проекта ЦентрЧатов / ChatCenter.

**Версия**: v0.87.60 (24 апреля 2026)

---

## 📂 Структура

### Активные файлы в корне `.memory-bank/`

| Файл | Содержимое | Читать когда |
|------|------------|--------------|
| `README.md` | Этот файл — карта Memory Bank | Всегда |
| `architecture.md` | Архитектура, слои, схема процессов, структура папок | Перед любой задачей |
| `coding-rules.md` | Стиль кода, IPC, WebView, безопасность | Перед написанием кода |
| `workflow.md` | Правила работы AI, планирование, чеклист | Перед началом задачи |
| `common-mistakes.md` | **Индекс** ловушек (детали в `mistakes/`) | При ошибках/отладке |
| `features.md` | Changelog активных версий (старое в архиве) | При добавлении функций |
| `CHANGELOG.md` | Журнал изменений структуры Memory Bank | При правках структуры памяти |
| `native-scroll-diagnostics-handoff.md` | Диагностика скролла native | При расследовании native-scroll |
| `decisions.md` | Ключевые архитектурные решения (ADR) | При принятии решений |
| `api.md` | IPC-каналы, форматы сообщений, DTO | При работе с IPC |
| `messengers.md` | Интеграция мессенджеров: селекторы DOM | При работе с WebView |
| `ai-integration.md` | Провайдеры ИИ, промпты | При работе с ИИ |
| `autoreply.md` | Логика авто-ответчика | При работе с авто-ответом |
| `ui-components.md` | UI-компоненты, цвета, стили | При работе с UI |
| `native-mode-plan.md` | План нативного режима (в разработке) | При работе над native |

### 📚 Детализация ловушек — `.memory-bank/mistakes/`

`common-mistakes.md` в корне — это **индекс** (~5 КБ). Реальные ловушки разложены по темам:

| Файл | Темы | Размер |
|---|---|---|
| `mistakes/native-scroll-unread.md` | native скролл, счётчик, markRead, IntersectionObserver | ~19 КБ |
| `mistakes/webview-injection.md` | Ядро: injection, IPC, звук, mark-read, MAX sidebar DOM | ~9 КБ |
| `mistakes/webview-navigation-ui.md` | Навигация между чатами, MAX SvelteKit, ribbon CSS/UI | ~31 КБ |
| `mistakes/webview-stack-grouping.md` | Стековая группировка, ghost-items, cleanupStack | ~125 КБ |
| `mistakes/notifications-ribbon.md` | Кастомные уведомления, ribbon BrowserWindow | ~50 КБ |
| `mistakes/electron-core.md` | Electron, IPC, Settings, AI, авто-ответ | ~56 КБ |

**Правило чтения**: сначала индекс (`common-mistakes.md`) → по теме выбираешь файл → читаешь только его.

### 📦 Архив — `.memory-bank/archive/`

Неактуальные файлы и секции. **Агент НЕ читает архив по умолчанию** — только если пользователь явно попросил.

| Файл | Что содержит |
|------|------|
| `archive/README.md` | Правила архивации + журнал |
| `archive/2026-04-common-mistakes-resolved.md` | Секции ⚪ ИСТОРИЯ (решено в v0.87.51) |
| `archive/features-v0.87-early.md` | Changelog v0.87.0 – v0.87.39 (~140 КБ) |
| `archive/features-pre-v0.87.md` | Changelog v0.1.0 – v0.86.10 (~210 КБ) |

Подробности и правила архивации: [`archive/README.md`](./archive/README.md).

---

## 🔄 Как обновлять Memory Bank

- Обновляй файл сразу после решения задачи, пока контекст свежий
- Не дублируй информацию — ссылайся на другой файл если нужно
- Устаревшую информацию удаляй или помечай как `[DEPRECATED]`
- Добавляй дату к важным решениям: `(24 апреля 2026)`
- Если файл вырос **> 100 КБ** — разбить на подпапку + индекс (как сделано с `common-mistakes.md` → `mistakes/`; с `features.md` → `archive/features-*.md`)
- Если секция помечена `⚪ ИСТОРИЯ (РЕШЕНО)` и прошло 2+ недели стабильности — перенести в `archive/`

### Конфликт память vs код

Если запись в Memory Bank расходится с реальным кодом — **доверяй коду**. Память устаревает, код живёт. Обнови запись или удали, но не «чини» код под устаревшую память. Если не уверен — спроси пользователя.

---

## 📏 Лимиты размеров (v0.87.60)

| Файл | Максимум | Если превышен |
|---|---|---|
| Любой `.md` в `.memory-bank/` | **100 КБ** | Разбить на подпапку + индекс |
| Файл в `mistakes/` | **200 КБ** | Разбить по подтемам |
| `common-mistakes.md` (индекс) | **10 КБ** | Сократить описания тем до одной строки |

**Почему это важно**: `Read` имеет лимит 256 КБ. Файл > 200 КБ либо не прочитается, либо съест весь контекст. А контекст нужен для задачи, не для истории.

**Автоматическая защита от разрастания**:
- `node src/__tests__/memoryBankSizeLimits.test.cjs` — автотест лимитов размера
- `node src/__tests__/featuresReferences.test.cjs` — автотест валидности ссылок в последних 10 версиях features.md
- `bash scripts/check-memory.sh` (или `npm run check-memory`) — ручная проверка здоровья
- `bash scripts/regen-claude-structure.sh` (или `npm run regen-claude-structure`) — регенерация таблицы «Структура памяти» в CLAUDE.md
- **Pre-commit hook** (`scripts/hooks/pre-commit`) — запускает `check-memory.sh` если коммит трогает `.memory-bank/` или `CLAUDE.md`

**Примеры разбиения**:
- `common-mistakes.md` 294 КБ → индекс 5 КБ + `mistakes/` 4 файла (v0.87.56)
- `features.md` 445 КБ → активный 100 КБ + `archive/features-v0.87-early.md` + `archive/features-pre-v0.87.md` (v0.87.58)
- `mistakes/webview-injection.md` 165 КБ → `webview-injection.md` 130 КБ + `webview-navigation-ui.md` 31 КБ (v0.87.59)
- `mistakes/webview-injection.md` 130 КБ → `webview-injection.md` 9 КБ (ядро) + `webview-stack-grouping.md` 125 КБ (v0.87.60)

**Журнал изменений структуры памяти**: [`CHANGELOG.md`](./CHANGELOG.md).

---

## 🧩 Соглашения

- Версии решений: `ADR-001`, `ADR-002` и т.д.
- Статусы: ✅ Сделано | 🚧 В работе | ❌ Отменено | 📋 Запланировано | ⚪ ИСТОРИЯ (РЕШЕНО)
- Мессенджеры кодируем: `TG` (Telegram), `WA` (WhatsApp), `VK` (ВКонтакте), `VB` (Viber), `MAX`
