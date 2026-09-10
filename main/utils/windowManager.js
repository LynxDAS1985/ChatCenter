// v0.84.4: Window creation — extracted from main.js
// v0.91.0: Откат к BrowserWindow + webviewTag после серии v0.89.46-v0.90.2.
// Миграция на BaseWindow+WebContentsView невозможна на Windows 11 из-за известных
// Electron bugs (см. .memory-bank/mistakes/electron-core.md):
//   - Issue #44934: App crashes when adding child view to WebContentsView on Windows 11
//   - Issue #45367: addChildView(WebContentsView) is not rendering properly
//   - Issue #44897: preload не загружается в child WebContentsView
// v0.95.25: spellcheck RU + EN + context-menu suggestions через spellcheckHandler.

import { screen, nativeImage } from 'electron'
import { attachSpellcheckContextMenu } from '../handlers/spellcheckHandler.js'
// v1.2.443: знак приложения рисуем в память из единого источника — не зависим от того,
// нашёлся ли файл на диске (в разработке и в установленной версии пути разные).
import { drawMark } from '../../shared/appIconMark.js'
// v1.2.202: чистая логика памяти окна (тестируется без Electron) — см. windowBounds.vitest.js.
import { buildSavedBounds, restorePlan } from './windowBounds.js'
// v1.2.205 (TODO-31): слежение за dev-запросами вынесено в отдельный файл (разгрузка windowManager).
import { attachDevRequestTiming } from './devRequestTiming.js'

let _deps = null

function getPreloadPath() {
  const { isDev, __dirname, path } = _deps
  if (isDev) {
    return path.join(__dirname, '../../main/preloads/app.preload.cjs')
  }
  // electron-vite 5 собирает preload как .mjs
  return path.join(__dirname, '../preload/index.mjs')
}

/**
 * @param {Object} deps
 * @param {Object} deps.BrowserWindow
 * @param {Object} deps.path
 * @param {boolean} deps.isDev
 * @param {string} deps.__dirname
 * @param {Object} deps.storage
 * @param {Function} deps.getForceQuit
 * @param {Function} deps.getTray
 * @param {Function} deps.setMainWindow
 * @param {Function} deps.getMainWindow
 */
