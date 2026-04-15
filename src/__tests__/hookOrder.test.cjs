// v0.87.6: Статический анализ хуков — проверяет что useState/useRef/useEffect/useCallback/useMemo
// объявлены ВЫШЕ первого использования переменной. Ловит баг "Cannot access X before initialization".
// Не перехватывает все случаи (runtime проверка нужна), но типичный hoisting fail ловит.

const fs = require('fs')
const path = require('path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Hook order (useState/useRef ДО использования)\\n')

function collectJsxFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectJsxFiles(p))
    else if (entry.isFile() && /\.(jsx|js)$/.test(entry.name) && !p.includes('__tests__')) out.push(p)
  }
  return out
}

const files = [
  ...collectJsxFiles('src/components'),
  ...collectJsxFiles('src/native'),
  ...collectJsxFiles('src/hooks'),
  'src/App.jsx',
].filter(p => fs.existsSync(p))

const HOOK_DECL_RE = /const\s+\[?(\w+)(?:\s*,\s*set\w+)?\]?\s*=\s*use(?:State|Ref|Memo|Callback|Reducer)\s*\(/g

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8')
  const name = path.basename(file)
  // Найти все хук-переменные и их позиции
  const decls = []  // { name, idx }
  let m
  while ((m = HOOK_DECL_RE.exec(code)) !== null) {
    decls.push({ name: m[1], idx: m.index })
  }
  if (decls.length === 0) continue

  // Для каждой — проверить что первое использование идёт ПОСЛЕ объявления
  for (const { name: varName, idx: declIdx } of decls) {
    // Ищем использование: имя переменной не как часть другого слова
    // Смотрим ДО declIdx
    const before = code.slice(0, declIdx)
    const useRe = new RegExp('(?<![\\w.])' + varName + '(?![\\w.])', 'g')
    // Убираем комментарии и строки (грубо)
    const stripped = before
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/`[^`]*`/g, '""')
      .replace(/'[^']*'/g, '""')
      .replace(/"[^"]*"/g, '""')
    if (useRe.test(stripped)) {
      test(`${name}: ${varName} используется ДО useState/useRef`, () => {
        throw new Error(`переменная "${varName}" используется до объявления useState/useRef — React сломается (Cannot access before initialization)`)
      })
    }
  }
}

if (passed + failed === 0) console.log('  ✅ Все хуки объявлены в правильном порядке')

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
