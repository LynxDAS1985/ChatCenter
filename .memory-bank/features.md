# Реализованные функции — ChatCenter

## Текущая версия: v1.2.58 (7 июля 2026)

### v1.2.58 — VK: внутренний тост подключён к основному hook, а не только к fallback

Дата: 7 июля 2026. Кто нашёл: пользователь по кейсу VK-профиля `https://vk.com/lynxdas`; Codex по `system-diagnostics-report.json`, `chatcenter.log`, `main/preloads/hooks/vk.hook.js`, `shared/vkExecFallback.js`.

Что было видно пользователю: VK показал свою внутреннюю плашку `Новое сообщение / Елена Дугина прислала вам личное сообщение`, но модалки ChatCenter не было.

Что показала диагностика: `vkFull` видел текст VK-плашки в `bodyTextSample`, но в сохранённой диагностике было `0` событий `vk-toast`, `toast-candidate`, `toast-scan`, `emit-toast`, `source=vk-toast`. На странице профиля также было `containerFound=false`, `messageCount=0`, `sidebar=[]`, поэтому активная история и sidebar физически не могли создать уведомление. В логе был риск `VK-EXEC inject failed`, а код `shared/vkExecFallback.js` дополнительно показал, что `VK-EXEC` пропускается при живом `monitor-ready` (`VK preload alive -> VK-EXEC skip`).

Почему v1.2.57 не закрыла проблему полностью: идея `source:'vk-toast'` была правильной, но наблюдатель был добавлен только в резервный `VK-EXEC fallback`. Этот fallback не является основным путём: он запускается только когда preload не подал heartbeat, и ещё может упасть на `executeJavaScript`. Значит при нормальном живом preload VK-плашка могла быть видна диагностике, но не попадала в рабочую цепочку уведомления.

Что исправлено сейчас: `main/preloads/hooks/vk.hook.js` получил основной `__ccVkPrimaryToastObserver`. Он ставится вместе с VK notification hook на любой странице `vk.com`, наблюдает DOM за компактной видимой плашкой `Новое сообщение` / `New message`, извлекает отправителя, текст плашки и аватарку, затем отправляет обычный `__CC_NOTIF__` с `src:'vk-toast'` и стабильным `g:'vk-toast:<hash>'`.

Почему это безопасно:
- `VK-EXEC`, `vk-sidebar-unread` и active-history guard не удалены и не ослаблены;
- старые DOM-сообщения активной истории по-прежнему блокируются через `source:'vk-exec-fallback'` без `vkActiveUnread`;
- sidebar по-прежнему требует unread badge и fresh/selected правила;
- новый путь реагирует только на собственную VK-плашку с меткой `Новое сообщение`, а не на произвольный текст страницы;
- неполный тост остаётся диагностикой `block-incomplete-toast` и не создаёт карточку;
- MAX, Telegram, WhatsApp и API-источники не затронуты.

Как должно работать после исправления: если пользователь находится на профиле/ленте/фото VK и VK показывает внутреннюю плашку нового личного сообщения, в диагностике должна появиться цепочка `__CC_DIAG__vk-toast primary-bound` -> `__CC_DIAG__vk-toast candidate decision=emit-toast` -> `__CC_NOTIF__ src=vk-toast` -> `handle` -> `sound` -> `ribbon`. Если VK в плашке не отдаёт настоящий текст сообщения, ChatCenter не должен выдумывать его: карточка показывает ровно тело VK-плашки, например `прислала вам личное сообщение`.

Проверки: `node --check main\preloads\hooks\vk.hook.js`, `node src\__tests__\notifHooks.test.cjs`, `node src\__tests__\vkExecFallback.test.cjs`, `node src\__tests__\notificationIdentity.test.cjs`, `node src\__tests__\handleNewMessage.test.cjs`, `node src\__tests__\fileSizeLimits.test.cjs`, `node src\__tests__\memoryBankSizeLimits.test.cjs`, `node src\__tests__\featuresReferences.test.cjs`, `npm run lint`, `npm run build`.

### v1.2.57 — VK: уведомления из внутреннего тоста на любой странице VK

Дата: 7 июля 2026. Кто нашёл: пользователь по VK-сценарию на странице профиля `https://vk.com/lynxdas`; Codex по `system-diagnostics-report.json`, `chatcenter.log`, `shared/vkExecFallback.js`.

Проблема: когда пользователь был не в мессенджере VK, а на странице профиля, VK сам показывал маленький тост `Новое сообщение / Алексей Дёмин / Ага`, но ChatCenter не показывал свою модалку. Диагностика показала точную причину: `url=https://vk.com/lynxdas`, `containerFound=false`, `messageCount=0`, `sidebar=[]`, `VK-EXEC kind=container-not-found-sidebar-bound`, `sidebar-scan rows=0 emitted=0`. То есть текущие источники VK (`vk-exec-fallback` для открытой истории и `vk-sidebar-unread` для списка диалогов) физически не видели ни контейнер сообщений, ни список чатов.

Решение: добавлен третий источник `source:'vk-toast'` в `shared/vkExecFallback.js`. Он наблюдает DOM всей страницы VK и ищет только компактный видимый внутренний тост VK с системной меткой `Новое сообщение` / `New message`. Если в тосте есть отдельный отправитель и текст, событие отправляется в обычный `handleNewMessage`, дальше идут те же звук, Ribbon, dedup, история и статусбар. Если отправителя или текста нет, событие остаётся диагностикой `block-incomplete-toast` и карточку не создаёт.

Почему так безопаснее: старые пути не заменены и не ослаблены. `vk-exec-fallback` по-прежнему защищает активную историю от старых DOM-вставок, `vk-sidebar-unread` по-прежнему требует unread badge и fresh/preview правила. Новый `vk-toast` нужен только для страниц VK без `/im`, где сам VK уже подтвердил событие своим тостом, но у нас нет sidebar/history DOM.

Как должно работать после исправления:
- на странице профиля, ленты, фото и других страницах VK внутренний тост `Новое сообщение` должен превращаться в обычную карточку ChatCenter;
- в диагностике должна появиться цепочка `toast-candidate decision=emit-toast` -> `VK-EXEC kind=new-message source=vk-toast` -> `handle` -> `sound` -> `ribbon`;
- неполные тосты без текста/отправителя пишутся как `block-incomplete-toast` и не создают фантом;
- один и тот же тост не повторяется в течение короткого окна благодаря `toastSeen` и `messageId='vk-toast:...'`;
- остальные мессенджеры и старые VK-источники не менялись.

Проверки: `node --check shared\vkExecFallback.js`, `node --check src\__tests__\vkExecFallback.test.cjs`, `node src\__tests__\vkExecFallback.test.cjs`, `node src\__tests__\notificationIdentity.test.cjs`, `node src\__tests__\handleNewMessage.test.cjs`, `node src\__tests__\fileSizeLimits.test.cjs`, `node src\__tests__\memoryBankSizeLimits.test.cjs`, `node src\__tests__\featuresReferences.test.cjs`, `npm run lint`, `npm run build`.

### v1.2.56 — VK: sidebar-preview очищается от хвоста времени

Кто нашёл: пользователь по VK-кейсу `Елена Дугина / Скинь 1500`; Codex по `chatcenter.log`, `shared/vkExecFallback.js`, `src/__tests__/vkExecFallback.test.cjs`.

