# Phase 0 — Foundation (детально)

> **Цель**: Создать фундамент для AI-агента. Без этой фазы остальное не работает.

## Что делаем

- `NotificationSource` — паспорт сообщения (единый invariant объект)
- `useNotifyDispatcher` — Action Bus в корневом App.jsx
- Cross-tab fix — уведомления работают с любой вкладки
- Перевод `notify:clicked` цепочки на новый формат

## Что НЕ делаем в Phase 0

- ❌ Tool Use (Phase 1)
- ❌ AI integration (Phase 1-2)
- ❌ Permissions (Phase 2)
- ❌ UI агента (Phase 3)
- ❌ Tasks / Reminders (Phase 4)

## Файлы

### Новые

| Файл | Назначение | Размер |
|---|---|---|
| `src/shared/notificationSource.js` | Factory + типы NotificationSource | ~80 строк |
| `src/shared/notificationSource.vitest.js` | Тесты | ~100 строк |
| `src/hooks/useNotifyDispatcher.js` | Action Bus hook | ~80 строк |
| `src/hooks/useNotifyDispatcher.vitest.jsx` | Тесты | ~120 строк |

### Изменяемые (минимальные правки)

| Файл | Что меняем | +/- строк |
|---|---|---|
| `src/App.jsx` | Подписка на notify:clicked + state pendingNativeNotify | +30 / -0 |
| `src/native/NativeApp.jsx` | Удалить старый useEffect, принять prop pendingNotify | +20 / -25 |
| `src/native/store/nativeStoreIpc.js` | tg:new-message → создать NotificationSource | +15 / -5 |
| `main/handlers/notificationManager.js` | Принять source в showCustomNotification | +10 / -3 |
| `main/handlers/notifHandlers.js` | notify:clicked отправляет полный source | +8 / -3 |

**Итого**: ~150 строк нового кода + ~230 строк тестов

---

## Milestone M0.1 — NotificationSource module

### Описание

Создать неизменяемый объект-паспорт сообщения. Используется везде где упоминается сообщение.

### Файл: `src/shared/notificationSource.js`

**Экспорты**:
- `createNotificationSource(input)` — factory
- `validateNotificationSource(source)` — валидация
- `SOURCE_REQUIRED_FIELDS` — список обязательных полей

**Структура** (см. [architecture.md](../architecture.md)):

```
Обязательные:
- messengerId  (string)
- accountId    (string)
- chatId       (string)
- messageId    (string)

Опциональные:
- threadId     (string|null)
- senderId     (string)
- senderName   (string)
- chatTitle    (string)
- timestamp    (number)
- textPreview  (string, max 200 chars)
- mediaType    (string|null)
- replyToId    (string|null)
- isOutgoing   (boolean)
```

**Поведение**:
- `createNotificationSource({...})` → бросает Error если нет обязательного поля
- `validateNotificationSource(obj)` → возвращает `{ valid: boolean, errors: string[] }`
- `textPreview` обрезается до 200 символов (privacy by default)
- Объект **frozen** (Object.freeze) — invariant

### Файл: `src/shared/notificationSource.vitest.js`

**Тесты** (минимум 7):

1. `создание с минимальными обязательными полями` — должен работать
2. `создание без messengerId → ошибка`
3. `создание без accountId → ошибка`
4. `создание без chatId → ошибка`
5. `создание без messageId → ошибка`
6. `textPreview > 200 символов → обрезается`
7. `объект frozen — изменение поля ломается`

### Done criteria

- [ ] Файл создан
- [ ] Все 7 тестов проходят
- [ ] Lint / fileSizeLimits / check-memory ОК
- [ ] progress.md обновлён
- [ ] changelog.md обновлён

---

## Milestone M0.2 — useNotifyDispatcher (Action Bus)

### Описание

React hook который служит централизованным диспетчером действий. Используется в App.jsx.

### Файл: `src/hooks/useNotifyDispatcher.js`

**Сигнатура**:
```js
function useNotifyDispatcher() {
  const registryRef = useRef(new Map())  // actionId → handler
  const lastDispatchRef = useRef(new Map())  // actionId+sourceKey → timestamp (debounce)

  const registerAction = (actionId, handler) => {...}
  const unregisterAction = (actionId) => {...}
  const dispatch = async (actionId, source, args) => {...}

  return { registerAction, unregisterAction, dispatch }
}
```

**Поведение dispatch**:
1. Если actionId не зарегистрирован → log warning, return `{ ok: false, error: 'unknown_action' }`
2. Debounce 500ms по ключу `actionId + source.chatId + source.messageId`
3. Вызывает handler(source, args)
4. Catch ошибки → log + return `{ ok: false, error }`
5. Success → return `{ ok: true, result }`

### Файл: `src/hooks/useNotifyDispatcher.vitest.jsx`

**Тесты** (минимум 4):

1. `register + dispatch вызывает handler с правильными args`
2. `dispatch unknown action → warning + return ok:false`
3. `debounce 500ms для дубликатов`
4. `unregister удаляет handler`

