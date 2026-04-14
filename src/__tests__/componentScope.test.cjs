/**
 * v0.83.4: Тест scope компонентов — ловит undefined переменные в JSX
 * Проверяет ВСЕ компоненты проекта автоматически.
 * Ловит: aiApiKey is not defined, StepRow is not defined, isGigaChat is not defined
 *
 * Запуск: node src/__tests__/componentScope.test.js
 */

const fs = require('fs')
const path = require('path')
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🧪 Тесты scope компонентов\n')

// Стандартные JS/React идентификаторы + CSS-in-JSX + DOM methods
const SAFE = new Set([
  // JS builtins
  'if','for','while','switch','catch','return','typeof','new','throw','await','function','import','export',
  'class','extends','super','this','console','window','document','setTimeout','clearTimeout','setInterval',
  'clearInterval','Date','Math','JSON','Object','Array','String','Number','Promise','Map','Set','Error',
  'RegExp','parseInt','parseFloat','isNaN','encodeURIComponent','require','React','ReactDOM','createElement',
  'useState','useEffect','useRef','useCallback','useMemo','true','false','null','undefined','navigator',
  'location','fetch','Image','Audio','Event','MutationObserver','requestAnimationFrame','getComputedStyle',
  'performance','crypto','atob','btoa','AbortController','URL','Proxy','Symbol','WeakMap','WeakSet',
  // Array/String/Object methods
  'map','replace','trim','slice','includes','join','find','filter','forEach','test','match','keys','values',
  'entries','stringify','parse','abs','min','max','round','floor','ceil','log','error','warn','invoke','open',
  'concat','reduce','some','every','bind','call','apply','resolve','reject','then','catch','finally','split',
  'indexOf','startsWith','endsWith','substr','substring','toFixed','toLowerCase','toUpperCase','assign',
  'freeze','create','push','pop','shift','unshift','splice','sort','reverse','from','isArray','now','toString',
  'valueOf','hasOwnProperty','charAt','charCodeAt','fromCharCode','repeat','padStart','padEnd','flat','flatMap',
  // CSS/style keywords in JSX
  'var','rgba','calc','url','transparent','none','inherit','initial','auto','block','flex','grid','inline',
  'relative','absolute','fixed','sticky','hidden','visible','scroll','wrap','nowrap','column','row','center',
  'baseline','stretch','pointer','text','normal','bold','italic','solid','dashed','dotted','ease',
  // JSX internal (props of child components)
  'num','numDone','extra','children','key','ref','style','className','onClick','onChange','onSubmit',
  'onKeyDown','onKeyUp','onFocus','onBlur','onMouseEnter','onMouseLeave','onInput','disabled','checked',
  'value','placeholder','type','name','href','src','alt','title','id','role','tabIndex','htmlFor','target',
  'rel','width','height','maxLength','rows','cols','readOnly','autoFocus','required','multiple','accept',
  'draggable','contentEditable','spellCheck','dir','lang',
  // Common React patterns
  'prev','item','idx','index','acc','val','res','result','data','msg','info','cfg','opts','args','params',
  'err','cb','fn','el','ev','txt','cls','sel','btn','img','ctx','ref','cur','tmp','buf','len','pos',
  'cnt','str','obj','arr','num','max','min','sum','avg','opt','tag','key','end','src','url','mid',
])

