// v0.12.0 — Per-provider режимы (API / WebView) в настройках каждого провайдера
import { useState, useRef, useEffect } from 'react'

// Паттерны распознавания API-ключей в буфере обмена
function looksLikeApiKey(provider, text) {
  if (!text || text.length < 20) return false
  const t = text.trim()
  if (provider === 'openai')    return /^sk-[a-zA-Z0-9_\-]{20,}$/.test(t)
  if (provider === 'anthropic') return /^sk-ant-[a-zA-Z0-9_\-]{20,}$/.test(t)
  if (provider === 'deepseek')  return /^sk-[a-zA-Z0-9_\-]{20,}$/.test(t)
  if (provider === 'gigachat')  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(t)
  return t.startsWith('sk-') && t.length > 20
}

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

// URL по умолчанию для каждого провайдера в WebView-режиме
const DEFAULT_WEBVIEW_URLS = {
  openai:    'https://chat.openai.com',
  anthropic: 'https://claude.ai',
  deepseek:  'https://chat.deepseek.com',
  gigachat:  'https://giga.chat',
}

const MODEL_HINTS = {
  openai:    ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
  deepseek:  ['deepseek-chat', 'deepseek-reasoner'],
  gigachat:  ['GigaChat', 'GigaChat-Plus', 'GigaChat-Pro'],
}

const PROVIDER_URLS = {
  openai:    'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  deepseek:  'https://platform.deepseek.com/api_keys',
  gigachat:  'https://developers.sber.ru/studio',
}

function getProviderCfg(settings, pid) {
  const pKeys = settings.aiProviderKeys || {}
  const pData = pKeys[pid] || {}
  const active = settings.aiProvider || 'openai'
  const base = {
    mode:         pData.mode         || 'api',
    webviewUrl:   pData.webviewUrl   || DEFAULT_WEBVIEW_URLS[pid] || '',
    contextMode:  pData.contextMode  || 'last',
    model:        pData.model        || PROVIDERS.find(p => p.id === pid)?.defaultModel || '',
    apiKey:       pData.apiKey       || '',
    clientSecret: pData.clientSecret || '',
  }
  if (pid === active) {
    return {
      ...base,
      apiKey:       settings.aiApiKey       || base.apiKey,
      clientSecret: settings.aiClientSecret || base.clientSecret,
      model:        settings.aiModel        || base.model,
    }
  }
  return base
}

function isProviderConnected(settings, pid) {
  const cfg = getProviderCfg(settings, pid)
  if (cfg.mode === 'webview') return true
  if (pid === 'gigachat') return !!(cfg.apiKey && cfg.clientSecret)
  return !!cfg.apiKey
}

