# Мессенджеры — ChatCenter

Инструкции по интеграции каждого мессенджера: URL, DOM-селекторы, особенности.

---

## Статус интеграций

| Мессенджер | URL | Статус | Сложность |
|-----------|-----|--------|-----------|
| Telegram Web | web.telegram.org | ✅ Базово | Средняя |
| WhatsApp Web | web.whatsapp.com | ✅ Базово | Средняя |
| ВКонтакте | vk.com/im | ✅ Базово | Средняя |
| Макс | web.max.ru | ✅ Базово (v0.30.0) | Средняя |
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

### Подсчёт непрочитанных (v0.23.0)

**НЕ СУММИРОВАТЬ бейджи чатов!** Правильные подходы:

**Из renderer (App.jsx):**
- `page-title-updated` event — `(26) Telegram Web` → парсим число мгновенно

**Из preload (monitor.preload.js), 4 уровня fallback:**
1. `document.title` → `(26) Telegram Web`
2. Folder tab badges (`.tabs-tab .badge` и др.)
3. Адаптивный: `.badge` НЕ внутри `.chatlist-chat`
4. Сумма chatlist badges (крайний случай)

**Folder tabs layout'ы**: горизонтальный (`.tabs-tab`), вертикальный (другой класс).

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
- **VK шлёт Notification для СВОИХ исходящих** — body начинается с "Вы: " → фильтруем
- **VK шлёт Notification для статусов online** — "минуту назад", "только что", "был в сети" → фильтруем
- **VK title = "ВКонтакте"** (не имя отправителя) → `enrichNotif` → `findSenderInChatlist` по body text
- DOM-селекторы для chatlist: `[class*="dialog"]`, `[class*="conversation"]`, `[class*="title"]`, `[class*="name"]`

---

## Макс (web.max.ru) — добавлен v0.30.0

**URL**: `https://web.max.ru/`
**Partition**: `persist:max`
**Цвет бренда**: `#2688EB`

### Особенности

- Бывший VK Мессенджер, переименован в "Макс" (MAX) в 2025
- Веб-версия на SvelteKit — DOM-структура отличается от VK
- Авторизация через QR-код (основной метод в 2026)
- Поддерживает аудио/видеозвонки в веб-версии
- DOM-селекторы пока generic — при необходимости можно уточнить после анализа реального DOM
- **Уведомления через ServiceWorker** (v0.33.0): MAX использует `ServiceWorkerRegistration.showNotification()` вместо `new Notification()`. Нужен перехват обоих API в monitor.preload.js
- **Имя профиля** (v0.36.0): accountScript ищет имя через localStorage → IndexedDB → DOM-селекторы профиля. Профиль MAX: имя в поле "Автолиберти" на странице /profile

### DOM-селекторы (generic, требуют уточнения)

```js
// Счётчик непрочитанных
const unread = document.querySelectorAll('[class*="unread"], [class*="badge"], [class*="counter"]')

// Текст последнего сообщения
const lastMsg = document.querySelectorAll('[class*="message-in"] [class*="text"]')
```

### Подсчёт непрочитанных

Используется стандартная логика `countUnread` с generic селекторами + title fallback `(N)`.

### Детекция новых сообщений (v0.46.3)

**Проблема**: MAX не вызывает `Notification`/`showNotification` для каждого нового сообщения (только первое). Когда чат открыт → unread count = 0 → не растёт → fallback ribbon через `page-title-updated`/`unread-count` не работает. MAX играет звук через AudioContext (не `new Audio()`).

**Решение**: `quickNewMsgCheck()` в monitor.preload.js — прямой мониторинг `addedNodes` в MutationObserver. Не зависит от unread count или Notification API.

### enrichNotif — имя отправителя и аватарка (v0.50.0, обновлено v0.55.1)

**Проблема**: MAX вызывает `showNotification("Макс", {body: "текст"})` — title = название мессенджера, не имя отправителя. Аватарка не передаётся. Ribbon показывает "Макс" + эмодзи.

**Решение**: `enrichNotif(title, body, tag, icon)` в injection script:
1. Regex `_appTitles` проверяет: title = "Макс" → это не имя отправителя
2. `findSenderInChatlist(body)` — ищет `.chatlist-chat` с текстом `body.slice(0,30)` → извлекает `.peer-title` (имя) и `img.avatar-photo`/`canvas.avatar-photo` (аватарка)
3. DOM MAX аналогичен Telegram Web K (`.chatlist-chat`, `.peer-title`, `.avatar-photo`)

### Header-селекторы активного чата (v0.55.1)

**Проблема**: `getActiveChatSender()` в preload не находила header в MAX — `.chat-info .peer-title` не матчит.

**Расширенные селекторы** (8 вариантов):
```js
'.chat-info .peer-title', '.topbar .peer-title',
'[class*="chat-header" i] [class*="title" i]',
'[class*="top-bar" i] [class*="title" i]',
'[class*="topbar" i] [class*="name" i]',
'[class*="chat-header" i] [class*="name" i]',
'header [class*="title" i]', 'header [class*="name" i]'
```

**Active chat fallback** (sidebar):
```js
'.chatlist-chat.active', '.chatlist-chat.selected',
'[class*="chat"][class*="active" i]',
'[class*="dialog"][class*="active" i]'
```

**Enrichment задержка**: 150мс — chatlist preview обновляется ПОСЛЕ addedNodes detection

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
