# Ключевые решения (ADR) — ChatCenter

## ADR — ВК переехал на vk.ru: детект новых сообщений по списку чатов (2026-07-23, v1.2.109–115)

**Статус**: ✅ Действующее (ожидает финальной визуальной проверки пользователем на живом ВК).

### Контекст / проблема
ВК перевёл веб-версию с `vk.com` на `vk.ru`. Из-за этого сломались наши уведомления ВК (шёл только звук самого ВК):
1. Всё определение «это ВК?» сверяло только `vk.com` → `detectMessengerType('vk.ru')` возвращал `unknown` → хук ВК и наблюдатели не запускались (**исправлено в v1.2.109**: добавлено распознавание `vk.ru` рядом с `vk.com` в 4 точках — [messengerConfigs.js](../src/utils/messengerConfigs.js), [monitor.preload.cjs](../main/preloads/monitor.preload.cjs), [unreadCounters.js](../main/preloads/utils/unreadCounters.js), [navigateToChat.js](../src/utils/navigateToChat.js); тест `messengerConfigs.vitest.js`).
2. На новом vk.ru **нет всплывашки «Новое сообщение»** (старый toast-наблюдатель `_scanVkToasts` даёт 0), а большой запасной впрыск `vkExecFallback` блокируется страницей (`VK-EXEC inject failed` — это ожидаемо, не поломка).

### Решение
Ловить новые сообщения **по списку чатов** внутри основного preload-хука `vk.hook.js` (он на vk.ru грузится — подтверждено логом). Наблюдатель `MutationObserver` (тротлинг 500 мс) сканирует строки списка:
- строки чатов — `[class*="ConvoListItem" i]` (по дампу диагностики: реальный класс `ConvoListItem ConvoListItem--click`);
- непрочитанность — класс строки с «unread» ИЛИ вложенный `[class*="unread"/"Counter"/"Badge"]` (в дампе — `DIV.UnreadCounter`);
- имя — `[class*="ChannelTitle"/"title"/"peer"/"name"]`; превью — `[class*="PostPreview"/"preview"]`; аватар — `img[src^=http]`;
- мусор ИСКЛЮЧАЕТСЯ: скрытый для скринридера `vkuiVisuallyHidden` («36 минут назад»), дата `*__date*` («· 36м»), счётчик `UnreadCounter`;
- эмит `__CC_NOTIF__ {src:'vk-list'}` → дальше общая логика мьюта/звука (Правило 2 CLAUDE.md).

**Базовая линия**: первый непустой замер запоминается без отправки; шлём только НОВЫЕ отпечатки «имя|текст». Дедуп внутри прохода.

### Ключевые решения по поведению
- **Каналы ВК (broadcast) УВЕДОМЛЯЕМ** — по явному решению пользователя (2026-07-23): «сообщения надо все». Фильтр каналов не добавляли (можно добавить одной строкой, если передумает).
- **Заголовок вкладки НЕ используем** как сигнал: у vk.ru в заголовке нет счётчика непрочитанных («Мессенджер» без «(N)»).
- Старый toast-наблюдатель оставлен (нетронут) — на случай старого vk.com / edge-страниц.

### Ограничения (честно)
- Ловятся только ВИДИМЫЕ строки списка (vk.ru, вероятно, виртуализирует длинный список) — чат вне видимости можно пропустить.
- Мьют КОНКРЕТНОГО чата в самом ВК хук не видит (знает только мьют на уровне приложения).

### Как откатить / выключить
Убрать блок `_scanVkList`/`_vkListObserver` в `vk.hook.js` (детект отключится, останется старый toast-путь) или `git revert` коммитов v1.2.112–115.

**Связано**: [[features]] (v1.2.109–115), [[webview-injection]] (грабли детекта), [[messengers]] (vk.ru).

---

## ADR — Почему родные уведомления и ServiceWorker мессенджеров намеренно ВЫКЛЮЧЕНЫ (25 июня 2026)

**Статус**: ✅ Действующее решение (с ранних версий; зафиксировано 25 июня 2026 после расследования v1.2.20-1.2.22).

