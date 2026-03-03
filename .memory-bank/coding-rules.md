# Правила кода — ChatCenter

## Общие правила

- Язык: JavaScript (ES2022+), без TypeScript на старте
- Стиль: без точек с запятой, одинарные кавычки, 2 пробела отступ
- Комментарии к версиям: `// v0.2` над изменённой функцией
- Имена файлов: `camelCase.js` для модулей, `PascalCase.jsx` для React-компонентов

---

## IPC — единственный мост между процессами

### Правило: никакого `require('electron')` в renderer

```js
// ❌ НЕЛЬЗЯ в renderer/src/
const { ipcRenderer } = require('electron')

// ✅ ПРАВИЛЬНО — через contextBridge в app.preload.js
window.api.send('channel', data)
window.api.invoke('channel', data)
window.api.on('channel', callback)
```

### Структура preload (app.preload.js)

```js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Renderer → Main (без ответа)
  send: (channel, data) => ipcRenderer.send(channel, data),
  // Renderer → Main (с ответом)
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  // Main → Renderer (события)
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args))
  },
  // Отписка
  off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
})
```

### Именование каналов IPC

Формат: `модуль:действие`

```
ai:analyze          — анализ сообщения ИИ
ai:suggest          — получить варианты ответа
messenger:send      — отправить сообщение в WebView
messenger:list      — список добавленных мессенджеров
autoreply:rules     — получить правила авто-ответа
autoreply:toggle    — включить/выключить авто-ответ
templates:get       — получить шаблоны
templates:save      — сохранить шаблон
settings:get        — получить настройки
settings:save       — сохранить настройки
```

---

## WebView — правила работы

### Каждый мессенджер — отдельный `<webview>` с partition

```jsx
// ✅ Правильно: изолированная сессия, preload для мониторинга
<webview
  src="https://web.telegram.org/"
  partition="persist:telegram"
  preload="./preloads/monitor.preload.js"
  webpreferences="contextIsolation=yes"
/>
```

### Чтение сообщений — только через preload + ipc-message

```js
// monitor.preload.js — работает ВНУТРИ WebView
const { ipcRenderer } = require('electron')

const observer = new MutationObserver((mutations) => {
  // парсим DOM, ищем новые сообщения
  const newMessages = extractNewMessages(mutations)
  newMessages.forEach(msg => {
    ipcRenderer.sendToHost('new-message', msg)
  })
})

observer.observe(document.body, { childList: true, subtree: true })
```

```jsx
// Renderer — слушаем события от WebView
<webview
  ref={webviewRef}
  onIpcMessage={(event) => {
    if (event.channel === 'new-message') {
      handleNewMessage(event.args[0])
    }
  }}
/>
```

### Отправка сообщений — через executeJavaScript

```js
// Main process
async function sendMessage(webContentsId, text) {
  const wc = webContents.fromId(webContentsId)
  await wc.executeJavaScript(`
    window.__chatcenter_send(${JSON.stringify(text)})
  `)
}
```

```js
// inject/telegram.inject.js — функция, внедрённая в страницу
window.__chatcenter_send = function(text) {
  const input = document.querySelector('.composer-input')
  // ... заполняем и отправляем
}
```

---

## Безопасность

- **API-ключи ИИ** — только в main process, никогда в renderer или WebView
- **Хранение ключей** — через `electron-store` с шифрованием (`encryptionKey`)
- **executeJavaScript** — только предварительно подготовленные строки, никакого `eval(userInput)`
- **CSP** — заголовки Content-Security-Policy на все окна приложения
- **nodeIntegration: false** всегда в webPreferences renderer и WebView

---

## React / UI

- Состояние: Zustand (легковесный, без бойлерплейта)
- Стили: CSS Modules или Tailwind (решить в ADR)
- Компоненты: функциональные, хуки
- Нет классовых компонентов

---

## Обработка ошибок

```js
// В IPC handlers всегда try/catch
ipcMain.handle('ai:analyze', async (event, message) => {
  try {
    const result = await aiService.analyze(message)
    return { ok: true, data: result }
  } catch (err) {
    console.error('[ai:analyze]', err)
    return { ok: false, error: err.message }
  }
})
```

- Renderer всегда проверяет `result.ok` перед использованием `result.data`
- Логи только в main process через `console.error/warn/log`
