# Архив: changelog v0.95.0 – v0.95.3

Вынесено 28 мая 2026 при v0.95.9 для уменьшения размера features.md под лимит 100 КБ. v0.95.0 (источниковый фикс контигуити), v0.95.1 (afterId load-newer fix), v0.95.2 (Schmitt trigger ↓ + удаление пилюли), v0.95.3 (диагностика дёрга, корень закрыт в v0.95.4) — все стабилизированы.

---

### v0.95.3 — Диагностика «дёрг при повторном открытии чата» (без смены поведения)

Перед точным фиксом (useEffect → useLayoutEffect, или альтернатива) — диагностика, чтобы 100% подтвердить корень. Поведение **не изменено**, только логи.

В [useInitialScroll.js](src/native/hooks/useInitialScroll.js) ветка 2 (already-seen):
- В событии `restore-applied` добавлены поля: **`scrollTopBefore`** (что видел юзер ДО restore — если 0 при `saved≠0`, значит был flash «верх ленты»), **`msSinceEffectStart`** (время от запуска эффекта до scrollTop=), **`attempts`** (число rAF-retry если scrollEl не был готов).
- Новое событие **`restore-followup-render`** (`followupCount`, `messagesCount`) считает ре-раны эффекта ДЛЯ ТОГО ЖЕ чата ПОСЛЕ restore (staged setState из v0.91.6 — IDB→server→prefetch×2). Покажет, сколько ре-рендеров происходит после восстановления позиции (могут давать мелкие сдвиги).

**Зачем:** на реальной сессии (повторное открытие seen-чата) лог покажет:
1. `scrollTopBefore=0` + `saved.scrollTop>0` → подтверждение post-paint flash → фикс через useLayoutEffect / chatReady-гейт.
2. `followupCount>1` после restore → корень в staged setState → другой подход (батчинг или re-pin на каждое изменение).

Также исправлен рассинхрон в `package-lock.json` (root=0.95.2, packages=0.95.1 → оба 0.95.3).

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅. Тесты useInitialScroll 14/14 (поведение не менялось).

---

### v0.95.2 — Фикс мигания кнопки ↓ (гистерезис) + удаление пилюли «N/M»

**✅ Подтверждение пользователя (28 мая 2026)**: фикс работает — кнопка ↓ больше не мигает, пилюля убрана.

**Симптом 1** (мигание ↓): после определённого количества прокрутки кнопка-стрелка со счётчиком исчезает на 1-2с и появляется снова. **Симптом 2**: пилюля «100/802» рядом с кнопкой бесполезна (дублирует бейдж).

#### Мигание ↓ — корень и фикс

Лог `bottom-state-change` показал **8 переходов `atBottom` true↔false подряд**, причём `bottomGap` колебался около единого порога: `64 → 105 → 48 → 92 → 55 → 110 → 70 → 85`. Код [useInboxScroll.js](src/native/hooks/useInboxScroll.js): `nearBottom = scrollHeight - scrollTop - clientHeight < 80` — **один порог 80px** → дребезг → кнопка `{(!atBottom || activeUnread>0)}` мигает (когда `activeUnread===0`).

