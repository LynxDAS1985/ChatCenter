// v0.97.0 (Phase 1 M1.4-M1.6): тесты adapters (Anthropic / OpenAI / ГигаЧат).

import { describe, it, expect } from 'vitest'
import * as anthropic from './anthropicAdapter.js'
import * as openai from './openaiAdapter.js'
import * as gigachat from './gigachatAdapter.js'

const SCHEMAS = [
  {
    id: 'goto_message',
    description: 'Open chat',
    inputSchema: { type: 'object', required: ['source'], properties: { source: { type: 'object' } } },
  },
  {
    id: 'get_chat_history',
    description: 'Read history',
    inputSchema: { type: 'object', required: ['chatId'], properties: { chatId: { type: 'string' } } },
  },
]

// ──────────────────────────────────────────────────────────────────────────
// Anthropic
// ──────────────────────────────────────────────────────────────────────────

describe('anthropicAdapter — toAnthropicTools', () => {
  it('конверсия schemas → Anthropic format', () => {
    const tools = anthropic.toAnthropicTools(SCHEMAS)
    expect(tools).toHaveLength(2)
    expect(tools[0]).toEqual({
      name: 'goto_message',
      description: 'Open chat',
      input_schema: SCHEMAS[0].inputSchema,
    })
  })

  it('пустой массив → []', () => {
    expect(anthropic.toAnthropicTools([])).toEqual([])
    expect(anthropic.toAnthropicTools(null)).toEqual([])
  })
})

describe('anthropicAdapter — parseAnthropicToolUse', () => {
  it('response с tool_use → массив calls', () => {
    const response = {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Сейчас вызову tool' },
        { type: 'tool_use', id: 'toolu_1', name: 'goto_message', input: { source: { x: 1 } } },
      ],
    }
    const calls = anthropic.parseAnthropicToolUse(response)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ id: 'toolu_1', name: 'goto_message', input: { source: { x: 1 } } })
  })

  it('response без tool_use → []', () => {
    const response = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] }
    expect(anthropic.parseAnthropicToolUse(response)).toEqual([])
  })

  it('parseAnthropicText извлекает текст', () => {
    const response = {
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'tool_use', id: 'x', name: 'y', input: {} },
        { type: 'text', text: 'World' },
      ],
    }
    expect(anthropic.parseAnthropicText(response)).toBe('Hello\nWorld')
  })
})

describe('anthropicAdapter — formatToolResult', () => {
  it('ok → JSON result', () => {
    const msg = anthropic.formatToolResult('toolu_1', { ok: true, result: { x: 1 } })
    expect(msg.role).toBe('user')
    expect(msg.content[0].tool_use_id).toBe('toolu_1')
    expect(JSON.parse(msg.content[0].content)).toEqual({ x: 1 })
    expect(msg.content[0].is_error).toBeUndefined()
  })

  it('error → is_error:true', () => {
    const msg = anthropic.formatToolResult('toolu_1', { ok: false, error: 'boom' })
    expect(msg.content[0].is_error).toBe(true)
    expect(JSON.parse(msg.content[0].content)).toEqual({ error: 'boom' })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// OpenAI / DeepSeek
// ──────────────────────────────────────────────────────────────────────────

describe('openaiAdapter — toOpenAITools', () => {
  it('конверсия schemas → OpenAI format', () => {
    const tools = openai.toOpenAITools(SCHEMAS)
    expect(tools).toHaveLength(2)
    expect(tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'goto_message',
        description: 'Open chat',
        parameters: SCHEMAS[0].inputSchema,
        strict: true,
      },
    })
  })
})

describe('openaiAdapter — parseOpenAIToolCalls', () => {
  it('response с tool_calls → массив', () => {
    const response = {
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_chat_history',
              arguments: JSON.stringify({ chatId: 'X', limit: 10 }),
            },
          }],
        },
      }],
    }
    const calls = openai.parseOpenAIToolCalls(response)
    expect(calls).toHaveLength(1)
    expect(calls[0].id).toBe('call_1')
    expect(calls[0].name).toBe('get_chat_history')
    expect(calls[0].input).toEqual({ chatId: 'X', limit: 10 })
  })

  it('arguments JSON parse fail → input={}', () => {
    const response = {
      choices: [{
        message: {
          tool_calls: [{ id: 'x', type: 'function', function: { name: 'y', arguments: 'not json' } }],
        },
      }],
    }
    const calls = openai.parseOpenAIToolCalls(response)
    expect(calls[0].input).toEqual({})
  })

  it('response без tool_calls → []', () => {
    const response = { choices: [{ message: { content: 'hello' } }] }
    expect(openai.parseOpenAIToolCalls(response)).toEqual([])
  })
})

describe('openaiAdapter — formatToolResult', () => {
  it('role=tool + tool_call_id', () => {
    const msg = openai.formatToolResult('call_1', { ok: true, result: { y: 2 } })
    expect(msg.role).toBe('tool')
    expect(msg.tool_call_id).toBe('call_1')
    expect(JSON.parse(msg.content)).toEqual({ y: 2 })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// ГигаЧат
// ──────────────────────────────────────────────────────────────────────────

describe('gigachatAdapter — toGigaChatFunctions', () => {
  it('конверсия → старый OpenAI format (functions, не tools)', () => {
    const funcs = gigachat.toGigaChatFunctions(SCHEMAS)
    expect(funcs).toHaveLength(2)
    expect(funcs[0]).toEqual({
      name: 'goto_message',
      description: 'Open chat',
      parameters: SCHEMAS[0].inputSchema,
    })
  })
})

describe('gigachatAdapter — parseGigaChatFunctionCall', () => {
  it('response с function_call → одна запись', () => {
    const response = {
      choices: [{
        finish_reason: 'function_call',
        message: {
          role: 'assistant',
          function_call: {
            name: 'goto_message',
            arguments: JSON.stringify({ source: { x: 1 } }),
          },
        },
      }],
    }
    const calls = gigachat.parseGigaChatFunctionCall(response)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('goto_message')
    expect(calls[0].input).toEqual({ source: { x: 1 } })
    expect(calls[0].id).toMatch(/^gc-/)
  })

  it('response без function_call → []', () => {
    const response = { choices: [{ message: { content: 'plain text' } }] }
    expect(gigachat.parseGigaChatFunctionCall(response)).toEqual([])
  })
})

describe('gigachatAdapter — formatFunctionResult', () => {
  it('role=function + name', () => {
    const msg = gigachat.formatFunctionResult('gc-1', 'goto_message', { ok: true, result: { y: 2 } })
    expect(msg.role).toBe('function')
    expect(msg.name).toBe('goto_message')
    expect(JSON.parse(msg.content)).toEqual({ y: 2 })
  })
})
