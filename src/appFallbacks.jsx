// v1.1.9: вынесено из App.jsx — fallback компоненты для lazy() + константы Native CC.
// Поведение не изменено.

export const NATIVE_CC_ID = 'native_cc'

export const NATIVE_CC_TAB = {
  id: NATIVE_CC_ID,
  name: 'ЦентрЧатов',
  url: 'about:blank',
  color: '#2AABEE',
  partition: 'persist:native-cc',
  emoji: '💬',
  isDefault: true,
  isNative: true,
}

/**
 * Skeleton sidebar пока AISidebar lazy() ещё грузится. Не показывается если
 * panel скрыт. Сохраняет ширину и фон, чтобы layout не дёргался.
 */
export function AISidebarFallback({ visible, width, panelRef }) {
  if (!visible) return null
  return (
    <aside
      ref={panelRef}
      className="shrink-0"
      style={{
        width,
        backgroundColor: 'var(--cc-panel)',
        borderLeft: '1px solid var(--cc-border)',
      }}
    />
  )
}

/**
 * Skeleton main area пока NativeApp lazy() ещё грузится. Чёрный фон —
 * чтобы не было белой вспышки на тёмной теме.
 */
export function NativeAppFallback() {
  try { window.__ccStartupMark?.('component:NativeApp', 'fallback render') } catch (_) {}
  return <div className="w-full h-full" style={{ backgroundColor: '#000' }} />
}
