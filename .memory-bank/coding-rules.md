# Правила кода — ChatCenter

## 🔴 ГЛАВНЫЕ ПРАВИЛА (зафиксированы в v1.2.12 после реальных провалов)

### Правило 1: 3 факта перед изменением кода

**Не выдавать гипотезы за факты.** Перед любой правкой минимум:
- **3 факта** = утверждение + источник (файл:строка / лог / документация) + уровень
- **1 факт уровня 1** = официальная документация (TDLib / Electron / React / Vitest и т.д.)

Уровни источников (строго):
- 🥇 Уровень 1 — официальная дока под точную версию проекта → **ИСТИНА**
- 🥈 Уровень 2 — код проекта → что написано, то работает
- 🥉 Уровень 3 — Memory Bank → может устареть, при конфликте с кодом — верить КОДУ

❌ **НЕ источник**: «я помню», «вроде должно работать», аналогии («в React так — в Vue тоже»).

**Если фактов < 3 или нет уровня 1** — КОД НЕ МЕНЯТЬ. Варианты:
- А) Предложить добавить диагностику с разрешения юзера
- Б) Уточнить у юзера чего не хватает
- В) Признать «не знаю»

**Реальный провал v1.2.12** — я связал «168k IPC спам + успешный show в логе + юзер не видит окно» в причинную цепочку без проверки и удалил «спам-логгер» как «корень потери уведомлений». На самом деле корень был в другом — отсутствии звука. Правило 3 фактов защитит от повторения. Подробности в `mistakes/notifications-ribbon.md` секция «История правильных и неверных шагов».

### Правило 2: Стандарт мессенджеров — одинаковый везде

**Логика «показать ли уведомление и сыграть ли звук» — одинаковая для всех мессенджеров** (WebView + Native). Эталон:

```
1. Серверный мьют чата (TDLib chat.isMuted / WhatsApp/MAX мьют) → ДА → ничего
                                                                  ↓ НЕТ
2. Локальный мьют мессенджера (mutedMessengers[id])               → ДА → ничего
                                                                  ↓ НЕТ
3. Глобальный + per-messenger тоггл ribbon (notificationsEnabled
   + messengerNotifs[id].ribbon)                                  → ВЫКЛ → нет окна
                                                                  ↓ ВКЛ → показать
4. Глобальный + per-messenger тоггл sound (soundEnabled
   + messengerNotifs[id].sound) + throttle 3s через
   lastSoundTsRef[id]                                             → ВЫКЛ → нет звука
                                                                  ↓ ВКЛ → играть
```

Звук и окно — **независимы**. Можно включить только окно (без звука) или только звук (без окна).

**Эталонный код**: [webviewHandleNewMessage.js:79-103](../src/utils/webviewHandleNewMessage.js) (WebView), [mainIpcHandlers.js app:custom-notify](../main/handlers/mainIpcHandlers.js) (Native ribbon), [useAppIPCListeners.js notif:play-sound](../src/hooks/useAppIPCListeners.js) (Native звук).

❌ **НЕ использовать TDLib `chat.isMuted` как ЕДИНСТВЕННЫЙ фильтр** — это серверный мьют, отдельный слой от локальных настроек ChatCenter.

❌ **НЕ забывать про throttle 3 сек** — без него пакет из 5 сообщений за 100мс даёт 5 звуков подряд.

---

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
