import { useGraphQLClient } from '@graphql-suite/query'
import { useQuery } from '@tanstack/react-query'

import { ArticleCard } from '../components/ArticleCard'

// ─── Types ───────────────────────────────────────────────────

type ArticleListPageProps = {
  onSelectArticle: (id: string) => void
}

type ArticleSummary = {
  id: string
  title: string
  excerpt: string | null
  publishedAt: string | null
  author: { displayName: string }
}

// ─── Query ───────────────────────────────────────────────────

const ARTICLES_QUERY = `
  query Articles($where: ArticleFilters, $orderBy: ArticleOrderBy) {
    articles(where: $where, orderBy: $orderBy) {
      id
      title
      excerpt
      publishedAt
      author { displayName }
    }
  }
`

// ─── Component ───────────────────────────────────────────────

export function ArticleListPage({ onSelectArticle }: ArticleListPageProps) {
  const client = useGraphQLClient()
  const { data, isPending, error } = useQuery({
    queryKey: ['articles', 'published'],
    queryFn: async () => {
      const result = await client.execute(ARTICLES_QUERY, {
        where: { status: { eq: 'published' } },
        orderBy: { column: 'publishedAt', direction: 'desc' },
      })
      return result.articles as ArticleSummary[]
    },
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
