// v0.87.81: вынесено из main.js — JSON-хранилище и миграция настроек.
// Простое key-value хранилище в JSON-файле без ESM-зависимостей.

import fs from 'node:fs'
import path from 'node:path'

export const SETTINGS_VERSION = 2

export function migrateSettings(settings, storagePath) {
  if (!settings || typeof settings !== 'object') {
    return { _version: SETTINGS_VERSION, soundEnabled: true, minimizeToTray: true }
  }
  // Backup перед миграцией
  if ((settings._version || 1) < SETTINGS_VERSION && storagePath) {
    try { fs.copyFileSync(storagePath, storagePath + '.bak'); console.log('[Settings] Backup created') } catch {}
  }
  const v = settings._version || 1
  // Миграция v1 → v2: добавлены поля notificationsEnabled, overlayMode
  if (v < 2) {
    if (settings.notificationsEnabled === undefined) settings.notificationsEnabled = true
    if (settings.overlayMode === undefined) settings.overlayMode = 'all'
  }
  settings._version = SETTINGS_VERSION
  return settings
}

export function initStorage(userDataPath) {
  const filePath = path.join(userDataPath, 'chatcenter.json')
  let data = {}
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch (e) {
    console.warn('[Storage] Не удалось прочитать chatcenter.json:', e.message)
  }

  const save = () => {
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8') } catch (e) {
      console.error('[Storage] Ошибка сохранения:', e.message)
    }
  }

  return {
    get: (key, def = null) => (key in data ? data[key] : def),
    set: (key, val) => { data[key] = val; save() },
    delete: (key) => { delete data[key]; save() }
  }
}