Что было сделано:
- `shared/vkExecFallback.js`: `bindSidebar(reason)` теперь запускается до проверки активного контейнера чата. Если справа нет открытого чата, лог пишет `container-not-found-sidebar-bound`, но список VK слева всё равно сканируется.
- `shared/vkExecFallback.js`: в sidebar-диагностику добавлены `badgeText`, `badgeSource`, `badgeCandidates`, чтобы видеть реальный unread badge и не гадать по тексту строки.
- `shared/vkExecFallback.js`: `rowFreshMinutes()` научен понимать текущие VK-форматы `8м8 минут назад`, `9м9 минут назад`, `1 минута назад`, `2 минуты назад`, `сейчас`.
- `shared/vkExecFallback.js`: добавлен `cleanSidebarPreview()`. Он убирает из текста карточки только VK-хвост времени после разделителя `·`: `4м4 минуты назад`, `сейчас`, `23 фев`, но не режет обычный текст клиента с `·`.
- `src/__tests__/vkExecFallback.test.cjs`: добавлены проверки, что sidebar работает без открытого активного чата и что fresh-парсер пропускает только минуты, но не часы, дни и даты.
- `src/__tests__/vkExecFallback.test.cjs`: добавлена проверка `Скинь 1500 · 4м4 минуты назад` -> `Скинь 1500`, чтобы карточка больше не выглядела как старый фантом из-за времени внутри preview.

Факт из лога 6 июля 2026: карточка `Скинь 1500 · 4м4 минуты назад` была создана в 15:51:12, до исходящего сообщения пользователя `я скинул` в 15:51:49. Цепочка была такая: `VK-EXEC kind=sidebar-row reason=baseline-spa-rebind count=1 freshMin=4 decision=emit-baseline-fresh` -> `VK-EXEC kind=new-message reason=baseline-fresh-unread sender=Елена Дугина`. После открытия чата строка стала `selected=true`, badge исчез, а старые DOM-вставки активной истории блокировались как `VK-EXEC active visible chat: block virtualized old DOM nodes`.

Как защита от фантомов работает сейчас:
- старые строки без unread не уведомляют: `count=0` -> `block-no-unread` или `block-baseline`;
- старые часы/дни/даты не считаются свежими: `54м` уже выше окна 10 минут, `6д`, `2н`, даты вроде `23 фев` остаются baseline;
- выбранный чат не уведомляет сам себя из sidebar: `selected=true` -> `block-selected`;
- активная история VK не показывает переиспользованные старые DOM-узлы без маркера новых сообщений: `source=vk-exec-fallback` без `vkActiveUnread` блокируется в `webviewHandleNewMessage`;
- один и тот же fresh unread не должен дублироваться при повторной перепривязке благодаря `sidebarNotified`.

Что исправлено сейчас: preview из VK sidebar больше не должен включать хвост времени (`Скинь 1500 · 4м4 минуты назад`). Уведомление продолжает создаваться только по тем же правилам `count/freshMin/selected/vkActiveUnread`; изменилась только строка, которую видит пользователь в карточке.

Проверки: `node src\__tests__\vkExecFallback.test.cjs`, `node --check shared\vkExecFallback.js`, `node --check src\__tests__\vkExecFallback.test.cjs`, `node src\__tests__\notificationIdentity.test.cjs`, `node src\__tests__\handleNewMessage.test.cjs`, `node src\__tests__\fileSizeLimits.test.cjs`, `npm run lint`, `git diff --check`.

### v1.2.55 — MAX: одинаковые входящие сообщения не блокируются dedup

Дата: 3 июля 2026. Кто нашёл: пользователь по MAX-чату с повторяющимися короткими сообщениями; Codex по `chatcenter.log`, `main/preloads/hooks/max.hook.js`, `src/utils/consoleMessageHandler.js`, `src/utils/webviewHandleNewMessage.js`, `main/handlers/notificationManager.js`.

Проблема: MAX реально отправлял новые события `max-sidebar` при росте `unread`, но renderer гасил одинаковый текст как дубль по ключу `messenger + sender + text`. В логе было `body="Выы"`, `prevBody="Выы"`, `unread=7 prevUnread=6`, затем `unread=8 prevUnread=7`, `action="show"`, после чего `notifDedup age=2581мс/4009мс` блокировал модалку и звук.

Решение: для `src=max-sidebar` в dedup-key добавлен номер unread (`u:N`), а в `extra.messageId` передаётся `max-sidebar:<sender>:<unread>`. `webviewHandleNewMessage` теперь отдаёт `messageId/source` в `app:custom-notify`, чтобы main dedup отличал реальные новые одинаковые сообщения. Dedup не отключён: повтор того же unread всё ещё блокируется.

Как должно работать: если клиент MAX прислал несколько одинаковых сообщений подряд и у строки чата вырос unread, каждое сообщение даёт звук и ribbon. Если сайт повторно прислал тот же самый unread/event, дубль остаётся тихим. `__CC_NOTIF__`, Notification API/SW, VK/Telegram/WhatsApp, avatar и общий Ribbon не менялись.

### v1.2.54 — Messenger Ribbon: окно уведомлений больше не уезжает за экран

Дата: 3 июля 2026. Кто нашёл: пользователь по сценарию “звук есть, модалки нет или модалки приходят пачкой позже”; Codex по `chatcenter.log`, `main/handlers/notifHandlers.js`, `main/notification.js`, `main/notification.css`, `main/handlers/notificationManager.js`.

Проблема: это оказалась не VK-проблема, а общий дефект Messenger Ribbon. При настройке `notifDismissSec=0` карточки не закрываются автоматически. Если включено раскрытие карточек и приходит несколько длинных уведомлений, renderer отправлял высоту вроде `1003`, `1275`, `1683`, а main ставил окно по формуле `y = workArea.height - height - 10`. Когда `height` больше экрана, `y` становился отрицательным, окно уходило выше экрана. Пользователь слышал звук, но не видел модалку, либо видел пачку позже в странном месте. Отдельно найдено, что скачивание avatar URL выполнялось до `notif:show`, поэтому медленная аватарка могла задержать показ карточки.

Решение: main теперь ограничивает высоту notification window рабочей областью экрана и никогда не ставит `y` выше верхней границы. Renderer получил внутреннюю прокрутку `#container`, поэтому уведомления остаются доступны, но окно не растёт бесконечно. Карточки не ужимаются по высоте: `.notif-item` закреплён как `flex: 0 0 auto`, а скролл включается на списке. Найден отдельный дефект этой же зоны: в `main/notification.js` оставался общий `MAX_ITEMS = 6`, который удалял старые карточки даже при `dismissMs=0`. Теперь лимит 6 применяется только к временным auto-dismiss уведомлениям, а режим "не закрывать автоматически" держит полный tracked-список до 30 карточек и прокручивает список. Новые карточки автоматически прокручиваются в видимую область. Аватарка больше не блокирует показ: уведомление отправляется сразу, а картинка догружается отдельным `notif:update-icon`.

