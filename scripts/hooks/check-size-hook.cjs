#!/usr/bin/env node
// Hook для Claude Code: SessionStart и PostToolUse.
// SessionStart (без stdin): запускает fileSizeLimits.test.cjs и печатает предупреждения.
// PostToolUse (со stdin JSON): если изменили src/ или main/ .jsx/.js/.cjs — запускает тест.
//
// Цель: автоматически ловить "ползучий рост" файлов кода чтобы не пропустить лимит.

const { spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const TEST = path.join(ROOT, 'src', '__tests__', 'fileSizeLimits.test.cjs')

function runSizeCheck() {
  const res = spawnSync('node', [TEST], { cwd: ROOT, encoding: 'utf8' })
  const out = (res.stdout || '') + (res.stderr || '')
  const interesting = out.split('\n').filter(l =>
    l.includes('⚠️') || l.includes('❌') || l.includes('📊')
  )
  if (interesting.length) console.log(interesting.join('\n'))
}

function readStdin() {
  try {
    const data = require('fs').readFileSync(0, 'utf8')
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

const input = readStdin()

if (!input) {
  runSizeCheck()
  process.exit(0)
}

const filePath = input?.tool_input?.file_path || input?.tool_response?.filePath || ''
const norm = filePath.replace(/\\/g, '/')
const isCode = /(^|\/)(src|main)\/.*\.(jsx|js|cjs)$/.test(norm)

if (isCode) runSizeCheck()
process.exit(0)
