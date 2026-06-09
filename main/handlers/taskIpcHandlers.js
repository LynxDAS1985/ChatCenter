// v1.0.0 (Phase 4.1): IPC handlers для Tasks store (main-side persistence).
//
// JSON файл в `userData/tasks.json`. Atomic write через temp + rename.
// Каналы: tasks:create / tasks:list / tasks:update / tasks:complete / tasks:delete

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'

let _deps = null
let _cache = null  // in-memory cache

function getTasksFile() {
  if (!_deps?.userDataPath) throw new Error('tasks: userDataPath not set')
  return path.join(_deps.userDataPath, 'tasks.json')
}

function loadTasks() {
  if (_cache) return _cache
  try {
    const file = getTasksFile()
    if (!fs.existsSync(file)) {
      _cache = []
      return _cache
    }
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    _cache = Array.isArray(parsed) ? parsed : []
  } catch (_) {
    _cache = []
  }
  return _cache
}

function saveTasks() {
  try {
    const file = getTasksFile()
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(_cache || [], null, 2), 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch (_) { return false }
}

function applyFilter(tasks, filter) {
  if (!filter || typeof filter !== 'object') return tasks
  return tasks.filter(t => {
    if (filter.status && t.status !== filter.status) return false
    if (filter.priority && t.priority !== filter.priority) return false
    if (filter.createdBy && t.createdBy !== filter.createdBy) return false
    if (filter.chatId && t.source?.chatId !== filter.chatId) return false
    return true
  })
}

export function initTaskIpcHandlers(deps) {
  _deps = deps
  _cache = null  // force reload

  ipcMain.handle('tasks:create', async (_event, task) => {
    if (!task || !task.id) return { ok: false, error: 'invalid_task' }
    loadTasks()
    _cache.push(task)
    saveTasks()
    return { ok: true, task }
  })

  ipcMain.handle('tasks:list', async (_event, filter = {}) => {
    const all = loadTasks()
    const filtered = applyFilter(all, filter)
    const sorted = [...filtered].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    return { ok: true, tasks: sorted, total: sorted.length }
  })

  ipcMain.handle('tasks:update', async (_event, { taskId, updates } = {}) => {
    if (!taskId) return { ok: false, error: 'missing_taskId' }
    loadTasks()
    const idx = _cache.findIndex(t => t.id === taskId)
    if (idx < 0) return { ok: false, error: 'task_not_found' }
    _cache[idx] = { ..._cache[idx], ...updates }
    saveTasks()
    return { ok: true, task: _cache[idx] }
  })

  ipcMain.handle('tasks:complete', async (_event, { taskId } = {}) => {
    if (!taskId) return { ok: false, error: 'missing_taskId' }
    loadTasks()
    const idx = _cache.findIndex(t => t.id === taskId)
    if (idx < 0) return { ok: false, error: 'task_not_found' }
    _cache[idx] = { ..._cache[idx], status: 'done', completedAt: Date.now() }
    saveTasks()
    return { ok: true, task: _cache[idx] }
  })

  ipcMain.handle('tasks:delete', async (_event, { taskId } = {}) => {
    if (!taskId) return { ok: false, error: 'missing_taskId' }
    loadTasks()
    const before = _cache.length
    _cache = _cache.filter(t => t.id !== taskId)
    saveTasks()
    return { ok: true, removed: before - _cache.length }
  })
}

export const _internal = { getTasksFile, loadTasks, saveTasks }
