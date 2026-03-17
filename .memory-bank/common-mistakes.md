# Типичные ошибки — ChatCenter

## 🟡 ВАЖНОЕ: Двойной звук — 4 пути воспроизведения без дедупликации

**Симптом**: При получении сообщения играются два звука с разницей ~1 секунда. Оба от нашей программы (не от мессенджера — его Audio подавлен).

**Причина**: В App.jsx есть **4 независимых места** вызова `playNotificationSound()`:
1. `__CC_NOTIF__` handler (основной, через Notification API перехват)
2. `messenger:badge` IPC (от ChatMonitor badge update)
3. `page-title-updated` event (unread count в заголовке WebView)
4. `unread-count` IPC (от monitor preload)

Когда приходит сообщение, `__CC_NOTIF__` срабатывает первым (синхронно из console-message). Через ~0.5-1сек WebView обновляет title/badge → срабатывает второй path → второй звук.

**ПРАВИЛО**: Все пути воспроизведения звука ДОЛЖНЫ проверять `lastSoundTsRef` — если для этого мессенджера звук уже играл <3сек назад → пропускать.

**Решение (v0.62.5)**: `lastSoundTsRef = useRef({})` — `{[messengerId]: timestamp}`. Все 4 места проверяют `Date.now() - lastSoundTsRef.current[id] > 3000` перед воспроизведением.

---

## 🔴 КРИТИЧЕСКОЕ: toDataUrl зависание в executeJavaScript injection

### ❌ console.log внутри toDataUrl callback → Pipeline пуст, нет звука/ribbon

**Симптом**: Лог WebView показывает "ПОКАЗАНО" (intercepted), но Pipeline в App.jsx пуст. Нет звука, нет ribbon. Пользователь видит сообщение в Логе, но уведомления нет.

**Причина**: В `executeJavaScript` injection (fallback когда CSP блокирует `<script>` tag из preload), `console.log('__CC_NOTIF__'+...)` был завёрнут в `toDataUrl(enriched.icon, callback)`. Функция `toDataUrl` создаёт `new Image()` с `crossOrigin='anonymous'` для конвертации аватарки в data URL. Если загрузка зависала (CORS, timeout, сетевая ошибка) → callback НЕ вызывался → `console.log` НЕ выполнялся → `console-message` event НЕ приходил в App.jsx.

**Почему Лог показывал "ПОКАЗАНО"**: `_logNotif('passed', ...)` вызывался ДО `toDataUrl`, а `console.log` — ВНУТРИ callback. Лог и console.log были разделены асинхронной операцией.

**ПРАВИЛО**: НИКОГДА не оборачивать `console.log('__CC_NOTIF__'+...)` в асинхронные операции (Image loading, fetch, timers). Отправляй СИНХРОННО, как в preload версии.

**Решение (v0.57.0)**: Удалён `toDataUrl`, `console.log` вызывается напрямую с `enriched.icon` (HTTP URL или пустая строка). App.jsx обрабатывает оба формата.

---

## 🔴 КРИТИЧЕСКОЕ: IPC new-message handler БЕЗ спам-фильтра

### ❌ Timestamp "18:22" прошёл через `new-message` IPC → ribbon

**Симптом**: При получении сообщения в MAX показывается ribbon с текстом "18:22" (timestamp), а реальное сообщение ("Ааа") не показывается вообще.

**Причина 1**: IPC `new-message` handler в App.jsx НЕ имел спам-фильтра. `__CC_MSG__` handler имел, `__CC_NOTIF__` handler имел, но IPC `new-message` — нет. Timestamp "18:22" приходил из Path 2 `sendUpdate` → `getLastMessageText('max')` → `[class*="message"]:last-child [class*="text"]` возвращал timestamp.

**Причина 2**: `getLastMessageText` для MAX не фильтровал timestamps. Селектор `[class*="message"]:last-child [class*="text"]` матчит элементы с timestamp'ами.

**Причина 3**: `quickNewMsgCheck` пропускал реальные сообщения в MAX — addedNodes содержали контейнеры с >40 children (SvelteKit рендерит большими блоками).

**Решение (v0.56.1)**:
1. Спам-фильтр в IPC `new-message` handler + per-messenger regex + senderCache fallback
2. Timestamp-фильтр в Path 2 `sendUpdate` и в `getLastMessageText`
3. Deep scan в `quickNewMsgCheck` — для nodes 40-200 children ищет leaf-текстовые элементы
4. `extractMsgText()` — отдельная функция с очисткой embedded timestamps ("Ааа18:22" → "Ааа")

**Ключевой урок**: ВСЕ handler'ы входящих сообщений ДОЛЖНЫ иметь спам-фильтр. Новый handler без фильтра = timestamp/system text пройдёт как сообщение. SvelteKit-мессенджеры (MAX) обновляют DOM большими блоками — нужен deep scan, не только проверка addedNodes напрямую.

---

## 🟡 ВАЖНОЕ: mark-read не работает при свёрнутом окне (Chromium background throttling)

**Симптом**: Нажал "Прочитано" в ribbon при свёрнутом окне — не помечает. Открыл окно — помечает.

**Причина**: Chromium throttles WebView в свёрнутом окне. `executeJavaScript()` выполняется и возвращает `ok=true`, но DOM-клик НЕ обрабатывается мессенджером до восстановления окна.

**ЛОВУШКА**: `document.hidden` в Electron renderer = `false` даже при минимизированном окне! Нельзя использовать `document.hidden` для определения свёрнутого окна.

**ПРАВИЛО**: Проверять `mainWindow.isMinimized()` в main.js (не в renderer). Если свёрнуто → невидимо восстановить (`setOpacity(0)` + `restore()`), выполнить mark-read, через 1.2сек свернуть обратно (`minimize()` + `setOpacity(1)`).

**Решение (v0.62.7)**: main.js `notif:mark-read` handler → `isMinimized()` check → invisible restore/minimize cycle.

---

## 🟡 ВАЖНОЕ: MAX sidebar DOM ≠ Telegram — нет .chatlist-chat, нет .peer-title

**Симптом**: `mark-read` для MAX всегда возвращает `ok=false method=notFound titles=0`. Все 12 CSS-селекторов + TreeWalker не находят чаты в sidebar.

**Причина**: MAX (SvelteKit) использует `<nav class="navigation svelte-xxx">` с 51 child-элементами. Нет `.chatlist-chat`, нет `.peer-title`, нет `[class*="chatlist"]`. Все generic-селекторы от Telegram возвращают 0.

**Почему enrichment работал**: `__CC_NOTIF__` берёт имя из Notification API `data.t` (DOM не нужен). `__CC_MSG__` DOM enrichment использует **topbar** (`.topbar .headerWrapper`), не sidebar.

**ПРАВИЛО**: Для MAX mark-read использовать `<nav>` + `a[href]` ссылки внутри навигации. Каждый чат = ссылка. Поиск по textContent.indexOf(senderName). НЕ использовать `.chatlist-chat`, `.peer-title` и generic Telegram-селекторы.

**Решение (v0.62.4)**: Полностью переписан MAX-блок в `buildChatNavigateScript`: nav→a[href] exact/icase/partial → all a[href] → TreeWalker → scroll fallback.

---

## 🟡 ВАЖНОЕ: Стэковая группировка — ghost-items и cleanupStack

**Контекст**: В v0.63.0 группировка ribbon переделана: вместо отдельной карточки-группы, сообщения складываются как строки в существующую карточку (хост).

**Ловушка 1**: Дочерние сообщения (`isStackChild: true`) хранятся в `items` Map, но НЕ имеют своего DOM-элемента. Их `el` указывает на хост. НЕ вызывать DOM-операции (remove, offsetHeight и т.д.) на ghost-items — это удалит хост!

**Ловушка 2**: При dismiss хоста ОБЯЗАТЕЛЬНО вызывать `cleanupStack(messengerId)` — иначе ghost-items останутся в Map и будут считаться активными, блокируя новые уведомления.

**Ловушка 3**: `stacks` Map хранит `messengerId → { hostId, childIds }`. При появлении ПЕРВОГО сообщения создаётся запись в stacks. Если хост удалён — запись удаляется в cleanupStack. Следующее сообщение создаст новую карточку и новый стэк.

**ПРАВИЛО**: Всегда проверять `item.isStackChild` перед DOM-операциями в dismissItem и forceRemoveItem.

**Ловушка 4 (v0.63.1)**: НЕ дублировать имя отправителя в стэкнутых строках. Имя уже показано в хост-карточке (`.sender`). В стэке показывать ТОЛЬКО текст сообщения (`.stacked-body`).

**Ловушка 5 (v0.63.2)**: FIFO в main.js (`notifItems`) имел лимит 6 — при 7+ сообщениях хост удалялся из массива. `markRead(hostId)` не находил item → mark-read не выполнялся. **ПРАВИЛО**: FIFO лимит `notifItems` должен быть значительно больше MAX_ITEMS (сейчас 30), т.к. стэк может содержать 10+ сообщений на одну карточку.

**Ловушка 6 (v0.63.3)**: Тултип в ribbon — НЕ использовать `title` атрибут (некрасивый, с задержкой). Использовать кастомный `position: fixed` div. Показывать ТОЛЬКО если `scrollWidth > clientWidth` (текст реально обрезан). CSS-класс `.cc-tooltip` (не `.tooltip` — может конфликтовать).

**Ловушка 7 (v0.63.4)**: Кликабельный тултип (`pointer-events` включены) конфликтует с hover-логикой dismiss-таймера. Решение: при уходе мыши с тултипа — проверять `e.relatedTarget`, не скрывать если вернулся на текстовый элемент. Debounce 300мс через `setTimeout` — обязательно `clearTimeout` при каждом `mouseout`, иначе старый тултип появится на новом месте.

**Ловушка 8 (v0.63.5)**: `overflow: visible` + `overflow-y: auto` = горизонтальный скролл! Когда задаёшь `overflow-y: auto`, браузер автоматически меняет `overflow-x: visible` → `overflow-x: auto`. Для длинных слов без пробелов (тарабарщина, URL, хэши) это создаёт горизонтальный скроллбар. **ПРАВИЛО**: всегда явно задавать `overflow-x: hidden` + `word-break: break-word` если нужен только вертикальный скролл.

**Ловушка 9 (v0.63.6→v0.63.9)**: ~~Тултип стэка vs одиночный тултип~~ — ОТМЕНЕНО в v0.63.9. Теперь каждый элемент показывает СВОЙ тултип. НЕ использовать приоритет `.stack-container` — пользователь хочет видеть конкретное сообщение, а не превью всего стэка.

**Ловушка 12 (v0.63.9)**: Тултип обрезается окном notification (position:fixed, window ограничен по высоте). **ПРАВИЛО**: После рендера тултипа проверять `neededTop < 0`. Если не помещается — увеличить окно через `notifApi.resize(calcHeight() + extraHeight)`. Хранить `tooltipExtraHeight` и восстанавливать в `hideTooltip*()` через `reportHeight()`.

