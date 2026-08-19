# Ловушки: Electron core и WebView инфраструктура

**Извлечено из** `common-mistakes.md` 24 апреля 2026 (v0.87.54).
**Темы**: ELECTRON_RUN_AS_NODE, WebView (partition, preload, context isolation), IPC, Настройки (SettingsPanel), AI-панель (AISidebar), Авто-ответ, ИИ-интеграция, **сборка/Tailwind**, **окна BrowserWindow (sandbox/preload/src)**.

---

## 🔴 Новое BrowserWindow: без `sandbox:false` ESM-preload НЕ грузится в установленной версии (dev работает, prod — нет) (2026-08-19, v1.2.297→298)

**Симптом.** Окно просмотра фото: в DEV всё работает, а в УСТАНОВЛЕННОЙ версии — картинка битая (виден `alt` «photo»), и окно НЕ закрывается (кнопки не реагируют). То есть баг виден только после сборки установщика.

**Корень (по коду + офиц. Electron).** Окно фото ([photoViewerHandler.js:62](../../main/handlers/photoViewerHandler.js)) было ЕДИНСТВЕННЫМ окном проекта без `sandbox: false`. `electron-vite` собирает preload как ESM (`out/preload/*.mjs`), а **ESM-preload грузится ТОЛЬКО при `sandbox:false`** (в песочнице preload обязан быть CommonJS — правило Electron уровня 1). В dev preload = исходный `.cjs` → грузится и с песочницей, поэтому в dev дефекта нет. Без preload нет `window.photo` → `img.src` не ставится, `window.photo?.close()` — пустышка. Оба симптома (битое фото + не закрывается) = ОДНА причина.

**Как не повторить.**
1. **Любое новое `BrowserWindow` с ESM-preload → ставь `sandbox: false`** в `webPreferences` (как у всех прочих окон: `notificationManager`, `windowManager`, `dockPin*`, `aiLogin`, tray). `contextIsolation:true`/`nodeIntegration:false` при этом сохраняются.
2. **Проверять баги окон в СБОРКЕ, а не только в dev** — путь preload и его формат (`.cjs` vs `.mjs`) в dev и prod РАЗНЫЕ.
3. Если сырой путь файла (`file.local.path` из TDLib) уходит в `<img src>`/`<video src>` отдельного окна (`loadFile`) — сначала конвертируй в адрес `file:///` + `encodeURI` (`cc-media://` работает только в renderer на localhost) и добавь `file:` в CSP `img-src`/`media-src`. См. `resolvePhotoSrc`/`resolveVideoSrc`.

**Факт уровня 1** (Electron docs, «Process Sandboxing»): sandboxed-preload обязан быть CommonJS; ESM-preload требует `sandbox:false`.

---

## 🟢 `webContents.send` в закрывающееся окно: проверки `win.isDestroyed()` МАЛО, нужен ещё `webContents.isDestroyed()` + try/catch (2026-08-14, v1.2.274)

**Симптом.** В журнале редкие ERROR `Error sending from webFrameMain: Render frame was disposed before WebFrameMain could be accessed` (3 шт. за сессию), стек ведёт на наш `webContents.send`. Не краш, но засоряет ERROR-уровень.

**Корень (по коду + модель окон Electron).** Это ВНУТРЕННЯЯ ошибка Electron (не наш `console.error`): `webContents.send` в окно, чей рендер-фрейм уже уничтожен, заставляет Electron писать её в консоль, а наш логгер (`main/utils/logger.js`) её подхватывает. Возникает при закрытии окон дока/закрепа. Ловушка: сенды были обёрнуты `if (!win.isDestroyed())`, но `win.isDestroyed()` проверяет только САМО ОКНО — а `webContents`/фрейм может быть уже уничтожен, пока окно ещё «живо» (при закрытии/навигации). Факт уровня 1 (Electron docs): у окна и его `webContents` — РАЗНЫЕ `isDestroyed()`; фрейм может исчезнуть раньше окна.

**Как не повторить.** Отправку из main в окно делать через хелпер [main/utils/safeSend.js](../../main/utils/safeSend.js): `safeSend(win, channel, ...args)` проверяет `win.isDestroyed()` И `win.webContents.isDestroyed()` + try/catch (гонка между проверкой и `send`). Использовать его вместо `win.webContents.send(...)` во всех местах, где окно может закрываться (док, закреп, уведомления, AI-логин). Оговорка: если Electron логирует ошибку ВНУТРИ (не бросает), try/catch её не погасит — но проверка `webContents.isDestroyed()` ДО отправки предотвращает сам вызов в мёртвый фрейм в большинстве случаев.

---

## 🟡 Наложение в UI: подъём z-index НЕ помогает, если элемент уже выше или в другом «слое» (stacking-context); диагностировать наложение вслепую нельзя (2026-08-14, v1.2.269→270)

**Симптом.** Жалоба: вертикальная полоса-разделитель списка оказывается ПОВЕРХ карточки нашего аккаунта (`AccountContextMenu`). Первая правка — подняли z-index карточки `1000 → 100001`.

**Корень (по коду + модель наложения CSS).** Правка была БЕСПОЛЕЗНА: карточка аккаунта — позиционированный (`position:fixed`) сосед `native-content` в `.native-mode` ([NativeApp.jsx:417](../../src/native/NativeApp.jsx)), а разделители (`ChatListResizeHandle`/рейл-разделитель, `zIndex:6`) лежат ВНУТРИ `native-content`. По правилам CSS позиционированный сосед с любым положительным z-index уже рисуется ВЫШЕ всего содержимого предыдущего соседа. Изолирующих `transform/filter/isolation/will-change` у родителей нет (проверено grep) → карточка (z1000) и так была выше полос (z6). Плюс сама карточка (320px) уже перекрывает позицию разделителя. Вывод: видимая «полоса» — вероятно СОБСТВЕННАЯ правая неон-рамка карточки (голубая рамка добавлена в v1.2.268), а не сторонний разделитель. **(гипотеза — не воспроизведено вживую; запуск агенту запрещён).**

**Две ловушки.**
1. **z-index не глобален.** `z-index` сравнивается ТОЛЬКО внутри одного stacking-context. Поднять число у элемента, который либо уже выше, либо заперт в другом контексте (напр. слой `absolute inset-0; zIndex:2`), — не изменит порядок. Сначала пойми ДЕРЕВО (кто чей сосед, где создаётся stacking-context: `position`+`z-index`, `transform`, `filter`, `opacity<1`, `isolation`, flex-item+`z-index`), потом трогай числа.
2. **Наложение в UI нельзя чинить вслепую.** happy-dom в тестах не считает раскладку/наложение → тест это не поймает; агенту запуск Electron запрещён. Определить «что за линия и почему сверху» без запуска нельзя — сначала факт (скриншот покрупнее / временная обводка на подозреваемых элементах), потом фикс.

**Как не повторить.** Побочно v1.2.270 карточку привели к уровню попапа `zIndex:9999` (как `MuteMenu`/`ForwardPicker`): выше содержимого/разделителей, но НИЖЕ полноэкранных модалок (`ThemePicker`/`ContactCardModal`=100000) — иначе модалка, открытая поверх, уходит под карточку (побочный дефект бампа до 100001). Факт уровня 1 (MDN «Stacking context»): z-index действует в пределах stacking-context; `position:fixed`+`z-index` и flex-item+`z-index` создают новый контекст. См. [[decisions]] ADR-033.

---

## 🟡 Фото с подписью длиннее ~1024 знаков НЕ доходит до собеседника (лимит Telegram), а у отправителя показывается (2026-08-06, v1.2.209)

**Симптом.** Отправил фото с длинной подписью — оно есть на экране отправителя, но собеседнику не пришло.

**Корень (по журналу + Telegram docs).** Telegram ограничивает подпись к МЕДИА (фото/видео/документ) ~1024 знаками (у Premium 2048; у обычного текстового сообщения — 4096). Длиннее — сервер отвергает `sendMessage`, но провизорное сообщение уже создано локально → показывается у отправителя, до получателя не уходит. Доказано журналом `chatcenter.log`: три фото в 17:35 — без подписи и с короткой ДОШЛИ (в журнале есть «зеркало»-входящее у второго аккаунта-получателя `tg_611696632:638454350`), а с длинной подписью «Заказ ваш оформили…» — зеркала-доставки НЕТ. Различие — только длина подписи.

**Ловушка диагностики.** «Галочки» (✓✓) в нашем UI не различают «доставлено» от «отправляется/упало»: маппер `tdlibMapper.js` ставит `isSending: !!sending_state` и НЕ выделяет `messageSendingStateFailed` — поэтому упавшее фото выглядит как обычное отправленное.

**Как не повторить.** Для подписи к медиа проверять длину против лимита (`CAPTION_MAX=1024`, [photoSendUtils.js](../../src/native/utils/photoSendUtils.js)); при превышении — НЕ резать молча, а показать счётчик и дать выбор (сократить / отправить текст отдельным сообщением). Реализовано в v1.2.209 (счётчик в `PhotoSendModal` + `sendOpts.splitText` в `inboxAttachSend`). Факт уровня 1: Telegram Bot API `sendPhoto` — `caption` 0-1024 знака.

---

## 🟡 Слушатель на window, добавленный ВО ВРЕМЯ обработки события, ловит ТО ЖЕ событие → двойное срабатывание (2026-08-06, v1.2.205)

**Симптом.** Одна вставка Ctrl+V добавляла ДВА одинаковых фото в окно `PhotoSendModal`.

**Корень (по коду + модель событий DOM).** Окно `PhotoSendModal` в `useEffect` вешает слушатель `paste` на `window` (чтобы можно было вставить ещё фото при открытом окне). Первую вставку (окна ещё нет, видно поле ввода) обрабатывает поле — [useDropAndPaste.js](../../src/native/hooks/useDropAndPaste.js) зовёт `e.preventDefault()` + `addFiles`. React для ДИСКРЕТНЫХ событий (paste/click/keydown) применяет обновление и эффекты СИНХРОННО → окно монтируется и вешает свой `window`-слушатель, ПОКА то же нативное событие ещё всплывает к `window` (React-обработчик `onPaste` отрабатывает на корне React, НИЖЕ `window`). Слушатель ловит то же событие → второе добавление.

**Как не повторить.** Слушатель, который вешается на общий предок (`window`/`document`) в момент, когда может идти обработка того же типа события другим обработчиком, должен проверять `if (e.defaultPrevented) return` — если событие уже обработано (кто-то вызвал `preventDefault`), пропускать. Факт уровня 1 (MDN, DOM Events): слушатель, добавленный на предка во время всплытия, вызывается для того же in-flight события; `Event.defaultPrevented` виден последующим слушателям. Фикс v1.2.205: `if (e.defaultPrevented) return` в оконном `paste`-слушателе `PhotoSendModal`.

---

## 🟡 Отправка прикреплений: два тихих капкана — canvas JPEG стирает прозрачность PNG, а альбом молча выбрасывает файлы без пути (2026-08-05, v1.2.199)

**Контекст.** Окно отправки фото `PhotoSendModal` строит повёрнутую копию на `canvas`, а поток `runAttachSend` ([inboxAttachSend.js](../../src/native/utils/inboxAttachSend.js)) отправляет 1 файл (по пути или байтами) либо альбом (по путям). При ревью v1.2.198 нашлись два неочевидных места, где данные тихо портились/пропадали.

**Капкан 1 — `canvas.toBlob(…, 'image/jpeg')` теряет альфу.** JPEG не хранит прозрачность → у повёрнутого PNG с прозрачным фоном фон становился чёрным. Правило: при экспорте с canvas выбирать MIME по исходнику — PNG → `image/png` (альфа цела), остальное → `image/jpeg`. Расширение и `type` File должны совпадать с MIME (backend `tg:send-clipboard-image` берёт ext из `type`). Фикс: `buildRotatedFile` в [PhotoSendModal.jsx](../../src/native/components/PhotoSendModal.jsx).

**Капкан 2 — альбом принимает ТОЛЬКО пути на диске.** Ветка альбома (2+) в `runAttachSend` фильтрует файлы по наличию `file.path` (Electron), а у файла из буфера обмена / повёрнутой canvas-копии пути НЕТ → он молча выпадал из отправки. Одиночный файл без пути уходит байтами (`tg:send-clipboard-image`), но в альбоме этого пути НЕТ. Полноценная отправка no-path файлов внутри альбома не сделана — сейчас такие файлы пропускаются с предупреждением (тост + `WARN` в лог). Остаток вынесен в `code-todo.md` [[code-todo]] TODO-30.

**Капкан 3 (общий) — молчаливый откат/пропуск в потоке отправки.** До v1.2.199 неудачный поворот молча слал оригинал, а выпавшие файлы исчезали без следа. Правило: любой откат/пропуск в отправке — писать в журнал через `window.api.send('app:log', {level:'WARN', …})` (видно в «📒 Логи ChatCenter»), иначе сбой у пользователя не разобрать. Поток `runAttachSend` теперь логирует старт/ветку/результат (`[attach-send] …`), окно — неудачный поворот (`[photo-modal] …`). Данные файла НЕ логируем, только счётчики/флаги.

**Как проверено.** Тест [inboxAttachSend.vitest.js](../../src/native/utils/inboxAttachSend.vitest.js) (6 проверок: выбор ветки байты/диск/альбом, `overrideFile`-мусор игнорируется, альбом с no-path предупреждает). Прозрачность/чёрный фон — только визуально (happy-dom без layout, canvas не считает). См. features.md v1.2.199.

---

## 🟡 preload `sendToHost('monitor-diag')` НЕ доходит до chatcenter.log — для видимого лога из WebView нужен main-world `console.log('__CC_DIAG__')` (2026-08-03, v1.2.194→195)

**Симптом.** Добавил диагностику через `sendMonitorDiag` (→ `ipcRenderer.sendToHost('monitor-diag', …)`) в [monitor.preload.cjs](../../main/preloads/monitor.preload.cjs) — строки НЕ появились в `chatcenter.log`, хотя код выполнялся. Потрачено время на «почему не видно».

**Корень (по логу).** `monitor-start`/`MAX-COUNT`/`wa-count`/`VK-COUNT` (все из `sendMonitorDiag`) — **0 совпадений за всё время лога**. То есть путь `sendToHost('monitor-diag')` из monitor.preload до файла лога НЕ доходит. Комментарий [monitor.preload.cjs:498](../../main/preloads/monitor.preload.cjs) знает половину: «preload console.log НЕ попадает в console-message (isolated world Electron 41)», но и `sendToHost`-путь тоже не логируется. В файл доходят ТОЛЬКО `console.log('__CC_DIAG__…')` из **ГЛАВНОГО мира** страницы (probe/health из [webviewDiagnostics.js](../../src/utils/webviewDiagnostics.js), `vk-list`/`__CC_NOTIF__` из хуков) — их ловит host через `console-message` + [consoleMessageParser.js](../../src/utils/consoleMessageParser.js).

**Как не повторить.** Для ВИДИМОГО в логе диагностического сообщения из WebView — писать `console.log('__CC_DIAG__<тег> …')` из ГЛАВНОГО мира (в хуке `vk.hook.js`/`max.hook.js` или в injected-script `webviewDiagnostics`), НЕ через `sendMonitorDiag`/`sendToHost` из preload. Появится как `[<Мессенджер>] debug: <тег> …` на уровне **TRACE** (фильтр «Native»/«Все» в лог-вьюере, НЕ «Инфо»). Кейс: v1.2.194 `[VK-COUNT]` через sendMonitorDiag не появился → v1.2.195 перенёс в `vk.hook.js` `_scanVkList` (`vk-src`) → заработало.

---

## 🔴 Нативная библиотека (.dll/.so) ВНУТРИ asar → не грузится в установленной программе, Win32 error 126 (2026-08-03, v1.2.192)

**Симптом.** В dev (`npm start`) вход в Telegram работает; в УСТАНОВЛЕННОЙ (собранной) программе — `Dynamic Loading Error: Win32 error 126` на экране входа.

**Корень.** TDLib — нативная библиотека `tdjson.dll` (`node_modules/@prebuilt-tdlib/win32-x64/`). При `asar: true` она попадает ВНУТРЬ архива `app.asar`, а Windows `LoadLibrary`/koffi не умеют грузить `.dll` из архива → error 126 («модуль не найден»). В dev архива нет — грузится напрямую, поэтому баг виден только после сборки.

**Как отличить от «модуль не найден».** Если бы `node_modules` вообще не попал — была бы ошибка `Cannot find module 'tdl'`. А `Dynamic Loading Error` = JS-обёртка загрузилась, спотыкается именно нативная загрузка → библиотека в пакете есть, но в архиве.

**Фикс (3 части, стандарт Electron для нативных либ):** (1) `build.asarUnpack: ["node_modules/@prebuilt-tdlib/**"]` — вынести наружу в `app.asar.unpacked`; (2) в коде путь от `getTdjson()`: `app.asar` → `app.asar.unpacked` (koffi грузит реальный файл); (3) проверка сборки должна контролировать `.dll` как РЕАЛЬНЫЙ файл в `app.asar.unpacked`, а не в списке asar.

