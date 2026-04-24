# Ловушки: кастомные уведомления (Messenger Ribbon)

**Извлечено из** `common-mistakes.md` 24 апреля 2026 (v0.87.54).
**Темы**: Messenger Ribbon BrowserWindow, Notification API перехват, ServiceWorker дубли, enrichment addedNodes, CSS fade-out, FIFO deadlock, Emoji regex, startup ribbon.

---

## 🔴 КРИТИЧЕСКОЕ: Startup ribbon — уведомления при запуске для старых сообщений

### ❌ page-title-updated и unread-count не проверяют warm-up + 10 сек недостаточно

**Симптом**: При запуске приложения показываются ribbon уведомления для старых непрочитанных сообщений из всех мессенджеров. WhatsApp кидает `new Notification()` при загрузке для всех непрочитанных.

**Причина 1 (v0.48.1)**: `page-title-updated` и `unread-count` хендлеры не проверяли `notifReadyRef` warm-up. При запуске счётчик 0→N → fallback ribbon.

**Причина 2 (v0.49.0)**: Warm-up 10 сек недостаточно. WhatsApp загружается 15-30+ секунд и кидает `new Notification()` для всех непрочитанных ПОСЛЕ warm-up. Уведомление "Кезин Евгений АндреевичЗагрузка..." — это WhatsApp показывает контакт при загрузке.

**Решение**:
- v0.48.1: Добавлена проверка `notifReadyRef` в `page-title-updated` и `unread-count`
- v0.49.0: Warm-up увеличен до 30 сек (и в App.jsx, и в main.js backup path)

**Ключевой урок**: Warm-up должен быть >= 30 сек. Мессенджеры (особенно WhatsApp) загружаются медленно и кидают Notification для СТАРЫХ непрочитанных при загрузке. 10 сек категорически недостаточно.

---

## 🟡 ВАЖНОЕ: «Перейти к чату» — навигация не работает

### ❌ buildChatNavigateScript не находит элементы / не возвращает результат

**Симптом**: Кнопка "Перейти к чату" на ribbon просто открывает окно мессенджера, но не переходит к конкретному чату.

**Причины**:
1. Fallback ribbon (`page-title-updated`/`unread-count`) не передаёт `senderName`/`chatTag` → навигация невозможна (только `setActiveId`).
2. Задержка 350ms слишком маленькая — WebView может не успеть отрисовать sidebar после `setActiveId`.
3. `buildChatNavigateScript` не возвращал результат → нельзя понять, нашёл ли элемент.
4. Для MAX использовались generic селекторы вместо Telegram-like (MAX — форк Telegram Web K).

**Решение (v0.49.0)**:
- Все скрипты в `buildChatNavigateScript` возвращают `true/false`.
- Retry: до 3 попыток с задержкой 1.2 сек если элемент не найден.
- Задержка первой попытки увеличена до 600ms.
- MAX: добавлены `.chatlist-chat .peer-title` селекторы (как у Telegram).
- WhatsApp: добавлен fuzzy match по `startsWith` для обрезанных имён.
- Логирование `[GoChat]` для отладки.

**Ключевой урок**: executeJavaScript в WebView для поиска DOM-элементов — хрупкий подход. Нужны retry и логирование. Селекторы должны быть проверены для каждого мессенджера отдельно.

---

## 🟡 ВАЖНОЕ: MAX — ribbon без имени отправителя и аватарки

### ❌ MAX НЕ вызывает showNotification для каждого сообщения (особенно в фоне)

**Симптом**: Ribbon уведомление от MAX показывает "Макс" вместо имени отправителя. Нет аватарки. Лог уведомлений пуст. Работает только когда пользователь переключился на вкладку MAX.

**Причина 1**: MAX не всегда вызывает `ServiceWorkerRegistration.showNotification()`. Уведомления приходят через `quickNewMsgCheck` (MutationObserver addedNodes → `__CC_MSG__`), который передаёт только текст без sender/avatar.

**Причина 2**: `enrichNotif()` + `findSenderInChatlist(body)` работают только внутри override showNotification в main world. Путь `__CC_MSG__` эти функции не вызывает. Лог `__cc_notif_log` тоже заполняется только из override.

**Причина 3**: Когда title = "Макс" (совпадает с `_appTitles`), `enrichNotif` ищет sender в chatlist по body.slice(0,30). Но chatlist preview может не содержать текст нового сообщения (если DOM ещё не обновился).

**Решение (v0.54.0)**:
- `getActiveChatSender()` + `getActiveChatAvatar()` в monitor.preload.js — извлекают имя и аватарку из заголовка АКТИВНОГО чата (`.chat-info .peer-title`, `.topbar img.avatar-photo`).
- `quickNewMsgCheck` эмиттит `__CC_NOTIF__` с enriched данными вместо голого `__CC_MSG__`.
- Backup: App.jsx `__CC_MSG__` handler обогащает через `executeJavaScript` и пишет в `__cc_notif_log`.
- `new-message` IPC ждёт 500мс — приоритет enriched `__CC_NOTIF__`.

