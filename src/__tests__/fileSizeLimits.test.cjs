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

// Собираем все .jsx / .js / .cjs из src/ и main/ рекурсивно
function walk(dir, out) {
  out = out || []
  var entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return out }
  entries.forEach(function (e) {
    var full = path.join(dir, e.name).replace(/\\/g, '/')
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__snapshots__') return
      walk(full, out)
    } else if (/\.(jsx|js|cjs)$/.test(e.name)) {
      out.push(full)
    }
  })
  return out
}

// Известные исключения: файлы с индивидуальным (повышенным) потолком
// Текущий снапшот в .memory-bank/code-limits-status.md
// Рекомендации по разбиению в .memory-bank/handoff-code-limits.md
var KNOWN_EXCEPTIONS = {
  'main/native/telegramHandler.js': {
    ceiling: 1300,
    reason: 'Крупный файл интеграции Telegram. Запланировано разбиение на telegramAuth/Messages/Chats/Media.'
  },
  'src/native/modes/InboxMode.jsx': {
    ceiling: 800,
    reason: 'Экран чата. Запланировано разбиение на InboxMode + InboxMessageList + InboxHeader.'
  },
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
  }
}

// Определить лимит по пути файла
function getLimit(p) {
  // Тесты / snapshots
  if (p.includes('/__tests__/') || /\.(test|vitest)\.(js|jsx|cjs)$/.test(p)) {
    return { limit: 400, kind: 'тест' }
  }
  // preload .cjs
  if (p.endsWith('.cjs') && p.includes('main/preloads/')) {
    return { limit: 600, kind: 'preload .cjs' }
  }
  // JSX — по папкам
  if (p.endsWith('.jsx')) {
    if (p.includes('src/components/')) return { limit: 700, kind: 'component .jsx' }
    return { limit: 600, kind: '.jsx' }
  }
  // Preload hooks (НЕ React hooks, это скрипты-инъекции в WebView)
  if (p.endsWith('.js') && p.includes('main/preloads/hooks/')) {
    return { limit: 300, kind: 'preload hook .js' }
  }
  // React hooks — реально маленькие
  if (p.endsWith('.js') && p.includes('/hooks/')) {
    return { limit: 150, kind: 'React hook .js' }
  }
  // JS — крупные интеграции
  if (p.endsWith('.js') && (
    p.includes('main/handlers/') ||
    p.includes('main/native/') ||
    p.includes('src/native/store/') ||
    p.includes('src/native/utils/') ||
    p.includes('main/preloads/utils/')
  )) {
    return { limit: 500, kind: 'integration .js' }
  }
  // main/main.js — корневой
  if (p === 'main/main.js') {
    return { limit: 600, kind: 'main .js' }
  }
  // JS — обычные утилиты
  if (p.endsWith('.js')) {
    return { limit: 300, kind: 'utility .js' }
  }
  return null
}

console.log('\n🧪 Автоматическая проверка лимитов файлов кода (v0.87.68)\n')

var allFiles = walk('src', []).concat(walk('main', []))
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
