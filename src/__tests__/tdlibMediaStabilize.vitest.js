// v0.89.15: stabilizeForPlayback — копирует ЛЮБОЙ TDLib-файл (temp/ или
// finalized) в стабильную папку userData/tg-media/. Это единственный способ
// гарантировать что Chromium <video> сможет читать файл всё время сессии.
//
// Вынесено из tdlibMedia.vitest.js при переходе через лимит 400 строк (v0.89.15).
// См. .memory-bank/mistakes/tdlib-video-player.md ловушки #8, #9.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stabilizeForPlayback } from '../../main/native/backends/tdlibMedia.js'

describe('stabilizeForPlayback (v0.89.15)', () => {
  let tmpDir, userDataDir, srcFile
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-stabilize-'))
    userDataDir = path.join(tmpDir, 'userdata')
    fs.mkdirSync(userDataDir, { recursive: true })
    srcFile = path.join(tmpDir, 'source.mp4')
    fs.writeFileSync(srcFile, Buffer.from('FAKEMP4DATA1234567890'))
  })
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
  })

  it('копирует файл в userData/tg-media/<fileId>_<size>.<ext>', () => {
    const r = stabilizeForPlayback(srcFile, userDataDir, 42)
    const size = fs.statSync(srcFile).size
    expect(r).toBe(`cc-media://media/${encodeURIComponent(`42_${size}.mp4`)}`)
    const dest = path.join(userDataDir, 'tg-media', `42_${size}.mp4`)
    expect(fs.existsSync(dest)).toBe(true)
    expect(fs.statSync(dest).size).toBe(size)
  })

  it('дедуп: если файл с таким именем и размером уже есть — не копирует повторно', () => {
    const size = fs.statSync(srcFile).size
    const r1 = stabilizeForPlayback(srcFile, userDataDir, 7)
    const dest = path.join(userDataDir, 'tg-media', `7_${size}.mp4`)
    const mtimeFirst = fs.statSync(dest).mtimeMs
    const r2 = stabilizeForPlayback(srcFile, userDataDir, 7)
    expect(r1).toBe(r2)
    const mtimeSecond = fs.statSync(dest).mtimeMs
    expect(mtimeSecond).toBe(mtimeFirst) // не перекопировали
  })

  it('если файл изменил размер — копирует заново', () => {
    const r1 = stabilizeForPlayback(srcFile, userDataDir, 99)
    expect(r1).toMatch(/^cc-media:\/\/media\//)
    fs.writeFileSync(srcFile, Buffer.alloc(50000, 0xAB))
    const r2 = stabilizeForPlayback(srcFile, userDataDir, 99)
    const sizeNew = fs.statSync(srcFile).size
    expect(r2).toBe(`cc-media://media/${encodeURIComponent(`99_${sizeNew}.mp4`)}`)
    // Старая и новая копии — РАЗНЫЕ файлы (разные размеры в имени)
    expect(r1).not.toBe(r2)
  })

  it('temp/N файл из TDLib (без расширения) — копируется с .bin', () => {
    const tempFile = path.join(tmpDir, '2767')
    fs.writeFileSync(tempFile, Buffer.from('streamabledata'))
    const r = stabilizeForPlayback(tempFile, userDataDir, 2767)
    const size = fs.statSync(tempFile).size
    expect(r).toBe(`cc-media://media/${encodeURIComponent(`2767_${size}.bin`)}`)
    expect(fs.existsSync(path.join(userDataDir, 'tg-media', `2767_${size}.bin`))).toBe(true)
  })

  it('без fileId — использует basename файла', () => {
    const r = stabilizeForPlayback(srcFile, userDataDir)
    expect(r).toMatch(/^cc-media:\/\/media\/source_\d+\.mp4$/)
  })

  it('файл не существует → null', () => {
    expect(stabilizeForPlayback('/no/such/file.mp4', userDataDir, 1)).toBe(null)
  })

  it('пустой/null absPath → null', () => {
    expect(stabilizeForPlayback(null, userDataDir, 1)).toBe(null)
    expect(stabilizeForPlayback('', userDataDir, 1)).toBe(null)
    expect(stabilizeForPlayback(undefined, userDataDir, 1)).toBe(null)
  })

  it('пустой/null userDataDir → null', () => {
    expect(stabilizeForPlayback(srcFile, null, 1)).toBe(null)
    expect(stabilizeForPlayback(srcFile, '', 1)).toBe(null)
  })

  it('не-строка absPath → null', () => {
    expect(stabilizeForPlayback(123, userDataDir, 1)).toBe(null)
    expect(stabilizeForPlayback({ path: '/x' }, userDataDir, 1)).toBe(null)
  })

  it('пустой файл (size=0) → null', () => {
    const emptyFile = path.join(tmpDir, 'empty.mp4')
    fs.writeFileSync(emptyFile, '')
    expect(stabilizeForPlayback(emptyFile, userDataDir, 1)).toBe(null)
  })

  it('создаёт tg-media/ если её нет', () => {
    const freshUserData = path.join(tmpDir, 'fresh')
    fs.mkdirSync(freshUserData)
    expect(fs.existsSync(path.join(freshUserData, 'tg-media'))).toBe(false)
    const r = stabilizeForPlayback(srcFile, freshUserData, 5)
    expect(r).toMatch(/^cc-media:\/\/media\//)
    expect(fs.existsSync(path.join(freshUserData, 'tg-media'))).toBe(true)
  })

  it('encodeURIComponent в URL — спецсимволы в имени экранируются', () => {
    const r = stabilizeForPlayback(srcFile, userDataDir, 'a/b c?d')
    // a/b c?d → a_b_c_d
    expect(r).toMatch(/^cc-media:\/\/media\/a_b_c_d_\d+\.mp4$/)
  })

  it('возвращает URL с extension в lowercase', () => {
    const upperFile = path.join(tmpDir, 'UPPER.MP4')
    fs.writeFileSync(upperFile, Buffer.from('xyz'))
    const r = stabilizeForPlayback(upperFile, userDataDir, 11)
    expect(r).toMatch(/\.mp4$/)
  })
})
