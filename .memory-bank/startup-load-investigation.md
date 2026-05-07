# Расследование: долгая загрузка Telegram при старте

**Статус**: 🟡 В расследовании  
**Создано**: 6 мая 2026  
**Архивировать**: после фикса и 2+ недель стабильности.

---

## Зачем этот файл

Этот документ нужен, чтобы не расследовать долгий старт заново по кускам из чата и терминала.

Здесь фиксируем:
- какие логи запуска смотрели;
- какие причины подтвердились кодом;
- какие изменения сделали;
- какой итог после проверки у пользователя.

Уточнение терминологии:

- Рабочее название файла исторически говорит про Telegram, потому что первый симптом был в `ЦентрЧатов` и Telegram-логах.
- Текущий подтверждённый тормоз относится шире: это **долгий старт общего renderer shell ChatCenter**, который грузит верхние вкладки, WebView lifecycle, diagnostics, native UI, AI/sidebar и конфиги.
- В приложении одновременно есть:
  - `ЦентрЧатов` — native-интерфейс с двумя Telegram API-учётками;
  - две отдельные Telegram WebView-вкладки;
  - `ВКонтакте` WebView;
  - `Макс` WebView;
  - `WhatsApp` WebView.
- Поэтому дальнейшие решения должны оцениваться не только по Telegram API, а по всему shell приложения и всем WebView-вкладкам.

После завершения работ файл станет историей расследования и уйдёт в архив.

---

## Симптом

При запуске приложения Telegram подключается быстро, но список чатов и UI ещё долго продолжают грузиться. В терминале видно много строк `get-chats`, `tg:chats`, `tg:chat-avatar`, `unread-bulk-sync`, `FLOOD_WAIT`.

Пользователь просил не считать аватарки главной причиной старта, потому что часть аватарок грузится уже после появления приложения.

---

## Важное разделение: два слоя Telegram

В проекте есть два независимых слоя, которые нельзя смешивать в выводах:

1. **Верхние WebView-вкладки**: обычные вкладки мессенджеров из `messengers`. У пользователя есть две отдельные Telegram WebView-вкладки, например `Telegram / БНК` и `Telega / Avtoliberty`. Они грузятся через `<webview>`, имеют отдельные `partition` и живут как веб-сессии Telegram Web.
2. **Native API-вкладка `ЦентрЧатов`**: виртуальная вкладка `native_cc`, которая рендерит `NativeApp` вместо `<webview>`. Внутри неё есть две Telegram API-учетки, например `БНК` и `Avtoliberty`, которые обслуживаются GramJS и IPC `tg:*`.

Кодовые точки:

- `src/App.jsx` добавляет `NATIVE_CC_TAB` и для него рендерит `<NativeApp />`, а обычные мессенджеры рендерит через `<webview partition={m.partition}>`.
- `src/hooks/useAppBootstrap.js` загружает сохранённые WebView-вкладки через `messengers:load`, затем добавляет `native_cc`.
- `main/main.js` и `main/handlers/mainIpcHandlers.js` настраивают Electron session для WebView `partition`.
- `main/native/*` отвечает за Telegram API-учетки внутри `ЦентрЧатов`.

Вывод ниже про повторный `loadChats()` относится к native API-слою `ЦентрЧатов`. Он не объясняет сам по себе загрузку двух верхних Telegram WebView-вкладок.

---

## Что уже найдено

### 1. Telegram-соединение само по себе быстрое

По логу пользователя:

```text
15:40:47.798 Connecting to 149.154.167.41:80
15:40:47.996 Connection complete
```

Подключение заняло около `0.2s`.

### 2. UI может запускать повторную загрузку чатов

В `src/native/modes/InboxMode.jsx` есть эффект:

```js
useEffect(() => {
  if (store.accounts.length > 0) store.loadChats()
}, [store.accounts.length])
```

При восстановлении двух аккаунтов `accounts.length` меняется два раза:

1. появился первый аккаунт → `loadChats()` грузит все доступные аккаунты;
2. появился второй аккаунт → `loadChats()` снова грузит все аккаунты.

Так первый аккаунт может получить повторный `getDialogs`.

### 3. Backend без `accountId` грузит все аккаунты

`tg:get-chats` в `main/native/telegramChatsIpc.js`:

```js
const accountIds = requestedAccountId
  ? [requestedAccountId]
  : Array.from(state.clients.keys())
```

Это правильно для ручной загрузки “всего списка”, но при постепенном restore может давать лишний проход.

### 4. Unread rescan стартует сразу после restore

`autoRestoreSessions()` запускает `startUnreadRescan()`, а тот делает первый проход через `setTimeout(doRescan, 1500)`.

Это добавляет отдельные `getDialogs` по всем аккаунтам почти сразу после восстановления.

### 5. Аватарки могут усиливать проблему, но это отдельный слой

В v0.87.118 уже был фикс, где аватарки уступают место загрузке сообщений через `state.msgRequestTs`. Но массовая загрузка аватарок всё ещё может создавать `FLOOD_WAIT` на фоне.

---

## Проверка по логу 6 мая 2026, 16:02

Файл: `%APPDATA%/ЦентрЧатов/chatcenter.log`

Новые startup-логи подтвердили повторную загрузку первого аккаунта.

### Тайминг запуска

```text
16:02:03 autoRestoreSessions start
16:02:04 restoreOneSession start known=tg_611696632
16:02:05 restoreOneSession done account=tg_611696632 ms=1583
16:02:05 loadCachedChats request
16:02:05 loadChats request accountId=all
16:02:05 get-chats start requested=all accounts=tg_611696632 count=1
16:02:05 loadChatsForAccount start account=tg_611696632
16:02:07 restoreOneSession done account=tg_638454350 ms=1348
16:02:07 autoRestoreSessions done restored=2/2 clients=2 ms=3115
16:02:07 loadChats request accountId=all
16:02:07 get-chats start requested=all accounts=tg_611696632,tg_638454350 count=2
16:02:07 loadChatsForAccount start account=tg_611696632
```

### Подтверждённый факт

`tg_611696632` начал грузиться два раза:

1. первый раз в `16:02:05`, когда восстановился только один аккаунт;
2. второй раз в `16:02:07`, когда появился второй аккаунт и renderer снова вызвал `loadChats accountId=all`.

Это даёт две параллельные `loadRestPages` для одного и того же аккаунта:

```text
16:02:10 loadRestPages page account=tg_611696632 iteration=1 count=200
16:02:10 loadRestPages page account=tg_611696632 iteration=1 count=200
16:02:11 loadRestPages page account=tg_611696632 iteration=2 count=64
16:02:11 loadRestPages page account=tg_611696632 iteration=2 count=64
```

### Сколько занимает каждый слой

| Слой | По логу |
|---|---:|
| Восстановить 2 сессии | ~3.1 сек |
| Кэш чатов | 75 мс |
| Первый `loadChats(all)` для 1 аккаунта | ~3.3 сек |
| Второй `loadChats(all)` для 2 аккаунтов | ~4.7 сек |
| Первый unread-rescan | ~6.0 сек |
| Следующие unread-rescan | ~3.7-4.6 сек каждые 15 сек |

### Дополнительный шум после старта

После первичной загрузки пошёл `FLOOD_WAIT` от аватарок:

```text
16:02:17 Sleeping for 23s on flood wait (users.GetFullUser)
16:02:22 Sleeping for 20s on flood wait (users.GetFullUser)
16:02:52 Sleeping for 21s on flood wait (users.GetFullUser)
```

Это уже фоновый слой, но он подтверждает, что лишний повтор `loadChats` усиливает нагрузку на Telegram API и увеличивает шанс упереться в лимиты.

---

## Проверка по логу 6 мая 2026, 16:10

После добавления renderer-логов в текущем `chatcenter.log` видно, что React получает отдельные WebView-вкладки и отдельно добавляет native-вкладку:

```text
16:10:20 [startup-webview] renderer ... messengers loaded webview=5 native=1 ids=telegram:persist:telegram,custom_1772704261065:persist:custom_1772704261065,whatsapp:persist:whatsapp,custom_1772779915564:persist:custom_1772779915564,custom_1772704264107:persist:custom_1772704264107
16:10:20 [startup-webview] renderer ... native tab appended id=native_cc name="ЦентрЧатов"
```

Это подтверждает, что:

- верхние вкладки, включая две Telegram WebView-вкладки пользователя, идут через список `messengers`;
- `ЦентрЧатов` не является ещё одной WebView-вкладкой Telegram, а добавляется отдельно как `native_cc`;
- анализ `tg:get-chats`, `loadRestPages`, `unread-rescan` относится к native API-аккаунтам внутри `ЦентрЧатов`.

Полные main-side логи `[startup-webview] main setupSession...` появятся после полного перезапуска приложения с версией `v0.87.121`, потому что они пишутся в main-процессе до создания окна.

---

## Проверка по логу 6 мая 2026, 16:26

После полного перезапуска `v0.87.121` лог показал главный ранний тормоз:

```text
16:26:33 [startup-main] +180ms createWindowFromManager start
16:26:33 [startup-main] +261ms mainWindow created
16:26:33 [startup-main] +476ms initTelegramHandler done
16:27:18 [startup-main] +45660ms dom-ready
16:27:18 [startup-main] +45661ms did-finish-load
```

До `dom-ready` проходит около `45.6s`. В этот момент native Telegram API ещё не начал `autoRestoreSessions`, а WebView-вкладки ещё не начали `did-start-loading`.

Значит эта пауза не от Telegram API, не от аватарок и не от двух native-аккаунтов. Она происходит до запуска React-приложения.

Причина в dev-запуске:

```js
// scripts/dev.cjs
fs.rmSync(node_modules/.vite, { recursive: true, force: true })
```

`scripts/dev.cjs` очищал Vite cache на каждом запуске. Это заставляло Vite каждый раз делать холодный старт renderer. Такая защита была добавлена для ловушки 44, но теперь она сама стала причиной долгого старта в dev-режиме.

Фикс v0.87.122: cache больше не очищается автоматически. Очистка осталась только явно:

```powershell
npm run dev -- --clear-cache
```

или:

