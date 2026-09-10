// v0.97.0 (Phase 1 M1.2): тесты для toolSchemas.

import { describe, it, expect } from 'vitest'
import {
  notificationSourceSchema,
  gotoMessageSchema,
  getChatHistorySchema,
  searchMessagesSchema,
  PHASE_1_SCHEMAS,
  validateToolSchema,
} from './toolSchemas.js'

describe('toolSchemas — структурная валидация', () => {
  it('все Phase 1 schemas валидны', () => {
    for (const s of PHASE_1_SCHEMAS) {
      const r = validateToolSchema(s)
      expect(r.valid, `schema ${s.id} errors: ${r.errors.join(', ')}`).toBe(true)
    }
  })

  it('каждая schema имеет уникальный id', () => {
    const ids = PHASE_1_SCHEMAS.map(s => s.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('inputSchema всех имеет type=object', () => {
    for (const s of PHASE_1_SCHEMAS) {
      expect(s.inputSchema.type).toBe('object')
    }
  })
})

describe('notificationSourceSchema', () => {
  it('содержит обязательные поля', () => {
    expect(notificationSourceSchema.required).toEqual(
      expect.arrayContaining(['messengerId', 'accountId', 'chatId', 'messageId'])
    )
  })

  it('messengerId, accountId, chatId, messageId — string', () => {
    expect(notificationSourceSchema.properties.messengerId.type).toBe('string')
    expect(notificationSourceSchema.properties.accountId.type).toBe('string')
    expect(notificationSourceSchema.properties.chatId.type).toBe('string')
    expect(notificationSourceSchema.properties.messageId.type).toBe('string')
  })
})

describe('gotoMessageSchema', () => {
  it('требует source с обязательными полями', () => {
    expect(gotoMessageSchema.id).toBe('goto_message')
    expect(gotoMessageSchema.permission).toBe('auto')
    expect(gotoMessageSchema.category).toBe('navigation')
    expect(gotoMessageSchema.inputSchema.required).toContain('source')
  })
})

describe('getChatHistorySchema', () => {
  it('требует chatId, limit опциональный с range', () => {
    expect(getChatHistorySchema.id).toBe('get_chat_history')
    expect(getChatHistorySchema.permission).toBe('auto')
    expect(getChatHistorySchema.inputSchema.required).toEqual(['chatId'])
    expect(getChatHistorySchema.inputSchema.properties.limit.minimum).toBe(1)
    expect(getChatHistorySchema.inputSchema.properties.limit.maximum).toBe(100)
  })
})

describe('searchMessagesSchema', () => {
  it('требует query с minLength', () => {
    expect(searchMessagesSchema.id).toBe('search_messages')
    expect(searchMessagesSchema.permission).toBe('auto')
    expect(searchMessagesSchema.inputSchema.required).toEqual(['query'])
    expect(searchMessagesSchema.inputSchema.properties.query.minLength).toBe(2)
  })
})

describe('validateToolSchema — edge cases', () => {
  it('валидный schema → ok', () => {
    const r = validateToolSchema(gotoMessageSchema)
    expect(r.valid).toBe(true)
  })

  it('schema без id → error', () => {
    const r = validateToolSchema({ description: 'x', inputSchema: { type: 'object' } })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('id required')
  })

  it('schema без description → error', () => {
    const r = validateToolSchema({ id: 'x', inputSchema: { type: 'object' } })
    expect(r.valid).toBe(false)
  })

  it('schema без inputSchema → error', () => {
    const r = validateToolSchema({ id: 'x', description: 'x' })
    expect(r.valid).toBe(false)
  })
})
