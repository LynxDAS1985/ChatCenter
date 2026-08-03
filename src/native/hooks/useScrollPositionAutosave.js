// v0.91.17: периодическое сохранение позиции чата каждые 1.5с пока чат активен.
// Корень: handleScroll сохраняет позицию ТОЛЬКО при scroll событии. Если юзер открыл
// чат и просто читает без скроллинга — сохранения нет, при возврате попадает не туда.
//
// v0.94.0: сохраняем pixel scrollTop (виртуализация удалена, формат {scrollTop, atBottom}).
//
// Защита:
//   - interval только при chatReady=true И activeViewKey валиден
//   - isRestoringRef guard — не сохраняем во время programmatic scroll от restore
//   - cleanup автоматически при смене activeViewKey (useEffect deps)

import { useEffect } from 'react'
import { saveScrollPositions, computeScrollAnchor } from '../utils/scrollPositionsCache.js'
import { logNativeScroll } from '../utils/scrollDiagnostics.js'

const AUTOSAVE_INTERVAL_MS = 1500

export function useScrollPositionAutosave({ activeViewKey, chatReady, msgsScrollRef, scrollPosByChatRef, isRestoringRef }) {
  useEffect(() => {
    if (!activeViewKey || !chatReady) return
    const interval = setInterval(() => {
      // v0.92.4: не сохраняем во время programmatic scroll от restore.
      if (isRestoringRef?.current) return
      const el = msgsScrollRef.current
      if (!el) return
      // v1.2.186: сохраняем ЯКОРЬ — верхнее видимое сообщение + его смещение (screenTop).
      // Устойчиво к догрузке сообщений с обеих сторон (см. scrollPositionsCache.js).
      // atBottom — тот же порог (<80 = «в конце»); там якорь не нужен, ставим ровно в конец.
      const atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 80
      const anchor = computeScrollAnchor(el)
      scrollPosByChatRef.current.set(activeViewKey, {
        anchorMsgId: anchor?.anchorMsgId ?? null, screenTop: anchor?.screenTop ?? 0, atBottom,
      })
      saveScrollPositions(scrollPosByChatRef.current)
      logNativeScroll('autosave-save', { activeViewKey, anchorMsgId: anchor?.anchorMsgId ?? null, screenTop: Math.round(anchor?.screenTop ?? 0), atBottom })
    }, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(interval)
    // v0.91.18: refs не в deps — useRef имеет стабильную идентичность (React docs).
  }, [activeViewKey, chatReady])
}
