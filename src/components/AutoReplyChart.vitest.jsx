// v1.2.7: тесты компонента AutoReplyChart.

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import AutoReplyChart from './AutoReplyChart.jsx'

afterEach(cleanup)

describe('AutoReplyChart — рендер', () => {
  it('пустой audit → «авто-ответов не было»', () => {
    render(<AutoReplyChart auditEntries={[]} />)
    expect(screen.getByText(/авто-ответов не было/)).toBeTruthy()
  })

  it('есть данные → SVG + заголовок', () => {
    const now = Date.now()
    const entries = [
      { actor: 'ai_auto', timestamp: now, actionId: 'ai_reply_summary', executionResult: 'ok' },
    ]
    render(<AutoReplyChart auditEntries={entries} />)
    expect(screen.getByText(/Активность AI авто-ответов/)).toBeTruthy()
    expect(document.querySelector('svg')).toBeTruthy()
  })

  it('показывает Всего: N в заголовке', () => {
    const now = Date.now()
    const entries = [
      { actor: 'ai_auto', timestamp: now, actionId: 'x', executionResult: 'ok' },
      { actor: 'ai_auto', timestamp: now, actionId: 'x', executionResult: 'ok' },
      { actor: 'ai_auto', timestamp: now, actionId: 'x', executionResult: 'ok' },
    ]
    render(<AutoReplyChart auditEntries={entries} />)
    // Header содержит «Всего:» + число 3
    const headerText = document.body.textContent
    expect(headerText).toMatch(/Всего:\s*3/)
  })

  it('показывает Ошибок: N когда есть errors', () => {
    const now = Date.now()
    const entries = [
      { actor: 'ai_auto', timestamp: now, actionId: 'x', executionResult: 'ok' },
      { actor: 'ai_auto', timestamp: now, actionId: 'x', executionResult: 'error' },
    ]
    render(<AutoReplyChart auditEntries={entries} />)
    expect(screen.getByText(/Ошибок/)).toBeTruthy()
  })

  it('красные части для ошибок', () => {
    const now = Date.now()
    const entries = [
      { actor: 'ai_auto', timestamp: now, actionId: 'x', executionResult: 'error' },
    ]
    render(<AutoReplyChart auditEntries={entries} />)
    const rects = document.querySelectorAll('rect[fill="#ef4444"]')
    expect(rects.length).toBeGreaterThan(0)
  })

  it('зелёные части для успешных', () => {
    const now = Date.now()
    const entries = [
      { actor: 'ai_auto', timestamp: now, actionId: 'x', executionResult: 'ok' },
    ]
    render(<AutoReplyChart auditEntries={entries} />)
    const rects = document.querySelectorAll('rect[fill="#22c55e"]')
    expect(rects.length).toBeGreaterThan(0)
  })

  it('days=14 → больше столбцов', () => {
    const now = Date.now()
    const entries = [{ actor: 'ai_auto', timestamp: now, actionId: 'x', executionResult: 'ok' }]
    render(<AutoReplyChart auditEntries={entries} days={14} />)
    expect(screen.getByText(/за 14 дней/)).toBeTruthy()
  })

  it('игнорирует actor != ai_auto', () => {
    const now = Date.now()
    const entries = [
      { actor: 'user', timestamp: now, actionId: 'x' },
      { actor: 'ai', timestamp: now, actionId: 'x' },
    ]
    render(<AutoReplyChart auditEntries={entries} />)
    expect(screen.getByText(/авто-ответов не было/)).toBeTruthy()
  })
})
