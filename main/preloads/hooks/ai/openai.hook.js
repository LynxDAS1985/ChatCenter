// v1.2.0 (Этап 5 AI Bridge): hook для chat.openai.com / chatgpt.com.
//
// Запускается в main world webview из ai-monitor.preload.cjs через <script> тег.
// Имеет доступ к DOM ChatGPT + к window.__ccAiBridge (exposed preload'ом).
//
// Селекторы на 9 июня 2026 (проверены в phase-ai-bridge-providers.md):
// - input: #prompt-textarea — textarea или contenteditable div (новая версия)
// - submitButton: [data-testid="send-button"]
// - lastAssistantMessage: [data-message-author-role="assistant"] .markdown
// - streamingIndicator: .result-streaming или [data-message-status="in_progress"]
//
// ВАЖНО:
// - НЕ console.* — только window.__ccAiBridge.log
// - Уважать DEBOUNCE_MS (не слать ответ пока генерация идёт)
// - Поддержка React 19 native setter для textarea + contenteditable для div

;(function () {
  const PROVIDER = 'openai'
  const VERSION = 'v1-2026-06'

  // Защита от двойной загрузки
  if (window.__ccAiHookLoaded) {
    try { window.__ccAiBridge && window.__ccAiBridge.log('WARN', 'openai hook уже загружен, пропускаем') } catch (_) {}
    return
  }
  try { window.__ccAiHookLoaded = true } catch (_) {}

  let SELECTORS = {
    input: '#prompt-textarea',
    submitButton: '[data-testid="send-button"]',
    lastAssistantMessage: '[data-message-author-role="assistant"] .markdown',
    streamingIndicator: '.result-streaming, [data-message-status="in_progress"]',
  }

  const DEBOUNCE_MS = 800
  const INJECT_DELAY = 100
  const MAX_WAIT_FOR_ANSWER_MS = 90000
  const POLL_INTERVAL_MS = 300

  let _currentQuestionId = null
  let _waitTimer = null
  let _initialAssistantCount = 0

  function log(level, msg) {
    try { window.__ccAiBridge && window.__ccAiBridge.log(level, msg) } catch (_) {}
  }

  function findInput() { return document.querySelector(SELECTORS.input) }
  function findSubmit() { return document.querySelector(SELECTORS.submitButton) }
  function findAllAssistant() { return document.querySelectorAll(SELECTORS.lastAssistantMessage) }
  function findLastAssistant() {
    const all = findAllAssistant()
    return all.length ? all[all.length - 1] : null
  }
  function isStreaming() { return !!document.querySelector(SELECTORS.streamingIndicator) }

  function setInputValue(input, text) {
    input.focus()
    if (input.tagName === 'TEXTAREA') {
      const proto = Object.getPrototypeOf(input)
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      if (desc && desc.set) {
        desc.set.call(input, text)
      } else {
        input.value = text
      }
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (input.contentEditable === 'true' || input.isContentEditable) {
      // ChatGPT новая версия: contenteditable div
      input.textContent = text
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      try { document.execCommand('insertText', false, text) } catch (_) {}
    }
  }

  function waitForAnswer(questionId) {
    _initialAssistantCount = findAllAssistant().length
    let lastChangeAt = Date.now()
    let lastText = ''
    const startedAt = Date.now()

    function tick() {
      if (_currentQuestionId !== questionId) return  // отменено

      const allAssistant = findAllAssistant()
      // Новый ответ — это assistant сообщение, появившееся ПОСЛЕ нашего инжекта
      const newAssistant = allAssistant.length > _initialAssistantCount
        ? allAssistant[allAssistant.length - 1]
        : null

      const text = newAssistant ? (newAssistant.innerText || '').trim() : ''
      const now = Date.now()

      if (text && text !== lastText) {
        lastText = text
        lastChangeAt = now
      }

      // Готов: есть текст + не стримит + прошло DEBOUNCE_MS тишины
      if (text && !isStreaming() && (now - lastChangeAt) >= DEBOUNCE_MS) {
        log('INFO', 'ответ готов (' + text.length + ' chars)')
        try { window.__ccAiBridge && window.__ccAiBridge.answer(questionId, text) } catch (_) {}
        teardown()
        return
      }

      // Таймаут
      if (now - startedAt > MAX_WAIT_FOR_ANSWER_MS) {
        log('ERROR', 'ответ не появился за ' + MAX_WAIT_FOR_ANSWER_MS + 'мс')
        try {
          window.__ccAiBridge && window.__ccAiBridge.error(questionId, 'streaming_timeout',
            'Ответ ChatGPT не появился за ' + MAX_WAIT_FOR_ANSWER_MS + 'мс')
        } catch (_) {}
        teardown()
        return
      }

      _waitTimer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    tick()
  }

  function teardown() {
    if (_waitTimer) { clearTimeout(_waitTimer); _waitTimer = null }
    _currentQuestionId = null
  }

  function handleInject(payload) {
    if (!payload || typeof payload !== 'object') {
      log('WARN', 'handleInject: payload не объект')
      return
    }
    const { questionId, text, selectors } = payload
    if (!questionId || typeof text !== 'string' || !text.trim()) {
      log('WARN', 'handleInject: пустой text или questionId')
      return
    }

    // Custom селекторы от юзера (из настроек, Этап 8) — override defaults
    if (selectors && typeof selectors === 'object') {
      SELECTORS = Object.assign({}, SELECTORS, selectors)
      log('INFO', 'применены custom selectors')
    }

    teardown()  // отменить предыдущий запрос
    _currentQuestionId = questionId

    log('INFO', 'inject start, questionId=' + questionId + ' text.length=' + text.length)

    const input = findInput()
    if (!input) {
      log('ERROR', 'input не найден: ' + SELECTORS.input)
      try {
        window.__ccAiBridge && window.__ccAiBridge.error(questionId, 'input_not_found',
          'Поле ввода ChatGPT не найдено. Возможно нужно залогиниться или сайт обновился.')
      } catch (_) {}
      return
    }

    try {
      setInputValue(input, text)
    } catch (e) {
      log('ERROR', 'insert упал: ' + (e && e.message))
      try {
        window.__ccAiBridge && window.__ccAiBridge.error(questionId, 'unknown',
          'Не удалось вставить текст: ' + (e && e.message))
      } catch (_) {}
      return
    }

    setTimeout(function () {
      const btn = findSubmit()
      if (btn && !btn.disabled) {
        try {
          btn.click()
          log('INFO', 'submit clicked')
          waitForAnswer(questionId)
        } catch (e) {
          log('ERROR', 'submit click упал: ' + (e && e.message))
          try {
            window.__ccAiBridge && window.__ccAiBridge.error(questionId, 'unknown',
              'Не удалось нажать кнопку: ' + (e && e.message))
          } catch (_) {}
        }
      } else {
        // Fallback: Enter в input (некоторые версии ChatGPT)
        try {
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
          }))
          log('INFO', 'Enter dispatched (submit disabled или не найден)')
          waitForAnswer(questionId)
        } catch (e) {
          log('ERROR', 'Enter fallback упал: ' + (e && e.message))
          try {
            window.__ccAiBridge && window.__ccAiBridge.error(questionId, 'submit_not_found',
              'Кнопка отправки ChatGPT не найдена')
          } catch (_) {}
        }
      }
    }, INJECT_DELAY)
  }

  // ── Регистрация в preload bridge ──
  if (window.__ccAiBridge) {
    window.__ccAiBridge.setInjectHandler(handleInject)
    log('INFO', 'hook готов, provider=' + PROVIDER + ' version=' + VERSION)
  } else {
    // Preload bridge ещё не создан — это маловероятно при правильной последовательности,
    // но защита есть. Подождём один tick.
    setTimeout(function () {
      if (window.__ccAiBridge) {
        window.__ccAiBridge.setInjectHandler(handleInject)
        log('INFO', 'hook готов (delayed), provider=' + PROVIDER)
      }
    }, 50)
  }
})()
