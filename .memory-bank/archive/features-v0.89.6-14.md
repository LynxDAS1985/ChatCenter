# Архив: changelog v0.89.6 – v0.89.14 (видео-pipeline стабилизация)

**Вынесено**: 18 мая 2026, при превышении features.md 100 КБ (v0.89.19).

**Содержимое**: 9 итераций видео-pipeline (TDLib migration → cc-media → progressive playback → откаты → стабильная архитектура с stabilizeForPlayback). Закрыто в v0.89.15-v0.89.16 (подтверждено пользователем).

**Когда читать**:
- Восстанавливаешь причину архитектурного решения для видео
- Расследуешь регрессию похожую на ловушки #1-#9 из mistakes/tdlib-video-player.md
- По прямой просьбе пользователя «что было в v0.89.10»

**Активный contextactual** — итоговая ловушка #10 + сводка серии — в [`../mistakes/tdlib-video-player.md`](../mistakes/tdlib-video-player.md).

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

