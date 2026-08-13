# Архив changelog v1.2.222–236 (13 августа 2026)

Вынесено из features.md при достижении лимита 100 КБ. Темы: галочки прочтения в списке чатов (v1.2.226–231), карточка контакта (v1.2.232–235), диагностика МАКС заглушённых (v1.2.236), многострочная строка отправки/подпись (v1.2.223–225), пузырь «↓ N новых» (v1.2.222–227).

---

### v1.2.236 — ДИАГНОСТИКА: МАКС уведомляет о ЗАГЛУШЁННЫХ (🔕) чатах — ищем метку мьюта в вёрстке

Дата: 2026-08-12. Жалоба: чат МАКС помечен 🔕 (беззвучный), но уведомления идут. КОРЕНЬ найден по коду+логу (🟢): уведомления МАКС идут через наблюдатель за списком чатов (`_maxScanList`/`_maxRowInfo` в [max.hook.js](../main/preloads/hooks/max.hook.js), лог `src=max-sidebar` → `NotifManager show sender=А.Х. как вкусно`), а он фильтрует ТОЛЬКО спам (`_isSpam`) — проверки «заглушён ли чат» НЕТ ни в одном из трёх путей (Notification API / SW / sidebar). Пути Notification/SW сейчас не срабатывают (у МАКС `serviceWorker.ready` не резолвится), работает только sidebar-скрейпинг, который читает строку списка напрямую и мьют не учитывает. Чинить точно нельзя без знания, КАК МАКС помечает беззвучный чат в DOM (риск как с ВК v1.2.116-120: заглушить лишние чаты). Добавлена ВРЕМЕННАЯ диагностика `__CC_DIAG__max-mute-probe` (в `_maxScanList`, до 10 раз): для строки, по которой шлём уведомление, дампит класс строки, наличие эмодзи 🔕 в тексте, и значки (svg/use/i/[class*=mute|notif|silent|bell|disab]/[aria-label]/[title]). По дампу заглушённого «А.Х. как вкусно» vs обычного чата найдём метку мьюта и сделаем точный пропуск. Фикс НЕ делался. Файл: `main/preloads/hooks/max.hook.js` (300/300). **Действие пользователя:** перезапуск + открыть МАКС с записью диагностики → прислать строки `max-mute-probe`.

### v1.2.235 — Карточка контакта: «Написать» ставит курсор в поле + кнопки не растягиваются

Дата: 2026-08-11. Доводка по ревью v1.2.234. (1) Кнопка «Написать» раньше просто закрывала карточку; теперь закрывает И ставит курсор в поле ввода чата (`onWrite` в [ContactCardModal.jsx](../src/native/components/ContactCardModal.jsx) → `document.getElementById('native-message-composer').focus()` через `requestAnimationFrame`; полю в [InboxMessageInput.jsx](../src/native/components/InboxMessageInput.jsx) добавлен стабильный `id`). (2) Быстрые кнопки больше не растягиваются на всю ширину — `qbtn.maxWidth:150`, поэтому одинокая «Написать» у группового чата выглядит аккуратно, а не «простынёй». Тест `ContactCardModal.vitest.jsx` (+1): «Написать» закрывает окно и фокусирует поле. **Ловушка (устранена сразу):** JSX-комментарий `{/* */}` нельзя ставить МЕЖДУ атрибутами тега (`<textarea id=… {/*…*/}>`) — Babel падает `Unexpected token, expected "..."`; комментарий должен быть в позиции детей (над тегом). Проверки: vitest 2284/2284, линт 0, лимиты (watermark 33560→33570). Эта правка — renderer, подхватывается hot-reload'ом (полный перезапуск не нужен).

### v1.2.234 — Карточка контакта: убрана дублирующая кнопка «Заглушить» (звук — только нижним тумблером)

