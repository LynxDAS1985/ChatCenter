#!/usr/bin/env node
// Запуск electron-vite dev без ELECTRON_RUN_AS_NODE
// (эта переменная наследуется от VS Code/Claude Code и ломает Electron API)
const { spawn } = require('child_process')
const path = require('path')

const fs = require('fs')

// v0.80.5: Очистка vite-кэша при запуске (ловушка 44)
const viteCache = path.join(__dirname, '..', 'node_modules', '.vite')
if (fs.existsSync(viteCache)) {
  fs.rmSync(viteCache, { recursive: true, force: true })
  console.log('[dev] Vite cache cleared')
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// На Windows нужно shell:true для .cmd файлов
const child = spawn('electron-vite', ['dev'], {
  env,
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..')
})

child.on('exit', code => process.exit(code || 0))
