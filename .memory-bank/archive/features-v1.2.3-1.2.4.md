# Архив v1.2.3 – v1.2.4 (Auto-reply через Bridge + Финал AI Bridge)

Заархивировано 11 июня 2026 при выпуске v1.2.5. Подробная документация AI Bridge: `.memory-bank/ai-bridge.md` + `.memory-bank/ai-agent-plan/progress-final-v1.2.3.md`.


### v1.2.4 — Финал AI Bridge: полная фиксация (документация)

**Контекст**: за сессию 11 июня 2026 сделано **17 релизов** AI Bridge (v1.1.7 → v1.2.3). v1.2.4 — фиксация всего в единый итоговый документ + бамп версии для трекинга.

**Что готово**:
- 📘 [`.memory-bank/ai-agent-plan/progress-final-v1.2.3.md`](.memory-bank/ai-agent-plan/progress-final-v1.2.3.md) — полная карта:
  - Хронология всех 17 релизов с commit hash и количеством тестов
  - ASCII-диаграмма архитектуры «три входа + единый IPC + три bridges + 4 hook»
  - Полная цепочка fallback (что считается retryable, что — стоп)
  - 7 групп компонентов с файлами (инфраструктура / bridges / IPC / UI / hooks / fallback / auto-reply)
  - 3 сценария использования юзером (Проверка / Agent / Авто-ответы)
  - Структуры данных AiBridgeQuestion / AiBridgeAnswer / settings.aiBridgeSelectors / rule.action
  - Безопасность по 7 пунктам
  - ~310 unit-тестов по модулям
  - Что отложено (Native API не-Telegram, dropdown моделей, streaming, графики, import/export)
  - Ссылки на все docs

**Состояние AI Bridge на v1.2.4** (всё работает):

| Что | Где | Версия |
|---|---|---|
| 🤖 Проверка AI вручную | Шапка AISidebar | v1.1.15 |
| 🔁 Авто-резерв (UI) | Чекбокс в Проверке AI | v1.2.1 |
| 🔧 Кастомные селекторы | Модалка из Проверки AI | v1.1.17 |
| 🤖 AI Agent из уведомления | Кнопка «🤖 AI» | v0.99.0 |
| 🔁 Agent через Bridge | Чекбокс в карточке агента | v1.2.2 |
| 🤖 Авто-ответы | Правила Phase 4.3 | v1.1.0-1.1.3 |
| 🔁 Авто-ответ через Bridge | Чекбокс в правиле | v1.2.3 |
| Local AI (Ollama) | mode='local' | v1.1.10 |
| API 4 провайдеров | mode='api' | v1.1.11 |
| WebUI 4 сайтов | mode='webui' | v1.1.12-1.1.13 |
| Webview ↔ Bridge | useAiWebviewBridge | v1.1.16 |
| Fallback chain (программно) | payload.chain | v1.1.18 |
| Fallback chain (UI) | Чекбокс «🔁 авто-резерв» | v1.2.1 |

**Покрытие тестами**: 1490 → 1795 (+305 за сессию, ~310 unit-тестов покрытия AI Bridge).

**Что осталось вне AI Bridge** (роадмап на потом):
- Native API WhatsApp/VK/Viber/MAX — большая работа, требует API доступа от мессенджеров
- Мелкие UX-улучшения: dropdown моделей, streaming в карточке агента, графики авто-ответов, импорт/экспорт правил

### Регрессия v1.2.4
lint 0, vitest 1795/1795 ✅, fileSizeLimits 453/453 ✅, check-memory ✅.

---

### v1.2.3 — Авто-ответы через Bridge (бесплатный Ollama + общий резерв)

**Зачем**: до v1.2.3 правила автоответа (Phase 4.3) ходили к AI **только через прямой API** с платным ключом. Теперь юзер может включить через AI Bridge — с auto-резервом и поддержкой бесплатного Ollama.

**Что готово**:

- [`main/ai/autoReplyDispatcher.js`](main/ai/autoReplyDispatcher.js) расширен:
  - Новая ветка `if (rule.action.useBridge === true)` → `dispatchAiReplyViaBridge(...)`.
  - Иначе (`useBridge=false` или нет) — старый путь через `deps.runAgent` (tool use). Совместимость полная.
  - `dispatchAiReplyViaBridge`:
    1. Собирает question: `text` = msg.text, `source` = chatId/messageId/etc, `systemPrompt` с hint от юзера.
    2. Опционально подмешивает `history` через `deps.getRecentMessages({chatId, limit: 10})`.
    3. Bridge payload: либо `chain: rule.action.bridgeChain[]` (если задан), либо `mode: rule.action.bridgeMode || 'local'`.
    4. Вызывает `deps.bridgeSend(payload)` → AiBridgeAnswer.
    5. Если `ok=true && text` → `deps.handlerContext.sendMessage({chatId, text, replyToMessageId})` — отправка через TDLib.
    6. Audit запись с `actionId: 'ai_reply_bridge_summary'` + output (bridgeProviderId / mode / latencyMs / attemptedFallbacks / sentMessageId).