Дата: 2026-08-11. Жалоба: в карточке контакта звук выключался ДВУМЯ элементами — быстрой кнопкой «Заглушить» сверху и тумблером «Уведомления чата» снизу (оба звали `toggleMute`). Убрана верхняя кнопка ([ContactCardModal.jsx](../src/native/components/ContactCardModal.jsx)) — осталась одна точка управления (нижний тумблер). `toggleMute`/`muted` сохранены (нужны тумблеру). Быстрые действия теперь: «Написать» + «В Telegram» (личный чат). Тест `ContactCardModal.vitest.jsx` (+1): нет текста «Заглушить», регулятор звука ровно один. Проверки: vitest, линт 0, лимиты. Побочно (по логу `[contact-info] … username=N bio=N`, сбоев нет) подтверждено: у контакта без публичного @username строка «Имя пользователя» скрывается — это верное поведение, не баг. **Требует ПОЛНОГО перезапуска.**

### v1.2.233 — Карточка контакта: доводка по ревью (логи + сообщение об ошибке + «В Telegram» + тест канала)

Дата: 2026-08-11. По ревью v1.2.232. (1) **Логи доработки** — `getContactInfo` ([tdlibChatActions.js](../main/native/backends/tdlibChatActions.js)) больше не глотает сбои `getUser`/`getUserFullInfo` молча: WARN в журнал (userId+ошибка, **без телефона/личных данных**) + INFO-итог `[contact-info] chatId=… phone=Y/N username=Y/N bio=Y/N`; `copyText` при сбое буфера пишет WARN через `app:log`. (2) **Сообщение об ошибке** — если у ЛИЧНОГО чата профиль не загрузился (`ok:false`), окно показывает «Не удалось загрузить профиль… перезапустите» (у групп `ok:false` — норма, там молчим). (3) **Кнопка «В Telegram»** (только личный чат) — открывает контакт в официальном Telegram через готовый `app:open-external`: `https://t.me/<username>` или `tg://user?id=<user_id>`. (4) **Тест регистрации** канала `tg:get-contact-info` в [tdlibIpcHandlers.vitest.js](../src/__tests__/tdlibIpcHandlers.vitest.js) — ловит класс «No handler registered» (тесты, мокающие `invoke`, его не ловят). Грабля про «main не перезапущен → No handler registered» записана в [mistakes/electron-core.md](../.memory-bank/mistakes/electron-core.md). Проверки: vitest 2282/2282, линт 0, лимиты 572/572 (renderer watermark 33540→33560). **Требует ПОЛНОГО перезапуска.**

### v1.2.232 — «Карточка контакта» (Классика + 10 улучшений): копирование имени/телефона, заметка о клиенте

Дата: 2026-08-11. По просьбе пользователя (выбран макет «Классика», затем 10 улучшений к нему). Раньше клик по имени в шапке чата ничего не открывал — имя/телефон нельзя было скопировать, профиль не виден.

**Что сделано.** По клику на имя ИЛИ аватар в шапке ([InboxChatPanel.jsx](../src/native/components/InboxChatPanel.jsx)) открывается окно `ContactCardModal` ([ContactCardModal.jsx](../src/native/components/ContactCardModal.jsx)) со всеми 10 улучшениями:
1. видимая кнопка 📋 у каждого поля; 2. копия имени у заголовка; 3. тост «Скопировано: …» (само значение);
4. клик по аватару → фото на весь экран (`photo:open`); 5. точный статус (`formatChatStatus`);
6. быстрые действия «Написать»/«Звук»; 7. телефон/username/bio из TDLib; 8. заметка о клиенте (localStorage);
9. закрытие ✕/Esc/клик-вне + «Скопировать всё»; 10. переключатель звука чата (`store.setMute`).

**Как работает (потоки данных):**
- **Копирование** (№1,2,3): новый util [copyText.js](../src/native/utils/copyText.js) → канал `clipboard:write-text` (Electron `clipboard.writeText`, [mainIpcHandlers.js](../main/handlers/mainIpcHandlers.js)); запасной путь `navigator.clipboard`.
- **Профиль** (№7): новый канал `tg:get-contact-info {chatId}` → `backend.chats.getContactInfo` → `getContactInfo(manager, chatId)` в [tdlibChatActions.js](../main/native/backends/tdlibChatActions.js): TDLib `getUser` (телефон/username) + `getUserFullInfo` (bio). Только личный чат. Пустые поля (приватность/сеть) скрывают строку. Дока: core.telegram.org/tdlib getUserFullInfo.
- **Заметка** (№8): [contactNotes.js](../src/native/utils/contactNotes.js) — localStorage, ключ `cc:contact-note:{accountId}:{rawId}`, на этом компьютере, наружу не уходит. Пустая заметка стирает запись.
- **Звук** (№6,10): существующий `store.setMute(chatId, muteUntil)`; заглушить = `2147483647`, включить = `0`.
- **Фото** (№4): существующий `photo:open {src: chat.avatar}`.

