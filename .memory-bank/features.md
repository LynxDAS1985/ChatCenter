# Реализованные функции — ChatCenter

## Текущая версия: v0.89.16 (15 мая 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.88.0 → v0.89.16). Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
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

### v0.89.16 — ✅ ПОДТВЕРЖДЕНО ПОЛЬЗОВАТЕЛЕМ: Постер видео работает

**Статус**: ✅ Работает. Пользователь подтвердил визуально 15 мая 2026. Серия видео v0.89.6-v0.89.16 **ЗАКРЫТА**: воспроизведение + перемотка + постеры — всё корректно. 10 ловушек задокументированы в `.memory-bank/mistakes/tdlib-video-player.md`.

**Контекст**: после v0.89.15 пользователь увидел чёрный экран вместо превью в постере видео (Telegram-like UX отсутствовал). Скриншот показал: только размытый фон (`m.strippedThumb`) + кнопка ▶, JPEG-постер не подгружался.

#### Корневая причина

`VideoTile.jsx` + `MediaAlbum.jsx` при монтировании вызывали:
```js
window.api.invoke('tg:download-media', { chatId, messageId, thumb: false })
```

Параметр `thumb` в backend `media.download` **никогда не использовался**. Хелпер `extractMediaFileId(content)` для `messageVideo` возвращал `content.video.video.id` — это file_id **самого видео** (mp4, ~45 МБ), а не его превью.

Цепочка ошибки:
1. UI вызывает `tg:download-media` под видом «постера»
2. Backend качает ПОЛНОЕ видео (десятки МБ в фон) на каждое появление видео в чате
3. Backend возвращает URL `cc-media://media/<видео.mp4>`
4. UI ставит этот URL в `<img src="...">` — Chromium не рендерит mp4 в img
5. Виден только размытый minithumbnail (если есть) или чёрный фон

По [TDLib докам](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1video.html) у `video` есть ТРИ слоя:
- `minithumbnail: minithumbnail` — base64 ~200 байт в самом сообщении (размытый)
- `thumbnail: thumbnail { format, width, height, file: file }` — JPEG ~10-100 КБ (чёткий) ← **это надо качать для постера**
- `video: file` — mp4 десятки МБ (это для клика «▶»)

#### Как делают другие клиенты

| Клиент | Слой 1 (0 мс) | Слой 2 (~200 мс) | Слой 3 (на клик ▶) |
|---|---|---|---|
| Telegram Desktop (C++) | minithumbnail | `thumbnail.file` через `readFilePart` | `video.video` |
| Telegram Web K (WASM) | minithumbnail | `thumbnail.file` через Service Worker | `video.video` |
| **ChatCenter до v0.89.16** | minithumbnail | ❌ ОТСУТСТВУЕТ — качали полный mp4 | `video.video` |
| **ChatCenter v0.89.16** | minithumbnail | ✅ `thumbnail.file` через `tg:download-thumbnail` | `video.video` |

#### Решение

**4 файла, ~80 строк правок + 18 новых тестов**:

1. **[main/native/backends/tdlibMedia.js](../main/native/backends/tdlibMedia.js)** — новый helper:
   ```js
   export function extractThumbnailFileId(content) {
     if (content?.['@type'] === 'messageVideo')     return content.video?.thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messageAnimation') return content.animation?.thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messageDocument')  return content.document?.thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messageVideoNote') return content.video_note?.thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messageAudio')     return content.audio?.album_cover_thumbnail?.file?.id ?? null
     if (content?.['@type'] === 'messagePhoto')     return /* наименьший size для превью */ ...
     return null
   }
   ```
   Использован оператор `??` (не `||`), чтобы `file_id=0` (теоретически валидный) не превратился в `null`.

2. **[main/native/backends/tdlibBackend.js](../main/native/backends/tdlibBackend.js)** — новый метод `backend.media.downloadThumbnail`:
   - priority=8 (ниже video=24, выше default=1 — постеры важнее фона, но не блокируют клик на «▶»)
   - Возвращает `cc-media://media/<fileId>_<size>.jpg` через `stabilizeForPlayback`
   - Бонус: media-секция отрефакторена через IIFE с хелперами `dlAndStabilize` + `fetchMessage` (убрана дубликация в 3 методах: download/downloadVideo/downloadThumbnail)

3. **[main/native/tdlibIpcHandlers.js](../main/native/tdlibIpcHandlers.js)** — новый IPC `tg:download-thumbnail`

4. **[src/native/components/VideoTile.jsx](../src/native/components/VideoTile.jsx)** и **[src/native/components/MediaAlbum.jsx](../src/native/components/MediaAlbum.jsx)** — переведены с `tg:download-media` на `tg:download-thumbnail` для постера. В MediaAlbum для `PhotoTile` (полные фото в альбоме) `downloadMedia` callback **сохранён** — он там не для превью, а для полного фото на клик.

**Tests**: 559 → 577. Новый файл [`src/__tests__/tdlibMediaThumbnail.vitest.js`](../src/__tests__/tdlibMediaThumbnail.vitest.js) — 18 тестов:
- 14 для `extractThumbnailFileId`: все типы сообщений (video, animation, document, videoNote, audio, photo, text, voice, sticker), edge cases (null, без thumbnail, без sizes, id=0)
- 4 для `backend.media.downloadThumbnail`: качает правильный file_id (thumbnail, не video), `no thumbnail` error, ошибка getMessage, priority=8

Обновлены `VideoTile.vitest.jsx` + `MediaAlbum.vitest.jsx` (проверяют новый канал). Добавлено `downloadThumbnail` в `REQUIRED_METHODS` контракта в [`messengerBackend.test.cjs`](../src/__tests__/messengerBackend.test.cjs).

#### Эффект

🟢 **Что починилось**:
- Чёткий JPEG-кадр виден до клика ▶ (как в обычном Telegram)
- **Перестало качать 45+ МБ** в фон при появлении видео в чате
- Экономия трафика на мобильной связи
- Меньше нагрузка на TDLib priority queue
- TDLib не забивается фоновыми full-загрузками — клик «▶» начинает скачку моментально

📚 **Документация ловушек**: добавлена ловушка #10 в [.memory-bank/mistakes/tdlib-video-player.md](mistakes/tdlib-video-player.md): «параметр `thumb` в `media.download` был мёртвым кодом — игнорировался backend'ом».