- [`main/main.js`](main/main.js) — `initAutoReplyDispatcher` подключает новые deps:
  - `bridgeSend: async (payload) => handleSend(payload, {callProvider: callProviderFn})` через dynamic import — main-side обёртка над тем же IPC handler что и UI «🤖 Проверка AI».
  - `getRecentMessages: async ({chatId, limit}) => adapter.getMessages({...})` — для контекста.
  - `handlerContext.sendMessage: adapter.sendMessage` (раньше был только markAsRead) — отправка через TDLib.

- [`src/components/AIAutoReplyRules.jsx`](src/components/AIAutoReplyRules.jsx) — UI в форме правила:
  - Чекбокс «🔁 Через AI Bridge (с резервом + Ollama)» под полем «Подсказка для AI».
  - Виден только при `actionType === 'ai_reply'`.
  - Title подсказывает: «Если основной упал — резерв. Работает с Ollama. Без умных действий (только текст)».
  - Сохраняется в `rule.action.useBridge` (только если true — иначе поле отсутствует для совместимости).

### Как работает (полный поток для юзера)

1. Юзер создаёт правило в AIAutoReplyRules → выбирает «🤖 AI отвечает» → пишет hint «Ответь дружелюбно» → **включает «🔁 Через AI Bridge»** → сохраняет.
2. Клиент пишет в чат → TDLib emit `message:new` → dispatcher.processNewMessage.
3. Master switch ok → rules найдены → matched → `useBridge=true` ветка.
4. Собирается question + history → `bridgeSend({mode:'local', question, ...})`.
5. main `handleSend` → `createLocalBridge` (Ollama) или fallback chain.
6. Ответ возвращается → `handlerContext.sendMessage` отправляет через TDLib как reply на исходное сообщение.
7. Audit пишет одну запись с полным контекстом (для AIActivityDashboard).

### Сравнение режимов

| | Старый (default) | Через Bridge (v1.2.3) |
|---|---|---|
| AI делает | tool use (поиск, пометка, ответ) | Только текст-ответ |
| Провайдеры | API ключи 4 провайдеров | + Ollama (бесплатно) + общий резерв |
| Резерв | v1.1.3 multi-provider (для API only) | Полный chain через Bridge |
| Отправка | AI вызывает `reply_to_message` tool | Dispatcher напрямую через `sendMessage` |
| Audit | `ai_reply_summary` + per-tool | `ai_reply_bridge_summary` (одна запись) |

### Когда какой выбрать

- **Без Bridge (default)**: нужна сложная логика — AI сам смотрит историю, ищет похожие, помечает прочитанным.
- **С Bridge**: нужен просто текст-ответ + хочется бесплатно (Ollama) или защита от падений (резерв).

### Тесты (+10)
[`main/ai/autoReplyDispatcher.vitest.js`](main/ai/autoReplyDispatcher.vitest.js):
- `useBridge=true → bridgeSend вызван (НЕ runAgent)`.
- `bridgeSend получает question с text + source + systemPrompt с hint`.
- `rule.action.bridgeChain → используется payload.chain (fallback)`.
- `без bridgeChain → payload.mode=local по умолчанию`.
- `bridge ok=false → fired=0, error`.
- `sendMessage упал → fired=0`.
- `без bridgeSend в deps → reason=no_bridgeSend`.
- `без sendMessage → reason=no_sendMessage`.
- `audit пишется с правильными полями (bridgeProviderId, attemptedFallbacks)`.
- `rule.useBridge=false → старый путь runAgent (НЕ bridge)` — совместимость.

### Регрессия
lint 0, vitest 1785 → 1795 ✅ (+10), fileSizeLimits 452/452 ✅, check-memory ✅.

### Безопасность
- Каналы те же что и UI 🤖 Проверка AI (`ai-bridge:send` через handleSend).
- Tool use НЕ задействован → автоответ не может «случайно» удалить чат или переслать в другой.
- API ключи только в main.
- Отправка через TDLib — те же права что у юзера в Telegram.

### Rollback
`git revert <commit>` — `useBridge` опциональный (default false → старое поведение через runAgent). Старые правила без `useBridge` поля продолжают работать как раньше.

---

