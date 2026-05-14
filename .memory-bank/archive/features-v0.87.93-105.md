# Архив changelog: v0.87.93 – v0.87.105

**Заархивировано**: 2026-05-13 (вместе с релизом v0.88.2).
**Источник**: `.memory-bank/features.md` — корневой файл вырос до 102 КБ (> 100 КБ лимит). Старые версии вынесены сюда.
**Период**: 13 версий, охватывают login flow, multi-account для native Telegram, разбиение крупных файлов.

Для чтения по этому периоду — открыть этот файл. В корневом `features.md` остаются только последние активные версии (v0.87.106+).

---

### v0.87.105 — Реализация multi-account для нативного Telegram (Шаг 2.5)

**Контекст**: в v0.87.104 задокументирован план (ADR-016 + Шаг 2.5). В этой версии — полная реализация согласно плану, без отступлений.

**UX согласно Варианту B** (выбрано в обсуждении):

```
┌──────┬─────────────────────────────────────┐
│ ●BН  │  [Все] [BНК] [Avtoliberty]          │  ← фильтр (при 2+ аккаунтах)
│ ●AV  │  ──────────                          │
│ ───  │  🔍 Поиск по чатам                   │
│  +   │  ──────────                          │
│      │  💬 458 чатов                        │
│      │  ──────────                          │
│      │  [BН] OZONовая Дыра (999+)           │  ← цветной бейдж аккаунта
│      │  [AV] Иванов клиент (3)              │
│      │  [BН] Эксплойт ✓ (25)                │
│      │  [AV] Заявка #12345 (1)              │
│      │  ...                                 │
└──────┴──────────────────────────────────────┘
```

**Backend (8 файлов)**:

1. **`telegramState.js`** — `state.clients: Map<accountId, TelegramClient>`, `state.accounts: Map<accountId, NativeAccount>`, `state.activeAccountId`, `state.sessionsDir`. Backward-compat алиасы `state.client` / `state.currentAccount` указывают на активный. Helpers: `accountIdFromChat(chatId)`, `getClientForChat(chatId)`, `getAccountForChat(chatId)`, `registerAccount(id, client, account)`, `setActiveAccount(id)`, `unregisterAccount(id)`.

2. **`telegramAuth.js`** — `startLogin` создаёт ЛОКАЛЬНЫЙ `newClient` (не `state.client`). После success → `registerAccount(accountId, newClient, account)`, `attachMessageListener(newClient, accountId)`. Сохранение в `tg-sessions/{accountId}.txt`. При login fail — уничтожаем только локальный newClient, существующие в state.clients не задеваем.

3. **`telegramAuth.js → autoRestoreSessions`** — сканирует `tg-sessions/` и восстанавливает все. Для каждого: `restoreOneSession(sessionStr, accountId)` → `registerAccount` → `attachMessageListener`.

4. **`telegramAuth.js → migrateLegacySession`** — при первом запуске v0.87.105 читает старый `tg-session.txt`, делает `getMe()`, переносит в `tg-sessions/{id}.txt`, удаляет старый.

5. **`telegramHandler.js`** — `state.sessionsDir = path.join(userData, 'tg-sessions')` + `mkdirSync`. Вызов `autoRestoreSessions` (новое имя). Старый `autoRestoreSession` остался как backward-compat alias.

6. **`telegramMessages.js`** — `attachMessageListener(client, accountId)` параметризован. Все handlers (`tg:send-message`, `tg:get-messages`, `tg:edit-message`, `tg:delete-message`, `tg:forward`, `tg:send-file`, `tg:send-clipboard-image`) маршрутизируют через `getClientForChat(chatId)`.

7. **`telegramChatsIpc.js`** — все handlers через `getClientForChat`. `tg:get-chats` принимает `args.accountId` (если не передан — итерирует по всем `state.clients`). `tg:remove-account` принимает `args.accountId` (per-account wipe; full wipe только если последний). `tg:get-cached-chats` читает все `tg-cache-{accountId}.json`.

8. **`telegramChats.js`** — `mapDialog(d, accountId)`, `saveChatsCache(chats, accountId)` (per-account кэш), `loadAvatarsAsync(dialogs, accountId)`, `loadRestPagesAsync(firstPage, client, accountId)`. `fetchAllUnreadUpdates` итерирует по всем `state.clients`.

