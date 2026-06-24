# Реализованные функции — ChatCenter

## Текущая версия: v1.2.17 (24 июня 2026)

**Структура файла**: этот features.md содержит только **последние активные версии**. Старое — в архиве:

| Архив | Содержимое | Размер |
|---|---|---|
| [`archive/features-v0.95.39.md`](./archive/features-v0.95.39.md) | v0.95.39 (убран twoPhase + RAF×2 + 350мс easeOutCubic; стабилизировано v0.95.40+) | ~2 КБ |
| [`archive/features-v0.95.40.md`](./archive/features-v0.95.40.md) | v0.95.40 (большие emoji + a11y reduced-motion + sticky bottom on media; стабилизировано v0.95.41+) | ~3 КБ |
| [`archive/features-v0.95.41.md`](./archive/features-v0.95.41.md) | v0.95.41 (Custom emoji premium WebM/WebP + reduced-motion интеграционные тесты; стабилизировано v0.95.42+) | ~3 КБ |
| [`archive/features-v0.95.42.md`](./archive/features-v0.95.42.md) | v0.95.42 (сохранение поиска + история + ✕ + подсветка совпадений; стабилизировано v0.95.43+) | ~2 КБ |
| [`archive/features-v0.95.38.md`](./archive/features-v0.95.38.md) | v0.95.38 (фикс дубля сообщений через updateMessageSendSucceeded, ⏳ индикатор, mistakes static guard) | ~2 КБ |
| [`archive/features-v0.95.35-37.md`](./archive/features-v0.95.35-37.md) | v0.95.35-37 (fade-in changelog, auto-scroll outgoing-other-device, sending_state polish, mistakes/outgoing-two-cases.md; стабилизировано v0.95.38+) | ~3 КБ |
| [`archive/features-v0.95.34.md`](./archive/features-v0.95.34.md) | v0.95.34 (темовые vars в :root, вспышка bubble, WhatsNewModal UX; стабилизировано v0.95.40+) | ~2 КБ |
| [`archive/features-v0.95.33.md`](./archive/features-v0.95.33.md) | v0.95.33 (фикс «цвет не применяется» через querySelectorAll, регресс-тест blur, деловой стиль; финал в v0.95.34) | ~2 КБ |
| [`archive/features-v0.95.32.md`](./archive/features-v0.95.32.md) | v0.95.32 (производительность WhatsNewModal: убран backdrop-filter + contain + деловой стиль changelog) | ~2 КБ |
| [`archive/features-v0.95.31.md`](./archive/features-v0.95.31.md) | v0.95.31 (аккаунты вниз + drag-n-drop + multi-user typing + throttle реакций; стабилизировано v0.95.34+) | ~3 КБ |
| [`archive/features-v0.95.30.md`](./archive/features-v0.95.30.md) | v0.95.30 (плавная auto-scroll + 5 цветовых тем + dropdown + opacity 0.95; стабилизировано v0.95.33-34) | ~3 КБ |
| [`archive/features-v0.95.29.md`](./archive/features-v0.95.29.md) | v0.95.29 (реакции 👍❤️🔥 + Telegram-style header + General 📢 + render-counter; стабилизировано v0.95.31-34) | ~5 КБ |
| [`archive/features-v0.95.28.md`](./archive/features-v0.95.28.md) | v0.95.28 (Telegram-style auto-scroll к новому + ↓N без «слепой зоны» Schmitt; стабилизировано v0.95.31) | ~4 КБ |
| [`archive/features-v0.95.27.md`](./archive/features-v0.95.27.md) | v0.95.27 (расширенная диагностика send pipeline; стабилизировано v0.95.29) | ~3 КБ |
| [`archive/features-v0.95.23-26.md`](./archive/features-v0.95.23-26.md) | v0.95.23 – v0.95.26 (курсор в input, initial backfill, voice/spellcheck/action-bar/WhatsNew, фикс 47-дневного бага unreadCount; стабилизировано) | ~15 КБ |
| [`archive/features-v0.95.19-22.md`](./archive/features-v0.95.19-22.md) | v0.95.19 – v0.95.22 (диагностика tg-new-message, финал jump-to-end, бейдж форум-группы, форум-overlay; стабилизировано) | ~6 КБ |
| [`archive/features-v0.95.15-18.md`](./archive/features-v0.95.15-18.md) | v0.95.15 – v0.95.18 (итеративный fetch + форум-топики + двухфазный scroll + ForumTopicEmptyState; стабилизировано v0.95.20-21) | ~8 КБ |
| [`archive/features-v0.95.12-14.md`](./archive/features-v0.95.12-14.md) | v0.95.12 – v0.95.14 (3 итерации jump-to-end до итеративного fetch v0.95.15, полная сага в jump-to-end-saga.md) | ~32 КБ |
| [`archive/features-v0.95.8-9.md`](./archive/features-v0.95.8-9.md) | v0.95.8 – v0.95.9 (счётчик ↓ обнуляется + анимация + live compact + порог 128) | ~14 КБ |
| [`archive/features-v0.95.5-7.md`](./archive/features-v0.95.5-7.md) | v0.95.5 – v0.95.7 (sticky pinned overlay, кнопка ↓ Telegram-style, drag-to-resize) | ~24 КБ |
| [`archive/features-v0.95.0-3.md`](./archive/features-v0.95.0-3.md) | v0.95.0 – v0.95.3 (контигуити-фикс, afterId load-newer, мигание ↓ Schmitt trigger, диагностика «дёрг») | ~13 КБ |
| [`archive/features-v0.94.1-7.md`](./archive/features-v0.94.1-7.md) | v0.94.1 – v0.94.7 (TDLib listener leak, scroll caskade, спокойная загрузка, пилюля прогресса — стабилизированы v0.95.0-2) | ~24 КБ |
| [`archive/features-v0.93.0.md`](./archive/features-v0.93.0.md) | v0.93.0 (pixel-perfect scroll restore через LocationOptions.offset, superseded v0.94.0) | ~7 КБ |
| [`archive/features-v0.92.0-6.md`](./archive/features-v0.92.0-6.md) | v0.92.0 – v0.92.6 (сага Virtuoso scroll restore, superseded v0.94.0) | ~37 КБ |
| [`archive/features-v0.91.11-24.md`](./archive/features-v0.91.11-24.md) | v0.91.11 – v0.91.24 (сага scroll restore: 13 версий → миграция на virtuoso) | ~47 КБ |
| [`archive/features-v0.91.1-10.md`](./archive/features-v0.91.1-10.md) | v0.91.1 – v0.91.10 (initial-load, scroll-jump, newBelow, forum topics, updateChatLastMessage) | ~12 КБ |
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

