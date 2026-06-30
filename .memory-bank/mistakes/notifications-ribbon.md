# Ловушки: кастомные уведомления (Messenger Ribbon)

---

## 🔴 MAX: скрытый reset title-state после v1.2.26 снова запускал старый sidebar-preview (v1.2.27)

**Кто нашёл**: Codex, 29 июня 2026, после повторной жалобы пользователя “опять показало уведомление” и проверки свежего `chatcenter.log`.

**Симптом**: после фикса v1.2.26 старое MAX-сообщение `Ууа` всё равно один раз появилось как новое уведомление после перезагрузки/переходов по чатам.

**Факты из свежей диагностики**:
- `system-diagnostics-report.json` был версии `1.2.26`;
- в `chatcenter.log` было `MAX title baseline only | reason=baseline`, значит v1.2.26 реально загрузился и первый baseline отработал;
- позже снова было `MAX page-title-updated raw="1 непрочитанный чат" prevUnread=0 delta=1`;
- сразу после этого был `MAX title-fallback scheduled`;
- `MAX title-fallback raw` вернул `source="max-title-sidebar"`, `text="Ууа"`, sender `Дугин Алексей Сергеевич`, avatar из sidebar;
- `NotifManager show` показал это как новое уведомление, а затем сыграл звук.

**Почему предыдущее решение было неполным**: v1.2.26 сравнивал MAX title-count с прошлым MAX title-count, но в ветке title без числа оставался `resetMaxTitleUnread()`. Этот reset не логировался. После скрытого reset старый title-count `1` снова выглядел как новый.

**Корень**: `page-title-updated` у MAX — это событие заголовка страницы и счётчика чатов, а не событие новой message bubble. `max-title-sidebar` читает список чатов, где лежит последний preview, и при навигации может снова вернуть старый текст. Значит title fallback нельзя считать источником уведомления для MAX.

**Решение v1.2.27**:
- для MAX `decideMaxTitleUnread()` всегда возвращает `schedule=false`;
- даже рост title-count помечается как `increased-title-only`, но не запускает ribbon;
- скрытый reset убран: `resetMaxTitleUnread()` для MAX больше не сбрасывает состояние;
- в `webviewSetup.js` добавлена строка диагностики `MAX title reset skipped`;
- строка диагностики для title-события стала `MAX title-only no-ribbon`;
- реальные пути `__CC_NOTIF__`, `MAX-QUICK`, `max-notification`, sender/text/avatar/sound не отключались.

**Что НЕ делать дальше**:
- не возвращать `max-title-sidebar` как полноценный источник уведомлений для MAX без структурного доказательства новой bubble;
- не блокировать слова (`Сообщение`, даты, `Ууа`, короткие тексты);
- не считать `prevUnread=0 delta=1` фактом нового сообщения, если источник только title.

**Как проверять**:
1. Перезапустить приложение, оставить в MAX старый непрочитанный чат.
2. Переходить по MAX-чатам.
3. В логе должны быть `MAX title-only no-ribbon` и/или `MAX title reset skipped`.
4. Не должно быть `MAX title-fallback scheduled` из-за MAX title.
5. Не должно быть `NotifManager show` на старый sidebar-preview.
6. Реальное новое сообщение должно проходить через `__CC_NOTIF__`, `[MAX-QUICK]`/`[IPC-MAX] channel=new-message` или другой подтверждённый источник message bubble.

## 🔴 MAX: React unread сбрасывался в 0 и превращал старый title-count в новый фантом (v1.2.26)

**Кто нашёл**: Codex, 29 июня 2026, по свежей фоновой диагностике после жалобы пользователя: “опять фантом сообщения пришло после перезагрузки”.

**Симптом**: после перезапуска приложения в MAX уже было старое непрочитанное сообщение `Ууа`. Пользователь переходил по чатам, и это старое сообщение снова показывалось уведомлением как новое, хотя клиент ничего нового не писал.

**Факты из диагностики**:
- `system-diagnostics-report.json` был уже от версии `1.2.25`;
- в логе был `MAX title baseline only`, значит первый baseline из v1.2.25 сработал;
- позже была строка `MAX page-title-updated raw="1 непрочитанный чат" prevUnread=0 delta=1`;
- дальше шло `MAX title-fallback scheduled`;
- `max-title-sidebar` возвращал старый preview `Ууа`, sender `Дугин Алексей Сергеевич`, avatar был найден;
- `NotifManager show` показывал это как новое уведомление;
- повтор этого же preview позже уже блокировался как `MAX title-fallback stale sidebar | known-sidebar-preview`.

**Корень**: v1.2.25 сделал только one-shot baseline. Он защищал первый title-count после запуска, но дальше код продолжал сравнивать title-count MAX с React-состоянием `unreadCounts`. Это состояние может становиться `0` при навигации/сбросе UI, хотя заголовок MAX всё ещё показывает старый `1 непрочитанный чат`. В результате одно и то же состояние сайта `1 -> 1` выглядело как ложный рост `0 -> 1`.

**Правильное правило**: для MAX title fallback надо сравнивать title-count только с предыдущим MAX title-count. `page-title-updated` не доказывает новый message bubble. Он доказывает только изменение заголовка/счётчика сайта.

**Решение v1.2.26**:
- добавлен helper `decideMaxTitleUnread()`;
- хранится отдельный последний MAX title-count;
- если новый title-count равен старому или меньше старого, fallback не запускается;
- в диагностике пишется `MAX title baseline only | reason=not-increased prev=N`;
- если title-count реально вырос, fallback остаётся рабочим;
- если title MAX очищается/нет числа, отдельный title-count сбрасывается в `0`;
- `__CC_NOTIF__`, `MAX-QUICK`, `max-notification`, sender, text, avatar и звук не отключались.

**Почему не блокируем слова**: проблема не в тексте `Ууа`, `Сообщение`, дате или коротких сообщениях. Клиент может написать любой такой текст. Блокировка должна быть по источнику и состоянию: `max-title-sidebar` можно запускать только когда title-count MAX реально вырос.

**Как проверять**:
1. Оставить в MAX старый непрочитанный чат.
2. Полностью перезапустить приложение.
3. Открывать MAX и переходить по чатам.
4. В диагностике на повторном `1 непрочитанный чат` должна быть строка `reason=not-increased prev=1`.
5. Не должно быть `MAX title-fallback scheduled`, `NotifManager show` и звука на старый preview.
6. При настоящем новом сообщении через `__CC_NOTIF__` уведомление должно появиться с текстом, отправителем, аватаркой и звуком.

## 🔴 MAX: первый title-count после перезапуска принимался за новое сообщение (v1.2.25)

**Кто нашёл**: Codex, 29 июня 2026, по свежей фоновой диагностике после жалобы пользователя: “после загрузки приложения висели старые сообщения, я открывал другие чаты, и старые уведомления опять показывались фантомно”.

**Симптом**: после полного закрытия и нового запуска приложения пользователь открывал MAX и переходил по чатам. В MAX уже были старые непрочитанные. Приложение могло один раз показать старый preview (`Ууа`) как новое уведомление. Второй раз обычно уже не повторялось.

**Факты из диагностики**:
- `system-diagnostics-report.json` показал `MAX page-title-updated raw="1 непрочитанный чат"` и `raw="2 непрочитанных чата"`;
- рядом было `prevUnread=0 delta=1/2`, потому что после перезапуска renderer ещё не имел baseline счётчика;
- после этого запускался `MAX title-fallback`;
- `max-title-sidebar` выбирал старую строку списка чатов `Дугин Алексей Сергеевич / Ууа`;
- последующие такие же попытки уже блокировались как `MAX title-fallback stale sidebar | known-sidebar-preview`.

**Корень**: v1.2.24 хранил fingerprint только в памяти текущей сессии. После закрытия приложения эта память очищается. Первый title-count MAX после загрузки — это не новое сообщение, а синхронизация уже существующего счётчика сайта. Старый код принимал `0 -> 1/2` за рост и запускал fallback.

**Решение v1.2.25**:
- для MAX добавлен cold-start baseline title-счётчика;
- первый MAX title-count после запуска только обновляет unread count и пишет `MAX title baseline only`;
- на этом первом baseline не запускаются `scheduleMaxTitleFallback`, ribbon и звук;
- после baseline следующие реальные изменения продолжают идти обычным путём;
- не добавлены словесные блокировки и не отключён `max-title-sidebar` полностью.

**Как проверять**:
1. Закрыть приложение полностью.
2. Оставить в MAX старые непрочитанные.
3. Запустить приложение и походить по MAX-чатам.
4. В диагностике должна быть строка `MAX title baseline only`.
5. Не должно быть ribbon/звука на старый preview сразу после запуска.

## 🔴 MAX: старый sidebar-preview повторялся как новое уведомление при переходах по чатам (v1.2.24)

**Кто нашёл**: Codex, 29 июня 2026, по фоновой диагностике пользователя.

**Симптом**: пользователь получил реальное сообщение MAX `Ууа`, потом переходил по чатам с непрочитанными. Приложение снова показывало уведомление `Ууа` со звуком, хотя клиент в этот момент ничего нового не писал.

**Что показала диагностика**:
- первый `Ууа` пришёл корректно через `__CC_NOTIF__`, дальше были `custom-notify`, `NotifManager show`, звук и avatar;
- при переходах по чатам появлялись события `page-title-updated` с title вроде `1 непрочитанный чат`;
- после этого запускался `MAX title-fallback`;
- источник повторного уведомления был не `__CC_NOTIF__`, а `max-title-sidebar`;
- `max-title-sidebar` возвращал старую строку из списка чатов: sender `Дугин Алексей Сергеевич`, text `Ууа`, avatar из sidebar;
- приложение принимало этот старый preview как новое сообщение.

**Корень**: `page-title-updated` в Electron для MAX говорит о смене заголовка/счётчика, но не доказывает появление новой message bubble. Запасной путь `max-title-sidebar` читает список чатов, где лежит последний preview. При навигации этот preview может повториться без нового сообщения.

**Что НЕ делать**:
- не блокировать слово `Сообщение`, даты, `Спасибо`, короткие тексты или случайные буквы глобально;
- не отключать `max-title-sidebar` полностью, потому что он всё ещё полезен как запасной путь, когда основной MAX notification/observer не сработал;
- не трогать `__CC_NOTIF__`, `MAX-QUICK`, `max-notification`, звук и avatar, если проблема только в повторе sidebar-preview.

**Решение v1.2.24**:
- для `max-title-sidebar` введён fingerprint: messenger + chat/sender + sender + text + badge;
- если такой preview уже есть в `recentNotifs`, значит сообщение уже прошло нормальным путём и повтор от sidebar надо остановить;
- если такой preview уже показывал сам sidebar fallback, повтор при следующем переходе тоже надо остановить;
- TTL 10 минут: достаточно для навигационных фантомов, но не вечная блокировка;
- лимит 200 fingerprint-записей: не даём памяти расти бесконечно.

**Как должно работать после ремонта**:
1. Реальное новое MAX-сообщение через `__CC_NOTIF__` показывает ribbon/звук/avatar как раньше.
2. Повтор старого preview из sidebar при переходах по чатам не показывает новое уведомление.
3. Новый текст от того же клиента не блокируется только из-за имени отправителя.
4. В логе при блоке видно: `MAX title-fallback stale sidebar | already-seen-in-recentNotifs` или `known-sidebar-preview`.

**Где смотреть следующему ИИ**:
- код защиты: `src/utils/maxTitleFallback.js`;
- подключение состояния: `src/utils/webviewSetup.js`;
- тесты: `src/__tests__/maxTitleFallback.test.cjs`;
- диагностический признак бага: есть `MAX title-fallback max-title-sidebar` после `page-title-updated`, но текст уже был в `__CC_NOTIF__`/`recentNotifs`.

## 🔴🔴 Диагностический логгер в горячем render-пути → IPC спам → тихая потеря уведомлений (v1.2.12)

**Симптом**: `[NotifManager] show id=N` есть в `chatcenter.log`, но уведомление **не появляется на экране** (или мелькает доли секунды). Native Telegram, не заглушённые чаты. Юзер уверен «я не мог не заметить».

**Сценарий воспроизведения**:
- Открыть Native Telegram, начать скроллить активный чат
- В другой чат приходит новое сообщение
- Главное окно показывает `[NotifManager] show id=N sender=… body=…` в логе ✅
- Окно ribbon в правом нижнем углу — НЕ появляется ❌

**Корень**: в [`MessageBubble.jsx`](../../src/native/components/MessageBubble.jsx) была функция-счётчик `__ccLogBubbleRender(m)` (v0.95.29, диагностика дубля исходящих сообщений). Она вызывалась на КАЖДЫЙ рендер компонента сообщения. React virtuoso перерендеривает сотни сообщений при скролле. За 30 мин юзер-сессии — **168 508 IPC `app:log`** (≈93/сек).

**Цепочка отказа**:
```
```

### Дополнение 29 июня 2026 — MAX: не было уведомлений на несколько сообщений подряд

Кто нашел: Codex, по запросу пользователя после кейса с MAX-чатом `Дугин Алексей Сергеевич`.

Что было видно пользователю: в открытом MAX-чате подряд пришли несколько разных сообщений (`Выпп`, `Ввпр`, `Ааап`, `Увмрр`), в списке чатов badge вырос до `4`, но уведомление/звук были не на каждое сообщение.

Что показали факты:
- для пропавших сообщений в `chatcenter.log` не было `IPC new-message`, `__CC_MSG__`, `__CC_NOTIF__`, `NotifManager show`;
- значит проблема была не в отрисовке ribbon и не в звуке, а раньше: сообщение не входило в pipeline приложения;
- `MAX title/unread fallback` надежно дает только первое/сводное событие, но не каждую bubble в уже открытом чате;
- для открытого MAX-чата правильный источник — `MutationObserver` на контейнере сообщений;
- в диагностике WebView текущий DOM MAX показывал `DIV.messageWrapper ...`, а старый `findChatContainer()` искал в основном `.history`, `.openedChat` и `.message.svelte...`;
- body fallback для MAX оставлен выключенным намеренно: он раньше давал фантомы из sidebar/страницы;
- фильтровать слова нельзя: клиент может реально написать `18 июн.`, `Спасибо`, короткий текст или случайный набор букв.

Корень проблемы: observer открытого MAX-чата мог не привязаться к реальному контейнеру сообщений, потому что MAX изменил/использовал DOM с `messageWrapper`, а старый поиск контейнера этого не учитывал. Когда observer не привязан, следующие сообщения видны в MAX UI, но приложение их не получает как `new-message`.

Что сделано:
- `main/preloads/utils/domSelectors.js`: добавлен `findMaxMessageWrapperContainer()`;
- поиск MAX-контейнера теперь умеет находить видимые `messageWrapper` в правой области чата;
- observer ставится не на один пузырек, а на общего родителя нескольких message wrappers;
- sidebar отсекается через `isSidebarNode()`;
- body fallback для MAX не включался;
- старый `.message.svelte...` fallback сохранен как запасной;
- добавлен diagnostic log `__CC_DIAG__findChatContainer: MAX messageWrapper ancestor`.

Как должно работать после правки:
1. При открытии MAX-чата preload ищет контейнер сообщений.
2. Если старые selectors не сработали, он ищет текущие `messageWrapper`.
3. Находит общего родителя сообщений и привязывает `MutationObserver`.
4. Новая bubble вызывает `[MAX-OBSERVER] mutation`.
5. `quickNewMsgCheck()` извлекает текст, sender/avatar активного чата и отправляет `new-message`.
6. Renderer пишет `[IPC-MAX] channel=new-message`.
7. `handleNewMessage()` проходит dedup/viewing rules.
8. `NotifManager` показывает ribbon и запускает звук.

Куда смотреть следующему ИИ:
- `C:\Users\Директор\AppData\Roaming\ЦентрЧатов\chatcenter.log`;
- `C:\Users\Директор\AppData\Roaming\ЦентрЧатов\system-diagnostics-report.json`;
- цепочка должна быть такой: `findChatContainer MAX messageWrapper ancestor` -> `[MAX-OBSERVER] bound` -> `[MAX-QUICK] send new-message` -> `[IPC-MAX] channel=new-message` -> `NotifManager show` -> `[notif-renderer] addNotification`.
- если есть `MAX title-fallback`, но нет `[MAX-QUICK]`, значит снова проблема в active-chat observer/container или приложение не перезапустили после preload-правки.

Проверки:
- `node src/__tests__/monitorPreload.test.cjs` должен проверять наличие `findMaxMessageWrapperContainer`, `messageWrapper` и наблюдения общего ancestor, а не одиночного bubble.
- После изменения preload обязателен полный перезапуск приложения, иначе старый preload останется внутри WebView.

### Дополнение 29 июня 2026 — MAX: фантом `Сообщение` от `max-title-active`

Кто нашел: Codex, по свежим логам пользователя и `system-diagnostics-report.json`.

Симптом: когда пользователь переходил в MAX-чат, приложение показывало ribbon со словом `Сообщение`, хотя клиент такого текста не писал. При этом рядом реальные короткие сообщения (`11`, `%""`, `"*₽`, `₽_`, `3₽"`, `#₽_`) отображались корректно с sender/avatar.

Факты из `chatcenter.log`:
- реальные сообщения шли через нормальный путь `__CC_NOTIF__ -> custom-notify -> NotifManager show -> звук`;
- фантом `Сообщение` шёл другим путём: `title +1 -> MAX title-fallback -> max-title-active`;
- `max-title-active` в логе встретился 4 раза и все 4 раза вернул `text="Сообщение"`;
- sender у этих 4 событий был грязный: имя дублировалось и дописывался статус `В сети`, `Только что`, `Был(-а) вчера`;
- `system-diagnostics-report.json` сам отметил проблему как `MAX active fallback подозрителен`.

Корень: `activeChatSnapshot()` внутри `src/utils/maxTitleFallbackScript.js` искал текст слишком широко: `[class*="messageWrapper"], [class*="message"], [class*="bubble"], p, span, div`. Из-за `p/span/div` он мог взять не реальную bubble клиента, а служебный текст интерфейса активного чата: поле ввода, header, статус, placeholder или общий контейнер. Сегодня это было `Сообщение`, завтра могло быть другое слово. Поэтому блокировка конкретного слова была бы неверным ремонтом.

Почему решение именно такое:
- нельзя блокировать слово `Сообщение` глобально, потому что клиент может реально написать это слово;
- нельзя доверять `max-title-active` без строгого структурного доказательства, что текст взят именно из входящей message bubble;
- `__CC_NOTIF__` уже доказал работоспособность на реальных коротких сообщениях;
- `max-title-sidebar` остаётся полезным fallback: он берёт preview из строки списка чатов с badge/avatar и score;
- отключение `max-title-active` не трогает основной путь уведомлений, observer, sidebar fallback, звук, avatar cache и dedup.

Что сделано:
- `src/utils/maxTitleFallback.js`: `parseMaxTitleFallbackResult()` теперь отбрасывает `source="max-title-active"`;
- `src/utils/maxTitleFallbackScript.js`: `title fallback` теперь возвращает только `sidebarSnapshot()`;
- `activeChatSnapshot()` оставлен как безопасная заглушка `return null`, чтобы не создавать фантомы и не ломать структуру скрипта;
- `src/__tests__/maxTitleFallback.test.cjs`: добавлен тест, что `max-title-active` блокируется как ненадёжный источник; старый тест обновлён на правило `sidebar only`.

Как должно работать после ремонта:
1. Если MAX сам отдаёт notification/hook событие (`__CC_NOTIF__`) — уведомление показывается как раньше.
2. Если сработал title/unread fallback — сначала проверяется, не обработал ли событие нормальный путь.
3. Если нормального события нет, fallback пытается взять сообщение только из sidebar preview (`max-title-sidebar`).
4. Если sidebar не дал надёжный preview — уведомление не показывается, вместо попытки угадать текст из активного чата.
5. Переход в открытый чат не должен создавать ribbon `Сообщение` из header/input/status.

