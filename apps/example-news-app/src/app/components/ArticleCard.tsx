// ─── Article Card Component ──────────────────────────────────

type ArticleCardProps = {
  id: string
  title: string
  excerpt: string | null
  publishedAt: string | null
  author: { displayName: string } | null
  onSelect?: (id: string) => void
}

export function ArticleCard({
  id,
  title,
  excerpt,
  publishedAt,
  author,
  onSelect,
}: ArticleCardProps) {
  const content = (
    <>
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>{title}</h3>
      {excerpt && <p style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>{excerpt}</p>}
      <p style={{ fontSize: 12, color: '#999' }}>
        {author?.displayName}
        {publishedAt && ` \u00b7 ${new Date(publishedAt).toLocaleDateString()}`}
      </p>
    </>
  )

  if (onSelect) {
    return (
      <li style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
        <button
          type="button"
          style={{
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
            textAlign: 'inherit',
            font: 'inherit',
            color: 'inherit',
            width: '100%',
          }}
          onClick={() => onSelect(id)}
        >
          {content}
        </button>
      </li>
    )
  }

  return <li style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>{content}</li>
}
