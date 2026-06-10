# Phase 4.3 — AI auto-reply rules (v1.1.0) — детальная реализация

> Цель: AI агент работает **сам**. До v1.1.0 — кликаешь «🤖 AI» на уведомлении → AI обрабатывает. После v1.1.0 — пишешь правила «когда что делать», AI обрабатывает автоматически.

---

## 1. Контекст

### 1.1 До v1.1.0
- AI агент срабатывал только когда юзер **руками** клик «🤖 AI» (Phase 3).
- Каждое срабатывание требует внимания юзера.
- 100 чатов с одинаковым типичным вопросом «можно ли счёт?» = 100 ручных кликов.

### 1.2 После v1.1.0
- Юзер один раз создаёт правило: «в чате *БНК-Авто* при сообщении со словом *счёт* в рабочие часы — AI отвечает по подсказке *Счёт будет к 18:00*».
- AI **сам** реагирует — без участия юзера.
- Защиты: cooldown, исключение ботов/каналов/своих сообщений.

### 1.3 Что СДЕЛАНО в v1.1.1 (integration)

**Integration с TDLib message stream подключена.** В v1.1.0 была foundation (модель/хранилище/engine/UI), v1.1.1 — реальный pipeline.

Новые компоненты:
- `main/ai/autoReplyDispatcher.js` — подписан на `manager.on('message:new')`. Pipeline: payload → buildEngineMessage → findMatchingRules → ai_reply/mark_read.
- `aiToolExecutor.runAgentLoop`: новые параметры `actor` + `autoConfirm`. При `actor='ai_auto' && autoConfirm=true` обходит UI confirm для confirm-required tools (HARDCODED_DENY всё равно блокирует).
- main.js: `initAutoReplyDispatcher` подключается после tdlib startup. callProvider пока null — провайдер выбирается в renderer (TODO v1.1.2 — пробросить из settings.ai в main).

Защиты от петель (3 уровня):
1. `excludeOutgoing` в engine matchRule + ранний exit в processNewMessage до загрузки rules.
2. `rule.cooldownMinutes` (default 60 мин) — между срабатываниями того же rule.
3. Dispatcher loop protection: 30 сек между ai_reply для одного chatId + global rate limit 10 в минуту.

### 1.4 Что осталось (deferred v1.1.2)
- **callProvider integration**: dispatcher запускает runAgent с `callProvider: null` — фактическая AI работа не происходит до конфигурации провайдера в renderer. Нужно: пробросить provider+apiKey из settings.ai в main и в dispatcher.
- **Audit streaming в renderer**: actor='ai_auto' уже идёт в audit log, но AIActivityDashboard может не различать UI-инициированные vs auto.
- **UI «выкл/вкл все правила»** — глобальный switch в Settings.

---

## 2. Архитектура