**Опасные зоны (учтены):** заметка хранится в localStorage (как темы), НЕ в файле настроек — чужие данные не затрагиваются. Запрос профиля идёт на серверы Telegram (как в самом Телеграме при открытии профиля), только чтение. Файл `tdlibBackend.js` был на пределе (930) — тяжёлая логика вынесена в `tdlibChatActions.js`, в backend только 1-строчная обёртка (929/930).

**Тесты:** `contactInfo.vitest.js` (5 — личный/группа/нет-клиента/приватность/невалидный), `ContactCardModal.vitest.jsx` (7 — имя, подтяжка телефона/username/bio, Esc/✕, копия имени→буфер+тост, звук→setMute, группа без телефона), `contactNotes.vitest.js` (5 — roundtrip/изоляция/стирание). Проверки: полный vitest, линт 0, лимиты (watermark renderer 33210→33540; tdlibBackend 929/930). Новые IPC: `tg:get-contact-info`, `clipboard:write-text` (см. api.md). Файлы: `main/native/backends/tdlibChatActions.js`, `main/native/backends/tdlibBackend.js`, `main/native/tdlibIpcHandlers.js`, `main/handlers/mainIpcHandlers.js`, `src/native/components/ContactCardModal.jsx` (new), `src/native/components/InboxChatPanel.jsx`, `src/native/utils/copyText.js` (new), `src/native/utils/contactNotes.js` (new). **Требует ПОЛНОГО перезапуска + визуальной проверки** (клик по имени → окно; копирование; телефон появляется, если Telegram его отдаёт).

### v1.2.231 — Доводка по ревью галочек списка: тест формулы в движке + меньше перерисовок

Дата: 2026-08-11. Две правки-упрочнения по итогам придирчивого ревью v1.2.230 (поведение не меняют, закрывают риски).

1. **Тест формулы прочтения в backend.** Раньше расчёт `lastMessageRead` в эмите `chat:last-message` ([tdlibClient.js](../main/native/backends/tdlibClient.js) `_patchChat`) проверялся только чтением — юнит-тест в сторе подавал готовый `read`. Теперь `tdlibClient.vitest.js` (+3) эмитит `updateChatLastMessage` и проверяет САМ эмит: исходящее прочитанное (`id ≤ last_read_outbox`) → `lastMessageRead:true`; непрочитанное (`id > last_read_outbox`) → `false`; входящее → `isOutgoing:false, read:false`. Ловит поломку формулы (напр. смену знака сравнения).

2. **`tg:read` (исходящий) не пересобирает список зря.** ([nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js)) Раньше на каждый read-receipt строился новый массив `chats` через `.map`, даже если ни один чат не менялся → лишняя перерисовка списка. Теперь флаг `chatsChanged`: `chats` кладём в новое состояние ТОЛЬКО если реально пометили что-то прочитанным (паттерн как в `flushPendingLastMsg`). Расчёт галочки не изменился.

**Проверки:** полный vitest 2263/2263 (+3 backend), линт 0, лимиты 566/566 (renderer watermark 33200→33210; `tdlibClient.vitest.js` 336/400). Файлы: `src/__tests__/tdlibClient.vitest.js`, `src/native/store/nativeStoreIpc.js`. Откат: снять эти две правки — базовое поведение v1.2.230 сохранится.

### v1.2.230 — Фикс: галочка в списке гасла с зелёной двойной до одной серой после запуска

