// v0.87.103: вынесено из nativeStore.js — регистрация всех window.api.on(...) listeners.
// Подписки: tg:account-update, tg:login-step, tg:chats, tg:messages, tg:new-message,
// tg:chat-avatar, tg:typing, tg:chat-unread-sync, tg:unread-bulk-sync, tg:read.
// Возвращает функцию-отписку (для useEffect cleanup).
import { getUnreadAnchorDebug, logNativeScroll } from '../utils/scrollDiagnostics.js'
// v0.96.0 (Phase 0 M0.4): NotificationSource — паспорт сообщения для уведомлений.
import { createNotificationSource } from '../../shared/notificationSource.js'
// v1.2.74 (A1): фоновая догрузка чёткого превью плиток альбома в окно уведомления.
import { preloadAlbumThumb } from '../utils/albumThumbPreload.js'
import { buildNotifAlbum } from '../../../shared/notifAlbum.js'
import { getAccountColor } from './accountColors.js' // v1.2.155: цвет-метка аккаунта для грани уведомления
import { saveHiddenAccounts } from './accountFilter.js' // v1.2.163: держим скрытые аккаунты в localStorage синхронно
import { lastSenderLabel } from '../../../shared/chatPreviewSender.js' // v1.2.133: единое правило префикса имени
import { attachLastMsgHandlers } from './nativeStoreLastMsgIpc.js' // v1.2.133 (TODO-14): вынесенный блок превью

// v1.1.9: localStorage cache вынесен в nativeStoreCache.js. Импортируем для
// внутреннего использования + re-export для обратной совместимости (внешние
// импорты из './nativeStoreIpc.js' продолжают работать).
import { saveChatCache, loadChatCache } from './nativeStoreCache.js'
export { saveChatCache, loadChatCache }
// v1.2.12: handlers статуса отправки (tg:typing / tg:send-succeeded / tg:upload-progress)
// вынесены в nativeStoreSendIpc.js — файл превысил ceiling 730 после диагностических логов.
// ВАЖНО: tg:send-succeeded — фикс «дубля исходящих» (provisional id → final id).
// ОБЯЗАТЕЛЬНО ПРОЧИТАТЬ при правке outgoing-логики: .memory-bank/mistakes/outgoing-two-cases.md
import { attachSendIpcHandlers } from './nativeStoreSendIpc.js'

