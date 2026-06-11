# Архив v1.2.1 – v1.2.2 (закрытие отложенных из v1.2.0)

Заархивировано 11 июня 2026 при выпуске v1.2.3 для соблюдения лимита 100 КБ на features.md.
Единая документация AI Bridge: `.memory-bank/ai-bridge.md`.


### v1.2.2 — AI Agent через Bridge (закрытие отложенного из v1.2.0)

**Зачем**: до v1.2.2 кнопка «🤖 AI» в уведомлении (AI Agent) умела работать только через прямой API с платным ключом. Не было доступа к локальному Ollama, не было общего резерва с AI Bridge.

**Что готово**:

- [`src/hooks/useAIAgent.js`](src/hooks/useAIAgent.js) расширен:
  - Новые параметры в `start()`: `useBridge: boolean` + `settings: object`.
  - Когда `useBridge=true` — вместо IPC `ai:agent:run` (tool use агент) вызывается IPC `ai-bridge:send` с auto-резерв chain через [`buildAutoChain`](src/utils/aiBridge/buildAutoChain.js).
  - Внутренняя функция `runViaBridge(params, requestId, setState)` собирает question (text из последнего incoming сообщения + history из остальных) → отправляет в Bridge → возвращает {ok, text, debug?}.
  - Два streaming-step генерируются:
    1. `{type: 'bridge_start', chainSize, primary}` — начало
    2. `{type: 'tool_result', name: 'bridge_answer', result: {ok, providerId, mode, latencyMs, attemptedFallbacks}}` — после ответа
  - System prompt: «Ты помощник менеджера. Сформулируй короткий вежливый ответ клиенту.»

- [`src/components/AISidebarAgent.jsx`](src/components/AISidebarAgent.jsx) — UI:
  - Чекбокс «🔁 Через Bridge (с резервом, без tool use)» в верхней части карточки агента.
  - Default из `settings.aiAgentUseBridge` (когда-то юзер включил — запомнено).
  - disabled во время `isRunning`.
  - При переключении агент перезапускается с новым режимом (через useEffect dependency).
  - `StepRow` понимает новые типы шагов:
    - `bridge_start` → «🔁 Через Bridge (резерв 3 пров., начинаем с anthropic)»
    - `tool_result name='bridge_answer'`:
      - С fallback → «Через резерв: anthropic(rate_limited) → openai»
      - Успех без fallback → «Bridge ответил (anthropic, 50мс)»

- [`src/components/AISidebar.jsx`](src/components/AISidebar.jsx) — пробрасывает `settings` в `AISidebarAgent` (раньше не передавал).

### Что юзер видит

1. Получает уведомление о новом сообщении в чате.
2. Нажимает «🤖 AI» в уведомлении → открывается боковая панель AI с карточкой агента.
3. В карточке — чекбокс «🔁 Через Bridge (с резервом, без tool use)».
4. Если включит:
   - Программа использует AI Bridge с auto-chain (Anthropic → OpenAI → DeepSeek → ГигаЧат → Ollama).
   - Без умных действий (поиск/пометка прочитанным/jump). Только текст-ответ.
   - Если основной AI упал → автоматический резерв.
5. Видит шаги:
   - `🔁 Через Bridge (резерв 5 пров., начинаем с anthropic)`
   - Если fallback: `✓ Через резерв: anthropic(rate_limited) → openai`
   - Финальный ответ AI.

### Когда использовать какой режим

| Режим | Когда | Что умеет | Стоит ли деньги |
|---|---|---|---|
| **Обычный (default)** | Нужны умные действия: «помечай прочитанным», «найди похожие сообщения» | tool use — AI сам действует | ✅ API ключ нужен |
| **🔁 Через Bridge** | Нужен ответ + резерв на случай падения провайдера | Только Q&A текст-ответ | Опционально (можно Ollama бесплатно) |

### Цепочка fallback при Bridge mode

`buildAutoChain` собирает (см. v1.2.1):
1. **Primary** — provider из настроек (anthropic/openai/deepseek/gigachat)
2. **API провайдеры с ключами** — все из `settings.aiProviderKeys` где есть `apiKey`/`clientSecret`
3. **Ollama** — всегда в конце с URL из `settings.aiOllamaBaseUrl`

### Тесты (+6)

[`src/hooks/useAIAgent.vitest.jsx`](src/hooks/useAIAgent.vitest.jsx):
- `useBridge=true → не вызывает ai:agent:run, вызывает ai-bridge:send` — провайдер первым в chain.
- `text вопроса берётся из последнего incoming сообщения`.
- `history собирается из recentMessages (без последнего)` — порядок user/assistant.
- `streaming шаги: bridge_start + tool_result bridge_answer` — с правильными полями.
- `ошибка → finalAnswer=null + error в state`.
- `invoke throws → error в state`.

