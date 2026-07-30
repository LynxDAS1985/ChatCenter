  const MAX_AUTO_DISMISS_ITEMS = 6
  const MAX_PERSISTENT_ITEMS = 30
  const container = document.getElementById('container')
  const items = new Map() // id → { el, timer, expanded, remainingMs, startTs, dismissMs, paused }
  // v0.63.0: стэк — messengerId → hostItemId (id карточки, в которую складываются сообщения)
  const stacks = new Map() // messengerId → { hostId, childIds: [id,...] }
  // v1.2.66: альбомы (media group) — album.id → hostItemId. «Живая карточка»:
  // первая часть создаёт карточку с сеткой, следующие с тем же id дорисовывают
  // плитку в неё (без таймера-угадывания). См. notification-helpers.js addAlbumTileToHost.
  const albumHosts = new Map()
  let groupingEnabled = false
  let showTimeEnabled = true // v0.63.8: показ времени перед текстом (настройка из settings)
  let hoveredItemId = null
  // v0.60.6: каскадное появление — очередь задержки
  let cascadeQueue = 0
  let cascadeTimer = null

  // v1.2.12: calcHeight вынесена в notification-helpers.js (потолок 700).
  // Локальная обёртка передаёт `container` — единый глобал этого файла.
  function calcHeight() { return window.__ccNotifHelpers.calcHeight(container) }

  function scrollContainerToLatest() {
    requestAnimationFrame(() => {
      try { container.scrollTop = container.scrollHeight } catch (_) {}
    })
  }

  function reportHeight(heartbeat, dismissFinal) {
    setTimeout(() => {
      const h = calcHeight()
      // v0.89.27: передаём также количество items + containerChildren — main
      // использует это как авторитативный сигнал terminal state (когда оба=0,
      // окно ОБЯЗАНО скрыться, независимо от main notifItems[] мусора от
      // ghost-stacking накопления). См. ловушка #26.
      const itemsCount = items.size
      const containerCount = container.children.length
      // v1.2.127: heartbeat-отчёт (по запросу сторожа) — только размер + флаг, БЕЗ диагностики в лог (иначе спам каждый тик).
      if (heartbeat) { window.notifApi.resize(h, { rendererPure: window.__ccNotifHelpers.computeRendererPure({ itemsCount, containerCount }), heartbeat: true }); return }
      // v0.89.20: diagnostic — что ИМЕННО уходит в main для setBounds.
      try { window.notifApi.log('INFO', 'reportHeight→resize(' + h + ') items=' + itemsCount + ' containerChildren=' + containerCount) } catch (_) {}
      // v0.89.21: ДЕТАЛЬНЫЙ снэпшот ВСЕХ DOM-элементов для диагностики stale state.
      // v0.89.23: добавлен computed transform (CSS animation НЕ пишется в
      // el.style.transform — только в getComputedStyle, см. MDN).
      // Также добавлен slideInDone флаг — пропускается ли элемент в calcHeight.
      try {
        const details = []
        for (let i = 0; i < container.children.length; i++) {
          const c = container.children[i]
          const cs = c.style
          let computedTf = 'none'
          try { computedTf = window.getComputedStyle(c).transform || 'none' } catch (_) {}
          details.push('[' + i + ' id=' + (c.dataset?.id || '?') +
            ' h=' + c.offsetHeight +
            ' op=' + (cs.opacity || '1') +
            ' pe=' + (cs.pointerEvents || 'auto') +
            ' inlineTf=' + (cs.transform || 'none').replace(/\s+/g, '') +
            ' realTf=' + computedTf.replace(/\s+/g, '').slice(0, 40) +
            ' slid=' + (c.dataset?.slideInDone || '?') + ']')
        }
        if (details.length) window.notifApi.log('TRACE', 'DOM snapshot ' + details.join(' '))
      } catch (_) {}
      // v0.89.27: rendererPure — terminal signal для main (ловушка #26).
      // v1.2.128: считаем через чистую computeRendererPure (тестируется). dismissFinal →
      // «пусто» также по видимой высоте (h===0), см. notification-helpers.js.
      const rendererPure = window.__ccNotifHelpers.computeRendererPure({ itemsCount, containerCount, visibleHeight: h, dismissFinal })
      window.notifApi.resize(h, { rendererPure })
    }, 60)
  }

  // ── Per-item hover (v0.60.3) — функции вынесены в notification-helpers.js v1.2.12 ──
  // resumeItem замыкает локальный dismissItem через колбэк (он не вынесен — слишком много state).
  function pauseItem(item) { window.__ccNotifHelpers.pauseItem(item) }
  function resumeItem(item) { window.__ccNotifHelpers.resumeItem(item, dismissItem) }

  container.addEventListener('mousemove', (e) => {
    const target = e.target.closest('.notif-item')
    const newId = target ? target.dataset.id : null
    if (newId === hoveredItemId) return
    if (hoveredItemId) {
      const oldItem = items.get(hoveredItemId)
      if (oldItem && !oldItem.isStackChild) resumeItem(oldItem)
    }
    hoveredItemId = newId
    if (newId) {
      const newItem = items.get(newId)
      if (newItem && !newItem.isStackChild) pauseItem(newItem)
    }
  })

  container.addEventListener('mouseleave', () => {
    if (hoveredItemId) {
      const item = items.get(hoveredItemId)
      if (item && !item.isStackChild) resumeItem(item)
      hoveredItemId = null
    }
  })

  // ── v0.60.5: Dismiss через inline transitions — БЕЗ мигания ──
  function dismissItem(id, fromMain) {
    const item = items.get(id)
    if (!item) return
    if (item.dismissing) return
    item.dismissing = true
    clearTimeout(item.timer)
    if (hoveredItemId === id) hoveredItemId = null
    if (!fromMain) window.notifApi.dismiss(id)

    // v0.63.0: ghost-item (child стэка) — просто удаляем из Map
    if (item.isStackChild) {
      items.delete(id)
      return
    }

    // v1.2.66: хост альбома закрывается — убираем из реестра. Поздняя часть того же
    // альбома (после закрытия карточки) создаст новую карточку — это честно.
    if (item.album && item.album.id && albumHosts.get(item.album.id) === id) {
      albumHosts.delete(item.album.id)
    }

    // v0.63.0: если это хост стэка — очистить дочерние
    if (item.messengerId) {
      const stack = stacks.get(item.stackKey || item.messengerId)
      if (stack && stack.hostId === id) {
        cleanupStack(item.stackKey || item.messengerId)
      }
    }

    const el = item.el
    const h = el.offsetHeight

    // Замораживаем текущее состояние — отменяем slideIn, ставим конечные значения
    el.style.animation = 'none'
    el.style.opacity = '1'
    el.style.transform = 'translateX(0) scale(1)'
    el.style.height = h + 'px'
    el.style.overflow = 'hidden'
    el.style.pointerEvents = 'none'

    // Force reflow — чтобы браузер применил стили выше ДО начала transition
    void el.offsetHeight

    // Этап 1: fade + slide вправо (250мс)
    el.style.transition = 'opacity 250ms ease-out, transform 250ms ease-out'
    el.style.opacity = '0'
    el.style.transform = 'translateX(80px) scale(0.95)'

    // v0.89.20: diagnostic — фиксируем старт dismiss (для расследования полоски).
    try { window.notifApi.log('INFO', 'dismiss start id=' + id + ' itemsBefore=' + items.size + ' fromMain=' + !!fromMain) } catch (_) {}

    // Этап 2: коллапс высоты 180мс (v1.2.107: старт 330→200мс — «полоса» уходит быстрее).
    setTimeout(() => {
      el.style.transition = 'height 180ms ease-in-out, min-height 180ms ease-in-out, margin-bottom 180ms ease-in-out'
      el.style.height = '0'
      el.style.minHeight = '0'
      el.style.marginBottom = '-4px'
      // v0.89.20: фиксируем mid-animation reportHeight — наша гипотеза предполагает
      // что здесь приходит height>0 → main делает setBounds → видна полоска.
      try { window.notifApi.log('INFO', 'dismiss mid-report id=' + id + ' calcH=' + calcHeight() + ' elH=' + el.offsetHeight) } catch (_) {}
      reportHeight()

      // Этап 3: удаление из DOM
      setTimeout(() => {
        el.remove()
        items.delete(id)
        if (groupingEnabled && item.messengerId) cleanupStack(item.stackKey || item.messengerId)
        // v0.89.20: финальный reportHeight — должен прийти с calcH=0.
        try { window.notifApi.log('INFO', 'dismiss final-report id=' + id + ' itemsAfter=' + items.size + ' calcH=' + calcHeight()) } catch (_) {}
        // v1.2.128: dismissFinal=true — если видимого не осталось, main скроет окно сразу.
        reportHeight(false, true)
      }, 190)
    }, 200)
  }

  function toggleExpand(data, el) {
    const item = items.get(data.id)
    if (!item) return
    const isExpanded = el.classList.toggle('expanded')
    item.expanded = isExpanded

    if (isExpanded && item.dismissMs > 0) {
      item.remainingMs -= (Date.now() - item.startTs)
      if (item.remainingMs < 0) item.remainingMs = 0
      clearTimeout(item.timer)
      item.timer = null
      item.paused = true
      const progress = el.querySelector('.progress-bar')
      if (progress) progress.style.animationPlayState = 'paused'
    } else if (!isExpanded && item.dismissMs > 0) {
      item.paused = false
      item.startTs = Date.now()
      const progress = el.querySelector('.progress-bar')
      if (progress) progress.style.animationPlayState = 'running'
      item.timer = setTimeout(() => dismissItem(data.id, false), item.remainingMs || 3000)
    }

    reportHeight()
    setTimeout(reportHeight, 220)
  }

  // ── v0.63.0: Стэк сообщений в одной карточке ──
  // Добавляет сообщение как строку внутри существующей карточки (host)
  function stackMessageIntoHost(hostId, data) {
    const host = items.get(hostId)
    if (!host) return false
    const textWrap = host.el.querySelector('.text-wrap')
    if (!textWrap) return false
    const actionRow = textWrap.querySelector('.action-row')

    // v0.63.2: используем stack-container для ограничения высоты
    let stackContainer = textWrap.querySelector('.stack-container')
    if (!stackContainer) {
      stackContainer = document.createElement('div')
      stackContainer.className = 'stack-container'
      if (actionRow) {
        textWrap.insertBefore(stackContainer, actionRow)
      } else {
        textWrap.appendChild(stackContainer)
      }
    }

    // Создаём блок с новым сообщением — только текст, без дублирования имени
    const msgDiv = document.createElement('div')
    msgDiv.className = 'stacked-msg'
    msgDiv.dataset.stackedId = data.id

    const bodyDiv = document.createElement('div')
    bodyDiv.className = 'stacked-body'
    const stackTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    bodyDiv.dataset.ts = stackTime
    // v0.63.8: время перед текстом в стэке
    if (showTimeEnabled) {
      const timeSpan = document.createElement('span')
      timeSpan.className = 'msg-time'
      timeSpan.textContent = stackTime
      bodyDiv.appendChild(timeSpan)
      bodyDiv.style.display = 'flex'
      bodyDiv.style.alignItems = 'baseline'
      const textNode = document.createElement('span')
      textNode.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0'
      textNode.textContent = data.body || ''
      bodyDiv.appendChild(textNode)
    } else {
      bodyDiv.textContent = data.body || ''
    }
    msgDiv.appendChild(bodyDiv)

    // v0.65.0: кнопка 📌 для закрепления стэкированного сообщения
    msgDiv.appendChild(createPinBtn(host.senderName || host.messengerName || '', data.body || '', stackTime, host.color || '#2AABEE', data.messengerId, data.iconDataUrl || '', data.messengerName || host.messengerName || '', data.accountName || ''))

    stackContainer.appendChild(msgDiv)
    // Автоскролл вниз к новому сообщению
    stackContainer.scrollTop = stackContainer.scrollHeight
    scrollContainerToLatest()

    // Обновляем стэк
    const stack = stacks.get(data.stackKey || data.messengerId)
    if (stack) {
      stack.childIds.push(data.id)
    }

    // Сбрасываем таймер хоста — обновляем время
    if (host.dismissMs > 0) {
      clearTimeout(host.timer)
      host.remainingMs = host.dismissMs
      host.startTs = Date.now()
      host.timer = setTimeout(() => dismissItem(hostId, false), host.dismissMs)
      const progress = host.el.querySelector('.progress-bar')
      if (progress) {
        progress.style.animation = 'none'
        void progress.offsetHeight
        progress.style.animation = 'shrink ' + (host.dismissMs / 1000) + 's linear forwards'
      }
    }

    reportHeight()
    setTimeout(reportHeight, 220)
    return true
  }

  // Очистка стэка при dismiss хоста
  function cleanupStack(stackKey) {
    const stack = stacks.get(stackKey)
    if (!stack) return
    // Dismiss все child items (скрытые, без DOM)
    stack.childIds.forEach(id => {
      const child = items.get(id)
      if (child && !child.dismissing) {
        child.dismissing = true
        clearTimeout(child.timer)
        window.notifApi.dismiss(id)
        items.delete(id)
      }
    })
    stacks.delete(stackKey)
  }

  // v0.60.7: мгновенное удаление для FIFO (без анимации)
  function forceRemoveItem(id) {
    const item = items.get(id)
    if (!item) return
    clearTimeout(item.timer)
    // v0.89.21: лог — что именно удаляем (ghost vs real, состояние)
    try {
      window.notifApi.log('INFO', 'forceRemoveItem id=' + id +
        ' isStackChild=' + !!item.isStackChild +
        ' itemsBefore=' + items.size +
        ' containerBefore=' + container.children.length)
    } catch (_) {}
    // v0.63.0: ghost-item (child стэка) — только удаляем из Map
    if (item.isStackChild) {
      items.delete(id)
      window.notifApi.dismiss(id)
      return
    }
    // v1.2.66: хост альбома удаляется — убираем из реестра albumHosts.
    if (item.album && item.album.id && albumHosts.get(item.album.id) === id) {
      albumHosts.delete(item.album.id)
    }
    item.el.remove()
    items.delete(id)
    window.notifApi.dismiss(id)
  }

  function addNotification(data) {
    // v0.89.21: diagnostic — что именно пришло из main + текущее состояние
    try {
      window.notifApi.log('INFO', 'addNotification id=' + data.id +
        ' messenger=' + (data.messengerId || '?') +
        ' bodyLen=' + ((data.body || '').length) +
        ' iconType=' + (data.iconDataUrl ? 'data' : (data.iconUrl ? 'url' : 'none')) +
        ' grouping=' + !!data.grouping +
        ' itemsBefore=' + items.size +
        ' containerBefore=' + container.children.length)
    } catch (_) {}
    if (items.has(data.id)) {
      try { window.notifApi.log('WARN', 'addNotification duplicate id=' + data.id + ' → forceRemove') } catch (_) {}
      forceRemoveItem(data.id)
    }

    // v0.60.4: сохраняем флаг группировки
    if (data.grouping !== undefined) groupingEnabled = !!data.grouping
    // v0.63.8: сохраняем флаг показа времени
    if (data.showMessageTime !== undefined) showTimeEnabled = !!data.showMessageTime

    // v1.2.66: альбом (media group) — «живая карточка». Если карточка этого album.id
    // уже показана и жива → дорисовываем плитку в неё + продлеваем жизнь, НЕ создаём
    // новую. Работает всегда (независимо от настройки группировки). Ghost-item нужен
    // чтобы main-notifItems FIFO/cleanup видел этот id (как в стэке).
    if (data.album && data.album.id) {
      const hostId = albumHosts.get(data.album.id)
      const host = hostId != null ? items.get(hostId) : null
      if (host && host.album && !host.dismissing) {
        window.__ccNotifHelpers.addAlbumTileToHost(host, data, dismissItem, reportHeight)
        items.set(data.id, { el: host.el, timer: null, dismissMs: 0, isStackChild: true, albumHostId: hostId })
        return
      }
    }

    // v0.63.0: стэковая группировка — складываем в существующую карточку
    if (groupingEnabled && data.messengerId) {
      const stack = stacks.get(data.stackKey || data.messengerId)
      if (stack && items.has(stack.hostId) && !items.get(stack.hostId).dismissing) {
        // Складываем в хост-карточку как дополнительную строку
        const stacked = stackMessageIntoHost(stack.hostId, data)
        if (stacked) {
          // Создаём ghost-item (без DOM) для отслеживания id
          items.set(data.id, {
            el: items.get(stack.hostId).el, // ссылка на хост-элемент
            timer: null,
            expanded: false,
            remainingMs: 0,
            startTs: Date.now(),
            dismissMs: 0,
            paused: false,
            messengerId: data.messengerId,
            stackKey: data.stackKey || data.messengerId,
            messengerName: data.messengerName || '',
            senderName: data.title || '',
            bodyText: data.body || '',
            color: data.color || '#2AABEE',
            isStackChild: true,
            stackHostId: stack.hostId,
          })
          return // не создаём отдельную карточку
        }
      }
    }

    const maxItems = data.dismissMs === 0 ? MAX_PERSISTENT_ITEMS : MAX_AUTO_DISMISS_ITEMS
    while (items.size >= maxItems) {
      const firstKey = items.keys().next().value
      forceRemoveItem(firstKey)
    }

    const hasFullBody = data.fullBody && data.fullBody.length > (data.body || '').length

    const el = document.createElement('div')
    el.className = 'notif-item'
    el.dataset.id = data.id

    // v0.62.5: название мессенджера над аватаркой слева + padding
    const mName = data.messengerName || ''
    if (mName) {
      el.classList.add('has-mname')
      const mNameEl = document.createElement('div')
      mNameEl.className = 'messenger-name'
      mNameEl.textContent = mName
      el.appendChild(mNameEl)
    }

    const bar = document.createElement('div')
    bar.className = 'color-bar'
    // v1.2.155: левая грань = цвет-метка аккаунта (при ≥2 аккаунтах); иначе фирменный синий.
    bar.style.background = data.accountColor || data.color || '#2AABEE'
    el.appendChild(bar)

    const avWrap = document.createElement('div')
    avWrap.className = 'avatar-wrap'
    avWrap.style.background = (data.color || '#2AABEE') + '33'
    if (data.iconDataUrl) {
      const img = document.createElement('img')
      img.src = data.iconDataUrl
      img.onerror = () => { img.remove(); avWrap.textContent = data.emoji || '\u{1F4AC}' }
      avWrap.appendChild(img)
    } else {
      avWrap.textContent = data.emoji || '\u{1F4AC}'
    }
    el.appendChild(avWrap)

    const textWrap = document.createElement('div')
    textWrap.className = 'text-wrap'
    const sender = document.createElement('div')
    sender.className = 'sender'
    const senderName = data.title || ''
    sender.textContent = senderName || mName
    // v1.2.108: время (по настройке showMessageTime) переехало из начала текста в строку
    // источника, прижато вправо: «Telegram · БНК          10:38». Единый формат всех уведомлений.
    const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    textWrap.appendChild(window.__ccNotifHelpers.buildStackHeader(avWrap, sender, mName, data.accountName || '', showTimeEnabled ? nowTime : ''))

    const bodyText = document.createElement('div')
    bodyText.className = 'body-text'
    bodyText.dataset.short = data.body || ''
    bodyText.dataset.full = data.fullBody || data.body || ''
    bodyText.dataset.ts = nowTime
    // v1.2.108: текст без inline-времени; .msg-text-content всегда есть (нужен toggleExpand/альбому).
    const textNode = document.createElement('span')
    textNode.className = 'msg-text-content'
    textNode.textContent = data.body || ''
    bodyText.appendChild(textNode)
    textWrap.appendChild(bodyText)

    // v1.2.66→v1.2.74: альбом — накопительное состояние карточки. thumbs/messageIds —
    // ВСЕ пришедшие части (для листания страницами по 4). page — текущая страница.
    // sharpThumbs — чёткие превью по messageId (A1, догружаются отдельно).
    const albumState = (data.album && data.album.id) ? {
      id: data.album.id,
      chatId: data.album.chatId,
      thumbs: data.album.tileThumb ? [data.album.tileThumb] : [''],
      messageIds: [data.album.tileMessageId != null ? data.album.tileMessageId : null],
      count: 1,
      page: 0,
      sharpThumbs: {},
      // v1.2.66 (Совет 5): подпись уже показана, если первая часть несёт текст.
      // Иначе поздняя часть с tileText обновит body карточки (addAlbumTileToHost).
      hasCaption: !!(data.album.tileText),
      isVideo: !!data.album.isVideo, // v1.2.101: видео → постер + ▶ + видео-плеер
    } : null
    if (albumState) {
      textWrap.appendChild(window.__ccNotifHelpers.renderAlbumGrid(albumState))
    }
    // v1.2.97: раскладка «Стопка» для ВСЕХ карточек; одиночное фото — на всю ширину одной плиткой.
    el.classList.add('layout-stack')
    if (albumState && String(albumState.id).startsWith('single_')) el.classList.add('single-photo')

    // v0.65.0: кнопка 📌 для закрепления host-сообщения
    const hostFullText = data.fullBody || data.body || ''
    textWrap.appendChild(createPinBtn(senderName || mName, hostFullText, nowTime, data.color || '#2AABEE', data.messengerId, data.iconDataUrl || '', data.messengerName || mName || '', data.accountName || ''))

    const hint = document.createElement('div')
    hint.className = 'expand-hint'
    hint.style.display = 'none'
    textWrap.appendChild(hint)

    const actionRow = document.createElement('div')
    actionRow.className = 'action-row'

    const goBtn = document.createElement('button')
    goBtn.className = 'action-btn go-chat'
    goBtn.textContent = '\u2192 Перейти к чату'
    goBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      window.notifApi.click(data.id)
      // v0.62.8: красивый эффект перехода — пульс + flash + slide
      goBtn.style.pointerEvents = 'none'
      goBtn.textContent = '✓ Переход...'
      goBtn.style.animation = 'goChatPulse 400ms ease-out, goChatFlash 400ms ease-out forwards'
      goBtn.style.background = 'rgba(42,171,238,0.5)'
      goBtn.style.color = '#fff'
      goBtn.style.borderColor = 'rgba(42,171,238,0.6)'
      // Через 500мс — slide-left dismiss всей карточки
      setTimeout(() => {
        const item = items.get(data.id)
        if (!item) return
        const el = item.el
        const h = el.offsetHeight
        el.style.animation = 'none'
        el.style.opacity = '1'
        el.style.transform = 'translateX(0) scale(1)'
        el.style.height = h + 'px'
        el.style.overflow = 'hidden'
        el.style.pointerEvents = 'none'
        void el.offsetHeight
        // Slide влево (в сторону чата) вместо обычного slide вправо
        el.style.transition = 'opacity 300ms ease-in, transform 300ms ease-in'
        el.style.opacity = '0'
        el.style.transform = 'translateX(-120px) scale(0.95)'
        setTimeout(() => {
          el.style.transition = 'height 180ms ease-in-out, min-height 180ms ease-in-out, margin-bottom 180ms ease-in-out'
          el.style.height = '0'
          el.style.minHeight = '0'
          el.style.marginBottom = '-4px'
          reportHeight()
          setTimeout(() => {
            el.remove()
            items.delete(data.id)
            if (groupingEnabled && item.messengerId) cleanupStack(item.stackKey || item.messengerId)
            reportHeight()
          }, 190)
        }, 320)
      }, 500)
      // Отменяем стандартный таймер
      const item = items.get(data.id)
      if (item) { clearTimeout(item.timer); item.timer = null; item.dismissing = true }
    })
    actionRow.appendChild(goBtn)

    const readBtn2 = document.createElement('button')
    readBtn2.className = 'action-btn mark-read'
    readBtn2.textContent = '\u2713 Прочитано'
    readBtn2.addEventListener('click', (e) => {
      e.stopPropagation()
      window.notifApi.markRead(data.id)
      // v0.62.1: визуальное подтверждение — кнопка зеленеет, потом dismiss
      readBtn2.textContent = '\u2713 Готово!'
      readBtn2.style.background = 'rgba(34,197,94,0.35)'
      readBtn2.style.color = '#4ade80'
      readBtn2.style.borderColor = 'rgba(34,197,94,0.5)'
      readBtn2.style.pointerEvents = 'none'
      setTimeout(() => dismissItem(data.id, false), 400) // v1.2.107: было 800 — окно/полоса убирается быстрее
    })
    actionRow.appendChild(readBtn2)

    // v0.99.0 (Phase 3 M3.1): кнопка «🤖 AI» — обработать сообщение через AI-агент.
    // Только для Native режима (messengerId='native_*' и source.messageId есть).
    if (data.messengerId && data.messengerId.startsWith('native_') && data.source && data.source.messageId) {
      const aiBtn = document.createElement('button')
      aiBtn.className = 'action-btn ai-process'
      aiBtn.textContent = '🤖 AI'
      aiBtn.title = 'Обработать через AI'
      aiBtn.style.background = 'rgba(168, 85, 247, 0.2)'
      aiBtn.style.borderColor = 'rgba(168, 85, 247, 0.4)'
      aiBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (window.notifApi.aiProcess) {
          window.notifApi.aiProcess(data.id)
        }
        aiBtn.textContent = '🤖 Запуск...'
        aiBtn.style.background = 'rgba(168, 85, 247, 0.4)'
        aiBtn.style.pointerEvents = 'none'
        setTimeout(() => dismissItem(data.id, false), 600)
      })
      actionRow.appendChild(aiBtn)
    }

    textWrap.appendChild(actionRow)
    el.appendChild(textWrap)

    // v0.62.0: единая кнопка закрытия (×) справа сверху — убрана зелёная галочка
    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = '\u00d7'
    closeBtn.title = '\u0417\u0430\u043A\u0440\u044B\u0442\u044C'
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      dismissItem(data.id, false)
    })
    el.appendChild(closeBtn)

    const progress = document.createElement('div')
    progress.className = 'progress-bar'
    progress.style.background = data.color || '#2AABEE'
    el.appendChild(progress)

    // v0.64.0: убран toggleExpand по клику — кнопки управляются настройкой "Кнопки действий сразу"

    // v0.60.7: каскад — макс 5 слотов × 100мс, потом без задержки
    const cascadeDelay = Math.min(cascadeQueue, 5) * 100
    if (cascadeDelay > 0) {
      el.style.animationDelay = cascadeDelay + 'ms'
      el.style.animationFillMode = 'backwards'
    }
    cascadeQueue++
    clearTimeout(cascadeTimer)
    cascadeTimer = setTimeout(() => { cascadeQueue = 0 }, 600)

    // v0.89.23 (Баг #1): помечаем что element в процессе slideIn — calcHeight
    // его НЕ учитывает пока CSS animation не завершится.
    // v0.89.38: forceFinalSlideInState гарантирует финальное состояние keyframe 100%
    // (CSS animation forwards может прерваться). Вынесена в notification-helpers.js v1.2.12.
    const forceFinalSlideInState = () => window.__ccNotifHelpers.forceFinalSlideInState(el)
    el.dataset.slideInDone = 'false'
    const onSlideInEnd = (e) => {
      // Только событие slideIn (не другие animations типа goChatPulse)
      if (e.animationName !== 'slideIn') return
      el.dataset.slideInDone = 'true'
      el.removeEventListener('animationend', onSlideInEnd)
      // v0.89.38: ФОРСИРУЕМ финальное состояние даже на нормальном animationend.
      // CSS animation forwards не гарантирует translateX(0) при частичной
      // прерванной анимации.
      forceFinalSlideInState()
      try { window.notifApi.log('INFO', 'slideIn done id=' + data.id + ' h=' + el.offsetHeight) } catch (_) {} // v1.2.12: success-лог №4
      reportHeight()
    }
    el.addEventListener('animationend', onSlideInEnd)
    // Страховка на случай если animationend не сработает (cascade delay, error
    // в keyframes, etc.) — таймаут 600ms (300ms animation + 5 каскадов × 100ms).
    setTimeout(() => {
      if (el.dataset.slideInDone === 'false') {
        el.dataset.slideInDone = 'true'
        el.removeEventListener('animationend', onSlideInEnd)
        // v0.89.36/v0.89.38 (ловушка #29): ФОРСИРУЕМ финальное состояние.
        // Гарантирует final state независимо от backgroundThrottling, cascade
        // delay, keyframe error или race с пакетом одновременных нотификаций.
        forceFinalSlideInState()
        try { window.notifApi.log('WARN', 'slideIn animationend timeout fallback id=' + data.id + ' transform forced') } catch (_) {}
        reportHeight()
      }
    }, 600)

    container.appendChild(el)
    scrollContainerToLatest()

    const thisDismissMs = data.dismissMs
    let timer = null
    const startTs = Date.now()

    if (thisDismissMs > 0) {
      requestAnimationFrame(() => {
        progress.style.animation = 'shrink ' + (thisDismissMs / 1000) + 's linear forwards'
      })
      // v0.60.4: ВСЕГДА запускаем таймер, даже при expandedByDefault
      timer = setTimeout(() => dismissItem(data.id, false), thisDismissMs)
    } else {
      progress.style.display = 'none'
    }

    // Автораскрытие (визуально) — таймер УЖЕ запущен
    if (data.expandedByDefault) {
      el.classList.add('expanded')
      if (hasFullBody) {
        const bText = el.querySelector('.body-text')
        if (bText) {
          // v0.65.0: обновляем span вместо textContent (сохраняем .msg-time и .pin-msg-btn)
          const textSpan = bText.querySelector('.msg-text-content')
          if (textSpan) textSpan.textContent = bText.dataset.full
          else bText.textContent = bText.dataset.full
        }
      }
      const hintEl = el.querySelector('.expand-hint')
      if (hintEl) hintEl.textContent = '\u25B2 свернуть'
    }

    items.set(data.id, {
      el, timer,
      expanded: !!data.expandedByDefault,
      remainingMs: thisDismissMs,
      startTs,
      dismissMs: thisDismissMs,
      paused: false,
      messengerId: data.messengerId || '',
      stackKey: data.stackKey || data.messengerId || '',
      messengerName: data.messengerName || '',
      senderName: data.title || '',
      bodyText: data.body || '',
      color: data.color || '#2AABEE',
      album: albumState // v1.2.66: накопительное состояние альбома (null для обычных)
    })

    reportHeight()

    // v0.63.0: обновляем стэк — запоминаем эту карточку как хост для мессенджера
    if (groupingEnabled && data.messengerId && !stacks.has(data.stackKey || data.messengerId)) {
      stacks.set(data.stackKey || data.messengerId, { hostId: data.id, childIds: [] })
    }
    // v1.2.66: регистрируем карточку как хост альбома — следующие части того же
    // album.id будут дорисовываться в неё (см. ветку живой карточки в начале функции).
    if (albumState) albumHosts.set(albumState.id, data.id)
  }

  // v1.2.12: createPinBtn вынесена в notification-helpers.js
  // (подключается ДО notification.js в notification.html → global scope).

  // IPC listeners
  window.notifApi.onNotification((data) => addNotification(data))
  window.notifApi.onDismiss((id) => dismissItem(id, true))
  window.notifApi.onRemeasure?.(() => reportHeight(true)) // v1.2.126: heartbeat сторожа — переотчитаться о размере
  // v1.2.74 (A1): пришло чёткое превью плитки альбома — заменяем мутную заглушку.
  if (window.notifApi.onAlbumThumb) {
    window.notifApi.onAlbumThumb((data) => {
      if (!data || !data.albumId) return
      const hostId = albumHosts.get(data.albumId)
      const host = hostId != null ? items.get(hostId) : null
      if (host) window.__ccNotifHelpers.applyAlbumSharp(host, data.messageId, data.src)
    })
  }
  window.notifApi.onUpdateIcon((data) => {
    const item = items.get(String(data?.id || ''))
    if (!item || item.isStackChild || !data?.iconDataUrl) return
    const avatarWrap = item.el.querySelector('.avatar-wrap')
    if (!avatarWrap) return
    const img = document.createElement('img')
    img.src = data.iconDataUrl
    img.onerror = () => { img.remove() }
    avatarWrap.textContent = ''
    avatarWrap.appendChild(img)
  })
