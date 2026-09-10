// v0.97.0 (Phase 1 M1.1): тесты для Tool Registry.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createToolRegistry, PERMISSION_TIERS, CATEGORIES } from './toolRegistry.js'

const MIN_DEF = {
  schema: { type: 'object', properties: {} },
  handler: async () => ({ ok: true }),
}

let consoleWarnSpy
beforeEach(() => {
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('createToolRegistry — register + lookup', () => {
  it('register + lookup возвращает определение', () => {
    const r = createToolRegistry()
    r.register('test_tool', MIN_DEF)
    const def = r.lookup('test_tool')
    expect(def).toBeTruthy()
    expect(def.id).toBe('test_tool')
    expect(def.permission).toBe('auto')  // default
    expect(def.category).toBe('system')   // default
  })

  it('lookup несуществующего → null', () => {
    const r = createToolRegistry()
    expect(r.lookup('nonexistent')).toBe(null)
  })

  it('register дубликата → warning + overwrite', () => {
    const r = createToolRegistry()
    const h1 = async () => ({ ok: true, v: 1 })
    const h2 = async () => ({ ok: true, v: 2 })
    r.register('a', { ...MIN_DEF, handler: h1 })
    r.register('a', { ...MIN_DEF, handler: h2 })
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered'))
    expect(r.lookup('a').handler).toBe(h2)
  })
})

describe('createToolRegistry — validation', () => {
  it('пустой id → throw', () => {
    const r = createToolRegistry()
    expect(() => r.register('', MIN_DEF)).toThrow(/non-empty string/)
    expect(() => r.register(null, MIN_DEF)).toThrow(/non-empty string/)
  })

  it('def без schema → throw', () => {
    const r = createToolRegistry()
    expect(() => r.register('a', { handler: async () => ({}) })).toThrow(/schema must be an object/)
  })

  it('def без handler → throw', () => {
    const r = createToolRegistry()
    expect(() => r.register('a', { schema: {} })).toThrow(/handler must be a function/)
  })

  it('невалидный permission → throw', () => {
    const r = createToolRegistry()
    expect(() => r.register('a', { ...MIN_DEF, permission: 'evil' })).toThrow(/invalid permission/)
  })

  it('валидные permission tiers принимаются', () => {
    const r = createToolRegistry()
    for (const tier of PERMISSION_TIERS) {
      r.register(`tool_${tier}`, { ...MIN_DEF, permission: tier })
      expect(r.lookup(`tool_${tier}`).permission).toBe(tier)
    }
  })

  it('невалидная category → throw', () => {
    const r = createToolRegistry()
    expect(() => r.register('a', { ...MIN_DEF, category: 'unknown' })).toThrow(/invalid category/)
  })

  it('валидные categories принимаются', () => {
    const r = createToolRegistry()
    for (const cat of CATEGORIES) {
      r.register(`tool_${cat}`, { ...MIN_DEF, category: cat })
      expect(r.lookup(`tool_${cat}`).category).toBe(cat)
    }
  })
})

describe('createToolRegistry — list + filters', () => {
  it('list возвращает все tools sorted by id', () => {
    const r = createToolRegistry()
    r.register('c', MIN_DEF)
    r.register('a', MIN_DEF)
    r.register('b', MIN_DEF)
    const list = r.list()
    expect(list.map(t => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('filter by category', () => {
    const r = createToolRegistry()
    r.register('nav1', { ...MIN_DEF, category: 'navigation' })
    r.register('read1', { ...MIN_DEF, category: 'reading' })
    r.register('nav2', { ...MIN_DEF, category: 'navigation' })
    const navOnly = r.list({ category: 'navigation' })
    expect(navOnly).toHaveLength(2)
    expect(navOnly.every(t => t.category === 'navigation')).toBe(true)
  })

  it('filter by permission', () => {
    const r = createToolRegistry()
    r.register('a', { ...MIN_DEF, permission: 'auto' })
    r.register('b', { ...MIN_DEF, permission: 'confirm' })
    r.register('c', { ...MIN_DEF, permission: 'deny' })
    expect(r.list({ permission: 'confirm' })).toHaveLength(1)
  })

  it('filter ai_only исключает deny', () => {
    const r = createToolRegistry()
    r.register('a', { ...MIN_DEF, permission: 'auto' })
    r.register('b', { ...MIN_DEF, permission: 'deny' })
    const aiTools = r.list({ ai_only: true })
    expect(aiTools).toHaveLength(1)
    expect(aiTools[0].id).toBe('a')
  })

  it('пустой registry → list пустой массив', () => {
    const r = createToolRegistry()
    expect(r.list()).toEqual([])
  })
})

describe('createToolRegistry — schemas (для AI provider)', () => {
  it('schemas возвращает только AI-доступные tools', () => {
    const r = createToolRegistry()
    r.register('a', { ...MIN_DEF, description: 'tool A' })
    r.register('forbidden', { ...MIN_DEF, permission: 'deny', description: 'forbidden' })
    const s = r.schemas()
    expect(s).toHaveLength(1)
    expect(s[0]).toEqual({
      name: 'a',
      description: 'tool A',
      input_schema: MIN_DEF.schema,
    })
  })
})

describe('createToolRegistry — управление', () => {
  it('unregister удаляет tool', () => {
    const r = createToolRegistry()
    r.register('a', MIN_DEF)
    expect(r.unregister('a')).toBe(true)
    expect(r.lookup('a')).toBe(null)
    expect(r.unregister('nonexistent')).toBe(false)
  })

  it('clear очищает всё', () => {
    const r = createToolRegistry()
    r.register('a', MIN_DEF)
    r.register('b', MIN_DEF)
    expect(r.count()).toBe(2)
    r.clear()
    expect(r.count()).toBe(0)
  })

  it('count возвращает количество', () => {
    const r = createToolRegistry()
    expect(r.count()).toBe(0)
    r.register('a', MIN_DEF)
    expect(r.count()).toBe(1)
  })
})
