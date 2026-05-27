---
name: code-todo
description: Отложенные технические улучшения которые НЕ блокируют пользователя но стоит сделать
---

# Список отложенных доработок

Здесь — задачи, которые нашёл при ревью кода, но они **не блокируют пользователя**. Делаем когда руки дойдут или появится связанный баг.

**Правило**: если задача отсюда становится «горячей» (всплыл реальный баг) — переносим в активную работу + удаляем отсюда.

---

## 🟡 Средний приоритет (реальный UX-баг, чинить аккуратно)

### TODO-markread-gap: «дыра» в пометке-прочитанным — read-by-visibility прыгает через провал → каскадная пометка всего бэклога

**Симптом** (лог 27 мая, топик Xiaomi Home `tg_611696632:-1001295734575:topic:281172`): чат с 8624 непрочитанными; юзер пролистал ~100 → счётчик упал до 88. Не глюк отображения — реальная пометка прочитанным.

**Корень**: `useReadByVisibility` ([src/native/hooks/useReadByVisibility.js](../src/native/hooks/useReadByVisibility.js)) копит id видимых сообщений и шлёт `markRead(chatId, lastReadMax, {source:'visibility'})` с САМЫМ ВЫСОКИМ увиденным id — без проверки на «провал» (gap) в загруженном окне. Backend: `viewMessages(client, rawId, [maxId], force_read:true)` ([tdlibBackend.js:340-346](../main/native/backends/tdlibBackend.js)); `force_read:true` двигает `readInboxMaxId` к maxId ([tdlibMessages.js:219](../main/native/backends/tdlibMessages.js)) → TDLib помечает прочитанным ВСЁ ≤ maxId. Если в окне разрыв (старые непрочитанные ~490млрд + свежие ~513млрд, между — не загружено) и видимым стало свежее → курсор прыгает на 513млрд → 8000+ старых помечаются прочитанными разом.

**Защита есть, но с дырой**: `markReadCurrentView` ([InboxMode.jsx:233-244](../src/native/modes/InboxMode.jsx)) пропускает markRead при `unreadWindowIncomplete`, НО только если `source !== 'visibility'`. Visibility-пометка проходит → защита не срабатывает (в логе `mark-read-skip-unread-window` = 0).

**Кандидаты решения** (зона markRead — была болезненная история «было 7 стало 1» v0.87.44, чинить с планом + тестом на реальной сессии):
1. **Контигуити-guard**: не двигать read-курсор через незагруженный провал — только по непрерывному ряду от cursor. Минус: нужно, чтобы store помечал gap между загруженными диапазонами (сейчас не помечает явно).
2. **force_read=false для visibility-пометки при неполном окне**: TDLib не форсит курсор через невидимое. Минус: проверить, что обычная пометка не ломается (force_read добавляли намеренно).
3. **Не префетчить свежие (load-newer), пока бэклог непрочитанных не пройден**: убирает сам провал. Минус: трогает загрузку (риск для скролл-фикса v0.94.2).

**Рекомендация**: вариант 2 (минимальный, точечный) — но СНАЧАЛА сверить TDLib docs на `force_read` + план + тест на реальной сессии. НЕ чинить вслепую.

**Приоритет**: 🟡 средний — теряются непрочитанные, которые юзер не видел. Но не краш, чат работает.

---

## 🟢 Низкий приоритет (cleanup после стабилизации)

### TODO-N: Удалить временные диагностические логи v0.91.4-v0.91.5

**Контекст**: для диагностики 2-х багов («бейдж непрочитанных пуст у forum-чата» и «выбрал тему — пустой экран») были добавлены логи. Они выполнили свою задачу — баги починены в v0.91.6 / v0.91.7. Сейчас логи только засоряют файл.

