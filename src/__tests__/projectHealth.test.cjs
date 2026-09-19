/**
 * Тесты здоровья проекта — зависимости, мёртвый код, версии.
 *
 * Запуск: node src/__tests__/projectHealth.test.js
 */

var fs = require('fs')
var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
var claude = fs.readFileSync('CLAUDE.md', 'utf8')
var appCode = fs.readFileSync('src/App.jsx', 'utf8')

var passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'fail') }

console.log('\\n🧪 Тесты здоровья проекта\\n')

// ── Зависимости ──
console.log('── Зависимости: ──')
test('Нет zustand в dependencies', function() { assert(!pkg.dependencies.zustand) })
test('Нет electron-store в dependencies', function() { assert(!pkg.dependencies['electron-store']) })
test('Нет cross-env в devDependencies', function() { assert(!pkg.devDependencies['cross-env']) })
test('react есть', function() { assert(pkg.dependencies.react) })
test('react-dom есть', function() { assert(pkg.dependencies['react-dom']) })
test('electron есть', function() { assert(pkg.devDependencies.electron) })
test('electron-vite есть', function() { assert(pkg.devDependencies['electron-vite']) })
test('npm test script определён', function() { assert(pkg.scripts.test && pkg.scripts.test.length > 10) })
test('start:prodlike script defined for production-like startup comparison', function() {
  assert(pkg.scripts['start:prodlike'] === 'node scripts/prodlike.cjs')
})
test('dist:win builds installer into dist', function() {
  assert(pkg.scripts['dist:win'] === 'node scripts/dist-win.cjs', 'missing dist:win wrapper script')
  assert(pkg.build && pkg.build.directories && pkg.build.directories.output === 'dist', 'installer output must be dist')
  assert(pkg.build.electronDist === 'node_modules/electron/dist', 'packaging must use local Electron to avoid GitHub download')
  // 🔴 v1.2.458 (жалоба «почему значок старый у программы»). РАНЬШЕ здесь требовалось
  // signAndEditExecutable === false. Та настройка отключает НЕ ТОЛЬКО подпись, но и правку
  // ресурсов файла программы — то есть ВШИВАНИЕ ЗНАЧКА. Из-за неё ЦентрЧатов.exe оставался
  // с родным значком Electron, и ярлык на рабочем столе показывал «атом». Сам сборщик писал
  // об этом в журнале каждой сборки и подсказывал замену:
  //   «To skip only code signing while keeping icon and metadata applied, use signExecutable: false»
  // Теперь требуем именно её: подпись пропускаем (сертификата нет), значок вшивается.
  assert(pkg.build.win && pkg.build.win.signExecutable === false, 'installer must skip SIGNING only (signExecutable), not executable resource editing — otherwise the app icon is never embedded and the desktop shortcut shows the default Electron icon')
  assert(pkg.build.win.signAndEditExecutable === undefined, 'do NOT bring back signAndEditExecutable: it also disables icon embedding (v1.2.458)')
  // Значок обязан быть настроен и существовать — иначе вшивать нечего.
  assert(pkg.build.win.icon === 'build/icon.ico', 'win.icon must point at build/icon.ico')
  assert(fs.existsSync('build/icon.ico'), 'build/icon.ico missing — run: node scripts/make-app-icon.cjs')
  // ⚠️ Правка ресурсов выполняется инструментом rcedit из пакета winCodeSign. На этой машине он
  // уже в кэше electron-builder (проверено 2026-09-11), поэтому скачивания при сборке нет.
  // На ЧИСТОЙ машине без интернета первая сборка попробует его скачать — это осознанная плата
  // за правильный значок. Скачивание самого Electron по-прежнему исключено (electronDist ниже).
  // 🔴 v1.2.459: память НЕ должна выдавать снятую настройку за действующую. Правило проекта —
  // «при расхождении памяти и кода доверяй коду, память обнови». Историю в журналах не
  // переписываем, но рядом обязана стоять пометка «устарело», иначе тот, кто ищет настройку
  // по имени, первым найдёт старую запись и примет её за правду.
  for (const memFile of ['.memory-bank/CHANGELOG.md']) {
    if (!fs.existsSync(memFile)) continue
    const lines = fs.readFileSync(memFile, 'utf8').split(/\r?\n/)
    lines.forEach(function (line, i) {
      if (line.indexOf('signAndEditExecutable') < 0) return
      const around = lines.slice(i, i + 6).join(' ')
      assert(around.indexOf('УСТАРЕЛО') >= 0 || around.indexOf('устарело') >= 0,
        memFile + ':' + (i + 1) + ' — упоминает снятую настройку signAndEditExecutable без пометки «устарело». ' +
        'Действующее решение — ADR-057 (signExecutable). Добавь пометку рядом или убери упоминание.')
    })
  }
  // 🔴 v1.2.460: «Компания» в свойствах собранного файла берётся из поля author
  // (app-builder-lib/out/appInfo.js: `get companyName() { ... return author.name }`,
  // подставляется в winPackager.js: `versionStrings.CompanyName = appInfo.companyName`).
  // Поле было ПУСТЫМ → имя не подставлялось → в свойствах ЦентрЧатов.exe стояло
  // «GitHub, Inc.» (значение Electron по умолчанию), то есть программа выдавала себя
  // за продукт GitHub. Поле обязано быть заполнено ИМЕНЕМ (объект с name или строка).
  var authorName = pkg.author && (typeof pkg.author === 'string' ? pkg.author : pkg.author.name)
  assert(authorName && String(authorName).trim().length > 1,
    'package.json → author.name пуст: «Компания» в свойствах собранного файла снова станет «GitHub, Inc.» (v1.2.460)')
  assert(pkg.build.extraMetadata && pkg.build.extraMetadata.main === 'out/main/main.js', 'packaged app must start from built main')
})
test('scripts/dist-win.cjs keeps only installer in dist safely', function() {
  var distWin = fs.readFileSync('scripts/dist-win.cjs', 'utf8')
  assert(distWin.includes('Refusing to clean outside dist'), 'cleanup must guard dist path')
  assert(distWin.includes('\\\\\\\\?\\\\'), 'Windows cleanup must support Cyrillic paths')
  assert(distWin.includes('fs.unlinkSync'), 'Windows cleanup must unlink files explicitly')
  // v1.2.299: чистка хранит ВСЕ установщики .exe и удаляет только мусор сборки. Защита изменена:
  // раньше требовался ровно один установщик; теперь — не чистить, если НИ ОДНОГО установщика нет.
  assert(distWin.includes('No installer .exe found'), 'cleanup must verify at least one installer exists before deleting extras')
  assert(distWin.includes('function isInstaller'), 'cleanup must identify installers by pattern to keep them all')
  assert(distWin.includes('dist cleanup left extra files'), 'cleanup must fail if any non-installer file remains')
  assert(distWin.includes('verifyPackagedApp'), 'must verify packaged app before cleanup')
  assert(distWin.includes('out/renderer/index.html') && distWin.includes('node_modules/telegram/package.json'), 'package verification must cover renderer and production deps')
  assert(distWin.includes("['--win', '--x64']"), 'must build Windows x64 installer')
})
test('прогрев Vite указывает на СУЩЕСТВУЮЩИЕ файлы (v1.2.465)', function() {
  // 🔴 ЖАЛОБА 2026-09-16: красный экран «Failed to fetch dynamically imported module».
  // Разбор: сервер разработки отдавал файлы волнами с паузами до 116 секунд, ленивая
  // догрузка не дожидалась. Лекарство — server.warmup (документация Vite, раздел
  // Performance: «готовит файлы заранее... предотвращает водопад обработки»).
  //
  // Страж нужен потому, что Vite на НЕСУЩЕСТВУЮЩИЙ файл в списке прогрева НЕ ругается —
  // просто молча его не греет. Переименовали файл → прогрев тихо перестал работать,
  // и жалоба вернулась бы без единого сигнала.
  var cfg = fs.readFileSync('electron.vite.config.js', 'utf8')
  // Ищем ИМЕННО объявление `warmup:` — проверка на подстроку 'warmup' пропускала подмену
  // вида `warmupOFF:` (поймано собственным прогоном «наоборот» при написании этого стража).
  assert(cfg.indexOf('warmup: {') >= 0, 'electron.vite.config.js: прогрев server.warmup пропал — вернётся долгий первый запуск (v1.2.465)')
  var block = cfg.slice(cfg.indexOf('clientFiles'), cfg.indexOf(']', cfg.indexOf('clientFiles')))
  var files = (block.match(/'\.\/[^']+'/g) || []).map(function (q) { return q.slice(1, -1).replace(/^\.\//, '') })
  assert(files.length >= 3, 'в прогреве должно остаться хотя бы 3 файла, найдено: ' + files.length)
  // v1.2.466 (находка придирчивого ревью): Vite разрешает в прогреве ШАБЛОНЫ (типы пакета,
  // ключ clientFiles: «Supports glob patterns»). Прежняя проверка требовала обычный файл и
  // падала ложной тревогой на законной настройке — блокировала бы коммит. Для шаблона проверяем
  // только, что существует папка до первой звёздочки: сам шаблон разворачивает Vite.
  files.forEach(function (f) {
    if (f.indexOf('*') >= 0) {
      var dir = f.slice(0, f.indexOf('*')).replace(/\/[^/]*$/, '')
      assert(!dir || fs.existsSync(dir), 'прогрев Vite: шаблон ' + f + ' указывает на несуществующую папку ' + dir)
      return
    }
    assert(fs.existsSync(f), 'прогрев Vite ссылается на несуществующий файл: ' + f + ' — Vite об этом молчит, поэтому ловим тестом')
  })
})
test('scripts/prodlike.cjs builds before electron-vite preview', function() {
  var prodlike = fs.readFileSync('scripts/prodlike.cjs', 'utf8')
  assert(prodlike.includes("delete env.ELECTRON_RUN_AS_NODE"), 'must avoid inherited ELECTRON_RUN_AS_NODE')
  assert(prodlike.includes("['run', 'build']"), 'must build first')
  assert(prodlike.includes("['preview']"), 'must launch electron-vite preview after build')
})

// ── Версии синхронизированы ──
console.log('\\n── Версии: ──')
var pkgVersion = pkg.version
test('package.json версия определена', function() { assert(pkgVersion && pkgVersion.length > 3) })
test('CLAUDE.md шапка содержит версию', function() {
  assert(claude.includes('**Текущая версия**: v' + pkgVersion), 'шапка: v' + pkgVersion + ' не найдена')
})
test('CLAUDE.md подвал содержит версию', function() {
  assert(claude.includes('**Версия проекта**: v' + pkgVersion), 'подвал: v' + pkgVersion + ' не найдена')
})

// ── Мёртвый код ──
console.log('\\n── Мёртвый код: ──')
test('Нет function _DEAD_ в App.jsx', function() { assert(!appCode.includes('function _DEAD_')) })
test('Нет if (false) в App.jsx', function() { assert(!appCode.includes('if (false)')) })
test('Нет DEAD_DELETE_ME', function() { assert(!appCode.includes('DEAD_DELETE_ME')) })

// ── Структура проекта ──
console.log('\\n── Структура: ──')
test('shared/spamPatterns.json существует', function() { assert(fs.existsSync('shared/spamPatterns.json')) })
test('shared/messengerConfigs.js существует', function() { assert(fs.existsSync('shared/messengerConfigs.js')) })
test('shared/messageProcessing.js существует', function() { assert(fs.existsSync('shared/messageProcessing.js')) })
test('src/utils/sound.js существует', function() { assert(fs.existsSync('src/utils/sound.js')) })
test('src/utils/navigateToChat.js существует', function() { assert(fs.existsSync('src/utils/navigateToChat.js')) })
test('main/utils/overlayIcon.js существует', function() { assert(fs.existsSync('main/utils/overlayIcon.js')) })
test('.github/workflows/test.yml существует', function() { assert(fs.existsSync('.github/workflows/test.yml')) })
test('src/components/MessengerTab.jsx существует', function() { assert(fs.existsSync('src/components/MessengerTab.jsx')) })
test('src/components/NotifLogModal.jsx существует', function() { assert(fs.existsSync('src/components/NotifLogModal.jsx')) })

// ── Размеры файлов ──
console.log('\\n── Размеры: ──')
var appLines = appCode.split('\n').length
test('App.jsx < 2500 строк', function() { assert(appLines < 2500, 'lines=' + appLines) })
var mainLines = fs.readFileSync('main/main.js', 'utf8').split('\n').length
test('main.js < 2000 строк', function() { assert(mainLines < 2000, 'lines=' + mainLines) })
var monLines = fs.readFileSync('main/preloads/monitor.preload.cjs', 'utf8').split('\n').length
test('monitor.preload.cjs < 1500 строк', function() { assert(monLines < 1500, 'lines=' + monLines) })

// ── Безопасность ──
console.log('\\n── Безопасность: ──')
test('Нет eval() в App.jsx', function() { assert(!appCode.includes('eval(')) })
var mainCode = fs.readFileSync('main/main.js', 'utf8')
// v0.84.4: windowManager extracted — security checks across all main modules
var windowMgrCode = fs.existsSync('main/utils/windowManager.js') ? fs.readFileSync('main/utils/windowManager.js', 'utf8') : ''
var allMainCode = mainCode + '\n' + windowMgrCode
test('contextIsolation: true в main.js', function() { assert(allMainCode.includes('contextIsolation: true')) })
test('nodeIntegration: false в main.js', function() { assert(allMainCode.includes('nodeIntegration: false')) })

console.log('\\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
if (failed > 0) process.exit(1)
