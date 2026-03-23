import { useEntityList } from '@graphql-suite/query'

import { graphqlClient } from '../client'
import { ArticleCard } from '../components/ArticleCard'

// ─── Entity ──────────────────────────────────────────────────

const articleEntity = graphqlClient.entity('article')

// ─── Types ───────────────────────────────────────────────────

type QueryArticleListPageProps = {
  onSelectArticle: (id: string) => void
}

// ─── Component ───────────────────────────────────────────────

export function QueryArticleListPage({ onSelectArticle }: QueryArticleListPageProps) {
  const { data, isPending, error } = useEntityList(articleEntity, {
    select: {
      id: true,
      title: true,
      excerpt: true,
      publishedAt: true,
      author: { displayName: true },
    },
    where: { status: { eq: 'published' } },
    orderBy: { publishedAt: { direction: 'desc', priority: 1 } },
  })

  if (isPending) {
    return <p>Loading articles...</p>
  }

  if (error) {
    return <p style={{ color: 'red' }}>Error: {error.message}</p>
  }

  const articles = data ?? []

  if (articles.length === 0) {
    return <p style={{ color: '#666' }}>No published articles yet.</p>
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Published Articles</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {articles.map((article) => (
          <ArticleCard
            key={article.id}
            id={article.id}
            title={article.title}
            excerpt={article.excerpt}
            publishedAt={article.publishedAt}
            author={article.author}
            onSelect={onSelectArticle}
          />
        ))}
      </ul>
    </div>
  )
}
