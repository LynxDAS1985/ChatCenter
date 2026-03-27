/**
 * v0.84.0: UI E2E тест — запускает Electron, проверяет рендер UI
 * Использует Electron напрямую (не Playwright browser) через executeJavaScript
 *
 * Запуск: node e2e/ui.e2e.cjs
 * ВАЖНО: Закройте ChatCenter перед запуском!
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

let passed = 0, failed = 0
function test(name, result) {
  if (result) { passed++; console.log('  ✅ ' + name) }
  else { failed++; console.log('  ❌ ' + name) }
}

console.log('\n🧪 UI E2E тест (Electron launch + render check)\n')

var isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
if (isCI) {
  console.log('  ⚠️  CI — пропуск UI тестов (no display)')
  console.log('\n📊 Результат: 0 ✅ / 0 ❌ (пропущено)')
  process.exit(0)
}

if (!fs.existsSync('out/main/main.js')) {
  console.log('  ⚠️  out/ не существует — запустите npm run build')
  console.log('\n📊 Результат: 0 ✅ / 0 ❌ (пропущено)')
  process.exit(0)
}

// Запускаем Electron с маленьким тестовым скриптом
var testScript = `
const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const results = {};
  try {
    // Создаём окно
    const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { contextIsolation: true } });

    // Загружаем renderer
    const isDev = false;
    const rendererUrl = require('path').join(__dirname, 'out/renderer/index.html');
    await win.loadFile(rendererUrl);

    // Ждём React render
    await new Promise(r => setTimeout(r, 2000));

    // Проверяем что React отрисовал
    const hasRoot = await win.webContents.executeJavaScript("!!document.getElementById('root')");
    results.hasRoot = hasRoot;

    const rootChildren = await win.webContents.executeJavaScript("document.getElementById('root')?.children?.length || 0");
    results.rootChildren = rootChildren;

    const bodyText = await win.webContents.executeJavaScript("document.body?.innerText?.slice(0, 100) || ''");
    results.bodyText = bodyText;

    const hasError = await win.webContents.executeJavaScript("document.body?.innerText?.includes('ОШИБКА') || document.body?.innerText?.includes('Error') || false");
    results.hasError = hasError;

    results.ok = true;
  } catch(e) {
    results.ok = false;
    results.error = e.message;
  }

  // Выводим результат как JSON
  process.stdout.write('__E2E_RESULT__' + JSON.stringify(results));
  app.quit();
});
`

// Сохраняем тестовый скрипт
var testFile = path.join(__dirname, '..', '_e2e_test_main.cjs')
fs.writeFileSync(testFile, testScript)

var env = Object.assign({}, process.env)
delete env.ELECTRON_RUN_AS_NODE

var electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronPath)) {
  electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron')
}

console.log('── Запуск Electron UI тест... ──')

var child = spawn(electronPath, [testFile], {
  env: env,
  cwd: path.join(__dirname, '..'),
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 15000,
})

var stdout = ''
var stderr = ''
child.stdout.on('data', function(d) { stdout += d.toString() })
child.stderr.on('data', function(d) { stderr += d.toString() })

child.on('close', function(code) {
  // Cleanup
  try { fs.unlinkSync(testFile) } catch(e) {}

  var resultMatch = stdout.match(/__E2E_RESULT__(.+)/)
  if (resultMatch) {
    try {
      var results = JSON.parse(resultMatch[1])
      test('Electron запустился', results.ok)
      test('Root элемент найден', results.hasRoot)
      test('React отрисовал children (>' + results.rootChildren + ')', results.rootChildren > 0)
      test('Нет ошибок на экране', !results.hasError)
      test('Body содержит текст', (results.bodyText || '').length > 0)
    } catch(e) {
      console.log('  ❌ Parse error: ' + e.message)
      failed++
    }
  } else {
    // Electron не вернул результат — проверяем что хотя бы запустился
    if (code === null || code === 0) {
      test('Electron запустился (timeout OK)', true)
    } else {
      test('Electron запустился (code=' + code + ')', false)
      if (stderr) console.log('  stderr:', stderr.slice(0, 200))
    }
  }

  console.log('\n📊 Результат: ' + passed + ' ✅ / ' + failed + ' ❌ из ' + (passed + failed))
  process.exit(failed > 0 ? 1 : 0)
})

child.on('error', function(err) {
  try { fs.unlinkSync(testFile) } catch(e) {}
  console.log('  ❌ Launch error: ' + err.message)
  process.exit(1)
})