**Ключевой урок**: Нельзя полагаться на `showNotification` override как единственный источник уведомлений. Некоторые мессенджеры (MAX) не вызывают Notification API вообще. `addedNodes` detection — необходимый fallback, который тоже должен обогащать данные отправителя.

**Диагностика (v0.55.0)**: Pipeline Trace Logger — трассирует каждый шаг: source → spam → dedup → handle → viewing → sound → ribbon. Если лог показывает "ПОКАЗАНО" а ribbon не появился — смотреть trace на предмет `viewing:БЛОК` (isViewingThisTab=true) или `dedup:БЛОК` (обработан раньше другим путём).

---

## 🟡 ВАЖНОЕ: VK — ribbon для своих исходящих, статусов online, "N непрочитанных"

### ❌ VK шлёт Notification для ВСЕХ событий, включая свои сообщения и статусы

**Симптом**: Ribbon показывает: "Красотка моя, довольна?" (ваше исходящее), "минуту назад" (статус online), "2 непрочитанных сообщений" (бесполезный fallback). Нет имени отправителя — показывает "ВКонтакте".

**Причины**:
1. VK вызывает `new Notification()` для СВОИХ исходящих сообщений (без разделения входящие/исходящие).
2. VK шлёт Notification для статусов online ("минуту назад", "только что", "был в сети").
3. Fallback ribbon "N непрочитанных" из `page-title-updated`/`unread-count` — бесполезный текст без имени.
4. VK передаёт title = "ВКонтакте" → `enrichNotif` ловит regex, но `findSenderInChatlist` использовал только `.chatlist-chat` (Telegram), а не VK-селекторы.

**Решение (v0.51.0)**:
- `isSpamNotif(body)` — regex-фильтр: статусы online, счётчики непрочитанных, "печатает", "набирает".
- `_outgoing` regex — фильтр исходящих по "Вы: " / "You: " в начале body.
- Fallback ribbon "N непрочитанных" ОТКЛЮЧЁН — `__CC_NOTIF__` покрывает все настоящие сообщения.
- `findSenderInChatlist` расширен: VK generic селекторы `[class*="dialog"]`, `[class*="conversation"]`, `[class*="title"]`, `[class*="name"]`.
- `_findAvatarInEl` — вспомогательная функция для аватарок (img, canvas, background-image).
- Фильтры добавлены в 3 места: injection script, `__CC_NOTIF__` handler (App.jsx), backup path (main.js).

**Ключевой урок**: Мессенджеры (VK, MAX) используют Notification API не только для входящих. Нужна обязательная фильтрация body: исходящие ("Вы:"), статусы, системные тексты.

---

## 🔴 КРИТИЧЕСКОЕ: requestAnimationFrame НЕ работает в hidden BrowserWindow

### ❌ Использование rAF в notification window

**Симптом**: Ribbon уведомления показываются только при первой загрузке, потом перестают появляться навсегда.

**Причина**: `reportHeight()` в notification.html использовал двойной `requestAnimationFrame` для стабильного layout. Но Chromium НЕ вызывает rAF для hidden/invisible окон. После dismiss всех уведомлений → `notifWin.hide()` → rAF больше никогда не выполняется → `notif:resize` не приходит → `showInactive()` не вызывается → окно навсегда скрыто.

**Решение (v0.47.2)**: Заменить rAF на `setTimeout(60ms)`. Также main.js показывает `showInactive()` ДО отправки `notif:show`, чтобы layout гарантированно работал.

**Ключевой урок**: В Electron BrowserWindow с `show: false` или после `hide()` — НИКОГДА не использовать `requestAnimationFrame`. Использовать `setTimeout`.

---

## 🔴 КРИТИЧЕСКОЕ: Ложные ribbon при навигации между чатами

### ❌ getLastMessageText срабатывает на СТАРЫЕ сообщения при смене чата

**Симптом**: При переключении на другой чат в Telegram появляется ribbon уведомление для старого (уже прочитанного) сообщения.

**Причина**: Path 2 в `sendUpdate()` (monitor.preload.js) — `getLastMessageText(type)` находит последнее видимое сообщение в DOM. При навигации к ДРУГОМУ чату: DOM обновляется → MutationObserver → `sendUpdate()` → `getLastMessageText` находит текст из нового чата → отличается от `lastActiveMessageText` → считается "новым" → `new-message` IPC → ribbon.

**Решение (v0.47.2)**: Path 2 отключён для Telegram (`type !== 'telegram'`). У Telegram хорошо работает `__CC_NOTIF__` (перехват Notification API) + unread count. Path 2 нужен только для мессенджеров где unread count не растёт при открытом чате (MAX, WhatsApp, VK).

**Ключевой урок**: `getLastMessageText` — ненадёжный детектор новых сообщений. Он не различает "новое сообщение в текущем чате" и "старое сообщение в другом чате, на который переключились". Для мессенджеров с работающим Notification API (Telegram) — использовать `__CC_NOTIF__`, не Path 2.

---

## 🔴 КРИТИЧЕСКОЕ: Глобальные настройки ломают отдельные мессенджеры

### ❌ Одни настройки на все мессенджеры = "чиним одно, ломается другое"

**Симптом**: Изменения для одного мессенджера (MAX) ломают уведомления для других (Telegram, VK).

