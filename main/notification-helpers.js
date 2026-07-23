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

// v1.2.65: сетка миниатюр альбома (media group) в карточке уведомления.
// Показывает до 4 плиток (2×2); на 4-й — бейдж «+N» если фото больше. Клик по
// плитке открывает ТУ ЖЕ смотрелку что и в программе: window.notifApi.openPhoto
// → notif:open-photo → main → главное окно качает полноразмеры → photo:open.
// thumbs — strippedThumb (крошечные встроенные превью TDLib, мгновенно, без загрузки).
// v1.2.74: сетка альбома с ЛИСТАНИЕМ страницами по 4 (вместо «+N»).
// - высота области фиксирована (CSS .album-grid height) → карточка не прыгает;
// - неполная последняя страница раскладывается ровно (1 фото — на всю ширину,
//   3 фото — нижнее широкое) без «дырки»;
// - плитка чёткая, если чёткое превью уже догружено (album.sharpThumbs[mid]),
//   иначе мутная заглушка (strippedThumb) + крутилка (A1, applyAlbumSharp);
// - клик по плитке открывает смотрелку на весь экран (B1).
const ALBUM_PAGE = 4
function renderAlbumGrid(album) {
  const ids = Array.isArray(album && album.messageIds) ? album.messageIds : []
  const thumbs = Array.isArray(album && album.thumbs) ? album.thumbs : []
  const total = ids.length || thumbs.length
  // v1.2.99: одиночное фото (album.id 'single_*') — вариант «размытый фон» (фото целиком).
  const isSingle = String((album && album.id) || '').startsWith('single_')
  const pages = Math.max(1, Math.ceil(total / ALBUM_PAGE))
  if (typeof album.page !== 'number') album.page = 0
  if (album.page >= pages) album.page = pages - 1
  if (album.page < 0) album.page = 0

  const container = document.createElement('div')
  container.className = 'album-container'
  const wrap = document.createElement('div'); wrap.className = 'album-wrap'
  const grid = document.createElement('div'); grid.className = 'album-grid'
  const prev = document.createElement('button'); prev.className = 'album-arrow l'; prev.textContent = '‹'; prev.title = 'Предыдущие 4'
  const next = document.createElement('button'); next.className = 'album-arrow r'; next.textContent = '›'; next.title = 'Следующие 4'
  const count = document.createElement('div'); count.className = 'album-count'
  wrap.appendChild(grid); wrap.appendChild(prev); wrap.appendChild(next); wrap.appendChild(count)
  const dots = document.createElement('div'); dots.className = 'album-dots'
  container.appendChild(wrap); container.appendChild(dots)

  function renderPage() {
    grid.innerHTML = ''
    const start = album.page * ALBUM_PAGE
    const end = Math.min(start + ALBUM_PAGE, total)
    const cnt = end - start
    grid.style.gridTemplateRows = (cnt <= 2) ? '1fr' : 'repeat(2, 1fr)'
    for (let i = start; i < end; i++) {
      const localIdx = i - start
      const mid = ids[i]
      const sharp = album.sharpThumbs && mid != null ? album.sharpThumbs[mid] : null
      const tile = document.createElement('div')
      // v1.2.99: у одиночного фото нет общего блюра тайла (его даёт слой .sp-blur), только крутилка.
      tile.className = 'album-tile' + (isSingle ? ' single' : '') + (sharp ? '' : (isSingle ? ' loading' : ' blur loading'))
      if (cnt === 1 || (cnt === 3 && localIdx === 2)) tile.classList.add('wide')
      if (mid != null) tile.dataset.mid = String(mid)
      const tileUrl = 'url("' + (sharp || thumbs[i] || '') + '")'
      if (isSingle) {
        // размытая растянутая копия заполняет поля + фото целиком (contain) сверху
        const b = document.createElement('div'); b.className = 'sp-blur'; b.style.backgroundImage = tileUrl
        const f = document.createElement('div'); f.className = 'sp-main'; f.style.backgroundImage = tileUrl
        tile.appendChild(b); tile.appendChild(f)
      } else {
        tile.style.backgroundImage = tileUrl
      }
      const spin = document.createElement('div'); spin.className = 'tile-spin'; tile.appendChild(spin)
      // v1.2.100: страховка от «вечной» крутилки у одиночного фото — если чёткое превью
      // не пришло за 8с (сбой загрузки), снимаем крутилку (остаётся фото целиком из strippedThumb).
      if (isSingle && !sharp) setTimeout(() => tile.classList.remove('loading'), 8000)
      // v1.2.101: видео — значок ▶ поверх постера; клик открывает видео-плеер (как в чате).
      // v1.2.102: класс is-video → курсор «палец» (не лупа zoom-in, как у фото).
      if (album.isVideo) { tile.classList.add('is-video'); const pl = document.createElement('div'); pl.className = 'tile-play'; pl.textContent = '▶'; tile.appendChild(pl) }
      const gi = i
      tile.addEventListener('click', (e) => {
        e.stopPropagation()
        if (album.isVideo) {
          try { window.notifApi.openVideo({ chatId: album.chatId, messageId: ids[gi] }) } catch (_) {}
          // v1.2.102: видимый отклик — видео качается целиком перед открытием (может быть не мгновенно).
          tile.classList.add('loading'); setTimeout(() => tile.classList.remove('loading'), 20000)
        }
        else { try { window.notifApi.openPhoto({ chatId: album.chatId, messageIds: ids, index: gi }) } catch (_) {} }
      })
      grid.appendChild(tile)
    }
    count.textContent = (start + 1) + (cnt > 1 ? '–' + end : '') + ' / ' + total
    prev.classList.toggle('disabled', album.page === 0)
    next.classList.toggle('disabled', album.page >= pages - 1)
    dots.innerHTML = ''
    if (pages > 1) {
      for (let p = 0; p < pages; p++) {
        const d = document.createElement('div'); d.className = 'd' + (p === album.page ? ' on' : '')
        ;(function (k) { d.addEventListener('click', function () { album.page = k; renderPage() }) })(p)
        dots.appendChild(d)
      }
    }
  }
  prev.addEventListener('click', (e) => { e.stopPropagation(); if (album.page > 0) { album.page--; renderPage() } })
  next.addEventListener('click', (e) => { e.stopPropagation(); if (album.page < pages - 1) { album.page++; renderPage() } })
  if (pages <= 1) { prev.style.display = 'none'; next.style.display = 'none' }
  renderPage()
  return container
}

