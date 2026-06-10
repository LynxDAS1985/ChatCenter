# 🔌 AI Bridge — конкретные конфиги hook для каждого провайдера

> **Цель**: точные селекторы DOM и логика injection/extraction для **chat.openai.com / chat.deepseek.com / claude.ai / giga.chat**. Этот файл — справочник для написания `main/preloads/hooks/ai/*.hook.js`.

**Связан с**: [phase-ai-bridge-plan.md](./phase-ai-bridge-plan.md) (главный план).

---

## 📋 Оглавление

1. [Общий шаблон hook файла](#1-template)
2. [OpenAI / ChatGPT (chat.openai.com)](#2-openai)
3. [DeepSeek (chat.deepseek.com)](#3-deepseek)
4. [Claude (claude.ai)](#4-claude)
5. [ГигаЧат (giga.chat)](#5-gigachat)
6. [Будущие провайдеры — как добавить](#6-future)
7. [Verification — как проверить селекторы](#7-verify)

---

## 1. Общий шаблон hook файла {#1-template}

`main/preloads/hooks/ai/.hookTemplate.js`:

```js
// Шаблон hook файла для AI веб-сайтов
// Не загружается — копируется в openai.hook.js / deepseek.hook.js / etc.
// ВСЕ значения с пометкой 🔧 — настраиваются для конкретного сайта

;(function () {
  // ── 🔧 КОНФИГ КОНКРЕТНОГО САЙТА ──────────────────────────────────────
  const PROVIDER = '🔧 openai'
  const VERSION  = '🔧 v1' // версия конфига, обновлять при изменении сайта
  
  // Селекторы (могут быть переопределены через settings.customSelectors)
  let SELECTORS = {
    input:                '🔧 selector for textarea/contenteditable',
    submitButton:         '🔧 selector for send button',
    lastAssistantMessage: '🔧 selector for last AI response container',
    streamingIndicator:   '🔧 selector that EXISTS when AI typing',
  }

  // ── ОБЩИЕ КОНСТАНТЫ ────────────────────────────────────────────────
  const DEBOUNCE_MS = 800   // ждать тишину observer
  const COOLDOWN_MS = 3000  // минимум между ответами
  const INJECT_DELAY = 100  // задержка между set value и click submit
  
  // ── СОСТОЯНИЕ ──────────────────────────────────────────────────────
  let lastAnswerHash = null
  let lastSentTs = 0
  let observerTimer = null
  let observer = null
  let isInitialized = false

  // ── ПОЛУЧЕНИЕ CUSTOM SELECTORS ──────────────────────────────────────
  // Hook просит у preload (через ipcRenderer) custom selectors из settings
  // Если есть — заменяем defaults
  function loadCustomSelectors() {
    try {
      if (window.__ccCustomSelectors) {
        SELECTORS = { ...SELECTORS, ...window.__ccCustomSelectors }
      }
    } catch (_) {}
  }

  // ── ЛОГИРОВАНИЕ (через preload IPC, НЕ console.*) ──────────────────
  // ВАЖНО: hook работает внутри webview — у него нет прямого ipcRenderer.
  // Используем sendToHost (для webview parent) через global __ccAiBridge.
  function log(level, msg) {
    try {
      window.__ccAiBridge?.log?.(level, '[' + PROVIDER + '] ' + msg)
    } catch (_) {}
  }

  // ── PUBLIC: ВСТАВКА ВОПРОСА ─────────────────────────────────────────
  window.__ccAiInjectQuestion = function (text) {
    if (typeof text !== 'string' || !text.trim()) {
      return { ok: false, error: 'empty_text' }
    }
    
    const input = document.querySelector(SELECTORS.input)
    if (!input) {
      log('ERROR', 'input not found: ' + SELECTORS.input)
      return { ok: false, error: 'input_not_found', selector: SELECTORS.input }
    }
    
    // ── React-friendly value setter (для contenteditable / textarea) ──
    try {
      input.focus()
      
      if (input.tagName === 'TEXTAREA') {
        // React 19 native setter trick
        const proto = Object.getPrototypeOf(input)
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
        if (nativeSetter) {
          nativeSetter.call(input, text)
        } else {
          input.value = text
        }
        input.dispatchEvent(new Event('input', { bubbles: true }))
      } else if (input.contentEditable === 'true' || input.isContentEditable) {
        // Для contenteditable (Claude, ChatGPT новые версии)
        input.textContent = text
        input.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        // Fallback: insertText command (deprecated но работает)
        document.execCommand('insertText', false, text)
      }
    } catch (e) {
      log('ERROR', 'insert failed: ' + e.message)
      return { ok: false, error: 'insert_failed', detail: e.message }
    }
    
    // ── Click submit после задержки (даём React обработать) ──
    setTimeout(() => {
      const btn = document.querySelector(SELECTORS.submitButton)
      if (btn && !btn.disabled) {
        btn.click()
        log('INFO', 'submitted via button click')
      } else {
        // Fallback: Enter
        try {
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13,
            bubbles: true, cancelable: true,
          }))
          log('INFO', 'submitted via Enter fallback')
        } catch (e) {
          log('ERROR', 'submit fallback failed: ' + e.message)
        }
      }
    }, INJECT_DELAY)
    
    return { ok: true }
  }

  // ── ИЗВЛЕЧЕНИЕ ОТВЕТА ──────────────────────────────────────────────
  function extractCurrentAnswer() {
    try {
      const elements = document.querySelectorAll(SELECTORS.lastAssistantMessage)
      const last = elements[elements.length - 1]
      if (!last) return null
      
      // 🔧 СПЕЦИФИКА САЙТА: некоторые сайты помещают код в <pre>, ссылки в <a>
      // Используем innerText — он сохраняет переносы строк правильно
      const text = (last.innerText || last.textContent || '').trim()
      if (!text) return null
      
      // Дедуп — хэш по первым 100 символам
      const hash = text.slice(0, 100)
      if (hash === lastAnswerHash) return null
      
      return { text, hash }
    } catch (e) {
      log('ERROR', 'extract failed: ' + e.message)
      return null
    }
  }

  function isStreaming() {
    try {
      return !!document.querySelector(SELECTORS.streamingIndicator)
    } catch (_) {
      return false
    }
  }

  function checkAndSendAnswer() {
    if (isStreaming()) return  // AI ещё пишет
    
    const now = Date.now()
    if (now - lastSentTs < COOLDOWN_MS) return  // cooldown
    
    const result = extractCurrentAnswer()
    if (!result) return
    
    lastAnswerHash = result.hash
    lastSentTs = now
    
    log('INFO', 'answer ready, length=' + result.text.length)
    
    try {
      // ⭐ ОТПРАВКА В MAIN PROCESS через preload bridge
      window.__ccAiBridge?.sendAnswer?.({
        provider: PROVIDER,
        text: result.text,
        timestamp: now,
        streamingComplete: true,
      })
    } catch (e) {
      log('ERROR', 'sendAnswer failed: ' + e.message)
    }
  }

  // ── НАСТРОЙКА MUTATION OBSERVER ─────────────────────────────────────
  function startObserver() {
    if (observer) return
    
    // 🔧 ВЫБОР TARGET: обычно <main> или body. Сайт-специфично.
    const target = document.querySelector('main') || document.body
    if (!target) {
      log('WARN', 'no observer target, retry in 1s')
      setTimeout(startObserver, 1000)
      return
    }
    
    observer = new MutationObserver(() => {
      clearTimeout(observerTimer)
      observerTimer = setTimeout(checkAndSendAnswer, DEBOUNCE_MS)
    })
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    
    log('INFO', 'observer started on ' + target.tagName)
  }

  // ── INITIALIZATION ─────────────────────────────────────────────────
  function init() {
    if (isInitialized) return
    isInitialized = true
    
    loadCustomSelectors()
    log('INFO', 'hook initialized, selectors=' + JSON.stringify(SELECTORS))
    
    startObserver()
  }

  // Запуск: когда DOM готов
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
  
  // ── CLEANUP ────────────────────────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    try { observer?.disconnect() } catch (_) {}
    clearTimeout(observerTimer)
  })
})()
```

---

## 2. OpenAI / ChatGPT (chat.openai.com + chatgpt.com) {#2-openai}

### Текущая структура DOM (проверено на 9 июня 2026)

ChatGPT использует React + Tailwind. Сообщения имеют `data-message-author-role` атрибут.

### Селекторы

```js
const SELECTORS = {
  // Главное поле ввода — textarea ИЛИ contenteditable div (новая версия)
  input: '#prompt-textarea',
  
  // Кнопка отправки — testid стабилен
  submitButton: '[data-testid="send-button"]',
  
  // Последний ответ AI
  // - article[data-testid="conversation-turn-N"] обёртка
  // - внутри [data-message-author-role="assistant"]
  // - .markdown с содержимым
  lastAssistantMessage: '[data-message-author-role="assistant"] .markdown',
  
  // Streaming indicator
  // - При генерации появляется .result-streaming на последнем сообщении
  // - Или [data-message-author-role="assistant"][data-message-status="in_progress"]
  streamingIndicator: '.result-streaming, [data-message-status="in_progress"]',
}
```

### Особенности

1. **Continuation streaming**: ChatGPT может «продолжать» ответ кнопкой «Continue generating» — это будет **новый** assistant message. Hook берёт последний → OK.

2. **Code blocks**: внутри `.markdown` находятся `<pre><code>` блоки. `innerText` сохраняет переносы.

3. **Login wall**: если юзер не залогинен, увидит другую страницу без `#prompt-textarea`. Hook вернёт `input_not_found` → UI попросит залогиниться.

4. **Cloudflare**: при подозрительной активности (много запросов подряд) ChatGPT может показать капчу. DOM меняется — наши селекторы не найдут. Hook отправит `auth_required`.

5. **GPT-4 vs GPT-3.5**: выбор модели — кнопка ChatGPT, юзер выбирает руками. Мы не управляем выбором модели в WebUI mode.

### Поведенческие особенности

- Streaming **очень быстрый** — текст появляется token-by-token
- `.result-streaming` исчезает **сразу после** последнего token (≈ 50-100мс)
- DEBOUNCE_MS = 800мс безопасно — после 800мс тишины ответ точно завершён

### Известные проблемы (мониторить!)

- **2024**: OpenAI меняла структуру `data-testid` ≈ раз в 3-4 месяца
- **Сентябрь 2024**: появился contenteditable вместо textarea (юзер должен переключиться) — наш hook поддерживает оба
- **Январь 2025**: добавлен ChatGPT Tasks — могут быть новые элементы DOM

---

## 3. DeepSeek (chat.deepseek.com) {#3-deepseek}

### Структура DOM

DeepSeek похож на ChatGPT (Vue/Nuxt). Менее предсказуемые `data-*` атрибуты.

### Селекторы

```js
const SELECTORS = {
  // Textarea с placeholder
  input: 'textarea[placeholder*="Send a message"], textarea[placeholder*="Сообщение"], #chat-input',
  
  // Кнопка отправки (может меняться)
  submitButton: 'button[type="submit"]:not([disabled]), button.send-button, [aria-label="Send"]',
  
  // Последний ответ — DeepSeek использует .message-content или .ds-markdown
  lastAssistantMessage: '.ds-markdown:last-of-type, [class*="message-content"]:last-child',
  
  // Streaming indicator
  // - При генерации появляется элемент с классом *streaming* или *loading*
  // - Или последнее сообщение имеет class *typing*
  streamingIndicator: '[class*="streaming"], [class*="typing-indicator"]',
}
```

### Особенности

1. **Слабо стабильные классы**: DeepSeek может использовать хешированные классы (Vue Scoped CSS) типа `.message_abc123`. Селекторы менее надёжны → больше нужен UI Custom Selectors.

2. **Модели**: DeepSeek-Chat vs DeepSeek-Reasoner — выбор справа от input. Не наша забота.

3. **Доступность в РФ**: DeepSeek **частично блокирован** провайдерами. Может потребоваться VPN. Без интернета — fail.

4. **Reasoning model**: deepseek-reasoner думает дольше и показывает «Thinking...» step. Streaming indicator может разный.

---

## 4. Claude (claude.ai) {#4-claude}

### Структура DOM

Claude — React + специфические testid. Достаточно стабильно.

### Селекторы

```js
const SELECTORS = {
  // Claude использует contenteditable div (НЕ textarea)
  input: 'div[contenteditable="true"][role="textbox"], [data-testid="chat-input"]',
  
  submitButton: 'button[aria-label="Send Message"], [data-testid="send-button"]',
  
  // Ответ AI
  lastAssistantMessage: '[data-is-streaming="false"][data-message-id]:last-of-type, .font-claude-message:last-of-type',
  
  // Streaming
  streamingIndicator: '[data-is-streaming="true"]',
}
```

### Особенности

1. **contenteditable** — НЕ textarea. Наш template уже поддерживает оба.

2. **Артефакты**: Claude может создавать «Artifacts» (отдельные документы рядом с chat). Они в отдельном DOM. Игнорируем.

3. **Models**: Claude Opus / Sonnet / Haiku — выбор в settings сайта.

4. **Длинные ответы**: Claude умеет давать ответы > 10000 слов. UI должен предусмотреть scroll.

---

## 5. ГигаЧат (giga.chat) {#5-gigachat}

### Структура DOM

Сбер использует свой stack (Angular?). Возможно частично закрытый исходник, изменения непредсказуемые.

### Селекторы (проверить руками!)

```js
const SELECTORS = {
  // Поле ввода — точно неизвестно, проверить когда сайт открывается
  input: 'textarea, [contenteditable="true"]',
  
  // Кнопка отправки — обычно [type="submit"]
  submitButton: 'button[type="submit"]',
  
  // Ответ AI — частая разметка для bubble чата
  lastAssistantMessage: '[class*="message"][class*="assistant"]:last-of-type, [class*="bot"]:last-of-type',
  
  // Streaming
  streamingIndicator: '[class*="typing"], [class*="loading"]',
}
```

### Особенности

1. **SSL сертификат Минцифры**: у нас уже есть `httpsPostSkipSsl` для API запросов к ГигаЧат — но **для webview** этого не нужно (Electron уважает системные сертификаты).

2. **OAuth для веб-сайта**: юзер логинится через Сбер ID — это обычный OAuth flow в webview, без особенностей.

3. **Малая документация**: меньше публичных селекторов чем у ChatGPT. Может потребоваться **больше custom selectors** настройки от юзера.

4. **Возможные проблемы**: сайт может использовать iframe внутри webview — это разрушит наш observer. Тогда придётся использовать `cross-frame` post-message.

---

## 6. Будущие провайдеры — как добавить {#6-future}

Шаги для добавления нового AI веб-сайта (например **Mistral / Perplexity / Gemini**):

### Шаг 1: добавить в detection
```js
// src/utils/aiWebviewConfigs.js
export function detectAiProvider(url) {
  if (url.includes('mistral.ai')) return 'mistral'    // ← новое
  ...
}

export const DEFAULT_WEBVIEW_URLS = {
  ...
  mistral: 'https://chat.mistral.ai',                  // ← новое
}
```

### Шаг 2: добавить в PROVIDERS массив
```js
// src/utils/aiProviders.js
export const PROVIDERS = [
  ...
  { id: 'mistral', label: 'Mistral', icon: '🌬', defaultModel: 'mistral-large', free: false },
]
```

### Шаг 3: создать hook файл
```js
// main/preloads/hooks/ai/mistral.hook.js
// Скопировать .hookTemplate.js, поменять SELECTORS
const SELECTORS = {
  input: '...',           // open chat.mistral.ai, F12, найти input
  submitButton: '...',
  lastAssistantMessage: '...',
  streamingIndicator: '...',
}
```

### Шаг 4: тест
- Прогнать `hooks/ai/mistral.hook.vitest.js` (mock DOM)
- Manual: открыть chat.mistral.ai в Settings → AI → выбрать Mistral → WebUI → задать вопрос

**Время добавления нового провайдера**: ~30-60 минут (включая тесты).

---

## 7. Verification — как проверить селекторы {#7-verify}

### Метод 1: Custom Selectors UI с подсветкой

Через `AIWebviewSelectorsConfig.jsx`:
- Юзер вводит селектор
- Кнопка «🔍 Тестировать» → webview.executeJavaScript:
  ```js
  const el = document.querySelector('${userSelector}')
  if (el) {
    el.style.outline = '3px solid red'
    el.style.outlineOffset = '2px'
    setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 3000)
  }
  return el ? { ok: true, tagName: el.tagName, text: el.innerText?.slice(0, 100) } : { ok: false }
  ```
- Юзер видит **красную рамку** вокруг найденного элемента на 3 секунды

### Метод 2: Manual via DevTools (для разработчиков)

1. Открыть chat.openai.com в Chrome
2. F12 → Console:
   ```js
   document.querySelector('#prompt-textarea')  // должен показать textarea
   document.querySelectorAll('[data-message-author-role="assistant"] .markdown').length  // > 0 после первого ответа
   ```
3. Если возвращает `null` — селектор устарел, искать новый.

### Метод 3: автотест с jsdom + snapshot реальной HTML

- Сохранить HTML страницы chat.openai.com (только разметка, без данных)
- В тесте: загрузить в jsdom → проверить что селекторы находят элементы
- При обновлении сайта — обновить snapshot

Это **дороже** — но даёт автоматическое предупреждение о regression.

---

## 🚨 КРИТИЧЕСКИ ВАЖНО: эти селекторы УСТАРЕЮТ

**Реальность**: OpenAI меняет structure DOM каждые 2-3 месяца. DeepSeek реже но тоже. Claude чаще всего стабилен. ГигаЧат — непредсказуемо.

**Мониторинг**:
- Юзер сообщает «AI ответы перестали извлекаться»
- Разработчик открывает сайт, F12 → находит новые селекторы
- Обновляет соответствующий hook файл
- Релиз patch версии (v1.2.1, v1.2.2)

**Защита для юзера**:
- UI Custom Selectors — юзер сам может временно починить
- Clipboard fallback — если ничего не работает, юзер выделяет ответ → copy → программа подхватывает

---

## 📌 Чек-лист валидации hook (перед merge)

Для каждого нового / изменённого hook:

- [ ] Селекторы найдены вручную через DevTools на текущей версии сайта
- [ ] Hook injection работает: `__ccAiInjectQuestion('test')` отправляет
- [ ] MutationObserver срабатывает: ответ AI извлекается через `sendAnswer`
- [ ] Streaming detection корректный: `sendAnswer` НЕ срабатывает пока AI пишет
- [ ] Cooldown работает: 2 ответа за 1 сек → отправляется только первый
- [ ] Cleanup: при unload observer disconnects
- [ ] Логирование через `__ccAiBridge.log` (НЕ console.*)
- [ ] Тест с пустой страницей (до логина): возвращает `input_not_found`
- [ ] Тест с captcha: возвращает `auth_required` (если применимо)

---

## 🔄 Версионирование hook файлов

Hook файлы версионируются с **датой проверки**:

```js
const VERSION = 'openai-v1-2026-06-10'
```

При обновлении сайта → бамп versions → лог говорит «hook openai-v1-2026-06-10 устарел, используйте v2».

Юзер видит в Settings → AI: «⚠️ Селекторы OpenAI могут быть устаревшими (последняя проверка 10 июня 2026). Обновитесь до v1.2.3 для свежих селекторов».

---

**Версия документа**: 1.0 (создан 10 июня 2026 параллельно с phase-ai-bridge-plan.md).
**Статус**: 📋 СПРАВОЧНИК — обновляется при изменении сайтов или добавлении провайдеров.