Как должно работать: если пользователь поставил уведомления “не закрывать автоматически”, карточки продолжают копиться внутри прокручиваемого окна и не исчезают на шестой штуке. Модалка должна быть видна сразу после `NotifManager show`, не уезжать за экран и не зависеть от скорости скачивания аватарки. Звук, кнопки “Перейти к чату”, “Прочитано”, AI, dedup и источники VK/MAX/Telegram/WhatsApp не менялись.

Факт 3 июля 2026 по MAX-тесту: в `chatcenter.log` сообщения `Sdc/Sdg/Xxb/Zcg/Zxc/Sef` прошли `custom-notify recv -> NotifManager show` с `dismissMs=0`, но renderer показывал `items=6 containerChildren=6`. Значит потеря была не в MAX и не в звуке, а в старом лимите карточек окна уведомлений.

Проверки: `node src/__tests__/notificationWindowBounds.test.cjs`, `node src/__tests__/transparentWindowGuard.test.cjs`, `node src/__tests__/notifHooks.test.cjs`, `node src/__tests__/appStructure.test.cjs`, `npm run lint`, `npm test`.

### v1.2.53 — VK: отмена глобального mute WebView, медиа VK снова со звуком

Дата: 3 июля 2026. Кто нашёл: пользователь по VK-проверке; Codex по `chatcenter.log`, diagnostics report, `shared/vkExecFallback.js`, `src/utils/webviewSetup.js`.

Факты: реальные сообщения прошли `VK-EXEC kind=new-message -> custom-notify recv -> NotifManager show`. Статус набора шёл иначе: `reason=no-message-node`, sidebar `count=0`, `preview=печатает`, `raw=title+preview`. Значит это служебная строка VK. Отдельно пользователь указал: `setAudioMuted(true)` глушит не только уведомление, но и видео/аудио VK.

Решение: `isSidebarTypingStatus()` и `decision=block-typing-status` оставлены. Правило работает только для VK sidebar-строки без unread badge, где `rawCompact === title+preview`. Глобальное глушение VK WebView через Electron `setAudioMuted(true)` удалено: по документации Electron это mute всей guest page. Из VK hook убран общий mute `window.Audio`, `document.createElement('audio')` и `AudioContext.createGain()`.

Как должно работать: входящее VK-сообщение даёт модалку, аватар и системный звук ChatCenter. `Печатает` не даёт модалку и видно как `decision=block-typing-status`. Видео/аудио/голосовые внутри VK WebView должны звучать нормально.

Почему предыдущее решение не подходит: `setAudioMuted(true)` убирал внутренний звук VK, но одновременно отключал весь звук сайта VK. Это ухудшало обычные функции пользователя и поэтому отменено.

### v1.2.51 — VK: подробная sidebar-диагностика перед ремонтом уведомлений

Дата: 3 июля 2026. Кто нашёл: пользователь по VK-сценарию “первое уведомление пропало, следующее появилось”; Codex по `chatcenter.log` и `system-diagnostics-report.json`.

Проблема: `sidebar-scan reason=baseline-spa-rebind rows=171 emitted=0` показывал факт блокировки, но не объяснял конкретную строку VK. Не было `sender/preview/count/selected/raw/freshMin/prevPreview/decision`, поэтому нельзя было доказать, что `печатает` — служебное состояние, а не пользовательский текст.

Что сделано: добавлен диагностический `VK-EXEC kind=sidebar-row` без изменения правил уведомлений и без словарных блокировок. При `baseline-spa-rebind` логируются первые видимые строки, при mutation — unread/изменённые/emit строки. В detail есть `row/count/selected/freshMin/decision/title/preview/raw/prevPreview`.

Как использовать: если `decision=block-baseline`, `count>0` и `raw` показывает свежий unread — чинить baseline-fresh. Если `preview=печатает`, но `raw/структура` показывает typing/status без message badge — чинить структурный фильтр, не слово.

Проверки: `node src/__tests__/vkExecFallback.test.cjs`.

### v1.2.50 — VK: свежие unread в sidebar не теряются при spa-rebind

Дата: 2 июля 2026. Кто нашёл: пользователь по VK-сценарию, где открыта одна переписка, а слева у другого VK-чата уже появился свежий badge `1/2`, но модалки и звука не было; Codex по `chatcenter.log`, диагностике VK и коду `shared/vkExecFallback.js`.

Проблема: v1.2.49 починила реальные новые сообщения в уже открытом VK-чате, но оставался другой сценарий. После перезагрузки/SPA-перепривязки VK sidebar observer мог увидеть уже видимый свежий unread-badge как стартовый baseline (`reason=baseline-spa-rebind`). Из-за этого строка чата попадала в `sidebarSeen`, но не шла дальше в `handleNewMessage`, `sound`, `ribbon` и модалку. В диагностике это выглядело так: есть `VK-EXEC kind=sidebar-scan reason=baseline-spa-rebind`, но нет `source:'vk-sidebar-unread'` и нет цепочки уведомления.

Решение: для `baseline-spa-rebind` добавлено ограниченное восстановление только свежих unread-строк. Если строка VK sidebar имеет `count > 0`, preview и свежий возраст (`только что`, `1м`, `2м` и до 10 минут), она отправляется как `source:'vk-sidebar-unread'` с `reason:'baseline-fresh-unread'`. Старые строки с часами/днями остаются baseline, чтобы не вернуть фантомы старой истории. Добавлена память `sidebarNotified`, чтобы одна и та же свежая строка не дублировалась при повторной перепривязке.

Диагностика: `VK-EXEC` теперь пишет `rows` и `emitted` для `sidebar-scan`, чтобы было видно, сколько строк sidebar проверено и сколько уведомлений реально отправлено. Для проверки нужно смотреть связку `sidebar-scan ... rows=N emitted=1`, затем `vk-sidebar-unread`, затем `handle -> sound -> ribbon`.

Как должно работать: если в другом VK-чате слева появился свежий unread-badge с preview, уведомление должно появиться даже если observer подключился после появления badge. Если unread старый (`1ч`, `2д`, дата) или строка уже была обработана, уведомление не создаётся повторно. MAX/WhatsApp/Telegram/API не затронуты.

Проверки: `node src/__tests__/vkExecFallback.test.cjs`, `node src/__tests__/integration.test.cjs`, `node src/__tests__/handleNewMessage.test.cjs`, `node src/__tests__/fileSizeLimits.test.cjs`, `node src/__tests__/memoryBankSizeLimits.test.cjs`, `node src/__tests__/featuresReferences.test.cjs`, `npm test`.

### v1.2.49 — VK: новые сообщения в уже открытом чате

Дата: 2 июля 2026. Кто нашёл: пользователь по VK-чату `Елена Дугина`; Codex по `chatcenter.log`, диагностике VK и коду `shared/vkExecFallback.js` / `webviewHandleNewMessage.js`.

Проблема: v1.2.47 грубо блокировала весь `source:'vk-exec-fallback'`, когда пользователь смотрит VK-вкладку. Это убрало фантомы старой истории, но реальные входящие сообщения в уже открытом чате (`Попробуем`, `Хуже не будет`, `Одну банку купим да и посмотрим`) тоже останавливались до `sound` и `ribbon`.

