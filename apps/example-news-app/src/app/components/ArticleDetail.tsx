// ─── Article Detail Component ────────────────────────────────

type Block = { id: string; type: string; content: string; order: number }
type Comment = {
  id: string
  body: string
  createdAt: string
  author: { displayName: string } | null
}

type ArticleDetailProps = {
  title: string
  publishedAt: string | null
  author: { displayName: string } | null
  blocks: Block[]
  comments: Comment[]
}

// ─── Block Renderer ──────────────────────────────────────────

function renderBlock(block: Block) {
  switch (block.type) {
    case 'heading':
      return <h2 style={{ fontSize: 18 }}>{block.content}</h2>
    case 'quote':
      return (
        <blockquote style={{ borderLeft: '3px solid #ddd', paddingLeft: 12, color: '#555' }}>
          {block.content}
        </blockquote>
      )
    case 'code':
      return (
        <pre
          style={{
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 4,
            overflow: 'auto',
          }}
        >
          <code>{block.content}</code>
        </pre>
      )
    default:
      return <p>{block.content}</p>
  }
}

// ─── Component ───────────────────────────────────────────────

export function ArticleDetail({
  title,
  publishedAt,
  author,
  blocks,
  comments,
}: ArticleDetailProps) {
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order)

  return (
    <div>
      <article>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>{title}</h1>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
          {author?.displayName}
          {publishedAt && ` \u00b7 ${new Date(publishedAt).toLocaleDateString()}`}
        </p>

        {sortedBlocks.map((block) => (
          <div key={block.id} style={{ marginBottom: 12 }}>
            {renderBlock(block)}
          </div>
        ))}
      </article>

      {comments.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Comments ({comments.length})</h3>
          {comments.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <p style={{ fontSize: 13, color: '#999', marginBottom: 2 }}>
                {c.author?.displayName ?? 'Anonymous'} \u00b7 {new Date(c.createdAt).toLocaleDateString()}
              </p>
              <p style={{ fontSize: 14 }}>{c.body}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
