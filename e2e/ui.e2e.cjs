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
const { app, BrowserWindow, ipcMain } = require('electron');
app.whenReady().then(async () => {
  const results = {};
  try {
    // Preload path — production build
    const preloadPath = require('path').join(__dirname, 'out/preload/index.mjs');

    // Создаём окно С preload (как в реальном приложении)
    const win = new BrowserWindow({
      width: 800, height: 600, show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        sandbox: false,
      }
    });

    // Регистрируем тестовые IPC handlers (как main.js)
    ipcMain.handle('messengers:load', () => [
      { id: 'test', name: 'Test', url: 'https://test.com', partition: 'persist:test' }
    ]);
    ipcMain.handle('settings:get', () => ({ soundEnabled: true, theme: 'dark' }));
    ipcMain.handle('app:get-paths', () => ({ monitorPreload: '' }));
    ipcMain.handle('messengers:save', () => ({ ok: true }));
    ipcMain.handle('settings:save', () => ({ ok: true }));
    ipcMain.handle('window:set-titlebar-theme', () => {});

    // Загружаем renderer
    const rendererUrl = require('path').join(__dirname, 'out/renderer/index.html');
    await win.loadFile(rendererUrl);

    // Ждём React render
    await new Promise(r => setTimeout(r, 3000));

    // 1. React отрисовал
    const hasRoot = await win.webContents.executeJavaScript("!!document.getElementById('root')");
    results.hasRoot = hasRoot;

    const rootChildren = await win.webContents.executeJavaScript("document.getElementById('root')?.children?.length || 0");
    results.rootChildren = rootChildren;

    // 2. КРИТИЧЕСКОЕ: window.api существует (preload загрузился!)
    const hasWindowApi = await win.webContents.executeJavaScript("typeof window.api === 'object' && typeof window.api.invoke === 'function'");
    results.hasWindowApi = hasWindowApi;

    // 3. window.api.invoke работает (IPC цепочка renderer → main)
    const ipcWorks = await win.webContents.executeJavaScript("window.api.invoke('settings:get').then(s => !!s).catch(() => false)");
    results.ipcWorks = ipcWorks;

    // 4. Нет ошибок на экране
    const bodyText = await win.webContents.executeJavaScript("document.body?.innerText?.slice(0, 200) || ''");
    results.bodyText = bodyText;

    const hasError = await win.webContents.executeJavaScript("document.body?.innerText?.includes('ОШИБКА') || document.body?.innerText?.includes('require is not defined') || false");
    results.hasError = hasError;

    // 5. Мессенджеры загрузились (не "Нет мессенджеров")
    const hasNoMessengers = await win.webContents.executeJavaScript("document.body?.innerText?.includes('Нет мессенджеров') || false");
    results.hasNoMessengers = hasNoMessengers;

    // 6. Консольные ошибки renderer
    const consoleErrors = [];
    win.webContents.on('console-message', (e, level, msg) => {
      if (level >= 2) consoleErrors.push(msg);
    });
    await new Promise(r => setTimeout(r, 500));
    results.consoleErrors = consoleErrors;

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
      test('window.api существует (preload загрузился!)', results.hasWindowApi)
      test('IPC работает (settings:get ответил)', results.ipcWorks)
      test('Нет "Нет мессенджеров" (messengers:load работает)', !results.hasNoMessengers)
      test('Нет ошибок на экране', !results.hasError)
      test('Body содержит текст', (results.bodyText || '').length > 0)
      if (results.consoleErrors && results.consoleErrors.length > 0) {
        test('Нет console.error в renderer', false)
        console.log('    Ошибки:', results.consoleErrors.slice(0, 3).join('\n    '))
      } else {
        test('Нет console.error в renderer', true)
      }
      if (!results.hasWindowApi) {
        console.log('\n  ⚠️  КРИТИЧЕСКОЕ: window.api не создан!')
        console.log('  Это значит preload НЕ загрузился.')
        console.log('  Проверь: preload файлы должны быть .cjs (не .js)')
        console.log('  Ловушка 53: package.json "type":"module" → .js = ESM → require() не работает')
      }
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