Решение: активный `vk-exec-fallback` теперь проходит только с доказательством `vkActiveUnread=true`: DOM-сообщение должно быть после разделителя VK `Новые сообщения`. Старые виртуализированные DOM-вставки без этого маркера остаются заблокированы. Дополнительно sidebar observer выбирает родителя с несколькими `ConvoListItem`, чтобы слушать весь список, а не одну строку.

Как должно работать: если пользователь открыт в VK-чате и клиент прислал новые сообщения под разделителем `Новые сообщения`, будет звук и модалка с sender/avatar. Если VK переиспользовал старые DOM-узлы при скролле/переходе, уведомления не будет. Другие мессенджеры не затронуты.

Проверки: `node src/__tests__/vkExecFallback.test.cjs`, `node src/__tests__/integration.test.cjs`, `node src/__tests__/handleNewMessage.test.cjs`.
### v1.2.48 — VK: уведомления из sidebar unread для видео/медиа/текста

Дата: 2 июля 2026. Кто нашёл: пользователь (`Artem Artem` открыт, слева `Елена Дугина` с badge `1` и preview `Видеосообщение`); Codex по `system-diagnostics-report.json`, `chatcenter.log`, `shared/vkExecFallback.js`.

Проблема: v1.2.47 защитила активную историю VK от старых DOM-фантомов, но резервный `VK-EXEC` слушал только `.ConvoMain__history`. Новое сообщение в другом VK-чате было видно только в sidebar: `Елена Дугина Видеосообщение unread=1 avatar=...`; до `handleNewMessage`, `sound`, `ribbon`, `app:custom-notify` оно не доходило.

Что изменено: `shared/vkExecFallback.js` получил sidebar observer. Он делает baseline и шлёт `source:'vk-sidebar-unread'` только при изменении строки с `unread > 0`, preview, sender и avatar. Активная история остаётся `source:'vk-exec-fallback'` и блокируется, если пользователь уже смотрит эту VK-вкладку.

Безопасность и итог: словарных блокировок нет, `Видеосообщение` не зашито, старые unread-строки при старте не стреляют, выбранный чат не уведомляет сам себя, MAX/WhatsApp/Telegram/API не затронуты. Если в другом VK-чате слева появился badge `1` и preview (`Видеосообщение`, `Фото`, текст), приложение показывает модалку с именем и аватаркой из sidebar; старые сообщения открытой истории v1.2.47 продолжает блокировать.

Проверки: `node src/__tests__/vkExecFallback.test.cjs`, `node src/__tests__/integration.test.cjs`, `npm run lint`, `npm run build`, `npm test`.

### v1.2.47 — VK: active-chat guard для резервного VK-EXEC fallback

Дата: 2 июля 2026. Кто нашёл: пользователь по VK-чату `Artem Artem`; Codex по `system-diagnostics-report.json`, `chatcenter.log`, `shared/vkExecFallback.js`, `webviewHandleNewMessage.js`.

Проблема: v1.2.46 добавила резервный `VK-EXEC`, но VK Web при входе в чат/фокусе поля ввода заново вставлял старые DOM-узлы. Диагностика показала `VK preload missing heartbeat`, `VK-EXEC injected`, затем старые тексты (`У тебя всегда хорошие идеи приходят`, `Фартовый)`, `Нет`, `Ох этот Иван`) дошли до `app:custom-notify` и `[NotifManager] show`.

Решение: `src/utils/webviewHandleNewMessage.js` блокирует только `source === 'vk-exec-fallback'`, когда окно в фокусе и активна VK-вкладка. Фоновые VK-уведомления не отключены; MAX/WhatsApp/Telegram/API не затронуты; словарных блокировок нет. В диагностике видно `VK-EXEC active visible chat`.

Как работает: если VK заново вставил старую историю открытого чата, событие останавливается на `viewing`. Если VK не активен или окно не в фокусе, fallback продолжает идти в общий путь уведомлений.

Проверки: `node src/__tests__/integration.test.cjs`, `node src/__tests__/vkExecFallback.test.cjs`, `node src/__tests__/handleNewMessage.test.cjs`, `node src/__tests__/fileSizeLimits.test.cjs`, `node src/__tests__/memoryBankSizeLimits.test.cjs`, `node src/__tests__/featuresReferences.test.cjs`, `npm run lint`, `npm run build`, `npm test`.

### v1.2.46 — VK: fallback live-observer, если monitor preload не запустился

Дата: 2 июля 2026. Проблема: VK WebView иногда не запускал штатный `monitor.preload.cjs`, поэтому ручная глубокая диагностика видела DOM-сообщения, а live-цепочка `new-message -> sound -> ribbon` не срабатывала. Решение: добавлен heartbeat `monitor-ready`; если heartbeat нет, renderer ставит резервный `VK-EXEC` через `executeJavaScript`, который требует структурный DOM-узел сообщения, baseline и не-исходящее направление. Общий путь `handleNewMessage` сохранён. Подробная история была закрыта в v1.2.46; последующие уточнения VK см. v1.2.47-v1.2.52.

Проверки: `node src/__tests__/vkExecFallback.test.cjs`, `node src/__tests__/monitorPreload.test.cjs`, `npm run lint`, `npm run build`, `npm test`.
### v1.2.45 — VK: DOM observer подключён к модалке уведомлений

Дата: 2 июля 2026. Проблема: входящее VK-сообщение было видно в открытом чате, но сигнал не доходил до общей цепочки `new-message -> handleNewMessage -> app:custom-notify -> NotifManager/sound/ribbon`. Причина: `vkDiagnostics` фиксировал `candidate-new-incoming`, но оставлял его как diagnostic-only.

Решение: `vkDiagnostics.js` после проверок `не baseline`, `есть текст`, `не исходящее` отправляет `new-message` с `source:'vk-dom-observer'`, а `monitor.preload.cjs` сохраняет диагностику и пропускает входящие VK в общий путь уведомлений. Старые baseline, исходящие и пустые кандидаты не уведомляют.

Проверки: `node src/__tests__/monitorPreload.test.cjs`, `node src/__tests__/integration.test.cjs`, `node src/__tests__/handleNewMessage.test.cjs`, `npm test`.
### v1.2.44 — VK: `withoutBubbles` больше не считается исходящим сообщением

Дата: 2 июля 2026.
Кто нашёл: пользователь по VK-кейсу, где входящее сообщение `Это пример` было видно в чате, но не давало модалку и звук; Codex по фоновой диагностике, `system-diagnostics-report.json`, `chatcenter.log`, `messageRetrieval.js`, `vkDiagnostics.js` и `webviewDiagnostics.js`.

Проблема: VK иногда показывает входящие сообщения в DOM с классами вроде `ConvoMessageWithoutBubble` / `ConvoHistory__messageBlock--withoutBubbles`. Старый фильтр исходящих искал слишком широко: любую подстроку `out|own|self|sent`. Из-за этого слово `withoutBubbles` содержало `out`, входящее сообщение ошибочно считалось исходящим, и цепочка уведомления останавливалась до `__CC_NOTIF__`, модалки и звука.

Что было видно по фактам:
1. Сообщение `Это пример` было найдено в VK-чате и диагностике.
2. Автор в DOM был клиентом, не оператором.
3. Аватарка клиента была найдена.
4. В отчёте не было `__CC_NOTIF__`, `NotifManager show`, `sound` и `ribbon` для этого сообщения.
5. Диагностика показывала `outgoing=true`.
6. `outgoingEvidence.reason` указывал на `class:out`, хотя реальный класс был `withoutBubbles`.
7. Значит проблема была не в звуке, не в модалке и не в аватарке, а в неверном определении направления сообщения.

