  const dockWrapper = document.getElementById('dock-wrapper')
  const dock = document.getElementById('dock')
  const emptyLabel = document.getElementById('emptyLabel')
  const countLabel = document.getElementById('countLabel')
  const dockCloseBtn = document.getElementById('dockCloseBtn')
  const tabs = new Map()

  // Click-through: transparent:true окно автоматически пропускает клики через
  // прозрачные пиксели. position:fixed;bottom:0 оставляет прозрачную зону "непокрашенной".
  // НЕ используем setIgnoreMouseEvents — оно блокирует -webkit-app-region: drag
  const catUrgentEl = document.getElementById('catUrgent')
  const catWorkEl = document.getElementById('catWork')
  const catLaterEl = document.getElementById('catLater')
  let previewEl = null
  let previewTimeout = null
  let dragSrcTab = null
  let ctxMenuEl = null
  let ctxPinId = null

  const CATEGORIES = {
    urgent: { label: '!!!', bg: 'rgba(239,68,68,0.2)', color: '#f87171' },
    work:   { label: 'РАБ', bg: 'rgba(245,158,11,0.2)', color: '#fbbf24' },
    later:  { label: 'ПЗЖ', bg: 'rgba(34,197,94,0.2)', color: '#4ade80' },
  }

  function updateCount() {
    const n = tabs.size
    countLabel.textContent = n
    countLabel.className = n > 0 ? 'dock-count' : 'dock-count zero'
    emptyLabel.style.display = n > 0 ? 'none' : ''
    updateCatCounts()
  }

  function updateCatCounts() {
    let urgent = 0, work = 0, later = 0
    for (const [, entry] of tabs) {
      if (entry.data.category === 'urgent') urgent++
      else if (entry.data.category === 'work') work++
      else if (entry.data.category === 'later') later++
    }
    catUrgentEl.textContent = urgent
    catUrgentEl.className = urgent > 0 ? 'cat-badge urgent' : 'cat-badge urgent hidden'
    catWorkEl.textContent = work
    catWorkEl.className = work > 0 ? 'cat-badge work' : 'cat-badge work hidden'
    catLaterEl.textContent = later
    catLaterEl.className = later > 0 ? 'cat-badge later' : 'cat-badge later hidden'
  }

  function getTabOrder() {
    const order = []
    dock.querySelectorAll('.dock-tab').forEach(t => order.push(parseInt(t.dataset.pinId, 10)))
    return order
  }

  function saveTabOrder() {
    window.dockApi.saveTabOrder(getTabOrder())
  }

  let ctxActiveTab = null

  // ── Контекстное меню ──
  function hideCtxMenu(instant) {
    if (!ctxMenuEl) return
    // Убираем подсветку таба
    if (ctxActiveTab) { ctxActiveTab.classList.remove('ctx-active'); ctxActiveTab = null }
    if (instant) {
      ctxMenuEl.remove(); ctxMenuEl = null; ctxPinId = null
      return
    }
    // Fade-out через CSS transition (убираем .visible → opacity:0)
    const el = ctxMenuEl
    ctxMenuEl = null; ctxPinId = null
    el.classList.remove('visible')
    // Удалить из DOM после завершения transition
    setTimeout(() => { if (el.parentNode) el.remove() }, 160)
  }

  function showCtxMenu(pinId, tabEl) {
    hideCtxMenu(true)
    // Удалить ВСЕ остатки контекстных меню (включая closing-анимации от предыдущих)
    document.querySelectorAll('.ctx-menu').forEach(el => el.remove())
    hidePreview()
    const entry = tabs.get(pinId)
    if (!entry) return
    ctxPinId = pinId
    // Подсветка активного таба
    ctxActiveTab = tabEl
    tabEl.classList.add('ctx-active')
    const currentCat = entry.data.category || ''
    const hasMessenger = !!(entry.data && entry.data.messengerId)

    ctxMenuEl = document.createElement('div')
    ctxMenuEl.className = 'ctx-menu'

    addCtxItem('👁', 'Показать карточку', () => window.dockApi.showPin(pinId))
    if (hasMessenger) {
      addCtxItem('→', 'В чат', () => window.dockApi.goToChat(pinId))
    }
    addCtxSep()
    const currentNote = entry.data.note || ''
    addCtxItem('📝', currentNote ? 'Ред. заметку' : 'Добавить заметку', () => promptNote(pinId, currentNote))
    addCtxSep()
    addCtxItem('🔴', 'Срочно', () => window.dockApi.setCategory(pinId, currentCat === 'urgent' ? '' : 'urgent'), currentCat === 'urgent')
    addCtxItem('🟡', 'В работе', () => window.dockApi.setCategory(pinId, currentCat === 'work' ? '' : 'work'), currentCat === 'work')
    addCtxItem('🟢', 'На потом', () => window.dockApi.setCategory(pinId, currentCat === 'later' ? '' : 'later'), currentCat === 'later')
    addCtxSep()
    addCtxItem('⏰', 'Таймер 5м', () => window.dockApi.startTimer(pinId, 5))
    addCtxItem('⏰', 'Таймер 15м', () => window.dockApi.startTimer(pinId, 15))
    addCtxItem('⏰', 'Таймер 1ч', () => window.dockApi.startTimer(pinId, 60))
    addCtxSep()
    addCtxItem('✕', 'Открепить', () => window.dockApi.unpinFromDock(pinId)).classList.add('danger')

    // Позиционируем в body — НЕ внутри таба (чтобы не обрезалось)
    document.body.appendChild(ctxMenuEl)

    // DOCK_PREVIEW_RESERVE=420 — меню всегда помещается БЕЗ resize окна (нет дёрганья)
    // Позиционируем сразу, без IPC resize
    requestAnimationFrame(() => {
      if (!ctxMenuEl) return
      const menuH = ctxMenuEl.offsetHeight
      const menuW = ctxMenuEl.offsetWidth
      const tabRect2 = tabEl.getBoundingClientRect()
      let x = tabRect2.left
      let y = tabRect2.top - menuH - 4
      if (y < 4) y = 4
      if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 4
      if (x < 4) x = 4
      ctxMenuEl.style.left = x + 'px'
      ctxMenuEl.style.top = y + 'px'
      // Показать ПОСЛЕ позиционирования — плавный fade-in через CSS transition
      requestAnimationFrame(() => { if (ctxMenuEl) ctxMenuEl.classList.add('visible') })
    })
  }

  function addCtxItem(icon, label, onClick, isActive) {
    const item = document.createElement('div')
    item.className = 'ctx-item' + (isActive ? ' cat-active' : '')
    const iconSpan = document.createElement('span')
    iconSpan.className = 'ctx-icon'
    iconSpan.textContent = icon
    item.appendChild(iconSpan)
    const labelSpan = document.createElement('span')
    labelSpan.textContent = label
    item.appendChild(labelSpan)
    item.addEventListener('click', (e) => {
      e.stopPropagation()
      hideCtxMenu(true)
      onClick()
    })
    ctxMenuEl.appendChild(item)
    return item
  }

  function addCtxSep() {
    const sep = document.createElement('div')
    sep.className = 'ctx-sep'
    ctxMenuEl.appendChild(sep)
  }

  // Закрыть меню: по клику вне
  // ВАЖНО: при ПКМ (button=2) на табе НЕ закрываем — contextmenu handler сам переоткроет
  // Иначе: mousedown закрывает с fade-out → contextmenu создаёт новое → моргание (Ловушка 30)
  document.addEventListener('mousedown', (e) => {
    if (ctxMenuEl && !ctxMenuEl.contains(e.target)) {
      if (e.button === 2 && e.target.closest('.dock-tab')) return
      hideCtxMenu()
    }
  })

  // Закрыть меню по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctxMenuEl) hideCtxMenu()
  })

  // ── Табы ──
  function addTab(data) {
    if (tabs.has(data.pinId)) return

    const tab = document.createElement('div')
    tab.className = 'dock-tab'
    tab.dataset.pinId = data.pinId

    const dot = document.createElement('span')
    dot.className = 'tab-dot'
    dot.style.background = data.color || '#2AABEE'
    tab.appendChild(dot)

    const name = document.createElement('span')
    name.className = 'tab-name'
    name.textContent = data.sender || ''
    tab.appendChild(name)

    const catEl = document.createElement('span')
    catEl.className = 'tab-category'
    catEl.style.display = 'none'
    tab.appendChild(catEl)
    if (data.category && CATEGORIES[data.category]) {
      const cat = CATEGORIES[data.category]
      catEl.textContent = cat.label
      catEl.style.background = cat.bg
      catEl.style.color = cat.color
      catEl.style.display = ''
    }

    const noteDot = document.createElement('span')
    noteDot.className = 'tab-note-dot' + (data.note ? ' visible' : '')
    noteDot.title = data.note || ''
    tab.appendChild(noteDot)

    const timer = document.createElement('span')
    timer.className = 'tab-timer'
    timer.id = 'timer-' + data.pinId
    tab.appendChild(timer)

    const close = document.createElement('button')
    close.className = 'tab-close'
    close.textContent = '\u00d7'
    close.title = 'Открепить'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      window.dockApi.unpinFromDock(data.pinId)
    })
    tab.appendChild(close)

    // Hover — превью (не показывать если открыто контекстное меню)
    tab.addEventListener('mouseenter', () => {
      if (!ctxMenuEl) showPreview(data.pinId, tab)
    })
    tab.addEventListener('mouseleave', () => hidePreview())

    // Одинарный клик — показать карточку, двойной — перейти в чат
    let clickTimer = null
    tab.addEventListener('click', () => {
      hidePreview()
      hideCtxMenu()
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return }
      clickTimer = setTimeout(() => { clickTimer = null; window.dockApi.showPin(data.pinId) }, 250)
    })
    tab.addEventListener('dblclick', () => {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
      if (data.messengerId) window.dockApi.goToChat(data.pinId)
      else window.dockApi.showPin(data.pinId)
    })

    // Контекстное меню (ПКМ)
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      showCtxMenu(data.pinId, tab)
    })

    // DnD
    tab.draggable = true
    tab.addEventListener('dragstart', (e) => {
      dragSrcTab = tab; tab.classList.add('dragging')
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', data.pinId)
    })
    tab.addEventListener('dragend', () => {
      tab.classList.remove('dragging'); dragSrcTab = null
      document.querySelectorAll('.dock-tab.drag-over').forEach(t => t.classList.remove('drag-over'))
      saveTabOrder()
    })
    tab.addEventListener('dragover', (e) => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'
      if (dragSrcTab && dragSrcTab !== tab) tab.classList.add('drag-over')
    })
    tab.addEventListener('dragleave', () => tab.classList.remove('drag-over'))
    tab.addEventListener('drop', (e) => {
      e.preventDefault(); tab.classList.remove('drag-over')
      if (!dragSrcTab || dragSrcTab === tab) return
      const rect = tab.getBoundingClientRect()
      const midX = rect.left + rect.width / 2
      if (e.clientX < midX) dock.insertBefore(dragSrcTab, tab)
      else dock.insertBefore(dragSrcTab, tab.nextSibling)
      reportSize(); saveTabOrder()
    })

    dock.insertBefore(tab, dockCloseBtn)
    tabs.set(data.pinId, { el: tab, timerInterval: null, data })
    updateCount()
    reportSize()
    saveTabOrder()
  }

  function showPreview(pinId, tabEl) {
    if (previewTimeout) { clearTimeout(previewTimeout); previewTimeout = null }
    hidePreview()
    const entry = tabs.get(pinId)
    if (!entry || !entry.data) return

    previewTimeout = setTimeout(() => {
      previewEl = document.createElement('div')
      previewEl.className = 'dock-preview'

      const sender = document.createElement('div')
      sender.className = 'preview-sender'
      sender.textContent = entry.data.sender || ''
      previewEl.appendChild(sender)
      if (entry.data.messengerName) {
        const mName = document.createElement('div')
        mName.style.cssText = 'font-size:9px;color:rgba(99,102,241,0.6);margin-bottom:3px;'
        mName.textContent = entry.data.messengerName
        previewEl.appendChild(mName)
      }

      if (entry.data.text) {
        const text = document.createElement('div')
        text.className = 'preview-text'
        text.textContent = entry.data.text
        previewEl.appendChild(text)
      }
      if (entry.data.time) {
        const time = document.createElement('div')
        time.className = 'preview-time'
        time.textContent = entry.data.time
        previewEl.appendChild(time)
      }
      if (entry.data.note) {
        const noteDiv = document.createElement('div')
        noteDiv.className = 'preview-note'
        noteDiv.textContent = '📝 ' + entry.data.note
        previewEl.appendChild(noteDiv)
      }
      if (entry.data.category && CATEGORIES[entry.data.category]) {
        const cat = CATEGORIES[entry.data.category]
        const catDiv = document.createElement('div')
        catDiv.style.cssText = 'font-size:9px;margin-top:3px;color:' + cat.color
        catDiv.textContent = entry.data.category === 'urgent' ? '🔴 Срочно' : entry.data.category === 'work' ? '🟡 В работе' : '🟢 На потом'
        previewEl.appendChild(catDiv)
      }

      tabEl.appendChild(previewEl)
      window.dockApi.requestPreviewSpace(previewEl.offsetHeight + 12)
    }, 250)
  }

  function hidePreview() {
    if (previewTimeout) { clearTimeout(previewTimeout); previewTimeout = null }
    if (previewEl) { previewEl.remove(); previewEl = null; window.dockApi.requestPreviewSpace(0) }
  }

  function removeTab(pinId) {
    const entry = tabs.get(pinId)
    if (!entry) return
    if (entry.timerInterval) clearInterval(entry.timerInterval)
    entry.el.remove()
    tabs.delete(pinId)
    hidePreview()
    hideCtxMenu()
    updateCount()
    reportSize()
    saveTabOrder()
  }

  function reportSize() {
    requestAnimationFrame(() => {
      window.dockApi.resize(dock.offsetWidth, dock.offsetHeight)
    })
  }

  dockCloseBtn.addEventListener('click', () => { hidePreview(); hideCtxMenu(); window.dockApi.closeDock() })

  window.dockApi.onUpdateTimer((pinId, timerEnd) => {
    const entry = tabs.get(pinId)
    if (!entry) return
    const timerEl = entry.el.querySelector('.tab-timer')
    if (!timerEl) return
    if (entry.timerInterval) clearInterval(entry.timerInterval)
    if (!timerEnd) { timerEl.className = 'tab-timer'; timerEl.textContent = ''; entry.timerInterval = null; reportSize(); return }
    timerEl.className = 'tab-timer active'
    entry.timerInterval = setInterval(() => {
      const remaining = timerEnd - Date.now()
      if (remaining <= 0) { timerEl.textContent = '0:00'; timerEl.className = 'tab-timer active expired'; clearInterval(entry.timerInterval); entry.timerInterval = null; return }
      const min = Math.floor(remaining / 60000)
      const sec = Math.floor((remaining % 60000) / 1000)
      timerEl.textContent = min + ':' + String(sec).padStart(2, '0')
    }, 1000)
    reportSize()
  })

  window.dockApi.onTimerAlert((pinId) => {
    const entry = tabs.get(pinId)
    if (!entry) return
    entry.el.classList.add('alert')
    setTimeout(() => { if (entry.el) entry.el.classList.remove('alert') }, 10000)
    // Звук уведомления — три коротких бипа
    playTimerSound()
  })

  function playTimerSound() {
    try {
      const ctx = new AudioContext()
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.value = 0.25
        osc.start(ctx.currentTime + i * 0.25)
        osc.stop(ctx.currentTime + i * 0.25 + 0.1)
      }
      setTimeout(() => ctx.close(), 1500)
    } catch {}
  }

  window.dockApi.onShowEmpty((show) => {
    if (tabs.size === 0) emptyLabel.style.display = show ? '' : 'none'
    reportSize()
  })

  window.dockApi.onUpdateCategory((pinId, category) => {
    const entry = tabs.get(pinId)
    if (!entry) return
    entry.data.category = category
    const catEl = entry.el.querySelector('.tab-category')
    if (!catEl) return
    if (category && CATEGORIES[category]) {
      const cat = CATEGORIES[category]
      catEl.textContent = cat.label; catEl.style.background = cat.bg; catEl.style.color = cat.color; catEl.style.display = ''
    } else { catEl.style.display = 'none' }
    updateCatCounts()
    reportSize()
  })

  // v0.72.0: Inline prompt для заметки
  function promptNote(pinId, currentText) {
    hideCtxMenu(true)
    const entry = tabs.get(pinId)
    if (!entry) return

    // Создаём мини-форму прямо над табом
    const form = document.createElement('div')
    form.className = 'ctx-menu'
    form.style.cssText = 'padding:8px;min-width:200px;'
    const input = document.createElement('textarea')
    input.style.cssText = 'width:100%;border:1px solid rgba(99,102,241,0.3);border-radius:4px;background:rgba(0,0,0,0.3);color:rgba(255,255,255,0.85);font-size:11px;font-family:inherit;padding:4px 6px;resize:none;outline:none;'
    input.rows = 2
    input.maxLength = 200
    input.placeholder = 'Заметка к задаче...'
    input.value = currentText
    form.appendChild(input)

    const btns = document.createElement('div')
    btns.style.cssText = 'display:flex;gap:4px;margin-top:4px;justify-content:flex-end;'
    const saveBtn = document.createElement('button')
    saveBtn.style.cssText = 'padding:2px 10px;border:1px solid rgba(99,102,241,0.3);border-radius:4px;background:rgba(99,102,241,0.15);color:rgba(99,102,241,0.9);font-size:10px;cursor:pointer;'
    saveBtn.textContent = '✓ Сохранить'
    const cancelBtn = document.createElement('button')
    cancelBtn.style.cssText = 'padding:2px 8px;border:1px solid rgba(255,255,255,0.1);border-radius:4px;background:transparent;color:rgba(255,255,255,0.4);font-size:10px;cursor:pointer;'
    cancelBtn.textContent = 'Отмена'
    btns.appendChild(saveBtn)
    btns.appendChild(cancelBtn)
    form.appendChild(btns)

    document.body.appendChild(form)

    // Позиционирование
    const tabRect = entry.el.getBoundingClientRect()
    window.dockApi.requestCtxMenuSpace(form.offsetHeight + 12)
    setTimeout(() => {
      const newRect = entry.el.getBoundingClientRect()
      let x = newRect.left
      let y = newRect.top - form.offsetHeight - 4
      if (y < 4) y = 4
      if (x + form.offsetWidth > window.innerWidth) x = window.innerWidth - form.offsetWidth - 4
      form.style.left = x + 'px'
      form.style.top = y + 'px'
      input.focus()
    }, 30)

    function closeForm() {
      form.remove()
      window.dockApi.requestCtxMenuSpace(0)
    }

    saveBtn.addEventListener('click', () => {
      window.dockApi.setNote(pinId, input.value.trim())
      closeForm()
    })
    cancelBtn.addEventListener('click', closeForm)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveBtn.click() }
      if (e.key === 'Escape') closeForm()
    })

    // Закрыть по клику вне
    setTimeout(() => {
      document.addEventListener('mousedown', function handler(e) {
        if (!form.contains(e.target)) { closeForm(); document.removeEventListener('mousedown', handler) }
      })
    }, 50)
  }

  // v0.72.0: Обновление заметки
  window.dockApi.onUpdateNote((pinId, text) => {
    const entry = tabs.get(pinId)
    if (!entry) return
    entry.data.note = text || ''
    const noteDot = entry.el.querySelector('.tab-note-dot')
    if (noteDot) {
      noteDot.className = 'tab-note-dot' + (text ? ' visible' : '')
      noteDot.title = text || ''
    }
  })

  window.dockApi.onAddItem((data) => addTab(data))
  window.dockApi.onRemoveItem((id) => removeTab(id))

  reportSize()
