// v1.1.0 (Phase 4.3): IPC handlers для auto-reply rules.
//
// JSON файл в `userData/auto-reply-rules.json`. Atomic write через .tmp + rename.
// Каналы: auto-reply:create / :list / :update / :delete.

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'

let _deps = null
let _cache = null

function getRulesFile() {
  if (!_deps?.userDataPath) throw new Error('auto-reply: userDataPath not set')
  return path.join(_deps.userDataPath, 'auto-reply-rules.json')
}

function loadRules() {
  if (_cache) return _cache
  try {
    const file = getRulesFile()
    if (!fs.existsSync(file)) { _cache = []; return _cache }
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    _cache = Array.isArray(parsed) ? parsed : []
  } catch (_) { _cache = [] }
  return _cache
}

function saveRules() {
  try {
    const file = getRulesFile()
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(_cache || [], null, 2), 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch (_) { return false }
}

export function initAutoReplyRulesIpcHandlers(deps) {
  _deps = deps
  _cache = null

  ipcMain.handle('auto-reply:create', async (_event, rule) => {
    if (!rule || !rule.id) return { ok: false, error: 'invalid_rule' }
    loadRules()
    _cache.push(rule)
    saveRules()
    return { ok: true, rule }
  })

  ipcMain.handle('auto-reply:list', async () => {
    const all = loadRules()
    const sorted = [...all].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    return { ok: true, rules: sorted, total: sorted.length }
  })

  ipcMain.handle('auto-reply:update', async (_event, { ruleId, updates } = {}) => {
    if (!ruleId) return { ok: false, error: 'missing_ruleId' }
    loadRules()
    const idx = _cache.findIndex(r => r.id === ruleId)
    if (idx < 0) return { ok: false, error: 'rule_not_found' }
    _cache[idx] = { ..._cache[idx], ...updates, updatedAt: Date.now() }
    saveRules()
    return { ok: true, rule: _cache[idx] }
  })

  ipcMain.handle('auto-reply:delete', async (_event, { ruleId } = {}) => {
    if (!ruleId) return { ok: false, error: 'missing_ruleId' }
    loadRules()
    const before = _cache.length
    _cache = _cache.filter(r => r.id !== ruleId)
    saveRules()
    return { ok: true, removed: before - _cache.length }
  })
}

// Экспорт чтобы engine мог читать rules без IPC round-trip.
export function getCachedRules() {
  return loadRules()
}

export function markRuleMatched(ruleId) {
  loadRules()
  const idx = _cache.findIndex(r => r.id === ruleId)
  if (idx < 0) return false
  _cache[idx] = {
    ..._cache[idx],
    matchedCount: (_cache[idx].matchedCount || 0) + 1,
    lastMatchedAt: Date.now(),
  }
  saveRules()
  return true
}

export const _internal = { loadRules, saveRules, getRulesFile }
