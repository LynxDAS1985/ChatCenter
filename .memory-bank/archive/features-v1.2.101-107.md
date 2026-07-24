# Архив changelog: v1.2.101 – v1.2.107

Перенесено из `features.md` 2026-07-24 при разгрузке активного файла под лимит 100 КБ.
Тема блока: уведомления — сторож «невидимой стены» + видео/фото в карточке (native Telegram).

**Архив не читается по умолчанию** — только по явной просьбе.

---

### v1.2.107 — Уведомления: сторож от «невидимой стены» + тест решения + быстрее закрытие

Дата: 23 июля 2026. Пакет улучшений по ревью после фикса v1.2.106.

**1. Сторож (auto-recover «невидимой стены»).** v1.2.106 закрыл самый вероятный путь застревания окна, но остаются редкие (потерян terminal-сигнал; ghost-регион Win11). Добавлен `setInterval` (5с) в [notifHandlers.js](../../main/handlers/notifHandlers.js): если окно ВИДИМО и `getNotifItems().length===0` **два тика подряд** (~10с) — принудительно `safeHideTransparentWindow`. Обычное закрытие (<0.5с) не переживает 2 тика → сторож его не трогает. Итог: застрявшее пустое окно самоисчезает, перезапуск не нужен.

**2. Чистая функция + поведенческий тест.** Логика «показать/спрятать/игнорировать окно по отчёту высоты» вынесена из обработчика `notif:resize` в чистую `decideNotifResize({height, itemsCount, rendererPure})` — новый [notifResizeDecision.js](../../main/handlers/notifResizeDecision.js). Все ловушки (#26 rendererPure / v0.89.23 стале-0 / v1.2.106 осиротевший положительный отчёт) теперь в одном месте и покрыты тестом [notifResizeDecision.vitest.js](../../src/__tests__/notifResizeDecision.vitest.js) (6 проверок). Раньше проверялось только текстовым grep'ом (`notificationWindowBounds.test.cjs`), а grep не ловит неверную работу (прецедент v1.2.91).

**3. Быстрее убирается «полоса» после закрытия (задача пользователя).** После закрытия окно/тонкая «полоса» уходила ~1с. Причина (по коду): у кнопки «Прочитано» подтверждение «✓ Готово!» держалось 800мс, и старт схлопывания карточки был через 330мс. Ускорено: 800→400мс и 330→200мс (правка чисел в [notification.js](../../main/notification.js), файл не вырос). Коллапс чуть перекрывает slide-out — визуально плавно, но окно прячется на ~130-400мс раньше.

**Крайние случаи.** Сторож: не трогает окно в момент обычного закрытия (нужно 2 тика); при быстрой череде уведомлений `items>0` → не срабатывает. Ускорение: обе анимации — выходные (slide+collapse), перекрытие не создаёт скачка.

**Проверки:** линт; `npm run test:vitest` (в т.ч. новые 6 на `decideNotifResize`); `ipcChannels`; лимиты. **Требует визуальной проверки:** скорость закрытия и что «стена» самоисчезает (сторож — по логу `[notif-watchdog]`).

Файлы: `main/handlers/notifHandlers.js`, `main/handlers/notifResizeDecision.js` (new), `main/notification.js`, `src/__tests__/notifResizeDecision.vitest.js` (new).

Откат: `git revert` коммита v1.2.107.

### v1.2.106 — Фикс: «невидимое зависшее окно» уведомления, ловящее клики

Дата: 23 июля 2026. Редко после уведомления оставалось прозрачное окно поверх экрана, которое ловит клики (нельзя ничего нажать в той зоне), лечилось только перезапуском.

**Корень (по коду).** Обработчик `notif:resize` ([notifHandlers.js](../../main/handlers/notifHandlers.js)) показывает/прячет окно уведомления по высоте, которую сообщает renderer. Была защита от запоздалого отчёта `height<=0` при `items>0` (не прятать окно, если main уже знает о новом сообщении). Но НЕ было симметричной защиты для обратного случая: `height>0` при `items===0`. Такой «осиротевший» положительный отчёт (быстрые уведомления: новое успело закрыться в момент отрисовки; либо запоздалый `reportHeight` от slideIn/анимации) уходил в ветку показа → `setBounds` + `showInactive` → окно показывалось на экране пустым и прозрачным. А click-through у прозрачного окна убран (v0.89.22, ловушка #21) → пустое видимое окно ловит клики в своём прямоугольнике = «невидимая стена» до перезапуска.

**Фикс.** В `notif:resize` добавлена симметричная защита: если пришла положительная высота, но `getNotifItems().length === 0` — окно ПРЯЧЕТСЯ (`safeHideTransparentWindow`), а не показывается. Легитимный показ не затронут: `showCustomNotification` кладёт item в `notifItems` ДО отправки в окно, поэтому при настоящем уведомлении `items>0` к моменту отчёта высоты.

**Крайние случаи.** Быстрая череда уведомлений; закрытие последнего в момент анимации; двойной отчёт. Все дают `items===0 + height>0` → теперь прячем. Диагностика: лог `[notif-resize] HIDE positive height ... items=0`.

**Проверки:** линт; `npm run test:vitest`; лимиты. **Требует визуальной проверки** — баг редкий (гонка), но по логу `[notif-resize]` будет видно срабатывание защиты. Автотест затруднён (обработчик main-окна с BrowserWindow/screen) — не добавлен.

Файл: `main/handlers/notifHandlers.js`.

Откат: `git revert` коммита v1.2.106.

### v1.2.105 — Кнопка «Прочитано» в уведомлении работает для нативного Telegram

Дата: 21 июля 2026. Клик «Прочитано» в уведомлении native-Telegram не снимал непрочитанное (счётчик чата оставался).

**Корень (по коду).** Единственный слушатель `notify:mark-read` — webview-only ([useNotifyNavigation.js](../../src/hooks/useNotifyNavigation.js): `const el = webviewRefs.current[messengerId]; if (!el) return`). Для нативного (`messengerId='native_cc'`) webview-ref нет → тихий выход, TDLib не вызывается. Отдельной нативной ветки не было (в отличие от «Перейти к чату», которое обрабатывается для `native_cc` в App.jsx). Плюс payload `notify:mark-read` не нёс `source` (chatId/messageId) — [notifHandlers.js].

**Фикс.**
1. `notifHandlers.js` — в payload `notify:mark-read` добавлен `source: item.source || null` (в `notifItems` он есть).
2. `useNotifyNavigation.js` — в слушателе для `native_cc` вызывается напрямую `window.api.invoke('tg:mark-read', { chatId, maxId })` → backend `viewMessages force_read` ([tdlibBackend.js:516], [tdlibMessages.js:255-264]). Без переключения вкладки и без ожидания фокуса окна.

**Формат chatId.** В `source` поле `chatId` — БЕЗ префикса аккаунта (`accountId` отдельно, [nativeStoreIpc.js:446-452]), а `tg:mark-read` ждёт полный. Поэтому собираем `accountId + ':' + chatId`; `maxId = Number(source.messageId)`. Счётчик обновляется с сервера через `tg:chat-unread-sync` (store не делает оптимистичного вычитания, v0.87.41).

**Крайние случаи.** Нет `source`/accountId/chatId → ничего не делаем; двойной клик — идемпотентно; webview-мессенджеры не затронуты (нативная ветка выходит раньше webview-логики). **Ограничение:** сообщение в теме форума (`threadId`) — пометится чат, счётчик темы может не сброситься (нужен `markTopicRead` — отдельная задача).

**Проверки:** линт; `npm run test:vitest`; лимиты (hook 107/150). **Требует визуальной проверки:** клик «Прочитано» на native-уведомлении → счётчик чата гаснет. Автотеста нет — слушатель хука с `window.api` требует React-харнесса; логика тривиальна (собрать полный chatId + invoke).

Файлы: `main/handlers/notifHandlers.js`, `src/hooks/useNotifyNavigation.js`.

Откат: `git revert` коммита v1.2.105.

### v1.2.104 — Доводка видео: крутилка по реальной загрузке + чистка + тест связки

Дата: 21 июля 2026. Три улучшения по итогам ревью v1.2.103.

**1. Крутилка на плитке видео снимается по ФАКТУ (а не по «тупому» таймеру 20с).** После клика по видео главное окно скачивает файл и открывает плеер (`video:open`), затем шлёт `notif:video-done { messageId }` ([useAppIPCListeners.js]). `notifHandlers.js` пересылает это окну уведомления, а слушатель в **preload** окна (`notification.preload.cjs`) убирает класс `loading` с плитки по `data-mid`. Слушатель именно в preload (у него есть доступ к DOM), потому что `notification.js` на лимите размера (730). 20-секундный таймаут остался как страховка (если сигнал не придёт).

**2. Косметика:** `extractVideoFileId` переставлена в `tdlibMedia.js` ПОД `extractThumbnailFileId` — при первой вставке (v1.2.103) она вклинилась между JSDoc-описанием и функцией `extractThumbnailFileId`, «уводя» описание не к той функции. Теперь описания на своих местах.

**3. Тест связки:** `tdlibBackend.vitest.js` — видео-документ (`messageDocument` mime video/*) через `downloadVideo` доходит до скачивания file_id документа (проверяется вызов `downloadFile` с нужным id), а не возвращает «no video file». Защищает от отката фикса v1.2.103.

**Проверки:** `npm run test:vitest`; линт 0; лимиты — tdlibBackend.vitest 668/670, hook 142/150, preload 56/600. **Требует визуальной проверки:** крутилка на видео исчезает, когда плеер открылся.

Файлы: `src/hooks/useAppIPCListeners.js`, `main/handlers/notifHandlers.js`, `main/preloads/notification.preload.cjs`, `main/native/backends/tdlibMedia.js`, `src/__tests__/tdlibBackend.vitest.js`.

Откат: `git revert` коммита v1.2.104.

### v1.2.103 — Видео-как-файл (документ) теперь проигрывается (чат + уведомление)

Дата: 21 июля 2026. Корень найден по скриншоту ЧАТА — там прямо «no video file».

**Проблема.** Видео не играло ни в уведомлении, ни в самом чате. Причина: сообщение — это видео, присланное как ДОКУМЕНТ (файл с mime `video/*`; в списке чатов подпись `document_...`), а не как обычное «видео» Telegram. Функция `downloadVideo` ([tdlibBackend.js]) искала файл только в `content.video.video.id` → у видео-документа его нет → возвращалась ошибка `'no video file'`. Ломалось и в чате (VideoTile показывал ⚠️ «no video file»), и в уведомлении (клик → `download-video` → `ok:false` → плеер не открывался, крутилка висела).

Это **опровергло** прошлую гипотезу (v1.2.102) про «несобранный мост уведомления»: чат мостом не пользуется, а видео тоже не играл → значит корень в общей функции `downloadVideo`, а не в мосте.

**Фикс.** Выбор file_id для видео вынесен в чистую `extractVideoFileId(content)` ([tdlibMedia.js], рядом с `extractMediaFileId`/`extractThumbnailFileId`): `messageVideo` → `video.video.id`; GIF `messageAnimation` → `animation.animation.id`; `messageDocument` с mime `video/*` → `document.document.id`. `downloadVideo` теперь использует её. Один фикс лечит и чат, и уведомление.

**Крайние случаи (юнит-тест `tdlibMedia.vitest.js`, +5):** video/animation/video-документ → id; документ-НЕ-видео (pdf) → null; фото → null; null → null.

**Проверки:** `npm run test:vitest`; линт 0; лимиты — tdlibMedia.js 415/500, tdlibBackend.js ~893/930. **Требует визуальной проверки:** прислать видео как файл → играет в чате и открывается из уведомления. (Возможный следующий шаг: если конкретный кодек не поддержан плеером — кнопка «открыть во внешнем» уже есть.)

Файлы: `main/native/backends/tdlibMedia.js`, `main/native/backends/tdlibBackend.js`, `src/__tests__/tdlibMedia.vitest.js`.

Откат: `git revert` коммита v1.2.103.

### v1.2.102 — Видео в уведомлении: курсор-палец + отклик на клик

Дата: 21 июля 2026. Доводка v1.2.101 (постер видео уже показывается).

**Проблемы:** (1) курсор над видео — «лупа» (`.album-tile { cursor: zoom-in }` — стиль для приближения фото); (2) по клику нет видимого отклика — видео качается целиком перед открытием плеера (v0.89.15, `downloadVideo` ждёт полной загрузки), а карточка ничего не показывает → кажется «не нажимается».

**Фиксы:**
- Плитке видео добавлен класс `.is-video` → CSS `cursor: pointer` (перебивает `zoom-in`). [main/notification-helpers.js], [main/notification.css].
- По клику на видео плитка получает `loading` (крутилка) + страховочный таймаут 20с → видно, что клик принят и идёт загрузка.

**Не изменено:** клик по-прежнему открывает готовый плеер `video:open` (как в чате). Фото/альбомы не затронуты.

**Открытый вопрос (не воспроизвести без запуска):** если после ПОЛНОЙ пересборки плеер всё равно не открывается — вероятно, правки главного процесса (`notifHandlers.js`) и preload (`notification.preload.cjs`) из v1.2.101 не попали в запущенную сборку (постер обновляется отдельной частью — renderer/сырые скрипты). Тогда следующий шаг — диагностический лог по цепочке клик→main→video:open.

**Проверки:** `npm run test:vitest` (`albumLiveCard.vitest.js` — видео-плитка имеет класс `is-video` + ▶ + клик зовёт `openVideo`); линт 0. **Требует визуальной проверки.**

Файлы: `main/notification-helpers.js`, `main/notification.css`, тест `src/__tests__/albumLiveCard.vitest.js`.

Откат: `git revert` коммита v1.2.102.

### v1.2.101 — Видео в уведомлении: постер + проигрыватель как в чате

Дата: 21 июля 2026. Пришло видео → чёрный прямоугольник вместо кадра + не проигрывалось.

**Две причины (найдены по коду, не по логам — запуск приложения запрещён):**
1. **Чёрный постер.** Превью качалось каналом `tg:download-media` с `thumb:true`, но метод `media.download({ chatId, msgId, onProgress })` ([main/native/backends/tdlibBackend.js:730]) параметр `thumb` **не принимает** (в сигнатуре его нет) → для видео `extractMediaFileId` даёт файл САМОГО видео ([tdlibMedia.js:99]) → скачивался видеофайл и подставлялся в CSS `background-image`, который видео не рисует → чёрное. (Для фото не видно: полное фото — всё равно картинка.)
2. **Не проигрывалось.** Клик по плитке открывал фото-смотрелку (`photo:open`, окно с `<img>`) — `<img>` видео не играет.

**Решение (переиспользуем то, что уже есть в чате):**
- Постер: для видео качаем `tg:download-thumbnail` (постер-JPEG, тот же канал, что VideoTile.jsx) — [albumThumbPreload.js]. Фото не тронуто.
- Проигрывание: плитка видео помечена флагом `isVideo` (в `buildNotifAlbum`, [shared/notifAlbum.js]) → рисуется значок ▶ поверх постера; клик вызывает `window.notifApi.openVideo({chatId, messageId})` вместо `openPhoto`. Мост: `notif:open-video` (preload) → `notify:open-video` (notifHandlers) → главное окно `tg:download-video` → `video:open` (готовое окно-плеер со стримингом/перемоткой, [videoPlayerHandler.js]).

**Не затронуто:** одиночное фото и медиа-группы (ветка `isVideo`/видео-канал включается только при `mediaType==='video'` и `single_*`).

**Крайние случаи:** видео без постера → значок ▶ на тёмном фоне (не «дырка»); видео не скачалось/нет сети → плеер не откроется (тихо, как у фото); кодек не поддержан (HEVC) → у плеера уже есть кнопка «открыть во внешнем» ([videoPlayerHandler.js:195]).

**Проверки:** `npm run test:vitest` (`notifAlbum.vitest.js` — `isVideo:true` для видео; `albumLiveCard.vitest.js` — плитка видео с ▶ + клик зовёт `openVideo`); линт 0. **Требует визуальной проверки** — видео показывает кадр + ▶, клик открывает плеер.

Файлы: `shared/notifAlbum.js`, `src/native/utils/albumThumbPreload.js`, `main/notification-helpers.js`, `main/notification.css`, `main/preloads/notification.preload.cjs`, `main/handlers/notifHandlers.js`, `src/hooks/useAppIPCListeners.js`, `main/notification.js`, тесты `notifAlbum.vitest.js`/`albumLiveCard.vitest.js`.

Откат: `git revert` коммита v1.2.101.
