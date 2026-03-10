# Реализованные функции — ChatCenter

## Текущая версия: v0.52.3 (10 марта 2026)

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
