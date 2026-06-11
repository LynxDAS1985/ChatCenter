# Финальная фиксация AI Bridge — v1.2.3 (полная история v1.1.7 → v1.2.3)

> Полная карта что было сделано, для чего и как работает.
> Сессия 11 июня 2026 — 17 релизов AI Bridge + предшествующие.

---

## 📊 Все релизы (хронология)

| Версия | Этап | Что | Тестов | Commit |
|---|---|---|---|---|
| v1.1.7 | 0 | Fix переключения режимов AI (баг `set()`) | +17 | d67a2df |
| v1.1.8 | 1 | Контракты + папки + типы для AI Bridge | +30 | 6d86a3a |
| v1.1.9 | — | Разбиение топ-5 больших файлов | +63 | e2b899b |
| v1.1.10 | 2 | Local Bridge (Ollama HTTP) | +37 | b9c94db |
| v1.1.11 | 3 | API Bridge (4 провайдера) | +33 | 7a11647 |
| v1.1.12 | 4 | WebUI Bridge skeleton + preload + IPC | +19 | b1f9433 |
| v1.1.13 | 5+6 | 4 hook файла (ChatGPT/DeepSeek/Claude/ГигаЧат) | +30 | 1c094bd |
| v1.1.14 | (UI v1) | Первый UI-тестер в LogModal | +11 | 619a73c |
| v1.1.15 | (UI v2) | Кнопка 🤖 «Проверка AI» в AISidebar | — | 2bb296b |
| v1.1.16 | 7 | webview AI ↔ Bridge через registerWebview | +17 | 7f54448 |
| v1.1.17 | 8 | UI редактор кастомных селекторов | +11 | 08aebbb |
| v1.1.18 | 9 | Fallback chain (программно) | +17 | 1ba06ad |
| **v1.2.0** | 10+11 | 📘 Документация + RELEASE | — | 5acabb9 |
| v1.2.1 | (deferred 1) | UI чекбокс «авто-резерв» в AiBridgeCheck | +20 | 3600caf |
| v1.2.2 | (deferred 2) | AI Agent через Bridge (🔁 Через Bridge в уведомлении) | +12 | dc68784 |
| **v1.2.3** | (deferred 3) | **Авто-ответы через Bridge** (🔁 в правилах) | +10 | a7ef471 |

**Тестов всего**: 1490 → 1795 (+305 за сессию).

---

## 🌉 Архитектура AI Bridge — как всё работает

### Три «источника» AI под одним интерфейсом

```
┌─────────────────────────────────────────────────────────────────┐
│  ТРИ ВХОДА в AI Bridge                                          │
│                                                                  │
│  1. 🤖 «Проверка AI» в AISidebar (v1.1.15+)                     │
│     — юзер вручную: выбрал → задал вопрос → получил ответ        │
│                                                                  │
│  2. AI Agent (кнопка «🤖 AI» в уведомлении) (v1.2.2)            │
│     — галочка «🔁 Через Bridge» в карточке агента               │
│     — простой Q&A без tool use, с резервом                       │
│                                                                  │
│  3. Авто-ответы (правила Phase 4.3) (v1.2.3)                    │
│     — галочка «🔁 Через AI Bridge» в форме правила              │
│     — автоматически отправляет text-ответ через TDLib            │
└─────────────────┬───────────────────────────────────────────────┘
                  │ единый IPC канал
                  │ ai-bridge:send
┌─────────────────▼───────────────────────────────────────────────┐
│  MAIN: handleSend (aiBridgeIpcHandlers.js)                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ payload.chain[] → createFallbackChain                    │   │
│  │ иначе → createAiBridgeRouter(mode)                       │   │
│  └──────────┬───────────────────────────────────────────────┘   │
│             │                                                    │
│   ┌─────────┼─────────┬──────────────────────┐                  │
│   ▼         ▼         ▼                      ▼                  │
│ LOCAL    API       WEBUI                  Webview AI            │
│ Ollama   HTTP      webContents.send       ai-monitor.preload    │
│         (4 пров.)                         + hook (4 файла)      │
└─────────────────────────────────────────────────────────────────┘
```

### Цепочка fallback (v1.1.18 + v1.2.1)

```
[primary]                           ← текущий выбор юзера
  ↓ если упал retryable
[все API провайдеры с ключами]      ← из settings.aiProviderKeys
  ↓
[Ollama local (всегда последний)]   ← из settings.aiOllamaBaseUrl
```

**Что считается «можно пробовать дальше»**:
- ✅ network_error / server_error (5xx) / rate_limited (429) / streaming_timeout — retryable
- ✅ auth_required c «missing API key» — у следующего провайдера может быть ключ
- ❌ auth_required (неверный ключ) — стоп
- ❌ aborted — юзер сам отменил
- ❌ unsupported_mode / config_invalid (4xx не 401/403/429) — стоп

---

## 🧩 Компоненты по группам

### 1. Базовая инфраструктура (v1.1.8)

