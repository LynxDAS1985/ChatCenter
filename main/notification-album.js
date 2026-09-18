// v1.2.479 — АЛЬБОМ В КАРТОЧКЕ УВЕДОМЛЕНИЯ: сетка плиток, догрузка чёткого превью,
// «живая карточка» (когда части альбома приходят по одной).
//
// ── ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ ──────────────────────────────────────────────────────
// Выделено из `notification-helpers.js` в v1.2.479: тот дорос ровно до своего потолка
// (300 строк), а правило проекта запрещает резать комментарии ради места — надо выносить.
// Альбом — самый крупный и самый обособленный кусок: свои функции, свои данные, наружу
// торчат четыре имени. Остальному помощнику карточки он не нужен.
//
// ── КАК ПОДКЛЮЧЕНО ────────────────────────────────────────────────────────────
// Обычный <script src> в `notification.html` (окно уведомления не собирается сборщиком,
// файлы копируются как есть — см. electron.vite.config.js). Функции кладутся в ТОТ ЖЕ
// общий набор `window.__ccNotifHelpers`, поэтому все прежние вызовы вида
// `window.__ccNotifHelpers.renderAlbumGrid(...)` работают без изменений.
// Порядок подключения не важен: и здесь, и в помощнике набор ДОПОЛНЯЕТСЯ (Object.assign),
// а не создаётся заново — иначе тот, кто грузится вторым, стёр бы чужие функции.

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
  // v1.2.478: «single_web_…» — готовое фото из веб-мессенджера (ВК): догружать нечего (крутилка
  // не нужна), а полноразмерная смотрелка умеет только TDLib → клик по плитке ей не отдаём.
  const isWeb = String((album && album.id) || '').startsWith('single_web_')
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
      tile.className = 'album-tile' + (isSingle ? ' single' : '') + ((sharp || isWeb) ? '' : (isSingle ? ' loading' : ' blur loading'))
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
      if (isSingle && !sharp && !isWeb) setTimeout(() => tile.classList.remove('loading'), 8000)
      // v1.2.101: видео — значок ▶ поверх постера; клик открывает видео-плеер (как в чате).
      // v1.2.102: класс is-video → курсор «палец» (не лупа zoom-in, как у фото).
      if (album.isVideo) { tile.classList.add('is-video'); const pl = document.createElement('div'); pl.className = 'tile-play'; pl.textContent = '▶'; tile.appendChild(pl) }
      const gi = i
      tile.addEventListener('click', (e) => {
        if (isWeb) return // веб-фото: клик не перехватываем — пусть сработает обычный переход в чат по карточке
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

// Дополняем общий набор (не создаём заново — иначе затрём функции помощника).
Object.assign(window.__ccNotifHelpers = window.__ccNotifHelpers || {}, { renderAlbumGrid, applyAlbumSharp, extendHostLife, addAlbumTileToHost })
