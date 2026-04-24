# Handoff: native-scroll диагностика ЦентрЧатов

Дата: 24 апреля 2026.

## 📋 Статус версий (обновлено v0.87.53)

**✅ Проверено и работает** (зафиксировано в логах/тестах):
- v0.87.41 — markRead без локального вычитания (нет прыжков 36→25→35)
- v0.87.42 — newBelow не считает prepend как новые снизу
- v0.87.43 → отменено в v0.87.47 → v0.87.51
- v0.87.44 — default atBottom=false (нет mass-read при открытии)
- v0.87.45-50 → отменено в v0.87.51 (groupedUnread удалён)
- v0.87.48 — блок авто-load-older пока initial-scroll не закончился
- v0.87.49 — диагностические логи (force-read-*, bottom-state-change, scroll-anomaly, badge-state) — используются для расследований
- v0.87.51 — threshold=0 + 300мс batch + удалён groupedUnread (прогрессия 23→20→15→...→0 по ходу скролла)
- v0.87.52 — newBelow сбрасывается при смене chatId (нет залипания стрелки 41 от предыдущего чата)
- **v0.87.53** — badge-state лог не создаёт ложного «unread=13 prev=0» при переключении (prevUnreadRef сбрасывается на смену chatId)

**⬜ Не проверено пользователем в реальном UI** (требует его подтверждения):
- Прогрессия счётчика 23→20→15→10→0 **по ходу** прокрутки (не скачком в конце)
- Альбом из N фото даёт +N к счётчику (как API Telegram, не +1)
- Бейдж в списке и на стрелке — одинаковые (оба = `chat.unreadCount`)
- После переключения чатов стрелка показывает **только** накопленные в ТЕКУЩЕМ чате новые сообщения, не остаточное от предыдущего
- markRead в реальном времени уходит на сервер при прокрутке (не раз в 1.5сек, а каждые 0.3сек)

**📊 Выводы по awk-анализу логов (v0.87.53)**:
- В одном chatId unread НЕ растёт больше чем на +1/+2 за раз (только при реальном `tg:new-message`)
- Нет случаев резкого скачка счётчика внутри чата
- Все случаи "роста" в логе оказались переключениями между чатами (лог-артефакт, починен в v0.87.53)



## Контекст

Проблема относится именно к native ЦентрЧатов (`src/native/*`), где Telegram подключен через API/GramJS и интерфейс чатов рисуется нашим кодом. Это не WebView Telegram/WhatsApp/VK/MAX.

Симптом: при открытии чата скролл иногда уходит значительно выше нужного места. Для чата без непрочитанных сообщений (`unreadCount = 0`) экран должен открываться внизу, на последних сообщениях. Для чата с непрочитанными экран должен вставать на первое непрочитанное сообщение, то есть на самое старое из непрочитанных, без ухода выше или ниже.

## Что сделано

- Добавлено диагностическое логирование с префиксом `[native-scroll]` в общий `chatcenter.log`.
- Логирование покрывает выбор активного чата, загрузку сообщений, расчет первого непрочитанного, первичный скролл, попадание к верхней границе, догрузку старых сообщений, кнопку перехода вниз/к непрочитанным и реальные пользовательские действия колесом/тачем/указателем.
- `ChatRow` вынесен из `InboxMode.jsx`, чтобы сохранить лимит 600 строк для JSX-файла.
- Добавлены unit-тесты для утилит диагностики.

## Где смотреть логи

Основной файл логов на машине пользователя:

```text
C:\Users\Директор\AppData\Roaming\ЦентрЧатов\chatcenter.log
```

Фильтр:

```powershell
Select-String -Path "$env:APPDATA\ЦентрЧатов\chatcenter.log" -Pattern "\[native-scroll\]"
```

Если нужно только последние строки:

```powershell
Get-Content "$env:APPDATA\ЦентрЧатов\chatcenter.log" -Tail 300 | Select-String "\[native-scroll\]"
```

## Как работает логирование

