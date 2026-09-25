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
//
// v1.2.505: файл разложен на части (впрыск сторожа, разбор сообщений, таймер обновления) — функция
// bindOzonBgWatcher доросла до 177 строк при потолке проекта 100 (CLAUDE.md «Лимиты на функции»).
import { parseConsoleMessage } from '../../shared/consoleMessageParser.js'
import { shouldSkipOzonNotif } from '../../shared/ozonNotifDedup.js'
import { createOzonBgFailWatch, isOzonAliveProof } from '../../shared/ozonBgFailWatch.js'
// v1.2.504→505: ТОЧНОЕ число новых отзывов — со вкладки самой страницы, а не из подсчёта строк.
import { createOzonTabPoll } from '../../shared/ozonTabPoll.js'
import { applyOzonRowCount, applyOzonExact, clearOzonExact, applyOzonSectionCount } from '../../shared/ozonCountMerge.js'

/** Впрыск сторожа страницы. Ozon блокирует preload-скрипты, поэтому только через executeJavaScript. */
function _injectHook(el, log) {
  try {
    if (!window.api || !window.api.invoke || !el.executeJavaScript) return
    window.api.invoke('app:read-hook', 'ozon').then((hookCode) => {
      if (!hookCode) { try { log && log('WARN', '[ozon-bg] сторож не прочитан (пусто)') } catch (_) {} return }
      el.executeJavaScript(hookCode)
        .then(() => { try { log && log('INFO', '[ozon-bg] сторож впрыснут (executeJavaScript)') } catch (_) {} })
        .catch((e) => { try { log && log('WARN', '[ozon-bg] впрыск сторожа не удался: ' + ((e && e.message) || e)) } catch (_) {} })
    }).catch((e) => { try { log && log('WARN', '[ozon-bg] read-hook не удался: ' + ((e && e.message) || e)) } catch (_) {} })
  } catch (_) {}
}

/**
 * v1.2.376: САМО-ОСВЕЖЕНИЕ фоновой «Вопросы» (Ozon SPA не обновляет список после ответа в другом месте →
 * старый снимок → qa застывает). ТОЛЬКО «Вопросы»: их база переживает перезагрузку через localStorage
 * (нет повторных уведомлений); «Сообщения» НЕ трогаем (их база не персистится → reload проглотил бы новое).
 */
function _startReloadTimer(el, log, reloadMs, onGone) {
  if (!(reloadMs > 0) || el.__ccOzonBgReloadTimer) return
  el.__ccOzonBgReloadTimer = setInterval(() => {
    try {
      if (!el.isConnected) {
        clearInterval(el.__ccOzonBgReloadTimer); el.__ccOzonBgReloadTimer = null
        try { onGone && onGone() } catch (_) {} // v1.2.505: заодно гасим опрос вкладок, не дожидаясь его тика
        return
      }
      if (window.__ccNetOnline === false) return // v1.2.491: интернета нет (пульс) — освежать нечем
      if (typeof document !== 'undefined' && document.hidden) return // v1.2.377 (#3): окно свёрнуто → не тревожим Ozon
      if (el.reload) { el.reload(); log && log('INFO', '[ozon-bg] фоновая «Вопросы» освежена (reload)') }
    } catch (e) { log && log('WARN', '[ozon-bg] reload «Вопросы» не удался: ' + ((e && e.message) || e)) } // v1.2.377 (#5): не глотаем сбой молча
  }, reloadMs)
}

