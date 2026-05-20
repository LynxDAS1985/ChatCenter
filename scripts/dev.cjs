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

// v0.89.47 (Совет 4): фильтруем шумные Chromium-логи которые пугают, но безобидны.
// v0.89.48: ослабили — позитивный override. Если в строке есть ERROR/Error/FAIL,
// строку НЕ фильтруем даже если matches noise pattern. Иначе можно проглотить
// важную диагностику (например `... ERROR ... preload script must have absolute`
// частично совпадала с фильтром в v0.89.47).
// CC_DEV_VERBOSE=1 → показывает ВСЁ.
const VERBOSE = process.env.CC_DEV_VERBOSE === '1'
const NOISE = [
  /crashpad.*not connected/i,
  /DeprecationWarning.*shell option true/i,
  /Use `node --trace-deprecation/i,
]
const IMPORTANT = /\bERROR\b|\bError\b|\bFAIL\b|\bFatal\b/
function filterChunk(chunk, stream) {
  if (VERBOSE) { stream.write(chunk); return }
  const text = chunk.toString('utf8')
  const lines = text.split(/(\r?\n)/)
  let out = ''
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i]
    const eol = lines[i + 1] || ''
    if (!line) { out += eol; continue }
    // Если строка важная — пропускаем даже при совпадении с noise (override).
    if (NOISE.some(rx => rx.test(line)) && !IMPORTANT.test(line)) continue
    out += line + eol
  }
  if (out) stream.write(out)
}

// На Windows нужно shell:true для .cmd файлов
const child = spawn('electron-vite', ['dev'], {
  env,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
  cwd: path.join(__dirname, '..')
})
child.stdout?.on('data', (chunk) => filterChunk(chunk, process.stdout))
child.stderr?.on('data', (chunk) => filterChunk(chunk, process.stderr))

child.on('exit', code => process.exit(code || 0))
