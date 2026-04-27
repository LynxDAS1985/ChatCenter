// v0.87.82: вынесено из App.jsx — загрузка messengers/settings/paths при старте.
// Защита от HMR (window.api может быть undefined). При ошибке IPC — fallback на DEFAULT_MESSENGERS.

import { useEffect } from 'react'
import { DEFAULT_MESSENGERS } from '../constants.js'

export default function useAppBootstrap({
  NATIVE_CC_TAB,
  NATIVE_CC_ID,
  setMessengers,
  setActiveId,
  setSettings,
  setAiWidth,
  setZoomLevels,
  setStats,
  setMonitorPreloadUrl,
  setAppReady,
  aiWidthRef,
  zoomLevelsRef,
  statsRef,
}) {
  useEffect(() => {
    const t0 = performance.now()
    const log = (l) => {
      try { window.api?.send('app:log', { level: 'INFO', message: `[startup] +${Math.round(performance.now()-t0)}ms ${l}` }) } catch(_) {}
    }
    log('useEffect start')
    if (!window.api?.invoke) {
      console.error('[App] window.api не инициализирован — загружаем DEFAULT_MESSENGERS')
      setMessengers([...DEFAULT_MESSENGERS, NATIVE_CC_TAB])
      setActiveId(DEFAULT_MESSENGERS[0].id)
      setAppReady(true)
      return
    }
    Promise.all([
      window.api?.invoke('messengers:load').then(loadedList => {
        log(`messengers:load ok (${loadedList?.length || 0} items)`)
        const noNative = (loadedList || []).filter(m => m.id !== NATIVE_CC_ID && !m.isNative)
        const cleaned = noNative.map(m => {
          const def = DEFAULT_MESSENGERS.find(d => d.id === m.id)
          if (def) {
            const { accountScript, ...rest } = m
            return def.accountScript ? { ...rest, accountScript: def.accountScript } : rest
          }
          return m
        })
        const withNative = [...cleaned, NATIVE_CC_TAB]
        setMessengers(withNative)
        setActiveId(withNative[0]?.id || null)
      }).catch(() => {
        setMessengers([...DEFAULT_MESSENGERS, NATIVE_CC_TAB])
        setActiveId(DEFAULT_MESSENGERS[0].id)
      }),
      window.api?.invoke('settings:get').then(s => {
        log('settings:get ok')
        setSettings(s)
        if (s.aiSidebarWidth) {
          const w = Math.max(240, Math.min(600, s.aiSidebarWidth))
          setAiWidth(w); aiWidthRef.current = w
        }
        if (s.zoomLevels && typeof s.zoomLevels === 'object') {
          setZoomLevels(s.zoomLevels)
          zoomLevelsRef.current = s.zoomLevels
        }
        const todayDate = new Date().toISOString().slice(0, 10)
        const savedStats = s.stats || {}
        const loadedStats = savedStats.date !== todayDate
          ? { today: 0, autoToday: 0, total: savedStats.total || 0, date: todayDate }
          : { today: savedStats.today || 0, autoToday: savedStats.autoToday || 0, total: savedStats.total || 0, date: savedStats.date }
        setStats(loadedStats)
        statsRef.current = loadedStats
      }).catch(() => {}),
      window.api?.invoke('app:get-paths').then(({ monitorPreload }) => {
        log('app:get-paths ok')
        if (monitorPreload) {
          const url = 'file:///' + monitorPreload.replace(/\\/g, '/').replace(/^\//, '')
          setMonitorPreloadUrl(url)
        }
      }).catch(() => {})
    ]).finally(() => { log('Promise.all done → appReady=true'); setAppReady(true) })
  }, [])
}
