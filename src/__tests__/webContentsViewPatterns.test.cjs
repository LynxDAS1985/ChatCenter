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

test('v0.90.0: SettingsPanel — тумблер useWebContentsView скрыт', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SettingsPanel.jsx'), 'utf8')
  assert(!/<Toggle\s+value=\{!!settings\.useWebContentsView\}/.test(content),
    'Тумблер useWebContentsView вернулся — deprecated в v0.90.0')
})

test('v0.90.0: App.jsx — <webview> тег удалён, всегда WebContentsViewSlot', () => {
  const raw = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8')
  const code = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert(/WebContentsViewSlot/.test(code), 'WebContentsViewSlot не импортирован')
  assert(!/<webview[\s>]/.test(code), '<webview> тег вернулся (активный код) — v0.90.0 не поддерживает')
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

test('v0.90.0: App.jsx WebContentsViewSlot — preload + m.partition', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8')
  const start = content.indexOf('<WebContentsViewSlot'); const end = content.indexOf('/>', start)
  assert(start > 0 && end > start, 'WebContentsViewSlot не найден')
  const block = content.slice(start, end + 2)
  assert(/preload=\{monitorPreloadPath\b/.test(block), 'monitorPreloadPath удалён — нет ChatMonitor')
  // v0.90.0: partition=m.partition (изоляция persist:wcv-* больше не нужна — нет webviewTag).
  assert(/partition=\{m\.partition\}/.test(block),
    'WebContentsViewSlot должен получать m.partition (без префикса persist:wcv-)')
})

test('v0.90.0: main.js — disable-gpu-compositing удалён', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'main/main.js'), 'utf8')
  // v0.90.0: switch был воркэраундом для <webview>, которого больше нет.
  // WebContentsView требует GPU compositor для overlay рендеринга.
  assert(!/appendSwitch\(['"]disable-gpu-compositing['"]/.test(content),
    'disable-gpu-compositing вернулся в main.js — v0.90.0 не использует <webview>, switch не нужен')
})

test('v0.90.0: windowManager — BaseWindow + primary WebContentsView, не BrowserWindow', () => {
  const raw = fs.readFileSync(path.resolve(process.cwd(), 'main/utils/windowManager.js'), 'utf8')
  const code = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert(/new BaseWindow/.test(code),
    'BaseWindow удалён — главное окно должно быть BaseWindow (по Electron docs)')
  assert(/new WebContentsView/.test(code), 'primary WebContentsView удалён')
  assert(/contentView\.addChildView\(primaryView\)/.test(code), 'primaryView не добавлен в contentView')
  assert(!/webviewTag\s*:\s*true/.test(code),
    'webviewTag:true вернулся в активном коде — причина крашей WebContentsView')
})

test('useAppBootstrap.js: задаёт оба значения — URL и Path', () => {
  const abs = path.resolve(process.cwd(), 'src/hooks/useAppBootstrap.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/setMonitorPreloadUrl/.test(content),
    'setMonitorPreloadUrl удалён — <webview> тег без preload работать не будет')
  assert(/setMonitorPreloadPath/.test(content),
    'setMonitorPreloadPath удалён — WebContentsView без raw path упадёт при создании view')
})

// ──────────────────────────────────────────────────────────────────
// v0.89.48: smoke-test контракта пилота (Совет 2).
// Без реального Electron — проверяем именно те цепочки которые v0.89.46 ломались:
// 1) useAppBootstrap.js → setMonitorPreloadPath получает RAW путь (не file://)
// 2) App.jsx → передаёт его в WebContentsViewSlot.preload
// 3) wcv:create handler меряет тайминг и логирует
// ──────────────────────────────────────────────────────────────────

test('Smoke: useAppBootstrap НЕ оборачивает path в file:// перед setMonitorPreloadPath', () => {
  const abs = path.resolve(process.cwd(), 'src/hooks/useAppBootstrap.js')
  const content = fs.readFileSync(abs, 'utf8')
  // Регистрируем что setMonitorPreloadPath?.(monitorPreload) — НЕ url
  // (т.е. monitorPreload — это значение от main `app:get-paths`, абсолютный путь).
  const m = content.match(/setMonitorPreloadPath\s*\?\s*\.\s*\(([^)]+)\)/)
  assert(m, 'setMonitorPreloadPath не вызывается с аргументом')
  const arg = m[1].trim()
  assert(arg === 'monitorPreload',
    'setMonitorPreloadPath должен получать ИМЕННО monitorPreload (raw path от main), а не url. ' +
    'Сейчас аргумент: ' + arg)
})