```
┌────────────────────────────────────────────────────────────────────┐
│                    UI Layer (Renderer)                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ AIAutoReplyRules.jsx                                          │  │
│  │  - Список правил (с toggle/delete/edit buttons)              │  │
│  │  - RuleForm — форма создания/редактирования                  │  │
│  │  - Триггеры: keywords, schedule (дни+часы), cooldown          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           ↓ через autoReplyRulesStore (renderer wrapper)            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ autoReplyRulesStore.js                                        │  │
│  │  - createRuleRecord(params) → валидация defaults             │  │
│  │  - createRule/listRules/updateRule/deleteRule/toggleRule     │  │
│  │    → window.api.invoke('auto-reply:*')                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                            ↕ IPC
┌────────────────────────────────────────────────────────────────────┐
│                    Main Layer                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ autoReplyRulesIpcHandlers.js                                  │  │
│  │  - ipcMain.handle('auto-reply:create'/'list'/'update'/'del') │  │
│  │  - JSON userData/auto-reply-rules.json (atomic write)        │  │
│  │  - getCachedRules() / markRuleMatched(id) — для engine       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           ↓ engine читает rules                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ autoReplyEngine.js (pure functions, fully tested)             │  │
│  │  - matchRule(rule, message, now) → boolean                   │  │
│  │  - findMatchingRules(rules, message, now) → matched array    │  │
│  │  - checkKeywords / checkSchedule / checkCooldown helpers     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           ↓ (deferred в v1.1.1)                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ TDLib new-message subscriber (НЕ ПОДКЛЮЧЕНО в v1.1.0)         │  │
│  │  manager.on('message') →                                      │  │
│  │  findMatchingRules(getCachedRules(), msg, Date.now())        │  │
│  │  → если match → runAgentLoop с auto-confirm + prompt hint    │  │
│  │  → markRuleMatched(rule.id) → audit log actor='ai_auto'      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Структура правила

```js
{
  id: 'rule_1712...',
  name: 'КП по запросу',
  enabled: true,
  triggers: {
    chatIds: ['tg_main:-100'],       // если пусто — любой чат
    messengerIds: ['native_cc'],     // если пусто — все native_*
    senderIds: [],                    // если пусто — любой отправитель
    keywords: ['счёт', 'invoice'],   // если пусто — любой текст
    keywordsMode: 'any' | 'all',
    schedule: {
      enabled: true,
      days: [1, 2, 3, 4, 5],         // 1=Пн, 7=Вс
      from: '09:00',
      to: '18:00',
    },
    excludeBots: true,                // default true
    excludeChannels: true,            // default true
    excludeOutgoing: true,            // default true — не отвечать на свои
  },
  action: {
    type: 'ai_reply' | 'mark_read',
    aiPromptHint: 'Ответь что КП в работе',
  },
  cooldownMinutes: 60,                // между срабатываниями для того же чата
  matchedCount: 0,
  lastMatchedAt: null,
  createdAt: 1712...,
  updatedAt: 1712...,
}
```

### 3.1 Защиты от петель и спама

| Защита | Где | Как работает |
|---|---|---|
| `excludeOutgoing` | engine | Не реагировать на свои сообщения (default true). Без этого AI отвечает на ответ AI = бесконечный цикл. |
| `excludeBots` | engine | `chatType === 'bot'` → skip. Не отвечать ботам Telegram. |
| `excludeChannels` | engine | `chatType === 'channel'` → skip. Каналы — broadcast, не диалог. |
| `cooldownMinutes` | engine + handler | Между срабатываниями для **того же rule**. Default 60 мин. Защита от спама — даже если 10 «счёт» подряд, AI ответит один раз. |
| `schedule.enabled` | engine | Если работает только в рабочие часы — ночью молчит. |
| HARDCODED native только | engine | Default — только `messengerId.startsWith('native_')`. Webview не поддерживается. |
| `messengerId.startsWith('native_')` | engine | Прямая проверка — webview мессенджеры (WhatsApp, VK) не реагируют. |

---

## 4. Engine — pure functions

### 4.1 `matchRule(rule, message, now)` — главная функция

8 проверок последовательно (early return на false):

```js
1. rule.enabled === true              // выключенное правило → false
2. !message.isOutgoing (если excludeOutgoing) → защита от петли
3. messengerId в whitelist ИЛИ default native_*
4. chatIds whitelist (если задан)
5. senderIds whitelist (если задан)
6. !excludeBots || chatType !== 'bot'
   !excludeChannels || chatType !== 'channel'
