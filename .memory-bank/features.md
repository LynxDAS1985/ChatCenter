# Реализованные функции — ChatCenter

## Текущая версия: v1.2.63 (17 июля 2026)

### v1.2.63 — Док: мгновенный возврат поверх всех + реакция на смену монитора

Дата: 17 июля 2026. Контекст: v1.2.62 (периодический реассерт раз в 1с) ✅ **подтверждён пользователем как рабочий** — док возвращается поверх всех. v1.2.63 — два улучшения из советов (Совет 4 сознательно НЕ делался).

**Проверка по коду перед правкой (факты):**
- Реассерт «поверх всех» был только на `blur` самого дока + таймер 1с ([dockPinState.js](../main/handlers/dockPinState.js)) — мгновенной реакции на потерю фокуса главным окном не было.
- Главное окно уже эмитит `focus/blur/minimize/restore` ([windowManager.js:239-243](../main/utils/windowManager.js)); `getMainWindow` — ленивый геттер ([main.js:173](../main/main.js)).
- `screen.on('display-metrics-changed')` в коде отсутствовал (grep 0) — Совет 2 новый.
- 🥇 Electron `screen`: событие `display-metrics-changed` (смена метрик экрана — разрешение/масштаб/workArea); `Display.workArea` — рабочая область без панели задач.

**Совет 1 — мгновенный возврат (реализовано):** `reassertDockTop()` (`setAlwaysOnTop('screen-saver')`, не крадёт фокус, только при видимом доке) вешается на события главного окна `blur/focus/minimize/restore`. При клике по панели задач главное окно теряет фокус → док поднимается сразу, а не через ≤1с. Хук ставится один раз (`hookMainWindowReassertOnce`, флаг + null-guard, вызывается из `ensureDockWindow` и `addToDock` — на случай, если при создании дока главное окно ещё не готово). Таймер 1с из v1.2.62 оставлен как страховка.

**Совет 2 — смена монитора/масштаба (реализовано):** обработчик `screen.on('display-metrics-changed')` пересчитывает позицию дока и клампит её в актуальную `workArea` (не ниже рабочей области, не за краями), затем реассертит поверх всех. Регистрируется один раз в `createDockPinState`.

**Совет 4 — стоп таймера без задач (СОЗНАТЕЛЬНО НЕ реализован):** таймер уже вхолостую при скрытом доке (гейт `isVisible` → `setAlwaysOnTop` не вызывается, стоит один `isVisible()` раз в 1с ≈ бесплатно). Полный старт/стоп по числу задач добавил бы хрупкость (забыть перезапустить → док не всплывёт) без реальной пользы — против «минимального касания».

Конфликты/граничные: главное окно может быть не готово при старте-восстановлении пинов → null-guard + повторный вызов из addToDock; при пересчёте на смене экрана позиция клампится в workArea (как в v1.2.61); listeners на главном окне ставятся один раз (флаг), при пересоздании главного окна страхует таймер.

Проверки: `node --check`, `npm run lint`, `npm run check-memory`, тесты области. Визуально: клик по панели задач → док возвращается МГНОВЕННО; подключение второго монитора/смена масштаба → док остаётся над панелью задач.

Откат: `git checkout -- main/handlers/dockPinState.js`.

### v1.2.62 — Док: удержание «поверх всех» (попытка 2; v1.2.61 видимость не решила)

> ✅ **Подтверждено пользователем 17 июля 2026: работает** — док возвращается поверх всех.

Дата: 17 июля 2026. Кто нашёл: пользователь — док всё равно пропадает: показывается при сворачивании программы, но при клике по панели задач Windows / фокусе другого окна исчезает.

**Что НЕ помогло (фиксируем честно):** v1.2.61 сместила док по `workArea` (над панелью задач) — это починило ПОЗИЦИЮ, но НЕ удержание поверх всех. Симптом остался.

**Доказательство причины (живой лог `chatcenter.log`):** все события `[notif-guard] safeHide` в логе — это окна УВЕДОМЛЕНИЙ (ширина 371), а не док. Событий скрытия дока нашим кодом нет (`dock:close`=0, dock-размерных safeHide нет). Значит док НЕ прячется кодом — он теряет z-order: Windows опускает topmost-окно, когда фокус берёт панель задач/другое окно. Реассерт `setAlwaysOnTop` был только на `blur` САМОГО дока ([dockPinState.js](../main/handlers/dockPinState.js)) — он не срабатывал, когда фокус уходил на панель задач (док не получал blur).

**Попытка 2 (v1.2.62):** периодический реассерт «поверх всех» — `setInterval` раз в 1с, пока док видим, вызывает `setAlwaysOnTop(true,'screen-saver',1)`. Это стандартный приём оверлеев; `setAlwaysOnTop` не крадёт фокус. Таймер очищается на `closed` дока. Файл: [dockPinState.js](../main/handlers/dockPinState.js).

