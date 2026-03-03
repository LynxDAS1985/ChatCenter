# IPC API — ChatCenter

Все каналы IPC. Формат: `модуль:действие`.

---

## Соглашения

- `ipcRenderer.invoke` → `ipcMain.handle` — двусторонние (с ответом)
- `ipcRenderer.send` → `ipcMain.on` — односторонние (без ответа)
- `mainWindow.webContents.send` — события от main к renderer
- `ipcRenderer.sendToHost` — от WebView preload к renderer (`<webview>`)

Все ответы: `{ ok: true, data: ... }` или `{ ok: false, error: '...' }`

---

## Реализованные каналы (v0.5.0)

### `app:ping` — проверка IPC
- **Тип**: invoke → `{ ok: true, message: string }`

### `app:info` — инфо о приложении
- **Тип**: invoke → `{ ok, data: { version, name, platform } }`

### `app:notify` — системное уведомление
- **Тип**: invoke
- **Запрос**: `{ title: string, body: string }`
- **Ответ**: `{ ok }`

### `messengers:load` — загрузить список из хранилища
- **Тип**: invoke → `Messenger[]`

### `messengers:save` — сохранить список в хранилище
- **Тип**: invoke
- **Запрос**: `Messenger[]`
- **Ответ**: `{ ok }`

### `settings:get` — получить настройки
- **Тип**: invoke → `{ soundEnabled: boolean, minimizeToTray: boolean }`

### `settings:save` — сохранить настройки
- **Тип**: invoke → `{ ok }`

### `window:hide` — свернуть в трей
- **Тип**: invoke → `{ ok }`

### `window:minimize` — свернуть
- **Тип**: invoke → `{ ok }`

### `messenger:badge` — событие: обновление бейджа (Main → Renderer)
- **Тип**: send (событие от main к renderer)
- **Данные**: `{ id: string, count: number }`
- **Примечание**: будет использован ChatMonitor в Фазе 3

---

## Запланированные каналы (Фаза 2+)

## Мессенджеры (`messenger:*`)

### `messenger:list` — получить список мессенджеров
- **Тип**: invoke
- **Запрос**: нет
- **Ответ**: `{ ok, data: Messenger[] }`

```js
// Messenger
{
  id: 'telegram',          // уникальный ключ
  name: 'Telegram',        // отображаемое имя
  url: 'https://web.telegram.org/',
  partition: 'persist:telegram',
  icon: 'telegram.png',
  enabled: true
}
```

### `messenger:add` — добавить мессенджер
- **Тип**: invoke
- **Запрос**: `Messenger` (без id — генерируется)
- **Ответ**: `{ ok, data: Messenger }`

### `messenger:remove` — удалить мессенджер
- **Тип**: invoke
- **Запрос**: `{ id: string }`
- **Ответ**: `{ ok }`

### `messenger:send` — отправить сообщение
- **Тип**: invoke
- **Запрос**: `{ messengerId: string, text: string }`
- **Ответ**: `{ ok, error? }`

### `messenger:new-message` — событие: новое сообщение (Main → Renderer)
- **Тип**: send (событие)
- **Данные**: `Message`

```js
// Message
{
  id: string,              // уникальный ID сообщения
  messengerId: string,     // откуда пришло
  chatId: string,          // ID чата
  chatName: string,        // имя чата/контакта
  sender: string,          // имя отправителя
  text: string,            // текст сообщения
  timestamp: number,       // Unix timestamp
  isIncoming: boolean      // true = входящее, false = исходящее
}
```

---

## ИИ-помощник (`ai:*`)

### `ai:analyze` — анализировать сообщение и предложить ответы
- **Тип**: invoke
- **Запрос**: `{ message: Message, context?: Message[] }`
- **Ответ**: `{ ok, data: { suggestions: string[] } }`

### `ai:reply` — сгенерировать ответ по промпту
- **Тип**: invoke
- **Запрос**: `{ prompt: string, context?: Message[] }`
- **Ответ**: `{ ok, data: { text: string } }`

### `ai:config-get` — получить настройки ИИ
- **Тип**: invoke
- **Ответ**: `{ ok, data: AIConfig }`

```js
// AIConfig
{
  provider: 'openai' | 'anthropic' | 'custom',
  model: string,           // 'gpt-4o', 'claude-sonnet-4-6', ...
  apiKey: string,          // зашифровано в хранилище
  maxTokens: number,
  temperature: number,
  systemPrompt: string     // базовый системный промпт
}
```

### `ai:config-save` — сохранить настройки ИИ
- **Тип**: invoke
- **Запрос**: `AIConfig`
- **Ответ**: `{ ok }`

---

## Авто-ответ (`autoreply:*`)

### `autoreply:rules-get` — получить все правила
- **Тип**: invoke
- **Ответ**: `{ ok, data: AutoReplyRule[] }`

```js
// AutoReplyRule
{
  id: string,
  name: string,
  enabled: boolean,
  type: 'keyword' | 'schedule' | 'chat',
  // Для type='keyword':
  keywords: string[],
  // Для type='schedule':
  schedule: { days: number[], from: string, to: string }, // days: 0=вс..6=сб
  // Для type='chat':
  chatIds: string[],
  // Ответ:
  replyType: 'template' | 'ai',
  templateId?: string,     // если replyType='template'
  aiPrompt?: string,       // если replyType='ai'
  delay: { min: number, max: number } // задержка в секундах
}
```

### `autoreply:rules-save` — сохранить правило
- **Тип**: invoke
- **Запрос**: `AutoReplyRule`
- **Ответ**: `{ ok }`

### `autoreply:toggle` — включить/выключить авто-ответ глобально
- **Тип**: invoke
- **Запрос**: `{ enabled: boolean }`
- **Ответ**: `{ ok }`

---

## Шаблоны (`templates:*`)

### `templates:get` — получить шаблоны
- **Тип**: invoke
- **Запрос**: `{ category?: string }` (опционально)
- **Ответ**: `{ ok, data: Template[] }`

```js
// Template
{
  id: string,
  category: string,
  name: string,
  text: string,
  tags: string[]
}
```

### `templates:save` — сохранить шаблон
- **Тип**: invoke
- **Запрос**: `Template`
- **Ответ**: `{ ok }`

### `templates:delete` — удалить шаблон
- **Тип**: invoke
- **Запрос**: `{ id: string }`
- **Ответ**: `{ ok }`

---

## Настройки (`settings:*`)

### `settings:get` — получить настройки
- **Тип**: invoke
- **Ответ**: `{ ok, data: AppSettings }`

### `settings:save` — сохранить настройки
- **Тип**: invoke
- **Запрос**: `Partial<AppSettings>`
- **Ответ**: `{ ok }`

```js
// AppSettings
{
  theme: 'light' | 'dark' | 'system',
  language: 'ru' | 'en',
  autoReplyEnabled: boolean,
  notificationsEnabled: boolean,
  sidebarPosition: 'left' | 'right'
}
```