7. checkKeywords(keywords, mode, text)  // OR / AND
8. checkSchedule(schedule, now)         // день недели + диапазон HH:MM
9. checkCooldown(rule, now)             // прошло ли cooldownMinutes
```

### 4.2 `checkKeywords(keywords, mode, text)`

- Пустой `keywords` → `true` (нет фильтра).
- Case-insensitive (всё в `toLowerCase`).
- Подстрочный поиск (`includes`), не regex (защита от ReDoS).
- `mode='any'` — OR (хотя бы один найден).
- `mode='all'` — AND (все найдены).

### 4.3 `checkSchedule(schedule, now)`

- `schedule.enabled === false` → `true`.
- День недели: JS `getDay()` (0=Вс) → конвертация в наш формат (1=Пн..7=Вс).
- Час: парсим `HH:MM` → минуты от начала суток.
- Поддержка диапазона **через полночь** (`from='22:00' to='06:00'`): берётся либо `now >= from` либо `now <= to`.
- Invalid HH:MM → `true` (пропускаем — не блокируем правило из-за typo).

### 4.4 `checkCooldown(rule, now)`

- `lastMatchedAt = null` → `true` (никогда не срабатывало).
- `cooldownMinutes = 0` → `true` (нет cooldown).
- `now - lastMatchedAt >= cooldownMinutes * 60_000` → `true`.

### 4.5 Почему pure functions
- **Тестируемость**: можно проверить с любым `now` (фиксированная дата) без `vi.useFakeTimers()`.
- **Race-free**: `now` явный параметр — нет неявных зависимостей.
- **Reusable**: engine может работать в renderer или main одинаково.

---

## 5. UI компонент AIAutoReplyRules.jsx

### 5.1 Два режима

**Mode 1 — список**:
```
┌──────────────────────────────────────────────────────────┐
│ 🤖 Правила автоответа                  [+ Новое правило] │
├──────────────────────────────────────────────────────────┤
│ ┃ КП по запросу                              [Вкл] ✏️ 🗑│
│   🤖 AI отвечает · 🔑 счёт, invoice · 📅 09:00–18:00      │
│   ⏳ cooldown 60мин · Срабатываний: 12 · последнее 09:32  │
│                                                          │
│ ┃ Отметить все спам                           [Вкл] ✏️ 🗑│
│   ✓ Отметить прочитанным · 🔑 заём, кредит                │
└──────────────────────────────────────────────────────────┘
```

**Mode 2 — форма** (`editing=newOrExisting`):
- Название
- Ключевые слова (через запятую) + radio any/all
- ☑ Только в рабочее время → дни недели (7 кнопок-тогглов) + from/to
- select action: ai_reply / mark_read
- textarea aiPromptHint (если ai_reply)
- input cooldown в минутах
- ☑ Правило включено
- [Сохранить] [Отмена]

### 5.2 Поток создания правила
```
1. Юзер кликает «+ Новое правило» → setEditing('new').
2. RuleForm рендерится с пустыми полями.
3. Юзер заполняет и нажимает «Сохранить».
4. handleSubmit формирует rule object.
5. handleSave → createRule(rule) → IPC auto-reply:create.
6. main сохраняет в auto-reply-rules.json.
7. setEditing(null) + reload() → список обновляется.
```

### 5.3 Toggle on/off
- Чекбокс в карточке правила.
- `handleToggle(id, enabled)` → `toggleRule(id, enabled)` → `auto-reply:update` с `{enabled}`.
- Reload — карточка перерисуется с другим цветом полоски (зелёная/серая).

---

## 6. IPC handlers

| Канал | Что делает |
|---|---|
| `auto-reply:create` | принимает готовый rule (id уже сгенерирован renderer'ом), push в cache, save |
| `auto-reply:list` | возвращает all rules, sorted DESC по createdAt |
| `auto-reply:update` | patch (`{...current, ...updates, updatedAt: now}`) |
| `auto-reply:delete` | filter out + save |

### 6.1 Atomic write
Тот же паттерн что в `taskIpcHandlers` — `.tmp + rename`. Если процесс упадёт во время записи — оригинальный файл не повредится.

### 6.2 In-memory cache
`_cache` — массив правил загружается lazy при первом обращении. Дальше все операции in-memory + сразу save.

### 6.3 getCachedRules / markRuleMatched
Экспорты для engine integration (deferred в v1.1.1):
- `getCachedRules()` — синхронный геттер.
- `markRuleMatched(ruleId)` — инкремент `matchedCount`, ставит `lastMatchedAt = Date.now()`, save.

---

## 7. Тесты

### 7.1 autoReplyEngine.vitest.js — 33 теста
- **checkKeywords**: 5 — пустой массив, any/all, case-insensitive, пустой text.
- **checkSchedule**: 8 — отключён, рабочее время match/miss, не тот день, через полночь, parseTimeMinutes валидация.
- **checkCooldown**: 4 — null lastMatchedAt, 0 cooldown, ещё не прошло, уже прошло.
- **matchRule** (главная): 13 — disabled rule, минимальное rule + native, outgoing, webview, chatIds whitelist, senderIds, keywords any/all, excludeBots/Channels, schedule outside hours, cooldown active/passed.
- **findMatchingRules**: 2 — только enabled+matched, пустой массив.
- **describeRuleMatch**: 1 — структура для audit.

### 7.2 autoReplyRulesStore.vitest.js — 18 тестов
- **createRuleRecord**: 10 — defaults, обрезка name, валидация keywordsMode/action.type/cooldown, фильтр invalid days, default true для excludeOutgoing.
- **IPC wrappers**: 7 — все 5 (create/list/update/delete/toggle), no window.api, IPC throw.
- **_internal**: 1 — generateId уникален.

**Всего: 51 unit-теста**. Все pure functions / mock IPC — никакого реального fs/Electron.

---

## 8. Файлы — сводка

| Файл | Тип | Что |
|---|---|---|
| `src/stores/autoReplyRulesStore.js` | новый | renderer CRUD + createRuleRecord валидация |
| `src/stores/autoReplyRulesStore.vitest.js` | новый | 18 тестов |
| `main/handlers/autoReplyRulesIpcHandlers.js` | новый | persistent storage + atomic write |
| `main/ai/autoReplyEngine.js` | новый | pure functions matchRule + helpers |
| `main/ai/autoReplyEngine.vitest.js` | новый | 33 теста |
| `src/components/AIAutoReplyRules.jsx` | новый | UI list + RuleForm |
| `main/main.js` | edit | initAutoReplyRulesIpcHandlers вызов |
| `src/App.jsx` | edit | lazy import + state openPanel='autoreply' + handlers |
| `src/components/TabBar.jsx` | edit | 🤖⚡ кнопка #8b5cf6 фиолетовая |
| `src/__tests__/ipcChannels.test.cjs` | edit | autoReplyRulesIpcHandlers в scan list |
| `src/__tests__/fileSizeLimits.test.cjs` | edit | renderer total 25600 → 26000 |

---

## 9. Поток будущей integration (v1.1.1 — план)

```
1. TDLib эмитит updateNewMessage с {chatId, msg, ...}
2. nativeStoreIpc обработчик создаёт NotificationSource паспорт (как и раньше).
3. НОВЫЙ хук: вызывает autoReplyEngine.findMatchingRules(getCachedRules(), source, Date.now()).
4. Если matched.length === 0 → ничего не делать (стандартный flow).
5. Если matched > 0 → берём первое (или все по очереди?) правило.
6. Для action='mark_read' → context.markAsRead({...source}) напрямую (без AI).
7. Для action='ai_reply' →
   - runAgentLoop с initialMessages включающим rule.action.aiPromptHint.
   - autoConfirm:true (или новый actor='ai_auto' без onConfirmRequest).
   - audit entry: actor='ai_auto', ruleId, ruleName.
   - Loop protection: в кэше {chatId → lastAutoReplyAt} — не запускать повторно для того же чата чаще раза в N мин (отдельно от rule.cooldown).
