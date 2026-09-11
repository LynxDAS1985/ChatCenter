// v0.84.4: AI утилиты вынесены в src/utils/aiProviders.js + streaming/checker/login/webview
import { useState, useRef, useEffect } from 'react'
import AIConfigPanel from './AIConfigPanel.jsx'
import AIProviderTabs from './AIProviderTabs.jsx'
// v0.99.0 (Phase 3): UI AI-агента (показывается когда юзер кликнул «🤖 AI» в уведомлении).
import AISidebarAgent from './AISidebarAgent.jsx'
// v1.1.15: проверка AI Bridge (вместо DevTools, открывается кнопкой 🤖 рядом с настройками).
import AiBridgeCheck from './AiBridgeCheck.jsx'
// v1.1.16 (Этап 7): подключение webview к WebUI Bridge — preload + registerWebview.
import { useAiWebviewBridge } from '../native/hooks/useAiWebviewBridge.js'
import {
  looksLikeApiKey, DEFAULT_SYSTEM_PROMPT, PROVIDERS, DEFAULT_WEBVIEW_URLS,
  MODEL_HINTS, PROVIDER_URLS, BILLING_URLS, isBillingError,
  getProviderCfg, isProviderConnected
} from '../utils/aiProviders.js'
import { createStreamingHandler } from '../utils/aiStreamingHandler.js'
import { runProviderChecks as runProviderChecksUtil } from '../utils/aiProviderChecker.js'
import { createLoginHandler } from '../utils/aiLoginHandler.js'
import { aiPanelWidthCss, AI_PANEL_MAX_CSS } from '../../shared/panelWidthCap.js' // v1.2.455-456: панель не шире половины окна
import { sendContextToAiWebview as sendContextToAiWebviewUtil } from '../utils/aiWebviewContext.js'
// v1.1.5: диагностические логи для AI WebView (DeepSeek/ГигаЧат не работают — разбираемся).
import { attachAiWebviewDiagnostics } from '../utils/aiWebviewDiagnostics.js'

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