9. **`telegramMedia.js`** — `download-video` / `download-media` через `getClientForChat`.

**Renderer (4 файла)**:

10. **`store/nativeStore.js`** — добавлено `chatFilter: 'all'` в `DEFAULT_STATE`, callback `setChatFilter`. `loadChats` без аргумента (multi-account default).

11. **`store/nativeStoreIpc.js`** — `tg:account-update` `removed: true` при `isLast=false` точечно удаляет ТОЛЬКО чаты/сообщения этого аккаунта (фильтрация по prefix accountId в chatId), остальные аккаунты сохраняются.

12. **`components/InboxChatListSidebar.jsx`** — фильтр-кнопки `[Все] [Account1] [Account2]` сверху (показываются при 2+ аккаунтах). Бейджи аккаунтов передаются в `ChatRow → ChatListItem`.

13. **`components/ChatListItem.jsx`** — рендер инициалов аккаунта (accBadge) слева от иконки чата.

14. **`modes/InboxMode.jsx`** — фильтр чатов через `store.chatFilter` (по умолчанию 'all'). `loadChats()` без аргумента.

**Тесты**:

- **`src/__tests__/multiAccount.test.cjs`** — новый, 42 проверки (state, helpers, auth, handler, IPC routing, mapDialog, UI chatFilter, sidebar buttons, account badge).
- Добавлен в `scripts/hooks/pre-push` и `package.json:scripts.test`.

**Миграция данных**:

При первом запуске v0.87.105 — `migrateLegacySession()`:
1. Если `tg-session.txt` существует — читаем, `getMe()`, перемещаем в `tg-sessions/{accountId}.txt`, удаляем старый.
2. Если миграция упала — старый файл оставляем (резерв на следующий запуск).

**Что юзер увидит**:

- Один аккаунт — UI как раньше (фильтр-кнопки скрыты, бейджи аккаунта не показываются).
- Два аккаунта — фильтр сверху + бейджи `[BH]` / `[AV]` слева в каждом чате.
- Logout одного из двух — второй продолжает работать, его чаты/сообщения остаются.
- При перезапуске оба аккаунта восстанавливаются автоматически.

**Что НЕ задето** (поведение сохранено):
- Login flow (phone → code → 2FA), CodeInput, CountryPicker
- Send/edit/delete/forward сообщений
- Markread, pin, typing, аватарки, медиа
- Kanban / Контакты / AI-помощник
- WebView вкладки (Telegram Web БНК / Avtoliberty работают по-старому через `app:register-webview` v0.84.0)

**Pre-push pipeline**: 32 cjs-тестов (был 31) + vitest 143/143 + lint 0 ошибок.

---

### v0.87.104 — План multi-account для нативного Telegram (документация)

**Контекст**: Пользователь сообщил баг — при добавлении второго Telegram-аккаунта в native режим первый исчезает. Расследование показало:

1. `state.client` / `state.currentAccount` / `state.sessionPath` — singleton (один на процесс)
2. UI (`nativeStore.js: accounts: []`) **уже** массив — поддержка multi заложена
3. План `native-mode-plan.md` в архитектуре (`accountId` поле, sidebar, SQL accounts table) тоже подразумевает multi-account
4. **Конкретный шаг реализации был упущен** — Шаг 2 описал MVP с одним файлом сессии

При login второго аккаунта пересоздаётся `state.client`, перезаписывается `tg-session.txt` → первый аккаунт навсегда теряется.

**Что задокументировано в этой версии**:

1. **`decisions.md` → ADR-016**: полное архитектурное решение
   - State refactor (Map вместо singleton)
   - Сессии — отдельный файл на аккаунт (`tg-sessions/{id}.txt`)
   - IPC контракт (маршрутизация по `chatId.split(':')[0]`)
   - UI единая лента (Вариант B)
   - autoRestoreSession — сканирование папки
   - Миграция старого `tg-session.txt`
   - 5 явных ловушек чтобы не повторить
   - Список 12 затрагиваемых файлов

