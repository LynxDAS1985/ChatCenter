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

  // v0.87.94: умный сериализатор для логов.
  // Раньше JSON.stringify(error) → '{}' (Error.message/stack — non-enumerable),
  // и JSON.stringify({event}) → '{}' для DOM-событий. Теперь видим реальные данные.
  function smartStringify(a) {
    if (typeof a === 'string') return a
    if (a === null || a === undefined) return String(a)
    if (a instanceof Error) {
      // Имя, message и stack у Error — non-enumerable. Достаём явно.
      const stack = (a.stack || '').split('\n').slice(0, 4).join(' | ')
      return `${a.name || 'Error'}: ${a.message || '(no message)'}${stack ? ' | STACK: ' + stack : ''}`
    }
    if (typeof a === 'object') {
      try {
        const json = JSON.stringify(a)
        if (json && json !== '{}') return json
        // Пустой объект → пробуем non-enumerable свойства (например DOM Event)
        const propNames = Object.getOwnPropertyNames(a)
        if (propNames.length === 0) return '{empty-object}'
        const props = {}
        for (const k of propNames.slice(0, 10)) {
          try {
            const v = a[k]
            // Не сериализуем функции и циклические ссылки
            if (typeof v !== 'function') props[k] = (typeof v === 'object' && v !== null) ? '[object]' : v
          } catch (_) {}
        }
        return JSON.stringify(props) || '{non-stringifiable}'
      } catch (e) { return '{stringify-failed: ' + e.message + '}' }
    }
    return String(a)
  }

  function writeLog(level, args) {
    // v0.87.38: toLocaleString гарантирует ЛОКАЛЬНОЕ время (getHours мог давать UTC)
    const ts = new Date().toLocaleString('sv-SE').replace('T', ' ')
    const msg = `[${ts}] [${level}] ${args.map(smartStringify).join(' ')}\n`
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
  console.error = (...args) => {
    origError(...args)

    // v0.87.96: GramJS internal reconnect (Error: TIMEOUT в client/updates.js) —
    // это НЕ ошибка приложения, а нормальное сетевое событие при разрыве связи
    // с серверами Телеграма. Перенаправляем в WARN чтобы не пугать красным
    // в журнале (попадёт в кнопку «Предупр.» вместо «Ошибки»).
    const text = args.map(a => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return (a.message || '') + ' ' + (a.stack || '')
      try { return JSON.stringify(a) } catch (_) { return '' }
    }).join(' ')
    const isGramjsReconnect =
      /Error:\s*TIMEOUT/i.test(text) &&
      /telegram[\\/]client[\\/]updates/i.test(text)
    if (isGramjsReconnect) {
      writeLog('WARN', ['[GramJS reconnect]', ...args])
      return
    }

    // v0.87.94: если все args — пустые объекты, добавляем stack чтобы найти кто вызвал.
    // Раньше получали [ERROR] {} без указания на источник — невозможно было дебажить.
    const finalArgs = args
    const allEmpty = args.length > 0 && args.every(a =>
      a && typeof a === 'object' && !(a instanceof Error) &&
      Object.keys(a).length === 0 && Object.getOwnPropertyNames(a).length === 0
    )
    if (allEmpty) {
      const trace = new Error('diagnostic').stack.split('\n').slice(2, 6).map(s => s.trim()).join(' | ')
      finalArgs.push('STACK_TRACE:', trace)
    }
    writeLog('ERROR', finalArgs)
    autoOpenLogOnError()
  }
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