### Done criteria

- [ ] Hook работает
- [ ] 4 теста проходят
- [ ] Lint / fileSizeLimits / check-memory ОК

---

## Milestone M0.3 — Cross-tab notify:clicked

### Описание

Перенести подписку на `notify:clicked` из NativeApp.jsx в корневой App.jsx.

### Изменения в `src/App.jsx`

**Добавить**:

```js
// state
const [pendingNativeNotify, setPendingNativeNotify] = useState(null)

// useEffect — подписка ВСЕГДА (App.jsx всегда смонтирован)
useEffect(() => {
  if (!window.api?.on) return undefined
  const unsub = window.api.on('notify:clicked', (payload) => {
    // payload = { messengerId, source, ... }
    if (payload.messengerId !== 'native_cc') return  // webview обрабатывает useNotifyNavigation
    
    setActiveId(NATIVE_CC_ID)  // переключить вкладку
    setPendingNativeNotify(payload)  // передать дальше
  })
  return unsub
}, [setActiveId])
```

**Передать пропом в NativeApp**:

```jsx
<NativeApp 
  pendingNotify={pendingNativeNotify} 
  clearPendingNotify={() => setPendingNativeNotify(null)} 
  ... 
/>
```

### Изменения в `src/native/NativeApp.jsx`

**УДАЛИТЬ** старый useEffect для `notify:clicked` (строки ~332-353).

**ДОБАВИТЬ** новый useEffect на изменение `pendingNotify` prop:

```js
useEffect(() => {
  if (!pendingNotify) return
  const { source } = pendingNotify
  if (!source) { clearPendingNotify(); return }

  // Извлечь данные из source (вместо парсинга chatTag)
  if (source.accountId && store.setActiveAccount) {
    store.setActiveAccount(source.accountId)
  }
  if (store.setActiveChat) {
    store.setActiveChat(source.chatId)
  }
  if (source.messageId && store.requestScrollToMessage) {
    store.requestScrollToMessage(source.chatId, source.messageId)
  }
  
  clearPendingNotify()
}, [pendingNotify])
```

### Тесты

**Новые тесты** в существующих файлах:

- `src/__tests__/App.crossTabNotify.vitest.jsx` (NEW):
  - mock notify:clicked event с native_cc messengerId → проверка setActiveId
  - mock notify:clicked event с webview messengerId → setActiveId НЕ вызывается
  - prop pendingNotify передаётся в NativeApp

- `src/native/NativeApp.vitest.jsx` (если есть):
  - prop pendingNotify → проверка вызовов store

### Manual checks (юзер)

- [ ] Запустить `npm run dev`
- [ ] Стоять на ЦентрЧатов → клик уведомление → переход ✓
- [ ] Стоять на webview (Telega/Макс) → клик native_cc уведомление → переключение + переход ✓
- [ ] Стоять на webview → клик webview уведомление → НЕ переключается на native_cc ✓

### Done criteria

- [ ] Cross-tab работает в трёх сценариях
- [ ] Тесты passed
- [ ] Manual проверки ОК
- [ ] problems.md: P-01 → RESOLVED

---

## Milestone M0.4 — NotificationSource через IPC

### Описание

Заменить hardcoded chatTag + messageId на полноценный NotificationSource во всех IPC.

### Изменения в `src/native/store/nativeStoreIpc.js`

**В handler `tg:new-message`** (строка ~437):

```js
// Было:
window.api?.invoke('app:custom-notify', {
  title: chat?.title || 'Telegram',
  body: preview || '[медиа]',
  ...
  chatTag: chatId,
  messageId: message?.id != null ? String(message.id) : null,
})

// Стало:
import { createNotificationSource } from '../../shared/notificationSource.js'

const source = createNotificationSource({
  messengerId: 'native_cc',
  accountId: chatId.split(':')[0],  // или прямое поле если есть
  chatId: chatId.split(':')[1] || chatId,
  threadId: message.threadId || null,
  messageId: String(message.id),
  senderId: message.senderId,
  senderName: message.senderName || chat?.title || '',
  chatTitle: chat?.title || '',
  timestamp: message.timestamp,
  textPreview: (message.text || '').slice(0, 200),
})

window.api?.invoke('app:custom-notify', {
  title: chat?.title || 'Telegram',
  body: preview || '[медиа]',
  ...
  source,  // полный паспорт
  // НЕ дублировать chatTag/messageId — только в source
})
```

### Изменения в `main/handlers/notificationManager.js`

**В `showCustomNotification`** (строка ~142):

```js
// Было:
async function showCustomNotification({ title, body, ..., chatTag, messageId }) {
  ...
  const data = { ..., chatTag: chatTag || '', messageId: messageId || null }
  notifItems.push(data)
}

// Стало:
async function showCustomNotification({ title, body, ..., source }) {
  ...
  const data = { ..., source: source || null }
  notifItems.push(data)
}
```

### Изменения в `main/handlers/notifHandlers.js`

