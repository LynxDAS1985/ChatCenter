# Архив changelog: v1.2.170 – v1.2.184 (перенесено из features.md 2026-08-03, v1.2.198)

Логотип Telegram в рейле, живой статус собеседника, переключатель режимов, фикс поиска, читаемость шапки/меню.

### v1.2.184 — Логотип в рейле: вернул чёрный кружок-подложку, убрал только цветную рамку

Дата: 2026-07-31. Уточнение к v1.2.183: в прошлой правке у значка мессенджера убрали ВСЁ (фон+рамку+круг), а пользователь просил убрать ТОЛЬКО цветную рамку-обводку. Возвращён чёрный кружок-подложка (`background: var(--amoled-bg)` + `borderRadius: 50%`) — чтобы логотип читался поверх фото аватара; убрана только цветная рамка `border: 1px solid ${color}`. Размеры: коробка px(18), логотип px(12). [AccountAvatar.jsx](../src/native/components/AccountAvatar.jsx). ESLint 0. **Требует пересборки + визуальной проверки:** логотип на чёрном кружке, но без цветной рамки вокруг значка; цветная обводка самого аккаунта на месте. Откат: `git checkout -- src/native/components/AccountAvatar.jsx` + версия на 1.2.183.

### v1.2.183 — Логотип: убран кружок в рейле + страховка битой картинки + тест + дедуп эмодзи + чистка PNG