---

### v0.89.15 — ✅ ПОДТВЕРЖДЕНО ПОЛЬЗОВАТЕЛЕМ: Видео раз и навсегда

**Статус**: ✅ Работает. Пользователь подтвердил визуально 15 мая 2026 (после релиза 18:45). Серия v0.89.6–v0.89.15 (видео-pipeline после TDLib миграции) **ЗАКРЫТА**.

**Контекст**: после v0.89.14 пользователь сообщил `ENOENT` на `tdlib-sessions/.../temp/2767` — десятки повторов за 2 секунды при попытке перезапустить видео. Логи (`chatcenter.log` 15 мая 18:17:55-57) показали, что фикс v0.89.14 (`stabilizeTempFile` для temp/) применялся **только** к non-streamable видео из-за условия `if (!r?.partial)` в `downloadVideo` — streamable (`supports_streaming=true`) обходили стабилизацию.

#### Корневая причина (одной строкой)

Архитектурно неверная попытка отдать `<video>` URL в TDLib-папку, которая нестабильна:
1. `tdlib-sessions/.../pending/files/temp/<N>` — TDLib переименовывает на completion, чистит при `optimizeStorage`
2. `tdlib-sessions/.../videos/<hash>.<ext>` — TDLib удаляет при чистке («Очистить кеш» вызывает `optimizeStorage`)
3. Progressive playback (early-resolve на 256 KB префикса) даёт ссылку на ещё-растущий файл с потенциально меняющимся именем

По [TDLib docs](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1local_file.html): `path` стабилен **только** после `is_downloading_completed=true`. Но даже после — наш UI «Очистить кеш» может удалить файл.

#### Радикальное решение (одно, надёжное, навсегда)

**Принцип**: НИ ОДИН TDLib-файл плеером напрямую не читается. Любой скачанный файл копируется в `userData/tg-media/<fileId>_<size>.<ext>` — это **НАША** папка, TDLib её не трогает.

**4 файла, ~150 строк правок**:

1. **[main/native/backends/tdlibMedia.js](../main/native/backends/tdlibMedia.js)**:
   - Удалён параметр `progressive` из `downloadFile`. Всегда ждём `is_downloading_completed=true`. Никаких early-резолвов
   - `stabilizeTempFile` → `stabilizeForPlayback`: копирует ЛЮБОЙ TDLib-файл (не только `temp/`) в `tg-media/`
   - Имя файла детерминированно: `<fileId>_<size>.<ext>` — дедуп между чатами и сессиями
   - При совпадении размера в `tg-media/` — copy не делается (быстрый кеш)

2. **[main/native/backends/tdlibBackend.js](../main/native/backends/tdlibBackend.js)**:
   - `media.download` и `media.downloadVideo` теперь **всегда** вызывают `stabilizeForPlayback` после успешной загрузки (раньше было `if (!r?.partial)` — пропускало streamable)
   - `downloadVideo` больше не читает `tdMsg.content.video.supports_streaming` (флаг больше не нужен)

3. **[src/native/components/VideoTile.jsx](../src/native/components/VideoTile.jsx)**:
   - Удалён state `partial` и связанный с ним оверлей «Загрузка X%» поверх играющего видео
   - Effect для `tg:media-progress` теперь зависит только от `downloading`
   - UX: пользователь видит прогресс-спиннер на постере до начала проигрывания. Когда видео стартует — оно полностью на диске, плавная перемотка, никаких неожиданных остановок

4. **[main/native/ccMediaProtocol.js](../main/native/ccMediaProtocol.js)**:
   - Удалён `kind='tdlib'` handler. Плеер больше не может попасть в `tdlib-sessions/` через cc-media. Любая старая ссылка с `cc-media://tdlib/...` вернёт 404 (но таких в UI после рестарта не остаётся — URL генерируются заново)

**Тесты**: добавлено 13 новых для `stabilizeForPlayback` + 4 переписанных для `downloadFile` (теперь проверяют, что progressive флаг игнорируется и `partial` поле не возвращается). Всего: 546 → 559 vitest тестов.

#### Что починилось (5 разных багов одним фиксом)

| Симптом | Версия добавлен | Корень |
|---|---|---|
| `ENOENT: tdlib-sessions/.../temp/<N>` | v0.89.8 | TDLib чистит `temp/` |
| `PIPELINE_ERROR_DECODE` при переходе temp→videos | v0.89.8 | Путь меняется в процессе воспроизведения |
| «Перемотка не работает» (отскакивает в начало) | v0.89.10 (clamp по `buffered`), v0.89.12 | Range запросы на нестабильный файл |
| «Запускается с начала» после паузы | v0.89.11 | `<video>` перезапускается на потере источника |
| Видео ломается после «Очистить кеш» | давно | `optimizeStorage` удаляет TDLib-файлы |

#### Что подтверждает решение

1. **TDLib официальная документация**: `path` нестабилен до `is_downloading_completed=true`
2. **Логи пользователя**: 50+ ENOENT именно на `pending/files/temp/2767` (15 мая 18:17:55-57)
3. **Telegram Web K / Desktop**: тоже не дают плееру прямой путь, проксируют через `readFilePart` (у нас простая альтернатива — копия в свою папку)
4. **Запись в [.memory-bank/mistakes/tdlib-video-player.md](mistakes/tdlib-video-player.md)** — добавлены ловушки #8 и #9, итого 9 ловушек в серии v0.89.6–v0.89.15

#### Чего НЕ делаем (и почему)

- ❌ Не используем `readFilePart` стриминг через cc-media — у нас локальный диск, проще скопировать
- ❌ Не возвращаем progressive playback с обновлением URL на лету — Chromium `<video>` теряет позицию при смене `src`
- ❌ Не оставляем kind=`tdlib` в ccMediaProtocol «на всякий случай» — это была подпорка, скрывавшая баг

---

### v0.89.14 — Перемотка работает: убран Cache-Control: 'no-store' + temp/ файлы стабилизированы

**Контекст**: после v0.89.13 (откат сломанного clamp) пользователь сообщил две оставшиеся проблемы:
1. «no video file» при попытке открыть видео
2. PIPELINE_ERROR_DECODE на некоторых видео + перемотка не работает