**Причина**: До v0.47.0 все настройки уведомлений были глобальные: `soundEnabled`, `notificationsEnabled`, `mutedMessengers`. Фикс для MAX (addedNodes, fallback ribbon) влиял на ВСЕ мессенджеры.

**Решение (v0.47.0)**: Per-messenger настройки: `messengerNotifs: { [id]: { sound: bool, ribbon: bool } }`. Каждый мессенджер управляется отдельно. Глобальные настройки = fallback. UI: два toggle (Звук + Ribbon) на каждый мессенджер в SettingsPanel.

**Ключевой урок**: Настройки уведомлений ВСЕГДА должны быть per-messenger. Глобальные — только как default/fallback.

---

## 🔴 КРИТИЧЕСКОЕ: Ribbon только для первого сообщения (повторные — только звук)

### ❌ Мессенджеры не вызывают `new Notification()` для каждого нового сообщения

**Симптом**: При получении нескольких сообщений подряд (в MAX и др.) ribbon показывается только для первого, остальные — только звук.

**Причина**: Ribbon создаётся ТОЛЬКО через `handleNewMessage()`, который вызывается из `__CC_NOTIF__` (перехват Notification API) и `new-message` (MutationObserver IPC). Многие мессенджеры (MAX, VK, WhatsApp) группируют уведомления и не вызывают `new Notification()` для каждого отдельного сообщения. При этом `page-title-updated` и `unread-count` хендлеры играют звук при росте счётчика, но НЕ создают ribbon.

**4 пути уведомлений**:
1. `__CC_NOTIF__` → `handleNewMessage()` → ribbon + звук ✅
2. `new-message` IPC → `handleNewMessage()` → ribbon + звук ✅
3. `page-title-updated` → звук ⚠️ (ribbon НЕ создавался)
4. `unread-count` IPC → звук ⚠️ (ribbon НЕ создавался)

**Решение (v0.46.2)** — НЕПОЛНОЕ, не работает для MAX:
1. Добавить `lastRibbonTsRef = useRef({})` — `{ [messengerId]: timestamp }` последнего показа ribbon
2. В `handleNewMessage` перед `app:custom-notify` записывать `lastRibbonTsRef.current[messengerId] = Date.now()`
3. В `page-title-updated` и `unread-count` хендлерах: если `Date.now() - lastRibbonTs > 3000` → создавать fallback ribbon

**Почему v0.46.2 НЕ помогло для MAX**: Когда чат ОТКРЫТ в WebView → MAX считает сообщения прочитанными → unread count = 0 → НЕ растёт → `page-title-updated` не имеет `(N)` в title → `unread-count` IPC = 0 → fallback ribbon никогда не срабатывает. Звук шёл от самого MAX (AudioContext, не `new Audio()`).

**Решение (v0.46.3)** — addedNodes detection:
1. `quickNewMsgCheck()` в MutationObserver — анализирует `mutation.addedNodes` напрямую
2. При появлении нового DOM-элемента с текстом (2-500 символов) → `new-message` IPC
3. Фильтрация: пропускаются BUTTON/INPUT/SVG/IMG, элементы >40 children, timestamps, служебные тексты
4. Cooldown 3 сек + dedup по тексту + `isViewingThisTab` в App.jsx
5. Работает для MAX, WhatsApp, VK. Telegram исключён (работает через `__CC_NOTIF__`)

**Ключевой урок**: Нельзя полагаться на unread count для ribbon — когда чат открыт в WebView, count не растёт. Нужен прямой мониторинг DOM mutations (addedNodes).

---

## 🔴 КРИТИЧЕСКОЕ: Enrichment addedNodes — timing + селекторы + dedup race

### ❌ getActiveChatSender() не находит заголовок чата в MAX

**Симптом**: `__CC_NOTIF__` от preload приходит с `t=""` (пустой sender), enrichment из `__CC_MSG__` тоже возвращает `sender="нет"`. Но showNotification override через `enrichNotif` → `findSenderInChatlist` находит sender корректно.

**Причина 1**: Селекторы `.chat-info .peer-title, .topbar .peer-title` не соответствуют DOM MAX (SvelteKit). MAX может использовать другие классы для header чата.

**Причина 2 (timing)**: `quickNewMsgCheck` (addedNodes) срабатывает мгновенно — chatlist preview ещё НЕ обновлён. `findSenderInChatlist` ищет `bodySlice` в `.chatlist-chat textContent` → не находит, потому что chatlist обновляется позже.

**Причина 3 (dedup race)**: Если preload эмиттит `__CC_NOTIF__` с `t=""`, этот пустой NOTIF регистрируется в `notifDedupRef`. Через 43мс приходит enriched NOTIF из showNotification с `t="Имя"` → дедуплицируется.

**Решение (v0.55.1)**:
1. `quickNewMsgCheck` эмиттит `__CC_MSG__` (не `__CC_NOTIF__`) — не конкурирует с enriched showNotification
2. 8 вариантов header-селекторов (`.peer-title`, `[class*="title"]`, `[class*="name"]`, `header [class*="title"]` и др.)
3. Fallback: active/selected чат в sidebar (`.chatlist-chat.active`, `[class*="chat"][class*="active"]`)
4. Задержка 150мс перед enrichment — chatlist успевает обновиться
5. Спам-фильтр для "Ожидание сети..." и системных текстов MAX во ВСЕХ 4 фильтрах