- `src/native/utils/scrollDiagnostics.js` форматирует события, снимает метрики скролла и рассчитывает отладочную информацию по первому непрочитанному.
- `src/native/hooks/useScrollDiagnostics.js` пишет события открытия чата, изменения состояния, пользовательского скролла, нижней позиции и попадания к верхнему порогу.
- `src/native/hooks/useInitialScroll.js` пишет этапы первичного скролла: ожидание пустого списка, планирование, запуск, выбранную цель, отсутствие цели и финальные метрики.
- `src/native/modes/InboxMode.jsx` пишет расчет `firstUnread`, срабатывание `loadOlderMessages`, применение компенсации скролла после догрузки, появление новых сообщений ниже и нажатия кнопки перехода.
- `src/native/store/nativeStore.js` пишет смену активного чата, загрузку сообщений, синхронизацию непрочитанных, отметку прочитанного и догрузку старых сообщений.

## Нормальная цепочка

Для полностью прочитанного чата:

```text
store-set-active-chat
chat-open unread=0
store-load-messages
store-tg-messages
first-unread-calc anchorId=null
initial-run firstUnread=null
initial-done bottomGap около 0
```

После этого не должно быть `load-older-trigger`, пока пользователь сам не прокрутил чат вверх.

Для чата с непрочитанными:

```text
store-set-active-chat
chat-open unread=N
store-load-messages
store-tg-messages
first-unread-calc anchorId=<id первого непрочитанного>
initial-run firstUnread=<тот же id>
initial-target mode=firstUnread
initial-done
```

Цель должна быть самым старым входящим непрочитанным сообщением, а не последним из непрочитанных.

## На что указывает подозрительная цепочка

Если сразу после `initial-done` появляются:

```text
top-threshold
load-older-trigger
load-older-apply
```

и при этом рядом нет свежего `user-scroll-intent`, значит старые сообщения догрузились не из-за действия пользователя, а из-за программного или стартового scroll-события. Это может увести чат вверх, потому что после догрузки применяется компенсация:

```js
el.scrollTop = el.scrollHeight - prevHeight;
```

Если в прочитанном чате видно `chat-open unread=0`, но потом `first-unread-calc anchorId != null` или `initial-run firstUnread != null`, значит используется устаревшая точка непрочитанного.

Если `initial-done bottomGap` нормальный, но позже без `load-older-*` визуально появляется сдвиг, вероятна поздняя смена высоты контента: медиа, картинки, превью ссылок или перерисовка блока сообщений.

## Предполагаемая причина проблемы

Главная гипотеза: `handleScroll` в `src/native/modes/InboxMode.jsx` запускает догрузку старых сообщений при `scrollTop < 100` на любое scroll-событие. Такое событие может прийти не только от пользователя, но и во время монтирования, первичного скролла, смены чата или пересчета высоты. После этого `loadOlderMessages` догружает старые сообщения, а компенсация позиции может перебить правильную стартовую позицию.

Вторичные возможные причины:

- `firstUnreadIdRef` может жить дольше, чем нужно, если состояние непрочитанных изменилось между выбором чата и отрисовкой.
- `useInitialScroll` делает первичный скролл один раз и может не компенсировать позднюю загрузку медиа/превью.
- Таймер первичного скролла может выполниться уже после быстрой смены активного чата, если не проверить актуальный `chatId`.

## Как продолжать следующему ИИ

1. Попросить пользователя запустить приложение самому и воспроизвести баг в native ЦентрЧатов.
2. После воспроизведения прочитать последние строки `chatcenter.log` с фильтром `[native-scroll]`.
3. Сравнить цепочку с разделами выше.
4. Не чинить вслепую. Сначала определить, что именно случилось: ранняя догрузка старых, устаревший `firstUnread`, поздний рост высоты контента или гонка при смене чата.
5. Если подтвердится ранняя догрузка старых сообщений, вероятный фикс: запрещать `loadOlderMessages` до завершения первичного скролла и запускать его только после реального пользовательского движения вверх.
6. Если подтвердится устаревший `firstUnread`, вероятный фикс: хранить/вычислять якорь непрочитанного как значение, зависящее от `activeChatId`, `activeUnread` и `activeMessages`, а не как долгоживущий ref без полной привязки.
7. Если подтвердится поздний рост высоты контента, вероятный фикс: для прочитанных чатов временно удерживать низ до стабилизации высоты, а для непрочитанных удерживать якорь первого непрочитанного.

