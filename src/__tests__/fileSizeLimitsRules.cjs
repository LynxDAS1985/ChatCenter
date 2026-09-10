// fileSizeLimitsRules.cjs — v1.2.442
//
// ПРАВИЛА лимитов размера файлов и обход папок. Вынесено из fileSizeLimits.test.cjs,
// который упёрся в собственный потолок 399/400 строк — из-за этого нельзя было дописать
// ни новое правило, ни обоснование к бюджету (в v1.2.440-441 обоснования приходилось
// дописывать в КОНЕЦ существующей строки, что делало её нечитаемой).
//
// Здесь ТОЛЬКО чистые функции, без запуска проверок: их можно вызывать и из других тестов.
//   countLines(путь)  — сколько строк в файле (-1 если файла нет)
//   getExt(имя)       — расширение в нижнем регистре
//   walk(папка)       — обход: { known: [...], unknown: [...] }
//   getLimit(путь)    — { limit, kind } или null, если правила нет
//   KNOWN_EXT / IGNORED_EXT — списки расширений (третий случай = UNKNOWN → тест падает)
//
// Сами проверки и исключения остались в fileSizeLimits.test.cjs.

var fs = require('fs')
var path = require('path')

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

module.exports = { countLines: countLines, getExt: getExt, walk: walk, getLimit: getLimit, KNOWN_EXT: KNOWN_EXT, IGNORED_EXT: IGNORED_EXT }
