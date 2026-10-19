// v0.84.4: Вынесено из AISidebar.jsx — панель вкладок провайдеров
// v1.2.510: меню по ПРАВОЙ кнопке на вкладке провайдера — «Перезапустить страницу».
import { useState, useEffect } from 'react'
import { getProviderCfg } from '../utils/aiProviders.js'

export default function AIProviderTabs({
  connectedProviders, unconnectedProviders, provider, settings,
  providerStatuses, providerCheckTimes, hoveredStatus, setHoveredStatus,
  showAddProvider, setShowAddProvider, setShowConfig, switchProvider,
  reloadProviderPage,
}) {
  // v1.2.510: { x, y, pid } — где открыть меню и для какой вкладки. null = меню закрыто.
  // Меню предлагаем ТОЛЬКО для провайдеров в режиме «Веб-интерфейс»: у режима «API-ключ»
  // страницы нет, перезапускать нечего (иначе пункт вводил бы в заблуждение).
  const [ctxMenu, setCtxMenu] = useState(null)
  useEffect(() => {
    if (!ctxMenu) return undefined
    const close = () => setCtxMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [ctxMenu])

  return (
    <div className="px-2 pt-2 pb-1.5 shrink-0" style={{ borderBottom: '1px solid var(--cc-border)' }}>
      {connectedProviders.length > 0 ? (
        <div className="flex items-center gap-1 flex-wrap">
          {connectedProviders.map(p => {
            const pCfg = getProviderCfg(settings, p.id)
            const pSt = providerStatuses[p.id]
            return (
              <button
                key={p.id}
                onClick={() => { switchProvider(p.id); setShowConfig(false) }}
                onContextMenu={e => {
                  e.preventDefault()
                  if (pCfg.mode !== 'webview') return   // у режима «API-ключ» страницы нет
                  const safeX = typeof window !== 'undefined' ? Math.max(8, Math.min(e.clientX, window.innerWidth - 195)) : e.clientX
                  const safeY = typeof window !== 'undefined' ? Math.max(8, Math.min(e.clientY, window.innerHeight - 60)) : e.clientY
                  setCtxMenu({ x: safeX, y: safeY, pid: p.id })
                }}
                title={`${p.label} (${pCfg.mode === 'webview' ? 'Веб-интерфейс' : 'API-ключ'})${pSt === 'ok' ? ' — работает' : pSt === 'fail' ? ' — ошибка' : ''}${pCfg.mode === 'webview' ? ' · правая кнопка — перезапустить страницу' : ''}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                style={{
                  backgroundColor: provider === p.id ? '#2AABEE22' : 'var(--cc-hover)',
                  border: `1px solid ${provider === p.id ? '#2AABEE66' : 'transparent'}`,
                  color: provider === p.id ? '#2AABEE' : 'var(--cc-text-dim)',
                }}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
                {p.free && <span className="text-[7px] leading-tight" style={{ color: '#22c55e' }}>free</span>}
                {pSt && (
                  <span
                    className="relative"
                    style={{ fontSize: '8px', lineHeight: 1, color: pSt === 'ok' ? '#22c55e' : '#f87171' }}
                    onMouseEnter={e => { e.stopPropagation(); setHoveredStatus(p.id) }}
                    onMouseLeave={() => setHoveredStatus(null)}
                  >
                    ●
                    {hoveredStatus === p.id && (
                      <span
                        className="absolute bottom-full left-1/2 mb-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[10px] font-normal pointer-events-none"
                        style={{
                          transform: 'translateX(-50%)',
                          backgroundColor: 'var(--cc-surface)',
                          border: '1px solid var(--cc-border)',
                          color: 'var(--cc-text-dim)',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                          zIndex: 100,
                          lineHeight: 1.5,
                        }}
                      >
                        {pSt === 'ok' ? '✓ Работает' : '✗ Ошибка'}
                        {providerCheckTimes[p.id] && (
                          <span style={{ color: 'var(--cc-text-dimmer)' }}> · {providerCheckTimes[p.id]}</span>
                        )}
                      </span>
                    )}
                  </span>
                )}
                {provider === p.id && <span className="opacity-70">✓</span>}
              </button>
            )
          })}
          <button
            onClick={() => { setShowAddProvider(!showAddProvider); setShowConfig(false) }}
            title="Подключить ещё одного ИИ-провайдера"
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-all"
            style={{
              backgroundColor: showAddProvider ? '#22c55e22' : 'var(--cc-hover)',
              border: `1px solid ${showAddProvider ? '#22c55e44' : 'transparent'}`,
              color: showAddProvider ? '#22c55e' : 'var(--cc-text-dimmer)',
            }}
          >+ ИИ</button>
        </div>
      ) : (
        <button
          onClick={() => { setShowAddProvider(!showAddProvider); setShowConfig(false) }}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs cursor-pointer transition-all"
          style={{ backgroundColor: '#2AABEE11', border: '1px dashed #2AABEE55', color: '#2AABEE' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2AABEE22'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2AABEE11'}
        >
          <span className="text-base">+</span>
          <span>Добавить ИИ-провайдер</span>
        </button>
      )}

      {/* v1.2.510: меню по правой кнопке с безопасным позиционированием и подложкой.
          Подложка fixed inset-0 перехватывает клики над webview и гарантированно закрывает меню. */}
      {ctxMenu && (
        <>
          <div
            data-testid="ctx-menu-backdrop"
            className="fixed inset-0"
            style={{ zIndex: 195 }}
            onClick={() => setCtxMenu(null)}
            onContextMenu={e => { e.preventDefault(); setCtxMenu(null) }}
          />
          <div
            className="fixed rounded-lg py-1 text-xs"
            style={{
              left: ctxMenu.x, top: ctxMenu.y, zIndex: 200,
              backgroundColor: 'var(--cc-surface)',
              border: '1px solid var(--cc-border)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <button
              onClick={() => { const pid = ctxMenu.pid; setCtxMenu(null); reloadProviderPage?.(pid) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 whitespace-nowrap cursor-pointer text-left rounded"
              style={{ color: 'var(--cc-text-dim)', backgroundColor: 'transparent', border: 'none' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span>🔄</span><span>Перезапустить страницу</span>
            </button>
          </div>
        </>
      )}

      {showAddProvider && (
        <div className="mt-2">
          {unconnectedProviders.length > 0 ? (
            <div className="grid grid-cols-2 gap-1">
              {unconnectedProviders.map(p => (
                <button
                  key={p.id}
                  onClick={() => switchProvider(p.id)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer text-left transition-all"
                  style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text-dim)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#2AABEE55'; e.currentTarget.style.backgroundColor = '#2AABEE11' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cc-border)'; e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                >
                  <span className="text-base leading-none">{p.icon}</span>
                  <div>
                    <div className="font-medium leading-tight">{p.label}</div>
                    {p.free && <div className="text-[9px] leading-tight" style={{ color: '#22c55e' }}>бесплатно</div>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center text-xs py-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>
              Все провайдеры подключены ✓
            </div>
          )}
        </div>
      )}
    </div>
  )
}
