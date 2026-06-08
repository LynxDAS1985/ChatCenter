# Features Archive — v0.95.35-37

3 точечных фикса/диагностики на пути к v0.95.38 (фикс дубля сообщений). Стабилизировано v0.95.38+ — v0.95.36/37 диагностика была заменена реальным фиксом.

---

### v0.95.37 — sending_state polish + лог fromOtherDevice + защита re-emit + анализ дубля

**(1)** Edit скрыт пока `isSending=true` (MessageBubble.jsx) — TDLib откажет без финального id.

**(2)** Лог `fromOtherDevice` (InboxMode.jsx onAutoScroll/onAdded) — payload расширен `isOutgoing/isSending` (useNewBelowCounter.js). Диагностика.

**(3)** Защита от re-emit: `seenOutgoingIdsRef` Set FIFO-50 в useNewBelowCounter — id, прошедшие как outgoing-pending, при повторном emit (теоретическом) skip как `outgoing-already-seen`.

**(4) Анализ дубля (TODO)**: в tdlibClient.js switch **НЕ** обрабатывает `updateMessageSendSucceeded`. План эмит `message:send-succeeded` → store заменяет по oldId. **Реализовано в v0.95.38**.

Новый файл документации: `mistakes/outgoing-two-cases.md` — хронология v0.95.28→37, эталоны 4 мессенджеров, антипаттерны.

**Тесты** +2: re-emit с тем же id → `outgoing-already-seen` / разные id не блокируют.

**Регрессия**: lint 0, vitest 923/923, fileSizeLimits 316/316, check-memory ✅.

---

### v0.95.36 — Auto-scroll для outgoing с других устройств (TDLib sending_state)

Юзер пишет с телефона/Telegram Web → сообщения приходят с `isOutgoing=true`, но фильтр в useNewBelowCounter (v0.95.28) блокировал ВСЕ outgoing → auto-scroll не работал → сообщения «застревали» не у низа.

Корень: фильтр не различал «свой echo» vs «своё с другого устройства».

Решение — TDLib `sending_state`: присутствует только для локальных echo (pending/failed), null для уже-на-сервере (другое устройство).
- tdlibMapper.js: `isSending: !!tdMsg.sending_state`
- useNewBelowCounter.js: фильтр `outgoing && isSending` (был `outgoing`). Outgoing без isSending идёт дальше.
- InboxMode.jsx: `lastAutoScrollAtRef` guard < 600мс в onAutoScroll + send-scroll-done.

Эталоны: tweb pendingByRandomId, tdesktop MessageFlag::FromUpdate, WhatsApp PushName, Discord nonce.

**Тесты** +5 (useNewBelowCounter +3, tdlibMapper +3). **Регрессия**: 921/921 ✅.

---

### v0.95.35 — Fade-in для «Полная история» + диагностика outgoing auto-scroll

**(1)** WhatsNewModal: inner div получает `key={showAll}` + `className="cc-changelog-fade"`. CSS keyframe `cc-changelog-fadein` (320мс fade + slideY 8px) при переключении. Эталон: VS Code Release Notes.

**(2)** Диагностика TODO: фильтр `!isOutgoing` v0.95.28 в useNewBelowCounter.js защищает от двойного scroll при `handleReplySend` с этой машины, но **блокирует** auto-scroll для своих сообщений с другого устройства (телефон/Telegram Web). **Реализовано в v0.95.36**.

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.
