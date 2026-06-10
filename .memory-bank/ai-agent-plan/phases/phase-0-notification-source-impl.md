# Phase 0 — NotificationSource + Action Bus + Cross-tab уведомления — детальная реализация

> Цель: фундамент для AI-агента. Каждое сообщение должно носить «паспорт» (NotificationSource) откуда оно пришло, чтобы любая часть приложения (AI, задачи, напоминания, уведомления) могла единообразно ответить «куда вернуться».

---

## 1. Зачем это нужно

### 1.1 Проблема до Phase 0

В старом коде каждый компонент работал с **своим форматом** сообщения:
- WebView отправлял `{chatTag, messageId, text}` через IPC.
- Native TDLib эмитил `{accountId, chatId, msgId, content.text}`.
- Уведомление помнило `{messengerId, chatId, msgId}`.
- AI sidebar не знал ничего — получал только raw text.

**Симптомы**:
- Кликнул на уведомление → программа открывает чат, но не переходит к сообщению (потому что разный формат id).
- AI пишет ответ → не знает в какой messenger / account / chat отправлять.
- Юзер на вкладке Telegа → пришло уведомление из ЦентрЧатов → клик ничего не делает (потому что listener был только в NativeApp.jsx который не смонтирован на чужой вкладке).

### 1.2 Что хотели

Один **унифицированный паспорт** для любого сообщения:
- Все компоненты говорят на одном языке.
- Паспорт несёт всю информацию необходимую для возврата к сообщению.
- Frozen / immutable — никто не может его «случайно» изменить.

---

## 2. NotificationSource — паспорт сообщения

### 2.1 Файл
`src/shared/notificationSource.js` (131 строка).

### 2.2 Структура паспорта
```js
{
  messengerId: 'native_cc' | 'whatsapp' | 'custom_...',  // ID вкладки
  accountId: 'tg_611696632',  // для multi-account (TDLib)
  chatId: 'tg_611696632:-1001381927809',  // составной id
  messageId: '22818062336',  // string чтобы не терять precision (TDLib BigInt)
  chatTitle: 'OZONовая Дыра',
  senderName: 'Иван Петров',
  senderId: '611696632',
  topicId: '12345',  // для форум-топиков (TDLib forum), null для обычных
  topicTitle: 'Поддержка',
  isOutgoing: false,  // true если сообщение от меня
  timestamp: 1715000000  // Unix timestamp
}
```

### 2.3 Принципы

#### A. Frozen object
```js
export function createNotificationSource(params) {
  const source = { /* ...поля... */ }
  return Object.freeze(source)
}
```
**Зачем**: чтобы никто не мог сделать `source.chatId = 'другой'` после создания. Если попытаются — в strict mode будет TypeError, в non-strict — silent fail. В любом случае объект **не меняется**. Это гарантия: паспорт прошёл через 5 модулей — везде те же данные.

#### B. Все id — строки
TDLib message_id это int53 (большое число). В JavaScript `Number` точно представляет только до 2^53 — TDLib может вернуть `id = 22818062336000` — всё ещё OK для Number. Но в будущем может перерасти. И в Telegram MTProto спецификации сказано: «передавайте id как string чтобы не было overflow». Поэтому **всегда String**.

#### C. Валидация в factory
```js
if (!params.messengerId) throw new Error('messengerId required')
if (!params.chatId) throw new Error('chatId required')
```
Лучше упасть в момент создания (стек указывает на корень) чем через 10 IPC прыжков с непонятной ошибкой.

#### D. Backward compat
В Phase 0 мы **не удаляли** старый формат `{chatTag, messageId}`. Старые места кода продолжают работать с legacy полями. Новые места используют source. Постепенно мигрируем.

### 2.4 Где создаётся

1. **TDLib новое сообщение** — `src/native/store/nativeStoreIpc.js` обработчик `tg:new-message`:
   ```js
   const source = createNotificationSource({
     messengerId: 'native_cc',
     accountId, chatId, messageId: msg.id,
     chatTitle: chat?.title, senderName: msg.senderName, ...
   })
   ```

2. **WebView новое сообщение** — `src/utils/webviewSetup.js` (через `handleNewMessage`):
   ```js
   const source = createNotificationSource({
     messengerId: tabId, chatId: chatTag, messageId,
     accountId: tabId,  // для webview accountId === tabId
     ...
   })
   ```

3. **Notification ribbon click** — `main/notification.js` сохраняет source в `notifItems`, при клике отдаёт в IPC.

### 2.5 Тесты
`src/__tests__/notificationSource.vitest.js` — 21 unit-тест:
- factory создаёт объект с правильными полями.
- frozen — попытка изменить выбрасывает TypeError (в strict).
- валидация — отсутствующие messengerId/chatId → throw.
- accountId default = messengerId (для WebView).
- topicId null если не указан.
- timestamp default = Date.now() если не задан.
- senderName/chatTitle обрезаются до разумной длины.