**Ловушка 13 (v0.63.9→v0.64.0)**: `scrollWidth > clientWidth` не работает для `.msg-text-content` span с inline `overflow:hidden` — scrollWidth === clientWidth потому что overflow скрыт. **ПРАВИЛО**: Для `.body-text` с `data-full` — НЕ проверять scrollWidth. Сравнивать `data-full.length > data-short.length`. Для остальных — проверять scrollWidth на видимом span.

**Ловушка 29 (v0.72.0)**: MAX отправляет notification при РЕДАКТИРОВАНИИ сообщения — body содержит "09:26 ред." (timestamp + "ред."). Это НЕ новое сообщение, а маркер редактирования. Также `extractMsgText()` может вернуть "ред." как текст последнего DOM-элемента. **ПРАВИЛО**: Все фильтры в `monitor.preload.js` (`isSpamNotif`, `extractMsgText`, `getLastMessageText`) должны проверять regex `/^(\d{1,2}:\d{2}\s*)?ред\.?\s*$/i` и `/^edited\.?\s*$/i` — отбрасывать как спам/пустой текст.

**Ловушка 28 (v0.71.8)**: `position: fixed; bottom: 0` на dock-wrapper БЕЗ `min-height: 100vh` на body ломает `-webkit-app-region: drag` — Electron не рассчитывает hit-testing для fixed-элементов за пределами body. `moveTop()` по таймеру вызывает моргание окна. **ПРАВИЛО**: Для frameless transparent окон с drag: ОБЯЗАТЕЛЬНО `min-height: 100vh` + `flex/justify-content: flex-end` (не `position: fixed`). НЕ использовать `moveTop()` по интервалу — только `setAlwaysOnTop` при blur. Для `user-select: text` на элементах внутри drag-зоны — добавлять `-webkit-app-region: no-drag` на конкретный элемент.

**Ловушка 27 (v0.71.7)**: `setIgnoreMouseEvents(true, { forward: true })` БЛОКИРУЕТ `-webkit-app-region: drag`! Окно становится click-through, но drag через app-region перестаёт работать. **ПРАВИЛО**: Для transparent frameless окон НЕ использовать `setIgnoreMouseEvents`. Вместо этого: CSS `position: fixed; bottom: 0` (или left/top) на видимом контенте + БЕЗ `min-height: 100vh` на html/body. Electron transparent окна автоматически пропускают клики через пиксели с alpha=0. Элементы без min-height/flex-grow не создают "painted" пикселей в пустых областях. Также: `moveTop()` каждые N секунд вместо `setAlwaysOnTop` в каждом событии — меньше дёрганья.

**Ловушка 26 (v0.71.6)**: `setAlwaysOnTop(true, 'screen-saver', 1)` + реассерт при blur НЕ ДОСТАТОЧЕН для Windows 11 таскбара. Таскбар Windows имеет специальный z-order и агрессивно перекрывает even screen-saver level окна. **ПРАВИЛО**: Для окон которые ОБЯЗАНЫ быть поверх Windows таскбара — использовать `setInterval(1000ms)` с `setAlwaysOnTop() + moveTop()`. Периодический `moveTop()` принудительно поднимает окно. Не забыть `clearInterval` при закрытии окна.

**Ловушка 25 (v0.71.4)**: Frameless transparent BrowserWindow с предвыделенной прозрачной зоной (DOCK_PREVIEW_RESERVE) перехватывает клики к нижележащим окнам и Windows таскбару — пользователь думает что dock часть таскбара. **ПРАВИЛО**: Для transparent frameless окон с большой прозрачной зоной ОБЯЗАТЕЛЬНО использовать `setIgnoreMouseEvents(true, { forward: true })`. Переключать на `setIgnoreMouseEvents(false)` через IPC при mouseenter на видимые элементы (dock bar, контекстное меню), обратно при mouseleave. Задержка 50ms на mouseleave чтобы не мигало при переходе между элементами.

**Ловушка 24 (v0.71.3)**: Контекстное меню в dock НЕ показывалось — окно dock имеет высоту `dockBaseHeight + DOCK_PREVIEW_RESERVE (150px)`, а меню ~280px. `position: fixed` в body всё равно обрезается BrowserWindow. **ПРАВИЛО**: Для всплывающих элементов, превышающих размер frameless BrowserWindow, НУЖНО временно расширять окно через IPC (`dock:ctx-menu-space`). При закрытии меню — восстанавливать размер. Нельзя полагаться на `position: fixed` — оно НЕ выходит за границы BrowserWindow.

**Ловушка 23 (v0.71.1)**: Контекстное меню внутри элемента с `position: relative` обрезается границами BrowserWindow, если окно меньше меню. **ПРАВИЛО**: Всплывающие меню, тултипы с интерактивностью (`pointer-events: auto`) рендерить в `document.body` с `position: fixed`, НЕ внутри элемента-триггера. Позиционировать через `getBoundingClientRect()` триггера. Также ВСЕГДА проверять выход за границы экрана (top < 0 → показать снизу, left + width > innerWidth → сместить влево).

**Ловушка 22 (v0.71.0)**: `pin:go-to-chat` передавал ТОЛЬКО `messengerId` без `senderName` → App.jsx переключал вкладку мессенджера, но НЕ навигировал к конкретному чату (потому что `buildChatNavigateScript` требует `senderName` или `chatTag`). **ПРАВИЛО**: При передаче `notify:clicked` ВСЕГДА включать `senderName` (и `chatTag` если есть). Без них навигация = только переключение вкладки. Проверять: `mainWindow.webContents.send('notify:clicked', { messengerId, senderName, chatTag })`.

**Ловушка 21 (v0.70.0)**: Изменение `border-width` при `.active` состоянии (`1px → 2px`) вызывает layout shift — кнопка становится на 2px больше, карточка растёт, окно BrowserWindow не успевает подстроиться → появляются скроллбары. **ПРАВИЛО**: Для визуального выделения `.active` состояния НИКОГДА не менять `border-width`, `padding`, `margin` — они влияют на layout. Использовать `box-shadow: inset 0 0 0 1px ...` или `outline` — они НЕ влияют на размеры элемента. Также ВСЕГДА добавлять `overflow: hidden` на `html` и `body` во frameless окнах.

**Ловушка 20 (v0.68.0)**: Dock остаётся видимым после удаления всех задач. `removePin()` вызывает `removeFromDock()` только если `item.inDock=true`, но dock мог быть показан ранее (через showDockEmpty). **ПРАВИЛО**: После КАЖДОГО удаления pin (removePin, pinWin.on('closed')) — вызывать `checkDockVisibility()` которая проверяет: есть ли хоть один `item.inDock=true` в `pinItems`? Если нет и `showDockEmpty=false` → `dockWin.hide()`.

**Ловушка 19 (v0.67.1)**: Дубль иконки при наличии HTML-label + JS-текста. Если в HTML уже есть `<span class="timer-label">⏰</span>`, не добавлять ⏰ в JS при `timerRemaining.textContent = '\u23F0 ' + min + ':'...`. **ПРАВИЛО**: Декоративные иконки (⏰, 📌 и т.д.) размещать ТОЛЬКО в одном месте — либо в HTML label, либо в JS текст. Не дублировать.

**Ловушка 18 (v0.66.1)**: `\uXXXX` и `\u{XXXXX}` — это **JavaScript** Unicode escape-последовательности. Они НЕ работают в HTML text content и атрибутах. HTML показывает их буквально как текст. **ПРАВИЛО**: В HTML-разметке (вне `<script>`) использовать ТОЛЬКО реальные UTF-8 символы (📌, ⏰, ×) или HTML entities (`&#x1F4CC;`). JS Unicode escapes допустимы ТОЛЬКО внутри `<script>` блоков.

**Ловушка 17 (v0.65.0)**: `bText.textContent = fullText` в expandedByDefault удаляет ВСЕ дочерние элементы (`.msg-time`, `.pin-msg-btn`) и заменяет текстовым узлом. **ПРАВИЛО**: Вместо `el.textContent = text` обновлять конкретный span: `el.querySelector('.msg-text-content').textContent = text`. Если span не найден — fallback на textContent.

**Ловушка 16 (v0.64.3)**: CSS-правило `.stacked-body span` перебивает `.msg-time` по specificity (0,3,1 > 0,1,0). Стэковые `.msg-time` становятся яркими 0.8, а host `.msg-time` остаётся 0.3. **ПРАВИЛО**: При стилизации `span`-потомков ВСЕГДА исключать `.msg-time` через `:not(.msg-time)`, чтобы время оставалось единообразным.

**Ловушка 15 (v0.64.2)**: Цвет `.stacked-body` не обновляется при expanded. CSS `.notif-item.expanded .body-text` повышает `color` до `0.8`, но `.stacked-body` — отдельный класс, не потомок `.body-text`. **ПРАВИЛО**: При изменении стилей expanded для host-сообщения — ВСЕГДА проверить что аналогичные стили применяются и к `.stacked-body` и его `span`-потомкам.

**Ловушка 14 (v0.64.0)**: Inline стили (из JS `el.style.cssText = '...'`) имеют приоритет над CSS-классами. В expanded mode `.msg-text-content` имеет inline `white-space:nowrap; overflow:hidden` → CSS `.notif-item.expanded .body-text .msg-text-content { white-space: pre-wrap }` НЕ работает. **ПРАВИЛО**: Использовать `!important` в CSS expanded для перебития inline стилей.

**Ловушка 10 (v0.63.8)**: Тултип закрывается при попытке навести на иконку копирования. Причина: mouseout из текстового элемента → `hideTooltipFade()` срабатывает ДО того как мышь дойдёт до тултипа. **ПРАВИЛО**: НЕ скрывать тултип мгновенно при mouseout. Использовать `scheduleHide()` с задержкой 100мс + `cancelHide()` при mouseover на `.cc-tooltip`. Проверять `:hover` перед скрытием.

**Ловушка 11 (v0.63.8)**: `body-text` с flex (время + текст) ломает expanded mode. При expand `white-space: pre-wrap` не работает с `display: flex`. **ПРАВИЛО**: `.notif-item.expanded .body-text` должен иметь `display: block !important`, а `.msg-text-content` внутри — `white-space: pre-wrap; overflow: visible`.

---

## 🔴 КРИТИЧЕСКОЕ: Startup ribbon — уведомления при запуске для старых сообщений

### ❌ page-title-updated и unread-count не проверяют warm-up + 10 сек недостаточно

**Симптом**: При запуске приложения показываются ribbon уведомления для старых непрочитанных сообщений из всех мессенджеров. WhatsApp кидает `new Notification()` при загрузке для всех непрочитанных.