export default function AISidebar({ settings, onSettingsChange, lastMessage, visible, onToggle, width = 300, panelRef, chatHistory = [], activeMessengerId = null, pendingAiInvocation = null, clearPendingAiInvocation = null }) {

  // ── Состояния API-режима ──────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [error, setError] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [showAddProvider, setShowAddProvider] = useState(false)
  // v1.1.15: модалка проверки AI Bridge (Local/API/WebUI без DevTools).
  const [bridgeCheckOpen, setBridgeCheckOpen] = useState(false)
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
  // v1.1.7: ref для one-time миграции legacy settings (mode/webviewUrl/contextMode)
  const migrationDoneRef = useRef(false)

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

  // v1.1.16 (Этап 7): подключение webview к WebUI Bridge — preload + registerWebview.
  // Срабатывает только когда providerMode='webview' и URL распознан как AI сайт.
  useAiWebviewBridge(aiWebviewRef, webviewUrl, providerMode)

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
  const runProviderChecks = (source = 'manual') => runProviderChecksUtil({
    settingsRef, setRefreshing, setProviderStatuses, setProviderCheckTimes, windowApi: window.api,
  }, source)
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

  // v1.1.7: миграция legacy settings — поля mode/webviewUrl/contextMode из v1.1.5
  // ошибочно записывались в корень settings (из-за бага в set()). Перекладываем
  // в aiProviderKeys[pid] чтобы providerCfg видел их. Запускается ОДИН раз при
  // монтировании AISidebar. Не удаляем legacy сразу — оставляем 1-2 версии для
  // безопасного отката.
  useEffect(() => {
    if (!settings || migrationDoneRef.current) return
    const legacyFields = ['mode', 'webviewUrl', 'contextMode']
    const pid = settings.aiProvider || 'openai'
    const pKeys = { ...(settings.aiProviderKeys || {}) }
    const pData = { ...(pKeys[pid] || {}) }
    let migrated = false
    for (const f of legacyFields) {
      // Если в корне есть значение, а в aiProviderKeys[pid] его НЕТ → переложить
      if (settings[f] !== undefined && pData[f] === undefined) {
        pData[f] = settings[f]
        migrated = true
        try {
          window.api?.send?.('app:log', {
            level: 'INFO',
            message: '[ai-config-migrate] перенесено legacy settings.' + f + ' → aiProviderKeys.' + pid + '.' + f,
          })
        } catch (_) {}
      }
    }
    if (migrated) {
      pKeys[pid] = pData
      onSettingsChange({ ...settings, aiProviderKeys: pKeys })
    }
    migrationDoneRef.current = true
  }, [settings])

  const testConnection = async () => {
    if (!configured) return
    setTesting(true)
    setTestStatus(null)
    setError('')
    try {
      const res = await window.api?.invoke('ai:generate', {
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
        window.api?.invoke('ai:log-error', { provider, errorText: `[test] ${res.error}` }).catch(() => {})
      }
    } catch (e) {
      const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      setTestStatus('fail')
      setProviderStatuses(s => ({ ...s, [provider]: 'fail' }))
      setProviderCheckTimes(t => ({ ...t, [provider]: time }))
      setError(e.message)
      window.api?.invoke('ai:log-error', { provider, errorText: `[test] ${e.message}` }).catch(() => {})
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
  }, []) 
  // Фоновая проверка каждый час
  useEffect(() => {
    const interval = setInterval(() => runChecksRef.current?.('hourly'), 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // v1.1.5: ВРЕМЕННЫЕ диагностические логи для AI webview (DeepSeek / ГигаЧат
  // не показывают логин-страницу — разбираемся почему). Удалить после
  // нахождения корня. Срабатывает когда монтируется <webview> в режиме webview.
  useEffect(() => {
    if (providerMode !== 'webview') return undefined
    if (!webviewUrl) return undefined
    // requestAnimationFrame — ref может быть ещё null в момент эффекта
    // (особенно после переключения mode → webview). Ждём один кадр.
    let detacher = null
    const rafId = requestAnimationFrame(() => {
      const el = aiWebviewRef.current
      if (!el) {
        // v1.1.6: через штатный логгер (НЕ console.warn).
        try {
          window.api?.send?.('app:log', {
            level: 'WARN',
            message: '[ai-webview] [no-ref] провайдер=' + provider + ' url=' + webviewUrl + ' — webview ref пустой при mount, listener не повешен',
          })
        } catch (_) {}
        return
      }
      detacher = attachAiWebviewDiagnostics(el, provider, webviewUrl)
    })
    return () => {
      cancelAnimationFrame(rafId)
      if (detacher && typeof detacher.detach === 'function') {
        try { detacher.detach() } catch (_) {}
      }
    }
  }, [providerMode, webviewUrl, provider])

  const openLoginWindow = createLoginHandler({
    waitingForKey, pollingRef, unsubLoginRef, setWaitingForKey,
    provider, providerInfo, setKeyFoundMsg, set, windowApi: window.api,
  })

  // ── Стриминг AI (SSE) ─────────────────────────────────────────────────────
  const generateStreaming = createStreamingHandler({
    configured, setError, setShowConfig, streamUnsubsRef, setLoading,
    setIsStreaming, setSuggestions, setStreamBuffer, streamBufferRef,
    setProviderStatuses, provider, chatHistory, aiCfg, windowApi: window.api,
  })

  const generate = async (text) => {
    if (!configured) { setError('Настройте ИИ'); setShowConfig(true); return }
    if (!text.trim()) return
    setLoading(true); setError(''); setSuggestions([])
    try {
      const res = await window.api?.invoke('ai:generate', {
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
    if (url) window.api?.invoke('shell:open-url', url).catch(() => {})
  }

  // ── Отправка контекста чата в WebView AI ─────────────────────────────────
  const sendContextToAiWebview = () => sendContextToAiWebviewUtil({
    aiWebviewRef, contextMode, lastMessage, chatHistory, setContextSendStatus,
  })

  // ── Рендер ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      data-cc-layout="ai-panel"
      data-cc-width-want={width}
      className="flex flex-col shrink-0"
      style={{
        // v1.2.456: ширина — снова ПОСТОЯННОЕ число, а потолок «не больше половины окна»
        // задан отдельным правилом ниже. В v1.2.455 потолок был вписан прямо сюда, и из-за
        // перехода `transition: width` край панели ехал за краем окна с отставанием при
        // изменении размера окна (см. shared/panelWidthCap.js, AI_PANEL_MAX_CSS).
        width: visible ? `${width}px` : '0px',
        maxWidth: AI_PANEL_MAX_CSS,
        overflow: 'hidden',
        borderLeft: visible ? '1px solid var(--cc-border)' : 'none',
        backgroundColor: 'var(--cc-surface)',
        transition: 'width 0.15s',
      }}
    >
      {/* v1.2.455: внутренний слой держит ТО ЖЕ правило. С жёсткими `${width}px` он при
          сработавшем потолке вылез бы за внешний слой и был бы обрезан (у внешнего
          overflow: hidden) — та же беда, что чинили в v1.2.454, только внутри панели.
          minWidth нужен, чтобы содержимое не переливалось во время сворачивания
          панели (внешний слой уезжает в 0 за 0.15с). */}
      <div style={{ width: aiPanelWidthCss(width), minWidth: aiPanelWidthCss(width) }} className="flex flex-col h-full">

        {/* v0.99.0 (Phase 3): AI Агент UI — показывается когда юзер кликнул «🤖 AI» в уведомлении. */}
        {pendingAiInvocation && (
          <div style={{ padding: 8, borderBottom: '1px solid var(--cc-border)' }}>
            <AISidebarAgent
              pendingInvocation={pendingAiInvocation}
              provider={provider}
              recentMessages={chatHistory}
              onDone={() => clearPendingAiInvocation?.()}
              settings={settings}
              onSettingsChange={onSettingsChange}
            />
          </div>
        )}

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
              onClick={() => setBridgeCheckOpen(true)}
              title="Проверка AI Bridge — задать AI вопрос и получить ответ"
              className="text-sm w-6 h-6 rounded flex items-center justify-center cursor-pointer"
              style={{ color: 'var(--cc-text-dimmer)' }}
            >🤖</button>
            <button
              onClick={() => { setShowConfig(!showConfig); setShowAddProvider(false) }}
              title="Настройки ИИ-помощника"
              className="text-sm w-6 h-6 rounded flex items-center justify-center cursor-pointer"
              style={{ color: showConfig ? '#2AABEE' : 'var(--cc-text-dimmer)' }}
            >⚙️</button>
          </div>
        </div>

        {/* v1.1.15: модалка проверки AI Bridge */}
        {bridgeCheckOpen && (
          <AiBridgeCheck
            onClose={() => setBridgeCheckOpen(false)}
            settings={settings}
            onSettingsChange={onSettingsChange}
          />
        )}

        {/* ── Панель провайдеров (вынесена в AIProviderTabs.jsx) ── */}
        <AIProviderTabs
          connectedProviders={connectedProviders} unconnectedProviders={unconnectedProviders}
          provider={provider} settings={settings}
          providerStatuses={providerStatuses} providerCheckTimes={providerCheckTimes}
          hoveredStatus={hoveredStatus} setHoveredStatus={setHoveredStatus}
          showAddProvider={showAddProvider} setShowAddProvider={setShowAddProvider}
          setShowConfig={setShowConfig} switchProvider={switchProvider}
        />

        {/* v0.83.2: Конфиг-панель вынесена в AIConfigPanel.jsx */}
        <AIConfigPanel showConfig={showConfig} setShowConfig={setShowConfig} providerMode={providerMode} aiCfg={aiCfg} set={set} setProviderProp={setProviderProp} showKey={showKey} setShowKey={setShowKey} showSecret={showSecret} setShowSecret={setShowSecret} testing={testing} testStatus={testStatus} justSaved={justSaved} waitingForKey={waitingForKey} keyFoundMsg={keyFoundMsg} providerInfo={providerInfo} openProviderUrl={openProviderUrl} openLoginWindow={openLoginWindow} testConnection={testConnection} />

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
