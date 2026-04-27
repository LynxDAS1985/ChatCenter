# Реализованные функции — ChatCenter

## Текущая версия: v0.87.92 (27 апреля 2026)

**Структура файла**: этот features.md содержит только **последние активные версии** (v0.87.80 → v0.87.92). Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.87.65-79.md`](./archive/features-v0.87.65-79.md) | v0.87.65 – v0.87.79 (план разбиения 1-3, pre-push hook, bubble UI) | ~54 КБ |
| [`archive/features-v0.87.51-64.md`](./archive/features-v0.87.51-64.md) | v0.87.51 – v0.87.64 (groupedUnread удалён, pre-commit hook) | ~54 КБ |
| [`archive/features-v0.87.40-50.md`](./archive/features-v0.87.40-50.md) | v0.87.40 – v0.87.50 (итерации native scroll + unread) | ~40 КБ |
| [`archive/features-v0.87-early.md`](./archive/features-v0.87-early.md) | v0.87.0 – v0.87.39 (запуск native + ранние фиксы) | ~140 КБ |
| [`archive/features-pre-v0.87.md`](./archive/features-pre-v0.87.md) | v0.1.0 – v0.86.10 (до native-режима, 3 марта – 14 апреля 2026) | ~210 КБ |

**Архив не читается по умолчанию.** Запрос к нему — только при явной просьбе («что было в v0.85», «покажи старый changelog»).

**До рефакторинга v0.87.57** файл был 445 КБ (3371 строк, 323 версии). После — ~100 КБ в корне.

---

### v0.87.92 — Диагностика аватарки + размер 56→68px

Проблема: backend скачал `me_638454350.jpg (5318 bytes)`, в UI пусто.

Добавлено:
- Backend `telegramAuth.js` — логи `account-update [first emit] / [with avatar]`
- Renderer `nativeStore.js` — `console.log('[nativeStore] tg:account-update', { hasAvatar })`
- Аватарка 56→68px (+20%), шрифт 20→24

После перезапуска юзер должен открыть DevTools (Ctrl+Shift+I) → Console → найти 2 строки `[nativeStore] tg:account-update` → скриншот. Если `hasAvatar: false` оба раза — backend не emit'ит. Если true но круг пуст — URL `file:///` блокируется в renderer.

pre-push: 31/31 cjs ✅ + vitest 142/142 ✅.

---

### v0.87.91 — AccountContextMenu: аватарка + Sheen + Slide + белый текст

3 части по запросу пользователя:

**A) Аватарка** — `loadOwnAvatar(me)` в `telegramAuth.js` через `client.downloadProfilePhoto(me, { isBig: false })` → `tg-avatars/me_<id>.jpg` → URL в `state.currentAccount.avatar`. Также `connectedAt: Date.now()`. Грузится асинхронно (не блокирует login), кэшируется.

**B) Flex-layout** — шапка меню: аватарка 56×56 слева (фото или градиент accent→blue с инициалами), текст справа (имя жирным белым, номер dim, @username accent, дата dimmer).

**C) Sheen + Slide эффекты в `styles.css`**:
- `.native-btn-sheen::before` — белая полоса skewX(-20°), `left: -75% → 125%` за 600мс при hover
- `.native-btn-sheen:hover` — фон `rgba(239,68,68,0.85)` + красное box-shadow свечение
- `.native-btn-sheen:active` — `scale(0.97)` (нажатие)
- `@keyframes native-menu-slide-in` — opacity + translateX 20→0 за 250мс spring. Применяется к шагам menu/confirm.

Текст в кнопке белый по умолчанию (был красный).

Тесты: `text-align center` → `flex layout` + 2 новых (инициалы / URL фото). Всего vitest **142/142** ✅, cjs **31/31** ✅.

**Файлы**: `telegramAuth.js`, `AccountContextMenu.jsx`, `AccountContextMenu.vitest.jsx`, `styles.css`, версия 0.87.91.

**UI-проверка**: перезапуск → аватарка загрузилась → ПКМ → меню с фото слева, текстом справа → hover «Выйти» = белый блик → клик = slide-переход → confirm-кнопки → active = squish.

---

### v0.87.90 — AccountContextMenu: кнопка «Выйти» — красная по умолчанию + hover-эффект подъёма

**Зачем**: пользователь прислал скриншот после v0.87.89 — кнопка «Выйти» была нейтральной (по умолчанию серый текст), и красной только при hover. Запрос: красная по умолчанию + другой эффект при hover.

**Что изменилось**:

| Состояние | ❌ Было (v0.87.89) | ✅ Стало (v0.87.90) |
|---|---|---|
| **Default** | Прозрачный фон, серый текст | **Мягко-красный фон** `rgba(239,68,68,0.12)` + **красная рамка** + **красный текст** |
| **Hover** | Мягко-красный фон + красный текст | **Насыщенный красный фон** `rgba(239,68,68,0.85)` + **белый текст** + **подъём** `translateY(-1px)` + **красное свечение** `box-shadow 0 4px 14px rgba(239,68,68,0.35)` |
| Transition | `background, color 150ms` | `all 180ms cubic-bezier(0.34, 1.4, 0.64, 1)` — лёгкий spring |
| Border | none | `1px solid rgba(239,68,68,0.25)` → при hover `rgba(239,68,68,1)` |
| Border-radius | 4 | 6 |
| Font weight | 500 | 600 + letter-spacing 0.2 |

