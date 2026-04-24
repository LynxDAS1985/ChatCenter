# Реализованные функции — ChatCenter

## Текущая версия: v0.87.69 (24 апреля 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.87.51 → v0.87.66). Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.87.40-50.md`](./archive/features-v0.87.40-50.md) | v0.87.40 – v0.87.50 (итерации native scroll + unread, groupedUnread удалён в v0.87.51) | ~40 КБ |
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

---

### v0.87.68 — Автотест лимитов переписан (авто-сканирование) + поднят лимит для интеграций + handoff-письмо

**Зачем**: прошлая проверка показала что **2 файла сильно превышают лимиты**, но автотест их не ловил — проверял вручную перечисленный список из 15 файлов.

**Проблема** (найдено при анализе):
- `main/native/telegramHandler.js` = **1260 строк** (при старом лимите 300 для `.js`!)
- `src/native/modes/InboxMode.jsx` = **765 строк** (при лимите 600)
- Ещё 4 файла в `src/` нарушали старый лимит 300 для утилит

Тест их не видел, pre-commit hook пропускал.

**Что сделано** (только тест + документация, файлы НЕ разбивал):

#### 1. `src/__tests__/fileSizeLimits.test.cjs` — переписан

- **Автоматическое сканирование** всех `.jsx / .js / .cjs` в `src/` и `main/`
- Лимит выбирается **по пути файла** (не нужно перечислять вручную)
- **Жёлтое предупреждение при 80%+** лимита — тест не падает, но сигнализирует
- **Массив `KNOWN_EXCEPTIONS`** для двух больших файлов с повышенным потолком (1300 и 800)

#### 2. Новые лимиты по типу (v0.87.68)

| Где файл | Лимит | Было |
|---|---|---|
| `src/components/*.jsx` | 700 | 700 |
| `src/native/*.jsx`, другие `.jsx` | 600 | 600 |
| React hooks `.js` | 150 | 130 |
| Утилиты `.js` (src/utils, main/utils) | 300 | 300 |
| **Крупные интеграции `.js`** (handlers, native, store, preloads/utils) | **500** | 300 |
| `main/main.js`, preload `.cjs` | 600 | 600 |
| Тесты | 400 | 300 |

Причина «300 → 500»: инфраструктурные файлы (GramJS handler, unread counters, native store) с IPC handlers / store actions не могут быть 300 строк. 500 — реалистично.

#### 3. Два новых файла памяти

- **`.memory-bank/code-limits-status.md`** — снапшот текущих размеров файлов, исключений, предупреждений. **Конкретные числа живут здесь, не в CLAUDE.md** (они стареют за дни).
- **`.memory-bank/handoff-code-limits.md`** — письмо другому ИИ

Содержит:
- Что обнаружено (2 файла превышают)
- Что сделано (новый тест + новые лимиты + исключения)
- Что НЕ сделано: разбиение `telegramHandler.js` (1260) и `InboxMode.jsx` (765)
- Подробные рекомендации как разбивать оба файла
- Список файлов близких к лимиту (App.jsx, main.js на 99%)
- Как запускать новый тест

#### 4. CLAUDE.md — секция «Лимиты размера файлов КОДА» обновлена

- Новая таблица лимитов по типам
- Упомянуты 2 исключения с ссылкой на handoff
- Упомянуты файлы на 80%+ лимита
- В «Узкие / разовые файлы» добавлен `handoff-code-limits.md`

**Что НЕ сделано** (по явной просьбе пользователя):
- ❌ Не разбивал `telegramHandler.js` — только зафиксировал в исключениях
- ❌ Не разбивал `InboxMode.jsx` — только зафиксировал
- Разбиение = отдельная задача на 4-8 часов. Рекомендации в handoff-файле.

**Результат**: следующий ИИ (или я в следующей сессии) **увидит проблему**:
- При `npm test` — тест покажет все файлы с их размерами
- При приближении любого файла к 80% — жёлтое предупреждение
- При превышении потолка 1300 / 800 для исключений — красный тест

**Тесты**: `node src/__tests__/fileSizeLimits.test.cjs` → проходит с новой логикой. `npm run check-memory` ✅.

---

### v0.87.63 — Правило простого языка + 5 визуальных приёмов для советов

**Зачем**: пользователь — не программист. Все советы и объяснения должны быть **понятны человеку без технической подготовки**. Раньше правило было мягким («пиши без сложных слов»), теперь — жёсткое.

**Что сделано** (только документация, код не менялся):

1. **Жёсткое правило простого языка** в CLAUDE.md «💬 Формат ответа»:
   - Запрещены технические термины и профессиональный жаргон в объяснениях
   - Разрешены простые слова, аналогии («это как…»), имена файлов/команд
   - Тест на понятность: если нельзя пересказать бабушке — переписать проще

2. **5 визуальных приёмов** для советов (новая секция «🎨 Визуальное оформление советов»):
   - 📊 Приём 1 — таблица «До / После» для правок текста/чисел
   - 🟢🟡🔴 Приём 2 — иконки-светофор вместо слов «плюсы/минусы/риски»
   - ⭐ Приём 3 — шкала приоритета (1–5 звёзд) когда советов несколько
   - 🖼 Приём 4 — ASCII-мокап для структуры/архитектуры/UI
   - 🚦 Приём 5 — одна строка-светофор для мелких советов

3. **Таблица соответствия** «какой приём для какого случая» — чтобы агент не выбирал случайно.

**Почему важно**: раньше советы выглядели как стена текста с одинаковыми подзаголовками. Теперь — за 2–5 секунд понятно: приоритет, что даст, сколько стоит.

**Тесты**: только документация. `npm run check-memory` ✅, автотесты ✅.

---

### v0.87.69 — Моргание при A→B→A фикс + Link preview для исходящих

**Обратная связь пользователя**:
- ✅ FLOOD_WAIT throttle аватарок работает (все аватарки загружены)
- ✅ Ctrl+↑ — редактирование последнего
- ✅ lastMessage preview с медиа работает
- ❌ **Переключение A→B→A всё ещё моргает**, даже после v0.87.67
- ❌ **Link preview пустой** — отправил ссылку → bubble пустой

---

#### Проблема 1: моргание A→B→A

**Корень** (нашёл чтением кода, не логи): v0.87.67 правильно не показывал shimmer для уже виденных чатов (через `seenChatsRef` в InboxMode). Но внутри `useInitialScroll` был ДРУГОЙ guard — `doneRef.current === activeChatId`. `doneRef` хранил **только последний** chatId. При A→B→A:
- doneRef становился 'B'
- Возврат на A → guard `'B' === 'A'` = **не равны** → initial-scroll **запускался заново** через 150мс
- scrollIntoView сдвигал контент → моргание

**Фикс**: `doneRef` → `doneSetRef = new Set()`. Все виденные chatId. Возврат на A → `Set.has('A') === true` → **ранний return**, scroll не двигается, текущая позиция сохраняется.

[src/native/hooks/useInitialScroll.js](src/native/hooks/useInitialScroll.js):
```js
const doneSetRef = useRef(new Set())

useEffect(() => {
  if (doneSetRef.current.has(activeChatId)) {
    onDone?.(activeChatId)  // сразу уведомляем что контент готов
    return  // НЕ перезапускаем scroll
  }
  // ... обычная ветка initial-scroll
  doneSetRef.current.add(activeChatId)
})
```

**Тест** добавлен в [useInitialScroll.vitest.jsx](src/native/hooks/useInitialScroll.vitest.jsx):
- ⭐ A→B→A: onDone вызван 3 раза, для A и B setTimeout 150мс, для повторного A — **сразу**

#### Проблема 2: Link preview пустой

