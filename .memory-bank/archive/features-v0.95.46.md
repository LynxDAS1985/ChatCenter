# Features Archive — v0.95.46

Переход к конкретному сообщению из уведомления. Стабилизировано в v0.97.0 (Phase 0+1) — теперь работает через NotificationSource + cross-tab listener.

---

### v0.95.46 — Переход к конкретному сообщению из уведомления

Расширение v0.95.45: click «→ Перейти к чату» открывает чат **и скроллит к тому самому сообщению**.

Поток (5 файлов): nativeStoreIpc + messageId в payload `app:custom-notify` → notificationManager сохраняет в notifItems → notifHandlers передаёт в `notify:clicked` payload → nativeStore новые actions `requestScrollToMessage/clearPendingScrollToMessage` + state `pendingScrollToMessage` → NativeApp вызывает request после setActiveChat → InboxMode useEffect ловит pendingScrollToMessage и при совпадении chatId+messages.length>0 → existing `scrollToMessage()` (с `.native-msg-flash` подсветкой 1.5с) → clear. setTimeout 100мс для React render. Orphan > 10с → auto-clear.

**Эталон**: tweb [appImManager.setInnerPeer({peerId, lastMsgId})](https://github.com/morethanwords/tweb).

**Конфликты ✅**: webview не задет (игнорирует messageId), reply-click scrollToMessage не задет.
**Граничные ✅**: messageId null → fallback v0.95.45, удалено/вне окна → toast, юзер переключился → chatId mismatch skip, messages не загружены → ждём.

**Регрессия**: lint 0, vitest 1016/1016, fileSizeLimits 334/334, check-memory ✅.

---
