# Реализованные функции — ChatCenter

## Текущая версия: v1.2.33 (30 июня 2026)

### v1.2.33 — MAX не теряет первое сообщение после роста счётчика

Дата: 30 июня 2026.
Кто нашёл: пользователь по живому кейсу "на первое сообщение нет уведомления и модалки, на второе есть"; Codex по `chatcenter.log`, `system-diagnostics-report.json`, `src/utils/webviewSetup.js`, `src/utils/titleUnreadBaseline.js` и `main/preloads/hooks/max.hook.js`.

Проблема: после v1.2.32 первое реальное MAX-сообщение могло не дать звук и ribbon. В логе на первом сообщении была только строка `MAX page-title-updated raw="1 непрочитанный чат" prevUnread=0 delta=1`, затем `MAX title-only no-ribbon | reason=baseline-title-only`. Полного pipeline не было: не было `__CC_NOTIF__`, `custom-notify`, `NotifManager show` и звука. Второе сообщение через несколько секунд уже проходило как `__CC_NOTIF__ src=max-sidebar` и показывалось нормально.

Корень: v1.2.32 правильно запретила `max-sidebar` шуметь на первом неизвестном проходе, чтобы не показывать старые и свои preview. Но у MAX иногда первое новое сообщение после навигации видно сначала только как рост title-unread, а sidebar-строка для этого отправителя ещё не была в baseline. Получилась дырка между двумя защитами: голый title мы не показываем, а первый sidebar-row мы тоже пропускали.

Что изменено:
- `main/preloads/hooks/max.hook.js`: hook запоминает свежий рост title-unread MAX по `document.title`;
- первый неизвестный sidebar-row с unread теперь разрешается только если одновременно есть свежий рост title-unread за последние 3 секунды;
- старый первый проход без такого подтверждения остаётся тихим;
- добавлена диагностика `max-sidebar: title-correlated first unread`;
- `src/__tests__/notifHooks.test.cjs`: добавлен регрессионный тест на правило `title growth + sidebar unread`.

Почему это безопасно: MAX title сам по себе не создаёт уведомление. Нужны два независимых признака: сайт поднял счётчик непрочитанных и конкретная sidebar-строка имеет unread. Поиск MAX всё ещё отключает emit, preview без роста unread всё ещё блокируется, свои исходящие без unread не проходят.

Как должно работать:
1. Первое новое MAX-сообщение после роста счётчика должно дать звук и ribbon, если sidebar показывает unread у этого чата.
2. Второе и следующие сообщения продолжают идти через обычный `max-sidebar` pipeline.
3. Старые unread после запуска/навигации не должны показываться без свежего роста title.
4. В диагностике для исправленного случая должна появиться строка `title-correlated first unread`.

Проверки: `node src/__tests__/notifHooks.test.cjs`, `node src/__tests__/maxTitleFallback.test.cjs`, `node src/__tests__/integration.test.cjs`, `node src/__tests__/fileSizeLimits.test.cjs`, `npm run lint`, `npm run build`.

### v1.2.32 — MAX sidebar больше не принимает исходящее/старое превью за новое входящее

Дата: 30 июня 2026.
Кто нашёл: пользователь по живому кейсу с собственным MAX-сообщением; Codex по `system-diagnostics-report.json`, `chatcenter.log`, `main/preloads/hooks/max.hook.js` и `src/utils/consoleMessageHandler.js`.

Проблема: пользователь сам отправил MAX-сообщение клиенту (`перезвонить или случайно набрал?`), а ChatCenter показал это как входящее уведомление. В диагностике цепочка была нормальной уже после входа в pipeline: `__CC_NOTIF__ -> звук -> app:custom-notify -> NotifManager show`. Ошибка была раньше: источник `src=max-sidebar` взял изменившееся preview из списка чатов и пометил его как новое событие.

Что показали факты:
- в логе было `Источник: ... | __CC_NOTIF__ | ... src=max-sidebar`;
- дальше renderer ставил `fromNotifAPI=true`;
- `max-sidebar` не является Notification API MAX, а DOM-наблюдателем за списком чатов;
- список чатов не знает направление сообщения и раньше сравнивал только текст preview;
- собственная отправка или переотрисовка старой строки могла выглядеть как новое входящее.

