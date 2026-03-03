// v0.9 — только подключённые провайдеры, кнопка "Добавить ИИ", веб-ссылка для получения ключей
import { useState, useRef, useEffect } from 'react'

const DEFAULT_SYSTEM_PROMPT =
  'Ты — ИИ-помощник менеджера по продажам. Клиент написал сообщение. ' +
  'Предложи РОВНО 3 варианта ответа: кратко (1-2 фразы), развёрнуто (3-4 предложения), официально (деловой тон). ' +
  'Ответ ТОЛЬКО в формате JSON-массива: ["вариант1","вариант2","вариант3"]. ' +
  'Отвечай на том же языке что клиент.'

const PROVIDERS = [
  { id: 'openai',    label: 'OpenAI',    icon: '🌐', defaultModel: 'gpt-4o-mini',              free: false },
  { id: 'anthropic', label: 'Claude',    icon: '🤖', defaultModel: 'claude-haiku-4-5-20251001', free: false },
  { id: 'deepseek',  label: 'DeepSeek',  icon: '🔍', defaultModel: 'deepseek-chat',             free: true  },
  { id: 'gigachat',  label: 'ГигаЧат',   icon: '💬', defaultModel: 'GigaChat',                  free: true  },
]

const MODEL_HINTS = {
  openai:    ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
  deepseek:  ['deepseek-chat', 'deepseek-reasoner'],
  gigachat:  ['GigaChat', 'GigaChat-Plus', 'GigaChat-Pro'],
}

// Ссылки для получения ключей у каждого провайдера
const PROVIDER_URLS = {
  openai:    'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  deepseek:  'https://platform.deepseek.com/api_keys',
  gigachat:  'https://developers.sber.ru/studio',
}

// Читаем конфиг провайдера с учётом aiProviderKeys + активного провайдера
function getProviderCfg(settings, pid) {
  const pKeys = settings.aiProviderKeys || {}
  const active = settings.aiProvider || 'openai'
  if (pid === active) {
    return {
      apiKey: settings.aiApiKey || pKeys[pid]?.apiKey || '',
      clientSecret: settings.aiClientSecret || pKeys[pid]?.clientSecret || '',
      model: settings.aiModel || pKeys[pid]?.model || PROVIDERS.find(p => p.id === pid)?.defaultModel || '',
    }
  }
  return {
    apiKey: pKeys[pid]?.apiKey || '',
    clientSecret: pKeys[pid]?.clientSecret || '',
    model: pKeys[pid]?.model || PROVIDERS.find(p => p.id === pid)?.defaultModel || '',
  }
}

function isProviderConnected(settings, pid) {
  const cfg = getProviderCfg(settings, pid)
  if (pid === 'gigachat') return !!(cfg.apiKey && cfg.clientSecret)
  return !!cfg.apiKey
}

