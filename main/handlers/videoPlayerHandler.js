// v0.87.34: Отдельное BrowserWindow для проигрывания видео.
// Открывается через IPC 'video:open' { src } — где src это cc-media://video/... URL
// (cc-media protocol с Range поддержкой позволяет <video> стримить и перематывать).
import { ipcMain, BrowserWindow, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

let videoWindow = null

function getPreloadPath() {
  if (isDev) return path.join(__dirname, '../../main/preloads/videoPlayer.preload.cjs')
  const prodMjs = path.join(__dirname, '../preload/videoPlayer.mjs')
  const prodJs = path.join(__dirname, '../preload/videoPlayer.js')
  if (fs.existsSync(prodMjs)) return prodMjs
  if (fs.existsSync(prodJs)) return prodJs
  return path.join(__dirname, '../../main/preloads/videoPlayer.preload.cjs')
}

function getHtmlPath() {
  if (isDev) return path.join(__dirname, '../../main/video-player.html')
  return path.join(__dirname, '../main/video-player.html')
}

export function registerVideoPlayerHandler() {
  // v0.87.35: сохраняем bounds перед PiP чтобы потом восстановить
  let prevBounds = null

  ipcMain.handle('video:open', async (_, { src, title, startTime, pip }) => {
    try {
      if (!src) return { ok: false, error: 'no src' }
      if (videoWindow && !videoWindow.isDestroyed()) {
        videoWindow.webContents.send('video:set-src', { src, title, startTime, pip })
        videoWindow.focus()
        return { ok: true, reused: true }
      }
      const primary = screen.getPrimaryDisplay()
      const w = Math.min(1000, primary.workAreaSize.width - 120)
      const h = Math.min(720, primary.workAreaSize.height - 120)
      videoWindow = new BrowserWindow({
        width: w, height: h,
        frame: false,
        resizable: true, movable: true,
        minimizable: true, maximizable: true, fullscreenable: true,
        alwaysOnTop: false,
        backgroundColor: '#000000',
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: getPreloadPath(),
        },
      })
      videoWindow.once('ready-to-show', () => {
        videoWindow?.show()
        videoWindow?.webContents.send('video:set-src', { src, title, startTime, pip })
        // v0.87.36: если запрошен PiP сразу — активируем его
        if (pip) {
          try {
            prevBounds = videoWindow.getBounds()
            const primaryDisp = screen.getPrimaryDisplay()
            const w = 480, h = 270
            const x = primaryDisp.workAreaSize.width - w - 20
            const y = primaryDisp.workAreaSize.height - h - 20
            videoWindow.setBounds({ x, y, width: w, height: h })
            videoWindow.setAlwaysOnTop(true, 'floating')
          } catch(_) {}
        }
      })
      videoWindow.on('closed', () => { videoWindow = null })
      await videoWindow.loadFile(getHtmlPath())
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('video:close', () => {
    try { videoWindow?.close(); videoWindow = null; return { ok: true } }
    catch (e) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('video:toggle-pin', (_, { on }) => {
    try {
      if (!videoWindow || videoWindow.isDestroyed()) return { ok: false }
      videoWindow.setAlwaysOnTop(!!on, 'floating')
      return { ok: true, on: !!on }
    } catch (e) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('video:minimize', () => { try { videoWindow?.minimize() } catch(_) {}; return { ok: true } })
  ipcMain.handle('video:maximize', () => {
    try {
      if (!videoWindow) return { ok: false }
      if (videoWindow.isMaximized()) videoWindow.unmaximize(); else videoWindow.maximize()
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.35: PiP режим — компактное окно в углу, alwaysOnTop, resizable
  ipcMain.handle('video:toggle-pip', (_, { on }) => {
    try {
      if (!videoWindow) return { ok: false }
      if (on) {
        prevBounds = videoWindow.getBounds()
        const primary = screen.getPrimaryDisplay()
        const w = 480, h = 270
        const x = primary.workAreaSize.width - w - 20
        const y = primary.workAreaSize.height - h - 20
        videoWindow.setBounds({ x, y, width: w, height: h })
        videoWindow.setAlwaysOnTop(true, 'floating')
      } else {
        if (prevBounds) videoWindow.setBounds(prevBounds)
        videoWindow.setAlwaysOnTop(false)
      }
      return { ok: true, on: !!on }
    } catch (e) { return { ok: false, error: e.message } }
  })
}
