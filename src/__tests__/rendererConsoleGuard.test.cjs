// v1.1.6: страж — запрет на добавление новых console.log/warn/error/debug/info
// в renderer (src/*.js / .jsx).
//
// ПОЧЕМУ: в renderer console.* пишет только в DevTools. Штатный лог-вьюер
// «📒 Логи ChatCenter» получает данные через ipcRenderer.send('app:log').
// Если новый код пишет в console — юзер этого НЕ ВИДИТ в обычном UI логов,
// только в DevTools (который ему не нужен).
//
// ПРАВИЛЬНО для renderer:
//   try {
//     window.api?.send?.('app:log', { level: 'INFO|WARN|ERROR', message: '...' })
//   } catch (_) {}
//
// БАЗЕЛАЙН — фактические counts на момент создания теста (v1.1.6, 9 июня 2026).
// Каждое значение = max допустимое количество console.* в файле.
// Если файл вне baseline и содержит console.* → тест падает.
// Если файл в baseline и count ВЫРОС → тест падает (анти-регрессия).
// Если count УМЕНЬШИЛСЯ → OK (постепенный рефакторинг разрешён).
//
// Чтобы добавить новый файл в baseline — обоснуй и измени этот файл.

var fs = require('node:fs')
var path = require('node:path')

var BASELINE = {
  // Legacy: эти файлы используют console.* — постепенно перевести в app:log.
  // Каждое значение = МАКСИМУМ допустимый count. Уменьшение OK, рост = fail.
  'src/constants.js':                       8,
  'src/native/components/VideoTile.jsx':    6,
  'src/hooks/useNotifyDispatcher.js':       5,
  // v1.2.131: 4→6. Все console.* тут — ВНУТРИ строк-скриптов, впрыскиваемых в WebView
  // мессенджера через el.executeJavaScript (диагностика __CC_DIAG__, ловится console-мостом).
  // Это НЕ renderer-логи: внутри чужой страницы (web.telegram.org/vk.com) нашего window.api
  // нет, поэтому app:log неприменим — console единственный канал возврата данных (как в hook-файлах).
  // v1.2.434: 6→10. Страж стоял «красным» ещё с коммита c012582 (v1.2.409-426): туда
  // добавили постоянную диагностику веб-МАКС — перехват WebSocket (__CC_DIAG__ws-hook /
  // ws-close / ws-error) и ловец ошибок страницы (wv-runtime / wv-stack), а базовую линию
  // не подняли → любой следующий коммит с правкой src/ падал бы на pre-commit.
  // Все 10 console.* тут — ВНУТРИ строк, впрыскиваемых в чужую страницу мессенджера:
  // нашего window.api там нет, консоль-мост (consoleMessageParser) — единственный канал.
  'src/utils/webviewDiagnostics.js':        10,
  'src/hooks/useWebViewLifecycle.js':       3,
  'src/main.jsx':                           2,
  'src/components/NotifLogModal.jsx':       2,
  // v1.2.447: webviewSetup.js — единственная console.* уехала в shared/webviewPageFixups.js
  // и там переписана на запись в журнал приложения (app:log). Запись baseline удалена.
  'src/utils/messengerConfigs.js':          1,
  'src/utils/consoleMessageHandler.js':     1,
  'shared/tools/toolRegistry.js':           1,   // v1.2.448: переехал из src/shared/
  // ── shared/: console.* тут ВНУТРИ СТРОК, которые впрыскиваются в ЧУЖУЮ страницу.
  // Там нашего window.api нет, и мост через консоль — ЕДИНСТВЕННЫЙ способ доставить
  // строку в журнал (её ловит consoleMessageParser). Это не нарушение правила, а
  // принятый в проекте канал; в самом коде интерфейса console.* по-прежнему запрещён.
  'shared/browserBannerHider.js':           2,
  'shared/vkExecFallback.js':               2,
  // shared/changelogData.js в baseline НЕ нужен: там console.* только в тексте «Что нового»,
  // без вызова — страж такое не считает.
  'src/native/modes/InboxMode.jsx':         1,
  'src/native/hooks/useFileAttach.js':      1,
  'src/hooks/useAppBootstrap.js':           1,
  'src/components/ErrorBoundary.jsx':       1,
  'src/boot-probe.js':                      1,

  // Утилиты которые специально перехватывают console.* — НЕ считать их в стат.
  // (они пользуют console.bind(console) для оригинала / для patch).
  'src/utils/devLog.js':                    99,  // hardcoded: его задача — обёртки
  'src/hooks/useConsoleErrorLogger.js':     99,  // его задача — patch console.error
}