Что изменено:
- `main/preloads/hooks/max.hook.js`: `_maxRowInfo()` теперь возвращает `unread`;
- `max-sidebar` хранит baseline `{ body, unread }` по строке чата;
- `__CC_NOTIF__ src=max-sidebar` отправляется только если unread-бейдж строки вырос;
- если preview изменился, но unread не вырос, baseline обновляется, а диагностика пишет `max-sidebar: skip no unread increase`;
- `src/utils/consoleMessageHandler.js`: `src=max-sidebar` больше не получает `fromNotifAPI=true`.

Почему так безопаснее: проблема не в словах, телефонах, PDF или тексте клиента. Клиент может написать любой текст. Надёжный признак для sidebar fallback — не изменение preview, а рост непрочитанного бейджа в этой строке. Основные пути MAX Notification API, SW showNotification, активный chat observer, звук, ribbon и аватарки не отключались.

Как должно работать:
1. Свои исходящие MAX-сообщения обновляют preview, но не создают ribbon/звук, если unread не вырос.
2. Реальные входящие, которые MAX отдаёт через Notification API/SW/active observer, проходят как раньше.
3. Sidebar остаётся запасным путём только для строк, где реально появился новый unread.
4. В диагностике видно причину пропуска: `max-sidebar: skip no unread increase`.

Проверки: `node src/__tests__/notifHooks.test.cjs`, `node src/__tests__/integration.test.cjs`, `npm run lint`, `node src/__tests__/fileSizeLimits.test.cjs`.

### v1.2.31 — диагностика сохраняет отчёт при закрытии и открывает последний сохранённый отчёт

Дата: 30 июня 2026.
Кто нашёл: пользователь по проверке настройки "Диагностика" после закрытия маленькой панели; Codex по файлам `useDiagnosticsSession.js`, `SystemDiagnosticsModal.jsx`, `main/utils/systemDiagnostics.js` и фактическому `userData/system-diagnostics-report.json`.

Проблема: пользователь закрывал маленькую панель диагностики кнопкой `Закрыть`, потом открывал диагностику в настройках и видел `выключена · 0` и пустую live-ленту. Это выглядело как потеря отчёта. На диске при этом мог лежать сохранённый `system-diagnostics-report.json`, но UI показывал только текущую память React-сессии, а она сбрасывалась через `resetDiagnosticsSession()`. Вторая часть проблемы: большая модалка не читала последний сохранённый отчёт с диска при открытии.

Что увидели в проверке:
- `system-diagnostics-report.json` существовал и содержал `diagnosticsSession` с 210 событиями;
- `ai-errors.log` был пустой, значит проблема не в AI-логе;
- `useDiagnosticsSession.close()` сбрасывал сессию без сохранения;
- `SystemDiagnosticsModal` умел сохранять новый снимок, но не умел подгружать последний сохранённый JSON;
- настройки показывали только текущий буфер, поэтому после reset было `0`.

Что изменено:
- `useDiagnosticsSession.js`: `close()` теперь перед полным закрытием сохраняет активную или накопленную сессию; если сохранение упало, сессия не сбрасывается и ошибка остаётся на экране;
- `main/utils/systemDiagnostics.js`: добавлено чтение последнего `system-diagnostics-report.json`;
- `main/handlers/mainIpcHandlers.js`: добавлен IPC `app:diagnostics-read-report`;
- `SystemDiagnosticsModal.jsx`: при открытии читает последний сохранённый отчёт и показывает его live-ленту, если текущая сессия пустая;
- `SettingsPanel.jsx`: исправлена отображаемая версия приложения на `v1.2.31`;
- тесты IPC/UI/main diagnostics обновлены под новый сценарий.

Как должно работать:
1. Пользователь включает запись диагностики.
2. Диагностика собирает события в маленькой панели.
3. Если пользователь нажимает `Закрыть`, приложение сначала сохраняет отчёт, потом скрывает панель.
4. Если пользователь снова открывает `🩺 Диагностика системы`, окно подгружает последний сохранённый отчёт.
5. Live-лента показывает сохранённые события, даже если текущая фоновая запись уже выключена.
6. `Очистить экран` по-прежнему чистит только экран/буфер, не `chatcenter.log` и не `ai-errors.log`.