**Причина 1 (v0.48.1)**: `page-title-updated` и `unread-count` хендлеры не проверяли `notifReadyRef` warm-up. При запуске счётчик 0→N → fallback ribbon.

**Причина 2 (v0.49.0)**: Warm-up 10 сек недостаточно. WhatsApp загружается 15-30+ секунд и кидает `new Notification()` для всех непрочитанных ПОСЛЕ warm-up. Уведомление "Кезин Евгений АндреевичЗагрузка..." — это WhatsApp показывает контакт при загрузке.

**Решение**:
- v0.48.1: Добавлена проверка `notifReadyRef` в `page-title-updated` и `unread-count`
- v0.49.0: Warm-up увеличен до 30 сек (и в App.jsx, и в main.js backup path)

**Ключевой урок**: Warm-up должен быть >= 30 сек. Мессенджеры (особенно WhatsApp) загружаются медленно и кидают Notification для СТАРЫХ непрочитанных при загрузке. 10 сек категорически недостаточно.

---

## 🟡 ВАЖНОЕ: «Перейти к чату» — навигация не работает

### ❌ buildChatNavigateScript не находит элементы / не возвращает результат

**Симптом**: Кнопка "Перейти к чату" на ribbon просто открывает окно мессенджера, но не переходит к конкретному чату.

**Причины**:
1. Fallback ribbon (`page-title-updated`/`unread-count`) не передаёт `senderName`/`chatTag` → навигация невозможна (только `setActiveId`).
2. Задержка 350ms слишком маленькая — WebView может не успеть отрисовать sidebar после `setActiveId`.
3. `buildChatNavigateScript` не возвращал результат → нельзя понять, нашёл ли элемент.
4. Для MAX использовались generic селекторы вместо Telegram-like (MAX — форк Telegram Web K).

**Решение (v0.49.0)**:
- Все скрипты в `buildChatNavigateScript` возвращают `true/false`.
- Retry: до 3 попыток с задержкой 1.2 сек если элемент не найден.
- Задержка первой попытки увеличена до 600ms.
- MAX: добавлены `.chatlist-chat .peer-title` селекторы (как у Telegram).
- WhatsApp: добавлен fuzzy match по `startsWith` для обрезанных имён.
- Логирование `[GoChat]` для отладки.

**Ключевой урок**: executeJavaScript в WebView для поиска DOM-элементов — хрупкий подход. Нужны retry и логирование. Селекторы должны быть проверены для каждого мессенджера отдельно.

---

## 🟡 ВАЖНОЕ: MAX — ribbon без имени отправителя и аватарки

### ❌ MAX НЕ вызывает showNotification для каждого сообщения (особенно в фоне)

**Симптом**: Ribbon уведомление от MAX показывает "Макс" вместо имени отправителя. Нет аватарки. Лог уведомлений пуст. Работает только когда пользователь переключился на вкладку MAX.

**Причина 1**: MAX не всегда вызывает `ServiceWorkerRegistration.showNotification()`. Уведомления приходят через `quickNewMsgCheck` (MutationObserver addedNodes → `__CC_MSG__`), который передаёт только текст без sender/avatar.

**Причина 2**: `enrichNotif()` + `findSenderInChatlist(body)` работают только внутри override showNotification в main world. Путь `__CC_MSG__` эти функции не вызывает. Лог `__cc_notif_log` тоже заполняется только из override.

**Причина 3**: Когда title = "Макс" (совпадает с `_appTitles`), `enrichNotif` ищет sender в chatlist по body.slice(0,30). Но chatlist preview может не содержать текст нового сообщения (если DOM ещё не обновился).

**Решение (v0.54.0)**:
- `getActiveChatSender()` + `getActiveChatAvatar()` в monitor.preload.js — извлекают имя и аватарку из заголовка АКТИВНОГО чата (`.chat-info .peer-title`, `.topbar img.avatar-photo`).
- `quickNewMsgCheck` эмиттит `__CC_NOTIF__` с enriched данными вместо голого `__CC_MSG__`.
- Backup: App.jsx `__CC_MSG__` handler обогащает через `executeJavaScript` и пишет в `__cc_notif_log`.
- `new-message` IPC ждёт 500мс — приоритет enriched `__CC_NOTIF__`.

**Ключевой урок**: Нельзя полагаться на `showNotification` override как единственный источник уведомлений. Некоторые мессенджеры (MAX) не вызывают Notification API вообще. `addedNodes` detection — необходимый fallback, который тоже должен обогащать данные отправителя.

**Диагностика (v0.55.0)**: Pipeline Trace Logger — трассирует каждый шаг: source → spam → dedup → handle → viewing → sound → ribbon. Если лог показывает "ПОКАЗАНО" а ribbon не появился — смотреть trace на предмет `viewing:БЛОК` (isViewingThisTab=true) или `dedup:БЛОК` (обработан раньше другим путём).

---

## 🟡 ВАЖНОЕ: VK — ribbon для своих исходящих, статусов online, "N непрочитанных"

### ❌ VK шлёт Notification для ВСЕХ событий, включая свои сообщения и статусы

**Симптом**: Ribbon показывает: "Красотка моя, довольна?" (ваше исходящее), "минуту назад" (статус online), "2 непрочитанных сообщений" (бесполезный fallback). Нет имени отправителя — показывает "ВКонтакте".

**Причины**:
1. VK вызывает `new Notification()` для СВОИХ исходящих сообщений (без разделения входящие/исходящие).
2. VK шлёт Notification для статусов online ("минуту назад", "только что", "был в сети").
3. Fallback ribbon "N непрочитанных" из `page-title-updated`/`unread-count` — бесполезный текст без имени.
4. VK передаёт title = "ВКонтакте" → `enrichNotif` ловит regex, но `findSenderInChatlist` использовал только `.chatlist-chat` (Telegram), а не VK-селекторы.

**Решение (v0.51.0)**:
- `isSpamNotif(body)` — regex-фильтр: статусы online, счётчики непрочитанных, "печатает", "набирает".
- `_outgoing` regex — фильтр исходящих по "Вы: " / "You: " в начале body.
- Fallback ribbon "N непрочитанных" ОТКЛЮЧЁН — `__CC_NOTIF__` покрывает все настоящие сообщения.
- `findSenderInChatlist` расширен: VK generic селекторы `[class*="dialog"]`, `[class*="conversation"]`, `[class*="title"]`, `[class*="name"]`.
- `_findAvatarInEl` — вспомогательная функция для аватарок (img, canvas, background-image).
- Фильтры добавлены в 3 места: injection script, `__CC_NOTIF__` handler (App.jsx), backup path (main.js).

**Ключевой урок**: Мессенджеры (VK, MAX) используют Notification API не только для входящих. Нужна обязательная фильтрация body: исходящие ("Вы:"), статусы, системные тексты.

---

## 🔴 КРИТИЧЕСКОЕ: requestAnimationFrame НЕ работает в hidden BrowserWindow

### ❌ Использование rAF в notification window

**Симптом**: Ribbon уведомления показываются только при первой загрузке, потом перестают появляться навсегда.

**Причина**: `reportHeight()` в notification.html использовал двойной `requestAnimationFrame` для стабильного layout. Но Chromium НЕ вызывает rAF для hidden/invisible окон. После dismiss всех уведомлений → `notifWin.hide()` → rAF больше никогда не выполняется → `notif:resize` не приходит → `showInactive()` не вызывается → окно навсегда скрыто.

**Решение (v0.47.2)**: Заменить rAF на `setTimeout(60ms)`. Также main.js показывает `showInactive()` ДО отправки `notif:show`, чтобы layout гарантированно работал.

**Ключевой урок**: В Electron BrowserWindow с `show: false` или после `hide()` — НИКОГДА не использовать `requestAnimationFrame`. Использовать `setTimeout`.

---

## 🔴 КРИТИЧЕСКОЕ: Ложные ribbon при навигации между чатами

### ❌ getLastMessageText срабатывает на СТАРЫЕ сообщения при смене чата

**Симптом**: При переключении на другой чат в Telegram появляется ribbon уведомление для старого (уже прочитанного) сообщения.

**Причина**: Path 2 в `sendUpdate()` (monitor.preload.js) — `getLastMessageText(type)` находит последнее видимое сообщение в DOM. При навигации к ДРУГОМУ чату: DOM обновляется → MutationObserver → `sendUpdate()` → `getLastMessageText` находит текст из нового чата → отличается от `lastActiveMessageText` → считается "новым" → `new-message` IPC → ribbon.

**Решение (v0.47.2)**: Path 2 отключён для Telegram (`type !== 'telegram'`). У Telegram хорошо работает `__CC_NOTIF__` (перехват Notification API) + unread count. Path 2 нужен только для мессенджеров где unread count не растёт при открытом чате (MAX, WhatsApp, VK).

**Ключевой урок**: `getLastMessageText` — ненадёжный детектор новых сообщений. Он не различает "новое сообщение в текущем чате" и "старое сообщение в другом чате, на который переключились". Для мессенджеров с работающим Notification API (Telegram) — использовать `__CC_NOTIF__`, не Path 2.

---

## 🔴 КРИТИЧЕСКОЕ: Глобальные настройки ломают отдельные мессенджеры

### ❌ Одни настройки на все мессенджеры = "чиним одно, ломается другое"

**Симптом**: Изменения для одного мессенджера (MAX) ломают уведомления для других (Telegram, VK).

**Причина**: До v0.47.0 все настройки уведомлений были глобальные: `soundEnabled`, `notificationsEnabled`, `mutedMessengers`. Фикс для MAX (addedNodes, fallback ribbon) влиял на ВСЕ мессенджеры.

**Решение (v0.47.0)**: Per-messenger настройки: `messengerNotifs: { [id]: { sound: bool, ribbon: bool } }`. Каждый мессенджер управляется отдельно. Глобальные настройки = fallback. UI: два toggle (Звук + Ribbon) на каждый мессенджер в SettingsPanel.

**Ключевой урок**: Настройки уведомлений ВСЕГДА должны быть per-messenger. Глобальные — только как default/fallback.

---

## 🔴 КРИТИЧЕСКОЕ: Ribbon только для первого сообщения (повторные — только звук)

### ❌ Мессенджеры не вызывают `new Notification()` для каждого нового сообщения

**Симптом**: При получении нескольких сообщений подряд (в MAX и др.) ribbon показывается только для первого, остальные — только звук.

**Причина**: Ribbon создаётся ТОЛЬКО через `handleNewMessage()`, который вызывается из `__CC_NOTIF__` (перехват Notification API) и `new-message` (MutationObserver IPC). Многие мессенджеры (MAX, VK, WhatsApp) группируют уведомления и не вызывают `new Notification()` для каждого отдельного сообщения. При этом `page-title-updated` и `unread-count` хендлеры играют звук при росте счётчика, но НЕ создают ribbon.

