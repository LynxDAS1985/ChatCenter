# v0.95.48 — Точный jump-to-message из notification (паттерн tdesktop/tweb)

**Корень из лога v0.95.47** (3 клика «→ Перейти к чату»): в 2 из 3 кликов target сообщение было **вне загруженного окна** (gap ~100-138 messages новее загруженного). При открытии чата мы грузим окно вокруг `readInboxMaxId` (старые непрочитанные), а notification приходит про САМОЕ НОВОЕ (ниже окна) → `querySelector('[data-msg-id]')` промахивается → 1 успех / 2 промаха.

**Эталоны** (3 независимых источника, паттерн стандарт):
- **TDLib spec** [getChatHistory](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html): `from_message_id=target, offset=-49, limit=100` → окно с target в середине (49 newer + target + 50 older).
- **Telegram Desktop** [HistoryWidget::showAtMsgId](https://github.com/telegramdesktop/tdesktop): `if (!_history->isReadyFor(msgId)) requestMessagesAround(history, msgId)` → MTProto с `add_offset = -kMessagesPerPage/2`.
- **Telegram Web K** [appImManager.setInnerPeer({peerId, lastMsgId})](https://github.com/morethanwords/tweb) → `appMessagesManager.getHistory({offsetId: targetMid, addOffset: -Math.floor(50/2)})` → `chatBubbles.scrollToBubble(targetMid, 'center')`.

**Решение** (2 файла, минимум touch — переиспользуем инфраструктуру v0.95.12/14/16):
- [nativeStore.js](src/native/store/nativeStore.js): `pendingScrollToMessage` теперь содержит `loadAttempted: false`. Новый action `markPendingScrollLoadAttempted` ставит флаг = true.
- [InboxMode.jsx](src/native/modes/InboxMode.jsx) useEffect: проверяет `targetInLoaded = activeMessages.some(m => m.id === pending.messageId)`. Если **НЕ в окне**:
  - Если `pending.loadAttempted=true` (уже грузили) → toast «не загружено», clear (защита от петли когда target удалён / TDLib вернул < limit).
  - Иначе → `markPendingScrollLoadAttempted` + `store.loadMessages(viewKey, 100, {aroundId: pending.messageId, addOffset: -49, force: true})`. Return — useEffect re-trigger при `tg:messages` → activeMessages обновится → 2-я итерация попадёт в `targetInLoaded=true`.
- Если **В окне** → существующая setTimeout + scrollToMessage (querySelector + scrollIntoView({block:'center'}) + .native-msg-flash).

**Виртуализация удалена в v0.94.0** → обычный DOM → `scrollIntoView({block:'center'})` работает из коробки (точное центрирование браузер).

**Тесты** +2: «target в окне → instant scroll без loadMessages», «target вне окна → loadMessages с aroundId+addOffset=-49+force».

**Конфликты ✅**: jump-to-end v0.95.20 (другой trigger), forum-topic switch (chatIdMatch уже), initial-loadMessages (loadingMessages guard), force:true перебивает IDB. **Лимиты**: nativeStore 1320→1340, InboxMode 1080→1110.

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.