⚠️ Честно про ограничение: пока панель задач/Пуск АКТИВНО открыты, Windows намеренно держит их выше всего — гарантировать «всегда поверх» стандартным Electron API нельзя. Реассерт возвращает док наверх в течение ~1с после того, как взаимодействие с панелью задач закончилось. Если задержка/остаточный баг заметны — следующий шаг: реассерт по событиям главного окна (`blur/focus/minimize/restore`) для мгновенного возврата. Это ПОПЫТКА 2 из лимита 2-3 (правило time-box).

Проверки: `node --check`, `npm run lint`, `npm run check-memory`. Визуально (после перезапуска): свернуть задачу → кликнуть по панели задач Windows → док возвращается наверх (в пределах ~1с).

Откат: `git checkout -- main/handlers/dockPinState.js`.

### v1.2.61 — Док задач не уходит за панель задач Windows

Дата: 17 июля 2026. Кто нашёл: пользователь (свернул задачу — полоска дока не видна, она за панелью задач Windows; должна быть поверх всего).

Корень: `ensureDockWindow` ([dockPinState.js](../main/handlers/dockPinState.js)) позиционировал док по `display.bounds` — это весь экран, ВКЛЮЧАЯ зону панели задач. Нижний край дока = самый низ экрана → под панелью задач. `alwaysOnTop:'screen-saver'` не спасал, т.к. окно физически стоит в зоне панели задач. Особенно заметно стало после v1.2.60 (резерв 420→0: окно стало ровно высотой панели задач и целиком в её зоне).

🥇 Официально (Electron, структура `Display`): `workArea` — рабочая область экрана БЕЗ панели задач и закреплённых панелей; `bounds` — весь экран. Ставить окна-«поверх у края экрана» нужно по `workArea`.

Фикс ([dockPinState.js](../main/handlers/dockPinState.js)):
- позиция по умолчанию — по `display.workArea` (над панелью задач), а не `display.bounds`;
- страховка-кламп: док не опускается ниже рабочей области, даже если в `storage.dockPosition` осталась старая «нижняя» позиция;
- в обработчике перетаскивания убран снап к самому низу экрана (он утаскивал док за панель задач); оставлен снап к низу рабочей области + кламп сохраняемой позиции.

Опасная зона: позиционирование окон дока/закрепа (мультимонитор, autohide-панель задач). Правка не трогает `alwaysOnTop` и логику показа — только вертикальную привязку к рабочей области.

Проверки: `node --check main/handlers/dockPinState.js`, `npm run lint`, `npm run check-memory`. Визуально (после перезапуска): свернуть задачу → полоска дока видна НАД панелью задач и поверх других окон.

Откат: `git checkout -- main/handlers/dockPinState.js`.

### v1.2.60 — Док/закреп: убрана пустая зона (клики), аватар в карточке, таймер

Дата: 17 июля 2026. Кто нашёл: пользователь (продолжение разбора закрепа/дока). Три доработки, все в системе pin/dock.

