# План: ServiceWorker-уведомления через WebContentsView (безопасная миграция)

**Создан:** 24 июня 2026 (v1.2.18, Electron 42.5.0)
**Статус:** 🟡 ПЛАН (код не начат). Это карта действий, а не отчёт о сделанном.
**Цель:** включить штатные уведомления мессенджеров (через ServiceWorker), не сломав ничего рабочего.

> ⚠️ Главная честность этого документа: по официальной доке миграция — **самый правдоподобный путь, но НЕ гарантия**. Доказательство уровня 1, что уведомления реально заработают, — только **пилот** (Фаза 2). До него говорим «вероятно решится», а не «решено».

---

## 1. Зачем это вообще (простыми словами)

ServiceWorker — фоновый «сторож» сайта: через него мессенджер (MAX, Telegram-web и др.) штатно показывает уведомление на **каждое** сообщение. Сейчас мы его НЕ используем — вместо него самодельный **наблюдатель за списком чатов** (DOM-обход). Обход рабочий, но с потолком: быструю пачку в один чат может слить, зависит от вёрстки сайта.

«Запустить сервис уведомлений» = оживить ServiceWorker. А он работает только в нормальном окне (`WebContentsView`), не в текущем `<webview>`. Значит цель = безопасно перевести мессенджеры с `<webview>` на `WebContentsView`.

---

## 2. Все факты (с источниками и уровнями)

Уровень 1 = офиц. документация/баг-трекер Electron. Уровень 2 = код проекта. + наши живые данные (запуск).