### Что именно выключено
В [`main/utils/sessionSetup.js`](../main/utils/sessionSetup.js) для **каждого** мессенджера (webview-сессии) стоят **два замка**:
1. **Запрет разрешения `notifications`** ([sessionSetup.js:24-31](../main/utils/sessionSetup.js#L24)): `setPermissionRequestHandler` и `setPermissionCheckHandler` возвращают `false` для `notifications`. → сайт мессенджера НЕ может показать ни одного системного уведомления.
2. **Убийство ServiceWorker** ([sessionSetup.js:32-42](../main/utils/sessionSetup.js#L32)): при старте сессии чистится SW storage, и по событию `running-status-changed` (SW пытается запуститься) — снова чистим. → SW не доживает до регистрации, в логе `AbortError: Operation has been aborted`.

### Что за «родные уведомления»
Это **системные всплывашки Windows**, которые делает **сам сайт** мессенджера (через `Notification` API / `ServiceWorkerRegistration.showNotification`). Они в стиле мессенджера (иконка + имя «Макс»/«WhatsApp»), **без наших кнопок, стиля и функций**.

### Почему выключили (полная причина)
У ChatCenter **своя система уведомлений**:
- Перехват новых сообщений через наблюдатель в `monitor.preload` (DOM + хук `Notification`) → событие `__CC_NOTIF__`.
- Показ **своей** плашки/ленты (ribbon, `main/notification.*`) с нашими кнопками «Перейти»/«Прочитано», стэкингом, закреплением, фирменным стилем.

Если оставить родные уведомления включёнными — будет **ДВА уведомления** на каждое сообщение (наше + системная серая всплывашка мессенджера) и **потеря контроля** над стилем/функциями. Поэтому родные намеренно глушим, а показываем только своё.

### Важное следствие (чтобы будущие сессии не копали впустую)
- `AbortError: Failed to register a ServiceWorker … Operation has been aborted` в логе — это **НЕ баг и НЕ проблема `<webview>`**. Это **результат нашего намеренного убийства SW**. Ожидаемо.
- Поэтому затея «перейти на WebContentsView, чтобы оживить SW-уведомления» **НЕ решает задачу**: SW мёртв не из-за webview, а из-за наших замков. **Доказано 25 июня** (v1.2.22, Вариант A): в ОТДЕЛЬНОМ нормальном окне Electron (та же сессия) SW падает с той же ошибкой.

### Когда пересматривать
Только если решим **отказаться от своей системы уведомлений** в пользу родных (большое архитектурное решение: риск двойных уведомлений + потеря наших функций). Тогда: снять оба замка в `sessionSetup.js` + перехватывать/подавлять родные. **Пока — НЕ трогаем.**

**Связано**: [mistakes/electron-core.md](mistakes/electron-core.md) (крах WebContentsView на Win11), [webcontentsview-migration-plan.md](webcontentsview-migration-plan.md) (Вариант A + плюсы/минусы миграции).

---

## ADR — Откат миграции `<webview>` → WebContentsView (20 мая 2026, v0.91.0)

**Статус**: ✅ Принято, откат выполнен

**Контекст**: Electron официально пишет «we recommend to not use the webview tag, consider WebContentsView». Мы попытались мигрировать (16 версий v0.89.41-v0.90.2).

**Что обнаружено**: на Windows 11 + Electron 41 child WebContentsView крашит native main процесс при `addChildView()` + `loadURL`. Подтверждено в Electron GitHub issues:
- [#44934](https://github.com/electron/electron/issues/44934) — App crashes when adding child view to WebContentsView on Windows 11 (closed/not planned)
- [#45367](https://github.com/electron/electron/issues/45367) — addChildView(WebContentsView) не рендерит (closed/not planned)
- [#44897](https://github.com/electron/electron/issues/44897) — preload не загружается в child WebContentsView
- [#47247](https://github.com/electron/electron/issues/47247) — webContents в WebContentsView крашит Electron

**Решение**: **полный откат** к BrowserWindow + `<webview>` — production-tested архитектура работает в проекте с v0.1.0.

**Условия пересмотра**: проверять каждые 6-12 месяцев. Повторная миграция возможна только если:
1. Issue #44934 или #45367 закрыт как «fixed» в Electron release notes
2. Есть rollback план + изолированный production-тест
3. WebContentsView работает на Windows 11 в нашей конфигурации (multi-child views)

**Альтернативы для будущего**:
- Дождаться фикса Electron (не на нашей стороне)
- Полная смена фреймворка (Tauri, Wails) — отдельная задача
- iframe вместо `<webview>` — отвергнут (Telegram/WhatsApp CSP)

**Полный урок и 7 правил для будущих миграций** — в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md) → секция «УРОК v0.89.41-v0.91.0».

---

## ADR — Notification BrowserWindow: итоги серии багов v0.89.15-v0.89.23 (18 мая 2026)

**Статус**: ✅ Принято и реализовано

**Контекст**: за 3 дня (15-18 мая) серия пользовательских жалоб привела к 9 версиям (v0.89.15-v0.89.23) и 4 новым ловушкам (#20-#23) для одного компонента — **notification BrowserWindow** (Messenger Ribbon в `main/notification.*` + `main/handlers/notifHandlers.js` + `main/handlers/notificationManager.js`).

### Какие баги случились и **почему** решили именно так

**1. Ghost hit-test region после `.hide()` на Win11 (v0.89.18, ловушка #20)**

Корневая причина: `transparent: true` + `frame: false` BrowserWindow на Win11 оставляет невидимый hit-test регион после `.hide()` (известная Electron issue #15947).

**Альтернативы** (отклонены):
- ❌ Перейти на non-transparent окно — потеряем кастомный дизайн ribbon
- ❌ Использовать native Notification API целиком — у нас кастомные кнопки «Перейти / Прочитано» / стэкинг / закрепление, нативный API такого не даёт
- ❌ Игнорировать (закрыть глаза) — клики «глотались», UX страдал

**Принятое решение**: helper `safeHideTransparentWindow()` который перед `.hide()` уводит окно за экран (`-30000`) в размер 1×1. Скрытое окно за пределами всех мониторов размером 1px физически не может ловить клики.

**Почему так**: 
- Сохраняет существующий дизайн
- Не требует архитектурного переписывания
- Гарантия на уровне Windows compositor (окно вне всех мониторов)
- 5 точек применения (notif/dock/pin) через единый helper — DRY

---

**2. `setIgnoreMouseEvents(true)` ломал клики (v0.89.22, ловушка #21)**

Корневая причина: в v0.89.18 я добавил `setIgnoreMouseEvents(true)` в helper как «тройную защиту». Но это нарушило **ловушку #27 (v0.71.7)**: ломает `-webkit-app-region: drag` у dock/pin окон. У 5 точек `.show()` не было парного `restoreMouseEvents(false)` → state `true` оставался → клики проходили сквозь видимое окно.

**Альтернативы** (отклонены):
- ❌ Добавить `restoreMouseEvents` во все 5 точек show — fragile, легко забыть в будущем
- ❌ Оставить `setIgnoreMouseEvents` + написать тесты — не закрывает root cause

**Принятое решение**: УДАЛИТЬ `setIgnoreMouseEvents` целиком из helper. Защита от ghost hit-test полностью покрывается через `setBounds(offscreen 1×1) + hide()` — это сам по себе достаточный механизм.

**Почему так**:
- Меньше кода = меньше точек отказа
- Соблюдает ловушку #27 нашего проекта
- Соответствует Electron docs «state persists until explicitly changed» — мы избегаем самого state-management
- Регрессионный тест в pre-commit (`.cjs`) — физически запрещает вернуть `setIgnoreMouseEvents(true)`

---

**3. «Пустая полоса»: slideIn animation + offsetHeight (v0.89.23, ловушка #22)**

Корневая причина: CSS `slideIn` animation 300ms сдвигает element с `translateX(380px)` до `translateX(0)`. `offsetHeight` ignores transform (MDN). Поэтому `calcHeight()` сразу видит финальную height нового element и main process расширяет окно — но element ещё за правым краем визуально → пустая полоса 60-300ms.

**Альтернативы** (отклонены):
- ❌ Убрать slideIn animation целиком — потеря UX-плавности
- ❌ Использовать `getBoundingClientRect()` (учитывает transform) — добавляет ms к перерасчёту, не решает race (element только что добавлен, размер ещё формируется)
- ❌ Hardcode delay 300ms на main — magic number, ломается если CSS animation поменяют
- ❌ Использовать transition height вместо transform translate — более тяжёлая правка, ломает дизайн slideIn

**Принятое решение**: `slideInDone` флаг на element. `calcHeight()` пропускает elements где `slideInDone === 'false'`. После `animationend` event → ставим `'true'` + новый `reportHeight()`. Страховка setTimeout 600ms если `animationend` не сработает.

**Почему так**:
- Использует **event-driven** механизм (animationend) — авторитативное завершение, не угадывание времени
- Страховка через timeout — защита от edge cases (cascade delay, animation overrides)
- Минимальная инвазивность — добавил один dataset attribute + listener, ничего не сломал в существующей логике

---

**4. IPC race `raw=0 items=1` (v0.89.23, ловушка #23)**

Корневая причина: `notif:resize` идёт через async IPC. `reportHeight` использует `setTimeout(fn, 60)` для коалесcинга. Если renderer прислал поздний `resize(0)` от прошлого dismiss ПОСЛЕ того как main process получил новое `notif:show` → main скрывает окно несмотря на наличие items.

**Альтернативы** (отклонены):
- ❌ Включить порядковые номера в IPC сообщения — большая правка, нужны на всех endpoints
- ❌ Убрать setTimeout 60ms — может вызвать множественные resize за короткое время (caterpillar effect при rapid additions)
- ❌ Делать reportHeight synchronously — может вернуть stale layout (нужен flush)

**Принятое решение**: в main process проверять `if (raw=0 && itemsCount > 0) return`. Игнорировать stale `resize(0)` если main УЖЕ знает что есть item. Следующий reportHeight от renderer пришлёт правильное значение.

**Почему так**:
- Использует **авторитативное состояние** main process (`notifItems[]`) — единственная Source of Truth
- Не требует синхронизации между renderer/main — main решает сам по своему state
- Простая проверка, понятная любому коду reader

---

### Общие принципы из всей серии (правила на будущее)

🟢 **Принцип #1**: для CSS-анимируемых свойств — `getComputedStyle()`, не `el.style`. Inline style не отражает CSS keyframes (MDN).

🟢 **Принцип #2**: для определения visual position — `getBoundingClientRect()`, не `offsetHeight`. offsetHeight ignores transform.

🟢 **Принцип #3**: для transparent BrowserWindow на Win11 — `setBounds(offscreen 1×1) + hide()`, БЕЗ `setIgnoreMouseEvents` (ломает app-region drag, ловушка #27).

🟢 **Принцип #4**: при IPC + setTimeout-coalescing — main process не доверяет slепо последнему received значению. Проверять консистентность с авторитативным state.

🟢 **Принцип #5**: при diagnostic logging — читать MDN для каждого свойства которое логируешь. Inline style ≠ computed style ≠ visual state.

### Регрессионная защита (всегда в pre-commit)

`src/__tests__/transparentWindowGuard.test.cjs` падает локально если:
- сырой `notifWin.hide()` без safeHide
- сырой `dockState.win.hide()` без safeHide
- `setIgnoreMouseEvents(true)` вернётся в helper
- safeHide не использует setBounds или offscreen координаты

Это гарантирует что **ловушки #20 и #21 не повторятся** — физически невозможно сделать коммит с регрессией.

### Серия закрыта — что осталось

12 ловушек документировано в [`mistakes/notifications-ribbon.md`](mistakes/notifications-ribbon.md):
- #1-#19: исторические (v0.89.6 → v0.89.18)
- #20: ghost hit-test (v0.89.18)
- #21: setIgnoreMouseEvents ломает клики (v0.89.22)
- #22: пустая полоса от slideIn (v0.89.23)
- #23: IPC race stale resize=0 (v0.89.23)

Diagnostic logging (v0.89.20-21-23) пока **остаётся в коде** — на случай если новый баг проявится. Удалим в отдельном patch'е если 1-2 недели не будет повторений.

**Last verified**: 18 мая 2026, v0.89.23, 608 vitest + 17 cjs + CI ubuntu+windows ✅.

---

## ADR-NEW — `tg-media/` как LRU-кеш под управлением приложения (15 мая 2026, v0.89.17)

**Статус**: ✅ Принято и реализовано

**Контекст**: В v0.89.15 решено НЕ играть медиа из TDLib-папок (нестабильны: `temp/` чистится, `optimizeStorage` удаляет даже completed). Скачанные файлы копируются в `userData/tg-media/<fileId>_<size>.<ext>` через `stabilizeForPlayback()`. Это решило проблему стабильности URL, но создало новую: папка растёт без ограничений (TDLib `optimizeStorage` нашу папку не трогает).

**Решение**: реализовать LRU-кеш для `tg-media/` — точный аналог TDLib `optimizeStorage`:
- **Лимит размера** 1 ГБ
- **TTL** 7 дней
- **Immunity** 5 минут (mtime обновляется при чтении через cc-media handler)
- **wipeAll** для ручной кнопки «Очистить кеш»

**Альтернативы** (отклонены):
- Использовать `readFilePart` TDLib API для streaming — сложно (IPC overhead, backpressure, edge cases). У нас есть локальный диск — копия проще.
- Симлинки `tg-media/file → tdlib-sessions/file` — на Windows требуют админ прав.
- Mirror TDLib cleanup: после `optimizeStorage` сканировать `tg-media/` и удалять файлы, чьи исходники в `tdlib-sessions/` пропали — нужна привязка `tg-media name → tdlib file`. Сложнее чем независимый LRU.
- Префикс `accountId_` в именах для per-account очистки — LRU саморегулируется через TTL, префиксы не нужны (TODO-3 в `code-todo.md`).

**Почему LRU+TTL правильный выбор**:
1. **Стандарт индустрии**: Telegram Desktop, Telegram Web K, WhatsApp, Signal — все используют LRU+TTL
2. **TDLib официально документирует** алгоритм в [optimizeStorage](https://core.telegram.org/tdlib/getting-started#storage-optimization)
3. **Простой и предсказуемый**: пользователь знает что 1 ГБ — лимит, 7 дней — TTL
4. **Безопасный**: immunity 5 минут защищает играющие сейчас файлы

**Реализация**: [`main/native/backends/tgMediaCleanup.js`](tgMediaCleanup.js). 4 точки интеграции: `getCleanupStats`, `media.cleanup`, `tdlibStartup` (фон-чистка при init), `ccMediaProtocol` (touch mtime при read).

**Last verified**: 15 мая 2026, v0.89.17, 20 тестов в `tgMediaCleanup.vitest.js`.

---

## ADR-001 — Electron как платформа (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Нужно приложение для Windows/Mac, которое может отображать веб-версии мессенджеров и читать их DOM.

**Решение**: Electron — единственный вариант, дающий:
- Рендер реальных веб-страниц мессенджеров через WebView/webContents
- Полный доступ к системе (уведомления, трей)
- Доступ к WebContents для инъекции скриптов

**Альтернативы**: Tauri (нет доступа к WebView DOM), NW.js (устарел).

---

## ADR-002 — WebView через `<webview>` тег (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Нужно изолировать каждый мессенджер, хранить его сессию отдельно.

**Решение**: Тег `<webview>` в Electron с уникальным `partition="persist:название"`.

**Причины**:
- Каждый мессенджер — своя изолированная сессия (cookies, localStorage)
- Можно внедрять preload-скрипт для мониторинга
- Пользователь остаётся залогиненным в каждом мессенджере независимо

**Важно**: `<webview>` требует `webviewTag: true` в BrowserWindow webPreferences.

---

## ADR-003 — Чтение сообщений через MutationObserver (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Нужно перехватывать новые входящие сообщения в мессенджерах.

**Решение**: Preload-скрипт в каждом WebView запускает MutationObserver, наблюдает за контейнером сообщений. При появлении нового — передаёт через `ipcRenderer.sendToHost`.

**Альтернативы**:
- Polling через setInterval — дорого, неточно
- Intercepting XHR/WebSocket — сложно, мессенджеры используют шифрование

---

## ADR-004 — ИИ-запросы только в main process (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: API-ключи к ИИ не должны попасть в renderer (доступен через DevTools).

**Решение**: Все запросы к внешним ИИ-API проходят через main process. Renderer только вызывает `window.api.invoke('ai:analyze', message)` и получает готовый ответ.

---

## ADR-005 — electron-store для хранения данных (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Нужно хранить настройки, шаблоны, правила авто-ответа между запусками.

**Решение**: `electron-store` — JSON-файл в userData. Просто, без зависимости от внешней БД.

**Когда пересмотреть**: если данных станет много (>10k шаблонов) — рассмотреть SQLite.

---

## ADR-006 — Zustand для состояния UI (3 марта 2026)

**Статус**: ❌ Отменено (27 апреля 2026, в составе v0.87.87)

**Контекст**: Нужно управлять состоянием: текущий мессенджер, входящие сообщения, варианты ИИ.

**Изначальное решение**: Zustand — минималистичный, без бойлерплейта Redux.

**Почему отменено**: фактически в проекте используется **React hooks + IPC**, а не Zustand. Native-режим (`src/native/store/nativeStore.js`) — кастомный store на React useState + IPC subscriptions, без Zustand-зависимости. См. `native-mode-plan.md` → раздел «Технологический стек»: «Локальный store React hooks + IPC (не Zustand) — Минимум зависимостей, легче на start».

Пакет `zustand` не установлен в `package.json`. Возвращаться к этому решению — не планируется.

---

## ADR-008 — Система лицензий (запланировано)

**Статус**: 📋 Запланировано

**Контекст**: Программа будет продаваться. Нужна защита от несанкционированного использования.

**Решение (предварительное)**:
- Пользователь вводит логин + пароль при первом запуске
- Запрос на сервер лицензий (ctrlcopy.ru или отдельный endpoint)
- Сервер возвращает: `{ valid: true, plan: 'pro', expires: '2026-12-31' }`
- Лицензионный токен кэшируется локально с TTL 24 часа
- При истечении — перепроверка; при отказе сервера — grace period 7 дней

**Что НЕ делать**:
- Не хранить ключ активации в коде (легко извлечь)
- Не делать только офлайн-проверку (легко обойти)
- Не блокировать работу мгновенно при недоступности сервера (плохой UX)

**Этапы реализации**:
1. Экран входа (логин + пароль) при первом запуске
2. IPC `license:check` в main process → fetch к серверу
3. Хранение токена в electron-store (зашифрованный)
4. Проверка при каждом старте + фоновая ре-проверка каждые 12 ч
5. UI: статус лицензии в настройках, дата истечения, кнопка выхода

---

## ADR-007 — Задержка перед авто-ответом (3 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Мгновенные ответы выглядят как бот, могут вызвать бан аккаунта.

**Решение**: Случайная задержка 2–8 секунд (настраиваемая). Имитация "набора текста" если мессенджер поддерживает.

---

## ADR-009 — Per-messenger notification hooks (26 марта 2026)

**Статус**: ✅ Принято

**Контекст**: Notification hooks (override window.Notification, showNotification, спам-фильтры, enrichment) были общими для всех мессенджеров и ДУБЛИРОВАНЫ в 2 файлах (monitor.preload.js + App.jsx). Изменение hook для MAX ломало Telegram. Диагностика добавлялась не в тот файл.

**Решение**: Каждый мессенджер имеет СВОЙ hook файл: `main/preloads/hooks/{type}.hook.js`
- `telegram.hook.js` — без enrichment (title уже содержит имя), `.chatlist-chat` для аватарки
- `max.hook.js` — enrichNotif (title="Макс"), `wrapper--withActions`, _maxPhantom, _editedMark, sticker extraction
- `whatsapp.hook.js` — без enrichment, `span[title]` для аватарки
- `vk.hook.js` — enrichNotif (title="ВКонтакте"), ConvoListItem

**Загрузка**: monitor.preload.js → `fs.readFileSync` → `<script>` tag. App.jsx → IPC `app:read-hook` → `executeJavaScript` (CSP fallback).

**Альтернативы отвергнутые**:
- Один общий файл (Вариант 3) — изменение MAX ломает Telegram
- Конфиг + движок (Вариант 2) — MAX enrichment слишком отличается от Telegram
- Inline код в preload + дубль в App.jsx (было до v0.82.0) — причина многих багов

---

## ADR-010 — Рефакторинг до <1000 строк: план (26 марта 2026)

**Статус**: ✅ ЗАВЕРШЕНО — переплавлено в новую систему лимитов (27 апреля 2026, v0.87.87)

**Изначальный план (март 2026)**: разбить App.jsx (2137), main.js (1719), monitor.preload.js (825) до <1000 строк через выносы.

**Что в итоге сделано** (v0.82.0 → v0.87.86):

1. **Постепенный вынос** (v0.82.0-v0.82.4): notification hooks, AI handlers, notif handlers, unread counters.

2. **Новая система лимитов** (v0.87.68-v0.87.86): вместо «всем <1000» — **разные лимиты по типу пути**:
   - `.jsx` в `components/` → 700, в `native/` → 600
   - `.js` в `hooks/` → 150, в `utils/` → 300, в крупных интеграциях → 500
   - `main/main.js`, `App.jsx` → 600
   - HTML/CSS → 800, JSON → 500
   - Тесты → 400

3. **План разбиения 7/7** (v0.87.76 → v0.87.86): все рискованные файлы разбиты:
   - `App.jsx` 2137 → **475** строк
   - `main/main.js` 1719 → **484** строки
   - `monitor.preload.js` 825 → **разделён** на utils/* + hooks/*
   - `telegramHandler.js` 1260 → **~80** строк (тонкий роутер)
   - `InboxMode.jsx` 789 → **567** строк
   - `notification.html` 902 → **12** строк (HTML+CSS+JS разделены)
   - `navigateToChat.js` 300 → **22** строки

4. **Защита от регрессии**:
   - `fileSizeLimits.test.cjs` — авто-сканирование всех файлов с правилами по типу
   - Pre-push git hook — блокирует push при упавшем тесте
   - 3 защиты от «тихих дыр»: (A) нет правила, (B) устаревшее исключение, (C) неизвестное расширение

**Текущее состояние** (см. `code-limits-status.md`): 5 low-priority исключений (webviewSetup, messengerConfigs, consoleMessageHandler, dockPinHandlers, notification.js). Все рискованные — без исключений.

**Документация**: правила лимитов теперь в CLAUDE.md → раздел «🚫 Лимиты размера файлов ВСЕХ типов». Снапшот размеров — в `code-limits-status.md`.
  - **ТРЕБУЕТ ОТДЕЛЬНУЮ СЕССИЮ** — 614 строк перемещения + обновление imports + проброска 20+ props

---

## ADR-010 — Preload файлы .cjs (6 апреля 2026)

**Статус**: ✅ Принято

**Контекст**: package.json `"type": "module"` → Node.js считает .js файлы ESM → `require()` в preload не работает → `window.api` не создаётся → ВСЁ IPC сломано.

**Решение**: Все preload файлы переименованы в .cjs. Тест smokeTest проверяет что .js вариантов НЕ существует.

**Ловушка 53**: Electron 41 + Node 22 строго следуют "type":"module".

---

## ADR-011 — Telegram hash навигация с c/u prefix (6 апреля 2026)

**Статус**: ✅ Принято

**Контекст**: "Перейти к чату" не работало для каналов Telegram. DOM-поиск не находит чат если он в другой папке. location.hash без -100 prefix не открывает каналы.

**Решение**: Парсить chatTag prefix: `c` → `-100` + peerId (канал), `u` → peerId (пользователь). Hash навигация как первый метод, DOM-поиск как fallback.

**Ловушка 57**: Telegram Web K требует -100 для каналов в hash.

---

## ADR-012 — Notification hooks: !body.trim() вместо body.length < 2 (6 апреля 2026)

**Статус**: ✅ Принято

**Контекст**: 1-символьные сообщения ("С", "+", "1") блокировались спам-фильтром _isSpam в hooks. Клиент ответил "С" → уведомление не показалось.

**Решение**: В _isSpam() всех 4 hooks: `body.length < 2` → `!body.trim()`. Мессенджер сам фильтрует мусор — если Notification API вызван, это реальное сообщение. enrichNotif (DOM-контекст) не тронут.

**Ловушка 56**: Порог был скопирован из extractMsgText (DOM-сканирование) при создании per-messenger hooks.

---

## ADR-013 — НЕ использовать visibility:hidden для WebView + принудительный resize при активации (6 апреля 2026, дополнено 14 апреля 2026 v0.86.5)

**Статус**: ✅ Принято (расширено)

**Контекст (v0.85.6)**: visibility:hidden было добавлено для экономии GPU. Но Chromium ПОЛНОСТЬЮ останавливает загрузку hidden WebView — страница не рендерится пока не станет visible.

**Решение (v0.85.6)**: Скрытие через zIndex + pointerEvents. Чёрный экран решён через `disable-gpu-compositing` в main.js.

**Ловушка-1**: Вторая вкладка Telegram и все остальные не загружались при старте.

**Дополнение (v0.86.5, Ловушка 64)**: Даже при правильном `zIndex+pointerEvents` у адаптивных SPA (Telegram Web K) возможен **layout lock-in**: при инициализации в неактивной вкладке Telegram фиксирует mobile-layout и column-center = 0×0. После активации resize event не приходит → остаётся пустая чёрная правая колонка.

**Решение (v0.86.5)**: в App.jsx — `useEffect` на `activeId`. При смене активной вкладки принудительно шлём `window.dispatchEvent(new Event('resize'))` в WebView через `executeJavaScript`. Три повтора: 0ms, 150ms, 500ms — чтобы гарантированно поймать момент когда Telegram готов пересчитать layout.

**Ловушка-2**: без resize event кастомные Telegram-вкладки (добавленные пользователем после стандартной) показывали чёрный экран при клике на чат.

**Диагностика оставлена включённой**: `__CC_DIAG__probe[...]` через executeJavaScript (12 полей: doc/url/body/html/tg-selectors/column-center/bubbles/canvas/img/webgl/err). Помогает быстро находить похожие проблемы layout lock-in для других мессенджеров.

---

## ADR-014 — Telegram навигация: .chatlist-chat[data-peer-id] (7 апреля 2026)

**Статус**: ✅ Принято

**Контекст**: "Перейти к чату" в Telegram открывал группу вместо личного чата. `data-peer-id` пользователя присутствует на многих элементах DOM: аватарка в chatlist, аватарка внутри группового чата, профиль, пересланные сообщения.

**Решение**: Искать `.chatlist-chat[data-peer-id="X"]` — только в списке чатов. НЕ использовать `querySelector('[data-peer-id="X"]')` без фильтра.

**Неудачные попытки**:
- `.closest('a').href` — href принадлежал другому чату
- `location.hash = '#peerId'` — Telegram Web K не реагирует на hash
- `closest('[data-peer-id]')` — возвращал тот же неправильный элемент

**Ловушка 58**: `data-peer-id` = user ID, он есть на аватарках участников внутри групповых чатов.

---

## ADR-015 — Лог-файл: путь ЦентрЧатов, не chat-center (7 апреля 2026)

**Статус**: Информация

**Контекст**: app.getPath('userData') = %APPDATA%/ЦентрЧатов/ (кириллица). package.json name = chat-center, но Electron использует productName. Данные мессенджеров (Partitions) в %APPDATA%/chat-center/, а лог — в ЦентрЧатов.

**Важно для AI**: При чтении лога: os.homedir()/AppData/Roaming/ЦентрЧатов/chatcenter.log

---

## ADR-016 — Multi-account нативного Telegram: Map клиентов + единая лента (28 апреля 2026)

**Статус**: 📋 Запланировано (реализация в v0.87.104)

**Контекст**: В v0.87.103 пользователь обнаружил что при добавлении второго Telegram-аккаунта в native режиме первый исчезает. Расследование:

1. `state.client` — singleton (один TelegramClient на процесс)
2. `state.currentAccount` — singleton (один аккаунт)
3. `state.sessionPath` — один файл `tg-session.txt`
4. UI (`nativeStore.js`: `accounts: []`) **уже** поддерживает несколько (массив)
5. План [`native-mode-plan.md`](./native-mode-plan.md) в архитектуре (`accountId` поле, sidebar аккаунтов, SQL `accounts` table) тоже подразумевает multi-account
6. **Но конкретный шаг реализации был упущен** — Шаг 2 описывал MVP с одним файлом сессии

При login второго аккаунта `state.client` пересоздаётся, `tg-session.txt` перезаписывается → первый аккаунт навсегда теряется.

**Решение**:

### State refactor (Map вместо singleton)

```js
// telegramState.js
state.clients = new Map()         // accountId → TelegramClient
state.accounts = new Map()        // accountId → NativeAccount
state.activeAccountId = null      // текущий выбранный — для UI и нового login
state.sessionsDir = null          // папка %APPDATA%/ЦентрЧатов/tg-sessions/
state.chatEntityMap = new Map()   // accountId → Map<chatId, entity> (двухуровневая)
```

### Сессии — отдельный файл на аккаунт

```
%APPDATA%/ЦентрЧатов/
├── tg-sessions/
│   ├── tg_12345.txt    ← сессия аккаунта BНК
│   ├── tg_67890.txt    ← сессия аккаунта Avtoliberty
│   └── tg_24680.txt    ← сессия третьего аккаунта (если будет)
└── tg-avatars/        ← общая (имя файла = userId, уникален между аккаунтами)
```

### Маршрутизация по chatId

`chatId` уже имеет формат `{accountId}:{chatNumericId}` (`mapDialog`, telegramChats.js строка 29). На стороне backend парсим: `accountId = chatId.split(':')[0]` → берём правильный client из Map.

### UI — единая лента (Вариант B)

| Поведение | Описание |
|---|---|
| Список чатов | Все чаты со всех аккаунтов в одном scroll, отсортированы по `lastMessageTs` |
| Цветной бейдж | У каждого чата маленький бейдж с инициалами/цветом аккаунта (BНК / AV) |
| Фильтр сверху | Кнопки «Все / БНК / Avtoliberty» — временно показать только один |
| Sidebar | Слева мини-иконки аккаунтов, клик ставит фильтр (не переключает контекст) |
| Кнопка «+» | Запускает login flow → создаётся НОВЫЙ TelegramClient в Map |
| Отправка | По выбранному chatId определяется accountId → используется правильный клиент |
| Уведомления | Звук + ribbon одинаково на ВСЕ аккаунты с лейблом аккаунта |

### autoRestoreSession → сканирует папку

```js
const files = fs.readdirSync(state.sessionsDir).filter(f => f.endsWith('.txt'))
for (const f of files) {
  const accountId = f.replace('.txt', '')
  await restoreOne(accountId)
}
```

### Миграция старого файла

Старый `tg-session.txt` при первом запуске после v0.87.104 → читаем → `getMe()` → переименовываем в `tg-sessions/{id}.txt` → удаляем старый. Без потери первого аккаунта.

**Ловушки**:

- ❌ **НЕ забыть** `accountId` в `chatId`. Формат `{accountId}:{chatNumericId}` уже используется. При маршрутизации `chatId.split(':')[0]` = accountId.
- ❌ **НЕ держать** `state.client` (singleton) и `state.clients` (Map) одновременно — расхождение приведёт к багам. Заменить ВСЕ обращения.
- ❌ **NewMessage event handler** регистрируется на каждом client отдельно. Если забыть — входящие на втором не приходят.
- ❌ **Cleanup при logout одного** — НЕ должен трогать чужие файлы. `performFullWipe()` перенаправить на per-account scope.
- ❌ **chatEntityMap** теперь двухуровневый: `state.chatEntityMap.get(accountId).get(chatId)`.

**Затрагиваемые файлы** (12 файлов):

`main/native/`: telegramState.js, telegramAuth.js, telegramHandler.js, telegramChats.js, telegramChatsIpc.js, telegramMessages.js, telegramMedia.js, telegramCleanup.js
`src/native/`: store/nativeStore.js, store/nativeStoreIpc.js, components/InboxChatListSidebar.jsx, components/LoginModal.jsx

**Связано**: [native-mode-plan.md](./native-mode-plan.md) Шаг 2.5 (новый), features.md v0.87.104

---

## ADR-017 — Панель свёрнутых задач (dock) и карточка закрепа (pin): позиционирование и удержание поверх всех (17 июля 2026, v1.2.59–v1.2.64)

**Статус**: ✅ Действующее (серия фиксов v1.2.59–v1.2.64). Код: [main/handlers/dockPinState.js](../main/handlers/dockPinState.js), [main/handlers/dockPinHandlers.js](../main/handlers/dockPinHandlers.js), [main/pin-dock.js](../main/pin-dock.js), [main/pin-dock.css](../main/pin-dock.css), [main/pin-notification.html](../main/pin-notification.html).

### Что за окна
- **Карточка закрепа (pin)** — отдельное прозрачное `BrowserWindow`, появляется при 📌; можно свернуть в док.
- **Панель задач (dock)** — прозрачная полоска снизу с вкладками свёрнутых задач; `alwaysOnTop`, `skipTaskbar`.

### Проблемы и как решены

| Проблема (что было) | Версия | Как решено | Как должно работать |
|---|---|---|---|
| Свёрнутая карточка не разворачивалась — клик давал «пустоту» | v1.2.59 | `safeHide` уводил окно за экран в 1×1, а `dock:show-pin` делал только `show()`. Запоминаем `savedBounds` перед сворачиванием, возвращаем при показе (или центр экрана) | Клик по свёрнутой задаче → карточка открывается на месте |
| Двойной клик открывал Telegram, а не карточку | v1.2.59 | Убран `dblclick`→`goToChat`; любой клик = карточка. «В чат» осталась в правом клике и кнопкой в карточке | Клик = наша карточка |
| Картинка без подписи → пустая карточка | v1.2.59 | При пустом тексте показываем «📷 Фото» | Карточка не пустая |
| Пустая зона над доком ловила клики | v1.2.60 | Прозрачное окно НЕ пропускает клики (transparent = только отрисовка; клик-насквозь лишь через `setIgnoreMouseEvents`, он убран — ломал drag). Резерв `DOCK_PREVIEW_RESERVE` 420→0; меню/подсказка растят окно по требованию | Под доком (где пусто) клик проходит в программу снизу |
| Аватар не показывался в карточке | v1.2.60 | Прокинут `iconDataUrl` через `createPinBtn`→`pinMessage`→`pin:data` | В карточке виден аватар (или эмодзи) |
| Док уходил ЗА панель задач Windows | v1.2.61 | Позиция по `display.workArea` (без панели задач), а не `display.bounds` (весь экран) + кламп | Док стоит НАД панелью задач |
| Док терял «поверх всех» при клике по панели задач | v1.2.62 | Периодический реассерт `setAlwaysOnTop('screen-saver')` раз в 1с пока док видим | Док сам возвращается наверх |
| Возврат был с задержкой ~1с | v1.2.63 | Мгновенный реассерт по событиям главного окна `blur/focus/minimize/restore` | Возврат сразу |
| Док мог уехать при смене монитора/масштаба | v1.2.63 | `screen.on('display-metrics-changed')` → пересчёт в `workArea` | Остаётся над панелью задач при смене экрана |
| Полоска дёргалась вниз при подсказке/меню | v1.2.64 | Полоска была flex-child при `min-height:100vh` → рост окна пересчитывал раскладку. Приклеена к низу через `position:fixed;bottom:0` (sticky-overlay) | Подсказка/меню появляются над полоской, полоска не двигается |

### Ключевые принципы (чтобы не повторять)
1. 🥇 **`setBounds` на Windows не плавный** (`animate:true` только macOS) → анимация CSS ВНУТРИ окна, `setBounds` на финальную высоту; видимый элемент делать независимым от native-resize.
2. 🥇 **`transparent:true` ≠ клик-насквозь** — это только отрисовка. Клик проходит вниз лишь через `setIgnoreMouseEvents` (у нас убран — ломал drag). Не держать больших прозрачных «резервных» зон в окне.
3. 🥇 **Позиция у края экрана — по `display.workArea`**, не `display.bounds` (bounds включает панель задач).
4. **Удержание поверх панели задач** — периодический реассерт + реассерт по событиям окна; полной гарантии «поверх активной панели задач/Пуска» стандартный Electron не даёт.
5. **Блок, приклеенный к краю окна, которое меняет размер** — `position:fixed`, НЕ flex-child (иначе layout-shift/дёрг). См. память sticky-overlay + ловушки #22/#23 в [mistakes/notifications-ribbon.md](./mistakes/notifications-ribbon.md).

**Связано**: features.md v1.2.59–v1.2.64; [mistakes/notifications-ribbon.md](./mistakes/notifications-ribbon.md) (ловушки #20/#21/#22/#23/#27 — прозрачные окна, «пустая полоса», ghost hit-region).

---

## ADR-018 — Dock: вертикаль по стабильному якорю + можно держать на панели задач (уточнение ADR-017) (2026-07-20, v1.2.80–v1.2.89)

**Статус**: ✅ Действующее (серия фиксов v1.2.80–v1.2.89). Продолжение и уточнение [[ADR-017]]. Код: [main/handlers/dockPinState.js](../main/handlers/dockPinState.js), [main/handlers/dockPinHandlers.js](../main/handlers/dockPinHandlers.js), [main/pin-dock.js](../main/pin-dock.js). Коммиты: v1.2.89 = `82b45ac`, v1.2.87 = `ac825da`, v1.2.82 = `233bd29`, v1.2.80 = `4eee1a1`.

### Контекст
После ADR-017 всплыли ещё дефекты позиционирования дока: полоска не видна после «Свернуть»; уходит выше/за панель задач после перезапуска; **сползает вниз под панель задач при добавлении/удалении вкладок**. Разбирались строго (5 версий причины + дока Electron 42 + временные логи `[dock-diag]`, убраны в v1.2.87/88).

### Решения
1. **Окну дока — `backgroundThrottling:false` + размер сообщать напрямую без `rAF`** (v1.2.80). У скрытого окна `rAF` засыпает (ловушка #28) → `reportSize` не доходил → полоска не того размера/не видна. Как у окна-подсказки.
2. **Нижний предел позиции = низ ЭКРАНА (`display.bounds`), а не рабочей области (`workArea`)** (v1.2.82). Пользователь хочет держать полоску НА панели задач Windows (она «поверх всех», видна). ⚠️ Это **уточняет принцип №3 ADR-017** (там было «по `workArea`»): по умолчанию первый запуск — над панелью задач, но сохранённую позицию разрешаем опускать до низа экрана.
3. **Убрано «прилипание» (snap) к краям экрана** (v1.2.84) — мешало точному позиционированию. `moved` только сохраняет позицию (с клампом по низу экрана).
4. **Вертикаль дока — по СТАБИЛЬНОМУ якорю `dockState.baselineTopY`, а не из живой `getBounds().height`** (v1.2.89, главное). Корень сползания: `dock:resize` считал `newY = bounds.y + bounds.height − totalH`, но высота окна (хардкод 48) ≠ контент (~30-37) + DPI-округление → ошибка накапливалась на add/remove (мимо дед-бэнда), клампа Y не было. Теперь `baselineTopY` меняется только при реальном drag; `dock:resize`/`ctx-menu-space` берут вертикаль из него; добавлен кламп Y; `setDockBoundsSilent` (флаг `suppressMoved`) не даёт программному `setBounds` считаться drag'ом; `moved` игнорирует офскрин (safeHide).

### Ключевые принципы (чтобы не повторять)
1. 🥇 **Лента дока всегда один ряд** (`inline-flex; white-space:nowrap`, без `flex-wrap`) → высота постоянна → вертикаль пересчитывать не нужно.
2. 🥇 **Не выводи позицию окна из его же живой `getBounds()` на каждом resize** — держи сохранённый якорь, двигай только на действие пользователя.
3. 🥇 Дока Electron 42: `setBounds` не порождает `will-move`/`will-resize`; `move`/`moved` на Windows дока не отрицает → защищаться флагом `suppressMoved`.
4. **Конвейер уведомления не прозрачен**: новое поле payload надо добавлять в `showCustomNotification` (сигнатура + объект `data`), иначе теряется до окна (баг имени аккаунта v1.2.83→87).

**Связано**: [[ADR-017]]; features.md v1.2.80–v1.2.89; [mistakes/notifications-ribbon.md](./mistakes/notifications-ribbon.md) (ловушки: «Док: не пересчитывай вертикаль из живой высоты», «Уведомление теряет поля payload», «CSS display:none vs style.display=''»).

---

## ADR-019 — Превью фото/альбома в уведомлении: только для native (API), WebView оставляем текстом (2026-07-21, v1.2.90–v1.2.93)

**Статус**: ✅ Действующее решение (закрытый вопрос). Расследование завершено, реализацию для WebView НЕ делаем. Код перехвата: [main/preloads/hooks/telegram.hook.js](../main/preloads/hooks/telegram.hook.js). Коммиты расследования: v1.2.90 `0ad0c41`, v1.2.92 `f15e871`, закрытие v1.2.93.

### Вопрос
У нативного Telegram (TDLib) уведомление показывает превью фото/альбома (фича v1.2.74). У WebView-Telegram (веб-версия в `<webview>`) уведомление показывает только слово «Альбом». Можно ли сделать так же для WebView?

### Что выяснили (факты, диагностика v1.2.90/92)
- WebView-уведомления перехватываются через подмену `window.Notification` / `ServiceWorkerRegistration.showNotification` в `telegram.hook.js`. Оттуда доступны только `title`, `body`, `icon`, `tag`.
- Диагностический лог `__CC_DIAG__tgimg` при реальном альбоме (2026-07-21) дал **`tgimg=N`**: поле `opts.image` браузерного уведомления ПУСТОЕ. То есть Telegram Web НЕ кладёт фото сообщения в уведомление — только текст «Альбом» и `icon=blob:` (аватар отправителя).
- Вывод: фото альбома существует только в DOM страницы Telegram Web (как `blob:`-картинки), в перехватываемое уведомление оно не попадает.

### Решение и почему
**Оставляем WebView-уведомление текстом («Альбом»).** Единственный способ показать фото — доставать его из DOM страницы (DOM-скрейпинг), а это:
- **Тайминг**: уведомление приходит раньше, чем `<img>` отрисован в ленте (ленивая подгрузка) → часть альбомов не покажется.
- **Хрупкость**: у версий Telegram Web (K/Z) разная вёрстка, точные селекторы фото не зафиксированы.
- **Клик «в полный размер» не заработает** — он завязан на TDLib, которого у WebView нет.
- **Непроверяемо автотестами** (окна уведомлений + инъекция в WebView).

Цена/польза не оправдана ради превью в уведомлении веб-версии. Native-версия (TDLib) фото показывает — это остаётся штатным путём для тех, кому важно превью.

### Если понадобится в будущем (эскиз, НЕ реализовано)
Инфраструктура частично готова: конверсия `blob:`→`data:` через canvas уже есть (для аватаров, `consoleMessageHandler.js` / `telegram.hook.js`); окно уведомления рисует `data:`-картинки и переиспользует album-рендер (`notification-helpers.js renderAlbumGrid`). Шаги: (1) в `telegram.hook.js` при body «Альбом» найти баблы сообщения в DOM, собрать `<img>` → `data:`; (2) прокинуть как поле `album` в payload (контракт как в [nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js) `groupedId`); (3) обработать тайминг ретраем. Начинать — с диагностического дампа DOM, чтобы найти селекторы. (гипотеза выполнимости — не проверено на реальном DOM.)

**Связано**: features.md v1.2.74 (native альбом), v1.2.90/92/93 (расследование WebView); [[ADR-016]] (native Telegram).

## ADR-020 — Единый вид карточки уведомления «Стопка» + одиночное фото «размытый фон» (2026-07-21, v1.2.96–v1.2.100)

**Статус**: ✅ Действующее решение. Коммит серии: `8a77af7` (v1.2.100). Код: [main/notification.js](../main/notification.js), [main/notification-helpers.js](../main/notification-helpers.js), [main/notification.css](../main/notification.css). Требует визуальной проверки (окно уведомления не тестируется без запуска) — пользователь подтвердил вид 2026-07-21.

### Проблема (что было не так)
Карточка кастомного уведомления была горизонтальной: аватар в отдельном левом столбце, а имя+текст+фото — в узкой правой колонке (`.text-wrap`). Отсюда три беды: слева много пустого места; одиночное фото рисовалось маленькой «плиткой» с `background-size:cover` → **вертикальное фото обрезалось** (терялись верх/низ); имя владельца учётной записи (напр. «БНК») в карточке не показывалось.

### Решение
1. **Раскладка «Стопка» для ВСЕХ карточек** (класс `.notif-item.layout-stack`, вешается на каждую карточку): шапка `.notif-head` — флекс-ряд «крупный аватар (50px) + колонка (имя + источник)», ниже — текст/фото на всю ширину `.text-wrap`. Старую мелкую метку мессенджера сверху (`.messenger-name`) прячем.
2. **Источник в шапке** — строка `.notif-source` = `[messengerName, accountName].filter(Boolean).join(' · ')` («Telegram · БНК»), тот же формат, что подсказка закрепа ([main/pin-tooltip.html](../main/pin-tooltip.html)). `accountName` в payload доходит с v1.2.87 (см. ловушку в notifications-ribbon.md).
3. **Одиночное фото — «размытый фон»** (класс `.single-photo`, только когда `album.id` начинается с `single_`): вместо `cover` строятся ДВА слоя внутри плитки — `.sp-blur` (та же картинка `cover` + `filter:blur(20px) brightness(.55)` + `scale(1.2)` = размытый фон в поля) и `.sp-main` (`contain` = фото ЦЕЛИКОМ, ничего не режется). Рамка `aspect-ratio:3/2`.
4. **Медиа-группа (альбом 2×2) НЕ затронута** — ветки `.single`/`.single-photo` включаются только при `single_*`; у альбома `album.id` числовой (groupedId).

### Как работает / крайние случаи / откат
- Сборка шапки вынесена в чистый helper `buildStackHeader(avWrap, sender, messengerName, accountName)` в notification-helpers.js — потому что `notification.js` на потолке размера (лимит 730 строк, см. `fileSizeLimitsExceptions.cjs`); в notification.js заменена одна строка (`appendChild(sender)` → `appendChild(buildStackHeader(...))`). `appendChild` ПЕРЕМЕЩАЕТ существующий аватар в шапку (MDN), дублей нет.
- Одиночное фото без готового превью → показывается `strippedThumb` целиком (мелкий) + крутилка; чёткое превью догружается отдельно и обновляет ОБА слоя (`applyAlbumSharp`). Если превью не пришло за **8 секунд** — крутилка снимается страховкой (`setTimeout(... remove('loading'), 8000)`, только для одиночного фото).
- Нет messengerName/accountName → источник не рисуется, показывается только имя.
- Откат: `git revert 8a77af7`, либо вручную убрать классы `layout-stack`/`single-photo` в notification.js и блоки `.layout-stack`/`.notif-head`/`.single`/`.sp-blur`/`.sp-main` в notification.css.

### Как проверено
`npm run test:vitest` — 1949 тестов зелёные (в т.ч. `albumLiveCard.vitest.js`: плитка `.single` с двумя слоями, `applyAlbumSharp` на оба слоя, снятие крутилки по фейковому таймеру); `npm run lint` — 0; `fileSizeLimits` — 511/511. Вид на экране — подтверждён пользователем.

### Известный долг (не сделано)
- Плитки **альбома** (несколько фото) не имеют такой же 8-секундной страховки от «вечной» крутилки — при сбое загрузки чёткого превью они остаются размытыми с крутилкой. Отдельная задача (нужно решить: при снятии показывать размытие или мелкое чёткое).

**Связано**: [[ADR-019]] (превью фото только для native), features.md v1.2.96–v1.2.100, ловушка «Карточка уведомления: cover режет фото + вечная крутилка» в mistakes/notifications-ribbon.md.

## ADR-021 — Терминальное состояние окна уведомления: чистое решение + «сторож» (2026-07-23, v1.2.106–v1.2.107)

**Статус**: ✅ Действующее решение. Коммит: `7813235` (v1.2.107). Код: [main/handlers/notifResizeDecision.js](../main/handlers/notifResizeDecision.js), [main/handlers/notifHandlers.js](../main/handlers/notifHandlers.js). Требует визуальной проверки (окно не тестируется без запуска); чистая функция покрыта юнит-тестом.

### Проблема
Окно уведомления — прозрачное, БЕЗ click-through (setIgnoreMouseEvents убран в v0.89.22, иначе ломался drag pin/dock). Значит любое ВИДИМОЕ окно, даже пустое, перехватывает клики в своём прямоугольнике → «невидимая стена» до перезапуска. Показ/скрытие управляется отчётами высоты от renderer (`notif:resize`), а этот путь событийный и имеет краевые случаи, где окно остаётся видимым пустым: (1) осиротевший положительный отчёт (`height>0` уже после закрытия — гонка при быстрых уведомлениях); (2) потерянный терминальный сигнал `rendererPure` (окно «уснуло»); (3) ghost-регион Win11 после hide.

### Решение (две части)
1. **Чистая функция-решение** `decideNotifResize({height, itemsCount, rendererPure})` → `'clear-hide' | 'ignore' | 'hide' | 'show'`. Все правила терминального состояния (ловушка #26 rendererPure; v0.89.23 «не прятать по стале-0 при наличии сообщений»; v1.2.106 «не показывать пустое окно при `height>0 && items=0`») собраны в ОДНОМ месте и покрыты поведенческим тестом. Обработчик `notif:resize` только исполняет действие (side-effects). Причина выноса: раньше логика жила внутри `ipcMain.on` и «проверялась» только текстовым grep'ом ([notificationWindowBounds.test.cjs]) — grep не ловит неверную работу (прецедент [[ADR-018]]-серии / v1.2.91).
2. **Сторож (watchdog)** — `setInterval` 5с в `notifHandlers.js`: если окно ВИДИМО и `getNotifItems().length===0` два тика подряд (~10с) → принудительный `safeHideTransparentWindow`. Это событийно-НЕзависимая страховка: ловит ЛЮБОЙ путь застревания (1/2/3), а не только известный. Обычное закрытие (<0.5с) под сторожа не попадает (не переживает 2 тика).

### Почему сторож, а не только точечный фикс
Точечная защита (v1.2.106) закрывает конкретную гонку, но не гарантирует от новых путей (Win11-quirk, будущий рефактор). «Невидимая стена» — дорогой для пользователя сбой (только перезапуск). Дешёвый периодический смотритель (одна проверка раз в 5с) окупается: сбой самоисчезает за ~10с вместо перезапуска. Цена — вечный таймер в main (гейт по `isVisible && items===0`, почти всегда no-op).

### Крайние случаи / откат
Сторож не трогает окно при обычном закрытии (нужно 2 тика подряд); при быстрой череде уведомлений `items>0` → не срабатывает. Диагностика: логи `[notif-resize] HIDE ... items=0` и `[notif-watchdog] ... → прячу`. Откат: `git revert 7813235` (или убрать `setInterval` + вернуть решение inline).

### Как проверено
Юнит-тест `notifResizeDecision.vitest.js` (6 проверок, все ветки); полный `npm run test:vitest` — 1962 зелёные; линт 0; лимиты 513/513. Поведение окна на экране — ожидает визуального подтверждения пользователем.

**Связано**: features.md v1.2.106–v1.2.107; ловушка «Невидимая стена» в mistakes/notifications-ribbon.md; исторические ловушки #20/#21/#26 (ghost-регион, setIgnoreMouseEvents, terminal state) в notifications-ribbon-history.md.

## ADR-022 — Имя автора в превью списка чатов: единое правило в shared/, но с «зеркалом» в живом пути (2026-07-24, v1.2.130–v1.2.131)

**Статус**: ✅ Действующее решение (ожидает визуальной проверки пользователем — строка чата не тестируется без запуска). Код: [shared/chatPreviewSender.js](../shared/chatPreviewSender.js), [main/native/backends/tdlibMapper.js](../main/native/backends/tdlibMapper.js), [src/native/store/nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js), [src/native/components/ChatListItem.jsx](../src/native/components/ChatListItem.jsx).

### Вопрос
В строке чата надо показывать перед превью имя автора последнего сообщения — «Мария: …» для чужих в группах/форумах и «Вы: …» для своих; в каналах и личке — без префикса. Превью собирается в ДВУХ местах: при первичной загрузке чатов (main-процесс, `mapChat`) и при каждом новом сообщении (renderer, `nativeStoreIpc` обработчик `tg:new-message`). Как не завести две расходящиеся копии правила «кому показывать имя»?

### Что выяснили (факты)
- TDLib даёт `message.is_outgoing` (своё/чужое) и `sender_id` (`messageSenderUser`/`messageSenderChat`) — офиц. дока message. Имя автора TDLib отдельно НЕ кладёт в сообщение: резолвится из `userCache`/`chatCache` (`userDisplayName`/`chatDisplayName`) в момент маппинга (уровень 2, `tdlibClient.js`).
- `mapChat` (main) сам справочников имён не имеет — имя автора last_message резолвит caller `getAccountChats` ([tdlibClient.js](../main/native/backends/tdlibClient.js)) и передаёт в `mapChat` через `extras.lastMessageSender` + `extras.lastMessageIsOutgoing`.
- `type` у чата — `'user' | 'group' | 'channel'`; форум = `type:'group'` + `isForum:true`, то есть под правило «группа» попадает и форум (это верно — у форума есть авторы).
- `nativeStoreIpc.js` — на потолке размера (660/660, исключение в fileSizeLimitsExceptions.cjs). Добавление строки `import` дало 661 > 660 → тест лимитов упал.

### Решение
1. **Единый источник правды** — чистая функция `lastSenderLabel(type, senderName, isOutgoing)` в КОРНЕВОМ [shared/chatPreviewSender.js](../shared/chatPreviewSender.js) (паттерн cross-process, как `shared/notifAlbum.js`): `type!=='group'` → `''`; исходящее → `'Вы'`; иначе → `senderName || ''`. Импортируется маппером (main) и покрыта юнит-тестом.
2. **Осознанное «зеркало» в живом пути** — в `nativeStoreIpc.js` то же правило записано ОДНОЙ inline-строкой (без импорта), т.к. импорт не влезает в потолок файла. Помечено комментарием «правило = shared/chatPreviewSender.js, держать синхронно». Это сознательный компромисс: функцию использует и тестирует маппер, а живой путь дублирует её в одну строку до разгрузки файла.
3. **Рендер** — [ChatListItem.jsx](../src/native/components/ChatListItem.jsx) рисует `chat.lastMessageSenderName` цветом акцента перед текстом; «Вы» и «Мария» идут одной веткой. Плюс в этом же релизе: время последнего сообщения справа на линии имени (util [formatChatListTime.js](../src/native/utils/formatChatListTime.js)) и отдельный значок 🗂️ для форума (`typeIcon`).

### Почему не импортировать в живой путь (компромисс)
Файл на потолке и его параллельно правит другой разработчик (`pickNotifTitle`). Разгрузка (вынос части обработчиков) — отдельная задача с риском конфликта. Дешевле оставить 1-строчное зеркало с явным указателем, чем сейчас резать контестируемый файл. Долг зафиксирован как [[code-todo]] TODO-14.

### Крайние случаи / откат
Нет last_message → префикса нет; входящее без имени → `''` (не рисуем «: »); канал/личка → `''`; форум → как группа. Откат: удалить `shared/chatPreviewSender.js` + вернуть inline-правило в маппере/сторе (в `nativeStoreIpc.js` — вручную, т.к. файл общий с другим разработчиком).

### Как проверено
Юнит: `chatPreviewSender.vitest.js` (5), `mapChatLastSender.vitest.js` (исходящее→«Вы»), `formatChatListTime.vitest.js` (6), снапшоты `ChatListItem.vitest.jsx` обновлены и объяснены. `node --check` OK; eslint 0; лимиты 520/0 (renderer-бюджет 31150→31300 с обоснованием в v1.2.130). Вид строки на экране — ожидает визуального подтверждения.

**Риск-долг**: ~~правило в двух местах (функция + зеркало) может разъехаться~~ → **снято в v1.2.133** (TODO-14 закрыт): блок превью вынесен в `nativeStoreLastMsgIpc.js`, освободив место под импорт; и живой путь, и вынесенный модуль зовут `lastSenderLabel` — зеркало убрано.

### Обновление v1.2.133 — залипание имени через `tg:chat-last-message` закрыто (полный фикс)
Ревью v1.2.131 нашло: путь `tg:chat-last-message` (TDLib `updateChatLastMessage` — при смене последнего сообщения, в т.ч. удалении) менял ТЕКСТ превью, но не имя автора → показывался старый автор с новым текстом. Факт уровня 1: [updateChatLastMessage](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_chat_last_message.html) шлётся отдельно от `updateNewMessage`. Фикс: событие теперь несёт `senderName`+`isOutgoing` (резолв в [tdlibClient.js](../main/native/backends/tdlibClient.js), проброс в [tdlibIpcBridge.js](../main/native/tdlibIpcBridge.js)), а обработчик (вынесен в [nativeStoreLastMsgIpc.js](../src/native/store/nativeStoreLastMsgIpc.js)) пересчитывает имя через `lastSenderLabel`. Покрыто тестом `nativeStoreLastMsgIpc.vitest.jsx` (кейс «фикс залипания»).

**Связано**: features.md v1.2.130–v1.2.131, v1.2.133; [[code-todo]] TODO-14 (закрыт); [[ADR-016]] (native Telegram режим).

## ADR-023 — ВК на vk.ru: только основной console-путь; запасной executeJavaScript-впрыск на vk.ru отключён (2026-07-27, v1.2.134)

**Контекст.** У ВК исторически накопилось ТРИ слоя ловли входящих сообщений:
1. **Основной** — перехватчик списка чатов (`vk-list`, [vk.hook.js](../main/preloads/hooks/vk.hook.js)), впрыск через console-путь, сделан под новый vk.ru (v1.2.112). Работает, доставляет уведомления.
2. **Запасной** — `executeJavaScript`-впрыск большого наблюдателя `vkExecFallback` ([shared/vkExecFallback.js](../shared/vkExecFallback.js)), сделан в v1.2.46 для СТАРОГО vk.com (toast/sidebar).
3. **Координатор** — «журнал явки» `monitor-ready` (heartbeat от `monitor.preload.cjs` через ipc `sendToHost`): запасной (2) включается ТОЛЬКО если основной не отметился в журнале за 60с.

**Проблема (диагностика v1.2.134, по логу).** При каждом старте — красная `[ERROR] GUEST_VIEW_MANAGER_CALL: Script failed to execute` + `VK-EXEC inject failed`. Установлено временной диагностикой: `monitor-ready` НЕ приходит НИ ОТ ОДНОГО мессенджера (`journalKeys=(пусто)`, `[IPC-MAX]`/`[IPC-WA]`=0) — служебный ipc-канал preload молчит у всех. → гейт «основной жив» (3) никогда не срабатывает → запасной (2) запускается всегда → на vk.ru его `executeJavaScript` блокирует защита страницы (CSP) → бесполезная красная ошибка. Уведомления ВК при этом идут слоем (1).

**Решение (вариант А, а не Б).** Не запускать запасной впрыск (2) на vk.ru: в `vkExecFallback.schedule` ранний выход при URL `vk.ru`. Обоснование выбора А над Б («починить журнал (3), чтобы он глушил (2)»):
- (2) на vk.ru всё равно блокируется — как страховка бесполезен там (убрав вызов, ничего не теряем).
- (3) молчит у ВСЕХ мессенджеров — чинить общий preload-ipc ради глушения одного лишнего слоя = «подпорка к подпорке» + риск сломать мониторинг всех.
- (1) самодостаточен на vk.ru.
Для vk.com (если когда-нибудь встретится) поведение (2)+(3) сохранено.

**Факты.** (2 ур., код) слои — vk.hook.js / vkExecFallback.js / monitor.preload.cjs `sendMonitorReady`. (2 ур., лог) `journalKeys=(пусто)`, `monitor-ready`/`[IPC-*]`=0, `vk-list emitted` работает. (1 ур.) MDN/Electron: `<webview>.executeJavaScript` отклоняется, если страница запрещает выполнение (CSP) — отсюда `GUEST_VIEW_MANAGER_CALL` reject.

**Остаток (отдельная задача).** preload-ipc heartbeat (`monitor-ready`, `unread-count` через `sendToHost`) не доходит до host НИ ОТ КОГО — скрытая недоработка; на уведомления не влияет (работают console-пути), но счётчики непрочитанного через этот канал могут быть неточны. Не чинилось (вне задачи, опасная общая зона).

**Связано**: features.md v1.2.134; [[ADR-016]]; ловушка про VK-детект в [[webview-injection]].

## ADR-024 — Закрепление чатов в native-списке: ЛОКАЛЬНОЕ (не синхронизируется с Telegram) (2026-07-29, v1.2.138)

**Контекст.** Пользователь попросил закреплять чаты в боковом списке native-режима. Явное требование: закрепление должно быть ТОЛЬКО в нашем приложении, НЕ уходить в Telegram — «у нас закреплений неограниченно, а в Telegram есть лимит». Подсветка выбрана вариант **B2 — только полоска слева** (без заливки фона). Комбинация UI (согласована): секция-заголовок «📌 Закреплённые» + значок 📌 на чате + правый клик «Закрепить/Открепить».

**Решение.**
1. **Локальное хранение, НЕ TDLib.** Список закреплённых `chat.id` хранится в `localStorage` (ключ `cc-native-pinned-chats`), никаких вызовов серверного закрепления TDLib (`toggleChatIsPinned` и т.п.) нет. Причина: серверное закрепление Telegram имеет лимит (обычно 5 обычных чатов), а требование пользователя — без лимита; плюс закрепление у нас — про удобство оператора в нашем окне, а не про синхронизацию с телефоном.
2. **Чистая логика — в `shared/`, вне renderer-бюджета.** Преобразования списка (`togglePinnedId`, `isPinnedId`, `sortWithPinnedFirst`) вынесены в корневой [shared/pinnedChats.js](../shared/pinnedChats.js) (как [[ADR-019]]-паттерн `shared/notifAlbum.js`), а тонкая обёртка над `localStorage` (`loadPinnedIds`/`savePinnedIds`) осталась в [src/native/store/pinnedChats.js](../src/native/store/pinnedChats.js) и реэкспортит чистые функции (потребители импортируют из одного места). Причина: правило проекта «не раздувать renderer, чистое выносить» — общий renderer-бюджет (`fileSizeLimits.test.cjs`) на пределе.
3. **Секция — строка-заголовок над списком, а НЕ заголовок внутри виртуального списка.** «📌 Закреплённые · N» рисуется как лёгкая строка над списком (по образцу строки «найдено N из M»), сами закреплённые чаты поднимаются наверх сортировкой и помечаются полоской+значком. Виртуальный список (react-window v2, `rowHeight` числом) НЕ трогали. Причина: заголовок/разделитель внутри виртуального списка требует строк разной высоты (`rowHeight` функцией) — это меняет поведение прокрутки, а проверить без запуска приложения нельзя (запуск агенту запрещён) → риск повторить скролл-саги. Полноценная сворачиваемая группа явно отложена пользователем («это не надо»).
4. **Полоска закрепа рисуется ПОВЕРХ полосы мессенджера** (`zIndex`, цвет `#f5b301`): при конфликте приоритет у признака закрепа; имя аккаунта/мессенджера всё равно видно в микро-строке чата, инфо не теряется.

**Как откатить.** Убрать импорт/использование `pinnedSet`/`onTogglePin` из `InboxMode.jsx` (сортировка вернётся к `.sort по lastMessageTs`), удалить `shared/pinnedChats.js` + `src/native/store/pinnedChats.js` + тест, снять пропсы в `InboxChatListSidebar/ChatRow/ChatListItem/MuteMenu`, вернуть агрегат renderer 31450→31300.

**Факты.** (2 ур., код) сортировка чатов — `InboxMode.jsx` useMemo `activeAccountChats`; меню ПКМ — `MuteMenu.jsx`; строка чата — `ChatListItem.jsx`. (2 ур., код) `shared/notifAlbum.js`/`vkExecFallback.js` — прецедент «чистое в shared, вне renderer-бюджета». (1 ур., react-window v2 docs) `List` принимает `rowHeight` числом ИЛИ функцией — переход на функцию меняет раскладку строк.

**Проверено (ожидает ручной проверки человеком).** Модульный тест `pinnedChats.vitest.js` 11/11; лимиты 527/527; ESLint чисто. Визуальная проверка (ПКМ→Закрепить→чат наверху с 📌 и полоской; переживает перезапуск) — за пользователем.

**Остаток / возможные доработки** (советы к v1.2.138, не сделаны): значок 📌 в компактном режиме; устойчивый порядок закреплённых (сейчас внутри группы сортируются по времени → «прыгают»); тест связки в `InboxMode`; перетаскивание порядка; чистка осиротевших `chat.id` при загрузке.

**Связано**: features.md v1.2.138; [[ADR-016]] (native Telegram режим); [[ADR-019]] (паттерн «чистое в shared/»).

## ADR-025 — Закреплённые чаты остаются в ЕДИНОМ виртуальном списке; ручное перетаскивание порядка НЕ реализуем (2026-07-30, v1.2.156–v1.2.162)

**Контекст.** Была задача — дать перетаскивание порядка закреплённых чатов «как в Telegram» (взял живой блок → ведёшь → соседи расступаются → отпустил, встал). Список чатов рисуется через `react-window@2.2.7` (виртуализация — рисуются только видимые строки).

**Что пробовали (v1.2.156–160, всё ОТКАЧЕНО в v1.2.161).**
1. HTML5 drag-and-drop прямо на строках виртуального списка (`draggable`/`dragStart/dragOver/drop`) — показывал лишь полупрозрачный «снимок» строки, не сам блок; соседи не разъезжались.
2. Свой образ через `DataTransfer.setDragImage` + живая перестановка по `dragOver`.
3. Вынос закреплённых в ОТДЕЛЬНЫЙ не-виртуальный компонент `PinnedChatList` с перетаскиванием на Pointer Events — дал живой блок, НО этот блок рендерился ВНЕ прокрутки общего списка → закреплённые «приклеены», не листались вместе со списком (жалоба пользователя).

**Корень несовместимости (факты).**
- 🥇 (react-window@2.2.7, `dist/react-window.cjs`) строки ставятся `transform: translateY(индекс×высота)` и ключуются по индексу (`key=index`) → при смене порядка DOM-узел остаётся на своём слоте, меняется только содержимое; плавно «разъезжать» соседей внутри react-window нельзя.
- 🥈 (код) один `<List>` = один прокручиваемый контейнер → закреплённые как первые строки листаются вместе со списком. Отдельный блок сверху этого не даёт.

**Решение.** Закреплённые чаты — обычные строки ЕДИНОГО виртуального списка, наверху, в порядке `pinnedIds` (сортировка `sortWithPinnedFirst`/`filterSortChats`, [[ADR-024]]). Ручное перетаскивание порядка НЕ реализуем: оно требует либо отдельного «приклеенного» блока (пользователь отверг — не листается), либо замены/надстройки над react-window (крупная работа, не проверить без запуска приложения). Порядок закреплённых = порядок, в котором их закрепляли (стабильный, не по времени).

**Когда пересматривать.** Только если (а) пользователь примет отдельный не-виртуальный блок закреплённых, ИЛИ (б) будет принято решение заменить виртуальный список на движок с поддержкой сортировки-перетаскивания. До тех пор — не пытаться делать drag внутри react-window (тупик, проверено 5 итерациями).

**Регрессионная защита.** `InboxChatListSidebar.vitest.jsx` (v1.2.162): падает, если кто-то снова вынесет закреплённые в отдельный `PinnedChatList`/разделит список (`mainChats`/`pinnedVisible`).

**Связано.** features.md v1.2.161–162; archive/features-v1.2.156-160.md (история попыток); [[ADR-024]]; [[code-todo]] TODO-20 (снято).

## ADR-026 — Фильтр аккаунтов в списке: множественный выбор + «соло» на левой панели (заменил одиночный chatFilter) (2026-07-30, v1.2.163)

**Контекст.** До v1.2.163 показ чатов по аккаунтам управлялся строкой кнопок «Все / <аккаунт>» НАД списком (одиночное состояние `chatFilter` = 'all' | accountId, [[ADR-016]]). Пользователь попросил убрать эту строку и перенести управление на левую панель с аватарками аккаунтов, с возможностью показывать несколько аккаунтов сразу.

**Решение.** Строка-фильтр удалена. Управление — на аватарках левой панели:
- Одиночный клик по аватарке = показать/скрыть аккаунт (галочка в левом-нижнем углу). Защита: нельзя скрыть последний видимый.
- Двойной клик = «соло» (только этот аккаунт); повтор/одиночный клик по другому — выход из соло.
- Кнопка «Все» над аватарками = показать все (горит при показе всех, иначе счётчик N/M).

**Модель данных.** Одиночный `chatFilter` заменён на два поля:
- `hiddenAccountIds` — массив id СКРЫТЫХ аккаунтов. Пусто = все видны. ПЕРСИСТЕНТНО (localStorage `cc-native-hidden-accounts`).
- `soloAccountId` — id в режиме «только этот». ВРЕМЕННЫЙ (не сохраняется, сбрасывается при перезапуске). Пока задан — виден только он, hiddenIds игнорируются (запоминаются).
Чистая логика — `shared/accountFilter.js` (`isAccountVisible`/`toggleAccountHidden`/`visibleAccountCount`/`isAllVisible`), обёртка localStorage — `src/native/store/accountFilter.js`. Фильтрация списка: в `InboxMode` чаты сначала отсеиваются по видимости, затем `filterSortChats(..., {filter:'all'})`.

**Факты.** (1 ур., React docs) `onDoubleClick` идёт после двух `onClick` — одиночное и двойное действия разведены таймером 220мс в `AccountAvatar`. (2 ур., код) фильтр списка — `InboxMode.jsx` useMemo `activeAccountChats`; аватарки — `NativeApp.jsx` `AccountAvatar`; форма состояния — `nativeStoreHelpers.js` DEFAULT_STATE.

**Крайние случаи.** 1 аккаунт → фильтр не активен. Удаление/переименование аккаунта — id убирается/переносится в hidden, соло снимается (`nativeStoreIpc.js`). Скрытый аккаунт: счётчик непрочитанных на аватарке обновляется, чаты не показываются.

**«Активный аккаунт для входа»** (`activeAccountId`) больше НЕ задаётся кликом по аватарке (клик = фильтр). Ставится при добавлении/старте; ручной выбор — возможная будущая доработка (пункт правого клика). Кнопка «+» (новый вход) от этого не зависит.

**Проверено (ожидает ручной проверки человеком).** `accountFilter.vitest.js` + `nativeStoreFilter.vitest.jsx` + DEFAULT_STATE-тест; 103/103; ESLint 0; лимиты 538/538. Само взаимодействие мышью (клик/двойной/соло) — визуальная проверка за пользователем.

**Как откатить.** См. список файлов в features.md v1.2.163 (`git checkout` + удалить 2 новых теста + версия на 1.2.162). Вернуть `chatFilter` в DEFAULT_STATE + `setChatFilter` + верхнюю строку чипов в InboxChatListSidebar.

**Связано.** features.md v1.2.163; [[ADR-016]] (native-режим, единая лента); заменяет одиночный chatFilter из ADR-016.
