// ─── Types ──────────────────────────────────────────────────

type Block = {
  id: string
  type: string
  content: string
  order: number
  meta: unknown
}

type Comment = {
  id: string
  body: string
  createdAt: string
  author: { displayName: string }
}

type ArticleDetail = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  publishedAt: string | null
  author: { displayName: string }
  blocks: Block[]
  comments: Comment[]
}

type ArticlePageProps = {
  article: ArticleDetail
}

// ─── Block Renderer ─────────────────────────────────────────

function renderBlock(block: Block) {
  switch (block.type) {
    case 'heading':
      return (
        <h2 key={block.id} style={{ fontSize: 20, marginTop: 24, marginBottom: 8 }}>
          {block.content}
        </h2>
      )
    case 'quote':
      return (
        <blockquote
          key={block.id}
          style={{
            borderLeft: '3px solid #ddd',
            paddingLeft: 12,
            color: '#555',
            margin: '12px 0',
          }}
        >
          {block.content}
        </blockquote>
      )
    case 'code':
      return (
        <pre
          key={block.id}
          style={{
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 4,
            overflow: 'auto',
            margin: '12px 0',
          }}
        >
          <code>{block.content}</code>
        </pre>
      )
    default:
      return (
        <p key={block.id} style={{ marginBottom: 12 }}>
          {block.content}
        </p>
      )
  }
}

// ─── Component ──────────────────────────────────────────────

export function ArticlePage({ article }: ArticlePageProps) {
  const blocks = [...article.blocks].sort((a, b) => a.order - b.order)
  const { comments } = article

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <a href="/articles" style={{ color: '#555', textDecoration: 'none', fontSize: 14 }}>
        &larr; Back to articles
      </a>

      <article style={{ marginTop: 16 }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{article.title}</h1>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
          {article.author.displayName}
          {article.publishedAt && ` · ${new Date(article.publishedAt).toLocaleDateString()}`}
        </p>

        {blocks.map(renderBlock)}
      </article>

      {comments.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: 18, marginBottom: 12 }}>Comments ({comments.length})</h3>
          {comments.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <p style={{ fontSize: 13, color: '#999', marginBottom: 2 }}>
                {c.author.displayName} · {new Date(c.createdAt).toLocaleDateString()}
              </p>
              <p style={{ fontSize: 14 }}>{c.body}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