Что изменено:
- `main/preloads/utils/messageRetrieval.js`: добавлен `isVKOutgoingMessage`, который признаёт исходящим только точные VK-маркеры: `ConvoStack--out`, `ConvoMessage--out`, `im-mess_out`, `message_out`, `data-out/data-outgoing/data-own=true`, aria `вы отправили / you sent / исходящ`;
- `main/preloads/utils/vkDiagnostics.js`: `outgoingEvidence` больше не ловит голую подстроку `out`, а пишет точный `classExactVkOutgoing`;
- `main/preloads/utils/diagnostics.js`: подробная диагностика VK использует тот же точный механизм исходящих;
- `src/utils/webviewDiagnostics.js`: renderer deep-check VK приведён к той же логике, чтобы отчёт и рабочий preload не расходились;
- `src/__tests__/monitorPreload.test.cjs` и `src/__tests__/systemDiagnosticsUi.test.cjs`: добавлены проверки, что `withoutBubbles` не считается исходящим, а реальный `ConvoStack--out` считается.

Почему выбрано именно так:
1. Мы не блокируем текст сообщения и не вводим словари запрещённых слов.
2. Мы не отключаем VK fallback и не ломаем другие мессенджеры.
3. Исправлен корень проблемы: направление сообщения определяется по структуре VK, а не по случайной подстроке.
4. Реальные исходящие сообщения оператора всё ещё отсекаются по точным VK-маркерам.
5. Входящие сообщения без bubble теперь могут пройти дальше к уведомлению, звуку и модалке.
6. Диагностика и рабочий код используют одинаковые правила, поэтому следующий отчёт будет проверяемым.
7. Тесты защищают от возврата старого широкого `/out|own|self|sent/` подхода.

Как должно работать после исправления:
1. Если клиент пишет сообщение в VK, а DOM содержит `withoutBubbles`, приложение не считает его исходящим только из-за `out`.
2. Если сообщение реально отправлено оператором и VK пометил его `ConvoStack--out` или аналогичным точным маркером, уведомление не создаётся.
3. В диагностике по VK надо смотреть `outgoingEvidence.reason` и `classExactVkOutgoing`: там будет видно, какой точный признак сработал.
4. Для входящего `withoutBubbles` ожидается `outgoing=false`, дальше должны появиться рабочие события уведомления.

Проверки: `node src/__tests__/monitorPreload.test.cjs`, `node src/__tests__/systemDiagnosticsUi.test.cjs`, `node src/__tests__/fileSizeLimits.test.cjs`, `node src/__tests__/featuresReferences.test.cjs`, `node src/__tests__/memoryBankSizeLimits.test.cjs`, `npm test`, `npm run lint`, `npm run build`.

### v1.2.43 — VK: диагностика показывает причину пропуска уведомления

Дата: 2 июля 2026.
Кто нашёл: пользователь по кейсу VK, где сообщение `Ну плакал конечно когда пальчик прокололи` было видно в чате и в диагностике, но не было модалки и звука; Codex по `system-diagnostics-report.json`, `chatcenter.log`, `vkDiagnostics.js` и `webviewDiagnostics.js`.

Проблема: диагностика уже видела VK DOM, текст сообщения, чат и аватарку, но не показывала короткое решение: почему это DOM-событие не стало уведомлением. В отчёте были длинные `vkFull` и `candidate-skip`, но не было отдельного маркера, который прямо отвечает: `wouldEmit`, `emitBlockedBy`, какой признак сделал сообщение `outgoing`, кто автор сообщения по DOM.

Что было видно по фактам:
1. Сообщение было найдено в отчёте и `chatcenter.log`.
2. URL чата VK совпадал с активным чатом пользователя.
3. Аватарка в DOM была.
4. В момент сообщения не было `__CC_NOTIF__`.
5. Не было `app:custom-notify`, `NotifManager show`, `sound` и `ribbon`.
6. В `vkFull` сообщение выглядело как `outgoing:true`, но отчёт не показывал, какой именно признак дал этот результат.

Что изменено:
- `main/preloads/utils/vkDiagnostics.js`: добавлен `outgoingEvidence` с полями `reason`, `className`, `dataOut`, `aria`, `checks`;
- `vkDiagnostics.js`: добавлен `authorFromMessage`, чтобы рядом с текстом было видно автора из DOM сообщения;
- `vkDiagnostics.js`: добавлен `notifyDecision` / `wouldEmit` / `emitBlockedBy` / `expectedNext`;
- `vkDiagnostics.js`: добавлен короткий лог-маркер `[VK-DIAG] notify-decision`, который можно искать в отчёте без чтения огромного HTML;
- `src/utils/webviewDiagnostics.js`: `vkFull.messages[]` теперь тоже содержит `outgoingEvidence` и `authorFromMessage`;
- `src/__tests__/monitorPreload.test.cjs`: добавлен тест, что VK-диагностика пишет решение и остаётся read-only;
- `src/__tests__/systemDiagnosticsUi.test.cjs`: добавлен тест, что `vkFull` сохраняет доказательства направления и автора.

Почему выбрано именно так:
1. Уведомления VK пока не менялись, чтобы не сломать рабочие пути.
2. Диагностика теперь отвечает на главный вопрос: кто остановил уведомление.
3. Если причина `outgoing-own-message`, будет видно, какой именно класс/data/aria сработал.
4. Если причина `baseline-existing-message`, будет видно, что сообщение уже было в baseline.
5. До v1.2.45 причина `diagnostic-read-only` означала: диагностика увидела нового входящего кандидата, но сама не имела права отправлять уведомление. С v1.2.45 новый входящий кандидат идёт через `vk-dom-observer -> IPC new-message -> app:custom-notify`.
6. `vkFull` и `[VK-DIAG]` теперь дают одинаковые доказательства, поэтому не нужно гадать по двум разным форматам.
7. Это изменение не создаёт фантомные уведомления: `vkDiagnostics.js` по-прежнему не эмитит `new-message`, `__CC_MSG__` или `__CC_NOTIF__`.

Как должно работать:
1. Пользователь включает диагностику VK и воспроизводит проблему.
2. В отчёте надо искать `[VK-DIAG] notify-decision`.
3. По `emitBlockedBy` видно точную причину пропуска.
4. По `outgoingEvidence.reason` видно, какой признак сделал сообщение исходящим.
5. По `authorFromMessage`, `headerSender`, `headerAvatar`, `messageTextRaw` видно, кто написал сообщение и из какого чата оно пришло.
6. После следующего воспроизведения можно чинить уже конкретную причину, а не менять фильтры вслепую.

Проверки: `node src/__tests__/monitorPreload.test.cjs`, `node src/__tests__/systemDiagnosticsUi.test.cjs`, `npm run lint`, `npm run build`.

### v1.2.42 — UI диагностики: длинные payload больше не ломают маленькую панель

Дата: 2 июля 2026.
Кто нашёл: пользователь по скриншоту маленькой панели диагностики, где длинный VK/HTML payload вытолкнул кнопки управления вверх и сделал панель неудобной.

