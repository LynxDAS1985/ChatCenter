# Реализованные функции — ChatCenter

## Текущая версия: v0.87.76 (24 апреля 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.87.65 → v0.87.75). Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.87.51-64.md`](./archive/features-v0.87.51-64.md) | v0.87.51 – v0.87.64 (groupedUnread удалён, рефакторинг Memory Bank, pre-commit hook, bubble UI) | ~54 КБ |
| [`archive/features-v0.87.40-50.md`](./archive/features-v0.87.40-50.md) | v0.87.40 – v0.87.50 (итерации native scroll + unread) | ~40 КБ |
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

---

### v0.87.76 — Архивация старых v0.87.51-64 из features.md

**Зачем**: features.md дорос до 97/100 КБ (3 КБ запаса). Следующий патч с записью в Changelog → файл превысит лимит → автотест `memoryBankSizeLimits` упадёт → pre-commit заблокирует коммит. Пользователь явно попросил предотвратить это до того как наступит блокировка.

**Что сделано** (только перемещение текста между файлами, код не менялся):
- Создан `archive/features-v0.87.51-64.md` — версии v0.87.51 – v0.87.64 (54 КБ).
- Активный `features.md` обрезан до v0.87.65 → v0.87.76 (45 КБ — большой запас до лимита 100 КБ).
- Шапка активного файла обновлена: новая ссылка на архив + правильный диапазон версий.
- `archive/README.md` журнал — добавлена строка про эту архивацию.
- CLAUDE.md «Структура памяти» — регенерирован через `npm run regen-claude-structure`.

**Размеры**:

| Файл | Было | Стало |
|---|---|---|
| `features.md` (активный) | 97 КБ | 45 КБ |
| `archive/features-v0.87.51-64.md` | — | 54 КБ (новый) |

**Запуск**: `npm run check-memory` → ✅ Memory Bank здоров.

**Файлы изменены**:
- `.memory-bank/features.md` — обрезан + новая шапка
- `.memory-bank/archive/features-v0.87.51-64.md` — новый
- `.memory-bank/archive/README.md` — журнал
- `CLAUDE.md` — таблица «Структура памяти» регенерирована
- `package.json`, `package-lock.json` — версия 0.87.76

---

### v0.87.75 — Лимиты для ВСЕХ типов файлов + железная тройная защита

**Зачем**: в v0.87.74 закрыли случай «файл нового типа в проекте нет правила». Но лимиты были только для `.jsx/.js/.cjs`. Пользователь попросил — «сразу всем пропишем лимиты, и на будущее и сейчас, чтобы не было подводных камней».

**Что добавлено в `src/__tests__/fileSizeLimits.test.cjs`**:

1. **Три списка расширений** в начале файла:
   - `KNOWN_EXT` (покрыты правилами): `.jsx/.tsx/.js/.ts/.cjs/.mjs/.cts/.mts/.html/.css/.scss/.json`
   - `IGNORED_EXT` (пропускаем молча): картинки, шрифты, медиа, `.md/.txt/.yml/.pem/.map`
   - Всё остальное → **тест падает**

2. **`getLimit()` переписан** — поддержка всех типов:
   - `.tsx` идёт как `.jsx` (components 700, native/прочие 600)
   - `.ts/.mjs/.cts/.mts` идут как `.js` (те же правила по папкам)
   - `.html` — лимит 800, исключение `notification.html` (1000)
   - `.css/.scss` — лимит 800
   - `.json` — лимит 500

3. **Папка `shared/` тоже сканируется** — туда попадает `spamPatterns.json` и любые общие конфиги.

4. **Тройная защита от «тихих дыр»** — три отдельных теста, каждый с понятным сообщением:
   - **(A)** `getLimit()` не знает файл → «добавь правило в getLimit()»
   - **(B)** `KNOWN_EXCEPTIONS` содержит удалённый файл → «удали запись»
   - **(C)** Файл с расширением вне `KNOWN_EXT`+`IGNORED_EXT` → «либо добавь в KNOWN_EXT + правило, либо в IGNORED_EXT»