```powershell
$env:CLEAR_VITE_CACHE='1'; npm run dev
```

Проверка `v0.87.122` показала, что пауза не ушла:

```text
16:33:49 [startup-main] +208ms createWindowFromManager start
16:33:49 [startup-main] +296ms mainWindow created
16:34:34 [startup-main] +45456ms dom-ready
```

Итог по гипотезе: **не помогло для текущей долгой загрузки**.

Значит автоочистка cache была реальной старой проблемой проекта, но не причиной текущих `45s`. В `v0.87.123` добавлены `[startup-window]` логи вокруг `BrowserWindow.loadURL/loadFile`, чтобы следующий запуск показал, где именно висит окно до `dom-ready`.

Что делать дальше:

1. Запустить приложение на `v0.87.123`.
2. Проверить в `chatcenter.log` строки `[startup-window]`.
3. По ним разделить задержку:
   - если долго до `did-start-loading` — Electron долго начинает загрузку URL/файла;
   - если долго между `did-start-loading` и `dom-ready` — тормозит renderer/Vite bundle/Chromium загрузка;
   - если есть `did-fail-load` — проблема в загрузке dev server или пути renderer.
4. Только после этого выбирать фикс. Сейчас преждевременно трогать Telegram API или WebView-вкладки как причину первых `45s`, потому что они стартуют уже после `dom-ready`.

---

## Проверка по логу 6 мая 2026, 16:57

После перезапуска `v0.87.123` новые `[startup-window]` логи уточнили место паузы:

```text
16:57:09 [startup-window] +54ms loadURL start http://localhost:5173
16:57:09 [startup-window] +73ms did-start-loading
16:57:51 [startup-window] +42646ms dom-ready
16:57:51 [startup-window] +42648ms did-finish-load
16:57:51 [startup-window] +42651ms loadURL resolved http://localhost:5173
```

Факт: Electron почти сразу начинает загрузку `http://localhost:5173`, но renderer-страница доходит до `dom-ready` только через `~42.6s`.

Что это исключает:

- не Telegram API: `autoRestoreSessions` начинается уже после `dom-ready`;
- не native API-аккаунты: `loadChats` начинается после запуска renderer;
- не WebView-вкладки: их lifecycle начинается после renderer bootstrap;
- не аватарки и `FLOOD_WAIT`: они идут ещё позже.

Что пока остаётся:

- Vite dev server/Chromium долго загружает module graph renderer;
- либо задержка внутри import graph до выполнения `src/main.jsx`;
- либо тяжёлый импорт/инициализация до первого React render.

В `v0.87.124` добавлен следующий слой диагностики:

- `src/boot-probe.js` — отдельный лёгкий module script перед `src/main.jsx`;
- `[startup-renderer] boot-probe...` — показывает, когда браузер вообще дошёл до первого module script;
- `[startup-renderer] main...` — показывает этапы `main.jsx`: до imports, React, `react-dom`, CSS, `App`, render.

Следующий запуск должен ответить на главный вопрос: `42s` уходят **до** первого module script или **внутри** imports `main.jsx`.

---

## Проверка по логу 6 мая 2026, 17:38

После перезапуска `v0.87.124` появились `[startup-renderer]` логи:

```text
17:38:33 [startup-window] +54ms loadURL start http://localhost:5173
17:38:33 [startup-window] +80ms did-start-loading
17:38:41 [startup-renderer] boot-probe +0ms module script reached before main.jsx
17:38:41 [startup-renderer] main +0ms module start before imports
17:38:41 [startup-window] +8476ms dom-ready
17:38:41 [startup-renderer] main +18ms react imported
17:38:41 [startup-renderer] main +53ms react-dom imported
17:39:01 [startup-renderer] main +19503ms index.css imported
17:39:20 [startup-renderer] main +38652ms App imported
17:39:20 [startup-renderer] main +38652ms render start
17:39:20 [startup-renderer] main +38654ms render scheduled
```

Новый вывод:

- браузер доходит до первого module script не через `42s`, а примерно через `8.5s`;
- `dom-ready` теперь тоже около `8.5s`, потому что `main.jsx` временно переведён на dynamic imports;
- основная видимая задержка UI теперь подтверждена внутри renderer import graph:
  - `index.css` импортируется около `19.5s`;
  - `App` импортируется ещё около `19.1s`;
  - суммарно до React render около `38.6s` после старта `main.jsx`.

Что это значит:

- начальные `45s` не являются одной операцией Telegram/WebView/native;
- значимая часть уходит на dev-трансформацию renderer ресурсов Vite;
- первая большая точка — Tailwind/CSS (`src/index.css`);
- вторая большая точка — импорт `App.jsx` со всем деревом компонентов, hooks, native UI и WebView tooling.

Следующие рабочие направления:

1. Разобрать CSS/Tailwind dev cost: почему `@tailwind base/components/utilities` занимает около `19.5s`.
2. Разобрать `App` import graph: вынести тяжёлые ветки в lazy/dynamic imports, особенно то, что не нужно до первого экрана.
3. После каждого изменения проверять `[startup-renderer] index.css imported` и `[startup-renderer] App imported`.

---

## Что сделано в v0.87.125

Выполнен первый безопасный шаг оптимизации стартового import graph.

Из `App.jsx` убраны статические импорты компонентов, которые не нужны для первого экрана и показываются только условно:

- `AddMessengerModal`;
- `SettingsPanel`;
- `TemplatesPanel`;
- `AutoReplyPanel`;
- `NotifLogModal`.

Они переведены на `React.lazy(() => import(...))` и обёрнуты в `Suspense fallback={null}`.

Что специально не трогали:

- `NativeApp` — потому что `ЦентрЧатов` может быть важной стартовой вкладкой;
- `AISidebar` — видимая часть интерфейса по умолчанию;
- `TabBar`, WebView setup, Telegram/native IPC, аккаунты и загрузка чатов.

Почему это безопасный шаг:

- меняется только момент загрузки кода условных окон;
- внутренняя логика модалок и панелей не менялась;
- основной экран, native API и WebView-вкладки не менялись.

Что проверять после запуска `v0.87.125`:

- `[startup-renderer] main ... App imported` — должен стать меньше, если lazy дал эффект;
- открыть настройки, добавление мессенджера, шаблоны, автоответ и лог уведомлений — они должны открываться как раньше;
- если первый клик по модалке чуть дольше обычного, это ожидаемо: код теперь догружается в момент открытия.

---

## Проверка по логу 6 мая 2026, 17:52 и 17:53

Пользователь перезапустил приложение два раза. В логе есть два запуска `v0.87.125`.

### Запуск 17:52

```text
17:52:00 === ChatCenter v0.87.125 start ===
17:52:09 [startup-renderer] main +0ms module start before imports
17:52:25 [startup-renderer] main +16782ms index.css imported
17:52:45 [startup-renderer] main +36715ms App imported
17:52:45 [startup-renderer] main +36717ms render scheduled
```

### Запуск 17:53

```text
17:53:33 === ChatCenter v0.87.125 start ===
17:53:41 [startup-renderer] main +0ms module start before imports
17:53:46 [startup-renderer] main +5547ms index.css imported
17:54:17 [startup-renderer] main +35936ms App imported
17:54:17 [startup-renderer] main +35938ms render scheduled
```

Вывод:

- `React.lazy` для условных панелей дал небольшой эффект: `App imported` снизился примерно с `38.6s` на `v0.87.124` до `35.9-36.7s` на `v0.87.125`.
- Второй перезапуск сильно прогрел CSS: `index.css` снизился с `16.8s` до `5.5s`.
- Главная оставшаяся проблема: `App import graph` всё ещё занимает около `36s`.
- Значит первый безопасный шаг помог, но недостаточно. Следующий безопасный кандидат — разбирать тяжёлые статические импорты, которые остались в `App.jsx`.

Что пока не трогали и почему:

- `NativeApp` — может быть стартовой рабочей вкладкой `ЦентрЧатов`;
- `AISidebar` — видимая панель по умолчанию, её lazy-загрузка может изменить первый кадр;
- `TabBar`, WebView setup и Telegram IPC — это основа стартового экрана и маршрутизации.

Следующий шаг должен быть отдельным и проверяемым: либо аккуратно lazy-грузить `AISidebar` с явным fallback, либо дробить `NativeApp`/native UI так, чтобы первый экран не тянул весь native import graph сразу.

---

## Что сделано в v0.87.126

По запросу пользователя выполнен следующий безопасный шаг оптимизации стартового renderer import graph.

Что изменено в `App.jsx`:

- `AISidebar` переведён со статического import на `React.lazy`;
- `NativeApp` переведён со статического import на `React.lazy`;
- `LogModal` переведён со статического import на `React.lazy`;
- `ConfirmCloseModal` переведён со статического import на `React.lazy`;
- для `NativeApp` добавлен `NativeAppFallback`;
- для `AISidebar` добавлен `AISidebarFallback`, который сохраняет ширину панели на первом кадре.

Что специально не менялось:

- `createWebviewSetup`;
- `useAppBootstrap`;
- `useAppIPCListeners`;
- `nativeStore`;
- `telegramAuth`;
- `telegramChats`;
- `telegramChatsIpc`;
- логика аккаунтов, сессий, загрузки чатов, unread rescan и WebView lifecycle.

Почему это безопаснее, чем трогать Telegram:

- меняется только момент загрузки React-компонентов;
- API Telegram и хранение аккаунтов не получают новых веток поведения;
- если lazy chunk грузится чуть позже, пользователь видит fallback, а не сломанный runtime;
- откат/проверка ограничены `App.jsx` и структурными тестами.

Что проверить после запуска `v0.87.126`:

- `[startup-renderer] main ... App imported` — должен стать меньше, если `AISidebar`/`NativeApp` действительно были тяжёлыми;
- `[startup-renderer] main ... render scheduled` — должен идти сразу после `App imported`;
- native-вкладка `ЦентрЧатов` должна открыться и восстановить обе Telegram-учётки;
- AI-панель должна появиться после догрузки chunk;
- верхние WebView-вкладки Telegram/Telega/VK/WhatsApp/Max должны стартовать как раньше.

Результат production build после изменения:

