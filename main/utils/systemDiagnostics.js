import fs from 'node:fs'
import path from 'node:path'

const REPORT_FILE = 'system-diagnostics-report.json'

function redactText(value) {
  return String(value ?? '')
    .replace(/(api[_-]?key|clientSecret|client_secret|token|password|pass|secret)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=***')
    .replace(/("(?:api[_-]?key|clientSecret|client_secret|token|password|pass|secret)"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***')
}

function statFile(filePath) {
  try {
    const stat = fs.statSync(filePath)
    return { exists: true, bytes: stat.size, mtime: stat.mtime.toISOString() }
  } catch {
    return { exists: false, bytes: 0, mtime: null }
  }
}

function tailFile(filePath, maxLines) {
  try {
    if (!fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(-maxLines).join('\n')
  } catch (e) {
    return `read error: ${e.message}`
  }
}

function getReportPath(app) {
  return path.join(app.getPath('userData'), REPORT_FILE)
}

export function collectSystemDiagnostics({ app, readLogFile, getLogFilePath }) {
  const userData = app.getPath('userData')
  const logPath = getLogFilePath()
  const aiErrorsPath = path.join(userData, 'ai-errors.log')
  const reportPath = getReportPath(app)

  return {
    ok: true,
    app: {
      name: app.getName?.() || 'ChatCenter',
      version: app.getVersion?.() || '',
      platform: process.platform,
      arch: process.arch,
      versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
    },
    paths: {
      userData,
      logPath,
      aiErrorsPath,
      reportPath,
    },
    files: {
      log: statFile(logPath),
      aiErrors: statFile(aiErrorsPath),
      report: statFile(reportPath),
    },
    // v1.2.9: читаем весь лог целиком (Infinity), а не последние 1000 строк — иначе ранние события
    // MAX-пачки не попадали в снимок. Файл chatcenter.log ограничен ротацией (2 МБ), поэтому это безопасно.
    logText: redactText(readLogFile(Infinity)),
    aiErrorsText: redactText(tailFile(aiErrorsPath, 200)),
    collectedAt: new Date().toISOString(),
  }
}

export function saveSystemDiagnosticsReport({ app, report }) {
  try {
    const reportPath = getReportPath(app)
    const payload = JSON.stringify(JSON.parse(redactText(JSON.stringify(report || {}))), null, 2)
    fs.writeFileSync(reportPath, payload, 'utf8')
    return { ok: true, path: reportPath, bytes: Buffer.byteLength(payload, 'utf8') }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
