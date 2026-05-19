// v0.89.41: WebContentsViewManager — unit тесты.
//
// Без реального Electron — модуль graceful degradation возвращает null если
// WebContentsView API недоступен. Все методы должны быть defensive.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  WebContentsViewManager, getWebContentsViewManager, _resetForTests,
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
})