```text
App chunk: 178.18 KB
AISidebar chunk: 71.22 KB
NativeApp chunk: 366.61 KB
```

Для сравнения: после `v0.87.125` стартовый `App` chunk был около `623.8 KB`. Значит `v0.87.126` действительно вынес большую часть тяжёлого стартового кода из первого `App` chunk. Реальную скорость в dev-режиме нужно подтвердить следующим перезапуском по строкам `[startup-renderer]`.

---

## Проверка по логу v0.87.126, 6 мая 2026 18:06

Пользователь перезапустил приложение после `v0.87.126`.

Ключевые строки:

```text
18:06:44 === ChatCenter v0.87.126 start ===
18:06:44 [startup-window] +54ms loadURL start http://localhost:5173
18:06:52 [startup-renderer] main +0ms module start before imports
18:06:52 [startup-window] +7839ms dom-ready
18:07:10 [startup-renderer] main +17808ms index.css imported
18:07:22 [startup-renderer] main +30186ms App imported
18:07:22 [startup-renderer] main +30188ms render scheduled
18:07:22 [startup-webview] renderer +4ms messengers loaded webview=5 native=1
```

Сравнение:

- `v0.87.124`: `App imported` около `38.6s`;
- `v0.87.125`: `App imported` около `35.9-36.7s`;
- `v0.87.126`: `App imported` около `30.2s`.

Вывод:

- `v0.87.126` помог: стартовый `App` import graph стал быстрее примерно на `5.7-6.5s` относительно `v0.87.125`.
- Это меньше, чем ожидалось по production chunk, потому что dev-режим Vite всё ещё тратит много времени на `index.css` (`17.8s`) и оставшийся import graph после CSS (`~12.4s`).
- Telegram-сессии восстановились быстро: `autoRestoreSessions done restored=2/2 ... ms=1608`.
- WebView-вкладки начали грузиться только после `render scheduled`, как и раньше; они не причина задержки до первого UI.

Следующий кандидат:

- Проверять `index.css`/Tailwind dev pipeline, потому что на этом запуске CSS занял почти `18s`.
- Отдельно замерить, что именно остаётся в `App` после CSS: `TabBar`, `createWebviewSetup`, hooks и общие утилиты.
- Telegram/native API пока не трогать как причину первичного запуска: по логу он не держит `App imported`.

---

## Стоп-точка после жалобы: native-аккаунты не видны в UI после v0.87.126

Пользователь показал экран native-вкладки `ЦентрЧатов`:

```text
Нет подключённых аккаунтов
Подключите Telegram чтобы начать работу
```

Важно: проверка файлов и лога показала, что Telegram-сессии не удалены.

Факты по файлам `%APPDATA%/ЦентрЧатов`:

```text
tg-sessions/tg_611696632.txt exists, 369 bytes
tg-sessions/tg_638454350.txt exists, 369 bytes
tg-cache-tg_611696632.json exists
tg-cache-tg_638454350.json exists
chatcenter.json exists
```

Факты по логу `v0.87.126`:

```text
18:06:52 [startup-tg] autoRestoreSessions files=2
18:06:53 [startup-tg] restoreOneSession done account=tg_611696632 name="БНК" ms=791
18:06:54 [startup-tg] restoreOneSession done account=tg_638454350 name="Avtoliberty" ms=813
18:06:54 [startup-tg] autoRestoreSessions done restored=2/2 clients=2 ms=1608
18:07:22 [startup-renderer] main +30186ms App imported
18:07:22 [startup-renderer] main +30188ms render scheduled
```

Вывод по причине:

- Аккаунты **не вылетели из Telegram и не удалились с диска**.
- Main process восстановил обе сессии успешно.
- Проблема в UI-состоянии renderer: `NativeApp` после `v0.87.126` стал `React.lazy`.
- Из-за lazy-загрузки `NativeApp` и `useNativeStore()` монтируются только после `App imported/render scheduled`.
- `autoRestoreSessions` в main стартует раньше и успевает отправить `tg:account-update` до того, как `attachTelegramIpcListeners()` подписался на события.
- Эти ранние `tg:account-update` события не буферизуются, поэтому store остаётся с `accounts: []`, хотя main уже имеет `state.accounts` и `state.clients`.

Почему остановились:

- Пользователь попросил сначала понять причину, а не продолжать менять код.
- Найдена вероятная регрессия именно от `v0.87.126`: lazy-загрузка `NativeApp` безопасна для bundle size, но небезопасна для event-only синхронизации аккаунтов.
- Дальше нельзя продолжать оптимизацию старта, пока не восстановлена надёжная синхронизация native-аккаунтов.

Безопасные варианты исправления, которые нужно выбрать отдельным шагом:

1. **Самый быстрый откат риска:** вернуть `NativeApp` на статический import, оставить lazy для `AISidebar`, `LogModal`, `ConfirmCloseModal`.
   - Плюс: подписки native store снова появятся раньше.
   - Минус: часть ускорения `v0.87.126` потеряется.

2. **Правильнее архитектурно:** добавить IPC snapshot, например `tg:get-accounts`, который при mount `useNativeStore()` забирает текущие `state.accounts` из main.
   - Плюс: UI не зависит от того, успел ли он поймать ранний event.
   - Минус: нужно менять main IPC + renderer store + тесты.

3. **Комбинированно:** временно вернуть `NativeApp` static import, потом отдельной версией сделать `tg:get-accounts` и только после этого снова пробовать lazy `NativeApp`.
   - Это самый безопасный путь после текущего инцидента.

Текущее решение: остановиться на расследовании. Код исправления пока не внесён.

---

## Что сделано в v0.87.127

По запросу пользователя выполнен безопасный фикс после регрессии `v0.87.126`.

Изменения:

- `NativeApp` возвращён со `React.lazy` на статический import в `App.jsx`;
- `AISidebar`, `LogModal`, `ConfirmCloseModal` оставлены lazy, потому что они не держат Telegram account state;
- в main добавлен IPC handler `tg:get-accounts`;
- `tg:get-accounts` возвращает:
  - `accounts: Array.from(state.accounts.values())`;
  - `activeAccountId`;
- `useNativeStore()` после установки `tg:*` listeners вызывает `window.api.invoke('tg:get-accounts')`;
- полученные accounts мержатся в renderer store;
- добавлены startup-логи:
  - `[startup-native] accounts snapshot request`;
  - `[startup-native] accounts snapshot response ...`.

Почему это безопасно:

- session-файлы не трогаются;
- `tg:remove-account`, cleanup, logout, cache wipe не менялись;
- Telegram clients в main не пересоздаются;
- snapshot только читает уже восстановленное `state.accounts`;
- если renderer пропустил ранний `tg:account-update`, он получает состояние через request/response;
- если renderer не пропустил event, snapshot аккуратно мержит accounts по `id`, не дублируя их.

Почему `NativeApp` пока не возвращён в lazy:

- именно lazy `NativeApp` вызвал race между `autoRestoreSessions` и подпиской renderer;
- snapshot снижает риск, но после инцидента безопаснее сначала проверить живой запуск со static `NativeApp`;
- повторную lazy-загрузку `NativeApp` можно рассматривать только после подтверждения, что `tg:get-accounts` стабильно восстанавливает UI при перезапуске.

Что проверить после запуска `v0.87.127`:

```text
=== ChatCenter v0.87.127 start ===
[startup-tg] autoRestoreSessions done restored=2/2
[startup-native] accounts snapshot request
[startup-native] accounts snapshot response ok=true accounts=2
```

Ожидаемый UI:

- native-вкладка `ЦентрЧатов` показывает два Telegram-аккаунта (`БНК`, `Avtoliberty`);
- экран `Нет подключённых аккаунтов` больше не появляется при наличии session-файлов;
- WebView-вкладки Telegram/Telega остаются отдельными и не связаны с этим fixed path.

---

## Что сделано в v0.87.120-v0.87.121

Добавлены диагностические логи запуска, которые пишутся в общий `chatcenter.log`, а значит видны в окне логов приложения:

- `[startup-tg] autoRestore...` — восстановление сессий;
- `[startup-tg] restoreOneSession...` — подключение конкретного аккаунта;
- `[startup-tg] get-chats...` — кто запросил чаты и сколько аккаунтов грузится;
- `[startup-tg] loadChatsForAccount...` — длительность первой страницы чатов;
- `[startup-tg] loadRestPages...` — фоновые страницы;
- `[startup-tg] unread-rescan...` — фоновая сверка счётчиков;
- `[startup-native] loadChats...` — вызов загрузки со стороны renderer.
- `[startup-webview] main stored messengers...` — какие WebView-вкладки взяты из настроек до создания окна;
- `[startup-webview] main setupSession...` — какие Electron `partition` готовятся для WebView;
- `[startup-webview] ipc messengers:load...` — какие WebView-вкладки renderer получил через IPC;
- `[startup-webview] renderer messengers loaded...` — сколько WebView-вкладок отрисует React и что отдельно добавлен `native_cc`;
- `[startup-webview] ref-init/dom-ready/did-start-loading/did-stop-loading/did-finish-load...` — жизненный цикл каждой WebView-вкладки.

Проверять в приложении: открыть лог ChatCenter и смотреть фильтры `Native` и/или общий поиск по `startup-webview`, `startup-native`, `startup-tg`.

---

## Что смотреть в новых логах

| Лог | Что означает |
|---|---|
| `[startup-native] loadChats request accountId=all` | Renderer попросил загрузить все аккаунты |
| `[startup-tg] get-chats start requested=all accounts=...` | Main начал загрузку всех аккаунтов |
| `[startup-tg] loadChatsForAccount start account=...` | Началась первая страница чатов аккаунта |
| `[startup-tg] loadChatsForAccount done account=... firstPage=... ms=...` | Первая страница аккаунта загружена |
| `[startup-tg] loadRestPages page account=... page=... count=...` | Идёт фоновая дозагрузка старых страниц |
| `[startup-tg] unread-rescan start clients=...` | Началась фоновая сверка unread |
| `[startup-tg] unread-rescan done updates=... ms=...` | Сверка unread закончилась |
| `[startup-webview] main stored messengers count=... ids=...` | Какие верхние WebView-вкладки вообще участвуют в старте |
| `[startup-webview] main setupSession id=... partition=...` | Для какой WebView-вкладки готовится отдельная Electron-сессия |
| `[startup-webview] renderer messengers loaded webview=... native=1 ids=...` | Renderer получил WebView-вкладки и отдельно добавил `ЦентрЧатов` |
| `[startup-webview] dom-ready id=... name=... partition=...` | Конкретная WebView-вкладка дошла до DOM-ready |
| `[startup-webview] did-finish-load id=... name=... partition=...` | Конкретная WebView-вкладка завершила основную загрузку |

