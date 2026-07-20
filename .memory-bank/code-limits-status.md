# Статус лимитов файлов кода — текущий снапшот

**Версия**: v0.87.86 (27 апреля 2026, после Шага 7 разбиения)
**Обновляется**: при каждом заметном росте файлов. Проверка: `node src/__tests__/fileSizeLimits.test.cjs`.

**Зачем отдельный файл**: конкретные числа (размеры, проценты) стареют за дни. CLAUDE.md держит только **правила**, а снапшот состояния — здесь.

---

## 🟢 План разбиения 7/7 — ВСЕ ШАГИ ЗАКРЫТЫ

```
ШАГ 1 ✅ архивация features.md (v0.87.76)              97 → 45 КБ
ШАГ 2 ✅ navigateToChat.js разбит (v0.87.77)           300 → 22 строки
ШАГ 3 ✅ notification.html разбит (v0.87.78)           902 → 12 строк
ШАГ 4 ✅ main.js разбит (v0.87.81)                     598 → 484 строки
ШАГ 5 ✅ App.jsx разбит (v0.87.82)                     599 → 475 строк
ШАГ 6 ✅ InboxMode.jsx разбит, исключение удалено (v0.87.83)   789 → 567 строк
ШАГ 7 ✅ telegramHandler.js разбит, исключение удалено (v0.87.86)   1260 → ~80 строк
```

---

## 🔴 Исключения (файлы с повышенным потолком)

Эти файлы зафиксированы в `KNOWN_EXCEPTIONS` в `src/__tests__/fileSizeLimits.test.cjs`. Тест не падает пока они не превысят потолок.

| Файл | Потолок | Категория / причина |
|---|---|---|
| `src/utils/webviewSetup.js` | 600 | Исторически большая утилита настройки WebView (зум, сессии, partition). Low priority. |
| `src/utils/messengerConfigs.js` | 400 | Конфиги всех мессенджеров в одном файле. Специально держим вместе. |
| `src/utils/consoleMessageHandler.js` | 450 | Большой парсер console-message. Логически цельный. |
| `main/handlers/dockPinHandlers.js` | 600 | Исторически большой handler. Low priority. |
| `main/notification.js` | 700 | Renderer-код для notification BrowserWindow. Извлечён из inline `<script>` в v0.87.78. Разбиение low priority. |

**5 исключений**, все low priority. Все рискованные файлы (telegramHandler, InboxMode) — разбиты, исключения удалены.

---

## 🟡 Близко к лимиту (80%+ от базового) — снапшот 20 июля 2026 (v1.2.79, Совет 5)

Свежий скан `fileSizeLimits.test.cjs`: **24 файла** на 80%+. Тест НЕ падает (это предупреждения), но файлы на 100% заблокируют СЛЕДУЮЩУЮ правку в них.

### 🔥 Приоритет — на 100% / на волосок (следующая правка = блок коммита)

| Файл | Сейчас | Лимит | % | Как безопасно разбить |
|---|---|---|---|---|
| `main/preloads/hooks/max.hook.js` | 300 | 300 | **100%** | Инъекция в WebView — РИСК. Вынести чистые хелперы (`_findSender`/`_findAvatar`/`_isSpam`/`_extractSticker`) в отдельный `.js`, импортировать. Проверять визуально в MAX. |
| `shared/vkExecFallback.js` | 300 | 300 | **100%** | `buildVkExecFallbackScript` (скрипт-строка для инъекции) вынести в `shared/vkExecFallbackScript.js`. РИСК: строка завязана на `PREFIX` — проверить VK. |
| `src/native/store/nativeStoreIpc.js` | 659 | 660* | **99.8%** | Исключение. Крупный конвейер сообщений. Вынести группу аватар-хендлеров (`flushPendingChatAvatar`/`flushPendingSenderAvatar`) в отдельный модуль. РИСК: hot-path. |
| `main/preloads/utils/vkDiagnostics.js` | 494 | 500 | **99%** | Диагностика (не инъекция реактивная) — ниже риск. Вынести группу независимых проверок. |
| `main/utils/webContentsViewManager.js` | 293 | 300 | **98%** | Вынести создание/настройку view в подфайл. |
| `main/preloads/monitor.preload.cjs` | 569 | 600 | 95% | Preload-монитор. Вынести группу observer-хелперов. РИСК: инъекция. |

\* исключение в `KNOWN_EXCEPTIONS`.

### ⭐⭐ Средний приоритет (90–95%)

`src/components/AISidebar.jsx` 652/700 · `src/native/components/InboxChatListSidebar.jsx` 550/600 · `src/native/NativeApp.jsx` 542/600 · `src/utils/diagnosticsSession.js` 270/300 · `src/hooks/useAppIPCListeners.js` 133/150

### ⭐ Низкий (80–89%)

`main/native/backends/tdlibMapper.js` 432/500 · `main/native/backends/tdlibMedia.js` 405/500 · `main/main.js` 497/600 · `main/utils/windowManager.js` 248/300 · `src/utils/maxTitleFallbackScript.js` 255/300 · `main/ai/aiProviderCaller.js` 242/300 · `src/native/hooks/useInboxNewerPrefetch.js` 122/150 · `src/native/hooks/useNewBelowCounter.js` 124/150

### 🧪 Тесты (80%+, лимит 400)

`useInitialScroll.vitest.jsx` 384 · `tdlibMapper.vitest.js` 369 · `InboxMode.vitest.jsx` 351 · `monitorPreload.test.cjs` 333 · `aiProviderCaller.vitest.js` 323

### ⚠️ ВАЖНО — почему НЕ режем массово

Разбиение рабочих файлов кода — это перемещение логики + правка импортов. Приложение агент **не запускает**, а инъекционные файлы (`*.hook.js`, `*.preload.cjs`, `vkExecFallback`) работают внутри WebView — ошибка не ловится тестами, только глазами в живом мессенджере. Поэтому: **режем по ОДНОМУ файлу под конкретную задачу, с визуальной проверкой пользователем**, а не пачкой. Сейчас ни один файл не за лимитом — срочности нет, только профилактика перед следующей правкой в файле на 100%.

---

## 🟢 Норма

180+ файлов проверены, все укладываются в лимиты. Общий размер renderer кода (`src/` без тестов): ~11500 строк (лимит 20000).

---

## 🔁 Как обновлять этот файл

После существенного роста файла или добавления новых:

1. Запусти `node src/__tests__/fileSizeLimits.test.cjs` — увидишь все размеры с предупреждениями.
2. Если тест упал на новом файле → добавь в `KNOWN_EXCEPTIONS` (если разбиение не планируется) или разбивай.
3. Обнови таблицы выше с новыми числами.
4. Версию файла подними до текущей версии проекта.

**Не пиши конкретные числа в CLAUDE.md** — они стареют. Только здесь.