export default function AISidebar({ settings, onSettingsChange, lastMessage, visible, onToggle, width = 300, panelRef, chatHistory = [] }) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [showAddProvider, setShowAddProvider] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [showKey, setShowKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const endRef = useRef(null)

  const provider = settings.aiProvider || 'openai'
  const providerInfo = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0]
  const connectedProviders = PROVIDERS.filter(p => isProviderConnected(settings, p.id))
  const unconnectedProviders = PROVIDERS.filter(p => !isProviderConnected(settings, p.id))

  const providerCfg = getProviderCfg(settings, provider)
  const aiCfg = { provider, systemPrompt: settings.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT, ...providerCfg }

  const isGigaChat = provider === 'gigachat'
  const configured = isProviderConnected(settings, provider)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [suggestions, error])

  useEffect(() => {
    if (lastMessage && visible) {
      setInput(lastMessage)
      setError('')
      setSuggestions([])
    }
  }, [lastMessage, visible])

  // Переключить активный провайдер, сохранив конфиг текущего в aiProviderKeys
  const switchProvider = (newPid) => {
    const pKeys = { ...(settings.aiProviderKeys || {}) }
    const currentPid = settings.aiProvider || 'openai'
    pKeys[currentPid] = {
      apiKey: settings.aiApiKey || '',
      clientSecret: settings.aiClientSecret || '',
      model: settings.aiModel || '',
    }
    const newPk = pKeys[newPid] || {}
    const newModel = newPk.model || PROVIDERS.find(p => p.id === newPid)?.defaultModel || ''
    const newIsConfigured = newPid === 'gigachat'
      ? !!(newPk.apiKey && newPk.clientSecret)
      : !!newPk.apiKey
    onSettingsChange({
      ...settings,
      aiProvider: newPid,
      aiApiKey: newPk.apiKey || '',
      aiClientSecret: newPk.clientSecret || '',
      aiModel: newModel,
      aiProviderKeys: pKeys,
    })
    setShowAddProvider(false)
    setShowConfig(!newIsConfigured) // открыть конфиг если новый провайдер ещё не настроен
  }

  // Обновить настройку + синхронизировать aiProviderKeys
  const set = (key, val) => {
    const updated = { ...settings, [key]: val }
    const pid = updated.aiProvider || 'openai'
    const pKeys = { ...(updated.aiProviderKeys || {}) }
    pKeys[pid] = {
      apiKey: key === 'aiApiKey' ? val : (updated.aiApiKey || ''),
      clientSecret: key === 'aiClientSecret' ? val : (updated.aiClientSecret || ''),
      model: key === 'aiModel' ? val : (updated.aiModel || ''),
    }
    updated.aiProviderKeys = pKeys
    onSettingsChange(updated)
  }

  const generate = async (text) => {
    if (!configured) { setError('Настройте ИИ'); setShowConfig(true); return }
    if (!text.trim()) return
    setLoading(true); setError(''); setSuggestions([])
    try {
      const historyMessages = chatHistory.slice(-6).map(h => ({
        role: 'user',
        content: `[История] ${h.messengerId ? `(${h.messengerId}) ` : ''}${h.text}`
      }))
      const res = await window.api.invoke('ai:generate', {
        messages: [...historyMessages, { role: 'user', content: `Сообщение клиента: "${text.trim()}"` }],
        settings: aiCfg,
      })
      if (!res.ok) { setError(res.error || 'Ошибка ИИ'); return }
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

  const openProviderUrl = () => {
    const url = PROVIDER_URLS[provider]
    if (url) window.api.invoke('shell:open-url', url).catch(() => {})
  }

  return (
    <div
      ref={panelRef}
      className="flex flex-col shrink-0"
      style={{
        width: visible ? `${width}px` : '0px',
        overflow: 'hidden',
        borderLeft: visible ? '1px solid var(--cc-border)' : 'none',
        backgroundColor: 'var(--cc-surface)',
        transition: 'width 0.15s',
      }}
    >
      <div style={{ width: `${width}px`, minWidth: `${width}px` }} className="flex flex-col h-full">

        {/* ── Заголовок ── */}
        <div
          className="flex items-center justify-between px-3 py-2.5 shrink-0"
          style={{ borderBottom: '1px solid var(--cc-border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--cc-text)' }}>ИИ-помощник</span>
            {chatHistory.length > 0 && (
              <span
                className="text-[9px] px-1 py-0.5 rounded-full leading-none"
                style={{ backgroundColor: '#2AABEE22', color: '#2AABEE' }}
                title={`История: ${chatHistory.length} сообщений`}
              >📜{chatHistory.length}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {suggestions.length > 0 && (
              <button
                onClick={() => { setSuggestions([]); setError(''); setInput('') }}
                title="Очистить"
                className="text-xs w-6 h-6 rounded flex items-center justify-center cursor-pointer"
                style={{ color: 'var(--cc-text-dimmer)' }}
              >↺</button>
            )}
            {configured && (
              <button
                onClick={() => { setShowConfig(!showConfig); setShowAddProvider(false) }}
                title="Настройки активного ИИ"
                className="text-sm w-6 h-6 rounded flex items-center justify-center cursor-pointer"
                style={{ color: showConfig ? '#2AABEE' : 'var(--cc-text-dimmer)' }}
              >⚙️</button>
            )}
          </div>
        </div>

        {/* ── Панель провайдеров ── */}
        <div className="px-2 pt-2 pb-1.5 shrink-0" style={{ borderBottom: '1px solid var(--cc-border)' }}>
          {connectedProviders.length > 0 ? (
            <div className="flex items-center gap-1 flex-wrap">
              {connectedProviders.map(p => (
                <button
                  key={p.id}
                  onClick={() => { switchProvider(p.id); setShowConfig(false) }}
                  title={p.label}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                  style={{
                    backgroundColor: provider === p.id ? '#2AABEE22' : 'var(--cc-hover)',
                    border: `1px solid ${provider === p.id ? '#2AABEE66' : 'transparent'}`,
                    color: provider === p.id ? '#2AABEE' : 'var(--cc-text-dim)',
                  }}
                >
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                  {p.free && (
                    <span className="text-[7px] leading-tight" style={{ color: '#22c55e' }}>free</span>
                  )}
                  {provider === p.id && <span className="opacity-70">✓</span>}
                </button>
              ))}

              {/* Кнопка "Добавить ИИ" */}
              <button
                onClick={() => { setShowAddProvider(!showAddProvider); setShowConfig(false) }}
                title="Подключить ещё одного ИИ-провайдера"
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-all"
                style={{
                  backgroundColor: showAddProvider ? '#22c55e22' : 'var(--cc-hover)',
                  border: `1px solid ${showAddProvider ? '#22c55e44' : 'transparent'}`,
                  color: showAddProvider ? '#22c55e' : 'var(--cc-text-dimmer)',
                }}
              >+ ИИ</button>
            </div>
          ) : (
            /* Нет подключённых провайдеров */
            <button
              onClick={() => { setShowAddProvider(!showAddProvider); setShowConfig(false) }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs cursor-pointer transition-all"
              style={{
                backgroundColor: '#2AABEE11',
                border: '1px dashed #2AABEE55',
                color: '#2AABEE',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2AABEE22'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2AABEE11'}
            >
              <span className="text-base">+</span>
              <span>Добавить ИИ-провайдер</span>
            </button>
          )}

          {/* Picker: выбор провайдера для добавления */}
          {showAddProvider && (
            <div className="mt-2">
              {unconnectedProviders.length > 0 ? (
                <div className="grid grid-cols-2 gap-1">
                  {unconnectedProviders.map(p => (
                    <button
                      key={p.id}
                      onClick={() => switchProvider(p.id)}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer text-left transition-all"
                      style={{
                        backgroundColor: 'var(--cc-hover)',
                        border: '1px solid var(--cc-border)',
                        color: 'var(--cc-text-dim)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#2AABEE55'; e.currentTarget.style.backgroundColor = '#2AABEE11' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cc-border)'; e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                    >
                      <span className="text-base leading-none">{p.icon}</span>
                      <div>
                        <div className="font-medium leading-tight">{p.label}</div>
                        {p.free && <div className="text-[9px] leading-tight" style={{ color: '#22c55e' }}>бесплатно</div>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center text-xs py-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>
                  Все провайдеры подключены ✓
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Конфиг-панель ── */}
        {showConfig && (
          <div
            className="px-3 py-3 space-y-2.5 shrink-0 overflow-y-auto"
            style={{ borderBottom: '1px solid var(--cc-border)', backgroundColor: 'var(--cc-surface-alt)', maxHeight: '55%' }}
          >
            {/* Кнопка открыть сайт провайдера */}
            <button
              onClick={openProviderUrl}
              className="flex items-center gap-1.5 text-[11px] cursor-pointer transition-opacity w-full text-left"
              style={{ color: '#2AABEE' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              title={`Открыть сайт ${providerInfo.label} для получения API-ключа`}
            >
              <span>🔗</span>
              <span>Открыть {providerInfo.label} → получить ключ</span>
            </button>

            {/* Модель */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>Модель</div>
              <div className="flex flex-col gap-1">
                {(MODEL_HINTS[provider] || []).map(m => (
                  <button
                    key={m}
                    onClick={() => set('aiModel', m)}
                    className="flex items-center justify-between text-left px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                    style={{
                      backgroundColor: aiCfg.model === m ? '#2AABEE22' : 'var(--cc-hover)',
                      color: aiCfg.model === m ? '#2AABEE' : 'var(--cc-text-dim)',
                      border: `1px solid ${aiCfg.model === m ? '#2AABEE44' : 'transparent'}`,
                    }}
                  >
                    <span>{m}</span>
                    {aiCfg.model === m && <span className="text-[10px]">✓</span>}
                  </button>
                ))}
                <input
                  type="text"
                  value={!MODEL_HINTS[provider]?.includes(aiCfg.model) ? aiCfg.model : ''}
                  onChange={e => set('aiModel', e.target.value)}
                  placeholder="Другая модель..."
                  className="w-full text-xs px-2 py-1 rounded-lg outline-none mt-0.5"
                  style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text-dim)' }}
                />
              </div>
            </div>

            {/* Авторизация */}
            {isGigaChat ? (
              <>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>Client ID</div>
                  <input
                    type="text"
                    value={aiCfg.apiKey}
                    onChange={e => set('aiApiKey', e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
                    style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
                  />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>Client Secret</div>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={aiCfg.clientSecret}
                      onChange={e => set('aiClientSecret', e.target.value)}
                      placeholder="Секретный ключ"
                      className="w-full text-xs px-2 py-1.5 pr-7 rounded-lg outline-none font-mono"
                      style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
                    />
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] cursor-pointer"
                      style={{ color: 'var(--cc-text-dimmer)' }}
                    >{showSecret ? '🙈' : '👁️'}</button>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>API Ключ</div>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={aiCfg.apiKey}
                    onChange={e => set('aiApiKey', e.target.value)}
                    placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                    className="w-full text-xs px-2 py-1.5 pr-7 rounded-lg outline-none font-mono"
                    style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] cursor-pointer"
                    style={{ color: 'var(--cc-text-dimmer)' }}
                  >{showKey ? '🙈' : '👁️'}</button>
                </div>
              </div>
            )}

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

        {/* ── Тело ── */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">

          {!configured && !showConfig && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="text-4xl mb-3">{providerInfo.icon}</div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--cc-text-dim)' }}>
                {connectedProviders.length === 0 ? 'Нет подключённых ИИ' : `${providerInfo.label} не настроен`}
              </p>
              <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--cc-text-dimmer)' }}>
                {isGigaChat ? 'Нужен Client ID и Client Secret' : 'Нужен API-ключ для работы'}
              </p>
              <button
                onClick={() => setShowConfig(true)}
                className="px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all"
                style={{ backgroundColor: '#2AABEE22', color: '#2AABEE', border: '1px solid #2AABEE44' }}
              >Настроить ⚙️</button>
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
              <div className="text-2xl mb-2 animate-pulse">{providerInfo.icon}</div>
              <p className="text-xs" style={{ color: 'var(--cc-text-dim)' }}>Генерирую варианты...</p>
            </div>
          )}

          {error && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
              ⚠️ {error}
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

        {/* ── Ввод ── */}
        <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--cc-border)' }}>
          <div className="flex gap-2">
            <textarea
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
