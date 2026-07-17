/**
 * Тесты лимитов размеров файлов кода — защита от бесконтрольного роста.
 *
 * v0.87.68 (переписан): теперь АВТОМАТИЧЕСКИ обходит ВСЕ файлы в src/ и main/
 * по типу пути, не нужно вручную перечислять.
 *
 * Если файл превышает лимит → тест падает → нужно разбить.
 * Если файл на 80%+ от лимита → жёлтое предупреждение (но не падает).
 *
 * Запуск: node src/__tests__/fileSizeLimits.test.cjs
 *
 * Правила новых лимитов по типу файла (v0.87.68):
 * - .jsx в src/components/            → 700 строк (крупные панели)
 * - .jsx в src/native/                → 600 строк (экраны native)
 * - .jsx в других местах              → 600 строк
 * - .js в src/hooks/                  → 150 строк (React hooks)
 * - .js в src/utils/, main/utils/     → 300 строк (обычные утилиты)
 * - .js в main/handlers/, main/native/, src/native/store/, main/preloads/utils/
 *                                     → 500 строк (крупные интеграции)
 * - .cjs в main/preloads/             → 600 строк (preload-скрипты)
 * - тестовые файлы                    → 400 строк
 *
 * Известные исключения (файлы которые пока не разбиты, зафиксированы
 * в .memory-bank/handoff-code-limits.md для разбиения в будущем):
 * - main/native/telegramHandler.js (1260 строк, потолок 1300)
 * - src/native/modes/InboxMode.jsx (765 строк, потолок 800)
 */

var fs = require('fs')
var path = require('path')

var passed = 0, failed = 0, warnings = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function warn(name, msg) {
  warnings++; console.log('  ⚠️  ' + name + ' — ' + msg)
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

function countLines(filePath) {
  try { return fs.readFileSync(filePath, 'utf8').split('\n').length }
  catch (e) { return -1 }
}

// v0.87.75: три списка расширений —
//   KNOWN       = имеют правило лимита (getLimit() их знает)
//   IGNORED     = бинарники/доки — пропускаем молча, НЕ считаем за нарушение
//   (всё остальное) → UNKNOWN → тест падает с инструкцией
var KNOWN_EXT = [
  '.jsx', '.tsx',                             // React-компоненты
  '.js', '.ts', '.mjs', '.cts', '.mts',       // JS / TypeScript / ESM
  '.cjs',                                     // CommonJS (preloads)
  '.html',                                    // инлайн-страницы BrowserWindow
  '.css', '.scss',                            // стили
  '.json',                                    // конфиги (spamPatterns и т.п.)
]
var IGNORED_EXT = [
  '.md', '.txt', '.yml', '.yaml',             // документация/конфиги
  '.svg', '.png', '.jpg', '.jpeg', '.gif',    // изображения
  '.ico', '.webp', '.bmp',                    // изображения
  '.woff', '.woff2', '.ttf', '.otf', '.eot',  // шрифты
  '.mp3', '.mp4', '.webm', '.wav', '.ogg',    // медиа
  '.pem', '.crt', '.key',                     // ключи
  '.map',                                     // source maps
  '.gitkeep',                                 // маркеры пустых директорий
]

function getExt(name) {
  var i = name.lastIndexOf('.')
  return i < 0 ? '' : name.substring(i).toLowerCase()
}

// Собираем файлы из src/ и main/. Возвращаем { known, unknown }.
// known — попадут в size test; unknown — упадёт "тест неизвестных расширений".
function walk(dir, acc) {
  acc = acc || { known: [], unknown: [] }
  var entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return acc }
  entries.forEach(function (e) {
    var full = path.join(dir, e.name).replace(/\\/g, '/')
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__snapshots__') return
      walk(full, acc)
    } else {
      var ext = getExt(e.name)
      if (IGNORED_EXT.indexOf(ext) >= 0) return
      if (KNOWN_EXT.indexOf(ext) >= 0) acc.known.push(full)
      else acc.unknown.push(full + '  (расширение "' + ext + '")')
    }
  })
  return acc
}

