# Features v1.2.313 – v1.2.328 (архив)

Вынесено из активного features.md 2026-09-01 (лимит 100 КБ). Стабилизированные записи: логотипы ВК/МАКС/WhatsApp (313-317), фиксы уведомлений/логов (318-319), Ozon строгий режим сессии/каталог/разведчик структуры (320-328). Рабочий сторож Ozon — v1.2.329 (в активном файле).

### v1.2.328 — Ozon-разведчик: прицельно на «Покупатели» (значок непрочитано + in/out + кнопка отправки)

По логу: разведчик v1.2.326/327 работает (строка чата = имя `m9d-d` + превью `m9d-c0` + время `om_1inde--HpBXx`; сообщения `om_1mess--zPdwp`; поле ввода `textarea.m9d-t2`). НО значок «непрочитано» на строке чата не попадал — лимит (6) съедали счётчики бокового меню (`sc134-a`, родитель `m9d-a8b`); а «входящее/исходящее» не отличалось (контейнер сообщения во всю ширину). Правки в `ozon.hook.js` (121/300, только чтение, маскировка): (1) `findUnread` ПРОПУСКАЕТ счётчики меню (`closest('[class*="m9d-a8b"]')`), поднят лимит (6→14), логирует цепочку родителей `anc=` → кружок «1» на строке чата попадёт с контекстом; (2) каждому листу добавлена X-координата (`getBoundingClientRect().left`, только на немногих) → входящее (слева) vs мой ответ (справа); (3) `findSend` дампит кнопки РЯДОМ с полем ввода (кнопка «Отправить» без текста); (4) число сканов 5→8 (ловить и следующие сообщения). Пользователь: интересует ТОЛЬКО раздел «Покупатели». Проверки: `node --check` OK, 0 `.innerText`, `notifHooks` 87/87, лимиты 589/589, lint 0. **Требует полного перезапуска**; после — читаю лог сам и по полной карте строю сторожа чатов «Покупатели» (уведомления). Откат: `git checkout main/preloads/hooks/ozon.hook.js`. См. [[code-todo]] TODO-33.

### v1.2.327 — Ozon-разведчик: фиксы по ревью (лёгкое чтение + надёжнее направление сообщений)

По ревью полного разведчика (v1.2.326) — два риска устранены до запуска. **#1 (перф):** `txt()` использовал `innerText`, который форсирует пересчёт раскладки (reflow) на КАЖДОМ вызове; в `findUnread`/`findInputs` он звался на тысячах элементов ×5 сканов → страница Ozon могла подвисать. Заменён на `textContent` (без reflow). **#2 (направление):** «входящее vs исходящее» определялось одной координатой (`getBoundingClientRect().left`) — ненадёжно. В `dumpEl` добавлены доп. признаки: `text-align`, `margin-left/right:auto`, `align-self` (у исходящего пузыря часто `margin-left:auto`/`align-self:flex-end`). `getComputedStyle` зовётся только на ≤7 разбираемых элементах за скан (не тяжело). Файл `main/preloads/hooks/ozon.hook.js` (120/300). Проверки: `node --check` OK, 0 вызовов `.innerText`, `notifHooks` 87/87, лимиты 589/589, lint 0. **Требует полного перезапуска**; после — читаю лог `__CC_DIAG__ozon` сам (по нему строю сторожа). Откат: `git checkout main/preloads/hooks/ozon.hook.js`.

### v1.2.326 — Ozon: ПОЛНЫЙ разведчик (за один заход — всё для уведомлений + пересылки + отправки)

Разведчик v1.2.323/325 подтверждён рабочим (в логе `scan#`/`lists=2`; сообщения = класс `om_1mess--*`, строки чатов = хэш `c9s132-a0`/`c5t134-a*`). Расширен до ПОЛНОГО за один проход (`main/preloads/hooks/ozon.hook.js`, 114/300): дампит первые 3 строки чат-листа целиком (все листья: имя/превью/время/значок, флаг `NUM`), последние 4 сообщения открытого чата (сторона L/R, время, текст), значки-«непрочитано» (чистое число + класс родителя), поле ввода ответа (`textarea`/`contenteditable`/`role=textbox`) и кнопку «Отправить» — чтобы построить и сторожа-уведомления, и пересылку в нашу систему, и отправку ответа обратно в Ozon. Приватность: имена/тексты маскируются (буквы→«•»), длинные числа (телефоны/id)→«#»; время и короткие числа видны. Только чтение DOM. Проверки: `node --check` OK, `notifHooks` 87/87, лимиты 589/589, lint 0. **Требует полного перезапуска**; после — читаю лог `__CC_DIAG__ozon` сам. Откат: `git checkout main/preloads/hooks/ozon.hook.js`. См. [[code-todo]] TODO-33.