**Что удалить**:
1. `[forum-be] chatId=... topicsCount=N sumTopicUnread=K chatUnreadCount=L` — в [`tdlibBackend.js forum.getTopics`](../main/native/backends/tdlibBackend.js). Был нужен чтобы проверить агрегирует ли TDLib `chat.unread_count`. Юзер не пожаловался на бейдж после v0.91.4 — значит баги нет или невидим, лог не нужен.
2. `[forum-map] chatId=... unread_count=N unread_mention_count=M` — в [`tdlibMapper.js mapChat`](../main/native/backends/tdlibMapper.js). Та же диагностика.
3. `[topic-state] applyMessages key=... newLen=N prevLen=M ...` — в [`nativeStore.js selectForumTopic`](../src/native/store/nativeStore.js). Был нужен для отслеживания race condition. v0.91.6 / v0.91.7 показали что race не было — баг был в `useInitialScroll`.
4. `[topic-resolve] chatId=... activeMessageKey=... activeMessages.len=N ...` — в [`InboxMode.jsx`](../src/native/modes/InboxMode.jsx). Та же диагностика, выполнила задачу.

**Когда удалять**: когда юзер подтвердит что 5 фиксов v0.91.1-v0.91.7 работают стабильно 2-3 недели без откатов.

**Почему важно**: эти логи срабатывают на КАЖДЫЙ открытие чата / каждое изменение messagesCount. В активной сессии — десятки строк в секунду. Лог быстро растёт, диагностика реальных проблем труднее.

**Приоритет**: 🟢 низкий — функционально ничего не мешает, чистка.

---

### TODO-9: Удалить IPC burst tracker v0.91.21

**Контекст**: в v0.91.21 добавлен счётчик IPC bursts в `attachTelegramIpcListeners` для диагностики Maximum update depth (Проблема 3, корень loop не известен).

**Что удалить** (в коммите с фиксом v0.91.22):
1. В [`nativeStoreIpc.js`](../src/native/store/nativeStoreIpc.js) — `ipcBursts` Map + `trackIpcBurst` функция + обёртка `wrapped` в `addHandler` (~15 строк)
2. В `api.md` — строка `ipc-burst`

**Когда удалять**: в коммите с фиксом v0.91.22.

**Приоритет**: 🟢 низкий — счётчик не в горячем пути, setTimeout 100мс на канал.

---

### TODO-8: Удалить диагностику v0.91.20 — stack capture + multi-step postcheck

**Контекст**: в v0.91.20 добавлена диагностика для 2 проблем где корень НЕ был известен — Maximum update depth (нет stack) и react-window remeasure timing (не знали когда scrollHeight стабилизируется).

**Что удалить** (в одном коммите с фиксами v0.91.21):
1. В [`useConsoleErrorLogger.js`](../src/hooks/useConsoleErrorLogger.js) — `patchedError` stack capture блок (5 строк)
2. В [`useInitialScrollDiag.js`](../src/native/hooks/useInitialScrollDiag.js) — multi-step `postcheck-tick` цикл (15 строк), вернуть простой postcheck с **правильным** timeout (из данных диагностики)
3. В `api.md` — строка `postcheck-tick`

**Когда удалять**: в коммите с фиксами v0.91.21.

**Приоритет**: 🟢 низкий — события не в горячем пути.

---

### TODO-7: Удалить диагностические логи v0.91.19 (restore-start / scroll-save / autosave-save)

**Контекст**: после 7 коммитов v0.91.12-18 проблема «прыгает позиция при возврате» НЕ решена. Гипотеза «замкнутый круг handleScroll» косвенная — нет прямого доказательства в логах. В v0.91.19 добавлены 3 точки лога для подтверждения/опровержения. Подробности — [`native-scroll-restore-saga.md`](./native-scroll-restore-saga.md).

**Что удалить** (когда корень найден и пофикшен):
1. `scroll-save` в [`useInboxScroll.js`](../src/native/hooks/useInboxScroll.js) handleScroll (5 строк)
2. `autosave-save` в [`useScrollPositionAutosave.js`](../src/native/hooks/useScrollPositionAutosave.js) (1 строка + 1 импорт)
3. `restore-start` в [`useInitialScrollDiag.js`](../src/native/hooks/useInitialScrollDiag.js) tryRestoreWithRetry (5 строк)
4. В `api.md` — соответствующие строки из таблицы events

