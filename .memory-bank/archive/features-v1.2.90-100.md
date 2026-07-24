# Архив features — v1.2.90–v1.2.100 (уведомления/видео/фото + диагностика Telegram)

Вынесено из активного `features.md` 2026-07-23 при разгрузке под лимит 100 КБ (файл дорос до 99 КБ).
Записи как были, новейшие сверху (v1.2.100 → v1.2.90).

---
### v1.2.100 — Фикс по ревью: страховка от «вечной» крутилки у одиночного фото

Дата: 21 июля 2026. Мелкий фикс по итогам придирчивого ревью v1.2.99.

**Проблема.** Крутилка на плитке одиночного фото снималась только при приходе чёткого превью (`notif:album-thumb` → `applyAlbumSharp`). Если превью не догрузилось (сбой сети/диска) — плитка навсегда оставалась с крутилкой и тёмной плёнкой поверх фото.

**Фикс.** В `renderAlbumGrid` для одиночного фото без готового превью (`isSingle && !sharp`) добавлен таймаут 8с: если превью не пришло — снимаем класс `loading` (крутилка и плёнка исчезают, остаётся фото целиком из strippedThumb). Если превью пришло раньше — `applyAlbumSharp` уже снял `loading`, таймер просто ничего не делает. Альбомные плитки (класс `blur`) НЕ затронуты — таймаут только для одиночного фото.

**Проверка:** тест с фейковым таймером (`vi.useFakeTimers` → `advanceTimersByTime(8000)` → `loading` снят). Полный набор `npm run test:vitest`.

Файл: `main/notification-helpers.js`, тест `src/__tests__/albumLiveCard.vitest.js`.

Откат: `git revert` коммита v1.2.100.

### v1.2.99 — Одиночное фото в уведомлении: «размытый фон» (фото целиком, без обрезки)

Дата: 21 июля 2026. UI по согласованному макету (вариант 2 из 10). Продолжение v1.2.95-98.

**Проблема.** Одиночное фото рисовалось `background-size:cover` в горизонтальной рамке 16:10 → вертикальное фото обрезалось (терялись верх и низ).

**Решение (вариант «размытый фон», как в Telegram/Instagram).** Для одиночного фото (`album.id` начинается с `single_`) в [renderAlbumGrid](../main/notification-helpers.js) вместо одной плитки-`cover` строятся ДВА слоя внутри `.album-tile.single`:
- `.sp-blur` — та же картинка `background-size:cover` + `filter:blur(20px) brightness(.55)` + `transform:scale(1.2)` → размытый фон заполняет поля;
- `.sp-main` — `background-size:contain` → фото показывается ЦЕЛИКОМ, ничего не режется.

Рамка `.single-photo .album-grid` — `aspect-ratio:3/2`. Догрузка чёткого превью [applyAlbumSharp](../main/notification-helpers.js) обновляет ОБА слоя (раньше — фон одной плитки).

**Media-group не затронута:** ветка `.single` включается только при `album.id` `single_*`; у альбома id числовой (groupedId) → грид 2×2 как был.

**Факты:** (1) было `cover` — [notification-helpers.js:133 (старое)]; (2) одиночное vs альбом различаются по `single_` — [shared/notifAlbum.js:34]; (3) `background-size:contain` вписывает без обрезки, `filter:blur` размывает только свой элемент — MDN (уровень 1).

**Крайние случаи:** нет чёткого превью → strippedThumb целиком + крутилка (`loading`, без общего блюра тайла); чёткое приходит позже → оба слоя обновляются; горизонтальное фото — тоже целиком (поля сверху/снизу); клик по плитке открывает смотрелку (обработчик на `.album-tile`, дети не мешают всплытию).

**Проверки:** vitest `albumLiveCard.vitest.js` +2 (плитка `.single` с двумя слоями; `applyAlbumSharp` обновляет оба); альбомные тесты (id `g1`) не затронуты; линт 0; лимиты — notification-helpers.js ~256/300, notification.css ~419/800. **Требует визуальной проверки.**

Файлы: `main/notification-helpers.js`, `main/notification.css`, `src/__tests__/albumLiveCard.vitest.js`.

Откат: `git revert` коммита v1.2.99.

### v1.2.98 — Уведомление: крупный аватар + источник «Мессенджер · Аккаунт» в шапке

Дата: 21 июля 2026. UI-изменение по просьбе пользователя (как сделано в подсказке закрепа). Продолжение v1.2.97.

**Задача.** В карточке уведомления: (1) аватар крупнее; (2) под именем канала показать название мессенджера и владельца учётной записи — «Telegram · БНК».

