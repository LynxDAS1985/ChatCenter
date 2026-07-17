// v1.2.70: тест окна-подсказки задачи (Вариант 4).
// Проверяет, что подсказка сделана ОТДЕЛЬНЫМ переиспользуемым «сквозным» окном
// (не ресайзит док → нет петли дёрга), с задержкой наведения и корректной сборкой.
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let ok = 0, fail = 0
function check(name, cond) {
  if (cond) { ok++; console.log('  ✅ ' + name) }
  else { fail++; console.log('  ❌ ' + name) }
}

console.log('\n🧪 Тест окна-подсказки задачи (pin-tooltip, v1.2.70)\n')

// ── Файлы окна ──
console.log('── Файлы: ──')
const htmlExists = fs.existsSync(path.join(root, 'main/pin-tooltip.html'))
check('main/pin-tooltip.html существует', htmlExists)
const preloadExists = fs.existsSync(path.join(root, 'main/preloads/pin-tooltip.preload.cjs'))
check('main/preloads/pin-tooltip.preload.cjs существует', preloadExists)

const html = htmlExists ? read('main/pin-tooltip.html') : ''
const preload = preloadExists ? read('main/preloads/pin-tooltip.preload.cjs') : ''
const utils = read('main/handlers/dockPinUtils.js')
const state = read('main/handlers/dockPinState.js')
const handlers = read('main/handlers/dockPinHandlers.js')
const dockPreload = read('main/preloads/pin-dock.preload.cjs')
const dockJs = read('main/pin-dock.js')
const viteCfg = read('electron.vite.config.js')

// ── HTML: Вариант 4 (категория + заметка) ──
console.log('\n── HTML (Вариант 4): ──')
check('карточка .tt-card', html.includes('tt-card'))
check('плашка категории .tt-cat (urgent/work/later)', html.includes('tt-cat') && html.includes('urgent') && html.includes('work') && html.includes('later'))
check('заметка .tt-note', html.includes('tt-note'))
check('подписка на данные tooltipApi.onData', html.includes('tooltipApi.onData'))
check('сообщает размер tooltipApi.resize', html.includes('tooltipApi.resize'))
check('картинка без текста → «Фото»', html.includes('Фото'))

// ── Preload API ──
console.log('\n── Preload: ──')
check('экспортирует tooltipApi', preload.includes("exposeInMainWorld('tooltipApi'"))
check('tooltipApi.onData → tooltip:data', preload.includes('tooltip:data'))
check('tooltipApi.resize → tooltip:resize', preload.includes('tooltip:resize'))

// ── Окно «сквозное» и переиспользуемое ──
console.log('\n── Окно (сквозное/лёгкое): ──')
check('createTooltipBrowserWindow есть', utils.includes('createTooltipBrowserWindow'))
check('focusable: false (не крадёт фокус)', /createTooltipBrowserWindow[\s\S]*focusable:\s*false/.test(utils))
check('setIgnoreMouseEvents(true) — не ловит мышь', /createTooltipBrowserWindow[\s\S]*setIgnoreMouseEvents\(true\)/.test(utils))
check('окно создаётся за экраном (x:-32000)', /createTooltipBrowserWindow[\s\S]*-32000/.test(utils))

// ── State: показ/скрытие/позиция ──
console.log('\n── State: ──')
check('tooltipState (одно окно)', state.includes('tooltipState'))
check('showTooltip', state.includes('function showTooltip'))
check('hideTooltip', state.includes('function hideTooltip'))
check('positionTooltipAndShow (позиция НАД вкладкой)', state.includes('function positionTooltipAndShow'))
check('показ без кражи фокуса showInactive', state.includes('showInactive'))
check('скрытие через safeHideTransparentWindow', /hideTooltip[\s\S]*safeHideTransparentWindow/.test(state))

// ── IPC handlers ──
console.log('\n── IPC: ──')
check("dock:tooltip-show зарегистрирован", handlers.includes("ipcMain.on('dock:tooltip-show'"))
check("dock:tooltip-hide зарегистрирован", handlers.includes("ipcMain.on('dock:tooltip-hide'"))
check("tooltip:resize зарегистрирован", handlers.includes("ipcMain.on('tooltip:resize'"))

// ── Preload дока: методы ──
console.log('\n── Dock preload: ──')
check('dockApi.showTooltip', dockPreload.includes('showTooltip') && dockPreload.includes('dock:tooltip-show'))
check('dockApi.hideTooltip', dockPreload.includes('hideTooltip') && dockPreload.includes('dock:tooltip-hide'))

// ── pin-dock.js: наведение с задержкой ──
console.log('\n── Наведение (задержка ~0.4с): ──')
check('mouseenter с задержкой 400мс', /mouseenter[\s\S]*setTimeout[\s\S]*400/.test(dockJs))
check('передаёт прямоугольник вкладки (getBoundingClientRect)', dockJs.includes('getBoundingClientRect') && dockJs.includes('showTooltip'))
check('mouseleave → hideTooltip', /mouseleave[\s\S]*hideTooltip/.test(dockJs))

// ── Нет ресайза дока на наведение (нет старого requestPreviewSpace-роста) ──
console.log('\n── Анти-дёрг: ──')
check('showPreview удалён (не растит окно дока на hover)', !dockJs.includes('function showPreview'))
check('диагностический лог [dock-bounds] убран', !handlers.includes('dock-bounds'))

// ── Сборка (prod) ──
console.log('\n── Сборка: ──')
check('копирование pin-tooltip.html в out/', viteCfg.includes('pin-tooltip.html'))
check("preload-entry 'pin-tooltip'", viteCfg.includes("'pin-tooltip'"))

console.log('\n📊 Результат: ' + ok + ' ✅ / ' + fail + ' ❌ из ' + (ok + fail))
if (fail > 0) process.exit(1)
