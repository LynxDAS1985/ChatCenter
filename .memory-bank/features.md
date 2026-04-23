# Реализованные функции — ChatCenter

## Текущая версия: v0.87.40 (23 апреля 2026)

### v0.87.40 — FIX скролл уходил наверх при открытии чата с непрочитанными

**Причина (из логов [native-scroll])**:
1. `useInitialScroll` срабатывал на КЭШЕ из localStorage (старые id 22146-22195) ДО того как пришли свежие с сервера (22242-22293). Скролл уходил на самое старое из кэша.
2. Локальный `unread=95` был завышен (реально сервер = 47). При `incoming=50, unread=95`: `max(0, 50 - 95) = 0` → anchor = самое первое = максимально наверх.

**Фикс**:
- `useInitialScroll` принимает `loading` — не срабатывает пока `loadingMessages[chatId] === true`
- `firstUnreadIdRef` пересчитывается при смене `firstId/lastId/activeUnread` (раньше только при первом появлении messages)
- Clamp: `Math.min(realUnread, incoming.length)` — защита от завышенного серверного `unreadCount`

**Файлы**: [useInitialScroll.js](src/native/hooks/useInitialScroll.js), [InboxMode.jsx](src/native/modes/InboxMode.jsx)

**Тесты**: 79/79 vitest ✅

## Диагностика native-scroll ЦентрЧатов (22 апреля 2026)

- Добавлено файловое логирование для нативного режима `ЦентрЧатов` (`src/native/*`), не для WebView-мессенджеров.
- Все строки диагностики имеют префикс `[native-scroll]` и попадают в `userData/chatcenter.log` через IPC `app:log`.
- Логируются: выбор активного чата, `unreadCount`, расчёт первого непрочитанного, initial-scroll, позиция scroll-контейнера, `top-threshold`, запуск/результат/применение `loadOlderMessages`, клики по кнопке вниз, пользовательские wheel/touch/pointer события.
- Цель: после воспроизведения бага “чат без непрочитанных открывается выше низа” по логам понять, что перебило позицию: initial-scroll, stale first-unread, авто-догрузка старых сообщений или изменение высоты контента.
- Смотреть в логе события: `store-set-active-chat` → `chat-open` → `store-load-messages` → `store-tg-messages` → `first-unread-calc` → `initial-*` → `top-threshold` / `load-older-*`.

## 🔴 СТАТУС ФИЧЕЙ v0.87.27–29 — НЕ ПОМЕЧАТЬ СДЕЛАННЫМИ ПОКА ПОЛЬЗОВАТЕЛЬ НЕ ПОДТВЕРДИТ!

| # | Фича | Статус | Комментарий пользователя |
|---|------|--------|--------------------------|
| 1 | Reply-клик → scroll к оригиналу + жёлтая вспышка 1.5с | ✅ **работает** | «работает» |
| 2 | «Новые сообщения» divider при открытии чата | ⏳ | не проверено |
| 3 | Runtime smoke-тест main-процесса | ⏳ | не проверено |
| 4 | Проверка `telegram/*` подпутей в тесте | ⏳ | не проверено |
| 5 | Avatar cache bust при logout | ⏳ | не проверено |
| 6 | Авто-очистка `tg-media/` старше 30 дней | ⏳ | не проверено |
| 7a | Клик на фото → React-overlay (v0.87.27) | ❌ | «не верно, на весь экран» — удалено |
| 7b | Клик на фото → отдельное **BrowserWindow** (v0.87.28) | ✅ **работает** | «Подойдет» |
| 8 | Индикатор новых сообщений при скролле назад | ⏳ | не проверено |
| 9 | Превью ссылок (title/description/siteName) | ⏳ | не проверено |
| 10 | Ctrl+↑ → редактирование последнего своего | ⏳ | не проверено |
| 11 | Аватарка слева от групп чужих сообщений | ✅ **работает** | «это есть» |
| 12 | IPC `photo:toggle-pin` (pin окна фото) | ⏳ | часть PhotoViewer — не проверено |
| 13 | lastMessage preview (медиа/action вместо «—») | ⏳ | не проверено |
| 14 | **Группировка медиа-альбомов** (v0.87.29) | ⏳ | «надо группировку как в телеграмме» — сделано |
| 15 | **Вариант A: скролл при открытии чата** (v0.87.29) | ⏳ | «это сделай» — сделано |
| 16 | **Жёлтая подсветка «последнее прочитанное»** (v0.87.29) | ⏳ | «это тоже надо» — сделано |

Виртуализация **списка чатов** — уже реализована в v0.87.12 через `react-window` List. Виртуализация **списка сообщений** в открытом чате — пока нет (будущая задача).

---

## Статус функций

### Инфраструктура
| Функция | Статус | Версия |
|---------|--------|--------|
| Базовая структура проекта | ✅ Сделано | v0.2.0 |
| Electron + главное окно | ✅ Сделано | v0.2.0 |
| IPC preload (contextBridge) | ✅ Сделано | v0.2.0 |
| JSON-хранилище (userData) | ✅ Сделано | v0.5.0 |
| Сохранение размера/позиции окна | ✅ Сделано | v0.5.0 |
| Трей-иконка + меню | ✅ Сделано | v0.5.0 |

### Мессенджеры
| Функция | Статус | Версия |
|---------|--------|--------|
| WebView-вкладки | ✅ Сделано | v0.2.0 |
| Telegram Web | ✅ Базово (WebView) | v0.2.0 |
| WhatsApp Web | ✅ Базово (WebView) | v0.2.0 |
| ВКонтакте | ✅ Базово (WebView) | v0.2.0 |
| Добавление мессенджера вручную (любой URL) | ✅ Сделано | v0.5.0 |
| Закрытие вкладок | ✅ Сделано | v0.5.0 |
| Подтверждение перед закрытием вкладки | ✅ Сделано | v0.31.0 |
| Закрепление вкладок (pin/lock) | ✅ Сделано | v0.32.0 |
| Персистентность списка мессенджеров | ✅ Сделано | v0.5.0 |

### Мониторинг сообщений (ChatMonitor)
| Функция | Статус | Версия |
|---------|--------|--------|
| MutationObserver в WebView preload | ✅ Сделано | v0.6.0 |
| Счётчик непрочитанных (TG/WA/VK) | ✅ Сделано | v0.6.0 |
| Передача через ipcRenderer.sendToHost | ✅ Сделано | v0.6.0 |
| Бейдж непрочитанных на вкладке | ✅ Сделано | v0.5.0 |
| Звуковой сигнал (Web Audio, двухтональный) | ✅ Сделано | v0.24.0 |
| Автопереключение вкладки при новом сообщении | ✅ Сделано | v0.24.0 |

### ИИ-помощник
| Функция | Статус | Версия |
|---------|--------|--------|
| Интеграция OpenAI GPT-4o-mini | ✅ Сделано | v0.6.0 |
| Интеграция Anthropic Claude | ✅ Сделано | v0.6.0 |
| Интеграция DeepSeek (бесплатный tier) | ✅ Сделано | v0.7.0 |
| Интеграция ГигаЧат (Сбербанк, OAuth2) | ✅ Сделано | v0.7.0 |
| Панель вариантов ответа (3 варианта) | ✅ Сделано | v0.6.0 |
| Выбор ответа одним кликом (копирование) | ✅ Сделано | v0.6.0 |
| Настройки ИИ (провайдер, модель, ключ) | ✅ Сделано | v0.6.0 |
| Resizable AI-панель (drag + запоминание) | ✅ Сделано | v0.7.0 |
| Кнопки показать/скрыть ключ | ✅ Сделано | v0.7.0 |
| SSE-стриминг ответов (токены по мере генерации) | ✅ Сделано | v0.10.0 |
| Автосохранение черновика ввода по вкладке | ✅ Сделано | v0.10.0 |
| Бейдж трея с числом непрочитанных | ✅ Сделано | v0.10.0 |
| Режим WebView AI (GigaChat/ChatGPT/Claude/DeepSeek) | ✅ Сделано | v0.11.0 |
| Разрешения на чтение чата (нет/последнее/история) | ✅ Сделано | v0.11.0 |
| Вставка контекста чата в AI WebView (executeJavaScript + clipboard) | ✅ Сделано | v0.11.0 |
| Per-provider режимы: API-ключ или Веб-интерфейс в настройках каждого ИИ | ✅ Сделано | v0.12.0 |
| Индикатор режима 🔧/🌐 на кнопке провайдера | ✅ Сделано | v0.12.0 |
| ⚙️ всегда видна (не только когда провайдер подключён) | ✅ Сделано | v0.12.0 |

### Шаблоны
| Функция | Статус | Версия |
|---------|--------|--------|
| Создание/редактирование шаблонов | ✅ Сделано | v0.8.0 |
| Быстрый поиск по шаблонам | ✅ Сделано | v0.8.0 |
| Категории шаблонов | ✅ Сделано | v0.9.0 |

### Авто-ответчик
| Функция | Статус | Версия |
|---------|--------|--------|
| Авто-ответ по ключевым словам | ✅ Сделано | v0.8.0 |
| Авто-ответ по расписанию | 📋 Запланировано | — |
| Авто-ответ для конкретного чата | 📋 Запланировано | — |
| ИИ-авто-ответ | 📋 Запланировано | — |
| Задержка перед ответом | 📋 Запланировано | — |

### Настройки
| Функция | Статус | Версия |
|---------|--------|--------|
| Настройки ИИ-провайдера/ключа/модели | ✅ Сделано | v0.6.0 |
| Управление мессенджерами | ✅ Сделано | v0.5.0 |
| Поиск в мессенджере (findInPage) | ✅ Сделано | v0.5.0 |
| Тёмная/светлая тема | ✅ Сделано | v0.6.0 |
| Горячие клавиши (Ctrl+1-9, T, W, F, ,) | ✅ Сделано | v0.6.0 |
| Drag-and-Drop порядок вкладок | ✅ Сделано | v0.6.0 |
| Управление правилами авто-ответа | ✅ Сделано | v0.8.0 |

---

## Changelog

### v0.87.39 (17 апреля 2026) — Тонкий header 24px + полная история решения видео-окна

**Вариант C: тонкий 24px header** с нативными кнопками Windows, видео на всю площадь.
- `titleBarOverlay: { height: 24 }` (было 36)
- toolbar встроен в titlebar (position: fixed, top: 0, height: 24px)
- Видео `height: calc(100vh - 24px)` (было 100% - 36px)
- Кнопки toolbar: padding 1px 6px, font-size 12px (компактнее)
- Title: flex: 1, app-region: drag (перетаскивание за заголовок)
- 📌 pin убрана (не работала), оставлена ◰ PiP

**ПОЛНАЯ ИСТОРИЯ РЕШЁННЫХ ПРОБЛЕМ v0.87.26–39:**

| Проблема | Причина | Решение | Версия |
|---|---|---|---|
| Разделители дат не видны | `rgba(255,255,255,0.04)` на чёрном | Акцентный фон + линии по бокам | v0.87.26 |
| Фото одиночное крохотное | bubble maxWidth 65% схлопывался | minWidth: 280, maxWidth: min(420,65%) | v0.87.26 |
| Счётчик непрочитанных (readByVisibility._timer) | Property на пересоздаваемой функции | useRef для таймера | v0.87.26 |
| Rescan unread только 50 чатов | getDialogs limit:50 без пагинации | fetchAllUnreadUpdates 5×100 | v0.87.26 |
| Named export Helpers not found | CJS пакет telegram, named import | import from 'telegram/Utils.js' | v0.87.25 |
| Reply-клик scroll | Не было | scrollIntoView + жёлтая вспышка | v0.87.27 |
| Аватарка в группе чужих | Не было | .native-msg-avatar 32×32 | v0.87.27 |
| PhotoViewer overlay вместо окна | React overlay на весь экран | BrowserWindow frameless | v0.87.28 |
| lastMessage «—» для медиа | d.message.message пустой | messagePreview() с типами | v0.87.28 |
| Медиа-альбомы по очереди | Нет groupedId группировки | collapseAlbums + MediaAlbum grid | v0.87.29 |
| Скролл при открытии чата | Не скроллил к непрочитанному | useInitialScroll (Вариант A) | v0.87.29 |
| Жёлтая подсветка last-read | Не было | CSS native-last-read-glow 3.5с | v0.87.29 |
| CI snapshots TZ mismatch | getHours = UTC в CI, MSK локально | vitest.setup.js forceUTC | v0.87.32 |
| Video-альбомы не грузились | thumb=false для video = полный файл | thumb=true для video (постер) | v0.87.33 |
| Unread не уменьшался (альбомы) | onVisible только для firstMsg | IntersectionObserver все msgs | v0.87.33 |
| IntersectionObserver threshold 0.5 | Короткие bubble не пересекали | threshold: 0.15 + forceReadAtBottom | v0.87.34 |
| Видео inline не было | Отдельное окно (не в чате) | VideoTile inline `<video>` + ⛶ | v0.87.36 |
| Skeleton при загрузке не было | «Нет сообщений» вместо загрузки | MessageSkeleton + shimmer | v0.87.36 |
| Стрелка ↓ уезжала при скролле | position:absolute в scroll-div | wrapper relative, кнопка снаружи | v0.87.36 |
| Скролл к старым = unread растёт | markAsRead УСТАНАВЛИВАЕТ watermark | maxEverSentRef guard (никогда не уменьшаем) | v0.87.37 |
| Unread в списке устаревший | tg:chats заменял массив | merge Math.max(ts) + syncPerChat | v0.87.38 |
| Видео-окно пустой плеер | readFileSync блокировал / cc-media не работал | net.fetch + bypassCSP | v0.87.38 |
| Кнопки видео-окна не работали | const video конфликт с window.video от preload | const videoEl | v0.87.38 |
| Время в логах UTC | toISOString / getHours | toLocaleString('sv-SE') | v0.87.38 |
| React duplicate keys | tg:new-message без дедупликации | existing.some(m.id) | v0.87.38 |
| Толстая чёрная рамка видео | titleBarOverlay height:36 + margin | height:24 + toolbar в titlebar | v0.87.39 |

### v0.87.38 (17 апреля 2026) — FIX видео в отдельном окне + убрана 📌 из inline + FIX сортировка чатов

**Пользовательский feedback v0.87.36/37**:
- ✅ Видео в чате воспроизводится inline — РАБОТАЕТ
- ❌ Отдельное окно не показывает видео (пустой плеер)
- ❌ Зачем 📌 рядом с ⛶ в чате — булавка есть в отдельном окне, в чате не нужна
- ❌ Чаты с новыми сообщениями не поднимаются вверх списка

**Fix 1: Видео в отдельном окне не работало** ([ccMediaProtocol.js](main/native/ccMediaProtocol.js)):
Для запроса без Range-заголовка использовался `fs.readFileSync(filePath)` → для видео 50+ МБ это блокировало main thread на несколько секунд → `<video>` в BrowserWindow считал что ответ не пришёл → показывал пустой плеер с 0:00. **Фикс**: заменил `readFileSync` на `fs.createReadStream` → `ReadableStream`. Теперь первые байты отдаются мгновенно, видео начинает играть сразу.

**Fix 2: Убрана 📌 из inline-видео** ([VideoTile.jsx](src/native/components/VideoTile.jsx)):
Оставлена только кнопка ⛶ (открыть в отдельном окне). 📌 (pin/PiP) доступна только внутри отдельного окна — дублирование убрано.

**Fix 3: Чаты с новыми сообщениями не поднимались наверх** ([nativeStore.js](src/native/store/nativeStore.js)):
В `tg:chats` handler при получении новых данных от сервера — полностью ЗАМЕНЯЛ массив чатов. Серверный `lastMessageTs` мог быть СТАРЕЕ чем наш локально обновлённый (из `tg:new-message`). Результат: чат с новым сообщением падал вниз списка. **Фикс**: merge вместо replace — `Math.max(c.lastMessageTs, old.lastMessageTs)` для каждого чата, сохраняем БОЛЕЕ НОВЫЙ timestamp.

**Проверить**:
- [ ] Нажми ⛶ на играющем видео → отдельное окно показывает видео и играет (не пустой плеер)
- [ ] В inline-видео в чате — только одна кнопка ⛶ (📌 нет)
- [ ] Получи новое сообщение в каком-нибудь чате → этот чат поднимается наверх списка
- [ ] Подожди 15 сек (periodic rescan) → чат с новым сообщением остаётся наверху (не падает)

### v0.87.37 (17 апреля 2026) — CRITICAL FIX: скролл к старым сообщениям сбрасывал watermark → unread=50

**Пользовательский feedback v0.87.36**: «Прочитал все сообщения, было 0. После отмотки на старые — счётчик стал 50. Так в любом чате.»

**Корневая причина (Ловушка 93)**:
В MTProto `client.markAsRead(entity, maxId)` — УСТАНАВЛИВАЕТ (не увеличивает) read-watermark на maxId.
При скролле вверх IntersectionObserver видел старые сообщения (id=100) → `readByVisibility` вызывался → через 1.5с `markRead(chatId, maxId=100, count)` → main: `client.markAsRead(entity, 100)` → сервер **СБРАСЫВАЛ** watermark с 150 до 100 → сообщения #101–#150 снова «непрочитанные» → `GetPeerDialogs` → `unreadCount=50` → бейдж растёт вместо уменьшения.

**Фикс (ДВА уровня защиты)**:

1. **Main-процесс** ([telegramHandler.js](main/native/telegramHandler.js)):
   - `markReadMaxSent: Map<chatId, maxId>` — хранит максимальный id отправленный на сервер
   - Перед `markAsRead`: проверяем `numMaxId < prev` → SKIP (логируем, не отправляем)
   - Только если `numMaxId > prev` → отправляем + обновляем Map

2. **Renderer** ([InboxMode.jsx](src/native/modes/InboxMode.jsx)):
   - `maxEverSentRef = useRef(0)` — максимальный id отправленный в текущей сессии чата
   - В `readByVisibility` timer: `if (lastReadMax <= maxEverSent) return` → не дёргаем IPC
   - В `useForceReadAtBottom`: `if (lastId <= maxEverSent) return`
   - При смене чата `maxEverSentRef.current = 0` (другой чат — другой watermark)

**Результат**: watermark НИКОГДА не уменьшается. При скролле к старым — ничего не отправляется. При скролле к новым — продвигается.

**Что проверить**:
- [ ] Открой чат → пролистай до конца → unread=0
- [ ] Прокрути ВВЕРХ к самым старым сообщениям → **unread ОСТАЁТСЯ 0** (не растёт!)
- [ ] Прокрути снова вниз → тоже 0
- [ ] Переключись на другой чат с непрочитанными → unread уменьшается нормально
- [ ] Закрой-открой приложение → watermark сохранён корректно

### v0.87.36 (16 апреля 2026) — Inline видео + ⛶/📌 + Кэш сообщений + Shimmer + Fix стрелки ↓

**Выбор пользователя**:
- ✅ **Видео — Вариант 1** (inline в чате + кнопка ⛶ для окна + 📌 для PiP)
- ✅ **Загрузка — Вариант 5** (кэшированные сообщения + shimmer поверх)
- ✅ Fix стрелки ↓ (вынести из scroll-контейнера)

**1. Inline видео-плеер в bubble**:
Переделал [VideoTile.jsx](src/native/components/VideoTile.jsx):
- До клика: постер (thumb) + ▶ + duration/size в углу (как было)
- Клик ▶: скачивает видео с прогресс-баром
- После скачивания: **заменяет постер на `<video controls autoplay playsInline>`** в той же bubble
- **В углу overlay-кнопок**: `⛶` (раскрыть в отдельное окно) + `📌` (PiP — мини поверх всех окон)
- При клике ⛶/📌: inline-видео ставится на паузу, открывается отдельное окно с **той же секунды** через `currentTime`
- **IntersectionObserver**: если bubble уехал из viewport → авто-пауза (не играет невидимое)
- cc-media:// уже поддерживает Range → стриминг и перемотка работают

**Исправление videoPlayerHandler.js**:
- `let prevBounds = null` перенесён в начало функции (раньше был после `video:open` → ReferenceError при PiP-старте)
- `video:open` принимает `startTime` + `pip` → передаётся в окно через `photo:set-srcs` event
- Если `pip: true` при открытии → окно сразу становится мини (480×270, alwaysOnTop)

**video-player.html** — применяет `startTime` в `onSetSrc` (через `loadedmetadata` event если не готово), синхронизирует состояние `pipBtn` если открылось в PiP.

**2. Кэш сообщений + shimmer-загрузка**:
- `localStorage` ключ `chat-messages:{chatId}` — хранит последние 50 сообщений
- При `loadMessages(chatId)` в [nativeStore.js](src/native/store/nativeStore.js):
  - Если для чата нет в `s.messages` → подставляем из кэша **мгновенно**
  - Поднимаем флаг `loadingMessages[chatId] = true`
- Когда `tg:messages` event пришёл → кэш обновляется свежими данными + флаг снимается
- Новый компонент [MessageSkeleton.jsx](src/native/components/MessageSkeleton.jsx):
  - `<MessageSkeleton count={5}>` — 5 серых плейсхолдеров с shimmer-анимацией (для пустого чата в момент первой загрузки)
  - `<MessageListOverlay show>` — синяя полоска сверху + тост «⏳ Обновляю сообщения» (когда кэш уже показан, грузим свежее)
- CSS: `@keyframes native-shimmer` — translateX slide-анимация 1.6с

**3. Fix стрелки ↓**:
Раньше кнопка `.native-scroll-bottom-btn` была **внутри** `msgsScrollRef` div (с `overflow-y: auto`). `position: absolute` в scroll-контейнере позиционируется относительно **начала** контента, не окна → при скролле уезжала вместе с сообщениями.

**Фикс**: обернул scroll-div в **relative wrapper** `<div style={{position:'relative', display:'flex', flexDirection:'column', minHeight:0}}>`. Scroll-div стал без position:relative, кнопка ↓ вынесена в wrapper → позиционируется относительно wrapper (не scroll) → **остаётся на месте при скролле**.

**4. Рефакторинг** (InboxMode 605 → 588):
- Новый хук [useMessageActions.js](src/native/hooks/useMessageActions.js) — handleDelete/handleForward/handleForwardSelect/handlePin

**5. Тесты**: **76 vitest** (было 68)
- [MessageSkeleton.vitest.jsx](src/native/components/MessageSkeleton.vitest.jsx) — 6 тестов (render count / shimmer / overlay / чередование сторон)
- [VideoTile.vitest.jsx](src/native/components/VideoTile.vitest.jsx) — 3 новых:
  - `клик → inline play (без video:open)`
  - `v0.87.36: кнопка ⛶ → video:open с startTime`
  - `v0.87.36: кнопка 📌 → video:open с pip=true`

**Что проверить**:
- [ ] Клик по видео в чате → постер сменяется на играющее `<video>` **в той же bubble** (не в отдельном окне)
- [ ] В углу играющего видео две кнопки: ⛶ и 📌
- [ ] ⛶ → отдельное окно плеера, видео продолжает **с той же секунды**
- [ ] 📌 → мини-окно 480×270 в углу, alwaysOnTop, resizable
- [ ] Прокрути видео вниз (за viewport) → автоматически ставит на паузу
- [ ] Открой чат с которым раньше общался → сразу видишь старые сообщения (из кэша), сверху синяя полоска «Обновляю»
- [ ] Открой чат первый раз → видишь **shimmer-скелетон** 5 плейсхолдеров (не «Нет сообщений»)
- [ ] Через 1-3 сек скелетон исчезает, появляются реальные сообщения
- [ ] Стрелка ↓ в правом-нижнем углу чата **видна** при скролле, не уезжает с контентом
- [ ] Клик ↓ скроллит к первому непрочитанному (как раньше)

### v0.87.35 (16 апреля 2026) — Unread в списке точный + стрелка к непрочитанному + PiP + LRU квота + subs/audio tracks

**СТАТУС ОТ ПОЛЬЗОВАТЕЛЯ** (16 апреля 2026):
- ✅ **Unread-счётчик в списке чатов — РАБОТАЕТ** (v0.87.35)
- ✅ **Прочитанные сообщения — РАБОТАЮТ** (v0.87.37: скролл к старым НЕ сбрасывает watermark, подтверждено пользователем 17 апреля 2026)
- ✅ **Стрелка «↓» — РАБОТАЕТ** (v0.87.36, подтверждено 17 апреля 2026)
- ✅ **Inline видео в чате — РАБОТАЕТ** (v0.87.36, подтверждено — видео воспроизводится)
- ✅ **Skeleton при первом открытии чата — РАБОТАЕТ** (v0.87.36, подтверждено 17 апреля 2026)
- ❌→🔧 **Видео в отдельном окне — НЕ РАБОТАЛО** (v0.87.36-38: пустой плеер 0:00, без ошибок).
  - **Попытка 1** (v0.87.38): readFileSync → ReadableStream. Не помогло.
  - **Попытка 2** (v0.87.38): ready-to-show → did-finish-load + 200мс. Не помогло.
  - **Попытка 3** (v0.87.38): cc-media:// → file:// для BrowserWindow. Не помогло.
  - **Корень проблемы**: preload НЕ загружался → `window.video` = undefined → IPC `video:set-src` терялся → `video.src` оставался ПУСТЫМ → `<video>` без src не генерирует ошибок (readyState=0, error=null — тишина).
  - **Почему watchdog не сработал**: проверял `readyState < 2` но НЕ проверял `!video.src`. Пустой src = не ошибка по мнению браузера.
  - **Попытка 4** (v0.87.38): loadFile({query: {src}}) + URLSearchParams fallback. НЕ ПОМОГЛО — src всё равно не доходит.
  - **Попытка 5** (v0.87.38): `executeJavaScript` прямой inject `v.src = '...'` после did-finish-load. Обходит preload, query, IPC — прямо в DOM. Ожидает подтверждения.
  - **Попытка 6** (v0.87.38): `net.fetch(pathToFileURL)` + `bypassCSP:true` в protocol handler (из Electron docs + issue #38749). **ВИДЕО ЗАИГРАЛО!** Но кнопки (close/pin/pip/min/max) не работают — preload не загружается → `window.video` = undefined.
  - **Фикс кнопок** (v0.87.38): fallback `window.close()` для закрытия + Esc.
  - **ВАЖНО**: Пользователь тестировал на СТАРОЙ СБОРКЕ (логи от 09:33, последний билд 14:31). Все фиксы v0.87.38 (net.fetch, bypassCSP, дедупликация, fallback кнопок) НЕ были применены. Нужен полный перезапуск `npm run dev`.
  - **Попытка 7** (v0.87.38): кнопки pin/pip не работали (preload не загружается). Фикс: console.log('__CC_VIDEO__pin:1') из HTML → main ловит через webContents.on('console-message') → setAlwaysOnTop/setBounds. Ожидает подтверждения.
  - **Также**: R:ERROR в логах показывал UTC время (toISOString) вместо локального (toLocaleString).
  - **КОРЕНЬ ПРОБЛЕМЫ НАЙДЕН** (попытка 8): preload через `contextBridge.exposeInMainWorld('video', {...})` создавал `window.video`. А в `<script>` HTML было `const video = document.getElementById('v')` — КОНФЛИКТ имён! `SyntaxError: Identifier 'video' has already been declared` → весь JS крашился → ни кнопки, ни src, ни watchdog не работали. **Фикс**: переименовал `const video` → `const videoEl` по всему HTML. Preload РАБОТАЛ всё это время!
  - **Попытка 9** (v0.87.38): кнопки вернули на preload IPC. ◰ PiP РАБОТАЕТ ✅. 📌 pin НЕ работает — убрана из UI.
  - **Итого v0.87.38**: видео ✅, нативные close/min/max ✅, ◰ PiP ✅, 📌 убрана.
  - **v0.87.39**: видео-альбом = постеры (как Telegram), тонкий header 24px, окно подстраивается под размер.
  - **Проблемы из логов (v0.87.39)**: (1) rescan спамил — фикс: логируем при изменении; (2) FLOOD_WAIT аватарки; (3) deprecated API; (4) кодировка терминала.
  - ✅ **Компоновка видео-альбома — ЗАКРЫТО** (v0.87.39): постеры как в Telegram + сетка, не обрезается.
  - **v0.87.39 доп**: постеры видео thumb=false (чёткие, не blur), окно по умолчанию 60% от оригинала.

### ИТОГОВЫЙ СТАТУС v0.87.25–39 (17 апреля 2026)

**✅ ПОДТВЕРЖДЕНО пользователем:**
- Reply-клик scroll + вспышка (v0.87.27)
- PhotoViewer отдельное окно (v0.87.28)
- Аватарка в группе чужих (v0.87.27)
- Unread-счётчик в списке (v0.87.35)
- Прочитанные сообщения / watermark (v0.87.37)
- Inline видео в чате (v0.87.36)
- Стрелка ↓ не уезжает (v0.87.36)
- Skeleton при загрузке (v0.87.36)
- Компоновка видео-альбома как Telegram (v0.87.39)

**⏳ ОЖИДАЕТ ПРОВЕРКИ:**
- Divider «Новые сообщения»
- Вариант A скролла к непрочитанному
- Жёлтая подсветка last-read
- Link preview карточки
- Ctrl+↑ редактирование
- lastMessage preview (🖼 Фото вместо —)
- Медиа-альбомы фото сеткой
- Shimmer overlay при повторном открытии
- Avatar cache bust при logout
- Auto-cleanup tg-media 30 дней
- LRU квота 2 ГБ
- Субтитры/audio tracks
- React duplicate keys fix
- Время в логах
- Сортировка чатов (новые наверху)
- PiP ◰ в видео-окне
- Чёткие постеры видео (thumb=false)
- Окно видео 60% размера

**❌ НЕ РАБОТАЕТ / УБРАНО:**
- 📌 pin в видео-окне — убрана (не работала через preload)

**🔧 НЕРЕШЁННЫЕ ПРОБЛЕМЫ:**
- FLOOD_WAIT от аватарок (users.GetFullUser 26с бан) — нужен throttle
- console-message deprecated API в Electron 41

- ❌ **React warning «two children with the same key»** — `tg:new-message` дублировал msg уже имеющийся в массиве. Фикс v0.87.38: дедупликация по id. Ожидает подтверждения.


**Пользовательский feedback**:
- ❌ «Когда чат НЕ открыт — цифра одна (14), когда открываю — меняется» — счётчик списка устаревший до открытия
- «Сделать стрелочку вниз в чате, переходит к последнему непрочитанному (а не к самому низу), как в Telegram»
- ✅ Одобрен PiP (с возможностью менять размеры)
- ✅ Одобрен кэш LRU+квота
- ✅ Одобрен subtitles/audio tracks

**1. FIX unread в списке чатов — actively sync**:
Ранее:
- getChats при старте → кэш в списке
- Периодический rescan раз в 30 сек
- tg:new-message → локально увеличивал на 1
- Но если приходит 3 сообщения быстро, потом Telegram их группирует → наш счётчик расходится с сервером

**Фикс**:
- Периодический rescan: 30 → **15 секунд** + immediate rescan при старте (через 1.5с)
- В `attachMessageListener` для КАЖДОГО `tg:new-message` — отложенный (600мс) вызов `syncPerChatUnread(chatId)` → `GetPeerDialogs` для одного чата → `tg:chat-unread-sync` с реальным значением
- `syncPerChatUnread` имеет debounce 3 сек на чат (не дёргать сервер)
- Итого: любое новое сообщение → счётчик ТОЧНЫЙ с сервера через ~0.6 сек

**2. Стрелка вниз → к последнему непрочитанному** (как в Telegram):
- `scrollToBottom` в InboxMode.jsx теперь: если `firstUnreadIdRef.current` есть → `scrollIntoView({block: 'center'})` на `[data-msg-id="<firstUnread>"]` + жёлтая вспышка 2.5с
- Если всё прочитано → в самый низ
- Кнопка `↓` показывается когда **!atBottom ИЛИ unreadCount > 0** (раньше только при !atBottom)
- Бейдж показывает `activeUnread` если > 0, иначе `newBelow`
- Title меняется: «К первому непрочитанному (N)» или «К последнему сообщению»

**3. PiP (мини-плеер поверх всех окон)** с возможностью ресайза:
- Новый IPC `video:toggle-pip {on}` в [videoPlayerHandler.js](main/handlers/videoPlayerHandler.js)
- При `on=true`: сохраняем `prevBounds`, ставим 480×270 в нижнем-правом углу, `alwaysOnTop: 'floating'`
- При `on=false`: восстанавливаем prevBounds + снимаем alwaysOnTop
- Окно **resizable** — пользователь может увеличить/уменьшить мини-плеер
- Кнопка ◰ в toolbar video-player.html
- Преимущество над Chromium `<video>.requestPictureInPicture()`: в нашем PiP можно менять размер, работать в Electron headless режимах, есть наши контролы

**4. Субтитры / аудио-дорожки** выбор:
- Кнопки 🎧 (audio) и CC (subtitles) в toolbar `video-player.html` (**показываются только если есть множественные дорожки/sub**)
- При `loadedmetadata` event: проверяем `video.audioTracks.length > 1` и `video.textTracks.length > 0`, показываем кнопки
- Клик → открывается контекстное меню с выбором: для audio — включить один (отключить остальные), для subtitles — выбор + «Отключить»
- В большинстве Telegram-видео (однодорожковый mp4) кнопки будут скрыты

**5. LRU + квота для tg-media**:
- `tg:cleanup-media` теперь принимает `{maxDays=30, maxBytes=2ГБ}`
- Сначала удаляет файлы старше maxDays (по mtime)
- Потом если общий размер > maxBytes — удаляет **самые старые** (LRU по mtime) до квоты
- Новый IPC `tg:media-cache-size` возвращает `{size, count}` (для UI настроек в будущем)
- Авто-запуск этой же логики при каждом старте приложения

**6. Тесты**:
- Новый [src/__tests__/mediaCacheQuota.test.cjs](src/__tests__/mediaCacheQuota.test.cjs) — **5 unit-тестов** для cleanup-логики (по возрасту, LRU, комбинация, пустая директория) с реальными файлами во временной папке
- Новый vitest `RF 0.87.35: кнопка ↓ показывается если unreadCount > 0 даже при atBottom`
- Итого: **68 vitest + 5 новых unit** (было 67)

**Что проверить пользователю**:
- [ ] Счётчик в списке чатов (неактивные) обновляется в течение 5-15 сек от прихода нового сообщения (не 30-60 сек)
- [ ] Клик на чат с неверным счётчиком — реальный виден сразу
- [ ] Открой чат с непрочитанными → кнопка ↓ видна справа-внизу с числом
- [ ] Клик ↓ → скроллит к ПЕРВОМУ непрочитанному + жёлтая вспышка (а не в самый низ)
- [ ] Если всё прочитано → ↓ скрывается ИЛИ просто скроллит в низ (когда !atBottom)
- [ ] В видео-плеере кнопка ◰ делает мини-окно 480×270 в углу + alwaysOnTop, можно потянуть за угол и изменить размер
- [ ] Кнопка 📌 pin — НЕ мини-режим, просто окно поверх всех
- [ ] Кнопки 🎧/CC скрыты для обычного mp4 без доп. дорожек
- [ ] tg-media/ папка не растёт выше 2 ГБ (при долгом использовании)

### v0.87.34 (16 апреля 2026) — Variant A Video Streaming + Fix unread (force markRead + threshold)

**Пользовательский feedback по v0.87.33**:
- ❌ «Пролистал в самый низ, счётчик как был 2 так и остался» (канал MIMS Automobility)
- ✅ Одобрен «Variant A: poster + streaming» — делать сразу с тестами

**1. FIX unread counter — force markRead в самом низу чата**:
Ранее в InboxMode использовался только `IntersectionObserver(threshold: 0.5)`. Проблемы:
  - Короткие bubble (маленький текст) не пересекают 0.5 → не срабатывает
  - Быстрый скролл через 10-20 сообщений за 1 сек → observer не успевает
  - Debounce batch (1.5с) мог пропустить последнюю порцию при переключении чатов

**Фикс**:
  - Снизил `threshold` с 0.5 до 0.15 в MessageBubble.jsx и MediaAlbum.jsx (AlbumBubble)
  - **Новый хук** [useForceReadAtBottom.js](src/native/hooks/useForceReadAtBottom.js) — когда `atBottom === true` И `unreadCount > 0`, через 400мс вызывает `markRead(chatId, lastMsgId, unreadCount)`, сбрасывая всё до нуля
  - Это «страховочный» путь независимо от IntersectionObserver

**2. Variant A Video Streaming — постер + отдельное окно плеера**:

**MTProto metadata** — в mapMessage добавлены `duration` (сек) и `fileSize` (байт):
  - `DocumentAttributeVideo.duration/w/h` извлекается для video
  - `DocumentAttributeAudio.duration` для аудио
  - `media.document.size` для размера файла

**IPC `tg:download-video`** ([telegramHandler.js](main/native/telegramHandler.js)):
  - Скачивает полное видео с `progressCallback` от GramJS
  - Эмитит `tg:media-progress { chatId, messageId, bytes, total }` каждый чанк
  - Возвращает `cc-media://video/<filename>.mp4` по окончании
  - Кэширует файлы — повторный клик открывает мгновенно

**cc-media:// protocol с Range support** ([ccMediaProtocol.js](main/native/ccMediaProtocol.js)):
  - `registerSchemesAsPrivileged` с `stream: true`
  - Обрабатывает HTTP `Range: bytes=N-M` — отдаёт `206 Partial Content` с `Content-Range` и `Accept-Ranges`
  - Правильный MIME для mp4/webm/mov/mp3/ogg/wav по расширению
  - **Это позволяет `<video>` браузера перематывать и стримить** — запросы по кускам
  - Когда пользователь тянет ползунок — браузер запрашивает только нужные байты

**VideoPlayer окно** — новое BrowserWindow через [videoPlayerHandler.js](main/handlers/videoPlayerHandler.js):
  - IPC: `video:open {src, title}`, `video:close`, `video:minimize`, `video:maximize`, `video:toggle-pin`
  - Новый HTML [main/video-player.html](main/video-player.html) с `<video controls>` + тулбар
  - Preload [main/preloads/videoPlayer.preload.cjs](main/preloads/videoPlayer.preload.cjs)
  - Поддержка клавиш: `Esc` закрыть, `Space/k` play-pause, `← →` ±5 сек, `m` mute, `f` fullscreen

**Новый компонент [VideoTile.jsx](src/native/components/VideoTile.jsx)** — для UI:
  - При mount качает ТОЛЬКО постер (thumb=true, ~20-80 КБ) — не полный файл
  - Показывает ▶ круглую кнопку по центру, duration в углу (`2:05`, `1:30:45`), размер файла (`42.0 МБ`)
  - При клике: `tg:download-video` → прогресс-бар + спиннер `15 МБ / 42 МБ · 35%` → готово → `video:open`
  - Error state с сообщением
  - Используется в MessageBubble для одиночного video И в MediaAlbum для video тайлов альбома

**3. Рефакторинг** — 2 новых хука чтобы держать InboxMode < 600 строк:
  - `useForceReadAtBottom` — force markRead когда atBottom=true
  - `useDropAndPaste` — drag-n-drop файлов + Ctrl+V картинки
  - InboxMode сократился с 610 до 576 строк

**4. Тесты** — 7 новых тестов в [VideoTile.vitest.jsx](src/native/components/VideoTile.vitest.jsx):
  - При mount качается ТОЛЬКО thumb, НЕ полное видео (проверяет IPC calls)
  - Отображение ▶ кнопки
  - Formatter duration: `2:05` / `0:29` / `1:30:45`
  - Formatter size: `42.0 МБ` / `500 КБ`
  - Клик → `tg:download-video` + `video:open` (IPC chain)
  - Обновлён тест в MediaAlbum.vitest.jsx (video тайл делегирует в VideoTile)
  - **Всего: 67 тестов (было 57)** в 9 файлах

**Что проверить в v0.87.34**:
- [ ] Канал MIMS Automobility (unread=2) → открываю, листаю в низ → счётчик становится 0
- [ ] Любой канал с большим unread → пролистал всё → счётчик 0 через 0.5 сек
- [ ] Видео в канале «Автовоз» → виден постер (не блюр!) + ▶ + `2:05 · 12 МБ` в углу
- [ ] Клик по видео → прогресс-бар «15 МБ / 42 МБ · 35%» на постере
- [ ] После скачивания → открывается отдельное окно плеера с видео
- [ ] В плеере работают: ← → ±5сек, Space play/pause, m mute, f fullscreen
- [ ] 📌 в плеере делает окно alwaysOnTop
- [ ] Если видео уже раз скачано — клик открывает МГНОВЕННО (из кэша)
- [ ] В альбоме из video+photo — video показывается с ▶ overlay, photo без

### v0.87.33 (16 апреля 2026) — FIX: видео-альбомы не грузились + счётчик unread не уменьшался

**Пользовательский feedback** (канал «Автовоз» с видео-альбомом «Кино по выходным»):
- ❌ «Не везде фото грузит» — на фото иконки «🛒»/«📹», stripped thumb есть, full — нет
- ❌ «Открываю чат — переходит на первое непрочитанное, листаю вниз — счётчик не меняется»

**Причина 1: видео-альбомы качались как полные файлы**
В [MediaAlbum.jsx:PhotoTile](src/native/components/MediaAlbum.jsx) для ВСЕХ тайлов вызывался `downloadMedia(chatId, m.id, false)` — `thumb=false` значит **полный файл**. Для фото это ~300-700 КБ (OK). Для видео это **100-500 МБ целиком** → GramJS таймаутится или висит. На скриншоте виден пост канала «Автовоз: Кино по выходным» — это видео-анонсы, а не фото.

**Фикс**: для `m.mediaType === 'video'` используем `thumb=true` — GramJS качает только постер (~20-80 КБ). Для `photo` — `thumb=false` (полное ~300-700 КБ).

**Причина 2: счётчик непрочитанных не уменьшался для альбомов**
В MTProto **альбом = N отдельных сообщений** с одним `groupedId`. Сервер увеличивает `unreadCount` на N (по каждому msg). А я в [AlbumBubble](src/native/components/MediaAlbum.jsx) делал `useEffect(() => onVisible(firstMsg), [firstMsg.id])` — вызывался ОДИН раз на mount и только для **первого** сообщения альбома.
Если альбом из 5 фото → unreadCount увеличивался на 5, я помечал 1 → visible счётчик уменьшался на 1 → «не меняется» на глаз.

**Фикс**: IntersectionObserver на контейнере AlbumBubble. При `isIntersecting=true` вызываем `onVisible(m)` **для КАЖДОГО msg в альбоме**. Счётчик уменьшается на правильную величину.

**Дополнительные улучшения**:
- Error state в PhotoTile — если downloadMedia вернул `ok: false` → показываем «↻ клик — загрузить», пользователь может перезапустить
- Добавил 3 регрессионных теста в [MediaAlbum.vitest.jsx](src/native/components/MediaAlbum.vitest.jsx):
  - `RF 0.87.33: onVisible вызывается для всех 5 msgs альбома`
  - `RF 0.87.33: video тайл вызывает downloadMedia с thumb=true`
  - `RF 0.87.33: photo тайл вызывает downloadMedia с thumb=false`
- Мок `IntersectionObserver` в beforeEach имитирует `isIntersecting: true`

**Ловушка 85** в common-mistakes.md: в MTProto альбом = N messages, каждое увеличивает unreadCount. Любая логика visibility/markRead должна работать со всеми msg альбома, не с первым.

### v0.87.32 (16 апреля 2026) — CI FIX: snapshot-тесты падали на GitHub Actions из-за timezone

**Причина падения CI v0.87.31**:
Snapshots содержали результат `new Date(1712000000000).toLocaleTimeString('ru', ...)` — но этот результат **зависит от часового пояса машины**:
- Моя Windows-машина (MSK): сохранила snapshot как `00:33`
- GitHub Actions ubuntu-latest (UTC): рендерил как `19:33`
- CI diff: `Expected "00:33" / Received "19:33"` → 3 snapshot падают → сборка красная

**Фикс (v0.87.32)**:
1. Новый файл [vitest.setup.js](vitest.setup.js) — переопределяет `Date.prototype.toLocaleTimeString / toLocaleDateString / toLocaleString` чтобы **всегда форсить `timeZone: 'UTC'`** при форматировании.
2. [vitest.config.mjs](vitest.config.mjs) — добавлен `setupFiles: ['./vitest.setup.js']`
3. Пересохранены все 6 snapshots с UTC-временем `19:33`
4. Теперь snapshot-тесты детерминированы на любой машине (Windows/Linux/Mac/CI)

**Ловушка 84**: любой snapshot-тест где рендер включает время/дату → надо фиксировать timezone через setup-файл. Иначе CI падает при разных TZ между разработчиками и CI.

### v0.87.31 (16 апреля 2026) — Альбом: все фото видно + Стрелки в PhotoViewer + Pre-commit vitest + 4 новых snapshot-теста

**Пользовательский feedback по v0.87.30 + новые требования**:
- «Надо компоновку сделать так чтобы видно были все фото, чтобы на любое мог нажать» — альбом ограничивал 4 тайлами с «+N»
- «Надо сделать стрелочки в модальном окне что бы мог переключать фото в сообщений, сбоку или стрелочками на клавиатуре, слитные с эффектом» — навигация между фото альбома
- «Pre-commit хук с npm test надо сделать»
- «Snapshot-тесты для визуальной регрессии надо сделать»
- «Vitest render-тесты на остальные крупные компоненты надо сделать»

**1. Альбом: компоновка «видно все фото»** — убран slice(0, 4) и «+N» overlay:
- 1 фото → full 1x1
- 2 фото → 2x1 horizontal
- 3 фото → L-форма (grid-template `"a a" / "b c"`)
- 4 фото → 2x2
- **5 и больше** → 3 колонки × N строк, `gridAutoRows: 1fr`, `minHeight` пропорциональна `rows * 160`, потолок 700px
- Каждый тайл клик → `onPhotoOpen({ srcs, index })`

**2. PhotoViewer с навигацией между фото альбома**:
- `photoViewerHandler.js` теперь принимает либо `{ src }` (одно фото), либо `{ srcs, index }` (массив)
- IPC канал переименован в `photo:set-srcs` (обратная совместимость — преобразует single → array)
- [main/photo-viewer.html](main/photo-viewer.html) — круглые полупрозрачные кнопки ← → по бокам, клавиши `ArrowLeft/ArrowRight/Home/End`, dots-индикатор позиции внизу (до 20 фото), счётчик `X/N` в тулбаре
- **Плавные эффекты**: slide-from-right / slide-from-left анимация 0.25с при смене + hover-scale 1.08 на стрелках + цвет фона меняется на акцент при hover
- Стрелки автоматически `disabled` на краях диапазона и скрыты если фото одно

**3. Pre-commit hook с npm-test** ([scripts/hooks/pre-commit](scripts/hooks/pre-commit)):
- Ранее: только ESLint + 4 статических теста (.test.cjs)
- Теперь дополнительно: **mainImports**, **mainRuntime** (runtime-парсинг main/**), **vitest run** (если в staged есть `.jsx` / `.vitest.*` файлы)
- Автоустановка hook через `npm run setup-hooks` или через `postinstall` — также сам установил в `.git/hooks/pre-commit`
- Время: ~5-10 сек при наличии JSX, ~1-2 сек без изменений JSX

**4. Snapshot-тесты для визуальной регрессии** (6 snapshot'ов в `__snapshots__/`):
- `MessageBubble.vitest.jsx`: снап текстового сообщения + снап исходящего медиа-фото с подписью
- `MediaAlbum.vitest.jsx`: снап альбома 4 фото (2x2)
- `ChatListItem.vitest.jsx`: снап обычного чата с unread + снап канала с счётчиком
- `LinkPreview.vitest.jsx`: снап типичной карточки ссылки
- Любое случайное изменение вёрстки (шрифт, padding, класс) → snapshot упадёт → надо явно подтвердить `vitest run -u`

**5. Vitest render-тесты на компоненты** — 4 новых файла, в сумме **57 тестов** (было 11):
- [MessageBubble.vitest.jsx](src/native/components/MessageBubble.vitest.jsx): 7 тестов (текст/outgoing/✓✓/медиа/link-preview + 2 snapshot)
- [MediaAlbum.vitest.jsx](src/native/components/MediaAlbum.vitest.jsx): 6 тестов (1/2/3 фото / 7 all-visible / caption / snapshot)
- [ChatListItem.vitest.jsx](src/native/components/ChatListItem.vitest.jsx): 12 тестов (user/channel/group/bot/online/avatar/инициалы/active + 2 snapshot)
- [LinkPreview.vitest.jsx](src/native/components/LinkPreview.vitest.jsx): 7 тестов (полная/только title/null/photoUrl/outgoing/snapshot)
- [FormattedText.vitest.jsx](src/native/components/FormattedText.vitest.jsx): 8 тестов (empty/bold/italic+code/url/autolink/hashtag/mention)

**Что проверить**:
- [ ] Альбом из канала «Автопоток» — видны ВСЕ фото, каждое кликабельно (не только 4)
- [ ] Клик по любому фото альбома → окно открывается именно на НАЖАТОМ фото
- [ ] В окне просмотра: стрелки ← → слева/справа, плавно листают с анимацией slide
- [ ] Клавиши ← → тоже листают; `Home`/`End` — на первое/последнее
- [ ] Внизу точки показывают позицию (если фото <20)
- [ ] В тулбаре счётчик `3/7` показывает где ты сейчас
- [ ] Если в окне одно фото — стрелок, счётчика и точек нет
- [ ] Попытайся сделать коммит — pre-commit запускает vitest (если меняешь .jsx) и блокирует при падении

### v0.87.30 (16 апреля 2026) — Vitest render-тест InboxMode — ловит TDZ/порядок hooks

**Пользовательский feedback по v0.87.29**:
- ❌ «Ошибка рендера: Cannot access 'activeMessages' before initialization» — получил TDZ-ошибку в runtime
- ❌ «почему нет проверки по тестам???»

**Диагностика**: Проверил текущий код — activeMessages на строке 78, использование на 125. Физически доступно. Vitest-render тест с mock store и 6 сценариями (пустой / 194 чата / активный чат / непрочитанные / медиа-альбом / link preview) все 6 прошли. **Текущий код корректен**.

**Причина ошибки у пользователя**: Vite HMR закэшировал промежуточное состояние файла между двумя моими Edit'ами (сначала я вставил `useInitialScroll` до `activeMessages` → баг, потом переставил → ОК). HMR подхватил СОХРАНЁННУЮ версию с багом и держит её. Решение: **Ctrl+R в dev-окне** (reload renderer) или перезапуск `npm run dev`.

**Что сделано в v0.87.30 чтобы защитить от подобного в будущем**:
1. **Новый файл** [src/native/modes/InboxMode.vitest.jsx](src/native/modes/InboxMode.vitest.jsx) — 6 сценариев рендера InboxMode через `@testing-library/react` + happy-dom:
   - Пустое состояние (нет активного чата)
   - Список 194 чата (стресс для react-window)
   - Активный чат с 3 сообщениями
   - Непрочитанные + first-unread divider (проверяет `useInitialScroll` хук)
   - Медиа-альбом (3 фото с groupedId → рендер `AlbumBubble`)
   - Link preview (проверяет LinkPreview рендер)
2. Mock: `window.api` (IPC), `IntersectionObserver`, `ResizeObserver` — всё что нет в happy-dom по умолчанию
3. Уже подхватывается общим `vitest run` в `npm test` (конфиг `include: ['src/**/*.vitest.jsx']`)

**Главный урок** (Ловушка 83 в common-mistakes.md): статические .cjs тесты НЕ выполняют JSX. TDZ/ReferenceError/hook order ошибки ловит только **runtime-рендер** через vitest + testing-library. Нужно прикрывать каждый крупный компонент smoke-тестом.

**Что проверить пользователю**:
- [ ] **Ctrl+R в окне приложения** — ошибка «activeMessages» должна исчезнуть
- [ ] Если не уйдёт — перезапустить `npm run dev` с очисткой кэша (rm -rf node_modules/.vite)
- [ ] Далее — все ранее ожидавшие проверки из v0.87.27-29 (альбомы, скролл-вариант A, жёлтая подсветка, lastMessage preview и др.)

### v0.87.29 (16 апреля 2026) — Медиа-альбомы + Вариант A скролла + жёлтая подсветка

**Пользовательский feedback по v0.87.28**:
- ✅ PhotoViewer отдельное окно «Подойдет»
- ❌ В канале «Автопоток»: когда в одном сообщении много фото — показываются по очереди вертикально, а нужна сетка как в Telegram
- ✅ Аватарки, Reply-scroll — работает

**Что сделано в v0.87.29**:

1. **Группировка медиа-альбомов (grouped messages)**
   - `mapMessage` в [telegramHandler.js](main/native/telegramHandler.js) — добавлено поле `groupedId` из MTProto `m.groupedId`
   - [messageGrouping.js](src/native/utils/messageGrouping.js) — новая функция `collapseAlbums(msgs)` склеивает последовательные msgs с одинаковым groupedId в объект `{ type: 'album', msgs: [...] }`
   - Новый компонент [MediaAlbum.jsx](src/native/components/MediaAlbum.jsx) — рендерит сетку 1x1 / 2x1 / 2x2 (с L-формой для 3 фото) / 2x2 с «+N» на 4-м
   - `AlbumBubble` — бубл-обёртка вокруг альбома с reply/меню/подписью/временем — аналог MessageBubble
   - Клик по любому превью в альбоме → открывает отдельное окно PhotoViewer через `photo:open` IPC
   - Заменён `item.msgs.map(m => <MessageBubble/>)` на ternary `m.type === 'album' ? <AlbumBubble/> : <MessageBubble/>` в InboxMode.jsx

2. **Вариант A скролла при открытии чата** (рекомендованный как классический Telegram)
   - Новый хук [useInitialScroll.js](src/native/hooks/useInitialScroll.js)
   - `unread === 0` → скролл в самый низ (`scrollTop = scrollHeight`)
   - `unread > 0` → `scrollIntoView({block:'start'})` на элемент `[data-msg-id="<firstUnreadId>"]` + добавление класса `native-msg-last-read-highlight` на 3.5с
   - Если элемент first-unread не найден в DOM (не загружен в текущую страницу) — fallback на «в низ»
   - Защита: `doneRef` — срабатывает один раз на chatId, не дёргается при обновлении messages

3. **Жёлтая подсветка «последнее прочитанное»**
   - CSS-анимация `native-last-read-glow` в [styles.css](src/native/styles.css) — 3.5с плавное желтоватое свечение вокруг bubble + лёгкий фон
   - Класс `.native-msg-last-read-highlight > div:first-child` применяет анимацию к внутреннему бублу
   - Работает вместе с divider «Новые сообщения» — жёлтая подсветка идёт на первом непрочитанном сообщении после divider'а

4. **Рефакторинг**: `useInitialScroll` вынесен в отдельный хук чтобы InboxMode.jsx оставался под 600 строк (591/600).

**Что проверить в v0.87.29**:
- [ ] В канале «Автопоток» / любом сообщении с 2-10 фото — показываются сеткой, не вертикально
- [ ] Клик по любому фото из альбома → открывается отдельное окно PhotoViewer с этим фото
- [ ] Открываешь чат с непрочитанными → сразу скроллит на первое непрочитанное + жёлтая подсветка 3.5с
- [ ] Открываешь чат где всё прочитано → скроллит в самый низ (последнее сообщение видно)
- [ ] Divider «Новые сообщения» виден одновременно с жёлтой подсветкой

### v0.87.28 (16 апреля 2026) — PhotoViewer отдельное окно + lastMessage preview

**Пользовательский feedback по v0.87.27**:
- ✅ Reply-клик scroll + вспышка — работает
- ✅ Аватарка в группе чужих — работает
- ❌ PhotoViewer **НЕ ТАК** — был React-overlay на весь экран; пользователь просил отдельное модальное окно, которое можно передвигать/увеличивать/закреплять

**Что сделано в v0.87.28**:
1. **PhotoViewer → отдельное BrowserWindow** — удалил `src/native/components/PhotoViewer.jsx` (React-overlay). Новый `main/handlers/photoViewerHandler.js` создаёт frameless BrowserWindow 900×700 (по умолчанию, можно ресайзить/максимизировать). Новый HTML `main/photo-viewer.html` + preload `main/preloads/photoViewer.preload.cjs`. IPC: `photo:open {src}` (открывает / переиспользует окно), `photo:close`, `photo:minimize`, `photo:maximize`, `photo:toggle-pin`. Окно имеет:
   - Собственную тулбар: зум ± + процент, сброс ⟲, закрепить 📌 (alwaysOnTop), download ⬇, свернуть _, развернуть ▢, закрыть ✕
   - Колёсико = zoom 0.2–8x, drag = pan, двойной клик или `0` = reset, +/- = зум
   - Drag самого окна по body (webkit-app-region: drag), но не по фото/кнопкам
   - Esc закрывает окно
2. **lastMessage preview** — чаты в списке показывали «—» для сообщений без текста. Причина: `d.message?.message || ''` в mapDialog даёт пустую строку для медиа/service messages. Добавил функцию `messagePreview(m)` в [telegramHandler.js](main/native/telegramHandler.js) которая возвращает:
   - `🖼 Фото` / `📹 Видео` / `🎵 Аудио` / `📎 имяФайла.ext` / `🎤 Голосовое` / `⭕ Видеосообщение` / `🎴 Стикер`
   - `📍 Геолокация` / `👤 Контакт` / `📊 Опрос` / `🔗 Ссылка` / `💳 Оплата` / `🎮 Игра`
   - Для service: `👤 добавлен участник` / `📌 закреплено сообщение` / `✏️ название чата изменено` / `📞 звонок` и т.д.
   - Также применяется в [nativeStore.js](src/native/store/nativeStore.js) для tg:new-message чтобы новые входящие тоже получали preview (ribbon + список)
3. Новые файлы добавлены в `electron.vite.config.js` для билда:
   - `main/photo-viewer.html` копируется в `out/main/`
   - `main/preloads/photoViewer.preload.cjs` собирается в `out/preload/photoViewer.mjs`

**Что проверить в v0.87.28**:
- [ ] Клик по фото → открывается отдельное окно (не overlay на весь экран)
- [ ] Окно можно передвигать за шапку (drag body)
- [ ] Окно можно ресайзить за углы (resizable)
- [ ] Кнопка 📌 делает окно alwaysOnTop (поверх всех окон Windows), повторный клик — выключает
- [ ] Колёсико в окне фото зумит
- [ ] Минимизация/максимизация кнопками
- [ ] Список чатов: для чатов с документами/фото/голосовыми в последнем сообщении — видно «📎 Файл.docx» / «🖼 Фото» / «🎤 Голосовое», а не «—»

### v0.87.27 (16 апреля 2026) — 12 новых фичей: PhotoViewer, reply-scroll, unread divider, link preview, Ctrl+↑, аватарки в группе, кэш-bust, runtime-тест
**⚠️ НЕ ПОМЕЧАТЬ СДЕЛАННЫМИ — пока пользователь не подтвердит проверку!** См. таблицу «Непроверенные фичи» выше.

**Что добавлено**:
1. **Reply-клик scroll to original** — клик по reply-цитате (↪ текст) → плавный скролл к оригиналу + 1.5с жёлтая вспышка подсветки. `onReplyClick` prop в MessageBubble.jsx, `scrollToMessage(id)` в InboxMode.jsx через `[data-msg-id="..."]` query. Если оригинал не загружен (скрыт в infinite scroll) — toast «прокрутите вверх».
2. **«Новые сообщения» divider** — жёлтая горизонтальная плашка с линиями появляется перед первым непрочитанным сообщением при открытии чата. `firstUnreadIdRef` вычисляется в useEffect при смене activeChatId. `findFirstUnreadId()` в `messageGrouping.js`.
3. **Runtime smoke-тест main** — `src/__tests__/mainRuntime.test.cjs` парсит каждый `main/**/*.js`, вытаскивает все `import { X } from 'pkg'`, делает `require(pkg)` и проверяет что каждое имя реально экспортируется. Отдельно проверяет подпути `telegram/sessions/index.js`, `telegram/events/index.js`, `telegram/Utils.js`. Ловит ошибки типа Ловушки 79 ДО запуска Electron.
4. **Avatar cache bust** — при `tg:remove-account` удаляются все файлы из `tg-avatars/`, `tg-media/`, `tg-cache.json`, очищается `chatEntityMap`. Следующий аккаунт не получает старые аватарки/медиа.
5. **Сжатие tg-media** — `ipcMain.handle('tg:cleanup-media', {maxDays=30})` + авто-вызов при инициализации handler'а. Файлы старше 30 дней удаляются; логируется освобождённый размер в МБ.
6. **PhotoViewer** — новый компонент `src/native/components/PhotoViewer.jsx` — полноэкранный просмотрщик с: pan (drag мышкой), zoom (колёсико + кнопки ± + двойной клик reset), pin (кнопка 📌 → IPC `window:set-always-on-top`), download (⬇), Esc закрытие. Клик по фото в MessageBubble → `onPhotoOpen(mediaUrl)`.
7. **Индикатор новых снизу** — круглая кнопка ↓ в правом нижнем углу scroll-области появляется когда юзер НЕ внизу чата. Показывает счётчик новых входящих (`newBelow` state). Клик → плавный скролл вниз + сброс счётчика.
8. **Link Preview** — новый `LinkPreview.jsx`. `mapMessage` в telegramHandler.js извлекает `webPage` (url/title/description/siteName). Рендерится карточкой с левой синей полосой. Клик → `app:open-external`.
9. **Ctrl+↑ → редактирование** — при пустом input + Ctrl+↑ ставим последнее своё текстовое сообщение в edit-режим с заполненным input.
10. **Аватарка слева от групп чужих** — новый `.native-msg-group-row` flex-layout с `.native-msg-avatar` (32×32 круг). Использует `activeChat.avatar` для private-чатов; для групп — инициалы имени sender'а. Для своих сообщений (row-reverse) — без аватарки.
11. **`window:set-always-on-top` IPC** — новый обработчик в `main/handlers/windowHandlers.js` (вынесено из main.js т.к. превысил лимит 600).
12. **Рефакторинг**: `groupMessages`, `formatDayLabel`, `findFirstUnreadId` вынесены в `src/native/utils/messageGrouping.js`; window-handlers вынесены в `main/handlers/windowHandlers.js`.

**Что проверить (до закрытия задачи)**:
- [ ] Клик по фото → открывается модалка на весь экран, колёсико зумит, drag двигает, 📌 закрепляет окно поверх других
- [ ] Reply-цитата кликабельна → скролл + жёлтая вспышка
- [ ] При открытии чата с >0 unread видна жёлтая плашка «Новые сообщения» перед первым непрочитанным
- [ ] При скролле вверх в правом-нижнем углу появляется ↓ с цифрой новых
- [ ] Ссылка в сообщении рендерится карточкой (title/description)
- [ ] Ctrl+↑ в пустом поле → последнее своё сообщение в edit
- [ ] Слева от чужой группы видна аватарка чата/отправителя
- [ ] После logout аватарки следующего аккаунта обновляются (не старые)
- [ ] Файлы `tg-media/` старше 30 дней удаляются при старте (проверять `Roaming/ЦентрЧатов/tg-media`)
- [ ] Главный тест: `npm test` проходит, в том числе `mainRuntime.test.cjs` с проверкой всех main модулей и подпутей telegram/*

### v0.87.26 (16 апреля 2026) — UI фиксы: разделители дат + размер фото + счётчик непрочитанных
- **Проблема 1 — разделители дат плохо видно**: `.native-msg-divider` был `rgba(255,255,255,0.04)` на чистом #000 → почти невидимы. **Фикс**: `.native-msg-divider--day` — акцентный фон с синей обводкой, uppercase, backdrop-blur; обёртка `.native-msg-day-row` с горизонтальными градиент-линиями по бокам (как в Telegram).
- **Проблема 2 — одиночное фото слишком маленькое**: bubble `maxWidth: 65%` схлопывался до ширины контента. Фото `width: 100%` от схлопнутого родителя = микро-размер. **Фикс**: для `mediaType === 'photo'/'video'` bubble получает `minWidth: 280px, maxWidth: min(420px, 65%)`; само фото — `minHeight: 180px, maxHeight: 420px` с сохранением aspectRatio; padding бабла уменьшен до 4px чтобы фото занимало всю площадь.
- **Проблема 3 — счётчик непрочитанных неверен**: две причины — (1) `readByVisibility._timer` в `InboxMode.jsx:204` был property на функции, которая **пересоздаётся при каждом рендере** → накапливались параллельные таймеры → `store.markRead` вызывался многократно с `count=0` после сброса batch → локально `unreadCount` сбрасывался в 0. (2) `startUnreadRescan` в `telegramHandler.js:829` брал только `limit: 50` — чаты за пределами первых 50 никогда не синхронизировались. **Фикс**: `readTimerRef = useRef(null)` + отдельный `readBatchRef` для окна debounce + проверка `chatAtStart === store.activeChatId` перед emit + guard `count === 0 return`; в main — `fetchAllUnreadUpdates()` с пагинацией до 500 чатов (5×100), используется как в периодическом, так и в manual rescan.
- **Проверить**: (1) разделители «20 марта» / «21 марта» теперь видны как синие плашки с горизонтальными линиями; (2) одиночные фото отображаются минимум 280×180 (не крохотно как раньше); (3) счётчик непрочитанных должен корректно уменьшаться по мере прокрутки, не прыгать в 0, и периодически подтягиваться с сервера для всех 200+ чатов.

### v0.87.25 (16 апреля 2026) — FIX Named export Helpers + новый тест mainImports
- **Ошибка запуска v0.87.24**: `SyntaxError: Named export 'Helpers' not found. The requested module 'telegram' is a CommonJS module`.
- **Причина**: в v0.87.24 добавил `import { Helpers } from 'telegram'` — но `telegram` npm пакет НЕ экспортирует `Helpers` напрямую. Функция `strippedPhotoToJpg` лежит в `telegram/Utils.js`.
- **Фикс**: `import { strippedPhotoToJpg } from 'telegram/Utils.js'`.
- **Почему тесты не поймали**:
  - Статические тесты (grep-based) только читают файлы как текст, не импортируют модули
  - `electron-vite build` **компилирует** ESM→CJS синтаксически, но не проверяет что named export реально есть
  - `vitest` не импортирует main-процесс модули
- **Новый тест** `src/__tests__/mainImports.test.cjs`:
  - Парсит ВСЕ `main/**/*.js` файлы на `import { X, Y } from 'pkg'`
  - Для CommonJS пакетов (telegram, baileys, vk-io, input) делает `require(pkg)` и проверяет что каждый named import **реально** существует в export'ах
  - Electron исключён (работает через спец. runtime Electron'а)
  - Подключён в `npm test` pipeline
  - Ловит ошибки «Named export X not found» **ДО запуска** программы
- Ловушка 79 — CommonJS пакеты в ESM-проекте требуют осторожности с named imports. Нужен runtime-проверяющий тест.

### v0.87.24 (16 апреля 2026) — Stripped thumbs + группировка + Kombo D unread-sync
- **Stripped photo (Вариант A)**:
  - В `mapMessage` → `extractStrippedThumb` читает `PhotoStrippedSize` из `media.photo.sizes`
  - Используется `Helpers.strippedPhotoToJpg(bytes)` из GramJS — распаковывает 1-3КБ stripped JPEG в полный
  - Конвертирует в `data:image/jpeg;base64,...` — отправляется с message в renderer
  - MessageBubble: stripped как `background-image` + полный фото поверх с fade-in
  - `aspectRatio` баббла из `mediaWidth/mediaHeight` — нет скачков layout
  - Результат: **мгновенное размытое превью** + плавная замена на полное фото
- **Группировка 2+5+3** (+ время у каждого):
  - `renderItems` computed в useMemo: группируем по автору, разделители дня/времени
  - Правила новой группы: другой автор **ИЛИ** прошло >5 мин **ИЛИ** другой день
  - Дневной разделитель: «Сегодня», «Вчера», «12 апреля»
  - 5-минутный разделитель: `HH:MM` между группами
  - Группа: имя автора над первым сообщением, `gap: 2px` внутри группы, `gap: 10px` между
  - Каждый баббл: тонкая рамка `rgba(255,255,255,0.06)` для чужих, glow `rgba(42,171,238,0.15)` для своих
  - Время **у каждого** сообщения (оставлено)
- **Kombo D — синхронизация unread**:
  - **Часть A (периодический)**: `startUnreadRescan()` — setInterval 30 сек. Запрашивает `getDialogs({limit:50})`, emit `tg:unread-bulk-sync`. Store обновляет массово через Map.
  - **Часть B (window.focus)**: IPC `tg:rescan-unread` — при фокусе окна renderer вызывает rescanUnread()
  - **Часть C (raw updates)**: уже работает — UpdateReadHistoryInbox/Outbox + UpdateReadChannelInbox/Outbox
  - **Часть D (точка sync после mark-read)**: v0.87.22 — GetPeerDialogs через 800мс
  - Итого: 4 независимых механизма синхронизации → максимальная точность
- Vitest: 11/11 ✅, E2E: 9/9 ✅.

### v0.87.23 (16 апреля 2026) — Откат thumbs + форматирование + подробные логи unread/чатов
- **Откат ускорения через thumbs**: пользователь просит полные фото как было. Возвращено `downloadMedia(msg, thumb: false)` — полное фото по умолчанию.
- **Форматирование сообщений** (entities MTProto):
  - Маппер `mapEntities` → в message добавляется `entities[]` с типами: bold, italic, underline, strike, code, pre, url, texturl, mention, mentionname, hashtag, cashtag, botcommand, email, phone, spoiler.
  - Новый компонент `FormattedText.jsx` — рендерит текст с форматированием:
    - **Жирный** / *курсив* / ~~зачёркнутый~~ / подчёркнутый
    - `code` / ```pre``` блоки
    - [ссылки](url) открываются в внешнем браузере через `app:open-external` (shell.openExternal)
    - Синие #хэштеги, @упоминания, /botcommands
    - Спойлеры — клик показать
  - Авто-детект ссылок/хэштегов/упоминаний в тексте без entities (regex fallback)
  - Новый IPC `app:open-external` через `shell.openExternal()`
- **Подробные логи загрузки чатов**:
  - `═══ ДИАЛОГИ АКТИВНЫЕ ═══` с разделителями
  - `загружено: N чатов`
  - `непрочитанных чатов: X`
  - `всего непрочитанных сообщений: Y`
  - Отдельно для архивных: `═══ АРХИВНЫЕ ═══ загружено=N, непрочитанных=Y`
- **Подробные логи синхронизации unread**:
  - После каждого `mark-read` → запрос `messages.GetPeerDialogs`
  - Лог: `═══ UNREAD SYNC ═══ chat=... Telegram сервер=N unreadMentions=X unreadReactions=Y`
  - Видно точно что Telegram возвращает — сверить с нашим UI.

### v0.87.22 (16 апреля 2026) — Ускорение фото (thumbs) + sync unread с Telegram + архивные чаты
- **CLAUDE.md**: добавлено правило «Правило превышения лимита строк» — при превышении **НЕ резать комментарии**, разделять файл на модули.
- **Ускорение загрузки фото (thumbs)**:
  - Было: `downloadMedia(msg)` скачивал полный файл ~200-300КБ на превью.
  - Стало: `downloadMedia(msg, { thumb: 0 })` скачивает thumbnail ~10-50КБ — в 10 раз быстрее.
  - MessageBubble автоматически грузит THUMB, по клику на картинку можно догрузить полный размер.
  - Файлы кэшируются раздельно: `{id}_thumb.jpg` и `{id}.jpg`.
- **Синхронизация счётчика непрочитанных с Telegram**:
  - Проблема: после markAsRead локальный счётчик мог расходиться с реальным в Telegram.
  - Фикс: через 800мс после `mark-read` делаем `messages.GetPeerDialogs` → получаем **реальный** `unreadCount` с сервера → emit `tg:chat-unread-sync` → store обновляет точное значение. Больше не «дёргается».
- **Архивные чаты** (доступ к папке «Архив»):
  - По умолчанию `getDialogs` возвращает только активную папку (folder=0).
  - Добавлен параллельный запрос `folder=1` (архив). Чаты помечаются `archived: true`.
  - Эмитятся через `append: true` → не перезаписывают активные.
- Итог список чатов: активные + архивные.

### v0.87.21 (16 апреля 2026) — FIX CI лимит main.js (cc-media вынесен в отдельный модуль)
- **CI ошибка**: `main.js ≤ 600 строк (сейчас 631): 631 > 600 — РАЗБИТЬ!` — добавление protocol.handle в v0.87.20 превысило лимит.
- **Фикс**: новый модуль `main/native/ccMediaProtocol.js` с двумя функциями `registerCcMediaScheme()` + `registerCcMediaHandler(userData)`. main.js импортирует и вызывает. Итог 600 строк.

### v0.87.20 (16 апреля 2026) — НАСТОЯЩАЯ причина почему фото не видны: custom protocol
- **Проблема**: в логах `download-media: OK, size=278553` — сотни успешных загрузок. CSP расширен. Но UI всё равно **пустой**.
- **Настоящая причина**: dev-сервер Vite грузит UI по `http://localhost:5173`. Electron с `webSecurity=true` (по умолчанию) **блокирует смешанные протоколы** — `<img src="file://...">` в HTTP-контексте не загружается. Это не CSP, это политика Chromium «no file in http».
- **Правильное решение** (по [Electron docs](https://www.electronjs.org/docs/latest/api/protocol)): custom protocol `cc-media://`. Регистрируем через `protocol.handle('cc-media', ...)` в main.js, отдаёт файлы из `tg-avatars/` и `tg-media/` по URL типа `cc-media://avatars/12345.jpg`.
- **Фикс**:
  - main.js: `protocol.registerSchemesAsPrivileged([{ scheme: 'cc-media', privileges: { standard: true, secure: true, supportFetchAPI: true }}])` до whenReady
  - В whenReady: `protocol.handle('cc-media', ...)` — парсит URL, читает файл из `tg-avatars` или `tg-media`, возвращает `Response(data, { headers: { 'Content-Type': 'image/jpeg' }})`
  - telegramHandler.js: все `file:///...` заменены на `cc-media://avatars/...` и `cc-media://media/...`
  - index.html CSP: `cc-media:` вместо `file:` в `img-src`, `media-src`, `connect-src`, `default-src`
- **Ловушка 78**: в Electron dev-режиме (http://localhost) file:// URL НЕ работают в `<img>` из-за Chromium mixed-content policy. Единственное правильное решение — custom protocol через `protocol.handle()`. `webSecurity: false` — **не рекомендуется**, ломает безопасность.

### v0.87.19 (16 апреля 2026) — 3 корневых ИСТИННЫХ причины: CSP, channels.ReadHistory, GetFullChannel
**По сверке с документацией и логами — настоящие причины всех проблем:**

- **Фото в сообщениях не видны** (хотя download-media ok):
  - Лог: `download-media: OK, size=249531` (сотни успешных загрузок).
  - Но `<img src="file://...">` НЕ рендерится.
  - **Причина**: CSP в `index.html` = `default-src 'self'` → блокирует file:, blob:, data:. Chromium молча отказывается загружать image.
  - **Фикс**: расширен CSP: `img-src 'self' file: blob: data: https: http:; media-src 'self' file: blob:; default-src 'self' file: blob: data:`.

- **Счётчик не синхронизируется с Telegram**:
  - Лог: `mark-read error: 400 PEER_ID_INVALID (caused by messages.ReadHistory)`.
  - **Причина**: я использовал `messages.ReadHistory` для ВСЕХ чатов. Но по документации MTProto для **каналов** нужен `channels.ReadHistory` — это **разные методы**!
  - **Фикс**: используем `client.markAsRead(entity, maxId)` — GramJS сам разруливает. Плюс явный fallback через `channels.ReadHistory` для `InputPeerChannel`. Теперь счётчики синхронизируются с телефоном.

- **Аватарки у 82 чатов нет** (hasPhoto=112 noPhoto=82 из 194):
  - **Причина**: `getDialogs` MTProto **не всегда возвращает `entity.photo` для каналов/групп**. Особенно для мало-активных или каналов куда недавно вступили. По документации для полной инфы нужен `channels.GetFullChannel`.
  - **Фикс**: для чатов без `entity.photo` — batch `client.invoke(channels.GetFullChannel)` / `users.GetFullUser`, берём photo из response, скачиваем. Новое поле `fetched` в логе покажет сколько реально догрузили.

- **Ловушки 76-77**:
  - **76**: CSP `default-src 'self'` блокирует file:// для `<img>` — нужен `img-src file:` явно.
  - **77**: `messages.ReadHistory` ≠ `channels.ReadHistory` в MTProto. Для каналов используется отдельный метод. Всегда использовать GramJS высокоуровневый `client.markAsRead(entity)` который сам выбирает нужный RPC.

### v0.87.18 (16 апреля 2026) — 3 критичных FIX: аватарки ВСЕХ, счётчик прочитанных, media
- **Главный баг — аватарки только у 50 чатов из 194**:
  - В логах: `аватарки: total=50 hasPhoto=44 noPhoto=6 downloaded=0 cached=44`
  - Причина: в коде было `loadAvatarsAsync(firstPage.slice(0, 50))` и `loadAvatarsAsync(page.slice(0, 50))` — **жёсткий лимит 50 для каждой страницы**. Забыл убрать когда делал пагинацию.
  - **Фикс**: убран `.slice(0, 50)` — теперь качаем ВСЕ аватарки каждой страницы. `total=194 hasPhoto=~150 ...`
- **Счётчик прочитанных «дёргался» кратно**:
  - IntersectionObserver срабатывал многократно на одно сообщение (при скролле туда-сюда) → `markRead(chatId, maxId, 1)` вызывался 3-5 раз на одно → счётчик падал кратно.
  - **Фикс**: `Set` уникальных прочитанных id, сбрасывается при смене чата. Debounced batch mark-read раз в 1.5 сек с `count = Set.size`. Один уникальный id = -1 к счётчику, не больше.
- **Media фото не грузились / заглушка `[медиа]`**:
  - Добавлены подробные логи в `tg:download-media`: `chat, msg, cached?, className, size`. Теперь в `⚡ Native` фильтре видно почему не скачалось (нет media, downloadMedia вернул null, etc).
  - **Фикс**: расширение файла `.bin` → `.jpg` чтобы `<img src="file://...">` подхватывал как картинку. Без правильного MIME type Chromium может отказаться рендерить.
- Ловушка 75 — hard-coded `slice(0, N)` лимиты без комментария легко забыть при рефакторинге. В production коде `slice` только с ОБОСНОВАНИЕМ.

### v0.87.17 (15 апреля 2026) — Модалка forward + pin-bar + галочки + тост + логи + refresh аватарок
- **Forward** — не работал клик:
  - Использовался `prompt()` — в некоторых Electron окружениях может не открываться.
  - **Фикс**: красивая **модалка ForwardPicker** с поиском и аватарками. Показывает все чаты, фильтр по названию, клик — отправка.
- **Pin** показывал `CHAT_ADMIN_REQUIRED` алертом:
  - **Фикс**: отдельная проверка regex в handler → русское сообщение «Нет прав админа для закрепления в этом чате». Показывается через тост (не alert).
- **Paste (Ctrl+V)** не работал:
  - **Фикс**: переписан handler — preventDefault только если есть image/* в буфере (чтобы обычная вставка текста не блокировалась). Добавлены логи + тост с результатом.
- **Закреплённые сообщения сверху чата**:
  - IPC `tg:get-pinned` через `messages.Search { filter: InputMessagesFilterPinned }` — официальный способ получить closeleden
  - При смене чата — запрос, если есть — синяя плашка «📌 Закреплённое: {текст}» над лентой сообщений
- **Галочки прочитанности (✓ / ✓✓)**:
  - `maxOutgoingRead` Map: chatId → maxId прочитанных нашим собеседником
  - При `UpdateReadHistoryOutbox` — обновляем map + emit `tg:read { outgoing: true, maxId }`
  - В store → обновляем `isRead` для всех своих сообщений до maxId
  - В MessageBubble → `✓✓` если `isRead=true`, иначе `✓` (для своих)
  - При `getMessages` — дополнительно вызываем `GetFullUser`/`GetFullChannel` для получения текущего `readOutboxMaxId`
- **Refresh аватарок для активного чата**:
  - Новый IPC `tg:refresh-avatar` — повторный вызов `downloadProfilePhoto` для конкретной entity
  - При открытии чата без аватарки — автоматически догружаем. Для каналов которые в `getDialogs` пришли без photo.
- **Тосты** вместо `alert()`:
  - CSS `.native-toast` анимация slide-in справа
  - Типы: info / error / success (цветные левые полосы)
  - Автоматически скрываются через 4 сек
- **Подробные логи** для всех действий: `forward`, `pin`, `send-clipboard`, `refresh-avatar`, outgoing read — в фильтре «⚡ Native» лога.
- Ловушка 74 — prompt() ненадёжен в Electron, делать кастомные модалки.

### v0.87.16 (15 апреля 2026) — Read-by-scroll + аватарки в кэше + 5 фич (drag-n-drop, paste, forward, pin)
- **Проблема 1 — счётчик сбрасывается сразу при открытии чата**:
  - v0.87.15 делал optimistic `unreadCount=0` сразу.
  - **Фикс**: убран авто-markRead при открытии чата. Счётчик уменьшается **по мере видимости** через IntersectionObserver: когда сообщение попадает в viewport (threshold 0.5) → `lastReadRef = id`, debounced markRead каждые 2 сек до текущего maxId. В UI `unreadCount -= 1` за каждое видимое сообщение.
- **Проблема 2 — аватарки из кэша не подхватывались**:
  - tg-cache.json сохранялся ДО загрузки аватарок → `chat.avatar` был undefined. При старте программы чаты из кэша без аватарок.
  - **Фикс**: при сохранении кэша (`saveChatsCache`) проверяем есть ли файл в `tg-avatars/{rawId}.jpg` и подставляем `file://` URL. При чтении (`tg:get-cached-chats`) тоже проверяем. Теперь аватарки **мгновенно** видны после перезапуска.
- **Проблема 3 — плохая подсветка активного чата на тёмной теме**:
  - Было: `background: var(--amoled-surface-hover)` — едва заметно на AMOLED.
  - **Фикс**: яркий синий фон `rgba(42, 171, 238, 0.2)` + **левая полоса-индикатор** 3px сплошного синего `var(--amoled-accent)`. Hover уменьшен до `rgba(255,255,255,0.04)`.
- **Drag-n-drop файлов**: перетаскиваешь файл в окно чата → `sendFile`. Подсветка drop-зоны синей рамкой «📎 Отпустите файл для отправки».
- **Paste (Ctrl+V)**: в поле ввода → копируется скриншот → `tg:send-clipboard-image` → временный файл → `client.sendFile`.
- **Forward (пересылка)**: кнопка ➥ в контекст-меню баббла → prompt «название чата» → fuzzy search по store.chats → `client.forwardMessages`.
- **Pin (закрепление)**: кнопка 📌 → `client.pinMessage`. Для каналов/групп где нет прав вернёт ошибку в alert.
- **IntersectionObserver в MessageBubble**: `threshold: 0.5`, onVisible callback для UI-прочитывания.
- **Новые IPC**: `tg:send-file`, `tg:send-clipboard-image`, `tg:forward`, `tg:pin`.
- Ловушка 73 — markRead должен быть управляемый (по видимости), не автоматический.

### v0.87.15 (15 апреля 2026) — Медиа + Scroll-up + Reply/Edit/Delete + Search в чате + FIX markRead
- **Проблема — mark-read не сбрасывал счётчик 49**:
  - IPC звал `client.markAsRead()` но UI ждал emit `tg:read` от GramJS, который приходил задержанный или не приходил.
  - **Фикс**: сразу optimistic-обновление `chat.unreadCount = 0` в store при клике, не ждём сеть.
- **Проблема — аватарки у некоторых чатов нет**:
  - Добавлена детальная статистика в лог `loadAvatarsAsync`: `total=200 hasPhoto=180 noPhoto=20 downloaded=150 cached=30 failed=0`. Теперь в логе сразу видно сколько без фото (это нормально — у некоторых аккаунтов/каналов реально нет аватарки).
- **Медиа в сообщениях** (`MessageBubble.jsx`):
  - Маппер `mapMessage` определяет тип: photo / video / audio / file / link / location / contact / poll
  - IPC `tg:download-media` скачивает медиа через `client.downloadMedia`, кэш в `%APPDATA%/ЦентрЧатов/tg-media/`
  - Фото автоматически грузятся и показываются inline (картинка в бабле)
  - Видео/аудио/файлы — клик для скачивания, иконка + имя
  - Link/location/contact/poll — иконка-заглушка
- **Scroll-up (infinite scroll вверх)**:
  - При `scrollTop < 100px` и есть сообщения → `store.loadOlderMessages(chatId, oldestId, 50)`
  - IPC `tg:get-messages { offsetId }` → emit `tg:messages { append: true }`
  - Store добавляет старые в начало массива без дублей (Set по id)
  - Сохраняется позиция скролла — чтобы не прыгало к верху
- **Reply (ответ на сообщение)**:
  - Hover на баббл → появляется ↪ кнопка
  - Клик → панель «↪ Ответ на: ...» над полем ввода
  - Send с `replyTo: Number(messageId)`
- **Edit (редактирование своего)**:
  - Hover на свой баббл → ✏️ кнопка
  - Клик → текст подставляется в поле, панель «✏️ Редактирование»
  - Send → `client.editMessage(entity, { message, text })`
  - Баббл показывает «ред.» метку
- **Delete (удаление своего)**:
  - Hover на свой баббл → 🗑 кнопка
  - Confirm → `client.deleteMessages(entity, [id], { revoke: true })`
  - Сообщение пропадает из массива
- **Поиск по сообщениям в открытом чате**:
  - Кнопка 🔍 в шапке чата → появляется поле
  - Фильтр `text.toLowerCase().includes(q)` — без API, локально
  - Счётчик «Найдено: N»
- **Вынесен MessageBubble.jsx** (109 строк) — чтобы InboxMode не вырос выше лимита.

### v0.87.14 (15 апреля 2026) — Кэш + Mark as read + Toast + Typing + FIX аватарок
- **FIX аватарки не видны**: путь содержит кириллицу (`C:/Users/Директор/AppData/.../ЦентрЧатов/`). Chromium рендер не принимает `file://` без URL-кодирования. Фикс — `encodeURI(avatarPath)` перед `file:///`. Теперь видны 44+ реальных аватарок.
- **Ловушка 72**: `file://` URL с кириллицей должен быть закодирован через `encodeURI()` для работы в Electron рендере.
- **JSON-кэш чатов** (без БД, без установки):
  - Сохраняется в `%APPDATA%/ЦентрЧатов/tg-cache.json` после первой страницы
  - При старте: `store.loadCachedChats()` → UI показывает список **мгновенно** из файла
  - Параллельно GramJS грузит свежие и перезаписывает
  - Новый IPC `tg:get-cached-chats`
- **Mark as read**:
  - При выборе чата автоматически `store.markRead(chatId)` → IPC `tg:mark-read` → `client.markAsRead(entity)`
  - Telegram отмечает сообщения прочитанными, бейдж на телефоне сбрасывается
  - `chatEntityMap` хранит entity по chatId для быстрого доступа
- **Toast-уведомления через MessengerRibbon**:
  - При `tg:new-message` (не своё + не активный чат) → `window.api.invoke('app:custom-notify', { ... })`
  - Используется существующая модалка ribbon: title = chat.title, body = message.text, icon = chat.avatar, color #2AABEE, emoji ✈️
  - dismissMs 7 сек
  - Звук уже играет встроенный в MessengerRibbon (настраивается в Настройках приложения)
- **Typing-индикатор**:
  - Подписка на raw updates GramJS: `UpdateUserTyping`, `UpdateChatUserTyping`, `UpdateChannelUserTyping`
  - Emit `tg:typing { chatId, userId, typing }` → store обновляет `typing` map
  - В шапке чата `✍️ печатает...` вместо `● онлайн` если typing активен
  - Авто-истечение через 6 сек (если не пришло обновление)
  - Отправка своего typing: `client.invoke(SetTyping)` при вводе с debounce 3 сек
- **Read receipts** (собеседник прочитал / мы прочитали):
  - Raw updates `UpdateReadHistoryInbox` / `UpdateReadChannelInbox` → emit `tg:read`
  - Store сбрасывает `unreadCount` до реального `stillUnreadCount`
  - Чаты в списке имеют правильные счётчики после прочтения на телефоне

### v0.87.13 (15 апреля 2026) — FIX три бага: пагинация + аватарки не видны + Native фильтр в log-viewer
- **Баг 1 — 194 чата вместо всех**:
  - В логах: `первая страница: 194 чатов`. Условие `firstPage.length >= PAGE (200)` → `false` → фоновая загрузка **не запускалась**.
  - **Причина**: GramJS часто возвращает МЕНЬШЕ чем limit — это нормально. Но мой код считал «меньше limit = конец».
  - **Фикс 1**: триггер фоновой загрузки если `firstPage.length > 50` (порог).
  - **Фикс 2**: в `loadRestPagesAsync` стоп ТОЛЬКО при `page.length === 0` (пустой массив), а не `< PAGE`. Максимум до 30 итераций.
- **Баг 2 — аватарки на диске есть (44 файла), но в UI не видны**:
  - **Причина**: в react-window `rowComponent` был **inline** функцией внутри InboxMode. React воссоздавал её при каждом рендере, но react-window сохранял ссылки по index → чаты обновлялись в массиве, но строка не перерисовывалась.
  - **Фикс**: вынесен отдельный компонент `ChatRow` (снаружи InboxMode), принимает `chats`, `activeChatId`, `setActiveChat` через `rowProps`. react-window теперь правильно реагирует на изменения props.
- **Баг 3 — нет фильтра «⚡ Native» в окне логов**:
  - **Причина**: Окно логов — это **отдельный HTML файл** `main/log-viewer.html` (не React компонент!). Мой фикс в `LogModal.jsx` не влияет — это другой window.
  - **Фикс**: добавлен `<button data-f="native">⚡ Native</button>` в log-viewer.html + фильтр в функции `render()` по regex `/\[tg\]|\[startup|\[native\]/`.
- Ловушка 71 — окно логов это отдельный HTML, не React. Любые изменения делать в `log-viewer.html` напрямую.

### v0.87.12 (15 апреля 2026) — FIX autoRestore + ускорение загрузки + 5 UI улучшений
- **Баг 1**: после перезапуска программы просит войти заново — session НЕ восстанавливается.
  - **Причина**: `autoRestoreSession()` вызывался сразу в `initTelegramHandler()`. В этот момент `mainWindow.webContents` ещё **загружается** (renderer бандл не готов) → `emit('tg:account-update')` терялся.
  - **Фикс**: новая функция `startRestore()` — проверяет `win.webContents.isLoading()`, ждёт `did-finish-load` + 500мс задержки → только потом вызывает `autoRestoreSession()`. Это Ловушка 65 вторая волна (mainWindow есть, но renderer не готов).
- **Баг 2**: загрузка чатов 1+ минута.
  - **Причина**: цикл пагинации 20×200 = 4000 чатов делался **до** emit в UI. Пользователь видел `Чатов: 0, Загрузка...` всё время.
  - **Фикс**: первая страница (200) отправляется в UI **сразу** (~1 сек). Остальные — фоном через `loadRestPagesAsync()` + `emit('tg:chats', { append: true })`. Store добавляет без дублей (Set по id).
- **Улучшение 1 — Виртуальный скролл**: `npm install react-window`. InboxMode использует `<List rowCount rowHeight={64} rowComponent>`. При 10000 чатов рендерится только видимые ~15 строк. Плавный скролл, минимум памяти.
- **Улучшение 2 — Поиск**: `<input>` сверху списка с фильтром по title и lastMessage. Счётчик `💬 10 найдено из 256`.
- **Улучшение 3 — Infinite scroll**: уже работает через `append: true` — страницы приходят постепенно, UI их добавляет.
- **Улучшение 4 — Иконки типов**: 👤 для user, 👥 для group, 📢 для channel, 🤖 для ботов. Галочка ✓ синяя для verified аккаунтов.
- **Улучшение 5 — Онлайн-статус**: зелёный кружочек 12×12 снизу-справа аватарки для пользователей с `UserStatusOnline`. В шапке чата отображается `● онлайн`.
- **Рефакторинг**: `ChatListItem.jsx` вынесен из InboxMode (~70 строк) — прошли лимит 600.
- Ловушка 70 — autoRestore должен ждать renderer, не только mainWindow.

### v0.87.11 (15 апреля 2026) — Полная загрузка чатов + аватарки
- **Проблема 1**: `client.getDialogs({ limit: 100 })` возвращал первую страницу — у пользователя было видно ~4 чата из сотен.
  - **Фикс**: пагинация по 200 штук, цикл до 20 страниц (до 4000 чатов). Каждая страница использует `offsetDate`/`offsetId`/`offsetPeer` последнего элемента предыдущей. Стоп когда `page.length < PAGE`. Лог `getDialogs загружено N чатов`.
- **Проблема 2**: у чатов не было аватарок — только пустые места с именами.
  - **Фикс**: асинхронная загрузка `loadAvatarsAsync()`:
    - Папка кеша `%APPDATA%/ЦентрЧатов/tg-avatars/{rawId}.jpg`
    - Для каждого чата (первые 100): проверка `entity.photo && !photoEmpty`
    - Если в кеше — сразу emit `tg:chat-avatar` с путём `file://...`
    - Иначе `client.downloadProfilePhoto(entity, { isBig: false })` → запись на диск → emit
    - Не блокирует UI — выполняется параллельно после возврата `getDialogs`
  - **Store**: новый handler `tg:chat-avatar` обновляет `chat.avatar` в state.
- **UI InboxMode**:
  - Круглая аватарка 44×44px слева от имени чата
  - Если аватарки нет — цветной круг с инициалами (2 буквы из имени), цвет стабильный по hash имени (7 цветов Telegram-стиля)
  - Счётчик `💬 Чатов: N` сверху списка
  - Бейдж непрочитанных: `999+` если больше 999
- Ловушка 69 — не использовать single getDialogs без пагинации для production.

### v0.87.10 (15 апреля 2026) — FIX зависания + спиннеры + Native фильтр в логах + AuthFlow тесты
- **Симптом**: ввёл код → "Проверка..." висит. В логах: `emit step=password`, `askPassword + emit step=password` — server переключил на пароль, а UI не показал.
- **Причина 1 — двойной Promise в IPC**: `tg:login-code` создавал второй Promise (`_codeReply`) который ждал когда GramJS подтвердит. Если ANY часть зависала — handler никогда не резолвился → UI висел.
  - **Фикс**: упрощён IPC — `tg:login-code` сразу возвращает `{ ok: true }` после передачи кода в `pendingLogin.codeResolve`. Реальный результат (success / 2FA / error) приходит через `tg:login-step` events.
- **Причина 2 — `optimisticStep` блокировал серверный step**: при handlePhone я ставил `optimisticStep='code'`, и `step = optimisticStep || serverStep` всегда давал 'code', даже когда server emit'ил `step=password`.
  - **Фикс**: новая логика приоритета — `SERVER_PRIORITY = ['phone', 'code', 'password', 'success']`. Если серверный step **продвинутее** optimistic — берём server. Если меньше — optimistic.
- **Новое — emit step=success**: после `client.start().then()` явный сигнал в UI, потом `null` через 200мс. LoginModal автоматически закрывается через `onClose()` на step=success.
- **Спиннеры (5 совет)**: CSS `.native-spinner` 12×12px анимация rotate 0.7s linear infinite. Используется в «Отправляем код в Telegram...» и «Проверка...».
- **Подсказка про 2FA (4 совет)**: на экране code если нет ошибки и не waiting — показывается `.native-hint` синяя плашка «💡 Если у вас включена двухфакторная защита — после кода появится экран ввода пароля».
- **Native фильтр в LogModal (5 совет про лог)**: добавлена кнопка «⚡ Native» — фильтрует строки с `[tg]`, `[startup`, `[native]` — видно только нашу разработку.
- **AuthFlow тесты (1 совет)**: новый `AuthFlow.vitest.jsx` — 6 сценариев с mock IPC: phone→code, 2FA, FLOOD_WAIT, неверный код, success, server step перебивает optimistic.
- Ловушка 68 в common-mistakes.md: правило про optimisticStep ↔ serverStep.

### v0.87.9 (15 апреля 2026) — FIX: зависание после ввода кода (recoverable ≠ fatal)
- **Симптом**: пользователь ввёл код, нажал «Проверка» → висит «Проверка...» бесконечно.
- **Логи**: `14:27:02 SESSION_PASSWORD_NEEDED` + `Error while trying to reconnect`. То есть пришёл сигнал «нужен 2FA», GramJS начал переподключение.
- **Причина**: в v0.87.8 я добавил `client.disconnect() + destroy()` на ЛЮБУЮ ошибку. SESSION_PASSWORD_NEEDED — это НЕ ошибка, это штатный сигнал от Telegram «нужен облачный пароль». GramJS в ответ должен был вызвать наш callback `password: async () => askPassword()`. Но я убил client — callback не вызвался — UI завис.
- **Фикс**: разделение ошибок на **recoverable** (не рушить client) и **fatal** (остановить).
  - **Recoverable** (не трогаем client): `SESSION_PASSWORD_NEEDED`, `PHONE_CODE_INVALID`, `PASSWORD_HASH_INVALID`, `PHONE_CODE_EMPTY` — GramJS сам попросит callback снова.
  - **Fatal** (рушим client): `FLOOD_WAIT`, `PHONE_NUMBER_INVALID`, `PHONE_NUMBER_BANNED`, `USER_DEACTIVATED`, network errors.
- **Дополнительно**: в `.catch()` блока `client.start().then().catch()` — если приходит `SESSION_PASSWORD_NEEDED` как exception (некоторые версии GramJS так делают), эмулируем `emit step=password` вручную → UI переключается на экран пароля, клиент остаётся живым.
- Теперь: ввод кода → при необходимости 2FA → UI автоматически переключается на экран пароля.

### v0.87.8 (15 апреля 2026) — КРИТИЧНО: остановка GramJS retry + live countdown
- **Катастрофа в логах v0.87.7**: после первого FLOOD_WAIT GramJS `client.start()` **автоматически повторял** `auth.SendCode` по несколько раз в секунду. Каждый повтор = новый запрос = **мы САМИ флудили Telegram**. За 4 секунды — 20+ попыток, FLOOD_WAIT раскручивался до 5 минут и больше.
- **Причина**: `client.start()` имеет встроенный retry-механизм. При вызове `phoneNumber: async () => phone` он повторно пытается отправить код при ошибках. Мой `onError` только показывал ошибку в UI, но **не останавливал client**.
- **Фикс 1**: в `onError` после emit — **немедленно** `client.disconnect()` + `client.destroy()` + `client = null` + `pendingLogin = null`. Это останавливает retry-цикл.
- **Фикс 2**: извлечение `waitSeconds` из ошибки → emit `waitUntil: Date.now() + waitSeconds * 1000` → renderer видит точное время разблокировки.
- **Фикс 3 (UI)**: новый `useEffect` с `setInterval(1000)` — live countdown «⏱ Осталось: 4:58» обновляется каждую секунду. Кнопка «Получить код» заблокирована с текстом «Подождите 4:58» пока countdown > 0.
- **Фикс 4 (UI)**: при любой ошибке `setOptimisticStep(null)` — UI больше не висит на «⏳ Отправляем код...».
- Теперь: 1 клик = 1 попытка. FLOOD_WAIT отображается с таймером, пользователь видит когда можно попробовать снова.

### v0.87.7 (15 апреля 2026) — FLOOD_WAIT перевод + React Testing Library + pre-commit + CI
- **Проблема 1**: ошибка `A wait of 297 seconds is required (caused by auth.SendCode)` показывалась на английском.
  - **Причина**: мой regex искал формат `FLOOD_WAIT_NNN`, а GramJS сейчас возвращает в формате `A wait of NNN seconds is required`.
  - **Фикс**: добавлены 2 новых regex в `translateTelegramError` — `/A wait of (\d+) seconds is required/i` и `/wait of (\d+) seconds/i`. Перевод теперь: «⏱ Слишком много попыток. Подождите 5 минут и попробуйте снова. Telegram временно блокирует новые коды с этого номера, чтобы защитить аккаунт.»
- **Проблема 2**: тесты не ловили React runtime ошибки (как v0.87.5 «Cannot access before init»).
  - **Фикс**: установлены `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `happy-dom`, `vitest`, `@vitest/ui`.
  - Создан `vitest.config.mjs` с environment=happy-dom. Включает файлы `*.vitest.jsx` / `*.vitest.js`.
  - Написан первый runtime-тест `src/native/components/LoginModal.vitest.jsx` — 5 тестов: рендер phone/code/password, sticky error, клик «Получить код» вызывает startLogin.
  - Добавлены npm-скрипты: `npm run test:vitest` (одиночный запуск), `test:vitest-watch` (dev mode).
  - Vitest подключён в основной `npm test` pipeline перед `electron-vite build`.
- **Проблема 3**: pre-commit hook только ESLint — тесты не запускались, коммиты с багами проходили.
  - **Фикс**: hook `scripts/hooks/pre-commit` расширен — после ESLint запускает быстрые тесты (hookOrder, componentScope, fileSizeLimits, appStructure). При падении — блокирует коммит. `--no-verify` для обхода (не рекомендуется).
- **Проблема 4**: CI (GitHub Actions) запускал только `npm test` (последовательно, долго).
  - **Фикс**: `.github/workflows/test.yml` — добавлен отдельный шаг «Vitest (React components)» перед `npm test`. Если упадёт React — CI упадёт раньше с понятной причиной, не запуская все 24+ статические тесты и e2e.

### v0.87.6 (15 апреля 2026) — FIX React hook order + новый тест hookOrder
- **Симптом**: «Ошибка рендера: Cannot access 'optimisticStep' before initialization» в LoginModal.
- **Причина**: в v0.87.5 `useState([optimisticStep])` объявлен на строке 23, а использовался на строке 12 (выражение `step = optimisticStep || ...`). React правило: все `useState` должны быть объявлены в одинаковом порядке в начале компонента.
- **Почему тесты не поймали**: все существующие тесты **статические** (grep файлов, парсинг строк, лимиты размеров). Нет Jest / React Testing Library — React компоненты не рендерятся в тестах. `electron-vite build` компилирует синтаксис, но не выполняет хуки.
- **Фикс 1**: все useState перенесены на самый верх компонента в одном порядке.
- **Фикс 2 (защита на будущее)**: создан **новый тест** `src/__tests__/hookOrder.test.cjs` — статический анализатор:
  - Идёт по всем `.jsx` и `.js` в `src/components`, `src/native`, `src/hooks`, `src/App.jsx`
  - Находит все `const [x] = useState()` / `useRef()` / `useMemo()` / `useCallback()` / `useReducer()`
  - Для каждой переменной проверяет что первое использование идёт **после** объявления (учитывая комментарии и строки)
  - Ловит классическую ошибку «Cannot access X before initialization» **до запуска программы**.
- Подключён в `npm test` pipeline после `componentScope`.

### v0.87.5 (15 апреля 2026) — UX авторизации: мгновенный переход, sticky ошибки, перевод, красивые кнопки
- **Проблема 1**: после клика «Получить код» UI висел на экране ввода номера 5-15 сек (пока GramJS делал запрос к серверам) — можно было нажать кнопку 5 раз подряд.
  - **Фикс**: `optimisticStep='code'` в LoginModal — UI переключается **мгновенно** при клике. Поле кода disabled с надписью «⏳ Отправляем код в Telegram...» пока GramJS не готов.
- **Проблема 2**: после неверного пароля 2FA ошибка показывалась 1 секунду и исчезала.
  - **Причина 1**: `client.start().catch()` эмитил `step: 'phone'` — UI переключался на экран номера, ошибка «терялась».
  - **Причина 2**: `localError` сбрасывался при размонтировании, `serverError` перезаписывался новым `tg:login-step`.
  - **Фикс 1**: handler сохраняет текущий шаг (`password`/`code`/`phone`) при эмиссии ошибки — UI остаётся где был.
  - **Фикс 2**: sticky error через `useState('')` + `useEffect` — ошибка НЕ исчезает автоматически, только при клике действия или смене ввода пользователем.
- **Проблема 3**: ошибки были на английском и с техническими кодами (`PHONE_CODE_INVALID`, `SESSION_PASSWORD_NEEDED`, etc).
  - **Фикс**: функция `translateTelegramError()` в telegramHandler — переводит 17 типичных ошибок на понятный русский с инструкцией что делать. Флуд-wait автоматически переводится в «N секунд / N минут / N часов».
- **Проблема 4**: «дёрганые» кнопки (резкая смена цвета на hover).
  - **Фикс**: полностью переписаны стили `.native-btn`:
    - `transition: 0.2s ease` на background/transform/shadow
    - Hover: +`translateY(-1px)` + сине-голубой glow `rgba(42,171,238,0.25)`
    - Active: `scale(0.98)` + мгновенный отклик (0.05s)
    - Ripple-эффект (белая волна при клике через `::after`)
    - `focus-visible` outline для клавиатурной навигации
  - Ошибка теперь с иконкой ⚠️ и анимацией «тряски» при появлении.

### v0.87.4 (15 апреля 2026) — Критический FIX авторизации Telegram (3 бага)
- **Симптом v0.87.3**: кнопка «Получить код» → ничего не происходит, второй клик → «Авторизация уже в процессе».
- **Баг 1 (главный)**: `initTelegramHandler` вызывался ВНУТРИ app.whenReady ДО `createWindowFromManager`. В этот момент `mainWindow = null` → handler сохранял в `mainWindowRef = null` → все `emit()` шли в никуда → UI никогда не получал `tg:login-step { step: 'code' }`.
  - **Фикс**: перенесён вызов `initTelegramHandler` ПОСЛЕ `createWindowFromManager`. Плюс перешли с прямой ссылки на функцию `getMainWindow: () => mainWindow` — даёт актуальный mainWindow в момент emit.
- **Баг 2**: `startLogin()` в начале делал `emit('tg:login-step', { step: 'phone' })` — перезаписывал шаг в store на `phone` (и так уже шаг phone → UI оставался на вводе номера). Убран этот первый emit — step меняется только по вызову askCode/askPassword.
- **Баг 3**: в `nativeStore.js` cleanup функция вызывала `window.api.off(channel)` без callback → не работало (preload требует callback). Перешли на возвращаемую `on()` функцию отписки (preload её возвращает).
- **Добавлены детальные логи** в telegramHandler: emit channel, askCode, askPassword, client.start() calling, client asked phoneNumber/phoneCode/password, client.start SUCCESS — чтобы в будущем моментально находить где встал flow.
- Документация: Ловушка 65 в common-mistakes.md — «init handlers, использующие mainWindow, ДО создания окна → emit в никуда».

### v0.87.3 (15 апреля 2026) — Реальный GramJS — авторизация + чаты + отправка
- **Установлено**: `npm install telegram input` (GramJS v2.26.22 + input). `better-sqlite3` пока не ставим — session храним в обычном файле, база SQLite отложена до Шага 3.
- **telegramHandler.js полностью переписан** с STUB на реальный GramJS:
  - api_id=8392940, api_hash вшит в коде
  - `startLogin(phone)` → создаёт `TelegramClient` с `StringSession('')` → вызывает `client.start({ phoneNumber, phoneCode, password, onError })`
  - `phoneCode` и `password` — промисифицированные колбеки, которые ждут ввод от UI через IPC
  - После успеха: `client.session.save()` в `%APPDATA%/ЦентрЧатов/tg-session.txt`
  - `client.getMe()` → заполняет `currentAccount { id, name, phone, username, status: 'connected' }` → emit `tg:account-update`
  - `attachMessageListener()` — подписка на `NewMessage` event GramJS → emit `tg:new-message`
- **autoRestoreSession()** — при старте main-процесса читает `tg-session.txt`, если есть — автоподключение без повторного логина
- **IPC реализация**:
  - `tg:get-chats` → `client.getDialogs({ limit: 100 })` → маппинг в единый формат → emit `tg:chats`
  - `tg:get-messages` → `client.getMessages(chatId, { limit: 50 })` → emit `tg:messages`
  - `tg:send-message` → `client.sendMessage(chatId, { message: text })`
  - `tg:remove-account` → `client.disconnect()` + удаление session-файла
- **UI**: создан `src/native/modes/InboxMode.jsx` (205 строк) — полный 2-колоночный layout:
  - Слева: список чатов (320px), сортировка по lastMessageTs desc, бейджи непрочитанных, hover-эффект
  - Справа: шапка чата + лента сообщений (бубл вправо/влево) + поле ввода + кнопка отправки
  - Отправка по Enter, Ctrl+Enter, или кликом
  - Автозагрузка чатов при появлении аккаунта, автозагрузка сообщений при выборе чата
- **NativeApp.jsx** — подключён InboxMode для режима `inbox` (другие режимы пока заглушки)

### v0.87.2 (14 апреля 2026) — Логи запуска для диагностики долгой загрузки
- **Симптом**: после v0.87.1 (warm-up удалён, native_cc фильтр) пользователь сообщает что всё ещё долго стартует.
- **Диагностика**: добавлены тайминги:
  - `[startup-main]` в main.js: app.whenReady → logger init → createWindow → mainWindow created → did-finish-load → dom-ready
  - `[startup]` в App.jsx (renderer): useEffect start → messengers:load → settings:get → app:get-paths → Promise.all done → appReady=true
  - Тайминги пишутся через `app:log` в основной chatcenter.log + console
- **STUB telegramHandler**: при «Получить код» возвращает понятную ошибку (раньше показывался успех + переход на шаг кода). Теперь кнопка покажет красное сообщение «GramJS не установлен. npm install telegram input better-sqlite3».
- Когда пользователь перезапустит — увидим в логах где именно тормозит (main vs renderer, какой IPC долго отвечает).

### v0.87.1 (14 апреля 2026) — FIX долгая загрузка / пустой экран после v0.87.0
- **Симптом**: после установки v0.87.0 при запуске приложения окно открывается, но 7-15 секунд **полностью пустое** (нет вкладок, нет контента).
- **Причина 1 — warm-up**: hook `useWebViewLifecycle` при старте перебирал все вкладки по 1.5 сек × N штук. У пользователя 5 вкладок + новая native_cc = 9-10 секунд "пустого" экрана. Warm-up был добавлен в v0.86.6 для решения чёрного экрана Telega Avtoliberty, но Ловушка 64 показала что он не помогает. Цена слишком высокая.
- **Причина 2 — мусор в storage**: `native_cc` вкладка попала в `chatcenter.json` через `messengers:save` (при первом изменении списка). Это виртуальная вкладка, она программно добавляется при старте — не должна сохраняться. Сохранение делало её "обычной" → бесконечное накопление.
- **Фикс**:
  - **useWebViewLifecycle.js** — warm-up удалён (оставлен только health-check). Прогрев был неэффективен и блокировал UI.
  - **main.js** `messengers:save` — фильтр `m.isNative && m.id !== 'native_cc'` перед сохранением.
  - **App.jsx** при `messengers:load` — фильтрация `native_cc` из загруженного списка (защита от уже испорченного storage). Native_cc добавляется ВСЕГДА в конец списка программно.
  - **Очистка chatcenter.json** — удалена дублирующая запись native_cc вручную (бэкап в `chatcenter.json.bak-v087`).
- Тесты: всё зелёное.

### v0.87.0 (14 апреля 2026) — Запуск нативного режима «ЦентрЧатов» (шаг 1)
- **Что это**: новая вкладка в TabBar «ЦентрЧатов» (id=`native_cc`) — собственный UI для Telegram (+ потом WA/VK/MAX) через нативные API, минуя WebView. Альтернатива WebView-вкладкам, не заменяет их (старые остаются рабочими).
- **Мотивация**: Ловушка 64 — WebView Telegram чёрный экран на чатах с файлами. Решение — уйти от WebView к GramJS (MTProto клиент).
- **Структура** (шаг 1 — скелет без реального GramJS, ждёт `npm install telegram`):
  - `src/native/NativeApp.jsx` — корневой компонент с header + sidebar аккаунтов + модусы
  - `src/native/styles.css` — AMOLED тема (#000 фон, #2AABEE акцент), изолирована через `.native-mode`
  - `src/native/config.js` — api_id=8392940, api_hash вшит (ChatCenter app на my.telegram.org)
  - `src/native/store/nativeStore.js` — React hook-store для accounts/chats/messages + IPC подписки
  - `src/native/components/LoginModal.jsx` — 3 экрана: phone → code → 2FA
  - `main/native/telegramHandler.js` — IPC handlers (пока STUB: tg:login-start/code/password/cancel, tg:get-chats, tg:get-messages, tg:send-message, tg:remove-account)
- **Интеграция**: в App.jsx добавлен `NATIVE_CC_TAB` который добавляется к списку мессенджеров при старте; в цикле рендера — если `m.isNative` → `<NativeApp />` вместо `<webview>`.
- **Режимы UI** (в разработке): Inbox / Contacts / Kanban — переключаются в header. Сейчас только скелет с empty-state.
- **Дальше**: `npm install telegram better-sqlite3` → подключение GramJS → реальный login → загрузка чатов → Inbox UI.

### v0.86.10 (14 апреля 2026) — Ловушка 64 ОТКАТ: проблема в Telegram, не в нашем коде
- **Все попытки v0.86.5–v0.86.9 не помогли**. После реального теста пользователя: чат с файлом БЕЗ текстового сообщения (чистое вложение) → чёрный экран остаётся даже после `loadURL` без hash.
- **Реальная причина (установлено пользователем)**: Telegram Web K **сам** не может отрендерить chat view для чата, содержащего **только вложения без текста** в каких-то condition. Это **внутренний баг Telegram K**, не нашего кода.
- **Откат**: убраны `physicalResize`, `reloadIgnoringCache`, `loadURL(cleanUrl)` из useWebViewLifecycle. Оставлены только: `health-check` раз в 30 сек (для диагностики — увидеть если что-то пошло не так) и `warm-up` вкладок при старте (безопасно, помогает первой загрузке других мессенджеров).
- **Ловушка 64 ФИНАЛ**: обновлено с выводом что код ничего не может сделать с внутренним багом Telegram — только **обойти через другой канал данных** (Bot API, Telegram Client API, MTProto).
- **Следующий шаг** (к обсуждению, не сделано): использовать `telegram-client` / `gramjs` (JavaScript MTProto клиент) параллельно WebView — получать содержимое чатов с вложениями напрямую через API Telegram, минуя Web K. Аналог решения для WhatsApp через Baileys.

### v0.86.9 (14 апреля 2026) — Ловушка 64 РЕАЛЬНАЯ ПРИЧИНА: peer-changed race в Telegram K
- **Открытие из логов v0.86.8**: после reload снова `column-center=0x0`. В probe нашли: `probe[err]: rej|peer changed`. Это **unhandled promise rejection ВНУТРИ Telegram Web K** при загрузке URL с hash вида `#@LynxDAS`.
- **Реальная причина**: hash в URL заставляет Telegram при загрузке сразу попытаться открыть конкретный чат → внутренний race condition (сетевой запрос ещё не завершился, а peer уже меняется) → его собственный Promise отклоняется с `peer changed` → column-center не успевает отрендериться → 0×0.
- **Почему `reloadIgnoringCache()` не помог**: после reload URL остаётся с тем же hash → та же гонка повторяется.
- **Почему стандартный Telegram БНК работает**: при первом запуске Telegram грузится без hash (чистый `web.telegram.org/k/`) → нет попытки открыть чат → нет race condition.
- **Фикс v0.86.9**: при auto-recovery вместо `reloadIgnoringCache()` вызываем `el.loadURL(cleanUrl)` где `cleanUrl = currentUrl.split('#')[0]`. Telegram грузится без hash → нет race → column-center рендерится. Пользователь сам кликает чат после восстановления.
- Также убран шум `WebGL UNMASKED_RENDERER` в probe (вызывал `wv-err: WebGL: INVALID_ENUM`).
- Ловушка 64 ОБНОВЛЕНА — добавлена реальная причина и реальное решение.

### v0.86.8 (14 апреля 2026) — Ловушка 64: физический resize + авто-reload (v0.86.5 подход НЕ сработал)
- **Проблема v0.86.5 resize не помог**: после коммита v0.86.5 снова сделали диагностику — `probe[column-center]: size=0x0` всё ещё присутствует. Telegram Web K **игнорирует** `window.dispatchEvent(new Event('resize'))`.
- **Причина**: Telegram Web K использует **ResizeObserver** на реальном DOM-элементе, а он реагирует **только на реальное изменение размера**, не на синтетические события. `dispatchEvent` — фейковое событие без изменения метрик.
- **Новый фикс (v0.86.8)**:
  - **Физический resize**: меняем `parent.style.width = (clientWidth - 1) + 'px'`, через 2× `requestAnimationFrame` возвращаем исходное значение. ResizeObserver реально видит изменение → Telegram пересчитывает layout.
  - **Авто-recovery**: через 2 сек после активации вкладки опрашиваем `column-center.getBoundingClientRect()`. Если 0×0 — однократный `reloadIgnoringCache()`. Флаг `reloadedRef` чтобы не зациклить.
  - **Health-check расширен**: добавлен `health[tg-col]` — размер `#column-center` отдельно от общего `main`. Если 0×0 — сразу видно в логах.
- Ловушка 64 обновлена: что НЕ работает добавлено явно.

### v0.86.7 (14 апреля 2026) — FIX CI + warm-up вкладок + health-check + рефакторинг
- **CI fail на v0.86.5**: тест `fileSizeLimits` упал — `webviewSetup.js` вырос до 667 строк из-за DIAG-кода. Ubuntu-runner зафейлил → Windows отменён.
- **Рефакторинг**:
  - Вынесен DIAG-код из webviewSetup.js в новый модуль [src/utils/webviewDiagnostics.js](src/utils/webviewDiagnostics.js) — 96 строк (`logGeometry`, `runDomProbe`, `attachRuntimeErrorCatcher`). webviewSetup.js теперь 589 строк.
  - Вынесены 3 useEffect (forced resize + warm-up + health-check) из App.jsx в новый hook [src/hooks/useWebViewLifecycle.js](src/hooks/useWebViewLifecycle.js) — 70 строк. App.jsx теперь 571 строка.
- **Новая фича (Совет 3 — прогрев вкладок)**: при старте приложения автоматически перебираем все вкладки по 1.5 сек каждую → каждый WebView получает шанс инициализировать layout. Пользователь возвращается на исходную вкладку. Решает «первое открытие = чёрный экран» для всех будущих кастомных мессенджеров.
- **Новая фича (Совет 1 — постоянная диагностика)**: health-check раз в 30 сек шлёт короткий DOM-probe в активную вкладку (`__CC_DIAG__health[doc/body/main/err]`). В логах будет видно если вкладка схлопнулась — можно найти причину за минуту вместо часов.
- Все тесты 21/21 fileSizeLimits ✅. 73/73 notifHooks ✅. 40/40 appStructure ✅.

### v0.86.5 (14 апреля 2026) — FIX Telegram чёрный экран + полная DIAG WebView
- **Проблема**: в кастомной вкладке Telega Avtoliberty (partition `custom_1772779915564`) при клике на любой чат вся правая область становилась чёрной. Стандартный Telegram БНК работал нормально. Пересоздание partition (удаление `Partitions/custom_1772779915564/`) не помогло — значит, проблема в коде, а не в данных.
- **Диагностика**: добавлены логи `wv-err`/`wv-warn` (консоль WebView), `geom` (размер+видимость+z-index WebView и родителя + `elementFromPoint` в центре), `dom-probe` через `executeJavaScript` (12 полей: DOM size, body/html bg, Telegram-селекторы, column-center/bubbles размеры, canvas, WebGL, runtime error). Runtime error catcher через `window.addEventListener('error'+'unhandledrejection')` инжектится после `did-finish-load`.
- **Результат диагностики**: `probe[column-center]: size=0x0 disp=flex vis=visible op=1` + `probe[bubbles]: size=0x0 disp=none n=28`. DOM построен (1554 элементов, 28 пузырьков), `background=rgb(24,24,24)`, WebGL работает, ошибок нет. **Правая колонка Telegram схлопнута в 0×0**.
- **Причина**: Telegram Web K адаптивный. При ширине ≤ ~600px уходит в mobile-layout. Когда WebView инициализируется «в фоне» (неактивная вкладка = `zIndex:0, pointerEvents:none`) — Telegram через `ResizeObserver` читает некорректный первоначальный размер и фиксирует mobile-layout с закрытым chat view. При активации вкладки **размер окна не меняется** → resize event не приходит → Telegram продолжает считать себя mobile-скрытым → column-center 0×0.
- **Почему БНК работает**: стандартная Telegram-вкладка активируется **первой** при старте приложения → Telegram успевает получить корректный размер сразу. Кастомная Telega добавлена второй → стартовала «невидимой».
- **Фикс** [src/App.jsx](src/App.jsx): `useEffect` на `activeId` — при смене активной вкладки отправляем `window.dispatchEvent(new Event('resize'))` в WebView через `executeJavaScript`. Три повтора (0ms, 150ms, 500ms) чтобы поймать момент когда Telegram готов пересчитать layout. Безопасно для всех мессенджеров — они игнорируют лишний resize.
- **Связь**: расширение Ловушки 55 / ADR-013. Прошлый фикс (`disable-gpu-compositing` + отказ от `visibility:hidden`) решил один сценарий чёрного экрана (GPU-compositing loss), но НЕ решил сценарий mobile-layout lock-in в адаптивных SPA.
- Ловушка 64 задокументирована в common-mistakes.md.

### v0.86.4 (13 апреля 2026) — WhatsApp: Шаг 1 — отсечение SVG-title фантомов (частичный успех)
- **Проблема**: в ribbon прилетали фантомы `status-dblcheck`, `ic-expand-more`, `default-user` — имена SVG-иконок. WhatsApp рендерит иконку как `<span data-icon="NAME"><svg><title>NAME</title></svg></span>`; `span.textContent` возвращает содержимое `<title>` = имя иконки.
- **Фикс** (`whatsapp.hook.js` sidebar watcher): для каждого span проверяем `const iconName = sp.closest('[data-icon]')?.getAttribute('data-icon'); if (iconName && text === iconName) skip`.
- **ИТОГ ТЕСТА (лог 14:58)**:
  - ✅ Реальные сообщения проходят: `Свы`, `Дда` → ribbon.
  - ✅ `status-dblcheck` — больше **не** показан в ribbon.
  - ❌ `ic-expand-more` — **всё ещё проходит** как ribbon (3 раза в логе 14:58:47–57).
  - ✅ `Фото` — проходит (как и требовалось).
  - ✅ `печатает...` — глушится `_isSpam` regex.
- **Почему `ic-expand-more` не отсёкся**: у этого SVG нет атрибута `data-icon` на предке. Структура: `<span><svg><title>ic-expand-more</title></svg></span>` — без `data-icon`. Проверка `closest('[data-icon]')` возвращает `null` → условие не срабатывает.
- **Следующий шаг (Шаг 1b) — запланирован**: добавить вторую проверку `if (sp.querySelector('svg')) continue` — любой span с SVG-потомком игнорировать. Это покрывает остаток SVG-фантомов независимо от наличия `data-icon`.
- Тесты: 73/73 ✅. Ловушка 62 — обновлено.

### v0.86.3 (13 апреля 2026) — WhatsApp: откат фильтра `dir="auto"` + DIAG открытого чата
- **Откат v0.86.2**: селектор `span[dir="auto"]` → обратно `span[dir], span[class]`. После v0.86.2 sidebar watcher перестал шлать уведомления в открытом чате (0 записей `wa-sidebar: new from` после рестарта). Причина: для текущего открытого чата WhatsApp не рендерит preview-текст в `span[dir="auto"]` строки sidebar.
- **DIAG**: добавлено логирование `__CC_DIAG__wa-open` — при мутации строки с `aria-selected="true"` или CSS-классом `selected` дампится весь набор spans (dir, class, data-icon, inDataIcon, text). Цель — снять реальную структуру DOM открытого чата и выбрать надёжный признак для фильтрации фантомов.
- Ловушка 62 дополнена: подход `dir="auto"` помечен как **проваленный** — больше не предлагать.

### v0.86.2 (13 апреля 2026) — WhatsApp: фильтр фантомов по `dir="auto"`
- **Проблема**: sidebar watcher (v0.86.1) без debounce показал что в ribbon прилетают фантомные "сообщения" с текстом `status-dblcheck`, `ic-expand-more`, `Фото`, `печатает...` — это CSS-классы/статусы, не реальный текст пользователя.
- **Диагностика**: добавлено логирование всех spans row через `__CC_DIAG__wa-span`. Выявлено: реальный текст всегда в `span[dir="auto"]` (WhatsApp авто-детектит язык), фантомы — в `span[dir=""]` и внутри `[data-icon]`.
- **Фикс** (`whatsapp.hook.js`): селектор sidebar watcher сужен до `span[dir="auto"], span[dir="rtl"]` + exclude `[data-icon]` родителя. Начальный snapshot использует тот же фильтр.
- **Принцип**: фантомы отсекаются по **DOM-атрибуту**, НЕ по тексту → любой язык работает, текст пользователя не блокируется.
- Ловушка 62.

### v0.86.1 (8 апреля 2026) — WhatsApp sidebar watcher (уведомления при активной вкладке)
- **Sidebar MutationObserver** в whatsapp.hook.js (main world, не preload!)
  - Следит за #side: когда текст последнего сообщения меняется + badge есть = новое сообщение
  - Шлёт `__CC_NOTIF__` с именем чата и текстом (как обычное уведомление)
  - Snapshot при старте (8 сек) — не считает старые сообщения новыми
  - Debounce 2 сек — не спамит
  - Диагностика: `__CC_DIAG__wa-sidebar: observer attached` / `new msg`
- **Ловушка 60**: ribbon из title-update перехватывал __CC_NOTIF__ — убран
- **Звук title-update**: разблокирован при activeId=whatsapp

### v0.86.0 (7 апреля 2026) — WhatsApp навигация с логами + accountScript
- **WhatsApp "Перейти к чату"**: полная диагностика (spans, samples, method, matched)
  - Ищет `#side span[title]` (только sidebar, не внутри чата)
  - exact match → partial match (startsWith, indexOf) → samples для диагностики
- **WhatsApp accountScript**: DOM + pushName из localStorage + кэш __cc_account_name
  - Диагностика: __CC_DIAG__account: cached/dom/pushname/not found
- **messengerConfigs.js**: WhatsApp diagAccount читает кэш

### v0.85.9 (7 апреля 2026) — Pipeline Trace в файл + навигация + логи
- **Pipeline Trace → chatcenter.log**: traceNotif → app:log IPC → файл
- Формат: `[TRACE] ✓ [Telegram] Источник: текст | detail`
- НЕ пишет debug (badge_blocked спам). Ротация 500KB → 2MB
- Путь лога: `%APPDATA%/ЦентрЧатов/chatcenter.log` (НЕ chat-center!)
- **Log Viewer**: кнопка TRACE (фиолетовый фильтр) + кнопка Очистить
- **Logger диагностика**: тестовая запись при init, catch с логированием
- **Telegram навигация ИСПРАВЛЕНА** (ловушка 58):
  - `.chatlist-chat[data-peer-id]` — ищет ТОЛЬКО в chatlist
  - querySelector без фильтра находил аватарку в группе → открывал группу
  - location.hash не работает для навигации в Telegram Web K
  - mousedown + click с bubbles на правильном элементе
- **AccountScript Telegram**: user_auth.id из localStorage → правильное имя
  - Сохраняет в localStorage для diagAccount (кэш)
- Лог-файл: `ЦентрЧатов` (app.name), НЕ `chat-center` (package.json name)

### v0.85.8 (6 апреля 2026) — FIX навигация + go-chat в trace + полный memory-bank
- **Telegram hash навигация**: `c` prefix → `#-100peerId` (каналы), `u` → `#peerId` (пользователи)
- **go-chat → Pipeline Trace**: method, log, attempts — видно в UI диагностики
- **traceStepLabels**: добавлены go-chat, mark-read, crash, hang, load-fail
- WebView загрузка: убран visibility:hidden (останавливал загрузку неактивных вкладок)
- 8 новых тестов: hash формат, runtime проверка c/u prefix, реальные chatTag

### v0.85.7 (6 апреля 2026) — FIX 1-символьные + заблокированные → Pipeline Trace
- **_isSpam**: `body.length < 2` → `!body.trim()` во всех 4 hooks (telegram/whatsapp/vk/max)
- Сообщения "С", "+", "1", "Д", "-" теперь проходят через Notification API
- enrichNotif (VK/MAX) не тронут — там DOM-контекст, порог оправдан
- 13 новых тестов: 5 в isSpamText (1-символьные), 8 в notifHooks (body.length check)
- Ловушка 56 задокументирована
- **Заблокированные → Pipeline Trace**: все hooks шлют `__CC_DIAG__hook-blocked: reason` при блокировке
- Теперь видно В ТРЕЙСЕ почему уведомление не пришло (empty/system/outgoing/own-chat)

### v0.85.6 (6 апреля 2026) — FIX badge_blocked спам + чёрный экран WebView
- **badge_blocked спам**: 130+ записей за 30 мин → 0 (не логируется, не обновляет статус)
- **Чёрный экран Telegram**: visibility:hidden для неактивных WebView + disable-gpu-compositing
- **SharedArrayBuffer**: включён для Telegram Web (требует feature flag)
- Ловушка 55 задокументирована

### v0.85.5+ (30 марта 2026) — FIX красные кругляшки + displayText
- **Ловушка 54**: monitorStatus active при любом `__CC_` ответе (не только unread-count)
- **displayText fix**: переменная вынесена до if(ribbonOn) — ReferenceError при выключенном ribbon

### v0.85.5 (30 марта 2026) — Полное логирование + все слепые зоны закрыты
- **Deprecated fix**: console-message Event API (Electron 41)
- **WebView crash/hang**: render-process-gone + unresponsive + did-fail-load → лог + статус
- **MaxListeners fix**: setupSession не добавляет повторные listeners (_setupDone Set)
- **Пустые catch {}→логирующие**: storage read, setupSession, backup notif, icon download, notification fallback
- **Тесты**: 10 новых проверок (renderer logging, crash detection, deprecated API, MaxListeners)

### v0.85.4 (30 марта 2026) — .npmrc, postinstall hooks, architecture.md
- `.npmrc` — `legacy-peer-deps=true` (CI не упадёт при конфликтах)
- `postinstall` — pre-commit hook ставится автоматически при `npm install`
- `architecture.md` — полное обновление (65 файлов, 3 процесса, потоки данных)

### v0.85.3+ (30 марта 2026) — Защита сессий + ловушка 51
- **Тесты защиты сессий**: 12 проверок в storageErrors.test.cjs
  - Все 4+custom мессенджера имеют `persist:` partition
  - `clearStorageData` НЕ чистит cookies/localStorage/indexedDB
  - Нет `clearStorageData()` без фильтра (удаляет ВСЁ)
  - Нет partition без `persist:` (временная сессия)
- **Ловушка 51**: незакоммиченные файлы при рефакторинге агентами
  - AIProviderTabs.jsx + useIPCListeners.js забыты в git add
  - CI падал: `Could not resolve "./AIProviderTabs.jsx"`

### v0.85.3 (30 марта 2026) — ESLint 0 warnings, LF normalize, pre-commit hook
- ESLint: 108 warnings → **0** (no-eval error, no-dupe-keys error, no-unreachable error)
- `.gitattributes` — все текстовые файлы нормализованы в LF
- `git add --renormalize .` — применена нормализация ко всем файлам
- Pre-commit hook: ESLint проверка staged файлов перед коммитом
- `npm run lint` — 0 max warnings (строгий режим)
- CI: `npm run lint` добавлен в GitHub Actions
- `@eslint/js` downgraded `^10→^9` — fix CI peer dependency conflict

### v0.85.2 (30 марта 2026) — .editorconfig, ESLint 9, лимиты 600, build в test
- `.editorconfig` — единый стиль: UTF-8, LF, 2 пробела, trim trailing
- ESLint 9 (flat config) — минимальный конфиг, ловит no-undef, no-eval, no-unused-vars
- `npm run lint` — команда проверки (120 max warnings)
- Лимиты файлов снижены: App.jsx/main.js/monitor/AISidebar/webviewSetup/dockPin — все ≤600
- `electron-vite build` добавлен в `npm test` — каждый тест = тесты + сборка

### v0.85.1 (30 марта 2026) — App.jsx ≤556, runtime-тесты, все файлы ≤600
- **App.jsx**: 660 → 556 строк. Вынесено:
  - `hooks/useNotifyNavigation.js` — notify:clicked + mark-read + visibilitychange
  - `components/ConfirmCloseModal.jsx` — диалог подтверждения закрытия
- **Runtime-тесты**: `extractedModules.test.cjs` — 37 тестов
  - extractMsgText: 14 runtime-тестов (реальные вызовы функций)
  - isSidebarNode: 8 runtime-тестов с DOM-моками
  - 15 структурных тестов для всех извлечённых модулей
- Все 6 главных файлов теперь ≤571 строк (цель ≤600 ✅)

### v0.85.0 (30 марта 2026) — Масштабный рефакторинг: все файлы ≤660 строк
- **main.js**: 1086 → 569 строк. Вынесено 5 модулей:
  - `handlers/notificationManager.js` (244) — окно уведомлений, иконки, дедупликация
  - `handlers/aiLoginHandler.js` (143) — окно логина AI-провайдеров
  - `handlers/backupNotifHandler.js` (121) — backup notification path, multi-account
  - `utils/windowManager.js` (103) — createWindow, getPreloadPath
  - `utils/trayManager.js` (89) — createTray, openLogViewer
- **App.jsx**: 1344 → 660 строк. Вынесено 8 модулей:
  - 7 custom hooks в `src/hooks/`: useKeyboardShortcuts, useAIPanelResize, useWebViewZoom, useBadgeSync, useTabManagement, useSearch, useTabContextMenu
  - `components/TabBar.jsx` (311) — полная панель вкладок
- **webviewSetup.js**: 888 → 545. Вынесен `consoleMessageHandler.js` (377)
- **monitor.preload.js**: 837 → 465. Вынесено 5 утилит:
  - `utils/chatMetadata.js`, `messageExtractor.js`, `domSelectors.js`, `diagnostics.js`, `messageRetrieval.js`
- **AISidebar.jsx**: 800 → 643. Вынесено 4 утилиты:
  - `aiStreamingHandler.js`, `aiProviderChecker.js`, `aiLoginHandler.js`, `aiWebviewContext.js`
- **dockPinHandlers.js**: 692 → 571. Вынесен `dockPinUtils.js` (100)
- Все 23 тестовых файла обновлены, 700+ тестов проходят

### v0.83.5 (27 марта 2026) — Electron 41 + electron-vite 5
- **Electron**: 33.4.11 → **41.1.0** (8 мажорных версий, актуальная стабильная)
- **electron-vite**: 2.3.0 → **5.0.0** (поддержка vite 5/6/7)
- Vite 5.4.21 оставлен (совместим с electron-vite 5)
- React 18.3 и Tailwind 3.4 не изменены (совместимы)
- Все тесты проходят, build 3 bundles OK

### v0.83.4 (27 марта 2026) — Все undefined vars + componentScope тест + ErrorBoundary
- **12 undefined переменных исправлены** в AIConfigPanel.jsx (ловушка 50)
- **componentScope.test.js** — автоматически проверяет ВСЕ 9 компонентов на undefined переменные
- **ErrorBoundary** в main.jsx — показывает ошибку вместо белого экрана
- **Правило 5 в CLAUDE.md** — запрет git откатов без разрешения

### v0.83.3 (26 марта 2026) — 69 runtime unit тестов + bugfixes
- **69 новых runtime unit тестов** в `unitRuntime.test.js`: cleanupSenderCache (4), getSoundForColor (5), hook _isSpam regex (28), AI PROVIDERS config (22), PIXEL_FONT + setPixelBGRA (6)
- **Bugfix: dockPinHandlers.js** — лишняя `}` вызывала build error
- **Bugfix: AIConfigPanel.jsx** — импорт несуществующих PROVIDER_LIST/PROVIDER_DEFAULTS
- Всего тестов: 660

### v0.83.2 (26 марта 2026) — AISidebar дробление
- **AIConfigPanel.jsx** (328 строк) — конфиг-панель провайдера вынесена из AISidebar.jsx
- **AISidebar.jsx**: 1115 → 800 строк (-315)
- Теперь ВСЕ файлы проекта <1000 строк (кроме App.jsx 1305 и main.js 1045 — обоснованные исключения)

### v0.83.1 (26 марта 2026) — AI refactor + sender cache + MAX own-msg fix
- **AI handlers refactored** — PROVIDERS конфиг вместо дублирования. 4 провайдера определены как объекты с url/headers/body/extract. Streaming и обычная генерация используют один конфиг.
- **Sender cache cleanup** — TTL 5 мин + LRU лимит 50 записей. `cleanupSenderCache()` вызывается при каждой записи.
- **MAX own messages (ловушка 49)** — ИСПРАВЛЕНО. В max.hook.js: если enriched sender = имя в topbar (header активного чата) И документ видим → блокируем как own-chat. Своё сообщение не показывается как от собеседника.

### v0.83.0 (26 марта 2026) — Исправления из аудита: утечка памяти + magic numbers
- **ФИКС: setInterval утечка** — `setupNavigationWatcher` сохраняет ID интервала в `_navWatcherInterval`, очищает при повторном вызове
- **Timing constants** — magic numbers заменены на константы: `GRACE_PERIOD=15000`, `RETRY_SHORT=3000`, `SNAPSHOT_DELAY=13000`, `COOLDOWN_MSG=3000`, `WARMUP_DELAY=10000`, `NAV_POLL_INTERVAL=2000`
- Все executeJavaScript вызовы в App.jsx уже имели .catch() — аудит подтвердил

### v0.82.6 (26 марта 2026) — WebView setup вынесен из App.jsx
- **WebView setup** (842 строки) вынесен в `src/utils/webviewSetup.js`: tryExtractAccount, notification refs, traceNotif, handleNewMessage, setWebviewRef (с ВСЕМИ event listeners)
- **App.jsx**: 2137 → 1305 строк (-832!)
- `createWebviewSetup(deps)` — фабричная функция, принимает 25 зависимостей из App scope
- Closure сохраняется — handleNewMessage имеет доступ ко всем refs через deps

### v0.82.5 (26 марта 2026) — Dock/Pin система вынесена из main.js
- **Dock/Pin/Timer** (684 строк) вынесены в `main/handlers/dockPinHandlers.js`
- **main.js**: 1719 → 1045 строк (цель ~1000 почти достигнута!)
- Все pin:* и dock:* IPC handlers, helper функции, ensureDockWindow, pinItems Map, таймеры
- Зависимости передаются через deps: getMainWindow, storage, isDev, __dirname, path, DEFAULT_MESSENGERS

### v0.82.4 (26 марта 2026) — Notification handlers вынесены из main.js
- **Notif handlers** (75 строк) вынесены в `main/handlers/notifHandlers.js`: notif:click, notif:mark-read, notif:dismiss, notif:resize
- **main.js**: 1785 → 1719 строк
- Используют getter/setter для мутабельных данных (notifItems, notifWin, mainWindow)

### v0.82.3 (26 марта 2026) — Unread counters вынесены из monitor.preload.js
- **Unread counters** (491 строк) вынесены в `main/preloads/utils/unreadCounters.js`: UNREAD_SELECTORS, LAST_MESSAGE_SELECTORS, getMessengerType, countUnread, countUnreadVK, countUnreadMAX, countUnreadTelegram, isBadgeInMutedDialog, isActiveChatMuted, isActiveChatChannel, getChatType, _extractUnreadFromChat
- **monitor.preload.js**: 1312 → 825 строк (цель <1000 достигнута)

### v0.82.2 (26 марта 2026) — Очистка + AI handlers вынесены
- **AI handlers вынесены** из main.js в `main/handlers/aiHandlers.js` — main.js: 1962 → 1785 (-177 строк)
- **Удалён placeholder** `(function() { /* placeholder */ })()` из monitor.preload.js
- **Удалён мёртвый setIgnoreMouse** из pin-dock.preload.js (ловушка 27: ломает drag)
- **Удалён неиспользуемый `_origSetBadgeCount`** из main.js

### v0.82.1 (26 марта 2026) — extractMsgText/quickNewMsgCheck per-messenger + диагностика проекта
- **extractMsgText per-messenger** — спам-паттерны вынесены в `EXTRACT_SPAM` конфиг (MAX: _maxPhantom+_editedMark, WhatsApp: status-dblcheck, VK: UI-секции). Функция принимает `type`.
- **quickNewMsgCheck per-messenger** — deep scan селекторы вынесены в `QUICK_MSG_SELECTORS` конфиг (разные для каждого мессенджера).
- **Полная диагностика проекта**: все файлы в лимитах, нет мёртвого кода, нет битых связей, 583 теста проходят.

### v0.82.0 (26 марта 2026) — Per-messenger notification hooks (полное разделение)
- **АРХИТЕКТУРНЫЙ РЕФАКТОРИНГ**: Notification hooks разделены на per-messenger файлы: `main/preloads/hooks/{telegram|max|whatsapp|vk}.hook.js`
- Каждый мессенджер имеет СВОЙ: спам-фильтр, enrichment, Notification/showNotification override, Badge/SW/Audio block
- Изменение hook для MAX НЕ затрагивает Telegram/WhatsApp/VK — полная изоляция
- **Удалён дублированный код**: 330 строк inline injection из App.jsx, 220 строк из monitor.preload.js
- monitor.preload.js загружает hook через `fs.readFileSync` из per-messenger файла
- App.jsx загружает hook через IPC `app:read-hook` → executeJavaScript (fallback для CSP)
- IPC handler `app:read-hook` в main.js читает hook файл с защитой от path traversal
- 56 новых тестов в `notifHooks.test.js` — проверка структуры каждого hook файла

### v0.81.7 (25 марта 2026) — MAX навигация к чату (РАБОТАЕТ)
- **"Перейти к чату" для MAX** — ПОЧИНЕНО. DOM sidebar MAX: `div.wrapper--withActions`. Простой `.click()` НЕ триггерит Svelte обработчик. Решение: проверить children wrapper'а — если есть `<a>` или `<button>` кликнуть на них, если parent = `<a>` кликнуть на parent, иначе `MouseEvent({bubbles:true})`. Добавлена диагностика children/parent в log.
- v0.81.6: MouseEvent на wrapper — не помогло
- v0.81.5: wrapper--withActions найден, .click() — не помогло
- v0.81.4: [role="listitem"] — MAX не ставит role, не помогло

### v0.81.3 (25 марта 2026) — Фикс isSpam ReferenceError (__CC_NOTIF__ сломан)
- **КРИТИЧЕСКИЙ ФИКС**: `isSpam` переменная на строке 1692 App.jsx НЕ БЫЛА ОПРЕДЕЛЕНА → `ReferenceError` → `catch {}` глотал ошибку → `handleNewMessage` не вызывался → **ВСЕ `__CC_NOTIF__` уведомления сломаны** (MAX, Telegram, WhatsApp). Уведомления работали только через backup-пути (__CC_MSG__, IPC, unread-count). Фикс: `if (text && !isSpam)` → `if (text)` — спам-фильтр уже вызван выше.

### v0.81.2 (25 марта 2026) — chatObserver отключён для VK
- **chatObserver (Path 1 CO) отключён для VK** — `if (type === 'vk') return` в `startChatObserver`. chatObserver не различает входящие/исходящие, ловит свои сообщения ("любимка") как от собеседника, склеивает sender+text ("Елена ДугинаПокушал ?"). VK теперь работает ТОЛЬКО через unread-count (UC) — проверено логами: UC выдаёт чистый текст ("Покушал ?", "Хорошо") без фантомов.

### v0.81.1 (25 марта 2026) — Path 2 off MAX + фильтр исходящих + extractMsgText + className
- **Path 2 отключён для MAX** — `type !== 'max'` в условии Path 2 (аналогично VK v0.81.0)
- **getVKLastIncomingText фильтрует исходящие** — ищет пузыри `[class*="ConvoMessage"]`, пропускает `out/own/self/sent` в className. Не возвращает свои сообщения ("Любимка")
- **extractMsgText не склеивает** — для node-обёрток (>2 children) ищет leaf-элемент (span/p) вместо textContent всей обёртки. "Елена ДугинаА13:52" → "А"
- **className SVG fix** — `typeof el.className === 'string'` перед `.substring()` — SVG элементы имеют SVGAnimatedString, не String

### v0.81.0 (25 марта 2026) — Отключён Path 2 для VK
- **Path 2 отключён для VK** — `sendUpdate` Path 2 (`getLastMessageText` сравнение) отключён для `type === 'vk'`. Причина: `getLastMessageText()` читает DOM текущего чата, но при переключении чатов возвращает текст ДРУГОГО чата → фантомные уведомления. VK использует chatObserver (Path 1 addedNodes) для детекции новых сообщений. Аналогично Telegram (отключён с v0.47.2).

### v0.80.9 (25 марта 2026) — Фикс фантомных VK уведомлений + парсер диагностики
- **ФИКС: сброс dedup при SPA-навигации** — `lastActiveMessageText`, `lastQuickMsgText`, `lastSentText` обнуляются при смене URL в VK/MAX. Текст предыдущего чата больше не влияет на dedup нового чата.
- **ФИКС: реинициализация dedup после grace period** — при окончании 15-секундного grace period `getLastMessageText()` записывается в dedup ДО включения мониторинга. Старые сообщения текущего чата не проходят как "новые".
- **ФИКС: парсер диагностики** — App.jsx теперь читает `parsed.text` (не только `parsed.body`) → маркеры `msg-src`, `nav`, `grace-end`, `lastActive-chg` видны в Pipeline Trace.
- **Задержка snapshot** — `startChatObserver` вызывается через 13 сек (не 1.5 сек) после навигации, чтобы VK успел отрисовать чат.

### v0.80.8 (25 марта 2026) — Диагностика фантомных VK уведомлений
- **msg-src маркер** — `__CC_DIAG__msg-src: CO|UC|P2` перед каждым `__CC_MSG__` для точного определения источника уведомления (chatObserver / unread count / path 2 text change)
- **nav dedup-dump** — при навигации VK SPA логирует `lastActiveMessageText` и `lastQuickMsgText` для отладки stale dedup
- **snapshot ts** — timestamp привязки chatObserver + размер snapshot для диагностики пустых snapshot'ов
- **grace-end лог** — состояние `lastActiveMessageText` при окончании 15-секундного grace period
- **lastActive-chg** — логирование тихой перезаписи `lastActiveMessageText` в Path 2 (без отправки уведомления)

### v0.80.6 (25 марта 2026) — VK/MAX: отключён body-fallback + автоочистка vite-кэша
- **VK/MAX body-fallback ОТКЛЮЧЁН** — `noBodyFallbackTypes = ['vk', 'max']`. Если контейнер чата не найден → НЕ наблюдаем body. Ждём навигацию → привязка к `ConvoMain__history`.
- **Автоочистка vite-кэша** — `scripts/dev.js` удаляет `node_modules/.vite/` при каждом запуске (ловушка 44).
- **Grace period при навигации** — 5 сек после URL change внутри WebView (ловушка 45).
- **cleanSenderStatus** — убирает "заходила X назад" из sender VK.
- **Viewing для MutationObserver** — НЕ блокирует ribbon если нет `fromNotifAPI` (VK не использует Notification API).
- Ловушки 44-46 записаны в common-mistakes.md

### v0.79.5 (23 марта 2026) — Аудит + оптимизация проекта
- Удалены неиспользуемые зависимости: zustand, electron-store, cross-env
- projectHealth.test.js — 29 тестов здоровья проекта
- Оценка аудита: 9/10

### v0.79.0-v0.79.4 (23 марта 2026) — Полный рефакторинг App.jsx
- **App.jsx: 3747 → 2446 строк (-34.7%)**
- **main.js: 2088 → 1945 строк (-6.8%)**
- Вынесены модули: sound.js, navigateToChat.js, messengerConfigs.js, messageProcessing.js, overlayIcon.js
- Вынесены компоненты: MessengerTab.jsx, NotifLogModal.jsx
- shared/spamPatterns.json — единый источник спам-паттернов
- **344 юнит-теста (10 файлов), все ✅**
- GitHub Actions CI (.github/workflows/test.yml)
- npm test = автозапуск всех тестов

### v0.78.0-v0.78.2 (20 марта 2026) — Диагностики по мессенджерам
- messengerConfigs.js: ACCOUNT_SCRIPTS, DOM_SCAN_SCRIPTS для каждого мессенджера
- Объединение диагностик в одно окно (5 вкладок: Лог, Pipeline, DOM, Хранилище, Аккаунт)
- Контекстное меню: 4 диагностики → 1 пункт "Диагностика и логи"

### v0.77.7 (20 марта 2026) — VK: sender-strip + фильтр своих сообщений
- Убирает имя sender из текста VK ("Елена ДугинаТекст" → "Текст")
- Фильтр своих: если текст начинается с "Имя Фамилия" (не sender) → блок

### v0.77.4 (20 марта 2026) — VK: дедуп по подстроке
- Parent "Елена ДугинаТекст" + child "Текст" → 1 ribbon (было 2)

### v0.77.3 (19 марта 2026) — Фикс "Перейти к чату": парсинг tag формата u{id}_{msgid}
- **Парсинг peerId из tag**: Telegram tag = `u611696632_7545915126561356173`. Regex `^peer\d+_` не матчил формат `u{id}_`. Заменено на `tag.split('_')[0].replace(/[^0-9-]/g, '')` → peerId = `611696632`.
- **Ловушка 41**: Telegram Web K tag формат: `u{userId}_{messageId}` (не `peer{type}_{id}`). Универсальный парсинг: `split('_')[0]` берёт первую часть до `_`.

### v0.77.2 (19 марта 2026) — Аватарки в ribbon: blob→data:URL ПЕРЕД отправкой
- **Blob→data:URL**: executeJavaScript Image→canvas→toDataURL **ДО** handleNewMessage. Ribbon получает data:URL, не blob.
- **_imgToDataUrl helper**: DOM enrichment: img→canvas→data:URL для blob/http аватарок.
- **Подтверждено**: Лог `iconData=data:image/jpeg;base64,...` — аватарки работают!
- **Ловушка 40**: blob: URL привязан к origin WebView → не загружается в notification.html.

### v0.77.1 (19 марта 2026) — Аватарки: blob→data:URL через canvas
- **_imgToDataUrl helper**: Конвертирует img (blob/http/data) → data:URL через canvas. Для blob: URL — единственный способ передать в ribbon window.
- **DOM enrichment**: Все 3 места поиска аватарки → `_imgToDataUrl(av)` вместо `av.src`.
- **__CC_NOTIF__ blob icon**: При получении blob icon → executeJavaScript в WebView для конвертации Image→canvas→data:URL. Кэшируется в senderCache.
- **Ловушка 40**: blob: URL привязан к origin WebView. notification.html = другой BrowserWindow → blob не загрузится. Решение: canvas.toDataURL() внутри WebView.

### v0.77.0 (19 марта 2026) — Аватарки Telegram в ribbon: поддержка blob: URL
- **blob: URL**: Telegram Web K использует `blob:https://...` для аватарок. Проверка `startsWith('http')` не ловила blob → аватарка не показывалась в ribbon. Добавлено `|| startsWith('blob:')` во все 5 мест.
- **Ловушка 39**: Telegram аватарки = blob: URL (не http). `startsWith('http')` = false → иконка не передаётся → ribbon показывает иконку мессенджера вместо фото.

### v0.76.9 (19 марта 2026) — VK: имя отправителя + убран спам-фильтр числа
- **Убран спам-фильтр `^\d{1,4}$`**: Блокировал реальные сообщения-числа от людей. Фантом "11" решён через isSidebarNode.
- **VK sender enrichment**: `ConvoListItem` добавлен в findSenderInChatlist. Имя из `.ConvoListItem__peer`.
- **Навигация VK**: Уже работала (startChatObserver перепривязывается при navigation detection).

### v0.76.8 (19 марта 2026) — Фикс ВК: sidebar-фильтр + дедуп + спам-фильтр числа
- **isSidebarNode в quickNewMsgCheck**: КРИТИЧЕСКИЙ БАГ — `isSidebarNode` НИКОГДА не вызывался при body-fallback. Проверка `_chatContainerEl && ...` = false (null) → пропуск не работал. Теперь `isSidebarNode` вызывается ВСЕГДА при body-fallback.
- **Дедуп по подстроке**: VK parent="ИмяТекст", child="Текст" — разные тексты, дедуп не ловил. Теперь: `lastText.includes(newText)` → дубль.
- **Спам-фильтр числа**: `^\d{1,4}$` = UI бейдж/счётчик (VK Фото 27, Игры 1).
- **Sidebar-фильтр расширен**: `left_nav`, `_page_sidebar`, `counts_module`, `HeaderNav`.

### v0.76.7 (19 марта 2026) — Фикс: поиск .badge с числом через querySelectorAll
- **_extractUnreadFromChat**: `querySelectorAll('.badge')` + `textContent = число`. Не `querySelector` (первый `.badge` = обёртка с текстом чата).
- **Ловушка 37**: В TG Web K `.chatlist-chat` содержит несколько `.badge` — первый = обёрточный (весь текст), маленький = числовой бейдж. `querySelector` находит обёрточный. `querySelectorAll` + проверка `^\d+$` = правильный.

### v0.76.4 (19 марта 2026) — Split по chatlist textContent + peer-id
- **_extractUnreadFromChat**: Парсит число непрочитанных из конца textContent чата (regex `(\d+)\s*$`). В TG Web K число бейджа всегда в конце текста: "Текст...24".
- **Split по peer-id**: Для каждого чата: если `data-peer-id` > 0 (личный) и есть число → personal. Иначе → channel.
- **Убран антифантом**: Заменён на корректный подсчёт. Если chatlist есть → personalTabFound = true → fallback не срабатывает.
- **Ловушка 36**: `.badge` в TG Web K (вертикальные папки) = обёрточный элемент с ВСЕМ текстом чата, не числовой бейдж. `textContent.match(/(\d+)\s*$/)` — надёжнее.

### v0.76.3 (19 марта 2026) — Антифантом: chatlist как финальный арбитр
- **Антифантом**: Если chatlist загружен (≥5 чатов) и allTotal > 0, но НИ ОДИН чат не имеет видимого `.badge` с числом → `allTotal = 0`. Folder badge, title, Badge API могут фантомить (архив, скрытые боты).
- **Ловушка 35**: Folder badge Telegram считает ВСЕ unmuted непрочитанные, включая скрытые/архивные. Видимый chatlist — единственный достоверный источник для пользователя.

### v0.76.2 (19 марта 2026) — Split personal/channels по data-peer-id
- **data-peer-id**: Telegram Web K хранит ID чата на каждом `.chatlist-chat`. Положительный = user/bot (личное), отрицательный = group/channel (сообщество).
- **getChatType fallback**: Если `data-peer-type` нет → проверяет `data-peer-id` знак.
- **countUnreadTelegram**: Два метода split — (1) папка "Личные" если есть, (2) chatlist + peer-id если нет.
- **Вертикальные папки**: Добавлен поиск "Личные" в `folders-sidebar__folder-item`.

### v0.76.0 (19 марта 2026) — Фикс WhatsApp: убран #app, добавлен фильтр дат
- **Убран `#app`**: Слишком широкий контейнер — sidebar-фильтр НЕ применяется в "container" режиме. Теперь если `#main` не найден → body-fallback + sidebar-фильтр (role=grid/row/gridcell, #side).
- **Спам-фильтр дат**: `29.12.2025`, `DD.MM.YYYY`, `DD/MM/YYYY`, "вчера", "сегодня", дни недели — блокируются.
- **Ловушка 33**: `#app` как container → sidebar-фильтр (`isSidebarNode`) НЕ применяется (только для body-fallback). body-fallback + расширенный sidebar-фильтр надёжнее.

### v0.75.9 (19 марта 2026) — Обновлённый chatObserver для WhatsApp
- **Селекторы**: `#main` → `conversation-panel-messages` → `[role="application"]` → `#app` (fallback). Больше НЕ падает на body при отсутствии открытого чата — используется `#app`.
- **Sidebar-фильтр расширен**: `_ak8o`, `_ak8i` (WhatsApp gridcell классы) + ARIA roles `grid`, `row`, `gridcell` — мутации в списке чатов фильтруются.
- **Ловушка 32**: WhatsApp `#main` появляется ТОЛЬКО при открытом чате. Если чат не открыт → fallback на `#app` (всё приложение, но НЕ body). body слишком широкий — ловит SVG, service workers, meta-элементы.

### v0.75.8 (19 марта 2026) — Спам-фильтр WhatsApp UI-артефактов
- **Фильтр alt-текстов иконок**: `default-contact-refreshed`, `status-dblcheckic-image`, `status-time`, `default-user` — блокируются как спам. Regex: текст без пробелов, латиница через дефис, <60 символов.
- **Ловушка 31**: WhatsApp chatObserver fallback на body → MutationObserver ловит `addedNodes` с alt-текстами иконок (аватар, статус доставки) как "сообщения". Фильтр в спам-фильтре `__CC_MSG__`.

### v0.75.6 (18 марта 2026) — Badge API как авторитетный источник для сброса бейджа
- **`__CC_BADGE_BLOCKED__:0`**: Когда Telegram вызывает `navigator.setAppBadge(0)` и пользователь смотрит на вкладку → мгновенный сброс бейджа. Telegram сам знает что непрочитанных нет.
- **Race condition fix**: Ранее useEffect сбрасывал бейдж, но следующий цикл `unread-count` (DOM badge ещё не обновился) ставил его обратно. Теперь Badge API = финальный арбитр.
- **Ловушка 30**: `countUnreadTelegram` DOM-подсчёт обновляется с задержкой. Telegram Badge API (`setAppBadge`) обновляется мгновенно. При viewing + badge=0 → доверять badge, не DOM.

### v0.75.5 (18 марта 2026) — Автосброс notifCountRef при переключении вкладки
- **useEffect на activeId + windowFocused**: Через 1.5с после переключения на вкладку — автосброс `notifCountRef` и `unreadCounts`. Покрывает ВСЕ способы переключения: handleTabClick, notify:clicked, Ctrl+Tab, Ctrl+1-9, автопереключение.
- **Ловушка 29**: `notify:clicked` вызывает `setActiveId` но НЕ `handleTabClick`. Для мессенджеров без числа в title (MAX, WhatsApp) бейдж залипал навсегда — `page-title-updated` не срабатывал.

### v0.75.4 (18 марта 2026) — Фикс подсчёта: вертикальные папки Telegram + title первый
- **Вертикальные папки**: Telegram Web K с `has-vertical-folders` — папки внутри `folders-sidebar__scrollable-position`, а НЕ `sidebar-tools-button[0]` (это кнопка меню!). Добавлен отдельный шаг 2b для поиска бейджа в вертикальном layout.
- **Title вернули первым**: `document.title` надёжный для ОСНОВНОГО аккаунта. v0.75.3 убрал его — это сломало подсчёт для аккаунтов с вертикальными папками.
- **Ловушка 28**: `sidebar-tools-button[0]` в вертикальном layout = кнопка меню/гамбургер, НЕ первая папка. Папки внутри `folders-sidebar__scrollable-position`.

### v0.75.3 (18 марта 2026) — Фикс фантомного бейджа Telegram + чёткий overlay
- **Фикс фантомного бейджа**: `countUnreadTelegram()` — DOM-подсчёт приоритетнее title. Title `"(1) Telegram Web"` содержит фантомы из архива/скрытых папок/ботов. Если DOM-структура загружена (tabs/chatlist/badges найдены) но badges=0 → верим DOM, игнорируем title.
- **Overlay scale=3**: Двузначные числа теперь scale=3 (gap=0) вместо scale=2 — чётче.
- **Ловушка 27**: `document.title` Telegram содержит ВСЕ непрочитанные, включая архив, скрытые папки, ботов. DOM-бейджи показывают только ВИДИМЫЕ непрочитанные. При расхождении — верить DOM.

### v0.75.1 (18 марта 2026) — Возврат overlay 32×32 (чёткие цифры)
- **Буфер 32×32**: Вернул стандартный размер. 64×64 давал мутные цифры из-за билинейной интерполяции Windows.
- **OVERLAY_FONT 5×7**: scale=3 (1 цифра), scale=2 (2 цифры). Проверенный рабочий вариант с v0.73.8.
- **Ловушка 26**: Буфер 64×64 → Windows масштабирует с интерполяцией → мутные пиксели. 32×32 = стандартный размер overlay icon на Windows, масштабируется чётко.

### v0.75.0 (18 марта 2026) — Откат overlay: одно число + настройка mode
- **Откат split overlay**: Два числа (личные|группы) на overlay оказались нечитаемыми. Возврат к одному крупному числу.
- **Буфер 64×64 сохранён**: Крупные цифры (scale=5 для 1 цифры, scale=3 для 2 цифр).
- **Настройка overlay mode**: "Только личные" / "Все сообщения" / "Отключить" — работает.
- **Трей без бейджа**: Сохранено — чистая синяя иконка.
- **Ловушка 25**: Split overlay (два числа) на 32×32/64×64 нечитаемо — слишком маленькая площадь overlay на таскбаре Windows. Одно крупное число значительно лучше.

### v0.74.8 (18 марта 2026) — Overlay 64×64: крупные читаемые цифры
- **Буфер 64×64**: Windows масштабирует overlay в ~32×32 на экране → цифры вдвое крупнее чем были при 32×32.
- **OVERLAY_FONT 5×7**: Вернул красивый шрифт (PIXEL_FONT 3×5 оказался мелким на 32×32).
- **Scale=3 (однозначные)**: "2|5" = 15×21 на цифру — крупно и чётко.
- **Scale=2 (двузначные)**: "23|53" = 10×14 на цифру — нормально читаемо.
- **Legacy scale=5/3**: Одно число без split — scale=5 для 1 цифры, scale=3 для 2 цифр.
- **drawFontScaled**: Универсальная функция отрисовки для любого шрифта.
- **addOutline**: Обводка 1px для контраста на светлом таскбаре.
- **Ловушка 24**: Буфер 32×32 → Windows масштабирует в ~16×16 на экране → нечитаемо. Решение: 64×64 → ~32×32 на экране.

### v0.74.7 (18 марта 2026) — Крупные цифры overlay: PIXEL_FONT 3×5 auto-scale
- **Крупный шрифт**: Заменён OVERLAY_FONT 5×7 (слишком широкий, падал в scale=1) на PIXEL_FONT 3×5 — компактнее, помещается при scale=2-3.
- **Auto-scale**: scale=3 если оба числа ≤ 9, scale=2 если хотя бы одно ≥ 10. Максимальная читаемость.
- **Лимит 99**: Любое число > 99 показывается как 99. Для split и legacy.
- **Полная ширина фона**: Прямоугольный фон на всю ширину 32px для максимального контраста.
- **Ловушка 23**: OVERLAY_FONT 5×7 — слишком широкий для двух чисел. "99|99" при scale=2 = 49px > 32. Падал в scale=1 (нечитаемо). PIXEL_FONT 3×5 — "99|99" при scale=2 = 30px ≤ 32.

### v0.74.6 (18 марта 2026) — Overlay с двумя числами (личные | группы) + убран бейдж с трея
- **Overlay с split**: `createOverlayIcon()` теперь рисует два числа на прямоугольном тёмном фоне: личные слева (белые #FFF), группы справа (серые #A0A0A0), разделитель — серая вертикальная линия. OVERLAY_FONT 5×7, auto-scale (2 для малых, 1 для больших чисел).
- **Трей без бейджа**: `createTrayBadgeIcon()` рисует только чистую синюю иконку без чисел. Бейджи только на overlay.
- **Цветовое различие**: Личные — яркие белые (приоритет), Группы — тусклые серые (можно подождать).
- **Ловушка 22**: В v0.74.5 модифицировал иконку ТРЕЯ вместо OVERLAY — перепутал `createTrayBadgeIcon` (tray.setImage) и `createOverlayIcon` (mainWindow.setOverlayIcon).

### v0.74.5 (18 марта 2026) — Двойной бейдж трея: личные | группы
- **Двойной бейдж трея**: `createTrayBadgeIcon()` теперь принимает `{ personal, channels, total }`. Рисует два числа на тёмном прямоугольном бейдже с закруглением: личные слева, группы справа, разделитель — серая вертикальная линия.
- **IPC расширен**: `tray:set-badge` принимает `channels` (суммарный по всем мессенджерам). `totalChannels` вычисляется из `unreadSplit` в App.jsx.
- **Legacy fallback**: если split данных нет — рисует один красный кружок с числом (старое поведение).

### v0.74.4 (18 марта 2026) — Фикс overlay mode: переключение не обновляло overlay
- **Фикс overlay mode**: useEffect overlay зависел от `[totalUnread, totalPersonalWithFallback]`, но НЕ от `settings.overlayMode`. Смена режима "Личные"→"Все" не обновляла overlay. Добавлен `settings.overlayMode` в deps.
- **Откат агрессивного сброса unreadCounts**: v0.74.3 добавил `setUnreadCounts({id: 0})` в `handleTabClick` — это обнуляло бейдж Telegram при переключении вкладки, overlay мигал в 0 на 500мс. Откачено. Для WhatsApp сброс работает через `unread-count` IPC (domCount=0, isViewing=true).

### v0.74.3 (18 марта 2026) — Фикс фантомного сообщения WhatsApp + DOM-скан диагностика
- **Фикс фантомного сообщения WhatsApp**: chatObserver использовал устаревшие селекторы (`[role="application"]`, `data-testid`) → fallback на `document.body` → ловил начальный рендер sidebar как новое сообщение. Исправлено:
  - Обновлены селекторы: `#main` (появляется при открытом чате) как основной
  - `#side` добавлен в sidebar-фильтр (WhatsApp sidebar с `role="grid"`, 68 rows)
  - Grace period 5 сек после fallback на body — игнорирует начальный рендер
  - Фильтр `status-dblcheck`/`status-check` в `extractMsgText()` — артефакты alt-текста иконок WhatsApp
  - Принудительный сброс `unreadCounts` при переключении на вкладку (WhatsApp title без числа)
- **DOM-скан диагностика**: новый пункт контекстного меню "🏗️ DOM-скан (→ буфер)" — автоматический скан DOM с 20+ селекторами, дерево на 4 уровня, все `data-testid` и `role`. Результат копируется в буфер обмена.

### v0.74.2 (18 марта 2026) — Фикс personal/channels + настройка overlay + flip-анимация бейджа
- **Фикс personal/channels**: `countUnreadTelegram()` ошибочно ставил `personal = allTotal` если вкладка "Личные" найдена, но без бейджа (нет личных). Теперь отслеживается `personalTabFound` — fallback только если вкладка НЕ найдена.
- **Настройка overlay mode**: в Settings секция "Уведомления" — select: "Только личные" / "Все сообщения" / "Отключить". Сохраняется как `settings.overlayMode`.
- **Flip-анимация бейджа**: при изменении числа — новое значение появляется с эффектом `flipIn` (slide снизу). CSS `@keyframes flipIn/flipOut` в `index.css`.
- **Тултип трея**: разбивка по мессенджерам с личными/каналами.

### v0.74.1 (18 марта 2026) — Зелёная галочка прочтения + раздельный overlay (личные/каналы)
- **Зелёная галочка**: При падении unreadCount с >0 до 0 на вкладке появляется зелёная галочка (✓) на 2 секунды — визуальное подтверждение прочтения. Используется CSS animation `badgePulse`.
- **Раздельный overlay**: Overlay badge на таскбаре теперь показывает ТОЛЬКО личные сообщения (если есть split-данные). Каналы/группы не считаются — они не требуют срочного ответа. Для мессенджеров без split (MAX, VK, WhatsApp) весь счётчик считается личным.
- **Тултип трея**: Показывает разбивку по мессенджерам с деталями (личные/каналы): `Telegram: 32 (2 личных, 30 каналов)`.
- **Overlay description**: При наведении на overlay — `"2 личных (35 всего)"`.

### v0.74.0 (18 марта 2026) — Сброс notifCountRef при чтении сообщений внутри WebView
- **Проблема**: После чтения сообщений в MAX (открыл чат внутри WebView), бейдж продолжал показывать 2 непрочитанных. `notifCountRef` не сбрасывался, а `Math.max(domCount=0, notifCountRef=2) = 2`.
- **Причина**: `notifCountRef` обнулялся ТОЛЬКО при клике на вкладку мессенджера в ChatCenter (`handleTabClick`). Если пользователь уже на вкладке и читает сообщения внутри WebView — notifCountRef оставался.
- **Решение**: (1) `page-title-updated` без числа + пользователь на вкладке → сброс notifCountRef и unreadCounts. (2) `unread-count` IPC: если пользователь смотрит вкладку и domCount < notifCountRef → сброс. (3) При просмотре разрешено уменьшение счётчика (не только увеличение).

### v0.73.9 (18 марта 2026) — Overlay: блокировка navigator.setAppBadge в page context
- **Корень проблемы v0.73.8**: `clearStorageData` убил SW, но Telegram Web вызывает `navigator.setAppBadge(32)` напрямую из **page context** (не только из SW). Chromium транслирует этот вызов в `ITaskbarList3::SetOverlayIcon`, перебивая наш overlay.
- **Решение**: Override `navigator.setAppBadge` и `navigator.clearAppBadge` в обеих инъекциях (monitor.preload.js + App.jsx executeJavaScript). Вызовы перехватываются и логируются как `__CC_BADGE_BLOCKED__`.
- **Дополнительно**: `app.setBadgeCount` в main.js заблокирован — Chromium может вызывать его при получении Badge API.

### v0.73.8 (18 марта 2026) — Overlay: очистка SW на уровне Electron session + чёрный фон
- **Корень проблемы v0.73.6-7**: JS-блокировка SW (`navigator.serviceWorker.register` override + `getRegistrations().unregister()`) не помогала — SW закеширован в partition storage от предыдущих сессий. Chromium активирует закешированный SW ДО выполнения нашего JS-кода → `setAppBadge()` успевает перебить наш overlay.
- **Решение**: `ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })` в `setupSession()` — удаляет закешированные SW на уровне Electron session ДО загрузки страницы. Плюс мониторинг `ses.serviceWorkers.on('running-status-changed')` с повторной очисткой при обнаружении запущенного SW.
- **Визуал**: убран красный кружок, теперь чёрный круг-фон с белыми цифрами (как просил пользователь).

### v0.73.7 (18 марта 2026) — Overlay badge: красный кружок-фон + белые цифры
- **Визуал**: красный круг (#EF4444) с тёмно-красной обводкой, белые цифры по центру (как у мессенджеров).
- **Масштаб**: 1 цифра ×3, 2+ цифры ×2 для оптимального заполнения круга.

### v0.73.6 (17 марта 2026) — Overlay: блокировка Service Worker в WebView (убивает Badge API)
- **Корневая причина найдена**: Chromium Badge API работает через C++ Mojo IPC: `NavigatorBadge::SetAppBadgeHelper()` → `blink::mojom::BadgeService::SetBadge` → `BadgeManager::SetBadge()` → `Browser::SetBadgeCount()` → `ITaskbarList3::SetOverlayIcon`. Полностью минует JS. Feature flags для отключения НЕ СУЩЕСТВУЮТ.
- **Вызов из Service Worker**: `navigator.setAppBadge(32)` вызывается из Service Worker Telegram Web, который работает в изолированном scope (JS override не действует).
- **Решение**: убиваем Service Worker в WebView — `navigator.serviceWorker.register` заменён на reject, существующие SW удаляются через `getRegistrations().forEach(r => r.unregister())`. Без SW нет badge API. Telegram/WhatsApp — SPA, работают без SW.
- **Где заблокировано**: monitor.preload.js (до скриптов мессенджера) + App.jsx executeJavaScript fallback.
- **Удалено**: setInterval refresh (мерцание), app.setBadgeCount override (бесполезно), disable-features/disable-blink-features (не существуют).

### v0.73.5 (17 марта 2026) — Overlay: периодический refresh каждые 2 сек
- **Проблема**: Chromium Badge API (из Service Worker Telegram) устанавливает overlay через C++ (`ITaskbarList3::SetOverlayIcon`) напрямую, минуя весь JS. `disable-features=Badging`, `disable-blink-features=Badging`, `app.setBadgeCount` override, JS `navigator.setAppBadge` override — НИЧЕГО не помогает.
- **Решение**: setInterval каждые 2 сек переставляет наш overlay (null→icon). Telegram перебивает → через ≤2 сек наш refresh восстанавливает правильное число.
- **При count=0**: interval останавливается, overlay очищается.

### v0.73.4 (17 марта 2026) — Overlay: сброс на null перед обновлением (Windows кеш)
- **Проблема**: Windows кеширует overlay icon — при повторном `setOverlayIcon()` с другим NativeImage визуально не обновляет. Первый вызов (count=33) устанавливал overlay, последующие (34, 35, 36) не перерисовывали.
- **Исправление**: `setOverlayIcon(null, '')` перед каждым `setOverlayIcon(icon, desc)` — сброс кеша.
- **Диагностика подтвердила**: BGRA 32×32 рисует цифры правильно (PNG файл проверен визуально). Проблема была ТОЛЬКО в кеше Windows.

### v0.73.3 (17 марта 2026) — Overlay badge: блокировка Web Badging API + BGRA 32×32
- **КОРНЕВАЯ ПРИЧИНА ВСЕХ ПРОБЛЕМ С OVERLAY**: Telegram Web вызывал `navigator.setAppBadge(33)` — Web Badging API. Electron транслировал это как overlay icon на главном окне, **перезаписывая** наш кастомный overlay с суммой (35). Canvas/BGRA/шрифт были не при чём — всё перебивалось мессенджером.
- **Блокировка**: `navigator.setAppBadge` и `navigator.clearAppBadge` заменены на no-op в трёх местах: monitor.preload.js (до скриптов мессенджера), executeJavaScript fallback в App.jsx, permission handler в main.js.
- **Overlay**: BGRA buffer 32×32, шрифт 5×7, чёрная обводка. Canvas удалён.
- **Удалено**: overlayCanvasRef, overlayDataURL, Canvas-рендер, badgeWin.

### v0.73.2 (17 марта 2026) — Overlay badge: Canvas 32×32 вместо 256×256
- **Причина**: 256×256 Canvas — Windows кропал (обрезал) overlay вместо масштабирования, показывая "1" вместо "35". Windows overlay icon ожидает 16×16 или 32×32.
- **Исправление**: Canvas 32×32, шрифт Bold 18px Arial, обводка 4px. Нативный размер overlay без масштабирования.

### v0.73.1 (17 марта 2026) — Overlay badge: рендер в renderer вместо скрытого BrowserWindow
- **Корневая причина v0.72.x-v0.73.0**: Canvas в скрытом BrowserWindow (main-процесс) генерировал корректный PNG, но при даунскейле Windows 64×64→16×16 цифры "5" и "3" становились неотличимы.
- **Новый механизм**: Canvas 256×256 рендерится в renderer-процессе (App.jsx), где Chromium Canvas API гарантированно работает. DataURL отправляется в main через IPC `tray:set-badge`. Main просто делает `nativeImage.createFromDataURL()` → `setOverlayIcon()`.
- **Удалено из main.js**: `badgeWin`, `createBadgeWindow()`, `createOverlayBadgeIcon()` — весь скрытый BrowserWindow механизм.
- **Размер 256×256**: даёт Windows максимум данных для качественного даунскейла. Шрифт 140px Bold Arial с обводкой 24px.

### v0.73.0 (17 марта 2026) — Фикс overlay badge: убран offscreen, ожидание did-finish-load
- **Корневая причина**: `offscreen: true` в скрытом BrowserWindow ломал Canvas `toDataURL()` — возвращал пустые/битые PNG. Из-за этого `setOverlayIcon` всегда падал в pixel-font fallback, где "35" выглядит как "33" после даунскейла Windows.
- **Исправление**: убран `offscreen: true`, добавлен флаг `badgeWinReady` (ждём `did-finish-load`), размер Canvas уменьшен до 64×64 (меньше даунскейл = чётче цифры).
- **Диагностика**: лог `[OVERLAY] Canvas dataURL length: N for text: X` — если length > 100, Canvas работает корректно.

### v0.72.8 (17 марта 2026) — Фикс мигания overlay: unread-count только вверх
- **unread-count IPC только увеличивает**: `Math.max(ipcCount, prevCount)` — DOM-парсинг нестабилен (countUnread* возвращает 0 при ре-рендере DOM мессенджера). Это вызывало мигание overlay 35→33→35. Теперь IPC может только УВЕЛИЧИВАТЬ счётчик. Уменьшение — только через page-title-updated (надёжный, от самого мессенджера) или handleTabClick.
- **Подробное логирование**: `[BADGE] totalUnread=35 [Telegram:33 Telegram:1 ВКонтак:1]` — видно в DevTools (F12 → Console) и `[OVERLAY]` в терминале npm run dev.

### v0.72.7 (17 марта 2026) — Canvas overlay badge + тултип трея с разбивкой
- **Canvas overlay badge**: Заменён пиксельный шрифт 3×5 на Canvas-рендеринг через скрытый BrowserWindow. Нормальный шрифт Arial Bold с антиалиасингом. Просто белые цифры с тёмной обводкой на прозрачном фоне — без красного кружка. Чёткие при любом DPI.
- **Тултип трея с разбивкой по мессенджерам**: При наведении на иконку в трее показывает `ЦентрЧатов\nTelegram: 33\nTelegram: 1\nВсего: 34` — видно откуда сообщения.
- **breakdown в IPC**: `tray:set-badge` теперь принимает `{ count, breakdown: [{ name, count }] }` с обратной совместимостью для числа.

### v0.72.6 (17 марта 2026) — Фикс overlay badge: debounce + MAX title + notifCount
- **Debounce 500мс для overlay badge (ГЛАВНЫЙ ФИКС)**: useEffect `tray:set-badge` заменён на debounced вариант. Без debounce: Telegram шлёт page-title-updated первым → overlay=33, другие вкладки обновляются позже → overlay=39, но Windows Shell API не успевает обработать rapid fire setOverlayIcon → overlay застревает на промежуточном значении. С debounce: ждём 500мс пока ВСЕ вкладки отправят счётчики → один вызов с правильной суммой.
- **Парсинг MAX title в page-title-updated**: Добавлен regex `/^(\d+)\s+непрочитанн/` для формата MAX "1 непрочитанный чат" / "5 непрочитанных чатов". Раньше парсился только формат Telegram `(N)`.
- **Фикс notifCountRef fallback**: Убрано обнуление notifCountRef при domCount>0. Теперь используется `Math.max(domCount, notifCountRef)`. Обнуление — только при клике на вкладку (handleTabClick). Это предотвращает моргание счётчика MAX 1→0→1.
- **Логирование overlay badge**: `console.log('[OVERLAY] tray:set-badge count=N')` в main.js — видно в терминале `npm run dev` какое число приходит в overlay.

### v0.72.5 (17 марта 2026) — Чёткий overlay 64×64 + fallback notif count + диагностика
- **Overlay 64×64 с белой обводкой**: Иконка увеличена с 32×32 до 64×64, шрифт 4× масштаб. Белая обводка вокруг красного круга. Чёткость при любом Windows DPI (100%-200%).
- **Убрано шевеление dock**: requestCtxMenuSpace полностью убран из pin-dock.html — DOCK_PREVIEW_RESERVE=420 хватает для любого меню. Нет IPC resize = нет шевеления.
- **Fallback Notification count для MAX**: Если DOM-парсинг (countUnreadMAX) = 0, считаем непрочитанные по __CC_NOTIF__ уведомлениям (notifCountRef). При переключении на вкладку — обнуляем. При DOM count > 0 — notifCount сбрасывается.
- **Диагностика unread source в статусбаре**: `📥 35 непрочитано [Tel:33 Мак:2]` — разбивка по мессенджерам прямо в статусбаре.
- **Логирование countUnreadMAX source**: `console.log('__CC_DIAG__unread_max source=... count=...')` — видно в trace какая стратегия сработала.

### v0.72.4 (17 марта 2026) — Убран авто-DevTools + фикс dock дёрганья + MAX unread
- **DevTools не открывается автоматически**: Убран `openDevTools()` из mainWindow и loginWindow. Пользователь может открыть вручную через Ctrl+Shift+I.
- **Фикс дёрганья dock при ПКМ (Ловушка 32)**: `DOCK_PREVIEW_RESERVE` увеличен с 150 до 420 — контекстное меню ВСЕГДА помещается без resize окна через `dock:ctx-menu-space` IPC → нет `setBounds()` = нет дёрганья.
- **MAX unread count (Ловушка 33)**: `countUnreadMAX()` переписана — Svelte-совместимый подход. Вместо `[class*="badge"]` (не работает со Svelte классами) → поиск числовых дочерних `span/div` в навигации и sidebar. Стратегия 3: парсинг маленьких числовых элементов в левой части экрана (sidebar бейджи).

### v0.72.3 (17 марта 2026) — Чёткий overlay бейдж на иконке приложения
- **Overlay бейдж 32×32 с 2× масштабом шрифта**: Увеличен с 16×16 до 32×32, каждый пиксель шрифта рисуется как 2×2 блок → цифры крупные и читаемые на иконке в таскбаре Windows. Поддержка чисел до 99.
- **Убран бейдж из трея**: Иконка трея остаётся без счётчика (только тултип). Бейдж показывается ТОЛЬКО на иконке приложения в таскбаре через `setOverlayIcon`.
- **drawPixelTextScaled()**: Новая функция для рисования пиксельного текста с произвольным масштабом.

### v0.72.2 (17 марта 2026) — Плавное контекстное меню + overlay бейдж + название мессенджера
- **Глубокий фикс моргания контекстного меню**: CSS keyframe анимация заменена на CSS transition + `.visible` класс. Keyframe `ctxIn` стартовал с `opacity:0` мгновенно при вставке в DOM (до позиционирования) → моргание. Теперь: элемент создаётся невидимым (`opacity:0`), позиционируется, затем через `requestAnimationFrame` получает `.visible` класс → плавный fade-in.
- **Overlay бейдж на иконке приложения**: `createOverlayBadgeIcon(count)` — 16×16 красный круг с белой цифрой. `mainWindow.setOverlayIcon()` показывает количество непрочитанных на иконке в таскбаре Windows. `tray:set-badge` обновляет и трей, и overlay.
- **Название мессенджера в pin-карточке и dock-превью**: В expanded pin-карточке показывается имя мессенджера (`.pin-messenger`). В dock preview-тултипе — подзаголовок мессенджера (`.preview-messenger`). Имя берётся из storage по `messengerId`.

### v0.72.1 (17 марта 2026) — Фикс моргания контекстного меню + персистентность задач
- **Фикс моргания контекстного меню (Ловушка 30)**: При ПКМ на таб dock, `mousedown` handler закрывал старое меню с fade-out анимацией, потом `contextmenu` создавал новое → двойная анимация = моргание. Фикс: `mousedown` пропускает `button===2` на `.dock-tab`; `showCtxMenu()` удаляет ВСЕ `.ctx-menu` элементы из DOM (включая closing).
- **Персистентность задач**: Закреплённые задачи (pinItems) сохраняются в `storage.set('pinItems', [...])` и восстанавливаются при перезапуске. Сериализуются: data (sender, text, time, color, messengerId), category, note, timerEnd. Таймеры восстанавливаются если ещё не истекли. `savePinItems()` вызывается при каждом изменении.

### v0.72.0 (17 марта 2026) — Фильтр «ред.» + копирование ФИО + мини-заметка
- **Фильтр фантома «ред.»**: Отредактированные сообщения MAX ("09:26 ред.") больше не создают ложные уведомления. Regex `_editedMark` фильтрует в `isSpamNotif()`, `extractMsgText()`, `getLastMessageText()`.
- **Кнопка «Копировать ФИО»**: 📋 кнопка в header pin-карточки рядом с именем. Появляется при наведении. Копирует имя в буфер обмена с визуальной обратной связью (✓ зелёный на 1.5с).
- **Мини-заметка к задаче**: Поле для короткой заметки (до 200 символов) в pin-карточке. Секция 📝 "Заметка" — по клику открывается textarea, Enter сохраняет, Escape отменяет. Заметка видна в:
  - Pin-карточке (italic текст под кнопкой)
  - Dock превью-тултипе (📝 перед текстом)
  - Dock табе (индикатор-точка)
  - Dock контекстном меню (пункт "Добавить заметку" / "Ред. заметку" с inline-формой)
- IPC: `pin:set-note`, `pin:note-updated`, `dock:set-note`, `dock:update-note`

### v0.71.8 (17 марта 2026) — Фикс drag dock + убрано моргание + выделение ФИО
- **Фикс: dock не двигался (Ловушка 28)**: `position: fixed; bottom: 0` без `min-height: 100vh` ломает `-webkit-app-region: drag` hit-testing. Возвращён рабочий layout: `min-height: 100vh` + `display: flex; justify-content: flex-end`.
- **Фикс: dock моргал (Ловушка 28)**: `moveTop()` каждые 2с вызывал мерцание окна при перерисовке z-order. Убран periodic `moveTop()`. Оставлен только `setAlwaysOnTop` при blur.
- **Выделение ФИО в pin-карточке**: `.pin-sender` получил `user-select: text` + `-webkit-app-region: no-drag` + `cursor: text`. Теперь ФИО можно выделить и скопировать.

### v0.71.7 (16 марта 2026) — Фикс drag dock + убрано дёрганье (Ловушка 27)
- **Фикс: dock не двигался**: `setIgnoreMouseEvents(true, {forward:true})` блокировал `-webkit-app-region: drag`. Полностью убран `setIgnoreMouseEvents`. Вместо этого: CSS `position: fixed; bottom: 0` на dock-wrapper + убран `min-height: 100vh` — прозрачные пиксели автоматически пропускают клики в Electron transparent окнах.
- **Фикс дёрганья**: Убраны лишние `setAlwaysOnTop + moveTop` при `showInactive` и resize. Оставлен только `moveTop()` каждые 2 секунды и при blur.

### v0.71.6 (16 марта 2026) — Фильтр MAX фантомов + dock поверх всех окон
- **Фильтр MAX фантомов**: Системные onboarding-сообщения MAX ("Сообщений пока нет", "Напишите сообщение", "Теперь в MAX!" и т.д.) фильтруются в 3 местах: `isSpamNotif()`, `extractMsgText()`, `getLastMessageText()`. Regex `_maxPhantom` отсекает приветственные и системные тексты.
- **Dock агрессивно поверх всех окон**: `setInterval(1000ms)` периодически вызывает `setAlwaysOnTop(true, 'screen-saver', 1)` + `moveTop()`. Плюс `moveTop()` при blur и каждом showInactive. Windows 11 таскбар больше не перекрывает dock.

### v0.71.5 (16 марта 2026) — Dock поверх Windows таскбара
- **Агрессивный alwaysOnTop**: `setAlwaysOnTop(true, 'screen-saver', 1)` с relativeLevel=1 + реассерт при blur и showInactive. Windows таскбар больше не перекрывает dock.
- **Позиционирование по полному экрану**: Начальная позиция и snap используют `display.bounds` (не `workArea`) — dock может сидеть поверх Windows таскбара.

### v0.71.4 (16 марта 2026) — Click-through прозрачной зоны dock (Ловушка 25)
- **Фикс: dock блокировал клики на таскбар Windows**: Окно dock имеет прозрачную зону 150px+ выше видимой панели (для тултипов/меню). Эта невидимая область перехватывала клики к Windows таскбару и другим окнам. Решение: `setIgnoreMouseEvents(true, { forward: true })` — прозрачная зона click-through. IPC `dock:set-ignore-mouse` переключает при mouseenter/mouseleave на dock и контекстном меню.

### v0.71.3 (16 марта 2026) — Фикс контекстного меню dock + двойной клик + звук таймера
- **Фикс контекстного меню (Ловушка 24)**: Меню не показывалось — окно dock слишком маленькое (dockH + 150px), меню ~280px не помещалось. Решение: IPC `dock:ctx-menu-space` временно расширяет окно вверх при открытии меню, восстанавливает при закрытии.
- **Двойной клик на таб = перейти в чат**: `dblclick` → `goToChat()`, одинарный клик с задержкой 250ms → `showPin()`. Если нет messengerId — показать карточку.
- **Звук при просрочке таймера**: 3 коротких бипа (880Hz) через AudioContext в dock. `mainWindow.flashFrame(true)` мигает окном в таскбаре.

### v0.71.2 (16 марта 2026) — Центрированное расширение dock + улучшения меню
- **Настройка «Расширение по центру»**: Новый toggle в настройках — dock растёт от центра при добавлении задач (сохраняет центральную точку). При выключении — растёт вправо (прежнее поведение).
- **Красивая анимация добавления таба**: Glow-эффект при появлении нового таба (bounce + свечение indigo).
- **Подсветка таба при контекстном меню**: Активный таб подсвечивается indigo при открытом контекстном меню.
- **Закрытие меню по Escape**: `keydown` listener для закрытия контекстного меню клавишей Escape.
- **Fade-out анимация закрытия меню**: Плавное исчезновение меню вместо мгновенного удаления (150ms ease-in).

### v0.71.1 (16 марта 2026) — Фикс контекстного меню dock + скроллбары
- **Фикс обрезки меню**: Ловушка 23 — контекстное меню рендерилось внутри `.dock-tab` (position: absolute) → обрезалось границами окна. Перенесено в `body` с `position: fixed`. Позиционируется через `getBoundingClientRect()` таба.
- **Фикс мелькания скроллбаров**: `html, body { overflow: hidden }` — убраны скроллбары при добавлении/удалении табов в dock.
- **Фикс закрытия меню**: Заменён `click` → `mousedown` для закрытия меню при клике вне. Превью не показывается при открытом контекстном меню.

### v0.71.0 (16 марта 2026) — Контекстное меню dock + Фикс навигации «В чат»
- **Контекстное меню на табах dock**: Правый клик → меню: Показать карточку, В чат, Категории (🔴🟡🟢 toggle), Таймер (5м/15м/1ч), Открепить. Плавная анимация `cubic-bezier`. Закрывается при клике вне.
- **Фикс навигации «В чат»**: Ранее `pin:go-to-chat` передавал ТОЛЬКО `messengerId` → App.jsx переключал вкладку, но не навигировал к чату. Теперь передаётся `senderName` из pin-данных → `buildChatNavigateScript` ищет чат по имени.
- **Управление из dock**: Смена категории и таймера прямо из контекстного меню dock без открытия pin-карточки. IPC `dock:go-to-chat`, `dock:set-category`, `dock:start-timer`.
- **Синхронизация pin ↔ dock**: При смене категории из dock → pin-карточка обновляет UI через `pin:category-updated`.
- **messengerId в dock-данных**: Передаётся при `dock:add` для корректной работы «В чат» из контекстного меню.

### v0.70.1 (16 марта 2026) — Фикс скроллбаров pin-карточки + Счётчик категорий в dock
- **Фикс скроллбаров**: Ловушка 21 — `border-width: 2px` при `.active` менял размер кнопки → скроллбары. Заменено на `box-shadow: inset` (не влияет на layout). Добавлен `html { overflow: hidden }`.
- **Счётчик задач по категориям**: В dock рядом с общим счётчиком — мини-бейджи 🔴N 🟡N 🟢N. Показываются только если есть задачи в категории. Обновляются при смене категории и добавлении/удалении табов.

### v0.70.0 (16 марта 2026) — Плавный тултип + Z-order + Категории + Авто-dock
- **Плавная анимация тултипа**: Убрано дёрганье при показе превью в dock. Пространство для тултипа предвыделено (150px), окно НЕ ресайзится при hover. Анимация `cubic-bezier(0.22, 1, 0.36, 1)` 300ms как в ribbon-уведомлениях.
- **Dock поверх ВСЕХ окон**: `setAlwaysOnTop(true, 'screen-saver')` — dock не перекрывается другими окнами.
- **Фикс dock «нет задач»**: Исправлен баг — dock показывался при пустых задачах даже когда настройка `showDockEmpty=false`. Причина: `dock:resize` вызывал `showInactive()` безусловно. Теперь проверяет наличие задач.
- **Автоматическое закрепление в dock**: Pin-сообщение сразу появляется в dock при создании (без нажатия «В задачи»). Кнопка переименована в «⬇ Свернуть».
- **Сохранение порядка табов**: IPC `dock:save-tab-order` сохраняет порядок в storage при каждом DnD.
- **Цветовые метки/категории**: На pin-карточке секция 🏷 с кнопками: 🔴 Срочно, 🟡 В работе, 🟢 На потом. IPC `pin:set-category` → обновление в dock. Метки видны на табах dock и в тултипе превью.
- **Новые IPC**: `dock:save-tab-order`, `pin:set-category`, `dock:update-category`.

### v0.69.0 (16 марта 2026) — Кнопка «В чат» + Drag & Drop в dock
- **Кнопка «→ В чат»**: На pin-карточке кнопка перехода в мессенджер-источник. Передаётся `messengerId` из notification.html → pin data → IPC `pin:go-to-chat` → main → renderer `notify:clicked`. Переключает вкладку мессенджера + фокусирует главное окно.
- **messengerId в pin-данных**: `createPinBtn` теперь получает и передаёт `messengerId`. Кнопка "В чат" скрыта если `messengerId` отсутствует.
- **Drag & Drop табов в dock**: HTML5 draggable на табах. При перетаскивании — подсветка целевого таба (индиго). Drop вставляет таб перед/после цели в зависимости от позиции курсора.
- **Новые IPC**: `pin:go-to-chat` (pin→main, переход в чат мессенджера).

### v0.68.0 (16 марта 2026) — Фикс dock + snap + позиция + превью
- **Фикс dock не скрывается**: После откреплнеия всех задач dock оставался видимым. Добавлен `checkDockVisibility()` — вызывается после каждого `removePin()` и `pinWin.on('closed')`. Скрывает dock если пуст и `showDockEmpty=false`.
- **Сохранение позиции dock**: Позиция сохраняется в `storage.set('dockPosition', {x,y})` при `moved` event. При создании dock — восстанавливается из storage.
- **Snap к краям экрана**: При перемещении dock — если ближе 20px к любому краю workArea, прилипает к нему. Snap работает для всех 4 сторон.
- **Мини-превью при hover**: При наведении на dock-таб (300ms задержка) — появляется тултип выше таба с именем отправителя, текстом и временем. Dock-окно расширяется вверх для отображения (`dock:preview-space` IPC).
- **Новый IPC**: `dock:preview-space` (dock→main, увеличение высоты окна для тултипа).

### v0.67.1 (16 марта 2026) — Фикс двойного ⏰ + счётчик задач + перетаскиваемый dock
- **Фикс двойного будильника**: `timer-label` в HTML уже содержит ⏰, а JS countdown добавлял второй ⏰ в текст. Убран дубль из JS — теперь отображается только один ⏰.
- **Счётчик задач**: Бейдж с числом задач рядом с 📌 — `dock-count`. Показывает количество активных табов, скрывается при 0.
- **Перетаскиваемый dock**: Зона drag (`-webkit-app-region: drag`) на label 📌 и счётчике. `focusable: true` на BrowserWindow. Resize сохраняет пользовательскую позицию.
- **Dock таймер без дубля ⏰**: В dock-табе таймер показывает только "3:18" без дублирующего значка.

### v0.67.0 (16 марта 2026) — Адаптивная dock-панель задач
- **Автоширина dock**: Панель подстраивается под количество табов (`inline-flex`), а не растянута на весь экран. Центрируется по горизонтали при каждом изменении.
- **Кнопка закрытия dock**: Кнопка × справа на панели — скрывает dock. IPC: `dock:close` (dock→main).
- **Скрытие без задач**: Если нет закреплённых — dock автоматически скрывается (по умолчанию).
- **Настройка "Панель задач без задач"**: В SettingsPanel toggle `showDockEmpty` — показывать dock даже когда нет задач (надпись "нет задач").
- **Resize передаёт ширину + высоту**: `dock:resize(w, h)` вместо только `h`. Main пересчитывает позицию по центру.
- **Новый IPC**: `dock:close`, `dock:show-empty`.

### v0.66.1 (16 марта 2026) — Фикс Unicode в pin-карточке и dock
- **Фикс отображения текста**: `\uXXXX` / `\u{XXXXX}` escape-последовательности в HTML-разметке заменены на реальные UTF-8 символы. HTML не интерпретирует JS Unicode escapes — показывал их как текст (`\u{1F4CC}` вместо 📌).
- **Затронутые файлы**: `pin-notification.html` (индикатор 📌, кнопки 5м/15м/1ч, Копировать, В задачи, Открепить, ✕ Отмена), `pin-dock.html` (label 📌).
- **JS-строки не затронуты**: `\uXXXX` в `<script>` работает корректно — исправлен только HTML text content.

### v0.66.0 (16 марта 2026) — Dock (зона задач) + Таймер на pin-карточке
- **Dock (зона задач)**: Горизонтальная панель внизу экрана — компактные табы для свёрнутых pin-сообщений. Кнопка «⬇ В задачи» на pin-карточке сворачивает её в dock. Клик по табу — показать pin-окно. × на табе — открепить полностью.
- **Таймер напоминания**: Кнопки 5м / 15м / 1ч на pin-карточке. Активный обратный отсчёт с возможностью отмены. По истечении: карточка мигает красным, звук (два бипа 880Hz), окно показывается если скрыто.
- **Таймер в dock**: Countdown отображается на табе в dock. При истечении — таб мигает красным.
- **Архитектура**: `pinWindows[]` → `pinItems = Map()` с pinId. Dock — отдельный frameless BrowserWindow.
- **Новые файлы**: `main/pin-dock.html`, `main/preloads/pin-dock.preload.js`.
- **Новые IPC**: `pin:minimize-to-dock`, `pin:start-timer`, `pin:cancel-timer`, `pin:timer-started`, `pin:timer-alert`, `dock:add`, `dock:remove`, `dock:show-pin`, `dock:unpin`, `dock:resize`, `dock:update-timer`, `dock:timer-alert`.

### v0.65.0 (16 марта 2026) — Закрепление сообщений (Pin Window)
- **Новая функция: Pin Message**: Кнопка 📌 на каждом сообщении в ribbon (host + стэкированные). По клику создаёт отдельное независимое окно с отправителем и полным текстом.
- **Pin-окно**: Frameless BrowserWindow, draggable за заголовок, always-on-top, с кнопками "Копировать" и "Открепить". Живёт независимо от ribbon.
- **Новые файлы**: `main/pin-notification.html` (UI карточки), `main/preloads/pin.preload.js` (preload).
- **IPC**: `notif:pin-message` (ribbon→main), `pin:data` (main→pin), `pin:unpin` / `pin:resize` (pin→main).
- **Удалён hover-тултип**: Весь код tooltip (showTooltip, hideTooltipFade, scheduleHide и т.д.) удалён — заменён на pin buttons.
- **Фикс expandedByDefault**: `bText.textContent = full` заменён на обновление `.msg-text-content` span — сохраняет `.msg-time` и `.pin-msg-btn`.

### v0.64.3 (13 марта 2026) — Фикс цвета времени в стэке
- **Фикс `.msg-time` в стэке**: Правило v0.64.2 `.stacked-body span` перебивало `.msg-time` (specificity 0,3,1 > 0,1,0) — стэковые времена становились яркими 0.8, а host `.msg-time` оставался 0.3. Исправлено: `span:not(.msg-time)` — теперь все `.msg-time` одинаково тусклые (0.3).

### v0.64.2 (13 марта 2026) — Единый цвет текста host и стэка в expanded
- **Фикс цвета стэка**: В expanded-карточке host `.body-text` имел `color: 0.8`, а `.stacked-body` оставался `0.6`. Добавлено правило `.notif-item.expanded .stacked-body, .notif-item.expanded .stacked-body span { color: rgba(255,255,255,0.8) }`.
- **Причина**: CSS `.notif-item.expanded .body-text` повышал прозрачность до 0.8, но `.stacked-body` не был охвачен этим правилом.

### v0.64.1 (13 марта 2026) — Фиксация тултипа по клику (pin)
- **Pin тултипа кликом**: Клик по тултипу закрепляет его — добавляется класс `.pinned`, иконка 📌, кнопка ✕ для закрытия. Закреплённый тултип не скрывается при уходе мыши.
- **Выделение текста**: В pinned-режиме `user-select: text` — можно выделять и копировать часть текста.
- **Кнопка копирования**: Работает отдельно от pin — клик по 📋 копирует весь текст, не закрывает тултип.
- **Один закреплённый**: При наведении на другой элемент закреплённый тултип не переключается — только через ✕.
- **Визуал**: Закреплённый тултип получает индиго-рамку (`rgba(99,102,241,0.4)`) для отличия от обычного.

### v0.64.0 (13 марта 2026) — Фикс тултипа host + цвет стэка + убран toggle по клику
- **Фикс тултипа host body-text**: Для `.body-text` с `data-full` тултип показывается если fullBody длиннее short — без проверки scrollWidth (inline `overflow:hidden` на span ломал проверку).
- **Единый цвет сообщений**: `.stacked-body` изменён с `rgba(255,255,255,0.55)` → `0.6` — теперь совпадает с host `.body-text`.
- **Убран toggleExpand по клику**: Клик по карточке больше НЕ сворачивает/разворачивает кнопки. Управление — только через настройку "Кнопки действий сразу".
- **Фикс expanded CSS**: `.msg-text-content` в expanded теперь `!important` для `white-space`, `overflow`, `text-overflow` — inline стили больше не перебивают.

### v0.63.9 (13 марта 2026) — Тултип для конкретного элемента + resize окна
- **Тултип конкретного элемента**: Убран приоритет `.stack-container`. Каждый `.body-text`, `.stacked-body`, `.sender` показывает СВОЙ тултип с полным текстом — даже внутри стэка.
- **Resize окна при тултипе**: Если тултип не помещается сверху — notification window увеличивается вверх через `notifApi.resize()`. При скрытии — высота возвращается. `tooltipExtraHeight` отслеживает доп.высоту.
- **Фикс проверки обрезки**: Для flex-контейнера (body-text с временем) проверяется scrollWidth дочернего `.msg-text-content` span.

### v0.63.8 (13 марта 2026) — Время в ribbon + тултип упрощён + настройка showMessageTime
- **Время перед текстом**: В карточке ribbon перед текстом сообщения показывается время получения (HH:MM). CSS-класс `.msg-time` — мелкий серый шрифт. Работает и в host-сообщении, и в стэкнутых сообщениях.
- **Настройка showMessageTime**: Toggle в SettingsPanel → "Время в уведомлениях". Передаётся из main.js через `showCustomNotification` → `data.showMessageTime`. По умолчанию включено.
- **Тултип упрощён**: Убрано время и имя из тултипа. Остался только полный текст + иконка копирования. `max-width` увеличен до 360px.
- **Фикс закрытия тултипа**: Добавлена задержка 100мс (`scheduleHide`) перед скрытием — мышь успевает дойти до иконки копирования. `mouseover` на `.cc-tooltip` отменяет скрытие.

### v0.63.7 (13 марта 2026) — Staggered-анимация строк стэка в тултипе
- **Staggered появление**: Строки мини-превью стэка появляются с каскадной задержкой 30мс между каждой строкой. CSS-анимация `stackRowSlideIn` — `translateY(-6px)` + `opacity: 0→1` за 200мс ease-out. Визуально — строки "вкатываются" одна за другой, создавая эффект живого интерфейса.

### v0.63.6 (13 марта 2026) — Иконка копирования + мини-превью стэка
- **Иконка копирования**: Текстовая подсказка "клик — скопировать" заменена на компактную иконку (clipboard emoji) в правом верхнем углу тултипа. При hover подсвечивается, при копировании — зелёная галочка. Тултип компактнее по высоте.
- **Мини-превью стэка**: При наведении на `.stack-container` — тултип показывает ВСЕ сообщения стэка: имя отправителя вверху, затем строки "время текст" для каждого сообщения (host + дочерние). Клик по тултипу копирует весь стэк.
- **Приоритет тултипов**: `.stack-container` имеет приоритет над одиночными `.stacked-body`. Одиночные `.body-text` и `.sender` вне стэка — обычный тултип.

### v0.63.5 (13 марта 2026) — Фикс горизонтального скролла + время в тултипе
- **Фикс скролла в expanded**: В `.notif-item.expanded .body-text` заменено `overflow: visible` на `overflow-x: hidden` + `word-break: break-word`. Длинные слова без пробелов теперь переносятся вместо горизонтального скроллбара.
- **Время в тултипе**: При наведении на обрезанный текст — тултип показывает время получения (HH:MM) вверху мелким шрифтом. Время сохраняется в `data-ts` при создании `.body-text` и `.stacked-body`.

### v0.63.4 (13 марта 2026) — Улучшения тултипа: fade-out + копирование кликом + debounce
- **Плавное исчезновение (fade-out)**: Тултип исчезает с анимацией opacity 150мс вместо мгновенного удаления. Класс `.fading` + transition.
- **Копирование кликом**: Клик по тултипу копирует полный текст в буфер обмена. Подсказка "клик — скопировать" внизу. После копирования: зелёная рамка + "Скопировано!" + автоскрытие через 800мс.
- **Debounce 300мс**: Тултип появляется только если мышь задержалась на тексте 300мс. При быстром движении мыши — тултип не мелькает.
- **Кликабельный тултип**: `pointer-events` включены (можно кликнуть). При уходе мыши с тултипа — плавное скрытие.

### v0.63.3 (13 марта 2026) — Тултип полного текста при наведении на обрезанное сообщение
- **Кастомный тултип**: При наведении мыши на обрезанный текст (ellipsis) в ribbon-уведомлении появляется красивый тултип с полным текстом сообщения. Работает для `.body-text`, `.stacked-body` и `.sender`.
- **Умное позиционирование**: Тултип появляется над текстом; если не помещается сверху — показывается снизу. Не выходит за границы экрана по горизонтали.
- **Проверка обрезки**: Тултип показывается ТОЛЬКО если текст реально обрезан (`scrollWidth > clientWidth`). Если текст помещается — ничего не происходит.
- **Анимация `tooltipFadeIn`**: Плавное появление 150мс (opacity + translateY).
- **Стиль**: `#2d2d4a` фон, скруглённые углы, мягкая тень — в стиле приложения.

### v0.63.2 (12 марта 2026) — Фикс mark-read при 5+ сообщениях + лимит высоты стэка
- **Корень бага mark-read**: FIFO в main.js (`notifItems.length >= 6 → shift()`) удаляла хост-сообщение при 7+ уведомлениях. `markRead(hostId)` не находил item → mark-read не выполнялся. Увеличен FIFO лимит `notifItems` с 6 до 30.
- **Лимит высоты стэка**: Стэкнутые сообщения обёрнуты в `.stack-container` с `max-height: 120px` + скролл. Окно ribbon не разрастается бесконечно. Автоскролл к новому сообщению.
- **Тонкий скроллбар**: 3px, полупрозрачный, стилизован через webkit-scrollbar.

### v0.63.1 (12 марта 2026) — Стэк без дублирования имени отправителя
- **Убран stacked-sender**: В стэкнутых сообщениях показывается только текст сообщения без имени отправителя. Имя уже отображается вверху карточки (sender). Удалён CSS `.stacked-sender`.

### v0.63.0 (12 марта 2026) — Стэковая группировка ribbon + настройки в одну строку
- **Стэковая группировка**: Полная переработка группировки ribbon. Вместо отдельной карточки "Макс: 3 новых" — новые сообщения добавляются как строки внутри уже существующей карточки. Каждое сообщение = sender + body с разделителем. Без счётчика. Таймер сбрасывается при каждом новом сообщении.
- **Настройки в одну строку**: "Звук" и "Ribbon" с тогглами и кнопками теперь в одной строке (`flex gap-4`) вместо двух отдельных строк. Убран `flex-wrap` — компактнее.
- **Ghost-items**: Дочерние сообщения стэка хранятся в `items` Map как `isStackChild: true` (без своего DOM). При dismiss хоста — все child'ы автоматически dismiss'ятся через `cleanupStack()`.
- **CSS `stackFadeIn`**: Анимация появления новой строки (opacity + translateY).

### v0.62.8 (12 марта 2026) — Фикс отступов кнопок ribbon + эффект перехода в чат
- **Фикс отступов кнопок**: `margin-left: -54px` → `0`. Кнопки "Перейти к чату" и "Прочитано" больше не залезают на аватарку, выровнены с текстом.
- **Эффект перехода в чат**: При нажатии "Перейти к чату" — кнопка пульсирует синим + flash + текст меняется на "✓ Переход...", затем вся карточка уезжает влево (в сторону чата) с fade. Отличается от обычного dismiss вправо — создаёт ощущение навигации.
- **3 CSS-анимации**: `goChatPulse` (свечение), `goChatFlash` (подсветка), slide-left через inline transition.

### v0.62.7 (12 марта 2026) — Mark-read при свёрнутом окне (невидимый restore) + убран hint "свернуть"
- **Mark-read при свёрнутом окне**: `document.hidden` НЕ определяет минимизированное Electron окно (`hidden=false`). Новый подход: main.js проверяет `mainWindow.isMinimized()`. Если свёрнуто → `setOpacity(0)` + `restore()` + mark-read + через 1.2сек `minimize()` + `setOpacity(1)`. Окно невидимо восстанавливается, WebView просыпается, DOM-клик работает.
- **Убран hint "свернуть"**: `expand-hint` скрыт (`display:none`). Пользователь настраивает полное меню в настройках.

### v0.62.6 (12 марта 2026) — Логирование звука + ribbon UI + mark-read при свёрнутом + редактирование вкладки
- **Логирование звука в Pipeline**: Все 4 пути воспроизведения звука теперь пишут в Pipeline trace (`traceNotif`). При блокировке дедупом — пишет "dedup badge/title/ipc Nмс назад". Видно кто именно сыграл звук.
- **Кнопки под аватаркой**: `action-row` получил `margin-left: -54px` — кнопки начинаются от левого края аватарки, а не от текста.
- **Color-bar на всю высоту**: `position: absolute; top:0; bottom:0` вместо `align-self:stretch`. Покрывает всю высоту включая padding-top подписи мессенджера.
- **Mark-read при свёрнутом окне**: `pendingMarkReadsRef` — очередь отложенных mark-read. Если `document.hidden` → откладывает, при `visibilitychange` → выполняет с задержкой 500мс.
- **Редактирование вкладки**: Новый пункт контекстного меню "Изменить вкладку" (✏️). Открывает AddMessengerModal с prefilled данными (имя, URL, цвет, эмодзи). Кнопка "Сохранить" вместо "Добавить".

### v0.62.5 (12 марта 2026) — Фикс двойного звука + ribbon UI (padding, кнопки слева)
- **Фикс двойного звука**: `lastSoundTsRef` — дедупликация звука между 4 путями (`__CC_NOTIF__`, `messenger:badge`, `page-title-updated`, `unread-count` IPC). Если звук для мессенджера уже играл <3сек назад → пропускаем. Корень: `__CC_NOTIF__` играл звук, а через ~1сек unread-count update играл второй.
- **Ribbon padding**: min-height 76→82px, padding-top 14px при наличии подписи мессенджера (класс `.has-mname`). "МАКС" теперь полностью помещается над аватаркой.
- **Кнопки слева**: `action-row` получил `justify-content: flex-start` — кнопки "Перейти к чату" и "Прочитано" прижаты к левому краю.

### v0.62.4 (12 марта 2026) — Полная переработка mark-read для MAX (nav + a[href])
- **Новая стратегия mark-read для MAX**: Полностью переписан `buildChatNavigateScript` для MAX. Старые 12 CSS-селекторов (`.chatlist-chat`, `.peer-title` и т.д.) заменены на работу с реальной DOM-структурой MAX: `<nav>` + `a[href]` ссылки.
- **4 метода поиска**: A) nav + a[href] exact/icase/partial → B) все a[href] на странице → C) TreeWalker + click → D) scroll fallback.
- **Подробная диагностика**: Логирует nav.className, количество ссылок, samples первых 5 ссылок (текст + href), текущий URL.
- **Корень проблемы**: MAX (SvelteKit) использует `<nav class="navigation svelte-xxx">` с 51 child, без `.chatlist-chat`, без `.peer-title`. Старые селекторы возвращали 0 элементов.

### v0.62.3 (12 марта 2026) — Подпись мессенджера над аватаркой + расширенная DOM-диагностика mark-read
- **Подпись над аватаркой**: "МАКС" перенесён из text-wrap снизу → position:absolute над аватаркой слева (top:4px, left:10px). Не занимает место в потоке.
- **Mark-read расширенный поиск**: 12 CSS-селекторов + TreeWalker fallback + DOM-диагностика (sidebar class, children count). Предыдущий скрипт не находил чаты (`titles=0`) — у MAX другие классы.
- **DOM-диагностика**: Если чат не найден → логирует sidebar className, кол-во элементов внутри, body.children.length.

### v0.62.2 (12 марта 2026) — Mark-read логирование в Pipeline trace
- **Лог mark-read в Pipeline**: `console.log('[MarkRead]')` заменён на `traceNotif('mark-read', ...)`. Результат (ok/method/log) виден в "Лог уведомлений" приложения, а не в DevTools.

### v0.62.1 (12 марта 2026) — Фикс подписи мессенджера + улучшенный mark-read для MAX
- **Фикс подписи мессенджера**: `.messenger-name` был невидимым — наследовал чёрный цвет текста на тёмном фоне. Добавлен явный `color: rgba(255,255,255,0.45)`.
- **Улучшенный mark-read для MAX**: Добавлено логирование (`log`, `samples`), partial/startsWith match для длинных имён, scrollDown() после клика для сброса unread. Fallback: если чат не найден — всё равно скроллит текущий чат вниз.
- **Визуальное подтверждение «Прочитано»**: Кнопка при клике зеленеет ("✓ Готово!"), потом через 0.8сек ribbon плавно закрывается.

### v0.62.0 (12 марта 2026) — Ribbon UI: крестик закрытия, название мессенджера, починка «Прочитано»
- **Крестик вместо галочки**: Зелёная кнопка ✓ (read-btn) справа сверху заменена на × (close-btn) — закрывает уведомление. Единая кнопка, без дублей.
- **Убран невидимый close-btn**: Раньше было 2 механизма закрытия (read-btn + скрытый close-btn). Оставлен один × всегда видимый.
- **Название мессенджера снизу**: `messengerName` (например "Макс") перенесён из строки отправителя в отдельный элемент `.messenger-name` между body-text и action-row. Шрифт: 11px, uppercase, opacity 0.45.
- **Починка «Прочитано»**: Кнопка теперь реально помечает чат прочитанным в мессенджере. IPC: `notif:mark-read` → main.js → `notify:mark-read` → App.jsx → `buildChatNavigateScript()` → `executeJavaScript()` кликает по чату в WebView мессенджера. Работает для Telegram, MAX, WhatsApp, VK.

### v0.61.3 (12 марта 2026) — Cleanup: убрана разведка opts, документированы ограничения
- **Разведка завершена**: MAX Notification API для стикеров содержит только `{icon, badge, body, silent}`. Нет `image`, нет `data`. Убран диагностический `__CC_NOTIF_OPTS__` лог.
- **Ограничение задокументировано**: DOM-извлечение стикеров работает только когда пользователь в чате. Если на другой вкладке → `.history` контейнер отсутствует → fallback "📎 Стикер".
- **MAX поведение body**: 1-2 одинаковых эмодзи → body содержит их (👎👎). 3+ или комбинации разных → body пустой.

### v0.61.2 (12 марта 2026) — Улучшенный DOM-поиск стикеров + диагностика
- **Расширенный emoji-детект**: Вместо узкого Unicode regex — проверка `!/[a-zA-Zа-яА-Я0-9]/.test(t)` (текст без букв/цифр = эмодзи). Покрывает ❤️‍🔥, 👋, ZWJ-комбинации и все вариации.
- **Улучшенный img-детект**: Учитывает `style.width/height` (не только naturalWidth). Фильтрует sqr_/avatar (аватарки MAX).
- **Диагностика `__CC_STICKER_DBG__`**: При неудаче логирует className контейнера, кол-во children и классы последних 5 элементов — для анализа DOM-структуры.
- **Расширенный контейнер поиск**: Добавлен `.history` (без i-flag) — точное совпадение для MAX SvelteKit.

### v0.61.1 (12 марта 2026) — Извлечение стикеров/эмодзи из DOM + скрытие #N
- **DOM-извлечение стикеров**: При пустом body (стикер) — `_extractStickerFromDOM()` ищет последнее сообщение в DOM чата и извлекает: (1) эмодзи-текст из `[class*="emoji/sticker/big"]` → показывается как есть (😇😉👍), (2) картинку стикера → "🖼 Картинка", (3) анимацию (video/canvas) → "🎬 Анимация", (4) fallback → "📎 Стикер".
- **Скрытие #N**: Суффикс `#N` нужен для dedup (уникальность), но пользователю не показывается. `displayText = text.replace(/ #\d+$/, '')` перед отправкой в ribbon.
- **Разведка opts**: Логирование `__CC_NOTIF_OPTS__` всех полей Notification API при пустом body для диагностики.

### v0.61.0 (12 марта 2026) — Фикс dedup для стикеров: уникальный placeholder
- **Фикс dedup стикеров**: Все стикеры получали одинаковый body `"📎 Стикер"` → дедупликация (notifDedup 5с + recentNotifs 10с) блокировала 2-й и последующие. Теперь: `"📎 Стикер #1"`, `"📎 Стикер #2"` и т.д. — уникальный счётчик `_stickerSeq` в injection коде WebView.

### v0.60.9 (12 марта 2026) — Фикс пустого body для стикеров/медиа (MAX multi-emoji)
- **Фикс empty body sticker**: MAX отправляет `new Notification(sender, {body: ""})` для мульти-эмодзи стикеров (😇😉👍, 👋❤️‍🔥😉). `isSpamNotif()` блокировал их как "empty". Теперь: если body пустой, но title — реальный sender (не app-title), подставляется placeholder "📎 Стикер". Применяется в обоих override: `window.Notification` и `ServiceWorkerRegistration.showNotification`.

### v0.60.8 (12 марта 2026) — Фикс спам-фильтра для одиночных символов/эмодзи
- **Фикс isSpamNotif**: Было `body.length < 2` → блокировало одиночные символы и некоторые эмодзи. Стало `!body.trim()` → блокирует только реально пустые и пробельные строки. Однобуквенные сообщения и эмодзи теперь проходят.

### v0.60.7 (12 марта 2026) — Фикс зависания ribbon при быстром потоке
- **Фикс FIFO deadlock**: `dismissItem()` удаляет из Map только через 520мс (после анимации). При быстром потоке (10 сообщений) `while (items.size >= MAX_ITEMS)` вызывал `dismissItem()` на уже dismissing элементы → `items.size` не уменьшался → deadlock. Решение: `forceRemoveItem()` — мгновенное удаление без анимации для FIFO вытеснения.
- **Каскад ограничен 5 слотами**: Максимум 5 × 100мс = 500мс задержки. Сверх этого — без задержки. Сброс очереди через 600мс.

### v0.60.6 (12 марта 2026) — Каскадное появление ribbon + задержка collapse
- **Каскадное появление**: При 2+ ribbon одновременно — каждый следующий влетает с задержкой 120мс. `animationDelay` + `animationFillMode: backwards`. Очередь сбрасывается через 800мс (если новые не приходят).
- **Задержка collapse для естественности**: Пауза 80мс между fade (250мс) и collapse (180мс). Общее время dismiss: 250 + 80 + 180 = 510мс. Визуально более "физичное" движение — объект сначала уходит, потом пространство схлопывается.

### v0.60.5 (12 марта 2026) — Фикс мигания ribbon при dismiss
- **Фикс мигания**: Dismiss через CSS-анимацию вызывал flash — при смене класса opacity мгновенно возвращалось к 1 на 1 кадр. Заменено на inline CSS transitions: `animation:none` → зафиксировать opacity/transform → transition fade → transition height collapse → remove. Полностью безмиговая последовательность.
- **Защита от двойного dismiss**: Флаг `item.dismissing` предотвращает повторный вызов dismissItem на уже исчезающем элементе.
- **calcHeight улучшен**: Пропускает элементы с `pointerEvents=none` (dismissing) для точного расчёта высоты окна.

### v0.60.4 (11 марта 2026) — Группировка ribbon + фикс таймера + плавный коллапс
- **Группировка уведомлений**: При 2+ ribbon от одного мессенджера — объединяются в одну карточку "Макс: 3 новых" со счётчиком и preview последнего сообщения. Клик по группе → развернуть все. Настройка `ribbonGrouping` в SettingsPanel.
- **Фикс таймера expandedByDefault**: Раньше при "Кнопки действий сразу" таймер НЕ запускался (уведомления висели вечно). Теперь таймер ВСЕГДА запускается, expandedByDefault — только визуальное раскрытие.
- **Плавный коллапс**: Двухэтапный dismiss — (1) fadeSlide 250мс, (2) height→0 200мс. Нижние ribbon плавно поднимаются вместо прыжка.
- **Настройка в UI**: Новый toggle "Группировка уведомлений" между "Кнопки действий сразу" и "Автопереключение".

### v0.60.3 (11 марта 2026) — Плавная анимация ribbon + per-item hover pause
- **Плавная анимация закрытия**: Новая `dismissOut` анимация — fade + scale(0.9) + сдвиг 120px за 350мс (вместо жёсткого slideOut 200мс). Входящая анимация `slideIn` с bounce-эффектом (cubic-bezier).
- **Per-item hover pause**: Hover ставит на паузу ТОЛЬКО то уведомление, на которое навёл курсор (не все сразу). Реализовано через единый `mousemove` на контейнере с трекингом `hoveredItemId`, а не per-item `mouseenter`/`mouseleave` (Windows transparent+focusable:false шлёт mouseenter на все элементы).
- **Визуальный индикатор hover**: Класс `.hovered` — подсветка border + тень при наведении.
- **Состояние в Map**: Все timer/remaining/paused хранятся в `items` Map (не в closure) — избегаем рассинхрона.

### v0.60.2 (11 марта 2026) — Per-messengerId dedup + enrichment fix "Окно чата с"
- **Per-messengerId dedup**: Если `__CC_NOTIF__` от messengerId прошёл <3 сек назад, `__CC_MSG__` и IPC блокируются целиком (без сравнения sender name). Решает проблему когда enrichment выдаёт другое имя.
- **Enrichment name cleanup**: Strip "Окно чата с" + "В сети" + дедупликация имени ("Иванов Иван     Иванов Иван" → "Иванов Иван") — в executeJavaScript И после возврата результата.
- **Причина дубля**: `.topbar .headerWrapper` textContent содержал "Окно чата с Name     Name  В сети" (дубль имени + статус). После strip длина >80 → отклонялся check → fallback ловил "Окно чата с..." без strip → sender-dedup не совпадал.

### v0.60.1 (11 марта 2026) — Полный перехват звуков мессенджера (Audio + createElement + AudioContext)
- **Audio override расширен**: Помимо `new Audio(src)`, теперь глушим `document.createElement('audio')` (volume=0, muted=true) и `AudioContext.createGain()` (gain.value=0). MAX использовал не `new Audio()` — первое сообщение давало двойной звук (наш + родной MAX).
- **Проблема common-mistakes.md**: Записаны 7 проблем v0.59.2–v0.60.0 (scrollListContent=sidebar, messageWrapper≠message, pushState isolation, truncation, enrichment header, sender dedup).

### v0.60.0 (11 марта 2026) — 3 решения: re-attach навигация + sender-dedup + структурный DOM-фильтр
- **Решение #1 — Re-attach chatObserver при навигации**: Перехват pushState/replaceState/popstate в WebView. При переходе VK на `/im/convo/...` chatObserver переподключается к `ConvoMain__history` вместо body. При уходе из чата — fallback обратно. Решает корневую причину мусора.
- **Решение #2 — Sender-based dedup**: Если `__CC_NOTIF__` от sender X прошёл pipeline, все `__CC_MSG__` от того же sender блокируются 3 сек (даже с другим текстом). Убирает дубли когда VK шлёт несколько Notification + MutationObserver ловит тот же текст.
- **Решение #3 — Структурный DOM-фильтр**: В `quickNewMsgCheck` при body-fallback проверяем `_chatContainerEl.contains(node)`. Ноды ВНЕ контейнера чата (кнопки "Это не я", контекстное меню "Переслать/Удалить", sidebar) отсеиваются по DOM-позиции, не по тексту.
- **Спам-фильтр VK UI**: "Переслать", "Отметить как новое", "Скопировать текст", "Удалить", "Сообщение" (placeholder) — блокируются в `__CC_MSG__`.
- **MAX реальные селекторы**: `.history` (870 children) — контейнер сообщений. `.scrollListContent` (521 children) оказался SIDEBAR — перемещён в `_sidebarRe`.
- **Имя мессенджера в Pipeline**: Новая колонка "Мессенджер" в таблице Pipeline + поле `mName` в JSON-экспорте. Нет путаницы между VK/MAX/TG.

### v0.59.2 (11 марта 2026) — Реальные VK DOM-селекторы из DOM Inspector
- **`ConvoMain__history`** — реальный класс контейнера чата VK (784 children). Добавлен первым в `CHAT_CONTAINER_SELECTORS.vk` и в `getVKLastIncomingText()`. chatObserver теперь найдёт контейнер без fallback.
- **`.ConvoHeader__info`** — реальный селектор имени отправителя VK. Добавлен в `getActiveChatSender()` (preload) и в headerSels enrichment (App.jsx).
- **Status stripping**: VK приклеивает "online"/"offline" к имени без пробела ("Елена Дугинаonline"). Regex strip в обоих местах: preload и enrichment.
- **`_sidebarRe` обновлён**: Реальные VK классы sidebar — `ConvoList`, `ConvoListItem`, `MessagePreview`, `LeftAds`, `LeftMenu`.
- **`extractMsgText()`**: Добавлен фильтр "назад" (VK пишет "три минуты назад"), секции VK UI.

### v0.59.1 (11 марта 2026) — chatObserver fallback + Path 2 возврат + DOM диагностика
- **chatObserver fallback**: Если контейнер чата не найден за 15 сек (5 попыток) → fallback на document.body с `isSidebarNode()` фильтром (8 уровней, regex по классам + role). Логирование в Pipeline через `__CC_DIAG__`.
- **Path 2 возвращён для активного чата**: VK/WhatsApp не считают сообщение непрочитанным когда чат открыт → unread не растёт → Path 1 не работает. Path 2 вызывает `getLastMessageText()` при каждом debounced `sendUpdate` и ищет НОВЫЙ текст (≠ lastActiveMessageText), cooldown 3 сек.
- **DOM Inspector расширен**: Добавлены `chatContainer` (поиск по 16 селекторам) и `scrollContainers` (overflow/scroll элементы). Это покажет реальные классы VK DOM для настройки селекторов.
- **Диагностические логи**: `__CC_DIAG__` из preload → Pipeline debug trace (привязка chatObserver, retry статус, fallback).

### v0.59.0 (11 марта 2026) — Архитектура MutationObserver: chatObserver на контейнер чата
- **КОРНЕВАЯ ПРИЧИНА**: MutationObserver наблюдал за ВСЕМ document.body. Любое изменение DOM (sidebar preview, статусы, навигация) порождало ложные "сообщения": "три минуты назад", "Недавние", "Привет понял принял" (старый preview из chatlist), имена контактов как текст стикеров.
- **chatObserver**: Отдельный MutationObserver ТОЛЬКО на контейнер чата (`.im-page--chat-body`, `.ChatBody`, `.messages-container` и т.д.). `quickNewMsgCheck` теперь получает мутации ТОЛЬКО из области пузырей сообщений → sidebar мусор не попадает.
- **Path 2 удалён**: `sendUpdate()` больше не вызывает `getLastMessageText()` для детекции новых сообщений. Это был второй источник мусора — `getVKLastIncomingText()` искал `span, p` по всему DOM чата и ловил UI-элементы.
- **Спам-фильтры упрощены**: Убраны десятки VK UI regex (даты, месяцы, секции) — они были костылями. Оставлены только базовые (timestamps, статусы "в сети", "назад", исходящие "Вы:").
- **Медиа-детект**: Если текст = sender name → заменяем на "📎 Медиа" (стикер, фото без текста).

### v0.58.1 (11 марта 2026) — VK спам-фильтры + медиа-детект + sidebar filter
- **Спам "X назад" словами**: VK пишет "три минуты назад" (не цифрами) — добавлен `/\s+назад\s*$/i` во все фильтры.
- **Медиа-детект (стикер/фото)**: Если текст сообщения = имя отправителя → это медиа без текста (стикер, фото). Заменяем body на "📎 Медиа".
- **Sidebar mutation filter**: MutationObserver ловил chatlist preview обновления (старые тексты из sidebar). Добавлен `isSidebarMutation()` — пропускает мутации из `dialog/chatlist/sidebar` контейнеров.
- **VK UI спам-фильтр**: "Недавние", "сегодня в", даты с названиями месяцев — теперь блокируются.
- **Preload extractMsgText**: добавлены фильтры "назад", VK UI секции, даты.

### v0.58.0 (10 марта 2026) — fromNotifAPI: уведомления при просмотре другого чата + спам-фильтр статусов
- **fromNotifAPI пропуск viewing**: Если мессенджер вызвал `showNotification` (`__CC_NOTIF__` путь), значит пользователь НЕ в этом чате → пропускаем viewing-блок. Раньше все сообщения блокировались при `focused=true && activeId=messenger`, даже если открыт другой чат внутри мессенджера.
- **Спам-фильтр "В сети" в конце текста**: "Дугин Алексей Сергеевич  В сети" проходил спам-фильтр (не начинался с "В сети"). Добавлен `/\s+(в\s+сети|online|offline|был[аи]?\s+(в\s+сети|недавно|давно))\s*$/i` — матчит статусы в конце строки.
- **Спам-фильтр "Сообщение", "Пропущенный вызов"**: MAX addedNodes отдавал системные тексты как сообщения. Добавлен `/^(сообщение|пропущенный\s*(вызов|звонок)|...)/i`.
- **Обновлены все 4 спам-фильтра**: `__CC_MSG__`, `__CC_NOTIF__`, IPC `new-message`, preload injection.

### v0.57.1 (10 марта 2026) — Warm-up 30→5 сек + trace warm-up блокировок
- **Warm-up снижен с 30 до 5 сек**: 30-секундный warm-up блокировал реальные сообщения — Pipeline debug показал `ready=false` на `__CC_NOTIF__` пришедший через 7 сек после загрузки. Burst кешированных нотификаций проходит за 1-3 сек → 5 сек достаточно.
- **Warm-up trace**: При блокировке warm-up в Pipeline записывается `warmup | block` с причиной.
- **main.js warm-up тоже 30→5 сек**: Backup path синхронизирован.

### v0.57.0 (10 марта 2026) — Фикс: toDataUrl зависание → уведомления MAX теперь работают
- **CRITICAL FIX — toDataUrl зависание**: В `executeJavaScript` injection, `console.log('__CC_NOTIF__'+...)` был внутри callback `toDataUrl()` (конвертация аватарки в data URL через `new Image()` + canvas). Если загрузка аватарки зависала (CORS/сеть) → callback НЕ вызывался → `console.log` НЕ срабатывал → `console-message` НЕ приходил → Pipeline пуст, нет звука/ribbon. Исправлено: `console.log` вызывается напрямую (как в preload версии), без `toDataUrl` обёртки.
- **Debug трассировка console-message**: Все `__CC_` сообщения теперь логируются в Pipeline trace при получении — видно, дошло ли сообщение и в каком состоянии `notifReadyRef`.
- **Удалён неиспользуемый `toDataUrl`** из executeJavaScript injection — функция больше не нужна.

### v0.56.1 (10 марта 2026) — Фикс: timestamp через IPC + deep scan для MAX + DOM-селекторы из Inspector
- **Спам-фильтр IPC `new-message`**: Timestamps "18:22" проходили через IPC `new-message` handler БЕЗ фильтра → ложный ribbon. Добавлен полный спам-фильтр + per-messenger regex + senderCache fallback.
- **Timestamp-фильтр Path 2**: `sendUpdate` → `getLastMessageText` для MAX возвращал timestamp → добавлен фильтр в Path 2 + в `getLastMessageText`.
- **Deep scan quickNewMsgCheck**: MAX (SvelteKit) обновляет DOM большими контейнерами (>40 children) → `quickNewMsgCheck` пропускал сообщения. Добавлен deep scan: для nodes 40-200 children ищет текстовые leaf-элементы внутри. `extractMsgText` — отдельная функция с очисткой embedded timestamps.
- **MAX DOM-селекторы из Inspector**: `.topbar.svelte-*` существует но без `.peer-title`. Добавлен fallback: ищет первый child div с коротким текстом (имя чата) внутри `.topbar`.

### v0.56.0 (10 марта 2026) — 5 улучшений Pipeline: Inspector, приоритет enriched, кэш, спам-фильтр, тест
- **DOM Inspector**: Кнопка "DOM" в Pipeline Trace — выгружает реальную DOM-структуру header/sidebar WebView в буфер обмена + запись в trace. Показывает классы, теги, текст элементов.
- **Приоритет enriched (200мс)**: `__CC_MSG__` ждёт 200мс — если `__CC_NOTIF__` с enriched данными придёт за это время, он отменяет pending MSG и обрабатывается как приоритетный.
- **Кэш sender**: `senderCacheRef` хранит последний известный sender/avatar per-messenger (до 5 мин). Используется как fallback при неудачном enrichment.
- **Per-messenger спам-фильтр**: Поле regex в Pipeline Trace — пользователь может добавить свои паттерны спама для конкретного мессенджера. Сохраняется в `messengerNotifs[id].spamFilter`.
- **Тест-кнопка**: Кнопка "Тест" в Pipeline Trace — отправляет тестовое уведомление через весь pipeline. Показывает полный путь source→handle→viewing→sound→ribbon.

### v0.55.1 (10 марта 2026) — Фикс enrichment для MAX: расширенные селекторы + задержка + спам-фильтр
- **Спам-фильтр "Ожидание сети..."**: Добавлены MAX системные тексты (ожидание сети, connecting, загрузка, обновление и др.) во ВСЕ 4 спам-фильтра (injection, `__CC_NOTIF__`, `__CC_MSG__`, monitor.preload.js).
- **Спам-фильтр `__CC_MSG__`**: Добавлен полный спам-фильтр к `__CC_MSG__` handler — timestamps и системные тексты больше не проходят.
- **Фикс dedup race condition**: `quickNewMsgCheck` эмиттит `__CC_MSG__` (не `__CC_NOTIF__`) — enriched версия из showNotification override больше не дедуплицируется пустой версией из preload.
- **Расширенные header-селекторы**: 8 вариантов для chat header (`.peer-title`, `[class*="title"]`, `[class*="name"]`, `header [class*="title"]` и др.).
- **Active chat fallback**: Новый fallback — поиск активного/выделенного чата в sidebar (`.chatlist-chat.active`, `[class*="chat"][class*="active"]` и др.) вместо поиска по тексту.
- **Задержка enrichment 150мс**: `__CC_MSG__` enrichment запускается с задержкой — chatlist успевает обновить preview текст.

### v0.55.0 (10 марта 2026) — Pipeline Trace Logger: полная трассировка уведомлений
- **Pipeline Trace**: Новая вкладка "Pipeline" в логе уведомлений — записывает КАЖДЫЙ шаг прохождения уведомления через pipeline.
- **Трассируемые шаги**: source (источник: __CC_NOTIF__, __CC_MSG__, IPC), spam (спам-фильтр), dedup (дедупликация), handle (вызов handleNewMessage), viewing (проверка isViewingThisTab), sound (решение о звуке), ribbon (решение о ribbon), enrich (обогащение sender/avatar).
- **Фильтры**: 4 режима — Все, Блокировки (block+warn), Источники (source+enrich), Решения (viewing+sound+ribbon+dedup).
- **Цветовая кодировка**: зелёный=пропущен, красный=заблокирован, жёлтый=предупреждение, серый=информация.
- **Автообновление**: trace обновляется каждые 3 сек вместе с логом.
- **Кнопка "Очистить"**: сброс трассировки для чистого эксперимента.

### v0.54.0 (10 марта 2026) — Enriched addedNodes: имя отправителя и аватарка для MAX и др.
- **Проблема**: MAX (и другие мессенджеры без Notification API) показывали ribbon без имени отправителя и аватарки. Лог уведомлений был пуст.
- **Причина**: `quickNewMsgCheck` (MutationObserver addedNodes) эмиттил `__CC_MSG__` — только текст, без данных отправителя. `showNotification` override не вызывался.
- **Фикс monitor.preload.js**: `getActiveChatSender()` + `getActiveChatAvatar()` извлекают имя и аватарку из заголовка активного чата (`.chat-info .peer-title`, `.topbar img.avatar-photo`). `quickNewMsgCheck` теперь эмиттит `__CC_NOTIF__` с enriched данными.
- **Фикс App.jsx `__CC_MSG__` handler**: Backup обогащение через `executeJavaScript` — ищет sender в DOM чатлиста + пишет в `__cc_notif_log`.
- **Фикс App.jsx `new-message` IPC**: Задержка 500мс для приоритета enriched `__CC_NOTIF__` — если за 500мс `__CC_NOTIF__` не пришёл, обрабатывает как есть.

### v0.53.3 (10 марта 2026) — Фикс hover-тултипа + statusbar диагностика навигации
- **JS-тултип вместо CSS ::after**: `position: fixed` тултип при hover на ячейку таблицы — не обрезается `overflow: hidden` родителя.
- **Statusbar диагностика**: При навигации к чату показывает результат в statusbar: `>> "Data Secrets" (exact)` или `>> "Data Secrets" - не найден в sidebar`.

### v0.53.2 (10 марта 2026) — Фикс непрошеного переключения вкладок + правильные Telegram peer ID
- **Фикс глюка**: Убрана `location.hash` навигация — она вызывала непредвиденное переключение чатов.
- **Проверка activeId**: `tryNavigate` прерывается если пользователь переключил вкладку (не трогает фоновый WebView).
- **Telegram peer types**: Правильный формат ID: user=положительный, chat=`-ID`, channel=`-100ID`. Парсинг из tag `peer{type}_{id}`.
- **Retry уменьшен**: 2 попытки вместо 4, только если пользователь на вкладке.

### v0.53.1 (10 марта 2026) — Улучшенная навигация к чату из ribbon и лога
- **Hash-навигация Telegram**: Если чат не найден в DOM (виртуальный скроллинг), используется `location.hash = peerId` для прямой навигации.
- **Case-insensitive поиск**: Добавлен fallback на поиск без учёта регистра.
- **Кнопка "Перейти" в логе**: Стрелка &#8594; в каждой строке лога — клик переходит к чату этого отправителя.
- **Подробная диагностика**: `buildChatNavigateScript` возвращает объект с `{ok, method, log, samples}` — видно ЧТО искалось, СКОЛЬКО элементов в DOM, КАКИЕ имена найдены.
- **4 попытки навигации**: Вместо 2 — 4 попытки с интервалом 1.5 сек (WebView может загружаться медленно).

### v0.53.0 (10 марта 2026) — Навигация к чату + автообновление лога
- **Улучшена навигация к чату при клике на ribbon**: Исправлен парсинг Telegram tag (`peer5_XXXX`), добавлены fallback-селекторы (`.dialog-title`, `[class*="chatlist"]`), partial match по имени.
- **Автообновление лога уведомлений**: Пока окно лога открыто — данные обновляются каждые 3 сек. Зелёный индикатор `● авто` в заголовке.

### v0.52.3 (10 марта 2026) — Фикс прыгающих столбцов в логе уведомлений
- **table-layout: fixed**: Фиксированная ширина столбцов через `<colgroup>` — при hover столбцы больше не сдвигаются.
- **::after pseudo-element tooltip**: Hover-подсказка через `::after` + `attr(data-full)` вместо `position: absolute` на самом элементе. Оригинальный контент остаётся в потоке документа.

### v0.52.2 (10 марта 2026) — Улучшения модального окна лога уведомлений
- **Ресайз окна**: CSS `resize: both` — окно можно растягивать за правый нижний угол. Увеличен дефолтный размер (860px).
- **Hover-подсказки**: При наведении на обрезанный текст — всплывающий оверлей с полным текстом (CSS `.cc-notif-cell:hover`).
- **Переименование столбца**: «Найдено имя» → «Отправитель» — понятнее для пользователя. Обновлена легенда.

### v0.52.0 (10 марта 2026) — Лог уведомлений (все мессенджеры) через контекстное меню
- **Лог всех Notification**: `window.__cc_notif_log` — массив до 100 записей. Каждый `new Notification()` и `showNotification()` записывает: timestamp, title, body, tag, status (passed/blocked), reason (empty/system/outgoing), enrichedTitle.
- **Пункт контекстного меню**: ПКМ на вкладке → "Лог уведомлений" → модальное окно с таблицей.
- **Модальное окно**: Таблица с цветной маркировкой — зелёный RIBBON = пропущен, красный БЛОК = заблокирован. Синий = enriched (имя найдено в DOM). Копирование JSON в буфер.
- **Работает для ВСЕХ мессенджеров**: injection script в App.jsx (executeJavaScript) и monitor.preload.js (<script>).

### v0.51.0 (10 марта 2026) — Фильтрация спам-ribbon VK + universal findSenderInChatlist
- **FIX: VK — ribbon для своих исходящих сообщений**: VK шлёт `new Notification()` для СВОИХ сообщений. `isSpamNotif()` + `_outgoing` regex фильтруют "Вы: ..." в body.
- **FIX: VK — ribbon для статусов online**: "минуту назад", "только что", "был в сети", "печатает" — всё фильтруется `_spamBody` regex.
- **FIX: Fallback ribbon "N непрочитанных" ОТКЛЮЧЁН**: Бесполезный текст без имени отправителя. Звук остаётся. `__CC_NOTIF__` — основной путь для ribbon.
- **Universal findSenderInChatlist**: Расширен для VK generic селекторов (`[class*="dialog"]`, `[class*="conversation"]`, `[class*="title"]`, `[class*="name"]`). `_findAvatarInEl` — вспомогательная функция (img, canvas, background-image).
- **Фильтры в 3 местах**: injection script (App.jsx + monitor.preload.js), `__CC_NOTIF__` handler (App.jsx), backup path (main.js).

### v0.50.0 (10 марта 2026) — enrichNotif: имя отправителя и аватарка из DOM для MAX
- **FIX: MAX — ribbon показывал "Макс" вместо имени отправителя**: MAX вызывает `showNotification("Макс", {body: "текст"})` — title = название приложения, а не имя. `enrichNotif()` обнаруживает это через regex `_appTitles` и ищет реальное имя в DOM chatlist по preview сообщения (`findSenderInChatlist(body)`).
- **FIX: MAX — аватарка в ribbon**: `findSenderInChatlist` извлекает `img.avatar-photo` или `canvas.avatar-photo` из `.chatlist-chat` элемента. Аватарка конвертируется в data URL через `toDataUrl()`.
- **enrichNotif в обоих путях**: Добавлено в App.jsx (`executeJavaScript` fallback) и в monitor.preload.js (`<script>` injection).
- **tag в __CC_NOTIF__**: Теперь `tag` передаётся из Notification opts для обоих путей (monitor.preload.js ранее не передавал `g`).

### v0.49.0 (10 марта 2026) — Фикс startup ribbon (warm-up 30 сек) + навигация к чату
- **FIX: startup ribbon — warm-up 30 сек**: 10 секунд недостаточно — WhatsApp загружается 15-30 сек и кидает `new Notification()` для старых непрочитанных. Warm-up увеличен до 30 сек в App.jsx (`notifReadyRef`) и в main.js backup path (`webviewReadySet`).
- **FIX: "Перейти к чату"**: `buildChatNavigateScript` теперь возвращает `true/false`. Retry до 3 попыток (задержка 1.2 сек). Первая попытка через 600ms (вместо 350ms). MAX: добавлены Telegram-like селекторы (`.chatlist-chat .peer-title`). WhatsApp: fuzzy match по `startsWith`.
- **Логирование навигации**: `[GoChat]` логи для отладки кнопки "Перейти к чату".

### v0.48.1 (10 марта 2026) — Фикс startup notifications (ложные ribbon при запуске)
- **FIX: ribbon при запуске для старых сообщений**: При запуске приложения счётчик непрочитанных шёл 0→N, что вызывало fallback ribbon и звук для КАЖДОГО мессенджера с непрочитанными. Причина: `page-title-updated` и `unread-count` хендлеры не проверяли `notifReadyRef` (10 сек warm-up). Добавлена проверка `notifReadyRef.current[messengerId]` в оба хендлера.
- **Все 5 путей уведомлений теперь проверяют warm-up**: `page-title-updated`, `unread-count`, `handleNewMessage`, `__CC_NOTIF__`, `new-message` IPC.

### v0.48.0 (10 марта 2026) — Аватарки в ribbon (data URL) + очистка диагностических логов
- **Аватарки отправителя в ribbon**: Иконки из Notification API конвертируются в `data:` URL прямо внутри WebView через `Image` + `canvas.toDataURL()`. Это позволяет передать аватарку с cookies сессии (Telegram требует авторизацию для скачивания аватарок). Ранее `downloadIcon` в main.js делал plain HTTP GET без cookies → 403 → аватарка не загружалась.
- **toDataUrl()**: Новая функция в injection script. Кэширует конвертированные data URL (TTL 30 мин). Работает async через `Image.onload` → canvas → dataURL. Fallback на исходный URL при ошибке.
- **Очистка диагностических логов**: Удалены все `[Notif]`, `[NotifManager]`, `[NotifHTML]` console.log из App.jsx, main.js, notification.html. Оставлены только error-логи и backup path логи.
- **Кнопка «Тест ribbon» очищена**: Убраны console.log/error из onClick, оставлена только функциональность.

### v0.47.2 (10 марта 2026) — Фикс ложных ribbon при навигации между чатами + rAF fix
- **FIX: ложные ribbon при навигации**: При переключении чата в Telegram, `getLastMessageText` находил последнее сообщение в НОВОМ чате, которое отличалось от `lastActiveMessageText` → считал его "новым" → показывал ribbon для СТАРОГО сообщения. Исправлено: Path 2 (детекция по тексту) теперь отключён для Telegram (`type !== 'telegram'`). Telegram хорошо работает через `__CC_NOTIF__` + unread count.
- **FIX: ribbon не показывался после первого dismiss**: `reportHeight()` использовал `requestAnimationFrame`, который НЕ вызывается в hidden BrowserWindow. После dismiss → `notifWin.hide()` → rAF больше не выполняется → ribbon навсегда скрыт. Заменён на `setTimeout(60ms)`. Также main.js показывает `showInactive()` ДО отправки `notif:show`.
- **Кнопка «Тест ribbon»**: В настройках — кнопка «Тест» для каждого мессенджера, напрямую вызывает `app:custom-notify`.
- **Диагностическое логирование**: `[Notif]` и `[NotifManager]` логи на каждом шаге пути уведомлений. Console.log из notification.html перенаправляется в терминал main process через `[NotifHTML]`.

### v0.47.1 (10 марта 2026) — Диагностика ribbon + кнопка «Тест ribbon»
- **Диагностическое логирование**: Подробные console.log на каждом шаге пути уведомлений: handleNewMessage (empty/dedup/viewing/pass/ribbon skip), new-message IPC (warm-up), showCustomNotification (empty body/timestamp/dedup). Каждый log с префиксом `[Notif]` или `[NotifManager]`.
- **Кнопка «Тест ribbon»**: В настройках рядом с toggle Ribbon для каждого мессенджера — кнопка 🔔 которая напрямую вызывает `app:custom-notify` с тестовым текстом. Позволяет проверить что notification window работает независимо от перехвата сообщений.
- **Файлы**: `src/App.jsx` (логирование), `src/components/SettingsPanel.jsx` (кнопка тест), `main/main.js` (логирование showCustomNotification).

### v0.47.0 (10 марта 2026) — Per-messenger настройки уведомлений
- **Per-messenger звук + ribbon**: Каждый мессенджер теперь имеет отдельные toggles "Звук" и "Ribbon" в настройках. Структура: `messengerNotifs: { [id]: { sound: bool, ribbon: bool } }`. Backwards compatible с `mutedMessengers`.
- **3 уровня контроля**: Глобальные настройки (soundEnabled, notificationsEnabled) → per-messenger (messengerNotifs) → mutedMessengers (legacy). Per-messenger переопределяет глобальные.
- **UI**: В секции "Мессенджеры" SettingsPanel — два toggle на каждый мессенджер: 🔔 Звук + 🏷️ Ribbon.
- **Файлы**: `src/components/SettingsPanel.jsx` (UI), `src/App.jsx` (handleNewMessage, page-title-updated, unread-count — все используют per-messenger настройки).

### v0.46.3 (10 марта 2026) — addedNodes detection для ribbon в MAX
- **addedNodes detection**: v0.46.2 fallback ribbon не работал для MAX — unread count не растёт когда чат открыт в WebView. Новый подход: `quickNewMsgCheck()` в MutationObserver напрямую анализирует `addedNodes` — при появлении нового DOM-элемента с текстом (2-500 символов, не timestamp, не UI-элемент) → `new-message` IPC → ribbon. Cooldown 3 сек, dedup по тексту.
- **Фильтрация ложных срабатываний**: Пропускаются BUTTON/INPUT/SVG/IMG/STYLE/SCRIPT, элементы с >40 дочерних (модалки/dropdown), timestamps, служебные тексты (typing/печатает/online). `isViewingThisTab` в App.jsx дополнительно блокирует ribbon когда пользователь смотрит на вкладку.
- **Scope**: Работает для MAX, WhatsApp, VK и unknown мессенджеров. Telegram исключён (хорошо работает через `__CC_NOTIF__`).

### v0.46.2 (6 марта 2026) — Fallback ribbon для повторных сообщений
- **Fallback ribbon**: Когда мессенджер (MAX и др.) не вызывает `new Notification()` для каждого нового сообщения, ribbon показывался только для первого. Теперь `page-title-updated` и `unread-count` хендлеры создают fallback ribbon, если `handleNewMessage` не показал ribbon за последние 3 секунды (`lastRibbonTsRef`).
- **lastRibbonTsRef**: Новый ref `{ [messengerId]: timestamp }` — отслеживает момент последнего показа ribbon для каждого мессенджера. Используется для dedup fallback ribbon.

### v0.46.1 (6 марта 2026) — Фикс ribbon expandedByDefault, плавная анимация, кэш аватарок по tag
- **КРИТИЧЕСКИЙ ФИКС: ribbon не показывается при "Кнопки действий сразу"**: При включённой настройке `ribbonExpandedByDefault` уведомления пропадали. Три причины: 1) `overflow: hidden` на `.notif-item` обрезал expanded-контент; 2) таймер запускался даже при expandedByDefault → авто-dismiss; 3) авто-раскрытие происходило ДО настройки таймера → inconsistent state. Решение: убран overflow:hidden, таймер приостанавливается при expandedByDefault, код авто-раскрытия перенесён ПОСЛЕ настройки таймера, начальная высота окна увеличена с 76 до 300px.
- **Плавная анимация expand/collapse ribbon**: `display:none/flex` заменён на CSS transition `max-height 200ms + opacity 200ms` для `.action-row`. При `toggleExpand` добавлен `setTimeout(reportHeight, 220)` для пересчёта высоты после завершения transition.
- **Кэш аватарок по tag (peer ID)**: `findAvatarCached(name, tag)` — кэширует URL аватарки по Notification.tag (peer ID) вместо имени контакта. TTL 30 минут. Работает для всех мессенджеров.

### v0.46.0 (6 марта 2026) — Аватарки в ribbon + настройка "Кнопки сразу"
- **Аватарки**: Улучшен `findAvatar` — теперь ищет `<img>` с любым src (не только http), `<canvas>` (Telegram K), `background-image`. Поддержка `data:` URL из canvas, `blob:` URL. Аватарка из canvas конвертируется в data URL прямо в WebView.
- **Настройка "Кнопки действий сразу"**: `ribbonExpandedByDefault` в settings → ribbon сразу раскрыт с кнопками. Toggle в разделе "Уведомления".
- **data URL pipeline**: Если `findAvatar` возвращает `data:` URL → передаётся в main как `iconDataUrl` (без скачивания через `downloadIcon`).
- **Файлы**: `src/App.jsx` (findAvatar, iconDataUrl), `main/main.js` (preDataUrl, expandedByDefault), `main/notification.html` (auto-expand), `src/components/SettingsPanel.jsx` (toggle)

### v0.45.2 (6 марта 2026) — Кнопки действий для ВСЕХ ribbon-уведомлений
- **Фикс**: Кнопки "Перейти к чату" и "Прочитано" были доступны ТОЛЬКО для длинных сообщений (>100 символов) через expand. Для коротких — только маленькая галочка ✓.
- **Решение**: Клик на ЛЮБОЕ ribbon-уведомление раскрывает кнопки действий. Подсказка "▼ действия" для коротких, "▼ ещё..." для длинных.
- **Файлы**: `main/notification.html`

### v0.45.1 (6 марта 2026) — Фикс дёргания первого ribbon-уведомления
- **Баг**: Первое ribbon-уведомление "дёргалось" при появлении, последующие — нет. Причина: двойной `setBounds` за 16ms — `repositionNotifWin()` сразу после send + `notif:resize` из HTML через rAF. На Windows два последовательных setBounds дают видимый дёрг.
- **Решение**: Убран `repositionNotifWin()` из `showCustomNotification()` и из IPC handlers (click/dismiss/mark-read). Единственный источник позиционирования — `notif:resize` от HTML. Добавлен кэш bounds (не вызывать setBounds если не изменились). Двойной rAF в reportHeight для стабильного layout.
- **Кнопка ✓ ярче**: Увеличен размер 24px, яркий зелёный цвет #4ade80, рамка для видимости.
- **Файлы**: `main/main.js`, `main/notification.html`

### v0.45.0 (6 марта 2026) — Автозагрузка WebView + индикатор загрузки на вкладках
- **Фикс автозагрузки**: `visibility: hidden` тоже может не загружать webview в Electron. Заменено на чистый `zIndex` + `pointer-events: none` — все WebView видимы в DOM, активный поверх остальных. Гарантирует загрузку всех мессенджеров при старте.
- **Индикатор загрузки**: Анимированный прогресс-бар (gradient sweep) в цвете мессенджера внизу вкладки. Показывается пока WebView грузит страницу (`did-start-loading` / `did-stop-loading`).
- **Новый стейт**: `webviewLoading: { [id]: boolean }` — отслеживает загрузку каждого WebView.
- **Файлы**: `src/App.jsx` (стейт, ref обработчики, MessengerTab), `src/index.css` (@keyframes tabLoading)

### v0.44.2 (6 марта 2026) — Автозагрузка WebView при старте (частичный фикс)
- **Фикс**: WebView не загружались до перехода на вкладку — `display: none` блокирует загрузку `<webview>` в Electron. Заменено на `visibility: hidden` + `zIndex`. **Но `visibility: hidden` тоже может блокировать загрузку** — окончательно исправлено в v0.45.0.
- **Файлы**: `src/App.jsx` (строка рендеринга WebView контейнера)

### v0.44.1 (6 марта 2026) — Фикс дубля ribbon при 2+ аккаунтах + видимая кнопка Прочитано
- **Баг-фикс дублирования**: При свёрнутом окне backup path в main.js создавал второй ribbon с неправильным аккаунтом (findMessengerByUrl возвращал первый из 2+ Telegram). Решение: backup path отключён когда renderer жив (backgroundThrottling: false = renderer работает ВСЕГДА).
- **Кнопка ✓ видима**: Кнопка "Прочитано" теперь ВСЕГДА видна на ribbon (зелёный фон, не только при hover).
- **Файлы**: `main/main.js` (backup path), `main/notification.html` (CSS кнопки)

### v0.44.0 (6 марта 2026) — Кнопка "Прочитано" + превью полного сообщения в ribbon
- **Кнопка "Прочитано"** (✓): Появляется при hover рядом с крестиком. Скрывает ribbon без перехода в чат. IPC: `notif:mark-read`.
- **Раскрытие полного текста**: Клик на ribbon с длинным сообщением (>100 символов) — разворачивает текст полностью. Подсказка "ещё..." показывается когда есть fullBody. При развороте — таймер приостанавливается.
- **Кнопки действий в expanded**: "Перейти к чату" и "Прочитано" — видны в развёрнутом виде.
- **fullBody IPC**: Полный текст сообщения передаётся отдельным полем (body обрезается до 100, fullBody — полный).
- **Динамическая высота**: Окно notification автоматически меняет высоту при expand/collapse через `notif:resize`.
- **Файлы**: `main/notification.html` (UI), `main/preloads/notification.preload.js` (markRead IPC), `main/main.js` (fullBody + mark-read handler), `src/App.jsx` (fullBody в notify)

### v0.43.1 (6 марта 2026) — Фикс дублирования ribbon (Notification + ServiceWorker)
- **Баг-фикс**: Telegram шлёт Notification + ServiceWorker.showNotification на одно сообщение → 2-4 ribbon. Добавлена дедупликация в renderer (`notifDedupRef` с нормализацией body — убираем timestamps перед сравнением).
- **Баг-фикс body**: ServiceWorker body содержит приклеенный timestamp ("Хорошо15:5715:57"). Trailing timestamps удаляются из body перед отображением в ribbon.
- **Усиление дедуп в main.js**: Нормализация body (убираем timestamps) в деduп-ключе.
- **Файлы**: `src/App.jsx` (notifDedupRef + нормализация), `main/main.js` (cleanBody + нормализация дедуп)

### v0.43.0 (6 марта 2026) — Клик на ribbon → навигация к конкретному чату
- **Навигация к чату**: При клике на ribbon-уведомление — не только переключение на вкладку мессенджера, но и автоматическое открытие конкретного чата с отправителем.
- **Notification.tag**: Захват `opts.tag` из Notification API (Telegram использует peer ID). Передаётся через всю IPC-цепочку: `__CC_NOTIF__` → `handleNewMessage` → `app:custom-notify` → `notifItems` → `notify:clicked`.
- **Per-messenger навигация**: `buildChatNavigateScript()` — генерирует JS для клика по чату в DOM. Telegram: `data-peer-id` + fallback по имени. WhatsApp: `span[title]`. VK: `.im_dialog_peer`. MAX: generic class search. Fallback: TreeWalker по тексту.
- **Файлы**: `src/App.jsx` (injection, parser, notify:clicked, buildChatNavigateScript), `main/main.js` (IPC relay senderName/chatTag)

### v0.42.0 (6 марта 2026) — IPC window-state + фикс ложных ribbon при чтении старых
- **IPC window-state**: Main process отправляет `window-state {focused}` по событиям BrowserWindow (focus/blur/minimize/restore/show). Renderer подписывается через `window.api.on('window-state')` и хранит в `windowFocusedRef`. Это 100% надёжный источник состояния окна — не зависит от `document.hidden` (ненадёжен с backgroundThrottling:false) или `document.hasFocus()` (false когда фокус в WebView).
- **Все проверки видимости**: `document.hidden` заменён на `windowFocusedRef.current` в handleNewMessage, page-title-updated sound, unread-count sound, __CC_NOTIF__ log.
- **Backup path**: `!isMinimized() && isVisible()` заменён на `isFocused()` — backup срабатывает только когда окно не в фокусе.
- **Файлы**: `main/main.js` (IPC events + backup path), `src/App.jsx` (windowFocusedRef + все проверки)

### v0.41.3 (6 марта 2026) — Фикс ложных ribbon Telegram при чтении старых
- **Баг-фикс**: При чтении старых непрочитанных в Telegram появлялся ложный ribbon. Причина: `document.hasFocus()` возвращает `false` когда фокус внутри WebView (отдельный browsing context) → isViewingThisTab = false → ribbon не подавлялся. Исправлено: `!document.hidden` вместо `hasFocus()` — корректно отражает видимость окна (true при видимом, false при свёрнутом), не зависит от фокуса в webview.

### v0.41.2 (6 марта 2026) — Фильтр timestamp body
- **Баг-фикс**: MAX шлёт Notification с body = "12:40" (только timestamp). Добавлен фильтр `/^\d{1,2}:\d{2}(:\d{2})?$/` в showCustomNotification и __CC_NOTIF__ handler.
- **Баг-фикс пустого ribbon**: MAX вызывает Notification с body = "12:40" (только timestamp). Добавлен фильтр `/^\d{1,2}:\d{2}(:\d{2})?$/` в showCustomNotification (main.js) и в __CC_NOTIF__ handler (App.jsx).
- **Файлы**: `src/App.jsx` (hasFocus + timestamp filter), `main/main.js` (timestamp filter)

### v0.41.1 (6 марта 2026) — Фикс backup path: ribbon только при свёрнутом окне
- **Баг-фикс**: v0.41.0 не полностью решил ложные ribbon — backup path в main.js дублировал обработку `console-message` и вызывал `showCustomNotification` напрямую, минуя подавление в renderer.
- **Исправление**: Backup path работает ТОЛЬКО при `isMinimized() || !isVisible()`. Если окно видимо — renderer сам обрабатывает.
- **Файлы**: `main/main.js`

### v0.41.0 (6 марта 2026) — Фикс ложных ribbon MAX, preview + бесконечный режим
- **Баг-фикс**: При открытии старого/прочитанного чата в MAX появлялось ложное ribbon-уведомление. Причина: Notification API вызывается MAX при открытии чата → `__CC_NOTIF__` → `handleNewMessage` не подавлял, т.к. `isFromMutationObserver` = false. Исправлено: подавляем ВСЕ уведомления когда пользователь смотрит на эту вкладку (не только MutationObserver).
- **Баг-фикс**: Защита от пустого/невидимого body в `showCustomNotification` (main.js) — фильтр zero-width символов.
- **Preview ribbon**: При изменении ползунка времени показа в настройках показывается тестовое уведомление (debounce 400ms).
- **Бесконечный режим**: Ползунок от 0 до 30. Значение 0 (или <3) = бесконечный режим — ribbon не исчезает, progress bar скрыт, закрывается только вручную (кнопка × или клик).
- **Файлы**: `src/App.jsx` (подавление при просмотре), `main/main.js` (пустой body + override dismissMs), `main/notification.html` (бесконечный режим), `src/components/SettingsPanel.jsx` (preview + UI)

### v0.40.0 (6 марта 2026) — Настраиваемое время показа ribbon-уведомления
- **Новая настройка**: ползунок "Время показа уведомления" в Настройки → Уведомления (3–30 сек, по умолчанию 5 сек)
- **Реализация**: `settings.notifDismissSec` → main.js читает из storage → передаёт `dismissMs` в каждом `notif:show` → notification.html использует динамическую длительность для таймера dismiss и CSS progress-bar анимации
- **Файлы**: `src/components/SettingsPanel.jsx` (ползунок), `main/main.js` (чтение настройки), `main/notification.html` (динамический dismiss)

### v0.39.6 (6 марта 2026) — Обход CSP для notification hook (MAX/SvelteKit)
- **Проблема**: `notifHooked: false` — MAX (SvelteKit) блокирует inline `<script>` injection через Content Security Policy (CSP). Перехват `window.Notification` из monitor.preload.js не срабатывал.
- **Исправление**: Добавлен `executeJavaScript()` fallback в App.jsx dom-ready handler. `executeJavaScript` работает через DevTools protocol и обходит CSP. Запускается через 1.5 сек после dom-ready, повторно инжектит notification hook + Audio mute + findAvatar.
- **Файлы**: `src/App.jsx` (executeJavaScript fallback), `main/main.js` (version bump)
- **Ключевой урок**: CSP блокирует `<script>` tag injection, но `executeJavaScript()` обходит CSP через DevTools protocol

### v0.39.5 (6 марта 2026) — Фикс уведомлений MAX + диагностика + __CC_MSG__ backup
- **Проблема**: Уведомления от Макса не приходили ВООБЩЕ — ни при свёрнутом, ни при развёрнутом окне.
- **Причины**: (1) `isViewingThisTab` подавлял `__CC_NOTIF__` при активной вкладке, (2) MutationObserver `new-message` IPC не достигал main process, (3) backup path работал только при свёрнутом окне.
- **Исправления**:
  - Убрано подавление `isViewingThisTab` для `__CC_NOTIF__` path (если Notification API вызван — это подтверждённое уведомление)
  - Добавлен `__CC_MSG__` канал: MutationObserver дублирует `new-message` через `console.log('__CC_MSG__...')` — доступен main process
  - Backup path в main.js расширен: перехватывает и `__CC_NOTIF__`, и `__CC_MSG__` (работает всегда, не только при свёрнутом)
  - Renderer App.jsx обрабатывает `__CC_MSG__` из console-message (параллельно с ipc-message)
- **Диагностика**: Подробное логирование на каждом этапе цепочки (`[Notif]` prefix в renderer, `[NotifManager]` в main)

### v0.39.4 (6 марта 2026) — Backup notification path при свёрнутом окне
- **Проблема**: Ribbon-уведомления не появлялись, когда mainWindow свёрнуто (minimized). Windows замораживает renderer-процесс, несмотря на `backgroundThrottling: false` — IPC от renderer до main не доходит.
- **Решение**: `app.on('web-contents-created')` — main process напрямую слушает `console-message` на webview webContents. Когда mainWindow свёрнуто/скрыто, main process сам вызывает `showCustomNotification()`, минуя renderer.
- **Принудительное `setBackgroundThrottling(false)`** на каждом webview webContents через `contents.setBackgroundThrottling(false)` (belt & suspenders к HTML-атрибуту).
- **Дедупликация в main process**: `notifDedupMap` в `showCustomNotification()` — один текст от одного мессенджера за 8 сек → skip. Защита от двойных уведомлений (renderer + main backup).
- **URL→messenger mapping**: `findMessengerByUrl()` — определяет мессенджер по hostname webContents URL.

### v0.39.3 (6 марта 2026) — Увеличенный ribbon, дедупликация, фикс фантомных VK
- **Размер ribbon увеличен**: ширина 310→370px, высота элемента 62→76px, аватарка 36→44px, шрифт sender 12→14px, body 11→13px.
- **Фикс фантомных VK**: MutationObserver при переключении чатов менял `getLastMessageText()` → ложное уведомление. Для MutationObserver пути восстановлено подавление `isViewingThisTab`, для Notification API пути — всегда показывать.
- **Дедупликация**: Map `text+messengerId → timestamp`, одинаковый текст за 10 сек → skip.

### v0.39.2 (6 марта 2026) — Фикс фантомных уведомлений MAX, ribbon внизу справа
- **Фантомные уведомления MAX**: ServiceWorker вызывал `showNotification("Макс", {body: ""})` (push-sync). Код фолбечил пустой body на title. Теперь `__CC_NOTIF__` требует непустой `data.b` — title без body игнорируется.
- **Позиция ribbon**: перемещён с "центр справа" на "низ справа" с отступом 8px от краёв.

### v0.39.1 (6 марта 2026) — Фикс ribbon-уведомлений
- **Убрано подавление isViewingThisChat**: звук и ribbon больше не подавляются когда пользователь на вкладке мессенджера. `messengerId` — это ID вкладки, а не конкретного чата; оператор может быть в другом чате того же мессенджера.
- **backgroundColor '#00000000'**: добавлено в BrowserWindow для корректной прозрачности на Windows.
- **Timeout + fallback**: `did-finish-load` ждёт макс 5 сек, при ошибке — fallback на нативное `Notification`.
- **Debug логи**: `[NotifManager]` логирование создания окна, получения IPC, показа уведомления.

### v0.39.0 (6 марта 2026) — Кастомные уведомления Messenger Ribbon
- **Замена нативных уведомлений**: Windows `new Notification()` заменён на кастомное окно **Messenger Ribbon** — вертикальная полоса у правого края экрана.
- **Визуал**: 300px шириной, до 6 элементов по 64px. Каждый: 4px цветная полоска мессенджера слева + аватарка 36x36 + имя отправителя + текст сообщения.
- **Анимация**: slide-in справа (250ms), slide-out при закрытии (200ms). Прогресс-бар 2px снизу, авто-dismiss через 5 сек. Hover ставит таймер на паузу.
- **Клик**: активирует основное окно + переключает на вкладку мессенджера.
- **Стек**: до 6 уведомлений, FIFO при переполнении. Один BrowserWindow, позиция flush-right, вертикально по центру экрана.
- **Архитектура**: `main/notification.html` (HTML+CSS+JS), `main/preloads/notification.preload.js` (contextBridge), NotificationManager в `main/main.js`. IPC: `app:custom-notify`, `notif:click`, `notif:dismiss`, `notif:resize`, `notify:clicked`.
- **Не крадёт фокус**: `showInactive()`, `focusable: false`, `skipTaskbar: true`.

### v0.38.2 (5 марта 2026) — Фикс accountScript MAX: DOM-поиск имени/телефона профиля
- **accountScript MAX переписан**: Новая стратегия извлечения имени профиля — поиск телефона (+7XXXXXXXXXX) рядом с аватаром в карточке профиля, затем input-поля на странице профиля, затем TreeWalker по тексту, fallback на API с Bearer-токеном из `__oneme_auth`.

### v0.38.0 (5 марта 2026) — Имя профиля под вкладкой, полная диагностика, кэш аватарок с TTL
- **Имя профиля под вкладкой**: Восстановлено отображение `accountInfo` (имя/номер телефона) под названием мессенджера во вкладке. Показывается постоянно, а `messagePreview` временно заменяет его на 5 сек при новом сообщении.
- **Полная диагностика**: Новый пункт контекстного меню «Полная диагностика (→ буфер)» — собирает localStorage, sessionStorage, IndexedDB (базы+stores), cookies, DOM-аватарки, статус Notification hook. JSON копируется в буфер обмена для анализа.
- **Кэш аватарок с TTL**: `iconCache` в main.js переведён на TTL (30 мин). Каждые 10 мин setInterval удаляет устаревшие записи. LRU eviction до 50 записей сохранён.
- **Улучшенный findAvatar**: Расширен поиск аватарок в DOM для MAX — добавлены селекторы `[class*="peer"]`, `[class*="contact"]`, `li`, `[class*="avatar"]`, background-image CSS. Fallback: поиск img с class*="avatar" на всей странице.

### v0.37.0 (5 марта 2026) — Улучшенный accountScript MAX + аватарка из DOM чатов
- **accountScript MAX v2**: Переписан — добавлены sessionStorage, cookies, fetch к API endpoints (`/api/me`, `/api/profile`), расширенные DOM-селекторы навигации (aria-label, title).
- **Аватарка из DOM**: Функция `findAvatar(name)` — при уведомлении без icon ищет img-аватарку в списке чатов по имени отправителя. Работает для всех мессенджеров.

### v0.36.0 (5 марта 2026) — Фикс ложных уведомлений, имя профиля MAX, аватарка
- **Ложные уведомления при чтении чата**: `document.hasFocus()` возвращает `false` когда фокус внутри WebView (guest process). Заменён на `!document.hidden` (Page Visibility API) — блокирует уведомления когда окно видимо и пользователь на этой вкладке.
- **Имя профиля MAX**: Добавлен `accountScript` для MAX — ищет имя через localStorage, IndexedDB и DOM-селекторы профиля.
- **Аватарка в уведомлениях**: Расширен перехват Notification — добавлен `opts.image` как fallback. Относительные URL аватарок конвертируются в абсолютные.

### v0.35.0 (5 марта 2026) — Уведомления при свёрнутом окне (backgroundThrottling)
- **Проблема**: Когда окно свёрнуто в трей (`mainWindow.hide()`), Electron замораживает JS в renderer и WebView. MutationObserver, Notification hooks, IPC — всё останавливается. Уведомления не приходят, пока окно не развернуть.
- **Решение**: `backgroundThrottling: false` в трёх местах:
  1. `webPreferences` BrowserWindow (main.js) — предотвращает throttling renderer process
  2. `mainWindow.webContents.backgroundThrottling = false` (runtime) — дополнительная гарантия
  3. `webpreferences="backgroundThrottling=no"` на каждом `<webview>` (App.jsx) — предотвращает throttling WebView мессенджеров
- Теперь уведомления приходят независимо от того, свёрнуто окно или нет.

### v0.34.0 (5 марта 2026) — Фикс счётчика MAX, ложные уведомления, диагностика DOM
- **Счётчик MAX**: Переписан `countUnreadMAX()` — 3-уровневый подход: title `(N)` → навигационный бейдж "Все" → отдельные бейджи чатов. Исключены ложные дубли из nav-элементов.
- **Ложные уведомления**: При пометке чата "непрочитанным" MAX вызывает `Notification()`, что создавало фейковое уведомление. Добавлен `if (document.hasFocus() && activeIdRef.current === messengerId) return` — уведомления блокируются, если пользователь смотрит на этот мессенджер.
- **Диагностика DOM**: Кнопка "Диагностика DOM" в контекстном меню не работала — `executeJavaScript()` выполняется в main world, а `runDiagnostics` живёт в preload isolated world. Заменено на IPC: `webview.send('run-diagnostics')` → `ipcRenderer.on('run-diagnostics')` в preload.

### v0.33.2 (5 марта 2026) — Фикс счётчика непрочитанных MAX (3 вместо 1)
- **Проблема**: Generic селекторы `[class*="badge"]` ловили ВСЕ бейджи на странице MAX — в списке чатов, в меню навигации, в иконках вкладок. 1 чат + "Все" + "Новые" = показывало 3.
- **Решение**: Отдельная функция `countUnreadMAX()` — приоритет на title parsing `(N)`, fallback на бейджи ТОЛЬКО внутри контейнера списка чатов.

### v0.33.1 (5 марта 2026) — Убраны подписи под вкладками + фикс баннера VK
- **Убраны подписи accountInfo** (БНК, MAX и т.д.) из-под имён вкладок — только превью нового сообщения (5 сек) остаётся.
- **Баннер VK "Ваш браузер устарел"**: Усилен CSS + JS скрытие — добавлены доп. селекторы, MutationObserver для динамически появляющихся баннеров, увеличен лимит элементов, убрана проверка `offsetHeight < 200`.

### v0.33.0 (5 марта 2026) — Фикс уведомлений MAX, иконка закрепа, ширина вкладок
- **Фикс уведомлений MAX**: MAX (web.max.ru) использует ServiceWorker `showNotification()` вместо `new Notification()`. Добавлен перехват `ServiceWorkerRegistration.prototype.showNotification` в monitor.preload.js — теперь title, body и icon извлекаются корректно.
- **Иконка закрепления 📌**: Постоянно видна рядом с именем мессенджера (не только при hover). Убрана отдельная 🔒 при hover для pinned вкладок.
- **Одинаковая ширина вкладок**: `min-width: 130px` + `justify-center` — все вкладки одинаковой ширины независимо от длины имени.

### v0.32.0 (5 марта 2026) — Закрепление вкладок (pin/lock)
- **Закрепление**: ПКМ на вкладке → «Закрепить вкладку» → вкладка становится защищённой от случайного закрытия.
- **Визуал**: при hover на закреплённой вкладке вместо × показывается иконка 🔒 в цвете мессенджера.
- **Контекстное меню**: «Закрепить/Открепить вкладку» (📌/🔒). Для закреплённых — пункт «Закрыть вкладку» скрыт.
- **Ctrl+W**: игнорируется для закреплённых вкладок.
- **Сохранение**: `settings.pinnedTabs` — объект `{ [id]: true }`, сохраняется через `settings:save` (persist между сессиями).

### v0.31.0 (5 марта 2026) — Диалог подтверждения перед закрытием вкладки
- **Проблема**: Случайный клик по × мгновенно удалял вкладку мессенджера, сбрасывая сессию авторизации (пользователю нужно заново входить).
- **Решение**: Добавлен модальный диалог подтверждения «Закрыть вкладку?» в стиле приложения. Показывает имя и эмодзи мессенджера, предупреждает о возможном сбросе сессии. Кнопки «Отмена» (autoFocus) и «Закрыть» (красная).
- **3 точки входа**: кнопка × на вкладке, Ctrl+W, пункт «Закрыть вкладку» в контекстном меню — все теперь проходят через диалог подтверждения.
- Закрытие диалога: клик по фону, Escape, кнопка «Отмена».

### v0.30.1 (5 марта 2026) — Только настроенные мессенджеры + убрана секция иконок
- **POPULAR_MESSENGERS**: оставлены только 4 мессенджера с полной поддержкой мониторинга — Telegram, WhatsApp, ВКонтакте, Макс. Убраны Авито, Wildberries, Ozon, Instagram, Discord, Viber, Одноклассники, Slack, Zoom.
- **Убрана секция "Иконка"** из модального окна добавления мессенджера — не нужна для работы.

### v0.30.0 (5 марта 2026) — Подавление уведомлений при активном чате + мессенджер Макс
- **Фикс ложных уведомлений**: Если окно в фокусе И пользователь смотрит на вкладку мессенджера — звук и Windows-уведомление НЕ показываются. `document.hasFocus() && activeIdRef.current === messengerId`. Проверка добавлена в 3 местах: `handleNewMessage`, `page-title-updated`, `ipc-message unread-count`.
- **Мессенджер Макс**: Добавлен в DEFAULT_MESSENGERS (url: `https://web.max.ru/`, partition: `persist:max`, color: `#2688EB`, emoji: 💎). Добавлен в POPULAR_MESSENGERS. Уникальный звук уведомления (G5+C6 triangle). Generic DOM-селекторы в monitor.preload.js + title fallback.

### v0.29.2 (5 марта 2026) — Фикс заголовка уведомлений Windows (AppUserModelId)
- **Корень проблемы**: на Windows заголовок тостовых уведомлений берётся из `AppUserModelId`, а НЕ из `app.setName()`. По умолчанию Electron ставит `"electron.app.Electron"`.
- **Решение**: добавлен `app.setAppUserModelId('ЦентрЧатов')` в самом начале `main.js` — теперь все нативные уведомления показывают "ЦентрЧатов".

### v0.29.1 (5 марта 2026) — Ранняя script injection + фикс фантомных сообщений
- **Фикс "electron.app.Electron" (ОКОНЧАТЕЛЬНЫЙ)**: Перехват `window.Notification` перенесён из `executeJavaScript` в dom-ready → в `monitor.preload.js` через ранний `<script>` tag injection при document_start. Скрипт выполняется в main world ДО скриптов мессенджера — VK не может вызвать нативный `new Notification()`.
- **app.setName('ЦентрЧатов')**: fallback — если уведомление всё же просочится, заголовок будет "ЦентрЧатов" а не "electron.app.Electron".
- **Фикс фантомных сообщений (ОКОНЧАТЕЛЬНЫЙ)**: `lastActiveMessageText` инициализируется текущим текстом DOM при `monitorReady = true`. Плюс warm-up для `ipc-message` `new-message` (не только `__CC_NOTIF__`).

### v0.29.0 (5 марта 2026) — Блокировка нативных уведомлений + warm-up
- **Фикс "electron.app.Electron"**: заблокирован permission `notifications` на уровне Electron session (`setPermissionRequestHandler`). Нативные `new Notification()` из мессенджеров больше не показываются — все уведомления идут через наш перехват `executeJavaScript` → `console-message` → `app:notify`.
- **Фикс фантомных уведомлений**: добавлен warm-up 10 сек после `dom-ready` — `__CC_NOTIF__` сообщения игнорируются пока страница не прогреется. VK и другие мессенджеры воспроизводят старые/кешированные уведомления при загрузке.

### v0.28.1 (5 марта 2026) — Фикс сброса счётчика непрочитанных
- **Баг**: при переключении вкладок счётчик непрочитанных обнулялся из-за `setUnreadCounts({[id]: 0})` в `handleTabClick`.
- **Фикс**: убрано принудительное обнуление. Реальный счётчик обновляется через `page-title-updated` и `unread-count` IPC от MutationObserver.

### v0.28.0 (5 марта 2026) — Имя отправителя и аватарка в уведомлениях
- **Имя отправителя**: из `Notification.title` (VK передаёт имя контакта). Показывается в уведомлении как `"ВКонтакте — Елена Дугина"` и в статусбаре.
- **Аватарка контакта**: из `Notification.icon` (URL). Скачивается в main-процессе через `downloadIcon()` с кешем (до 50 записей). Передаётся в `Notification.icon` как `nativeImage`.
- **Расширение handleNewMessage**: принимает `extra: { senderName, iconUrl }` из перехваченного Notification.

### v0.27.0 (5 марта 2026) — Перехват Notification/Audio через executeJavaScript + console-message
- **Фикс "electron.app.Electron" в уведомлениях**: window.Notification перехватывается через `webview.executeJavaScript()` (main world) → `console.log('__CC_NOTIF__...')` → `console-message` event на `<webview>`. Решает проблему context isolation — preload world и main world изолированы.
- **Убран двойной звук уведомлений**: `window.Audio` конструктор перехвачен в main world — `volume = 0` для всех программных звуков мессенджера. Остаётся только наш звук через Web Audio API.
- **Рефакторинг handleNewMessage**: логика обработки нового сообщения вынесена из inline ipc-message handler в отдельную функцию `handleNewMessage(messengerId, text)`. Используется и для `ipc-message`, и для `console-message`.

### v0.25.0 (5 марта 2026) — Per-messenger звук, убрана дублирующая секция ИИ из настроек
- **Per-messenger звук**: каждый мессенджер имеет свой переключатель звука 🔔/🔇 в Настройки → Мессенджеры. Хранится в `settings.mutedMessengers: {[id]: true}`. Если замьючен — нет звука И нет Windows-уведомления от этого мессенджера.
- **Тест звука**: кнопка "🔊 Тест" рядом с каждым мессенджером — воспроизводит двухтональный звук уведомления, чтобы пользователь оценил громкость.
- **Убрана секция "ИИ-помощник" из SettingsPanel**: провайдер/модель/API-ключ дублировали настройки в AISidebar (⚙️). Оставлены только в AISidebar.
- **Обновлена версия в "О программе"**: теперь отображает актуальную v0.25.0.

### v0.26.2 (5 марта 2026) — Фикс перехвата Notification (main world injection)
- **ПРОБЛЕМА**: VK уведомления показывали "electron.app.Electron" + текст не того сообщения. Причина: preload работает в изолированном контексте (context isolation) — override `window.Notification` в preload-мире НЕ затрагивает основной мир страницы, где VK вызывает `new Notification()`.
- **Фикс**: инжекция `<script>` тега в основной мир страницы через `document.createElement('script')`. Скрипт подменяет `Notification` → подавляет нативное уведомление → отправляет `CustomEvent('__cc_notification')`. Preload слушает этот event и шлёт `ipcRenderer.sendToHost('new-message')`.
- Результат: нет "electron.app.Electron", уведомление показывает правильное имя мессенджера.

### v0.26.1 (5 марта 2026) — Скрытие баннера "браузер устарел" VK
- **ПРОБЛЕМА**: VK показывает внизу баннер "Ваш браузер устарел. Обновите его..." — Electron WebView определяется как устаревший Chrome.
- **Фикс 1**: обновлён `CHROME_UA` в main.js с Chrome/130 → Chrome/131 — VK менее вероятно покажет баннер.
- **Фикс 2**: CSS-инъекция в `dom-ready` WebView — скрывает элементы `.BrowserUpdateLayer`, `[class*="BrowserUpdate"]` и др.
- **Фикс 3**: JS-инъекция — ищет и скрывает элементы с текстом "браузер устарел" (fallback для inline-стилей VK).

### v0.26.0 (5 марта 2026) — Фикс VK-уведомлений, детекция сообщений в активном чате
- **ПРОБЛЕМА**: VK не присылал Windows-уведомления. Причина: `new-message` IPC срабатывал ТОЛЬКО при росте unread-счётчика. Если чат открыт — VK не считает сообщение непрочитанным → счётчик не растёт → нет уведомления. Плюс VK-селекторы для DOM устарели.
- **Детекция в активном чате**: новый Path 2 в `sendUpdate()` — проверяет текст последнего входящего сообщения, даже если счётчик не изменился. Cooldown 3 сек от ложных срабатываний при прокрутке.
- **Обновлены VK-селекторы**: добавлены `.vkuiCounter`, `.ConversationItem__unread`, `.im_nav_badge`, `.im-mess--in`, `.im-mess--text` для текущего VKUI (2024–2026).
- **Title fallback для VK/WhatsApp**: если DOM-селекторы не нашли бейджей — парсим `(N)` из `document.title`.
- **Диагностика всех мессенджеров**: `runDiagnostics()` теперь работает для VK/WhatsApp (не только Telegram). Показывает найденные селекторы, счётчики, тексты.
- **Звук через page-title-updated и unread-count** (из v0.25.2): все 3 пути обновления счётчика теперь играют звук при увеличении.

### v0.25.2 (5 марта 2026) — Фикс: звук при увеличении счётчика через все пути
- **БАГ**: звук НЕ воспроизводился при получении уведомлений. Причина: 3 пути обновления счётчика (`messenger:badge`, `page-title-updated`, `unread-count`), но звук играл ТОЛЬКО в `messenger:badge`. Telegram Web обновляет title → `page-title-updated` → счётчик растёт без звука.
- **Фикс**: добавлена проверка `count > prev` + `playNotificationSound(color)` во все 3 пути обновления счётчика.

### v0.25.1 (5 марта 2026) — Уникальная тональность звука для каждого мессенджера
- **Уникальные звуки по цвету мессенджера**: каждый мессенджер теперь имеет свой двухнотный звук уведомления, определяемый по его цвету. Telegram — яркий восходящий (C6+E6), WhatsApp — тёплый (G5+D6), VK — мягкий triangle (E5+A5). Всего 9 предустановок для популярных мессенджеров.
- **Фоллбэк для кастомных мессенджеров**: если цвет не в предустановках — частоты и тип осциллятора генерируются из хэша цвета. Каждый цвет = уникальный звук.
- **Кнопка "Тест" воспроизводит звук конкретного мессенджера**: теперь тестовый звук соответствует тональности мессенджера, а не играет один и тот же звук для всех.
- **Бейдж-событие `messenger:badge`** тоже проверяет mute + играет правильный звук мессенджера.

### v0.24.0 (5 марта 2026) — Улучшенный звук, автопереключение вкладки
- **Улучшенный звук уведомления**: вместо одного тона (880 Hz, 0.2 сек) — двухтональный приятный звук (C6 1047 Hz + E6 1319 Hz, 0.23 сек). Звучит как мессенджер-нотификация.
- **Автопереключение на вкладку с новым сообщением**: при получении `new-message` IPC вкладка автоматически переключается на мессенджер-источник. Отключаемо через toggle в Настройки → Уведомления → "Автопереключение на новое сообщение". По умолчанию **выключено** (`autoSwitchOnMessage: false`).

### v0.23.0 (5 марта 2026) — 5 фич: page-title-updated, статус монитора, контекстное меню, statusbar msg
- **page-title-updated**: WebView event ловит изменение `document.title` → мгновенное обновление счётчика непрочитанных без задержки MutationObserver. Работает для Telegram `(26) Telegram Web`.
- **Цветовая индикация статуса мониторинга**: точка на вкладке теперь 🟢 зелёная (монитор активен), 🟡 жёлтая (загрузка, первые 20 сек), 🔴 красная (монитор не отвечает). Тултип поясняет статус.
- **Контекстное меню вкладки** (ПКМ): 🔄 Перезагрузить (reload WebView + сброс монитора), 🔍 Диагностика DOM (повторный запуск), 📋 Копировать URL, ✕ Закрыть.
- **Последнее сообщение в статусбаре**: вместо диагностики — `💬 Telegram: Какой отдачи от...` (исчезает через 8 сек). Диагностика убрана из статусбара, доступна через контекстное меню + console.log.
- **monitorStatus state**: `{[id]: 'loading'|'active'|'error'}` — отслеживает состояние мониторинга каждой вкладки.

### v0.22.0 (5 марта 2026) — Диагностика DOM + адаптивный поиск folder-tab badges
- **ПРОБЛЕМА**: v0.21.0 использовал жёсткие селекторы (`.tabs-tab`), которые не находят folder tabs в вертикальном layout'е Telegram Web K → бейдж = 0.
- **Диагностический IPC `monitor-diag`**: через 15 сек после загрузки WebView отправляет в renderer полный отчёт о DOM:
  - `document.title` и результат regex `\((\d+)\)`
  - Кол-во элементов по каждому селектору (`.tabs-tab`, `.menu-horizontal-div-item`, `.sidebar-tools-button`)
  - ВСЕ `.badge` элементы с их классами и родителями, разделённые на `inChatlist` и `folderBadges`
- **Адаптивный поиск (шаг 3)**: `.badge` элементы НЕ внутри `.chatlist-chat` = folder tab badges. Первый = "Все чаты".
- **4 уровня fallback**: title → tab selectors → adaptive badges → chatlist sum
- **Отображение в статусбаре**: 🔍-блок с source, title#, folder badges. Полная информация в tooltip.
- **countSource**: каждый вызов `countUnreadTelegram()` запоминает откуда взял число (для диагностики).

### v0.21.0 (4 марта 2026) — Фикс счётчика: читаем Telegram's own counter (title/folder tabs)
- **КОРНЕВАЯ ПРИЧИНА**: persistent Map суммировала бейджи КАЖДОГО чата (включая каналы с 9.4K, 3.4K) → выдавала 1796 вместо правильных 26. Telegram показывает "26" в "Все чаты" — это верная цифра.
- **Решение**: `countUnreadTelegram()` полностью переписан. Убрана persistent Map (`knownDialogs`). Теперь 3 источника (по приоритету):
  1. `document.title` — Telegram пишет `(26) Telegram Web` → парсим regex `\((\d+)\)`
  2. Первый `.tabs-tab .badge` — бейдж "Все чаты" folder tab
  3. Fallback: `.badge.badge-unread` (старый подсчёт для крайних случаев)
- **Split personal/channels**: читаем бейдж из folder tab "Личные" (если есть), остальное = channels.

### v0.20.0 (4 марта 2026) — Фикс виртуализации счётчика Telegram, анимация бейджа, тултип
- **КОРНЕВАЯ ПРИЧИНА скачков счётчика (594→1435→2918)**: Telegram Web K использует виртуализацию — в DOM находятся только видимые диалоги (~20 штук). `querySelectorAll('.badge')` считает только текущие бейджи. При скролле в DOM появляются новые диалоги (каналы с 2.3K, 3.9K) → сумма скачет.
- **Решение**: `countUnreadTelegram()` с persistent `Map<peerId, {count, isMuted, chatType}>`. Каждый диалог отслеживается по `data-peer-id` — Map только пополняется, не сбрасывается. Сумма стабильна.
- **Debounce 300ms** в MutationObserver: при скролле DOM меняется сотни раз в секунду → теперь пересчёт не чаще 3 раз/сек.
- **Анимация бейджа**: `@keyframes badgePulse` (scale 1→1.35→0.92→1, 0.4s) при росте `unreadCount`. Трекинг через `prevCountRef`.
- **Тултип бейджа**: наведение на бейдж показывает `Непрочитанных: N\n💬 Личные: X\n📢 Каналы/группы: Y`.
- **Убран бейдж трея**: `tray:set-badge` отключён — по запросу пользователя ("в правом углу не надо кол-во непрочитанных").

### v0.19.6 (4 марта 2026) — Бейдж в flex-потоке (не перекрывает название)
- **КОРНЕВАЯ ПРИЧИНА**: бейдж с `absolute top-1 right-1` перекрывал текст названия вкладки ("99+" налезал на "Telegram"). Увеличение padding не помогало — бейдж "99+" слишком широкий.
- **Решение**: бейдж перенесён из `absolute` в flex-поток (`ml-auto shrink-0`). Вкладка автоматически расширяется под бейдж. Крестик закрытия тоже в потоке — показывается вместо бейджа при hover.
- Убран `min-w-[90px]` и `pr-6` — больше не нужны (бейдж сам расширяет вкладку).

### v0.19.5 (4 марта 2026) — Фикс: бейдж непрочитанных учитывает muted-чаты
- **КОРНЕВАЯ ПРИЧИНА**: `countUnread()` в monitor.preload.js фильтровал бейджи muted-диалогов. Если ВСЕ чаты с непрочитанными приглушены — счётчик = 0, бейдж на вкладке пропадал.
- **Решение**: `countUnread()` теперь возвращает `allTotal` (все непрочитанные, включая muted) + `total` (без muted). Бейдж на вкладке (`unread-count`) использует `allTotal`. Уведомления (`new-message`) по-прежнему фильтруют muted.
- **Расширение вкладок** (из v0.19.4): `pl-3 pr-6 min-w-[90px]` — бейдж и крестик больше не перекрывают логотип.

### v0.19.4 (4 марта 2026) — Расширение вкладок мессенджеров (фикс перекрытия бейджа)
- **Фикс перекрытия**: бейдж непрочитанных и крестик закрытия перекрывали логотип "ЦентрЧатов" из-за узкой вкладки.
- **Решение**: `px-3` → `pl-3 pr-6` (правый отступ 24px для бейджа) + `min-w-[90px]` (минимальная ширина вкладки).

### v0.19.3 (4 марта 2026) — Центрирование имени аккаунта, зум-бейдж на вкладке
- **Центрирование имени аккаунта**: `items-start` → `items-center` в MessengerTab — название мессенджера и подпись аккаунта теперь выровнены по центру вкладки.
- **Зум-бейдж**: рядом с названием мессенджера отображается бейдж `75%` когда масштаб ≠ 100% (цвет мессенджера, прозрачный фон).

### v0.19.2 (4 марта 2026) — Полный фикс accountScript Telegram (без DOM)
- **КОРНЕВАЯ ПРИЧИНА**: в обычном виде Telegram Web K НЕТ элемента с `data-peer-id` в sidebar-header — он появляется только на странице Настроек. Все DOM-селекторы были бесполезны.
- **Новый подход**: полностью без DOM. Открываем IndexedDB → перебираем ВСЕ записи в `users` store через cursor → находим запись с `pFlags.self === true` (так TG Web K помечает аккаунт пользователя) → возвращаем имя или телефон.
- **Fallback на телефон**: если `first_name` пустое, возвращаем `+phone`.

### v0.19.1 (4 марта 2026) — Фикс зума WebView, фикс accountScript, плавная анимация
- **ФИКС: Ctrl+колёсико и Ctrl+клавиши зума**: перенесены в `monitor.preload.js` (WebView захватывает все события мыши/клавиатуры, обработчики в renderer не работали)
- **Новые IPC каналы**: `zoom-change` (delta:±5/±10) и `zoom-reset` из preload → App.jsx
- **Плавная анимация зума**: `animateZoom()` — 6 кадров с ease-out квадратичным
- **Более надёжный accountScript Telegram**: множественные DOM-селекторы + fallback на `user_auth` из localStorage + fallback DB-имена (`tweb`, `tweb-0`, `tweb-1`) + проверка `firstName`/`lastName` (camelCase) + fallback на номер телефона (`+user.phone`)
- **Очистка accountScript при загрузке**: для дефолтных мессенджеров ВСЕГДА берём accountScript из `DEFAULT_MESSENGERS` (не из store) — гарантирует использование актуального скрипта
- **Индикатор зума на вкладке**: ярче (9px, font-bold, цвет мессенджера)
- **Рефакторинг**: `saveZoomLevels()` — вынесена общая логика сохранения зума с дебаунсом

### v0.19.0 (4 марта 2026) — Имя аккаунта Telegram (IndexedDB), индикатор зума, Ctrl+колёсико
- **accountScript Telegram через IndexedDB**: читает peer ID из DOM → находит user record в IndexedDB → возвращает first_name + last_name. Работает надёжно, не зависит от открытого чата.
- **Индикатор зума на вкладке**: если зум ≠ 100%, рядом с именем мессенджера показывается бейдж `75%`
- **Ctrl+колёсико**: wheel на webview с зажатым Ctrl → зум ±5%
- **Горячие клавиши зума**: Ctrl+= (+10%), Ctrl+- (-10%), Ctrl+0 (сброс)

### v0.18.2 (4 марта 2026) — Окончательный фикс "Автолиберти"
- **Корневая причина**: `messengers:save` записывал `accountScript` в electron-store. Удаление из `constants.js` не помогало — скрипт выживал в сохранённых данных.
- **Фикс**: `tryExtractAccount` теперь берёт `accountScript` ТОЛЬКО из `DEFAULT_MESSENGERS` для дефолтных мессенджеров. При загрузке чистит устаревший `accountScript` из store.

### v0.18.1 (4 марта 2026) — Сохранение зума, фикс кэша accountInfo Telegram
- **Сохранение зума**: `zoomLevels` сохраняется в settings, загружается при старте
- **Фикс кэша**: принудительная очистка `accountInfo` при старте для мессенджеров без `accountScript`

### v0.18.0 (4 марта 2026) — Зум вкладок, тултипы статус-бара, фикс имени аккаунта Telegram
- **Зум per-tab**: контролы −/+/% в нижней строке, шаг 5%, диапазон 25–200%, сброс ↺, ввод вручную, каждая вкладка своя
- **Тултипы статус-бара**: `title` атрибуты на каждой статистике (💬 сегодня, ⚡ авто, 📊 всего, 📥 непрочитано)
- **Фикс Telegram accountScript**: удалён accountScript из Telegram (все селекторы давали имя открытого чата вместо аккаунта — надёжного DOM-пути нет)

### v0.17.0 (4 марта 2026) — Раздельный счётчик, превью в вкладке, умный фильтр каналов
- `src/constants.js`:
  - **Фикс "Автолиберти"**: убран `.chat-info .peer-title` из accountScript Telegram — это название открытого чата, а не аккаунта. Теперь используются только `.user-title`, `.profile-title`, `.sidebar-left-section-header .peer-title`.
- `main/preloads/monitor.preload.js`:
  - **`getChatType(dialogEl)`**: определяет тип диалога (personal/channel/group) по `data-peer-type` атрибуту или DOM-иконкам.
  - **`isActiveChatChannel(type)`**: возвращает true если открытый чат — канал или группа. Используется для умного фильтра.
  - **`countUnread` теперь возвращает `{personal, channels, total}`**: раздельный подсчёт. Для Telegram каждый бейдж относится к personal/channel/group.
  - **`unread-split` IPC**: новый канал, отправляет `{personal, channels}` в App.jsx.
  - **Умный фильтр**: `new-message` не отправляется если открытый чат — канал или группа (только личные).
- `src/App.jsx`:
  - **`unreadSplit` state** + обработчик `unread-split` IPC.
  - **`messagePreview` state** + `previewTimers` ref: при `new-message` бейдж вкладки показывает "💬 первые 32 символа..." 5 секунд, потом сбрасывается.
  - **MessengerTab**: получает `unreadSplit` и `messagePreview`. Если личных И каналов > 0 → два бейджа (💬N цвет мессенджера + 📢N серый). Subtitle показывает превью (цвет мессенджера) вместо accountInfo пока есть превью.

### v0.16.1 (4 марта 2026) — Уведомления с текстом, фильтр muted-чатов
- `src/App.jsx`:
  - **Notify из new-message вместо unread-count**: уведомление и звук теперь срабатывают только при `new-message` (конкретный текст от монитора), а не при любом изменении счётчика. Тело уведомления = первые 100 символов сообщения. `unread-count` теперь только обновляет бейдж — без звука и notify.
- `main/preloads/monitor.preload.js`:
  - **`isBadgeInMutedDialog(el, type)`**: проверяет через `el.closest(...)` находится ли бейдж внутри приглушённого диалога (класс `.is-muted`, иконки `.icon-mute/.icon-muted/[data-icon="mute"]`). Поддерживает Telegram Web K и A.
  - **`isActiveChatMuted(type)`**: проверяет является ли текущий открытый чат приглушённым — ищет `.chatlist-chat.active.is-muted` и иконки muted. Если да — `new-message` не отправляется.
  - **`countUnread` с фильтром muted**: бейджи внутри muted-диалогов исключаются из суммы непрочитанных.

### v0.16.0 (4 марта 2026) — Чистый layout AI-панели, фикс монитора (cooldown)
- `src/components/AISidebar.jsx`:
  - **Layout cleanup**: убрана иконка 🔧/🌐 режима с кнопок провайдеров (занимала место, была лишней — режим виден в настройках). Кнопка 🔄 перемещена из ряда провайдеров в шапку (рядом с ⚙️), для экономии пространства в узкой панели.
- `main/preloads/monitor.preload.js`:
  - **Фикс "старые сообщения как новые"**: добавлен `monitorReady = false` → через 10 секунд становится `true`. Событие `new-message` генерируется только когда `monitorReady === true`. Предотвращает срабатывание на сообщения, уже присутствующие в DOM при загрузке страницы Telegram/WhatsApp/VK.

### v0.15.0 (4 марта 2026) — Tooltip провайдера, кнопка 🔄, часовая проверка, секция Диагностика
- `src/components/AISidebar.jsx`:
  - **Tooltip на ●**: при наведении на цветную точку статуса провайдера появляется всплывающая подсказка "✓ Работает · 14:32" или "✗ Ошибка · 14:32". State `providerCheckTimes {pid: 'HH:MM'}`. State `hoveredStatus` (pid | null).
  - **Кнопка 🔄**: ручной запуск проверки всех провайдеров. Показывает ⏳ пока идёт проверка (`refreshing` state). Находится в ряду с "+ ИИ".
  - **Часовая фоновая проверка**: `setInterval(() => runChecksRef.current('hourly'), 60*60*1000)` в отдельном useEffect. Работает тихо в фоне.
  - **Рефакторинг**: вся логика проверки вынесена в `runProviderChecks(source)`. `settingsRef` + `runChecksRef` — решение stale closure. startup/hourly оба используют `runChecksRef.current()`.
- `src/components/SettingsPanel.jsx`:
  - **Секция Диагностика**: кнопка "📋 Загрузить лог ошибок" + кнопка "🗑 Очистить". Показывает последние 30 строк `ai-errors.log`. Цвет строк: startup/hourly — dimmer, прочие — обычные.
- `main/main.js`:
  - **`ai:clear-error-log`**: IPC хендлер — перезаписывает лог пустым файлом.

### v0.14.0 (4 марта 2026) — Кнопка пополнить счёт, лог ошибок API, авто-проверка при запуске
- `src/components/AISidebar.jsx`:
  - **Кнопка "💳 Пополнить счёт"**: если ошибка связана с балансом (`isBillingError()` — ищет "средств/баланс/balance/insufficient"), в блоке ошибки появляется кнопка, открывающая страницу биллинга провайдера. Константа `BILLING_URLS` содержит URL биллинга для всех 4 провайдеров.
  - **Авто-проверка при запуске**: `useEffect([], [])` — через 2 сек после монтировании проверяет все подключённые API-провайдеры в фоне. Результат → `providerStatuses` (зелёный/красный ● на кнопке провайдера). Ошибки пишутся в лог с меткой `[startup]`.
  - **Логирование ошибок**: при любой ошибке `testConnection` или стриминга вызывается `ai:log-error` IPC
- `main/main.js`:
  - **`ai:log-error`** IPC хендлер — дописывает строку в `userData/ai-errors.log` (дата, провайдер, текст ошибки)
  - **`ai:get-error-log`** IPC хендлер — читает и возвращает весь лог (для будущего UI)

### v0.13.1 (4 марта 2026) — Фикс: реальная ошибка testConnection отображается в настройках
- `src/components/AISidebar.jsx` — после кнопки "Проверить соединение" при ошибке теперь показывается блок `⚠️ {error}` с реальным текстом от `ruError()`. Это важно когда ошибка не "неверный ключ", а "недостаточно средств" — раньше обе ошибки показывались одинаково как "Ошибка — проверьте ключ". Текст кнопки упрощён до `'✗ Ошибка'` (нейтральный). Добавлено в обоих местах: обычные провайдеры и ГигаЧат.

### v0.13.0 (4 марта 2026) — Анимация настроек, нумерованные шаги, статус провайдера, кнопка "Готово"
- `src/components/AISidebar.jsx` — 4 улучшения UX:
  1. **Анимация** панели ⚙️: `max-height` CSS-переход 0→520px (0.25s ease-in-out) вместо моментального показа/скрытия. Контент всегда в DOM, анимация через `overflow:hidden`.
  2. **Нумерованные шаги** в API-настройках: новый компонент `StepRow` с цветными кружками (синий номер / зелёная галочка если шаг выполнен). Шаги: 1.Зарегистрируйтесь → 2.Выберите модель → 3.Вставьте ключ → 4.Проверьте соединение.
  3. **Статус-индикатор** на кнопках провайдеров: `providerStatuses` state `{pid: 'ok'|'fail'}`. Зелёная `●` при успешном запросе, красная `●` при ошибке. Обновляется в `generateStreaming()` и `testConnection()`.
  4. **Кнопка "✓ Готово — закрыть настройки"** внизу панели ⚙️ — голубая, при клике `setShowConfig(false)`.

### v0.12.1 (4 марта 2026) — Фикс: настройки скрывают тело чата, исправлен баннер
- `src/components/AISidebar.jsx` — добавлено `!showConfig` в условие рендера тела API-режима и WebView-режима: когда ⚙️ открыта — тело чата и WebView полностью скрыты, только настройки. Исправлен текст info-баннера: теперь корректно упоминает оба варианта (API-ключ и Веб-интерфейс)

### v0.12.0 (4 марта 2026) — Per-provider режимы API/WebView в настройках каждого ИИ
- `src/components/AISidebar.jsx` — убраны: `[🔧 API] [🌐 Веб]` из шапки, кнопка `✏️ Свой URL`. Вместо этого: в ⚙️ каждого провайдера появился выбор режима `[🔧 API-ключ]` / `[🌐 Веб-интерфейс]`. Если API — показывает ключ/модель/промпт. Если Веб — показывает URL поле + разрешения на чтение чата. Каждый провайдер настраивается независимо через `aiProviderKeys[pid].mode/webviewUrl/contextMode`
- Новая функция `setProviderProp(key, val)` — сохраняет mode/webviewUrl/contextMode только в per-provider хранилище
- Обновлена `getProviderCfg` — возвращает mode, webviewUrl, contextMode из per-provider настроек
- Обновлена `isProviderConnected` — webview режим всегда считается "подключённым"
- Исправлен `switchProvider` — теперь сохраняет mode/webviewUrl/contextMode при переключении
- ⚙️ теперь всегда видна (не только когда провайдер настроен)
- На кнопках провайдеров: иконка режима 🔧 (API) или 🌐 (Веб)
- WebView режим: компактная нижняя панель — иконка контекста + кнопка "📤 Отправить в AI"
- Добавлена константа `DEFAULT_WEBVIEW_URLS` с URL по умолчанию для каждого провайдера

### v0.11.0 (4 марта 2026) — AI WebView режим + разрешения на чтение чата
- `src/components/AISidebar.jsx` — переключатель режима `🔧 API` / `🌐 Веб` в шапке панели; в режиме WebView: пресеты AI-сервисов (ГигаЧат/ChatGPT/Claude/DeepSeek) + поле для своего URL; `<webview partition="persist:ai-webview">` с выбранным AI; панель разрешений на чтение чата (🔇Ничего / 💬Последнее / 📖История); кнопка "Отправить контекст в AI" — пробует `executeJavaScript` с несколькими CSS-селекторами, fallback — копирует в буфер (`Ctrl+V`)
- Новые settings: `aiMode` ('api'|'webview'), `aiWebviewUrl` (URL AI-сайта), `aiContextMode` ('none'|'last'|'full')

### v0.10.0 (4 марта 2026) — SSE-стриминг AI, черновик по вкладке, бейдж трея
- `main/main.js` — пиксельный 3×5 шрифт (`PIXEL_FONT`), `createTrayBadgeIcon(count)`: рисует 32×32 иконку с красным бейджем-счётчиком; `tray:set-badge` IPC-хендлер; `ai:generate-stream` IPC-listener (SSE для OpenAI/Anthropic/DeepSeek, fallback для ГигаЧат); `pipeSSE()` — парсер SSE-потока
- `src/components/AISidebar.jsx` — `generateStreaming()` через `ipcMain.on`/`window.api.send`; `isStreaming`/`streamBuffer` state; анимация нарастающего текста с курсором ▌; автосохранение черновика в `localStorage` по ключу `ai-draft:{messengerId}`; загрузка черновика при смене вкладки; cleanup стрим-подписок при unmount
- `src/App.jsx` — `activeMessengerId={activeId}` в AISidebar; `useEffect` для `totalUnread → tray:set-badge`

### v0.9.4 (3 марта 2026) — Фикс ресайзера, перевод ошибок API, npm start
- `src/App.jsx` — фикс ресайзера AI-панели: `isResizing` state + прозрачный overlay поверх WebView во время drag (WebView поглощал mousemove events); ресайзер стал шире (6px вместо 4px); подсветка синим во время drag
- `main/main.js` — `ruError()` — перевод типовых API-ошибок на русский (quota, balance, rate limit, invalid key, model not found, auth, billing, overload, network, timeout); применён ко всем 4 провайдерам; `.trim()` для GigaChat credentials
- `package.json` — `npm start` теперь запускает dev-режим (через `scripts/dev.js`)
- Все ошибки ГигаЧат переводятся: "Can't decode Authorization header" → "Неверный формат Client ID/Secret"

### v0.9.3 (3 марта 2026) — LoginWindow: детальное логирование и диагностика
- `main/main.js` — `ai-login:open`: wrap в try/catch; сессия настраивается ДО создания окна; авто-открытие DevTools; логи `did-start-loading / did-stop-loading / did-navigate / did-finish-load / did-fail-load / render-process-gone / unresponsive`; страница ошибки через `data:text/html` при `did-fail-load`

### v0.9.2 (3 марта 2026) — Вход через браузер (Electron-окно + clipboard-перехват ключа)
- `main/main.js` — `clipboard:read` IPC (native clipboard, не зависит от фокуса окна); `ai-login:open` — открывает BrowserWindow с сайтом провайдера, persist-сессия, Chrome UA, floating-подсказка, событие `ai-login:closed` при закрытии
- `src/components/AISidebar.jsx` — `looksLikeApiKey(provider, text)` (паттерны sk-/sk-ant-/UUID); кнопка "Войти через браузер"; polling clipboard каждые 800мс; автовставка ключа при детекции; сообщение "✓ API-ключ найден"; cleanup при размонтировании

### v0.9.1 (3 марта 2026) — AISidebar: проверка соединения, индикатор сохранения
- Кнопка "Проверить соединение", ✓ индикатор "сохранено", объяснение про API-ключ

### v0.9.0 (3 марта 2026) — ИИ: только подключённые провайдеры, категории шаблонов, статистика, анимация
- `src/components/AISidebar.jsx` — рефакторинг: показывает только подключённых провайдеров; кнопка "+ ИИ"; кнопка открытия сайта провайдера; `aiProviderKeys` в настройках для хранения конфига каждого провайдера
- `src/components/TemplatesPanel.jsx` — категории: фильтр по категориям, datalist-автодополнение, 2-колоночная форма (название + категория)
- `src/App.jsx` — статистика сообщений (`stats: { today, autoToday, total, date }`); строка статистики внизу; ping-анимация на вкладке при новом сообщении (3 сек); ежедневный сброс счётчика сегодня/авто; `bumpStatsRef` паттерн
- `main/main.js` — добавлен `shell` + IPC `shell:open-url` для открытия сайтов провайдеров в браузере

### v0.8.0 (3 марта 2026) — Шаблоны, авто-ответчик, Windows-уведомления, история AI, фикс ресайзера
- `src/components/TemplatesPanel.jsx` — новый: библиотека шаблонов ответов с CRUD, поиском, копированием
- `src/components/AutoReplyPanel.jsx` — новый: авто-ответчик по ключевым словам (ответ копируется в буфер)
- `src/components/AISidebar.jsx` — props `panelRef` и `chatHistory`, список моделей с полными именами, история в запросе
- `src/App.jsx` — фикс ресайзера (DOM-update без React re-render), Windows-уведомления, canal `new-message`, chatHistory
- `main/preloads/monitor.preload.js` — добавлен `new-message` канал: извлечение текста при росте unread

### v0.7.0 (3 марта 2026) — 4 ИИ-провайдера, resizable панель, контраст
- `main/main.js` — DeepSeek (OpenAI-совместимый), ГигаЧат (OAuth2 + SSL-bypass), кэш токенов
- `src/components/AISidebar.jsx` — 4 провайдера в grid, GigaChat client_id/secret, кнопка 👁️ для ключа, width prop
- `src/App.jsx` — resizable AI-панель (mousedown/move/up), aiWidth из settings, startResize
- `src/index.css` — контраст: тёмная dim=88%, dimmer=60%; светлая text=#06091a, dim=82%, dimmer=62%

### v0.6.0 (3 марта 2026) — Тема, ChatMonitor, ИИ-помощник, горячие клавиши, DnD, пресеты
- `src/index.css` — CSS-переменные для тёмной/светлой темы + `.wco-spacer` (fix кнопок под WCO)
- `main/preloads/monitor.preload.js` — ChatMonitor: MutationObserver + `sendToHost('unread-count')`
- `electron.vite.config.js` — добавлен вход `monitor` в preload build
- `main/main.js` — IPC: `app:get-paths`, `window:set-titlebar-theme`, `ai:generate` (OpenAI/Anthropic)
- `src/constants.js` — POPULAR_MESSENGERS (12 пресетов: TG/WA/VK/Авито/WB/Ozon/Discord/...)
- `src/components/AISidebar.jsx` — панель ИИ: конфиг, генерация 3 вариантов, копирование
- `src/App.jsx` — WCO spacer (fix кнопок настроек), тема, DnD вкладок, горячие клавиши, ChatMonitor
- `src/components/AddMessengerModal.jsx` — быстрый выбор пресета + ручной ввод
- `src/components/SettingsPanel.jsx` — секции: тема, мессенджеры, уведомления, ИИ, о программе

### v0.5.0 (3 марта 2026) — Управление вкладками, трей, поиск, настройки
- `main/main.js` — Tray-иконка (синий круг), свернуть в трей при закрытии окна
- `main/main.js` — Сохранение размера/позиции окна в userData/chatcenter.json
- `main/main.js` — IPC: `messengers:load/save`, `settings:get/save`, `app:notify`, `window:hide`
- `src/constants.js` — Общие константы: DEFAULT_MESSENGERS, PRESET_COLORS, PRESET_EMOJIS
- `src/App.jsx` — Мессенджеры загружаются из IPC (персистентность между запусками)
- `src/App.jsx` — Закрытие вкладок (кнопка × при hover)
- `src/App.jsx` — Поиск: бар поиска + `webview.findInPage()` (Enter/Shift+Enter/Esc)
- `src/App.jsx` — Drag-ручка (визуальный SVG-индикатор зоны перетаскивания)
- `src/App.jsx` — Кнопка настроек ⚙️ + кнопка поиска 🔍 в шапке
- `src/App.jsx` — Бейдж IPC-слушатель `messenger:badge` (готов для ChatMonitor)
- `src/App.jsx` — Звуковое уведомление через Web Audio API
- `src/components/AddMessengerModal.jsx` — Модальное окно добавления мессенджера (имя, URL, цвет, эмодзи)
- `src/components/SettingsPanel.jsx` — Боковая панель настроек (мессенджеры, звук, свернуть в трей)

### v0.4.0 (3 марта 2026) — Цветные вкладки + информация об аккаунте
- `src/App.jsx` — фирменные цвета вкладок (Telegram #2AABEE, WhatsApp #25D366, VK #4C75A3)
- Активная вкладка: цветной нижний бордер + прозрачный цветной фон + цветное название
- Цветная точка-индикатор на каждой вкладке
- Извлечение имени аккаунта через `webview.executeJavaScript()` с retry (max 10 попыток)
- Имя аккаунта отображается под названием мессенджера в строке вкладки
- `.memory-bank/ui-components.md` — новый файл документации UI
- `CLAUDE.md`, `package.json` — версия обновлена до v0.4.0

### v0.3.0 (3 марта 2026) — Вкладки перенесены наверх
- `src/App.jsx` — горизонтальные вкладки в шапке вместо боковой панели

### v0.2.0 (3 марта 2026) — Скелет приложения (Фаза 1)
- `package.json` — electron-vite, React 18, Tailwind, Zustand
- `electron.vite.config.js` — конфигурация сборки
- `main/main.js` — BrowserWindow, webviewTag:true, IPC ping/info
- `main/preloads/app.preload.js` — contextBridge (window.api)
- `src/App.jsx` — UI: боковая панель вкладок + WebView + ИИ-заглушка
- `src/main.jsx`, `src/index.css` — точка входа React + Tailwind
- `tailwind.config.js`, `postcss.config.js` — конфиги стилей
- Убираем X-Frame-Options для загрузки мессенджеров в WebView

### v0.1.0 (3 марта 2026) — Инициализация проекта
- Создан CLAUDE.md
- Создан Memory Bank (.memory-bank/)
- Создан .claude/settings.json с разрешениями
- Определена архитектура проекта
