/**
 * v0.89.47: регрессионная защита WebContentsView-миграции.
 *
 * Вынесено из `modernPatternsGuard.test.cjs` при превышении 400-строчного
 * лимита. Содержит проверки фаз 2.1-2.3 миграции <webview> → WebContentsView:
 *   - Инфраструктура (Manager, IPC handlers, Slot, Bridge)
 *   - Feature flag + условный рендер
 *   - Phase 2.3 (full) активация bridge
 *   - Cache cleanup UI/IPC, partition auto-cleanup
 *   - IndexedDB кэш метрики (idb-cache aggregator)
 *   - BrowserView deprecation guard
 *   - v0.89.47 preload path/URL разделение
 *
 * Связанные файлы:
 *   - main/utils/webContentsViewManager.js
 *   - main/handlers/webContentsViewIpcHandlers.js
 *   - src/components/WebContentsViewSlot.jsx
 *   - src/utils/webContentsViewBridge.js
 *   - .memory-bank/mistakes/electron-core.md (preload URL vs path)
 */

const fs = require('fs')
const path = require('path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🛡️ WebContentsView migration guard (Phase 2.x + preload + BrowserView deprecation)\n')

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (/\.(js|cjs|mjs|ts)$/.test(entry.name)) out.push(full)
    }
  }
  return out
}

// ──────────────────────────────────────────────────────────────────
// v0.89.41: WebContentsView migration infrastructure
// ──────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────
// v0.89.42 (Phase 2.1+2.2): feature flag + условный рендер
// ──────────────────────────────────────────────────────────────────

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
  assert(/<webview/.test(content),
    '<webview> тег УДАЛЁН из App.jsx! Phase 2 — feature-flag миграция, fallback должен оставаться')
})

// ──────────────────────────────────────────────────────────────────
// v0.89.43: реактивный loadURL + partition cleanup + bridge skeleton
// ──────────────────────────────────────────────────────────────────

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
// v0.89.44: Phase 2.3 (full) bridge + cleanup UI + cache metrics
// ──────────────────────────────────────────────────────────────────