**Когда удалять**: в одном коммите с точечным фиксом корня (v0.91.20 предположительно).

**Приоритет**: 🟢 низкий — события не в горячем пути (1 раз на restore, 1 раз на scroll юзера, 1 раз в 1.5с).

---

### TODO-6: Удалить диагностический модуль v0.91.11 (useInitialScrollDiag.js)

**Контекст**: в v0.91.11 для расследования бага «при возврате в чат программа перелистывает вверх» был вынесен отдельный модуль [`useInitialScrollDiag.js`](../src/native/hooks/useInitialScrollDiag.js) с функцией `logRestoreDiag(...)`. Вызывается в [`useInitialScroll.js`](../src/native/hooks/useInitialScroll.js) ветка «already-seen» один раз на смену чата + один setTimeout(100мс).

**Что удалить** (когда корень найден и пофикшен):
1. Файл `src/native/hooks/useInitialScrollDiag.js` целиком
2. В `useInitialScroll.js` — строку `import { logRestoreDiag } from './useInitialScrollDiag.js'`
3. В `useInitialScroll.js` — блок `logRestoreDiag({...})` в ветке already-seen (восстановить присвоение `scrollEl.scrollTop = savedTop` напрямую)
4. В `api.md` — строки `initial-restore-attempt`, `initial-restore-applied`, `initial-restore-postcheck`, `initial-restore-skip` из таблицы «Initial-scroll и restore позиции» (оставить только `initial-restore-saved`)

**Когда удалять**: в одном коммите с точечным фиксом корня (после анализа лога юзера).

**Приоритет**: 🟢 низкий — выполняется один раз на смену чата, не горячий путь.

---

## 🟡 Средний приоритет

### TODO-1: Удалить мёртвый параметр `thumb` из `media.download`

**Контекст**: с v0.87.39 до v0.89.16 параметр `thumb` в `tg:download-media` и `backend.media.download` существовал в сигнатуре, но backend его игнорировал. Это привело к ловушке #10 (см. `mistakes/tdlib-video-player.md`).