**Как сделано.** Шапка карточки собрана в флекс-ряд `.notif-head` (новый helper [buildStackHeader](../main/notification-helpers.js) в `notification-helpers.js`): КРУПНЫЙ аватар (44→50px, `flex-shrink:0`) + колонка `.notif-head-col` с именем (`.sender`) и источником (`.notif-source`). Колонка центрируется по вертикали относительно аватара (`align-items:center`, `flex-direction:column`) — без магических чисел.

**Источник.** Строка `.notif-source` = `[messengerName, accountName].filter(Boolean).join(' · ')` — тот же формат, что подсказка закрепа ([pin-tooltip.html:96-101](../main/pin-tooltip.html)). `accountName` в карточку уже приходил (v1.2.87, [notification.js]), но не отображался. Старую мелкую метку мессенджера сверху (`.messenger-name`, абсолют) спрятали под `.layout-stack` — источник теперь в шапке.

**Минимальность.** Сборка шапки вынесена в helper (notification-helpers.js 225→241, потолок 300); в `notification.js` заменена ОДНА строка (`textWrap.appendChild(sender)` → `textWrap.appendChild(buildStackHeader(avWrap, sender, mName, data.accountName))`) — ноль новых строк (728/730). `appendChild` перемещает аватар в шапку (MDN), дублей нет.

**Факты:** (1) аватар был 44px — [notification.css:115-120]; (2) accountName доходит до карточки — [notification.js:480]; (3) формат источника — [pin-tooltip.html:96-101] (ур.2); `flex`/`gap`/`appendChild-moves` — MDN (ур.1).

**Крайние случаи:** нет messengerName/accountName → источник не рисуется, только имя; длинное имя/источник — эллипсис (`nowrap`); стэки/альбом/expand — порядок в `.text-wrap` (head → body → album → action-row) сохранён; аватар не наезжает на × (`.notif-head padding-right:26px`).

**Проверки:** линт 0; лимиты — notification.js 728/730, notification-helpers.js 241/300, notification.css ~415/800; vitest прежние зелёные. **Требует визуальной проверки** — окно уведомления не тестируется без запуска.

Файлы: `main/notification.js`, `main/notification-helpers.js`, `main/notification.css`.

Откат: `git revert` коммита v1.2.98.

### v1.2.97 — Раскладка «Стопка» для ВСЕХ карточек уведомлений

Дата: 21 июля 2026. UI-изменение по просьбе пользователя. Продолжение v1.2.96 (там «Стопка» была только для одного фото).

**Задача.** Применить единый вид ко всем форматам уведомлений: текст, медиа-группа (несколько фото), одиночное фото — везде аватар + имя сверху в одну строку, контент на всю ширину.

**Как сделано.** Класс `.notif-item.layout-stack` теперь вешается на **каждую** карточку в [notification.js](../main/notification.js) (`el.classList.add('layout-stack')`), а не только на одиночное фото. CSS-блок переименован `.layout-photo` → `.layout-stack`: аватар выведен из потока (`position:absolute`; `.notif-item` уже `position:relative`), имя сдвинуто вправо (`padding-left:54px`), `.text-wrap` занимает всю ширину.

**Разделение фото:** полноширинное ОДНО фото одной плиткой (`grid-template-columns:1fr; height:auto; aspect-ratio:16/10`) вынесено под отдельный класс `.single-photo` (ставится только при `album.id` `single_*`). Медиа-группа НЕ получает этот override → её сетка 2×2 сохраняется (но теперь во всю ширину, т.к. `.text-wrap` полноширинная). Иначе альбом схлопнулся бы в один столбец.

**Факты:** (1) раньше класс был только на одиночном фото — [notification.js]; (2) грид медиа-группы 2×2 `repeat(2,1fr); height:208px` — [notification.css:337-344], поэтому single-column только под `.single-photo`; (3) `position:absolute` → относительно позиционированного предка, при равной специфичности CSS побеждает правило ниже по файлу (MDN, уровень 1); `aspect-ratio` поддержан в Chromium/Electron (MDN).

**Крайние случаи:** имя не наезжает на × (`padding-right:34px`); метка мессенджера не наезжает на аватар (`.has-mname` опускает аватар на 24px); текст/стэки получают шапку сверху без изменения логики; медиа-группа и одиночное фото проверены раздельно.

**Проверки:** линт 0; `fileSizeLimits` — notification.js 728/730, notification.css ~409/800; vitest прежние зелёные (рисовалка `renderAlbumGrid` не тронута). **Требует визуальной проверки** — окно уведомления не тестируется без запуска.

Файлы: `main/notification.js`, `main/notification.css`.

Откат: `git revert` коммита v1.2.97 (или вручную: вернуть `.layout-stack` → одиночное фото и убрать `el.classList.add('layout-stack')`).

### v1.2.96 — Уведомление с ОДНИМ фото: раскладка «Стопка» (фото на всю ширину)

Дата: 21 июля 2026. UI-изменение по согласованному макету (вариант 1). Продолжение v1.2.95.

