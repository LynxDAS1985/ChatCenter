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
var KNOWN_EXCEPTIONS = {
  'main/native/telegramHandler.js': {
    ceiling: 1300,
    reason: 'Крупный файл интеграции Telegram. Запланировано разбиение на telegramAuth/Messages/Chats/Media.'
  },
  // v0.87.83: InboxMode.jsx разбит на 4 файла (useReadByVisibility, useInboxScroll,
  // InboxMessageInput, InboxChatListSidebar) — теперь 566 строк, под стандартным лимитом 600.
  // Исключение удалено.
  'src/utils/webviewSetup.js': {
    ceiling: 600,
    reason: 'Исторически большая утилита настройки WebView (зум, сессии, partition). Разбиение low priority.'
  },
  'src/utils/messengerConfigs.js': {
    ceiling: 400,
    reason: 'Конфиги всех мессенджеров в одном файле. Специально держим вместе.'
  },
  'src/utils/consoleMessageHandler.js': {
    ceiling: 450,
    reason: 'Большой парсер console-message. Логически цельный.'
  },
  'main/handlers/dockPinHandlers.js': {
    ceiling: 600,
    reason: 'Исторически большой handler. Разбиение low priority.'
  },
  // v0.87.78: notification разбит на html/css/js. JS превышает default 300.
  'main/notification.js': {
    ceiling: 700,
    reason: 'Renderer-код для notification BrowserWindow. Извлечён из inline <script>. Разбиение на 2 модуля — low priority, файл логически цельный (DOM render + animations + IPC).'
  }
}

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
test('Общий renderer код (src/ без тестов) < 20000 строк (сейчас ' + totalSrc + ')', function () {
  assert(totalSrc < 20000, totalSrc + ' > 20000')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (warnings > 0) {
  console.log('⚠️  Предупреждений (80%+ лимита): ' + warnings + ' — начинай планировать разбиение')
}
if (failed > 0) process.exit(1)