### v1.2.325 — Ozon: НАСТОЯЩИЙ фикс запуска разведчика — `detectMessengerType` знает Ozon (executeJS впрыск мимо CSP)

**Проблема**: разведчик Ozon (v1.2.323) не запускался (по `chatcenter.log`: только health-зонд, вывода разведчика нет). **Корень (проверено по коду, найдено ревью)**: у Ozon строгий CSP (`Content-Security-Policy`) блокирует ВСТРОЕННЫЙ `<script>`, которым `monitor.preload.cjs` впрыскивает хук (а `sessionSetup.js:119` вырезает из CSP только `frame-ancestors`, НЕ `script-src`). Есть запасной путь — впрыск через `executeJavaScript` (минует CSP, `webviewSetup.js:361-371`), но он берёт тип через `detectMessengerType`, а тот **не знал Ozon** → возвращал `unknown` → `app:read-hook('unknown')` → не тот файл → разведчик не впрыскивался НИ встроенно (CSP), НИ через executeJS.

**Фикс (одна строка + суть)**: в `detectMessengerType` (`src/utils/messengerConfigs.js`) добавлено `url.includes('ozon.ru') → 'ozon'`. Теперь executeJS-путь делает `app:read-hook('ozon')` → отдаёт `ozon.hook.js` (путь `../preloads/hooks` верный и в dev, и в prod) → `executeJavaScript(code)` → разведчик исполняется, минуя CSP. Тест `messengerConfigs.vitest.js` (+ozon). Также убрано имя пользователя из диаг-лога монитора.

**Про v1.2.324** (запись исправлена): правка `monitor.preload.cjs` (искать хук в `['hooks','../preloads/hooks']`) — это **валидное улучшение для prod** (в prod `__dirname=out/preload`, встроенный путь `hooks` пустой; второй кандидат `../preloads/hooks` = `out/preloadS/hooks` находит файл), НО она **НЕ была причиной** молчания разведчика в dev: в dev `__dirname=main/preloads` (монитор грузится из исходника, `mainIpcHandlers.js:247`), и файл там уже был. Настоящая причина — CSP + `detectMessengerType`, см. выше. Правку монитора оставили (не мешает, полезна для prod).

**Как проверено**: `node --check` OK; `messengerConfigs` vitest 5/5 + cjs 35/35; `navigateToChat` 42/42; `monitorPreload` 106/106; `notifHooks` 87/87; lint 0. **Гипотеза «CSP блокирует inline» — сильная, но окончательно подтвердится логом** после перезапуска (`__CC_DIAG__ozon monitor len>0` + появление `scan#`/`lists=` от executeJS-пути). **Требует ПОЛНОГО перезапуска**. **Откат**: `git checkout src/utils/messengerConfigs.js` (+ монитор при желании).

Файлы: `src/utils/messengerConfigs.js`, `src/__tests__/messengerConfigs.vitest.js`, `main/preloads/monitor.preload.cjs` (v1.2.324 многопутёвость + чистка лога).

### v1.2.323 — Ozon: ВРЕМЕННЫЙ разведчик структуры страницы (шаг к «сторожу»)

**ЧТО/ЗАЧЕМ**: новый `main/preloads/hooks/ozon.hook.js` — временный диагностический скрипт: читает структуру страницы Ozon-мессенджера и пишет её в лог, чтобы построить рабочий «сторож» (чтение чатов + уведомления) ПРИЦЕЛЬНО, а не гадая (структура/классы Ozon неизвестны). `monitor.preload.cjs` — ветка `host.includes('ozon.ru') → hookType='ozon'` (раньше впрыскивался telegram-хук по умолчанию).

**КАК РАБОТАЕТ**: только ЧТЕНИЕ DOM (`querySelectorAll`/`MutationObserver`, БЕЗ сетевых запросов → антибот Ozon не тревожим). Находит контейнеры-«списки» (≥4 детей с одинаковым классом = чат-лист/лента), дампит класс/число/образец + разбирает строку и пузырь (лево/право = входящее/исходящее). Вывод `console.log('__CC_DIAG__ozon …')` → перехват `webviewSetup.js` console-message → лог (как ВК `__CC_DIAG__vk`). **Приватность**: текст сообщений/имён МАСКИРУЕТСЯ (буквы→«•»; цифры/время видны) — персональные данные покупателей в лог НЕ идут. Защита от нагрузки: скан ≤4000 элементов, ≤6 дампов, наблюдатель отключается. НЕ форвардит уведомления. **Откат**: `git checkout main/preloads/monitor.preload.cjs` + удалить `ozon.hook.js`.

