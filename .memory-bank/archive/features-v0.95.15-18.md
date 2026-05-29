# Архив features.md — v0.95.15 – v0.95.18

Архивирован: 29 мая 2026 (при выпуске v0.95.21 — features.md перевалил 100 КБ).

Содержит 4 версии саги jump-to-end и связанных фиксов (двухфазный scroll, форум-топики, итеративный fetch). Полный нарратив пяти итераций саги — в [`../jump-to-end-saga.md`](../jump-to-end-saga.md).

---

### v0.95.18 — Двухфазный scroll + empty state форума + не мигать shimmer в форуме

Три задачи по запросу юзера: (1) видимый эффект пролистывания, (2) красивый empty state форума без темы, (3) убрать бегущую полосу shimmer когда форум открыт но тема не выбрана.

#### Часть А — Двухфазный smoothScroll (Вариант B)

**Проблема**: Лог `bottomGap=0` и distance ≈ 66622px (110 viewport) после jump-to-end. В [smoothScroll.js](../../src/native/utils/smoothScroll.js) порог `VIEWPORT_THRESHOLD_INSTANT=8` → distance > 8 viewport → **instant fallback** → юзер не видел анимацию.

**Решение — twoPhase option** в [smoothScrollTo](../../src/native/utils/smoothScroll.js):
```
Distance > 1 viewport + twoPhase:true:
  1. INSTANT prelude: el.scrollTop = target - clientHeight (или + при scroll вверх)
  2. SMOOTH последний viewport с easeOutCubic (350мс)
```

Юзер ВСЕГДА видит «приземление» последнего экрана, независимо от distance (100, 10000, 100000px).

В [InboxMode.scrollToBottom jump-to-end](../../src/native/modes/InboxMode.jsx):
```js
smoothScrollTo(elNow, elNow.scrollHeight, {
  duration: 350,
  twoPhase: true,
  onComplete: () => { /* markRead + setAtBottom */ },
})
```

Эталон: Telegram Desktop, iOS jump-to-bottom — instant + smooth last screen.

#### Часть Б — Empty state для форума без выбранной темы

Раньше: пустой чёрный экран + малозаметный текст в input поле «Сначала выберите тему слева».

Теперь — новый компонент [ForumTopicEmptyState.jsx](../../src/native/components/ForumTopicEmptyState.jsx):
- Иконка 📚 (64px, drop-shadow accent)
- Заголовок «Это форум-чат»
- Подсказка «Слева выберите тему форума...»
- `position: absolute, inset: 0, pointer-events: none` — не блокирует клики

Используется в [InboxChatPanel.jsx](../../src/native/components/InboxChatPanel.jsx) когда `activeChat?.isForum && !activeTopic && visibleMessages.length === 0`.

#### Часть В — Не мигать shimmer overlay в форуме без темы

**Проблема**: лог показывал `[forum-map] unread_count=561` каждые 5-10с → `messagesLoading` мерцал → shimmer overlay постоянно показывался хотя юзер не открыл тему.

**Фикс** в [InboxChatPanel.jsx](../../src/native/components/InboxChatPanel.jsx):
```js
<MessageListOverlay
  show={!(activeChat?.isForum && !activeTopic) && ((!chatReady) || !!messagesLoading)}
  ...
/>
```

Когда форум открыт без темы — overlay скрыт, юзер видит `ForumTopicEmptyState`.

#### Часть Г — Проблема несоответствия unread (не баг!)

Лог `[forum-map] unread_count=561` стабильно, но сумма тем меньше. **Это TDLib feature** (не баг):
- `chat.unread_count` включает скрытые/архивные темы
- Sum of `topic.unread_count` — только видимые

Telegram Desktop имеет ту же особенность. У нас уже есть fallback `Math.max(chat.unreadCount, sumTopicUnread)`. Изменений нет.

**Регрессия**: lint 0, vitest 756/756 (+9 новых), fileSizeLimits 287/287, check-memory ✅.

---

### v0.95.17 — Регрессия v0.95.16: убран untilMessageId early break в iterative fetch

Юзер: «теперь чаты не доводят до конца что все прочитали».

#### Лог провала v0.95.16

Чат `tg_611696632:-1001307778786`, unread=274, lastMessageId=35629563904:
```
get-msgs-iter iterations=1 collected=1 target=100 until=35629563904 first=X last=X
                                       ↑
                       TDLib вернул в iter 1 только 1 сообщение (X)
                       Мой break на «untilMessageId in collected» → return [X]
                       Юзер видит 1 сообщение
```

То же для unread=7869: `iterations=1 collected=1`. Не догружало.

#### Корень регрессии