export function createWindow(deps) {
  _deps = deps
  const { BrowserWindow, path, isDev, __dirname, storage, getForceQuit, getTray, setMainWindow, getMainWindow } = deps
  const windowStart = Date.now()
  const wlog = (label) => console.log(`[startup-window] +${Date.now() - windowStart}ms ${label}`)

  // v1.2.200/202: восстановление размеров/позиции + состояния «развёрнуто». Если сохранённая
  // позиция вне видимых экранов — x/y не задаются (окно по центру), чтобы не «пропало».
  const saved = storage.get('windowBounds', { width: 1400, height: 900 })
  let displays = []
  try { displays = screen.getAllDisplays() } catch (_) {}
  const plan = restorePlan(saved, displays)
  // v1.2.203 (🟡-2): строка в журнал — чтобы при жалобе «окно не помнит размеры» было видно,
  // что именно восстановлено, без ручного чтения файла настроек.
  wlog(`restore maximized=${plan.maximize} pos=${plan.x == null ? 'center' : `${plan.x},${plan.y}`} size=${plan.width}x${plan.height}`)

  // v1.2.443: свой значок окна. Раньше не задавался вовсе — в разработке окно и панель
  // задач показывали стандартный значок Electron (в журнале сборки это же было видно как
  // «default Electron icon is used»). У СОБРАННОГО приложения значок берётся из
  // build/icon.ico через electron-builder, здесь — для запуска из терминала.
  // v1.2.444: рисуем ДО создания окна и под защитой. Раньше вызов стоял прямо в списке
  // настроек: ошибка рисования означала бы, что окно не создастся ВООБЩЕ (вызов createWindow
  // в main.js ничем не обёрнут), причём молча. Теперь сбой = окно без своего значка + запись.
  const iconT0 = Date.now()
  let appIcon
  try {
    appIcon = nativeImage.createFromBuffer(drawMark({ size: 128, order: 'bgra' }), { width: 128, height: 128 })
    wlog(`icon drawn 128px in ${Date.now() - iconT0}ms`)
  } catch (e) {
    wlog(`icon FAILED: ${(e && e.message) || e} — окно откроется со стандартным значком`)
  }

  const mainWindow = new BrowserWindow({
    width: plan.width,
    height: plan.height,
    x: plan.x,
    y: plan.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    icon: appIcon,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#16213e',
      symbolColor: '#ffffff',
      height: 48
    },
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
      backgroundThrottling: false,
      // v0.95.25: spellcheck для input/textarea в renderer.
      // По умолчанию Electron включает spellcheck, но язык — только en-US.
      // Русский включается через session.setSpellCheckerLanguages (см. ниже).
      spellcheck: true,
    }
  })

  // v0.95.25: настраиваем языки spellchecker (RU + EN) + контекстное меню с
  // предложениями вариантов через handleSpellcheckContextMenu. Chromium встроен
  // Hunspell + словари для обоих языков — без внешних зависимостей.
  // См. [Electron Spellchecker docs](https://www.electronjs.org/docs/latest/tutorial/spellchecker)
  // и .memory-bank/decisions.md (ADR-XX spellcheck).
  try {
    mainWindow.webContents.session.setSpellCheckerLanguages(['ru', 'en-US'])
  } catch (err) {
    console.warn('[spellcheck] setSpellCheckerLanguages failed:', err?.message)
  }
  // ПКМ-меню с вариантами правильных слов + «Добавить в словарь».
  try {
    const { Menu, MenuItem } = deps
    if (Menu && MenuItem) {
      attachSpellcheckContextMenu({ Menu, MenuItem, webContents: mainWindow.webContents })
    }
  } catch (err) {
    console.warn('[spellcheck] attach context menu failed:', err?.message)
  }

  // Отключаем throttling JS при свёрнутом/скрытом окне —
  // без этого MutationObserver, Notification hooks и IPC в WebView замораживаются
  mainWindow.webContents.backgroundThrottling = false

  // v1.2.200: восстанавливаем состояние «развёрнуто на весь экран». Раньше сохранялся
  // только прямоугольник, поэтому развёрнутое окно открывалось большим и съехавшим,
  // но НЕ развёрнутым. Делаем ДО показа, чтобы не было мигания.
  if (plan.maximize) { try { mainWindow.maximize() } catch (_) {} }

  // v0.85.3: Логируем ВСЕ ошибки renderer в main process (chatcenter.log)
  // Без этого ошибки preload (require is not defined) видны ТОЛЬКО в DevTools
  // v0.85.5: Electron 41 — новый Event API для console-message
  mainWindow.webContents.on('console-message', (e) => {
    if (e.level >= 2) { // 2 = error
      console.error(`[Renderer] ${e.message} (${e.sourceId}:${e.lineNumber})`)
    }
  })
  mainWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    console.error(`[PRELOAD ERROR] ${preloadPath}: ${err.message}`)
  })
  mainWindow.webContents.on('did-start-loading', () => wlog('did-start-loading'))
  mainWindow.webContents.on('dom-ready', () => wlog('dom-ready'))
  mainWindow.webContents.on('did-finish-load', () => wlog('did-finish-load'))
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, failedUrl, isMainFrame) => {
    wlog(`did-fail-load code=${code} desc="${desc}" url=${failedUrl || ''} main=${isMainFrame}`)
  })
  mainWindow.once('ready-to-show', () => {
    wlog('ready-to-show')
    // v1.2.360: НАДЁЖНО применяем «развернуть» ИМЕННО здесь. maximize() при создании (стр. выше) на
    // Windows не всегда срабатывает — окно ещё не отрисовано (журнал: restore maximized=true, но окно
    // не развёрнуто). ready-to-show = окно готово к показу (офиц. Electron docs) → maximize() применяется.
    // Вызов при создании оставлен как первая попытка; если он сработал — здесь maximize() уже no-op.
    try {
      if (plan.maximize && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
        mainWindow.maximize()
      }
    } catch (_) {}
    // Запись-подтверждение: видно, совпало ли «хотели развернуть» с «реально развёрнуто».
    try { wlog(`post-ready maximize wanted=${plan.maximize} isMaximized=${mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : 'n/a'}`) } catch (_) {}
  })

  if (isDev) {
    const devUrl = 'http://localhost:5173'
    attachDevRequestTiming(mainWindow, wlog)
    wlog(`loadURL start ${devUrl}`)
    mainWindow.loadURL(devUrl)
      .then(() => wlog(`loadURL resolved ${devUrl}`))
      .catch(err => wlog(`loadURL failed ${err.message}`))
  } else {
    const rendererPath = path.join(__dirname, '../renderer/index.html')
    wlog(`loadFile start ${rendererPath}`)
    mainWindow.loadFile(rendererPath)
      .then(() => wlog(`loadFile resolved ${rendererPath}`))
      .catch(err => wlog(`loadFile failed ${err.message}`))
  }

  // Сохраняем размер/позицию + состояние «развёрнуто» при изменении.
  // v1.2.200: когда окно развёрнуто, getBounds() отдаёт «развёрнутый» прямоугольник
  // (−7,−7, шире экрана). Храним ОБЫЧНЫЙ размер (getNormalBounds) + флаг isMaximized —
  // иначе при следующем запуске окно открывалось большим и съехавшим, но не развёрнутым,
  // а после сворачивания из полноэкранного терялся «обычный» размер.
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    // v1.2.346: НЕ сохраняем в свёрнутом/скрытом (трей) состоянии — там isMaximized()=false и границы
    // искажены; из-за этого терялось «развёрнуто на весь экран» (свернул/спрятал → ложное false
    // перезатирало сохранённое true). Журнал: restore maximized=true (11:02) → false (12:03).
    if (mainWindow.isMinimized() || !mainWindow.isVisible()) return
    storage.set('windowBounds', buildSavedBounds({
      isMaximized: mainWindow.isMaximized(),
      normalBounds: mainWindow.getNormalBounds(),
      bounds: mainWindow.getBounds(),
    }))
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)
  mainWindow.on('maximize', saveBounds)
  mainWindow.on('unmaximize', saveBounds)

  // Свернуть в трей вместо закрытия
  mainWindow.on('close', (e) => {
    // v1.2.346: зафиксировать финальное ВИДИМОЕ состояние (развёрнуто/размер/позиция) ДО скрытия/выхода —
    // окно ещё видимо, поэтому saveBounds сохранит правильный isMaximized (а не ложное false при скрытии).
    saveBounds()
    const settings = storage.get('settings', { minimizeToTray: true })
    const tray = getTray()
    if (!getForceQuit() && tray && settings.minimizeToTray !== false) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    setMainWindow(null)
  })

  // IPC window-state: renderer точно знает состояние окна (focus/blur/minimize/restore)
  // Надёжнее чем document.hidden или document.hasFocus() в renderer
  const sendWindowState = (focused) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('window-state', { focused }) } catch {}
    }
  }
  mainWindow.on('focus', () => sendWindowState(true))
  mainWindow.on('blur', () => sendWindowState(false))
  mainWindow.on('minimize', () => sendWindowState(false))
  mainWindow.on('restore', () => sendWindowState(true))
  mainWindow.on('show', () => sendWindowState(mainWindow.isFocused()))

  setMainWindow(mainWindow)
  return mainWindow
}
