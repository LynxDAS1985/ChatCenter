import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react'
import AISidebarAgent from './AISidebarAgent.jsx'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  confirmStep: vi.fn(),
  cancelStep: vi.fn(),
}))

vi.mock('../hooks/useAIAgent.js', () => ({
  default: () => ({
    state: {
      isRunning: false,
      steps: [],
      finalAnswer: null,
      error: null,
      pendingConfirm: null,
    },
    start: mocks.start,
    cancel: mocks.cancel,
    confirmStep: mocks.confirmStep,
    cancelStep: mocks.cancelStep,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('AISidebarAgent automatic Bridge routing', () => {
  it('forces Bridge when the active provider is configured as webview', async () => {
    const { container } = render(
      <AISidebarAgent
        pendingInvocation={{ source: { messengerId: 'native_cc', chatId: 'c1' } }}
        provider="gigachat"
        recentMessages={[{ text: 'Question', isOutgoing: false }]}
        settings={{
          aiProvider: 'gigachat',
          aiAgentUseBridge: false,
          aiProviderKeys: {
            gigachat: { mode: 'webview', webviewUrl: 'https://giga.chat' },
          },
        }}
      />
    )

    const checkbox = container.querySelector('input[type="checkbox"]')
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(true)

    await waitFor(() => {
      expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'gigachat',
        useBridge: true,
      }))
    })
  })

  it('persists manual Bridge choice for api providers', () => {
    const onSettingsChange = vi.fn()
    const { container } = render(
      <AISidebarAgent
        pendingInvocation={{ source: { messengerId: 'native_cc', chatId: 'c1' } }}
        provider="openai"
        recentMessages={[]}
        settings={{
          aiProvider: 'openai',
          aiAgentUseBridge: false,
          aiProviderKeys: {
            openai: { mode: 'api', apiKey: 'sk-test' },
          },
        }}
        onSettingsChange={onSettingsChange}
      />
    )

    const checkbox = container.querySelector('input[type="checkbox"]')
    fireEvent.click(checkbox)

    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      aiAgentUseBridge: true,
    }))
  })
})