После v0.89.13 я добавил логирование renderer-событий в файл `chatcenter.log`. **Проанализировал логи сам** (по факту из файла), нашёл точную причину.

#### Корневая причина #1: Cache-Control: 'no-store' в cc-media handler

В v0.89.8 при manual Range support добавил заголовок `Cache-Control: 'no-store'` к 206/200 ответам. Думал что для прогрессивного воспроизведения это нужно (плеер должен всегда читать свежие данные).

**Факты из логов** (`chatcenter.log` от 16:46:58–16:47:14):

```
seeking to=11.1 buffered=[0.0-14.0] readyState=1
canplay
seeking to=0.0  buffered=[0.0-14.0] readyState=1
canplay
... (60+ таких циклов за 5 секунд) ...
[ERROR] <video> error: code=3 PIPELINE_ERROR_DECODE
        readyState=4 currentTime=2.2 duration=14.0
```

Парадокс: `buffered=[0.0-14.0]` (весь файл в буфере), но `readyState=1` (HAVE_METADATA — данных для декодирования нет).

`Cache-Control: 'no-store'` запрещает Chromium кешировать Range ответы. При каждом seek плеер делает **новый Range запрос** вместо использования кеша. Через 60+ повторных запросов decoder не успевает собрать поток → PIPELINE_ERROR_DECODE.

**Исправление** ([`ccMediaProtocol.js`](main/native/ccMediaProtocol.js)): убрал `Cache-Control: 'no-store'` из обоих ответов (206 Partial Content и 200 OK). Теперь Chromium сам решает как кешировать — стандартное поведение HTTP сервера.

#### Корневая причина #2: TDLib `temp/` файлы нестабильны

Видео `2694.mp4` лежал в `tdlib-sessions/pending/files/temp/`. URL: `cc-media://tdlib/pending/files/temp/2694`. Иногда «no video file» (404 от cc-media handler).

TDLib хранит специально-обработанные видео (edits, conversions, прочее) в **`temp/` директории**. Файлы там нестабильны — TDLib может их удалить или перезаписать в любой момент.

**Исправление** ([`tdlibMedia.js#stabilizeTempFile`](main/native/backends/tdlibMedia.js)): новый helper копирует файл из `tdlib-sessions/.../files/temp/` в **стабильный** `userData/tg-media/<baseName>_<size>.<ext>`. Возвращает `cc-media://media/...` URL.

Применён в [`backend.media.download`](main/native/backends/tdlibBackend.js) и `downloadVideo` — после успешной загрузки `r.file.local.path` проверяется на `temp/`. Если да — копируется в стабильное место. UI получает URL который TDLib не достанет.

Ключ для имени файла — `<baseName>_<size><ext>`: если TDLib переоткрывает тот же файл с тем же размером, переиспользуем копию (не дублируем диск). Размер изменился — копируем заново.

#### Поведение

| До v0.89.14 | После v0.89.14 |
|---|---|
| Перемотка не работает после полной загрузки (60+ seek циклов → decoder ломается) | Перемотка работает мгновенно — кеш Chromium держит Range данные |
| «no video file» когда TDLib удалил temp файл | Стабильная копия в `tg-media/` — TDLib не трогает |
| PIPELINE_ERROR_DECODE из-за повторных запросов | Decoder получает данные один раз, собирает поток |

#### Документация (найдена в процессе)

