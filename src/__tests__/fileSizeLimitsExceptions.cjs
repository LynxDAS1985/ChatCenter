// v0.89.34: вынесено из fileSizeLimits.test.cjs (был 345 строк, лимит 400).
// Per-file исключения с индивидуальным ceiling. Каждое — с обоснованием.

module.exports = {
  // v0.87.85: telegramHandler.js разбит на 6 модулей (Шаг 7/7) — теперь под стандартным
  // лимитом 500 для main/native/*.js. Исключение удалено.
  // v0.87.83: InboxMode.jsx разбит на 4 файла (useReadByVisibility, useInboxScroll,
  // InboxMessageInput, InboxChatListSidebar) — теперь 566 строк, под стандартным лимитом 600.
  // Исключение удалено.
  'src/utils/webviewSetup.js': {
    ceiling: 600,
    reason: 'v0.88.x: createWebviewSetup — фабрика с closures (deps→handlers), references shared state. handleNewMessage уже вынесен в webviewHandleNewMessage.js (170 строк) в v0.87.97. Дальнейшее разбиение требует архитектурного рефакторинга (closures → классы или модули) — отдельный шаг.'
  },
  // v0.88.x: App.jsx — корневой компонент с providers, top-level state, routing.
  // Разбиение требует архитектурного решения (вынос layout/providers в отдельные компоненты)
  // — отдельный плановый шаг рефактора. Пока exception с обоснованием.
  'src/App.jsx': {
    ceiling: 850,
    reason: 'v0.95.25: добавлен WhatsNewModal (lazy import + state + useEffect версии + JSX rendering — ~30 строк). v0.88.x: Корневой компонент с providers, top-level state, routing между native/webview режимами. Разбиение требует архитектурного рефакторинга.'
  },
  'src/utils/messengerConfigs.js': {
    ceiling: 400,
    reason: 'Конфиги всех мессенджеров в одном файле. Специально держим вместе.'
  },
  'src/utils/consoleMessageHandler.js': {
    ceiling: 450,
    reason: 'Большой парсер console-message. Логически цельный.'
  },
  // v0.87.78: notification разбит на html/css/js. JS превышает default 300.
  'main/notification.js': {
    ceiling: 700,
    reason: 'Renderer-код для notification BrowserWindow. Извлечён из inline <script>. Разбиение на 2 модуля — low priority, файл логически цельный (DOM render + animations + IPC).'
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
    ceiling: 1260,
    reason: 'v0.95.29: setReaction store method + расширенный dump outgoing в sendMessage (+15 строк). v0.95.27: лог store-send-message-invoke. v0.95.16: loadTopicMessagesUntil. v0.89.40: IndexedDB cache. Доменное разбиение store — плановый шаг.'
  },
  'main/native/backends/tdlibBackend.js': {
    ceiling: 740,
    reason: 'v0.95.29: setReaction method (+35 строк) — addMessageReaction/removeMessageReaction TDLib. v0.95.16: getIterativeUntilTopic. v0.95.15: getIterativeUntil. v0.89.25: один backend для auth/chats/messages/media/forum.'
  },
  'main/native/backends/tdlibClient.js': {
    ceiling: 570,
    reason: 'v0.95.29: user объект в getAccountChats для user.status (+5 строк). v0.89.25: TdlibClientManager — единый клиент.'
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
    ceiling: 480,
    reason: 'v0.95.16: +4 теста getIterativeUntilTopic (форум-топики). v0.95.15: +5 тестов getIterativeUntil. Один backend covered одним тест-файлом. Разбивать по доменам — плановый шаг.'
  },
  // tdlibClient.js exception перенесён выше (см. v0.95.29 запись)
  // v0.89.33: snapshot readInboxMaxId для divider «Новые сообщения» (Telegram Desktop UX-стандарт)
  // добавил frozenReadCursorRef + сброс по viewKey + фиксация на ненулевом cursor (~15 строк к 596).
  // InboxMode — единый компонент режима inbox с интеграцией всех hooks (scroll/read/typing/forum).
  // Доменное разбиение InboxMode — отдельная плановая задача после стабилизации форум-топиков.
  'src/native/modes/InboxMode.jsx': {
    ceiling: 900,
    reason: 'v0.95.30: добавлен ThemePickerModal state + JSX рендер модалки + loadTheme импорт + комментарии (~15 строк). v0.92.0-v0.92.5: Virtuoso initialTopMostItemIndex + firstItemIndex + handleStartReached/EndReached + tg:messages listener + isRestoringRef. v0.92.5: добавлен virtuosoRestoreState приоритет + useEffect state-restore-attempt diag + flush getState в cleanup (~30 строк). Доменное разбиение — отдельная задача.'
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
    ceiling: 620,
    reason: 'v0.95.26: добавлен подробный комментарий-предупреждение в tg:new-message handler про правило v0.87.41 — НЕ обнулять unreadCount локально (~10 строк, защита от регрессии 47-дневного бага). v0.91.22: rAF-батчинг для 3-х тяжёлых IPC handlers (~60 строк). Доменное разбиение IPC handlers (chats / messages / topics / metadata) — отдельный плановый шаг.'
  },
  'src/native/store/nativeStore.vitest.jsx': {
    ceiling: 800,
    reason: 'v0.95.26: +4 регресс-теста на tg:new-message handler — защита от 47-дневного бага «обнуление unreadCount для активного чата» (~85 строк). Все 4 теста критичны — отдельно проверяют активный/неактивный чат, outgoing, server sync.'
  }
}
