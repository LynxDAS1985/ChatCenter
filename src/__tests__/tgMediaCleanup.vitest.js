// v0.89.17: тесты LRU-кеша для userData/tg-media/.
//
// Алгоритм соответствует TDLib `optimizeStorage` (см. tgMediaCleanup.js шапка):
// - TTL: удалить файлы старше N секунд
// - LRU: при превышении лимита размера — удалять самые старые по mtime
// - Immunity: только что открытые (mtime < immunityDelay сек назад) НЕ трогать
// - wipeAll (maxSizeBytes:0): удалить ВСЁ (для кнопки «Очистить кеш»)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getTgMediaStats, cleanupTgMedia, touchTgMediaFile, TG_MEDIA_DEFAULTS,
} from '../../main/native/backends/tgMediaCleanup.js'

let tmpDir, userDataDir, mediaDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tgmedia-'))
  userDataDir = path.join(tmpDir, 'userdata')
  fs.mkdirSync(userDataDir, { recursive: true })
  mediaDir = path.join(userDataDir, 'tg-media')
  fs.mkdirSync(mediaDir, { recursive: true })
})
afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
})

// Помощник: создаёт файл с заданным mtime (секунд назад от now).
function makeFile(name, sizeKB, ageSeconds) {
  const file = path.join(mediaDir, name)
  fs.writeFileSync(file, Buffer.alloc(sizeKB * 1024, 0xAB))
  if (ageSeconds > 0) {
    const t = new Date(Date.now() - ageSeconds * 1000)
    fs.utimesSync(file, t, t)
  }
  return file
}

describe('getTgMediaStats', () => {
  it('пустая папка → totalBytes=0, fileCount=0, oldestMtime=null', () => {
    const r = getTgMediaStats(userDataDir)
    expect(r).toEqual({ totalBytes: 0, fileCount: 0, oldestMtime: null })
  })

  it('папка не существует → totalBytes=0', () => {
    const r = getTgMediaStats(path.join(tmpDir, 'no-such'))
    expect(r.totalBytes).toBe(0)
    expect(r.fileCount).toBe(0)
  })

  it('null userDataDir → totalBytes=0 (не падает)', () => {
    expect(getTgMediaStats(null).totalBytes).toBe(0)
    expect(getTgMediaStats(undefined).totalBytes).toBe(0)
    expect(getTgMediaStats('').totalBytes).toBe(0)
  })

  it('считает суммарный размер всех файлов', () => {
    makeFile('a.mp4', 10, 0)
    makeFile('b.jpg', 5, 0)
    makeFile('c.bin', 20, 0)
    const r = getTgMediaStats(userDataDir)
    expect(r.fileCount).toBe(3)
    expect(r.totalBytes).toBe((10 + 5 + 20) * 1024)
  })

  it('oldestMtime — самый старый mtime среди файлов', () => {
    makeFile('new.mp4', 1, 10)    // 10 сек назад
    makeFile('old.mp4', 1, 3600)  // час назад
    const r = getTgMediaStats(userDataDir)
    const ageMs = Date.now() - r.oldestMtime
    expect(ageMs).toBeGreaterThanOrEqual(3590 * 1000)
    expect(ageMs).toBeLessThanOrEqual(3700 * 1000)
  })

  it('игнорирует поддиректории (только файлы)', () => {
    makeFile('a.mp4', 5, 0)
    fs.mkdirSync(path.join(mediaDir, 'sub'))
    fs.writeFileSync(path.join(mediaDir, 'sub', 'nested.mp4'), Buffer.alloc(1024))
    const r = getTgMediaStats(userDataDir)
    expect(r.fileCount).toBe(1)
    expect(r.totalBytes).toBe(5 * 1024)
  })
})

