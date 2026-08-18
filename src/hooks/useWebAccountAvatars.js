// v1.2.275: сбор аватарки ЗАЛОГИНЕННОГО аккаунта из веб-мессенджеров (ВК/WhatsApp/Макс/Telegram-web),
// чтобы показать её на боковом значке — как у API-аккаунтов (фото вместо голого логотипа).
// v1.2.287: скрипт-инъекция вынесена в src/utils/webAvatarScript.js (хук был у лимита 150 строк).
// Здесь — только проводка: раз в ~12с гоняем скрипт в каждом веб-webview, кладём результат в state,
// логируем успех/причину неудачи/диагностику (по одному разу на мессенджер).
import { useState, useEffect, useRef } from 'react'
import { WEB_ACCOUNT_AVATAR_SCRIPT } from '../utils/webAvatarScript.js'

export { WEB_ACCOUNT_AVATAR_SCRIPT } // ре-экспорт для существующих импортов/тестов

const NATIVE_CC_ID = 'native_cc'

const log = (level, message) => { try { window.api?.send?.('app:log', { level, message }) } catch (_) {} }

export default function useWebAccountAvatars(webviewRefs, messengersRef) {
  const [avatars, setAvatars] = useState({})
  const okLogRef = useRef(new Set())   // лог успеха — один раз на id (фото при этом обновляется всегда)
  const diagRef = useRef(new Set())    // лог неудачи/диагностики — один раз на id
  const execErrRef = useRef(new Set()) // лог отказа запуска — один раз на id
  const startedRef = useRef(false)

  useEffect(() => {
    const tick = () => {
      const list = (messengersRef.current || []).filter(m => !m.isNative && m.id !== NATIVE_CC_ID)
      if (!startedRef.current) { startedRef.current = true; log('INFO', `[web-avatar] сбор запущен, веб-мессенджеров: ${list.length}`) }
      for (const m of list) {
        const wv = webviewRefs.current?.[m.id]
        if (!wv || typeof wv.executeJavaScript !== 'function') continue
        try {
          wv.executeJavaScript(WEB_ACCOUNT_AVATAR_SCRIPT).then(res => {
            if (!res || typeof res !== 'object') return
            if (res.avatar && typeof res.avatar === 'string' && res.avatar.startsWith('data:image')) {
              // обновляем при смене фото (сравнение), лог — один раз
              setAvatars(prev => (prev[m.id] === res.avatar ? prev : { ...prev, [m.id]: res.avatar }))
              if (!okLogRef.current.has(m.id)) { okLogRef.current.add(m.id); log('INFO', `[web-avatar] получен аватар: ${m.id} (sel=${res.sel})`) }
              if (res.diag && !diagRef.current.has(m.id)) { diagRef.current.add(m.id); log('INFO', `[web-avatar-diag] ${m.id}: ${res.diag}`) }
            } else if (!diagRef.current.has(m.id)) {
              diagRef.current.add(m.id)
              log('INFO', `[web-avatar-diag] ${m.id}: НЕТ фото — sel=${res.sel} err=${res.err || ''}${res.dump ? ' dump=' + res.dump : ''}`)
            }
          }).catch(() => {
            if (!execErrRef.current.has(m.id)) { execErrRef.current.add(m.id); log('INFO', `[web-avatar-diag] ${m.id}: запуск скрипта отклонён (webview не готов?)`) }
          })
        } catch (_) {}
      }
    }
    const t0 = setTimeout(tick, 6000)
    const iv = setInterval(tick, 12000)
    return () => { clearTimeout(t0); clearInterval(iv) }
  }, [webviewRefs, messengersRef])

  return avatars
}
