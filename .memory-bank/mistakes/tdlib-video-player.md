# Ловушки TDLib медиа + HTML5 video player

Серия ошибок v0.89.6 → v0.89.16 — миграция медиа-пайплайна с GramJS на TDLib + воспроизведение видео через Chromium `<video>` + постеры. Записано чтобы **не повторять**.

## ✅ СТАТУС: СЕРИЯ ЗАКРЫТА (v0.89.15 — воспроизведение, v0.89.16 — постеры)

**Итоговое архитектурное решение**: НИ ОДИН файл TDLib плеер напрямую не читает. Любой скачанный файл копируется в `userData/tg-media/<fileId>_<size>.<ext>` и плеер получает только `cc-media://media/...`. См. ловушки #8, #9.

## 📋 Сводка всех 10 ловушек серии

| # | Ловушка | Версия добавления | Версия фикса | Корневая причина |
|---|---|---|---|---|
| 1 | Clamp seek по `<video>.buffered` | v0.89.10 | v0.89.13 | Думал, что `buffered` = «на диске». Это память плеера |
| 2 | `downloaded_prefix_size` для всех видео | v0.89.8 | v0.89.9 | Не проверил `supports_streaming` — non-streamable показывал 0:00 |
| 3 | `net.fetch('file://...')` для Range | v0.89.7 | v0.89.8 | Electron не пробрасывает Range через file:// |
| 4 | Raw `file:///` без cc-media privileges | v0.89.6 | v0.89.7 | Codec без `bypassCSP` не инициализируется |
| 5 | Snapshot API без кеширования | до v0.89.6 | v0.89.6 | name/avatar только через events — race при старте |
| 6 | «Защитные кнопки» поверх багов | v0.89.11/12 | v0.89.13 | Лечил симптом своего же бага вместо отката |
| 7 | Renderer logs не в файл | до v0.89.13 | v0.89.13 | DevTools Console не пишет в `chatcenter.log` |
| 8 | TDLib `temp/<N>` нестабилен | v0.89.7 | v0.89.15 | TDLib чистит temp/ при `optimizeStorage` |
| 9 | Progressive playback с unstable URL | v0.89.8 | v0.89.15 | Путь меняется при `temp→videos` — `<video>` теряет позицию |
| 10 | Параметр `thumb` в `media.download` — мёртвый код | v0.87.39 | **v0.89.16** | Backend игнорировал флаг, качал полное видео под видом постера |

## 🎯 Главные правила, выведенные из серии

1. **Никогда не отдавать `<video>` URL в TDLib-папку**. Всё через `stabilizeForPlayback()` → `tg-media/`.
2. **Не доверять предположениям про API** (`<video>.buffered`, TDLib path). Проверять документацию **перед** кодом.
3. **Логи рендерера ОБЯЗАНЫ писаться в файл** через `app:log` IPC — иначе отладка вслепую.
4. **При повторной жалобе пользователя — `git log` за 5 коммитов**: что я сам сломал? Не лепить новые кнопки.
5. **Никаких early-резолвов в `downloadFile`** — только `is_downloading_completed=true`.

---

## Ловушка #1: `HTMLMediaElement.buffered` ≠ «что скачано на диск»

**Версия**: добавил в v0.89.10, удалил в v0.89.13.

**Симптом**: после **полной загрузки** видео перемотка по полоске прогресса не работает — курсор «отскакивает» назад.

**Корневая причина**: добавил `onSeeking` handler:
```js
const buf = e.target.buffered
let maxBuffered = 0
for (let i = 0; i < buf.length; i++) maxBuffered = Math.max(maxBuffered, buf.end(i))
if (e.target.currentTime > maxBuffered - 0.5) {
  e.target.currentTime = maxBuffered - 0.5
}
```

