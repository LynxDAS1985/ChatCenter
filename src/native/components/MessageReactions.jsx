// v0.95.29: реакции на сообщения — Telegram-style.
//
// Отображает существующие реакции (от других + свои) под bubble сообщения.
// Каждая реакция: emoji + count. Свои реакции (chosen=true) подсвечены.
// Клик по emoji → toggle (поставить/убрать через store.setReaction).
//
// Hover-меню реакций (😀 ❤️ 🔥 ...) показывается в action-bar (см. MessageBubble.jsx).
//
// Эталон: Telegram Web K (chat/reactionElement.ts), Telegram Desktop (reactions.cpp).

import { useState, useRef } from 'react'
import { createReactionThrottler } from '../utils/reactionThrottle.js'

// Стандартный набор быстрых реакций Telegram (топ-8 популярных).
export const QUICK_REACTIONS = ['👍', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯']

// Отображение существующих реакций под сообщением.
// reactions: [{ emoji, count, chosen }]
export function ReactionsList({ reactions, onToggle, isOutgoing }) {
  if (!Array.isArray(reactions) || reactions.length === 0) return null

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 4,
      marginTop: 4,
      padding: '0 2px',
    }}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={(e) => {
            e.stopPropagation()
            onToggle?.(r.emoji, r.chosen ? 'remove' : 'add')
          }}
          title={r.chosen ? 'Убрать реакцию' : 'Поставить такую же'}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 8px',
            borderRadius: 12,
            background: r.chosen
              ? (isOutgoing ? 'rgba(255,255,255,0.35)' : 'rgba(42,171,238,0.35)')
              : (isOutgoing ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'),
            border: r.chosen
              ? `1px solid ${isOutgoing ? 'rgba(255,255,255,0.5)' : 'var(--amoled-accent)'}`
              : '1px solid rgba(255,255,255,0.1)',
            color: isOutgoing ? '#fff' : 'var(--amoled-text)',
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>{r.emoji}</span>
          {r.count > 0 && <span>{r.count}</span>}
        </button>
      ))}
    </div>
  )
}

// Picker — popup со списком быстрых реакций при hover/click.
// Telegram-style: появляется над action-bar, выбираешь emoji → toggle.
export function ReactionPicker({ onSelect, onClose, isOutgoing }) {
  return (
    <div
      onMouseLeave={onClose}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        [isOutgoing ? 'right' : 'left']: 0,
        display: 'flex', gap: 2, zIndex: 25,
        background: 'rgba(18,18,18,0.96)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 24,
        padding: '4px 6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      }}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={(e) => {
            e.stopPropagation()
            onSelect?.(emoji)
          }}
          title={`Поставить ${emoji}`}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: 'none', background: 'transparent',
            cursor: 'pointer',
            fontSize: 20, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s, transform 0.1s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
            e.currentTarget.style.transform = 'scale(1.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >{emoji}</button>
      ))}
    </div>
  )
}

// Объединённый default export — компонент, который ставит обе вещи.
export default function MessageReactions({ message, isOutgoing, onSetReaction }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const reactions = message?.reactions
  // v0.95.31: leading-edge throttle 200мс на повторные клики одной реакции.
  // Защита от спама (5 кликов за 500мс → 1 вызов backend). Per-emoji ключ —
  // юзер может ставить разные emoji параллельно без задержки.
  const throttleRef = useRef(createReactionThrottler(200))

  const handleToggle = (emoji, action) => {
    const key = `${message?.id || 'x'}:${emoji}`
    throttleRef.current(key, () => onSetReaction?.(message.id, emoji, action))
    setPickerOpen(false)
  }

  return (
    <>
      <ReactionsList
        reactions={reactions}
        onToggle={handleToggle}
        isOutgoing={isOutgoing}
      />
      {pickerOpen && (
        <ReactionPicker
          onSelect={(emoji) => {
            const existing = reactions?.find(r => r.emoji === emoji)
            handleToggle(emoji, existing?.chosen ? 'remove' : 'add')
          }}
          onClose={() => setPickerOpen(false)}
          isOutgoing={isOutgoing}
        />
      )}
    </>
  )
}