describe('cleanupTgMedia: TTL', () => {
  it('удаляет файлы старше ttlSeconds', () => {
    makeFile('old.mp4', 5, 8 * 24 * 3600)  // 8 дней назад
    makeFile('fresh.mp4', 5, 60)           // 1 минута назад
    const r = cleanupTgMedia(userDataDir, { ttlSeconds: 7 * 24 * 3600, maxSizeBytes: 999999999 })
    expect(r.removedCount).toBe(1)
    expect(r.freedBytes).toBe(5 * 1024)
    expect(fs.existsSync(path.join(mediaDir, 'old.mp4'))).toBe(false)
    expect(fs.existsSync(path.join(mediaDir, 'fresh.mp4'))).toBe(true)
  })

  it('ttlSeconds=0 → не применяется', () => {
    makeFile('very-old.mp4', 5, 365 * 24 * 3600)  // год назад
    const r = cleanupTgMedia(userDataDir, { ttlSeconds: 0, maxSizeBytes: 999999999 })
    expect(r.removedCount).toBe(0)
    expect(fs.existsSync(path.join(mediaDir, 'very-old.mp4'))).toBe(true)
  })
})

describe('cleanupTgMedia: LRU (maxSizeBytes)', () => {
  it('при превышении размера — удаляет самые старые', () => {
    // 3 файла по 10 КБ, лимит 15 КБ → должны удалиться 2 самых старых.
    makeFile('newest.mp4', 10, 60)    // 1 мин — НЕ удалять (immunity не применяется т.к. >5 мин? Нет, 60s < 5min=300s = immunity)
    // wait, immunity = 5*60 = 300s. newest at 60s ago → IS protected.
    // Let me redesign: make all files OLDER than immunity (5 min)
    // restart approach:
    cleanupTestData()
    makeFile('newest.mp4', 10, 600)  // 10 мин назад — НЕ под immunity
    makeFile('middle.mp4', 10, 3600) // час назад
    makeFile('oldest.mp4', 10, 7200) // 2 часа назад
    const r = cleanupTgMedia(userDataDir, {
      maxSizeBytes: 15 * 1024, ttlSeconds: 0, immunityDelay: 0,
    })
    expect(r.removedCount).toBe(2)
    expect(fs.existsSync(path.join(mediaDir, 'oldest.mp4'))).toBe(false)
    expect(fs.existsSync(path.join(mediaDir, 'middle.mp4'))).toBe(false)
    expect(fs.existsSync(path.join(mediaDir, 'newest.mp4'))).toBe(true)
  })

  it('immunity защищает недавно открытые файлы', () => {
    // 2 файла, оба «старые» но один трогнут только что (immunity)
    makeFile('protected.mp4', 100, 3600)  // mtime=час назад
    makeFile('victim.mp4', 100, 7200)     // mtime=2 часа назад
    // Сейчас обновляем mtime у protected
    const protectedPath = path.join(mediaDir, 'protected.mp4')
    fs.utimesSync(protectedPath, new Date(), new Date())
    // Лимит размера 50 КБ → надо удалить минимум один (200 КБ > 50)
    const r = cleanupTgMedia(userDataDir, {
      maxSizeBytes: 50 * 1024, ttlSeconds: 0, immunityDelay: 5 * 60,
    })
    // victim удалён, protected сохранён несмотря на превышение
    expect(fs.existsSync(path.join(mediaDir, 'protected.mp4'))).toBe(true)
    expect(fs.existsSync(path.join(mediaDir, 'victim.mp4'))).toBe(false)
    expect(r.removedCount).toBe(1)
  })

  it('maxSizeBytes >0 но размер уже под лимитом → ничего не удаляет', () => {
    makeFile('a.mp4', 5, 60)
    const r = cleanupTgMedia(userDataDir, {
      maxSizeBytes: 100 * 1024, ttlSeconds: 0,
    })
    expect(r.removedCount).toBe(0)
  })
})

