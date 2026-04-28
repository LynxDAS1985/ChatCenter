# План: Нативный режим «ЦентрЧатов» (своя оболочка для всех мессенджеров)

**Статус**: 🟡 В разработке. Шаг 1 (скелет) выполнен в v0.87.0. Дальше — реальная интеграция GramJS.
**Дата плана**: 14 апреля 2026
**Связано**: [decisions.md](./decisions.md) ADR-015, [common-mistakes.md](./common-mistakes.md) Ловушка 64

---

## 🎯 Зачем это всё (мотивация)

**Текущая боль**:
1. WebView Telegram даёт чёрный экран на чатах с вложениями (Ловушка 64). 5 итераций фиксов v0.86.5–v0.86.9 не помогли — это внутренний баг Telegram Web K. **Не лечится клиентским JS**.
2. WhatsApp WebView парсит DOM → ловит фантомы (`status-dblcheck`, `ic-expand-more`). Каждое обновление WhatsApp Web ломает что-то.
3. AI работает на **парсинге HTML** — данные грязные, отправитель определяется по тексту, фантомы ловятся как реальные сообщения.
4. Невозможно надёжно автоматизировать ответы — DOM-инъекции хрупкие, каждый мессенджер обновляется и ломает интеграцию.

**Решение**: уйти от WebView к нативным API мессенджеров (MTProto для Telegram, Baileys для WhatsApp, vk-io для VK, MAX Bot API для MAX). Свой UI поверх единого слоя данных.

**Бизнес-цель**: продаваемый продукт «единый центр чатов с AI» для малого/среднего бизнеса (автосервисы, турагентства, операторы поддержки).

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     ДАННЫЕ (общий слой)                     │
│  Messages │ Chats │ Contacts │ Tags │ Statuses │ Accounts  │
│              SQLite (better-sqlite3)                        │
└────────────────────────────┬────────────────────────────────┘
                             ↓
         ┌───────────────────┼───────────────────┐
         ↓                   ↓                   ↓
    ┌────────┐          ┌────────┐          ┌────────┐
    │ Inbox  │          │Contact │          │Kanban  │
    │ режим  │          │ режим  │          │ режим  │
    │        │          │        │          │        │
    └────────┘          └────────┘          └────────┘
                             ↑
                        AI-помощник
                  (видит все чаты, отвечает)
```

**Адаптеры** (один на мессенджер):
- `TelegramAdapter` (GramJS / MTProto) — приоритет 1
- `WhatsAppAdapter` (Baileys) — приоритет 2
- `VKAdapter` (vk-io) — приоритет 3
- `MaxAdapter` (MAX Bot API) — приоритет 4 (только для бизнес-чатов)

Каждый адаптер приводит данные к **единому формату** `{ id, accountId, sender, text, timestamp, attachments, reactions }`. UI не знает откуда сообщение.

---

## 🎨 UI — три режима + переключатель

### Переключатель в header

```
┌─────────────────────────────────────────────────────┐
│ ЦентрЧатов  [💬 Чаты] [👤 Клиенты] [📋 Доска]      │
│             ─────────                                │
└─────────────────────────────────────────────────────┘
```

Hotkeys: `Ctrl+1` Чаты, `Ctrl+2` Клиенты, `Ctrl+3` Доска.

### Режим 1: Чаты (Inbox) — режим по умолчанию

Слева sidebar аккаунтов (мини-иконки) → колонка фильтров → список чатов → окно чата → AI-панель.

```
┌────┬──────┬─────────────────┬──────────────┬─────────┐
│ TG │Все   │Дугин А.С.   ●3  │ переписка    │ AI      │
│ TG │TG    │Кузнецов И.      │              │ подскз. │
│ WA │WA    │Иван Петров      │              │         │
│ ➕ │теги  │...              │              │         │
└────┴──────┴─────────────────┴──────────────┴─────────┘
```

### Режим 2: Клиенты (Contacts)

Главная сущность — **человек**. Если Дугин пишет в TG и WA — один разговор с метками каналов. Сопоставление по телефону/username автоматом, ручное склеивание для остального.

```
┌──────────────┬──────────────────────────────────────┐
│ Дугин А.С.   │ 👤 Дугин Алексей Сергеевич           │
│ [TG+WA]   ●3 │ +7914...  [TG] [WA]   ⭐VIP          │
│ Кузнецов     │ ────────────────                      │
│ Иван Петров  │ Вчера, WhatsApp:  ← Здравствуйте     │
│              │ Сегодня, Telegram: ← Цена на Поло?   │
│              │                                       │
│              │ [Ответить через: TG ▼]                │
└──────────────┴──────────────────────────────────────┘
```

### Режим 3: Доска (Kanban)

Колонки-статусы (редактируются: rename / add / delete). Дефолт: Новые / В работе / Ждут / Закрыто. Drag-n-drop карточек (`@dnd-kit/core`).

```
┌──────────┬──────────┬──────────┬──────────┐
│Новые (5) │В работе  │Ждут (3)  │Закрыто   │
│┌────────┐│┌────────┐│┌────────┐│  архив   │
││Дугин TG│││Кузнецов│││Иванов  ││          │
││Поло?   │││отпр. │││жду     ││          │
│└────────┘│└────────┘│└────────┘│          │
└──────────┴──────────┴──────────┴──────────┘
```

Колонки = теги с флагом `isKanban: true`. Один источник истины — данные не дублируются между режимами.

---

## 🎨 Дизайн

- **AMOLED тема**: фон `#000`, surface `#0a0a0a`, hover `#131313`, border `#1a1a1a`
- **Акцент**: синий `#2AABEE` (Telegram-оттенок, единый для UI)
- **Цвета мессенджеров** (только для значков, чтобы быстро различать источник):
  - Telegram `#2AABEE`
  - WhatsApp `#25D366`
  - VK `#0077FF`
  - MAX `#7B3FE4`
