// v0.84.1: ErrorBoundary для изоляции ошибок в компонентах
// Если один компонент крашится — остальное приложение работает
import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', this.props.name || 'Unknown', ':', error.message)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 12, margin: 4, borderRadius: 6,
          backgroundColor: '#ff444420', border: '1px solid #ff444440',
          color: '#ff6b6b', fontSize: 11, fontFamily: 'monospace',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
            ⚠ {this.props.name || 'Компонент'}: ошибка
          </div>
          <div style={{ opacity: 0.7, fontSize: 10 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 6, padding: '2px 8px', fontSize: 10,
              backgroundColor: '#ff444430', border: '1px solid #ff444450',
              color: '#ff6b6b', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Повторить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
