# Мессенджеры — ChatCenter

Инструкции по интеграции каждого мессенджера: URL, DOM-селекторы, особенности.

---

## Статус интеграций

| Мессенджер | URL | Статус | Сложность |
|-----------|-----|--------|-----------|
| Telegram Web | web.telegram.org | 📋 Запланировано | Средняя |
| WhatsApp Web | web.whatsapp.com | 📋 Запланировано | Средняя |
| ВКонтакте | vk.com/im | 📋 Запланировано | Средняя |
| Viber Web | web.viber.com | 📋 Запланировано | Высокая |
| Авито | avito.ru/messenger | 📋 Запланировано | Высокая |

---

## Telegram Web (web.telegram.org)

**URL**: `https://web.telegram.org/k/`
**Partition**: `persist:telegram`

### DOM-селекторы (требуют проверки — могут меняться)

```js
// Контейнер сообщений активного чата
const chatContainer = document.querySelector('.chat-background')

// Входящие сообщения
const incomingMsgs = document.querySelectorAll('.message.is-in .text-content')

// Поле ввода
const input = document.querySelector('.input-message-input')

// Кнопка отправки
const sendBtn = document.querySelector('.btn-send')
```

### Отправка сообщения

```js
// inject/telegram.inject.js
window.__chatcenter_send = async function(text) {
  const input = document.querySelector('.input-message-input')
  if (!input) throw new Error('Input not found')

  // Фокус
  input.focus()

  // Вставка текста через clipboard API (самый надёжный способ)
  const dt = new DataTransfer()
  dt.setData('text/plain', text)
  input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))

  // Небольшая задержка перед отправкой
  await new Promise(r => setTimeout(r, 100))

  // Отправка Enter
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}
```

### Подсчёт непрочитанных (v0.22.0)

**НЕ СУММИРОВАТЬ бейджи чатов!** Telegram показывает кол-во ЧАТОВ с непрочитанными, а не сумму сообщений. Правильный подход — читать ГОТОВЫЙ счётчик:

1. `document.title` → `(26) Telegram Web` (может не работать в WebView)
2. Folder tab "Все чаты" badge → первый `.tabs-tab .badge` и др.
3. Адаптивный: `.badge` элементы НЕ внутри `.chatlist-chat`
4. Диагностика: IPC `monitor-diag` отправляет DOM-структуру для отладки селекторов

**Folder tabs layout'ы**: горизонтальный (`.tabs-tab`), вертикальный (другой класс — требует диагностики).

### Особенности

- Telegram Web K (новая версия) и A (старая) — разные DOM
- Использует виртуализацию — видны только сообщения в viewport
- MutationObserver нужно вешать на `.bubbles` (список сообщений)
- Определение входящих: класс `.is-in` на элементе сообщения

---

## WhatsApp Web (web.whatsapp.com)

**URL**: `https://web.whatsapp.com/`
**Partition**: `persist:whatsapp`

### DOM-селекторы (требуют проверки)

```js
// Список чатов
const chatList = document.querySelector('[data-testid="chat-list"]')

// Активный чат — сообщения
const messages = document.querySelectorAll('[data-testid="msg-container"]')

// Входящие (без data-id начинающегося с 'true')
const incoming = document.querySelectorAll('.message-in')

// Поле ввода
const input = document.querySelector('[data-testid="conversation-compose-box-input"]')
```

### Особенности

- Требует QR-код при первом входе (стандартная процедура)
- Использует contenteditable для ввода — нельзя просто value=
- Защита от автоматизации — нужно имитировать реальные события
- Сообщения зашифрованы E2E — читаем только то, что уже отображается в DOM

---

## ВКонтакте (vk.com/im)

**URL**: `https://vk.com/im`
**Partition**: `persist:vk`

### DOM-селекторы (требуют проверки)

```js
// Контейнер сообщений
const msgContainer = document.querySelector('.im-page--chat-body')

// Входящие сообщения
const incoming = document.querySelectorAll('.im-mess--unread.im-mess--in')

// Поле ввода
const input = document.querySelector('.im-chat-input--text [contenteditable]')
```

### Особенности

- VK обновляет интерфейс часто — селекторы могут устареть
- Авторизация через логин/пароль или VK ID

---

## Общий шаблон monitor.preload.js

```js
// main/preloads/monitor.preload.js
const { ipcRenderer } = require('electron')

// Определяем тип мессенджера по URL
function getMessengerType() {
  const host = window.location.hostname
  if (host.includes('telegram.org')) return 'telegram'
  if (host.includes('whatsapp.com')) return 'whatsapp'
  if (host.includes('vk.com')) return 'vk'
  return 'unknown'
}

const messengerType = getMessengerType()
const seenMessageIds = new Set()

function extractMessages() {
  // Логика специфична для каждого мессенджера
  // Возвращает массив объектов Message
}

// Запускаем наблюдатель после загрузки страницы
window.addEventListener('load', () => {
  const observer = new MutationObserver(() => {
    const messages = extractMessages()
    messages.forEach(msg => {
      if (!seenMessageIds.has(msg.id)) {
        seenMessageIds.add(msg.id)
        ipcRenderer.sendToHost('new-message', msg)
      }
    })
  })

  observer.observe(document.body, { childList: true, subtree: true })
})
```