**Ключевой урок**: addedNodes detection МГНОВЕННАЯ, а chatlist preview обновляется ПОЗЖЕ. Нужна задержка enrichment и fallback по active chat (а не по тексту). Preload должен эмиттить `__CC_MSG__` (не `__CC_NOTIF__`), чтобы не блокировать enriched showNotification через dedup.

---

## 🔴 КРИТИЧЕСКОЕ: ribbonExpandedByDefault ломает показ ribbon-уведомлений

### ❌ overflow:hidden на .notif-item + таймер при expandedByDefault + порядок авто-раскрытия

**Симптом**: При включении настройки "Кнопки действий сразу" (ribbonExpandedByDefault) ribbon-уведомления перестают показываться полностью.

**Причина 1**: `overflow: hidden` на `.notif-item` обрезал expanded-контент, который выходил за min-height (76px).

**Причина 2**: Таймер dismiss запускался ДАЖЕ при `expandedByDefault` → уведомление авто-удалялось через dismissMs.

**Причина 3**: Авто-раскрытие (`el.classList.add('expanded')`) происходило ДО настройки таймера → `items.set()` записывал `expanded: false`, хотя уведомление уже было раскрыто.

**Причина 4**: Начальная высота окна 76px — слишком мала для expanded ribbon (~120px+). `notif:resize` IPC не успевал увеличить окно.

**Решение (v0.46.1)**:
1. Убрать `overflow: hidden` с `.notif-item`
2. При `expandedByDefault` — НЕ запускать таймер, поставить `progress.style.animationPlayState = 'paused'`
3. Код авто-раскрытия (`if (data.expandedByDefault)`) перенести ПОСЛЕ настройки таймера и mouseenter/mouseleave
4. Начальная высота окна 300px (а не 76px)

**Ключевой урок**: При expandedByDefault нужно пауза таймера С ПЕРВОЙ секунды, и авто-раскрытие ПОСЛЕ полной настройки таймера.

### ❌ CSS `display: none/flex` не анимируется

**Симптом**: `.action-row { display: none }` → `.expanded .action-row { display: flex }` — переключение мгновенное, без анимации.

**Причина**: CSS свойство `display` не поддерживает transition.

**Решение**: Заменить на `max-height: 0` + `overflow: hidden` + `opacity: 0` → `max-height: 60px` + `opacity: 1` с `transition: max-height 200ms, opacity 200ms`.

**Ключевой урок**: Для анимации показа/скрытия блока использовать max-height transition, НЕ display toggle.

---

## 🔴 КРИТИЧЕСКОЕ: Подсчёт непрочитанных в Telegram Web K

### ❌ Суммирование бейджей отдельных чатов (querySelectorAll + persistent Map)

**Симптом**: Счётчик показывает 1796 вместо правильных 26. Telegram "Все чаты" пишет 26 — это верно.

**Причина 1 (v0.7–v0.19)**: `querySelectorAll('.badge')` считает только видимые диалоги (~20 шт.) → скачки при скролле (594 → 1435 → 2918).

**Причина 2 (v0.20.0, persistent Map)**: Map суммирует бейджи КАЖДОГО чата (каналы: 9.4K + 3.4K + 2.3K + ...) → выдаёт тысячи. Telegram же считает "Все чаты" = число ЧАТОВ с непрочитанными, а НЕ сумму всех сообщений.

**Решение (v0.22.0)**: НЕ суммировать бейджи чатов. Читать ГОТОВЫЙ счётчик Telegram:
1. `document.title.match(/\((\d+)\)/)` — `(26) Telegram Web`
2. Первый бейдж в folder tab (`.tabs-tab .badge` и др.)
3. **Адаптивный поиск**: `.badge` НЕ внутри `.chatlist-chat` = folder tab badges
4. Fallback: сумма chatlist badges

**Ключевой урок**: Число на folder tab "Все чаты" ≠ сумма бейджей чатов!

### ❌ Жёсткие CSS-селекторы для folder tabs Telegram

**Симптом**: `.tabs-tab` не находит элементы → бейдж = 0.

**Причина**: Telegram Web K имеет разные layout'ы folder tabs (горизонтальный, вертикальный), с разными CSS-классами.

**Решение (v0.22.0)**: Адаптивный поиск с несколькими селекторами + диагностический IPC `monitor-diag` для отладки. При неизвестном layout'е — `.badge` элементы НЕ внутри chatlist = folder badges.

**Решение (v0.23.0)**: `page-title-updated` event на WebView — ловит `(N)` из `document.title` мгновенно, без MutationObserver и без CSS-селекторов.

### ❌ MutationObserver не ловит изменение document.title

**Симптом**: `document.title` содержит `(26) Telegram Web`, но `countUnreadTelegram()` возвращает 0.

**Причина**: MutationObserver наблюдает `document.body`, а `<title>` находится в `<head>`. Изменение title НЕ триггерит observer → `sendUpdate()` не вызывается при обновлении title.