2. **`native-mode-plan.md` → Шаг 2.5**: пошаговая реализация
   - Backend: 8 файлов (`telegramState`/`telegramAuth`/`telegramHandler`/`telegramChats`/`telegramChatsIpc`/`telegramMessages`/`telegramMedia`/`telegramCleanup`)
   - UI: 4 файла (`nativeStore.js`/`nativeStoreIpc.js`/`InboxChatListSidebar.jsx`/`LoginModal.jsx`)
   - Тесты — какие создать/обновить
   - Код миграции при первом запуске v0.87.104
   - ASCII-мокап финального UI с фильтр-кнопками и цветными бейджами

**Выбранная UX-схема**: единая лента (Вариант B) — все чаты со всех аккаунтов в одном scroll, отсортированы по времени, цветной бейдж аккаунта слева, фильтр-кнопки «Все / БНК / Avtoliberty» сверху. Звук+ribbon на ВСЕ аккаунты с лейблом аккаунта.

**Почему именно Вариант B (не A «как Telegram Desktop»)**: целевая аудитория плана — «1-5 операторов» (`native-mode-plan.md` строка 410). Оператор не должен переключать контекст между аккаунтами весь день. Единая лента + фильтр на случай нужды сосредоточиться.

**Реализация**: следующая итерация (v0.87.105+). Текущая версия только документирует план чтобы не упустить снова.

**Что уже работает (не требует доработки)**:
- WebView multi-account через `app:register-webview` (v0.84.0) — две вкладки Telegram (БНК, Avtoliberty) в верхней панели работают штатно
- UI для нескольких аккаунтов (`nativeStore.js: accounts: []` массив, sidebar мини-иконок)
- IPC контракт `tg:account-update { id, ... }` — добавляет в массив, не заменяет
- Формат `chatId = {accountId}:{chatNumericId}` уже используется (готов к маршрутизации)

**Что не работает (требует Шага 2.5)**:
- Native-режим (нативный Telegram через GramJS) поддерживает только ОДНУ сессию

---

### v0.87.103 — Разбиение 5 файлов на 80%+ от лимита

**Контекст**: тест `fileSizeLimits` показывал 5 файлов на 80–95% от лимита. При следующих фичах они бы пробили потолок, поэтому разбиваем сейчас.

**Что разбито**:

| Файл | До | После | Куда вынесено |
|---|---|---|---|
| `src/native/modes/InboxMode.jsx` | 567 (95%) | **391** | `components/InboxChatPanel.jsx` (~210 строк JSX окна чата) |
| `main/native/telegramChats.js` | 475 (95%) | **217** | `telegramChatsIpc.js` (~270 строк, все `ipcMain.handle('tg:*')`) |
| `src/native/store/nativeStore.js` | 445 (89%) | **209** | `store/nativeStoreIpc.js` (~250 строк, `attachTelegramIpcListeners` + cache helpers) |
| `main/main.js` | 484 (81%) | **247** | `handlers/mainIpcHandlers.js` (~250 строк, `registerMainIpcHandlers` со всеми app:*/messengers:*/settings:*/tray:*) |
| `src/hooks/useTabContextMenu.js` | 127 (85%) | **88** | `hooks/tabContextMenuDiag.js` был вынесен исторически; в v0.87.133 ручная диагностика отключена из startup graph |

**Принципы разбиения**:
- В каждом случае выделен **самостоятельный логический кусок** (UI рендер, IPC handlers, диагностика).
- Состояние не дублируется — передаётся через `setState` callback или объект deps.
- Импорты и контракты не задеты — тесты `vitest 143/143`, `lint clean`.

**Тесты обновлены под новую структуру** (10 тестов считают content нескольких файлов как объединённый):
- `appStructure.test.cjs` — добавлен `webviewHandleNewMessage.js`
- `storageErrors.test.cjs` — добавлен `mainIpcHandlers.js` + `dockPinState.js`
- `ipcChannels.test.cjs` — добавлены `mainIpcHandlers.js` + `dockPinState.js`
- `mainProcess.test.cjs` — добавлен `mainIpcHandlers.js`, обновлён тест overlayIcon (теперь в trayManager.js + mainIpcHandlers.js)
- `notifHooks.test.cjs` — добавлен `mainIpcHandlers.js`
- `integrationChains.test.cjs` — добавлен `webviewHandleNewMessage.js`, обновлён mainCode
- `smokeTest.test.cjs` — добавлен `mainIpcHandlers.js`