**Решение** (стандартный приём из UX — [Schmitt trigger](https://en.wikipedia.org/wiki/Schmitt_trigger), используется в кнопках scroll-to-top, sticky headers): **два порога**. ВОЙТИ в `atBottom` при `bottomGap < 40`, ВЫЙТИ при `bottomGap > 120`. Полоса 40-120 сохраняет предыдущее состояние → колебания 60-100 не дрожат.

Чистая функция `computeNearBottom(bottomGap, prevNearBottom)` в [useInboxScroll.js](src/native/hooks/useInboxScroll.js), используется в `handleScroll`. +4 теста [useInboxScroll.vitest.jsx](src/native/hooks/useInboxScroll.vitest.jsx) (пороги в обе стороны + реальный сценарий дребезга 60-100).

#### Удаление пилюли «N/M прогресса непрочитанных»

Пилюля (v0.94.4-5) дублировала бейдж кнопки ↓ и больше путала, чем помогала. Бейдж `activeUnread` на кнопке ↓ достаточно показывает число непрочитанных.

Удалено: `UnreadProgressPill.jsx`, `UnreadProgressPill.vitest.jsx`, CSS `.native-unread-pill*` в [styles-overlays.css](src/native/styles-overlays.css), импорт + проп + вычисления `showFreshUnreadWindowInfo/unreadLoaded/unreadTotal` в [InboxChatPanel.jsx](src/native/components/InboxChatPanel.jsx), `unreadWindow={activeMessageWindow}` в [InboxMode.jsx](src/native/modes/InboxMode.jsx). Логика `unreadWindowIncomplete` для markRead-guard в InboxMode **не тронута** (нужна для защиты от каскада).

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.

---

### v0.95.1 — НАСТОЯЩИЙ корень разреженной загрузки: load-newer игнорировал afterId → грузил низ, не следующую страницу

Симптом: счётчик непрочитанных встаёт после ~100 (или вообще не двигается); чат с большим unread грузится «дырявно» (200 загружено при 1000+ непрочитанных).

#### Корень (баг в backend, доказан кодом + логом + TDLib-докой)

В [tdlibBackend.js `messages.get`](main/native/backends/tdlibBackend.js) параметр **`afterId` не использовался**:
```js
fromMessageId: params.aroundId || params.offsetId,  // afterId игнорировался!
offset: params.addOffset,
```
load-newer (прокрутка вниз) шлёт `afterId`, но backend читал только `aroundId`/`offsetId` → `from_message_id=0` → TDLib `getChatHistory` грузит **последние сообщения (низ чата)**, а не страницу после afterId. При большом непрочитанном (окно стоит на первом непрочитанном, далеко от низа) load-newer **прыгал в самый низ** → между окном и низом оставался **незагруженный разрыв** → счётчик стоял (read-by-visibility упирался в гейт v0.94.7 на границе разрыва).

#### Решение (по TDLib docs)

[TDLib getChatHistory](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html): отрицательный `offset` (до -99) грузит **новее** `from_message_id`; правило `limit >= -offset` ([#236](https://github.com/tdlib/td/issues/236)).

Чистая функция **`computeHistoryParams`** в [tdlibMessages.js](main/native/backends/tdlibMessages.js):
- `afterId > 0` (load-newer): `{ fromMessageId: afterId, offset: -(limit-1) }` — грузим непрерывную страницу НОВЕЕ afterId (сам afterId приходит как dup, отсеивается дедупом store). `limit >= limit-1` — всегда валидно.
- initial (`aroundId`) / load-older (`offsetId`): `fromMessageId` + `addOffset` как раньше (не тронуто).

**+Логирование** `[get-msgs]` (afterId / from / offset / count / first / last / hasMore) — на реальной сессии видно, грузит ли load-newer непрерывно (first ≈ afterId, а не низ чата).

#### Итог

Прокрутка вниз теперь грузит сообщения **подряд** → нет разрыва → read-by-visibility помечает прочитанным непрерывно → **счётчик доходит до 0, как в Telegram**. Гейт v0.94.7 и контигуити-проверка v0.95.0 остаются защитой, но срабатывать почти не должны (разрыв больше не образуется).

**Тесты** [tdlibMessages.vitest.js](src/__tests__/tdlibMessages.vitest.js) (+5): afterId→from=afterId,offset=-(limit-1); приоритет afterId; initial; load-older; правило `limit>=-offset`. tdlibBackend.js сжат под лимит (548/550).

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅. load-older и initial-load не затронуты.

---

### v0.95.0 — Источниковый фикс: загруженный список ВСЕГДА непрерывен (корень всех багов счётчика)

Общий корень и каскада (v0.94.7, 8624→88), и застрявшего счётчика (100/1067) — **разрыв** в загруженном списке сообщений.

#### Корень (доказан кодом + логом)

1. Старт грузит **окно вокруг первого непрочитанного** ([nativeStore.js:111-123](src/native/store/nativeStore.js#L111)): при большом unread окно ~100-200 сообщений около первого непрочитанного, до низа чата НЕ достаёт.
2. `tg:new-message` дописывал свежие сообщения в конец массива **безусловно** ([nativeStoreIpc.js](src/native/store/nativeStoreIpc.js)): даже когда окно стоит на старом блоке. → массив = `[старый блок] + ДЫРА + [свежий блок]`.

Из дыры росли: каскад markRead (свежее в видимости → пометка всего бэклога) и застрявший счётчик (loadedIncoming не догоняет, ~864 в дыре не загружены).

#### Решение (паттерн Telegram/Discord/Slack)

TDLib `getChatHistory` грузит **непрерывные окна** ([spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html)); зрелые клиенты дописывают живое сообщение в ленту **только когда окно «у низа»**, иначе показывают «↓N» и грузят при прокрутке вниз.

В `tg:new-message` ([nativeStoreIpc.js](src/native/store/nativeStoreIpc.js)) свежее сообщение вклеивается в массив **только если непрерывно** с концом загруженного:
```
isContiguous = !newestLoaded || (message.id − newestLoaded) ≤ 200×2^20
```
(в пределах ~200 сообщений; TDLib `message_id = server_id << 20`). Если далеко (разрыв) — **не вклеиваем**; бейдж/превью/«↓N» обновляются всё равно (useNewBelowCounter слушает событие напрямую, v0.91.3), сообщение подгрузится при прокрутке вниз непрерывно (**self-heal**).

#### Почему надёжно/оптимально

- Список **всегда непрерывен** → дыра невозможна → каскад невозможен, счётчик растёт ровно. Гейт v0.94.7 остаётся страховкой.
- **Оптимально**: O(1) (`existing[length-1]` — массив отсортирован), без полного сканирования.
- **Не сломали**: live-чат у низа (дельта ~1 сообщение → вклеивается); ↓N-счётчик независим (событие); превью/бейдж сохранены; скролл (v0.94.2) и markRead-гейт (v0.94.7) не тронуты.

**Тесты** [nativeStoreNewMessage.vitest.jsx](src/native/store/nativeStoreNewMessage.vitest.jsx) (+4): соседнее вклеивается; далёкое НЕ вклеивается, но бейдж/превью обновлены; пустой чат засевается; дубль обновляется на месте.

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.

---


