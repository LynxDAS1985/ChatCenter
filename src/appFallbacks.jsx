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
 * v1.2.400: показываем ЖИВУЮ заставку с кружками (как наша ChatListLoadingSplash), чтобы «наша разработка»
 * была видна С НАЧАЛА, а не только после монтирования NativeApp. ВАЖНО: этот компонент грузится РАНЬШЕ
 * нативного CSS (styles-chatlist-loading.css импортится из NativeApp) → используем ТОЛЬКО инлайн-стили и
 * инлайн-keyframes (className-классы заставки тут ещё не подгружены). store здесь нет → кружки без имён.
 */
const _NF_GRADS = [
  'linear-gradient(135deg,#3aa76d,#1f7a4d)',
  'linear-gradient(135deg,#e0567a,#a5324f)',
  'linear-gradient(135deg,#3a7bd5,#2456a0)',
  'linear-gradient(135deg,#7d7bff,#4b49c9)',
  'linear-gradient(135deg,#e0973a,#a5651f)',
]
export function NativeAppFallback() {
  try { window.__ccStartupMark?.('component:NativeApp', 'fallback render') } catch (_) {}
  return (
    <div
      className="w-full h-full"
      style={{
        background: 'radial-gradient(120% 90% at 50% 40%, #12203a 0%, #0a0e17 55%, #05070d 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{'@keyframes ccNfPop{0%{opacity:0;transform:scale(.3) translateY(6px)}55%{opacity:1;transform:scale(1.12)}70%{transform:scale(1)}92%{opacity:1}100%{opacity:.28;transform:scale(.9)}}'}</style>
      <div style={{ display: 'flex', gap: 12 }}>
        {_NF_GRADS.map((g, i) => (
          <div key={i} aria-hidden="true" style={{ width: 38, height: 38, borderRadius: '50%', background: g, opacity: 0, animation: 'ccNfPop 2.6s ease-in-out ' + (i * 0.3) + 's infinite' }} />
        ))}
      </div>
      <div style={{ color: '#aab2cc', fontSize: 14, fontWeight: 600 }}>Загрузка чатов…</div>
    </div>
  )
}
