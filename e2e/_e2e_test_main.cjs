const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

app.whenReady().then(async () => {
  const results = {}
  const rootDir = path.join(__dirname, '..')

  try {
    const preloadPath = path.join(rootDir, 'out', 'preload', 'index.mjs')

    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        sandbox: false,
      }
    })

    ipcMain.handle('messengers:load', () => [
      { id: 'test', name: 'Test', url: 'https://test.com', partition: 'persist:test' }
    ])
    ipcMain.handle('settings:get', () => ({ soundEnabled: true, theme: 'dark' }))
    ipcMain.handle('app:get-paths', () => ({ monitorPreload: '' }))
    ipcMain.handle('messengers:save', () => ({ ok: true }))
    ipcMain.handle('settings:save', () => ({ ok: true }))
    ipcMain.handle('window:set-titlebar-theme', () => {})

    const rendererFile = path.join(rootDir, 'out', 'renderer', 'index.html')
    await win.loadFile(rendererFile)

    await new Promise((resolve) => setTimeout(resolve, 3000))

    results.hasRoot = await win.webContents.executeJavaScript("!!document.getElementById('root')")
    results.rootChildren = await win.webContents.executeJavaScript("document.getElementById('root')?.children?.length || 0")
    results.hasWindowApi = await win.webContents.executeJavaScript("typeof window.api === 'object' && typeof window.api.invoke === 'function'")
    results.ipcWorks = await win.webContents.executeJavaScript("window.api.invoke('settings:get').then(s => !!s).catch(() => false)")
    results.bodyText = await win.webContents.executeJavaScript("document.body?.innerText?.slice(0, 200) || ''")
    results.hasError = await win.webContents.executeJavaScript("document.body?.innerText?.includes('ОШИБКА') || document.body?.innerText?.includes('require is not defined') || false")
    results.hasNoMessengers = await win.webContents.executeJavaScript("document.body?.innerText?.includes('Нет мессенджеров') || false")

    const consoleErrors = []
    win.webContents.on('console-message', (event, level, message) => {
      if (level >= 2) {
        consoleErrors.push(message)
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 500))
    results.consoleErrors = consoleErrors

    results.ok = true
  } catch (e) {
    results.ok = false
    results.error = e.message
  }

  process.stdout.write('__E2E_RESULT__' + JSON.stringify(results))
  app.quit()
})