### v1.2.17 — миграция на Tailwind 4

24 июня 2026: обновление Tailwind 3.4.19 → **4.3.1** (мажор).

**Что изменено:**
- `npm i -D tailwindcss@4 @tailwindcss/postcss@4`.
- [`postcss.config.js`](../postcss.config.js): плагин `tailwindcss` → `@tailwindcss/postcss` (в Tailwind 4 PostCSS-интеграция вынесена в отдельный пакет); `autoprefixer` убран (Tailwind 4 добавляет вендорные префиксы сам через Lightning CSS).
- [`src/index.css`](../src/index.css): три директивы `@tailwind base/components/utilities` → `@import "tailwindcss";` + `@config "../tailwind.config.js";` (legacy JS-конфиг сохранён ради явных content-путей).
- `tailwind.config.js` не трогали (content-пути + пустой theme).

**Проверки (мой уровень):** lint 0, vitest **1881/1881**, `npm run build` OK (CSS компилируется, NativeApp.css 35.7КБ ≈ как было → утилиты генерируются).

**🔴 Регрессия отступов и её фикс (важный урок):** сразу после миграции пропали ВСЕ отступы (настройки, ИИ-панель, вкладки). Причина: в Tailwind 4 утилиты лежат в `@layer utilities`, а в `src/index.css` был глобальный сброс `* { margin:0; padding:0 }` **вне слоёв**. По CSS-каскаду незалёрные правила **сильнее** залёрных → сброс перебивал все `px-*/py-*/gap-*`. Фикс: завернул сброс в `@layer base { * {...} }` — теперь утилиты (слой позже) побеждают, отступы вернулись. Проверено по собранному CSS (`padding:0` внутри `@layer base`). **Правило на будущее:** любой кастомный глобальный CSS, который должен переопределяться утилитами, держать в `@layer base`, иначе он молча убивает Tailwind-классы.

⚠️ **Всё равно требует визуальной проверки:** Tailwind 4 меняет и другие значения по умолчанию (цвет рамок `border` → `currentColor`, ширина `ring`, переименования `shadow-sm`→`shadow-xs`). Сборка различий НЕ ловит — пройтись глазами по экранам. Откат мгновенный.

**Откат:** `git checkout package.json package-lock.json postcss.config.js src/index.css && npm install` (Tailwind 3 вернётся; приложение при этом закрыть).

### v1.2.16 — обновление стека (Стадия 1, безопасная — в пределах мажоров)

24 июня 2026: выполнено `npm update` — обновление зависимостей **в пределах текущих мажоров** (без рискованных мажор-прыжков). Запускал после полного закрытия приложения (иначе `EBUSY` на занятых файлах Electron).

**Обновлено:** Electron 41.1.0→**41.9.0** (включает фиксы краша `addChildView`), React/react-dom 19.2.4→**19.2.7**, Vite 7.3.1→**7.3.5**, electron-builder 26.8.1→**26.15.3**, vitest 4.1.4→**4.1.9**, lucide-react 1.7→1.21 + патчи jsdom/happy-dom/postcss/autoprefixer/libphonenumber/globals/@playwright/test.

**Стадия 2 (мажоры):** **eslint 9→10.5.0** — сделан (node 24 ок, `npm run lint` чист без правок конфига, vitest 1881/1881, build OK; влияет только на линт, не на приложение). **Vite 8 / @vitejs/plugin-react 6 — НЕЛЬЗЯ:** `electron-vite@5` (наш сборщик) поддерживает только `vite ^5/^6/^7`, а plugin-react 6 требует vite 8 → vite 8 сломал бы `npm run build`. Ждём поддержку vite 8 в electron-vite.

**НЕ тронуто (нужна проверка запуском/глазами, отдельно):** Electron **42** (риск ABI/TDLib — проверить может только запуск приложения), Tailwind **4** (миграция: отдельный `@tailwindcss/postcss` + переписать конфиг, стили проверять визуально). **TDLib** (`prebuilt-tdlib`/`tdl`) **не тронут** — ABI цел, Native Telegram не сломается.

