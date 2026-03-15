import { GraphQLProvider } from '@graphql-suite/query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

import { graphqlClient } from './client'
import { Layout } from './components/Layout'
import { ArticleListPage } from './pages/ArticleListPage'
import { ArticleViewPage } from './pages/ArticleViewPage'
import { QueryArticleListPage } from './pages/QueryArticleListPage'
import { QueryArticleViewPage } from './pages/QueryArticleViewPage'

// ─── Query Client ────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

// ─── App ─────────────────────────────────────────────────────

export function App() {
  const [approach, setApproach] = useState<'client' | 'query'>('client')
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)

  return (
    <QueryClientProvider client={queryClient}>
      <GraphQLProvider client={graphqlClient}>
        <Layout>
          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setApproach('client')
                setSelectedArticleId(null)
              }}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontWeight: approach === 'client' ? 700 : 400,
                background: approach === 'client' ? '#333' : '#eee',
                color: approach === 'client' ? '#fff' : '#333',
                border: 'none',
                borderRadius: 4,
              }}
            >
              Raw GraphQL
            </button>
            <button
              type="button"
              onClick={() => {
                setApproach('query')
                setSelectedArticleId(null)
              }}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontWeight: approach === 'query' ? 700 : 400,
                background: approach === 'query' ? '#333' : '#eee',
                color: approach === 'query' ? '#fff' : '#333',
                border: 'none',
                borderRadius: 4,
              }}
            >
              Type-safe Hooks
            </button>
          </div>

          {approach === 'client' ? (
            selectedArticleId ? (
              <ArticleViewPage
                articleId={selectedArticleId}
                onBack={() => setSelectedArticleId(null)}
              />
            ) : (
              <ArticleListPage onSelectArticle={setSelectedArticleId} />
            )
          ) : selectedArticleId ? (
            <QueryArticleViewPage
              articleId={selectedArticleId}
              onBack={() => setSelectedArticleId(null)}
            />
          ) : (
            <QueryArticleListPage onSelectArticle={setSelectedArticleId} />
          )}
        </Layout>
      </GraphQLProvider>
    </QueryClientProvider>
  )
}
