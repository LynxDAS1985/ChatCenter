const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const notifHandlers = read('main/handlers/notifHandlers.js')
const notificationCss = read('main/notification.css')
const notificationJs = read('main/notification.js')
const notifPreload = read('main/preloads/notification.preload.cjs')
const notificationManager = read('main/handlers/notificationManager.js')

assert.match(
  notifHandlers,
  /const maxHeight = Math\.max\(NOTIF_MIN_HEIGHT, workArea\.height - NOTIF_SCREEN_MARGIN \* 2\)/,
  'notification window height must be capped to the screen work area'
)

assert.match(
  notifHandlers,
  /const displayHeight = Math\.min\(height, maxHeight\)/,
  'renderer height must be clamped before setBounds'
)

assert.match(
  notifHandlers,
  /Math\.max\(\s*workArea\.y \+ NOTIF_SCREEN_MARGIN,/,
  'notification window y must not move above the screen'
)

assert.match(
  notifHandlers,
  /notifWin\.setBounds\(\{ x, y, width: NOTIF_WINDOW_WIDTH, height: displayHeight \}\)/,
  'setBounds must use the clamped height'
)

assert.match(
  notificationCss,
  /#container\s*\{[\s\S]*max-height: 100vh;[\s\S]*overflow-y: auto;/,
  'notification container must scroll inside the capped window'
)

assert.match(
  notificationCss,
  /\.notif-item\s*\{[\s\S]*flex: 0 0 auto;/,
  'notification cards must not shrink; the outer list must scroll instead'
)

assert.match(
  notificationJs,
  /const MAX_AUTO_DISMISS_ITEMS = 6/,
  'auto-dismiss notifications may keep the compact six-card safety cap'
)

assert.match(
  notificationJs,
  /const MAX_PERSISTENT_ITEMS = Math\.max\(6, Math\.min\(14, Math\.floor\(.*availHeight.*\/ 180\)\)\)/,
  'v1.2.340: persistent cap computed from screen height (availHeight/180, clamped 6..14) — 30 cards grew an 8073px wall overnight (v1.2.339 root); the stack must never outgrow the screen'
)

assert.match(
  notificationJs,
  /const maxItems = data\.dismissMs === 0 \? MAX_PERSISTENT_ITEMS : MAX_AUTO_DISMISS_ITEMS/,
  'the six-card cap must not remove persistent notifications'
)

assert.match(
  notificationJs,
  /while \(items\.size >= maxItems\)/,
  'notification renderer must enforce the mode-specific item cap'
)

assert.match(
  notificationJs,
  /function scrollContainerToLatest\(\)/,
  'notification renderer must keep the newest card visible'
)

assert.match(
  notificationJs,
  /container\.scrollTop = container\.scrollHeight/,
  'notification renderer must scroll the outer container to the newest card'
)

assert.match(
  notifPreload,
  /onUpdateIcon: \(callback\) => \{[\s\S]*notif:update-icon/,
  'notification preload must expose async icon updates'
)

assert.match(
  notificationManager,
  /function updateNotificationIconLater\(id, iconUrl\)/,
  'notification manager must update icons without blocking notification display'
)

const sendIndex = notificationManager.indexOf("notifWin.webContents.send('notif:show', data)")
const asyncIconIndex = notificationManager.indexOf('if (!iconDataUrl) updateNotificationIconLater(id, iconUrl)')
assert.ok(sendIndex !== -1 && asyncIconIndex > sendIndex, 'icon download must start after notif:show')

console.log('notificationWindowBounds.test.cjs: OK')