**Решение (v0.23.0)**: `el.addEventListener('page-title-updated', ...)` в renderer — встроенное событие Electron WebView, срабатывает мгновенно при изменении title. Не зависит от MutationObserver.

---


---


## Кастомные уведомления (v0.39.0)

### Потенциальные ошибки при работе с Notification BrowserWindow

**1. `transparent: true` на Windows требует осторожности:**
- Windows 11 поддерживает transparent BrowserWindow, но `backgroundColor` должен быть `#00000000`
- Без `frame: false` прозрачность НЕ работает
- HTML body тоже должен иметь `background: transparent`

**2. `focusable: false` + клики:**
- `focusable: false` предотвращает кражу фокуса при `showInactive()`
- НО окно всё равно кликабельно — `setIgnoreMouseEvents(false)` по умолчанию
- Если поставить `setIgnoreMouseEvents(true)` — клики будут проходить СКВОЗЬ окно

**3. Путь к notification.html в production:**
- В dev: `path.join(__dirname, '../../main/notification.html')` (от out/main/)
- В prod: зависит от структуры сборки — `notification.html` должен быть включён в `build.files` в package.json или скопирован при сборке
- Если файл не найден — `loadFile()` молча покажет пустое окно

**4. `screen` API доступен ТОЛЬКО после `app.whenReady()`:**
- `const { screen } = require('electron')` — OK на уровне модуля
- НО `screen.getPrimaryDisplay()` вернёт ошибку если вызван до `app.whenReady()`
- NotificationManager создаёт окно лениво (при первом уведомлении) — к тому моменту app уже ready

**5. Resize BrowserWindow на Windows — не плавный:**
- `setBounds()` с `animate: true` работает ТОЛЬКО на macOS
- На Windows: мгновенное изменение, может мелькать
- Решение: использовать CSS-анимацию ВНУТРИ окна, а `setBounds` вызывать по IPC `notif:resize` когда HTML сообщает нужную высоту

---

## 🔴 isViewingThisChat подавляет ВСЕ уведомления на активной вкладке (v0.39.0)

### ❌ messengerId ≠ конкретный чат

**Симптом (v0.39.0)**: Пользователь на вкладке VK, приходит сообщение от другого чата VK — ни звука, ни ribbon. `messagePreview` появляется, но sound и notification пропущены.

**Причина**: `isViewingThisChat = !document.hidden && activeIdRef.current === messengerId` подавляло и звук, и ribbon. Но `messengerId` — это ID вкладки (например `"vk"`), а НЕ ID конкретного чата. Оператор на VK-вкладке мог быть в совершенно другом чате.

**Решение (v0.39.1)**: Убрать `!isViewingThisChat` из условий звука и уведомления. Подавление остаётся только по `messengerMuted` и глобальным настройкам.

```js
// БЫЛО (v0.39.0):
if (soundEnabled && !messengerMuted && !isViewingThisChat) playNotificationSound()
if (notificationsEnabled && !messengerMuted && !isViewingThisChat) { ... }

// СТАЛО (v0.39.1):
if (soundEnabled && !messengerMuted) playNotificationSound()
if (notificationsEnabled && !messengerMuted) { ... }
```

**Ключевой урок**: В ChatCenter `messengerId` — это ID WebView-вкладки, а не конкретного чата внутри мессенджера. Нельзя использовать его для определения "пользователь смотрит на этот чат".

---

## 🟡 Прозрачность BrowserWindow на Windows (v0.39.0 → v0.39.1)

### ❌ transparent: true недостаточно без backgroundColor

**Симптом**: Notification window с `transparent: true` показывает чёрный фон вместо прозрачного на Windows.

**Причина**: На Windows `transparent: true` НЕ гарантирует прозрачность без явного `backgroundColor: '#00000000'`.

**Решение**: Всегда добавлять `backgroundColor: '#00000000'` к `transparent: true`:
```js
new BrowserWindow({
  transparent: true,
  backgroundColor: '#00000000',
  // ...
})
```

**Ключевой урок**: На Windows для прозрачного BrowserWindow ОБЯЗАТЕЛЬНО `transparent: true` + `backgroundColor: '#00000000'`.

---

## 🔴 Фантомные уведомления от MAX (v0.39.0 — v0.39.1)

### ❌ __CC_NOTIF__ с пустым body от ServiceWorker

**Симптом**: Уведомление "Макс 11:28" появляется хотя никто не писал. MAX-мессенджер отправляет фантомное уведомление.

**Причина**: MAX (web.max.ru) через ServiceWorker вызывает `showNotification("Макс", {body: ""})` — это push-sync или status-уведомление. Наш перехват ловит его и отправляет `__CC_NOTIF__` с `{t: "Макс", b: ""}`. В App.jsx код использовал `data.b || data.t || ''` — пустой body фолбечил на title "Макс", который обрабатывался как "новое сообщение".

**Решение (v0.39.2)**: Требовать непустой `data.b`:
```js
// БЫЛО:
const text = data.b || data.t || ''  // пустой body → берёт title "Макс"

// СТАЛО:
const text = (data.b || '').trim()   // пустой body → пустой text → skip
```

