### v0.95.25 — Voice player (waveform) + Spellcheck (RU/EN) + Action-bar под bubble + «Что нового»

Большой UX-релиз по запросу юзера:
1. Иконки действий над сообщением исчезали слишком быстро + закрывали имя отправителя
2. Голосовые сообщения не воспроизводились
3. Нет проверки орфографии при наборе
4. + Бонус: уведомление о новых функциях после обновления

#### Часть А — Action-bar (Reply / Forward / Pin) под bubble + 250мс задержка

**Корень**: в [MessageBubble.jsx:89](src/native/components/MessageBubble.jsx) action-bar был `bottom: 'calc(100% + 3px)'` (НАД bubble — закрывал имя отправителя на скрине юзера «Капуста в законе»). `onMouseLeave={() => setMenu(false)}` мгновенно скрывал — между bubble и кнопками gap 3px → курсор переезжая → leave → меню исчезает.

**Решение**: `top: 'calc(100% + 3px)'` (ПОД bubble) + `setTimeout(setMenu(false), 250)` на mouseleave + `onMouseEnter/Leave` на самом баре для cancel/schedule. Стандарт Discord/Slack (250мс) — юзер успевает дотянуться до кнопок.

#### Часть Б — Voice player (Telegram-style с waveform)

**Корень**: backend [tdlibMapperMedia.js](main/native/backends/tdlibMapperMedia.js) маппит `messageVoiceNote → mediaType='voice'` с duration/fileSize, но в [MessageBubble.jsx](src/native/components/MessageBubble.jsx) НЕТ ветки `voice` — голосовые молча игнорировались.

