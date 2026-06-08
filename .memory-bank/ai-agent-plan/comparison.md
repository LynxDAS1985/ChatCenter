# Сравнение с конкурентами

## Таблица сравнения

| Свойство | ChatCenter (план) | Slack AI | Teams Copilot | Cursor / Cline | Claude Desktop MCP |
|---|---|---|---|---|---|
| **Multi-provider** | ✅ 4+ (расширяемо) | ❌ Только Anthropic | ❌ Только OpenAI/Azure | ✅ Несколько | ❌ Только Anthropic |
| **Tool use stand** | ✅ JSON Schema | ✅ Proprietary | ✅ Graph API | ✅ JSON Schema | ✅ MCP |
| **WebView fallback** | ✅ **Уникально** | ❌ | ❌ | ❌ | ❌ |
| **Локальные ключи** | ✅ + encryption | ❌ Cloud | ❌ Cloud | ✅ | ✅ |
| **Permission tiers** | ✅ Auto/Confirm/Deny | ⚠️ Workspace level | ⚠️ Azure AD/RBAC | ✅ Per-action | ✅ Per-server |
| **Audit log** | ✅ С откатом | ✅ Logs | ✅ Compliance Center | ✅ Local | ⚠️ Базовый |
| **Source tracking** | ✅ NotificationSource | ✅ Built-in | ✅ Built-in | ⚠️ File paths | ✅ Server-defined |
| **Open standard** | ✅ JSON Schema | ❌ | ⚠️ Partial | ✅ | ✅ MCP |
| **Стоимость** | $0 локально + API | ❌ License $$$ + API | ❌ License $$$ + API | $0 + API | $0 + API |
| **Offline режим** | ✅ Ollama (Phase 4) | ❌ | ❌ | ⚠️ Local LLM | ❌ |
| **Custom tools** | ✅ Runtime registry | ❌ Только built-in | ⚠️ Plugins | ✅ MCP servers | ✅ MCP servers |

---

## Детальные обзоры

### Slack AI (Sales Elevate / Slack AI)

**Что умеет**:
- Сводки каналов, suggestions ответов, scheduling
- Только Anthropic Claude под капотом (custom prompts от Slack)
- Workspace-level permissions

**Сильные стороны**:
- Глубокая интеграция с Slack data
- Compliance ready (SOC 2, GDPR)
- Enterprise support

**Слабые стороны**:
- ❌ Lock-in в Slack
- ❌ Дорого ($$$)
- ❌ Нет multi-provider choice
- ❌ Cloud-only (не offline)
- ❌ Нет user-level permission control

**Pattern**: централизованный enterprise AI assistant.

---

### Microsoft Teams Copilot

**Что умеет**:
- Сводки meetings, suggestions, action items
- Graph API tools для tool use
- RBAC через Azure AD

**Сильные стороны**:
- Tightly integrated с Microsoft 365
- Enterprise-grade compliance
- Tool use через Graph API (JSON Schema)

**Слабые стороны**:
- ❌ Lock-in в M365
- ❌ Только OpenAI через Azure
- ❌ Очень дорого (per-user license)
- ❌ Cloud-only

**Pattern**: Graph API tools, Azure-hosted.

---

### Cursor / Cline (AI code editors)

**Что умеет**:
- File read/write, run command, search codebase
- Tool use через function calling (Anthropic/OpenAI)
- Per-action confirmation UI

**Сильные стороны**:
- Современный паттерн tool use
- Multi-provider (Cline)
- Local-first
- Open source (Cline)

**Слабые стороны**:
- Code-focused (не messaging)
- Нет глобальной audit
- Tool registry hardcoded

**Pattern**: **наиболее близкий нам** — JSON Schema tools, permission confirmations, local keys.

---

### Claude Desktop (MCP)

**Что умеет**:
- MCP (Model Context Protocol) — открытый стандарт
- Tools / Resources / Prompts через MCP servers
- Локальная архитектура

**Сильные стороны**:
- **Открытый стандарт MCP** — расширяемо through external servers
- Растущая экосистема MCP-серверов (filesystem, github, slack, и т.д.)
- Поддержка от Anthropic напрямую

**Слабые стороны**:
- ❌ Только Anthropic Claude
- ❌ Overhead запуска MCP server processes
- ❌ Сложность отладки multi-process
- ❌ Audit log базовый

**Pattern**: MCP стандарт — самый перспективный, но overhead для embedded apps как наш.

**Наша позиция**: **MCP-inspired** (свой реестр в стиле MCP), но без overhead отдельных processes.

---

## Почему наш план лучше для нашей задачи

### 1. Multi-provider — выбор юзера