**Ключевой урок**: Notification API используется мессенджерами не только для сообщений, но и для push-sync, status, reconnect. Фильтровать по непустому body — обязательное условие. Title без body = системное уведомление, не сообщение.

---

## 🔴 Фантомные уведомления VK при переключении чатов (v0.39.1 — v0.39.2)

### ❌ MutationObserver + убранный isViewingThisChat = ложные срабатывания

**Симптом**: При переключении чатов в VK появляется ribbon-уведомление с текстом последнего сообщения из нового чата. Никто не писал.

**Причина**: В v0.39.1 убрали `isViewingThisChat` из `handleNewMessage` чтобы ribbon показывался всегда. Но MutationObserver (Path 2 в monitor.preload.js) при ЛЮБОМ изменении DOM (смена чата, прокрутка) вызывает `getLastMessageText()`. Если текст отличается от предыдущего → `new-message` IPC → `handleNewMessage` без подавления → ложное уведомление.

**Решение (v0.39.3 → v0.41.0 → v0.41.1)**: Двойная защита:

**1. App.jsx (renderer)**: Подавлять ВСЕ уведомления когда пользователь смотрит на эту вкладку:
```js
const isViewingThisTab = !document.hidden && activeIdRef.current === messengerId
if (isViewingThisTab) return
```

**2. main.js (backup path)**: Backup path работает ТОЛЬКО при свёрнутом/скрытом окне:
```js
if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized() && mainWindow.isVisible()) return
```

**Почему v0.41.0 не помог**: Исправление в App.jsx подавляло `handleNewMessage`, но тот же `console-message` event ловил **backup path в main.js** напрямую → вызывал `showCustomNotification` минуя `handleNewMessage`. Два listener на один event!

**Ключевой урок**: `console-message` от WebView обрабатывается в ДВУХ местах (renderer + main process). Подавление в одном месте бесполезно если другое место дублирует. Backup path должен работать ТОЛЬКО когда renderer не может обработать (окно свёрнуто/скрыто).

---

## 🔴 Browser API для видимости окна НЕНАДЁЖНЫ в Electron (v0.41.2 → v0.42.0)

### ❌ document.hasFocus() и document.hidden оба ненадёжны

**Симптом**: Ribbon-уведомление появляется при ЧТЕНИИ старых сообщений в Telegram/MAX — пользователь смотрит на мессенджер, но ribbon не подавляется.

**Причина**: Оба browser API ненадёжны в Electron с `<webview>`:
- `document.hasFocus()` → `false` когда фокус внутри WebView (отдельный browsing context)
- `document.hidden` → может быть ненадёжен с `backgroundThrottling: false`

**v0.41.2**: Заменили `!document.hidden` на `hasFocus()` → ложные ribbon при фокусе в webview.
**v0.41.3**: Вернули `!document.hidden` → всё ещё проблемы с Telegram.

**Решение (v0.42.0)**: IPC window-state из main process:
```js
// main.js — BrowserWindow events → IPC
mainWindow.on('focus', () => webContents.send('window-state', { focused: true }))
mainWindow.on('blur', () => webContents.send('window-state', { focused: false }))
// + minimize, restore, show

// App.jsx — ref для хранения состояния
const windowFocusedRef = useRef(true)
useEffect(() => window.api.on('window-state', (s) => { windowFocusedRef.current = s.focused }), [])

// Проверка видимости
const isViewingThisTab = windowFocusedRef.current && activeIdRef.current === messengerId
```

**Ключевой урок**: В Electron НИКОГДА не полагайся на browser API (document.hidden, hasFocus) для определения видимости окна. Используй IPC из main process — BrowserWindow events (focus/blur/minimize/restore) 100% надёжны.

---

## 🔴 Timestamp-only body в Notification API (v0.41.2)

### ❌ MAX шлёт Notification с body = "12:40" (только время)

**Симптом**: Пустое ribbon-уведомление с текстом "12:40" вместо текста сообщения.

**Причина**: MAX при открытии чата / получении уведомления может вызвать `new Notification("", { body: "12:40" })` — body содержит только timestamp. Наши фильтры (`if (!text) return`) пропускают это, т.к. "12:40" непустая строка.

**Решение**: Фильтровать timestamp-only body:
```js
if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanBody)) return null
```

Добавлено в: `showCustomNotification` (main.js) и `__CC_NOTIF__` handler (App.jsx).

**Ключевой урок**: Мессенджеры могут передавать в Notification.body нетекстовые данные: timestamps, пустые строки, zero-width символы. Фильтр body должен проверять не только непустоту, но и осмысленность содержимого.

---

## 🔴 Дублирование ribbon: Notification + ServiceWorker + backup path (v0.43.0 → v0.43.1)

### ❌ 4 ribbon-уведомления на 1 сообщение в Telegram

**Симптом**: Одно сообщение "Хорошо" создаёт 4 ribbon-уведомления. Первые 2 с именем отправителя, нижние 2 без имени и с body "Хорошо15:5715:57".