**Финальные результаты**:
- `fileSizeLimits` 199 → **204** проходят (5 новых файлов, ни одного предупреждения 80%+)
- `vitest` 143/143
- `lint` 0 ошибок
- pre-commit static tests: все проходят (storageErrors, componentScope, appStructure, mainImports, mainProcess, smokeTest, integrationChains, notifHooks, ipcChannels, ...)

**Что не задето**: ВСЯ бизнес-логика, IPC контракты, UI поведение, рендер-выводы. Это чистый рефакторинг — функциональность 100% сохранена.

---

### v0.87.102 — CodeInput: 5 отдельных ячеек для кода Telegram

**Контекст**: пользователь сообщил что placeholder `12345` в поле ввода кода непонятен — глаз воспринимает цифры как настоящий код. Стандарт индустрии (Telegram, WhatsApp, банки, 2FA) — отдельные ячейки.

**Что сделано** (`components/CodeInput.jsx` — новый файл, ~95 строк):

- 5 отдельных `<input maxLength={1}>` в ряд, в каждом placeholder `–` (тире)
- `inputMode="numeric"` + `autoComplete="one-time-code"` — на iOS появится клавиатура с цифрами и подсказка кода из SMS
- Цифра введена → авто-focus на следующую ячейку
- `Backspace`: если в ячейке цифра — стираем; если пусто — переходим в предыдущую и стираем там
- Стрелки `←/→` — перемещение между ячейками
- `Paste` — текст из буфера разбивается на цифры и распределяется по ячейкам (юзер копирует «12345» → авто-заполняется)
- `onComplete` callback срабатывает когда все 5 цифр введены → авто-submit
- `Enter` — submit если все цифры есть

**Стили** (`styles-login.css`) — `.code-input` (flex), `.code-input__cell` (48×56px, 24px font, accent-border при focus), `--filled` модификатор когда цифра введена.

**Использование в LoginModal**: заменил `<input type="text" placeholder="12345">` на `<CodeInput length={5} ... />`. Кнопка «Подтвердить» disabled пока `code.length < 5`.

**Тесты обновлены**: `AuthFlow.vitest.jsx` ищет `.code-input__cell` (5 ячеек) вместо `placeholder="12345"`.

**Что не задето**: handleCode, ввод 2FA-пароля, обработка ошибок, переходы между шагами, optimistic UI, countdown.

---

### v0.87.101 — libphonenumber-js + фикс двух багов retry-цикла

**Контекст**: после v0.87.98–v0.87.100 retry-цикл GramJS ВЕРНУЛСЯ когда юзер ввёл 9 цифр для России (вместо 10) — кнопка была активна, номер ушёл в Telegram, начался спам.

**Найдено два бага и причина**:

1. **Frontend пропускал короткие номера**. В `LoginModal.jsx` была проверка `minDigits = nationalDigits - 1` (для России 9 вместо 10). Это «запас на разные форматы» оказался слишком мягким и пропустил неполный номер.

2. **Счётчик попыток `phoneNumber` callback сбрасывался**. В `telegramAuth.js` счётчик хранился в `state.pendingLogin.phoneAttempts`. После первой ошибки `state.pendingLogin = null` → при следующем вызове счётчик `0 + 1 = 1` (а не `2`) → проверка `n > 1` не срабатывала → throw не происходил → retry-цикл GramJS продолжался.

**Решение — libphonenumber-js + closure-счётчик**:

| Слой | Где | Что изменилось |
|---|---|---|
| Валидация frontend | `LoginModal.jsx` | `isValidPhoneNumber('+' + dial + national)` из libphonenumber-js — настоящая проверка формата для каждой страны. Кнопка disabled пока номер реально не валиден. |
| Валидация main | `telegramAuth.js` (handler `tg:login-start`) | Та же `isValidPhoneNumber()` — последний слой защиты. Старая ручная проверка «8-15 цифр» удалена. |
| Счётчик попыток | `telegramAuth.js` (внутри `startLogin`) | Из `state.pendingLogin.phoneAttempts` → в **closure-переменную** `let phoneAttempts = 0`. Не сбрасывается при `state.pendingLogin = null`, живёт пока живёт замыкание. |
| Первая ошибка | `telegramAuth.js` | Аналогично — `let firstError = null` в closure вместо `state.pendingLogin.firstError`. |
| Сообщения юзеру | `LoginModal.jsx` | Конкретно: «Номер слишком короткий: 9 цифр, нужно 10 для России». Раньше было общее «Введи 10 цифр». |