// Известные исключения: файлы с индивидуальным (повышенным) потолком
// Текущий снапшот в .memory-bank/code-limits-status.md
// Рекомендации по разбиению в .memory-bank/handoff-code-limits.md
// v0.89.34: KNOWN_EXCEPTIONS вынесены в fileSizeLimitsExceptions.cjs
// (~65 строк ушло, файл был 345/400). Логика тестов сохранена.
var KNOWN_EXCEPTIONS = require('./fileSizeLimitsExceptions.cjs')

// v0.87.75: все типы файлов покрыты правилами. Если появится что-то новое
// (например, файл в новой папке с неожиданным расширением) — тест упадёт
// через проверку "unknown extensions" или "нет правила для файла".

// Универсальные предикаты
var isReactFile = function (p) { return /\.(jsx|tsx)$/.test(p) }
// "JS-like" = код на JS/TS/ESM. Исключая .cjs, .jsx/.tsx (у них свои правила).
var isJsLike   = function (p) { return /\.(js|ts|mjs|cts|mts)$/.test(p) }

function getLimit(p) {
  // ── 1. Тесты (.test.* / .vitest.*) — строгие, но крупнее обычных утилит
  if (p.includes('/__tests__/') || /\.(test|vitest)\.(js|ts|jsx|tsx|cjs|mjs)$/.test(p)) {
    return { limit: 400, kind: 'тест' }
  }

  // ── 2. React-компоненты (.jsx / .tsx)
  if (isReactFile(p)) {
    if (p.includes('src/components/')) return { limit: 700, kind: 'component .jsx/.tsx' }
    return { limit: 600, kind: '.jsx/.tsx' }
  }

  // ── 3. Preload CommonJS (.cjs) — скрипты в WebView
  if (p.endsWith('.cjs') && p.includes('main/preloads/')) {
    return { limit: 600, kind: 'preload .cjs' }
  }
  // Fallback для .cjs вне preloads (обычно нет, но чтобы не было дыры)
  if (p.endsWith('.cjs')) {
    return { limit: 400, kind: 'other .cjs' }
  }

  // ── 4. JS/TS/ESM — по папке
  if (isJsLike(p)) {
    // Preload hooks (инъекции в WebView)
    if (p.includes('main/preloads/hooks/')) {
      return { limit: 300, kind: 'preload hook .js/.ts' }
    }
    // React hooks (реально маленькие)
    if (p.includes('/hooks/')) {
      return { limit: 150, kind: 'React hook .js/.ts' }
    }
    // Крупные интеграции
    if (
      p.includes('main/handlers/') ||
      p.includes('main/native/') ||
      p.includes('src/native/store/') ||
      p.includes('src/native/utils/') ||
      p.includes('main/preloads/utils/')
    ) {
      return { limit: 500, kind: 'integration .js/.ts' }
    }
    // Корневой main
    if (p === 'main/main.js' || p === 'main/main.ts') {
      return { limit: 600, kind: 'main .js/.ts' }
    }
    // Обычные утилиты
    return { limit: 300, kind: 'utility .js/.ts' }
  }

  // ── 5. HTML (инлайн-страницы BrowserWindow в main/)
  if (p.endsWith('.html')) {
    return { limit: 800, kind: 'HTML' }
  }

  // ── 6. CSS / SCSS (стили)
  if (/\.(css|scss)$/.test(p)) {
    return { limit: 800, kind: 'CSS/SCSS' }
  }

  // ── 7. JSON (конфиги spamPatterns и т.п.)
  if (p.endsWith('.json')) {
    return { limit: 500, kind: 'JSON конфиг' }
  }

  return null
}

console.log('\n🧪 Автоматическая проверка лимитов файлов (v0.87.75)\n')

// v0.87.75: walk() теперь возвращает {known, unknown}. Пустой IGNORED_EXT — пропущен.
// Сканируем src/, main/ и shared/ (последняя — общие конфиги типа spamPatterns.json).
var srcScan = walk('src')
var mainScan = walk('main')
var sharedScan = walk('shared')
var allFiles = srcScan.known.concat(mainScan.known).concat(sharedScan.known)
var unknownExtFiles = srcScan.unknown.concat(mainScan.unknown).concat(sharedScan.unknown)
console.log('   Найдено файлов: ' + allFiles.length + '\n')

