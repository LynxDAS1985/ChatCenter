# Архив v1.1.0 – v1.1.3

Заархивировано 11 июня 2026 при выпуске v1.1.12. Phase 4.3 (AI auto-reply правила) — стабилен, доку реализации см. в `ai-agent-plan/phases/phase-4-3-auto-reply-impl.md`.

---

### v1.1.3 — Phase 4.3 hardening: smart cooldown + multi-provider fallback

**Smart cooldown** в `autoReplyDispatcher.js`: Map `_userRepliedAt: chatId → ts`, `markUserReplied()` срабатывает на `isOutgoing=true`. `canAutoReply` 4-я проверка — если юзер отвечал за 10 мин → skip. Защита от дубля когда AI 8 сек ждёт LLM а юзер сам ответил за 2 сек.

**Multi-provider fallback** (новый `aiProviderFallback.js`): `createCallProviderWithFallback`. Chain = active + остальные провайдеры с apiKey. `isFallbackWorthy(err)` различает network/5xx/429 (retry) vs HTTP 4xx (fail). main.js строит chain в порядке anthropic/openai/deepseek. Один провайдер → без накладных. Два+ → защита от outage.

+22 теста (5 cooldown + 17 fallback). Всего 1446 ✅. Лимиты dispatcher 300→380, .vitest.js 400→500.

---

### v1.1.2 — Phase 4.3 финал: реальный AI provider + master switch + audit + actor split

В v1.1.1 dispatcher работал, но `callProvider: null` → ai_reply падал. v1.1.2 — реальная AI отправка + 3 UX-фичи.

`main.js` dispatcher.runAgent читает `settings.aiProvider/aiModel` из storage на КАЖДЫЙ запрос (свежие настройки) и оборачивает callProviderFn. Master switch `settings.aiAutoReplyMasterEnabled` (default true) проверяется ПЕРВЫМ в processNewMessage до загрузки rules. UI master switch в AIAutoReplyRules.jsx — зелёная/красная панель + кнопка. Audit log: `appendAuditRecord` export (без IPC) — для mark_read 1 entry, для ai_reply per-tool + summary с iterations, все actor='ai_auto'+ruleId/ruleName. AIActivityDashboard: новая категория «AI авто» (#f97316), фильтр actor=ai_auto, actorColor/actorLabel helpers.

+7 тестов dispatcher (master + audit). Всего 1423 ✅. Лимит renderer 26000→26200.

---

### v1.1.1 — Phase 4.3 integration: dispatcher подключён к TDLib message:new

**`main/ai/autoReplyDispatcher.js`**: подписывается на `manager.on('message:new')`. Для каждого сообщения: `getCachedRules()` → `buildEngineMessage(payload)` → `findMatchingRules` → если match: `mark_read` напрямую через `context.markAsRead` либо `ai_reply` через `runAgent({actor:'ai_auto', autoConfirm:true, initialMessages: prompt+hint})` → `markRuleMatched(rule.id)`.

3 уровня защиты от петель:
- `excludeOutgoing` в engine (default true) + ранний exit в dispatcher до загрузки rules.
- `cooldownMinutes` на rule level.
- Loop protection в dispatcher: 30 сек между ai_reply для того же chatId + global rate limit 10 в минуту.

**Executor расширен** (`main/ai/aiToolExecutor.js`): `actor` + `autoConfirm` параметры. Когда `actor='ai_auto' && autoConfirm=true` — confirm-required tools выполняются без UI модалки. HARDCODED_DENY всё равно блокирует. В audit: `actor: 'ai_auto'` + `permissionResult: 'auto_confirmed'`.

**main.js**: `initAutoReplyDispatcher` после tdlibStartup. callProvider пока null (TODO v1.1.2 — вытащить из settings.ai).

**Тесты**: +24 dispatcher (canAutoReply rate limit, buildEngineMessage, processNewMessage flow с rules/cooldown/markRead/aiReply/error handling) + +5 executor autoConfirm = **29 новых**, всего **1416 ✅**.

**Лимиты**: aiToolExecutor.js exception 300 → 350, .vitest.js 650 → 800.

---

### v1.1.0 — Phase 4.3: AI auto-reply правила (foundation)

Структура правила: триггеры (chatIds/keywords any|all/schedule/excludeBots/Channels/Outgoing) + action (ai_reply|mark_read + aiPromptHint) + cooldownMinutes. autoReplyEngine — 4 pure functions: matchRule (8 проверок), checkKeywords, checkSchedule (с поддержкой через полночь), checkCooldown. AIAutoReplyRules UI с формой и переключателями дней недели. Иконка 🤖⚡ #8b5cf6 в шапке. +51 unit-теста.

**НЕ сделано** (deferred v1.1.1): integration `tg:new-message` → engine → runAgentLoop. Сейчас правила сохраняются и engine тестируется, но автоматически не срабатывают.

Регрессия: lint 0, vitest 1387 ✅, fileSizeLimits 401/401 ✅.
