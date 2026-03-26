import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

console.log('[BOOT] ChatCenter renderer start')

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary><App /></ErrorBoundary>
)