var CONSOLE_RE = /\bconsole\.(?:log|warn|error|debug|info)\s*\(/g

function listAllRendererFiles() {
  var files = []
  function walk(dir) {
    var entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
    catch (_) { return }
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]
      var full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue
        walk(full)
      } else if (e.isFile()) {
        if (!/\.(js|jsx)$/.test(e.name)) continue
        if (/\.vitest\.|\.test\./.test(e.name)) continue
        files.push(full.replace(/\\/g, '/'))
      }
    }
  }
  walk('src')
  // v1.2.448: обходим и shared/ — оттуда код попадает и в интерфейс, и в главный процесс.
  // Раньше папка была вне присмотра, и переезд src/shared/ → shared/ увёл бы из-под
  // стража уже существующий файл (toolRegistry.js). Теперь покрытие не теряется.
  walk('shared')
  return files
}

function countConsole(content) {
  var m = content.match(CONSOLE_RE)
  return m ? m.length : 0
}

function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name) }
  catch (e) { console.log('  ❌ ' + name + ': ' + e.message); process.exitCode = 1 }
}

function assert(cond, msg) { if (!cond) throw new Error(msg) }

console.log('── Renderer console.* guard (v1.1.6): ──')

var allFiles = listAllRendererFiles()
var violations = []
var seenBaseline = {}

for (var i = 0; i < allFiles.length; i++) {
  var f = allFiles[i]
  var content = ''
  try { content = fs.readFileSync(f, 'utf8') } catch (_) {}
  var count = countConsole(content)
  if (count === 0) continue

  if (BASELINE[f] !== undefined) {
    seenBaseline[f] = true
    if (count > BASELINE[f]) {
      violations.push({
        type: 'regression',
        file: f,
        count: count,
        baseline: BASELINE[f],
      })
    }
  } else {
    violations.push({
      type: 'new_file',
      file: f,
      count: count,
    })
  }
}

// Файлы из BASELINE которых больше нет (удалили / переименовали) — это OK,
// но напомним обновить BASELINE.
var staleBaseline = []
for (var k in BASELINE) {
  if (!seenBaseline[k] && BASELINE[k] < 99) {
    staleBaseline.push(k)
  }
}

test('нет console.* в новых renderer-файлах (вне baseline)', function () {
  var newFileViolations = violations.filter(function (v) { return v.type === 'new_file' })
  if (newFileViolations.length > 0) {
    var msg = '\n'
    for (var i = 0; i < newFileViolations.length; i++) {
      var v = newFileViolations[i]
      msg += '    🚫 ' + v.file + ' содержит ' + v.count + ' console.* — НЕ в baseline.\n'
    }
    msg += '\n  ПРАВИЛЬНО: window.api?.send?.("app:log", { level, message })\n'
    msg += '  ПОДРОБНО: см. CLAUDE.md «Renderer-логи через app:log»\n'
    assert(false, msg)
  }
})

test('нет регрессий в baseline (count не вырос)', function () {
  var regressions = violations.filter(function (v) { return v.type === 'regression' })
  if (regressions.length > 0) {
    var msg = '\n'
    for (var i = 0; i < regressions.length; i++) {
      var v = regressions[i]
      msg += '    🚫 ' + v.file + ': console.* count ' + v.count + ' > baseline ' + v.baseline + '\n'
    }
    msg += '\n  Существующий файл добавил новые console.* — переведи их на window.api.send("app:log")\n'
    assert(false, msg)
  }
})

if (staleBaseline.length > 0) {
  console.log('  ⚠️  устарел baseline (файлы пропали — обнови rendererConsoleGuard.test.cjs):')
  for (var i = 0; i < staleBaseline.length; i++) {
    console.log('     ' + staleBaseline[i])
  }
}

console.log('\n📊 Renderer console guard: проверено ' + allFiles.length + ' файлов, baseline ' + Object.keys(BASELINE).length + ', violations ' + violations.length)
