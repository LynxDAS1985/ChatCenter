# Реализованные функции — ChatCenter

## Текущая версия: v1.2.94 (21 июля 2026)

### v1.2.94 — ДИАГНОСТИКА: одиночное фото / ссылка-превью в уведомлении native-Telegram

Дата: 21 июля 2026. Только диагностика, фикс НЕ делался.

Задача: показывать картинку в уведомлении нативного Telegram и для ОДИНОЧНОГО сообщения (сейчас — только для альбома, v1.2.74). Пост Forbes с картинкой пришёл — в уведомлении только текст.

Разбор (5 версий) нашёл ДВЕ разные причины в зависимости от типа сообщения:
1. **Пост-ссылка** (`messageText` + `web_page`, напр. статья Forbes) → `mediaType='link'`, картинка превью **не извлекается вообще**: `extractMinithumbnail` смотрит только `content.photo/video/…`, но НЕ `content.web_page.photo` ([tdlibMapperMedia.js:15-22](../main/native/backends/tdlibMapperMedia.js#L15)); `photoUrl` явно `null` ([:57](../main/native/backends/tdlibMapperMedia.js#L57)).
2. **Настоящее одиночное фото** (`messagePhoto`) → мини-картинка (`strippedThumb`) есть, но в уведомление кладётся только при метке альбома `groupedId` ([nativeStoreIpc.js:509](../src/native/store/nativeStoreIpc.js#L509)).

Чтобы точно понять, что за сообщение (ссылка vs фото), расширен существующий лог `[native-notif] emit` полями `media=<тип> thumb=Y/n wp=Y/n grp=Y/n` — БЕЗ новой строки (файл на лимите 660). По логу выберем, какие из двух причин чинить (для «одного фото» нужны обе: и настоящее фото, и картинка-ссылка).

Файл: `src/native/store/nativeStoreIpc.js`. Ждём повтор: прислать пост с картинкой → 📒 Логи → строка `[native-notif] emit … media=… thumb=… wp=… grp=…`.

Откат: `git checkout -- src/native/store/nativeStoreIpc.js`.

### v1.2.93 — Фото в уведомлении веб-Telegram: расследование закрыто (оставлено текстом), лог убран

Дата: 21 июля 2026. Итог расследования v1.2.90/92. Решение зафиксировано в [decisions.md ADR-019](decisions.md).

**Результат (факт).** Диагностика `__CC_DIAG__tgimg` при реальном альбоме (2026-07-21) дала **`tgimg=N`**: Telegram Web НЕ кладёт фото сообщения в перехватываемое браузерное уведомление (`opts.image` пуст) — только текст «Альбом» и `icon=blob:` (аватар отправителя). Фото альбома существует только в DOM страницы.

**Решение.** WebView-уведомление оставляем текстом («Альбом»). Показать превью, как у нативного (TDLib, v1.2.74), можно только DOM-скрейпингом страницы — дорого и хрупко (тайминг: фото может быть ещё не отрисовано; разные вёрстки Telegram Web K/Z; клик «в полный размер» без TDLib не работает; не покрывается автотестами). Пользователь выбрал «оставить как есть». Подробнее и эскиз возможной будущей реализации — ADR-019.

**Что сделано в коде.** Убраны временные диагностические логи `__CC_DIAG__tgimg` из обоих путей перехвата (`window.Notification` и `ServiceWorkerRegistration.showNotification`) в [telegram.hook.js](../main/preloads/hooks/telegram.hook.js). Поведение уведомлений не изменилось.

**Урок (записан ранее в v1.2.92):** диагностический вывод в `chatcenter.log` режется ~60 символов — важное поле ставить первым и коротко.

Проверки: `node --check` хука, `notifHooks` 86/86, линт 0. Файл: `main/preloads/hooks/telegram.hook.js`.

Откат: `git revert` коммита v1.2.93 (вернёт диагностику).

### v1.2.92 — ДИАГНОСТИКА фото веб-Telegram: укорочен лог (прошлый обрезался журналом)

Дата: 21 июля 2026. Только диагностика, продолжение v1.2.90.

Пользователь прислал альбом из 3 фото. Лог v1.2.90 `__CC_DIAG__tg-notif-img` **обрезался журналом** (~60 символов) прямо на месте `image=`: в файле осталось `body="Альбом" icon=blob:https://web.telegra ima…`. Видно только `body="Альбом"` и `icon=blob:` (аватар); значение `opts.image` не влезло, потому что `icon` занял 24 символа бюджета.

Лог укорочен и переставлен: `__CC_DIAG__tgimg=Y <первые 40 симв image>` либо `=N` — теперь `image` ИДЁТ ПЕРВЫМ, а «Y»/«N» (есть ли фото в `opts.image`) стоит в первых символах и точно уцелеет при обрезке. В обоих путях перехвата (`window.Notification` + ServiceWorker).

Урок: диагностический вывод в `chatcenter.log` режется ~60 символов — **ставить самое важное поле ПЕРВЫМ и коротко**, не тратить бюджет на второстепенное.

Файл: `main/preloads/hooks/telegram.hook.js`. Ждём повтор альбома → строка `tgimg=Y/N` в 📒 Логах решит: `Y` = лёгкий фикс (взять `opts.image`), `N` = DOM-скрейпинг.

Откат: `git checkout -- main/preloads/hooks/telegram.hook.js`.

### v1.2.91 — Док: расчёт вертикали вынесен в чистую функцию + юнит-тест

Дата: 21 июля 2026. Улучшение по итогам ревью фикса v1.2.89 (совет #3). Поведение НЕ изменилось — только тестируемость.

**Зачем.** Тесты `pinTooltip.test.cjs` — статические (проверяют НАЛИЧИЕ строк кода через `.includes`), а не сами числа позиции. Они были зелёными, пока полоску дока сползало вниз (баг v1.2.89). То есть геометрию нельзя было проверить без запуска приложения.

**Что сделано.** Расчёт верхней Y-координаты окна дока вынесен из обработчика `dock:resize` ([dockPinHandlers.js](../main/handlers/dockPinHandlers.js)) в чистую функцию `computeDockTop({ baselineTopY, currentTopY, totalH, workAreaTop, screenBottom })` — новый файл [main/handlers/dockGeometry.js](../main/handlers/dockGeometry.js) БЕЗ зависимости от Electron. `dock:resize` теперь зовёт её. Логика та же: держим верх на якоре `baselineTopY` (ADR-018), кламп по низу экрана и по верху рабочей области.

**Тест.** Новый [main/handlers/dockGeometry.vitest.js](../main/handlers/dockGeometry.vitest.js) — 8 проверок: якорь, фолбэк при null/NaN, кламп низ/верх, «на панели задач», битая геометрия, и **тест-ловушка регрессии**: `baselineTopY=814, totalH=30 → 814` (раньше формула давала 834 — сползание вниз). vitest подхватывает `main/**/*.vitest.js` ([vitest.config.mjs:11](../vitest.config.mjs#L11)).

**Крайние случаи (покрыты тестом):** `baselineTopY` null/NaN/undefined → фолбэк на текущую позицию; все значения не-числа → возвращает конечное число (не падает).

Проверки: `npx vitest run main/handlers/dockGeometry.vitest.js` → 8/8; `pinTooltip` → 69; `fileSizeLimits` 509/509 (новые файлы покрыты правилами); линт 0. Файлы: `main/handlers/dockGeometry.js` (новый), `main/handlers/dockGeometry.vitest.js` (новый), `main/handlers/dockPinHandlers.js` (вызов + импорт).

Откат: `git checkout -- main/handlers/dockPinHandlers.js && rm main/handlers/dockGeometry.js main/handlers/dockGeometry.vitest.js` (+ вернуть проверки в `pinTooltip.test.cjs`).

### v1.2.90 — ДИАГНОСТИКА: есть ли фото в уведомлении веб-Telegram

Дата: 21 июля 2026. Только диагностический лог, фикс НЕ делался.

Задача: показать превью вложения (фото/альбом) в кастомном уведомлении WebView-Telegram, как уже сделано для нативного (TDLib, v1.2.74). Аудит (агент + чтение кода): фото не доходит, потому что WebView-путь перехватывает `window.Notification` и шлёт только текст («Альбом») + аватар отправителя ([telegram.hook.js:47-57](../main/preloads/hooks/telegram.hook.js#L47), [webviewHandleNewMessage.js:105-118](../src/utils/webviewHandleNewMessage.js#L105)). Само фото сообщения лежит только в DOM страницы.

Ключевой неизвестный факт, определяющий фикс: **кладёт ли Telegram Web фото в `opts.image`** перехваченного уведомления. По стандарту Web Notification (MDN) `icon` (маленькая) и `image` (большая) — разные поля, но код сливает их в одно ([telegram.hook.js:51](../main/preloads/hooks/telegram.hook.js#L51): `icon = opts.icon || opts.image || opts.badge`) → `opts.image` выбрасывается, если есть `opts.icon`. Статически не определить, что реально передаёт Telegram Web.
- Если `opts.image` несёт фото → фикс ЛЁГКИЙ (брать `image` отдельно, слать как картинку/альбом).
- Если `opts.image` пуст → нужен ДОРОГОЙ DOM-скрейпинг бабла сообщения (селекторы + тайминг).

Добавлен ВРЕМЕННЫЙ лог `__CC_DIAG__tg-notif-img` в оба пути перехвата (`window.Notification` и `ServiceWorkerRegistration.showNotification`): печатает наличие/значение `body/icon/image/badge`. По строке из журнала при реальном альбоме выберем точный фикс без гадания.

Файл: `main/preloads/hooks/telegram.hook.js`.

**Что проверить:** прислать альбом в веб-Telegram → 📒 Логи → строка `__CC_DIAG__tg-notif-img … image=…`. Если `image=blob:/http…` — лёгкий фикс; если `image=n` — DOM-скрейпинг.

Откат: `git checkout -- main/preloads/hooks/telegram.hook.js`.

### v1.2.89 — Док: полоска не сползает вниз при добавлении/удалении (стабильный якорь верха)

Дата: 20 июля 2026. По строгому разбору (проверено 5 версий причины + официальная дока Electron 42 + логи `[dock-diag]`).

**Корень.** `dock:resize` пересчитывал вертикаль из ЖИВОЙ высоты окна: `newY = bounds.y + bounds.height − totalH` ([dockPinHandlers.js](../main/handlers/dockPinHandlers.js)). Но высота окна (создаётся хардкодом 48, [dockPinState.js ensureDockWindow](../main/handlers/dockPinState.js)) не равна реальному контенту (~30-37), а на дробном DPI (125%) `getBounds()` может ещё округлять. Эта ошибка утекала в Y именно на add/remove (меняется ширина на целую вкладку → проходит мимо дед-бэнда, [dockPinHandlers.js:257](../main/handlers/dockPinHandlers.js#L257)), а клампа Y не было вовсе → полоска накопительно сползала вниз под панель задач. Лента всегда ОДИН ряд (`#dock { display:inline-flex; white-space:nowrap }`, без `flex-wrap`, [pin-dock.css:19,27](../main/pin-dock.css#L19)) → высота постоянна → вертикаль пересчитывать не нужно.

Опровергнутые версии: «формула двигает низ» (она держит низ, но от кривой высоты), «CSS-анимация даёт кривой offsetHeight» (удаление синхронное), «перенос на 2 ряда» (нет flex-wrap). Дока Electron 42: `setBounds` не порождает `will-move`/`will-resize`.

**Фикс.** Введён стабильный якорь верха `dockState.baselineTopY` (экранный Y верхней кромки), меняется ТОЛЬКО при реальном перетаскивании:
- `dock:resize` и `dock:ctx-menu-space` берут вертикаль из `baselineTopY`, а не из живой высоты окна.
- Добавлен кламп Y (не ниже низа экрана, не выше рабочей области) — раньше клампа Y не было.
- Обработчик `moved` сохраняет позицию только на реальный drag: пропускает программный `setBounds` (флаг `suppressMoved` через новый `setDockBoundsSilent`) и офскрин-позиции (safeHide, `bounds.x <= -1000`).

Итог: при добавлении/удалении вкладок двигается только правый край; верх/низ/лево на месте; сползание вниз устранено. Левый край и раньше был фиксирован (центрирование выключается настройкой «Расширение по центру»).

Файлы: `main/handlers/dockPinState.js`, `main/handlers/dockPinHandlers.js`. Тест: [pinTooltip.test.cjs](../src/__tests__/pinTooltip.test.cjs) → 67 (+6 проверок).

**Что проверить:** добавить/удалить закреп — полоска не прыгает вверх/вниз, растёт только вправо; перетащить мышью — позиция сохраняется; открыть правый клик по вкладке — меню не сдвигает полоску.

Откат: `git checkout -- main/handlers/dockPinState.js main/handlers/dockPinHandlers.js`.

### v1.2.88 — Чистка: убраны временные диагностические логи

Дата: 20 июля 2026. По просьбе пользователя после подтверждения фиксов.

Убраны все временные диагностические логи `[dock-diag]`, добавленные в v1.2.80–1.2.86 для поиска причин (полоска дока не видна / за панелью задач / имя аккаунта теряется). 10 точек в 5 файлах:
- `dockPinState.js`: `ensureDockWindow`, `moved`, `restoreDockBounds`, `addToDock`, `showTooltip`.
- `dockPinHandlers.js`: канал `dock:diag`, `pin-message`, `dock:resize`.
- `pin-dock.js`: `reportSize` (вызов diag) — вернулся к прямому `resize`.
- `pin-dock.preload.cjs`: метод `diag`.
- `nativeStoreIpc.js`: строка `[native-notif] emit` откачена к базовому виду (убраны `chatAcc`/`accs`/`resolvedAcct`).

**Все ФИКСЫ сохранены** (не тронуты): проброс `accountName` (v1.2.87), `backgroundThrottling:false` окну дока (v1.2.80), прямой `reportSize` без rAF (v1.2.80), кламп по низу экрана / на панели задач (v1.2.82), снятие snap-прилипания (v1.2.84), «Срочно» через `display:inline-block` (v1.2.83).

Файлы: `main/handlers/dockPinState.js`, `main/handlers/dockPinHandlers.js`, `main/pin-dock.js`, `main/preloads/pin-dock.preload.cjs`, `src/native/store/nativeStoreIpc.js`. Тест pinTooltip: 61 (проверяет фиксы, не диагностику).

**Что проверить:** уведомления/подсказка/док работают как в v1.2.87, лог `chatcenter.log` больше не засоряется строками `[dock-diag]`.

Откат: `git revert` коммита v1.2.88 (вернёт диагностику).

### v1.2.87 — Фикс: имя аккаунта доходит до закрепа/подсказки

Дата: 20 июля 2026. Фикс по точным данным диагностики v1.2.86 (не гадание).

**Диагноз из логов:**
```
A. [native-notif] emit … chatAcc=tg_611696632 accs=[{id:tg_611696632,name:БНК}] resolvedAcct=БНК  ← имя НАЙДЕНО
B. [dock-diag] pin-message in accountName=<none>   ← имя ПОТЕРЯНО
C. [dock-diag] showTooltip accountName=<none>      ← пусто (следствие B)
```
Имя терялось между уведомлением (A) и закрепом (B).

**Корень:** `showCustomNotification` ([notificationManager.js:195,263](../main/handlers/notificationManager.js#L195)) — конвейер окна уведомления — НЕ пробрасывала `accountName`: поля не было ни в деструктуризации входных параметров, ни в объекте `data`, который уходит в окно уведомления. Поэтому в `notification.js` `data.accountName` был `undefined`, кнопка 📌 (`createPinBtn`) передавала в закреп пустую строку.

**Фикс:** добавлен `accountName` в оба места — в список принимаемых полей и в объект `data`. Цепочка целая: уведомление → окно → 📌 → `createPinBtn` → закреп → `showTooltip` → подсказка «Telegram · БНК · время».

Диагностические логи (`resolvedAcct`, `[dock-diag] pin-message/showTooltip`) ОСТАВЛЕНЫ для подтверждения — удалить после проверки пользователем (вместе с ранними `[dock-diag]`).

Файл: `main/handlers/notificationManager.js`. Тест: [pinTooltip.test.cjs](../src/__tests__/pinTooltip.test.cjs) → 61 (+2 проверки на проброс accountName).

**Что проверить:** закрепить свежее уведомление Telegram → в подсказке источник «Telegram · <аккаунт> · время». В логе: `pin-message accountName=БНК`.

Откат: `git checkout -- main/handlers/notificationManager.js`.

### v1.2.86 — ДИАГНОСТИКА: имя аккаунта — трассировка всей цепочки

Дата: 20 июля 2026. Только логи, фикс НЕ делался (по просьбе пользователя — «не гадать, добавь логи»).

Имя аккаунта проходит цепочку: уведомление → `createPinBtn` → закреп (`item.data`) → `showTooltip` → подсказка. Чтобы точно найти, где оно теряется, добавлены логи в 3 точки:
- **(A) уведомление** ([nativeStoreIpc.js:480](../src/native/store/nativeStoreIpc.js#L480)): `[native-notif] emit … chatAcc=<chat.accountId> accs=<[{id,name}]> resolvedAcct=<найденное имя или <none>>` — нашлось ли имя при поиске по аккаунтам.
- **(B) создание закрепа** ([dockPinHandlers.js](../main/handlers/dockPinHandlers.js), `notif:pin-message`): `[dock-diag] pin-message in accountName=…` — что реально пришло в закреп.
- **(C) подсказка** ([dockPinState.js](../main/handlers/dockPinState.js), `showTooltip`): `[dock-diag] showTooltip pin=… accountName=…` — что ушло в подсказку.

Логика диагноза: если A `resolvedAcct=<none>` → ломается поиск по аккаунтам (accs покажет реальные id/имена vs chatAcc). Если A нашёл, но B пусто → теряется в `createPinBtn`/`pinMessage`. Если B есть, а C пусто → теряется в `showTooltip`.

Файлы: `src/native/store/nativeStoreIpc.js` (расширен лог, без роста файла), `main/handlers/dockPinHandlers.js`, `main/handlers/dockPinState.js`.

**Что проверить:** v1.2.86 → закрепить сообщение + навести на вкладку дока → прислать строки `[native-notif] emit`, `[dock-diag] pin-message`, `[dock-diag] showTooltip` из журнала.

Откат: `git checkout -- src/native/store/nativeStoreIpc.js main/handlers/dockPinHandlers.js main/handlers/dockPinState.js`.

### v1.2.85 — ДИАГНОСТИКА: имя аккаунта в уведомлении не находится

Дата: 20 июля 2026. Только диагностика, фикс НЕ делался.

Пользователь подтвердил: имя аккаунта в источнике подсказки пусто и на НОВОМ закрепе, на свежей сборке — то есть прошлая гипотеза «старые данные до пересборки» ОШИБОЧНА (моя ошибка).

По коду поиск обязан работать: `account.id` = accountId (`tg_<число>`, [tdlibIpcHandlers.js:82](../main/native/tdlibIpcHandlers.js#L82)), `account.name` = displayName (там же :93), `chat.accountId` = тот же `tg_<число>` (mapChat). Значит `(accounts).find(a => a.id === chat.accountId)?.name` должен вернуть имя. Но возвращает пусто. Причину статическим чтением найти не удалось (TIME-BOX).

Расширена существующая строка лога `[native-notif] emit` ([nativeStoreIpc.js:480](../src/native/store/nativeStoreIpc.js#L480)) — добавлены `chatAcc=<chat.accountId>` и `accs=<[{id,name}] всех аккаунтов>`. На следующем уведомлении лог покажет реальные значения → станет виден рассинхрон (формат id / пустой name / пустой список). Правка НЕ добавляет строк (файл на лимите 660).

Файл: `src/native/store/nativeStoreIpc.js`.

**Что проверить:** запустить v1.2.85 → дождаться уведомления Telegram → открыть 📒 Логи → прислать строку `[native-notif] emit … chatAcc=… accs=…`.

Откат: `git checkout -- src/native/store/nativeStoreIpc.js`.

### v1.2.84 — Док: убрано прилипание к краям экрана

Дата: 20 июля 2026. По просьбе пользователя.

Полоска дока при перетаскивании «прилипала» (snap) к краям рабочей области/экрана в радиусе 20px — мешало точно позиционировать. Обработчик `moved` ([dockPinState.js](../main/handlers/dockPinState.js)) переписан: убраны все проверки snap (лево/право/верх/низ), окно остаётся ровно там, куда отпустили. Сохранение позиции в `storage.dockPosition` оставлено, кламп по низу экрана оставлен (окно не уходит ниже нижнего края, позиция «на панели задач» из v1.2.82 сохраняется).

Тест: [pinTooltip.test.cjs](../src/__tests__/pinTooltip.test.cjs) → 59.

**Побочно (разобрано, БЕЗ кода):**
- «Полоска растёт в обе стороны при добавлении задачи» — это включённая настройка «**Расширение по центру**» (`dockCenterExpand`, [SettingsPanel.jsx:397](../src/components/SettingsPanel.jsx#L397)). Выключить → полоска растёт только вправо (левый край фиксирован). Не баг.
- «Имя аккаунта в источнике» — фикс v1.2.83 корректен (поля `chat.accountId` = `account.id` совпадают), работает для НОВЫХ закрепов. Старые закрепы (до пересборки) имени аккаунта не содержат — аккаунты на диске не хранятся, только в памяти из TDLib.

Файл: `main/handlers/dockPinState.js`.

**Что проверить:** перетащить полоску — она не «прыгает» к краям, остаётся где отпустил.

Откат: `git checkout -- main/handlers/dockPinState.js`.

### v1.2.83 — Подсказка: «Срочно» показывается + имя аккаунта в источнике

Дата: 20 июля 2026. Два фикса карточки-подсказки задачи (по скриншотам пользователя).

**Баг 1 — «Срочно» (категория) не показывалась в подсказке, хотя выставлена в карточке закрепа.** КОРЕНЬ (CSS/JS): `.tt-cat` спрятана правилом В CSS-стиле (`display:none`, [pin-tooltip.html:35](../main/pin-tooltip.html#L35)), а код показывал её через `catEl.style.display = ''` — пустая строка означает «взять значение из таблицы стилей», а там `display:none` → категория оставалась скрытой. Заметка при этом работала, потому что её `display:none` прописан В HTML-теге (inline), и `style.display=''` его снимает. Симметрия обработчиков категории/заметки была верной — баг чисто в вёрстке. Фикс: `catEl.style.display = 'inline-block'` (явное значение перекрывает CSS).

**Баг 2 — имя аккаунта («БНК») не показывалось в источнике.** Оно НИГДЕ не передавалось (источник = только `messengerName + time`). Фикс: новое поле `accountName` берётся из `stateRef.current.accounts.find(a => a.id === chat.accountId).name` в момент уведомления и прокидывается через всю цепочку: уведомление → `createPinBtn` → закреп (`pinMessage`) → `showTooltip` → подсказка рисует источник «Telegram · БНК · время».

Файлы: `main/pin-tooltip.html` (оба фикса), `main/handlers/dockPinState.js` (showTooltip +accountName), `main/notification-helpers.js` (createPinBtn +accountName), `main/notification.js` (2 вызова createPinBtn), `src/native/store/nativeStoreIpc.js` (payload +accountName — файл у лимита 660, комментарий сжат чтобы влезть).

Тест: [pinTooltip.test.cjs](../src/__tests__/pinTooltip.test.cjs) → 57 (+5 проверок).

**Требует визуальной проверки:** выставить «🔴 Срочно» в карточке → навести на вкладку дока → в подсказке виден значок «🔴 Срочно» И источник «Telegram · <аккаунт> · время».

Откат: `git checkout -- main/pin-tooltip.html main/handlers/dockPinState.js main/notification-helpers.js main/notification.js src/native/store/nativeStoreIpc.js`.

### v1.2.82 — Док: можно держать НА панели задач Windows (не поднимается вверх после старта)

Дата: 20 июля 2026. Фикс по данным диагностики v1.2.81.

**Жалоба (уточнённая):** пользователь ставит полоску дока НА панель задач Windows (там она видна, т.к. «поверх всех») — но после перезапуска полоска поднимается ВЫШЕ панели задач. Хочет, чтобы оставалась на панели.

**Факты из лога `[dock-diag]`:** экран `workArea {x:0,y:0,w:1536,h:816}` (панель задач 816–864). Перетаскивание: `moved bounds y=818` (док на панели), но кламп `maxDockY=779` → `save y=779` (позицию подняло к низу рабочей области). Старт: `ensureDockWindow saved y=779 → maxBaseY=768 → baseY=768` → док над панелью.

**Корень:** анти-панельный кламп из v1.2.61 (`maxDockY`/`maxBaseY = низ рабочей области`) насильно поднимает док над панелью задач. Он вводился, когда док уходил ЗА панель и пропадал — но ПОСЛЕ него добавлен z-order reassert (v1.2.62-63: `screen-saver` level + периодический + по событиям главного окна), поэтому док на панели теперь виден, и кламп стал вредным.

**Фикс:** нижний предел позиции дока = низ ЭКРАНА (`display.bounds`), а не рабочей области. В 4 местах ([dockPinState.js](../main/handlers/dockPinState.js)): `ensureDockWindow` (maxBaseY), `moved` (снап к низу экрана + maxDockY), `restoreDockBounds` (maxBaseY), `display-metrics-changed` (maxY). Дефолт ПЕРВОГО запуска (нет сохранённой позиции) остался над панелью задач.

Логи `[dock-diag]` (v1.2.80/81) пока ОСТАВЛЕНЫ — удалить после подтверждения пользователем, что фикс работает.

Файл: `main/handlers/dockPinState.js`.

**Что проверить:** перетащить док на панель задач → перезапустить → полоска осталась на панели (не поднялась вверх).

Откат: `git checkout -- main/handlers/dockPinState.js`.

### v1.2.81 — ДИАГНОСТИКА: док уходит за панель задач после старта

Дата: 20 июля 2026. Только диагностические логи, фикс НЕ делался.

**Жалоба:** пользователь перетаскивает полоску дока вниз к панели задач Windows; после перезапуска приложения полоска автоматически уходит ЗА панель задач.

**Факты (по данным с диска/логов):** `dockPosition {x:0, y:779}` в `chatcenter.json`; `workArea.height=816` (из `[notif-resize] CLAMP`, [notifHandlers.js:178](../main/handlers/notifHandlers.js#L178)). По коду кламп в `moved` (`maxDockY = wa.y+wa.height-baseHeight`) и в `ensureDockWindow` (`maxBaseY = wa.y+wa.height-dockH`) ДОЛЖЕН держать док над панелью задач. То есть по чистой математике при wa.y=0/height=816 док остаётся над панелью — значит есть runtime-фактор, невидимый со стороны: вероятно `workArea.y`≠0 или авто-скрытие панели задач (тогда workArea = весь экран, кламп не защищает), либо реальная высота окна дока ≠ хардкод 48.

**Проблема диагностики:** позиция дока при перетаскивании (`moved`) и при восстановлении на старте (`ensureDockWindow`) НИГДЕ не логировалась. Добавлены временные `[dock-diag]`:
- `moved`: `bounds`, `wa`, `baseHeight`, `dockY`, `snapped`, `maxDockY`, что сохраняем.
- `ensureDockWindow`: `saved`, `wa`, `dockH`, `maxBaseY`, `baseY`, `startY`.

**Что даст:** на перезапуске увидим точные `workArea` (вкл. `y`), реальную высоту окна и сохранённую/вычисленную позицию → точная причина, без гадания. Удалить логи после диагноза (вместе с `[dock-diag]` из v1.2.80).

Файл: `main/handlers/dockPinState.js`.

**Что проверить:** пересобрать/запустить v1.2.81, перетащить док вниз, перезапустить, прислать строки `[dock-diag]` из журнала (📒 Логи ЦентрЧатов).

Откат: `git checkout -- main/handlers/dockPinState.js`.

### v1.2.80 — Док: полоска не видна после «Свернуть» — фикс rAF/throttling + диагностика

Дата: 20 июля 2026. Баг вернулся после «фикса» v1.2.76 (не помог).

**Аудит (2 стороны):**
- Сохранённая позиция дока на диске (`chatcenter.json`) ВАЛИДНА: `dockPosition {x:46, y:779}`. Прошлая гипотеза про «отравленную позицию −30000» ОПРОВЕРГНУТА реальным фактом (важно: проверил файл, а не поверил догадке).
- Реальный дефект: окно дока — **единственное** из окон закрепа/уведомлений БЕЗ `backgroundThrottling:false` ([dockPinState.js](../main/handlers/dockPinState.js) vs подсказка [dockPinUtils.js:73](../main/handlers/dockPinUtils.js#L73)). А `reportSize` слал размер полоски через `requestAnimationFrame` ([pin-dock.js](../main/pin-dock.js)). У скрытого окна rAF засыпает (ловушка #28) → размер не уходил в main после показа → полоска не того размера / не видна.

**Фикс:** (1) `backgroundThrottling:false` окну дока; (2) `reportSize` шлёт размер НАПРЯМУЮ, без rAF (как у окна-подсказки v1.2.71).

**Временная диагностика `[dock-diag]`** (удалить после подтверждения): renderer — сработал ли `reportSize`; main — `bounds`/`isVisible` дока после показа (`addToDock`), что ставит `restoreDockBounds`, что приходит в `dock:resize`. Канал `dock:diag` в preload → `console.log` в main → `chatcenter.log`.

Файлы: `main/handlers/dockPinState.js`, `main/pin-dock.js`, `main/preloads/pin-dock.preload.cjs`, `main/handlers/dockPinHandlers.js`. Тест pinTooltip → 52.

**Требует визуальной проверки:** закрепить сообщение → «Свернуть» → полоска дока видна внизу. Если нет — прислать строки `[dock-diag]` из журнала (📒 Логи ЦентрЧатов), они покажут точную причину.

Откат: `git checkout -- main/handlers/dockPinState.js main/pin-dock.js main/preloads/pin-dock.preload.cjs main/handlers/dockPinHandlers.js`.

### v1.2.79 — План разбиения файлов у лимита

Дата: 20 июля 2026. Совет 5 из сессии. Только Memory Bank, код не тронут.

Обновлён `code-limits-status.md`: свежий снапшот **24 файлов на 80%+ лимита** (устаревшая таблица заменена) + приоритетный план разбиения. Выделены файлы на **100%** (`max.hook.js` 300/300, `shared/vkExecFallback.js` 300/300) и на волосок (`nativeStoreIpc.js` 659/660, `vkDiagnostics.js` 494/500, `webContentsViewManager.js` 293/300) — их следующая правка заблокирует коммит. Для каждого указан безопасный способ разреза.

**Массовый разрез НЕ делался — осознанно.** Разбиение рабочих файлов кода = перемещение логики + правка импортов; приложение агент не запускает, а инъекционные файлы (`*.hook.js`, `*.preload.cjs`, `vkExecFallback`) работают внутри WebView — ошибка не ловится авто-тестами, только визуально в живом мессенджере. Правильный подход: резать по ОДНОМУ файлу под конкретную задачу, с проверкой пользователем. Сейчас ни один файл не за лимитом — срочности нет, план на будущее.

Откат: `git checkout -- .memory-bank/code-limits-status.md CLAUDE.md`.

### v1.2.78 — Разгрузка памяти: notifications-ribbon.md

Дата: 20 июля 2026. Совет 3 из сессии. Только Memory Bank, код не тронут.

Файл `mistakes/notifications-ribbon.md` был у лимита (198/200 КБ) — следующее дополнение заблокировало бы коммит. Старые ловушки (#28–#32, версии v0.89.35–v1.2.7, а также «карта серии v0.89.18-27») вынесены в новый файл `mistakes/notifications-ribbon-history.md` (~139 КБ). Все они РЕШЕНЫ — нужны только при работе со старым кодом BrowserWindow-уведомлений (rAF throttling в скрытом окне, MAX title-update, WhatsApp SVG-текст, cross-session isOutgoing).

Основной `notifications-ribbon.md` сжат до ~59 КБ и содержит свежие ловушки (v1.2.x: VK-тосты, MAX-дубли, Native Telegram стандарт, MAX-сага пачки сообщений). Указатели на историю добавлены: в конце основного файла, в индексе `common-mistakes.md` и в таблице `mistakes/` в CLAUDE.md.

Откат: `git checkout -- .memory-bank/mistakes/notifications-ribbon.md .memory-bank/common-mistakes.md CLAUDE.md && rm .memory-bank/mistakes/notifications-ribbon-history.md`.

### v1.2.77 — Аватар в уведомлении: кэш-проверка до сброса состояния

Дата: 20 июля 2026. Совет 1 из сессии. Мелкое улучшение к v1.2.75 (аватар в уведомлении Telegram).

**Проблема:** аватар чата в состоянии (`chat.avatar`) обновляется с задержкой — `tg:chat-avatar` события батчатся через rAF (до ~1.5с, `flushPendingChatAvatar`, [nativeStoreIpc.js:516-534](../src/native/store/nativeStoreIpc.js#L516-L534)), чтобы не делать 300+ рендеров при старте. Если сообщение-уведомление приходит в это окно задержки, `chat?.avatar` ещё пустой → показывалась эмодзи-заглушка, хотя свежий аватар уже лежал в `pendingChatAvatar` (тот же ключ `chatId`).

**Фикс (одна строка):** `iconDataUrl: chat?.avatar || pendingChatAvatar.get(chatId) || ''` ([nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js)). Уведомление берёт аватар из пенды, если он ещё не влит в state.

**Безопасность:** битый/устаревший URL ловит `img.onerror` в окне уведомления ([notification.js:417](../main/notification.js#L417)) → эмодзи. Ключа нет → `undefined` → `''`. Тот же процесс, тот же источник, что `chat.avatar` — новых зависимостей нет.

**Что НЕ делалось (и почему):** полная версия «обновлять уже показанное уведомление, когда фото догрузилось» существует только для WebView-иконок по http (`updateNotificationIconLater`, [notificationManager.js:83-93](../main/handlers/notificationManager.js#L83-L93)). Для native (cc-media) она потребовала бы main-side связки «chatId → id уведомления» + прокидывания позднего avatar-события между процессами — многофайловая правка в исторически хрупком коде уведомлений, невозможно проверить без запуска. Отложено как отдельная задача.

Файл: `src/native/store/nativeStoreIpc.js`. Тест pinTooltip → 50 (+ проверка fallback на `pendingChatAvatar`).

**Требует визуальной проверки:** у совсем нового чата первое уведомление сразу с аватаром (если фото успело прийти в пенду).

Откат: `git checkout -- src/native/store/nativeStoreIpc.js`.

### v1.2.76 — Док: полоска не пропадает после «Свернуть»

Дата: 20 июля 2026. Баг: пользователь нажимает «Свернуть» на карточке закрепа, но полоска дока не появляется на привычном месте внизу экрана — её просто не видно.

**Корень (по расследованию кода):** окно дока переиспользуется (синглтон, [dockPinState.js:102](../main/handlers/dockPinState.js#L102)). Когда закреплённых задач становится 0, `checkDockVisibility` прячет окно через `safeHideTransparentWindow` → уводит в `{x:-30000, y:-30000, width:1, height:1}` (защита от ghost hit-region на Win11). При следующем показе `addToDock` вызывал `dock.showInactive()` по СТАРЫМ офскрин-координатам, а `dock:resize` вычислял новый Y от текущих (офскрин) `bounds` и клампил только X, но не Y ([dockPinHandlers.js:248-262](../main/handlers/dockPinHandlers.js#L248-L262)) → окно считалось «видимым», но стояло за верхней кромкой экрана (Y ≈ −30047) и физически не показывалось.

**Фикс:** новая функция `restoreDockBounds(dock)` ([dockPinState.js](../main/handlers/dockPinState.js)) перед показом в `addToDock` (когда окно скрыто) возвращает его в низ рабочей области — `display.workArea` (над панелью задач), по той же формуле, что `ensureDockWindow`, с учётом сохранённой `dockPosition`. Дальше `dock:resize` уточняет ширину/высоту от уже валидной нижней границы.

Кнопка «Свернуть» сама док не показывает — при создании закрепа он уже показывается через `addToDock` ([dockPinHandlers.js:57](../main/handlers/dockPinHandlers.js#L57)); фикс делает этот показ корректным по позиции.

Файл: `main/handlers/dockPinState.js` (одна новая функция + её вызов). Тест: [pinTooltip.test.cjs](../src/__tests__/pinTooltip.test.cjs) → 49 (+ проверка `restoreDockBounds` и её вызова в `addToDock`).

**Требует визуальной проверки:** после «Свернуть» полоска дока видна внизу; после цикла «0 задач → новая задача» полоска снова появляется на своём месте.

Откат: `git checkout -- main/handlers/dockPinState.js`.

### v1.2.75 — Telegram: аватар отправителя + источник в уведомлении и подсказке

Дата: 17 июля 2026. По согласованному макету («Станет»): у нативного Telegram (TDLib) в карточке уведомления и в подсказке задачи теперь показываются аватар и источник. «Срочно» уже работало (метка закреплённой задачи).

**Аватар (уведомление + подсказка):** фото профиля TDLib уже скачивается в `cc-media://avatars/…` ([tdlibAvatars.js](../main/native/backends/tdlibAvatars.js)). Раньше оно клалось в `iconUrl`, но конвейер уведомлений принимает только http/data-url и отбрасывал `cc-media://`. Теперь в [nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js) аватар кладётся прямо в `iconDataUrl` — окно уведомления рисует `cc-media://` напрямую (protocol глобальный). Пусто (фото ещё не скачано) → прежняя эмодзи-заглушка ✈️. Через `createPinBtn` (`icon`) аватар доходит и до закрепа, а `showTooltip` теперь прокидывает `icon` в подсказку — там рисуется кружок-аватар (или буква имени, если фото нет).

**Источник «Telegram» (подсказка):** раньше в подсказке для native_cc было пусто (его нет в списке мессенджеров, откуда бралось имя). Теперь `createPinBtn` передаёт `messengerName` (для native — «Telegram», приходит из уведомления, [nativeStoreIpc.js:495](../src/native/store/nativeStoreIpc.js)) в закреп → подсказка показывает «Telegram · время». В самой карточке уведомления «Telegram» показывался и раньше.

**Вёрстка подсказки** ([pin-tooltip.html](../main/pin-tooltip.html)): шапка = аватар + (отправитель / «источник · время»), ниже категория, текст, заметка (Вариант 4 из макета).

Файлы: `src/native/store/nativeStoreIpc.js`, `main/notification-helpers.js` (createPinBtn +messengerName), `main/notification.js` (2 вызова createPinBtn), `main/handlers/dockPinState.js` (showTooltip +icon), `main/pin-tooltip.html` (вёрстка + аватар).

Тест: [pinTooltip.test.cjs](../src/__tests__/pinTooltip.test.cjs) → 46 (+ аватар в подсказке, icon в payload, messengerName в createPinBtn, cc-media аватар в native payload).

Проверки: `node --check` всех, `pinTooltip` 46/46, `npm run lint`, `npm run check-memory`, pre-push. **Требует визуальной проверки**: у Telegram-уведомления/подсказки виден аватар (если фото скачано) и «Telegram» как источник.

Откат: `git checkout -- src/native/store/nativeStoreIpc.js main/notification-helpers.js main/notification.js main/handlers/dockPinState.js main/pin-tooltip.html`.

### v1.2.74 — Альбом в уведомлении: листание страницами + чёткие плитки + быстрое открытие

Дата: 17 июля 2026. Что: реализованы 3 улучшения карточки альбома (media group) по согласованному с пользователем макету (5 итераций в артефакте).

- **C2 — листание страницами по 4** (вместо «+N»): сетка 2×2 листается стрелками ‹ › со счётчиком «1–4 / N» и точками-страницами. Высота области **фиксирована** (`.album-grid height:208px`, число строк из JS) → карточка **не прыгает** при листании неполных страниц. Неполная страница раскладывается ровно: 1 фото — на всю ширину, 3 фото — нижнее широкое (`.album-tile.wide`), без «дырки».
- **A1 — чёткие плитки**: плитка сперва мутная (strippedThumb) + крутилка, затем фоновая догрузка чёткого превью (`tg:download-media thumb:true` в главном окне → путь cc-media → канал `notif:album-thumb` → окно) заменяет фон и убирает крутилку (`applyAlbumSharp`, кэш в `album.sharpThumbs`). cc-media работает в окне уведомления (глобальный protocol на default-сессии).
- **B1 — быстрое открытие**: клик по плитке открывает нажатое фото на весь экран СРАЗУ (раньше ждали скачивания всех ~20с), остальные догружаются фоном и обновляют ту же смотрелку (`photo:open` reuse через `photo:set-srcs`).

Файлы: `main/notification.js`, `main/notification-helpers.js` (renderAlbumGrid → пагинация + `applyAlbumSharp`), `main/notification.css`, `main/handlers/notifHandlers.js` (канал `notif:album-thumb`), `main/preloads/notification.preload.cjs` (`onAlbumThumb`), `src/hooks/useAppIPCListeners.js` (B1), `src/native/store/nativeStoreIpc.js` + новый `src/native/utils/albumThumbPreload.js` (A1).
Тесты: `src/__tests__/albumLiveCard.vitest.js` (10 проверок — пагинация, ровная раскладка, applyAlbumSharp, подпись). Проверено: линт 0, лимиты 507/507, IPC 41/41, vitest 64/64, guards зелёные. **Требует визуальной проверки** (окно уведомления не тестируется без запуска приложения).

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
