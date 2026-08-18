/**
 * Тесты App.jsx — структура, импорты, компоненты.
 *
 * Запуск: node src/__tests__/appStructure.test.js
 */

const fs = require('fs')
const path = require('path')
const code = fs.readFileSync('src/App.jsx', 'utf8')
// v0.82.6: WebView setup вынесен
const webviewCode = fs.existsSync('src/utils/webviewSetup.js') ? fs.readFileSync('src/utils/webviewSetup.js', 'utf8') : ''
// v0.87.97: handleNewMessage вынесен из webviewSetup.js в отдельный файл
const handleNewMessageCode = fs.existsSync('src/utils/webviewHandleNewMessage.js') ? fs.readFileSync('src/utils/webviewHandleNewMessage.js', 'utf8') : ''
// v0.84.3: Hooks and components extracted from App.jsx
const hooksDir = 'src/hooks'
const hooksCode = fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir).map(f => fs.readFileSync(path.join(hooksDir, f), 'utf8')).join('\n') : ''
const tabBarCode = fs.existsSync('src/components/TabBar.jsx') ? fs.readFileSync('src/components/TabBar.jsx', 'utf8') : ''
const diagnosticsHostCode = fs.existsSync('src/components/DiagnosticsSessionHost.jsx') ? fs.readFileSync('src/components/DiagnosticsSessionHost.jsx', 'utf8') : ''
// v1.2.260: NativeApp — для проверки портала боковой полосы.
const nativeAppCode = fs.existsSync('src/native/NativeApp.jsx') ? fs.readFileSync('src/native/NativeApp.jsx', 'utf8') : ''
const allAppCode = code + '\n' + webviewCode + '\n' + handleNewMessageCode + '\n' + hooksCode + '\n' + tabBarCode + '\n' + diagnosticsHostCode

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты App.jsx структуры\\n')

// ── Импорты модулей ──
console.log('── Импорты: ──')
test('React', () => assert(code.includes("from 'react'")))
test('messengerConfigs', () => assert(allAppCode.includes('messengerConfigs.js')))
test('consoleMessageParser', () => assert(allAppCode.includes('consoleMessageParser.js')))
test('devLog', () => assert(allAppCode.includes('devLog.js')))
test('messageProcessing', () => assert(allAppCode.includes('messageProcessing.js')))
test('sound', () => assert(allAppCode.includes('sound.js')))
test('navigateToChat', () => assert(allAppCode.includes('navigateToChat.js')))
test('MessengerTab', () => assert(allAppCode.includes('MessengerTab.jsx')))
test('NotifLogModal', () => assert(code.includes("import('./components/NotifLogModal.jsx')")))
test('SettingsPanel', () => assert(code.includes("import('./components/SettingsPanel.jsx')")))
test('AISidebar lazy import', () => assert(code.includes("import('./components/AISidebar.jsx')")))
test('NativeApp controlled lazy import (A1 startup split)', () => {
  assert(code.includes("import('./native/NativeApp.jsx')"), 'NativeApp should load by dynamic import')
  assert(!code.includes("from './native/NativeApp.jsx'"), 'NativeApp must not stay in App.jsx static import graph')
  assert(code.includes('<Suspense fallback={<NativeAppFallback />}>'), 'NativeApp should have an isolated Suspense fallback')
  assert(code.includes('lazy import requested') && code.includes('lazy import resolved'), 'NativeApp lazy import should be visible in startup logs')
})
test('LogModal lazy import', () => assert(code.includes("import('./components/LogModal.jsx')")))
test('DiagnosticsSessionHost lazy import', () => assert(code.includes("import('./components/DiagnosticsSessionHost.jsx')")))
test('ConfirmCloseModal lazy import', () => assert(code.includes("import('./components/ConfirmCloseModal.jsx')")))