**Корень** (по коду): в `tg:send-message` handler я строил минимальный msg с `mediaType: null`. Игнорировал `result.media` от GramJS. Если Telegram распарсил ссылку — `result.media.className === 'MessageMediaWebPage'` + `result.media.webpage.{url,title,description,siteName}`. Мы это выкидывали.

В `MessageBubble` preview рендерится только когда `m.mediaType === 'link' && m.webPage`. У нас всегда null → **нет preview**.

**Фикс** в [main/native/telegramHandler.js](main/native/telegramHandler.js) `tg:send-message`:
```js
if (result.media?.className === 'MessageMediaWebPage') {
  const wp = result.media.webpage
  if (wp?.className === 'WebPage') {
    mediaType = 'link'
    webPage = {
      url: wp.url || wp.displayUrl || '',
      title: wp.title || '',
      description: wp.description || '',
      siteName: wp.siteName || '',
      photoUrl: null,
    }
  }
}
// msg: { ..., mediaType, webPage, ... }
```

+ лог `send-message: result.media=... webPage title=... site=...` — в будущем видно что Telegram вернул для диагностики.

**Важно про пустой bubble на скриншоте**: возможно Telegram не успел распарсить ссылку в момент отправки (парсится асинхронно после отправки). Тогда `result.media` будет null, preview не появится. Это нормально для свежеотправленных ссылок — при следующей перезагрузке чата Telegram уже распарсил и preview будет.

**Что ПРОВЕРИТЬ пользователю**:
- [ ] Отправь ссылку типа `https://yandex.ru` → видно ли bubble с текстом ссылки (не пустой)?
- [ ] В логе `chatcenter.log` найди строку `send-message: result.media=...` — что там (none / MessageMediaWebPage)?
- [ ] Закрой приложение → снова открой тот же чат → preview появилась?

**Тесты**: 119 vitest ✅ (было 118, +1 на A→B→A).

---

### v0.87.67 — Shimmer только для первого открытия чата (seenChatsRef)

**Обратная связь после v0.87.66**:
- ✅ Открытие чата — не виден прыжок, контент плавно появляется
- ✅ Медиа-альбомы сеткой — работает, пометка «сделано»
- ❌ При переключении между **уже открытыми** чатами всё равно видно моргание

**Причина**: код применял shimmer + opacity:0 **одинаково** для всех переключений. Для первого открытия это нужно (скрыть загрузку). Для повторного — контент уже в памяти, показывать shimmer = искусственная задержка.

**Решение** (одна строка данных):

В [InboxMode.jsx](src/native/modes/InboxMode.jsx) добавлен `seenChatsRef = useRef(new Set())`. Логика:
- При `onDone` из `useInitialScroll` → добавляем `chatId` в set
- При смене `activeChatId`:
  - Если `seenChatsRef.has(chatId)` → `setChatReady(true)` **сразу** (нет shimmer)
  - Иначе → `setChatReady(false)` (ждём onDone как раньше)

Результат по сценариям:

| Сценарий | v0.87.66 | v0.87.67 |
|---|---|---|
| Первое открытие чата | shimmer 200-500мс, плавный fade | 🟢 то же (работает) |
| Повторное открытие | shimmer 200-500мс (моргание) | 🟢 мгновенно |
| Перезапуск приложения | seen сбрасывается → первое открытие | 🟢 корректно |

**Тесты**: 118 vitest ✅ (логика изолирована в InboxMode, hook useInitialScroll не менялся — его тесты не трогаем).

**Что проверить пользователю**:
- [ ] Открой chat A первый раз → shimmer → контент на правильной позиции
- [ ] Переключись на chat B первый раз → shimmer → контент
- [ ] Вернись к chat A → **мгновенно**, без shimmer и моргания
- [ ] Переключайся между A ↔ B несколько раз → **каждый раз без моргания**

---

### v0.87.66 — Overlay shimmer пока initial-scroll не завершился (прыжок полностью не виден)

**Обратная связь пользователя после v0.87.65**:
- ✅ Анимация отправки на каждом msg — работает
- ✅ Плавный скролл после отправки
- ✅ Анимация без scale-bump
- ❌ При открытии чата fade-in 250мс не скрывает прыжок — видно моргание

**Требование**: до того как initial-scroll переведёт на firstUnread, контент чата **не должен быть виден**.

**Корень**: в v0.87.65 использовал CSS animation `opacity 0→1` за 250мс при mount. Но initial-scroll с его `setTimeout(150мс)` + `scrollIntoView` завершается иногда ПОЗЖЕ 250мс (особенно при задержке сервера tg:messages). В щель fade-in → `scrollTop=0` (верх чата виден) → прыжок к firstUnread.

**Решение** (по сигналу, не по времени):
1. [useInitialScroll.js](src/native/hooks/useInitialScroll.js) — добавлен **`onDone(chatId)` callback**. Вызывается **ПОСЛЕ** фактического завершения scroll (точнее — scrollIntoView или scrollTop=scrollHeight).
2. [InboxMode.jsx](src/native/modes/InboxMode.jsx) — state `chatReady: boolean`. При смене `activeChatId` → `setChatReady(false)`. В `onDone` → `setChatReady(true)`.
3. [InboxMode.jsx MessageListOverlay](src/native/components/MessageSkeleton.jsx) — условие `show={!chatReady && visibleMessages.length > 0}`. Shimmer-overlay держится до завершения initial-scroll.
4. [InboxMode.jsx scroll-container](src/native/modes/InboxMode.jsx) — inline style `opacity: chatReady ? 1 : 0, transition: 'opacity 200ms ease-out'`. Невидим до сигнала.

**Итог**: прыжок `scrollTop=0 → firstUnread` происходит **под** overlay'ем + на invisible scroll-контейнере. Юзер видит:
- shimmer-placeholder (0-300мс)
- fade-in контента уже **на правильной позиции**

Старый CSS-класс `native-chat-fadein` больше не используется (inline style через state — надёжнее, так как реагирует на actual event а не на фиксированное время).

**Тесты** (+2 в [useInitialScroll.vitest.jsx](src/native/hooks/useInitialScroll.vitest.jsx)):
1. ⭐ `onDone` callback вызван с `chatId` после завершения scroll
2. `onDone` НЕ вызван пока `loading=true` (ждёт свежих данных)

**Итого**: 118 vitest ✅ (было 116), E2E 17/17, UI 9/9.

**Что проверить пользователю**:
- [ ] Открой любой чат → **не видно верх чата** (нет прыжка) → сразу появляется shimmer → потом контент уже на правильной позиции
- [ ] Переключение между чатами — каждый раз overlay скрывает переход
- [ ] Нет мерцания / промежуточных состояний

---

### v0.87.65 — Плавность: анимация mount-only + smooth scroll + fade-in чата

**Обратная связь пользователя после v0.87.64**:
- ✅ Все пункты «что проверить» пройдены — работает
- ❌ Эффект отправки показывается не всегда (через одно или через 2 сообщения)
- ❌ Скролл после отправки резкий — хочется плавный
- ❌ Анимация неоновая — хочется плавнее
- ❌ При открытии чата виден «прыжок» initial-scroll — нужно плавно

**3 изменения** (все minimal-invasive, логику initial-scroll не трогаем):

#### 1. Анимация отправки — mount-only через useEffect (вместо inline isJustSent)

**Было** (v0.87.59): `className={isJustSent ? 'native-msg-sent' : undefined}` где `isJustSent = Date.now() - m.timestamp < 2000`. Проблема: `m.timestamp` = `result.date * 1000` (серверное время секундной точности + возможная задержка). Окно 2000мс жёсткое → иногда не попадало, проигрывалось «через одно».