**Проверки (мой уровень):** lint 0, vitest **1881/1881**, `npm run build` OK (3.7с — lucide 1.7→1.21 и Vite 7.3.5 ничего не сломали). **Финальная проверка «работает» — за пользователем** (запуск приложения мне запрещён): особенно проверить **Native Telegram/TDLib** (загрузился ли) и стили.

**Откат:** `git checkout package-lock.json && npm install` (вернёт прежние версии) или `git revert` коммита.

### v1.2.15 — логи диагностики «чёрного экрана» webview

24 июня 2026: добавлена запись в `chatcenter.log`, чтобы понять причину чёрного экрана webview (MAX и др.), когда страница **жива, но картинка не рисуется**.

Новая функция `probeBlackScreen(el, messengerId)` в [`src/utils/webviewDiagnostics.js`](../src/utils/webviewDiagnostics.js) пишет 2 строки `[blackscreen]`:
- **host**: размер / `visibility` / `opacity` элемента `<webview>` + что в центре (`elementFromPoint`) — не перекрыт ли он нашим UI;
- **guest** (через `executeJavaScript`): `visibilityState` / `hidden` (страница «спит»/throttled?), фон `body`, число детей body, полноэкранный fixed/absolute оверлей (экран-объявление мессенджера?), что в центре страницы, число «больших» canvas (рисует ли вообще).

Триггеры — **автоматические, не модалка**: `did-stop-loading` в [`webviewSetup.js`](../src/utils/webviewSetup.js) (ловит «перезагрузил — всё равно чёрный») + `useEffect` на смену `activeId` в [`App.jsx`](../src/App.jsx) (ловит «переключился на вкладку — а там чёрный»). Лог через `app:log` (без `console.*` в renderer).