### Регрессия
lint 0, vitest 1773 → 1779 ✅ (+6), fileSizeLimits 446/446 ✅, check-memory ✅.

### Безопасность
- Bridge-режим использует тот же IPC канал `ai-bridge:send` что и UI «🤖 Проверка AI» — API ключи только в main.
- Tool use НЕ задействован в Bridge-режиме — никаких «AI пометил прочитанным» без подтверждения.
- Юзер сам решает что делать с ответом (копировать, отправить как есть, поправить).

### Rollback
`git revert <commit>` — `useBridge` опциональный (default false → старое поведение через ai:agent:run).

---

### v1.2.1 — UI «авто-резерв» (закрытие отложенного пункта v1.2.0)

**Контекст**: в v1.2.0 fallback chain работал, но только программно через IPC `payload.chain[]`. В UI «🤖 Проверка AI» галочки не было — этот пункт был обозначен как «не входит в v1.2.0». Закрываем gap.

**Что готово**:

- [`src/utils/aiBridge/buildAutoChain.js`](src/utils/aiBridge/buildAutoChain.js) (~55 стр.) — pure helper:
  - `buildAutoChain(settings, primary)` → массив `[primary, ...rest]`.
  - **Первый** — текущий выбор юзера (mode + providerId + config).
  - **Затем** — все API провайдеры (anthropic/openai/deepseek/gigachat) у которых есть ключ (`apiKey` для первых трёх, `clientSecret` для gigachat).
  - **В конце** — Ollama local с `settings.aiOllamaBaseUrl` (default `http://127.0.0.1:11434`).
  - Дедупликация по `mode:providerId` ключу (primary не дублируется).

- [`src/components/AiBridgeCheck.jsx`](src/components/AiBridgeCheck.jsx) — добавлен:
  - Чекбокс «🔁 Использовать авто-резерв» рядом с textarea вопроса.
  - При включении — `payload.chain = buildAutoChain(settings, {mode, providerId, config})` вместо `payload.mode`.
  - В карточке ответа при наличии `answer.debug.attemptedFallbacks` — жёлтая строка:
    ```
    🔁 Авто-резерв сработал. Опробовано до успеха:
       api:anthropic (rate_limited) → api:openai (server_error) → api:deepseek
    ```
  - В карточке ошибки при наличии `error._debug.attemptedFallbacks` — жёлтая строка:
    ```
    🔁 Все варианты опробованы: api:anthropic (rate_limited), api:openai (server_error)
    ```

### Как работает (юзер сценарий)

1. Юзер настроил 3 провайдера: Anthropic + OpenAI + DeepSeek (есть API ключи).
2. Откройте 🤖 «Проверка AI» в боковой панели.
3. Выберите режим «API провайдер» + Anthropic.
4. **Включите галочку «🔁 Использовать авто-резерв»**.
5. Введите вопрос → «📤 Спросить».
6. Программа собирает chain: `[anthropic → openai → deepseek → local]`.
7. Если Anthropic вернул 429 → автоматически пробует OpenAI → ответ.
8. В зелёной карточке: ответ от OpenAI + жёлтая строка «🔁 Авто-резерв сработал: anthropic (rate_limited) → openai».
9. Все этапы в стандартном лог-вьюере «📒 Логи ChatCenter».

### Что собирается в chain

| Провайдер | Условие добавления |
|---|---|
| anthropic / openai / deepseek | `settings.aiProviderKeys[id].apiKey` непустой |
| gigachat | `settings.aiProviderKeys.gigachat.clientSecret` непустой (apiKey не обязателен) |
| local Ollama | Всегда (с URL из `settings.aiOllamaBaseUrl` или default) |
| webui | Только если primary = webui (вручную не добавляется) |

### Тесты (+20)
- `buildAutoChain.vitest.js` (15): без primary → [] / primary без mode → [] / primary mode=api/local/webui первым / провайдер с/без apiKey / gigachat clientSecret / primary не дублируется / local в конце / custom Ollama URL / local не дублируется если primary=local / порядок primary первым + local последний / полный сценарий с 3 провайдерами → 4 шага.
- `AiBridgeCheck.vitest.jsx` (+5): чекбокс виден / включён → payload.chain без mode / выключен → payload.mode без chain / ответ с attemptedFallbacks → «Авто-резерв сработал» / ошибка с attemptedFallbacks → «Все варианты опробованы».

### Регрессия
lint 0, vitest 1753 → 1773 ✅ (+20), fileSizeLimits 446/446 ✅, check-memory ✅.

### Безопасность
- chain строится в renderer из settings — без API ключей (передаются только providerId).
- API ключи всё равно резолвятся в main (как в single mode).
- Custom селекторы из settings.aiBridgeSelectors не передаются автоматически в авто-резерв — только при mode=webui вручную.

### Rollback
`git revert <commit>` — buildAutoChain.js новый файл, чекбокс опциональный (default off → старое поведение).

---

