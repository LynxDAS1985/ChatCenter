#!/usr/bin/env node
// Build Windows installer and leave only installer .exe files in dist/ (all kept, rest cleaned).
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

// v1.2.299: чистим dist от вспомогательных файлов сборки, но СОХРАНЯЕМ все установщики .exe.
// Раньше требовался РОВНО ОДИН установщик (throw при нескольких) — после решения хранить
// прошлые версии (feedback_keep_old_installers) их стало несколько → эта проверка падала
// ДО очистки → в dist оставался мусор (win-unpacked, latest.yml, builder-debug.yml, *.blockmap).
// Теперь: оставляем ЛЮБОЕ число .exe-установщиков, удаляем всё остальное. Автообновления в
// проекте нет (нет electron-updater/autoUpdater), поэтому latest.yml и *.blockmap не нужны.
function isInstaller(name) {
  return /^ЦентрЧатов-Setup-.*-x64\.exe$/u.test(name)
}

function cleanDistribExceptInstaller() {
  assertInsideRoot(distDir)
  if (!fs.existsSync(distDir)) return
  sleep(1500)

  const installers = fs.readdirSync(distDir).filter(isInstaller)
  if (!installers.length) {
    throw new Error('No installer .exe found in dist after build')
  }

  // Удаляем всё, что НЕ установщик (.exe): win-unpacked, latest.yml, builder-debug.yml, *.blockmap.
  let leftovers = []
  for (let attempt = 0; attempt < 20; attempt += 1) {
    leftovers = fs.readdirSync(distDir).filter(entry => !isInstaller(entry))
    if (!leftovers.length) break
    for (const entry of leftovers) {
      removePath(path.join(distDir, entry))
    }
    sleep(500)
  }
  leftovers = fs.readdirSync(distDir).filter(entry => !isInstaller(entry))
  if (leftovers.length) {
    throw new Error(`dist cleanup left extra files:\n  ${leftovers.join('\n  ')}`)
  }

  console.log(`[dist-win] kept installers: ${installers.join(', ')}`)
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
    // v1.2.191: GramJS ('telegram') удалён при миграции на TDLib — раньше здесь была запись
    // 'node_modules/telegram/package.json', проверка требовала несуществующий модуль и валила
    // сборку. TDLib-бэкенд — main/native/backends/tdlib*.js. ('input' — тоже остаток GramJS,
    // пока в deps, не используется; оставлен в проверке, т.к. установлен и не валит.)
    'node_modules/input/package.json',
    'node_modules/libphonenumber-js/package.json',
  ]
  const missing = required.filter(p => !entries.has(p))
  if (missing.length) {
    throw new Error(`Packaged app is missing required files:\n  ${missing.join('\n  ')}`)
  }
  console.log(`[dist-win] package contents verified (${required.length} required files)`)

  // v1.2.192: нативная библиотека TDLib (движок Telegram) — tdjson.dll — вынесена ИЗ asar
  // через asarUnpack (koffi не может загрузить .dll из архива → Win32 error 126 при входе
  // в Telegram). Проверяем её как РЕАЛЬНЫЙ файл в app.asar.unpacked, а НЕ в списке asar.
  // Раньше проверка (16 файлов) её не покрывала → давала ложное «всё нормально».
  const unpackedTdjson = path.join(
    distDir, 'win-unpacked', 'resources', 'app.asar.unpacked',
    'node_modules', '@prebuilt-tdlib', 'win32-x64', 'tdjson.dll'
  )
  assertInsideRoot(unpackedTdjson)
  if (!fs.existsSync(unpackedTdjson)) {
    throw new Error(`Packaged app is missing native TDLib library (tdjson.dll):\n  ${unpackedTdjson}\n  → проверь build.asarUnpack в package.json`)
  }
  console.log('[dist-win] native TDLib library present: app.asar.unpacked/.../tdjson.dll')
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
