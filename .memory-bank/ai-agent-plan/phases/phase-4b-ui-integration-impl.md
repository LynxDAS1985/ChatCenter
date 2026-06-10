# Phase 4b — UI интеграция Phase 4 панелей (v1.0.1) — детальная реализация

> Цель: в v1.0.0 (Phase 4a) были созданы 3 панели (TasksPanel / RemindersPanel / AIActivityDashboard), но они **не были подключены** к UI. v1.0.1 — добавляет 3 иконки в шапку TabBar для открытия модалок.

---

## 1. Контекст

### 1.1 Что было до v1.0.1

Файлы `TasksPanel.jsx`, `RemindersPanel.jsx`, `AIActivityDashboard.jsx` существовали — но **нигде не использовались**. Не было кнопки чтобы их открыть. Юзер мог только:
- Косвенно увидеть задачи через AI agent если LLM вызовет `list_tasks`.
- Открыть `userData/tasks.json` руками в текстовом редакторе.

### 1.2 Что нужно

Простой и быстрый способ открыть панель. Рассмотрены 5 вариантов:
- A. Иконки в шапке + модалки ⭐⭐⭐⭐⭐ (выбран)
- B. Отдельные вкладки в шапке ⭐⭐⭐
- C. Подменю в Settings ⭐⭐
- D. Левая боковая панель (как Slack) ⭐⭐⭐⭐
- E. Плавающие окна ⭐⭐

**Выбран A** — иконки в шапке открывают модалки. Самый быстрый доступ (1 клик), не меняет структуру вкладок, знакомый паттерн.

---

## 2. Что появилось у юзера

```
┌────────────────────────────────────────────────────────────────────────┐
│ ●Telegram │ ●ВКонтакте │ ●WhatsApp │ ●Telega │ ●Макс │ ●ЦентрЧатов │+ │
├────────────────────────────────────────────────────────────────────────┤
│ 0сегодня│ 692всего│  🔍 🤖 📋 ⚡ 📝³ ⏰¹ 📊 🌙 ⚙  — □ ✕              │
│                                  ╰╯ ╰╯ ╰╯                              │
│                              новые в 1.0.1                              │
└────────────────────────────────────────────────────────────────────────┘
```

| Иконка | Цвет | Что открывает | Badge |
|---|---|---|---|
| 📝 | `#f59e0b` (оранжевый) | Задачи (TasksPanel) | число активных |
| ⏰ | `#eab308` (жёлтый) | Напоминания (RemindersPanel) | число pending |
| 📊 | `#ec4899` (розовый) | AI Activity (AIActivityDashboard) | — |

Клик → модалка по центру экрана с overlay затемнения.

---

## 3. Архитектура