**КАК ПРОВЕРЕНО**: `node --check` OK; `notifHooks` 87/87; `monitorPreload` 106/106; лимиты 589/589; lint 0. **Требует ПОЛНОГО перезапуска** (main-процесс; dev: `Ctrl+C`+`npm start`). **Действие пользователя**: открыть Ozon, кликнуть чаты, написать тест-сообщение → прислать строки `__CC_DIAG__ozon`. **Статус**: разведка, не рабочий сторож; уведомлений Ozon ПОКА НЕТ (см. [[code-todo]] TODO-33). Файлы: `main/preloads/hooks/ozon.hook.js` (new, временный), `main/preloads/monitor.preload.cjs`.


### v1.2.322 — Ozon: «доводка» client hints под обычный Chrome + диагностика запросов (одна честная попытка)

**Задача**: после v1.2.320 Ozon-кабинет открывается, чаты видны, НО сама страница Ozon показывает свои ошибки-тосты `Request failed 403` на `/api/v2/resolve`. Тест пользователя: в обычном Chrome тех же чатов ошибок НЕТ, в нашем встроенном окне — есть. Значит антибот Ozon всё ещё отличает наше окно на глубоких запросах.

**Гипотеза (🟡, не подтверждена рантаймом)**: v1.2.320 выровнял UA-строку под реальную версию Chromium, но `Sec-CH-UA` (client hints — заголовки бренда/версии браузера) у Electron по умолчанию содержат бренд `Electron`, который строгий антибот Ozon ловит на `/api/v2/resolve`.

**Как сделано (ТОЧЕЧНО, только строгий режим Ozon)**: в `main/utils/sessionSetup.js` для strict-сессий добавлен `webRequest.onBeforeSendHeaders`, который на исходящих запросах Ozon переписывает `Sec-CH-UA` и `Sec-CH-UA-Full-Version-List` под ОБЫЧНЫЙ Chrome (`"Chromium" + "Google Chrome"`, БЕЗ `Electron`; версия — реальная из `process.versions.chrome`). Наше окно — настоящий Chromium, поэтому это честная нормализация реального движка, а не подделка чужого браузера. Строки собирает чистая экспортируемая `chromeClientHints(ver)` (+тест). Диагностика: лог `[ozon-req] <метод> …<url> | Sec-CH-UA было=… → стало=…` на api-запросах Ozon (первые 8, не спам). Другие мессенджеры/сессии не затронуты.

**✅ ПОДТВЕРЖДЕНО (2026-09-01, пользователем)**: после полного перезапуска ошибки Ozon `Request failed 403 /api/v2/resolve` ПРОПАЛИ. То есть причиной был именно бренд `Electron` в `Sec-CH-UA` — Ozon ловил его на глубоком запросе. Нормализация client hints под обычный Chrome сняла блок. DOM-путь Ozon (открытие + чаты + без ошибок) теперь работает во встроенном окне. Гонку с антиботом дальше не ведём — этого хватило; если Ozon в будущем ужесточит проверки и сломается — надёжная альтернатива остаётся официальный API (Premium Plus).

**Следующий шаг (не сделано)**: собственно цель пользователя — «сторож Ozon»: чтение новых сообщений покупателей из списка чатов + уведомления через общий конвейер (по образцу `vk.hook.js`). Сейчас в Ozon по умолчанию впрыскивается telegram-хук (см. monitor.preload) — нужен свой `ozon.hook.js` + ветка в `detectMessengerType`/hookType.

**Проверки**: `node --check` OK; тест `sessionClientHints.vitest.js` (есть Chromium+Google Chrome, НЕТ Electron, fallback без undefined); `mainProcess` 38/38; lint 0. **Требует ПОЛНОГО перезапуска** (это главный процесс — в dev `Ctrl+C` + `npm start`, hot-reload не подхватит). Визуально: открыть Ozon → пропали ли тосты `403 /resolve`; в логе — строки `[ozon-req]`.

**Откат**: `git checkout main/utils/sessionSetup.js` + удалить `src/__tests__/sessionClientHints.vitest.js`.