- [MDN Cache-Control: no-store](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control) — «The no-store response directive indicates that any caches of any kind should NOT store this response»
- [WHATWG HTML `buffered`](https://html.spec.whatwg.org/multipage/media.html#dom-media-buffered) — «ranges of the media resource that the user agent has buffered»
- [TDLib File types](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1file_type.html) — `temp/` для file_type_secret, file_type_temp и других нестабильных

Стандартные HTTP video серверы (nginx mp4 module, S3 presigned URLs) **никогда** не используют `no-store` для медиа. Это моя ошибка — нашёл по фактам из логов после v0.89.13 диагностики.

#### Тесты

546/546 vitest зелёные. Lint OK. Размеры под лимитом.

**Версия**: v0.89.13 → v0.89.14 (patch — устранение настоящей причины перемотки и temp/ файлов).

⚠ **Что проверить пользователю**:
1. Открыть видео которое раньше зависало на перемотке → должно перематываться мгновенно
2. Видео которое выдавало «no video file» → должно открываться (файл копируется в tg-media)
3. PIPELINE_ERROR_DECODE на edit.mp4 и подобных → должно либо играть, либо хотя бы не зависать в loop

---

### v0.89.13 — Откат сломанного onSeeking clamp + кнопок (вернули нормальную перемотку)

**Контекст**: пользователь сообщил что после полной загрузки видео НЕ перематывается. И сообщил критику: «ходишь по кругу», «не нужны кнопки».

**Корневая причина** (моя ошибка в v0.89.10):

В v0.89.10 я добавил `onSeeking` handler:
```js
const buf = e.target.buffered
let maxBuffered = 0
for (let i = 0; i < buf.length; i++) maxBuffered = Math.max(maxBuffered, buf.end(i))
if (e.target.currentTime > maxBuffered - 0.5) {
  e.target.currentTime = maxBuffered - 0.5  // ← сбрасывает seek
}
```

**Ошибка в моей логике**: `HTMLMediaElement.buffered` — это **НЕ «что скачано на диск»**. Это **«что плеер уже прочитал в память»**. Цитата [WHATWG HTML spec](https://html.spec.whatwg.org/multipage/media.html#dom-media-buffered):
> «ranges of the media resource that the user agent has buffered»

Даже когда файл **полностью на диске** (`is_downloading_completed=true`), `<video>.buffered` содержит только то что плеер **уже прочитал**. Если юзер посмотрел 20 сек, `buffered` ≈ 0-25 сек. Тык в конец полоски → `target > 25` → мой clamp возвращает в 25 → видео не перематывается.

**Снесённое в v0.89.13**:

[`VideoTile.jsx`](src/native/components/VideoTile.jsx):
1. ❌ `onSeeking` clamp handler — главный виновник
2. ❌ Кнопка «🔄 Перезапустить» (v0.89.12)
3. ❌ Кнопка «🎬 Открыть в плеере» из inline error (v0.89.11)
4. ❌ `key={playAttempt}` атрибут и state `playAttempt`
5. ❌ Helpers `handleRetry`, `handleOpenFullPlayer`
6. ❌ Error UI block в playing-state

**Сохранено** (рабочие фиксы):
- ✅ Range support в cc-media protocol (v0.89.8) — Manual Range parsing с `Readable.toWeb`
- ✅ Progressive playback для streamable (v0.89.9) — `supports_streaming` флаг
- ✅ Индикатор «Загрузка X%» (v0.89.10) — информативный, не блокирует
- ✅ Диагностические `console.log` в VideoTile/cc-media/downloadVideo (v0.89.10) — для отладки

**Открытая проблема — PIPELINE_ERROR_DECODE на части видео**:

Пользователь сообщил что у некоторых файлов (например `edit.mp4`) выдаётся `PipelineStatus::PIPELINE_ERROR_DECODE`. ВАЖНО: эти видео **играют в обычном Telegram клиенте**, значит файл нормальный.

Разница архитектур:
- **Telegram Desktop** — Qt `QMediaPlayer` с локальным файловым доступом, без HTTP/Range
- **Мы** — Chromium `<video src="cc-media://...">` с Range запросами на каждый seek

Гипотеза: при seek Chromium делает Range запрос на произвольный byte offset. MP4 это не линейный поток — Chromium должен найти ближайший keyframe. На некоторых файлах (особенно отредактированных) этот процесс может фейлиться.

**План для следующих версий**:
1. Дождаться логов Console (Ctrl+Shift+I) при PIPELINE_ERROR_DECODE — точные offset'ы при seek
2. Изучить какие именно Range запросы делает Chromium
3. Возможно: добавить **MP4 keyframe-aware Range handling** в cc-media protocol — сейчас отдаём байты ровно с запрошенного offset

**Версия**: v0.89.12 → v0.89.13 (patch — откат сломанного).

**Что юзеру проверить**:
1. Открыть **уже скачанное** видео → пощёлкать по полоске в разных местах → перемотка должна работать (отскоков нет)
2. Перемотка во время загрузки — может пауза на буферизацию (стандарт `<video>`), но НЕ должно «не давать перематывать»
3. Если видео не играет вообще — отправить содержимое Console (Ctrl+Shift+I → Console) с строками `[VideoTile]` и `[cc-media]`

---

### v0.89.12 — Inline retry для MEDIA_ERR_DECODE (восстановление без открытия окна)

**Контекст**: пользователь увидел ошибку код 3 (PIPELINE_ERROR_DECODE) на видео `edit.mp4` которое играло 22 сек из 68 перед падением decoder'а. URL: `cc-media://tdlib/pending/files/temp/2270...mp4`.

**Это не код 4** (codec not supported из v0.89.8). Код 3 = decoder начал работать, потом упал на конкретном кадре (часто splice/cut точка в отредактированном видео).

Файл в директории `temp/` — особенность TDLib для специально-обработанных видео (не баг наш, файл доступен).

#### Что пользователь просил

«Дай вариант смотреть видео **без открытия в отдельном окне**».

В v0.89.11 кнопка «🎬 Открыть в плеере» открывала отдельное окно. Это **fallback**, не основной путь восстановления.

#### Что сделано (по MDN документации)

[MDN MediaError](https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code) описывает MEDIA_ERR_DECODE как «error during decoding after media was determined playable». Стандартное восстановление — **пересоздать `<video>` элемент** с новым decoder instance.

[`VideoTile.jsx`](src/native/components/VideoTile.jsx):
1. Новый state `playAttempt` (счётчик попыток воспроизведения)
2. `<video key={playAttempt}>` — React при инкременте key полностью **перемонтирует** элемент → новый decoder instance
3. Новый handler `handleRetry`: сбрасывает error + инкрементит playAttempt
4. В error UI — **две** кнопки:
   - **🔄 Перезапустить** (основной путь, синяя — accent color) — inline восстановление без открытия окна
   - **🎬 Открыть в плеере** (вторичная, серая) — fallback если retry не помогло

#### Почему работает

PIPELINE_ERROR_DECODE часто вызван:
- B-frame referencing missed data (если decoder пропустил ключевой кадр)
- Variable framerate edge case
- Hardware decoder hiccup на конкретной последовательности

Новый decoder instance:
- Не знает о предыдущих фреймах
- Начинает с чистого state
- Может обработать те же байты иначе (особенно при HW→SW decoder fallback)

Если проблема **persistent** (битый файл целиком) — retry не поможет, юзер увидит ту же ошибку и нажмёт «Открыть в плеере» (отдельное окно → если там тоже codec error → кнопка «Открыть во внешнем плеере» VLC/Movies&TV).

#### Документация

- [MDN HTMLMediaElement.error](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/error) — описание MediaError
- [Chromium PipelineStatus codes](https://source.chromium.org/chromium/chromium/src/+/main:media/base/pipeline_status.h) — PIPELINE_ERROR_DECODE constant

#### Поведение

| До v0.89.12 | После v0.89.12 |
|---|---|
| Ошибка декодера → 2 опции (отдельное окно или ничего) | Главная кнопка «Перезапустить» решает большинство случаев inline |
| Юзер пугался открытию отдельного окна для каждого глитча | Один клик в чате — продолжаем смотреть |

#### Тесты

546/546 vitest зелёные. Lint OK. Lim sizes OK.

**Версия**: v0.89.11 → v0.89.12 (patch — UX-фикс).

⚠ **Что проверить пользователю**:
1. Открыть видео `edit.mp4` (или другое с PIPELINE_ERROR_DECODE) → видеть «⚠️ Не удалось воспроизвести» + 2 кнопки
2. Нажать «🔄 Перезапустить» → видео должно начать сначала с новым decoder. В большинстве случаев заиграет
3. Если retry не помог → нажать «🎬 Открыть в плеере» → отдельное окно → если там тоже ошибка → кнопка «Открыть во внешнем плеере» (VLC)

---

### v0.89.11 — Видео: видимая ошибка в инлайн-плеере вместо чёрного 0:00

**Контекст**: после v0.89.10 пользователь сравнил два видео в одном чате:
- Видео 1 («Работать HR в Махачкале») — чёрный экран 0:00, ничего не показывает
- Видео 2 («Фанатам сериалов») — играет нормально (0:40/0:42)

Backend пайплайн работает (видео 2 играет). Проблема **в конкретном файле** — codec не поддерживается Chromium.

#### Что было не так

В v0.89.10 я добавил `onError` handler на `<video>`: при codec-ошибке вызывался `setError(...)`. Но в **состоянии playing** UI **не показывал** этот error — только рендерил `<video>` элемент. `<video>` с битым codec'ом показывал 0:00 чёрный экран.

Юзер видел чёрный квадрат с таймером 0:00 и **не понимал** что произошло. В отдельном окне плеера (`video-player.html`) — error UI с кнопкой «Открыть во внешнем» был с v0.89.8. В инлайн-плеере **отсутствовал**.

#### Что исправлено

[`VideoTile.jsx`](src/native/components/VideoTile.jsx) — если в playing-state `error` выставлен, рендерим **error block** вместо `<video>`:

```
⚠️ Не удалось воспроизвести видео
[конкретный текст ошибки]
[ 🎬 Открыть в плеере ]   ← кнопка
```

Кнопка зовёт IPC `video:open` (новое окно) — там уже работает codec-error UI с кнопкой «Открыть во внешнем плеере» (VLC/Movies&TV через `shell.openPath` — добавлено в v0.89.8).

Также добавлен helper `handleOpenFullPlayer` (без `startTime` параметра — открываем сначала).

#### Поведение

| До v0.89.11 | После v0.89.11 |
|---|---|
| Codec не поддерживается → чёрный 0:00 без ошибки | Видимое сообщение «Не удалось воспроизвести» + кнопка |
| Юзер не знает что делать | Кнопка «Открыть в плеере» → отдельное окно с фолбэком на внешний плеер |

#### Версия

v0.89.10 → v0.89.11 (patch — UX-фикс).

**Тестов**: 546/546 зелёные. Lint OK. Размеры под лимитом.

⚠ **Что проверить пользователю**:
1. Открыть «битое» видео которое раньше показывало 0:00 → теперь должно появиться сообщение «Не удалось воспроизвести видео»
2. Нажать «🎬 Открыть в плеере» → откроется отдельное окно. Там либо видео заиграет, либо появится кнопка «Открыть во внешнем плеере» (VLC/Movies & TV)

ℹ Логи диагностики из v0.89.10 остаются — в DevTools Console при ошибке будет `[VideoTile] <video> error:` с кодом и сообщением. По этим строкам понятно какой codec проблемный.

---

### v0.89.10 — Видео: блок перемотки за пределы буфера + индикатор загрузки

**Контекст**: после v0.89.9 пользователь подтвердил что видео заработало ✅. Но всплыла новая проблема: при попытке перемотать далеко вперёд (на момент которого ещё не докачался файл) — `<video>` **зависает**. Также непонятно сколько уже скачано.

#### Что исправлено

**1. Блок перемотки за пределы буфера** ([`VideoTile.jsx`](src/native/components/VideoTile.jsx))

HTML5 `<video>` имеет свойство `buffered` (TimeRanges загруженных интервалов). Раньше при попытке seek за пределы — плеер пытался читать байты которых нет → зависал. Теперь `onSeeking` handler проверяет:

```js
const buf = e.target.buffered
let maxBuffered = 0
for (let i = 0; i < buf.length; i++) maxBuffered = Math.max(maxBuffered, buf.end(i))
const safeMax = Math.max(0, maxBuffered - 0.5)  // запас 0.5s от stall'а на самом краю
if (e.target.currentTime > safeMax) {
  e.target.currentTime = safeMax  // снэп обратно
}
```

Если буфер пуст и юзер пытается seek больше чем на 0.1s от начала — возвращаем в 0.

**2. Индикатор «Загрузка X%» в углу видео** ([`VideoTile.jsx`](src/native/components/VideoTile.jsx))

Backend.media.downloadVideo с v0.89.9 возвращает `{ ok, path, partial }`. Раньше UI игнорировал `partial`. Теперь:
- Новый state `partial` в VideoTile
- Если `partial: true` (streamable видео, скачивается в фоне) — слушатель `tg:media-progress` остаётся активным даже когда `downloading=false`
- В углу видео (top-left) появляется бейдж: мигающая точка + «Загрузка X%»
- Тонкая полоска внизу видео (2px) показывает прогресс скачивания (отдельно от стандартного buffered tracker)
- Когда `progress >= 1` → флаг `partial` снимается, индикаторы исчезают

**3. CSS-анимация `native-pulse`** ([`styles-animations.css`](src/native/styles-animations.css))

Добавлен keyframe для мигающей точки в индикаторе.

#### Диагностические логи (v0.89.10 — оставлены)

В предыдущей сессии добавил console.log для отладки чёрного экрана 0:00 (v0.89.10 commit с diagnostic):
- `[downloadVideo] req/result` — параметры видео + результат
- `[cc-media] video req` — каждый запрос видео в protocol handler
- `[VideoTile] <video> loadstart/loadedmetadata/canplay/stalled/error` — события плеера

Они остаются (не мешают, помогают будущей отладке).

#### Поведение

| До v0.89.10 | После v0.89.10 |
|---|---|
| Юзер тыкает в полоску за пределы скачанного → `<video>` зависает | Перемотка возвращается к концу буфера, видео продолжает играть |
| Непонятно сколько скачано | Видны индикатор «Загрузка X%» + тонкая полоска прогресса |

#### Тесты

Без изменений (UI handlers просты, существующие vitest не трогаем). **Тестов**: 546/546 зелёные.

**Версия**: v0.89.9 → v0.89.10.

⚠ **Что проверить пользователю**:
1. Открыть большое видео которое только начало скачиваться → попробовать перемотать в самый конец → не должно зависать, плеер вернётся к концу скачанного
2. В углу видео сверху-слева должен появиться бейдж «Загрузка X%» с мигающей точкой
3. Тонкая полоска снизу видео показывает докуда докачано
4. Когда видео скачано полностью (100%) — бейдж и полоска исчезают, перемотка работает свободно

---

### v0.89.9 — Фикс progressive playback (чёрный экран 0:00) по TDLib supports_streaming

**Контекст**: после v0.89.8 пользователь увидел чёрный экран и таймер `0:00` при попытке открыть видео (скриншот: видео-плеер виден, контролы тоже, но контента нет, длительность 0:00).

#### Корневая причина (из официальной документации TDLib)

В TDLib каждое видео имеет поле `video.supports_streaming` ([документация](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1video.html)) — "True, if the video is expected to be streamed". Это говорит можно ли начинать воспроизведение когда скачана только часть файла.

**Технически**: для MP4 файлов с moov atom в начале (faststart layout, обычно через ffmpeg `-movflags +faststart`) — `supports_streaming = true`. Player может прочитать metadata (длительность, размер) из первых килобайт и начать играть, пока остальное докачивается.

Для MP4 файлов с moov atom в конце (default mobile encoders — большинство мобильных загрузок) — `supports_streaming = false`. Без moov atom `<video>` element не может определить длительность → показывает `0:00` → пустой экран.

**Ошибка v0.89.8**: `downloadFile` резолвился при `downloaded_prefix_size >= 256 KB` для ВСЕХ видео, без проверки флага. Для non-streamable видео — 256 KB префикса не содержит moov atom → `<video>` беспомощен.

#### Исправление по документации

[`tdlibMedia.downloadFile`](main/native/backends/tdlibMedia.js) — добавлен опциональный параметр `progressive: boolean` (default `false`):
- `progressive: false` (default) — ждём `is_downloading_completed: true` (безопасно для любого видео)
- `progressive: true` — резолвим early при `downloaded_prefix_size >= 256 KB` (только если caller подтвердил streamable)

[`tdlibBackend.media.downloadVideo`](main/native/backends/tdlibBackend.js) — читает `tdMsg.content.video.supports_streaming` из TDLib message и передаёт в `downloadFile`:

```js
const progressive = !!tdMsg?.content?.video?.supports_streaming
return downloadFile({ ..., progressive })
```

Для photos и других медиа — без изменений (всегда полная загрузка, они и так быстро).

#### Тесты (4 переписаны под opt-in поведение)

[`tdlibMedia.vitest.js`](src/__tests__/tdlibMedia.vitest.js) — describe «downloadFile progressive playback (v0.89.9 — opt-in)»:
- `progressive: true` + prefix>=256KB → early resolve с `partial: true`
- `progressive: false` (default) + prefix>=256KB → НЕ resolve early (ждёт completed)
- completed всегда resolve с `partial: false` (даже без progressive)
- `progressive: true` но prefix<256KB → НЕ resolve early

**Тестов**: 545 → 546.

**Версия**: v0.89.8 → v0.89.9.

**Проверено**:
```powershell
npm run lint                                                  # OK
node src/__tests__/fileSizeLimits.test.cjs                     # 244/244
npm run test:vitest                                            # 546/546 (38 файлов)
```

⚠ Что увидит пользователь: видео из скриншота (Aliexpress «Маска для волос с кератином») теперь будет скачиваться полностью перед открытием — не покажет чёрный экран. Streamable видео (отмеченные TDLib) продолжат играть пока качаются.

---

### v0.89.8 — Seek + progressive playback + codec error UX

**Контекст**: после v0.89.7 пользователь визуально подтвердил что фото и видео грузятся через cc-media://tdlib URL ✅. Но обнаружились ещё проблемы:

1. **Перемотка не работает** на полностью скачанных видео (скриншот 1: видео играет 0:05/0:30, но клик по прогресс-бару не сидает)
2. **Хочется смотреть пока грузится** + полная перемотка после загрузки
3. **Некоторые видео всё ещё падают**: `DECODER_ERROR_NOT_SUPPORTED: kUnsupportedConfig` (из лога video-player.html) — реальный codec issue (HEVC/H.265, AV1)

#### Фикс #1 — Manual Range support в cc-media protocol

Корневая причина seek bug: [`ccMediaProtocol.js`](main/native/ccMediaProtocol.js) до v0.89.8 использовал `net.fetch(pathToFileURL(filePath).href, { headers: req.headers })`. В текущей версии Electron `net.fetch` для `file://` URL **не пробрасывает Range header** корректно → response без `Accept-Ranges` + `Content-Range` headers → `<video>` не знает что можно сидать.

**Решение**: ручная обработка Range request. Парсим `Range: bytes=START-END`, делаем `fs.createReadStream(filePath, { start, end })`, конвертируем Node stream в Web ReadableStream через `Readable.toWeb(stream)`, возвращаем 206 Partial Content с правильными headers:
- `Content-Type: <mime>`
- `Content-Length: <chunk size>`
- `Content-Range: bytes START-END/TOTAL`
- `Accept-Ranges: bytes`

Для запросов без Range — возвращаем 200 OK с `Accept-Ranges: bytes` (чтобы player знал что поддерживается seek для последующих запросов).

#### Фикс #2 — Progressive playback (смотреть пока грузится)

[`tdlibMedia.js#downloadFile`](main/native/backends/tdlibMedia.js) — раньше резолвился только когда `is_downloading_completed: true`. Теперь резолвится **early** когда `downloaded_prefix_size >= 256 KB` (достаточно для MP4 metadata + первых секунд H.264). 

Поток:
1. UI зовёт `tg:download-video`
2. TDLib стартует фоновое скачивание, шлёт `updateFile` events
3. Backend резолвит как только префикс ≥ 256 KB → UI получает `{ ok: true, path: 'cc-media://tdlib/...', partial: true }`
4. UI открывает video-player с этим URL — `<video>` начинает играть
5. TDLib продолжает скачивать в фоне, файл растёт на диске
6. cc-media protocol handler читает `fs.statSync(filePath).size` динамически — Range запросы получают актуальные байты
7. Юзер играет с начала → нормально. Сидает за пределы скачанного → стандартный buffer wait
8. После завершения скачивания — full seek работает

#### Фикс #3 — Codec error UX (HEVC/AV1)

Для codec'ов которые Chromium не может декодировать (HEVC/H.265 без HW-acceleration, AV1, некоторые экзотические профили) — раньше показывалась техническая ошибка `MediaError code 4: DECODER_ERROR_NOT_SUPPORTED`. Сейчас:

- [`video-player.html`](main/video-player.html) при `MediaError.code === 4` или сообщении с `DECODER`/`kUnsupportedConfig` → рендерит дружелюбное UI:
  - «⚠️ Этот формат видео не поддерживается»
  - «Chromium не может декодировать этот codec (вероятно HEVC/H.265 или AV1)»
  - 🎬 Кнопка «Открыть во внешнем плеере»

- Новый IPC `video:open-external` ([`videoPlayerHandler.js`](main/handlers/videoPlayerHandler.js)) — конвертирует `cc-media://` URL в OS path, зовёт `shell.openPath` → Windows откроет в default video приложении (VLC если установлен, иначе Movies & TV).

- Новый exposed API: `window.video.openExternal(ccMediaUrl)` ([`videoPlayer.preload.cjs`](main/preloads/videoPlayer.preload.cjs)).

#### Тесты

- `tdlibMedia.vitest.js` (4 новых теста для progressive playback): резолв при prefix_size >= 256 KB с partial:true, НЕ резолв при < 256 KB, completed = partial:false.
- Существующие 6 тестов для `tdlibPathToCcMediaUrl` сохранены.

**Тестов**: 544 → 545.

**Версия**: v0.89.7 → v0.89.8 (patch — UX fixes).

**Проверено**:

```powershell
npm run lint                                                  # OK
node src/__tests__/fileSizeLimits.test.cjs                     # 244/244
npm run test:vitest                                            # 545/545 (38 файлов)
```

⚠ **Что проверить пользователю**:
1. Открыть чат с уже-загруженным видео → нажать на середину прогресс-бара → должно сидать (раньше зависало на буферизации)
2. Открыть чат с **большим** не-скачанным видео → клик «Открыть» → должно начать играть через 1-2 сек (раньше ждали полной загрузки)
3. Если видео в HEVC/неподдерживаемом codec — увидеть кнопку «🎬 Открыть во внешнем плеере» → нажать → Windows откроет в VLC

---

### v0.89.7 — Фото/видео в сообщениях через cc-media:// (production bug из лога)

**Контекст**: после v0.89.6 пользователь подтвердил визуально что аватарки и имя аккаунта работают (зафиксировано на скриншоте). Но обнаружились **2 новые проблемы**:

1. **Фото в сообщениях не отображаются** — пустые/мутные превью (скриншот)
2. **Видео падает с decoder error** — лог:
   ```
   [ERROR] [video-window] [video-player] error: 4 PipelineStatus::DECODER_ERROR_NOT_SUPPORTED:
   video decoder initialization failed with DecoderStatus::Codes::kUnsupportedConfig
   file:///C:/Users/.../tdlib-sessions/pending/files/videos/WAIFF_1.mp4
   ```

#### Корневая причина (из лога — пользователь попросил «прочитай лог обязательно»)

[`backend.media.download`](main/native/backends/tdlibBackend.js) возвращал **raw TDLib path** (например `C:\Users\Директор\AppData\Roaming\ЦентрЧатов\tdlib-sessions\pending\files\videos\WAIFF_1.mp4`). UI [`video-player.html`](main/video-player.html) загружал через `file:///` URL.

Сравнение с GramJS-эрой ([`main/native/ccMediaProtocol.js:50-51`](main/native/ccMediaProtocol.js)):
- GramJS копировал медиа в `userData/tg-media/` → URL `cc-media://media/X.jpg`
- TDLib хранил в `tdlib-sessions/.../files/...` → UI получал raw path → `file:///`

Разница в **privileges**: `cc-media://` зарегистрирован с `supportFetchAPI: true, bypassCSP: true, stream: true` (для Range-запросов в `<video>`). `file:///` URLs не имеют этих privileges → Chromium decoder отказывается инициализировать некоторые codec configs (особенно для streamed MP4 + video с custom decoder requirements). UI тесты [`MediaAlbum.vitest.jsx:125`](src/native/components/MediaAlbum.vitest.jsx), [`VideoTile.vitest.jsx:13-16`](src/native/components/VideoTile.vitest.jsx) подтверждают: UI ждёт `cc-media://media/X.jpg` / `cc-media://video/X.mp4` URL, не raw path.

#### Решение — расширить cc-media:// handler + конвертер path

[`ccMediaProtocol.js`](main/native/ccMediaProtocol.js) — новый kind `tdlib`:
```js
: kind === 'tdlib' ? path.join(userData, 'tdlib-sessions')
```
URL формат: `cc-media://tdlib/{accountSubdir}/files/{kind}/{filename}` → resolves в `userData/tdlib-sessions/{accountSubdir}/files/{kind}/{filename}` через `net.fetch('file://...')` с Range support.

[`tdlibMedia.js`](main/native/backends/tdlibMedia.js) — новый helper `tdlibPathToCcMediaUrl(absPath)`:
- Ищет `tdlib-sessions` в пути → extract relative
- Нормализует `\\` → `/`
- Возвращает `cc-media://tdlib/{relPath}` с `encodeURI` для Cyrillic
- Возвращает `null` если путь не из tdlib-sessions

[`downloadFile`](main/native/backends/tdlibMedia.js) — оба пути resolve (через invoke и через `updateFile`) теперь возвращают `cc-media://` URL вместо raw path.

[`backend.media.download`](main/native/backends/tdlibBackend.js) — cached path тоже конвертируется через `tdlibPathToCcMediaUrl`.

#### Тесты (+7)

[`tdlibMedia.vitest.js`](src/__tests__/tdlibMedia.vitest.js) — новый describe `tdlibPathToCcMediaUrl`:
- Windows path → cc-media://tdlib/...
- Linux path → cc-media://tdlib/...
- Cyrillic в пути → URL-encoded
- путь без tdlib-sessions → null
- пустой/null → null
- не-строка → null
- downloadFile резолвится с cc-media:// URL (не raw path)

**Тестов**: 537 → 544 (+7).

#### Что увидит пользователь

- ✅ Фото в сообщениях отображаются (через `cc-media://tdlib/...` с правильными privileges)
- ✅ Видео воспроизводится (`<video>` через cc-media:// с stream privileges → Range requests → decoder инициализируется)
- ✅ Cyrillic в пути userData (`%D0%A6%D0%B5%D0%BD%D1%82%D1%80%D0%A7%D0%B0%D1%82%D0%BE%D0%B2` = «ЦентрЧатов») корректно URL-encoded

⚠ Известное ограничение: если в самом видео используется codec не поддерживаемый Chromium (HEVC/H.265 без hardware acceleration, AV1) — decoder всё равно может упасть. Это TDLib скачивает оригинальный файл, Telegram-серверы обычно транскодируют в H.264, но не для всех случаев (например при «отправить как файл»).

**Версия**: v0.89.6 → v0.89.7 (patch — production bug fix).

**Проверено**:

```powershell
npm run lint                                                  # OK
node src/__tests__/fileSizeLimits.test.cjs                     # 244/244
node src/__tests__/messengerBackend.test.cjs                   # 61/61
npm run test:vitest                                            # 544/544 (38 файлов)
```

---

### v0.89.6 — Snapshot caches: фикс «Без имени» + отсутствующих аватарок (production bug)

**Контекст**: после релиза v0.89.5 (4-й аудит) пользователь визуально проверил приложение — увидел реальную regression: «Без имени» в AccountContextMenu, ВСЕ чаты без аватарок (только инициалы), отправители в групповых чатах без аватарок. Скриншоты сделал, отправил.

#### Корневая причина (та же категория что в GramJS-эру — [archive/features-v0.87.93-105.md:370](.memory-bank/archive/features-v0.87.93-105.md))

Backend получал name/phone/avatar через TDLib events и эмитил соответствующие renderer events (`tg:account-update`, `tg:chat-avatar`, `tg:sender-avatar`). НО snapshot API-handlers (`tg:get-accounts`, `tg:get-chats`, `tg:get-messages`) **не возвращали эти данные**.

Возникал race condition: на старте `autoRestoreSessionsFromDisk` → `finalizeAccount` → `scheduleAvatarDownload` запускаются ВО ВРЕМЯ инициализации backend, **до** монтирования React-компонентов. Когда UI наконец-то подписывался на события через `nativeStoreIpc.js`, события уже были эмитированы — терялись навсегда. Затем UI запрашивал `tg:get-accounts`/`get-chats`, но snapshot возвращал только примитивные поля (id/status/title) — без name/phone/avatar.

Конкретные пробелы:
- [`tdlibClient.js#getAccountChats`](main/native/backends/tdlibClient.js) — `mapChat(tdChat, accountId)` без `extras.avatar` → все чаты возвращались с `avatar: null`
- [`tdlibBackend.js#makeExtras.getSenderAvatar`](main/native/backends/tdlibBackend.js) — **захардкожен `return null`** (TODO с Этапа 2.6, никогда не закрыт) → `senderAvatar` в `mapMessage` всегда null
- [`tdlibIpcHandlers.js#tg:get-accounts`](main/native/tdlibIpcHandlers.js) — возвращал только `{id, messenger, status}` (после фикса #7 v0.89.4) → `name/phone/avatar` УЖЕ были известны backend'у в `record.userCache`, но не возвращались

#### Решение — snapshot caches per record

Добавлены 3 новых поля в `record` ([`tdlibClient.js`](main/native/backends/tdlibClient.js)):
- `chatAvatars: Map<chatId, url>` — cc-media:// URL для каждого чата
- `userAvatars: Map<userId, url>` — cc-media:// URL для каждого пользователя
- `ownUserId: number` — выставляется в `finalizeAccount` после `getMe`

**`emitAvatarReady`** ([`tdlibAvatars.js`](main/native/backends/tdlibAvatars.js)) — теперь сохраняет URL в соответствующий cache ДО `manager.emit`. Если это **own avatar** (kind=user + ownerId===ownUserId) — дополнительно эмитит `account:update {id, avatar}` чтобы AccountContextMenu обновился.

**`getAccountChats`** — читает `record.chatAvatars.get(chatId)` и передаёт в `mapChat({avatar})`. Снапшот теперь содержит avatar URL для чатов с уже скачанными аватарками.

**`makeExtras.getSenderAvatar`** — читает `record.userAvatars.get(userId)` для `messageSenderUser` и `record.chatAvatars.get(chat_id)` для `messageSenderChat`. Теперь `mapMessage` возвращает `senderAvatar` сразу при `tg:get-messages` snapshot — не приходится ждать события.

**`tg:get-accounts`** handler — теперь читает `record.userCache.get(ownUserId)` (там лежит `me` объект после `finalizeAccount`) + `record.userAvatars.get(ownUserId)`. Формирует `displayName = fullName || @username || phone || Telegram ${userId}` (тот же fallback что в `finalizeAccount`). Возвращает `{id, messenger, status, name, phone, username, userId, avatar?}`.

#### Тесты (+6)

[`tdlibEmitContracts.vitest.js`](src/__tests__/tdlibEmitContracts.vitest.js):
- После `finalize` `tg:get-accounts` возвращает name/phone/username/userId
- После avatar download — avatar в snapshot
- `emitAvatarReady (chat) → record.chatAvatars`
- `getAccountChats` читает chatAvatars в snapshot
- `getSenderAvatar` читает userAvatars (регрессия для hardcoded null)
- Own avatar → `account:update {avatar}` (для AccountContextMenu)

**Тестов**: 531 → 537 (+6).

#### Что увидит пользователь

При запуске приложения (visual проверка):
- ✅ В AccountContextMenu — реальное имя (Иван Петров) и телефон вместо «Без имени» и «?»
- ✅ Аватарки чатов в списке (по факту скачанные TDLib)
- ✅ Аватарки отправителей в групповых чатах (мини-кружочки слева от сообщений)
- ✅ Аватарки в Settings → Active Sessions с правильным application_version (v0.89.6) — для НОВЫХ логинов. Для существующих сессий — `device_model` останется тем что было записано при первом login (ограничение TDLib).

**Версия**: v0.89.5 → v0.89.6 (patch — функциональный bug fix для production).

**Проверено**:

```powershell
npm run lint                                                  # OK
node src/__tests__/fileSizeLimits.test.cjs                     # 244/244
node src/__tests__/messengerBackend.test.cjs                   # 61/61
npm run test:vitest                                            # 537/537 (38 файлов)
```

⚠ **Visual повторная проверка обязательна**: открыть приложение → проверить что (1) аккаунт в sidebar показывает имя и аватарку, (2) аватарки чатов в Inbox-режиме видны, (3) в групповых чатах рядом с сообщениями отправителей мини-аватарки.

---

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
