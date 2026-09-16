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

## Подробная хронология — в архиве

Протоколы запусков и разборы логов по датам вынесены в
[archive/startup-load-investigation-history.md](archive/startup-load-investigation-history.md)
(разгрузка 2026-09-16: файл упёрся в предел 100 КБ). Ниже — итог, ради которого всё делалось.

## Итог расследования dev-загрузки

Регрессия `v0.87.126` закрыта в `v0.87.127`.

Расследование долгой загрузки `npm start` / dev закрыто: причина была не в Telegram API, аккаунтах, аватарках или установщике. Задержка была в dev-загрузке renderer через Vite (`http://localhost:5173`) и тяжёлом import graph.

Методы запуска и новая проблема `start:prodlike` вынесены в `.memory-bank/prodlike-webview-investigation.md`.

## v0.87.134 — отдельный production-like контрольный запуск

Сделано по команде пользователя: добавлен `npm run start:prodlike` без изменения обычного `npm run dev/start`. Скрипт `scripts/prodlike.cjs` удаляет inherited `ELECTRON_RUN_AS_NODE`, делает `npm run build`, затем запускает `electron-vite preview`.

Зачем: проверить гипотезу, что основная задержка идёт от Vite dev server/static graph (`http://localhost:5173`), а не от Telegram/VK/MAX/WhatsApp, аккаунтов или WebView-сессий. Telegram sessions/accounts, WebView partitions и runtime мессенджеров не менялись.

Проверка логом `15:21:57`: гипотеза подтверждена. `loadFile/dom-ready/ready-to-show` меньше секунды, `App imported ~85ms`, `NativeApp-mounted ~628ms`, `slow=none`. В dev ранее: `App imported ~29s`, `NativeApp-mounted ~53s`. Задержка была в Vite dev server/static graph, не в Telegram API/аккаунтах.

`prodlike-webview-investigation` закрыт: причина была в слабом интернете, не в `start:prodlike`.