Куда смотреть следующему ИИ:
- если снова есть фантом, искать `MAX title-fallback raw`;
- безопасный результат должен иметь `source="max-title-sidebar"`;
- `source="max-title-active"` не должен попадать дальше `parseMaxTitleFallbackResult()`;
- реальные сообщения должны идти через `__CC_NOTIF__`, `[MAX-QUICK] send new-message`, `[IPC-MAX] channel=new-message` или sidebar preview.

Проверки:
- `node src/__tests__/maxTitleFallback.test.cjs`;
- `node src/__tests__/systemDiagnostics.test.cjs`;
- `node src/__tests__/monitorPreload.test.cjs`;
- `npm run lint`.

### Дополнение 29 июня 2026 — диагностика не должна зависеть от большой модалки

Кто нашел: пользователь и Codex во время разбора MAX-уведомлений.

Симптом: чтобы воспроизвести проблему, пользователю нужно было переходить по вкладкам и чатам. Большая модалка диагностики мешала работе, а при закрытии модалки автообновление прекращалось. В результате часть событий могла не попасть в отчёт, особенно если проблема появлялась именно при переходе в чат.

Корень: `SystemDiagnosticsModal` одновременно была и просмотрщиком, и механизмом сбора. Это неверная архитектура для расследования живых проблем: UI просмотра можно закрыть, а сбор должен продолжаться.

Решение v1.2.23:
- сбор вынесен в фоновую сессию `useDiagnosticsSession`;
- события складываются в отдельный ring-buffer, а не в бесконечный UI-список;
- маленькая плавающая панель остаётся поверх приложения и показывает статус;
- большая модалка стала просмотрщиком/панелью управления;
- `Очистить` очищает только буфер диагностики, не `chatcenter.log` и не `ai-errors.log`;
- при `Стоп` отчёт сохраняется в `system-diagnostics-report.json` вместе с `diagnosticsSession.events`.

Как должно работать: пользователь открывает `🩺 Диагностика системы`, закрывает большую модалку, воспроизводит проблему в MAX/WhatsApp/Telegram/VK, нажимает `Стоп`, после чего другой ИИ читает JSON-отчёт и видит цепочку `source -> enrich -> handle -> dedup -> ribbon -> sound -> avatar`.
```
renderer: __ccLogBubbleRender → window.api.send('app:log', ...)
  → preload: ipcRenderer.send (асинхронный, очередь)
    → main: ipcMain.on('app:log') → fs.appendFile('chatcenter.log')
      [168 508 раз — главный поток main захлёбывается]
        → notifWin.webContents.send('notif:show', data) ЗАСТРЕВАЕТ в очереди
          → окно уведомления не получает данные / получает после dismissMs
            → 🚨 юзер не видит ribbon
```

**Доказательства**:
- `grep -cE "render-dup" chatcenter.log` = 168508 (≈93/сек)
- `[NotifManager] show id=22 sender=Faradei body=А для чего это?` есть в логе
- Этот же лог показывает что [notif-window event=show] (или другие events окна) **не приходили** после `show`

**Фикс v1.2.12**:
1. Полное удаление функции `__ccLogBubbleRender` из `MessageBubble.jsx` (строки 21-47 + вызов на стр. 60)
2. Обновлён комментарий-ссылка в [`nativeStore.js:909`](../../src/native/store/nativeStore.js)
3. 5 точек диагностики **по пути уведомления** добавлены (НЕ в горячем рендере) — `[native-notif] emit` / `[notif-ipc] recv` / `[notif-window] event=*` / `slideIn done` / расширенный `[NotifManager] show`

**Правило (золотое)**:
- **НИКОГДА** не вызывать `window.api.send('app:log', ...)` из render-функций React-компонентов или из callback'ов которые срабатывают на каждый кадр (`onScroll`, `MutationObserver` без throttle).
- Если **обязательно** нужен render-side лог для расследования — ОБЯЗАТЕЛЬНО:
  - Локальный rate-limit (счётчик в `useRef`, не Map в module scope)
  - Уровень `TRACE` (не пишется в файл при стандартной диагностике)
  - **Запись в `code-todo.md`** с deadline удаления (отвечать на вопрос «когда?»)
- Похожий случай — IPC burst tracker v0.91.21 (TODO-9 в `code-todo.md`). Это **повторяющийся паттерн** в проекте — диагностика добавляется, баг исследуют, баг закрывают, диагностику забывают удалить.

**Тест-страж**: пока нет прямого теста «не должно быть `app:log` в render». Идея на будущее — `grep` тест что `MessageBubble.jsx` / `MessageList.jsx` / `useReadByVisibility.js` не содержат `window.api?.send.*app:log`.

**Затронутые файлы**:
- [`src/native/components/MessageBubble.jsx`](../../src/native/components/MessageBubble.jsx) — функция удалена
- [`src/native/store/nativeStore.js`](../../src/native/store/nativeStore.js) — комментарий обновлён
- [`src/native/store/nativeStoreIpc.js`](../../src/native/store/nativeStoreIpc.js) — +emit диагностика
- [`main/handlers/mainIpcHandlers.js`](../../main/handlers/mainIpcHandlers.js) — +recv диагностика
- [`main/handlers/notificationManager.js`](../../main/handlers/notificationManager.js) — +5 window events
- [`main/notification.js`](../../main/notification.js) — +slideIn success log

---

## 🟠 Native Telegram: уведомления (ribbon + звук + TDLib мьют) — стандарт мессенджеров v1.2.12

**Контекст**: до v1.2.12 в Native режиме (ЦентрЧатов = TDLib Telegram) уведомления **показывались для всех** чатов, **без проверки** TDLib мьюта (🔕 в Telegram) и **без локальных настроек** ChatCenter (Settings → тоггл «Звук» / «Ribbon»). Это нарушало стандарт мессенджеров.

### Стандарт мессенджеров (как сделано в v1.2.12)

```
chat.isMuted (TDLib серверный мьют)?  → ДА → ничего (ни окна, ни звука). Конец.
                                        ↓ НЕТ
mutedMessengers[id] (локальный мьют)? → ДА → ничего. Конец.
                                        ↓ НЕТ
notificationsEnabled + ribbon включён? → НЕТ → нет окна
                                        ↓ ДА → показать окно
soundEnabled + sound включён + throttle 3s? → НЕТ → нет звука
                                        ↓ ДА → сыграть звук
```

Звук и окно независимы. Можно включить только окно (без звука) или только звук (без окна).

### 📌 Что прошёл путь правильно

| Слой | Где проверка | Файл |
|---|---|---|
| **1. TDLib мьют** (`chat.isMuted`) — двусторонний серверный мьют | renderer перед `invoke('app:custom-notify')` | [`nativeStoreIpc.js:458-467`](../../src/native/store/nativeStoreIpc.js) |
| **2. Локальный ribbon** (`mutedMessengers` + `notificationsEnabled` + `messengerNotifs[id].ribbon`) | main `app:custom-notify` handler (только для `messengerId.startsWith('native_')`) | [`mainIpcHandlers.js:171`](../../main/handlers/mainIpcHandlers.js) |
| **3. Звук** (`soundEnabled` + `mutedMessengers` + `messengerNotifs[id].sound` + throttle 3s) | renderer listener на `notif:play-sound` (фильтр `native_*` чтобы не дублировать с WebView) | [`useAppIPCListeners.js`](../../src/hooks/useAppIPCListeners.js) |

Эталон логики **взят из WebView** ([`webviewHandleNewMessage.js:79-103`](../../src/utils/webviewHandleNewMessage.js)) — те же поля настроек, тот же default, тот же throttle.

### 📜 История правильных и неверных шагов

**❌ Неверный шаг №1 (v1.2.12-draft)** — «удалил спам-логгер `__ccLogBubbleRender` и считал что это фиксит уведомления».

Гипотеза: 168k IPC `app:log` за сессию забивают main → `webContents.send('notif:show')` застревает → окно не появляется. **Доказательств не было** — связал три факта (количество логов, успешный `[NotifManager] show` в логе, юзер не видит окно) в причинную цепочку без проверки. Это нарушение правила «3 факта, 1 уровень 1». Удаление логгера было полезным (диагностика v0.95.29 отслужила), но **не корень**.

Что показал свежий лог после правки: `[NotifManager] show` → `[notif-window] event=show` → `slideIn done` → окно **показывается** по данным Electron. То есть IPC не был проблемой. Юзер всё равно не видел — потому что **не было звука**, и юзер ассоциировал «нет звука» с «нет уведомления».

**❌ Неверный шаг №2 (моё предложение отката)** — «откатить `chat?.isMuted` фильтр».

Я предложил откатить TDLib мьют фильтр, потому что 112 из 178 уведомлений (63%) блокировались. Юзер сразу остановил: «я ожидаю что уведомления будут для чатов которые **не заглушены**, не для всех! это **стандарт мессенджеров**». Я неправильно интерпретировал — думал юзер хочет уведомления для всех, на самом деле он хочет **по стандарту**.

**✅ Верный шаг (v1.2.12)** — **сохранить** TDLib мьют + **добавить** локальные настройки + **добавить** звук.

После уточнения у юзера стало ясно: TDLib мьют (двусторонний с сервером Telegram) — это «заглушить навсегда», локальные настройки ChatCenter — это «как программа реагирует на не-заглушённые чаты». Оба слоя нужны. Звук — отдельная функция, никогда не было в Native.

### 📂 Изменения в коде v1.2.12

**Renderer:**
- [`src/native/store/nativeStoreIpc.js`](../../src/native/store/nativeStoreIpc.js):
  - **СОХРАНЁН** `if (chat?.isMuted)` фильтр (правильно по стандарту мессенджеров)
  - Skip-лог уровня TRACE — не шумит при потоке muted-каналов
- [`src/hooks/useAppIPCListeners.js`](../../src/hooks/useAppIPCListeners.js):
  - **ДОБАВЛЕН** listener `notif:play-sound`:
    - Фильтр `messengerId.startsWith('native_')` (защита от дубля с WebView звуком)
    - Проверки: `soundEnabled` + `!mutedMessengers[id]` + `messengerNotifs[id].sound`
    - Throttle 3 секунды через общий `lastSoundTsRef`

**Main:**
- [`main/handlers/mainIpcHandlers.js`](../../main/handlers/mainIpcHandlers.js) handler `app:custom-notify`:
  - **ДОБАВЛЕНА** проверка локального ribbon для Native: `!mutedMessengers[id] && notificationsEnabled !== false && messengerNotifs[id].ribbon`
  - Если ribbon выключен → `return { ok: false, skipped: 'local-ribbon-disabled' }` ДО показа окна
  - Если ribbon разрешён → `webContents.send('notif:play-sound', { messengerId, color })` параллельно с показом окна

### 🧪 Защита от регрессии

**Тесты (24 unit-теста)**:

1. [`nativeStoreMutedNotify.vitest.jsx`](../../src/native/store/nativeStoreMutedNotify.vitest.jsx) — 7 тестов на TDLib мьют (правильное поведение):
   - `isMuted=true` → `app:custom-notify` НЕ вызывается
   - `isMuted=false` → вызывается
   - `isMuted=true` → `unreadCount` всё равно растёт
   - `isMuted=undefined`/`chat=undefined` → fallback показывает (безопасно)
   - Активный чат — отдельный фильтр
2. [`notifPlaySound.test.cjs`](../../src/__tests__/notifPlaySound.test.cjs) — 13 тестов на listener звука Native:
   - WebView (whatsapp/vk) → НЕ играет (защита от дубля)
   - Все локальные настройки (`soundEnabled`/`mutedMessengers`/`messengerNotifs[id].sound`)
   - Throttle 3 секунды
   - Граничные случаи (`settings=null`, `undefined` поля)
3. [`customNotifyLocal.test.cjs`](../../src/__tests__/customNotifyLocal.test.cjs) — 11 тестов на main фильтр Native ribbon:
   - WebView пропускается (логика в renderer)
   - Default settings → показать
   - Все локальные настройки (`mutedMessengers`/`notificationsEnabled`/`messengerNotifs[id].ribbon`)
   - Будущие `native_*` мессенджеры работают по префиксу

### ⚠️ ВАЖНЫЕ ПРАВИЛА — НЕ нарушать

1. **НИКОГДА не использовать `chat.isMuted` как ЕДИНСТВЕННЫЙ фильтр** — это серверный мьют (TDLib), он отвечает только на вопрос «заглушил ли юзер чат в Telegram». Локальные настройки ChatCenter — **отдельный слой** через `messengerNotifs[id]` / `mutedMessengers[id]`.

2. **НИКОГДА не добавлять звук Native в `nativeStoreIpc.js`** — там нет `settingsRef` и `lastSoundTsRef`, прокидывание через 4 уровня DI = техдолг. Звук играется в `useAppIPCListeners.js` через IPC `notif:play-sound` от main.

3. **НИКОГДА не дублировать ribbon-проверки** — для WebView они в renderer (`webviewHandleNewMessage.js`), для Native в main (`mainIpcHandlers.js`). Filter `messengerId.startsWith('native_')` в main защищает от двойной проверки WebView.

4. **НИКОГДА не делать звук «всегда»** — без throttle. WebView имеет 3-секундный throttle (`lastSoundTsRef`). Native использует тот же ref — пакет в 5 сообщений за 100мс даст 1 звук, не 5.

### 🚫 Что **не закрывает** v1.2.12

- Глобальный мьют скоупа TDLib через `use_default_mute_for=true` (scope chat settings) — отдельная задача, для большинства юзеров не нужна
- `messenger:badge` listener в `useAppIPCListeners.js:33-54` — никем не эмитится во всём проекте (мёртвый код), но не удалён в этой задаче — отдельная задача в `code-todo.md`

---

## 🔴🔴 MAX: уведомление только на ПЕРВОЕ сообщение пачки, остальные молчат (2026-06-23) — САГА с разбором неверных решений

**Симптом (от пользователя)**: в MAX первое сообщение даёт ribbon+звук, а следующие в быстрой серии (в т.ч. в том же чате) — нет ни уведомления, ни звука. Повторялось стабильно (Ввпр/Ааап/Увмрр; Цыч/Тцыы/Оцыя; Уус/Фям/Ввси/Вам).

### Как искали (инструмент важнее догадок)
Сначала **сняли ограничения диагностики** (v1.2.9), потому что баг вытеснялся из буфера до сохранения отчёта:
- буфер трассировки в памяти 300→5000 шагов ([webviewSetup.js](../../src/utils/webviewSetup.js) `traceNotif`) — **главное**, т.к. `maxFallbackEvents` строится из него;
- снимок читает весь `chatcenter.log` (было 1000 строк) — [main/utils/systemDiagnostics.js](../../main/utils/systemDiagnostics.js);
- срезы анализа подняты — [src/utils/systemDiagnostics.js](../../src/utils/systemDiagnostics.js).
Только после этого в отчёте стало видно реальную пачку.

### ❌ Неверное решение №1 — «debounce/clearTimeout схлопывает пачку»
Первая версия причины: `scheduleMaxTitleFallback` отменяет предыдущую проверку (`clearTimeout`), поэтому из пачки выживает одна. **Это было ДОПУЩЕНИЕ, опровергнуто живыми данными**: в журнале на пачку было всего 2-3 строки `MAX title-fallback scheduled`, а не «много подряд». Урок: не выдавать гипотезу за факт — проверять трассировкой.

### Корень (доказан данными)
- Заголовок вкладки MAX = **«N непрочитанных ЧАТОВ»**, не сообщений (`chatcenter.log`: `MAX page-title-updated raw="2 непрочитанных чата"`).
- Вся ловля MAX завязана на рост этого числа ([webviewSetup.js](../../src/utils/webviewSetup.js), `page-title-updated`, `if (count > prevCount)`).
- 2-е/3-е сообщение в **уже непрочитанном** чате число не меняет → проверки нет → теряется. Проверка к тому же берёт **один** чат (верхний) из `sidebarSnapshot`. Доказательства: «Цыч» 0 раз во всём журнале; «Оцыя» показано только после КЛИКА пользователя по чату (клик заново дёрнул заголовок).