Если после появления второго аккаунта снова видно `loadChatsForAccount start` для первого аккаунта — повторная загрузка подтверждена.

---

## Предварительный безопасный фикс

Пока не применён.

Самый безопасный путь: в `InboxMode.jsx` грузить только новые аккаунты, которых ещё не грузили, а не вызывать `store.loadChats()` для всех при каждом изменении `accounts.length`.

Почему это безопаснее:
- `tg:get-chats` уже принимает `{ accountId }`;
- `nativeStoreIpc.js` уже мержит `tg:chats` по конкретному `accountId`;
- единая лента multi-account не ломается;
- `unreadCount` остаётся серверным, как требует `mistakes/native-scroll-unread.md`;
- отправка сообщений продолжает маршрутизироваться по `chatId = accountId:chatId`.

---

## Подтверждение фикса v0.87.127 (7 мая 2026)

Пользователь подтвердил: после `v0.87.127` native-аккаунты снова отображаются, экран `Нет подключённых аккаунтов` больше не воспроизводится при наличии session-файлов.

Свежий лог запуска подтвердил причину и результат:

```text
09:06:21 === ChatCenter v0.87.127 start ===
09:07:07 [startup-tg] autoRestoreSessions start
09:07:08 [startup-tg] autoRestoreSessions done restored=2/2 clients=2 ms=844
09:07:25 [startup-native] accounts snapshot request
09:07:25 [startup-native] accounts snapshot response ok=true accounts=2 active=tg_611696632 ms=74
```

Итог по регрессии:

- session-файлы не были потеряны;
- Telegram clients в main восстановились быстро: 2 аккаунта за `844 ms`;
- renderer получил актуальные accounts через `tg:get-accounts`;
- `NativeApp` оставлен static import, чтобы подписка native-store и snapshot работали сразу после первого render.

Этот дефект считается закрытым. Возвращать `NativeApp` в lazy можно только отдельной маленькой версией после нового замера и проверки, что snapshot гарантированно покрывает race.

## Текущее состояние долгой загрузки после фикса

Долгий старт не исчез, но свежие логи теперь показывают другой узкий участок:

```text
09:06:22 [startup-window] loadURL start http://localhost:5173
09:07:07 [startup-renderer] boot-probe +0ms module script reached before main.jsx
09:07:07 [startup-window] dom-ready +45308ms
09:07:07 [startup-renderer] main +0ms module start before imports
09:07:13 [startup-renderer] main +6318ms index.css imported
09:07:25 [startup-renderer] main +18080ms App imported
09:07:25 [startup-renderer] main +18083ms render scheduled
```

Вывод:

- `autoRestoreSessions` не причина долгого старта: он начинается уже после `dom-ready` и занимает меньше секунды;
- загрузка чатов тоже не причина первого экрана: `tg:get-chats` стартует после `render scheduled`;
- аватарки не причина первого экрана: они идут позже;
- главный оставшийся тормоз — dev-загрузка renderer через `http://localhost:5173`;
- первая пауза `loadURL -> boot-probe/dom-ready` около `45s`, то есть даже крошечный `boot-probe.js` не доходит до выполнения;
- вторая пауза внутри renderer import graph: `index.css` около `6.3s`, затем `App imported` около `18.1s`.

Вероятные причины по коду:

1. **Vite dev cold transform / dependency optimize.** `scripts/dev.cjs` запускает `electron-vite dev`, а окно сразу грузит `http://localhost:5173`. Если Vite ещё трансформирует graph или прогревает cache, Electron ждёт модульные скрипты.
2. **Большой стартовый import graph App.** `App.jsx` статически тянет `webviewSetup.js`, `consoleMessageHandler.js`, `messengerConfigs.js`, `TabBar.jsx`, все hooks и `NativeApp.jsx`. После возврата `NativeApp` static это безопасно для аккаунтов, но снова увеличивает первый chunk.
3. **Native inner graph можно дробить безопаснее, чем весь NativeApp.** Корневой `NativeApp` должен оставаться early/static для `useNativeStore`, но тяжёлые внутренние экраны (`InboxMode`, `AccountContextMenu`, login UI) можно рассматривать для lazy отдельно после тестов.
4. **Unread rescan идёт каждые 15 секунд и иногда занимает 3-13s.** Это не блокирует первый render, но может создавать нагрузку сразу после старта и мешать субъективному ощущению готовности.

Что проверять дальше безопасно:

1. Сравнить dev и production startup:
   - dev: `loadURL http://localhost:5173`;
   - production/preview: `loadFile out/renderer/index.html`.
   Если в production паузы `45s` нет, проблема в Vite dev transform, а не в runtime-коде приложения.
2. Добавить более точные renderer import marks:
   - до/после `webviewSetup.js`;
   - до/после `NativeApp.jsx`;
   - до/после `TabBar.jsx`;
   - до/после hooks group.
   Это покажет, какой статический import реально даёт `App imported +18s`.
3. Рассмотреть безопасное дробление:
   - оставить `NativeApp` static;
   - внутри `NativeApp` сделать lazy только для тяжёлого `InboxMode`, сохранив `useNativeStore` в корне;
   - не менять session/auth/remove-account логику.
4. Отдельно замерить `unread-rescan` после старта:
   - сейчас он сканирует `666` чатов для 2 аккаунтов;
   - свежий запуск: первый проход `2589 ms`, дальше в старых логах встречались `11-13s`;
   - оптимизировать только после подтверждения, что он мешает UI, а не просто идёт в фоне.

---

## Диагностика без изменения поведения (7 мая 2026)

По запросу пользователя добавлены только startup-логи. Поведение приложения не менялось:

- не менялись Telegram session/auth/remove-account;
- не менялись загрузка чатов, unread, аватарки;
- не менялись lazy/static решения;
- не менялись IPC-контракты;
- не менялись UI-состояния и порядок render.

Что добавлено:

- `src/boot-probe.js` теперь создаёт общий `window.__ccStartupMark(scope, message)`;
- `src/main.jsx` использует общий таймер, чтобы все renderer-метки были в одной шкале времени;
- добавлены module-eval метки в:
  - `src/App.jsx`;
  - `src/utils/webviewSetup.js`;
  - `src/utils/consoleMessageHandler.js`;
  - `src/utils/messengerConfigs.js`;
  - `src/components/TabBar.jsx`;
  - `src/native/NativeApp.jsx`;
  - `src/native/modes/InboxMode.jsx`.

Что смотреть после следующего запуска:

```text
[startup-renderer] boot-probe ...
[startup-renderer] main ... index.css imported
[startup-renderer] module:messengerConfigs ...
[startup-renderer] module:consoleMessageHandler ...
[startup-renderer] module:webviewSetup ...
[startup-renderer] module:InboxMode ...
[startup-renderer] module:NativeApp ...
[startup-renderer] module:TabBar ...
[startup-renderer] module:App ...
[startup-renderer] main ... App imported
```

Как читать:

- если пауза остаётся **до `boot-probe`**, проблема в dev server / Vite transform / отдаче первого module script;
- если большая пауза между `index.css imported` и конкретной `module:*`, тяжёлый участок рядом с этим import graph;
- если `module:InboxMode` или `module:NativeApp` сильно поздние, следующий безопасный кандидат — дробить внутренний native graph, оставив сам `NativeApp` static;
- если все `module:*` быстрые, а `App imported` всё равно поздний, нужно добавлять более мелкие метки в зависимости найденного модуля.

Проверки после добавления логов:

```text
node src\__tests__\appStructure.test.cjs
node src\__tests__\integrationChains.test.cjs
node src\__tests__\multiAccount.test.cjs
npm.cmd run lint
node src\__tests__\fileSizeLimits.test.cjs
node src\__tests__\memoryBankSizeLimits.test.cjs
node src\__tests__\featuresReferences.test.cjs
npm.cmd run test:vitest
npm.cmd run build
```

Все прошли. Production build после добавления логов:

```text
App-CD0p19lm.js      545.81 kB
client-uKZhQDIG.js   536.36 kB
```

Это подтверждает, что стартовый `App` chunk остаётся крупным после безопасного возврата `NativeApp` на static import. Следующий кодовый шаг делать только после живого запуска с новыми `module:*` метками.

---

## Результат запуска с module-marks (7 мая 2026, 09:40)

Пользователь перезапустил приложение после добавления диагностических меток. Поведение приложения не менялось.

Ключевые строки:

```text
09:40:59 [startup-window] +56ms loadURL start http://localhost:5173
09:41:38 [startup-renderer] boot-probe +0ms module script reached before main.jsx
09:41:38 [startup-window] +38204ms dom-ready
09:41:38 [startup-renderer] main +2ms module start before imports
09:41:38 [startup-renderer] main +249ms react-dom imported
09:41:43 [startup-renderer] main +5203ms index.css imported
09:41:55 [startup-renderer] module:messengerConfigs +17001ms module evaluated
09:41:55 [startup-renderer] module:consoleMessageHandler +17002ms module evaluated
09:41:55 [startup-renderer] module:webviewSetup +17002ms module evaluated
09:41:55 [startup-renderer] module:TabBar +17002ms module evaluated
09:41:55 [startup-renderer] module:InboxMode +17010ms module evaluated
09:41:55 [startup-renderer] module:NativeApp +17010ms module evaluated after native static imports
09:41:55 [startup-renderer] module:App +17010ms module evaluated after static imports
09:41:55 [startup-renderer] main +17011ms App imported
09:41:55 [startup-renderer] main +17014ms render scheduled
```

Разбор:

