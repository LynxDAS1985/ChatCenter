// v0.84.4: Session setup — вынесен из main.js
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// v1.2.320: UA с РЕАЛЬНОЙ версией Chromium (process.versions.chrome). Нужен для строгих
// антибот-сайтов (Ozon): если в UA-строке одна версия Chrome, а настоящий движок другой,
// защита сайта видит нестыковку «UA ≠ client hints» и блокирует встроенное окно
// («Похоже, нет соединения», код fab_chlg). Реальная версия совпадает с client hints → нестыковки нет.
const REAL_CHROME_VER = (process.versions && process.versions.chrome) || '131.0.0.0'
const NATIVE_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + REAL_CHROME_VER + ' Safari/537.36'

// v1.2.320: сайты со строгой антибот-защитой, которым НЕ подходит наш стандартный режим
// (подделанный UA + глушение Service Worker). Пока — только Ozon-кабинет.
function isStrictAntiBotSite(url) {
  const s = String(url || '')
  try {
    const host = new URL(s).hostname.toLowerCase()
    return host === 'ozon.ru' || host.endsWith('.ozon.ru')
  } catch (_) {
    // url без схемы/битый — запасной разбор: ozon.ru в начале, после // или после точки, и не часть чужого домена
    return /(^|\/\/|\.)ozon\.ru([/:?#]|$)/i.test(s)
  }
}

// v1.2.322: «доводка» — Sec-CH-UA (client hints: заголовки, где браузер сообщает бренд/версию)
// под ОБЫЧНЫЙ Chrome. Наше окно — настоящий Chromium, но по умолчанию в client hints есть бренд
// «Electron», который строгий антибот Ozon ловит на глубоких запросах (/api/v2/resolve → 403).
// Приводим к виду обычного Chrome (Chromium + Google Chrome, без Electron). Это честная нормализация
// реального Chromium, а не подделка чужого браузера.
export function chromeClientHints(chromeVer) {
  const v = String(chromeVer || '131.0.0.0')
  const maj = v.split('.')[0]
  return {
    short: `"Chromium";v="${maj}", "Google Chrome";v="${maj}", "Not.A/Brand";v="99"`,
    full: `"Chromium";v="${v}", "Google Chrome";v="${v}", "Not.A/Brand";v="99.0.0.0"`,
  }
}

// Трекинг уже настроенных сессий — не добавлять listeners повторно
const _setupDone = new Set()

// v1.2.320: opts.url — адрес мессенджера этой сессии (для выбора строгого режима Ozon).
export function setupSession(ses, opts = {}) {
  // v0.85.5: Защита от повторного setupSession — предотвращает MaxListenersExceededWarning
  const partitionKey = ses.storagePath || 'default'
  if (_setupDone.has(partitionKey)) return
  // v0.89.56: пропускаем изолированные WebContentsView partitions (`persist:wcv-*`).
  // setupSession настраивает session под <webview> тег — webRequest hooks, CSP
  // модификации, очистка SW. Для WebContentsView пилота это создаёт конфликт
  // с Chromium guest-page manager → нативный краш при loadURL (10 версий
  // расследования v0.89.46-v0.89.55). Изолированная session без этих hooks
  // даёт чистую среду для пилота.
  if (partitionKey.includes('persist:wcv-') || partitionKey.includes('wcv-')) {
    console.log('[Session] setupSession SKIPPED for WebContentsView partition: ' + partitionKey)
    return
  }
  _setupDone.add(partitionKey)

  // v1.2.320: строгий режим для Ozon (реальный UA + НЕ глушить Service Worker).
  const strict = isStrictAntiBotSite(opts.url)
  ses.setUserAgent(strict ? NATIVE_CHROME_UA : CHROME_UA)
  // Диагностический лог — чтобы понимать, что применилось к этому окну (Ozon и не только).
  console.log('[Session] setup partition=' + partitionKey + ' url=' + (opts.url || '') +
    ' strict=' + strict + ' ua=Chrome/' + (strict ? REAL_CHROME_VER : '131.0.0.0') +
    ' sw=' + (strict ? 'kept' : 'cleared'))

  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    if (permission === 'notifications') return cb(false)
    cb(true)
  })
  ses.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'notifications') return false
    return true
  })

  // v1.2.320: Service Worker глушим ТОЛЬКО для обычных мессенджеров. Для Ozon его СОХРАНЯЕМ —
  // его SW держит связь, а без него Ozon-кабинет показывает «Похоже, нет соединения».
  if (!strict) {
    ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
      .then(() => console.log('[SW] Service Worker storage очищен для сессии'))
      .catch(e => console.error('[SW] Ошибка очистки SW storage:', e.message))
    if (ses.serviceWorkers) {
      ses.serviceWorkers.on('running-status-changed', (e) => {
        if (e.runningStatus === 'starting' || e.runningStatus === 'running') {
          console.log(`[SW] Обнаружен запущенный SW (versionId=${e.versionId}) — очистка`)
          ses.clearStorageData({ storages: ['serviceworkers'] }).catch(err => console.warn('[SW] Ошибка повторной очистки:', err.message))
        }
      })
    }
  } else {
    console.log('[Session] Ozon strict: Service Worker СОХРАНЁН (не глушим) для partition=' + partitionKey)
    // v1.2.322: «доводка» — на исходящих запросах Ozon приводим Sec-CH-UA к обычному Chrome
    // (убираем бренд Electron) + диагностика: логируем реальные заголовки на api-запросах Ozon
    // (первые 8 раз, чтобы не спамить). Помогает пройти строгую проверку /api/v2/resolve (403).
    const ch = chromeClientHints(REAL_CHROME_VER)
    let _ozonReqLogged = 0
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      const h = details.requestHeaders
      let orig = ''
      for (const k of Object.keys(h)) {
        const lk = k.toLowerCase()
        if (lk === 'sec-ch-ua') { orig = h[k]; h[k] = ch.short }
        else if (lk === 'sec-ch-ua-full-version-list') { h[k] = ch.full }
      }
      if (/\/api\//i.test(details.url) && _ozonReqLogged < 8) {
        _ozonReqLogged++
        console.log('[ozon-req] ' + details.method + ' …' + String(details.url).slice(-56) +
          ' | Sec-CH-UA было=' + (orig || '(нет)') + ' → стало=' + ch.short)
      }
      cb({ requestHeaders: h })
    })
  }

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    delete headers['x-frame-options']
    delete headers['X-Frame-Options']
    const csp = headers['content-security-policy'] || headers['Content-Security-Policy']
    if (csp) {
      const fixed = (Array.isArray(csp) ? csp : [csp]).map(v => v.replace(/frame-ancestors[^;]*(;|$)/gi, ''))
      headers['content-security-policy'] = fixed
    }
    callback({ responseHeaders: headers })
  })
}