**Задача.** После v1.2.95 одиночное фото стало показываться в уведомлении, но в «альбомном» формате: маленькая плитка в правой колонке, слева пусто (аватар отдельным столбцом), фото «не в размер».

**Как перекомпоновано.** Карточка с одиночным фото теперь: аватар + имя отправителя — в ОДНУ строку сверху; ниже — текст и фото на всю ширину (пропорция 16:10). Пустого места слева нет.

**Реализация (минимально, безопасно).** Раскладка включается ТОЛЬКО для одиночного фото — по признаку `album.id` начинается с `single_` ([shared/notifAlbum.js](../shared/notifAlbum.js)) вешается класс `.notif-item.layout-photo`. Media-group (сетка 2×2) и обычные текстовые уведомления НЕ затронуты. Правка почти вся в CSS: аватар выведен из потока (`position:absolute`; карточка уже `position:relative`), имя сдвинуто вправо (`padding-left:54px`), фото занимает всю ширину `.text-wrap` (`grid-template-columns:1fr; height:auto; aspect-ratio:16/10`). В `notification.js` — одна строка (повесить класс), 725→727 строк (потолок 730).

**Факты:** (1) текущая горизонтальная раскладка — [notification.css:25-28,115-140]; (2) одиночное фото vs альбом различаются по `album.id` `single_*` — [shared/notifAlbum.js:34]; (3) `Element.appendChild`/CSS `aspect-ratio` — MDN (уровень 1); перенос не потребовался, обошлись CSS.

**Крайние случаи:** длинное имя — эллипсис (nowrap); длинная подпись — эллипсис в одну строку (как раньше); фото без подписи — пустая строка текста (приемлемо); кнопка × не перекрывает имя (`padding-right:34px`); медиа-группа и текст — прежний вид.

**Проверки:** линт 0; `fileSizeLimits` — notification.js 727/730, notification.css ~409/800; vitest прежние зелёные (рисовалка `renderAlbumGrid` не тронута). **Требует визуальной проверки** — окно уведомления не тестируется без запуска.

Файлы: `main/notification.js`, `main/notification.css`.

Откат: `git revert` коммита v1.2.96 (или вручную: убрать блок `.layout-photo` в `notification.css` и одну строку `classList.add('layout-photo')` в `notification.js`).

### v1.2.95 — Одиночное фото/видео показывается в уведомлении native-Telegram

Дата: 21 июля 2026. Фикс по подтверждённой логом причине (v1.2.94: `media=photo thumb=Y grp=n`).

**Корень.** Картинка одиночного фото есть (`strippedThumb`), но поле `album` в payload уведомления строилось только при метке альбома `groupedId` ([nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js)) → одиночное фото шло без картинки.

**Фикс.** Расчёт поля `album` вынесен в чистую функцию `buildNotifAlbum(message, chatId)` — новый КОРНЕВОЙ [shared/notifAlbum.js](../shared/notifAlbum.js) (в `shared/`, а НЕ `src/`, чтобы не входить в общий renderer-бюджет — **лимит не поднимали**, правило проекта «не раздувать renderer»). Она строит карточку-«альбом» из ОДНОЙ плитки не только для media-group, но и для одиночного фото/видео с мини-картинкой (`mediaType` photo/video + `strippedThumb`). Id одиночного: `single_<messageId>`. Ссылки-превью (`mediaType='link'`) НЕ затронуты (картинка внутри web_page не извлекается — [[ADR-019]]). `preloadAlbumThumb` ([albumThumbPreload.js](../src/native/utils/albumThumbPreload.js)) расширен параметром `albumId`, чтобы чёткое превью пришло в карточку одиночного фото (`single_<id>`); media-group поведение прежнее.

**Крайние случаи (юнит-тест):** одиночное фото без мини-картинки → null (текст); текст/ссылка → null; фото без id → null; null-сообщение → null. Media-group даёт тот же объект, что и раньше (без регресса).

**Проверки:** [notifAlbum.vitest.js](../src/native/store/notifAlbum.vitest.js) — 8/8; `albumLiveCard.vitest.js` — 10/10 (рисовалка не тронута); линт 0; общий renderer-лимит `src/` НЕ поднимали (функция в корневом `shared/`, вне бюджета). Диагностика v1.2.94 (`media/thumb/wp/grp`) убрана.

**Требует визуальной проверки:** прислать одиночное фото → в уведомлении видна картинка. (Известно: плитка одиночного фото сейчас в «альбомном» формате — отдельная задача «показать 1 фото красиво в размер».)

Файлы: `shared/notifAlbum.js` (new, вне renderer-бюджета), `src/native/store/notifAlbum.vitest.js` (new), `src/native/store/nativeStoreIpc.js`, `src/native/utils/albumThumbPreload.js`.

Откат: `git revert` коммита v1.2.95.

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