- **Шрифт**: системный (`-apple-system, 'Segoe UI'`)
- **Стили изолированы** через корневой `.native-mode` — старые WebView-вкладки не затронуты

---

## 📦 Технологический стек

| Что | Чем | Почему |
|---|---|---|
| Оболочка | Electron (то что есть) | Не переписываем то что работает |
| Renderer | React 19 + Tailwind 3 + custom CSS | Уже в проекте |
| Локальный store | React hooks + IPC (не Zustand) | Минимум зависимостей, легче на start |
| База данных | better-sqlite3 | Sync, быстрая, файл локально |
| Telegram API | `telegram` npm (GramJS) v2.26.22 | Единственная зрелая JS-библиотека MTProto |
| WhatsApp API | `baileys` v7.0.0-rc.9 | Стандарт де-факто, работает через Linked Devices |
| VK API | `vk-io` v4.10.1 | Официальное покрытие, MIT |
| MAX API | свой fetch wrapper | API простой REST, библиотек нет |
| Drag-n-drop | `@dnd-kit/core` | Modern, работает в Electron |

---

## 🔐 Telegram API — креды

- Зарегистрировано на **my.telegram.org** аккаунтом владельца проекта (личный номер пользователя)
- App title: **ChatCenter** (изначально `Telegram`, переименован)
- Short name: **Demo33**
- **api_id**: `8392940`
- **api_hash**: `33a9605b6f86a176e240cc141e864bf5` (вшит в `src/native/config.js`)
- **Платформа**: Desktop
- **Применение**: один api_id → все пользователи программы (легально, как Telegram Desktop)

⚠️ **Безопасность**: api_hash засветился в чате при передаче. Рекомендация — `Reset hash` на my.telegram.org при следующем заходе.
⚠️ **2FA на аккаунте владельца** обязательна.

---

## 🗺️ План работ (фазы)

### ✅ Шаг 1 — Скелет (v0.87.0, выполнено 14.04.2026)
- Создана структура `src/native/` и `main/native/`
- Корневой компонент `NativeApp.jsx` с переключателем режимов и sidebar аккаунтов
- AMOLED стили в `src/native/styles.css`
- Конфиг `src/native/config.js` с api_id/api_hash
- Store `src/native/store/nativeStore.js` (React hook + IPC подписки)
- Login UI `src/native/components/LoginModal.jsx` (3 экрана: phone → code → 2FA)
- IPC handler `main/native/telegramHandler.js` (STUB — возвращает заглушки до подключения GramJS)
- Интеграция в `App.jsx` через виртуальный мессенджер `NATIVE_CC_TAB` (id=`native_cc`)
- Регистрация handler в `main/main.js` (`initTelegramHandler` после `initAIHandlers`)

