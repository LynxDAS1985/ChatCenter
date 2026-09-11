const rendererBootT0 = window.__ccStartupT0 || performance.now()

function bootLog(message) {
  if (window.__ccStartupMark) {
    window.__ccStartupMark('main', message)
    return
  }
  const line = `[startup-renderer] main +${Math.round(performance.now() - rendererBootT0)}ms ${message}`
  try { window.api?.send('app:log', { level: 'INFO', message: line }) } catch {}
  try { console.log(line) } catch {}
}

bootLog('module start before imports')
bootLog('parallel imports start')

const [reactModule, reactDomModule, , appModule] = await Promise.all([
  import('react').then((module) => {
    bootLog('react imported')
    return module
  }),
  import('react-dom/client').then((module) => {
    bootLog('react-dom imported')
    return module
  }),
  import('./index.css').then((module) => {
    bootLog('index.css imported')
    return module
  }),
  import('./App').then((module) => {
    bootLog('App imported')
    return module
  }),
])
bootLog('parallel imports done')

const React = reactModule.default || reactModule
const ReactDOM = reactDomModule.default || reactDomModule
const App = appModule.default

// Error boundary — ловит ошибки и показывает в ТЕРМИНАЛЕ (через console.error)
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[BOOT] RENDER ERROR:', error.message, '\n', error.stack) }
  render() {
    if (this.state.error) return <div style={{color:'#ff4444',padding:20,fontSize:13,whiteSpace:'pre-wrap',fontFamily:'monospace'}}>
      {'⚠ Ошибка рендера:\n' + this.state.error.message + '\n\nStack:\n' + (this.state.error.stack || '')}
    </div>
    return this.props.children
  }
}

bootLog('render start')
const rootElement = document.getElementById('root')
bootLog(`root element ${rootElement ? 'found' : 'missing'}`)
const root = ReactDOM.createRoot(rootElement)
bootLog('react root created')
root.render(
  <ErrorBoundary><App /></ErrorBoundary>
)
bootLog('render scheduled')
// v1.2.335/337: заставку (index.html #cc-splash) убираем НЕ на первом кадре React (в dev после него
// ещё долго догружаются модули и окно пустое БЕЗ заставки), а когда приложение реально готово:
// App.jsx зовёт window.__ccHideSplash при appReady. Идемпотентно; скрытие через класс → переход → удаление.
function hideCcSplash() {
  const sp = document.getElementById('cc-splash')
  if (!sp) return
  sp.classList.add('cc-splash--hide')
  setTimeout(() => { try { sp.remove() } catch (_) {} }, 500)
}
// v1.2.452: приложение поднялось — гасим окно переподключения и обнуляем счётчик попыток
window.__ccHideSplash = () => { try { window.__ccBootNet?.ok?.() } catch (_) {} ; hideCcSplash() }
requestAnimationFrame(() => {
  bootLog('first requestAnimationFrame after render')
  window.__ccStartupSummary?.('after-render-raf')
})
// Страховка от «зависшей» заставки — в boot-probe.js (v1.2.336): грузится РАНЬШЕ main.jsx, поэтому
// уберёт заставку даже если main.jsx не запустится ИЛИ appReady так и не наступит (30с потолок).
