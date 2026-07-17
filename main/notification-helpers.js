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
function createPinBtn(senderName, fullText, time, color, messengerId, iconDataUrl) {
  const btn = document.createElement('button')
  btn.className = 'pin-msg-btn'
  btn.textContent = '\u{1F4CC}'
  btn.title = 'Закрепить'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    // v1.2.60: передаём аватар (icon), чтобы карточка закрепа его показала
    window.notifApi.pinMessage({ sender: senderName, text: fullText, time: time, color: color, messengerId: messengerId || '', icon: iconDataUrl || '' })
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

// v1.2.65: сетка миниатюр альбома (media group) в карточке уведомления.
// Показывает до 4 плиток (2×2); на 4-й — бейдж «+N» если фото больше. Клик по
// плитке открывает ТУ ЖЕ смотрелку что и в программе: window.notifApi.openPhoto
// → notif:open-photo → main → главное окно качает полноразмеры → photo:open.
// thumbs — strippedThumb (крошечные встроенные превью TDLib, мгновенно, без загрузки).
function renderAlbumGrid(album) {
  const grid = document.createElement('div')
  grid.className = 'album-grid'
  const thumbs = Array.isArray(album && album.thumbs) ? album.thumbs : []
  const total = (album && album.count) || thumbs.length
  const shown = Math.min(thumbs.length, 4)
  for (let i = 0; i < shown; i++) {
    const tile = document.createElement('div')
    tile.className = 'album-tile'
    tile.style.backgroundImage = 'url("' + thumbs[i] + '")'
    if (i === 3 && total > 4) {
      const more = document.createElement('div')
      more.className = 'album-more'
      more.textContent = '+' + (total - 4)
      tile.appendChild(more)
    }
    tile.addEventListener('click', (e) => {
      e.stopPropagation()
      try {
        window.notifApi.openPhoto({ chatId: album.chatId, messageIds: album.messageIds || [], index: i })
      } catch (_) {}
    })
    grid.appendChild(tile)
  }
  return grid
}

// v1.2.66: продление жизни карточки-хоста альбома. При приходе новой части альбома
// сбрасываем таймер автозакрытия (карточка не закроется посреди прихода) и
// перезапускаем анимацию прогресс-бара. dismissItem — колбэк из notification.js
// (замыкает локальный state). Это тот же приём, что и в stackMessageIntoHost.
function extendHostLife(host, dismissItem) {
  if (!host || !host.dismissMs || host.dismissMs <= 0) return
  clearTimeout(host.timer)
  host.remainingMs = host.dismissMs
  host.startTs = Date.now()
  const hid = host.el.dataset.id
  host.timer = setTimeout(() => dismissItem(hid, false), host.dismissMs)
  const progress = host.el.querySelector('.progress-bar')
  if (progress) {
    progress.style.animation = 'none'
    void progress.offsetHeight
    progress.style.animation = 'shrink ' + (host.dismissMs / 1000) + 's linear forwards'
  }
}

// v1.2.66: «живая карточка» альбома (update-on-arrival). Добавляет плитку в
// существующую карточку-хост и ПЕРЕРИСОВЫВАЕТ сетку целиком из накопленного
// host.album (thumbs ≤4, messageIds — все, count — общий). Механизм без таймера-
// угадывания: карточка отражает то, что реально пришло на данный момент.
// Позиция TDLib: точного «конца альбома» нет, группируем по media_album_id по мере
// прихода — https://github.com/tdlib/td/issues/2523.
function addAlbumTileToHost(host, data, dismissItem, reportHeight) {
  if (!host || !host.album || !data.album) return false
  const a = host.album
  if (data.album.tileMessageId) a.messageIds.push(data.album.tileMessageId)
  a.count++
  if (a.thumbs.length < 4 && data.album.tileThumb) a.thumbs.push(data.album.tileThumb)
  const oldGrid = host.el.querySelector('.album-grid')
  if (oldGrid) oldGrid.replaceWith(renderAlbumGrid(a))
  // v1.2.66 (Совет 5): подпись альбома может прийти в поздней части (не в первой).
  // Если карточка ещё без подписи, а у этой части есть текст — подставляем его в body.
  if (!a.hasCaption && data.album.tileText) {
    const bt = host.el.querySelector('.body-text')
    if (bt) {
      const span = bt.querySelector('.msg-text-content')
      if (span) span.textContent = data.album.tileText
      else bt.textContent = data.album.tileText
      a.hasCaption = true
    }
  }
  extendHostLife(host, dismissItem)
  if (typeof reportHeight === 'function') { reportHeight(); setTimeout(reportHeight, 220) }
  return true
}

// Экспорт в global scope (browser <script> и так делает это автоматически,
// но явно фиксируем через window для тестов и линта).
window.createPinBtn = createPinBtn
window.__ccNotifHelpers = { calcHeight, pauseItem, resumeItem, forceFinalSlideInState, renderAlbumGrid, extendHostLife, addAlbumTileToHost }