**Контрольные эксперименты** (оба прошли):
- Создал `src/_test_stub.ts` → тест падает (A) «1 файлов без правила»
- Создал `src/_test_stub.vue` → тест падает (C) «1 файлов с неизвестным расширением»

**Текущее состояние** (158 ✅ / 0 ❌):
- Найдено 10 предупреждений 80%+ — в том числе новые:
  - `main/pin-dock.html` 717/800 (90%)
  - `src/native/styles.css` 704/800 (88%)
  - `main/notification.html` 902 — исключение 1000 (планируется разбить)

**Итоговая цепочка защиты** (после v0.87.73-75):
1. 🟢 Новый файл любого типа → правило ищется по расширению и папке
2. 🟢 Новый тип (`.ts/.tsx/.html/.css/.json/.mjs`) → уже есть правила
3. 🟢 Совсем неизвестный тип (`.vue/.svelte/.toml`) → тест падает (C)
4. 🟢 Файл в `KNOWN_EXT` без правила в `getLimit()` → тест падает (A)
5. 🟢 Устаревший `KNOWN_EXCEPTIONS` → тест падает (B)
6. 🟢 Видно сразу после Edit (PostToolUse hook — v0.87.73)
7. 🟢 Видно в начале сессии (SessionStart hook — v0.87.73)
8. 🟢 Видно при commit (pre-commit hook вызывает тест)

**Файлы изменены**:
- `src/__tests__/fileSizeLimits.test.cjs` — расширенный walk + getLimit + тесты (A/B/C)
- `package.json`, `package-lock.json`, `CLAUDE.md`, `.memory-bank/features.md` — версия 0.87.75

---

### v0.87.74 — Защита от «дыр» в правилах лимитов (fail on unknown file type / stale exception)

**Зачем**: пользователь спросил «а что если появится файл нового типа (.ts, .mjs) или новая папка — поймает ли авто?». Честный ответ был «частично». Теперь закрыли полностью.

**Что сделано** (только `src/__tests__/fileSizeLimits.test.cjs`):

1. **Расширен `walk()`** — собирает файлы с расширениями `.jsx/.tsx/.js/.ts/.cjs/.mjs/.cts/.mts` (было только `.jsx/.js/.cjs`). Таким образом даже `.ts` файл попадёт в сканирование.

2. **Новый тест «Все кодовые файлы покрыты правилом лимита»** — после обхода собирает файлы, для которых `getLimit()` вернул `null`. Если такие есть → тест падает с сообщением:
   ```
   ❌ 1 файлов без правила:
      src/workers/foo.ts
      → добавь правило в getLimit() в src/__tests__/fileSizeLimits.test.cjs
   ```

3. **Новый тест «KNOWN_EXCEPTIONS не содержат несуществующих файлов»** — если в списке исключений остался путь к удалённому/переименованному файлу → тест падает. Чистит мусор в правилах автоматом.

**Контрольный эксперимент**:
- Создал `src/_test_stub.ts` → тест упал с правильным сообщением.
- Удалил → тест снова зелёный (148 ✅ / 0 ❌).

**Как теперь работает полная цепочка**:
1. 🟢 Новый `.jsx/.js/.cjs` в знакомой папке → лимит применяется автоматом (v0.87.68)
2. 🟢 Новый файл в новой папке → `getLimit()` вернёт `null` или fallback → тест падает или применит fallback 300
3. 🟢 Новый тип файла (`.ts/.tsx/.mjs`) → тест **падает** с инструкцией добавить правило
4. 🟢 KNOWN_EXCEPTIONS устарел (файл удалён) → тест падает
5. 🟢 PostToolUse hook показывает предупреждения 80%+ сразу после Edit (v0.87.73)
6. 🟢 SessionStart hook показывает в начале сессии (v0.87.73)

**Что ещё НЕ покрыто** (на заметку):
- HTML файлы `main/*.html` (photo-viewer, video-player, notification) — внутри может быть большой инлайн JS. Пока не ловятся.
- CSS файлы — не ловятся (обычно нормально).
- JSON конфиги — не ловятся.

