const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

async function main() {
  const mod = await import(pathToFileURL('main/utils/systemDiagnostics.js').href)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-diag-'))
  const logPath = path.join(dir, 'chatcenter.log')
  fs.writeFileSync(logPath, '[2026-06-19 15:00:00] [ERROR] apiKey=abc broken\n', 'utf8')
  fs.writeFileSync(path.join(dir, 'ai-errors.log'), 'clientSecret=secret\n', 'utf8')

  const app = {
    getPath(name) {
      assert.strictEqual(name, 'userData')
      return dir
    },
    getVersion() { return '1.2.8' },
    getName() { return 'ChatCenter' },
  }

  const snapshot = mod.collectSystemDiagnostics({
    app,
    readLogFile: () => fs.readFileSync(logPath, 'utf8'),
    getLogFilePath: () => logPath,
  })

  assert.strictEqual(snapshot.ok, true)
  assert.strictEqual(snapshot.files.log.exists, true)
  assert.ok(snapshot.paths.reportPath.endsWith('system-diagnostics-report.json'))
  assert.ok(snapshot.logText.includes('apiKey=***'))
  assert.ok(!snapshot.aiErrorsText.includes('secret'))

  const saved = mod.saveSystemDiagnosticsReport({ app, report: { token: 'abc', nested: { ok: true } } })
  assert.strictEqual(saved.ok, true)
  assert.ok(fs.existsSync(saved.path))
  const text = fs.readFileSync(saved.path, 'utf8')
  assert.ok(text.includes('token'))
  assert.ok(!text.includes('abc'))
  const read = mod.readSystemDiagnosticsReport({ app })
  assert.strictEqual(read.ok, true)
  assert.strictEqual(read.report.token, '***')
  assert.strictEqual(read.report.nested.ok, true)

  fs.rmSync(dir, { recursive: true, force: true })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