**Грабля процессная.** `verifyPackagedApp` проверял 16 файлов, но НЕ нативную либу → «зелёная галка» врала (установщик собран, а Telegram не работает). Урок: проверка пакета обязана покрывать САМОЕ критичное (движок), а не только JS-файлы. Настройки упаковки (`files`/`asarUnpack`) — из эпохи GramJS (чистый JS, либа не нужна была); при переезде на нативный TDLib их забыли обновить (тот же «хвост», что устаревшая проверка `telegram` в v1.2.191).

---

## 🔴 Восстановление прокрутки в ленте с догрузкой с ДВУХ сторон: только ЯКОРЬ-по-сообщению, не пиксель «от края» (2026-07-31, v1.2.185→186)

### Симптом
Был в конце/середине чата → перезапуск/переход по чатам → чат открывается намного выше/ниже сохранённого места.

### Корень
Позицию хранили как ПИКСЕЛЬ от края: сначала «от верха» (v0.94.0 `scrollTop`), потом «от низа» (v1.2.185 `fromBottom`). Но лента чата догружает сообщения с ОБЕИХ сторон: сверху история (`prepended-old`), снизу окно то 151, то 50 (журнал: высота 23881↔35897↔12268). Любой пиксель «от края» после смены содержимого указывает в другое место. Наступили ДВАЖДЫ (верх, потом низ), прежде чем поняли.

### Правило
Для restore прокрутки в списке, который меняет число элементов с обеих сторон, НЕЛЬЗЯ хранить пиксель от края — только **якорь по элементу содержимого** (`data-msg-id` верхнего видимого + смещение `screenTop`, может быть отрицательным). Восстановление: `el.scrollTop += (текущее screenTop элемента) − (сохранённое)`. Это точное место (даже посреди элемента), устойчивое к добавлению/удалению с любой стороны. Приём уже был в проекте для re-pin при догрузке старых («ScrollSaver» Telegram Web K, `useInboxScroll.js` + `InboxMode.jsx`) — переиспользовать его, а не изобретать пиксель. См. [[ADR-029]] (заменил [[ADR-028]]).

---

## 🔴 Остаток переменной после удаления фичи → краш ТОЛЬКО в редко-видимой ветке (2026-07-31, v1.2.172)

### Симптом
Экран падал (ErrorBoundary «filter is not defined») при вводе в строку поиска чатов. Не при запуске, не всегда — только когда пользователь начинал искать.

### Корень
В v1.2.163 удалили старый фильтр по типам чатов (переменная `filter`), но в `InboxChatListSidebar.jsx` осталась ссылка на неё — в счётчике «найдено X из Y», который рисуется ТОЛЬКО при активном поиске. Линт/тесты это не поймали (JSX-выражение синтаксически валидно; `filter` считалась глобалью), а сам краш проявлялся лишь когда показывалась эта ветка. Пользователь думал «из-за 2 аккаунтов» — на деле из-за самого факта поиска.

### Правило
Удаляя фичу/переменную — `grep` по ВСЕМ ссылкам на её имя, включая условно-рендерящиеся ветки (то, что видно не всегда: счётчики поиска, пустые состояния, модалки). Ссылка на удалённую переменную в редкой ветке крашит не сразу, а только когда эта ветка показывается — легко пропустить на ручной проверке. ESLint `no-undef` не всегда ловит (переменная выглядит как возможная глобаль). Фикс: считать через существующий источник (тут — `effectiveVisibleAccountIds`, тот же, что и основной список).

---

## 🔴 TDLib updateUserStatus НЕ обновляет userCache → mapChat читает стале статус (2026-07-31, v1.2.173)

### Симптом
В шапке/списке «в сети», хотя в реальном Telegram человек «был(а) N минут назад» (офлайн). Живое исправление статуса срабатывало, но откатывалось назад.

### Корень
TDLib присылает смену онлайн/офлайн ОТДЕЛЬНЫМ событием `updateUserStatus` и НЕ пересылает полный `updateUser`. Обработчик `updateUserStatus` ([tdlibClient.js](../main/native/backends/tdlibClient.js)) только эмитил `user:status`, но не писал `record.userCache` (единственный писатель — `updateUser`). А `getAccountChats` → `mapChat` берёт статус из `userCache.get(userId).status`. Итог: кэш держит старый `userStatusOnline` → любой refresh списка чатов через mapChat возвращает «в сети», затирая живое исправление стора (`tg:user-status`, v1.2.171).

### Правило
Если данные лежат в кэше (userCache/chatCache) И приходят точечными update-событиями (updateUserStatus, updateChatReadInbox и т.п.) — обработчик такого события ОБЯЗАН обновить соответствующее поле в кэше, а не только переслать в UI. Иначе любой пересбор из кэша (getAccountChats/mapChat) откатит значение к устаревшему. Проверка: после точечного апдейта прочитай кэш (`getUserCached`) и убедись, что поле изменилось.

---

## 🟡 Мост шлёт IPC-канал, а слушателя нет → данные тихо теряются (2026-07-31, v1.2.171)

### Симптом
Онлайн-статус собеседника («в сети / был(а) в HH:MM») в шапке чата ставился ОДИН раз при загрузке чата и больше не обновлялся — собеседник заходил/выходил, а статус висел старый.

### Корень
Мост [tdlibIpcBridge.js](../main/native/tdlibIpcBridge.js) исправно превращал TDLib `updateUserStatus` в канал `tg:user-status` и слал в renderer — но **этот канал никто не слушал** (`grep tg:user-status src/` — пусто). Обработчика в сторе не было → все живые обновления молча отбрасывались. Плюс мост слал лишь `online:boolean` (даже если бы слушали — потерялось бы точное время `was_online`).

### Правило
Наличие `subscribe(...)`/`sendToRenderer(...)` в мосте НЕ значит, что данные доходят до UI. Для каждого `tg:*` канала проверяй `grep`-ом, что в сторе есть `addHandler('tg:...')`. Мост без слушателя = мёртвый канал. И не сплющивай данные в мосте раньше времени (`online:boolean` вместо сырого статуса) — теряешь то, что понадобится позже (`lastSeenAt`). Единый разбор выноси в чистую функцию (`shared/userStatusMap.js`), чтобы начальная загрузка (`mapChat`) и live-обновление считали статус одинаково.

---

## 🔴 Фильтр-по-аккаунтам: после удаления аккаунта проверяй, что не ВСЕ оставшиеся скрыты (2026-07-30, v1.2.163→168)

### Симптом
Было 2 аккаунта, один (A) скрыт галочкой фильтра (в списке `hiddenAccountIds`), виден только B. Пользователь удалил ВИДИМЫЙ B → остался только A, но он остался в `hiddenAccountIds` → его чаты отфильтрованы → список чатов навсегда «Загрузка чатов…», аватарка затемнена. И снять скрытие через UI нельзя: галочки фильтра показываются только при ≥2 аккаунтах (`filterActive`), а остался один. Полный тупик, лечится только правкой кода.

### Корень
Обработчик удаления аккаунта ([nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js), ветка «не последний») убирал удалённый id из `hiddenAccountIds`, но НЕ проверял инвариант «хотя бы один аккаунт видим». Удаление видимого аккаунта могло оставить все оставшиеся скрытыми.

### Правило
Любое состояние-фильтр, скрывающее элементы (accounts/chats/folders), при удалении элемента должно поддерживать инвариант «список не пуст по вине фильтра»: после удаления, если ВСЕ оставшиеся элементы скрыты — сбросить скрытие (показать всех). Особенно когда UI управления фильтром исчезает на малых количествах (тут — галочки только при ≥2 аккаунтах). Аналогично для «соло»: держать, только если объект соло ещё существует.

### Фикс / тест-ловушка
v1.2.168: в ветке удаления — `if (newAccounts.length > 0 && newAccounts.every(a => newHidden.includes(a.id))) newHidden = []` + `soloAccountId` оставляем только если аккаунт ещё в списке. Тест `nativeStoreFilter.vitest.jsx`: «скрыли A, удалили видимый B → A видим, соло null». Связано: [[decisions]] ADR-026, features.md v1.2.168.

### Продолжение (v1.2.169): чинить не только МОМЕНТ мутации, но и ЗАГРУЗКУ сохранённого
v1.2.168 чинил только момент удаления, но само удаление уже произошло СТАРОЙ версией → «залипшее» значение осталось в localStorage. После перезапуска старт грузил его без проверки → тот же тупик. **Правило шире:** сохранённое на диск состояние-фильтр надо СВЕРЯТЬ с загруженными данными и ПРИ СТАРТЕ (не только при изменении). Фикс v1.2.169: `useEffect` в `nativeStore.js` (образец `assignMissingColors`) через чистую `sanitizeHiddenAccounts` — при загрузке/смене аккаунтов сбрасывает скрытие, если скрыты ВСЕ (guard: не трогает, пока аккаунты не загружены — иначе сотрёт валидное скрытие до загрузки). Плюс страховка на чтении: `effectiveVisibleAccountIds` в `InboxMode` (список видимых никогда не пуст → чаты не «зависают» пустыми). v1.2.170: самосброс пишет в журнал (`[acct-filter] самопроверка …`). Тесты в `accountFilter.vitest.js` + `nativeStoreFilter.vitest.jsx`. Связано: features.md v1.2.169.

## 🟢 Новое СОХРАНЯЕМОЕ поле надо чистить на ВСЕХ путях сброса, включая «wipe» (2026-07-30, v1.2.163→164)

### Симптом
Добавили поле `hiddenAccountIds` (скрытые аккаунты, множественный выбор фильтра, [[decisions]] ADR-026) — сохраняется в localStorage (`cc-native-hidden-accounts`). При удалении НЕ-последнего аккаунта id вычищался и сохранялся. Но ветка удаления ПОСЛЕДНЕГО аккаунта (`isLast`, полный wipe в [nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js)) сбрасывала поле только в СОСТОЯНИИ (`hiddenAccountIds: []`), а localStorage не трогала. Итог: после рестарта загружались «призраки» — id несуществующих аккаунтов → кнопка «Все» показывала серый счётчик вместо «горит» (индикатор врал, чаты показывались верно). Само чинилось при клике «Все».

### Корень
Полный сброс состояния (`wipe`) — это отдельный путь, легко забыть в нём про localStorage-поле. Точечное удаление аккаунта поле чистило, а wipe — нет (асимметрия).

### Правило
Добавил новое поле, которое дублируется в localStorage → пройди ВСЕ пути, где оно сбрасывается: точечное удаление, полный wipe, logout, «очистить всё». В каждом — не только `state`, но и `save…([])`/`localStorage.removeItem`. Проще: держать список «мест сброса» рядом с полем.

### Как поймали / фикс
Придирчивым ревью (не в проде). Фикс v1.2.164: `saveHiddenAccounts([])` в ветке `isLast`. Тест-ловушка: `nativeStoreFilter.vitest.jsx` — «удаление последнего аккаунта чистит localStorage скрытых».

---

## 🟡 «Дефолт по хешу» НЕ гарантирует различие между объектами (2026-07-30, v1.2.153→154)

### Симптом
Цвет-метка аккаунта: дефолтный цвет считался `hash(id) % PALETTE.length` (палитра 8 цветов). У двух РАЗНЫХ аккаунтов хеш мог дать один остаток → одинаковая полоска и обводка = снова путаешься, чей чат. Ровно то, против чего вводилась метка.

### Корень
«Стабильность по хешу» решает ДРУГУЮ задачу — чтобы у ОДНОГО объекта значение не «прыгало» между запусками. Она НЕ обещает, что у РАЗНЫХ объектов значения будут разными: два независимых хеша легко попадают в один остаток по модулю N (парадокс дней рождения — при 8 цветах и 2 аккаунтах шанс совпасть ≈ 12%, при 5 аккаунтах ≈ 65%).

### Правило
Если задача — «сделать объекты РАЗЛИЧИМЫМИ» (цвета, метки, ярлыки), не полагайся на хеш. Раздавай значения ЖАДНО и с сохранением: каждому новому объекту — первый ещё не занятый вариант из палитры, результат храни (localStorage/state), выбор пользователя не трогай. Тогда при числе объектов ≤ размера палитры различие ГАРАНТИРОВАНО, а порядок стабилен (добавление 3-го не перекрашивает первых двух). См. `assignMissingColors` в [shared/accountColors.js] + эффект в [nativeStore.js] (v1.2.154).

### Как поймали
Своим придирчивым ревью к v1.2.153 (не в проде). Тест `accountColors.vitest.js` дополнен проверкой «два аккаунта без цвета → РАЗНЫЕ цвета».

---

## 🔴 Tailwind 4: глобальный CSS-сброс ВНЕ слоёв убивает все утилиты (2026-06-24, v1.2.17)

**Симптом:** после миграции Tailwind 3→4 пропали ВСЕ отступы (настройки, ИИ-панель, вкладки) — элементы схлопнулись в кучу.

**Корень:** в Tailwind 4 утилиты лежат в `@layer utilities`. В `src/index.css` был глобальный сброс `* { margin:0; padding:0 }` **вне слоёв**. По CSS-каскаду незалёрные правила **сильнее** залёрных → сброс перебивал все `px-*/py-*/gap-*/space-*` → отступы исчезали. **Сборка этого НЕ ловит** (компилируется без ошибок) — видно только глазами.

**Фикс:** обернуть глобальный сброс в `@layer base { * {...} }` → утилиты (слой позже) снова побеждают. Проверено по собранному CSS (`padding:0` оказался внутри `@layer base`).

**Правило на будущее:** любой кастомный глобальный CSS, который должен переопределяться Tailwind-утилитами, держать в `@layer base`. Иначе он молча убивает классы. Tailwind 4 также меняет дефолты (`border`→`currentColor`, `ring`, `shadow-sm`→`shadow-xs`) — проверять визуально.

---

## 🔴 КРИТИЧЕСКОЕ: IPC handlers + React 18+ automatic batching = ложное ожидание (v0.91.22)

### Симптом
При старте приложения с TDLib (multiple accounts с большим списком чатов): консоль засыпается ошибкой `Warning: Maximum update depth exceeded` через 1-2 секунды после `loadCachedChats`. Stack trace указывает на `setState` в IPC handlers (`tg:chat-last-message`, `tg:sender-avatar`).

### Прямое доказательство (chatcenter.log 12:40:09-10, диагностика v0.91.21)
```
ipc-burst channel=tg:chat-avatar         count=300+ ms=1500
ipc-burst channel=tg:chat-last-message   count=280+ ms=1500
ipc-burst channel=tg:sender-avatar       count=80+  ms=1500
[error] Warning: Maximum update depth exceeded ...
       at nativeStoreIpc.js:215  (tg:chat-last-message setState)
       at nativeStoreIpc.js:347  (tg:sender-avatar setState)
```
660+ IPC events за 1.5с = 660+ separate renders → React update budget overflow.

### Корень — ложное ожидание про automatic batching

