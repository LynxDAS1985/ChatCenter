// v0.87.27: Превью ссылки — карточка с заголовком/описанием/site.
// Данные приходят из main в поле m.webPage: { url, title, description, siteName, photoUrl }.
export default function LinkPreview({ wp, isOutgoing }) {
  if (!wp || !wp.url) return null
  const onClick = (e) => { e.preventDefault(); try { window.api?.invoke('app:open-external', wp.url) } catch(_) {} }
  return (
    <a
      href={wp.url}
      onClick={onClick}
      style={{
        display: 'block',
        marginTop: 6,
        padding: '6px 10px',
        borderLeft: `3px solid ${isOutgoing ? 'rgba(255,255,255,0.55)' : 'var(--amoled-accent)'}`,
        background: isOutgoing ? 'rgba(255,255,255,0.08)' : 'rgba(42,171,238,0.08)',
        borderRadius: 6,
        textDecoration: 'none',
        color: 'inherit',
        fontSize: 12,
      }}
    >
      {wp.siteName && <div style={{ fontWeight: 600, opacity: 0.8, fontSize: 11 }}>{wp.siteName}</div>}
      {wp.title && <div style={{ fontWeight: 600, marginTop: 2 }}>{wp.title}</div>}
      {wp.description && (
        <div style={{
          opacity: 0.8, marginTop: 2,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>{wp.description}</div>
      )}
      {wp.photoUrl && (
        <img src={wp.photoUrl} alt="" style={{
          display: 'block', marginTop: 6, maxWidth: '100%', maxHeight: 180,
          borderRadius: 4, objectFit: 'cover',
        }} />
      )}
    </a>
  )
}