---

## 3. Action Bus — useNotifyDispatcher

### 3.1 Файл
`src/hooks/useNotifyDispatcher.js` (99 строк).

### 3.2 Что это
React hook для **публикации/подписки** на действия с уведомлениями. Аналог Redux-action или EventEmitter, но scoped к жизни приложения.

```js
const { register, unregister, dispatch } = useNotifyDispatcher()

// Компонент A регистрирует обработчик
useEffect(() => {
  const id = register('notify:clicked', (payload) => {
    if (payload.messengerId === 'native_cc') {
      // переключить вкладку + scroll to msg
    }
  })
  return () => unregister(id)
}, [])

// Компонент B диспатчит
dispatch('notify:clicked', source)
```

### 3.3 Debounce 500ms
**Проблема**: если юзер дважды кликнул на уведомление — обработчик отработает 2 раза, переход к сообщению сработает дважды, скролл начнёт «дёргаться».

**Решение**: внутри `dispatch` стоит дебаунс — повторный вызов с тем же `(channel, payload.messageId)` в течение 500мс **игнорируется**.

### 3.4 Почему не Redux / Context
- Не нужен глобальный store — нет state, только pub/sub.
- React Context перерендеривает все subscribers при изменении — не нужно.
- EventEmitter — внешняя зависимость без React-интеграции (нужно вручную cleanup в useEffect).

Hook решает всё это: scoped, без зависимостей, авто-cleanup.

### 3.5 Тесты
`src/__tests__/useNotifyDispatcher.vitest.js` — 9 тестов:
- register возвращает уникальный id.
- dispatch вызывает зарегистрированные handler.
- unregister отключает handler.
- debounce — повторный dispatch с тем же ключом игнорится.
- multiple subscribers — все получают payload.
- unmount → автоматический unregister всех.

---

## 4. Cross-tab notify:clicked fix (главный фикс Phase 0)

### 4.1 Проблема

В старом коде listener `notify:clicked` был **внутри NativeApp.jsx**:
```jsx
// src/native/NativeApp.jsx (старое)
useEffect(() => {
  window.api.on('notify:clicked', handler)
  return () => unsub()
}, [])
```

**Баг**: `NativeApp` монтируется **только** когда `activeId === NATIVE_CC_ID`. Если юзер на вкладке `Telegа` или `WhatsApp` — NativeApp **не отрендерен** → useEffect не сработал → listener не висит → событие `notify:clicked` для native_cc **теряется**.

**Симптом** (из `.memory-bank/ai-agent-plan/problems.md` P-01):
> Юзер на WhatsApp вкладке. Приходит уведомление из ЦентрЧатов (TDLib). Кликает. Активная вкладка остаётся WhatsApp. Уведомление исчезло. Никакого перехода.

### 4.2 Решение

Перенесли listener в **корневой App.jsx**:
```jsx
// src/App.jsx (новое)
useEffect(() => {
  if (!window.api?.on) return undefined
  const unsub = window.api.on('notify:clicked', (payload) => {
    if (!payload || payload.messengerId !== NATIVE_CC_ID) return
    setActiveId(NATIVE_CC_ID)  // переключить на ЦентрЧатов
    setPendingNativeNotify(payload)  // запомнить для NativeApp
  })
  return unsub
}, [])
```

**Почему App.jsx**: корневой компонент **всегда смонтирован** пока работает приложение. Не важно на какой вкладке юзер — App.jsx слушает.

### 4.3 Как NativeApp получает payload

App.jsx передаёт `pendingNativeNotify` пропом в `<NativeApp>`. NativeApp при mount/update смотрит на этот проп:
```jsx
useEffect(() => {
  if (!pendingNotify) return
  // setActiveAccount + setActiveChat + requestScrollToMessage
  clearPendingNotify()  // обнуляем чтобы не повторилось
}, [pendingNotify])
```

### 4.4 Поток данных при клике на уведомление (native_cc)
```
1. Юзер на вкладке WhatsApp.
2. TDLib эмитит updateNewMessage в main.
3. main создаёт notification BrowserWindow с source.
4. Юзер кликает на ribbon уведомления.
5. main/notification.js → notifApi.clicked(source).
6. main/handlers/notifHandlers.js обрабатывает:
   - закрывает notification window
   - mainWindow.webContents.send('notify:clicked', source)
7. App.jsx (корневой) ловит событие:
   - source.messengerId === 'native_cc' → setActiveId(NATIVE_CC_ID)
   - setPendingNativeNotify(source)
8. React перерендеривает: активная вкладка теперь native_cc.
9. NativeApp монтируется (если не был) ИЛИ обновляется (если был).
10. NativeApp видит pendingNotify в пропе:
    - setActiveAccount(source.accountId)
    - setActiveChat(source.chatId, source.topicId)
    - requestScrollToMessage(source.messageId)
    - clearPendingNotify()
11. nativeStore показывает чат, scroll к сообщению с подсветкой.
```

