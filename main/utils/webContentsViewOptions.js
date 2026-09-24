// main/utils/webContentsViewOptions.js — v1.2.501
//
// Сборка настроек для нового WebContentsView: что включаем, и как поступаем с preload-файлом.
// Вынесено из main/utils/webContentsViewManager.js — тот подошёл к своему потолку (277 из 300 строк,
// предупреждение теста лимитов). Правило проекта: разделять файл, а не резать комментарии и не
// поднимать планку (CLAUDE.md, ADR-044).
//
// Блок обособленный: он ничего не знает о самом менеджере и о хранении видов — только собирает
// настройки и проверяет, существует ли файл preload.

import fs from 'node:fs'

/**
 * Настройки для `new WebContentsView(...)`.
 *
 * 🔴 ЛОВУШКИ, которые здесь закреплены (обе стоили проекту разбирательств):
 *  • sandbox:false — monitor.preload.cjs пользуется возможностями Node (v0.89.55);
 *  • backgroundThrottling:false — иначе у скрытого вида засыпают анимации и таймеры (v0.89.35);
 *  • НЕСУЩЕСТВУЮЩИЙ путь preload может уронить главный процесс НАТИВНО (v0.89.51), поэтому файл
 *    проверяется заранее, и при его отсутствии вид создаётся вообще без preload — это лучше, чем
 *    падение всей программы.
 *
 * @param {{ id: string, partition?: string, preload?: string }} p
 * @param {(preload: string) => string} normalizePreloadPath — приведение пути (живёт в менеджере)
 * @returns {object} готовый webPreferences
 */
export function buildViewPreferences({ id, partition, preload }, normalizePreloadPath) {
  const webPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    backgroundThrottling: false,
  }
  if (partition) webPreferences.partition = partition

  if (!preload) {
    console.log(`[wcv-mgr] createView id=${id} preload=(none) partition=${partition || '(none)'}`)
    return webPreferences
  }

  const preloadPath = typeof normalizePreloadPath === 'function' ? normalizePreloadPath(preload) : preload
  console.log(`[wcv-mgr] createView id=${id} preload=${preloadPath} partition=${partition || '(none)'}`)
  if (!fs.existsSync(preloadPath)) {
    console.error(`[wcv-mgr] preload file NOT FOUND: ${preloadPath} — пропускаем preload`)
    return webPreferences // без preload лучше, чем уронить главный процесс
  }
  webPreferences.preload = preloadPath
  return webPreferences
}
