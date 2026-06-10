// v1.0.0 (Phase 4.1): тесты taskStore.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTaskRecord, createTask, listTasks, completeTask, deleteTask, bulkCompleteTasks, bulkDeleteTasks, _internal } from './taskStore.js'

describe('createTaskRecord', () => {
  it('создаёт task с обязательными полями + defaults', () => {
    const t = createTaskRecord({ title: 'Перезвонить' })
    expect(t.id).toMatch(/^task_/)
    expect(t.title).toBe('Перезвонить')
    expect(t.priority).toBe('medium')
    expect(t.status).toBe('pending')
    expect(t.createdBy).toBe('user')
    expect(t.completedAt).toBe(null)
  })

  it('обрезает длинный title', () => {
    const longTitle = 'A'.repeat(500)
    const t = createTaskRecord({ title: longTitle })
    expect(t.title.length).toBe(200)
  })

  it('priority валидируется', () => {
    expect(createTaskRecord({ title: 'x', priority: 'low' }).priority).toBe('low')
    expect(createTaskRecord({ title: 'x', priority: 'high' }).priority).toBe('high')
    expect(createTaskRecord({ title: 'x', priority: 'evil' }).priority).toBe('medium')
  })

  it('createdBy ai → ai', () => {
    expect(createTaskRecord({ title: 'x', createdBy: 'ai' }).createdBy).toBe('ai')
    expect(createTaskRecord({ title: 'x', createdBy: 'something' }).createdBy).toBe('user')
  })

  it('пустой title → fallback', () => {
    expect(createTaskRecord({}).title).toBe('(без названия)')
  })
})

describe('IPC functions', () => {
  let invokeMock
  beforeEach(() => {
    invokeMock = vi.fn(() => Promise.resolve({ ok: true }))
    globalThis.window = { api: { invoke: invokeMock } }
  })
  afterEach(() => { delete globalThis.window })

  it('createTask invokes tasks:create', async () => {
    await createTask({ title: 'Test' })
    expect(invokeMock).toHaveBeenCalledWith('tasks:create', expect.objectContaining({
      title: 'Test',
    }))
  })

  it('listTasks invokes tasks:list', async () => {
    await listTasks({ status: 'pending' })
    expect(invokeMock).toHaveBeenCalledWith('tasks:list', { status: 'pending' })
  })

  it('completeTask invokes tasks:complete', async () => {
    await completeTask('task_123')
    expect(invokeMock).toHaveBeenCalledWith('tasks:complete', { taskId: 'task_123' })
  })

  it('deleteTask invokes tasks:delete', async () => {
    await deleteTask('task_xx')
    expect(invokeMock).toHaveBeenCalledWith('tasks:delete', { taskId: 'task_xx' })
  })

  it('no window.api → ok:false', async () => {
    delete globalThis.window.api
    const r = await createTask({ title: 'x' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_ipc')
  })
})

// v1.0.5: bulk операции.
describe('bulkCompleteTasks / bulkDeleteTasks (v1.0.5)', () => {
  let invokeMock

  beforeEach(() => {
    invokeMock = vi.fn().mockResolvedValue({ ok: true, updated: 3 })
    globalThis.window = { api: { invoke: invokeMock } }
  })

  afterEach(() => {
    delete globalThis.window
  })

  it('bulkCompleteTasks → invoke tasks:bulk-complete с массивом id', async () => {
    const r = await bulkCompleteTasks(['t1', 't2', 't3'])
    expect(invokeMock).toHaveBeenCalledWith('tasks:bulk-complete', { taskIds: ['t1', 't2', 't3'] })
    expect(r.ok).toBe(true)
    expect(r.updated).toBe(3)
  })

  it('bulkCompleteTasks с пустым массивом → ok:false без IPC вызова', async () => {
    const r = await bulkCompleteTasks([])
    expect(invokeMock).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_taskIds')
  })

  it('bulkCompleteTasks с не-массивом → ok:false', async () => {
    const r = await bulkCompleteTasks('not-array')
    expect(invokeMock).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })

  it('bulkDeleteTasks → invoke tasks:bulk-delete', async () => {
    invokeMock.mockResolvedValueOnce({ ok: true, removed: 2 })
    const r = await bulkDeleteTasks(['x', 'y'])
    expect(invokeMock).toHaveBeenCalledWith('tasks:bulk-delete', { taskIds: ['x', 'y'] })
    expect(r.removed).toBe(2)
  })

  it('bulkDeleteTasks без window.api → ok:false', async () => {
    delete globalThis.window.api
    const r = await bulkDeleteTasks(['x'])
    expect(r.ok).toBe(false)
    expect(r.removed).toBe(0)
  })

  it('IPC throw → ok:false c error', async () => {
    invokeMock.mockRejectedValueOnce(new Error('ipc_failed'))
    const r = await bulkCompleteTasks(['x'])
    expect(r.ok).toBe(false)
    expect(r.error).toBe('ipc_failed')
  })
})
