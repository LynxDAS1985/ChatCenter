// v1.1.14: UI-тестер AI Bridge.
//
// Зачем: до Этапа 7 (AIBridgePanel) AI Bridge можно было вызвать только через
// IPC напрямую. Юзер не должен открывать инструменты разработчика — у нас своя
// программная среда. Этот компонент даёт нажимающуюся кнопку «Спросить»
// для проверки 3 режимов (local/api/webui) без касания инструментов разработчика.
//
// Все логи идут через window.api.send('app:log', ...) → попадают в «📒 Логи ChatCenter».
//
// Открывается из LogModal по кнопке «🧪 Тест AI Bridge».

import { useState } from 'react'

const MODES = [
  { id: 'local',  label: 'Локальный (Ollama)',  needsProvider: false },
  { id: 'api',    label: 'API провайдер',        needsProvider: true  },
  { id: 'webui',  label: 'Веб-интерфейс',        needsProvider: true  },
]

const PROVIDERS = [
  { id: 'anthropic', label: 'Claude (Anthropic)' },
  { id: 'openai',    label: 'ChatGPT (OpenAI)'   },
  { id: 'deepseek',  label: 'DeepSeek'            },
  { id: 'gigachat',  label: 'ГигаЧат (Сбер)'      },
]

function log(level, message) {
  try {
    window.api?.send?.('app:log', { level, message: '[ai-bridge-tester] ' + message })
  } catch (_) { /* лог-вьюер не работает — это сам тестер, фолбэк не нужен */ }
}

export default function AiBridgeTester({ onClose }) {
  const [mode, setMode] = useState('local')
  const [providerId, setProviderId] = useState('anthropic')
  const [text, setText] = useState('Привет! Скажи коротко что ты можешь делать.')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:11434')
  const [sending, setSending] = useState(false)
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState(null)

  const needsProvider = MODES.find(m => m.id === mode)?.needsProvider

  async function handleSend() {
    if (!text.trim()) {
      setError({ code: 'config_invalid', message: 'Введите вопрос' })
      return
    }
    setSending(true)
    setAnswer(null)
    setError(null)
    log('INFO', `start mode=${mode}` + (needsProvider ? ` providerId=${providerId}` : '') + ` text.length=${text.length}`)
    const config = {}
    if (needsProvider) config.providerId = providerId
    if (mode === 'local' && baseUrl) config.baseUrl = baseUrl
    if (model.trim()) config.model = model.trim()
    try {
      const r = await window.api.invoke('ai-bridge:send', {
        mode,
        question: {
          version: 1,
          text,
          source: { messengerId: 'native_cc' },
        },
        config,
      })
      log('INFO', `result ok=${r?.ok} latencyMs=${r?.latencyMs}` + (r?.error ? ` errorCode=${r.error.code}` : ''))
      if (r?.ok) {
        setAnswer(r)
      } else {
        setError(r?.error || { code: 'unknown', message: 'неизвестная ошибка' })
      }
    } catch (e) {
      log('ERROR', 'IPC throw: ' + (e?.message || String(e)))
      setError({ code: 'unknown', message: e?.message || String(e) })
    } finally {
      setSending(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '6px 10px', fontSize: 12,
    backgroundColor: 'var(--cc-hover, #2a2b3e)',
    color: 'var(--cc-text, #e0e0e0)',
    border: '1px solid var(--cc-border, #333)',
    borderRadius: 6, boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 600,
    color: 'var(--cc-text-dim, #888)', marginBottom: 4, marginTop: 8,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10001,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '90%', maxWidth: 600, maxHeight: '85%',
        backgroundColor: 'var(--cc-bg, #1a1b2e)',
        border: '1px solid var(--cc-border, #2a2b3e)',
        borderRadius: 10, display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>

        <div style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid var(--cc-border, #2a2b3e)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text, #e0e0e0)', flex: 1 }}>
            🧪 Тест AI Bridge
          </span>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
            backgroundColor: 'var(--cc-hover, #2a2b3e)', color: '#ff4444', fontSize: 16,
          }}>✕</button>
        </div>

        <div style={{ padding: 16, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--cc-text-dimmer, #777)', marginBottom: 12 }}>
            Отправляет вопрос в AI Bridge напрямую — без открытия «инструментов разработчика».
            Логи попадают в этот же лог-вьюер (закройте окно тестера, чтобы их увидеть).
          </div>

          <label style={labelStyle}>Режим</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                  backgroundColor: mode === m.id ? '#2AABEE22' : 'var(--cc-hover, #2a2b3e)',
                  color: mode === m.id ? '#2AABEE' : 'var(--cc-text-dim, #888)',
                  border: `1px solid ${mode === m.id ? '#2AABEE55' : 'var(--cc-border, #333)'}`,
                }}
              >{m.label}</button>
            ))}
          </div>

          {needsProvider && (
            <>
              <label style={labelStyle}>Провайдер</label>
              <select
                value={providerId}
                onChange={e => setProviderId(e.target.value)}
                style={inputStyle}
              >
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </>
          )}

          {mode === 'local' && (
            <>
              <label style={labelStyle}>URL Ollama (необязательно)</label>
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                style={inputStyle}
              />
            </>
          )}

          <label style={labelStyle}>Модель (необязательно)</label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder={mode === 'local' ? 'llama3.1' : 'оставьте пустым — возьмётся из настроек провайдера'}
            style={inputStyle}
          />

          <label style={labelStyle}>Вопрос</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />

          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              marginTop: 12, width: '100%', padding: '8px 16px',
              fontSize: 13, fontWeight: 600, borderRadius: 6,
              cursor: sending ? 'wait' : 'pointer',
              backgroundColor: sending ? 'var(--cc-hover, #2a2b3e)' : '#2AABEE',
              color: sending ? 'var(--cc-text-dim, #888)' : '#fff',
              border: 'none',
            }}
          >
            {sending ? 'Ждём ответа…' : '📤 Спросить'}
          </button>

          {answer && (
            <div style={{
              marginTop: 16, padding: 12, borderRadius: 8,
              backgroundColor: '#22c55e11',
              border: '1px solid #22c55e44',
            }}>
              <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, marginBottom: 6 }}>
                ✅ Ответ ({answer.providerId}, {answer.latencyMs} мс
                {answer.model ? `, модель ${answer.model}` : ''})
              </div>
              <div style={{
                fontSize: 12, color: 'var(--cc-text, #e0e0e0)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflow: 'auto',
              }}>{answer.text}</div>
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 16, padding: 12, borderRadius: 8,
              backgroundColor: '#ff444411',
              border: '1px solid #ff444444',
            }}>
              <div style={{ fontSize: 11, color: '#ff4444', fontWeight: 600, marginBottom: 6 }}>
                ❌ Ошибка: {error.code}
                {error.retryable ? ' (можно повторить)' : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cc-text, #e0e0e0)', whiteSpace: 'pre-wrap' }}>
                {error.message}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