// Регистрация IPC слушателей. setState — обычный setter useState.
// stateRef — ref на текущий state (для чтения внутри listeners).
// Возвращает функцию отписки.
export function attachTelegramIpcListeners({ setState, stateRef }) {
  if (!window.api?.on) return () => {}
  const unsubs = []
  // v0.92.0: v0.91.21 ipc-burst tracker удалён (TODO-9) — Проблема 3 решена
  // через rAF-батчинг в v0.91.22. Maximum update depth больше не возникает.
  const addHandler = (channel, handler) => {
    const unsub = window.api.on(channel, handler)
    if (typeof unsub === 'function') unsubs.push(unsub)
  }

  // v1.2.12: handlers статуса отправки вынесены в отдельный модуль (см. import выше).
  // Регистрация — тот же addHandler/setState/stateRef, контракт снаружи не меняется.
  attachSendIpcHandlers({ addHandler, setState, stateRef, logNativeScroll })

  // v1.2.133 (TODO-14): блок «превью последнего сообщения» (tg:chat-last-message +
  // pending-очередь + метрика частоты) вынесен в nativeStoreLastMsgIpc.js — это
  // освободило место в файле (был на потолке 660) под импорт lastSenderLabel.
  // Фабрика возвращает applyPendingLastMessage — он нужен обработчику tg:chats ниже
  // (применяет pending-обновления превью, пришедшие ДО появления чата в state).
  const { applyPendingLastMessage } = attachLastMsgHandlers({ addHandler, setState, logNativeScroll })

  addHandler('tg:account-update', (acc) => {
    // v1.2.142 (диаг): что пришло на экран про аккаунт — добавление/удаление/статус.
    try {
      window.api?.send?.('app:log', { level: 'INFO',
        message: `[acct-store] account-update id=${acc?.id} status=${acc?.status || ''} removed=${!!acc?.removed} isLast=${!!acc?.wipeStats?.isLast} name=${acc?.name || ''}` })
    } catch (_) {}
    // v0.87.95: removed: true → удалить аккаунт.
    // v0.87.105 (ADR-016): при logout одного из нескольких — удаляем ТОЛЬКО его чаты/сообщения,
    // остальные аккаунты остаются. wipeStats.isLast === true → последний → полная очистка.
    if (acc.removed) {
      setState(s => {
        const isLast = acc.wipeStats?.isLast || s.accounts.length <= 1
        if (isLast) {
          // Полная очистка — последний аккаунт удалили
          saveHiddenAccounts([]) // v1.2.164: чистим и localStorage, иначе «призраки» скрытых при рестарте
          return {
            ...s,
            accounts: [],
            activeAccountId: null,
            hiddenAccountIds: [], // v1.2.163
            soloAccountId: null,
            activeChatId: null,
            chats: [],
            messages: {},
            forumTopics: {},
            forumTopicsLoading: {},
            forumTopicPanelChatId: null,
            activeForumTopic: {},
            loadingMessages: {},
            typing: {},
            lastWipe: acc.wipeStats || null,
          }
        }
        // Не последний — точечная очистка
        const newAccounts = s.accounts.filter(a => a.id !== acc.id)
        const newChats = s.chats.filter(c => c.accountId !== acc.id)
        const newMessages = {}
        for (const [chatId, msgs] of Object.entries(s.messages)) {
          if (chatId.split(':')[0] !== acc.id) newMessages[chatId] = msgs
        }
        const newForumTopics = {}
        for (const [chatId, topics] of Object.entries(s.forumTopics || {})) {
          if (chatId.split(':')[0] !== acc.id) newForumTopics[chatId] = topics
        }
        const newActiveForumTopic = {}
        for (const [chatId, topic] of Object.entries(s.activeForumTopic || {})) {
          if (chatId.split(':')[0] !== acc.id) newActiveForumTopic[chatId] = topic
        }
        const newLoading = {}
        for (const chatId of Object.keys(s.loadingMessages)) {
          if (chatId.split(':')[0] !== acc.id) newLoading[chatId] = s.loadingMessages[chatId]
        }
        // Сброс активного чата если он принадлежал удалённому аккаунту
        const activeStillValid = s.activeChatId && s.activeChatId.split(':')[0] !== acc.id
        // v1.2.163: убрать удалённый аккаунт из скрытых.
        let newHidden = (s.hiddenAccountIds || []).filter(id => id !== acc.id)
        // v1.2.168 (баг): если после удаления ВСЕ оставшиеся аккаунты оказались скрыты —
        // показываем всех. Иначе оставшийся аккаунт невидим (список пуст → «Загрузка чатов…»
        // навсегда, аватарка затемнена), а снять скрытие через UI нельзя (при 1 аккаунте
        // галочек нет). Пример: скрыли A (виден только B) → удалили B → A остался скрытым.
        if (newAccounts.length > 0 && newAccounts.every(a => newHidden.includes(a.id))) newHidden = []
        if (newHidden.length !== (s.hiddenAccountIds || []).length) saveHiddenAccounts(newHidden)
        // v1.2.168: соло сохраняем, только если соло-аккаунт ещё существует (страховка —
        // иначе оставшийся не-соло аккаунт был бы затемнён и невидим).
        const newSolo = (s.soloAccountId && newAccounts.some(a => a.id === s.soloAccountId)) ? s.soloAccountId : null
        // Если активный аккаунт удалили — переключаемся на первый оставшийся
        const newActiveAccountId = s.activeAccountId === acc.id
          ? (newAccounts[0]?.id || null)
          : s.activeAccountId
        return {
          ...s,
          accounts: newAccounts,
          activeAccountId: newActiveAccountId,
          hiddenAccountIds: newHidden,
          soloAccountId: newSolo,
          activeChatId: activeStillValid ? s.activeChatId : null,
          chats: newChats,
          messages: newMessages,
          forumTopics: newForumTopics,
          forumTopicPanelChatId: s.forumTopicPanelChatId?.split(':')[0] === acc.id ? null : s.forumTopicPanelChatId,
          activeForumTopic: newActiveForumTopic,
          loadingMessages: newLoading,
          lastWipe: acc.wipeStats || null,
        }
      })
      return
    }
    setState(s => {
      const existing = s.accounts.find(a => a.id === acc.id)
      const accounts = existing
        ? s.accounts.map(a => a.id === acc.id ? { ...a, ...acc } : a)
        : [...s.accounts, acc]
      return { ...s, accounts, activeAccountId: s.activeAccountId || acc.id }
    })
  })

  addHandler('tg:login-step', (step) => {
    setState(s => ({ ...s, loginFlow: step }))
  })

  // v1.2.146: временный аккаунт переименован в настоящий (tg_pending_X → tg_<userId>).
  // Убираем осиротевшую запись СТАРОГО (временного) id из списка аккаунтов — иначе она
  // висит призрачной меткой-фильтром. Настоящий аккаунт приходит отдельно (tg:account-update).
  addHandler('tg:account-renamed', ({ oldId, newId } = {}) => {
    if (!oldId || !newId || oldId === newId) return
    setState(s => {
      if (!s.accounts.some(a => a.id === oldId)) return s // старого нет — ничего не делаем
      // v1.2.163: переносим id в скрытых/соло со старого на новый
      const renamedHidden = (s.hiddenAccountIds || []).map(id => id === oldId ? newId : id)
      if ((s.hiddenAccountIds || []).includes(oldId)) saveHiddenAccounts(renamedHidden)
      return {
        ...s,
        accounts: s.accounts.filter(a => a.id !== oldId),
        activeAccountId: s.activeAccountId === oldId ? newId : s.activeAccountId,
        hiddenAccountIds: renamedHidden,
        soloAccountId: s.soloAccountId === oldId ? newId : s.soloAccountId,
      }
    })
  })

  addHandler('tg:chats', ({ accountId, chats, append }) => {
    setState(s => {
      if (append) {
        // v0.87.105: при append дедуп по id (Map с префиксом accountId — между аккаунтами уникален)
        const existing = new Set(s.chats.map(c => c.id))
        const newOnes = chats.filter(c => !existing.has(c.id))
        return { ...s, chats: [...s.chats, ...applyPendingLastMessage(newOnes)] }
      }
      // v0.87.38: MERGE вместо REPLACE — сохраняем lastMessageTs от более нового значения.
      // v0.87.105 (ADR-016): MERGE применяется ТОЛЬКО к чатам ЭТОГО аккаунта;
      // чаты других аккаунтов остаются нетронутыми (multi-account).
      const existingMap = new Map(s.chats.filter(c => c.accountId === accountId).map(c => [c.id, c]))
      const merged = chats.map(c => {
        const old = existingMap.get(c.id)
        if (!old) return c
        return {
          ...c,
          lastMessageTs: Math.max(c.lastMessageTs || 0, old.lastMessageTs || 0),
          lastMessage: (old.lastMessageTs || 0) > (c.lastMessageTs || 0) ? old.lastMessage : c.lastMessage,
        }
      })
      // v0.91.9: применяем pending lastMessage updates (которые пришли ДО chat в state).
      const withPending = applyPendingLastMessage(merged)
      const others = s.chats.filter(c => c.accountId !== accountId)
      return { ...s, chats: [...others, ...withPending] }
    })
  })

  // v1.2.133 (TODO-14): обработчик tg:chat-last-message + pending-очередь + метрика
  // частоты вынесены в nativeStoreLastMsgIpc.js (attachLastMsgHandlers вызван выше).
  // Там же имя автора превью пересчитывается через lastSenderLabel (фикс залипания, ADR-022).

  addHandler('tg:messages', ({ chatId, messages, append, appendNewer }) => {
    // v0.95.19: ПОЛНАЯ ДИАГНОСТИКА tg:messages — фиксируем что пришло и как обработано.
    let diagAction = 'replaced'
    let diagExistingBefore = 0
    let diagNextLen = 0
    let diagOldestIncoming = null
    let diagNewestIncoming = null
    let diagOldestNext = null
    let diagNewestNext = null
    setState(s => {
      const existing = s.messages[chatId] || []
      const chat = s.chats.find(c => c.id === chatId)
      logNativeScroll('store-tg-messages', {
        chatId, append: !!append, appendNewer: !!appendNewer, incoming: messages?.length || 0, existing: existing.length,
        active: s.activeChatId === chatId, ...getUnreadAnchorDebug(messages || [], chat?.unreadCount || 0),
      })
      let next
      if (append) {
        // v0.87.15: дозагрузка старых — добавляем в начало, убираем дубли
        const existingIds = new Set(existing.map(m => m.id))
        const newOld = messages.filter(m => !existingIds.has(m.id))
        next = [...newOld, ...existing]
        diagAction = 'prepended-old'
      } else if (appendNewer) {
        // v0.88.0: дозагрузка новых вниз — добавляем в конец, убираем дубли.
        // Сохраняем сортировку по id (на случай если backend вернул что-то не по порядку).
        const existingIds = new Set(existing.map(m => m.id))
        const newNewer = (messages || []).filter(m => !existingIds.has(m.id))
        // v0.88.1: если ничего нового — НЕ меняем state (избегаем лишнего рендера/«дёрга» UI).
        // Backend в v0.88.1 уже не эмитит пустые afterId-ответы, но на случай старого кода — защита здесь.
        if (newNewer.length === 0) {
          diagAction = 'appendNewer-empty-noop'
          diagExistingBefore = existing.length
          diagNextLen = existing.length
          const loadingCopy = { ...s.loadingMessages }
          delete loadingCopy[chatId]
          return { ...s, loadingMessages: loadingCopy }
        }
        next = [...existing, ...newNewer]
        diagAction = 'appended-newer'
      } else {
        next = messages
        diagAction = 'replaced'
      }
      // v0.95.19: фиксируем диапазоны для лога
      diagExistingBefore = existing.length
      diagNextLen = next.length
      const incomingArr = messages || []
      if (incomingArr.length) {
        diagOldestIncoming = String(incomingArr[0].id)
        diagNewestIncoming = String(incomingArr[incomingArr.length - 1].id)
      }
      if (next.length) {
        diagOldestNext = String(next[0].id)
        diagNewestNext = String(next[next.length - 1].id)
      }
      // v0.87.36: сохраняем в localStorage для мгновенного показа при следующем открытии
      saveChatCache(chatId, next)
      const loadingCopy = { ...s.loadingMessages }
      delete loadingCopy[chatId]
      return { ...s, messages: { ...s.messages, [chatId]: next }, loadingMessages: loadingCopy }
    })
    // v0.95.19: лог результата — что в state после обработки.
    try {
      logNativeScroll('tg-messages-applied', {
        chatId,
        action: diagAction,              // 'replaced' | 'prepended-old' | 'appended-newer' | 'appendNewer-empty-noop'
        incoming: messages?.length || 0,
        existingBefore: diagExistingBefore,
        nextLen: diagNextLen,
        oldestIncoming: diagOldestIncoming,
        newestIncoming: diagNewestIncoming,
        oldestNext: diagOldestNext,
        newestNext: diagNewestNext,
      })
    } catch (_) {}
  })

  addHandler('tg:new-message', ({ chatId, message }) => {
    // v0.87.38: дедупликация — если msg с таким id уже есть → обновляем, не дублируем.
    // Без этого: tg:messages загрузил 50 msg → tg:new-message пришёл для уже имеющегося
    // → дубль → React warning «Encountered two children with the same key».
    // v0.87.28: превью медиа в списке чатов
    const mediaPreview = message.mediaType === 'photo' ? '🖼 Фото'
      : message.mediaType === 'video' ? '📹 Видео'
      : message.mediaType === 'audio' ? '🎵 Аудио'
      : message.mediaType === 'file' ? ('📎 ' + (message.mediaPreview || 'Файл'))
      : message.mediaType === 'link' ? '🔗 Ссылка'
      : message.mediaType === 'location' ? '📍 Геолокация'
      : message.mediaType === 'contact' ? '👤 Контакт'
      : message.mediaType === 'poll' ? '📊 Опрос'
      : message.mediaType ? '📎 вложение' : ''
    const preview = message.text || mediaPreview || ''
    // v0.95.19: ПОЛНАЯ ДИАГНОСТИКА tg:new-message — фиксируем КАЖДОЕ событие.
    // Сохраним переменные ВНЕ setState для лога после.
    let diagAction = 'unknown'
    let diagExisting = 0
    let diagNewestLoaded = 0
    let diagIsContiguous = false
    let diagIsDup = false
    let diagGapMessages = 0
    let diagIsActiveChat = false
    setState(s => {
      const existing = s.messages[chatId] || []
      // Дедупликация: если msg с таким id уже есть — обновляем на месте
      const isDup = existing.some(m => m.id === message.id)
      // v0.95.0: держим загруженный список НЕПРЕРЫВНЫМ. Если окно стоит на старом блоке
      // (читаем бэклог), а свежее сообщение далеко за концом загруженного (разрыв >~200
      // сообщений) — НЕ вклеиваем: иначе массив рвётся → каскад markRead / застрявший
      // счётчик (см. v0.94.7, mistakes/native-scroll-unread.md). Бейдж/превью/«↓N»
      // обновляются всё равно (useNewBelowCounter слушает событие напрямую), сообщение
      // подгрузится при прокрутке вниз непрерывно. Паттерн Telegram/Discord/Slack:
      // live-append только когда окно «у низа». TDLib message_id = server_id << 20.
      const GAP_LIMIT_IDS = 200 * 1048576
      const newestLoaded = existing.length ? Number(existing[existing.length - 1].id) : 0
      const isContiguous = !newestLoaded || (Number(message.id) - newestLoaded) <= GAP_LIMIT_IDS
      const nextMsgs = isDup
        ? existing.map(m => m.id === message.id ? message : m)
        : (isContiguous ? [...existing, message] : existing)
      // v0.95.19: записываем диагностику
      diagAction = isDup ? 'updated' : (isContiguous ? 'inserted' : 'skipped-non-contiguous')
      diagExisting = existing.length
      diagNewestLoaded = newestLoaded
      diagIsContiguous = isContiguous
      diagIsDup = isDup
      diagGapMessages = newestLoaded ? Math.round((Number(message.id) - newestLoaded) / 1048576) : 0
      diagIsActiveChat = s.activeChatId === chatId
      return {
        ...s,
        messages: { ...s.messages, [chatId]: nextMsgs },
        chats: s.chats.map(c => c.id === chatId
          ? {
              ...c,
              lastMessage: preview, lastMessageSenderName: lastSenderLabel(c.type, message.senderName, message.isOutgoing), // v1.2.133: единое правило (файл разгружен TODO-14 → импорт есть, зеркало убрано)
              lastMessageTs: message.timestamp,
              // v0.95.26 ФИКС: НЕ обнуляем локально для активного чата (это нарушало
              // правило v0.87.41 «уменьшение ТОЛЬКО через tg:chat-unread-sync»).
              // Раньше: `s.activeChatId === chatId ? 0 : ...` — при активном чате
              // badge мгновенно становился 0, даже если юзер в середине истории
              // (не дочитал) → визуальный прыжок 48 → 0 + рассинхрон с сервером.
              // Эталоны: Telegram Web K (`++dialog.unread_count` всегда), Telegram
              // Desktop (atBottom guard). Decrement приходит ТОЛЬКО от server через
              // `tg:chat-unread-sync` (обработчик ниже). См. mistakes/native-scroll-unread.md.
              unreadCount: (c.unreadCount || 0) + (message.isOutgoing ? 0 : 1),
            }
          : c)
      }
    })
    // v0.95.19: ВНЕ setState логируем результат — для setState callback логи запрещены
    // (могут вызваться 2+ раза в StrictMode). После setState вызывается ровно один раз.
    try {
      logNativeScroll('tg-new-message', {
        chatId,
        msgId: String(message.id),
        action: diagAction,                  // 'inserted' | 'updated' | 'skipped-non-contiguous'
        existing: diagExisting,              // сколько уже было в state.messages[chatId]
        newestLoaded: diagNewestLoaded,      // id последнего сообщения в DOM
        gapMessages: diagGapMessages,        // ~оценка gap в сообщениях (TDLib id << 20)
        isContiguous: diagIsContiguous,      // прошло gap-limit или нет
        isDup: diagIsDup,
        isActiveChat: diagIsActiveChat,      // открыт ли сейчас этот чат у юзера
        isOutgoing: !!message.isOutgoing,
        mediaType: message.mediaType || 'text',
        ts: message.timestamp,
        // v0.95.27: textPreview — для диагностики «дубля сообщений». Юзер видит 2
        // одинаковых исходящих, но в логе только 1 send-start. Если приходит 2
        // tg-new-message с РАЗНЫМИ id но ОДИНАКОВЫМ текстом — это сигнал что
        // TDLib эмитит updateNewMessage дважды (provisional + final id).
        // См. mistakes/native-scroll-unread.md.
        textPreview: (message.text || '').slice(0, 40),
        replyToId: message.replyToId || null,
      })
    } catch (_) {}
    // v0.87.14: Toast через MessengerRibbon (только входящие, не для активного чата)
    if (!message.isOutgoing && stateRef.current.activeChatId !== chatId) {
      const chat = stateRef.current.chats.find(c => c.id === chatId)
      // v0.96.0 (Phase 0 M0.4): NotificationSource — паспорт сообщения.
      // Создаётся ОДИН раз здесь, несётся через ВСЕ слои без потерь.
      // См. .memory-bank/ai-agent-plan/architecture.md (Уровень 1).
      //
      // chatId имеет формат 'accountId:rawId' (например 'tg_611696632:-1001229486988').
      let source = null
      try {
        const colonIdx = String(chatId).indexOf(':')
        const accountId = colonIdx > 0 ? String(chatId).slice(0, colonIdx) : ''
        const rawChatId = colonIdx > 0 ? String(chatId).slice(colonIdx + 1) : String(chatId)
        if (accountId && rawChatId && message?.id != null) {
          source = createNotificationSource({
            messengerId: 'native_cc',
            accountId,
            chatId: rawChatId,
            messageId: String(message.id),
            threadId: message.threadId || null,
            senderId: message.senderId || null,
            senderName: message.senderName || chat?.title || '',
            chatTitle: chat?.title || '',
            timestamp: message.timestamp || Date.now(),
            textPreview: preview || '',
            mediaType: message.mediaType || null,
            isOutgoing: false,
          })
        }
      } catch (_) { source = null }
      // v1.2.12: фикс muted-уведомлений (per-chat мьют через 🔕 в Telegram).
      // chat.isMuted приходит из tdlibMapper (notification_settings.mute_for).
      // UI рисует 🔕 по тому же полю — поведение синхронизировано с тем что видит юзер.
      // Счётчик unread / превью / source — остаются нетронутыми (как в Telegram Desktop).
      // НЕ закрывает глобальный мьют скоупа (use_default_mute_for=true) — отдельная задача.
      if (chat?.isMuted) {
        // Уровень TRACE — пишется только при включенной диагностике, не спамит при
        // потоке muted-сообщений из активных каналов. См. CLAUDE.md «Логи».
        try {
          window.api?.send?.('app:log', {
            level: 'TRACE',
            message: '[native-notif] skip muted chatId=' + chatId + ' sender=' + (message.senderName || chat?.title || '?'),
          })
        } catch (_) {}
      } else {
        // v1.2.12: emit-лог №1 — пара к [notif-ipc] recv в mainIpcHandlers.js.
        try { window.api?.send?.('app:log', { level: 'INFO', message: '[native-notif] emit chatId=' + chatId + ' sender=' + String(message.senderName || chat?.title || '?').slice(0, 30) + ' bodyLen=' + (preview || '').length }) } catch (_) {}
        try {
          // v1.2.14: НЕ ДОБАВЛЯТЬ dismissMs hardcoded в payload!
          // notificationManager.showCustomNotification (main) автоматически читает
          // settings.notifDismissSec — единое поведение для WebView и Native.
          // Если хочешь подкрутить время показа — это per-user настройка в Settings,
          // а не hardcoded в коде. См. mistakes/notifications-ribbon.md «hardcoded dismissMs».
          const notifAlbum = buildNotifAlbum(message, chatId)
          window.api?.invoke('app:custom-notify', {
            title: message.senderName || chat?.title || 'Telegram', // v1.2.132: имя АВТОРА (в группе — не название группы); тест — nativeStoreMutedNotify.vitest.jsx (title toBe Alice/Двач)
            body: preview || '[медиа]',
            fullBody: preview || '[медиа]',
            iconUrl: '',
            // v1.2.75 cc-media аватар; v1.2.77 fallback pendingChatAvatar (свежий до rAF-flush). onerror→эмодзи. См. features.md.
            iconDataUrl: chat?.avatar || pendingChatAvatar.get(chatId) || '',
            color: '#2AABEE',
            // v1.2.155: цвет-метка аккаунта → левая грань карточки уведомления.
            // Только при ≥2 аккаунтах (как полоска в списке); иначе пусто → грань останется
            // фирменной синей (data.color). Битый/пустой цвет безопасно откатывается в окне.
            accountColor: (chat?.accountId && (stateRef.current.accounts || []).length >= 2)
              ? getAccountColor(stateRef.current.accountColors, chat.accountId)
              : '',
            emoji: '✈️',
            messengerName: 'Telegram',
            accountName: ((stateRef.current.accounts || []).find(a => a.id === chat?.accountId)?.name) || '', // v1.2.83 имя аккаунта (|| [] — chat/accounts могут быть undefined при race)
            messengerId: 'native_cc',
            senderName: message.senderName || chat?.title || '',
            // v0.96.0: основной формат — полный source паспорт
            source,
            // v0.95.46 legacy: chatTag/messageId оставлены для backward compat
            // (App.jsx cross-tab handler читает source ИЛИ chatTag в зависимости от формата)
            chatTag: chatId,
            messageId: message?.id != null ? String(message.id) : null,
            // v1.2.66/95: карточка-«альбом» — media-group ИЛИ одиночное фото/видео. См. notifAlbum.js.
            album: notifAlbum,
          })
          // v1.2.74/95: фоновая догрузка чёткого превью (альбом ИЛИ одиночное фото/видео).
          if (notifAlbum) preloadAlbumThumb(message, chatId, notifAlbum.id)
        } catch(_) {}
      }
    }
  })

  // v0.87.11: аватарки чатов приходят асинхронно — обновляем chat.avatar
  // v0.91.22: rAF-батчинг — Проблема 3. Лог 12:40:09 показал 300+ chat-avatar events
  // за 1.5с при старте → 300 рендеров. Map<chatId,avatarPath> + один setState на rAF.
  let pendingChatAvatar = new Map()
  let chatAvatarRafScheduled = false
  function flushPendingChatAvatar() {
    chatAvatarRafScheduled = false
    if (pendingChatAvatar.size === 0) return
    const updates = pendingChatAvatar; pendingChatAvatar = new Map()
    setState(s => {
      let changed = false
      const nextChats = s.chats.map(c => {
        if (!updates.has(c.id)) return c
        changed = true
        return { ...c, avatar: updates.get(c.id) }
      })
      return changed ? { ...s, chats: nextChats } : s
    })
  }
  addHandler('tg:chat-avatar', ({ chatId, avatarPath }) => {
    if (!chatId) return
    pendingChatAvatar.set(chatId, avatarPath)
    if (!chatAvatarRafScheduled) {
      chatAvatarRafScheduled = true
      requestAnimationFrame(flushPendingChatAvatar)
    }
  })

  // v0.87.111 → v0.89.4: аватарки отправителей групп.
  // Раньше payload был `{chatId, senderId, avatarUrl}` — но backend не знает в каком
  // чате этот юзер (TDLib шлёт `updateUser` без привязки к chat). Теперь UI
  // итерирует ВСЕ message-массивы и обновляет matching senderId.
  // v0.91.22: rAF-батчинг — Проблема 3. При старте TDLib эмитит десятки updateUser
  // подряд (~80 в логе 12:40:09). Каждый handler итерировал по ВСЕМ messages всех чатов
  // → 80×O(messages_total) = sluggish. Map<senderId,avatarUrl> + одна итерация на rAF.
  let pendingSenderAvatar = new Map()
  let senderAvatarRafScheduled = false
  function flushPendingSenderAvatar() {
    senderAvatarRafScheduled = false
    if (pendingSenderAvatar.size === 0) return
    const updates = pendingSenderAvatar; pendingSenderAvatar = new Map()
    setState(s => {
      const newMessages = {}
      let anyChanged = false
      for (const [chatId, msgs] of Object.entries(s.messages)) {
        let changed = false
        const updated = msgs.map(m => {
          const avatarUrl = updates.get(m.senderId)
          if (avatarUrl && !m.senderAvatar) {
            changed = true
            return { ...m, senderAvatar: avatarUrl }
          }
          return m
        })
        newMessages[chatId] = changed ? updated : msgs
        if (changed) anyChanged = true
      }
      return anyChanged ? { ...s, messages: newMessages } : s
    })
  }
  addHandler('tg:sender-avatar', ({ senderId, avatarUrl }) => {
    if (!senderId || !avatarUrl) return
    pendingSenderAvatar.set(senderId, avatarUrl)
    if (!senderAvatarRafScheduled) {
      senderAvatarRafScheduled = true
      requestAnimationFrame(flushPendingSenderAvatar)
    }
  })

  // v1.2.12: tg:typing handler вынесен в nativeStoreSendIpc.js (см. attachSendIpcHandlers ниже).

  // v0.87.22: точная синхронизация unread с серверным значением Telegram
  // v0.87.51: удалён clamp groupedUnread — поле groupedUnread больше не используется,
  // UI показывает сырой unreadCount от Telegram API.
  addHandler('tg:chat-unread-sync', ({ chatId, unreadCount, lastReadInboxId }) => {
    logNativeScroll('store-unread-sync', { chatId, unread: unreadCount, active: stateRef.current.activeChatId === chatId })
    setState(s => ({
      ...s,
      chats: s.chats.map(c => c.id === chatId ? { ...c, unreadCount } : c),
      messageWindows: s.messageWindows?.[chatId]
        ? {
            ...s.messageWindows,
            [chatId]: {
              ...s.messageWindows[chatId],
              unreadCount: Number(unreadCount || 0),
              unreadWindowComplete: !s.messageWindows[chatId].unreadWindowRequested
                || Number(s.messageWindows[chatId].loadedIncoming || 0) >= Number(unreadCount || 0),
              updatedAt: Date.now(),
            },
          }
        : s.messageWindows,
    }))
    // v1.2.137: чат прочитан на сервере (например на телефоне) → просим main снять карточки
    // ЭТОГО чата, чьи сообщения уже прочитаны (id <= last_read). Покрывает и частичное чтение
    // (прочитал середину). Решение «какие снять» — в main по lastReadInboxId (см. notifDismissDecision).
    try { if (lastReadInboxId) window.api?.send?.('notif:dismiss-chat', { chatId, lastReadInboxId }) } catch (_) {}
  })

  // v0.87.24: bulk sync — rescan всех активных чатов (Комбо D)
  addHandler('tg:unread-bulk-sync', ({ updates }) => {
    const map = new Map(updates.map(u => [u.id, u.unreadCount]))
    const activeId = stateRef.current.activeChatId
    if (activeId && map.has(activeId)) logNativeScroll('store-unread-bulk-active', { chatId: activeId, unread: map.get(activeId), updates: updates.length })
    setState(s => ({
      ...s,
      chats: s.chats.map(c => map.has(c.id) ? { ...c, unreadCount: map.get(c.id) } : c),
      messageWindows: Object.fromEntries(Object.entries(s.messageWindows || {}).map(([key, window]) => {
        if (!map.has(key)) return [key, window]
        const unreadCount = Number(map.get(key) || 0)
        return [key, {
          ...window,
          unreadCount,
          unreadWindowComplete: !window.unreadWindowRequested
            || Number(window.loadedIncoming || 0) >= unreadCount,
          updatedAt: Date.now(),
        }]
      })),
    }))
  })

  // v1.2.12: tg:send-succeeded и tg:upload-progress handler'ы вынесены
  // в nativeStoreSendIpc.js (см. attachSendIpcHandlers ниже).

  addHandler('tg:read', ({ chatId, outgoing, stillUnread, maxId }) => {
    if (outgoing) {
      // v0.87.17: собеседник прочитал наши сообщения до maxId → ставим isRead=true
      setState(s => ({
        ...s,
        messages: {
          ...s.messages,
          [chatId]: (s.messages[chatId] || []).map(m =>
            m.isOutgoing && Number(m.id) <= maxId ? { ...m, isRead: true } : m
          )
        }
      }))
      return
    }
    logNativeScroll('store-read', { chatId, stillUnread: stillUnread || 0, maxId })
    setState(s => ({
      ...s,
      chats: s.chats.map(c => c.id === chatId ? { ...c, unreadCount: stillUnread || 0 } : c)
    }))
  })

  return () => { for (const u of unsubs) try { u() } catch(_) {} }
}
