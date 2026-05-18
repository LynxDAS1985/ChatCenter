// v0.89.19: regression sweep — ВСЕГДА запускается в pre-commit hook.
//
// Зачем .cjs формат (а не .vitest.js):
// Pre-commit запускает vitest ТОЛЬКО при изменении .jsx / .vitest.* файлов.
// Если кто-то правит чистый .js (notifHandlers.js, dockPinState.js и т.п.) —
// vitest пропускается. Этот .cjs тест в списке быстрых проверок pre-commit
// (вместе с hookOrder, fileSizeLimits, mainImports) — крутится ВСЕГДА.
//
// Что проверяет:
// 1. Все .hide() на transparent BrowserWindow используют safeHideTransparentWindow
// 2. notifWin.hide() / dockState.win.hide() — запрещены (raw .hide() = ghost
//    hit-test регион на Win11, см. ловушка #20 в mistakes/notifications-ribbon.md)
// 3. Файлы импортируют helper
//
// Подделать невозможно: pre-commit падает → коммит не идёт. Без --no-verify
// (который запрещён правилами проекта) обойти нельзя.

const fs = require('fs')
const path = require('path')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\n🛡️ Transparent BrowserWindow guard (ghost hit-test регрессия)\n')

// Файлы, в которых используются transparent BrowserWindow и вызывается .hide().
// При добавлении нового transparent окна — обновить этот список.
const FILES_TO_CHECK = [
  'main/handlers/notifHandlers.js',
  'main/handlers/notificationManager.js',
  'main/handlers/dockPinHandlers.js',
  'main/handlers/dockPinState.js',
]

// Паттерны .hide() на transparent окнах — ЗАПРЕЩЕНЫ без helper'а.
// При добавлении нового transparent окна — добавить его переменную сюда.
const FORBIDDEN_PATTERNS = [
  { re: /\bnotifWin\.hide\s*\(/, label: 'notifWin.hide() — используй safeHideTransparentWindow(notifWin)' },
  { re: /\bdockState\.win\.hide\s*\(/, label: 'dockState.win.hide() — используй safeHideTransparentWindow(dockState.win)' },
]

// В этих файлах ОБЯЗАТЕЛЬНО должен быть импорт/использование helper'а.
// Если файл правит транспарентное окно — он должен импортировать защиту.
const REQUIRED_HELPER_USAGE = /safeHideTransparentWindow\s*\(/

for (const rel of FILES_TO_CHECK) {
  const abs = path.resolve(process.cwd(), rel)
  test(`файл ${rel} существует`, () => {
    assert(fs.existsSync(abs), `файл не найден: ${rel}. Обнови FILES_TO_CHECK в этом тесте.`)
  })

  let content = ''
  try { content = fs.readFileSync(abs, 'utf8') } catch (_) { continue }

  for (const { re, label } of FORBIDDEN_PATTERNS) {
    test(`${rel}: НЕТ сырого ${label.split(' —')[0]}`, () => {
      const match = content.match(re)
      assert(!match,
        `Найден запрещённый паттерн в ${rel}.\n` +
        `   Замени на: ${label.split(' — ')[1]}\n` +
        `   Причина: на Windows 11 transparent BrowserWindow.hide() оставляет\n` +
        `   ghost hit-test регион. См. ловушка #20 в\n` +
        `   .memory-bank/mistakes/notifications-ribbon.md`)
    })
  }

  test(`${rel}: использует safeHideTransparentWindow`, () => {
    assert(REQUIRED_HELPER_USAGE.test(content),
      `Файл ${rel} в списке FILES_TO_CHECK, но НЕ использует safeHideTransparentWindow.\n` +
      `   Либо файл больше не управляет transparent окном — убери из FILES_TO_CHECK.\n` +
      `   Либо забыл вызвать helper — импортируй и используй для .hide().`)
  })
}

// Защита от изменения helper'а — если кто-то удалит safeHideTransparentWindow
// или сильно его упростит, регрессия молча перестанет защищать.
test('main/utils/transparentWindowGuard.js существует и экспортирует helper', () => {
  const helperPath = path.resolve(process.cwd(), 'main/utils/transparentWindowGuard.js')
  assert(fs.existsSync(helperPath), 'main/utils/transparentWindowGuard.js удалён!')
  const helper = fs.readFileSync(helperPath, 'utf8')
  assert(/export\s+function\s+safeHideTransparentWindow/.test(helper),
    'safeHideTransparentWindow не экспортируется — кто-то удалил/переименовал')
  assert(/setBounds\s*\(/.test(helper),
    'setBounds() удалён из helper\'а — потеряна защита от ghost-региона')
  assert(/-30000|-10000/.test(helper),
    'offscreen координаты удалены/изменены — окно может остаться видимым')
  // v0.89.22: КРИТИЧЕСКОЕ — setIgnoreMouseEvents(true) НЕ должен быть в helper.
  // Ловушка #27: блокирует -webkit-app-region: drag у pin/dock окон.
  // Ловушка #21: вызывал «двойной клик» (state persists, нет парного false перед show).
  // Регрессия: если кто-то вернёт — этот тест упадёт.
  assert(!/setIgnoreMouseEvents\s*\(\s*true\s*\)/.test(helper),
    'setIgnoreMouseEvents(true) ВЕРНУЛИ в helper! Это ломает -webkit-app-region: drag\n' +
    '   у pin/dock окон (ловушка #27). См. mistakes/notifications-ribbon.md #21.\n' +
    '   Защита от ghost-региона: setBounds offscreen + hide() — этого достаточно.')
})

console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) {
  console.log('\n❌ Регрессионная защита сломана. Это означает что сырой .hide() на')
  console.log('   transparent окне снова в коде, или helper удалён/изменён небезопасно.')
  console.log('   На Windows 11 это приведёт к невидимому блоку перехватывающему клики.')
  process.exit(1)
}
