// v1.1.5: диагностические логи для AI WebView (режим «Веб-интерфейс»).
//
// Цель: понять почему DeepSeek (https://chat.deepseek.com) и ГигаЧат
// (https://giga.chat) не показывают login страницу / падают в webview.
//
// Хук подписывается на ВСЕ важные события <webview> и пишет в консоль
// с префиксом [ai-webview] чтобы юзер мог фильтровать в DevTools.
//
// События которые ловим:
//   - did-start-loading       — начало загрузки URL
//   - did-stop-loading        — конец (успех или нет)
//   - did-finish-load         — успешная загрузка
//   - did-fail-load           — фейл загрузки (код + описание + URL)
//   - did-navigate            — переход на новый URL (redirect / login)
//   - did-navigate-in-page    — SPA hash-навигация
//   - dom-ready               — DOM готов
//   - console-message         — console.log/error из САМОГО САЙТА
//                                (тут видны CSP errors / JS errors сайта)
//   - render-process-gone     — webview процесс упал
//   - unresponsive            — повис
//   - did-attach              — первая привязка к окну
//
// Использование:
//   const attachLogs = attachAiWebviewDiagnostics(webviewRef.current, provider, url)
//   ...
//   return () => attachLogs?.detach()
//
// Логи временные. Удалить после нахождения корня проблемы.

const PREFIX = '[ai-webview]'

/**
 * Привязать диагностические event listeners к <webview> элементу.
 * Idempotent — повторный вызов на том же элементе не дублирует.
 *
 * @param {HTMLElement|null} webview — DOM элемент <webview>
 * @param {string} provider — 'openai' | 'anthropic' | 'deepseek' | 'gigachat'
 * @param {string} url — фактический webviewUrl
 * @returns {{detach: function}|null}
 */
export function attachAiWebviewDiagnostics(webview, provider, url) {
  if (!webview) return null

  // Защита от двойного attach — пометка на элементе.
  if (webview.__ccDiagAttached) {
    return { detach: webview.__ccDiagDetach || (() => {}) }
  }

  const ctx = `provider=${provider} url=${url}`
  const log = (level, event, extra = '') => {
    const tag = `${PREFIX} ${level} [${event}]`
    const msg = `${tag} ${ctx}${extra ? ' ' + extra : ''}`
    try {
      if (level === 'ERROR') console.error(msg)
      else if (level === 'WARN') console.warn(msg)
      else console.log(msg)
    } catch (_) { /* ignore */ }
  }

  log('INFO', 'attach', `(diagnostics attached)`)

  // ─── Event handlers ─────────────────────────────────────────────

  const onStartLoading = () => log('INFO', 'did-start-loading')

  const onStopLoading = () => {
    let currentUrl = '?'
    try { currentUrl = webview.getURL?.() || '?' } catch (_) {}
    log('INFO', 'did-stop-loading', `current=${currentUrl}`)
  }

  const onFinishLoad = () => {
    let currentUrl = '?'
    try { currentUrl = webview.getURL?.() || '?' } catch (_) {}
    log('INFO', 'did-finish-load', `current=${currentUrl}`)
  }

  // ⭐ ГЛАВНЫЙ — здесь ловим X-Frame-Options / CSP / network ошибки
  const onFailLoad = (e) => {
    const code = e.errorCode ?? '?'
    const desc = e.errorDescription || '?'
    const failedUrl = e.validatedURL || e.url || '?'
    const isMain = e.isMainFrame !== false ? '(main)' : '(subframe)'
    log('ERROR', 'did-fail-load', `code=${code} desc="${desc}" failedUrl=${failedUrl} ${isMain}`)
  }

  const onNavigate = (e) => {
    log('INFO', 'did-navigate', `→ ${e.url || '?'}`)
  }

  const onNavigateInPage = (e) => {
    if (e.isMainFrame === false) return  // тихо игнорим subframe
    log('INFO', 'did-navigate-in-page', `→ ${e.url || '?'}`)
  }

  const onDomReady = () => log('INFO', 'dom-ready')

  // ⭐ ГЛАВНЫЙ — console.log/error сайта (CSP/refused-to-load видны тут)
  const onConsoleMessage = (e) => {
    const lvl = e.level === 0 ? 'INFO' : e.level === 1 ? 'WARN' : 'ERROR'
    const text = (e.message || '').slice(0, 500)
    const src = e.sourceId ? ` (${e.sourceId.slice(0, 80)}:${e.line || '?'})` : ''
    log(lvl, 'site-console', `${text}${src}`)
  }

  const onRenderGone = (e) => {
    log('ERROR', 'render-process-gone', `reason=${e.reason || '?'} exitCode=${e.exitCode ?? '?'}`)
  }

  const onUnresponsive = () => log('WARN', 'unresponsive')

  const onDidAttach = () => log('INFO', 'did-attach')

  // ─── Attach ─────────────────────────────────────────────────────

  const listeners = [
    ['did-start-loading', onStartLoading],
    ['did-stop-loading', onStopLoading],
    ['did-finish-load', onFinishLoad],
    ['did-fail-load', onFailLoad],
    ['did-navigate', onNavigate],
    ['did-navigate-in-page', onNavigateInPage],
    ['dom-ready', onDomReady],
    ['console-message', onConsoleMessage],
    ['render-process-gone', onRenderGone],
    ['unresponsive', onUnresponsive],
    ['did-attach', onDidAttach],
  ]

  for (const [ev, fn] of listeners) {
    try { webview.addEventListener(ev, fn) } catch (_) {}
  }

  // ─── Detach ─────────────────────────────────────────────────────

  const detach = () => {
    for (const [ev, fn] of listeners) {
      try { webview.removeEventListener(ev, fn) } catch (_) {}
    }
    try {
      delete webview.__ccDiagAttached
      delete webview.__ccDiagDetach
    } catch (_) {}
    log('INFO', 'detach', '(diagnostics detached)')
  }

  webview.__ccDiagAttached = true
  webview.__ccDiagDetach = detach

  return { detach }
}

// Для тестов / интроспекции
export const _internal = { PREFIX }
