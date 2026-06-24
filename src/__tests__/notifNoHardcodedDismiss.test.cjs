// v1.2.14: страж против возврата hardcoded dismissMs в payload
// `app:custom-notify`. Это была регрессия v0.96.0 в Native режиме —
// 7-секундный таймаут «прибит гвоздями», игнорируя settings.notifDismissSec=0 (∞).
//
// Контракт стандарта мессенджеров:
//   - НИ ОДИН клиентский invoke('app:custom-notify') не должен содержать
//     hardcoded dismissMs.
//   - dismissMs читается ТОЛЬКО из settings.notifDismissSec в main
//     (notificationManager.js).
//
// Единственное допустимое исключение: SettingsPanel.jsx «Предпросмотр»
// слайдера времени — там dismissMs из ползунка, специально для теста UI.
//
// Полная история — .memory-bank/mistakes/notifications-ribbon.md
// секция «hardcoded dismissMs ломает настройку юзера».

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const FILES_TO_CHECK = [
  'src/utils/webviewHandleNewMessage.js',
  'src/native/store/nativeStoreIpc.js',
]

const ALLOWED_FILES_WITH_DISMISSMS = [
  // SettingsPanel предпросмотр слайдера — dismissMs из самого слайдера,
  // специально для тестирования настройки. Это не «новое сообщение».
  'src/components/SettingsPanel.jsx',
  // notificationManager.js (main) — там dismissMs РЕЖИМ override-через-payload.
  // Эта логика именно та что должна получать DEFAULT из settings.
  'main/handlers/notificationManager.js',
  // notification.js (renderer окна) — внутренний state карточки.
  'main/notification.js',
]

test('app:custom-notify в renderer-вызывалах НЕ содержит hardcoded dismissMs', () => {
  for (const relPath of FILES_TO_CHECK) {
    const abs = path.resolve(process.cwd(), relPath)
    const content = fs.readFileSync(abs, 'utf8')

    // Ищем invoke('app:custom-notify', ... { dismissMs: <number> ... }
    // или payload c полем dismissMs: NN
    const invokeBlocks = []
    const re = /invoke\(\s*['"]app:custom-notify['"]\s*,\s*\{[^}]*\}/gs
    let m
    while ((m = re.exec(content)) !== null) {
      invokeBlocks.push(m[0])
    }

    for (const block of invokeBlocks) {
      assert(
        !/dismissMs\s*:\s*\d+/.test(block),
        `${relPath}: найден hardcoded dismissMs в invoke('app:custom-notify') payload!\n` +
        '   dismissMs должен читаться из settings.notifDismissSec (main).\n' +
        '   Если нужно подкрутить — это UI настройка, не hardcoded.\n' +
        '   См. mistakes/notifications-ribbon.md «hardcoded dismissMs».\n' +
        '   Блок:\n' + block.slice(0, 300)
      )
    }
  }
})

test('Разрешённые исключения существуют и не сломаны', () => {
  // Проверяем что SettingsPanel.jsx всё ещё содержит «Предпросмотр» слайдера
  const settingsPath = path.resolve(process.cwd(), 'src/components/SettingsPanel.jsx')
  const settings = fs.readFileSync(settingsPath, 'utf8')
  assert(
    /Предпросмотр/.test(settings),
    'SettingsPanel.jsx больше не содержит «Предпросмотр» слайдера — обнови ALLOWED_FILES_WITH_DISMISSMS'
  )
  assert(
    /dismissMs:\s*sec\s*===\s*0\s*\?\s*0\s*:/.test(settings),
    'SettingsPanel.jsx больше не использует dismissMs из слайдера — поведение слайдера сломано'
  )
})

test('notificationManager.js (main) корректно делает default из settings', () => {
  const abs = path.resolve(process.cwd(), 'main/handlers/notificationManager.js')
  const content = fs.readFileSync(abs, 'utf8')
  // Контракт: если overrideDismissMs != null → используем его; иначе из settings.notifDismissSec
  assert(
    /overrideDismissMs/.test(content),
    'notificationManager.js: параметр overrideDismissMs исчез — Settings слайдер «Предпросмотр» сломается'
  )
  assert(
    /notifDismissSec/.test(content),
    'notificationManager.js: чтение settings.notifDismissSec удалено — настройка ∞ перестанет работать'
  )
  // Проверка default fallback
  assert(
    /\(notifSec\s*\|\|\s*5\)\s*\*\s*1000/.test(content) ||
    /notifSec\s*===\s*0\s*\?\s*0/.test(content),
    'notificationManager.js: формула dismissMs из settings изменена — проверь логику'
  )
})

// Информационный тест: показывает список ALLOWED_FILES чтобы развивающий
// сразу видел кто имеет «привилегию» dismissMs в payload.
test('Allowlist файлов с dismissMs (информация)', () => {
  console.log('   Файлы которым РАЗРЕШЕНО иметь dismissMs в payload app:custom-notify:')
  for (const f of ALLOWED_FILES_WITH_DISMISSMS) {
    console.log('     - ' + f)
  }
  console.log('   Файлы которые ПРОВЕРЯЮТСЯ на отсутствие hardcoded dismissMs:')
  for (const f of FILES_TO_CHECK) {
    console.log('     - ' + f)
  }
  assert(ALLOWED_FILES_WITH_DISMISSMS.length > 0)
  assert(FILES_TO_CHECK.length > 0)
})
