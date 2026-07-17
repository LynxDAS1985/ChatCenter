# Архив features: v1.2.46 – v1.2.58

Дата архивации: 17 июля 2026.
Причина: активный features.md рос к лимиту 100 КБ (штатное разбиение). Серия VK-уведомлений и связанных фиксов.

---

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