// ── Нет дублирования (inline код удалён) ──
console.log('\\n── Нет дублирования: ──')
test('Нет inline MESSENGER_SOUNDS', () => assert(!code.includes('const MESSENGER_SOUNDS')))
test('Нет inline playNotificationSound function', () => {
  // Должен быть import, не function definition
  assert(!code.includes('function playNotificationSound'))
})
test('Нет inline buildChatNavigateScript function', () => {
  assert(!code.includes('function buildChatNavigateScript'))
  assert(!code.includes('function _DEAD_buildChatNavigateScript'))
})
test('Нет inline MessengerTab function', () => {
  assert(!code.includes('function MessengerTab('))
})
test('Нет мёртвых функций _DEAD_', () => assert(!code.includes('function _DEAD_')))
test('Нет if(false) блоков', () => assert(!code.includes('if (false)')))

// ── Ключевые функции ──
console.log('\\n── Ключевые функции: ──')
test('handleNewMessage определена', () => assert(code.includes('handleNewMessage')))
test('setWebviewRef определена', () => assert(code.includes('setWebviewRef')))
test('handleTabContextAction определена', () => assert(code.includes('handleTabContextAction')))
test('handleTabContextAction_diag определена', () => assert(code.includes('handleTabContextAction_diag')))
test('tabContextMenuDiag отключён из startup graph (A2.1)', () => {
  assert(!hooksCode.includes("from './tabContextMenuDiag.js'"), 'useTabContextMenu must not statically import tabContextMenuDiag')
  assert(!hooksCode.includes("import('./tabContextMenuDiag.js')"), 'manual diagnostics are disabled, not lazy-loaded')
  assert(hooksCode.includes('manual WebView diagnostics disabled'), 'disabled diagnostic status should be explicit')
})
test('traceNotif определена', () => assert(code.includes('traceNotif')))
test('Фоновая diagnostics session подключена', () => {
  assert(allAppCode.includes('useDiagnosticsSession'), 'DiagnosticsSessionHost должен подключать фоновую diagnostics session')
  assert(allAppCode.includes('<DiagnosticsFloatingPanel'), 'маленькая diagnostics panel должна быть в diagnostics host')
})
test('Diagnostics session не стартует сама при открытии модалки', () => {
  assert(!diagnosticsHostCode.includes('if (open) diagnostics.start()'), 'открытие окна не должно включать запись автоматически')
  assert(!diagnosticsHostCode.includes('diagnostics.start(); onOpen'), 'разворачивание маленькой панели не должно перезапускать запись')
  assert(diagnosticsHostCode.includes('onCloseAll={diagnostics.close}'), 'маленькая панель должна уметь закрыть диагностику полностью')
  assert(diagnosticsHostCode.includes('onStart={() => diagnostics.start(selectedTarget)}'), 'маленькая панель должна уметь снова запустить запись после стопа с выбранной целью')
  assert(!diagnosticsHostCode.includes('onToggleDeep'), 'глубокая WebView-проверка больше не должна быть ручным переключателем')
  assert(code.includes('runtimeContext={{') && diagnosticsHostCode.includes('buildDiagnosticsTargets'), 'diagnostics host должен получать runtimeContext и строить список целей диагностики')
})

