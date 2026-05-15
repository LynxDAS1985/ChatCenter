# Реализованные функции — ChatCenter

## Текущая версия: v0.89.2 (15 мая 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.87.106 → v0.88.2). Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
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

### v0.87.114 — Убран счётчик чатов + правило в CLAUDE.md

- Убран `💬 659` из шапки списка чатов (`InboxChatListSidebar.jsx` строка 138). Теперь строка с количеством показывается **только при активном поиске** («найдено X из Y»), в обычном режиме — скрыта.
- В `CLAUDE.md` добавлен пункт §4 «Никаких изменений без прямой просьбы».

**Затронутые файлы:**
- [`src/native/components/InboxChatListSidebar.jsx`](../src/native/components/InboxChatListSidebar.jsx)

---

### v0.87.113 — ГЛАВНЫЙ фикс аватарок отправителей в групповых чатах ✅ РАБОТАЕТ

**Результат**: аватарки отправителей в групповых чатах появляются через несколько секунд после открытия чата. При повторном открытии — сразу.

**Полная история проблемы (4 шага неудач)**:

| Версия | Что делали | Почему не помогло |
|---|---|---|
| v0.87.110 | `mapMessage` читает аватарку из файлового кэша | Кэш пустой — `loadAvatarsAsync` не скачивает участников групп |
| v0.87.111 | Фоновое скачивание `downloadSenderAvatarsInBackground` | Файлы скачивались, IPC слал события — но аватарки не появлялись |
| v0.87.112 | `GetFullUser` для User без photo в базовой entity | Скачивалось больше — но всё равно не показывалось |
| **v0.87.113** | **`senderAvatar` добавлен в `messageGrouping.js`** | **← настоящая причина** |

**Корень**: `groupMessages()` создавал group-объекты без поля `senderAvatar`. `InboxChatPanel.jsx` читает `item.senderAvatar` — поле отсутствовало → всегда `undefined`. Файлы были, IPC работал, данные терялись при группировке сообщений.

**Правило на будущее**: при добавлении нового поля в message — сразу проверять `messageGrouping.js` строки ~22 и ~62. Любое поле не перечисленное в `currentGroup = {...}` — недоступно в `InboxChatPanel.jsx`.

**Затронутые файлы (v0.87.111–113)**:
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — `downloadSenderAvatarsInBackground` + `GetFullUser` fallback
- [`src/native/store/nativeStoreIpc.js`](../src/native/store/nativeStoreIpc.js) — обработчик `tg:sender-avatar`
- [`src/native/utils/messageGrouping.js`](../src/native/utils/messageGrouping.js) — `senderAvatar` в group и album объектах

---

### v0.87.112 — Фикс аватарок: GetFullUser для User без photo в базовой entity

**Причина** (найдена через логи): `downloadSenderAvatarsInBackground` вызывал `downloadProfilePhoto(m.sender)` напрямую. У части User-объектов из группы `photo=n/a` — базовая GramJS entity не содержит атрибут photo. `downloadProfilePhoto` при `entity.photo === null` немедленно возвращает `null` без запроса к серверу. Буфер null → тихий пропуск.

**Из логов**: `total=50 noSender=0 toDownload=7` — 7 хотели скачать, только 3 получили `OK`. Остальные 4 имели `photo=n/a`.

**Фикс**: перед `downloadProfilePhoto` — если `sender.photo` отсутствует/пустой, вызываем `Api.users.GetFullUser` чтобы получить полный профиль (то же что делает `loadAvatarsAsync` для диалогов). Если и в полном профиле нет фото — пропускаем. Добавлено логирование ошибок (было тихо).

**Затронутые файлы:**
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — `GetFullUser` fallback в `downloadSenderAvatarsInBackground`

---

### v0.87.111 — Фоновое скачивание аватарок отправителей групп

**Причина**: `loadAvatarsAsync` скачивает аватарки только для диалогов из списка чатов. Участники групповых чатов, с которыми нет прямого диалога, никогда не попадали в кэш → в сообщениях всегда показывались цветные круги с инициалами вместо фотографий.

**Как работает:**
- Бэкенд: после `tg:get-messages` запускается `downloadSenderAvatarsInBackground(msgs, chatId, client)` без `await` — не блокирует UI
- Функция собирает уникальных отправителей (не исходящих), у которых нет файла `tg-avatars/{senderId}.jpg`
- Скачивает через `client.downloadProfilePhoto(m.sender, { isBig: false })` с throttle 200мс между запросами + обработкой FLOOD_WAIT
- После каждой загрузки эмитирует `tg:sender-avatar { chatId, senderId, avatarUrl }`
- Фронт: новый обработчик в `nativeStoreIpc.js` — обновляет `senderAvatar` во всех сообщениях этого чата с совпадающим `senderId`
- При повторном открытии чата файлы уже есть → `mapMessage` сразу возвращает URL, без задержки