Дата: 2026-07-31. Доводки к v1.2.182 по просьбе пользователя и советам ревью.
- **Убран кружок-обводка у логотипа в рейле аккаунтов** ([AccountAvatar.jsx](../src/native/components/AccountAvatar.jsx)): у углового значка мессенджера убраны `background`/`border`/`borderRadius` — теперь только сам логотип, без круглой плашки. Цветная обводка САМОГО аккаунта (accountColor) рисуется отдельно и не тронута. Значок чуть увеличен (px(11)→px(14), т.к. кружок больше не ест место).
- **Страховка битой картинки** ([MessengerIcon.jsx](../src/native/components/MessengerIcon.jsx)): добавлен `onError` — если data-URI логотипа не загрузился, значок переключается на эмодзи (никогда не покажет иконку-«поломашку»). Через `useState(failed)`.
- **Мини-тест** ([MessengerIcon.vitest.jsx](../src/native/components/MessengerIcon.vitest.jsx), +3): telegram → `<img>` с `data:image/png;base64,`; whatsapp/неизвестный → эмодзи без картинки.
- **Дедуп эмодзи** ([AccountAvatar.jsx](../src/native/components/AccountAvatar.jsx)): удалён локальный дубль списка `MESSENGER_EMOJI` — теперь через `getMessengerEmoji` из [messengerBranding.js](../src/native/utils/messengerBranding.js) (единый источник). Локальный `MESSENGER_COLORS` НЕ трогали — у него другой запасной цвет (telegram vs var(--amoled-border)), дедуп изменил бы поведение для неизвестного мессенджера.
- **Чистка PNG/**: удалены `T.png` (4096×4096, 179 КБ) и `T_50%.jpg` (JPG — неверный формат для логотипа) — не использовались после встраивания data-URI. Остался `T1.png` (7 КБ) как источник логотипа.

Проверки: ESLint 0; лимиты 548/548 (renderer-ватерлиния 32000→32050); MessengerIcon 3/3; ChatListItem-снапшот 16/16; InboxMode 12/12. **Требует пересборки + визуальной проверки:** в рейле логотип Telegram БЕЗ круглой обводки; обводка аккаунта на месте. Откат: `git checkout -- src/native/components/AccountAvatar.jsx src/native/components/MessengerIcon.jsx` + удалить `MessengerIcon.vitest.jsx` + вернуть PNG-файлы (если нужны) + версия на 1.2.182.

### v1.2.182 — Логотип Telegram вместо эмодзи ✈️ (значок мессенджера — картинка)

Дата: 2026-07-31. По просьбе пользователя: заменить эмодзи-самолётик на настоящий логотип Telegram (файл `PNG/T1.png` — 128×128 RGBA, ~7 КБ, подходит).

**Как встроено (3 факта → выбран data-URI).** (1) CSP в [index.html](../index.html) разрешает `img-src … data:` → картинка-строка покажется. (2) В проекте НЕТ папки ассетов и ни одного `import *.png` в renderer — импорт-картинки через сборщик в упакованном Electron рискует сломаться на путях (file://). (3) Логотип крошечный (7 КБ → ~9 КБ base64). Вывод: встроить логотип строкой (data-URI) — не трогая сборку, работает и в dev, и в проде.

**Что сделано.**
- Новый [messengerLogos.js](../src/native/utils/messengerLogos.js): `MESSENGER_LOGOS = { telegram: 'data:image/png;base64,…' }` + `getMessengerLogo(messenger)` (null если логотипа нет).
- Новый компонент [MessengerIcon.jsx](../src/native/components/MessengerIcon.jsx): рисует `<img>` если у мессенджера есть логотип, иначе fallback на эмодзи ([messengerBranding.js](../src/native/utils/messengerBranding.js)). Размер через проп `size`.
- Заменён эмодзи ✈️ в 3 видимых местах: значок на аватарке аккаунта ([AccountAvatar.jsx](../src/native/components/AccountAvatar.jsx)), строка в списке чатов ([ChatListItem.jsx](../src/native/components/ChatListItem.jsx)), чип в шапке ([InboxChatPanel.jsx](../src/native/components/InboxChatPanel.jsx)). Эмодзи в подсказках (`title`) оставлены (в текст картинку не вставить).
- WhatsApp/ВК/Макс/Viber — по-прежнему эмодзи (логотипов пока нет; добавляются тем же способом).

Опасные зоны не затронуты: сборку/конфиг не менял, новых зависимостей нет. Проверки: ESLint 0 (длинная base64-строка проходит); лимиты 547/547 (renderer 31992/32000); ChatListItem-снапшот 16/16 (эталон не задет — строка мессенджера только при 2+ аккаунтах, в снапшоте её нет); InboxMode 12/12. **Требует пересборки + визуальной проверки:** вместо ✈️ — синий самолётик-логотип на аватарке, в списке и в шапке. Откат: `git checkout -- src/native/components/AccountAvatar.jsx src/native/components/ChatListItem.jsx src/native/components/InboxChatPanel.jsx` + удалить `src/native/utils/messengerLogos.js` и `src/native/components/MessengerIcon.jsx` + версия на 1.2.181.

### v1.2.181 — Цветная статус-строка в верхней полоске: ✓ зелёным (сработало) / ✗ красным (не вышло)

Дата: 2026-07-31. По просьбе пользователя (Вариант 1 из макета): результат фоновых операций в верхней полоске — зелёной строкой с ✓ если сработало, красной с ✗ если нет.
- **Полоска** [TabBar.jsx](../src/components/TabBar.jsx): `statusBarMsg` теперь может быть строкой (нейтрально, серым 💬 — обратная совместимость) ИЛИ объектом `{ text, ok }`: `ok:true` → зелёная ✓, `ok:false` → красная ✗. Разбор через IIFE, цвет/значок/жирность по результату.
- **Переход к чату** [useNotifyNavigation.js](../src/hooks/useNotifyNavigation.js): успех → `{ text:'Перешёл в чат «Имя»', ok:true }` (зелёная ✓), провал → `{ text:'«Имя» — не найден в списке', ok:false }` (красная ✗). Раньше обе строки были серым текстом `>> "Имя" …`.

Инфраструктура готова для расширения на другие операции (ловля сообщений, доставка уведомлений, чтение списка) — достаточно передавать объект `{text, ok}`. Пока покрыт переход к чату (пример из макета). Проверки: ESLint 0; лимиты 545/545 (renderer-ватерлиния 31950→32000). **Требует пересборки + визуальной проверки:** клик по уведомлению → в полоске зелёная строка «✓ Перешёл в чат …» или красная «✗ … не найден». Откат: `git checkout -- src/components/TabBar.jsx src/hooks/useNotifyNavigation.js src/__tests__/fileSizeLimits.test.cjs` + версия на 1.2.180.

### v1.2.180 — Шапка чата читаемее: чип аккаунта в его цвете + точка у статуса + ярче текст

Дата: 2026-07-31. Жалоба: метка «Telegram · Avtoliberty» в шапке — тусклая (11px, `--amoled-text-muted` #606060), плохо читалась. Выбран Вариант 1 из макета. Правки в [InboxChatPanel.jsx](../src/native/components/InboxChatPanel.jsx):
- **Чип в цвете аккаунта:** метка источника стала плашкой с фоном/гранью из цвет-метки аккаунта (`getAccountColor`), имя аккаунта — тем же цветом жирным, мессенджер — светло-серым. Читаемо + сразу видно, какой аккаунт. Цвет берётся динамически (у каждого аккаунта свой из `ACCOUNT_PALETTE`).
- **Точка у статуса:** перед «в сети / был(а) …» для личных чатов — точка (зелёная `--amoled-success` в сети / серая `#6a6a72` нет). Для групп/каналов точки нет.
- **Ярче текст:** статус `--amoled-text-muted` (#606060) → `--amoled-text-dim` (#a0a0a0).

Проверки: ESLint 0; лимиты 545/545 (renderer 31941/31950); InboxMode 12/12. **Требует пересборки + визуальной проверки.** Откат: `git checkout -- src/native/components/InboxChatPanel.jsx` + версия на 1.2.179.

### v1.2.179 — Меню режимов: подложка только под курсором, выбор — только галочкой

Дата: 2026-07-31. По просьбе пользователя: у активного пункта убрана постоянная подложка — фон появляется ТОЛЬКО под курсором (наведение на любой пункт, включая активный), а выбранный режим отмечен только галочкой ✓ справа. Правка [RailModeSwitcher.jsx](../src/native/components/RailModeSwitcher.jsx): `background:'transparent'` всегда, ховер (`rgba(255,255,255,0.08)`) снят с гварда `!on` → работает на всех пунктах. ESLint 0. **Требует пересборки + визуальной проверки.**

### v1.2.178 — Меню режимов: читаемый активный пункт (белый текст + галочка ✓)

Дата: 2026-07-31. Жалоба: активный пункт «Чаты» плохо читался — синий текст на синеватом фоне. Выбран Вариант 4 из макета. Фикс в [RailModeSwitcher.jsx](../src/native/components/RailModeSwitcher.jsx): текст пунктов ВСЕГДА белый (`#eef1f6`), активный — лёгкий фон `rgba(255,255,255,0.07)` + полужирный + синяя галочка ✓ справа (текст в синий больше не красим). Шрифт 13→14px. ESLint 0. **Требует пересборки + визуальной проверки.**

### v1.2.177 — Меню режимов: контрастный фон (не сливается со списком)

Дата: 2026-07-31. Жалоба: всплывающее меню «Чаты/Клиенты/Доска» сливалось с фоном списка чатов. Причина: фон меню был `--amoled-surface` (#0a0a0a) — тот же, что у списка. Фикс: «приподнятый» фон `#20242e` + светлая рамка `rgba(255,255,255,0.14)` + сильная тень (как у AccountContextMenu — единый стиль всплывающих меню проекта); наведение 0.05→0.08 под светлый фон. Файл: [RailModeSwitcher.jsx](../src/native/components/RailModeSwitcher.jsx). ESLint 0. **Требует пересборки + визуальной проверки.**

### v1.2.176 — Доводки перекомпоновки: меню режимов сбоку (не обрезается), иконка в самом низу рейла, 🎨 переехал в шапку к 🔍

Дата: 2026-07-31. Три правки по фидбеку пользователя (со скринами) к v1.2.175.

**1. 🔴 Меню режимов обрезалось у левого края — теперь открывается СБОКУ.** Поповер «Чаты/Клиенты/Доска» центрировался на узком рейле (`translateX(-50%)`) и уходил за левый край окна, где его обрезал `.native-content { overflow:hidden }` ([styles-base.css:159](../src/native/styles-base.css)). Фикс в [RailModeSwitcher.jsx](../src/native/components/RailModeSwitcher.jsx): меню открывается вправо от иконки (`left:100%; bottom:0`) — целиком на экране, в области списка. (Эта же дыра была найдена в ревью v1.2.175.)

**2. Иконка режимов — в САМЫЙ НИЗ рейла.** Была сразу под «+». Теперь `marginTop:auto` на разделителе ([NativeApp.jsx](../src/native/NativeApp.jsx)) прижимает группу (разделитель + иконка) к низу рейла.

**3. 🎨 цвет сообщений → в шапку переписки рядом с 🔍; 48px-полоса сверху убрана.** Кнопка 🎨 жила в отдельной полосе высотой 48px над перепиской ([InboxMode.jsx](../src/native/modes/InboxMode.jsx)). Полоса удалена (переписка стала выше на 48px), 🎨 добавлена в шапку [InboxChatPanel.jsx](../src/native/components/InboxChatPanel.jsx) рядом с 🔍 через новый проп `onOpenThemePicker` (открывает тот же ThemePickerModal). Модалка выбора цвета и логика не изменились.

**Проверки:** ESLint 0; лимиты 545/545; InboxMode+VirtualMessageList+фильтр 33/33. **Требует пересборки + визуальной проверки:** меню режимов появляется справа от иконки и видно целиком; иконка внизу рейла; 🎨 рядом с 🔍 в шапке, верхней полосы нет, переписка выше. Откат: `git checkout -- src/native/components/RailModeSwitcher.jsx src/native/NativeApp.jsx src/native/modes/InboxMode.jsx src/native/components/InboxChatPanel.jsx` + версия на 1.2.175.

### v1.2.175 — Переключатель режимов (Чаты/Клиенты/Доска) переехал в рейл аккаунтов; список чатов поднялся вверх

Дата: 2026-07-31. По просьбе пользователя (выбран Вариант 3 из макета «одна иконка → меню вверх»). Цель: убрать верхний блок над списком чатов, чтобы список стал выше.

**Что сделано.**
- Новый компонент [RailModeSwitcher.jsx](../src/native/components/RailModeSwitcher.jsx): ОДНА иконка внизу рейла аккаунтов (под «+», через разделитель), показывает текущий режим; клик → меню ВВЕРХ с 3 режимами (Чаты 💬 / Клиенты 👥 / Доска 📋). Активный подсвечен. Закрытие по клику вне и Escape. Иконка масштабируется с шириной рейла (`railScale`).
- [NativeApp.jsx](../src/native/NativeApp.jsx): переключатель добавлен в рейл после «+»; использует `store.mode` / `store.setMode` (те же, что старый дропдаун).
- [InboxChatListSidebar.jsx](../src/native/components/InboxChatListSidebar.jsx): удалён верхний дропдаун `ChatTypesDropdown` (блок + импорт + неиспользуемый проп `modes`) → поиск и список **поднялись вверх** (освободилось ~44px).

**Улучшение против старого.** Раньше дропдаун был только в режиме «Чаты» (в списке) — из «Клиентов»/«Доски» переключиться было нечем. Теперь переключатель в рейле виден во ВСЕХ режимах.

**Остаток.** `ChatTypesDropdown.jsx` (101 стр.) осталась сиротой (нет импортёров, только упоминание в комментарии) — файлы без подтверждения не удаляю; можно удалить по слову пользователя (тогда вернётся ~101 строка renderer-бюджета). 🎨-кнопку в этой задаче не трогал — отдельный шаг. Проверки: ESLint 0; лимиты 545/545 (renderer-ватерлиния 31900→31950, обоснование в тесте); nativeStoreFilter/InboxMode 20/20. **Требует пересборки + визуальной проверки:** верхний блок исчез, список выше; иконка внизу рейла открывает меню вверх, переключение режимов работает. Откат: `git checkout -- src/native/NativeApp.jsx src/native/components/InboxChatListSidebar.jsx src/__tests__/fileSizeLimits.test.cjs` + удалить `src/native/components/RailModeSwitcher.jsx` + версия на 1.2.174.

### v1.2.174 — Имя собеседника над сообщениями показываем только в группах/форумах (в личном чате — убрано)

Дата: 2026-07-31. Жалоба: в ЛИЧНОМ чате над сообщениями повторно писалось имя учётной записи собеседника (дублировало шапку) — как в группе.

**Корень (по коду).** [VirtualMessageList.jsx:130](../src/native/components/VirtualMessageList.jsx) рисовал метку автора `.native-msg-author` для ЛЮБОГО входящего сообщения с `senderName`, без проверки типа чата. В личном чате имя собеседника тоже попадает в `senderName` → показывалось зря (нужно только в группах/форумах, где несколько отправителей).

**Фикс (минимальный).** В `rowContext` ([InboxChatPanel.jsx](../src/native/components/InboxChatPanel.jsx)) добавлен флаг `showSenderName: activeChat?.type === 'group'` (группы + форумы = много отправителей; личный `'user'` и канал — нет). Метка автора в VirtualMessageList рисуется только при этом флаге. Значения типа: `chatTypePrivate/Secret`→`'user'`, `BasicGroup`/`Supergroup`(не канал)→`'group'`, канал→`'channel'` ([tdlibMapper.js:294-299](../main/native/backends/tdlibMapper.js)).

**Остаток (не трогал, по правилу минимума).** Аватар собеседника сбоку каждого входящего сообщения ([VirtualMessageList.jsx:118](../src/native/components/VirtualMessageList.jsx)) в личном чате тоже показывается (Telegram его в 1-1 не рисует) — если мешает, скажи, повешу на тот же флаг. Тесты: `VirtualMessageList.vitest.js` 13/13 (buildRowContext отдаёт `showSenderName:true`). Проверки: ESLint 0; лимиты 544/544. **Требует пересборки + визуальной проверки:** личный чат — имени над сообщениями НЕТ; группа/форум — имя есть. Откат: `git checkout -- src/native/components/InboxChatPanel.jsx src/native/components/VirtualMessageList.jsx src/native/components/VirtualMessageList.vitest.jsx` + версия на 1.2.173.

### v1.2.173 — Фикс «залипшего в сети»: статус в userCache теперь обновляется (иначе refresh возвращал стале online) 🔴

Дата: 2026-07-31. Жалоба (со скринами): у нас «в сети», а в реальном Telegram «был(а) 14 минут назад» — человек офлайн, а мы показываем онлайн.

**Корень (по коду, 3 факта).** (1) TDLib шлёт смену онлайн/офлайн ОТДЕЛЬНЫМ событием `updateUserStatus` и НЕ пересылает полный `updateUser` (факт ур.1, td_api). (2) Обработчик `updateUserStatus` в [tdlibClient.js](../main/native/backends/tdlibClient.js) только эмитил событие, но **не обновлял `userCache`** — единственный писатель кэша был `updateUser`. (3) `getAccountChats` → `mapChat` берёт статус из `userCache.get(userId).status`. Итог: человек ушёл офлайн → живой обработчик (v1.2.171) поправил стор, НО кэш держал старый `userStatusOnline` → ближайший refresh списка чатов через mapChat снова возвращал «в сети», затирая исправление. (Это латентный баг с v0.95.29 — раньше маскировался тем, что live-обновления статуса вообще не было.)

**Фикс (минимальный).** В `updateUserStatus` перед эмитом обновляем статус в кэше: `const cachedUser = record.userCache.get(Number(update.user_id)); if (cachedUser) cachedUser.status = update.status || null`. Теперь кэш всегда согласован → и live-обновление, и любой refresh дают верный статус. Крайние случаи: юзера ещё нет в кэше (status раньше user) → пропуск записи, live-обработчик обновит стор, полный updateUser придёт позже; status=null → кэш null → mapChat трактует как «не онлайн».

**Тест-ловушка.** [tdlibEmitContracts.vitest.js](../src/__tests__/tdlibEmitContracts.vitest.js): updateUser(online) → кэш online; затем updateUserStatus(offline) → кэш ДОЛЖЕН стать offline (репродюсер бага). Проверки: контракт-тест 31/31; ESLint 0; `node --check` OK; лимит tdlibClient 647/650. **Требует пересборки + визуальной проверки:** собеседник офлайн → «был(а) N минут назад», а не «в сети». Откат: `git checkout -- main/native/backends/tdlibClient.js src/__tests__/tdlibEmitContracts.vitest.js` + версия на 1.2.172.

### v1.2.172 — Почин краха поиска (filter is not defined) + точка «в сети» в списке чатов + доводки статуса по ревью

Дата: 2026-07-31. Жалоба: при вводе в строку поиска Telegram — ошибка `NativeInbox: filter is not defined` (экран падал в ErrorBoundary). Плюс пакет: точка «в сети» в списке, разгрузка features.md, доводки по ревью.

**1. 🔴 Крах поиска (корень по коду).** [InboxChatListSidebar.jsx](../src/native/components/InboxChatListSidebar.jsx) в счётчике «найдено X из Y» использовал ГОЛУЮ переменную `filter` — остаток старого фильтра по типам, удалённого в v1.2.163 (переезд на фильтр аккаунтов). Счётчик рисуется только при активном поиске → `ReferenceError: filter is not defined` ловил ErrorBoundary → весь список падал. (Пользователь думал «из-за 2 аккаунтов» — на самом деле из-за самого факта поиска.) Фикс: знаменатель считается как число чатов ВИДИМЫХ аккаунтов через тот же `effectiveVisibleAccountIds`, что и основной список (единый источник). Не зависит от числа аккаунтов.

**2. Точка «в сети» в списке чатов (и при 2+ аккаунтах).** [ChatListItem.jsx](../src/native/components/ChatListItem.jsx) показывал зелёную точку онлайна только при ОДНОМ аккаунте (`chat.isOnline && !multiAccount`) — а у пользователя два, ветка multiAccount точку гасила. Условие `!multiAccount` — устаревшее: значок аккаунта переехал в левую цвет-полосу (v1.2.155), низ-право аватарки свободен. Убрал guard → точка в основной ветке при любом числе аккаунтов; добавил такую же точку в компактную (узкий рейл) ветку. Данные живые: `chat.isOnline` обновляет обработчик `tg:user-status` (v1.2.171) → точка в списке загорается/гаснет сама.

**3. Скрытые статусы (недавно/на неделе/месяц) — проверено, уже работает.** [formatChatStatus.js:74-79](../src/native/utils/formatChatStatus.js) уже рисует `userStatusRecently`→«был(а) недавно», `LastWeek`→«был(а) на этой неделе», `LastMonth`→«был(а) в этом месяце», `Empty`→«давно не был(а)». Данные доходят (mapChat + live tg:user-status ставят `userStatusType`). Кода не потребовалось.

**4. Ревью прошлой правки (2 находки закрыты).** (#1) Обработчик `tg:user-status` [nativeStoreSendIpc.js](../src/native/store/nativeStoreSendIpc.js) пересобирал массив `chats` на КАЖДЫЙ сигнал статуса (частый, для любого юзера) → лишние перерисовки. Теперь обновляет только при реальном совпадении+изменении, иначе возвращает тот же объект state (React пропускает ре-рендер). (#2) Добавлен контракт-тест канала `tg:user-status` в [tdlibEmitContracts.vitest.js](../src/__tests__/tdlibEmitContracts.vitest.js) (offline+was_online→точное время; online→без времени; recently→только тип).

**5. Разгрузка features.md.** Активный файл дошёл до 90 КБ (лимит 100) → блок v1.2.147–155 (цвет-метки + фиксы входа) вынесен в [archive/features-v1.2.147-155.md](./archive/features-v1.2.147-155.md), активный → 61 КБ.

**Проверки:** ESLint 0; контракт-тест 30/30 (+3 user-status); userStatusMap/typing зелёные; лимиты 544/544 (renderer-ватерлиния 31850→31900, обоснование в тесте); память 41/41. **Требует пересборки + визуальной проверки:** ввод в поиск → список НЕ падает, показывает «найдено X из Y»; онлайн-собеседник в списке → зелёная точка на аватарке (при двух аккаунтах тоже). Откат: `git checkout -- src/native/components/InboxChatListSidebar.jsx src/native/components/ChatListItem.jsx src/native/store/nativeStoreSendIpc.js src/__tests__/tdlibEmitContracts.vitest.js src/__tests__/fileSizeLimits.test.cjs` + версия на 1.2.171.

### v1.2.171 — Живой онлайн-статус собеседника («в сети / был(а) в HH:MM») + общий глагол действий + разгрузка tdlibClient

Дата: 2026-07-31. Три задачи разом: два ⭐⭐ совета из ревью + «статусы тоже делай полностью».

**1. Статусы полностью — живое обновление онлайна (была дыра).** Онлайн-статус показывался ТОЛЬКО при загрузке чата (`mapChat`) и больше НЕ менялся: собеседник заходил/выходил — в шапке висело старое. Корень (по коду + grep): TDLib `updateUserStatus` → мост слал канал `tg:user-status`, но **его никто не слушал** (`grep tg:user-status src/` — пусто), да и слал лишь `online:boolean` (терялось точное «был(а) в HH:MM»). Что сделано:
- Бэкенд [tdlibClient.js](../main/native/backends/tdlibClient.js): `updateUserStatus` форвардит СЫРОЙ объект статуса (в нём `@type` + `was_online`), а не только тип.
- Единый разбор статуса вынесен в чистый [shared/userStatusMap.js](../shared/userStatusMap.js) `mapUserStatus(status)` → `{isOnline, lastSeenAt, userStatusType}` — переиспользован в `mapChat` (убран дубль) И в мосте.
- Мост [tdlibIpcBridge.js](../main/native/tdlibIpcBridge.js): `tg:user-status` теперь шлёт `{accountId, userId, isOnline, lastSeenAt, userStatusType}`.
- Chat получил поле `userId` ([tdlibMapper.js](../main/native/backends/tdlibMapper.js)) — чтобы обработчик нашёл чат по пользователю (updateUserStatus даёт userId, не chatId).
- НОВЫЙ обработчик `tg:user-status` в [nativeStoreSendIpc.js](../src/native/store/nativeStoreSendIpc.js) — живо обновляет `isOnline/lastSeenAt/userStatusType` у всех чатов пользователя. Отображение (`formatChatStatus.js`) уже было готово: «в сети / был(а) в 14:32 / был(а) недавно».

**2. ⭐⭐ Общий глагол, когда несколько собеседников делают ОДНО действие.** Раньше 2+ собеседников всегда → «печатают…», даже если оба записывают голосовое. Теперь [formatTypingUsers.js](../src/native/utils/formatTypingUsers.js): `ACTION_VERB_PLURAL` + `pluralVerb(active)` — если действие у ВСЕХ одно → его мн. форма («Иван и Маша записывают голосовое…»); разные действия → безопасный откат «печатают…».

**3. ⭐⭐ Разгрузка tdlibClient.js (был 650/650).** `userDisplayName`/`chatDisplayName` вынесены в новый [tdlibNames.js](../main/native/backends/tdlibNames.js); tdlibClient импортирует их обратно и РЕЭКСПОРТИРУЕТ (tdlibBackend.js берёт `userDisplayName` отсюда — путь сохранён). Файл 649 → 641 (появился запас).

**Тесты:** `shared/userStatusMap.vitest.js` (+6), `formatTypingUsers.vitest.js` (+4 общий глагол). Проверки: node --check 7 файлов OK; линт 0; лимиты 544/544 (renderer-ватерлиния 31800→31850, обоснование в тесте); tdlibMapper/emit-контракты 96/96. **Требует ПОЛНОГО перезапуска + визуальной проверки** (собеседник зашёл/вышел → статус в шапке меняется живо; несколько печатающих с одним действием → общий глагол).

### v1.2.170 — Статус собеседника: не только «печатает», а голосовое/фото/видео/стикер + лог самолечения фильтра

Дата: 2026-07-31. По просьбе пользователя. Показ «печатает…» уже был (v0.89.4/0.95.31), но ЛЮБОЕ действие собеседника отображалось как «печатает» (или гасло) — теперь показываем КОНКРЕТНОЕ действие.

**Корень (по коду).** [tdlibClient.js](../main/native/backends/tdlibClient.js) на `updateChatAction` брал только `chatActionTyping` (`isTyping = actionType === 'chatActionTyping'`), остальные типы TDLib (запись голосового, отправка фото/видео, выбор стикера) → `typing:false` → индикатор не показывался.

**Что сделано (весь конвейер).**
- Бэкенд: тип действия TDLib нормализуется в короткий ключ — новый [chatActionKeys.js](../main/native/backends/chatActionKeys.js) `normalizeChatAction` (вынесен из tdlibClient — файл был на лимите 650). `chatActionCancel` → null (гасит); неизвестный активный тип → 'typing' (безопасный откат). Эмит `chat:typing` шлёт `action` вместо `typing:boolean`.
- Мост [tdlibIpcBridge.js](../main/native/tdlibIpcBridge.js) и обработчик [nativeStoreSendIpc.js](../src/native/store/nativeStoreSendIpc.js) проводят `action`; в `store.typing[chatId][userId]` теперь `{senderName, at, action}`.
- Текст: [formatTypingUsers.js](../src/native/utils/formatTypingUsers.js) для ОДНОГО собеседника показывает глагол по действию: «записывает голосовое…», «отправляет фото…», «записывает видеосообщение…», «отправляет видео/файл…», «выбирает стикер/геопозицию/контакт…», «играет…». Несколько собеседников → «печатают…» (как раньше). Шапка чата (InboxChatPanel) не менялась — берёт готовый текст.

**Плюс (советы из фильтра, приняты):** (1) самолечение фильтра аккаунтов (v1.2.169) теперь пишет в журнал при реальном сбросе (`[acct-filter] самопроверка …`, [nativeStore.js](../src/native/store/nativeStore.js)) — «немой» автосброс стал объяснимым; (2) урок «сверять сохранённое при ЗАГРУЗКЕ, не только при мутации» дописан в [[electron-core]].

**Крайние случаи / проверка.** Неизвестный тип → «печатает» (без падений). Отмена (`chatActionCancel`) → индикатор гаснет. Нет поля `action` (старые данные) → «печатает» (обратная совместимость). Бот/канал (messageSenderChat) — не эмитим (как было). Тесты: [tdlibEmitContracts.vitest.js](../src/__tests__/tdlibEmitContracts.vitest.js) (+voice/photo/cancel→null/unknown→typing) + [formatTypingUsers.vitest.js](../src/native/utils/formatTypingUsers.vitest.js) (+глаголы действий, откат). Проверки: контракт+формат+InboxMode 52/52; `mainRuntime` 99/99; `node --check` OK; ESLint 0; лимиты 541/541 (tdlibClient 650/650 — впритык). **Требует пересборки + визуальной проверки** (собеседник записывает голосовое → «записывает голосовое…»). Откат: `git checkout -- main/native/backends/tdlibClient.js main/native/tdlibIpcBridge.js src/native/store/nativeStoreSendIpc.js src/native/utils/formatTypingUsers.js src/__tests__/tdlibEmitContracts.vitest.js src/native/utils/formatTypingUsers.vitest.js src/native/store/nativeStore.js .memory-bank/mistakes/electron-core.md` + удалить `main/native/backends/chatActionKeys.js` + версия на 1.2.169.