**Стало** (v0.87.65):
- `main/native/telegramHandler.js` `tg:send-message` добавляет в msg поле **`localSentAt: Date.now()`** (client-time при emit)
- [MessageBubble.jsx](src/native/components/MessageBubble.jsx) useEffect с пустыми deps (mount-only):
  ```js
  useEffect(() => {
    if (!ref.current || !m.isOutgoing) return
    const sentAt = m.localSentAt || m.timestamp || 0
    if (!sentAt || (Date.now() - sentAt) > 3000) return
    ref.current.classList.add('native-msg-sent')
    setTimeout(() => ref.current?.classList.remove('native-msg-sent'), 1600)
  }, [])
  ```
- Окно расширено с 2000 до 3000мс. Re-render не ломает анимацию (useEffect с `[]` срабатывает только на mount).

#### 2. Smooth scroll после отправки

`handleReplySend` → раньше `el.scrollTop = el.scrollHeight` (мгновенный прыжок). Стало:
```js
el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
```

#### 3. Fade-in scroll-container при смене чата

**Проблема**: между `chat-open scrollTop=0` и `initial-scroll` setTimeout(150мс) юзер видит верх чата → затем прыжок вниз к firstUnread. Визуально заметно и неприятно.

**Решение** (безопасное — не трогает логику initial-scroll):
- [src/native/styles.css](src/native/styles.css) — новый `@keyframes native-chat-fadein` (opacity 0 → 1, 250мс)
- [InboxMode.jsx](src/native/modes/InboxMode.jsx) — useEffect на смену `activeChatId`:
  ```js
  el.classList.remove('native-chat-fadein')
  void el.offsetWidth  // force reflow — перезапуск анимации
  el.classList.add('native-chat-fadein')
  ```
  Через 400мс убираем класс. При каждой смене чата scroll-container fade-in за 250мс — прыжок initial-scroll происходит внутри fade и не виден.

**Почему не `key={activeChatId}`**: это бы remount'ило div, ломая `msgsScrollRef.current` для `useInitialScroll`. Через classList + reflow — безопасно.

#### 4. Плавнее keyframes анимации sent (убран scale-bump)

**Было**: `scale(0.95) → scale(1.02) → scale(1)` + opacity — ощущение «прыжка».

**Стало**: чистый fade-in (opacity 0.3 → 1) + плавное затухание glow. Длительность 1.2с → **1.6с**. Easing `cubic-bezier(0.25, 0.1, 0.25, 1)` — стандартный material ease-out.

**Тесты**: 116 vitest ✅.

**Что проверить пользователю**:
- [ ] Анимация отправки показывается для **каждого** msg (не через один)
- [ ] Скролл после отправки **плавный**, не мгновенный прыжок
- [ ] При открытии чата контент плавно появляется (opacity fade) — прыжок initial-scroll не виден
- [ ] Анимация sent — плавная, без scale-bump

**Осталось проверить** (с прошлых релизов — не решено):
- Link preview (Ctrl+↑ edit, lastMessage preview, медиа-альбомы сеткой) — ⏳ не тестировалось вручную
- Video PiP, Auto-cleanup tg-media, LRU 2 ГБ — ⏳
- FLOOD_WAIT throttle для аватарок (v0.87.55) — ⏳ нужно проверить на практике

---

### v0.87.64 — UI: bubble content-size до 75% row + auto-scroll после send + возврат к единой логике для всех типов чатов

**Проблема (скриншот пользователя)**: в группах и приватных коротких сообщения bubble схлопывался до 1 символа шириной (`bubbleW=39, groupW=60` при `scrollW=620`). Каждая буква на своей строке. Причина — круговая зависимость `maxWidth: 65%` у bubble от `flex: 0 1 auto` у group (group content-sized → bubble 65% от content → рекурсивная схлопка).

**Также**: после отправки сообщение уходило ниже viewport (`deltaHeight=154, deltaTop=0`) — юзер видел стрелку ↓ но не сам bubble.

**Единое требование пользователя**: одинаковое поведение для личных / групп / каналов.

**Что делал — 2 попытки**:

1. **Первая попытка (Вариант C)**: `width: 75%` на `.native-msg-group`. **Ошибка**: при коротком тексте («111») bubble занимал 75% — пустые поля по бокам. Плохой UX.

2. **Финальная версия (Вариант A)**: `maxWidth: 75%` + `width: auto` на `.native-msg-group`. Bubble content-sized внутри (до 75% ширины row). `alignSelf: flex-end/start` прижимает к нужному краю.

**Изменения кода**:

1. [src/native/modes/InboxMode.jsx](src/native/modes/InboxMode.jsx) `.native-msg-group`:
   ```js
   maxWidth: '75%',  // не width! иначе пустые поля при коротком тексте
   alignItems: item.isOutgoing ? 'flex-end' : 'flex-start',
   display: 'flex', flexDirection: 'column',
   ```

2. [src/native/components/MessageBubble.jsx](src/native/components/MessageBubble.jsx):
   ```js
   maxWidth: hasMedia ? 420 : '100%',  // 100% group = наследует 75% row
   minWidth: hasMedia ? 280 : 'auto',
   width: 'auto',  // content-sized
   ```

3. [src/native/components/MediaAlbum.jsx](src/native/components/MediaAlbum.jsx) `AlbumBubble`: `maxWidth: 520, minWidth: 280` (убрано `min(520px, 80%)` — теперь контроль ширины в group).

4. [src/native/modes/InboxMode.jsx](src/native/modes/InboxMode.jsx) `handleReplySend`: после успешной отправки через 50мс → `msgsScrollRef.current.scrollTop = msgsScrollRef.current.scrollHeight`. Юзер видит отправленный bubble в низу сразу.

5. Удалён диагностический `bubble-width-diag` из MessageBubble (v0.87.61 отработал, нужна была разовая диагностика).

**Тесты**: 116 vitest ✅, snapshots обновлены, E2E 17/17, UI 9/9.

**Что проверить пользователю** (после перезапуска):
- [ ] Короткие msg («111») занимают **content-size** (по размеру текста), без пустых полей
- [ ] Длинные msg растягиваются до **~75% ширины**, дальше перенос
- [ ] Исходящие прижаты к правому краю, входящие — к левому
- [ ] После отправки **видно отправленное сообщение** (auto-scroll вниз)
- [ ] Единое поведение в личном / группе / канале

---

### v0.87.62 — Синхронизация workflow.md с новой структурой памяти + удаление устаревшей цифры

**Зачем**: внешний ИИ-оценщик нашёл 2 реальные нестыковки в документации. Эта версия их устраняет.

**Что сделано** (только документация, код не менялся):

1. **`workflow.md` полностью переписан** — раньше 76 строк старой модели (общий список файлов без упоминания `mistakes/`, `archive/`, конфликта память-код, опасных команд). Теперь синхронизирован с CLAUDE.md:
   - Правила чтения памяти (постоянные / по теме / узкие / архив-не-читать)
   - Конфликт память vs код
   - Опасные и безопасные команды (ссылки на полные таблицы в CLAUDE.md)
   - Pipeline по размеру задачи (простая/средняя/крупная)
   - Обновлённые чеклисты (добавление мессенджера / ИИ-провайдера / авто-ответа) — с версией и mistakes-файлами
   - Краткая секция «Если что-то не работает»

2. **Удалена устаревшая цифра «~76 КБ»** из CLAUDE.md про features.md — реально файл уже 87 КБ. Заменено на фразу «большой файл» — не стареет со временем.

**Почему важно**: `workflow.md` читается **каждую сессию** как постоянный файл. Если он устарел — агент читает одновременно новые правила (CLAUDE.md) и старые (workflow.md). Конфликт внутри головы агента.

**Что НЕ делал**:
- Не переносил в архив `native-mode-plan.md` и `native-scroll-diagnostics-handoff.md` — оба активны (план реализуется в текущих v0.87.x, handoff используется для расследований скролла)
- Не искал мелкие «⚪ ИСТОРИЯ» секции в `mistakes/webview-stack-grouping.md` (125 КБ) — низкий приоритет, файл читается только по теме

