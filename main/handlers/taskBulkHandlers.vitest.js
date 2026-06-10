// v1.0.5: тесты bulk операций tasks (main-side).
// Тестируем напрямую логику filter+save через _internal expose.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted — поднимается на самый верх вместе с vi.mock.
const { handlers, fsMock } = vi.hoisted(() => {
  const handlers = {}
  const fsMock = {
    files: new Map(),
    existsSync(p) { return fsMock.files.has(p) },
    readFileSync(p) {
      if (!fsMock.files.has(p)) throw new Error('ENOENT: ' + p)
      return fsMock.files.get(p)
    },
    writeFileSync(p, data) { fsMock.files.set(p, data) },
    renameSync(from, to) {
      if (fsMock.files.has(from)) {
        fsMock.files.set(to, fsMock.files.get(from))
        fsMock.files.delete(from)
      }
    },
  }
  return { handlers, fsMock }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel, fn) => { handlers[channel] = fn },
  },
}))

vi.mock('fs', () => ({ default: fsMock, ...fsMock }))

import { initTaskIpcHandlers } from './taskIpcHandlers.js'
import path from 'node:path'
const TASKS_FILE = path.join('/data', 'tasks.json')

describe('tasks:bulk-complete (v1.0.5)', () => {
  beforeEach(() => {
    fsMock.files.clear()
    // Pre-fill tasks.json
    fsMock.files.set(TASKS_FILE, JSON.stringify([
      { id: 't1', title: 'A', status: 'pending', createdAt: 1 },
      { id: 't2', title: 'B', status: 'pending', createdAt: 2 },
      { id: 't3', title: 'C', status: 'done', createdAt: 3, completedAt: 100 },
      { id: 't4', title: 'D', status: 'pending', createdAt: 4 },
    ]))
    initTaskIpcHandlers({ userDataPath: '/data' })
  })

  it('completes только pending → returns updated count', async () => {
    const r = await handlers['tasks:bulk-complete'](null, { taskIds: ['t1', 't2', 't4'] })
    expect(r.ok).toBe(true)
    expect(r.updated).toBe(3)

    // Проверяем что сохранилось на диск
    const saved = JSON.parse(fsMock.files.get(TASKS_FILE))
    const t1 = saved.find(t => t.id === 't1')
    expect(t1.status).toBe('done')
    expect(t1.completedAt).toBeGreaterThan(0)
  })

  it('done не дублируется', async () => {
    const r = await handlers['tasks:bulk-complete'](null, { taskIds: ['t3'] })
    expect(r.ok).toBe(true)
    expect(r.updated).toBe(0)
  })

  it('несуществующие id игнорятся', async () => {
    const r = await handlers['tasks:bulk-complete'](null, { taskIds: ['t1', 'tnope', 'tmiss'] })
    expect(r.ok).toBe(true)
    expect(r.updated).toBe(1)  // только t1
  })

  it('пустой массив → ok:false без write', async () => {
    const before = fsMock.files.get(TASKS_FILE)
    const r = await handlers['tasks:bulk-complete'](null, { taskIds: [] })
    expect(r.ok).toBe(false)
    expect(r.updated).toBe(0)
    expect(fsMock.files.get(TASKS_FILE)).toBe(before)
  })

  it('не-массив → ok:false', async () => {
    const r = await handlers['tasks:bulk-complete'](null, { taskIds: 'string' })
    expect(r.ok).toBe(false)
  })

  it('taskIds отсутствует → ok:false', async () => {
    const r = await handlers['tasks:bulk-complete'](null, {})
    expect(r.ok).toBe(false)
  })
})

describe('tasks:bulk-delete (v1.0.5)', () => {
  beforeEach(() => {
    fsMock.files.clear()
    fsMock.files.set(TASKS_FILE, JSON.stringify([
      { id: 't1', title: 'A', status: 'pending', createdAt: 1 },
      { id: 't2', title: 'B', status: 'done', createdAt: 2 },
      { id: 't3', title: 'C', status: 'pending', createdAt: 3 },
    ]))
    initTaskIpcHandlers({ userDataPath: '/data' })
  })

  it('удаляет указанные → returns removed count', async () => {
    const r = await handlers['tasks:bulk-delete'](null, { taskIds: ['t1', 't3'] })
    expect(r.ok).toBe(true)
    expect(r.removed).toBe(2)
    const saved = JSON.parse(fsMock.files.get(TASKS_FILE))
    expect(saved.length).toBe(1)
    expect(saved[0].id).toBe('t2')
  })

  it('пустой массив → ok:false без write', async () => {
    const r = await handlers['tasks:bulk-delete'](null, { taskIds: [] })
    expect(r.ok).toBe(false)
    expect(r.removed).toBe(0)
  })

  it('несуществующие id → removed:0, файл не пишется', async () => {
    const before = fsMock.files.get(TASKS_FILE)
    const r = await handlers['tasks:bulk-delete'](null, { taskIds: ['nope1', 'nope2'] })
    expect(r.ok).toBe(true)
    expect(r.removed).toBe(0)
    expect(fsMock.files.get(TASKS_FILE)).toBe(before)
  })
})