Файлы: `main/utils/sessionSetup.js`, `src/__tests__/sessionClientHints.vitest.js` (new).


### v1.2.321 — Ozon в каталоге «Добавить → веб» (пресет, без хука/уведомлений)

**Задача**: добавить Ozon-кабинет (сообщения покупателей) готовым пунктом в окно «Добавить → веб-мессенджеры», чтобы не вводить адрес вручную. Продолжение v1.2.320 (строгий режим сессии для Ozon уже работает — кабинет открывается).

**Как сделано (минимально, только каталог/отображение)**:
- `src/constants.js` — пункт в каталог `DEFAULT_MESSENGERS`: `{ id:'ozon', name:'Ozon', url:'https://seller.ozon.ru/app/messenger', color:'#005BFF', partition:'persist:ozon', emoji:'📦', isDefault:false }`. **Без `accountScript`** — точный DOM Ozon не подтверждён, не гадаем (поле защищено `?.` в webviewSetup.js:85 → безопасно).
- `src/native/utils/messengerBranding.js` — `ozon`: цвет `#005BFF`, emoji `📦`, имя `Ozon` (иконка/имя/цвет по всему UI).

**Как работает**: клик по Ozon в каталоге → `onAddWeb(entry)` → App.jsx создаёт КАСТОМНУЮ вкладку (`custom_<ts>`, `persist:custom_…`) с URL Ozon → `setupSession` видит `ozon.ru` → строгий режим (v1.2.320) → кабинет открывается. `isDefault:false` + main.js DEFAULT_MESSENGERS не тронут → Ozon НЕ активируется сам ни у новых, ни у существующих юзеров, только доступен в «Добавить». Детект типа (`detectMessengerType`), хук чтения чатов и уведомления — **ОТДЕЛЬНЫЙ следующий шаг** (не сделано).

**Проверки**: `node --check` OK; тест `ozonCatalog.vitest.js` (Ozon в каталоге + брендинг + isDefault:false + нет accountScript); `AddSourceModal.vitest.jsx` обновлён (веб-счётчик 4→5); lint 0. **Требует перезапуска приложения** (в dev — перезапуск терминала). Визуально: «Добавить → веб» → появился пункт «Ozon» 📦.

**Откат**: `git checkout src/constants.js src/native/utils/messengerBranding.js src/native/components/AddSourceModal.vitest.jsx` + удалить `src/__tests__/ozonCatalog.vitest.js`.

Файлы: `src/constants.js`, `src/native/utils/messengerBranding.js`, `src/__tests__/ozonCatalog.vitest.js` (new), `src/native/components/AddSourceModal.vitest.jsx`.


### v1.2.320 — Строгий режим сессии для Ozon (антибот): реальный UA + сохранение Service Worker + диагностика

**Задача**: пользователь добавил Ozon-кабинет (`seller.ozon.ru/app/messenger`) как веб-вкладку, но страница показывала блок «Похоже, нет соединения / Выключите VPN» (код инцидента `fab_chlg…`) — даже с выключенным VPN. В обычном Chrome на той же машине без VPN — открывается. Значит виновато поведение НАШЕГО `<webview>`, не сеть.

**Корень (по коду `main/utils/sessionSetup.js`)**: `setupSession` для ВСЕХ веб-вкладок делал две вещи, которых нет у обычного браузера и которые триггерят антибот Ozon: (1) подделывал UA под `Chrome/131.0.0.0` (фикс. строка), а реальный движок — Chromium из Electron 42 (новее) → нестыковка «UA ≠ client hints» = признак бота; (2) глушил Service Worker сайта (`clearStorageData` + убийца по `running-status-changed`) — а Ozon-кабинет держит связь через SW, без него показывает «нет соединения».

**Фикс (ТОЧЕЧНО, только для Ozon — остальные мессенджеры не тронуты)**: `setupSession(ses, opts)` получил параметр `opts.url`; для хостов `*.ozon.ru`/`ozon.ru` (`isStrictAntiBotSite`, разбор через `new URL().hostname`) включается строгий режим: UA с РЕАЛЬНОЙ версией Chromium (`process.versions.chrome` → совпадает с client hints, нет нестыковки) и Service Worker НЕ глушится. Для ВК/WhatsApp/МАКС/Telegram — поведение прежнее (UA 131 + глушение SW). Адрес прокинут в 3 местах вызова (`main.js`, `mainIpcHandlers.js` ×2).

