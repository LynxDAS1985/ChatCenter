# Типичные ошибки — ChatCenter (индекс)

**Версия**: v0.87.54 (24 апреля 2026)
**Структура**: файл-индекс. Реальные ловушки разложены по темам в [`mistakes/`](./mistakes/). Решённые и неактуальные ловушки — в [`archive/`](./archive/).

---

## ⚠️ Как читать этот файл

**НЕ читай всё подряд.** Файл-индекс нужен чтобы найти **нужную тему**, потом читать только соответствующий файл из `mistakes/`.

**Порядок действий для AI**:
1. Прочитать этот индекс (5 КБ)
2. Найти тему по симптому / области кода
3. Прочитать только нужный файл `mistakes/<тема>.md` (30–130 КБ)
4. Если тема не нашлась — `Grep` по `.memory-bank/mistakes/` (но не по `.memory-bank/archive/`)

---

## 📚 Темы

### 1. [`mistakes/native-scroll-unread.md`](./mistakes/native-scroll-unread.md)
**Когда читать**: задача связана с native-режимом Telegram, скроллом, счётчиком непрочитанных.
- Native InboxMode scroll: initial-scroll, load-older, firstUnread
- Unread counter: markRead, groupedUnread (удалён в v0.87.51), синхронизация с MTProto
- IntersectionObserver: ratio≥0.95 недостижим для длинных msg (v0.87.47)
- Гонка авто-load-older + browser scroll anchoring (v0.87.48)
- State в InboxMode: сброс по activeChatId (v0.87.52-0.87.53)
- Связанный handoff: [`native-scroll-diagnostics-handoff.md`](./native-scroll-diagnostics-handoff.md)

### 2. [`mistakes/webview-injection.md`](./mistakes/webview-injection.md)
**Когда читать**: работа с WebView мессенджеров, инъекция скриптов, DOM-селекторы.
- WebView selectors: Telegram Web K, MAX (SvelteKit), VK
- MutationObserver, стековая группировка, ghost-items
- Спам-фильтры (IPC без фильтра, `shared/spamPatterns.json`)
- `executeJavaScript`: `toDataUrl` зависание, context isolation
- Навигация: `location.hash`, `history.pushState`, `buildChatNavigateScript`

### 3. [`mistakes/notifications-ribbon.md`](./mistakes/notifications-ribbon.md)
**Когда читать**: задача про уведомления, ribbon-окно, кастомные нотификации.
- Messenger Ribbon: BrowserWindow (transparent, focusable:false, frameless)
- Notification API перехват: ServiceWorker + backup path + dedup
- Enrichment addedNodes: timing + селекторы + dedup race
- CSS fade-out мигание, FIFO deadlock
- Emoji regex, пустой body = стикер
- Startup ribbon, "Перейти к чату", ribbonExpandedByDefault

### 4. [`mistakes/electron-core.md`](./mistakes/electron-core.md)
**Когда читать**: Electron-инфраструктура, IPC, WebView core, настройки, AI.
- `ELECTRON_RUN_AS_NODE=1` ломает Electron API (см. [`scripts/dev.cjs`](../scripts/dev.cjs))
- WebView: partition, preload, context isolation, zoom, session
- Settings (`SettingsPanel`), AI-панель (`AISidebar`), авто-ответ
- ИИ-интеграция: 4 провайдера (OpenAI/Anthropic/DeepSeek/GigaChat)
- Кастомные уведомления (v0.39.0) — общая справка, не ловушки

### 📦 [`archive/`](./archive/)
**Когда читать**: **только если пользователь явно попросил** заглянуть в архив.
- `2026-04-common-mistakes-resolved.md` — секции ⚪ ИСТОРИЯ из старого common-mistakes.md (решено в v0.87.51 через удаление `groupedUnread`)

---

## 🔄 История файла

**Было до 24 апреля 2026**: один монолитный файл `common-mistakes.md` на 294 КБ (2342 строки, 66 секций). Превышал лимит `Read` (256 КБ), замедлял каждую сессию.

**Разбиение 24 апреля 2026 (v0.87.54)**: разложен по 4 тематическим файлам в `mistakes/` + 1 архивный в `archive/`. Новый индекс (этот файл) — 5 КБ.

**Как добавлять новые ловушки**:
1. Определить тему: native-scroll / webview / ribbon / electron → выбрать файл из `mistakes/`
2. Если ни одна не подходит — обсудить с пользователем, создать новый файл `mistakes/<новая-тема>.md` + добавить в этот индекс
3. Не писать обратно в этот индекс — он должен оставаться компактным (цель: ≤10 КБ)

**Как переводить ловушку в архив**:
1. Когда секция помечена `⚪ ИСТОРИЯ (РЕШЕНО)` и прошло 2+ недели стабильности — перенести в `archive/YYYY-MM-<причина>.md`
2. Обновить журнал в [`archive/README.md`](./archive/README.md)