## Проверки, которые уже проходили

После добавления диагностики проходили:

```powershell
npm.cmd run lint
npm.cmd run test:vitest
npm.cmd run build
```

Важно: не запускать приложение самостоятельно. По правилам проекта приложение запускает и проверяет пользователь.

---

## ПРИЧИНА НАЙДЕНА И ИСПРАВЛЕНА (v0.87.40, 23 апреля 2026)

Из реальных логов после воспроизведения бага:

```text
chat-open messages=0 unread=95
first-unread-calc messages=0 anchorId=null           [список пуст]
chat-state messages=50                                [появился КЭШ]
first-unread-calc messages=50 unread=95
                  firstId=22146 lastId=22195          [старые из кэша!]
                  anchorId=22146                      [anchor = самое старое]
initial-run firstUnread=22146                         [скролл на 22146]
initial-done top=110                                  [уехали наверх]

store-tg-messages firstId=22242 lastId=22293          [свежие пришли ПОЗЖЕ]
UNREAD SYNC сервер=47                                 [реальный unread = 47, не 95]
```

Два бага:

1. useInitialScroll срабатывал на КЭШЕ (id 22146-22195) до получения свежих данных с сервера (id 22242-22293). Скролл уходил на самое старое сообщение из кэша.

2. unread=95 был ЗАВЫШЕН (реально 47). Логика incoming.length - unread = 50 - 95 = -45 → max(0, -45) = 0 → anchorIndex=0 → самое первое сообщение = уехали максимально вверх.

Фикс:

- useInitialScroll принимает параметр loading, не срабатывает пока loading=true.
- firstUnreadIdRef пересчитывается при смене firstId/lastId/unread (не только при первом появлении messages).
- Unread clamp: Math.min(realUnread, incoming.length) — защита от завышенного серверного значения.

Файлы: src/native/hooks/useInitialScroll.js, src/native/modes/InboxMode.jsx.

---

## v0.87.40 ЧАСТИЧНО не решил проблему (23 апреля 2026, вечер)

После перезапуска, воспроизведение на канале «Журнал Движок» (unread=29):

```text
chat-state messages=50 loading=true
initial-wait-loading                                     ← ✅ loading guard работает

top-threshold top=0 lastUserType=none                    ← ⚠️ handleScroll на рендере
load-older-trigger beforeId=12809                        ← ⚠️ запрос СТАРЫХ без user-scroll-intent
store-load-older beforeId=12809

store-tg-messages append=false firstId=12838 anchor=12859  ← СВЕЖИЕ от сервера
chat-state loading=false
initial-run firstUnread=12859
initial-done top=15111                                   ← ✅ основной скролл правильный

store-tg-messages APPEND=true firstId=12759              ← ⚠️ поздний ответ на load-older
chat-state messages=100 top=52598                        ← ⚠️ scrollBrowser подвинул сам
load-older-apply top=40630                               ← ⚠️ компенсация сдвинула ещё
```

**Причина (главная гипотеза из handoff подтверждена):**

`handleScroll` в InboxMode.jsx:227 запускает `loadOlderMessages` на **программном** рендере:
- При появлении кэша в state `scrollTop=0` → `handleScroll` видит `top < 100` → `load-older-trigger`
- `lastUserType=none` (никто мышь/колесо не трогал) — но защиты от этого нет
- `append=true` приходит ПОСЛЕ `initial-done` → компенсация `scrollTop = scrollHeight - prevHeight` перебивает правильную позицию.

**v0.87.40 ЧАСТИЧНО недостаточен:**
- ✅ useInitialScroll ждёт свежих данных (loading guard работает)
- ✅ firstUnread пересчитывается на fresh
- ✅ unread clamp работает
- ❌ `handleScroll → load-older-trigger` запускается без user-scroll-intent
- ❌ async компенсация после append=true перебивает initial-done

**Стрелка ↓ тоже плохо работает:**

```text
button-scroll firstUnread=12860 top=40630
button-scroll-target top=40630                           ← не сдвинулся!
```

`scrollIntoView` не изменил позицию — 12860 уже в viewport или браузер решил что не надо.

**Нужный фикс (ещё не применён):**

