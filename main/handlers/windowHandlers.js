// v0.87.27: IPC-обработчики управления главным окном (hide/minimize/always-on-top).
// Вынесено из main.js чтобы соблюсти лимит 600 строк.
import { ipcMain } from 'electron'

export function registerWindowHandlers(getMainWindow) {
  ipcMain.handle('window:hide', () => {
    getMainWindow()?.hide()
    return { ok: true }
  })

  ipcMain.handle('window:minimize', () => {
    getMainWindow()?.minimize()
    return { ok: true }
  })

  // Переключение always-on-top (для PhotoViewer pin)
  ipcMain.handle('window:set-always-on-top', (_, { on }) => {
    try {
      getMainWindow()?.setAlwaysOnTop(!!on, 'floating')
      return { ok: true, on: !!on }
    } catch (e) { return { ok: false, error: e.message } }
  })
}
