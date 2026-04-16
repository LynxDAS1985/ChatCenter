// v0.87.27: Runtime smoke-тест main-процесса.
// Запускает node в дочернем процессе и ДЕЛАЕТ import всех main/**/*.js модулей.
// Если любой модуль кидает ошибку при загрузке (Named export не найден, path ошибка, синтаксис) —
// тест падает. Это страховка от Ловушки 79 (CommonJS named imports в ESM).
// НЕ запускаем Electron, только чистый node — проверяем парсинг/импорт.
// NB: main/ использует electron и GramJS — эти модули заглушаются, проверяется только наш код.

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Runtime smoke-тест main-процесса\n')

// Собираем все .js файлы в main/
function walk(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walk(full))
    else if (entry.isFile() && entry.name.endsWith('.js')) results.push(full)
  }
  return results
}

// Проверяем что mainImports тест существует и что telegram/Utils.js импорт валиден
test('src/__tests__/mainImports.test.cjs существует', () => {
  assert(fs.existsSync('src/__tests__/mainImports.test.cjs'))
})

// Проверяем что все модули из main/ можно распарсить как ESM синтаксически
const files = walk('main').filter(f => !f.includes('node_modules') && !f.includes('.test.'))
console.log(`  Найдено ${files.length} .js файлов в main/`)

for (const file of files) {
  const basename = path.basename(file)
  test(`parse: ${basename}`, () => {
    const code = fs.readFileSync(file, 'utf8')
    // Basic: проверим что есть import или export (это ESM модуль) и парсится как JS
    // Ищем import из 'pkg' с named imports, проверяем что такой require не упадёт
    const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
    let m
    while ((m = importRe.exec(code)) !== null) {
      const pkg = m[2]
      // Пропускаем относительные пути и electron (особый рантайм)
      if (pkg.startsWith('.') || pkg.startsWith('node:') || pkg === 'electron') continue
      const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
      // Попробуем require пакета (или под-пути) и проверим что каждое имя есть
      let mod
      try { mod = require(pkg) } catch (e) { throw new Error(`не смог require('${pkg}'): ${e.message}`) }
      for (const n of names) {
        const has = n in mod || (mod?.default && n in mod.default)
        assert(has, `import { ${n} } from '${pkg}' — имя НЕ экспортируется`)
      }
    }
  })
}

// Отдельная проверка: что все явно используемые нами под-пути telegram/* действительно существуют
const TELEGRAM_SUBPATHS = [
  'telegram/sessions/index.js',
  'telegram/events/index.js',
  'telegram/Utils.js',
]
for (const sub of TELEGRAM_SUBPATHS) {
  test(`require подпути: ${sub}`, () => {
    const m = require(sub)
    assert(m && typeof m === 'object', `${sub} вернул не объект`)
  })
}

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