**1. Пустая зона над доком ловила клики — корень найден и устранён.**
Симптом: над полоской дока пустое место, сквозь которое нельзя кликнуть в программу под ним.
Корень (🥇 официальная дока Electron `setIgnoreMouseEvents`): прозрачное окно НЕ пропускает клики через прозрачные пиксели. `transparent:true` — это только про отрисовку, не про hit-test. Клик-насквозь возможен лишь через `setIgnoreMouseEvents`, который в проекте убран (ломал `-webkit-app-region: drag`, ловушки #21/#27). Комментарий в [pin-dock.js](../main/pin-dock.js) («прозрачные пиксели пропускают клики») был ложным предположением. Пустые 420px (`DOCK_PREVIEW_RESERVE`) входили в прямоугольник окна и ловили мышь.
Фикс: `DOCK_PREVIEW_RESERVE` 420 → 0 ([dockPinState.js](../main/handlers/dockPinState.js)). Окно = только полоска. Контекстное меню и подсказка теперь растят окно вверх ПО ТРЕБОВАНИЮ (`dock:ctx-menu-space` уже был; `dock:preview-space` оживлён — [dockPinHandlers.js](../main/handlers/dockPinHandlers.js)) и сжимают обратно при закрытии. `showCtxMenu` в [pin-dock.js](../main/pin-dock.js) переведён на «сначала вырасти, потом позиционируй» (проверенный приём из `promptNote`).

**2. Аватар отправителя в карточке закрепа.**
Раньше аватар в закреп не передавался (createPinBtn его не получал). Теперь `createPinBtn` принимает `iconDataUrl` и кладёт в `pinMessage({...icon})` ([notification-helpers.js](../main/notification-helpers.js)); оба места вызова в [notification.js](../main/notification.js) передают `data.iconDataUrl`. Карточка [pin-notification.html](../main/pin-notification.html) показывает кружок аватара в шапке; если аватара нет — остаётся эмодзи-индикатор 📌.

**3. Таймер свёрнутой задачи возвращает окно на экран.**
Тот же корень, что фикс v1.2.59: при срабатывании таймера `startTimerForItem` звал `item.win.show()` напрямую — свёрнутое окно (уведённое safeHide за экран в 1×1) показывалось за краем. Добавлен общий помощник `restorePinBounds` ([dockPinUtils.js](../main/handlers/dockPinUtils.js)) — используется и в таймере, и в `dock:show-pin` (де-дубликация кода v1.2.59).

Опасная зона: прозрачные frameless-окна дока/закрепа — история ловушек #20/#21/#27/#30. Динамический рост окна под меню/подсказку может дать лёгкое «дёрганье» (ради его отсутствия раньше и держали статический резерв 420) — **требует визуальной проверки пользователем**.

Граничные случаи: нет сохранённых bounds (после перезапуска) → окно центрируется; аватар пустой → эмодзи; аватар как data-URL хранится в pinItems (небольшой размер, приемлемо).

Проверки: `node --check` всех 6 JS, `npm run lint`, `npm run check-memory`, лимиты файлов/памяти. Визуально (после запуска): клик в пустую область под доком проходит в программу снизу; правый клик по задаче открывает меню без обрезки; наведение показывает подсказку; аватар виден в карточке; таймер свёрнутой задачи показывает карточку на экране.

Откат только этой версии: `git checkout -- main/handlers/dockPinState.js main/handlers/dockPinHandlers.js main/handlers/dockPinUtils.js main/pin-dock.js main/notification.js main/notification-helpers.js main/pin-notification.html`.

### v1.2.59 — Закреплённые задачи: разворот из дока, клик, картинки без текста

Дата: 17 июля 2026. Кто нашёл: пользователь по сценарию «свернул карточку в док → кликаю по задаче → появляется пустое поле, а карточка не открывается» + «закрепил картинку — карточка пустая» + «двойной клик открывает Telegram, а не карточку».

Три исправления (все в системе pin/dock, режим минимального касания):

1. **Главный баг — разворот свёрнутой карточки.** При «Свернуть» `safeHideTransparentWindow` намеренно уводит прозрачное окно за экран в `{-30000,-30000,1,1}` (защита от ghost hit-region на Win11, ловушки #20/#21). Но `dock:show-pin` вызывал только `item.win.show()` — без возврата позиции/размера. По документации Electron `win.show()` показывает окно на текущих координатах и размер не меняет → окно «показывалось» за краем экрана, пользователь видел пустоту. Теперь в `pin:minimize-to-dock` перед `safeHide` сохраняются `item.savedBounds = win.getBounds()`, а `dock:show-pin` перед показом возвращает их (`setBounds`); если сохранённых нет (например, после перезапуска) — окно центрируется на основном экране. Файл: [dockPinHandlers.js](../main/handlers/dockPinHandlers.js).

2. **Любой клик по свёрнутой задаче = наша карточка.** Двойной клик по табу в доке уводил в мессенджер (`goToChat` → Telegram WebView). Обработчик `dblclick` убран, одиночный клик открывает карточку сразу (без задержки 250 мс). «→ В чат» остаётся доступной в правом клике по табу ([pin-dock.js:97](../main/pin-dock.js)) и кнопкой в самой карточке. Файл: [pin-dock.js](../main/pin-dock.js).

3. **Картинка без подписи больше не даёт пустую карточку.** В закреп переносится только текст (аватар/фото не переносятся — createPinBtn их не получает), поэтому у сообщения-картинки без подписи тело было пустым. Теперь при пустом тексте карточка показывает «📷 Фото». Файл: [pin-notification.html](../main/pin-notification.html).

Опасная зона: прозрачные frameless-окна дока/закрепа — история ловушек #20 (ghost hit-region), #21 (setIgnoreMouseEvents ломает drag), #27. `savedBounds` не трогает эту защиту — только возвращает координаты на показе.

Не тронуто (найдено рядом, по правилу «описать, не чинить»): тот же offscreen-показ есть в ветке таймер-алерта (`startTimerForItem` в `dockPinUtils.js` зовёт `item.win.show()` напрямую) — если у свёрнутой задачи сработает таймер, окно тоже покажется за экраном. Отдельная правка при необходимости.

Проверки: `node --check main/handlers/dockPinHandlers.js`, `node --check main/pin-dock.js`, `npm run lint`, `npm run check-memory`. Визуальную проверку (свернуть→кликнуть→карточка по центру; двойной клик = карточка; картинка = «📷 Фото») делает пользователь после запуска.

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