```
┌──────────────────────────────────────────────────────────────┐
│ App.jsx                                                       │
│                                                               │
│  const [showTasks, setShowTasks] = useState(false)           │
│  const [showReminders, setShowReminders] = useState(false)   │
│  const [showActivity, setShowActivity] = useState(false)     │
│  const {tasks: tasksCount, reminders: remindersCount}        │
│    = useAppCounters()                                         │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ TabBar (props: showTasks/setShowTasks/...,            │    │
│  │         tasksCount/remindersCount)                    │    │
│  │  ┌──────────────────────────────────────────────┐    │    │
│  │  │ HeaderButton(active, color, badge, onClick) │    │    │
│  │  │  └─ <span class="badge">3</span> если badge │    │    │
│  │  └──────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  {showTasks && (                                              │
│    <PanelModal title="📝 Задачи" onClose={...}>               │
│      <TasksPanel onGoToSource={handleGoToSource}/>            │
│    </PanelModal>                                              │
│  )}                                                           │
│  // аналогично для Reminders/Activity                         │
│                                                               │
│  handleGoToSource(source):                                    │
│    - setShowTasks/Reminders/Activity(false)                   │
│    - setActiveId(NATIVE_CC_ID)                                │
│    - setPendingNativeNotify({...source})                      │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Новые файлы

### 4.1 `src/hooks/useAppCounters.js`

```js
export default function useAppCounters() {
  const [counters, setCounters] = useState({ tasks: 0, reminders: 0 })

  useEffect(() => {
    let cancelled = false
    
    const reload = async () => {
      const [t, r] = await Promise.all([
        window.api.invoke('tasks:list', {status: 'pending'}).catch(() => null),
        window.api.invoke('reminders:list', {status: 'pending'}).catch(() => null),
      ])
      if (cancelled) return
      setCounters({
        tasks: t?.ok ? t.tasks.length : 0,
        reminders: r?.ok ? r.reminders.length : 0,
      })
    }
    
    reload()
    const timer = setInterval(reload, 30000)
    
    let unsubTasks, unsubReminders
    if (window.api?.on) {
      unsubTasks = window.api.on('tasks:changed', reload)
      unsubReminders = window.api.on('reminders:changed', reload)
    }
    
    return () => {
      cancelled = true
      clearInterval(timer)
      unsubTasks?.()
      unsubReminders?.()
    }
  }, [])

  return counters
}
```

**Принципы**:
- **30-секундный poll** — чтобы badge всегда был свежим даже если что-то меняется в обход события (например, юзер руками отредактировал `tasks.json`).
- **Event-driven обновление** — `tasks:changed` / `reminders:changed` шлются main процессом при любой операции (create/update/delete). UI обновляется **мгновенно**, не дожидаясь 30 сек.
- **Cancelled flag** — защита от race: если компонент unmount во время IPC ожидания — не setCounters'им stale данные.
- **Catch на invoke** — если IPC упал (например, handler не зарегистрирован — было в логах юзера v1.0.1), просто игнорим (null), badge не показываем.

### 4.2 `src/components/PanelModal.jsx`

Универсальная обёртка-модалка:

```jsx
export default function PanelModal({title, onClose, children, width = 720}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width, maxWidth: '95vw', maxHeight: '85vh',
        background: 'var(--cc-bg)',
        border: '1px solid var(--cc-border)',
        borderRadius: 10,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{/* header с title + ✕ */}}>
          <div>{title}</div>
          <button onClick={onClose}>✕</button>
        </div>
        <div style={{overflow: 'auto', flex: 1}}>
          {children}
        </div>
      </div>
    </div>
  )
}
```

**Принципы**:
- **Overlay click → close** — клик по затемнению закрывает модалку.
- **stopPropagation на содержимом** — чтобы клик внутри модалки не закрывал её.
- **maxHeight 85vh** — не вылазит за экран при большом контенте, появится scroll.
- **Theme vars** — `var(--cc-bg)` подхватывает тёмную/светлую тему автоматически.
- **z-index 1000** — выше всех Settings/WhatsNew/etc.

### 4.3 Изменения в `src/components/TabBar.jsx`

#### Новые props
```js
showTasks, setShowTasks,
showReminders, setShowReminders,
showActivity, setShowActivity,
tasksCount = 0, remindersCount = 0,
```

#### 3 новые кнопки в шапке
```jsx
<HeaderButton active={showTasks} color="#f59e0b" 
              onClick={() => setShowTasks(!showTasks)} 
              title="Задачи" badge={tasksCount}>📝</HeaderButton>
<HeaderButton active={showReminders} color="#eab308" 
              onClick={() => setShowReminders(!showReminders)} 
              title="Напоминания" badge={remindersCount}>⏰</HeaderButton>
<HeaderButton active={showActivity} color="#ec4899" 
              onClick={() => setShowActivity(!showActivity)} 
              title="AI Activity">📊</HeaderButton>
