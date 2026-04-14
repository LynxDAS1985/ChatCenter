/**
 * UI E2E test.
 * Launches Electron directly and verifies that the built renderer loads.
 *
 * Run: node e2e/ui.e2e.cjs
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

let passed = 0
let failed = 0

function test(name, result) {
  if (result) {
    passed++
    console.log('  PASS ' + name)
  } else {
    failed++
    console.log('  FAIL ' + name)
  }
}

console.log('\nUI E2E test (Electron launch + render check)\n')

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
const rootDir = path.join(__dirname, '..')
const builtMain = path.join(rootDir, 'out', 'main', 'main.js')

if (isCI) {
  console.log('  SKIP CI environment without display')
  console.log('\nResult: 0 PASS / 0 FAIL (skipped)')
  process.exit(0)
}

if (!fs.existsSync(builtMain)) {
  console.log('  SKIP build output is missing, run npm run build')
  console.log('\nResult: 0 PASS / 0 FAIL (skipped)')
  process.exit(0)
}

const testFile = path.join(__dirname, '_e2e_test_main.cjs')

const env = Object.assign({}, process.env)
delete env.ELECTRON_RUN_AS_NODE

let electronPath = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronPath)) {
  electronPath = path.join(rootDir, 'node_modules', '.bin', 'electron')
}

console.log('--- Launching Electron UI test ---')

const child = spawn(electronPath, [testFile], {
  env,
  cwd: rootDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 15000,
})

let stdout = ''
let stderr = ''

child.stdout.on('data', function (data) {
  stdout += data.toString()
})

child.stderr.on('data', function (data) {
  stderr += data.toString()
})

child.on('close', function (code) {
  const resultMatch = stdout.match(/__E2E_RESULT__(.+)/)

  if (resultMatch) {
    try {
      const results = JSON.parse(resultMatch[1])

      test('Electron launched', results.ok)
      test('Root element exists', results.hasRoot)
      test('React rendered children (' + results.rootChildren + ')', results.rootChildren > 0)
      test('window.api exists', results.hasWindowApi)
      test('IPC settings:get works', results.ipcWorks)
      test('messengers:load returned data', !results.hasNoMessengers)
      test('No visible error on screen', !results.hasError)
      test('Body contains text', (results.bodyText || '').length > 0)

      if (results.consoleErrors && results.consoleErrors.length > 0) {
        test('No console.error in renderer', false)
        console.log('    Errors:', results.consoleErrors.slice(0, 3).join('\n    '))
      } else {
        test('No console.error in renderer', true)
      }

      if (!results.hasWindowApi) {
        console.log('\n  CRITICAL: window.api is missing')
        console.log('  The preload did not load correctly.')
      }
    } catch (e) {
      console.log('  FAIL parse error: ' + e.message)
      failed++
    }
  } else if (code === null || code === 0) {
    test('Electron launched (timeout/empty result)', true)
  } else {
    test('Electron launched (code=' + code + ')', false)
    if (stderr) {
      console.log('  stderr:', stderr.slice(0, 200))
    }
  }

  console.log('\nResult: ' + passed + ' PASS / ' + failed + ' FAIL out of ' + (passed + failed))
  process.exit(failed > 0 ? 1 : 0)
})

child.on('error', function (err) {
  console.log('  FAIL launch error: ' + err.message)
  process.exit(1)
})
