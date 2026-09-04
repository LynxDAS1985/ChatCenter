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
 * Заглушка главной области, пока NativeApp lazy() ещё грузится.
 * v1.2.395: РАНЬШЕ был просто чёрный div — между appReady (когда снимается стартовая заставка
 * «Загрузка…») и монтированием NativeApp (в dev это ~57с) юзер видел ПУСТОЙ экран. Теперь та же
 * подпись «Загрузка…» на тёмном фоне стартовой заставки — чтобы не было «пустоты» без индикатора.
 */
export function NativeAppFallback() {
  try { window.__ccStartupMark?.('component:NativeApp', 'fallback render') } catch (_) {}
  return (
    <div
      className="w-full h-full"
      style={{
        background: 'radial-gradient(120% 90% at 50% 40%, #12203a 0%, #0a0e17 55%, #05070d 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#8a93b5', fontSize: 14, fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      Загрузка…
    </div>
  )
}
