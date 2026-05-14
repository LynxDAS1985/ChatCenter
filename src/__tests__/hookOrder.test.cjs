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
    else if (entry.isFile() && /\.(jsx|js)$/.test(entry.name) && !p.includes('__tests__') && !p.includes('.vitest.')) out.push(p)
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

// v0.88.x: исправление ложноположительных срабатываний.
// Раньше тест проверял использование переменной от начала файла до строки useState —
// это ловило ПАРАМЕТРЫ helper-функций (`function helper(state, ...)`) и outer-scope
// объявления как "использование до useState". Эти переменные на самом деле в РАЗНЫХ
// scope'ах с React-хуком — Cannot access before initialization не возникает.
//
// Теперь проверка ограничена ENCLOSING функцией/компонентом, в которой объявлен хук:
// от ближайшего открытия функции (function/arrow) ВВЕРХ от строки useState до самой
// строки useState. Это точно соответствует React lexical scope.
function findEnclosingFunctionStart(code, idx) {
  // Ищем последнее открытие функции перед idx:
  //   `function NAME(`, `function (`, `function*(`, `=> {`, `) => {`, `() => `
  // Это не парсер AST, но покрывает 99% случаев в нашем коде.
  const re = /(function\s+\w+\s*\(|function\s*\(|=>\s*\{|=>\s*\()/g
  let lastIdx = 0
  let m
  while ((m = re.exec(code)) !== null && m.index < idx) {
    lastIdx = m.index
  }
  return lastIdx
}

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
  // ВНУТРИ той же функции (не в helper-функциях outer-scope).
  for (const { name: varName, idx: declIdx } of decls) {
    const funcStart = findEnclosingFunctionStart(code, declIdx)
    const localBefore = code.slice(funcStart, declIdx)
    const useRe = new RegExp('(?<![\\w.])' + varName + '(?![\\w.])', 'g')
    // Убираем комментарии и строки (грубо)
    const stripped = localBefore
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/`[^`]*`/g, '""')
      .replace(/'[^']*'/g, '""')
      .replace(/"[^"]*"/g, '""')
    if (useRe.test(stripped)) {
      test(`${name}: ${varName} используется ДО useState/useRef`, () => {
        throw new Error(`переменная "${varName}" используется до объявления useState/useRef в той же функции — React сломается (Cannot access before initialization)`)
      })
    }
  }
}

if (passed + failed === 0) console.log('  ✅ Все хуки объявлены в правильном порядке')

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