test('webContentsViewBridge.js: getWebContentsId/style/src — расширенный контракт', () => {
  const abs = path.resolve(process.cwd(), 'src/utils/webContentsViewBridge.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/getWebContentsId/.test(content),
    'getWebContentsId удалён из bridge — multi-account routing в webviewSetup сломается')
  assert(/style\s*:/.test(content), 'style: proxy/stub удалён из bridge')
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

test('nativeStore.js: метрики hit/miss IndexedDB кэша (Совет 4 + v0.89.45 агрегатор)', () => {
  const abs = path.resolve(process.cwd(), 'src/native/store/nativeStore.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/recordIdbCache/.test(content),
    "recordIdbCache удалён — нет метрик hit/miss для оптимизации кэша")
  const matches = content.match(/recordIdbCache\(/g) || []
  assert(matches.length >= 2,
    'recordIdbCache должен вызываться и в loadMessages, и в selectForumTopic — нашёлся только один вызов')
})

test('idbCacheMetrics.js: агрегатор окнами (v0.89.45 Совет улучшения)', () => {
  const abs = path.resolve(process.cwd(), 'src/native/utils/idbCacheMetrics.js')
  assert(fs.existsSync(abs), 'idbCacheMetrics.js удалён — метрика снова разлетится на сотни строк')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/idb-cache-window/.test(content),
    'idb-cache-window лог-метка удалена из агрегатора')
  assert(/setTimeout|setInterval/.test(content),
    'таймер сброса окна удалён — счётчики никогда не дойдут до лога')
})

test('topicMessagesCache.js удалён, остался только messagesCache.js (Совет 5)', () => {
  const obsolete = path.resolve(process.cwd(), 'src/native/utils/topicMessagesCache.js')
  assert(!fs.existsSync(obsolete),
    'topicMessagesCache.js (re-export) восстановлен — новые импорты должны использовать messagesCache.js')
  const replacement = path.resolve(process.cwd(), 'src/native/utils/messagesCache.js')
  assert(fs.existsSync(replacement),
    'messagesCache.js удалён — это основной модуль кэша сообщений')
})

// ──────────────────────────────────────────────────────────────────
// v0.89.45: deprecated BrowserView запрещён (Electron v29+ → WebContentsView)
// По Electron docs: «The BrowserView class is deprecated, and replaced by the new WebContentsView class».
// ──────────────────────────────────────────────────────────────────

test('main/: deprecated BrowserView не используется', () => {
  const mainFiles = listFilesRecursive(path.resolve(process.cwd(), 'main'))
  const offenders = []
  for (const f of mainFiles) {
    const raw = fs.readFileSync(f, 'utf8')
    const code = raw
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    if (/\bnew\s+BrowserView\s*\(/.test(code)) {
      offenders.push(path.relative(process.cwd(), f) + ' — new BrowserView(...)')
    }
    if (/from\s+['"]electron['"][^;]*\bBrowserView\b/.test(code)) {
      offenders.push(path.relative(process.cwd(), f) + ' — import BrowserView from electron')
    }
    if (/require\s*\(\s*['"]electron['"]\s*\)[^;]*\.BrowserView\b/.test(code)) {
      offenders.push(path.relative(process.cwd(), f) + ' — require electron).BrowserView')
    }
    if (/\{\s*[^}]*\bBrowserView\b[^}]*\}\s*=\s*require\s*\(\s*['"]electron['"]\s*\)/.test(code)) {
      offenders.push(path.relative(process.cwd(), f) + ' — destructure BrowserView from require(electron)')
    }
  }
  assert(offenders.length === 0,
    'BrowserView deprecated с Electron v29 — используй WebContentsView:\n   ' + offenders.join('\n   '))
})

// ──────────────────────────────────────────────────────────────────
// v0.89.47: preload — raw path для WebContentsView, file:// URL для <webview>
// ──────────────────────────────────────────────────────────────────

test('App.jsx: WebContentsViewSlot получает monitorPreloadPath (не URL)', () => {
  const abs = path.resolve(process.cwd(), 'src/App.jsx')
  const content = fs.readFileSync(abs, 'utf8')
  const start = content.indexOf('<WebContentsViewSlot')
  assert(start > 0, 'WebContentsViewSlot не найден в App.jsx')
  const end = content.indexOf('/>', start)
  assert(end > start, 'Закрывающий /> для WebContentsViewSlot не найден')
  const block = content.slice(start, end + 2)
  assert(/preload=\{monitorPreloadPath\b/.test(block),
    'WebContentsViewSlot должен получать monitorPreloadPath (raw путь).\n' +
    '   Если передать monitorPreloadUrl (file://...) — Electron WebContentsView\n' +
    '   падает с `preload script must have absolute path`. См. ловушку в\n' +
    '   .memory-bank/mistakes/electron-core.md → preload URL vs path.')
  assert(!/preload=\{monitorPreloadUrl\b/.test(block),
    'WebContentsViewSlot НЕ должен получать monitorPreloadUrl — это URL формат для <webview> тега')
})

test('useAppBootstrap.js: задаёт оба значения — URL и Path', () => {
  const abs = path.resolve(process.cwd(), 'src/hooks/useAppBootstrap.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/setMonitorPreloadUrl/.test(content),
    'setMonitorPreloadUrl удалён — <webview> тег без preload работать не будет')
  assert(/setMonitorPreloadPath/.test(content),
    'setMonitorPreloadPath удалён — WebContentsView без raw path упадёт при создании view')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) {
  console.log('\n❌ WebContentsView migration защита сломана.')
  console.log('   См. ловушки в .memory-bank/mistakes/electron-core.md (preload URL vs path).')
  process.exit(1)
}
