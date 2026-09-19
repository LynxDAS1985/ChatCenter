// v1.2.12: вспомогательные функции для notification.js.
// Подключается ДО notification.js через <script src=...> в notification.html.
// Все функции в этом файле — global scope (как notification.js — не IIFE).
//
// Условия извлечения: функция НЕ ЗАМЫКАЕТ локальный state notification.js
// (items / stacks / container и т.д.). Только чистые функции и helpers
// которые принимают зависимости через параметры.
//
// Подробности — features.md v1.2.12 «разбиение notification.js по лимиту 700».
//
// ВНИМАНИЕ: если функция замыкает переменную из notification.js — НЕ
// переносить сюда без переделки на параметры. Сломается scope.

// ── v0.65.0: Создание кнопки 📌 для закрепления сообщения ──
// Не замыкает state — все данные через параметры + window.notifApi.
function createPinBtn(senderName, fullText, time, color, messengerId, iconDataUrl, messengerName, accountName) {
  const btn = document.createElement('button')
  btn.className = 'pin-msg-btn'
  btn.textContent = '\u{1F4CC}'
  btn.title = 'Закрепить'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    // v1.2.60: передаём аватар (icon), чтобы карточка закрепа его показала
    // v1.2.75: + messengerName (источник, напр. «Telegram») — иначе для native_cc
    // подсказка не знала «откуда» (в списке мессенджеров его нет).
    window.notifApi.pinMessage({ sender: senderName, text: fullText, time: time, color: color, messengerId: messengerId || '', icon: iconDataUrl || '', messengerName: messengerName || '', accountName: accountName || '' })
    btn.textContent = '✓'
    btn.style.color = '#4ade80'
    btn.style.background = 'rgba(34,197,94,0.2)'
    setTimeout(() => { btn.textContent = '\u{1F4CC}'; btn.style.color = ''; btn.style.background = '' }, 1000)
  })
  return btn
}

// ── v1.2.12: helpers вынесены при разбиении notification.js (потолок 700) ──

// v0.89.23 (Баг #1): calcHeight игнорирует элементы в процессе slideIn animation
// (transform: translateX(380px) до окончания анимации) — иначе видна «пустая полоса».
// Принимает container (один глобал в notification.js — передаётся как параметр).
function calcHeight(container) {
  let h = 0
  for (const child of container.children) {
    if (child.style.pointerEvents === 'none') continue
    if (child.dataset.slideInDone === 'false') continue
    const ch = child.offsetHeight
    if (ch > 0) h += ch + 4
  }
  return h > 0 ? h + 4 : 0
}

// v0.60.3: pauseItem ставит на паузу таймер dismiss и анимацию progress-bar.
// Замыкает только item (через параметр) — функция чистая.
function pauseItem(item) {
  if (item.paused || !item.dismissMs || item.dismissMs <= 0) return
  item.remainingMs -= (Date.now() - item.startTs)
  if (item.remainingMs < 0) item.remainingMs = 0
  clearTimeout(item.timer)
  item.timer = null
  item.paused = true
  const progress = item.el.querySelector('.progress-bar')
  if (progress) progress.style.animationPlayState = 'paused'
  item.el.classList.add('hovered')
}

// v0.60.3: resumeItem продолжает таймер dismiss + анимацию.
// onDismiss(id) — callback вызывается через setTimeout (в notification.js — dismissItem).
function resumeItem(item, onDismiss) {
  if (!item.paused || !item.dismissMs || item.dismissMs <= 0) return
  item.paused = false
  item.startTs = Date.now()
  const progress = item.el.querySelector('.progress-bar')
  if (progress) progress.style.animationPlayState = 'running'
  const id = item.el.dataset.id
  item.timer = setTimeout(() => onDismiss(id, false), item.remainingMs || 3000)
  item.el.classList.remove('hovered')
}

// v0.89.38: forceFinalSlideInState — гарантия финального состояния slideIn keyframe.
// CSS animation forwards не гарантирует translateX(0) при частичной прерванной анимации.
function forceFinalSlideInState(el) {
  el.style.animation = 'none'
  el.style.transform = 'translateX(0) scale(1)'
  el.style.opacity = '1'
}