**Что сделать**:
1. Убрать `thumb?: boolean` из сигнатуры в [main/native/messengerBackend.js:82](../main/native/messengerBackend.js#L82)
2. Убрать `thumb` из параметров handler в [main/native/tdlibIpcHandlers.js:266](../main/native/tdlibIpcHandlers.js#L266)
3. Убрать передачу `thumb` в `backend.media.download` (теперь не нужен)
4. Проверить grep'ом: не осталось ли вызовов с `thumb: true` (после v0.89.16 не должно)

**Почему важно**: правило из ловушки #10 — «параметр который не используется, нужно убрать из сигнатуры». Иначе кто-то прочтёт и подумает, что параметр что-то меняет.

**Приоритет**: 🟡 средний — функционально ничего не сломано, но визуально код вводит в заблуждение.

---

### TODO-2: Заменить fallback `tdlibPathToCcMediaUrl` на явный error

**Контекст**: в [main/native/backends/tdlibBackend.js:411](../main/native/backends/tdlibBackend.js#L411) и др. остался fallback:
```js
r.path = stable || tdlibPathToCcMediaUrl(r.file.local.path) || r.file.local.path
```

Этот fallback срабатывает если `stabilizeForPlayback` вернул null (например, при переполнении диска). Но `tdlibPathToCcMediaUrl` возвращает URL вида `cc-media://tdlib/...`, а kind=`tdlib` был **удалён** из ccMediaProtocol в v0.89.15. То есть в редком сценарии «диск полон» fallback вернёт URL который handler не обработает → 404 в UI без понятной ошибки.

**Что сделать**:
1. Заменить fallback на `return { ok: false, error: 'disk full or stabilize failed' }`
2. UI VideoTile/MediaAlbum покажут понятную ошибку «Не удалось сохранить файл — переполнение диска»

**Приоритет**: 🟡 средний — крайний edge-case, но молчаливый 404 хуже чем явная ошибка.

---

### TODO-3: Префикс accountId в именах файлов `tg-media/`

**Контекст**: сейчас имя файла = `<fileId>_<size>.<ext>`. file_id — это TDLib-shared между аккаунтами (один и тот же файл = один id). Удаление аккаунта не удаляет его файлы из `tg-media/`. После реализации LRU (см. активный план) это менее критично — файлы сами удалятся через 7 дней неактивности.

**Что сделать** (если решим что нужно):
1. Изменить имя: `<accountId>_<fileId>_<size>.<ext>`
2. При удалении аккаунта — `glob` по префиксу + удалить
3. Минус: тот же файл, который смотрят 2 аккаунта, будет лежать в двух копиях

**Приоритет**: 🟢 низкий — после LRU решения проблема саморегулируется.

---

## 🟢 Низкий приоритет (улучшения)

### TODO-4: Возврат progressive playback правильно — через `readFilePart`

**Контекст**: в v0.89.15 убрали progressive playback из-за нестабильности `temp/` путей. Для очень больших видео (>500 МБ) ждать полной загрузки — плохой UX. Telegram Web K реализует streaming через TDLib `readFilePart` API + Service Worker.

**Что сделать** (только если пожалуется пользователь):
1. В cc-media handler: новый kind=`stream` который вместо `fs.createReadStream` зовёт `client.invoke({@type: 'readFilePart', file_id, offset, count})`
2. Range запросы → offset/count для TDLib
3. URL формат: `cc-media://stream/<accountId>/<fileId>`
4. Сложность: TDLib может не иметь нужных байт → нужен backpressure

**Приоритет**: 🟢 низкий — мобильное видео обычно <100 МБ, ожидание ~5-30 сек.

---

### TODO-5: Документация API

**Что сделать**:
- `.memory-bank/api.md` — добавить запись об `tg:download-thumbnail` (v0.89.16)
- `.memory-bank/architecture.md` — упомянуть `tg-media/` как нашу LRU-кеш-папку (после реализации)
- `.memory-bank/decisions.md` — записать решение «копируем в свою папку вместо `readFilePart` streaming, потому что у нас есть локальный диск»

**Приоритет**: 🟢 низкий — функционально не блокирует.

---

## 📋 Что НЕ откладываем (в активной работе)

См. план «LRU-кеш для `tg-media/`» — фиксит сразу проблемы 1, 2, 3 из ревью v0.89.16.

---

## Журнал отложенных задач

| Дата записи | Версия в которой записано | Задача | Статус |
|---|---|---|---|
| 2026-05-15 | v0.89.16 | TODO-1 — убрать мёртвый `thumb` | 📋 в очереди |
| 2026-05-15 | v0.89.16 | TODO-2 — `tdlibPathToCcMediaUrl` fallback | 📋 в очереди |
| 2026-05-15 | v0.89.16 | TODO-3 — accountId в `tg-media/` именах | 📋 в очереди |
| 2026-05-15 | v0.89.16 | TODO-4 — progressive через `readFilePart` | 📋 на будущее |
| 2026-05-15 | v0.89.16 | TODO-5 — обновить api.md, architecture.md, decisions.md | 📋 в очереди |
| 2026-05-25 | v0.91.11 | TODO-6 — удалить диагностические `initial-restore-*` логи | 📋 в очереди |
| 2026-05-26 | v0.91.19 | TODO-7 — удалить `restore-start` / `scroll-save` / `autosave-save` | 📋 в очереди |
| 2026-05-26 | v0.91.20 | TODO-8 — удалить stack capture + multi-step postcheck (тики 50/100/300/500/1000мс) | 📋 в очереди |
| 2026-05-26 | v0.91.21 | TODO-9 — удалить `ipc-burst` счётчик в attachTelegramIpcListeners | 📋 в очереди |