**Поведение**:
- 🔴 **Default**: пользователь сразу видит — это **опасное действие** (красным цветом).
- 🌟 **Hover**: кнопка **«поднимается»** на 1px со свечением и насыщенным красным фоном + белый текст. Spring-easing даёт лёгкий упругий эффект.

**Контраст между состояниями (важный паттерн UX для destructive-кнопок)**:
- Default = «опасно, но спокойно лежит»
- Hover = «действие сейчас произойдёт» (визуально активируется)

**Проверки**:
- `bash scripts/hooks/pre-push` → 31/31 cjs ✅ + vitest 140/140 ✅
- ESLint ✅

**Файлы изменены**:
- `src/native/components/AccountContextMenu.jsx` — стиль кнопки «Выйти из аккаунта» в шаге `menu`
- `package.json`, `package-lock.json`, `CLAUDE.md` — версия 0.87.90

**🟡 Что осталось** (отдельной задачей по запросу пользователя): добавить аватарку аккаунта слева от текста + текст вправо + дата подключения через GramJS API (`client.downloadProfilePhoto(me)` + `connectedAt: Date.now()` в `currentAccount`). Backend и UI не меняются в этом релизе.

---

### v0.87.89 — Полировка AccountContextMenu: центрирование, полный номер, контраст, spring-анимация

**Зачем**: пользователь прислал скриншот после v0.87.88 — меню сливалось с фоном AMOLED, текст был по левому краю, номер маскирован (а ему свой номер видеть надо). Сделал 4 правки.

**Что изменилось**:

| 🚦 Что | ❌ Было (v0.87.88) | ✅ Стало (v0.87.89) |
|---|---|---|
| Выравнивание текста | text-align: left | **text-align: center** |
| Номер | `+7 (***) ***-03-33` (маскирован) | `+7 (912) 637-03-33` (полный) |
| Фон меню | `var(--amoled-surface)` (сливается с чёрным) | **gradient `#1a1f2e → #141823`** (контрастирует) |
| Рамка | `1px solid var(--amoled-border)` (тонкая, серая) | **4-слойная**: accent-кольцо + глубокая тень + accent-glow + inset highlight |
| Анимация | `fadein 150ms ease-out` (плоская) | **`popin 220ms cubic-bezier(0.34, 1.56)`** — spring с overshoot, blur fade, slide |
| Кнопка «Выйти» | оранжевый текст всегда | нейтральный + красный при hover |

**Spring-анимация (0% → 60% → 100%)**:
```
0%:    opacity 0, scale 0.82, translateY(-6px), blur(3px)
60%:   opacity 1, blur(0)
100%:  opacity 1, scale 1, translateY(0)
```

`cubic-bezier(0.34, 1.56, 0.64, 1)` даёт **overshoot ~10%** — меню «выпрыгивает» и оседает на место. Длительность 220мс.

**Тень (4 слоя)**:
```css
box-shadow:
  0 0 0 1px rgba(42,171,238,0.25),    /* тонкое accent-кольцо */
  0 16px 48px rgba(0,0,0,0.65),       /* глубокая основная тень */
  0 4px 12px rgba(42,171,238,0.15),   /* мягкое accent-свечение */
  inset 0 1px 0 rgba(255,255,255,0.06); /* тонкий highlight сверху */
```

Плюс `backdrop-filter: blur(8px)` — лёгкое размытие фона за меню (если поддерживается).

**`formatPhone` обновлён**:
```js
+79126370333 → "+7 (912) 637-03-33"   (полный, без маскировки)
+18005551234 → "+18005551234"         (другие страны — просто с +)
```

**Тесты обновлены** (`AccountContextMenu.vitest.jsx`, 17 тестов вместо 16):
- Тест маскировки → тест **полного формата** `+7 (XXX) XXX-XX-XX`
- Тест «БЕЗ phone» — теперь не ищет `+7`, а ищет regex `/\+7 \(\d{3}\)/`
- Новый тест: «информация об аккаунте центрирована» — проверяет `style.textAlign === 'center'`

**Проверки**:
- `bash scripts/hooks/pre-push` → 31/31 cjs ✅ + vitest **140/140** ✅
- ESLint ✅

**Файлы изменены**:
- `src/native/components/AccountContextMenu.jsx` — стили + formatPhone
- `src/native/components/AccountContextMenu.vitest.jsx` — обновлён тест номера + новый тест центрирования
- `src/native/styles.css` — `@keyframes native-menu-popin`
- `package.json`, `package-lock.json`, `CLAUDE.md` — версия 0.87.89

---

### v0.87.88 — Меню «Выйти из аккаунта» по правому клику на аватарку (Native Telegram)

**Зачем**: пользователь спросил «как выйти из Telegram-аккаунта?» — обнаружилось что кнопки нет. UI существовал только для `auto-restore session`, но не для `logout`. IPC `tg:remove-account` уже работал в `telegramChats.js:428`, нужен был только UI.

**Выбор варианта**: пользователь выбрал **Вариант E + F**:
- **E** — меню с информацией об аккаунте (имя, телефон, username, дата подключения)
- **F** — двухшаговое подтверждение **прямо в меню** (без отдельной модалки)

**Что сделано**:

