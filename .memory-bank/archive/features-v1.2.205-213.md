# Архив features — v1.2.205…v1.2.213 (окно отправки фото: подпись/лимит/порядок/диагностика)

Вынесено из активного `features.md` 2026-08-11 (разгрузка под лимит 100 КБ). Хронология новее→старее.

### v1.2.213 — Диагностика отправки: лог провала на сервере + номера/результат каждого сообщения

Дата: 2026-08-07. Жалоба «в веб-Telegram нет текста» при отправке альбома+текст (split). Журнал показал, что текст ДОШЁЛ (получатель принял все 3 куска 4070/4058/430, ошибок нет) → это не потеря, а, вероятно, порядок/отображение в внешнем веб-клиенте. Чтобы видеть подобное по логам БЕЗ ручных проверок пользователя, добавлена диагностика:

- **Лог провала отправки (был «немым»).** [tdlibClient.js](../main/native/backends/tdlibClient.js) `updateMessageSendFailed` теперь пишет `[send-failed] chat=… type=… textLen=… code=… err=…` (одна строка, main → chatcenter.log). Раньше сервер мог отвергнуть сообщение, а в журнале — ни слова. Постоянная диагностика (не временная).
- **Номера сообщений + результат кусков.** [inboxAttachSend.js](../src/native/utils/inboxAttachSend.js): `ok msgIds=[…]` (номера фото/альбома — по возрастанию виден порядок) и на каждый кусок текста `split chunk i/N len=… ok=… msgId=…`. По журналу видно, что и в каком порядке ушло.

**КАК ПРОВЕРЕНО:** линт 0; тесты 79; `mainRuntime` 103/103; лимиты 559/559 (`tdlibClient.js` 650/650 — впритык, лог сжат в 1 строку; разбиение — [[code-todo]] TODO-15, стало срочнее). **Действие пользователя:** перезапустить (dev) и отправить ещё раз — по журналу (`[send-failed]`, `msgIds`, `split chunk`) станет точно видно, что происходит. Откат: `git checkout -- main/native/backends/tdlibClient.js src/native/utils/inboxAttachSend.js` + версия на 1.2.212.

### v1.2.212 — Доводки «текст отдельно»: ждём ИМЕННО это фото + показываем число сообщений

Дата: 2026-08-07. Улучшения по ревью v1.2.211.

- **Ждём загрузку ИМЕННО отправленного фото (по fileId).** Раньше [inboxAttachSend.js](../src/native/utils/inboxAttachSend.js) ждал ЛЮБОЕ `tg:upload-progress done` — при параллельной загрузке другого файла текст мог уйти раньше. Теперь `createUploadDoneWaiter` запоминает fileId, чьи прогресс-события видел «в процессе», и ждёт завершения именно его; создаётся ДО отправки фото (ловит его прогресс с начала), чистится в `finally`.
- **Показываем «текст уйдёт N сообщениями».** В окне [PhotoSendModal.jsx](../src/native/components/PhotoSendModal.jsx) и в [FilePreviewBar.jsx](../src/native/components/FilePreviewBar.jsx) при превышении лимита подписи считаем куски (`splitTextForTelegram(caption, TEXT_MAX).length`) и пишем в предупреждении + на кнопке «Фото/Файл, затем текст (N)» — заранее видно, сколько сообщений придёт.
- **Разгрузка `decisions.md`.** Файл дорос до 98 КБ (впритык к 100). ADR-015…022 вынесены в [archive/decisions-adr-015-022.md](../.memory-bank/archive/decisions-adr-015-022.md) (→ 61 КБ), в active — ссылка-заглушка.

**КАК ПРОВЕРЕНО:** линт 0; тесты 99 (splitText/чанки/счётчик/выбор). Ожидание по fileId без запуска не проверить (в тестах нет событий) → визуально. Откат: `git checkout -- src/native/utils/inboxAttachSend.js src/native/components/PhotoSendModal.jsx src/native/components/FilePreviewBar.jsx` + версия на 1.2.211.

### v1.2.211 — «Текст отдельно»: режем длинный текст на ≤4096 + шлём ПОСЛЕ загрузки фото (порядок)

Дата: 2026-08-07. По расследованию (журнал `chatcenter.log`, 18:42): при «Фото, затем текст отдельно» (1) текст **8562 знака** уходил ОДНИМ сообщением, а лимит обычного сообщения Telegram — **4096**, поэтому сервер его отвергал → получателю приходило только фото; (2) текст вставал ВЫШЕ фото — фото тяжёлое, грузится дольше, а текст мгновенный → доходил до сервера первым.

