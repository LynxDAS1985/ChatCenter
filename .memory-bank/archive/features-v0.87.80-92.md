# Архив функций — ChatCenter v0.87.80–v0.87.92

Перенесено в архив из `features.md` при разрастании файла до лимита 100 КБ (v0.87.109, 5 мая 2026).

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

| Состояние | ❌ Было (v0.87.89) | ✅ Стало (v0.87.90) |
|---|---|---|
| **Default** | Прозрачный фон, серый текст | **Мягко-красный фон** `rgba(239,68,68,0.12)` + **красная рамка** + **красный текст** |
| **Hover** | Мягко-красный фон + красный текст | **Насыщенный красный фон** `rgba(239,68,68,0.85)` + **белый текст** + **подъём** `translateY(-1px)` + **красное свечение** |

**Файлы изменены**: `src/native/components/AccountContextMenu.jsx`, версия 0.87.90.

---

### v0.87.89 — Полировка AccountContextMenu: центрирование, полный номер, контраст, spring-анимация

| 🚦 Что | ❌ Было (v0.87.88) | ✅ Стало (v0.87.89) |
|---|---|---|
| Выравнивание текста | text-align: left | **text-align: center** |
| Номер | маскирован | полный `+7 (XXX) XXX-XX-XX` |
| Фон меню | `var(--amoled-surface)` | **gradient `#1a1f2e → #141823`** |
| Анимация | `fadein 150ms ease-out` | **`popin 220ms cubic-bezier(0.34, 1.56)`** — spring с overshoot |

**Файлы изменены**: `AccountContextMenu.jsx`, `AccountContextMenu.vitest.jsx`, `styles.css`, версия 0.87.89.

---

### v0.87.88 — Меню «Выйти из аккаунта» по правому клику на аватарку (Native Telegram)

ПКМ на аватарку → 2-шаговое меню (информация + confirm). Маскировка номера, Esc/click-outside, корректировка позиции.

**Архитектура**: `src/native/components/AccountContextMenu.jsx` (новый), `NativeApp.jsx` — state + рендер.

**Тесты** (`AccountContextMenu.vitest.jsx`, 16 тестов).

---

### v0.87.87 — Cleanup после плана разбиения 7/7: документация + срочные разбиения

4 группы задач: документация, архивация handoff'ов, срочные разбиения (80%+ риск), тест-фиксы.

Разбиения:
1. `unreadCounters.js` 495→266 строк → `unreadTelegram.js` (242)
2. `useIPCListeners.js` удалён (мёртвый код)
3. `integration.test.cjs` 391→276 строк → `integrationChains.test.cjs` (150)

---

### v0.87.86 — Разбиение `telegramHandler.js`: 6 модулей, исключение удалено (Шаг 7/7 — финал плана)

`telegramHandler.js` 1284 → 87 строк. Вынесено в: `telegramState.js` / `telegramErrors.js` / `telegramAuth.js` / `telegramChats.js` / `telegramMessages.js` / `telegramMedia.js`.

**🎉 План разбиения 7/7 закрыт.** Все рискованные файлы под стандартными лимитами без поблажек.

---

### v0.87.85 — Расширенный handoff для Шага 7 (полная инструкция, ~1264 строки)

`.memory-bank/handoff-telegram-handler-split.md` расширен с ~12 КБ до **64 КБ** (~1264 строки): полные скелеты файлов, 16 шагов, troubleshooting, 14-пунктовый чеклист.

---

### v0.87.84 — Handoff для Шага 7: разбиение telegramHandler.js (отдельной сессией)

`.memory-bank/handoff-telegram-handler-split.md` — новый handoff ~250 строк.

---

### v0.87.83 — Разбиение InboxMode.jsx: 4 файла, исключение удалено (Шаг 6/7)

`InboxMode.jsx` 789 → 566. Вынесено в: `useReadByVisibility.js`, `useInboxScroll.js`, `InboxMessageInput.jsx`, `InboxChatListSidebar.jsx`.

---

### v0.87.82 — Разбиение App.jsx: useAppBootstrap + useConsoleErrorLogger + useAppIPCListeners (Шаг 5/7)

`App.jsx` 599 → 475. Вынесено в: `useAppBootstrap.js`, `useConsoleErrorLogger.js`, `useAppIPCListeners.js`.

---

### v0.87.81 — Разбиение main.js: storage + gigachat + ruError (Шаг 4/7)

`main.js` 598 → 483. Вынесено в: `main/utils/storage.js`, `main/utils/gigachat.js`, `main/utils/ruError.js`.

---

### v0.87.80 — Pre-push git hook (защита от падающего CI)

`scripts/hooks/pre-push` — новый bash скрипт. Прогоняет 30 cjs-тестов + vitest **до** push. При падении — блокирует push и показывает tail лога.

---