Почему так безопаснее: исправление не меняет уведомления, MAX fallback, звук, dedup, WebView hooks и native backend. Оно меняет только жизненный цикл диагностического отчёта: перед закрытием не теряем буфер и при повторном открытии показываем файл с диска.

Проверки:
- `node src/__tests__/diagnosticsSession.test.cjs`;
- `node src/__tests__/systemDiagnosticsMain.test.cjs`;
- `node src/__tests__/systemDiagnosticsUi.test.cjs`;
- `node src/__tests__/ipcChannels.test.cjs`;
- `npm run lint`;
- `npm run check-memory`.

### v1.2.30 — диагностика упрощена: один блок управления, глубокая проверка всегда включена

Дата: 30 июня 2026.
Кто нашёл: пользователь по UX-проверке окна и маленькой панели "Диагностика"; Codex по коду `SystemDiagnosticsModal`, `DiagnosticsFloatingPanel`, `DiagnosticsSessionHost`, `SettingsPanel`, `useDiagnosticsSession`.

Проблема: после v1.2.29 диагностика уже не запускалась сама, но интерфейс всё ещё выглядел перегруженным. В большой модалке были два смысловых блока с похожими действиями, `Глубокая WebView` выглядела как ручной режим, хотя для поиска проблем MAX её логичнее держать включённой постоянно. В маленькой панели после `Стоп` оставались события, но не было кнопки снова начать запись. В настройках не было видно, включена ли фоновая запись, пока пользователь не откроет окно диагностики.

Что изменено:
- `diagnosticsSession.js`: `deepWebview` теперь всегда `true`; старый toggle оставлен безопасным no-op, чтобы случайный старый вызов не выключил глубокую проверку;
- `useDiagnosticsSession.js`: из публичных actions убран `toggleDeep`;
- `SystemDiagnosticsModal.jsx`: все действия сведены в один блок `Фоновая диагностическая сессия`; отдельный дублирующий блок `Отчёт для разбора` убран;
- `SystemDiagnosticsModal.jsx`: ручная кнопка `Глубокая WebView` удалена, вместо неё текстовое состояние "Глубокая WebView-проверка включена всегда";
- `DiagnosticsFloatingPanel.jsx`: добавлена кнопка `Запустить`, чтобы после `Стоп` можно было сразу включить запись заново;
- `DiagnosticsSessionHost.jsx` + `App.jsx` + `SettingsPanel.jsx`: статус фоновой записи передаётся в настройки и показывается рядом с кнопкой `🩺 Диагностика системы`;
- `features.md`: история v1.2.27 и старше вынесена в `archive/features-v1.2.27-and-older.md`, чтобы активная память не разрасталась.

Как должно работать:
1. В настройках видно: запись выключена/включена/пауза и сколько событий в буфере.
2. Большая модалка не запускает запись сама.
3. Для старта пользователь нажимает `Включить запись`.
4. Глубокая WebView-проверка работает всегда, без отдельного переключателя.
5. Все главные действия находятся в одном блоке: старт, пауза, стоп+сохранение, свернуть, сохранить/копировать для ИИ, очистить экран.
6. Если запись остановлена, маленькая панель остаётся с накопленными фактами и даёт кнопку `Запустить`.
7. `Очистить экран` чистит только экран/буфер диагностики, не `chatcenter.log` и не `ai-errors.log`.

Почему так безопаснее: изменение не меняет pipeline уведомлений MAX/WhatsApp/Telegram, не фильтрует тексты, не меняет правила dedup и не трогает общий лог. Оно только делает диагностический инструмент понятнее и уменьшает риск, что пользователь забудет включить нужный режим или не поймёт статус записи.

Проверки:
- `node src/__tests__/diagnosticsSession.test.cjs`;
- `node src/__tests__/systemDiagnosticsUi.test.cjs`;
- `node src/__tests__/appStructure.test.cjs`;
- `npm run lint`;
- `npm run check-memory`;
- `npm run pre-push`.

### v1.2.29 — диагностика запускается только вручную и не мешает работе

Дата: 30 июня 2026.
Кто нашёл: пользователь по UX-проверке окна "Диагностика системы"; Codex по коду `DiagnosticsSessionHost`, `SystemDiagnosticsModal`, `DiagnosticsFloatingPanel`, `useDiagnosticsSession`.

