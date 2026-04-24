# Реализованные функции — ChatCenter

## Текущая версия: v0.87.63 (24 апреля 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.87.40 → v0.87.63). Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

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

### v0.87.62 — UI: bubble content-size до 75% row + auto-scroll после send + возврат к единой логике для всех типов чатов

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

**Итого**: 113 vitest ✅, E2E 17/17, UI 9/9.

### v0.87.50 — FIX бейдж застревал на 23 после прочтения (clamp groupedUnread в sync-handlers)

**Диагностика из v0.87.49 логов дала 100% картину**. Chat Geely EX5 EM-i, 18:38:47-48:

```
18:38:47 bottom-state-change prev=false curr=true bottomGap=59   ← юзер докатил
18:38:47 force-read-schedule lastId=17898 unread=23 atBottom=true ← таймер 400мс
18:38:47 force-read-fire lastId=17898                             ← таймер стрельнул
18:38:47 [tg] mark-read OK maxId=17898                            ← GramJS успех
18:38:48 [tg] UNREAD SYNC Telegram сервер=0                       ← СЕРВЕР вернул 0
18:38:48 store-unread-sync unread=0 active=true                   ← store получил
18:38:48 badge-state unread=0 grouped=23 badge=23 prevGrouped=23  ← БАГ в UI
```

Всё работало КРОМЕ одного: `chat.groupedUnread=23` (прошлый recompute) не обнулялся при получении свежего unreadCount.

