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
 * v1.2.395: раньше чёрный div → пусто; сделали подпись «Загрузка…».
 * v1.2.400: показывали кружки, чтобы «наша разработка» была видна с начала.
 * v1.2.407: кружки УБРАНЫ — эту фазу теперь перекрывает стартовая заставка #cc-splash (boot-hold, v1.2.404):
 * заставка держится до показа нашего экрана «загрузка чатов», поэтому NativeAppFallback фактически НЕ виден.
 * Оставлен простой тёмный экран с подписью — как безопасный запас, если заставку по какой-то причине сняли раньше.
 * Кружки теперь заданы только в ДВУХ местах (стартовая заставка index.html + наш экран ChatListLoadingSplash),
 * а не в трёх — меньше рассинхрона при правках вида (совет-ревью v1.2.407).
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
      Загрузка чатов…
    </div>
  )
}