**4 пути уведомлений**:
1. `__CC_NOTIF__` → `handleNewMessage()` → ribbon + звук ✅
2. `new-message` IPC → `handleNewMessage()` → ribbon + звук ✅
3. `page-title-updated` → звук ⚠️ (ribbon НЕ создавался)
4. `unread-count` IPC → звук ⚠️ (ribbon НЕ создавался)

**Решение (v0.46.2)** — НЕПОЛНОЕ, не работает для MAX:
1. Добавить `lastRibbonTsRef = useRef({})` — `{ [messengerId]: timestamp }` последнего показа ribbon
2. В `handleNewMessage` перед `app:custom-notify` записывать `lastRibbonTsRef.current[messengerId] = Date.now()`
3. В `page-title-updated` и `unread-count` хендлерах: если `Date.now() - lastRibbonTs > 3000` → создавать fallback ribbon

**Почему v0.46.2 НЕ помогло для MAX**: Когда чат ОТКРЫТ в WebView → MAX считает сообщения прочитанными → unread count = 0 → НЕ растёт → `page-title-updated` не имеет `(N)` в title → `unread-count` IPC = 0 → fallback ribbon никогда не срабатывает. Звук шёл от самого MAX (AudioContext, не `new Audio()`).

**Решение (v0.46.3)** — addedNodes detection:
1. `quickNewMsgCheck()` в MutationObserver — анализирует `mutation.addedNodes` напрямую
2. При появлении нового DOM-элемента с текстом (2-500 символов) → `new-message` IPC
3. Фильтрация: пропускаются BUTTON/INPUT/SVG/IMG, элементы >40 children, timestamps, служебные тексты
4. Cooldown 3 сек + dedup по тексту + `isViewingThisTab` в App.jsx
5. Работает для MAX, WhatsApp, VK. Telegram исключён (работает через `__CC_NOTIF__`)

**Ключевой урок**: Нельзя полагаться на unread count для ribbon — когда чат открыт в WebView, count не растёт. Нужен прямой мониторинг DOM mutations (addedNodes).

---

## 🔴 КРИТИЧЕСКОЕ: Enrichment addedNodes — timing + селекторы + dedup race

### ❌ getActiveChatSender() не находит заголовок чата в MAX

**Симптом**: `__CC_NOTIF__` от preload приходит с `t=""` (пустой sender), enrichment из `__CC_MSG__` тоже возвращает `sender="нет"`. Но showNotification override через `enrichNotif` → `findSenderInChatlist` находит sender корректно.

**Причина 1**: Селекторы `.chat-info .peer-title, .topbar .peer-title` не соответствуют DOM MAX (SvelteKit). MAX может использовать другие классы для header чата.

**Причина 2 (timing)**: `quickNewMsgCheck` (addedNodes) срабатывает мгновенно — chatlist preview ещё НЕ обновлён. `findSenderInChatlist` ищет `bodySlice` в `.chatlist-chat textContent` → не находит, потому что chatlist обновляется позже.

**Причина 3 (dedup race)**: Если preload эмиттит `__CC_NOTIF__` с `t=""`, этот пустой NOTIF регистрируется в `notifDedupRef`. Через 43мс приходит enriched NOTIF из showNotification с `t="Имя"` → дедуплицируется.

**Решение (v0.55.1)**:
1. `quickNewMsgCheck` эмиттит `__CC_MSG__` (не `__CC_NOTIF__`) — не конкурирует с enriched showNotification
2. 8 вариантов header-селекторов (`.peer-title`, `[class*="title"]`, `[class*="name"]`, `header [class*="title"]` и др.)
3. Fallback: active/selected чат в sidebar (`.chatlist-chat.active`, `[class*="chat"][class*="active"]`)
4. Задержка 150мс перед enrichment — chatlist успевает обновиться
5. Спам-фильтр для "Ожидание сети..." и системных текстов MAX во ВСЕХ 4 фильтрах

**Ключевой урок**: addedNodes detection МГНОВЕННАЯ, а chatlist preview обновляется ПОЗЖЕ. Нужна задержка enrichment и fallback по active chat (а не по тексту). Preload должен эмиттить `__CC_MSG__` (не `__CC_NOTIF__`), чтобы не блокировать enriched showNotification через dedup.

---

## 🔴 КРИТИЧЕСКОЕ: ribbonExpandedByDefault ломает показ ribbon-уведомлений

### ❌ overflow:hidden на .notif-item + таймер при expandedByDefault + порядок авто-раскрытия

**Симптом**: При включении настройки "Кнопки действий сразу" (ribbonExpandedByDefault) ribbon-уведомления перестают показываться полностью.

**Причина 1**: `overflow: hidden` на `.notif-item` обрезал expanded-контент, который выходил за min-height (76px).

**Причина 2**: Таймер dismiss запускался ДАЖЕ при `expandedByDefault` → уведомление авто-удалялось через dismissMs.

**Причина 3**: Авто-раскрытие (`el.classList.add('expanded')`) происходило ДО настройки таймера → `items.set()` записывал `expanded: false`, хотя уведомление уже было раскрыто.

**Причина 4**: Начальная высота окна 76px — слишком мала для expanded ribbon (~120px+). `notif:resize` IPC не успевал увеличить окно.

**Решение (v0.46.1)**:
1. Убрать `overflow: hidden` с `.notif-item`
2. При `expandedByDefault` — НЕ запускать таймер, поставить `progress.style.animationPlayState = 'paused'`
3. Код авто-раскрытия (`if (data.expandedByDefault)`) перенести ПОСЛЕ настройки таймера и mouseenter/mouseleave
4. Начальная высота окна 300px (а не 76px)

**Ключевой урок**: При expandedByDefault нужно пауза таймера С ПЕРВОЙ секунды, и авто-раскрытие ПОСЛЕ полной настройки таймера.

### ❌ CSS `display: none/flex` не анимируется

**Симптом**: `.action-row { display: none }` → `.expanded .action-row { display: flex }` — переключение мгновенное, без анимации.

**Причина**: CSS свойство `display` не поддерживает transition.

**Решение**: Заменить на `max-height: 0` + `overflow: hidden` + `opacity: 0` → `max-height: 60px` + `opacity: 1` с `transition: max-height 200ms, opacity 200ms`.

**Ключевой урок**: Для анимации показа/скрытия блока использовать max-height transition, НЕ display toggle.

---

## 🔴 КРИТИЧЕСКОЕ: Подсчёт непрочитанных в Telegram Web K

### ❌ Суммирование бейджей отдельных чатов (querySelectorAll + persistent Map)

**Симптом**: Счётчик показывает 1796 вместо правильных 26. Telegram "Все чаты" пишет 26 — это верно.

**Причина 1 (v0.7–v0.19)**: `querySelectorAll('.badge')` считает только видимые диалоги (~20 шт.) → скачки при скролле (594 → 1435 → 2918).

**Причина 2 (v0.20.0, persistent Map)**: Map суммирует бейджи КАЖДОГО чата (каналы: 9.4K + 3.4K + 2.3K + ...) → выдаёт тысячи. Telegram же считает "Все чаты" = число ЧАТОВ с непрочитанными, а НЕ сумму всех сообщений.

**Решение (v0.22.0)**: НЕ суммировать бейджи чатов. Читать ГОТОВЫЙ счётчик Telegram:
1. `document.title.match(/\((\d+)\)/)` — `(26) Telegram Web`
2. Первый бейдж в folder tab (`.tabs-tab .badge` и др.)
3. **Адаптивный поиск**: `.badge` НЕ внутри `.chatlist-chat` = folder tab badges
4. Fallback: сумма chatlist badges

**Ключевой урок**: Число на folder tab "Все чаты" ≠ сумма бейджей чатов!

### ❌ Жёсткие CSS-селекторы для folder tabs Telegram

**Симптом**: `.tabs-tab` не находит элементы → бейдж = 0.

**Причина**: Telegram Web K имеет разные layout'ы folder tabs (горизонтальный, вертикальный), с разными CSS-классами.

**Решение (v0.22.0)**: Адаптивный поиск с несколькими селекторами + диагностический IPC `monitor-diag` для отладки. При неизвестном layout'е — `.badge` элементы НЕ внутри chatlist = folder badges.

**Решение (v0.23.0)**: `page-title-updated` event на WebView — ловит `(N)` из `document.title` мгновенно, без MutationObserver и без CSS-селекторов.

### ❌ MutationObserver не ловит изменение document.title

**Симптом**: `document.title` содержит `(26) Telegram Web`, но `countUnreadTelegram()` возвращает 0.

**Причина**: MutationObserver наблюдает `document.body`, а `<title>` находится в `<head>`. Изменение title НЕ триггерит observer → `sendUpdate()` не вызывается при обновлении title.

**Решение (v0.23.0)**: `el.addEventListener('page-title-updated', ...)` в renderer — встроенное событие Electron WebView, срабатывает мгновенно при изменении title. Не зависит от MutationObserver.

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

## Кастомные уведомления (v0.39.0)

### Потенциальные ошибки при работе с Notification BrowserWindow

**1. `transparent: true` на Windows требует осторожности:**
- Windows 11 поддерживает transparent BrowserWindow, но `backgroundColor` должен быть `#00000000`
- Без `frame: false` прозрачность НЕ работает
- HTML body тоже должен иметь `background: transparent`

**2. `focusable: false` + клики:**
- `focusable: false` предотвращает кражу фокуса при `showInactive()`
- НО окно всё равно кликабельно — `setIgnoreMouseEvents(false)` по умолчанию
- Если поставить `setIgnoreMouseEvents(true)` — клики будут проходить СКВОЗЬ окно

**3. Путь к notification.html в production:**
- В dev: `path.join(__dirname, '../../main/notification.html')` (от out/main/)
- В prod: зависит от структуры сборки — `notification.html` должен быть включён в `build.files` в package.json или скопирован при сборке
- Если файл не найден — `loadFile()` молча покажет пустое окно

**4. `screen` API доступен ТОЛЬКО после `app.whenReady()`:**
- `const { screen } = require('electron')` — OK на уровне модуля
- НО `screen.getPrimaryDisplay()` вернёт ошибку если вызван до `app.whenReady()`
- NotificationManager создаёт окно лениво (при первом уведомлении) — к тому моменту app уже ready

**5. Resize BrowserWindow на Windows — не плавный:**
- `setBounds()` с `animate: true` работает ТОЛЬКО на macOS
- На Windows: мгновенное изменение, может мелькать
- Решение: использовать CSS-анимацию ВНУТРИ окна, а `setBounds` вызывать по IPC `notif:resize` когда HTML сообщает нужную высоту

---

## 🔴 isViewingThisChat подавляет ВСЕ уведомления на активной вкладке (v0.39.0)

### ❌ messengerId ≠ конкретный чат