Если когда-нибудь инлайн-страницы раздуются — добавить отдельный тест HTML-файлов.

**Файлы изменены**:
- `src/__tests__/fileSizeLimits.test.cjs` — +расширенный walk + 2 новых теста
- `package.json`, `package-lock.json`, `CLAUDE.md`, `.memory-bank/features.md` — версия 0.87.74

---

### v0.87.73 — Claude Code hooks для автоматической проверки лимитов файлов

**Зачем**: в v0.87.68 переписал автотест на авто-сканирование, но автотест сам по себе недостаточен — его надо вручную запускать. Пользователь спросил «почему ты сам не проверял?». 4 причины:

1. Жёстко заданный список из 15 файлов — исправлено в v0.87.68
2. Слепо доверял pre-commit hook — хук срабатывает ТОЛЬКО при коммите, не после правки
3. Не считал строки вручную после правок
4. Ползучий рост не замечал между сессиями

**Что сделано** (не меняет код приложения):
- Новый файл: `scripts/hooks/check-size-hook.cjs` — читает опциональный stdin JSON, если в `tool_input.file_path` путь к `src/*.jsx|js|cjs` или `main/*.jsx|js|cjs` — запускает `fileSizeLimits.test.cjs` и печатает только строки с ⚠️ / ❌ / 📊. Если stdin пустой — запускает всегда (для SessionStart).
- Обновлён `.claude/settings.json` — добавлены два хука:
  - **SessionStart** → запускает скрипт в начале каждой сессии
  - **PostToolUse** с matcher `Write|Edit` → запускает после каждой правки кода
- Обновлён CLAUDE.md — секция «Автоматические проверки лимитов файлов» с таблицей хуков и объяснением «почему это закрывает 4 причины».

**Проверка**:
- Pipe-тест: SessionStart (без stdin), PostToolUse с `.jsx` (печатает предупреждения), PostToolUse с `.md` (молчит) — все три случая работают.
- Схема JSON валидна (`node -e "require('./.claude/settings.json')"` не падает).

**Файлы изменены**:
- `.claude/settings.json` — добавлены hooks (SessionStart + PostToolUse)
- `scripts/hooks/check-size-hook.cjs` — новый
- `CLAUDE.md` — секция про автопроверки
- `package.json`, `package-lock.json`, `.memory-bank/features.md` — версия 0.87.73

**Важно**: если хуки не сработают — пользователь может открыть `/hooks` один раз (перезагрузит конфиг) или перезапустить Claude Code. Watcher подхватывает `.claude/` только если файл существовал при старте сессии.

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

### v0.87.72 — Выделение ссылок + URL строкой над LinkPreview (как Telegram Desktop)

**Обратная связь пользователя**:
- ❌ Ссылки нельзя выделить мышкой (работает drag вместо выделения)
- ❌ У исходящих ссылок URL **не виден** над карточкой preview — только карточка «Дзен»
- Требование: «как в Telegram», где можно выделить URL, заголовок, описание — всё

**Проверка Telegram Desktop**: URL отдельной синей строкой сверху → LinkPreview карточкой снизу. Весь текст выделяется мышкой, drag ссылок отключён.

**Корень**:
1. Моё правило v0.87.71 `.native-msg-group a { user-select: none }` специально отключало выделение ссылок (чтобы клик работал)
2. Для `mediaType === 'link' && webPage` я рендерил **только** `<LinkPreview>`, не показывал URL строкой

**Фикс**:

#### 1. CSS — ссылки выделяются, drag выключен
[src/native/styles.css](src/native/styles.css):
```css
.native-msg-group a {
  user-select: text;
  -webkit-user-select: text;
  cursor: pointer;
  -webkit-user-drag: none;
  user-drag: none;
}
```

Теперь можно:
- Выделить URL мышкой → Ctrl+C → скопировано
- Короткий клик по URL → открывает в браузере (обработчик `onClick` в FormattedText / новый URL-тег)
- Drag ссылки отключён — не мешает выделению

