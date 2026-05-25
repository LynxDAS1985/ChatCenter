# Архив: features.md v0.91.1 – v0.91.10

**Вынесено**: 25 мая 2026, в составе v0.91.13 при превышении лимита 100 КБ для активного features.md.

**Серия v0.91.x** — фиксы native-режима Telegram после миграции на TDLib (v0.89.0): initial-load, scroll-jump, newBelow counter, forum topic preview, custom emoji, savedScrollTop restore, updateChatLastMessage.

---

### v0.91.10 — Расширение v0.91.9: edit/delete tracking + TTL pending + метрика частоты

Продолжение v0.91.9 — 4 граничных случая:

**Совет 1 — delete last_message** ([tdlibClient.js:361](main/native/backends/tdlibClient.js)): если в `update.message_ids` есть `chat.last_message.id` → обнуляем cache + emit `chat:last-message` с пустым preview. TDLib потом сам пришлёт `updateChatLastMessage` со следующим. Факт 🥇: [TDLib updateDeleteMessages](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_delete_messages.html) `is_permanent=true` = реальное удаление.

**Совет 2 — edit last_message** ([tdlibClient.js:353](main/native/backends/tdlibClient.js)): если `update.message_id === chat.last_message.id` → обновляем `content` в cache + emit с новым preview через `extractTopicPreview`. Факт 🥇: [TDLib updateMessageContent](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_message_content.html).

**Совет 3 — TTL pending** ([nativeStoreIpc.js](src/native/store/nativeStoreIpc.js)): `setTimeout` 30с на каждую запись в `pendingLastMessageRef` (защита от утечки ~50 байт/запись для несуществующих chatId). Helpers `pendingSet/pendingTake`, повторный event пере-устанавливает таймер.

**Совет 4 — метрика** (паттерн `idbCacheMetrics.js`): `recordLastMsgEvent(kind)` агрегирует `applied/staleSkipped/pending` по 30с окну → одна строка `chat-last-msg-window` вместо сотен. При 0 событий не пишется.

---

### v0.91.9 — Фикс «застывшее превью в списке чатов»: добавлен обработчик updateChatLastMessage + pending queue

**Симптом**: превью чата в списке слева показывает старое сообщение, в официальном Telegram Web — новое.

**Корень** (🥇 [TDLib updateChatLastMessage spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_chat_last_message.html)): TDLib шлёт **отдельное** событие от `updateNewMessage` — в супергруппах с большим потоком вместо тысяч `updateNewMessage` шлёт один `updateChatLastMessage` со свежим итогом. Наш backend `_patchChat` ловил update и обновлял cache, но **не эмитил в renderer**.

**Решение**: новый IPC channel `tg:chat-last-message`. Backend ([`tdlibClient.js`](main/native/backends/tdlibClient.js)) эмитит из `_patchChat`. Renderer ([`nativeStoreIpc.js`](src/native/store/nativeStoreIpc.js)) — handler с timestamp guard + pending queue для chatId которых ещё нет в state.chats.

---

### v0.91.8 — 4 улучшения UX: scroll-position персистентность, emoji-кэш на диске, бейдж форум-групп, сортировка тем

**Совет 1 — Сохранение позиции скролла между перезапусками**: новый модуль [`scrollPositionsCache.js`](src/native/utils/scrollPositionsCache.js) — localStorage с debounce 1с, LRU 100 chatId. После рестарта чаты открываются на той же позиции (паттерн Telegram Desktop SQLite, WhatsApp Web IndexedDB, Discord localStorage).

**Совет 2 — Кэш custom emoji между перезапусками**: [`tdlibForumEmoji.js`](main/native/backends/tdlibForumEmoji.js) — `loadCacheFromDisk` + debounced `saveCacheToDisk`. Метадата `forum-emoji-meta.json` в userData. После рестарта emoji видны мгновенно.

**Совет 3 — Бейдж непрочитанных у форум-групп**: в [`nativeStore.js loadForumTopics`](src/native/store/nativeStore.js) client-side fallback `chat.unreadCount = max(chat.unreadCount, sumTopicUnread)`. TDLib обнуляет `chat.unread_count` после открытия форума, но темы держат свои unread.