Дата: 2026-08-11. Жалоба (со скриншотом): в ОКНЕ чата стоит зелёная двойная (прочитано), а в СПИСКЕ слева у того же чата — одна серая (отправлено). Рассинхрон.

**Корень (по коду, 🟢 открыл файлы):** галочка списка (`chat.lastMessageRead`) и галочка окна (`message.isRead`) — два разных поля. Окно берёт `isRead`, посчитанный при загрузке (`markOutboxRead`), и его никто не трогает. Список берёт `lastMessageRead`, а живой обработчик `tg:chat-last-message` ([nativeStoreLastMsgIpc.js](../src/native/store/nativeStoreLastMsgIpc.js)) в v1.2.229 **жёстко ставил `lastMessageRead: false`** на ЛЮБОЕ событие. А TDLib на старте шлёт `updateChatLastMessage` по КАЖДОМУ чату заново (сотни за <2с — это прямо в комментарии того же файла). Значит верный статус, посчитанный при загрузке, затирался в `false` служебным повтором, а сигнал `updateChatReadOutbox` для УЖЕ прочитанного письма не повторяется (он прозвучал в прошлом) → назад не поднять. Тот же класс беды, что фикс окна v1.2.228.

**Факт уровня 1 (TDLib):** «прочитано» у исходящего = `message.id ≤ chat.last_read_outbox_message_id`; статус приходит разово через `updateChatReadOutbox`. **Факт уровня 2 (код):** в момент `updateChatLastMessage` в `tdlibClient._patchChat` доступен `chat.last_read_outbox_message_id` (обновляется там же строкой выше) → точный статус можно посчитать при эмите, как в `mapChat`.

**Фикс:** событие `chat:last-message` теперь несёт НАСТОЯЩИЙ статус (`lastMessageId` + `lastMessageRead` + `lastMessageSending`), посчитанный backend по `last_read_outbox_message_id` — так же, как `mapChat` при загрузке. Стор применяет присланный статус, а не «всегда false». Оба emit-а (новое сообщение + правка последнего) уплотнены в существующие строки — файл `tdlibClient.js` остался ровно 650 (net-0, лимит цел). Живой `tg:read` (прочтение после запуска) флипает зелёную как прежде.

**Тесты:** `nativeStoreLastMsgIpc.vitest.jsx` (+2 регрессия: повтор про прочитанное → зелёная не гаснет; новое исходящее → одна серая). Проверки: полный vitest 2260/2260, линт 0, лимиты 566/566. Файлы: `main/native/backends/tdlibClient.js` (net-0), `main/native/tdlibIpcBridge.js`, `src/native/store/nativeStoreLastMsgIpc.js`. **Требует ПОЛНОГО перезапуска + визуальной проверки** (в списке зелёная двойная у прочитанных, совпадает с окном).

### v1.2.229 — Галочки прочтения в СПИСКЕ чатов (как в Telegram, «Акцент при прочтении»)

Дата: 2026-08-11. По просьбе пользователя (выбран «Вариант 2» из макета галочек списка). В списке чатов рядом со временем последнего сообщения теперь показывается галочка **только если последнее сообщение — наше**: 🟢 зелёная двойная = прочитано, приглушённая одинарная = отправлено. Если последним написал собеседник — галочки нет (как в Телеграме). Стиль совпадает с окном чата (v1.2.228, тот же зелёный `#6ee7a8`).

**Данные (по коду):** статус считается из TDLib-полей чата — «моё ли» = `last_message.is_outgoing`, «прочитано» ⇔ `last_message.id ≤ last_read_outbox_message_id` (та же логика, что `markOutboxRead` для окна чата, факт уровня 1 TDLib). Три точки:
- **Загрузка (точный статус):** `mapChat` ([tdlibMapper.js](../main/native/backends/tdlibMapper.js)) выставляет `lastMessageIsOutgoing` / `lastMessageSending` / `lastMessageRead`.
- **Живое новое/изменённое последнее сообщение:** событие `tg:chat-last-message` уже несёт `isOutgoing` → стор ([nativeStoreLastMsgIpc.js](../src/native/store/nativeStoreLastMsgIpc.js)) ставит `lastMessageIsOutgoing`, `read=false` (свежее ещё не прочитано), `id=null`. Backend/мост НЕ трогали ради полей (файл `tdlibClient.js` на лимите 650) — обошлись существующим `isOutgoing`.
- **Живое прочтение собеседником:** `tg:read {outgoing,maxId}` ([nativeStoreIpc.js](../src/native/store/nativeStoreIpc.js)) помечает `lastMessageRead=true`: при известном id — сверяя `id ≤ maxId` (путь загрузки), при `id=null` (живой путь) — по факту «последнее — моё».

