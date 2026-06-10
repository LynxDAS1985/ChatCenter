# v0.95.47 — Фикс пустых bubble (sticker/animated/dice) + 5 диагностических логов для notification→scroll

**Две задачи в одном релизе.**

**(A) Фикс пустых сообщений** — юзер: «и почему тут пусто?» (скрин чата «Нейрокомьюнити», 3 bubble подряд только с временем 12:02). Корень: TDLib content types `messageSticker`, `messageAnimatedEmoji`, `messageDice` приходили без `.text` поля. v0.95.40 фиксил только `messageAnimatedEmoji`. Для `messageSticker` mapper возвращал `mediaType='other'` + пустой text → MessageBubble не имеет рендера для 'other' → bubble только с временем.

**Решение** (2 файла, 1 паттерн):
- [tdlibMapper.js](main/native/backends/tdlibMapper.js): расширил emoji fallback из v0.95.40 на 3 типа — `messageAnimatedEmoji` (uses `content.emoji`), `messageSticker` (uses `content.sticker?.emoji || '🎴'`), `messageDice` (uses `content.emoji || '🎲'`). `isLargeEmoji=true` для всех трёх → рендер 56px (Telegram-style большой emoji).
- [tdlibMapperMedia.js](main/native/backends/tdlibMapperMedia.js): `messageSticker` → mediaType=null (было 'other'), `messageDice` → новый case mediaType=null. Иначе 'other' перебивал emoji-рендер.

**Эталоны**: TDLib [messageSticker spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message_sticker.html) — `sticker.emoji` ассоциированный emoji. [messageDice spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message_dice.html) — `emoji` field. tweb когда стикер не загружен — fallback на текстовый emoji.

**(B) 5 диагностических логов для notification → scroll-to-message (v0.95.46 не работает в реальной сессии)**. Юзер: «так не работает, проверь почему, добавь логи». Без логов нельзя понять где именно цепочка ломается (5 шагов: emit → save → click → recv → scroll).

**Логи** (по правилу «один лог на шаг цепочки»):
1. [nativeStoreIpc.js](src/native/store/nativeStoreIpc.js) при emit `app:custom-notify` → `logNativeScroll('notify-emit', {chatId, messageId, hasMessageId})`
2. [notificationManager.js](main/handlers/notificationManager.js) при сохранении в notifItems → `console.log('[notif-mgr] saved id=X messageId=Y')`
3. [notifHandlers.js](main/handlers/notifHandlers.js) при `notif:click` → `console.log('[notif-click] sending notify:clicked ...')`
4. [NativeApp.jsx](src/native/NativeApp.jsx) handler notify:clicked → `console.log('[native-notify-recv] ...')` + проверка `hasRequestScroll`
5a. [InboxMode.jsx](src/native/modes/InboxMode.jsx) useEffect pendingScrollToMessage → `logNativeScroll('pending-scroll-effect', {chatIdMatch, msgCount, age})`
5b. [InboxMode.jsx scrollToMessage](src/native/modes/InboxMode.jsx) → `logNativeScroll('scroll-to-message', {foundDirect, domNodesWithMsgId, sampleIds, msgIdType})` — главный лог, видно НАЙДЁН ЛИ элемент в DOM через querySelector

**Конфликты ✅**: логи не меняют поведение, только print. **Лимиты**: InboxMode.jsx ceiling 1060→1080 (диагностика временная, удалить после нахождения корня), nativeStoreIpc.js 720→730.

**Тесты**: regression-only — `changelogData.vitest.js` обновлён под версию 0.95.47, новых unit-тестов нет (это диагностический релиз + 1 эмодзи-fallback).

**Регрессия**: lint 0, vitest, fileSizeLimits, check-memory ✅.

---
