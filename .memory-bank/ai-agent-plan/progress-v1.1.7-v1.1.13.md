# Прогресс AI Bridge v1.2.0 — этапы 0-6 закрыты

> Полная фиксация: **что сделали**, **почему**, **как должно работать**.
> Сессия 11 июня 2026. Покрыто 7 версий, 6 этапов AI Bridge + 1 разбиение.
> Связано с [phase-ai-bridge-plan.md](./phase-ai-bridge-plan.md) (план 11 этапов).

---

## 📊 Сводная таблица релизов

| Версия | Этап | Что сделано | Тестов | Commit |
|---|---|---|---|---|
| **v1.1.7** | 0 (pre-req) | Fix переключения режимов AI — баг `set()` v1.1.5 | +17 | `d67a2df` |
| **v1.1.8** | 1 | Контракты + папки + типы (`contracts.js` + `aiWebviewConfigs.js` + router skeleton) | +30 | `6d86a3a` |
| **v1.1.9** | — | Разбиение топ-5 больших файлов (помимо плана, юзер просил) | +63 | `e2b899b` |
| **v1.1.10** | 2 | Local Bridge (Ollama HTTP) | +37 | `b9c94db` |
| **v1.1.11** | 3 | API Bridge (обёртка aiProviderCaller для 4 провайдеров) | +33 | `7a11647` |
| **v1.1.12** | 4 | WebUI Bridge skeleton (preload + bridge на main + IPC) | +19 | `b1f9433` |
| **v1.1.13** | 5+6 | 4 hook файла (chat.openai.com / chat.deepseek.com / claude.ai / giga.chat) | +30 | `1c094bd` |

**Итого**: 1490 → 1697 тестов (+229 за сессию, ~98% по AI Bridge).

---

## 🌉 Архитектура AI Bridge — что работает после 6 этапов

```
┌─────────────────────────────────────────────────────────────────┐
│  RENDERER (UI)                                                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ sendQuestion({mode, question, config})                  │    │
│  │   ↳ src/utils/aiBridge/index.js                         │    │
│  └─────────────────┬───────────────────────────────────────┘    │
└────────────────────┼────────────────────────────────────────────┘
                     │ IPC ai-bridge:send
┌────────────────────▼────────────────────────────────────────────┐
│  MAIN PROCESS                                                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  registerAiBridgeIpcHandlers (handleSend)                │   │
│  │  ↳ main/handlers/aiBridgeIpcHandlers.js                  │   │
│  └─────┬────────────────┬────────────────────┬──────────────┘   │
│        │ mode=local     │ mode=api           │ mode=webui       │
│   ┌────▼────────┐  ┌────▼────────┐  ┌────────▼────────────┐    │
│   │ createLocal │  │ createApi   │  │ createWebUi         │    │
│   │ Bridge      │  │ Bridge      │  │ Bridge              │    │
│   │ (Ollama)    │  │ (через      │  │ (через webContents) │    │
│   └────┬────────┘  │  callProvider)│ └────────┬───────────┘    │
│        │           └────┬────────┘           │                   │
│        │                │                    │ webContents.send  │
│        │ fetch          │ fetch              │ 'ai-bridge:webui:inject'
└────────┼────────────────┼────────────────────┼──────────────────┘
         │                │                    │
         ▼                ▼                    ▼
   ┌──────────┐    ┌──────────────┐    ┌─────────────────────┐
   │ Ollama   │    │ OpenAI /     │    │ ai-monitor.preload  │
   │ localhost│    │ Anthropic /  │    │ в webview AI сайта  │
   │ :11434   │    │ DeepSeek /   │    │                     │
   └──────────┘    │ GigaChat API │    │ <script> + hook.js  │
                   └──────────────┘    │ + window.__ccAiBridge│
                                       │                     │
                                       │ DOM injection →     │
                                       │ wait MutationObs →  │
                                       │ postMessage answer  │
                                       └─────────────────────┘
```

### Что готово
- ✅ **3 bridges** (local / api / webui) с одним интерфейсом `ask(question) → AiBridgeAnswer`
- ✅ **Единый IPC канал** `ai-bridge:send` (renderer ↔ main)
- ✅ **4 hook файла** для DOM injection в chat.openai.com / chat.deepseek.com / claude.ai / giga.chat
- ✅ **Унифицированный errror handling** (AiBridgeErrorCode: 11 кодов с retryable flag)
- ✅ **AbortSignal проброс** во все 3 bridges
- ✅ **Timeout management** (Local 60с / API 60с / WebUI 90с)
- ✅ **Custom selectors** override для DOM injection (Этап 8 даст UI)
- ✅ **+229 unit-тестов** (~98% покрытие новых модулей)

### Что НЕ готово (Этапы 7-11, ожидают)
- ⏳ **Этап 7**: UI AIBridgePanel в AISidebar — кнопка «Спросить» + `<webview>` тег с aiMonitorPreload + интеграция с registerWebview.
- ⏳ **Этап 8**: Selectors Config UI — настройка кастомных селекторов на случай если сайты меняются.
- ⏳ **Этап 9**: Fallback chain — если основной bridge упал (retryable=true), автоматически пробует резерв.
- ⏳ **Этап 10**: Документация — обновление CLAUDE.md / .memory-bank / changelog / README.
- ⏳ **Этап 11**: Release v1.2.0 — финальный bump + проверка end-to-end + создание installer.

