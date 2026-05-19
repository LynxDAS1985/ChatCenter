// v0.89.38: регрессионная защита от возврата устаревших паттернов.
//
// Проверяет 3 категории несоответствий найденных в аудите 19 мая 2026:
//   A. Electron Security: nodeIntegration: true / contextIsolation: false
//      в BrowserWindow. По Electron Security Checklist
//      (https://www.electronjs.org/docs/latest/tutorial/security) это Don't #2
//      и Don't #3.
//   B. Webview boundary: глобальный fixed overlay в App.jsx должен
//      существовать. Без него mouseup застревает в webview, разделитель
//      залипает (см. ловушка в mistakes/electron-core.md).
//   C. Pointer Events (W3C 2018+): drag-handler resize + 3 dropdown'а
//      должны использовать pointerdown/pointermove/pointerup, не mouse*.
//
// Запускается в pre-commit hook через test:vitest и cjs runner.

const fs = require('fs')
const path = require('path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🛡️ Modern patterns guard (Electron + Pointer Events + webview overlay)\n')

// ──────────────────────────────────────────────────────────────────
// A. Electron Security: nodeIntegration / contextIsolation
// ──────────────────────────────────────────────────────────────────

// Список файлов где создаются BrowserWindow. При добавлении нового — расширить.
const BROWSER_WINDOW_FILES = [
  'main/utils/trayManager.js',
  'main/handlers/notificationManager.js',
  'main/handlers/dockPinHandlers.js',
  'main/main.js',
]

for (const rel of BROWSER_WINDOW_FILES) {
  const abs = path.resolve(process.cwd(), rel)
  if (!fs.existsSync(abs)) {
    test(`файл ${rel} существует`, () => assert(false, `не найден: ${rel}`))
    continue
  }
  const content = fs.readFileSync(abs, 'utf8')
  // Допускаем что строка целиком ('nodeIntegration: true') не должна встретиться
  // в production коде. В комментариях и тестах — нормально.
  // Снимаем комментарии // и /* */ для проверки.
  const stripped = content
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  test(`${rel}: НЕТ nodeIntegration: true в BrowserWindow opts`, () => {
    assert(!/nodeIntegration\s*:\s*true/.test(stripped),
      'Найдено nodeIntegration: true!\n' +
      '   По Electron Security Checklist Don\'t #2 — отключить nodeIntegration.\n' +
      '   Использовать preload + contextBridge.\n' +
      '   См. https://www.electronjs.org/docs/latest/tutorial/security')
  })
  test(`${rel}: НЕТ contextIsolation: false в BrowserWindow opts`, () => {
    assert(!/contextIsolation\s*:\s*false/.test(stripped),
      'Найдено contextIsolation: false!\n' +
      '   По Electron Security Checklist Don\'t #3 — НЕ отключать contextIsolation.\n' +
      '   С v12 contextIsolation: true — дефолт. Преднамеренное отключение = security risk.\n' +
      '   См. https://www.electronjs.org/docs/latest/tutorial/security')
  })
}

// ──────────────────────────────────────────────────────────────────
// B. Webview boundary: глобальный fixed overlay в App.jsx
// ──────────────────────────────────────────────────────────────────

