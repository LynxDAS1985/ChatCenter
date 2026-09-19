// v0.95.7: drag-to-resize для разделителя chat-list ↔ окно чата.
//
// Эталон — useAIPanelResize.js (Pointer Events API, W3C 2018+, setPointerCapture).
// Документация: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
//
// Direct DOM mutation на style.width во время drag — НЕТ re-render React'а на
// каждый pointermove → 60fps без просадки. setState + settings:save только на
// pointerup (финальная фиксация).
//
// Diapason: 60px (узкий compact с одними аватарками) — 600px (полный список).
// При width < 200px chat-list переключается в compact mode (см. ChatListItem).
//
// Persistence: settings.chatListWidth через IPC settings:save (тот же канал,
// что aiSidebarWidth).
//
// Double-click на handle → reset к default (340px).

import { useCallback, useEffect } from 'react'

// v1.2.460: чистые расчёты (границы, потолок от окна, порог «узкого вида») вынесены в
// shared/chatListWidth.js — файл стоял 144/150, а у интерфейса оставалось 4 строки общей
// планки. Здесь остаётся ТОЛЬКО перетаскивание: работа с элементом на экране и с React.
// Имена ре-экспортируем НЕ здесь: и хук, и экран переписки берут их прямо из shared,
// чтобы не было двух путей к одному и тому же.
import {
  CHAT_LIST_DEFAULT_WIDTH,
  clampChatListWidth, isChatListCompact,
} from '../../../shared/chatListWidth.js'

export default function useChatListResize({
  isResizingRef, resizeStartRef, chatListWidthRef, chatListRef, settingsRef,
  setIsResizing, setChatListWidth,
}) {
  const onPointerMove = useCallback((e) => {
    if (!isResizingRef.current) return
    // Drag вправо — увеличиваем ширину (handle на правом краю chat-list'а).
    const delta = e.clientX - resizeStartRef.current.x
    const newW = clampChatListWidth(resizeStartRef.current.w + delta)
    const prevW = chatListWidthRef.current
    chatListWidthRef.current = newW
    if (chatListRef.current) {
      chatListRef.current.style.width = `${newW}px`
    }
    // v0.95.8: live compact toggle ВО ВРЕМЯ drag. setState только при пересечении
    // threshold (не каждый pixel) — 60fps сохраняется, React re-render лишь 1 раз
    // когда compact ON или OFF переключается. Юзер видит переход сразу, не после
    // отпускания мыши.
    const wasCompact = isChatListCompact(prevW)
    const isCompact = isChatListCompact(newW)
    if (wasCompact !== isCompact) {
      setChatListWidth(newW)
    }
  }, [isResizingRef, resizeStartRef, chatListWidthRef, chatListRef, setChatListWidth])

  const onPointerUp = useCallback((e) => {
    if (!isResizingRef.current) return
    isResizingRef.current = false
    setIsResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    const newW = chatListWidthRef.current
    setChatListWidth(newW)
    if (settingsRef?.current) {
      const updated = { ...settingsRef.current, chatListWidth: newW }
      settingsRef.current = updated
      try { window.api?.invoke('settings:save', updated) } catch (_) {}
    }
    if (chatListRef.current) chatListRef.current.style.transition = ''
    try { e.currentTarget?.releasePointerCapture?.(e.pointerId) } catch (_) {}
  }, [isResizingRef, chatListWidthRef, chatListRef, settingsRef, setIsResizing, setChatListWidth])

  const startResize = useCallback((e) => {
    isResizingRef.current = true
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, w: chatListWidthRef.current }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    if (chatListRef.current) chatListRef.current.style.transition = 'none'
    e.preventDefault()
  }, [isResizingRef, resizeStartRef, chatListWidthRef, chatListRef, setIsResizing])

  const resetToDefault = useCallback(() => {
    // v1.2.459: сброс тоже проходит через общую проверку. Раньше он ставил значение по
    // умолчанию НАПРЯМУЮ и был единственным из трёх путей (загрузка настроек /
    // перетаскивание / сброс), который не знал про потолок «не шире 40% окна».
    // Сейчас это недостижимо (окно не уже 900 → потолок 360 больше значения по
    // умолчанию 340), но правило обязано соблюдаться ВЕЗДЕ: иначе при смене минимума
    // окна или значения по умолчанию оно сломается молча.
    const w = clampChatListWidth(CHAT_LIST_DEFAULT_WIDTH)
    chatListWidthRef.current = w
    setChatListWidth(w)
    if (chatListRef.current) chatListRef.current.style.width = `${w}px`
    if (settingsRef?.current) {
      const updated = { ...settingsRef.current, chatListWidth: w }
      settingsRef.current = updated
      try { window.api?.invoke('settings:save', updated) } catch (_) {}
    }
  }, [chatListWidthRef, chatListRef, settingsRef, setChatListWidth])

  // ── v1.2.486 (TODO-40): окно меняют мышкой — ширина списка чатов подстраивается СРАЗУ ──
  //
  // Было: потолок «не шире 40% окна» считался только при загрузке настроек, при
  // перетаскивании и при сбросе. Сузил окно во время работы — список оставался прежней
  // ширины и съедал место у самой переписки до следующего запуска.
  //
  // 🔴 ПОЧЕМУ НЕ ПРАВИЛОМ ВЁРСТКИ (как у панели ИИ): «узкий вид» списка (одни аватарки)
  // решается по ЭТОМУ ЖЕ числу. Уменьши мы только показанную ширину — панель стала бы
  // узкой, а строки внутри рисовались бы широкими и обрезались. Поэтому правим число.
  //
  // 🔴 ПОЧЕМУ НЕ ТРОГАЕМ СОХРАНЁННОЕ: считаем ПОКАЗАННУЮ ширину от ЖЕЛАЕМОЙ (из настроек),
  // а в настройки ничего не пишем. Сузил окно — список ужался; вернул окно — список сам
  // вернулся к своей ширине. Если бы записали ужатое число в настройки, ширина пользователя
  // терялась бы навсегда после каждого сужения окна.
  useEffect(() => {
    let settle = null
    const apply = () => {
      if (isResizingRef.current) return // тащат разделитель — там свой расчёт
      const saved = Number(settingsRef?.current?.chatListWidth)
      const desired = Number.isFinite(saved) ? saved : chatListWidthRef.current
      const next = clampChatListWidth(desired)
      if (next === chatListWidthRef.current) return
      chatListWidthRef.current = next
      if (chatListRef.current) chatListRef.current.style.width = `${next}px`
      // Ширину на экране меняем сразу, а React-состояние (от него зависит «узкий вид») —
      // когда тянуть окно перестали: иначе перерисовка шла бы на каждый пиксель.
      clearTimeout(settle)
      settle = setTimeout(() => setChatListWidth(next), 120)
    }
    window.addEventListener('resize', apply)
    return () => { window.removeEventListener('resize', apply); clearTimeout(settle) }
  }, [isResizingRef, chatListWidthRef, chatListRef, settingsRef, setChatListWidth])

  return { startResize, onPointerMove, onPointerUp, resetToDefault }
}
