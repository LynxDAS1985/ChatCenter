// v0.91.17: периодическое сохранение позиции чата каждые 1.5с пока чат активен.
// Корень: useInboxScroll handleScroll сохраняет anchor ТОЛЬКО при scroll событии.
// Если юзер открыл чат и просто читает без скроллинга (длинные статьи с превью,
// большие посты которые умещаются в viewport частично) — сохранения не происходит.
// При возврате попадает не на свою позицию.
//
// Telegram Web K делает похоже (tweb ScrollSaver + on-peer-change). Мы упрощаем
// до интервала — без lifecycle quirks (React 19 порядок effects: children раньше
// parent → cleanup useEffect в parent не видит старый DOM).
//
// Защита:
//   - interval запускается только при chatReady=true И activeViewKey валиден
//   - savedMessage сохраняется только если есть anchor ИЛИ atBottom
//   - cleanup автоматически при смене activeViewKey (useEffect deps)
//
// Подробности — mistakes/native-scroll-unread.md «handleScroll не покрывает простой
// просмотр без скролла».

import { useEffect } from 'react'
import { findVisibleAnchorMsgId, saveScrollPositions } from '../utils/scrollPositionsCache.js'
import { logNativeScroll } from '../utils/scrollDiagnostics.js'

const AUTOSAVE_INTERVAL_MS = 1500

export function useScrollPositionAutosave({ activeViewKey, chatReady, msgsScrollRef, scrollPosByChatRef, isRestoringRef }) {
  useEffect(() => {
    if (!activeViewKey || !chatReady) return
    const interval = setInterval(() => {
      // v0.92.4: ВОЗВРАЩАЕМ guard — Virtuoso restore DOES вызывать DOM scroll event,
      // через 1.5с может сохранить промежуточный (искажённый) anchor → дрейф.
      if (isRestoringRef?.current) {
        logNativeScroll('autosave-save', { activeViewKey, anchorMsgId: null, atBottom: false, isRestoring: true })
        return
      }
      const el = msgsScrollRef.current
      if (!el) return
      // v0.93.0: findVisibleAnchorMsgId возвращает объект {anchorMsgId, offsetFromTop}.
      const anchorInfo = findVisibleAnchorMsgId(el)
      const anchorMsgId = anchorInfo?.anchorMsgId || null
      const offsetFromTop = anchorInfo?.offsetFromTop || 0
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (anchorMsgId || atBottom) {
        scrollPosByChatRef.current.set(activeViewKey, { anchorMsgId, atBottom, offsetFromTop })
        saveScrollPositions(scrollPosByChatRef.current)
        logNativeScroll('autosave-save', { activeViewKey, anchorMsgId, atBottom, offsetFromTop })
      }
    }, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(interval)
    // v0.91.18: refs (msgsScrollRef, scrollPosByChatRef) не в deps — по React docs
    // (https://react.dev/reference/react/useEffect) useRef имеет стабильную
    // идентичность, рефы не нужно добавлять в dependencies.
  }, [activeViewKey, chatReady])
}
