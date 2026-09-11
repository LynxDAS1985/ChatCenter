// shared/inboxScrollToBottom.js — v1.2.455
//
// Кнопка «↓ вниз» в переписке: прокрутить к самому свежему сообщению.
//
// ЗАЧЕМ ВЫНЕСЕНО (правило проекта «не резать комментарии, а разделять файл»):
//   • экран переписки [src/native/modes/InboxMode.jsx] стоял на своём потолке
//     1121/1122 строк — в него нельзя было добавить даже строку комментария;
//   • сама эта функция была 111 строк при проектном лимите «одна функция ≤ 100»;
//   • и главное: она НИКАК не проверялась. Внутри — две совершенно разные ветки
//     («докрутить прямо сейчас» и «сначала догрузить, потом плавно приземлиться»),
//     а поймать ошибку в них можно было только руками, кликая по кнопке.
//   Здесь она проверяется тестом [src/__tests__/inboxScrollToBottom.vitest.js].
//
// ПОЧЕМУ В КОРНЕВОЙ shared/, А НЕ В src/: у интерфейса есть общий потолок строк
// (планка renderer-кода), и перенос внутри src/ его бы не разгрузил — папка shared/
// в эту планку не входит. Тот же приём применён в v1.2.448 и v1.2.454.
//
// ⚠️ ЗАВИСИМОСТИ ПЕРЕДАЮТСЯ ОДНИМ УЗЛОМ (ctx) — приём проекта (ADR-051). В том числе
// три ПОМОЩНИКА (computeScrollBehavior / computeJumpToEndGate / smoothScrollTo): они
// живут в src/native/utils, и если бы файл тянул их сам, получилась бы ссылка
// «общее → интерфейс», то есть в обратную сторону. Передача через ctx оставляет этот
// файл вообще без внешних связей — поэтому его и удалось накрыть тестом целиком.
//
// 🔴 ЛОВУШКА, которую тут легко потерять: ранний выход `return` в ветке догрузки.
// Без него после плавного приземления сработал бы ещё и обычный прыжок в конец.

/**
 * @param {Object} ctx узел зависимостей (см. вызов в InboxMode.jsx)
 * @returns {Function} функция-обработчик нажатия на кнопку «↓»
 */
