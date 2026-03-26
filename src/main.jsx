import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

console.log('[BOOT] main.jsx start')

// Error boundary — ловит ошибки рендера React
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[BOOT] ErrorBoundary catch:', error, info) }
  render() {
    if (this.state.error) {
      return <div style={{ color: 'red', padding: 20, fontSize: 14, whiteSpace: 'pre-wrap' }}>
        {'ОШИБКА РЕНДЕРА:\n' + String(this.state.error) + '\n\n' + (this.state.error?.stack || '')}
      </div>
    }
    return this.props.children
  }
}

let App
try {
  console.log('[BOOT] importing App...')
  App = (await import('./App')).default
  console.log('[BOOT] App imported OK')
} catch (e) {
  console.error('[BOOT] IMPORT FAILED:', e)
  document.getElementById('root').innerHTML = '<pre style="color:red;padding:20px">IMPORT ERROR:\n' + e + '\n' + (e?.stack || '') + '</pre>'
}

if (App) {
  console.log('[BOOT] rendering...')
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary><App /></ErrorBoundary>
  )
  console.log('[BOOT] render called')
}