**Фикс ([inboxAttachSend.js](../src/native/utils/inboxAttachSend.js) + [photoSendUtils.js](../src/native/utils/photoSendUtils.js)):**
- **Нарезка (B):** новая чистая `splitTextForTelegram(text, 4096)` (`TEXT_MAX=4096`) режет текст на куски ≤4096 по переносу/пробелу (не посреди слова и не посреди эмодзи — суррогатной пары). Каждый кусок шлётся отдельным `store.sendMessage` по очереди. 8562 → 3 сообщения, весь текст доходит.
- **Порядок (A):** перед отправкой текста ждём РЕАЛЬНОЙ загрузки фото — слушаем `tg:upload-progress` с `done:true` (в renderer через `window.api.on`), таймаут 15с (запаска, чтобы не зависнуть). Тогда фото встаёт выше, текст ниже. Нет `window.api.on` (тесты) → не ждём.

**КАК РАБОТАЕТ / крайние случаи:** пустой текст → 0 сообщений; ровно 4096 → 1; сплошной без пробелов → жёсткий рез с защитой эмодзи; таймаут 15с → текст всё равно уйдёт (лог WARN, порядок может нарушиться в редком случае медленной сети). Дефолт (нет splitText) не тронут. Откат: `git checkout -- src/native/utils/inboxAttachSend.js src/native/utils/photoSendUtils.js` + версия на 1.2.210.

**КАК ПРОВЕРЕНО:** линт 0; тесты **79** (photoSendUtils: `splitTextForTelegram` короткий/пустой/ровно лимит/длинный/по переносу; inboxAttachSend: текст >4096 → 2 сообщения). Ожидание загрузки без запуска не проверить (happy-dom без событий) → визуально. **Требует визуальной проверки (dev, перезапуск):** фото с огромной подписью → «Фото, затем текст отдельно» → у собеседника СНАЧАЛА фото, ПОТОМ весь текст несколькими сообщениями по порядку.

### v1.2.210 — Лимит подписи и «текст отдельно» теперь и для видео/документов (FilePreviewBar)