- `loadURL -> boot-probe/dom-ready`: около `38.2s`. Это до выполнения нашего `main.jsx`, значит главный тормоз находится в dev-загрузке renderer/Vite/первой отдаче module script.
- `react + react-dom`: около `249ms`, не проблема.
- `index.css`: до `5.2s` от старта renderer. CSS даёт заметную, но не главную паузу.
- `index.css imported -> App imported`: примерно `11.8s`. Все `module:*` метки появились почти одновременно, значит текущей детализации недостаточно: задержка происходит во время разрешения/трансформации статического import graph `App`, до выполнения тел модулей.
- `autoRestoreSessions`: `restored=2/2 clients=2 ms=1109`, не причина долгого старта.
- `tg:get-accounts`: `accounts=2 ms=136`, фикс аккаунтов работает.
- `tg:get-chats`: стартует только после `render scheduled`, значит не блокирует первый render.

Текущий вывод:

1. Основная причина долгого старта сейчас — dev pipeline (`electron-vite dev` / Vite transform / cold module serving), а не Telegram API.
2. Второй кандидат — большой `App` static import graph, но его надо мерить глубже: текущие `module:*` метки показывают только момент завершения загрузки модулей, не стоимость каждого import request/transform.
3. `NativeApp` нельзя снова делать lazy целиком без отдельного теста, потому что это уже ломало раннюю синхронизацию аккаунтов.

Самый безопасный следующий диагностический шаг:

- не менять runtime-поведение;
- добавить в `main.jsx` временный диагностический режим импорта `App` по слоям:
  - сначала lightweight imports;
  - затем `webviewSetup`;
  - затем `NativeApp` graph;
  - затем оставшийся `App`;
- либо добавить отдельный test-only/dev-only `startup-import-probe.js`, который импортирует подозрительные модули по одному и логирует длительность.

Цель следующего шага — понять, что именно создаёт `App imported +11.8s`: Vite transform конкретного модуля или весь graph сразу.

---

## Что сделано в v0.87.128

Добавлена диагностика готовности Vite dev-server перед загрузкой окна.

Изменение:

- файл: `main/utils/windowManager.js`;
- только dev-режим (`isDev`);
- перед `BrowserWindow.loadURL('http://localhost:5173')` вызывается `probeDevRenderer`;
- probe делает `http.get('http://localhost:5173')`;
- timeout ограничен `3000ms`;
- при success логирует HTTP status и длительность;
- при error/timeout логирует ошибку и длительность;
- после probe обычный `loadURL` всегда продолжается через `finally`.

Ожидаемые новые строки:

```text
[startup-window] +...ms dev-server probe start http://localhost:5173 timeout=3000ms
[startup-window] +...ms dev-server probe done status=200 ms=...
[startup-window] +...ms loadURL start http://localhost:5173
```

или при проблеме:

```text
[startup-window] +...ms dev-server probe failed ms=3000 err="timeout 3000ms"
[startup-window] +...ms loadURL start http://localhost:5173
```

Как читать следующий запуск:

- если probe отвечает быстро, а `loadURL -> boot-probe` всё равно занимает десятки секунд — проблема не в доступности dev-server `/`, а в отдаче/transformation module scripts (`/src/boot-probe.js`, `/src/main.jsx`, graph);
- если probe сам висит или падает — проблема до renderer: dev-server ещё не готов, порт занят, Vite холодно стартует или Windows/AV тормозит файловые операции;
- если probe быстрый и `boot-probe` быстрый, но `App imported` долгий — фокус на renderer import graph.

Поведение приложения не менялось:

- Telegram sessions/auth/accounts не тронуты;
- `tg:get-accounts`, `tg:get-chats`, unread, avatars не тронуты;
- React UI и порядок render не менялись;
- probe только пишет startup-логи.

Проверки:

```text
node src\__tests__\mainProcess.test.cjs
node src\__tests__\mainRuntime.test.cjs
node src\__tests__\memoryBankSizeLimits.test.cjs
node src\__tests__\featuresReferences.test.cjs
npm.cmd run lint
node src\__tests__\fileSizeLimits.test.cjs
npm.cmd run test:vitest
npm.cmd run build
```

Все прошли.

---

## Результат запуска с dev-server probe (7 мая 2026, 09:52)

Пользователь перезапустил приложение после `v0.87.128`.

Ключевые строки:

```text
09:52:57 === ChatCenter v0.87.128 start ===
09:52:57 [startup-window] +65ms dev-server probe start http://localhost:5173 timeout=3000ms
09:52:59 [startup-window] +2159ms dev-server probe done status=200 ms=2094
09:52:59 [startup-window] +2160ms loadURL start http://localhost:5173
09:53:09 [startup-renderer] boot-probe +0ms module script reached before main.jsx
09:53:09 [startup-window] +12571ms dom-ready
09:53:09 [startup-renderer] main +94ms react-dom imported
09:53:32 [startup-renderer] main +23053ms index.css imported
09:53:46 [startup-renderer] module:App +36371ms module evaluated after static imports
09:53:46 [startup-renderer] main +36373ms render scheduled
09:53:46 [startup-native] accounts snapshot response ok=true accounts=2 active=tg_611696632 ms=57
```

Новый вывод:

- Vite `/` отвечает: `status=200`, но медленно — `2094ms`.
- Главная старая пауза `loadURL -> boot-probe` стала меньше: около `10.4s` после `loadURL`, а не `38-45s`.
- Значит проблема не просто в недоступном dev-server: `/` доступен, но module scripts всё ещё доходят медленно.
- Самый большой участок этого запуска уже внутри renderer:
  - `react-dom imported -> index.css imported`: примерно `23s`;
  - `index.css imported -> App imported`: примерно `13.3s`;
  - всего `main.jsx -> render scheduled`: `36.37s`.
- Telegram restore снова быстрый и не блокирует первый render:
  - `autoRestoreSessions done restored=2/2 clients=2 ms=1080`;
  - `accounts snapshot response ok=true accounts=2 ms=57`.

Текущий приоритет расследования:

1. Замерить CSS отдельно: почему `await import('./index.css')` занял `23s`.
2. Замерить module requests по Vite: `/src/index.css`, `/src/App.jsx`, CSS imports, generated deps.
3. После этого решать, что делать:
   - если CSS transform медленный — искать Tailwind/PostCSS/Vite cache/Windows Defender;
   - если App graph медленный — дробить import graph;
   - если оба быстрые при production build — проблема dev-only, можно не оптимизировать runtime.

---

## Что добавлено после запуска v0.87.128

Расширена dev-only диагностика Vite:

- кроме `/`, теперь перед `loadURL` probe последовательно проверяет:
  - `/src/boot-probe.js`;
  - `/src/main.jsx`;
  - `/src/index.css`;
  - `/src/App.jsx`;
- timeout увеличен до `5000ms` на каждый URL;
- `loadURL` всё равно продолжается через `finally`, даже если любой probe упал;
- поведение приложения не менялось.

Ожидаемые строки следующего запуска:

```text
[startup-window] +...ms dev-server probe start http://localhost:5173 timeout=5000ms
[startup-window] +...ms dev-server probe done status=200 ms=...
[startup-window] +...ms dev-module probe /src/boot-probe.js start http://localhost:5173/src/boot-probe.js timeout=5000ms
[startup-window] +...ms dev-module probe /src/boot-probe.js done status=200 ms=...
[startup-window] +...ms dev-module probe /src/main.jsx start http://localhost:5173/src/main.jsx timeout=5000ms
[startup-window] +...ms dev-module probe /src/main.jsx done status=200 ms=...
[startup-window] +...ms dev-module probe /src/index.css start http://localhost:5173/src/index.css timeout=5000ms
[startup-window] +...ms dev-module probe /src/index.css done status=200 ms=...
[startup-window] +...ms dev-module probe /src/App.jsx start http://localhost:5173/src/App.jsx timeout=5000ms
[startup-window] +...ms dev-module probe /src/App.jsx done status=200 ms=...
[startup-window] +...ms loadURL start http://localhost:5173
```

Как читать:

- если `/src/index.css` медленный — фокус на CSS/Tailwind/PostCSS/Vite cache/Windows Defender;
- если `/src/App.jsx` медленный — фокус на App static import graph;
- если probes быстрые, но реальный renderer всё равно медленный — проблема может быть в зависимых module requests, которые браузер запрашивает после `main.jsx`/`App.jsx`.

---

## Результат запуска с module URL probes (7 мая 2026, 10:13)

Пользователь перезапустил приложение после расширения probe на module URLs.

Ключевые строки:

```text
10:13:31 === ChatCenter v0.87.128 start ===
10:13:31 [startup-window] +51ms dev-server probe start http://localhost:5173 timeout=5000ms
10:13:32 [startup-window] +621ms dev-server probe done status=200 ms=570
10:13:32 [startup-window] +622ms dev-module probe /src/boot-probe.js start ... timeout=5000ms
10:13:33 [startup-window] +1944ms dev-module probe /src/boot-probe.js done status=200 ms=1322
10:13:33 [startup-window] +1946ms dev-module probe /src/main.jsx start ... timeout=5000ms
10:13:33 [startup-window] +2099ms dev-module probe /src/main.jsx done status=200 ms=153
10:13:33 [startup-window] +2100ms dev-module probe /src/index.css start ... timeout=5000ms
10:13:38 [startup-window] +7112ms dev-module probe /src/index.css failed ms=5012 err="timeout 5000ms"
10:13:38 [startup-window] +7112ms dev-module probe /src/App.jsx start ... timeout=5000ms
10:13:43 [startup-window] +11338ms dev-module probe /src/App.jsx done status=200 ms=4226
10:13:43 [startup-window] +11338ms loadURL start http://localhost:5173
10:14:09 [startup-renderer] boot-probe +0ms module script reached before main.jsx
10:14:09 [startup-window] +37941ms dom-ready
10:14:09 [startup-renderer] main +137ms index.css imported
10:14:21 [startup-renderer] main +12239ms App imported
10:14:21 [startup-renderer] main +12243ms render scheduled
10:14:22 [startup-native] accounts snapshot response ok=true accounts=2 active=tg_611696632 ms=50
```

Разбор:

