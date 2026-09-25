#!/usr/bin/env node
// scripts/run-vitest.cjs — v1.2.509
//
// Обёртка вокруг прогона тестов. Делает ровно то же, что `vitest run`, и дополнительно проверяет,
// что прогон СОСТОЯЛСЯ ЦЕЛИКОМ.
//
// 🔴 ЗАЧЕМ (найдено ревью 2026-09-25, TODO-65). Под нагрузкой один файл тестов не смог стартовать
// («Failed to start forks worker … Timeout»), около 33 проверок не выполнились — а команда
// завершилась УСПЕХОМ (код 0) и напечатала «Test Files 234 passed». Красного не было, и «зелёный»
// прогон перестал быть доказательством: часть покрытия молча исчезла.
//
// ЧТО ПРОВЕРЯЕМ ДОПОЛНИТЕЛЬНО:
//   1. в выводе нет «Failed to start … worker» и нет необработанных ошибок прогона;
//   2. число прогнанных файлов не УПАЛО против ожидаемого (файл ниже), с запасом на удаление тестов.
//
// Ожидаемое число хранится в scripts/vitest-files-baseline.json и обновляется командой
// `node scripts/run-vitest.cjs --update-baseline` — делать это нужно осознанно, когда тестовых
// файлов действительно стало больше или меньше.
//
// Аргументы прокидываются в vitest как есть: `node scripts/run-vitest.cjs src/__tests__/foo.js`.
// При запуске с путями (точечный прогон) проверка числа файлов НЕ применяется — она про полный набор.

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const BASELINE = path.join(__dirname, 'vitest-files-baseline.json')
/** Насколько файлов прогон может «просесть» без тревоги (удалили пару тестов — это нормально). */
const ALLOWED_DROP = 3

const argv = process.argv.slice(2)
const updateBaseline = argv.includes('--update-baseline')
const args = argv.filter(a => a !== '--update-baseline')
/** Точечный прогон (переданы пути/фильтры) — проверяем только сбои запуска, но не число файлов. */
const isFullRun = args.every(a => a.startsWith('-'))

const res = spawnSync('npx', ['vitest', 'run', ...args], {
  encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024,
})
const out = (res.stdout || '') + (res.stderr || '')
process.stdout.write(out)

if (res.error) {
  console.error('\n[run-vitest] не удалось запустить прогон: ' + res.error.message)
  process.exit(1)
}

const problems = []

// 1. Файл, который не смог стартовать. Именно этот случай выдавал ложный «зелёный».
if (/Failed to start .*worker/i.test(out)) problems.push('какой-то файл тестов НЕ ЗАПУСТИЛСЯ (Failed to start worker)')
if (/Unhandled Error/i.test(out)) problems.push('в прогоне была необработанная ошибка (Unhandled Error)')

// 2. Сколько файлов реально прошло.
const m = out.match(/Test Files\s+(?:\d+ failed \| )?(\d+) passed/)
const passedFiles = m ? Number(m[1]) : null
let baseline = null
try { baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files } catch (_) {}

if (updateBaseline) {
  if (passedFiles === null) { console.error('\n[run-vitest] не нашёл в выводе число файлов — обновлять нечего'); process.exit(1) }
  fs.writeFileSync(BASELINE, JSON.stringify({ files: passedFiles, updated: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')
  console.log(`\n[run-vitest] ожидаемое число файлов обновлено: ${passedFiles}`)
  process.exit(res.status === 0 ? 0 : res.status)
}

if (isFullRun && passedFiles !== null && typeof baseline === 'number' && passedFiles < baseline - ALLOWED_DROP) {
  problems.push(`прогнано файлов ${passedFiles}, а ожидалось около ${baseline} — часть тестов не выполнялась`)
}

if (problems.length) {
  console.error('\n❌ [run-vitest] прогон НЕ засчитан:')
  for (const p of problems) console.error('   • ' + p)
  console.error('   Прогон под нагрузкой ломается сам — повторите, когда ничего тяжёлого не выполняется.')
  console.error('   Если тестовых файлов стало меньше осознанно: node scripts/run-vitest.cjs --update-baseline')
  process.exit(1)
}

process.exit(res.status === 0 ? 0 : res.status)