// ── Использует модульные функции ──
console.log('\\n── Использует модульные функции: ──')
test('isSpamText() из конфига', () => assert(allAppCode.includes('isSpamText(')))
test('isDuplicateExact() из messageProcessing', () => assert(allAppCode.includes('isDuplicateExact(')))
test('isDuplicateSubstring() из messageProcessing', () => assert(allAppCode.includes('isDuplicateSubstring(')))
test('stripSenderFromText() из messageProcessing', () => assert(allAppCode.includes('stripSenderFromText(')))
test('isOwnMessage() из messageProcessing', () => assert(allAppCode.includes('isOwnMessage(')))
test('WebView setup в отдельном файле (v0.82.6)', () => assert(webviewCode.length > 100 && code.includes('createWebviewSetup'), 'webviewSetup.js должен существовать'))
test('VK WebView не глушится на уровне Electron host', () => {
  assert(!webviewCode.includes('enforceVkWebviewMute'), 'VK нельзя глушить helper-ом на уровне WebView: это ломает видео/аудио внутри VK')
  assert(!webviewCode.includes('setAudioMuted(true)'), 'VK нельзя глушить через Electron setAudioMuted(true): это mute всей guest page')
  assert(webviewCode.includes('const isVkWebview') && webviewCode.includes('createVkExecFallbackRuntime({ isVkWebview'), 'VK detection должен остаться для VK fallback/diagnostics')
  assert(allAppCode.includes('playNotificationSound('), 'app notification sound pipeline должен остаться')
})
// v0.87.82: playNotificationSound вызов теперь в useAppIPCListeners.js (был в App.jsx)
test('playNotificationSound() из sound', () => assert(allAppCode.includes('playNotificationSound(')))
test('buildChatNavigateScript() из navigateToChat', () => assert(allAppCode.includes('buildChatNavigateScript(')))
test('detectMessengerType() из конфига', () => assert(allAppCode.includes('detectMessengerType(')))

// ── Безопасность __CC_NOTIF__ (v0.81.3) ──
console.log('\\n── __CC_NOTIF__ pipeline: ──')
test('Нет undefined isSpam в __CC_NOTIF__ handler (v0.81.3)', () => {
  assert(!code.includes('!isSpam'), 'isSpam переменная не определена в App.jsx — использование вызовет ReferenceError')
})

// ── Размер файла ──
console.log('\\n── Размер: ──')
var lines = code.split('\n').length
test('App.jsx < 2500 строк', () => assert(lines < 2500, 'lines=' + lines))
test('Минимум console.log (< 5 в renderer)', () => {
  // Считаем console.log НЕ внутри executeJavaScript строк
  var logLines = code.split('\n').filter(l => /^\s*console\.log/.test(l) && !l.includes("console.log('__CC_"))
  assert(logLines.length < 5, 'found ' + logLines.length + ' console.log lines')
})
// v0.87.82: после рефакторинга App.jsx ≈ 475 строк (было 599). Порог снижен до 300 — главное чтобы файл не был пустым.
test('App.jsx > 300 строк (не пустой)', () => assert(lines > 300, 'lines=' + lines))

// ── Компоненты ──
console.log('\\n── Компоненты: ──')
test('NotifLogModal используется', () => assert(code.includes('<NotifLogModal')))
test('MessengerTab используется', () => assert(allAppCode.includes('<MessengerTab')))
test('SettingsPanel используется', () => assert(code.includes('<SettingsPanel')))
test('SystemDiagnosticsModal используется', () => assert(allAppCode.includes('<SystemDiagnosticsModal')))
test('DiagnosticsFloatingPanel используется', () => assert(allAppCode.includes('<DiagnosticsFloatingPanel')))
test('AISidebar используется', () => assert(code.includes('<AISidebar')))
test('Условные панели грузятся через lazy()', () =>
  assert(code.includes('lazy(() => import') && code.includes('<Suspense fallback={null}>')))

// v0.86.10 Ловушка 64: resize/reload откачены, hook содержит health-check + warm-up
test('useWebViewLifecycle hook подключён (Ловушка 64)', () =>
  assert(code.includes('useWebViewLifecycle') && allAppCode.includes('__CC_DIAG__health'),
    'App.jsx должен использовать useWebViewLifecycle — health-check + warm-up (resize/reload откачены, не работают для peer-changed race)'))

