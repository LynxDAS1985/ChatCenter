# Мониторинг Electron breaking changes

**Назначение**: список вещей в проекте, которые могут сломаться при обновлении Electron. Перед каждым `npm install electron@latest` — пройтись по списку и проверить.

**Источник истины**: [Electron Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes)

**Текущая версия**: Electron 41 (см. `package.json`).

---

## 🔴 КРИТИЧЕСКИЕ (могут полностью сломать)

### `<webview>` тег
- **Статус**: НЕ deprecated в v41, но Electron официально пишет «We currently recommend to not use the webview tag and to consider alternatives, like iframe, a WebContentsView, or an architecture that avoids embedded content altogether» ([webview-tag docs](https://www.electronjs.org/docs/latest/api/webview-tag))
- **Что у нас**: основа всех мессенджеров в `src/App.jsx:589` + `webviewSetup.js`
- **Митигация**: Phase 1 миграции на `WebContentsView` уже сделана (v0.89.41-42, feature-flag default OFF). Phase 2.3 full (webviewSetup адаптация) — ждёт триггера
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

**Последняя проверка**: 19 мая 2026 (Electron 41).
**Следующая проверка**: при обновлении на v42 или появлении breaking-changes для v41.