Проблема: после усиления VK-диагностики в `v1.2.41` в live-ленту стали попадать очень длинные строки `vkFull` с HTML и DOM-цепочками. Это правильно для отчёта и разбора ИИ, но UI маленькой плавающей панели показывал событие обычным текстовым блоком без ограниченной высоты. Из-за этого длинный текст растягивал панель, а кнопки `Развернуть`, `Стоп`, `Сохранить`, `Скопировать`, `Очистить` могли уходить за видимую область.

Что изменено:
- `src/components/DiagnosticsFloatingPanel.jsx`: live-лента маленькой панели получила отдельный контейнер `eventList` с ограниченной высотой и внутренним скроллом;
- текст одного события получил стиль `eventText` с переносом длинных строк, `overflowWrap: anywhere`, `wordBreak: break-word` и внутренним скроллом;
- `src/components/SystemDiagnosticsModal.jsx`: mono-текст большого окна тоже переносит длинные строки, чтобы JSON/HTML не раздвигал модалку по ширине;
- `src/__tests__/systemDiagnosticsUi.test.cjs`: добавлен тест, который проверяет, что длинные payload остаются внутри прокручиваемой области и не ломают layout.

Почему выбрано именно так:
1. Полные `vkFull` данные нельзя резать на уровне отчёта: они нужны для точного разбора уведомлений VK.
2. Проблема была не в диагностике, а в отображении длинного текста.
3. Ограничение сделано только в UI: JSON-отчёт и копирование для ИИ сохраняют полные данные.
4. Кнопки остаются доступными даже при огромном HTML payload.
5. Маленькая панель остаётся компактной и не мешает работе с чатами.

Как должно работать:
1. При включённой диагностике длинные события `vkFull` могут появляться в маленькой панели.
2. Панель не растягивается выше экрана.
3. Кнопки управления остаются видимыми.
4. Длинный текст события прокручивается внутри своего блока.
5. При сохранении/копировании отчёта полные данные остаются доступны для другого ИИ.

### v1.2.41 — VK: диагностика подключена к реальному renderer/WebView deep-check пути

Дата: 1 июля 2026.
Кто нашёл: пользователь по повторному VK-кейсу, где после перезапуска сообщения `Да хоть два`, `Раз`, `Два` были видны в VK-чате, но в сохранённой диагностике не было ни `[VK-DIAG]`, ни `vkFull`; Codex по сравнению `system-diagnostics-report.json`, `chatcenter.log` и кода `monitor.preload.cjs` / `webviewDiagnostics.js`.

Проблема: v1.2.40 добавила подробную VK-диагностику в `monitor.preload.cjs`, но свежие отчёты показали, что реальная фоновая диагностика пользователя пишет старые строки `health/probe/blackscreen` из renderer `executeJavaScript`, а не строки `monitor-start`, `[VK-DIAG]` или `vkFull` из preload. То есть диагностика была правильной по идее, но подключена не к тому пути, который реально работал во время записи.

Что было видно по фактам:
- отчёт и `chatcenter.log` обновлялись после перезапуска приложения;
- в них были VK `healthCheck`, `probe[doc]`, `probe[url]`, `probe[bubbles]`, `blackscreen`;
- в них не было `[VK-DIAG]`, `vkFull`, `monitor-start: type=vk`;
- сообщения пользователя на экране VK были видны, но диагностический JSON не показывал контейнер сообщений, incoming/outgoing, header/avatar и DOM-узлы;
- значит чинить уведомления VK дальше было рискованно: не было доказательства, на каком участке теряется первое сообщение.

Что изменено:
- `src/utils/webviewDiagnostics.js`: добавлен `runVkFullProbe()`, который запускается через тот же renderer `executeJavaScript` путь, что уже писал `health/probe`;
- `runDomProbe()` теперь дополнительно вызывает VK full snapshot для VK-вкладки;
- `src/hooks/useDiagnosticsSession.js`: фоновая запись передаёт выбранную цель диагностики в deep-check;
- `src/App.jsx`: deep-check теперь, если выбрана конкретная вкладка, проверяет именно её WebView, запускает `runDomProbe()` и отправляет `run-diagnostics` в WebView;
- `src/utils/webviewSetup.js`: `VK-DIAG` и `vkFull` не режутся в `traceNotif` / `chatcenter.log`;
- `src/utils/diagnosticsSession.js`: `VK-DIAG` и `vkFull` попадают в live-ленту и сохраняются длинным payload;
- `src/utils/systemDiagnostics.js`: `vkFull` классифицируется как WebView-событие;
- `src/__tests__/systemDiagnosticsUi.test.cjs`: добавлены проверки, что выбранная вкладка передаётся в deep-check, VK пишет `__CC_DIAG__vkFull`, а payload не режется.

Почему выбрано именно так:
1. Мы не меняем уведомления VK, звук, dedup и ribbon, пока не увидим точную цепочку.
2. Реально работающий путь уже доказан логами: `health/probe/blackscreen` приходили именно от renderer `executeJavaScript`.
3. Preload-путь мог быть старым, неактивным или не тем, который использует текущая запись; поэтому полагаться только на него нельзя.
4. Выбранная вкладка теперь проверяется явно, а не только если она случайно попала в список проблемных подключений.
5. `vkFull` пишет контейнер, header/avatar, sidebar, последние сообщения, `outgoing` и `outerHTML`, чтобы следующий разбор видел не догадку, а факты.
6. Снимок не эмитит `new-message`, `__CC_MSG__` или `__CC_NOTIF__`, поэтому сам не создаёт фантомные уведомления.
7. Полные строки нужны, потому что раньше обрезание скрывало именно те данные, по которым можно отличить bubble от header/sidebar.
8. Сохранённый JSON теперь должен показать разрыв: VK DOM увидел сообщение, hook/console/pipeline его не передал, либо наоборот.
9. Изменение изолировано в диагностике и не трогает рабочие пути MAX/Telegram/WhatsApp.
10. Это закрывает ошибку v1.2.40: "диагностика добавлена, но в реальном отчёте её нет".

Как должно работать:
1. Пользователь открывает `Диагностика системы`, выбирает `ВКонтакте / VK WebView` и включает запись.
2. Каждые 3 секунды запись запускает deep-check именно выбранной VK-вкладки.
3. В `chatcenter.log`, live-ленте и `system-diagnostics-report.json` появляются строки `vkFull`.
4. В `vkFull` должны быть `containerFound`, `containerSelector`, `header.sender`, `header.avatar`, `messages[]`, `outgoing`, `sidebar[]`, `outerHTML`.
5. Если первое VK-сообщение снова не даст уведомление, следующий ИИ должен смотреть: есть ли это сообщение в `vkFull.messages`; если есть, дальше проверять `__CC_NOTIF__`, `__CC_MSG__`, `source`, `dedup`, `ribbon`, `sound`.

Проверки: `node src/__tests__/systemDiagnosticsUi.test.cjs`, `node src/__tests__/systemDiagnostics.test.cjs`, `node src/__tests__/monitorPreload.test.cjs`, `npm run lint`, `npm run build`, `npm test`.

### v1.2.40 — VK: полная диагностика активного чата без изменения уведомлений

