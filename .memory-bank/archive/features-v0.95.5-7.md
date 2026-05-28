# Архив: changelog v0.95.5 – v0.95.7

Вынесено 28 мая 2026 при v0.95.12 для уменьшения features.md под лимит 100 КБ. v0.95.5 (sticky pinned overlay), v0.95.6 (кнопка ↓ Telegram-style + instant/smooth), v0.95.7 (drag-to-resize разделителя chat-list). Все стабилизированы.

---

### v0.95.7 — Drag-to-resize разделителя chat-list ↔ окно чата (Telegram Desktop-style)

Запрос юзера: «надо чтобы я мог двигать разделитель окна чатов и окна диалога». Стандартная фича — Telegram Desktop / VS Code / Discord / Slack.

#### Что сделано

Новый хук [useChatListResize.js](src/native/hooks/useChatListResize.js) (~85 строк) — эталон [useAIPanelResize](src/hooks/useAIPanelResize.js):
- **Pointer Events API + setPointerCapture** (W3C 2018, [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events))
- Direct DOM mutation на `style.width` во время drag — НЕТ re-render React'а на каждый pointermove → 60fps
- setState + settings:save только на pointerup (финальная фиксация)
- Clamp [60, 600] через `clampChatListWidth(w)`
- Default 340px (как было)
- Compact threshold < 200px через `isChatListCompact(w)`

Новый компонент [ChatListResizeHandle.jsx](src/native/components/ChatListResizeHandle.jsx) (~30 строк):
- 6px divider между chat-list и окном чата
- `cursor: col-resize` + accent-подсветка hover (`#2AABEE66`) / active (`#2AABEE88`)
- `onDoubleClick` → reset к default 340px (стандарт VS Code, Slack)
- `aria-label` + `title` для accessibility
- `touchAction: 'none'` (стандарт Pointer Events для touch/pen)

[ChatListItem.jsx](src/native/components/ChatListItem.jsx) — режим compact (когда width < 200):
- Скрыт текст: название / превью / микро-строка аккаунта
- Аватар уменьшен 53px → 44px
- Бейдж непрочитанных — **абсолютным позиционированием в правом верхнем углу аватарки** (как Telegram Desktop two-column mode)
- Tooltip `title={chat.title + lastMessage}` на hover — юзер не теряет инфо
- 🔕 значок mute сохранён

[InboxChatListSidebar.jsx](src/native/components/InboxChatListSidebar.jsx):
- Принимает props `width`, `compact`, `panelRef`
- Поле поиска **скрыто в compact mode** (нет места для input)
- Compact пробрасывается через rowProps в ChatRow → ChatListItem
- Применено к ОБЕИМ панелям (chat list + forum topic panel)

[InboxMode.jsx](src/native/modes/InboxMode.jsx):
- 7 useRef/useState для drag state + settings
- `useEffect` — загрузка `settings.chatListWidth` из IPC `settings:get` при mount
- Хук `useChatListResize` + render `<ChatListResizeHandle />` справа от sidebar
- Глобальный `data-cc-chat-list-resize-overlay` (z:999998) во время drag — pointerup не застрянет в дочерних webview

#### Конфликты — все проверены ✅

- ✅ **`useAIPanelResize`** (правый край AI panel) — мой drag **левый** край, разные оси, не пересекаются
- ✅ **`overflow-anchor: none`** (v0.94.2) — меняется ширина контейнера, не scroll position
- ✅ **`MessageListOverlay` shimmer** — внутри scroll-wrapper'а, не пересекается с handle
- ✅ **Кнопка ↓** z-index:5 — тоже внутри scroll-wrapper'а
- ✅ **Pinned overlay** z-index:4 (v0.95.5) — то же
- ✅ **react-window List** — пересчитает row positions при resize контейнера (норма)
- ✅ **AI panel ref** в App.jsx — мой `chatListPanelRef` отдельный, нет конфликта

#### Тесты — 15 unit-тестов

[useChatListResize.vitest.jsx](src/native/hooks/useChatListResize.vitest.jsx):
- `clampChatListWidth` границы [60, 600] + NaN fallback + экстремумы (5 тестов)
- `isChatListCompact` порог 200 + NaN safe default (3 теста)
- `startResize`: refs + cursor + setPointerCapture + preventDefault
- `onPointerMove`: ref + style.width напрямую, БЕЗ setState (60fps контракт)
- `onPointerMove`: clamp до MAX/MIN
- `onPointerUp`: setState + settings:save с сохранением other-props + releasePointerCapture
- `resetToDefault`: 340 + settings:save
- Guards: onPointerMove/Up до startResize → no-op

#### UX-улучшения (5 шт. реализованы по запросу юзера)

⭐⭐⭐⭐⭐ **Двойной клик** на handle → reset 340px (`onDoubleClick={resetChatListWidth}`)
⭐⭐⭐⭐ **Auto-compact при width < 200px** (`isChatListCompact`)
⭐⭐⭐⭐ **Подсветка handle на hover** — accent `#2AABEE66` (transition 0.15s)
⭐⭐⭐ **Сохранение в settings.json** — через IPC `settings:save`, ключ `chatListWidth`
⭐⭐⭐ **Активное состояние при drag** — `#2AABEE88` + `data-cc-chat-list-resize-overlay` (cursor: col-resize на всём окне)

