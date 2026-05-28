// v0.95.7: divider для drag-to-resize между chat-list и окном чата.
//
// 6px тонкая полоса. По hover — подсветка accent-цветом. Во время drag — синяя.
// onPointerDown → startResize (см. useChatListResize.js).
// onDoubleClick → reset to default 340px (стандарт VS Code, Slack).
//
// Эталон — AI panel divider в App.jsx (line 632).

export default function ChatListResizeHandle({ onPointerDown, onPointerMove, onPointerUp, onDoubleClick, isResizing }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Изменить ширину списка чатов (двойной клик — сброс)"
      title="Перетащите чтобы изменить ширину · Двойной клик — сброс к 340px"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onMouseEnter={e => { if (!isResizing) e.currentTarget.style.backgroundColor = '#2AABEE66' }}
      onMouseLeave={e => { if (!isResizing) e.currentTarget.style.backgroundColor = 'var(--amoled-border)' }}
      style={{
        width: 6,
        cursor: 'col-resize',
        backgroundColor: isResizing ? '#2AABEE88' : 'var(--amoled-border)',
        touchAction: 'none',
        transition: isResizing ? 'none' : 'background-color 0.15s',
        flexShrink: 0,
        zIndex: 6,
      }}
    />
  )
}
