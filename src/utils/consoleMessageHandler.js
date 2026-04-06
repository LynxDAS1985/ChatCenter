// v0.84.3: Extracted from webviewSetup.js — console-message event handler
// Contains: __CC_BADGE_BLOCKED__, __CC_ACCOUNT__, __CC_MSG__ (with DOM enrichment), __CC_NOTIF__ (with blob icon conversion)

/**
 * Creates the console-message event handler for WebView elements.
 * @param {object} deps - All closure dependencies from webviewSetup
 * @returns {function} Handler function (el, messengerId) => (e) => void
 */
export function createConsoleMessageHandler(deps) {
  const {
    parseConsoleMessage, isSpamText, handleNewMessage, traceNotif, devError,
    recentNotifsRef, notifReadyRef, notifDedupRef, notifMidTsRef, notifSenderTsRef, senderCacheRef, pendingMsgRef,
    webviewRefs, messengersRef, settingsRef, windowFocusedRef, activeIdRef,
    cleanupSenderCache,
    setAccountInfo, setUnreadCounts, setMonitorStatus, notifCountRef,
  } = deps

  /**
   * Returns a console-message handler bound to a specific WebView element and messenger.
   * @param {HTMLElement} el - The WebView element
   * @param {string} messengerId - The messenger ID
   * @returns {function} Event handler for 'console-message'
   */
  return (el, messengerId) => (e) => {
    const msg = e.message
    if (!msg) return
    // v0.79.8: Парсинг через consoleMessageParser.js
    const parsed = parseConsoleMessage(msg)
    if (parsed) {
      const ready = !!notifReadyRef.current[messengerId]
      traceNotif('debug', 'info', messengerId, (parsed.text || parsed.body || parsed.value || '').toString().slice(0, 200), `${parsed.prefix || parsed.type} | ready=${ready}`)
      // v0.85.5: Любой __CC_ ответ от монитора → статус active (fix красных кругляшков)
      setMonitorStatus(prev => prev[messengerId] === 'active' ? prev : { ...prev, [messengerId]: 'active' })
    }
    // ── __CC_BADGE_BLOCKED__: Telegram Badge API ──
    if (parsed && parsed.type === 'badge_blocked') {
      if (parsed.value === 0 && activeIdRef.current === messengerId && windowFocusedRef.current) {
        if (notifCountRef.current[messengerId] > 0) {
          notifCountRef.current[messengerId] = 0
        }
        setUnreadCounts(prev => prev[messengerId] > 0 ? { ...prev, [messengerId]: 0 } : prev)
      }
      return
    }
    // ── __CC_ACCOUNT__: имя профиля ──
    if (parsed && parsed.type === 'account') {
      if (parsed.name && parsed.name.length > 1 && parsed.name.length < 80) {
        setAccountInfo(prev => ({ ...prev, [messengerId]: parsed.name }))
      }
      return
    }
    // ── __CC_MSG__: backup MutationObserver через console.log (v0.39.5) ──
    // Обогащаем данными отправителя из DOM активного чата (v0.47.0)
    if (msg.startsWith('__CC_MSG__')) {
      if (!notifReadyRef.current[messengerId]) {
        traceNotif('warmup', 'block', messengerId, msg.slice(10, 50), 'warm-up 5с: __CC_MSG__ заблокирован')
        return
      }
      const text = msg.slice(10).trim()
      if (!text) return
      // v0.78.5: Спам-фильтр из messengerConfigs.js
      if (isSpamText(text, 'msg')) {
        traceNotif('spam', 'block', messengerId, text, 'спам-фильтр __CC_MSG__')
        return
      }
      // Per-messenger спам-фильтр (v0.56.0)
      const customSpam = ((settingsRef.current.messengerNotifs || {})[messengerId] || {}).spamFilter
      if (customSpam) {
        try { if (new RegExp(customSpam, 'i').test(text)) { traceNotif('spam', 'block', messengerId, text, 'пользовательский спам-фильтр'); return } } catch (e) { devError('[spam-regex]', e.message) }
      }
      // v0.60.2: per-messengerId dedup — если __CC_NOTIF__ от этого мессенджера был <3 сек назад
      const midTs = notifMidTsRef.current[messengerId]
      if (midTs && Date.now() - midTs < 3000) {
        traceNotif('dedup', 'block', messengerId, text, `mid-dedup __CC_MSG__ | __CC_NOTIF__ от ${messengerId} был ${Date.now()-midTs}мс назад`)
        return
      }
      traceNotif('source', 'info', messengerId, text, '__CC_MSG__ | ожидание enriched __CC_NOTIF__ 200мс')
      // Приоритет enriched: ждём 200мс — если __CC_NOTIF__ придёт с enriched данными, он отменит этот таймер
      // Если не придёт — запускаем собственное enrichment через DOM
      const pendingKey = messengerId + ':' + text.slice(0, 40)
      // Отменяем предыдущий pending для того же текста
      if (pendingMsgRef.current.has(pendingKey)) clearTimeout(pendingMsgRef.current.get(pendingKey).timer)
      const safeBody = JSON.stringify(text)
      const safeSlice = JSON.stringify(text.slice(0, 30))
      const pendingTimer = setTimeout(() => {
        pendingMsgRef.current.delete(pendingKey)
        traceNotif('enrich', 'info', messengerId, text, '__CC_MSG__ | enriched NOTIF не пришёл → DOM enrichment')
        el.executeJavaScript(`(function() {
            try {
              var name = '', avatar = '';
              // v0.77.1: Конвертация img→data:URL (blob URL не работает вне WebView)
              function _imgToDataUrl(img) {
                try {
                  if (!img || !img.src) return '';
                  if (img.src.startsWith('data:')) return img.src;
                  if (img.src.startsWith('http') && !img.src.startsWith('blob:')) return img.src;
                  // blob: URL → canvas → data:URL
                  var c = document.createElement('canvas');
                  var w = img.naturalWidth || img.width || 40;
                  var h = img.naturalHeight || img.height || 40;
                  if (w < 5 || h < 5) return '';
                  c.width = Math.min(w, 80); c.height = Math.min(h, 80);
                  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                  return c.toDataURL('image/jpeg', 0.7);
                } catch(e) { return ''; }
              }
              // 1. Header активного чата — расширенные селекторы (TG/MAX/Generic)
              // MAX (SvelteKit): .topbar.svelte-* → первый child div содержит имя
              var headerSels = [
                // v0.59.2: VK реальные классы
                '.ConvoHeader__info',
                // v0.60.0: MAX реальные классы — .topbar .headerWrapper содержит "Окно чата с ИмяФамилия"
                '.topbar .headerWrapper',
                '.chat-info .peer-title', '.topbar .peer-title',
                '.topbar [class*="info" i] [class*="title" i]',
                '.topbar [class*="info" i] [class*="name" i]',
                '[class*="chat-header" i] [class*="title" i]',
                '[class*="top-bar" i] [class*="title" i]',
                '[class*="topbar" i] [class*="name" i]',
                '[class*="chat-header" i] [class*="name" i]',
                'header [class*="title" i]', 'header [class*="name" i]'
              ];
              for (var si = 0; si < headerSels.length; si++) {
                var h = document.querySelector(headerSels[si]);
                if (h) {
                  var hn = (h.textContent || '').trim();
                  // v0.59.2: VK "Елена Дугинаonline" → чистим статус
                  hn = hn.replace(/\\s*(online|offline|был[аи]?\\s*(в\\s+сети)?|в\\s+сети|печатает|typing)\\s*$/i, '').trim();
                  // v0.60.0: MAX "Окно чата с ИмяФамилия" → убираем префикс
                  hn = hn.replace(/^окно\\s+чата\\s+с\\s+/i, '').trim();
                  // v0.60.2: MAX textContent дублирует имя ("Иванов Иван     Иванов Иван") → дедупликация
                  if (hn.length > 10) {
                    var halfN = Math.ceil(hn.length / 2);
                    var p1N = hn.slice(0, halfN).trim();
                    var p2N = hn.slice(halfN).trim();
                    if (p1N === p2N) hn = p1N;
                  }
                  if (hn && hn.length >= 2 && hn.length <= 80) { name = hn; break; }
                }
              }
              // MAX fallback: .topbar содержит "Окно чата с ИмяФамилия" — извлекаем имя из первого div > div
              if (!name) {
                var tb = document.querySelector('.topbar');
                if (tb) {
                  // Ищем первый элемент с коротким текстом (имя чата) среди children
                  var tbKids = tb.querySelectorAll('div, span, h1, h2, h3');
                  for (var ti = 0; ti < tbKids.length && ti < 20; ti++) {
                    var tbText = (tbKids[ti].textContent || '').trim();
                    // Пропускаем длинные тексты (весь .topbar textContent), статусы, пустые
                    if (tbText.length < 2 || tbText.length > 60) continue;
                    if (/^(был|была|в сети|online|offline|печатает|typing|окно чата)/i.test(tbText)) continue;
                    // Первый подходящий — имя чата
                    name = tbText;
                    break;
                  }
                }
              }
              if (name) {
                var av = document.querySelector('.chat-info img.avatar-photo, .topbar img.avatar-photo, .chat-info [class*="avatar" i] img, header img[class*="avatar" i], header [class*="avatar" i] img');
                if (av) avatar = _imgToDataUrl(av);
              }
              // 2. Активный/выделенный чат в sidebar (не зависит от обновления preview)
              if (!name) {
                var activeSels = ['.chatlist-chat.active', '.chatlist-chat.selected', '[class*="chat"][class*="active" i]', '[class*="dialog"][class*="active" i]', '[class*="conversation"][class*="active" i]'];
                for (var ai = 0; ai < activeSels.length; ai++) {
                  var act = document.querySelector(activeSels[ai]);
                  if (!act) continue;
                  var pt0 = act.querySelector('.peer-title, [class*="title" i], [class*="name" i]');
                  var nm0 = pt0 ? (pt0.textContent || '').trim() : '';
                  if (nm0 && nm0.length >= 2 && nm0.length <= 80) {
                    name = nm0;
                    var avAct = act.querySelector('img.avatar-photo, [class*="avatar"] img, canvas.avatar-photo');
                    if (avAct && avAct.tagName === 'IMG') avatar = _imgToDataUrl(avAct);
                    break;
                  }
                }
              }
              // 3. Поиск по тексту в chatlist (fallback)
              if (!name) {
                var bodySlice = ${safeSlice};
                var chats = document.querySelectorAll('.chatlist-chat');
                for (var i = 0; i < chats.length && i < 50; i++) {
                  if ((chats[i].textContent || '').indexOf(bodySlice) === -1) continue;
                  var pt = chats[i].querySelector('.peer-title');
                  var nm = pt ? (pt.textContent || '').trim() : '';
                  if (!nm) continue;
                  name = nm;
                  var avEl = chats[i].querySelector('img.avatar-photo, [class*="avatar"] img');
                  if (avEl) avatar = _imgToDataUrl(avEl);
                  break;
                }
              }
              if (window.__cc_notif_log) {
                window.__cc_notif_log.push({ ts: Date.now(), status: 'passed', title: name || '', body: (${safeBody}).slice(0, 200), tag: '', reason: 'addedNodes', enrichedTitle: name || '' });
                if (window.__cc_notif_log.length > 100) window.__cc_notif_log.shift();
              }
              return JSON.stringify({ n: name, a: avatar });
            } catch(e) { return ''; }
          })()`)
          .then(result => {
            const extra = {}
            if (result) {
              try {
                const info = JSON.parse(result)
                if (info.n) {
                  // v0.60.2: belt-and-suspenders strip после executeJavaScript
                  let sn = info.n.trim()
                  sn = sn.replace(/^окно\s+чата\s+с\s+/i, '').trim()
                  sn = sn.replace(/\s*(online|offline|был[аи]?\s*(в\s+сети)?|в\s+сети|печатает|typing)\s*$/i, '').trim()
                  // Убираем дубль имени: "Иванов Иван     Иванов Иван" → "Иванов Иван"
                  if (sn.length > 10) {
                    const half = Math.ceil(sn.length / 2)
                    const p1 = sn.slice(0, half).trim()
                    const p2 = sn.slice(half).trim()
                    if (p1 === p2) sn = p1
                  }
                  extra.senderName = sn
                }
                if (info.a) {
                  if (info.a.startsWith('data:')) extra.iconDataUrl = info.a
                  else if (info.a.startsWith('http') || info.a.startsWith('blob:')) extra.iconUrl = info.a
                }
              } catch {}
            }
            // Кэш sender (улучшение #3) — сохраняем при успехе, используем при неудаче
            if (extra.senderName) {
              senderCacheRef.current[messengerId] = { name: extra.senderName, avatar: extra.iconUrl || extra.iconDataUrl || '', ts: Date.now() }; cleanupSenderCache(senderCacheRef.current)
            } else {
              const cached = senderCacheRef.current[messengerId]
              if (cached && Date.now() - cached.ts < 300000) { // 5 мин
                extra.senderName = cached.name
                if (cached.avatar && !extra.iconUrl && !extra.iconDataUrl) {
                  if (cached.avatar.startsWith('data:')) extra.iconDataUrl = cached.avatar
                  else extra.iconUrl = cached.avatar
                }
                traceNotif('enrich', 'info', messengerId, text, `senderCache fallback | "${cached.name.slice(0,20)}" age=${Math.round((Date.now()-cached.ts)/1000)}с`)
              }
            }
            traceNotif('enrich', extra.senderName ? 'pass' : 'warn', messengerId, text, `__CC_MSG__ enriched | sender="${(extra.senderName||'нет').slice(0,20)}" icon=${!!(extra.iconUrl||extra.iconDataUrl)}`)
            // v0.60.0 Решение #2: sender-based dedup — если __CC_NOTIF__ уже обработан для этого sender
            if (extra.senderName) {
              const senderKey = messengerId + ':' + extra.senderName.slice(0, 30).toLowerCase()
              const senderTs = notifSenderTsRef.current[senderKey]
              if (senderTs && Date.now() - senderTs < 3000) {
                traceNotif('dedup', 'block', messengerId, text, `sender-dedup | __CC_NOTIF__ от "${extra.senderName.slice(0,20)}" был ${Date.now()-senderTs}мс назад`)
                return
              }
            }
            // v0.58.1: Если текст = имя отправителя → медиа без текста (стикер, фото, GIF)
            let finalText = text
            if (extra.senderName && text.trim().toLowerCase() === extra.senderName.trim().toLowerCase()) {
              finalText = '📎 Медиа'
              traceNotif('enrich', 'info', messengerId, text, `текст = sender "${extra.senderName.slice(0,20)}" → заменён на "📎 Медиа"`)
            }
            handleNewMessage(messengerId, finalText, Object.keys(extra).length ? extra : undefined)
          })
          .catch(() => {
            traceNotif('enrich', 'warn', messengerId, text, '__CC_MSG__ enrichment failed')
            // Кэш sender fallback
            const cached = senderCacheRef.current[messengerId]
            if (cached && Date.now() - cached.ts < 300000) {
              const extra = { senderName: cached.name }
              if (cached.avatar) { if (cached.avatar.startsWith('data:')) extra.iconDataUrl = cached.avatar; else extra.iconUrl = cached.avatar }
              // v0.58.1: текст = sender → медиа
              const ft = (text.trim().toLowerCase() === cached.name.trim().toLowerCase()) ? '📎 Медиа' : text
              handleNewMessage(messengerId, ft, extra)
            } else {
              handleNewMessage(messengerId, text)
            }
          })
      }, 200) // 200мс ожидание enriched __CC_NOTIF__
      pendingMsgRef.current.set(pendingKey, { timer: pendingTimer, messengerId, text })
      return
    }
    if (!msg.startsWith('__CC_NOTIF__')) return
    // Warm-up: игнорируем уведомления до готовности (5 сек после dom-ready)
    if (!notifReadyRef.current[messengerId]) {
      try {
        const d = JSON.parse(msg.slice(12))
        traceNotif('warmup', 'block', messengerId, (d.b || '').slice(0, 50), `warm-up 5с: __CC_NOTIF__ заблокирован | t="${(d.t||'').slice(0,20)}"`)
      } catch { traceNotif('warmup', 'block', messengerId, msg.slice(12, 50), 'warm-up 5с: __CC_NOTIF__ заблокирован') }
      return
    }
    try {
      const data = JSON.parse(msg.slice(12)) // после '__CC_NOTIF__'
      const text = (data.b || '').trim()
      traceNotif('source', 'info', messengerId, text, `__CC_NOTIF__ | t="${(data.t||'').slice(0,20)}" icon=${!!data.i} tag=${!!data.g}`)
      // v0.79.0: Спам-фильтр из messengerConfigs.js (единый для всех путей)
      if (isSpamText(text, 'notif')) {
        traceNotif('spam', 'block', messengerId, text, 'спам-фильтр __CC_NOTIF__')
        return
      }
      // Per-messenger спам-фильтр (v0.56.0)
      const customSpamN = ((settingsRef.current.messengerNotifs || {})[messengerId] || {}).spamFilter
      if (customSpamN && text) {
        try { if (new RegExp(customSpamN, 'i').test(text)) { traceNotif('spam', 'block', messengerId, text, 'пользовательский спам-фильтр'); return } } catch (e) { devError('[spam-regex]', e.message) }
      }
      if (text) {
        // Дедупликация: Telegram шлёт Notification + ServiceWorker.showNotification → 2 __CC_NOTIF__
        // Нормализуем body: убираем trailing timestamps (вида "15:57" или "15:5715:57")
        const normalizedText = text.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').trim()
        const dedupKey = messengerId + ':' + (normalizedText || text).slice(0, 40)
        const now = Date.now()
        if (notifDedupRef.current.has(dedupKey) && now - notifDedupRef.current.get(dedupKey) < 5000) {
          traceNotif('dedup', 'block', messengerId, text, `notifDedup | age=${now - notifDedupRef.current.get(dedupKey)}мс`)
          return
        }
        notifDedupRef.current.set(dedupKey, now)
        // Очистка старых записей
        if (notifDedupRef.current.size > 30) {
          for (const [k, ts] of notifDedupRef.current) { if (now - ts > 15000) notifDedupRef.current.delete(k) }
        }
        // Приоритет enriched: если есть pending __CC_MSG__ для того же текста — отменить его
        const pendingKey = messengerId + ':' + text.slice(0, 40)
        const pending = pendingMsgRef.current.get(pendingKey)
        if (pending) {
          clearTimeout(pending.timer)
          pendingMsgRef.current.delete(pendingKey)
          traceNotif('enrich', 'pass', messengerId, text, '__CC_NOTIF__ отменил pending __CC_MSG__ — enriched приоритет')
        }
        // data.t = title (имя отправителя), data.i = icon URL (аватарка)
        const extra = {}
        if (data.t) extra.senderName = data.t
        if (data.g) extra.chatTag = data.g
        // v0.77.2: blob icon → конвертируем ПЕРЕД handleNewMessage
        if (data.i && data.i.startsWith('blob:')) {
          const wv = webviewRefs.current[messengerId]
          if (wv) {
            wv.executeJavaScript(`(function(){try{var img=new Image();img.crossOrigin='anonymous';return new Promise(function(ok){img.onload=function(){var c=document.createElement('canvas');c.width=Math.min(img.width,80);c.height=Math.min(img.height,80);c.getContext('2d').drawImage(img,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',0.7))};img.onerror=function(){ok('')};img.src=${JSON.stringify(data.i)}})}catch(e){return Promise.resolve('')}})()`)
              .then(dataUrl => {
                if (dataUrl) extra.iconDataUrl = dataUrl
                else {
                  // Кэш fallback
                  const cached = senderCacheRef.current[messengerId]
                  if (cached?.avatar) {
                    if (cached.avatar.startsWith('data:')) extra.iconDataUrl = cached.avatar
                    else extra.iconUrl = cached.avatar
                  }
                }
                if (extra.senderName) senderCacheRef.current[messengerId] = { name: extra.senderName, avatar: extra.iconDataUrl || '', ts: Date.now() }; cleanupSenderCache(senderCacheRef.current)
                extra.fromNotifAPI = true
                senderNotifTsRef.current[extra.senderName] = Date.now()
                notifMidTsRef.current[messengerId] = Date.now()
                handleNewMessage(messengerId, text, extra)
              }).catch(() => {
                extra.fromNotifAPI = true
                handleNewMessage(messengerId, text, extra)
              })
            return // НЕ вызываем handleNewMessage синхронно — ждём конвертации
          }
        }
        if (data.i) {
          if (data.i.startsWith('data:')) {
            extra.iconDataUrl = data.i
          } else if (data.i.startsWith('http')) {
            extra.iconUrl = data.i
          } else if (data.i.startsWith('/')) {
            const mi = messengersRef.current.find(x => x.id === messengerId)
            if (mi?.url) { try { extra.iconUrl = new URL(data.i, mi.url).href } catch {} }
          }
        }
        // Кэш sender
        if (extra.senderName) {
          senderCacheRef.current[messengerId] = { name: extra.senderName, avatar: extra.iconUrl || extra.iconDataUrl || '', ts: Date.now() }; cleanupSenderCache(senderCacheRef.current)
        }
        // v0.58.0: fromNotifAPI=true → пропускаем viewing-блок
        // Если мессенджер сам вызвал showNotification — пользователь НЕ видит этот чат
        extra.fromNotifAPI = true
        // v0.60.0 Решение #2: записываем sender+timestamp — блокируем __CC_MSG__ от того же sender
        if (extra.senderName) {
          notifSenderTsRef.current[messengerId + ':' + extra.senderName.slice(0, 30).toLowerCase()] = Date.now()
        }
        // v0.60.2: per-messengerId dedup — блокируем __CC_MSG__ от этого мессенджера на 3 сек
        notifMidTsRef.current[messengerId] = Date.now()
        handleNewMessage(messengerId, text, extra)
      }
    } catch {}
  }
}
