// v0.95.41: универсальный рендер custom emoji premium.
//
// Используется в:
//   - MessageReactions (для reactionTypeCustomEmoji)
//   - MessageBubble (для messageAnimatedEmoji с premium sticker)
//
// Поддерживаемые форматы (от TDLib stickerFormat):
//   - image/webp → <img>                  (Premium static sticker)
//   - image/png  → <img>                  (старый формат)
//   - video/webm → <video autoplay loop>  (Telegram Premium video emoji)
//   - application/x-tgsticker → fallback alt emoji (TGS lottie не рендерим)
//   - URL отсутствует (ещё не загружен) → alt emoji string
//
// Эталоны (production 2026):
//   - Telegram Web K animatedEmoji.ts — <img>/<video> + fallback
//   - Telegram Desktop reactionElement.cpp — Qt native rendering
//   - WhatsApp Web — обычные стикеры через <img> webp
//
// Размер по умолчанию — 18px (для реакций). Для большого emoji в bubble — 56px.
//
// ОБЯЗАТЕЛЬНО прочитать перед правкой: .memory-bank/mistakes/outgoing-two-cases.md

export default function CustomEmojiRenderer({
  customEmojiId,
  cache,           // { [id]: { url, mime, alt } } — обычно store.customEmojis
  fallbackEmoji,   // unicode placeholder (например '⭐')
  size = 18,
}) {
  const meta = cache?.[String(customEmojiId)]
  const url = meta?.url
  const mime = meta?.mime || ''
  const alt = meta?.alt || fallbackEmoji || ''

  // Загрузка ещё не завершена → показываем alt (unicode emoji или placeholder)
  if (!url) {
    return (
      <span style={{ fontSize: size, lineHeight: 1 }} title={customEmojiId ? `custom emoji ${customEmojiId}` : undefined}>
        {alt}
      </span>
    )
  }

  // WebM video emoji (Telegram Premium новый формат)
  if (mime.includes('webm')) {
    return (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        title={alt}
        style={{
          width: size, height: size,
          objectFit: 'contain',
          verticalAlign: 'middle',
          // Disable controls и pointer-events чтобы юзер не открыл video controls.
          pointerEvents: 'none',
        }}
      />
    )
  }

  // Static WebP/PNG sticker
  if (mime.includes('webp') || mime.includes('png') || mime.includes('image')) {
    return (
      <img
        src={url}
        alt={alt}
        style={{
          width: size, height: size,
          objectFit: 'contain',
          verticalAlign: 'middle',
        }}
      />
    )
  }

  // TGS / неизвестный mime → fallback на alt
  return (
    <span style={{ fontSize: size, lineHeight: 1 }} title={alt || `custom emoji ${customEmojiId}`}>
      {alt}
    </span>
  )
}