1. В `handleScroll`: блокировать `loadOlderMessages` если `lastUserScrollIntent.at < Date.now() - 1500ms` ИЛИ `sinceOpenMs < 2000ms`. Паттерн: не запускать infinite scroll до первого реального действия пользователя.
2. В `scrollToMessage` из кнопки ↓: сначала reset `scrollTop = 0` или использовать принудительный скролл через `el.offsetTop` — не полагаться на `scrollIntoView({block: 'start'})` если элемент уже в viewport.

**Счётчик 29→28→27 — это НЕ баг**, это точные sync с сервером после markRead.

---

## v0.87.41 УСПЕХ для счётчика, остался баг newBelow (23 апреля, 13:10)

Счётчик больше НЕ прыгает — подтверждено логами: 27→26→25→24 плавно.

**Оставшиеся баги:**

1. **newBelow засчитывает append=true как "новые снизу"**
   - `InboxMode.jsx` useEffect считает added = `activeMessages.slice(prev).filter(!isOutgoing)`
   - При `append=true` (load-older): старые ВНАЧАЛО → `slice(prev)` возвращает последние 50 (сдвинутые) → +50 к newBelow
   - Бейдж стрелки показывает 50 «новых», хотя это на самом деле старые из кэша
   - **Фикс:** различать `prepend` vs `append` по позиции msgs. Проверять `lastMsgId > prevLastMsgId` а не просто размер массива.

2. **load-older-trigger всё ещё срабатывает программно**
   - `top-threshold lastUserType=none` при рендере кэша
   - Приводит к append=true и load-older-apply сдвигает scroll
   - **Фикс:** userTouchedRef флаг — не загружать старые пока нет колеса/тача/клавиш.

---

## v0.87.42 НАХОДКА: «открыл чат с 22 → стало 6» (23 апреля, 13:40)

Новый сценарий: канал Журнал Движок, unread=22.

```text
chat-open unread=22
initial-done top=21368 firstUnread=12866
mark-read maxId=12881                           [через 1.5с]
user-scroll-intent                              [ПОЗЖЕ чем markRead!]
UNREAD SYNC сервер=6                            [22 - 16 = 6]
```

**Объяснение:** IntersectionObserver при initial-scroll видит 16 сообщений (12866-12881) в viewport 570px. Они все «visible» → через 1.5с → `markRead(maxId=12881)` → сервер помечает прочитанными → unread=6. Произошло ДО первого user-scroll.

**Это Telegram-поведение? НЕТ.** В Telegram Desktop: первые 2-3 секунды после открытия чата НЕ маркируют. Только после user-interaction (колесо/клавиша).

**Варианты для согласования с юзером:**

- A: debounce markRead 1.5с → 3-5с
- B: НЕ markRead пока не было user-scroll-intent (чистый Telegram-стиль)
- C: 2с timeout + user-scroll-intent (что раньше)
- D: убрать readByVisibility, только markRead at bottom

---

## v0.87.40 ПРОБЛЕМА СЧЁТЧИКА (23 апреля 2026, 12:20)

Воспроизведение на канале АвтоБизнес (был 36 в списке):

```text
12:17:56 chat-open unread=36                             [список: 36]
12:17:58 mark-read maxId=3787                            [локально сразу: 36 - 11 = 25]
12:17:59 UNREAD SYNC сервер=35                           [сервер: 35]
12:18:33 UNREAD SYNC сервер=34                           [авто-mark-read ещё 1]
```

Пользователь видит прыжки: 36 → 25 → 35 → 34.

**Причина:** nativeStore.markRead() делает ДВЕ вещи одновременно:
- Локально уменьшает unreadCount на `localRead` (количество видимых в экране — может быть 11)
- На сервер отправляет только `maxId` (прочитано фактически 1 сообщение)

Локальная оценка (11) и реальная (1) РАСХОДЯТСЯ → прыжок на экране.

**Что хочет пользователь:**
1. Счётчики — только от сервера, без локальных оптимизаций.
2. Пока чат активен — не трогать счётчик в списке (или спрятать как в Telegram).

**Возможный фикс (не применён):**
- В `markRead`: убрать `localRead` параметр, не вычитать локально.
- Просто полагаться на `tg:chat-unread-sync` после GetPeerDialogs — придёт через 800мс.
- Опционально: для активного чата возвращать `unreadCount = 0` в `ChatListItem` (как в Telegram).

