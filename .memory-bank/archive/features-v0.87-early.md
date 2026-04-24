# Архив: features v0.87.0 – v0.87.39

**Заархивировано**: 24 апреля 2026 (v0.87.58).
**Источник**: `.memory-bank/features.md` строки 766–1797.
**Период**: запуск нативного режима (v0.87.0) и ранняя серия багфиксов до начала работы над скроллом/счётчиком.

**Правило чтения**: агент НЕ читает этот файл по умолчанию. Только по явной просьбе пользователя. См. [`README.md`](./README.md) секция «Архив».

---

### v0.87.39 (17 апреля 2026) — Тонкий header 24px + полная история решения видео-окна

**Вариант C: тонкий 24px header** с нативными кнопками Windows, видео на всю площадь.
- `titleBarOverlay: { height: 24 }` (было 36)
- toolbar встроен в titlebar (position: fixed, top: 0, height: 24px)
- Видео `height: calc(100vh - 24px)` (было 100% - 36px)
- Кнопки toolbar: padding 1px 6px, font-size 12px (компактнее)
- Title: flex: 1, app-region: drag (перетаскивание за заголовок)
- 📌 pin убрана (не работала), оставлена ◰ PiP

**ПОЛНАЯ ИСТОРИЯ РЕШЁННЫХ ПРОБЛЕМ v0.87.26–39:**

| Проблема | Причина | Решение | Версия |
|---|---|---|---|
| Разделители дат не видны | `rgba(255,255,255,0.04)` на чёрном | Акцентный фон + линии по бокам | v0.87.26 |
| Фото одиночное крохотное | bubble maxWidth 65% схлопывался | minWidth: 280, maxWidth: min(420,65%) | v0.87.26 |
| Счётчик непрочитанных (readByVisibility._timer) | Property на пересоздаваемой функции | useRef для таймера | v0.87.26 |
| Rescan unread только 50 чатов | getDialogs limit:50 без пагинации | fetchAllUnreadUpdates 5×100 | v0.87.26 |
| Named export Helpers not found | CJS пакет telegram, named import | import from 'telegram/Utils.js' | v0.87.25 |
| Reply-клик scroll | Не было | scrollIntoView + жёлтая вспышка | v0.87.27 |
| Аватарка в группе чужих | Не было | .native-msg-avatar 32×32 | v0.87.27 |
| PhotoViewer overlay вместо окна | React overlay на весь экран | BrowserWindow frameless | v0.87.28 |
| lastMessage «—» для медиа | d.message.message пустой | messagePreview() с типами | v0.87.28 |
| Медиа-альбомы по очереди | Нет groupedId группировки | collapseAlbums + MediaAlbum grid | v0.87.29 |
| Скролл при открытии чата | Не скроллил к непрочитанному | useInitialScroll (Вариант A) | v0.87.29 |
| Жёлтая подсветка last-read | Не было | CSS native-last-read-glow 3.5с | v0.87.29 |
| CI snapshots TZ mismatch | getHours = UTC в CI, MSK локально | vitest.setup.js forceUTC | v0.87.32 |
| Video-альбомы не грузились | thumb=false для video = полный файл | thumb=true для video (постер) | v0.87.33 |
| Unread не уменьшался (альбомы) | onVisible только для firstMsg | IntersectionObserver все msgs | v0.87.33 |
| IntersectionObserver threshold 0.5 | Короткие bubble не пересекали | threshold: 0.15 + forceReadAtBottom | v0.87.34 |
| Видео inline не было | Отдельное окно (не в чате) | VideoTile inline `<video>` + ⛶ | v0.87.36 |
| Skeleton при загрузке не было | «Нет сообщений» вместо загрузки | MessageSkeleton + shimmer | v0.87.36 |
| Стрелка ↓ уезжала при скролле | position:absolute в scroll-div | wrapper relative, кнопка снаружи | v0.87.36 |
| Скролл к старым = unread растёт | markAsRead УСТАНАВЛИВАЕТ watermark | maxEverSentRef guard (никогда не уменьшаем) | v0.87.37 |
| Unread в списке устаревший | tg:chats заменял массив | merge Math.max(ts) + syncPerChat | v0.87.38 |
| Видео-окно пустой плеер | readFileSync блокировал / cc-media не работал | net.fetch + bypassCSP | v0.87.38 |
| Кнопки видео-окна не работали | const video конфликт с window.video от preload | const videoEl | v0.87.38 |
| Время в логах UTC | toISOString / getHours | toLocaleString('sv-SE') | v0.87.38 |
| React duplicate keys | tg:new-message без дедупликации | existing.some(m.id) | v0.87.38 |
| Толстая чёрная рамка видео | titleBarOverlay height:36 + margin | height:24 + toolbar в titlebar | v0.87.39 |

### v0.87.38 (17 апреля 2026) — FIX видео в отдельном окне + убрана 📌 из inline + FIX сортировка чатов

**Пользовательский feedback v0.87.36/37**:
- ✅ Видео в чате воспроизводится inline — РАБОТАЕТ
- ❌ Отдельное окно не показывает видео (пустой плеер)
- ❌ Зачем 📌 рядом с ⛶ в чате — булавка есть в отдельном окне, в чате не нужна
- ❌ Чаты с новыми сообщениями не поднимаются вверх списка

**Fix 1: Видео в отдельном окне не работало** ([ccMediaProtocol.js](main/native/ccMediaProtocol.js)):
Для запроса без Range-заголовка использовался `fs.readFileSync(filePath)` → для видео 50+ МБ это блокировало main thread на несколько секунд → `<video>` в BrowserWindow считал что ответ не пришёл → показывал пустой плеер с 0:00. **Фикс**: заменил `readFileSync` на `fs.createReadStream` → `ReadableStream`. Теперь первые байты отдаются мгновенно, видео начинает играть сразу.

**Fix 2: Убрана 📌 из inline-видео** ([VideoTile.jsx](src/native/components/VideoTile.jsx)):
Оставлена только кнопка ⛶ (открыть в отдельном окне). 📌 (pin/PiP) доступна только внутри отдельного окна — дублирование убрано.

**Fix 3: Чаты с новыми сообщениями не поднимались наверх** ([nativeStore.js](src/native/store/nativeStore.js)):
В `tg:chats` handler при получении новых данных от сервера — полностью ЗАМЕНЯЛ массив чатов. Серверный `lastMessageTs` мог быть СТАРЕЕ чем наш локально обновлённый (из `tg:new-message`). Результат: чат с новым сообщением падал вниз списка. **Фикс**: merge вместо replace — `Math.max(c.lastMessageTs, old.lastMessageTs)` для каждого чата, сохраняем БОЛЕЕ НОВЫЙ timestamp.

**Проверить**:
- [ ] Нажми ⛶ на играющем видео → отдельное окно показывает видео и играет (не пустой плеер)
- [ ] В inline-видео в чате — только одна кнопка ⛶ (📌 нет)
- [ ] Получи новое сообщение в каком-нибудь чате → этот чат поднимается наверх списка
- [ ] Подожди 15 сек (periodic rescan) → чат с новым сообщением остаётся наверху (не падает)

### v0.87.37 (17 апреля 2026) — CRITICAL FIX: скролл к старым сообщениям сбрасывал watermark → unread=50

**Пользовательский feedback v0.87.36**: «Прочитал все сообщения, было 0. После отмотки на старые — счётчик стал 50. Так в любом чате.»

**Корневая причина (Ловушка 93)**:
В MTProto `client.markAsRead(entity, maxId)` — УСТАНАВЛИВАЕТ (не увеличивает) read-watermark на maxId.
При скролле вверх IntersectionObserver видел старые сообщения (id=100) → `readByVisibility` вызывался → через 1.5с `markRead(chatId, maxId=100, count)` → main: `client.markAsRead(entity, 100)` → сервер **СБРАСЫВАЛ** watermark с 150 до 100 → сообщения #101–#150 снова «непрочитанные» → `GetPeerDialogs` → `unreadCount=50` → бейдж растёт вместо уменьшения.

**Фикс (ДВА уровня защиты)**:

1. **Main-процесс** ([telegramHandler.js](main/native/telegramHandler.js)):
   - `markReadMaxSent: Map<chatId, maxId>` — хранит максимальный id отправленный на сервер
   - Перед `markAsRead`: проверяем `numMaxId < prev` → SKIP (логируем, не отправляем)
   - Только если `numMaxId > prev` → отправляем + обновляем Map

2. **Renderer** ([InboxMode.jsx](src/native/modes/InboxMode.jsx)):
   - `maxEverSentRef = useRef(0)` — максимальный id отправленный в текущей сессии чата
   - В `readByVisibility` timer: `if (lastReadMax <= maxEverSent) return` → не дёргаем IPC
   - В `useForceReadAtBottom`: `if (lastId <= maxEverSent) return`
   - При смене чата `maxEverSentRef.current = 0` (другой чат — другой watermark)

**Результат**: watermark НИКОГДА не уменьшается. При скролле к старым — ничего не отправляется. При скролле к новым — продвигается.

**Что проверить**:
- [ ] Открой чат → пролистай до конца → unread=0
- [ ] Прокрути ВВЕРХ к самым старым сообщениям → **unread ОСТАЁТСЯ 0** (не растёт!)
- [ ] Прокрути снова вниз → тоже 0
- [ ] Переключись на другой чат с непрочитанными → unread уменьшается нормально
- [ ] Закрой-открой приложение → watermark сохранён корректно

### v0.87.36 (16 апреля 2026) — Inline видео + ⛶/📌 + Кэш сообщений + Shimmer + Fix стрелки ↓

**Выбор пользователя**:
- ✅ **Видео — Вариант 1** (inline в чате + кнопка ⛶ для окна + 📌 для PiP)
- ✅ **Загрузка — Вариант 5** (кэшированные сообщения + shimmer поверх)
- ✅ Fix стрелки ↓ (вынести из scroll-контейнера)

**1. Inline видео-плеер в bubble**:
Переделал [VideoTile.jsx](src/native/components/VideoTile.jsx):
- До клика: постер (thumb) + ▶ + duration/size в углу (как было)
- Клик ▶: скачивает видео с прогресс-баром
- После скачивания: **заменяет постер на `<video controls autoplay playsInline>`** в той же bubble
- **В углу overlay-кнопок**: `⛶` (раскрыть в отдельное окно) + `📌` (PiP — мини поверх всех окон)
- При клике ⛶/📌: inline-видео ставится на паузу, открывается отдельное окно с **той же секунды** через `currentTime`
- **IntersectionObserver**: если bubble уехал из viewport → авто-пауза (не играет невидимое)
- cc-media:// уже поддерживает Range → стриминг и перемотка работают

**Исправление videoPlayerHandler.js**:
- `let prevBounds = null` перенесён в начало функции (раньше был после `video:open` → ReferenceError при PiP-старте)
- `video:open` принимает `startTime` + `pip` → передаётся в окно через `photo:set-srcs` event
- Если `pip: true` при открытии → окно сразу становится мини (480×270, alwaysOnTop)

**video-player.html** — применяет `startTime` в `onSetSrc` (через `loadedmetadata` event если не готово), синхронизирует состояние `pipBtn` если открылось в PiP.

**2. Кэш сообщений + shimmer-загрузка**:
- `localStorage` ключ `chat-messages:{chatId}` — хранит последние 50 сообщений
- При `loadMessages(chatId)` в [nativeStore.js](src/native/store/nativeStore.js):
  - Если для чата нет в `s.messages` → подставляем из кэша **мгновенно**
  - Поднимаем флаг `loadingMessages[chatId] = true`
- Когда `tg:messages` event пришёл → кэш обновляется свежими данными + флаг снимается
- Новый компонент [MessageSkeleton.jsx](src/native/components/MessageSkeleton.jsx):
  - `<MessageSkeleton count={5}>` — 5 серых плейсхолдеров с shimmer-анимацией (для пустого чата в момент первой загрузки)
  - `<MessageListOverlay show>` — синяя полоска сверху + тост «⏳ Обновляю сообщения» (когда кэш уже показан, грузим свежее)
- CSS: `@keyframes native-shimmer` — translateX slide-анимация 1.6с

**3. Fix стрелки ↓**:
Раньше кнопка `.native-scroll-bottom-btn` была **внутри** `msgsScrollRef` div (с `overflow-y: auto`). `position: absolute` в scroll-контейнере позиционируется относительно **начала** контента, не окна → при скролле уезжала вместе с сообщениями.

**Фикс**: обернул scroll-div в **relative wrapper** `<div style={{position:'relative', display:'flex', flexDirection:'column', minHeight:0}}>`. Scroll-div стал без position:relative, кнопка ↓ вынесена в wrapper → позиционируется относительно wrapper (не scroll) → **остаётся на месте при скролле**.

**4. Рефакторинг** (InboxMode 605 → 588):
- Новый хук [useMessageActions.js](src/native/hooks/useMessageActions.js) — handleDelete/handleForward/handleForwardSelect/handlePin

**5. Тесты**: **76 vitest** (было 68)
- [MessageSkeleton.vitest.jsx](src/native/components/MessageSkeleton.vitest.jsx) — 6 тестов (render count / shimmer / overlay / чередование сторон)
- [VideoTile.vitest.jsx](src/native/components/VideoTile.vitest.jsx) — 3 новых:
  - `клик → inline play (без video:open)`
  - `v0.87.36: кнопка ⛶ → video:open с startTime`
  - `v0.87.36: кнопка 📌 → video:open с pip=true`