```
ШАГ 1 — после ПКМ на аватарку:
┌─────────────────────────────┐
│ 👤 Алексей Дугин            │
│ +7 (***) ***-12-34          │  ← маскированный номер
│ @aleks_user                 │
│ Подключён 14 апреля 2026    │
├─────────────────────────────┤
│ 🚪 Выйти из аккаунта        │
└─────────────────────────────┘
                ↓ клик
ШАГ 2 — confirm в том же меню:
┌─────────────────────────────┐
│ 👤 Алексей Дугин            │  ← инфо остаётся
│ +7 (***) ***-12-34          │
│ @aleks_user                 │
│ Подключён 14 апреля 2026    │
├─────────────────────────────┤
│ ⚠️ Точно выйти? Сессия     │
│    будет удалена            │
│                             │
│ [❌ Отмена]   [✅ Выйти]    │
└─────────────────────────────┘
                ↓ ✅
ШАГ 3 — IPC tg:remove-account:
- client.disconnect() → tg-session.txt удалён
- кэши очищены
- UI вернулся в режим «Введите номер»
```

**Особенности**:
- ✅ **Маскировка номера**: `+79001234567` → `+7 (***) ***-45-67` — защита от случайного скриншота
- ✅ **Защита Esc** — закрывает меню (если не в «progress» состоянии)
- ✅ **Click-outside** — клик мимо меню закрывает его
- ✅ **Корректировка позиции** — меню не вылезает за край экрана
- ✅ **Обработка ошибок** — если `tg:remove-account` упал, показываем ошибку, остаёмся на confirm-шаге
- ✅ **Анимация**: fade-in + scale 0.95→1 за 150мс
- ✅ **Tooltip-подсказка** на аватарке: «ПКМ для меню»

**Архитектура**:
- `src/native/components/AccountContextMenu.jsx` (новый, ~165 строк) — компонент меню
- `src/native/NativeApp.jsx` — добавлен `onContextMenu={(e) => handleAccountContextMenu(e, acc)}` на каждую аватарку аккаунта + state `accountMenu`
- `src/native/styles.css` — `@keyframes native-menu-fadein`
- `src/native/store/nativeStore.js` `removeAccount(accountId)` — **уже был**, не менялся (вызывает IPC `tg:remove-account`)

**Тесты** (`AccountContextMenu.vitest.jsx`, 16 тестов):
- 7 тестов Шаг 1 (имя, username, маскировка, дата, кнопка, без phone, без username)
- 6 тестов Шаг 2 (переключение на confirm, кнопки, Отмена→onClose, Выйти→onLogout, успех→onClose, ошибка→оставаться)
- 2 теста позиционирование (правый край, нижний край)
- 1 тест безопасность (preventDefault для contextmenu внутри меню)

**Проверки**:
- `npm run test:vitest` → 17 файлов / **139 тестов** (+16 новых) ✅
- `bash scripts/hooks/pre-push` → 31/31 cjs ✅ + vitest 139/139 ✅
- ESLint ✅

**⚠ UI-проверка пользователем**:
1. ПКМ на аватарку аккаунта в sidebar → появляется меню с инфо
2. Видно имя, маскированный номер, @username, дату подключения
3. Клик «🚪 Выйти из аккаунта» → меню меняется на «Точно выйти?» с двумя кнопками
4. Клик «❌ Отмена» → меню закрывается, аккаунт остался
5. Клик «✅ Выйти» → видно «Выходим...» → меню закрывается → список чатов пустой → форма «Введите номер»
6. После выхода — `%APPDATA%/ЦентрЧатов/tg-session.txt` удалён (можно проверить файлово)
7. ESC закрывает меню на любом шаге (кроме «progress»)
8. Клик мимо меню — закрывает

**Файлы изменены**:
- `src/native/components/AccountContextMenu.jsx` — новый
- `src/native/components/AccountContextMenu.vitest.jsx` — новый (16 тестов)
- `src/native/NativeApp.jsx` — onContextMenu + state + рендер меню
- `src/native/styles.css` — `@keyframes native-menu-fadein`
- `package.json`, `package-lock.json`, `CLAUDE.md` — версия 0.87.88

---

### v0.87.87 — Cleanup после плана разбиения 7/7: документация + срочные разбиения

**Зачем**: после закрытия плана 7/7 (v0.87.86) пользователь попросил полную проверку проекта. Найдено 4 группы задач: устаревшая документация, файлы для архивации, устаревшие ADR, файлы 80%+ от лимита (риск красного теста при следующем коммите). Сделано всё в одном коммите.

**Группа A: документация**

1. `code-limits-status.md` (был v0.87.68 — отстаёт на 18 версий!) — переписан с актуальными цифрами. Удалены строки про разбитые файлы (telegramHandler, InboxMode). Добавлен раздел «План разбиения 7/7 ВСЕ ШАГИ ЗАКРЫТЫ» с историей.
2. `handoff-code-limits.md` — Приоритет 1 (telegramHandler) помечен ✅ СДЕЛАНО в v0.87.86. Ссылка на архивированный handoff.
3. `decisions.md`:
   - **ADR-006 (Zustand)** → ❌ Отменено. Используется React hooks + IPC, пакет zustand не установлен.
   - **ADR-010 (Рефакторинг <1000)** → ✅ ЗАВЕРШЕНО. Переплавлено в новую систему лимитов.