| Кейс | Конкурент | ChatCenter |
|---|---|---|
| Юзер уже платит за ChatGPT Plus | Не использует подписку | ✅ WebView режим |
| Юзер хочет дёшево | Платит дорого Slack/Teams | ✅ DeepSeek $0.05/мес |
| Юзер хочет приватность | Cloud-only | ✅ Ollama локально |
| Юзер в России | Slack/Teams часто заблокированы | ✅ ГигаЧат |

### 2. WebView fallback — никто так не делает

Идея: даже без API ключа можно вставлять контекст в **сайт провайдера**
(chat.openai.com, claude.ai). Юзер использует свою подписку.

**Преимущества**:
- $0 стоимость если уже есть подписка
- Юзер не делится API ключом
- Работает с любым провайдером (даже без API)

**Недостатки**:
- Нет tool use в WebView (только ручная вставка контекста)
- Нет audit log из WebView

Решение: **WebView ↔ Tool use** работают **параллельно**. Юзер выбирает:
- API mode → полноценный агент с tool use
- WebView mode → только текстовый помощник (текущий функционал)

### 3. Локальные ключи + encryption

| Конкурент | Где ключи |
|---|---|
| Slack AI | Cloud (привязано к Slack workspace) |
| Teams Copilot | Cloud (Azure tenant) |
| Cursor | Локально (settings.json) |
| Claude Desktop | Локально (config) |
| **ChatCenter** | **Локально + electron-store encryption** |

Наша система:
- API keys в `electron-store` с `encryptionKey`
- Никогда не передаются в renderer
- Никогда не пишутся в audit log
- При удалении приложения — стираются

### 4. Audit log с undo

| Конкурент | Audit | Undo |
|---|---|---|
| Slack | ✅ Logs | ❌ |
| Teams Copilot | ✅ Compliance Center | ❌ |
| Cursor | ✅ Local log | ⚠️ Git revert |
| **ChatCenter** | ✅ JSON Lines local | ✅ **Undo last N AI actions** |

### 5. Custom tools — расширяемость

Все конкуренты — fixed список tools. У нас:

```js
// runtime registration
dispatcher.registerAction('translate_message', {
  schema: {...},
  permission: 'confirm',
  handler: async (source, args) => { ... }
})
```

Юзер может добавлять свои tools без перекомпиляции.

---

## Что у нас СЛАБЕЕ

### 1. Меньше готовых интеграций

Slack AI / Teams Copilot имеют интеграции с десятками других сервисов. У нас нет.

**План**: Phase 5+ — добавить MCP server support (расширения через open standard).

### 2. Нет enterprise SSO / SAML

Slack / Teams — enterprise-ready с SSO. У нас локальная авторизация.

**План**: пока out of scope. Если будут enterprise клиенты — добавим.

### 3. Меньше моделей для специализированных задач

Slack использует кастомные fine-tuned Claude варианты для своих задач.
У нас — generic модели.

**План**: можно подключить fine-tuned модели через провайдеров (Anthropic / OpenAI поддерживают).

### 4. Меньше пользователей → меньше battle-testing

У Slack/Teams миллионы пользователей. Мы маленькие.

**План**: фокус на качестве кода + extensive tests.

---

## Lessons learned от конкурентов

### От Slack: важность audit и compliance

Slack AI **обязательно** требует audit per action. Мы тоже это делаем (см. [permissions.md](./permissions.md)).

### От Teams: Graph API stable schema

Microsoft вкладывается в стабильность schema. Tool definitions редко меняются.

**Применяем**: JSON Schema 2020-12 versioned. Поля только добавляются, не удаляются.

### От Cursor/Cline: per-action confirmations

Перед write action — confirmation modal с полным контекстом.

**Применяем**: confirm tier для reply/task/etc.

### От MCP: open standard wins

MCP принят индустрией. Наш JSON Schema подход — MCP-compatible (легко мигрировать в будущем).

**Применяем**: structure tools by JSON Schema, не proprietary format.

---

## Заключение

**Наш план — гибридный подход**:
- **Современный** как Cursor/Claude Desktop (JSON Schema tools, permission tiers)
- **Гибкий** как multi-provider AI clients (4 провайдера + Ollama)
- **Уникальный** в WebView fallback (никто так не делает)
- **Безопасный** как enterprise (audit + permissions + undo)
- **Без lock-in** (локальные ключи, открытый стандарт)

**Стоимость нашего подхода**: 0 (всё локально + опциональные API costs).
**Стоимость Slack/Teams**: $$$ license + API per user.

**Для нашего use case (мессенджер-агрегатор)** — это **оптимальный путь**.

---

## Ссылки

- [overview.md](./overview.md) — план фаз
- [architecture.md](./architecture.md) — наша архитектура
- [permissions.md](./permissions.md) — безопасность
