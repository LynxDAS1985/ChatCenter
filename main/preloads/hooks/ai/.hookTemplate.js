// v1.2.0 (Этап 4 AI Bridge): шаблон hook файла для AI веб-сайта.
// НЕ загружается — копируется в openai.hook.js / deepseek.hook.js / anthropic.hook.js / gigachat.hook.js
// и заполняется конкретными селекторами + поведением.
//
// Запускается в main world webview (через <script> tag из ai-monitor.preload.cjs).
// Имеет доступ к DOM сайта + к window.__ccAiBridge (exposed preload'ом).
//
// ВАЖНО:
// - НЕ использовать console.* — только window.__ccAiBridge.log('LEVEL', 'msg').
// - НЕ хранить состояние в localStorage — только в замыкании.
// - Уважать DEBOUNCE_MS (не слать ответ пока генерация идёт).
// - Селекторы могут быть переопределены через customSelectors из настроек (Этап 8).

;(function () {
  // ── 🔧 КОНФИГ КОНКРЕТНОГО САЙТА ──────────────────────────────────────
  const PROVIDER = '🔧 openai'              // openai / deepseek / anthropic / gigachat
  const VERSION = '🔧 v1'                    // bump при изменении сайта

  // Селекторы по умолчанию. Юзер сможет переопределить через UI (Этап 8) —
  // тогда они придут в payload из inject и заменят defaults.
  let SELECTORS = {
    input: '🔧 selector for textarea/contenteditable',
    submitButton: '🔧 selector for send button',
    lastAssistantMessage: '🔧 selector for last AI response container',
    streamingIndicator: '🔧 selector that EXISTS when AI typing (исчезает когда готово)',
  }

  // ── ОБЩИЕ КОНСТАНТЫ ────────────────────────────────────────────────
  const DEBOUNCE_MS = 800              // ждать тишину MutationObserver
  const COOLDOWN_MS = 3000             // минимум между запросами в этот webui
  const INJECT_DELAY = 100             // задержка между set value и click submit
  const MAX_WAIT_FOR_ANSWER_MS = 60000 // если стриминг не закончился — error

  // ── СОСТОЯНИЕ ──────────────────────────────────────────────────────
  let _currentQuestionId = null
  let _waitTimer = null
  let _observer = null
  let _initialAssistantText = ''  // снэпшот ДО запроса (для определения «новый ответ»)

  // ── ПОДДЕРЖКА ОТМЕНЫ + lookup элементов ────────────────────────────
  function findInput() {
    return document.querySelector(SELECTORS.input)
  }
  function findSubmit() {
    return document.querySelector(SELECTORS.submitButton)
  }
  function findLastAssistant() {
    return document.querySelector(SELECTORS.lastAssistantMessage)
  }
  function isStreaming() {
    return !!document.querySelector(SELECTORS.streamingIndicator)
  }

  // ── ИНЪЕКЦИЯ ВОПРОСА В ПОЛЕ ВВОДА (React-friendly) ─────────────────
  function setInputValue(input, text) {
    input.focus()
    if (input.tagName === 'TEXTAREA') {
      const proto = Object.getPrototypeOf(input)
      const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set
      if (setter) setter.call(input, text)
      else input.value = text
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (input.contentEditable === 'true' || input.isContentEditable) {
      input.textContent = text
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      try { document.execCommand('insertText', false, text) } catch (_) {}
    }
  }

  // ── НАБЛЮДЕНИЕ ЗА ОТВЕТОМ ──────────────────────────────────────────
  function waitForAnswer(questionId) {
    _initialAssistantText = (findLastAssistant() && findLastAssistant().innerText) || ''
    let lastChange = Date.now()
    let lastText = ''

    function tick() {
      if (_currentQuestionId !== questionId) return  // отменено или новый запрос
      const node = findLastAssistant()
      const text = (node && node.innerText) || ''
      const newAnswer = text && text !== _initialAssistantText
      const now = Date.now()
      if (newAnswer && text !== lastText) {
        lastText = text
        lastChange = now
      }
      if (newAnswer && !isStreaming() && (now - lastChange) >= DEBOUNCE_MS) {
        window.__ccAiBridge && window.__ccAiBridge.answer(questionId, lastText)
        teardown()
        return
      }
      if (now - lastChange > MAX_WAIT_FOR_ANSWER_MS) {
        window.__ccAiBridge && window.__ccAiBridge.error(questionId, 'streaming_timeout',
          'Ответ не появился за ' + MAX_WAIT_FOR_ANSWER_MS + 'мс')
        teardown()
        return
      }
      _waitTimer = setTimeout(tick, 300)
    }

    tick()
  }

  function teardown() {
    if (_waitTimer) { clearTimeout(_waitTimer); _waitTimer = null }
    if (_observer) { _observer.disconnect(); _observer = null }
    _currentQuestionId = null
  }

  // ── ОБРАБОТЧИК INJECT ──────────────────────────────────────────────
  function handleInject(payload) {
    if (!payload || typeof payload !== 'object') return
    const { questionId, text, selectors } = payload
    if (!questionId || !text) return

    // Применить custom селекторы из настроек юзера (если есть)
    if (selectors && typeof selectors === 'object') {
      SELECTORS = Object.assign({}, SELECTORS, selectors)
    }

    teardown()  // отменить предыдущий запрос если был
    _currentQuestionId = questionId

    const input = findInput()
    if (!input) {
      window.__ccAiBridge && window.__ccAiBridge.error(questionId, 'input_not_found',
        'Не найден input: ' + SELECTORS.input)
      return
    }
    try {
      setInputValue(input, text)
    } catch (e) {
      window.__ccAiBridge && window.__ccAiBridge.error(questionId, 'unknown',
        'Insert упал: ' + (e && e.message))
      return
    }

    setTimeout(function () {
      const btn = findSubmit()
      if (btn && !btn.disabled) {
        btn.click()
        window.__ccAiBridge && window.__ccAiBridge.log('INFO', 'submit clicked, questionId=' + questionId)
        waitForAnswer(questionId)
      } else {
        // Fallback: Enter в input (некоторые сайты так)
        try {
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
          }))
          window.__ccAiBridge && window.__ccAiBridge.log('INFO', 'Enter dispatched (no submit button)')
          waitForAnswer(questionId)
        } catch (e) {
          window.__ccAiBridge && window.__ccAiBridge.error(questionId, 'submit_not_found',
            'Не найден submit button: ' + SELECTORS.submitButton)
        }
      }
    }, INJECT_DELAY)
  }

  // ── РЕГИСТРАЦИЯ В preload bridge ───────────────────────────────────
  if (window.__ccAiBridge) {
    window.__ccAiBridge.setInjectHandler(handleInject)
    window.__ccAiBridge.log('INFO', 'hook готов, provider=' + PROVIDER + ' version=' + VERSION)
  }
})()