**Диагностика (по просьбе)**: `setupSession` пишет в лог `[Session] setup partition=… url=… strict=… ua=Chrome/… sw=kept|cleared` (один раз на сессию, не спам) + отдельная строка `[Session] Ozon strict: Service Worker СОХРАНЁН`. Ошибки/успех загрузки страницы уже логируются (`did-fail-load`/`did-finish-load` в `webviewSetup.js`).

**✅ ПОДТВЕРЖДЕНО (2026-09-01, пользователем)**: после установки v1.2.320 Ozon-кабинет (`seller.ozon.ru/app/messenger`) во встроенном окне ОТКРЫВАЕТСЯ — вместо блока «Похоже, нет соединения» показывается штатная страница входа «OZON Seller · Вход и регистрация». То есть строгий режим (реальный UA + сохранённый Service Worker) прошёл антибот Ozon. Опасение «антибот всё равно не пустит» НЕ подтвердилось для этого случая. Остальные мессенджеры (ВК/WhatsApp/МАКС/Telegram) регрессий не показали.

**Следующий шаг (не сделано)**: это только «дверь открылась» — видно страницу входа. Дальше для рабочей интеграции нужно: (1) вход в Ozon-кабинет (как у других веб-аккаунтов, своя partition), (2) чтение чатов покупателей + новых сообщений (свой `ozon.hook.js` по образцу `vk.hook.js`), (3) уведомления через общий конвейер. Возможен риск повторной антибот-проверки при активности — проверять по факту.

**Проверки**: `node --check` OK; распознавание Ozon-хоста проверено (seller.ozon.ru→true, ozon.ru→true, vk.ru/whatsapp→false, notozon.ru/ozon.ru.evil.com→false); `mainProcess` 38/38; lint 0. Грабля — в [[notifications-ribbon]]/electron-core.

**Откат**: `git checkout main/utils/sessionSetup.js main/main.js main/handlers/mainIpcHandlers.js`.

Файлы: `main/utils/sessionSetup.js`, `main/main.js`, `main/handlers/mainIpcHandlers.js`.



### v1.2.319 — Фикс по ревью: кросс-дедуп v1.2.318 не должен глушить MAX (регресс v1.2.55)

**Проблема (🔴, найдена ревью, воспроизведена)**: кросс-детекторный дедуп из v1.2.318 (`notifDedupDecision.decideNotifDedup`, ключ «мессенджер+отправитель+текст» без messageId) склеивал НЕ только двойные VK-карточки, но и два ОДИНАКОВЫХ по тексту MAX-сообщения подряд — а MAX специально их различает через `messageId = max-sidebar:<sender>:<unread>` (фикс v1.2.55). Итог: в MAX «ок / ок» подряд второе проглатывалось.

**Корень**: кросс-ключ игнорирует messageId и применялся ко ВСЕМ веб-мессенджерам (кроме `native_cc`), не учтя намеренную логику MAX.

**Фикс**: в `decideNotifDedup` добавлен параметр `messageId`; кросс-ключ НЕ строится, если `messageId` начинается с `max-sidebar:` (метка MAX). `notificationManager.js` передаёт `messageId` в функцию. VK не затронут (у него messageId — отпечаток содержимого, не `max-sidebar:`); native уже исключён.

**Плюс**: обработчик `app:open-logs-folder` больше не «немой» при отказе — пишет `console.warn` (было: только `{ok:false}`).

**Как проверено**: `decideNotifDedup` для двух одинаковых MAX (unread 3→4) теперь даёт второму `duplicate=false` (было `true`). Тест `notifDedupDecision.vitest.js` +2 кейса (MAX не глушится; VK с отпечатком всё ещё склеивается) → 8/8. lint 0. Грабля записана в [[notifications-ribbon]].

**Откат**: `git checkout main/handlers/notifDedupDecision.js main/handlers/notificationManager.js main/handlers/mainIpcHandlers.js src/__tests__/notifDedupDecision.vitest.js`.

Файлы: `main/handlers/notifDedupDecision.js`, `main/handlers/notificationManager.js`, `main/handlers/mainIpcHandlers.js`, `src/__tests__/notifDedupDecision.vitest.js`.

### v1.2.318 — Фикс: пустые логи в установленной версии + кнопка «Папка логов» + двойные VK-уведомления

Три правки одним релизом (по просьбе пользователя — профессионально, не «коротким путём»).

