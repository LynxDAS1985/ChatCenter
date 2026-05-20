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

// ──────────────────────────────────────────────────────────────────
// Дополнительные регрессии: WebContentsView migration + preload + BrowserView
// вынесены в `webContentsViewPatterns.test.cjs` (v0.89.47 — разбиение
// после превышения 400-строчного лимита).
// ──────────────────────────────────────────────────────────────────

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) {
  console.log('\n❌ Регрессионная защита сломана. Это означает возврат устаревшего паттерна.')
  console.log('   См. ловушки в .memory-bank/mistakes/electron-core.md.')
  process.exit(1)
}
