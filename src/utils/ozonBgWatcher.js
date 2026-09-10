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
import { shouldSkipOzonNotif } from '../../shared/ozonNotifDedup.js'

export function bindOzonBgWatcher(el, ozonId, deps) {
  try {
    if (!el || el.__ccOzonBgBound) return
    el.__ccOzonBgBound = true
    const { handleNewMessage, setOzonCounts, log, notify, periodicReloadMs, suppressFailNotice } = deps || {}
    // v1.2.396: последнее ЗАЛОГИРОВАННОЕ значение счётчика (по разделам) — чтобы писать в журнал только при
    // РЕАЛЬНОМ изменении, а не на каждый reload (после reload сторож переинжектится и повторно шлёт ту же цифру).
    const _lastCountLog = {}
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
        if (mainFrame && code != null && code !== -3 && !el.__ccOzonBgBlockNotified && !suppressFailNotice) { // v1.2.380: страница «Отзывы» на этапе разведки не тревожит пользователя (лог WARN выше остаётся)
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
        // Счётчик раздела msg/qa → бейдж виджета. Фон надёжен (мессенджер/вопросы обновляются live) → ведёт всегда.
        if (parsed.type === 'ozon_count' && (parsed.section === 'msg' || parsed.section === 'qa')) {
          // v1.2.396: пишем значение счётчика (то, что уходит на бейдж виджета/значок) — только при изменении,
          // чтобы по журналу видеть, КАК фон обновляет цифру (напр. вопросы после ответа: qa 1→0).
          if (_lastCountLog[parsed.section] !== parsed.n) {
            _lastCountLog[parsed.section] = parsed.n
            log && log('INFO', '[ozon-bg] счётчик из фона: ' + parsed.section + '=' + parsed.n + ' (значение для виджета/значка)')
          }
          setOzonCounts && setOzonCounts(prev => {
            const cur = prev[ozonId] || {}
            if (cur[parsed.section] === parsed.n) return prev
            return { ...prev, [ozonId]: { ...cur, [parsed.section]: parsed.n } }
          })
          return
        }
        // v1.2.392→v1.2.419: 'rv' (ОТЗЫВЫ) из фона. Раньше принимали ТОЛЬКО как стартовое (пока rv не задан),
        // из-за чего НОВЫЕ отзывы не поднимали ⭐, пока не откроешь вкладку (жалоба: было 4, реально 10). Теперь
        // фон может ТОЛЬКО ПОДНИМАТЬ ⭐ (Math.max) — новые отзывы видны сразу, без открытия вкладки. УМЕНЬШЕНИЕ
        // (прочтения) ведёт ПЕРЕДНЯЯ вкладка прямым set (consoleMessageHandler ozon_count) — она понизит мимо max.
        // Почему только вверх: скрытая страница Ozon не обновляет novy при прочтении (застревает высоко) — если бы
        // фон понижал/перетирал, он занижал/дёргал бы честное число передней вкладки. «Только вверх» безопасно для
        // счётчика отзывов: лучше показать чуть больше, чем ПРОПУСТИТЬ отзыв; завышение чинит открытая вкладка.
        if (parsed.type === 'ozon_count' && parsed.section === 'rv') {
          setOzonCounts && setOzonCounts(prev => {
            const cur = prev[ozonId] || {}
            const prevRv = cur.rv
            const next = (prevRv === undefined) ? parsed.n : Math.max(prevRv, parsed.n)
            if (next === prevRv) { log && log('INFO', '[ozon-bg] rv из фона=' + parsed.n + ' (не выше текущего ' + prevRv + ' → не трогаем)'); return prev }
            log && log('INFO', '[ozon-bg] rv из фона=' + parsed.n + ' → ⭐=' + next + (prevRv === undefined ? ' (стартовое)' : ' (подняли, только вверх)'))
            return { ...prev, [ozonId]: { ...cur, rv: next } }
          })
          return
        }
        // Уведомление о новом (вопрос без ответа ИЛИ сообщение покупателя) → общий конвейер под именем/логотипом Ozon.
        // background:true — НЕ переключать активную вкладку (фоновый источник не крадёт фокус, v1.2.359).
        if (parsed.type === 'notification' && (parsed.source === 'ozon-questions' || parsed.source === 'ozon-list' || parsed.source === 'ozon-reviews')) {
          const extra = { senderName: parsed.title || '', chatTag: parsed.tag || '', notifSource: parsed.source, fromNotifAPI: false, background: true }
          const _kind = parsed.source === 'ozon-list' ? 'сообщение' : parsed.source === 'ozon-reviews' ? 'отзыв' : 'вопрос'
          // v1.2.438: память «уже показывали» ЖИВЁТ У НАС (переживает перезагрузку фоновой страницы раз в минуту).
          // Память внутри страницы Ozon НЕ работает: запись в её localStorage не доходит (см. shared/ozonNotifDedup.js).
          const _dd = shouldSkipOzonNotif(parsed.source, parsed.tag, parsed.body)
          if (_dd.skip) { log && log('INFO', `[ozon-bg] повтор подавлен (${_kind}, ${Math.round(_dd.ageMs / 1000)}с назад): «${(parsed.body || '').slice(0, 40)}»`); return }
          log && log('INFO', `[ozon-bg] фон: ${_kind} «${(parsed.body || '').slice(0, 40)}»`)
          handleNewMessage && handleNewMessage(ozonId, parsed.body || '', extra)
          return
        }
        // Диагностика скана из фоновой страницы (подтверждает, что сторож жив и видит список/таблицу).
        // Ловим и «Вопросы» (ozon-q scan), и «Покупатели» (ozon-list reason=), и сигнал сбоя (no-answers-col).
        if (parsed.type === 'diagnostic' && /ozon-q scan|ozon-list reason=|no-answers-col|ozon-r /.test(parsed.text || '')) {
          log && log('INFO', `[ozon-bg] ${parsed.text}`)
        }
      } catch (_) {}
    })
    // v1.2.376: САМО-ОСВЕЖЕНИЕ фоновой «Вопросы» (Ozon SPA не обновляет список после ответа в другом месте →
    // старый снимок → qa застывает). reload раз в periodicReloadMs. ТОЛЬКО «Вопросы»: их база _qPrev переживает
    // reload через localStorage __ccOzonQSeen (нет повторных уведомлений); «Сообщения» НЕ трогаем (их база _prev
    // не персистится → reload проглотил бы новое сообщение). isConnected(false)=размонтирован → таймер стоп (без утечки).
    const reloadMs = Number(periodicReloadMs) || 0
    if (reloadMs > 0 && !el.__ccOzonBgReloadTimer) {
      el.__ccOzonBgReloadTimer = setInterval(() => {
        try {
          if (!el.isConnected) { clearInterval(el.__ccOzonBgReloadTimer); el.__ccOzonBgReloadTimer = null; return }
          if (typeof document !== 'undefined' && document.hidden) return // v1.2.377 (#3): окно свёрнуто/скрыто → не тревожим Ozon; следующий тик освежит по возврату
          if (el.reload) { el.reload(); log && log('INFO', '[ozon-bg] фоновая «Вопросы» освежена (reload)') }
        } catch (e) { log && log('WARN', '[ozon-bg] reload «Вопросы» не удался: ' + ((e && e.message) || e)) } // v1.2.377 (#5): не глотаем сбой молча
      }, reloadMs)
    }
  } catch (_) {}
}