export default function AISidebar({ settings, onSettingsChange, lastMessage, visible, onToggle, width = 300, panelRef, chatHistory = [], activeMessengerId = null }) {

  // ── Состояния API-режима ──────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [error, setError] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [showAddProvider, setShowAddProvider] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [showKey, setShowKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState(null)
  const [waitingForKey, setWaitingForKey] = useState(false)
  const [keyFoundMsg, setKeyFoundMsg] = useState('')

  // ── Состояния WebView-режима ──────────────────────────────────────────────
  const [contextSendStatus, setContextSendStatus] = useState(null) // null | 'sent' | 'copied' | 'empty'

  const endRef = useRef(null)
  const savedTimerRef = useRef(null)
  const pollingRef = useRef(null)
  const unsubLoginRef = useRef(null)
  const streamBufferRef = useRef('')
  const streamUnsubsRef = useRef([])
  const prevMessengerIdRef = useRef(null)
  const aiWebviewRef = useRef(null)

  // ── Настройки (shortcuts) ─────────────────────────────────────────────────
  const provider = settings.aiProvider || 'openai'
  const providerInfo = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0]
  const connectedProviders = PROVIDERS.filter(p => isProviderConnected(settings, p.id))
  const unconnectedProviders = PROVIDERS.filter(p => !isProviderConnected(settings, p.id))
  const providerCfg = getProviderCfg(settings, provider)
  const providerMode = providerCfg.mode       // 'api' | 'webview'
  const webviewUrl  = providerCfg.webviewUrl  // URL для WebView
  const contextMode = providerCfg.contextMode // 'none' | 'last' | 'full'
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

  // ── Переключение провайдера ───────────────────────────────────────────────
  const switchProvider = (newPid) => {
    const pKeys = { ...(settings.aiProviderKeys || {}) }
    const currentPid = settings.aiProvider || 'openai'
    // Сохраняем все настройки текущего провайдера (включая mode/webviewUrl/contextMode)
    pKeys[currentPid] = {
      ...(pKeys[currentPid] || {}),
      apiKey:       settings.aiApiKey       || '',
      clientSecret: settings.aiClientSecret || '',
      model:        settings.aiModel        || '',
    }
    const newPk = pKeys[newPid] || {}
    const newModel = newPk.model || PROVIDERS.find(p => p.id === newPid)?.defaultModel || ''
    const newIsConfigured = newPk.mode === 'webview'
      ? true
      : newPid === 'gigachat'
        ? !!(newPk.apiKey && newPk.clientSecret)
        : !!newPk.apiKey
    onSettingsChange({
      ...settings,
      aiProvider:     newPid,
      aiApiKey:       newPk.apiKey       || '',
      aiClientSecret: newPk.clientSecret || '',
      aiModel:        newModel,
      aiProviderKeys: pKeys,
    })
    setShowAddProvider(false)
    setShowConfig(!newIsConfigured)
  }

  // Сохранение API-настроек (aiApiKey / aiModel / aiClientSecret / aiSystemPrompt)
  const set = (key, val) => {
    const updated = { ...settings, [key]: val }
    const pid = updated.aiProvider || 'openai'
    const pKeys = { ...(updated.aiProviderKeys || {}) }
    pKeys[pid] = {
      ...(pKeys[pid] || {}),
      apiKey:       key === 'aiApiKey'       ? val : (updated.aiApiKey       || ''),
      clientSecret: key === 'aiClientSecret' ? val : (updated.aiClientSecret || ''),
      model:        key === 'aiModel'        ? val : (updated.aiModel        || ''),
    }
    updated.aiProviderKeys = pKeys
    onSettingsChange(updated)
    clearTimeout(savedTimerRef.current)
    setJustSaved(true)
    setTestStatus(null)
    savedTimerRef.current = setTimeout(() => setJustSaved(false), 2500)
  }

  // Сохранение per-provider свойств (mode / webviewUrl / contextMode)
  const setProviderProp = (key, val) => {
    const pid = settings.aiProvider || 'openai'
    const pKeys = { ...(settings.aiProviderKeys || {}) }
    pKeys[pid] = { ...(pKeys[pid] || {}), [key]: val }
    onSettingsChange({ ...settings, aiProviderKeys: pKeys })
  }

  const testConnection = async () => {
    if (!configured) return
    setTesting(true)
    setTestStatus(null)
    setError('')
    try {
      const res = await window.api.invoke('ai:generate', {
        messages: [{ role: 'user', content: 'Напиши только: ok' }],
        settings: { ...aiCfg, systemPrompt: 'Ответь только словом: ok' },
      })
      setTestStatus(res.ok ? 'ok' : 'fail')
      if (!res.ok) setError(res.error || 'Ошибка проверки')
    } catch (e) {
      setTestStatus('fail')
      setError(e.message)
    } finally {
      setTesting(false)
    }
  }

  // ── Автосохранение черновика ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeMessengerId) return
    const key = `ai-draft:${activeMessengerId}`
    if (input) localStorage.setItem(key, input)
    else localStorage.removeItem(key)
  }, [input, activeMessengerId])

  useEffect(() => {
    if (prevMessengerIdRef.current === activeMessengerId) return
    prevMessengerIdRef.current = activeMessengerId
    if (activeMessengerId) {
      const draft = localStorage.getItem(`ai-draft:${activeMessengerId}`) || ''
      setInput(draft)
    }
  }, [activeMessengerId])

  useEffect(() => {
    return () => { streamUnsubsRef.current.forEach(fn => fn?.()); streamUnsubsRef.current = [] }
  }, [])

  useEffect(() => {
    return () => { clearInterval(pollingRef.current); unsubLoginRef.current?.() }
  }, [])

  const openLoginWindow = async () => {
    if (waitingForKey) {
      clearInterval(pollingRef.current)
      unsubLoginRef.current?.()
      setWaitingForKey(false)
      return
    }
    const capturedProvider = provider
    const capturedLabel = providerInfo.label
    await window.api.invoke('ai-login:open', {
      url: PROVIDER_URLS[capturedProvider],
      provider: capturedProvider,
      providerLabel: capturedLabel,
    }).catch(() => {})
    setWaitingForKey(true)
    setKeyFoundMsg('')
    unsubLoginRef.current = window.api.on('ai-login:closed', ({ provider: closedProvider }) => {
      if (closedProvider !== capturedProvider) return
      clearInterval(pollingRef.current)
      unsubLoginRef.current?.()
      setWaitingForKey(false)
    })
    let previousClipboard = ''
    try { previousClipboard = (await window.api.invoke('clipboard:read')) || '' } catch {}
    pollingRef.current = setInterval(async () => {
      try {
        const text = (await window.api.invoke('clipboard:read')) || ''
        const trimmed = text.trim()
        if (trimmed === previousClipboard) return
        previousClipboard = trimmed
        if (looksLikeApiKey(capturedProvider, trimmed)) {
          clearInterval(pollingRef.current)
          unsubLoginRef.current?.()
          set('aiApiKey', trimmed)
          setWaitingForKey(false)
          setKeyFoundMsg('✓ API-ключ найден и сохранён автоматически!')
          setTimeout(() => setKeyFoundMsg(''), 6000)
        }
      } catch {}
    }, 800)
  }

  // ── Стриминг AI (SSE) ─────────────────────────────────────────────────────
  const generateStreaming = (text) => {
    if (!configured) { setError('Настройте ИИ'); setShowConfig(true); return }
    if (!text.trim()) return
    streamUnsubsRef.current.forEach(fn => fn?.())
    streamUnsubsRef.current = []
    setLoading(true); setIsStreaming(false); setError('')
    setSuggestions([]); setStreamBuffer(''); streamBufferRef.current = ''
    const requestId = `req-${Date.now()}`
    const historyMessages = chatHistory.slice(-6).map(h => ({
      role: 'user',
      content: `[История] ${h.messengerId ? `(${h.messengerId}) ` : ''}${h.text}`
    }))
    const cleanup = () => { streamUnsubsRef.current.forEach(fn => fn?.()); streamUnsubsRef.current = [] }
    const finalize = () => {
      cleanup()
      let parsed = []
      try {
        const match = streamBufferRef.current.match(/\[[\s\S]*?\]/)
        if (match) parsed = JSON.parse(match[0])
        else parsed = [streamBufferRef.current]
      } catch { parsed = [streamBufferRef.current] }
      setSuggestions(parsed.slice(0, 3).filter(Boolean))
      setStreamBuffer(''); streamBufferRef.current = ''
      setIsStreaming(false); setLoading(false)
    }
    const unsubChunk = window.api.on('ai:stream-chunk', ({ requestId: rid, chunk }) => {
      if (rid !== requestId) return
      streamBufferRef.current += chunk
      setStreamBuffer(streamBufferRef.current)
      setIsStreaming(true)
    })
    const unsubDone = window.api.on('ai:stream-done', ({ requestId: rid }) => {
      if (rid !== requestId) return
      finalize()
    })
    const unsubError = window.api.on('ai:stream-error', ({ requestId: rid, error }) => {
      if (rid !== requestId) return
      cleanup()
      setError(error); setStreamBuffer(''); streamBufferRef.current = ''
      setIsStreaming(false); setLoading(false)
    })
    streamUnsubsRef.current = [unsubChunk, unsubDone, unsubError]
    window.api.send('ai:generate-stream', {
      messages: [...historyMessages, { role: 'user', content: `Сообщение клиента: "${text.trim()}"` }],
      settings: aiCfg,
      requestId,
    })
  }

  // Оставляем для testConnection
  const generate = async (text) => {
    if (!configured) { setError('Настройте ИИ'); setShowConfig(true); return }
    if (!text.trim()) return
    setLoading(true); setError(''); setSuggestions([])
    try {
      const res = await window.api.invoke('ai:generate', {
        messages: [{ role: 'user', content: `Сообщение клиента: "${text.trim()}"` }],
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
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading || isStreaming) return
    setInput('')
    generateStreaming(text)
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

  // ── Отправка контекста чата в WebView AI ─────────────────────────────────
  const sendContextToAiWebview = async () => {
    if (contextMode === 'none') {
      setContextSendStatus('empty')
      setTimeout(() => setContextSendStatus(null), 2000)
      return
    }

    let contextText = ''
    if (contextMode === 'last') {
      if (lastMessage) contextText = `Сообщение клиента: "${lastMessage}"`
    } else if (contextMode === 'full') {
      if (chatHistory.length > 0) {
        contextText = 'История переписки с клиентом:\n' +
          chatHistory.slice(-10).map((h, i) => `${i + 1}. ${h.text}`).join('\n')
      } else if (lastMessage) {
        contextText = `Сообщение клиента: "${lastMessage}"`
      }
    }

    if (!contextText) {
      setContextSendStatus('empty')
      setTimeout(() => setContextSendStatus(null), 2000)
      return
    }

    const wv = aiWebviewRef.current
    let inserted = false
    if (wv) {
      try {
        const escaped = JSON.stringify(contextText)
        const script = `(function(){
          const t=${escaped};
          const sels=['textarea','[contenteditable="true"]','#prompt-textarea','.chat-input textarea','[data-testid="message-input"]'];
          for(const s of sels){
            const el=document.querySelector(s);
            if(el){
              el.focus();
              if(document.execCommand('insertText',false,t))return true;
              try{
                const s2=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')?.set;
                if(s2){s2.call(el,t);el.dispatchEvent(new Event('input',{bubbles:true}));return true;}
              }catch(e2){}
              return true;
            }
          }
          return false;
        })()`
        inserted = await wv.executeJavaScript(script)
      } catch {}
    }

    if (!inserted) {
      try { await navigator.clipboard.writeText(contextText) } catch {}
      setContextSendStatus('copied')
    } else {
      setContextSendStatus('sent')
    }
    setTimeout(() => setContextSendStatus(null), 3000)
  }

  // ── Рендер ────────────────────────────────────────────────────────────────
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
            {chatHistory.length > 0 && providerMode === 'api' && (
              <span
                className="text-[9px] px-1 py-0.5 rounded-full leading-none"
                style={{ backgroundColor: '#2AABEE22', color: '#2AABEE' }}
                title={`История: ${chatHistory.length} сообщений`}
              >📜{chatHistory.length}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {providerMode === 'api' && suggestions.length > 0 && (
              <button
                onClick={() => { setSuggestions([]); setError(''); setInput('') }}
                title="Очистить"
                className="text-xs w-6 h-6 rounded flex items-center justify-center cursor-pointer"
                style={{ color: 'var(--cc-text-dimmer)' }}
              >↺</button>
            )}
            {/* ⚙️ всегда видна */}
            <button
              onClick={() => { setShowConfig(!showConfig); setShowAddProvider(false) }}
              title="Настройки ИИ-помощника"
              className="text-sm w-6 h-6 rounded flex items-center justify-center cursor-pointer"
              style={{ color: showConfig ? '#2AABEE' : 'var(--cc-text-dimmer)' }}
            >⚙️</button>
          </div>
        </div>

        {/* ── Панель провайдеров (всегда видна) ── */}
        <div className="px-2 pt-2 pb-1.5 shrink-0" style={{ borderBottom: '1px solid var(--cc-border)' }}>
          {connectedProviders.length > 0 ? (
            <div className="flex items-center gap-1 flex-wrap">
              {connectedProviders.map(p => {
                const pCfg = getProviderCfg(settings, p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => { switchProvider(p.id); setShowConfig(false) }}
                    title={`${p.label} (${pCfg.mode === 'webview' ? 'Веб-интерфейс' : 'API-ключ'})`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                    style={{
                      backgroundColor: provider === p.id ? '#2AABEE22' : 'var(--cc-hover)',
                      border: `1px solid ${provider === p.id ? '#2AABEE66' : 'transparent'}`,
                      color: provider === p.id ? '#2AABEE' : 'var(--cc-text-dim)',
                    }}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                    {p.free && <span className="text-[7px] leading-tight" style={{ color: '#22c55e' }}>free</span>}
                    <span className="text-[9px] opacity-60">{pCfg.mode === 'webview' ? '🌐' : '🔧'}</span>
                    {provider === p.id && <span className="opacity-70">✓</span>}
                  </button>
                )
              })}
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
            <button
              onClick={() => { setShowAddProvider(!showAddProvider); setShowConfig(false) }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs cursor-pointer transition-all"
              style={{ backgroundColor: '#2AABEE11', border: '1px dashed #2AABEE55', color: '#2AABEE' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2AABEE22'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2AABEE11'}
            >
              <span className="text-base">+</span>
              <span>Добавить ИИ-провайдер</span>
            </button>
          )}

          {showAddProvider && (
            <div className="mt-2">
              {unconnectedProviders.length > 0 ? (
                <div className="grid grid-cols-2 gap-1">
                  {unconnectedProviders.map(p => (
                    <button
                      key={p.id}
                      onClick={() => switchProvider(p.id)}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer text-left transition-all"
                      style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text-dim)' }}
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

        {/* ── Конфиг-панель (per-provider) ── */}
        {showConfig && (
          <div
            className="px-3 py-3 space-y-2.5 shrink-0 overflow-y-auto"
            style={{ borderBottom: '1px solid var(--cc-border)', backgroundColor: 'var(--cc-surface-alt)', maxHeight: '60%' }}
          >
            {/* Переключатель режима провайдера */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>
                Режим {providerInfo.label}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setProviderProp('mode', 'api')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
                  style={{
                    backgroundColor: providerMode === 'api' ? '#2AABEE22' : 'var(--cc-hover)',
                    border: `1.5px solid ${providerMode === 'api' ? '#2AABEE66' : 'transparent'}`,
                    color: providerMode === 'api' ? '#2AABEE' : 'var(--cc-text-dimmer)',
                  }}
                >
                  <span>🔧</span>
                  <span>API-ключ</span>
                  {providerMode === 'api' && <span className="text-[10px]">✓</span>}
                </button>
                <button
                  onClick={() => setProviderProp('mode', 'webview')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
                  style={{
                    backgroundColor: providerMode === 'webview' ? '#2AABEE22' : 'var(--cc-hover)',
                    border: `1.5px solid ${providerMode === 'webview' ? '#2AABEE66' : 'transparent'}`,
                    color: providerMode === 'webview' ? '#2AABEE' : 'var(--cc-text-dimmer)',
                  }}
                >
                  <span>🌐</span>
                  <span>Веб-интерфейс</span>
                  {providerMode === 'webview' && <span className="text-[10px]">✓</span>}
                </button>
              </div>
            </div>

            {/* ── API режим: ключ/модель/промпт ── */}
            {providerMode === 'api' && (
              <>
                <div
                  className="text-[11px] px-2.5 py-2 rounded-lg leading-relaxed"
                  style={{ backgroundColor: '#2AABEE0D', border: '1px solid #2AABEE22', color: 'var(--cc-text-dim)' }}
                >
                  <div className="font-semibold mb-0.5" style={{ color: '#2AABEE' }}>ℹ️ Как подключить ИИ?</div>
                  <div style={{ color: 'var(--cc-text-dimmer)' }}>
                    Войти через email/пароль невозможно — все AI-провайдеры работают только через <strong style={{ color: 'var(--cc-text-dim)' }}>API-ключ</strong>.
                    Зарегистрируйтесь на сайте провайдера, создайте ключ и вставьте его ниже.
                  </div>
                </div>

                <button
                  onClick={openLoginWindow}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-medium cursor-pointer transition-all"
                  style={{
                    backgroundColor: waitingForKey ? '#f59e0b22' : '#2AABEE22',
                    border: `1.5px solid ${waitingForKey ? '#f59e0b66' : '#2AABEE66'}`,
                    color: waitingForKey ? '#f59e0b' : '#2AABEE',
                  }}
                  onMouseEnter={e => { if (!waitingForKey) e.currentTarget.style.backgroundColor = '#2AABEE33' }}
                  onMouseLeave={e => { if (!waitingForKey) e.currentTarget.style.backgroundColor = '#2AABEE22' }}
                >
                  {waitingForKey ? (
                    <><span className="animate-pulse text-base">⏳</span><span>Ожидаем ключ из буфера... (нажмите для отмены)</span></>
                  ) : (
                    <><span className="text-base">🔑</span><span>Войти через браузер → ключ вставится сам</span></>
                  )}
                </button>

                {keyFoundMsg && (
                  <div className="text-[11px] px-2.5 py-2 rounded-lg text-center font-medium"
                    style={{ backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>
                    {keyFoundMsg}
                  </div>
                )}

                <button
                  onClick={openProviderUrl}
                  className="flex items-center gap-1.5 text-[10px] cursor-pointer transition-opacity w-full text-left"
                  style={{ color: 'var(--cc-text-dimmer)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#2AABEE'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--cc-text-dimmer)'}
                >
                  <span>↗</span>
                  <span>Открыть {providerInfo.label} в системном браузере (вручную)</span>
                </button>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>Модель</div>
                  <div className="flex flex-col gap-1">
                    {(MODEL_HINTS[provider] || []).map(m => (
                      <button key={m} onClick={() => set('aiModel', m)}
                        className="flex items-center justify-between text-left px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                        style={{
                          backgroundColor: aiCfg.model === m ? '#2AABEE22' : 'var(--cc-hover)',
                          color: aiCfg.model === m ? '#2AABEE' : 'var(--cc-text-dim)',
                          border: `1px solid ${aiCfg.model === m ? '#2AABEE44' : 'transparent'}`,
                        }}>
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

                {isGigaChat ? (
                  <>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>Client ID</div>
                      <input type="text" value={aiCfg.apiKey} onChange={e => set('aiApiKey', e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
                        style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }} />
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>Client Secret</div>
                      <div className="relative">
                        <input type={showSecret ? 'text' : 'password'} value={aiCfg.clientSecret} onChange={e => set('aiClientSecret', e.target.value)}
                          placeholder="Секретный ключ"
                          className="w-full text-xs px-2 py-1.5 pr-7 rounded-lg outline-none font-mono"
                          style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }} />
                        <button onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] cursor-pointer"
                          style={{ color: 'var(--cc-text-dimmer)' }}>{showSecret ? '🙈' : '👁️'}</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <span className="text-[10px]" style={{ color: '#22c55e', opacity: justSaved ? 1 : 0 }}>✓ сохранено</span>
                      <button onClick={testConnection} disabled={!aiCfg.apiKey || !aiCfg.clientSecret || testing}
                        className="text-[10px] px-2.5 py-1 rounded-lg cursor-pointer transition-all disabled:opacity-40"
                        style={{
                          backgroundColor: testStatus === 'ok' ? '#22c55e22' : testStatus === 'fail' ? 'rgba(239,68,68,0.1)' : '#2AABEE22',
                          color: testStatus === 'ok' ? '#22c55e' : testStatus === 'fail' ? '#f87171' : '#2AABEE',
                          border: `1px solid ${testStatus === 'ok' ? '#22c55e44' : testStatus === 'fail' ? 'rgba(239,68,68,0.3)' : '#2AABEE44'}`,
                        }}>
                        {testing ? '⏳ Проверка...' : testStatus === 'ok' ? '✓ Работает!' : testStatus === 'fail' ? '✗ Ошибка' : 'Проверить соединение'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>
                      2. Вставить API Ключ
                    </div>
                    <div className="relative">
                      <input type={showKey ? 'text' : 'password'} value={aiCfg.apiKey} onChange={e => set('aiApiKey', e.target.value)}
                        placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                        className="w-full text-xs px-2 py-1.5 pr-7 rounded-lg outline-none font-mono"
                        style={{
                          backgroundColor: 'var(--cc-hover)',
                          border: `1px solid ${justSaved ? '#22c55e66' : 'var(--cc-border)'}`,
                          color: 'var(--cc-text)',
                          transition: 'border-color 0.3s',
                        }} />
                      <button onClick={() => setShowKey(!showKey)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] cursor-pointer"
                        style={{ color: 'var(--cc-text-dimmer)' }}>{showKey ? '🙈' : '👁️'}</button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <span className="text-[10px] transition-opacity" style={{ color: '#22c55e', opacity: justSaved ? 1 : 0 }}>✓ сохранено</span>
                      <button onClick={testConnection} disabled={!aiCfg.apiKey || testing}
                        className="text-[10px] px-2.5 py-1 rounded-lg cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: testStatus === 'ok' ? '#22c55e22' : testStatus === 'fail' ? 'rgba(239,68,68,0.1)' : '#2AABEE22',
                          color: testStatus === 'ok' ? '#22c55e' : testStatus === 'fail' ? '#f87171' : '#2AABEE',
                          border: `1px solid ${testStatus === 'ok' ? '#22c55e44' : testStatus === 'fail' ? 'rgba(239,68,68,0.3)' : '#2AABEE44'}`,
                        }}>
                        {testing ? '⏳ Проверка...' : testStatus === 'ok' ? '✓ Ключ работает!' : testStatus === 'fail' ? '✗ Ошибка — проверьте ключ' : '3. Проверить соединение'}
                      </button>
                    </div>
                  </div>
                )}

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
              </>
            )}

            {/* ── WebView режим: URL + разрешения ── */}
            {providerMode === 'webview' && (
              <>
                <div
                  className="text-[11px] px-2.5 py-2 rounded-lg leading-relaxed"
                  style={{ backgroundColor: '#2AABEE0D', border: '1px solid #2AABEE22', color: 'var(--cc-text-dim)' }}
                >
                  <div className="font-semibold mb-0.5" style={{ color: '#2AABEE' }}>🌐 Веб-интерфейс</div>
                  <div style={{ color: 'var(--cc-text-dimmer)' }}>
                    Откроется сайт {providerInfo.label}. Войдите в свой аккаунт и пользуйтесь со своей подпиской — API-ключ не нужен.
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>URL сервиса</div>
                  <input
                    type="text"
                    value={webviewUrl}
                    onChange={e => setProviderProp('webviewUrl', e.target.value)}
                    placeholder="https://..."
                    className="w-full text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
                    style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
                  />
                  {webviewUrl !== (DEFAULT_WEBVIEW_URLS[provider] || '') && (
                    <button
                      onClick={() => setProviderProp('webviewUrl', DEFAULT_WEBVIEW_URLS[provider] || '')}
                      className="text-[9px] mt-1 cursor-pointer"
                      style={{ color: 'var(--cc-text-dimmer)' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#2AABEE'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--cc-text-dimmer)'}
                    >↺ Сбросить на стандартный</button>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>
                    Разрешения на чтение чата
                  </div>
                  <div className="flex gap-1">
                    {[
                      { id: 'none', icon: '🔇', label: 'Ничего',    desc: 'Не передавать историю чата в AI' },
                      { id: 'last', icon: '💬', label: 'Последнее', desc: 'Только последнее сообщение клиента' },
                      { id: 'full', icon: '📖', label: 'История',   desc: 'Последние 10 сообщений из чата' },
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => setProviderProp('contextMode', m.id)}
                        title={m.desc}
                        className="flex-1 flex flex-col items-center py-1.5 rounded-lg text-[9px] cursor-pointer transition-all leading-tight"
                        style={{
                          backgroundColor: contextMode === m.id ? '#2AABEE22' : 'var(--cc-hover)',
                          border: `1px solid ${contextMode === m.id ? '#2AABEE55' : 'transparent'}`,
                          color: contextMode === m.id ? '#2AABEE' : 'var(--cc-text-dimmer)',
                        }}
                      >
                        <span className="text-sm mb-0.5">{m.icon}</span>
                        <span className="font-medium">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── РЕЖИМ WEBVIEW (основной контент) ── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {providerMode === 'webview' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* WebView с AI-сервисом */}
            <div className="flex-1 relative overflow-hidden">
              {webviewUrl ? (
                <webview
                  ref={aiWebviewRef}
                  src={webviewUrl}
                  partition="persist:ai-webview"
                  style={{ width: '100%', height: '100%' }}
                  allowpopups="true"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-center px-4">
                  <div>
                    <div className="text-3xl mb-2">🌐</div>
                    <p className="text-xs" style={{ color: 'var(--cc-text-dimmer)' }}>
                      Нажмите ⚙️ и укажите URL сервиса
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Компактная панель отправки контекста ── */}
            <div
              className="flex items-center gap-2 px-2 py-1.5 shrink-0"
              style={{ borderTop: '1px solid var(--cc-border)', backgroundColor: 'var(--cc-surface-alt)' }}
            >
              {/* Текущий режим доступа — компактно */}
              <div
                className="flex items-center gap-1 text-[9px] px-1.5 py-1 rounded-lg cursor-pointer"
                style={{ color: 'var(--cc-text-dimmer)', backgroundColor: 'var(--cc-hover)' }}
                onClick={() => { setShowConfig(true); setShowAddProvider(false) }}
                title="Нажмите чтобы изменить разрешения"
              >
                <span>{contextMode === 'none' ? '🔇' : contextMode === 'full' ? '📖' : '💬'}</span>
                <span>{contextMode === 'none' ? 'Выкл' : contextMode === 'full' ? 'История' : 'Посл.'}</span>
              </div>
              {/* Кнопка отправки контекста */}
              <button
                onClick={sendContextToAiWebview}
                disabled={contextMode === 'none'}
                className="flex-1 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor:
                    contextSendStatus === 'sent'   ? '#22c55e22' :
                    contextSendStatus === 'copied' ? '#f59e0b22' :
                    contextSendStatus === 'empty'  ? 'rgba(239,68,68,0.1)' :
                    '#2AABEE22',
                  color:
                    contextSendStatus === 'sent'   ? '#22c55e' :
                    contextSendStatus === 'copied' ? '#f59e0b' :
                    contextSendStatus === 'empty'  ? '#f87171' :
                    '#2AABEE',
                  border: `1px solid ${
                    contextSendStatus === 'sent'   ? '#22c55e44' :
                    contextSendStatus === 'copied' ? '#f59e0b44' :
                    contextSendStatus === 'empty'  ? 'rgba(239,68,68,0.3)' :
                    '#2AABEE44'}`,
                }}
              >
                {contextSendStatus === 'sent'   ? '✓ Вставлено!' :
                 contextSendStatus === 'copied' ? '📋 Ctrl+V' :
                 contextSendStatus === 'empty'  ? '⚠️ Нет сообщений' :
                 '📤 Отправить в AI'}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── РЕЖИМ API (основной контент) ── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {providerMode === 'api' && (
          <>
            {/* Тело API-режима */}
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

              {loading && !isStreaming && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="text-2xl mb-2 animate-pulse">{providerInfo.icon}</div>
                  <p className="text-xs" style={{ color: 'var(--cc-text-dim)' }}>Подключаюсь...</p>
                </div>
              )}

              {isStreaming && (
                <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--cc-surface-alt)', border: '1px solid #2AABEE33' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-medium" style={{ color: '#2AABEE' }}>
                      {providerInfo.icon} Генерирую...
                    </span>
                    <span className="flex gap-0.5">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ backgroundColor: '#2AABEE', animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap"
                    style={{ color: 'var(--cc-text-dim)', fontFamily: 'monospace', opacity: 0.85 }}>
                    {streamBuffer}<span className="animate-pulse" style={{ color: '#2AABEE' }}>▌</span>
                  </p>
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

            {/* Ввод для API-режима */}
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
                  disabled={!input.trim() || loading || isStreaming}
                  className="px-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer self-end py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: isStreaming ? '#2AABEE88' : '#2AABEE', color: '#fff' }}
                >{isStreaming ? '⏳' : '→'}</button>
              </div>
              <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--cc-text-dimmer)' }}>
                Enter — отправить · Shift+Enter — перенос
              </p>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