| Файл | Что |
|---|---|
| `src/utils/aiBridge/contracts.js` | JSDoc типы: AiBridgeQuestion / AiBridgeAnswer / AiBridgeError + 11 кодов ошибок |
| `src/utils/aiWebviewConfigs.js` | 4 провайдера + detectAiProvider(url) + getDefaultSelectors |
| `main/ai/bridge/router.js` | createAiBridgeRouter(mode, deps) — каркас выбора bridge |

### 2. Три bridges (v1.1.10 — v1.1.13)

| Файл | Что |
|---|---|
| `main/ai/bridge/localBridge.js` | Ollama HTTP (OpenAI-compatible /api/chat) |
| `main/ai/bridge/apiBridge.js` | Обёртка callProvider для Anthropic/OpenAI/DeepSeek/ГигаЧат |
| `main/ai/bridge/webUiBridge.js` | webContents.send → preload → hook |
| `main/preloads/ai-monitor.preload.cjs` | Detect провайдера + загрузка hook + IPC bridge |
| `main/preloads/hooks/ai/openai.hook.js` | DOM injection для chat.openai.com / chatgpt.com |
| `main/preloads/hooks/ai/deepseek.hook.js` | chat.deepseek.com |
| `main/preloads/hooks/ai/anthropic.hook.js` | claude.ai (contenteditable + InputEvent) |
| `main/preloads/hooks/ai/gigachat.hook.js` | giga.chat |

### 3. IPC слой (v1.1.10 — v1.1.16)

| Файл | Что |
|---|---|
| `main/handlers/aiBridgeIpcHandlers.js` | registerAiBridgeIpcHandlers + handleSend + handleRegisterWebview |
| `src/utils/aiBridge/index.js` | renderer wrapper sendQuestion |

**IPC каналы**:

| Канал | От → к | Назначение |
|---|---|---|
| `ai-bridge:send` | renderer → main (invoke) | Главный: отправить вопрос, получить ответ |
| `ai-bridge:webui:register-webview` | renderer → main | Регистрация webview AI сайта в Bridge |
| `ai-bridge:webui:unregister-webview` | renderer → main | Отписка |
| `ai-bridge:webui:inject` | main → preload (send) | Команда «вставь вопрос» |
| `ai-bridge:webui:answer-received` | preload → main | Ответ от hook |
| `ai-bridge:webui:error` | preload → main | Ошибка от hook |
| `ai-bridge:webui:ready` | preload → main | Preload готов |

### 4. UI компоненты (v1.1.15, 1.1.17, 1.2.1, 1.2.2, 1.2.3)

| Файл | Что |
|---|---|
| `src/components/AiBridgeCheck.jsx` | 🤖 «Проверка AI» — главная UI точка |
| `src/components/AiSelectorsEditor.jsx` | 🔧 Редактор CSS селекторов для AI сайтов |
| `src/components/AISidebarAgent.jsx` | Расширен: чекбокс «🔁 Через Bridge» |
| `src/components/AIAutoReplyRules.jsx` | Расширен: чекбокс в форме правила |

### 5. Hooks и утилиты (v1.1.16, 1.2.1, 1.2.2)

| Файл | Что |
|---|---|
| `src/native/hooks/useAiWebviewBridge.js` | Авто-подключение webview AI к Bridge |
| `src/hooks/useAIAgent.js` | Расширен: useBridge=true → ai-bridge:send |
| `src/utils/aiBridge/buildAutoChain.js` | Сборка chain из settings (primary + ключи + Ollama) |
| `src/utils/aiBridge/agentBridgeRunner.js` | Pure runner для AI Agent через Bridge |

### 6. Fallback chain (v1.1.18)

| Файл | Что |
|---|---|
| `main/ai/bridge/fallbackChain.js` | createFallbackChain(steps, factories) |

### 7. Авто-ответы через Bridge (v1.2.3)

| Файл | Что изменено |
|---|---|
| `main/ai/autoReplyDispatcher.js` | + dispatchAiReplyViaBridge ветка для `rule.action.useBridge=true` |
| `main/main.js` | + deps.bridgeSend / getRecentMessages / handlerContext.sendMessage |

---

## 🎯 Что юзер видит и делает (полные сценарии)

### Сценарий 1: «Хочу проверить как работает AI» (любой режим)

1. Открыть **AI Sidebar** справа.
2. В шапке нажать **🤖** (рядом с ⚙️).
3. Выбрать режим: Локальный (Ollama) / API провайдер / Веб-интерфейс.
4. Выбрать провайдера (для API/Веб).
5. Опционально: галочка **🔁 Использовать авто-резерв** (v1.2.1).
6. Опционально: **🔧 Настроить селекторы** (v1.1.17, для Веб-интерфейса если сайт обновился).
7. Ввести вопрос → **📤 Спросить**.
8. Ответ в зелёной карточке + если был резерв «🔁 Авто-резерв сработал: anthropic(rate_limited) → openai».
9. Все этапы в **📒 Логи ChatCenter**.

### Сценарий 2: «Получил уведомление, хочу AI помог ответить»

