// v0.95.43: overlay-подсказка при перетаскивании файла в окно чата.
//
// Эталоны:
//   - Telegram Web K — dashed border overlay с текстом «Drop files here»
//   - Discord — полупрозрачный фиолетовый overlay
//   - Slack — overlay с иконкой облака
//
// Активируется через prop `visible` (контролируется dragOver state в InboxMode).

export default function DragDropOverlay({ visible }) {
  if (!visible) return null
  return (
    <div
      data-cc-dragdrop-overlay="true"
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        background: 'rgba(42,171,238,0.18)',
        border: '3px dashed var(--amoled-accent, #2AABEE)',
        borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 32,
        pointerEvents: 'none',
        color: 'var(--amoled-text)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{ fontSize: 64 }}>📎</div>
      <div style={{
        fontSize: 20, fontWeight: 600, textAlign: 'center',
        color: 'var(--amoled-text)',
      }}>Бросьте сюда файл</div>
      <div style={{
        fontSize: 14, color: 'var(--amoled-text-dim)', textAlign: 'center',
      }}>Фото, видео или документ будут отправлены в чат</div>
    </div>
  )
}