**Зависимость**: `libphonenumber-js` 1.12.42 (~145 KB). Это форк Google libphonenumber для JS, минимальная версия. Используют Telegram Web, WhatsApp Web, Viber.

**Почему именно closure а не state**:
- `state.pendingLogin` сбрасывается на `null` чтобы НОВАЯ авторизация могла стартовать
- Но GramJS внутри ещё может звать наш callback (асинхронно, через retry)
- Если счётчик в state — он 0 → кажется что это первая попытка → разрешаем
- Closure-переменная привязана к КОНКРЕТНОЙ сессии `startLogin()` — она правильно знает «уже было»

**Что не задето**: список 23 стран, CountryPicker, авто-выбор по локали, перевод ошибок Telegram, autoRestoreSession.

---

### v0.87.100 — Фиксы CountryPicker: позиционирование + флаги на Windows

**Проблема 1: dropdown вылезал за нижний край модалки/экрана.**
Когда LoginModal был внизу экрана и юзер кликал picker, список из 23 стран открывался ВНИЗ и выходил за границу окна — крайние пункты списка («Сербия», «Черногория») были недоступны.

**Решение** (`CountryPicker.jsx`):
- При открытии замеряем `wrapRef.current.getBoundingClientRect()` через `useLayoutEffect`
- Если снизу < 340px И сверху больше места → ставим класс `--up`
- В CSS `.country-picker__dropdown--up { top: auto; bottom: calc(100% + 4px) }` — открывается вверх
- Высота списка уменьшена с 280px до 220px (`styles-login.css`)

**Проблема 2: эмодзи-флаги не отображались.**
На Windows стандартный шрифт Segoe UI Emoji **не имеет regional indicator pairs** (это известный косяк системы — Microsoft принципиально не поддерживает). Пары символов вроде `🇷🇺` (U+1F1F7 U+1F1FA) показывались просто как буквы «RU». Это видно на скриншоте пользователя.

**Решение**: компонент `CountryBadge` рисует стилизованный квадратик с ISO-кодом через CSS (gradient + accent-border), выглядит одинаково на всех ОС. Лучше чем сломанный эмодзи. Если в будущем понадобятся реальные флаги — встроить SVG-набор `country-flag-icons` или Twemoji.

**Что НЕ трогали**: список 23 стран, `getDefaultCountry(locale)`, валидация в `LoginModal.jsx`, защита от retry-цикла в `telegramAuth.js`.

---

### v0.87.99 — CountryPicker в LoginModal (выбор страны как в Telegram)

**Контекст**: после v0.87.98 хинт «+ и 8–15 цифр» был непонятен и не учитывал что у разных стран разные форматы. Пользователь попросил picker по образцу Telegram/WhatsApp.

**Что сделано**:

1. **`src/native/data/countries.js`** (новый файл, ~100 строк) — статичный список 23 стран:
   - СНГ: RU, BY, KZ, UA, UZ, AM, GE, AZ, KG, TJ, TM, MD
   - Популярные у мигрантов: TR, DE, IL, US, CY, AE, TH, VN, CN, ME, RS
   - Поля: `code` (ISO), `name` (рус.), `dial` (без +), `flag` (эмодзи), `nationalDigits` (длина без кода)
   - Функция `getDefaultCountry(locale)` — определяет страну по `navigator.language` (RU/BY/UA/KZ → автоматический выбор; иначе fallback на RU)

2. **`src/native/components/CountryPicker.jsx`** (новый файл, ~80 строк) — компонент:
   - Кнопка-триггер `[флаг +код ▾]` слева от input номера
   - Dropdown снизу с поиском (по имени/коду/dial)
   - Закрытие при клике вне (через `mousedown` listener)
   - Активный пункт подсвечен accent-цветом
   - `Esc` закрывает, `Enter` выбирает первый из результата

3. **`src/native/components/LoginModal.jsx`** — переработка:
   - Состояние разделено: `country` (объект) + `nationalNumber` (только цифры без кода)
   - Финальный номер собирается: `'+' + country.dial + nationalNumber` → отправляется в `startLogin`
   - Кнопка disabled пока цифр меньше `country.nationalDigits - 1` (запас на разные форматы)
   - Понятные ошибки: «Введи 10 цифр номера для России»
   - Дефолт при открытии — Россия (для русской локали системы)

