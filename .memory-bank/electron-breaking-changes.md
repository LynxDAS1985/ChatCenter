# Мониторинг Electron breaking changes

**Назначение**: список вещей в проекте, которые могут сломаться при обновлении Electron. Перед каждым `npm install electron@latest` — пройтись по списку и проверить.

**Источник истины**: [Electron Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes)

**Текущая версия**: Electron 42 (42.5.0, обновлено 24 июня 2026 в v1.2.18; см. `package.json`).

---

## 🔴 КРИТИЧЕСКИЕ (могут полностью сломать)

### `<webview>` тег
- **Статус**: НЕ deprecated в v41, но Electron официально пишет «We currently recommend to not use the webview tag and to consider alternatives, like iframe, a WebContentsView, or an architecture that avoids embedded content altogether» ([webview-tag docs](https://www.electronjs.org/docs/latest/api/webview-tag))
- **Что у нас**: основа всех мессенджеров в `src/App.jsx:589` + `webviewSetup.js`
- **Митигация**: пилот `WebContentsView` делали (v0.89.41-42, flag OFF), но **ОТКАТИЛИ в v0.91.0** из-за краша на Win11 (Electron #44934) — см. `main/main.js:49`, `main/utils/windowManager.js:3`. Перепроверка 24 июня 2026 — раздел «Готовность к миграции» ниже (часть блокеров устарела).
- **Триггер действия**: deprecation notice в breaking-changes для конкретной версии

### `BrowserView`
- **Статус**: **deprecated с v29.0.0** ([browser-view docs](https://www.electronjs.org/docs/latest/api/browser-view))
- **Что у нас**: НЕ используется ✅
- **Митигация**: использовать `WebContentsView` для любых новых окон с веб-контентом

### `nodeIntegration: true`
- **Статус**: всегда не рекомендовано, [Electron Security Don't #2](https://www.electronjs.org/docs/latest/tutorial/security)
- **Что у нас**: НЕТ нигде ✅ (закрыто в v0.89.38)
- **Защита**: `modernPatternsGuard.test.cjs` — pre-commit падает при возврате

### `contextIsolation: false`
- **Статус**: с v12 дефолт `true`, [Electron Security Don't #3](https://www.electronjs.org/docs/latest/tutorial/security)
- **Что у нас**: НЕТ нигде ✅ (закрыто в v0.89.38)
- **Защита**: `modernPatternsGuard.test.cjs`

---

## 🔬 Готовность к миграции webview → WebContentsView (проверено 24 июня 2026, офиц. источники)

**Контекст**: пилот WCV делали (v0.89.41-42) и откатили (v0.91.0) из-за краша на Win11. Перепроверка по `github.com/electron` показала — часть блокеров **устарела**.

### Статус issue Electron

| Issue | Что | Статус | Влияние на нас |
|---|---|---|---|
| [#44934](https://github.com/electron/electron/issues/44934) | краш `addChildView` на Win11 | **ЗАКРЫТ** (был Electron 33.2.0; фикс addChildView влит в 36-38) | у нас 41 → **скорее всего неактуально** (подтвердить запуском) |
| [#45367](https://github.com/electron/electron/issues/45367) | `addChildView` не рендерит страницу | **закрыт как invalid** (есть обходной путь) | не блокер |
| [#44897](https://github.com/electron/electron/issues/44897) | preload не грузится в child WCV | **ЗАКРЫТ** | перепроверить — критично для перехвата уведомлений |
| [#45105](https://github.com/electron/electron/issues/45105) | нет прозрачности WCV | **закрыт «as not planned»** (Electron НЕ добавит) | 🔴 **реальное текущее ограничение** |
| [#42884](https://github.com/electron/electron/issues/42884) | нет `destroy()` | **ОТКРЫТ** | 🟡 утечка памяти при частом создании/удалении view |

### Обходные пути для оставшихся (на офиц. API)

**#45105 (нет прозрачности)** — окошко WCV непрозрачно и рисуется поверх html → наши плашки/панель ИИ/модалки прячутся за ним. Решения:
1. Прятать/двигать окошко: `view.setVisible(false)` / `view.setBounds(...)` / `contentView.removeChildView(view)` (методы базового [View](https://www.electronjs.org/docs/latest/api/view)) на время показа оверлея.
2. Не накладывать, а ставить **рядом** (панель ИИ — отдельная зона, view сужаем через `setBounds`).
3. Плавающее — отдельным прозрачным `BrowserWindow` (запрет прозрачности только у WCV, не у обычных окон). **У нас так уже сделано** для уведомлений (`notificationManager.js`).

**#42884 (нет destroy)** — закрывать через `view.webContents.close()` + убрать ссылки → GC ([webContents](https://www.electronjs.org/docs/latest/api/web-contents)). Старый `destroy()` оборачивать в `setImmediate` ([#29626](https://github.com/electron/electron/issues/29626)). Для нас почти неважно: 5 мессенджеров, view создаём/удаляем редко.

### Снапшот версий стека (24 июня 2026)

> **Стек обновлён (v1.2.16-18, 24 июня 2026)** — версии ниже сверены с фактически установленным в `node_modules`.

| Компонент | Установлено (факт) | Последняя | Статус |
|---|---|---|---|
| Electron | **42.5.0** | 42.5.0 | ✅ актуально |
| Node.js (в Electron 42) | 24.17 | 24.17 | ✅ |
| Chromium (в Electron 42) | 148 | 148 | ✅ |
| React / react-dom | **19.2.7** | 19.2.7 | ✅ |
| Vite | **7.3.5** | 7.x (8 заблокирован electron-vite 5) | ✅ в рамках мажора |
| @vitejs/plugin-react | 5.2.0 | 6.x (требует vite 8) | держим 5 (под vite 7) |
| electron-vite | 5.0.0 | 5.0.0 | ✅ |
| electron-builder | **26.15.3** | 26.15.3 | ✅ |
| vitest | **4.1.9** | 4.x | ✅ |
| eslint / @eslint/js | **10.5.0 / 10.0.1** | 10.x | ✅ |
| tailwindcss + @tailwindcss/postcss | **4.3.1** | 4.x | ✅ |
| lucide-react | **1.21.0** | 1.x | ✅ |
| TDLib | tdl 8.1.0 / prebuilt-tdlib 0.1008064.0 | prebuilt 0.1008065 | не трогали (ABI-риск без нужды) |

### Вердикт по стеку

`WebContentsView` + методы `View` (`setVisible`/`setBounds`/`removeChildView`/`setBackgroundColor`/`setBorderRadius`) есть с **Electron 30** (май 2024). У нас уже **42.5.0** → **стек ПОЛНОСТЬЮ поддерживает API миграции, версионного барьера НЕТ.** Остаётся только работа: «дирижирование» окошком (прятать/двигать при оверлеях из-за #45105) + перенос перехвата уведомлений в main.

---

## 🟡 СРЕДНИЕ (изменение поведения)

### `backgroundThrottling` по умолчанию
- **Что у нас**: явно `false` в notifWin (v0.89.35), в WebContentsViewSlot (v0.89.41)
- **Триггер**: если Electron изменит дефолт — наши явные `false` не сломаются

### `requestAnimationFrame` в hidden окнах
- **Статус**: throttled. Решено через `backgroundThrottling: false`
- **Триггер**: новые BrowserWindow для transparent окон — проверять

### Pointer Events / Mouse Events
- **Что у нас**: переведено на Pointer Events в drag/dropdown (v0.89.38)
- **Триггер**: при добавлении новых drag-handler — использовать `onPointerDown/Move/Up`

---

## 🟢 НИЗКИЕ (косметика / удобство)

### Default `webPreferences.sandbox`
- v20+ по умолчанию `true` для renderers загружающих remote content
- **Что у нас**: явно `sandbox: false` в preload-окнах (нужно для preload IPC)

### `app.allowRendererProcessReuse`
- Удалено в v22 — у нас не используется ✅

---

## 📋 Чек-лист перед обновлением Electron

При `electron@X.Y.Z → X+1.0.0`:

1. ✅ Прочитать [breaking-changes для X+1](https://www.electronjs.org/docs/latest/breaking-changes)
2. ✅ Запустить полный test suite: `npm run test:vitest && node src/__tests__/transparentWindowGuard.test.cjs && node src/__tests__/modernPatternsGuard.test.cjs`
3. ✅ Проверить что `<webview>` НЕ помечен deprecated в этой версии
4. ✅ Проверить что `WebContentsView` API не изменился (constructor, setBounds, webContents.on events)
5. ✅ Проверить что `nativeImage`, `Notification`, `Tray` API стабильны
6. ✅ Проверить TDLib через `prebuilt-tdlib` — может потребоваться обновление
7. ✅ Сборка `npm run build` — проверить что нет warnings про deprecated API
8. ✅ Запуск ChatCenter, проверить визуально:
   - Уведомления показываются и исчезают без полосы
   - Tray меню работает
   - Все мессенджеры открываются
   - Drag разделителя AI sidebar работает
   - Pin/Dock окна работают

## 📋 Если webview tag deprecated — план действий

1. Включить feature flag `useWebContentsView` ON по умолчанию
2. Завершить Phase 2.3 (full) — адаптация `webviewSetup.js` через wcv:* IPC
3. Тестировать на одном мессенджере 1-2 недели
4. Постепенно мигрировать остальные мессенджеры
5. Удалить fallback `<webview>` из App.jsx
6. Удалить feature flag (теперь default)
7. Удалить пилот-документацию

## 🔗 Полезные ссылки

- [Electron releases](https://www.electronjs.org/releases/stable)
- [Breaking changes timeline](https://www.electronjs.org/docs/latest/breaking-changes)
- [Security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [WebContentsView API](https://www.electronjs.org/docs/latest/api/web-contents-view)

---

**Последняя проверка**: 24 июня 2026 (Electron **42.5.0** — обновлён в v1.2.18; снапшот версий стека сверен с node_modules).
**Следующая проверка**: при обновлении на v43 или появлении breaking-changes для v42; следить за поддержкой vite 8 в electron-vite.