Поведение **не изменено** — только добавлены логи. Назначение — отличить причины: «страница спит» (`vis=hidden`) vs «оверлей мессенджера» (`fullOverlay`) vs «перекрыто нашим UI» (`cover@center=DIV`) vs «пустой body» (`children=0`). Чёрный экран — проявление нестабильности отрисовки `<webview>`, которую Electron официально [не рекомендует](https://www.electronjs.org/docs/latest/tutorial/web-embeds).

**Проверка issue Electron (по запросу, офиц. источники)**: краш WebContentsView на Win11 [#44934](https://github.com/electron/electron/issues/44934) — ЗАКРЫТ (был Electron 33.2.0; фикс addChildView влит в 36-38; у нас 41 → вероятно уже неактуален). Реальное текущее ограничение WebContentsView — **нет прозрачности** ([#45105](https://github.com/electron/electron/issues/45105), закрыт «as not planned») + нет `destroy()` ([#42884](https://github.com/electron/electron/issues/42884), открыт). Вывод по миграции пересмотрен: не «падает на Win11», а «большая работа + решить наложение окон».

### v1.2.13 — звук Native «Бамбук+» (выбран юзером из 25 вариантов)

23 июня 2026: для Native режима (ЦентрЧатов / TDLib) выбран финальный звук уведомления — **«Бамбук+»**. Юзер прослушал 25 вариантов через временную страничку `sound-preview.html` (удалена после выбора). Параметры:

- **D4** (294Hz, основной бас) — sine, 900мс, attack 40мс
- **A4** (440Hz, тёплая средняя) — sine, +80мс задержка, 850мс
- **F5** (698Hz, тонкий sparkle) — sine, +50мс задержка, 700мс, gain 0.04

**Что менялось в коде**:
- `src/utils/sound.js` — добавлена `playNativeNotificationSound()` (без параметров — звук фиксированный для Native, color больше не нужен). Хелпер `softOsc(ctx, opts)` для генерации с плавным attack.
- `src/hooks/useAppIPCListeners.js` — listener `notif:play-sound` теперь вызывает `playNativeNotificationSound()` вместо `playNotificationSound(color)`. Импорт обновлён.

**Почему именно Бамбук+**: юзер выбрал из 25 вариантов. До этого был Перезвон (#4) — близко, но «деревянный» (triangle). Бамбук (#15) — низкие тёплые ноты понравились. Бамбук+ (#24) добавил sparkle F5 = технологичность без потери мягкости. Не напрягает при пачке уведомлений (gain 0.04 для sparkle, длинный attack, экспоненциальное затухание).

**WebView режимы не затронуты** — продолжают использовать `playNotificationSound(color)` с color-based system из `MESSENGER_SOUNDS`.

**Регрессия**: lint 0, vitest 1881/1881, fileSizeLimits 481/481, check-memory ✅.

---

### v1.2.12 — уведомления Native Telegram по стандарту мессенджеров (TDLib мьют + локальные настройки + звук)

23 июня 2026: приведена в порядок логика уведомлений Native Telegram (ЦентрЧатов) — по стандарту мессенджеров. До правки: уведомления приходили **для всех** чатов без проверки TDLib мьюта (🔕) и **без локальных настроек** ChatCenter; **звук** не играл вообще.

#### Стандарт мессенджеров (теперь работает в Native)

```
chat.isMuted (TDLib серверный мьют) → ДА → ничего. Конец.
                                      ↓ НЕТ
mutedMessengers[id] локальный мьют   → ДА → ничего. Конец.
                                      ↓ НЕТ
notificationsEnabled + ribbon включён → НЕТ → нет окна
                                      ↓ ДА → показать окно
soundEnabled + sound + throttle 3s    → НЕТ → нет звука
                                      ↓ ДА → сыграть звук
```

Звук и окно — **независимы**. Эталон логики — `webviewHandleNewMessage.js:79-103` (тот же что в WebView).

#### Что сделано

**1. TDLib мьют (`chat.isMuted`) — двусторонний серверный**:
- В [`nativeStoreIpc.js`](../src/native/store/nativeStoreIpc.js) handler `tg:new-message` фильтрует ribbon при `chat.isMuted=true` (skip-лог уровня TRACE — не шумит).
- Поле `isMuted` из [`tdlibMapper.js`](../main/native/backends/tdlibMapper.js) через `ChatNotificationSettings.mute_for` ([офиц. дока TDLib](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1chat_notification_settings.html)).
- Двусторонняя связь: правый клик «🔕 На час» в ChatCenter → `setMute` → TDLib `setChatNotificationSettings` → синхронизация на все устройства Telegram.

**2. Локальный ribbon — НОВОЕ**:
- В [`mainIpcHandlers.js`](../main/handlers/mainIpcHandlers.js) handler `app:custom-notify` — для `messengerId.startsWith('native_')` добавлена проверка:
  - `mutedMessengers[id]` (legacy + backwards compat)
  - `settings.notificationsEnabled !== false` (глобальный тоггл)
  - `messengerNotifs[id].ribbon !== false` (per-messenger в Settings)
- Если ribbon выключен → `return { ok:false, skipped:'local-ribbon-disabled' }` ДО показа окна.
- WebView не затронут (фильтр `startsWith('native_')`).

**3. Звук Native — НОВОЕ (никогда не работал)**:
- В [`useAppIPCListeners.js`](../src/hooks/useAppIPCListeners.js) добавлен 5-й useEffect — listener `notif:play-sound`:
  - Триггер из main: `mainIpcHandlers.js` шлёт `webContents.send('notif:play-sound', {messengerId, color})`.
  - Фильтр `messengerId.startsWith('native_')` — защита от дубля с WebView звуком.
  - Проверки: `settings.soundEnabled !== false` + `!mutedMessengers[id]` + `messengerNotifs[id].sound !== false`.
  - Throttle 3 сек через общий `lastSoundTsRef` (тот же что у WebView).

**4. 5 точек диагностики пути уведомления** (добавлены отдельно):
- `[native-notif] emit` в `nativeStoreIpc.js`
- `[notif-ipc] custom-notify recv` в `mainIpcHandlers.js`
- `[notif-window] event=show/hide/move/blur/focus` в `notificationManager.js`
- `slideIn done id=N` в `notification.js` (success path)
- Расширен `[NotifManager] show` — `dismissMs`, `grouping`, `expanded`, `winVisible`

**5. Удалён мёртвый диагностический логгер** (отдельный фикс):
- В [`MessageBubble.jsx`](../src/native/components/MessageBubble.jsx) функция `__ccLogBubbleRender(m)` (v0.95.29, диагностика дубля исходящих) слала `app:log` на КАЖДЫЙ рендер — 168508 IPC за 30 мин юзер-сессии. Бага дубля закрыт в v0.95.31-34, логгер забыли удалить (паттерн проекта — TODO-9 в `code-todo.md`).

**6. Разбиение файлов** (превысили лимиты):
- [`nativeStoreIpc.js`](../src/native/store/nativeStoreIpc.js) 734 → 643 строк: handlers `tg:typing`/`tg:send-succeeded`/`tg:upload-progress` вынесены в [`nativeStoreSendIpc.js`](../src/native/store/nativeStoreSendIpc.js) (123 стр). Ceiling 730→660.
- [`notification.js`](../main/notification.js) 700 → 686 строк: `createPinBtn` вынесена в [`notification-helpers.js`](../main/notification-helpers.js) (34 стр). Подключается через `<script>` в `notification.html`. Копирование в `electron.vite.config.js`.

#### Неверные шаги — для будущих

**❌ Шаг №1** — гипотеза «спам-логгер блокирует уведомления».

Я связал три факта (168k IPC, успешный `[NotifManager] show` в логе, юзер не видит окно) в причинную цепочку без доказательств. Нарушение правила «3 факта, 1 уровень 1». После удаления логгера юзер всё равно не видел уведомления — потому что **не было звука**, а юзер ассоциировал «нет звука» с «нет уведомления». Удаление логгера было полезным (диагностика отслужила), но **не корнем**.

**❌ Шаг №2** — предложение отката `chat?.isMuted` фильтра.

Я предложил откатить TDLib мьют, увидев что 63% уведомлений блокируются. Юзер остановил: «Я ожидаю что уведомления будут для чатов которые **не заглушены**. Это **стандарт мессенджеров**». Я неправильно интерпретировал — думал юзер хочет уведомления для всех. На самом деле — по стандарту: TDLib мьют + локальные настройки.

**✅ Верный шаг** — после уточнения у юзера:
- TDLib мьют (двусторонний с сервером) **сохранён** — это «заглушить совсем»
- Локальные настройки ChatCenter **добавлены** — это «как программа реагирует на не-заглушённые»
- Звук в Native **добавлен впервые** через IPC `notif:play-sound`

#### Тесты — 31 unit-тест защиты от регрессии

1. [`nativeStoreMutedNotify.vitest.jsx`](../src/native/store/nativeStoreMutedNotify.vitest.jsx) — **7 тестов** на TDLib мьют (сохранён)
2. [`notifPlaySound.test.cjs`](../src/__tests__/notifPlaySound.test.cjs) — **13 тестов** на listener звука (WebView пропускается, throttle, settings)
3. [`customNotifyLocal.test.cjs`](../src/__tests__/customNotifyLocal.test.cjs) — **11 тестов** на main фильтр Native ribbon

#### Регрессия

- `npm run lint` — 0 warnings ✅
- `npx vitest run` — все Vitest тесты ✅
- `fileSizeLimits.test.cjs` — 479/479 ✅
- `npm run check-memory` — 4/4 версии согласованы ✅

#### Требует проверки запуском

1. **TDLib мьют**: правый клик на чате → «🔕 На час» → 🔕 встанет в списке + перестанет показывать уведомления. На телефоне в Telegram тоже встанет 🔕.
2. **Локальный ribbon выкл**: Settings → ЦентрЧатов → выключить «Ribbon» → новые сообщения не показывают окно, но звук может играть.
3. **Локальный звук выкл**: Settings → ЦентрЧатов → выключить «Звук» → окно показывается, звука нет.
4. **Всё включено + чат не заглушён**: окно + звук.

#### Что **не закрывает** v1.2.12

- Глобальный мьют TDLib скоупа через `use_default_mute_for=true` — отдельная задача
- `messenger:badge` listener в `useAppIPCListeners.js:33-54` — никем не эмитится (мёртвый код), не удалён в этой задаче

### v1.2.11 — наблюдатель за списком чатов MAX (настоящее решение)

23 июня 2026: финальное решение потери уведомлений MAX — наблюдатель за списком чатов в `max.hook.js`, по образцу рабочего `whatsapp.hook.js` (`_sidebarObserver`).

**Почему именно так (доказано):** путь через ServiceWorker (`showNotification`) в Electron-`<webview>` невозможен — Electron официально рекомендует не использовать `<webview>` ([webview-tag doc](https://www.electronjs.org/docs/latest/api/webview-tag)), регистрация SW падает 222× «Operation has been aborted» (баг класса [electron #9529](https://github.com/electron/electron/issues/9529): перемещение webview в DOM пересоздаёт гостя и прерывает SW). Попытка v1.2.10 (не убивать SW) это подтвердила — SW всё равно не зарегистрировался, `__CC_NOTIF__` = 0. Единственный надёжный источник «новое сообщение» — DOM списка чатов.

**Что добавлено** в `main/preloads/hooks/max.hook.js`:
- `_maxRowInfo(row)` — структурный разбор строки чата: имя из leaf с классом `title/name`, тело из leaf с классом `text/message/preview` (с отсевом повтора имени, бейджей-чисел, `badge/indicator/meta/counter`). Селекторы не завязаны на нестабильные `svelte-*` классы.
- `_maxScanList(root, emit)` — скан до 60 строк, дедуп по `_maxLastList[sender]` (последнее превью на чат). На изменение превью → `__CC_NOTIF__ {t,b,i}`.
- `MutationObserver` на `document.body` (childList+subtree+characterData), дебаунс 350мс, старт через 8с (после warm-up). Первый проход — только заливка `_maxLastList` без уведомлений (не шумит существующими чатами). Корень списка ре-запрашивается на каждом скане → переживает ре-рендер SvelteKit.
- Переиспользует `_isSpam` и `_findAvatarIn` (без дублирования). Дедуп между наблюдателем и заголовком-fallback — пайплайн (sender-scope, 8-10с) + guard самого fallback.

**Честные остаточные ограничения:** (1) фоновая сверхбыстрая пачка в один чат (быстрее ~350мс дебаунса) может слиться — список хранит только последнее превью; 100% даёт лишь перехват WebSocket MAX (непрозрачный протокол, хуже по надёжности — не делаем). (2) Зависимость от вёрстки MAX (структурные селекторы снижают риск, но не убирают). (3) Возможны 1-2 итерации антифантомной настройки, как было у WhatsApp. **Требует проверки запуском** (повтор пачки → в журнале должны пойти `__CC_NOTIF__` от MAX).

### v1.2.10 — корень потери уведомлений MAX (оживлён задуманный путь)

23 июня 2026: исправлена настоящая причина, по которой в MAX «первое сообщение даёт звук+ribbon, а следующие в пачке — нет».

**Как должно работать (задумано):** все 4 хука (`telegram/vk/whatsapp/max.hook.js`) перехватывают **собственный вызов уведомления** мессенджера (`Notification` + `ServiceWorkerRegistration.showNotification`) → шлют `__CC_NOTIF__` на каждое сообщение. Запасной путь по заголовку (`maxTitleFallback.js`) — только аварийный fallback (см. комментарий в его шапке).

**Корень бага (доказан живой диагностикой v1.2.9):**
- `max.hook.js` перехватывал `showNotification` ([строка 175](../main/preloads/hooks/max.hook.js)), но **сам же удалял/блокировал ServiceWorker** (старые строки 207-210: `register→reject` + `getRegistrations→unregister`).
- По стандарту (MDN) `ServiceWorkerRegistration.showNotification` / `navigator.serviceWorker.ready` работают только при **активном** SW. Убили SW → MAX физически не может вызвать showNotification → `__CC_NOTIF__` от MAX **0 раз** на 12608 строк журнала.
- Оставался только костыль-заголовок, а заголовок MAX = «N непрочитанных **чатов**», не сообщений. Поэтому 2-е/3-е сообщение в уже непрочитанном чате не меняло счётчик → проверка не запускалась → «Цыч»/«Тцыы» терялись (в журнале «Цыч» 0 раз). «Оцыя» показалось только потому, что юзер кликнул на чат (клик заново дёрнул заголовок).
- «Operation has been aborted» в логе — следствие того, что хук грузится через +1500 мс ([webviewSetup.js:375](../src/utils/webviewSetup.js)) и удаляет уже зарегистрированный MAX'ом SW на ходу.

**Что изменено:** в `max.hook.js` блок «SERVICE WORKER BLOCK» заменён: SW MAX больше **не трогаем** (регистрируется штатно → `showNotification` ловится нашим перехватом на каждое сообщение и не показывает системное уведомление). Вместо удаления SW блокируем только подписку на push (`PushManager.prototype.subscribe` → `__CC_PUSH_BLOCKED__`), чтобы не было фоновых системных уведомлений при свёрнутом окне. Telegram/VK/WhatsApp **не тронуты** (у них рабочий путь через `new Notification`).

**Требует проверки запуском** (нельзя подтвердить только чтением): появится ли `__CC_NOTIF__` от MAX и не лезут ли системные уведомления. План Б, если MAX шлёт уведомления только из фонового push (SW-контекст, наш main-thread перехват его не видит) — умный DOM-сторож списка чатов.

### v1.2.9 — диагностика видит полную историю (сняты ограничения)

23 июня 2026: устранена причина, по которой в отчёт диагностики попадала **не вся** история событий — из-за чего быстрая пачка MAX-сообщений «исчезала» из анализа за несколько минут.

Найдено 4 слоя обрезки (от важного к мелкому):
1. **Главный — буфер трассировки в памяти** ([`src/utils/webviewSetup.js`](../src/utils/webviewSetup.js), `traceNotif`): держал только ~300 последних шагов (`splice(0,100)` при >300). А `maxFallbackEvents` для диагностики строится **именно из этого буфера**, не из лога. Значит анализ MAX физически не видел дальше 300 шагов. Увеличено **300→5000** (выкидываем 1000 старых при переполнении).
2. **Чтение лога для снимка** ([`main/utils/systemDiagnostics.js`](../main/utils/systemDiagnostics.js) `collectSystemDiagnostics`): читалось `readLogFile(1000)` — последние 1000 строк. Теперь `readLogFile(Infinity)` — весь `chatcenter.log` (он ограничен ротацией 2 МБ → безопасно).
3. **Срезы анализа** ([`src/utils/systemDiagnostics.js`](../src/utils/systemDiagnostics.js)): трасса `slice(-300)→slice(-5000)`, MAX-события `slice(-30)→slice(-500)`, цепочки `buildNotificationChains limit 40→2000`, недавние ошибки/преды `slice(-20)→slice(-500)`.
4. **Срезы на экране** ([`src/components/SystemDiagnosticsModal.jsx`](../src/components/SystemDiagnosticsModal.jsx)): MAX-события `-10→-100`, цепочки `-20→-200` (это только отображение, на файл не влияло).

**Почему не «бесконечно»**: буфер трассировки живёт в памяти всё время работы программы — без предела это утечка памяти и гигантский файл отчёта. Поэтому пределы подняты до больших безопасных значений. Постоянный полный архив всех `[TRACE]`-строк — `chatcenter.log` (ротация 2 МБ).

Поведение уведомлений **не менялось** — только объём данных, попадающих в диагностику. Это подготовка к точному разбору бага MAX «первое сообщение даёт звук+ribbon, следующие в пачке — нет».

### v1.2.8 — системная диагностика в настройках

19 июня 2026: в окно настроек добавлена отдельная кнопка `🩺 Диагностика системы`. Старый блок `ai-errors.log` не заменён и продолжает отвечать только за ошибки AI-провайдеров.

22 июня 2026: исправлен UX самой модалки диагностики после ручной проверки пользователем. Переключатели больше не показывают непонятный знак `?`, состояние написано словами `вкл/выкл`; кнопки получили hover/pressed/focus-отклик; текст под кнопками объясняет обычное обновление и глубокую WebView-проверку простыми словами. Убрано дёргание окна при обновлении: `runtimeContext` и deep-check callback переведены на `useRef`, поэтому модалка не перезапускает загрузку из-за каждого родительского рендера. Overlay поднят выше остальных слоёв (`zIndex: 1000001`), чтобы после Alt-Tab/смены окна диагностика не терялась под настройками и её можно было закрыть без перезапуска приложения.

22 июня 2026: исправлена точность отчёта диагностики по уведомлениям. Пустые поля `error=` / `error= sender=...` больше не считаются ошибками: реальной ошибкой считается `[ERROR]`, непустое `error=...`, `failed` или русское `ошибка`. Отчёт отдельно показывает две полезные подсказки для разбора уведомлений: `Уведомления без аватарки` и `Есть сгруппированные уведомления`, чтобы не смешивать реальные проблемы с общим счётчиком ошибок. Для MAX hook расширено извлечение аватарки: теперь он пробует `data:` image, `http/https` URL и canvas/dataURL как запасной путь. Это не меняет фильтры сообщений и не блокирует тексты клиентов.

22 июня 2026: уточнён порядок извлечения аватарки MAX после свежих логов диагностики. Логи показали, что `MAX title-fallback raw` видит аватарку в DOM (`imgs[...] https://i.oneme.ru/...`), но итоговый результат отдаёт `avatar:""` и уведомление приходит с `icon=false`. Причина: внешний URL мог теряться при попытке canvas export. Теперь `http/https` URL аватарки возвращается до попытки `drawImage/toDataURL`, а canvas остаётся запасным путём для canvas/data-источников. Это не меняет текст уведомлений, отправителя, звук, группировку и фильтры.

**Зачем**: раньше можно было посмотреть только `userData/ai-errors.log`, поэтому при проблемах WebView, уведомлений, native backend или общих IPC приходилось вручную искать разные логи и было сложно дать Codex/другому ИИ полную картину. Новая диагностика собирает единый снимок состояния приложения и показывает цепочки событий.

**Что делает решение**:
- читает общий `chatcenter.log` через новый IPC `app:diagnostics-snapshot`;
- читает `ai-errors.log`, но показывает его как отдельный AI-журнал;
- анализирует ошибки, цепочки notification/WebView/native, статусы подключений и runtime-контекст приложения;
- сохраняет JSON-отчёт в `userData/system-diagnostics-report.json`, чтобы Codex/другой ИИ мог прочитать его без ручного копирования из UI;
- маскирует `token`, `apiKey`, `clientSecret`, `password`, `Authorization Bearer` перед показом/сохранением;
- кнопка `Очистить экран` очищает только экран/буфер новой диагностики и не удаляет `chatcenter.log` или `ai-errors.log`;
- глубокая WebView-проверка выключена по умолчанию и запускается только вручную/переключателем, чтобы не нагружать приложение постоянно.

**Файлы изменения**: `src/components/SystemDiagnosticsModal.jsx`, `src/utils/systemDiagnostics.js`, `main/utils/systemDiagnostics.js`, `main/handlers/mainIpcHandlers.js`, `src/components/SettingsPanel.jsx`, `src/App.jsx`.

**Проверки**: добавлены `systemDiagnostics.test.cjs`, `systemDiagnosticsMain.test.cjs`; `appStructure.test.cjs` проверяет lazy-подключение модалки; `ipcChannels.test.cjs` проверяет IPC `app:diagnostics-snapshot` и `app:diagnostics-save-report`.

**Deploy-вывод**: в документации проекта не найдена Docker/server deploy-команда. Доступны только `npm run build`, `npm run start:prodlike`, `npm run dist:win` и CI. Серверный deploy нельзя выполнять без точной документированной команды.
---
### v1.2.7 — MAX WebView: rich title-fallback для ribbon

18 июня 2026: добавлен MAX-only fallback для случая, когда `web.max.ru` увеличил `title/unread`, но не прислал `__CC_NOTIF__`/`__CC_MSG__`. Через `700мс` он достает text/sender/avatar из DOM MAX и вызывает обычный `handleNewMessage()`, поэтому внешний вид ribbon остается прежним; опасные `body-fallback`/`Path 2` не возвращались. Исправлена опечатка `senderNotifTsRef` → `notifSenderTsRef`. Подробная проблема, диагностика, риски и откат: [`mistakes/notifications-ribbon.md` Ловушка #32](./mistakes/notifications-ribbon.md).

---

### v1.2.7 — WhatsApp: защита от фантомных ribbon при входе в чат

**Зачем**: при входе в WhatsApp-чат sidebar watcher мог отправлять фантомные уведомления `ic-expand-more` и старое preview `Фото`. Факты из `chatcenter.log` 17 июня 2026: `wa-open: chat="Виноградов Александр" picked="ic-expand-more"` → `Источник: ic-expand-more | __CC_NOTIF__` → `Ribbon: ic-expand-more | отправлен`; через секунду аналогично `Фото`. Это совпало с ранее задокументированной Ловушкой 62 (`archive/features-pre-v0.87.md` v0.86.2-v0.86.4): `ic-expand-more` бывает SVG title без `data-icon`, поэтому старый фильтр `closest('[data-icon]')` не срабатывал.

**Что изменено**:
- [`main/preloads/hooks/whatsapp.hook.js`](main/preloads/hooks/whatsapp.hook.js) — добавлен фильтр служебных SVG/UI-текстов: `svg title`, `ic-*`, `wds-ic-*`, `status-*`, `default-user`, `down-context`, `x`.
- Открытая строка чата без unread badge теперь только обновляет `_lastSidebarTexts` и пишет DIAG `skip open chat`, но не шлёт `__CC_NOTIF__`.
- [`src/__tests__/notifHooks.test.cjs`](src/__tests__/notifHooks.test.cjs) — guard-тесты на SVG title без `data-icon`, icon-name тексты и `isOpen && !badge` skip.

**Почему так**: Memory Bank прямо предупреждает, что `MutationObserver/getLastMessageText` не отличает новое сообщение от старого DOM при смене/открытии чата (`mistakes/notifications-ribbon.md`). Полностью выключать watcher нельзя: для WhatsApp/MAX/VK он нужен, когда Notification API или unread count не дают отдельный ribbon. Поэтому выбран минимальный фильтр доказанных служебных фантомов + блок только открытой строки без badge.

---

### v1.2.6 — AI Agent автоматически использует WebView Bridge

**Зачем**: при выбранном `ГигаЧат free` нижний ИИ-помощник работал как WebView, но верхний AI Agent мог идти в API-путь и падал с ошибкой `gigachat needs both clientId (apiKey) and clientSecret`. Пользователь выбирал бесплатный WebView-режим, а агент всё равно просил API-секреты.

**Что изменено**:
- [`src/components/AISidebarAgent.jsx`](src/components/AISidebarAgent.jsx) — если активный провайдер в `mode='webview'`, Agent сам включает Bridge и показывает «Авто: через Bridge/WebView».
- [`src/components/AISidebar.jsx`](src/components/AISidebar.jsx) — Agent получает `onSettingsChange`, ручной Bridge-toggle для API-провайдеров сохраняется.
- [`src/utils/aiBridge/agentBridgeRunner.js`](src/utils/aiBridge/agentBridgeRunner.js) — первый шаг chain теперь строится по режиму провайдера: `webview → webui`, `api → api`.
- [`src/utils/aiBridge/buildAutoChain.js`](src/utils/aiBridge/buildAutoChain.js) — GigaChat API добавляется в резерв только если есть оба значения: `apiKey/clientId` и `clientSecret`.
- [`src/utils/aiBridge/agentBridgeErrors.js`](src/utils/aiBridge/agentBridgeErrors.js) — технические ошибки WebView Bridge переводятся в понятные сообщения для пользователя.

**Как теперь работает**:
```
ГигаЧат free / WebView
        ↓
AI Agent сам включает Bridge
        ↓
Первый шаг: mode='webui'
        ↓
Запрос идёт в открытый сайт ГигаЧат
        ↓
API clientId/clientSecret не требуются
```

**Тесты (+9)**:
- Новый [`src/components/AISidebarAgent.vitest.jsx`](src/components/AISidebarAgent.vitest.jsx): авто-Bridge для WebView и сохранение ручного Bridge для API.
- Обновлены `agentBridgeRunner.vitest.js`, `buildAutoChain.vitest.js`, `useAIAgent.vitest.jsx`.
- Точечная проверка: `npm.cmd run test:vitest -- buildAutoChain agentBridgeRunner AISidebarAgent useAIAgent agentBridgeErrors`.

---

### Старые версии

Остальные версии хранятся в архиве выше по ссылкам, чтобы память не разрасталась. Файл `features.md` держим коротким: только последние активные изменения, чтобы он не превышал лимит 100 КБ и не замедлял чтение ИИ.

---

### 22 июня 2026 — MAX: аватарки и повторные ribbon-уведомления по отправителю

**Проблема**: свежие логи MAX показали два разных корня. Когда DOM выбранной строки содержит `avatar=https://i.oneme.ru/...`, аватарка доходит до ribbon (`icon=true`). Когда MAX в текущей строке отдаёт `avatar=""`, `imgs=0`, `chosenAvatar=false`, уведомление приходит без аватарки не из-за потери в renderer, а потому что в момент проверки у строки нет картинки. Отдельно renderer группировал уведомления только по `messengerId`, поэтому второе уведомление MAX могло попасть строкой внутрь уже открытой карточки и выглядеть как "не показалось". Дедуп также частично строился по `messengerId + text`, что могло смешивать одинаковый текст от разных клиентов.

**Решение**:
- аватарки кешируются не "на весь MAX", а по ключу `messengerId + chatTag/senderName + senderName`;
- свежая аватарка всегда обновляет кеш, пустая аватарка старую не стирает;
- кеш используется только когда новое событие пришло без аватарки и есть тот же отправитель/чат;
- дедуп входящих сообщений получил scope по отправителю/чату через `buildMessageDedupScope`;
- main ribbon dedup получил `buildNotificationScope`, чтобы одинаковый текст от разных отправителей не считался одним событием;
- renderer grouping теперь получает `stackKey` и группирует карточки по отправителю/чату, а не только по всему `messengerId`.

**Почему так безопаснее при смене аватарки**: если клиент поменял аватарку и MAX отдал новую картинку, она сразу перезаписывает старую. Если MAX временно не отдал картинку в виртуализированной строке, берётся последняя известная аватарка этого же отправителя/чата. Чужая аватарка не должна подставляться по одному только `messengerId`.

**Файлы**: `src/utils/maxTitleFallback.js`, `src/utils/consoleMessageHandler.js`, `src/utils/messageProcessing.js`, `src/utils/webviewHandleNewMessage.js`, `src/utils/webviewSetup.js`, `main/handlers/notificationManager.js`, `main/notification.js`.

**Проверки**: добавлены/обновлены `maxTitleFallback.test.cjs`, `messageProcessing.test.cjs`, `notificationIdentity.test.cjs`. Проверяют смену аватарки, запрет затирать кеш пустым avatar, раздельные ключи разных отправителей, sender-aware dedup и grouping по `stackKey`.
