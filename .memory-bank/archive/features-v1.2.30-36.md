# Архив features v1.2.30-v1.2.36

Дата архивации: 6 июля 2026.
Причина: active features.md превысил лимит 100 КБ после v1.2.56; подробности v1.2.30-v1.2.36 перенесены без потери данных.

---

### v1.2.36 — счётчик диагностики в настройках показывает последний отчёт

Дата: 1 июля 2026.
Кто нашёл: пользователь по скриншоту настроек, где рядом с кнопкой "Диагностика системы" было `Статус записи выключена · 0`, хотя диагностика уже использовалась для разбора MAX.

Проблема: индикатор в настройках показывал только текущий live-буфер `DiagnosticsSessionHost`. Этот host создаётся после открытия диагностики и может быть сброшен через `resetDiagnosticsSession()`. Поэтому после полной остановки/закрытия диагностики настройки получали `active=false` и `events=0`. Последний сохранённый `system-diagnostics-report.json` в этот счётчик не попадал.

Что изменено:
- `src/components/SettingsPanel.jsx`: при открытии настроек читается `app:diagnostics-read-report`;
- если фоновая запись активна, индикатор показывает текущий live-буфер;
- если запись выключена, индикатор показывает количество событий из последнего сохранённого отчёта;
- под числом добавлена подпись `текущая запись`, `последний отчёт` или `нет отчёта`, чтобы было понятно, откуда взято число.

Почему это безопасно: изменение только UI-индикатора в настройках. Оно не запускает диагностику автоматически, не очищает отчёты, не трогает `chatcenter.log`, не меняет MAX/WhatsApp/Telegram notification pipeline и не влияет на запись событий.

Как должно работать:
1. Пока запись включена, рядом с кнопкой видно число событий текущей live-сессии.
2. Если запись выключена, но есть сохранённый отчёт, видно число событий из последнего отчёта.
3. Если отчёта нет, остаётся `выключена · 0` и подпись `нет отчёта`.

Проверки: `node src/__tests__/systemDiagnosticsUi.test.cjs`, `node src/__tests__/memoryBankSizeLimits.test.cjs`, `node src/__tests__/featuresReferences.test.cjs`, `npm run lint`, `npm run build`.

### v1.2.35 — MAX первое сообщение в уже unread-чате больше не глохнет

Дата: 1 июля 2026.
Кто нашёл: пользователь по живому кейсу "первое MAX-сообщение без уведомления, второе с уведомлением"; Codex по полной диагностике v1.2.34 и `chatcenter.log`.

Что не помогло раньше: v1.2.33 разрешила первое неизвестное sidebar-сообщение только при свежем росте title-unread и росте unread-бейджа строки. Это закрыло часть случаев, но не закрыло кейс, где чат уже был непрочитанным. В свежей диагностике было: `body="Иит"`, `prevBody="Ыйы"`, `unread=1`, `prevUnread=1`, `firstSeen=false`, `bodyChanged=true`, `unreadIncreased=false`, `freshTitleMs=1`, `search.active=false`, `emit=true`, `action="skip-no-unread-increase"`. То есть MAX реально поменял preview на новое сообщение, но unread строки остался `1`.

Корень: MAX sidebar не всегда увеличивает unread-бейдж на каждое новое сообщение внутри уже непрочитанного чата. Для такого чата новое входящее может выглядеть как `bodyChanged=true` при стабильном `unread=1`. Старое правило "показывать только если unread вырос" было слишком строгим.

Что изменено:
- `main/preloads/hooks/max.hook.js`: добавлен флаг `stableUnreadBodyChanged`;
- `stableUnreadBodyChanged` срабатывает только если строка уже была в baseline (`firstSeen=false`), preview изменился (`bodyChanged=true`), у строки есть unread (`info.unread > 0`) и рядом был свежий рост title-unread (`freshTitleMs < 3000`);
- `max-sidebar` теперь показывает ribbon при `unreadIncreased=true` или при `stableUnreadBodyChanged=true`;
- старый широкий вариант `bodyChanged + unread > 0` не используется, чтобы не вернуть фантомы от исходящих/старых preview;
- диагностика пишет `stableUnreadBodyChanged` и action `show-stable-unread-body` или `skip-no-confirmed-unread-change`.

Почему это безопаснее:
1. Первый baseline после запуска остаётся тихим: `firstSeen=true` не проходит через `stableUnreadBodyChanged`.
2. Поиск MAX остаётся тихим: `search.active` переводит `emit=false`.
3. Голый title MAX сам по себе не создаёт уведомление.
4. Просто изменение preview без свежего title growth не проходит.
5. Просто старый unread без изменения body не проходит.
6. Основные пути Notification API/SW/showNotification, звук, ribbon, аватарки и общий `handleNewMessage` не менялись.

