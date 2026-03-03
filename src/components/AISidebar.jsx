// v0.6 — Панель ИИ-помощника (OpenAI / Anthropic)
import { useState, useRef, useEffect } from 'react'

const DEFAULT_SYSTEM_PROMPT =
  'Ты — ИИ-помощник менеджера по продажам. Клиент написал сообщение. ' +
  'Предложи РОВНО 3 варианта ответа: кратко (1-2 фразы), развёрнуто (3-4 предложения), официально (деловой тон). ' +
  'Ответ ТОЛЬКО в формате JSON-массива: ["вариант1","вариант2","вариант3"]. ' +
  'Отвечай на том же языке что клиент.'

function Toggle({ value, onChange, color = '#2AABEE' }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-9 h-5 rounded-full transition-all duration-200 cursor-pointer shrink-0"
      style={{ backgroundColor: value ? color : 'var(--cc-hover)' }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
        style={{ left: value ? '16px' : '2px' }}
      />
    </button>
  )
}

export default function AISidebar({ settings, onSettingsChange, lastMessage, visible, onToggle }) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const inputRef = useRef(null)
  const endRef = useRef(null)

  const aiCfg = {
    provider: settings.aiProvider || 'openai',
    model: settings.aiModel || (settings.aiProvider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini'),
    apiKey: settings.aiApiKey || '',
    systemPrompt: settings.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT,
  }

  const configured = !!aiCfg.apiKey

  // Авто-прокрутка
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [suggestions, error])

  // Авто-подстановка нового входящего сообщения
  useEffect(() => {
    if (lastMessage && visible) {
      setInput(lastMessage)
      setError('')
      setSuggestions([])
    }
  }, [lastMessage, visible])

  const generate = async (text) => {
    if (!configured) { setError('Добавьте API-ключ в настройках ИИ'); setShowConfig(true); return }
    if (!text.trim()) return

    setLoading(true)
    setError('')
    setSuggestions([])

    try {
      const res = await window.api.invoke('ai:generate', {
        messages: [{ role: 'user', content: `Сообщение клиента: "${text.trim()}"` }],
        settings: aiCfg,
      })

      if (!res.ok) { setError(res.error || 'Ошибка ИИ'); return }

      // Парсим JSON-массив из ответа
      let parsed = []
      try {
        const match = res.result.match(/\[[\s\S]*?\]/)
        if (match) parsed = JSON.parse(match[0])
        else parsed = [res.result]
      } catch { parsed = [res.result] }

      setSuggestions(parsed.slice(0, 3).filter(Boolean))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    generate(text)
  }

  const copySuggestion = async (text, idx) => {
    try { await navigator.clipboard.writeText(text) } catch {}
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const set = (key, val) => onSettingsChange({ ...settings, [key]: val })

  return (
    <div
      className="flex flex-col shrink-0 transition-all duration-200"
      style={{
        width: visible ? '300px' : '0px',
        overflow: 'hidden',
        borderLeft: visible ? '1px solid var(--cc-border)' : 'none',
        backgroundColor: 'var(--cc-surface)',
      }}
    >
      <div style={{ width: '300px' }} className="flex flex-col h-full">

        {/* Заголовок */}
        <div
          className="flex items-center justify-between px-3 py-2.5 shrink-0"
          style={{ borderBottom: '1px solid var(--cc-border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--cc-text)' }}>ИИ-помощник</span>
            {configured && <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="Настроен" />}
          </div>
          <div className="flex items-center gap-1">
            {suggestions.length > 0 && (
              <button
                onClick={() => { setSuggestions([]); setError(''); setInput('') }}
                title="Очистить"
                className="text-xs w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer"
                style={{ color: 'var(--cc-text-dimmer)' }}
              >↺</button>
            )}
            <button
              onClick={() => setShowConfig(!showConfig)}
              title="Настройки ИИ"
              className="text-sm w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer"
              style={{ color: showConfig ? '#2AABEE' : 'var(--cc-text-dimmer)' }}
            >⚙️</button>
          </div>
        </div>

        {/* Конфиг-панель */}
        {showConfig && (
          <div
            className="px-3 py-3 space-y-2.5 shrink-0"
            style={{ borderBottom: '1px solid var(--cc-border)', backgroundColor: 'var(--cc-surface-alt)' }}
          >
            {/* Провайдер */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>Провайдер</div>
              <div className="flex gap-1">
                {[['openai', 'OpenAI'], ['anthropic', 'Anthropic']].map(([p, label]) => (
                  <button
                    key={p}
                    onClick={() => set('aiProvider', p)}
                    className="flex-1 py-1 text-xs rounded-lg transition-colors cursor-pointer"
                    style={{
                      backgroundColor: aiCfg.provider === p ? '#2AABEE22' : 'var(--cc-hover)',
                      color: aiCfg.provider === p ? '#2AABEE' : 'var(--cc-text-dim)',
                      border: `1px solid ${aiCfg.provider === p ? '#2AABEE55' : 'transparent'}`
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Модель */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>Модель</div>
              <input
                type="text"
                value={aiCfg.model}
                onChange={e => set('aiModel', e.target.value)}
                placeholder={aiCfg.provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini'}
                className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
                style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
              />
            </div>

            {/* API ключ */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>API Ключ</div>
              <input
                type="password"
                value={aiCfg.apiKey}
                onChange={e => set('aiApiKey', e.target.value)}
                placeholder="sk-... или sk-ant-..."
                className="w-full text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
                style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
              />
            </div>

            {/* Системный промпт */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>Системный промпт</div>
              <textarea
                value={aiCfg.systemPrompt}
                onChange={e => set('aiSystemPrompt', e.target.value)}
                rows={3}
                className="w-full text-[11px] px-2 py-1.5 rounded-lg outline-none resize-none leading-relaxed"
                style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
              />
            </div>
          </div>
        )}

        {/* Тело */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">

          {!configured && !showConfig && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--cc-text-dim)' }}>ИИ не настроен</p>
              <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--cc-text-dimmer)' }}>
                Добавьте API-ключ OpenAI<br />или Anthropic для работы
              </p>
              <button
                onClick={() => setShowConfig(true)}
                className="px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all"
                style={{ backgroundColor: '#2AABEE22', color: '#2AABEE', border: '1px solid #2AABEE44' }}
              >Настроить</button>
            </div>
          )}

          {configured && suggestions.length === 0 && !loading && !error && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="text-3xl mb-3">💬</div>
              <p className="text-sm" style={{ color: 'var(--cc-text-dim)' }}>Вставьте текст клиента</p>
              <p className="text-xs mt-1" style={{ color: 'var(--cc-text-dimmer)' }}>Получите 3 варианта ответа</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="text-2xl mb-2 animate-pulse">🤖</div>
              <p className="text-xs" style={{ color: 'var(--cc-text-dim)' }}>Генерирую варианты...</p>
            </div>
          )}

          {error && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
              {error}
            </div>
          )}

          {suggestions.map((s, i) => (
            <div
              key={i}
              className="rounded-xl p-3 cursor-pointer transition-all"
              style={{
                backgroundColor: 'var(--cc-surface-alt)',
                border: `1px solid ${copiedIdx === i ? '#22c55e55' : 'var(--cc-border)'}`,
              }}
              onClick={() => copySuggestion(s, i)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--cc-text-dimmer)' }}>
                  {['Кратко', 'Развёрнуто', 'Официально'][i] || `Вариант ${i + 1}`}
                </span>
                <span className="text-[10px]" style={{ color: copiedIdx === i ? '#22c55e' : 'var(--cc-text-dimmer)' }}>
                  {copiedIdx === i ? '✓ скопировано' : '↓ нажми'}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--cc-text)' }}>{s}</p>
            </div>
          ))}

          <div ref={endRef} />
        </div>

        {/* Ввод */}
        <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--cc-border)' }}>
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Вставьте сообщение клиента..."
              rows={2}
              className="flex-1 text-xs px-2.5 py-2 rounded-lg resize-none outline-none leading-relaxed"
              style={{ backgroundColor: 'var(--cc-surface-alt)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="px-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer self-end py-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#2AABEE', color: '#fff' }}
            >→</button>
          </div>
          <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--cc-text-dimmer)' }}>
            Enter — отправить · Shift+Enter — перенос
          </p>
        </div>
      </div>
    </div>
  )
}