/** Счётчик раздела из ПОДСЧЁТА СТРОК сторожем. Правило «кто главнее» — общее, в shared/ozonCountMerge.js. */
function _routeCount(parsed, ozonId, setOzonCounts, log, seenLog) {
  if (parsed.section === 'msg' || parsed.section === 'qa') {
    if (seenLog[parsed.section] !== parsed.n) {
      seenLog[parsed.section] = parsed.n
      // v1.2.506: у «Вопросов» это число = сколько БЕЗ ОТВЕТА среди видимых строк. Сам значок
      // показывает точное «Новое» со страницы, а это число ложится рядом и видно в подсказке.
      log && log('INFO', '[ozon-bg] счётчик из фона: ' + parsed.section + '=' + parsed.n
        + (parsed.section === 'qa' ? ' (вопросов без ответа среди видимых)' : ' (значение для виджета/значка)'))
    }
    setOzonCounts && setOzonCounts(prev => {
      const r = applyOzonSectionCount(prev[ozonId], parsed.section, parsed.n)
      return r.next ? { ...prev, [ozonId]: r.next } : prev
    })
    return
  }
  if (parsed.section !== 'rv') return
  // Отзывы: подсчёт строк ВСЕГДА занижен (Ozon отдаёт список порциями, фоновую страницу никто не
  // листает). Что с ним делать — решает общее правило: при точном числе со вкладки игнорируем, после
  // его потери принимаем как есть (иначе значок не сможет упасть), иначе «только вверх» (ADR-038).
  let why = ''
  setOzonCounts && setOzonCounts(prev => {
    const r = applyOzonRowCount(prev[ozonId], parsed.n)
    why = r.reason
    return r.next ? { ...prev, [ozonId]: r.next } : prev
  })
  const line = '[ozon-bg] подсчёт строк дал rv=' + parsed.n + ' — ' + (
    why === 'ignored' ? 'не берём, есть точное число со вкладки'
      : why === 'rebase' ? 'приняли как есть (точное число потерялось)'
        : why === 'kept' ? 'не выше текущего, не трогаем'
          : 'приняли')
  if (seenLog.rvRows !== line) { seenLog.rvRows = line; log && log('INFO', line) }
}

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
    const { handleNewMessage, setOzonCounts, log, notify, periodicReloadMs, suppressFailNotice } = deps || {}
    // v1.2.396: последнее ЗАЛОГИРОВАННОЕ значение счётчика — чтобы писать в журнал только при РЕАЛЬНОМ
    // изменении, а не на каждый reload (после reload сторож переинжектится и повторно шлёт ту же цифру).
    const _seenLog = {}
    // v1.2.470→471: сбой больше не даёт карточку СРАЗУ — ждём, не поднимется ли страница сама.
    // Вся логика ожидания, повторов и ДОКАЗАТЕЛЬСТВ «страница жива» — в shared/ozonBgFailWatch.js.
    const _failWatch = createOzonBgFailWatch({
      log, notify, suppress: suppressFailNotice,
      reload: () => { if (el.reload && window.__ccNetOnline !== false) el.reload() }, // v1.2.491: без интернета не долбим
      alive: () => el.isConnected,
      probe: () => el.executeJavaScript && el.executeJavaScript('document.querySelectorAll("*").length'),
    })
    // v1.2.504: ТОЧНОЕ число новых отзывов берём со вкладки самой страницы. Всё решение (когда
    // спрашивать, чему верить, когда вернуться к подсчёту строк) — в shared/ozonTabPoll.js.
    const _tabs = createOzonTabPoll({
      exec: (code) => el.executeJavaScript(code),
      getUrl: () => (el.getURL ? el.getURL() : ''),
      isAlive: () => el.isConnected && typeof el.executeJavaScript === 'function',
      isOnline: () => window.__ccNetOnline !== false, // v1.2.491: без интернета спрашивать нечего
      setCount: (n, section) => setOzonCounts && setOzonCounts(prev => {
        const r = applyOzonExact(prev[ozonId], n, section)
        return r.next ? { ...prev, [ozonId]: r.next } : prev
      }),
      onLost: (section) => setOzonCounts && setOzonCounts(prev => {
        const r = clearOzonExact(prev[ozonId], section)
        return r.next ? { ...prev, [ozonId]: r.next } : prev
      }),
      log,
    })
    log && log('INFO', '[ozon-bg] страница создана, слушатель привязан')
    el.addEventListener('did-finish-load', () => {
      try {
        log && log('INFO', '[ozon-bg] страница загрузилась URL=' + (el.getURL ? el.getURL() : '?'))
        _failWatch.onLoaded()
        setTimeout(_tabs.ask, 4000) // страница только что загрузилась — вкладки появляются не мгновенно
        _tabs.start()               // дальше переспрашиваем сами; опрос гаснет, когда страницу убрали
      } catch (_) {}
    })
    // Загрузка не удалась. САМ СБОЙ пишем в журнал всегда. А тревожить ли человека, решает сторож
    // «подожди и посмотри»: сначала он даёт странице время подняться и один раз пробует загрузить заново.
    el.addEventListener('did-fail-load', (e) => {
      try {
        const code = e && e.errorCode
        log && log('WARN', '[ozon-bg] загрузка НЕ удалась code=' + code + ' ' + (e && e.errorDescription) + ' url=' + (e && e.validatedURL || ''))
        _failWatch.onFail(code, e && e.isMainFrame)
      } catch (_) {}
    })
    // v1.2.367: впрыскиваем на КАЖДЫЙ dom-ready (без «липкого» флага) — иначе после ПЕРЕЗАГРУЗКИ
    // фоновой страницы сторож бы не переставился и слежка тихо умерла. Повтор в ТОЙ ЖЕ странице
    // безопасен: гвард `window.__ccOzonWatch` в самом хуке не даёт запуститься дважды.
    el.addEventListener('dom-ready', () => {
      try { log && log('INFO', '[ozon-bg] dom-ready (страница готова)') } catch (_) {}
      _injectHook(el, log)
    })
    let _firstMsg = true
    el.addEventListener('console-message', (e) => {
      try {
        const msg = (e && (e.message || (e.details && e.details.message))) || ''
        if (_firstMsg) { _firstMsg = false; try { log && log('INFO', '[ozon-bg] первое console-сообщение из страницы получено') } catch (_) {} }
        if (!msg || msg.indexOf('__CC_') !== 0) return
        const parsed = parseConsoleMessage(msg)
        if (!parsed) return
        // v1.2.471: 🔴 засчитываем как «страница жива» ТОЛЬКО то, чего на пустой странице-ошибке
        // Chromium быть не может (уведомление или счётчик > 0).
        if (isOzonAliveProof(parsed)) _failWatch.onHookProof()
        if (parsed.type === 'ozon_count') { _routeCount(parsed, ozonId, setOzonCounts, log, _seenLog); return }
        // Уведомление о новом (вопрос без ответа / сообщение покупателя / отзыв) → общий конвейер.
        // background:true — НЕ переключать активную вкладку (фоновый источник не крадёт фокус, v1.2.359).
        if (parsed.type === 'notification' && (parsed.source === 'ozon-questions' || parsed.source === 'ozon-list' || parsed.source === 'ozon-reviews')) {
          const extra = { senderName: parsed.title || '', chatTag: parsed.tag || '', notifSource: parsed.source, fromNotifAPI: false, background: true }
          const _kind = parsed.source === 'ozon-list' ? 'сообщение' : parsed.source === 'ozon-reviews' ? 'отзыв' : 'вопрос'
          // v1.2.438: память «уже показывали» ЖИВЁТ У НАС (переживает перезагрузку фоновой страницы).
          // Память внутри страницы Ozon НЕ работает: запись в её localStorage не доходит.
          const _dd = shouldSkipOzonNotif(parsed.source, parsed.tag, parsed.body)
          if (_dd.skip) { log && log('INFO', `[ozon-bg] повтор подавлен (${_kind}, ${Math.round(_dd.ageMs / 1000)}с назад): «${(parsed.body || '').slice(0, 40)}»`); return }
          log && log('INFO', `[ozon-bg] фон: ${_kind} «${(parsed.body || '').slice(0, 40)}»`)
          handleNewMessage && handleNewMessage(ozonId, parsed.body || '', extra)
          return
        }
        // Диагностика скана из фоновой страницы (подтверждает, что сторож жив и видит список/таблицу).
        if (parsed.type === 'diagnostic' && /ozon-q scan|ozon-list reason=|no-answers-col|ozon-r /.test(parsed.text || '')) {
          log && log('INFO', `[ozon-bg] ${parsed.text}`)
        }
      } catch (_) {}
    })
    _startReloadTimer(el, log, Number(periodicReloadMs) || 0, _tabs.stop)
  } catch (_) {}
}
