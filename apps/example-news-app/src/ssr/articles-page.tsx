// ─── Types ──────────────────────────────────────────────────

type Article = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  publishedAt: string | null
  author: { displayName: string }
}

type ArticlesPageProps = {
  articles: Article[]
}

// ─── Component ──────────────────────────────────────────────

export function ArticlesPage({ articles }: ArticlesPageProps) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Published Articles</h1>
      {articles.length === 0 ? (
        <p style={{ color: '#666' }}>No published articles yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {articles.map((article) => (
            <li key={article.id} style={{ padding: '16px 0', borderBottom: '1px solid #eee' }}>
              <a
                href={`/articles/${article.slug}`}
                style={{ fontSize: 18, color: '#1a1a1a', textDecoration: 'none' }}
              >
                {article.title}
              </a>
              {article.excerpt && (
                <p style={{ fontSize: 14, color: '#555', marginTop: 4 }}>{article.excerpt}</p>
              )}
              <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                {article.author.displayName}
                {article.publishedAt && ` · ${new Date(article.publishedAt).toLocaleDateString()}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