**Симптом (v0.39.0)**: Пользователь на вкладке VK, приходит сообщение от другого чата VK — ни звука, ни ribbon. `messagePreview` появляется, но sound и notification пропущены.

**Причина**: `isViewingThisChat = !document.hidden && activeIdRef.current === messengerId` подавляло и звук, и ribbon. Но `messengerId` — это ID вкладки (например `"vk"`), а НЕ ID конкретного чата. Оператор на VK-вкладке мог быть в совершенно другом чате.

**Решение (v0.39.1)**: Убрать `!isViewingThisChat` из условий звука и уведомления. Подавление остаётся только по `messengerMuted` и глобальным настройкам.

```js
// БЫЛО (v0.39.0):
if (soundEnabled && !messengerMuted && !isViewingThisChat) playNotificationSound()
if (notificationsEnabled && !messengerMuted && !isViewingThisChat) { ... }

// СТАЛО (v0.39.1):
if (soundEnabled && !messengerMuted) playNotificationSound()
if (notificationsEnabled && !messengerMuted) { ... }
```

**Ключевой урок**: В ChatCenter `messengerId` — это ID WebView-вкладки, а не конкретного чата внутри мессенджера. Нельзя использовать его для определения "пользователь смотрит на этот чат".

---

## 🟡 Прозрачность BrowserWindow на Windows (v0.39.0 → v0.39.1)

### ❌ transparent: true недостаточно без backgroundColor

**Симптом**: Notification window с `transparent: true` показывает чёрный фон вместо прозрачного на Windows.

**Причина**: На Windows `transparent: true` НЕ гарантирует прозрачность без явного `backgroundColor: '#00000000'`.

**Решение**: Всегда добавлять `backgroundColor: '#00000000'` к `transparent: true`:
```js
new BrowserWindow({
  transparent: true,
  backgroundColor: '#00000000',
  // ...
})
```

**Ключевой урок**: На Windows для прозрачного BrowserWindow ОБЯЗАТЕЛЬНО `transparent: true` + `backgroundColor: '#00000000'`.

---

## 🔴 Фантомные уведомления от MAX (v0.39.0 — v0.39.1)

### ❌ __CC_NOTIF__ с пустым body от ServiceWorker

**Симптом**: Уведомление "Макс 11:28" появляется хотя никто не писал. MAX-мессенджер отправляет фантомное уведомление.

**Причина**: MAX (web.max.ru) через ServiceWorker вызывает `showNotification("Макс", {body: ""})` — это push-sync или status-уведомление. Наш перехват ловит его и отправляет `__CC_NOTIF__` с `{t: "Макс", b: ""}`. В App.jsx код использовал `data.b || data.t || ''` — пустой body фолбечил на title "Макс", который обрабатывался как "новое сообщение".

**Решение (v0.39.2)**: Требовать непустой `data.b`:
```js
// БЫЛО:
const text = data.b || data.t || ''  // пустой body → берёт title "Макс"

// СТАЛО:
const text = (data.b || '').trim()   // пустой body → пустой text → skip
```

**Ключевой урок**: Notification API используется мессенджерами не только для сообщений, но и для push-sync, status, reconnect. Фильтровать по непустому body — обязательное условие. Title без body = системное уведомление, не сообщение.

---

## 🔴 Фантомные уведомления VK при переключении чатов (v0.39.1 — v0.39.2)

### ❌ MutationObserver + убранный isViewingThisChat = ложные срабатывания

**Симптом**: При переключении чатов в VK появляется ribbon-уведомление с текстом последнего сообщения из нового чата. Никто не писал.

**Причина**: В v0.39.1 убрали `isViewingThisChat` из `handleNewMessage` чтобы ribbon показывался всегда. Но MutationObserver (Path 2 в monitor.preload.js) при ЛЮБОМ изменении DOM (смена чата, прокрутка) вызывает `getLastMessageText()`. Если текст отличается от предыдущего → `new-message` IPC → `handleNewMessage` без подавления → ложное уведомление.

**Решение (v0.39.3 → v0.41.0 → v0.41.1)**: Двойная защита:

**1. App.jsx (renderer)**: Подавлять ВСЕ уведомления когда пользователь смотрит на эту вкладку:
```js
const isViewingThisTab = !document.hidden && activeIdRef.current === messengerId
if (isViewingThisTab) return
```

**2. main.js (backup path)**: Backup path работает ТОЛЬКО при свёрнутом/скрытом окне:
```js
if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized() && mainWindow.isVisible()) return
```

**Почему v0.41.0 не помог**: Исправление в App.jsx подавляло `handleNewMessage`, но тот же `console-message` event ловил **backup path в main.js** напрямую → вызывал `showCustomNotification` минуя `handleNewMessage`. Два listener на один event!

**Ключевой урок**: `console-message` от WebView обрабатывается в ДВУХ местах (renderer + main process). Подавление в одном месте бесполезно если другое место дублирует. Backup path должен работать ТОЛЬКО когда renderer не может обработать (окно свёрнуто/скрыто).

---

## 🔴 Browser API для видимости окна НЕНАДЁЖНЫ в Electron (v0.41.2 → v0.42.0)

### ❌ document.hasFocus() и document.hidden оба ненадёжны

**Симптом**: Ribbon-уведомление появляется при ЧТЕНИИ старых сообщений в Telegram/MAX — пользователь смотрит на мессенджер, но ribbon не подавляется.

**Причина**: Оба browser API ненадёжны в Electron с `<webview>`:
- `document.hasFocus()` → `false` когда фокус внутри WebView (отдельный browsing context)
- `document.hidden` → может быть ненадёжен с `backgroundThrottling: false`

**v0.41.2**: Заменили `!document.hidden` на `hasFocus()` → ложные ribbon при фокусе в webview.
**v0.41.3**: Вернули `!document.hidden` → всё ещё проблемы с Telegram.

**Решение (v0.42.0)**: IPC window-state из main process:
```js
// main.js — BrowserWindow events → IPC
mainWindow.on('focus', () => webContents.send('window-state', { focused: true }))
mainWindow.on('blur', () => webContents.send('window-state', { focused: false }))
// + minimize, restore, show

// App.jsx — ref для хранения состояния
const windowFocusedRef = useRef(true)
useEffect(() => window.api.on('window-state', (s) => { windowFocusedRef.current = s.focused }), [])

// Проверка видимости
const isViewingThisTab = windowFocusedRef.current && activeIdRef.current === messengerId
```

**Ключевой урок**: В Electron НИКОГДА не полагайся на browser API (document.hidden, hasFocus) для определения видимости окна. Используй IPC из main process — BrowserWindow events (focus/blur/minimize/restore) 100% надёжны.

---

## 🔴 Timestamp-only body в Notification API (v0.41.2)

### ❌ MAX шлёт Notification с body = "12:40" (только время)

**Симптом**: Пустое ribbon-уведомление с текстом "12:40" вместо текста сообщения.

**Причина**: MAX при открытии чата / получении уведомления может вызвать `new Notification("", { body: "12:40" })` — body содержит только timestamp. Наши фильтры (`if (!text) return`) пропускают это, т.к. "12:40" непустая строка.

**Решение**: Фильтровать timestamp-only body:
```js
if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanBody)) return null
```

Добавлено в: `showCustomNotification` (main.js) и `__CC_NOTIF__` handler (App.jsx).

**Ключевой урок**: Мессенджеры могут передавать в Notification.body нетекстовые данные: timestamps, пустые строки, zero-width символы. Фильтр body должен проверять не только непустоту, но и осмысленность содержимого.

---

## 🔴 Дублирование ribbon: Notification + ServiceWorker + backup path (v0.43.0 → v0.43.1)

### ❌ 4 ribbon-уведомления на 1 сообщение в Telegram

**Симптом**: Одно сообщение "Хорошо" создаёт 4 ribbon-уведомления. Первые 2 с именем отправителя, нижние 2 без имени и с body "Хорошо15:5715:57".

**Причина**: Telegram вызывает ОБА:
1. `new Notification(title, opts)` — перехватывается нашим override
2. `ServiceWorkerRegistration.showNotification(title, opts)` — тоже перехватывается

Каждый генерирует `__CC_NOTIF__` → 2 уведомления из renderer (App.jsx). Если окно не в фокусе, backup path в main.js тоже обрабатывает эти же 2 `console-message` → ещё 2 ribbon. Итого 4.

ServiceWorker Notification body отличается от обычного — содержит приклеенный timestamp ("Хорошо15:5715:57"), из-за чего дедупликация по `body.slice(0,60)` НЕ срабатывала.

**Решение (v0.43.1)**:
1. **Дедупликация в renderer** (App.jsx): `notifDedupRef` — Map с ключом `messengerId:normalizedBody`, окно 5 сек. Нормализация: убрать все timestamps из body перед сравнением.
2. **Нормализация body в main.js**: Деduп-ключ строится из нормализованного body (без timestamps).
3. **Очистка trailing timestamps**: `showCustomNotification` убирает trailing timestamps из body перед отображением ("Хорошо15:5715:57" → "Хорошо").

```js
// Нормализация для дедуп-ключа:
const normalizedText = text.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').trim()
// Очистка trailing timestamps для отображения:
cleanBody = cleanBody.replace(/(\d{1,2}:\d{2}(:\d{2})?)+\s*$/g, '').trim()
```

**Ключевой урок**: Мессенджеры могут вызывать `Notification` И `ServiceWorker.showNotification` для одного сообщения. ServiceWorker body может отличаться (приклеенные timestamps). Дедупликация ОБЯЗАТЕЛЬНА в обоих path (renderer + main), с нормализацией body (убрать timestamps, zero-width chars) перед построением ключа.

---

## 🔴 Backup path + findMessengerByUrl при 2+ аккаунтах одного мессенджера (v0.44.0 → v0.44.1)

### ❌ Backup path создаёт ribbon для НЕПРАВИЛЬНОГО аккаунта

**Симптом**: При свёрнутом окне — 2 ribbon на 1 сообщение. Первый на правильный Telegram, второй — на другой аккаунт.

**Причина**: `findMessengerByUrl(contents.getURL())` ищет **первый** мессенджер с совпадающим hostname. При 2+ Telegram — ВСЕГДА вернёт первый!

**Решение (v0.44.1)**: Backup path отключён когда renderer жив (`webContents` не destroyed). `backgroundThrottling: false` = renderer работает ВСЕГДА:
```js
if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) return
```

**Ключевой урок**: `findMessengerByUrl` ненадёжен при нескольких аккаунтах одного мессенджера. Renderer определяет messengerId правильно через closure. При `backgroundThrottling: false` backup path избыточен.

---

## 🔴 WebView не загружается при `display: none` и `visibility: hidden` (v0.44.1 → v0.45.0)

### ❌ Мессенджеры не загружаются до перехода на вкладку

