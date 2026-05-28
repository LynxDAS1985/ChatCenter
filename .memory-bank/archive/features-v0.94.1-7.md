# Архив: changelog v0.94.1 – v0.94.7

Вынесено 28 мая 2026 при v0.95.5 для уменьшения размера активного features.md под лимит 100 КБ. Все версии стабилизированы в v0.95.x: каскад markRead закрыт в v0.95.0 (источниковый фикс — список ВСЕГДА непрерывен), мигание ↓ закрыто в v0.95.2 (Schmitt trigger), пилюля N/M удалена в v0.95.2.

---

### v0.94.7 — ФИКС «дыры» счётчика непрочитанных (каскадная пометка через провал)

Баг: чат с N непрочитанными, пользователь пролистал ~100 → счётчик обнулился (1625→1, 8624→88). Не глюк — реальная пометка прочитанным невиденного бэклога.

#### Корень (доказан логом v0.94.6-диагностики)

`store-unread-sync 1625→1→0` в момент `read-cursor-jump approxMsgsJumped=1824 seenCount=1`. Цепочка: `load-newer` ([useInboxScroll.js](src/native/hooks/useInboxScroll.js)) подгрузил далёкий свежий блок (id ~17.1млрд) мимо непрочитанного бэклога (read-курсор ~15.23млрд) → между ними **разрыв 1624 непрочитанных, не загруженных**. Одно свежее сообщение попало в видимость → `useReadByVisibility` → `markRead(17.1млрд)` → backend `viewMessages(..., force_read:true)` ([tdlibBackend.js:340](main/native/backends/tdlibBackend.js)). По договору TDLib API `viewMessages` помечает прочитанным **ВСЁ ≤ maxId** (range-ack, [native-scroll-unread.md:571](.memory-bank/mistakes/native-scroll-unread.md), [TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1view_messages.html)) → 1624 невиденных обнулились.

Наша же дока [native-scroll-unread.md:610](.memory-bank/mistakes/native-scroll-unread.md) это предсказала: «любой UI-hook, вызывающий markRead, обязан иметь mass-ack guard, иначе бейдж исчезает без чтения». Guard был в `useForceReadAtBottom` (unread>30→skip), но **отсутствовал в `useReadByVisibility`**.

#### Решение (достроен mass-ack guard — точечно, без store/загрузки/скролла)

В [useReadByVisibility.js](src/native/hooks/useReadByVisibility.js) перед `markRead` считается `approxMsgsJumped = (maxId − prevMax) / 2^20` (TDLib `message_id = server_id << 20` → шаг ≈ 2^20 на сообщение). Если прыжок **`> 200` сообщений И `> count × 5`** (явный «провал»: за один 300мс-батч столько не прочитать + сильно больше реально увиденного) → `markRead` **пропускается**, лог `read-cursor-jump-blocked`, курсор откатывается на непрерывный фронтир (`lastReadMaxRef = prevMax`). Обычное и даже быстрое последовательное чтение (прыжок ≈ увиденному) НЕ блокируется. **Self-heal**: когда разрыв реально дозагружается/пролистывается — фронтир идёт дальше и помечает корректно.

#### Почему так (аудит)

