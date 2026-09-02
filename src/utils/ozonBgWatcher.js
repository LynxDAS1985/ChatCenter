// v1.2.358 (Шаг 3 / Фаза 3a, TODO-36): маршрутизатор консоли СКРЫТОЙ фоновой webview-страницы Ozon
// «Вопросы и ответы». Цель: следить за новыми вопросами, даже когда пользователь открыл другой раздел
// (или вообще другой мессенджер). Фоновая страница живёт на ТОЙ ЖЕ партиции Ozon (persist:ozon → один вход),
// monitor.preload сам впрыскивает в неё ozon.hook по хосту seller.ozon.ru → её `_scanQ` шлёт `__CC_NOTIF__`.
//
// Почему отдельный маршрутизатор, а не общий webviewSetup: фоновая страница — не «источник» в списке
// мессенджеров (нет вкладки, нет значка), её нельзя гонять через setWebviewRef (там health/refs по id).
// Поэтому вешаем ЛЁГКИЙ слушатель console-message прямо на элемент и переводим её сигналы на ОСНОВНОЙ id
// Ozon: уведомление → handleNewMessage(ozonId) (имя/логотип Ozon, дедуп от двойных — если основная вкладка
// тоже на «Вопросах», один и тот же отпечаток `ozon-q:fp` гасится общим дедупом за 5с); qa-счётчик → виджет.
import { parseConsoleMessage } from './consoleMessageParser.js'

/**
 * Привязать слушатель к скрытому фоновому webview Ozon. Идемпотентно (флаг на элементе).
 * @param {HTMLElement|null} el - элемент <webview> (или null при размонтировании)
 * @param {string} ozonId - id ОСНОВНОГО мессенджера Ozon (для маршрутизации уведомлений/счётчика)
 * @param {{handleNewMessage:Function, setOzonCounts:Function, log:Function}} deps
 */
export function bindOzonBgWatcher(el, ozonId, deps) {
  try {
    if (!el || el.__ccOzonBgBound) return
    el.__ccOzonBgBound = true
    const { handleNewMessage, setOzonCounts, log, notify } = deps || {}
    // v1.2.361 ДИАГНОСТИКА (Шаг 3А молчит — 0 строк [ozon-bg]): лесенка записей, чтобы увидеть, на каком
    // шаге рвётся. Убрать после того, как фоновая страница подтвердится рабочей. Текст вопросов НЕ пишем.
    log && log('INFO', '[ozon-bg] страница создана, слушатель привязан')
    el.addEventListener('did-finish-load', () => { try { log && log('INFO', '[ozon-bg] страница загрузилась URL=' + (el.getURL ? el.getURL() : '?')) } catch (_) {} })
    // v1.2.362: при РЕАЛЬНОЙ неудаче загрузки главной страницы (Ozon не пустил в фоне) — один раз мягко
    // сообщить пользователю понятной фразой. ERR_ABORTED (-3) = отмена/редирект (Ozon сам редиректит
    // /app/reviews/questions), это НЕ блокировка → не тревожим. isMainFrame: только главный документ, не под-ресурсы.
    el.addEventListener('did-fail-load', (e) => {
      try {
        const code = e && e.errorCode
        const mainFrame = (!e || e.isMainFrame === undefined) ? true : e.isMainFrame
        log && log('WARN', '[ozon-bg] загрузка НЕ удалась code=' + code + ' ' + (e && e.errorDescription) + ' url=' + (e && e.validatedURL || ''))
        if (mainFrame && code != null && code !== -3 && !el.__ccOzonBgBlockNotified) {
          el.__ccOzonBgBlockNotified = true
          notify && notify('Ozon', 'Фоновая слежка за вопросами недоступна: Ozon не открыл страницу «Вопросы» в фоне. Уведомления о новых вопросах будут приходить, только когда открыт сам раздел «Вопросы».')
        }
      } catch (_) {}
    })
    el.addEventListener('dom-ready', () => { try { log && log('INFO', '[ozon-bg] dom-ready (страница готова, хук должен впрыснуться)') } catch (_) {} })
    let _firstMsg = true
    el.addEventListener('console-message', (e) => {
      try {
        const msg = (e && (e.message || (e.details && e.details.message))) || ''
        if (_firstMsg) { _firstMsg = false; try { log && log('INFO', '[ozon-bg] первое console-сообщение из страницы получено') } catch (_) {} }
        if (!msg || msg.indexOf('__CC_') !== 0) return
        const parsed = parseConsoleMessage(msg)
        if (!parsed) return
        // qa-счётчик «Вопросов» → бейдж виджета (на основном id Ozon)
        if (parsed.type === 'ozon_count' && parsed.section === 'qa') {
          setOzonCounts && setOzonCounts(prev => {
            const cur = prev[ozonId] || {}
            if (cur.qa === parsed.n) return prev
            return { ...prev, [ozonId]: { ...cur, qa: parsed.n } }
          })
          return
        }
        // Уведомление о новом вопросе без ответа → общий конвейер под именем/логотипом Ozon.
        // background:true — НЕ переключать активную вкладку (фоновый источник не крадёт фокус, v1.2.359).
        if (parsed.type === 'notification' && parsed.source === 'ozon-questions') {
          const extra = { senderName: parsed.title || '', chatTag: parsed.tag || '', notifSource: 'ozon-questions', fromNotifAPI: false, background: true }
          log && log('INFO', `[ozon-bg] фон: новый вопрос «${(parsed.body || '').slice(0, 40)}»`)
          handleNewMessage && handleNewMessage(ozonId, parsed.body || '', extra)
          return
        }
        // Диагностика скана — прокидываем в файл-лог, чтобы было видно, что фоновая страница ЖИВА и сканирует
        if (parsed.type === 'diagnostic' && /ozon-q scan/.test(parsed.text || '')) {
          log && log('INFO', `[ozon-bg] ${parsed.text}`)
        }
      } catch (_) {}
    })
  } catch (_) {}
}
