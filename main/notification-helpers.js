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

// v1.2.479: набор ДОПОЛНЯЕТСЯ, а не создаётся заново — рядом лежит notification-album.js,
// который кладёт сюда же свои четыре функции; порядок подключения файлов при этом не важен.
Object.assign(window.__ccNotifHelpers = window.__ccNotifHelpers || {}, { calcHeight, pauseItem, resumeItem, forceFinalSlideInState, buildStackHeader, computeRendererPure, shouldAutoScroll })