**Тесты**: только документация. `npm run check-memory` ✅ (все версии согласованы), автотесты ✅.

---

### v0.87.61 — Рефакторинг CLAUDE.md по результатам самооценки (5 улучшений А-Д)

**Зачем**: оценка CLAUDE.md на 9/10 выявила 5 конкретных проблем. Эта версия их устраняет.

**Что сделано** (только косметика документации, код не менялся):

1. **А. Объединена таблица «Опасные команды»** — раньше дублировалась в двух секциях. Теперь одна таблица в «Правилах проверки», в «Критических запретах» — только общие запреты на действия + ссылка.

2. **Б. Секции в логичном порядке**:
   - Принципы → Что читать → Как работать → Конфликт память/код → Запреты → Проверки → Если сломано → Контекст/модули → Лимиты кода → Версия → Memory Bank → Git → Формат → Отчёт → Результат → .claude/ → Структура памяти
   - Раньше «Критические запреты» шли **до** «Первого действия в сессии» — нелогично.

3. **В. Явно разделены лимиты**: «🚫 Лимиты размера файлов КОДА (src/, main/)» и «📏 Лимиты размера файлов ПАМЯТИ (.memory-bank/)». Капс-слова в заголовках — видно с первого взгляда.

4. **Г. Новая секция «🆘 Если что-то не работает»** — 8 типовых проблем и решений:
   - Pre-commit hook падает → `bash scripts/check-memory.sh`
   - Версии разошлись → `npm run check-memory`
   - Тест dangling-refs ругается → удали упоминание или восстанови файл
   - Тест лимитов ругается → разбить файл
   - Контекст переполнен → читай только индекс + тему
   - Структура устарела → `npm run regen-claude-structure`
   - Auto-memory расходится с кодом → доверяй коду
   - Hook не подхватил обновление → `cp` в `.git/hooks/`

5. **Д. Новая секция «⚙️ Конфигурация .claude/»**:
   - `settings.json` — project permissions (Bash/Read/Write/Edit и др. разрешены без подтверждения, **но** критические запреты это НЕ отменяет)
   - `skills/`, `commands/` — сейчас пусто, правило на будущее
   - `memory/` — auto-memory, при конфликте с кодом доверять коду

**Автоматические проверки** (без изменений, всё работает):
- Автотесты лимитов и dangling-refs → в `npm test`
- Pre-commit hook → `scripts/hooks/pre-commit` вызывает `check-memory.sh`
- Ручные скрипты → `npm run check-memory`, `npm run regen-claude-structure`

**Тесты**: только документация. `npm run check-memory` ✅, автотесты ✅, `npm run lint` ✅.

---

### v0.87.60 — Pre-commit hook с check-memory + regen-скрипт CLAUDE.md + dangling-refs тест + второе разбиение webview-injection.md + правило `.claude/skills/`

**Зачем эта версия**: достроить автоматическую защиту Memory Bank — от ручных проверок к полностью автоматическим. Теперь рассинхрон версий и битые ссылки ловятся ещё **до коммита**, а структура CLAUDE.md регенерируется из реальных файлов.

**Что сделано**:

#### 1. Pre-commit hook теперь проверяет Memory Bank

`scripts/hooks/pre-commit` дополнен блоком: если в коммите есть `.memory-bank/*`, `CLAUDE.md`, `package.json` или `package-lock.json` — запускается `bash scripts/check-memory.sh`. Коммит блокируется при проблемах (рассинхрон версий, битая ссылка, превышен лимит).

#### 2. Авто-регенерация «Структуры памяти» в CLAUDE.md

- Новый скрипт `scripts/regen-claude-structure.sh` (+ `npm run regen-claude-structure`).
- В CLAUDE.md добавлены маркеры `<!-- STRUCTURE-AUTO-START -->` / `<!-- STRUCTURE-AUTO-END -->` вокруг блока «Структура памяти».
- Скрипт читает `.memory-bank/` и перегенерирует таблицы между маркерами. Вне маркеров — ничего не трогает.
- Запускать вручную после добавления/удаления файла памяти (или через `npm run`).

#### 3. Автотест dangling references

`src/__tests__/featuresReferences.test.cjs` проверяет что ссылки вида `[text](src/...)`, `[text](main/...)` и т.д. в **последних 10 версиях** `features.md` указывают на существующие файлы.

**Почему только 10 версий**: старые записи (v0.80, v0.70) могут ссылаться на функции и файлы давно удалённые/переименованные — это история, не ошибка. А последние 10 — актуальная часть, должна быть точной.

Добавлен в `npm test`.

#### 4. Второе разбиение `mistakes/webview-injection.md` (130 КБ → 9 КБ)

Выделена отдельная большая тема «Стековая группировка»:
- `mistakes/webview-injection.md` (**9 КБ**) — только ядро injection: двойной звук, `toDataUrl`, IPC без спам-фильтра, mark-read throttling в фоне, MAX sidebar DOM
- `mistakes/webview-stack-grouping.md` (**125 КБ**, новый) — стековая группировка, ghost-items, `cleanupStack`, FIFO, race conditions

#### 5. Правило про `.claude/skills/` в CLAUDE.md

При создании новых skills или commands в `.claude/skills/` / `.claude/commands/` — **обязательно** добавить их в CLAUDE.md с описанием «что делает / когда вызывать / какие аргументы». Причина: без этого агент не узнает о существовании skill и не будет его использовать.

Сейчас `.claude/skills/` пустая (только `settings.json`). Правило действует на будущее.

#### 6. Обновлена документация

- `CLAUDE.md`: новые таблицы mistakes/ (3 файла), маркеры для регенерации, ссылки на новый тест и pre-commit проверку, правило `.claude/skills/`.
- `.memory-bank/README.md`: таблица mistakes/ обновлена, ссылки на все 4 автоматические защиты.
- `.memory-bank/common-mistakes.md`: индекс дополнен пунктом 2c — `webview-stack-grouping.md`.
- `.memory-bank/CHANGELOG.md`: запись v0.87.60 с мотивацией и списком изменений.
- `package.json`: новый скрипт `regen-claude-structure`, `featuresReferences.test.cjs` в `test`.

**Проверки**:
- `node src/__tests__/memoryBankSizeLimits.test.cjs` — **22/22 passed** ✅
- `node src/__tests__/featuresReferences.test.cjs` — **2/2 passed**, проверено 6 ссылок ✅
- `bash scripts/check-memory.sh` — всё зелёное ✅

**Порядок защиты теперь такой**:
1. Пишешь → pre-commit hook вызывает `check-memory.sh` → блокирует коммит при проблемах
2. `npm test` включает автотесты лимитов и dangling-refs → CI ловит что пропустил hook
3. `bash scripts/check-memory.sh` — ручная диагностика перед крупной сессией
4. `bash scripts/regen-claude-structure.sh` — после структурных изменений

---

### v0.87.59 — Автотест лимитов памяти + скрипт check-memory + CHANGELOG Memory Bank + разбиение webview-injection.md

**Зачем эта версия**: поставить **автоматическую защиту** от разрастания Memory Bank — чтобы история с `common-mistakes.md` 294 КБ (v0.87.56) и `features.md` 445 КБ (v0.87.58) не повторилась в новых файлах. Плюс превентивно разбить следующий кандидат — `mistakes/webview-injection.md` (165 КБ).

**Что сделано**:

#### 1. Новый автотест `src/__tests__/memoryBankSizeLimits.test.cjs`

Падает если какой-то `.md`-файл памяти перерос лимит:
- Любой `.md` в корне `.memory-bank/` → ≤ **100 КБ**
- Файл в `mistakes/` → ≤ **200 КБ**
- `common-mistakes.md` (индекс) → ≤ **10 КБ**

