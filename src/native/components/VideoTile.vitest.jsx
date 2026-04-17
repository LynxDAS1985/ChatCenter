// v0.87.34: vitest для VideoTile — ловит регрессии в Variant A (poster + streaming).
// Проверяет: НЕ качаем full video без клика, постер грузится через tg:download-media thumb=true,
// клик → tg:download-video + video:open.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import VideoTile from './VideoTile.jsx'

let invokeMock

beforeEach(() => {
  invokeMock = vi.fn((channel, args) => {
    if (channel === 'tg:download-media') {
      return Promise.resolve({ ok: true, path: 'cc-media://media/thumb.jpg' })
    }
    if (channel === 'tg:download-video') {
      return Promise.resolve({ ok: true, path: 'cc-media://video/video.mp4' })
    }
    if (channel === 'video:open') return Promise.resolve({ ok: true })
    return Promise.resolve({ ok: true })
  })
  globalThis.window.api = { invoke: invokeMock, on: vi.fn(() => () => {}), send: vi.fn() }
})

const baseVideo = {
  id: '1', chatId: 'c1', senderId: 's',
  text: '', timestamp: 1712000000000, isOutgoing: false,
  mediaType: 'video',
  mediaWidth: 1280, mediaHeight: 720,
  duration: 125,
  fileSize: 42 * 1024 * 1024,
  strippedThumb: 'data:image/jpeg;base64,AAAA',
}

describe('VideoTile render (Variant A — poster + streaming)', () => {
  it('при mount качает ТОЛЬКО thumb (постер), НЕ полное видео', async () => {
    render(<VideoTile m={baseVideo} chatId="c1" />)
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('tg:download-media', {
        chatId: 'c1', messageId: '1', thumb: true,
      })
    })
    // НЕ должен быть вызван tg:download-video до клика
    const videoCalls = invokeMock.mock.calls.filter(c => c[0] === 'tg:download-video')
    expect(videoCalls.length).toBe(0)
    cleanup()
  })

  it('показывает ▶ кнопку и duration 2:05', () => {
    const { container } = render(<VideoTile m={baseVideo} chatId="c1" />)
    expect(container.textContent).toContain('▶')
    expect(container.textContent).toContain('2:05')
    cleanup()
  })

  it('показывает размер файла «42.0 МБ»', () => {
    const { container } = render(<VideoTile m={baseVideo} chatId="c1" />)
    expect(container.textContent).toContain('42.0 МБ')
    cleanup()
  })

  it('клик → вызывает tg:download-video и играет INLINE (не сразу video:open)', async () => {
    const { container } = render(<VideoTile m={baseVideo} chatId="c1" />)
    fireEvent.click(container.firstChild)
    await waitFor(() => {
      const hasVideo = invokeMock.mock.calls.some(c => c[0] === 'tg:download-video')
      expect(hasVideo).toBe(true)
    })
    // v0.87.36: НЕ вызывает video:open автоматически — играет inline
    await new Promise(r => setTimeout(r, 20))
    const autoOpen = invokeMock.mock.calls.some(c => c[0] === 'video:open')
    expect(autoOpen).toBe(false)
    // Должен появиться inline <video> элемент
    await waitFor(() => {
      expect(container.querySelector('video')).toBeTruthy()
    })
    cleanup()
  })

  it('v0.87.36: после inline play → кнопка ⛶ вызывает video:open с startTime', async () => {
    const { container } = render(<VideoTile m={baseVideo} chatId="c1" />)
    fireEvent.click(container.firstChild)
    await waitFor(() => expect(container.querySelector('video')).toBeTruthy())
    // Находим кнопку expand ⛶ и кликаем
    const btns = container.querySelectorAll('button')
    const expandBtn = Array.from(btns).find(b => b.textContent === '⛶')
    expect(expandBtn).toBeTruthy()
    fireEvent.click(expandBtn)
    await waitFor(() => {
      const openCall = invokeMock.mock.calls.find(c => c[0] === 'video:open')
      expect(openCall).toBeTruthy()
      expect(typeof openCall[1].startTime).toBe('number')
    })
    cleanup()
  })

  // v0.87.38: 📌 убрана из inline — она доступна только в отдельном окне
  it('v0.87.38: inline-видео НЕ содержит кнопку 📌 (только ⛶)', async () => {
    const { container } = render(<VideoTile m={baseVideo} chatId="c1" />)
    fireEvent.click(container.firstChild)
    await waitFor(() => expect(container.querySelector('video')).toBeTruthy())
    const btns = container.querySelectorAll('button')
    const pipBtn = Array.from(btns).find(b => b.textContent === '📌')
    expect(pipBtn).toBeFalsy()  // 📌 НЕ должна быть
    const expandBtn = Array.from(btns).find(b => b.textContent === '⛶')
    expect(expandBtn).toBeTruthy()  // ⛶ ДОЛЖНА быть
    cleanup()
  })

  it('для короткого видео (29 сек) формат 0:29', () => {
    const m = { ...baseVideo, duration: 29 }
    const { container } = render(<VideoTile m={m} chatId="c1" />)
    expect(container.textContent).toContain('0:29')
    cleanup()
  })

  it('для длинного видео (1:30:45) формат 1:30:45', () => {
    const m = { ...baseVideo, duration: 5445 }
    const { container } = render(<VideoTile m={m} chatId="c1" />)
    expect(container.textContent).toContain('1:30:45')
    cleanup()
  })

  it('размер 500 КБ показан правильно', () => {
    const m = { ...baseVideo, fileSize: 512000 }
    const { container } = render(<VideoTile m={m} chatId="c1" />)
    expect(container.textContent).toContain('500 КБ')
    cleanup()
  })
})