**Причина**: Telegram вызывает ОБА:
1. `new Notification(title, opts)` — перехватывается нашим override
2. `ServiceWorkerRegistration.showNotification(title, opts)` — тоже перехватывается

Каждый генерирует `__CC_NOTIF__` → 2 уведомления из renderer (App.jsx). Если окно не в фокусе, backup path в main.js тоже обрабатывает эти же 2 `console-message` → ещё 2 ribbon. Итого 4.

ServiceWorker Notification body отличается от обычного — содержит приклеенный timestamp ("Хорошо15:5715:57"), из-за чего дедупликация по `body.slice(0,60)` НЕ срабатывала.

**Решение (v0.43.1)**:
1. **Дедупликация в renderer** (App.jsx): `notifDedupRef` — Map с ключом `messengerId:normalizedBody`, окно 5 сек. Нормализация: убрать все timestamps из body перед сравнением.
2. **Нормализация body в main.js**: Деduп-ключ строится из нормализованного body (без timestamps).
3. **Очистка trailing timestamps**: `showCustomNotification` убирает trailing timestamps из body перед отображением ("Хорошо15:5715:57" → "Хорошо").

```js
// Нормализация для дедуп-ключа:
const normalizedText = text.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').trim()
// Очистка trailing timestamps для отображения:
cleanBody = cleanBody.replace(/(\d{1,2}:\d{2}(:\d{2})?)+\s*$/g, '').trim()
```

**Ключевой урок**: Мессенджеры могут вызывать `Notification` И `ServiceWorker.showNotification` для одного сообщения. ServiceWorker body может отличаться (приклеенные timestamps). Дедупликация ОБЯЗАТЕЛЬНА в обоих path (renderer + main), с нормализацией body (убрать timestamps, zero-width chars) перед построением ключа.

---

## 🔴 Backup path + findMessengerByUrl при 2+ аккаунтах одного мессенджера (v0.44.0 → v0.44.1)

### ❌ Backup path создаёт ribbon для НЕПРАВИЛЬНОГО аккаунта

**Симптом**: При свёрнутом окне — 2 ribbon на 1 сообщение. Первый на правильный Telegram, второй — на другой аккаунт.

**Причина**: `findMessengerByUrl(contents.getURL())` ищет **первый** мессенджер с совпадающим hostname. При 2+ Telegram — ВСЕГДА вернёт первый!

**Решение (v0.44.1)**: Backup path отключён когда renderer жив (`webContents` не destroyed). `backgroundThrottling: false` = renderer работает ВСЕГДА:
```js
if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) return
```

**Ключевой урок**: `findMessengerByUrl` ненадёжен при нескольких аккаунтах одного мессенджера. Renderer определяет messengerId правильно через closure. При `backgroundThrottling: false` backup path избыточен.

---

## 🔴 WebView не загружается при `display: none` и `visibility: hidden` (v0.44.1 → v0.45.0)

### ❌ Мессенджеры не загружаются до перехода на вкладку

**Симптом**: При запуске приложения WebView не загружают страницы. Пользователь должен кликнуть на каждую вкладку чтобы мессенджер начал работать.

**Причина 1 (v0.44.1)**: Неактивные вкладки скрывались через `display: none`:
```jsx
style={{ display: activeId === m.id ? 'block' : 'none' }}
```
В Electron `<webview>` с `display: none` **не начинает загрузку**.

**Причина 2 (v0.44.2)**: `visibility: hidden` тоже может блокировать загрузку webview в Electron — это НЕ гарантированный fix.

**Решение (v0.45.0)**: Все webview остаются `visibility: visible` (по умолчанию), стакаются через `zIndex`. Активный сверху, неактивные перекрыты + `pointer-events: none`:
```jsx
style={{
  zIndex: activeId === m.id ? 2 : 0,
  pointerEvents: activeId === m.id ? 'auto' : 'none',
}}
```
Все webview рендерятся и загружаются с первой секунды. Неактивные просто перекрыты активным.

**Ключевой урок**: В Electron `<webview>` — НЕ используй `display: none` или `visibility: hidden`. Для переключения вкладок: все webview visible + `absolute inset-0` + `zIndex` для активного. `pointer-events: none` для неактивных чтобы клики не проходили.

---

## 🔴 Дёргание первого ribbon-уведомления — двойной setBounds (v0.45.0 → v0.45.1)

### ❌ Первое ribbon дёргается, последующие — нет

**Симптом**: При первом ribbon-уведомлении окно "подпрыгивает" / дёргается при появлении. Второе и далее — плавно.

**Причина**: Двойной `setBounds` за ~16ms:
1. `repositionNotifWin()` в `showCustomNotification()` — вычисляет высоту по формуле (76px * count + gap + padding) → `setBounds` + `showInactive`
2. `notif:resize` из HTML (через `requestAnimationFrame`) — вычисляет высоту по `offsetHeight` → `setBounds`

Два `setBounds` с потенциально разной высотой за 16ms = видимый дёрг на Windows.

Для второго уведомления окно уже видимо, setBounds менее заметен.

**Решение (v0.45.1)**:
1. Убрали `repositionNotifWin()` из `showCustomNotification()` и из IPC handlers
2. Единственный источник позиционирования — `notif:resize` от HTML
3. Кэш bounds: не вызывать setBounds если координаты и высота не изменились
4. Двойной rAF в `reportHeight()` для стабильного layout

