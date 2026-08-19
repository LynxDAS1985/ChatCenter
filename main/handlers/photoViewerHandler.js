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

// v1.2.298: сырой путь файла (C:\… из tg:download-media = file.local.path) → адрес file:///…,
// иначе <img src> его не грузит (и CSP не разрешает file: без явного адреса). Уже-адреса
// (cc-media из чата, http/https/data/blob/file) не трогаем. Как в videoPlayerHandler (resolveVideoSrc).
function resolvePhotoSrc(src) {
  if (!src || typeof src !== 'string') return src
  if (/^(cc-media|https?|data|blob|file):/i.test(src)) return src
  try { return 'file:///' + encodeURI(src.replace(/\\/g, '/')) } catch (_) { return src }
}

export function registerPhotoViewerHandler() {
  ipcMain.handle('photo:open', async (_, payload) => {
    try {
      // v0.87.31: принимаем либо одиночный { src }, либо массив { srcs, index }
      const raw = Array.isArray(payload?.srcs) && payload.srcs.length
        ? payload.srcs.filter(Boolean)
        : payload?.src ? [payload.src] : []
      if (!raw.length) return { ok: false, error: 'no src' }
      const srcs = raw.map(resolvePhotoSrc) // v1.2.298: сырой путь → file:///
      // v1.2.298: лог (как у видео) — видно, найден ли preload и какой адрес у фото, если снова не откроется.
      try { console.log('[photo:open] srcs=' + srcs.length + ' preloadOk=' + fs.existsSync(getPhotoPreloadPath()) + ' s0=' + String(srcs[0] || '').slice(0, 70)) } catch (_) {}
      const index = Math.max(0, Math.min(srcs.length - 1, Number(payload?.index) || 0))
      if (photoWindow && !photoWindow.isDestroyed()) {
        photoWindow.webContents.send('photo:set-srcs', { srcs, index })
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
          // v1.2.297: sandbox:false — иначе собранный ESM-preload (out/preload/photoViewer.mjs) НЕ грузится
          // в установленной версии (в песочнице preload обязан быть CommonJS). Без preload нет window.photo:
          // фото не ставится (виден alt «photo») и окно не закрывается. Все прочие окна проекта тоже sandbox:false.
          sandbox: false,
          preload: getPhotoPreloadPath(),
        },
      })
      photoWindow.once('ready-to-show', () => {
        photoWindow?.show()
        photoWindow?.webContents.send('photo:set-srcs', { srcs, index })
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
