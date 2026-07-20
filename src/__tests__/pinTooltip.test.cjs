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
const notifHelpers = read('main/notification-helpers.js')
const nativeIpc = read('src/native/store/nativeStoreIpc.js')

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
// v1.2.73: перед замером окну возвращается нормальная ширина (иначе после
// safeHide карточка мерится в окне 1px → узкая высокая подсказка)
check('перед замером окну возвращается ширина (setBounds width:300 — не мерить в 1px)', /setBounds\(\{[^}]*width:\s*300/.test(state))

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
// v1.2.72: грация скрытия ~150мс (не мигает при переходе между вкладками)
check('скрытие с грацией ~150мс (mouseleave setTimeout 150)', /mouseleave[\s\S]{0,400}setTimeout[\s\S]{0,200}150/.test(dockJs))
check('возврат мыши отменяет скрытие (tooltipHideTimer)', dockJs.includes('tooltipHideTimer'))

// ── Нет ресайза дока на наведение (нет старого requestPreviewSpace-роста) ──
console.log('\n── Анти-дёрг: ──')
check('showPreview удалён (не растит окно дока на hover)', !dockJs.includes('function showPreview'))
check('диагностический лог [dock-bounds] убран', !handlers.includes('dock-bounds'))

// ── v1.2.71: показ повторно (не «один раз») + чистка мёртвого кода ──
console.log('\n── Повторный показ + чистка: ──')
check('backgroundThrottling:false (rAF/таймеры живут у скрытого окна)', /createTooltipBrowserWindow[\s\S]*backgroundThrottling:\s*false/.test(utils))
check('размер сообщается БЕЗ requestAnimationFrame-вызова (прямой вызов)', !html.includes('requestAnimationFrame('))
check('мёртвый обработчик dock:preview-space удалён', !handlers.includes("ipcMain.on('dock:preview-space'"))
check('мёртвый requestPreviewSpace удалён из preload дока', !dockPreload.includes('requestPreviewSpace'))

// ── v1.2.75: источник «Telegram» + аватар отправителя ──
console.log('\n── v1.2.75 источник + аватар: ──')
check('подсказка: элемент аватара (.tt-av)', html.includes('tt-av'))
check('подсказка: рендерит аватар из d.icon', html.includes('d.icon'))
check('подсказка: показывает источник (messengerName)', html.includes('messengerName'))
check('showTooltip прокидывает icon в подсказку', /icon:\s*d\.icon/.test(state))
check('createPinBtn передаёт messengerName (источник)', notifHelpers.includes('messengerName'))
check('native TG кладёт аватар в iconDataUrl (cc-media)', /iconDataUrl:\s*chat\?\.avatar/.test(nativeIpc))
// v1.2.77 (Совет 1): fallback на свежий аватар из pendingChatAvatar до сброса состояния
check('уведомление берёт аватар из pendingChatAvatar (кэш до flush)', /chat\?\.avatar\s*\|\|\s*pendingChatAvatar\.get\(chatId\)/.test(nativeIpc))

// ── v1.2.76: док возвращается на экран после safeHide (не пропадает) ──
console.log('\n── v1.2.76 док после «Свернуть»: ──')
check('restoreDockBounds есть (возврат окна в workArea)', state.includes('function restoreDockBounds'))
check('restoreDockBounds позиционирует по workArea', /restoreDockBounds[\s\S]*workArea/.test(state))
check('addToDock вызывает restoreDockBounds перед показом', /restoreDockBounds\(dock\)[\s\S]{0,40}showInactive/.test(state))

// ── v1.2.80: окно дока не «засыпает» скрытым + прямой размер ──
console.log('\n── v1.2.80 док rAF/throttling: ──')
const dockJsFull = read('main/pin-dock.js')
check('окно дока: backgroundThrottling:false', /new BrowserWindow\([\s\S]*?getDockPreloadPath[\s\S]*?backgroundThrottling:\s*false/.test(state) || /backgroundThrottling:\s*false/.test(state))
const _rsStart = dockJsFull.indexOf('function reportSize()')
const _rsEnd = dockJsFull.indexOf('dockApi.resize', _rsStart)
const _rsSeg = (_rsStart >= 0 && _rsEnd > _rsStart) ? dockJsFull.slice(_rsStart, _rsEnd) : ''
check('reportSize шлёт размер напрямую (без вызова requestAnimationFrame)', _rsSeg.length > 0 && !_rsSeg.includes('requestAnimationFrame('))

// ── v1.2.83: «Срочно» в подсказке (CSS-баг) + имя аккаунта в источнике ──
console.log('\n── v1.2.83 категория + имя аккаунта: ──')
check('категория показывается через display:inline-block (перекрывает CSS display:none)', html.includes("catEl.style.display = 'inline-block'"))
check('подсказка добавляет имя аккаунта в источник (d.accountName)', html.includes('d.accountName'))
check('showTooltip передаёт accountName', /accountName:\s*d\.accountName/.test(state))
check('createPinBtn принимает и шлёт accountName', notifHelpers.includes('accountName') && /pinMessage\([^)]*accountName/.test(notifHelpers))
check('native уведомление кладёт имя аккаунта (accounts.find по accountId)', nativeIpc.includes('(stateRef.current.accounts || []).find'))
// v1.2.87: конвейер уведомления должен ПРОБРАСЫВАТЬ accountName в окно (иначе кнопка 📌 теряет его)
const notifMgr = read('main/handlers/notificationManager.js')
check('showCustomNotification принимает accountName', /showCustomNotification\(\{[^}]*accountName/.test(notifMgr))
check('data-объект уведомления содержит accountName', /const data = \{[\s\S]*?accountName/.test(notifMgr))

// ── v1.2.84: прилипание дока к краям экрана убрано ──
console.log('\n── v1.2.84 без прилипания: ──')
check('snap к краям убран из moved (нет SNAP=20)', !state.includes('SNAP = 20'))
check('moved только сохраняет позицию', /dockWin\.on\('moved'[\s\S]*?storage\.set\('dockPosition'/.test(state))

// ── Сборка (prod) ──
console.log('\n── Сборка: ──')
check('копирование pin-tooltip.html в out/', viteCfg.includes('pin-tooltip.html'))
check("preload-entry 'pin-tooltip'", viteCfg.includes("'pin-tooltip'"))

console.log('\n📊 Результат: ' + ok + ' ✅ / ' + fail + ' ❌ из ' + (ok + fail))
if (fail > 0) process.exit(1)
