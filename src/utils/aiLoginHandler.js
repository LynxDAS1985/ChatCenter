// v0.84.4: Extracted from AISidebar.jsx — login window + clipboard polling logic
// deps: waitingForKey, pollingRef, unsubLoginRef, setWaitingForKey,
//        provider, providerInfo, setKeyFoundMsg, set, windowApi,
//        looksLikeApiKey, PROVIDER_URLS

import { looksLikeApiKey, PROVIDER_URLS } from './aiProviders.js'

/**
 * Creates a login handler bound to current component state.
 * @param {Object} deps — all state, refs, and callbacks
 * @returns {function(): Promise<void>} openLoginWindow
 */
export function createLoginHandler(deps) {
  const {
    waitingForKey,
    pollingRef,
    unsubLoginRef,
    setWaitingForKey,
    provider,
    providerInfo,
    setKeyFoundMsg,
    set,
    windowApi,
  } = deps

  return async function openLoginWindow() {
    if (waitingForKey) {
      clearInterval(pollingRef.current)
      unsubLoginRef.current?.()
      setWaitingForKey(false)
      return
    }
    const capturedProvider = provider
    const capturedLabel = providerInfo.label
    await windowApi?.invoke('ai-login:open', {
      url: PROVIDER_URLS[capturedProvider],
      provider: capturedProvider,
      providerLabel: capturedLabel,
    }).catch(() => {})
    setWaitingForKey(true)
    setKeyFoundMsg('')
    unsubLoginRef.current = windowApi?.on('ai-login:closed', ({ provider: closedProvider }) => {
      if (closedProvider !== capturedProvider) return
      clearInterval(pollingRef.current)
      unsubLoginRef.current?.()
      setWaitingForKey(false)
    })
    let previousClipboard = ''
    try { previousClipboard = (await windowApi?.invoke('clipboard:read')) || '' } catch {}
    pollingRef.current = setInterval(async () => {
      try {
        const text = (await windowApi?.invoke('clipboard:read')) || ''
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
}
