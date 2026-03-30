// v0.84.4: Extracted from AISidebar.jsx — AI streaming (SSE) logic
// deps: configured, setError, setShowConfig, streamUnsubsRef, setLoading,
//        setIsStreaming, setSuggestions, setStreamBuffer, streamBufferRef,
//        setProviderStatuses, provider, chatHistory, aiCfg, windowApi

/**
 * Creates a streaming handler bound to current component state.
 * @param {Object} deps — all state setters, refs, and values used by the streaming logic
 * @returns {function(string): void} generateStreaming(text)
 */
export function createStreamingHandler(deps) {
  const {
    configured,
    setError,
    setShowConfig,
    streamUnsubsRef,
    setLoading,
    setIsStreaming,
    setSuggestions,
    setStreamBuffer,
    streamBufferRef,
    setProviderStatuses,
    provider,
    chatHistory,
    aiCfg,
    windowApi,
  } = deps

  return function generateStreaming(text) {
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
    const unsubChunk = windowApi?.on('ai:stream-chunk', ({ requestId: rid, chunk }) => {
      if (rid !== requestId) return
      streamBufferRef.current += chunk
      setStreamBuffer(streamBufferRef.current)
      setIsStreaming(true)
    })
    const unsubDone = windowApi?.on('ai:stream-done', ({ requestId: rid }) => {
      if (rid !== requestId) return
      finalize()
    })
    const unsubError = windowApi?.on('ai:stream-error', ({ requestId: rid, error }) => {
      if (rid !== requestId) return
      cleanup()
      setProviderStatuses(s => ({ ...s, [capturedProvider]: 'fail' }))
      setError(error); setStreamBuffer(''); streamBufferRef.current = ''
      setIsStreaming(false); setLoading(false)
      windowApi?.invoke('ai:log-error', { provider: capturedProvider, errorText: `[stream] ${error}` }).catch(() => {})
    })
    streamUnsubsRef.current = [unsubChunk, unsubDone, unsubError]
    windowApi?.send('ai:generate-stream', {
      messages: [...historyMessages, { role: 'user', content: `Сообщение клиента: "${text.trim()}"` }],
      settings: aiCfg,
      requestId,
    })
  }
}
