# Реализованные функции — ChatCenter

## Текущая версия: v0.91.6 (21 мая 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.88.0 → v0.90.1). Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) | v0.87.106 – v0.87.114 (multi-account UI финал, кнопки режимов, мьют чата, аватарки отправителей в группах) | ~22 КБ |
| [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) | v0.87.93 – v0.87.105 (multi-account native, login flow, разбиения, cc-media://) | ~30 КБ |
| [`archive/features-v0.87.80-92.md`](./archive/features-v0.87.80-92.md) | v0.87.80 – v0.87.92 (pre-push hook, разбиения 4-7, AccountContextMenu) | ~16 КБ |
| [`archive/features-v0.87.65-79.md`](./archive/features-v0.87.65-79.md) | v0.87.65 – v0.87.79 (план разбиения 1-3, pre-push hook, bubble UI) | ~54 КБ |
| [`archive/features-v0.87.51-64.md`](./archive/features-v0.87.51-64.md) | v0.87.51 – v0.87.64 (groupedUnread удалён, pre-commit hook) | ~54 КБ |
| [`archive/features-v0.87.40-50.md`](./archive/features-v0.87.40-50.md) | v0.87.40 – v0.87.50 (итерации native scroll + unread) | ~40 КБ |
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

---

### v0.91.6 — Фикс вечной загрузки темы (scrollEl deadlock) + custom emoji иконки тем (вернули GramJS-feature)

## Фикс 1 — вечная загрузка темы (DEADLOCK chatReady ↔ scrollEl)

**Симптом**: юзер кликает тему форума → пустой чёрный экран навсегда.

**Диагностика** через диагностические логи v0.91.5 — лог 17:05:51:

```
[topic-ui] selectForumTopic chatId=... topicId=4687
[topic-resolve] activeMessages.len=39 forumNeedsTopic=false       ← state OK
[topic-state] applyMessages newLen=39 prevLen=39
   activeForumTopicId=4687 activeChatIdMatch=true                  ← состояние правильное
```

State полностью корректен: 39 сообщений в `messages[key]`, активный topic выставлен. Но ни одного `initial-schedule` / `initial-run` / `initial-target-virtual` / `initial-done` в логе для Wildberries. UI закрыт shimmer overlay.

**Корень — [`useInitialScroll.js:80`](src/native/hooks/useInitialScroll.js)** (старый код):

```javascript
const timer = setTimeout(() => {
  const scrollEl = scrollRef.current
  if (!scrollEl) return    // ← SILENT EXIT, onDone не вызван
  ...
  try { onDone?.(activeChatId) } catch(_) {}  // ← никогда не доходит
}, 150)
```

**Цепочка deadlock**:
1. Смена `activeViewKey` → useEffect в [`InboxMode.jsx:258`](src/native/modes/InboxMode.jsx#L258) → `setChatReady(false)` (если нет в `seenChatsRef`)
2. `chatReady=false` → CSS `opacity:0` на scroll-container → DOM не рендерится
3. `scrollRef.current` (привязан к listRef.element react-window) = `null`
4. useInitialScroll useEffect → ветка 1 (новый chatId) → `setTimeout 150ms`
5. Через 150мс — `scrollEl = null` → silent return
6. `onDone` не вызывается → `chatReady` остаётся `false` → DOM не рендерится → scrollEl навсегда `null` → ∞

**Решение**: retry через `requestAnimationFrame` до 10 попыток, потом fallback `onDone(activeChatId)`:

```javascript
const runInitialScroll = () => {
  const scrollEl = scrollRef.current
  if (!scrollEl) {
    attempts++
    if (attempts < 10) {
      requestAnimationFrame(runInitialScroll)
      return
    }
    // Fallback — отдаём контроль наружу, иначе deadlock с chatReady.
    logNativeScroll('initial-no-scrollel', { chatId, attempts })
    doneSetRef.current.add(activeChatId)
    try { onDone?.(activeChatId) } catch(_) {}
    return
  }
  // ...нормальный путь initial-scroll
}
setTimeout(runInitialScroll, 150)
```

Если scrollEl появляется в течение ~10 кадров (≤166мс) — обычный initial-scroll. Иначе — `chatReady=true` без initial-scroll (юзер увидит чат снизу, что лучше чем вечный shimmer).

## Фикс 2 — custom emoji иконки тем (восстановлено после миграции на TDLib)

**Симптом**: иконки тем форума в нашем UI — однотонные квадратики с буквами F/W/O/Я/B. В Telegram — настоящие custom emoji (wb-логотип, OZON-знак, 🔥 для Нарушения).

**Корень**: в [`.memory-bank/group-topic-investigation.md`](.memory-bank/group-topic-investigation.md) (строки 681-743) описано что в GramJS backend этот функционал был — `tg:get-forum-topics` кэшировал custom emoji documents в `tg-media/custom_emoji_<id>.<ext>` и возвращал `iconEmojiUrl` / `iconEmojiMimeType`. UI ([`InboxChatListSidebar.jsx ForumTopicIcon`](src/native/components/InboxChatListSidebar.jsx)) умеет рендерить `<img src={iconEmojiUrl}>` или `<video>` для webm.

При миграции на TDLib backend (v0.89.0) логика потерялась. v0.91.4 возвращала только `iconCustomEmojiId`, без скачивания.

**Решение**: новый модуль [`tdlibForumEmoji.js`](main/native/backends/tdlibForumEmoji.js) — `resolveTopicEmojis(topics, ctx)`:

1. Собирает unique `iconCustomEmojiId` из тем
2. invoke [`getCustomEmojiStickers`](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_custom_emoji_stickers.html) batch
3. Для каждого Sticker:
   - mime по `sticker.format` (`stickerFormatWebp` → `image/webp`, `stickerFormatWebm` → `video/webm`, `stickerFormatTgs` → `application/x-tgsticker`)
   - alt из `sticker.emoji` (запасной emoji)
   - downloadFile + stabilizeForPlayback → `cc-media://media/<name>`
4. In-memory cache на сессию (повторные открытия — instant)
5. На topics добавляем `iconEmojiUrl` / `iconEmojiMimeType` / `iconEmoji`

`.tgs` (Telegram animated lottie) — Chromium не рендерит в `<img>`. UI fallback на alt-emoji (как у Telegram Desktop когда .tgs не загружен).

Интеграция в [`tdlibBackend.js forum.getTopics`](main/native/backends/tdlibBackend.js) — после маппинга тем, перед возвратом. Не блокирует основной ответ — если резолв упал (network/quota), темы вернутся без emoji, UI fallback на cap-букву из v0.91.5.

## Что покажет лог после рестарта

- `initial-schedule chatId=...:topic:4687` → потом `initial-run attempts=N` → `initial-done` (нормальный путь)
- ИЛИ `initial-no-scrollel attempts=10` → fallback onDone (если DOM долго не рендерится)

В обоих случаях `chatReady=true` → UI рендерит сообщения.

---

### v0.91.5 — Эмодзи-fallback для иконки темы + диагностика «выбрал тему форума — пустой экран»

**Симптом** (Wildberries топик в OZONовая Дыра):
1. Иконки тем в нашем UI = серый `#` для всех. В Telegram же — custom emoji (wb, OZON-лого, M Яндекс, 🔥 для Нарушения).
2. Юзер кликнул на тему Wildberries — пустой чёрный экран с вечной загрузкой.

**Диагностика по логу** (для бага 2):

```
16:22:03 [topic-ui] selectForumTopic ... topicId=4687 ... requestId=...:7pqg7
16:22:03 [topic-be] getTopic ... isGeneral=false threadMsgId=56270782464 ...
16:22:03 [topic-be] invoke result messagesCount=39
16:22:03 [topic-ui] tg:get-topic-messages result ok=true messagesCount=39 hasMore=false error=none
```

Backend вернул **39 сообщений ok=true**. Никаких ошибок. Никаких `stale response ignored`. Но юзер видит пустоту.

Это значит баг между ответом и рендером. Возможные сценарии:
- Race: какой-то параллельный setState (load-newer/load-older для General topic в фоне) перезаписывает state после applyMessages
- Resolve: UI читает не тот key (например, `chatId` без `:topic:4687`)
- forumNeedsTopic = true ошибочно (activeForumTopic не установился)

**Не делаю слепой фикс** — нужны логи с реальной сессии после рестарта.

**Решение для эмодзи (фикс 1)** — [`InboxChatListSidebar.jsx ForumTopicIcon`](src/native/components/InboxChatListSidebar.jsx):

Custom emoji (TDLib [`forumTopicIcon.custom_emoji_id`](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_icon.html)) — premium feature: требует `getCustomEmojiStickers([emoji_id])`, загрузка sticker (.tgs lottie / .webm video / .webp), рендер lottie player. Отложено отдельной задачей.

Минимальный fallback — helper `extractTopicCap(title)`:
- Если `title` начинается с unicode emoji (не a-z, А-Я, 0-9) — показываем этот символ
- Иначе — первая буква title в upper case

Это покрывает темы где юзер сам ставит emoji в название (🔥 Нарушения → 🔥). Для остальных «#» → «F» (FAQ), «N» (Новости), «W» (Wildberries) — выглядит как у Telegram Desktop когда custom emoji ещё не загрузился.

Так же делает Telegram Desktop ([source](https://github.com/telegramdesktop/tdesktop)) — pending state custom emoji = заглушка из первой буквы.

**Решение для диагностики (фикс 2)** — два новых лога:

В [`nativeStore.js selectForumTopic`](src/native/store/nativeStore.js) setState:
```
[topic-state] applyMessages key=... newLen=N prevLen=M activeForumTopicId=... activeChatIdMatch=true/false
```

В [`InboxMode.jsx`](src/native/modes/InboxMode.jsx) render useEffect:
```
[topic-resolve] chatId=... activeMessageKey=... activeMessages.len=N forumNeedsTopic=... allTopicKeys=k1=N,k2=M
```

После рестарта эти логи покажут точно где сбой:
- Если `applyMessages newLen=39` но `[topic-resolve] activeMessages.len=0` → state не дошёл до UI (вероятно activeMessageKey пересчитан с другим topic)
- Если `applyMessages` нет совсем → setState не сработал (selectForumTopic не дошёл до finalsetState)
- Если `forumNeedsTopic=true` при наличии активного topic → activeForumTopic[chatId] не установлен (race)

**Что НЕ тронуто**:
- backend forum.getTopic — работает (39 сообщений возвращает)
- race protection через selectTopicRequestRef — работает (нет stale в логе)
- ForumTopicIcon iconColor fallback — был корректный, оставлен

---

### v0.91.4 — Фикс: «Нет предпросмотра» в темах форум-чатов + диагностика бейджа непрочитанных

**Симптом**:
1. В списке тем форум-чата (OZONовая Дыра → FAQ, Новости/СМИ, Юридический Раздел и т.д.) — у каждой темы под названием написано «Нет предпросмотра», хотя сообщения там есть.
2. В списке чатов для форум-группы (OZONовая Дыра) НЕТ числа непрочитанных, хотя внутри тем сумма ~300+.

**Корень фикса 1 (lastMessage в темах)**:

[`tdlibBackend.js forum.getTopics`](main/native/backends/tdlibBackend.js) возвращал `topic` объект БЕЗ поля `lastMessage`. UI [`InboxChatListSidebar.jsx:184`](src/native/components/InboxChatListSidebar.jsx#L184): `{topic.lastMessage || 'Нет предпросмотра'}` → fallback показывал плейсхолдер.

TDLib API [`forumTopic.last_message`](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic.html) **есть** в ответе `getForumTopics` — мы его просто не извлекали.

**Решение**: новый helper `extractTopicPreview(tdMsg)` в [`tdlibBackend.js`](main/native/backends/tdlibBackend.js) — извлекает текст из `content.text.text` для `messageText` или эмодзи-аннотацию для медиа:

| `content.@type` | Превью |
|---|---|
| `messageText` | сам текст |
| `messagePhoto` | 🖼 caption или «Фото» |
| `messageVideo` | 📹 caption или «Видео» |
| `messageAnimation` | 🎬 caption или «GIF» |
| `messageAudio` | 🎵 caption или «Аудио» |
| `messageVoiceNote` | 🎤 Голосовое |
| `messageVideoNote` | ⭕ Видео-сообщение |
| `messageDocument` | 📎 имя файла |
| `messageSticker` | 🎟 emoji стикера |
| `messagePoll` | 📊 вопрос опроса |
| `messageLocation` | 📍 Геолокация |
| `messageContact` | 👤 имя |
| `messageCall` | 📞 Звонок |
| `messagePinMessage` | 📌 Закреплено сообщение |
| остальное | 📎 вложение |

Возвращаем в topic: `lastMessage: extractTopicPreview(t.last_message)`, `lastMessageTs: Number(t.last_message?.date) || 0`. UI ([`InboxChatListSidebar.jsx`](src/native/components/InboxChatListSidebar.jsx)) уже умеет отображать `topic.lastMessage` — fallback на «Нет предпросмотра» теперь сработает только для **реально** пустых тем (что есть, например, FAQ).

**Корень вопроса 2 («что за сообщение в списке чатов для форум-группы»)**:

На скриншоте превью «У меня есть контакты двух каналов тут в тг» для OZONовая Дыра — это TDLib `chat.last_message` (последнее любое сообщение в группе, агрегированно по всем темам). Это [норма Telegram Desktop](https://github.com/telegramdesktop/tdesktop) — он показывает то же. Не баг.

**Диагностика фикса 3 (бейдж непрочитанных у форум-группы)**:

[`ChatListItem.jsx:33`](src/native/components/ChatListItem.jsx#L33): `const badgeCount = chat.unreadCount`. Если 0/null — бейдж не рендерится. По [TDLib `chat.unread_count` spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1chat.html) поле должно содержать «Number of unread messages in the chat» — для forum-чатов поведение неоднозначно (агрегирует или 0).

**Не делал client-side aggregation сразу** — нужны данные с реальной сессии. Слепой фикс мог сломать существующие чаты.

**Добавлено логирование** для диагностики (после рестарта будет видно в `chatcenter.log`):

[`tdlibMapper.js mapChat`](main/native/backends/tdlibMapper.js):
```
[forum-map] chatId=-1002966550893 title="OZONовая Дыра" is_forum=true unread_count=N unread_mention_count=M
```

[`tdlibBackend.js forum.getTopics`](main/native/backends/tdlibBackend.js):
```
[forum-be] chatId=... topicsCount=N sumTopicUnread=K chatUnreadCount=L
```

**Что покажет лог**:
- Если `chatUnreadCount == sumTopicUnread` — TDLib агрегирует, бейдж пустой по другой причине (баг рендера).
- Если `chatUnreadCount == 0` при `sumTopicUnread > 0` — TDLib НЕ агрегирует, нужен client-side fallback (UI считает сумму по `store.forumTopics[chatId]`).
- Если ни тот, ни другой — баг подгрузки топиков для форум-чатов на старте.

После рестарта и просмотра лога — точечно фиксим v0.91.5.

**Регрессионная защита**: тестов на эту область нет (низкая ценность — preview всего лишь cosmetic), но `messengerBackend.test.cjs` валидирует контракт.

---

### v0.91.3 — Фикс: «↓ 200» при unread=0 (newBelow счётчик ловил phantom prevLastId). Event-based вариант

**Симптом**: юзер открыл чат «Dan Okhlopkov», листает вверх → бейдж слева в списке чатов исчез (`unreadCount=0` от сервера), но кнопка ↓ в углу чата упорно показывает **200**. И не уменьшается пока юзер не дочитает.

**Диагностика** (chatId `tg_611696632:-1001229486988`):

```
14:54:34  new-below prevLastId=32744931328 → nowLastId=32108445696   added=100  (initial load replace)
14:55:12  new-below prevLastId=32108445696 → nowLastId=32744931328   added=2    (push 2 новых)
14:55:13  new-below prevLastId=32744931328 → nowLastId=32742834176   added=50   (load-newer prefetch)
14:55:23  new-below prevLastId=32742834176 → nowLastId=32686211072   added=48   (load-newer prefetch)
                                                              СУММА = 200
```

И параллельно: `14:55:17 badge-state unread=0 prevUnread=599` — сервер пометил всё прочитанным, но `newBelow=200` остался.

**Корень — 2 бага в [`useNewBelowCounter.js`](src/native/hooks/useNewBelowCounter.js)**:

1. **Phantom prevLastId**: hook отслеживал последнее id в массиве и сравнивал старое → новое. Цикл `for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].id === prevLastId) break; added++ }` рассчитан на **append**. Но при `initial-load` массив заменялся целиком, `prevLastId` (из preview сообщения от updateChatLastMessage) **отсутствовал** в новом массиве → цикл уходил до конца → насчитывал ВСЁ окно как «новое».

2. **Не сбрасывается при server-side `unreadCount=0`**: hook сбрасывал `newBelow` только при смене активного чата. Когда сервер подтверждал mass mark-read через `tg:chat-unread-sync unread=0`, `newBelow` оставался накопленным.

**Архитектурная причина**: hook не различал источник изменения массива:
- `tg:new-message` (TDLib `updateNewMessage` — server push) → ДОЛЖНО считаться
- `tg:messages` (response на get-messages / load-older / load-newer batch) → НЕ должно

Старая логика лезла в массив, не зная источника.

**Сверка по 6 источникам**:

| Источник | Что говорит |
|---|---|
| [TDLib `updateNewMessage`](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1update_new_message.html) | "A new message was received" — приходит ТОЛЬКО для server push, не для responses |
| Telegram Desktop ([mainwidget.cpp](https://github.com/telegramdesktop/tdesktop)) | `Api::Updates::feedUpdate` слушает updateNewMessage, не messages.Messages |
| WhatsApp Web ([whatsmeow events](https://github.com/tulir/whatsmeow/blob/main/events/events.go)) | `events.Message` event — только server push, нет «counter по массиву» |
| Discord ([Gateway MESSAGE_CREATE](https://discord.com/developers/docs/topics/gateway-events#message-create)) | Counter обновляется ТОЛЬКО на gateway events, не на REST response |
| React docs ([useEffect+subscribe](https://react.dev/reference/react/useEffect#subscribing-to-events)) | `useEffect(() => { const unsub = subscribe(); return unsub }, [deps])` — официальный паттерн |
| React docs ([useRef для stable handlers](https://react.dev/reference/react/useRef)) | Ref для свежих значений без переподписки — стандарт |

**Все 4 мессенджера различают server-push vs API-response. Наш текущий код этого не делал — это его дефект.**

**Решение** (полный Вариант B):

1. **[`useNewBelowCounter.js`](src/native/hooks/useNewBelowCounter.js) переписан на event-based**:
   - Подписка на `window.api.on('tg:new-message', ...)` через `useEffect`
   - Фильтры: `chatId === activeChatId`, `!message.isOutgoing`, `!atBottomRef.current`
   - `atBottom` через `useRef` (stable handler — без re-subscribe при каждой смене дна)
   - Cleanup через returned unsub function
   - Расширенные `onSkip` reasons: `other-chat`, `outgoing`, `at-bottom`
   - `tg:messages` batch responses **игнорируются** (другой канал)

2. **[`InboxMode.jsx`](src/native/modes/InboxMode.jsx) — auto-reset при unread=0**:
   ```javascript
   useEffect(() => {
     if (activeUnread === 0 && newBelow > 0) {
       scrollDiag.logEvent('new-below-reset', { reason: 'unread-cleared', prev: newBelow })
       setNewBelow(0)
     }
   }, [activeUnread])
   ```

3. **Расширенное логирование**:
   - `new-below { added, messageId, fromEvent }` — реальное событие
   - `new-below-skip { reason, ... }` — отсев (other-chat / outgoing / at-bottom)
   - `new-below-reset { reason, prev }` — сброс счётчика

**Тесты**: [`useNewBelowCounter.vitest.jsx`](src/native/hooks/useNewBelowCounter.vitest.jsx) полностью переписан на event-based mock (`window.api.on` capture handler, `emitNewMessage()` helper). Покрытие: подписка/отписка lifecycle, 4 фильтра, atBottom через ref не пересоздаёт подписку, batch load НЕ срабатывает (regression-тест).

**Что меняется в UX**:

| Сценарий | До | После |
|---|---|---|
| Юзер скроллит, load-older догружает | 🔴 +50 в кнопке | ✅ +0 |
| Сервер прислал push новое сообщение | ✅ +1 | ✅ +1 |
| Сервер сказал unread=0 (mark-read all) | 🔴 счётчик висит | ✅ 0 |
| Initial load принёс окно с unread cursor | 🔴 +100 phantom | ✅ +0 |

**Что НЕ тронуто**:
- Бейдж в списке чатов слева — он напрямую читает `chat.unreadCount` от TDLib, корректно.
- Сброс newBelow при смене активного чата — был, остался ([InboxMode.jsx:372](src/native/modes/InboxMode.jsx#L372)).
- Сброс newBelow при `nearBottom` — был, остался в [`useInboxScroll.js:70`](src/native/hooks/useInboxScroll.js#L70).

---

### v0.91.2 — Фикс: программа сама прыгала на середину чата пока юзер читал (scroll-jump после v0.91.1)

**Симптом**: юзер открыл чат, листает вверх → через секунду чат **сам** перескакивает в неизвестное место (видит сообщения откуда-то с середины, теряет позицию).

**Когда проявилось**: v0.91.1 разблокировал initial loadMessages → теперь по-настоящему 100 сообщений в чате + работающий load-older → старая мина в `useInitialScroll` начала срабатывать.

**Хронология из лога** (`tg_611696632:-1003061072345`, "Вайбкодинг комьюнити"):

```
14:01:25  load-older +50 → messagesCount: 150→200 → load-older-apply scrollTop=4684 ✅
14:02:19  user-scroll-intent type=wheel (юзер крутит)
14:02:20  mark-read через IntersectionObserver → unread: 445 → 0
14:02:20  store-unread-sync → unread: 0 → 446 (за время чтения капнули новые)
14:02:20  first-unread-calc → firstUnreadId=102998474752
14:02:20  initial-restore-firstUnread-virtual ← ❌ react-window.scrollToRow
14:02:20  scroll-anomaly deltaTop=4433 prevTop=4584 → currTop=9017 (+4433 пикселя)
```

`lastUserType=wheel lastUserAgoMs=240` — юзер активно крутил 240мс назад. Программный scrollToRow перебил.

**Корень — три факта**:

1. **React useEffect re-runs при изменении `messagesCount`** ([React docs](https://react.dev/reference/react/useEffect#parameters)): "If any of the dependencies are different... the Effect will re-run." `messagesCount = activeMessages.length` — обычное число, каждый push увеличивает length → effect перезапускается.

2. **`firstUnreadIdRef.current` пишется на каждом рендере** в [`InboxMode.jsx:347`](src/native/modes/InboxMode.jsx#L347). По [React docs (useRef caveats)](https://react.dev/reference/react/useRef#caveats): "Do not write or read ref.current during rendering... This makes your component's behavior unpredictable." Эффект: useInitialScroll читает СВЕЖИЙ ref → видит пересчитанный firstUnread, не «значение на момент открытия».

3. **react-window 2.x `scrollToRow` не имеет защиты от user activity** ([API docs](https://github.com/bvaughn/react-window)): `element.scrollTop = offset` без проверок `isUserScrolling`. То же про [MDN `scrollIntoView`](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView).

**Сравнение со стеком**:

- **Telegram Desktop** ([tdesktop](https://github.com/telegramdesktop/tdesktop)): auto-scroll к unread **только** при chat enter или scroll position at bottom. Mid-history reading — обновляется только counter badge.
- **WhatsApp Web**: программно scrollTop при чтении не трогает, появляется кнопка «↓ N new messages».
- **Discord** ([gateway events](https://discord.com/developers/docs/topics/gateway-events#message-create)): follow mode vs read mode — scroll трогается только если юзер на дне.
- **iOS Telegram** ([TelegramUI](https://github.com/TelegramMessenger/Telegram-iOS)): `ChatHistoryListNode._isInteractivelyScrolling` — пока true, программные scroll ИГНОРИРУЮТСЯ.

**Общий паттерн всех мессенджеров мира**: программно перебивать активный user scroll нельзя. Наш код это нарушал.

**Правка** (одна функция, один файл):

[`useInitialScroll.js`](src/native/hooks/useInitialScroll.js) — в ветке «already-seen» удалена ветка `firstUnread → scrollIntoView/onMissingTarget`. Restore при возврате к виденному чату = только `savedScrollTop`. Auto-jump к firstUnread остаётся при ПЕРВОМ открытии чата (ветка 1).

**Что меняется в UX**:

| Сценарий | До | После |
|---|---|---|
| Юзер активно читает, mark-read + капают новые | 🔴 прыжок | ✅ не трогаем |
| Первое открытие чата с unread | ✅ scroll to unread anchor | ✅ scroll to unread anchor |
| A → B → возврат в A | прыжок к новым unread | восстановление позиции где был (как TDesktop) |

Сценарий «A→B→A»: компромисс. Поведение Telegram Desktop / WhatsApp / Discord — восстанавливать позицию, не дёргать.

**Тесты**:
- [`useInitialScroll.vitest.jsx`](src/native/hooks/useInitialScroll.vitest.jsx): обновлён тест «savedScrollTop ИГНОРИРУЕТСЯ при firstUnread» → теперь проверяет противоположное (savedScrollTop ВСЕГДА используется). Добавлен новый regression-тест «messagesCount изменился пока юзер в чате — НЕ прыжок».

**Что НЕ тронуто**:
- Ветка 1 (initial-scroll при впервые открываемом чате) — работает как раньше.
- `firstUnreadIdRef` запись в render-фазе ([InboxMode.jsx:347](src/native/modes/InboxMode.jsx#L347)) — антипаттерн, но не наш scope. Можно вынести в useEffect отдельной задачей.

---

### v0.91.1 — Фикс: чат открывается пустым (initial `loadMessages` блокировался push-эмитами TDLib)

**Симптом**: юзер открывает чат с 1000+ непрочитанных, видит **1 сообщение**, дальше минута тишины. Подгрузка истории начинается только когда юзер сам скроллит вверх (load-older). Никакого мгновенного показа, никакого Telegram-feel.

**Диагностика** (по логу `C:/Users/.../ЦентрЧатов/chatcenter.log`):

```
18:54:15  store-set-active-chat ... hasMessages=true   ← в state УЖЕ 1 сообщение
18:54:15  chat-open messages=1 loading=false           ← юзер видит 1
18:54:15  (нет store-load-messages)                    ← loadMessages не вызвался
18:54:44  messages=2 (через 29 секунд)                 ← push tg:new-message капнул
18:55:16  load-older-trigger (через 60 секунд!)        ← юзер начал скроллить — только тогда подгрузка
```

**Корень**:
- [`tdlibClient.js:472`](main/native/backends/tdlibClient.js) эмитит `message:new` для свежих сообщений из SQLite кэша TDLib при старте.
- [`tdlibIpcBridge.js:53`](main/native/tdlibIpcBridge.js) проксирует в `tg:new-message`.
- [`nativeStoreIpc.js:188`](src/native/store/nativeStoreIpc.js) кладёт push в `state.messages[chatId]`.
- Результат: **state.messages[id] почти всегда непуст** до того как юзер кликнул чат.
- [`InboxMode.jsx:77,81`](src/native/modes/InboxMode.jsx) проверяет `!store.messages[store.activeChatId]` → ложно → `loadMessages` **никогда** не вызывается.

**Сравнение со стеком**:
- [TDLib `getChatHistory`](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html) — нужно вызывать при открытии. Сам читает SQLite-кэш + сервер.
- Telegram Desktop, WhatsApp Web, Discord — запрашивают историю **всегда** при смене активного чата. Кэш = optimistic render поверх запроса.
- Наш guard `!messages[id]` отклоняется от общего паттерна.

**Решение** (одна правка, один файл, 2 слова):
- [`InboxMode.jsx:77`](src/native/modes/InboxMode.jsx#L77) и [`:81`](src/native/modes/InboxMode.jsx#L81): `!store.messages[id]` → `!store.loadingMessages[id]`.
- `loadingMessages` уже существует ([`nativeStore.js:79`](src/native/store/nativeStore.js#L79)) и устанавливается внутри `loadMessages` ([`:614`](src/native/store/nativeStore.js#L614)) — инфраструктура готова.
- Защита от дубля сохраняется (быстрые клики), но push'нутые 1-2 сообщения больше не блокируют initial-load.

**Что внутри `loadMessages` уже работает** (не трогали):
- `loadCacheMessages` (IndexedDB, до 50 сообщений) — параллельно с `tg:get-messages`.
- `loadChatCache` (localStorage, до 50) — параллельно.
- `tg:get-messages` → TDLib `getChatHistory` (limit 100 при unread>30) — основной запрос.

**Результат**: при клике на чат — мгновенно ~50 сообщений из IDB (если кэш есть), через 200-500мс — 100 свежих от сервера. Как в Telegram Desktop.

**Регрессия**: не запускалась пока (lint + test:vitest + check-memory будут перед коммитом).

---

### v0.91.0 — ПОЛНЫЙ ОТКАТ WebContentsView миграции (Electron Issue #44934 — Windows 11 native crash)

После 16 версий попыток (v0.89.41 → v0.90.2) и WebSearch в Electron GitHub issues найдено **официальное подтверждение**: [#44934](https://github.com/electron/electron/issues/44934) — на Windows 11 `addChildView(WebContentsView)` + `loadURL` крашит main процесс. Помечено closed «not planned». Не пофикшено в Electron 41.

**Откат**: вернули `BrowserWindow{webviewTag:true}` + `<webview>` тег (production-tested архитектура).

**Удалены**: webContentsViewManager.js, webContentsViewIpcHandlers.js, WebContentsViewSlot.jsx, webContentsViewBridge.js, 3 теста (webContentsViewPatterns.test, webContentsViewManager.vitest, webContentsViewBridge.vitest).

**Сохранены полезные побочные эффекты**: [`UncaughtErrorToast.jsx`](src/components/UncaughtErrorToast.jsx) (UX runtime), global error handlers (renderer + main), [`idbCacheMetrics.js`](src/native/utils/idbCacheMetrics.js), crashpad-фильтр в [`scripts/dev.cjs`](scripts/dev.cjs), документация [`electron-breaking-changes.md`](.memory-bank/electron-breaking-changes.md).

**Полный урок и 7 правил для будущих миграций** — в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md).

### v0.90.2 — child WebContentsView Telegram крашит, изоляционные попытки + watchdog

v0.90.0 миграция работает для primary (React UI грузится). Но child WebContentsView для Telegram всё равно крашит на `loadURL`. Три попытки изолировать минимальную конфигурацию: (1) setBounds default ДО loadURL — bounds=(0,0,0,0) могла крашить renderer; (2) preload={undefined} + lazy mount только активной вкладки (пилот без ChatMonitor); (3) watchdog 15с — `setCreateError` если did-finish-load не пришло (ошибка в UI вместо тихой смерти).

### v0.90.1 — Фикс v0.90.0: BaseWindow не имеет `.loadURL`/`.loadFile`. `mainWindow.loadURL` → `mainWindow.webContents.loadURL`.

### v0.90.0 — АРХИТЕКТУРНАЯ МИГРАЦИЯ: BrowserWindow → BaseWindow + WebContentsView

12 опровергнутых гипотез v0.89.46-v0.89.57 доказали: `webviewTag:true` BrowserWindow + child WebContentsView = архитектурная несовместимость в Electron 41. По [Electron docs](https://www.electronjs.org/docs/latest/api/web-contents-view) WebContentsView → с `BaseWindow`.

**Что**: BrowserWindow → `BaseWindow` + primary `WebContentsView` (React UI) + child WebContentsView (мессенджеры). `<webview>` тег удалён, всегда WebContentsView. `m.partition` сохранён (авторизации не теряются). Тумблер useWebContentsView скрыт. Удалён `disable-gpu-compositing` switch (был для `<webview>`).

**Файлы**: [windowManager.js](main/utils/windowManager.js), [main.js](main/main.js), [App.jsx](src/App.jsx), [SettingsPanel.jsx](src/components/SettingsPanel.jsx) + регрессионные тесты WCV (5 проверок, файлы удалены в v0.91.0).

**Регрессия**: 31/31 ✅ wcv, lint ✅, fileSizeLimits 274/274 ✅, memory bank ✅. Полная история — [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md).

### v0.89.46 → v0.89.57 — серия из 12 опровергнутых гипотез (закрыто в v0.90.0)

Расследование почему пилот WebContentsView крашит main процесс. 12 итераций: preload/sandbox/disable-gpu-compositing/partition/data:URL — все опровергнуты. Корень доказан в v0.90.0 — архитектурная несовместимость `BrowserWindow webviewTag:true` + child `WebContentsView` (требует BaseWindow по Electron docs). Полная история — в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md).

### v0.89.44 — Phase 2.3 (full) активация bridge + 4 сопутствующих улучшения

**Совет 1**: bridge подключён к App.jsx — webviewSetup работает через wcv:* IPC поверх WebContentsView. **Совет 2**: кнопка очистки кэша в Settings. **Совет 3**: авто-cleanup partition при удалении мессенджера (full:true logout). **Совет 4**: метрика hit/miss IDB кэша через logNativeScroll. **Совет 5**: удалён obsolete topicMessagesCache.js. Регрессия: modernPatternsGuard +7, vitest +5.

---

### v0.89.43 — 5 советов Phase 2 расширения (loadURL reactive, partition cleanup, breaking changes docs, pilot template, bridge для webviewSetup)

Совет 2: реактивный `wcv:load-url` без пересоздания view (lastUrlRef). Совет 3: `cleanupPartition(partition, opts)` + IPC `wcv:cleanup-partition` (clearCache + clearStorageData). Совет 4: новый `.memory-bank/electron-breaking-changes.md` — мониторинг + чек-лист. Совет 5: `.memory-bank/webcontents-view-pilot-results.md` — шаблон лога пилота. Совет 1 (min): `src/utils/webContentsViewBridge.js` — proxy эмулирующий `<webview>` интерфейс через `wcv:*` IPC (для подключения webviewSetup в Phase 2.3 full без переписки). **Tests**: 650 → 667 (+17 bridge unit), modernPatternsGuard 21 → 27. Bridge experimental, не подключён к App.jsx.

---

### v0.89.42 — Phase 2 webview миграции: feature flag + условный рендер (pilot без ChatMonitor)

Phase 2.1: toggle `useWebContentsView` в SettingsPanel (default OFF). Phase 2.2: App.jsx условный рендер `<WebContentsViewSlot>` vs `<webview>`. Phase 2.3 (min): pilot БЕЗ ChatMonitor — задокументировано. Phase 2.3 (full) — отдельная фаза. Регрессия +2 проверки.

---

### v0.89.41 — Инфраструктура миграции `<webview>` → `WebContentsView` (feature-flag, default OFF)

По [Electron docs](https://www.electronjs.org/docs/latest/api/webview-tag) «We currently recommend to not use the webview tag, consider WebContentsView». Создана инфраструктура без переключения текущего кода — нулевой риск регрессии. **Файлы**: `webContentsViewManager.js` (класс + 12 forwarded events, graceful degradation), `webContentsViewIpcHandlers.js` (7 IPC `wcv:*` + `wcv:event` bridge), `WebContentsViewSlot.jsx` (React-слот + ResizeObserver → setBounds), регистрация в `main.js`. **Tests**: 638 → 650 (+12 unit + 5 guard).

---

### v0.89.40 — IndexedDB кэш расширен на ВСЕ чаты + TTL cleanup + loadOlder/Newer save

Расширение v0.89.39 (только топики) на все типы чатов. Модуль переименован [`topicMessagesCache.js`](../src/native/utils/topicMessagesCache.js) → [`messagesCache.js`](../src/native/utils/messagesCache.js) (старый — re-export для совместимости). DB `cc-messages-cache`, ключ `chatId:topicId||_main`. **Интеграции в nativeStore.js**: (1) `loadMessages` для обычных чатов делает optimistic render из IDB + сохраняет ответ; (2) `loadOlder/loadNewerMessages` после merge сохраняют tail в IDB; (3) `selectForumTopic` переведён на новые имена. **TTL cleanup**: `cleanupExpired()` через index `ts` + `IDBKeyRange.upperBound` — удаляет всё старше 7 дней. Вызывается при инициализации store через `requestIdleCallback`. **WebContentsView перепроверка**: [`BrowserView` deprecated с **Electron v29.0.0**](https://www.electronjs.org/docs/latest/api/browser-view) (я писал v30 — ошибка). [`<webview>`](https://www.electronjs.org/docs/latest/api/webview-tag) — Electron официально пишет «we recommend to not use». **Tests**: 631 → 638 (+7).

---

### v0.89.39 — AbortController в hooks + IndexedDB кэш форум-топиков (Telegram-style optimistic render)

**Совет 2 — AbortController**: в [`MuteMenu.jsx`](../src/native/components/MuteMenu.jsx) и [`AccountContextMenu.jsx`](../src/native/components/AccountContextMenu.jsx) (по 2 listener'а: pointerdown + keydown) — `{ signal: ac.signal }` + один `ac.abort()` вместо 2 removeEventListener. В файлах с 1 listener — НЕ трогаю (SIMPLICITY).

**Совет 3 — IndexedDB optimistic render**: новый [`topicMessagesCache.js`](../src/native/utils/topicMessagesCache.js) — IDB store `cc-topic-cache`, последние 50 сообщений на топик, TTL 7 дней, graceful degradation. В [`selectForumTopic`](../src/native/store/nativeStore.js) при клике параллельно `loadTopicMessages` → если кэш есть → optimistic render. После сервера → `saveTopicMessages`. Как Telegram Desktop через TDLib local cache.

**Tests**: 624 → 631 (+7).

---

### v0.89.38 — Модернизация по документации стека (Security + Pointer Events + webview overlay)

**4 группы одним коммитом**. A: `trayManager.js` log-viewer перешёл на `contextIsolation:true + preload` (Electron Security Don't #2/#3). B: разделитель AI sidebar залипал — глобальный `position:fixed, zIndex:999999` overlay вместо локального `absolute` (Electron webview docs: события не пересекают границу). C: Mouse Events → [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) в `useAIPanelResize` (+`setPointerCapture`) и 3 dropdown'ах. D: ловушка #29 update — `forceFinalSlideInState()` теперь в ОБОИХ путях (animationend + fallback). Тесты: новый `modernPatternsGuard.test.cjs` (15), `transparentWindowGuard` (19), 624 vitest. Подключены к pre-commit/push.

---

### v0.89.37 — Skeleton overlay + race protection для форум-топиков (Telegram/Discord-style)

Пользователь: «бегает строка загрузки и всё, не грузит». Лог 09:46:24: топик 2325 загрузился за 188мс, но `hasEl=false` (DOM scrollRef ещё не подключён) → `chatReady=false` → `opacity:0` → **~600мс чёрного экрана** на первой загрузке.

**Две корневые причины**:
1. [`InboxChatPanel.jsx:157`](../src/native/components/InboxChatPanel.jsx) условие `&& visibleMessages.length > 0` скрывало overlay при `messages=0` → юзер видел чёрно вместо «Загружаю»
2. [`nativeStore.js selectForumTopic`](../src/native/store/nativeStore.js) без race protection: при быстром A→B ответ A мог затереть state

**Сверка с мессенджерами**: Telegram Desktop, WhatsApp Web, Discord, Slack — все показывают skeleton **сразу** + используют requestId/AbortController.

**Решение 1 (Skeleton, 1 строка)**: убрано `&& visibleMessages.length > 0` — overlay показывается с первого клика.

**Решение 2 (Race protection, ~15 строк)**: `selectTopicRequestRef = useRef(new Map())` хранит последний requestId на chatId. Каждый invoke получает уникальный id. После await сравниваем — если в Map другой id, ответ игнорируем (`{ ok: false, stale: true }`).

**Tests**: 623 → 624 (+1 регрессионный для race). **Ловушка** в `mistakes/native-scroll-unread.md`.

---

### v0.89.36 — Второй корень notification ribbon: force-transform в slideIn fallback (ловушка #29)

Через час после v0.89.35 пользователь снова видит «полосу». Лог 10:11:00: 4 нотификации в одну миллисекунду (race Telegram sync). DOM: `id=105 realTf=matrix(1,0,0,1,380,0) slid=true` — `slideInDone=true` поставлен, но transform застрял на translateX(380). **Корень**: в [`notification.js:573-582`](../main/notification.js) v0.89.23 fallback ставил **только флаг**, не форсировал transform. `calcHeight()` учитывал element 182px, окно расширялось. **Сверка**: Telegram Desktop / WhatsApp / Discord / Slack — все гарантируют final state через JS. **Решение** (~5 строк): fallback теперь форсирует `animation='none'` + `transform='translateX(0) scale(1)'` + `opacity='1'`. Регрессия: тест проверяет 3 force-style. **Ловушка #29** в `mistakes/notifications-ribbon.md`.

---

### v0.89.35 — Корень серии notification ribbon: `backgroundThrottling: false` (ловушка #28)

Через сутки после «закрытия» серии v0.89.18-v0.89.27 пользователь снова увидел пустую полосу + кнопка «Закрыть» не реагирует. Лог 09:07: `DOM snapshot id=17 realTf=matrix(1,0,0,1,380,0)` — item застрял с `translateX(380px)` (0% keyframe из CSS `slideIn`). Анимация не запустилась.

**Сверка с [Electron docs](https://www.electronjs.org/docs/latest/api/browser-window)** (verbatim): «If `backgroundThrottling` is disabled, the visibility state will remain `visible` even if the window is minimized, occluded, or hidden».

**Сверка с кодом**: `notificationManager.js` создавал notifWin БЕЗ `backgroundThrottling: false` → по умолчанию Chromium throttling включён → CSS animations и `requestAnimationFrame` паузятся когда окно `hide()` или occluded → `slideIn` keyframes не выполняются → item застрял → невидим но bounds учитывают высоту → **«пустая полоса»**.

**5 предыдущих фиксов (v0.89.18 safeHide, v0.89.22 убран setIgnoreMouseEvents, v0.89.23 IGNORE stale, v0.89.26 hideIfEmpty, v0.89.27 rendererPure) закрывали симптомы. Корень — `backgroundThrottling: true` по умолчанию — не трогали.**

Также закрывает старую ловушку **v0.47.2** «requestAnimationFrame НЕ работает в hidden BrowserWindow» — тот же стек, тот же throttling, тот же фикс.

**Решение** — 1 строка в [`notificationManager.js:91-97`](../main/handlers/notificationManager.js): добавлен `backgroundThrottling: false` в `webPreferences`.

**Регрессионная защита**: [`transparentWindowGuard.test.cjs`](../src/__tests__/transparentWindowGuard.test.cjs) проверяет наличие параметра. Pre-commit hook падает при удалении (верифицировано: убрал параметр → 17/18 ✅, вернул → 18/18 ✅).

**Ловушка #28** в `mistakes/notifications-ribbon.md` — полная история + правило для будущего.

---

### v0.89.34 — Массовое разбиение: 0 предупреждений 80%+ лимита (запас 20% во всех файлах)

По указанию пользователя: было 12 файлов на 80-99% лимита, стало **0**. Production: `tdlibMessages.js` (475→356, sendFile→tdlibSend.js), `tdlibMapper.js` (417→282, media→tdlibMapperMedia.js), `tdlibIpcHandlers.js` (410→323, event bridge→tdlibIpcBridge.js), `useInboxNewerPrefetch.js` (121→112). Vitest: 4 файла разбиты + 4 новых файла. Compaction: `fileSizeLimits.test.cjs` (345→277, exceptions→отдельный модуль), 3 vitest файла compaction headers/blank lines. **Tests**: 623/623, 7 новых файлов, 0 регрессий.

---

### v0.89.33 — Divider «Новые сообщения» застывает на snapshot позиции открытия

После v0.89.32: полоска постоянно перепрыгивает при прокрутке. Лог: за 36с 8 пересчётов `firstUnreadId`. **Корень**: useEffect пересчёта имел в deps живой `activeReadInboxMaxId` → каждый server sync двигал divider. **Сверка**: TDLib `openChat` lifecycle + Telegram Desktop/WhatsApp/Discord/Slack — все делают snapshot. **Решение** (~15 строк + 1 тест): `frozenReadCursorRef`, сброс по `activeViewKey`, фиксация на первом ненулевом cursor. Счётчик боковой панели остался живой (v0.87.41). **Tests**: 622 → 623. **Ловушка** в `mistakes/native-scroll-unread.md`.

---

### v0.89.32 — Диагностические логи для форум-топиков (markRead pipeline + prepend size jumps)

После v0.89.31 две жалобы: счётчик замирает / окно дёргается. Лог 17:57 показал: (1) замирания = `read-batch-skip` watermark защита v0.87.37 (правильное поведение); (2) дёргание = `top=27666→1669` после prepend 100 msg в react-window. 100% решения нет — добавлены диагностические логи: `[topic-mark] INVOKE/OK/ERROR` в backend, `[topic-mark-ui] SEND` + `[topic-mark-refresh] delta` в store, `[topic-load-older/newer] before/added/after`. **Tests**: 622 без изменений.

---

### v0.89.31 — Форум-топики: плашка «N из M» двигается, счётчик сбрасывается (ловушка #30)

После v0.89.30 пользователь сообщил: плашка «100 из 217» замирает, счётчик 217 не сбрасывается. **Три причины**: (1) `loadOlder/loadNewerMessages` для топиков не пересчитывали `messageWindows[key].loadedIncoming`; (2) [`viewMessages`](https://github.com/tdlib/td/blob/master/td/generate/scheme/td_api.tl) для форумов требует `source: messageSourceForumTopicHistory`, мы не передавали; (3) `unreadWindowIncomplete` блокировал force-read.

**Правки** (3, ~30 строк): `nativeStore.js` loadOlder/Newer для топика пересчитывают `messageWindows[key]` через `buildUnreadWindowMeta`; [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `markTopicRead` добавляет `source: messageSourceForumTopicHistory`. **Tests**: 620 → 622. **Ловушка #30** в `mistakes/tdlib-forum.md`.

---

### v0.89.30 — Форум-топики: сообщения теперь грузятся (`forum_topic_id` ≠ `message_thread_id`, ловушка #29)

После v0.89.29: топик OZON → `Message not found`, General → `Scheduled messages can't have message threads`.

**Корень**: `forum_topic_id` (int32, UI) ≠ `message_thread_id` (int53, API). [TDLib docs](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html): `getMessageThreadHistory` ожидает **message_id первого сообщения треда**, а мы передавали короткий UI-id. Плюс General топик (`is_general=true`) = весь чат, для него `getChatHistory`.

**Решение** (3 файла, ~30 строк):
1. [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `forum.getTopics`: добавлены `threadMessageId: t.last_message?.message_thread_id ?? t.last_message?.id ?? null` + `isGeneral: !!t.info?.is_general`
2. [`nativeStore.js`](../src/native/store/nativeStore.js) `selectForumTopic`/`loadOlder`/`loadNewer`: передают `threadMessageId` и `isGeneral` в IPC payload
3. [`tdlibBackend.js`](../main/native/backends/tdlibBackend.js) `messages.getTopic`: branch — `isGeneral` → `getChatHistory`, иначе → `getMessageThreadHistory(message_id=threadMessageId)`

**Tests**: 615 → 620 (+5: threadMessageId из last_message, fallback на last_message.id, isGeneral path, empty for missing thread). **Ловушка #29** в `mistakes/tdlib-forum.md`.

---

### v0.89.29 — TDLib 1.8 переименовал `message_thread_id` → `forum_topic_id` (ловушка #28)

**Контекст**: после v0.89.28 diagnostic logs пользователь воспроизвёл: кликает на тему OZON → справа черно. Логи 15:35:

```
[topic-ui] selectForumTopic ... topicId= topMessageId= unreadCount=215
                                ↑↑↑ ПУСТЫЕ!
[topic-be] no topicId — params={topicId:"",topMessageId:"",...}
[topic-ui] result ok=false error=no topicId
```

Для **ВСЕХ** тем (74, 215, 100 непрочитанных) `topicId` пустая строка.

#### Корневая причина — TDLib breaking change в API между 1.7 → 1.8

📚 Сверка с [официальной TDLib документацией](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html):

| Старое (TDLib 1.7.x) | Новое (TDLib 1.8+) |
|---|---|
| `forumTopicInfo.message_thread_id: int53` | `forumTopicInfo.forum_topic_id: int32` |
| — | `forumTopicInfo.chat_id: int53` (добавлено) |
| — | `forumTopicInfo.is_general: Bool` (добавлено) |

Наш проект: `prebuilt-tdlib@0.1008064.0` → **TDLib v1.8.64** (новейшая на май 2026).

Наш код в [tdlibBackend.js:488](../main/native/backends/tdlibBackend.js) читал `t.info?.message_thread_id` — **поле НЕ существует** в 1.8+ → `undefined` → `String(undefined || '') === ''` → все topics с пустым `id`.

#### Решение

```js
// Поддержка обоих имён (новое первым, старое как fallback)
const threadId = t.info?.forum_topic_id ?? t.info?.message_thread_id
const idStr = threadId !== null && threadId !== undefined ? String(threadId) : ''
```

Использовали `??` (nullish coalescing) вместо `||` — чтобы `0` (валидное значение для general topic) не fall-through на fallback.

Также добавили `isGeneral: !!t.info?.is_general` в наш topic объект — UI может отличать general от пользовательских тем.

#### Регрессионная защита

```js
// При первом полученном topic печатает СЫРУЮ структуру info от TDLib
if (result?.topics?.[0]) {
  console.log('[forum-be] sample topic[0] info=' + JSON.stringify(result.topics[0].info) + ' unread=...')
}
```

Если TDLib снова переименует поле в будущих версиях — увидим в первой сессии после апдейта.

#### Ловушка #28 — записана в `mistakes/tdlib-forum.md`

«TDLib **не использует semver** в смысле "minor не ломает API". Каждая новая версия (1.7 → 1.8) может переименовать или удалить поля. При апдейте `prebuilt-tdlib` — проверять td_api spec на breaking changes».

Добавлен список известных переименований 1.7 → 1.8 для справки.

#### Эффект

🟢 **Что починилось**:
- Forum topics получают корректные `id` (forum_topic_id или 1 для general)
- `selectForumTopic` отправляет правильный topicId → backend.getTopic не отбрасывает
- TDLib `getMessageThreadHistory` получает валидный `message_id` → возвращает сообщения
- Active state работает (id для каждого topic уникальный) — синяя полоса слева видна
- «Загружаю непрочитанные» завершается + показываются сообщения

---

### v0.89.28 — Forum topic UI: active state visible + diagnostic для load topic messages

После v0.89.25 forum-чаты показывают панель тем, но (1) активная тема почти не видна (13% alpha на AMOLED), (2) клик на тему — справа чёрно, нет логов про `tg:get-topic-messages`.

**Правки**: CSS active state увеличен с 13% alpha до `rgba(42,171,238,0.18)` + `border-left: 3px solid #2AABEE` (Telegram-style). 3 точки логирования: `selectForumTopic`, `tg:get-topic-messages` result, `backend.messages.getTopic`. Логи v0.89.29 показали `topicId=""` (см. ловушка #28).

---

### v0.89.27 — `rendererPure` авторитативный signal — ловушка #26

После v0.89.26 полоска возвращается. Лог: `IGNORE stale raw=0 (items=2 > 0)` — main process накопил мусор от ghost-stacking. Решение: renderer = source of truth для terminal state. `notif:resize` принимает `meta = { rendererPure: boolean }`. Main очищает мусор и скрывает окно если `height<=0 && rendererPure`. 3 файла: `notification.js`, `notification.preload.cjs`, `notifHandlers.js`. **Ловушка #26** в `mistakes/notifications-ribbon.md`.

---

### v0.89.26 — Окно notification не скрывалось после dismiss (ловушка #25)

После v0.89.23 race: `notif:resize(0)` приходил ДО `notif:dismiss` → защита v0.89.23 IGNORE'нула resize → больше resize не приходило → окно visible. Решение: `hideIfEmpty()` после каждого setNotifItems в 3 handler'ах (`notif:click`/`mark-read`/`dismiss`). Main process — source of truth, не ждём renderer. **Ловушка #25** в `mistakes/notifications-ribbon.md`.

---

### v0.89.25 — Fix: `is_forum` в TDLib supergroup, не в chatTypeSupergroup (ловушка #24)

[TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1supergroup.html): `is_forum` в объекте `supergroup`, не в `chatTypeSupergroup`. До v0.89.25 mapChat читал `type.is_forum` (undefined). Решение: `supergroupCache` + `updateSupergroup` handler в `tdlibClient.js`, mapChat читает `extras.supergroup.is_forum`. **Tests**: 608 → 615 (+7). **Ловушка #24** в `mistakes/tdlib-forum.md`.

---

### v0.89.24 — Diagnostic логи для forum topics pipeline

Пользователь: forum-чаты не открывают панель тем. Добавлены 4 точки логирования `[forum-ipc/be/map/ui]` без правок поведения. Логи v0.89.25 → нашли причину (is_forum в supergroup, не chatTypeSupergroup, ловушка #24).

---

### v0.89.23 — Два бага notification pipeline: «пустая полоса» + race `raw=0 items=1`

**Контекст**: после v0.89.22 пользователь прислал скриншот в 12:12 — сверху видно Telegram уведомление «vevs.home», ниже **пустая полоса**. Логи v0.89.20-21 + DOM snapshots показали: items=2 в DOM, оба op=1 tf=none, но визуально один не виден.

#### Два независимых бага, оба подтверждены документально по стеку

**Баг #1 — «Пустая полоса»**: slideIn animation 300ms + offsetHeight включён в calcHeight → окно расширяется СРАЗУ, но новый element ещё за экраном (translateX анимируется).

Подтверждение из MDN:
- 📚 [HTMLElement.offsetHeight](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetHeight): «measures layout position, not visual position. CSS transforms affect only visual rendering»
- 📚 [Using CSS animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Using_CSS_animations): «Animated property values do NOT appear in `element.style` — only computed style»

**Баг #2 — Race `raw=0 items=1`**: renderer прислал `notif:resize(0)` от прошлого dismiss ПОСЛЕ того как main process получил новое `notif:show` (items=1) → main скрывает окно ошибочно.

Подтверждение из Electron docs:
- 📚 [ipcRenderer.send](https://www.electronjs.org/docs/latest/api/ipc-renderer): «Send an **asynchronous** message to the main process»
- setTimeout 60ms в `reportHeight` не гарантирует порядок относительно других IPC

#### Решение Баг #1 — slideInDone флаг

В [`main/notification.js`](../main/notification.js):

```js
// Перед appendChild:
el.dataset.slideInDone = 'false'

// Слушаем animationend для slideIn:
el.addEventListener('animationend', (e) => {
  if (e.animationName !== 'slideIn') return
  el.dataset.slideInDone = 'true'
  reportHeight()  // ← перепроверяем теперь когда element на месте
}, { once: true })

// Страховка 600ms на случай если animationend не сработает

// В calcHeight():
if (child.dataset.slideInDone === 'false') continue  // ← новое: пропускаем анимирующиеся
```

**Эффект**: `calcHeight` НЕ включает новый element пока он анимируется → main НЕ расширяет окно раньше времени → пользователь не видит пустоты.

#### Решение Баг #2 — игнорировать stale `raw=0`

В [`main/handlers/notifHandlers.js`](../main/handlers/notifHandlers.js):

```js
const itemsCount = getNotifItems().length
if (height <= 0 && itemsCount > 0) {
  console.log('[notif-resize] IGNORE stale raw=0 (items=' + itemsCount + ' > 0)')
  return  // ← stale event от прошлого dismiss
}
```

**Эффект**: если main знает что есть item, но renderer прислал `0` (запоздалый reportHeight) — игнорируем. Следующий reportHeight от renderer пришлёт правильное значение.

#### Усиление диагностики

DOM snapshot теперь логирует:
- `inlineTf` (старый `tf`) — `el.style.transform` (inline)
- `realTf` — `getComputedStyle(el).transform` (учитывает CSS animation!)
- `slid` — флаг `slideInDone`

Если баг #1 вернётся — лог сразу покажет реальный transform.

#### Документация

Обе ловушки записаны в [`mistakes/notifications-ribbon.md`](mistakes/notifications-ribbon.md):
- Ловушка #22 — «Пустая полоса» (slideIn + offsetHeight)
- Ловушка #23 — IPC race (stale resize=0)

Каждая с MDN/Electron ссылками + правилом.

#### Урок

В v0.89.21 я добавил DOM snapshot, но логировал только `el.style.transform` — это inline style, **не** учитывает CSS animation. По MDN: animation values «only exist in computed style». Я не прочитал MDN при добавлении лога. Через 1 итерацию (v0.89.21 → v0.89.22) пользователь поймал баг через скриншот.

**Правило (для auto-memory)**: при добавлении diagnostic log для CSS-анимируемых свойств — ВСЕГДА читать `getComputedStyle()`, не `el.style`.

---

### v0.89.15 – v0.89.22 — заархивированы

Перенесены в [`archive/features-v0.89.15-22.md`](./archive/features-v0.89.15-22.md) (релиз v0.89.44, 19 мая 2026 — features.md перевалил 100 КБ после Phase 2 серии).

В архиве: серия notification ribbon (v0.89.18-v0.89.22 — корни закрыты в v0.89.35 backgroundThrottling и v0.89.36 force-transform), LRU-кеш tg-media (v0.89.17), постеры видео (v0.89.16), финал видео-pipeline (v0.89.15).

---

---

### v0.89.6 – v0.89.14 — заархивированы

Перенесены в [`archive/features-v0.89.6-14.md`](./archive/features-v0.89.6-14.md) (18 мая 2026, при превышении features.md 100 КБ в v0.89.19). 9 итераций видео-pipeline стабилизации после TDLib миграции — серия закрыта в v0.89.15-v0.89.16 (подтверждено пользователем).

### v0.89.1 – v0.89.5 — заархивированы

Перенесены в [`archive/features-v0.89.1-5.md`](./archive/features-v0.89.1-5.md) (релиз v0.89.14, 15 мая 2026 — features.md перевалил 100 КБ после серии видео-фиксов v0.89.7–v0.89.14).

В архиве: полное удаление GramJS (v0.89.1), 4 раунда аудита TDLib миграции (v0.89.2–v0.89.5).

---

### v0.89.0 — Этап 2 виртуализации: VirtualMessageList в InboxChatPanel

**Контекст**: v0.88.x подготовили почву (страховка push, защитные тесты), v0.89.0 — собственно
рефакторинг рендера. До этого `renderItems.map(...)` рендерил **весь** список сообщений в DOM
(в чатах с 4000+ непрочитанных это даёт лаги при скролле). Теперь DOM держит только
видимые ~20 строк + overscan через [`react-window`](https://github.com/bvaughn/react-window) 2.2.

**Что сделано**:

- [`src/native/components/VirtualMessageList.jsx`](src/native/components/VirtualMessageList.jsx) — компонент Phase 1 (создан в v0.88.3) расширен: принимает события `onScroll/onWheel/onTouchStart/onPointerDown/onDragOver/onDragLeave/onDrop` и пробрасывает их в outer div `<List>` через `...rest`. `MessageRow` теперь сам делает `padding: 16px по бокам + 6px снизу` (вместо старого `padding/gap` на scroll-контейнере), `boxSizing: 'border-box'` — `ResizeObserver` react-window учитывает paddingBottom как часть высоты row.
- [`src/native/components/InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx) — `renderItems.map(...)` блок (~95 строк) заменён на `<VirtualMessageList>`. `msgsScrollRef` теперь синхронизируется с `listRef.current.element` через `useEffect` + `useState scrollElement`. Этот state нужен IntersectionObserver'у в `MessageBubble.readRoot` — при первом рендере root ещё `null`, после монтирования react-window выставляется реальный element, observer пересоздаётся (deps `[enabled, root]` в `useReadOnScrollAway`).
- [`src/native/hooks/useInitialScroll.js`](src/native/hooks/useInitialScroll.js) — добавлен опциональный `onMissingTarget(firstUnreadId)` callback. Когда `querySelector('[data-msg-id]')` промахивается (firstUnread вне видимого виртуального DOM), вызывается `onMissingTarget` → InboxMode скроллит через `listRef.current.scrollToRow({ index })`. Без fallback react-window открывал чат сверху, юзер не видел непрочитанные.
- [`src/native/modes/InboxMode.jsx`](src/native/modes/InboxMode.jsx):
  - `virtualListRef = useRef(null)` — imperative API react-window.
  - `findRenderItemIndex(msgId)` — ищет где сообщение в `renderItems` (учитывает альбомы: `item.msgs[*].msgs[*].id` для типа `album`).
  - `scrollToVirtualRow(msgId, align)` — вызывает `virtualListRef.scrollToRow({ index, align })`.
  - `scrollToMessage(msgId)` сначала пробует старый `querySelector` (видимый row), потом fallback `scrollToVirtualRow(msgId, 'center')` + повторная попытка подсветить через 200 мс.
  - `useInitialScroll` получает `onMissingTarget: id => scrollToVirtualRow(id, 'start')`.
- `src/__tests__/unreadAutoPrefetch.test.cjs` — 2 защитных теста v0.88.2 обновлены (проверка проводки `onReplyClick={scrollToMessage}` теперь смотрит в `VirtualMessageList.jsx`, не в `InboxChatPanel.jsx`); добавлено 5 новых тестов: `InboxChatPanel рендерит VirtualMessageList`, `VirtualMessageList использует react-window <List> + useDynamicRowHeight`, `InboxMode прокидывает virtualListRef`, `findRenderItemIndex + scrollToVirtualRow`, `useInitialScroll.onMissingTarget`. (v0.89.x Этап 4: файл удалён вместе с GramJS-специфичными тестами. Виртуализационные регрессии теперь покрывает [`src/native/components/VirtualMessageList.vitest.jsx`](src/native/components/VirtualMessageList.vitest.jsx).)

**Сохранено без изменений**:

- `useReadOnScrollAway` (rootMargin `-48% 0px -48% 0px`) — работает как раньше, просто root = `listRef.element` вместо div'a.
- `useInboxScroll` + `useInboxNewerPrefetch` (load-older, prefetch-newer, atBottom) — onScroll-event тот же, теперь приходит из react-window.
- `useReadByVisibility` (batch markRead 300мс) — не трогали.
- `useNewBelowCounter`, `useForceReadAtBottom`, `useMessageActions` — не трогали.
- `messageGrouping.js` — критичная защита v0.87.113 (senderAvatar в group/album) — без изменений.

**Известные риски, требующие визуальной проверки**:

- **load-older preserve scroll position** (`scrollTop = scrollHeight - prevHeight`) при виртуализации работает, но `useDynamicRowHeight` измеряет высоту row асинхронно через `ResizeObserver`. Если новые сообщения ещё не обмерены — `scrollHeight` неточен. Если будет «прыжок» при подгрузке вверх — нужна будет замена на `scrollToRow({ index: addedCount, align: 'start' })`.
- **`overflow-anchor`** браузера на virtualised DOM работает иначе. Если будут «дрожания» при добавлении сообщений сверху — добавить `overflow-anchor: none` на outer div react-window.
- **Шапка / pinned message / unread-status bar** живут вне списка — никак не должны были пострадать.

**Версия**: v0.88.2 → v0.89.0 (minor — UI-функциональность не изменилась, но внутренняя архитектура рендера переработана).

**Проверено**:

```powershell
npm.cmd run lint                                            # ожидается OK
npm.cmd run test:vitest                                      # ожидается 166/166 (не должны отвалиться без изменений в API)
node src\__tests__\unreadAutoPrefetch.test.cjs               # 27/27 (+5 виртуализационных)
node src\__tests__\fileSizeLimits.test.cjs                   # лимиты в порядке
```

⚠ **Визуальная проверка пользователем обязательна**: открыть чат с 100+ непрочитанными → должен встать на первое непрочитанное (проверка `onMissingTarget` fallback). Reply-click на старое сообщение → scroll-to-reply должен работать. Прокрутка длинного чата (4000+) — должна быть плавной без лагов DOM.

---

### v0.88.2 — страховка push для real-time + защитные тесты перед Этапом 2

**Контекст**: перед большим рефактором (виртуализация рендера, Этап 2) — две инженерные страховки.

**Страховка 1 — real-time push расhron**:

- В v0.88.1 флаг `noMoreNewerRef` блокировал бесконечный prefetch у конца чата.
- Теоретический пробел: если Telegram push (`tg:new-message`) по какой-то причине пропустит сообщение (gap в `pts`, потеря сессии), флаг остаётся `true` и блокирует prefetch как «спасательный канал» до смены чата.
- Источник: [core.telegram.org/api/updates](https://core.telegram.org/api/updates) — Telegram использует server-push, но требует клиента вызывать `updates.getDifference` при rasync; GramJS делает это сама при reconnect.
- Решение: в [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js) добавлен `useEffect` который отслеживает `activeMessages.length` + `scrollKey`. Когда массив растёт в рамках одного `viewKey` (push доставил новое сообщение или load-newer вернул что-то) — флаг `noMoreNewerRef.current.delete(viewKey)` автоматически снимается. Логируется через `load-newer-flag-reset`.
- Поведение: чат с 0 unread → флаг становится `true` → приходит push через 10 минут → массив растёт → флаг снимается → следующий скролл может снова попробовать prefetch.

**Страховка 2 — защитные тесты перед Этапом 2**:

В `unreadAutoPrefetch.test.cjs` (v0.89.x Этап 4: удалён) добавлены статические проверки на критичные интеграции, которые **с большой вероятностью пострадают при внедрении виртуализации**:

- `MessageBubble` и `AlbumBubble` принимают `onReplyClick` (reply → scroll-to-message).
- `InboxChatPanel` проводит `scrollToMessage` в `onReplyClick`.
- `groupMessages(visibleMessages, firstUnreadId)` — группировка с разделителем «Новые сообщения».
- `useInitialScroll` читает `firstUnreadIdRef`.
- `useReadOnScrollAway` использует `rootMargin: '-48% 0px -48% 0px'` (читающая линия).

Если виртуализация Этапа 2 сломает любую из этих интеграций — соответствующий статический тест упадёт и сразу укажет где смотреть.

**Версия**: v0.88.1 → v0.88.2 (patch — страховочное улучшение без новой UI-функциональности).

**Проверено**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 files / 166 tests passed
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 22/22 (+6 от v0.88.1)
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
```

---

### v0.88.1 — фикс бесконечного цикла prefetch у конца чата

**Баг из v0.88.0**: после первой автодогрузки внизу ленты индикатор «Загружаю ещё...» оставался видимым и не пропадал. Окно чата периодически «дёргалось» каждые 300 мс.

**Причина**:
1. Скролл доходил до низа (`fromBottomPx < 1500`) → срабатывал prefetch.
2. Telegram возвращал пустой массив (новее сообщений нет — пользователь у конца чата).
3. Backend всё равно эмитил `tg:messages` с пустым `messages`.
4. IPC listener делал `setState({ messages: [...existing, ...[]] })` — **новая ссылка** на тот же контент → лишний рендер («дёрг»).
5. Через 300 мс `loadingNewerRef` снимался → scroll положение то же → опять триггер → опять пустой ответ. Бесконечный цикл.

**Фикс**:
- `main/native/telegramMessages.js`: `tg:get-messages` и `tg:get-topic-messages` **не эмитят** `tg:messages` если `afterId` использован и Telegram вернул `0` сообщений.
- `src/native/store/nativeStoreIpc.js`: на случай если backend всё-таки эмитнет — listener делает **ранний return без setState** когда `appendNewer:true` и `newNewer.length === 0`.
- `src/native/hooks/useInboxScroll.js`: добавлен `noMoreNewerRef = useRef(new Map())`. Когда `loadNewerMessages` возвращает `hasMore:false` ИЛИ пустой массив — фиксируем флаг для этого `viewKey`. Условие триггера дополнено: `!noMoreNewerRef.current.get(viewKey)`. Сбрасывается естественно при смене чата/темы (новый `viewKey` → новая запись в Map).
- Новые vitest-тесты:
  - `appendNewer` с пустым массивом **не меняет ссылку** на массив сообщений (`expect(refAfter).toBe(refBefore)`).
  - `appendNewer` только с дубликатами — то же.
- Новые static-тесты в `unreadAutoPrefetch.test.cjs` (3 проверки): `noMoreNewerRef`, ранний return, отказ от пустого emit.

**Проверено**:

```powershell
npm.cmd run lint                                                # OK
npm.cmd run test:vitest                                          # 19 файлов, 166 тестов passed
node src\__tests__\unreadAutoPrefetch.test.cjs                   # 16/16
node src\__tests__\multiAccount.test.cjs                         # 81/81
node src\__tests__\memoryBankSizeLimits.test.cjs                 # 27/27
```

---

### v0.88.0 — Telegram-style автодогрузка новых сообщений вниз

**Контекст**: пользователь нашёл реальные большие чаты (например, чат «1337» с **4253 непрочитанных**). До этого фикса:
- Код запрашивал у Telegram пачку из 500 сообщений, но Telegram MTProto `messages.getHistory` имеет **жёсткий лимит 100** за запрос (источник: [core.telegram.org/api/offsets](https://core.telegram.org/api/offsets)).
- Получая 100 из «ожидаемых» 500, баннер навсегда застревал на `100 из 138` (или `50 из 999+`).
- Не было функции догрузки **новых** сообщений вниз — только `loadOlderMessages` для прокрутки вверх в историю.
- Результат: открыл чат → проскроллил вниз → застрял, остаток непрочитанных не виден.

**Что сделано**:

- `main/native/telegramMessages.js`: добавлен параметр `afterId` в `tg:get-messages` и `tg:get-topic-messages`. Маппится в MTProto `min_id` + `offset_id=0` + `add_offset=-limit`. При `afterId` бэкенд эмитит `tg:messages` с флагом `appendNewer: true`. (v0.89.x Этап 4: файл удалён, поведение перенесено в [`main/native/backends/tdlibMessages.js`](main/native/backends/tdlibMessages.js).)
- `src/native/store/nativeStore.js`:
  - Константа `UNREAD_WINDOW_MAX_MESSAGES` уменьшена 500 → **100** (реальный потолок Telegram API). Это исправляет баг «100 из 138».
  - Умная формула `addOffset` в [`unreadWindowRequestParams`](src/native/store/nativeStore.js): при `unread > 30` окно сдвигается ближе к курсору (90% непрочитанных), для маленьких unread оставляем больше контекста (25%).
  - Новая функция [`loadNewerMessages(chatId, afterId, limit=100)`](src/native/store/nativeStore.js) с per-key throttle **300 мс** (защита от `FLOOD_WAIT`).
- `src/native/store/nativeStoreIpc.js`: слушатель `tg:messages` теперь обрабатывает поле `appendNewer: true` — добавляет новые сообщения в конец массива с дедупликацией.
- `src/native/hooks/useInboxScroll.js`: добавлен prefetch-триггер: при `fromBottom < 1500px` (≈20 сообщений) → `store.loadNewerMessages(chatId, lastIncomingId)`. Защищено `loadingNewerRef`. Срабатывает только после `initialScrollDone`.
- `src/native/modes/InboxMode.jsx`: новые `loadingNewerRef` + `useState(loadingNewer)` для UI индикатора, пробрасываются в `useInboxScroll` и `InboxChatPanel`.
- `src/native/components/InboxChatPanel.jsx`: внизу ленты появляется индикатор `«Загружаю ещё...»` (CSS-класс `native-msgs-loading-newer`) во время фоновой подгрузки.
- `src/native/styles-messages.css`: добавлены стили `native-msgs-loading-newer` с пульсирующей точкой.
- Тесты обновлены: `nativeStore.vitest.jsx`, `multiAccount.test.cjs`.

**Подтверждённые числа** (а не выдуманные):

| Число | Что | Откуда |
|---|---|---|
| `100` | Размер пачки | [Telegram MTProto docs](https://core.telegram.org/api/offsets) — жёсткий потолок |
| `300 мс` | Throttle между пачками | Практика MadelineProto/Telethon — безопасный темп против FLOOD_WAIT |
| `1500 px` | Prefetch порог | ≈20 сообщений (react-virtualized default = 15) |
| `0.9 / 0.25` | Соотношение addOffset | Большой unread → почти всё окно для непрочитанных; маленький → больше контекста |

**Что НЕ сделано в этом этапе** (отдельные задачи):

- DOM-виртуализация через `react-virtuoso`/`react-window` для основного рендера: коммерческая версия `VirtuosoMessageList` платная, бесплатная требует переписать группировку/mark-read/scroll-to-reply (~600-800 строк, риск регрессий). Отдельный Этап 2 после стабилизации.
- Отправка/ответ в выбранную тему форума: вход disabled (см. журнал).
- Анимация «stale» badge при refresh: убрано из плана как лишняя нагрузка.

**Подробное расследование**: [`group-topic-investigation.md`](./group-topic-investigation.md), запись от 2026-05-13 «Stage: Newer-messages auto-prefetch».

---

### v0.87.115 – v0.87.136 — заархивированы

Перенесены в [`archive/features-v0.87.115-136.md`](./archive/features-v0.87.115-136.md) (релиз v0.89.9, 15 мая 2026 — features.md перевалил 100 КБ лимит после серии audit-релизов).

В архиве: фикс пустой аватарки чата (v0.87.115), unified connection health status (v0.87.136), Windows installer в корневой dist (v0.87.135), startup graph оптимизации (v0.87.130-134), безопасное восстановление native-аккаунтов (v0.87.127), lazy startup панелей (v0.87.126).

---

### v0.87.106 – v0.87.114 — заархивированы

Перенесены в [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) (релиз v0.89.5, 15 мая 2026 — `features.md` перевалил 100 КБ лимит после четырёх audit-релизов).

В архиве: убран счётчик чатов (v0.87.114), главный фикс аватарок отправителей в групповых чатах (v0.87.113), `GetFullUser` для User без photo (v0.87.112), фоновое скачивание аватарок отправителей (v0.87.111), визуал мьюта + двухуровневое меню (v0.87.110), заглушение уведомлений чата (v0.87.109), кнопки режимов в шапке (v0.87.108), убрана угловая иконка с аватарки (v0.87.107), финальный multi-account UI (v0.87.106).

---

### v0.87.93 – v0.87.105 — заархивированы

Перенесены в [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) (релиз v0.88.2, 13 мая 2026 — `features.md` перевалил 100 КБ лимит).

В архиве: реализация multi-account для native Telegram (v0.87.105), план multi-account (v0.87.104), разбиение 5 файлов на 80%+ (v0.87.103), CodeInput-ячейки (v0.87.102), libphonenumber-js (v0.87.101), CountryPicker (v0.87.99-100), фикс retry-цикла GramJS (v0.87.98), Low Priority разбиение 4 файлов (v0.87.97), фильтр GramJS TIMEOUT (v0.87.96), полный выход из аккаунта (v0.87.95), умный logger (v0.87.94), фикс аватарки через `cc-media://` (v0.87.93).

---