**Затронутые файлы:**
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — функция `downloadSenderAvatarsInBackground` + вызов после emit `tg:messages`
- [`src/native/store/nativeStoreIpc.js`](../src/native/store/nativeStoreIpc.js) — обработчик `tg:sender-avatar`

---

### v0.87.110 — Визуал мьюта + двухуровневое меню + аватарки отправителей в группах

**Три изменения в одном релизе:**

**1. Тёмная аватарка для заглушённых чатов** (`ChatListItem.jsx`)
- `filter: brightness(0.5) saturate(0.4)` — аватарка становится тёмно-серой
- Маленький кружок 16px со значком 🔕 в левом нижнем углу аватарки
- Отдельная иконка 🔕 в строке убрана — всё на аватарке
- Серый бейдж непрочитанных сохраняется

**2. Двухуровневое меню мьюта** (`MuteMenu.jsx`)
- Шаг 1 «main»: «🔕 Выключить уведомления ›» (если не заглушён) или «🔔 Включить» + «Изменить время ›»
- Шаг 2 «times»: «‹ Назад» в шапке + 6 временных интервалов
- Esc на шаге 2 → возврат на шаг 1 (не закрывает меню)
- Стрелка › в конце кнопки показывает что есть подменю

**3. Фикс аватарок отправителей в групповых чатах** (`InboxChatPanel.jsx` + `telegramMessages.js`)
- **Проблема**: все сообщения показывали аватарку самого чата (`activeChat.avatar`) — баг с v0.87.27
- **Причина**: `const groupChat = !item.isOutgoing ? activeChat : null` → брал фото чата для всех
- **Решение**: `mapMessage` теперь добавляет поле `senderAvatar` — путь к кэшированному фото отправителя из `tg-avatars/{senderId}.jpg` (если скачано). Фронт использует `item.senderAvatar`, при отсутствии — цветной круг с инициалами по хэшу `senderId`
- **Ограничение**: фото отображается только если аватарка отправителя уже скачана `loadAvatarsAsync`. При первом открытии чата может быть цветной круг — после перезапуска/обновления появится фото

**Затронутые файлы:**
- [`src/native/components/ChatListItem.jsx`](../src/native/components/ChatListItem.jsx) — тёмная аватарка + 🔕 кружок, убрана строчная иконка
- [`src/native/components/MuteMenu.jsx`](../src/native/components/MuteMenu.jsx) — двухуровневый step-state ('main'|'times')
- [`main/native/telegramMessages.js`](../main/native/telegramMessages.js) — `senderAvatar` в mapMessage из кэша
- [`src/native/components/InboxChatPanel.jsx`](../src/native/components/InboxChatPanel.jsx) — `item.senderAvatar` вместо `activeChat.avatar`, fallback-цвет по хэшу senderId

---

### v0.87.109 — Заглушение уведомлений чата (мьют)

**Что изменилось:** ПКМ по чату в списке → контекстное меню как в Telegram.

**Временные интервалы:** На час / На 4 часа / На 8 часов / На 1 день / На 3 дня / Навсегда.
Если чат уже заглушён — первым пунктом «Включить уведомления» (зелёный).

**Затронутые файлы:**
- [`main/native/telegramChats.js`](../main/native/telegramChats.js) — `mapDialog` извлекает `isMuted` + `muteUntil` из `d.dialog?.notifySettings?.muteUntil`
- [`main/native/telegramChatsIpc.js`](../main/native/telegramChatsIpc.js) — новый handler `tg:set-mute` через `Api.account.UpdateNotifySettings`
- [`src/native/store/nativeStore.js`](../src/native/store/nativeStore.js) — action `setMute(chatId, muteUntil)` с оптимистичным обновлением
- [`src/native/components/MuteMenu.jsx`](../src/native/components/MuteMenu.jsx) — **новый** компонент, `position: fixed`, закрывается по Esc/клику снаружи
- [`src/native/components/InboxChatListSidebar.jsx`](../src/native/components/InboxChatListSidebar.jsx) — `muteMenu` state + `handleContextMenu` + передаёт `onContextMenu` в `rowProps`
- [`src/native/components/ChatRow.jsx`](../src/native/components/ChatRow.jsx) — пробрасывает `onContextMenu` в `ChatListItem`
- [`src/native/components/ChatListItem.jsx`](../src/native/components/ChatListItem.jsx) — 🔕 иконка + серый бейдж для заглушённых чатов

---

### v0.87.108 — Кнопки режимов перенесены в шапку правой панели (Вариант A)

**Что изменилось:**

| Было | Стало |
|---|---|
| Шапка `native-header` (48px) с «ЦентрЧатов» + [Чаты][Клиенты][Доска] над всем | Шапки нет — список чатов и правая панель занимают всю высоту |
| Кнопки режимов слева над списком чатов | Кнопки в шапке правой панели (над окном чата) |

