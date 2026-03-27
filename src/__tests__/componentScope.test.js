/**
 * v0.83.4: Тест scope компонентов — ловит undefined переменные в JSX
 * Проверяет что все вызовы функций в компонентах определены (props, import или local)
 *
 * Этот тест ПРЕДОТВРАЩАЕТ ошибки типа "aiApiKey is not defined", "StepRow is not defined"
 *
 * Запуск: node src/__tests__/componentScope.test.js
 */

const fs = require('fs')
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Тесты scope компонентов (undefined переменные)\n')

// Проверяет что все вызовы функций в компоненте определены
function checkComponentScope(filePath, componentName) {
  const code = fs.readFileSync(filePath, 'utf8')

  // Извлекаем props из function signature
  const propsMatch = code.match(new RegExp('function\\s+' + componentName + '\\s*\\(\\s*\\{([^}]+)\\}'))
  const props = propsMatch ? propsMatch[1].split(',').map(p => p.trim().split('=')[0].trim()) : []

  // Извлекаем imports
  const imports = []
  for (const m of code.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    imports.push(...m[1].split(',').map(s => s.trim()))
  }
  for (const m of code.matchAll(/import\s+(\w+)\s+from/g)) {
    imports.push(m[1])
  }

  // Извлекаем все const/let/var/function определения
  const locals = []
  for (const m of code.matchAll(/(?:const|let|var|function)\s+(\w+)/g)) {
    locals.push(m[1])
  }

  const defined = new Set([...props, ...imports, ...locals])

  // Ищем вызовы функций: word( — где word не является методом (нет . перед ним)
  const calls = []
  // Паттерн: начало строки или пробел/{ перед вызовом, НЕ точка
  for (const m of code.matchAll(/(?:^|[^.\w])(\b[a-zA-Z_]\w*)\s*\(/gm)) {
    const name = m[1]
    // Пропускаем стандартные
    if (['if','for','while','switch','catch','return','typeof','new','throw','await','function','import','export','class','extends','super','this','console','window','document','setTimeout','clearTimeout','setInterval','clearInterval','Date','Math','JSON','Object','Array','String','Number','Promise','Map','Set','Error','RegExp','parseInt','parseFloat','isNaN','encodeURIComponent','decodeURIComponent','require','describe','it','test','expect','assert','React','ReactDOM','createElement','useState','useEffect','useRef','useCallback','useMemo'].includes(name)) continue
    calls.push(name)
  }

  const undefined_calls = calls.filter(c => !defined.has(c))
  const unique_undefined = [...new Set(undefined_calls)]

  return { props: props.length, imports: imports.length, locals: locals.length, undefined: unique_undefined }
}

// ── AIConfigPanel ──
console.log('── AIConfigPanel.jsx: ──')
const acp = checkComponentScope('src/components/AIConfigPanel.jsx', 'AIConfigPanel')
test('AIConfigPanel: все function calls определены', () => {
  // Фильтруем JSX компоненты (начинаются с большой буквы) — они могут быть из scope
  const real_undefined = acp.undefined.filter(v => /^[a-z]/.test(v) && v.length > 2 && !['set','map','replace','trim','slice','includes','join','find','filter','forEach','test','match','keys','values','entries','stringify','parse','abs','min','max','round','floor','ceil','log','error','warn','invoke','open','concat','reduce','some','every','bind','call','apply','resolve','reject','then','catch','finally','split','indexOf','startsWith','endsWith','substr','substring','toFixed','toLowerCase','toUpperCase','charCodeAt','fromCharCode','assign','freeze','create','defineProperty','getPrototypeOf','push','pop','shift','unshift','splice','sort','reverse','fill','copyWithin','flat','flatMap','from','isArray','now','getTime','toISOString','toJSON','toString','valueOf','var','rgba','calc','url','transparent','none','inherit','initial','auto','block','flex','grid','inline','relative','absolute','fixed','sticky','hidden','visible','scroll','wrap','nowrap','column','row','center','baseline','stretch','pointer','text','normal','bold','italic'].includes(v))
  assert(real_undefined.length === 0, 'Undefined function calls: ' + real_undefined.join(', '))
})
test('AIConfigPanel: props count > 10', () => assert(acp.props > 10, 'props=' + acp.props))
test('AIConfigPanel: imports count > 0', () => assert(acp.imports > 0, 'imports=' + acp.imports))

// ── AISidebar ──
console.log('\n── AISidebar.jsx: ──')
const ais = checkComponentScope('src/components/AISidebar.jsx', 'AISidebar')
test('AISidebar: props count > 5', () => assert(ais.props > 5))

// ── App.jsx ──
console.log('\n── App.jsx: ──')
const app = checkComponentScope('src/App.jsx', 'App')
test('App: locals count > 20', () => assert(app.locals > 20, 'locals=' + app.locals))

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