---

## 5. Передача source через IPC

### 5.1 Цепочка

```
TDLib emit → nativeStoreIpc (создаёт source) → notificationManager (хранит)
  → notification BrowserWindow (показывает) → клик
  → notifHandlers (передаёт source в notify:clicked)
  → App.jsx ловит → NativeApp использует
```

### 5.2 Изменённые файлы

| Файл | Что добавлено |
|---|---|
| `src/native/store/nativeStoreIpc.js` | в `tg:new-message` создаётся source через `createNotificationSource()` |
| `main/handlers/notificationManager.js` | `notifItems[id].source = source` — сохраняется при показе |
| `main/handlers/notifHandlers.js` | при клике на ribbon: `mainWindow.send('notify:clicked', {...item, source})` |
| `main/notification.js` | BrowserWindow для уведомления получает source в payload |
| `src/App.jsx` | новый useEffect для cross-tab listener |
| `src/native/NativeApp.jsx` | принимает `pendingNotify` prop, удалён старый локальный useEffect |

### 5.3 Backward compat
Legacy поля `chatTag`, `messageId` остались в payload `notify:clicked` — старый код в `useNotifyNavigation` продолжает работать для WebView. Только native_cc использует source.

---

## 6. Подводные камни

### 6.1 «Двойной listener» (избегаем)
Если бы listener был и в App.jsx и в NativeApp.jsx — событие обработалось бы дважды:
- App.jsx: переключить вкладку + setPendingNotify.
- NativeApp.jsx: тот же setPendingNotify (но уже NativeApp), потом NativeApp ещё раз получит prop и сработает useEffect.

**Решение**: listener только в одном месте — App.jsx (root). NativeApp слушает только через props.

### 6.2 React batching
`setActiveId(NATIVE_CC_ID)` + `setPendingNativeNotify(payload)` — React 18+ batches их в один render. На render NativeApp получит правильный `pendingNotify` сразу при mount → useEffect отработает один раз.

### 6.3 setTimeout vs immediate
Раньше пробовали `setTimeout(setPendingNotify, 100)` чтобы дать NativeApp смонтироваться — это race condition. Сейчас полагаемся на React batching: state обновляется → React рендерит → NativeApp монтируется → useEffect срабатывает с правильным пропом.

### 6.4 Cleanup pendingNotify
**Важно**: `clearPendingNativeNotify()` нужно звать **внутри** NativeApp после применения. Иначе если NativeApp размонтируется и смонтируется снова — useEffect сработает ещё раз с тем же payload.

### 6.5 Source frozen — а если нужно дополнить?
Например, в NativeApp хотим добавить `appliedAt: Date.now()` к source. Frozen не позволит.

**Правильно**: создать новый объект `{...source, appliedAt: Date.now()}` — это копия, не мутация. Frozen только защищает от случайной мутации, копировать можно сколько угодно.

---

## 7. Тесты Phase 0

| Тест | Что проверяет |
|---|---|
| `notificationSource.vitest.js` (21 теста) | factory, frozen, валидация, default'ы |
| `useNotifyDispatcher.vitest.js` (9 тестов) | register/dispatch/unregister, debounce |

Всего: **30 unit-тестов**. Запуск: `npm run test:vitest`.

---

## 8. Mistakes / ловушки

### Trap #30 — isOutgoing=true cross-session
**Симптом**: уведомление от моего же сообщения которое я только что отправил — кажется баг.

**Реальность**: TDLib намеренно эмитит `updateNewMessage` с `is_outgoing=true` если сообщение было отправлено с другого устройства (телефон → desktop). Это НЕ баг, это правильное поведение по спецификации.

**Решение**: notification.html фильтрует `isOutgoing=true` и не показывает ribbon. Source паспорт всё равно создаётся (для аудита).

Записано в `.memory-bank/mistakes/notifications-ribbon.md` trap #30.

---

## 9. Связь с другими фазами

| Куда передаётся source | Что делает с ним |
|---|---|
| **Phase 1** tools | `gotoMessageHandler` использует `source.chatId/messageId` для перехода |
| **Phase 2** Permission Guard | проверяет `source.messengerId.startsWith('native_')` — только native scope |
| **Phase 3** AISidebar | передаёт source в AI prompt для контекста |
| **Phase 4** Tasks/Reminders | сохраняют source в записях, потом используют для `handleGoToSource` |

---

**Версия документа**: создан 9 июня 2026 для v0.96.0+ (Phase 0).