Дата: 2026-08-06. По плану ревью v1.2.209 (#1): защита от длинной подписи была только у фото, а видео/документы/смешанное идут через `FilePreviewBar` без счётчика → та же недоставка была возможна там.

**Что сделано:** в [FilePreviewBar.jsx](../src/native/components/FilePreviewBar.jsx) добавлен такой же счётчик `N / 1024` (красный при превышении), красная рамка поля, кнопка «Отправить» блокируется, и кнопка «Файл, затем текст отдельно». Флаг `splitText` теперь проходит и через attach-ветку [inboxAttachSend.js](../src/native/utils/inboxAttachSend.js) (строки `sendFile`/`sendAlbum` используют `photoCaption` вместо `attach.caption`) → видео/документ уходит без подписи, затем весь текст отдельным сообщением. Дефолт (нет флага) — как раньше.

**КАК ПРОВЕРЕНО:** линт 0; тесты **112** (+ attach-ветка splitText: файл с пустой подписью + `sendMessage`). Отложено: разбить `PhotoSendModal.jsx` 545/600 → [[code-todo]] TODO-32. **Требует визуальной проверки:** видео с длинной подписью → счётчик краснеет, «Файл, затем текст отдельно» → приходит файл + текст. Откат: `git checkout -- src/native/components/FilePreviewBar.jsx src/native/utils/inboxAttachSend.js` + версия на 1.2.209.

### v1.2.209 — Счётчик подписи под фото + «фото, затем текст отдельно» (лимит Telegram 1024)

Дата: 2026-08-06. По расследованию (журнал `chatcenter.log`): фото с ДЛИННОЙ подписью не доходило до собеседника, а с короткой/без — доходило. КОРЕНЬ: Telegram ограничивает подпись к медиа ~1024 знаками; длиннее — сервер отвергает, сообщение остаётся только у отправителя. Грабля — [[electron-core]].

**Решение (вариант 1 «счётчик знаков», по выбору пользователя):**
- Под полем подписи в [PhotoSendModal.jsx](../src/native/components/PhotoSendModal.jsx) — счётчик `N / 1024` (серый; красный + `−N` при превышении). Лимит `CAPTION_MAX=1024` в [photoSendUtils.js](../src/native/utils/photoSendUtils.js) (безопасно для всех; у Premium 2048).
- При превышении: кнопка «Отправить» ЗАБЛОКИРОВАНА (и Enter не шлёт), поле — красная рамка, появляется выбор: **«Сократить»** (курсор в поле) или **«Фото, затем текст отдельно»**.
- «Отдельно» (`sendOpts.splitText`, [inboxAttachSend.js](../src/native/utils/inboxAttachSend.js)): фото уходит БЕЗ подписи, затем ПОЛНЫЙ текст следом обычным сообщением (`store.sendMessage`, лимит текста 4096). Порядок: сперва фото, потом текст. Ничего не режется автоматически.

**Также:** Backspace больше НЕ удаляет текущее фото (только Delete) — из плана ревью (#2), убрано случайное стирание.

**КАК ПРОВЕРЕНО:** линт 0; тесты **104** (photoSendUtils +1 CAPTION_MAX, PhotoSendModal +2 счётчик/блокировка, inboxAttachSend +2 splitText, зум/память). **Требует визуальной проверки (dev, перезапуск):** длинная подпись → счётчик краснеет, «Отправить» гаснет, кнопка «Фото, затем текст отдельно» → фото + текст доходят двумя сообщениями. Откат: `git checkout -- src/native/components/PhotoSendModal.jsx src/native/utils/inboxAttachSend.js src/native/utils/photoSendUtils.js` + версия на 1.2.207.


### v1.2.207 — Окно фото: 7 функций (без сжатия, порядок мышкой, прогресс, размер, удалить, зум 1:1, подтверждение)

Дата: 2026-08-06. По выбору пользователя из макета (7 из 10 идей).

**Чистые утилиты (тесты без DOM):** новый [photoSendUtils.js](../src/native/utils/photoSendUtils.js) — `formatBytes`, `totalBytes`, `arrayMove`, `overallUploadPercent`; в [imageZoomPan.js](../src/native/utils/imageZoomPan.js) — `actualSizeScale` (1:1).

- **#1 Без сжатия (как файл).** Переключатель в окне ([PhotoSendModal.jsx](../src/native/components/PhotoSendModal.jsx)) → флаг `asDocument` протаскивается: окно → `onSend(files, {asDocument})` → `handleAttachSend` → `runAttachSend(sendOpts)` → `store.sendFile/sendAlbum(…, asDocument)` → IPC `tg:send-file`/`tg:send-album` → backend `sendFile`/`buildContent` шлют `inputMessageDocument` (Telegram НЕ сжимает). Дефолт `false` = как раньше (фото сжимается). Файл без пути + «без сжатия» → временный файл → документ. Факт уровня 1: TDLib docs (типы inputMessage в [tdlibSend.js](../main/native/backends/tdlibSend.js)/[tdlibAlbum.js](../main/native/backends/tdlibAlbum.js)).
- **#3 Порядок фото мышкой.** Перетаскивание миниатюр (HTML5 drag) → `onReorder(from,to)` → новый `useFileAttach.moveFile` (через `arrayMove`); повороты переставляются синхронно (`rots`).
- **#4 Прогресс отправки.** Полоска на кнопке «Отправить» во время `sending` по `overallUploadPercent(store.uploads)`. ОГРАНИЧЕНИЕ: прогресс TDLib приходит по `fileId` ([nativeStoreSendIpc.js](../src/native/store/nativeStoreSendIpc.js)), к конкретным миниатюрам НЕ привязывается → показываем ОБЩИЙ процент, не по каждому фото.
- **#6 Размер в МБ.** В строке info: вес текущего фото + «альбом N МБ» (`formatBytes`/`totalBytes`).
- **#7 Удалить текущее фото.** Кнопка 🗑 в шапке + клавиша Del → `onRemove(idx)` (+ убираем его поворот).
- **#8 Зум «Вписать / 1:1».** Кнопки: «Вписать» (100% по центру) и «1:1» (реальный размер пикселей через `actualSizeScale`).
- **#10 Подтверждение при закрытии.** ✕/Esc/клик по фону при выбранных фото → полоса «Отменить отправку N фото? [Продолжить] [Отменить отправку]». Второй Esc — закрыть.

**Совместимость:** `FilePreviewBar` (видео/смешанное) не тронут; дефолт `asDocument=false` = прежняя отправка. **КАК ПРОВЕРЕНО:** линт 0; тесты **116** (photoSendUtils, imageZoomPan +actualSizeScale, PhotoSendModal +4, inboxAttachSend +2, tdlibAlbum +3, useFileAttach); `mainRuntime` 103/103; лимиты 559 (PhotoSendModal 522/600 ⚠, renderer watermark поднят). **Требует визуальной проверки (dev, перезапуск):** «без сжатия» → у собеседника файл-оригинал; перетаскивание миниатюр меняет порядок; прогресс идёт при отправке; размер в МБ; 🗑/Del удаляет; Вписать/1:1; ✕ спрашивает. Откат: `git checkout -- src/native/components/PhotoSendModal.jsx src/native/components/InboxMessageInput.jsx src/native/utils/inboxAttachSend.js src/native/utils/imageZoomPan.js src/native/hooks/useFileAttach.js src/native/store/nativeStore.js src/native/modes/InboxMode.jsx main/native/backends/tdlibSend.js main/native/backends/tdlibAlbum.js main/native/backends/tdlibBackend.js main/native/tdlibIpcHandlers.js` + удалить `photoSendUtils.js`/тесты + версия 1.2.206.


### v1.2.206 — Подтверждающий лог для фикса двойной вставки (план исправления из ревью, #1)

Дата: 2026-08-06. По ревью v1.2.205: защита от двойной вставки ([PhotoSendModal.jsx](../src/native/components/PhotoSendModal.jsx) `if e.defaultPrevented return`) была «немой» — по журналу нельзя подтвердить, что она сработала. Добавлена строка `[photo-modal] paste: пропуск дубля (вставку уже обработало поле)` (INFO) в момент срабатывания защиты. Теперь при вставке видно: строка есть → фикс отработал; если двойная вставка повторится БЕЗ этой строки → причина другая (нужен отдельный разбор). Только лог, поведение не менялось. Пункты #2 (визуальная проверка альбома) и #3 (уменьшить «перетяг» сдвига) из плана — по решению пользователя не трогались. Откат: `git checkout -- src/native/components/PhotoSendModal.jsx` + версия на 1.2.205.


### v1.2.205 — Фикс двойной вставки фото + подсказка «до 10 в сообщении» + разбит windowManager (TODO-31)

Дата: 2026-08-06.

**🔴 Фикс: одна вставка (Ctrl+V) добавляла ДВА одинаковых фото.** Регресс v1.2.204 (окно стало слушать `paste` на `window`). КОРЕНЬ (по коду + модель событий DOM): первую вставку (окна ещё нет, видно поле ввода) обрабатывает поле — [useDropAndPaste.js](../src/native/hooks/useDropAndPaste.js) зовёт `e.preventDefault()` + `addFiles`. React для дискретных событий применяет обновление синхронно → окно `PhotoSendModal` монтируется и его `useEffect` вешает слушатель на `window`, ПОКА то же самое событие ещё всплывает к `window` → слушатель ловит его → второе добавление. Фикс ([PhotoSendModal.jsx](../src/native/components/PhotoSendModal.jsx)): в оконном слушателе `if (e.defaultPrevented) return` — если вставку уже обработали (поле вызвало preventDefault), окно её пропускает. Когда окно — единственный обработчик (вставка при уже открытом окне), `defaultPrevented=false` → работает как надо. Грабля — [[electron-core]].

**Подсказка «до 10 фото в сообщении».** Telegram кладёт в один альбом максимум 10 фото (11+ backend бьёт на несколько сообщений). Теперь при >10 фото в окне показывается заметка «⚠ до 10 в сообщении — N уйдут несколькими» ([PhotoSendModal.jsx](../src/native/components/PhotoSendModal.jsx), строка info).

**Разгрузка `windowManager.js` (TODO-31).** Функция `attachDevRequestTiming` (~80 строк, диагностика скорости dev-запросов) вынесена в новый [devRequestTiming.js](../main/utils/devRequestTiming.js). `windowManager.js` 272→195 строк. Поведение не изменилось (чистый перенос, вызывается только при `isDev`).

**КАК ПРОВЕРЕНО:** линт 0; тесты 83/83; `mainRuntime` 103/103; `windowManager.js` 195/300, `devRequestTiming.js` 92/300. **Требует визуальной проверки (dev, перезапуск):** одна вставка Ctrl+V → добавляется ОДНО фото; при 11+ фото — заметка; dev-логи `dev-request …` по-прежнему пишутся. Откат: `git checkout -- src/native/components/PhotoSendModal.jsx main/utils/windowManager.js` + удалить `devRequestTiming.js` + версия на 1.2.204.


