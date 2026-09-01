# Реализованные функции — ChatCenter

## Текущая версия: v1.2.330 (21 августа 2026)

### v1.2.330 — Ozon: замок «только Покупатели» + сужен наблюдатель + переход к чату

**ЧТО**: три улучшения сторожа Ozon (по выбору пользователя из 5 советов). Файлы: `main/preloads/hooks/ozon.hook.js` (589→…), `src/utils/navigators/ozonNavigate.js` (NEW), `src/utils/navigateToChat.js` (+1 ветка).

**#2 Замок «только Покупатели»** (⭐⭐⭐⭐). ЗАЧЕМ: пользователь просил уведомления ТОЛЬКО о покупателях; сторож же следил за любым видимым списком (переключишься на «Поддержку» — полезли бы и оттуда). КАК: активный раздел Ozon отражается в АДРЕСЕ страницы — лог-разведка дала `url=.../app/messenger?abt_att=1&group=customers` (факт ур.1 — адрес/`location.search`). Функция `_section()` читает `?group=…`: `customer…` = «Покупатели», иное = чужой раздел (глушим), нет параметра = `unknown`. **fail-open**: глушим ТОЛЬКО при явно другом разделе; при `unknown` уведомляем (никогда не молчим зря → не теряем сообщения покупателя). Уходя из «Покупателей» → `_prev=null` (сброс базы) → при возврате старые непрочитанные НЕ улетают как «новые» (без шторма). **Граница честно**: если Ozon переключает раздел БЕЗ смены адреса (SPA) — замок не сработает (останется как было, fail-open), сообщения покупателя при этом не теряются.

**#3 Сужен наблюдатель** (⭐⭐⭐). ЗАЧЕМ: наблюдатель висел на `document.body` и реагировал на ВСЮ страницу Ozon (анимации, presence) — лишняя нагрузка. КАК: `_attach()` цепляет наблюдатель к контейнеру списка (`rows[0].parentNode`); пока списка нет — слушает body как загрузочный будильник, появился список → переце́пляется. Защита от «оглохнуть»: `setInterval` 5с переце́пляет наблюдатель (список мог пересобраться) + фоновый досмотр → ни одно новое сообщение не теряется, макс. +5с задержки (база `_prev` сохраняется между переце́пами). Факт ур.1 — MDN MutationObserver (срабатывает только на изменения в наблюдаемом узле).

**#4 «Перейти к чату» для Ozon** (⭐⭐). ЗАЧЕМ: клик по уведомлению уводил в generic-навигатор, а тот кликает только `a/li/[role]/[tabindex]` — строки Ozon это `div.m9d-c4` → чат не открывался (переключение вкладки Ozon и так работало). КАК: новый `navigators/ozonNavigate.js` (`buildOzonScript`) ищет строку, в тексте которой есть имя покупателя, и кликает её; подключён в `navigateToChat.js` для `ozon.ru`. Возвращает `{ok,method,log}` — как остальные навигаторы. Факт ур.1 — MDN `element.click()`.

**КАК ПРОВЕРЕНО**: `node --check` (3 файла) OK; 0 реальных `.innerText` (только в комментарии); `notifHooks` 87/87; лимиты 589/589 (бюджет renderer поднят 34612→34640 из-за нового навигатора); версии 4/4. **Требует полного перезапуска + ручной проверки** (окно/webview не тестируются): (а) пишет покупатель → уведомление; (б) переключение на «Поддержку» → из неё уведомлений нет (если Ozon меняет адрес); (в) клик по уведомлению → открывается чат покупателя в Ozon. Читаю лог `__CC_DIAG__ozon-list … sec= rows= unread= emitted=` сам.

**Откат**: `git checkout main/preloads/hooks/ozon.hook.js src/utils/navigateToChat.js src/__tests__/fileSizeLimits.test.cjs && rm src/utils/navigators/ozonNavigate.js`. См. [[code-todo]] TODO-33.

