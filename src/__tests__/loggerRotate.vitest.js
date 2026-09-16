// v1.2.468: журнал больше не теряет отрезанную половину.
//
// ЗАЧЕМ (реальный случай 2026-09-16): пользователь пожаловался «часто вижу окно про недоступность
// Ozon», а в журнале нашлась ровно ОДНА такая запись. Причина — при старте файл больше 2 МБ
// обрезался пополам, и первая половина исчезала навсегда. Подтвердить «часто» было нечем.
//
// Теперь отрезанная половина уходит в соседний файл `chatcenter.prev.log`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initLogger, getLogFilePath } from '../../main/utils/logger.js'

let dir
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-log-')) })
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ок */ } })

const MB = 1024 * 1024

describe('журнал: отрезанная половина сохраняется (v1.2.468)', () => {
  it('🔴 ГЛАВНОЕ: файл больше 2 МБ → старая половина попадает в chatcenter.prev.log', () => {
    const log = path.join(dir, 'chatcenter.log')
    // «старое» и «новое» — разные буквы, чтобы точно видеть, что куда попало
    const old = 'A'.repeat(1.5 * MB)
    const fresh = 'B'.repeat(1.5 * MB)
    fs.writeFileSync(log, old + fresh)

    initLogger(dir)

    const prev = path.join(dir, 'chatcenter.prev.log')
    expect(fs.existsSync(prev), 'запасной файл должен появиться').toBe(true)
    expect(fs.readFileSync(prev, 'utf8').startsWith('A')).toBe(true)
    // в основном осталась вторая половина
    const now = fs.readFileSync(log, 'utf8')
    expect(now.length).toBeLessThan(old.length + fresh.length)
    expect(now.includes('B')).toBe(true)
  })

  it('🔴 ЛОВУШКА: маленький файл НЕ трогаем и запасной НЕ создаём', () => {
    const log = path.join(dir, 'chatcenter.log')
    fs.writeFileSync(log, 'короткая запись')
    initLogger(dir)
    expect(fs.readFileSync(log, 'utf8')).toContain('короткая запись')
    expect(fs.existsSync(path.join(dir, 'chatcenter.prev.log'))).toBe(false)
  })

  it('журнала ещё нет → запуск не падает, путь выставлен', () => {
    expect(() => initLogger(dir)).not.toThrow()
    expect(getLogFilePath()).toBe(path.join(dir, 'chatcenter.log'))
  })

  it('🔴 ЛОВУШКА: ничего не потеряно — обе половины вместе дают исходный файл', () => {
    const log = path.join(dir, 'chatcenter.log')
    const whole = 'X'.repeat(2.4 * MB)
    fs.writeFileSync(log, whole)
    initLogger(dir)
    const prev = fs.readFileSync(path.join(dir, 'chatcenter.prev.log'), 'utf8')
    const rest = fs.readFileSync(log, 'utf8')
    // Не «строго равно»: сразу после обрезки журнал дописывает свою строку о запуске
    // («=== Logger init: … ===»), поэтому сумма чуть БОЛЬШЕ исходной. Важно, что НЕ меньше —
    // значит ни один символ старого журнала не пропал.
    expect(prev.length + rest.length).toBeGreaterThanOrEqual(whole.length)
    expect(prev.length).toBeGreaterThan(whole.length / 2 - 1)
  })
})