**1. Пустые логи в установленной версии (🟢 корень найден).** Окно «Логи ChatCenter» (`main/log-viewer.html`, отдельное окно из трея) в УПАКОВАННОЙ версии не могло загрузить свой preload-мостик: путь был `../preload/log-viewer.cjs`, а electron-vite собирает preload как `.mjs` (как у notification/pin/monitor — они работают). Мостик не грузился → `window.logViewer` отсутствовал → окно навсегда «Загрузка …» / «0 записей». В dev не проявлялось (там путь на исходник `.cjs`). Сам файл `chatcenter.log` пишется исправно (логгер `main/utils/logger.js` не затронут). Фикс: `main/utils/trayManager.js:17` `.cjs → .mjs`. Плюс «как часы»: окно теперь при открытии САМО запрашивает лог (`window.logViewer.readLog()` → `app:read-log`), не дожидаясь push, и показывает честное сообщение, если мостик не подключился (вместо вечной «Загрузки …»).

**2. Кнопка «📂 Папка логов»** в шапке окна логов — открывает Проводник с выделенным файлом `chatcenter.log` (чтобы скопировать и отправить разработчику). Новый IPC `app:open-logs-folder` (`main/handlers/mainIpcHandlers.js`) → `shell.showItemInFolder(getLogFilePath())` (путь только из `getLogFilePath()`, извне ничего не принимаем). Метод `openFolder()`/`readLog()` добавлены в мостик `main/preloads/log-viewer.preload.cjs`.

**3. Двойные VK-уведомления (🟢 корень найден).** Одно сообщение ВК ловят ДВА независимых детектора: наблюдатель списка чатов (`vk.hook.js` `_scanVkList`, путь `vk-list`, без messageId) и наблюдатель открытого чата (`vkDiagnostics` → IPC `new-message`, messageId=отпечаток). Дедуп в `notificationManager` завязан на scope, а scope у этих путей РАЗНЫЙ (`sender:vk-list:<hash>` против `mid:<отпечаток>`) → две одинаковые карточки. Фикс (по паттерну проекта — чистый модуль + тест, как `notifResizeDecision.js`): новый `main/handlers/notifDedupDecision.js` (`decideNotifDedup`) добавляет для ВЕБ-мессенджеров ключ склейки БЕЗ messageId/chatTag — «мессенджер+отправитель+текст». **Нативный Telegram (`native_cc`) НЕ затронут** — там реальные messageId, два быстрых одинаковых сообщения показываются оба. `notificationManager.js` использует чистую функцию вместо встроенной логики. Тест `src/__tests__/notifDedupDecision.vitest.js` (6 проверок, включая воспроизведение бага и защиту native). Остаточный край: у очень длинного поста превью в списке и полный текст в чате могут различаться → склейка не сработает (тогда два показа) — редко.

**Проверки:** `node --check` всех файлов OK; `notifDedupDecision` 6/6; `notificationIdentity` 9/9 (проверка-сторож наведена на новый модуль); `ipcChannels` 44/44; `extractedModules` 37/37; `buildContract` 16/16; `notifHooks` 87/87; lint 0; лимиты 586/586. **Требует пересборки + переустановки** (правки в main/preload видны только в установленной версии). **Визуальная проверка:** открыть «Логи» — есть записи + кнопка «Папка логов» работает; в ВК приходит ОДНО уведомление.

**Откат:** `git checkout main/utils/trayManager.js main/preloads/log-viewer.preload.cjs main/log-viewer.html main/handlers/mainIpcHandlers.js main/handlers/notificationManager.js` + удалить `main/handlers/notifDedupDecision.js src/__tests__/notifDedupDecision.vitest.js`.

Файлы: `main/utils/trayManager.js`, `main/preloads/log-viewer.preload.cjs`, `main/log-viewer.html`, `main/handlers/mainIpcHandlers.js`, `main/handlers/notifDedupDecision.js` (new), `main/handlers/notificationManager.js`, `src/__tests__/notifDedupDecision.vitest.js` (new), `src/__tests__/notificationIdentity.test.cjs`. Грабли — в [[common-mistakes]] / mistakes.


### v1.2.317 — Фикс по ревью: логотип ВК/МАКС не «прилипает» к чужим вкладкам

**Проблема** (найдена ревью, 🟡): распознавание типа веб-мессенджера в `RailWebIcon.jsx` по имени искало ПОДСТРОКУ латинскими масками `/vk|вконтакте/i`, `/max|макс/i`. Короткие латинские `vk`/`max` попадали внутрь посторонних имён → кастомная вкладка «Vkusvill» получала логотип ВК, «MaxBet»/«Climax» — логотип МАКС. Косметика (неверный значок), функцию не ломало.