4. **`src/native/styles-login.css`** — стили `.country-picker`, `.country-picker__dropdown`, `.country-picker__list`, `.country-picker__item`. Использует `--amoled-*` переменные темы. Анимация `native-menu-fadein` уже была.

5. **`src/native/components/LoginModal.vitest.jsx`** — тесты обновлены под новый API (input принимает только цифры без +, проверка disabled-кнопки).

**Архитектура**: НЕ через API — список встроен в bundle (~3 КБ). Без зависимостей `npm`. Если нужна редкая страна — добавить одну строку в `countries.js`.

---

### v0.87.98 — Фикс бесконечного retry-цикла GramJS при неполном номере

**Симптом** (репорт пользователя): при вводе неполного номера в LoginModal Telegram-авторизации (например `+795213030` вместо полных 11 цифр) программа зависала, а в журнал бесконечно сыпалось:

```
[tg] client asked phoneNumber
[tg] client onError: Cannot send requests while disconnected. Please reconnect.
[tg] emit tg:login-step phone
```

**Причины**:
1. **Нет валидации формата** ни в renderer ни в main — любой текст уходил в GramJS
2. `phoneNumber` callback в `telegramAuth.js:115` **всегда возвращал тот же неполный номер** — каждая попытка GramJS получала тот же мусор
3. `Cannot send requests while disconnected` — не считалась фатальной → `state.client` не уничтожался → внутренний retry-цикл GramJS продолжался
4. Юзеру показывалось **последнее** сообщение об ошибке (`Соединение прервано`) вместо ПЕРВОЙ реальной (`PHONE_NUMBER_INVALID`)

**4 слоя защиты**:

| Слой | Файл | Что делает |
|---|---|---|
| 1. Renderer-валидация | `src/native/components/LoginModal.jsx` | `validatePhoneFormat()` проверяет `+` и 8–15 цифр. Кнопка «Получить код» disabled пока формат не верный. Хинт «+ и 8–15 цифр» под инпутом. Ввод подсвечивается красной рамкой. |
| 2. Main-валидация | `main/native/telegramAuth.js` (handler `tg:login-start`) | Та же проверка ДО `startLogin()` — если плохо, возвращаем error, в GramJS даже не лезем. |
| 3. Счётчик попыток | `phoneNumber` callback в `startLogin` | `state.pendingLogin.phoneAttempts`. После 1-й попытки → `throw new Error('PHONE_NUMBER_INVALID')` → прерывает retry-цикл GramJS. |
| 4. Первая ошибка | `onError` + `.catch` | `state.pendingLogin.firstError` запоминает ПЕРВУЮ ошибку (не SESSION_PASSWORD_NEEDED). При фатальном эмитим именно её через `translateTelegramError`. Флаг `_emitted` подавляет повторные emit чтобы UI не моргал. |

**Что не задето**: успешный flow phone → code → password → success, обработка `SESSION_PASSWORD_NEEDED` / `PHONE_CODE_INVALID` / `FLOOD_WAIT`, autoRestoreSession.

---

### v0.87.97 — Low Priority cleanup: разбиение 4 крупных файлов

Завершён последний пакет «Low Priority» из плана разбиения файлов. Цель — убрать или ужать крупные `KNOWN_EXCEPTIONS`, чтобы автоматический тест размеров покрывал реальные потолки, а не индивидуальные исключения.

**Что разбито**:

1. **`main/pin-dock.html`** 717 → **25 строк**.
   Вынесено: `main/pin-dock.css` (180), `main/pin-dock.js` (511). По паттерну `notification.html` (v0.87.78). В `electron.vite.config.js → copyStaticPlugin` добавлены копии новых файлов в `out/main/` для production. `pin-dock.js` добавлен в `KNOWN_EXCEPTIONS` с потолком 600 (renderer-код для отдельного BrowserWindow, цельный).

