# Реализованные функции — ChatCenter

## Текущая версия: v0.16.1 (4 марта 2026)

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
