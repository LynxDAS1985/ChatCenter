#!/usr/bin/env node
// Запуск electron-vite dev без ELECTRON_RUN_AS_NODE
// (эта переменная наследуется от VS Code/Claude Code и ломает Electron API)
const { spawn } = require('child_process')
const path = require('path')

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