### ⏳ Шаг 2 — Реальный GramJS (3-5 дней)
- `npm install telegram input better-sqlite3` (input — для GramJS callbacks)
- Заменить STUB в `main/native/telegramHandler.js`:
  - Создание `TelegramClient` с `StringSession`
  - `client.start({ phoneNumber, phoneCode, password })` — промисифицированные коллбеки через IPC
  - При первом коде: `pendingLogin.codeResolve = resolve`
- Session persistence: сохранять `client.session.save()` в `%APPDATA%/ЦентрЧатов/tg-session.txt` (через `safeStorage.encryptString`)
- При старте — попытка восстановить session
- Эмиссия `tg:account-update { status: 'connected', name, phone, username }` после успешного входа
- Обработка ошибок: PHONE_CODE_INVALID, PHONE_NUMBER_INVALID, FLOOD_WAIT_X, SESSION_PASSWORD_NEEDED

### ⏳ Шаг 2.5 — Multi-account Telegram (3-4 часа) — добавлено 28.04.2026

**Контекст**: Шаг 2 описал MVP single-session (`tg-session.txt`, один `state.client`). UI и архитектура (`accountId` поле, sidebar, SQL accounts table) уже подразумевают multi, но конкретный шаг был упущен. Полное обсуждение в [decisions.md → ADR-016](./decisions.md).

**Цель**: оператор может добавить 2+ Telegram-аккаунта одновременно, переключаться без потерь, видеть **все чаты в одном списке** (вариант B — единая лента).

**Backend (8 файлов в `main/native/`)**:

1. **telegramState.js** — Maps вместо singleton:
   ```js
   state.clients = new Map()         // accountId → TelegramClient
   state.accounts = new Map()        // accountId → NativeAccount
   state.activeAccountId = null      // выбранный для нового login
   state.sessionsDir = null          // папка ~/AppData/Roaming/ЦентрЧатов/tg-sessions/
   state.chatEntityMap = new Map()   // двухуровневая: accountId → Map<chatId, entity>
   ```

2. **telegramAuth.js** — `startLogin` создаёт client в Map:
   ```js
   async function startLogin(phone) {
     const client = new TelegramClient(...)   // НЕ trogaем существующих
     // ... после success:
     const me = await client.getMe()
     const accountId = `tg_${me.id}`
     state.clients.set(accountId, client)
     state.accounts.set(accountId, { ...account })
     fs.writeFileSync(path.join(state.sessionsDir, `${accountId}.txt`), session)
   }
   ```

3. **telegramAuth.js** — `autoRestoreSessions` (новое имя):
   ```js
   for (const f of fs.readdirSync(state.sessionsDir)) {
     if (!f.endsWith('.txt')) continue
     const accountId = f.replace('.txt', '')
     // restore client, добавить в Map, attachMessageListener для НЕГО
   }
   ```

4. **telegramHandler.js** — `state.sessionsDir = path.join(userData, 'tg-sessions')` + `mkdirSync`. Миграция: если есть старый `tg-session.txt`, прочитать → `getMe()` → переместить в `tg-sessions/{id}.txt`.

5. **telegramChats.js / telegramChatsIpc.js / telegramMessages.js / telegramMedia.js** — все обращения к `state.client` → `getClientForChat(chatId)`:
   ```js
   function getClientForChat(chatId) {
     const accountId = String(chatId).split(':')[0]
     return state.clients.get(accountId)
   }
   ```

6. **telegramCleanup.js** — `performFullWipe(accountId)` — удаляет ТОЛЬКО файлы этого аккаунта (его сессия, его чаты в кэше). Чужие сессии и общая папка `tg-avatars/` (с уникальными именами файлов по userId) не задеваются.

7. **telegramMessages.js** — `attachMessageListener(client, accountId)` — регистрируется на КАЖДОМ клиенте. NewMessage emit с `chatId = ${accountId}:${chatNumericId}`.

**UI (4 файла в `src/native/`)**:

8. **store/nativeStore.js** — добавить `activeFilter: 'all' | accountId` в state:
   ```js
   const [activeFilter, setActiveFilter] = useState('all')
   const filteredChats = activeFilter === 'all'
     ? chats
     : chats.filter(c => c.accountId === activeFilter)
   ```

9. **store/nativeStoreIpc.js** — `tg:account-update` уже работает корректно (массив accounts), не перезаписывает. Проверить что `tg:chats` `append: true` для новых аккаунтов не вытесняет старых.

10. **components/InboxChatListSidebar.jsx** — фильтр-кнопки сверху + цветной бейдж аккаунта на каждом чате:
    ```jsx
    <div className="account-filter-bar">
      <button className={activeFilter === 'all' ? 'active' : ''}
              onClick={() => setActiveFilter('all')}>Все</button>
      {accounts.map(a => (
        <button key={a.id}
                className={activeFilter === a.id ? 'active' : ''}
                onClick={() => setActiveFilter(a.id)}>
          {a.name}
        </button>
      ))}
    </div>
    ```

11. **components/LoginModal.jsx** — login для НОВОГО аккаунта (не выходим из старого). UI уже это делает (после success — onClose()), но нужно проверить что предыдущие аккаунты остаются в `accounts` массиве.

**Тесты** (новые/обновлённые):

- `multiAccount.test.cjs` — checking что state.clients/accounts/sessionsDir есть в коде
- `storageErrors.test.cjs` — добавить проверку что `tg-sessions` папка создаётся
- `appStructure.test.cjs` — проверить что `getClientForChat` существует
- runtime (`mainRuntime.test.cjs`) — проверить что `state.clients instanceof Map`

**Миграция данных** (один раз при первом запуске v0.87.104):

```js
const oldSession = path.join(userData, 'tg-session.txt')
if (fs.existsSync(oldSession) && !fs.existsSync(state.sessionsDir)) {
  fs.mkdirSync(state.sessionsDir, { recursive: true })
  // Восстановить → getMe() → узнать id → переместить
  const tempClient = new TelegramClient(new StringSession(oldText), API_ID, API_HASH, ...)
  await tempClient.connect()
  const me = await tempClient.getMe()
  const newPath = path.join(state.sessionsDir, `tg_${me.id}.txt`)
  fs.renameSync(oldSession, newPath)
  log(`Migrated old session → tg_${me.id}.txt`)
}
```

**Что юзер увидит**:

```
┌─────┬──────────────────────────────────┐
│ ●BН │  [Все] [БНК] [Avtoliberty]       │  ← Фильтр-кнопки сверху
│ ●AV │  ──────────                       │
│ ─── │  🟢BН OZONовая Дыра (999+)        │  ← Цветной бейдж
│  +  │  🟣AV Иванов клиент (3)           │
│     │  🟢BН Эксплойт ✓ (25)             │
│     │  🟣AV Заявка #12345 (1)           │
│     │  ...                              │
└─────┴───────────────────────────────────┘
```

Звук + ribbon уведомления — **одинаково на все аккаунты** с лейблом «BНК / AV». Tray badge — суммарный.

---

### ⏳ Шаг 3 — Загрузка чатов (2-3 дня)
- `client.getDialogs({ limit: 100 })` — топ 100 диалогов
- Маппинг → единый формат `Chat { id, accountId, title, type, lastMessage, lastMessageTs, unreadCount, avatar }`
- Сохранение в SQLite (таблицы chats, contacts)
- Эмиссия `tg:chats { accountId, chats }` в renderer
- Рендер списка чатов в Inbox-режиме (с мини-аватарками, последним сообщением, бейджем непрочитанных)

### ⏳ Шаг 4 — История + новые сообщения (3 дня)
- При выборе чата: `client.getMessages(chatId, { limit: 50 })` → emit `tg:messages`
- Подписка на `NewMessage` event GramJS → emit `tg:new-message` каждому окну
- Парсинг типов: text, photo, video, document, voice, sticker, location, contact, poll
- Сохранение в SQLite (messages с индексом по chat_id + timestamp)
- Render бабл-сообщений в окне чата