2. **`src/native/styles.css`** 776 → **10 строк** (точка входа с `@import`).
   Вынесено в 6 тематических файлов:
   - `styles-base.css` (203) — AMOLED-тема, header, sidebar, аккаунты, main, empty-state
   - `styles-buttons.css` (81) — `native-btn` + ripple + ghost/danger варианты
   - `styles-login.css` (83) — login screen, sticky-ошибка, спиннер, hint
   - `styles-animations.css` (86) — fade-in, popin, slide-in, sheen, shake
   - `styles-messages.css` (235) — bubbles, разделители, ссылки, аватарки, shimmer, glow
   - `styles-overlays.css` (101) — scroll-to-bottom, PhotoViewer, toast

3. **`src/utils/webviewSetup.js`** 589 → **434 строки**.
   Вынесена функция `handleNewMessage` в `webviewHandleNewMessage.js` (178 строк) — обработка одного входящего сообщения: дедуп → strip-sender → viewing-фильтр → звук + ribbon + preview + history + auto-reply. В `KNOWN_EXCEPTIONS` потолок понижен 600 → 500.

4. **`main/handlers/dockPinHandlers.js`** 571 → **326 строк**.
   Вынесен state (`pinItems` Map, `dockState` объект, `pinIdCounter`) и helper-функции (`savePinItems`, `loadPinItems`, `restorePin`, `ensureDockWindow`, `addToDock`, `removeFromDock`, `removePin`, `checkDockVisibility`, `findPinIdByWin`) в `dockPinState.js` (239 строк). В `dockPinHandlers.js` остались только IPC-handlers. Файл **убран из `KNOWN_EXCEPTIONS`** — теперь в стандартном лимите 500 для `main/handlers/`.

**Результат**:
- Тест `fileSizeLimits` 188 → **196** (учитывает все новые файлы)
- `KNOWN_EXCEPTIONS` сокращён на одну запись (`dockPinHandlers.js`)
- Все 4 типа разбиения соответствуют существующим паттернам проекта (HTML+CSS+JS как `notification.html`, factory state как в `useWebViewZoom`)

**Что не задето**: логика поведения, IPC контракты, имена CSS-классов, точки входа в JSX. Все импорты обновлены, тест проходит без warning'ов кроме известных 5 файлов на 80%+ от лимита.

---

### v0.87.96 — Фильтр GramJS TIMEOUT: ERROR → WARN

Проблема: при обычных переподключениях к серверам Telegram (раз в 1-3 часа) в журнале пишется `[ERROR] Error: TIMEOUT at .../telegram/client/updates.js:250`. Это не ошибка приложения, а нормальное сетевое событие, но красный цвет в кнопке «Ошибки» пугает пользователя.

**Что сделано** (`main/utils/logger.js`):
- В патче `console.error` добавлена проверка: если в тексте сообщения есть `Error: TIMEOUT` И в стеке `node_modules/telegram/client/updates` → перенаправить в `writeLog('WARN', ...)` с префиксом `[GramJS reconnect]`
- ERROR-уровень не вызывается → не открывается журнал автоматически (autoOpenLogOnError не срабатывает)
- В журнале сообщение попадает в кнопку «Предупр.» вместо «Ошибки»

**Эффект**:
- Кнопка «Ошибки» в журнале — теперь только настоящие ошибки приложения
- Кнопка «Предупр.» — переподключения GramJS видны как полезный сигнал
- Если случится **настоящая** ошибка — она по-прежнему попадёт в «Ошибки» (фильтр срабатывает только при наличии обоих маркеров: `TIMEOUT` И путь GramJS)

---

### v0.87.95 — Полный выход из аккаунта (Вариант Б): призрак исправлен + предпросмотр + toast

Проблема: после выхода в боковой панели появлялся призрак «Без имени» (синий вопросительный знак). Корень — backend отправлял `emit('tg:account-update', { id: 'self', ... })` с НОВЫМ id вместо старого. UI не находил «self» в списке и ДОБАВЛЯЛ как новый аккаунт.

**Что сделано**:

A) **Backend (telegramChats.js)**:
- Запоминаем `oldId` ДО обнуления `state.currentAccount`
- В `emit('tg:account-update', { id: oldId, removed: true, wipeStats })` — правильный id
- Новый IPC `tg:get-cleanup-stats` — подсчёт что будет удалено (без удаления)
- В `tg:remove-account` — полная уборка через `performFullWipe()` + проверка после (post-wipe verification)