В v0.95.16 я добавил early break когда `untilMessageId in collected`. Но TDLib часто возвращает в iter 1 **ТОЛЬКО** `untilMessageId` (это issue #740 quirk — TDLib `from=0` может вернуть 1 messages). Break срабатывает → возвращается `[X]` → state.messages = 1 элемент.

#### Решение — официальный паттерн TDLib

[ivanstepanovftw в issue #740](https://github.com/tdlib/td/issues/740) показал правильный паттерн:
```cpp
ssize_t remaining = history_size - messages->messages_.size();
if (remaining > 0 && !empty()) {
  send_history_query(chat_id, next_from_message_id, ...);
}
```

**Итерации только по `remaining > 0 && !empty`. БЕЗ untilMessageId short-circuit.**

`untilMessageId` остаётся как **информационный** параметр (для логирования), но НЕ short-circuit'ит итерации.

**Регрессия**: lint 0, vitest 747/747, fileSizeLimits ✅, check-memory ✅.

---

### v0.95.16 — Jump-to-end в ФОРУМ-ТОПИКАХ + плавная анимация scroll (easeOutCubic)

Юзер: «в форумах jump-to-end не работает счётчик не сбросился» + «надо красивый эффект разгона и остановки».

#### Часть А — Форум-топики (расширение v0.95.15 на форумы)

Лог чата `tg_611696632:-1002182060939:topic:1`:
```
button-scroll-bottom chatLastMessageId=null gapMessages=null unreadVsLoaded=1978
                                      ↑
                              Гейт jump-to-end НЕ срабатывает
```

**Корень**: `chat.lastMessageId` — для основного **чата**, не для **топика**. Топик имеет свой `forumTopic.last_message.id` который у нас не маппился.

**Решение**:
1. **forum.getTopics** — добавлен `lastMessageId: t.last_message?.id` в topic object
2. **Новый метод** `backend.messages.getIterativeUntilTopic` — зеркало `getIterativeUntil` через `getMessageThreadHistory` (для не-General) или `getChatHistory` (для General топика)
3. **Новый IPC канал** `tg:get-topic-messages-iterate`
4. **Новый store метод** `loadTopicMessagesUntil(chatId, topic, untilMessageId, targetCount)`
5. **InboxMode.scrollToBottom** — расширен jump-to-end для форум-топиков

**TDLib подтверждение**: `getMessageThreadHistory` имеет ТОТ ЖЕ quirk что `getChatHistory` → итеративный паттерн обязателен.

#### Часть Б — Плавная анимация scroll (easeOutCubic)

Заменил `el.scrollTo({behavior: 'instant'})` на новый util `smoothScrollTo` с `easeOutCubic` (быстрый разгон + плавное приземление).

**Защиты в smoothScrollTo**:
1. `distance < 1px` → no-op
2. `prefers-reduced-motion` → instant (accessibility)
3. `distance > 8 viewport` → instant
4. `duration` default 500мс
5. Финальный snap к точному `targetTop`
6. `cancel()` функция для прерывания

**Регрессия**: lint 0, vitest 747/747 (+17 новых), fileSizeLimits 285/285, check-memory ✅.

---

### v0.95.15 — Итеративный fetch для jump-to-end (по TDLib официальному паттерну)

**Четвёртая итерация саги** (v0.95.12-15). Полная история в [jump-to-end-saga.md](../jump-to-end-saga.md).

#### Корень провала v0.95.14 — найден в логе

Чат «Компьютерная IT, Digital» с `unread=725`, `lastMessageId=9132048384`:
```
store-load-messages aroundId=9132048384 addOffset=-50 force=true
[get-msgs] from=9132048384 offset=-50 count=1 first=9132048384 last=9132048384 hasMore=false
                                              ↑
                                       TDLib вернул count=1
```

#### Корневой ответ от автора TDLib (levlam)

[TDLib issue #740](https://github.com/tdlib/td/issues/740): «For optimal performance the number of returned messages is chosen by the library».

TDLib **намеренно** возвращает меньше `limit`. Один invoke `getChatHistory` НЕ гарантирует limit messages.

#### Решение v0.95.15 — итеративный backend handler

**Новый метод** `backend.messages.getIterativeUntil`:
```js
async getIterativeUntil(params) {
  let collected = []
  let cursor = 0
  for (let i = 0; i < maxIterations; i++) {
    const r = await getChatHistory(client, rawId, { limit: 100, fromMessageId: cursor, ... })
    if (!r?.ok || !r.messages?.length) break
    const newMessages = r.messages.filter(m => !collected.some(c => c.id === m.id))
    if (newMessages.length === 0) break
    collected = [...collected, ...newMessages].sort((a, b) => Number(a.id) - Number(b.id))
    if (collected.length >= targetCount) break
    cursor = String(collected[0].id)
  }
  return { ok: true, messages: collected, iterations: ... }
}
```

**Новый IPC канал** `tg:get-messages-iterate` → emit `tg:messages` в renderer.

**Новый метод store** `loadMessagesUntil(chatId, untilMessageId, targetCount)`.

#### Защиты (4 защиты от bugs)

1. `maxIterations` clamp [1, 10]
2. Detect duplicates
3. Empty response → stop
4. `untilMessageId` информационный (НЕ short-circuit, см. v0.95.17)

**Регрессия**: lint 0, vitest 730/730 (+6 новых), fileSizeLimits 283/283, check-memory ✅.