export default function createScrollToBottom(ctx) {
  return function scrollToBottom() {
    const {
      msgsScrollRef, activeViewKey, store, activeMessages, activeUnread, activeChat, activeTopic,
      scrollDiag, scrollPosByChatRef, setAtBottom, setNewBelow, maxEverSentRef, markReadCurrentView,
      computeScrollBehavior, computeJumpToEndGate, smoothScrollTo,
    } = ctx
    const el = msgsScrollRef.current
    if (!el) return
    const viewKey = activeViewKey || store.activeChatId
    const deltaPx = el.scrollHeight - el.scrollTop - el.clientHeight
    const behavior = computeScrollBehavior(deltaPx, el.clientHeight)
    // v0.95.11 диагностика: gap между chat.lastMessageId (сервер) и activeMessages[last] (DOM).
    const loadedIncoming = activeMessages.filter(m => !m.isOutgoing).length
    const chatObj = store.chats.find(c => c.id === viewKey)
    const chatLastMessageId = chatObj?.lastMessageId || null
    const loadedLastMsg = activeMessages[activeMessages.length - 1]
    const loadedLastId = loadedLastMsg?.id ? String(loadedLastMsg.id) : null
    const MSG_ID_STEP = 1048576
    const gapMessages = (chatLastMessageId && loadedLastId)
      ? Math.round((Number(chatLastMessageId) - Number(loadedLastId)) / MSG_ID_STEP)
      : null
    const unreadVsLoaded = activeUnread - loadedIncoming
    // v0.95.20: гейт «грузить-потом-скроллить» — computeJumpToEndGate.
    // Раньше (v0.95.12-v0.95.19): `unreadVsLoaded > 50`. Если у юзера 10 непрочитанных
    // но они в 200 сообщениях от загруженного окна — fallback прыгал сразу, сообщения
    // дописывались после («эффект появления»). Теперь — любой gap → load-first.
    // Эталон: Telegram Desktop `_history->isReadyFor()` перед scroll.
    const isForumTopic = !!(activeChat?.isForum && activeTopic)
    const topicLastMessageId = isForumTopic ? (activeTopic.lastMessageId || null) : null
    const effectiveLastMessageId = isForumTopic ? topicLastMessageId : chatLastMessageId
    const loading = !!store.loadingMessages?.[viewKey]
    const shouldLoadFirst = computeJumpToEndGate({
      lastMessageId: effectiveLastMessageId,
      gapMessages,
      loading,
    })
    scrollDiag.logEvent('button-scroll-bottom', {
      activeUnread, deltaPx, behavior, messages: activeMessages.length,
      loadedIncoming, chatLastMessageId, loadedLastId, gapMessages, unreadVsLoaded,
      branch: shouldLoadFirst ? 'load-first' : 'direct-scroll',
      isForumTopic, effectiveLastMessageId, loading,
    })

    // v0.95.12-v0.95.16: JUMP-TO-END через ИТЕРАТИВНЫЙ fetch.
    // См. .memory-bank/jump-to-end-saga.md — полная история v0.95.12-15 + v0.95.16 форумы.
    // TDLib `getChatHistory` / `getMessageThreadHistory` возвращают меньше limit
    // (issue #740, ответ levlam). Решение — итерации до untilMessageId.
    // v0.95.15: store.loadMessagesUntil для обычных чатов.
    // v0.95.16: store.loadTopicMessagesUntil для форум-топиков (getMessageThreadHistory)
    //   + smoothScroll с easeOutCubic для красивого «приземления».
    if (shouldLoadFirst) {
      scrollDiag.logEvent('button-scroll-jump-to-end', {
        chatLastMessageId, topicLastMessageId,
        effectiveLastMessageId, isForumTopic,
        loadedLastId, gapMessages, unreadVsLoaded,
        loadedIncoming, activeUnread,
      })
      const loadPromise = isForumTopic
        ? store.loadTopicMessagesUntil(store.activeChatId, activeTopic, effectiveLastMessageId, 100)
        : store.loadMessagesUntil(viewKey, effectiveLastMessageId, 100)
      loadPromise.then((result) => {
        // rAF×2 — React commit + первый paint завершились → scrollHeight точный.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const elNow = msgsScrollRef.current
            if (!elNow) return
            // v0.95.16: smoothScroll с easeOutCubic (быстрый разгон + плавное приземление).
            // v0.95.18: ДВУХФАЗНЫЙ режим (twoPhase:true). При distance > 1 viewport —
            // instant prelude к (target-viewport) + smooth последний viewport.
            // Юзер видит «приземление» ленты ВСЕГДА, независимо от distance
            // (jump-to-end после reload часто даёт 50+ viewport, без twoPhase
            // smoothScroll fallback на instant и юзер не видит анимацию).
            smoothScrollTo(elNow, elNow.scrollHeight, {
              duration: 350,
              twoPhase: true,
              onComplete: () => {
                if (viewKey) scrollPosByChatRef.current.set(viewKey, {
                  anchorMsgId: null, screenTop: 0, atBottom: true,  // v1.2.186: в конце — якорь не нужен
                })
                setAtBottom(true)
                setNewBelow(0)
                const lastIdNum = Number(effectiveLastMessageId) || 0
                if (lastIdNum > 0 && lastIdNum > (maxEverSentRef.current || 0)) {
                  maxEverSentRef.current = lastIdNum
                  markReadCurrentView(viewKey, lastIdNum, { source: 'button-scroll' })
                }
                scrollDiag.logEvent('button-scroll-jump-to-end-done', {
                  effectiveLastMessageId, isForumTopic,
                  iterations: result?.iterations || 0,
                  messagesLoaded: result?.messages?.length || 0,
                  scrollTop: elNow.scrollTop, scrollHeight: elNow.scrollHeight,
                })
              },
            })
          })
        })
      }).catch((err) => {
        scrollDiag.logEvent('button-scroll-jump-to-end-error', {
          error: String(err?.message || err),
        })
      })
      return  // ранний выход — fallback ниже не запускается
    }

    // === Обычное поведение (gap маленький ИЛИ нет lastMessageId ИЛИ идёт загрузка) ===
    el.scrollTo({ top: el.scrollHeight, behavior })
    if (viewKey) scrollPosByChatRef.current.set(viewKey, { anchorMsgId: null, screenTop: 0, atBottom: true })  // v1.2.186: в конце
    setAtBottom(true)
    setNewBelow(0)
    const lastMsg = activeMessages[activeMessages.length - 1]
    const lastId = Number(lastMsg?.id) || 0
    if (lastId > 0 && activeUnread > 0 && lastId > (maxEverSentRef.current || 0)) {
      maxEverSentRef.current = lastId
      markReadCurrentView(viewKey, lastId, { source: 'button-scroll' })
    }
  }
}