**Затронутые файлы:**
- `src/native/NativeApp.jsx` — удалён `<div className="native-header">`, кнопки убраны оттуда; `modes={MODES}` передаётся в `<InboxMode>`; для non-inbox placeholder добавлена обёртка с кнопками сверху
- `src/native/modes/InboxMode.jsx` — принимает `modes` пропом; в шапке правой колонки рисует переключатель 48px с теми же CSS-классами

**Итоговый вид:**
```
┌─ боковая ─┬────────────────────┬──────────────────────────────┐
│           │  🔍 Поиск...       │  [Чаты ●][Клиенты][Доска]    │
│  БНК 🟢   │  [Все][БНК][Avto] │  ─────────────────────────   │
│  Avto 🟢  │  ── 659 ──         │  [Имя чата]     ✈️ Tg · БНК  │
│  [ + ]    │  список чатов      │  сообщения...                │
└───────────┴────────────────────┴──────────────────────────────┘
```

**Тесты:** lint 0 / vitest 143/143

---

### v0.87.107 — Убрана угловая иконка с аватарки чата

**Изменение**: в `ChatListItem.jsx` удалён блок с угловой ✈️ на аватарке 44px.
**Причина**: под именем чата уже есть микро-строка «✈️ Telegram · БНК» — двойного обозначения не нужно.
**Что не тронуто**: полоса слева, микро-строка (с tooltip), hover-поведение, всё остальное.

**Подтверждено работающим (визуальная приёмка v0.87.106)**:
- ✅ Sidebar: два круга 48px с фото профиля + имена снизу
- ✅ На круге аккаунта: ✈️ в углу + зелёная точка онлайн
- ✅ Красный кружок с цифрой при наличии непрочитанных
- ✅ Поиск сверху, фильтр-кнопки ПОД поиском
- ✅ Синяя полоса слева на каждом чате
- ✅ Микро-строка «✈️ Telegram · БНК» под именем чата (tooltip работает)
- ✅ Hover на аккаунте → его чаты подсвечены, чужие приглушены
- ✅ В шапке открытого чата — серый маркер «✈️ Telegram · БНК»

---

### v0.87.106 — Финальный multi-account UI (визуальный пакет)

**Контекст**: в v0.87.105 multi-account был реализован функционально — два аккаунта работали, чаты не путались. Но визуально UI был сырой: квадратные бейджи с буквой `Б` рядом с именем чата, sidebar с яркой синей подсветкой активного, фильтр сверху над поиском. Пользователь по итогам обсуждения 3 вариантов выбрал финальный дизайн.

**Что выбрано** (после 3 итераций обсуждения):

| Блок | Решение |
|---|---|
| Sidebar | Круг + имя + ✈️ + точка онлайн + бейдж непрочит. **БЕЗ** яркого фона активного |
| Фильтр-кнопки | Перенесены **ПОД** поиск |
| Список чатов | Цветная полоса слева 3px (фирменный цвет мессенджера) + ✈️ в углу аватарки + микро-строка «✈️ Telegram · БНК» |
| Цвет полосы | Telegram=#2AABEE, WhatsApp=#25D366, VK=#0077FF, MAX=#7B3FE4, Viber=#7360F2 |
| Hover-tooltip | На бейджах в sidebar и на угловой ✈️ в чатах |
| Иконка типа чата | 👤 👥 📢 🤖 — оставлена ПЕРЕД именем (как было) |
| Бонус | В шапке открытого чата — серый маркер «✈️ Telegram · БНК» |
| Улучшение 1 | Hover на аккаунте в sidebar → его чаты подсвечиваются (rgba(42,171,238,0.05)), чужие приглушаются (opacity 0.35) |

**Затронутые файлы (9)**:

1. **`src/native/utils/messengerBranding.js`** (новый) — `MESSENGER_COLORS`, `MESSENGER_EMOJI`, `MESSENGER_NAMES` константы + helpers `getMessengerColor/Emoji/Name`. Готов к расширению при добавлении WhatsApp/VK/MAX.

2. **`src/native/NativeApp.jsx`**:
   - Новый компонент `AccountAvatar` (круг 48px + ✈️ в углу + точка онлайн + бейдж непрочит + имя снизу).
   - `unreadByAccount` useMemo — подсчёт непрочитанных по аккаунтам.
   - `hoveredAccountId` state + `onMouseEnter`/`Leave` на `AccountAvatar`.
   - Передача `hoveredAccountId` в `<InboxMode>`.
   - Удалена логика яркой подсветки активного (`native-account--active`).