**Корень**: маска-подстрока + слишком короткий латинский маркер (2-3 буквы).

**Фикс**: из масок убраны латинские `vk`/`max`. Осталось: дефолтные ВК/МАКС ловятся по `m.id === 'vk'/'max'`; кастомные (id `custom_…`) — по кириллическому имени `/вконтакте/i`, `/макс/i` (длинное слово, ложных срабатываний не даёт). Telegram/WhatsApp не тронуты (их латинские маски длинные, коллизий нет).

**Как проверено**: тест-ловушка в `RailWebIcon.vitest.jsx` (+3): «Vkusvill»→НЕТ логотипа ВК, «MaxBet»→НЕТ логотипа МАКС, кастомный «ВКонтакте»→логотип ЕСТЬ. До фикса 2 падали, после — 16/16 зелёные. Lint 0, лимиты OK.

**Откат**: `git checkout src/native/components/RailWebIcon.jsx`.

Файлы: `src/native/components/RailWebIcon.jsx`, `src/native/components/RailWebIcon.vitest.jsx`. Грабля описана в [[ui-components]].

### v1.2.316 — Настоящий логотип МАКС вместо эмодзи-заглушки 💎 (везде)

**Задача**: пользователь положил `PNG/max-icon.png` — заменить эмодзи-заглушку МАКС на реальный логотип, как у WhatsApp (v1.2.314) и ВК (v1.2.315).

**Как сделано** (тот же образец):
- `src/native/utils/messengerLogos.js`: в реестр `MESSENGER_LOGOS` добавлен ключ `max` — data-URI (base64) из `PNG/max-icon.png` (129×129 RGBA, 19 КБ; сигнатура PNG верна, обратимость base64 проверена побайтно). `MessengerIcon` для `max` рисует `<img>`, а не эмодзи 💎.
- `src/native/components/RailWebIcon.jsx`: в `logoType` добавлена ветка МАКС. **Ловушка (та же, что у ВК)**: имя мессенджера МАКС — кириллицей «Макс», латинское `/max/` его НЕ ловит. Маска `/max|макс/i` (латиница ИЛИ кириллица) + запасной `m.id === 'max'` для дефолтного источника.
- `src/native/components/MessengerIcon.vitest.jsx`: добавлен тест — `max` рисует `<img>` с data-URI.

**Где виден логотип МАКС**: значок в боковом рейле (центр без фото + угловой значок поверх аватара), API-аватар, и везде, где `MessengerIcon messenger="max"`.

**Проверки**: `node --check` OK; base64 round-trip = байт-в-байт; lint; vitest MessengerIcon; лимиты файлов. **Требует визуальной проверки** (перезапуск → в рейле у МАКС настоящий логотип вместо 💎).

Файлы: `src/native/utils/messengerLogos.js`, `src/native/components/RailWebIcon.jsx`, `src/native/components/MessengerIcon.vitest.jsx`.

### v1.2.315 — Настоящий логотип ВКонтакте вместо эмодзи-заглушки 🔵 (везде)

**Задача**: пользователь положил `PNG/VK-icon.png` — заменить эмодзи-заглушку ВК на реальный логотип, как это сделано для WhatsApp (v1.2.314) и Telegram (v1.2.183).

**Как сделано** (тот же образец, что WhatsApp):
- `src/native/utils/messengerLogos.js`: в реестр `MESSENGER_LOGOS` добавлен ключ `vk` — data-URI (base64) из `PNG/VK-icon.png` (129×129 RGBA, 10 КБ; обратимость base64 проверена побайтно). Компонент `MessengerIcon` теперь для `vk` рисует `<img>` с логотипом, а не эмодзи 🔵.
- `src/native/components/RailWebIcon.jsx`: в определение `logoType` добавлена ветка ВК. **Ловушка**: имя мессенджера ВК — кириллицей «ВКонтакте», латинское `/vk/` его НЕ ловит. Маска `/vk|вконтакте/i` (латиница ИЛИ кириллица) + запасной `m.id === 'vk'` для дефолтного источника (у добавленного вручную id = `custom_…`).
- `src/native/components/MessengerIcon.vitest.jsx`: добавлен тест — `vk` рисует `<img>` с data-URI.

**Где теперь виден логотип ВК**: значок в боковом рейле (центр без фото + угловой значок поверх аватара), API-аватар (угловой значок), и везде, где вызывается `MessengerIcon messenger="vk"`.