Дополнительно проверяет что все ссылки `.memory-bank/*.md` в CLAUDE.md указывают на существующие файлы.

Добавлен в `npm test` рядом с `fileSizeLimits.test.cjs`. Формат совместим с существующими тестами (CJS, `test()`/`assert()`).

#### 2. Новый скрипт `scripts/check-memory.sh`

Ручная проверка здоровья Memory Bank:
- Размеры всех файлов с цветовой индикацией (красный — превышен, жёлтый — > 80%, зелёный — в норме)
- Сверка версий в 4 местах (`package.json`, `package-lock.json`, `CLAUDE.md`, `features.md`)
- Устаревшие ссылки в CLAUDE.md
- Размер архива

Запуск: `npm run check-memory` (добавлен в `package.json → scripts`) или напрямую `bash scripts/check-memory.sh`.

#### 3. Новый файл `.memory-bank/CHANGELOG.md`

Журнал изменений **самой структуры** Memory Bank (не проекта): разбиения, новые правила, новые автотесты. Обновляется при любом структурном изменении. Шаблон записи прописан в файле.

Добавлен в CLAUDE.md и `.memory-bank/README.md` как активный файл.

#### 4. Разбиение `mistakes/webview-injection.md` 165 КБ на 2 файла

- `mistakes/webview-injection.md` (~130 КБ) — **ядро**: injection, IPC, DOM-селекторы (Telegram Web K, MAX sidebar), спам-фильтры, `executeJavaScript`, `toDataUrl` зависание, стековая группировка, ghost-items, двойной звук
- `mistakes/webview-navigation-ui.md` (~31 КБ) — **новый**: навигация между чатами (`location.hash`, `history.pushState`, `buildChatNavigateScript`), MAX SvelteKit (`scrollListContent`, `messageWrapper`, enrichment), sender-based dedup, ribbon CSS/UI в WebView-контексте (mouseenter, expandedByDefault, fade-out, FIFO deadlock, emoji regex)

#### 5. Обновлены индекс и документация

- `common-mistakes.md` индекс — добавлен пункт про `webview-navigation-ui.md`
- `CLAUDE.md` — новый файл в таблицах mistakes/, ссылки на автотест и скрипт в секции лимитов памяти
- `.memory-bank/README.md` — добавлен `CHANGELOG.md` в активные файлы, обновлена таблица mistakes/, добавлены ссылки на автотест/скрипт

**Тесты**: `node src/__tests__/memoryBankSizeLimits.test.cjs` — **21/21 passed**. `bash scripts/check-memory.sh` — всё зелёное.

**Зачем именно автотест, а не только скрипт**: агент забудет запускать скрипт вручную. Тест встраивается в `npm test` → падает автоматически на CI/pre-commit → защита работает без участия человека.

---

### v0.87.62 — ДИАГНОСТИКА: bubble-в-столбик в группах + нет скролла после send (только логи)

**Обратная связь пользователя** после v0.87.60 (2 скриншота):

✅ **Работает**:
- Неоновая анимация sent (1.2с вспышка) — видна
- Сообщения появляются в чате сразу после отправки
- В **приватных чатах** (Дугин Алексей Сергеевич, обычный user) — bubble нормальной ширины, текст в одну строку

❌ **НЕ работает**:
1. **В групповых чатах** исходящие msg снова в столбик (каждая цифра «1» на отдельной строке). Скриншот Автолиберти — 2 bubble с «1 1 1 1» вертикально.
2. **Входящие в тех же группах** тоже узкие — текст от «Kassa» вылезает в 5-6 строк из-за переноса слова `Новое уведомление: MAX Заголовок: Вячеслав` по слогам.
3. **Нет скролла к отправленному**: после send сообщение уходит ниже viewport, юзер видит стрелку ↓ но не сам bubble.

**Ключевое отличие**: приват (1-на-1) работает, группа — нет. v0.87.60 fix (минимальный plain-объект) исправил часть, но для групп остаётся. Корень не в отправке — затрагиваются и входящие в группе тоже.

**ГИПОТЕЗА** (требует проверки логами):
- В группах над bubble рисуется `.native-msg-author` (имя отправителя) + слева `.native-msg-avatar`. В приватах — нет.
- Эти дополнительные элементы внутри `.native-msg-group` (flex column) + `.native-msg-group-row` (flex row-reverse) могут вызвать **content-sized shrink** всей группы — bubble пытается `maxWidth: 65%`, но 65% от content-width схлопывается рекурсивно до минимума.

**Добавленные логи (код логики НЕ тронут)**:

1. **`bubble-width-diag`** в [src/native/components/MessageBubble.jsx](src/native/components/MessageBubble.jsx) — для каждого msg с коротким текстом (<40 символов, без media) через 50мс после mount логируется живой DOM:
   - `bubbleW` / `innerW` — ширина внешнего div и внутреннего bubble
   - `groupW` / `groupRowW` / `scrollW` — ширина цепочки parent'ов
   - `bubbleMaxWidth` / `bubbleMinWidth` — inline стили
   - `groupFlex` / `groupRowFlexDir`
   - `hasAuthor` / `hasAvatar` — наличие имени автора и аватарки в group-row

2. **`send-scroll-after`** в [src/native/modes/InboxMode.jsx](src/native/modes/InboxMode.jsx) `handleReplySend` — через 100мс после send:
   - `scrollBefore` / `scrollAfter` — `{ top, height, client, bottomGap }`
   - `deltaHeight` — насколько вырос контент (= высота нового bubble)
   - `deltaTop` — двинулся ли scrollTop (ожидаем 0, юзер ушёл вниз за viewport)
   - `expectedBehavior` — диагноз «stayed» vs «auto-scrolled»

**План расследования**:
1. Перезапустить приложение с v0.87.62
2. Открыть **групповой** чат (Автолиберти) с короткими сообщениями
3. Посмотреть логи `bubble-width-diag` — сверить `bubbleW / groupW / groupRowW / scrollW`
   - Если `groupW = 30-50px` а `scrollW = 900px` → подтверждение гипотезы про content-shrink
   - Если `hasAuthor=true && groupW<<scrollW` → причина в `.native-msg-author` + flex layout
4. Отправить сообщение → смотреть `send-scroll-after`
   - `deltaHeight > 0` и `deltaTop === 0` → подтверждение что нужно авто-скролл
5. **Точечный фикс в отдельной версии** по фактам из логов.

**Тесты**: 116 vitest ✅, E2E 17/17, UI 9/9 (только логи, логика не трогалась).

---

### v0.87.60 — FIX bubble «в столбик» после отправки + неоновая анимация sent

**Проблема 1 (скриншот пользователя)**: после фикса v0.87.58 сообщения стали появляться в чате сразу, но bubble был **ОЧЕНЬ узкий** — каждая буква на своей строке, timestamp `11:16` разбит на `11:` и `16`. 4 подряд отправленных `"1111"` выглядели как 4 тонких столбика из 4 цифр.

**Причина**: в v0.87.58 я передал в `emit('tg:new-message')` результат `mapMessage(result, chatId)`. У `mapMessage` есть ветки которые рассчитывают `senderId`/`fromId`/`peerId` и для исходящего MTProto Message эти поля могли быть объектами вместо строк → `messageGrouping.js` получал msg с невалидным `senderId` → группировка рассыпалась → `native-msg-group-row` не растягивался до 100% ширины scroll-контейнера → `maxWidth: 65%` у bubble оказался 65% от почти-нуля.