```

#### HeaderButton с поддержкой badge
```jsx
function HeaderButton({active, color, onClick, title, badge, children}) {
  const showBadge = typeof badge === 'number' && badge > 0
  return (
    <button onClick={onClick} title={badge ? `${title} (${badge})` : title}>
      {children}
      {showBadge && (
        <span style={{
          position: 'absolute', top: 1, right: 1,
          minWidth: 14, height: 14, padding: '0 3px',
          background: '#ef4444', color: '#fff',
          fontSize: 9, fontWeight: 700, lineHeight: '14px',
          textAlign: 'center', borderRadius: 7,
          boxShadow: '0 0 0 1.5px var(--cc-surface)',
          pointerEvents: 'none',
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
```

**Принципы badge**:
- Красный круг 14×14 (фиксированный размер).
- Видно даже на тёмной шапке (белый текст, красный фон).
- `boxShadow` создаёт «обводку» цвета шапки — визуально отделяет badge от иконки.
- `pointerEvents: 'none'` — клик проходит сквозь badge на кнопку (badge не intercept'ит).
- `> 99 → '99+'` — чтобы не вылезало за круг при больших числах.

### 4.4 Изменения в `src/App.jsx`

#### Lazy import 3 панелей
```js
const PanelModal = lazy(() => import('./components/PanelModal.jsx'))
const TasksPanel = lazy(() => import('./components/TasksPanel.jsx'))
const RemindersPanel = lazy(() => import('./components/RemindersPanel.jsx'))
const AIActivityDashboard = lazy(() => import('./components/AIActivityDashboard.jsx'))
```

**Зачем lazy**: пока модалка не открыта — bundle не загружен. Стартап быстрее. JSX внутри `<Suspense fallback={null}>` рендерится после загрузки.

#### Новые state
```js
const [showTasks, setShowTasks] = useState(false)
const [showReminders, setShowReminders] = useState(false)
const [showActivity, setShowActivity] = useState(false)
const {tasks: tasksCount, reminders: remindersCount} = useAppCounters()
```

#### handleGoToSource
```js
const handleGoToSource = useCallback((source) => {
  if (!source) return
  setShowTasks(false)
  setShowReminders(false)
  setShowActivity(false)
  if (source.messengerId === NATIVE_CC_ID) {
    setActiveId(NATIVE_CC_ID)
    setPendingNativeNotify({...source})
  }
}, [])
```

**Что делает**:
1. Закрывает все 3 модалки.
2. Переключает активную вкладку на `native_cc`.
3. Кладёт `source` в `pendingNativeNotify` — **тот же путь** что для `notify:clicked` (см. Phase 0). NativeApp при mount/update подхватит и сделает scroll к сообщению.

**Принцип**: переиспользуем существующий путь навигации. Не дублируем логику.

#### Рендер модалок
```jsx
<Suspense fallback={null}>
  {showTasks && (
    <PanelModal title="📝 Задачи" onClose={() => setShowTasks(false)} width={760}>
      <TasksPanel onGoToSource={handleGoToSource} />
    </PanelModal>
  )}
  {showReminders && (
    <PanelModal title="⏰ Напоминания" onClose={() => setShowReminders(false)} width={680}>
      <RemindersPanel onGoToSource={handleGoToSource} />
    </PanelModal>
  )}
  {showActivity && (
    <PanelModal title="📊 AI Activity" onClose={() => setShowActivity(false)} width={900}>
      <AIActivityDashboard />
    </PanelModal>
  )}
</Suspense>
```

---

## 5. Поток типичного действия

### 5.1 Открытие модалки задач
```
1. Юзер кликает 📝 в шапке.
2. TabBar HeaderButton.onClick → setShowTasks(true).
3. App.jsx re-render → JSX рендерит <PanelModal><TasksPanel /></PanelModal>.
4. Lazy-loader подгружает chunk если ещё не загружен (~200мс первый раз, 0мс потом).
5. PanelModal монтируется с overlay + header.
6. TasksPanel внутри: useEffect → listTasks() → IPC tasks:list → main → file read.
7. TasksPanel рендерит список задач.
8. Если задач много — внутренний scroll работает (maxHeight модалки = 85vh).
```

### 5.2 Клик по задаче с source
```
1. TasksPanel item.onClick → onGoToSource(task.source).
2. handleGoToSource:
   - setShowTasks(false) → модалка закрывается.
   - setActiveId(NATIVE_CC_ID) → активная вкладка → ЦентрЧатов.
   - setPendingNativeNotify({...source}) → передаётся в NativeApp.
3. NativeApp монтируется (если не был) и видит pendingNotify prop:
   - setActiveAccount(source.accountId)
   - setActiveChat(source.chatId, source.topicId)
   - requestScrollToMessage(source.messageId)
   - clearPendingNotify()
4. nativeStore показывает чат, scroll к сообщению с подсветкой.
```

### 5.3 Закрытие модалки
- Клик ✕ → onClose.
- Клик по затемнению → onClose.
- Esc — пока не реализован (TODO).

---

## 6. Подводные камни

### 6.1 «Handler not registered for tasks:list»
**Симптом**: в логе ошибка `Error: No handler registered for 'tasks:list'`.

**Причина**: dev mode — vite hot-reload работает **только для renderer**. Main процесс остался на старом коде где не было initTaskIpcHandlers.

**Решение**: полный перезапуск приложения.

**Защита**: useAppCounters.js → `.catch(() => null)` — если IPC падает, badge просто не показывается, не блокирует UI.

### 6.2 Lazy load — задержка первого открытия
**Сценарий**: юзер первый раз кликает 📝 — модалка появляется через 200-300 мс.

**Это OK**: дальше chunk закэширован, мгновенно. Альтернатива (eager import) — увеличивает initial bundle на ~50 КБ. Не оправдано для редко-используемых модалок.

### 6.3 Несколько модалок одновременно?
**Запрещено**: state'ы independent (showTasks/showReminders/showActivity) — теоретически могут быть открыты все 3 одновременно. Будет хаос: модалки наложатся.

**Текущее**: ничего не запрещает. Полагаемся на UX — юзер не клик нет «открыть всё».

**TODO**: при клике 📝 — `setShowReminders(false); setShowActivity(false); setShowTasks(true)`.

### 6.4 Badge показывает 0
**Текущее**: если `count === 0`, badge **не рендерится** (условие `showBadge = badge > 0`). Чистая иконка без круга.

**Почему**: 0 — это «нет задач», показывать круг было бы misleading.

### 6.5 useAppCounters polling в фоне
30-секундный setInterval работает всегда пока App смонтирован — даже если ни одна модалка не открыта. Это OK (IPC дёшев), но **TODO**: если приложение в фоне (windowFocused=false) — можно увеличить интервал до 5 минут.

---

## 7. Лимиты и тесты

### 7.1 fileSizeLimits exceptions
- `src/App.jsx`: ceiling 880 → 940 (+50 строк интеграции).
- `src/utils/changelogData.js`: ceiling 350 → 400 (новая запись).
- `src/__tests__/componentScope.test.cjs`: ALLOWED.App расширен на `onGoToSource`, `tasksCount`, `remindersCount`.
- `src/__tests__/ipcChannels.test.cjs`: scan list расширен на `taskIpcHandlers.js`, `reminderIpcHandlers.js`.
- `src/__tests__/fileSizeLimits.test.cjs`: renderer total 25200 → 25400.

### 7.2 Регрессия
- ESLint 0 warnings.
- vitest 1255 passed (+ небольшие changelog test обновления для '1.0.1').
- pre-push 31/31 ✅.

---

## 8. Что осталось

1. **Esc для закрытия** модалок.
2. **Mutually exclusive** — одна модалка за раз.
3. **Badge polling adaptive** — увеличить интервал когда window не focused.
4. **Анимация открытия** — fade-in модалки (сейчас сразу появляется).
5. **`/` keyboard shortcut** — открыть TasksPanel например.

---

## 9. Файлы — сводка

| Файл | Тип | Что |
|---|---|---|
| `src/hooks/useAppCounters.js` | новый | poll + event-listen для badge |
| `src/components/PanelModal.jsx` | новый | overlay + ✕ обёртка |
| `src/components/TabBar.jsx` | edit | 8 новых props + HeaderButton badge |
| `src/App.jsx` | edit | 3 state + lazy import + handleGoToSource |
| `src/__tests__/componentScope.test.cjs` | edit | ALLOWED |
| `src/__tests__/ipcChannels.test.cjs` | edit | scan list |
| `src/__tests__/fileSizeLimits.test.cjs` | edit | renderer total |
| `src/__tests__/fileSizeLimitsExceptions.cjs` | edit | App.jsx ceiling |
| `src/utils/changelogData.js` | edit | новая запись v1.0.1 |
| `src/utils/changelogData.vitest.js` | edit | '1.0.0' → '1.0.1' |

---

**Версия документа**: создан 9 июня 2026 для v1.0.1.