**Группа B: архивация handoff'ов**

- `handoff-telegram-handler-split.md` (64 КБ) → `archive/2026-04-handoff-telegram-handler-split.md`. В журнал `archive/README.md` добавлена запись.
- `handoff-step7-completed.md` (43 КБ) — удалён (был локальный, не закоммичен; вся информация в `features.md` changelog v0.87.86).
- `CLAUDE.md` — удалена строка «Шаг 7/7: telegramHandler.js» из таблицы «Узкие файлы».

**Группа C: срочные разбиения (риск красного теста)**

1. **`unreadCounters.js` 495→266 строк** — Telegram-логика вынесена в `unreadTelegram.js` (242 строки). Re-export Telegram-функций для обратной совместимости. Создан **локальный `main/preloads/utils/package.json`** с `"type": "commonjs"` — переопределяет корневой `type:module`, чтобы `require()` и `module.exports` работали в `.js` файлах папки.
2. **`useIPCListeners.js` удалён** — мёртвый код (никем не импортировался). Был заменён на `useAppIPCListeners.js` в Шаге 5 (v0.87.82).
3. **`integration.test.cjs` 391→276 строк** — цепочки 3-5 (URL/config, App.jsx imports, lifecycle) вынесены в новый `integrationChains.test.cjs` (150 строк). Оба добавлены в `npm test` script и `pre-push` hook.