🥇 [React 18 batching announcement](https://react.dev/blog/2022/03/29/react-v18): «We added a feature called "automatic batching" — multiple state updates are now batched even **inside promises, setTimeouts, native event handlers**, or any other event».

**Что верно**: React 18+ батчит все setState внутри **ОДНОГО macrotask**.

**Что НЕВЕРНО ожидать**: что 660 IPC events приходящие за 1.5с в **РАЗНЫХ** macrotasks автоматически забатчатся. Каждый `window.api.on('tg:chat-avatar', handler)` → каждый event прилетает в новой microtask/task → каждый setState → каждый render.

### Доказательство в чистом виде

```js
// Этот код породит 100 renders, не 1, даже с React 18 batching:
for (let i = 0; i < 100; i++) {
  setTimeout(() => setState(s => ({ ...s, count: s.count + 1 })), 0)
  //                                            ↑
  //          каждый setTimeout — отдельная task → отдельный render
}

// А этот — 1 render благодаря automatic batching:
setTimeout(() => {
  for (let i = 0; i < 100; i++) {
    setState(s => ({ ...s, count: s.count + 1 }))
  }
}, 0)
//  ↑ все setState внутри ОДНОЙ task → один render
```

IPC events через `contextBridge` (`window.api.on`) приходят асинхронно — каждый в собственной task. Batching не помогает.

### Решение — rAF-батчинг руками

🥇 [requestAnimationFrame MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame): «requestAnimationFrame is typically called 60 times per second... callbacks are queued together and fired in a single repaint».

Паттерн (тот же что в Telegram Web K `appDialogsManager` и Discord MobX store):

```js
let pendingUpdates = new Map()  // dedup по ключу — last wins
let scheduled = false

function flush() {
  scheduled = false
  if (pendingUpdates.size === 0) return
  const batch = pendingUpdates; pendingUpdates = new Map()
  setState(s => {
    // применяем ВСЕ updates за один render
    ...
  })
}

addHandler('tg:chat-avatar', ({chatId, avatarPath}) => {
  pendingUpdates.set(chatId, avatarPath)
  if (!scheduled) {
    scheduled = true
    requestAnimationFrame(flush)
  }
})
```

Преимущества:
- Один render на кадр (60fps) даже если событий 1000
- Dedupe по chatId/senderId — если для одного объекта пришло 5 updates за кадр, применится последний
- rAF гарантирует что flush произойдёт перед next paint — UI не «пропустит» updates

В ChatCenter v0.91.22 применено к 3-м самым шумным handlers: `tg:chat-last-message`, `tg:sender-avatar`, `tg:chat-avatar`. Остальные IPC handlers (`tg:messages`, `tg:new-message`, `tg:chats`) приходят редко (batches от 50 msg раз в открытие чата) — батчинг не нужен.

### Когда применять rAF-батчинг

✅ **Применять**:
- IPC handler срабатывает в burst (>20 events/sec)
- setState внутри handler делает дорогую операцию (iteration over all messages в `tg:sender-avatar`)
- Stack trace показывает «Maximum update depth»

❌ **НЕ применять**:
- Handler срабатывает редко (e.g. `tg:chats` — раз в открытие/refresh)
- Каждое событие критично для UI без задержки (e.g. typing indicator — задержка в 16мс заметна юзеру)
- Логика handler сложная и не сводится к dedupe по ключу

### Урок

**«React batching» — не магия**. Она работает в пределах ОДНОЙ task. Все асинхронные источники в РАЗНЫХ task'ах (IPC, WebSocket, MutationObserver, fetch promises) могут переполнить update budget. Стандарт индустрии — rAF-батчинг с dedupe.

**Антипаттерн**: думать что «raise the React update limit» (через `unstable_batchedUpdates`) спасёт. Это deprecated в React 18 и не решает корень проблемы — много рендеров остаются.

---

## 📚 УРОК v0.89.41-v0.91.0: попытка миграции `<webview>` → WebContentsView НЕ УДАЛАСЬ (Electron Issue #44934)

### Статус: 🔴 ПИЛОТ ОТКАЧЕН, остался `<webview>` тег как ЕДИНСТВЕННАЯ работающая архитектура для multi-messenger UI на Windows 11

### 🔁 ОБНОВЛЕНИЕ 24 июня 2026 (v1.2.20-1.2.21, Electron 42) — баг ПОДТВЕРЖДЁН снова, тупик воскрешён по ошибке

**Что произошло**: в сессии 24 июня были восстановлены удалённые файлы пилота (`main/utils/webContentsViewManager.js`, `src/components/WebContentsViewSlot.jsx`, `src/utils/webContentsViewBridge.js`, `main/handlers/webContentsViewIpcHandlers.js`) и заново подключён тумблер `useWebContentsView` (v1.2.20 Фаза 0 + v1.2.21 Фаза 1) — **без сверки с этой записью**. Это ровно та же мёртвая архитектура: `BrowserWindow{webviewTag:true}.contentView.addChildView(WebContentsView)` + `loadURL(https://web.max.ru/)`.

**Результат**: тумблер крашит программу **100%** (проверено 3 раза подряд, журнал каждый раз обрывается на `[wcv-mgr] start-loading`, нет JS-ошибки, нет события `render-process-gone` → нативный крах самого main-процесса). Идентично v0.89.46-v0.91.0.

**Конфликт «память vs реальность»**: ранее в этой же сессии считалось, что #44934 пофикшен в Electron 36-38, и стек обновлён до **Electron 42** в т.ч. ради этого. НО на 42 краш остался → фикс наш случай (child WebContentsView в окне с `webviewTag:true`) НЕ покрывает. Реальность подтвердила пессимизм записи.

**Вопрос «виноват ли preload?» (Вариант C)** — повторно НЕ требовался: уже доказано в v0.89.53 («Краш без preload остался») + [Issue #44897](https://github.com/electron/electron/issues/44897) («preload не грузится в child WebContentsView»). **Preload НЕ виноват.**

**Вывод (повтор)**: in-window child WebContentsView на Windows 11 не работает и на Electron 42. Рабочий путь для сосуществования `<webview>` + WebContentsView — **ОТДЕЛЬНЫЕ ОКНА** (см. правило в конце записи). Тумблер `useWebContentsView` в текущем виде нужно убрать или переделать на отдельное окно.

**v1.2.22 (сделано + закрытие темы)**: тумблер переделан на **Вариант A** — Макс открывается в ОТДЕЛЬНОМ обычном окне (`main/handlers/maxTestWindowHandler.js`), краша больше нет. И главный вывод расследования: **SW мёртв НЕ из-за webview, а потому что мы САМИ его глушим** + запрещаем `notifications` в `sessionSetup.js` (намеренно, у нас своя система уведомлений). Доказано: в отдельном нормальном окне SW падает с тем же `Operation has been aborted`. Полная причина → [decisions.md](../decisions.md) ADR «Почему родные уведомления и ServiceWorker выключены». Цель «оживить SW через WebContentsView» **закрыта как нецелесообразная** (см. [webcontentsview-migration-plan.md](../webcontentsview-migration-plan.md) → «ИТОГ РАССЛЕДОВАНИЯ»).

### Что хотели сделать

Электрон в [официальной документации](https://www.electronjs.org/docs/latest/api/webview-tag) написал (verbatim):
> «We currently recommend to not use the webview tag and to consider alternatives, like iframe, a WebContentsView, or an architecture that avoids embedded content altogether.»

Мы решили мигрировать с устаревшего `<webview>` тега на современный `WebContentsView`. Цель — соответствие официальной документации + потенциальные UX-улучшения (нет webview boundary, лучшая производительность).

### Что было сделано (16 версий v0.89.41 → v0.91.0)

**Фаза 1 — инфраструктура (v0.89.41-v0.89.45)**: создан `webContentsViewManager.js`, IPC handlers `wcv:*`, React-слот `WebContentsViewSlot.jsx`, bridge для совместимости с `webviewSetup.js`. Feature flag `useWebContentsView` (default OFF). Никакой регрессии.

**Фаза 2 — пилот пытается работать (v0.89.46-v0.89.57)**: 12 версий поиска корня краша. Юзер включает тумблер пилота → программа крашится на `loadURL`. Гипотезы и опровержения:

| Версия | Гипотеза | Опровергнута |
|---|---|---|
| v0.89.46 | preload как `file://` URL — нужен raw path | Конструктор не падал |
| v0.89.51 | preload файл не существует | `fs.existsSync` подтвердил |
| v0.89.52 | Конструктор `new WebContentsView()` | `[ok]` лог сработал |
| v0.89.52 | `addChildView()` падает | `[ok]` лог сработал |
| v0.89.53 | `monitor.preload.cjs` CSP violation | Краш без preload остался |
| v0.89.54 | `sandbox: false` без preload | `sandbox: true` тоже крашит |
| v0.89.54 | URL Telegram CSP | `about:blank` тоже крашит |
| v0.89.55 | `disable-gpu-compositing` switch | Без switch тоже крашит |
| v0.89.56 | `setupSession` hooks + общий partition | `persist:wcv-*` тоже крашит |
| v0.89.57 | `data:text/html` URL | Тоже крашит |

**Фаза 3 — архитектурная миграция (v0.90.0-v0.90.2)**: `BrowserWindow{webviewTag:true}` → `BaseWindow + WebContentsView`. По официальной документации Electron WebContentsView должен использоваться с BaseWindow. Primary view (React UI) заработал ✅. **НО** child WebContentsView для мессенджеров **продолжал крашиться** на любом `loadURL`.

**Фаза 4 — поиск в официальных issues**: найдено **подтверждение** в Electron GitHub:
- [Issue #44934](https://github.com/electron/electron/issues/44934): «App crashes when adding child view to WebContentsView on **Windows 11**» — closed (not planned)
- [Issue #45367](https://github.com/electron/electron/issues/45367): «BaseWindow.contentView.addChildView(WebContentsView) is **not rendering** properly» — workaround `contentView = view` (но это ОДНА view на окно, не подходит)
- [Issue #44897](https://github.com/electron/electron/issues/44897): «preload **не загружается** в child WebContentsView» — объясняет почему наши попытки с preload не давали разницы
- [Issue #47247](https://github.com/electron/electron/issues/47247): «Adding WebContentsView webContents to another WebContentsView crashes Electron»

### Корневая причина

**Архитектурный баг Electron 33+** на Windows 11. `BaseWindow.contentView.addChildView(WebContentsView)` + последующий `loadURL` крашит native процесс. Не пофикшено в v41. Известно официально, но помечено «not planned».

### Что мы НЕ могли изменить

| Параметр | Пробовали | Результат |
|---|---|---|
| preload (URL/path/none) | Да | Не корень — Issue #44897 |
| sandbox (true/false) | Да | Не корень |
| partition (общий/изолированный) | Да | Не корень |
| webviewTag (true/false) | Да | Не корень |
| disable-gpu-compositing | Да | Не корень |
| BrowserWindow → BaseWindow | Да | Primary работает, child нет |
| URL (https/data:/about:blank) | Да | Любой URL крашит |
| bounds (0,0 или real) | Да | Не корень |

**ВЫВОД**: это **native баг Electron на Windows 11**, не наш код.

### Что решили (v0.91.0)

🔴 **ОТКАТ к BrowserWindow + `<webview>`** — единственная работающая архитектура для multi-messenger UI на Windows 11.

**Удалены**:
- `main/utils/webContentsViewManager.js`
- `main/handlers/webContentsViewIpcHandlers.js`
- `src/components/WebContentsViewSlot.jsx`
- `src/utils/webContentsViewBridge.js`
- `src/__tests__/webContentsViewPatterns.test.cjs`
- `src/__tests__/webContentsViewManager.vitest.js`
- `src/__tests__/webContentsViewBridge.vitest.js`

**Сохранены** (полезные побочные эффекты):
- `src/components/UncaughtErrorToast.jsx` — UX-фича для отображения ошибок renderer
- Global error handlers (`useConsoleErrorLogger.js` + main.js `uncaughtException`) — полезно всегда
- `src/native/utils/idbCacheMetrics.js` — независимая фича агрегации логов кэша
- Crashpad filter в `scripts/dev.cjs` — фильтр шумных Chromium-логов
- Документация `.memory-bank/electron-breaking-changes.md` — мониторинг будущих изменений

### 🎓 УРОКИ ДЛЯ БУДУЩЕГО

1. **Прежде чем мигрировать API, прочитай GitHub issues этого API**. Мы потратили 16 версий на воспроизведение известного бага. WebSearch в начале расследования сэкономил бы дни.

2. **«Рекомендация в docs ≠ гарантия работы»**. Electron рекомендует WebContentsView вместо `<webview>`, но **это рекомендация, не обещание совместимости**. Реальное состояние API может отставать от документации.

3. **Гипотезы должны быть testable БЫСТРО**. Я делал гипотезы по одной, каждая v0.89.46-v0.89.57 — отдельный запуск пользователя. Это очень долгий цикл. Параллельно искать в GitHub issues сэкономило бы 11 итераций.

4. **Не угадывать когда есть факты в публичных источниках**. Все 12 опровергнутых гипотез были «может быть это?». Открытие Issue #44934 за 30 секунд решило вопрос: **корень не в нашем коде**.

5. **Native crash JS не ловит**. `uncaughtException`/`unhandledRejection` бесполезны для native crash в Chromium content layer. Watchdog timer 15с тоже не работает — main умирает раньше event loop'а.

6. **Production-tested архитектура важнее «modern»**. `<webview>` тег работал годами на нашей инфраструктуре. Хотя docs его «не рекомендует» — он **стабилен**. Современное API может оказаться нестабильным.

7. **Полный откат — это нормально**. 16 версий, 1500 строк кода, дни разработки → возврат к стабильной архитектуре. **Это не неудача — это правильное решение**, когда упёрся в native bug.

### Правило для будущих миграций

- ✅ Перед миграцией: WebSearch + GitHub issues check на «<новая_api> crash <платформа> <версия>»
- ✅ Параллельно с экспериментами в коде — поиск известных багов в issues
- ✅ Если 2-3 гипотезы опровергнуты — **СТОП**, ищи в issues
- ❌ НЕ продолжай 12 гипотез если нет прогресса
- ❌ НЕ доверяй «рекомендациям» в docs без production-теста

### Когда пересматривать решение

Проверять каждые 6-12 месяцев новые Electron релизы:
- Issue #44934 закрыт «not planned» — мало шансов на скорый фикс
- Но если в Electron v45+ появится фикс — можно попробовать ещё раз
- Условия повторной попытки: (a) issue закрыт «fixed», (b) production-protected миграция с rollback

---

## ✅ РЕШЕНО v0.90.0 (опровергнуто в v0.90.2): WebContentsView требует BaseWindow, не BrowserWindow

### Статус: ✅ РЕШЕНО архитектурной миграцией (v0.90.0)

### Что окончательно подтверждено

`webviewTag: true` в primary BrowserWindow + child WebContentsView через `contentView.addChildView` = **архитектурная несовместимость в Electron 41**. Даже минимальный `data:text/html` URL на child WebContentsView крашит main процесс нативно. Это **не баг** — это ограничение API.

### Решение (v0.90.0)

Миграция главного окна `BrowserWindow` → `BaseWindow + primary WebContentsView`. Подробно — в [`features.md` v0.90.0](.memory-bank/features.md).

### Правило для будущего

- ✅ WebContentsView → **только в BaseWindow** (по [docs](https://www.electronjs.org/docs/latest/api/web-contents-view))
- ❌ НЕ комбинируй `webviewTag: true` BrowserWindow и WebContentsView (любой URL крашит)
- ✅ Если нужны и `<webview>` тег и WebContentsView — отдельные окна

---

## 🟡 АРХИВ: WebContentsView pilot — 11 опровергнутых гипотез (v0.89.46-v0.89.57, до миграции v0.90.0)

### v0.89.56 «изолированная partition `persist:wcv-*`» — ОПРОВЕРГНУТА

Юзер запустил v0.89.56. Лог:
```
[wcv-mgr] createView id=telegram partition=persist:wcv-telegram   ← partition изменился ✅
[wcv-mgr] new WebContentsView ok
[wcv-mgr] addChildView ok
[wcv-mgr] queuing loadURL https://web.telegram.org/k/
[crashpad]                                                          ← краш
```

Изолированная session тоже **не решила** проблему. Partition и setupSession hooks — **не корень**.

### v0.89.57 — диагностический изолирующий эксперимент

В `webContentsViewManager.js` `createView`:
1. Сначала грузим `data:text/html;charset=utf-8,<h1>WCV test</h1>` (без сети/CSP/preload)
2. Если data: settled → потом грузим реальный URL
3. Если data: тоже крашит → корень в самой архитектуре

Добавлены listeners для поимки native краша:
- `render-process-gone` (reason + exit code)
- `did-fail-load`
- `did-start-loading`

`setImmediate(() => log('tick'))` после loadURL — увидеть пережил ли event loop.

---

## 🔴 КРИТИЧЕСКОЕ: WebContentsView pilot — нужна ИЗОЛИРОВАННАЯ session (v0.89.56 — ОПРОВЕРГНУТО)

### Симптом

При включённом пилоте WebContentsView Telegram (или любой URL) крашит main процесс при `loadURL`. Native crash, JS handlers `uncaughtException`/`unhandledRejection` не ловят.

```
[wcv-mgr] queuing loadURL https://web.telegram.org/k/
[crashpad ... not connected]
PS prompt
```

### Корневая причина (доказана v0.89.56)

**Тройной конфликт** в одном BrowserWindow:
1. **`webviewTag: true`** в [`windowManager.js:134`](../../main/utils/windowManager.js#L134) регистрирует Chromium guest-page manager для `<webview>` элементов
2. **`setupSession(persist:telegram)`** в [`sessionSetup.js`](../../main/utils/sessionSetup.js) навешивает webRequest hooks (`onHeadersReceived` модифицирует CSP/X-Frame-Options) + `clearStorageData({serviceworkers, cachestorage})` + permission handlers — всё под `<webview>` ToS
3. **WebContentsView с тем же partition** попадает в этот guest-manager и использует ту же session с уже-навешенными hooks → конфликт на architectural level → native crash

### Решение (v0.89.56)

**Изолированная partition `persist:wcv-${messengerId}`** для пилота:

| Слой | Что меняется |
|---|---|
| [`App.jsx`](../../src/App.jsx) WebContentsViewSlot | `partition={'persist:wcv-' + m.id}` (не `m.partition`) |
| [`sessionSetup.js`](../../main/utils/sessionSetup.js) | early return для `wcv-*` partitions — не настраиваем под `<webview>` |
| [`App.jsx`](../../src/App.jsx) `removeMessenger` | cleanup ОБА partitions при удалении мессенджера |
| [`SettingsPanel.jsx`](../../src/components/SettingsPanel.jsx) | кнопка cleanup чистит `wcv-*` partitions |

| Тумблер | Telegram → используется session |
|---|---|
| **OFF** (default) | `persist:telegram` (настроена через setupSession для `<webview>`) |
| **ON** (пилот) | `persist:wcv-telegram` (чистая, без webRequest hooks) |

### Последствие для юзера

⚠️ **При переключении тумблера — новая авторизация**. Cookies, localStorage, sessionStorage у двух sessions разные. Это **одноразовый** logout при включении пилота. После входа всё работает (cookies сохраняются в новой session).

### История 10 опровергнутых гипотез (расследование v0.89.46-v0.89.55)

| Версия | Гипотеза | Опровергнута |
|---|---|---|
| v0.89.46 | `file://` URL в preload | Конструктор не падал |
| v0.89.51 | preload не существует | `fs.existsSync` подтвердил наличие |
| v0.89.52 | конструктор `new WebContentsView()` | `[wcv-mgr] new WebContentsView ok` |
| v0.89.52 | `addChildView()` | `[wcv-mgr] addChildView ok` |
| v0.89.53 | CSP в `monitor.preload.cjs` | Краш без preload (`preload=(none)`) |
| v0.89.54 | `sandbox: false` | С `sandbox: true` — краш остался |
| v0.89.54 | Telegram URL CSP | `about:blank` тоже крашит |
| v0.89.55 | `disable-gpu-compositing` switch | Без switch — краш остался |
| **v0.89.56** | **Конфликт session + webviewTag manager** | **Изолированная partition обходит** |

### Правило для будущих фич

При использовании WebContentsView в BrowserWindow где `webviewTag: true`:
- ✅ **Всегда** используй partition с уникальным префиксом (`persist:wcv-*`, `persist:bv-*`, etc.)
- ✅ Этот partition **никогда не должен попадать в setupSession для `<webview>`** — добавь early return по префиксу
- ✅ webRequest hooks, permission handlers, CSP-модификации — только для session `<webview>`
- ❌ **НЕ** используй один partition для `<webview>` и WebContentsView в одном окне
- ❌ **НЕ** ожидай что Electron сам разрешит этот конфликт — не разрешит, нативно крашит

---

## 🔴 КРИТИЧЕСКОЕ: WebContentsView pilot падает на loadURL — корень `disable-gpu-compositing` switch (ОПРОВЕРГНУТО в v0.89.55, см. выше)

### Симптом

Юзер включает пилот WebContentsView, перезапускает программу. В консоли:

```
[wcv-mgr] new WebContentsView ok
[wcv-mgr] addChildView ok
[wcv-mgr] queuing loadURL https://web.telegram.org/k/
  ИЛИ
[wcv-mgr] step 1: loadURL about:blank (isolation test)
[crashpad ... not connected]
PS prompt
```

Программа закрывается на этапе `loadURL`. **Даже `about:blank` крашит** (v0.89.54 эксперимент) — значит проблема не в URL.

Никакой JS ошибки в логе — uncaughtException / unhandledRejection / renderer-uncaught пусто. Это **native crash Chromium renderer**.

### КОРЕНЬ (доказано v0.89.55)

В `main/main.js` строка:

```js
app.commandLine.appendSwitch('disable-gpu-compositing')
```

Добавлен **v0.85.6 (6 апреля 2026)** как воркэраунд для `<webview>` тега — без него Telegram чернеет при переключении вкладок (потеря GPU compositor контекста).

По [Chromium docs](https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-gpu-compositing) этот switch:
> «All compositing will be done by software using **swiftshader** instead of the GPU.»

Software composition (swiftshader) поддерживает **только single-layer rendering**, не overlay. WebContentsView физически рисуется **поверх** primary view BrowserWindow — это **overlay layer**, требует GPU compositor. Без него — native segfault Chromium при первом рендере (даже `about:blank`).

| view + switch | Работает? |
|---|---|
| `<webview>` тег + `disable-gpu-compositing` | ✅ Software mode, single-layer renderer |
| `BrowserWindow` primary + `disable-gpu-compositing` | ✅ Software mode, single layer |
| **`WebContentsView` overlay + `disable-gpu-compositing`** | ❌ **NATIVE CRASH** — overlay требует compositor |

### Решение (v0.89.55)

**Условное применение switch**. Settings читаются СИНХРОННО из `chatcenter.json` ДО `app.whenReady` через `app.getPath('userData')` (по Electron docs — доступен до whenReady).

В `main/main.js`:

```js
;(function applyGpuStabilitySwitches() {
  let pilotEnabled = false
  try {
    const settingsPath = path.join(app.getPath('userData'), 'chatcenter.json')
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      pilotEnabled = !!data?.settings?.useWebContentsView
    }
  } catch (_) {}
  if (!pilotEnabled) {
    app.commandLine.appendSwitch('disable-gpu-compositing')
  }
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
})()
```

| Тумблер | switch применён | `<webview>` | WebContentsView | ChatMonitor |
|---|---|---|---|---|
| **OFF** (default) | ✅ да | ✅ нет чёрного экрана | — (не используется) | ✅ webview preload |
| **ON** (пилот) | ❌ нет | — (не используется) | ✅ overlay рендерится | ✅ WebContentsView preload |

**Полный функционал** в обоих режимах. Никакой регрессии для default режима.

### История расследования (8 версий — изоляция корня)

| Версия | Гипотеза | Опровергнута |
|---|---|---|
| v0.89.46 | `file://` URL preload | конструктор не падал |
| v0.89.48 | global error handlers + crashpad filter | помогает диагностике, не корень |
| v0.89.49 | toast при uncaught error | UX-фикс |
| v0.89.50 | render-branch + slot mount логи | Slot OK, invoke уходит |
| v0.89.51 | fs.existsSync preload + конструктор лог | конструктор OK |
| v0.89.52 | пошаговые `[wcv-mgr]` логи | краш на loadURL |
| v0.89.53 | `preload={undefined}` (гипотеза CSP) | краш остался без preload |
| v0.89.54 | sandbox:true + about:blank эксперимент | **about:blank тоже крашит** → не URL |
| **v0.89.55** | **`disable-gpu-compositing` switch** | **✅ ПОДТВЕРЖДЕНО** |

### Правило для будущих фич

Если делаешь WebContentsView (не `<webview>` тег):
- ❌ **НЕ применяй `disable-gpu-compositing`** при включённом пилоте
- ✅ Проверяй все Chromium switches в main.js перед миграцией
- ✅ Settings читай через `app.getPath('userData')` — доступно до `app.whenReady`
- ✅ `<webview>` и WebContentsView требуют **разной** GPU конфигурации

### Что отметено (НЕ корень)

**v0.89.53 гипотеза (отменена)**: «monitor.preload.cjs инжектит inline `<script>` → CSP violation». После v0.89.53 preload отключён (`preload={undefined}`), краш **ОСТАЛСЯ**. Значит preload не корень — он был необязательным звеном.

### Что ещё проверяется

**v0.89.54 гипотеза**: `sandbox: false` без preload — недокументированная комбинация. По [Electron Security Guidelines](https://www.electronjs.org/docs/latest/tutorial/security) `sandbox: false` имеет смысл только когда preload требует Node APIs. Изменено на `sandbox: true` (safe default).

Альтернативные гипотезы (если v0.89.54 не помогает):
1. **BrowserWindow + child WebContentsView** — мы используем `mainWindow` (BrowserWindow). По [WebContentsView docs](https://www.electronjs.org/docs/latest/api/web-contents-view) пример — `BaseWindow + WebContentsView`. С v30+ BrowserWindow.contentView.addChildView поддерживается, но менее протестировано.
2. **`disable-gpu-compositing` switch** в main.js — конфликт с WebContentsView, который требует GPU compositing.
3. **session conflict** — `setupSession('persist:telegram')` уже настроил session с webRequest/cert handlers. WebContentsView с partition использует ту же session → race с handlers.

### Серия v0.89.46-v0.89.53 — пошаговая изоляция места

| Версия | Что добавлено | Что выяснилось |
|---|---|---|
| v0.89.46-49 | Diag + global error handlers + toast | Native crash JS не ловит |
| v0.89.50 | render-branch + slot mount логи | Slot монтируется, invoke уходит |
| v0.89.51 | fs.existsSync preload + конструктор лог | Файл есть, конструктор работает |
| v0.89.52 | Пошаговые `[wcv-mgr]` логи | Краш на loadURL |
| v0.89.53 | preload={undefined} | Гипотеза «CSP в preload» — отменена |
| v0.89.54 | sandbox:true + about:blank-первый | Изолировать sandbox vs URL |

### Решение (v0.89.53 минимум — действует)

Pilot работает **БЕЗ preload** (Phase 2.1 минимум). В [`src/App.jsx`](../../src/App.jsx):

```jsx
<WebContentsViewSlot preload={undefined} ... />
```

**Но это не помогло**. Расследование продолжается.

### Эксперимент v0.89.54

В [`webContentsViewManager.js`](../../main/utils/webContentsViewManager.js):
1. `sandbox: true` (вместо `false`).
2. `loadURL('about:blank')` ПЕРЕД реальным URL — если about:blank работает, корень в URL/CSP. Если even about:blank крашит — корень в WebContentsView конфигурации.

### Правило для будущих фич (формируется)

Если делаешь WebContentsView (не `<webview>` тег) — придерживайся **минимально безопасной конфигурации**:
- ✅ `contextIsolation: true`
- ✅ `nodeIntegration: false`
- ✅ `sandbox: true` (с preload — false только если ОЧЕНЬ нужно Node API)
- ✅ Test loadURL с разными URL (about:blank → внешний)
- ⚠️ С `BrowserWindow` — экспериментально, лучше `BaseWindow`

### --- ПРЕДЫДУЩАЯ ЛОВУШКА v0.89.46 (preload URL vs path) сохраняется ниже ---

**v0.89.53 fix preload as URL — всё ещё актуален**: WebContentsView требует raw path, не file:// URL. Это отдельная ловушка, не связанная с текущим расследованием loadURL.

### Прежнее описание (ниже сохранено для истории)

`monitor.preload.cjs` написан для **`<webview>` тега** — он инжектит inline `<script>` в DOM:

```js
// monitor.preload.cjs:27-30
var s = document.createElement('script')
s.textContent = hookCode
;(document.head || document.documentElement).appendChild(s)
```

Когда WebContentsView начинает грузить страницу:
1. Preload выполняется **до** загрузки HTML
2. Telegram / WhatsApp / etc. имеют **строгий CSP** (`script-src 'self'`)
3. CSP блокирует inline script injection
4. В **`<webview>`** теге это терпится — там специфическая sandbox-конфигурация
5. В **WebContentsView** preload CSP violation → **нативный краш Chromium** (segfault)
6. Native crash JS обработчики `uncaughtException` / `unhandledRejection` **НЕ ловят**

### История расследования

Серия v0.89.46 → v0.89.52 — пошаговая изоляция места краха через детальные `[wcv-mgr]` логи:

| Версия | Что добавлено | Что выяснилось |
|---|---|---|
| v0.89.46 | `normalizePreloadPath()` file://→path | Не помогло — конструктор не падал |
| v0.89.48 | Глобальные uncaughtException handlers | Native crash не ловится |
| v0.89.50 | `[render-branch]`, `[WCV-slot] mount` логи | Slot монтируется, invoke уходит |
| v0.89.51 | `fs.existsSync(preload)` + конструктор лог | Файл есть, конструктор работает |
| v0.89.52 | Пошаговые `[wcv-mgr]` логи | **Краш на `loadURL`** |

После 7 версий поиска — выяснили что проблема не в API/путях/таймингах, а в **несовместимости самого preload**.

### Решение (v0.89.53)

Pilot работает **БЕЗ preload** (откат к Phase 2.1 минимум). В [`src/App.jsx`](../../src/App.jsx):

```jsx
<WebContentsViewSlot
  viewId={m.id}
  url={m.url}
  partition={m.partition}
  preload={undefined}    // ← НЕ передаём monitor.preload.cjs
  ...
/>
```

**Последствие**: пилот не имеет ChatMonitor (уведомления, mark-read, ribbon), но окно открывается без краха. Юзер может проверить UX-улучшения (разделитель не залипает, нет webview boundary).

### Будущее (Phase 3 — отдельный preload для WebContentsView)

Полная замена `<webview>` → WebContentsView требует **переписать `monitor.preload.cjs`** без inline `<script>` injection. Варианты:
1. Inject через `webContents.executeJavaScript` (через wcv:execute-js IPC) — обходит CSP так как выполняется в isolated world.
2. Использовать `contentScripts` (Electron extension API) — официальный путь, требует другой архитектуры.
3. Зарегистрировать `<script>` через `webContents.session.webRequest.onHeadersReceived` для удаления CSP — небезопасно, ToS-риск.

Вариант 1 предпочтителен. Bridge ([`src/utils/webContentsViewBridge.js`](../../src/utils/webContentsViewBridge.js)) уже умеет проксировать executeJavaScript — нужен только новый preload-script (`monitor-wcv.preload.js`) который не пытается inject DOM сам.

### Регрессионная защита

[`src/__tests__/webContentsViewPatterns.test.cjs`](../../src/__tests__/webContentsViewPatterns.test.cjs):
- WebContentsViewSlot должен получать `preload={undefined}` (не path, не URL)
- При попытке вернуть monitor.preload.cjs — тест падает с описанием ловушки.

### Правило для будущих фич

Если делаешь WebContentsView (не `<webview>` тег):
- ✅ Не передавай preload, если не уверен в его CSP-совместимости с целевым доменом
- ✅ Тестируй на доменах с строгим CSP (Telegram, WhatsApp, GitHub)
- ✅ Помни: `<webview>` и WebContentsView — **разные** preload контракты
- ❌ Не предполагай что preload `<webview>` будет работать в WebContentsView

---

## 🔴 КРИТИЧЕСКОЕ: preload — `<webview>` ест file:// URL, WebContentsView требует raw path (v0.89.46)

### Симптом

Юзер включил пилот `useWebContentsView=true`, перезапустил программу. В консоли:

```
ERROR: preload script must have absolute path.
ERROR: third_party\crashpad ... not connected
```

Программа падает на создании первого view.

### Корневая причина

`monitorPreloadUrl` формируется в [`useAppBootstrap.js`](../../src/hooks/useAppBootstrap.js) как `file:///c:/Projects/.../monitor.preload.cjs`. Старый `<webview>` тег **сам** конвертирует URL → путь — это историческое legacy-поведение. **WebContentsView** так не умеет: Electron строго требует абсолютный путь.

По [Electron docs](https://www.electronjs.org/docs/latest/api/web-contents-view) (verbatim): «webPreferences.preload — Specifies a script that will be loaded before other scripts run in the page... **The value should be the absolute file path to the script**».

Аналогично для [`BrowserWindow`](https://www.electronjs.org/docs/latest/api/browser-window) и [`WebContents`](https://www.electronjs.org/docs/latest/api/web-contents) — везде кроме legacy `<webview>` тега.

### Решение (v0.89.46 + v0.89.47)

**v0.89.46** — функция `normalizePreloadPath(preload)` в [`webContentsViewManager.js`](../../main/utils/webContentsViewManager.js): через `node:url#fileURLToPath` конвертирует `file://` → путь. Handle unicode и пробелы. Это страховка-нормализатор внутри manager.

**v0.89.47** (архитектурно чище) — в [`useAppBootstrap.js`](../../src/hooks/useAppBootstrap.js) теперь хранятся **оба** значения отдельно:
- `monitorPreloadUrl = "file:///c:/..."` → для `<webview>` тега
- `monitorPreloadPath = "c:\\..."` → для WebContentsView и любых других новых API

В [`App.jsx`](../../src/App.jsx) `WebContentsViewSlot` получает `preload={monitorPreloadPath}`, а старый `<webview>` — `preload={monitorPreloadUrl}`.

### Регрессионная защита

[`webContentsViewManager.vitest.js`](../../src/__tests__/webContentsViewManager.vitest.js) — 5 тестов нормализации (`null`, абсолютный путь, `file:///c:/...`, unicode, пробелы).

[`modernPatternsGuard.test.cjs`](../../src/__tests__/modernPatternsGuard.test.cjs) — App.jsx передаёт в `WebContentsViewSlot` именно `monitorPreloadPath` (не URL).

### Правило для будущих фич

| Если используешь | Передавай preload как |
|---|---|
| `<webview>` тег | `file:///c:/path.cjs` URL |
| `WebContentsView` / `BaseWindow.contentView` | `c:\\path.cjs` raw путь |
| `BrowserWindow` | `c:\\path.cjs` raw путь |
| `webContents.loadFile / setWindowOpenHandler` | raw путь |

**Тест перед использованием**: открой [Electron docs](https://www.electronjs.org/docs/latest/api/web-contents-view) и убедись что там написано «absolute file path», а не «URL».

---

## 🔴 КРИТИЧЕСКОЕ: webview boundary блокирует mouseup → drag разделитель залипает (v0.89.38)

### Симптом
Юзер тянет разделитель между чатами и AI sidebar, отпускает мышь — перегородка продолжает двигаться. Невозможно прекратить drag.

### Корневая причина

[Electron webview docs](https://www.electronjs.org/docs/latest/api/webview-tag) (verbatim):
> «You can not add keyboard, mouse, and scroll event listeners to `webview`.»
> «the `webview` runs in a separate process»
> «Out-of-Process iframes (OOPIFs)»

События мыши **физически** не пересекают границу `<webview>` — это отдельный процесс. Когда курсор уходит на webview (мессенджеры или AI ChatGPT), `mouseup`/`pointerup` идут внутрь webview, не доходят до window listener в host.

В [`App.jsx`](../src/App.jsx) был **локальный** overlay:
```jsx
{isResizing && (
  <div className="absolute inset-0 z-50" />  // ❌ покрывает только chats area
)}
```

`absolute inset-0` = относительно ближайшего relative-родителя (chats div). Не покрывает AI sidebar webview. → mouseup в AI webview → host не получает → `isResizingRef.current` остаётся true → разделитель залипает.

### Решение (v0.89.38)

**Глобальный `position: fixed` overlay** на корневом уровне App.jsx:
```jsx
{isResizing && (
  <div
    data-cc-resize-overlay="true"
    style={{
      position: 'fixed', inset: 0, zIndex: 999999,
      cursor: 'col-resize', userSelect: 'none',
    }}
  />
)}
```

`position: fixed` относительно viewport — покрывает **оба** webview гарантированно. Z-index 999999 чтобы webview не перекрыл overlay.

### Параллельная модернизация (v0.89.38)

В этом же коммите переход на **Pointer Events API** (W3C 2018+) для всех drag/clickaway операций:
- [`useAIPanelResize.js`](../src/hooks/useAIPanelResize.js): `mouse*` → `pointer*` + `setPointerCapture` (гарантия доставки в пределах документа)
- 3 dropdown'а (`MuteMenu.jsx`, `CountryPicker.jsx`, `AccountContextMenu.jsx`): `addEventListener('mousedown')` → `addEventListener('pointerdown')`

Pointer Events — единый API для mouse/touch/pen, рекомендован MDN/W3C начиная с 2018. `setPointerCapture` гарантирует доставку всех pointer событий до `pointerup` (в пределах документа, не пересекает webview boundary — поэтому overlay тоже нужен).

### Регрессионная защита

[`modernPatternsGuard.test.cjs`](../src/__tests__/modernPatternsGuard.test.cjs) проверяет:
- Маркер `data-cc-resize-overlay` присутствует в App.jsx
- `position: fixed` + `zIndex: 999999` в overlay
- `setPointerCapture` в useAIPanelResize
- `pointerdown` (не `mousedown`) в 3 dropdown файлах
- Отсутствие `window.addEventListener('mousemove')` (откат к старому)

Pre-commit + pre-push hooks падают при возврате к старым паттернам.

### Правило

Для любого drag/resize over Electron `<webview>`:
1. **Глобальный `position: fixed` overlay** при isResizing — обязательно (events не пересекают webview boundary)
2. **Pointer Events + setPointerCapture** — современный W3C стандарт (overlay не отменяет — он для webview, capture для документа)
3. Локальный `absolute` overlay внутри chat area = **БАГ** (не покрывает sidebar webview)

---

## 🔴 КРИТИЧЕСКОЕ: nodeIntegration: true + contextIsolation: false = нарушение Electron Security (v0.89.38)

### Симптом
[`main/utils/trayManager.js:16`](../main/utils/trayManager.js) до v0.89.38 создавал log viewer BrowserWindow с:
```js
webPreferences: { contextIsolation: false, nodeIntegration: true }
```

Это нарушает [Electron Security Guidelines](https://www.electronjs.org/docs/latest/tutorial/security):
- **Don't #2**: «Do not enable Node.js integration for remote content»
- **Don't #3**: «Do not disable contextIsolation»

С Electron v12 `contextIsolation: true` — дефолт. Преднамеренное отключение — security risk:
- В renderer можно `require('fs')`, `require('child_process')` — полный доступ к файловой системе
- Если в логе случайно окажется HTML/script (XSS) — исполнится в Node контексте
- `contextIsolation: false` смешивает window object renderer + Node — доступ к internals Electron

### Решение (v0.89.38)

1. Создан [`main/preloads/log-viewer.preload.cjs`](../main/preloads/log-viewer.preload.cjs) с `contextBridge.exposeInMainWorld('logViewer', { onContent, clearLog })`
2. `trayManager.js` создаёт окно с `contextIsolation: true, nodeIntegration: false, sandbox: false, preload`
3. `executeJavaScript(window.__logContent = ...)` заменён на `webContents.send('log-viewer:content', content)`
4. `log-viewer.html` использует `window.logViewer.onContent(cb)` вместо `window.__logContent`
5. Прямой `require('electron')` в HTML заменён на `window.logViewer.clearLog()`

### Регрессионная защита

[`modernPatternsGuard.test.cjs`](../src/__tests__/modernPatternsGuard.test.cjs) сканирует все BrowserWindow-creating файлы и падает при найденном `nodeIntegration: true` или `contextIsolation: false` (с учётом исключения комментариев).

### Правило

Любое новое `BrowserWindow` в проекте **обязано**:
- `contextIsolation: true`
- `nodeIntegration: false`
- `preload` с `contextBridge` для exposing renderer API
- IPC channels (`webContents.send` + `ipcRenderer.on`) для main↔renderer коммуникации

Никаких `executeJavaScript(window.__data = ...)` injection — это XSS vector.

---

## 🔴 КРИТИЧЕСКОЕ: file:/// URL **ЗАБЛОКИРОВАН** в renderer — используй `cc-media://` (v0.87.93)

### Симптом

В DevTools console:
```
Not allowed to load local resource: file:///C:/Users/...
```

В UI — пустой круг вместо аватарки/изображения. В `chatcenter.log` (через `console-message` listener в `windowManager.js`) тоже эта же ошибка с уровнем ERROR.

### Что НЕЛЬЗЯ делать

🔴 **НЕ возвращай `file:///...` URL из main process в renderer**:

```js
// ❌ ПЛОХО — Chromium заблокирует в renderer:
return 'file:///' + encodeURI(filepath.replace(/\\/g, '/'))
```

Причина: renderer работает на `http://localhost:5173` (dev) или `app://` (prod). Из этих origin'ов Chromium **запрещает** загрузку `file:///` ресурсов — это базовая security policy браузера. `webSecurity: false` помогает не во всех случаях и **никогда** не должен ставиться.

### Как НАДО делать

🟢 **Используй кастомный protocol `cc-media://`** — он зарегистрирован в `main/native/ccMediaProtocol.js` (v0.87.21):

```js
// ✅ ХОРОШО — cc-media:// читается через privileged protocol:
return `cc-media://avatars/${filename}`         // для аватарок
return `cc-media://media/${filename}`           // для фото/файлов
return `cc-media://video/${filename}`           // для видео (с Range support)
```

### Что протокол делает

`registerCcMediaScheme()` (вызывается из `main.js`) регистрирует scheme как:
- `standard: true` — нормальный URL парсинг
- `secure: true` — считается безопасным origin
- `bypassCSP: true` — обходит Content Security Policy
- `stream: true` — поддержка HTTP Range (для `<video>` seeking)

`registerCcMediaHandler(userData)` маршрутизирует по hostname:
- `cc-media://avatars/X.jpg` → `<userData>/tg-avatars/X.jpg`
- `cc-media://media/X.jpg` → `<userData>/tg-media/X.jpg`
- `cc-media://video/X.mp4` → `<userData>/tg-media/X.mp4`

Чтение через `net.fetch(pathToFileURL(filePath))` — обходит блокировки renderer и поддерживает Range.

### Как диагностировать (без DevTools)

⚠ **НЕ нужно открывать DevTools** — есть готовая инфраструктура логирования:

1. **Файл лога**: `%APPDATA%/ЦентрЧатов/chatcenter.log`
2. **Все ошибки renderer** с уровнем ≥ 2 (error) перехватываются через `mainWindow.webContents.on('console-message', ...)` в `main/utils/windowManager.js:63` → пишутся в `chatcenter.log` через `console.error` патч в `main/utils/logger.js`.
3. **Свои логи из renderer**: `window.api?.send('app:log', { level: 'INFO', message: '...' })`. Примеры:
   - `src/hooks/useAppBootstrap.js:25`
   - `src/native/utils/scrollDiagnostics.js:29`
4. **`console.log()` в renderer (info)** не попадает в файл — только в DevTools. Для диагностики используй `app:log` или `console.error` (он перехватывается).

**Правильная команда для проверки**:
```bash
grep -i "not allowed\|file:///" "$APPDATA/ЦентрЧатов/chatcenter.log" | tail -10
```

### Реальный случай (v0.87.91 → v0.87.93)

1. **v0.87.91**: добавил аватарку пользователя через `client.downloadProfilePhoto(me)` → сохранил в `tg-avatars/me_<id>.jpg` → вернул `file:///` URL.
2. Backend: ✅ файл скачан (5318 bytes из лога), URL передан через IPC.
3. UI: ❌ пустой круг — Chromium блокирует `file:///` в renderer.
4. **v0.87.92**: добавил `console.log` в `nativeStore.js` — попросил пользователя открыть DevTools. **Зря** — у проекта уже есть свой логер через `chatcenter.log`.
5. **v0.87.93**: заменил на `cc-media://avatars/me_<id>.jpg` → заработало.

Между шагами 4 и 5 пользователь справедливо матерился.

### Чек-лист для будущих фич с локальными файлами

- [ ] Файл сохраняется в `<userData>/tg-avatars/`, `tg-media/` или другой подпапке
- [ ] Возвращаемый URL **не** содержит `file:///`
- [ ] Возвращаемый URL — `cc-media://<kind>/<filename>` (kind: `avatars`/`media`/`video`)
- [ ] Если нужен новый kind (например `cc-media://stickers/`) — добавить в `registerCcMediaHandler` switch.
- [ ] **НЕ** добавлять `console.log` в renderer для диагностики — использовать `window.api.send('app:log', ...)` чтобы попадало в `chatcenter.log`.

### Связанные файлы

- `main/native/ccMediaProtocol.js` — реализация протокола (~70 строк)
- `main/main.js` (где-то рядом со startup) — `registerCcMediaScheme()` + `registerCcMediaHandler(userDataPath)`
- `main/native/telegramChats.js:61,233` — пример использования для аватарок чатов (но там пока `file:///` — TODO мигрировать)
- `main/native/telegramAuth.js loadOwnAvatar()` — использует `cc-media://` (v0.87.93)
- `main/utils/windowManager.js:63` — perехват console-message (откуда брать ошибки)
- `main/utils/logger.js:45` — `console.error` → `chatcenter.log`

---

## 🔴 КРИТИЧЕСКОЕ: после разбиения файла прогнать ВСЕ cjs-тесты, не только vitest (v0.87.79)

**Симптом**: разбили большой файл на модули, локально `npm run lint` + `npm run test:vitest` зелёные → push → GitHub Actions CI падает на одном из 30 cjs-тестов которые проверяют **паттерны grep'ом** в исходном файле.

**Реальный случай**:
- v0.87.77 разбил `src/utils/navigateToChat.js` (300 → 22 строки) на router + 5 файлов в `navigators/`
- Я обновил `navigateToChat.test.cjs` (склеил router + navigators/) — этот тест я знал и проверил
- НО `integration.test.cjs:285-292` тоже читает `navigateToChat.js` и грепает `.chatlist-chat`, `ConvoListItem` — **второй такой же тест**, я о нём не вспомнил
- v0.87.78 (notification.html разбит) тоже прошёл лимиты, но CI продолжал падать с тем же v0.87.77 фейлом
- v0.87.79 — починил, склеив `navigateToChat.js` со всеми `navigators/*.js` в `integration.test.cjs`

**Почему `npm test` локально нельзя**: цепочка `npm test` в проекте включает `electron-vite build && node e2e/app.e2e.cjs && node e2e/ui.e2e.cjs` — последние два запускают **Electron**, что нарушает критический запрет CLAUDE.md.

**Правило**: при **разбиении файла на модули** или **переименовании файла** обязательно прогнать ВСЕ cjs-тесты которые могут читать этот файл grep'ом:

```bash
for t in isSpamText navigateToChat messengerConfigs monitorPreload \
         overlayIcon handleNewMessage messageProcessing mainProcess \
         appStructure projectHealth aiProviders consoleMessageParser \
         ipcChannels fileSizeLimits memoryBankSizeLimits featuresReferences \
         memoryLeaks notifHooks componentScope hookOrder mainImports \
         mainRuntime mediaCacheQuota unitRuntime buildContract storageErrors \
         aiErrors extractedModules smokeTest integration; do
  node src/__tests__/$t.test.cjs > /dev/null 2>&1 || echo "❌ $t"
done
```

Без этого CI **обязательно** упадёт после крупного разбиения, и придётся делать второй коммит-фикс.

**Какие тесты особенно опасны** (содержат `fs.readFileSync(...).includes(...)`):
- `integration.test.cjs` — проверяет цепочки между файлами через grep
- `appStructure.test.cjs` — структура проекта
- `componentScope.test.cjs` — вложенность функций
- `extractedModules.test.cjs` — что именно экспортируется
- `mainImports.test.cjs` — какие импорты в main.js
- `appStructure`, `featuresReferences` — пути к файлам

При разбиении файла X — ищи `readFileSync.*X` по всем тестам:

```bash
grep -rn "readFileSync.*<имя_файла>" src/__tests__/
```

---

## 🔴 КРИТИЧЕСКОЕ: FLOOD_WAIT от массовых GramJS RPC вызовов (v0.87.55)

**Симптом**: Приложение бан Telegram сервером на 26 секунд, все новые чаты без аватарок, в логе `FLOOD_WAIT_X`.

**Причина**: `loadAvatarsAsync` в [main/native/telegramHandler.js](../../main/native/telegramHandler.js) шёл циклом по 196 диалогам и для каждого делал `GetFullChannel` / `GetFullUser` **без задержек**. Telegram терпит ~10 RPS, а мы давали 50+.

**ПРАВИЛО**: Любой цикл по большому списку, делающий MTProto-запросы — **ОБЯЗАН** быть throttled.
- Минимум 200мс между запросами (= 5 RPS)
- Ловить FLOOD_WAIT: `message.match(/FLOOD_WAIT.*?(\d+)/)` — парсить секунды, ждать, ретрай
- Считать `floodWaits` в stats, логировать

**Шаблон throttle helper** (из v0.87.55):
```js
let lastReqTs = 0
const THROTTLE_MS = 200
async function throttledInvoke(reqFactory) {
  const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastReqTs))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastReqTs = Date.now()
  try { return await client.invoke(reqFactory()) }
  catch (e) {
    const m = String(e?.message || '').match(/FLOOD_WAIT.*?(\d+)/)
    if (m) {
      const s = Number(m[1]) || 30
      await new Promise(r => setTimeout(r, (s + 1) * 1000))
      lastReqTs = Date.now()
      return await client.invoke(reqFactory())
    }
    throw e
  }
}
```

**Места где ещё есть потенциальный FLOOD_WAIT** (на будущее — проверить при похожих симптомах):
- `loadAvatarsAsync` — ✅ throttled v0.87.55
- `tg:get-messages` handler делает `GetFullUser/GetFullChannel` — per-request из UI, обычно медленный, не требует throttle
- `fetchAllUnreadUpdates` с `GetPeerDialogs` — уже идёт пачками, риск низкий

---

## 🟡 ВАЖНОЕ: console-message Electron 41+ deprecated позиционные поля (v0.87.55)

**Симптом**: в DevTools main-процесса warning про `'message'/'level'/'sourceId' are deprecated on console-message Event`.

**Причина**: в Electron 41 старый позиционный API заменён на объект `event.details`. Старый ещё работает, но deprecated.

**Старый API** (числа): `e.message, e.level (0-3), e.sourceId, e.lineNumber`.
**Новый API** (строки): `e.details.{message, level: 'info'|'warning'|'error'|'verbose', sourceId, lineNumber}`.

**ПРАВИЛО (backward-compatible)**:
```js
const d = e.details || e
const msg = d.message ?? e.message
const rawLevel = d.level ?? e.level
const lvl = typeof rawLevel === 'number' ? rawLevel
  : rawLevel === 'warning' ? 1 : rawLevel === 'error' ? 2
  : rawLevel === 'info' ? 0 : rawLevel === 'verbose' ? 3 : -1
```

**Где применено (v0.87.55)**: [src/utils/consoleMessageHandler.js](../../src/utils/consoleMessageHandler.js).

**Где ещё надо мигрировать** (на будущее, не критично — старый API работает):
- `main/handlers/videoPlayerHandler.js`
- `main/handlers/backupNotifHandler.js`
- `main/preloads/monitor.preload.cjs`
- `main/utils/windowManager.js`
- `src/utils/webviewSetup.js`

---

## 🟡 ВАЖНОЕ: отправка сообщений должна логироваться и показывать ошибки юзеру (v0.87.55)

**Симптом**: юзер вводит текст в поле → нажимает «Отпр.» → ничего не происходит. В логах пусто.

**Причина**: `handleReplySend` в InboxMode и `tg:send-message` handler в main — **оба** имели `catch { return { ok: false, error } }` без логов, а UI игнорировал `result.error`.

**ПРАВИЛО**: Любой IPC handler для пользовательских действий **обязан**:
1. Логировать старт операции (`log('send-message START: ...')`)
2. Логировать успех с деталями (`log('send-message OK: messageId=X')`)
3. Логировать ошибку с типом и сообщением (`log('ERROR: ... (' + e.constructor?.name + ')')`)

И UI-сторона должна:
1. Проверять `result.ok` и показывать toast на ошибку
2. Возвращать текст в поле ввода при неудаче (чтобы не терялся)
3. Логировать собственные события (`send-start`, `send-result`, `send-throw`)

Это гарантирует что "молчаливых" багов не будет — либо успех, либо видимая причина.

---

## 🔴 КРИТИЧЕСКОЕ: ELECTRON_RUN_AS_NODE=1

### ❌ Запуск electron-vite напрямую из VS Code / Claude Code терминала

VS Code и Claude Code устанавливают `ELECTRON_RUN_AS_NODE=1` в среду процесса.
При этом `require('electron')` возвращает путь к бинарнику (`"C:\...\electron.exe"`), а не Electron API.

**Симптом**: `TypeError: Cannot read properties of undefined (reading 'handle'/'isPackaged'/etc.)`

**Решение**: запускать через `scripts/dev.js`, который удаляет переменную:
```js
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
spawn('electron-vite', ['dev'], { env, shell: true })
```

**НИКОГДА** не запускать `electron-vite dev` напрямую из этой среды.

---

## WebView

### ❌ accountScript показывает имя открытого чата вместо имени аккаунта ("Автолиберти")

**Симптом**: Под вкладкой Telegram вместо имени пользователя показывается название открытого в данный момент чата (например "Автолиберти!!!!").

**Причина**: В Telegram Web K НЕТ надёжного DOM-элемента с именем СВОЕГО аккаунта в обычном виде (список чатов). Имя пользователя видно только в открытых Настройках/Профиле. Любые селекторы в обычном режиме захватывают имя ОТКРЫТОГО собеседника.

**Решение v0.18**: Удалить accountScript. Но пользователь хочет видеть имя → нужно извлекать по-другому.

**Решение v0.19.0 (НЕ РАБОТАЛО)**: `data-peer-id` из `.sidebar-header` → IndexedDB → имя. ПРОБЛЕМА: в обычном виде TG Web K в sidebar-header НЕТ `data-peer-id` — он появляется ТОЛЬКО на странице Настроек.

**Решение v0.19.2 (окончательное)**: Полностью БЕЗ DOM. Перебираем IndexedDB cursor → `users` store → ищем `pFlags.self === true` → имя/телефон.
```js
// Подход: IndexedDB cursor → pFlags.self → имя/телефон
var cur = tx.objectStore('users').openCursor();
cur.onsuccess = function() {
  var u = cur.result.value;
  if (u && u.pFlags && u.pFlags.self) { /* найден! */ }
  cur.result.continue();
};
```

**Дополнительно — ЛОВУШКА**: `messengers:save` пишет ВСЮ структуру мессенджера в electron-store, включая `accountScript`. Даже после удаления `accountScript` из `constants.js`, старый скрипт выживает в сохранённом `messengers.json`!

**Решение (2 уровня)**:
1. В `tryExtractAccount` — для дефолтных мессенджеров брать `accountScript` ТОЛЬКО из `DEFAULT_MESSENGERS`, не из сохранённых данных:
```js
const defaultM = DEFAULT_MESSENGERS.find(m => m.id === messengerId)
const script = defaultM !== undefined
  ? defaultM.accountScript  // из constants.js (undefined = не извлекаем)
  : storedMessenger?.accountScript  // кастомные мессенджеры — из store
```
2. При загрузке — чистить устаревший `accountScript` из сохранённых данных:
```js
const cleaned = list.map(m => {
  const def = DEFAULT_MESSENGERS.find(d => d.id === m.id)
  if (def && m.accountScript && !def.accountScript) {
    const { accountScript, ...rest } = m; return rest
  }
  return m
})
```

---

### ❌ Бейдж непрочитанных = 0 когда все чаты приглушены (muted)

**Симптом**: В Telegram десятки непрочитанных сообщений, но бейдж на вкладке пропал и в статус-баре "📥 непрочитано" не отображается.

**Причина**: `countUnread()` в `monitor.preload.js` фильтровал ВСЕ бейджи muted-диалогов через `isBadgeInMutedDialog()`. Если все чаты с непрочитанными приглушены — `total = 0`.

**Решение**: Разделить подсчёт на два уровня:
- `allTotal` — ВСЕ непрочитанные (включая muted) — для бейджа вкладки и статус-бара
- `total` (personal + channels) — без muted — для определения роста и уведомлений
```js
// countUnread теперь возвращает { personal, channels, total, allTotal }
// sendUpdate использует allTotal для unread-count IPC
try { ipcRenderer.sendToHost('unread-count', allTotal) } catch {}
```

---

### ❌ Уведомление "Новое сообщение" без текста сыплется от muted-чатов

**Симптом**: Пользователь видит уведомления "Telegram / Новое сообщение" без текста — от каналов с сотнями/тысячами непрочитанных (AliExpress 7.1K, Бизнес сегодня 296 и т.д.), даже если они приглушены.

**Причина 1**: `app:notify` вызывался при любом росте `unread-count`. `countUnread` суммировал бейджи ВСЕХ диалогов (включая 🔇 muted), поэтому любой новый пост в канале = рост счётчика = уведомление.

**Причина 2**: Тело уведомления = хардкод `'Новое сообщение'` — не содержит текст сообщения.

**Решение**:
1. В `App.jsx`: убрать `playNotificationSound()` и `app:notify` из `unread-count`. Перенести в `new-message` с текстом: `body: text.length > 100 ? text.slice(0, 97) + '…' : text`
2. В `monitor.preload.js`: `isBadgeInMutedDialog()` + `isActiveChatMuted()` — фильтр muted-диалогов из счётчика и блокировка `new-message` от muted-чатов.

---

### ❌ MutationObserver сообщает о старых сообщениях как о новых при загрузке страницы

**Симптом**: При подключении мессенджера (Telegram и др.) приложение показывает уведомление о "новом" сообщении, хотя оно было отправлено до подключения к системе.

**Причина**: MutationObserver запускается сразу, а мессенджер грузит DOM динамически — `lastCount` начинается с -1 → 0, потом Telegram добавляет чаты → счётчик растёт → `increased = true` → срабатывает `new-message` на старые сообщения.

**Решение**: `monitorReady = false`, устанавливается `true` через 10 секунд. `new-message` отправляется только когда `monitorReady === true`:
```js
let monitorReady = false
setTimeout(() => { monitorReady = true }, 10000)

// В sendUpdate:
const increased = count > lastCount && lastCount >= 0 && monitorReady
```

---

### ❌ Ctrl+колёсико / Ctrl+клавиши зума не работают в WebView

**Симптом**: Обработчики `wheel` и `keydown` на элементе `<webview>` или `window` в renderer не срабатывают когда пользователь взаимодействует с содержимым WebView.

**Причина**: WebView (`<webview>` tag в Electron) — это изолированный процесс. Все события мыши и клавиатуры ВНУТРИ WebView отправляются в его content, а не в родительский renderer. Элемент `<webview>` в DOM renderer-а не получает эти события.

**Решение**: Обработчики зума (Ctrl+wheel, Ctrl+=/-/0) нужно добавлять в **preload WebView** (monitor.preload.js), и отправлять результат через `ipcRenderer.sendToHost('zoom-change', { delta })`. В App.jsx обрабатывать через `ipc-message` на webview-элементе:
```js
// monitor.preload.js:
document.addEventListener('wheel', function(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  ipcRenderer.sendToHost('zoom-change', { delta: e.deltaY < 0 ? 5 : -5 })
}, { passive: false })

// App.jsx (ipc-message handler):
if (e.channel === 'zoom-change') {
  const delta = e.args[0]?.delta || 0
  // ... apply zoom
}
```

---

### ❌ Бейдж/крестик вкладки перекрывает название мессенджера

**Симптом**: Бейдж "99+" налезает на текст "Telegram" в вкладке. Увеличение `pr-6` не помогает — бейдж слишком широкий.

**Причина**: Бейдж позиционирован `absolute top-1 right-1`. При тексте "99+" бейдж ~30px шириной, и даже с большим padding он перекрывает текст названия.

**Решение (v0.19.6)**: Перенести бейдж из `absolute` в flex-поток:
```jsx
// БЫЛО: absolute — перекрывает текст
<span className="absolute top-1 right-1 ...">99+</span>

// СТАЛО: в потоке flex — вкладка автоматически расширяется
<span className="ml-auto shrink-0 ...">99+</span>
```
Крестик закрытия тоже в потоке — показывается ВМЕСТО бейджа при hover.

**ВАЖНО**: НЕ использовать `absolute` для элементов, которые должны расширять контейнер. `absolute` элементы НЕ влияют на размер родителя.

---

### ❌ Перехват window.Notification/CustomEvent из preload WebView (context isolation)

**Симптом**: Уведомления мессенджера показывают "electron.app.Electron" вместо нашего заголовка. Переопределение `window.Notification` в preload не работает.

**Причина**: Electron WebView с context isolation изолирует JavaScript worlds:
- Preload world: свой `window`, свои объекты → `window.Notification` override видно ТОЛЬКО в preload
- Main world (страница мессенджера): свой `window` → `new Notification()` вызывается тут → override из preload НЕ виден

**Что НЕ работает**:
1. `window.Notification = ...` в preload → override виден только в preload world
2. `<script>` tag injection из preload → скрипт выполняется в main world, НО `CustomEvent` / `dispatchEvent` НЕ пересекают границу миров (JS events изолированы!)
3. `window.addEventListener('__cc_notification', ...)` в preload → НЕ ловит events из main world

**Решение v0.27.0 (ЧАСТИЧНОЕ — executeJavaScript в dom-ready)**: `webview.executeJavaScript()` в dom-ready handler + console-message. Проблема: VK может вызвать `new Notification()` ДО dom-ready → нативное уведомление просочится.

**Решение v0.29.1 (ОКОНЧАТЕЛЬНОЕ — <script> injection в preload)**: `<script>` tag создаётся в `monitor.preload.js` при document_start:
```js
// В monitor.preload.js (самое начало файла):
const s = document.createElement('script')
s.textContent = '(' + function() {
  window.Notification = function(title, opts) {
    console.log('__CC_NOTIF__' + JSON.stringify({t:title,b:opts?.body||'',i:opts?.icon||''}))
  }
  // + Audio.volume = 0
} + ')()'
;(document.head || document.documentElement).appendChild(s)
s.remove()
```
Этот `<script>` выполняется в main world при document_start — ДО скриптов VK/WhatsApp. console.log → console-message event ловит данные в App.jsx.

**Дополнительно**: `app.setName('ЦентрЧатов')` в main.js как fallback — но на Windows это НЕ влияет на заголовок тостов! Нужен `app.setAppUserModelId()` (см. ниже).

**Ключевой урок**: В Electron WebView с context isolation:
- DOM — общий (MutationObserver работает из preload, `<script>` тоже)
- `<script>` tag из preload → выполняется в main world при document_start (ДО скриптов страницы!)
- JS objects — изолированы (window.X в preload ≠ window.X на странице)
- JS events (CustomEvent, addEventListener) — изолированы (НЕ пересекают миры!)
- console.log → console-message event — ПЕРЕСЕКАЕТ границу (единственный надёжный канал из main world в renderer)
- `setPermissionRequestHandler` НЕ блокирует HTML5 Notification API в WebView (только запросы через requestPermission)
- `executeJavaScript` в dom-ready — СЛИШКОМ ПОЗДНО, мессенджер может вызвать Notification раньше
- `executeJavaScript('runDiagnostics()')` НЕ видит функции из preload (изолированный мир!) → использовать `webview.send()` + `ipcRenderer.on()` в preload

---

### ❌ Двойной звук уведомлений (мессенджер + наш)

**Симптом**: При новом сообщении в VK/WhatsApp играют два звука — один от мессенджера (`new Audio()`), второй наш (Web Audio API).

**Причина**: Мессенджеры используют `new Audio('notification.mp3')` для звука. Наш `playNotificationSound()` добавляет ещё один звук сверху.

**Решение (v0.27.0)**: Перехватить `Audio` конструктор в main world через `executeJavaScript()`, поставить `volume = 0`:
```js
var _A = window.Audio;
window.Audio = function(src) { var a = new _A(src); a.volume = 0; return a; };
```
Это глушит программные звуки мессенджера, оставляя только наш Web Audio API звук.

---

### ❌ executeJavaScript запускается ПОСЛЕ нативного Notification (race condition)

**Симптом**: Несмотря на перехват `window.Notification` через `executeJavaScript` в `dom-ready`, нативные уведомления с заголовком "electron.app.Electron" всё равно показываются. Мессенджер успевает вызвать `new Notification()` ДО выполнения нашего скрипта.

**Причина**: `dom-ready` не гарантирует, что наш `executeJavaScript` выполнится раньше скриптов мессенджера. VK может вызвать `new Notification()` во время загрузки или сразу после `DOMContentLoaded`.

**Решение v0.29.0 (НЕ ПОМОГЛО)**: `setPermissionRequestHandler` + `setPermissionCheckHandler` НЕ блокирует HTML5 `new Notification()` в WebView. Permissions проверяются только при `requestPermission()`, но VK создаёт `new Notification()` напрямую.

**Решение (v0.29.1)**: Ранняя `<script>` tag injection в `monitor.preload.js` при document_start — перехват `window.Notification` ДО скриптов мессенджера.

**Решение (v0.29.2)**: `app.setAppUserModelId('ЦентрЧатов')` — Windows берёт заголовок тостовых уведомлений из AppUserModelId, а НЕ из `app.setName()`. По умолчанию Electron ставит `"electron.app.Electron"` — именно это показывалось.

---

### ❌ Фантомные/старые уведомления при первом запуске мессенджера

**Симптом**: При открытии VK появляется уведомление о старом сообщении, которое было прочитано давно (например "Как ты Новый год встретил?"). Никто не писал новое сообщение.

**Причина (v0.29.0 НЕ помогло полностью)**: Два канала `handleNewMessage`:
1. `console-message` `__CC_NOTIF__` — заблокирован warm-up ✅
2. `ipc-message` `new-message` от MutationObserver — НЕ заблокирован! `lastActiveMessageText = null` при старте → первое найденное сообщение (даже старое) считается "новым" в Path 2 `sendUpdate`.

**Решение (v0.29.1)**: Тройная защита:
1. Warm-up `notifReadyRef` для ОБОИХ каналов (и `__CC_NOTIF__`, и `ipc-message new-message`) в App.jsx
2. Инициализация `lastActiveMessageText` текущим текстом DOM при `monitorReady = true` в monitor.preload.js
3. `monitorReady` 10 сек в monitor.preload.js (было и раньше)

---

### ❌ Уведомление/звук при чтении сообщения в активном чате

**Симптом**: Пользователь открывает непрочитанный чат в Telegram — приложение показывает Windows-уведомление и играет звук, хотя пользователь УЖЕ смотрит на этот чат.

**Причина**: `handleNewMessage` безусловно показывал уведомление и играл звук для ЛЮБОГО нового сообщения, не проверяя активна ли вкладка и в фокусе ли окно.

**Решение (v0.30.0)**: Проверка `document.hasFocus() && activeIdRef.current === messengerId` перед звуком и уведомлением.

**Проблема (v0.36.0)**: `document.hasFocus()` возвращает `false` когда фокус внутри WebView! В Electron, клик внутри `<webview>` передаёт фокус guest process — renderer `document` теряет фокус. Результат: уведомление показывается даже когда пользователь смотрит на чат.

**Решение (v0.36.0)**: Заменить `document.hasFocus()` на `!document.hidden` (Page Visibility API):
```js
const isViewingThisChat = !document.hidden && activeIdRef.current === messengerId
```
`document.hidden` = `false` когда окно видимо (не зависит от фокуса WebView). `true` только когда окно скрыто/минимизировано.

**Ключевой урок**: В Electron с WebView НЕ использовать `document.hasFocus()` — он ненадёжен. Использовать `!document.hidden` (Page Visibility API).

---

### ❌ app.setName() не меняет заголовок уведомлений на Windows

**Симптом**: Нативные Windows-уведомления показывают "electron.app.Electron" вместо "ЦентрЧатов", несмотря на `app.setName('ЦентрЧатов')`.

**Причина**: На Windows заголовок тостовых уведомлений (Toast Notification) берётся из **AppUserModelId**, а не из `app.name`. По умолчанию Electron устанавливает AppUserModelId = `"electron.app.Electron"`.

**Решение (v0.29.2)**: Вызвать `app.setAppUserModelId('ЦентрЧатов')` в самом начале main.js:
```js
app.setName('ЦентрЧатов')
if (process.platform === 'win32') {
  app.setAppUserModelId('ЦентрЧатов')
}
```

**Ключевой урок**: На Windows для уведомлений недостаточно `app.setName()` — обязательно нужен `app.setAppUserModelId()`.

---

### ❌ Уведомления MAX без текста и аватарки

**Симптом**: Уведомления от мессенджера MAX показывают только "Макс 15:05" без текста сообщения и без аватарки отправителя.

**Причина**: MAX (web.max.ru) — SvelteKit-приложение, использует `ServiceWorkerRegistration.prototype.showNotification()` вместо `new Notification()`. Наш перехват ловил только `new Notification()` через `window.Notification = function(...)`.

**Решение (v0.33.0)**: Добавлен перехват `ServiceWorkerRegistration.prototype.showNotification` в monitor.preload.js injection:
```js
var _show = ServiceWorkerRegistration.prototype.showNotification
ServiceWorkerRegistration.prototype.showNotification = function(title, opts) {
  console.log('__CC_NOTIF__' + JSON.stringify({
    t: title, b: opts?.body, i: opts?.icon || opts?.badge
  }))
  return Promise.resolve()
}
```

---

### ❌ Счётчик непрочитанных MAX показывает 3 вместо 1

**Симптом**: На вкладке MAX бейдж показывает 3, хотя в списке чатов только 1 непрочитанный.

**Причина**: Generic селекторы `[class*="badge"]`, `[class*="unread"]`, `[class*="counter"]` ловят ВСЕ бейджи на странице — не только в списке чатов, но и в навигации (иконка "Все" с бейджем, "Новые" с бейджем). 1+1+1=3.

**Решение (v0.33.2)**: Отдельная функция `countUnreadMAX()`:
1. **Primary**: title parsing `(N)` — MAX ставит число в title
2. **Fallback**: бейджи ТОЛЬКО внутри контейнера списка чатов (`[class*="ChatList"]`, `[role="list"]`)

**Урок**: Для новых мессенджеров НЕ использовать `[class*="badge"]` глобально — всегда ограничивать контейнером чатов.

---

### ❌ accountScript MAX не находит имя профиля (v0.37.0 — v0.38.2)

**Симптом**: Вкладка "Макс" показывает "MAX" (document.title) вместо имени профиля "Автолиберти".

**Цепочка проблем и решений (5 итераций)**:

**Проблема 1 — Данных нет в localStorage/IndexedDB/cookies:**
MAX (SvelteKit SPA) НЕ хранит имя/телефон профиля в localStorage. Ключи `__oneme_*` содержат только auth token, theme, device_id. IndexedDB пуст. Cookies пусты.

**Проблема 2 — Generic API endpoints не работают:**
`/api/me`, `/api/profile`, `/api/v1/me` — ВСЕ возвращают HTML-shell SPA (status 200, но body = `<!doctype html>...`). SvelteKit `__data.json` endpoints тоже возвращают HTML. MAX не использует server-side data loading.

**Проблема 3 — DOM-селекторы слишком generic:**
Имя/телефон видны ТОЛЬКО на странице Профиля, не на странице чатов. Generic CSS-селекторы (`[class*="profile"]`, `nav [class*="avatar"] + *`) не матчат Svelte-компоненты.

**Проблема 4 — Клик на "Профиль" через TreeWalker кликает SPAN, не BUTTON:**
Svelte-кнопка имеет структуру `<BUTTON class="button svelte-xwrwgf"><SPAN class="title">Профиль</SPAN></BUTTON>`. TreeWalker находит текст "Профиль" → parent = `<SPAN>` → `span.click()` НЕ триггерит Svelte `on:click|self` обработчик на BUTTON.

**Проблема 5 — async IIFE не резолвится в executeJavaScript:**
`executeJavaScript('(async () => { await ...; return "name" })()')` — промис НЕ резолвится с возвращённым значением. `result` приходит как `null`/`undefined`. Диагностический тест с тем же кодом работает, но accountScript — нет.

**Проблема 6 — Custom ID мессенджера:**
MAX добавлен пользователем как custom мессенджер (ID `custom_1772704264107`), а не как дефолтный (`id: 'max'`). `DEFAULT_MESSENGERS.find(m => m.id === messengerId)` → `undefined` → используется старый сохранённый accountScript (generic, возвращает `document.title` = "MAX"), а не новый из constants.js.

**Окончательное решение (v0.38.2)**:

1. **Матчинг по URL**: `tryExtractAccount` ищет дефолтный мессенджер не только по ID, но и по URL:
```js
const defaultM = DEFAULT_MESSENGERS.find(m => m.id === messengerId)
  || (messenger?.url && DEFAULT_MESSENGERS.find(m => m.url && messenger.url.startsWith(m.url)))
```

2. **Синхронный скрипт + console.log**: accountScript — sync IIFE (НЕ async). Фоновая задача через setTimeout кликает кнопку, читает DOM, отправляет через `console.log('__CC_ACCOUNT__'+name)`:
```js
(function() {
  var cached = localStorage.getItem('__cc_account_name');
  if (cached) return cached;  // sync return — для retry
  // Фоновая задача: click → wait → read → console.log
  setTimeout(() => {
    document.querySelector('.item.settings button').click();
    setTimeout(() => {
      var ni = document.querySelector('input[placeholder="Имя"]');
      if (ni) console.log('__CC_ACCOUNT__' + ni.value.trim());
      history.back();
    }, 3000);
  }, 500);
  return null;
})()
```

3. **console-message listener**: В App.jsx `console-message` handler ловит `__CC_ACCOUNT__` prefix и вызывает `setAccountInfo`.

4. **Blacklist в tryExtractAccount**: Фильтр `BL_ACCOUNT = /^(max|макс|telegram|whatsapp|...)$/i` отклоняет `document.title` как имя аккаунта.

5. **Реальные CSS-селекторы MAX** (из диагностики):
   - Кнопка профиля: `.item.settings button`
   - Имя: `input[placeholder="Имя"]` (value = "Автолиберти")
   - Телефон: `SPAN.phone` (+79126370333)
   - Карточка: `button.profile` (text = "Автолиберти +79126370333")

**Ключевые уроки:**
- `executeJavaScript` с async IIFE в Electron WebView НЕНАДЁЖЕН для return values — использовать `console.log` + `console-message` event
- Custom мессенджеры с URL дефолтного ДОЛЖНЫ получать дефолтный accountScript — матчить по URL, не только по ID
- Добавить blacklist для `document.title` в tryExtractAccount
- Для SvelteKit SPA: данные профиля только в DOM при навигации на страницу профиля, НЕ в storage/API
- Svelte `on:click` может не работать при клике на child element — кликать на САМИ BUTTON, не на span внутри

---

### ❌ Уведомления без аватарки (icon не передан в showNotification)

**Симптом**: Уведомления от MAX/VK приходят без аватарки отправителя.

**Причина**: Мессенджер не передаёт `icon`/`image`/`badge` URL в `Notification()` или `showNotification()`.

**Решение (v0.37.0)**: DOM fallback `findAvatar(name)` — ищет img-аватарку в списке чатов по имени отправителя. Работает в main world injection script.

**Урок**: Не все мессенджеры передают icon в Notification API. Нужен fallback: поиск аватарки в DOM по имени.

### ❌ Аватарки Telegram не загружаются в ribbon (downloadIcon без cookies)

**Симптом**: Telegram передаёт `opts.icon` URL в Notification API, но аватарка не появляется в ribbon — показывается emoji вместо фото.

**Причина**: `downloadIcon()` в main.js делает plain HTTP GET без cookies/session. Telegram требует авторизацию для загрузки аватарок → 403/302 → `resolve(null)` → emoji fallback.

**Решение (v0.48.0)**: Конвертировать аватарку в `data:` URL прямо в WebView (injection script). `toDataUrl(url, cb)` создаёт `Image` элемент с `crossOrigin='anonymous'`, рисует на canvas, получает `canvas.toDataURL('image/png')`. Так аватарка скачивается с cookies WebView сессии. Data URL передаётся через `__CC_NOTIF__` → `extra.iconDataUrl` → напрямую в ribbon HTML без скачивания в main process.

**Ключевой урок**: Ресурсы мессенджеров (аватарки, медиа) требуют cookies сессии. Скачивание из main process (без cookies) не работает. Конвертировать в data URL ВНУТРИ WebView — единственный надёжный подход.

---

### ❌ Ложное уведомление при "пометить непрочитанным" (v0.34.0)

**Симптом**: Пользователь помечает чат в MAX как непрочитанный → появляется уведомление "новое сообщение", хотя это старое сообщение.

**Причина**: MAX вызывает `Notification()` при пометке чата непрочитанным → наш перехват `__CC_NOTIF__` → `handleNewMessage()` → уведомление.

**Решение**: В `console-message` handler добавлен `if (document.hasFocus() && activeIdRef.current === messengerId) return` — если пользователь смотрит на этот мессенджер, уведомление подавляется.

---

### ❌ executeJavaScript() не видит функции из preload (v0.34.0)

**Симптом**: Кнопка "Диагностика DOM" в контекстном меню → ничего не происходит.

**Причина**: `webview.executeJavaScript('runDiagnostics()')` выполняется в main world, а `runDiagnostics` определена в preload isolated world (context isolation).

**Решение**: Использовать IPC — `webview.send('run-diagnostics')` в App.jsx + `ipcRenderer.on('run-diagnostics', ...)` в monitor.preload.js.

**Урок**: Для вызова preload-функций из renderer — ТОЛЬКО через IPC (`webview.send()` + `ipcRenderer.on()`), НЕ через `executeJavaScript()`.

---

### ❌ Уведомления не приходят при свёрнутом окне (v0.35.0)

**Симптом**: Приложение свёрнуто в трей → приходит сообщение в мессенджер → уведомление НЕ появляется. При развороте окна — уведомление появляется мгновенно.

**Причина**: Electron по умолчанию включает `backgroundThrottling` для renderer process и WebView. Когда окно скрыто (`mainWindow.hide()`):
- JS в renderer замедляется/приостанавливается
- MutationObserver в WebView не срабатывает
- Notification hooks не ловят события
- IPC сообщения от WebView не отправляются
- При развороте — всё "просыпается" и уведомления приходят разом

**Решение (v0.35.0)**: Отключить `backgroundThrottling` в трёх местах:
```js
// 1. main.js — webPreferences BrowserWindow
webPreferences: { backgroundThrottling: false, ... }

// 2. main.js — runtime override
mainWindow.webContents.backgroundThrottling = false

// 3. App.jsx — каждый <webview>
<webview webpreferences="backgroundThrottling=no" ... />
```

**Минус**: Немного выше потребление CPU в фоне (WebView продолжают работать). Но для мессенджер-приложения это обязательно — уведомления важнее экономии CPU.

**Ключевой урок**: Для приложений с уведомлениями/мониторингом `backgroundThrottling: false` — обязательная настройка. Без неё WebView замораживаются при скрытии окна.

### ❌ Ribbon не появляется при свёрнутом (minimized) окне (v0.39.3→v0.39.4)

**Симптом**: Сообщения приходят в мессенджер при свёрнутом окне, но ribbon-уведомление НЕ появляется.

**Причина**: `backgroundThrottling: false` спасает от throttling при `hide()`, но при `minimize()` на Windows ОС может замораживать renderer-процесс на уровне ОС. В результате:
- WebView получает сообщение от сервера
- `console-message` DOM event на `<webview>` НЕ dispatched в renderer
- IPC `app:custom-notify` никогда не отправляется в main
- Main process не знает о сообщении → ribbon не создаётся

**Решение (v0.39.4)**: Backup notification path в main process:
```js
// main.js — app.on('web-contents-created')
// Слушаем console-message НАПРЯМУЮ на webContents webview гостей
// Main process никогда не throttled!
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return
  contents.setBackgroundThrottling(false) // belt & suspenders
  contents.on('console-message', (_e, _level, msg) => {
    if (!msg.startsWith('__CC_NOTIF__')) return
    // Только при свёрнутом mainWindow
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) return
    // Показываем уведомление напрямую
    showCustomNotification(...)
  })
})
```
+ Дедупликация в `showCustomNotification` — защита от двойных уведомлений.

**Ключевой урок**: `backgroundThrottling: false` недостаточно на Windows при minimize. Для критичных событий нужен backup path через main process (`contents.on('console-message')` на webContents).

---

### ❌ CSP блокирует `<script>` tag injection в MAX/SvelteKit (v0.39.5→v0.39.6)

**Симптом**: Диагностика показывает `"notifHooked": false` — перехват `window.Notification` не работает в MAX. Уведомления не приходят.

**Причина**: MAX (web.max.ru) — SvelteKit-приложение с Content Security Policy (CSP), которая запрещает inline `<script>` теги. Наш monitor.preload.js создаёт `<script>` тег с `textContent` и добавляет в DOM — CSP блокирует выполнение этого скрипта в main world.

**Что НЕ работает**:
- `document.createElement('script')` + `s.textContent = '...'` + `document.head.appendChild(s)` — CSP блокирует inline scripts
- CSP `nonce` — мы не знаем nonce страницы
- `<script src="...">` — нужен внешний файл, CSP может блокировать неизвестные src

**Решение (v0.39.6)**: `executeJavaScript()` fallback в App.jsx dom-ready handler:
```js
// executeJavaScript работает через DevTools protocol — обходит CSP!
setTimeout(() => {
  el.executeJavaScript(`
    if (!window.__cc_notif_hooked) {
      window.__cc_notif_hooked = true;
      // ... notification hook + Audio mute + findAvatar
      console.log('__CC_NOTIF_HOOK_OK__');
    }
  `).then(() => { ... }).catch(() => {})
}, 1500)
```

**Ключевые уроки**:
- `<script>` tag injection работает для большинства мессенджеров, но CSP может заблокировать — нужен fallback
- `executeJavaScript()` обходит CSP через DevTools protocol (V8 evaluate, не DOM)
- Диагностика `notifHooked` (`window.__cc_notif_hooked`) — ключевой индикатор проблемы
- Для надёжности: сначала `<script>` в preload (document_start, максимально рано), потом `executeJavaScript` fallback (1.5 сек после dom-ready)

---

### ❌ Уведомления от MAX не приходят вообще (v0.39.4→v0.39.5)

**Симптом**: Сообщения приходят в MAX, но ribbon-уведомления не показываются ни при свёрнутом, ни при развёрнутом окне.

**Причины** (3 точки отказа одновременно):
1. **`isViewingThisTab` подавлял `__CC_NOTIF__`** — когда вкладка MAX активна, `if (!document.hidden && activeIdRef.current === messengerId) return` блокировал все Notification API уведомления. А MAX может не вызывать Notification API когда вкладка неактивна.
2. **MutationObserver `new-message` не доходил до main process** — `ipcRenderer.sendToHost()` создаёт событие только в renderer process. При свёрнутом окне renderer throttled → событие не dispatched.
3. **Backup path работал только при свёрнутом** — `if (mainWindow.isVisible() && !mainWindow.isMinimized()) return` отсекал все уведомления при развёрнутом окне.

**Решение (v0.39.5)**:
- Убрано `isViewingThisTab` для `__CC_NOTIF__` path — если Notification API вызван, это подтверждённое уведомление
- Добавлен `__CC_MSG__` канал: `console.log('__CC_MSG__' + text)` в monitor.preload.js параллельно с `sendToHost('new-message')` — main process может перехватить через `contents.on('console-message')`
- Backup path расширен для `__CC_MSG__` и работает всегда (дедупликация предотвращает дубли)
- Renderer также обрабатывает `__CC_MSG__` из console-message

**Ключевой урок**: Для надёжных уведомлений нужно НЕСКОЛЬКО параллельных путей доставки. Один путь (`sendToHost`) зависит от renderer, второй (`console.log`) доступен main process напрямую. Дедупликация в `showCustomNotification` предотвращает дубли.

---

### ❌ Закрытие вкладки мессенджера без подтверждения

```js
// ОШИБКА — мгновенное удаление без предупреждения
onClose={() => removeMessenger(m.id)}
```

**Симптом**: Случайный клик по × или Ctrl+W мгновенно удаляет вкладку, сбрасывая сессию авторизации. Пользователю приходится заново логиниться (QR-код, пароль).

**Решение** (v0.31.0): Промежуточная функция `askRemoveMessenger(id)` → показывает модальный диалог подтверждения. Кнопка «Отмена» (autoFocus) и красная кнопка «Закрыть». Применено к: кнопке ×, Ctrl+W, контекстному меню «Закрыть вкладку».

---

### ❌ require('electron') в renderer или WebView preload

```js
// ОШИБКА — не работает в renderer-процессе
const { ipcRenderer } = require('electron')
```

**Решение**: использовать `window.api` через contextBridge. Для WebView preload — `ipcRenderer.sendToHost`.

---

### ❌ Одна сессия на все мессенджеры

```jsx
// ОШИБКА — все мессенджеры будут делить cookies
<webview src="https://web.telegram.org/" />
<webview src="https://web.whatsapp.com/" />
```

**Решение**: каждому мессенджеру уникальный `partition`:

```jsx
<webview src="https://web.telegram.org/" partition="persist:telegram" />
<webview src="https://web.whatsapp.com/" partition="persist:whatsapp" />
```

---

### ❌ MutationObserver на неправильном элементе

Наблюдать за `document.body` — дорого. Мессенджеры рендерят только видимую область.

**Решение**: наблюдать за контейнером сообщений конкретного чата, а не за всем body. Найти правильный корневой элемент чата.

---

### ❌ executeJavaScript с пользовательским вводом напрямую

```js
// УЯЗВИМОСТЬ XSS/инъекция
webContents.executeJavaScript(`fillInput("${userText}")`)
```

**Решение**: всегда использовать `JSON.stringify`:

```js
webContents.executeJavaScript(`fillInput(${JSON.stringify(userText)})`)
```

---

## Настройки (SettingsPanel)

### ❌ Дублирование настроек ИИ в SettingsPanel и AISidebar

**Симптом**: Пользователь видит настройки ИИ-провайдера/модели/ключа в двух местах: в SettingsPanel (⚙️ в шапке) и в AISidebar (⚙️ на панели ИИ). Путаница — какие настройки актуальны.

**Причина**: Секция "ИИ-помощник" в SettingsPanel была добавлена в v0.6.0, а расширенные per-provider настройки — в AISidebar позже (v0.9-v0.12). SettingsPanel перестала быть нужна для ИИ.

**Решение (v0.25.0)**: Убрать секцию "ИИ-помощник" из SettingsPanel. Настройки ИИ — только в AISidebar.

---

## AI-панель (AISidebar)

### ❌ Тело чата/WebView видно одновременно с конфиг-панелью

Когда `showConfig === true`, тело чата (варианты ответов + поле ввода) или WebView всё равно рендерятся под панелью настроек. Это визуально ломает UX — пользователь видит и настройки, и чат одновременно.

**Симптом**: При открытой ⚙️-панели внизу виден пузырёк чата и/или поле "Вставьте сообщение клиента...".

**Решение**: Добавить `!showConfig` в условие рендера тела:
```jsx
{providerMode === 'api' && !showConfig && (
  <>
    {/* тело чата + поле ввода */}
  </>
)}
{providerMode === 'webview' && !showConfig && (
  <div> {/* WebView + нижняя панель */} </div>
)}
```

---

### ❌ Устаревший текст в info-баннерах настроек

Если добавляется новый способ подключения (например, Веб-интерфейс), не забыть обновить info-баннеры в конфиг-панели. Иначе пользователь видит противоречивую информацию.

**Пример**: баннер писал "Войти через email/пароль невозможно — только API-ключ", хотя уже существует режим Веб-интерфейс.

**Решение**: В API-режиме упоминать о существовании альтернативы (Веб-интерфейс). В WebView-режиме — объяснять что API-ключ не нужен.

---

## ИИ-интеграция

### ❌ Авто-проверка провайдеров при монтировании использует stale settings

При реализации авто-проверки в `useEffect(fn, [])` — зависимостей нет, поэтому `settings` захвачены из closure на момент монтировании. Если settings ещё не загрузились (async), проверка будет без ключей.

**Решение**: запускать с задержкой `setTimeout(startupCheck, 2000)` — давая приложению время загрузить настройки из electron-store. Очистка таймера при unmount обязательна.

---

### ❌ Хардкодированный текст ошибки скрывает реальную причину сбоя API

Кнопка "Проверить соединение" при любой ошибке показывала `'✗ Ошибка — проверьте ключ'`, даже если ключ правильный, но деньги на балансе кончились. Пользователь видел неверный диагноз и менял рабочий ключ.

**Причина**: текст кнопки хардкодирован, а блок `{error && <div>⚠️ {error}</div>}` находился в теле чата, которое скрыто при открытых настройках (`!showConfig`).

**Решение**: в настройках после кнопки testConnection добавлен отдельный блок ошибки:
```jsx
{testStatus === 'fail' && error && (
  <div className="mt-1.5 text-[10px] px-2 py-1.5 rounded-lg"
    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
    ⚠️ {error}
  </div>
)}
```
Текст кнопки при ошибке — нейтральный `'✗ Ошибка'`, детали — в блоке ниже.

---

### ❌ API-ключ в renderer

```js
// ОШИБКА — ключ виден через DevTools
const response = await fetch('https://api.openai.com/...', {
  headers: { Authorization: `Bearer ${window.apiKey}` }
})
```

**Решение**: все запросы к ИИ только через IPC → main → внешний API.

---

### ❌ Отправлять весь DOM WebView в ИИ

Мессенджеры генерируют огромный DOM. Отправка всего содержимого — дорого и медленно.

**Решение**: извлекать только текст сообщений и метаданные (отправитель, время, имя чата).

---

## Авто-ответ

### ❌ Отвечать на собственные сообщения

Бот будет отвечать сам себе в бесконечном цикле.

**Решение**: в ChatMonitor помечать исходящие сообщения, AutoReplyService игнорировать их.

---

### ❌ Отвечать мгновенно

Мгновенные ответы выглядят роботизированно и могут вызвать бан.

**Решение**: всегда добавлять случайную задержку 2–8 секунд перед отправкой.

---

## Electron

### ❌ nodeIntegration: true в WebView

```js
// ОПАСНО — WebView получает полный доступ к Node.js
new BrowserView({ webPreferences: { nodeIntegration: true } })
```

**Решение**: `nodeIntegration: false`, `contextIsolation: true` — всегда.

---

### ❌ Хранить настройки в переменных — потеря при перезапуске

**Решение**: использовать `electron-store`, сохранять сразу при изменении.

---

### ❌ Зум WebView не сохраняется между сессиями

**Симптом**: Пользователь выставил 150% для Telegram, перезапустил приложение — зум сбросился в 100%.

**Причина**: `zoomLevels` хранился только в React-state, который сбрасывается при каждом перезапуске.

**Решение**: Сохранять `zoomLevels: { [messengerId]: number }` в settings через `settings:save`, загружать при старте:
```js
// Загрузка:
if (s.zoomLevels) { setZoomLevels(s.zoomLevels); zoomLevelsRef.current = s.zoomLevels }
// Сохранение (debounce 800ms в changeZoom):
const updated = { ...settingsRef.current, zoomLevels: next }
window.api.invoke('settings:save', updated).catch(() => {})
```

---

### ❌ Удаление отображения accountInfo из вкладки → пользователь теряет имя профиля (v0.38.0)

**Симптом**: Имя аккаунта Telegram/MAX/VK пропало из вкладки. Пользователь не видит какой профиль активен.

**Причина (v0.33.1)**: По запросу убрали accountInfo из видимого текста вкладки, оставив только в tooltip. Но accountInfo = единственный способ отличить аккаунты, поэтому пользователь вернул запрос.

**Решение (v0.38.0)**: accountInfo отображается под названием мессенджера всегда. messagePreview временно заменяет его на 5 сек при новом сообщении:
```jsx
{messagePreview ? (
  <span style={{ color: m.color }}>💬 {messagePreview}</span>
) : accountInfo ? (
  <span style={{ color: 'var(--cc-text-dimmer)' }} className="opacity-60">{accountInfo}</span>
) : null}
```

**Урок**: Информация о профиле — критически важна. Не удалять без чёткой замены.

---

### ❌ 🟡 Нельзя выводить «объект удалён» из его отсутствия в `store.chats` (список неполный) — теряются данные (v1.2.139→v1.2.140)

**Симптом**: локальное закрепление чата (📌, хранится в `localStorage`) могло молча и НАВСЕГДА пропасть — закреплённый чат «терял» отметку сам по себе, особенно после перезапуска.

**Причина (корень)**: пробная авто-чистка «осиротевших» закреплений `prunePinnedIds` (v1.2.139) удаляла `chat.id` из списка закреплений, если чата НЕТ в `store.chats`, а его аккаунт «загружен» (есть хоть один чат аккаунта). Ошибка предпосылки: **`store.chats` часто НЕПОЛНЫЙ**:
- на старте `loadCachedChats` кладёт лишь ПОДМНОЖЕСТВО из кэша ([nativeStore.js:216](../../src/native/store/nativeStore.js));
- `tg:chats` с `append=false` **ЗАМЕНЯЕТ** все чаты аккаунта пришедшей порцией ([nativeStoreIpc.js:143-156](../../src/native/store/nativeStoreIpc.js)) — старые, не попавшие в порцию, выпадают из state;
- чаты вообще грузятся прогрессивно.

Значит живой чат легко отсутствует в `store.chats` в моменте, а `useEffect(..., [store.chats])` срабатывает на КАЖДОЕ изменение списка (react.dev «Synchronizing with Effects») → удаление сохранялось в `localStorage` уже на первой неполной порции (MDN Web Storage: `setItem` пишет синхронно и постоянно). **«Нет в списке» ≠ «удалён».**

**Решение (v1.2.140)**: авто-чистку убрали полностью (`prunePinnedIds` удалён, эффект удалён). Осиротевшие пины безвредны — `sortWithPinnedFirst`/`isPinnedId` их просто не находят среди существующих чатов, счётчик секции их не считает. Хранилище растёт незаметно.

**Урок (общий)**: состояние, ВЫВОДИМОЕ из in-memory коллекции, которую IPC наполняет порциями/заменами, нельзя ПЕРСИСТИТЬ как необратимое удаление. Удалять постоянные пользовательские данные можно только по ЯВНОМУ событию (здесь нужно явное «чат удалён/покинут» от TDLib), а не по факту «сейчас не вижу». Безопасная чистка — отдельная задача [[code-todo]] TODO-21. Родственная запись про stale-данные из неполного стора — mass-ack markRead в [[native-scroll-unread]].

---

### ❌ 🟡 Удаление TDLib-аккаунта не стирало папку сессии → аккаунт-призрак воскресал при старте (v1.2.145)

**Симптом**: удалил Telegram-аккаунт (native) — но в фильтре чатов остался призрак `tg_pending_<ts> (0)` (0 чатов), особенно заметный после перезапуска.

**Причина (корень)**: папка сессии на диске названа ИМЕНЕМ СОЗДАНИЯ аккаунта — `tdlib-sessions/<accountSubdir>` (`clientFactory`, [tdlibRuntime.js:74-75](../../main/native/backends/tdlibRuntime.js)): при логине это `tg_pending_<ts>`, у давних аккаунтов — `pending`. После входа аккаунт переименовывается В ПАМЯТИ (`tg_pending_X → tg_<userId>`, `_renameAccount` в [tdlibClient.js](../../main/native/backends/tdlibClient.js)), но папка на диске НЕ переименовывается (TDLib держит файлы открытыми — так и задумано). `removeAccount` удалял папку по ТЕКУЩЕМУ id (`tg_<userId>`) → её нет → реальная папка `tg_pending_<ts>` оставалась → при старте `autoRestoreSessionsFromDisk` восстанавливал её как отдельный аккаунт-призрак (разлогинен на сервере → `getMe` не проходит → остаётся как `tg_pending_<ts>`). Лог-доказательство: при удалении `files=0`, `filesRemoved=false`; при старте `auto-restored sessions: pending, tg_pending_<ts>`.

**Решение (v1.2.145)**: в `removeAccount` ([tdlibBackend.js](../../main/native/backends/tdlibBackend.js)) реальное имя папки берётся из `manager.accounts.get(accountId).params.accountSubdir` (сохранено при создании, не меняется при переименовании; fallback на `accountId`), захват ДО `manager.removeAccount`. Используется и для `scanAccountSessionStats`, и для `removeAccountSessionFiles`.

**Урок**: если объект на диске назван по «сырому/временному» id, а в памяти его переименовали — при удалении/поиске файлов используй ИСХОДНОЕ имя (храни его), а не текущее. И НЕ делай авто-очистку осиротевших папок «по отсутствию финализации» вслепую: рабочий аккаунт с папкой `pending` при разовом сбое сети тоже не финализируется — сотрёшь живую сессию. Остаток: `account:renamed` не мостится на экран (может дать призрак и без перезапуска), лишний `tg-cache-<id>.json` не чистится — [[code-todo]] TODO-23.

---

### ❌ 🔴 «Чёрный экран» после ручного добавления аккаунта: залипший `loginFlow=success` держит экран входа (v1.2.147)

**Симптом**: добавил 2-й Telegram-аккаунт (native) → чёрный/пустой экран, чатов нет (обоих аккаунтов). ПЕРЕЗАПУСК «лечил». Похоже на потерю данных или крэш — а на деле ни то, ни другое.

**Причина (корень)**: после успешного входа TDLib шлёт `authorizationStateReady` → мост → `tg:login-step {step:'success'}` → `store.loginFlow = {step:'success'}` и НЕ сбрасывается (сброс был только в `cancelLogin`). Правило `showLoginScreen = showLogin || !!store.loginFlow` ([NativeApp.jsx](../../src/native/NativeApp.jsx)) при залипшем `success` держало пустой экран входа ПОВЕРХ чатов. `LoginModal` на `success` только закрывал окно (`setShowLogin(false)`), но `loginFlow` не чистил.

**Почему перезапуск «лечил» (важно для диагностики)**: при старте `Ready` для авто-восстановленного аккаунта приходит ДО того, как renderer начинает слушать `tg:login-step` (скрипты грузятся ~5-6с, а auth Ready ~0.7с) → `loginFlow` не выставляется. Поэтому баг ловится ТОЛЬКО при ручном добавлении (когда renderer уже слушает), а ручное добавление всегда «2-е+» (первый аккаунт авто-восстанавливается). Отсюда обманчивое «пропадают все чаты при 2-м аккаунте».

**Как диагностировали**: в `chatcenter.log` НЕТ `[ErrorBoundary]` (не крэш — «аварийная табличка» v1.2.143 молчит) + нет снимка `[acct-store] sidebar` после добавления (список не рисуется) + сообщения БНК идут (данные целы) + тёмный прямоугольник по центру скриншота = карточка `LoginModal`. Вывод: экран входа застрял, а не данные пропали.

**Решение (v1.2.147)**: (1) чистая `shouldShowLoginScreen` ([shared/loginScreenGate.js](../../shared/loginScreenGate.js)) — `step==='success'` НЕ держит экран входа; (2) `onClose` окна входа зовёт `store.resetLoginFlow()` (сброс без отмены на сервере).

**Урок**: состояние-«флаг процесса» (идёт вход/загрузка/…) ОБЯЗАНО иметь явный сброс в терминальном состоянии (success), а не только в «отмене». Гейт показа не должен держаться на «есть хоть какой-то flow» — терминальный success = «готово», а не «ещё идёт». И: симптом «чёрный экран» ≠ крэш — сначала проверь, не застряло ли что-то поверх (по отсутствию `[ErrorBoundary]` + по тому, что данные в сторе живы).

---

### ❌ 🟡 `No handler registered for 'X'` в логе после добавления НОВОГО IPC-канала = main-процесс не перезапущен (v1.2.233)

**Симптом**: добавили новый IPC-канал (например `tg:get-contact-info` для «Карточки контакта») + окно в renderer, которое его зовёт. В dev-режиме окно ПОЯВЛЯЕТСЯ (renderer подхватился), но данные из канала не приходят, а в `chatcenter.log` — `[ERROR] Error occurred in handler for 'tg:get-contact-info': Error: No handler registered for 'tg:get-contact-info'`. Выглядит как баг регистрации канала.

**Причина (корень)**: приложение из двух процессов. **Renderer** (окна, React) в dev горячо перезагружается Vite'ом — новый компонент виден сразу. **Main** (где регистрируются `ipcMain.handle(...)`, в т.ч. `tg:*` через [tdlibIpcHandlers.js](../../main/native/tdlibIpcHandlers.js)) в dev НЕ перезагружается на лету — только при полном перезапуске процесса (остановить и заново запустить терминал/`npm run dev`). Пока main не перезапущен, renderer зовёт канал, которого в старом main ещё нет → Electron кидает `No handler registered`.

**Как отличить от настоящего бага регистрации**: проверь, что `handle('X', ...)` РЕАЛЬНО стоит внутри `initTdlibIpcHandlers` и `handle`→`ipcMain.handle` (было верно в v1.2.233: строка регистрации на месте, helper корректен) → значит код цел, дело в перезапуске. Настоящий баг регистрации выглядел бы одинаково И после полного перезапуска.

**Решение**: полный перезапуск приложения (не reload окна). Профилактика регрессий: тест «канал зарегистрирован» — `expect(ipcMain.handlers.has('tg:get-contact-info')).toBe(true)` в [tdlibIpcHandlers.vitest.js](../../src/__tests__/tdlibIpcHandlers.vitest.js) (v1.2.233). Тесты, которые лишь мокают `invoke`, этот класс НЕ ловят — нужен именно тест на наличие обработчика.

**Урок**: правки main-процесса (IPC-обработчики, backend) требуют ПОЛНОГО перезапуска — renderer-hot-reload их не подхватывает. Первый вопрос при `No handler registered` в dev: «а main перезапускали?». Связано с [[feedback_user_runs_dev_terminal]] (пользователь запускает из терминала).

---
