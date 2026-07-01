export function inferDiagnosticsMessengerType(url = '', id = '') {
  const value = `${url} ${id}`.toLowerCase()
  if (value.includes('web.max.ru') || value.includes('max')) return 'max'
  if (value.includes('vk.com') || value.includes('vk')) return 'vk'
  if (value.includes('web.whatsapp.com') || value.includes('whatsapp')) return 'whatsapp'
  if (value.includes('web.telegram.org') || value.includes('telegram')) return 'telegram_web'
  return 'webview'
}

export function diagnosticsRuntimeLabel(type) {
  if (type === 'native_api') return 'API'
  return 'WebView'
}

export function diagnosticsMessengerLabel(type) {
  if (type === 'max') return 'MAX'
  if (type === 'vk') return 'VK'
  if (type === 'whatsapp') return 'WhatsApp'
  if (type === 'telegram_web') return 'Telegram Web'
  if (type === 'native_api') return 'ЦентрЧатов API'
  return 'WebView'
}

export function buildDiagnosticsTargets({ messengers = [], activeId = '', activeNativeAccountId = '' } = {}) {
  const webviewTargets = (messengers || []).map(m => {
    const messengerType = inferDiagnosticsMessengerType(m.url, m.id)
    return {
      id: m.id,
      tabId: m.id,
      tabTitle: m.name || m.id,
      messengerType,
      runtimeType: 'webview',
      runtimeLabel: diagnosticsRuntimeLabel('webview'),
      messengerLabel: diagnosticsMessengerLabel(messengerType),
      url: m.url || '',
      partition: m.partition || '',
      color: m.color || '#38bdf8',
    }
  })
  const apiTarget = {
    id: 'native_api',
    tabId: activeNativeAccountId || 'native_api',
    tabTitle: 'ЦентрЧатов API',
    messengerType: 'native_api',
    runtimeType: 'api',
    runtimeLabel: diagnosticsRuntimeLabel('native_api'),
    messengerLabel: diagnosticsMessengerLabel('native_api'),
    url: '',
    partition: '',
    color: '#22c55e',
  }
  const targets = [...webviewTargets, apiTarget]
  const preferred = targets.find(t => t.id === activeId) || targets[0] || apiTarget
  return { targets, preferred }
}

export function normalizeDiagnosticsTarget(target) {
  if (!target || typeof target !== 'object') return null
  const messengerType = target.messengerType || inferDiagnosticsMessengerType(target.url, target.id || target.tabId)
  const runtimeType = target.runtimeType || (messengerType === 'native_api' ? 'api' : 'webview')
  return {
    id: target.id || target.tabId || messengerType,
    tabId: target.tabId || target.id || messengerType,
    tabTitle: target.tabTitle || target.name || target.id || diagnosticsMessengerLabel(messengerType),
    messengerType,
    runtimeType,
    runtimeLabel: target.runtimeLabel || diagnosticsRuntimeLabel(runtimeType === 'api' ? 'native_api' : 'webview'),
    messengerLabel: target.messengerLabel || diagnosticsMessengerLabel(messengerType),
    url: target.url || '',
    partition: target.partition || '',
    color: target.color || '#38bdf8',
  }
}

export function diagnosticsTargetTitle(target) {
  const t = normalizeDiagnosticsTarget(target)
  if (!t) return 'цель не выбрана'
  return `${t.tabTitle} / ${t.messengerLabel} ${t.runtimeLabel}`.trim()
}