**Показ:** `ChatListItem` ([ChatListItem.jsx](../src/native/components/ChatListItem.jsx)) — компонент `ListReadTick` (тонкий SVG, зелёная двойная / приглушённая одинарная) рисуется у времени только при `lastMessageIsOutgoing`. Узкий (compact) режим не затронут (в нём нет строки имени/времени).

**Известное мелкое ограничение:** при правке СВОЕГО последнего сообщения галочка на миг может пропасть (событие правки живёт без точного id) — восстанавливается следующим событием/перезагрузкой списка. Редкое действие, самолечится.

**Тесты:** `mapChatReadTick.vitest.js` (новый, 4 — read=true/false, sending, входящее); `ChatListItem.vitest.jsx` (+3 — зелёная двойная / одинарная / нет галочки). Проверки: полный vitest 2258/2258, линт 0, лимиты 566/566. Файлы: `main/native/backends/tdlibMapper.js`, `main/native/backends/tdlibClient.js` (net-0 строк), `src/native/store/nativeStoreLastMsgIpc.js`, `src/native/store/nativeStoreIpc.js`, `src/native/components/ChatListItem.jsx`. **Требует визуальной проверки** (окно/список без запуска не тестируется).

### v1.2.228 — Галочки прочтения: верный статус при загрузке чата + телеграмный вид (акцент при прочтении)

Дата: 2026-08-11. Жалоба: свои сообщения висят с ОДНОЙ галочкой (отправлено), хотя собеседник уже ответил (значит прочитал). И сами галочки — мелкий текст «✓/✓✓», не как в Телеграме.

**Корень (по коду):** `isRead` у сообщения ставился ТОЛЬКО по живому событию `updateChatReadOutbox` (обработчик [nativeStoreIpc.js:596](../src/native/store/nativeStoreIpc.js)). При ЗАГРУЗКЕ чата статус не вычислялся — маппер ([tdlibMapper.js](../main/native/backends/tdlibMapper.js)) ставил `isSending`, но не `isRead`. Поэтому сообщения, прочитанные собеседником ДО открытия чата, оставались с одной галочкой навсегда (живое событие уже прошло и не повторится).

**Факт уровня 1 (TDLib):** «прочитано» у исходящих = `message.id ≤ chat.last_read_outbox_message_id` (обновляется через `updateChatReadOutbox`).

**Фикс (логика):** новый `markOutboxRead(messages, lastReadOutboxId)` в [tdlibMapper.js](../main/native/backends/tdlibMapper.js) проставляет `isRead=true` исходящим не-sending сообщениям с `id ≤ last_read_outbox` чата. Вызывается во ВСЕХ 4 путях загрузки в [tdlibBackend.js](../main/native/backends/tdlibBackend.js) (`get`/`getIterativeUntil`/`getTopic`/`getIterativeUntilTopic`), число берётся из кэша чата (`getChatCached().last_read_outbox_message_id`). Живой `updateChatReadOutbox` не тронут (работает для чатов, прочитанных при открытом окне). Групповые/каналы — та же семантика, что у живого события (не хуже).

**Фикс (дизайн, Вариант 2 «Акцент при прочтении»):** в [MessageBubble.jsx](../src/native/components/MessageBubble.jsx) вместо текста «✓/✓✓» — тонкие SVG-галочки как в Телеграме (`TickIcon`): отправляется — часики ⏳; отправлено — приглушённая ОДИНАРНАЯ; прочитано — ДВОЙНАЯ акцентным (мятно-зелёным) цветом, бросается в глаза. Применён В ОБОИХ местах рендера галочки: у текстовых сообщений (время сбоку) И у фото/видео/безтекстовых (время снизу) — иначе у фото галочка оставалась старым белым «✓✓». Только окно чата (список чатов не трогали — по просьбе).

