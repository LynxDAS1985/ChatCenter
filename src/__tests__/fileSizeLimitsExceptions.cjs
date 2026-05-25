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
    ceiling: 800,
    reason: 'v0.88.x: Корневой компонент с providers, top-level state, routing между native/webview режимами. Разбиение требует архитектурного рефакторинга.'
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
    ceiling: 1050,
    reason: 'v0.89.40: расширили IndexedDB cache на обычные чаты + loadOlder/Newer + TTL cleanup (~30 строк). Доменное разбиение store — отдельный плановый шаг (handoff-code-limits.md).'
  },
  // v0.88.x: профильные тесты v0.88.x вынесены в nativeStoreUnreadPrefetch.vitest.jsx (218 строк).
  // Здесь остались регрессионные тесты markRead Telegram-style, forum topics refresh, unread windows,
  // bulk-sync — разбивать дальше нет смысла, они одного домена (read/unread state).
  'src/native/store/nativeStore.vitest.jsx': {
    ceiling: 500,
    reason: 'v0.89.37: добавлен race protection тест для selectForumTopic (+48 строк). Тесты по доменам read/unread + load + race — единый домен. Дальнейшее разбиение — отдельный плановый шаг.'
  },
  // v0.89.25 (ловушка #24 forum is_forum): добавлены supergroupCache + updateSupergroup handler + getSupergroup
  // метод (~15 строк). Файл уже был на 499 при стандартном лимите 500. Минимальное превышение, разбивать
  // tdlibBackend (auth/chats/messages/media/forum в одном модуле) — отдельная архитектурная задача.
  'main/native/backends/tdlibBackend.js': {
    ceiling: 550,
    reason: 'v0.89.25: один backend для auth/chats/messages/media/forum/storage. Разбивать требует extract по доменам (отдельная плановая задача).'
  },
  'main/native/backends/tdlibClient.js': {
    ceiling: 550,
    reason: 'v0.89.25: TdlibClientManager — единый клиент для accounts/auth/updates routing/caches (user/chat/supergroup/avatars). Разбивать требует архитектурного решения.'
  },
  // v0.89.33: snapshot readInboxMaxId для divider «Новые сообщения» (Telegram Desktop UX-стандарт)
  // добавил frozenReadCursorRef + сброс по viewKey + фиксация на ненулевом cursor (~15 строк к 596).
  // InboxMode — единый компонент режима inbox с интеграцией всех hooks (scroll/read/typing/forum).
  // Доменное разбиение InboxMode — отдельная плановая задача после стабилизации форум-топиков.
  'src/native/modes/InboxMode.jsx': {
    ceiling: 660,
    reason: 'v0.89.33: snapshot ref для divider (~15 строк). v0.91.17: useScrollPositionAutosave hook integration. InboxMode интегрирует все hooks режима inbox.'
  }
}