8. После успеха: markRuleMatched(rule.id) → matchedCount++, lastMatchedAt=now.
9. Streaming в UI через AISidebarAgent (если открыт) — иначе тихо.
```

**Сложности**:
- `aiToolExecutor.runAgent` сейчас требует UI confirm для `reply_to_message`. Нужно либо новый параметр `bypassConfirmForActor='ai_auto'`, либо переключить permission на `auto` только когда вызывается из auto-reply engine.
- AI может ошибиться — нужно полный audit log с ruleId для отладки.
- Защита от rate-limit на стороне Anthropic/OpenAI (если AI ответит на 100 сообщений за минуту).

---

## 10. Что осталось / TODO

1. **Integration с tg:new-message** (v1.1.1) — главное.
2. **UI per-chat selector** — выбрать chatId из списка чатов, а не вводить руками.
3. **Per-sender selector** — то же для senderId.
4. **Превью «когда сработает»** — в форме показывать рассчётно «совпадёт N сообщений за последний день».
5. **Cooldown в UI** — отдельный счётчик «next firing possible at HH:MM».
6. **Bulk enable/disable** — массовое включение группы правил.
7. **Import/Export** — поделиться набором правил.

---

**Версия документа**: создан 9 июня 2026 для v1.1.0 (Phase 4.3 foundation).