#### 2. URL строкой над LinkPreview (для исходящих)
[src/native/components/MessageBubble.jsx](src/native/components/MessageBubble.jsx):
```jsx
{m.mediaType === 'link' && m.webPage && (
  <>
    {m.webPage.url && !(m.text && m.text.includes(m.webPage.url)) && (
      <div><a href={m.webPage.url} onClick={...}>{m.webPage.url}</a></div>
    )}
    <LinkPreview wp={m.webPage} isOutgoing={m.isOutgoing} />
  </>
)}
```

Логика: если у msg есть `text` **с самой ссылкой** — URL уже отрендерен через FormattedText, дубликат не нужен. Если `text` пустой (типичный случай для исходящих через `tg:send-message` когда Telegram заменил URL на WebPage) — показываем URL строкой сам.

Клик по URL (в новом `<a>`) открывает внешний браузер через `app:open-external` IPC — как везде в приложении.

**Тесты** (+2 в [MessageBubble.vitest.jsx](src/native/components/MessageBubble.vitest.jsx)):
- ⭐ URL строкой виден если text пустой (исходящий webPage-only)
- URL НЕ дублируется если уже есть в text (входящий с URL в тексте)

**Итого**: 123 vitest ✅ (было 121).

**Что проверить пользователю** (после перезапуска):
- [ ] Открой любое сообщение с текстом → выделяется мышкой
- [ ] Ctrl+C → вставь в поиске / блокноте → текст скопирован
- [ ] Открой сообщение со **ссылкой** (yandex.ru например) → **URL выделяется**
- [ ] Drag ссылки мышкой **не срабатывает** (тащить призрак нельзя)
- [ ] Короткий клик по URL → открывается в браузере
- [ ] У исходящих ссылок (то что ты отправил) → **URL виден строкой над карточкой**
- [ ] В LinkPreview заголовок/описание выделяются, копируются

---

### v0.87.71 — Выделение текста в сообщениях + pin-кнопка с визуальным feedback

**Обратная связь пользователя**:
- ✅ Позиции чатов запоминаются как в Telegram — работает (v0.87.70 закрыт)
- ✅ Link preview bubble не пустой
- ✅ Видео PiP (◰) работает
- ✅ Окно видео открывается при клике кнопки (не двойным кликом) — корректно
- ❌ **Не выделяется текст в сообщениях** — нельзя скопировать часть или весь текст
- ❌ **Кнопка 📌 у фото** не показывает что закреплено + нет эффекта нажатия
- ❌ У видео нет превью до загрузки (показывается размытый кружок 0% / 7.5 МБ)
- ❌ Нельзя остановить/отменить загрузку видео

**Что сделано в этой версии** (2 фикса):

#### 1. Выделение текста в bubble

