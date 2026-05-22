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

## Native Telegram (`tg:*`) — TDLib backend

Все каналы зарегистрированы в [`main/native/tdlibIpcHandlers.js`](../main/native/tdlibIpcHandlers.js). UI вызывает через [`window.api.invoke('tg:*', payload)`](../src/native/store/nativeStore.js) — preload [bridge](../main/preload.cjs).

### Login

| Канал | Payload | Ответ |
|---|---|---|
| `tg:login-start` | `{ phone: '+71234567890' }` | `{ ok, step: 'code'\|'password'\|'success', error? }` |
| `tg:login-code` | `{ code: '12345' }` | `{ ok, step: 'password'\|'success', error? }` |
| `tg:login-password` | `{ password: '...' }` | `{ ok, success?: true, error? }` |
| `tg:login-cancel` | — | `{ ok }` |

Ошибки переводятся на русский через `translateTdlibError` ([`tdlibAuth.js`](../main/native/backends/tdlibAuth.js#L38)). `authorizationStateWaitRegistration` → дружелюбное «У этого номера ещё нет аккаунта Telegram».

### Accounts

| Канал | Payload | Ответ |
|---|---|---|
| `tg:get-accounts` | — | `{ ok, accounts: [{id, messenger:'telegram', status}], activeAccountId }` (v0.89.4: `name`/`phone` убраны — приходят отдельно через `tg:account-update` event после finalize, чтобы избежать race condition с merge) |
| `tg:remove-account` | `{ accountId }` | `{ ok }` |

### Chats

| Канал | Payload | Ответ |
|---|---|---|
| `tg:get-chats` | `{ accountId? }` | `{ ok, chats: Chat[] }` + эмитит `tg:chats` event per-account |
| `tg:get-cached-chats` | `{ accountId? }` | `{ ok, chats: Chat[] }` + эмитит `tg:chats` event |
| `tg:rescan-unread` | — | `{ ok, accountStats: [{accountId, chats, unreadTotal, ms}] }` |
| `tg:health-check` | — | `{ ok, accountStats: [{accountId, ms, ok, error?}] }` |
| `tg:set-mute` | `{ chatId, muteUntil }` | `{ ok, error? }` |
| `tg:get-cleanup-stats` | — | `{ ok, totalFiles, totalBytes, byCategory: { session, avatars, cache, media, tmp } }` |
| `tg:remove-account` | `{ accountId }` | `{ ok, wipeStats: { totalFiles, totalBytes, isLast } }` (v0.89.4: + полный logOut + fs.rmSync + emit `tg:account-update {removed:true}`) |

**`muteUntil`** — Unix timestamp (секунды) до которого приглушено: `0` = unmute, `2147483647` = «навсегда», иначе `Math.floor(Date.now()/1000) + seconds`. Backend конвертирует в TDLib `mute_for = max(0, muteUntil - now)`.

**`byCategory`** — каждая категория: `{ files: number, bytes: number }`:
- `session` — `tdlib-sessions/{accountId}/db.sqlite` + журналы
- `avatars` — `files/profile_photos/` + общая `tg-avatars/`
- `media` — `files/{photos,videos,voice,video_notes,documents,music,audio}/`
- `cache` — `files/{stickers,thumbnails,wallpapers,animations}/`
- `tmp` — `files/temp/`

### Messages

| Канал | Payload | Ответ |
|---|---|---|
| `tg:get-messages` | `{ chatId, limit?, aroundId?, offsetId?, afterId?, addOffset? }` | `{ ok, messages, hasMore }` + эмит `tg:messages` |
| `tg:get-topic-messages` | `{ chatId, topicId, limit?, aroundId?, addOffset? }` | `{ ok, messages }` + эмит `tg:messages` |
| `tg:send-message` | `{ chatId, text, replyTo? }` | `{ ok, messageId?, message? }` |
| `tg:edit-message` | `{ chatId, messageId, text }` | `{ ok }` |
| `tg:delete-message` | `{ chatId, messageId, forAll? }` | `{ ok }` |
| `tg:forward` | `{ fromChatId, toChatId, messageId }` | `{ ok }` |
| `tg:mark-read` | `{ chatId, maxId }` | `{ ok }` |
| `tg:mark-topic-read` | `{ chatId, topicId, maxId }` | `{ ok }` |
| `tg:get-pinned-message` / `tg:get-pinned` | `{ chatId }` | `{ ok, message?: NativeMessage \| null }` |
| `tg:pin` | `{ chatId, messageId, unpin? }` | `{ ok }` — закреп/откреп **сообщения** в чате (НЕ закреп чата в Main-list). При `unpin:true` → TDLib `unpinChatMessage`, иначе `pinChatMessage(disable_notification:true, only_for_self:false)`. |
| `tg:send-file` | `{ chatId, filePath, caption? }` | `{ ok, messageId? }` |
| `tg:send-clipboard-image` | `{ chatId, data: number[], ext, caption? }` (v0.89.4) | `{ ok, messageId? }` — пишет во tmp file + sendFile |
| `tg:set-typing` | `{ chatId }` | `{ ok }` (sendChatAction typing) |
| `tg:refresh-avatar` | `{ chatId }` | `{ ok }` (noop — TDLib шлёт автоматически) |

### Media

| Канал | Payload | Ответ |
|---|---|---|
| `tg:download-media` | `{ chatId, messageId, thumb? }` | `{ ok, path? }` (локальный путь к файлу) |
| `tg:download-video` | `{ chatId, messageId }` | `{ ok, path? }` |

### Forum

| Канал | Payload | Ответ |
|---|---|---|
| `tg:get-forum-topics` | `{ chatId, limit? }` | `{ ok, isForum, topics: [{id, title, unreadCount, ...}] }` |

### Renderer events (`webContents.send`)

Эмитятся из IPC handler через event-bridge (`manager.on(...) → sendToRenderer(...)`):

| Event | Data | UI listener? |
|---|---|---|
| `tg:new-message` | `{ chatId, message: NativeMessage }` | ✅ nativeStoreIpc |
| `tg:message-edited` | `{ chatId, messageId, editDate }` | ⚠️ orphan (нет UI handler) |
| `tg:message-deleted` | `{ chatId, messageIds: string[] }` | ⚠️ orphan |
| `tg:chats` | `{ accountId, chats, append }` | ✅ |
| `tg:messages` | `{ chatId, messages, append?, appendNewer?, aroundId?, afterId?, readUpTo? }` | ✅ |
| `tg:chat-unread-sync` | `{ chatId, unreadCount }` | ✅ |
| `tg:chat-last-message` | `{ chatId, lastMessage: string, lastMessageTs: number }` — v0.91.9 для TDLib updateChatLastMessage event (синхронизация превью в списке чатов) | ✅ |
| `tg:chat-avatar` | `{ chatId, avatarPath: 'cc-media://avatars/...' }` | ✅ |
| **`tg:sender-avatar`** | `{ senderId, avatarUrl }` (v0.89.4 — без chatId/accountId; UI iterates все state.messages по senderId) | ✅ |
| `tg:login-step` | `{ step, accountId, codeInfo?, passwordInfo?, raw? }` | ✅ |
| `tg:account-update` | `{ id, messenger, status, name?, phone?, username?, userId? }` + `{removed:true, wipeStats:{totalFiles,totalBytes,isLast}}` для logout | ✅ |
| `tg:account-connection` | `{ accountId, state }` | ⚠️ orphan |
| `tg:user-status` | `{ accountId, userId, online: boolean }` | ⚠️ orphan |
| **`tg:typing`** (v0.89.4) | `{ chatId, userId, typing }` — TDLib `updateChatAction → chatActionTyping/Cancel` | ✅ |
| **`tg:read`** (v0.89.4) | `{ chatId, outgoing: true, maxId }` — TDLib `updateChatReadOutbox` (двойная галочка) | ✅ |
| **`tg:media-progress`** (v0.89.4) | `{ chatId, messageId, bytes, total }` — на каждый `updateFile` chunk во время `tg:download-media`/`download-video` | ✅ VideoTile, MediaAlbum |

**⚠️ Orphan events**: эмитятся backend'ом но UI не подписан — либо удалить bridge, либо добавить UI handler. Решение отложено до v0.90.0.

### Замечания

- `device_model` / `application_version` для **существующих TDLib сессий** не обновятся при патч-релизе — TDLib пишет их в session-БД при первом `setTdlibParameters` и не перечитывает на повторных запусках. Новые логины — увидят актуальную версию.
- IPC контракт-тесты живут в [`src/__tests__/tdlibIpcHandlers.vitest.js`](../src/__tests__/tdlibIpcHandlers.vitest.js) — добавлять при изменении payload-формата.

---

## Telegram forum topics — investigation (2026-05-12)

Native Telegram API currently has flat chat/message channels:

- `tg:get-chats` loads Telegram dialogs.
- `tg:get-messages` loads messages for one `chatId`. For Telegram-like unread opening it can receive `{ aroundId, addOffset }` to load a window around `readInboxMaxId` instead of only the latest page.

This is not enough for Telegram forum groups, because a forum group has topics/threads inside one supergroup.
Current native `chatId` identifies only `accountId + peerId`; it does not include `topicId`.

Investigation document: [`group-topic-investigation.md`](./group-topic-investigation.md).

Potential future IPC, not implemented yet:

| Channel | Params | Return |
|---|---|---|
| `tg:get-forum-topics` | `{ chatId, limit?, offset? }` | `{ ok, topics }` |
| `tg:get-topic-messages` | `{ chatId, topicId, limit?, offsetId?, aroundId?, addOffset? }` | `{ ok, messages, aroundId? }` |

Rule for future work: do not silently show forum group messages as if a concrete topic was selected. The UI must show the selected topic or clearly say that native topic mode is not available yet.

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

### Notification IPC (v0.39.0 → v0.44.0)
- `app:custom-notify` — Renderer→Main: показать ribbon `{title, body, fullBody, iconUrl, color, emoji, messengerName, messengerId, senderName, chatTag, dismissMs}`
- `notif:show` — Main→NotifWin: отобразить уведомление
- `notif:click` — NotifWin→Main: клик → перейти к чату
- `notif:mark-read` — NotifWin→Main: "прочитано" → скрыть без перехода (v0.44.0)
- `notif:dismiss` — NotifWin→Main: закрыто (таймер/крестик)
- `notif:resize` — NotifWin→Main: новая высота окна
- `notify:clicked` — Main→Renderer: `{messengerId, senderName, chatTag}` → переключить вкладку + навигация к чату

### `window-state` — событие: состояние окна (Main → Renderer, v0.42.0)
- **Тип**: send (событие)
- **Данные**: `{ focused: boolean }`
- **Когда**: BrowserWindow events: focus/blur/minimize/restore/show
- **Назначение**: Надёжное определение видимости окна (вместо document.hidden/hasFocus)

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