---

## v0.87.41 — ФИКС прыжка 36→25→35 (Telegram-style markRead)

`src/native/store/nativeStore.js` — сигнатура markRead изменена с `(chatId, maxId, localRead)` на `(chatId, maxId)`.
Убрана локальная оптимистичная вычитка. `unreadCount` меняется **только** через `tg:chat-unread-sync`.
Прыжки исчезли: 36 → 35 → 34 → ... плавно.

Тесты: `src/native/store/nativeStore.vitest.jsx` — 4 теста подтверждают отсутствие локального вычитания.

---

## v0.87.42 — ФИКС бейджа «50» на стрелочке после load-older

`src/native/hooks/useNewBelowCounter.js` — новый хук, отслеживает смену `lastMsgId` (не `messages.length`).
Раньше: при prepend (load-older) `messages.slice(prev)` возвращал последние 50 msgs → бейдж показывал 50.
Теперь: если `lastMsgId` не изменился — skip (это prepend, не новое входящее).

Логи: `[native-scroll] new-below added=N prevLastId nowLastId` / `new-below-skip reason=prepend`.

---

## v0.87.43 — «Вариант 5»: seen+scrolled-away IntersectionObserver

`src/native/hooks/useReadOnScrollAway.js` — двухфазный IntersectionObserver заменил старый threshold=0.15.

**Фаза 1 (Seen)**: `intersectionRatio >= 0.95` → msg помечен как «виденный» в `seenRef`.
**Фаза 2 (Read)**: `!isIntersecting && boundingClientRect.bottom < 0 && seenRef` → `onRead(msgId)`.

Защищает от ложных markRead при:
- Initial render (msg появились на экране, но не прокручены мимо)
- Fast scroll (msg промелькнул — не набрал 95% ratio)

Логи: `[native-scroll] read-scrolled-away msgId batchSize currentUnread`, `read-batch-send maxId count`, `read-batch-skip reason`.

Тесты: `src/native/hooks/useReadOnScrollAway.vitest.jsx`.

---

## v0.87.44 — ФИКС «было 7 → стало 1» (default atBottom)

`src/native/modes/InboxMode.jsx:118` — `useState(false)` вместо `useState(true)`.

Раньше: `atBottom=true` (default) + unread>0 → `useForceReadAtBottom` через 400мс отправлял markRead(lastMsgId) ДО любого scroll event → сервер возвращал unread=1.

Теперь: `atBottom=true` только после реального scroll event c `nearBottom<80`.

Тесты: `src/native/hooks/useForceReadAtBottom.vitest.jsx` — 5 сценариев, включая регрессию v0.87.44.

Попутно: `src/__tests__/hookOrder.test.cjs` исключает `.vitest.jsx` (false-positive на renderHook).

---

## v0.87.52 — FIX newBelow залипает между чатами (стрелка 41 вместо 8)

Корневая причина: state `newBelow` (useState в InboxMode) и `prevLastIdRef` (useRef в useNewBelowCounter) не сбрасывались при смене `activeChatId`. Накопленные значения от Geely (33) + Автопоток (8) = стрелка 41, хотя в Автопотке только 8 новых.

Fix:
- `useNewBelowCounter` принимает `chatId`. При его смене сбрасывает `prevLastIdRef` и возвращает `onSkip({ reason: 'chat-switch' })` без `onAdded`.
- В `InboxMode.jsx` в useEffect по смене `store.activeChatId` добавлен `setNewBelow(0)`.

Доказательство из лога (до фикса):
```
new-below chat=Geely added=33
new-below chat=Автопоток added=8  ← накопилось до 41
```

+2 теста в `useNewBelowCounter.vitest.jsx`:
- смена chatId не вызывает onAdded (onSkip reason=chat-switch)
- после смены chatId новые msg в новом чате считаются нормально

---

## v0.87.51 — Прогрессия счётчика в реальном времени + откат groupedUnread

3 изменения:

1. `useReadOnScrollAway.js` — один IntersectionObserver с `threshold: 0` + initial-guard. Msg при открытии в viewport → НЕ read. Любое последующее появление (скролл) → read. Без тротлинга центральной полосы (v0.87.47), работает при любой скорости.