Что зафиксировано по MAX: после v1.2.28 пользователь сообщил, что явных проблем с исправленным поисковым фантомом не видит. Это не закрывает все будущие MAX-кейсы, но подтверждает, что конкретный сценарий "поиск номера в MAX -> старый sidebar preview как новое уведомление" больше не воспроизводится в текущей проверке.

Проблема диагностики: окно диагностики само запускало фоновую запись при открытии (`if (open) diagnostics.start()`), из-за этого пользователь видел активную сессию без явного включения. В интерфейсе были дубли кнопок: две глубокие WebView-проверки, два сценария сохранения/копирования, отдельное автообновление и фоновая запись рядом. Закрытие большой модалки выглядело как "закрыть", но фактически оставляло маленькую панель и запись в фоне, что путало.

Что изменено:
- `DiagnosticsSessionHost.jsx`: открытие большой модалки больше не вызывает `diagnostics.start()`;
- разворачивание маленькой панели больше не перезапускает запись;
- `useDiagnosticsSession.js` и `diagnosticsSession.js`: добавлен полный reset/close сессии;
- `DiagnosticsFloatingPanel.jsx`: добавлена кнопка `Закрыть`, которая выключает и скрывает диагностику полностью;
- `SystemDiagnosticsModal.jsx`: оставлен один понятный блок управления: `Включить запись`, `Пауза`, `Продолжить`, `Отключить и сохранить`, `Свернуть в фон`, одна `Глубокая WebView`;
- сохранение/копирование сведены к понятным действиям `Сохранить для ИИ` и `Скопировать для ИИ`;
- автообновление большой модалки убрано: непрерывная запись теперь только через ручное включение фоновой сессии;
- `Очистить экран` по-прежнему чистит только экран/буфер диагностики, не `chatcenter.log` и не `ai-errors.log`.

Как должно работать:
1. Пользователь открывает настройки -> диагностику, но запись сама не начинается.
2. Если нужно поймать проблему, пользователь нажимает `Включить запись`.
3. Можно свернуть большую модалку в фон и ходить по чатам; маленькая панель остаётся поверх и показывает последние события.
4. В маленькой панели `Развернуть` открывает большую модалку без нового старта записи.
5. `Закрыть` в маленькой панели выключает диагностику полностью и убирает буфер с экрана.
6. `Отключить и сохранить` сохраняет отчёт с накопленной цепочкой для Codex/другого ИИ.

Почему так безопаснее: исправление не меняет MAX notification pipeline, не трогает фильтры уведомлений, не очищает общие логи и не меняет `chatcenter.log`. Оно только убирает самопроизвольный старт диагностической сессии и делает управление явным.

Проверки:
- `node src/__tests__/diagnosticsSession.test.cjs`;
- `node src/__tests__/appStructure.test.cjs`;
- `npm run lint`.

### v1.2.28 — MAX: sidebar watcher не создаёт фантомы во время поиска

Дата: 30 июня 2026.
Кто нашёл: пользователь по кейсу MAX-поиска номера телефона и Codex по `chatcenter.log` / `system-diagnostics-report.json`.

Проблема: при вводе номера в поиск MAX список чатов перестраивался, а MAX sidebar watcher мог принять старый preview из строки чата за новое сообщение. В логах это выглядело как нормальный `__CC_NOTIF__`, затем `Звук`, `custom-notify` и `NotifManager show`, хотя клиент нового сообщения не писал.

Что изменено:
- `main/preloads/hooks/max.hook.js`: все MAX `__CC_NOTIF__` получили поле `src`: `max-notification-api`, `max-sw-showNotification` или `max-sidebar`;
- `main/preloads/hooks/max.hook.js`: добавлен `_maxSearchState()`;
- `max-sidebar` при активном поиске больше не отправляет уведомление, а только обновляет baseline `_maxLastList`;
- в диагностике появляется `__CC_DIAG__max-sidebar: search active skip emit`;
- `src/utils/consoleMessageParser.js` теперь сохраняет `source`;
- `src/utils/consoleMessageHandler.js` пишет `src` в trace и передаёт `extra.notifSource`.

Почему так: проблема не в словах, PDF или имени клиента. Старый DOM preview становится похож на новое событие из-за перестройки списка. Поэтому блокировка сделана по источнику и состоянию UI: только `max-sidebar` + активный поиск. Основные пути MAX notification/showNotification не отключались.

