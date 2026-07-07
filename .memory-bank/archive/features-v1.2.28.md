# Архив features: v1.2.28

Дата архивации: 3 июля 2026.
Причина: активный features.md превысил лимит 100 КБ после v1.2.54; полная история v1.2.28 перенесена без потери данных.

---

### v1.2.28 — MAX: sidebar watcher не создаёт фантомы во время поиска

Дата: 30 июня 2026.
Кто нашёл: пользователь по кейсу MAX-поиска номера телефона и Codex по `chatcenter.log` / `system-diagnostics-report.json`.

Проблема: при вводе номера в поиск MAX список чатов перестраивался, а MAX sidebar watcher мог принять старый preview из строки чата за новое сообщение. В логах это выглядело как нормальный `__CC_NOTIF__`, затем `Звук`, `custom-notify` и `NotifManager show`, хотя клиент нового сообщения не писал.

Что изменено:
- `main/preloads/hooks/max.hook.js`: все MAX `__CC_NOTIF__` получили поле `src`: `max-notification-api`, `max-sw-showNotification` или `max-sidebar`;
- `main/preloads/hooks/max.hook.js`: добавлен `_maxSearchState()`;
- `max-sidebar` при активном поиске больше не отправляет уведомление, а только обновляет baseline `_maxLastList`;
- в диагностике появляется `__CC_DIAG__max-sidebar: search active skip emit`;
- `src/utils/consoleMessageParser.js` теперь сохраняет `source`;
- `src/utils/consoleMessageHandler.js` пишет `src` в trace и передаёт `extra.notifSource`.

Почему так: проблема не в словах, PDF или имени клиента. Старый DOM preview становится похож на новое событие из-за перестройки списка. Поэтому блокировка сделана по источнику и состоянию UI: только `max-sidebar` + активный поиск. Основные пути MAX notification/showNotification не отключались.

Как должно работать:
- реальное входящее MAX-сообщение через `max-notification-api` / `max-sw-showNotification` показывает ribbon, звук, отправителя и аватарку как раньше;
- при поиске номера/текста в MAX старые строки списка не создают фантомные ribbon;
- в диагностике видно, какой подпуть создал событие: `src=max-sidebar`, `src=max-notification-api` или `src=max-sw-showNotification`;
- если во время поиска sidebar нашёл старый preview, он пишет diagnostic skip, но не вызывает `NotifManager show`.

Проверки:
- `node src/__tests__/notifHooks.test.cjs`;
- `node src/__tests__/consoleMessageParser.test.cjs`;
- `npm run lint`;
- `npm run check-memory`.

