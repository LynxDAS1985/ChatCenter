# Архитектура ChatCenter

## Обзор

ChatCenter — Electron-приложение. Одно окно, несколько вкладок с мессенджерами через WebView.
ИИ читает входящие, предлагает ответы или отвечает автоматически.

---

## Процессы Electron

```
┌─────────────────────────────────────────────────────┐
│                    Main Process                     │
│  main.js — управление окнами, IPC, ИИ, расписание  │
│  ├── ipcMain handlers                               │
│  ├── AIService (запросы к LLM)                      │
│  ├── AutoReplyService (правила, расписание)          │
│  ├── StorageService (настройки, шаблоны)            │
│  └── SchedulerService (cron-like таймеры)           │
└──────────────────┬──────────────────────────────────┘
                   │ IPC (contextBridge)
┌──────────────────▼──────────────────────────────────┐
│                 Renderer Process                    │
│  src/renderer/ — UI приложения                      │
│  ├── App.jsx (главный компонент)                    │
│  ├── MessengerTabs (вкладки мессенджеров)           │
│  ├── AISidebar (панель ИИ-помощника)                │
│  ├── TemplatesPanel (шаблоны ответов)               │
│  └── SettingsWindow (настройки)                     │
└──────────────────┬──────────────────────────────────┘
                   │ <webview> тег
┌──────────────────▼──────────────────────────────────┐
│              WebView Processes (изолированные)      │
│  Один <webview> на каждый мессенджер                │
│  ├── Telegram Web (web.telegram.org)                │
│  ├── WhatsApp Web (web.whatsapp.com)                │
│  ├── VK (vk.com/im)                                 │
│  └── ... другие                                     │
│                                                     │
│  Каждый WebView имеет:                              │
│  ├── preload-скрипт (ChatMonitor)                   │
│  └── изолированную сессию (partition)               │
└─────────────────────────────────────────────────────┘
```

---

## Структура папок проекта

```
ChatCenter/
├── main/                    # Main process
│   ├── main.js              # Точка входа Electron
│   ├── ipc/                 # IPC handlers
│   │   ├── messenger.ipc.js
│   │   ├── ai.ipc.js
│   │   ├── autoreply.ipc.js
│   │   └── settings.ipc.js
│   ├── services/            # Бизнес-логика
│   │   ├── AIService.js
│   │   ├── AutoReplyService.js
│   │   ├── StorageService.js
│   │   └── SchedulerService.js
│   └── preloads/            # Preload-скрипты для WebView
│       ├── app.preload.js   # Для основного окна
│       ├── monitor.preload.js # Для WebView мессенджеров (ChatMonitor)
│       └── inject/          # Скрипты инъекции в мессенджеры
│           ├── telegram.inject.js
│           ├── whatsapp.inject.js
│           └── vk.inject.js
├── src/                     # Renderer process
│   ├── App.jsx
│   ├── components/
│   │   ├── MessengerTabs/
│   │   ├── AISidebar/
│   │   ├── TemplatesPanel/
│   │   ├── AutoReplyPanel/
│   │   └── Settings/
│   ├── store/               # Состояние (Zustand или Redux)
│   └── styles/
├── .memory-bank/
├── .claude/
│   └── settings.json
├── CLAUDE.md
└── package.json
```

---

## Поток данных: входящее сообщение → ИИ-ответ

```
1. Пользователь открывает чат в WebView (Telegram Web)
2. monitor.preload.js запускает MutationObserver в WebView
3. Наблюдатель замечает новое сообщение в DOM
4. preload → ipcRenderer.sendToHost('new-message', { text, sender, chat })
5. Renderer получает событие от <webview>
6. Renderer → ipcRenderer.invoke('ai:analyze', message)
7. Main:AIService делает запрос к LLM API
8. LLM возвращает варианты ответа
9. Main → Renderer: варианты показаны в AISidebar
10. Оператор выбирает ответ или редактирует
11. Renderer → ipcRenderer.invoke('messenger:send', { webviewId, text })
12. Main → webview.executeJavaScript(inject.send(text))
```

---

## Поток данных: авто-ответ

```
1. ChatMonitor получает новое сообщение (шаг 3 выше)
2. Main:AutoReplyService проверяет правила:
   - Активно ли расписание сейчас?
   - Есть ли совпадение по ключевым словам?
   - Настроен ли авто-ответ для этого чата?
3. Если совпадение — AutoReplyService формирует ответ:
   - Из шаблона (статический текст)
   - Через ИИ (динамический ответ)
4. Задержка (имитация набора текста)
5. Main → webview.executeJavaScript(inject.send(text))
```

---

## Хранилище данных

- **electron-store** — JSON-файл на диске (настройки, шаблоны, правила)
- **Сессии WebView** — хранятся в Electron userData (cookies, localStorage мессенджеров)
- **Нет внешней БД** на начальном этапе

---

## Версия архитектуры

v0.1.0 — начальная, 3 марта 2026
