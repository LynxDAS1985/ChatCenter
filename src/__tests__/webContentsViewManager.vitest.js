// v0.89.41: WebContentsViewManager — unit тесты.
//
// Без реального Electron — модуль graceful degradation возвращает null если
// WebContentsView API недоступен. Все методы должны быть defensive.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  WebContentsViewManager, getWebContentsViewManager, _resetForTests,
  normalizePreloadPath,
} from '../../main/utils/webContentsViewManager.js'

describe('WebContentsViewManager v0.89.41', () => {
  beforeEach(() => { _resetForTests() })

  it('createView выкидывает ошибку без id', () => {
    const mgr = new WebContentsViewManager()
    expect(() => mgr.createView({ url: 'x', parentWindow: {} })).toThrow(/id required/)
  })

  it('createView выкидывает ошибку без parentWindow', () => {
    const mgr = new WebContentsViewManager()
    expect(() => mgr.createView({ id: 'a', url: 'x' })).toThrow(/parentWindow required/)
  })

  it('createView без Electron возвращает null (graceful)', () => {
    const mgr = new WebContentsViewManager()
    const fakeWindow = { contentView: { addChildView() {} } }
    expect(mgr.createView({ id: 'a', url: 'x', parentWindow: fakeWindow })).toBeNull()
  })

  it('setBounds без созданного view → false', () => {
    const mgr = new WebContentsViewManager()
    expect(mgr.setBounds('a', { x: 0, y: 0, width: 100, height: 100 })).toBe(false)
  })

  it('loadURL без view → ok:false', async () => {
    const mgr = new WebContentsViewManager()
    const r = await mgr.loadURL('a', 'https://x')
    expect(r.ok).toBe(false)
  })

  it('executeJavaScript без view → ok:false', async () => {
    const mgr = new WebContentsViewManager()
    const r = await mgr.executeJavaScript('a', '1+1')
    expect(r.ok).toBe(false)
  })

  it('sendToView без view → false', () => {
    const mgr = new WebContentsViewManager()
    expect(mgr.sendToView('a', 'ch', { x: 1 })).toBe(false)
  })

  it('destroyView без view → false', () => {
    const mgr = new WebContentsViewManager()
    expect(mgr.destroyView('a')).toBe(false)
  })

  it('hasView/getView/listViews возвращают пустые/null для несозданных', () => {
    const mgr = new WebContentsViewManager()
    expect(mgr.hasView('a')).toBe(false)
    expect(mgr.getView('a')).toBeNull()
    expect(mgr.listViews()).toEqual([])
  })

  it('destroyAll работает на пустом manager без падений', () => {
    const mgr = new WebContentsViewManager()
    expect(() => mgr.destroyAll()).not.toThrow()
  })

  it('getWebContentsViewManager возвращает singleton', () => {
    const a = getWebContentsViewManager()
    const b = getWebContentsViewManager()
    expect(a).toBe(b)
  })

  it('_resetForTests создаёт новый instance', () => {
    const a = getWebContentsViewManager()
    _resetForTests()
    const b = getWebContentsViewManager()
    expect(a).not.toBe(b)
  })

  // v0.89.46: нормализация preload (file:// URL → absolute path) для WebContentsView.
  // Старый <webview> работал с file:// URL, новый WebContentsView требует raw path.
  describe('normalizePreloadPath v0.89.46', () => {
    it('null/undefined/пустая строка → возвращает как есть', () => {
      expect(normalizePreloadPath(null)).toBeNull()
      expect(normalizePreloadPath(undefined)).toBeUndefined()
      expect(normalizePreloadPath('')).toBe('')
    })

    it('абсолютный путь без file:// — без изменений', () => {
      expect(normalizePreloadPath('C:\\Projects\\app\\preload.cjs'))
        .toBe('C:\\Projects\\app\\preload.cjs')
      expect(normalizePreloadPath('/usr/local/share/preload.js'))
        .toBe('/usr/local/share/preload.js')
    })

    it('file:///c:/path.cjs → c:\\path.cjs (Windows)', () => {
      const r = normalizePreloadPath('file:///c:/Projects/ChatCenter/main/preloads/monitor.preload.cjs')
      // fileURLToPath на Windows возвращает с backslash
      expect(r).toMatch(/[\\\/]Projects[\\\/]ChatCenter[\\\/]main[\\\/]preloads[\\\/]monitor\.preload\.cjs$/)
      expect(r.startsWith('file://')).toBe(false)
    })

    it('file:// URL с unicode (русские буквы) — decoded корректно', () => {
      // %D0%94%D0%B8%D1%80%D0%B5%D0%BA%D1%82%D0%BE%D1%80 = "Директор" в UTF-8
      const r = normalizePreloadPath('file:///c:/Users/%D0%94%D0%B8%D1%80%D0%B5%D0%BA%D1%82%D0%BE%D1%80/app.cjs')
      expect(r).toMatch(/Директор/)
      expect(r.startsWith('file://')).toBe(false)
    })

    it('file:// URL с пробелами — decoded корректно', () => {
      const r = normalizePreloadPath('file:///c:/Program%20Files/app/preload.cjs')
      expect(r).toMatch(/Program Files/)
    })
  })
})