// v1.2.74 (A1): применить догруженное ЧЁТКОЕ превью к плитке альбома по messageId.
// Сохраняет в album.sharpThumbs (чтобы не потерять при листании), и если плитка
// сейчас видна — сразу заменяет фон и убирает крутилку.
function applyAlbumSharp(host, mid, src) {
  if (!host || !host.album || !src || mid == null) return
  if (!host.album.sharpThumbs) host.album.sharpThumbs = {}
  host.album.sharpThumbs[String(mid)] = src
  const tile = host.el.querySelector('.album-tile[data-mid="' + String(mid) + '"]')
  if (tile) {
    const url = 'url("' + src + '")'
    // v1.2.99: одиночное фото — обновляем ОБА слоя (размытый фон + фото); иначе фон тайла.
    const f = tile.querySelector('.sp-main'), b = tile.querySelector('.sp-blur')
    if (f) { f.style.backgroundImage = url; if (b) b.style.backgroundImage = url }
    else tile.style.backgroundImage = url
    tile.classList.remove('blur', 'loading')
  }
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
  // v1.2.74: храним ВСЕ превью и id (не только 4) — нужно для листания страницами.
  a.messageIds.push(data.album.tileMessageId != null ? data.album.tileMessageId : null)
  a.thumbs.push(data.album.tileThumb || '')
  a.count = a.messageIds.length
  const oldC = host.el.querySelector('.album-container')
  if (oldC) oldC.replaceWith(renderAlbumGrid(a))
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

// Экспорт в global scope (browser <script> и так делает это автоматически,
// но явно фиксируем через window для тестов и линта).
window.createPinBtn = createPinBtn
window.__ccNotifHelpers = { calcHeight, pauseItem, resumeItem, forceFinalSlideInState, renderAlbumGrid, extendHostLife, addAlbumTileToHost, applyAlbumSharp, buildStackHeader }
