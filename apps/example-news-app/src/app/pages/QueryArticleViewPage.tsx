import { useEntityQuery } from '@graphql-suite/query'

import { graphqlClient } from '../client'
import { ArticleDetail } from '../components/ArticleDetail'

// ─── Entity ──────────────────────────────────────────────────

const articleEntity = graphqlClient.entity('article')

// ─── Types ───────────────────────────────────────────────────

type QueryArticleViewPageProps = {
  articleId: string
  onBack: () => void
}

// ─── Component ───────────────────────────────────────────────

export function QueryArticleViewPage({ articleId, onBack }: QueryArticleViewPageProps) {
  const { data, isPending, error } = useEntityQuery(articleEntity, {
    select: {
      id: true,
      title: true,
      excerpt: true,
      publishedAt: true,
      author: { displayName: true },
      blocks: { id: true, type: true, content: true, order: true },
      comments: { id: true, body: true, createdAt: true, author: { displayName: true } },
    },
    where: { id: { eq: articleId } },
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
        blocks={data.blocks ?? []}
        comments={data.comments ?? []}
      />
    </div>
  )
}
