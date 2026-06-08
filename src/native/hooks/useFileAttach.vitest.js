// v0.95.43: тесты для useFileAttach hook.

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileAttach, MAX_FILE_SIZE } from './useFileAttach.js'

// Минимальный mock для File (для jsdom/happy-dom)
function makeFile(name, size, type = 'image/jpeg') {
  return { name, size, type, path: '/tmp/' + name }
}

describe('useFileAttach (v0.95.43)', () => {
  it('initial state: пусто', () => {
    const { result } = renderHook(() => useFileAttach())
    expect(result.current.files).toEqual([])
    expect(result.current.caption).toBe('')
    expect(result.current.sending).toBe(false)
  })

  it('addFiles — добавляет файлы', () => {
    const { result } = renderHook(() => useFileAttach())
    act(() => result.current.addFiles([makeFile('a.jpg', 1024)]))
    expect(result.current.files).toHaveLength(1)
    expect(result.current.files[0].name).toBe('a.jpg')
  })

  it('addFiles несколько раз — накапливаются', () => {
    const { result } = renderHook(() => useFileAttach())
    act(() => result.current.addFiles([makeFile('a.jpg', 100)]))
    act(() => result.current.addFiles([makeFile('b.jpg', 200)]))
    expect(result.current.files).toHaveLength(2)
  })

  it('addFiles фильтрует слишком большие (> 2GB)', () => {
    const { result } = renderHook(() => useFileAttach())
    const huge = makeFile('huge.bin', MAX_FILE_SIZE + 1)
    const normal = makeFile('ok.jpg', 1024)
    act(() => result.current.addFiles([huge, normal]))
    expect(result.current.files).toHaveLength(1)
    expect(result.current.files[0].name).toBe('ok.jpg')
  })

  it('removeFile — удаляет по индексу', () => {
    const { result } = renderHook(() => useFileAttach())
    act(() => result.current.addFiles([
      makeFile('a.jpg', 100),
      makeFile('b.jpg', 200),
      makeFile('c.jpg', 300),
    ]))
    act(() => result.current.removeFile(1))
    expect(result.current.files.map(f => f.name)).toEqual(['a.jpg', 'c.jpg'])
  })

  it('clear — очищает всё', () => {
    const { result } = renderHook(() => useFileAttach())
    act(() => result.current.addFiles([makeFile('a.jpg', 100)]))
    act(() => result.current.setCaption('test'))
    act(() => result.current.clear())
    expect(result.current.files).toEqual([])
    expect(result.current.caption).toBe('')
  })

  it('setCaption — обновляет caption', () => {
    const { result } = renderHook(() => useFileAttach())
    act(() => result.current.setCaption('Привет'))
    expect(result.current.caption).toBe('Привет')
  })

  it('setSending — обновляет sending', () => {
    const { result } = renderHook(() => useFileAttach())
    act(() => result.current.setSending(true))
    expect(result.current.sending).toBe(true)
  })

  it('addFiles(null) → не падает', () => {
    const { result } = renderHook(() => useFileAttach())
    expect(() => act(() => result.current.addFiles(null))).not.toThrow()
    expect(result.current.files).toEqual([])
  })

  it('addFiles(FileList-like) — поддерживает array-like', () => {
    const { result } = renderHook(() => useFileAttach())
    const fileList = {
      length: 2,
      0: makeFile('a.jpg', 100),
      1: makeFile('b.jpg', 200),
      [Symbol.iterator]: function* () { yield this[0]; yield this[1] },
    }
    act(() => result.current.addFiles(fileList))
    expect(result.current.files).toHaveLength(2)
  })
})
