# Архив v0.94.0 — Полное удаление виртуализации

Заархивировано 11 июня 2026 при выпуске v1.1.10. Это **финал саги scroll restore** (~30 версий v0.91.x–v0.93.x). Уже стабильно с v0.95.x. Перенесено сюда т.к. виртуализация уже удалена и проблема не возвращалась.

---

### v0.94.0 — ПОЛНОЕ УДАЛЕНИЕ виртуализации (react-virtuoso) → простой DOM + pixel scrollTop

**Корень всей саги scroll restore (v0.91.1 – v0.93.0, ~30 версий)**: виртуализация (сначала react-window, потом react-virtuoso) фундаментально несовместима с точным восстановлением позиции. Обе библиотеки пересчитывают высоты строк при ремаунте `key={cacheKey}` → `scrollHeight` скачет → restore промахивается. Virtuoso работает с **дискретными индексами строк + alignment** (`align: 'start'/'end'`) → отсюда «прилипание» к картинкам/видео и «выравнивание» которое юзер видел на скринах. Никакой `offset`, `anchorMsgId`, `StateSnapshot` не лечит это полностью — это архитектурное ограничение.

**Решение** (как у Telegram Web K, который НЕ виртуализирует): рендерим **все сообщения обычным DOM**, сохраняем **простой пиксельный `scrollTop`** (число). При ремаунте `scrollHeight` стабилен → `el.scrollTop = saved` восстанавливает позицию ТОЧНО. Типичный чат 100–300 сообщений в памяти — без проблем с производительностью.

#### Что изменено

**1. `scrollPositionsCache.js`** — формат `Map<chatId, {scrollTop:number, atBottom:boolean}>`. Удалён `findVisibleAnchorMsgId`. Storage version → 4 (старые v2/v3 anchor-форматы игнорируются — возвращается пустая Map).

**2. `VirtualMessageList.jsx`** — удалён `import { Virtuoso }`. Теперь обычный `<div>` со `overflow-y:auto` + `overflow-anchor:auto` (браузер сам держит позицию при подгрузке старых сообщений сверху) + `renderItems.map(...)`. `listRef` через `useImperativeHandle`: `element` getter + `scrollToRow({index, align})` через `scrollIntoView`.

**3. `useInitialScroll.js`** — restore через `el.scrollTop = saved.scrollTop` (или `el.scrollHeight` если `atBottom`). Ветка 1 (первое открытие): saved.scrollTop → firstUnread (querySelector data-msg-id) → низ. Ветка 2 (возврат): pixel scrollTop. `isRestoringRef` closed-loop guard сохранён (500мс).

**4. `useInboxScroll.js`** — сохраняет `{scrollTop: el.scrollTop, atBottom}` с guard `isRestoringRef`. Вернул load-older (`scrollTop < 100`) и load-newer (`maybeTrigger`) БЕЗ ручной коррекции scrollTop — `overflow-anchor:auto` держит позицию при prepend.

**5. `useScrollPositionAutosave.js`** — interval 1.5с сохраняет `{scrollTop, atBottom}`, пропуск при `isRestoringRef`.

**6. `InboxMode.jsx`** + **`InboxChatPanel.jsx`** — удалены `initialTopMostItemIndex`, `firstItemIndex` state, 2 useEffect (reset firstItemIndex + tg:messages append decrement), `handleStartReached`, `handleEndReached`, `findRenderItemIndex`. `scrollToVirtualRow` переписан на querySelector `[data-msg-id]`. `scrollToAbsoluteBottom` сохраняет `{scrollTop: el.scrollHeight, atBottom: true}`.

**Удалено**: `useInitialScrollDiag.js` (git rm). Пакет `react-virtuoso` удалён (`npm uninstall`).

**Регрессия**: lint 0, vitest 658/658, fileSizeLimits 272/272, check-memory ✅. 3 теста `useInitialScroll.vitest.jsx` переписаны под pixel API (были на `onRestoreAnchor`/`onMissingTarget`/`{anchorMsgId}`).

**Проверить визуально** (просьба юзеру): открыть чат → пролистать на середину → перейти в другой чат → вернуться → позиция должна быть РОВНО где оставил, без выравнивания и прилипания к картинкам.