- `/` отвечает быстро: `570ms`.
- `/src/main.jsx` отвечает быстро: `153ms`.
- `/src/boot-probe.js` отвечает заметно, но не критично: `1322ms`.
- `/src/index.css` подтверждён как проблемный URL: прямой probe не дождался ответа за `5000ms`.
- `/src/App.jsx` тоже тяжёлый: `4226ms`.
- После probe `loadURL -> boot-probe` всё равно занял около `26.6s` (`37941ms - 11338ms`).
- При реальном renderer-запуске `index.css imported` стал быстрым (`137ms`), потому что probe уже прогрел/дождался часть CSS transform.
- `App imported` всё ещё занимает около `12.2s`, значит остаётся тяжёлый App dependency graph.
- Telegram restore и accounts snapshot снова быстрые и не являются причиной.

Текущий вывод:

1. Долгий старт подтверждён как Vite/dev transform проблема, прежде всего CSS и App graph.
2. Прямой probe полезен, но он сам прогревает dev-server и меняет последующую картину renderer. Поэтому его нельзя считать финальным замером реального UX.
3. Нужна следующая диагностика не через предварительный fetch, а через наблюдение реальных запросов BrowserWindow.

Самый безопасный следующий шаг:

- добавить dev-only `session.webRequest`/`webContents` request timing для `http://localhost:5173/*`;
- логировать реальные URL, которые запрашивает Chromium при `loadURL`, с длительностью и status:
  - `/src/index.css`;
  - CSS `@import` файлы;
  - `/src/App.jsx`;
  - `/src/native/...`;
  - `/node_modules/.vite/deps/...`;
- не делать предварительный прогрев этих URL, чтобы не искажать картину.

После этого можно будет решить, что чинить:

- если реально тормозит CSS chain — смотреть Tailwind/PostCSS/imported CSS;
- если `node_modules/.vite/deps` — смотреть Vite cache/dependency optimization;
- если `src/native/*` — дробить native graph без повторения race с аккаунтами.

---

## Что сделано в v0.87.129

Предварительные `http.get` module probes заменены на наблюдение реальных запросов Chromium.

Почему:

- module probes подтвердили проблему `/src/index.css` и `/src/App.jsx`;
- но они сами прогревали Vite, поэтому последующий `loadURL` уже измерял не чистый старт;
- нужен замер реальных request-ов, которые Chromium делает при `BrowserWindow.loadURL`.

Изменение:

- файл: `main/utils/windowManager.js`;
- только dev-режим (`isDev`);
- перед `loadURL` вызывается `attachDevRequestTiming(mainWindow, wlog)`;
- используется `mainWindow.webContents.session.webRequest`;
- логируются:
  - `onBeforeRequest` → `dev-request start`;
  - `onCompleted` → `dev-request done`;
  - `onErrorOccurred` → `dev-request failed`;
- фильтр: `http://localhost:5173/*`, `http://127.0.0.1:5173/*`;
- подробные логи только для:
  - `/src/*`;
  - `/node_modules/.vite/*`;
  - `/@vite/*`;
  - root `/`;
  - `?import` / `?direct`.

Ожидаемые строки следующего запуска:

```text
[startup-window] +...ms dev-request timing attached http://localhost:5173/*
[startup-window] +...ms loadURL start http://localhost:5173
[startup-window] +...ms dev-request start id=... method=GET type=script url=/src/boot-probe.js
[startup-window] +...ms dev-request done id=... status=200 cache=false ms=... url=/src/boot-probe.js
[startup-window] +...ms dev-request start id=... method=GET type=stylesheet url=/src/index.css
[startup-window] +...ms dev-request done id=... status=200 cache=false ms=... url=/src/index.css
[startup-window] +...ms dev-request start id=... method=GET type=script url=/src/App.jsx
[startup-window] +...ms dev-request done id=... status=200 cache=false ms=... url=/src/App.jsx
```

Как читать:

- это уже не прогрев: это реальные запросы Chromium;
- долгий `dev-request done ms=...` покажет конкретный URL, который тормозит;
- если конкретный URL быстрый, но `boot-probe`/`App imported` всё равно поздние, искать нужно в зависимых запросах этого URL.

Поведение приложения не менялось:

- Telegram sessions/auth/accounts не тронуты;
- React UI, lazy/static решения и store не менялись;
- `loadURL` стартует сразу после установки listeners;
- диагностика только пишет логи.

Проверки:

```text
node src\__tests__\mainProcess.test.cjs
node src\__tests__\mainRuntime.test.cjs
node src\__tests__\memoryBankSizeLimits.test.cjs
npm.cmd run lint
node src\__tests__\fileSizeLimits.test.cjs
npm.cmd run build
```

Статус проверок заполнить после прогона.

---

## Проверка логов v0.87.129 от 2026-05-07 10:46

Факт по свежему запуску:

```text
10:46:10 [startup-window] +75ms dev-request timing attached http://localhost:5173/*
10:46:10 [startup-window] +76ms loadURL start http://localhost:5173
10:46:11 [startup-window] +1047ms dev-request done / ms=534
10:46:13 [startup-window] +2948ms dev-request done /src/boot-probe.js ms=1807
10:46:13 [startup-window] +3124ms dev-request done /src/main.jsx ms=1981
10:46:14 [startup-window] +3915ms dom-ready
10:46:14 [startup-window] +3919ms loadURL resolved http://localhost:5173
10:46:23 [startup-window] +13568ms dev-request done /src/index.css ms=9599
10:46:43 [startup-window] +33507ms dev-request done /src/App.jsx ms=19936
10:47:01 [startup-window] +51238ms dev-request done /src/native/styles.css ms=12519
10:47:10 [startup-window] +59790ms dev-request done /src/components/AISidebar.jsx ms=8526
```

Топ медленных реальных Chromium/Vite запросов:

```text
19936ms /src/App.jsx
12519ms /src/native/styles.css
 9599ms /src/index.css
 8526ms /src/components/AISidebar.jsx
 7275ms /src/native/hooks/useInboxScroll.js
 7274ms /src/native/hooks/useScrollDiagnostics.js
 7274ms /src/native/hooks/useReadByVisibility.js
 7271ms /src/native/hooks/useNewBelowCounter.js
 7270ms /src/native/hooks/useMessageActions.js
 7269ms /src/native/hooks/useDropAndPaste.js
 7268ms /src/native/hooks/useForceReadAtBottom.js
 7248ms /src/native/components/InboxChatPanel.jsx
 7232ms /src/native/components/InboxChatListSidebar.jsx
 7231ms /src/native/components/ForwardPicker.jsx
 7224ms /src/native/store/nativeStoreIpc.js
 7224ms /src/native/data/countries.js
 7223ms /src/native/components/CodeInput.jsx
 7222ms /src/native/utils/scrollDiagnostics.js
 7222ms /src/native/components/CountryPicker.jsx
 7214ms /src/native/utils/messageGrouping.js
 7214ms /src/native/hooks/useInitialScroll.js
```

Вывод:

- `loadURL` до `dom-ready` уже не 38-45 секунд, а около 3.9 секунд.
- Но после `dom-ready` Vite/Chromium продолжает долго догружать стартовый import graph.
- Главная задержка сейчас не Telegram API и не аватарки.
- Самый дорогой файл: `/src/App.jsx` почти 20 секунд.
- Следом идут CSS: `/src/native/styles.css` 12.5 секунд и `/src/index.css` 9.6 секунд.
- Большой блок native-компонентов/хуков загружается пачкой примерно по 7.2 секунды.
- Это похоже на тяжёлый dev-import graph и/или Vite transform/cache latency, а не на сетевую загрузку Telegram.

Telegram API на этом запуске:

```text
10:46:14 autoRestoreSessions start
10:46:15 autoRestoreSessions done restored=2/2 clients=2 ms=1159
10:47:01 get-chats start requested=all accounts=tg_611696632,tg_638454350 count=2
10:47:05 get-chats done requested=all firstChats=399 ms=3344
```

То есть сами native-аккаунты восстановились быстро, а `get-chats` занял около 3.3 секунды. Это не объясняет почти минуту загрузки модулей renderer.

Следующий безопасный шаг:

1. Не менять Telegram API/сессии.
2. Добавить ещё одну чисто диагностическую метку в renderer: время `import App.jsx start/done`, `React render start/done`, `NativeApp imported/rendered`.
3. Отдельно проверить Vite CSS transform: почему `/src/index.css` и `/src/native/styles.css` отдают cached=true, но занимают 9-12 секунд.
4. После подтверждения причины решать точечно: либо дробить тяжёлый renderer import graph, либо чинить Vite/cache/CSS transform.

---

## Что сделано в v0.87.130

Добавлена полная диагностика, чтобы за один перезапуск видеть всю цепочку старта, а не просить каждый раз новый точечный лог.

Код приложения по поведению не менялся:

- Telegram sessions/auth/accounts не тронуты;
- Telegram API-запросы не изменены;
- UI/state/store логика не изменялась;
- добавлены только логи.

Что теперь видно в логах:

```text
[startup-window] dev-request start/done/failed ...
[startup-window] dev-request slow ...
[startup-window] dev-request summary reason=...
[startup-window] dev-request slow-top reason=...
[startup-window] dev-request pending reason=...
[startup-renderer] resource-summary ...
[startup-renderer] longtask ...
[startup-renderer] dom DOMContentLoaded
[startup-renderer] dom window load
[startup-renderer] main root element found
[startup-renderer] main react root created
[startup-renderer] main render scheduled
[startup-renderer] main first requestAnimationFrame after render
[startup-renderer] component:App first render start
[startup-renderer] component:App mounted ...
[startup-renderer] component:NativeApp first render start
[startup-renderer] component:NativeApp mounted accounts=... chats=...
```

Как читать следующий лог:

- `dev-request pending` покажет URL, который реально висит прямо сейчас.
- `dev-request slow-top` покажет топ самых медленных URL за период.
- `resource-summary` покажет браузерный `performance` взгляд: duration, transferSize, decodedBodySize.
- `longtask` покажет, если проблема уже не в Vite-запросах, а в выполнении JS на UI thread.
- `component:App mounted` и `component:NativeApp mounted` покажут, когда React реально дошёл до приложения и native-интерфейса.