**Что проверить**:
- [ ] Клик по видео в чате → постер сменяется на играющее `<video>` **в той же bubble** (не в отдельном окне)
- [ ] В углу играющего видео две кнопки: ⛶ и 📌
- [ ] ⛶ → отдельное окно плеера, видео продолжает **с той же секунды**
- [ ] 📌 → мини-окно 480×270 в углу, alwaysOnTop, resizable
- [ ] Прокрути видео вниз (за viewport) → автоматически ставит на паузу
- [ ] Открой чат с которым раньше общался → сразу видишь старые сообщения (из кэша), сверху синяя полоска «Обновляю»
- [ ] Открой чат первый раз → видишь **shimmer-скелетон** 5 плейсхолдеров (не «Нет сообщений»)
- [ ] Через 1-3 сек скелетон исчезает, появляются реальные сообщения
- [ ] Стрелка ↓ в правом-нижнем углу чата **видна** при скролле, не уезжает с контентом
- [ ] Клик ↓ скроллит к первому непрочитанному (как раньше)

### v0.87.35 (16 апреля 2026) — Unread в списке точный + стрелка к непрочитанному + PiP + LRU квота + subs/audio tracks

**СТАТУС ОТ ПОЛЬЗОВАТЕЛЯ** (16 апреля 2026):
- ✅ **Unread-счётчик в списке чатов — РАБОТАЕТ** (v0.87.35)
- ✅ **Прочитанные сообщения — РАБОТАЮТ** (v0.87.37: скролл к старым НЕ сбрасывает watermark, подтверждено пользователем 17 апреля 2026)
- ✅ **Стрелка «↓» — РАБОТАЕТ** (v0.87.36, подтверждено 17 апреля 2026)
- ✅ **Inline видео в чате — РАБОТАЕТ** (v0.87.36, подтверждено — видео воспроизводится)
- ✅ **Skeleton при первом открытии чата — РАБОТАЕТ** (v0.87.36, подтверждено 17 апреля 2026)
- ❌→🔧 **Видео в отдельном окне — НЕ РАБОТАЛО** (v0.87.36-38: пустой плеер 0:00, без ошибок).
  - **Попытка 1** (v0.87.38): readFileSync → ReadableStream. Не помогло.
  - **Попытка 2** (v0.87.38): ready-to-show → did-finish-load + 200мс. Не помогло.
  - **Попытка 3** (v0.87.38): cc-media:// → file:// для BrowserWindow. Не помогло.
  - **Корень проблемы**: preload НЕ загружался → `window.video` = undefined → IPC `video:set-src` терялся → `video.src` оставался ПУСТЫМ → `<video>` без src не генерирует ошибок (readyState=0, error=null — тишина).
  - **Почему watchdog не сработал**: проверял `readyState < 2` но НЕ проверял `!video.src`. Пустой src = не ошибка по мнению браузера.
  - **Попытка 4** (v0.87.38): loadFile({query: {src}}) + URLSearchParams fallback. НЕ ПОМОГЛО — src всё равно не доходит.
  - **Попытка 5** (v0.87.38): `executeJavaScript` прямой inject `v.src = '...'` после did-finish-load. Обходит preload, query, IPC — прямо в DOM. Ожидает подтверждения.
  - **Попытка 6** (v0.87.38): `net.fetch(pathToFileURL)` + `bypassCSP:true` в protocol handler (из Electron docs + issue #38749). **ВИДЕО ЗАИГРАЛО!** Но кнопки (close/pin/pip/min/max) не работают — preload не загружается → `window.video` = undefined.
  - **Фикс кнопок** (v0.87.38): fallback `window.close()` для закрытия + Esc.
  - **ВАЖНО**: Пользователь тестировал на СТАРОЙ СБОРКЕ (логи от 09:33, последний билд 14:31). Все фиксы v0.87.38 (net.fetch, bypassCSP, дедупликация, fallback кнопок) НЕ были применены. Нужен полный перезапуск `npm run dev`.
  - **Попытка 7** (v0.87.38): кнопки pin/pip не работали (preload не загружается). Фикс: console.log('__CC_VIDEO__pin:1') из HTML → main ловит через webContents.on('console-message') → setAlwaysOnTop/setBounds. Ожидает подтверждения.
  - **Также**: R:ERROR в логах показывал UTC время (toISOString) вместо локального (toLocaleString).
  - **КОРЕНЬ ПРОБЛЕМЫ НАЙДЕН** (попытка 8): preload через `contextBridge.exposeInMainWorld('video', {...})` создавал `window.video`. А в `<script>` HTML было `const video = document.getElementById('v')` — КОНФЛИКТ имён! `SyntaxError: Identifier 'video' has already been declared` → весь JS крашился → ни кнопки, ни src, ни watchdog не работали. **Фикс**: переименовал `const video` → `const videoEl` по всему HTML. Preload РАБОТАЛ всё это время!
  - **Попытка 9** (v0.87.38): кнопки вернули на preload IPC. ◰ PiP РАБОТАЕТ ✅. 📌 pin НЕ работает — убрана из UI.
  - **Итого v0.87.38**: видео ✅, нативные close/min/max ✅, ◰ PiP ✅, 📌 убрана.
  - **v0.87.39**: видео-альбом = постеры (как Telegram), тонкий header 24px, окно подстраивается под размер.
  - **Проблемы из логов (v0.87.39)**: (1) rescan спамил — фикс: логируем при изменении; (2) FLOOD_WAIT аватарки; (3) deprecated API; (4) кодировка терминала.
  - ✅ **Компоновка видео-альбома — ЗАКРЫТО** (v0.87.39): постеры как в Telegram + сетка, не обрезается.
  - **v0.87.39 доп**: постеры видео thumb=false (чёткие, не blur), окно по умолчанию 60% от оригинала.

### ИТОГОВЫЙ СТАТУС v0.87.25–54 (обновлено 24 апреля 2026)

**✅ ПОДТВЕРЖДЕНО пользователем:**
- Reply-клик scroll + вспышка (v0.87.27)
- PhotoViewer отдельное окно (v0.87.28)
- Аватарка в группе чужих (v0.87.27)
- Unread-счётчик в списке (v0.87.35)
- Прочитанные сообщения / watermark (v0.87.37)
- Inline видео в чате (v0.87.36)
- Стрелка ↓ не уезжает (v0.87.36)
- Skeleton при загрузке (v0.87.36)
- Компоновка видео-альбома как Telegram (v0.87.39)
- **Divider «Новые сообщения»** — подтверждено 24.04.2026
- **Вариант A скролла к непрочитанному** — подтверждено 24.04.2026
- **Синий неон last-read** (3.5с) — подтверждено 24.04.2026 (цвет сменён на accent #2AABEE)
- **Индикатор новых сообщений при скролле назад** — подтверждено 24.04.2026
- **Прогрессия счётчика 23→20→15→...→0 по ходу прокрутки** (v0.87.51) — подтверждено 24.04.2026
- **Альбом из N фото даёт +N в бейдже** (Telegram API) (v0.87.51) — подтверждено 24.04.2026
- **Бейдж в списке и на стрелке одинаковые** (v0.87.51) — подтверждено 24.04.2026
- **markRead каждые 0.3сек в реальном времени** (v0.87.51) — подтверждено 24.04.2026

**⏳ ОЖИДАЕТ ПРОВЕРКИ:**
- Link preview карточки (title/description/siteName)
- Ctrl+↑ редактирование последнего своего
- lastMessage preview в списке (🖼 Фото / 📹 Видео вместо «—»)
- Медиа-альбомы фото сеткой 2×2 / 3×3 (визуальная проверка)
- Shimmer overlay при повторном открытии (первое открытие ✅)
- Avatar cache bust при logout
- Auto-cleanup tg-media/ старше 30 дней
- LRU квота 2 ГБ
- Субтитры/audio tracks в видео-плеере
- React duplicate keys fix (v0.87.38)
- Время в логах в формате часового пояса
- Сортировка чатов (новые наверху)
- PiP ◰ в видео-окне
- Чёткие постеры видео (thumb=false)
- Окно видео 60% размера
- Runtime smoke-тест main-процесса
- Проверка `telegram/*` подпутей в тесте
- IPC `photo:toggle-pin` (pin окна фото)

**❌ НЕ РАБОТАЕТ / УБРАНО:**
- 📌 pin в видео-окне — убрана (не работала через preload)

**🔧 НЕРЕШЁННЫЕ ПРОБЛЕМЫ:**
- FLOOD_WAIT от аватарок (users.GetFullUser 26с бан) — нужен throttle
- console-message deprecated API в Electron 41

- ❌ **React warning «two children with the same key»** — `tg:new-message` дублировал msg уже имеющийся в массиве. Фикс v0.87.38: дедупликация по id. Ожидает подтверждения.


**Пользовательский feedback**:
- ❌ «Когда чат НЕ открыт — цифра одна (14), когда открываю — меняется» — счётчик списка устаревший до открытия
- «Сделать стрелочку вниз в чате, переходит к последнему непрочитанному (а не к самому низу), как в Telegram»
- ✅ Одобрен PiP (с возможностью менять размеры)
- ✅ Одобрен кэш LRU+квота
- ✅ Одобрен subtitles/audio tracks

**1. FIX unread в списке чатов — actively sync**:
Ранее:
- getChats при старте → кэш в списке
- Периодический rescan раз в 30 сек
- tg:new-message → локально увеличивал на 1
- Но если приходит 3 сообщения быстро, потом Telegram их группирует → наш счётчик расходится с сервером

**Фикс**:
- Периодический rescan: 30 → **15 секунд** + immediate rescan при старте (через 1.5с)
- В `attachMessageListener` для КАЖДОГО `tg:new-message` — отложенный (600мс) вызов `syncPerChatUnread(chatId)` → `GetPeerDialogs` для одного чата → `tg:chat-unread-sync` с реальным значением
- `syncPerChatUnread` имеет debounce 3 сек на чат (не дёргать сервер)
- Итого: любое новое сообщение → счётчик ТОЧНЫЙ с сервера через ~0.6 сек

**2. Стрелка вниз → к последнему непрочитанному** (как в Telegram):
- `scrollToBottom` в InboxMode.jsx теперь: если `firstUnreadIdRef.current` есть → `scrollIntoView({block: 'center'})` на `[data-msg-id="<firstUnread>"]` + жёлтая вспышка 2.5с
- Если всё прочитано → в самый низ
- Кнопка `↓` показывается когда **!atBottom ИЛИ unreadCount > 0** (раньше только при !atBottom)
- Бейдж показывает `activeUnread` если > 0, иначе `newBelow`
- Title меняется: «К первому непрочитанному (N)» или «К последнему сообщению»

**3. PiP (мини-плеер поверх всех окон)** с возможностью ресайза:
- Новый IPC `video:toggle-pip {on}` в [videoPlayerHandler.js](main/handlers/videoPlayerHandler.js)
- При `on=true`: сохраняем `prevBounds`, ставим 480×270 в нижнем-правом углу, `alwaysOnTop: 'floating'`
- При `on=false`: восстанавливаем prevBounds + снимаем alwaysOnTop
- Окно **resizable** — пользователь может увеличить/уменьшить мини-плеер
- Кнопка ◰ в toolbar video-player.html
- Преимущество над Chromium `<video>.requestPictureInPicture()`: в нашем PiP можно менять размер, работать в Electron headless режимах, есть наши контролы

**4. Субтитры / аудио-дорожки** выбор:
- Кнопки 🎧 (audio) и CC (subtitles) в toolbar `video-player.html` (**показываются только если есть множественные дорожки/sub**)
- При `loadedmetadata` event: проверяем `video.audioTracks.length > 1` и `video.textTracks.length > 0`, показываем кнопки
- Клик → открывается контекстное меню с выбором: для audio — включить один (отключить остальные), для subtitles — выбор + «Отключить»
- В большинстве Telegram-видео (однодорожковый mp4) кнопки будут скрыты

**5. LRU + квота для tg-media**:
- `tg:cleanup-media` теперь принимает `{maxDays=30, maxBytes=2ГБ}`
- Сначала удаляет файлы старше maxDays (по mtime)
- Потом если общий размер > maxBytes — удаляет **самые старые** (LRU по mtime) до квоты
- Новый IPC `tg:media-cache-size` возвращает `{size, count}` (для UI настроек в будущем)
- Авто-запуск этой же логики при каждом старте приложения

**6. Тесты**:
- Новый [src/__tests__/mediaCacheQuota.test.cjs](src/__tests__/mediaCacheQuota.test.cjs) — **5 unit-тестов** для cleanup-логики (по возрасту, LRU, комбинация, пустая директория) с реальными файлами во временной папке
- Новый vitest `RF 0.87.35: кнопка ↓ показывается если unreadCount > 0 даже при atBottom`
- Итого: **68 vitest + 5 новых unit** (было 67)

**Что проверить пользователю**:
- [ ] Счётчик в списке чатов (неактивные) обновляется в течение 5-15 сек от прихода нового сообщения (не 30-60 сек)
- [ ] Клик на чат с неверным счётчиком — реальный виден сразу
- [ ] Открой чат с непрочитанными → кнопка ↓ видна справа-внизу с числом
- [ ] Клик ↓ → скроллит к ПЕРВОМУ непрочитанному + жёлтая вспышка (а не в самый низ)
- [ ] Если всё прочитано → ↓ скрывается ИЛИ просто скроллит в низ (когда !atBottom)
- [ ] В видео-плеере кнопка ◰ делает мини-окно 480×270 в углу + alwaysOnTop, можно потянуть за угол и изменить размер
- [ ] Кнопка 📌 pin — НЕ мини-режим, просто окно поверх всех
- [ ] Кнопки 🎧/CC скрыты для обычного mp4 без доп. дорожек
- [ ] tg-media/ папка не растёт выше 2 ГБ (при долгом использовании)

### v0.87.34 (16 апреля 2026) — Variant A Video Streaming + Fix unread (force markRead + threshold)

**Пользовательский feedback по v0.87.33**:
- ❌ «Пролистал в самый низ, счётчик как был 2 так и остался» (канал MIMS Automobility)
- ✅ Одобрен «Variant A: poster + streaming» — делать сразу с тестами

**1. FIX unread counter — force markRead в самом низу чата**:
Ранее в InboxMode использовался только `IntersectionObserver(threshold: 0.5)`. Проблемы:
  - Короткие bubble (маленький текст) не пересекают 0.5 → не срабатывает
  - Быстрый скролл через 10-20 сообщений за 1 сек → observer не успевает
  - Debounce batch (1.5с) мог пропустить последнюю порцию при переключении чатов

**Фикс**:
  - Снизил `threshold` с 0.5 до 0.15 в MessageBubble.jsx и MediaAlbum.jsx (AlbumBubble)
  - **Новый хук** [useForceReadAtBottom.js](src/native/hooks/useForceReadAtBottom.js) — когда `atBottom === true` И `unreadCount > 0`, через 400мс вызывает `markRead(chatId, lastMsgId, unreadCount)`, сбрасывая всё до нуля
  - Это «страховочный» путь независимо от IntersectionObserver

**2. Variant A Video Streaming — постер + отдельное окно плеера**:

**MTProto metadata** — в mapMessage добавлены `duration` (сек) и `fileSize` (байт):
  - `DocumentAttributeVideo.duration/w/h` извлекается для video
  - `DocumentAttributeAudio.duration` для аудио
  - `media.document.size` для размера файла

**IPC `tg:download-video`** ([telegramHandler.js](main/native/telegramHandler.js)):
  - Скачивает полное видео с `progressCallback` от GramJS
  - Эмитит `tg:media-progress { chatId, messageId, bytes, total }` каждый чанк
  - Возвращает `cc-media://video/<filename>.mp4` по окончании
  - Кэширует файлы — повторный клик открывает мгновенно

**cc-media:// protocol с Range support** ([ccMediaProtocol.js](main/native/ccMediaProtocol.js)):
  - `registerSchemesAsPrivileged` с `stream: true`
  - Обрабатывает HTTP `Range: bytes=N-M` — отдаёт `206 Partial Content` с `Content-Range` и `Accept-Ranges`
  - Правильный MIME для mp4/webm/mov/mp3/ogg/wav по расширению
  - **Это позволяет `<video>` браузера перематывать и стримить** — запросы по кускам
  - Когда пользователь тянет ползунок — браузер запрашивает только нужные байты

**VideoPlayer окно** — новое BrowserWindow через [videoPlayerHandler.js](main/handlers/videoPlayerHandler.js):
  - IPC: `video:open {src, title}`, `video:close`, `video:minimize`, `video:maximize`, `video:toggle-pin`
  - Новый HTML [main/video-player.html](main/video-player.html) с `<video controls>` + тулбар
  - Preload [main/preloads/videoPlayer.preload.cjs](main/preloads/videoPlayer.preload.cjs)
  - Поддержка клавиш: `Esc` закрыть, `Space/k` play-pause, `← →` ±5 сек, `m` mute, `f` fullscreen

**Новый компонент [VideoTile.jsx](src/native/components/VideoTile.jsx)** — для UI:
  - При mount качает ТОЛЬКО постер (thumb=true, ~20-80 КБ) — не полный файл
  - Показывает ▶ круглую кнопку по центру, duration в углу (`2:05`, `1:30:45`), размер файла (`42.0 МБ`)
  - При клике: `tg:download-video` → прогресс-бар + спиннер `15 МБ / 42 МБ · 35%` → готово → `video:open`
  - Error state с сообщением
  - Используется в MessageBubble для одиночного video И в MediaAlbum для video тайлов альбома

**3. Рефакторинг** — 2 новых хука чтобы держать InboxMode < 600 строк:
  - `useForceReadAtBottom` — force markRead когда atBottom=true
  - `useDropAndPaste` — drag-n-drop файлов + Ctrl+V картинки
  - InboxMode сократился с 610 до 576 строк

**4. Тесты** — 7 новых тестов в [VideoTile.vitest.jsx](src/native/components/VideoTile.vitest.jsx):
  - При mount качается ТОЛЬКО thumb, НЕ полное видео (проверяет IPC calls)
  - Отображение ▶ кнопки
  - Formatter duration: `2:05` / `0:29` / `1:30:45`
  - Formatter size: `42.0 МБ` / `500 КБ`
  - Клик → `tg:download-video` + `video:open` (IPC chain)
  - Обновлён тест в MediaAlbum.vitest.jsx (video тайл делегирует в VideoTile)
  - **Всего: 67 тестов (было 57)** в 9 файлах

**Что проверить в v0.87.34**:
- [ ] Канал MIMS Automobility (unread=2) → открываю, листаю в низ → счётчик становится 0
- [ ] Любой канал с большим unread → пролистал всё → счётчик 0 через 0.5 сек
- [ ] Видео в канале «Автовоз» → виден постер (не блюр!) + ▶ + `2:05 · 12 МБ` в углу
- [ ] Клик по видео → прогресс-бар «15 МБ / 42 МБ · 35%» на постере
- [ ] После скачивания → открывается отдельное окно плеера с видео
- [ ] В плеере работают: ← → ±5сек, Space play/pause, m mute, f fullscreen
- [ ] 📌 в плеере делает окно alwaysOnTop
- [ ] Если видео уже раз скачано — клик открывает МГНОВЕННО (из кэша)
- [ ] В альбоме из video+photo — video показывается с ▶ overlay, photo без

### v0.87.33 (16 апреля 2026) — FIX: видео-альбомы не грузились + счётчик unread не уменьшался

**Пользовательский feedback** (канал «Автовоз» с видео-альбомом «Кино по выходным»):
- ❌ «Не везде фото грузит» — на фото иконки «🛒»/«📹», stripped thumb есть, full — нет
- ❌ «Открываю чат — переходит на первое непрочитанное, листаю вниз — счётчик не меняется»

**Причина 1: видео-альбомы качались как полные файлы**
В [MediaAlbum.jsx:PhotoTile](src/native/components/MediaAlbum.jsx) для ВСЕХ тайлов вызывался `downloadMedia(chatId, m.id, false)` — `thumb=false` значит **полный файл**. Для фото это ~300-700 КБ (OK). Для видео это **100-500 МБ целиком** → GramJS таймаутится или висит. На скриншоте виден пост канала «Автовоз: Кино по выходным» — это видео-анонсы, а не фото.

**Фикс**: для `m.mediaType === 'video'` используем `thumb=true` — GramJS качает только постер (~20-80 КБ). Для `photo` — `thumb=false` (полное ~300-700 КБ).

**Причина 2: счётчик непрочитанных не уменьшался для альбомов**
В MTProto **альбом = N отдельных сообщений** с одним `groupedId`. Сервер увеличивает `unreadCount` на N (по каждому msg). А я в [AlbumBubble](src/native/components/MediaAlbum.jsx) делал `useEffect(() => onVisible(firstMsg), [firstMsg.id])` — вызывался ОДИН раз на mount и только для **первого** сообщения альбома.
Если альбом из 5 фото → unreadCount увеличивался на 5, я помечал 1 → visible счётчик уменьшался на 1 → «не меняется» на глаз.

**Фикс**: IntersectionObserver на контейнере AlbumBubble. При `isIntersecting=true` вызываем `onVisible(m)` **для КАЖДОГО msg в альбоме**. Счётчик уменьшается на правильную величину.

**Дополнительные улучшения**:
- Error state в PhotoTile — если downloadMedia вернул `ok: false` → показываем «↻ клик — загрузить», пользователь может перезапустить
- Добавил 3 регрессионных теста в [MediaAlbum.vitest.jsx](src/native/components/MediaAlbum.vitest.jsx):
  - `RF 0.87.33: onVisible вызывается для всех 5 msgs альбома`
  - `RF 0.87.33: video тайл вызывает downloadMedia с thumb=true`
  - `RF 0.87.33: photo тайл вызывает downloadMedia с thumb=false`
- Мок `IntersectionObserver` в beforeEach имитирует `isIntersecting: true`

**Ловушка 85** в common-mistakes.md: в MTProto альбом = N messages, каждое увеличивает unreadCount. Любая логика visibility/markRead должна работать со всеми msg альбома, не с первым.

### v0.87.32 (16 апреля 2026) — CI FIX: snapshot-тесты падали на GitHub Actions из-за timezone

**Причина падения CI v0.87.31**:
Snapshots содержали результат `new Date(1712000000000).toLocaleTimeString('ru', ...)` — но этот результат **зависит от часового пояса машины**:
- Моя Windows-машина (MSK): сохранила snapshot как `00:33`
- GitHub Actions ubuntu-latest (UTC): рендерил как `19:33`
- CI diff: `Expected "00:33" / Received "19:33"` → 3 snapshot падают → сборка красная

**Фикс (v0.87.32)**:
1. Новый файл [vitest.setup.js](vitest.setup.js) — переопределяет `Date.prototype.toLocaleTimeString / toLocaleDateString / toLocaleString` чтобы **всегда форсить `timeZone: 'UTC'`** при форматировании.
2. [vitest.config.mjs](vitest.config.mjs) — добавлен `setupFiles: ['./vitest.setup.js']`
3. Пересохранены все 6 snapshots с UTC-временем `19:33`
4. Теперь snapshot-тесты детерминированы на любой машине (Windows/Linux/Mac/CI)

**Ловушка 84**: любой snapshot-тест где рендер включает время/дату → надо фиксировать timezone через setup-файл. Иначе CI падает при разных TZ между разработчиками и CI.

### v0.87.31 (16 апреля 2026) — Альбом: все фото видно + Стрелки в PhotoViewer + Pre-commit vitest + 4 новых snapshot-теста

**Пользовательский feedback по v0.87.30 + новые требования**:
- «Надо компоновку сделать так чтобы видно были все фото, чтобы на любое мог нажать» — альбом ограничивал 4 тайлами с «+N»
- «Надо сделать стрелочки в модальном окне что бы мог переключать фото в сообщений, сбоку или стрелочками на клавиатуре, слитные с эффектом» — навигация между фото альбома
- «Pre-commit хук с npm test надо сделать»
- «Snapshot-тесты для визуальной регрессии надо сделать»
- «Vitest render-тесты на остальные крупные компоненты надо сделать»

**1. Альбом: компоновка «видно все фото»** — убран slice(0, 4) и «+N» overlay:
- 1 фото → full 1x1
- 2 фото → 2x1 horizontal
- 3 фото → L-форма (grid-template `"a a" / "b c"`)
- 4 фото → 2x2
- **5 и больше** → 3 колонки × N строк, `gridAutoRows: 1fr`, `minHeight` пропорциональна `rows * 160`, потолок 700px
- Каждый тайл клик → `onPhotoOpen({ srcs, index })`

**2. PhotoViewer с навигацией между фото альбома**:
- `photoViewerHandler.js` теперь принимает либо `{ src }` (одно фото), либо `{ srcs, index }` (массив)
- IPC канал переименован в `photo:set-srcs` (обратная совместимость — преобразует single → array)
- [main/photo-viewer.html](main/photo-viewer.html) — круглые полупрозрачные кнопки ← → по бокам, клавиши `ArrowLeft/ArrowRight/Home/End`, dots-индикатор позиции внизу (до 20 фото), счётчик `X/N` в тулбаре
- **Плавные эффекты**: slide-from-right / slide-from-left анимация 0.25с при смене + hover-scale 1.08 на стрелках + цвет фона меняется на акцент при hover
- Стрелки автоматически `disabled` на краях диапазона и скрыты если фото одно

**3. Pre-commit hook с npm-test** ([scripts/hooks/pre-commit](scripts/hooks/pre-commit)):
- Ранее: только ESLint + 4 статических теста (.test.cjs)
- Теперь дополнительно: **mainImports**, **mainRuntime** (runtime-парсинг main/**), **vitest run** (если в staged есть `.jsx` / `.vitest.*` файлы)
- Автоустановка hook через `npm run setup-hooks` или через `postinstall` — также сам установил в `.git/hooks/pre-commit`
- Время: ~5-10 сек при наличии JSX, ~1-2 сек без изменений JSX

**4. Snapshot-тесты для визуальной регрессии** (6 snapshot'ов в `__snapshots__/`):
- `MessageBubble.vitest.jsx`: снап текстового сообщения + снап исходящего медиа-фото с подписью
- `MediaAlbum.vitest.jsx`: снап альбома 4 фото (2x2)
- `ChatListItem.vitest.jsx`: снап обычного чата с unread + снап канала с счётчиком
- `LinkPreview.vitest.jsx`: снап типичной карточки ссылки
- Любое случайное изменение вёрстки (шрифт, padding, класс) → snapshot упадёт → надо явно подтвердить `vitest run -u`

**5. Vitest render-тесты на компоненты** — 4 новых файла, в сумме **57 тестов** (было 11):
- [MessageBubble.vitest.jsx](src/native/components/MessageBubble.vitest.jsx): 7 тестов (текст/outgoing/✓✓/медиа/link-preview + 2 snapshot)
- [MediaAlbum.vitest.jsx](src/native/components/MediaAlbum.vitest.jsx): 6 тестов (1/2/3 фото / 7 all-visible / caption / snapshot)
- [ChatListItem.vitest.jsx](src/native/components/ChatListItem.vitest.jsx): 12 тестов (user/channel/group/bot/online/avatar/инициалы/active + 2 snapshot)
- [LinkPreview.vitest.jsx](src/native/components/LinkPreview.vitest.jsx): 7 тестов (полная/только title/null/photoUrl/outgoing/snapshot)
- [FormattedText.vitest.jsx](src/native/components/FormattedText.vitest.jsx): 8 тестов (empty/bold/italic+code/url/autolink/hashtag/mention)

**Что проверить**:
- [ ] Альбом из канала «Автопоток» — видны ВСЕ фото, каждое кликабельно (не только 4)
- [ ] Клик по любому фото альбома → окно открывается именно на НАЖАТОМ фото
- [ ] В окне просмотра: стрелки ← → слева/справа, плавно листают с анимацией slide
- [ ] Клавиши ← → тоже листают; `Home`/`End` — на первое/последнее
- [ ] Внизу точки показывают позицию (если фото <20)
- [ ] В тулбаре счётчик `3/7` показывает где ты сейчас
- [ ] Если в окне одно фото — стрелок, счётчика и точек нет
- [ ] Попытайся сделать коммит — pre-commit запускает vitest (если меняешь .jsx) и блокирует при падении

### v0.87.30 (16 апреля 2026) — Vitest render-тест InboxMode — ловит TDZ/порядок hooks

**Пользовательский feedback по v0.87.29**:
- ❌ «Ошибка рендера: Cannot access 'activeMessages' before initialization» — получил TDZ-ошибку в runtime
- ❌ «почему нет проверки по тестам???»

**Диагностика**: Проверил текущий код — activeMessages на строке 78, использование на 125. Физически доступно. Vitest-render тест с mock store и 6 сценариями (пустой / 194 чата / активный чат / непрочитанные / медиа-альбом / link preview) все 6 прошли. **Текущий код корректен**.

**Причина ошибки у пользователя**: Vite HMR закэшировал промежуточное состояние файла между двумя моими Edit'ами (сначала я вставил `useInitialScroll` до `activeMessages` → баг, потом переставил → ОК). HMR подхватил СОХРАНЁННУЮ версию с багом и держит её. Решение: **Ctrl+R в dev-окне** (reload renderer) или перезапуск `npm run dev`.

**Что сделано в v0.87.30 чтобы защитить от подобного в будущем**:
1. **Новый файл** [src/native/modes/InboxMode.vitest.jsx](src/native/modes/InboxMode.vitest.jsx) — 6 сценариев рендера InboxMode через `@testing-library/react` + happy-dom:
   - Пустое состояние (нет активного чата)
   - Список 194 чата (стресс для react-window)
   - Активный чат с 3 сообщениями
   - Непрочитанные + first-unread divider (проверяет `useInitialScroll` хук)
   - Медиа-альбом (3 фото с groupedId → рендер `AlbumBubble`)
   - Link preview (проверяет LinkPreview рендер)
2. Mock: `window.api` (IPC), `IntersectionObserver`, `ResizeObserver` — всё что нет в happy-dom по умолчанию
3. Уже подхватывается общим `vitest run` в `npm test` (конфиг `include: ['src/**/*.vitest.jsx']`)

**Главный урок** (Ловушка 83 в common-mistakes.md): статические .cjs тесты НЕ выполняют JSX. TDZ/ReferenceError/hook order ошибки ловит только **runtime-рендер** через vitest + testing-library. Нужно прикрывать каждый крупный компонент smoke-тестом.

**Что проверить пользователю**:
- [ ] **Ctrl+R в окне приложения** — ошибка «activeMessages» должна исчезнуть
- [ ] Если не уйдёт — перезапустить `npm run dev` с очисткой кэша (rm -rf node_modules/.vite)
- [ ] Далее — все ранее ожидавшие проверки из v0.87.27-29 (альбомы, скролл-вариант A, жёлтая подсветка, lastMessage preview и др.)

### v0.87.29 (16 апреля 2026) — Медиа-альбомы + Вариант A скролла + жёлтая подсветка

**Пользовательский feedback по v0.87.28**:
- ✅ PhotoViewer отдельное окно «Подойдет»
- ❌ В канале «Автопоток»: когда в одном сообщении много фото — показываются по очереди вертикально, а нужна сетка как в Telegram
- ✅ Аватарки, Reply-scroll — работает

**Что сделано в v0.87.29**:

1. **Группировка медиа-альбомов (grouped messages)**
   - `mapMessage` в [telegramHandler.js](main/native/telegramHandler.js) — добавлено поле `groupedId` из MTProto `m.groupedId`
   - [messageGrouping.js](src/native/utils/messageGrouping.js) — новая функция `collapseAlbums(msgs)` склеивает последовательные msgs с одинаковым groupedId в объект `{ type: 'album', msgs: [...] }`
   - Новый компонент [MediaAlbum.jsx](src/native/components/MediaAlbum.jsx) — рендерит сетку 1x1 / 2x1 / 2x2 (с L-формой для 3 фото) / 2x2 с «+N» на 4-м
   - `AlbumBubble` — бубл-обёртка вокруг альбома с reply/меню/подписью/временем — аналог MessageBubble
   - Клик по любому превью в альбоме → открывает отдельное окно PhotoViewer через `photo:open` IPC
   - Заменён `item.msgs.map(m => <MessageBubble/>)` на ternary `m.type === 'album' ? <AlbumBubble/> : <MessageBubble/>` в InboxMode.jsx

2. **Вариант A скролла при открытии чата** (рекомендованный как классический Telegram)
   - Новый хук [useInitialScroll.js](src/native/hooks/useInitialScroll.js)
   - `unread === 0` → скролл в самый низ (`scrollTop = scrollHeight`)
   - `unread > 0` → `scrollIntoView({block:'start'})` на элемент `[data-msg-id="<firstUnreadId>"]` + добавление класса `native-msg-last-read-highlight` на 3.5с
   - Если элемент first-unread не найден в DOM (не загружен в текущую страницу) — fallback на «в низ»
   - Защита: `doneRef` — срабатывает один раз на chatId, не дёргается при обновлении messages

3. **Жёлтая подсветка «последнее прочитанное»**
   - CSS-анимация `native-last-read-glow` в [styles.css](src/native/styles.css) — 3.5с плавное желтоватое свечение вокруг bubble + лёгкий фон
   - Класс `.native-msg-last-read-highlight > div:first-child` применяет анимацию к внутреннему бублу
   - Работает вместе с divider «Новые сообщения» — жёлтая подсветка идёт на первом непрочитанном сообщении после divider'а

4. **Рефакторинг**: `useInitialScroll` вынесен в отдельный хук чтобы InboxMode.jsx оставался под 600 строк (591/600).

**Что проверить в v0.87.29**:
- [ ] В канале «Автопоток» / любом сообщении с 2-10 фото — показываются сеткой, не вертикально
- [ ] Клик по любому фото из альбома → открывается отдельное окно PhotoViewer с этим фото
- [ ] Открываешь чат с непрочитанными → сразу скроллит на первое непрочитанное + жёлтая подсветка 3.5с
- [ ] Открываешь чат где всё прочитано → скроллит в самый низ (последнее сообщение видно)
- [ ] Divider «Новые сообщения» виден одновременно с жёлтой подсветкой

### v0.87.28 (16 апреля 2026) — PhotoViewer отдельное окно + lastMessage preview

**Пользовательский feedback по v0.87.27**:
- ✅ Reply-клик scroll + вспышка — работает
- ✅ Аватарка в группе чужих — работает
- ❌ PhotoViewer **НЕ ТАК** — был React-overlay на весь экран; пользователь просил отдельное модальное окно, которое можно передвигать/увеличивать/закреплять

**Что сделано в v0.87.28**:
1. **PhotoViewer → отдельное BrowserWindow** — удалил `src/native/components/PhotoViewer.jsx` (React-overlay). Новый `main/handlers/photoViewerHandler.js` создаёт frameless BrowserWindow 900×700 (по умолчанию, можно ресайзить/максимизировать). Новый HTML `main/photo-viewer.html` + preload `main/preloads/photoViewer.preload.cjs`. IPC: `photo:open {src}` (открывает / переиспользует окно), `photo:close`, `photo:minimize`, `photo:maximize`, `photo:toggle-pin`. Окно имеет:
   - Собственную тулбар: зум ± + процент, сброс ⟲, закрепить 📌 (alwaysOnTop), download ⬇, свернуть _, развернуть ▢, закрыть ✕
   - Колёсико = zoom 0.2–8x, drag = pan, двойной клик или `0` = reset, +/- = зум
   - Drag самого окна по body (webkit-app-region: drag), но не по фото/кнопкам
   - Esc закрывает окно
2. **lastMessage preview** — чаты в списке показывали «—» для сообщений без текста. Причина: `d.message?.message || ''` в mapDialog даёт пустую строку для медиа/service messages. Добавил функцию `messagePreview(m)` в [telegramHandler.js](main/native/telegramHandler.js) которая возвращает:
   - `🖼 Фото` / `📹 Видео` / `🎵 Аудио` / `📎 имяФайла.ext` / `🎤 Голосовое` / `⭕ Видеосообщение` / `🎴 Стикер`
   - `📍 Геолокация` / `👤 Контакт` / `📊 Опрос` / `🔗 Ссылка` / `💳 Оплата` / `🎮 Игра`
   - Для service: `👤 добавлен участник` / `📌 закреплено сообщение` / `✏️ название чата изменено` / `📞 звонок` и т.д.
   - Также применяется в [nativeStore.js](src/native/store/nativeStore.js) для tg:new-message чтобы новые входящие тоже получали preview (ribbon + список)
3. Новые файлы добавлены в `electron.vite.config.js` для билда:
   - `main/photo-viewer.html` копируется в `out/main/`
   - `main/preloads/photoViewer.preload.cjs` собирается в `out/preload/photoViewer.mjs`

**Что проверить в v0.87.28**:
- [ ] Клик по фото → открывается отдельное окно (не overlay на весь экран)
- [ ] Окно можно передвигать за шапку (drag body)
- [ ] Окно можно ресайзить за углы (resizable)
- [ ] Кнопка 📌 делает окно alwaysOnTop (поверх всех окон Windows), повторный клик — выключает
- [ ] Колёсико в окне фото зумит
- [ ] Минимизация/максимизация кнопками
- [ ] Список чатов: для чатов с документами/фото/голосовыми в последнем сообщении — видно «📎 Файл.docx» / «🖼 Фото» / «🎤 Голосовое», а не «—»

### v0.87.27 (16 апреля 2026) — 12 новых фичей: PhotoViewer, reply-scroll, unread divider, link preview, Ctrl+↑, аватарки в группе, кэш-bust, runtime-тест
**⚠️ НЕ ПОМЕЧАТЬ СДЕЛАННЫМИ — пока пользователь не подтвердит проверку!** См. таблицу «Непроверенные фичи» выше.

**Что добавлено**:
1. **Reply-клик scroll to original** — клик по reply-цитате (↪ текст) → плавный скролл к оригиналу + 1.5с жёлтая вспышка подсветки. `onReplyClick` prop в MessageBubble.jsx, `scrollToMessage(id)` в InboxMode.jsx через `[data-msg-id="..."]` query. Если оригинал не загружен (скрыт в infinite scroll) — toast «прокрутите вверх».
2. **«Новые сообщения» divider** — жёлтая горизонтальная плашка с линиями появляется перед первым непрочитанным сообщением при открытии чата. `firstUnreadIdRef` вычисляется в useEffect при смене activeChatId. `findFirstUnreadId()` в `messageGrouping.js`.
3. **Runtime smoke-тест main** — `src/__tests__/mainRuntime.test.cjs` парсит каждый `main/**/*.js`, вытаскивает все `import { X } from 'pkg'`, делает `require(pkg)` и проверяет что каждое имя реально экспортируется. Отдельно проверяет подпути `telegram/sessions/index.js`, `telegram/events/index.js`, `telegram/Utils.js`. Ловит ошибки типа Ловушки 79 ДО запуска Electron.
4. **Avatar cache bust** — при `tg:remove-account` удаляются все файлы из `tg-avatars/`, `tg-media/`, `tg-cache.json`, очищается `chatEntityMap`. Следующий аккаунт не получает старые аватарки/медиа.
5. **Сжатие tg-media** — `ipcMain.handle('tg:cleanup-media', {maxDays=30})` + авто-вызов при инициализации handler'а. Файлы старше 30 дней удаляются; логируется освобождённый размер в МБ.
6. **PhotoViewer** — новый компонент `src/native/components/PhotoViewer.jsx` — полноэкранный просмотрщик с: pan (drag мышкой), zoom (колёсико + кнопки ± + двойной клик reset), pin (кнопка 📌 → IPC `window:set-always-on-top`), download (⬇), Esc закрытие. Клик по фото в MessageBubble → `onPhotoOpen(mediaUrl)`.
7. **Индикатор новых снизу** — круглая кнопка ↓ в правом нижнем углу scroll-области появляется когда юзер НЕ внизу чата. Показывает счётчик новых входящих (`newBelow` state). Клик → плавный скролл вниз + сброс счётчика.
8. **Link Preview** — новый `LinkPreview.jsx`. `mapMessage` в telegramHandler.js извлекает `webPage` (url/title/description/siteName). Рендерится карточкой с левой синей полосой. Клик → `app:open-external`.
9. **Ctrl+↑ → редактирование** — при пустом input + Ctrl+↑ ставим последнее своё текстовое сообщение в edit-режим с заполненным input.
10. **Аватарка слева от групп чужих** — новый `.native-msg-group-row` flex-layout с `.native-msg-avatar` (32×32 круг). Использует `activeChat.avatar` для private-чатов; для групп — инициалы имени sender'а. Для своих сообщений (row-reverse) — без аватарки.
11. **`window:set-always-on-top` IPC** — новый обработчик в `main/handlers/windowHandlers.js` (вынесено из main.js т.к. превысил лимит 600).
12. **Рефакторинг**: `groupMessages`, `formatDayLabel`, `findFirstUnreadId` вынесены в `src/native/utils/messageGrouping.js`; window-handlers вынесены в `main/handlers/windowHandlers.js`.

**Что проверить (до закрытия задачи)**:
- [ ] Клик по фото → открывается модалка на весь экран, колёсико зумит, drag двигает, 📌 закрепляет окно поверх других
- [ ] Reply-цитата кликабельна → скролл + жёлтая вспышка
- [ ] При открытии чата с >0 unread видна жёлтая плашка «Новые сообщения» перед первым непрочитанным
- [ ] При скролле вверх в правом-нижнем углу появляется ↓ с цифрой новых
- [ ] Ссылка в сообщении рендерится карточкой (title/description)
- [ ] Ctrl+↑ в пустом поле → последнее своё сообщение в edit
- [ ] Слева от чужой группы видна аватарка чата/отправителя
- [ ] После logout аватарки следующего аккаунта обновляются (не старые)
- [ ] Файлы `tg-media/` старше 30 дней удаляются при старте (проверять `Roaming/ЦентрЧатов/tg-media`)
- [ ] Главный тест: `npm test` проходит, в том числе `mainRuntime.test.cjs` с проверкой всех main модулей и подпутей telegram/*

### v0.87.26 (16 апреля 2026) — UI фиксы: разделители дат + размер фото + счётчик непрочитанных
- **Проблема 1 — разделители дат плохо видно**: `.native-msg-divider` был `rgba(255,255,255,0.04)` на чистом #000 → почти невидимы. **Фикс**: `.native-msg-divider--day` — акцентный фон с синей обводкой, uppercase, backdrop-blur; обёртка `.native-msg-day-row` с горизонтальными градиент-линиями по бокам (как в Telegram).
- **Проблема 2 — одиночное фото слишком маленькое**: bubble `maxWidth: 65%` схлопывался до ширины контента. Фото `width: 100%` от схлопнутого родителя = микро-размер. **Фикс**: для `mediaType === 'photo'/'video'` bubble получает `minWidth: 280px, maxWidth: min(420px, 65%)`; само фото — `minHeight: 180px, maxHeight: 420px` с сохранением aspectRatio; padding бабла уменьшен до 4px чтобы фото занимало всю площадь.
- **Проблема 3 — счётчик непрочитанных неверен**: две причины — (1) `readByVisibility._timer` в `InboxMode.jsx:204` был property на функции, которая **пересоздаётся при каждом рендере** → накапливались параллельные таймеры → `store.markRead` вызывался многократно с `count=0` после сброса batch → локально `unreadCount` сбрасывался в 0. (2) `startUnreadRescan` в `telegramHandler.js:829` брал только `limit: 50` — чаты за пределами первых 50 никогда не синхронизировались. **Фикс**: `readTimerRef = useRef(null)` + отдельный `readBatchRef` для окна debounce + проверка `chatAtStart === store.activeChatId` перед emit + guard `count === 0 return`; в main — `fetchAllUnreadUpdates()` с пагинацией до 500 чатов (5×100), используется как в периодическом, так и в manual rescan.
- **Проверить**: (1) разделители «20 марта» / «21 марта» теперь видны как синие плашки с горизонтальными линиями; (2) одиночные фото отображаются минимум 280×180 (не крохотно как раньше); (3) счётчик непрочитанных должен корректно уменьшаться по мере прокрутки, не прыгать в 0, и периодически подтягиваться с сервера для всех 200+ чатов.

### v0.87.25 (16 апреля 2026) — FIX Named export Helpers + новый тест mainImports
- **Ошибка запуска v0.87.24**: `SyntaxError: Named export 'Helpers' not found. The requested module 'telegram' is a CommonJS module`.
- **Причина**: в v0.87.24 добавил `import { Helpers } from 'telegram'` — но `telegram` npm пакет НЕ экспортирует `Helpers` напрямую. Функция `strippedPhotoToJpg` лежит в `telegram/Utils.js`.
- **Фикс**: `import { strippedPhotoToJpg } from 'telegram/Utils.js'`.
- **Почему тесты не поймали**:
  - Статические тесты (grep-based) только читают файлы как текст, не импортируют модули
  - `electron-vite build` **компилирует** ESM→CJS синтаксически, но не проверяет что named export реально есть
  - `vitest` не импортирует main-процесс модули
- **Новый тест** `src/__tests__/mainImports.test.cjs`:
  - Парсит ВСЕ `main/**/*.js` файлы на `import { X, Y } from 'pkg'`
  - Для CommonJS пакетов (telegram, baileys, vk-io, input) делает `require(pkg)` и проверяет что каждый named import **реально** существует в export'ах
  - Electron исключён (работает через спец. runtime Electron'а)
  - Подключён в `npm test` pipeline
  - Ловит ошибки «Named export X not found» **ДО запуска** программы
- Ловушка 79 — CommonJS пакеты в ESM-проекте требуют осторожности с named imports. Нужен runtime-проверяющий тест.

### v0.87.24 (16 апреля 2026) — Stripped thumbs + группировка + Kombo D unread-sync
- **Stripped photo (Вариант A)**:
  - В `mapMessage` → `extractStrippedThumb` читает `PhotoStrippedSize` из `media.photo.sizes`
  - Используется `Helpers.strippedPhotoToJpg(bytes)` из GramJS — распаковывает 1-3КБ stripped JPEG в полный
  - Конвертирует в `data:image/jpeg;base64,...` — отправляется с message в renderer
  - MessageBubble: stripped как `background-image` + полный фото поверх с fade-in
  - `aspectRatio` баббла из `mediaWidth/mediaHeight` — нет скачков layout
  - Результат: **мгновенное размытое превью** + плавная замена на полное фото
- **Группировка 2+5+3** (+ время у каждого):
  - `renderItems` computed в useMemo: группируем по автору, разделители дня/времени
  - Правила новой группы: другой автор **ИЛИ** прошло >5 мин **ИЛИ** другой день
  - Дневной разделитель: «Сегодня», «Вчера», «12 апреля»
  - 5-минутный разделитель: `HH:MM` между группами
  - Группа: имя автора над первым сообщением, `gap: 2px` внутри группы, `gap: 10px` между
  - Каждый баббл: тонкая рамка `rgba(255,255,255,0.06)` для чужих, glow `rgba(42,171,238,0.15)` для своих
  - Время **у каждого** сообщения (оставлено)
- **Kombo D — синхронизация unread**:
  - **Часть A (периодический)**: `startUnreadRescan()` — setInterval 30 сек. Запрашивает `getDialogs({limit:50})`, emit `tg:unread-bulk-sync`. Store обновляет массово через Map.
  - **Часть B (window.focus)**: IPC `tg:rescan-unread` — при фокусе окна renderer вызывает rescanUnread()
  - **Часть C (raw updates)**: уже работает — UpdateReadHistoryInbox/Outbox + UpdateReadChannelInbox/Outbox
  - **Часть D (точка sync после mark-read)**: v0.87.22 — GetPeerDialogs через 800мс
  - Итого: 4 независимых механизма синхронизации → максимальная точность
- Vitest: 11/11 ✅, E2E: 9/9 ✅.

### v0.87.23 (16 апреля 2026) — Откат thumbs + форматирование + подробные логи unread/чатов
- **Откат ускорения через thumbs**: пользователь просит полные фото как было. Возвращено `downloadMedia(msg, thumb: false)` — полное фото по умолчанию.
- **Форматирование сообщений** (entities MTProto):
  - Маппер `mapEntities` → в message добавляется `entities[]` с типами: bold, italic, underline, strike, code, pre, url, texturl, mention, mentionname, hashtag, cashtag, botcommand, email, phone, spoiler.
  - Новый компонент `FormattedText.jsx` — рендерит текст с форматированием:
    - **Жирный** / *курсив* / ~~зачёркнутый~~ / подчёркнутый
    - `code` / ```pre``` блоки
    - [ссылки](url) открываются в внешнем браузере через `app:open-external` (shell.openExternal)
    - Синие #хэштеги, @упоминания, /botcommands
    - Спойлеры — клик показать
  - Авто-детект ссылок/хэштегов/упоминаний в тексте без entities (regex fallback)
  - Новый IPC `app:open-external` через `shell.openExternal()`
- **Подробные логи загрузки чатов**:
  - `═══ ДИАЛОГИ АКТИВНЫЕ ═══` с разделителями
  - `загружено: N чатов`
  - `непрочитанных чатов: X`
  - `всего непрочитанных сообщений: Y`
  - Отдельно для архивных: `═══ АРХИВНЫЕ ═══ загружено=N, непрочитанных=Y`
- **Подробные логи синхронизации unread**:
  - После каждого `mark-read` → запрос `messages.GetPeerDialogs`
  - Лог: `═══ UNREAD SYNC ═══ chat=... Telegram сервер=N unreadMentions=X unreadReactions=Y`
  - Видно точно что Telegram возвращает — сверить с нашим UI.

### v0.87.22 (16 апреля 2026) — Ускорение фото (thumbs) + sync unread с Telegram + архивные чаты
- **CLAUDE.md**: добавлено правило «Правило превышения лимита строк» — при превышении **НЕ резать комментарии**, разделять файл на модули.
- **Ускорение загрузки фото (thumbs)**:
  - Было: `downloadMedia(msg)` скачивал полный файл ~200-300КБ на превью.
  - Стало: `downloadMedia(msg, { thumb: 0 })` скачивает thumbnail ~10-50КБ — в 10 раз быстрее.
  - MessageBubble автоматически грузит THUMB, по клику на картинку можно догрузить полный размер.
  - Файлы кэшируются раздельно: `{id}_thumb.jpg` и `{id}.jpg`.
- **Синхронизация счётчика непрочитанных с Telegram**:
  - Проблема: после markAsRead локальный счётчик мог расходиться с реальным в Telegram.
  - Фикс: через 800мс после `mark-read` делаем `messages.GetPeerDialogs` → получаем **реальный** `unreadCount` с сервера → emit `tg:chat-unread-sync` → store обновляет точное значение. Больше не «дёргается».
- **Архивные чаты** (доступ к папке «Архив»):
  - По умолчанию `getDialogs` возвращает только активную папку (folder=0).
  - Добавлен параллельный запрос `folder=1` (архив). Чаты помечаются `archived: true`.
  - Эмитятся через `append: true` → не перезаписывают активные.
- Итог список чатов: активные + архивные.

### v0.87.21 (16 апреля 2026) — FIX CI лимит main.js (cc-media вынесен в отдельный модуль)
- **CI ошибка**: `main.js ≤ 600 строк (сейчас 631): 631 > 600 — РАЗБИТЬ!` — добавление protocol.handle в v0.87.20 превысило лимит.
- **Фикс**: новый модуль `main/native/ccMediaProtocol.js` с двумя функциями `registerCcMediaScheme()` + `registerCcMediaHandler(userData)`. main.js импортирует и вызывает. Итог 600 строк.

### v0.87.20 (16 апреля 2026) — НАСТОЯЩАЯ причина почему фото не видны: custom protocol
- **Проблема**: в логах `download-media: OK, size=278553` — сотни успешных загрузок. CSP расширен. Но UI всё равно **пустой**.
- **Настоящая причина**: dev-сервер Vite грузит UI по `http://localhost:5173`. Electron с `webSecurity=true` (по умолчанию) **блокирует смешанные протоколы** — `<img src="file://...">` в HTTP-контексте не загружается. Это не CSP, это политика Chromium «no file in http».
- **Правильное решение** (по [Electron docs](https://www.electronjs.org/docs/latest/api/protocol)): custom protocol `cc-media://`. Регистрируем через `protocol.handle('cc-media', ...)` в main.js, отдаёт файлы из `tg-avatars/` и `tg-media/` по URL типа `cc-media://avatars/12345.jpg`.
- **Фикс**:
  - main.js: `protocol.registerSchemesAsPrivileged([{ scheme: 'cc-media', privileges: { standard: true, secure: true, supportFetchAPI: true }}])` до whenReady
  - В whenReady: `protocol.handle('cc-media', ...)` — парсит URL, читает файл из `tg-avatars` или `tg-media`, возвращает `Response(data, { headers: { 'Content-Type': 'image/jpeg' }})`
  - telegramHandler.js: все `file:///...` заменены на `cc-media://avatars/...` и `cc-media://media/...`
  - index.html CSP: `cc-media:` вместо `file:` в `img-src`, `media-src`, `connect-src`, `default-src`
- **Ловушка 78**: в Electron dev-режиме (http://localhost) file:// URL НЕ работают в `<img>` из-за Chromium mixed-content policy. Единственное правильное решение — custom protocol через `protocol.handle()`. `webSecurity: false` — **не рекомендуется**, ломает безопасность.

### v0.87.19 (16 апреля 2026) — 3 корневых ИСТИННЫХ причины: CSP, channels.ReadHistory, GetFullChannel
**По сверке с документацией и логами — настоящие причины всех проблем:**

- **Фото в сообщениях не видны** (хотя download-media ok):
  - Лог: `download-media: OK, size=249531` (сотни успешных загрузок).
  - Но `<img src="file://...">` НЕ рендерится.
  - **Причина**: CSP в `index.html` = `default-src 'self'` → блокирует file:, blob:, data:. Chromium молча отказывается загружать image.
  - **Фикс**: расширен CSP: `img-src 'self' file: blob: data: https: http:; media-src 'self' file: blob:; default-src 'self' file: blob: data:`.

- **Счётчик не синхронизируется с Telegram**:
  - Лог: `mark-read error: 400 PEER_ID_INVALID (caused by messages.ReadHistory)`.
  - **Причина**: я использовал `messages.ReadHistory` для ВСЕХ чатов. Но по документации MTProto для **каналов** нужен `channels.ReadHistory` — это **разные методы**!
  - **Фикс**: используем `client.markAsRead(entity, maxId)` — GramJS сам разруливает. Плюс явный fallback через `channels.ReadHistory` для `InputPeerChannel`. Теперь счётчики синхронизируются с телефоном.

- **Аватарки у 82 чатов нет** (hasPhoto=112 noPhoto=82 из 194):
  - **Причина**: `getDialogs` MTProto **не всегда возвращает `entity.photo` для каналов/групп**. Особенно для мало-активных или каналов куда недавно вступили. По документации для полной инфы нужен `channels.GetFullChannel`.
  - **Фикс**: для чатов без `entity.photo` — batch `client.invoke(channels.GetFullChannel)` / `users.GetFullUser`, берём photo из response, скачиваем. Новое поле `fetched` в логе покажет сколько реально догрузили.

- **Ловушки 76-77**:
  - **76**: CSP `default-src 'self'` блокирует file:// для `<img>` — нужен `img-src file:` явно.
  - **77**: `messages.ReadHistory` ≠ `channels.ReadHistory` в MTProto. Для каналов используется отдельный метод. Всегда использовать GramJS высокоуровневый `client.markAsRead(entity)` который сам выбирает нужный RPC.

### v0.87.18 (16 апреля 2026) — 3 критичных FIX: аватарки ВСЕХ, счётчик прочитанных, media
- **Главный баг — аватарки только у 50 чатов из 194**:
  - В логах: `аватарки: total=50 hasPhoto=44 noPhoto=6 downloaded=0 cached=44`
  - Причина: в коде было `loadAvatarsAsync(firstPage.slice(0, 50))` и `loadAvatarsAsync(page.slice(0, 50))` — **жёсткий лимит 50 для каждой страницы**. Забыл убрать когда делал пагинацию.
  - **Фикс**: убран `.slice(0, 50)` — теперь качаем ВСЕ аватарки каждой страницы. `total=194 hasPhoto=~150 ...`
- **Счётчик прочитанных «дёргался» кратно**:
  - IntersectionObserver срабатывал многократно на одно сообщение (при скролле туда-сюда) → `markRead(chatId, maxId, 1)` вызывался 3-5 раз на одно → счётчик падал кратно.
  - **Фикс**: `Set` уникальных прочитанных id, сбрасывается при смене чата. Debounced batch mark-read раз в 1.5 сек с `count = Set.size`. Один уникальный id = -1 к счётчику, не больше.
- **Media фото не грузились / заглушка `[медиа]`**:
  - Добавлены подробные логи в `tg:download-media`: `chat, msg, cached?, className, size`. Теперь в `⚡ Native` фильтре видно почему не скачалось (нет media, downloadMedia вернул null, etc).
  - **Фикс**: расширение файла `.bin` → `.jpg` чтобы `<img src="file://...">` подхватывал как картинку. Без правильного MIME type Chromium может отказаться рендерить.
- Ловушка 75 — hard-coded `slice(0, N)` лимиты без комментария легко забыть при рефакторинге. В production коде `slice` только с ОБОСНОВАНИЕМ.

### v0.87.17 (15 апреля 2026) — Модалка forward + pin-bar + галочки + тост + логи + refresh аватарок
- **Forward** — не работал клик:
  - Использовался `prompt()` — в некоторых Electron окружениях может не открываться.
  - **Фикс**: красивая **модалка ForwardPicker** с поиском и аватарками. Показывает все чаты, фильтр по названию, клик — отправка.
- **Pin** показывал `CHAT_ADMIN_REQUIRED` алертом:
  - **Фикс**: отдельная проверка regex в handler → русское сообщение «Нет прав админа для закрепления в этом чате». Показывается через тост (не alert).
- **Paste (Ctrl+V)** не работал:
  - **Фикс**: переписан handler — preventDefault только если есть image/* в буфере (чтобы обычная вставка текста не блокировалась). Добавлены логи + тост с результатом.
- **Закреплённые сообщения сверху чата**:
  - IPC `tg:get-pinned` через `messages.Search { filter: InputMessagesFilterPinned }` — официальный способ получить closeleden
  - При смене чата — запрос, если есть — синяя плашка «📌 Закреплённое: {текст}» над лентой сообщений
- **Галочки прочитанности (✓ / ✓✓)**:
  - `maxOutgoingRead` Map: chatId → maxId прочитанных нашим собеседником
  - При `UpdateReadHistoryOutbox` — обновляем map + emit `tg:read { outgoing: true, maxId }`
  - В store → обновляем `isRead` для всех своих сообщений до maxId
  - В MessageBubble → `✓✓` если `isRead=true`, иначе `✓` (для своих)
  - При `getMessages` — дополнительно вызываем `GetFullUser`/`GetFullChannel` для получения текущего `readOutboxMaxId`
- **Refresh аватарок для активного чата**:
  - Новый IPC `tg:refresh-avatar` — повторный вызов `downloadProfilePhoto` для конкретной entity
  - При открытии чата без аватарки — автоматически догружаем. Для каналов которые в `getDialogs` пришли без photo.
- **Тосты** вместо `alert()`:
  - CSS `.native-toast` анимация slide-in справа
  - Типы: info / error / success (цветные левые полосы)
  - Автоматически скрываются через 4 сек
- **Подробные логи** для всех действий: `forward`, `pin`, `send-clipboard`, `refresh-avatar`, outgoing read — в фильтре «⚡ Native» лога.
- Ловушка 74 — prompt() ненадёжен в Electron, делать кастомные модалки.

### v0.87.16 (15 апреля 2026) — Read-by-scroll + аватарки в кэше + 5 фич (drag-n-drop, paste, forward, pin)
- **Проблема 1 — счётчик сбрасывается сразу при открытии чата**:
  - v0.87.15 делал optimistic `unreadCount=0` сразу.
  - **Фикс**: убран авто-markRead при открытии чата. Счётчик уменьшается **по мере видимости** через IntersectionObserver: когда сообщение попадает в viewport (threshold 0.5) → `lastReadRef = id`, debounced markRead каждые 2 сек до текущего maxId. В UI `unreadCount -= 1` за каждое видимое сообщение.
- **Проблема 2 — аватарки из кэша не подхватывались**:
  - tg-cache.json сохранялся ДО загрузки аватарок → `chat.avatar` был undefined. При старте программы чаты из кэша без аватарок.
  - **Фикс**: при сохранении кэша (`saveChatsCache`) проверяем есть ли файл в `tg-avatars/{rawId}.jpg` и подставляем `file://` URL. При чтении (`tg:get-cached-chats`) тоже проверяем. Теперь аватарки **мгновенно** видны после перезапуска.
- **Проблема 3 — плохая подсветка активного чата на тёмной теме**:
  - Было: `background: var(--amoled-surface-hover)` — едва заметно на AMOLED.
  - **Фикс**: яркий синий фон `rgba(42, 171, 238, 0.2)` + **левая полоса-индикатор** 3px сплошного синего `var(--amoled-accent)`. Hover уменьшен до `rgba(255,255,255,0.04)`.
- **Drag-n-drop файлов**: перетаскиваешь файл в окно чата → `sendFile`. Подсветка drop-зоны синей рамкой «📎 Отпустите файл для отправки».
- **Paste (Ctrl+V)**: в поле ввода → копируется скриншот → `tg:send-clipboard-image` → временный файл → `client.sendFile`.
- **Forward (пересылка)**: кнопка ➥ в контекст-меню баббла → prompt «название чата» → fuzzy search по store.chats → `client.forwardMessages`.
- **Pin (закрепление)**: кнопка 📌 → `client.pinMessage`. Для каналов/групп где нет прав вернёт ошибку в alert.
- **IntersectionObserver в MessageBubble**: `threshold: 0.5`, onVisible callback для UI-прочитывания.
- **Новые IPC**: `tg:send-file`, `tg:send-clipboard-image`, `tg:forward`, `tg:pin`.
- Ловушка 73 — markRead должен быть управляемый (по видимости), не автоматический.

### v0.87.15 (15 апреля 2026) — Медиа + Scroll-up + Reply/Edit/Delete + Search в чате + FIX markRead
- **Проблема — mark-read не сбрасывал счётчик 49**:
  - IPC звал `client.markAsRead()` но UI ждал emit `tg:read` от GramJS, который приходил задержанный или не приходил.
  - **Фикс**: сразу optimistic-обновление `chat.unreadCount = 0` в store при клике, не ждём сеть.
- **Проблема — аватарки у некоторых чатов нет**:
  - Добавлена детальная статистика в лог `loadAvatarsAsync`: `total=200 hasPhoto=180 noPhoto=20 downloaded=150 cached=30 failed=0`. Теперь в логе сразу видно сколько без фото (это нормально — у некоторых аккаунтов/каналов реально нет аватарки).
- **Медиа в сообщениях** (`MessageBubble.jsx`):
  - Маппер `mapMessage` определяет тип: photo / video / audio / file / link / location / contact / poll
  - IPC `tg:download-media` скачивает медиа через `client.downloadMedia`, кэш в `%APPDATA%/ЦентрЧатов/tg-media/`
  - Фото автоматически грузятся и показываются inline (картинка в бабле)
  - Видео/аудио/файлы — клик для скачивания, иконка + имя
  - Link/location/contact/poll — иконка-заглушка
- **Scroll-up (infinite scroll вверх)**:
  - При `scrollTop < 100px` и есть сообщения → `store.loadOlderMessages(chatId, oldestId, 50)`
  - IPC `tg:get-messages { offsetId }` → emit `tg:messages { append: true }`
  - Store добавляет старые в начало массива без дублей (Set по id)
  - Сохраняется позиция скролла — чтобы не прыгало к верху
- **Reply (ответ на сообщение)**:
  - Hover на баббл → появляется ↪ кнопка
  - Клик → панель «↪ Ответ на: ...» над полем ввода
  - Send с `replyTo: Number(messageId)`
- **Edit (редактирование своего)**:
  - Hover на свой баббл → ✏️ кнопка
  - Клик → текст подставляется в поле, панель «✏️ Редактирование»
  - Send → `client.editMessage(entity, { message, text })`
  - Баббл показывает «ред.» метку
- **Delete (удаление своего)**:
  - Hover на свой баббл → 🗑 кнопка
  - Confirm → `client.deleteMessages(entity, [id], { revoke: true })`
  - Сообщение пропадает из массива
- **Поиск по сообщениям в открытом чате**:
  - Кнопка 🔍 в шапке чата → появляется поле
  - Фильтр `text.toLowerCase().includes(q)` — без API, локально
  - Счётчик «Найдено: N»
- **Вынесен MessageBubble.jsx** (109 строк) — чтобы InboxMode не вырос выше лимита.

### v0.87.14 (15 апреля 2026) — Кэш + Mark as read + Toast + Typing + FIX аватарок
- **FIX аватарки не видны**: путь содержит кириллицу (`C:/Users/Директор/AppData/.../ЦентрЧатов/`). Chromium рендер не принимает `file://` без URL-кодирования. Фикс — `encodeURI(avatarPath)` перед `file:///`. Теперь видны 44+ реальных аватарок.
- **Ловушка 72**: `file://` URL с кириллицей должен быть закодирован через `encodeURI()` для работы в Electron рендере.
- **JSON-кэш чатов** (без БД, без установки):
  - Сохраняется в `%APPDATA%/ЦентрЧатов/tg-cache.json` после первой страницы
  - При старте: `store.loadCachedChats()` → UI показывает список **мгновенно** из файла
  - Параллельно GramJS грузит свежие и перезаписывает
  - Новый IPC `tg:get-cached-chats`
- **Mark as read**:
  - При выборе чата автоматически `store.markRead(chatId)` → IPC `tg:mark-read` → `client.markAsRead(entity)`
  - Telegram отмечает сообщения прочитанными, бейдж на телефоне сбрасывается
  - `chatEntityMap` хранит entity по chatId для быстрого доступа
- **Toast-уведомления через MessengerRibbon**:
  - При `tg:new-message` (не своё + не активный чат) → `window.api.invoke('app:custom-notify', { ... })`
  - Используется существующая модалка ribbon: title = chat.title, body = message.text, icon = chat.avatar, color #2AABEE, emoji ✈️
  - dismissMs 7 сек
  - Звук уже играет встроенный в MessengerRibbon (настраивается в Настройках приложения)
- **Typing-индикатор**:
  - Подписка на raw updates GramJS: `UpdateUserTyping`, `UpdateChatUserTyping`, `UpdateChannelUserTyping`
  - Emit `tg:typing { chatId, userId, typing }` → store обновляет `typing` map
  - В шапке чата `✍️ печатает...` вместо `● онлайн` если typing активен
  - Авто-истечение через 6 сек (если не пришло обновление)
  - Отправка своего typing: `client.invoke(SetTyping)` при вводе с debounce 3 сек
- **Read receipts** (собеседник прочитал / мы прочитали):
  - Raw updates `UpdateReadHistoryInbox` / `UpdateReadChannelInbox` → emit `tg:read`
  - Store сбрасывает `unreadCount` до реального `stillUnreadCount`
  - Чаты в списке имеют правильные счётчики после прочтения на телефоне

### v0.87.13 (15 апреля 2026) — FIX три бага: пагинация + аватарки не видны + Native фильтр в log-viewer
- **Баг 1 — 194 чата вместо всех**:
  - В логах: `первая страница: 194 чатов`. Условие `firstPage.length >= PAGE (200)` → `false` → фоновая загрузка **не запускалась**.
  - **Причина**: GramJS часто возвращает МЕНЬШЕ чем limit — это нормально. Но мой код считал «меньше limit = конец».
  - **Фикс 1**: триггер фоновой загрузки если `firstPage.length > 50` (порог).
  - **Фикс 2**: в `loadRestPagesAsync` стоп ТОЛЬКО при `page.length === 0` (пустой массив), а не `< PAGE`. Максимум до 30 итераций.
- **Баг 2 — аватарки на диске есть (44 файла), но в UI не видны**:
  - **Причина**: в react-window `rowComponent` был **inline** функцией внутри InboxMode. React воссоздавал её при каждом рендере, но react-window сохранял ссылки по index → чаты обновлялись в массиве, но строка не перерисовывалась.
  - **Фикс**: вынесен отдельный компонент `ChatRow` (снаружи InboxMode), принимает `chats`, `activeChatId`, `setActiveChat` через `rowProps`. react-window теперь правильно реагирует на изменения props.
- **Баг 3 — нет фильтра «⚡ Native» в окне логов**:
  - **Причина**: Окно логов — это **отдельный HTML файл** `main/log-viewer.html` (не React компонент!). Мой фикс в `LogModal.jsx` не влияет — это другой window.
  - **Фикс**: добавлен `<button data-f="native">⚡ Native</button>` в log-viewer.html + фильтр в функции `render()` по regex `/\[tg\]|\[startup|\[native\]/`.
- Ловушка 71 — окно логов это отдельный HTML, не React. Любые изменения делать в `log-viewer.html` напрямую.

### v0.87.12 (15 апреля 2026) — FIX autoRestore + ускорение загрузки + 5 UI улучшений
- **Баг 1**: после перезапуска программы просит войти заново — session НЕ восстанавливается.
  - **Причина**: `autoRestoreSession()` вызывался сразу в `initTelegramHandler()`. В этот момент `mainWindow.webContents` ещё **загружается** (renderer бандл не готов) → `emit('tg:account-update')` терялся.
  - **Фикс**: новая функция `startRestore()` — проверяет `win.webContents.isLoading()`, ждёт `did-finish-load` + 500мс задержки → только потом вызывает `autoRestoreSession()`. Это Ловушка 65 вторая волна (mainWindow есть, но renderer не готов).
- **Баг 2**: загрузка чатов 1+ минута.
  - **Причина**: цикл пагинации 20×200 = 4000 чатов делался **до** emit в UI. Пользователь видел `Чатов: 0, Загрузка...` всё время.
  - **Фикс**: первая страница (200) отправляется в UI **сразу** (~1 сек). Остальные — фоном через `loadRestPagesAsync()` + `emit('tg:chats', { append: true })`. Store добавляет без дублей (Set по id).
- **Улучшение 1 — Виртуальный скролл**: `npm install react-window`. InboxMode использует `<List rowCount rowHeight={64} rowComponent>`. При 10000 чатов рендерится только видимые ~15 строк. Плавный скролл, минимум памяти.
- **Улучшение 2 — Поиск**: `<input>` сверху списка с фильтром по title и lastMessage. Счётчик `💬 10 найдено из 256`.
- **Улучшение 3 — Infinite scroll**: уже работает через `append: true` — страницы приходят постепенно, UI их добавляет.
- **Улучшение 4 — Иконки типов**: 👤 для user, 👥 для group, 📢 для channel, 🤖 для ботов. Галочка ✓ синяя для verified аккаунтов.
- **Улучшение 5 — Онлайн-статус**: зелёный кружочек 12×12 снизу-справа аватарки для пользователей с `UserStatusOnline`. В шапке чата отображается `● онлайн`.
- **Рефакторинг**: `ChatListItem.jsx` вынесен из InboxMode (~70 строк) — прошли лимит 600.
- Ловушка 70 — autoRestore должен ждать renderer, не только mainWindow.

### v0.87.11 (15 апреля 2026) — Полная загрузка чатов + аватарки
- **Проблема 1**: `client.getDialogs({ limit: 100 })` возвращал первую страницу — у пользователя было видно ~4 чата из сотен.
  - **Фикс**: пагинация по 200 штук, цикл до 20 страниц (до 4000 чатов). Каждая страница использует `offsetDate`/`offsetId`/`offsetPeer` последнего элемента предыдущей. Стоп когда `page.length < PAGE`. Лог `getDialogs загружено N чатов`.
- **Проблема 2**: у чатов не было аватарок — только пустые места с именами.
  - **Фикс**: асинхронная загрузка `loadAvatarsAsync()`:
    - Папка кеша `%APPDATA%/ЦентрЧатов/tg-avatars/{rawId}.jpg`
    - Для каждого чата (первые 100): проверка `entity.photo && !photoEmpty`
    - Если в кеше — сразу emit `tg:chat-avatar` с путём `file://...`
    - Иначе `client.downloadProfilePhoto(entity, { isBig: false })` → запись на диск → emit
    - Не блокирует UI — выполняется параллельно после возврата `getDialogs`
  - **Store**: новый handler `tg:chat-avatar` обновляет `chat.avatar` в state.
- **UI InboxMode**:
  - Круглая аватарка 44×44px слева от имени чата
  - Если аватарки нет — цветной круг с инициалами (2 буквы из имени), цвет стабильный по hash имени (7 цветов Telegram-стиля)
  - Счётчик `💬 Чатов: N` сверху списка
  - Бейдж непрочитанных: `999+` если больше 999
- Ловушка 69 — не использовать single getDialogs без пагинации для production.

### v0.87.10 (15 апреля 2026) — FIX зависания + спиннеры + Native фильтр в логах + AuthFlow тесты
- **Симптом**: ввёл код → "Проверка..." висит. В логах: `emit step=password`, `askPassword + emit step=password` — server переключил на пароль, а UI не показал.
- **Причина 1 — двойной Promise в IPC**: `tg:login-code` создавал второй Promise (`_codeReply`) который ждал когда GramJS подтвердит. Если ANY часть зависала — handler никогда не резолвился → UI висел.
  - **Фикс**: упрощён IPC — `tg:login-code` сразу возвращает `{ ok: true }` после передачи кода в `pendingLogin.codeResolve`. Реальный результат (success / 2FA / error) приходит через `tg:login-step` events.
- **Причина 2 — `optimisticStep` блокировал серверный step**: при handlePhone я ставил `optimisticStep='code'`, и `step = optimisticStep || serverStep` всегда давал 'code', даже когда server emit'ил `step=password`.
  - **Фикс**: новая логика приоритета — `SERVER_PRIORITY = ['phone', 'code', 'password', 'success']`. Если серверный step **продвинутее** optimistic — берём server. Если меньше — optimistic.
- **Новое — emit step=success**: после `client.start().then()` явный сигнал в UI, потом `null` через 200мс. LoginModal автоматически закрывается через `onClose()` на step=success.
- **Спиннеры (5 совет)**: CSS `.native-spinner` 12×12px анимация rotate 0.7s linear infinite. Используется в «Отправляем код в Telegram...» и «Проверка...».
- **Подсказка про 2FA (4 совет)**: на экране code если нет ошибки и не waiting — показывается `.native-hint` синяя плашка «💡 Если у вас включена двухфакторная защита — после кода появится экран ввода пароля».
- **Native фильтр в LogModal (5 совет про лог)**: добавлена кнопка «⚡ Native» — фильтрует строки с `[tg]`, `[startup`, `[native]` — видно только нашу разработку.
- **AuthFlow тесты (1 совет)**: новый `AuthFlow.vitest.jsx` — 6 сценариев с mock IPC: phone→code, 2FA, FLOOD_WAIT, неверный код, success, server step перебивает optimistic.
- Ловушка 68 в common-mistakes.md: правило про optimisticStep ↔ serverStep.

### v0.87.9 (15 апреля 2026) — FIX: зависание после ввода кода (recoverable ≠ fatal)
- **Симптом**: пользователь ввёл код, нажал «Проверка» → висит «Проверка...» бесконечно.
- **Логи**: `14:27:02 SESSION_PASSWORD_NEEDED` + `Error while trying to reconnect`. То есть пришёл сигнал «нужен 2FA», GramJS начал переподключение.
- **Причина**: в v0.87.8 я добавил `client.disconnect() + destroy()` на ЛЮБУЮ ошибку. SESSION_PASSWORD_NEEDED — это НЕ ошибка, это штатный сигнал от Telegram «нужен облачный пароль». GramJS в ответ должен был вызвать наш callback `password: async () => askPassword()`. Но я убил client — callback не вызвался — UI завис.
- **Фикс**: разделение ошибок на **recoverable** (не рушить client) и **fatal** (остановить).
  - **Recoverable** (не трогаем client): `SESSION_PASSWORD_NEEDED`, `PHONE_CODE_INVALID`, `PASSWORD_HASH_INVALID`, `PHONE_CODE_EMPTY` — GramJS сам попросит callback снова.
  - **Fatal** (рушим client): `FLOOD_WAIT`, `PHONE_NUMBER_INVALID`, `PHONE_NUMBER_BANNED`, `USER_DEACTIVATED`, network errors.
- **Дополнительно**: в `.catch()` блока `client.start().then().catch()` — если приходит `SESSION_PASSWORD_NEEDED` как exception (некоторые версии GramJS так делают), эмулируем `emit step=password` вручную → UI переключается на экран пароля, клиент остаётся живым.
- Теперь: ввод кода → при необходимости 2FA → UI автоматически переключается на экран пароля.

### v0.87.8 (15 апреля 2026) — КРИТИЧНО: остановка GramJS retry + live countdown
- **Катастрофа в логах v0.87.7**: после первого FLOOD_WAIT GramJS `client.start()` **автоматически повторял** `auth.SendCode` по несколько раз в секунду. Каждый повтор = новый запрос = **мы САМИ флудили Telegram**. За 4 секунды — 20+ попыток, FLOOD_WAIT раскручивался до 5 минут и больше.
- **Причина**: `client.start()` имеет встроенный retry-механизм. При вызове `phoneNumber: async () => phone` он повторно пытается отправить код при ошибках. Мой `onError` только показывал ошибку в UI, но **не останавливал client**.
- **Фикс 1**: в `onError` после emit — **немедленно** `client.disconnect()` + `client.destroy()` + `client = null` + `pendingLogin = null`. Это останавливает retry-цикл.
- **Фикс 2**: извлечение `waitSeconds` из ошибки → emit `waitUntil: Date.now() + waitSeconds * 1000` → renderer видит точное время разблокировки.
- **Фикс 3 (UI)**: новый `useEffect` с `setInterval(1000)` — live countdown «⏱ Осталось: 4:58» обновляется каждую секунду. Кнопка «Получить код» заблокирована с текстом «Подождите 4:58» пока countdown > 0.
- **Фикс 4 (UI)**: при любой ошибке `setOptimisticStep(null)` — UI больше не висит на «⏳ Отправляем код...».
- Теперь: 1 клик = 1 попытка. FLOOD_WAIT отображается с таймером, пользователь видит когда можно попробовать снова.

### v0.87.7 (15 апреля 2026) — FLOOD_WAIT перевод + React Testing Library + pre-commit + CI
- **Проблема 1**: ошибка `A wait of 297 seconds is required (caused by auth.SendCode)` показывалась на английском.
  - **Причина**: мой regex искал формат `FLOOD_WAIT_NNN`, а GramJS сейчас возвращает в формате `A wait of NNN seconds is required`.
  - **Фикс**: добавлены 2 новых regex в `translateTelegramError` — `/A wait of (\d+) seconds is required/i` и `/wait of (\d+) seconds/i`. Перевод теперь: «⏱ Слишком много попыток. Подождите 5 минут и попробуйте снова. Telegram временно блокирует новые коды с этого номера, чтобы защитить аккаунт.»
- **Проблема 2**: тесты не ловили React runtime ошибки (как v0.87.5 «Cannot access before init»).
  - **Фикс**: установлены `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `happy-dom`, `vitest`, `@vitest/ui`.
  - Создан `vitest.config.mjs` с environment=happy-dom. Включает файлы `*.vitest.jsx` / `*.vitest.js`.
  - Написан первый runtime-тест `src/native/components/LoginModal.vitest.jsx` — 5 тестов: рендер phone/code/password, sticky error, клик «Получить код» вызывает startLogin.
  - Добавлены npm-скрипты: `npm run test:vitest` (одиночный запуск), `test:vitest-watch` (dev mode).
  - Vitest подключён в основной `npm test` pipeline перед `electron-vite build`.
- **Проблема 3**: pre-commit hook только ESLint — тесты не запускались, коммиты с багами проходили.
  - **Фикс**: hook `scripts/hooks/pre-commit` расширен — после ESLint запускает быстрые тесты (hookOrder, componentScope, fileSizeLimits, appStructure). При падении — блокирует коммит. `--no-verify` для обхода (не рекомендуется).
- **Проблема 4**: CI (GitHub Actions) запускал только `npm test` (последовательно, долго).
  - **Фикс**: `.github/workflows/test.yml` — добавлен отдельный шаг «Vitest (React components)» перед `npm test`. Если упадёт React — CI упадёт раньше с понятной причиной, не запуская все 24+ статические тесты и e2e.

### v0.87.6 (15 апреля 2026) — FIX React hook order + новый тест hookOrder
- **Симптом**: «Ошибка рендера: Cannot access 'optimisticStep' before initialization» в LoginModal.
- **Причина**: в v0.87.5 `useState([optimisticStep])` объявлен на строке 23, а использовался на строке 12 (выражение `step = optimisticStep || ...`). React правило: все `useState` должны быть объявлены в одинаковом порядке в начале компонента.
- **Почему тесты не поймали**: все существующие тесты **статические** (grep файлов, парсинг строк, лимиты размеров). Нет Jest / React Testing Library — React компоненты не рендерятся в тестах. `electron-vite build` компилирует синтаксис, но не выполняет хуки.
- **Фикс 1**: все useState перенесены на самый верх компонента в одном порядке.
- **Фикс 2 (защита на будущее)**: создан **новый тест** `src/__tests__/hookOrder.test.cjs` — статический анализатор:
  - Идёт по всем `.jsx` и `.js` в `src/components`, `src/native`, `src/hooks`, `src/App.jsx`
  - Находит все `const [x] = useState()` / `useRef()` / `useMemo()` / `useCallback()` / `useReducer()`
  - Для каждой переменной проверяет что первое использование идёт **после** объявления (учитывая комментарии и строки)
  - Ловит классическую ошибку «Cannot access X before initialization» **до запуска программы**.
- Подключён в `npm test` pipeline после `componentScope`.

### v0.87.5 (15 апреля 2026) — UX авторизации: мгновенный переход, sticky ошибки, перевод, красивые кнопки
- **Проблема 1**: после клика «Получить код» UI висел на экране ввода номера 5-15 сек (пока GramJS делал запрос к серверам) — можно было нажать кнопку 5 раз подряд.
  - **Фикс**: `optimisticStep='code'` в LoginModal — UI переключается **мгновенно** при клике. Поле кода disabled с надписью «⏳ Отправляем код в Telegram...» пока GramJS не готов.
- **Проблема 2**: после неверного пароля 2FA ошибка показывалась 1 секунду и исчезала.
  - **Причина 1**: `client.start().catch()` эмитил `step: 'phone'` — UI переключался на экран номера, ошибка «терялась».
  - **Причина 2**: `localError` сбрасывался при размонтировании, `serverError` перезаписывался новым `tg:login-step`.
  - **Фикс 1**: handler сохраняет текущий шаг (`password`/`code`/`phone`) при эмиссии ошибки — UI остаётся где был.
  - **Фикс 2**: sticky error через `useState('')` + `useEffect` — ошибка НЕ исчезает автоматически, только при клике действия или смене ввода пользователем.
- **Проблема 3**: ошибки были на английском и с техническими кодами (`PHONE_CODE_INVALID`, `SESSION_PASSWORD_NEEDED`, etc).
  - **Фикс**: функция `translateTelegramError()` в telegramHandler — переводит 17 типичных ошибок на понятный русский с инструкцией что делать. Флуд-wait автоматически переводится в «N секунд / N минут / N часов».
- **Проблема 4**: «дёрганые» кнопки (резкая смена цвета на hover).
  - **Фикс**: полностью переписаны стили `.native-btn`:
    - `transition: 0.2s ease` на background/transform/shadow
    - Hover: +`translateY(-1px)` + сине-голубой glow `rgba(42,171,238,0.25)`
    - Active: `scale(0.98)` + мгновенный отклик (0.05s)
    - Ripple-эффект (белая волна при клике через `::after`)
    - `focus-visible` outline для клавиатурной навигации
  - Ошибка теперь с иконкой ⚠️ и анимацией «тряски» при появлении.

### v0.87.4 (15 апреля 2026) — Критический FIX авторизации Telegram (3 бага)
- **Симптом v0.87.3**: кнопка «Получить код» → ничего не происходит, второй клик → «Авторизация уже в процессе».
- **Баг 1 (главный)**: `initTelegramHandler` вызывался ВНУТРИ app.whenReady ДО `createWindowFromManager`. В этот момент `mainWindow = null` → handler сохранял в `mainWindowRef = null` → все `emit()` шли в никуда → UI никогда не получал `tg:login-step { step: 'code' }`.
  - **Фикс**: перенесён вызов `initTelegramHandler` ПОСЛЕ `createWindowFromManager`. Плюс перешли с прямой ссылки на функцию `getMainWindow: () => mainWindow` — даёт актуальный mainWindow в момент emit.
- **Баг 2**: `startLogin()` в начале делал `emit('tg:login-step', { step: 'phone' })` — перезаписывал шаг в store на `phone` (и так уже шаг phone → UI оставался на вводе номера). Убран этот первый emit — step меняется только по вызову askCode/askPassword.
- **Баг 3**: в `nativeStore.js` cleanup функция вызывала `window.api.off(channel)` без callback → не работало (preload требует callback). Перешли на возвращаемую `on()` функцию отписки (preload её возвращает).
- **Добавлены детальные логи** в telegramHandler: emit channel, askCode, askPassword, client.start() calling, client asked phoneNumber/phoneCode/password, client.start SUCCESS — чтобы в будущем моментально находить где встал flow.
- Документация: Ловушка 65 в common-mistakes.md — «init handlers, использующие mainWindow, ДО создания окна → emit в никуда».

### v0.87.3 (15 апреля 2026) — Реальный GramJS — авторизация + чаты + отправка
- **Установлено**: `npm install telegram input` (GramJS v2.26.22 + input). `better-sqlite3` пока не ставим — session храним в обычном файле, база SQLite отложена до Шага 3.
- **telegramHandler.js полностью переписан** с STUB на реальный GramJS:
  - api_id=8392940, api_hash вшит в коде
  - `startLogin(phone)` → создаёт `TelegramClient` с `StringSession('')` → вызывает `client.start({ phoneNumber, phoneCode, password, onError })`
  - `phoneCode` и `password` — промисифицированные колбеки, которые ждут ввод от UI через IPC
  - После успеха: `client.session.save()` в `%APPDATA%/ЦентрЧатов/tg-session.txt`
  - `client.getMe()` → заполняет `currentAccount { id, name, phone, username, status: 'connected' }` → emit `tg:account-update`
  - `attachMessageListener()` — подписка на `NewMessage` event GramJS → emit `tg:new-message`
- **autoRestoreSession()** — при старте main-процесса читает `tg-session.txt`, если есть — автоподключение без повторного логина
- **IPC реализация**:
  - `tg:get-chats` → `client.getDialogs({ limit: 100 })` → маппинг в единый формат → emit `tg:chats`
  - `tg:get-messages` → `client.getMessages(chatId, { limit: 50 })` → emit `tg:messages`
  - `tg:send-message` → `client.sendMessage(chatId, { message: text })`
  - `tg:remove-account` → `client.disconnect()` + удаление session-файла
- **UI**: создан `src/native/modes/InboxMode.jsx` (205 строк) — полный 2-колоночный layout:
  - Слева: список чатов (320px), сортировка по lastMessageTs desc, бейджи непрочитанных, hover-эффект
  - Справа: шапка чата + лента сообщений (бубл вправо/влево) + поле ввода + кнопка отправки
  - Отправка по Enter, Ctrl+Enter, или кликом
  - Автозагрузка чатов при появлении аккаунта, автозагрузка сообщений при выборе чата
- **NativeApp.jsx** — подключён InboxMode для режима `inbox` (другие режимы пока заглушки)

### v0.87.2 (14 апреля 2026) — Логи запуска для диагностики долгой загрузки
- **Симптом**: после v0.87.1 (warm-up удалён, native_cc фильтр) пользователь сообщает что всё ещё долго стартует.
- **Диагностика**: добавлены тайминги:
  - `[startup-main]` в main.js: app.whenReady → logger init → createWindow → mainWindow created → did-finish-load → dom-ready
  - `[startup]` в App.jsx (renderer): useEffect start → messengers:load → settings:get → app:get-paths → Promise.all done → appReady=true
  - Тайминги пишутся через `app:log` в основной chatcenter.log + console
- **STUB telegramHandler**: при «Получить код» возвращает понятную ошибку (раньше показывался успех + переход на шаг кода). Теперь кнопка покажет красное сообщение «GramJS не установлен. npm install telegram input better-sqlite3».
- Когда пользователь перезапустит — увидим в логах где именно тормозит (main vs renderer, какой IPC долго отвечает).

### v0.87.1 (14 апреля 2026) — FIX долгая загрузка / пустой экран после v0.87.0
- **Симптом**: после установки v0.87.0 при запуске приложения окно открывается, но 7-15 секунд **полностью пустое** (нет вкладок, нет контента).
- **Причина 1 — warm-up**: hook `useWebViewLifecycle` при старте перебирал все вкладки по 1.5 сек × N штук. У пользователя 5 вкладок + новая native_cc = 9-10 секунд "пустого" экрана. Warm-up был добавлен в v0.86.6 для решения чёрного экрана Telega Avtoliberty, но Ловушка 64 показала что он не помогает. Цена слишком высокая.
- **Причина 2 — мусор в storage**: `native_cc` вкладка попала в `chatcenter.json` через `messengers:save` (при первом изменении списка). Это виртуальная вкладка, она программно добавляется при старте — не должна сохраняться. Сохранение делало её "обычной" → бесконечное накопление.
- **Фикс**:
  - **useWebViewLifecycle.js** — warm-up удалён (оставлен только health-check). Прогрев был неэффективен и блокировал UI.
  - **main.js** `messengers:save` — фильтр `m.isNative && m.id !== 'native_cc'` перед сохранением.
  - **App.jsx** при `messengers:load` — фильтрация `native_cc` из загруженного списка (защита от уже испорченного storage). Native_cc добавляется ВСЕГДА в конец списка программно.
  - **Очистка chatcenter.json** — удалена дублирующая запись native_cc вручную (бэкап в `chatcenter.json.bak-v087`).
- Тесты: всё зелёное.

### v0.87.0 (14 апреля 2026) — Запуск нативного режима «ЦентрЧатов» (шаг 1)
- **Что это**: новая вкладка в TabBar «ЦентрЧатов» (id=`native_cc`) — собственный UI для Telegram (+ потом WA/VK/MAX) через нативные API, минуя WebView. Альтернатива WebView-вкладкам, не заменяет их (старые остаются рабочими).
- **Мотивация**: Ловушка 64 — WebView Telegram чёрный экран на чатах с файлами. Решение — уйти от WebView к GramJS (MTProto клиент).
- **Структура** (шаг 1 — скелет без реального GramJS, ждёт `npm install telegram`):
  - `src/native/NativeApp.jsx` — корневой компонент с header + sidebar аккаунтов + модусы
  - `src/native/styles.css` — AMOLED тема (#000 фон, #2AABEE акцент), изолирована через `.native-mode`
  - `src/native/config.js` — api_id=8392940, api_hash вшит (ChatCenter app на my.telegram.org)
  - `src/native/store/nativeStore.js` — React hook-store для accounts/chats/messages + IPC подписки
  - `src/native/components/LoginModal.jsx` — 3 экрана: phone → code → 2FA
  - `main/native/telegramHandler.js` — IPC handlers (пока STUB: tg:login-start/code/password/cancel, tg:get-chats, tg:get-messages, tg:send-message, tg:remove-account)
- **Интеграция**: в App.jsx добавлен `NATIVE_CC_TAB` который добавляется к списку мессенджеров при старте; в цикле рендера — если `m.isNative` → `<NativeApp />` вместо `<webview>`.
- **Режимы UI** (в разработке): Inbox / Contacts / Kanban — переключаются в header. Сейчас только скелет с empty-state.
- **Дальше**: `npm install telegram better-sqlite3` → подключение GramJS → реальный login → загрузка чатов → Inbox UI.

