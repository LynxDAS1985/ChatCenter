// v1.1.15: проверка AI Bridge через UI (не unit-тесты, не DevTools).
//
// Открывает форму «задай AI вопрос → получи ответ». Используется до Этапа 7
// (постоянная панель в AISidebar) чтобы юзер мог проверить что bridge работает.
//
// Все логи идут через window.api.send('app:log', ...) → попадают в «📒 Логи ChatCenter».
//
// Открывается из AISidebar по кнопке 🤖 рядом с настройками.

import { useState } from 'react'
// v1.1.17 (Этап 8): редактор кастомных селекторов для AI сайтов.
import AiSelectorsEditor from './AiSelectorsEditor.jsx'
// v1.2.1: сборка fallback chain из настроек.
import { buildAutoChain } from '../utils/aiBridge/buildAutoChain.js'

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
    window.api?.send?.('app:log', { level, message: '[ai-bridge-check] ' + message })
  } catch (_) { /* лог-вьюер не работает — это сам проверочный экран, фолбэк не нужен */ }
}

export default function AiBridgeCheck({ onClose, settings, onSettingsChange }) {
  const [mode, setMode] = useState('local')
  const [selectorsEditorOpen, setSelectorsEditorOpen] = useState(false)  // v1.1.17
  const [useFallbackChain, setUseFallbackChain] = useState(false)  // v1.2.1
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
    log('INFO', `start mode=${mode}` + (needsProvider ? ` providerId=${providerId}` : '') + ` text.length=${text.length}` + (useFallbackChain ? ' chain=auto' : ''))
    const config = {}
    if (needsProvider) config.providerId = providerId
    if (mode === 'local' && baseUrl) config.baseUrl = baseUrl
    if (model.trim()) config.model = model.trim()
    // v1.1.17: для webui передаём кастомные селекторы из settings (если юзер настроил).
    if (mode === 'webui' && settings?.aiBridgeSelectors?.[providerId]) {
      config.selectors = settings.aiBridgeSelectors[providerId]
    }
    // v1.2.1: если включён авто-резерв — собираем chain из доступных провайдеров.
    const payload = {
      question: {
        version: 1,
        text,
        source: { messengerId: 'native_cc' },
      },
    }
    if (useFallbackChain) {
      payload.chain = buildAutoChain(settings, {
        mode,
        providerId: needsProvider ? providerId : undefined,
        config,
      })
      log('INFO', `chain length=${payload.chain.length}`)
    } else {
      payload.mode = mode
      payload.config = config
    }
    try {
      const r = await window.api.invoke('ai-bridge:send', payload)
      log('INFO', `result ok=${r?.ok} latencyMs=${r?.latencyMs}` + (r?.error ? ` errorCode=${r.error.code}` : ''))
      if (r?.ok) {
        setAnswer(r)
      } else {
        // v1.2.1: при ошибке тоже передаём debug.attemptedFallbacks в state для отображения.
        setError({ ...(r?.error || { code: 'unknown', message: 'неизвестная ошибка' }),
                   _debug: r?.debug })
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
            🤖 Проверка AI
          </span>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
            backgroundColor: 'var(--cc-hover, #2a2b3e)', color: '#ff4444', fontSize: 16,
          }}>✕</button>
        </div>

        <div style={{ padding: 16, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--cc-text-dimmer, #777)', marginBottom: 12 }}>
            Задайте AI вопрос и получите ответ. Все этапы пишутся в стандартный лог
            (📒 Логи ChatCenter — откройте после закрытия этого окна).
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

          {mode === 'webui' && onSettingsChange && (
            <button
              onClick={() => setSelectorsEditorOpen(true)}
              title="Настроить CSS селекторы для AI сайтов (если сайт обновился)"
              style={{
                marginTop: 8, padding: '6px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                backgroundColor: 'var(--cc-hover, #2a2b3e)',
                color: 'var(--cc-text-dim, #aaa)',
                border: '1px solid var(--cc-border, #333)',
                width: '100%',
              }}
            >
              🔧 Настроить селекторы AI сайтов
              {settings?.aiBridgeSelectors?.[providerId] ? ' ✓ есть кастомные' : ''}
            </button>
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

          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useFallbackChain}
              onChange={e => setUseFallbackChain(e.target.checked)}
              style={{ margin: 0 }}
            />
            🔁 Использовать авто-резерв (если основной AI не ответит — попробуй следующий)
          </label>

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
              {/* v1.2.1: если был fallback — показать список попыток */}
              {answer.debug?.attemptedFallbacks?.length > 0 && (
                <div style={{ fontSize: 10, color: '#eab308', marginBottom: 6 }}>
                  🔁 Авто-резерв сработал. Опробовано до успеха:{' '}
                  {answer.debug.attemptedFallbacks.map((a, i) => (
                    <span key={i}>
                      {i > 0 ? ' → ' : ''}
                      <span style={{ color: '#ff8a8a' }}>
                        {a.mode}{a.providerId ? `:${a.providerId}` : ''} ({a.errorCode})
                      </span>
                    </span>
                  ))}
                  {' → '}
                  <span style={{ color: '#22c55e' }}>
                    {answer.mode}{answer.providerId ? `:${answer.providerId}` : ''}
                  </span>
                </div>
              )}
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
              {/* v1.2.1: если был запущен fallback chain и все упали — показать список попыток */}
              {error._debug?.attemptedFallbacks?.length > 0 && (
                <div style={{ fontSize: 10, color: '#eab308', marginTop: 8 }}>
                  🔁 Все варианты опробованы:{' '}
                  {error._debug.attemptedFallbacks.map((a, i) => (
                    <span key={i}>
                      {i > 0 ? ', ' : ''}
                      {a.mode}{a.providerId ? `:${a.providerId}` : ''} ({a.errorCode})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* v1.1.17 (Этап 8): редактор кастомных селекторов AI сайтов */}
      {selectorsEditorOpen && onSettingsChange && (
        <AiSelectorsEditor
          settings={settings || {}}
          onSettingsChange={onSettingsChange}
          onClose={() => setSelectorsEditorOpen(false)}
          initialProviderId={needsProvider ? providerId : undefined}
        />
      )}
    </div>
  )
}
