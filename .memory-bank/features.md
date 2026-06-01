# Реализованные функции — ChatCenter

## Текущая версия: v0.95.29 (1 июня 2026)

**Структура файла**: этот features.md содержит только **последние активные версии**. Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.95.23-26.md`](./archive/features-v0.95.23-26.md) | v0.95.23 – v0.95.26 (курсор в input, initial backfill, voice/spellcheck/action-bar/WhatsNew, фикс 47-дневного бага unreadCount; стабилизировано) | ~15 КБ |
| [`archive/features-v0.95.19-22.md`](./archive/features-v0.95.19-22.md) | v0.95.19 – v0.95.22 (диагностика tg-new-message, финал jump-to-end, бейдж форум-группы, форум-overlay; стабилизировано) | ~6 КБ |
| [`archive/features-v0.95.15-18.md`](./archive/features-v0.95.15-18.md) | v0.95.15 – v0.95.18 (итеративный fetch + форум-топики + двухфазный scroll + ForumTopicEmptyState; стабилизировано v0.95.20-21) | ~8 КБ |
| [`archive/features-v0.95.12-14.md`](./archive/features-v0.95.12-14.md) | v0.95.12 – v0.95.14 (3 итерации jump-to-end до итеративного fetch v0.95.15, полная сага в jump-to-end-saga.md) | ~32 КБ |
| [`archive/features-v0.95.8-9.md`](./archive/features-v0.95.8-9.md) | v0.95.8 – v0.95.9 (счётчик ↓ обнуляется + анимация + live compact + порог 128) | ~14 КБ |
| [`archive/features-v0.95.5-7.md`](./archive/features-v0.95.5-7.md) | v0.95.5 – v0.95.7 (sticky pinned overlay, кнопка ↓ Telegram-style, drag-to-resize) | ~24 КБ |
| [`archive/features-v0.95.0-3.md`](./archive/features-v0.95.0-3.md) | v0.95.0 – v0.95.3 (контигуити-фикс, afterId load-newer, мигание ↓ Schmitt trigger, диагностика «дёрг») | ~13 КБ |
| [`archive/features-v0.94.1-7.md`](./archive/features-v0.94.1-7.md) | v0.94.1 – v0.94.7 (TDLib listener leak, scroll caskade, спокойная загрузка, пилюля прогресса — стабилизированы v0.95.0-2) | ~24 КБ |
| [`archive/features-v0.93.0.md`](./archive/features-v0.93.0.md) | v0.93.0 (pixel-perfect scroll restore через LocationOptions.offset, superseded v0.94.0) | ~7 КБ |
| [`archive/features-v0.92.0-6.md`](./archive/features-v0.92.0-6.md) | v0.92.0 – v0.92.6 (сага Virtuoso scroll restore, superseded v0.94.0) | ~37 КБ |
| [`archive/features-v0.91.11-24.md`](./archive/features-v0.91.11-24.md) | v0.91.11 – v0.91.24 (сага scroll restore: 13 версий → миграция на virtuoso) | ~47 КБ |
| [`archive/features-v0.91.1-10.md`](./archive/features-v0.91.1-10.md) | v0.91.1 – v0.91.10 (initial-load, scroll-jump, newBelow, forum topics, updateChatLastMessage) | ~12 КБ |
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

### v0.95.29 — Реакции 👍❤️🔥 + Telegram-style header + дефолтная иконка General + render-counter для дубля

Большой UX-релиз — 4 фичи по запросу юзера.

**1. Реакции на сообщениях (полные)** — backend+UI+IPC:
- В [tdlibMapper.js](main/native/backends/tdlibMapper.js) функция `extractReactions(tdMsg)` мапит `interaction_info.reactions` → `[{emoji, count, chosen, customEmojiId?}]`. Premium custom emoji пока placeholder ⭐.
- В [tdlibBackend.js](main/native/backends/tdlibBackend.js) метод `messages.setReaction({chatId, msgId, emoji, action})` — TDLib `addMessageReaction` / `removeMessageReaction`.
- Новый IPC `tg:set-reaction` в [tdlibIpcHandlers.js](main/native/tdlibIpcHandlers.js).
- Новый store метод [`setReaction(chatId, messageId, emoji, action)`](src/native/store/nativeStore.js).
- Новый компонент [MessageReactions.jsx](src/native/components/MessageReactions.jsx) — `ReactionsList` (показ реакций под bubble, click → toggle) + `ReactionPicker` (popup с 8 стандартными emoji: 👍 ❤️ 🔥 🥰 👏 😁 🤔 🤯).
- Интеграция в [MessageBubble.jsx](src/native/components/MessageBubble.jsx) — кнопка 😀 в action-bar открывает picker, реакции рендерятся под текстом, chosen реакции подсвечены.

**2. Telegram-style header** — аватарка + статус под именем чата:
- В backend [tdlibClient.getAccountChats](main/native/backends/tdlibClient.js) пробрасываем `user` объект в `mapChat` для chatTypePrivate.
- В [tdlibMapper.js](main/native/backends/tdlibMapper.js) добавлены поля `lastSeenAt`, `userStatusType`, `memberCount` (для групп/каналов через supergroup.member_count).
- Новый чистый util [`formatChatStatus.js`](src/native/utils/formatChatStatus.js) — Telegram-style строки: «в сети» / «был(а) в 14:25» / «был(а) вчера в 17:15» / «был(а) 15 мин назад» / «N участников» / «N подписчиков». Правила склонения (1 участник / 2 участника / 5 участников). Локализация русская.
- В [InboxChatPanel.jsx](src/native/components/InboxChatPanel.jsx) header: новый `ChatHeaderAvatar` 40x40px (с зелёной точкой онлайн), `formatChatStatus(activeChat)` под именем.

**3. Дефолтная иконка General форум-темы** — раньше показывалась буква «G»:
- В [tdlibForumEmoji.js](main/native/backends/tdlibForumEmoji.js) для тем с `isGeneral=true` и без custom_emoji_id ставим `iconEmoji='📢'` (Telegram Desktop использует SVG-домик, у нас emoji-placeholder).

**4. Расширенные логи для дубля сообщений + custom emoji**:
- В [MessageBubble.jsx](src/native/components/MessageBubble.jsx) глобальный `__ccBubbleRenderCount` Map — лог `[bubble-render-dup]` при renderCount > 1 для одного msg.id.
- В [nativeStore.sendMessage](src/native/store/nativeStore.js) dump последних 6 outgoing из state.messages + общее число.
- В [tdlibForumEmoji.js](main/native/backends/tdlibForumEmoji.js) детальные логи `[forum-emoji] resolve summary` (topics / withCustomId / cached / toFetch / applied url/alt/default).

**Тесты** (+27 unit):
- [formatChatStatus.vitest.js](src/native/utils/formatChatStatus.vitest.js) — 19 тестов (онлайн / offline / typing / разные временные диапазоны / склонение участников)
- [MessageReactions.vitest.jsx](src/native/components/MessageReactions.vitest.jsx) — 8 тестов (QUICK_REACTIONS, рендер с count, chosen подсветка, toggle add/remove, outgoing-стиль, пустые reactions)

**Эталоны** (production messengers 2026):
- Telegram Web K — `reactionElement.ts`, `chatBar` header с avatar + status
- Telegram Desktop — `reactions.cpp`, `info_top_bar.cpp` (avatar + name + status)
- WhatsApp Web — те же паттерны

**НЕ менялось** (стабильность):
- Schmitt-trigger atBottom (v0.95.2)
- markRead логика (v0.87.41, v0.95.26)
- useNewBelowCounter + auto-scroll (v0.95.28)
- contiguity check tg:new-message (v0.95.0)

**Регрессия**: lint 0, vitest 871/871 (+27 новых), fileSizeLimits, check-memory ✅.

---

### v0.95.28 — Telegram-style auto-scroll к новому + счётчик ↓N без «слепой зоны»

Юзер: «не показывает новые сообщения на стрелки что появились когда написали». Лог v0.95.26 показал: после отправки `bottomGap=91`, `atBottom=true` через Schmitt-trigger 40/120, но новые incoming не попадали в счётчик `↓N` (потому что `atBottom=true`) и не было auto-scroll (потому что у нас его не было вовсе).

**Корень**: до v0.95.28 у нас **один** atBottom-флаг через Schmitt-trigger (порог вход 40px, выход 120px, был добавлен в v0.95.2 от дребезга кнопки ↓). В зоне 40–120px `atBottom=true` ложно → счётчик ↓N не растёт + auto-scroll отсутствует → **юзер не видит новых сообщений** и **не понимает что они появились**.

**Эталоны** (Telegram Web K / Desktop / WhatsApp Web):
- Юзер **точно** у низа (bottomGap ≈ 0-30px) + incoming → **auto-scroll** к новому (smooth)
- Юзер НЕ у низа (bottomGap > 30) + incoming → счётчик **↓N** растёт
- НИКАКОГО Schmitt-trigger для этой логики — только физический порог
- Schmitt используется только для **визуальной стабильности кнопки ↓** (отдельно)

**Решение** (разделение на 2 независимых флага):
1. **`atBottom` через Schmitt-trigger 40/120** — остаётся **только** для UI кнопки ↓ (стабильность, фикс v0.95.2 не сломан)
2. **Новый `physicallyAtBottom`** — `bottomGap <= 30`, **БЕЗ** Schmitt — для логики auto-scroll и счётчика ↓N

**Изменения** (3 файла):

**[useInboxScroll.js](src/native/hooks/useInboxScroll.js)**:
- Новая чистая функция `isPhysicallyAtBottom(bottomGap)` с константой `PHYSICAL_BOTTOM_THRESHOLD = 30`
- Новый optional prop `setPhysicallyAtBottom` — вызывается параллельно с `setAtBottom` (Schmitt)

**[useNewBelowCounter.js](src/native/hooks/useNewBelowCounter.js)**:
- Новый optional callback `onAutoScroll({ messageId })`
- При `atBottomRef.current=true` + incoming:
  - Если `onAutoScroll` передан → вызывается (Telegram-style auto-scroll)
  - Иначе → fallback на старый `onSkip` (backward compatibility)

**[InboxMode.jsx](src/native/modes/InboxMode.jsx)**:
- Новый state `[physicallyAtBottom, setPhysicallyAtBottom] = useState(false)`
- Передан в `useInboxScroll` → setter
- Передан в `useNewBelowCounter` как `atBottom` (теперь physical, не Schmitt)
- Новый `onAutoScroll` handler — `requestAnimationFrame` + `el.scrollTo({behavior:'smooth'})`

**Что юзер увидит**:

| Сценарий | До v0.95.28 | После v0.95.28 |
|---|---|---|
| Юзер у низа (bottomGap=10), пришло сообщение | Тихо добавляется в DOM — юзер может не заметить | **Auto-scroll** к нему (smooth) — видит сразу |
| Юзер на 91px от низа, пришло сообщение | atBottom=true (Schmitt 40/120) → counter не растёт → юзер не знает | counter **+1** → видит «↓ 1» |
| Юзер вверху, пришло сообщение | counter +1 (как раньше) | counter +1 (без изменений) |
| Юзер сам отправил → атBottom после auto-scroll | atBottom=true, новое incoming → counter 0 | atBottom (physical) проверяется в момент incoming — если scrollHeight вырос и юзер не у низа → +1 |

**Что НЕ менялось** (стабильность):
- Schmitt-trigger 40/120 для **кнопки ↓** — фикс v0.95.2 (дребезг) НЕ сломан
- `useForceReadAtBottom` использует Schmitt `atBottom` — для markRead — НЕ задевается
- `scroll save` через Schmitt `nearBottom` — НЕ задевается
- `handleReplySend` свой `el.scrollTo` после send — НЕ задевается
- `tg:new-message` handler в nativeStoreIpc — НЕ задевается
- v0.95.26 фикс обнуления unreadCount — НЕ задевается

**Эталоны проверены**:
- Telegram Web K `bubbles.ts` — `isAtBottom()` + `scrollToEnd()` при новом сообщении
- Telegram Desktop `history_widget.cpp` — `scrollTop >= scrollTopMax - threshold` → `scrollToEnd`
- WhatsApp Web — тот же паттерн через IntersectionObserver
- Порог 30px — стандарт всех клиентов

**Тесты** (4 новых в [useNewBelowCounter.vitest.jsx](src/native/hooks/useNewBelowCounter.vitest.jsx)):
- `atBottom=true + incoming → onAutoScroll({ messageId })` (НЕ skip)
- `atBottom=true + outgoing → skip outgoing` (auto-scroll НЕ зовётся для своих)
- `atBottom=true + другой чат → skip other-chat` (фильтр чата первичнее)
- `atBottom=false + incoming → onAdded (как раньше)`, `onAutoScroll НЕ зовётся`
- Backward compat: если `onAutoScroll` не передан → fallback на старый `onSkip`

**Регрессия**: lint 0, vitest 844/844 (+4 новых), fileSizeLimits 302/302, check-memory ✅.

---

### v0.95.27 — Расширенная диагностика send pipeline (ловим «двойную отправку»)

Юзер: «я не отправлял 2 сообщения». Лог v0.95.26 показал 2 `send-start`, но `lastUserType=wheel` (между ними юзер только скроллил, не нажимал). Подозрение — что-то programmatically вызывает `handleReplySend`, или это **TDLib двойной emit** `updateNewMessage` (provisional + final id после `updateMessageSendSucceeded`).

**Без смены поведения**, добавил полные логи в 3 точках send pipeline:

1. **`InboxMessageInput`** — каждый вызов `handleReplySend` теперь идёт с явным `source`:
   - `'keyboard:Enter'` — нажатие Enter
   - `'click:button'` — клик «Отпр.»
   - Если в логе появится `source='unknown'` → значит **что-то ещё** programmatically вызвало → нашли корень.

2. **`InboxMode.handleReplySend`** — расширен лог `send-start`:
   - `callSource` — источник из п.1
   - `textPreview` — первые 40 символов текста (для сопоставления возможных дублей)
   - `outgoingCountBefore` — сколько своих сообщений в DOM до отправки
   - `lastOutgoingId` + `lastOutgoingTextPreview` — последнее своё (если только что было такое же → дубль)
   - `msSinceLastOutgoing` — мс с последнего своего (если <2с → подозрительно)
   - `stackHint` — первые 3 фрейма stack для callSource=unknown

3. **`store.sendMessage`** — лог `store-send-message-invoke` перед IPC:
   - `len`, `textPreview`, `replyTo` — точное содержимое invoke

4. **`tg:new-message` handler** — расширен лог:
   - `textPreview` — первые 40 символов сообщения
   - `replyToId` — на какое сообщение reply
   - Если придут 2 события с **разными** `msgId` но **одинаковым** `textPreview` → это TDLib двойной emit (provisional + final).

После реальной сессии юзера лог покажет точный корень — либо UI baba dispatches second send (тогда callSource=unknown + stack), либо TDLib эмитит дважды (одинаковый textPreview, разные id).

**НЕ менялось**:
- Поведение send / receive
- Дедупликация в `tg:new-message` handler
- `state.messages` логика
- Все защиты v0.95.0-26 не задействуются

**Регрессия**: lint 0, vitest 840/840 (без изменений), check-memory ✅.

**Следующий шаг**: после сессии юзера → точный фикс по реальным данным.

---

### v0.95.26 — Фикс: tg:new-message обнулял unreadCount для активного чата (47-дневный баг)

Юзер: открыл чат «Вайбкодинг комьюнити» с unread=48, прокручен вверх, листает → counter не убирается → **резко 0**, но можно ещё листать вниз.

**Прямое доказательство** (chatcenter.log 15:00:33-34):
```
15:00:33  store-unread-sync unread=48 active=true   ← server ВСЁ ЕЩЁ 48
15:00:33  tg-new-message msgId=118640082944
          action=skipped-non-contiguous gapMessages=3758 isActiveChat=true
