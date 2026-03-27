// v0.79.6: AI утилиты вынесены в src/utils/aiProviders.js
import { useState, useRef, useEffect } from 'react'
import AIConfigPanel from './AIConfigPanel.jsx'
import {
  looksLikeApiKey, DEFAULT_SYSTEM_PROMPT, PROVIDERS, DEFAULT_WEBVIEW_URLS,
  MODEL_HINTS, PROVIDER_URLS, BILLING_URLS, isBillingError,
  getProviderCfg, isProviderConnected
} from '../utils/aiProviders.js'

// Вспомогательный компонент — заголовок шага
function StepRow({ num, title, extra, numDone }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2" style={{ backgroundColor: 'var(--cc-hover)' }}>
      <span
        className="text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: numDone ? '#22c55e22' : '#2AABEE22',
          color: numDone ? '#22c55e' : '#2AABEE',
          border: `1px solid ${numDone ? '#22c55e55' : '#2AABEE55'}`,
        }}
      >{numDone ? '✓' : num}</span>
      <span className="text-[11px] font-semibold flex-1" style={{ color: 'var(--cc-text-dim)' }}>{title}</span>
      {extra}
    </div>
  )
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
  // Статус последнего запроса по каждому провайдеру: 'ok' | 'fail' | null
  const [providerStatuses, setProviderStatuses] = useState({})
  // Время последней проверки: { pid: 'HH:MM' }
  const [providerCheckTimes, setProviderCheckTimes] = useState({})
  // Для кнопки 🔄 — идёт ли сейчас проверка всех провайдеров
  const [refreshing, setRefreshing] = useState(false)
  // pid провайдера над чьим ● кружком стоит курсор (для tooltip)
  const [hoveredStatus, setHoveredStatus] = useState(null)

  // ── Состояния WebView-режима ──────────────────────────────────────────────
  const [contextSendStatus, setContextSendStatus] = useState(null)

  const endRef = useRef(null)
  const savedTimerRef = useRef(null)
  const pollingRef = useRef(null)
  const unsubLoginRef = useRef(null)
  const streamBufferRef = useRef('')
  const streamUnsubsRef = useRef([])
  const prevMessengerIdRef = useRef(null)
  const aiWebviewRef = useRef(null)
  // Ref для актуальных settings в interval/timeout без stale closure
  const settingsRef = useRef(settings)
  // Ref на функцию runProviderChecks (стабильный, не устаревает)
  const runChecksRef = useRef(null)

  // ── Настройки (shortcuts) ─────────────────────────────────────────────────
  const provider = settings.aiProvider || 'openai'
  const providerInfo = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0]
  const connectedProviders = PROVIDERS.filter(p => isProviderConnected(settings, p.id))
  const unconnectedProviders = PROVIDERS.filter(p => !isProviderConnected(settings, p.id))
  const providerCfg = getProviderCfg(settings, provider)
  const providerMode = providerCfg.mode
  const webviewUrl  = providerCfg.webviewUrl
  const contextMode = providerCfg.contextMode
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

  // Синхронизируем ref с актуальными settings (для interval/timeout)
  useEffect(() => { settingsRef.current = settings }, [settings])

  // ── Проверка всех API-провайдеров (startup / hourly / manual) ─────────────
  const runProviderChecks = async (source = 'manual') => {
    const s = settingsRef.current
    setRefreshing(true)
    for (const p of PROVIDERS) {
      const cfg = getProviderCfg(s, p.id)
      if (cfg.mode !== 'api') continue
      if (p.id === 'gigachat') {
        if (!cfg.apiKey || !cfg.clientSecret) continue
      } else {
        if (!cfg.apiKey) continue
      }
      const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      try {
        const res = await window.api.invoke('ai:generate', {
          messages: [{ role: 'user', content: 'ok' }],
          settings: { provider: p.id, apiKey: cfg.apiKey, clientSecret: cfg.clientSecret, model: cfg.model, systemPrompt: 'ok' },
        })
        setProviderStatuses(prev => ({ ...prev, [p.id]: res.ok ? 'ok' : 'fail' }))
        setProviderCheckTimes(prev => ({ ...prev, [p.id]: time }))
        if (!res.ok) window.api.invoke('ai:log-error', { provider: p.id, errorText: `[${source}] ${res.error}` }).catch(() => {})
      } catch (e) {
        setProviderStatuses(prev => ({ ...prev, [p.id]: 'fail' }))
        setProviderCheckTimes(prev => ({ ...prev, [p.id]: time }))
        window.api.invoke('ai:log-error', { provider: p.id, errorText: `[${source}] ${e.message}` }).catch(() => {})
      }
    }
    setRefreshing(false)
  }
  // Обновляем ref чтобы interval/timeout всегда звал актуальную версию
  runChecksRef.current = runProviderChecks

  // ── Переключение провайдера ───────────────────────────────────────────────
  const switchProvider = (newPid) => {
    const pKeys = { ...(settings.aiProviderKeys || {}) }
    const currentPid = settings.aiProvider || 'openai'
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
      const st = res.ok ? 'ok' : 'fail'
      const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      setTestStatus(st)
      setProviderStatuses(s => ({ ...s, [provider]: st }))
      setProviderCheckTimes(t => ({ ...t, [provider]: time }))
      if (!res.ok) {
        setError(res.error || 'Ошибка проверки')
        window.api.invoke('ai:log-error', { provider, errorText: `[test] ${res.error}` }).catch(() => {})
      }
    } catch (e) {
      const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      setTestStatus('fail')
      setProviderStatuses(s => ({ ...s, [provider]: 'fail' }))
      setProviderCheckTimes(t => ({ ...t, [provider]: time }))
      setError(e.message)
      window.api.invoke('ai:log-error', { provider, errorText: `[test] ${e.message}` }).catch(() => {})
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

  // Авто-проверка при запуске (2 сек задержка)
  useEffect(() => {
    const timer = setTimeout(() => runChecksRef.current?.('startup'), 2000)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Фоновая проверка каждый час
  useEffect(() => {
    const interval = setInterval(() => runChecksRef.current?.('hourly'), 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    const capturedProvider = provider
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
      setProviderStatuses(s => ({ ...s, [capturedProvider]: 'ok' }))
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
      setProviderStatuses(s => ({ ...s, [capturedProvider]: 'fail' }))
      setError(error); setStreamBuffer(''); streamBufferRef.current = ''
      setIsStreaming(false); setLoading(false)
      window.api.invoke('ai:log-error', { provider: capturedProvider, errorText: `[stream] ${error}` }).catch(() => {})
    })
    streamUnsubsRef.current = [unsubChunk, unsubDone, unsubError]
    window.api.send('ai:generate-stream', {
      messages: [...historyMessages, { role: 'user', content: `Сообщение клиента: "${text.trim()}"` }],
      settings: aiCfg,
      requestId,
    })
  }

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
            <button
              onClick={() => runProviderChecks('manual')}
              disabled={refreshing}
              title="Проверить соединение со всеми подключёнными провайдерами"
              className="text-sm w-6 h-6 rounded flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: 'var(--cc-text-dimmer)' }}
            >{refreshing ? '⏳' : '🔄'}</button>
            <button
              onClick={() => { setShowConfig(!showConfig); setShowAddProvider(false) }}
              title="Настройки ИИ-помощника"
              className="text-sm w-6 h-6 rounded flex items-center justify-center cursor-pointer"
              style={{ color: showConfig ? '#2AABEE' : 'var(--cc-text-dimmer)' }}
            >⚙️</button>
          </div>
        </div>

        {/* ── Панель провайдеров ── */}
        <div className="px-2 pt-2 pb-1.5 shrink-0" style={{ borderBottom: '1px solid var(--cc-border)' }}>
          {connectedProviders.length > 0 ? (
            <div className="flex items-center gap-1 flex-wrap">
              {connectedProviders.map(p => {
                const pCfg = getProviderCfg(settings, p.id)
                const pSt = providerStatuses[p.id]
                return (
                  <button
                    key={p.id}
                    onClick={() => { switchProvider(p.id); setShowConfig(false) }}
                    title={`${p.label} (${pCfg.mode === 'webview' ? 'Веб-интерфейс' : 'API-ключ'})${pSt === 'ok' ? ' — работает' : pSt === 'fail' ? ' — ошибка' : ''}`}
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
                    {/* Статус последнего запроса с tooltip */}
                    {pSt && (
                      <span
                        className="relative"
                        style={{ fontSize: '8px', lineHeight: 1, color: pSt === 'ok' ? '#22c55e' : '#f87171' }}
                        onMouseEnter={e => { e.stopPropagation(); setHoveredStatus(p.id) }}
                        onMouseLeave={() => setHoveredStatus(null)}
                      >
                        ●
                        {hoveredStatus === p.id && (
                          <span
                            className="absolute bottom-full left-1/2 mb-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[10px] font-normal pointer-events-none"
                            style={{
                              transform: 'translateX(-50%)',
                              backgroundColor: 'var(--cc-surface)',
                              border: '1px solid var(--cc-border)',
                              color: 'var(--cc-text-dim)',
                              boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                              zIndex: 100,
                              lineHeight: 1.5,
                            }}
                          >
                            {pSt === 'ok' ? '✓ Работает' : '✗ Ошибка'}
                            {providerCheckTimes[p.id] && (
                              <span style={{ color: 'var(--cc-text-dimmer)' }}> · {providerCheckTimes[p.id]}</span>
                            )}
                          </span>
                        )}
                      </span>
                    )}
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

        {/* v0.83.2: Конфиг-панель вынесена в AIConfigPanel.jsx */}
        <AIConfigPanel showConfig={showConfig} setShowConfig={setShowConfig} providerMode={providerMode} aiCfg={aiCfg} set={set} showKey={showKey} setShowKey={setShowKey} showSecret={showSecret} setShowSecret={setShowSecret} testing={testing} testStatus={testStatus} justSaved={justSaved} waitingForKey={waitingForKey} keyFoundMsg={keyFoundMsg} providerInfo={providerInfo} />

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── РЕЖИМ WEBVIEW (основной контент) ── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {providerMode === 'webview' && !showConfig && (
          <div className="flex flex-col flex-1 overflow-hidden">
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
            <div
              className="flex items-center gap-2 px-2 py-1.5 shrink-0"
              style={{ borderTop: '1px solid var(--cc-border)', backgroundColor: 'var(--cc-surface-alt)' }}
            >
              <div
                className="flex items-center gap-1 text-[9px] px-1.5 py-1 rounded-lg cursor-pointer"
                style={{ color: 'var(--cc-text-dimmer)', backgroundColor: 'var(--cc-hover)' }}
                onClick={() => { setShowConfig(true); setShowAddProvider(false) }}
                title="Нажмите чтобы изменить разрешения"
              >
                <span>{contextMode === 'none' ? '🔇' : contextMode === 'full' ? '📖' : '💬'}</span>
                <span>{contextMode === 'none' ? 'Выкл' : contextMode === 'full' ? 'История' : 'Посл.'}</span>
              </div>
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
        {providerMode === 'api' && !showConfig && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">

              {!configured && (
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