// v1.2.98: шапка карточки — аватар + колонка (имя + источник «Мессенджер · Аккаунт»).
// v1.2.108: + время (по настройке) в строке источника, ПРИЖАТО ВПРАВО (margin-left:auto):
//   «Telegram · БНК                    10:38». Единый формат всех уведомлений.
// Источник в том же формате, что и подсказка закрепа (pin-tooltip.html): messengerName · accountName.
// Аватар (avWrap) уже создан в notification.js — appendChild ПЕРЕМЕЩАЕТ его в шапку (не копирует, MDN).
function buildStackHeader(avWrap, sender, messengerName, accountName, time) {
  const head = document.createElement('div'); head.className = 'notif-head'
  const col = document.createElement('div'); col.className = 'notif-head-col'
  col.appendChild(sender)
  const parts = [messengerName, accountName].filter(Boolean)
  if (parts.length || time) {
    const src = document.createElement('div'); src.className = 'notif-source'
    const txt = document.createElement('span'); txt.className = 'notif-source-text'; txt.textContent = parts.join(' · ')
    src.appendChild(txt)
    if (time) { const t = document.createElement('span'); t.className = 'notif-source-time'; t.textContent = time; src.appendChild(t) }
    col.appendChild(src)
  }
  head.appendChild(avWrap); head.appendChild(col)
  return head
}

// v1.2.128: чистое вычисление rendererPure — сигнал main «в окне уведомления пусто».
// Вынесено из reportHeight (notification.js), чтобы проверять тестом (раньше формула жила
// инлайн и молча ломала закрытие — «невидимая стена», см. mistakes/notifications-ribbon.md).
// Обычно «пусто» = ноль записей И ноль DOM-детей. dismissFinal=true — отчёт ПОСЛЕ завершения
// закрытия карточки: тогда «пусто» также по ВИДИМОЙ высоте (visibleHeight===0), даже если в
// items/DOM завис невидимый огрызок высотой 0 (ghost стопки/альбома). Флаг ставится ТОЛЬКО в
// финале закрытия — при добавлении visibleHeight===0 = карточка ещё выезжает (гасить нельзя).
function computeRendererPure({ itemsCount, containerCount, visibleHeight, dismissFinal } = {}) {
  const empty = (Number(itemsCount) || 0) === 0 && (Number(containerCount) || 0) === 0
  return empty || (!!dismissFinal && (Number(visibleHeight) || 0) === 0)
}

// Экспорт в global scope (browser <script> и так делает это автоматически,
// но явно фиксируем через window для тестов и линта).
window.createPinBtn = createPinBtn
// v1.2.221: авто-скролл к новому уведомлению — ТОЛЬКО если юзер уже у низа списка.
// Если он прокрутил вверх (читает старые карточки), НЕ дёргаем список вниз: иначе при потоке
// сообщений кнопки «уезжают» из-под курсора и клик не попадает. Порог 90px (≈край карточки).
// Факт уровня 1 (MDN): «прокручено до низа» = scrollHeight − scrollTop − clientHeight ≈ 0.
function shouldAutoScroll({ scrollHeight, scrollTop, clientHeight } = {}) {
  return ((Number(scrollHeight) || 0) - (Number(scrollTop) || 0) - (Number(clientHeight) || 0)) <= 90
}

// ── v1.2.486: ДИАГНОСТИКА ЖАЛОБЫ «крестик у карточки не реагирует» ──
//
// ЧТО ИЗВЕСТНО ТОЧНО (по журналу chatcenter.log за 19.09.2026):
//   • 18 сентября карточки закрывались — 25 записей «dismiss start … fromMain=false»;
//   • 19 сентября за ВЕСЬ день (12:22 → 13:58, стопка из 6 карточек) — НИ ОДНОЙ такой
//     записи, при этом «items=6 containerChildren=6» не менялось ни разу;
//   • после перезапуска в 14:02 первое же закрытие прошло («dismiss start id=1»).
// Значит dismissItem даже не начинался. Отличить «нажатие не дошло до кнопки» от
// «кнопка сработала, а функция вышла сразу» было НЕЧЕМ: оба ранних выхода
// (!item, item.dismissing) стоят ДО первой записи в журнал.
//
// Ниже три записи, которых раньше не было. Поведение они не меняют — только
// рассказывают, что произошло.

// Нажали крестик: дошло ли нажатие и в каком состоянии карточка и окно.
// Прокрутка нужна, потому что стопка бывает выше окна (1083 точки при окне 796) —
// тогда часть карточек физически за краем.
function logCloseClick(id, items, container) {
  try {
    const item = items && items.get ? items.get(id) : null
    window.notifApi.log('INFO', 'close-click id=' + id
      + ' естьВСписке=' + !!item
      + ' ужеЗакрывается=' + !!(item && item.dismissing)
      + ' карточек=' + (items && items.size) + ' вОкне=' + (container ? container.children.length : '?')
      + ' прокрутка=' + (container ? Math.round(container.scrollTop) + '/' + container.clientHeight + '/' + container.scrollHeight : '?'))
  } catch (_) {}
}

