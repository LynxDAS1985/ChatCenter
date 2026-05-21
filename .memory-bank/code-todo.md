---
name: code-todo
description: Отложенные технические улучшения которые НЕ блокируют пользователя но стоит сделать
---

# Список отложенных доработок

Здесь — задачи, которые нашёл при ревью кода, но они **не блокируют пользователя**. Делаем когда руки дойдут или появится связанный баг.

**Правило**: если задача отсюда становится «горячей» (всплыл реальный баг) — переносим в активную работу + удаляем отсюда.

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
