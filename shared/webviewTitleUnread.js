/**
 * v1.2.448 — «непрочитанное по заголовку вкладки» (событие page-title-updated).
 *
 * ЗАЧЕМ ВЫНЕСЕНО (продолжение разгрузки v1.2.447):
 *  1) `src/utils/webviewSetup.js` — самый заполненный файл интерфейса. Этот блок был вторым
 *     по величине и при этом ЕДИНСТВЕННЫМ крупным, чьи связи можно перечислить списком;
 *  2) `shared/` — вне бюджета строк интерфейса;
 *  3) ГЛАВНОЕ: раньше этот путь НЕ БЫЛ покрыт ни одним тестом, хотя именно он исторически
 *     давал больше всего повторных поломок (звук-фантомы у МАКС v1.2.7, обнуление счётчика
 *     Ozon v1.2.374, шторм v1.2.417). После выноса его можно прогонять с подставными
 *     данными — см. `src/__tests__/webviewTitleUnread.vitest.js`.
 *
 * ── ЧТО ДЕЛАЕТ ────────────────────────────────────────────────────────────────
 * Мессенджеры пишут число непрочитанных в заголовок вкладки: «(3) WhatsApp». Мы это число
 * читаем, обновляем свой счётчик и — для мессенджеров без «богатого» события о сообщении —
 * играем звук как запасной путь. У МАКСа звук по заголовку НЕ играем (только после
 * подтверждённой карточки), иначе получаются «пик без уведомления» и двойной звук.
 * Заголовок БЕЗ числа при открытой и активной вкладке = «всё прочитано» → обнуляем; КРОМЕ
 * Ozon, у которого числа в заголовке нет никогда и счётчик ведёт наш собственный сторож.
 *
 * ── ПОЧЕМУ ВСЁ ПРИХОДИТ ОДНИМ УЗЛОМ `ctx` ────────────────────────────────────
 * Связей у блока много (счётчики, настройки, ссылки на элементы, помощники здоровья).
 * Перечислять их 27 отдельными параметрами — верный способ однажды опечататься. Поэтому
 * они передаются ОДНИМ объектом и разбираются в одном месте — тот же приём, что у
 * `AppModals` (v1.2.442). Отсутствующая связь тогда сразу даёт ошибку, а не тихую пропажу
 * счётчика, и тест это видит.
 */