- **Невозможно иначе**: TDLib помечает прочитанным диапазон ≤ maxId, «пометить только свежий блок мимо бэклога» технически нельзя ([TDLib #136](https://github.com/tdlib/td/issues/136)). Поэтому единственно безопасно — **не двигать курсор через провал**.
- **Как у других**: Telegram открывает чат на первом непрочитанном и читается вниз подряд (разрыва нет). У нас разрыв создаёт load-newer-префетч; чинить источник (загрузку) — риск для скролл-фикса v0.94.2, поэтому гейт в пометке безопаснее.
- **Безопасность**: фикс только СУЖАЕТ пометку (не создаёт новых каскадов). Худший случай — сообщение за провалом останется непрочитанным (честно: его не прошли), само-лечится.

**Тесты** [useReadByVisibility.vitest.jsx](src/native/hooks/useReadByVisibility.vitest.jsx): markRead НЕ вызывается при прыжке через провол (`read-cursor-jump-blocked`); markRead вызывается как обычно при последовательном чтении. TODO-markread-gap закрыт в [code-todo.md](.memory-bank/code-todo.md).

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅. Store/загрузка/скролл (v0.94.2) не затронуты.

---

### v0.94.6 — Диагностика «прыжок курсора» перед фиксом «дыры» счётчика (без смены поведения)

Перед точным фиксом TODO-markread-gap (счётчик 8624→88) добавлена диагностика, чтобы поймать момент «провала» на реальной сессии. **Поведение НЕ изменено** — только логи.

В [useReadByVisibility.js](src/native/hooks/useReadByVisibility.js) при `read-batch-send` считается `approxMsgsJumped = (maxId − prevMax) / 2^20` (TDLib `message_id = server_id << 20`, шаг ≈ 2^20 на сообщение). Если курсор перепрыгнул заметно дальше, чем реально увидели (`approxMsgsJumped > count + 20`) — пишется событие **`read-cursor-jump`** (`prevMax`, `newMax`, `approxMsgsJumped`, `seenCount`, `currentUnread`). На реальной сессии это покажет: курсор прыгнул на ~20000 сообщений, а увидели 1 → провал подтверждён.

`markRead`-вызов не тронут. Тесты [useReadByVisibility.vitest.jsx](src/native/hooks/useReadByVisibility.vitest.jsx) +2: `read-cursor-jump` логируется при прыжке через провал; НЕ логируется при последовательном чтении (шаг 2^20).

**Следующий шаг**: по данным `read-cursor-jump` — точное решение (см. TODO-markread-gap в [code-todo.md](.memory-bank/code-todo.md), рекомендация force_read=false при неполном окне).

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.

---

### v0.94.5 — Тест на пилюлю непрочитанных + аудит «дыры» счётчика (markRead)

#### Тест на облачко (#3)

Пилюля прогресса непрочитанных была инлайном в [InboxChatPanel.jsx](src/native/components/InboxChatPanel.jsx) — нетестируема в изоляции. Вынесена в presentational-компонент `UnreadProgressPill.jsx` (props: `show`, `loaded`, `total`, `onClick`) — как `MessageSkeleton`. Регресс-тест `UnreadProgressPill.vitest.jsx`: видимость при show=true, класс `--hidden` при show=false (авто-гашение), клик→onClick, total=0 → только точка. **Удалён в v0.95.2** (дублировал бейдж кнопки ↓).

#### Аудит «дыры» счётчика непрочитанных (8624 → 88)

**Симптом** (лог 27 мая, топик Xiaomi Home `...:topic:281172`): пролистал ~100 → счётчик упал 8624→88. Не глюк — реальная пометка прочитанным.

**Корень**: `useReadByVisibility` ([useReadByVisibility.js](src/native/hooks/useReadByVisibility.js)) шлёт `markRead(chatId, lastReadMax, {source:'visibility'})` с самым высоким видимым id, без проверки на «провал». Backend `viewMessages(..., force_read:true)` ([tdlibBackend.js:340-346](main/native/backends/tdlibBackend.js)) двигает `readInboxMaxId` → TDLib помечает прочитанным ВСЁ ≤ maxId. При разрыве в окне (старые непрочитанные + свежие, между — не загружено) видимое свежее сообщение прыгает курсором через провал → 8000+ старых прочитаны разом. Защита `markReadCurrentView` ([InboxMode.jsx:233-244](src/native/modes/InboxMode.jsx)) пропускает `source==='visibility'` → дыра (`mark-read-skip-unread-window`=0 в логе).

**Решение НЕ внедрено** — зона markRead (история «было 7 стало 1» v0.87.44). Формализовано как **TODO-markread-gap** в [code-todo.md](.memory-bank/code-todo.md) с 3 кандидатами (контигуити-guard / force_read=false при неполном окне / не префетчить свежие). Рекомендация — force_read=false, но с планом + тестом на реальной сессии + сверкой TDLib docs.

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅. Прокрутка (v0.94.2) и индикатор (v0.94.3) не затронуты.

---

### v0.94.4 — Пилюля прогресса непрочитанных у кнопки ↓ (вместо широкого блока)

Юзер: плашка «Загружена часть непрочитанных сообщений 100 из 1005» была **широким блоком сверху**, двигала ленту. Нужно: облачко (не блок), в другом месте, кликабельное, авто-исчезающее; и чтобы прогресс шёл дальше.

#### Что сделано (#1 место + #2 авто-скрытие + #4 клик)

- **#1** Блок `native-unread-window-status` (между закреплённым и лентой) убран → **пилюля-облачко `.native-unread-pill`** над кнопкой ↓ (`absolute; right:20px; bottom:70px`). Не двигает ленту (floating поверх).
- **#2** Авто-скрытие при 100% (`loadedIncoming >= total` → `showFreshUnreadWindowInfo=false`) через CSS-класс `.native-unread-pill--hidden` (opacity 0 + pointer-events:none, transition 250мс). Плавно гаснет, **без JS-таймеров** (пилюля всегда в DOM, переключается класс).
- **#4** Клик по пилюле → к первому непрочитанному. Reuse `scrollToBottom` = `handleScrollButtonClick` ([InboxMode.jsx:469-475](src/native/modes/InboxMode.jsx#L469)) — он уже прыгает к `firstUnreadId`.

#### #3 Вариант A (по прокрутке) — без изменений кода

Число `loadedIncoming` уже растёт при прокрутке к непрочитанным ([nativeStore.js:97-103](src/native/store/nativeStore.js#L97)). Это как у Telegram/RocketChat. **Фоновую дозагрузку всех 1005 НЕ делали**: после удаления виртуализации (v0.94.0) это 1005 DOM-узлов → лаги (тот же баг тормозит даже Telegram — [tdesktop #17504](https://github.com/telegramdesktop/tdesktop/issues/17504)). При желании «само бежит» — отдельная задача с потолком ~300-400 (Вариант B).

#### Изменено

[InboxChatPanel.jsx](src/native/components/InboxChatPanel.jsx) — блок → пилюля-кнопка с `onClick={scrollToBottom}` + класс `--hidden` по `showFreshUnreadWindowInfo`. [styles-overlays.css](src/native/styles-overlays.css) — `.native-unread-pill` (+`__dot`, `--hidden`). Логика счётчика `loadedIncoming`/`unreadWindow` **не тронута** (ловушка #30 не повторяется). Старый CSS `.native-unread-window-status` остаётся (не используется, безвреден).

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅. Прокрутка (v0.94.2) и индикатор (v0.94.3) не затронуты.

---

### v0.94.3 — «Спокойная загрузка»: убрано мигание индикатора при открытии чата (советы 1+2+3)

Юзер: при открытии чата сверху мигает синяя полоса + пилюля «Обновляю сообщения...»; skeleton-эффекта не видно.

#### Причина (код)

`MessageListOverlay` ([MessageSkeleton.jsx](src/native/components/MessageSkeleton.jsx)) показывался мгновенно при `(!chatReady) || messagesLoading` ([InboxChatPanel.jsx:161](src/native/components/InboxChatPanel.jsx#L161)) и мигал «вкл-выкл» на быстрых загрузках. Skeleton-плашки (серые бабблы) видны редко — только при ПУСТОМ кэше, т.к. IndexedDB обычно отдаёт сообщения мгновенно (`visibleMessages.length > 0` → skeleton пропускается, показывается overlay-полоса).

#### Решение (советы 1+2+3 — паттерн «отложенный + минимальная длительность» индикатор)

По React docs [«Synchronizing with Effects»](https://react.dev/learn/synchronizing-with-effects) (setTimeout в useEffect + cleanup):
1. **Задержка 250мс** перед показом, НО только при `hasContent` (виден кэш). Быстрая загрузка <250мс полосу не покажет → нет мигания. При `!hasContent` (контент скрыт, первый вход) — показ СРАЗУ (иначе чёрный экран, регрессия v0.89.37).
2. **Минимум 400мс** на экране + **плавное гашение** (CSS `.native-msg-overlay--leaving`, opacity 200мс) — конец мигания «вкл-выкл за 50мс».
3. **Убрана текст-пилюля «Обновляю...»** — осталась только тонкая полоса (меньше визуального шума).

**Изменено:** [MessageSkeleton.jsx](src/native/components/MessageSkeleton.jsx) (`MessageListOverlay` → state-machine с задержкой/мин.длительностью), [InboxChatPanel.jsx](src/native/components/InboxChatPanel.jsx) (проп `hasContent`), [styles-messages.css](src/native/styles-messages.css) (transition + `--leaving`). Тесты overlay обновлены (+2).

#### Совет 4 (прятать контент до конца загрузки) — НЕ внедрён

Пересмотр выявил конфликт: задержка полосы (совет 1) + скрытый контент = **чёрный экран** на 250мс. А прятать уже видимый кэш — спорно (теряется мгновенный показ, как в Telegram). Плюс reveal-флаг живёт рядом с `chatReady`, завязанным на прокрутку (фикс скачков v0.94.2) → риск. Это UX-решение, отложено до явного выбора пользователя.

**Регрессия**: lint 0, vitest 663/663, fileSizeLimits, check-memory ✅. Прокрутка (v0.94.2) и точность restore не затронуты.

---

### v0.94.2 — Фикс «прыгает и грузит без конца при прокрутке вверх» (overflow-anchor:none + DOMRect re-pin)

Лог чата «Машинное обучение» (`tg_611696632:-1001164452773`) показал **13 каскадных load-older за 2 секунды**: сообщения 50→100→…→650, и каждый раз `scrollTop` оставался у нуля, хотя высота росла на ~12000px за подгрузку.

#### Корень (моя ошибка в v0.94.0)

В v0.94.0 я понадеялся на `overflow-anchor: auto` (браузер сам держит позицию при prepend) и убрал ручную коррекцию scrollTop. Это ошибка: **браузерное scroll anchoring НЕ работает на верхней границе** (`scrollTop≈0`), а именно там срабатывает load-older (`scrollTop < 100`). 50 старых сообщений добавлялись сверху → экран оставался прижат к верху → читаемое улетало вниз + тут же триггерился следующий load-older → каскад.

Подтверждено [MDN overflow-anchor](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor) + практикой: Telegram Web K, Discord, Slack при reverse-infinite-scroll **отключают** overflow-anchor и держат позицию кодом.

#### Решение (паттерн tweb ScrollSaver — DOMRect re-pin, надёжнее дельты высоты)

1. **[VirtualMessageList.jsx](src/native/components/VirtualMessageList.jsx)** — `overflow-anchor: auto` → **`none`** (браузер не мешает ручному управлению).
2. **[useInboxScroll.js](src/native/hooks/useInboxScroll.js)** — перед load-older запоминает ВЕРХНЕЕ видимое сообщение (`[data-msg-id]`) и его экранную позицию (`getBoundingClientRect().top - scrollerTop`) в `prependAnchorRef`.
3. **[InboxMode.jsx](src/native/modes/InboxMode.jsx)** — `useLayoutEffect` (после коммита DOM, ДО paint → без мигания) keyed на `activeMessages`: находит то же сообщение по `data-msg-id`, считает новую экранную позицию, `el.scrollTop += (newScreenTop - savedScreenTop)` → сообщение возвращается на тот же пиксель.

**Почему re-pin по элементу, а не дельта высоты**: устойчиво к любым одновременным изменениям layout и к догрузке медиа (привязка к конкретному элементу, а не к числу). Фото/видео и так резервируют высоту (`aspectRatio` из метаданных TDLib + `minHeight`, картинка `position:absolute`) → поздних reflow нет.

**Каскад прекращается**: после re-pin `scrollTop` далеко от верха → следующий scroll-event не триггерит load-older. Заодно уходит флуд `read-line-initial` (был следствием переобработки 650 сообщений при каскаде).

#### Тест

+1 регрессионный ([VirtualMessageList.vitest.jsx](src/native/components/VirtualMessageList.vitest.jsx)): scroll-контейнер обязан иметь `overflow-anchor: none` (защита от возврата к `auto`).

**Регрессия**: lint 0, vitest 661/661, fileSizeLimits, check-memory ✅. Точность restore при смене чатов (v0.94.0) не затронута.

**✅ Подтверждение пользователя (27 мая 2026)**: после v0.94.0–v0.94.2 скачки прокрутки прекратились — и при прокрутке вверх (load-older), и при возврате в чат. Сага scroll restore (v0.91.1 → v0.94.2) считается закрытой. Осталось 2 косметических вопроса (НЕ скачки): мерцание при первичном формировании списка (staged setState + overlay) и отсутствие skeleton при наличии кэша (показывается overlay-полоса вместо skeleton) — разбор и варианты улучшения предложены, код пока не трогали.

---

### v0.94.1 — Фикс утечки слушателей TDLib `file:update` (единый диспетчер + таймаут)

После v0.94.0 аудит лога показал `MaxListenersExceededWarning: 101 file:update listeners added to TdlibClientManager`. Полный разбор по коду + официальной документации стека + how-others-do-it.

#### Корень (доказан документацией)

Каждый `downloadFile` ([tdlibMedia.js](main/native/backends/tdlibMedia.js)) вешал **свой** `manager.on('file:update')` и снимал его только при `is_downloading_completed` или `download_error`. Две проблемы:

1. **Утечка** (главная): TDLib иногда шлёт **одно** `updateFile` (`is_downloading_active=true`) и больше ничего — ни завершения, ни ошибки. Подтверждено: [TDLib issue #280](https://github.com/tdlib/td/issues/280), [#2585](https://github.com/tdlib/td/issues/2585) (stuck в poor network: связь рвётся каждые 10-30с, новых updateFile нет). Тогда слушатель висел **вечно**.
2. **Всплеск**: нет лимита одновременных загрузок → чат со 100 медиа = 100+ слушателей разом → лимит 100 превышен.

#### Решение (один диспетчер + таймаут)

Рекомендованный TDLib паттерн (**один update-handler + маршрутизация по `file_id`**) + Node best practice (не вешать слушатель внутри часто вызываемой функции, [Node Events docs](https://nodejs.org/api/events.html)):

- **`getFileUpdateRegistry(manager)`** в [tdlibMedia.js](main/native/backends/tdlibMedia.js): ОДИН постоянный `file:update` слушатель на менеджер + реестр `Map<"accountId:fileId", Set<waiter>>` в WeakMap (ключ — manager, изолирует тесты). Слушателей **всегда 1** — `MaxListenersExceededWarning` невозможен физически.
- **Таймаут «нет прогресса» 120с**: перезапускается на каждом `updateFile`. Живое большое видео шлёт прогресс → не отваливается; зависшая загрузка (полная тишина TDLib) → снимается + резолвится ошибкой `download timeout`.
- Исправлен неверный комментарий «Не утечка» в [tdlibClient.js](main/native/backends/tdlibClient.js).
- Аватарки (`_pendingAvatars`) — отдельный путь без `file:update` слушателей, не затронуты.

#### Тесты (+3 в [tdlibMediaDownload.vitest.js](src/__tests__/tdlibMediaDownload.vitest.js))

- waiter снимается после завершения + `listenerCount('file:update') === 1`
- 50 параллельных загрузок = 1 listener (не 50)
- зависшая загрузка → таймаут чистит waiter + резолвит ошибкой (fake timers)

Экспортирован тест-хелпер `_pendingDownloadCount(manager)`.

**Регрессия**: lint 0, vitest, fileSizeLimits (tdlibMedia.js 404/500, тест 251/400), check-memory ✅.

**Скролл (v0.94.0)** — по логам работает точно (30 восстановлений, 0 промахов), не трогали.

---
