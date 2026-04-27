  const MAX_ITEMS = 6
  const container = document.getElementById('container')
  const items = new Map() // id → { el, timer, expanded, remainingMs, startTs, dismissMs, paused }
  // v0.63.0: стэк — messengerId → hostItemId (id карточки, в которую складываются сообщения)
  const stacks = new Map() // messengerId → { hostId, childIds: [id,...] }
  let groupingEnabled = false
  let showTimeEnabled = true // v0.63.8: показ времени перед текстом (настройка из settings)
  let hoveredItemId = null
  // v0.60.6: каскадное появление — очередь задержки
  let cascadeQueue = 0
  let cascadeTimer = null

  function calcHeight() {
    let h = 0
    for (const child of container.children) {
      // Пропускаем элементы в процессе dismiss (opacity=0 или height=0)
      if (child.style.pointerEvents === 'none') continue
      const ch = child.offsetHeight
      if (ch > 0) h += ch + 4
    }
    return h > 0 ? h + 4 : 0
  }

  function reportHeight() {
    setTimeout(() => {
      window.notifApi.resize(calcHeight())
    }, 60)
  }

  // ── Per-item hover (v0.60.3) ──
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

  function resumeItem(item) {
    if (!item.paused || !item.dismissMs || item.dismissMs <= 0) return
    item.paused = false
    item.startTs = Date.now()
    const progress = item.el.querySelector('.progress-bar')
    if (progress) progress.style.animationPlayState = 'running'
    const id = item.el.dataset.id
    item.timer = setTimeout(() => dismissItem(id, false), item.remainingMs || 3000)
    item.el.classList.remove('hovered')
  }

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

    // v0.63.0: если это хост стэка — очистить дочерние
    if (item.messengerId) {
      const stack = stacks.get(item.messengerId)
      if (stack && stack.hostId === id) {
        cleanupStack(item.messengerId)
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

    // Этап 2: пауза 80мс → коллапс высоты 180мс (v0.60.6: естественная задержка)
    setTimeout(() => {
      el.style.transition = 'height 180ms ease-in-out, min-height 180ms ease-in-out, margin-bottom 180ms ease-in-out'
      el.style.height = '0'
      el.style.minHeight = '0'
      el.style.marginBottom = '-4px'
      reportHeight()

      // Этап 3: удаление из DOM
      setTimeout(() => {
        el.remove()
        items.delete(id)
        if (groupingEnabled && item.messengerId) cleanupStack(item.messengerId)
        reportHeight()
      }, 190)
    }, 330)
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
    msgDiv.appendChild(createPinBtn(host.senderName || host.messengerName || '', data.body || '', stackTime, host.color || '#2AABEE', data.messengerId))

    stackContainer.appendChild(msgDiv)
    // Автоскролл вниз к новому сообщению
    stackContainer.scrollTop = stackContainer.scrollHeight

    // Обновляем стэк
    const stack = stacks.get(data.messengerId)
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
  function cleanupStack(messengerId) {
    const stack = stacks.get(messengerId)
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
    stacks.delete(messengerId)
  }

  // v0.60.7: мгновенное удаление для FIFO (без анимации)
  function forceRemoveItem(id) {
    const item = items.get(id)
    if (!item) return
    clearTimeout(item.timer)
    // v0.63.0: ghost-item (child стэка) — только удаляем из Map
    if (item.isStackChild) {
      items.delete(id)
      window.notifApi.dismiss(id)
      return
    }
    item.el.remove()
    items.delete(id)
    window.notifApi.dismiss(id)
  }

  function addNotification(data) {
    if (items.has(data.id)) {
      forceRemoveItem(data.id)
    }

    // v0.60.4: сохраняем флаг группировки
    if (data.grouping !== undefined) groupingEnabled = !!data.grouping
    // v0.63.8: сохраняем флаг показа времени
    if (data.showMessageTime !== undefined) showTimeEnabled = !!data.showMessageTime

    // v0.63.0: стэковая группировка — складываем в существующую карточку
    if (groupingEnabled && data.messengerId) {
      const stack = stacks.get(data.messengerId)
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

    while (items.size >= MAX_ITEMS) {
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
    bar.style.background = data.color || '#2AABEE'
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
    textWrap.appendChild(sender)

    const bodyText = document.createElement('div')
    bodyText.className = 'body-text'
    bodyText.dataset.short = data.body || ''
    bodyText.dataset.full = data.fullBody || data.body || ''
    const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    bodyText.dataset.ts = nowTime
    // v0.63.8: время перед текстом (управляется настройкой showMessageTime)
    if (showTimeEnabled) {
      const timeSpan = document.createElement('span')
      timeSpan.className = 'msg-time'
      timeSpan.textContent = nowTime
      bodyText.appendChild(timeSpan)
      bodyText.style.display = 'flex'
      bodyText.style.alignItems = 'baseline'
      const textNode = document.createElement('span')
      textNode.className = 'msg-text-content'
      textNode.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0'
      textNode.textContent = data.body || ''
      bodyText.appendChild(textNode)
    } else {
      bodyText.textContent = data.body || ''
    }
    textWrap.appendChild(bodyText)

    // v0.65.0: кнопка 📌 для закрепления host-сообщения
    const hostFullText = data.fullBody || data.body || ''
    textWrap.appendChild(createPinBtn(senderName || mName, hostFullText, nowTime, data.color || '#2AABEE', data.messengerId))

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
            if (groupingEnabled && item.messengerId) cleanupStack(item.messengerId)
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
      setTimeout(() => dismissItem(data.id, false), 800)
    })
    actionRow.appendChild(readBtn2)

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

    container.appendChild(el)

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
      messengerName: data.messengerName || '',
      senderName: data.title || '',
      bodyText: data.body || '',
      color: data.color || '#2AABEE'
    })

    reportHeight()

    // v0.63.0: обновляем стэк — запоминаем эту карточку как хост для мессенджера
    if (groupingEnabled && data.messengerId && !stacks.has(data.messengerId)) {
      stacks.set(data.messengerId, { hostId: data.id, childIds: [] })
    }
  }

  // ── v0.65.0: Создание кнопки 📌 для закрепления сообщения ──
  function createPinBtn(senderName, fullText, time, color, messengerId) {
    const btn = document.createElement('button')
    btn.className = 'pin-msg-btn'
    btn.textContent = '\u{1F4CC}'
    btn.title = '\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C'
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      window.notifApi.pinMessage({ sender: senderName, text: fullText, time: time, color: color, messengerId: messengerId || '' })
      btn.textContent = '\u2713'
      btn.style.color = '#4ade80'
      btn.style.background = 'rgba(34,197,94,0.2)'
      setTimeout(() => { btn.textContent = '\u{1F4CC}'; btn.style.color = ''; btn.style.background = '' }, 1000)
    })
    return btn
  }

  // IPC listeners
  window.notifApi.onNotification((data) => addNotification(data))
  window.notifApi.onDismiss((id) => dismissItem(id, true))