Как должно работать:
1. Если MAX прислал первое новое сообщение в уже непрочитанный чат и sidebar preview изменился рядом со свежим ростом title-unread, будет `__CC_NOTIF__`, звук и ribbon.
2. Если пользователь открыл поиск или приложение делает первичную заливку baseline, уведомления не будет.
3. Если preview старый или изменился без свежего подтверждения title-unread, уведомления не будет.
4. В диагностике для нового исправленного случая будет `action="show-stable-unread-body"` и `stableUnreadBodyChanged=true`.

Результат живой проверки:
- 1 июля 2026 пользователь проверил v1.2.35 на реальном MAX-сценарии и сообщил: "вроде помогло";
- это подтверждает, что предыдущая причина `skip-no-unread-increase` была выбрана правильно для наблюдаемого кейса;
- статус: исправление считается предварительно подтверждённым на живом сценарии, но при новых MAX-фантомах или пропусках нужно снова смотреть `max-sidebar-decision`, а не добавлять фильтры по словам.

Проверки: `node src/__tests__/notifHooks.test.cjs`, `node src/__tests__/fileSizeLimits.test.cjs`, `npm run lint`, `npm run build`.

### v1.2.34 — MAX диагностика пишет полный sidebar decision без обрезания

Дата: 1 июля 2026.
Кто нашёл: пользователь по повторному живому кейсу "первое MAX-сообщение без уведомления, второе показывает"; Codex по диагностике, `chatcenter.log`, `main/preloads/hooks/max.hook.js`, `src/utils/consoleMessageHandler.js`, `src/utils/webviewSetup.js` и `src/utils/diagnosticsSession.js`.

Проблема: после v1.2.33 живой кейс не был решён. Диагностика показывала общий факт (`MAX page-title-updated`, `title-only no-ribbon`, `max-sidebar skip/no-ribbon`), но не давала полную строку решения по sidebar. Из-за этого нельзя было доказать, почему первое сообщение пропущено: строка могла быть уже в baseline, мог быть `bodyChanged=true` без `unreadIncreased`, мог мешать поиск, или мог быть другой `prevUnread`. Часть этих полей терялась из-за обрезания на нескольких уровнях.

Где именно обрезало:
- `main/preloads/hooks/max.hook.js`: старые строки `skip no unread increase` резали `sender` и `body` через `slice`;
- `src/utils/consoleMessageHandler.js`: parsed `__CC_DIAG__` резался до 200 символов;
- `src/utils/webviewSetup.js`: `pipelineTrace` хранил `text` максимум 200 символов, а `chatcenter.log` показывал `text` максимум 60 символов;
- `src/utils/diagnosticsSession.js`: live-сессия брала максимум 700 символов и могла вообще не включить строку, если `max-sidebar` был в `text`, а короткий `detail` был заполнен.

Что изменено:
- `max.hook.js`: добавлен полный JSON `__CC_DIAG__max-sidebar-decision` для каждой изменившейся sidebar-строки MAX;
- в decision теперь пишутся `action`, `sender`, `body`, `prevBody`, `unread`, `prevUnread`, `firstSeen`, `bodyChanged`, `unreadIncreased`, `freshTitleMs`, `emit`, `search`, `title`, `url`, `ts`;
- добавлен `__CC_DIAG__max-sidebar-title`, чтобы видеть момент роста title-unread;
- `consoleMessageHandler.js`: для `max-sidebar` полный diagnostic payload переносится в `detail`, чтобы общий лог не терял поля;
- `webviewSetup.js`: `pipelineTrace` и `chatcenter.log` сохраняют полный `max-sidebar` payload до 7000 символов;
- `diagnosticsSession.js`: session report фильтрует одновременно `detail + text` и хранит длинный `max-sidebar` payload до 7000 символов;
- добавлены тесты, что диагностика MAX sidebar больше не режет полный decision payload.

Почему это решение сейчас правильное: мы не меняем правила уведомлений вслепую и не добавляем фильтры по словам. Сначала убираем потерю фактов в диагностике. Следующий отчёт должен показать точную причину пропуска первого сообщения: какое было действие `action`, был ли рост unread, был ли первый проход, изменился ли текст, был ли активен поиск, какой был предыдущий body/unread и сколько миллисекунд прошло после роста title.

Как должно работать после изменения:
1. При включённой диагностике и новом MAX-сообщении в отчёте должна появиться строка `__CC_DIAG__max-sidebar-decision`.
2. Эта строка должна быть полной, без `...` и без потери `sender/body/prevBody`.
3. Если первое сообщение пропущено, в `action` будет видно точную причину: `skip-first-seen`, `skip-no-unread-increase`, `skip-emit-false` или другое состояние.
4. Если сообщение показано, рядом будет `show` и далее обычная цепочка `__CC_NOTIF__ -> sound -> NotifManager`.
5. Общая логика уведомлений MAX, аватарки, звук и ribbon этим изменением не менялись.

Проверки: `node src/__tests__/systemDiagnosticsUi.test.cjs`, `node src/__tests__/diagnosticsSession.test.cjs`, `node src/__tests__/consoleMessageParser.test.cjs`, `node src/__tests__/notifHooks.test.cjs`, `node src/__tests__/fileSizeLimits.test.cjs`, `npm run lint`, `npm run build`.

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


