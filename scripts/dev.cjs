#!/usr/bin/env node
// Запуск electron-vite dev без ELECTRON_RUN_AS_NODE
// (эта переменная наследуется от VS Code/Claude Code и ломает Electron API)
const { spawn } = require('child_process')
const path = require('path')

const fs = require('fs')

// v0.87.122: cache очищаем только явно.
// Автоочистка на каждом старте защищала от ловушки 44, но делала каждый dev-запуск холодным.
const viteCache = path.join(__dirname, '..', 'node_modules', '.vite')
const shouldClearViteCache = process.env.CLEAR_VITE_CACHE === '1' || process.argv.includes('--clear-cache')
if (shouldClearViteCache && fs.existsSync(viteCache)) {
  fs.rmSync(viteCache, { recursive: true, force: true })
  console.log('[dev] Vite cache cleared')
} else if (shouldClearViteCache) {
  console.log('[dev] Vite cache already empty')
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