**КАК ПРОВЕРЕНО:** тест `tdlibMapper.vitest.js` +3 (isRead по границе id ≤ last; 0 → никого; кривой вход не падает) → 41/41; линт 0; лимиты 565/565. Живьём (реальный чат) без запуска не проверить → **требует перезапуска + визуальной проверки**: открыть чат, где тебе уже ответили → свои сообщения с двумя (акцентными) галочками. Откат: `git checkout -- main/native/backends/tdlibMapper.js main/native/backends/tdlibBackend.js src/native/components/MessageBubble.jsx src/__tests__/tdlibMapper.vitest.js` + версия на 1.2.227. См. граблю [[outgoing-two-cases]].

### v1.2.227 — Пузырь «↓ N новых»: число по реальному состоянию списка, а не накопление приходов

Дата: 2026-08-11. Жалоба: пузырь показывает «5 новых», когда на экране 1 уведомление; клик по нему «ничего не показывает».

**Корень (по коду + живому логу):** в [notificationNewPill.js](../main/notificationNewPill.js) счётчик щёлкал `+1` на каждое ПРИШЕДШЕЕ уведомление (`ccNewPillNextCount`) и НЕ вычитал исчезнувшие. Уведомления авто-гаснут (`dismiss`), поэтому за время «пришло 5», 4 погасли, на экране осталось 1 — а пузырь показывал 5. Живой `chatcenter.log` подтвердил: контейнер держит 0–1 карточку (`containerChildren=0/1` при `items=6/7` призраков), уведомления приходят и `dismiss`-ятся; клик РАБОТАЛ (`new-pill: jump→bottom` в логе), просто показывать было нечего.

**Фикс:** число теперь = сколько карточек СЕЙЧАС ниже видимой части списка (пересчёт по реальному `offsetTop` карточек vs `scrollTop`+`clientHeight`), а не накопление. Пересчитывается на ЛЮБОЕ изменение списка (пришла ИЛИ исчезла карточка — `MutationObserver`) и на прокрутку. Так «5» станет «1» (или пузырь спрячется, если ниже пусто). Список — новые внизу (`appendChild`), поэтому «ниже видимой области» = самые свежие непрочитанные, значит «новых» по смыслу верно. Клик по-прежнему прокручивает вниз + пересчёт (станет 0 → спрячется). Чистая `ccNewPillBelowCount(tops, scrollTop, clientHeight)` вынесена на `window.__ccNewPill.belowCount` и покрыта тестом.

**Факт уровня 1 (MDN):** `HTMLElement.offsetTop` — расстояние верха элемента от offsetParent; вместе с `scrollTop`+`clientHeight` определяет, ниже ли карточка видимой области. Чтобы offsetTop мерился ОТ СПИСКА (а не от body), `#container` получил `position: relative` ([notification.css](../main/notification.css)) — на раскладку не влияет, фикс-пузырь не затрагивает.

**КАК ПРОВЕРЕНО:** тест [notificationNewPill.vitest.js](../src/__tests__/notificationNewPill.vitest.js) переписан (6: вверху→считает ниже, у низа→0, короткий список→0, высокая одна карточка→0, пусто→0, кривые значения→0) → 6/6; линт 0; лимиты 565/565. `MutationObserver`/реальная раскладка без запуска не проверить (happy-dom не считает layout) → **требует перезапуска + визуальной проверки**: число на пузыре = сколько реально карточек ниже; клик прокручивает к ним; ниже пусто → пузыря нет. Откат: `git checkout -- main/notificationNewPill.js src/__tests__/notificationNewPill.vitest.js` + версия на 1.2.226. См. граблю [[notifications-ribbon]].

### v1.2.226 — Подпись к файлу: Enter отправляет только при непустой подписи (защита от случайной отправки)

