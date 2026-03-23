import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

import { ArticlePage } from '../ssr/article-page'
import { ArticlesPage } from '../ssr/articles-page'

// ─── Types ──────────────────────────────────────────────────

type YogaLike = {
  fetch: (req: Request) => Response | Promise<Response>
}

type ArticleSummary = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  status: string
  publishedAt: string | null
  author: { displayName: string }
}

type ArticleDetail = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  publishedAt: string | null
  author: { displayName: string }
  blocks: Array<{ id: string; type: string; content: string; order: number; meta: unknown }>
  comments: Array<{
    id: string
    body: string
    createdAt: string
    author: { displayName: string }
  }>
}

// ─── GraphQL Queries ────────────────────────────────────────

const ARTICLES_QUERY = `{
  articleList {
    id title slug excerpt status publishedAt
    author { displayName }
  }
}`

const ARTICLE_QUERY = `query($where: ArticleFilters) {
  article(where: $where) {
    id title slug excerpt publishedAt
    author { displayName }
    blocks { id type content order meta }
    comments {
      id body createdAt
      author { displayName }
    }
  }
}`

// ─── Helpers ────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlShell(bodyHtml: string, title: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body>${bodyHtml}</body>
</html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html' } })
}

function spaFallback(): Response {
  return htmlShell('<div id="root"></div><p>Loading app...</p>', 'News App')
}

async function executeGraphQL(
  yoga: YogaLike,
  query: string,
  variables?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await yoga.fetch(
    new Request('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    }),
  )

  if (!res.ok) {
    throw new Error(`GraphQL request failed with status ${res.status}`)
  }

  // biome-ignore lint/suspicious/noExplicitAny: GraphQL response shape
  const json = (await res.json()) as any

  if (json.errors?.length) {
    const messages = json.errors.map((e: { message: string }) => e.message).join('; ')
    throw new Error(`GraphQL errors: ${messages}`)
  }

  return json.data ?? {}
}

// ─── Route Handler Factory ──────────────────────────────────

export function createFetchHandler(yoga: YogaLike): (req: Request) => Response | Promise<Response> {
  return async (req: Request) => {
    const url = new URL(req.url)

    // GraphQL endpoint
    if (url.pathname.startsWith('/graphql')) {
      return yoga.fetch(req)
    }

    // SSR: Article detail page
    if (url.pathname.startsWith('/articles/') && url.pathname.length > '/articles/'.length) {
      const slug = url.pathname.slice('/articles/'.length)
      const detailData = await executeGraphQL(yoga, ARTICLE_QUERY, {
        where: { slug: { eq: slug } },
      })
      const article = detailData.article as ArticleDetail | null

      if (!article || article.slug !== slug) {
        return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/html' } })
      }

      const bodyHtml = renderToString(createElement(ArticlePage, { article }))
      return htmlShell(bodyHtml, article.title)
    }

    // SSR: Articles list page
    if (url.pathname === '/articles') {
      const data = await executeGraphQL(yoga, ARTICLES_QUERY)
      const allArticles = (data.articleList ?? []) as ArticleSummary[]
      const published = allArticles.filter((a) => a.status === 'published')
      const bodyHtml = renderToString(createElement(ArticlesPage, { articles: published }))
      return htmlShell(bodyHtml, 'Published Articles')
    }

    // SPA fallback
    return spaFallback()
  }
}