**Тест-фиксы** (требовались после разбиения):
- `monitorPreload.test.cjs` — `unreadCode` склейка из 2 файлов (unreadCounters + unreadTelegram).
- `getMessengerType()` в `unreadCounters.js` — добавлена защита `if (typeof location === 'undefined') return null` для Node-test контекста (smokeTest require'ит preload, там нет `location`).

**Проверки**:
- `bash scripts/hooks/pre-push` → **31/31 cjs ✅** (было 30, +1 integrationChains) + **vitest 123/123 ✅**
- `npm run lint` ✅
- `npm run check-memory` ✅ (все 4 версии 0.87.87)

**Файлы изменены**:
- `main/preloads/utils/unreadCounters.js` — 495→266 строк
- `main/preloads/utils/unreadTelegram.js` — новый (242 строки)
- `main/preloads/utils/package.json` — новый (type: commonjs)
- `src/hooks/useIPCListeners.js` — удалён
- `src/__tests__/integration.test.cjs` — 391→276 строк
- `src/__tests__/integrationChains.test.cjs` — новый (150 строк)
- `src/__tests__/monitorPreload.test.cjs` — обновлена склейка `unreadCode`
- `package.json` — `npm test` цепочка + версия 0.87.87
- `scripts/hooks/pre-push` — добавлен `integrationChains` в TESTS массив
- `.memory-bank/code-limits-status.md` — переписан полностью (был v0.87.68 → актуально v0.87.86)
- `.memory-bank/handoff-code-limits.md` — Приоритет 1 ✅ СДЕЛАНО
- `.memory-bank/decisions.md` — ADR-006 ❌, ADR-010 ✅
- `.memory-bank/handoff-telegram-handler-split.md` → `archive/2026-04-...`
- `.memory-bank/handoff-step7-completed.md` — удалён
- `.memory-bank/archive/README.md` — журнал
- `CLAUDE.md` — удалена ссылка на архивированный handoff
- `package-lock.json`, `.memory-bank/features.md` — версия 0.87.87

**🟡 Что осталось вручную пользователю**: UI-проверка после Шага 7 (12 пунктов из архивированного handoff). Подробная инструкция в финальном отчёте сессии.

---

### v0.87.86 — Разбиение `telegramHandler.js`: 6 модулей, исключение удалено (Шаг 7/7 — финал плана)

**Зачем**: `telegramHandler.js` был 1284 строки / 1300 — крупнейший файл с исключением `KNOWN_EXCEPTIONS`. Последний рискованный файл из плана разбиения.

**Что вынесено**:

```
ДО:  main/native/telegramHandler.js [1284/1300]  ← KNOWN_EXCEPTIONS
ПОСЛЕ:
  main/native/telegramHandler.js   [87]    тонкий роутер (init + cleanup at start)
  main/native/telegramState.js     [47]    общий state + emit + Map'ы (singleton)
  main/native/telegramErrors.js    [42]    translateTelegramError
  main/native/telegramAuth.js      [212]   startLogin + autoRestoreSession + 4 IPC
  main/native/telegramChats.js     [460]   IPC чатов + FLOOD_WAIT throttle
  main/native/telegramMessages.js  [398]   IPC сообщений + NewMessage event listener
  main/native/telegramMedia.js     [129]   IPC медиа + cleanup
```

**Контракт сохранён**:
- Все IPC каналы те же: `tg:login-start/code/password/cancel`, `tg:get-chats`,
  `tg:get-cached-chats`, `tg:get-messages`, `tg:send-message`, `tg:send-file`,
  `tg:send-clipboard-image`, `tg:forward`, `tg:mark-read`, `tg:pin`, `tg:rescan-unread`,
  `tg:get-pinned`, `tg:refresh-avatar`, `tg:set-typing`, `tg:download-video`,
  `tg:download-media`, `tg:cleanup-media`, `tg:media-cache-size`, `tg:remove-account`,
  `tg:edit-message`, `tg:delete-message`.
- Все события те же: `tg:account-update`, `tg:login-step`, `tg:chats`, `tg:messages`,
  `tg:new-message`, `tg:chat-unread-sync`, `tg:unread-bulk-sync`, `tg:chat-avatar`,
  `tg:typing`, `tg:read`, `tg:media-progress`.

**Архитектура**: `telegramState.js` экспортирует singleton-объект `state` + Map'ы (`chatEntityMap`, `markReadMaxSent`, `maxOutgoingRead`, `lastPerChatSync`). Node.js модули кэшируются → один экземпляр на процесс. Все остальные модули импортируют их и работают через `state.client`, `chatEntityMap.get(...)`. Map'ы изменяемые сами по себе — изменение видно во всех импортирующих.

**Критические сохранения**:
- FLOOD_WAIT throttle (200мс между GetFull*) в `loadAvatarsAsync` — перенесён ДОСЛОВНО (см. mistakes/electron-core.md, инцидент v0.87.55).
- Watermark guard (`markReadMaxSent` Map) в `tg:mark-read` — НЕ уменьшаем maxId, иначе бейдж растёт обратно.
- `attachMessageListener()` + `startUnreadRescan()` вызываются после `client.start()` SUCCESS в `startLogin` И в `autoRestoreSession`.

**Удалена запись** `KNOWN_EXCEPTIONS['main/native/telegramHandler.js']` в `src/__tests__/fileSizeLimits.test.cjs` — теперь под стандартным лимитом 500 для `main/native/*.js` (фактически 87/500 — запас 413 строк, 83%).

**Проверки**: pre-push hook ✅ (30/30 cjs + vitest 123/123), ESLint ✅ (`--max-warnings 0`), check-memory ✅.

**Файлы изменены**:
- [main/native/telegramHandler.js](main/native/telegramHandler.js) — переписан (1284 → 87)
- [main/native/telegramState.js](main/native/telegramState.js) — новый
- [main/native/telegramErrors.js](main/native/telegramErrors.js) — новый
- [main/native/telegramAuth.js](main/native/telegramAuth.js) — новый
- [main/native/telegramChats.js](main/native/telegramChats.js) — новый
- [main/native/telegramMessages.js](main/native/telegramMessages.js) — новый
- [main/native/telegramMedia.js](main/native/telegramMedia.js) — новый
- [src/__tests__/fileSizeLimits.test.cjs](src/__tests__/fileSizeLimits.test.cjs) — удалена запись KNOWN_EXCEPTIONS
- `package.json`, `package-lock.json`, `CLAUDE.md`, `features.md` — версия v0.87.86

**Замечание о коллизии версий**: handoff просил коммит разбиения как v0.87.85, но v0.87.85 уже была занята предыдущим коммитом (расширение самого handoff'а, 8605403). Чтобы не переписывать историю — bump до **v0.87.86**. Cleanup-коммит документации (5 мест: code-limits-status, handoff-code-limits, ссылка в CLAUDE, архивация handoff, журнал archive) сместится на v0.87.87.

**🎉 План разбиения 7/7 закрыт.** Все рискованные файлы под стандартными лимитами без поблажек.

**UI-проверка пользователем требуется** — 12 пунктов в 4 группах из handoff'а:
1. Авторизация (вход с нуля, auto-restore session, logout)
2. Чаты (список загружается, открытие чата, прочитанность)
3. Сообщения (отправка, reply/edit/delete/forward, входящие в реальном времени)
4. Медиа (photo/video, send file/clipboard, pin/unpin)

---

### v0.87.85 — Расширенный handoff для Шага 7 (полная инструкция, ~1264 строки)

**Зачем**: предыдущий handoff (v0.87.84) был кратким — следующая сессия могла задавать вопросы. Пользователь попросил «подробней напиши всё чтобы не было вопросов» + явно добавить «после разбиения убрал задачу с CLAUDE.md».

**Что изменилось** в `.memory-bank/handoff-telegram-handler-split.md`:

| Секция | Было (v0.87.84) | Стало (v0.87.85) |
|---|---|---|
| Размер | ~12 КБ | **64 КБ** (~1264 строки) |
| Примеры кода | Указания line ranges | + полные примеры скелетов файлов |
| Пошаговая инструкция | 12 шагов | **16 шагов** с командами и проверками |
| «Что убрать после успеха» | Кратко (5 пунктов) | **Отдельный большой раздел** — 5 мест в документации, конкретные правки, обязательный cleanup-коммит v0.87.86 |
| Troubleshooting | 5 симптомов | **8 симптомов** + готовые команды grep для проверки |
| Финальный чеклист | — | **14 пунктов** перед началом |

**Главные добавления**:

1. **Раздел «📦 ⭐ ОБЯЗАТЕЛЬНО: что убрать из документации после успеха»** — детально описано:
   - Удалить запись из `KNOWN_EXCEPTIONS` в `fileSizeLimits.test.cjs`
   - Убрать строку из `code-limits-status.md`
   - Пометить Приоритет 1 в `handoff-code-limits.md` как ✅
   - Удалить ссылку на handoff из таблицы «Узкие файлы» в CLAUDE.md
   - Архивировать сам handoff (`git mv` в `archive/2026-04-...`)
   - Добавить запись в журнал `archive/README.md`
   - Сделать **отдельный cleanup-коммит v0.87.86** через 1-2 дня после стабильности

2. **Конкретные примеры кода** для:
   - `telegramState.js` — полный скелет singleton модуля
   - `telegramHandler.js` после разбиения — полный скелет тонкого роутера
   - Каждого из 5 модулей — что импортировать, что экспортировать

3. **Готовые команды проверки** в troubleshooting:
   ```
   grep -n "state.client = " main/native/telegramAuth.js
   grep -rn "new Map()" main/native/telegram*.js
   ```

4. **UI-проверка пользователем — 12 пунктов в 4 группах** (авторизация, чаты, сообщения, медиа) с точными инструкциями.

**Зачем такой объёмный handoff**: следующая сессия может быть начата другим ИИ или мной с нуля. Чем подробнее handoff — тем меньше шанс что человек 1) пропустит риск, 2) забудет про cleanup документации, 3) задаст «глупый» вопрос, на который ответ есть в handoff.

