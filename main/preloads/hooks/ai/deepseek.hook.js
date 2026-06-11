// v1.2.0 (Этап 6 AI Bridge): hook для chat.deepseek.com.
// Структура идентична openai.hook.js — отличаются только селекторы.
// Селекторы менее стабильны (Vue Scoped CSS) → больше нужна настройка через UI (Этап 8).

;(function () {
  const PROVIDER = 'deepseek'
  const VERSION = 'v1-2026-06'

  if (window.__ccAiHookLoaded) { return }
  try { window.__ccAiHookLoaded = true } catch (_) {}

  let SELECTORS = {
    input: 'textarea[placeholder*="Send a message"], textarea[placeholder*="Сообщение"], #chat-input',
    submitButton: 'button[type="submit"]:not([disabled]), button.send-button, [aria-label="Send"]',
    lastAssistantMessage: '.ds-markdown:last-of-type, [class*="message-content"]:last-of-type',
    streamingIndicator: '[class*="streaming"], [class*="typing-indicator"]',
  }

  const DEBOUNCE_MS = 1000  // DeepSeek медленнее с typing indicator
  const INJECT_DELAY = 150
  const MAX_WAIT_FOR_ANSWER_MS = 120000  // reasoner думает дольше
  const POLL_INTERVAL_MS = 350

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
    if (input.tagName === 'TEXTAREA') {
      const proto = Object.getPrototypeOf(input)
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      if (desc && desc.set) desc.set.call(input, text)
      else input.value = text
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (input.contentEditable === 'true' || input.isContentEditable) {
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
      if (_currentQuestionId !== questionId) return
      const all = findAllAssistant()
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
            'Ответ DeepSeek не появился за ' + MAX_WAIT_FOR_ANSWER_MS + 'мс')
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
          'Поле ввода DeepSeek не найдено. Возможно VPN не подключён или сайт обновился — настройте селектор в настройках.')
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
          try { window.__ccAiBridge.error(questionId, 'submit_not_found', 'Кнопка отправки DeepSeek не найдена') } catch (_) {}
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