**Решение**:
- В backend добавлен `info.waveform` (TDLib `voice_note.waveform` — base64 байтовая строка с 100 sample'ами по 5 бит каждый).
- Новый чистый util [`voiceWaveform.js`](src/native/utils/voiceWaveform.js) — `decodeWaveform(waveform, targetCount=50)` → массив амплитуд 0..1. Cross-byte 5-bit extraction + resample (downsample группа-усреднение, upsample повторение).
- Новый компонент [`VoicePlayer.jsx`](src/native/components/VoicePlayer.jsx) в стиле Telegram Web K:
  - 50 столбиков waveform высотой = амплитуда × 24px
  - Прогресс закрашивает столбики слева направо (current/duration)
  - Play/Pause + duration mm:ss + кнопка скорости 1x/1.5x/2x
  - Click по waveform → seek в эту точку (audio.currentTime)
  - Lazy download через `downloadMedia` (cc-media:// path) — `<audio>` создаётся только при первом play
- Интеграция в [MessageBubble.jsx](src/native/components/MessageBubble.jsx) `mediaType === 'voice'`.

**Эталоны**: Telegram Web K `tweb/src/components/audio.ts` AudioElement, Telegram Desktop, WhatsApp Web.

#### Часть В — Spellcheck RU + EN с ПКМ-меню

**Корень**: в [windowManager.js:136-143](main/utils/windowManager.js) `webPreferences.spellcheck` НЕ задан → Electron default = `true`, но только английский. ПКМ не показывал варианты.

**Решение** (стандарт [Electron Spellchecker docs](https://www.electronjs.org/docs/latest/tutorial/spellchecker)):
- `webPreferences.spellcheck: true` + `session.setSpellCheckerLanguages(['ru', 'en-US'])` (Hunspell словари встроены в Chromium).
- Новый [`spellcheckHandler.js`](main/handlers/spellcheckHandler.js) — `attachSpellcheckContextMenu({Menu, MenuItem, webContents})`. Обработчик `context-menu` event строит Menu с `params.dictionarySuggestions[]` (max 5) → `replaceMisspelling` + «Добавить в словарь» (`addWordToSpellCheckerDictionary`) + стандартные Copy/Paste/Cut/Select All.
- Интеграция в [windowManager.js](main/utils/windowManager.js) — вызов после создания BrowserWindow.

**Эталоны**: Slack, Discord, VS Code, Notion — все используют этот же API.

#### Часть Г — «Что нового» модалка (бонус)

**Решение**: новые [`utils/changelogData.js`](src/utils/changelogData.js) (данные последних 6 версий простым языком) + [`WhatsNewModal.jsx`](src/components/WhatsNewModal.jsx) (модалка с Esc-закрытием, backdrop blur, gradient header). В [App.jsx](src/App.jsx) — `useEffect(appReady)` → читает `app:info` version, сравнивает с `settings.lastSeenVersion` → показывает модалку → onClose сохраняет version в settings. Стандарт Slack / VS Code / Discord.

#### Тесты — 30 новых

- [voiceWaveform.vitest.js](src/native/utils/voiceWaveform.vitest.js) — 13 тестов decoder (null/empty, Uint8Array, base64, амплитуды 0..1, downsample/upsample, реальный TDLib сценарий)
- [VoicePlayer.vitest.jsx](src/native/components/VoicePlayer.vitest.jsx) — 8 тестов компонента (рендер, переключение скорости 1x→1.5x→2x→1x, click play вызывает downloadMedia, fallback waveform, duration format)
- [changelogData.vitest.js](src/utils/changelogData.vitest.js) — 8 тестов getChangelogSince (первая установка, одна версия назад, несколько, equal, null, DESC sort)
- ВСЕ существующие тесты (807) проходят без изменений

#### Файлы

| Файл | Тип | Описание |
|---|---|---|
| [main/utils/windowManager.js](main/utils/windowManager.js) | M | spellcheck: true + setSpellCheckerLanguages + attach context menu |
| [main/handlers/spellcheckHandler.js](main/handlers/spellcheckHandler.js) | A | новый — context-menu обработчик |
| [main/main.js](main/main.js) | M | пробрасывает Menu/MenuItem в createWindow |
| [main/native/backends/tdlibMapperMedia.js](main/native/backends/tdlibMapperMedia.js) | M | возвращает `info.waveform` для voice |
| [main/native/backends/tdlibMapper.js](main/native/backends/tdlibMapper.js) | M | прокидывает `waveform` в финальный message |
| [src/native/utils/voiceWaveform.js](src/native/utils/voiceWaveform.js) | A | новый — decoder 5-bit waveform |
| [src/native/utils/voiceWaveform.vitest.js](src/native/utils/voiceWaveform.vitest.js) | A | 13 тестов decoder |
| [src/native/components/VoicePlayer.jsx](src/native/components/VoicePlayer.jsx) | A | новый — плеер в стиле Telegram |
| [src/native/components/VoicePlayer.vitest.jsx](src/native/components/VoicePlayer.vitest.jsx) | A | 8 тестов компонента |
| [src/native/components/MessageBubble.jsx](src/native/components/MessageBubble.jsx) | M | action-bar под bubble + 250мс delay + voice интеграция |
| [src/components/WhatsNewModal.jsx](src/components/WhatsNewModal.jsx) | A | новый — модалка changelog |
| [src/utils/changelogData.js](src/utils/changelogData.js) | A | новый — данные changelog |
| [src/utils/changelogData.vitest.js](src/utils/changelogData.vitest.js) | A | 8 тестов |
| [src/App.jsx](src/App.jsx) | M | проверка lastSeenVersion + render модалки |

**Регрессия**: lint 0, vitest +29 новых, fileSizeLimits ✅, check-memory ✅.

---

### v0.95.24 — Initial backfill истории при первом открытии чата (TDLib local cache quirk)

Юзер: «нет истории старых сообщений, мы с ним давно общаемся, они в Telegram есть у нас нет» (скрин чата «Страховая Компания» — видны 3 сообщения, прокрутил вниз страница, разговор с человеком давно).

**Корень** (доказан в логе `chatcenter.log` 17:58:10):
```
[get-msgs] chat=tg_611696632:5006720692 from=0 offset=0 count=3
           first=690255560704 last=690257657856 hasMore=false
```

TDLib **local cache** для давних чатов содержит всего 1-3 cached сообщения. `getChatHistory(from=0, limit=50)` возвращает count=3, `hasMore=false`. История на сервере **есть** (когда юзер прокрутил вверх позже — `count=46` догрузилось), но TDLib **НЕ догружает automatically** при первом invoke.

[TDLib spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html): «**For users with many chats, getChatHistory might not return any messages, if the chat history is not loaded yet**».

Та же quirk что в jump-to-end saga ([issue #740](https://github.com/tdlib/td/issues/740) — ответ levlam): «**number of returned messages is chosen by the library**». Решение знаем — **итеративный fetch**.

**Решение**: новый чистый util [`shouldTriggerInitialBackfill`](src/native/utils/initialBackfillGate.js) — `{got, force, hasOverride, threshold=30} → boolean`. В [nativeStore.loadMessages](src/native/store/nativeStore.js) после первого invoke если результат < 30 → автоматический backfill через `offsetId=oldest_received` (fire-and-forget). До 3 итераций. Каждая итерация вызывает `tg:get-messages` с `offsetId` → IPC handler emit `tg:messages` с `append: true` → prepend в state.messages (тот же путь что load-older через scroll, тестированный годами).

**Защита от циклов**: maxIterations=3, stop на пустом ответе, stop при `nextOldest === cursor` (TDLib stuck), stop при totalNow >= 30.

**НЕ срабатывает при**:
- `force=true` (jump-to-end ветка с loadMessagesUntil)
- `hasOverride=true` (явный aroundId)
- got >= 30 (уже достаточно)
- got=0 (TDLib пустой ответ — backfill тоже вернёт пусто)

**Эталоны** (production messengers 2026):
- Telegram Web K — ProgressivePreloader триггерит догрузку при малом окне
- Telegram Desktop — `_history->loadMessages()` повторяется пока `messagesIsEmpty` или достаточно загружено
- WhatsApp Web — то же через cursor-based pagination
- Discord — backfill через `before=` query param пока scroll окно не заполнено

**Что НЕ менялось**:
- Логика unread окна (`unreadWindowRequestParams`) — для чатов с unread > 0 работает как раньше
- Existing IPC `tg:get-messages` с `offsetId` (он уже эмитит append:true) — НЕ трогаем
- jump-to-end ветка через `loadMessagesUntil` — отдельный путь (v0.95.15-20)
- IDB cache (v0.89.40) — заполняется первым result, backfill не задевает

**Дополнительный лог для прозрачности**:
- `initial-backfill-trigger` (chatId, got, threshold, oldestId)
- `initial-backfill-iter` (chatId, iter, got, totalNow)

После реального теста юзер сразу увидит при открытии давнего чата 30+ сообщений (вместо 3). Пауза 200-500мс пока идёт backfill — приемлемая (юзер уже принял такой UX в jump-to-end v0.95.20: «тупь будет задержка, это не страшно»).

**Тесты**: 14 unit в [initialBackfillGate.vitest.js](src/native/utils/initialBackfillGate.vitest.js) — границы порога (1-29 → true, 30+ → false), edge cases (force/hasOverride/got=0/NaN), реальный сценарий «Страховая Компания» (got=3 → true).

**Регрессия**: lint 0, vitest 807/807 (+14), fileSizeLimits ✅, check-memory ✅.

---

### v0.95.23 — Курсор остаётся в поле ввода после отправки сообщения

Юзер: «когда отправляю сообщения в чат, курсор из поля где сообщения вводит пропадает, неудобно, надо чтобы был в этом поле».

**Корень**: в [InboxMessageInput.jsx](src/native/components/InboxMessageInput.jsx) input имел `disabled={sending || disabled}`. По [HTML5 spec](https://html.spec.whatwg.org/multipage/interaction.html#focus) браузер **снимает фокус** с disabled-элемента. Цепочка: Enter → `setSending(true)` → input становится disabled → браузер убирает фокус → `await sendMessage` ~300мс → `setSending(false)` → input снова enabled, **но фокус никто не возвращает** → юзеру надо снова кликнуть в поле.

**Решение**: убрать `sending` из `disabled` input. Кнопка «Отпр.» имеет свой `disabled={disabled || sending || !input.trim()}` — она корректно блокируется. Enter-отправка защищена `&& !sending` в onKeyDown. Фокус никогда не теряется.

**Эталоны** (production messengers 2026):
- Telegram Web K — input НЕ disabled во время send
- Telegram Desktop — то же
- WhatsApp Web — то же
- Discord — то же

Никто из мессенджеров не дизаблит input — это анти-паттерн.

**НЕ сломалось**:
- Двойная отправка одного текста? Нет — после успешной отправки `setInput('')`
- Если юзер успел набрать новый текст пока шла предыдущая отправка → новый текст просто набирается в поле, кнопка все ещё disabled пока `sending=true`. Когда `sending=false` — нажмёт «Отпр.» и отправит новый текст.
- Editing (Ctrl+↑) → защищён `&& !input.trim()` — не задевается

**Файл**: 1 строка изменения в [InboxMessageInput.jsx](src/native/components/InboxMessageInput.jsx) (`disabled={sending || disabled}` → `disabled={disabled}`) + защита Enter (`&& !sending`).

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.

---

