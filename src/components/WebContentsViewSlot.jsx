// v0.89.41: WebContentsViewSlot — React-компонент-«слот» для WebContentsView.
//
// КОНЦЕПЦИЯ:
//   В отличие от <webview> тега (HTML element с внутренним содержимым),
//   WebContentsView живёт в MAIN процессе и позиционируется через setBounds.
//   Renderer рендерит пустой <div> который занимает место в layout;
//   ResizeObserver + IntersectionObserver следят за позицией <div> и
//   шлют setBounds в main по IPC. Содержимое (страница мессенджера)
//   отрисовывается в main поверх этого <div>.
//
// API:
//   <WebContentsViewSlot
//     viewId="tg-main"
//     url="https://web.telegram.org/"
//     partition="persist:tg-main"
//     preload={preloadUrl}
//     onIpcMessage={(channel, args) => ...}
//     onDidFinishLoad={() => ...}
//     onPageTitleUpdated={(title) => ...}
//     visible={true}
//   />
//
// При visible=false слот сжимается до 0×0 (WebContentsView физически скрыт).
//
// Документация: https://www.electronjs.org/docs/latest/api/web-contents-view
import { useEffect, useRef } from 'react'

export default function WebContentsViewSlot({
  viewId, url, partition, preload,
  visible = true,
  onIpcMessage, onDidFinishLoad, onDomReady, onDidFailLoad,
  onPageTitleUpdated, onConsoleMessage, onRenderProcessGone,
}) {
  const containerRef = useRef(null)
  const lastBoundsRef = useRef({ x: 0, y: 0, width: 0, height: 0 })
  const createdRef = useRef(false)

  // Создание / уничтожение WebContentsView через IPC
  useEffect(() => {
    let alive = true
    if (!viewId) return
    ;(async () => {
      const r = await window.api?.invoke('wcv:create', { id: viewId, url, partition, preload })
      if (!alive) return
      if (!r?.ok) {
        try { window.api?.send('app:log', { level: 'ERROR',
          message: '[WCV] create failed id=' + viewId + ' error=' + (r?.error || 'unknown') }) } catch (_) {}
        return
      }
      createdRef.current = true
      // После создания — сразу выставляем bounds.
      pushBounds()
    })()
    return () => {
      alive = false
      if (createdRef.current && viewId) {
        window.api?.invoke('wcv:destroy', { id: viewId }).catch(() => {})
        createdRef.current = false
      }
    }
  }, [viewId, url, partition, preload])

  // Подписка на 'wcv:event' (один канал для всех событий main → renderer).
  useEffect(() => {
    if (!viewId || !window.api?.on) return
    const detach = window.api.on('wcv:event', (payload) => {
      if (!payload || payload.viewId !== viewId) return
      const args = Array.isArray(payload.args) ? payload.args : []
      switch (payload.type) {
        case 'did-finish-load': onDidFinishLoad?.(); break
        case 'dom-ready': onDomReady?.(); break
        case 'did-fail-load':
          onDidFailLoad?.({ errorCode: args[1], errorDescription: args[2], validatedURL: args[3] })
          break
        case 'page-title-updated':
          onPageTitleUpdated?.(args[1])
          break
        case 'console-message':
          onConsoleMessage?.({ level: args[1], message: args[2], line: args[3], sourceId: args[4] })
          break
        case 'render-process-gone':
          onRenderProcessGone?.(args[1])
          break
        case 'ipc-message':
          onIpcMessage?.(payload.channel, args)
          break
        default: break
      }
    })
    return () => { try { detach?.() } catch (_) {} }
  }, [viewId, onIpcMessage, onDidFinishLoad, onDomReady, onDidFailLoad,
      onPageTitleUpdated, onConsoleMessage, onRenderProcessGone])

  function pushBounds() {
    if (!createdRef.current || !viewId) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // Если visible=false — отправляем 0×0 bounds (WebContentsView физически скрыт).
    const bounds = visible
      ? { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
      : { x: 0, y: 0, width: 0, height: 0 }
    const prev = lastBoundsRef.current
    if (prev.x === bounds.x && prev.y === bounds.y && prev.width === bounds.width && prev.height === bounds.height) return
    lastBoundsRef.current = bounds
    window.api?.invoke('wcv:set-bounds', { id: viewId, ...bounds }).catch(() => {})
  }

  // ResizeObserver — реагируем на изменение размера контейнера.
  // window resize / scroll — на изменение позиции (rect.left/top).
  useEffect(() => {
    if (!viewId) return
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => pushBounds())
    ro.observe(el)
    const onWindow = () => pushBounds()
    window.addEventListener('resize', onWindow, { passive: true })
    window.addEventListener('scroll', onWindow, { passive: true, capture: true })
    // Push при visible/url change тоже.
    pushBounds()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onWindow)
      window.removeEventListener('scroll', onWindow, { capture: true })
    }
  }, [viewId, visible])

  return (
    <div
      ref={containerRef}
      data-wcv-slot={viewId}
      style={{
        width: '100%', height: '100%',
        // Renderer сам ничего не рисует — main рисует WebContentsView поверх.
        // pointerEvents:'none' не нужен — WebContentsView перекрывает div физически.
        visibility: visible ? 'visible' : 'hidden',
      }}
    />
  )
}
