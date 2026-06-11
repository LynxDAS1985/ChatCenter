# Архив changelog v0.95.10 – v0.95.11

Заархивировано 11 июня 2026 (при выпуске v1.1.9) для соблюдения лимита 100 КБ на `features.md`. Это диагностики/откаты, корни закрыты в v0.95.12+ (`jump-to-end-saga.md`).

---

### v0.95.11 — Диагностика «не грузит дальше при unread > загруженного» (БЕЗ смены поведения)

Юзер жалоба + лог анализ: чат «Компьютерная | IT, Digital», unread=724, загружено 394 сообщения, юзер в самом низу (`bottomGap=0`). Клик ↓ — no-op (уже у низа загруженного). Load-newer не срабатывает потому что юзер не двигает scroll. Остальные ~330 непрочитанных — за пределами окна загрузки. **Корневой ответ — jump-to-end-of-chat** (как Telegram Desktop: при unread>0 reload вокруг `chat.lastMessage.id`). Прежде чем менять поведение — собираю реальные числа на live-сессии.

#### Что добавлено (только логи, поведение не изменено)

1. `tdlibMapper.js mapChat` — новое поле `lastMessageId` (id последнего сообщения чата на сервере по TDLib).
2. `InboxMode.jsx scrollToBottom` — `button-scroll-bottom` лог расширен полями:
   - `loadedIncoming` — число incoming в `activeMessages`
   - `chatLastMessageId` — id последнего на сервере
   - `loadedLastId` — id последнего загруженного
   - `gapMessages` — оценка количества пропущенных сообщений между loaded и server (TDLib msg_id step = 2^20)
   - `unreadVsLoaded` — `activeUnread - loadedIncoming` (сколько непрочитанных вне DOM)
3. `useScrollDiagnostics.js chat-open` — добавлены `lastMessageId` + `readInboxMaxId`.

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

В `InboxMode.jsx` удалены:
- `scrollIntentRef` ref + установка intent в `scrollToBottom`
- `useLayoutEffect` который слушал `activeMessages.length` / `loadingNewer` и довинчивал scroll к низу
- Комментарии о continuation

#### Остаётся (Fix 4a v0.95.9, юзер просил это)

- ✅ `--loading` класс на ScrollBottomButton когда `loadingNewer=true`
- ✅ Accent border + box-shadow pulse 1.4s в styles-overlays.css
- ✅ Tooltip «Подгружаю свежие сообщения…»
- ✅ loadingNewer prop в ScrollBottomButton

Юзер видит: кликнул ↓ → кнопка пульсирует пока идёт «Загружаю ещё…» (визуальный feedback есть). Но scroll НЕ продолжается автоматически — это поведение по-умолчанию (один scroll по клику, как в v0.95.6).

**Регрессия**: lint 0, vitest 721/721, fileSizeLimits 283/283, check-memory ✅.