### v1.2.329 — Ozon: РАБОЧИЙ сторож-уведомления чатов «Покупатели» (Этап 1)

**ЧТО**: `main/preloads/hooks/ozon.hook.js` — временный разведчик заменён рабочим сторожем `_scan`/`_findRows`/`_parseRow` (по образцу `vk.hook.js` `_scanVkList`). **Вся Ozon-специфика — только в этом файле**; общий конвейер (`consoleMessageHandler`, `notificationManager`) не трогали.

**ЗАЧЕМ**: цель пользователя — уведомления о новых сообщениях покупателей Ozon (интересует ТОЛЬКО раздел «Покупатели»), по КАЖДОМУ новому сообщению.

**КАК РАБОТАЕТ**: читает строки чатов (быстрый путь — по классу `m9d-c4`; запасной — список с 4+ строками, где есть время HH:MM). Строку разбирает ПО СОДЕРЖИМОМУ (классы Ozon случайные): время = `HH:MM` (пропуск), значок «непрочитано» = чистое число 1-3 цифры, имя = первый текст, превью = остальное. Непрочитанная строка (unread>0) = входящее покупателя (на мои ответы значок не появляется → само-фильтр). Первый проход = базовая линия (старое не шлём). Дальше отпечаток `hash(имя|превью)` меняется на каждое новое сообщение → шлёт `__CC_NOTIF__{t,b,i:'',g:'ozon-list:'+fp,src:'ozon-list'}` → общий конвейер (мьют/звук/лента/кросс-дедуп v1.2.318/319, т.к. Ozon = веб, не native_cc). Тротлинг наблюдателя 500мс; чтение лёгкое (`textContent`, не innerText). В файл-лог тексты покупателей НЕ пишем — только счётчики (`__CC_DIAG__ozon-list rows= unread= emitted=`).

**Приёмник проверен**: `consoleMessageHandler.js` обрабатывает `__CC_NOTIF__` без белого списка src → `ozon-list` проходит как `vk-list` (`fromNotifAPI=true`).

**КАК ПРОВЕРЕНО**: `node --check` OK; 0 `.innerText`; `notifHooks` 87/87; лимиты 589/589 (ozon.hook 89/300); lint 0. **Требует полного перезапуска + ручной проверки** (окно не тестируется): пишет покупатель → всплывает уведомление с именем+текстом; мои ответы — тишина. Читаю лог `__CC_DIAG__ozon-list` сам.

**Известные ограничения (для доводки)**: (1) фильтр «только Покупатели vs Поддержка» пока не реализован — нет надёжной приметы активного раздела (сторож следит за видимым списком; Покупатели открыты по умолчанию); если из «Поддержки» полезут уведомления — добавим замок раздела. (2) Коды `m9d`/`sc134` случайные → при переверстке Ozon сторож «ослепнет» (лог покажет `rows=0`) — запасной структурный путь смягчает. (3) Аватар покупателя в уведомлении пока не берём (эмодзи-заглушка). **Этап 2 (позже)**: ответ из нашей системы в Ozon (поле ввода `textarea.m9d-t2` + кнопка «Отправить» + «моё/чужое» — нужен заход с ОТКРЫТЫМ чатом).

**Откат**: `git checkout main/preloads/hooks/ozon.hook.js`. Файл: `main/preloads/hooks/ozon.hook.js`. См. [[code-todo]] TODO-33.

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

### v1.2.312 — ФИКС КОРНЯ: при старте не заваливать всплывашками offline-бэклог (стена уведомлений, которую не закрыть)