describe('cleanupTgMedia: wipeAll (ручная «Очистить кеш»)', () => {
  it('maxSizeBytes:0 + ttlSeconds:0 → удаляет ВСЁ независимо от возраста', () => {
    makeFile('playing.mp4', 100, 1)  // только что (immunity не помогает при wipeAll)
    makeFile('old.mp4', 50, 7200)
    const r = cleanupTgMedia(userDataDir, { maxSizeBytes: 0, ttlSeconds: 0 })
    expect(r.removedCount).toBe(2)
    expect(r.freedBytes).toBe((100 + 50) * 1024)
    expect(fs.readdirSync(mediaDir).filter(f => f.endsWith('.mp4'))).toEqual([])
  })

  it('wipeAll возвращает remainingBytes=0', () => {
    makeFile('a.mp4', 10, 0)
    makeFile('b.mp4', 20, 0)
    const r = cleanupTgMedia(userDataDir, { maxSizeBytes: 0, ttlSeconds: 0 })
    expect(r.remainingBytes).toBe(0)
  })
})

describe('cleanupTgMedia: edge cases', () => {
  it('папка не существует → не падает', () => {
    const r = cleanupTgMedia(path.join(tmpDir, 'no-such'), TG_MEDIA_DEFAULTS)
    expect(r.ok).toBe(true)
    expect(r.removedCount).toBe(0)
    expect(r.freedBytes).toBe(0)
  })

  it('null userDataDir → не падает, ok:true', () => {
    expect(cleanupTgMedia(null).ok).toBe(true)
    expect(cleanupTgMedia('').ok).toBe(true)
    expect(cleanupTgMedia(undefined).ok).toBe(true)
  })

  it('пустая папка → ok:true, ничего не делает', () => {
    const r = cleanupTgMedia(userDataDir, TG_MEDIA_DEFAULTS)
    expect(r.ok).toBe(true)
    expect(r.removedCount).toBe(0)
  })

  it('TG_MEDIA_DEFAULTS — публичные дефолты (для регрессий)', () => {
    expect(TG_MEDIA_DEFAULTS.maxSizeBytes).toBe(1024 * 1024 * 1024) // 1 ГБ
    expect(TG_MEDIA_DEFAULTS.ttlSeconds).toBe(7 * 24 * 3600)         // 7 дней
    expect(TG_MEDIA_DEFAULTS.immunityDelay).toBe(5 * 60)             // 5 минут
  })

  it('игнорирует поддиректории при очистке', () => {
    makeFile('a.mp4', 5, 8 * 24 * 3600) // старый — удалится по TTL
    fs.mkdirSync(path.join(mediaDir, 'sub'))
    fs.writeFileSync(path.join(mediaDir, 'sub', 'nested.mp4'), Buffer.alloc(1024))
    cleanupTgMedia(userDataDir, { maxSizeBytes: 0, ttlSeconds: 0 })
    // Поддиректория и её файлы остались (мы их не трогаем)
    expect(fs.existsSync(path.join(mediaDir, 'sub', 'nested.mp4'))).toBe(true)
  })
})

describe('touchTgMediaFile', () => {
  it('обновляет mtime на текущее время', () => {
    const file = makeFile('a.mp4', 5, 3600) // час назад
    const beforeMs = fs.statSync(file).mtimeMs
    touchTgMediaFile(file)
    const afterMs = fs.statSync(file).mtimeMs
    expect(afterMs - beforeMs).toBeGreaterThan(0)
    // Новый mtime — почти сейчас
    expect(Date.now() - afterMs).toBeLessThan(2000)
  })

  it('возвращает true при успехе, false при ошибке', () => {
    const file = makeFile('a.mp4', 5, 0)
    expect(touchTgMediaFile(file)).toBe(true)
    expect(touchTgMediaFile('/no/such/file')).toBe(false)
    expect(touchTgMediaFile(null)).toBe(false)
    expect(touchTgMediaFile('')).toBe(false)
  })
})

// Помощник чистки между шагами (для повторных подготовок в одном it)
function cleanupTestData() {
  for (const f of fs.readdirSync(mediaDir)) {
    try { fs.unlinkSync(path.join(mediaDir, f)) } catch (_) {}
  }
}