Дата: 1 июля 2026.
Кто нашёл: пользователь по кейсу VK, где сообщение в активном чате было видно на экране, но модалка уведомления и звук появлялись не всегда; Codex по свежим диагностическим отчётам и коду preload/renderer.

Проблема: до этой версии диагностика показывала, что VK выбран как цель и что WebView живой, но не давала полной картины внутри активного чата. В отчёте не хватало доказательств: какой именно DOM-контейнер изменился, какой узел VK считает сообщением, было ли сообщение входящим или исходящим, попало ли оно в baseline старых сообщений, есть ли sender/avatar в header, почему кандидат был пропущен. Из-за этого исправлять уведомления VK было рискованно: можно было снова скрыть симптом, вернуть фантомы или начать показывать свои исходящие сообщения как входящие.

Что изменено:
- `main/preloads/utils/vkDiagnostics.js`: добавлена отдельная VK-only диагностика активного чата. Она не отправляет `new-message`, `__CC_MSG__` или `__CC_NOTIF__`, а только пишет `[VK-DIAG]` в monitor diagnostics;
- `main/preloads/monitor.preload.cjs`: для VK старый общий `chatObserver` не используется как источник уведомлений; вместо него запускается диагностический observer активного контейнера VK;
- VK observer пишет `observer-bound`, baseline существующих сообщений, `mutation-start`, `candidate-skip`, `candidate-new-incoming`, `emit-new-message`, `manual-snapshot`, `navigation` и причины решений: `outside-container`, `no-message-node`, `no-text`, `baseline-existing-message`, `outgoing-own-message`, `new-incoming-candidate-emit`;
- в каждый VK-кандидат добавлены `text`, сырые `nodeTextRaw`, `messageTextRaw`, `messageOuterHTML`, `outgoing`, `baselineHit`, `fingerprint`, `messageId`, `parentChain`, `headerSender`, `headerAvatar`, `title`, `url`;
- `main/preloads/utils/diagnostics.js`: ручной VK-снимок `vkFull` теперь сохраняет контейнеры, сообщения, заголовки, счётчики и ссылки, включая полный `outerHTML` контейнеров и сообщений;
- `src/utils/webviewSetup.js`: диагностические записи `VK-DIAG` и `vkFull` больше не режутся короткой строкой в renderer trace;
- `src/utils/systemDiagnostics.js`: строки `[VK-DIAG]` классифицируются как WebView-цепочки, чтобы они попадали в нужный раздел отчёта;
- `src/__tests__/monitorPreload.test.cjs` и `src/__tests__/systemDiagnostics.test.cjs`: добавлены проверки, что VK-диагностика подключена, пишет baseline/candidate evidence, не эмитит уведомления и попадает в WebView-цепочки.

Почему выбрано именно так:
1. Сейчас нельзя безопасно чинить VK-уведомления без точного источника события.
2. `__CC_NOTIF__` и другие рабочие пути уведомлений не трогались.
3. Новая VK-диагностика ничего не показывает пользователю сама по себе, поэтому не может создать новые фантомные модалки.
4. Baseline нужен, чтобы отличать старые уже отрисованные сообщения от реально добавленных после включения записи.
5. Outgoing-признаки нужны, чтобы не принять отправленное нами сообщение за входящее.
6. Полный `outerHTML` нужен, потому что VK может менять классы и вложенность, а короткого текста недостаточно для следующего разбора.
7. Классификация `[VK-DIAG]` как WebView нужна, чтобы другой ИИ не искал VK-события в общем шуме логов.
8. Обрезание diagnostic payload убрано для VK, потому что именно потерянные детали мешали увидеть корень.
9. Изменение диагностическое: pipeline уведомлений, звук, ribbon, аватарки и dedup не менялись.
10. Это снижает риск следующего фикса: мы будем видеть не догадку, а конкретное DOM-событие и причину решения.

Как должно работать:
1. Пользователь открывает `🩺 Диагностика системы`, выбирает `ВКонтакте / VK WebView` и включает запись.
2. Диагностика создаёт baseline текущих сообщений активного VK-чата.
3. Пользователь воспроизводит проблему: новое сообщение, переход по чатам, поиск, активный чат, входящее/исходящее.
4. В отчёте появляются строки `[VK-DIAG]` с полной цепочкой: какой контейнер наблюдался, какие мутации пришли, какие кандидаты найдены и почему каждый был принят как кандидат или пропущен.
5. Если VK покажет сообщение в DOM, но приложение не покажет модалку, следующий разбор должен увидеть точный разрыв между DOM-событием и уведомительным pipeline.

Проверки: `node src/__tests__/monitorPreload.test.cjs`, `node src/__tests__/systemDiagnostics.test.cjs`, `node src/__tests__/fileSizeLimits.test.cjs`, `npm run lint`, `npm run build`.

### v1.2.39 — диагностика: компактный выбор вкладки и без служебного `about:blank`

Дата: 1 июля 2026.
Кто нашёл: пользователь по экрану диагностики, где одновременно отображались `ЦентрЧатов` с `about:blank` и `ЦентрЧатов API`.

Проблема: после v1.2.38 список целей диагностики брал все элементы `messengers`. В него попала служебная WebView-вкладка `ЦентрЧатов` с `about:blank`, которая не является реальным мессенджером для диагностики уведомлений. Из-за этого рядом с настоящим `ЦентрЧатов API` пользователь видел два похожих пункта. Вторая проблема: полный список карточек занимал слишком много места; удобнее выбирать цель рядом с кнопкой включения записи.

Что изменено:
- `src/utils/diagnosticsTargets.js`: служебные `about:blank`, пустые URL и `about:`/`devtools:` вкладки больше не попадают в список целей диагностики;
- `src/components/SystemDiagnosticsModal.jsx`: большие карточки целей заменены на компактный выпадающий список слева от кнопки `Включить запись`;
- `src/__tests__/diagnosticsSession.test.cjs`: добавлен тест, что реальный VK остаётся в целях, `ЦентрЧатов about:blank` исключается, а `ЦентрЧатов API` остаётся;
- `src/__tests__/systemDiagnosticsUi.test.cjs`: добавлена проверка, что выбор цели сделан через компактный `<select>`, а старые карточки не возвращаются.

Почему выбрано именно так:
1. `about:blank` не имеет собственного мессенджера, URL и уведомительной цепочки, поэтому диагностировать его как WebView-вкладку бессмысленно.
2. API-режим ЦентрЧатов остаётся отдельной целью, потому что это реальная наша разработка подключения по API.
3. Выпадающий список занимает меньше места и находится там, где пользователь принимает решение: прямо перед запуском записи.
4. Pipeline уведомлений, звук, ribbon, аватарки и dedup не менялись.

Как должно работать:
1. В списке целей видны реальные WebView-вкладки: VK, MAX, Telegram Web, WhatsApp и другие реальные URL.
2. Служебный `ЦентрЧатов about:blank` не показывается.
3. `ЦентрЧатов API` показывается один раз как отдельная API-цель.
4. Выбор цели находится слева от кнопки `Включить запись`.
5. Сохранённый отчёт по-прежнему содержит `diagnosticsTarget` и `diagnosticsSession.target`.