**Проверки**: `node --check` messengerLogos OK; base64 round-trip = байт-в-байт; lint; vitest MessengerIcon; лимиты файлов. **Требует визуальной проверки** (перезапуск → в рейле у ВК настоящий логотип вместо 🔵).

Файлы: `src/native/utils/messengerLogos.js`, `src/native/components/RailWebIcon.jsx`, `src/native/components/MessengerIcon.vitest.jsx`.

### v1.2.314 — Настоящий логотип WhatsApp вместо эмодзи-заглушки 💬 (везде)

Дата: 2026-08-19. Пользователь добавил `PNG/whatsapp-icon.png` (128×128 RGBA, 9.6 КБ). Раньше WhatsApp рисовался эмодзи-заглушкой 💬. Реализовано по конвенции проекта (ADR-027, архив decisions-adr-023-027.md — логотипы как data-URI, НЕ импорт-ассет сборщика): (1) PNG закодирован в base64 data-URI и добавлен в реестр `MESSENGER_LOGOS.whatsapp` ([messengerLogos.js](../src/native/utils/messengerLogos.js)) — теперь `getMessengerLogo('whatsapp')` возвращает логотип, и `MessengerIcon` рисует картинку АВТОМАТИЧЕСКИ везде, где он используется (угловой значок API-аватара [AccountAvatar.jsx](../src/native/components/AccountAvatar.jsx), окно «Добавить» [AddSourceModal.jsx](../src/native/components/AddSourceModal.jsx), строка чата [ChatListItem.jsx](../src/native/components/ChatListItem.jsx), шапка [InboxChatPanel.jsx](../src/native/components/InboxChatPanel.jsx)); (2) в боковом рейле [RailWebIcon.jsx](../src/native/components/RailWebIcon.jsx) логотип раньше рисовался ТОЛЬКО для Telegram (проверка `m.id==='telegram' || /telegram/`) — обобщено в `logoType` (Telegram ИЛИ WhatsApp, по id или имени, т.к. id веб-аккаунта бывает `custom_…`); есть тип с логотипом → `MessengerIcon`, нет (ВК/МАКС) → эмодзи как раньше. Эмодзи 💬 в [messengerBranding.js](../src/native/utils/messengerBranding.js) ОСТАВЛЕН как ultimate-fallback (битый data-URI → `MessengerIcon.onError` → эмодзи). Тест [MessengerIcon.vitest.jsx](../src/native/components/MessengerIcon.vitest.jsx) обновлён: whatsapp теперь ждёт логотип-`<img>` (было «эмодзи»). Проверки: линт EXIT 0, MessengerIcon+RailWebIcon 11/11, **vitest 2313/2313**, лимиты 584/584 (messengerLogos 15 стр; renderer-бюджет 34575→34590 под data-URI+код). Затронуты только UI-логотипы; ВК/МАКС не тронуты. **Требует перезапуска + визуальной проверки** (везде, где WhatsApp — реальный логотип). Откат: `git checkout src/native/utils/messengerLogos.js src/native/components/RailWebIcon.jsx src/native/components/MessengerIcon.vitest.jsx`.

### v1.2.313 — Значки/логотипы в кружках рейла крупнее на 20% (сам кружок не увеличен)

Дата: 2026-08-19. По просьбе (логотип в кружке выглядел мелким, много пустого поля вокруг). В [AccountAvatar.jsx](../src/native/components/AccountAvatar.jsx) (API-аватары) и [RailWebIcon.jsx](../src/native/components/RailWebIcon.jsx) (веб-значки) содержимое кружка увеличено на 20%, диаметр круга (48px) НЕ тронут: (1) фото/логотип-аватар — зум фона `background-size: cover → 120%` (аватары в проекте квадратные: TDLib и захват веб = 100×100 → 120% даёт чистый зум без цветных полей, обрезается ~10% по краям); (2) фолбэк без фото — инициалы AccountAvatar `px(16)→px(19)`, эмодзи-логотип RailWebIcon `px(22)→px(26)`, центральный логотип Telegram `px(24)→px(29)`. Угловые бейджи (значок мессенджера, точка связи, непрочитано) НЕ трогали. Проверки: линт EXIT 0, RailWebIcon.vitest 8/8 (форма `50%`/`url(` сохранены), лимиты 584/584. **Требует перезапуска + визуальной проверки** (логотипы в кружках крупнее, круги того же размера). Откат: `git checkout src/native/components/AccountAvatar.jsx src/native/components/RailWebIcon.jsx`.