**Fix** в [main/native/telegramHandler.js](main/native/telegramHandler.js) `tg:send-message`: заменил `mapMessage(result)` на минимальный plain-объект с гарантированно правильными типами (строка / число / boolean), такими же как у входящих после `mapMessage`:
```js
const myUserId = (currentAccount?.id || 'me').replace(/^tg_/, '')
const msg = {
  id: String(result.id), chatId, senderId: myUserId,
  senderName: currentAccount?.name || '',
  text: text,  // из входного параметра
  entities: [], timestamp: (result.date || Date.now()/1000) * 1000,
  isOutgoing: true, isEdited: false, mediaType: null, groupedId: null,
  replyToId: replyTo ? String(replyTo) : null,
}
```

**Проблема 2 (запрос пользователя)**: «красивый неоновый эффект отправки».

**Fix**:
- [src/native/styles.css](src/native/styles.css) — `@keyframes native-msg-sent-glow` (1.2с): начальное `scale(0.95) opacity 0.5` → пик 20% `scale(1.02) + box-shadow 0 0 16px accent + 0 0 32px accent-glow` (двойная тень) → затухание.
- [src/native/components/MessageBubble.jsx](src/native/components/MessageBubble.jsx) — `className="native-msg-sent"` для исходящих с `timestamp < 2сек` от now.

**Тесты**: 116 vitest ✅, E2E 17/17, UI 9/9.

**Ожидает подтверждения пользователя**:
1. Bubble нормальной ширины (текст в одну строку)
2. Неоновая вспышка 1.2с при отправке

---

### v0.87.58 — FIX сообщение не появляется после отправки (emit tg:new-message для исходящих)

**Симптом**: юзер ввёл текст → «Отпр.» → поле очистилось, в логах `send-message OK messageId=X`, но сообщение **не появляется в ленте чата** до перезагрузки.

**100% доказательство из лога** (чат Автолиберти, ID `-272274113`, 11:16:21-24):
```
send-message START len=4 → send-message OK messageId=537483
send-message START len=4 → send-message OK messageId=537484
(дальше 2 минуты только unread-bulk-sync unread=0, НИ ОДНОГО tg:new-message)
```

**Корень**: Telegram MTProto **не дублирует** `UpdateNewMessage` для собственных исходящих сообщений — данные возвращаются прямо в response к `client.sendMessage()`. Наш handler `tg:send-message` брал только `result.id` и возвращал в renderer, игнорируя остальной объект Message. UI ждал события от listener'а входящих (`attachMessageListener`), но для своих же отправок оно не приходит.

**Fix** в [main/native/telegramHandler.js](main/native/telegramHandler.js) `tg:send-message` handler: после успешного `client.sendMessage()` сразу вызываем:
```js
const mapped = mapMessage(result, chatId)
mapped.isOutgoing = true
emit('tg:new-message', { chatId, message: mapped })
```

Store через handler `tg:new-message` (nativeStore.js:144) добавит сообщение в `messages[chatId]` и UI его отрендерит — как обычно делает для входящих.

**Тесты**: 116 vitest, E2E 17/17, UI 9/9.

**Ожидает подтверждения от пользователя**: реальная отправка сообщения в чате и появление его в ленте сразу.

---

### v0.87.57 — Внедрение промта правил работы в CLAUDE.md + разбиение features.md + правило «конфликт память vs код»

**Зачем эта версия**: закрепить в CLAUDE.md полный набор правил работы ИИ (4 принципа Karpathy, pipeline, критические запреты, правила проверки, формат ответа) и решить проблему раздутого `features.md` (445 КБ — не читался целиком).

**Что сделано**:

1. **Вставлен полный промт правил работы в CLAUDE.md** — разделы «🧠 Базовые принципы работы», «⚡ Правила выполнения», «🛑 Критические запреты», «🧪 Правила проверки», «💬 Формат ответа», «📋 Финальный блок отчёта», «✅ Что считать хорошим результатом». Промт адаптирован под новую структуру Memory Bank (`mistakes/`, `archive/`).

2. **Слиты критические запреты** — раньше в CLAUDE.md были короткие «Критические правила» (5 пунктов), в промте — длинные «Критические запреты» (7 пунктов). Объединены в единую секцию из 8 пунктов с причинами (`npm test` включает e2e, `postinstall` перезаписывает `.git/hooks/pre-commit`, и т.д.).

3. **Добавлено правило «🔄 Конфликт: память vs код»** (Совет 4 из предыдущей сессии). Если Memory Bank / auto-memory говорит одно, а реальный код другое — **доверять коду**, запись в памяти обновить. Пример: auto-memory ссылалась на `scripts/dev.js`, а реально в проекте `scripts/dev.cjs`.

4. **Разбит `features.md` 445 КБ** (Совет 2 из предыдущей сессии) на:
   - `features.md` (этот файл) — v0.87.40 → v0.87.58 (~100 КБ)
   - `archive/features-v0.87-early.md` — v0.87.0 → v0.87.39 (~140 КБ)
   - `archive/features-pre-v0.87.md` — v0.1.0 → v0.86.10 (~210 КБ)

5. **Ограничены «5 советов по улучшению»** (Совет 5 из предыдущей сессии) — даются только для содержательных задач (новая фича, рефакторинг, крупный фикс, архитектурное решение). Для тривиальных правок (typo, одна строка, переименование) советы не нужны — выглядело как избыток.

6. **Проверена полнота CLAUDE.md vs `.memory-bank/`** — добавлен `native-mode-plan.md` в секцию «Узкие/разовые файлы» в «Первом действии». Раньше он был только в финальной «Структуре памяти», из-за чего при чтении начала CLAUDE.md про него можно было забыть.

7. **Обновлены правила `.memory-bank/README.md`** — таблица файлов включает архивные features, обновлены лимиты и правила чтения.

**Журнал архивации**: см. `.memory-bank/archive/README.md`.

**Тесты**: только документация, код не менялся. `npm run lint` + `npm run test:vitest` — не требуются (правки в `.md`-файлах).

---

### v0.87.56 — Рефакторинг Memory Bank: разбиение `common-mistakes.md` + архив + лимиты файлов памяти

**Проблема**: `.memory-bank/common-mistakes.md` разросся до **294 КБ (2342 строки, 66 секций)**. Превышал лимит `Read` (256 КБ) — не читался целиком. Замедлял каждую сессию: токены тратились на сотни КБ истории вместо текущей задачи. Аналогичная проблема у `features.md` (437 КБ) — отложено на следующий рефакторинг.

**Что сделано**:

#### 1. Разбиение `common-mistakes.md` на темы

Создана подпапка `.memory-bank/mistakes/` с 4 тематическими файлами:

| Файл | Размер | Темы |
|---|---|---|
| `mistakes/native-scroll-unread.md` | ~17 КБ | Native скролл, счётчик, markRead, IntersectionObserver |
| `mistakes/webview-injection.md` | ~165 КБ | DOM, спам, селекторы мессенджеров, навигация |
| `mistakes/notifications-ribbon.md` | ~50 КБ | Кастомные уведомления, ribbon BrowserWindow |
| `mistakes/electron-core.md` | ~52 КБ | Electron, IPC, Settings, AI, авто-ответ |

`common-mistakes.md` в корне стал **индексом на 5 КБ** — ссылки на темы + правила чтения.

#### 2. Создана папка `.memory-bank/archive/`

Для неактуальных файлов и секций. **Правило**: агент НЕ читает архив по умолчанию, только по явной просьбе пользователя.

В архив перенесено:
- `archive/2026-04-common-mistakes-resolved.md` — секции ⚪ ИСТОРИЯ (РЕШЕНО в v0.87.51) из старого `common-mistakes.md` (строки 79–150, 199–234). Сохранены как учебный пример: «почему локальная оптимизация серверного значения через дублирующее поле `groupedUnread` породила 5 регрессий подряд и пришлось откатить».

Правила архивации, именование (`YYYY-MM-<имя>.md`) и журнал — в [`.memory-bank/archive/README.md`](./archive/README.md).

#### 3. Сжатие `native-scroll-diagnostics-handoff.md`

