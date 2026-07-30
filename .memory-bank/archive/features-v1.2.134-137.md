# Архив changelog — v1.2.134 … v1.2.137

Перенесено из `features.md` 2026-07-30 (разгрузка активного файла под лимит 100 КБ).
Темы: уведомление снимается при прочтении чата на другом устройстве (v1.2.137), CI-фикс TZ-независимого снапшота ChatListItem (v1.2.135), ВК основной адрес vk.ru + убрана лишняя ошибка запасного впрыска (v1.2.134).

Пути ссылок даны от корня репозитория (в оригинале были относительные `../`).

---

### v1.2.137 — Уведомления: прочитал чат в Telegram → карточка пропадает (частичное чтение + тестируемое правило)

Дата: 2026-07-27. Жалоба: прочитал чат в самом Telegram (на телефоне), а у нас карточка-уведомление продолжала висеть (снимался только счётчик).

**Корень (по коду).** TDLib шлёт `updateChatReadInbox` всем устройствам аккаунта, когда входящие прочитаны (в т.ч. на другом устройстве). Оно ловится → `chat:unread-sync {chatId:'accId:realId', unreadCount}` (`main/native/backends/tdlibClient.js:545-551`) → мост `tg:chat-unread-sync` → renderer гасит СЧЁТЧИК (`src/native/store/nativeStoreIpc.js:494`). Но карточки-уведомления (`notifItems` в main) убирались ТОЛЬКО по id из ручных действий (`notif:click`/`mark-read`/`dismiss`) — связи «прочитано на сервере → снять карточку чата» не было.

**Что сделано.** Добавлена недостающая связь:
- renderer: в обработчике `tg:chat-unread-sync` при `unreadCount===0` шлётся в main `notif:dismiss-chat { chatId }`.
- main (`main/handlers/notifHandlers.js`): новый обработчик `notif:dismiss-chat` находит карточки этого чата (`source.accountId+':'+source.chatId === chatId`), убирает из окна (`notif:remove`), удаляет из `notifItems`, прячет окно если пусто.

**Доработка (по советам):**
- **Частичное чтение.** Карточка снимается, если id её сообщения `<= last_read_inbox_message_id` (TDLib). Проброс: `tdlibClient.js` emit + `tdlibIpcBridge.js` мост + `nativeStoreIpc.js` (`{chatId, lastReadInboxId}`).
- **Тестируемое правило.** Чистая `shouldDismissForRead(item, chatId, lastReadInboxId)` — `main/handlers/notifDismissDecision.js` (паттерн `notifResizeDecision`), тест `src/__tests__/notifDismissDecision.vitest.js` (8 проверок). Лог `[notif-dismiss-chat] снято карточек=N …`.

**Крайние случаи.** Нет карточек → no-op; сообщение новее `last_read` → остаётся; `last_read=0`/пусто → ничего; двойной сигнал → пусто; пустой `chatId` → выход. Форум-темы — общий `last_read_inbox_message_id`, крайние случаи проверить визуально.

**Проверка:** `node --check` OK; линт 0; лимиты 524/524; `notifDismissDecision` 8/8; `mainRuntime` 99/99. Ручная: прочитать чат в Telegram на телефоне → карточки прочитанного исчезают.

### v1.2.135 — CI-фикс: snapshot ChatListItem не зависел от часового пояса (упал на сервере)

Дата: 2026-07-27. После v1.2.134 CI (ubuntu, TZ=UTC) упал: 2 snapshot-теста `ChatListItem.vitest.jsx` — расхождение даты (`02.04.24` локально vs `01.04.24` на сервере).

**Корень.** `formatChatListTime` (`src/native/utils/formatChatListTime.js:36`) форматирует локальными `getDate()/getMonth()`, а тест подавал `lastMessageTs: 1712000000000` — момент у ГРАНИЦЫ суток (2024-04-01T19:33 UTC). В поясе разработчика (≥UTC+4.5) это уже 2 апреля; на CI (UTC) — 1 апреля. Баг нестабильного теста, не продукта.

**Фикс.** Фиктивный `lastMessageTs` → полдень UTC (`1712059200000` = 2024-04-02T12:00:00Z), буфер ±12ч от границы суток. Снимок-эталон не менялся. Продукт не тронут.

**Проверка (воспроизведён CI):** `TZ=UTC npx vitest run ChatListItem` → 14/14. Ловушка — [[webview-injection]] «snapshot с датой + часовой пояс». pre-push не ловит (один пояс) — падает только на CI.

### v1.2.134 — ВК: основной адрес vk.ru + убрана лишняя красная ошибка запасного впрыска (вариант А)

Дата: 2026-07-27. Две связанные правки по ВК.

**1. Основной адрес ВК → vk.ru.** Стартовый URL был `https://vk.com/im` (редиректил на vk.ru). Теперь `https://vk.ru/im` в трёх местах: `src/constants.js` (×2) и `main/main.js`. Распознавание «это ВК?» оставлено понимающим оба (`vk.com` ИЛИ `vk.ru`) — страховка + требование теста `messengerConfigs.vitest.js`.

**2. Убрана красная `GUEST_VIEW_MANAGER_CALL` при старте (вариант А).** У ВК было три слоя ловли: (1) основной перехватчик списка чатов на vk.ru (`vk-list`, v1.2.112) — работает; (2) запасной `executeJavaScript`-впрыск `vkExecFallback` (для старого vk.com); (3) heartbeat `monitor-ready` — координатор. Диагностика: `monitor-ready` не приходит НИ ОТ КОГО (служебный preload-ipc молчит у всех мессенджеров) → гейт «основной жив» не срабатывал → запасной впрыск шёл КАЖДЫЙ раз → на vk.ru блокируется CSP → красная ошибка. Уведомления ВК идут через слой (1).

**Фикс (вариант А):** в `vkExecFallback.schedule` (`shared/vkExecFallback.js`) ранний выход, если адрес `vk.ru` — запасной впрыск там не планируется. Для `vk.com` поведение сохранено. Диагностика v1.2.13x удалена.

**Почему не вариант Б:** журнал `monitor-ready` молчит у ВСЕХ мессенджеров (общая скрытая недоработка preload-ipc) — чинить ради глушения одного слоя = «подпорка к подпорке». Побочная находка (отдельная задача): preload-ipc heartbeat не работает нигде; на уведомления не влияет.

**Проверка:** `node --check` OK; линт 0; `vkExecFallback` 17/17. Ручная: в логах ВК нет `GUEST_VIEW_MANAGER_CALL`/`VK-EXEC inject failed`; уведомления ВК приходят; вкладка открывается на vk.ru. См. [[decisions]] ADR-023.