function checkComponent(filePath, componentName) {
  const code = fs.readFileSync(filePath, 'utf8')

  // Props
  const propsMatch = code.match(new RegExp('function\\s+' + componentName + '\\s*\\(\\s*\\{([^}]+)\\}'))
  const props = propsMatch ? propsMatch[1].split(',').map(p => p.trim().split('=')[0].trim()).filter(Boolean) : []

  // Imports
  const imports = []
  for (const m of code.matchAll(/import\s*\{([^}]+)\}\s*from/g)) imports.push(...m[1].split(',').map(s => { const parts = s.trim().split(/\s+as\s+/); return parts[parts.length - 1].trim() }))
  for (const m of code.matchAll(/import\s+(\w+)\s+from/g)) imports.push(m[1])

  // Local definitions
  const locals = []
  for (const m of code.matchAll(/(?:const|let|var|function)\s+(\w+)/g)) locals.push(m[1])
  // useState destructuring: const [x, setX] = useState()
  for (const m of code.matchAll(/const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]/g)) { locals.push(m[1]); locals.push(m[2]) }
  // Callback params: (e) =>, (item, idx) =>, ({x, y}) =>
  for (const m of code.matchAll(/\((\w+)\)\s*=>/g)) locals.push(m[1])
  for (const m of code.matchAll(/\((\w+),\s*(\w+)\)\s*=>/g)) { locals.push(m[1]); locals.push(m[2]) }
  // ctx object destructuring in props: { ctx } or ctx.field
  for (const m of code.matchAll(/\(\s*\{([^}]+)\}\s*\)/g)) {
    m[1].split(',').forEach(p => { const n = p.trim().split('=')[0].trim(); if (n) locals.push(n) })
  }

  const defined = new Set([...props, ...imports, ...locals])

  // Find ALL references
  const refs = new Set()
  for (const m of code.matchAll(/(?:^|[^.\w])(\b[a-zA-Z_]\w*)\s*\(/gm)) refs.add(m[1])
  for (const m of code.matchAll(/\{(\b[a-zA-Z_]\w*)\s*(?:&&|\|\||\?|\.)/gm)) refs.add(m[1])
  for (const m of code.matchAll(/=\{(\b[a-zA-Z_]\w*)\}/gm)) refs.add(m[1])
  for (const m of code.matchAll(/=\{(\b[a-zA-Z_]\w*)\s/gm)) refs.add(m[1])

  // Дополнительные safe: async, await, стилевые
  const extraSafe = new Set(['async','await','scale','gradient','translateX','translateY','translate','rotate','steps','entry','tab','tooltip','description','label','cat','preset','color','personal','enrichment'])
  const undefined_refs = [...refs].filter(r => !defined.has(r) && !SAFE.has(r) && !extraSafe.has(r) && r.length > 2 && /^[a-z]/.test(r))
  return { props, imports, locals, undefined: undefined_refs }
}

// ══════════════════════════════════════════════════════════════
// Проверяем ВСЕ компоненты
// ══════════════════════════════════════════════════════════════

const components = [
  { file: 'src/components/AIConfigPanel.jsx', name: 'AIConfigPanel' },
  { file: 'src/components/AISidebar.jsx', name: 'AISidebar' },
  { file: 'src/components/AddMessengerModal.jsx', name: 'AddMessengerModal' },
  { file: 'src/components/AutoReplyPanel.jsx', name: 'AutoReplyPanel' },
  { file: 'src/components/MessengerTab.jsx', name: 'MessengerTab' },
  { file: 'src/components/NotifLogModal.jsx', name: 'NotifLogModal' },
  { file: 'src/components/SettingsPanel.jsx', name: 'SettingsPanel' },
  { file: 'src/components/TemplatesPanel.jsx', name: 'TemplatesPanel' },
  { file: 'src/App.jsx', name: 'App' },
]

// Допустимые переменные (приходят через ctx prop, destructuring, или createWebviewSetup)
const ALLOWED = {
  NotifLogModal: ['setNotifLogModal','setNotifLogTab','handleTabContextAction_diag','traceNotif','handleNewMessage','setTraceFilter','setCellTooltip','setSettings','notifLogModal','webviewRefs','pipelineTraceRef'],
  App: ['traceNotif','setWebviewRef','handleNewMessage','notifCountRef','recentNotifsRef','lastRibbonTsRef','lastSoundTsRef','notifSenderTsRef','notifMidTsRef','pendingMarkReadsRef','senderCacheRef','pendingMsgRef','pipelineTraceRef','notifDedupRef',
    // v0.85.0: из custom hooks (destructured returns)
    'setContextMenuTab','dragOverId','contextMenuTab','handleTabClick','handleDragStart','handleDragOver','handleDrop','handleDragEnd','handleSearch','handleTabContextAction','changeZoom','totalUnread','startResize','toggleSearch','searchText','searchVisible','animateZoom','saveZoomLevels','applyZoom','handleTabContextAction_diag','togglePinTab','totalPersonalWithFallback','totalChannels',
    // v0.86.7: useWebViewLifecycle hook
    'lifecycle'],
}

for (const comp of components) {
  if (!fs.existsSync(comp.file)) continue
  console.log('── ' + comp.name + ': ──')
  const result = checkComponent(comp.file, comp.name)
  const allowed = ALLOWED[comp.name] || []
  const real_undefined = result.undefined.filter(v => !allowed.includes(v))
  test(comp.name + ': нет undefined переменных', () => {
    assert(real_undefined.length === 0, 'UNDEFINED: ' + real_undefined.join(', '))
  })
}

// ═══════════════════════════════════════════════════════════════
// Тест: window.api ВСЕГДА с optional chaining (React 19 compat)
// ═══════════════════════════════════════════════════════════════
console.log('\n── window.api optional chaining: ──')
var jsxFiles = ['src/App.jsx', 'src/utils/webviewSetup.js']
for (var fi = 0; fi < jsxFiles.length; fi++) {
  var f = jsxFiles[fi]
  if (!fs.existsSync(f)) continue
  var fCode = fs.readFileSync(f, 'utf8')
  var unsafeMatches = fCode.match(/window\.api\.(invoke|send|on)\b/g) || []
  test(path.basename(f) + ': нет window.api. без ?. (React 19)', function() {
    assert(unsafeMatches.length === 0, 'window.api. без optional chaining: ' + unsafeMatches.length)
  })
}

// ═══════════════════════════════════════════════════════════════
// Тест: НЕТ require() в ESM файлах (Electron 41 + Vite 7)
// ═══════════════════════════════════════════════════════════════
console.log('\n── ESM/CJS совместимость: ──')
var esmFiles = ['main/main.js', 'main/handlers/aiHandlers.js', 'main/handlers/notifHandlers.js', 'main/handlers/dockPinHandlers.js']
for (var ei = 0; ei < esmFiles.length; ei++) {
  var ef = esmFiles[ei]
  if (!fs.existsSync(ef)) continue
  var esmCode = fs.readFileSync(ef, 'utf8')
  var requireCalls = esmCode.match(/\brequire\s*\(/g) || []
  test(path.basename(ef) + ': нет require() в ESM файле', function() {
    assert(requireCalls.length === 0, 'require() в ESM: ' + requireCalls.length + ' вызовов')
  })
}

// Тест: ВСЕ компоненты используют window.api?.
console.log('\n── window.api optional chaining (ВСЕ файлы): ──')
var allJsxFiles = ['src/App.jsx', 'src/utils/webviewSetup.js', 'src/components/AISidebar.jsx', 'src/components/AIConfigPanel.jsx', 'src/components/SettingsPanel.jsx', 'src/components/NotifLogModal.jsx', 'src/components/TemplatesPanel.jsx', 'src/components/AutoReplyPanel.jsx']
for (var ai = 0; ai < allJsxFiles.length; ai++) {
  var af = allJsxFiles[ai]
  if (!fs.existsSync(af)) continue
  var afCode = fs.readFileSync(af, 'utf8')
  var unsafeApi = afCode.match(/window\.api\.(invoke|send|on)\b/g) || []
  test(path.basename(af) + ': window.api?.', function() {
    assert(unsafeApi.length === 0, unsafeApi.length + ' вызовов без ?.')
  })
}

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
