# Архив: features.md записи v0.89.1 — v0.89.5

Заархивировано 15 мая 2026 при релизе v0.89.14 (features.md превысил 100 КБ лимит после серии видео-фиксов v0.89.7–v0.89.14).

В архиве: TDLib миграция Этап 4 — полное удаление GramJS (v0.89.1), 4 раунда аудита (v0.89.2–v0.89.5):
- v0.89.5: четвёртый аудит — drift fixes (0 функциональных регрессий)
- v0.89.4: третий аудит — emit-направление IPC + удаление GramJS dep (8 регрессий)
- v0.89.3: второй аудит — IPC контракты UI ↔ backend (3 user-facing регрессии)
- v0.89.2: пост-миграционный аудит TDLib стека (6 фиксов по docs)
- v0.89.1: TDLib миграция Этап 4: полное удаление GramJS

См. историю архивации в [`./README.md`](./README.md).

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

