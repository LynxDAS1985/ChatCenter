// v0.95.18: Empty state в центре окна чата когда юзер открыл форум, но не выбрал
// конкретную тему. Заменяет пустой чёрный экран на красивое сообщение с иконкой.
//
// Контекст: при `activeChat.isForum && !activeTopic` (форум открыт, тема не выбрана)
// раньше — пустой экран + малозаметная подсказка в input field. Теперь — крупный
// блок в центре с иконкой 📚 + заголовком + подсказкой.
//
// Эталон: Telegram Desktop / Slack empty state при выборе канала без активной темы.

export default function ForumTopicEmptyState() {
  return (
    <div
      className="native-forum-empty-state"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 40,
        pointerEvents: 'none',
        color: 'var(--amoled-text-dim)',
      }}
    >
      <div
        style={{
          fontSize: 64,
          lineHeight: 1,
          marginBottom: 16,
          opacity: 0.7,
          filter: 'drop-shadow(0 4px 16px rgba(42,171,238,0.25))',
        }}
        aria-hidden="true"
      >
        📚
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--amoled-text)',
          marginBottom: 8,
          letterSpacing: 0.2,
        }}
      >
        Это форум-чат
      </div>
      <div
        style={{
          fontSize: 13,
          maxWidth: 320,
          lineHeight: 1.5,
          opacity: 0.85,
        }}
      >
        Слева выберите тему форума, чтобы посмотреть сообщения и принять участие в обсуждении.
      </div>
    </div>
  )
}
