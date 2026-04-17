// v0.84.4: Logger — вынесен из main.js
import fs from 'node:fs'
import path from 'node:path'

// v0.85.9: увеличено 500KB → 2MB (Pipeline Trace пишется в лог)
const LOG_MAX_SIZE = 2 * 1024 * 1024

let logFilePath = null
let _openLogViewer = null // будет установлена из main.js
let _lastAutoLogOpen = 0

export function setLogViewerOpener(fn) { _openLogViewer = fn }
export function getLogFilePath() { return logFilePath }

export function initLogger(userDataPath) {
  logFilePath = path.join(userDataPath, 'chatcenter.log')
  try {
    if (fs.existsSync(logFilePath) && fs.statSync(logFilePath).size > LOG_MAX_SIZE) {
      const content = fs.readFileSync(logFilePath, 'utf8')
      fs.writeFileSync(logFilePath, content.slice(content.length / 2))
    }
  } catch {}
  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)
  function writeLog(level, args) {
    // v0.87.38: toLocaleString гарантирует ЛОКАЛЬНОЕ время (getHours мог давать UTC)
    const ts = new Date().toLocaleString('sv-SE').replace('T', ' ')
    const msg = `[${ts}] [${level}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`
    try { fs.appendFileSync(logFilePath, msg) } catch (e) { origError('[Logger] Write failed:', e.code, logFilePath) }
  }
  function autoOpenLogOnError() {
    const now = Date.now()
    if (now - _lastAutoLogOpen < 30000) return
    _lastAutoLogOpen = now
    setTimeout(() => { try { if (_openLogViewer) _openLogViewer() } catch {} }, 500)
  }
  // Тестовая запись при инициализации — если файл создаётся, логгер работает
  try {
    fs.appendFileSync(logFilePath, `[${new Date().toISOString().slice(0,19).replace('T',' ')}] [INFO] === Logger init: ${logFilePath} ===\n`)
    origLog('[Logger] Writing to:', logFilePath)
  } catch(e) { origError('[Logger] CANNOT WRITE:', logFilePath, e.code, e.message) }
  console.log = (...args) => { origLog(...args); writeLog('INFO', args) }
  console.warn = (...args) => { origWarn(...args); writeLog('WARN', args) }
  console.error = (...args) => { origError(...args); writeLog('ERROR', args); autoOpenLogOnError() }
  console.debug = (...args) => { origLog(...args); writeLog('DEBUG', args) }
}

export function clearLogFile() {
  if (!logFilePath) return
  try { fs.writeFileSync(logFilePath, '') } catch {}
}

export function readLogFile(maxLines = 500) {
  if (!logFilePath || !fs.existsSync(logFilePath)) return ''
  try {
    const content = fs.readFileSync(logFilePath, 'utf8')
    return content.split('\n').slice(-maxLines).join('\n')
  } catch { return '' }
}
