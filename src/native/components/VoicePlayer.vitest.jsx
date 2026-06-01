// v0.95.25: тесты VoicePlayer (рендер, переключение скорости, play/pause состояния).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VoicePlayer from './VoicePlayer.jsx'

function makeMessage(overrides = {}) {
  return {
    id: 'msg1',
    isOutgoing: false,
    duration: 12,  // 12 секунд
    waveform: null,
    ...overrides,
  }
}

describe('VoicePlayer (v0.95.25)', () => {
  it('рендерит play-кнопку, duration и waveform', () => {
    const { container } = render(
      <VoicePlayer
        m={makeMessage()}
        chatId="chat1"
        downloadMedia={vi.fn()}
      />
    )
    // Play button
    expect(screen.getByTitle('Воспроизвести')).toBeTruthy()
    // Duration 0:12
    expect(screen.getByText('0:12')).toBeTruthy()
    // 50 столбиков waveform
    const bars = container.querySelectorAll('div[style*="border-radius: 2px"]')
    expect(bars.length).toBe(50)
  })

  it('кнопка скорости показывает 1x по умолчанию', () => {
    render(
      <VoicePlayer
        m={makeMessage()}
        chatId="chat1"
        downloadMedia={vi.fn()}
      />
    )
    expect(screen.getByTitle('Скорость воспроизведения').textContent).toBe('1x')
  })

  it('клик по скорости переключает 1x → 1.5x → 2x → 1x', () => {
    render(
      <VoicePlayer
        m={makeMessage()}
        chatId="chat1"
        downloadMedia={vi.fn()}
      />
    )
    const speedBtn = screen.getByTitle('Скорость воспроизведения')
    expect(speedBtn.textContent).toBe('1x')
    fireEvent.click(speedBtn)
    expect(speedBtn.textContent).toBe('1.5x')
    fireEvent.click(speedBtn)
    expect(speedBtn.textContent).toBe('2x')
    fireEvent.click(speedBtn)
    expect(speedBtn.textContent).toBe('1x')
  })

  it('исходящий msg — waveform светлый на акцентном фоне', () => {
    const { container } = render(
      <VoicePlayer
        m={makeMessage({ isOutgoing: true })}
        chatId="chat1"
        downloadMedia={vi.fn()}
      />
    )
    const playBtn = screen.getByTitle('Воспроизвести')
    // Для outgoing background — белый полупрозрачный (rgba(255,255,255,0.25))
    expect(playBtn.getAttribute('style')).toContain('255')
  })

  it('клик по play вызывает downloadMedia', async () => {
    const downloadMedia = vi.fn().mockResolvedValue({ ok: true, path: 'cc-media://test.ogg' })
    render(
      <VoicePlayer
        m={makeMessage()}
        chatId="chat1"
        downloadMedia={downloadMedia}
      />
    )
    fireEvent.click(screen.getByTitle('Воспроизвести'))
    // await microtask resolve
    await new Promise(r => setTimeout(r, 0))
    expect(downloadMedia).toHaveBeenCalledWith('chat1', 'msg1', false)
  })

  it('duration 0 → 0:00', () => {
    render(
      <VoicePlayer
        m={makeMessage({ duration: 0 })}
        chatId="chat1"
        downloadMedia={vi.fn()}
      />
    )
    expect(screen.getByText('0:00')).toBeTruthy()
  })

  it('duration > 60 → корректное mm:ss', () => {
    render(
      <VoicePlayer
        m={makeMessage({ duration: 75 })}
        chatId="chat1"
        downloadMedia={vi.fn()}
      />
    )
    expect(screen.getByText('1:15')).toBeTruthy()
  })

  it('waveform=null → fallback паттерн с 50 столбиками', () => {
    const { container } = render(
      <VoicePlayer
        m={makeMessage({ waveform: null })}
        chatId="chat1"
        downloadMedia={vi.fn()}
      />
    )
    const bars = container.querySelectorAll('div[style*="border-radius: 2px"]')
    expect(bars.length).toBe(50)
  })
})
