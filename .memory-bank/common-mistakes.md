# Типичные ошибки — ChatCenter (индекс)

**Версия**: v0.87.68 (24 апреля 2026)
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
- Скролл InboxMode (initial/load-older/firstUnread), счётчик непрочитанных и markRead
- IntersectionObserver: ratio≥0.95 недостижим для длинных сообщений; гонка авто-load-older
- 🟡 Перетаскивание строк ВНУТРИ react-window — тупик + урок «уточни требование до переделки»
- Связанный handoff: [`native-scroll-diagnostics-handoff.md`](./native-scroll-diagnostics-handoff.md)

### 2. [`mistakes/webview-injection.md`](./mistakes/webview-injection.md)
**Когда читать**: ЯДРО — injection в WebView, DOM-селекторы.
- Telegram Web K, MAX sidebar DOM
- MutationObserver, executeJavaScript
- Спам-фильтры (IPC без фильтра, `shared/spamPatterns.json`)
- `toDataUrl` зависание, context isolation
- Двойной звук (4 пути воспроизведения)
- `mark-read` throttling в фоне (Chromium background)
- 🔴 Экран/вкладка сами меняются; сброс кэша ≠ сброс значка (434, 436, 441)

### 2b. [`mistakes/webview-navigation-ui.md`](./mistakes/webview-navigation-ui.md)
**Когда читать**: навигация между чатами + UI-интеграция в WebView.
- Навигация: `location.hash`, `history.pushState`, `buildChatNavigateScript`
- MAX SvelteKit: `scrollListContent` (sidebar vs чат), `messageWrapper ≠ message`
- Pipeline text truncation (60 символов), enrichment header MAX
- Sender-based dedup через 3 пути, dedup-суффикс
- Ribbon CSS/UI в WebView: mouse-события в transparent окне, auto-dismiss, fade-out, FIFO
- CSS `.messenger-name` невидимый

### 2c. [`mistakes/webview-stack-grouping.md`](./mistakes/webview-stack-grouping.md)
**Когда читать**: стековая группировка сообщений в ribbon, ghost-items, `cleanupStack`.
- FIFO-порядок добавления/удаления
- Race conditions при добавлении во время cleanup
- Фантомные элементы (ghost-items) после анимаций
- Правила очистки устаревших элементов

### 2d. [`mistakes/app-layout.md`](./mistakes/app-layout.md)
**Когда читать**: раскладка НАШЕГО экрана — «панель уехала за край», «окно чата обрезано»,
«дёргается при переключении», «панель не той ширины». Не путать с 2b (там UI внутри чужих страниц).
- 🔴 Нет `min-width: 0` → лишнее уезжает за край МОЛЧА (454); потолок в анимируемом свойстве → панель отстаёт (456); приём, меняющий геометрию, на каждом показе → дёргание (457)
- 🟡 «Немой страж» (нужен ВЫЗОВ, не имя); почему нельзя слушателем размера окна (455-456)

