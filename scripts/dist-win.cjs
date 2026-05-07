#!/usr/bin/env node
// Build Windows installer and leave only the installer .exe in dist/.
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const asar = require('@electron/asar')

const root = path.resolve(__dirname, '..')
const distDir = path.join(root, 'dist')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
      shell: true,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

function assertInsideRoot(target) {
  const resolved = path.resolve(target)
  if (resolved !== distDir && !resolved.startsWith(distDir + path.sep)) {
    throw new Error(`Refusing to clean outside dist: ${resolved}`)
  }
  return resolved
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function removePath(target) {
  const resolved = assertInsideRoot(target)
  const fsPath = process.platform === 'win32' ? `\\\\?\\${resolved}` : resolved
  if (!fs.existsSync(resolved)) return
  if (fs.statSync(resolved).isDirectory()) {
    fs.rmSync(fsPath, { recursive: true, force: true })
  } else {
    fs.unlinkSync(fsPath)
  }
}

function cleanDistribExceptInstaller() {
  assertInsideRoot(distDir)
  if (!fs.existsSync(distDir)) return
  sleep(1500)

  const installers = fs.readdirSync(distDir)
    .filter(name => /^ЦентрЧатов-Setup-.*-x64\.exe$/u.test(name))

  if (installers.length !== 1) {
    throw new Error(`Expected exactly one installer in dist, found ${installers.length}: ${installers.join(', ') || 'none'}`)
  }

  for (const entry of fs.readdirSync(distDir)) {
    if (entry === installers[0]) continue
    removePath(path.join(distDir, entry))
  }

  let leftovers = []
  for (let attempt = 0; attempt < 20; attempt += 1) {
    leftovers = fs.readdirSync(distDir).filter(entry => entry !== installers[0])
    if (!leftovers.length) break
    for (const entry of leftovers) {
      removePath(path.join(distDir, entry))
    }
    sleep(500)
  }
  leftovers = fs.readdirSync(distDir).filter(entry => entry !== installers[0])
  if (leftovers.length) {
    throw new Error(`dist cleanup left extra files:\n  ${leftovers.join('\n  ')}`)
  }

  console.log(`[dist-win] kept installer: dist/${installers[0]}`)
}

function verifyPackagedApp() {
  const asarPath = path.join(distDir, 'win-unpacked', 'resources', 'app.asar')
  assertInsideRoot(asarPath)
  if (!fs.existsSync(asarPath)) {
    throw new Error(`Missing packaged app archive: ${asarPath}`)
  }

  const entries = new Set(asar.listPackage(asarPath).map(p =>
    p.replace(/^[\\/]+/, '').replace(/\\/g, '/')
  ))
  const required = [
    'out/main/main.js',
    'out/renderer/index.html',
    'out/preload/index.mjs',
    'out/preload/monitor.mjs',
    'out/preload/notification.mjs',
    'out/preload/pin.mjs',
    'out/preload/pin-dock.mjs',
    'out/main/notification.html',
    'out/main/photo-viewer.html',
    'out/main/video-player.html',
    'out/preloads/hooks/telegram.hook.js',
    'out/preloads/hooks/max.hook.js',
    'out/preloads/hooks/whatsapp.hook.js',
    'out/preloads/hooks/vk.hook.js',
    'node_modules/telegram/package.json',
    'node_modules/input/package.json',
    'node_modules/libphonenumber-js/package.json',
  ]
  const missing = required.filter(p => !entries.has(p))
  if (missing.length) {
    throw new Error(`Packaged app is missing required files:\n  ${missing.join('\n  ')}`)
  }
  console.log(`[dist-win] package contents verified (${required.length} required files)`)
}

async function main() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  await run(npmCmd, ['run', 'build'])
  await run('electron-builder', ['--win', '--x64'])
  verifyPackagedApp()
  cleanDistribExceptInstaller()
}

main().catch((err) => {
  console.error(`[dist-win] ${err.message}`)
  process.exit(1)
})