**Файл всё ещё под лимитом** — 64 КБ из 100 КБ.

**Файлы изменены**:
- `.memory-bank/handoff-telegram-handler-split.md` — переписан и расширен
- `package.json`, `package-lock.json`, `CLAUDE.md` — версия 0.87.85

---

### v0.87.84 — Handoff для Шага 7: разбиение telegramHandler.js (отдельной сессией)

**Зачем**: `telegramHandler.js` 1260/1300 — самый рискованный файл плана разбиения. Содержит общий state Telegram-клиента, FLOOD_WAIT throttle для аватарок (v0.87.55), NewMessage event listener, кэш chatEntityMap, watermark guard для markRead. Если сломать — Telegram полностью отвалится.

После 8 коммитов в одной сессии (v0.87.76-83) делать Шаг 7 здесь же — высокий риск:
- Контекст уже большой
- Нужен «свежий» прогон по коду 1260 строк
- 6 модулей разбиения требуют 3-5 ходов
- UI-проверка пользователем нужна особо тщательная

**Что сделано** (только документация, код не менялся):

**`.memory-bank/handoff-telegram-handler-split.md`** — конкретный handoff на ~250 строк со всем что нужно следующей сессии:

| Секция | Что внутри |
|---|---|
| 🎯 Цель | Разбить 1260 → ~80 строк, убрать KNOWN_EXCEPTIONS |
| ⚠ Риски (5 штук) | Общий state клиента, emit(), FLOOD_WAIT throttle, attachMessageListener, pre-push hook |
| 📋 План разбиения | 6 файлов: state/errors/auth/messages/chats/media + thin handler |
| 🗺 Line ranges | Конкретные диапазоны строк → куда что переезжает |
| 🔧 Порядок работы | 12 шагов: state первым, потом по очереди, в конце pre-push |
| 🧪 Команда-чекер тестов | Готовая bash-команда с 30 cjs-тестами |
| ⚠ UI-проверка | 12 пунктов: auth, restore, чаты, аватарки, mark-read, медиа |
| 🆘 Troubleshooting | Симптомы и решения если что-то пошло не так |
| 📦 Memory Bank update | Что обновить после успеха |
| 🎁 Бонус | Совет про worktree для изоляции рисков |

**Связанные обновления в Memory Bank**:
- `CLAUDE.md` — добавлена строка в таблицу «Узкие / разовые файлы» про handoff Шага 7
- `handoff-code-limits.md` — Приоритет 1 теперь ссылается на новый handoff. Приоритеты 2-3 помечены как ✅ выполнено в v0.87.81-83.

**Когда выполнять Шаг 7**: новая сессия Claude Code. Прочитать сначала `handoff-telegram-handler-split.md` — там всё что нужно.

**Файлы изменены**:
- `.memory-bank/handoff-telegram-handler-split.md` — новый
- `CLAUDE.md` — ссылка на handoff + версия
- `.memory-bank/handoff-code-limits.md` — обновлены приоритеты
- `package.json`, `package-lock.json`, `.memory-bank/features.md` — версия 0.87.84

---

### v0.87.83 — Разбиение InboxMode.jsx: 4 файла, исключение удалено (Шаг 6/7)

**Зачем**: `src/native/modes/InboxMode.jsx` 789/800 — был с исключением (потолок 800 вместо стандартного 600). По плану handoff-code-limits.md — рекомендация разбить на главный + InboxMessageList + InboxHeader.

**Что вынесено** (4 файла вместо 3 рекомендованных):

```
ДО:
src/native/modes/InboxMode.jsx [789]  ← с исключением 800
  ├─ read-by-visibility batch markRead (~50)
  ├─ handleScroll + load-older + диагностика (~70)
  ├─ Input + reply/edit панель JSX (~50)
  └─ Левая колонка списка чатов JSX (~75)

ПОСЛЕ:
src/native/modes/InboxMode.jsx [566]   94% от стандартного лимита 600
src/native/hooks/useReadByVisibility.js  [72]   batch markRead с защитой watermark
src/native/hooks/useInboxScroll.js       [97]   handleScroll + scroll-anomaly + load-older
src/native/components/InboxMessageInput.jsx     [63]   input + reply/edit
src/native/components/InboxChatListSidebar.jsx  [73]   поиск + virtual list чатов
```