### Что юзер может делать ПРЯМО СЕЙЧАС (с v1.1.14 — без инструментов разработчика)

Открыть «📒 Логи ChatCenter» → нажать «🧪 Тест AI Bridge». Появится окно с:
- выбором режима (Локальный / API / Веб-интерфейс)
- выбором провайдера (для API/WebUI)
- полями URL / Модель (опционально)
- текстовым полем для вопроса
- кнопкой «📤 Спросить»

Все логи попадают в основной лог-вьюер (через `app:log`). Никаких «инструментов разработчика» открывать не нужно.

**Local mode** — требует Ollama: `ollama serve` + `ollama pull llama3.1`.
**API mode** — API ключи берутся из `settings.aiProviderKeys[providerId].apiKey` (тех что юзер уже ввёл для AI Agent).
**WebUI mode** — пока возвращает `config_invalid` (webview не открыт). Заработает в Этапе 7 после интеграции с AISidebar.

---

## 📁 Структура новых файлов

```
src/
├─ utils/
│  ├─ aiBridge/
│  │  ├─ contracts.js          ← JSDoc типы (v1.1.8)
│  │  └─ index.js               ← renderer wrapper sendQuestion (v1.1.10)
│  └─ aiWebviewConfigs.js       ← 4 провайдера + detectAiProvider (v1.1.8)

main/
├─ ai/
│  └─ bridge/
│     ├─ router.js              ← createAiBridgeRouter (v1.1.8)
│     ├─ localBridge.js         ← Ollama HTTP (v1.1.10)
│     ├─ apiBridge.js           ← aiProviderCaller обёртка (v1.1.11)
│     └─ webUiBridge.js         ← через webContents + IPC (v1.1.12)
├─ handlers/
│  └─ aiBridgeIpcHandlers.js    ← IPC ai-bridge:send + webui:* (v1.1.10-12)
└─ preloads/
   ├─ ai-monitor.preload.cjs    ← skeleton для AI webview (v1.1.12)
   └─ hooks/
      └─ ai/
         ├─ .hookTemplate.js    ← документация-шаблон (v1.1.12)
         ├─ openai.hook.js      ← chat.openai.com / chatgpt.com (v1.1.13)
         ├─ deepseek.hook.js    ← chat.deepseek.com (v1.1.13)
         ├─ anthropic.hook.js   ← claude.ai (v1.1.13)
         └─ gigachat.hook.js    ← giga.chat (v1.1.13)
```

---

## ⚠️ Известные ограничения и риски (после Этапа 6)

1. **WebUI селекторы**: AI сайты меняют DOM ~раз в 3-4 месяца. После Этапа 8 (Selectors Config UI) юзер сможет настраивать руками.
2. **GigaChat selectors** — приблизительные (Сбер использует Angular, документации мало). Точно нужна ручная настройка.
3. **DeepSeek** в РФ частично блокирован — может потребоваться VPN.
4. **Claude contenteditable** — требует особого `InputEvent` для React state. Если Anthropic поменяет — будем настраивать.
5. **OpenAI меняет data-testid** — самый стабильный провайдер по DOM, но и у него бывали breaking changes.
6. **WebUI mode не fallback'нится автоматически** в API — это будет в Этапе 9.

---

## 🔜 План на следующую сессию (Этапы 7-11)

### Этап 7: UI AIBridgePanel + интеграция с AISidebar (~4 ч)

**Делать**:
- `src/components/AIBridgePanel.jsx` (~200 строк) — кнопка «Спросить» + поле ввода + отображение ответа
- Расширить `AISidebar.jsx`:
  - `<webview>` тег с `preload={aiMonitorPreload}` (получать путь из app:get-paths)
  - useEffect для `registerWebview(providerId, webview.getWebContents())` при mount
  - При unmount → unregisterWebview
- `useAiBridge.js` hook — обёртка над sendQuestion с loading/error state

**Тесты**: UI рендеринг, кнопка disabled при loading, отображение ошибок.

### Этап 8: Selectors Config UI (~3 ч)
- `src/components/AiSelectorsConfig.jsx` — форма для 4 селекторов на провайдер
- Сохранять в `settings.aiBridgeSelectors[providerId]`
- Передавать через `config.customSelectors` в sendQuestion → handleInject

### Этап 9: Fallback chain (~2 ч)
- Если `AiBridgeAnswer.error.retryable === true` → пробовать следующий bridge из chain
- Chain: `[{mode:'api', providerId:'anthropic'}, {mode:'api', providerId:'openai'}, {mode:'local'}, ...]`
- Юзер настраивает порядок в UI (или auto: основной + все с ключами)

### Этап 10: Документация (~2 ч)
- Обновить `CLAUDE.md` (раздел AI Bridge)
- Создать `.memory-bank/ai-bridge.md` — полная документация
- Финализировать changelogData entries

### Этап 11: Release v1.2.0 (~0.5 ч)
- Бамп версии 1.1.13 → 1.2.0
- Создать tag + GitHub release
- Скриншоты + видео для README
