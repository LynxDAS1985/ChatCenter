#!/usr/bin/env node
// Production-like launch for normal work/perf checks:
// build renderer/main first, then run Electron from built files.
const { spawn } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
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

async function main() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  await run(npmCmd, ['run', 'build'])
  await run('electron-vite', ['preview'])
}

main().catch((err) => {
  console.error(`[prodlike] ${err.message}`)
  process.exit(1)
})