export function createTitleUnreadHandler(ctx) {
  const {
    // наши записи и состояние
    notifCountRef, notifReadyRef, lastRibbonTsRef, notifMidTsRef, lastSoundTsRef,
    recentNotifsRef, senderCacheRef, titleUnreadBaselineRef,
    maxTitleFallbackTimers, maxTitleFallbackStateRef,
    settingsRef, messengersRef, activeIdRef, windowFocusedRef,
    // изменение экрана
    setUnreadCounts, updateHealth, healthLabel, healthUrl, scheduleHealthProbe,
    // помощники (передаются, потому что живут в src/, а этот файл — в shared/)
    traceNotif, handleNewMessage, cleanupSenderCache, isOzonWebview,
    decideMaxTitleUnread, resetMaxTitleUnread, scheduleMaxTitleFallback,
    playNotificationSound, markHealthOk,
  } = ctx || {}

  return function handleTitleUpdated(el, messengerId, e) {
        const match = e.title?.match(/\((\d+)\)/) || e.title?.match(/^(\d+)\s+непрочитанн/)
        if (match) {
          const count = parseInt(match[1], 10) || 0
          notifCountRef.current[messengerId] = Math.min(notifCountRef.current[messengerId] || 0, count)
          setUnreadCounts(prev => {
            if (prev[messengerId] === count) return prev
            const prevCount = prev[messengerId] || 0
            const titleUpdateUrlForDiag = (() => { try { return el?.getURL?.() || messengersRef.current.find(x => x.id === messengerId)?.url || '' } catch { return '' } })(); if (/web\.max\.ru/.test(titleUpdateUrlForDiag)) traceNotif('debug', 'info', messengerId, `title-count ${count}`, `MAX page-title-updated raw="${String(e.title || '').slice(0, 120)}" prevUnread=${prevCount} delta=${count - prevCount} notifRef=${notifCountRef.current[messengerId] || 0} activeId=${activeIdRef.current} focused=${windowFocusedRef.current} url=${titleUpdateUrlForDiag.slice(0, 120)}`)
            // v0.86.0: title-update остаётся звуковым fallback для мессенджеров без rich-event.
            // v1.2.7: MAX (web.max.ru) исключён — звук играет только после подтверждённого ribbon,
            // чтобы не было timestamp-фантомов, двойного звука и "пик без уведомления".
            const titleUpdateUrl = (() => { try { return el?.getURL?.() || messengersRef.current.find(x => x.id === messengerId)?.url || '' } catch { return '' } })()
            const isMaxTitleFallback = /web\.max\.ru/.test(titleUpdateUrl)
            const titleDecision = decideMaxTitleUnread({ state: titleUnreadBaselineRef.current, messengerId, messengerUrl: titleUpdateUrl, count })
            if (isMaxTitleFallback && !titleDecision.schedule) traceNotif('debug', 'info', messengerId, `title-count ${count}`, `MAX title-only no-ribbon | reason=${titleDecision.reason} raw="${String(e.title || '').slice(0, 120)}" count=${count} prevUnread=${prevCount} url=${titleUpdateUrl.slice(0, 120)}`)
            if (titleDecision.schedule && count > prevCount && notifReadyRef.current[messengerId]) {
              const titleDelta = isMaxTitleFallback && titleDecision.prevCount !== null ? Math.max(1, count - titleDecision.prevCount) : count - prevCount
              scheduleMaxTitleFallback({
                el,
                messengerId,
                delta: titleDelta,
                messengerUrl: titleUpdateUrl,
                notifReadyRef,
                lastRibbonTsRef,
                notifMidTsRef,
                timersRef: maxTitleFallbackTimers,
                fallbackStateRef: maxTitleFallbackStateRef,
                recentNotifsRef,
                senderCacheRef,
                cleanupSenderCache,
                handleNewMessage,
                traceNotif,
              })
              const s = settingsRef.current
              const mn = (s.messengerNotifs || {})[messengerId] || {}
              const muted = !!(s.mutedMessengers || {})[messengerId]
              const sndOn = mn.sound !== undefined ? mn.sound : !muted
              const lastSnd = lastSoundTsRef.current[messengerId] || 0
              const sinceLast = Date.now() - lastSnd
              if (!isMaxTitleFallback && s.soundEnabled !== false && sndOn && sinceLast > 3000) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                playNotificationSound(mi?.color)
                lastSoundTsRef.current[messengerId] = Date.now()
                traceNotif('sound', 'pass', messengerId, `title +${titleDelta}`, 'звук title-update')
              } else if (isMaxTitleFallback) {
                traceNotif('sound', 'info', messengerId, `title +${titleDelta}`, 'MAX: title-update звук пропущен, ждём подтверждённый ribbon')
              }
            }
            return { ...prev, [messengerId]: count }
          })
          updateHealth(messengerId, prev => markHealthOk(prev, {
            id: messengerId,
            type: 'webview',
            label: healthLabel(messengerId),
            url: healthUrl(el, messengerId),
            details: 'title-update ответил',
          }))
          scheduleHealthProbe(el, messengerId, 'Проверка после title-update', 250)
        } else if (activeIdRef.current === messengerId && windowFocusedRef.current) {
          // v0.74.0: Title без числа — пользователь смотрит и всё прочитал. v1.2.374: КРОМЕ Ozon — у него в
          // заголовке числа НЕТ никогда, а непрочитанное ведёт наш сторож (ozonCounts) → обнуление сбрасывало значок рейла Ozon в 0.
          const titleResetUrl = (() => { try { return el?.getURL?.() || '' } catch { return '' } })()
          if (!isOzonWebview(el, messengerId)) {
            notifCountRef.current[messengerId] = 0
            try { if (/web\.max\.ru/.test(titleResetUrl)) traceNotif('debug', 'info', messengerId, '', `MAX title reset skipped | url=${titleResetUrl.slice(0, 120)} kept=true`); else resetMaxTitleUnread(titleUnreadBaselineRef.current, messengerId, titleResetUrl) } catch {}
            setUnreadCounts(prev => ((prev[messengerId] || 0) === 0) ? prev : { ...prev, [messengerId]: 0 })
          }
        }
  }
}