Был **36 КБ (539 строк)** — содержал 15 подробных секций хронологии отладки v0.87.40 → v0.87.54, дублирующих `git log` и features.md Changelog. Сжат до **~13 КБ**: хронология свёрнута в таблицу «Версия / Симптом / Корневая причина» + 3 ключевых урока. Активная часть (цепочки логирования, инструкции для следующего ИИ) сохранена полностью.

#### 4. Обновлена документация

- [`CLAUDE.md`](../CLAUDE.md): добавлены секции «Детализация ловушек — mistakes/» и «Архив — НЕ читать по умолчанию»; таблица «Обновление версии» расширена до **4 мест** (добавлен `package-lock.json`); добавлены таблицы «Опасные команды» (npm test, npm start, npm install, git reset, --no-verify, git add -A) и «Безопасные команды проверки» (lint, test:vitest, git status).
- [`.memory-bank/README.md`](../.memory-bank/README.md): переписан под новую структуру — таблицы активных файлов, `mistakes/`, `archive/`, лимиты размеров.

#### 5. Синхронизация версий

`package-lock.json` отставал на 44 патча (был 0.87.11 при package.json=0.87.55). Подтянут до 0.87.56 вместе с остальными. Теперь все 4 места версии согласованы.

**Правила для будущего** (прописаны в CLAUDE.md и `.memory-bank/README.md`):
- Файл в `.memory-bank/` > 100 КБ → разбить на подпапку + индекс
- Файл в `mistakes/` > 200 КБ → разбить по подтемам
- Секция `⚪ ИСТОРИЯ (РЕШЕНО)` + 2 недели стабильности → перенести в `archive/`
- `archive/` не читается по умолчанию — `Grep`/`Glob` его исключают

**Зачем это нужно**: для новой сессии ИИ контекст — это бюджет. Раньше 294 КБ `common-mistakes.md` + 437 КБ `features.md` + 36 КБ handoff = ~760 КБ только на "что было раньше". После рефакторинга текущей части: индекс 5 КБ + нужная тема (17–165 КБ) + сжатый handoff 13 КБ. Остальные темы и архив читаются только по делу.

**Что НЕ тронуто в этой версии** (на будущее):
- `features.md` 437 КБ — следующая задача (вынести старый Changelog в `archive/features-history.md`)
- `mistakes/webview-injection.md` 165 КБ — внутри лимита 200 КБ, но близко к границе

**Тесты**: структурные, без изменений кода. Линт не запускал — правки только в документации.

---

### v0.87.55 — Диагностика отправки + FLOOD_WAIT throttle + console-message API совместимость

**Три задачи в одном коммите**:

#### 1. Диагностика отправки сообщений (баг: «ввёл текст → Отпр. → ничего»)

Пользователь на скриншоте: введено «йыйый», нажата кнопка «Отпр.» — текст не отправляется, UI молчит. В логах **ни одного** события про попытку отправки.

**Причина** — нет диагностики. В `tg:send-message` handler и в `handleReplySend` не было логов ошибки, при неудаче пустой `return { ok: false, error: ... }` просто игнорировался.

**Fix**:
- [main/native/telegramHandler.js](main/native/telegramHandler.js) `tg:send-message` — логи на всех этапах: `send-message START`, `hasEntity`, `send-message OK/ERROR` с текстом ошибки и типом
- [src/native/modes/InboxMode.jsx](src/native/modes/InboxMode.jsx) `handleReplySend` — логи `send-skip`, `send-start`, `send-result { ok, error }`, `send-throw` + **toast с ошибкой** + **возврат текста в поле** (раньше терялся)

Теперь юзер видит причину (типа «FLOOD_WAIT», «PEER_ID_INVALID», «Не подключён»), а текст не пропадает.

#### 2. FLOOD_WAIT throttle для аватарок

**Проблема**: `loadAvatarsAsync` делал 196 запросов `GetFullUser`/`GetFullChannel` подряд без задержки → Telegram банил сессию на 26 секунд.

**Fix** в [main/native/telegramHandler.js](main/native/telegramHandler.js) `loadAvatarsAsync`:
- Новый helper `throttledInvoke(reqFactory)` — не чаще 1 запроса в 200мс (= 5 RPS)
- На FLOOD_WAIT ошибку — парсит секунды из сообщения, ждёт N+1 секунд, ретрай
- Stats `floodWaits` счётчик в логе для мониторинга

Применено к обоим `GetFullChannel` и `GetFullUser` внутри `loadAvatarsAsync`. `downloadProfilePhoto` не throttled т.к. это прямая загрузка, не RPC.

#### 3. console-message Electron 41+ совместимость

**Проблема**: в Electron 41 старые поля `e.message`, `e.level`, `e.sourceId` помечены deprecated. Новый API даёт объект `e.details.{message, level, sourceId, lineNumber}` где `level` — строка (`'info'`, `'warning'`, `'error'`, `'verbose'`), а не число (0-3).

**Fix** (backward-compatible) в [src/utils/consoleMessageHandler.js](src/utils/consoleMessageHandler.js):
```js
const d = e.details || e
const msg = d.message ?? e.message
const rawLevel = d.level ?? e.level
const lvl = typeof rawLevel === 'number' ? rawLevel
  : rawLevel === 'warning' ? 1 : rawLevel === 'error' ? 2
  : rawLevel === 'info' ? 0 : rawLevel === 'verbose' ? 3 : -1
```

Работает и со старым API (числа), и с новым (строки). Deprecation warning в консоли исчезнет.

**Итого**: 116 vitest ✅, E2E 17/17, UI 9/9.

### v0.87.54 — Синий неон last-read + подтверждение 8 пунктов v0.87.51

**Два изменения в одном коммите**:

#### 1. Жёлтая подсветка «последнее прочитанное» → синий неон (accent #2AABEE)

Ранее (`src/native/styles.css`):
```css
@keyframes native-last-read-glow {
  0% { box-shadow: 0 0 0 0 rgba(255,200,80,0.8); background: rgba(255,200,80,0.12); }
  ...
}
```
Жёлтый выбивался из общего стиля (Telegram-blue UI). Пользователь: «замени на синий неон, красивый стильный, по общему стилю».

Сейчас: `rgba(42,171,238, ...)` (accent) — с двойной тенью (близкая + дальняя) для более выразительного неонового эффекта + тонкий outline 1px на границе бубла. Длительность 3.5с без изменений.

#### 2. Подтверждено пользователем 24.04.2026 — 8 пунктов v0.87.51+

- ✅ Прогрессия счётчика 23→20→15→...→0 **по ходу** прокрутки (не скачком в конце)
- ✅ Альбом из N фото даёт +N в бейдже (сырой Telegram API)
- ✅ Бейдж в списке и на стрелке одинаковые (оба `chat.unreadCount`)
- ✅ markRead в реальном времени каждые 0.3сек
- ✅ «Новые сообщения» divider при открытии чата (жёлтая плашка)
- ✅ Вариант A скролла — на первое непрочитанное при открытии чата
- ✅ Синий неон last-read 3.5с (после смены цвета)
- ✅ Индикатор новых сообщений при скролле назад (стрелка с бейджем)

#### 3. Чистка памяти
Устаревшие записи про `groupedUnread` (v0.87.45-50) в `common-mistakes.md` помечены как **ИСТОРИЯ (РЕШЕНО в v0.87.51)**. Не актуальные правила, но сохранены как учебный пример «почему локальные оптимизации серверного значения приводят к регрессиям».

### v0.87.53 — badge-state лог: сброс prevUnread при смене activeChatId (чистка артефакта)

**Проблема**: при переключении с чата A (unread=0) на чат B (unread=13) в логах появлялась строка:
```
badge-state title=Geely unread=13 prevUnread=0
```
Это создавало ЛОЖНУЮ иллюзию что счётчик вырос с 0 до 13 (будто новые msg пришли). На деле в Geely unread всё время был 13, а 0 — это значение от ПРЕДЫДУЩЕГО чата, которое хранилось в `prevUnreadRef`.

