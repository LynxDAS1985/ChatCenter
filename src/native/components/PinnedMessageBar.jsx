// v0.95.5: Pinned-overlay поверх верха ленты сообщений.
//
// Был обычный flex-child над лентой (InboxChatPanel:109-125, v0.87.17). Async-загрузка
// pinnedMsg через store.getPinnedMessage (TDLib RPC, 50-500мс) приводила к появлению
// блока ПОСЛЕ первого рендера → flex-container увеличивал offset ленты → визуально
// «дёрг» (сообщения уезжали вниз). Жалоба юзера, скрин 28 мая 2026.
//
// Решение (как Telegram Web K `_chatPinned.scss`, WhatsApp Web): position:absolute
// поверх верха scroll-wrapper'а. Pinned не в потоке layout → его появление НЕ
// сдвигает сообщения. Накрывает верхнее сообщение (норма Telegram).
//
// КОНФЛИКТЫ ПРОВЕРЕНЫ:
// • dragOver overlay (z:2) — pinned выше (z:4)
// • кнопка ↓ (z:5) — pinned ниже, разные координаты (право-низ vs верх)
// • MessageListOverlay shimmer — не показываем pinned пока !chatReady
// • IntersectionObserver mark-read (rootMargin -48%/-48% в центре) — pinned в верхних
//   ~50px НЕ ВЛИЯЕТ на mark-read логику (она в центре viewport)
// • backdrop-filter blur(8px) — сообщения под pinned размыты, не проступают резко

export default function PinnedMessageBar({ pinnedMsg, onClose }) {
  if (!pinnedMsg) return null
  return (
    <div
      className="native-pinned-bar"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4,
        padding: '8px 16px', borderBottom: '1px solid var(--amoled-border)',
        background: 'rgba(42,171,238,0.08)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', gap: 10, alignItems: 'center',
      }}
    >
      <span style={{ fontSize: 14 }}>📌</span>
      <div style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <div style={{ color: 'var(--amoled-accent)', fontWeight: 600 }}>Закреплённое</div>
        <div style={{ color: 'var(--amoled-text-dim)' }}>{pinnedMsg.text?.slice(0, 100) || '[медиа]'}</div>
      </div>
      <button onClick={onClose} style={{
        background: 'transparent', border: 'none', color: 'var(--amoled-text-dim)',
        cursor: 'pointer', fontSize: 14,
      }} title="Скрыть">✕</button>
    </div>
  )
}