Цель следующего запуска: одним логом разделить 5 возможных причин:

1. Vite долго отдаёт конкретный URL.
2. CSS transform/import chain тормозит `/src/index.css` или `/src/native/styles.css`.
3. JS execution блокирует поток после получения файлов.
4. React render/mount тяжёлый.
5. Native Telegram API уже после mount отдельно догружает чаты.

---

## Зафиксировано по свежим логам v0.87.130 от 2026-05-07 12:52

Факт:

```text
12:52:54 loadURL start
12:53:02 dom-ready / loadURL resolved                 ~8.1s
12:53:16 /src/index.css done                          13.1s
12:53:33 /src/App.jsx done                            17.5s
12:53:48 App imported / render start                  ~45.5s
12:53:48 NativeApp mounted                            ~45.7s
12:53:50 get-chats done                               2.2s
```

Главный вывод:

- Долгая загрузка сейчас не из-за Telegram API, не из-за аватарок и не из-за восстановления сессий.
- Основная задержка — dev-режим Vite/Chromium при загрузке стартового renderer import graph.
- `src/main.jsx` грузит стартовые части последовательно: `react` -> `react-dom/client` -> `index.css` -> `App`.
- После `index.css` только начинается загрузка `App.jsx`, а `App.jsx` статически тянет большой граф: `NativeApp`, хуки, webview utils, diagnostics, native components.
- React render сам по себе быстрый: после `App imported` до `NativeApp mounted` проходят сотни миллисекунд, не десятки секунд.

Самые дорогие места:

```text
17536ms /src/App.jsx
13129ms /src/index.css
~8300ms /src/native/NativeApp.jsx
~8300ms /src/hooks/useAppBootstrap.js
~8300ms /src/hooks/useAppIPCListeners.js
~7800ms /src/utils/consoleMessageHandler.js
~7800ms /src/utils/webviewDiagnostics.js
~7800ms /src/utils/webviewHandleNewMessage.js
~7780ms /src/utils/messengerConfigs.js
```

Telegram на этом же запуске:

```text
autoRestoreSessions done restored=2/2 clients=2 ms=1014
get-chats done requested=all firstChats=399 ms=2262
```

То есть Telegram занимает секунды, а renderer import graph занимает десятки секунд.

### Варианты решения

#### Вариант 1 — самый безопасный и маленький

Параллелить стартовые imports в `src/main.jsx`:

```js
const [reactModule, reactDomModule, appModule] = await Promise.all([
  import('react'),
  import('react-dom/client'),
  import('./App'),
  import('./index.css'),
])
```

Что даст:

- убирает искусственную последовательность `index.css` -> `App.jsx`;
- если `index.css` и `App.jsx` оба медленные, они пойдут параллельно;
- Telegram, store, аккаунты, native API не трогаются.

Риск:

- низкий;
- порядок применения CSS может стать чуть менее предсказуемым в dev, но до render всё равно ждём `Promise.all`, значит UI не должен отрисоваться без CSS.

Проверки:

```text
node src\__tests__\startupDiagnostics.test.cjs
node src\__tests__\mainRuntime.test.cjs
npm.cmd run lint
npm.cmd run build
ручной перезапуск и сравнение startup logs
```

#### Вариант 2 — правильный следующий шаг после варианта 1

Разгрузить `App.jsx`: вынести `NativeApp` из статического импорта в `lazy(() => import('./native/NativeApp.jsx'))` или отдельный dynamic import только для native-вкладки.

Что даст:

- первый render основного shell не будет ждать весь native Telegram интерфейс;
- тяжёлые native-компоненты/хуки загрузятся только когда реально нужен native tab.

Риск:

- средний;
- уже был регресс с пропавшими native-аккаунтами после неосторожного lazy/static решения, поэтому делать только после проверки `tg:get-accounts` snapshot и mount NativeApp.

Проверки:

```text
node src\__tests__\multiAccount.test.cjs
node src\__tests__\startupDiagnostics.test.cjs
node src\__tests__\mainRuntime.test.cjs
npm.cmd run lint
npm.cmd run build
ручная проверка: обе Telegram API-учётки видны после перезапуска
```

#### Вариант 3 — точечная оптимизация CSS

Разобрать, почему `/src/index.css` и `/src/native/styles.css` в dev идут как `type=script` и держат 13s/6s, хотя маленькие по размеру.

Возможные действия:

- проверить цепочку CSS imports;
- проверить PostCSS/Tailwind обработку;
- проверить Vite cache/deps;
- возможно, убрать лишние глобальные imports из первого старта.

Риск:

- средний;
- CSS легко ломает внешний вид, поэтому править только после отдельного diff и скрин-проверки.

#### Вариант 4 — быстрый обходной путь для работы, не кодовый фикс

Запускать production build, а не dev renderer, когда нужна скорость старта.

Факт из build:

```text
production renderer build transforms 223 modules за ~2.6-3.9s
```

Что даст:

- проблема Vite dev transform почти уйдёт;
- это не лечит dev-режим, но покажет, что runtime Telegram не является причиной.

Риск:

- низкий для проверки;
- неудобно для разработки, потому что это не hot reload.

### Рекомендация

По правилам CLAUDE.md: сначала минимальное и безопасное.

Рекомендованный порядок:

1. Сделать вариант 1: параллельные imports в `src/main.jsx`.
2. Прогнать тесты и один ручной перезапуск.
3. Если старт всё ещё долгий, делать вариант 2: аккуратно разгружать `App.jsx`, начиная с `NativeApp`, с отдельной защитой тестами на две Telegram API-учётки.
4. CSS-оптимизацию делать после этого, если логи всё ещё покажут `/src/index.css` как главный тормоз.

Статус: код поведения пока не менялся; нужен отдельный запрос "делай", чтобы переходить к варианту 1.

---

## Что сделано в v0.87.131

Реализован вариант 1 — самый безопасный первый фикс по результатам расследования.

Файл:

```text
src/main.jsx
```

Что изменено:

```text
Было:   react -> react-dom -> index.css -> App
Стало:  react + react-dom + index.css + App параллельно через Promise.all
```

Почему это безопасно:

- render всё равно начинается только после завершения всех четырёх imports;
- CSS всё равно загружен до первого React render;
- Telegram sessions/API/accounts/native store не менялись;
- NativeApp/App логика не менялась.

Ожидаемый эффект:

- `/src/App.jsx` больше не должен ждать завершения `/src/index.css`;
- время до `App imported` должно уменьшиться, если задержка была именно в последовательной цепочке `index.css -> App`;
- если Vite всё равно будет долго трансформировать `App.jsx`, следующий кандидат — вариант 2: разгрузить статический граф `App.jsx`.

Новые логи:

```text
[startup-renderer] main +...ms parallel imports start
[startup-renderer] main +...ms react imported
[startup-renderer] main +...ms react-dom imported
[startup-renderer] main +...ms index.css imported
[startup-renderer] main +...ms App imported
[startup-renderer] main +...ms parallel imports done
```

### Проверка логов v0.87.131 от 2026-05-07 13:03

Факт после варианта 1:

```text
13:03:44 loadURL start
13:03:52 dom-ready / loadURL resolved                 ~7.8s
13:03:52 parallel imports start
13:03:54 /src/App.jsx done                            2.7s
13:04:00 index.css imported                           ~8.0s от parallel start
13:04:14 pending: App static deps                     ~19.4s
13:04:29 slow-top: TabBar/hooks/NativeApp             ~24-25s
13:04:32 App imported / parallel imports done         ~40.5s
13:04:32 NativeApp mounted                            ~40.7s
13:04:35 get-chats done                               2.5s
```

Вывод:

- Вариант 1 убрал старую последовательную задержку `index.css -> App.jsx`.
- `/src/App.jsx` теперь стартует параллельно и сам HTTP-запрос завершился быстро: `2723ms` вместо прежних `17536ms`.
- Но пользователь почти не видит ускорения, потому что `App imported` всё равно ждёт весь статический import graph внутри `App.jsx`.
- Новый главный тормоз — не корневой `App.jsx`, а его статические зависимости:

```text
25116ms /src/components/TabBar.jsx
25108ms /src/hooks/useBadgeSync.js
25107ms /src/hooks/useAIPanelResize.js
25107ms /src/hooks/useWebViewZoom.js
25106ms /src/hooks/useKeyboardShortcuts.js
25103ms /src/components/ErrorBoundary.jsx
24825ms /src/native/NativeApp.jsx
24822ms /src/hooks/useAppIPCListeners.js
24820ms /src/hooks/useConsoleErrorLogger.js
24523ms /src/hooks/useAppBootstrap.js
24521ms /src/hooks/useWebViewLifecycle.js
24517ms /src/hooks/useNotifyNavigation.js
```

Почему большой разницы визуально нет:

- `Promise.all` помог только верхнему уровню `src/main.jsx`.
- Но `App.jsx` всё ещё содержит много static imports.
- ESM-модуль считается `imported` только когда загружены и выполнены все его static dependencies.
- Поэтому `App imported` ждёт не сам файл `/src/App.jsx`, а весь граф `App.jsx -> TabBar/hooks/NativeApp/webview utils/native styles`.

Следующий реальный кандидат — вариант 2:

- разгрузить `App.jsx`;
- начать с самого дорогого и рискованного аккуратно: `NativeApp` и часть heavy panels/hooks через controlled dynamic/lazy import;
- обязательно сохранить защиту `tg:get-accounts snapshot`, чтобы не повторить регрессию с пропавшими Telegram API-учётками.

### Варианты дальнейшего решения проблемы общего renderer startup

#### Вариант A — разгрузить `App.jsx` без смены сборщика

Идея:

- оставить текущий Electron/Vite;
- не трогать WebView partitions и Telegram API;
- вынести тяжёлые части из static imports `App.jsx` в controlled lazy/dynamic imports.

Кандидаты:

```text
NativeApp
TabBar / MessengerTab, если можно оставить лёгкий shell
webviewDiagnostics
consoleMessageHandler
webviewHandleNewMessage
AI sidebar/panels
часть hooks, которые нужны только после появления вкладок
```

Плюс:

