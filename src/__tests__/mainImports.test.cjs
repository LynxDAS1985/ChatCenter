// v0.87.25: Проверка named imports из CommonJS-модулей (НЕ electron — он работает через спец. runtime).
// Ловит ошибки типа "Named export 'Helpers' not found. The requested module 'telegram' is a CommonJS module".
// Статически парсит main/** на import { X, Y } from 'pkg' и сверяет с real package.exports.

const fs = require('node:fs')
const path = require('node:path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Проверка named imports из CommonJS пакетов\n')

// Пакеты которые ПРОВЕРЯЕМ (electron исключён — работает по-особому)
const CHECK_PKGS = ['telegram', 'baileys', 'vk-io', 'input']

function walk(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walk(full))
    else if (entry.isFile() && /\.(js|cjs|mjs)$/.test(entry.name) && !entry.name.includes('.test.')) results.push(full)
  }
  return results
}

const files = walk('main')
const IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8')
  let m
  while ((m = IMPORT_RE.exec(code)) !== null) {
    const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
    const pkg = m[2]
    const rootPkg = pkg.split('/')[0]
    if (!CHECK_PKGS.includes(rootPkg)) continue
    // Проверяем доступность каждого named export через require
    let realModule
    try { realModule = require(pkg) } catch (e) {
      test(`${path.basename(file)}: require('${pkg}')`, () => { throw new Error('пакет не найден: ' + e.message) })
      continue
    }
    for (const name of names) {
      test(`${path.basename(file)}: import { ${name} } from '${pkg}'`, () => {
        assert(name in realModule || (realModule.default && name in realModule.default),
          `"${name}" не найден в export'ах '${pkg}'. Использовать default import или другой путь.`)
      })
    }
  }
}

if (passed + failed === 0) console.log('  (нет импортов для проверки)')
console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
