import { useGraphQLClient } from '@graphql-suite/query'
import { useQuery } from '@tanstack/react-query'

import { ArticleDetail } from '../components/ArticleDetail'

// ─── Types ───────────────────────────────────────────────────

type ArticleViewPageProps = {
  articleId: string
  onBack: () => void
}

type ArticleData = {
  id: string
  title: string
  excerpt: string | null
  publishedAt: string | null
  author: { displayName: string }
  blocks: Array<{ id: string; type: string; content: string; order: number }>
  comments: Array<{
    id: string
    body: string
    createdAt: string
    author: { displayName: string }
  }>
}

// ─── Query ───────────────────────────────────────────────────

const ARTICLE_QUERY = `
  query Article($where: ArticleFilters) {
    article(where: $where) {
      id
      title
      excerpt
      publishedAt
      author { displayName }
      blocks { id type content order }
      comments {
        id
        body
        createdAt
        author { displayName }
      }
    }
  }
`

// ─── Component ───────────────────────────────────────────────

export function ArticleViewPage({ articleId, onBack }: ArticleViewPageProps) {
  const client = useGraphQLClient()
  const { data, isPending, error } = useQuery({
    queryKey: ['article', articleId],
    queryFn: async () => {
      const result = await client.execute(ARTICLE_QUERY, {
        where: { id: { eq: articleId } },
      })
      return (result.article as ArticleData) ?? null
    },
  })

  if (isPending) {
    return <p>Loading article...</p>
  }

  if (error) {
    return <p style={{ color: 'red' }}>Error: {error.message}</p>
  }

  if (!data) {
    return (
      <div>
        <button type="button" onClick={onBack}>
          Back
        </button>
        <p style={{ color: '#666', marginTop: 12 }}>Article not found.</p>
      </div>
    )
  }

  return (
    <div>
      <button type="button" onClick={onBack} style={{ marginBottom: 16, cursor: 'pointer' }}>
        &larr; Back to articles
      </button>

      <ArticleDetail
        title={data.title}
        publishedAt={data.publishedAt}
        author={data.author}
        blocks={data.blocks}
        comments={data.comments}
      />
    </div>
  )
}