// Сортируем по типу для читаемости
var buckets = {}
allFiles.forEach(function (f) {
  var info = getLimit(f)
  if (!info) return
  if (!buckets[info.kind]) buckets[info.kind] = []
  buckets[info.kind].push({ path: f, limit: info.limit })
})

Object.keys(buckets).sort().forEach(function (kind) {
  console.log('── ' + kind + ' (лимит ' + buckets[kind][0].limit + ' строк): ──')
  buckets[kind].forEach(function (f) {
    var lines = countLines(f.path)
    var exception = KNOWN_EXCEPTIONS[f.path]
    var effectiveLimit = exception ? exception.ceiling : f.limit
    var warnThreshold = Math.floor(f.limit * 0.8)

    if (lines < 0) return // файл не найден — пропускаем

    var label = f.path + ' (' + lines + ' стр., лимит ' + effectiveLimit
    if (exception) label += ' — исключение'
    label += ')'

    test(label, function () {
      assert(lines <= effectiveLimit,
        lines + ' > ' + effectiveLimit + ' — РАЗБИТЬ! См. .memory-bank/handoff-code-limits.md')
    })

    // Жёлтое предупреждение при 80%+ от базового лимита (даже для исключений)
    if (lines >= warnThreshold && lines <= effectiveLimit && !exception) {
      warn(f.path, lines + ' строк — ' + Math.round(lines * 100 / f.limit) + '% от лимита ' + f.limit + '. Подумай о разбиении СКОРО.')
    }
  })
  console.log('')
})

// ── v0.87.75: железная защита от «тихих» дыр ──
// (A) Все кодовые файлы имеют правило лимита.
// (B) KNOWN_EXCEPTIONS не содержат устаревших записей.
// (C) Нет файлов с совсем неизвестным расширением (.vue/.svelte/.toml и т.п.).
// Любое нарушение → тест падает с инструкцией.
console.log('── Железная защита от дыр (v0.87.75): ──')

// (A) Файлы в KNOWN_EXT, но без правила в getLimit()
var uncovered = []
allFiles.forEach(function (f) {
  if (!getLimit(f)) uncovered.push(f)
})
test('(A) Все файлы покрыты правилом лимита в getLimit()', function () {
  assert(uncovered.length === 0,
    uncovered.length + ' файлов без правила:\n    ' + uncovered.join('\n    ') +
    '\n  → добавь правило в getLimit() в src/__tests__/fileSizeLimits.test.cjs')
})

// (B) Исключения для уже несуществующих файлов
var staleExceptions = []
Object.keys(KNOWN_EXCEPTIONS).forEach(function (p) {
  if (!fs.existsSync(p)) staleExceptions.push(p)
})
test('(B) KNOWN_EXCEPTIONS не содержат несуществующих файлов', function () {
  assert(staleExceptions.length === 0,
    'В KNOWN_EXCEPTIONS есть устаревшие записи:\n    ' + staleExceptions.join('\n    ') +
    '\n  → удали эти записи из fileSizeLimits.test.cjs')
})

// (C) Файлы в src/ и main/ с расширением вне KNOWN_EXT и IGNORED_EXT
test('(C) Нет файлов с неизвестными расширениями в src/ и main/', function () {
  assert(unknownExtFiles.length === 0,
    unknownExtFiles.length + ' файлов с неизвестным расширением:\n    ' + unknownExtFiles.join('\n    ') +
    '\n  → либо добавь расширение в KNOWN_EXT (и правило в getLimit()),\n' +
    '    либо в IGNORED_EXT (если это бинарник/документ).\n' +
    '    Оба списка — в src/__tests__/fileSizeLimits.test.cjs')
})
console.log('')