test('Smoke: wcv:create handler логирует тайминг (Совет 5)', () => {
  const abs = path.resolve(process.cwd(), 'main/handlers/webContentsViewIpcHandlers.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/wcv-timing.*create/.test(content),
    '[wcv-timing] create лог удалён — нет понимания скорости пилота')
  assert(/Date\.now\(\)\s*-\s*t0/.test(content),
    'тайминг dt = Date.now() - t0 удалён из wcv:create handler')
})

test('Smoke: renderer + main глобальные error handlers (Совет 3)', () => {
  // Renderer: useConsoleErrorLogger подписывается на window error + unhandledrejection
  const renderer = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useConsoleErrorLogger.js'), 'utf8')
  assert(/addEventListener\(['"]error['"]/.test(renderer),
    "window.addEventListener('error', ...) удалён — uncaught рендер-ошибки пропадут")
  assert(/addEventListener\(['"]unhandledrejection['"]/.test(renderer),
    "window.addEventListener('unhandledrejection', ...) удалён — async ошибки без .catch пропадут")
  // Main: process.on('uncaughtException') + 'unhandledRejection'
  const main = fs.readFileSync(path.resolve(process.cwd(), 'main/main.js'), 'utf8')
  assert(/process\.on\(['"]uncaughtException['"]/.test(main),
    "process.on('uncaughtException') удалён — main-крахи без следа в chatcenter.log")
  assert(/process\.on\(['"]unhandledRejection['"]/.test(main),
    "process.on('unhandledRejection') удалён — promise-rejections пропадут")
})

test('Smoke: useAppBootstrap логирует useWebContentsView при старте (v0.89.49)', () => {
  const abs = path.resolve(process.cwd(), 'src/hooks/useAppBootstrap.js')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/useWebContentsView=/.test(content),
    'логирование useWebContentsView=ON/OFF удалено из useAppBootstrap — из лога ' +
    'снова непонятно «пилот активен или нет»')
})

test('Smoke: UncaughtErrorToast подключён в App.jsx (v0.89.49)', () => {
  const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8')
  assert(/UncaughtErrorToast/.test(app),
    'UncaughtErrorToast не импортирован или не вставлен в App.jsx — юзер не увидит ' +
    'плашку при uncaught error, останется тихий краш')
  const toastFile = path.resolve(process.cwd(), 'src/components/UncaughtErrorToast.jsx')
  assert(fs.existsSync(toastFile), 'UncaughtErrorToast.jsx удалён!')
  const toast = fs.readFileSync(toastFile, 'utf8')
  assert(/cc-uncaught-error/.test(toast),
    'cc-uncaught-error event listener удалён из UncaughtErrorToast — toast не реагирует на ошибки')
  // Hook должен эмитить событие при обоих типах ошибок (sync + async).
  const hook = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useConsoleErrorLogger.js'), 'utf8')
  const emitCount = (hook.match(/emitUncaughtEvent\(/g) || []).length
  assert(emitCount >= 2,
    'emitUncaughtEvent должен вызываться И в onError И в onRejection — нашёлся только ' + emitCount)
})

test('Smoke: scripts/dev.cjs фильтр НЕ глотает ERROR строки (v0.89.48 ослабление)', () => {
  const abs = path.resolve(process.cwd(), 'scripts/dev.cjs')
  const content = fs.readFileSync(abs, 'utf8')
  assert(/IMPORTANT/.test(content),
    'IMPORTANT override regex удалён — фильтр снова может проглотить ERROR строки')
  assert(/\\bERROR\\b/.test(content) || /\\bError\\b/.test(content),
    'IMPORTANT regex должен включать ERROR/Error чтобы реальные ошибки не глотались')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) {
  console.log('\n❌ WebContentsView migration защита сломана.')
  console.log('   См. ловушки в .memory-bank/mistakes/electron-core.md (preload URL vs path).')
  process.exit(1)
}
