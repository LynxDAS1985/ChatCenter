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
import { useEffect, useRef, useState } from 'react'

export default function WebContentsViewSlot({
  viewId, url, partition, preload,
  visible = true,
  onCreated,
  onIpcMessage, onDidFinishLoad, onDomReady, onDidFailLoad,
  onPageTitleUpdated, onConsoleMessage, onRenderProcessGone,
}) {
  const containerRef = useRef(null)
  const lastBoundsRef = useRef({ x: 0, y: 0, width: 0, height: 0 })
  const createdRef = useRef(false)
  const lastUrlRef = useRef(null)
  // v0.89.47 (Совет 5): если wcv:create вернул ok:false — показываем сообщение
  // вместо белого прямоугольника. Иначе юзер думает «программа сломалась».
  const [createError, setCreateError] = useState(null)

  // Создание / уничтожение WebContentsView через IPC.
  // Зависимости: viewId, partition, preload — изменение этих параметров требует
  // пересоздания view (это базовые опции webPreferences). url НЕ в зависимостях —
  // он обновляется через wcv:load-url в отдельном эффекты (Совет 2 v0.89.43).
  useEffect(() => {
    let alive = true
    // v0.89.50: диагностика — раньше из лога было неясно «слот вообще смонтировался?»
    // (отсутствовал [wcv-timing] лог при включённом пилоте). Теперь видно ровно
    // на каком этапе остановилось: монтаж / отсутствие preload / invoke не дошёл.
    try { window.api?.send('app:log', { level: 'INFO',
      message: `[WCV-slot] mount id=${viewId} url=${url} hasPreload=${!!preload} hasPartition=${!!partition}` }) } catch (_) {}
    if (!viewId) {
      try { window.api?.send('app:log', { level: 'WARN', message: '[WCV-slot] no viewId — slot inactive' }) } catch (_) {}
      return
    }
    ;(async () => {
      try { window.api?.send('app:log', { level: 'INFO',
        message: `[WCV-slot] wcv:create invoke id=${viewId}` }) } catch (_) {}
      const r = await window.api?.invoke('wcv:create', { id: viewId, url, partition, preload })
      if (!alive) return
      if (!r?.ok) {
        try { window.api?.send('app:log', { level: 'ERROR',
          message: '[WCV] create failed id=' + viewId + ' error=' + (r?.error || 'unknown') }) } catch (_) {}
        // v0.89.47 (Совет 5): покажем сообщение поверх пустого слота.
        setCreateError(r?.error || 'WebContentsView не создался')
        return
      }
      setCreateError(null)
      createdRef.current = true
      lastUrlRef.current = url
      // После создания — сразу выставляем bounds.
      pushBounds()
      // v0.90.2: watchdog — если за 15с не пришёл did-finish-load или did-fail-load,
      // показываем сообщение «загрузка зависла» в UI вместо тихой смерти.
      const watchdog = setTimeout(() => {
        if (!alive) return
        try { window.api?.send('app:log', { level: 'ERROR',
          message: '[WCV] watchdog: ' + viewId + ' loadURL timeout 15s (native crash?)' }) } catch (_) {}
        setCreateError('Telegram/мессенджер не загрузился за 15 секунд. Возможно проблема с сетью или native crash WebContentsView. См. логи (Настройки → Диагностика).')
      }, 15000)
      // Снимаем watchdog при did-finish-load (см. wcv:event ниже).
      const detachOnLoad = window.api?.on?.('wcv:event', (payload) => {
        if (payload?.viewId === viewId && (payload.type === 'did-finish-load' || payload.type === 'did-fail-load')) {
          clearTimeout(watchdog)
          try { detachOnLoad?.() } catch (_) {}
        }
      })
      try { onCreated?.() } catch (_) {}
    })()
    return () => {
      alive = false
      if (createdRef.current && viewId) {
        window.api?.invoke('wcv:destroy', { id: viewId }).catch(() => {})
        createdRef.current = false
      }
    }
  }, [viewId, partition, preload])

  // v0.89.43 (Совет 2): реактивный loadURL при изменении url БЕЗ пересоздания
  // view (избегаем потери session, аватара, scroll позиции). View пересоздаётся
  // только если меняется partition или preload (это базовые webPreferences).
  useEffect(() => {
    if (!createdRef.current || !viewId || !url) return
    if (lastUrlRef.current === url) return
    lastUrlRef.current = url
    window.api?.invoke('wcv:load-url', { id: viewId, url }).catch(() => {})
  }, [viewId, url])

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
        position: 'relative',
        // Renderer сам ничего не рисует — main рисует WebContentsView поверх.
        // pointerEvents:'none' не нужен — WebContentsView перекрывает div физически.
        visibility: visible ? 'visible' : 'hidden',
      }}
    >
      {createError && (
        // v0.89.47 (Совет 5): overlay-сообщение если wcv:create провалился.
        // Юзеру понятно что и где выключить, не нужно лезть в логи.
        <div
          role="alert"
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 12, padding: 24,
            backgroundColor: 'var(--cc-surface, #1a1a1a)',
            color: 'var(--cc-text, #eee)', textAlign: 'center',
            fontSize: 14, lineHeight: 1.5,
          }}
        >
          <div style={{ fontSize: 28 }}>⚠️</div>
          <div style={{ fontWeight: 600 }}>WebContentsView не запустился</div>
          <div style={{ opacity: 0.8 }}>
            Откройте <b>Настройки → Уведомления</b> и выключите тумблер<br />
            «WebContentsView (экспериментально)», затем перезапустите программу.
          </div>
          <div style={{ opacity: 0.5, fontSize: 11, marginTop: 8 }}>
            Техническая ошибка: {String(createError).slice(0, 200)}
          </div>
        </div>
      )}
    </div>
  )
}