**Ключевой урок**: Для прозрачных popup-окон на Windows — ОДИН источник setBounds. Не дублировать позиционирование из main-процесса и из HTML renderer. HTML знает свою высоту точнее (offsetHeight vs расчёт по формуле).

---

## 🟡 Кнопки действий ribbon только для длинных сообщений (v0.44.0 → v0.45.2)

### ❌ Пользователь не видит кнопки "Перейти к чату" / "Прочитано" на коротких сообщениях

**Симптом**: На ribbon с текстом "Чыпр" (4 символа) — видна только маленькая галочка ✓ в углу. Нет кнопок действий, нет подсказки "ещё...".

**Причина**: Кнопки действий (action-row) были в CSS `.notif-item.expanded .action-row { display: flex }`. Expand-клик работал ТОЛЬКО при `hasFullBody` (текст >100 символов). Для коротких → обычный клик → переход к чату → dismiss.

**Решение (v0.45.2)**: Клик на ЛЮБОЕ уведомление раскрывает кнопки действий. Подсказка "▼ действия" для коротких, "▼ ещё..." для длинных.

**Ключевой урок**: UI-элементы управления (кнопки действий) должны быть доступны ВСЕГДА, не зависеть от длины контента. Условие `hasFullBody` влияет только на текст expand, НЕ на доступность кнопок.

---

## 🟡 Hover-tooltip ломает layout таблицы (v0.52.2 → v0.52.3)

### ❌ position:absolute на hover сдвигает ширину столбцов таблицы

**Симптом**: При наведении на ячейку таблицы (лог уведомлений) ширина столбцов "прыгает" — соседние колонки сжимаются/расширяются.

**Причина**: CSS `.cc-notif-cell:hover { position: absolute }` выдёргивает элемент из потока документа → `<td>` теряет контент → ширина столбца схлопывается. Без `table-layout: fixed` браузер пересчитывает ширину по контенту.

**Решение (v0.52.3)**:
1. `table-layout: fixed` + `<colgroup>` с фиксированными ширинами столбцов — ширина не зависит от контента.
2. `::after` pseudo-element с `content: attr(data-full)` вместо изменения самого элемента. Оригинальный `<div>` с `truncate` остаётся в потоке, `::after` показывается поверх как отдельный слой.
3. Селектор `[data-full]:not([data-full=""])` — не показывать пустой тултип.

**Ключевой урок**: CSS `::after` с `content: attr(data-full)` обрезается `overflow: hidden` на `<td>`. Решение: JS-тултип с `position: fixed` через React state (`onMouseEnter`/`onMouseLeave` → `setCellTooltip`). `position: fixed` не зависит от overflow родителей.

---

## 🟡 Парсинг Telegram Notification.tag — формат peer (v0.53.0)

### ❌ tag.replace(/[^0-9-]/g, '') неправильно парсит "peer5_1234567890"

**Симптом**: Клик на ribbon-уведомление от Telegram не находит чат по peerId — навигация fallback на имя.

**Причина**: Telegram Web K использует Notification.tag в формате `peer5_1234567890` (type_id). Regex `tag.replace(/[^0-9-]/g, '')` удалял ВСЕ нецифровые символы → `51234567890` → неправильный peerId. Подчёркивание `_` тоже удалялось, но нужно сначала убрать префикс `peer5_`.

**Решение (v0.53.0)**: `tag.replace(/^peer\\d+_/, '').replace(/[^0-9-]/g, '')` — сначала убрать `peerN_`, потом оставить только цифры.

**Ключевой урок**: Notification.tag формат зависит от мессенджера. Telegram: `peer{type}_{id}`. Парсить надо с учётом формата, не слепым regex.

---

## 🟡 Виртуальный скроллинг Telegram Web K ломает DOM-поиск чата (v0.53.1)

### ❌ querySelectorAll('.chatlist-chat .peer-title') не находит чат если он не в viewport

**Симптом**: Клик "Перейти к чату" на ribbon → вкладка переключается, но чат НЕ открывается. `buildChatNavigateScript` возвращает `{ok:false, method:'notFound'}`.

**Причина**: Telegram Web K использует **виртуальный скроллинг** для списка чатов. В DOM рендерятся только ~20-30 видимых чатов. Если нужный чат прокручен — его `.peer-title` элемента НЕТ в DOM.

**Решение (v0.53.1)**:
1. Основной метод: `[data-peer-id]` selector по chatTag (peerId) — если элемент в DOM.
2. Формат peerId: user=ID, chat=-ID, channel=-100ID (парсинг peer type из tag).
3. Case-insensitive match: `toLowerCase()` сравнение.
4. Partial/contains match: `indexOf` для длинных имён.
5. Retry с проверкой `activeIdRef.current` — не трогать фоновый WebView.

**Ключевой урок**: SPA-мессенджеры используют виртуальный скроллинг. `querySelectorAll` находит только ВИДИМЫЕ элементы. Для навигации к невидимому чату нужен альтернативный метод через peer ID формат.

---