2. InboxMode: таймер батча markRead с 1500мс до 300мс. Прогрессия счётчика в реальном времени при прокрутке.

3. Удалён `groupedUnread` — UI использует сырой `chat.unreadCount` от Telegram API. Откат v0.87.45-50. См. урок в common-mistakes.md.

Новые логи для диагностики:
- `read-initial-visible { msgId }` — msg виден при открытии (не помечаем)
- `read-initial-hidden { msgId }` — msg скрыт при открытии
- `read-fire { msgId }` — помечен через observer

Ожидаемая цепочка при листании чата с unread=23:
```
read-initial-visible msgId=X (для тех что в viewport при open)
(юзер скроллит)
read-fire msgId=Y
read-batch-send maxId=Y count=N
[tg] mark-read OK maxId=Y
store-unread-sync unread=20  ← уменьшилось!
badge-state unread=20 prevUnread=23
(продолжается)
badge-state unread=15 prevUnread=20
...
badge-state unread=0 prevUnread=3
```

---

## v0.87.50 — FIX «бейдж застрял на 23 после прочтения» (clamp groupedUnread)

Логи v0.87.49 доказали: API mark-read работал, сервер вернул `unread=0`, store получил sync. Баг в том что `tg:chat-unread-sync` handler не трогал `chat.groupedUnread`, а UI приоритизирует его над `unreadCount`.

Цитата-улика из лога (Geely EX5 EM-i, 18:38:48):
```
[tg] UNREAD SYNC сервер=0
store-unread-sync unread=0
badge-state unread=0 grouped=23 badge=23 prevGrouped=23
```

Фикс в handlers `tg:chat-unread-sync` + `tg:unread-bulk-sync`:
```js
const nextGrouped = typeof c.groupedUnread === 'number'
  ? Math.min(c.groupedUnread, unreadCount)
  : c.groupedUnread
```

+5 regression тестов в nativeStore.vitest.jsx — 127 vitest passed (было 122).

Диагностические логи force-read-*/bottom-state-change/scroll-anomaly/badge-state оставлены — они проверили что force-read работает (fire успешно) и прыжков scrollTop нет.

---

## v0.87.49 — ДИАГНОСТИКА: счётчик непрочитанных застревает после пролистывания (только логи)

Что сделано: ТОЛЬКО добавлены логи, никаких изменений логики.

Новые события в `[native-scroll]`:
- `force-read-schedule { chatId, lastId, unread, maxEverSent, atBottom }`
- `force-read-skip { reason: not-at-bottom/no-chat/no-messages/unread-zero/no-last-id }`
- `force-read-skip-guard { lastId, maxEverSent }`
- `force-read-fire { chatId, lastId, unread }`
- `force-read-cleanup { chatId, lastId, atBottomAtSetup, unreadAtSetup }`
- `bottom-state-change { prev, curr, scrollTop, scrollHeight, clientHeight, bottomGap }`
- `scroll-anomaly { dtMs, deltaTop, deltaHeight, prevTop, currTop, prevHeight, currHeight, reasonGuess }`
- `badge-state { chatId, title, unread, grouped, badge, prevUnread, prevGrouped }`

Доказанные факты (без логов):
- `tg:chat-unread-sync` сбрасывает `unreadCount`, но не трогает `groupedUnread` → если последний recompute оставил `groupedUnread=3`, UI показывает 3 даже когда сервер вернул 0.
- `recomputeGroupedUnread` вызывается только на window.focus и после session restore — не после markRead.

План использования:
1. Перезапустить приложение после v0.87.49.
2. Воспроизвести баг: открыть чат с unread, пролистать до конца.
3. Вытащить логи `[native-scroll]` за последние 30 секунд.
4. По событиям `force-read-*` понять сработал ли fallback для последних msg.
5. По `bottom-state-change` + `scroll-anomaly` понять почему (если не сработал) — был ли atBottom обратно false, прыгал ли scrollTop.
6. По `badge-state` проверить stale-ли `groupedUnread` после markRead.

---

## v0.87.48 — FIX скролл уезжал в середину при открытии (race авто-load-older vs initial-scroll)

