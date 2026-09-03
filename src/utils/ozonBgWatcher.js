// v1.2.358 (Шаг 3, TODO-36): маршрутизатор консоли СКРЫТЫХ фоновых webview-страниц Ozon. v1.2.368: работает
// для ОБОИХ разделов — «Вопросы» (/app/reviews/questions) И «Сообщения»/покупатели (/app/messenger). Один и
// тот же bindOzonBgWatcher вешается на две скрытые страницы. Цель: ловить и новые вопросы, и новые сообщения
// покупателей, даже когда пользователь в другом разделе/мессенджере. Обе живут на ТОЙ ЖЕ партиции (persist:ozon).
//
// ВПРЫСК СТОРОЖА (важно, v1.2.365): ozon.hook НЕ впрыскивается preload-ом — Ozon CSP блокирует preload-<script>.
// Рабочий путь — executeJavaScript (в обход CSP), но штатный фолбэк webviewSetup покрывает только webview,
// зарегистрированные через setWebviewRef; фоновая страница НЕ регистрируется → мы впрыскиваем хук здесь сами
// (на dom-ready, через app:read-hook + el.executeJavaScript).
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
          // v1.2.363: формулировка НЕЙТРАЛЬНА — did-fail-load бывает и от временного обрыва сети
          // (ERR_NETWORK_CHANGED/ERR_INTERNET_DISCONNECTED), не только от блокировки Ozon. Не винить Ozon зря.
          log && log('INFO', '[ozon-bg] показал пользователю сообщение о недоступности фоновой страницы (code=' + code + ')')
          // v1.2.369: текст БЕЗ названия раздела — маршрутизатор общий на «Вопросы» И «Сообщения», раздел
          // тут неизвестен, поэтому не называем его (иначе врали бы «Вопросы» и для упавшей «Сообщения»).
          notify && notify('Ozon', 'Не удалось открыть фоновую страницу Ozon (проблема Ozon или интернета). Уведомления из этого раздела будут приходить, только когда он открыт.')
        }
      } catch (_) {}
    })
    // v1.2.365: ВПРЫСК сторожа через executeJavaScript (в обход CSP Ozon) — как для основной вкладки
    // (webviewSetup.js). preload-<script> Ozon блокирует, а фоновая страница НЕ зарегистрирована в
    // webviewRefs, поэтому штатный executeJavaScript-фолбэк её не покрывал → сторож не запускался.
    // v1.2.367: впрыскиваем на КАЖДЫЙ dom-ready (без «липкого» флага) — иначе после ПЕРЕЗАГРУЗКИ фоновой
    // страницы (Ozon обновил сессию) сторож бы не переставился и слежка тихо умерла. Повтор в ТОЙ ЖЕ странице
    // безопасен: в самом хуке гвард `window.__ccOzonWatch` не даёт запуститься дважды; после перезагрузки
    // страница «чистая» (гвард сброшен) → впрыск нужен и срабатывает.
    el.addEventListener('dom-ready', () => {
      try { log && log('INFO', '[ozon-bg] dom-ready (страница готова)') } catch (_) {}
      try {
        if (window.api && window.api.invoke && el.executeJavaScript) {
          window.api.invoke('app:read-hook', 'ozon').then((hookCode) => {
            if (!hookCode) { try { log && log('WARN', '[ozon-bg] сторож не прочитан (пусто)') } catch (_) {} return }
            el.executeJavaScript(hookCode)
              .then(() => { try { log && log('INFO', '[ozon-bg] сторож впрыснут (executeJavaScript)') } catch (_) {} })
              .catch((e) => { try { log && log('WARN', '[ozon-bg] впрыск сторожа не удался: ' + ((e && e.message) || e)) } catch (_) {} })
          }).catch((e) => { try { log && log('WARN', '[ozon-bg] read-hook не удался: ' + ((e && e.message) || e)) } catch (_) {} })
        }
      } catch (_) {}
    })
    let _firstMsg = true
    el.addEventListener('console-message', (e) => {
      try {
        const msg = (e && (e.message || (e.details && e.details.message))) || ''
        if (_firstMsg) { _firstMsg = false; try { log && log('INFO', '[ozon-bg] первое console-сообщение из страницы получено') } catch (_) {} }
        if (!msg || msg.indexOf('__CC_') !== 0) return
        const parsed = parseConsoleMessage(msg)
        if (!parsed) return
        // v1.2.368 (Шаг 3Б): маршрутизатор ОБОБЩЁН на ОБА раздела (вопросы И сообщения покупателей) —
        // один и тот же bindOzonBgWatcher вешается на две фоновые страницы (/reviews/questions и /app/messenger).
        // Счётчик раздела (msg ИЛИ qa) → бейдж виджета (на основном id Ozon)
        if (parsed.type === 'ozon_count' && (parsed.section === 'msg' || parsed.section === 'qa')) {
          setOzonCounts && setOzonCounts(prev => {
            const cur = prev[ozonId] || {}
            if (cur[parsed.section] === parsed.n) return prev
            return { ...prev, [ozonId]: { ...cur, [parsed.section]: parsed.n } }
          })
          return
        }
        // Уведомление о новом (вопрос без ответа ИЛИ сообщение покупателя) → общий конвейер под именем/логотипом Ozon.
        // background:true — НЕ переключать активную вкладку (фоновый источник не крадёт фокус, v1.2.359).
        if (parsed.type === 'notification' && (parsed.source === 'ozon-questions' || parsed.source === 'ozon-list')) {
          const extra = { senderName: parsed.title || '', chatTag: parsed.tag || '', notifSource: parsed.source, fromNotifAPI: false, background: true }
          log && log('INFO', `[ozon-bg] фон: ${parsed.source === 'ozon-list' ? 'сообщение' : 'вопрос'} «${(parsed.body || '').slice(0, 40)}»`)
          handleNewMessage && handleNewMessage(ozonId, parsed.body || '', extra)
          return
        }
        // Диагностика скана из фоновой страницы (подтверждает, что сторож жив и видит список/таблицу).
        // Ловим и «Вопросы» (ozon-q scan), и «Покупатели» (ozon-list reason=), и сигнал сбоя (no-answers-col).
        if (parsed.type === 'diagnostic' && /ozon-q scan|ozon-list reason=|no-answers-col/.test(parsed.text || '')) {
          log && log('INFO', `[ozon-bg] ${parsed.text}`)
        }
      } catch (_) {}
    })
  } catch (_) {}
}
