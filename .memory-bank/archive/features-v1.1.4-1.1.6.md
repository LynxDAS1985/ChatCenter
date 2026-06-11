# Архив v1.1.4 – v1.1.6

Заархивировано 11 июня 2026 при выпуске v1.1.12. Эти версии стабильны и не возвращаются.

---

### v1.1.6 — Fix: ai-webview логи через app:log + страж от console.* в renderer

В v1.1.5 я (агент) **ошибся**: логи `[ai-webview]` шли через `console.log/warn/error` → попадали ТОЛЬКО в DevTools. У проекта свой UI лог-вьюер «📒 Логи ChatCenter» который читает файл `chatcenter.log` через IPC канал `app:log`. Юзер этих логов в нативном UI **не видел**.

**Исправлено в 3 файлах**:
- `src/utils/aiWebviewDiagnostics.js` — `console.log/warn/error` → `window.api?.send?.('app:log', {level, message})`
- `src/utils/aiWebviewContext.js` — `console.error/log` → app:log
- `src/components/AISidebar.jsx` — `console.warn` → app:log

**Тесты переделаны** (`aiWebviewDiagnostics.vitest.js`): mock `window.api.send` вместо `console.*` spy. +1 регресс-тест «ни одного console.* не вызвано». 15 тестов всего.

**Страж от повторения** — новый `src/__tests__/rendererConsoleGuard.test.cjs`:
- Сканирует все `src/**/*.{js,jsx}` (без тестов).
- BASELINE: счётчик `console.*` на каждый legacy-файл на момент v1.1.6 (18 файлов).
- Падает если **новый** файл вне baseline содержит `console.*`.
- Падает если файл в baseline увеличил счётчик (анти-регрессия).
- Уменьшение OK (постепенный рефакторинг).
- Подключён в pre-commit + pre-push.

**Правило в CLAUDE.md** (Критические запреты #9): «🚫 НИКАКИХ console.log/warn/error в renderer для новых логов». Правильный паттерн с примером.

Регрессия: lint 0, vitest 1473/1473 ✅ (+3 от v1.1.5), rendererConsoleGuard ✅.

---

### v1.1.5 — Диагностика «Веб-интерфейс DeepSeek/ГигаЧат» + закрытие скролл-саги

Новый `src/utils/aiWebviewDiagnostics.js`: `attachAiWebviewDiagnostics(wv, provider, url)` подписывается на 11 событий webview (did-fail-load, **console-message** (видны CSP сайта), did-navigate, render-process-gone, ...). Префикс `[ai-webview]`. Idempotent.

`AISidebar.jsx`: useEffect привязывает диагностику при `providerMode==='webview' && webviewUrl`. RAF защита от пустого ref. Cleanup при unmount.

`aiWebviewContext.js`: extended injection script возвращает diag (matched/dom counts) + лог `[inject-result]`.

+12 тестов. Всего 1470 ✅. Лимит renderer 26200 → 26400.

**Скролл-сага CLOSED** (юзер: «забудь, пометь как решена»): 3 файла → `archive/*-CLOSED.md`. CLAUDE.md ссылки обновлены — `✅ CLOSED, НЕ ОТКРЫВАТЬ`.

---

### v1.1.4 — ГигаЧат tool use (4-й полноправный провайдер)

OAuth + SSL bypass были готовы (`main/utils/gigachat.js` с v0.87.81), адаптер с v0.97.0, UI с полями clientId+clientSecret — НЕ подключено только к новому tool-use каркасу. Подключено.

`main/ai/aiProviderCaller.js`: новая `callGigaChat({storage,messages,tools,model})` использует existing `getGigaChatToken` + `httpsPostSkipSsl`. Body: `functions`+`function_call:'auto'` (старый OpenAI формат). System извлекается. Trim() от пробелов. Понятные ошибки.

`main/main.js`: FALLBACK_ORDER += 'gigachat'. Проверка creds: для gigachat — apiKey+clientSecret.

+11 тестов с vi.hoisted mocks. Всего 1458 ✅. Полная документация: `ai-agent-plan/phases/phase-gigachat-tool-use-impl.md`.