3. **`src/native/components/ChatListItem.jsx`** — переписан:
   - Цветная полоса слева 3px (`stripeColor` из `messengerBranding`) — рисуется только при `multiAccount=true`.
   - Угловая ✈️ (18px) в правом нижнем углу 44px-аватарки чата.
   - Микро-строка под именем «✈️ Telegram · БНК» серым 10px (только в multi-account).
   - `dimmed` (opacity 0.35) когда `hoveredAccountId !== chat.accountId` (Улучшение 1).
   - `highlighted` (фоновое подсвечивание) когда `hoveredAccountId === chat.accountId`.
   - Tooltip с именем мессенджера + аккаунта + телефоном.
   - Удалена старая `accBadge` логика (квадратик с буквой).

4. **`src/native/components/ChatRow.jsx`** — пробрасывает `hoveredAccountId` + `multiAccount` (вместо `showAccountBadge`).

5. **`src/native/components/InboxChatListSidebar.jsx`**:
   - Поиск перенесён ВВЕРХ кода (= ВЫШЕ в UI).
   - Фильтр-кнопки идут ПОСЛЕ поиска (= ПОД поиском в UI).
   - Принимает `hoveredAccountId` пропом и пробрасывает в `ChatRow.rowProps`.

6. **`src/native/modes/InboxMode.jsx`** — принимает `hoveredAccountId` от родителя, пробрасывает в `<InboxChatListSidebar>`.

7. **`src/native/components/InboxChatPanel.jsx`** — в шапке открытого чата при 2+ аккаунтах рисуется маркер `✈️ Telegram · БНК` серым 11px справа от имени чата (Бонус).

8. **`src/__tests__/multiAccount.test.cjs`** — обновлён, +14 проверок:
   - `messengerBranding`: фирменные цвета `#2AABEE`/`#25D366` + `✈️`.
   - `ChatListItem`: импорт `messengerBranding`, полоса слева, угловая ✈️, микро-строка, dimmed.
   - `ChatRow`: пробрасывает `hoveredAccountId`.
   - `Sidebar (NativeApp.jsx)`: компонент `AccountAvatar`, угловой ✈️, `unreadByAccount`, `setHoveredAccountId`.
   - Удалена яркая подсветка активного (тест проверяет отсутствие `'native-account--active'` в условиях рендера).
   - `InboxChatPanel` импортирует `messengerBranding`.
   - Поиск идёт В КОДЕ выше блока фильтров (= в UI выше).
   - Итого: 56 проверок (было 42).

9. **`src/native/components/__snapshots__/ChatListItem.vitest.jsx.snap`** — обновлён под новую разметку (полоса слева добавила `padding-left: 14px` и `transition: opacity`).

**Что юзер увидит**:

- **1 аккаунт** — UI почти как раньше: фильтр и бейджи скрыты, sidebar показывает один круг с именем.
- **2+ аккаунтов**:
  - Sidebar: два круга с реальными фото профиля Telegram, под каждым — имя «БНК» / «Avtoliberty». В углу — ✈️ синий. Снизу справа — зелёная точка-индикатор онлайн. Если в аккаунте есть непрочитанные — красный кружок с цифрой в левом верхнем углу.
  - Поиск сверху, под ним — кнопки `[Все 655] [БНК 458] [Avtoliberty 197]`.
  - Каждый чат: синяя полоса слева, на 44px-аватарке в углу мини-✈️, под именем чата мелким серым «✈️ Telegram · БНК».
  - Hover на круге БНК в sidebar → все его чаты подсвечиваются, чужие приглушаются.
  - В открытом чате в шапке справа от имени — «✈️ Telegram · БНК» серым.

**Тесты**: все 32 cjs-теста (включая новый `multiAccount` 56/56) + vitest 143/143 + lint 0 ошибок + fileSizeLimits 206/206.

**Что не задето**: бизнес-логика multi-account из v0.87.105 (Map клиентов, IPC routing, миграция старой сессии), Login flow, отправка/приём сообщений, scroll/markRead, AI-помощник, WebView режим.

---

### v0.87.93 – v0.87.105 — заархивированы

Перенесены в [`archive/features-v0.87.93-105.md`](./archive/features-v0.87.93-105.md) (релиз v0.88.2, 13 мая 2026 — `features.md` перевалил 100 КБ лимит).

В архиве: реализация multi-account для native Telegram (v0.87.105), план multi-account (v0.87.104), разбиение 5 файлов на 80%+ (v0.87.103), CodeInput-ячейки (v0.87.102), libphonenumber-js (v0.87.101), CountryPicker (v0.87.99-100), фикс retry-цикла GramJS (v0.87.98), Low Priority разбиение 4 файлов (v0.87.97), фильтр GramJS TIMEOUT (v0.87.96), полный выход из аккаунта (v0.87.95), умный logger (v0.87.94), фикс аватарки через `cc-media://` (v0.87.93).

---
