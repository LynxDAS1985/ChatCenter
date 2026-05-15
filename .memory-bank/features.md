# Реализованные функции — ChatCenter

## Текущая версия: v0.89.8 (15 мая 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.88.0 → v0.89.8). Старое — в архиве:

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

### v0.89.5 — Четвёртый аудит: drift fixes (0 функциональных регрессий)

**Контекст**: четвёртый раунд независимого аудита TDLib миграции. В отличие от прошлых трёх (v0.89.2/3/4 — нашли 6/3/8 user-visible регрессий соответственно), этот **не нашёл ни одной функциональной проблемы**. Закрылись только 2 точечных drift'а документации vs код.

#### Что исправлено

**Drift #1** — `.memory-bank/api.md:37` описывал устаревший response shape `tg:get-accounts`:
- Было: `{ ok, accounts: [{id, messenger, status, name, phone}], activeAccountId }`
- В коде после фикса #7 v0.89.4: `{ ok, accounts: [{id, messenger, status}], activeAccountId }` (без `name/phone` — приходят отдельно через `tg:account-update` event после finalize)
- Тест [`tdlibEmitContracts.vitest.js:216-228`](src/__tests__/tdlibEmitContracts.vitest.js) подтверждает что полей нет в коде

**Drift #2** — `applicationVersion` fallback `'0.89.2'`:
- [`main/main.js:228`](main/main.js) не передавал `applicationVersion` в `initTdlibBackendStartup`
- [`tdlibStartup.js:67`](main/native/backends/tdlibStartup.js) и [`tdlibAuth.js:86`](main/native/backends/tdlibAuth.js) имели fallback `'0.89.2'`
- TDLib записывает версию в session-БД при первом `setTdlibParameters` → новые login'ы показывали «ChatCenter 0.89.2» в Telegram → Settings → Active Sessions, хотя реальная версия 0.89.4+
- Теперь `main.js` передаёт `applicationVersion: app.getVersion()` — Electron API возвращает версию из `package.json`, синхронизируется автоматически

#### Существующие сессии — известное ограничение

`device_model` и `application_version` в TDLib пишутся в session-БД **при первом** `setTdlibParameters` и **не перезаписываются** при последующих запусках (это TDLib behavior, не наш bug). Для существующих сессий записанные значения сохранятся до повторного login. Документировано в `api.md:119`.

#### Итог 4 раундов аудита

| Раунд | Что искал | Найдено |
|---|---|---|
| v0.89.2 (1) | TDLib spec correctness | 6 фиксов параметров invoke |
| v0.89.3 (2) | Invoke contracts (UI→backend) | 3 user-facing регрессии |
| v0.89.4 (3) | Emit contracts (backend→UI) | 8 user-facing регрессий |
| **v0.89.5 (4)** | Hidden bugs + drift | **0 регрессий, 2 drift'а** |

**Системная защита**: после v0.89.4 обе стороны IPC контрактов покрыты тестами ([`tdlibIpcHandlers.vitest.js`](src/__tests__/tdlibIpcHandlers.vitest.js) — invoke, [`tdlibEmitContracts.vitest.js`](src/__tests__/tdlibEmitContracts.vitest.js) — emit). Дальнейшие регрессии этого класса будут пойматься автоматически.

**TDLib миграция завершена.** ⚠ Финальная визуальная проверка пользователем обязательна — список проверок в release notes этой версии (`features.md`) + краткая инструкция от ассистента после коммита.

**Версия**: v0.89.4 → v0.89.5 (patch — два drift-фикса).

**Проверено**:

```powershell
npm run lint                                                  # OK
node src/__tests__/fileSizeLimits.test.cjs                     # 244/244
node src/__tests__/featuresReferences.test.cjs                 # 2/2
node src/__tests__/messengerBackend.test.cjs                   # 61/61
npm run test:vitest                                            # 531/531 (38 файлов)
```

---

### v0.89.4 — Третий аудит: emit-направление IPC + удаление GramJS dep (8 регрессий)

**Контекст**: v0.89.2/3 закрыли invoke-направление контрактов (UI→backend), но никто не проверял emit-направление (backend→UI) систематически. Третий аудит обнаружил 8 user-visible регрессий, которые в коде существовали с момента TDLib миграции (v0.89.1).

#### Что исправлено

**1. `tg:sender-avatar` payload mismatch** — аватарки отправителей в группах не появлялись

| | Было | Стало |
|---|---|---|
| Backend emit | `{accountId, userId, avatarPath}` | `{senderId, avatarUrl}` |
| UI handler | принимал `{chatId, senderId, avatarUrl}` — `chatId=undefined` → exit | iterates ВСЕ `state.messages` по `senderId` |

**Изменено**: [`tdlibIpcHandlers.js`](main/native/tdlibIpcHandlers.js) bridge, [`nativeStoreIpc.js`](src/native/store/nativeStoreIpc.js) handler.

**2. `tg:remove-account` flow полностью переделан**

Раньше: только `client.close()` — сессия оставалась на серверах Telegram (security), файлы оставались на диске, `autoRestoreSessionsFromDisk` воскрешал «удалённый» аккаунт.