Дата: 2026-08-11. Доводка по ревью v1.2.225 (находка #1, Вариант Б). В [FilePreviewBar.jsx](../src/native/components/FilePreviewBar.jsx) Enter отправлял файл даже с ПУСТОЙ подписью — случайное нажатие могло отправить файл преждевременно. Теперь Enter в подписи отправляет ТОЛЬКО при непустой подписи (`(caption||'').trim()`) — согласовано с главной строкой отправки (InboxMessageInput, где Enter шлёт лишь при `input.trim()`). Файл БЕЗ подписи по-прежнему уходит кнопкой «Отправить» (её поведение не менялось). Shift+Enter — новая строка. Тест `FilePreviewBar.vitest.jsx` +1 (Enter при пустой подписи → onSend НЕ вызван) → 6/6; линт 0; лимиты 565/565. Откат: `git checkout -- src/native/components/FilePreviewBar.jsx src/native/components/FilePreviewBar.vitest.jsx` + версия на 1.2.225.

### v1.2.225 — Подпись к файлу (панель FilePreviewBar) — тоже многострочное растущее поле

Дата: 2026-08-11. Доводка v1.2.224 (совет из ревью): поле подписи при отправке видео/документа/смешанного в [FilePreviewBar.jsx](../src/native/components/FilePreviewBar.jsx) было тем же однострочным `<input>` — длинная подпись с абзацами схлопывалась в строку. Заменено на растущий `<textarea>` тем же приёмом, что строка отправки (v1.2.224) и подпись в окне фото: `autosize` до 120px, дальше прокрутка; `useEffect([caption])` (хук стоит ДО раннего `return null` — правило хуков); Enter — отправить (`preventDefault`, `onSend(undefined,{splitText: capOver})`), Shift+Enter — новая строка. Окно фото (PhotoSendModal) уже было многострочным — не трогали. Тест `FilePreviewBar.vitest.jsx` +3 (подпись — textarea; Enter → отправка; Shift+Enter → нет) → 5/5; линт 0; лимиты (файл 239/600). Откат: `git checkout -- src/native/components/FilePreviewBar.jsx src/native/components/FilePreviewBar.vitest.jsx` + версия на 1.2.224.

### v1.2.224 — Строка отправки в нативной ленте: многострочное растущее поле (как Телеграм)

Дата: 2026-08-11. Жалоба: строка отправки не расширялась и «лепила всё в строку» — вставленный многострочный текст (например, ответ ИИ-помощника с абзацами) схлопывался в одну линию.

**Корень (по коду):** поле отправки в [InboxMessageInput.jsx](../src/native/components/InboxMessageInput.jsx) было однострочным `<input type="text">`, которое физически не хранит переносы и не растёт по высоте. (Показ переносов уже был готов: пузырь `MessageBubble.jsx` рисует `white-space: pre-wrap`; отправка текст с `\n` не режет.)

**Фикс:** `<input>` заменён на растущий `<textarea>` (тот же приём авто-роста, что у подписи в окне фото `PhotoSendModal`): `autosize` ставит высоту по `scrollHeight` до потолка 140px, дальше — прокрутка внутри поля; `useEffect([input])` пересчитывает высоту и при внешней смене текста (вставка ответа ИИ, редактирование, очистка после отправки). Клавиши как в Телеграм: **Enter — отправить** (с `preventDefault`, чтобы не вставлялся перенос), **Shift+Enter — новая строка**; Ctrl+↑ (редактировать последнее) и вставка фото Ctrl+V сохранены. Стиль не задавал — `textarea` автоматически стилизуется тем же правилом, что `input` ([styles-base.css:97-98](../src/native/styles-base.css)). Тронут только этот компонент.

**КАК ПРОВЕРЕНО:** новый тест [InboxMessageInput.vitest.jsx](../src/native/components/InboxMessageInput.vitest.jsx) (5: поле — textarea; Enter → отправка; Shift+Enter → нет; Enter на пустом → нет; ввод → onChange с `\n`) → 5/5; линт 0; лимиты (файл 140/600). Визуально без запуска не проверить → **требует перезапуска + проверки**: Shift+Enter даёт новую строку, поле растёт, вставка ответа ИИ сохраняет абзацы. Откат: `git checkout -- src/native/components/InboxMessageInput.jsx src/native/components/InboxMessageInput.vitest.jsx` + версия на 1.2.223.

### v1.2.223 — Пузырь «↓ N новых»: журнал работы + ошибка не глотается молча

Дата: 2026-08-11. Доводка по ревью v1.2.222 (находка #1) + просьба «добавить логи». Раньше модуль [notificationNewPill.js](../main/notificationNewPill.js) был «немым»: ни ошибки настройки, ни работы не видно в журнале. Добавлено (через `window.notifApi.log` — журнал окна уведомлений, `chatcenter.log`):

- **Ошибка настройки** — внешний `catch` был пустой; теперь пишет `WARN new-pill init failed: …` (если наблюдатель за списком упал — видно).
- **Логи работы (INFO, только на ПЕРЕХОДАХ, без спама):** `ready` — модуль настроился; `shown count=N` — пузырь появился (пришли новые, пока читаешь вверху); `hidden` — пузырь скрылся; `jump→bottom` — клик по пузырю (прыжок к свежим). На каждый инкремент НЕ логируем (только смена видимости) — чтобы не засорять журнал при потоке.

Это закрывает находку #1 ревью и позволяет проверить работу пузыря по журналу, а не только визуально. Тест `notificationNewPill.vitest.js` 5/5 (чистая функция не затронута); линт 0; лимиты 564/564. Откат: `git checkout -- main/notificationNewPill.js` + версия на 1.2.222.

### v1.2.222 — Лента уведомлений: пузырь «↓ N новых» отдельным независимым модулем

Дата: 2026-08-11. Вторая половина Варианта 1 (после v1.2.221): пока читаешь старые карточки (прокрутил вверх), новые не дёргают список — но чтобы ты о них знал, показывается пузырь «↓ N новых».

**Как сделано — БЕЗ разбиения хрупкого notification.js.** Совет из ревью был «разбить notification.js (728/730), чтобы добавить пузырь». Найден способ лучше: пузырь — ПОЛНОСТЬЮ независимый модуль [notificationNewPill.js](../main/notificationNewPill.js) (new), подключается отдельным `<script>` в [notification.html](../main/notification.html) ПОСЛЕ notification.js. Он сам следит за списком через `MutationObserver` на `#container` (childList) и не зависит от внутренностей notification.js → **самый фрагильный файл вообще не тронут**, разбивать его не пришлось.

**Логика:** пришла новая карточка (прямой ребёнок `#container`) → на следующем кадре проверяем «у низа ли юзер» (`scrollHeight − scrollTop − clientHeight ≤ 90`, тот же критерий, что `shouldAutoScroll` v1.2.221); если НЕ у низа — счётчик += число пришедших, показываем пузырь; клик по пузырю или прокрутка вниз — прыжок к свежим и сброс. Чистое решение вынесено в `ccNewPillNextCount(prev, added, nearBottom)` (`window.__ccNewPill.nextCount`) и покрыто тестом. Кадр-задержка (`requestAnimationFrame`) нужна, чтобы не мигать: если юзер был у низа, notification.js сам доскроллит вниз → пузырь не появится. CSS `.new-pill` (фикс. вверху по центру, фиолетовый) — [notification.css](../main/notification.css). Файл добавлен в `copyStaticPlugin` [electron.vite.config.js](../electron.vite.config.js) (dev + прод).

**КАК ПРОВЕРЕНО:** тест [notificationNewPill.vitest.js](../src/__tests__/notificationNewPill.vitest.js) (5: сброс у низа, прибавление вверху, с нуля, ноль-новых, кривые значения) → 5/5; линт 0; лимиты 564/564. `MutationObserver`/DOM без запуска не проверить → **требует перезапуска + визуальной проверки** (читаешь старые, приходят новые → пузырь «↓ N новых»; клик → прыжок вниз). Откат: `git rm main/notificationNewPill.js src/__tests__/notificationNewPill.vitest.js` + убрать `<script>` из notification.html, `.new-pill` из css, строку из electron.vite.config.js + версия на 1.2.221.

