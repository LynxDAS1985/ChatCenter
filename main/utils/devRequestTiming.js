// v1.2.205: вынесено из windowManager.js (TODO-31 — файл упирался в лимит 300).
// Диагностика скорости сетевых запросов ТОЛЬКО в dev-режиме: логирует старт/финиш/ошибку
// запросов к vite-серверу (localhost:5173) + периодические сводки «что тормозит».
// Вызывается из windowManager.createWindow только при isDev. В прод-сборке не используется.

/**
 * Навешивает слежение за dev-запросами на webRequest главного окна.
 * @param {Object} mainWindow — BrowserWindow
 * @param {(label: string) => void} wlog — логгер startup-window
 */
export function attachDevRequestTiming(mainWindow, wlog) {
  const requests = new Map()
  const completedRequests = []
  const attachedAt = Date.now()
  const filter = { urls: ['http://localhost:5173/*', 'http://127.0.0.1:5173/*'] }
  const normalizeUrl = (url) => {
    try {
      const u = new URL(url)
      return `${u.pathname}${u.search || ''}`
    } catch {
      return url
    }
  }
  const importantUrlHints = ['/src/', '/node_modules/.vite/', '/@vite/', '?import', '?direct']
  const isImportantUrl = (url) => importantUrlHints.some(hint => url.includes(hint))
  const shouldLog = () => true

  const rememberCompleted = (row) => {
    completedRequests.push(row)
    if (completedRequests.length > 300) completedRequests.shift()
  }

  const summarize = (reason) => {
    const slow = completedRequests
      .filter(r => r.ms >= 1000)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 12)
      .map(r => `${r.ms}ms ${r.status || r.error || 'done'} ${r.type || '?'} ${normalizeUrl(r.url)}`)
    const pending = [...requests.values()]
      .map(r => ({ ...r, age: Date.now() - r.startedAt }))
      .filter(r => r.age >= 1000)
      .sort((a, b) => b.age - a.age)
      .slice(0, 12)
      .map(r => `${r.age}ms ${r.method} ${r.type || '?'} ${normalizeUrl(r.url)}`)
    wlog(`dev-request summary reason=${reason} elapsed=${Date.now() - attachedAt}ms completed=${completedRequests.length} pending=${requests.size}`)
    if (slow.length) wlog(`dev-request slow-top reason=${reason} :: ${slow.join(' | ')}`)
    if (pending.length) wlog(`dev-request pending reason=${reason} :: ${pending.join(' | ')}`)
  }

  const before = (details, callback) => {
    requests.set(details.id, {
      startedAt: Date.now(),
      url: details.url,
      method: details.method,
      type: details.resourceType,
    })
    if (shouldLog(details.url)) {
      wlog(`dev-request start id=${details.id} method=${details.method} type=${details.resourceType} url=${normalizeUrl(details.url)}`)
    }
    if (typeof callback === 'function') callback({})
  }
  const completed = (details) => {
    const r = requests.get(details.id)
    requests.delete(details.id)
    if (!r || !shouldLog(r.url)) return
    const ms = Date.now() - r.startedAt
    rememberCompleted({ id: details.id, status: details.statusCode, cache: !!details.fromCache, ms, url: r.url, type: r.type })
    wlog(`dev-request done id=${details.id} status=${details.statusCode} cache=${!!details.fromCache} important=${isImportantUrl(r.url)} type=${r.type || details.resourceType} ms=${ms} url=${normalizeUrl(r.url)}`)
    if (ms >= 3000) wlog(`dev-request slow id=${details.id} ms=${ms} type=${r.type || details.resourceType} url=${normalizeUrl(r.url)}`)
  }
  const failed = (details) => {
    const r = requests.get(details.id)
    requests.delete(details.id)
    if (!r || !shouldLog(r.url)) return
    const ms = Date.now() - r.startedAt
    rememberCompleted({ id: details.id, error: details.error, ms, url: r.url, type: r.type })
    wlog(`dev-request failed id=${details.id} err="${details.error}" type=${r.type || details.resourceType} ms=${ms} url=${normalizeUrl(r.url)}`)
  }

  mainWindow.webContents.session.webRequest.onBeforeRequest(filter, before)
  mainWindow.webContents.session.webRequest.onCompleted(filter, completed)
  mainWindow.webContents.session.webRequest.onErrorOccurred(filter, failed)
  const timers = [5000, 10000, 15000, 30000, 45000, 60000, 90000].map(ms =>
    setTimeout(() => summarize(`${ms}ms`), ms)
  )
  mainWindow.webContents.once('dom-ready', () => summarize('dom-ready'))
  mainWindow.webContents.once('did-finish-load', () => summarize('did-finish-load'))
  mainWindow.once('ready-to-show', () => summarize('ready-to-show'))
  mainWindow.once('closed', () => timers.forEach(clearTimeout))
  wlog('dev-request timing attached http://localhost:5173/*')
}