**🟢 Исключение `KNOWN_EXCEPTIONS['src/native/modes/InboxMode.jsx']` УДАЛЕНО** — теперь под стандартным лимитом 600 без поблажек.

**Контракт сохранён**:
- `useReadByVisibility({ activeChatId, activeUnread, markRead, scrollDiag, maxEverSentRef })` возвращает `{ readByVisibility }`. Использует внутренний `activeChatIdRef` чтобы closure в setTimeout не был stale.
- `useInboxScroll({ store, activeMessages, ...refs, ...setters })` возвращает `{ handleScroll }`.
- `<InboxMessageInput {...input/reply/edit/handlers} />` принимает state и handlers как props.
- `<InboxChatListSidebar store={store} activeAccountChats search setSearch listHeight setListHeight />` инкапсулирует ResizeObserver и virtual List.

**Проверки** (все с первого раза):
- `bash scripts/hooks/pre-push` → 30/30 cjs ✅, vitest 123/123 ✅
- ESLint ✅
- pre-commit ✅

**⚠ UI-проверка пользователем после Шага 6**:
- Открыть Telegram (native) → список чатов слева работает (поиск, прокрутка, выбор чата)
- Открыть чат → сообщения загружаются, scroll работает
- При прокрутке вниз → счётчик непрочитанных уменьшается (batch markRead каждые 300мс)
- При прокрутке вверх (до scrollTop<100) → подгружаются старые сообщения (load-older)
- Поле ввода: Reply, Edit (Ctrl+↑), Ctrl+Enter отправка, drag-n-drop, Ctrl+V картинка
- Save позиции прокрутки per-chat: открыть чат-1 → прокрутить → открыть чат-2 → вернуться в чат-1 → должны быть на той же позиции

**Файлы изменены**:
- `src/native/modes/InboxMode.jsx` — −223 строки (789 → 566)
- `src/native/hooks/useReadByVisibility.js` — новый
- `src/native/hooks/useInboxScroll.js` — новый
- `src/native/components/InboxMessageInput.jsx` — новый
- `src/native/components/InboxChatListSidebar.jsx` — новый
- `src/__tests__/fileSizeLimits.test.cjs` — удалена запись `'src/native/modes/InboxMode.jsx'` из `KNOWN_EXCEPTIONS`
- `package.json`, `package-lock.json`, `CLAUDE.md` — версия 0.87.83

---

### v0.87.82 — Разбиение App.jsx: useAppBootstrap + useConsoleErrorLogger + useAppIPCListeners (Шаг 5/7)

**Зачем**: `src/App.jsx` 599/600 = 99.8%. Любая новая фича UI → красный тест. По плану разбиения второй из четырёх рискованных файлов.

**Что вынесено**:

```
ДО:
src/App.jsx [599]
  ├─ useEffect Promise.all загрузка (~60 строк)
  ├─ useEffect patch console.error + show-log-modal (~22 строки)
  └─ 4 useEffect: window-state + badge + notifLog + autoreset (~50 строк)

ПОСЛЕ:
src/App.jsx                          [475]  79% лимита, запас 125 строк
src/hooks/useAppBootstrap.js         [82]   Promise.all messengers/settings/paths
src/hooks/useConsoleErrorLogger.js   [33]   patch console.error + show-log-modal
src/hooks/useAppIPCListeners.js      [90]   window-state + badge + polling + autoreset
```

**Контракт сохранён**: вызовы хуков в App.jsx с теми же зависимостями (refs, setters). Поведение не меняется.

**Обновлены 2 теста**:
- `appStructure.test.cjs` — проверка `playNotificationSound(` теперь в `allAppCode` (включая hooks). Порог `App.jsx > 500 строк` снижен до `> 300` (после рефакторинга осталось 475).
- `ipcChannels.test.cjs` — поиск `window.api.invoke(...)` теперь в App.jsx + всех файлах из `src/hooks/`.

**Проверки**:
- `bash scripts/hooks/pre-push` → 30/30 cjs ✅, vitest 123/123 ✅
- ESLint ✅
- Pre-commit ✅

**⚠ UI-проверка пользователем после Шага 5**:
- При запуске → загружаются мессенджеры, настройки, темa (useAppBootstrap)
- Открывается приложение, активная вкладка = первая (правильная)
- Звук уведомления при получении нового сообщения (useAppIPCListeners → playNotificationSound)
- Окно теряет/получает фокус → badge правильно обновляется
- Открыть NotifLogModal → лог обновляется каждые 3 секунды
- При переключении на вкладку с непрочитанными → счётчик сбрасывается через 1.5 сек

**Файлы изменены**:
- `src/App.jsx` — −124 строки (599 → 475)
- `src/hooks/useAppBootstrap.js` — новый
- `src/hooks/useConsoleErrorLogger.js` — новый
- `src/hooks/useAppIPCListeners.js` — новый
- `src/__tests__/appStructure.test.cjs` — обновлён
- `src/__tests__/ipcChannels.test.cjs` — обновлён
- `package.json`, `package-lock.json`, `CLAUDE.md` — версия 0.87.82

---

### v0.87.81 — Разбиение main.js: storage + gigachat + ruError (Шаг 4/7)

**Зачем**: `main/main.js` 598/600 = 99.6% лимита. Любая новая фича main-процесса → красный тест. План в `handoff-code-limits.md` советовал «отрефакторить срочно».

**Что вынесено**:

```
ДО:
main/main.js [598 строк]
  ├─ SETTINGS_VERSION + migrateSettings + initStorage  (~45 строк)
  ├─ GIGACHAT_* константы + httpsPostSkipSsl + getGigaChatToken (~55 строк)
  └─ ruError() переводчик API-ошибок (~30 строк)

ПОСЛЕ:
main/main.js [483 строки] — 80% лимита, запас 117 строк
main/utils/storage.js  [45]   ← initStorage + migrateSettings + SETTINGS_VERSION
main/utils/gigachat.js [58]   ← httpsPostSkipSsl + getGigaChatToken + GIGACHAT_CHAT_URL
main/utils/ruError.js  [31]   ← перевод API-ошибок
```

**Контракт сохранён**:
- `initAIHandlers({ httpsPostSkipSsl, getGigaChatToken, ruError, GIGACHAT_CHAT_URL })` теперь импортирует из `gigachat.js` и `ruError.js`. Сигнатура та же.
- `initStorage(app.getPath('userData'))` — добавлен параметр userDataPath (раньше функция вызывала `app.getPath` напрямую, теперь принимает извне для тестируемости).

**Обновлены 3 теста** (читали main.js grep'ом):
- `mainProcess.test.cjs` — добавлены чтения `storage.js`/`gigachat.js`/`ruError.js` в `allCode`. Тест `ruError определена` теперь принимает `export function ruError` тоже.
- `memoryLeaks.test.cjs` — добавлены 3 файла в массив склейки `mainCode`.
- `aiErrors.test.cjs` — извлекает `ruError` через regex теперь из `main/utils/ruError.js` (с fallback на `main.js`). Поддерживает `export function`.

**Проверки**:
- `bash scripts/hooks/pre-push` → 30/30 cjs ✅, vitest 123/123 ✅
- ESLint ✅
- Pre-commit ✅

**Файлы изменены**:
- `main/main.js` — −115 строк (598 → 483)
- `main/utils/storage.js` — новый
- `main/utils/gigachat.js` — новый
- `main/utils/ruError.js` — новый
- `src/__tests__/mainProcess.test.cjs` — обновлён
- `src/__tests__/memoryLeaks.test.cjs` — обновлён
- `src/__tests__/aiErrors.test.cjs` — обновлён
- `package.json`, `package-lock.json`, `CLAUDE.md` — версия 0.87.81

**⚠ UI-проверка после Шага 4**:
- Запустить приложение → настройки сохраняются (storage)
- ИИ запрос с любым провайдером → ответ приходит (или внятная ошибка от ruError)
- Запрос к GigaChat → токен получается, ответ приходит

---

### v0.87.80 — Pre-push git hook (защита от падающего CI)

**Зачем**: после v0.87.77 я (Claude) запушил коммит, который локально lint+vitest проходил, а CI на GitHub упал на `integration.test.cjs`. Пользователь спросил «что за ошибки?» по скриншоту GitHub Actions, я разобрал, исправил в v0.87.79. Чтобы такая ситуация больше не повторялась — pre-push hook автоматически прогоняет ту же цепочку что CI **до** того как push уйдёт.

**Что сделано**:

```
git push origin master
       ↓
[scripts/hooks/pre-push]
       ↓
30 cjs-тестов (~30с) + vitest (~15с)
       ↓
   ✅ всё OK → push идёт
   ❌ что-то упало → push БЛОКИРУЕТСЯ, видно какой тест и tail логов
```

- Новый файл: `scripts/hooks/pre-push` — bash скрипт на ~70 строк. Печатает прогресс `[1/30] isSpamText ... ✅` для каждого теста, при падении — tail последних 20 строк лога + сообщение «PUSH ЗАБЛОКИРОВАН».
- Расширен `npm run setup-hooks` — теперь устанавливает оба хука (pre-commit + pre-push) одной командой. Запускается автоматом через `postinstall`.
- Новая команда `npm run pre-push` — прогон без push (для ручной проверки).

**Что НЕ запускает** (по запретам CLAUDE.md): `electron-vite build`, `e2e/*` — оба требуют Electron. Полная цепочка `npm test` остаётся **только в CI**. Локально проверяем то что не требует electron — этого достаточно чтобы поймать 100% ошибок типа v0.87.78.

**Контрольный эксперимент**:
- Временно переименовал `src/utils/navigators/vkNavigate.js` → имитация поломки
- `bash scripts/hooks/pre-push` → 2 ❌ в navigateToChat + integration → "PUSH ЗАБЛОКИРОВАН" ✅
- Восстановил файл → `bash scripts/hooks/pre-push` → "✅ всё зелёное — push разрешён" ✅

**Установка для других** (если кто-то клонирует репо): `npm install` → срабатывает `postinstall` → `npm run setup-hooks` → оба хука установлены. Если установка через `npm ci` ломалась — можно вручную: `bash scripts/hooks/pre-push` (просто прогон без установки).

**Обход**: `git push --no-verify` — **запрещено** правилами CLAUDE.md без явного разрешения пользователя.

**Файлы изменены**:
- `scripts/hooks/pre-push` — новый
- `package.json` — `setup-hooks` расширен + `pre-push` команда + версия
- `package-lock.json`, `CLAUDE.md`, `.memory-bank/features.md` — версия 0.87.80

---