**Проблема**: при открытии чата скроллТоп=0 триггерил авто-`load-older` (условие `scrollTop<100`) одновременно с initial-scroll. prevHeight запоминал высоту ДО initial-scroll. Результат — наша формула `scrollHeight-prevHeight` перекрывала корректный scrollTop от browser scroll anchoring (Chrome Scroll Anchoring API, вкл. по умолчанию). Юзер уезжал в середину чата.

**Фикс**:
- `src/native/hooks/useInitialScroll.js` — экспортирует `{ doneRef }` (ref, который становится `=activeChatId` после initial-scroll)
- `src/native/modes/InboxMode.jsx` — в `handleScroll` блокировка:
  ```js
  if (initialScrollDoneRef.current !== store.activeChatId) return
  ```
  Новый лог `load-older-skip-initial` для диагностики.

**Тесты**: `useInitialScroll.vitest.jsx` (новый, 5 контрактных тестов doneRef) + `InboxMode.vitest.jsx` +1 регрессия (loadOlderMessages НЕ вызывается при render с scrollTop=0).

---

## v0.87.47 — FIX счётчик не уменьшался на длинных постах (center viewport)

**Проблема**: v0.87.43 ввёл `ratio >= 0.95` для детекции seen. Для длинных постов (юридические тексты в канале Автовоз ~800px при viewport 570px) ratio максимум **0.71** — порог никогда не достигается. Лог доказывает: 15 сек активной прокрутки (6000px), ноль `read-scrolled-away`.

**Фикс в `src/native/hooks/useReadOnScrollAway.js`** — Вариант 2 (Telegram-style):

- Seen-observer: `rootMargin: '-49% 0px -49% 0px', threshold: 0` — полоса 2% в центре viewport. Msg пересекает центр → `isIntersecting=true` → seen. Работает для msg любого размера.
- Read-observer: `threshold: 0` без rootMargin. При `!isIntersecting && boundingClientRect.bottom < rootBounds.top` + seen → onRead.

Тесты полностью переписаны: 13 сценариев (включая регрессию длинного msg). Мок в MediaAlbum.vitest.jsx обновлён под два observer (различает их по наличию rootMargin).

---

## v0.87.45 — «Карточки» вместо MTProto-сообщений (альбом = 1)

**Проблема**: пользователь видит альбом из 9 фото → бейдж показывает 9, а в ленте 1 карточка.

**Решение — «Вариант 2»** (параллельный batch recompute):

1. `main/native/telegramHandler.js` — новый IPC `tg:recompute-grouped-unread`:
   - Фильтрует чаты с `unreadCount > 0`
   - Для каждого: `getMessages(entity, { limit: min(unread, 30) })`
   - Группирует по `groupedId` (Set уникальных) + singles → `grouped = groups.size + singles`
   - Batch=5 + 150ms delay (защита от FLOOD_WAIT)
   - Emit `tg:grouped-unread` → `{ [chatId]: { server, grouped } }`

2. Сброс `unreadCount` из кэша — `saveChatsCache()` и `tg:get-cached-chats` форсят `unreadCount: 0`.
   Избегаем стейл-значения из `tg-cache.json` после рестарта (пользователь прямо сказал: «не брать ничего из кэша в этом вопросе»).

3. `src/native/store/nativeStore.js` — handler `tg:grouped-unread` пишет `chat.groupedUnread`.
   Action `recomputeGroupedUnread()` → IPC.

4. `src/native/components/ChatListItem.jsx`:
   `badgeCount = typeof chat.groupedUnread === 'number' ? chat.groupedUnread : chat.unreadCount`.

5. `src/native/modes/InboxMode.jsx`:
   - После первого `tg:chats` (session restore) — через 800мс `recomputeGroupedUnread()` (ref-guard, один раз).
   - На `window.focus` — рядом с `rescanUnread()`.

Тесты: +4 в `nativeStore.vitest.jsx` + 3 в `ChatListItem.vitest.jsx` = **111 vitest**.

**Проверено на другие источники staleness**: `localStorage chat-messages:*` хранит только msgs (без unread) — OK. `ai-draft:*`, `user_auth` — не связаны с unread. Только `tg-cache.json.unreadCount` был проблемой (исправлено).