Проверки: `node src/__tests__/diagnosticsSession.test.cjs`, `node src/__tests__/systemDiagnosticsUi.test.cjs`, `npm run lint`, `npm run build`, `npm test`.

### v1.2.38 — диагностика выбирает конкретную вкладку и сохраняет паспорт отчёта

Дата: 1 июля 2026.
Кто нашёл: пользователь по экрану настроек и обсуждению VK/MAX диагностики; Codex по коду `SystemDiagnosticsModal.jsx`, `DiagnosticsSessionHost.jsx`, `useDiagnosticsSession.js`, `diagnosticsSession.js`, `SettingsPanel.jsx`.

Проблема: диагностика выглядела как общая кнопка "Диагностика системы", но фактически разные мессенджеры требуют разных правил разбора. MAX уже имеет глубокую диагностику fallback, VK только начинает получать отдельный разбор, Telegram Web, WhatsApp Web и API-режим тоже отличаются. Старая правая плашка "Статус записи выключена · N" в настройках путала пользователя: число могло относиться к live-сессии или последнему отчёту, но не показывало, по какой вкладке этот отчёт собран.

Что изменено:
- `src/utils/diagnosticsTargets.js`: добавлен единый построитель целей диагностики из текущих вкладок WebView и API-режима ЦентрЧатов;
- `src/components/SystemDiagnosticsModal.jsx`: перед запуском записи добавлен блок "Что диагностируем" со списком конкретных вкладок; выбор блокируется во время активной записи, чтобы не смешивать два объекта в один отчёт;
- `src/hooks/useDiagnosticsSession.js`: старт записи принимает выбранную цель и сохраняет её в сессии;
- `src/utils/diagnosticsSession.js`: JSON-отчёт теперь содержит `diagnosticsTarget`, `diagnosticsSession.target` и `sections` с разделением на `notificationPipeline`, `webview`, `messengerSpecific`, `errors`;
- `src/components/DiagnosticsFloatingPanel.jsx`: маленькая панель показывает выбранную цель, чтобы при фоновой записи было видно, что именно диагностируется;
- `src/components/SettingsPanel.jsx`: старая отдельная плашка статуса справа от кнопки диагностики удалена; кнопка открытия диагностики осталась;
- `src/__tests__/systemDiagnosticsUi.test.cjs`, `src/__tests__/diagnosticsSession.test.cjs`, `src/__tests__/appStructure.test.cjs`: добавлены проверки выбора цели, паспорта отчёта и отсутствия старой плашки.

Почему выбрано именно так:
1. Диагностика по всем вкладкам сразу не нужна: она создаёт шум и смешивает MAX/VK/Telegram/WhatsApp/API.
2. Статус "базовая/полная" не нужен: пользователь ожидает максимальную диагностику выбранной вкладки.
3. Паспорт отчёта важнее отдельной плашки: другой ИИ сразу видит `tabId`, название, тип мессенджера, WebView/API и URL.
4. MAX fallback не смешивается с VK-разбором: секции отчёта позволяют держать правила каждого мессенджера отдельно.
5. Pipeline уведомлений, звук, ribbon, аватарки и dedup не менялись; изменение касается выбора цели и структуры диагностики.

Как должно работать:
1. Пользователь открывает `🩺 Диагностика системы`.
2. Вверху выбирает конкретную вкладку: VK WebView, MAX WebView, Telegram WebView, WhatsApp WebView или API-режим.
3. Нажимает "Включить запись выбранной вкладки".
4. Большую модалку можно свернуть в фон; маленькая панель показывает, какая цель пишется.
5. При остановке отчёт сохраняется в `userData/system-diagnostics-report.json`.
6. В отчёте есть `diagnosticsTarget` и `sections`, поэтому другой ИИ может понять, по какой вкладке собраны события и где смотреть цепочку уведомления.

Проверки: `node src/__tests__/diagnosticsSession.test.cjs`, `node src/__tests__/systemDiagnosticsUi.test.cjs`, `node src/__tests__/appStructure.test.cjs`, `npm run lint`, `npm run build`, полный `npm test`.

### v1.2.37 — диагностика стала проще: без дублей и непонятного ручного снимка

Дата: 1 июля 2026.
Кто нашёл: пользователь по экрану диагностики, где одновременно были две кнопки "Свернуть в фон", отдельная "Обновить снимок" и неочевидная кнопка "Закрыть" в маленькой панели.

Проблема: интерфейс диагностики работал, но путал пользователя. "Свернуть в фон" был в шапке и внутри блока записи, оба действия делали одно и то же. "Обновить снимок" выглядела как обязательная кнопка, хотя при включённой фоновой записи диагностика уже обновляется автоматически каждые 3 секунды. В маленькой панели "Закрыть" фактически делал "стоп + сохранить + скрыть", но по названию выглядел как обычное закрытие окна.

Что изменено:
- `src/components/SystemDiagnosticsModal.jsx`: убрана ручная кнопка "Обновить снимок" из шапки большой диагностики;
- оставлена одна кнопка "Свернуть в фон" в шапке большой диагностики;
- внутри блока записи добавлен явный статус: запись, пауза или выключена, количество событий и пояснение про автообновление;
- кнопка очистки переименована в "Очистить экран, не логи", чтобы было понятно: `chatcenter.log` и `ai-errors.log` не удаляются;
- `src/components/DiagnosticsFloatingPanel.jsx`: кнопка "Закрыть" переименована в "Стоп и закрыть";
- маленькая панель показывает только 3 последних события, чтобы не перегружать экран, но полный JSON-отчёт и буфер диагностики не режутся;
- `src/__tests__/systemDiagnosticsUi.test.cjs`: добавлены проверки, что ручная кнопка снимка не возвращается, автообновление объяснено, а полное закрытие называется "Стоп и закрыть".

Почему выбрано именно так:
1. Диагностика нужна для ловли плавающих багов, поэтому основной сценарий — включить запись и дать ей писать в фоне.
2. Ручной снимок при активной записи создавал лишний выбор и мог сбивать с толку.
3. `Стоп` и `Стоп и закрыть` теперь различаются по смыслу: первое сохраняет и оставляет панель, второе сохраняет и убирает диагностику полностью.
4. Изменение не трогает MAX/WhatsApp/Telegram pipeline, звук, ribbon, аватарки, dedup и обработку уведомлений.
5. Очистка остаётся только очисткой экрана/буфера диагностики, общие логи не удаляются.

Как должно работать:
1. Открыли диагностику — виден последний сохранённый отчёт, если он есть.
2. Нажали "Включить запись" — диагностика сама обновляется примерно раз в 3 секунды.
3. "Свернуть в фон" закрывает большую модалку, но запись продолжается в маленькой панели.
4. "Стоп" в маленькой панели останавливает запись, сохраняет отчёт и оставляет панель для просмотра/копирования.
5. "Стоп и закрыть" останавливает запись, сохраняет отчёт и полностью скрывает маленькую панель.
6. "Очистить экран, не логи" чистит только диагностический экран/буфер, не `chatcenter.log` и не `ai-errors.log`.

Проверки: `node src/__tests__/systemDiagnosticsUi.test.cjs`, `node src/__tests__/memoryBankSizeLimits.test.cjs`, `node src/__tests__/featuresReferences.test.cjs`, `npm run lint`, `npm run build`, `npm test`.

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