### ⏳ Шаг 5 — Отправка (2 дня)
- `client.sendMessage(chatId, { message: text })` для текста
- `client.sendFile(chatId, { file, caption })` для медиа
- Optimistic UI: сразу показать сообщение, потом подтвердить
- Индикатор typing через `client.invoke(SetTyping)`

### ⏳ Шаг 6 — AI-панель в Inbox (3 дня)
- Подключение существующего AI (AISidebar.jsx) к новому контексту
- AI получает: история сообщений выбранного чата + контакт
- Кнопки: «Сгенерировать ответ» / «Отправить»
- Авто-режим (если включён) — AI отвечает сам после X секунд

### ⏳ Шаг 7 — Режим «Клиенты» (4-5 дней)
- Movement matcher: сопоставление контактов по phone/username/имени (fuzzy 90%)
- Профиль клиента: имя, телефон, теги, заметки, заказы (опционально CRM)
- Единая лента сообщений по клиенту со значками каналов
- Селектор «куда ответить» при отправке

### ⏳ Шаг 8 — Режим «Доска» (4-5 дней)
- `npm install @dnd-kit/core @dnd-kit/sortable`
- Колонки = теги с `isKanban: true`. CRUD через UI: rename / add / delete колонок
- Дефолт: Новые / В работе / Ждут / Закрыто (можно изменить)
- Drag-n-drop карточек между колонками = смена тега
- Модальный чат при клике на карточку (не уход с режима)
- Цветовая индикация: зелёный = свежее, жёлтое = в работе, красное = просрочено

### ⏳ Шаг 9 — Polish (2-3 дня)
- Hotkeys (Ctrl+1/2/3 переключение режимов, Esc закрыть модалку, Ctrl+Enter отправить)
- Settings экран (тема, режим по умолчанию, звук, бэкап)
- Уведомления (использовать существующий MessengerRibbon)
- Тесты на критичные сценарии

**Итого Telegram-часть**: 4-5 недель работы.

### ⏳ Шаг 10 — WhatsApp адаптер (1.5 недели)
- `npm install baileys @hapi/boom qrcode pino`
- `WhatsAppAdapter` по тому же контракту что Telegram
- Авторизация через QR (не через телефон, как было)
- Использовать существующий UI Inbox/Contacts/Kanban — он уже умеет работать с любым адаптером

### ⏳ Шаг 11 — VK адаптер (1 неделя)
- `npm install vk-io`
- OAuth Implicit Flow в отдельном окне Electron
- API/Long Poll интеграция
- Тот же UI

### ⏳ Шаг 12 — MAX адаптер (опционально, 3-4 дня)
- Свой fetch wrapper для MAX Bot API
- Только для бизнес-чатов (Bot API не даёт доступ к личным)

### ⏳ Шаг 13 — Удаление старых WebView-вкладок (когда нативный обкатан)
- Не раньше чем через месяц стабильной работы нативного режима
- Сначала спрятать в настройках, через ещё месяц — удалить код
- WebView Telegram (БНК) → удалить
- WebView WhatsApp → удалить
- WebView VK → удалить
- WebView MAX → оставить (Bot API не покрывает личные чаты)

---

## 🗄️ База данных (SQLite)

Файл: `%APPDATA%/ЦентрЧатов/native.db`

### Таблицы

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  messenger TEXT NOT NULL,
  name TEXT, phone TEXT, username TEXT,
  status TEXT,
  created_at INTEGER, updated_at INTEGER
);

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  contact_id INTEGER,
  title TEXT,
  type TEXT,
  last_message_text TEXT,
  last_message_ts INTEGER,
  unread_count INTEGER DEFAULT 0,
  avatar_path TEXT,
  archived INTEGER DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);
CREATE INDEX idx_chats_account ON chats(account_id);
CREATE INDEX idx_chats_lastms ON chats(last_message_ts DESC);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT,
  phone TEXT, email TEXT,
  notes TEXT,
  created_at INTEGER,
  total_orders REAL DEFAULT 0,
  vip INTEGER DEFAULT 0
);