**Совет 4 — Сортировка тем форума**: `sortForumTopics` в [`InboxChatListSidebar.jsx`](src/native/components/InboxChatListSidebar.jsx) — pinned первыми, unreadCount DESC, lastMessageTs DESC. Как Telegram Desktop.

---

### v0.91.7 — Фикс прыжков scrollTop при возврате в старый чат (недоделка v0.91.2)

**Симптом**: юзер открыл тему/чат где раньше читал → программа сама дёргает скролл назад каждые 1-2 секунды.

**Корень — недоделка v0.91.2**: я починил `firstUnread`-ветку через паттерн «restore только при смене чата», но `savedScrollTop`-ветку оставил с deps `[messagesCount]`. На одно открытие темы — 4 setState на messages (IDB cache → server response → load-newer prefetch x2), каждое запускало restore.

**Решение**: применил `lastActiveChatIdRef` паттерн к `savedScrollTop`. Restore выполняется только при `activeChatId !== lastActiveChatIdRef.current` (реальная смена чата).

**Прибочная находка из v0.91.6**: 4 setState на messages — НЕ дубли, а легитимный optimistic-render flow (IDB → server → prefetch) по Telegram Desktop pattern.

---

### v0.91.6 — Фикс вечной загрузки темы (scrollEl deadlock) + custom emoji иконки тем

