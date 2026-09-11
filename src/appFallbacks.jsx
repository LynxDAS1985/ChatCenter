// v1.1.9: вынесено из App.jsx — fallback компоненты для lazy() + константы Native CC.
// Поведение не изменено.

// v1.2.455-456: тот же потолок ширины, что у настоящей панели ИИ — иначе заглушка
// мелькнула бы шире, а потом панель «прыгнула» бы к правильной ширине.
import { AI_PANEL_MAX_CSS } from '../shared/panelWidthCap.js'

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
        maxWidth: AI_PANEL_MAX_CSS,
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
 * v1.2.407: БРЕНДОВЫЕ кружки (5 штук, как на нашем экране) УБРАНЫ — эту фазу перекрывает стартовая заставка
 * #cc-splash (boot-hold, v1.2.404), поэтому брендовую анимацию тут дублировать незачем. Брендовые кружки
 * теперь только в ДВУХ местах (index.html + ChatListLoadingSplash) — меньше рассинхрона при правках вида.
 * v1.2.408: оставлен generic-СПИННЕР (одна крутилка, НЕ брендовые кружки) как ЗАПАС — если стартовую заставку
 * по какой-то причине сняли раньше времени (сбой boot-hold / дальний предохранитель 180с), пользователь всё
 * равно увидит живой индикатор загрузки, а не статичный текст. Спиннер не завязан на нативный CSS (файл грузится
 * раньше него) → inline-стиль + inline-keyframes. Reduced-motion не гасит спиннер (стандартное поведение крутилок).
 */
export function NativeAppFallback() {
  try { window.__ccStartupMark?.('component:NativeApp', 'fallback render') } catch (_) {}
  return (
    <div
      className="w-full h-full"
      style={{
        background: 'radial-gradient(120% 90% at 50% 40%, #12203a 0%, #0a0e17 55%, #05070d 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        color: '#8a93b5', fontSize: 14, fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{'@keyframes ccNfSpin{to{transform:rotate(360deg)}}'}</style>
      <div aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(255,255,255,.14)', borderTopColor: '#2e8bff', animation: 'ccNfSpin .9s linear infinite' }} />
      Загрузка чатов…
    </div>
  )
}