CREATE TABLE contact_links (
  contact_id INTEGER,
  account_id TEXT,
  external_id TEXT,
  username TEXT,
  PRIMARY KEY (contact_id, account_id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_id TEXT,
  sender_name TEXT,
  text TEXT,
  timestamp INTEGER,
  is_outgoing INTEGER DEFAULT 0,
  reply_to TEXT,
  attachments_json TEXT,
  reactions_json TEXT,
  is_deleted INTEGER DEFAULT 0,
  is_edited INTEGER DEFAULT 0,
  FOREIGN KEY (chat_id) REFERENCES chats(id)
);
CREATE INDEX idx_msgs_chat_ts ON messages(chat_id, timestamp DESC);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  color TEXT,
  is_kanban INTEGER DEFAULT 0,
  kanban_order INTEGER
);

CREATE TABLE chat_tags (
  chat_id TEXT,
  tag_id INTEGER,
  PRIMARY KEY (chat_id, tag_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### Размер базы

- ~1 КБ на сообщение в среднем
- 10К сообщений ≈ 10 МБ
- 1 млн сообщений ≈ 1 ГБ
- В настройках — лимит хранения (default: 6 месяцев), старше — удалять или архивировать

---

## 🔌 IPC контракт (зафиксирован в v0.87.0)

### Renderer → Main (invoke)

| Канал | Параметры | Возврат |
|---|---|---|
| `tg:login-start` | `{ phone }` | `{ ok, error?, stub? }` |
| `tg:login-code` | `{ code }` | `{ ok, success?, error? }` |
| `tg:login-password` | `{ password }` | `{ ok, success?, error? }` |
| `tg:login-cancel` | `{}` | `{ ok }` |
| `tg:get-chats` | `{ accountId }` | `{ ok, chats }` |
| `tg:get-messages` | `{ chatId, limit }` | `{ ok, messages }` |
| `tg:send-message` | `{ chatId, text }` | `{ ok, messageId? }` |
| `tg:remove-account` | `{ accountId }` | `{ ok }` |

### Main → Renderer (events)

| Канал | Данные |
|---|---|
| `tg:account-update` | `{ id, messenger, name, phone, status, error? }` |
| `tg:login-step` | `{ step: 'phone'\|'code'\|'password', phone?, error? }` или `null` |
| `tg:chats` | `{ accountId, chats: NativeChat[] }` |
| `tg:messages` | `{ chatId, messages: NativeMessage[] }` |
| `tg:new-message` | `{ chatId, message: NativeMessage }` |

### Контракт расширяемый

При добавлении WhatsApp/VK/MAX — те же каналы с префиксом `wa:`/`vk:`/`max:` или единые `chat:*` (решим при реализации).

---

## ⚠️ Известные ограничения

1. **Telegram api_hash в коде** — не идеально, обфускация в Шаге 9
2. **GramJS обновляется** — раз в месяц `npm update telegram`, проверять breaking changes
3. **WhatsApp Baileys = серая зона** — не для массовых рассылок, риск бана при злоупотреблении
4. **MAX Bot API только боты** — личные чаты остаются в WebView (или ждём пока MAX выпустит User API)
5. **VK direct auth deprecated** — только OAuth через окно (не прямой логин/пароль)

---

## 📚 Документация

Полная справка по API всех мессенджеров: [c:/Projects/ChatCenter/API/](../API/)

- [API/telegram/](../API/telegram/) — GramJS, MTProto, auth, methods, files, updates, business, reactions, stars/stories
- [API/whatsapp/](../API/whatsapp/) — Baileys, connecting, configuration, events
- [API/vk/](../API/vk/) — vk-io, auth, messages, methods, updates
- [API/max/](../API/max/) — MAX Bot API, full reference
- [API/VERSIONS.md](../API/VERSIONS.md) — актуальные версии пакетов

---

## 🎯 Бизнес-цели

1. **Сейчас**: рабочий инструмент для одного оператора (владелец проекта) — Telegram через нативный API
2. **Через 2 месяца**: добавить WhatsApp + VK, AI-помощник кросс-канальный
3. **Через 4 месяца**: продаваемая версия для малого бизнеса (1-5 операторов)
4. **Через 6-12 месяцев**: SaaS / коробочный продукт для среднего бизнеса (10+ операторов, CRM-интеграция)

---

## 📝 История решений

См. также [decisions.md](./decisions.md) → ADR-015 о переходе на нативные API.
