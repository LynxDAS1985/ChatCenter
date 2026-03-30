# Архитектура ChatCenter

## Обзор

ChatCenter — Electron-приложение. Одно окно, несколько вкладок с мессенджерами через WebView.
ИИ читает входящие, предлагает ответы или отвечает автоматически.

---

## Процессы Electron

```
┌─────────────────────────────────────────────────────┐
│                    Main Process                     │
│  main.js (569 строк) — точка входа, IPC, storage   │
│  ├── handlers/                                      │
│  │   ├── aiHandlers.js — AI провайдеры (4 шт)      │
│  │   ├── aiLoginHandler.js — OAuth окно провайдера  │
│  │   ├── notifHandlers.js — ribbon click/dismiss    │
│  │   ├── notificationManager.js — ribbon окно      │
│  │   ├── backupNotifHandler.js — backup path       │
│  │   ├── dockPinHandlers.js (571) — dock/pin/timer │
│  │   └── dockPinUtils.js — shared pin utilities    │
│  ├── utils/                                         │
│  │   ├── logger.js — файловый лог + авто-открытие  │
│  │   ├── sessionSetup.js — UA, permissions, SW     │
│  │   ├── windowManager.js — createWindow, preload  │
│  │   ├── trayManager.js — трей + лог-окно          │
│  │   └── overlayIcon.js — overlay/tray badge       │
│  └── preloads/ (все .cjs — CommonJS!)              │
│      ├── app.preload.cjs — contextBridge (renderer)│
│      ├── monitor.preload.cjs (465) — ChatMonitor   │
│      ├── notification.preload.cjs — ribbon preload │
│      ├── pin.preload.cjs — pin window preload      │
│      ├── pin-dock.preload.cjs — dock preload       │
│      ├── hooks/ — per-messenger Notification hooks │
│      │   ├── telegram.hook.js                      │
│      │   ├── whatsapp.hook.js                      │
│      │   ├── vk.hook.js                            │
│      │   └── max.hook.js                           │
│      └── utils/ — extracted monitor utilities      │
│          ├── unreadCounters.js                     │
│          ├── chatMetadata.js                       │
│          ├── messageExtractor.js                   │
│          ├── messageRetrieval.js                   │
│          ├── domSelectors.js                       │
│          └── diagnostics.js                        │
└──────────────────┬──────────────────────────────────┘
                   │ IPC (contextBridge)
┌──────────────────▼──────────────────────────────────┐
│                 Renderer Process                    │
│  src/App.jsx (556 строк) — главный компонент       │
│  ├── components/ (12 файлов)                       │
│  │   ├── TabBar.jsx — панель вкладок               │
│  │   ├── MessengerTab.jsx — вкладка мессенджера    │
│  │   ├── AISidebar.jsx (542) — AI-панель           │
│  │   ├── AIConfigPanel.jsx — настройки провайдера  │
│  │   ├── AIProviderTabs.jsx — табы провайдеров     │
│  │   ├── SettingsPanel.jsx — настройки             │
│  │   ├── TemplatesPanel.jsx — шаблоны ответов      │
│  │   ├── AutoReplyPanel.jsx — авто-ответчик        │
│  │   ├── NotifLogModal.jsx — диагностика/логи      │
│  │   ├── ConfirmCloseModal.jsx — подтверждение      │
│  │   ├── LogModal.jsx — окно системного лога       │
│  │   ├── ErrorBoundary.jsx — перехват ошибок       │
│  │   └── AddMessengerModal.jsx — добавление        │
│  ├── hooks/ (8 файлов)                             │
│  │   ├── useKeyboardShortcuts.js — Ctrl+ хоткеи    │
│  │   ├── useAIPanelResize.js — ресайз AI панели    │
│  │   ├── useWebViewZoom.js — зум WebView           │
│  │   ├── useBadgeSync.js — бейдж/трей              │
│  │   ├── useTabManagement.js — DnD, клик по табу   │
│  │   ├── useSearch.js — поиск в WebView            │
│  │   ├── useTabContextMenu.js — контекстное меню   │
│  │   ├── useNotifyNavigation.js — навигация по нотиф│
│  │   └── useIPCListeners.js — IPC подписки         │
│  ├── utils/ (12 файлов)                            │
│  │   ├── webviewSetup.js (545) — WebView lifecycle │
│  │   ├── consoleMessageHandler.js — CC_NOTIF парсер│
│  │   ├── messengerConfigs.js — конфиги мессенджеров│
│  │   ├── consoleMessageParser.js — CC_ prefix парсер│
│  │   ├── messageProcessing.js — dedup, strip, own  │
│  │   ├── navigateToChat.js — навигация к чату      │
│  │   ├── sound.js — звуковые уведомления           │
│  │   ├── aiProviders.js — провайдеры ИИ            │
│  │   ├── aiStreamingHandler.js — SSE стриминг      │
│  │   ├── aiProviderChecker.js — проверка провайдера│
│  │   ├── aiLoginHandler.js — OAuth clipboard poll  │
│  │   ├── aiWebviewContext.js — контекст в webview  │
│  │   └── devLog.js — dev-only логирование          │
│  ├── constants.js — DEFAULT_MESSENGERS             │
│  ├── main.jsx — точка входа React                  │
│  └── __tests__/ (25 файлов, 850+ assertions)       │
└──────────────────┬──────────────────────────────────┘
                   │ <webview> тег
┌──────────────────▼──────────────────────────────────┐
│              WebView Processes (изолированные)      │
│  ├── Telegram Web (persist:telegram)               │
│  ├── WhatsApp Web (persist:whatsapp)               │
│  ├── VK (persist:vk)                               │
│  ├── MAX (persist:max)                             │
│  └── Custom (persist:custom_XXX)                   │
│  Каждый WebView:                                   │
│  ├── preload: monitor.preload.cjs (ChatMonitor)    │
│  ├── hook: hooks/{type}.hook.js (Notification API) │
│  └── изолированная сессия (persist:partition)      │
└─────────────────────────────────────────────────────┘
```

