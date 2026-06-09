// v1.0.1: счётчики для badge на иконках 📋 ⏰ в TabBar.
// Опрашивает tasks:list + reminders:list через IPC, кеширует результат.
// Обновляет: каждые 30 сек + по событиям tasks:changed / reminders:changed.

import { useState, useEffect } from 'react'

export default function useAppCounters() {
  const [counters, setCounters] = useState({ tasks: 0, reminders: 0 })

  useEffect(() => {
    if (!globalThis.window?.api?.invoke) return undefined
    let cancelled = false

    const reload = async () => {
      try {
        const [t, r] = await Promise.all([
          globalThis.window.api.invoke('tasks:list', { status: 'pending' }).catch(() => null),
          globalThis.window.api.invoke('reminders:list', { status: 'pending' }).catch(() => null),
        ])
        if (cancelled) return
        setCounters({
          tasks: t?.ok && Array.isArray(t.tasks) ? t.tasks.length : 0,
          reminders: r?.ok && Array.isArray(r.reminders) ? r.reminders.length : 0,
        })
      } catch (_) { /* silent */ }
    }

    reload()
    const timer = setInterval(reload, 30000)

    let unsubTasks, unsubReminders
    if (globalThis.window?.api?.on) {
      unsubTasks = globalThis.window.api.on('tasks:changed', reload)
      unsubReminders = globalThis.window.api.on('reminders:changed', reload)
    }

    return () => {
      cancelled = true
      clearInterval(timer)
      try { unsubTasks?.() } catch (_) {}
      try { unsubReminders?.() } catch (_) {}
    }
  }, [])

  return counters
}