Дата: 2026-08-19. Жалоба (повторяется): после установки/перезапуска «заново упало много непрочитанных, не мог закрыть — кнопки не работали». Прошлые фиксы лечили СИМПТОМ (чтобы клики выживали при потоке: `shouldAutoScroll` v1.2.221, «невидимая стена» v1.2.106-128), но НЕ причину. КОРЕНЬ (по коду [nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js) `tg:new-message`): при коннекте TDLib отдаёт ПАЧКОЙ все сообщения, накопившиеся пока приложение было закрыто (offline-бэклог), и на КАЖДОЕ рождалась всплывашка → на старте стена карточек; пока пачка сыпется, список дёргается (авто-скролл + выброс по лимиту `forceRemoveItem`) → клики теряются. Стартовой защиты «не шуметь про старьё» не было. Факт уровня 1: `message.timestamp = tdMsg.date × 1000` ([tdlibMapper.js:238](../main/native/backends/tdlibMapper.js)) — это дата ОТПРАВКИ, а не приёма → бэклог (старые даты) отличим от живого. Фикс: модульная метка `NOTIFY_ARM_TS = Date.now()` (момент старта); в ветке показа уведомления — если `message.timestamp < NOTIFY_ARM_TS − 15с` (сообщение отправлено ДО запуска = offline-бэклог) → всплывашку НЕ показываем, пишем `[native-notif] skip backlog (pre-start) … ageSec=N` (лог = ещё и «детектор» размера завала). Бейдж/счётчик непрочитанного обновляются как обычно (setState выше по коду) — юзер видит счётчики на рейле, просто без стены popup'ов. ARM_TS фиксирован → правило действует ТОЛЬКО на стартовый бэклог; живой поток (дата ≈ сейчас) уведомляется нормально. Запас 15с — от перекоса часов/задержки доставки. Затронут ТОЛЬКО native (TDLib) путь; WebView (ВК/WhatsApp/MAX) не заваливают так и не тронуты. Тест: [nativeStoreMutedNotify.vitest.jsx](../src/native/store/nativeStoreMutedNotify.vitest.jsx) — фикстура «живого» сообщения переведена на `Date.now()` (было `timestamp:1000` = 1970, теперь считалось бы бэклогом) + новый тест «бэклог → нет popup, но unread растёт + лог skip backlog». Грабля записана в [mistakes/notifications-ribbon.md](mistakes/notifications-ribbon.md). Проверки: линт EXIT 0, **vitest 2313/2313**, лимиты 584/584 (nativeStoreIpc 643/660; renderer-бюджет 34560→34575). Остаточный риск: 🟡 лазейка `forceRemoveItem` (стена при выбросе по лимиту, TODO из v1.2.128) не трогалась — но без стартового завала она почти не срабатывает; 🟡 сообщение, пришедшее <15с до запуска, всё же всплывёт (редкий край). **Требует установки + визуальной проверки** (после перезапуска нет стены старых уведомлений; в журнале строки `skip backlog`). Откат: `git checkout src/native/store/nativeStoreIpc.js`.

### v1.2.311-v1.2.305 — Сага «чёткий аватар веб-Telegram»: диагностики → фикс → ПОДТВЕРЖДЕНО (архив → archive/features-v1.2.305-311.md)

### v1.2.303-304 — Веб-значки рейла: чистые бейджи (без «выемок») + свечение активного + поднятие при перетаскивании