// ── Общая статистика ──
console.log('── Статистика: ──')
var totalSrc = 0
var srcFiles = allFiles.filter(function (f) { return f.startsWith('src/') && !/\.(test|vitest)\./.test(f) })
srcFiles.forEach(function (f) { totalSrc += countLines(f) })
// v1.2.0-alpha.1 (Этап 1 AI Bridge): лимит 26400 → 27200 — aiBridge/contracts.js (~95 строк) +
//   aiWebviewConfigs.js (~140 строк) + запас на Этапы 2-3 (Local Bridge, API Bridge wrapper ~200-300 строк).
//   На Этапах 7-8 (UI AIBridgePanel + Selectors Config) лимит снова поднимется.
// v1.1.5: лимит 26200 → 26400 — aiWebviewDiagnostics (~150 строк) + расширение в aiWebviewContext.js (diag injection).
// v1.1.2: лимит 26000 → 26200 — master switch UI в AIAutoReplyRules + actor color helpers в AIActivityDashboard.
// v1.1.0 (Phase 4.3): лимит 25600 → 26000 — AIAutoReplyRules компонент (~280 строк) + autoReplyRulesStore + интеграция.
// v1.0.7: лимит 25400 → 25600 — bulk select UI в TasksPanel + snooze кнопки в RemindersPanel.
// v1.0.1: лимит 25200 → 26400 — useAppCounters hook + PanelModal обёртка + 3 кнопки в TabBar + 3 state/handler в App.jsx (Phase 4 UI интеграция).
// v1.0.0 (Phase 4): лимит 24400 → 25200 — Tasks store + IPC + UI, Reminders store +
// scheduler + UI, AI Activity Dashboard, 3 новых tools (create_task / list_tasks /
// schedule_reminder), changelog data растёт.
// v0.99.0 (Phase 3): был 24400.
// v0.98.0 (Phase 2): был 24000.
// v0.97.0 (Phase 0+1): был 23300.
// Дальнейшее разбиение — плановая задача (handoff-code-limits.md).
// v1.2.5: лимит 28000 → 29500 — ModelSelector (~110) + TypewriterText (~75) +
// AutoReplyChart (~150) + autoReplyStats (~85) + rulesImportExport (~135) + UI
// расширения в AIAutoReplyRules/AIActivityDashboard/AiBridgeCheck/AISidebarAgent
// (~150 суммарно). Запас на следующие UX мини-фичи.
// v1.2.20: лимит 29800 → 30400 — Фаза 0 миграции на WebContentsView: восстановлен
// v1.2.31: 30750 -> 30850 for saved diagnostics report reload; App.jsx stays under 960.
// v1.2.38: 30850 -> 31050 for diagnosticsTargets.js: isolated target selection for VK/MAX/TG/WA/API reports.
// renderer-модуль webContentsViewBridge.js (~168 стр., изолированный мост renderer↔main,
// пока НЕ подключён в живой путь). Запас ~300 строк на Фазы 1-2 (WebContentsViewSlot и т.п.).
// v1.2.11: лимит 29600 → 29800 — накопленная работа над уведомлениями MAX
// (sender-aware identity, диагностика, dedup scope) перевалила агрегат на пару строк;
// каждый отдельный файл в пределах своего лимита. Восстановлен запас ~200 строк.
// v1.2.8: лимит 29500 → 29600 — sender-aware identity для MAX ribbon:
// cache avatar по sender/chat, dedup scope и IPC fallback guard.
// v1.1.16: лимит 27200 → 28000 — useAiWebviewBridge + AiBridgeCheck + ...
// v1.2.66: 31050 → 31150 — альбомы в уведомлениях (механизм «живая карточка»):
// listener notify:open-album в useAppIPCListeners.js + метка album в nativeStoreIpc.js.
// Прежний таймер-буфер albumNotifyBuffer.js удалён (логика живой карточки — в main/
// notification*.js, вне renderer-бюджета). Запас ~70 строк.
test('Общий renderer код (src/ без тестов) < 31150 строк (сейчас ' + totalSrc + ')', function () {
  assert(totalSrc < 31150, totalSrc + ' > 31150')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (warnings > 0) {
  console.log('⚠️  Предупреждений (80%+ лимита): ' + warnings + ' — начинай планировать разбиение')
}
if (failed > 0) process.exit(1)