Как должно работать:
- реальное входящее MAX-сообщение через `max-notification-api` / `max-sw-showNotification` показывает ribbon, звук, отправителя и аватарку как раньше;
- при поиске номера/текста в MAX старые строки списка не создают фантомные ribbon;
- в диагностике видно, какой подпуть создал событие: `src=max-sidebar`, `src=max-notification-api` или `src=max-sw-showNotification`;
- если во время поиска sidebar нашёл старый preview, он пишет diagnostic skip, но не вызывает `NotifManager show`.

Проверки:
- `node src/__tests__/notifHooks.test.cjs`;
- `node src/__tests__/consoleMessageParser.test.cjs`;
- `npm run lint`;
- `npm run check-memory`.

**Структура файла**: этот features.md содержит только **последние активные версии**. Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.95.39.md`](./archive/features-v0.95.39.md) | v0.95.39 (убран twoPhase + RAF×2 + 350мс easeOutCubic; стабилизировано v0.95.40+) | ~2 КБ |
| [`archive/features-v0.95.40.md`](./archive/features-v0.95.40.md) | v0.95.40 (большие emoji + a11y reduced-motion + sticky bottom on media; стабилизировано v0.95.41+) | ~3 КБ |
| [`archive/features-v0.95.41.md`](./archive/features-v0.95.41.md) | v0.95.41 (Custom emoji premium WebM/WebP + reduced-motion интеграционные тесты; стабилизировано v0.95.42+) | ~3 КБ |
| [`archive/features-v0.95.42.md`](./archive/features-v0.95.42.md) | v0.95.42 (сохранение поиска + история + ✕ + подсветка совпадений; стабилизировано v0.95.43+) | ~2 КБ |
| [`archive/features-v0.95.38.md`](./archive/features-v0.95.38.md) | v0.95.38 (фикс дубля сообщений через updateMessageSendSucceeded, ⏳ индикатор, mistakes static guard) | ~2 КБ |
| [`archive/features-v0.95.35-37.md`](./archive/features-v0.95.35-37.md) | v0.95.35-37 (fade-in changelog, auto-scroll outgoing-other-device, sending_state polish, mistakes/outgoing-two-cases.md; стабилизировано v0.95.38+) | ~3 КБ |
| [`archive/features-v0.95.34.md`](./archive/features-v0.95.34.md) | v0.95.34 (темовые vars в :root, вспышка bubble, WhatsNewModal UX; стабилизировано v0.95.40+) | ~2 КБ |
| [`archive/features-v0.95.33.md`](./archive/features-v0.95.33.md) | v0.95.33 (фикс «цвет не применяется» через querySelectorAll, регресс-тест blur, деловой стиль; финал в v0.95.34) | ~2 КБ |
| [`archive/features-v0.95.32.md`](./archive/features-v0.95.32.md) | v0.95.32 (производительность WhatsNewModal: убран backdrop-filter + contain + деловой стиль changelog) | ~2 КБ |
| [`archive/features-v0.95.31.md`](./archive/features-v0.95.31.md) | v0.95.31 (аккаунты вниз + drag-n-drop + multi-user typing + throttle реакций; стабилизировано v0.95.34+) | ~3 КБ |
| [`archive/features-v0.95.30.md`](./archive/features-v0.95.30.md) | v0.95.30 (плавная auto-scroll + 5 цветовых тем + dropdown + opacity 0.95; стабилизировано v0.95.33-34) | ~3 КБ |
| [`archive/features-v0.95.29.md`](./archive/features-v0.95.29.md) | v0.95.29 (реакции 👍❤️🔥 + Telegram-style header + General 📢 + render-counter; стабилизировано v0.95.31-34) | ~5 КБ |
| [`archive/features-v0.95.28.md`](./archive/features-v0.95.28.md) | v0.95.28 (Telegram-style auto-scroll к новому + ↓N без «слепой зоны» Schmitt; стабилизировано v0.95.31) | ~4 КБ |
| [`archive/features-v0.95.27.md`](./archive/features-v0.95.27.md) | v0.95.27 (расширенная диагностика send pipeline; стабилизировано v0.95.29) | ~3 КБ |
| [`archive/features-v0.95.23-26.md`](./archive/features-v0.95.23-26.md) | v0.95.23 – v0.95.26 (курсор в input, initial backfill, voice/spellcheck/action-bar/WhatsNew, фикс 47-дневного бага unreadCount; стабилизировано) | ~15 КБ |
| [`archive/features-v0.95.19-22.md`](./archive/features-v0.95.19-22.md) | v0.95.19 – v0.95.22 (диагностика tg-new-message, финал jump-to-end, бейдж форум-группы, форум-overlay; стабилизировано) | ~6 КБ |
| [`archive/features-v0.95.15-18.md`](./archive/features-v0.95.15-18.md) | v0.95.15 – v0.95.18 (итеративный fetch + форум-топики + двухфазный scroll + ForumTopicEmptyState; стабилизировано v0.95.20-21) | ~8 КБ |
| [`archive/features-v0.95.12-14.md`](./archive/features-v0.95.12-14.md) | v0.95.12 – v0.95.14 (3 итерации jump-to-end до итеративного fetch v0.95.15, полная сага в jump-to-end-saga.md) | ~32 КБ |
| [`archive/features-v0.95.8-9.md`](./archive/features-v0.95.8-9.md) | v0.95.8 – v0.95.9 (счётчик ↓ обнуляется + анимация + live compact + порог 128) | ~14 КБ |
| [`archive/features-v0.95.5-7.md`](./archive/features-v0.95.5-7.md) | v0.95.5 – v0.95.7 (sticky pinned overlay, кнопка ↓ Telegram-style, drag-to-resize) | ~24 КБ |
| [`archive/features-v0.95.0-3.md`](./archive/features-v0.95.0-3.md) | v0.95.0 – v0.95.3 (контигуити-фикс, afterId load-newer, мигание ↓ Schmitt trigger, диагностика «дёрг») | ~13 КБ |
| [`archive/features-v0.94.1-7.md`](./archive/features-v0.94.1-7.md) | v0.94.1 – v0.94.7 (TDLib listener leak, scroll caskade, спокойная загрузка, пилюля прогресса — стабилизированы v0.95.0-2) | ~24 КБ |
| [`archive/features-v0.93.0.md`](./archive/features-v0.93.0.md) | v0.93.0 (pixel-perfect scroll restore через LocationOptions.offset, superseded v0.94.0) | ~7 КБ |
| [`archive/features-v0.92.0-6.md`](./archive/features-v0.92.0-6.md) | v0.92.0 – v0.92.6 (сага Virtuoso scroll restore, superseded v0.94.0) | ~37 КБ |
| [`archive/features-v0.91.11-24.md`](./archive/features-v0.91.11-24.md) | v0.91.11 – v0.91.24 (сага scroll restore: 13 версий → миграция на virtuoso) | ~47 КБ |
| [`archive/features-v0.91.1-10.md`](./archive/features-v0.91.1-10.md) | v0.91.1 – v0.91.10 (initial-load, scroll-jump, newBelow, forum topics, updateChatLastMessage) | ~12 КБ |
| [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) | v0.87.106 – v0.87.114 (multi-account UI финал, кнопки режимов, мьют чата, аватарки отправителей в группах) | ~22 КБ |
| [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) | v0.87.93 – v0.87.105 (multi-account native, login flow, разбиения, cc-media://) | ~30 КБ |
| [`archive/features-v0.87.80-92.md`](./archive/features-v0.87.80-92.md) | v0.87.80 – v0.87.92 (pre-push hook, разбиения 4-7, AccountContextMenu) | ~16 КБ |
| [`archive/features-v0.87.65-79.md`](./archive/features-v0.87.65-79.md) | v0.87.65 – v0.87.79 (план разбиения 1-3, pre-push hook, bubble UI) | ~54 КБ |
| [`archive/features-v0.87.51-64.md`](./archive/features-v0.87.51-64.md) | v0.87.51 – v0.87.64 (groupedUnread удалён, pre-commit hook) | ~54 КБ |
| [`archive/features-v0.87.40-50.md`](./archive/features-v0.87.40-50.md) | v0.87.40 – v0.87.50 (итерации native scroll + unread) | ~40 КБ |
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

---

### Архив v1.2.27 и старше

Подробная история v1.2.27 и более ранних версий перенесена в [archive/features-v1.2.27-and-older.md](./archive/features-v1.2.27-and-older.md). Активный файл держим компактным, чтобы memory-bank быстро читался и проходил лимиты.
