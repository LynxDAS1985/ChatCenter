// v1.1.14: тесты UI-тестера AI Bridge.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, screen, waitFor } from '@testing-library/react'
import AiBridgeTester from './AiBridgeTester.jsx'

let savedApi
beforeEach(() => {
  savedApi = window.api
  window.api = {
    invoke: vi.fn(),
    send: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  window.api = savedApi
})

describe('AiBridgeTester — UI рендер', () => {
  it('рендерит заголовок и 3 кнопки режима', () => {
    render(<AiBridgeTester onClose={() => {}} />)
    expect(screen.getByText(/Тест AI Bridge/)).toBeTruthy()
    expect(screen.getByText('Локальный (Ollama)')).toBeTruthy()
    expect(screen.getByText('API провайдер')).toBeTruthy()
    expect(screen.getByText('Веб-интерфейс')).toBeTruthy()
  })

  it('по умолчанию выбран local — селектор провайдера НЕ показан', () => {
    render(<AiBridgeTester onClose={() => {}} />)
    // local не нуждается в provider → select не должен быть
    const selects = document.querySelectorAll('select')
    expect(selects.length).toBe(0)
  })

  it('переключение на API → появляется селектор провайдера', () => {
    render(<AiBridgeTester onClose={() => {}} />)
    fireEvent.click(screen.getByText('API провайдер'))
    expect(document.querySelector('select')).toBeTruthy()
  })

  it('клик ✕ вызывает onClose', () => {
    const onClose = vi.fn()
    render(<AiBridgeTester onClose={onClose} />)
    fireEvent.click(screen.getByText('✕'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('AiBridgeTester — отправка', () => {
  it('пустой вопрос → показывает error без IPC вызова', async () => {
    window.api.invoke.mockResolvedValue({ ok: true })
    render(<AiBridgeTester onClose={() => {}} />)
    // Очищаем текст
    const textarea = document.querySelector('textarea')
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.click(screen.getByText(/Спросить/))
    await waitFor(() => {
      expect(screen.getByText(/Введите вопрос/)).toBeTruthy()
    })
    expect(window.api.invoke).not.toHaveBeenCalled()
  })

  it('happy path local → invoke + show answer', async () => {
    window.api.invoke.mockResolvedValue({
      version: 1, ok: true, text: 'Привет от AI!',
      providerId: 'local', mode: 'local', latencyMs: 123, model: 'llama3.1',
    })
    render(<AiBridgeTester onClose={() => {}} />)
    fireEvent.click(screen.getByText(/Спросить/))
    await waitFor(() => {
      expect(screen.getByText(/Привет от AI/)).toBeTruthy()
      expect(screen.getByText(/llama3.1/)).toBeTruthy()
    })
    expect(window.api.invoke).toHaveBeenCalledWith('ai-bridge:send', expect.objectContaining({
      mode: 'local',
      question: expect.objectContaining({ version: 1, source: { messengerId: 'native_cc' } }),
    }))
  })

  it('mode=api → invoke с providerId', async () => {
    window.api.invoke.mockResolvedValue({ ok: true, text: 'OK', providerId: 'anthropic', latencyMs: 1 })
    render(<AiBridgeTester onClose={() => {}} />)
    fireEvent.click(screen.getByText('API провайдер'))
    fireEvent.click(screen.getByText(/Спросить/))
    await waitFor(() => {
      const call = window.api.invoke.mock.calls[0]
      expect(call[1].mode).toBe('api')
      expect(call[1].config.providerId).toBe('anthropic')
    })
  })

  it('ошибка → показывает code + message', async () => {
    window.api.invoke.mockResolvedValue({
      ok: false, error: { code: 'auth_required', message: 'Нужен ключ', retryable: false },
    })
    render(<AiBridgeTester onClose={() => {}} />)
    fireEvent.click(screen.getByText(/Спросить/))
    await waitFor(() => {
      expect(screen.getByText(/auth_required/)).toBeTruthy()
      expect(screen.getByText(/Нужен ключ/)).toBeTruthy()
    })
  })

  it('retryable=true → показывает "(можно повторить)"', async () => {
    window.api.invoke.mockResolvedValue({
      ok: false, error: { code: 'network_error', message: 'нет сети', retryable: true },
    })
    render(<AiBridgeTester onClose={() => {}} />)
    fireEvent.click(screen.getByText(/Спросить/))
    await waitFor(() => {
      expect(screen.getByText(/можно повторить/)).toBeTruthy()
    })
  })

  it('invoke throws → unknown error', async () => {
    window.api.invoke.mockRejectedValue(new Error('IPC dead'))
    render(<AiBridgeTester onClose={() => {}} />)
    fireEvent.click(screen.getByText(/Спросить/))
    await waitFor(() => {
      expect(screen.getByText(/unknown/)).toBeTruthy()
      expect(screen.getByText(/IPC dead/)).toBeTruthy()
    })
  })

  it('логи отправляются через app:log (не console.*)', async () => {
    window.api.invoke.mockResolvedValue({ ok: true, text: 'X', providerId: 'local', latencyMs: 1 })
    render(<AiBridgeTester onClose={() => {}} />)
    fireEvent.click(screen.getByText(/Спросить/))
    await waitFor(() => {
      const logCalls = window.api.send.mock.calls.filter(c => c[0] === 'app:log')
      expect(logCalls.length).toBeGreaterThan(0)
      const startLog = logCalls.find(c => c[1].message.includes('start mode='))
      expect(startLog).toBeTruthy()
    })
  })
})