**Симптом**: При запуске приложения WebView не загружают страницы. Пользователь должен кликнуть на каждую вкладку чтобы мессенджер начал работать.

**Причина 1 (v0.44.1)**: Неактивные вкладки скрывались через `display: none`:
```jsx
style={{ display: activeId === m.id ? 'block' : 'none' }}
```
В Electron `<webview>` с `display: none` **не начинает загрузку**.

**Причина 2 (v0.44.2)**: `visibility: hidden` тоже может блокировать загрузку webview в Electron — это НЕ гарантированный fix.

**Решение (v0.45.0)**: Все webview остаются `visibility: visible` (по умолчанию), стакаются через `zIndex`. Активный сверху, неактивные перекрыты + `pointer-events: none`:
```jsx
style={{
  zIndex: activeId === m.id ? 2 : 0,
  pointerEvents: activeId === m.id ? 'auto' : 'none',
}}
```
Все webview рендерятся и загружаются с первой секунды. Неактивные просто перекрыты активным.

**Ключевой урок**: В Electron `<webview>` — НЕ используй `display: none` или `visibility: hidden`. Для переключения вкладок: все webview visible + `absolute inset-0` + `zIndex` для активного. `pointer-events: none` для неактивных чтобы клики не проходили.

---

## 🔴 Дёргание первого ribbon-уведомления — двойной setBounds (v0.45.0 → v0.45.1)

### ❌ Первое ribbon дёргается, последующие — нет

**Симптом**: При первом ribbon-уведомлении окно "подпрыгивает" / дёргается при появлении. Второе и далее — плавно.

**Причина**: Двойной `setBounds` за ~16ms:
1. `repositionNotifWin()` в `showCustomNotification()` — вычисляет высоту по формуле (76px * count + gap + padding) → `setBounds` + `showInactive`
2. `notif:resize` из HTML (через `requestAnimationFrame`) — вычисляет высоту по `offsetHeight` → `setBounds`

Два `setBounds` с потенциально разной высотой за 16ms = видимый дёрг на Windows.

Для второго уведомления окно уже видимо, setBounds менее заметен.

**Решение (v0.45.1)**:
1. Убрали `repositionNotifWin()` из `showCustomNotification()` и из IPC handlers
2. Единственный источник позиционирования — `notif:resize` от HTML
3. Кэш bounds: не вызывать setBounds если координаты и высота не изменились
4. Двойной rAF в `reportHeight()` для стабильного layout

**Ключевой урок**: Для прозрачных popup-окон на Windows — ОДИН источник setBounds. Не дублировать позиционирование из main-процесса и из HTML renderer. HTML знает свою высоту точнее (offsetHeight vs расчёт по формуле).

---

## 🟡 Кнопки действий ribbon только для длинных сообщений (v0.44.0 → v0.45.2)

### ❌ Пользователь не видит кнопки "Перейти к чату" / "Прочитано" на коротких сообщениях

**Симптом**: На ribbon с текстом "Чыпр" (4 символа) — видна только маленькая галочка ✓ в углу. Нет кнопок действий, нет подсказки "ещё...".

**Причина**: Кнопки действий (action-row) были в CSS `.notif-item.expanded .action-row { display: flex }`. Expand-клик работал ТОЛЬКО при `hasFullBody` (текст >100 символов). Для коротких → обычный клик → переход к чату → dismiss.

**Решение (v0.45.2)**: Клик на ЛЮБОЕ уведомление раскрывает кнопки действий. Подсказка "▼ действия" для коротких, "▼ ещё..." для длинных.

**Ключевой урок**: UI-элементы управления (кнопки действий) должны быть доступны ВСЕГДА, не зависеть от длины контента. Условие `hasFullBody` влияет только на текст expand, НЕ на доступность кнопок.

---

## 🟡 Hover-tooltip ломает layout таблицы (v0.52.2 → v0.52.3)

### ❌ position:absolute на hover сдвигает ширину столбцов таблицы

**Симптом**: При наведении на ячейку таблицы (лог уведомлений) ширина столбцов "прыгает" — соседние колонки сжимаются/расширяются.

**Причина**: CSS `.cc-notif-cell:hover { position: absolute }` выдёргивает элемент из потока документа → `<td>` теряет контент → ширина столбца схлопывается. Без `table-layout: fixed` браузер пересчитывает ширину по контенту.

**Решение (v0.52.3)**:
1. `table-layout: fixed` + `<colgroup>` с фиксированными ширинами столбцов — ширина не зависит от контента.
2. `::after` pseudo-element с `content: attr(data-full)` вместо изменения самого элемента. Оригинальный `<div>` с `truncate` остаётся в потоке, `::after` показывается поверх как отдельный слой.
3. Селектор `[data-full]:not([data-full=""])` — не показывать пустой тултип.

**Ключевой урок**: CSS `::after` с `content: attr(data-full)` обрезается `overflow: hidden` на `<td>`. Решение: JS-тултип с `position: fixed` через React state (`onMouseEnter`/`onMouseLeave` → `setCellTooltip`). `position: fixed` не зависит от overflow родителей.

---

## 🟡 Парсинг Telegram Notification.tag — формат peer (v0.53.0)

### ❌ tag.replace(/[^0-9-]/g, '') неправильно парсит "peer5_1234567890"

**Симптом**: Клик на ribbon-уведомление от Telegram не находит чат по peerId — навигация fallback на имя.

**Причина**: Telegram Web K использует Notification.tag в формате `peer5_1234567890` (type_id). Regex `tag.replace(/[^0-9-]/g, '')` удалял ВСЕ нецифровые символы → `51234567890` → неправильный peerId. Подчёркивание `_` тоже удалялось, но нужно сначала убрать префикс `peer5_`.

**Решение (v0.53.0)**: `tag.replace(/^peer\\d+_/, '').replace(/[^0-9-]/g, '')` — сначала убрать `peerN_`, потом оставить только цифры.

**Ключевой урок**: Notification.tag формат зависит от мессенджера. Telegram: `peer{type}_{id}`. Парсить надо с учётом формата, не слепым regex.

---

## 🟡 Виртуальный скроллинг Telegram Web K ломает DOM-поиск чата (v0.53.1)

### ❌ querySelectorAll('.chatlist-chat .peer-title') не находит чат если он не в viewport

**Симптом**: Клик "Перейти к чату" на ribbon → вкладка переключается, но чат НЕ открывается. `buildChatNavigateScript` возвращает `{ok:false, method:'notFound'}`.

**Причина**: Telegram Web K использует **виртуальный скроллинг** для списка чатов. В DOM рендерятся только ~20-30 видимых чатов. Если нужный чат прокручен — его `.peer-title` элемента НЕТ в DOM.

**Решение (v0.53.1)**:
1. Основной метод: `[data-peer-id]` selector по chatTag (peerId) — если элемент в DOM.
2. Формат peerId: user=ID, chat=-ID, channel=-100ID (парсинг peer type из tag).
3. Case-insensitive match: `toLowerCase()` сравнение.
4. Partial/contains match: `indexOf` для длинных имён.
5. Retry с проверкой `activeIdRef.current` — не трогать фоновый WebView.

**Ключевой урок**: SPA-мессенджеры используют виртуальный скроллинг. `querySelectorAll` находит только ВИДИМЫЕ элементы. Для навигации к невидимому чату нужен альтернативный метод через peer ID формат.

---

## 🔴 КРИТИЧЕСКОЕ: location.hash навигация переключает чаты без спроса (v0.53.1 → v0.53.2)

### ❌ window.location.hash = peerId в WebView вызывает переход к другому чату

**Симптом**: Пользователь печатает в одной вкладке Telegram, а его неожиданно перекидывает в другую вкладку Telegram или в другой чат.

**Причина (v0.53.1)**: `buildChatNavigateScript` содержал `window.location.hash = peerId` как fallback. Проблемы:
1. Hash навигация срабатывала даже когда чат уже был найден в DOM через другой метод retry.
2. `tryNavigate` не проверял `activeIdRef.current` — выполнялся на фоновом WebView после того как пользователь переключил вкладку.
3. 4 retry с 1.5 сек интервалом — агрессивные повторы кликали по чатам после того как пользователь уже начал работать.

**Решение (v0.53.2)**:
1. **Убрана `location.hash` навигация** — слишком агрессивно, перехватывает контроль у пользователя.
2. **Проверка `activeIdRef.current === messengerId`** перед каждой попыткой — если пользователь переключил вкладку, навигация отменяется.
3. **Retry уменьшен до 2** попыток (было 4).
4. **Правильный формат peerId**: user=ID, chat=`-ID`, channel=`-100ID` — через DOM selector вместо hash.

**Ключевой урок**: НИКОГДА не менять `location.hash` / `location.href` в чужом WebView — это навигационный hijack. Навигация к чату должна быть через DOM click или API, и ВСЕГДА проверять что пользователь не переключил вкладку. Агрессивные retry опасны — пользователь мог уже начать работать в другом месте.

---

## 🔴 КРИТИЧЕСКОЕ: scrollListContent — это SIDEBAR, а не чат (MAX) (v0.59.2 → v0.60.0)

### ❌ chatObserver привязался к сайдбару → ribbon с именами контактов вместо текста сообщений

**Симптом**: При получении 1 реального сообщения ("Авч") — показывается ribbon "Толстиков Юрий Павлович Теперь в MAX!" (имя контакта из сайдбара). До 9 спам-нотификаций за 1 сообщение.

**Причина**: DOM Inspector показал `.scrollListContent` с 521 children. Я предположил что это контейнер сообщений и добавил в `CHAT_CONTAINER_SELECTORS.max`. На самом деле 521 children = 521 чат-диалогов в сайдбаре. chatObserver ловил мутации сайдбара (обновление preview последнего сообщения, статусы "Теперь в MAX!") и передавал их как новые сообщения.

**Как диагностировать**: 521 children ≠ количество сообщений в чате (обычно 20-100). Реальный контейнер сообщений MAX — `.history` (870 children — bubble wrappers, date separators и т.д.).

**Решение (v0.60.0)**:
1. Убран `.scrollListContent` из `CHAT_CONTAINER_SELECTORS.max`
2. Добавлен `.scrollListContent|scrollListScrollable|chatListItem` в `_sidebarRe` для фильтрации
3. Реальные селекторы MAX: `.history`, `[class*="history"][class*="svelte"]`, `.openedChat`

**Ключевой урок**: ВСЕГДА проверяй DOM Inspector данные перед добавлением селекторов. Большое число children (500+) скорее сайдбар/список чатов, чем контейнер сообщений. Сверяй с реальным количеством сообщений в чате.

---

## 🟡 ВАЖНОЕ: messageWrapper ≠ message (SvelteKit MAX) (v0.60.0)

### ❌ Fallback findChatContainer искал `.message[class*="svelte"]` — не существует в MAX