Думал что `buffered` это «сколько на диске». **На самом деле** ([WHATWG HTML spec](https://html.spec.whatwg.org/multipage/media.html#dom-media-buffered)):
> «ranges of the media resource that the user agent has buffered»

`buffered` это **что плеер успел прочитать в память** через текущую `<video>` сессию. Даже когда файл **на 100% скачан** локально — `buffered` содержит только то что DOM-плеер прочитал во время воспроизведения. Если юзер посмотрел 20 сек, `buffered` ≈ 0-25 сек. Тык в конец полоски → мой clamp возвращает в 25 → не перематывается.

**Правило**: НЕ использовать `HTMLMediaElement.buffered` как индикатор «доступности байт». Это **внутреннее состояние плеера**, не файлсистемы.

Для индикации «не скачано» — использовать **информацию от backend** (`is_downloading_completed`, `downloaded_size`). НЕ ограничивать seek по `buffered` — Chromium сам сделает Range запрос когда нужно.

---

## Ловушка #2: TDLib `downloaded_prefix_size` ≠ «можно начинать играть»

**Версия**: добавил progressive playback в v0.89.8, починил по docs в v0.89.9.

**Симптом**: видео открывается, плеер показывает чёрный экран + `0:00` таймер.

**Корневая причина**: резолвил `downloadFile` early когда `downloaded_prefix_size >= 256 KB` для ВСЕХ видео. Думал — 256 КБ достаточно для metadata + первых секунд H.264.

**На самом деле** ([TDLib docs `video.supports_streaming`](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1video.html)):
> «True, if the video is expected to be streamed»

Если `supports_streaming === true` — MP4 имеет moov atom **в начале** файла (faststart layout). 256 КБ префикса содержат metadata → плеер знает длительность → играет.

Если `supports_streaming === false` — moov atom **в конце** (большинство мобильных загрузок). 256 КБ префикса не имеют metadata → `<video>` показывает `0:00` чёрный экран.

**Правило**: для progressive playback **ОБЯЗАТЕЛЬНО** проверять `tdMsg.content.video.supports_streaming`. Без этого поля по умолчанию `progressive: false` — ждать `is_downloading_completed: true`.

---

## Ловушка #3: `net.fetch('file://...')` не пробрасывает Range headers

**Версия**: исправил в v0.89.8.

**Симптом**: после полной загрузки видео — перемотка не работает (с `net.fetch` версией cc-media protocol).

**Корневая причина**: `net.fetch(fileUrl, { headers: req.headers })` для `file://` URL **не пробрасывает** Range header корректно в текущей версии Electron. Response без `Accept-Ranges` + `Content-Range` headers → `<video>` не знает что можно сидать.

**Правило**: для streaming custom protocol handler — **обязательно вручную** обрабатывать Range:
```js
const range = req.headers.get('range')
if (range) {
  const match = /bytes=(\d+)-(\d*)/.exec(range)
  const start = Number(match[1])
  const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1
  const stream = fs.createReadStream(filePath, { start, end })
  return new Response(Readable.toWeb(stream), {
    status: 206,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
    },
  })
}
// без Range — 200 OK но С Accept-Ranges (чтобы плеер знал что seek возможен)
return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
  status: 200,
  headers: { 'Content-Type': mime, 'Content-Length': String(total), 'Accept-Ranges': 'bytes' },
})
```

---

## Ловушка #4: cc-media protocol требуется ДЛЯ codec privileges

**Версия**: исправил в v0.89.7.

**Симптом**: видео не воспроизводится (`DECODER_ERROR_NOT_SUPPORTED: kUnsupportedConfig`), фото в сообщениях пустые.

**Корневая причина**: backend.media.download возвращал **raw OS path** (например `C:\Users\...\tdlib-sessions\pending\files\videos\X.mp4`). UI пытался загрузить через `file:///` URL.

Сравнение с GramJS-эрой ([ccMediaProtocol.js:50-51](../../main/native/ccMediaProtocol.js)):
- GramJS копировал медиа в `userData/tg-media/` → URL `cc-media://media/X.jpg`
- TDLib хранит в `tdlib-sessions/.../files/` → UI получал raw path → `file:///`

`cc-media://` зарегистрирован с privileges:
```js
{ scheme: 'cc-media', privileges: {
    standard: true, secure: true,
    supportFetchAPI: true,
    bypassCSP: true,    // ← важно для codec init
    stream: true,        // ← Range requests для <video>
}}
```

`file:///` URLs **не имеют этих privileges** → Chromium decoder без `bypassCSP` отказывается инициализировать некоторые codec configs.

**Правило**: ВСЁ медиа в renderer **ДОЛЖНО** идти через `cc-media://` scheme. Никаких исключений. Helper `tdlibPathToCcMediaUrl(absPath)` конвертирует raw TDLib path → `cc-media://tdlib/{relPath}`.

---

## Ловушка #5: Snapshot API должны возвращать кешированные данные

**Версия**: исправил в v0.89.6.

**Симптом**: AccountContextMenu показывает «Без имени», все чаты без аватарок (инициалы), отправители в группах без аватарок.

**Корневая причина**: snapshot APIs (`tg:get-accounts`, `tg:get-chats`, `tg:get-messages`) возвращали только примитивы. `name/phone/avatar` для аккаунта и `avatar` для чатов/отправителей шли **ТОЛЬКО через events** (`tg:account-update`, `tg:chat-avatar`, `tg:sender-avatar`).

На старте autoRestore → finalizeAccount → scheduleAvatarDownload запускаются **во время** инициализации backend, **ДО** mount React. Когда UI наконец-то подписывался на события — они уже эмитированы → терялись навсегда. Snapshot же отдавал пустые поля.

**Правило**: каждое snapshot API ОБЯЗАНО возвращать ВСЕ кешированные backend'ом данные. Если для какого-то поля единственный путь — event — это **багодыра**. UI должен иметь возможность получить все известные данные через snapshot.

В v0.89.6 добавлены snapshot caches per record: `chatAvatars: Map`, `userAvatars: Map`, `ownUserId: number`.

---

## Ловушка #6: «Защитные кнопки» вместо устранения корневой причины

**Версии**: v0.89.11, v0.89.12 (удалены в v0.89.13).

**Симптом**: пользователь жалуется на одно и то же. Я добавляю кнопки «Перезапустить», «Открыть в плеере» вместо устранения причины.

**Корневая ошибка**: в v0.89.10 я добавил `onSeeking` clamp (Ловушка #1) который сам и сломал перемотку. В v0.89.11 я добавил «Открыть в плеере» как фолбэк. В v0.89.12 добавил «Перезапустить». Пользователь резонно возмутился: «ходишь по кругу».

**Правило**: если пользователь повторяет одну и ту же жалобу — **не лепить кнопки-фолбэки**, а искать **что я недавно изменил** что могло вызвать regression. Сначала проверять собственные изменения через `git log` за последние коммиты. Не добавлять новые UI элементы как обходные пути своих же багов.

---

## Ловушка #7: Логи renderer не попадают в файловый журнал автоматически

**Версия**: v0.89.13.

**Симптом**: пользователь несколько раз говорил «посмотри логи» — я не мог посмотреть, потому что Renderer `console.log` доступны только через DevTools, не пишутся в `chatcenter.log`.

**Корневая причина**: `main/utils/logger.js` переопределяет `console.log/warn/error` для **main process** — пишет в файл. **Renderer process** имеет свой Console, отдельный от main.

**Решение**: IPC канал `app:log` (уже был с v0.84.2 в [`mainIpcHandlers.js:34`](../../main/handlers/mainIpcHandlers.js)):
```js
ipcMain.on('app:log', (event, { level, message }) => {
  const ts = new Date().toLocaleString('sv-SE').replace('T', ' ')
  const line = `[${ts}] [R:${level}] ${message}\n`
  fs.appendFileSync(getLogFilePath(), line)
})
```

В renderer (v0.89.13 VideoTile):
```js
function logToMain(level, message) {
  window.api?.send('app:log', { level, message: '[VideoTile] ' + message })
}
```

**Правило**: критичные события в renderer-компонентах ДОЛЖНЫ дублироваться в main-логфайл через `app:log` IPC. Префикс `[R:LEVEL]` отличает их от main-process логов в журнале.

---

## Ловушка #8: TDLib `temp/<N>` нестабилен — даже короткий промежуток между ENOENT

**Версия**: исправлено радикально в v0.89.15 (после неполных попыток v0.89.13/14).

**Симптом**: после короткой паузы (1–5 минут) или нажатия «Перезапустить» — `<video>` падает в `MEDIA_ERR_SRC_NOT_SUPPORTED`. В `chatcenter.log` десятки строк:
```
[ERROR] [cc-media] file not found: ...\tdlib-sessions\pending\files\temp\2767
err: ENOENT — no such file
```

**Корневая причина**:
- TDLib хранит файлы в процессе скачивания в `tdlib-sessions/.../pending/files/temp/<N>`
- Когда `is_downloading_completed=true`, TDLib **переименовывает** `temp/<N>` → `videos/<hash>.<ext>` (или удаляет temp если файл сразу cached)
- Даже completed файлы TDLib удаляет при чистке (`optimizeStorage` — вызывается нашим UI «Очистить кеш»)
- В v0.89.8–v0.89.14 я резолвил `downloadFile` с partial-флагом и отдавал URL вида `cc-media://tdlib/.../temp/2767`. Плеер хранил этот URL, через минуту TDLib чистил temp → ENOENT при первой же попытке seek/restart.

**По официальной TDLib документации** ([td_api::file::local::path](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1local_file.html)):
> `path` of the local file. Empty if not available, which can be the case even if `downloaded_size` is non-zero. **Can be changed remotely at any time before the file is downloaded** to the local filesystem.

То есть путь стабилен **только** после `is_downloading_completed=true`. Но даже после — наш собственный `optimizeStorage()` может его убить.

**Решение (v0.89.15)**: НИ ОДИН TDLib-файл не отдаётся плееру напрямую. Любой скачанный файл копируется в `userData/tg-media/<fileId>_<size>.<ext>`. Папка `tg-media/` — НАША, TDLib её не трогает. См. `stabilizeForPlayback()` в [tdlibMedia.js](../../main/native/backends/tdlibMedia.js).

**Правило**: для любого медиа, попадающего в `<video>`/`<img>` через `cc-media://` — **обязательно** копировать в `tg-media/` через `stabilizeForPlayback()`. Не отдавать URL `cc-media://tdlib/...` плееру (kind=`tdlib` удалён из ccMediaProtocol.js в v0.89.15).

---

## Ловушка #9: Progressive playback с unstable URL — фундаментально не работает

**Версия**: добавлено в v0.89.8, удалено в v0.89.15.

**Симптом**: видео начинает играть, перемотка вперёд иногда работает, после паузы или попытки перезапуска — `<video>` теряет позицию, скачет в 0:00 или падает в `PIPELINE_ERROR_DECODE`. После закрытия чата и возврата — `MEDIA_ERR_SRC_NOT_SUPPORTED`.

**Корневая причина**: progressive playback требует, чтобы URL источника был **стабилен на всё время воспроизведения**. У TDLib URL временный:
1. На 256 KB префикса я резолвил с URL `cc-media://tdlib/temp/<N>`
2. TDLib продолжал докачивать, файл рос — `<video>` Range-запрос на новые байты иногда получал «обрезанный» chunk
3. Когда TDLib финализировал скачивание — `temp/<N>` исчезал, появлялся `videos/<hash>.<ext>` — URL уже не валиден
4. Chromium `<video>` не умеет менять `src` без перезапуска и потери позиции

**Сравнение с тем, как работают официальные клиенты**:
- **Telegram Desktop** (C++): свой плеер через `readFilePart` API
- **Telegram Web K** (WASM): Service Worker перехватывает media requests и тоже зовёт `readFilePart`
- **Оба никогда** не дают плееру прямой путь к TDLib-файлу

У нас есть локальный диск — мы можем просто скачать и скопировать. Это и проще, и надёжнее, чем стримить через `readFilePart`.

**Правило**: `downloadFile` в [tdlibMedia.js](../../main/native/backends/tdlibMedia.js) **всегда** ждёт `is_downloading_completed=true`. Никаких early-резолвов. UX-компенсация — прогресс-спиннер на постере (уже был в [VideoTile.jsx](../../src/native/components/VideoTile.jsx) с v0.87.36).

---

## Ловушка #10: Параметр `thumb` в `tg:download-media` — мёртвый код

**Версия**: фикс v0.89.16 (баг существовал с v0.87.39).

**Симптом**: вместо чёткого постера видео виден чёрный экран или только размытый minithumbnail. На скриншоте пользователя в посте `Machinelearning` — большая чёрная область с круглой кнопкой ▶ по центру, JPEG-кадра нет.

**Корневая причина**: `VideoTile.jsx` и `MediaAlbum.jsx` при монтировании вызывали:
```js
window.api.invoke('tg:download-media', { chatId, messageId, thumb: false })
```

С комментарием `v0.87.39: thumb=false для чёткого постера (не blur)`. Но в backend этот параметр **никогда не использовался**:

```js
// main/native/backends/tdlibBackend.js (до v0.89.16):
async download({ chatId, msgId, onProgress }) {
  // ...
  const { fileId } = extractMediaFileId(tdMsg?.content)  // ← thumb игнорируется
  // ...
}

// А extractMediaFileId для messageVideo возвращал file_id ПОЛНОГО видео:
if (cn === 'messageVideo') return { fileId: content.video?.video?.id, kind: 'video' }
//                                                  ^^^^^^ это mp4, ~45 МБ
```

Каждое появление видео в чате запускало **фоновое скачивание десятков МБ** под видом постера. UI ставил полученный URL вида `cc-media://media/<видео.mp4>` в `<img src="">` — Chromium не рендерит mp4 в `<img>`, виден только размытый minithumbnail (если был) или чёрный фон.

**По TDLib документации** ([td_api::video](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1video.html)):
- `video.minithumbnail` — base64 ~200 байт в самом сообщении (размытый, мгновенный)
- `video.thumbnail.file` — JPEG ~10-100 КБ (чёткий кадр для постера) ← **это надо качать**
- `video.video` — mp4 десятки МБ (это для клика «▶»)

**Решение (v0.89.16)**:
- Новый helper `extractThumbnailFileId(content)` извлекает `thumbnail.file.id` для video/animation/document/videoNote/audio/photo
- Новый метод `backend.media.downloadThumbnail({chatId, msgId})` качает только превью (priority=8)
- Новый IPC `tg:download-thumbnail` без флага `thumb`
- VideoTile.jsx + MediaAlbum.jsx переведены на новый канал

**Правило**: если параметр функции **не используется** внутри — удалить его из сигнатуры, не оставлять как «обещание». Если параметр **обязан** менять поведение — добавить тест, который проверяет это поведение **внутри backend**, а не только в UI. Иначе backend может молча игнорировать флаг (как случилось с `thumb` от v0.87.39 до v0.89.16 — больше двух недель в проде).

---

## Урок-обобщение: процесс отладки видео

1. **Сначала факты от пользователя**: что именно видно? таймер 0:00 vs играет 0:22 — РАЗНЫЕ проблемы.
2. **Логи**: события `<video>` (loadstart/loadedmetadata/canplay/error) + Range запросы в cc-media. Записывать в **файловый** лог через `app:log`, не только Console.
3. **MediaError.code**:
   - `1` MEDIA_ERR_ABORTED — пользователь прервал
   - `2` MEDIA_ERR_NETWORK — сетевая (для нас — cc-media handler упал)
   - `3` MEDIA_ERR_DECODE — decoder получил битые данные (часто проблема в нашем Range handling)
   - `4` MEDIA_ERR_SRC_NOT_SUPPORTED — codec не поддерживается Chromium
4. **TDLib флаги**:
   - `video.supports_streaming` — можно ли progressive
   - `local.is_downloading_completed` — полностью на диске
   - `local.downloaded_prefix_size` — сколько подряд с начала (для streamable)
5. **cc-media protocol** должен:
   - Поддерживать Range вручную (не через `net.fetch('file://')`)
   - Возвращать `Accept-Ranges: bytes` в любом ответе (200 и 206)
   - Использовать `Readable.toWeb(fs.createReadStream({start, end}))` для chunks
6. **НЕ ДЕЛАТЬ**:
   - Clamp seeks по `<video>.buffered`
   - «Защитные кнопки» поверх собственных багов
   - Менять несколько вещей сразу когда жалоба на одну
   - Отдавать `<video>`/`<img>` URL вида `cc-media://tdlib/...` (kind=`tdlib` удалён в v0.89.15)
   - Резолвить `downloadFile` раньше `is_downloading_completed=true`
   - Доверять «временным» полям TDLib (downloaded_prefix_size, partial path)

7. **ДЕЛАТЬ**:
   - Любой скачанный файл — через `stabilizeForPlayback()` → `tg-media/<fileId>_<size>.<ext>` → `cc-media://media/...`
   - Для UX «не блокировать UI» — прогресс-спиннер на постере (уже есть)
   - При жалобе пользователя на «не работает» — сначала `git log` за последние 5 коммитов, проверить что **я недавно сломал**, не лепить новые UI элементы
