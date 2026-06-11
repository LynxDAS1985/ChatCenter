// v1.2.0 (Этап 6 AI Bridge): hook для claude.ai.
// Claude использует contenteditable div (не textarea) — отдельная ветка в setInputValue.

;(function () {
  const PROVIDER = 'anthropic'
  const VERSION = 'v1-2026-06'

  if (window.__ccAiHookLoaded) { return }
  try { window.__ccAiHookLoaded = true } catch (_) {}

  let SELECTORS = {
    input: 'div[contenteditable="true"][role="textbox"], [data-testid="chat-input"]',
    submitButton: 'button[aria-label="Send Message"], [data-testid="send-button"], button[aria-label*="Send"]',
    lastAssistantMessage: '[data-is-streaming="false"][data-message-id]:last-of-type, .font-claude-message:last-of-type',
    streamingIndicator: '[data-is-streaming="true"]',
  }

  const DEBOUNCE_MS = 800
  const INJECT_DELAY = 120
  const MAX_WAIT_FOR_ANSWER_MS = 120000  // Claude может давать длинные ответы
  const POLL_INTERVAL_MS = 300

  let _currentQuestionId = null
  let _waitTimer = null
  let _initialAssistantCount = 0

  function log(level, msg) { try { window.__ccAiBridge && window.__ccAiBridge.log(level, msg) } catch (_) {} }
  function findInput() { return document.querySelector(SELECTORS.input) }
  function findSubmit() { return document.querySelector(SELECTORS.submitButton) }
  function findAllAssistant() { return document.querySelectorAll(SELECTORS.lastAssistantMessage) }
  function isStreaming() { return !!document.querySelector(SELECTORS.streamingIndicator) }

  function setInputValue(input, text) {
    input.focus()
    // Claude — contenteditable div, не textarea
    if (input.tagName === 'TEXTAREA') {
      const proto = Object.getPrototypeOf(input)
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      if (desc && desc.set) desc.set.call(input, text); else input.value = text
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      // contenteditable — нужно imitate paste для React
      input.textContent = text
      input.dispatchEvent(new Event('input', { bubbles: true }))
      // Доп. событие для React state
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }))
    }
  }

  function waitForAnswer(questionId) {
    _initialAssistantCount = findAllAssistant().length
    let lastChangeAt = Date.now()
    let lastText = ''
    const startedAt = Date.now()

    function tick() {
      if (_currentQuestionId !== questionId) return
      const all = findAllAssistant()
      // Claude: data-is-streaming="false" в селекторе → только готовые сообщения попадают.
      // Поэтому ждём появления НОВОГО элемента с этим атрибутом.
      const newAssistant = all.length > _initialAssistantCount ? all[all.length - 1] : null
      const text = newAssistant ? (newAssistant.innerText || '').trim() : ''
      const now = Date.now()
      if (text && text !== lastText) { lastText = text; lastChangeAt = now }
      if (text && !isStreaming() && (now - lastChangeAt) >= DEBOUNCE_MS) {
        log('INFO', 'ответ готов (' + text.length + ' chars)')
        try { window.__ccAiBridge.answer(questionId, text) } catch (_) {}
        teardown(); return
      }
      if (now - startedAt > MAX_WAIT_FOR_ANSWER_MS) {
        try {
          window.__ccAiBridge.error(questionId, 'streaming_timeout',
            'Ответ Claude не появился за ' + MAX_WAIT_FOR_ANSWER_MS + 'мс')
        } catch (_) {}
        teardown(); return
      }
      _waitTimer = setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()
  }

  function teardown() { if (_waitTimer) { clearTimeout(_waitTimer); _waitTimer = null } _currentQuestionId = null }

  function handleInject(payload) {
    if (!payload || !payload.questionId || typeof payload.text !== 'string' || !payload.text.trim()) return
    const { questionId, text, selectors } = payload
    if (selectors && typeof selectors === 'object') SELECTORS = Object.assign({}, SELECTORS, selectors)
    teardown()
    _currentQuestionId = questionId
    log('INFO', 'inject start, questionId=' + questionId)

    const input = findInput()
    if (!input) {
      try {
        window.__ccAiBridge.error(questionId, 'input_not_found',
          'Поле ввода Claude не найдено. Возможно нужно залогиниться.')
      } catch (_) {}
      return
    }
    try { setInputValue(input, text) }
    catch (e) {
      try { window.__ccAiBridge.error(questionId, 'unknown', 'Не удалось вставить текст: ' + (e && e.message)) } catch (_) {}
      return
    }

    setTimeout(function () {
      const btn = findSubmit()
      if (btn && !btn.disabled) {
        try { btn.click(); log('INFO', 'submit clicked'); waitForAnswer(questionId) }
        catch (e) {
          try { window.__ccAiBridge.error(questionId, 'unknown', 'Submit упал: ' + (e && e.message)) } catch (_) {}
        }
      } else {
        try {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))
          waitForAnswer(questionId)
        } catch (e) {
          try { window.__ccAiBridge.error(questionId, 'submit_not_found', 'Кнопка отправки Claude не найдена') } catch (_) {}
        }
      }
    }, INJECT_DELAY)
  }

  if (window.__ccAiBridge) {
    window.__ccAiBridge.setInjectHandler(handleInject)
    log('INFO', 'hook готов, provider=' + PROVIDER + ' version=' + VERSION)
  } else {
    setTimeout(function () { if (window.__ccAiBridge) window.__ccAiBridge.setInjectHandler(handleInject) }, 50)
  }
})()
