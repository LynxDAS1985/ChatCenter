# Типичные ошибки — ChatCenter

## 🔴 КРИТИЧЕСКОЕ: ELECTRON_RUN_AS_NODE=1

### ❌ Запуск electron-vite напрямую из VS Code / Claude Code терминала

VS Code и Claude Code устанавливают `ELECTRON_RUN_AS_NODE=1` в среду процесса.
При этом `require('electron')` возвращает путь к бинарнику (`"C:\...\electron.exe"`), а не Electron API.

**Симптом**: `TypeError: Cannot read properties of undefined (reading 'handle'/'isPackaged'/etc.)`

**Решение**: запускать через `scripts/dev.js`, который удаляет переменную:
```js
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
spawn('electron-vite', ['dev'], { env, shell: true })
```

**НИКОГДА** не запускать `electron-vite dev` напрямую из этой среды.

---

## WebView

### ❌ require('electron') в renderer или WebView preload

```js
// ОШИБКА — не работает в renderer-процессе
const { ipcRenderer } = require('electron')
```

**Решение**: использовать `window.api` через contextBridge. Для WebView preload — `ipcRenderer.sendToHost`.

---

### ❌ Одна сессия на все мессенджеры

```jsx
// ОШИБКА — все мессенджеры будут делить cookies
<webview src="https://web.telegram.org/" />
<webview src="https://web.whatsapp.com/" />
```

**Решение**: каждому мессенджеру уникальный `partition`:

```jsx
<webview src="https://web.telegram.org/" partition="persist:telegram" />
<webview src="https://web.whatsapp.com/" partition="persist:whatsapp" />
```

---

### ❌ MutationObserver на неправильном элементе

Наблюдать за `document.body` — дорого. Мессенджеры рендерят только видимую область.

**Решение**: наблюдать за контейнером сообщений конкретного чата, а не за всем body. Найти правильный корневой элемент чата.

---

### ❌ executeJavaScript с пользовательским вводом напрямую

```js
// УЯЗВИМОСТЬ XSS/инъекция
webContents.executeJavaScript(`fillInput("${userText}")`)
```

**Решение**: всегда использовать `JSON.stringify`:

```js
webContents.executeJavaScript(`fillInput(${JSON.stringify(userText)})`)
```

---

## ИИ-интеграция

### ❌ API-ключ в renderer

```js
// ОШИБКА — ключ виден через DevTools
const response = await fetch('https://api.openai.com/...', {
  headers: { Authorization: `Bearer ${window.apiKey}` }
})
```

**Решение**: все запросы к ИИ только через IPC → main → внешний API.

---

### ❌ Отправлять весь DOM WebView в ИИ

Мессенджеры генерируют огромный DOM. Отправка всего содержимого — дорого и медленно.

**Решение**: извлекать только текст сообщений и метаданные (отправитель, время, имя чата).

---

## Авто-ответ

### ❌ Отвечать на собственные сообщения

Бот будет отвечать сам себе в бесконечном цикле.

**Решение**: в ChatMonitor помечать исходящие сообщения, AutoReplyService игнорировать их.

---

### ❌ Отвечать мгновенно

Мгновенные ответы выглядят роботизированно и могут вызвать бан.

**Решение**: всегда добавлять случайную задержку 2–8 секунд перед отправкой.

---

## Electron

### ❌ nodeIntegration: true в WebView

```js
// ОПАСНО — WebView получает полный доступ к Node.js
new BrowserView({ webPreferences: { nodeIntegration: true } })
```

**Решение**: `nodeIntegration: false`, `contextIsolation: true` — всегда.

---

### ❌ Хранить настройки в переменных — потеря при перезапуске

**Решение**: использовать `electron-store`, сохранять сразу при изменении.