Дата: 2026-08-19. По макету (согласованы 3 из 6 вариантов). Веб-значки ([RailWebIcon.jsx](../src/native/components/RailWebIcon.jsx)) выглядели «обгрызанными»: угловой значок мессенджера, точка связи и бейдж непрочитанных были обведены цветом ФОНА (`--amoled-bg` #000) → тёмные «выемки» по краю круга; активный/перетаскивание — жёсткая `outline`. Три правки: (1) **чистые бейджи** — кольца всех трёх бейджей переведены с `--amoled-bg` на цвет коробки `--amoled-surface` (#0a0a0a, фон блока «Веб») + мягкая тень через `box-shadow` → бейджи «лежат поверх», не режут круг; (2) **свечение активного** — вместо `outline: 2px solid` активный помечается кольцом + ореолом `box-shadow: 0 0 0 2px color, 0 0 14px color88` (приём `${color}alpha` уже был в файле — `${color}22/66`); (3) **поднятие при перетаскивании** — добавлено локальное состояние `dragging` (useState): при старте перетаскивания значок `transform: scale(1.1)` + сильная тень + лёгкая прозрачность, при `dragEnd` сбрасывается; цель drop — `scale(1.05)` + мягкое кольцо (заменил пунктир). Всё через `box-shadow`/`transform` (следуют border-radius круга) — фактов уровня 1 (MDN box-shadow/transform) достаточно. Обводочные `outline` убраны, `background`/форма (`50%`) и `aria-current` сохранены → тест [RailWebIcon.vitest.jsx](../src/native/components/RailWebIcon.vitest.jsx) 8/8. Затронут ТОЛЬКО веб-значок (API-аватар `AccountAvatar` не трогали — пользователь просил веб). Проверки: `npm run lint` EXIT 0, лимиты 584/584 (RailWebIcon 139 стр, renderer 34528/34550), **vitest 2312/2312**. Остаточный риск: 🟡 ореол активного `box-shadow` может слегка подрезаться `overflow-x:hidden` прокручиваемой середины рейла (v1.2.302) — мягкий край, косметика. **Требует перезапуска + визуальной проверки** (края чистые, активный светится, перетаскивание «поднимает»). Откат: `git checkout src/native/components/RailWebIcon.jsx`.

**Доводка по ревью (v1.2.304, 2026-08-19):** (#1) точка связи ПОТЕРЯЛА своё цветное кольцо — я передавал в `ConnectionStatusDot` свой `boxShadow`, а он перезатирал внутреннее кольцо компонента (`ConnectionStatusDot` задаёт `boxShadow: 0 0 0 1px цвет55`, затем `...style` применяется ПОСЛЕ → внешний побеждает, [ConnectionStatusDot.jsx:42-44](../src/components/ConnectionStatusDot.jsx)). Фикс: в переданном `style` оставлена ТОЛЬКО рамка `border: 2px solid var(--amoled-surface)`, `boxShadow` убран → внутреннее кольцо точки вернулось, край всё равно чистый. Грабля записана в [mistakes/electron-core.md](mistakes/electron-core.md). (#2) ореол активного уменьшен `0 0 14px`→`0 0 10px` — прокручиваемая середина рейла (`overflow-x:hidden`, v1.2.302) меньше срезает мягкий край. (#3) возможное «залипание» поднятого состояния при аварийном обрыве перетаскивания — осознанно НЕ трогали: `dragEnd` по стандарту приходит всегда, сброс через `onDrop` источник не затрагивает (риск ниже пользы). Проверки: `npm run lint` EXIT 0, лимиты 584/584 (RailWebIcon 142 стр), **vitest 2312/2312** (RailWebIcon 8/8).

### v1.2.302-v1.2.293 — верхняя панель (линейные значки, единая строка), 3-зонный рейл, фикс фото из уведомления, стекло-кнопка, чистка dist (архив → archive/features-v1.2.293-302.md)

### v1.2.288-v1.2.268 — Веб-аватарки (диагностика + чёткое фото из Настроек Telegram), скрытие верхних вкладок, карточки аккаунта/контакта, чистка журнала (архив → archive/features-v1.2.268-288.md)

### v1.2.267-v1.2.256 — Окно «Добавить» (протокол→мессенджер) + портал полосы «← Общий чат» (архив)

Перенесено в [archive/features-v1.2.256-267.md](archive/features-v1.2.256-267.md) (2026-08-19): единая полоса (веб встроен в нативный рейл, SourceRail удалён, ADR-032); одна кнопка «＋ Добавить» → окно «протокол→мессенджер» + доводки; портал полосы на уровне App (v1.2.260 откат→v1.2.262 рабочий) + кнопка «← Общий чат» над вебом.

### v1.2.254-v1.2.244 — боковой рейл SourceRail (Этапы 1–3, ЗАКРЫТ разворотом v1.2.256, архив)
Подход отдельной панели SourceRail закрыт (Модель 🅰️, ADR-032). История: [archive/features-v1.2.244-255.md](archive/features-v1.2.244-255.md).

### v1.2.243-v1.2.237 — Боковой рейл (флаг/тумблер) + карточка контакта (читаемость/контур/заметка) + МАКС мьют-фикс/диагностика (архив)

Перенесено в [archive/features-v1.2.237-243.md](archive/features-v1.2.237-243.md) (2026-09-01, разгрузка под лимит 100 КБ).

### v1.2.236-v1.2.222 — галочки списка + карточка контакта + МАКС-диагностика + строка отправки + пузырь «↓N» (архив)
Перенесено в [archive/features-v1.2.222-236.md](archive/features-v1.2.222-236.md).

### v1.2.221-v1.2.214 — Порядок фото/«текст отдельно» + ВК-навигация vk.ru + фикс счётчика ВК + окно отправки (архив)

Перенесено в [archive/features-v1.2.214-221.md](archive/features-v1.2.214-221.md) (2026-08-13, разгрузка под лимит 100 КБ): ждём серверное подтверждение фото/альбома перед текстом — порядок у получателя (v1.2.214) + таймаут-WARN (v1.2.215); «перейти в чат» по клику ВК-уведомления под vk.ru + имя мессенджера в статусе (v1.2.216) + тест-репродюсер (v1.2.217) + доводка сравнения имени (v1.2.218); фантомная «1 непрочитано» ВК — счётчик перестал считать бейджи «Друзья/Игры» (v1.2.219); окно отправки фото/файла — одна кнопка «Отправить» + инфо-строка (v1.2.220); лента уведомлений — не дёргать список при чтении + видимая прокрутка (v1.2.221).

### v1.2.213-v1.2.205 — Окно отправки фото: подпись/лимит 1024/«текст отдельно»/порядок/диагностика (архив)

Перенесено в [archive/features-v1.2.205-213.md](archive/features-v1.2.205-213.md) (2026-08-11, разгрузка под лимит 100 КБ): фикс двойной вставки фото + разбит windowManager (v1.2.205) + подтверждающий лог (v1.2.206); окно фото — 7 функций просмотра (v1.2.207); счётчик подписи + «фото, затем текст отдельно», лимит Telegram 1024 (v1.2.209); лимит подписи и «текст отдельно» для видео/документов (v1.2.210); длинный текст режется ≤4096 и шлётся ПОСЛЕ загрузки фото — порядок (v1.2.211); доводки «ждём именно это фото» + число сообщений (v1.2.212); диагностика отправки — лог провала/номера/результат (v1.2.213).

### v1.2.204-v1.2.197 — Окно отправки фото: инструменты просмотра (зум/поворот/сдвиг) + много фото + память окна (архив)

Перенесено в [archive/features-v1.2.197-204.md](archive/features-v1.2.197-204.md) (2026-08-11, разгрузка под лимит 100 КБ): окно отправки фото с зумом/поворотом/сдвигом (v1.2.197-198), логи потока + прозрачность PNG + пропуск в альбоме (v1.2.199), запоминание «на весь экран» (v1.2.200), приподнятая карточка + растущее поле подписи (v1.2.201), чистая логика памяти окна + тесты (v1.2.202), несколько фото в одном сообщении (v1.2.203), кнопки в шапке + вставка Ctrl+V + свободнее зум (v1.2.204).

### v1.2.196–v1.2.185 — диагностика ВК/МАКС, установщик/Win32, прокрутка чата (архив)

Перенесено в [archive/features-v1.2.185-196.md](archive/features-v1.2.185-196.md).

### v1.2.184-v1.2.170 — Логотип Telegram/живой статус собеседника/переключатель режимов/фикс поиска/читаемость шапки (архив)

Перенесено в [archive/features-v1.2.170-184.md](archive/features-v1.2.170-184.md).

### v1.2.169-v1.2.161 — Фильтр аккаунтов (мультивыбор+соло) + самолечение + закрепы/ресайз рейла (архив)

Перенесено в [archive/features-v1.2.161-169.md](./archive/features-v1.2.161-169.md) (2026-07-31, разгрузка под лимит 100 КБ): откат «приклеенного» списка закреплённых (161/162); фильтр аккаунтов на левой панели, клик=вкл/выкл, двойной=соло, кнопка «Все» + доводки (163/164); ресайз левого рейла перетаскиванием (165); полоса «Закреплённое» — читаемый фон + переход к сообщению (166/167); фиксы «после удаления 2-го аккаунта оставшийся не грузился» + самолечение фильтра при старте (168/169).

### v1.2.160-v1.2.156 — Сага «перетаскивание закреплённых» (ОТКАЧЕНА в v1.2.161, архив)

Перенесено в [archive/features-v1.2.156-160.md](./archive/features-v1.2.156-160.md) (2026-07-30): серия попыток сделать ручное перетаскивание порядка закреплённых чатов (HTML5 drag → свой образ за курсором → живая перестановка → вынос в отдельный не-виртуальный `PinnedChatList` с Pointer Events). **Итог — откачено в v1.2.161**: закреплённые должны листаться в ОБЩЕМ списке, а не быть отдельным блоком; перетаскивание же требует отдельного списка. Урок: drag-порядок и виртуальный список react-window (строки по индексу-слоту) несовместимы без замены движка. Из серии сохранились только НЕ-drag доводки (цвет-грань уведомления по `accountId`, цвет-полоса в узком режиме).

### v1.2.155-v1.2.147 — Цвет-метки аккаунтов (различимые цвета/полоса/обводка) + фиксы входа/удаления 2-го аккаунта (архив)

Перенесено в [archive/features-v1.2.147-155.md](./archive/features-v1.2.147-155.md) (2026-07-31, разгрузка под лимит 100 КБ): цвет аккаунта в закреплённых/уведомлении (v1.2.155); устойчивые цвет-метки — первый свободный + сохранение вместо хеша (v1.2.154); полоса/обводка/выбор цвета 🎨 (v1.2.153); спиннер ввода кода Telegram (v1.2.152); карточка выхода не заезжает под панель задач + спиннер «думания» (v1.2.150-151); сброс «залипшего success» гейта входа + разгрузка NativeApp (v1.2.148-149); фикс «чёрный экран» после добавления 2-го аккаунта (v1.2.147).

### v1.2.146-v1.2.140 — Добавление/удаление аккаунта (диагностика + фиксы следов) + закреп 📌 + маскировка кода в логах (архив)

Перенесено в [archive/features-v1.2.140-146.md](./archive/features-v1.2.140-146.md) (2026-07-31, разгрузка под лимит 100 КБ): фикс папки сессии при удалении аккаунта (v1.2.145) + чистка кэш-файла/проброс переименования (v1.2.146); диагностика чёрного экрана и операций с аккаунтом + ErrorBoundary вокруг InboxMode (v1.2.142-143); маскировка кода входа в логах (v1.2.144); значок 📌 в углу аватарки (v1.2.141); откат авто-чистки осиротевших закреплений — теряла данные (v1.2.140).

### v1.2.139-v1.2.138 — Локальное закрепление чатов (📌): базовая фича + доработки (архив)

Перенесено в [archive/features-v1.2.138-139.md](./archive/features-v1.2.138-139.md) (2026-07-30, разгрузка под лимит 100 КБ): локальное закрепление чатов полоской+значком 📌, правый клик, хранение в localStorage, НЕ синхронизируется с Telegram (v1.2.138); доработки — 📌 в узком режиме, устойчивый порядок по массиву pinnedIds, вынос `filterSortChats`, чистка осиротевших (позже откачена v1.2.140) (v1.2.139). Перетаскивание порядка сделано позже (v1.2.156→160).

### v1.2.137-v1.2.134 — Уведомление снимается при прочтении на другом устройстве + CI-фикс TZ снапшота + ВК vk.ru (архив)

Перенесено в [archive/features-v1.2.134-137.md](./archive/features-v1.2.134-137.md) (2026-07-30, разгрузка под лимит 100 КБ): прочитал чат в Telegram на телефоне → карточка-уведомление снимается, частичное чтение + чистая `shouldDismissForRead` (v1.2.137); snapshot ChatListItem сделан TZ-независимым — падал на CI под UTC (v1.2.135); ВК основной адрес → vk.ru + убрана лишняя ошибка `GUEST_VIEW_MANAGER_CALL` запасного впрыска (v1.2.134).

### v1.2.133-v1.2.130 — Строка списка чатов: время + имя отправителя (группы) + «Вы:» + значок форума + имя автора в уведомлении (архив)

Перенесено в [archive/features-v1.2.130-133.md](./archive/features-v1.2.130-133.md) (2026-07-30, разгрузка под лимит 100 КБ): время последнего сообщения + имя автора в превью групп/форумов + значок 🗂️ форума (v1.2.130); «Вы:» для своих + единая `lastSenderLabel` (v1.2.131); имя автора в заголовке уведомления + чистка мёртвого `pickNotifTitle` (v1.2.132); фикс залипания имени в превью + вынос `nativeStoreLastMsgIpc.js` (v1.2.133).

### v1.2.129-v1.2.126 — Уведомления: «невидимая стена»/heartbeat-сторож + ВК переносы строк (архив)

Перенесено в [archive/features-v1.2.126-129.md](./archive/features-v1.2.126-129.md) (2026-07-30, разгрузка под лимит 100 КБ): гасим «невидимую стену» сразу по видимой высоте (v1.2.128), heartbeat-сторож без спама (v1.2.127) и его первая версия (v1.2.126); ВК — переносы строк/абзацы в тексте уведомления через `_vkNodeText` (v1.2.129).

### v1.2.125-v1.2.122 — Уведомление «поверх всех» + ВК-хук (разгрузка/эмодзи/mute-детект/переносы строк) (архив)

Перенесено в [archive/features-v1.2.122-125.md](./archive/features-v1.2.122-125.md) (2026-07-29, разгрузка под лимит 100 КБ): окно уведомления надёжно поверх всех — `screen-saver`+reassert (v1.2.125); ВК-хук — удалён мёртвый toast-наблюдатель + эмодзи из `<img alt>` (v1.2.124), сужен mute-селектор + тесты чистых функций (v1.2.123), сохранены переносы строк + снят предел текста 1000 (v1.2.122).

### v1.2.121-v1.2.116 — Telegram: не показываем сторис; ВК/vk.ru: диагностики значка 🔕 + текст целиком + фикс «не уведомлять о заглушённых» (архив)

Перенесено в [archive/features-v1.2.116-121.md](./archive/features-v1.2.116-121.md) (2026-07-29, разгрузка под лимит 100 КБ): Telegram Web — гасим системную фразу «опубликовал(а) историю» (v1.2.121); ВК/vk.ru — итоговый фикс «не уведомлять о заглушённых чатах 🔕» по видимости значка (v1.2.120), текст уведомления целиком без своей мерки (v1.2.119), серия временных диагностик значка «беззвучно» (v1.2.116-118, диагностики давно удалены).

### v1.2.115-v1.2.108 — ВК переезд на vk.ru (детект/текст/диагностика) + время в источнике (архив)

Перенесено в [archive/features-v1.2.108-115.md](./archive/features-v1.2.108-115.md) (2026-07-27, разгрузка под лимит 100 КБ): переезд ВК на vk.ru + определение домена (v1.2.109); настоящий детект новых сообщений по списку чатов (v1.2.112) + подтверждение логом (v1.2.113); чистый текст уведомления по структуре строки (v1.2.114); 3 фикса по ревью — чистка времени/шторм на старте/дубль (v1.2.115); серия временных диагностик структуры vk.ru (v1.2.110/111); время сообщения в строке источника, единый формат (v1.2.108).

### v1.2.107-v1.2.101 — Уведомления: сторож стены + видео/фото в карточке (архив)

Перенесено в [archive/features-v1.2.101-107.md](./archive/features-v1.2.101-107.md) (2026-07-24, разгрузка под лимит 100 КБ): сторож «невидимой стены» + чистая decideNotifResize + быстрее закрытие (v1.2.107); фикс осиротевшего положительного отчёта — «невидимое зависшее окно», ловящее клики (v1.2.106); «Прочитано» для native-Telegram (v1.2.105); видео в уведомлении — постер/плеер как в чате, видео-как-документ, крутилка по факту (v1.2.101-104).

### v1.2.100-v1.2.90 — Уведомления/видео/фото + диагностика Telegram (архив)

Перенесено в [archive/features-v1.2.90-100.md](./archive/features-v1.2.90-100.md) (2026-07-23, разгрузка под лимит 100 КБ): страховка крутилки одиночного фото (v1.2.100), «размытый фон» одиночного фото (v1.2.99), крупный аватар + источник в шапке (v1.2.98), раскладка «Стопка» для всех карточек (v1.2.96-97), одиночное фото/видео в native-уведомлении (v1.2.95), диагностика фото/ссылок Telegram native+web (v1.2.90/92/93/94), расчёт вертикали дока в чистую функцию + тест (v1.2.91).

### v1.2.89-v1.2.74 — Док/подсказка/закреп + имя аккаунта + Telegram-аватар + альбом (архив)

Перенесено в [archive/features-v1.2.74-89.md](./archive/features-v1.2.74-89.md): фиксы дока/подсказки/закрепа (стабильный якорь верха, панель задач Windows, снятие snap, rAF/throttling; v1.2.76-89), доведение имени аккаунта до закрепа/подсказки (v1.2.83-88), Telegram аватар+источник в уведомлении (v1.2.75), листание альбома + чёткие плитки (v1.2.74).

### v1.2.73-v1.2.59 — Док/подсказка/закреп: серия фиксов (архив)

Перенесено в [.memory-bank/archive/features-v1.2.59-73.md](archive/features-v1.2.59-73.md) при разбиении (21 июля 2026). Архитектура — decisions.md ADR-017/ADR-018.

### v1.2.58-v1.2.46 — VK: тост/sidebar/active-chat уведомления, MAX dedup, ribbon (архив)

Перенесено в [.memory-bank/archive/features-v1.2.46-58.md](archive/features-v1.2.46-58.md) при разбиении (17 июля 2026).

### v1.2.45-v1.2.37 — VK DOM observer / диагностика уведомлений (архив)

Перенесено в [.memory-bank/archive/features-v1.2.37-45.md](archive/features-v1.2.37-45.md) при разбиении (17 июля 2026).

### v1.2.36-v1.2.30 — диагностика MAX/системы (архив)

Полные записи перенесены в [archive/features-v1.2.30-36.md](./archive/features-v1.2.30-36.md), чтобы active features.md оставался меньше лимита memory-bank. Суть: диагностика стала ручной, фоновой, с последним отчётом, полной MAX/VK-цепочкой и понятными кнопками; pipeline уведомлений этим блоком не менялся, кроме описанных в соответствующих версиях точечных MAX/VK исправлений.
### v1.2.29 — диагностика запускается только вручную и не мешает работе (архив)

Полная запись перенесена в [archive/features-v1.2.29.md](./archive/features-v1.2.29.md), чтобы активный features.md оставался меньше лимита memory-bank. Суть: большая модалка диагностики больше не стартует запись сама, управление записью стало явным, общий лог не очищается.
### v1.2.28 — MAX: sidebar watcher не создаёт фантомы во время поиска (архив)

Полная запись перенесена в [archive/features-v1.2.28.md](./archive/features-v1.2.28.md), чтобы активный features.md оставался меньше лимита memory-bank. Суть: `max-sidebar` при активном поиске MAX обновляет baseline, но не создаёт ribbon из старого preview; реальные `max-notification-api` и `max-sw-showNotification` не отключались.

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
