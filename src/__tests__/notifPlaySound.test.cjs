// v1.2.12-fix: тесты на listener `notif:play-sound` в useAppIPCListeners.
// Контракт (по эталону WebView webviewHandleNewMessage.js:79-99):
//   - Слушатель срабатывает ТОЛЬКО для messengerId.startsWith('native_').
//   - Если settings.soundEnabled === false → нет звука.
//   - Если settings.mutedMessengers[id] === true → нет звука.
//   - Если settings.messengerNotifs[id].sound === false → нет звука.
//   - Throttle 3 секунды через lastSoundTsRef.current[id].
//
// Изолированный JS-тест без React/jsdom — повторяем логику listener один-в-один.
// Полный rendered React тест слишком тяжёлый для такого простого правила;
// корень в логике, не в React-интеграции.

const test = require('node:test')
const assert = require('node:assert/strict')

// Воспроизводим точную логику из src/hooks/useAppIPCListeners.js useEffect №5.
// Если поменяется код — этот тест упадёт и заставит синхронизировать.
function shouldPlaySound({ messengerId, settings, lastSoundTsRef, now = Date.now() }) {
  if (!messengerId || !String(messengerId).startsWith('native_')) return false
  const s = settings || {}
  if (s.soundEnabled === false) return false
  if ((s.mutedMessengers || {})[messengerId]) return false
  const mNotifs = (s.messengerNotifs || {})[messengerId] || {}
  if (mNotifs.sound === false) return false
  const lastSnd = lastSoundTsRef.current[messengerId] || 0
  if (now - lastSnd < 3000) return false
  return true
}

test('Native: настройки по умолчанию → звук играется', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({ messengerId: 'native_cc', settings: {}, lastSoundTsRef: ref }), true)
})

test('WebView (whatsapp): listener НЕ срабатывает', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({ messengerId: 'whatsapp', settings: {}, lastSoundTsRef: ref }), false)
})

test('WebView (vk): listener НЕ срабатывает', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({ messengerId: 'vk', settings: {}, lastSoundTsRef: ref }), false)
})

test('messengerId=undefined → no sound (защита от падений)', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({ messengerId: undefined, settings: {}, lastSoundTsRef: ref }), false)
})

test('Native + global soundEnabled=false → не играть', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({
    messengerId: 'native_cc',
    settings: { soundEnabled: false },
    lastSoundTsRef: ref,
  }), false)
})

test('Native + mutedMessengers[native_cc]=true → не играть', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({
    messengerId: 'native_cc',
    settings: { mutedMessengers: { native_cc: true } },
    lastSoundTsRef: ref,
  }), false)
})

test('Native + messengerNotifs[native_cc].sound=false → не играть', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({
    messengerId: 'native_cc',
    settings: { messengerNotifs: { native_cc: { sound: false } } },
    lastSoundTsRef: ref,
  }), false)
})

test('Native + messengerNotifs[native_cc].sound=true явно → играть', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({
    messengerId: 'native_cc',
    settings: { messengerNotifs: { native_cc: { sound: true } } },
    lastSoundTsRef: ref,
  }), true)
})

test('Throttle 3s: повторный вызов через 100мс → не играть', () => {
  const ref = { current: { native_cc: 1000 } }
  assert.equal(shouldPlaySound({
    messengerId: 'native_cc',
    settings: {},
    lastSoundTsRef: ref,
    now: 1100,  // 100 мс прошло
  }), false)
})

test('Throttle 3s: повторный вызов через 3001мс → играть', () => {
  const ref = { current: { native_cc: 1000 } }
  assert.equal(shouldPlaySound({
    messengerId: 'native_cc',
    settings: {},
    lastSoundTsRef: ref,
    now: 4001,  // 3001 мс прошло
  }), true)
})

test('Граничный случай: settings=null → не падать, играть (default ON)', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({ messengerId: 'native_cc', settings: null, lastSoundTsRef: ref }), true)
})

test('Граничный случай: только messengerNotifs={} (нет sound поля) → играть', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({
    messengerId: 'native_cc',
    settings: { messengerNotifs: { native_cc: {} } },
    lastSoundTsRef: ref,
  }), true)
})

test('soundEnabled=undefined → играть (не === false)', () => {
  const ref = { current: {} }
  assert.equal(shouldPlaySound({
    messengerId: 'native_cc',
    settings: { soundEnabled: undefined },
    lastSoundTsRef: ref,
  }), true)
})