### 3. [`mistakes/notifications-ribbon.md`](./mistakes/notifications-ribbon.md)
**Когда читать**: задача про уведомления, ribbon-окно, кастомные нотификации.
- Ribbon-окно (transparent/frameless), перехват Notification API, enrichment + dedup
- CSS fade-out мигание, FIFO deadlock, emoji regex, пустой body = стикер
- Док (полоска задач): вертикаль по стабильному якорю, а не из живой `getBounds()` (v1.2.80–89, [[ADR-018]])
- Уведомление теряет поля payload (accountName) — добавлять в `showCustomNotification` (v1.2.87)
- CSS `display:none` в правиле нельзя перекрыть `style.display=''` (v1.2.83)
- Карточки: «Стопка», одиночное фото `contain`+blur, таймаут на «вечную» крутилку (v1.2.96–100, [[ADR-020]])
- «Невидимая стена»: гасить по ВИДИМОМУ (`calcHeight`), а не по числу записей; «поверх всех» через `screen-saver`+reassert (v1.2.106–128)
- 📦 Старые ловушки (#28–#32, v0.89.35–v1.2.7) вынесены в [`mistakes/notifications-ribbon-history.md`](./mistakes/notifications-ribbon-history.md) (v1.2.78, разгрузка)

### 4. [`mistakes/electron-core.md`](./mistakes/electron-core.md)
**Когда читать**: Electron-инфраструктура, IPC, WebView core, настройки, AI.
- `ELECTRON_RUN_AS_NODE=1` ломает Electron API (см. [`scripts/dev.cjs`](../scripts/dev.cjs))
- WebView: partition, preload, context isolation, zoom, session
- Settings (`SettingsPanel`), AI-панель (`AISidebar`), авто-ответ
- ИИ-интеграция: 4 провайдера (OpenAI/Anthropic/DeepSeek/GigaChat)
- Кастомные уведомления (v0.39.0) — общая справка, не ловушки
- 🟡 Нельзя выводить «объект удалён» из отсутствия в `store.chats` (список неполный: кэш-подмножество + `tg:chats` замена) — теряет постоянные данные (пример: авто-чистка пинов, v1.2.140)
- 🔴 «Чёрный экран» после добавления аккаунта = залипший `loginFlow=success` держит экран входа поверх чатов (не крэш, данные целы); флаг-процесса нужно сбрасывать в терминальном success (v1.2.147)

📦 Старые ловушки этой темы (до 2026-06-24) — в [`mistakes/electron-core-history.md`](./mistakes/electron-core-history.md) (v1.2.458, разгрузка)

### 5. [`mistakes/tdlib-video-player.md`](./mistakes/tdlib-video-player.md)
**Когда читать**: воспроизведение видео/фото из TDLib, `cc-media` protocol, Range requests, прогрессивное воспроизведение.
- `HTMLMediaElement.buffered` ≠ файл на диске; `video.supports_streaming` проверять обязательно
- `net.fetch('file://')` не пробрасывает Range — нужен `fs.createReadStream({start, end})`
- ВСЁ медиа через `cc-media://`; snapshot API обязаны возвращать кеш, не только события
- НЕ добавлять «защитные кнопки» вместо устранения причины; логи renderer — через `app:log`

### 6. [`mistakes/tdlib-forum.md`](./mistakes/tdlib-forum.md)
**Когда читать**: задача про forum topics в native Telegram, supergroup metadata, `is_forum`, `chatTypeSupergroup`, getSupergroup, updateSupergroup.
- `is_forum` в `supergroup` объекте, НЕ в `chatTypeSupergroup` (TDLib spec)
- При работе с TDLib metadata — сверять с td_api spec (поля могут быть в supergroupFullInfo / userFullInfo / supergroup)

### 📦 [`archive/`](./archive/)
**Когда читать**: **только если пользователь явно попросил** заглянуть в архив.
- `2026-04-common-mistakes-resolved.md` — секции ⚪ ИСТОРИЯ из старого common-mistakes.md (решено в v0.87.51 через удаление `groupedUnread`)

---

## 🔄 История файла

**Было до 24 апреля 2026**: монолит на 294 КБ — превышал лимит `Read` (256 КБ). **24 апреля 2026 (v0.87.54)**: разложен по темам в `mistakes/` + архив; этот файл стал индексом.

**Как добавлять новые ловушки**:
1. Определить тему: native-scroll / webview / ribbon / electron → выбрать файл из `mistakes/`
2. Если ни одна не подходит — обсудить с пользователем, создать новый файл `mistakes/<новая-тема>.md` + добавить в этот индекс
3. Не писать обратно в этот индекс — он должен оставаться компактным (цель: ≤10 КБ)

**Как переводить ловушку в архив**:
1. Когда секция помечена `⚪ ИСТОРИЯ (РЕШЕНО)` и прошло 2+ недели стабильности — перенести в `archive/YYYY-MM-<причина>.md`
2. Обновить журнал в [`archive/README.md`](./archive/README.md)
