// v0.87.97: вынесено из webviewSetup.js при разбиении.
// Функция handleNewMessage — обработка ОДНОГО входящего сообщения:
// дедуп → strip-sender → viewing-фильтр → звук + ribbon → preview + history + auto-reply.
import { buildMessageDedupScope, isDuplicateExact, isDuplicateSubstring, stripSenderFromText, isOwnMessage, cleanupRecentMap, cleanSenderStatus } from './messageProcessing.js'
import { playNotificationSound } from './sound.js'
import { pickNotifIconDataUrl } from '../native/utils/messengerLogos.js' // v1.2.333/378/379/381: картинка уведомления (аватар отправителя в приоритете; логотип по типу из url — только если аватара нет)
export function createHandleNewMessage(deps) {
  const {
    recentNotifsRef, lastRibbonTsRef, lastSoundTsRef, notifCountRef,
    pipelineTraceRef,
    settingsRef, activeIdRef, messengersRef, windowFocusedRef,
    setAccountInfo, setActiveId, setChatHistory, setLastMessage, setMessagePreview,
    setNewMessageIds, setStatusBarMsg, setUnreadCounts,
    previewTimers, statusBarMsgTimer, bumpStatsRef, traceNotif,
  } = deps
  // ── Обработка входящего сообщения (общая для ipc-message и console-message) ──
  // extra = { senderName, iconUrl } — опционально, из перехваченного Notification
  // Если extra есть → из __CC_NOTIF__ (Notification API) — надёжный источник
  // Если extra нет → из MutationObserver (new-message IPC) — может быть ложным
  return function handleNewMessage(messengerId, text, extra) {
    if (!text) return
    traceNotif('handle', 'info', messengerId, text, `extra=${extra ? `{s:"${(extra.senderName||'').slice(0,20)}",icon:${!!(extra.iconUrl||extra.iconDataUrl)}}` : 'нет'}`)

    // v0.80.2: Sender clean + strip + own-msg
    const rawSender = extra?.senderName || ''
    const senderName = cleanSenderStatus(rawSender)
    if (rawSender !== senderName) traceNotif('handle', 'info', messengerId, text, `cleanSender: "${rawSender.slice(0,30)}" → "${senderName.slice(0,30)}"`)

    const dedupScope = buildMessageDedupScope(senderName, extra?.chatTag || '', extra?.messageId || '')
    const exactDedup = isDuplicateExact(messengerId, text, recentNotifsRef.current, 10000, dedupScope)
    if (exactDedup.blocked) {
      traceNotif('dedup', 'block', messengerId, text, `recentNotifs | scope=${dedupScope || 'messenger'} age=${exactDedup.age}ms`)
      return
    }
    const subDedup = isDuplicateSubstring(messengerId, text, recentNotifsRef.current, 5000, dedupScope)
    if (subDedup.blocked) {
      traceNotif('dedup', 'block', messengerId, text, `substring-dedup | scope=${dedupScope || 'messenger'} prevLen=${subDedup.prevLen} age=${subDedup.age}ms`)
      return
    }
    recentNotifsRef.current.set(exactDedup.key, exactDedup.now)
    cleanupRecentMap(recentNotifsRef.current)

    const stripped = stripSenderFromText(text, senderName)
    if (stripped.stripped) {
      text = stripped.text
      if (!text) return
      traceNotif('handle', 'info', messengerId, text, `sender-strip: убрано "${senderName}" из начала`)
    } else if (isOwnMessage(text, senderName, extra?.fromNotifAPI)) {
      traceNotif('dedup', 'block', messengerId, text, `own-msg | sender="${senderName}" textStart="${text.slice(0,20)}"`)
      return
    }
    // v0.80.3: Подавляем ribbon только если:
    // 1. fromNotifAPI=false (MutationObserver) — НЕ блокируем (VK не шлёт Notification API,
    //    мы не знаем открыт ли конкретный чат — лучше показать лишний раз чем пропустить)
    // 2. fromNotifAPI=true (Notification API) — мессенджер САМ решил показать уведомление,
    //    значит текущий чат ≠ чат сообщения → ПРОПУСКАЕМ (не блокируем)
    // Итого: viewing блокирует ТОЛЬКО если НЕТ extra (нет sender, нет source — мусор)
    const isViewingThisTab = windowFocusedRef.current && activeIdRef.current === messengerId
    if (isViewingThisTab && extra?.source === 'vk-exec-fallback' && !extra?.vkActiveUnread) { traceNotif('viewing', 'block', messengerId, text, 'VK-EXEC active visible chat: block virtualized old DOM nodes'); return }
    if (isViewingThisTab && extra?.source === 'vk-exec-fallback' && extra?.vkActiveUnread) traceNotif('viewing', 'pass', messengerId, text, 'VK-EXEC active visible chat: pass confirmed unread marker')
    if (isViewingThisTab && !extra) {
      traceNotif('viewing', 'block', messengerId, text, `focused=${windowFocusedRef.current} activeId=${activeIdRef.current}`)
      return
    }
    if (isViewingThisTab && extra?.fromNotifAPI) {
      traceNotif('viewing', 'pass', messengerId, text, `focused=true НО fromNotifAPI=true → мессенджер считает чат не открыт`)
    } else if (isViewingThisTab && extra && !extra.fromNotifAPI) {
      traceNotif('viewing', 'pass', messengerId, text, `focused=true НО MutationObserver → не знаем открыт ли чат → показываем`)
    } else {
      traceNotif('viewing', 'pass', messengerId, text, `focused=${windowFocusedRef.current} activeId=${activeIdRef.current}`)
    }

    // Автопереключение на вкладку с новым сообщением (если включено).
    // v1.2.359: extra.background=true (фоновый источник, напр. скрытая страница «Вопросы» Ozon) НЕ крадёт
    // фокус — иначе новый вопрос выдёргивал бы пользователя из другого мессенджера на Ozon.
    if (settingsRef.current.autoSwitchOnMessage && messengerId !== activeIdRef.current && !extra?.background) {
      setActiveId(messengerId)
    }

    // Звук и уведомление — per-messenger настройки (v0.47.0)
    const mNotifs = (settingsRef.current.messengerNotifs || {})[messengerId] || {}
    const messengerMuted = !!(settingsRef.current.mutedMessengers || {})[messengerId]
    // Per-messenger sound: messengerNotifs[id].sound > mutedMessengers > глобальный soundEnabled
    const soundOn = mNotifs.sound !== undefined ? mNotifs.sound : !messengerMuted
    // Per-messenger ribbon: messengerNotifs[id].ribbon > notificationsEnabled (глобальный)
    const ribbonOn = mNotifs.ribbon !== undefined ? mNotifs.ribbon : true
    const mInfo = messengersRef.current.find(x => x.id === messengerId)
    const deferSoundUntilRibbon = !!extra?.fromTitleFallback
    const canPlaySound = settingsRef.current.soundEnabled !== false && soundOn
    const playAcceptedSound = (reason) => {
      playNotificationSound(mInfo?.color)
      lastSoundTsRef.current[messengerId] = Date.now()
      traceNotif('sound', 'pass', messengerId, text, reason)
    }
    if (canPlaySound && !deferSoundUntilRibbon) {
      playAcceptedSound('звук воспроизведён')
    } else if (canPlaySound && deferSoundUntilRibbon) {
      traceNotif('sound', 'info', messengerId, text, 'MAX title-fallback: звук отложен до main-result ok=true')
    } else {
      traceNotif('sound', 'block', messengerId, text, `global=${settingsRef.current.soundEnabled !== false} muted=${messengerMuted} perMsg=${mNotifs.sound}`)
    }
    // v0.61.1: убираем суффикс #N для отображения (dedup уже прошёл)
    const displayText = text.replace(/ #\d+$/, '')

    if (settingsRef.current.notificationsEnabled !== false && ribbonOn) {
      lastRibbonTsRef.current[messengerId] = Date.now()
      // v0.80.4: ribbon использует очищенный senderName (без "заходила X назад")
      window.api?.invoke('app:custom-notify', {
        title: senderName || '',
        body: displayText.length > 100 ? displayText.slice(0, 97) + '…' : displayText,
        fullBody: displayText.length > 100 ? displayText : '',
        iconUrl: extra?.iconUrl || undefined,
        // v1.2.381: аватар отправителя в приоритете (data-URL или URL на скачивание окном); логотип — только если аватара нет (см. pickNotifIconDataUrl). Регресс v1.2.378: логотип перекрывал аватар ВК.
        iconDataUrl: pickNotifIconDataUrl(extra, mInfo),
        color: mInfo?.color || '#2AABEE',
        emoji: mInfo?.emoji || '💬',
        messengerName: mInfo?.name || 'ЦентрЧатов',
        messengerId: messengerId,
        senderName: senderName || '',
        chatTag: extra?.chatTag || '',
        messageId: extra?.messageId || null, source: extra?.notifSource || extra?.source || null,
      }).then(result => {
        traceNotif('ribbon', result?.ok ? 'pass' : 'warn', messengerId, text, `main-result ok=${!!result?.ok} id=${result?.id || 'нет'} error=${result?.error || ''} sender="${senderName.slice(0,20)}" iconUrl=${(extra?.iconUrl||'нет').slice(0,30)} iconData=${(extra?.iconDataUrl||'нет').slice(0,30)}`)
        if (result?.ok && deferSoundUntilRibbon && canPlaySound) playAcceptedSound('звук после подтверждённого ribbon')
      }).catch(err => {
        traceNotif('ribbon', 'warn', messengerId, text, `main-result error=${err?.message || err}`)
      })
      traceNotif('ribbon', 'info', messengerId, text, `invoke app:custom-notify | sender="${senderName.slice(0,20)}" iconUrl=${(extra?.iconUrl||'нет').slice(0,30)} iconData=${(extra?.iconDataUrl||'нет').slice(0,30)}`)
    } else {
      traceNotif('ribbon', 'block', messengerId, text, `выключен | global=${settingsRef.current.notificationsEnabled !== false} perMsg=${ribbonOn}`)
    }

    // v0.72.5: Fallback Notification count — увеличиваем при каждом __CC_NOTIF__
    notifCountRef.current[messengerId] = (notifCountRef.current[messengerId] || 0) + 1
    // Если DOM-парсинг (unreadCounts) = 0, используем notifCount как fallback
    setUnreadCounts(prev => {
      if ((prev[messengerId] || 0) === 0 && notifCountRef.current[messengerId] > 0) {
        return { ...prev, [messengerId]: notifCountRef.current[messengerId] }
      }
      return prev
    })

    // Превью сообщения в бейдже вкладки (5 секунд)
    const previewText = displayText.slice(0, 32) + (displayText.length > 32 ? '…' : '')
    setMessagePreview(prev => ({ ...prev, [messengerId]: previewText }))
    clearTimeout(previewTimers.current[messengerId])
    previewTimers.current[messengerId] = setTimeout(() => {
      setMessagePreview(prev => { const p = { ...prev }; delete p[messengerId]; return p })
    }, 5000)

    // Добавляем в историю AI
    setChatHistory(prev => [...prev.slice(-19), { messengerId, text, ts: Date.now() }])

    // Авто-ответчик по ключевым словам
    const rules = settingsRef.current.autoReplyRules || []
    let autoReplied = false
    for (const rule of rules) {
      if (!rule.active) continue
      const matched = rule.keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))
      if (matched) {
        navigator.clipboard.writeText(rule.reply).catch(() => {})
        window.api?.invoke('app:custom-notify', {
          title: '🤖 Авто-ответ',
          body: `Правило: "${rule.keywords[0]}" — ответ в буфере`,
          color: mInfo?.color || '#2AABEE',
          iconDataUrl: pickNotifIconDataUrl(null, mInfo), // v1.2.379 (#3): логотип источника в авто-ответе. v1.2.382: через pickNotifIconDataUrl (у авто-ответа аватара нет → логотип); resolveMessengerLogo больше не импортируется
          emoji: mInfo?.emoji || '🤖',
          messengerName: mInfo?.name || 'ЦентрЧатов',
          messengerId: messengerId,
        }).catch(() => {})
        autoReplied = true
        break
      }
    }

    // Статистика сообщений
    bumpStatsRef.current?.({ today: 1, total: 1, ...(autoReplied ? { autoToday: 1 } : {}) })

    // Анимация на вкладке (ping 3 секунды)
    setNewMessageIds(prev => { const n = new Set(prev); n.add(messengerId); return n })
    setTimeout(() => {
      setNewMessageIds(prev => { const n = new Set(prev); n.delete(messengerId); return n })
    }, 3000)

    setLastMessage(text)

    // Последнее сообщение в статусбар (исчезает через 8 сек)
    const mName = messengersRef.current.find(x => x.id === messengerId)?.name || ''
    const displayName = extra?.senderName ? `${mName} — ${extra.senderName}` : mName
    const shortText = text.slice(0, 40) + (text.length > 40 ? '…' : '')
    setStatusBarMsg(`${displayName}: ${shortText}`)
    clearTimeout(statusBarMsgTimer.current)
    statusBarMsgTimer.current = setTimeout(() => setStatusBarMsg(null), 8000)
  }
}