1. Клиент пишет в Telegram → уведомление с кнопкой **🤖 AI**.
2. Клик → AI Sidebar открывается с карточкой агента.
3. **Default** — AI Agent с tool use (умные действия через API).
4. Включить **🔁 Через Bridge** (v1.2.2) — простой Q&A с резервом и Ollama.
5. AI пишет ответ → юзер копирует или редактирует и отправляет.

### Сценарий 3: «Хочу чтобы AI отвечал автоматически по правилам»

1. Открыть **AI auto-reply правила** (иконка 🤖⚡ в шапке).
2. Создать правило: триггеры (чаты/слова/расписание) + действие **🤖 AI отвечает**.
3. Hint: «Ответь дружелюбно что счёт будет готов сегодня».
4. **Default** — runAgent с tool use.
5. Включить **🔁 Через AI Bridge** (v1.2.3) — Ollama + резерв.
6. Сохранить → теперь когда клиент пишет матчинг — программа автоматически отвечает.
7. История в **AI Activity Dashboard** (категория «AI авто»).

---

## ⚙️ Структуры данных (для разработчиков)

### `AiBridgeQuestion`
```ts
{
  version: 1,
  text: string,
  source: { messengerId, accountId?, chatId?, messageId? },
  history?: Array<{role: 'user'|'assistant', text: string}>,
  systemPrompt?: string,
  contextMode?: 'none'|'last'|'full',
  timeoutMs?: number,
  signal?: AbortSignal,
}
```

### `AiBridgeAnswer`
```ts
{
  version: 1,
  ok: boolean,
  text: string,
  providerId: 'anthropic'|'openai'|'deepseek'|'gigachat'|'local',
  mode: 'api'|'webui'|'local',
  latencyMs: number,
  model?: string,
  error?: { code, message, detail?, retryable? },
  debug?: { attemptedFallbacks?, successfulStepIndex?, exhausted? },
}
```

### `settings.aiBridgeSelectors` (v1.1.17)
```js
{
  openai:    { input: '#new', submitButton: '.new-btn' },  // частично
  deepseek:  { ... },
  // пустой = используются defaults из hook
}
```

### `rule.action` (v1.2.3)
```js
{
  type: 'ai_reply',
  aiPromptHint: 'Подсказка',
  useBridge: true,             // v1.2.3 — через Bridge вместо tool use
  bridgeChain: [...],          // опц — явная chain
  bridgeMode: 'local',         // опц — иначе default 'local'
}
```

---

## 🔒 Безопасность

| Что | Как |
|---|---|
| API ключи | Только в main (из `settings.aiProviderKeys`), никогда в renderer |
| Preload AI | sandboxed isolated world |
| Hook | main world сайта — доступ к DOM, но НЕ к Electron API |
| Webview AI | partition `persist:ai-webview` — изолирован от мессенджеров |
| Custom селекторы | Обычные CSS строки в `document.querySelector` (без eval/innerHTML) |
| Логи | Через `app:log` → `chatcenter.log`. Никаких console.* в renderer (страж test) |
| Tool use в Bridge | НЕ задействован — никаких автоматических действий AI без подтверждения |

---

## 📊 Покрытие тестами (~310 unit-тестов всего по AI Bridge)

| Модуль | Тесты |
|---|---|
| contracts.js | smoke + 22 webviewConfigs |
| router.js | 8 |
| localBridge.js | 17 |
| apiBridge.js | 28 |
| webUiBridge.js | 16 |
| fallbackChain.js | 14 |
| buildAutoChain.js | 15 |
| agentBridgeRunner.js | 6 |
| aiBridgeIpcHandlers.js | 25 |
| aiBridge/index.js | 8 |
| useAiWebviewBridge.js | 9 |
| useAIAgent.js | 13 (включая 6 Bridge) |
| 4 hooks (sanity) | 30 |
| AiBridgeCheck.jsx | 16 |
| AiSelectorsEditor.jsx | 11 |
| autoReplyDispatcher.js Bridge ветка | 10 |

---

## 🔜 Что НЕ входит в v1.2.3 (отложено)

- **Native API не-Telegram мессенджеров** (WhatsApp/VK/Viber/MAX) — это уровень v2.0.
- **UI выпадающий список моделей** для каждого провайдера (сейчас руками вписывать).
- **Streaming AI в карточке агента** в реальном времени (сейчас один блок).
- **Per-rule analytics графики** в AIActivityDashboard.
- **Импорт/экспорт правил** в JSON для бэкапа.

---

## 📚 Документы

- [`ai-bridge.md`](../ai-bridge.md) — основная техническая документация (контракты, IPC, ошибки)
- [`phase-ai-bridge-plan.md`](./phase-ai-bridge-plan.md) — исходный план 11 этапов
- [`progress-v1.1.7-v1.1.13.md`](./progress-v1.1.7-v1.1.13.md) — снапшот после Этапа 6
- [`progress-v1.1.7-v1.1.10.md`](./progress-v1.1.7-v1.1.10.md) — снапшот после Этапа 2
- Этот файл — **финальный** снапшот v1.2.3
- `archive/features-v1.1.16-1.1.18.md` — детали Этапов 7-9
- `archive/features-v1.2.1-1.2.2.md` — детали закрытий отложенного