### ❌ Неверное решение №2 — «оживить ServiceWorker» (v1.2.10)
Задумка: MAX уведомляет через `ServiceWorkerRegistration.showNotification`, а хук сам же убивал ServiceWorker → перехват не срабатывал. Сняли блок SW (разрешили регистрацию) + блок только push.
**Провал, подтверждён запуском + официальной докой**: SW в Electron-`<webview>` **не регистрируется в принципе** — отчёт: 222× «Operation has been aborted», `__CC_NOTIF__` от MAX = **0**, маркер push-блока 0. Документация:
- Electron официально рекомендует **не использовать `<webview>`** ([webview-tag](https://www.electronjs.org/docs/latest/api/webview-tag));
- баг класса [electron #9529](https://github.com/electron/electron/issues/9529): перемещение webview в DOM пересоздаёт гостя → прерывает SW;
- MDN: `showNotification` требует активного SW.
Изменение оставлено инертным (безвредно: SW мёртв в любом случае) — переписывать обратно не стали, чтобы не трогать заработавшую конфигурацию.

### ✅ Верное решение (v1.2.11) — наблюдатель за списком чатов
Раз SW недоступен — единственный надёжный источник «новое сообщение» = **DOM списка чатов**. И это **уже есть в проекте** у WhatsApp ([whatsapp.hook.js](../../main/preloads/hooks/whatsapp.hook.js) `_sidebarObserver`). Добавили то же в [max.hook.js](../../main/preloads/hooks/max.hook.js):
- `_maxRowInfo` — структурный разбор строки (имя из `title/name`, тело из `text/message/preview`, отсев бейджей-чисел и повтора имени — нюансы из живых данных);
- `_maxScanList` — дедуп по `_maxLastList[sender]`, шлёт `__CC_NOTIF__` на изменение превью;
- `MutationObserver` на `document.body`, дебаунс 350мс, старт через 8с; первый проход — молча; корень списка ре-запрашивается (переживает ре-рендер SvelteKit);
- переиспользует `_isSpam`/`_findAvatarIn`. Дедуп с заголовком-fallback — пайплайн + его собственный guard.

Подтверждено пользователем: **«получилось»** — уведомления приходят на каждое сообщение.

### Остаточные ограничения (честно)
- Фоновая сверхбыстрая пачка в один чат (быстрее ~350мс) может слиться — список хранит только последнее превью. 100% дал бы лишь перехват WebSocket MAX (непрозрачный протокол, хуже по надёжности — не делаем).
- Зависимость от вёрстки MAX — селекторы структурные, риск снижен, не убран.

### Уроки на будущее
1. Не выдавать гипотезу за факт — сначала трассировка (для этого и сняли лимиты диагностики).
2. У `<webview>` нет рабочего ServiceWorker — для мессенджеров без рабочего notification-API источник = DOM-наблюдатель (паттерн WhatsApp), а не SW.
3. Заголовок MAX считает чаты, не сообщения — он годится только как аварийный сигнал, не как источник текста.

---

## 🔴 MAX: фантомные даты, нет аватарки, двойной звук и «пик без ribbon» (2026-06-19)

**Нашёл**: Codex, 19 июня 2026.

**Симптомы от пользователя**:
- В MAX появлялись ribbon-уведомления с текстом `12:56`, `13:21`, `13:24` или датой, хотя клиент такого сообщения не писал.
- Иногда был звук, но визуального ribbon не было.
- На ribbon не было аватарки, хотя в списке MAX аватар виден.
- При одном входящем MAX-событии звук мог проигрываться два раза.
- В групповых/сложных строках MAX нужно понимать не только чат, но и автора сообщения.

**Что показали логи**:

1. `title +1` у MAX был только сигналом роста unread, а не источником текста сообщения:

```text
[Макс] Источник: title +1 | MAX title-fallback scheduled
```

2. Старый fallback брал rich-данные из sidebar и выбирал последний короткий текстовый leaf. В DOM MAX последним leaf часто является время (`meta`):

```text
selectedText=13:22
selectedSender=Дугин Алексей Сергеевич
chosenLeafs=... 1@...:badgeIcon ... Ыыча@...:text ... 13:22@...:meta
```

Фактическое сообщение `Ыыча` было в DOM, но алгоритм выбрал `13:22`, потому что шёл с конца массива текстов.

3. Для группового/канального случая строка содержала автора и badge, но body снова выбирался как время:

```text
selectedText=12:56
selectedSender=А.Х. как вкусно
chosenLeafs=... 6@...:badgeIcon ... Евгешка :@...:author ... 12:56@...:meta
```

4. Аватарка физически была в DOM строки MAX, но extractor её не отдавал:

```text
imgs[0:96x96:img avatarImage ... https://i.oneme.ru/...]
avatar=""
icon=false
```

Причина: старый `avatarFrom()` искал слишком узкий набор селекторов и пропускал нормальный `img.avatarImage` / `img[src]` внутри строки.

5. Двойной звук был подтверждён двумя независимыми шагами pipeline:

```text
Звук: title +1 | звук title-update
Звук: 13:22 | звук воспроизведён
```

6. «Пик без ribbon» объяснился связкой renderer + main:
- renderer проигрывал звук сразу на `title +1`;
- затем fallback передавал `body=13:24`;
- main `notificationManager` уже имел защиту от timestamp-only body:

```js
if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanBody)) return null
```

Итог: звук уже был, но main законно не показывал ribbon, потому что body был только временем.

**Почему нельзя было чинить блокировкой слов**:
- Клиент реально может написать `13:24`, `18 июн.`, `12:56` или похожий текст.
- Блокировка по словам/regex скрывает симптом и может пропустить настоящее важное сообщение.
- Правильный критерий не текстовый, а структурный: `meta`/badge/title/name/author не являются body; preview message находится в отдельном `text`-leaf ниже имени.

**Что изменено в коде**:

1. [`src/utils/maxTitleFallback.js`](../../src/utils/maxTitleFallback.js)
   - Добавлен структурный разбор leaf-элементов (`leafItems`) с текстом, className и геометрией.
   - `rowParts()` теперь выделяет роли:
     - `title/name` → название чата или sender для личного чата;
     - `author` → автор внутри групповой строки, если есть;
     - `meta` → время/дата, никогда не body;
     - `badge/indicator` → unread badge, никогда не body;
     - `text/message/preview` ниже имени → body сообщения.
   - Для группового случая возвращается `sender=author`, `chatTag=chatTitle`.
   - `avatarFrom()` теперь берёт `img.avatarImage` / нормальный `img[src]` из выбранной строки, но игнорирует emoji-картинки (`st.max.ru/emojis`), чтобы не подставить emoji вместо аватара.
   - Если в строке нет валидного preview/body, fallback возвращает `null` и не запускает уведомление.

2. [`src/utils/webviewSetup.js`](../../src/utils/webviewSetup.js)
   - Ранний `title-update` звук пропускается только для `web.max.ru`.
   - Для других мессенджеров поведение сохранено: WhatsApp/VK/Telegram не менялись.
   - MAX `title +1` теперь только запускает fallback-проверку, а не считается готовым уведомлением.

3. [`src/utils/webviewHandleNewMessage.js`](../../src/utils/webviewHandleNewMessage.js)
   - Для `extra.fromTitleFallback` звук откладывается до фактического результата main-process `app:custom-notify`.
   - Если main вернул `ok=true`, играется один звук: `звук после подтверждённого ribbon`.
   - Если main вернул `ok=false/null` (например timestamp-only, dedup, empty body), звука нет. Это устраняет «пик без уведомления».
   - Добавлен renderer trace результата main:

```text
Ribbon: ... | invoke app:custom-notify ...
Ribbon: ... | main-result ok=true id=...
Ribbon: ... | main-result ok=false id=нет ...
```

4. [`main/handlers/notificationManager.js`](../../main/handlers/notificationManager.js)
   - Добавлены диагностические причины фактического показа/непоказа ribbon:

```text
[NotifManager] skip empty-body ...
[NotifManager] skip timestamp-only ...
[NotifManager] skip dedup ...
[NotifManager] show id=... messenger=... sender=... body=... icon=...
```

Эти логи нужны, потому что renderer-строка «invoke app:custom-notify» означает только IPC-вызов, а не гарантирует, что main реально показал окно.

**Принятое решение**:
- Не использовать `title +1` как источник текста.
- Не выбирать body по принципу «последний короткий текст».
- Для MAX читать структуру sidebar: `title/name`, `author`, `badge`, `meta`, `text`.
- Звук MAX title fallback привязать к фактически показанному ribbon (`main-result ok=true`), а не к unread title.
- Аватар брать из выбранной строки, а не из глобального header/случайной картинки.

**Почему это безопаснее**:
- Не блокирует реальные сообщения с датами/временем, если они находятся в preview/body.
- Не ломает WhatsApp/VK/Telegram: ранний title-звук отключён только для URL `web.max.ru`.
- Main-side timestamp guard сохранён; он продолжает защищать от пустых timestamp-only уведомлений.
- Если MAX DOM не содержит preview/body, уведомление не создаётся и звук не играет.
- Если main не показывает ribbon, звук не играет.
- Если main показывает ribbon, звук играет один раз.

**Проверки после правки**:

```powershell
node src\__tests__\maxTitleFallback.test.cjs      # 6/6 OK
node src\__tests__\handleNewMessage.test.cjs      # 25/25 OK
node src\__tests__\appStructure.test.cjs          # 45/45 OK
node src\__tests__\memoryLeaks.test.cjs           # 31/31 OK
node src\__tests__\integrationChains.test.cjs     # 18/18 OK
npm.cmd run lint                                  # OK
npm.cmd run test:vitest                           # 131 files / 1874 tests passed
node src\__tests__\memoryBankSizeLimits.test.cjs # 38/38 OK
```

**Оставшиеся ограничения**:
- Если MAX поменяет DOM-классы (`meta`, `author`, `avatarImage`, `text`) после обновления сайта, потребуется новая диагностика по `topRows/chosenLeafs`.
- Одновременные сообщения из нескольких чатов всё ещё зависят от порядка unread/sidebar MAX. Текущий фикс убирает выбор `meta` вместо preview и не должен создавать timestamp-фантомы, но полноценный snapshot-diff sidebar можно делать отдельным этапом, если MAX начнёт часто переставлять строки неоднозначно.

**Ключевой урок**: для MAX нельзя чинить уведомления фильтрами слов. Нужно читать DOM-структуру строки и привязывать звук к фактическому показу ribbon, иначе появляются фантомы, двойной звук и «пик без окна».

**Извлечено из** `common-mistakes.md` 24 апреля 2026 (v0.87.54).
**Темы**: Messenger Ribbon BrowserWindow, Notification API перехват, ServiceWorker дубли, enrichment addedNodes, CSS fade-out, FIFO deadlock, Emoji regex, startup ribbon.

---

## 🟡 ЛОВУШКА #32 (v1.2.7, 18 июня 2026): MAX title-update дал звук, но не дал ribbon

### Симптом

По MAX слышен звук или растет счетчик, но визуальная карточка Messenger Ribbon не появляется. В `chatcenter.log` виден `title +1 | звук title-update`, но рядом нет `Источник/Ribbon` для MAX.

### Причина

`page-title-updated` в `webviewSetup.js` исторически делает только unread count + звук. Ribbon намеренно не создавался в этом пути, потому что полноценный ribbon должен иметь sender/text/avatar и приходить через `__CC_NOTIF__` или `new-message`.

Для MAX это недостаточно:
- MAX не всегда вызывает `Notification/showNotification` на каждое сообщение.
- `quickNewMsgCheck()` зависит от текущего DOM MAX и может не привязаться, если Svelte-классы/контейнеры изменились.
- `body-fallback` для MAX отключен из-за фантомов.
- `Path 2` для MAX отключен из-за фантомов при навигации между чатами.

### Неправильные решения

1. Включить `body-fallback` для MAX — вернет фантомы из sidebar/system DOM.
2. Вернуть `Path 2` для MAX — вернет фантомы при смене чата.
3. Показывать generic `"Новое сообщение в Макс"` без текста и отправителя — пользователь теряет главный смысл ribbon и невозможно нормально перейти/пометить чат.
4. Парсить active-chat всегда — unread/title может относиться к другому чату в sidebar.

### Решение v1.2.7

Добавлен MAX-only rich title-fallback:

1. Только для URL `web.max.ru`.
2. Только после роста `title/unread`.
3. Ждет `700мс`, чтобы приоритет остался у обычных путей `__CC_NOTIF__` и `__CC_MSG__`.
4. Если обычный путь уже показал ribbon, fallback отменяется.
5. Если обычного пути нет, запускает DOM snapshot внутри MAX WebView.
6. Snapshot сначала ищет непрочитанный sidebar row (`wrapper--withActions`, role listitem/presentation, unread badge/aria/class signals), достает preview text, sender, avatar.
7. Active-chat snapshot используется только как резерв.
8. Результат идет через обычный `handleNewMessage()`, поэтому внешний вид ribbon не меняется.
9. Если text не найден или результат не имеет достаточной структуры, уведомление не показывается. Сообщения не блокируются по словам: клиент может реально написать дату, время, `ред.` или любой похожий текст.

### Уточнение 18 июня 2026, 18:26: почему не пришло `Наличка`

Факт из `chatcenter.log`:

```text
[2026-06-18 18:25:14] [Макс] MAX title-fallback max-title-sidebar | sender="Марейченко Вячеслав " → Ribbon: Заказываем лузар
[2026-06-18 18:26:11] [Макс] Источник: title +1 | MAX title-fallback scheduled
[2026-06-18 18:26:12] [Макс] Обогащение: title +1 | MAX title-fallback no rich message
```

Значит первый вариант fallback работал для sidebar (`Заказываем лузар`), но не достал сообщение из уже открытого чата (`Наличка`). Причина: текущая верстка MAX после перехода в чат не попала в старые селекторы `.history/.openedChat/.messageWrapper`; диагностика рядом показывала `probe[column-center]: null`, `probe[bubbles]: null`. Notification UI не ломался — `Ribbon` просто не создавался, потому что extractor вернул пустой результат.

Дополнение: попытка добавить третий резерв `visibleIncomingSnapshot()` оказалась неверной. Он смотрел не событие нового сообщения, а текущие видимые leaf-тексты в открытом MAX-чате. Это помогло поймать часть сообщений в активном чате, но источник был неавторитетным: `title +N` доказывает только рост unread, а не то, какой именно DOM-текст является новым сообщением.

### Уточнение 19 июня 2026, 09:27: visible fallback начал слать даты как сообщения

Факт из `chatcenter.log` после добавления `visibleIncomingSnapshot()`:

```text
[2026-06-19 09:26:56] [Макс] Обогащение: 18 июн. | MAX title-fallback max-title-visible | sender="" icon=false
[2026-06-19 09:27:08] [Макс] Ribbon: 18 июн. | отправлен | sender="Цывилько Дмитрий Ник" iconUrl=нет iconData=нет
[2026-06-19 09:28:45] [Макс] Ribbon: 06:48 ред. | отправлен | sender="Журавлёв Владимир Ев" iconUrl=нет iconData=нет
```

Причина: третий резерв `visibleIncomingSnapshot()` был слишком широким. Он сканировал видимые leaf-тексты в открытом MAX-чате и мог принять separator/date (`18 июн.`), edited-marker (`06:48 ред.`) или старую строку с inline-time (`Спасибо 18:34`) за новое сообщение. Дополнительно он мог показать ribbon без аватарки (`icon=false`). Это нарушает главное правило MAX fallback: rich ribbon можно строить только из авторитетного события (`__CC_NOTIF__`/`__CC_MSG__`) или из DOM-узла, который появился как новая message mutation, а не из произвольного текста, который уже виден на экране.

Коррекция 19 июня 2026: словесные блоки для `18 июн.`, `ред.`, inline-time и похожих строк сняты, потому что клиент реально может написать такой текст. Исправление теперь не в запрете слов, а в удалении неверного источника: `visibleIncomingSnapshot()` отключен из цепочки fallback. Parser больше не блокирует сообщения по содержимому, кроме пустого/слишком длинного результата. Оставшийся fallback: `sidebarSnapshot()` → `activeChatSnapshot()`. Следующий надежный этап для активного чата MAX должен идти через авторитетный источник: payload `ServiceWorkerRegistration.showNotification`/`new Notification` или MutationObserver только на реально добавленный message-node с sender/avatar, baseline и структурными признаками.
Файлы:
- `src/utils/maxTitleFallback.js`
- `src/utils/webviewSetup.js`
- `src/utils/consoleMessageHandler.js` — исправлена опечатка `senderNotifTsRef` → `notifSenderTsRef`
- `src/__tests__/maxTitleFallback.test.cjs`

### Как диагностировать

Искать в `chatcenter.log`:

```text
[Макс] Звук: title +N
MAX title-fallback scheduled
MAX title-fallback skip | normal path already handled
MAX title-fallback no rich message
MAX title-fallback max-title-sidebar | sender="..."
MAX title-fallback max-title-active | sender="..."
```

Если `scheduled` есть, но rich result нет — MAX поменял DOM, обновлять selectors в `maxTitleFallback.js`.
Если rich result есть, но ribbon нет — смотреть `handleNewMessage` dedup/viewing/spam и `notificationManager.showCustomNotification` body-фильтры.

### Регресс-тесты

```bash
node src/__tests__/maxTitleFallback.test.cjs
node src/__tests__/handleNewMessage.test.cjs
node src/__tests__/consoleMessageParser.test.cjs
node src/__tests__/notifHooks.test.cjs
node src/__tests__/monitorPreload.test.cjs
```

---

## 🟡 ЛОВУШКА #31 (v1.2.7, 17 июня 2026): WhatsApp `ic-expand-more` / `wds-ic-*` — SVG/UI текст прошёл как новое сообщение

### Симптом

При входе в WhatsApp-чат появляется ribbon с несуществующим сообщением:

```text
14:40 ic-expand-more
14:40 Фото
```

Реальный лог пользователя:

```text
wa-open: chat="Виноградов Александр" picked="ic-expand-more"
Источник: ic-expand-more | __CC_NOTIF__
Ribbon: ic-expand-more | отправлен
wa-open: chat="Виноградов Александр" picked="Фото"
Ribbon: Фото | отправлен
```

### Причина

WhatsApp sidebar watcher читает DOM строки чата через широкий селектор `span[dir], span[class]`. При открытии чата WhatsApp перерисовывает sidebar, и watcher может выбрать не текст сообщения, а служебный текст иконки (`ic-expand-more`, `wds-ic-*`) или старое preview открытого чата (`Фото`).

Это продолжение Ловушки 62 из `archive/features-pre-v0.87.md`:
- `dir="auto"` уже проверяли и откатили — для открытого WhatsApp-чата preview не всегда лежит в `span[dir="auto"]`.
- `closest('[data-icon]')` недостаточно — `ic-expand-more` бывает как `<span><svg><title>ic-expand-more</title></svg></span>` без `data-icon`.

### Решение v1.2.7

Точечный фикс в `main/preloads/hooks/whatsapp.hook.js`:

1. Отсекать SVG title без `data-icon`: `svg title` + `t === svgTitle`.
2. Отсекать служебные icon-name тексты: `ic-*`, `wds-ic-*`, `status-*`, `default-user`, `down-context`, `x`.
3. Если строка чата открыта (`isOpen === true`) и unread badge нет — обновить `_lastSidebarTexts`, но не слать `__CC_NOTIF__`.

### Почему не выключаем WhatsApp watcher целиком

Watcher нужен для WhatsApp/MAX/VK сценариев, где Notification API или unread count не дают отдельный ribbon, особенно при активной вкладке. Полное отключение уменьшит фантомы, но может пропустить реальные сообщения. Поэтому выбран узкий фильтр доказанных UI-фантомов и только открытой строки без badge.

### Регрессионная защита

`src/__tests__/notifHooks.test.cjs` проверяет:
- SVG title без `data-icon`;
- `wds-ic-*`/`status-*` icon-name фильтр;
- `isOpen && !badge` skip для открытой строки.

---

## 🟡 ЛОВУШКА #30 (v0.98.0, 9 июня 2026): «Уведомление не пришло в ЦентрЧатов» — `isOutgoing=true` для cross-session сообщений того же аккаунта

### Симптом

Юзер открыл **один Telegram-аккаунт** в двух местах одновременно:
- Вкладка webview (например «Telegram БНК» через web.telegram.org)
- Вкладка native_cc «ЦентрЧатов» (наш TDLib)

Юзер пишет сообщение через webview-вкладку. В ЦентрЧатов **не приходит уведомление**. Выглядит как баг.

### Это **правильное поведение** TDLib — НЕ баг

Подтверждение из лога (`chatcenter.log`):

```
13:42:29 tg-new-message chatId=tg_611696632:638454350 msgId=690856394752
  textPreview=444 isOutgoing=true
```

`isOutgoing` — поле от **самого TDLib** (🥇 [TDLib message spec](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message.html)): «True, if the message is outgoing».

TDLib ставит `is_outgoing=true` **когда sender_id == current_user**, **независимо от того с какой сессии** отправлено (webview / mobile / desktop / TDLib).

### Где фильтр в коде

[src/native/store/nativeStoreIpc.js:437](../../src/native/store/nativeStoreIpc.js):

```js
if (!message.isOutgoing && stateRef.current.activeChatId !== chatId) {
  // показать уведомление
}
```

При `isOutgoing=true` ветка не выполняется. **Уведомление НЕ показывается о своих же сообщениях** — это правильно (стандарт всех Telegram клиентов).

### Как отличить от настоящего бага

1. Спросить юзера: **сообщение от тебя или от другого человека?**
2. Проверка: **попросить другого человека написать** в чат. Уведомление **должно** прийти если:
   - Юзер не стоит на этом чате в native_cc
   - TDLib подключён

### Эталон

Telegram Desktop, Telegram mobile, web.telegram.org — никто не показывает уведомление о собственных исходящих, даже с другой сессии.

### Кратко (matrix)

| Кто отправил | TDLib `isOutgoing` | Уведомление в ЦентрЧатов |
|---|---|---|
| Другой человек | `false` | ✅ Покажет |
| Я сам через ЦентрЧатов | `true` | ❌ Не покажет |
| **Я сам через webview/mobile того же аккаунта** | **`true`** | **❌ Не покажет (правильно)** |

### Связанные секции кода

- [src/native/store/nativeStoreIpc.js:437](../../src/native/store/nativeStoreIpc.js)
- [main/native/backends/tdlibClient.js:350](../../main/native/backends/tdlibClient.js)
- [main/native/backends/tdlibMapper.js](../../main/native/backends/tdlibMapper.js)

---

## 📌 КАРТА СЕРИИ v0.89.18-v0.89.27 + КОРНЕВЫЕ ФИКСЫ v0.89.35-v0.89.36 (19 мая 2026)

За 4 дня (18-19 мая) — 7 связанных багов в notification BrowserWindow. Серия **изначально закрыта в v0.89.23**, но через сутки проблема снова появилась (id=17 застрял с translateX=380px). Корневая причина #28 (Chromium throttling) найдена в v0.89.35. Через час после фикса — снова «пустая полоса» (race с пакетом одновременных нотификаций) → ловушка #29 закрыта в v0.89.36 force-transform fallback.

| # | Симптом | Версия фикса | Природа |
|---|---|---|---|
| **#20** | Ghost hit-test region после `.hide()` — невидимый блок ловит клики | v0.89.18 | симптом (helper `safeHideTransparentWindow`) |
| **#21** | `setIgnoreMouseEvents(true)` ломал клики — двойной клик нужен | v0.89.22 | симптом (откат опасной защиты) |
| **#22** | «Пустая полоса» — окно расширилось, но element ещё за экраном | v0.89.23 | симптом (timing IPC) |
| **#23** | IPC race `raw=0 items=1` — окно скрылось ошибочно | v0.89.23 | симптом (`IGNORE stale`) |
| **#25** | Окно не скрывалось после dismiss (gap в hideIfEmpty) | v0.89.26 | симптом (`hideIfEmpty` после каждого dismiss) |
| **#26** | Main `notifItems[]` накапливает мусор от ghost-stacking | v0.89.27 | симптом (`rendererPure` signal) |
| **#28** | **CSS animations + rAF throttled в hidden window** | **v0.89.35** | **КОРЕНЬ throttling — закрыт по Electron docs** |
| **#29** | **slideIn fallback ставит только флаг, transform остаётся 380px** | **v0.89.36** | **КОРЕНЬ race — force transform в fallback** |

**Архитектурное обоснование** — в [`decisions.md`](../decisions.md) → «ADR — Notification BrowserWindow: итоги серии багов v0.89.15-v0.89.23».

**Регрессионная защита**: `src/__tests__/transparentWindowGuard.test.cjs` — pre-commit hook падает при попытке вернуть антипаттерны #20/#21 и при удалении `backgroundThrottling: false` (#28).

**6 принципов из серии** (обновлено):
1. CSS-анимируемые свойства — через `getComputedStyle()`, не `el.style`
2. Visual position — через `getBoundingClientRect()`, не `offsetHeight`
3. Transparent окно на Win11: `setBounds(offscreen 1×1) + hide()`, БЕЗ `setIgnoreMouseEvents`
4. IPC + setTimeout-coalescing: main process проверяет авторитативный state
5. Diagnostic logging для CSS — читать MDN для каждого свойства
6. **NEW**: BrowserWindow с CSS animations/rAF + частые `hide()`/`show()` → **`backgroundThrottling: false`** обязателен

---

## 🔴 ЛОВУШКА #28 (v0.89.35): CSS animations и rAF throttled в hidden BrowserWindow — корень серии #20-#26

### Симптом (19 мая, 09:07)

После закрытия серии v0.89.18-v0.89.27 проблема снова появилась через сутки. Скриншот пользователя: тонкая горизонтальная пустая полоса в нижней части окна уведомлений + кнопка «Закрыть» не реагирует.

### Расследование по логу

```
09:01:07 addNotification id=17 messenger=telegram itemsBefore=6 containerBefore=2
         ↑↑↑ в Map уже 6 items, в DOM 2 — 4 ghost накопились
09:07:11 addNotification id=25 itemsBefore=1 containerBefore=1
09:07:12 DOM snapshot [0 id=17 h=109 op=1 pe=auto realTf=matrix(1,0,0,1,380,0) slid=true]
                                                  ↑↑↑ translateX(380px) — за правой границей
09:07:12 notif-resize raw=467 visible=true items=3 rendererPure=false
                                                   ↑↑↑ main: 3, renderer: 2
```

`realTf=matrix(1,0,0,1,380,0)` — это `translateX(380px)`. Точное значение из CSS keyframes [`notification.css:59`](../main/notification.css):

```css
@keyframes slideIn {
  0%   { transform: translateX(380px) scale(0.95); opacity: 0; }
  70%  { transform: translateX(-8px) scale(1); opacity: 1; }
  100% { transform: translateX(0) scale(1); opacity: 1; }
}
```

id=17 **застрял на 0% keyframe** — анимация `slideIn` не запустилась.

### Корневая причина

[Electron BrowserWindow docs](https://www.electronjs.org/docs/latest/api/browser-window) (verbatim):

> «If `backgroundThrottling` is disabled, the visibility state will remain `visible` even if the window is minimized, occluded, or hidden.»

[`notificationManager.js:78-97`](../main/handlers/notificationManager.js) создавал `notifWin` **без** `backgroundThrottling: false`. По умолчанию Chromium включает throttling для hidden / occluded окон:
- `requestAnimationFrame` — пауза
- CSS animations / transitions — заморозка на текущем keyframe
- `setTimeout` — снижение точности

Цепочка падения:
1. notifWin создан, `backgroundThrottling: true` (Chromium default)
2. После dismiss всех `safeHideTransparentWindow(notifWin)` → окно скрыто
3. Приходит новое сообщение → `showInactive()` + `notif:show`
4. Renderer создаёт DOM с `transform: translateX(380px); animation: slideIn 300ms forwards`
5. Chromium ещё не успел переключить окно в `visible` (throttling задержан)
6. Анимация throttled → keyframes не выполняются → item застрял на 0%
7. `items.Map` и `container.children` хранят element, `offsetHeight` ненулевой
8. `reportHeight()` посылает реальную высоту (109+346=467px) в main
9. main делает `setBounds({height: 467})` — окно правильно высокое
10. Но id=17 (109px) визуально за рамкой (translateX=380, ширина окна 370)
11. → 109px пустого пространства в bounds окна = **«пустая полоса»**

### Почему 5 предыдущих фиксов не помогли

| Фикс | Что закрывал | Почему не помог #28 |
|---|---|---|
| **v0.89.18** safeHide | hit-test после `.hide()` | Окно visible=true, не скрыто |
| **v0.89.22** убран setIgnoreMouseEvents | Клики работают | Не о bounds окна |
| **v0.89.23** IGNORE stale `raw=0 items>0` | IPC race | `raw=467 items=3` — защита не срабатывает |
| **v0.89.26** hideIfEmpty в dismiss | Окно скрывается при `length===0` | length>0 пока есть live id=17 |
| **v0.89.27** rendererPure signal | Очистка main мусора | rendererPure=true только когда renderer ПОЛНОСТЬЮ пуст. id=17 не уходит → false навсегда |

Все 5 закрывали **симптомы** — последствия. Корень (throttled animations) не трогали.

### Старая ловушка v0.47.2 (тот же стек)

Ранее в файле уже была описана связанная проблема: «requestAnimationFrame НЕ работает в hidden BrowserWindow». Тогда заменили rAF на `setTimeout(60ms)`. **Это была половинчатая мера** — `setTimeout` менее агрессивно throttled, но **CSS animations всё равно паузились**. Та же причина — `backgroundThrottling: true` по умолчанию.

### Решение (v0.89.35)

**Одна строка** в [`notificationManager.js`](../main/handlers/notificationManager.js):

```js
webPreferences: {
  preload: getNotifPreloadPath(),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
  backgroundThrottling: false,  // ← v0.89.35
}
```

### Регрессионная защита

[`transparentWindowGuard.test.cjs`](../src/__tests__/transparentWindowGuard.test.cjs) проверяет `/backgroundThrottling:\s*false/` в `notificationManager.js`. Pre-commit hook падает при удалении параметра.

### Что закрывается

- ✅ slideIn keyframes выполняются всегда
- ✅ Items не застревают на translateX(380)
- ✅ Renderer Map не накапливает ghost
- ✅ Main `notifItems[]` синхронизируется
- ✅ Bounds окна равны реальной высоте → нет полосы
- ✅ Старая ловушка v0.47.2 (rAF) тоже закрывается одним фиксом

### Правило

Для любого BrowserWindow который:
- Использует CSS animations или `requestAnimationFrame`
- Часто `hide()` / `show()` циклы
- Имеет `transparent: true` или `show: false` инициально

→ **обязательно** `backgroundThrottling: false` в `webPreferences`.

Это **прямая рекомендация Electron documentation**, не хак.

---

## 🔴 ЛОВУШКА #29 (v0.89.36): slideIn fallback ставит только флаг, реальный transform остаётся 380px — race с пакетом одновременных нотификаций

### Симптом (19 мая, 10:13)

Через час после фикса v0.89.35 (`backgroundThrottling: false`) — пользователь снова видит «невидимую полосу» в notification окне. Скриншот: тонкая горизонтальная пустая полоса в нижней части окна, кнопка «Закрыть» не реагирует.

### Расследование по логу

Лог 10:11:00 — **4 уведомления в одну миллисекунду** (race):

```
10:11:00 addNotification id=102 messenger=native_cc itemsBefore=0
10:11:00 addNotification id=103 messenger=native_cc itemsBefore=1
10:11:00 addNotification id=104 messenger=native_cc itemsBefore=2
10:11:00 addNotification id=105 messenger=telegram  itemsBefore=3
         ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
         4 разных мессенджера за 1мс — стандартный сценарий синхронизации

10:11:00 DOM snapshot [1 id=105 h=182 realTf=matrix(0.95,0,0,0.95,380,0) slid=false]
                                                                          ↑↑↑↑↑↑↑↑↑
                                                                          slideIn НЕ запустилась
```

Через 2 минуты (10:13:03) — id=105 всё ещё в DOM:
```
DOM snapshot id=105 h=182 op=1 realTf=matrix(1,0,0,1,380,0) slid=true
                                       ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
                                       translateX(380) — за рамкой окна
                                       slid=true — но transform не дошёл до 0
```

`slid=true, translateX=380` — это **противоречие**. Анимация частично прошла (scale 0.95→1.0), но translateX **застрял на 0% keyframe**.

### Корневая причина

[`main/notification.js:573-582`](../main/notification.js) — fallback v0.89.23 (Баг #1):

```js
setTimeout(() => {
  if (el.dataset.slideInDone === 'false') {
    el.dataset.slideInDone = 'true'              ← ставит ТОЛЬКО флаг
    el.removeEventListener('animationend', onSlideInEnd)
    // НЕТ force transform!
    reportHeight()
  }
}, 600)
```

Fallback пометил `slideInDone='true'` через 600мс (animationend не сработал из-за race с пакетом 4-х нотификаций), но **не форсировал** transform. Element остался в 0% keyframe (`translateX(380px)`).

### Цепочка проявления

1. 4 нотификации пришли одновременно (`Promise.all` от Telegram при синхронизации)
2. React batches setState → 4 element-а добавляются в DOM почти одновременно
3. CSS animation triggered для каждого
4. Cascade delay + browser layout — некоторые animation **не доезжают** до 100% keyframe
5. Через 600мс fallback ставит `slideInDone=true` для застрявших
6. [`calcHeight()`](../main/notification.js) в начале файла теперь учитывает их (h=182)
7. Окно расширяется на 182px пустого пространства
8. Visual transform остаётся `translateX(380)` → element за рамкой окна
9. → **«невидимая полоса»**

### Почему v0.89.35 не помог

`backgroundThrottling: false` (v0.89.35) ускоряет **быстрый путь** — CSS animations и rAF не throttled. Но **race с одновременным batch-добавлением** — это разная проблема:
- Browser layout/paint queue
- React batches setState
- 4 параллельных `requestAnimationFrame` callbacks
- CSS animation engine может пропустить frame

`backgroundThrottling: false` снижает вероятность, но **не гарантирует** что все 4 animation дойдут до 100%.

### Сверка с другими мессенджерами

| Мессенджер | Подход | Что отличается |
|---|---|---|
| Telegram Desktop | JS-driven `requestAnimationFrame` loop с explicit final state | Не полагается на CSS animation |
| WhatsApp Web | CSS `transition` (не `animation`) — start/end явные | Transition всегда даёт final state |
| Discord | `framer-motion` с onComplete + final state guarantee | Библиотека гарантирует final state |
| Slack | CSS + JS-fallback который **форсирует** конечное состояние | Так же как наш v0.89.36 |

**Общий паттерн**: гарантировать final state через JS, не полагаться только на CSS `animationend`.

### Решение (v0.89.36)

[`main/notification.js:573-595`](../main/notification.js) — fallback теперь **форсирует** финальное состояние:

```js
setTimeout(() => {
  if (el.dataset.slideInDone === 'false') {
    el.dataset.slideInDone = 'true'
    el.removeEventListener('animationend', onSlideInEnd)
    // v0.89.36: ФОРСИРУЕМ финальное состояние slideIn keyframe 100%.
    el.style.animation = 'none'
    el.style.transform = 'translateX(0) scale(1)'
    el.style.opacity = '1'
    reportHeight()
  }
}, 600)
```

3 свойства принудительно ставятся в **финальное состояние** slideIn keyframe 100%. Это страховка от **любых** race-conditions — backgroundThrottling, cascade delay, keyframe error, race с пакетом одновременных нотификаций.

### Регрессионная защита

[`transparentWindowGuard.test.cjs`](../src/__tests__/transparentWindowGuard.test.cjs) проверяет в fallback блоке наличие:
- `style.transform = 'translateX(0)...'`
- `style.animation = 'none'`
- `style.opacity = '1'`

Pre-commit hook падает при удалении любого из трёх. Верифицировано: убрал force transform → 18/19, вернул → 19/19.

### Что закрывается

- ✅ «Невидимая полоса» при 4+ одновременных нотификациях (race)
- ✅ Cascade delay > 600мс (большой стек)
- ✅ Keyframe error / прерывание animation
- ✅ Будущие throttling сценарии (страховка)
- ✅ Гарантия: через 600мс после addNotification element **всегда** в видимой зоне

### Правило

CSS animations не дают гарантии final state. Любой код полагающийся на CSS animation для перевода элемента в конкретное состояние **обязан** иметь JS-fallback который **форсирует** это состояние, а не просто помечает флагом.

«Помечать флагом без forced state» = баг ждущий проявления.

### Дополнение v0.89.38 (19 мая 2026)

Через 3 часа после v0.89.36 в логе 13:34 снова увидел `realTf=matrix(1,0,0,1,380,0) slid=true` для id=37. Расследование:

- `Last Logger init: 2026-05-19 08:29:06` — приложение работало со старым кодом (v0.89.36 commit был в 10:58, перезапуска не было)
- НО — `inlineTf=none, slid=true` — `animationend` сработал **нормально**, не fallback

Открылась **новая** уязвимость: force transform в v0.89.36 ставился **только в fallback path** (через 600мс timeout). Нормальный `animationend` помечал `slideInDone=true` без force. CSS `animation-fill-mode: forwards` не гарантировал translateX(0) при частичной прерванной анимации.

**v0.89.38 фикс**: единый helper `forceFinalSlideInState()` вызывается **из обоих путей**:
```js
const forceFinalSlideInState = () => {
  el.style.animation = 'none'
  el.style.transform = 'translateX(0) scale(1)'
  el.style.opacity = '1'
}
// 1. Нормальный animationend
const onSlideInEnd = (e) => {
  if (e.animationName !== 'slideIn') return
  el.dataset.slideInDone = 'true'
  el.removeEventListener('animationend', onSlideInEnd)
  forceFinalSlideInState()   // ← v0.89.38: было пропущено в v0.89.36
  reportHeight()
}
// 2. Fallback timeout 600ms (force с v0.89.36)
setTimeout(() => { ... forceFinalSlideInState() ... }, 600)
```

**Регрессионная защита расширена**: тест проверяет минимум 2 вызова `forceFinalSlideInState()` в файле.

---

## 🔴 КРИТИЧЕСКОЕ: Startup ribbon — уведомления при запуске для старых сообщений

### ❌ page-title-updated и unread-count не проверяют warm-up + 10 сек недостаточно

**Симптом**: При запуске приложения показываются ribbon уведомления для старых непрочитанных сообщений из всех мессенджеров. WhatsApp кидает `new Notification()` при загрузке для всех непрочитанных.

**Причина 1 (v0.48.1)**: `page-title-updated` и `unread-count` хендлеры не проверяли `notifReadyRef` warm-up. При запуске счётчик 0→N → fallback ribbon.

**Причина 2 (v0.49.0)**: Warm-up 10 сек недостаточно. WhatsApp загружается 15-30+ секунд и кидает `new Notification()` для всех непрочитанных ПОСЛЕ warm-up. Уведомление "Кезин Евгений АндреевичЗагрузка..." — это WhatsApp показывает контакт при загрузке.

**Решение**:
- v0.48.1: Добавлена проверка `notifReadyRef` в `page-title-updated` и `unread-count`
- v0.49.0: Warm-up увеличен до 30 сек (и в App.jsx, и в main.js backup path)

**Ключевой урок**: Warm-up должен быть >= 30 сек. Мессенджеры (особенно WhatsApp) загружаются медленно и кидают Notification для СТАРЫХ непрочитанных при загрузке. 10 сек категорически недостаточно.

---

## 🟡 ВАЖНОЕ: «Перейти к чату» — навигация не работает

### ❌ buildChatNavigateScript не находит элементы / не возвращает результат

**Симптом**: Кнопка "Перейти к чату" на ribbon просто открывает окно мессенджера, но не переходит к конкретному чату.

**Причины**:
1. Fallback ribbon (`page-title-updated`/`unread-count`) не передаёт `senderName`/`chatTag` → навигация невозможна (только `setActiveId`).
2. Задержка 350ms слишком маленькая — WebView может не успеть отрисовать sidebar после `setActiveId`.
3. `buildChatNavigateScript` не возвращал результат → нельзя понять, нашёл ли элемент.
4. Для MAX использовались generic селекторы вместо Telegram-like (MAX — форк Telegram Web K).

**Решение (v0.49.0)**:
- Все скрипты в `buildChatNavigateScript` возвращают `true/false`.
- Retry: до 3 попыток с задержкой 1.2 сек если элемент не найден.
- Задержка первой попытки увеличена до 600ms.
- MAX: добавлены `.chatlist-chat .peer-title` селекторы (как у Telegram).
- WhatsApp: добавлен fuzzy match по `startsWith` для обрезанных имён.
- Логирование `[GoChat]` для отладки.

**Ключевой урок**: executeJavaScript в WebView для поиска DOM-элементов — хрупкий подход. Нужны retry и логирование. Селекторы должны быть проверены для каждого мессенджера отдельно.

---

## 🟡 ВАЖНОЕ: MAX — ribbon без имени отправителя и аватарки

### ❌ MAX НЕ вызывает showNotification для каждого сообщения (особенно в фоне)

**Симптом**: Ribbon уведомление от MAX показывает "Макс" вместо имени отправителя. Нет аватарки. Лог уведомлений пуст. Работает только когда пользователь переключился на вкладку MAX.

**Причина 1**: MAX не всегда вызывает `ServiceWorkerRegistration.showNotification()`. Уведомления приходят через `quickNewMsgCheck` (MutationObserver addedNodes → `__CC_MSG__`), который передаёт только текст без sender/avatar.

**Причина 2**: `enrichNotif()` + `findSenderInChatlist(body)` работают только внутри override showNotification в main world. Путь `__CC_MSG__` эти функции не вызывает. Лог `__cc_notif_log` тоже заполняется только из override.

**Причина 3**: Когда title = "Макс" (совпадает с `_appTitles`), `enrichNotif` ищет sender в chatlist по body.slice(0,30). Но chatlist preview может не содержать текст нового сообщения (если DOM ещё не обновился).

**Решение (v0.54.0)**:
- `getActiveChatSender()` + `getActiveChatAvatar()` в monitor.preload.js — извлекают имя и аватарку из заголовка АКТИВНОГО чата (`.chat-info .peer-title`, `.topbar img.avatar-photo`).
- `quickNewMsgCheck` эмиттит `__CC_NOTIF__` с enriched данными вместо голого `__CC_MSG__`.
- Backup: App.jsx `__CC_MSG__` handler обогащает через `executeJavaScript` и пишет в `__cc_notif_log`.
- `new-message` IPC ждёт 500мс — приоритет enriched `__CC_NOTIF__`.

**Ключевой урок**: Нельзя полагаться на `showNotification` override как единственный источник уведомлений. Некоторые мессенджеры (MAX) не вызывают Notification API вообще. `addedNodes` detection — необходимый fallback, который тоже должен обогащать данные отправителя.

**Диагностика (v0.55.0)**: Pipeline Trace Logger — трассирует каждый шаг: source → spam → dedup → handle → viewing → sound → ribbon. Если лог показывает "ПОКАЗАНО" а ribbon не появился — смотреть trace на предмет `viewing:БЛОК` (isViewingThisTab=true) или `dedup:БЛОК` (обработан раньше другим путём).

---

## 🟡 ВАЖНОЕ: VK — ribbon для своих исходящих, статусов online, "N непрочитанных"

### ❌ VK шлёт Notification для ВСЕХ событий, включая свои сообщения и статусы

**Симптом**: Ribbon показывает: "Красотка моя, довольна?" (ваше исходящее), "минуту назад" (статус online), "2 непрочитанных сообщений" (бесполезный fallback). Нет имени отправителя — показывает "ВКонтакте".

**Причины**:
1. VK вызывает `new Notification()` для СВОИХ исходящих сообщений (без разделения входящие/исходящие).
2. VK шлёт Notification для статусов online ("минуту назад", "только что", "был в сети").
3. Fallback ribbon "N непрочитанных" из `page-title-updated`/`unread-count` — бесполезный текст без имени.
4. VK передаёт title = "ВКонтакте" → `enrichNotif` ловит regex, но `findSenderInChatlist` использовал только `.chatlist-chat` (Telegram), а не VK-селекторы.

**Решение (v0.51.0)**:
- `isSpamNotif(body)` — regex-фильтр: статусы online, счётчики непрочитанных, "печатает", "набирает".
- `_outgoing` regex — фильтр исходящих по "Вы: " / "You: " в начале body.
- Fallback ribbon "N непрочитанных" ОТКЛЮЧЁН — `__CC_NOTIF__` покрывает все настоящие сообщения.
- `findSenderInChatlist` расширен: VK generic селекторы `[class*="dialog"]`, `[class*="conversation"]`, `[class*="title"]`, `[class*="name"]`.
- `_findAvatarInEl` — вспомогательная функция для аватарок (img, canvas, background-image).
- Фильтры добавлены в 3 места: injection script, `__CC_NOTIF__` handler (App.jsx), backup path (main.js).

**Ключевой урок**: Мессенджеры (VK, MAX) используют Notification API не только для входящих. Нужна обязательная фильтрация body: исходящие ("Вы:"), статусы, системные тексты.

---

## 🔴 КРИТИЧЕСКОЕ: requestAnimationFrame НЕ работает в hidden BrowserWindow

### ❌ Использование rAF в notification window

**Симптом**: Ribbon уведомления показываются только при первой загрузке, потом перестают появляться навсегда.

**Причина**: `reportHeight()` в notification.html использовал двойной `requestAnimationFrame` для стабильного layout. Но Chromium НЕ вызывает rAF для hidden/invisible окон. После dismiss всех уведомлений → `notifWin.hide()` → rAF больше никогда не выполняется → `notif:resize` не приходит → `showInactive()` не вызывается → окно навсегда скрыто.

**Решение (v0.47.2)**: Заменить rAF на `setTimeout(60ms)`. Также main.js показывает `showInactive()` ДО отправки `notif:show`, чтобы layout гарантированно работал.

**Ключевой урок**: В Electron BrowserWindow с `show: false` или после `hide()` — НИКОГДА не использовать `requestAnimationFrame`. Использовать `setTimeout`.

---

## 🔴 КРИТИЧЕСКОЕ: Ложные ribbon при навигации между чатами

### ❌ getLastMessageText срабатывает на СТАРЫЕ сообщения при смене чата

**Симптом**: При переключении на другой чат в Telegram появляется ribbon уведомление для старого (уже прочитанного) сообщения.

**Причина**: Path 2 в `sendUpdate()` (monitor.preload.js) — `getLastMessageText(type)` находит последнее видимое сообщение в DOM. При навигации к ДРУГОМУ чату: DOM обновляется → MutationObserver → `sendUpdate()` → `getLastMessageText` находит текст из нового чата → отличается от `lastActiveMessageText` → считается "новым" → `new-message` IPC → ribbon.

**Решение (v0.47.2)**: Path 2 отключён для Telegram (`type !== 'telegram'`). У Telegram хорошо работает `__CC_NOTIF__` (перехват Notification API) + unread count. Path 2 нужен только для мессенджеров где unread count не растёт при открытом чате (MAX, WhatsApp, VK).

**Ключевой урок**: `getLastMessageText` — ненадёжный детектор новых сообщений. Он не различает "новое сообщение в текущем чате" и "старое сообщение в другом чате, на который переключились". Для мессенджеров с работающим Notification API (Telegram) — использовать `__CC_NOTIF__`, не Path 2.

---

## 🔴 КРИТИЧЕСКОЕ: Глобальные настройки ломают отдельные мессенджеры

### ❌ Одни настройки на все мессенджеры = "чиним одно, ломается другое"

**Симптом**: Изменения для одного мессенджера (MAX) ломают уведомления для других (Telegram, VK).

**Причина**: До v0.47.0 все настройки уведомлений были глобальные: `soundEnabled`, `notificationsEnabled`, `mutedMessengers`. Фикс для MAX (addedNodes, fallback ribbon) влиял на ВСЕ мессенджеры.

**Решение (v0.47.0)**: Per-messenger настройки: `messengerNotifs: { [id]: { sound: bool, ribbon: bool } }`. Каждый мессенджер управляется отдельно. Глобальные настройки = fallback. UI: два toggle (Звук + Ribbon) на каждый мессенджер в SettingsPanel.

**Ключевой урок**: Настройки уведомлений ВСЕГДА должны быть per-messenger. Глобальные — только как default/fallback.

---

## 🔴 КРИТИЧЕСКОЕ: Ribbon только для первого сообщения (повторные — только звук)

### ❌ Мессенджеры не вызывают `new Notification()` для каждого нового сообщения

**Симптом**: При получении нескольких сообщений подряд (в MAX и др.) ribbon показывается только для первого, остальные — только звук.

**Причина**: Ribbon создаётся ТОЛЬКО через `handleNewMessage()`, который вызывается из `__CC_NOTIF__` (перехват Notification API) и `new-message` (MutationObserver IPC). Многие мессенджеры (MAX, VK, WhatsApp) группируют уведомления и не вызывают `new Notification()` для каждого отдельного сообщения. При этом `page-title-updated` и `unread-count` хендлеры играют звук при росте счётчика, но НЕ создают ribbon.

**4 пути уведомлений**:
1. `__CC_NOTIF__` → `handleNewMessage()` → ribbon + звук ✅
2. `new-message` IPC → `handleNewMessage()` → ribbon + звук ✅
3. `page-title-updated` → звук ⚠️ (ribbon НЕ создавался)
4. `unread-count` IPC → звук ⚠️ (ribbon НЕ создавался)

**Решение (v0.46.2)** — НЕПОЛНОЕ, не работает для MAX:
1. Добавить `lastRibbonTsRef = useRef({})` — `{ [messengerId]: timestamp }` последнего показа ribbon
2. В `handleNewMessage` перед `app:custom-notify` записывать `lastRibbonTsRef.current[messengerId] = Date.now()`
3. В `page-title-updated` и `unread-count` хендлерах: если `Date.now() - lastRibbonTs > 3000` → создавать fallback ribbon

**Почему v0.46.2 НЕ помогло для MAX**: Когда чат ОТКРЫТ в WebView → MAX считает сообщения прочитанными → unread count = 0 → НЕ растёт → `page-title-updated` не имеет `(N)` в title → `unread-count` IPC = 0 → fallback ribbon никогда не срабатывает. Звук шёл от самого MAX (AudioContext, не `new Audio()`).

**Решение (v0.46.3)** — addedNodes detection:
1. `quickNewMsgCheck()` в MutationObserver — анализирует `mutation.addedNodes` напрямую
2. При появлении нового DOM-элемента с текстом (2-500 символов) → `new-message` IPC
3. Фильтрация: пропускаются BUTTON/INPUT/SVG/IMG, элементы >40 children, timestamps, служебные тексты
4. Cooldown 3 сек + dedup по тексту + `isViewingThisTab` в App.jsx
5. Работает для MAX, WhatsApp, VK. Telegram исключён (работает через `__CC_NOTIF__`)

**Ключевой урок**: Нельзя полагаться на unread count для ribbon — когда чат открыт в WebView, count не растёт. Нужен прямой мониторинг DOM mutations (addedNodes).

---

## 🔴 КРИТИЧЕСКОЕ: Enrichment addedNodes — timing + селекторы + dedup race

### ❌ getActiveChatSender() не находит заголовок чата в MAX

**Симптом**: `__CC_NOTIF__` от preload приходит с `t=""` (пустой sender), enrichment из `__CC_MSG__` тоже возвращает `sender="нет"`. Но showNotification override через `enrichNotif` → `findSenderInChatlist` находит sender корректно.

**Причина 1**: Селекторы `.chat-info .peer-title, .topbar .peer-title` не соответствуют DOM MAX (SvelteKit). MAX может использовать другие классы для header чата.

**Причина 2 (timing)**: `quickNewMsgCheck` (addedNodes) срабатывает мгновенно — chatlist preview ещё НЕ обновлён. `findSenderInChatlist` ищет `bodySlice` в `.chatlist-chat textContent` → не находит, потому что chatlist обновляется позже.

**Причина 3 (dedup race)**: Если preload эмиттит `__CC_NOTIF__` с `t=""`, этот пустой NOTIF регистрируется в `notifDedupRef`. Через 43мс приходит enriched NOTIF из showNotification с `t="Имя"` → дедуплицируется.

**Решение (v0.55.1)**:
1. `quickNewMsgCheck` эмиттит `__CC_MSG__` (не `__CC_NOTIF__`) — не конкурирует с enriched showNotification
2. 8 вариантов header-селекторов (`.peer-title`, `[class*="title"]`, `[class*="name"]`, `header [class*="title"]` и др.)
3. Fallback: active/selected чат в sidebar (`.chatlist-chat.active`, `[class*="chat"][class*="active"]`)
4. Задержка 150мс перед enrichment — chatlist успевает обновиться
5. Спам-фильтр для "Ожидание сети..." и системных текстов MAX во ВСЕХ 4 фильтрах

**Ключевой урок**: addedNodes detection МГНОВЕННАЯ, а chatlist preview обновляется ПОЗЖЕ. Нужна задержка enrichment и fallback по active chat (а не по тексту). Preload должен эмиттить `__CC_MSG__` (не `__CC_NOTIF__`), чтобы не блокировать enriched showNotification через dedup.

---

## 🔴 КРИТИЧЕСКОЕ: ribbonExpandedByDefault ломает показ ribbon-уведомлений

### ❌ overflow:hidden на .notif-item + таймер при expandedByDefault + порядок авто-раскрытия

**Симптом**: При включении настройки "Кнопки действий сразу" (ribbonExpandedByDefault) ribbon-уведомления перестают показываться полностью.

**Причина 1**: `overflow: hidden` на `.notif-item` обрезал expanded-контент, который выходил за min-height (76px).

**Причина 2**: Таймер dismiss запускался ДАЖЕ при `expandedByDefault` → уведомление авто-удалялось через dismissMs.

**Причина 3**: Авто-раскрытие (`el.classList.add('expanded')`) происходило ДО настройки таймера → `items.set()` записывал `expanded: false`, хотя уведомление уже было раскрыто.

**Причина 4**: Начальная высота окна 76px — слишком мала для expanded ribbon (~120px+). `notif:resize` IPC не успевал увеличить окно.

**Решение (v0.46.1)**:
1. Убрать `overflow: hidden` с `.notif-item`
2. При `expandedByDefault` — НЕ запускать таймер, поставить `progress.style.animationPlayState = 'paused'`
3. Код авто-раскрытия (`if (data.expandedByDefault)`) перенести ПОСЛЕ настройки таймера и mouseenter/mouseleave
4. Начальная высота окна 300px (а не 76px)

**Ключевой урок**: При expandedByDefault нужно пауза таймера С ПЕРВОЙ секунды, и авто-раскрытие ПОСЛЕ полной настройки таймера.

### ❌ CSS `display: none/flex` не анимируется

**Симптом**: `.action-row { display: none }` → `.expanded .action-row { display: flex }` — переключение мгновенное, без анимации.

**Причина**: CSS свойство `display` не поддерживает transition.

**Решение**: Заменить на `max-height: 0` + `overflow: hidden` + `opacity: 0` → `max-height: 60px` + `opacity: 1` с `transition: max-height 200ms, opacity 200ms`.

**Ключевой урок**: Для анимации показа/скрытия блока использовать max-height transition, НЕ display toggle.

---

## 🔴 КРИТИЧЕСКОЕ: Подсчёт непрочитанных в Telegram Web K

### ❌ Суммирование бейджей отдельных чатов (querySelectorAll + persistent Map)

**Симптом**: Счётчик показывает 1796 вместо правильных 26. Telegram "Все чаты" пишет 26 — это верно.

**Причина 1 (v0.7–v0.19)**: `querySelectorAll('.badge')` считает только видимые диалоги (~20 шт.) → скачки при скролле (594 → 1435 → 2918).

**Причина 2 (v0.20.0, persistent Map)**: Map суммирует бейджи КАЖДОГО чата (каналы: 9.4K + 3.4K + 2.3K + ...) → выдаёт тысячи. Telegram же считает "Все чаты" = число ЧАТОВ с непрочитанными, а НЕ сумму всех сообщений.

**Решение (v0.22.0)**: НЕ суммировать бейджи чатов. Читать ГОТОВЫЙ счётчик Telegram:
1. `document.title.match(/\((\d+)\)/)` — `(26) Telegram Web`
2. Первый бейдж в folder tab (`.tabs-tab .badge` и др.)
3. **Адаптивный поиск**: `.badge` НЕ внутри `.chatlist-chat` = folder tab badges
4. Fallback: сумма chatlist badges

**Ключевой урок**: Число на folder tab "Все чаты" ≠ сумма бейджей чатов!

### ❌ Жёсткие CSS-селекторы для folder tabs Telegram

**Симптом**: `.tabs-tab` не находит элементы → бейдж = 0.

**Причина**: Telegram Web K имеет разные layout'ы folder tabs (горизонтальный, вертикальный), с разными CSS-классами.

**Решение (v0.22.0)**: Адаптивный поиск с несколькими селекторами + диагностический IPC `monitor-diag` для отладки. При неизвестном layout'е — `.badge` элементы НЕ внутри chatlist = folder badges.

**Решение (v0.23.0)**: `page-title-updated` event на WebView — ловит `(N)` из `document.title` мгновенно, без MutationObserver и без CSS-селекторов.

### ❌ MutationObserver не ловит изменение document.title

**Симптом**: `document.title` содержит `(26) Telegram Web`, но `countUnreadTelegram()` возвращает 0.

**Причина**: MutationObserver наблюдает `document.body`, а `<title>` находится в `<head>`. Изменение title НЕ триггерит observer → `sendUpdate()` не вызывается при обновлении title.

**Решение (v0.23.0)**: `el.addEventListener('page-title-updated', ...)` в renderer — встроенное событие Electron WebView, срабатывает мгновенно при изменении title. Не зависит от MutationObserver.

---


---


## Кастомные уведомления (v0.39.0)

### Потенциальные ошибки при работе с Notification BrowserWindow

**1. `transparent: true` на Windows требует осторожности:**
- Windows 11 поддерживает transparent BrowserWindow, но `backgroundColor` должен быть `#00000000`
- Без `frame: false` прозрачность НЕ работает
- HTML body тоже должен иметь `background: transparent`

**2. `focusable: false` + клики:**
- `focusable: false` предотвращает кражу фокуса при `showInactive()`
- НО окно всё равно кликабельно — `setIgnoreMouseEvents(false)` по умолчанию
- Если поставить `setIgnoreMouseEvents(true)` — клики будут проходить СКВОЗЬ окно

**🔴 РЕАЛИЗОВАНО в v0.89.18 — ловушка №20: ghost hit-test после `.hide()`**

**Симптом** (пользователь, 18 мая 2026): после показа уведомления на экране остаётся тонкая линия + невидимый прямоугольник, перехватывающий клики. Видно на скриншоте — артефакт ~80px на правой стороне.

**Корневая причина**: `transparent: true` + `frame: false` BrowserWindow на Windows 11 после `.hide()` оставляет OS hit-test регион в bounds окна. Это известная Electron issue ([electron#15947](https://github.com/electron/electron/issues/15947)). Пункт «2.» выше описывал риск, но не закрывал — **78 версий** проблема висела в коде.

**Решение**: helper [`main/utils/transparentWindowGuard.js`](../../main/utils/transparentWindowGuard.js) с функцией `safeHideTransparentWindow(win)`:
```js
win.setIgnoreMouseEvents(true)           // клики проходят насквозь
win.setBounds({ x: -30000, y: -30000, width: 1, height: 1 }) // увели за экран в 1×1
win.hide()                               // фактический hide
```
И `restoreMouseEvents(win)` перед каждым `showInactive()`/`show()`.

**5 мест применения** (все `.hide()` на transparent BrowserWindow):
- `notifHandlers.js:66` — последнее уведомление dismiss
- `notificationManager.js:113` — `repositionNotifWin(count=0)`
- `dockPinHandlers.js:108` — pin → dock
- `dockPinHandlers.js:267` — `dock:close` IPC
- `dockPinState.js:162` — нет pins в dock

**Регрессионная защита**: [`src/__tests__/transparentWindowGuard.vitest.js`](../../src/__tests__/transparentWindowGuard.vitest.js) содержит тест, который сканирует 4 файла и **падает**, если кто-то добавит сырой `.hide()` на transparent окно без helper'а. Любая будущая регрессия поймается в CI.

**Правило на будущее**: ЛЮБОЕ окно `transparent: true` на Windows 11 → `.hide()` ТОЛЬКО через `safeHideTransparentWindow()`. Никогда напрямую. Pre-commit поймает.

**🔴 ЛОВУШКА #21 (v0.89.22): `setIgnoreMouseEvents` в safeHide ломал клики**

**Симптом** (пользователь со скриншотом Task Manager, 18 мая 2026): нажатия мыши тормозят / иногда не срабатывают с первого раза. Windows работает нормально, CPU нагрузка 3.1% — **не perf проблема**, а проблема **событий мыши**.

**Корневая причина** — повторил ловушку #27 v0.71.7 через 18 версий:

```js
// v0.89.18 — мой helper в transparentWindowGuard.js:
export function safeHideTransparentWindow(win) {
  win.setIgnoreMouseEvents(true)            // ← НАРУШЕНИЕ #27
  win.setBounds({x:-30000, ..., width:1, height:1})
  win.hide()
}
```

Что я не учёл:
1. **Ловушка #27 (v0.71.7)**: `setIgnoreMouseEvents` блокирует `-webkit-app-region: drag` у pin/dock окон. `pin-dock.preload.cjs:37` прямо записывает: «УДАЛЕНО — setIgnoreMouseEvents ломает -webkit-app-region: drag».
2. **Electron official docs**: «state persists until explicitly changed» — state `true` остаётся пока явно не вернуть `false`.
3. **В 5 точках `.show()` для pin/dock** не было парных `restoreMouseEvents(win)` (grep подтвердил 0 вызовов в dockPin*).

**Цепочка симптома**:
```
1. Pin window visible (нормальная работа)
2. User → отправить в dock → safeHide → setIgnoreMouseEvents(true) + offscreen + hide
3. User → открыть pin обратно → win.show()
   ↑ НЕТ парного restoreMouseEvents → setIgnoreMouseEvents всё ещё true
4. Pin visible, но клики ПРОХОДЯТ НАСКВОЗЬ
5. User кликает → click сквозь pin → попадает в окно ПОД ним
6. Пользователь видит «нажатие не сработало», кликает второй раз
```

**Решение (v0.89.22)**: УДАЛЁН `setIgnoreMouseEvents` из `safeHide` целиком. Также удалена функция `restoreMouseEvents` (больше не нужна). Защита от ghost-региона полностью покрывается через:
- `setBounds({x:-30000, y:-30000, width:1, height:1})` — окно физически **за всеми мониторами**, размер **1 пиксель**
- `hide()` — окно скрыто

Скрытое окно не получает hit-test. Даже visible — за пределами всех мониторов. Размер 1×1 — пользователь никогда не «наведёт мышь именно на этот пиксель». Третий слой защиты (setIgnoreMouseEvents) был **избыточным** и ломал клики.

**Регрессионная защита**:
- [`src/__tests__/transparentWindowGuard.test.cjs`](../../src/__tests__/transparentWindowGuard.test.cjs) теперь **падает** если кто-то вернёт `setIgnoreMouseEvents(true)` в helper:
  ```js
  assert(!/setIgnoreMouseEvents\s*\(\s*true\s*\)/.test(helper),
    'setIgnoreMouseEvents(true) ВЕРНУЛИ в helper! Это ломает...')
  ```
- vitest: новый assertion `НЕ вызывает setIgnoreMouseEvents (ловушка #27 — блокирует drag)`

**Правило на будущее**: если в `mistakes/*.md` есть ловушка про API X — **прочитать её перед использованием X**, особенно если правишь похожий код. У меня в v0.89.18 на втором dashe сессии не дошли руки прочитать `webview-stack-grouping.md` где была ловушка #27. Через 4 итерации (v0.89.18 → v0.89.19 → v0.89.20 → v0.89.21) пользователь поймал баг через скриншот Task Manager.

**3. Путь к notification.html в production:**
- В dev: `path.join(__dirname, '../../main/notification.html')` (от out/main/)
- В prod: зависит от структуры сборки — `notification.html` должен быть включён в `build.files` в package.json или скопирован при сборке
- Если файл не найден — `loadFile()` молча покажет пустое окно

**4. `screen` API доступен ТОЛЬКО после `app.whenReady()`:**
- `const { screen } = require('electron')` — OK на уровне модуля
- НО `screen.getPrimaryDisplay()` вернёт ошибку если вызван до `app.whenReady()`
- NotificationManager создаёт окно лениво (при первом уведомлении) — к тому моменту app уже ready

**5. Resize BrowserWindow на Windows — не плавный:**
- `setBounds()` с `animate: true` работает ТОЛЬКО на macOS
- На Windows: мгновенное изменение, может мелькать
- Решение: использовать CSS-анимацию ВНУТРИ окна, а `setBounds` вызывать по IPC `notif:resize` когда HTML сообщает нужную высоту

**🔴 ЛОВУШКА #22 (v0.89.23): «Пустая полоса» — slideIn animation + setBounds на основе offsetHeight**

**Симптом** (скриншот пользователя, 18 мая 2026 в 12:12): сверху видно нормальное Telegram уведомление «vevs.home», ниже — пустая полоса. Окно высоты 352px, но visually занято только верхней частью.

**Корневая причина** — подтверждено MDN документацией:

1. 📚 **`offsetHeight` НЕ зависит от `transform`** ([MDN HTMLElement.offsetHeight](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetHeight)):
   > «`offsetHeight` measures layout position, not visual position. CSS transforms affect only visual rendering without changing position in the document layout flow.»

2. 📚 **CSS animation transform НЕ пишется в `el.style.transform`** ([MDN Using CSS animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Using_CSS_animations)):
   > «Animated property values do NOT appear in `element.style` — they only exist in the computed style during animation.»

**Цепочка**:
```
T=0       appendChild(el), CSS animation slideIn 300ms запускается
          el.style.transform="" (inline) НО visually translateX(380px) → 0
T=60ms    reportHeight() → calcHeight() = 352 (offsetHeight=158 уже!)
          main: setBounds(352) — окно расширяется СРАЗУ
T=60-300  visually: новый element ЕЩЁ за экраном (translateX анимируется)
          В окне внизу — ПУСТОТА (где element будет, но ещё нет)
T=300ms   animation done — пустоты больше нет
```

**Решение (v0.89.23)** — в [`main/notification.js`](../../main/notification.js):
- Перед `appendChild` поставить `el.dataset.slideInDone = 'false'`
- Слушать `animationend` для slideIn → ставить `'true'` + `reportHeight()`
- В `calcHeight()` пропускать elements с `slideInDone === 'false'`
- Страховка: setTimeout 600ms на случай если animationend не сработает

Окно не расширяется пока новый element анимируется → нет пустоты.

**Регрессионная защита**: DOM snapshot теперь логирует `getComputedStyle().transform` (видим РЕАЛЬНЫЙ transform во время animation) + флаг `slideInDone`.

**Правило**: при CSS animation с transform — НЕ полагаться на `offsetHeight` для расчёта visual layout пока animation идёт. Использовать `getBoundingClientRect()` (учитывает transform) или явный флаг готовности.

**🔴 ЛОВУШКА #23 (v0.89.23): IPC race — stale `resize(0)` от прошлого dismiss**

**Симптом** (логи 12:12:03-04, 18 мая 2026):
```
12:12:02 safeHide called wasVisible=true h=136  ← старое уведомление закрылось
12:12:03 [notif-resize] raw=0 visible=true items=1  ← items=1, но raw=0!
12:12:03 safeHide called  ← окно ошибочно скрыто
12:12:04 [notif-resize] raw=424 visible=false items=1  ← правильный resize поздно
```

Окно ошибочно скрывается несмотря на новое уведомление в `notifItems[]`.

**Корневая причина** — подтверждено Electron docs:
📚 [Electron ipcRenderer.send](https://www.electronjs.org/docs/latest/api/ipc-renderer):
> «Send an **asynchronous** message to the main process via channel.»

**Цепочка**:
```
T=0    User dismiss item id=76
T=520  Renderer animation done, el.remove(), reportHeight() → setTimeout 60ms
T=550  Main: новое уведомление пришло → notif:show → items.push (length=1)
T=580  Renderer прислал resize(0) от прошлого reportHeight (stale)
T=600  Main: height=0 → safeHide ❌ (items=1!)
T=700  Renderer прислал resize(424) для нового item — окно уже скрыто
```

**Решение (v0.89.23)** — в [`main/handlers/notifHandlers.js`](../../main/handlers/notifHandlers.js):
```js
if (height <= 0 && itemsCount > 0) {
  console.log('[notif-resize] IGNORE stale raw=0 (items=' + itemsCount + ' > 0)')
  return
}
```

Если main process знает что есть item (`notifItems.length > 0`), но renderer прислал `resize(0)` — это **запоздалый stale event**. Игнорируем — следующий reportHeight пришлёт правильное значение.

**Правило**: при IPC + setTimeout-coalescing — main process **не должен слепо доверять** последнему received значению. Проверять консистентность с авторитативным состоянием (`notifItems[].length` в main).

**🔴 ЛОВУШКА #25 (v0.89.26): окно visible после dismiss — мой собственный v0.89.23 фикс создал deadlock**

**Симптом** (скриншот 14:48, 18 мая 2026): пользователь видит пустую полоску в правом нижнем углу. Лог показал точное время:

```
14:48:18 dismiss final-report id=104 itemsAfter=0 calcH=0
14:48:18 reportHeight→resize(0) items=0 containerChildren=0     ← renderer пуст
14:48:18 [notif-resize] raw=0 visible=true items=1               ← MAIN items=1
14:48:18 IGNORE stale raw=0 (items=1 > 0)                        ← v0.89.23 фикс
```

Окно `visible=true` с старыми bounds, больше resize не приходит → видна полоска.

**Корневая причина — race в моём же v0.89.23 фиксе**:

В v0.89.23 я добавил защиту от stale `resize(0)`:
```js
if (height <= 0 && itemsCount > 0) return  // IGNORE
```

Это правильно для случая «новое уведомление пришло, renderer ещё не отрапортовал». Но создаёт **deadlock** при dismiss:

```
T=0     renderer dismiss animation done
T=520   renderer.reportHeight() → setTimeout 60ms
T=540   renderer вызывает notifApi.dismiss(id) → IPC notif:dismiss
T=580   IPC notif:resize(0) приходит первым (порядок не гарантирован)
        main: items=1, raw=0 → IGNORE (defense #23)
T=600   IPC notif:dismiss приходит → items=0
        main: НЕТ повторного reportHeight → safeHide НИКОГДА не вызывается
        ОКНО ОСТАЁТСЯ ВИДИМЫМ
```

📂 Все 3 dismissing handler'а ([`notifHandlers.js:10-58`](../../main/handlers/notifHandlers.js)) — `notif:click`, `notif:mark-read`, `notif:dismiss` — удаляют item из `notifItems[]` но **не проверяют `length === 0`** → не вызывают safeHide.

**Решение (v0.89.26)**: helper `hideIfEmpty()` в `initNotifHandlers` — вызывается после каждого `setNotifItems(...)`:
```js
const hideIfEmpty = () => {
  if (getNotifItems().length === 0) {
    const notifWin = getNotifWin()
    if (notifWin && !notifWin.isDestroyed()) safeHideTransparentWindow(notifWin)
  }
}
```

Применён в `notif:click`, `notif:mark-read`, `notif:dismiss` — после каждого filter.

**Правило**: main process — авторитативный источник состояния. После любого изменения коллекции `notifItems[]` ОБЯЗАТЕЛЬНО проверять `length === 0` и вызывать safeHide самостоятельно. **Не полагаться на renderer reportHeight(0)** — IPC порядок не гарантирован, может прийти раньше dismiss.

**Защита v0.89.23 остаётся** — она нужна для других race (между `notif:show` и первым reportHeight, когда renderer ещё не успел отрендерить). Теперь main process **сам гарантирует** скрытие через `hideIfEmpty()`, не зависит от renderer.

**🔴 ЛОВУШКА #26 (v0.89.27): main `notifItems[]` накапливает мусор от ghost-stacking**

**Симптом** (скриншот 15:00, 18 мая 2026): полоска появляется ОПЯТЬ — даже после v0.89.26 `hideIfEmpty()`. Лог:
```
15:00:27 dismiss final-report id=3 itemsAfter=0 calcH=0      ← renderer пуст
15:00:27 reportHeight→resize(0) items=0 containerChildren=0   ← renderer
15:00:27 [notif-resize] raw=0 visible=true items=2            ← MAIN items=2 мусор
15:00:27 IGNORE stale raw=0 (items=2 > 0)                     ← блокирует safeHide
```

**Корневая причина — ghost-stacking создаёт mismatch**:

Stacking flow ([`notification.js:177-216`](../../main/notification.js)):
1. Уведомление #1 от мессенджера X → main `notifItems.push(A)`, renderer `addNotification(A)` создаёт DOM element + `stacks.set(X, {hostId:A, childIds:[]})`
2. Уведомление #2 от X → main `notifItems.push(B)`, renderer `stackMessageIntoHost(A,B)` — **создаёт ghost** в `items` Map (`isStackChild:true, el: A.el`) без DOM element, push в `stacks.get(X).childIds`

Когда user dismiss host A:
- `cleanupStack(X)` → для каждого ghostId → `notifApi.dismiss(ghostId)` → main filter → удаляет B
- `dismissItem(A)` → `notifApi.dismiss(A)` → main filter → удаляет A
- main `notifItems[]` = [] ✓

**НО** если ghost B был удалён в renderer **через другой путь** — `cleanupStack` пропускает его:
```js
stack.childIds.forEach(id => {
  const child = items.get(id)
  if (child && !child.dismissing) {  // ← null если ghost уже удалён
    notifApi.dismiss(id)
  }
})
```

Пути удаления ghost без dismiss IPC:
- `forceRemoveItem(id)` при `addNotification` если duplicate id (стр. 287-289)
- FIFO в `notifItems` push в notificationManager.js:198 (но это **main** FIFO — не отправляет renderer dismiss)
- ВАЖНО: main FIFO при `notifItems.length >= 30` делает `notifItems.shift()` — БЕЗ уведомления renderer

Результат: main `notifItems[]` накапливает мусор — id'и которых уже нет в renderer. `hideIfEmpty()` всегда видит `length > 0` → safeHide никогда не срабатывает → пустая полоска.

**Решение (v0.89.27)** — renderer = source of truth для terminal state. Расширен IPC contract:

```js
// notification.js (renderer):
const itemsCount = items.size
const containerCount = container.children.length
window.notifApi.resize(h, { rendererPure: itemsCount === 0 && containerCount === 0 })

// notifHandlers.js (main):
if (height <= 0 && rendererPure) {
  // АВТОРИТАТИВНЫЙ сигнал что у renderer ВООБЩЕ ничего нет
  if (itemsCount > 0) setNotifItems([])  // очистка мусора
  safeHideTransparentWindow(notifWin)
  return
}
```

`rendererPure` — отдельная **terminal-state ветка**. v0.89.23 защита `IGNORE stale raw=0 (items > 0)` остаётся для случая когда `rendererPure=false` (renderer ещё рендерит).

**Правило**: при mismatch между main и renderer state — **terminal-state signal должен быть от renderer** (visual source of truth). main не должен накапливать «теневое» состояние которое renderer не подтверждает.

---

## 🔴 isViewingThisChat подавляет ВСЕ уведомления на активной вкладке (v0.39.0)

### ❌ messengerId ≠ конкретный чат

**Симптом (v0.39.0)**: Пользователь на вкладке VK, приходит сообщение от другого чата VK — ни звука, ни ribbon. `messagePreview` появляется, но sound и notification пропущены.

**Причина**: `isViewingThisChat = !document.hidden && activeIdRef.current === messengerId` подавляло и звук, и ribbon. Но `messengerId` — это ID вкладки (например `"vk"`), а НЕ ID конкретного чата. Оператор на VK-вкладке мог быть в совершенно другом чате.

**Решение (v0.39.1)**: Убрать `!isViewingThisChat` из условий звука и уведомления. Подавление остаётся только по `messengerMuted` и глобальным настройкам.

```js
// БЫЛО (v0.39.0):
if (soundEnabled && !messengerMuted && !isViewingThisChat) playNotificationSound()
if (notificationsEnabled && !messengerMuted && !isViewingThisChat) { ... }

// СТАЛО (v0.39.1):
if (soundEnabled && !messengerMuted) playNotificationSound()
if (notificationsEnabled && !messengerMuted) { ... }
```

**Ключевой урок**: В ChatCenter `messengerId` — это ID WebView-вкладки, а не конкретного чата внутри мессенджера. Нельзя использовать его для определения "пользователь смотрит на этот чат".

---

## 🟡 Прозрачность BrowserWindow на Windows (v0.39.0 → v0.39.1)

### ❌ transparent: true недостаточно без backgroundColor

**Симптом**: Notification window с `transparent: true` показывает чёрный фон вместо прозрачного на Windows.

**Причина**: На Windows `transparent: true` НЕ гарантирует прозрачность без явного `backgroundColor: '#00000000'`.

**Решение**: Всегда добавлять `backgroundColor: '#00000000'` к `transparent: true`:
```js
new BrowserWindow({
  transparent: true,
  backgroundColor: '#00000000',
  // ...
})
```

**Ключевой урок**: На Windows для прозрачного BrowserWindow ОБЯЗАТЕЛЬНО `transparent: true` + `backgroundColor: '#00000000'`.

---

## 🔴 Фантомные уведомления от MAX (v0.39.0 — v0.39.1)

### ❌ __CC_NOTIF__ с пустым body от ServiceWorker

**Симптом**: Уведомление "Макс 11:28" появляется хотя никто не писал. MAX-мессенджер отправляет фантомное уведомление.

**Причина**: MAX (web.max.ru) через ServiceWorker вызывает `showNotification("Макс", {body: ""})` — это push-sync или status-уведомление. Наш перехват ловит его и отправляет `__CC_NOTIF__` с `{t: "Макс", b: ""}`. В App.jsx код использовал `data.b || data.t || ''` — пустой body фолбечил на title "Макс", который обрабатывался как "новое сообщение".

**Решение (v0.39.2)**: Требовать непустой `data.b`:
```js
// БЫЛО:
const text = data.b || data.t || ''  // пустой body → берёт title "Макс"

// СТАЛО:
const text = (data.b || '').trim()   // пустой body → пустой text → skip
```

**Ключевой урок**: Notification API используется мессенджерами не только для сообщений, но и для push-sync, status, reconnect. Фильтровать по непустому body — обязательное условие. Title без body = системное уведомление, не сообщение.

---

## 🔴 Фантомные уведомления VK при переключении чатов (v0.39.1 — v0.39.2)

### ❌ MutationObserver + убранный isViewingThisChat = ложные срабатывания

**Симптом**: При переключении чатов в VK появляется ribbon-уведомление с текстом последнего сообщения из нового чата. Никто не писал.

**Причина**: В v0.39.1 убрали `isViewingThisChat` из `handleNewMessage` чтобы ribbon показывался всегда. Но MutationObserver (Path 2 в monitor.preload.js) при ЛЮБОМ изменении DOM (смена чата, прокрутка) вызывает `getLastMessageText()`. Если текст отличается от предыдущего → `new-message` IPC → `handleNewMessage` без подавления → ложное уведомление.

**Решение (v0.39.3 → v0.41.0 → v0.41.1)**: Двойная защита:

**1. App.jsx (renderer)**: Подавлять ВСЕ уведомления когда пользователь смотрит на эту вкладку:
```js
const isViewingThisTab = !document.hidden && activeIdRef.current === messengerId
if (isViewingThisTab) return
```

**2. main.js (backup path)**: Backup path работает ТОЛЬКО при свёрнутом/скрытом окне:
```js
if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized() && mainWindow.isVisible()) return
```

**Почему v0.41.0 не помог**: Исправление в App.jsx подавляло `handleNewMessage`, но тот же `console-message` event ловил **backup path в main.js** напрямую → вызывал `showCustomNotification` минуя `handleNewMessage`. Два listener на один event!

**Ключевой урок**: `console-message` от WebView обрабатывается в ДВУХ местах (renderer + main process). Подавление в одном месте бесполезно если другое место дублирует. Backup path должен работать ТОЛЬКО когда renderer не может обработать (окно свёрнуто/скрыто).

---

## 🔴 Browser API для видимости окна НЕНАДЁЖНЫ в Electron (v0.41.2 → v0.42.0)

### ❌ document.hasFocus() и document.hidden оба ненадёжны

**Симптом**: Ribbon-уведомление появляется при ЧТЕНИИ старых сообщений в Telegram/MAX — пользователь смотрит на мессенджер, но ribbon не подавляется.

**Причина**: Оба browser API ненадёжны в Electron с `<webview>`:
- `document.hasFocus()` → `false` когда фокус внутри WebView (отдельный browsing context)
- `document.hidden` → может быть ненадёжен с `backgroundThrottling: false`

**v0.41.2**: Заменили `!document.hidden` на `hasFocus()` → ложные ribbon при фокусе в webview.
**v0.41.3**: Вернули `!document.hidden` → всё ещё проблемы с Telegram.

**Решение (v0.42.0)**: IPC window-state из main process:
```js
// main.js — BrowserWindow events → IPC
mainWindow.on('focus', () => webContents.send('window-state', { focused: true }))
mainWindow.on('blur', () => webContents.send('window-state', { focused: false }))
// + minimize, restore, show

// App.jsx — ref для хранения состояния
const windowFocusedRef = useRef(true)
useEffect(() => window.api.on('window-state', (s) => { windowFocusedRef.current = s.focused }), [])

// Проверка видимости
const isViewingThisTab = windowFocusedRef.current && activeIdRef.current === messengerId
```

**Ключевой урок**: В Electron НИКОГДА не полагайся на browser API (document.hidden, hasFocus) для определения видимости окна. Используй IPC из main process — BrowserWindow events (focus/blur/minimize/restore) 100% надёжны.

---

## 🔴 Timestamp-only body в Notification API (v0.41.2)

### ❌ MAX шлёт Notification с body = "12:40" (только время)

**Симптом**: Пустое ribbon-уведомление с текстом "12:40" вместо текста сообщения.

**Причина**: MAX при открытии чата / получении уведомления может вызвать `new Notification("", { body: "12:40" })` — body содержит только timestamp. Наши фильтры (`if (!text) return`) пропускают это, т.к. "12:40" непустая строка.

**Решение**: Фильтровать timestamp-only body:
```js
if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanBody)) return null
```

Добавлено в: `showCustomNotification` (main.js) и `__CC_NOTIF__` handler (App.jsx).

**Ключевой урок**: Мессенджеры могут передавать в Notification.body нетекстовые данные: timestamps, пустые строки, zero-width символы. Фильтр body должен проверять не только непустоту, но и осмысленность содержимого.

---

## 🔴 Дублирование ribbon: Notification + ServiceWorker + backup path (v0.43.0 → v0.43.1)

### ❌ 4 ribbon-уведомления на 1 сообщение в Telegram

**Симптом**: Одно сообщение "Хорошо" создаёт 4 ribbon-уведомления. Первые 2 с именем отправителя, нижние 2 без имени и с body "Хорошо15:5715:57".

**Причина**: Telegram вызывает ОБА:
1. `new Notification(title, opts)` — перехватывается нашим override
2. `ServiceWorkerRegistration.showNotification(title, opts)` — тоже перехватывается

Каждый генерирует `__CC_NOTIF__` → 2 уведомления из renderer (App.jsx). Если окно не в фокусе, backup path в main.js тоже обрабатывает эти же 2 `console-message` → ещё 2 ribbon. Итого 4.

ServiceWorker Notification body отличается от обычного — содержит приклеенный timestamp ("Хорошо15:5715:57"), из-за чего дедупликация по `body.slice(0,60)` НЕ срабатывала.

**Решение (v0.43.1)**:
1. **Дедупликация в renderer** (App.jsx): `notifDedupRef` — Map с ключом `messengerId:normalizedBody`, окно 5 сек. Нормализация: убрать все timestamps из body перед сравнением.
2. **Нормализация body в main.js**: Деduп-ключ строится из нормализованного body (без timestamps).
3. **Очистка trailing timestamps**: `showCustomNotification` убирает trailing timestamps из body перед отображением ("Хорошо15:5715:57" → "Хорошо").

```js
// Нормализация для дедуп-ключа:
const normalizedText = text.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').trim()
// Очистка trailing timestamps для отображения:
cleanBody = cleanBody.replace(/(\d{1,2}:\d{2}(:\d{2})?)+\s*$/g, '').trim()
```

**Ключевой урок**: Мессенджеры могут вызывать `Notification` И `ServiceWorker.showNotification` для одного сообщения. ServiceWorker body может отличаться (приклеенные timestamps). Дедупликация ОБЯЗАТЕЛЬНА в обоих path (renderer + main), с нормализацией body (убрать timestamps, zero-width chars) перед построением ключа.

---

## 🔴 Backup path + findMessengerByUrl при 2+ аккаунтах одного мессенджера (v0.44.0 → v0.44.1)

### ❌ Backup path создаёт ribbon для НЕПРАВИЛЬНОГО аккаунта

**Симптом**: При свёрнутом окне — 2 ribbon на 1 сообщение. Первый на правильный Telegram, второй — на другой аккаунт.

**Причина**: `findMessengerByUrl(contents.getURL())` ищет **первый** мессенджер с совпадающим hostname. При 2+ Telegram — ВСЕГДА вернёт первый!

**Решение (v0.44.1)**: Backup path отключён когда renderer жив (`webContents` не destroyed). `backgroundThrottling: false` = renderer работает ВСЕГДА:
```js
if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) return
```

**Ключевой урок**: `findMessengerByUrl` ненадёжен при нескольких аккаунтах одного мессенджера. Renderer определяет messengerId правильно через closure. При `backgroundThrottling: false` backup path избыточен.

---

## 🔴 WebView не загружается при `display: none` и `visibility: hidden` (v0.44.1 → v0.45.0)

### ❌ Мессенджеры не загружаются до перехода на вкладку

**Симптом**: При запуске приложения WebView не загружают страницы. Пользователь должен кликнуть на каждую вкладку чтобы мессенджер начал работать.

**Причина 1 (v0.44.1)**: Неактивные вкладки скрывались через `display: none`:
```jsx
style={{ display: activeId === m.id ? 'block' : 'none' }}
```
В Electron `<webview>` с `display: none` **не начинает загрузку**.

**Причина 2 (v0.44.2)**: `visibility: hidden` тоже может блокировать загрузку webview в Electron — это НЕ гарантированный fix.

**Решение (v0.45.0)**: Все webview остаются `visibility: visible` (по умолчанию), стакаются через `zIndex`. Активный сверху, неактивные перекрыты + `pointer-events: none`:
```jsx
style={{
  zIndex: activeId === m.id ? 2 : 0,
  pointerEvents: activeId === m.id ? 'auto' : 'none',
}}
```
Все webview рендерятся и загружаются с первой секунды. Неактивные просто перекрыты активным.

**Ключевой урок**: В Electron `<webview>` — НЕ используй `display: none` или `visibility: hidden`. Для переключения вкладок: все webview visible + `absolute inset-0` + `zIndex` для активного. `pointer-events: none` для неактивных чтобы клики не проходили.

---

## 🔴 Дёргание первого ribbon-уведомления — двойной setBounds (v0.45.0 → v0.45.1)

### ❌ Первое ribbon дёргается, последующие — нет

**Симптом**: При первом ribbon-уведомлении окно "подпрыгивает" / дёргается при появлении. Второе и далее — плавно.

**Причина**: Двойной `setBounds` за ~16ms:
1. `repositionNotifWin()` в `showCustomNotification()` — вычисляет высоту по формуле (76px * count + gap + padding) → `setBounds` + `showInactive`
2. `notif:resize` из HTML (через `requestAnimationFrame`) — вычисляет высоту по `offsetHeight` → `setBounds`

Два `setBounds` с потенциально разной высотой за 16ms = видимый дёрг на Windows.

Для второго уведомления окно уже видимо, setBounds менее заметен.

**Решение (v0.45.1)**:
1. Убрали `repositionNotifWin()` из `showCustomNotification()` и из IPC handlers
2. Единственный источник позиционирования — `notif:resize` от HTML
3. Кэш bounds: не вызывать setBounds если координаты и высота не изменились
4. Двойной rAF в `reportHeight()` для стабильного layout

**Ключевой урок**: Для прозрачных popup-окон на Windows — ОДИН источник setBounds. Не дублировать позиционирование из main-процесса и из HTML renderer. HTML знает свою высоту точнее (offsetHeight vs расчёт по формуле).

---

## 🟡 Кнопки действий ribbon только для длинных сообщений (v0.44.0 → v0.45.2)

### ❌ Пользователь не видит кнопки "Перейти к чату" / "Прочитано" на коротких сообщениях

**Симптом**: На ribbon с текстом "Чыпр" (4 символа) — видна только маленькая галочка ✓ в углу. Нет кнопок действий, нет подсказки "ещё...".

**Причина**: Кнопки действий (action-row) были в CSS `.notif-item.expanded .action-row { display: flex }`. Expand-клик работал ТОЛЬКО при `hasFullBody` (текст >100 символов). Для коротких → обычный клик → переход к чату → dismiss.

**Решение (v0.45.2)**: Клик на ЛЮБОЕ уведомление раскрывает кнопки действий. Подсказка "▼ действия" для коротких, "▼ ещё..." для длинных.

**Ключевой урок**: UI-элементы управления (кнопки действий) должны быть доступны ВСЕГДА, не зависеть от длины контента. Условие `hasFullBody` влияет только на текст expand, НЕ на доступность кнопок.

---

## 🟡 Hover-tooltip ломает layout таблицы (v0.52.2 → v0.52.3)

### ❌ position:absolute на hover сдвигает ширину столбцов таблицы

**Симптом**: При наведении на ячейку таблицы (лог уведомлений) ширина столбцов "прыгает" — соседние колонки сжимаются/расширяются.

**Причина**: CSS `.cc-notif-cell:hover { position: absolute }` выдёргивает элемент из потока документа → `<td>` теряет контент → ширина столбца схлопывается. Без `table-layout: fixed` браузер пересчитывает ширину по контенту.

**Решение (v0.52.3)**:
1. `table-layout: fixed` + `<colgroup>` с фиксированными ширинами столбцов — ширина не зависит от контента.
2. `::after` pseudo-element с `content: attr(data-full)` вместо изменения самого элемента. Оригинальный `<div>` с `truncate` остаётся в потоке, `::after` показывается поверх как отдельный слой.
3. Селектор `[data-full]:not([data-full=""])` — не показывать пустой тултип.

**Ключевой урок**: CSS `::after` с `content: attr(data-full)` обрезается `overflow: hidden` на `<td>`. Решение: JS-тултип с `position: fixed` через React state (`onMouseEnter`/`onMouseLeave` → `setCellTooltip`). `position: fixed` не зависит от overflow родителей.

---

## 🟡 Парсинг Telegram Notification.tag — формат peer (v0.53.0)

### ❌ tag.replace(/[^0-9-]/g, '') неправильно парсит "peer5_1234567890"

**Симптом**: Клик на ribbon-уведомление от Telegram не находит чат по peerId — навигация fallback на имя.

**Причина**: Telegram Web K использует Notification.tag в формате `peer5_1234567890` (type_id). Regex `tag.replace(/[^0-9-]/g, '')` удалял ВСЕ нецифровые символы → `51234567890` → неправильный peerId. Подчёркивание `_` тоже удалялось, но нужно сначала убрать префикс `peer5_`.

**Решение (v0.53.0)**: `tag.replace(/^peer\\d+_/, '').replace(/[^0-9-]/g, '')` — сначала убрать `peerN_`, потом оставить только цифры.

**Ключевой урок**: Notification.tag формат зависит от мессенджера. Telegram: `peer{type}_{id}`. Парсить надо с учётом формата, не слепым regex.

---

## 🟡 Виртуальный скроллинг Telegram Web K ломает DOM-поиск чата (v0.53.1)

### ❌ querySelectorAll('.chatlist-chat .peer-title') не находит чат если он не в viewport

**Симптом**: Клик "Перейти к чату" на ribbon → вкладка переключается, но чат НЕ открывается. `buildChatNavigateScript` возвращает `{ok:false, method:'notFound'}`.

**Причина**: Telegram Web K использует **виртуальный скроллинг** для списка чатов. В DOM рендерятся только ~20-30 видимых чатов. Если нужный чат прокручен — его `.peer-title` элемента НЕТ в DOM.

**Решение (v0.53.1)**:
1. Основной метод: `[data-peer-id]` selector по chatTag (peerId) — если элемент в DOM.
2. Формат peerId: user=ID, chat=-ID, channel=-100ID (парсинг peer type из tag).
3. Case-insensitive match: `toLowerCase()` сравнение.
4. Partial/contains match: `indexOf` для длинных имён.
5. Retry с проверкой `activeIdRef.current` — не трогать фоновый WebView.

**Ключевой урок**: SPA-мессенджеры используют виртуальный скроллинг. `querySelectorAll` находит только ВИДИМЫЕ элементы. Для навигации к невидимому чату нужен альтернативный метод через peer ID формат.

---
---

## 🔴 MAX title-fallback: битый regex внутри injected WebView script (2026-06-19)

### Симптом
В логах появилось:

```text
[2026-06-19 14:55:55] [ERROR] Error occurred in handler for 'GUEST_VIEW_MANAGER_CALL': Error: Script failed to execute
[Макс] debug: wv-runtime: Uncaught SyntaxError: Invalid regular expression
[Макс] MAX title-fallback error: Error invoking remote method 'GUEST_VIEW_MANAGER_CALL'
```

Уведомления MAX могли пищать или ждать fallback, но fallback не мог достать текст, отправителя и аватарку из DOM, потому что injected script падал ещё на этапе компиляции внутри WebView.

### Что нашли
Источник ошибки — `buildMaxTitleFallbackScript()` в `src/utils/maxTitleFallback.js`. Функция возвращает JS-код строкой для `webview.executeJavaScript()`. Внутри такой template string нельзя писать regex с одинарными backslash так же, как в обычном JS-коде.

Проблемные места:

```js
/st\.max\.ru\/emojis/i
/[:：]\s*$/
/^[1-9]\d{0,3}$/
```

В исходном файле regex выглядел корректно, но при сборке строки backslash частично терялся. В WebView уходила уже другая строка, где `/` внутри regex мог стать реальным разделителем regex. Итог — `Invalid regular expression` и падение `executeJavaScript`.

### Почему lint/build не поймали
`eslint` и `electron-vite build` проверяют исходный файл проекта. Они не компилируют строку, которую мы генерируем и отправляем в MAX WebView через `executeJavaScript`. Поэтому исходный модуль был валиден, а runtime-строка внутри WebView — нет.

### Решение
1. В `src/utils/maxTitleFallback.js` double-escaped regex внутри template string:
   - `st.max.ru/emojis` теперь уходит в WebView как валидный `/st\.max\.ru\/emojis/i`.
   - `\s` и `\d` теперь сохраняются в runtime-скрипте как regex whitespace/digit, а не ломаются при сборке строки.
2. В `src/__tests__/maxTitleFallback.test.cjs` добавлен тест `script: generated WebView script compiles`.
3. Тест делает `new Function(buildMaxTitleFallbackScript())` и ловит именно тот тип ошибки, который был в логе: синтаксически битый generated script. Дополнительно проверяется, что runtime-строка сохраняет regex escapes `\\s`, `\\d` и `\\/`, а не только компилируется.

### Как проверяли
- `node src\__tests__\maxTitleFallback.test.cjs` — 8/8 passed.
- Отдельная runtime-проверка: `new Function(buildMaxTitleFallbackScript())` — compiled.
- `npm.cmd run lint` — passed.
- `npm.cmd run build` — passed.

### Ожидаемое поведение после фикса
При росте unread/title в MAX, если обычный `__CC_NOTIF__/__CC_MSG__` не пришёл, title-fallback больше не падает на `GUEST_VIEW_MANAGER_CALL`. Он снова может прочитать DOM списка чатов, собрать текст, отправителя, chatTag и аватарку, затем передать это в обычный путь `handleNewMessage()`.

### Важный урок
Любой код, который возвращается строкой для `executeJavaScript`, надо тестировать как уже сгенерированную строку. Обычный build/lint недостаточен: template string может испортить regex и escape-последовательности только на runtime-этапе.

---

## 🔴 MAX: аватарки, повторные уведомления и неверная группировка ribbon (2026-06-22)

### Кто нашёл
Проблему нашёл пользователь во время ручной проверки MAX:
- часть уведомлений приходила без аватарки;
- второе уведомление от того же или другого клиента могло не выглядеть как отдельное уведомление;
- одинаковый текст от разных людей мог попадать под общий dedup;
- после прежних попыток исправления стало ясно, что нельзя решать это блокировкой слов вроде даты/времени: клиент реально может написать такой текст.

### Что было видно по фактам
1. В диагностике были случаи, где MAX отдавал `avatar=https://i.oneme.ru/...`, и тогда в pipeline было `icon=true`.
2. Были другие случаи, где для той же зоны MAX приходило `avatar=""`, `imgs=0`, `chosenAvatar=false`, и ribbon показывался без аватарки.
3. Значит аватарка не терялась в `notification.js`; иногда MAX просто не отдавал картинку в текущем DOM-срезе.
4. MAX использует виртуализированные/динамические строки: видимая строка списка чатов может быть перерисована, а картинка в момент чтения может отсутствовать.
5. Старый sender cache был слишком широким: фактически мог хранить данные на уровне `messengerId`, то есть "на весь MAX".
6. Старый dedup частично строился как `messengerId + text`, поэтому одинаковое сообщение от двух разных клиентов могло считаться дублем.
7. Renderer ribbon группировал карточки только по `messengerId`; для MAX это означает "все уведомления MAX в одну стопку", даже если отправители разные.
8. Из-за группировки второе уведомление могло не появиться как отдельная карточка, а добавиться строкой внутрь уже открытого ribbon.
9. IPC fallback проверял старый ключ dedup и мог не понимать новые sender-aware ключи.
10. Проблема не в словах сообщения, а в identity события: нужно правильно понимать "кто написал", "в каком чате" и "это то же событие или другое".

### Корень проблемы
У уведомления было недостаточно точное имя события.

Раньше часть логики считала, что `messengerId=max` почти достаточно для кеша, dedup и группировки. Для MAX это неверно: внутри одного `messengerId` одновременно живут разные клиенты, разные чаты и одинаковые тексты. Поэтому общий ключ уровня MAX мог:
- подставить не ту аватарку;
- скрыть реальное второе сообщение как дубль;
- сложить разные уведомления в одну карточку;
- создать ощущение, что "пик был, а уведомления нет".

### Что сделано
1. В `src/utils/maxTitleFallback.js` добавлены sender-aware helpers:
   - `buildSenderCacheKey()`;
   - `rememberSenderAvatar()`;
   - `getSenderCacheEntry()`;
   - `applySenderAvatarFallback()`.
2. Кеш аватарки теперь строится по ключу:
   `messengerId + chatTag/senderName + senderName`.
3. Если MAX отдаёт свежую аватарку, она обновляет кеш.
4. Если MAX отдаёт пустую аватарку, старая не стирается.
5. Если новое событие пришло без аватарки, но sender/chat совпали с кешем, берётся последняя известная аватарка этого же отправителя/чата.
6. В `src/utils/consoleMessageHandler.js` старый общий кеш по `messengerId` оставлен только для legacy-сценария, когда нет `senderName`; для событий с отправителем используется новый точный кеш.
7. В `src/utils/messageProcessing.js` добавлен `buildMessageDedupScope()`.
8. `isDuplicateExact()` и `isDuplicateSubstring()` теперь могут принимать scope отправителя/чата.
9. В `src/utils/webviewHandleNewMessage.js` dedup перенесён после очистки имени отправителя, чтобы ключ строился уже по нормальному sender.
10. В `src/utils/webviewSetup.js` IPC fallback теперь проверяет recent-notifs с учётом scoped ключей.
11. В `main/handlers/notificationManager.js` добавлен `buildNotificationScope()` для main-process dedup.
12. В payload ribbon добавлен `stackKey`.
13. В `main/notification.js` renderer группирует карточки по `stackKey || messengerId`, а не только по `messengerId`.

### Как должно работать после переделки
1. Если клиент MAX прислал сообщение и MAX отдал аватарку, ribbon показывает эту аватарку.
2. Если тот же клиент позже прислал сообщение, но MAX временно не отдал картинку, ribbon берёт последнюю известную аватарку этого же клиента/чата.
3. Если клиент поменял аватарку, новая картинка сразу перезаписывает старую в кеше.
4. Пустой avatar не затирает рабочую аватарку.
5. Одинаковый текст от разных клиентов не должен блокироваться dedup.
6. Повтор того же сообщения от того же клиента в коротком интервале всё ещё блокируется как дубль.
7. Два разных клиента MAX не должны попадать в одну ribbon-карточку только потому, что оба из MAX.
8. Второе сообщение от того же клиента может группироваться с первым, если это тот же sender/chat и включена группировка.
9. Звук и ribbon должны идти через обычный pipeline; fix не добавляет отдельный новый источник сообщений.
10. Слова вроде `18 июн.`, `Спасибо`, `Наличка`, `09:27` не блокируются сами по себе. Решение не фильтрует контент, а уточняет источник и identity.

### Почему выбрано именно это решение
Это минимальное исправление корня, а не маскировка симптомов.

Нельзя блокировать даты/время/короткие слова, потому что клиент действительно может написать `18 июн.`, `09:27`, `Спасибо`, `Ок`, `1`, `+`. Такой фильтр сломает реальные сообщения. Правильнее не гадать по тексту, а строить ключ события по отправителю/чату и использовать аватарку только от того же отправителя/чата.

### Риски после ремонта
1. Если MAX вообще не отдавал аватарку этого sender/chat ни разу, показывать будет нечего — это нормальный fallback, не ошибка кеша.
2. Если MAX изменит DOM и перестанет отдавать senderName/chatTag, точность снова упадёт до legacy-уровня; тогда нужны новые логи DOM.
3. Если два разных клиента имеют одинаковое имя и нет chatTag, они могут попасть в один sender scope. Поэтому chatTag используется первым, когда он есть.
4. Если MAX отдаст старую картинку из своего кеша, приложение честно сохранит то, что пришло от MAX.
5. Если группировка ribbon выключена настройками, `stackKey` не будет визуально складывать карточки, но dedup всё равно останется sender-aware.

### Что проверено тестами
- `src/__tests__/maxTitleFallback.test.cjs`:
  - кеш аватарки разделён по messenger/chat/sender;
  - новая аватарка заменяет старую;
  - пустая аватарка не стирает старую;
  - fallback подставляет аватарку только тому же sender/chat.
- `src/__tests__/messageProcessing.test.cjs`:
  - одинаковый текст от разных sender не считается дублем;
  - substring-dedup тоже учитывает sender/chat scope;
  - `buildMessageDedupScope` экспортируется и доступен в рабочем коде.
- `src/__tests__/notificationIdentity.test.cjs`:
  - main dedup использует sender/chat scope;
  - main payload передаёт `stackKey`;
  - renderer группирует по `stackKey`;
  - webview dedup использует `buildMessageDedupScope`;
  - console enrichment использует sender-aware avatar cache.

### Команды проверки 2026-06-22
```text
node src/__tests__/maxTitleFallback.test.cjs       -> 12/12 passed
node src/__tests__/messageProcessing.test.cjs      -> 48/48 passed
node src/__tests__/notificationIdentity.test.cjs   -> 5/5 passed
node src/__tests__/mainProcess.test.cjs            -> 38/38 passed
npm run lint                                      -> passed
npm run build                                     -> passed
npm test                                          -> passed
Vitest inside npm test                            -> 131 files, 1874 tests passed
Electron E2E inside npm test                      -> 17/17 + UI 9/9 passed
```

### Важный урок для следующего ИИ
Для MAX нельзя считать `messengerId` достаточной идентичностью уведомления. Любой кеш, dedup или grouping должен по возможности учитывать sender/chat/messageId. Контент сообщения нельзя использовать как главный фильтр фантомов: короткие слова, даты и время могут быть реальными сообщениями клиента.

### Дополнение 22 июня 2026 — усилена диагностика MAX fallback
После ручной проверки стало ясно, что старый экран диагностики показывал `dedup/block`, но не выводил сразу корень: при `title +2` MAX fallback выбирал один sidebar-кандидат, а второй реальный текст оставался только внутри длинного `topRows`.

Что добавлено:
- `src/utils/systemDiagnostics.js` строит `maxFallbackEvents` из `pipelineTrace`;
- отчёт теперь видит `title +N`, `source`, выбранный текст, sender, количество кандидатов, `dedupBlocked`, `ribbonOk`, `soundOk`;
- если `title +N > 1`, выбранный текст ушёл в dedup, а в `topRows` есть другие body — диагностика пишет проблему `MAX fallback потерял кандидатов`;
- если `max-title-active` отдаёт `text="Сообщение"` или sender с дублем/статусом `В сети`, диагностика пишет `MAX active fallback подозрителен`;
- `SystemDiagnosticsModal` получил отдельную секцию `MAX fallback анализ`;
- в отчёт сохраняется последние 300 trace-событий вместо 120, чтобы важная цепочка не вылетала из JSON слишком быстро.

Назначение: перед ремонтом логики уведомлений видеть не только итоговый блок (`dedup`), но и весь выбор fallback-кандидатов. Это должно предотвращать ошибочные выводы вроде "клиент прислал одинаковый текст", когда фактически extractor выбрал один дубль и не дошёл до другого нового сообщения.

### Дополнение 23 июня 2026 — проверка живого MAX-сообщения
При проверке пользователь отправил сообщения в MAX. Лог показал, что `Дугин Алексей Сергеевич` с текстами `Яыы` и `Сспн` прошёл полный pipeline: `MAX title-fallback`, `icon=true`, `NotifManager show`, `notif-renderer addNotification`, `ribbon ok`, `sound ok`.

Дополнительно найден дефект самой диагностики: сообщение `Антон Х : Спасибо за отзыв.` после этапа `sender-strip` в pipeline стало текстом `: Спасибо за отзыв.`, поэтому `maxFallbackEvents` раньше ошибочно показывал `ribbonOk=false` и `soundOk=false`, хотя реальный лог имел `NotifManager show id=15`, `Ribbon main-result ok=true` и звук.

Что исправлено:
- `src/utils/systemDiagnostics.js` теперь сопоставляет MAX fallback-событие не только с исходным текстом, но и с вариантом после удаления имени отправителя в начале;
- это не меняет доставку уведомлений, dedup, звук или WebView, а только делает диагностический отчёт честнее;
- добавлен тест в `src/__tests__/systemDiagnostics.test.cjs` на сценарий `Антон Х : Спасибо...` -> `: Спасибо...`.

Проверки:
```text
node src/__tests__/systemDiagnostics.test.cjs -> passed
node src/__tests__/fileSizeLimits.test.cjs    -> 475/475 passed
npm run lint                                  -> passed
```

### Дополнение 23 июня 2026 — пачка сообщений в открытом MAX-чате
Пользователь отправил несколько сообщений подряд в открытый MAX-чат: `Сспн`, затем `Аква`, `Роога`, `Аввпнр`. В UI MAX они были видны, но `chatcenter.log` показал pipeline только для `Сспн`: `title +1`, `MAX title-fallback`, `NotifManager show`, `ribbon ok`, `sound ok`. Для `Аква`, `Роога`, `Аввпнр` не было ни `title +1`, ни `__CC_MSG__`, ни `IPC new-message`, ни `NotifManager`.

Корень: для открытого MAX-чата нельзя полагаться только на `title/unread`. MAX увеличил unread/title один раз на первое непрочитанное, а следующие bubble в уже открытом чате не дали новых title-событий. При этом активный `Path 2` для MAX был отключён из-за прошлых фантомов, а `quickNewMsgCheck` имел общий ранний cooldown 3000 мс и режим "одно сообщение за callback". Для пачки сообщений это означает: одно событие могло пройти, остальные разные тексты в той же короткой пачке терялись.

Что исправлено:
- `main/preloads/monitor.preload.cjs`: ранний `COOLDOWN_MSG` больше не глушит MAX до разбора текста;
- для MAX `quickNewMsgCheck` собирает несколько разных текстов из одного callback, а не возвращается после первого;
- для MAX `chatObserver` слушает `characterData`, потому что Svelte может сначала добавить bubble, а текст проставить после;
- MAX observer передаёт `senderName` и avatar во втором аргументе `new-message`, чтобы активная вкладка не блокировала событие как "нет extra";
- для MAX IPC отключён старый `mid-dedup` после `__CC_NOTIF__`, а `__CC_MSG__` не блокируется по одному sender в течение 3 секунд, потому что разные быстрые сообщения одного клиента должны проходить;
- body-fallback для MAX остался отключённым, чтобы не вернуть старые фантомы из sidebar/страницы;
- `Path 2` для MAX остался отключённым, чтобы не возвращать старый ненадёжный last-message polling.

Ожидаемое поведение: если в открытый MAX-чат подряд пришли `Аква`, `Роога`, `Аввпнр`, каждая новая bubble должна попасть в `new-message`/`__CC_MSG__`, пройти DOM enrichment, получить sender/avatar активного чата и вызвать обычный `NotifManager` + звук. Это не фильтрует слова и не блокирует реальные короткие сообщения.

Проверки:
```text
node src/__tests__/monitorPreload.test.cjs -> 89/89 passed
node src/__tests__/fileSizeLimits.test.cjs -> 475/475 passed
npm run lint                               -> passed
npm test                                   -> passed
```

### Дополнение 23 июня 2026 — полная диагностика MAX перед новым ремонтом
После повторной проверки пачки сообщений в MAX пользователь показал кейс: в sidebar у чата `Дугин Алексей Сергеевич` был badge `5`, в открытом чате были видны несколько сообщений (`Ццыв`, `Ыьв`, `Ыь`, `Вчву`), но в `chatcenter.log` прошёл только один pipeline для `Рошшыцв`.

Фактический вывод: это не была поломка ribbon/звука. Для пропавших текстов не было `IPC new-message`, `__CC_MSG__`, `__CC_NOTIF__`, `NotifManager show`. Значит, приложение не видело эти сообщения как новые события. До правки логов нельзя было доказать, где именно они теряются: в MAX ServiceWorker/Notification hook, в title/sidebar fallback, в active chat MutationObserver, в snapshot-фильтре или в renderer IPC.

Что добавлено только для диагностики:
- `main/preloads/monitor.preload.cjs`:
  - `sendMonitorDiag()` — единый канал в `ipcRenderer.sendToHost('monitor-diag')`, потому что `console.log` из isolated preload в Electron 41 может не попадать в `chatcenter.log`;
  - `[MAX-COUNT]` — каждое изменение unread/count: старое число, новое число, personal/channels, increased, ready, hidden, title;
  - `[MAX-OBSERVER]` — привязка chatObserver, retry, отсутствие контейнера, отключение body fallback, mutation count, snapshot-skip;
  - `[MAX-QUICK]` — разбор каждой MAX-мутации: target, raw text, причина пропуска (`sidebar`, `outside cached container`, `no text`, local dedup) или успешная отправка `new-message` с sender/avatar;
  - `[MAX-NAV]` — SPA-навигация, сбросы dedup и состояние после grace-end;
  - `[MAX-RUN-DIAG]` — ручной запуск диагностики.
- `main/preloads/utils/maxDiagnostics.js`:
  - новый модуль для `[MAX-SNAPSHOT]`: URL, title, `document.hidden`, readiness, observer target, cached chat container, `countUnread('max')`, header, header media, top sidebar rows с badge/avatar/text/media, последние видимые active messages;
  - вынесен отдельно, чтобы `monitor.preload.cjs` остался ниже лимита 600 строк.
- `src/utils/webviewSetup.js`:
  - `[IPC-MAX]` — лог всех IPC-каналов от MAX с `activeId`, `focused`, args;
  - `MAX page-title-updated` — raw title, prevUnread, delta, notifRef, activeId, focused, URL;
  - увеличен detailLimit trace для MAX-диагностики до 3500 символов.
- `src/utils/maxTitleFallback.js`:
  - raw результат `MAX title-fallback` теперь пишется до 3500 символов, чтобы не терять хвост `topRows`.
- `src/utils/systemDiagnostics.js`:
  - `[MAX-*]`, `[IPC-MAX]`, `[MONITOR]` классифицируются как `webview`, чтобы попадать в цепочки диагностики.

Важно: это не меняет бизнес-логику уведомлений и не должно само чинить или ломать доставку. Цель — следующий прогон должен показать точное место потери: MAX не отдаёт отдельные события, sidebar содержит только один preview, observer не привязан, snapshot принял новые bubble за старые, или renderer заблокировал событие.

Как проверять следующий кейс:
1. Перезапустить приложение, чтобы новый `monitor.preload.cjs` загрузился в WebView.
2. Открыть MAX и включить/обновить диагностику системы.
3. Отправить пачку сообщений подряд.
4. Сразу собрать `chatcenter.log` / `system-diagnostics-report.json`.
5. Искать строки `[MAX-COUNT]`, `[MAX-SNAPSHOT]`, `[MAX-OBSERVER]`, `[MAX-QUICK]`, `[IPC-MAX]`, `MAX page-title-updated`.

Ожидаемые факты для анализа:
- если есть `[MAX-COUNT] ... -> 5`, но в `[MAX-SNAPSHOT] rows=` только один preview — MAX sidebar не раскрывает тексты всех сообщений;
- если `[MAX-OBSERVER] bound` есть, но нет `[MAX-OBSERVER] mutation` — активный чат не обновлял DOM в момент прихода;
- если mutation есть, но `[MAX-QUICK] no text` или `snapshot-skip` — проблема в extraction/snapshot;
- если `[MAX-QUICK] send new-message` есть, но нет `NotifManager show` — проблема уже в renderer/dedup/handleNewMessage;
- если `[IPC-MAX] channel=new-message` есть, но потом `dedup/spam/block` — точная причина будет в pipeline trace.

Проверки, добавленные под диагностику:
```text
src/__tests__/monitorPreload.test.cjs:
- MAX diagnostics sends full DOM snapshots through monitor-diag
- MAX quick observer logs found/skipped/sent decisions
- MAX observer logs binding, mutations, snapshot skips, and disabled fallback
- MAX count/navigation/manual diagnostics are visible

src/__tests__/notificationIdentity.test.cjs:
- MAX renderer diagnostics log IPC and title deltas

src/__tests__/systemDiagnostics.test.cjs:
- [MAX-SNAPSHOT] и [IPC-MAX] классифицируются как webview
```
## 2026-06-29 — контроль после v1.2.27: title-фантомы MAX стали тише; отдельно всплыл старый баг исходящих через `__CC_NOTIF__`

**Кто нашел:** Codex по свежему `chatcenter.log` пользователя от 29 июня 2026.

**Что, похоже, помогло:** правка v1.2.27, где `page-title-updated` для MAX больше не создает ribbon/fallback. В логе после правки при переходах по MAX-чатам видны строки:

- `MAX title reset skipped | title="" ... kept=true`
- `MAX title reset skipped | title="MAX" ... kept=true`
- `MAX title-only no-ribbon | reason=not-increased ... raw="1 непрочитанный чат"`

Ключевой факт: рядом с этими переходами не видно старого проблемного `MAX title-fallback scheduled`. Значит прежний источник фантомов от `title/unread` действительно перестал создавать карточки уведомлений.

**Важно: это НЕ новая проблема и НЕ следствие v1.2.27.** Это старый известный класс бага MAX, уже описанный в `.memory-bank/mistakes/webview-stack-grouping.md` как **Ловушка 49 (v0.81.7 -> v0.83.1): MAX показывает ribbon для СВОИХ исходящих сообщений**. Пользователь раньше просто не поднимал этот кейс в текущем разборе. Правка v1.2.27 была про другой источник: `page-title-updated`/`title-count`/`max-title-sidebar`.

**Старая отдельная проблема, снова подтверждённая логом:** пользователь отправлял/пересылал сообщения сам, но приложение показало уведомление как входящее. В логе это пришло не через `MAX title-fallback`, а через штатный перехват уведомлений MAX:

- `Источник: +7 (904) 5421978 | __CC_NOTIF__ | t="Дугин Алексей Сергее" icon=true`
- `Видимость: +7 (904) 5421978 | focused=true НО fromNotifAPI=true -> мессенджер считает чат не открыт`
- `Звук: +7 (904) 5421978 | звук воспроизведён`
- `NotifManager show ... sender=Дугин Алексей Сергеевич body=+7 (904) 5421978 icon=true`

Позже похожий кейс был с пересланными PDF:

- `Источник: Переслано: Елена Румянцева PDF ... | __CC_NOTIF__ | t="Елена Румянцева" icon=false`
- `NotifManager show ... sender=Елена Румянцева body=Переслано: ...`

**Почему это не тот же баг:** v1.2.27 отключил создание ribbon из `page-title-updated`, но не блокировал реальные `__CC_NOTIF__`. Это было сделано специально, потому что реальные короткие сообщения MAX приходят именно через `__CC_NOTIF__`. Поэтому текущий фантом не доказывает возврат старого title-fallback; он доказывает старую проблему: сам MAX Web может вызвать browser Notification и для события, которое пользователь воспринимает как свое исходящее/пересланное.

**Почему пока нельзя чинить грубым фильтром:** в payload `__CC_NOTIF__` сейчас нет надежного поля `outgoing=true/false`. Там есть title/body/icon/tag, но нет доказательства, что событие было отправлено текущим пользователем. Если просто блокировать текст, имя, телефон, `Переслано` или `fromNotifAPI` при focused=true, можно сломать настоящие входящие уведомления от клиента.

**Что проверять следующим ИИ перед ремонтом:**

1. Сначала искать источник: `__CC_NOTIF__`, `__CC_MSG__`, `IPC new-message`, `MAX title-only no-ribbon`, `MAX title-fallback scheduled`.
2. Если источник `MAX title-only no-ribbon` и нет `MAX title-fallback scheduled`, старая title-проблема не создала ribbon.
3. Если есть `__CC_NOTIF__` + `NotifManager show`, уведомление создано потому, что MAX сам вызвал Notification API.
4. Для исходящих/пересланных пользователем сообщений нужен не словарный фильтр, а отдельный факт направления: DOM-признак исходящей bubble, активный header/chat id, recent user-send marker или другой надежный признак.
5. До появления такого факта не считать `fromNotifAPI=true` абсолютной истиной для MAX: MAX может прислать browser notification даже в спорном сценарии.

**Текущий вывод:** v1.2.27 помогла именно против фантомов от `title/unread`. Проблема с уведомлениями на свои исходящие/пересланные сообщения — старая и отдельная. Она находится в доверии к `__CC_NOTIF__` от MAX без проверки направления сообщения. Баг-класс: "MAX Notification API может принести уведомление на свое исходящее/пересланное событие".
## 🔴 MAX: поиск номера переигрывал старый sidebar-preview как новое уведомление (v1.2.28)

Дата: 30 июня 2026.
Кто нашёл: пользователь по воспроизведению в MAX-поиске номера телефона, Codex по `chatcenter.log` и `system-diagnostics-report.json`.

**Симптом**: пользователь вводил номер телефона в поиск MAX. После перестройки списка чатов приложение показывало старое сообщение/файл (`Переслано: Елена Румянцева PDF ...`) как новое уведомление. Визуально это выглядело как реальное ribbon-уведомление со звуком, хотя клиент ничего нового не писал.

**Что показали логи**:
- событие шло не через MAX title fallback: после v1.2.27 в логе есть `MAX title-only no-ribbon` / `MAX title reset skipped`;
- фантом шёл как `__CC_NOTIF__`, затем `Звук`, `custom-notify`, `NotifManager show`;
- один и тот же старый preview повторялся через десятки секунд, а короткий `notifDedup` блокировал только повторы в пределах нескольких секунд;
- до v1.2.28 оба внутренних MAX-пути (`Notification/showNotification` и sidebar watcher) писали одинаковый `__CC_NOTIF__`, поэтому диагностика не показывала точный подпуть.

**Корень**: MAX sidebar watcher слушал весь `document.body` через `MutationObserver` и считал изменение preview в списке чатов новым сообщением. При поиске MAX перестраивает список, и старая строка может снова появиться как DOM-изменение. Это не новое сообщение, а переотрисовка старого состояния.

**Почему нельзя блокировать слова**: клиент реально может написать `Сообщение`, дату, номер, PDF или любой короткий текст. Проблема не в тексте, а в источнике и состоянии UI: `max-sidebar` во время активного поиска не доказывает новое входящее сообщение.

**Решение v1.2.28**:
- каждый MAX `__CC_NOTIF__` получил поле `src`;
- `Notification` путь помечается `max-notification-api`;
- `ServiceWorkerRegistration.showNotification` путь помечается `max-sw-showNotification`;
- sidebar watcher помечается `max-sidebar`;
- если активен поиск MAX, sidebar watcher делает baseline-скан, но не отправляет `__CC_NOTIF__`;
- в диагностике пишется `__CC_DIAG__max-sidebar: search active skip emit`.

**Как должно работать после исправления**:
1. Реальные сообщения по `max-notification-api` / `max-sw-showNotification` проходят как раньше.
2. Sidebar fallback продолжает работать вне поиска.
3. Поиск номера/текста в MAX не создаёт ribbon/звук из старых preview.
4. В логе теперь видно, какой внутренний MAX-источник сработал: `src=max-sidebar`, `src=max-notification-api`, `src=max-sw-showNotification`.
5. Если снова появится фантом, сначала смотреть `src` в строке `Источник: ... | __CC_NOTIF__`.

**Проверки**:
- `node src/__tests__/notifHooks.test.cjs`;
- `node src/__tests__/consoleMessageParser.test.cjs`;
- `npm run lint`;
- `npm run check-memory`.