**В `notif:click`** (строка ~26):

```js
// Было:
mainWindow.webContents.send('notify:clicked', {
  messengerId: item.messengerId,
  senderName: item.senderName || item.title || '',
  chatTag: item.chatTag || '',
  messageId: item.messageId || null,
})

// Стало:
mainWindow.webContents.send('notify:clicked', {
  messengerId: item.messengerId,
  source: item.source || null,  // полный паспорт
  // legacy fields для backward compat (если webview-handler ещё их использует):
  senderName: item.source?.senderName || item.title || '',
})
```

### Удаление diagnostic logs (v0.95.47)

После того как cross-tab работает — **удалить временные логи** v0.95.47:

- `[notify-emit]` в nativeStoreIpc.js
- `[notif-mgr] saved` в notificationManager.js
- `[notif-click] sending` в notifHandlers.js
- `[native-notify-recv]` в NativeApp.jsx
- `[pending-scroll-effect]` + `[scroll-to-message]` в InboxMode.jsx

**ВАЖНО**: оставить логи В audit log (Phase 2), но убрать debug console.log.

### Тесты

- `src/native/store/nativeStoreIpc.vitest.jsx`:
  - tg:new-message handler → emit `app:custom-notify` с полным source
  - source имеет все обязательные поля
  
- `main/handlers/notificationManager.vitest.js`:
  - showCustomNotification принимает source
  - source сохраняется в notifItems

### Done criteria

- [ ] Source проходит через IPC без потерь
- [ ] backward compat для webview сохранена
- [ ] Diagnostic logs удалены
- [ ] Тесты passed

---

## Milestone M0.5 — Регрессия + финальная проверка

### Описание

Полная проверка что ничего не сломано. Версия bump. Commit + push.

### Действия

1. **Запустить все тесты проекта**:
   ```bash
   npm run lint
   npm run test:vitest
   node src/__tests__/fileSizeLimits.test.cjs
   npm run check-memory
   ```

2. **Manual smoke test** (юзер):
   - [ ] Уведомления приходят (любые)
   - [ ] Клик «→ Перейти к чату» работает (ЦентрЧатов вкладка)
   - [ ] Клик «→ Перейти к чату» работает (webview вкладка → переключение)
   - [ ] Клик «✓ Прочитано» работает
   - [ ] AI Sidebar работает как раньше (текстовые suggestions)
   - [ ] Переключение между вкладками не ломает уведомления
   - [ ] Закрытие и открытие приложения — состояние сохраняется
   - [ ] Pre-existing функционал не сломан (NativeApp / scroll / mark-read)

3. **Версия bump**: v0.95.50 → v0.96.0
   - package.json + package-lock.json (2 места)
   - CLAUDE.md (3 места)
   - .memory-bank/features.md (2 места)
   - changelogData.js (новая запись для WhatsNewModal)

4. **Commit** с описанием:
   ```
   feat(v0.96.0): NotificationSource + Action Bus + cross-tab fix (Phase 0)
   
   Фундамент для AI-агента. Не меняет UX окромя cross-tab уведомлений.
   
   - NotificationSource — паспорт сообщения, invariant
   - useNotifyDispatcher — централизованный диспетчер в App.jsx
   - Cross-tab: уведомления работают с любой вкладки
   - Удалены диагностические логи v0.95.47
   
   См. .memory-bank/ai-agent-plan/phases/phase-0-foundation.md
   ```

5. **Push** + проверка CI

### Done criteria

- [ ] Все автоматические тесты passed
- [ ] Manual smoke test ОК
- [ ] Версия bumped
- [ ] Commit + push прошли
- [ ] CI зелёный
- [ ] progress.md: Phase 0 → 🟢 done
- [ ] problems.md: P-01, P-02 → RESOLVED
- [ ] **Юзер подтвердил → готов к Phase 1**

---

## Risks

| Риск | Вероятность | Митигация |
|---|---|---|
| Сломать существующий notification flow | Низкая | Поэтапно: сначала NotificationSource, потом IPC, потом удалить старое |
| Race condition setActiveId + setPendingNotify | Низкая | Tests + manual smoke |
| Backward compat сломает webview | Низкая | Сохранить legacy fields (senderName, chatTitle) |
| useNotifyNavigation для webview конфликт | Низкая | App.jsx handler делает early return для не-native_cc messengerId |

## Rollback план

Если что-то сломается:

```bash
git revert <commit-hash>  # откат коммита
# или
git reset --hard HEAD~1   # ТОЛЬКО если не запушено
```

После rollback — анализ в problems.md, новый план.

---

## Готовность к Phase 1

После завершения Phase 0:

- [x] NotificationSource работает
- [x] Action Bus в App.jsx
- [x] Cross-tab уведомления
- [x] Существующие действия (goto, mark-read) переведены на новый формат
- [x] Все тесты проходят
- [x] Manual smoke ОК
- [x] Версия v0.96.0 в production-ready состоянии

→ Готовы к Phase 1: Tool Use каркас.