**Корневая причина** (доказано по коду):
- [nativeStore.js:228](src/native/store/nativeStore.js#L228) handler `tg:chat-unread-sync` обновлял ТОЛЬКО `unreadCount`
- [ChatListItem.jsx:26](src/native/components/ChatListItem.jsx#L26) использует `badgeCount = chat.groupedUnread ?? chat.unreadCount`
- Следствие: сервер 0 → unreadCount 0, но `groupedUnread` остался 23 → `badgeCount = 23 ?? 0 = 23`. Залипание.

**Опровергнутые гипотезы** (через логи v0.87.49):
- Гипотеза A (useReadOnScrollAway не помечает последние msg) — `force-read-fire` сработал идеально для `lastId=17898`
- Гипотеза B (scrollTop прыгал) — ни одного `scroll-anomaly`, `bottom-state-change` только 1 раз false→true
- Проблема в API / GramJS / MTProto — нет, `UNREAD SYNC сервер=0`

**Единственная истинная причина**: рассинхрон между `unreadCount` и `groupedUnread` в store handlers.

**Fix — точечный, 2 handler в одном файле** ([nativeStore.js](src/native/store/nativeStore.js)):

```js
// tg:chat-unread-sync + tg:unread-bulk-sync
const nextGrouped = typeof c.groupedUnread === 'number'
  ? Math.min(c.groupedUnread, unreadCount)
  : c.groupedUnread
return { ...c, unreadCount, groupedUnread: nextGrouped }
```

**Семантика clamp'а**: `grouped` не может быть больше чем MTProto-сообщений которые сервер считает непрочитанными. Если сервер говорит 0 → `grouped=min(23,0)=0`. Если сервер говорит 5 < grouped=9 → `grouped=5`. Если сервер говорит 10 > grouped=3 → grouped остаётся 3 (пришли новые, но мы не знаем их структуру — ждём recompute).

**Тесты** (+5 в [nativeStore.vitest.jsx](src/native/store/nativeStore.vitest.jsx)):
1. РЕГРЕССИЯ Geely: `unread=0` после `grouped=23` → `grouped=0`
2. `unread=5 < grouped=9` → `grouped=5` (clamp)
3. `unread=10 > grouped=3` → `grouped=3` не увеличивается (ждём recompute)
4. bulk-sync для 2 чатов → оба clamp'ятся
5. Если `groupedUnread` был undefined — sync не создаёт (остаётся undefined, fallback на unreadCount)

**Итого**: 127 vitest (было 122), E2E 17/17, UI 9/9.

### v0.87.49 — ДИАГНОСТИКА: счётчик непрочитанных застревает после прокрутки до конца (только логи)

**Проблема** (скриншоты пользователя, чаты «Ассоциация РОАД», «Автовоз», «АвтоБизнес»): юзер пролистывает чат до конца — счётчик непрочитанных остаётся на N (чаще 1-3), не становится 0. В списке чатов бейдж не обновляется.

**Статус**: код логики НЕ меняется. Добавлены только диагностические логи чтобы получить 100% картину причин. После воспроизведения и анализа — точечный фикс в следующей версии.

#### ДОКАЗАНО по коду (без новых логов)

**Факт 1** — [nativeStore.js:228-234](src/native/store/nativeStore.js#L228) handler `tg:chat-unread-sync` обновляет ТОЛЬКО `unreadCount`, поле `groupedUnread` не трогает. То же в `tg:unread-bulk-sync`.

**Факт 2** — [ChatListItem.jsx:26](src/native/components/ChatListItem.jsx#L26) — `badgeCount = typeof chat.groupedUnread === 'number' ? chat.groupedUnread : chat.unreadCount`. Приоритет у `groupedUnread`.

**Следствие**: если `chat.groupedUnread=3` было установлено recompute'ом, а потом сервер прислал `unread=0` — `groupedUnread` остаётся 3, `badgeCount=3`. Бейдж застрял до следующего `recomputeGroupedUnread` (вызывается только по window.focus / session restore, НЕ после markRead).

#### НЕ доказано — требует новых логов

**Гипотеза B**: `scrollTop` прыгает с низа (bottomGap=0) обратно вверх (bottomGap=40000+) за ~800мс без видимой причины в лог (17:22:25 в чате Автовоз). Если это правда — `atBottom` становится false → `useForceReadAtBottom` useEffect cleanup убивает 400мс таймер ДО того как он стрельнет.

**Гипотеза A**: последние 1-3 msg остаются в viewport до конца прокрутки и никогда не проходят «фазу 2» (ушёл выше viewport) в `useReadOnScrollAway`. Они не попадают в batch → markRead уходит с maxId предпоследнего msg → сервер оставляет unread=N.

#### Добавленные логи (v0.87.49)

1. **`useForceReadAtBottom`** (4 события) — [useForceReadAtBottom.js](src/native/hooks/useForceReadAtBottom.js):
   - `force-read-schedule { chatId, lastId, unread, maxEverSent, atBottom }` — таймер 400мс поставлен
   - `force-read-skip { reason: not-at-bottom/no-chat/no-messages/unread-zero/no-last-id }` — effect вышел раньше
   - `force-read-skip-guard { lastId, maxEverSent }` — lastId ≤ watermark
   - `force-read-fire { chatId, lastId, unread }` — таймер стрельнул, шлём markRead
   - `force-read-cleanup { chatId, lastId, atBottomAtSetup, unreadAtSetup }` — useEffect cleanup (dep changed)

2. **`bottom-state-change`** ([InboxMode.jsx handleScroll](src/native/modes/InboxMode.jsx)) — при переходе nearBottom true↔false: `{ prev, curr, scrollTop, scrollHeight, clientHeight, bottomGap }`

3. **`scroll-anomaly`** (InboxMode handleScroll) — если |ΔscrollTop|>500px за <200мс: `{ dtMs, deltaTop, deltaHeight, prevTop, currTop, reasonGuess: height-changed(layout-shift/load-older) | programmatic-scroll }`

4. **`badge-state`** (InboxMode useEffect) — при смене `activeChat.unreadCount` или `activeChat.groupedUnread`: `{ chatId, title, unread, grouped, badge, prevUnread, prevGrouped }`

#### План диагностики — шаги

1. Перезапустить приложение (v0.87.49).
2. Открыть любой чат с unread > 0.
3. Пролистать до конца.
4. Смотреть бейдж. Если застрял:
   - Проверить `force-read-*` — был ли таймер поставлен, стрельнул ли, был ли cleanup.
   - Проверить `bottom-state-change` — менялся ли `atBottom` с true на false.
   - Проверить `scroll-anomaly` — был ли прыжок scrollTop после достижения низа.
   - Проверить `badge-state` — какие значения `unread/grouped/badge` на момент застревания.

Эти 4 точки закрывают все слепые пятна. После получения логов → точечный фикс причины.

#### Тесты
- 122 vitest passed (без изменений, логи не трогают логику)
- E2E 17/17, UI 9/9

### v0.87.48 — FIX скролл уезжал в середину при открытии чата (гонка load-older vs initial-scroll)

**Проблема** (скриншот пользователя, чат АвтоБизнес): открыл чат → уехало в середину, далеко от последнего сообщения. Юзер ничего не скроллил.

**Точная цепочка из логов** (16:38:22-24):
```
chat-open top=0 → store-load-messages → store-tg-messages messages=50 height=17103
initial-schedule → initial-target top=16180 bottomGap=406   ← правильно встал у низа
load-older-trigger prevHeight=16097 ← АВТО-триггер т.к. top=0 < 100 в handleScroll!
store-load-older → результат: +50 старых сверху → messages=100, height=35391
chat-state top=34468 bottomGap=406   ← browser scroll anchoring подвинул корректно
load-older-apply top=19294           ← НАША формула перебила (откатила на 15174px вверх)
```

**Корневая причина** — гонка в `handleScroll`:
- Авто-триггер `load-older` срабатывает при `scrollTop < 100`. При открытии чата `scrollTop=0` (до initial-scroll) → триггерится сразу.
- `prevHeight = 16097` записывается **до** initial-scroll.
- Parallel initial-scroll переставляет `scrollTop=16180`, высота 17103.
- Приходит load-older → DOM растёт до 35391 → **browser scroll anchoring** (CSS Scroll Anchoring, Chrome 56+, вкл. по умолчанию) автоматически корректирует scrollTop на 34468.
- Через `setTimeout(100)` наш код делает `scrollTop = 35391 - 16097 = 19294` — **перебивает правильную коррекцию**.
- Итог: юзер на середине чата.

**Fix (Вариант A)**:

1. `src/native/hooks/useInitialScroll.js` — экспонирует `doneRef`:
```js
return { doneRef }
```

2. `src/native/modes/InboxMode.jsx` — блокируем авто-load-older пока `doneRef.current !== activeChatId`:
```js
if (initialScrollDoneRef.current !== store.activeChatId) {
  scrollDiag.logEvent('load-older-skip-initial', { scrollTop: el.scrollTop, chatId: store.activeChatId })
  return
}
```

Авто-load-older теперь ждёт пока initial-scroll поставит scrollTop в финальное положение. Пользователь сам решит загрузить старые — скроллом вверх.

**Тесты**:
- `useInitialScroll.vitest.jsx` (новый файл, 5 тестов) — контракт `doneRef`: null при отсутствии чата/loading/messagesCount=0; устанавливается в activeChatId после initial-scroll
- `InboxMode.vitest.jsx` +1 регрессионный тест — `loadOlderMessages` НЕ вызывается при открытии чата даже если scrollTop=0

**Итого**: 122 vitest ✅ (было 116), E2E 17/17, UI 9/9.

### v0.87.47 — FIX счётчик не уменьшался на длинных постах (ratio 0.95 → центр viewport)

**Проблема** (скриншот пользователя, чат «Автовоз»): юзер прокрутил **5+ постов** вниз — счётчик застыл на 16, не меняется. В логах за 15+ секунд активной прокрутки (top 24857→31120, 6263px прокрутки) **ни одного** события `read-scrolled-away` / `read-batch-send`. `store-unread-bulk-active` от сервера стабильно возвращал 28 — фронт ничего не пометил.

**Причина в [useReadOnScrollAway.js:24](src/native/hooks/useReadOnScrollAway.js#L24) (v0.87.43)**:
```js
if (entry.intersectionRatio >= 0.95 && !seenRef.current) { seenRef.current = true }
```
Пороги 0.95 ("msg почти полностью в viewport") **физически недостижим** для длинных постов: в Автовозе посты ~800px, viewport 570px → max ratio = 570/800 ≈ **0.71**. seenRef никогда не становится true → фаза 2 не срабатывает → `onRead` не вызывается.

**Пользователь так описал баг**: «ты че хуйню пишешь, я постов 5 пролистал». Счётчик не уменьшался СКОЛЬКО БЫ ни скроллил.

**Решение — Вариант 2 (Telegram-style)**: логика «msg пересёк центр viewport»:

```js
const seenObs = new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting && !seenRef.current) {
    seenRef.current = true
    onSeen?.()
  }
}, { root, rootMargin: '-49% 0px -49% 0px', threshold: 0 })

const readObs = new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting || !seenRef.current || readRef.current) return
  const rootTop = entry.rootBounds?.top ?? 0
  if (entry.boundingClientRect.bottom < rootTop) {
    readRef.current = true
    onRead?.()
  }
}, { root, threshold: 0 })
```

`rootMargin: '-49% 0 -49% 0'` превращает root в тонкую полосу 2% высоты в самом центре viewport. Любой msg, прошедший через центр экрана, триггерит isIntersecting=true для seen-observer — **независимо от своего размера**. Длинный пост → проходит через центр → seen. Прокрутил мимо вверх → read.

**Сравнение**:
| Версия | Условие seen | Длинный msg (800px) | Старый баг (open = mass read) |
|--------|--------------|---------------------|-------------------------------|
| до v0.87.43 | ratio ≥ 0.15 | ✅ | ❌ (пометит всё что в viewport) |
| v0.87.43 | ratio ≥ 0.95 | ❌ (недостижимо) | ✅ |
| **v0.87.47** | msg пересёк центр | ✅ | ✅ (только 1-2 msg в центре) |

**Тесты**: полностью переписаны `useReadOnScrollAway.vitest.jsx` — **13 сценариев** (было 9). Главный — "v0.87.47 РЕГРЕССИЯ: длинный msg (height > viewport) помечается read". Также адаптирован мок в `MediaAlbum.vitest.jsx` под два observer.

**Итого**: 116 vitest ✅ (было 111), E2E 17/17, UI 9/9.

### v0.87.46 — FIX расхождение бейджей: список чатов 16, стрелка 28

**Проблема** (скриншот пользователя, чат «Автовоз»): В списке чатов бейдж **16**, а внутри чата на кнопке-стрелке ↓ — **28**. Одновременно. Один и тот же чат.

**Причина**: В v0.87.45 ввели `chat.groupedUnread` (альбом = 1 карточка) и переключили `ChatListItem` на него. Но в `InboxMode.jsx` бейдж стрелки остался на старом `activeChat.unreadCount` (= сырое MTProto-число, альбом = N отдельных msg). Список показывал карточки (16), стрелка — сообщения (28).

**Фикс в `src/native/modes/InboxMode.jsx`** — добавлена переменная `activeUnreadCards`:

```js
const activeUnread = activeChat?.unreadCount || 0  // для логики (findFirstUnread, markRead)
const activeUnreadCards = (typeof activeChat?.groupedUnread === 'number')
  ? activeChat.groupedUnread
  : activeUnread  // для UI-бейджа и условия показа стрелки
```

Все 4 места использования в кнопке-стрелке (условие показа, `title`, бейдж `>99`, контент бейджа) переключены на `activeUnreadCards`. `activeUnread` (MTProto) остался для `findFirstUnreadId`, `markRead maxId`, `scrollDiag.logEvent` — там нужно сырое число сообщений.

**Правило на будущее записано в common-mistakes.md**: когда вводишь новое поле для UI — найди ВСЕ места где старое отображается и обнови синхронно.

### v0.87.45 — «Карточки» вместо сообщений (альбомы = 1) + сброс unreadCount из кэша

**Проблема** (из жалобы пользователя): «по факту одно сообщение» ≠ `unreadCount: 9`. В Telegram альбом из 9 фото = **1 карточка в ленте**, но MTProto возвращает 9 отдельных сообщений → бейдж показывал 9 вместо 1.

**Решение — «Вариант 2»** (выбран пользователем: «Для МАКСИМАЛЬНОЙ точности с первого запуска — Вариант 2, не брать не чего из кэша»):

**Main-процесс** (`main/native/telegramHandler.js`):

1. Новый IPC handler `tg:recompute-grouped-unread`:
   - Берёт `fetchAllUnreadUpdates()` → фильтрует `unreadCount > 0`
   - Для каждого чата: `client.getMessages(entity, { limit: min(unread, 30) })`
   - Группирует по `groupedId`: `new Set(groupedId)` + `singles` (msgs без groupedId)
   - `grouped = groups.size + singles` — сколько карточек в ленте
   - Parallel batch = 5 + 150ms delay между batches (защита от FLOOD_WAIT)
   - Emit `tg:grouped-unread` с `{ [chatId]: { server, grouped } }`

2. Сброс `unreadCount` из кэша:
   - `saveChatsCache()` теперь сохраняет `unreadCount: 0` — счётчик всегда свежий с сервера
   - `tg:get-cached-chats` при загрузке тоже форсит `unreadCount: 0`
   - Раньше после рестарта показывался устаревший счётчик из `tg-cache.json`

**Renderer** (`src/native/store/nativeStore.js`):

- Новый handler `tg:grouped-unread` — обновляет `chat.groupedUnread` + `chat.unreadCount` по updates
- Новый action `recomputeGroupedUnread()` → IPC `tg:recompute-grouped-unread`
- Чаты без update не затираются (сохраняют свой `groupedUnread`)

**UI** (`src/native/components/ChatListItem.jsx`):

- `badgeCount = typeof chat.groupedUnread === 'number' ? chat.groupedUnread : chat.unreadCount`
- При наличии `groupedUnread=1` показывает 1 (а не 9 альбомных msgs)

**Триггеры пересчёта** (`src/native/modes/InboxMode.jsx`):

1. После первого `tg:chats` (session restore) через 800мс — даём main собрать unreadUpdates
2. На `window.focus` — рядом с `rescanUnread()`

**Тесты**: +4 vitest в `nativeStore.vitest.jsx` + 3 в `ChatListItem.vitest.jsx` = **111 vitest ✅** (было 104).

**Проверка кэша на другие источники неточности**: просмотрены `tg-cache.json`, `localStorage chat-messages:*`, `ai-draft:*`, `user_auth` — только `tg-cache.json.unreadCount` был staleness-источником (исправлено). Сообщения в `chat-messages:*` не содержат `unreadCount`.

### v0.87.44 — FIX «было 7, стало 1 за секунду» — default atBottom=true при открытии

**Проблема (из логов v0.87.43)**: открыл чат с 7 непрочитанными, не трогал — через 400мс markRead(maxId=12887, последнее msg) → сервер: 7→1.

**Причина** в `InboxMode.jsx`:
```js
const [atBottom, setAtBottom] = useState(true)  // ← default true!
```

`atBottom` меняется только в `handleScroll`. При открытии чата scroll event ещё не произошёл → `atBottom=true` (stale default).

`useForceReadAtBottom` при `atBottom=true` + `unread > 0` → через 400мс отправляет markRead(lastMsgId) → сервер помечает всё до последнего → осталось 1 (только тот что пришёл пока читали).

**Фикс одна строка**:
```js
const [atBottom, setAtBottom] = useState(false)  // default false
```

`atBottom=true` устанавливается **только** после реального scroll event когда `nearBottom<80px`.

**Тесты** (+5 новых в `useForceReadAtBottom.vitest.jsx`):
- atBottom=false: НЕ вызывает markRead ⭐ регрессия v0.87.44
- atBottom=true + unread>0: вызывает через 400мс
- atBottom=true + unread=0: НЕ вызывает
- maxEverSentRef guard не позволяет уменьшать maxId
- Регрессионный сценарий «было 7, стало 1» воспроизведён

**Также фикс**: `hookOrder.test.cjs` исключает `.vitest.jsx` файлы (false-positive на renderHook callback).

**Итого**: 104/104 vitest ✅ (было 99)

### v0.87.43 — Вариант 5: seen+scrolled-away IntersectionObserver (Telegram-style read-tracking)

**Проблема (из логов v0.87.42)**: открыл чат с 22 непрочитанными, ничего не скроллил — через 1.5с markRead пометил 16 сообщений (все что в viewport при initial scroll).

**Причина**: старый IntersectionObserver с `threshold: 0.15` помечал msg как "виденные" сразу при появлении в экране. При initial-scroll 15+ msg появляются одновременно → все в batch → markRead.

**Фикс v0.87.43 — двойной IntersectionObserver**:

Новый хук `src/native/hooks/useReadOnScrollAway.js`:
1. **Фаза 1 (Seen)**: msg должен быть полностью видим (`intersectionRatio >= 0.95`) → помечается `seenRef=true`
2. **Фаза 2 (Read)**: msg ушёл ВЫШЕ viewport (`isIntersecting=false, boundingClientRect.bottom < 0`) И был seen → `onRead()`

Защищает от:
- Промелькнувшие сообщения при fast-scroll (не набирают 95% → не seen)
- Initial-render (msg просто появились, не прокручены мимо)
- Прыжки через кнопку ↓ (быстрый scroll, seen не срабатывает)
- Layout shifts от media (IntersectionObserver сам пересчитывается)

**Затронутые файлы**:
- `useReadOnScrollAway.js` — новый хук
- `MessageBubble.jsx` — заменил простой Observer на хук
- `MediaAlbum.jsx` (AlbumBubble) — заменил простой Observer на хук
- `InboxMode.jsx` — добавлены `scrollDiag.logEvent` для `read-scrolled-away`, `read-batch-send`, `read-batch-skip`

**Расширенное логирование**:
Теперь в `chatcenter.log` видна полная картина убывания счётчика:
```
[native-scroll] read-scrolled-away msgId=12866 batchSize=1 currentUnread=22
[native-scroll] read-scrolled-away msgId=12867 batchSize=2 currentUnread=22
...
[native-scroll] read-batch-send maxId=12870 count=5 currentUnread=22
[native-scroll] store-unread-sync unread=17
```

**Тесты** (+9 новых в `useReadOnScrollAway.vitest.jsx`):
- msg на 50% — НЕ seen, НЕ read
- msg полностью (100%) — SEEN, не read
- seen → ушёл выше → READ
- промелькнувшее (0.3) → ушёл выше → НЕ read ⭐ ключевой
- ушёл вниз (bottom>0) → НЕ read
- onRead только один раз
- onSeen только один раз
- threshold [0, 0.95] настроен
- регрессия: 10 bubbles по 50% → 0 read (было 10)

**Итого**: 99/99 vitest ✅ (было 90)

### v0.87.42 — FIX бейджа стрелки «50» при load-older (prepend ≠ новое снизу)

**Проблема (из логов v0.87.41)**: при открытии чата автоматический `load-older` догружал 50 старых сообщений в **начало** массива (prepend). Старый код считал это как «50 новых снизу» и показывал `↓ 50` на кнопке scroll-to-bottom.

**Причина** в `InboxMode.jsx`:
```js
// Баг: при prepend активный срез возвращает последние 50 (сдвинувшиеся)
const added = activeMessages.slice(prev).filter(m => !m.isOutgoing).length
```

**Фикс v0.87.42**:
- Новый хук `src/native/hooks/useNewBelowCounter.js`
- Отслеживает `lastMsgId` (id последнего сообщения). Если не изменился → это prepend, НЕ считаем.
- Если изменился → реально пришло новое в конец → считаем только новые msgs ПОСЛЕ `prevLastId`
- Логгер `[native-scroll] new-below-skip` — видно в логах когда срабатывает защита

**Тесты** (+7 новых в `useNewBelowCounter.vitest.jsx`):
- init: при первом рендере НЕ вызывает onAdded
- prepend (load-older): добавление в НАЧАЛО не засчитывается ✅ (ключевой)
- append: новое снизу → added=1
- append 3 новых: added=3
- outgoing: не считаются
- atBottom=true: не копим
- **Регрессионный** сценарий из логов: 50 старых prepend → 0 newBelow (было +50)

**Итого**: 90/90 vitest ✅

### v0.87.41 — Telegram-style markRead (убрано локальное вычитание unreadCount)

**Проблема пользователя**: «в списке было 36, встал на чат — стало 25, через 10 сек — 35, цифры прыгают»

**Корень**: `nativeStore.markRead()` принимал параметр `localRead` (например 11 видимых сообщений), вычитал локально `36 - 11 = 25`. Потом сервер возвращал реальное `35` (прочитано только 1 сообщение по maxId) → прыжок 36→25→35.

**Фикс (Telegram-style)**:
- Убран параметр `localRead` из `markRead(chatId, maxId)`
- НЕ вычитаем локально — полагаемся ТОЛЬКО на `tg:chat-unread-sync` от сервера
- Счётчик в списке обновляется плавно 36→35→34→... по мере серверных подтверждений
- Как в Telegram Desktop

**Затронутые файлы**:
- `src/native/store/nativeStore.js`: `markRead` упрощён до `(chatId, maxId) => IPC`
- `src/native/modes/InboxMode.jsx`: `store.markRead(chatAtStart, lastReadMaxRef.current)` (без count)
- `src/native/hooks/useForceReadAtBottom.js`: `markRead(chatId, lastId)` (без activeUnread)

**Тесты**: новый `src/native/store/nativeStore.vitest.jsx` — 4 теста:
- markRead НЕ вычитает локально
- unreadCount обновляется ТОЛЬКО из tg:chat-unread-sync
- сигнатура markRead = 2 аргумента (не 3)
- регрессионный тест на прыжок 36→25→35

**Итого**: 83/83 vitest ✅ (было 79)

### v0.87.40 — FIX скролл уходил наверх при открытии чата с непрочитанными

**Причина (из логов [native-scroll])**:
1. `useInitialScroll` срабатывал на КЭШЕ из localStorage (старые id 22146-22195) ДО того как пришли свежие с сервера (22242-22293). Скролл уходил на самое старое из кэша.
2. Локальный `unread=95` был завышен (реально сервер = 47). При `incoming=50, unread=95`: `max(0, 50 - 95) = 0` → anchor = самое первое = максимально наверх.

**Фикс**:
- `useInitialScroll` принимает `loading` — не срабатывает пока `loadingMessages[chatId] === true`
- `firstUnreadIdRef` пересчитывается при смене `firstId/lastId/activeUnread` (раньше только при первом появлении messages)
- Clamp: `Math.min(realUnread, incoming.length)` — защита от завышенного серверного `unreadCount`

**Файлы**: [useInitialScroll.js](src/native/hooks/useInitialScroll.js), [InboxMode.jsx](src/native/modes/InboxMode.jsx)

**Тесты**: 79/79 vitest ✅

## Диагностика native-scroll ЦентрЧатов (22 апреля 2026)

- Добавлено файловое логирование для нативного режима `ЦентрЧатов` (`src/native/*`), не для WebView-мессенджеров.
- Все строки диагностики имеют префикс `[native-scroll]` и попадают в `userData/chatcenter.log` через IPC `app:log`.
- Логируются: выбор активного чата, `unreadCount`, расчёт первого непрочитанного, initial-scroll, позиция scroll-контейнера, `top-threshold`, запуск/результат/применение `loadOlderMessages`, клики по кнопке вниз, пользовательские wheel/touch/pointer события.
- Цель: после воспроизведения бага “чат без непрочитанных открывается выше низа” по логам понять, что перебило позицию: initial-scroll, stale first-unread, авто-догрузка старых сообщений или изменение высоты контента.
- Смотреть в логе события: `store-set-active-chat` → `chat-open` → `store-load-messages` → `store-tg-messages` → `first-unread-calc` → `initial-*` → `top-threshold` / `load-older-*`.

## СТАТУС ФИЧЕЙ v0.87.27–29 (обновлено 24 апреля 2026 после v0.87.54)

| # | Фича | Статус | Комментарий пользователя |
|---|------|--------|--------------------------|
| 1 | Reply-клик → scroll к оригиналу + жёлтая вспышка 1.5с | ✅ **работает** | «работает» |
| 2 | «Новые сообщения» divider при открытии чата | ✅ **работает** | подтверждено 24.04.2026 |
| 3 | Runtime smoke-тест main-процесса | ⏳ | не проверено |
| 4 | Проверка `telegram/*` подпутей в тесте | ⏳ | не проверено |
| 5 | Avatar cache bust при logout | ⏳ | не проверено |
| 6 | Авто-очистка `tg-media/` старше 30 дней | ⏳ | не проверено |
| 7a | Клик на фото → React-overlay (v0.87.27) | ❌ | «не верно, на весь экран» — удалено |
| 7b | Клик на фото → отдельное **BrowserWindow** (v0.87.28) | ✅ **работает** | «Подойдет» |
| 8 | Индикатор новых сообщений при скролле назад (стрелка с бейджем) | ✅ **работает** | подтверждено 24.04.2026 |
| 9 | Превью ссылок (title/description/siteName) | ⏳ | не проверено |
| 10 | Ctrl+↑ → редактирование последнего своего | ⏳ | не проверено |
| 11 | Аватарка слева от групп чужих сообщений | ✅ **работает** | «это есть» |
| 12 | IPC `photo:toggle-pin` (pin окна фото) | ⏳ | часть PhotoViewer — не проверено |
| 13 | lastMessage preview (медиа/action вместо «—») | ⏳ | не проверено |
| 14 | **Группировка медиа-альбомов** (v0.87.29) | ⏳ | «надо группировку как в телеграмме» — сделано, ждёт ручной визуальной проверки сетки 2×2/3×3 |
| 15 | **Вариант A: скролл при открытии чата** (v0.87.29) | ✅ **работает** | подтверждено 24.04.2026 — скроллит на первое непрочитанное |
| 16 | **Синий неон «последнее прочитанное»** (v0.87.54, был жёлтый v0.87.29) | ✅ **работает (после смены цвета)** | подтверждено 24.04.2026 + цвет сменён на accent #2AABEE |

Виртуализация **списка чатов** — уже реализована в v0.87.12 через `react-window` List. Виртуализация **списка сообщений** в открытом чате — пока нет (будущая задача).

---

## Статус функций

### Инфраструктура
| Функция | Статус | Версия |
|---------|--------|--------|
| Базовая структура проекта | ✅ Сделано | v0.2.0 |
| Electron + главное окно | ✅ Сделано | v0.2.0 |
| IPC preload (contextBridge) | ✅ Сделано | v0.2.0 |
| JSON-хранилище (userData) | ✅ Сделано | v0.5.0 |
| Сохранение размера/позиции окна | ✅ Сделано | v0.5.0 |
| Трей-иконка + меню | ✅ Сделано | v0.5.0 |

### Мессенджеры
| Функция | Статус | Версия |
|---------|--------|--------|
| WebView-вкладки | ✅ Сделано | v0.2.0 |
| Telegram Web | ✅ Базово (WebView) | v0.2.0 |
| WhatsApp Web | ✅ Базово (WebView) | v0.2.0 |
| ВКонтакте | ✅ Базово (WebView) | v0.2.0 |
| Добавление мессенджера вручную (любой URL) | ✅ Сделано | v0.5.0 |
| Закрытие вкладок | ✅ Сделано | v0.5.0 |
| Подтверждение перед закрытием вкладки | ✅ Сделано | v0.31.0 |
| Закрепление вкладок (pin/lock) | ✅ Сделано | v0.32.0 |
| Персистентность списка мессенджеров | ✅ Сделано | v0.5.0 |

### Мониторинг сообщений (ChatMonitor)
| Функция | Статус | Версия |
|---------|--------|--------|
| MutationObserver в WebView preload | ✅ Сделано | v0.6.0 |
| Счётчик непрочитанных (TG/WA/VK) | ✅ Сделано | v0.6.0 |
| Передача через ipcRenderer.sendToHost | ✅ Сделано | v0.6.0 |
| Бейдж непрочитанных на вкладке | ✅ Сделано | v0.5.0 |
| Звуковой сигнал (Web Audio, двухтональный) | ✅ Сделано | v0.24.0 |
| Автопереключение вкладки при новом сообщении | ✅ Сделано | v0.24.0 |

### ИИ-помощник
| Функция | Статус | Версия |
|---------|--------|--------|
| Интеграция OpenAI GPT-4o-mini | ✅ Сделано | v0.6.0 |
| Интеграция Anthropic Claude | ✅ Сделано | v0.6.0 |
| Интеграция DeepSeek (бесплатный tier) | ✅ Сделано | v0.7.0 |
| Интеграция ГигаЧат (Сбербанк, OAuth2) | ✅ Сделано | v0.7.0 |
| Панель вариантов ответа (3 варианта) | ✅ Сделано | v0.6.0 |
| Выбор ответа одним кликом (копирование) | ✅ Сделано | v0.6.0 |
| Настройки ИИ (провайдер, модель, ключ) | ✅ Сделано | v0.6.0 |
| Resizable AI-панель (drag + запоминание) | ✅ Сделано | v0.7.0 |
| Кнопки показать/скрыть ключ | ✅ Сделано | v0.7.0 |
| SSE-стриминг ответов (токены по мере генерации) | ✅ Сделано | v0.10.0 |
| Автосохранение черновика ввода по вкладке | ✅ Сделано | v0.10.0 |
| Бейдж трея с числом непрочитанных | ✅ Сделано | v0.10.0 |
| Режим WebView AI (GigaChat/ChatGPT/Claude/DeepSeek) | ✅ Сделано | v0.11.0 |
| Разрешения на чтение чата (нет/последнее/история) | ✅ Сделано | v0.11.0 |
| Вставка контекста чата в AI WebView (executeJavaScript + clipboard) | ✅ Сделано | v0.11.0 |
| Per-provider режимы: API-ключ или Веб-интерфейс в настройках каждого ИИ | ✅ Сделано | v0.12.0 |
| Индикатор режима 🔧/🌐 на кнопке провайдера | ✅ Сделано | v0.12.0 |
| ⚙️ всегда видна (не только когда провайдер подключён) | ✅ Сделано | v0.12.0 |

### Шаблоны
| Функция | Статус | Версия |
|---------|--------|--------|
| Создание/редактирование шаблонов | ✅ Сделано | v0.8.0 |
| Быстрый поиск по шаблонам | ✅ Сделано | v0.8.0 |
| Категории шаблонов | ✅ Сделано | v0.9.0 |

### Авто-ответчик
| Функция | Статус | Версия |
|---------|--------|--------|
| Авто-ответ по ключевым словам | ✅ Сделано | v0.8.0 |
| Авто-ответ по расписанию | 📋 Запланировано | — |
| Авто-ответ для конкретного чата | 📋 Запланировано | — |
| ИИ-авто-ответ | 📋 Запланировано | — |
| Задержка перед ответом | 📋 Запланировано | — |

### Настройки
| Функция | Статус | Версия |
|---------|--------|--------|
| Настройки ИИ-провайдера/ключа/модели | ✅ Сделано | v0.6.0 |
| Управление мессенджерами | ✅ Сделано | v0.5.0 |
| Поиск в мессенджере (findInPage) | ✅ Сделано | v0.5.0 |
| Тёмная/светлая тема | ✅ Сделано | v0.6.0 |
| Горячие клавиши (Ctrl+1-9, T, W, F, ,) | ✅ Сделано | v0.6.0 |
| Drag-and-Drop порядок вкладок | ✅ Сделано | v0.6.0 |
| Управление правилами авто-ответа | ✅ Сделано | v0.8.0 |

---

## Changelog