**Симптом**: `findChatContainer` не мог найти контейнер через fallback-метод (поиск parent'а 3+ элементов `.message[class*="svelte"]`).

**Причина**: MAX использует SvelteKit, DOM-элементы имеют класс `messageWrapper svelte-1kh0oxy`, НЕ `message svelte-...`. Fallback искал `.message[class*="svelte"]` — 0 результатов.

**Решение**: Использовать реальный селектор `.history` вместо fallback. Если fallback нужен, искать `.messageWrapper[class*="svelte"]`.

**Ключевой урок**: SvelteKit-приложения (MAX) используют хешированные классы (`svelte-xxxxx`). Имена классов могут отличаться от ожидаемых (`messageWrapper` вместо `message`). ВСЕГДА проверяй реальные классы через DOM Inspector.

---

## 🟡 ВАЖНОЕ: history.pushState override НЕ работает из preload (context isolation) (v0.60.0)

### ❌ Переопределение history.pushState в preload не ловит навигацию SPA

**Симптом**: VK и MAX — SPA-приложения, навигация через `history.pushState()` без перезагрузки страницы. Попытка перехватить `pushState` из preload не работает.

**Причина**: Context isolation в WebView: preload выполняется в изолированном мире (isolated world). `window.history` в preload — это копия, НЕ тот же объект что в main world. Переопределение `history.pushState` в preload не влияет на main world скрипты мессенджера.

**Каналы main world → preload**: Единственный надёжный канал — `console.log()` в main world → `console-message` event на `<webview>` в renderer.

**Решение (v0.60.0)**: Вместо override `pushState` — polling `location.href` каждые 2 секунды (`setupNavigationWatcher`). При изменении URL → re-attach chatObserver к новому контейнеру.

**Ключевой урок**: В WebView с context isolation НЕЛЬЗЯ переопределить глобальные объекты main world из preload. `window`, `document`, `history`, `Notification` — все изолированы. Для перехвата используй: (1) `executeJavaScript` (выполняется в main world), (2) polling, (3) `console.log` канал.

---

## 🟡 ВАЖНОЕ: Pipeline text truncation — 60 символов + неправильный парсинг __CC_DIAG__ (v0.60.0)

### ❌ В Pipeline Trace текст обрезан до "йнер" вместо полного слова

**Симптом**: В таблице Pipeline Trace текст сообщений обрезан до нечитаемых фрагментов ("йнер" вместо "контейнер").

**Причина 1**: `traceNotif()` обрезал текст `.slice(0, 60)` — слишком мало для диагностических сообщений.

**Причина 2**: `__CC_DIAG__` парсер в App.jsx резал тег на 30 символов (`msg.slice(0, 30)`) вместо поиска реального конца тега. Это могло резать посередине слова.

**Решение (v0.60.0)**:
1. Лимит текста в `traceNotif` увеличен 60→200 символов
2. `__CC_DIAG__` парсер: находит конец тега через `msg.indexOf('__', 4)` вместо фиксированного среза

**Ключевой урок**: Диагностические логи должны быть достаточно длинными для отладки. 60 символов — слишком мало. Парсинг тегов — по разделителям, не по фиксированной позиции.

---

## 🟡 ВАЖНОЕ: Enrichment header — неправильный селектор для MAX (v0.60.0)

### ❌ Enrichment показывал "Еременко Вячеслав Борисович" вместо реального отправителя

**Симптом**: При получении сообщения в MAX, enrichment определял отправителя как контакт из сайдбара, а не из заголовка открытого чата.

**Причина**: Header-селекторы enrichment не включали MAX-специфичный `.topbar .headerWrapper`. Fallback шёл в сайдбар-селекторы и подхватывал первое имя.

**Решение**: Добавлен селектор `.topbar .headerWrapper` + strip префикса "Окно чата с" (MAX добавляет этот текст в `aria-label` или `title`).

**Ключевой урок**: Каждый мессенджер имеет свою структуру header'а с именем чата. ОБЯЗАТЕЛЬНО добавлять мессенджер-специфичные header-селекторы при интеграции нового мессенджера. Проверять через DOM Inspector.

---

## 🟡 ВАЖНОЕ: Sender-based dedup — один источник генерирует дубли через 3 пути (v0.60.0)

### ❌ 9 уведомлений за 1 реальное сообщение

**Симптом**: Одно сообщение в MAX генерирует до 9 ribbon-уведомлений.

**Причина**: Три независимых пути перехвата (`__CC_NOTIF__`, `__CC_MSG__`, IPC `new-message`) могут сработать на одно и то же сообщение. Каждый путь проходит свой спам-фильтр и dedup независимо.

**Решение (v0.60.0)**: Sender-based dedup — `notifSenderTsRef` хранит `{messengerId:senderName → timestamp}`. Если `__CC_NOTIF__` уже обработал сообщение от sender X, то `__CC_MSG__` и IPC от того же sender'а блокируются на 3 секунды.

**Ключевой урок**: При 3 независимых путях перехвата НЕОБХОДИМ cross-path dedup. Приоритет: `__CC_NOTIF__` (самый точный — прямо из Notification API мессенджера) → `__CC_MSG__` → IPC `new-message`.

---

## 🟡 ВАЖНОЕ: Sender-dedup по имени ненадёжен — разное enrichment даёт разные имена (v0.60.0 → v0.60.2)

### ❌ `__CC_NOTIF__` записывает "Дугин Алексей Сергеевич", а `__CC_MSG__` получает "Окно чата с Дугин Ал..."

**Симптом**: Дубль ribbon — два уведомления на одно сообщение. Sender-dedup не срабатывает.

**Причина**: `__CC_NOTIF__` получает sender name прямо из Notification API мессенджера ("Дугин Алексей Сергеевич"). `__CC_MSG__` делает DOM enrichment через `.topbar .headerWrapper` и получает "Окно чата с Дугин Алексей Сергеевич     Дугин Алексей Сергеевич  В сети" (дубль имени + статус + prefix). Strip "Окно чата с" работает, но результат > 80 символов → отклоняется length check → fallback получает НЕ-stripped имя → dedup ключи не совпадают.

**Решение (v0.60.2)**: Per-messengerId dedup — если `__CC_NOTIF__` от messengerId был <3 сек назад, блокировать `__CC_MSG__` целиком (без сравнения sender name). Плюс дедупликация дублирующегося имени ("Иванов Иван     Иванов Иван" → "Иванов Иван") и strip после executeJavaScript.

**Ключевой урок**: Sender-based dedup по имени — НЕНАДЁЖЕН, разные пути enrichment дают разные имена. Надёжнее — per-messengerId dedup с коротким окном (3 сек).

---

## 🟡 ВАЖНОЕ: mouseenter/mouseleave ненадёжны в transparent focusable:false BrowserWindow на Windows (v0.60.3)

### ❌ Hover на одном ribbon ставит на паузу ВСЕ уведомления

**Симптом**: При наведении курсора на одно уведомление — progress bar останавливается у ВСЕХ ribbon.

**Причина**: Windows обрабатывает transparent + focusable:false BrowserWindow как единую hit-target. `mouseenter`/`mouseleave` события на отдельных DOM-элементах внутри такого окна работают некорректно — могут срабатывать одновременно для нескольких элементов.

**Решение (v0.60.3)**: Единый `mousemove` handler на контейнере + `e.target.closest('.notif-item')` для определения какой конкретно элемент под курсором. Трекинг `hoveredItemId` — пауза/возобновление только для конкретного item.

**Ключевой урок**: В transparent BrowserWindow на Windows НЕЛЬЗЯ полагаться на per-element `mouseenter`/`mouseleave`. Используй `mousemove` на контейнере + `closest()` для определения элемента под курсором.

---

## 🔴 КРИТИЧЕСКОЕ: expandedByDefault отключает таймер auto-dismiss (v0.60.3 → v0.60.4)

### ❌ При "Кнопки действий сразу" ribbon висит вечно — таймер не запускается

**Симптом**: Время показа 18 сек, "Кнопки действий сразу" ON → ribbon никогда не исчезает.

**Причина**: В notification.html: `if (!data.expandedByDefault) { timer = setTimeout(...) } else { progress.pause }`. Когда expandedByDefault=true, таймер НЕ создавался, progress bar паузился. Логика была "expanded = на паузе". Но пользователь ожидает: "показать кнопки сразу" ≠ "не исчезать".

**Решение (v0.60.4)**: Таймер ВСЕГДА запускается: `timer = setTimeout(...)` без условия. `expandedByDefault` — только визуальный `el.classList.add('expanded')`, таймер не затрагивается.

**Ключевой урок**: `expandedByDefault` = визуальное состояние (показать кнопки). НЕ путать с "остановить таймер". Таймер управляется ТОЛЬКО через hover/click expand, не через начальное визуальное состояние.

---

## 🟡 ВАЖНОЕ: Прыжок ribbon при dismiss — element.remove() без коллапса высоты (v0.60.3 → v0.60.4)

### ❌ При закрытии верхнего ribbon нижние "прыгают" вверх

**Симптом**: При dismiss нескольких ribbon — нижние резко прыгают вверх в момент удаления DOM-элемента.

**Причина**: CSS анимация `dismissOut` анимирует transform/opacity, но элемент продолжает занимать место в layout. Через 360мс `element.remove()` → мгновенный сдвиг всех элементов ниже.

**Решение (v0.60.4)**: Двухэтапный dismiss: (1) `fadeSlide` 250мс — визуальное затухание, (2) `collapsing` class — `height: 0, min-height: 0` через CSS transition 200мс — плавный коллапс пространства. DOM-элемент удаляется только после полного коллапса.

**Ключевой урок**: При удалении элемента из flex-контейнера НЕЛЬЗЯ просто `element.remove()` — это вызывает мгновенный layout shift. Нужно сначала анимировать высоту к 0, потом удалять.

---

## 🔴 КРИТИЧЕСКОЕ: CSS-анимация `.fade-out` вызывает мигание при смене классов (v0.60.4 → v0.60.5)

### ❌ При dismiss ribbon мигает (показывается на 1 кадр перед исчезновением)

**Симптом**: Нажатие "Прочитано" или закрытие → ribbon исчезает → мигает обратно → исчезает снова.

**Причина**: CSS `animation: fadeSlide 250ms forwards` держит opacity=0 через `forwards` fill mode. Но `el.classList.remove('fade-out')` УБИРАЕТ анимацию → opacity МГНОВЕННО возвращается к исходному значению (1) на 1 кадр → затем `classList.add('collapsing')` ставит opacity:0 снова.

**Решение (v0.60.5)**: Полностью отказаться от CSS-анимаций для dismiss. Вместо этого:
1. `el.style.animation = 'none'` — отменить slideIn
2. `el.style.opacity = '1'` — зафиксировать текущее состояние
3. `void el.offsetHeight` — force reflow
4. `el.style.transition = 'opacity 250ms...'` + `el.style.opacity = '0'` — fade
5. `setTimeout(260)` → `el.style.height = '0'` — collapse
6. `setTimeout(210)` → `el.remove()` — удалить

**Ключевой урок**: НИКОГДА не используй `classList.remove()` для CSS-анимации с `forwards` fill mode, если после этого нужно продолжить анимацию. `forwards` держит конечное состояние ТОЛЬКО пока класс присутствует. При удалении класса — мгновенный откат. Используй inline `style.transition` + inline `style.opacity` для многоэтапных dismiss-анимаций.

---

## 🟡 ВАЖНОЕ: Пустой body в Notification API = стикер/медиа, а НЕ спам (v0.60.8 → v0.60.9)

### ❌ Мульти-эмодзи стикеры из MAX блокируются как "empty"

**Симптом**: При отправке стикеров с несколькими эмодзи (😇😉👍, 👋❤️‍🔥😉) из MAX — нет ribbon, нет звука, в Лог "ЗАБЛОК Пустое". Одиночный эмодзи 👍 проходит нормально.

**Причина**: MAX вызывает `new Notification("Имя Фамилия", {body: ""})` для мульти-эмодзи стикеров. Body пустой. `isSpamNotif("")` возвращает `'empty'` → блокировка. Одиночный 👍 приходит как `{body: "👍"}` — не пустой, проходит.

**Решение (v0.60.9)**: В обоих override (`window.Notification` и `ServiceWorkerRegistration.showNotification`): если `isSpamNotif` вернул `'empty'`, но `title` существует и НЕ совпадает с `_appTitles` (названия мессенджеров), — это реальный sender, подставляем placeholder `"📎 Стикер"` вместо пустого body.

**Ключевой урок**: Пустой body в Notification API ≠ спам. Мессенджеры используют пустой body для стикеров, медиа, реакций. Если title — имя реального sender'а, значит мессенджер считает это достойным уведомления. Доверяем мессенджеру.

## 🟡 ВАЖНОЕ: Одинаковый placeholder = ложная дедупликация (v0.60.9 → v0.61.0)

### ❌ Несколько стикеров подряд → показывается только первый

**Симптом**: Отправлено 4 стикера подряд — ribbon только для первого. Остальные заблокированы dedup (`notifDedup | age=2458мс`, `recentNotifs | age=6113мс`).

**Причина**: Все стикеры получали одинаковый body `"📎 Стикер"` → `dedupKey = messengerId + ':📎 Стикер'` → одинаковый для всех → dedup (5 сек notifDedup + 10 сек recentNotifs) блокирует повторные.

**Решение (v0.61.0)**: Счётчик `_stickerSeq` в injection-коде: `"📎 Стикер #1"`, `"📎 Стикер #2"` и т.д. Каждый стикер получает уникальный body → уникальный dedupKey → проходит dedup.

**Ключевой урок**: При подстановке placeholder'ов для dedup-системы, каждый placeholder ДОЛЖЕН быть уникальным. Иначе все одинаковые placeholder'ы будут считаться дублями.

## 🟡 ВАЖНОЕ: Emoji regex слишком узкий для modern Unicode (v0.61.1 → v0.61.2)

### ❌ DOM-извлечение не находит эмодзи в стикерах MAX

**Симптом**: `_extractStickerFromDOM()` находит контейнер `.history`, но не извлекает эмодзи из последних сообщений. Все стикеры → fallback "📎 Стикер".

**Причина**: Regex `/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}...]+$/u` слишком узкий. Не покрывает: ❤ (U+2764), ❤️‍🔥 (ZWJ sequence), многие символы из Misc Symbols, Dingbats, Variation Selectors. Также `naturalWidth` для img может быть 0 если изображение ещё загружается.

**Решение (v0.61.2)**: Вместо whitelist Unicode ranges — blacklist: `!/[a-zA-Zа-яА-Я0-9]/.test(t)`. Текст <= 30 символов без букв и цифр = эмодзи. Для img: дополнительно проверяем `style.width`, `style.height`, `getAttribute('width')`.

**Ключевой урок**: Emoji regex — ловушка. Unicode постоянно расширяется (ZWJ sequences, skin tones, flags). Вместо whitelist ranges лучше использовать blacklist (нет букв/цифр = эмодзи). Также DOM-элементы img могут иметь naturalWidth=0 до полной загрузки.

## 🟡 ВАЖНОЕ: DOM-извлечение стикера невозможно без открытого чата (v0.61.2)

### ❌ _extractStickerFromDOM() возвращает null — "no container, tried: 0"

**Симптом**: Стикеры из MAX всегда показывают "📎 Стикер", хотя DOM-извлечение реализовано. `__CC_STICKER_DBG__` показывает `{"err":"no container","tried":0}`.

**Причина**: Notification API вызывается когда пользователь НЕ находится в чате отправителя (или на другой вкладке). В этом случае URL = `https://web.max.ru/` (без ID чата) → DOM не содержит `.history` контейнер → querySelectorAll возвращает 0 элементов.

**Ограничение**: Это неустранимо — мы не можем заставить WebView открыть нужный чат для DOM-извлечения. DOM-извлечение работает только если пользователь УЖЕ смотрит на чат.

**Fallback**: "📎 Стикер" — корректный placeholder для ситуации когда содержимое стикера неизвестно.

**MAX body поведение**: 1-2 одинаковых эмодзи → body непустой (👎👎, 🌹🌹). 3+ или комбинации разных → body пустой → fallback.

## 🟡 ВАЖНОЕ: Dedup-суффикс виден пользователю (v0.61.0 → v0.61.1)

### ❌ "📎 Стикер #3" — пользователь видит технический суффикс

**Симптом**: В ribbon показывается "📎 Стикер #1", "📎 Стикер #2" — пользователю непонятно что значит номер.

**Причина**: Суффикс `#N` добавлен для dedup-уникальности (чтобы каждый стикер имел уникальный body). Но он передавался напрямую в ribbon.

**Решение (v0.61.1)**: `displayText = text.replace(/ #\d+$/, '')` перед отправкой в `app:custom-notify`. Dedup работает с полным текстом (с #N), ribbon показывает чистый (без #N).

**Ключевой урок**: Технические суффиксы для dedup должны обрезаться на этапе отображения. Dedup-ключ и display-текст — разные вещи.

## 🔴 КРИТИЧЕСКОЕ: Анимированный dismiss + FIFO = deadlock (v0.60.5-0.60.6 → v0.60.7)

### ❌ Ribbon зависают при быстром потоке (10+ сообщений)

**Симптом**: При 10+ сообщениях подряд ribbon зависают, не закрываются кнопками, пустые места в стеке.

**Причина**: `dismissItem()` удаляет элемент из `items` Map только через 520мс (fade 250мс + пауза 80мс + collapse 180мс). Когда приходит 7-й ribbon, `addNotification` проверяет `while (items.size >= MAX_ITEMS)` и вызывает `dismissItem()` на самый старый. Но `dismissItem` проверяет `if (item.dismissing) return` — элемент уже в процессе dismiss → `items.size` НЕ уменьшается → бесконечный цикл `while`.

**Решение (v0.60.7)**: Отдельная функция `forceRemoveItem(id)` для FIFO вытеснения — мгновенное `el.remove() + items.delete(id)` без анимации. `dismissItem()` используется только для пользовательского dismiss (клик "Прочитано", таймер).

**Ключевой урок**: Если `dismissItem` асинхронный (с анимацией), НЕЛЬЗЯ использовать его в синхронном цикле `while (size >= max)`. Асинхронное удаление не уменьшает коллекцию мгновенно → deadlock. Для FIFO вытеснения всегда используй синхронное удаление.

## 🟡 Кнопка «Прочитано» в ribbon не помечает чат прочитанным (v0.62.0)

### ❌ «Прочитано» только убирала ribbon, но не взаимодействовала с мессенджером

**Симптом**: Пользователь нажимает «Прочитано» в ribbon → уведомление исчезает, но в мессенджере чат остаётся непрочитанным (бейдж/счётчик не сбрасывается).

**Причина**: `notif:mark-read` в main.js просто удалял item из `notifItems` массива, но не отправлял сигнал в renderer для взаимодействия с WebView мессенджера.

**Решение (v0.62.0)**: Полная IPC-цепочка: `notification.html` → `notif:mark-read` → `main.js` (находит item, извлекает messengerId/senderName/chatTag) → `notify:mark-read` → `App.jsx` useEffect handler → `buildChatNavigateScript()` генерирует per-messenger JS → `executeJavaScript()` кликает по чату в WebView → мессенджер помечает прочитанным.

**Ключевой урок**: Любая кнопка «Прочитано» должна взаимодействовать с мессенджером через WebView, а не просто скрывать UI-элемент. Для пометки прочитанным нужен клик по чату в sidebar мессенджера — это единственный универсальный способ сбросить badge/counter.

## 🟡 CSS .messenger-name невидимый — нет явного color (v0.62.1)

### ❌ Подпись мессенджера в ribbon не видна на тёмном фоне

**Симптом**: Элемент `.messenger-name` создаётся, но пользователь его не видит. В DevTools элемент существует с правильным текстом.

**Причина**: `.messenger-name` не имел явного `color`. На тёмном фоне `#1a1a2e` наследуемый цвет (чёрный по умолчанию) с `opacity: 0.45` — полностью невидим. В отличие от `.sender` (color: #e2e8f0) и `.body-text` (color: rgba(255,255,255,0.6)), `.messenger-name` полагался на наследование.

**Решение**: Добавить явный `color: rgba(255,255,255,0.45)` вместо `opacity: 0.45`.

**Ключевой урок**: Для ЛЮБОГО текстового элемента на тёмном фоне ОБЯЗАТЕЛЬНО задавай `color` явно. Не полагайся на наследование — `body` может не иметь белого цвета. Лучше использовать `color: rgba(255,255,255,N)` вместо `color: inherit; opacity: N`.

## 🟡 buildChatNavigateScript для MAX — только exact match (v0.62.1)

### ❌ Mark-read не находит чат в MAX если имя длинное

**Симптом**: При нажатии «Прочитано» чат не помечается прочитанным, хотя имя отправителя корректное.

**Причина**: Скрипт для MAX использовал только `===` (exact match). Если `textContent.trim()` из DOM не совпадает точно с `senderName` (пробелы, регистр, обрезка) → чат не найден.

**Решение (v0.62.1)**: Добавлен partial/startsWith match + case-insensitive. После клика — `scrollDown()` для сброса unread (скроллит `.history` вниз). Fallback: если чат не найден — всё равно скроллит текущий чат. Добавлено логирование (`titles.length`, `samples`).

**Ключевой урок**: Для поиска чата по имени ВСЕГДА используй каскад: exact → icase → partial → startsWith. Никогда не полагайся только на exact match — DOM может обрезать или форматировать имя.
