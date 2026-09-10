// v0.89.34: вынесено из fileSizeLimits.test.cjs (был 345 строк, лимит 400).
// Per-file исключения с индивидуальным ceiling. Каждое — с обоснованием.

module.exports = {
  // v0.87.85: telegramHandler.js разбит на 6 модулей (Шаг 7/7) — теперь под стандартным
  // лимитом 500 для main/native/*.js. Исключение удалено.
  // v0.87.83: InboxMode.jsx разбит на 4 файла (useReadByVisibility, useInboxScroll,
  // InboxMessageInput, InboxChatListSidebar) — теперь 566 строк, под стандартным лимитом 600.
  // Исключение удалено.
  'src/utils/webviewSetup.js': {
    ceiling: 605,
    reason: 'v0.88.x: createWebviewSetup — фабрика с closures (deps→handlers), references shared state. handleNewMessage уже вынесен в webviewHandleNewMessage.js (170 строк) в v0.87.97. Дальнейшее разбиение требует архитектурного рефакторинга (closures → классы или модули) — отдельный шаг. v1.2.374: 600→605 (исключение Ozon из обнуления счётчика по заголовку). ВРЕМЕННО — разбить при рефакторинге.'
  },
  // v0.88.x: App.jsx — корневой компонент с providers, top-level state, routing.
  // Разбиение требует архитектурного решения (вынос layout/providers в отдельные компоненты)
  // — отдельный плановый шаг рефактора. Пока exception с обоснованием.
  'src/App.jsx': {
    ceiling: 1075,
    reason: 'v1.0.1: 3 Phase 4 модалки (TasksPanel/RemindersPanel/AIActivityDashboard) подключены через PanelModal обёртку + state + handleGoToSource + useAppCounters + props в TabBar (~50 строк). v0.95.25: WhatsNewModal. v0.88.x: Корневой компонент с providers, top-level state, routing между native/webview режимами. Разбиение требует архитектурного рефакторинга. v1.2.244: 960→975 (Этап 1 боковой рейл — вставка <SourceRail> за флагом, ~7 строк). v1.2.251: 975→990 (Этап 2C — состояние nativeAccounts + ref + проводка аккаунтов в NativeApp/SourceRail). v1.2.263: 995→1005 (проводка возврата к API: onActivateNative-колбэк + логи переходов веб↔API + сдвиг веб-слоя на 34px). v1.2.264: 1005→1015 (onAddWeb принимает выбранный мессенджер из окна «Добавить» → сборка новой вкладки). v1.2.271: 1015→1020 (меню правого клика вынесено из TabBar → рендерится на уровне App, чтобы пережить будущее удаление вкладок; при удалении TabBar App резко похудеет и потолок вернём вниз). v1.2.275: 1020→1025 (хук useWebAccountAvatars). v1.2.343: 1025→1030 (виджет Ozon). v1.2.348: 1030→1035 (виджет-док: данные unread/loading в монтаж, +2 строки). v1.2.349: 1035→1037 (счётчики Ozon: состояние ozonCounts + проброс setOzonCounts + проп виджета). v1.2.358: 1037→1055 (Шаг 3: скрытая фоновая webview «Вопросы» Ozon + маршрутизатор). v1.2.359: 1055→1070 (эффект: единый источник суммы Ozon в рейл из ozonCounts). v1.2.362: 1070→1075 (проброс notify в фоновую страницу «Вопросы»). ВРЕМЕННО: при удалении верхних вкладок (финал миграции side-rail) TabBar со ~30 пропсами уйдёт из App.jsx → потолок вернём вниз. План: .memory-bank/side-rail-migration-plan.md'
  },
  'src/utils/messengerConfigs.js': {
    ceiling: 400,
    reason: 'Конфиги всех мессенджеров в одном файле. Специально держим вместе.'
  },
  'src/utils/consoleMessageHandler.js': {
    ceiling: 462,
    reason: 'Большой парсер console-message. Логически цельный. v1.2.355-356: маршрут __CC_OZON_COUNT__. v1.2.426: enrichWaitMs — МАКС ждёт enriched дольше (антидубль карточек).'
  },
  // v0.87.78: notification разбит на html/css/js. JS превышает default 300.
  // v1.2.12: createPinBtn вынесена 700→686, потом calcHeight/pauseItem/resumeItem/
  // forceFinalSlideInState вынесены 686→644 (запас 56 строк). Дальнейшее разбиение
  // (dismissItem/stackMessageIntoHost/cleanupStack) требует параметризации — замыкают
  // локальный state (items/stacks/container/window.notifApi).
  'main/notification.js': {
    ceiling: 730,
    reason: 'v1.2.66: «живая карточка» альбома (media group) — albumHosts Map + ветка группировки по album.id + albumState + очистка в dismiss/forceRemove (~35 строк). Тяжёлые функции (extendHostLife, addAlbumTileToHost, renderAlbumGrid) вынесены в notification-helpers.js. v1.2.12: createPinBtn/calcHeight/pauseItem/resumeItem/forceFinalSlideInState тоже вынесены туда. Дальнейшее разбиение dismissItem/stackMessageIntoHost требует параметризации (замыкают items/stacks/albumHosts/container).'
  },
  // v0.87.97: pin-dock разбит на html/css/js. JS превышает default 300.
  'main/pin-dock.js': {
    ceiling: 600,
    reason: 'Renderer-код для pin-dock BrowserWindow. Извлечён из inline <script>. Логически цельный (DOM render + drag + IPC).'
  },
  // v0.88.0..v0.88.2: nativeStore содержит state + actions для всего native Telegram режима:
  // login flow, чаты, сообщения, форум-темы с markTopicRead retry loop, unread-window helpers,
  // loadMessages/loadOlderMessages/loadNewerMessages. Разбиение по доменам — отдельная
  // плановая задача после Этапа 2 (виртуализация). До этой работы файл уже был 764 строки.
  'src/native/store/nativeStore.js': {
    ceiling: 1340,
    reason: 'v0.95.48: markPendingScrollLoadAttempted action + loadAttempted флаг в pendingScrollToMessage (~15 строк) — защита от петли при jump-to-message из notification (target вне окна → 2-я попытка fail → toast). v0.95.46: requestScrollToMessage + clearPendingScrollToMessage actions. v0.95.43: sendAlbum action. v0.95.41: resolveCustomEmojis. v0.95.29: setReaction. v0.89.40: IndexedDB cache. Доменное разбиение store — плановый шаг.'
  },
  'main/native/backends/tdlibBackend.js': {
    ceiling: 930,
    reason: 'v1.0.6: расширение messages.search — filter (мапа в TDLib searchMessagesFilter*), fromMessageId (пагинация через next_from_message_id), fanOut (parallel search по всем аккаунтам) (~80 строк). v1.0.2: messages.search базовый. v0.95.41: customEmoji.resolve. v0.95.29: setReaction.'
  },
  'main/native/backends/tdlibClient.js': {
    ceiling: 650,
    reason: 'v0.95.38: case updateMessageSendSucceeded + updateMessageSendFailed (~40 строк) — фикс дубля сообщений через emit message:send-succeeded. ОБЯЗАТЕЛЬНО прочитать mistakes/outgoing-two-cases.md перед правкой. v0.95.29: user объект в getAccountChats. v0.89.25: TdlibClientManager — единый клиент.'
  },
  // v0.88.x: профильные тесты v0.88.x вынесены в nativeStoreUnreadPrefetch.vitest.jsx (218 строк).
  // Здесь остались регрессионные тесты markRead Telegram-style, forum topics refresh, unread windows,
  // bulk-sync — разбивать дальше нет смысла, они одного домена (read/unread state).
  'src/native/store/nativeStore.vitest.jsx': {
    ceiling: 700,
    reason: 'v0.95.16: +1 тест для loadTopicMessagesUntil. v0.95.15: +1 тест для loadMessagesUntil. v0.95.14: context-window. v0.95.12: jump-to-end. v0.89.37: race protection.'
  },
  // v0.89.25 (ловушка #24 forum is_forum): добавлены supergroupCache + updateSupergroup handler + getSupergroup
  // метод (~15 строк). Файл уже был на 499 при стандартном лимите 500. Минимальное превышение, разбивать
  // tdlibBackend (auth/chats/messages/media/forum в одном модуле) — отдельная архитектурная задача.
  // tdlibBackend.js exception перенесён выше (см. v0.95.29 запись)
  'src/__tests__/tdlibBackend.vitest.js': {
    ceiling: 670,
    reason: 'v1.0.6: +7 тестов на messages.search filter/pagination/fanOut (~100 строк). v1.0.2: +6 тестов базового search. v0.95.16: +4 теста getIterativeUntilTopic. v0.95.15: +5 тестов getIterativeUntil. Разбивать по доменам — плановый шаг.'
  },
  'src/__tests__/tdlibEmitContracts.vitest.js': {
    ceiling: 500,
    reason: 'v0.95.44: +3 теста tg:upload-progress (updateFile bridge с throttle). v0.95.38: +2 теста tg:send-succeeded bridge. Один файл — emit-direction IPC контракт-тесты для всех manager events.'
  },
  // v1.1.1: +5 тестов autoConfirm + actor + auto_confirmed audit pometka.
  'main/ai/aiToolExecutor.vitest.js': {
    ceiling: 800,
    reason: 'v1.1.1: +5 тестов autoConfirm (ai_auto actor bypass для confirm-required tools; HARDCODED_DENY всё равно блокирует). v1.0.4: +13 тестов AbortSignal/confirmTimeout/readRetry/runWithTimeout. Один executor — один test-файл. Разбивать — плановый шаг после Phase 4.4.'
  },
  // v1.1.1: + autoConfirm + actor параметры (~25 строк к executor).
  'main/ai/aiToolExecutor.js': {
    ceiling: 350,
    reason: 'v1.1.1: + autoConfirm + actor параметры для auto-reply integration (~25 строк). v1.0.4: + signal/confirmTimeoutMs/readRetryCount + runWithTimeout helper. Логически цельный agent loop — разбиение требует архитектурного шага.'
  },
  // v1.1.3: + smart cooldown (markUserReplied + _userRepliedAt Map) + audit writeAudit
  'main/ai/autoReplyDispatcher.js': {
    ceiling: 500,
    reason: 'v1.2.3: +dispatchAiReplyViaBridge (~95 строк) — отдельная ветка для rule.action.useBridge через AI Bridge. v1.1.3: + smart cooldown (markUserReplied + _userRepliedAt). v1.1.2: + writeAudit helper. v1.1.1: + processNewMessage с 3 уровнями защиты, mark_read/ai_reply ветки. Логически цельный диспетчер — разбиение по уровням защиты возможно отдельно (v1.3+).'
  },
  'main/ai/autoReplyDispatcher.vitest.js': {
    ceiling: 650,
    reason: 'v1.2.3: +10 тестов Bridge ветки (useBridge=true, payload, chain, ok/sendMessage failed, audit, useBridge=false → runAgent). v1.1.3: +5 тестов smart cooldown. v1.1.2: +7 тестов master switch + audit. v1.1.1: 24 базовых теста. Один dispatcher — один test-файл.'
  },
  // tdlibClient.js exception перенесён выше (см. v0.95.29 запись)
  // v0.89.33: snapshot readInboxMaxId для divider «Новые сообщения» (Telegram Desktop UX-стандарт)
  // добавил frozenReadCursorRef + сброс по viewKey + фиксация на ненулевом cursor (~15 строк к 596).
  // InboxMode — единый компонент режима inbox с интеграцией всех hooks (scroll/read/typing/forum).
  // Доменное разбиение InboxMode — отдельная плановая задача после стабилизации форум-топиков.
  'src/native/modes/InboxMode.jsx': {
    ceiling: 1122,
    reason: 'v1.2.401: заставка первой загрузки перенесена в InboxMode (на ВСЮ область, не в панели списка) — импорт + рендер overlay (~6 строк). v1.2.393-394: заставка первой загрузки списка чатов — флаг chatsFirstLoadDone, эффект удержания заставки до резолва loadChats со страховкой 15с (+WARN-лог), проброс chatsLoading/chatsLoadDone в сайдбар (~10 строк). v0.95.48: loadMessages aroundId+addOffset=-49 для jump-to-message из notification (target вне окна) — паттерн tdesktop HistoryWidget::showAtMsgId + tweb setInnerPeer (~25 строк). v0.95.47: диагностические логи pending-scroll-effect + scroll-to-message (временные). v0.95.46: useEffect для pendingScrollToMessage. v0.95.43: useFileAttach + handleAttachSend. v0.95.42: search persistence. v0.95.40: useStickyBottomOnMedia. Доменное разбиение — отдельная задача.'
  },
  // v0.92.0: useInboxScroll вернулся в стандартный лимит 150 после удаления
  // isRestoringRef guards. Текущий размер 139.
  // v0.92.2: добавлен throttled getState save для pixel-perfect restoration (~30 строк).
  'src/native/hooks/useInboxScroll.js': {
    ceiling: 200,
    reason: 'v0.92.2: throttled virtualListRef.getState((state) => map.set(viewKey, state)) save для Virtuoso pixel-perfect restore через StateSnapshot (~30 строк). См. .memory-bank/virtuoso-migration-plan.md.'
  },
  // v0.92.0: useInitialScroll — корневой хук восстановления позиции (saved scrollTop,
  // firstUnread auto-jump, anchor msgId, retry-loop для chatReady deadlock). История
  // версий v0.87.29 → v0.91.22 (8 итераций) — каждая добавляла комментарии-предупреждения
  // о ловушках. CLAUDE.md запрещает резать комментарии при превышении лимита. Разбиение
  // на под-хуки (3-4 файла useInitialScrollAnchor/Bottom/FirstUnread) — отдельная задача
  // после стабилизации v0.91.22 фикса (нужны логи юзера что closed-loop ушёл).
  'src/native/hooks/useInitialScroll.js': {
    ceiling: 170,
    reason: 'v0.95.4: useEffect→useLayoutEffect (фикс «дёрг при повторном открытии seen-чата») + 7 строк комментария-предупреждения «КРИТИЧНО: только micro-операция scrollTop=N внутри, не добавлять fetch/тяжёлую работу — иначе useLayoutEffect блокирует paint (React docs)». v0.92.0 history: исторический корневой хук восстановления позиции (saved scrollTop / firstUnread / atBottom). CLAUDE.md запрещает резать комментарии. Доменное разбиение — отдельная плановая задача.'
  },
  // v0.91.22: rAF-батчинг для 3-х тяжёлых IPC handlers (tg:chat-last-message,
  // tg:sender-avatar, tg:chat-avatar) добавил ~60 строк. Корень — Проблема 3 Maximum
  // update depth: при старте TDLib эмитит сотни updateChat* за 1.5с (лог 12:40:09:
  // 300+ chat-avatar, 280+ chat-last-message, 80+ sender-avatar). React 18+ automatic
  // batching работает только в пределах одного macrotask, IPC events — разные task'и
  // → каждый = отдельный render → переполнение update budget. rAF собирает все
  // события одного кадра в один setState. Доменное разбиение IPC handlers — отдельная
  // плановая задача (handoff-code-limits.md).
  'src/native/store/nativeStoreIpc.js': {
    ceiling: 660,
    reason: 'v1.2.66: метка album в payload app:custom-notify (media group → «живая карточка» в окне уведомления, компактной строкой ~654/660). v1.2.12: handlers статуса отправки вынесены в nativeStoreSendIpc.js. v0.95.47: лог notify-emit. v0.95.46: messageId в payload. Доменное разбиение остальных IPC handlers — плановый шаг.'
  },
  'src/native/store/nativeStore.vitest.jsx': {
    ceiling: 970,
    reason: 'v0.95.48: +4 теста для pendingScrollToMessage/markPendingScrollLoadAttempted/clearPendingScrollToMessage (~50 строк) — защита jump-to-message паттерна tdesktop/tweb. v0.95.38: +5 регресс-тестов tg:send-succeeded handler + tg:new-message dedup. См. mistakes/outgoing-two-cases.md. v0.95.26: +4 теста на 47-дневный баг unreadCount.'
  },
  // v0.95.50: changelog копит entries для модалки «Что нового», ~15 строк за minor релиз.
  // Архивация старых — отдельная задача.
  // v1.2.2: AI Agent через Bridge — добавлена ветка useBridge (40+ строк logic).
  // runViaBridge уже вынесен в utils/aiBridge/agentBridgeRunner.js (91 строка).
  // Дальнейшее разбиение — отдельная задача (вынести listeners в use-эффект-хуки).
  'src/hooks/useAIAgent.js': {
    ceiling: 200,
    reason: 'v1.2.2: добавлена Bridge-ветка (useBridge=true). runViaBridge уже вынесен в agentBridgeRunner.js. Сам hook: state + 2 streaming listeners + start + cancel + confirmStep + cancelStep + reset — целостный узел, дальнейшее разбиение требует архитектурного шага.'
  },
  'shared/changelogData.js': {
    ceiling: 900,
    reason: 'v1.2.4: 47 entries — за сессию 11.06 добавилось 17 записей AI Bridge (v1.1.7 → v1.2.4). Лимит 700 → 900 с запасом. v1.2.433: файл упёрся в 901 → старые записи вынесены в changelogDataArchive.js (данные НЕ удалены, подставляются через ...CHANGELOG_ARCHIVE), файл стал 537. v1.2.442: файл ПЕРЕЕХАЛ в shared/ — это чистые ДАННЫЕ (текст «Что нового»), которые растут с каждой версией; в бюджете renderer им не место.'
  },
  'shared/changelogDataArchive.js': {
    ceiling: 400,
    reason: 'v1.2.433: чистый файл-ДАННЫХ — архив старых записей changelog, вынесен из changelogData.js (тот перерос 900). Логики нет, только массив записей; разбивать смысла нет, как и у самого changelogData (там потолок 900). Удалять записи НЕЛЬЗЯ — changelogData.vitest.js проверяет наличие старых версий (0.95.20-25).'
  }
}