**Причина** (в [InboxMode.jsx:82](src/native/modes/InboxMode.jsx#L82)):
`prevUnreadRef` — useRef — хранил `unread` активного чата между рендерами. При смене activeChatId не сбрасывался. Сравнивал «unread чата Geely» с «unread предыдущего чата» — дельта != 0 → лог пишется.

**Fix**: добавлен `prevUnreadChatIdRef` — запомнить id чата для которого prevUnread валиден. При смене activeChatId `prevUnreadRef.current = null`. Первый badge-state для нового чата пишет `prevUnread=null` — сразу видно что это переключение, не скачок.

**Зачем**: для корректных будущих расследований. Когда пользователь говорит «счётчик скакнул с 0 на 13» — мы по логам должны видеть: **скачок внутри чата** или **переключение на чат с другим значением**. Без фикса разделить два случая нельзя.

**Проверка v0.87.52 (завершена по логам)**: по awk-анализу всех `badge-state` / `store-unread-sync` в логе **ни одного** случая роста unread внутри одного chatId больше чем на +1/+2. Все инкременты — реальные новые сообщения (38 `emit tg:new-message` в логе). Бага с растущим счётчиком в одном чате нет — только артефакт лога, который теперь починен.

**Тесты**: логика косметическая (чистка лога, не UI), отдельных тестов нет. Регресии не трогаем.

**Итого**: 116 vitest ✅, E2E 17/17, UI 9/9.

### v0.87.52 — FIX newBelow залипает между чатами (стрелка 41 вместо 8)

**Проблема** (скриншот пользователя, чат Автопоток): в списке бейдж отсутствует (unreadCount=0), а на стрелке вниз показывается **41**. Это разное число за один и тот же чат.

**100% доказательство из лога**:
```
08:55:20  new-below chat=Geely       added=33 prevLastId=17898 nowLastId=17933
08:55:37  new-below chat=Автопоток   added=8  prevLastId=22312 nowLastId=22321
```
33 (Geely) + 8 (Автопоток) = **41** — точное совпадение со скриншотом.

**Корневая причина**:
- `newBelow` — useState в InboxMode — **не привязан к activeChatId**
- При смене чата state не сбрасывается
- `useNewBelowCounter` сравнивает prevLastId с nowLastId; при смене чата эти id принадлежат разным чатам → разные → добавляется `added`

**Зачем исправляем** (для чего):
- Бейдж на стрелке = «сколько новых сообщений ниже тебя». Если юзер только что открыл чат — он ЕЩЁ НИЧЕГО не видел, значит эта цифра должна считаться с нуля **в этом чате**.
- «Наследованное» число от предыдущего чата — бессмыслица для юзера. Он видит 41, листает вниз, их там нет — UX сломан.

**Fix**:
1. `src/native/hooks/useNewBelowCounter.js` — принимает `chatId`. При его смене сбрасывает `prevLastIdRef = nowLastId` и вызывает `onSkip({ reason: 'chat-switch' })`. Не вызывает `onAdded`.
2. `src/native/modes/InboxMode.jsx` — в useEffect по смене `store.activeChatId` добавлен `setNewBelow(0)` (рядом с сбросами `readSeenRef`, `maxEverSentRef` и т.д.). Передаёт `chatId: store.activeChatId` в хук.

**Тесты** (+2 в `useNewBelowCounter.vitest.jsx`):
1. ⭐ РЕГРЕССИЯ v0.87.52: смена chatId НЕ считается как «новое снизу» (`onAdded` не вызван, `onSkip { reason: 'chat-switch' }`)
2. После смены chatId новые msg в НОВОМ чате считаются нормально (isolation)

Также в `InboxMode.vitest.jsx` smoke-тест: rerender при смене chatId не падает.

**Итого**: 116 vitest ✅ (было 113), E2E 17/17, UI 9/9.

### v0.87.51 — Прогрессия счётчика в реальном времени + удалён groupedUnread

**Проблема до этого (от пользователя)**:
- Бейдж показывает 23 — юзер листает — бейдж стоит на 23 — в самом конце внезапно падает в 0.
- Нет прогрессии 23→20→15→10→0 по ходу прокрутки.
- Альбом из 5 фото должен давать +5 к счётчику (как считает Telegram API), а не +1.

**Три изменения в одном коммите**:

#### 1. Прочтение «msg появился → прочитан» ([useReadOnScrollAway.js](src/native/hooks/useReadOnScrollAway.js))

Переписан с двух IntersectionObserver (seen через центр + read при уходе выше) на **один** с `threshold: 0` + initial-guard.

- `threshold: 0` — observer срабатывает когда msg хоть частично в viewport
- **Initial-guard**: первый callback после observe() игнорируется — если msg УЖЕ в viewport при открытии чата → не помечаем (защита от mass-read на open).
- Последующий `isIntersecting=true` → `onRead()` один раз.

Почему это лучше v0.87.47 (центр viewport):
- Observer с `rootMargin -49% -49%` тротлит callbacks (спека). При быстром скролле msg пролетает мимо центральной полосы 2% без регистрации.
- `threshold: 0` ловит **любое** появление — работает при любой скорости.

Новые логи:
- `read-initial-visible { msgId }` — msg виден при открытии (не помечаем)
- `read-initial-hidden { msgId }` — msg скрыт при открытии (ждём скролл)
- `read-fire { msgId }` — помечен

#### 2. Батч markRead 1500мс → 300мс ([InboxMode.jsx:291](src/native/modes/InboxMode.jsx#L291))

В `readByVisibility` таймер копит прочитанные msg id и отправляет пачкой. Было 1500мс (1.5 секунды). Стало 300мс.

Эффект: за секунду прокрутки 3-4 отправки на сервер → сервер возвращает уменьшающийся `unread` через `tg:chat-unread-sync` → UI показывает прогрессию 23→20→15→...→0.

Риск FLOOD_WAIT: минимальный, Telegram переваривает такой темп.

#### 3. Удалён `groupedUnread` — UI показывает сырой `unreadCount` от Telegram API

Причина отката v0.87.45-50:
- `groupedUnread` (локальная группировка альбомов как 1 карточка) создавала **рассинхрон** с сервером: UI показывал 23 когда сервер уже 0, затыкался до следующего recompute.
- Пользователь явно попросил: «показывай сколько передаёт API Telegram» — альбом из 5 фото = 5 в бейдже, как считает MTProto.
- Это то поведение которое было до v0.87.45. Возврат к нему убирает целый класс багов.

**Удалены**:
- Handler `tg:grouped-unread` в `nativeStore.js` + action `recomputeGroupedUnread`
- Clamp в handlers `tg:chat-unread-sync` / `tg:unread-bulk-sync` (из v0.87.50)
- IPC `tg:recompute-grouped-unread` в [main/native/telegramHandler.js](main/native/telegramHandler.js)
- Триггеры recompute на `window.focus` и после session restore в `InboxMode.jsx`
- Переменная `activeUnreadCards` в `InboxMode.jsx` (кнопка стрелки)
- Чтение `chat.groupedUnread` в `ChatListItem.jsx`

**Тесты**:
- `useReadOnScrollAway.vitest.jsx` полностью переписан — 7 тестов под новую логику (threshold=0 + initial-guard)
- `nativeStore.vitest.jsx` очищен от groupedUnread + добавлены 3 новых теста подтверждающих новое поведение
- `ChatListItem.vitest.jsx` — groupedUnread тесты заменены на «UI показывает unreadCount от API»
- `MediaAlbum.vitest.jsx` — мок IntersectionObserver адаптирован под один observer (initial hidden → visible)