| # | Факт | Источник | Уровень |
|---|---|---|---|
| F1 | ServiceWorker в текущем `<webview>` **не регистрируется** (наш эксперимент v1.2.10: перестали блокировать SW у MAX → 0× `__CC_NOTIF__`, 222× «Operation has been aborted») | `chatcenter.log` + [features.md v1.2.10-11](./features.md) | данные запуска |
| F2 | Electron официально: **«We do not recommend you to use WebViews»**, + «не гарантируем, что WebView API останется» | [web-embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds), [webview-tag](https://www.electronjs.org/docs/latest/api/webview-tag) | 1 |
| F3 | Electron поддерживает ServiceWorker **на уровне сессии** (`session.serviceWorkers`, регистрация после `navigator.serviceWorker.register`) | [ServiceWorkers](https://www.electronjs.org/docs/latest/api/service-workers) | 1 |
| F4 | `WebContentsView` — официальная замена `BrowserView`, обычный WebContents (не проблемный `<webview>`-гость) | [PR #35658](https://github.com/electron/electron/pull/35658), [web-contents-view](https://www.electronjs.org/docs/latest/api/web-contents-view) | 1 |
| F5 | Краш на Win11 при `addChildView` (#44934) — **закрыт**, был на Electron 33, фикс влит в 36-38; у нас **42.5** → блокер снят | [#44934](https://github.com/electron/electron/issues/44934) | 1 |
| F6 | Методы `View` для «дирижирования» окном есть: `setVisible`/`setBounds`/`removeChildView`/`setBackgroundColor`/`setBorderRadius` | [View](https://www.electronjs.org/docs/latest/api/view) | 1 |
| F7 | 🟡 **Прямого утверждения «SW работает в WebContentsView» в доке НЕТ** — это сильный вывод по аналогии (F3+F4), не documented-факт. Доказывается только пилотом | (отсутствие источника) | честный пробел |
| F8 | WebContentsView **непрозрачен** и не будет (#45105 «as not planned») → наши плашки/панели/модалки спрячутся за окном → их надо прятать/двигать (F6) | [#45105](https://github.com/electron/electron/issues/45105) | 1 |
| F9 | Нет `destroy()` (#42884, открыт) → закрывать через `webContents.close()` + убрать ссылки; для нас мелочь (5 окон, редко создаём/удаляем) | [#42884](https://github.com/electron/electron/issues/42884), [webContents](https://www.electronjs.org/docs/latest/api/web-contents) | 1 |
| F10 | preload в дочернем WebContentsView (#44897, закрыт) — **нас, вероятно, не касается**: хук грузим через `executeJavaScript`, не через `preload`-атрибут | [#44897](https://github.com/electron/electron/issues/44897), [webviewSetup.js:369](../src/utils/webviewSetup.js) | 1 + 2 |
| F11 | Пилот WCV **уже был построен** (v0.89.42-49: `WebContentsViewSlot`, мост, IPC, тумблер) и **откатан** в v0.91.0 из-за #44934 (тогда Electron 41). Файлы удалены, остались комментарии-следы | [main.js:49](../main/main.js), [windowManager.js:2-7](../main/utils/windowManager.js), [sessionSetup.js:17](../main/utils/sessionSetup.js) | 2 |
| F12 | Хуки сейчас: telegram/vk/whatsapp **блокируют** SW; max SW разрешает (инертно); whatsapp+max используют **DOM-наблюдатель** как обход | [max.hook.js:206](../main/preloads/hooks/max.hook.js), [whatsapp.hook.js:111](../main/preloads/hooks/whatsapp.hook.js) | 2 |
| F13 | Нативная вкладка «ЦентрЧатов» (TDLib) — это **React, не webview** → миграция её **НЕ затрагивает** (риск для TDLib минимален) | [src/native/](../src/native/) | 2 |
| F14 | Текущий стек: Electron 42.5.0, React 19.2.7, Vite 7.3.5, electron-vite 5.0.0, Tailwind 4.3.1, eslint 10.5 (сверено с node_modules) | [package-lock.json](../package-lock.json) | 2 |

**Вывод из фактов:** SW в `<webview>` мёртв (F1, доказано). Путь к SW = WebContentsView (F3, F4), блокер снят на Electron 42 (F5). Но решение **не гарантировано докой** (F7) и есть боль наложения окон (F8). Значит — поэтапно, за флагом, с обязательным пилотом-доказательством.

---

## 3. Как сейчас устроены уведомления (что НЕ ломаем)

1. Хук мессенджера (`main/preloads/hooks/<type>.hook.js`) грузится в `<webview>` через `executeJavaScript` после dom-ready.
2. Хук перехватывает `window.Notification` и `ServiceWorkerRegistration.prototype.showNotification` → шлёт `console.log('__CC_NOTIF__'+json)`.
3. Renderer ловит это в `console-message` ([consoleMessageHandler.js](../src/utils/consoleMessageHandler.js)) → `handleNewMessage` → дедуп/звук/ribbon ([webviewHandleNewMessage.js](../src/utils/webviewHandleNewMessage.js)).
4. Для MAX/WhatsApp (SW мёртв) — `MutationObserver` за списком чатов шлёт тот же `__CC_NOTIF__`.
5. Главный процесс показывает плашку ([notificationManager.js](../main/handlers/notificationManager.js)).

Эта цепочка остаётся; меняется только **где живёт страница мессенджера** (webview → WebContentsView) и **что мы НЕ глушим SW**.

---

## 4. Опасные зоны (что может сломаться) — читать ДО кода

| Зона | Риск | Защита |
|---|---|---|
| 🔴 **Наложение окон (z-order)** | Нативный WCV рисуется ПОВЕРХ html + непрозрачен (F8) → плашки уведомлений, панель ИИ, модалки, выпадашки, контекст-меню **спрячутся за** мессенджером | Прятать/сжимать/двигать view (`setVisible`/`setBounds`) на время показа оверлеев. **Решать ПЕРВЫМ (Фаза 1).** |
| 🔴 Переключение вкладок / скролл / зум / мульти-аккаунт | Сейчас завязано на `<webview>` DOM-элемент; WCV позиционируется из main по пикселям | Мост renderer↔main для позиционирования; пилот на 1 мессенджере |
| 🟡 Перенос перехвата уведомлений | console-message webview → в WCV через `webContents.on('console-message')` или executeJavaScript-инъекцию | Оставить DOM-наблюдатель как fallback |
| 🟢 **TDLib / Native ЦентрЧатов** | НЕ затронут (F13) — это React, не webview | — |
| 🟡 Сборка | electron-vite должен корректно собрать новый код | `npm run build` после каждой фазы |
| 🔴 Проверка | Запуск приложения агенту запрещён правилами | **Верификацию каждой фазы делает пользователь** |

**Граничные случаи для пилота:** SW может не зарегистрироваться даже в WCV (F7 — не считать заранее); фоновый push (SW-контекст) ≠ foreground showNotification; изоляция партиций (`persist:wcv-*`).

---

## 5. Полный план по этапам

Принцип: **всё за флагом `useWebContentsView` (default OFF)**, `<webview>` остаётся основным до самого конца. Любой шаг откатывается тумблером.

### Фаза 0 — Восстановить леса пилота (НИЧЕГО не ломает)
- **Что:** поднять из git-истории (v0.89.42-49) удалённые при откате файлы: `WebContentsViewSlot.jsx`, `webContentsViewBridge.js`, `webContentsViewIpcHandlers.js`, хук `useWebContentsView`, тумблер в Настройках. Default **OFF**.
- **Почему:** фундамент; при OFF поведение = текущее.
- **Проверка:** `npm run build` + lint + vitest; тумблер виден, выключен; приложение работает как раньше (пользователь).
- **Откат:** удалить восстановленные файлы / тумблер.

### Фаза 1 — Один мессенджер за флагом + РЕШИТЬ НАЛОЖЕНИЕ ОКОН
- **Что:** включать WCV только для MAX при тумблере ON. **Сразу** реализовать: при открытии модалки/панели ИИ/выпадашки — `view.setVisible(false)` или сдвиг `setBounds`, потом вернуть.
- **Почему:** наложение окон (F8) — главная боль; если не решить первым, всё «спрячется».
- **Проверка (пользователь):** MAX открывается в WCV; модалки/панель ИИ/настройки видны ПОВЕРХ мессенджера; переключение вкладок работает.
- **Откат:** тумблер OFF.

### Фаза 2 — 🔴 ДОКАЗАТЬ ServiceWorker (критический гейт)
- **Что:** в WCV-режиме **НЕ блокировать** SW (в отличие от webview-хуков). Проверить журнал.
- **Почему:** это единственное доказательство уровня 1 (закрывает пробел F7). Без него миграцию НЕ продолжать.
- **Критерий успеха:** в `chatcenter.log` появляется `__CC_NOTIF__` от MAX на каждое сообщение (а не «aborted»).
- **Если провал:** SW в WCV тоже не заводится → СТОП миграции, остаёмся на DOM-наблюдателе (он рабочий). Документировать результат в [webcontents-view-pilot-results.md](./webcontents-view-pilot-results.md).
- **Откат:** тумблер OFF.

### Фаза 3 — Перенести перехват уведомлений
- **Что:** хук-инъекция в WCV + перехват `showNotification`/`Notification`; DOM-наблюдатель оставить как fallback. Дедуп с заголовком-fallback.
- **Проверка (пользователь):** пачка сообщений в MAX → все ловятся, без дублей.
- **Откат:** тумблер OFF.

### Фаза 4 — Раскатать на остальные мессенджеры
- **Что:** по одному (Telegram-web, VK, WhatsApp), каждый — отдельная проверка пользователем.
- **Критерий:** 0 крашей за 30 мин, память не растёт >100 МБ/час (критерии из [webcontents-view-pilot-results.md](./webcontents-view-pilot-results.md)).
- **Откат:** тумблер OFF (возврат всех на webview).

### Фаза 5 — Финал (только после 1-2 недель стабильности)
- **Что:** сделать WCV режимом по умолчанию; убрать `<webview>` fallback; убрать тумблер и пилот-документацию.
- **Почему:** нельзя оставлять два движка навсегда.
- **Откат:** последний коммит до удаления webview.

---

## 6. Критерии готовности (definition of done)
- ✅ Уведомления MAX/Telegram/VK/WhatsApp приходят на **каждое** сообщение через SW (`__CC_NOTIF__`), а не через костыль.
- ✅ Плашки/панель ИИ/модалки видны ПОВЕРХ мессенджера.
- ✅ Переключение вкладок, скролл, зум, мульти-аккаунт — как раньше.
- ✅ TDLib/Native не затронут.
- ✅ 0 крашей за 30 мин активной работы, память стабильна.
- ✅ lint 0, vitest зелёный, build OK на каждой фазе.

## 7. Что НЕ входит / отложено
- Vite 8 / @vitejs/plugin-react 6 — заблокированы `electron-vite 5` (поддерживает vite ≤7). Ждём electron-vite.
- prebuilt-tdlib апдейт (ABI-риск без нужды).

## 8. Глобальный откат
- На любой фазе: тумблер `useWebContentsView` → OFF → `<webview>` снова основной, данные не теряются.
- Полный откат миграции: `git revert` коммитов фаз, либо ветка `feature/wcv-migration` отдельно от рабочей.

## 9. Где сломается через месяц (самопроверка)
1. Если поверить «дока = решено» и мигрировать всё разом — рискуем упереться в незаведшийся SW (как с webview). → Защита: **Фаза 2 (доказать SW) ДО раскатки**.
2. Если не решить наложение окон в Фазе 1 — модалки/панели спрячутся за мессенджером. → Защита: **окна — первый шаг**.
3. Вёрстка мессенджеров меняется → DOM-наблюдатель-fallback держим как страховку.

---

## Связанные документы
- [webcontents-view-pilot-results.md](./webcontents-view-pilot-results.md) — лог пилотов (критерии, чек-лист).
- [electron-breaking-changes.md](./electron-breaking-changes.md) — статусы issue Electron + снапшот версий стека.
- [mistakes/notifications-ribbon.md](./mistakes/notifications-ribbon.md) — сага уведомлений MAX (почему SW в webview мёртв).
- [mistakes/electron-core.md](./mistakes/electron-core.md) — детали отката WCV в v0.91.0.