- самый прямой фикс найденной причины;
- не меняет всю программу;
- можно делать по одному модулю и проверять логи.

Минус/риск:

- надо аккуратно сохранить порядок инициализации вкладок;
- обязательно проверять все мессенджеры: native `ЦентрЧатов`, 2 Telegram WebView, VK, MAX, WhatsApp.

#### Вариант B — shell-first архитектура

Идея:

- сначала рендерить минимальный shell: шапка, список вкладок, пустая рабочая область/loader;
- после первого paint догружать тяжёлые модули.

Что даст:

- пользователь быстрее увидит приложение;
- WebView/native части могут догружаться после shell.

Минус/риск:

- это уже архитектурная правка;
- надо проектировать loading states;
- выше риск визуальных регрессий.

#### Вариант C — production/dev split для обычной работы

Идея:

- для обычного использования запускать production renderer build;
- dev Vite оставлять только для разработки.

Почему:

- production build уже собирает renderer быстро и отдаёт бандлы, а не трансформирует 200+ модулей по запросам;
- текущая проблема в основном видна именно в Vite dev module transform/import graph.

Плюс:

- может дать самый большой прирост без переписывания UI;
- меньше запросов к dev server.

Минус/риск:

- надо проверить текущий `scripts/dev.cjs` / режим запуска;
- hot reload в таком режиме не будет как в dev;
- может потребоваться отдельная команда "быстрый рабочий запуск".

#### Вариант D — сменить dev-сборщик/режим загрузки

Идея:

- оставить Electron, но пересмотреть dev pipeline;
- варианты: предварительный prebundle, другой режим Vite, отдельный renderer build-watch, возможно другой dev server.

Плюс:

- лечит именно "программа, которая грузит/трансформирует файлы";
- может ускорить весь проект без дробления компонентов.

Минус/риск:

- выше системный риск;
- можно сломать Electron/Vite интеграцию, preload, HMR, пути ассетов;
- делать только после отдельного исследования `electron.vite.config.js`, `scripts/dev.cjs`, package scripts.

#### Вариант E — оставить как есть, но очистить/прогреть Vite cache

Идея:

- попробовать безопасную диагностику cache: проверить `.vite/deps`, node_modules cache, холодный/тёплый старт;
- понять, почему cached=true запросы иногда длятся 20+ секунд.

Плюс:

- почти без изменения кода приложения;
- может выявить проблему окружения/кэша/диска/антивируса.

Минус/риск:

- может не дать стабильного эффекта;
- это не архитектурный фикс.

Рекомендация на текущий момент:

1. Сначала вариант A: разгрузить `App.jsx` точечно, с тестами и логами.
2. Параллельно/после — вариант C как контроль: проверить быстрый production-like запуск для обычной работы.
3. Вариант D рассматривать только если A+C не дадут нормального результата или если нужен быстрый dev-режим без дробления UI.

---

## Этап A1 — точечно разгружаем `App.jsx`

Дата: 2026-05-07. Версия этапа: `v0.87.132`.

Что делается:

- `NativeApp` выводится из static import graph `src/App.jsx` в controlled `React.lazy`.
- Для native-режима добавляется отдельный `Suspense` fallback без изменения Telegram API, sessions, partitions, native store и WebView tabs.
- Добавляются startup marks `module:NativeApp lazy import requested/resolved`, чтобы в логах было видно, когда именно native-часть реально запрошена.

Зачем:

- В логах `v0.87.131` `/src/App.jsx` стал грузиться быстрее, но `App imported / parallel imports done` всё равно ждал тяжёлый static graph.
- Один из тяжёлых файлов в этом graph: `/src/native/NativeApp.jsx` около 24-25 секунд в dev-startup.
- Цель A1: проверить, станет ли shell `App.jsx` доступен раньше, если native-часть грузить только при рендере native-вкладки.

Результат живой проверки после чистого лога:

- Запуск `v0.87.132` подтверждён: `=== ChatCenter v0.87.132 start ===`.
- Native Telegram sessions восстановились: `autoRestoreSessions done restored=2/2 clients=2 ms=895`.
- Snapshot аккаунтов после lazy `NativeApp` работает: `accounts snapshot response ok=true accounts=2 active=tg_611696632 ms=24`.
- Кэш native чатов загрузился быстро: `loadCachedChats response ok=true chats=399 ms=22`.
- Полная загрузка native чатов: `loadChats response accountId=all ok=true chats=399 ms=2318`.
- `App.jsx` после A1 стал грузиться заметно быстрее: `/src/App.jsx ms=3672`, `App imported / parallel imports done +28494ms`.
- `NativeApp` действительно ушёл из первого static graph: `lazy import requested +28600ms`, `lazy import resolved +53578ms`.
- Но общая задержка не закрыта: `NativeApp` появляется только около `+53.6s`.

Новая фактическая причина по логу `v0.87.132`:

- До первого render всё ещё ждём тяжёлый renderer dev graph:
  - `/src/index.css` `26677ms`;
  - `/src/hooks/useAppIPCListeners.js` около `23614ms`;
  - `/src/hooks/useAppBootstrap.js` около `23615ms`;
  - `/src/hooks/useConsoleErrorLogger.js` около `23616ms`;
  - `/src/hooks/useWebViewLifecycle.js` около `23619ms`;
  - `/src/hooks/useNotifyNavigation.js` около `23620ms`;
  - `/src/components/TabBar.jsx` около `23604ms`;
  - `/src/components/ErrorBoundary.jsx` около `23600ms`.
- После render native lazy graph тоже дорогой:
  - `/src/native/NativeApp.jsx` `14955ms`;
  - `/src/native/styles.css` `10005ms`.

Итог A1:

- Безопасность: подтверждена, accounts не пропали.
- Польза: `NativeApp` больше не блокирует `App imported`, а `/src/App.jsx` уже не главный 17-25 секундный стопор.
- Почему визуально ускорение небольшое: активная вкладка `ЦентрЧатов` сразу требует lazy `NativeApp`, а Vite всё равно долго отдаёт общий CSS/hooks/TabBar и потом native graph.
- Следующий самый безопасный этап: не трогать Telegram API, а разобраться с dev-загрузкой CSS/static graph. Кандидаты: production-like рабочий запуск или вынос `NativeApp` в отдельный lightweight entry/chunk с CSS, чтобы active native tab не тянул 90+ dev modules через Vite.

## Текущая выбранная ветка после A1

Важно: пользователь выбрал продолжать **вариант A — разгружать `App.jsx` по этапам**. Сейчас не переключаться на C1/production-like запуск без отдельной команды пользователя.

Статус:

- `A1 NativeApp dynamic/lazy` — сделано в `v0.87.132`, тесты прошли, по живому логу accounts не пропали.
- Следующий этап: `A2 — разделить bootstrap и тяжёлые WebView hooks`.

Результат A2-анализа перед правкой:

- `useAppBootstrap` нужен сразу: грузит messengers/settings/monitorPreload и выставляет `appReady`; выносить нельзя.
- `useAppIPCListeners` нужен рано: `window-state`, `messenger:badge`, звук, unread auto-reset; выносить нельзя целиком.
- `useNotifyNavigation` нужен для `notify:clicked`/`notify:mark-read`; можно трогать только после отдельного теста notification flow.
- `useWebViewLifecycle` сейчас почти только 30s health-check; он не главный риск, но его static import всё равно висит в graph.
- `TabBar` нужен сразу для shell; целиком lazy делать не первым шагом.
- `createWebviewSetup` тяжёлый и тянет `messengerConfigs`, `consoleMessageHandler`, `webviewDiagnostics`, `webviewHandleNewMessage`; нужен до рендера `<webview>`, поэтому выносить надо очень осторожно.
- Самый безопасный A2.1-кандидат: `useTabContextMenu` static-import-ил `tabContextMenuDiag`, а тот тянул большие diagnostic scripts из `messengerConfigs`. Пользователь сообщил, что этим ручным инструментом сейчас не пользуется и вряд ли будет пользоваться.

Сделано в A2.1 (`v0.87.133`):

1. В `useTabContextMenu.js` убран static import `tabContextMenuDiag`.
2. `handleTabContextAction_diag` оставлен как явный disabled/no-op, чтобы контракты не падали.
3. В `NotifLogModal` скрыты вкладки `DOM`, `Хранилище`, `Аккаунт`.
4. Безопасность: обычные вкладки, unread, navigation, WebView runtime, Telegram API accounts/sessions не используют этот ручной diagnostic script.
5. Проверки: `appStructure`, `integrationChains`, `startupDiagnostics`, `multiAccount`, `mainRuntime`, `lint`, `build`, `memoryBankSizeLimits`.

---

## Итог расследования

Регрессия `v0.87.126` с пропавшими native-аккаунтами закрыта в `v0.87.127`.

Расследование долгой загрузки не закрыто. На текущий момент причина смещена с Telegram API/аватарок на dev-загрузку renderer и тяжёлый стартовый import graph.

## v0.87.134 — отдельный production-like контрольный запуск

Сделано по команде пользователя: добавлен `npm run start:prodlike` без изменения обычного `npm run dev/start`. Скрипт `scripts/prodlike.cjs` удаляет inherited `ELECTRON_RUN_AS_NODE`, делает `npm run build`, затем запускает `electron-vite preview`.

Зачем: проверить гипотезу, что основная задержка идёт от Vite dev server/static graph (`http://localhost:5173`), а не от Telegram/VK/MAX/WhatsApp, аккаунтов или WebView-сессий. Telegram sessions/accounts, WebView partitions и runtime мессенджеров не менялись.

Проверка живым логом `15:21:57`: гипотеза подтверждена. `loadFile` из `out/renderer/index.html`, `dom-ready ~685ms`, `ready-to-show ~696ms`, `loadFile resolved ~733ms`, `App imported ~85ms`, `App-mounted ~229ms`, `NativeApp-mounted ~628ms`, `resource-summary slow=none`. В dev-режиме ранее `App imported` был около `29s`, `NativeApp-mounted` около `53s`. Главная задержка была в Vite dev server/static graph, не в Telegram API/аккаунтах.

v0.87.135: добавлен `npm run dist:win`; в `dist/` после сборки остаётся только `.exe`.