Теперь ([tdlibBackend.js](main/native/backends/tdlibBackend.js#L191)):
```
scanAccountSessionStats → client.invoke('logOut') → manager.removeAccount(close+delete)
  → removeAccountSessionFiles(fs.rmSync) → emit 'account:update {removed:true, wipeStats}'
```

UI получает `tg:account-update {removed:true, wipeStats:{totalFiles, totalBytes, isLast, filesRemoved}}` → handler чистит state.accounts/chats/messages для удалённого аккаунта (или полная очистка если isLast).

**3. `tg:send-clipboard-image` handler не существовал** — Ctrl+V скриншот падал

UI [`useDropAndPaste.js:29`](src/native/hooks/useDropAndPaste.js) шлёт `{chatId, data: Uint8Array, ext, caption?}`. Новый handler в [`tdlibIpcHandlers.js`](main/native/tdlibIpcHandlers.js) пишет во временный файл `userDataPath/tdlib-tmp/paste-{ts}.{ext}` и зовёт `backend.messages.sendFile`. После send → `setTimeout(unlink, 60s)` удаляет tmp.

**4. `tg:media-progress` не эмитился** — прогресс-бар видео всегда 0%

[`tdlibBackend.media.download/downloadVideo`](main/native/backends/tdlibBackend.js) теперь принимают `onProgress` callback. IPC handler регистрирует callback который зовёт `sendToRenderer('tg:media-progress', {chatId, messageId, bytes, total})`. `downloadFile` в [`tdlibMedia.js`](main/native/backends/tdlibMedia.js) уже эмитил chunks через `manager.on('file:update')` — теперь они проходят до UI.

**5. `tg:typing` не эмитился** — «X печатает...» не работало

[`tdlibClient._handleUpdate`](main/native/backends/tdlibClient.js) теперь обрабатывает `updateChatAction`: при `chatActionTyping`/`chatActionCancel` от `messageSenderUser` эмитит `chat:typing {chatId, userId, typing}`. IPC bridge → `tg:typing`.

**6. `tg:read` (outgoing) не эмитился** — read receipts (двойная галочка)

[`tdlibClient._patchChat`](main/native/backends/tdlibClient.js) при `updateChatReadOutbox` теперь эмитит `chat:read-outbox {chatId, maxId}`. IPC bridge → `tg:read {chatId, outgoing:true, maxId}`. UI handler ставит `m.isRead=true` для исходящих с id≤maxId.

**7. `tg:get-accounts` race condition** — пустой `name:''` стирал реальное имя

Раньше при старте handler возвращал `{id, messenger, status, name:'', phone:''}`. UI делал spread merge → если `tg:account-update` от finalize пришёл раньше, пустые поля перезаписывали реальные. Теперь возвращает только `{id, messenger, status}` — UI получает name/phone через event-bridge.

**8. Зависимость `telegram` (GramJS) удалена** из `package.json` + `package-lock.json`

CHANGELOG v0.89.1 говорил «удалено отдельным шагом», но физически оставалась. ~30 МБ мёртвого кода. Удалена только запись из root deps — npm install/prune почистит `node_modules` автоматически.

#### Системная защита: emit-direction контракт-тесты

Корневая причина того что три аудита подряд что-то находили: тесты проверяли **только invoke-направление** (UI payload → handler → TDLib invoke). Emit-направление (TDLib update → manager.emit → bridge → sendToRenderer → UI handler) нигде не покрывалось.

Новый файл [`tdlibEmitContracts.vitest.js`](src/__tests__/tdlibEmitContracts.vitest.js) — 13 тестов:

- `updateChatAction → tg:typing` (для typing + cancel + sender:chat ignored)
- `updateChatReadOutbox → tg:read {outgoing:true}`
- `user:avatar → tg:sender-avatar {senderId, avatarUrl}` (регрессия: НЕ должно быть accountId/userId)
- `removeAccount → tg:account-update {removed:true, wipeStats}` + проверка вызова `logOut`
- `tg:download-media + updateFile → tg:media-progress {bytes, total}` (real chain test)
- `tg:send-clipboard-image` handler существует + проверка обработки ошибок
- `tg:get-accounts` НЕ возвращает пустые name/phone (регрессия v0.89.2)

#### Архитектурное

- **Новые exports** [`tdlibChatActions.js`](main/native/backends/tdlibChatActions.js): `scanAccountSessionStats(userDataDir, accountId)`, `removeAccountSessionFiles(userDataDir, accountId)`.
- **Новые manager events**: `chat:typing`, `chat:read-outbox`.
- **Новые backend.media options**: `onProgress` колбэк теперь работает.
- **Orphan events** задокументированы в api.md (помечены ⚠️): `message:edited`, `message:deleted`, `account:connection`, `user:status` — UI пока не слушает. Отложено до v0.90.0.

**Тестов**: 518 → 531 (+13).

**Версия**: v0.89.3 → v0.89.4 (patch — bug fixes + feature gaps).

**Проверено**:

```powershell
npm run lint                                                  # OK
node src/__tests__/fileSizeLimits.test.cjs                     # 244/244
node src/__tests__/featuresReferences.test.cjs                 # 2/2
node src/__tests__/messengerBackend.test.cjs                   # 61/61
npm run test:vitest                                            # 531/531 (38 файлов)
```

⚠ **Visual проверка обязательна**: открыть чат с групповыми сообщениями (аватарки отправителей), нажать «Закрепить сообщение», заглушить чат на час через MuteMenu, попробовать Ctrl+V скриншот в чат, выйти из аккаунта → проверить что после перезапуска приложения аккаунт удалён.

---

### v0.89.3 — Второй аудит: IPC контракты UI ↔ backend (3 user-facing регрессии)

**Контекст**: после v0.89.2 («все TDLib API правильные по спеке») запустили **второй** независимый аудит — на этот раз против [`src/native/store/nativeStore.js`](src/native/store/nativeStore.js) и UI-компонентов. Аудит выявил, что **3 из 6 фиксов v0.89.2** реализованы технически правильно по TDLib спеке, но **payload-контракт не совпадает с тем что шлёт renderer**. Эти регрессии были замаскированы предыдущими stub'ами `{ ok: true }` — теперь, когда функции «реальные», расхождение раскрылось.

#### Найдено и исправлено

**1. `tg:pin` делал совершенно другую операцию**

| | UI [(nativeStore.js:473-475)](src/native/store/nativeStore.js) | v0.89.2 handler |
|---|---|---|
| Намерение | Закрепить **сообщение** в чате | Закрепляет **чат** в Main-list |
| Payload UI | `{ chatId, messageId, unpin }` | Читал `{ chatId, isPinned }` → `messageId` игнорировался |
| Эффект | (Ожидаемо) `pinChatMessage` | `toggleChatIsPinned` + `isPinned = !!undefined = false` → **каждый клик снимал чат с закрепа** |

**Исправление** ([`tdlibMessages.js`](main/native/backends/tdlibMessages.js)): добавлены `pinMessage` (TDLib `pinChatMessage(chat_id, message_id, disable_notification:true, only_for_self:false)`) и `unpinMessage` (TDLib `unpinChatMessage`). [`tdlibIpcHandlers.js`](main/native/tdlibIpcHandlers.js) `tg:pin` теперь читает `{chatId, messageId, unpin}` и делает правильный invoke.

**2. `tg:set-mute` всегда давал unmute**

| | UI [(MuteMenu.jsx:36)](src/native/components/MuteMenu.jsx) → [(nativeStore.js:787-788)](src/native/store/nativeStore.js) | v0.89.2 handler |
|---|---|---|
| Payload UI | `{ chatId, muteUntil }` — Unix timestamp | Читал `{ chatId, muteFor }` — `undefined` |
| Любой клик («На час»/«Навсегда»/«Включить») | TDLib `mute_for = 0` | unmute |

**Исправление** ([`tdlibChatActions.js`](main/native/backends/tdlibChatActions.js)): `setMute(client, chatId, muteUntil)` принимает абсолютный timestamp, внутри конвертирует `mute_for = Math.max(0, muteUntil - Math.floor(Date.now()/1000))`. Math.max защищает от устаревших timestamps. 2147483647 («навсегда» INT_MAX) → большое mute_for ≈ 70 лет.

**3. `tg:get-cleanup-stats` показывал пустоту в предпросмотре logout**

| | UI [(AccountContextMenu.jsx:257-269)](src/native/components/AccountContextMenu.jsx) | v0.89.2 handler |
|---|---|---|
| Ждёт | `{ totalFiles, totalBytes, byCategory: { session, avatars, cache, media, tmp } }` (5 CleanupRow + ИТОГО) | Возвращал `{ ok, bytes, dbBytes, fileCount: 0 }` через `getStorageStatisticsFast` |
| Юзер видел в preview logout | Реальная статистика по категориям | «undefined файлов, 0 Б», все 5 строк пустые |

**Исправление** ([`tdlibChatActions.js`](main/native/backends/tdlibChatActions.js)): `getCleanupStats(manager, userDataDir)` делает **filesystem-скан** `tdlib-sessions/{accountId}/` + `userData/tg-avatars/` рекурсивно через `fs.readdirSync`/`fs.statSync`. Категоризация по таблице `FILES_CATEGORY` соответствующей TDLib file-type директориям (`profile_photos→avatars`, `photos/videos/voice/video_notes/documents/music/audio→media`, `stickers/thumbnails/wallpapers/animations→cache`, `temp→tmp`, `db.sqlite→session`).

#### Корневая причина — отсутствие документации IPC контракта

В [`.memory-bank/api.md`](.memory-bank/api.md) **не был задокументирован НИ ОДИН** канал `tg:*`. Я заменял stub'ы и не имел источника истины о том что UI шлёт. GramJS handler (источник истины GitHub) удалён в Этапе 4. Аудит v0.89.2 сверял **TDLib API correctness**, но не **renderer ↔ backend контракт**.

**Закрыто в v0.89.3**: [`.memory-bank/api.md`](.memory-bank/api.md) теперь содержит таблицы всех **24 `tg:*` каналов** с payload + response shapes + **12 renderer events** + замечания про `device_model` для существующих сессий.

#### Защита от повторения

Добавлены **IPC-контракт тесты** в [`src/__tests__/tdlibIpcHandlers.vitest.js`](src/__tests__/tdlibIpcHandlers.vitest.js) — проверяют что invoke с **UI-payload** (`{ chatId, messageId, unpin }`, `{ chatId, muteUntil }`) корректно транслируется в правильный TDLib `invoke({@type, ...})`. Включён регрессионный тест для `tg:set-mute`: если кто-то снова переименует поле в `muteFor` — тест поймает.

#### Удалено

- `backend.chats.togglePin` (закреп чата в Main-list) — UI этот контракт не использует. Дёргать через TDLib `toggleChatIsPinned` можно, но это была попытка реализовать неправильную операцию. Удалено вместе с тестами.

#### Тесты

506 → 518 (+12):
- IPC контракт-блок (5 тестов): `tg:pin pin/unpin`, `tg:set-mute conversion`, `tg:set-mute regression vs muteFor`, `tg:get-cleanup-stats shape`.
- [`tdlibBackendChatActions.vitest.js`](src/__tests__/tdlibBackendChatActions.vitest.js) — переписан под новые контракты: 7 тестов `setMute` (включая прошлое-время → 0), 7 тестов `pinMessage`/`unpinMessage`, 4 теста `getCleanupStats` с реальной tmpdir + fs.

**Версия**: v0.89.2 → v0.89.3 (patch — bug fixes для UI совместимости, без новых фич).

**Проверено**:

```powershell
npm run lint                                                  # OK
node src/__tests__/fileSizeLimits.test.cjs                     # 243/243
node src/__tests__/featuresReferences.test.cjs                 # 2/2
node src/__tests__/messengerBackend.test.cjs                   # 61/61
npm run test:vitest                                            # 518/518 (37 файлов)
```

---

### v0.89.2 — Пост-миграционный аудит TDLib стека (6 фиксов по docs)

**Контекст**: после полного удаления GramJS в v0.89.1 пользователь попросил независимый аудит реализации TDLib backend против документации стека (tdl, TDLib core API). Аудит выявил 3 критичных пункта и 3 точечные ошибки. Все 6 закрыты в этой версии. Сверки делались с `node_modules/tdl/dist/client.js` (исходники tdl) и `core.telegram.org/tdlib/docs/`.

#### Фикс #1 — `tdlibParameters` реально передаются в `tdl.createClient`

До v0.89.2 функция `buildTdlibParameters()` (`tdlibAuth.js`) возвращала готовый объект `setTdlibParameters` с `'@type'`, `api_id`, `device_model`, `application_version`, `enable_storage_optimizer: true` — но он **никуда не уходил**. В `_onAuthState` при `authorizationStateWaitTdlibParameters` стоял ранний `return` (tdl сам шлёт), а наш объект просто хранился в `TdlibAuthFlow.tdlibParameters` и забывался.

**Следствие**: TDLib видел приложение как `device_model="Unknown device"`, `application_version="1.0"`, `system_language_code="en"` (defaults tdl). Юзеры в **«Активных сессиях Telegram» видели «Unknown device»** — это выглядит как фишинг. Storage optimizer был выключен, кеш TDLib рос без авто-очистки.

**Что сделано**:

- [`main/native/backends/tdlibAuth.js`](main/native/backends/tdlibAuth.js) — `buildTdlibParameters` теперь возвращает **только** application-специфичные поля (`device_model`, `application_version`, `use_message_database`, `use_chat_info_database`, `use_file_database`, `enable_storage_optimizer`, `system_language_code`). Без `'@type'`, `api_id`, `database_directory` — эти подставляет сам tdl из верхнеуровневых createClient options (см. `node_modules/tdl/dist/client.js:629-637`).
- [`main/native/backends/tdlibRuntime.js`](main/native/backends/tdlibRuntime.js) — `clientFactory` принимает `clientParams.tdlibParameters` и передаёт в `tdl.createClient({ tdlibParameters: ... })`. tdl расширяет setTdlibParameters через `...this._options.tdlibParameters`.
- [`main/native/backends/tdlibStartup.js`](main/native/backends/tdlibStartup.js) — строит `tdlibParameters` один раз (с `applicationVersion: '0.89.2'`, `systemVersion: process.platform`) и пробрасывает через `makeClientParams`.
- `TdlibAuthFlow` больше не требует и не хранит `tdlibParameters` — удалена dead code зависимость.

#### Фикс #2 — sendFile mappings (`.gif → Animation`, `.heic → Document`, required-поля)

[`main/native/backends/tdlibMessages.js`](main/native/backends/tdlibMessages.js) — расширение `sendFile`:

- **`.gif` → `inputMessageAnimation`** (раньше → `inputMessagePhoto` → Telegram сохранял как застывшую PNG, теряя анимацию). Required поля: `animation, duration:0, width:0, height:0, added_sticker_file_ids:[]`. TDLib читает реальные размеры из файла на сервере.
- **`.heic` → `inputMessageDocument`** (раньше → `inputMessagePhoto` → TDLib отклонял с `PHOTO_INVALID_DIMENSIONS`). Telegram-клиенты iOS/Desktop откроют HEIC через preview-сервис.
- **Photo/Video/Audio/Animation** теперь передают **ВСЕ required-поля** по TDLib спеке: `added_sticker_file_ids:[]`, `show_caption_above_media:false`, `has_spoiler:false`. Для Video — `supports_streaming:true`. Для Audio — `title:'', performer:''`. Без них TDLib иногда падал на проверке схемы.
- **`forwardMessages`** — убран явный `options:{}` (TDLib допускает `null` per spec «pass null to use default»).
- **`wrapError`/`safeInvoke`** — сохраняют `e?.code` как есть (undefined вместо фейкового 0). Различает 404 «конец списка loadChats» от других ошибок.

#### Фикс #3 — три IPC stub'а заменены реальной реализацией

Вынесено в новый файл [`main/native/backends/tdlibChatActions.js`](main/native/backends/tdlibChatActions.js) (split из `tdlibBackend.js` — упёрся в лимит 500 строк после реализации):

- **`tg:set-mute`** → `setChatNotificationSettings` с ПОЛНЫМ 16-полевым `chatNotificationSettings` объектом (`use_default_*:true` для всех опций кроме `mute_for`). Раньше IPC возвращал `{ ok: true }` без действия — UI «Mute» visually работал, в Telegram ничего не происходило.
- **`tg:pin`** → `toggleChatIsPinned` с `chat_list: { '@type': 'chatListMain' }` (TDLib требует chat_list как REQUIRED).
- **`tg:get-cleanup-stats`** → `getStorageStatisticsFast` (быстрый ответ из БД TDLib без сканирования файлов). Суммируется `files_size + database_size` по всем аккаунтам.

#### Фикс #4 — dedup `_finalizePending` → `manager.finalizeAccount`

[`main/native/backends/tdlibBackend.js`](main/native/backends/tdlibBackend.js) — `_finalizePending` теперь зовёт `manager.finalizeAccount(_pendingAccountId)` вместо дублирующейся логики getMe→rename→emit. Раньше manual-login использовал свою версию (без phone-fallback), auto-restore — версию из clientManager (с fallback). После v0.89.2 — единая точка с консистентным поведением (phone-fallback на имя + auto-download своей profile_photo).

#### Фикс #5 — `authorizationStateWaitRegistration` → дружелюбная RU-ошибка

[`main/native/backends/tdlibAuth.js`](main/native/backends/tdlibAuth.js) — отдельная ветка для `WaitRegistration` (TDLib шлёт когда номер валиден, но Telegram-аккаунта ещё нет). Возвращает `«У этого номера ещё нет аккаунта Telegram. Зарегистрируйтесь через официальное приложение Telegram.»` вместо `«unsupported state: authorizationStateWaitRegistration»`. Раньше попадало в fallback.

#### Фикс #6 — `_pendingAvatars` catch leak

[`main/native/backends/tdlibAvatars.js`](main/native/backends/tdlibAvatars.js) — при ошибке `downloadFile` запись из `_pendingAvatars` теперь удаляется (раньше висела вечно если TDLib никогда не пришлёт `updateFile` — например, `FILE_REFERENCE_INVALID` или удалённый чат). Защита от роста Map при долгой работе.

#### Тесты

+21 vitest тест на новое поведение (всего теперь 506):

- [`src/__tests__/tdlibBackendChatActions.vitest.js`](src/__tests__/tdlibBackendChatActions.vitest.js) — новый файл с 11 тестами на `setMute/togglePin/getCleanupStats`.
- [`src/__tests__/tdlibBackendSendFwd.vitest.js`](src/__tests__/tdlibBackendSendFwd.vitest.js) — +6 тестов: `gif → Animation`, `heic → Document`, required-поля для photo/video/audio, `ogg → Audio`.
- [`src/__tests__/tdlibAuth.vitest.js`](src/__tests__/tdlibAuth.vitest.js) — переписан `buildTdlibParameters` контракт + добавлен тест `WaitRegistration → ru-error`.
- [`src/__tests__/tdlibRuntime.vitest.js`](src/__tests__/tdlibRuntime.vitest.js) — +2 теста на проброс `tdlibParameters` в `tdl.createClient`.

**Версия**: v0.89.1 → v0.89.2 (patch — bug fixes + проводка параметров, без новых пользовательских фич).

**Проверено**:

```powershell
npm run lint                                                  # OK
node src/__tests__/fileSizeLimits.test.cjs                     # 243/243
node src/__tests__/messengerBackend.test.cjs                   # 61/61
node src/__tests__/featuresReferences.test.cjs                 # 2/2
npm run test:vitest                                            # 506/506 (37 файлов)
```

---

### v0.89.1 — TDLib миграция Этап 4: полное удаление GramJS

**Контекст**: Stage 4 Этапы 1–3 (3.1–3.13) последовательно реализовали TDLib-эквивалент всему функционалу GramJS-интеграции (auth, чаты, сообщения, медиа, аватарки, forum-темы, sendFile, forwardMessage). Этап 4 — финальный шаг: удалить параллельный GramJS-код, оставить только TDLib. Полный план — [`tdlib-migration-plan.md`](.memory-bank/tdlib-migration-plan.md).

**Что удалено из репозитория**:

13 production-файлов GramJS-интеграции (~3500 строк):

- [`main/native/backends/tdlibBackend.js`](main/native/backends/tdlibBackend.js) (TDLib backend остался) ↔ удалены: `main/native/backends/gramjsBackend.js`, `main/native/telegramHandler.js`, `main/native/telegramAuth.js`, `main/native/telegramChats.js`, `main/native/telegramChatsIpc.js`, `main/native/telegramCleanup.js`, `main/native/telegramErrors.js`, `main/native/telegramForumTopicsIpc.js`, `main/native/telegramMedia.js`, `main/native/telegramMessageMapper.js`, `main/native/telegramMessages.js`, `main/native/telegramState.js`, `main/native/tdlibPoc.cjs`.

4 GramJS-only теста удалены (`multiAccount.test.cjs`, `multiAccountUI.test.cjs`, `mediaCacheQuota.test.cjs`, `unreadAutoPrefetch.test.cjs`) — поведение покрывается TDLib-вариантами в `src/__tests__/tdlib*.vitest.js` + [`VirtualMessageList.vitest.jsx`](src/native/components/VirtualMessageList.vitest.jsx).

**Что изменено**:

- [`main/main.js`](main/main.js) — убран env-флаг `USE_TDLIB_BACKEND` и fallback на `initTelegramHandler` (GramJS). Единственная точка инициализации Telegram-интеграции — `initTdlibBackendStartup`. При ошибке TDLib запуска логируется и приложение продолжает работать без Telegram (фейл-сейф).
- [`main/native/messengerBackend.js`](main/native/messengerBackend.js) — упрощён до JSDoc-описания интерфейса + `getBackendName()` → `'tdlib'`. JSDoc-типы остались (используются тестами и описывают контракт для потенциальных будущих backend'ов).
- [`src/__tests__/messengerBackend.test.cjs`](src/__tests__/messengerBackend.test.cjs) — переписан под TDLib-only (61 проверка). Явно проверяет что все 13 GramJS-файлов удалены, что 11 TDLib-модулей на месте, что `getBackendName()` возвращает `'tdlib'`.
- [`src/__tests__/mainRuntime.test.cjs`](src/__tests__/mainRuntime.test.cjs) — убраны `require('telegram/sessions/index.js')` и т.п. (GramJS-пакет `telegram` будет удалён следующим коммитом через `npm uninstall telegram`).
- [`package.json`](package.json) — `test`-script больше не вызывает 4 удалённых cjs-теста. Зависимость `telegram` помечена на удаление.

**Что сохранено**:

- IPC-контракт (`tg:*` каналы) — UI не изменился, TDLib backend эмитит те же события (`tg:messages`, `tg:chat-avatar`, `tg:account-update`, etc).
- Schema `Chat` / `NativeMessage` — TDLib mapper отдаёт ровно те же поля, что и старый GramJS mapper.
- 11 TDLib-модулей: `tdlibBackend.js`, `tdlibAuth.js`, `tdlibClient.js`, `tdlibMessages.js`, `tdlibMedia.js`, `tdlibMapper.js`, `tdlibAvatars.js`, `tdlibNormalize.js`, `tdlibRuntime.js`, `tdlibStartup.js`, `tdlibIpcHandlers.js`.

**Что это даёт**:

- Один backend Telegram-интеграции вместо двух — кодовая база уменьшилась на ~3500 строк production + ~500 строк удалённых тестов.
- Снят теоретический риск двойной инициализации (GramJS + TDLib одной и той же сессии).
- TDLib использует встроенный SQLite с `pts`/`seq` per chat — это закрывает старую «Проблему #2 — 1 сообщение в чате» (gap detection встроен).

**Версия**: v0.89.0 → v0.89.1 (patch — удаление кода, без новых пользовательских фичей).

**Проверено**:

```powershell
npm run lint                                                  # OK
node src/__tests__/messengerBackend.test.cjs                   # 61/61
node src/__tests__/fileSizeLimits.test.cjs                     # 241/241
node src/__tests__/featuresReferences.test.cjs                 # 2/2
node src/__tests__/projectHealth.test.cjs                      # 33/33
node src/__tests__/mainRuntime.test.cjs                        # 48/48
npm run test:vitest                                            # 485/485 (36 файлов)
```

⚠ Следующий шаг — `npm uninstall telegram` (только пользователь, не ассистент — правило CLAUDE.md «без npm install/uninstall»). После удаления зависимости `package-lock.json` обновится автоматически.

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

### v0.87.136 — единый статус качества подключения

- Добавлена единая модель `connectionHealth` для статусов подключения: `pending`, `ok`, `slow`, `error`.
- Верхние точки WebView-вкладок больше не показывают старый `monitorStatus`; теперь они показывают качество подключения/доступность страницы.
- Точки на native/API аккаунтах в `ЦентрЧатов` переведены на общий компонент `ConnectionStatusDot`.
- Native/API аккаунты теперь получают реальные статусы из `nativeConnectionHealth`: быстрый ответ → `ok`, долгий ответ → `slow`, `Not connected`/ошибка → `error`.
- Убрана временная заглушка `0 мс` для connected-аккаунтов; сетевое время API берётся из личных замеров `tg:get-chats` / `tg:rescan-unread` по каждому accountId. `tg:get-cached-chats` больше не считается сетевой проверкой, потому что это чтение локального кэша.
- WebView-вкладки больше не показывают время загрузки страницы как "последний ответ": для проверки используется лёгкий сетевой `network-fetch` probe внутри вкладки. Локальный DOM-only probe не используется как итоговое время, потому что он показывал почти одинаковые значения по всем WebView. После самопроверки probe усилен: сначала проверяет текущий URL вкладки, затем fallback `/favicon.ico`, затем `/`.
- Кнопки `Проверить все` и `Обновить проблемные` в экране `Подключения` теперь запускают WebView probe без принудительного reload вкладок и проверку native/API.
- В списке `Подключения` показываются статус, цветное время последнего ответа и время последней проверки.
- Клик по любой точке открывает общий экран `Подключения` со списком WebView-вкладок и native/API аккаунтов.
- `monitor.preload.cjs`, hooks мессенджеров, unread и Notification pipeline не удалялись: они остались внутренним механизмом уведомлений.
- Исправлен ручной кейс проверки Native/API: `Ожидание проверки` больше не показывает старое время, а фоновый `window.focus → rescanUnread` не перезаписывает результат ручной проверки `Подключения`.
- Документировано в архивном [`2026-05-connection-health-plan.md`](./archive/2026-05-connection-health-plan.md), `ui-components.md` и `mistakes/webview-stack-grouping.md`.

---

### v0.87.135 — Windows installer в корневую папку dist

- Добавлен `npm run dist:win`: собирает production build, затем Windows x64 NSIS installer.
- Выходная папка: корневая `dist/`; после сборки скрипт оставляет только `ЦентрЧатов-Setup-<version>-x64.exe`, удаляя временный мусор builder внутри `dist`.
- Добавлен `electron-builder`; упаковка стартует из `out/main/main.js`, включает собранные `out/**`, берёт Electron из локального `node_modules/electron/dist` и отключает `winCodeSign` для локального unsigned installer.
- Зафиксирован итог расследования старта: `npm start` медленнее из-за Vite dev graph, но мессенджеры работают; `npm run start:prodlike` быстро запускает shell. Подозрение на баг VK/MAX в prodlike закрыто как ложная тревога: причина была в слабом интернете. Памятка: [`prodlike-webview-investigation.md`](./prodlike-webview-investigation.md).

---

### v0.87.134 — start:prodlike для проверки dev-server bottleneck

- Добавлен `npm run start:prodlike`: отдельный production-like запуск без изменения обычного `npm run dev/start`.
- `scripts/prodlike.cjs` сначала делает `npm run build`, потом запускает `electron-vite preview`.
- Цель: сравнить готовый `out/renderer/index.html` с текущим `http://localhost:5173`, где логи показывают долгую Vite/dev загрузку `TabBar`, hooks, CSS и `webviewSetup`.
- Не менялись: Telegram sessions/accounts, WebView partitions, VK/MAX/WhatsApp/Telegram runtime и UI.

---

### v0.87.133 — A2.1: manual tab diagnostics disabled from startup graph

- `src/hooks/useTabContextMenu.js`: manual `tabContextMenuDiag` import disabled; it no longer pulls diagnostic scripts into `App.jsx` startup graph.
- `src/components/NotifLogModal.jsx`: DOM/Storage/Account diagnostic tabs hidden while this rarely used tool is disabled.
- Reason: user does not use this manual diagnostics tool now; normal tab work, unread, navigation, WebView runtime and Telegram API accounts do not need it.
- Not changed: Telegram sessions/accounts, `tg:get-accounts snapshot`, WebView partitions, VK/MAX/WhatsApp/Telegram runtime.

### v0.87.132 — Stage A1: NativeApp removed from App.jsx static startup graph

- `src/App.jsx`: `NativeApp` switched from a static import to a controlled `React.lazy` import.
- Native mode is wrapped in its own `Suspense` fallback so the main `App.jsx` shell can finish importing before the native module graph resolves.
- Added startup marks `module:NativeApp lazy import requested/resolved` for the next live log comparison.
- Telegram API/sessions/accounts, `tg:get-accounts snapshot`, native store, WebView partitions and VK/MAX/WhatsApp/Telegram WebView tabs were not changed.
- Tests updated to enforce the lazy contract and diagnostics marks.

### v0.87.131 — Parallel renderer startup imports

- `src/main.jsx`: startup imports switched from sequential awaits to `Promise.all`.
- `react`, `react-dom/client`, `index.css` and `App` now start loading in parallel; render still waits for all four to finish.
- Added startup marks `parallel imports start` and `parallel imports done`.
- Goal: remove artificial dev-startup wait where `/src/App.jsx` started only after `/src/index.css` completed.
- Telegram sessions/API/accounts/native store were not changed.

### v0.87.130 — Full startup diagnostics without behavior changes

- `main/utils/windowManager.js`: `session.webRequest` now logs start/done/failed, slow requests, pending snapshots and summaries at `dom-ready`, `did-finish-load`, `ready-to-show`, 5/10/15/30/45/60/90 sec.
- `src/boot-probe.js`: renderer resource summaries, DOMContentLoaded/window load marks, longtask observer and delayed summaries.
- `src/main.jsx`: marks around root lookup, `createRoot`, `render` and first `requestAnimationFrame`.
- `src/App.jsx` and `src/native/NativeApp.jsx`: first-render/mounted marks with accounts/chats/tabs counts.
- Goal: one restart should show whether the delay is Vite request/pending URL, CSS transform, JS execution, React render or native mount. Telegram sessions/API/UI are unchanged.

### v0.87.129 — Реальные timing-логи Chromium requests без предварительного прогрева

- Предварительные `http.get` module probes перед `loadURL` убраны, чтобы не прогревать Vite и не искажать замер.
- В `main/utils/windowManager.js` добавлен dev-only `webRequest` timing для реальных запросов Chromium к `http://localhost:5173/*`.
- Логируются start/done/failed, URL, status, cache flag и длительность для `/src/*`, `/node_modules/.vite/*`, `/@vite/*`.
- Runtime Telegram, аккаунты, чаты, renderer state и UI не менялись.

### v0.87.128 — Диагностика готовности Vite dev-server перед loadURL

- В `main/utils/windowManager.js` добавлен dev-only probe `http://localhost:5173` перед `BrowserWindow.loadURL`.
- Probe логирует `dev-server probe start/done/failed`, HTTP status, время ответа и timeout `3000ms`.
- При ошибке или timeout обычный `loadURL` всё равно продолжается; Telegram, аккаунты, чаты, renderer state и UI не менялись.
- Добавлен структурный тест, который фиксирует наличие probe, timeout и продолжение `loadURL` через `finally`.

### v0.87.127 — Безопасное восстановление native-аккаунтов после restore race

- Исправлена регрессия `v0.87.126`: `NativeApp` возвращён на статический import, чтобы `useNativeStore` и IPC-подписки появлялись раньше.
- Добавлен IPC snapshot `tg:get-accounts`: renderer при mount забирает текущие `state.accounts` и `activeAccountId` из main process.
- `useNativeStore` после установки listeners запрашивает `tg:get-accounts` и мержит аккаунты в локальный store.
- Это защищает UI от ситуации, когда `autoRestoreSessions` уже отправил `tg:account-update`, а renderer ещё не подписался.
- `AISidebar`, `LogModal`, `ConfirmCloseModal` остаются lazy; `NativeApp` временно не lazy до живой проверки.

### v0.87.126 — Lazy-загрузка тяжёлых стартовых панелей

- После проверки логов `v0.87.125` подтверждено: первый lazy-шаг помог мало, `App imported` всё ещё около `35.9-36.7s`.
- `AISidebar`, `NativeApp`, `LogModal`, `ConfirmCloseModal` переведены на `React.lazy`, чтобы они не входили в стартовый import graph `App.jsx`.
- Для `NativeApp` и `AISidebar` добавлены явные fallback-компоненты, чтобы первый кадр не ломал layout, пока chunk догружается.
- `TabBar`, `createWebviewSetup`, Telegram IPC, native store, аккаунты, WebView lifecycle и загрузка чатов не менялись.
- Обновлены структурные тесты: теперь проверяется lazy-контракт для `AISidebar`, `NativeApp`, `LogModal`, `ConfirmCloseModal`.

### v0.87.125 — Безопасная lazy-загрузка условных панелей

- `AddMessengerModal`, `SettingsPanel`, `TemplatesPanel`, `AutoReplyPanel`, `NotifLogModal` переведены на `React.lazy`.
- `NativeApp`, `AISidebar`, `TabBar`, WebView setup и Telegram/native логика не тронуты.
- Цель: уменьшить стартовый `App` import graph без изменения поведения аккаунтов и основного экрана.
- Обновлены структурные тесты, чтобы проверять lazy-import и `Suspense`.

### v0.87.124 — Диагностика renderer import graph

- Добавлен `src/boot-probe.js`, который логирует достижение первого module script до `src/main.jsx`.
- `src/main.jsx` временно переведён на dynamic imports с `[startup-renderer]` логами: старт module script, импорт React, `react-dom`, CSS, `App`, начало и постановка render.
- Цель: понять, уходит ли пауза `~42s` до запуска `main.jsx` или внутри import graph renderer.

### v0.87.123 — Диагностика окна до renderer `dom-ready`

- По логу `v0.87.122` подтверждено, что `dom-ready` всё ещё около `45.4s`; снятие автоочистки Vite cache само по себе не ускорило старт.
- В `main/utils/windowManager.js` добавлены `[startup-window]` логи: `loadURL/loadFile start`, `did-start-loading`, `ready-to-show`, `dom-ready`, `did-finish-load`, `did-fail-load`, resolve/fail promise.
- Цель: понять, где именно уходит 45 секунд: ожидание dev server, загрузка renderer bundle или Chromium/Electron lifecycle.

### v0.87.122 — Убран принудительный холодный старт Vite в dev-режиме

- `scripts/dev.cjs` больше не удаляет `node_modules/.vite` на каждом запуске.
- Ручная очистка cache сохранена: `npm run dev -- --clear-cache` или `CLEAR_VITE_CACHE=1`.
- По логу `v0.87.121` подтверждено, что пауза `~45.6s` была до `dom-ready` renderer, до native Telegram API и до WebView lifecycle.
- [`startup-load-investigation.md`](./startup-load-investigation.md) обновлён результатами проверки `16:26`.

### v0.87.121 — Разделение WebView Telegram и native API в расследовании старта

- Уточнено, что верхние Telegram-вкладки являются WebView-сессиями с отдельными `partition`, а `ЦентрЧатов` — отдельная native API-вкладка `native_cc`.
- Добавлены `[startup-webview]` логи для списка WebView-вкладок, настройки Electron session и lifecycle событий `<webview>`.
- Обновлён [`startup-load-investigation.md`](./startup-load-investigation.md): вывод про повторный `loadChats()` теперь явно относится только к native API-слою.

### v0.87.120 — Диагностика долгой загрузки native Telegram

**Что сделано:**

**Документ расследования:**
- Новый файл [`startup-load-investigation.md`](./startup-load-investigation.md)
- Назначение: фиксировать найденные причины долгого старта, новые логи, применённые изменения и итог проверки
- После закрытия расследования файл будет перенесён в `.memory-bank/archive/`

**Startup-логи в общий лог приложения:**
- `[startup-native] loadCachedChats...` — renderer запросил кэш чатов
- `[startup-native] loadChats...` — renderer запросил загрузку чатов
- `[startup-tg] autoRestoreSessions...` — восстановление Telegram-сессий
- `[startup-tg] get-chats...` — загрузка чатов по аккаунтам
- `[startup-tg] loadRestPages...` — фоновая дозагрузка страниц
- `[startup-tg] unread-rescan...` — фоновая сверка непрочитанных

**Где смотреть:**
- В приложении открыть лог ChatCenter
- Выбрать фильтр `Native`
- Смотреть строки `[startup-native]` и `[startup-tg]`

**Затронутые файлы:**
- [`main/native/telegramAuth.js`](../main/native/telegramAuth.js)
- [`main/native/telegramChats.js`](../main/native/telegramChats.js)
- [`main/native/telegramChatsIpc.js`](../main/native/telegramChatsIpc.js)
- [`main/main.js`](../main/main.js) — строка версии в startup-логе
- [`src/native/store/nativeStore.js`](../src/native/store/nativeStore.js)
- [`startup-load-investigation.md`](./startup-load-investigation.md)
- [`README.md`](./README.md)
- [`CHANGELOG.md`](./CHANGELOG.md)

**Что НЕ менялось:**
- Поведение загрузки чатов пока не менялось
- `unreadCount` не подменяется локально
- Аватарки и FLOOD_WAIT throttle не упрощались

---

### v0.87.119 — UI сообщений: цвета отправителей + тултип + кнопки над сообщением + пересланные + разбиение маппера

**Что реализовано:**

**Цвета отправителей** (как в Telegram):
- 7 цветов `#E17076, #7BC862, #65AADD, #EE7AAE, #AA77B2, #6EC9CB, #FAA774`
- Один отправитель всегда получает один цвет (детерминировано по `senderId`)
- Используется в: reply-цитата (полоска + имя), fwdFrom-заголовок, тултип цитаты

**Тултип на reply-цитате** (Telegram-style, Вариант 3):
- При наведении на reply-блок — всплывает стеклянная карточка над ним
- Показывает полный текст цитируемого сообщения + имя отправителя
- `pointerEvents: none` — не блокирует клик по самой цитате
- `maxHeight: 180px` — длинные тексты прокручиваются

**Кнопки действий НАД сообщением** (Вариант 2):
- Кнопки вынесены выше пузырька: `position: absolute; bottom: calc(100% + 3px)`
- Стеклянный фон: `rgba(18,18,18,0.92)` + `backdropFilter: blur(8px)`
- Для входящих — справа, для исходящих — слева (не перекрывают имя собеседника)
- Кнопки: ↪ Ответить, ➥ Переслать, 📌 Закрепить, ✏️ Редактировать (только свои), 🗑 Удалить (только свои)

**Красивые пересланные сообщения** (Доп. 2):
- Заголовок вверху пузырька: «↪ Переслано от [цветное имя]»
- Цвет имени — `getSenderColor(fwdFrom.id)` — детерминирован как в Telegram
- `fwdFrom` поле добавлено в `mapMessage` из `m.fwdFrom` GramJS объекта

**Разбиение `telegramMessages.js`** (был 499/500 строк):
- Новый файл [`main/native/telegramMessageMapper.js`](../main/native/telegramMessageMapper.js) (~176 строк)
- Вынесены: `extractStrippedThumb`, `mapEntities`, `mapMessage`, `messagePreview`
- `telegramMessages.js` теперь 343 строки — re-export для обратной совместимости
- Обновлены импорты в `telegramChats.js` и `telegramChatsIpc.js`

**Затронутые файлы:**
- [`main/native/telegramMessageMapper.js`](../main/native/telegramMessageMapper.js) — НОВЫЙ, 176 строк
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — 343/500 строк (было 499!)
- [`main/native/telegramChats.js`](../main/native/telegramChats.js) — обновлён импорт messagePreview
- [`main/native/telegramChatsIpc.js`](../main/native/telegramChatsIpc.js) — обновлён импорт mapMessage
- [`src/native/components/MessageBubble.jsx`](../src/native/components/MessageBubble.jsx) — 291/600 строк

**Как проверить:**
1. Открыть групповой чат — у каждого участника свой постоянный цвет имени
2. Ответить на сообщение → reply-блок с цветной полоской
3. Навести мышку на reply-цитату → всплывает тултип с полным текстом
4. Навести мышку на любое сообщение → кнопки появляются НАД сообщением (не поверх текста)
5. Найти пересланное сообщение → вверху пузырька «↪ Переслано от [имя]»

---

### v0.87.118 — Фикс «1 сообщение в чате» (FLOOD_WAIT от аватарок)

**Что было**: при запуске приложение скачивало аватарки 659 чатов (200мс каждая ≈ 132с). В это время Telegram блокировал другие запросы. Открытие чата попадало под блокировку → `tg:get-messages` возвращал ошибку → в чате оставался старый кэш (1 сообщение).

**Три изменения:**

**Вариант 1 — Пауза аватарок при открытии чата** (`telegramChats.js`, `telegramMessages.js`):  
`tg:get-messages` теперь выставляет `state.msgRequestTs = Date.now()`. `loadAvatarsAsync` проверяет этот штамп перед каждой аватаркой — если прошло меньше 5 секунд, ждёт. Аватарки автоматически уступают место запросу сообщений.

**Решение A — Авторетрай** (`nativeStore.js`):  
Если `tg:get-messages` вернул ошибку — через 3 секунды автоматически повторяет запрос. При успехе приходит `tg:messages` и чат обновляется без участия пользователя. При повторной ошибке — снимает флаг `loadingMessages` чтобы shimmer не висел вечно.

**Решение B+C — Индикатор загрузки** (`InboxChatPanel.jsx`):  
`MessageListOverlay` (синяя полоска + «Обновляю сообщения...») теперь показывается не только при начальном скролле, но и когда идёт загрузка поверх кэша. Пользователь видит 1 старое сообщение + синюю анимацию вверху вместо пустого чата.

**Затронутые файлы:**
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — `state.msgRequestTs` (499/500 строк — файл на пределе, следующее изменение требует разбиения!)
- [`main/native/telegramChats.js`](../main/native/telegramChats.js) — пауза при `msgRequestTs < 5000мс`
- [`src/native/store/nativeStore.js`](../src/native/store/nativeStore.js) — авторетрай через 3с
- [`src/native/components/InboxChatPanel.jsx`](../src/native/components/InboxChatPanel.jsx) — overlay при `loadingMessages`

---

### v0.87.117 — Диагностические логи: «1 сообщение в чате»

Добавлены диагностические логи в `tg:get-messages` для расследования бага «в чате показывается только 1 сообщение вместо 50»:
- Предупреждение `WARN: entity-fallback` когда `chatEntityMap` пуст и GramJS получает числовую строку вместо полноценного entity
- Лог фактического числа сообщений и источника entity (`hasEntity=true/false`)
- Детекция `FLOOD_WAIT` в catch-блоке — основная причина пустого ответа при старте (загрузка 659 аватарок ~132с держит Telegram rate-limit)

**Затронутые файлы:**
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — 496/500 строк (критически близко к лимиту)

---

### v0.87.116 — Время сбоку + аватарки +20%

- Время сообщения перенесено вправо на уровень текста (flex-row). Для фото/видео и пустых сообщений — остаётся снизу.
- Аватарки в списке чатов: 44px → 53px (+20%), шрифт инициалов 16→19px, высота строки 64→74px.
- Аватарки отправителей в сообщениях: 32px → 38px (+20%), шрифт инициалов 12→14px.

**Затронутые файлы:**
- [`src/native/components/MessageBubble.jsx`](../src/native/components/MessageBubble.jsx)
- [`src/native/components/ChatListItem.jsx`](../src/native/components/ChatListItem.jsx)
- [`src/native/components/InboxChatListSidebar.jsx`](../src/native/components/InboxChatListSidebar.jsx)
- [`src/native/styles-messages.css`](../src/native/styles-messages.css)

---

### v0.87.115 — Фикс пустой аватарки чата (показывались blank вместо инициалов)

**Причина**: `loadAvatarsAsync` сохранял 0-байтовые JPEG и слал URL как `chat.avatar` → CSS пытался рендерить пустой файл → белый/пустой круг. Код `!chat.avatar` был `false` → инициалы не рисовались.

**Фикс**:
1. `telegramChats.js` (кэш): если файл существует, но размер 0 байт — удаляем, скачиваем заново
2. `telegramChats.js` (скачивание): `if (!buffer || buffer.length === 0)` — не сохранять и не эмитировать 0-байтовый файл
3. `telegramMessages.js` (`mapMessage`): добавлена проверка размера файла при чтении `senderAvatar` из кэша

**Результат**: при следующем запуске приложения 0-байтовые файлы удалятся, аватарки попытаются скачаться заново. Если фото нет — `chat.avatar` остаётся `null` → отображаются инициалы как в настоящем Telegram.

**Затронутые файлы:**
- [`main/native/telegramChats.js`](../main/native/telegramChats.js)
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js)

---

### v0.87.106 – v0.87.114 — заархивированы

Перенесены в [`archive/features-v0.87.106-114.md`](./archive/features-v0.87.106-114.md) (релиз v0.89.5, 15 мая 2026 — `features.md` перевалил 100 КБ лимит после четырёх audit-релизов).

В архиве: убран счётчик чатов (v0.87.114), главный фикс аватарок отправителей в групповых чатах (v0.87.113), `GetFullUser` для User без photo (v0.87.112), фоновое скачивание аватарок отправителей (v0.87.111), визуал мьюта + двухуровневое меню (v0.87.110), заглушение уведомлений чата (v0.87.109), кнопки режимов в шапке (v0.87.108), убрана угловая иконка с аватарки (v0.87.107), финальный multi-account UI (v0.87.106).

---

### v0.87.93 – v0.87.105 — заархивированы

Перенесены в [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) (релиз v0.88.2, 13 мая 2026 — `features.md` перевалил 100 КБ лимит).

В архиве: реализация multi-account для native Telegram (v0.87.105), план multi-account (v0.87.104), разбиение 5 файлов на 80%+ (v0.87.103), CodeInput-ячейки (v0.87.102), libphonenumber-js (v0.87.101), CountryPicker (v0.87.99-100), фикс retry-цикла GramJS (v0.87.98), Low Priority разбиение 4 файлов (v0.87.97), фильтр GramJS TIMEOUT (v0.87.96), полный выход из аккаунта (v0.87.95), умный logger (v0.87.94), фикс аватарки через `cc-media://` (v0.87.93).

---
