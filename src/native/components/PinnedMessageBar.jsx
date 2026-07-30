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
// • v1.2.166: фон СПЛОШНОЙ непрозрачный (var(--amoled-surface)) — полностью накрывает
//   верхнее сообщение (норма Telegram), читаемо на любом фоне. Раньше был blur+8%-прозрачность,
//   но на светлых сообщениях (чек/таблица) текст полосы сливался. См. features.md v1.2.166.

export default function PinnedMessageBar({ pinnedMsg, onClose, onJump }) {
  if (!pinnedMsg) return null
  return (
    <div
      className="native-pinned-bar"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4,
        padding: '8px 16px', borderBottom: '1px solid var(--amoled-border)',
        // v1.2.166: СПЛОШНОЙ непрозрачный фон (был полупрозрачный 8% + blur). Причина: на
        // светлом сообщении под полосой (чек/таблица/скриншот) текст сливался и не читался.
        // Непрозрачный панельный фон = читаемо на любом сообщении (как Telegram Desktop).
        background: 'var(--amoled-surface)',
        display: 'flex', gap: 10, alignItems: 'center',
      }}
    >
      {/* v1.2.167: клик по 📌 + тексту = переход к закреплённому сообщению (как в Telegram).
          Кнопка ✕ — отдельно (её клик не вызывает переход). */}
      <div
        onClick={onJump}
        title={onJump ? 'Перейти к закреплённому сообщению' : undefined}
        style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, alignItems: 'center', cursor: onJump ? 'pointer' : 'default' }}
      >
        <span style={{ fontSize: 14, flexShrink: 0 }}>📌</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <div style={{ color: 'var(--amoled-accent)', fontWeight: 600 }}>Закреплённое</div>
          <div style={{ color: 'var(--amoled-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pinnedMsg.text?.slice(0, 100) || '[медиа]'}</div>
        </div>
      </div>
      <button onClick={onClose} style={{
        background: 'transparent', border: 'none', color: 'var(--amoled-text-dim)',
        cursor: 'pointer', fontSize: 14, flexShrink: 0,
      }} title="Скрыть">✕</button>
    </div>
  )
}
