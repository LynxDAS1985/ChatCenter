// v0.87.34: Отдельное BrowserWindow для проигрывания видео.
// Открывается через IPC 'video:open' { src } — где src это cc-media://video/... URL
// (cc-media protocol с Range поддержкой позволяет <video> стримить и перематывать).
import { ipcMain, BrowserWindow, screen, app } from 'electron'
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

  // v0.87.38: cc-media:// → file:// для отдельного окна.
  // cc-media:// работает в renderer (http://localhost:5173) но НЕ работает
  // в BrowserWindow с file:// origin (loadFile) для <video src>.
  function resolveVideoSrc(src) {
    if (!src || !src.startsWith('cc-media://')) return src
    try {
      const u = new URL(src)
      const filename = decodeURIComponent(u.pathname.slice(1))
      const mediaDir = path.join(app.getPath('userData'), 'tg-media')
      const filePath = path.join(mediaDir, filename)
      if (fs.existsSync(filePath)) {
        return 'file:///' + encodeURI(filePath.replace(/\\/g, '/'))
      }
    } catch(_) {}
    return src
  }

  ipcMain.handle('video:open', async (_, { src, title, startTime, pip }) => {
    try {
      if (!src) return { ok: false, error: 'no src' }
      // v0.87.38: НЕ конвертируем cc-media:// → file://. Protocol handler теперь
      // использует net.fetch(file://) + bypassCSP:true → работает во ВСЕХ окнах.
      const actualSrc = src
      console.log('[video:open] === DEBUG ===')
      console.log('[video:open] src:', src)
      console.log('[video:open] actualSrc:', actualSrc)
      console.log('[video:open] htmlPath:', getHtmlPath())
      console.log('[video:open] htmlExists:', fs.existsSync(getHtmlPath()))
      console.log('[video:open] preloadPath:', getPreloadPath())
      console.log('[video:open] preloadExists:', fs.existsSync(getPreloadPath()))
      console.log('[video:open] isDev:', isDev)
      if (videoWindow && !videoWindow.isDestroyed()) {
        videoWindow.webContents.send('video:set-src', { src: actualSrc, title, startTime, pip })
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
      videoWindow.once('ready-to-show', () => { videoWindow?.show() })
      // v0.87.38: did-finish-load + 200мс delay — гарантирует что JS на странице
      // выполнился и window.video.onSetSrc зарегистрирован.
      // Раньше: ready-to-show → send → JS ещё не выполнился → IPC терялся → пустой плеер.
      videoWindow.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          if (!videoWindow || videoWindow.isDestroyed()) return
          // v0.87.38: ТРИ пути доставки src: query params + IPC + executeJavaScript.
          // Если хотя бы один сработает — видео будет играть.
          videoWindow.webContents.send('video:set-src', { src: actualSrc, title, startTime, pip })
          // Путь 3: ПРЯМОЙ inject через executeJavaScript — обходит preload и query
          const injectJS = `
            try {
              var v = document.getElementById('v');
              if (v && (!v.src || v.src === '' || v.src === location.href)) {
                console.log('[video-inject] setting src directly');
                v.src = ${JSON.stringify(actualSrc)};
                v.play().catch(function(){});
                var t = document.getElementById('title');
                if (t) t.textContent = ${JSON.stringify(title || 'Видео')};
                ${startTime ? `v.addEventListener('loadedmetadata', function() { v.currentTime = ${startTime}; }, {once:true});` : ''}
              }
            } catch(e) { console.error('[video-inject] error:', e); }
          `
          videoWindow.webContents.executeJavaScript(injectJS).catch(() => {})
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
        }, 200)
      })
      videoWindow.on('closed', () => { videoWindow = null })
      // v0.87.38: console.log из video-player.html → в наши логи (LogViewer)
      videoWindow.webContents.on('console-message', (_, level, msg) => {
        if (level >= 2) console.error('[video-window]', msg)
        else console.log('[video-window]', msg)
      })
      // v0.87.38: передаём src через query params — НЕ зависит от preload/IPC timing.
      // Раньше: loadFile → ready-to-show → send IPC → preload мог не загрузиться → src пуст.
      await videoWindow.loadFile(getHtmlPath(), {
        query: {
          src: actualSrc,
          title: title || 'Видео',
          startTime: String(startTime || 0),
          pip: pip ? '1' : '',
        }
      })
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