**Фикс 1 — Deadlock chatReady↔scrollEl** в [`useInitialScroll.js:80`](src/native/hooks/useInitialScroll.js#L80): silent `if (!scrollEl) return` без `onDone()`. Цепочка: смена темы → `setChatReady(false)` → DOM shimmer (opacity:0) → `scrollRef.current=null` → setTimeout 150ms → silent return → `onDone` не вызван → `chatReady` навсегда false → DOM никогда не рендерится. Deadlock.

**Решение**: retry loop через `requestAnimationFrame` до 10 попыток, потом fallback `onDone(activeChatId)` (лучше показать чат без initial-scroll чем держать вечный shimmer).

**Фикс 2 — Custom emoji иконки тем**: новый модуль [`tdlibForumEmoji.js`](main/native/backends/tdlibForumEmoji.js) — `resolveTopicEmojis(topics, ctx)`: `getCustomEmojiStickers` (batch по unique iconCustomEmojiId) → `downloadFile` + `stabilizeForPlayback` → `cc-media://media/...` URL. In-memory кэш на сессию. .tgs (animated lottie) — fallback на alt-emoji (Chromium не рендерит TGS в `<img>`). По [TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_custom_emoji_stickers.html).

---

### v0.91.5 — Эмодзи-fallback для иконки темы + диагностика «выбрал тему форума — пустой экран»

Иконки тем форума в нашем UI = серый `#` для всех. В Telegram же — custom emoji.

**Решение для эмодзи (фикс 1)**: helper `extractTopicCap(title)` в `ForumTopicIcon` — если title начинается с unicode emoji, показываем его; иначе первая буква. Custom emoji через [TDLib `forumTopicIcon.custom_emoji_id`](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_icon.html) — premium feature, отложено как отдельная задача (реализовано в v0.91.6).

**Решение для диагностики (фикс 2)**: 2 лога — `[topic-state]` в `selectForumTopic` setState и `[topic-resolve]` в render `InboxMode`. После рестарта показали что race condition не было — backend возвращал данные правильно, но UI пуст из-за scrollEl deadlock (закрыто v0.91.6).

---

### v0.91.4 — «Нет предпросмотра» в темах форум-чатов + диагностика бейджа

Backend [`forum.getTopics`](main/native/backends/tdlibBackend.js) возвращал topic без `lastMessage`. Решение: helper `extractTopicPreview(tdMsg)` извлекает текст или эмодзи-аннотацию для медиа (🖼 Фото, 📹 Видео, 🎤 Голосовое и т.д.). По [TDLib forumTopic spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic.html).

Превью «У меня есть контакты...» в списке чатов для форум-группы — это TDLib `chat.last_message` (агрегированное), не баг.

Бейдж непрочитанных у форум-группы пуст: добавлено логирование `[forum-map]` и `[forum-be]` — без слепого фикса. Решено в v0.91.8 (Совет 3).

---

### v0.91.3 — Фикс «↓ 200» при unread=0 (newBelow event-based переписан)

**Симптом**: юзер открыл чат, листает вверх → бейдж в списке чатов исчез (`unreadCount=0`), но кнопка ↓ в углу чата упорно показывает **200** и не уменьшается.

**Корень — 2 бага в [`useNewBelowCounter.js`](src/native/hooks/useNewBelowCounter.js)**:
1. **Phantom prevLastId**: hook сравнивал последнее id в массиве. При `initial-load` массив заменялся целиком, `prevLastId` отсутствовал → цикл уходил до конца → насчитывал ВСЁ окно как «новое».
2. **Не сбрасывался при server-side `unreadCount=0`**: hook сбрасывал `newBelow` только при смене чата.

**Архитектурная причина**: hook не различал источник изменения массива:
- `tg:new-message` (TDLib `updateNewMessage` — server push) → ДОЛЖНО считаться
- `tg:messages` (response на get-messages / load-older / load-newer batch) → НЕ должно

**Решение** (Вариант B): переписан на **event-based** — подписка на `window.api.on('tg:new-message', ...)` через useEffect. Фильтры: chatId, !isOutgoing, !atBottom. `atBottom` через `useRef` (stable handler без re-subscribe). Auto-reset при `activeUnread === 0`.

Сверено по 6 источникам: TDLib spec, TDesktop, WhatsApp Web (whatsmeow), Discord Gateway, React docs. Все 4 мессенджера различают server-push vs API-response.

---

### v0.91.2 — Фикс «программа сама прыгает на середину чата пока юзер читает»

**Симптом**: юзер открыл чат, листает вверх → через секунду чат сам перескакивает в неизвестное место.

**Корень — три факта**:
1. **React useEffect re-runs при изменении `messagesCount`** ([React docs](https://react.dev/reference/react/useEffect#parameters)): «If any of the dependencies are different... the Effect will re-run».
2. **`firstUnreadIdRef.current` пишется на каждом рендере** в `InboxMode.jsx:347`. По [React useRef caveats](https://react.dev/reference/react/useRef#caveats): «Do not write or read ref.current during rendering».
3. **react-window 2.x `scrollToRow`** не имеет защиты от user activity — `element.scrollTop = offset` без проверок.

**Сверка**: Telegram Desktop, WhatsApp Web, Discord, iOS Telegram — все НЕ дёргают scroll пока юзер читает.

**Правка**: в `useInitialScroll.js` ветка «already-seen» — удалена ветка `firstUnread → scrollIntoView`. Restore при возврате к виденному чату = только savedScrollTop. Auto-jump к firstUnread остаётся при ПЕРВОМ открытии чата (ветка 1).

---

### v0.91.1 — Фикс «чат открывается пустым» (initial loadMessages блокировался push-эмитами TDLib)

**Симптом**: юзер открывает чат с 1000+ непрочитанных, видит **1 сообщение**, дальше минута тишины.

**Корень**: `tdlibClient.js` эмитил `message:new` для свежих сообщений из SQLite кэша TDLib при старте → `nativeStoreIpc.js` клал push в `state.messages[chatId]` → `InboxMode.jsx:77,81` проверял `!store.messages[activeChatId]` → ложно → `loadMessages` **никогда** не вызывался.

**Сравнение со стеком**: Telegram Desktop, WhatsApp Web, Discord — запрашивают историю **всегда** при смене активного чата.

**Решение** (2 слова): `!store.messages[id]` → `!store.loadingMessages[id]` в `InboxMode.jsx:77,81`. Защита от дубля сохраняется, push'нутые 1-2 сообщения больше не блокируют initial-load.

---

## Связанные ловушки

- [`mistakes/native-scroll-unread.md`](../mistakes/native-scroll-unread.md) — программный scrollTop в useEffect с deps `[messagesCount]` (v0.91.2→v0.91.7)
- [`mistakes/tdlib-forum.md`](../mistakes/tdlib-forum.md) — forum topics, getSupergroup, is_forum
