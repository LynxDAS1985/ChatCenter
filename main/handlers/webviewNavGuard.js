// v1.2.338: «сторож навигации» веб-вкладок. Проблема (подтверждена журналом): клик по рекламному
// баннеру внутри Ozon уводил ВСЮ вкладку на чужую страницу (seller.ozon.ru → finance.ozon.ru), и
// мессенджер «пропадал» (белый экран). Решение: переход/попап на ЧУЖОЙ сайт открываем в системном
// браузере, а мессенджер оставляем на месте. Переходы ВНУТРИ того же сайта и на страницы входа —
// не трогаем (чтобы не сломать навигацию по мессенджеру и логин).
//
// ВАЖНО: перехват навигации `<webview>` работает ТОЛЬКО в main-процессе на webContents гостя
// (`will-navigate` там cancelable через preventDefault; в renderer DOM-событие отменить нельзя).

// Похоже на хост входа/авторизации? (id.ozon.ru, id.vk.com, login./auth./oauth./accounts./sso./m.…)
// Такие переходы НЕ блокируем — иначе сломаем логин в мессенджерах. Список намеренно широкий:
// ошибка в сторону «пропустить» безопаснее, чем «заблокировать нужный вход».
function isAuthHost(host) {
  return /^(id|login|auth|oauth|account|accounts|sso|secure|passport|connect|m)\./i.test(host || '')
}

// Открыть в системном браузере (true) вместо перехода ВНУТРИ вкладки?
// тот же хост → нет (навигация по самому мессенджеру); хост похож на вход → нет (не мешаем логину);
// не http(s) (about:blank/data:/blob:/javascript:) → нет; иначе (другой сайт: реклама/партнёр) → да.
// Чистая функция без зависимостей от Electron — покрыта юнит-тестом (webviewNavGuard.vitest.js).
export function shouldOpenExternal(currentUrl, targetUrl) {
  try {
    const cur = new URL(currentUrl)
    const tgt = new URL(targetUrl)
    if (!/^https?:$/.test(tgt.protocol)) return false
    if (tgt.hostname === cur.hostname) return false
    if (isAuthHost(tgt.hostname)) return false
    return true
  } catch (_) {
    return false // битый URL — безопасно не трогаем
  }
}

// Навешивает сторожа на каждую создаваемую веб-вкладку (<webview> гость).
// deps: { app, shell } — shell приходит из main.js (файл остаётся без импорта Electron → тестируемый).
export function initWebviewNavGuard({ app, shell }) {
  app.on('web-contents-created', (_e, contents) => {
    try {
      if (contents.getType() !== 'webview') return
      // Новые окна/попапы (реклама target=_blank) → системный браузер, лишних окон не плодим.
      contents.setWindowOpenHandler(({ url }) => {
        try { if (/^https?:/i.test(url)) shell.openExternal(url) } catch (_) {}
        return { action: 'deny' }
      })
      // Переход ВНУТРИ вкладки на чужой сайт → отменяем и открываем в браузере (мессенджер остаётся).
      contents.on('will-navigate', (event, url) => {
        try {
          if (shouldOpenExternal(contents.getURL(), url)) {
            event.preventDefault()
            shell.openExternal(url)
            console.log('[nav-guard] blocked in-webview → external: ' + String(url).slice(0, 120))
          }
        } catch (_) {}
      })
    } catch (_) {}
  })
}
