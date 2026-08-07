# Архив решений — ADR-015 … ADR-022

Вынесено из decisions.md в v1.2.212 (2026-08-07, лимит 100 КБ). Темы: лог-путь ЦентрЧатов, multi-account Telegram, dock/pin позиционирование, вид карточки уведомления («Стопка»/фото/терминальное состояние), имя автора в превью списка чатов.

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