B) **Новый модуль `main/native/telegramCleanup.js`** (~128 строк):
- `collectCleanupStats()` — безопасный подсчёт (для предпросмотра)
- `performFullWipe()` — реальное удаление session + avatars + cache + media + tmp + чистка Map'ов + clearInterval таймера
- 5 категорий: session, avatars, cache, media, tmp
- Возвращает отчёт: `{ totalFiles, totalBytes, byCategory }`

C) **Frontend (nativeStore.js)**:
- Handler `tg:account-update` с флагом `removed: true` — удаляет аккаунт + обнуляет `chats`, `messages`, `activeChatId`, `activeAccountId`, `loadingMessages`, `typing`
- Сохраняет `lastWipe` в state — для toast в UI
- Новая функция `getCleanupStats()` — обёртка IPC

D) **UI (AccountContextMenu.jsx)**:
- При клике «🚪 Выйти из аккаунта» — асинхронно зовётся `getCleanupStats()` для предпросмотра
- В confirm-блоке таблица категорий с количеством файлов и размером (форматировано: `1.4 МБ`, `245 КБ`)
- ИТОГО снизу — общее число файлов и мегабайт
- Загрузка: «Считаем что удалится...» пока IPC отвечает

E) **Toast в NativeApp.jsx**:
- При смене `store.lastWipe` — показывается toast «✅ Аккаунт удалён. Освобождено N МБ»
- Spring-анимация появления (popin), исчезает через 4 секунды

**Контракт**: после успешного выхода в боковой панели **только** кнопка `+ Добавить аккаунт`. Никаких призраков, никаких следов на диске.

---

### v0.87.94 — Умный logger: Error/DOM Event/stack для пустых объектов

**Зачем**: в `chatcenter.log` каждые 40 секунд писалось `[ERROR] {}` (пустой объект). Невозможно понять что за ошибка и откуда. Корень: `JSON.stringify(error)` возвращает `'{}'` потому что `Error.message`/`stack` — non-enumerable. То же для DOM Event.

**Что сделано** (`main/utils/logger.js`):

**A) Новый smartStringify(a)** — заменяет `JSON.stringify` в `writeLog`:
- `Error` → `name: message | STACK: <первые 4 строки>`
- Объект сериализуется в `{}` → пробуем `Object.getOwnPropertyNames` (берём первые 10 не-функций)
- Не-стрингифицируемое → `{stringify-failed: <reason>}`
- Циклические ссылки безопасны

**B) Stack trace для пустых объектов в console.error**:
- Если все args — пустые объекты без enumerable И non-enumerable свойств
- Добавляется `STACK_TRACE: <первые 4 строки текущего стека>`
- Раньше: `[ERROR] {}` → теперь: `[ERROR] {empty-object} STACK_TRACE: at funcName (file.js:42)...`

---

### v0.87.93 — ФИКС аватарки: cc-media:// + размер 80px + ловушка зафиксирована

**Причина проблемы (v0.87.91-92)**: Chromium блокировал `file:///` URL в renderer (DevTools показывал `Not allowed to load local resource: file:///...`). Файл скачан backend'ом (5318 bytes), но не отрисовывался — это базовая security policy браузера: renderer на `http://localhost:5173` не может загружать `file:///`.

**Решение**: использовать готовый `cc-media://` protocol (`main/native/ccMediaProtocol.js`, v0.87.21) — privileged scheme с `bypassCSP: true`. Изменил `loadOwnAvatar()` → возвращает `cc-media://avatars/me_<id>.jpg`.

**Что сделано**:
- `main/native/telegramAuth.js` — `file:///` → `cc-media://avatars/<filename>`
- Убраны диагностические логи (проблема найдена)
- Аватарка 68→80px, padding шапки 14→8/10, gap 12→8 (маленькие отступы от краёв)
- `nativeStore.js` — убран `console.log` (это была ошибка — у проекта свой логер)

**🔴 Ловушка зафиксирована** в `mistakes/electron-core.md` (~80 строк):
- Что НЕЛЬЗЯ: `'file:///' + encodeURI(filepath)` из main в renderer
- Что НАДО: `cc-media://avatars|media|video/<filename>`
- Как диагностировать: `chatcenter.log` через grep, **НЕ DevTools**
- Чек-лист для будущих фич с локальными файлами