---

## Поток данных: входящее сообщение → уведомление

```
1. WebView: мессенджер вызывает new Notification(title, opts)
2. hook.js: перехватывает → console.log('__CC_NOTIF__' + JSON.stringify(...))
3. monitor.preload.cjs: MutationObserver → console.log('__CC_MSG__' + text)
4. Renderer: <webview> 'console-message' event → consoleMessageHandler.js
5. consoleMessageHandler: парсит __CC_NOTIF__/__CC_MSG__, dedup, enrichment
6. webviewSetup.js: handleNewMessage() — dedup, own-msg filter, viewing filter
7. handleNewMessage → window.api.invoke('app:custom-notify', {...})
8. main.js: IPC handler → notificationManager.showCustomNotification()
9. notificationManager: создаёт/обновляет frameless BrowserWindow (ribbon)
10. notification.html: рендерит карточку уведомления
```

---

## Поток данных: авто-ответ по ключевым словам

```
1. handleNewMessage получает текст сообщения
2. Проверяет settings.autoReplyRules[] — keywords match
3. Если совпадение: navigator.clipboard.writeText(rule.reply)
4. Показывает ribbon "🤖 Авто-ответ: правило сработало"
```

---

## Хранилище данных

- **chatcenter.json** — JSON-файл в userData (настройки, мессенджеры, stats, pin items)
- **Partitions/persist:XXX/** — cookies, localStorage, IndexedDB мессенджеров
- **chatcenter.log** — файловый лог (ротация 500KB)
- **Нет внешней БД** — всё локально

---

## Инфраструктура

| Компонент | Инструмент |
|-----------|-----------|
| Runtime | Electron 41 + Node 22 |
| UI | React 19 + Tailwind 3 |
| Build | Vite 7 + electron-vite 5 |
| Lint | ESLint 9 (0 warnings) |
| Tests | 25 файлов, 850+ assertions |
| CI | GitHub Actions (Ubuntu + Windows) |
| Pre-commit | ESLint hook |
| Line endings | LF (.gitattributes) |
| Editor | .editorconfig (UTF-8, 2 spaces) |

---

## Критические правила

1. **Preload файлы = .cjs** (не .js!) — ловушка 53
2. **Partition = persist:XXX** — без persist: сессия временная
3. **clearStorageData** — ТОЛЬКО serviceworkers/cachestorage (НЕ cookies!)
4. **window.api?.** — обязательно optional chaining (React 19)
5. **Файлы ≤ 600 строк** — тест fileSizeLimits проверяет автоматически

---

## Версия архитектуры

v0.85.4 — 30 марта 2026 (полное обновление после рефакторинга)
