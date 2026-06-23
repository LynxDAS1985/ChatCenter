// v1.2.12-fix: тесты на локальный фильтр ribbon для Native в main IPC handler
// `app:custom-notify` (mainIpcHandlers.js).
//
// Контракт:
//   - Для messengerId.startsWith('native_') ДО показа окна проверяются
//     локальные настройки: mutedMessengers, notificationsEnabled, messengerNotifs[id].ribbon.
//     Если ribbon выключен — return { ok:false, skipped:'local-ribbon-disabled' }.
//     Окно НЕ показывается, звук НЕ шлётся.
//   - Для WebView (messengerId не начинается с 'native_') фильтр пропускается
//     (WebView делает проверки сам в renderer — webviewHandleNewMessage.js).
//
// Изолированный тест: воспроизводим логику фильтра один-в-один.

const test = require('node:test')
const assert = require('node:assert/strict')

// Точная копия логики из main/handlers/mainIpcHandlers.js app:custom-notify.
function shouldShowRibbon(payload, settings) {
  if (!payload?.messengerId || !String(payload.messengerId).startsWith('native_')) {
    return { allow: true, reason: 'webview-or-unknown' }
  }
  const s = settings || {}
  const mid = payload.messengerId
  const mNotifs = (s.messengerNotifs || {})[mid] || {}
  const mMuted = !!(s.mutedMessengers || {})[mid]
  const ribbonOn = mNotifs.ribbon !== undefined ? mNotifs.ribbon : true
  const canShow = !mMuted && s.notificationsEnabled !== false && ribbonOn
  if (!canShow) return { allow: false, reason: 'local-ribbon-disabled', mMuted, ribbonOn }
  return { allow: true }
}

test('WebView (whatsapp): фильтр пропускает (логика в renderer)', () => {
  const r = shouldShowRibbon({ messengerId: 'whatsapp' }, { messengerNotifs: { whatsapp: { ribbon: false } } })
  assert.equal(r.allow, true)  // фильтр main НЕ применяется к WebView
})

test('Native default: settings пусто → показать (default ON)', () => {
  const r = shouldShowRibbon({ messengerId: 'native_cc' }, {})
  assert.equal(r.allow, true)
})

test('Native + mutedMessengers[native_cc]=true → НЕ показать', () => {
  const r = shouldShowRibbon(
    { messengerId: 'native_cc' },
    { mutedMessengers: { native_cc: true } }
  )
  assert.equal(r.allow, false)
  assert.equal(r.reason, 'local-ribbon-disabled')
})

test('Native + global notificationsEnabled=false → НЕ показать', () => {
  const r = shouldShowRibbon({ messengerId: 'native_cc' }, { notificationsEnabled: false })
  assert.equal(r.allow, false)
})

test('Native + messengerNotifs[native_cc].ribbon=false → НЕ показать', () => {
  const r = shouldShowRibbon(
    { messengerId: 'native_cc' },
    { messengerNotifs: { native_cc: { ribbon: false } } }
  )
  assert.equal(r.allow, false)
})

test('Native + messengerNotifs[native_cc].ribbon=true явно → показать', () => {
  const r = shouldShowRibbon(
    { messengerId: 'native_cc' },
    { messengerNotifs: { native_cc: { ribbon: true } } }
  )
  assert.equal(r.allow, true)
})

test('Native + только sound=false (ribbon default=true) → показать окно (звук режется отдельно)', () => {
  const r = shouldShowRibbon(
    { messengerId: 'native_cc' },
    { messengerNotifs: { native_cc: { sound: false } } }
  )
  assert.equal(r.allow, true)  // ribbon независим от sound
})

test('Native + payload.messengerId=undefined → WebView ветка (пропустить)', () => {
  const r = shouldShowRibbon({ messengerId: undefined }, {})
  assert.equal(r.allow, true)
})

test('Native + settings.notificationsEnabled=true явно → показать', () => {
  const r = shouldShowRibbon({ messengerId: 'native_cc' }, { notificationsEnabled: true })
  assert.equal(r.allow, true)
})

test('Native + ribbon=undefined (no key) + global=true → показать (default true)', () => {
  const r = shouldShowRibbon(
    { messengerId: 'native_cc' },
    { messengerNotifs: { native_cc: {} } }
  )
  assert.equal(r.allow, true)
})

test('Будущий native_max: префикс работает', () => {
  const r = shouldShowRibbon(
    { messengerId: 'native_max' },
    { messengerNotifs: { native_max: { ribbon: false } } }
  )
  assert.equal(r.allow, false)  // префиксная проверка покрывает все native_*
})