// ── v1.2.256 (Модель 🅰️): веб-мессенджеры встроены в ЕДИНУЮ нативную полосу ──
// SourceRail (отдельная панель) и флаг sideRail УДАЛЕНЫ. Смоук статикой (full App не монтируется):
// App.jsx не должен ссылаться на SourceRail/sideRail и обязан отдавать веб-мессенджеры в NativeApp.
console.log('\\n── Единая полоса источников (Модель 🅰️): ──')
test('SourceRail и флаг sideRail удалены из App.jsx', () => {
  assert(!code.includes('SourceRail'), 'App.jsx не должен ссылаться на SourceRail (отдельная панель убрана)')
  assert(!code.includes('settings.sideRail'), 'флаг sideRail убран')
})
test('App отдаёт веб-мессенджеры в нативную полосу (единая полоса)', () => {
  assert(code.includes('webSources={messengers.filter'), 'веб-мессенджеры передаются в NativeApp')
  assert(code.includes('onSelectSource={handleTabClick}'), 'клик по веб-значку → переключение вкладки')
  assert(code.includes('activeMessengerId={activeId}'), 'подсветка активного веб-значка')
  assert(code.includes('webUnread={unreadCounts}') && code.includes('webHealth={connectionHealth}'), 'данные для бейджа/точки')
})
test('Функции вкладок на веб-значках: правый клик + перетаскивание + загрузка (v1.2.257)', () => {
  assert(code.includes('onWebContextMenu={(id, x, y) => setContextMenuTab({ id, x, y })}'), 'правый клик → то же меню, что у вкладок')
  assert(code.includes('onWebDragStart={handleDragStart}') && code.includes('onWebDrop={handleDrop}'), 'перетаскивание — обработчики вкладок')
  assert(code.includes('webDragOverId={dragOverId}'), 'подсветка цели перетаскивания')
  assert(code.includes('webLoading={webviewLoading}'), 'полоска загрузки')
  assert(code.includes('onAddWeb={(entry) =>'), 'App: onAddWeb принимает выбранный мессенджер (пресет→вкладка, null→ручной ввод)')
})
// v1.2.264: одна кнопка «＋ Добавить» → окно «протокол → мессенджер»; две прежние «+» убраны.
test('Одна кнопка «Добавить» + окно AddSourceModal (v1.2.264)', () => {
  const sidebarCode = fs.readFileSync(path.join(__dirname, '..', 'native', 'components', 'NativeSidebar.jsx'), 'utf8')
  const addModalPath = path.join(__dirname, '..', 'native', 'components', 'AddSourceModal.jsx')
  assert(fs.existsSync(addModalPath), 'AddSourceModal.jsx существует')
  // В полосе одна кнопка «Добавить», прежних двух «+» нет
  assert(sidebarCode.includes('data-testid="native-rail-add"'), 'полоса: одна кнопка «＋ Добавить»')
  assert(!sidebarCode.includes('native-rail-add-account') && !sidebarCode.includes('native-rail-add-web'), 'прежние две «+» убраны')
  assert(sidebarCode.includes('onActivateNative?.(); onOpenAddSource?.()'), 'клик «Добавить» → возврат к API + открыть окно')
  // NativeApp монтирует окно и прокидывает API→вход, Веб→добавить
  assert(nativeAppCode.includes('AddSourceModal'), 'NativeApp рендерит AddSourceModal')
  assert(nativeAppCode.includes('onAddApi={openLogin}'), 'API → вход Telegram (openLogin)')
})
// v1.2.262: полоса ВСЕГДА видна — портал в слот на уровне App + полоска «← Общий чат» над вебом.
test('Полоса всегда видна: слот App + портал в NativeApp + «← Общий чат» над вебом (v1.2.262)', () => {
  assert(code.includes('id="app-native-rail"'), 'App рендерит слот #app-native-rail (полоса всегда слева)')
  assert(nativeAppCode.includes('createPortal'), 'NativeApp рисует полосу порталом')
  assert(nativeAppCode.includes("getElementById('app-native-rail')"), 'NativeApp находит слот')
  assert((nativeAppCode.match(/useNativeStore\(\)/g) || []).length === 1, 'useNativeStore — 1 раз (без дубля стора/IPC)')
  // полоска «← Общий чат» над активным веб-мессенджером
  assert(code.includes('Общий чат') && code.includes('handleTabClick(NATIVE_CC_ID)'), 'кнопка «← Общий чат» → возврат к API-чатам')
})
// v1.2.263: клик по API-аккаунту/«Все» при вебе → возврат к API; полоса в .native-mode (цвет как у API-окна).
test('Возврат к API по клику аккаунта + цвет полосы + ресайз в портале (v1.2.263)', () => {
  const sidebarCode = fs.readFileSync(path.join(__dirname, '..', 'native', 'components', 'NativeSidebar.jsx'), 'utf8')
  // App даёт колбэк возврата к API-чатам
  assert(code.includes('onActivateNative={'), 'App передаёт onActivateNative в NativeApp')
  assert(nativeAppCode.includes('onActivateNative={onActivateNative}'), 'NativeApp пробрасывает onActivateNative в полосу')
  // «Все» и клик по аккаунту зовут возврат к API
  assert(sidebarCode.includes('onActivateNative?.(); store.showAllAccounts()'), '«Все» → сперва возврат к API')
  assert(sidebarCode.includes('onClickCapture={() => onActivateNative?.()}'), 'клик по аккаунту → возврат к API')
  // цвет: полоса обёрнута в .native-mode (переменные --amoled-* и фон как у API-окна)
  assert(nativeAppCode.includes('className="native-mode" style={{ flexDirection: \'row\''), 'полоса обёрнута в .native-mode (цвет API-окна)')
  // разделитель ресайза — внутри портала (после обёртки .native-mode) → доступен и при активном вебе
  const wrapIdx = nativeAppCode.indexOf("className=\"native-mode\" style={{ flexDirection: 'row'")
  const sepIdx = nativeAppCode.indexOf('role="separator"')
  assert(wrapIdx > 0 && sepIdx > wrapIdx, 'разделитель ресайза перенесён в портал (.native-mode)')
})
// v1.2.271: подготовка к удалению верхних вкладок — меню правого клика вынесено из TabBar на уровень App.
test('Меню правого клика вынесено из TabBar в TabContextMenu/App (v1.2.271)', () => {
  const menuCode = fs.existsSync('src/components/TabContextMenu.jsx') ? fs.readFileSync('src/components/TabContextMenu.jsx', 'utf8') : ''
  assert(menuCode.includes('buildTabContextMenuItems'), 'TabContextMenu строит пункты меню')
  assert(code.includes('<TabContextMenu'), 'App рендерит <TabContextMenu> (меню переживёт удаление вкладок)')
  assert(!tabBarCode.includes('buildTabContextMenuItems'), 'TabBar больше НЕ рендерит меню')
  assert(tabBarCode.includes('setContextMenuTab({'), 'триггер правого клика (setContextMenuTab) остаётся в TabBar')
})
// v1.2.272: ряд верхних вкладок скрывается флагом; тонкая полоска (лого+drag+кнопки+строка) остаётся.
test('Верхние вкладки скрываются флагом settings.showTopTabs (v1.2.272)', () => {
  const settingsCode = fs.existsSync('src/components/SettingsPanel.jsx') ? fs.readFileSync('src/components/SettingsPanel.jsx', 'utf8') : ''
  assert(tabBarCode.includes('settings.showTopTabs === true'), 'TabBar: флаг showTopTabs (по умолчанию скрыто)')
  assert(tabBarCode.includes('showTopTabs ?'), 'TabBar: ряд вкладок под условием showTopTabs')
  assert(tabBarCode.includes("WebkitAppRegion: 'drag'"), 'TabBar: перетаскивание окна сохранено (drag-зона)')
  assert(settingsCode.includes("set('showTopTabs'"), 'Настройки: переключатель верхних вкладок')
})

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