test('App.jsx: глобальный fixed overlay при isResizing для webview boundary', () => {
  const abs = path.resolve(process.cwd(), 'src/App.jsx')
  const content = fs.readFileSync(abs, 'utf8')
  // Маркер data-cc-resize-overlay плюс position: fixed + zIndex 999999.
  assert(/data-cc-resize-overlay/.test(content),
    'data-cc-resize-overlay overlay УДАЛЁН из App.jsx!\n' +
    '   Без глобального fixed overlay поверх всех webview во время resize\n' +
    '   разделителя AI sidebar — mouseup застревает в webview (отдельный\n' +
    '   процесс по Electron docs), isResizingRef.current остаётся true,\n' +
    '   разделитель залипает.')
  const idx = content.indexOf('data-cc-resize-overlay')
  const block = content.slice(Math.max(0, idx - 200), idx + 400)
  assert(/position:\s*['"`]fixed['"`]/.test(block),
    'overlay должен быть position: fixed (не absolute) — иначе не покроет AI webview')
  assert(/zIndex:\s*999999/.test(block),
    'overlay должен иметь zIndex 999999 — иначе webview может перекрыть его')
})

// ──────────────────────────────────────────────────────────────────
// C. Pointer Events: drag + clickaway dropdown'ы
// ──────────────────────────────────────────────────────────────────

test('useAIPanelResize.js: использует pointer events + setPointerCapture', () => {
  const abs = path.resolve(process.cwd(), 'src/hooks/useAIPanelResize.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/setPointerCapture/.test(content),
    'setPointerCapture УДАЛЁН — без него pointer events не дойдут до pointerup в edge cases')
  assert(/onPointerMove|onPointerUp/.test(content),
    'onPointerMove/onPointerUp УДАЛЕНЫ из exports — возврат к устаревшим mouse events')
  // Жёсткая проверка что не вернули window.addEventListener mousemove (legacy)
  assert(!/window\.addEventListener\(['"]mousemove/.test(content),
    'window.addEventListener(\'mousemove\') ВЕРНУЛИ — это устаревший паттерн.\n' +
    '   Используй pointer events на самом divider + setPointerCapture.')
})

const POINTER_DROPDOWN_FILES = [
  'src/native/components/MuteMenu.jsx',
  'src/native/components/CountryPicker.jsx',
  'src/native/components/AccountContextMenu.jsx',
]

for (const rel of POINTER_DROPDOWN_FILES) {
  const abs = path.resolve(process.cwd(), rel)
  test(`${rel}: clickaway через pointerdown (не mousedown)`, () => {
    const content = fs.readFileSync(abs, 'utf8')
    // В этих файлах должен быть addEventListener('pointerdown'), не 'mousedown'.
    assert(!/addEventListener\(['"]mousedown/.test(content),
      'addEventListener(\'mousedown\') ВЕРНУЛИ — устаревший API.\n' +
      '   Использовать addEventListener(\'pointerdown\') — W3C стандарт 2018+,\n' +
      '   единый API для mouse/touch/pen. См. MDN Pointer Events.')
    assert(/addEventListener\(['"]pointerdown/.test(content),
      'addEventListener(\'pointerdown\') УДАЛЁН из ' + rel)
  })
}

// ──────────────────────────────────────────────────────────────────
// log-viewer preload — должен существовать и подключаться в trayManager
// ──────────────────────────────────────────────────────────────────

test('log-viewer.preload.cjs существует и экспонирует window.logViewer', () => {
  const abs = path.resolve(process.cwd(), 'main/preloads/log-viewer.preload.cjs')
  assert(fs.existsSync(abs), 'main/preloads/log-viewer.preload.cjs удалён!')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/contextBridge/.test(content), 'contextBridge удалён из log-viewer.preload.cjs')
  assert(/exposeInMainWorld\(['"]logViewer/.test(content),
    'window.logViewer API удалён из preload')
})

test('trayManager.js: log viewer окно подключает preload', () => {
  const abs = path.resolve(process.cwd(), 'main/utils/trayManager.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/log-viewer\.preload\.cjs|getLogViewerPreloadPath/.test(content),
    'preload для log-viewer не подключён в trayManager.js')
})

// v0.89.41: WebContentsView migration infrastructure exists
test('webContentsViewManager.js существует и экспонирует API', () => {
  const abs = path.resolve(process.cwd(), 'main/utils/webContentsViewManager.js')
  assert(fs.existsSync(abs), 'webContentsViewManager.js удалён!')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/class WebContentsViewManager/.test(content), 'класс WebContentsViewManager удалён')
  assert(/createView|setBounds|loadURL|executeJavaScript|destroyView/.test(content),
    'основные методы менеджера удалены')
  assert(/getWebContentsViewManager/.test(content), 'singleton getter удалён')
})

test('webContentsViewIpcHandlers.js существует и регистрирует wcv:* каналы', () => {
  const abs = path.resolve(process.cwd(), 'main/handlers/webContentsViewIpcHandlers.js')
  assert(fs.existsSync(abs), 'webContentsViewIpcHandlers.js удалён!')
  const content = fs.readFileSync(abs, 'utf8')
  const channels = ['wcv:create', 'wcv:set-bounds', 'wcv:load-url', 'wcv:execute-js',
    'wcv:send', 'wcv:destroy', 'wcv:list']
  for (const ch of channels) {
    assert(content.includes(ch), 'IPC канал ' + ch + ' удалён из webContentsViewIpcHandlers.js')
  }
})

test('main.js регистрирует initWebContentsViewIpcHandlers', () => {
  const abs = path.resolve(process.cwd(), 'main/main.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/initWebContentsViewIpcHandlers/.test(content),
    'initWebContentsViewIpcHandlers не подключён в main.js')
})

test('WebContentsViewSlot.jsx существует с базовыми IPC интеграциями', () => {
  const abs = path.resolve(process.cwd(), 'src/components/WebContentsViewSlot.jsx')
  assert(fs.existsSync(abs), 'WebContentsViewSlot.jsx удалён!')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/wcv:create/.test(content), 'wcv:create вызов удалён из WebContentsViewSlot')
  assert(/wcv:destroy/.test(content), 'wcv:destroy вызов удалён из WebContentsViewSlot')
  assert(/wcv:set-bounds/.test(content), 'wcv:set-bounds вызов удалён из WebContentsViewSlot')
  assert(/wcv:event/.test(content), 'wcv:event subscription удалена из WebContentsViewSlot')
  assert(/ResizeObserver/.test(content),
    'ResizeObserver удалён — без него не отслеживается изменение размера слота')
})

// v0.89.42 (Phase 2.1+2.2): feature flag + условный рендер.
test('SettingsPanel.jsx: toggle useWebContentsView присутствует', () => {
  const abs = path.resolve(process.cwd(), 'src/components/SettingsPanel.jsx')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/settings\.useWebContentsView/.test(content),
    'feature toggle useWebContentsView удалён из SettingsPanel — Phase 2.1 откат')
  assert(/set\(['"]useWebContentsView['"]/.test(content),
    'set(\'useWebContentsView\', ...) handler удалён из SettingsPanel')
})

test('App.jsx: условный рендер WebContentsViewSlot vs <webview>', () => {
  const abs = path.resolve(process.cwd(), 'src/App.jsx')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/WebContentsViewSlot/.test(content),
    'WebContentsViewSlot не импортирован в App.jsx — Phase 2.2 откат')
  assert(/settings\.useWebContentsView/.test(content),
    'условный рендер по settings.useWebContentsView удалён из App.jsx — Phase 2.2 откат')
  // Старый <webview> должен ОСТАТЬСЯ — это fallback при flag=false
  assert(/<webview/.test(content),
    '<webview> тег УДАЛЁН из App.jsx! Phase 2 — feature-flag миграция, fallback должен оставаться')
})

// v0.89.43: новые компоненты Phase 2 продолжение
test('WebContentsViewSlot.jsx: реактивный loadURL для url change без пересоздания', () => {
  const abs = path.resolve(process.cwd(), 'src/components/WebContentsViewSlot.jsx')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/wcv:load-url/.test(content),
    'реактивный wcv:load-url удалён — url change будет требовать пересоздания view')
  assert(/lastUrlRef/.test(content),
    'lastUrlRef удалён — без него loadURL будет дёргаться каждый рендер')
})

test('webContentsViewManager.js: cleanupPartition существует', () => {
  const abs = path.resolve(process.cwd(), 'main/utils/webContentsViewManager.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/cleanupPartition/.test(content),
    'cleanupPartition удалён из webContentsViewManager — partition cleanup потерян')
  assert(/clearCache|clearStorageData/.test(content),
    'clearCache/clearStorageData удалены из cleanupPartition')
})

test('webContentsViewIpcHandlers.js: wcv:cleanup-partition канал', () => {
  const abs = path.resolve(process.cwd(), 'main/handlers/webContentsViewIpcHandlers.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/wcv:cleanup-partition/.test(content),
    'IPC канал wcv:cleanup-partition удалён')
})

test('webContentsViewBridge.js существует и эмулирует webview интерфейс', () => {
  const abs = path.resolve(process.cwd(), 'src/utils/webContentsViewBridge.js')
  assert(fs.existsSync(abs), 'webContentsViewBridge.js удалён!')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/createWebContentsViewBridge/.test(content), 'createWebContentsViewBridge экспорт удалён')
  // Эмулируемые методы <webview> — все 4 обязательны для совместимости с webviewSetup
  for (const m of ['executeJavaScript', 'send', 'addEventListener', 'removeEventListener']) {
    assert(content.includes(m), 'метод ' + m + ' удалён из bridge — webviewSetup не сможет работать через него')
  }
  assert(/_chatcenterListeners/.test(content), '_chatcenterListeners массив удалён — webviewSetup ломается')
})

test('Документация .memory-bank/electron-breaking-changes.md существует', () => {
  const abs = path.resolve(process.cwd(), '.memory-bank/electron-breaking-changes.md')
  assert(fs.existsSync(abs), 'electron-breaking-changes.md удалён!')
})

test('Документация .memory-bank/webcontents-view-pilot-results.md существует', () => {
  const abs = path.resolve(process.cwd(), '.memory-bank/webcontents-view-pilot-results.md')
  assert(fs.existsSync(abs), 'webcontents-view-pilot-results.md удалён!')
})

// ──────────────────────────────────────────────────────────────────
// v0.89.44: Phase 2.3 (full) + cleanup UI + cache metrics
// ──────────────────────────────────────────────────────────────────

test('webContentsViewBridge.js: getWebContentsId/style/src — расширенный контракт', () => {
  const abs = path.resolve(process.cwd(), 'src/utils/webContentsViewBridge.js')
  const content = fs.readFileSync(abs, 'utf8')
  // webviewSetup использует el.getWebContentsId?.() для multi-account routing.
  assert(/getWebContentsId/.test(content),
    'getWebContentsId удалён из bridge — multi-account routing в webviewSetup сломается')
  // webviewSetup может делать el.style.display = 'none' — нужен любой stub.
  assert(/style\s*:/.test(content), 'style: proxy/stub удалён из bridge')
  // el.src = url → wcv:load-url (или хотя бы getter/setter).
  assert(/set\s+src|src:\s*\(/.test(content),
    'src setter удалён из bridge — webviewSetup при el.src=url не сможет навигировать')
})

test('WebContentsViewSlot.jsx: onCreated callback для подключения bridge', () => {
  const abs = path.resolve(process.cwd(), 'src/components/WebContentsViewSlot.jsx')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/onCreated/.test(content),
    'onCreated prop удалён из WebContentsViewSlot — App.jsx не сможет подключить bridge после создания view')
})

test('App.jsx: bridge подключается при создании WebContentsView', () => {
  const abs = path.resolve(process.cwd(), 'src/App.jsx')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/createWebContentsViewBridge/.test(content),
    'createWebContentsViewBridge не импортирован/не используется в App.jsx — Phase 2.3 откат')
  assert(/_isWebContentsViewBridge/.test(content),
    'проверка _isWebContentsViewBridge удалена — будет создавать новый bridge каждый рендер')
})

test('App.jsx: removeMessenger вызывает wcv:cleanup-partition (Совет 3)', () => {
  const abs = path.resolve(process.cwd(), 'src/App.jsx')
  const content = fs.readFileSync(abs, 'utf8')
  // Находим блок removeMessenger и проверяем что в нём есть wcv:cleanup-partition.
  const idx = content.indexOf('removeMessenger = useCallback')
  assert(idx > 0, 'removeMessenger callback не найден в App.jsx')
  const block = content.slice(idx, idx + 1500)
  assert(/wcv:cleanup-partition/.test(block),
    'wcv:cleanup-partition не вызывается в removeMessenger — осколки сессии остаются на диске после удаления мессенджера')
  assert(/full:\s*true/.test(block),
    'cleanup должен быть с full:true (logout) — иначе cookies/localStorage останутся')
})

test('SettingsPanel.jsx: кнопка очистки кэша WebContentsView (Совет 2)', () => {
  const abs = path.resolve(process.cwd(), 'src/components/SettingsPanel.jsx')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/wcv:cleanup-partition/.test(content),
    'кнопка очистки кэша WebContentsView удалена из SettingsPanel — Совет 2 откат')
  assert(/cleanupWcvPartitions|wcvCleanup/.test(content),
    'обработчик/state для кнопки очистки WebContentsView удалён')
})

test('nativeStore.js: метрики hit/miss IndexedDB кэша (Совет 4)', () => {
  const abs = path.resolve(process.cwd(), 'src/native/store/nativeStore.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/idb-cache/.test(content),
    "logNativeScroll('idb-cache', ...) удалён — нет метрик hit/miss для оптимизации кэша")
  // Проверяем что обе ветки логируются (общий чат + топик).
  const matches = content.match(/idb-cache/g) || []
  assert(matches.length >= 2,
    'метрика idb-cache должна быть и в loadMessages, и в selectForumTopic — нашлась только в одной ветке')
})

test('topicMessagesCache.js удалён, остался только messagesCache.js (Совет 5)', () => {
  const obsolete = path.resolve(process.cwd(), 'src/native/utils/topicMessagesCache.js')
  assert(!fs.existsSync(obsolete),
    'topicMessagesCache.js (re-export) восстановлен — новые импорты должны использовать messagesCache.js')
  const replacement = path.resolve(process.cwd(), 'src/native/utils/messagesCache.js')
  assert(fs.existsSync(replacement),
    'messagesCache.js удалён — это основной модуль кэша сообщений')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) {
  console.log('\n❌ Регрессионная защита сломана. Это означает возврат устаревшего паттерна.')
  console.log('   См. ловушки в .memory-bank/mistakes/electron-core.md.')
  process.exit(1)
}