**Корень**: [src/index.css:16](src/index.css#L16) содержит глобально `body { user-select: none; }`. Это блокирует выделение во **всём** приложении (кнопки, UI). Исключения были только для `input, textarea, [contenteditable]`. Текст в div'ах (сообщения) — не выделялся.

**Фикс** в [src/native/styles.css](src/native/styles.css):
```css
.native-msg-group, .native-msg-group * {
  user-select: text;
  cursor: text;
}
/* Кнопки/ссылки внутри bubble остаются кликабельными */
.native-msg-group button,
.native-msg-group [role="button"],
.native-msg-group a {
  user-select: none;
  cursor: pointer;
}
```

Теперь в любом сообщении можно:
- Выделить часть текста мышкой
- Выделить весь bubble (двойной клик или Ctrl+A внутри)
- Скопировать (Ctrl+C) заголовок/описание link-preview

#### 2. Pin-кнопка в photo-viewer — визуальный feedback + эффект нажатия

**Корень**: класс `.pin-active` менял только цвет иконки (`color: #2AABEE`). Пользователь не видел разницу между закреплено/нет, т.к. эмодзи 📌 плохо меняет цвет.

**Фикс** в [main/photo-viewer.html](main/photo-viewer.html):
```css
/* Pin закреплён: синий фон + белая иконка + glow */
.pin-active {
  color: #fff !important;
  background: #2AABEE !important;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.15), 0 0 8px rgba(42,171,238,0.5);
}
.pin-active:hover { background: #1e8fc7 !important; }

/* Эффект нажатия на любую кнопку тулбара */
.toolbar button:active { transform: scale(0.92); background: rgba(255,255,255,0.2); }
```

Теперь кнопка 📌:
- При нажатии на мгновение сжимается (+background)
- В активном состоянии — **синяя подсветка** на всю кнопку с glow
- В inactive — обычный прозрачный фон

**Тесты**: 121 vitest ✅ (CSS-правки не затронули snapshots — они проверяют inline style bubble, а я менял классы parent).

**Нерешённые проблемы из этой обратной связи**:
- ❌ **Нет превью видео до загрузки**. Сейчас клик → `0% / 7.5 МБ` на размытом кружке. Должен показываться `strippedThumb` (data:URL) как постер сразу.
- ❌ **Нельзя отменить загрузку видео**. Нажал случайно → должна быть кнопка ✕ на overlay-progress.

Эти 2 проблемы в следующей версии — они требуют изменений в VideoTile / downloadMedia логике (AbortController для отмены, lazy-load strippedThumb для превью).

---

### v0.87.70 — Каждый чат помнит свою позицию (как Telegram Desktop) + субтитры удалены

**Обратная связь**:
- ❌ Переключаешься между чатами — открываются в непонятном месте
- ❌ Остановился на «Сегодня» в чате A → в B открывается тоже на «Сегодня»
- ❌ Субтитры / audio tracks не работают, не нужны

**Корень** (из лога):
```
15:50:34 Дугин → top=26743
15:50:34 Automarketolog → top=26743  ← ТОТ ЖЕ ПИКСЕЛЬ от Дугина
```

Проблема: `msgsScrollRef` — **один** div на всё приложение. `scrollTop` в пикселях не сбрасывается при смене чата. React перерисовывает контент, но ползунок прокрутки остаётся где был. v0.87.69 Set-based guard пропускал `initial-scroll` для виденных чатов → позиция чужая.

**Решение — как в Telegram Desktop**:

1. [InboxMode.jsx](src/native/modes/InboxMode.jsx) — `scrollPosByChatRef = useRef(new Map())` + в `handleScroll` сохраняем текущий `scrollTop` для активного чата.

2. [useInitialScroll.js](src/native/hooks/useInitialScroll.js) — принимает `getSavedScrollTop(chatId)` callback. При возврате к виденному чату:
   - Есть `firstUnread` (новые пришли пока был в другом чате) → `scrollIntoView` к первому новому
   - Иначе есть `savedScrollTop` → восстановить позицию где юзер был
   - Иначе ничего не делаем (не трогаем scrollTop)

3. [main/video-player.html](main/video-player.html) — удалены кнопки `🎧 Audio` и `CC Subtitles` + их JS/CSS/event listeners. Функция не работала, пользователь попросил убрать.

**Поведение по правилам Telegram**:

| Ситуация | Действие |
|---|---|
| Первое открытие чата | Скролл к `firstUnread` или в низ (как было) |
| Возврат к чату, ничего нового | Восстановить сохранённую позицию |
| Возврат к чату, есть новые | Скролл к первому новому (savedScrollTop игнорируется) |
| Никогда не был | В низ |

**Тесты** (+2 regression в [useInitialScroll.vitest.jsx](src/native/hooks/useInitialScroll.vitest.jsx)):
1. ⭐ A→B→A: savedScrollTop для A восстановлен (1234px)
2. savedScrollTop **игнорируется** если есть firstUnread — приоритет новым

**Итого**: 121 vitest ✅ (119 → +2).

**Что проверить пользователю**:
- [ ] Открой chat A → **прокрути вверх** до «сегодня» или любого места
- [ ] Переключись на chat B → прокрути в другое место
- [ ] **Вернись к A** → должен открыться **ровно там где был** (на «сегодня»)
- [ ] Вернись к B → на своей позиции в B
- [ ] Открой новый чат (никогда не открывал) → в **низ** (последнее сообщение)
- [ ] Если в чате пришли новые сообщения пока ты был в другом → открывается **на новом**

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