// Закрытие отказалось начинаться. Раньше это был молчаливый выход без следа.
function logDismissSkip(id, reason) {
  try { window.notifApi.log('WARN', 'закрытие НЕ началось id=' + id + ' причина=' + reason) } catch (_) {}
}

// v1.2.486: падения кода ВНУТРИ окна уведомлений раньше не попадали в журнал вообще
// (console.* окна туда не пишет, перехвата ошибок не было). Если обработчик кнопки
// не навесился из-за ошибки выше по коду — теперь это будет видно строкой в журнале.
function installNotifErrorReporter() {
  if (window.__ccNotifErrHooked) return
  window.__ccNotifErrHooked = true
  window.addEventListener('error', (e) => {
    try {
      window.notifApi.log('ERROR', 'ОШИБКА В ОКНЕ УВЕДОМЛЕНИЙ: ' + String((e && e.message) || '?').slice(0, 200)
        + ' @' + String((e && e.filename) || '?').split('/').pop() + ':' + ((e && e.lineno) || 0))
    } catch (_) {}
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason
    try { window.notifApi.log('ERROR', 'ОШИБКА В ОКНЕ УВЕДОМЛЕНИЙ (обещание): ' + String((r && r.message) || r || '?').slice(0, 200)) } catch (_) {}
  })
}

// v1.2.486: подробный снимок карточек в окне — перенесён СЮДА из notification.js
// (тот стоял 729/730, и без переноса не влезала ни одна новая строка).
// Показывает, почему карточка не считается видимой: прозрачность, «сквозная» для мыши,
// незаконченный выезд.
function logDomSnapshot(container) {
  try {
    const details = []
    for (let i = 0; i < container.children.length; i++) {
      const c = container.children[i]
      const cs = c.style
      let computedTf = 'none'
      try { computedTf = window.getComputedStyle(c).transform || 'none' } catch (_) {}
      details.push('[' + i + ' id=' + ((c.dataset && c.dataset.id) || '?') +
        ' h=' + c.offsetHeight +
        ' op=' + (cs.opacity || '1') +
        ' pe=' + (cs.pointerEvents || 'auto') +
        ' inlineTf=' + (cs.transform || 'none').replace(/\s+/g, '') +
        ' realTf=' + computedTf.replace(/\s+/g, '').slice(0, 40) +
        ' slid=' + ((c.dataset && c.dataset.slideInDone) || '?') + ']')
    }
    if (details.length) window.notifApi.log('TRACE', 'DOM snapshot ' + details.join(' '))
  } catch (_) {}
}

// Ставим перехват сразу: этот файл подключается ПЕРВЫМ (notification.html), до
// notification.js — значит поймаем и ошибку при его загрузке.
installNotifErrorReporter()

// v1.2.487: мышь СО СТОРОНЫ СТРАНИЦЫ (уровень 2 наблюдателя; уровень 1 — оболочка окна,
// main/handlers/notifInputProbe.js). Нажатие пишем каждое, движение — не чаще раза в 10 с.
// Сопоставление по времени с «[notif-input] оболочка: mouseDown» даёт диагноз:
//   оболочка есть, страницы нет → обрыв внутри окна; нет ни того, ни другого → Windows не отдаёт.
function installNotifMouseProbe() {
  if (window.__ccNotifMouseHooked) return
  window.__ccNotifMouseHooked = true
  let lastMoveLog = 0
  document.addEventListener('mousemove', () => {
    const now = Date.now()
    if (now - lastMoveLog < 10000) return
    lastMoveLog = now
    try { window.notifApi.log('TRACE', 'page: мышь над окном (движение)') } catch (_) {}
  }, true)
  document.addEventListener('mousedown', (e) => {
    const t = e && e.target
    const name = t && t.tagName ? (t.tagName + '.' + String(t.className || '').split(' ')[0]).slice(0, 40) : '?'
    try { window.notifApi.log('INFO', 'page: mousedown x=' + e.clientX + ' y=' + e.clientY + ' цель=' + name) } catch (_) {}
  }, true)
}
installNotifMouseProbe()

// v1.2.479: набор ДОПОЛНЯЕТСЯ, а не создаётся заново — рядом лежит notification-album.js,
// который кладёт сюда же свои четыре функции; порядок подключения файлов при этом не важен.
Object.assign(window.__ccNotifHelpers = window.__ccNotifHelpers || {}, { calcHeight, pauseItem, resumeItem, forceFinalSlideInState, buildStackHeader, computeRendererPure, shouldAutoScroll, logCloseClick, logDismissSkip, logDomSnapshot, installNotifErrorReporter, installNotifMouseProbe })
