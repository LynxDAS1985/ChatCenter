# Реализованные функции — ChatCenter

## Текущая версия: v0.10.0 (4 марта 2026)

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
| Персистентность списка мессенджеров | ✅ Сделано | v0.5.0 |

### Мониторинг сообщений (ChatMonitor)
| Функция | Статус | Версия |
|---------|--------|--------|
| MutationObserver в WebView preload | ✅ Сделано | v0.6.0 |
| Счётчик непрочитанных (TG/WA/VK) | ✅ Сделано | v0.6.0 |
| Передача через ipcRenderer.sendToHost | ✅ Сделано | v0.6.0 |
| Бейдж непрочитанных на вкладке | ✅ Сделано | v0.5.0 |
| Звуковой сигнал (Web Audio) | ✅ Сделано | v0.5.0 |

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
