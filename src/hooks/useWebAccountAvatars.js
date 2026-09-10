// v1.2.275: сбор аватарки ЗАЛОГИНЕННОГО аккаунта из веб-мессенджеров (ВК/WhatsApp/Макс/Telegram-web),
// чтобы показать её на боковом значке — как у API-аккаунтов (фото вместо голого логотипа).
// v1.2.287: скрипт-инъекция вынесена в src/utils/webAvatarScript.js (хук был у лимита 150 строк).
// v1.2.441: «память» гейтов журнала, сброс фото и ТЕКСТЫ записей вынесены в shared/webAvatarGate.js
//   (вне бюджета renderer, как shared/notifAlbum.js) — там же расписаны три находки ревью.
// Здесь — только проводка: раз в ~12с гоняем скрипт в каждом веб-webview и кладём результат в состояние.
import { useState, useEffect, useRef } from 'react'
import { WEB_ACCOUNT_AVATAR_SCRIPT } from '../utils/webAvatarScript.js'
import { AVATAR_RESET_EVENT, avatarLogGateKey, applyAvatarReset, avatarOkLine, avatarReplacedLine, avatarFailLine } from '../../shared/webAvatarGate.js'

export { WEB_ACCOUNT_AVATAR_SCRIPT } // ре-экспорт для существующих импортов/тестов
export { AVATAR_RESET_EVENT, avatarLogGateKey }

const NATIVE_CC_ID = 'native_cc'

const log = (level, message) => { try { window.api?.send?.('app:log', { level, message }) } catch (_) {} }

export default function useWebAccountAvatars(webviewRefs, messengersRef) {
  const [avatars, setAvatars] = useState({})
  const okLogRef = useRef(new Set())   // успех — один раз на СОСТОЯНИЕ id+где+причина (фото обновляется всегда)
  const failRef = useRef(new Set())    // «НЕТ фото» — один раз на СОСТОЯНИЕ id+где+причина+ошибка (v1.2.441)
  const diagRef = useRef(new Set())    // разовый дамп диагностики — один раз на id
  const execErrRef = useRef(new Set()) // отказ запуска скрипта — один раз на id
  const lastPhotoRef = useRef(new Map()) // последнее отданное фото — чтобы поймать ЗАМЕНУ (v1.2.441)
  const startedRef = useRef(false)

  // v1.2.441 (находка №1): по команде «Обновить фото аккаунта» значок должен ЗАБЫТЬ старое фото,
  // иначе кнопка выглядит нерабочей. Событие шлёт useTabContextMenu.js после удачной чистки ключей.
  useEffect(() => {
    const onReset = (ev) => {
      const gateSets = [okLogRef.current, failRef.current, diagRef.current, execErrRef.current]
      const line = applyAvatarReset({ ev, setAvatars, lastPhotos: lastPhotoRef.current, gateSets })
      if (line) log('INFO', line)
    }
    window.addEventListener(AVATAR_RESET_EVENT, onReset)
    return () => window.removeEventListener(AVATAR_RESET_EVENT, onReset)
  }, [])

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
              // обновляем при смене фото (сравнение), лог — один раз на состояние
              setAvatars(prev => (prev[m.id] === res.avatar ? prev : { ...prev, [m.id]: res.avatar }))
              // v1.2.441: ЗАМЕНА фото — отдельная запись; именно она подтверждает, что сброс сработал
              const wasPhoto = lastPhotoRef.current.get(m.id)
              if (wasPhoto && wasPhoto !== res.avatar) log('INFO', avatarReplacedLine(m.id, res))
              lastPhotoRef.current.set(m.id, res.avatar)
              // v1.2.440: в журнал идёт и ПРИЧИНА (avwhy): «ok» — взяли сохранённый снимок,
              // «устарел» / «чужой-аккаунт» / «мелкий-N» — переснимали и почему.
              const okKey = avatarLogGateKey(m.id, res.sel, res.avwhy, res.avnear)
              if (!okLogRef.current.has(okKey)) { okLogRef.current.add(okKey); log('INFO', avatarOkLine(m.id, res)) }
              if (res.diag && !diagRef.current.has(m.id)) { diagRef.current.add(m.id); log('INFO', `[web-avatar-diag] ${m.id}: ${res.diag}`) }
            } else {
              // v1.2.441 (находка №2): гейт по СОСТОЯНИЮ, а не по одному id — иначе после сброса
              // фото повторная неудача в журнал уже не попадала.
              const failKey = avatarLogGateKey(m.id, res.sel, res.avwhy, res.err)
              if (!failRef.current.has(failKey)) { failRef.current.add(failKey); log('INFO', avatarFailLine(m.id, res)) }
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
