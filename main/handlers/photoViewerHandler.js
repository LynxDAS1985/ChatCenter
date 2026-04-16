// v0.87.28: Отдельное BrowserWindow для просмотра фото.
// Создаётся через IPC 'photo:open' с { src }. Окно frameless, resizable, movable,
// с кнопкой «закрепить поверх». Принимает cc-media:// URL и отображает фото
// с pan/zoom колёсиком.
import { ipcMain, BrowserWindow, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

let photoWindow = null

// Путь к preload: в dev — исходник main/preloads/, в prod — собранный out/preload/
function getPhotoPreloadPath() {
  if (isDev) {
    return path.join(__dirname, '../../main/preloads/photoViewer.preload.cjs')
  }
  const prodMjs = path.join(__dirname, '../preload/photoViewer.mjs')
  const prodJs = path.join(__dirname, '../preload/photoViewer.js')
  if (fs.existsSync(prodMjs)) return prodMjs
  if (fs.existsSync(prodJs)) return prodJs
  // Fallback на source (будет работать если asar не применяется)
  return path.join(__dirname, '../../main/preloads/photoViewer.preload.cjs')
}

function getPhotoHtmlPath() {
  if (isDev) return path.join(__dirname, '../../main/photo-viewer.html')
  return path.join(__dirname, '../main/photo-viewer.html')
}

export function registerPhotoViewerHandler() {
  ipcMain.handle('photo:open', async (_, { src }) => {
    try {
      if (!src) return { ok: false, error: 'no src' }
      if (photoWindow && !photoWindow.isDestroyed()) {
        // Переиспользуем существующее окно — просто меняем картинку
        photoWindow.webContents.send('photo:set-src', { src })
        photoWindow.focus()
        return { ok: true, reused: true }
      }
      const primary = screen.getPrimaryDisplay()
      const w = Math.min(900, primary.workAreaSize.width - 120)
      const h = Math.min(700, primary.workAreaSize.height - 120)
      photoWindow = new BrowserWindow({
        width: w,
        height: h,
        frame: false,
        resizable: true,
        movable: true,
        minimizable: true,
        maximizable: true,
        fullscreenable: true,
        alwaysOnTop: false,
        backgroundColor: '#0a0a0a',
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: getPhotoPreloadPath(),
        },
      })
      photoWindow.once('ready-to-show', () => {
        photoWindow?.show()
        photoWindow?.webContents.send('photo:set-src', { src })
      })
      photoWindow.on('closed', () => { photoWindow = null })
      await photoWindow.loadFile(getPhotoHtmlPath())
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('photo:close', () => {
    try { photoWindow?.close(); photoWindow = null; return { ok: true } }
    catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('photo:toggle-pin', (_, { on }) => {
    try {
      if (!photoWindow || photoWindow.isDestroyed()) return { ok: false }
      photoWindow.setAlwaysOnTop(!!on, 'floating')
      return { ok: true, on: !!on }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('photo:minimize', () => { try { photoWindow?.minimize() } catch(_) {}; return { ok: true } })
  ipcMain.handle('photo:maximize', () => {
    try {
      if (!photoWindow) return { ok: false }
      if (photoWindow.isMaximized()) photoWindow.unmaximize(); else photoWindow.maximize()
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })
}