#### Эталоны (3 факта)

🥇 [MDN Pointer Events + setPointerCapture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) — W3C-стандарт 2018, заменил mouse events для dragging
🥇 [Telegram Desktop](https://github.com/telegramdesktop/tdesktop) — drag handle + two-column mode (compact на узких ширинах)
🥈 [Наш useAIPanelResize.js](src/hooks/useAIPanelResize.js) — production-tested паттерн drag-resize в проекте, мой хук следует ровно ему

**Регрессия**: lint 0, vitest 711/711 (+15 новых), fileSizeLimits 281/281 (+2 новых файла), check-memory ✅.

---

### v0.95.6 — Кнопка ↓ работает как в Telegram Desktop (всегда в самый низ + instant/smooth)

Симптом (юзер, скрин чата PlayMods.net, 619 непрочитанных): клик по ↓ ведёт **не в низ**, а к старому первому-непрочитанному, которое юзер давно пролистал. Чтобы попасть в самый низ — нужен второй клик. Раздражает.

#### Корень (доказан кодом)

[InboxMode.jsx scrollToBottom (старый)](src/native/modes/InboxMode.jsx) — ветка `if (firstUnread) → к нему в block:'center'`. `firstUnreadIdRef.current` рассчитывался через [`frozenReadCursorRef`](src/native/modes/InboxMode.jsx#L354-L366) — snapshot позиции readInboxMaxId в момент **открытия чата** (специально не обновляется чтобы divider «НОВЫЕ СООБЩЕНИЯ» не дрожал, v0.89.33). Тот же ref **ошибочно** использовался для navigation target кнопки ↓ → юзер видит уже прочитанное.

#### Эталон Telegram (3 факта)

🥇 [Telegram Desktop bug c/5792](https://bugs.telegram.org/c/5792): кнопка ↓ ведёт **в самый низ**. Second-tap возвращает к origin только если был tap по internal link (у нас этой фичи нет → удаляем double-click).

🥇 [MDN ScrollToOptions](https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions): `behavior: 'instant'` — Baseline Widely Available с 2015, Chrome/Edge/Electron Chromium. Мгновенный jump в один кадр.

🥈 Наш [`useReadByVisibility`](src/native/hooks/useReadByVisibility.js) с `rootMargin: '-48% 0px -48% 0px'` — mark-read срабатывает в центре viewport. При `instant` jump промежуточные сообщения не становятся видимы → нужна явная `markReadCurrentView(viewKey, lastId)` после прокрутки. Эта логика уже была в старом `scrollToAbsoluteBottom` — перенесена в новый объединённый `scrollToBottom`.

#### Решение (одна функция, Telegram-style)

Новый [`computeScrollBehavior(deltaPx, clientHeight)`](src/native/utils/scrollBehavior.js) — чистая функция: `> 5 × viewport` → `'instant'`, иначе `'smooth'`. Подобран по UX-тесту: 4 экрана smooth ≈ 1.5 сек (приятно), 50000px (619 непрочитанных) → instant (нет 5-10сек анимации с просадкой Chromium).

В [InboxMode.jsx](src/native/modes/InboxMode.jsx):
- Удалена ветка `if (firstUnread)` — навигация **всегда в самый низ**
- Объединены `scrollToBottom` + `scrollToAbsoluteBottom` → один `scrollToBottom`
- Удалены: `handleScrollButtonClick`, `handleScrollButtonDoubleClick`, `scrollButtonClickTimerRef` (220мс double-click timer)
- `behavior` динамический через `computeScrollBehavior(deltaPx, clientHeight)`
- markRead до lastMessageId сохранён → счётчик 619→0 сразу при клике

В [InboxChatPanel.jsx](src/native/components/InboxChatPanel.jsx):
- Удалён `onDoubleClick` handler
- Tooltip: `«К последнему сообщению (619 непрочитано)»` (раньше было «К первому непрочитанному» — теперь некорректно)

`firstUnreadIdRef` **остаётся в коде** — он нужен для [useInitialScroll](src/native/hooks/useInitialScroll.js) (auto-scroll к unread при первом открытии чата) и [groupMessages](src/native/utils/messageGrouping.js) (divider «НОВЫЕ СООБЩЕНИЯ»). Это **разные сценарии** от кнопки ↓.

#### Что юзер увидит

| Сценарий | До (v0.95.5) | После (v0.95.6) |
|---|---|---|
| Клик ↓ с 619 unread | К старому firstUnread в центр (= уже прочитанное) | В самый низ instant + счётчик 619→0 |
| Клик ↓ без unread | В низ smooth | В низ smooth |
| Реакция на клик | Задержка 220мс (double-click timer) | Мгновенно |
| Двойной клик | scrollToAbsoluteBottom | Игнорируется (нет handler'а) |

#### Регрессионная защита

[scrollBehavior.vitest.js](src/native/utils/scrollBehavior.vitest.js) — 11 unit-тестов:
- Малая/средняя/пороговая/большая дельта → корректный behavior
- Реальный сценарий «619 непрочитанных, 50000px от низа» → instant
- Защита от NaN/undefined/clientHeight=0 → smooth fallback

#### Конфликты — все проверены

- ✅ `useInitialScroll` — не затронут (firstUnreadIdRef остаётся для auto-scroll)
- ✅ `groupMessages` divider — не затронут (firstUnreadIdRef остаётся)
- ✅ `useReadByVisibility` IntersectionObserver — markRead до lastId компенсирует промежуточные при instant jump
- ✅ MDN — `behavior: 'instant'` поддержан widely
- ✅ Тесты `useInitialScroll.vitest.jsx` — не затронуты (другой firstUnreadIdRef use-case)
- ✅ Tooltip — обновлён под новое поведение

**Регрессия**: lint 0, vitest 696/696 (+11 новых), fileSizeLimits 278/278 (+1 новый файл), check-memory ✅.

---

### v0.95.5 — Фикс «дёрг в чате с закреплённым сообщением» (sticky overlay)

Симптом (юзер, скрин 28 мая 2026, чат «Вайбкодинг комьюнити»): при открытии чата, где есть закреплённое сообщение, экран дёргается — закреплённое появляется с задержкой и толкает ленту вниз. Это **отдельный от v0.95.4 кейс** (там фиксил scroll restore при возврате в seen-чат).

#### Корень (доказан кодом)

В [InboxMode.jsx:291-299](src/native/modes/InboxMode.jsx#L291-L299) useEffect на смену чата:
```js
setPinnedMsg(null)  // блок убран
store.getPinnedMessage?.(activeChatId).then(r => {
  if (r?.ok && r.message) setPinnedMsg(r.message)  // async через 50-500мс → блок ПОЯВЛЯЕТСЯ
})
```

В [InboxChatPanel.jsx](src/native/components/InboxChatPanel.jsx) pinned-блок был обычным flex-child над лентой (`{pinnedMsg && <div>}`). Backend [getChatPinnedMessage](main/native/backends/tdlibMessages.js#L372-L389) — TDLib RPC ~50-500мс. После ответа `setPinnedMsg(msg)` добавлял блок в DOM-поток → flex container увеличивал offset → сообщения видимо съезжали вниз = «дёрг».

#### Решение (как Telegram Web K, WhatsApp Web)

Новый компонент [`PinnedMessageBar.jsx`](src/native/components/PinnedMessageBar.jsx) — рендерится с `position: absolute; top:0; left:0; right:0; z-index: 4` ПОВЕРХ верха ленты, не в потоке flex. Появление/исчезновение pinned **не сдвигает сообщения** по построению. Накрывает 1 верхнее сообщение когда лента у самого верха — это норма Telegram-клиентов.

Эталон **Telegram Web K** ([_chatPinned.scss](https://github.com/morethanwords/tweb/blob/master/src/scss/partials/_chatPinned.scss)): pinned-container `flex: 0 0 auto` + фиксированная высота через CSS variable + всегда в DOM (но `display: none` после анимации, когда пусто). Их паттерн тоже исключает дёрг — фиксированной высотой. Я выбрал overlay (проще, не требует CSS variables под высоту, не оставляет пустой строки когда у чата нет pinned).

#### Конфликты — все проверены

- ✅ **dragOver overlay** ([line 155](src/native/components/InboxChatPanel.jsx#L155)) z-index:2 — pinned выше (z:4)
- ✅ **Кнопка ↓** z-index:5 + правый нижний угол — pinned ниже, разные координаты
- ✅ **MessageListOverlay** (shimmer при `!chatReady`) — pinned виден только при `chatReady=true`, не наслаивается
- ✅ **`loadingNewer`** indicator (bottom:0) — pinned сверху, не пересекается
- ✅ **`IntersectionObserver` mark-read** ([useReadOnScrollAway.js:48](src/native/hooks/useReadOnScrollAway.js#L48)) `rootMargin: '-48% 0px -48% 0px'` — срабатывает в **центре viewport**, pinned overlay в верхних ~50px НЕ ВЛИЯЕТ на mark-read

#### Дополнительно

`backdrop-filter: blur(8px)` под pinned — сообщения под ним размыты, не проступают резкими краями (как Telegram Desktop, WhatsApp Web).

#### Регрессионная защита

7 unit-тестов в [PinnedMessageBar.vitest.jsx](src/native/components/PinnedMessageBar.vitest.jsx):
1. `pinnedMsg=null` → ничего не рендерит
2. `position: 'absolute'` + top/left/right (главная защита от возврата к flex-child)
3. `z-index: 4` (контракт с dragOver z:2 и кнопкой ↓ z:5)
4. Обрезка текста до 100 символов
5. Fallback `[медиа]` если нет текста
6. Клик ✕ → onClose
7. `backdrop-filter: blur` присутствует

**Регрессия**: lint 0, vitest 685/685 (+7 новых), fileSizeLimits 276/276 (+1 новый файл), check-memory ✅.

---