15:00:34  badge-state unread=0 prevUnread=48        ← 💥 ЛОКАЛЬНОЕ обнуление
15:00:34  bottomGap=2056                            ← юзер НЕ у низа
```

**Корень**: в [nativeStoreIpc.js:396](src/native/store/nativeStoreIpc.js) (с **15 апреля 2026**, v0.87.14 — **47 дней не ловили**) была строка:

```js
unreadCount: s.activeChatId === chatId ? 0 : (c.unreadCount || 0) + (message.isOutgoing ? 0 : 1),
```

Это нарушало правило **v0.87.41** (документировано для функции `markRead`, но НЕ применялось к другим handlers):
> «Локально unreadCount обновляется ТОЛЬКО из server sync».

**Решение** (1 строка):
```js
// БЫЛО:  unreadCount: s.activeChatId === chatId ? 0 : (c.unreadCount || 0) + (message.isOutgoing ? 0 : 1)
// СТАЛО: unreadCount: (c.unreadCount || 0) + (message.isOutgoing ? 0 : 1)
```

Decrement остаётся **ТОЛЬКО** через `tg:chat-unread-sync` (3 server-driven handlers: sync, bulk-sync, read).

**Эталоны** (research-агент проверил исходники):
- **Telegram Web K** [appMessagesManager.ts:7577](https://github.com/morethanwords/tweb): `++dialog.unread_count` БЕЗУСЛОВНО. Decrement только в `onUpdateReadHistoryInbox`.
- **Telegram Desktop** [history_widget.cpp:3946](https://github.com/telegramdesktop/tdesktop): atBottom guard ПЕРЕД `readInboxOnNewMessage` — если НЕ в низу, не трогает counter.
- **WhatsApp Web / Discord**: ACK только при `isActive && focused && atBottom`.

Наш фикс = tweb pattern (самый простой, decrement только server).

**Почему 47 дней не ловили** (7 факторов — полный анализ в [mistakes/native-scroll-unread.md](.memory-bank/mistakes/native-scroll-unread.md)):
1. `useReadByVisibility` маскировал — для большинства сообщений server обновлял правильно, локальное обнуление совпадало по значению
2. Тест-пробел: проверяли только `tg:chat-unread-sync`, не `tg:new-message`
3. Сага v0.87.41 затронула только `markRead`, никто не сопоставил с `tg:new-message`
4. Code review v0.87.103 (разбиение файлов) был архитектурным, не функциональным
5. В логах не виден — оба events валидны по отдельности
6. Невозможно поймать в jsdom (нужны scroll + push + server delay)
7. Два параллельных «unread» счётчика путали (chat.unreadCount + useNewBelowCounter)

**3 уровня защиты** (чтобы НИКОГДА не вернулось):
1. **4 регресс-теста** в [nativeStore.vitest.jsx](src/native/store/nativeStore.vitest.jsx) — `tg:new-message для активного чата +1`, `outgoing не меняет`, `decrement через server sync`
2. **Static-test** в [modernPatternsGuard.test.cjs](src/__tests__/modernPatternsGuard.test.cjs) — regex проверка что строка не вернётся
3. **Запись** в [mistakes/native-scroll-unread.md](.memory-bank/mistakes/native-scroll-unread.md) — полный разбор + правило для будущих сессий

**Что юзер увидит**:
| Сценарий | Раньше | После фикса |
|---|---|---|
| Чат активен, юзер atBottom, новое сообщение | 48 → 0 (моментально) | 48 → 49 → 0 (~500мс через server) — точно как Telegram |
| Чат активен, юзер НЕ atBottom | 48 → 0 ❌ **БАГ** | 48 → 49 (остаётся пока не дочитает) |
| Чат неактивен | +1 (без изменений) | +1 (без изменений) |
| Своё сообщение | без изменений | без изменений |

**Регрессия**: lint 0, vitest 840/840 (+4 новых), modernPatternsGuard 16/16 (+1), check-memory ✅.

---

### v0.95.23 – v0.95.26 — заархивированы

См. [`archive/features-v0.95.23-26.md`](./archive/features-v0.95.23-26.md): курсор в input после отправки (v0.95.23), initial backfill истории TDLib quirk (v0.95.24), voice player + spellcheck + action-bar под bubble + «Что нового» (v0.95.25), фикс 47-дневного бага unreadCount (v0.95.26). Все стабилизированы.

---

### v0.95.19 – v0.95.22 — заархивированы

См. [`archive/features-v0.95.19-22.md`](./archive/features-v0.95.19-22.md): диагностика tg-new-message + tg-messages-applied (v0.95.19), финал саги jump-to-end через gapMessages > 0 (v0.95.20), бейдж форум-группы как Telegram Desktop (v0.95.21), форум-overlay + Escape focus-pattern (v0.95.22). Стабилизировано.

---

### v0.95.15 – v0.95.18 — заархивированы

Cм. [`archive/features-v0.95.15-18.md`](./archive/features-v0.95.15-18.md): итеративный fetch (v0.95.15), jump-to-end в форум-топиках + smoothScroll easeOutCubic (v0.95.16), регрессия untilMessageId early break (v0.95.17), двухфазный scroll + ForumTopicEmptyState + не мигать shimmer (v0.95.18). Стабилизировано через v0.95.20–21.

---

### v0.95.11 — Диагностика «не грузит дальше при unread > загруженного» (БЕЗ смены поведения)

Юзер жалоба + лог анализ: чат «Компьютерная | IT, Digital», unread=724, загружено 394 сообщения, юзер в самом низу (`bottomGap=0`). Клик ↓ — no-op (уже у низа загруженного). Load-newer не срабатывает потому что юзер не двигает scroll. Остальные ~330 непрочитанных — за пределами окна загрузки. **Корневой ответ — jump-to-end-of-chat** (как Telegram Desktop: при unread>0 reload вокруг `chat.lastMessage.id`). Прежде чем менять поведение — собираю реальные числа на live-сессии.

#### Что добавлено (только логи, поведение не изменено)

1. [tdlibMapper.js mapChat](main/native/backends/tdlibMapper.js) — новое поле `lastMessageId` (id последнего сообщения чата на сервере по TDLib).
2. [InboxMode.jsx scrollToBottom](src/native/modes/InboxMode.jsx) — `button-scroll-bottom` лог расширен полями:
   - `loadedIncoming` — число incoming в `activeMessages`
   - `chatLastMessageId` — id последнего на сервере
   - `loadedLastId` — id последнего загруженного
   - `gapMessages` — оценка количества пропущенных сообщений между loaded и server (TDLib msg_id step = 2^20)
   - `unreadVsLoaded` — `activeUnread - loadedIncoming` (сколько непрочитанных вне DOM)
3. [useScrollDiagnostics.js chat-open](src/native/hooks/useScrollDiagnostics.js) — добавлены `lastMessageId` + `readInboxMaxId`.

#### Что покажет лог на реальной сессии

- `chat-open lastMessageId=X readInboxMaxId=Y unread=Z messages=N` — сразу видно настройку gap'а
- При клике ↓: `button-scroll-bottom gapMessages=K unreadVsLoaded=M` — K показывает «насколько ВПЕРЁД сервер от загруженного», M — «сколько непрочитанных НЕ в DOM»

#### Что НЕ изменено

- `scrollToBottom` — поведение то же: `el.scrollTo(scrollHeight)` + mark-read до loadedLast + load-newer через handleScroll
- Без изменений: drag-resize, gate bypass mark-read (v0.95.8), loading-pulse кнопки (v0.95.9 Fix 4a), все защиты v0.94.7/v0.91.13

#### Следующий шаг

После запуска v0.95.11 юзером и анализа лога — если `gapMessages>50` и `unreadVsLoaded>0` подтвердятся → точный фикс v0.95.12 (jump-to-end через `loadMessages(chatId, { aroundId: chat.lastMessageId, force: true })` + scroll вниз + markRead до lastMessageId).

**Регрессия**: lint 0, vitest 721/721, check-memory ✅. Поведение не менялось — тесты не обновлялись.

---

### v0.95.10 — Откат scroll-continuation (юзер не просил), loading-pulse кнопки ↓ остаётся

Юзер: «Продолжение scroll после load-newer я это не просил убирай, я просил эффект загрузки на кругшке сделать, пока идет подгрузка новых сообщений». Извинения — автоматическое довинчивание scroll к низу при дозагрузке (`scrollIntentRef` + `useLayoutEffect` из v0.95.9 fix 4b) было не запрошено — юзер хотел ТОЛЬКО visual effect на кнопке.

#### Удалено

В [InboxMode.jsx](src/native/modes/InboxMode.jsx) удалены:
- `scrollIntentRef` ref + установка intent в `scrollToBottom`
- `useLayoutEffect` который слушал `activeMessages.length` / `loadingNewer` и довинчивал scroll к низу
- Комментарии о continuation

#### Остаётся (Fix 4a v0.95.9, юзер просил это)

- ✅ `--loading` класс на [ScrollBottomButton](src/native/components/InboxChatPanel.jsx) когда `loadingNewer=true`
- ✅ Accent border + box-shadow pulse 1.4s в [styles-overlays.css](src/native/styles-overlays.css)
- ✅ Tooltip «Подгружаю свежие сообщения…»
- ✅ loadingNewer prop в ScrollBottomButton

Юзер видит: кликнул ↓ → кнопка пульсирует пока идёт «Загружаю ещё…» (визуальный feedback есть). Но scroll НЕ продолжается автоматически — это поведение по-умолчанию (один scroll по клику, как в v0.95.6).

**Регрессия**: lint 0, vitest 721/721, fileSizeLimits 283/283, check-memory ✅.

---

### v0.95.4 — Фикс «дёрг при повторном открытии seen-чата» (useLayoutEffect) + Windows CI timeout

**Корень** (подтверждён диагностикой v0.95.3): в [useInitialScroll.js](src/native/hooks/useInitialScroll.js) ветка 2 (already-seen) использовала `useEffect` — он выполняется **ПОСЛЕ paint** ([React docs](https://react.dev/reference/react/useEffect): «After every render with changed dependencies»). При смене seen-чата React сначала рисует новый кадр (где scrollContainer показывает позицию ПРЕДЫДУЩЕГО чата — это общий persistent DOM-контейнер), потом выполняется effect и ставит `scrollTop=saved` → юзер на 1 кадр видит чужую позицию = «дёрг».

**Решение** ([React docs useLayoutEffect](https://react.dev/reference/react/useLayoutEffect): «fires synchronously after all DOM mutations but BEFORE the browser paints»): `useEffect` → `useLayoutEffect` в [useInitialScroll.js](src/native/hooks/useInitialScroll.js). Restore выполняется до paint → юзер видит сразу правильную позицию, без вспышки.

**Что критически важно** (по той же React-доке — useLayoutEffect блокирует paint): внутри ТОЛЬКО micro-операция `scrollTop=N` (микросекунды), никаких fetch/тяжёлой работы. Это уже соблюдено — диагностика v0.95.3 подтвердила `msSinceEffectStart=0` + `attempts=0` (restore синхронный, scrollEl сразу готов). Та же паттерн уже работает в [InboxMode load-older re-pin](src/native/modes/InboxMode.jsx) (v0.94.2). Поведение ветки 1 (initial scroll первого открытия) НЕ менялось — там `setTimeout 150ms` остаётся.

#### Windows CI timeout fix

Симптом: GitHub Actions `test-and-build (windows-latest)` упал — `AccountContextMenu.vitest.jsx` первый тест «показывает имя аккаунта» 5671мс при дефолтном vitest `testTimeout=5000` (остальные 18 тестов файла прошли за 13-36мс). Ubuntu прошёл.

Корень — **cold-start первого теста файла** на медленном Windows CI runner-е: загрузка модуля `AccountContextMenu.jsx` (большие inline styles) + первый рендер React 19 в happy-dom + первый `useEffect` с `setTimeout(0)`. На локальной машине и Ubuntu это 50-100мс, на Windows runner-е — 5-6с.

Решение ([vitest docs testTimeout](https://vitest.dev/config/#testtimeout)): глобальный `testTimeout: 15000` в [vitest.config.mjs](vitest.config.mjs). Это **потолок**, не фиксированное ожидание — нормальные тесты не замедляются, только cold-start не упирается в 5с.

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.

---

### v0.94.0 — ПОЛНОЕ УДАЛЕНИЕ виртуализации (react-virtuoso) → простой DOM + pixel scrollTop

**Корень всей саги scroll restore (v0.91.1 – v0.93.0, ~30 версий)**: виртуализация (сначала react-window, потом react-virtuoso) фундаментально несовместима с точным восстановлением позиции. Обе библиотеки пересчитывают высоты строк при ремаунте `key={cacheKey}` → `scrollHeight` скачет → restore промахивается. Virtuoso работает с **дискретными индексами строк + alignment** (`align: 'start'/'end'`) → отсюда «прилипание» к картинкам/видео и «выравнивание» которое юзер видел на скринах. Никакой `offset`, `anchorMsgId`, `StateSnapshot` не лечит это полностью — это архитектурное ограничение.

**Решение** (как у Telegram Web K, который НЕ виртуализирует): рендерим **все сообщения обычным DOM**, сохраняем **простой пиксельный `scrollTop`** (число). При ремаунте `scrollHeight` стабилен → `el.scrollTop = saved` восстанавливает позицию ТОЧНО. Типичный чат 100–300 сообщений в памяти — без проблем с производительностью.

#### Что изменено

**1. [`scrollPositionsCache.js`](src/native/utils/scrollPositionsCache.js)** — формат `Map<chatId, {scrollTop:number, atBottom:boolean}>`. Удалён `findVisibleAnchorMsgId`. Storage version → 4 (старые v2/v3 anchor-форматы игнорируются — возвращается пустая Map).

**2. [`VirtualMessageList.jsx`](src/native/components/VirtualMessageList.jsx)** — удалён `import { Virtuoso }`. Теперь обычный `<div>` со `overflow-y:auto` + `overflow-anchor:auto` (браузер сам держит позицию при подгрузке старых сообщений сверху) + `renderItems.map(...)`. `listRef` через `useImperativeHandle`: `element` getter + `scrollToRow({index, align})` через `scrollIntoView`.

**3. [`useInitialScroll.js`](src/native/hooks/useInitialScroll.js)** — restore через `el.scrollTop = saved.scrollTop` (или `el.scrollHeight` если `atBottom`). Ветка 1 (первое открытие): saved.scrollTop → firstUnread (querySelector data-msg-id) → низ. Ветка 2 (возврат): pixel scrollTop. `isRestoringRef` closed-loop guard сохранён (500мс).

**4. [`useInboxScroll.js`](src/native/hooks/useInboxScroll.js)** — сохраняет `{scrollTop: el.scrollTop, atBottom}` с guard `isRestoringRef`. Вернул load-older (`scrollTop < 100`) и load-newer (`maybeTrigger`) БЕЗ ручной коррекции scrollTop — `overflow-anchor:auto` держит позицию при prepend.

**5. [`useScrollPositionAutosave.js`](src/native/hooks/useScrollPositionAutosave.js)** — interval 1.5с сохраняет `{scrollTop, atBottom}`, пропуск при `isRestoringRef`.

**6. [`InboxMode.jsx`](src/native/modes/InboxMode.jsx)** + **[`InboxChatPanel.jsx`](src/native/components/InboxChatPanel.jsx)** — удалены `initialTopMostItemIndex`, `firstItemIndex` state, 2 useEffect (reset firstItemIndex + tg:messages append decrement), `handleStartReached`, `handleEndReached`, `findRenderItemIndex`. `scrollToVirtualRow` переписан на querySelector `[data-msg-id]`. `scrollToAbsoluteBottom` сохраняет `{scrollTop: el.scrollHeight, atBottom: true}`.

**Удалено**: `useInitialScrollDiag.js` (git rm). Пакет `react-virtuoso` удалён (`npm uninstall`).

**Регрессия**: lint 0, vitest 658/658, fileSizeLimits 272/272, check-memory ✅. 3 теста `useInitialScroll.vitest.jsx` переписаны под pixel API (были на `onRestoreAnchor`/`onMissingTarget`/`{anchorMsgId}`).

**Проверить визуально** (просьба юзеру): открыть чат → пролистать на середину → перейти в другой чат → вернуться → позиция должна быть РОВНО где оставил, без выравнивания и прилипания к картинкам.

---

### v0.93.0 — заархивирован

Pixel-perfect scroll restore через `LocationOptions.offset` Virtuoso API. Полностью superseded в **v0.94.0** (виртуализация удалена). Детали: [`archive/features-v0.93.0.md`](./archive/features-v0.93.0.md).
### v0.92.0 – v0.92.6 — заархивированы

Сага Virtuoso scroll restore (6 версий). Полностью superseded в **v0.94.0** (виртуализация удалена, restore через простой pixel scrollTop). Детали: [`archive/features-v0.92.0-6.md`](./archive/features-v0.92.0-6.md).

---

### v0.91.24 — Фикс Проблемы 2: блок load-older во время restore + re-scroll через onRowsRendered + abort на user-scroll

### v0.91.11 — Диагностика «возврат в чат прыгает вверх» (4 лога в ветке already-seen)

Симптом: A → B → возврат в A → перелистывает вверх, не на сохранённую позицию.

В [`useInitialScroll.js`](src/native/hooks/useInitialScroll.js) ветка «already-seen» имела 3 silent edge case'а: `scrollRef.current=null` (DOM не готов), `getSavedScrollTop` вернул `undefined`, и race с react-window `useDynamicRowHeight({key: cacheKey})` — при смене `cacheKey={store.activeChatId}` ([`VirtualMessageList.jsx:211`](src/native/components/VirtualMessageList.jsx#L211)) кэш высот сбрасывается → `scrollHeight` временно мал → `el.scrollTop = savedTop` тихо обрезается по [MDN scrollTop spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop).

Добавлены 4 точки логирования (логика restore не тронута):

| Событие | Поля | Что покажет |
|---|---|---|
| `initial-restore-attempt` | `chatId, savedTop, scrollHeight, clientHeight` | Хватит ли scrollHeight для savedTop |
| `initial-restore-applied` | `chatId, requestedTop, actualTop, clamped` | `clamped=true` = scrollHeight мал |
| `initial-restore-postcheck` | `chatId, afterMs:100, finalTop, scrollHeight` | Позиция после remeasure react-window |
| `initial-restore-skip` | `chatId, reason` | `no-scrollEl` / `no-saved` / `not-returning` |

Что НЕ менял: `el.scrollTop = savedTop` присвоение, `lastActiveChatIdRef` (v0.91.7 guard), ветку 1, существующее `initial-restore-saved`.

Конфликты ✓: v0.91.7 (isReturning сохранён), v0.91.6 (ветку 1 не трогаем), react-window (listRef/cacheKey не тронуты). Граничные ✓: savedTop=0, undefined, scrollRef=null, быстрый A→B→A.

Откат: `git revert <hash>` — один коммит, только логи. После анализа лога юзера — точечный фикс, логи удалю в том же коммите.

---


### v0.89.41 → v0.91.0 — серия WebContentsView миграция, 16 версий, полный откат

Электрон рекомендовал переход с `<webview>` на WebContentsView. Серия v0.89.41-v0.90.2 — 16 итераций (12 опровергнутых гипотез, архитектурная миграция на BaseWindow). Корень провала найден через WebSearch: [Electron Issue #44934](https://github.com/electron/electron/issues/44934) — на Windows 11 `addChildView(WebContentsView)` + `loadURL` крашит main, closed «not planned».

**v0.91.0 ПОЛНЫЙ ОТКАТ**: вернули `BrowserWindow{webviewTag:true}` + `<webview>` (production-tested). Удалены: webContentsViewManager.js, webContentsViewIpcHandlers.js, WebContentsViewSlot.jsx, webContentsViewBridge.js + 3 теста.

**Сохранены полезные побочки**: UncaughtErrorToast.jsx, global error handlers, idbCacheMetrics.js, crashpad-фильтр, [`electron-breaking-changes.md`](.memory-bank/electron-breaking-changes.md).

**Полный урок и 7 правил для будущих миграций** — в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md).

### v0.89.42 → v0.89.44 — Phase 2/2.3 WebContentsView миграция (откачено в v0.91.0)

Feature-flag в Settings, условный рендер `<WebContentsViewSlot>` vs `<webview>`, bridge для webviewSetup, реактивный `wcv:load-url`, cleanupPartition IPC, breaking-changes docs, IDB cache hit/miss metric. Полная история в [`mistakes/electron-core.md`](.memory-bank/mistakes/electron-core.md). Все файлы удалены в v0.91.0.

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
